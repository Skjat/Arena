// Гуманоид из сегментов: процедурная анимация (IK) + рэгдолл + расчленение.
import * as THREE from 'three';
import { Ragdoll } from './physics.js';
import { buildWeapon } from './weapons3d.js';
import { J, NJ } from './joints.js';
import { buildBody, FLESH_MAT, FOOT_REST, SPINE_SPLIT } from './body.js';

export { J, NJ };

const BONES = [
  [J.HEAD, J.NECK], [J.NECK, J.PELVIS], [J.NECK, J.LSH], [J.NECK, J.RSH], [J.LSH, J.RSH],
  [J.PELVIS, J.LHIP], [J.PELVIS, J.RHIP], [J.LHIP, J.RHIP],
  [J.LSH, J.LHIP], [J.RSH, J.RHIP], [J.LSH, J.RHIP], [J.RSH, J.LHIP],
  [J.LSH, J.LEL], [J.LEL, J.LHA], [J.RSH, J.REL], [J.REL, J.RHA],
  [J.LHIP, J.LKN], [J.LKN, J.LFT], [J.RHIP, J.RKN], [J.RKN, J.RFT],
  [J.HEAD, J.LSH, 0.25], [J.HEAD, J.RSH, 0.25], [J.HEAD, J.PELVIS, 0.2],
  [J.NECK, J.LHIP, 0.6], [J.NECK, J.RHIP, 0.6]
];
// Ограничения минимальной дистанции (грубые лимиты суставов).
const LIMITS = [
  [J.LSH, J.LHA, 0.22], [J.RSH, J.RHA, 0.22], [J.LHIP, J.LFT, 0.45], [J.RHIP, J.RFT, 0.45],
  [J.LKN, J.RKN, 0.1], [J.LFT, J.RFT, 0.1], [J.LHA, J.PELVIS, 0.12], [J.RHA, J.PELVIS, 0.12],
  [J.LKN, J.NECK, 0.55], [J.RKN, J.NECK, 0.55]
];
const RADII = [0.12, 0.07, 0.09, 0.07, 0.07, 0.05, 0.05, 0.05, 0.05, 0.07, 0.07, 0.06, 0.06, 0.06, 0.06];
const INV_MASS = [1, 0.6, 0.45, 0.8, 0.8, 1, 1, 1.2, 1.2, 0.7, 0.7, 1, 1, 1.1, 1.1];

// Сегменты: имя, сустав A, сустав B.
const SEGMENTS = [
  ['torso', J.PELVIS, J.NECK], ['head', J.NECK, J.HEAD],
  ['lupper', J.LSH, J.LEL], ['lfore', J.LEL, J.LHA], ['rupper', J.RSH, J.REL], ['rfore', J.REL, J.RHA],
  ['lthigh', J.LHIP, J.LKN], ['lshin', J.LKN, J.LFT], ['rthigh', J.RHIP, J.RKN], ['rshin', J.RKN, J.RFT]
];

// Части, которые можно отрубить.
export const SEVER = {
  head: { cut: J.NECK, rest: [J.HEAD], segs: ['head'], stumpDir: [J.PELVIS, J.NECK] },
  larm: { cut: J.LSH, rest: [J.LEL, J.LHA], segs: ['lupper', 'lfore'], stumpDir: [J.NECK, J.LSH] },
  rarm: { cut: J.RSH, rest: [J.REL, J.RHA], segs: ['rupper', 'rfore'], stumpDir: [J.NECK, J.RSH] },
  lfore: { cut: J.LEL, rest: [J.LHA], segs: ['lfore'], stumpDir: [J.LSH, J.LEL] },
  rfore: { cut: J.REL, rest: [J.RHA], segs: ['rfore'], stumpDir: [J.RSH, J.REL] },
  lleg: { cut: J.LHIP, rest: [J.LKN, J.LFT], segs: ['lthigh', 'lshin'], stumpDir: [J.RHIP, J.LHIP] },
  rleg: { cut: J.RHIP, rest: [J.RKN, J.RFT], segs: ['rthigh', 'rshin'], stumpDir: [J.LHIP, J.RHIP] },
  lshin: { cut: J.LKN, rest: [J.LFT], segs: ['lshin'], stumpDir: [J.LHIP, J.LKN] },
  rshin: { cut: J.RKN, rest: [J.RFT], segs: ['rshin'], stumpDir: [J.RHIP, J.RKN] }
};

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cv = new THREE.Vector3(), _zc = new THREE.Vector3(), _zh = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _hd = new THREE.Vector3(), _hz = new THREE.Vector3(), _wd = new THREE.Vector3(), _pole = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _c2 = new THREE.Color();
const X_AXIS = new THREE.Vector3(1, 0, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
const REACT_W = [1.25, 0.8, 0.05, 0.75, 0.75, 0.6, 0.6, 0.45, 0.45, 0, 0, 0, 0, 0, 0];
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export function ik2(root, target, l1, l2, pole, outMid, outEnd) {
  const d = _v1.subVectors(target, root);
  let dist = d.length();
  const maxD = (l1 + l2) * 0.995, minD = Math.abs(l1 - l2) + 0.02;
  if (dist < 1e-5) { d.set(0, -1, 0); dist = minD; } else d.divideScalar(dist);
  dist = Math.min(maxD, Math.max(minD, dist));
  const a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - a * a));
  const p = _v2.copy(pole).addScaledVector(d, -pole.dot(d));
  if (p.lengthSq() < 1e-8) { p.set(0, 0, 1).addScaledVector(d, -d.z); if (p.lengthSq() < 1e-8) p.set(1, 0, 0); }
  p.normalize();
  outMid.copy(root).addScaledVector(d, a * l1).addScaledVector(p, sinA * l1);
  outEnd.copy(root).addScaledVector(d, dist);
}

// Ориентировать группу: +Y вдоль A→B, +Z как можно ближе к zRef. Возвращает новую ось Z.
export function orient(group, A, B, zRef, outZ) {
  const y = _v1.subVectors(B, A);
  const len = y.length();
  if (len < 1e-6) return;
  y.divideScalar(len);
  const z = _v2.copy(zRef).addScaledVector(y, -zRef.dot(y));
  if (z.lengthSq() < 1e-6) {
    z.set(0, 0, 1).addScaledVector(y, -y.z);
    if (z.lengthSq() < 1e-6) z.set(1, 0, 0).addScaledVector(y, -y.x);
  }
  z.normalize();
  const x = _v3.crossVectors(y, z);
  _m.makeBasis(x, y, z);
  group.quaternion.setFromRotationMatrix(_m);
  group.position.copy(A);
  if (outZ) outZ.copy(z);
}

export { FLESH_MAT };

export class Character {
  constructor(scene, opts) {
    this.scene = scene;
    this.look = opts.look;
    this.scale = opts.scale || 1;
    this.bulk = (opts.look.bulk || 1);
    const s = this.scale;
    this.dim = {
      upper: 0.28 * s, fore: 0.27 * s, thigh: 0.44 * s, shin: 0.43 * s,
      neck: 0.2 * s, shW: 0.2 * s * Math.min(1.15, this.bulk), hipW: 0.105 * s, spine: 0.5 * s, foot: 0.08 * s
    };
    this.root = new THREE.Vector3();
    this.facing = 0;
    this.pose = Array.from({ length: NJ }, () => new THREE.Vector3());
    this.prevPose = Array.from({ length: NJ }, () => new THREE.Vector3());
    this.vel = Array.from({ length: NJ }, () => new THREE.Vector3());
    this.local = Array.from({ length: NJ }, () => new THREE.Vector3());
    this.mode = 'anim';
    this.missing = new Set(); // отсутствующие суставы
    this.severed = new Set(); // отрубленные части
    this.time = Math.random() * 10;
    this.anim = {
      vel: new THREE.Vector3(), phase: 0, crouch: 0, lean: 0, twist: 0,
      rh: new THREE.Vector3(-0.22, 1.05, 0.32), wdir: new THREE.Vector3(-0.1, 0.65, 0.75).normalize(),
      lh: new THREE.Vector3(0.25, 1.0, 0.25), look: null,
      react: new THREE.Vector3(), reactT: 0, jitter: 0, headLook: 0
    };
    // пружины вторичного движения и состояние шагов
    this.spr = { lean: 0, leanV: 0, roll: 0, rollV: 0, twist: 0, twistV: 0, py: 0, pyV: 0, pvx: 0, pvz: 0, ax: 0, az: 0, react: new THREE.Vector3(), reactV: new THREE.Vector3(), hx: 0, hz: 0, init: false };
    const mkFoot = (side, off) => ({ side, off, p: new THREE.Vector3(), from: new THREE.Vector3(), swing: false, stepT: -1, h: 0, pitch: 0, l: new THREE.Vector3() });
    this.feet = { l: mkFoot(1, 0), r: mkFoot(-1, 0.5), phase: 0, init: false, moving: false, cool: 0, still: 0 };
    this.face = { mouth: 0, mouthT: 0, blinkT: 1 + Math.random() * 4, blink: 0 };
    this.headFwd = new THREE.Vector3(0, 0, 1);
    this.spineMid = new THREE.Vector3();
    this.bloodAmt = 0;
    this.weaponTip = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.weaponX = new THREE.Vector3(1, 0, 0);
    this.group = new THREE.Group();
    scene.add(this.group);
    buildBody(this);
    if (opts.weaponId) this.setWeapon(opts.weaponId);
    this.capsules = [];
    this.flash = 0;
    this.tint = null; // 'frozen' | 'burn' | 'char' | 'acid'
    this.tintAmt = 0;
  }

  setWeapon(id) {
    if (this.weapon) { this.weapon.group.removeFromParent(); }
    this.weapon = buildWeapon(id);
    this.weapon.group.scale.setScalar(this.scale);
    this.group.add(this.weapon.group);
    this.weaponAttached = true;
    this.weaponLen = this.weapon.length * this.scale;
  }

  // ===== Процедурная поза =====
  toWorld(local, out) {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    out.set(this.root.x + local.x * c + local.z * s, this.root.y + local.y, this.root.z - local.x * s + local.z * c);
    return out;
  }

  dirToWorld(local, out) {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    return out.set(local.x * c + local.z * s, local.y, -local.x * s + local.z * c);
  }

  dirToLocal(world, out) {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    return out.set(world.x * c - world.z * s, world.y, world.x * s + world.z * c);
  }

  forward(out) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  // Точка покоя ступни (мир) для текущего положения корпуса.
  restFoot(side, speed, out) {
    const s = this.scale;
    const k = Math.max(0, 1 - speed / 2.5);
    const lx = side * (0.125 + 0.035 * k) * s, lz = (side > 0 ? 0.1 : -0.09) * s * k;
    const c = Math.cos(this.facing), sn = Math.sin(this.facing);
    return out.set(this.root.x + lx * c + lz * sn, 0, this.root.z - lx * sn + lz * c);
  }

  snapFeet(speed = 0) {
    const F = this.feet;
    for (const f of [F.l, F.r]) {
      this.restFoot(f.side, speed, f.p);
      f.swing = false; f.stepT = -1; f.h = 0; f.pitch = 0;
    }
    F.init = true;
  }

  // Шаги: ступни закреплены в мире и переставляются, а не скользят.
  updateFeet(dt, speed, wvx, wvz) {
    const F = this.feet, s = this.scale;
    const feet = [F.l, F.r];
    if (!F.init) this.snapFeet(speed);
    for (const f of feet) {
      this.restFoot(f.side, speed, _v1);
      if (Math.hypot(f.p.x - _v1.x, f.p.z - _v1.z) > 1.25 * s) { this.snapFeet(speed); break; }
    }
    const moving = speed > 0.45;
    if (moving) {
      const stride = (0.4 + speed * 0.16) * s;
      const freq = Math.max(1.0, speed / (2 * stride));
      if (!F.moving) {
        // первой шагает нога, оставшаяся позади
        const pl = (F.l.p.x - this.root.x) * wvx + (F.l.p.z - this.root.z) * wvz;
        const pr = (F.r.p.x - this.root.x) * wvx + (F.r.p.z - this.root.z) * wvz;
        F.phase = pl < pr ? 0 : 0.5;
      }
      F.phase = (F.phase + dt * freq) % 1;
      const SW = 0.46;
      const k = Math.min(1, speed / 2.2);
      for (const f of feet) {
        f.stepT = -1;
        const ph = (F.phase + f.off) % 1;
        if (ph < SW) {
          if (!f.swing) { f.swing = true; f.from.copy(f.p); }
          const t = ph / SW;
          const lead = (1 - t) * SW / freq + (1 - SW) / freq * 0.5;
          this.restFoot(f.side, speed, _v1);
          _v1.x += wvx * lead; _v1.z += wvz * lead;
          const e = t * t * (3 - 2 * t);
          f.p.x = f.from.x + (_v1.x - f.from.x) * e;
          f.p.z = f.from.z + (_v1.z - f.from.z) * e;
          f.h = Math.sin(Math.PI * t) * (0.045 + 0.075 * k) * s;
          f.pitch = (t < 0.4 ? 0.6 * (1 - t / 0.4) : t > 0.72 ? -0.32 * (t - 0.72) / 0.28 : 0) * k;
        } else {
          f.swing = false;
          f.h = 0;
          const st = (ph - SW) / (1 - SW);
          f.pitch = st > 0.72 ? 0.55 * (st - 0.72) / 0.28 * k : 0;
        }
      }
      F.still = 0;
    } else {
      F.still += dt;
      F.cool -= dt;
      let active = null;
      for (const f of feet) {
        if (f.swing && f.stepT < 0) { f.stepT = 0.25; f.from.copy(f.p); }
        if (f.stepT >= 0) active = active || f;
      }
      if (!active && F.cool <= 0) {
        let best = null, be = 0;
        for (const f of feet) {
          this.restFoot(f.side, speed, _v1);
          const err = Math.hypot(f.p.x - _v1.x, f.p.z - _v1.z);
          if (err > be) { be = err; best = f; }
        }
        if (best && (be > 0.17 * s || (be > 0.06 * s && F.still > 0.45))) { best.stepT = 0; best.swing = true; best.from.copy(best.p); }
      }
      for (const f of feet) {
        if (f.stepT >= 0) {
          f.stepT += dt / 0.2;
          const t = Math.min(1, f.stepT);
          this.restFoot(f.side, speed, _v1);
          const e = t * t * (3 - 2 * t);
          f.p.x = f.from.x + (_v1.x - f.from.x) * e;
          f.p.z = f.from.z + (_v1.z - f.from.z) * e;
          f.h = Math.sin(Math.PI * t) * 0.05 * s;
          f.pitch = Math.sin(Math.PI * t) * 0.22;
          if (t >= 1) { f.stepT = -1; f.swing = false; f.h = 0; f.pitch = 0; F.cool = 0.06; }
        } else { f.h = 0; f.pitch *= Math.max(0, 1 - dt * 10); }
      }
    }
    F.moving = moving;
    const c = Math.cos(this.facing), sn = Math.sin(this.facing);
    for (const f of feet) {
      const dx = f.p.x - this.root.x, dz = f.p.z - this.root.z;
      f.l.set(dx * c - dz * sn, this.dim.foot + f.h, dx * sn + dz * c);
    }
  }

  computeLocalPose(dt) {
    const A = this.anim, d = this.dim, P = this.local, s = this.scale, S = this.spr, F = this.feet;
    this.time += dt;
    const vx = A.vel.x, vz = A.vel.z;
    const speed = Math.hypot(vx, vz);
    const cf = Math.cos(this.facing), sf = Math.sin(this.facing);
    const wvx = vx * cf + vz * sf, wvz = -vx * sf + vz * cf;
    if (!S.init) { S.pvx = vx; S.pvz = vz; }
    const idt = 1 / Math.max(dt, 1e-4), k8 = Math.min(1, dt * 8);
    S.ax += (Math.max(-25, Math.min(25, (vx - S.pvx) * idt)) - S.ax) * k8;
    S.az += (Math.max(-25, Math.min(25, (vz - S.pvz) * idt)) - S.az) * k8;
    S.pvx = vx; S.pvz = vz;
    this.updateFeet(dt, speed, wvx, wvz);
    const fl = F.l.l, fr = F.r.l;
    // ---- таз: высота ограничена длиной ног, вес смещается на опорную ногу
    const crouch = A.crouch;
    const moveK = Math.min(1, speed / 2.5);
    const sway = (F.r.h - F.l.h) * 0.22 + Math.sin(this.time * 0.8) * 0.006 * s * (1 - moveK);
    const Lmax = (d.thigh + d.shin) * 0.985;
    let py = (0.915 - crouch * 0.3) * s;
    for (let i = 0; i < 2; i++) {
      const f = i ? fr : fl, side = i ? -1 : 1;
      const dx = f.x - (side * d.hipW + sway), dz = f.z;
      const m = f.y + Math.sqrt(Math.max(0.02, Lmax * Lmax - dx * dx - dz * dz)) + 0.03 * s;
      if (m < py) py = m;
    }
    py -= moveK * 0.012 * s;
    if (!S.init) { S.py = py; S.init = true; }
    S.pyV += ((py - S.py) * 260 - S.pyV * 24) * dt;
    S.py += S.pyV * dt;
    if (S.py > py + 0.015 * s) { S.py = py + 0.015 * s; if (S.pyV > 0) S.pyV = 0; }
    const breath = Math.sin(this.time * 1.7);
    this.breath = breath;
    const pelY = S.py + breath * 0.003 * s;
    P[J.PELVIS].set(sway, pelY, 0);
    const legYaw = -Math.max(-1, Math.min(1, (fl.z - fr.z) / (0.9 * s))) * 0.24 * moveK;
    const hipYaw = legYaw + A.twist * 0.3;
    const pc = Math.cos(hipYaw), ps = Math.sin(hipYaw);
    P[J.LHIP].set(sway + d.hipW * pc, pelY - 0.03 * s, -d.hipW * ps);
    P[J.RHIP].set(sway - d.hipW * pc, pelY - 0.03 * s, d.hipW * ps);
    ik2(P[J.LHIP], fl, d.thigh, d.shin, _pole.set(0.16, 0, 1), P[J.LKN], P[J.LFT]);
    ik2(P[J.RHIP], fr, d.thigh, d.shin, _pole.set(-0.16, 0, 1), P[J.RKN], P[J.RFT]);
    // ---- корпус на пружинах: наклон в сторону ускорения, крен при стрейфе, скручивание
    const leanT = A.lean + 0.045 + crouch * 0.25 + Math.max(-0.06, Math.min(0.13, vz * 0.03)) + Math.max(-0.09, Math.min(0.11, S.az * 0.006));
    const rollT = Math.max(-0.16, Math.min(0.16, vx * 0.032 + S.ax * 0.005));
    const twistT = A.twist - legYaw * 0.5 + Math.sin(this.time * 0.6) * 0.025 * (1 - moveK);
    S.leanV += ((leanT - S.lean) * 170 - S.leanV * 17) * dt; S.lean += S.leanV * dt;
    S.rollV += ((rollT - S.roll) * 170 - S.rollV * 17) * dt; S.roll += S.rollV * dt;
    S.twistV += ((twistT - S.twist) * 210 - S.twistV * 19) * dt; S.twist += S.twistV * dt;
    const up = _up.set(0, d.spine, 0).applyAxisAngle(X_AXIS, S.lean).applyAxisAngle(Z_AXIS, -S.roll).applyAxisAngle(UP, S.twist);
    P[J.NECK].copy(P[J.PELVIS]).add(up);
    for (let i = 0; i < 2; i++) {
      const side = i ? -1 : 1;
      _v3.set(side * d.shW, (-0.04 + breath * 0.004) * s, 0).applyAxisAngle(Z_AXIS, -S.roll * 1.2).applyAxisAngle(UP, S.twist);
      P[i ? J.RSH : J.LSH].copy(P[J.NECK]).add(_v3);
    }
    // плечо подаётся за рукой
    for (let i = 0; i < 2; i++) {
      const sh = P[i ? J.RSH : J.LSH], tg = i ? A.rh : A.lh;
      _v3.subVectors(tg, sh);
      const L = _v3.length();
      if (L > 1e-4) sh.addScaledVector(_v3, Math.min(0.055 * s, L * 0.14) / L);
    }
    // ---- голова: вдоль позвоночника с запаздывающим поворотом к цели
    const hd = _hd.copy(up).normalize().multiplyScalar(0.7);
    hd.y += 0.3;
    let tx = 0, tz = 0;
    if (A.look) {
      this.toWorld(P[J.NECK], _v3);
      this.dirToLocal(_v1.subVectors(A.look, _v3), _v2).normalize();
      tx = Math.max(-0.22, Math.min(0.22, _v2.x * 0.3));
      tz = Math.max(-0.1, Math.min(0.25, _v2.z * 0.28));
    }
    const hk = Math.min(1, dt * 7);
    S.hx += (tx - S.hx) * hk; S.hz += (tz - S.hz) * hk;
    hd.x += S.hx; hd.z += S.hz;
    P[J.HEAD].copy(P[J.NECK]).addScaledVector(hd.normalize(), d.neck);
    // ---- руки (IK)
    ik2(P[J.RSH], A.rh, d.upper, d.fore, _pole.set(-0.7, -0.8, -0.5), P[J.REL], P[J.RHA]);
    ik2(P[J.LSH], A.lh, d.upper, d.fore, _pole.set(0.7, -0.8, -0.4), P[J.LEL], P[J.LHA]);
    // ---- реакция на удар: затухающая пружина
    const rv = S.reactV, rx = S.react;
    rv.x += (-rx.x * 240 - rv.x * 11) * dt; rv.y += (-rx.y * 240 - rv.y * 11) * dt; rv.z += (-rx.z * 240 - rv.z * 11) * dt;
    rx.addScaledVector(rv, dt);
    if (rx.lengthSq() > 0.09) rx.setLength(0.3);
    if (rx.lengthSq() > 1e-7) for (let i = 0; i < NJ; i++) if (REACT_W[i]) P[i].addScaledVector(rx, REACT_W[i]);
    if (A.jitter > 0) {
      for (let i = 0; i < NJ; i++) {
        if (i === J.LFT || i === J.RFT) continue;
        P[i].x += (Math.random() - 0.5) * A.jitter;
        P[i].y += (Math.random() - 0.5) * A.jitter;
        P[i].z += (Math.random() - 0.5) * A.jitter;
      }
    }
  }

  // Обновление каждый кадр.
  update(dt, R, events) {
    if (dt <= 0) return;
    for (let i = 0; i < NJ; i++) this.prevPose[i].copy(this.pose[i]);
    this.prevTip.copy(this.weaponTip);
    if (this.frozen && this.mode === 'anim') {
      // заморожен: поза не меняется
    } else if (this.mode === 'anim' || this.mode === 'blend') {
      this.computeLocalPose(dt);
      for (let i = 0; i < NJ; i++) this.toWorld(this.local[i], this.pose[i]);
      if (this.mode === 'blend') {
        this.blendT += dt / this.blendDur;
        const t = Math.min(1, this.blendT);
        const k = t * t * (3 - 2 * t);
        for (let i = 0; i < NJ; i++) this.pose[i].lerpVectors(this.blendFrom[i], this.pose[i], k);
        if (t >= 1) this.mode = 'anim';
      }
    } else if (this.mode === 'ragdoll') {
      this.ragdoll.step(dt, R, events);
      for (let i = 0; i < NJ; i++) if (!this.missing.has(i)) this.pose[i].copy(this.ragdoll.p[i]);
    }
    for (let i = 0; i < NJ; i++) this.vel[i].subVectors(this.pose[i], this.prevPose[i]).divideScalar(dt);
    this.updateMeshes(dt);
    this.capsulesDirty = true;
    if (!this.frozen) this.updateFace(dt);
    // эффекты материалов
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    this.applyTint();
    if (this.handGlow) {
      const target = this.castGlow || 0;
      const gm = this.handGlow.material;
      gm.opacity += (target - gm.opacity) * Math.min(1, dt * 10);
      this.handGlow.scale.setScalar(this.handGlowBase * (0.6 + gm.opacity * 0.8 + Math.sin(this.time * 30) * 0.08 * target));
      this.handGlow.visible = gm.opacity > 0.02 && !this.severed.has('larm') && !this.severed.has('lfore');
    }
  }

  updateFace(dt) {
    const fp = this.faceParts;
    if (!fp) return;
    const Fc = this.face;
    Fc.mouth += (Fc.mouthT - Fc.mouth) * Math.min(1, dt * 16);
    const m = Fc.mouth, b = fp.mouthBase;
    fp.mouth.scale.set(b[0] * (1 - m * 0.22), b[1] * (1 + m * 5.5), b[2]);
    Fc.blinkT -= dt;
    if (Fc.blinkT <= 0) { Fc.blinkT = 1.5 + Math.random() * 4; Fc.blink = 0.12; }
    Fc.blink = Math.max(0, Fc.blink - dt);
    const open = Fc.closed ? 0.15 : (Fc.blink > 0 ? 0.1 : 1 - m * 0.2);
    fp.eyes.scale.y += (open - fp.eyes.scale.y) * Math.min(1, dt * 30);
  }

  applyTint() {
    const fl = this.flash, t = this.tint, ta = this.tintAmt;
    const m = this.material, u = m.userData.u;
    m.color.setScalar(1);
    m.emissive.setRGB(fl * 0.3, fl * 0.05, fl * 0.035);
    u.uTint.value.set(0, 0, 0, 0);
    u.uBlood.value = Math.min(1, this.bloodAmt);
    if (t === 'frozen') {
      u.uTint.value.set(0.62, 0.86, 1.0, ta * 0.72);
      m.emissive.r += 0.03 * ta; m.emissive.g += 0.1 * ta; m.emissive.b += 0.18 * ta;
    } else if (t === 'burn') {
      m.color.setScalar(1 - ta * 0.5);
      const f = (0.25 + Math.random() * 0.25) * ta;
      m.emissive.r += f; m.emissive.g += f * 0.3;
    } else if (t === 'acid') {
      // сначала зеленеет и дымится, потом остаются кости
      const k1 = Math.min(1, ta), k2 = Math.max(0, Math.min(1, ta - 1));
      _c.setRGB(0.35, 0.55, 0.12).lerp(_c2.setRGB(0.86, 0.83, 0.72), k2);
      u.uTint.value.set(_c.r, _c.g, _c.b, Math.max(k1 * 0.7, k2));
      m.emissive.g += 0.06 * k1 * (1 - k2);
    } else if (t === 'char') {
      m.color.setScalar(1 - ta * 0.85);
      m.emissive.r += Math.max(0, ta - 0.6) * (0.15 + Math.random() * 0.1);
    }
  }

  updateMeshes(dt = 0.016) {
    const P = this.pose;
    const fwd = this.forward(_fwd);
    const rag = this.mode === 'ragdoll';
    // ---- торс: таз и грудь поворачиваются раздельно (скручивание корпуса)
    const T = this.segs.torso, C = this.segs.chest;
    const upv = _a.subVectors(P[J.NECK], P[J.PELVIS]);
    const M = this.spineMid.copy(P[J.PELVIS]).addScaledVector(upv, SPINE_SPLIT);
    upv.normalize();
    const lsh = _b.subVectors(P[J.LSH], P[J.RSH]).normalize();
    const lhip = _cv.subVectors(P[J.LHIP], P[J.RHIP]).normalize();
    if (rag) { lsh.add(lhip).normalize(); lhip.copy(lsh); } else lhip.lerp(lsh, 0.2).normalize();
    const zC = _zc.crossVectors(lsh, upv).normalize();
    const zH = _zh.crossVectors(lhip, upv).normalize();
    if (!rag) M.addScaledVector(zC, -0.012 * this.scale);
    orient(T.group, P[J.PELVIS], M, zH, T.z);
    orient(C.group, M, P[J.NECK], zC, C.z);
    const br = rag || this.frozen ? 0 : this.breath || 0;
    C.group.scale.set(1 + br * 0.012, 1, 1 + br * 0.028);
    this.skinTorso();
    for (const name in this.segs) {
      if (name === 'torso' || name === 'chest') continue;
      const sg = this.segs[name];
      if (!sg.attached) continue;
      let zRef = fwd;
      if (rag) zRef = sg.z;
      else if (name === 'head') {
        this.headFwd.lerp(this.headZ(zC), Math.min(1, dt * 9)).normalize();
        zRef = this.headFwd;
      }
      orient(sg.group, P[sg.a], P[sg.b], zRef, sg.z);
    }
    // ---- ступни остаются плоскими на земле
    if (!rag) {
      for (let i = 0; i < 2; i++) {
        const sg = this.segs[i ? 'rshin' : 'lshin'];
        if (!sg.attached || !sg.foot) continue;
        const f = i ? this.feet.r : this.feet.l;
        _e.set(f.pitch, this.facing + (i ? -0.16 : 0.16), 0, 'YXZ');
        _q.copy(sg.group.quaternion).invert().multiply(_q2.setFromEuler(_e));
        sg.foot.quaternion.slerp(_q, Math.min(1, dt * 25));
      }
    }
    // ---- оружие
    if (this.weapon && this.weaponAttached) {
      const hand = P[J.RHA];
      const dir = _wd;
      if (this.mode === 'anim' || this.mode === 'blend') {
        this.dirToWorld(this.anim.wdir, dir).normalize();
        if (this.mode === 'blend') dir.lerp(_v1.subVectors(P[J.RHA], P[J.REL]).normalize(), 1 - Math.min(1, this.blendT)).normalize();
      } else {
        dir.subVectors(P[J.RHA], P[J.REL]).normalize();
      }
      this.weaponTip.copy(hand).addScaledVector(dir, this.weaponLen * 0.95);
      // ребро клинка ведёт удар
      const tipVel = _v2.subVectors(this.weaponTip, this.prevTip);
      const xRef = tipVel.lengthSq() > 0.0009 ? tipVel.normalize() : this.weaponX;
      const x = _v3.copy(xRef).addScaledVector(dir, -xRef.dot(dir));
      if (x.lengthSq() < 1e-6) x.set(1, 0, 0).addScaledVector(dir, -dir.x);
      x.normalize();
      this.weaponX.lerp(x, 0.5).normalize();
      const z = _a.crossVectors(this.weaponX, dir).normalize();
      const xx = _b.crossVectors(dir, z);
      _m.makeBasis(xx, dir, z);
      this.weapon.group.quaternion.setFromRotationMatrix(_m);
      this.weapon.group.position.copy(hand);
    }
  }

  // «Кожа» торса: вершины смешиваются между системой таза и груди.
  skinTorso() {
    const sk = this.torsoSkin;
    if (!sk || !this.group.visible) return;
    const T = this.segs.torso.group, C = this.segs.chest.group;
    T.updateMatrix(); C.updateMatrix();
    const a = T.matrix.elements, b = C.matrix.elements;
    const P = sk.geo.attributes.position.array, N = sk.geo.attributes.normal.array;
    const R = sk.rest, RN = sk.restN, W = sk.w, Lh = sk.Lh;
    for (let i = 0, n = W.length; i < n; i++) {
      const j = i * 3;
      const x = R[j], y = R[j + 1], z = R[j + 2], w = W[i], u = 1 - w, yc = y - Lh;
      P[j] = u * (a[0] * x + a[4] * y + a[8] * z + a[12]) + w * (b[0] * x + b[4] * yc + b[8] * z + b[12]);
      P[j + 1] = u * (a[1] * x + a[5] * y + a[9] * z + a[13]) + w * (b[1] * x + b[5] * yc + b[9] * z + b[13]);
      P[j + 2] = u * (a[2] * x + a[6] * y + a[10] * z + a[14]) + w * (b[2] * x + b[6] * yc + b[10] * z + b[14]);
      const nx = RN[j], ny = RN[j + 1], nz = RN[j + 2];
      N[j] = u * (a[0] * nx + a[4] * ny + a[8] * nz) + w * (b[0] * nx + b[4] * ny + b[8] * nz);
      N[j + 1] = u * (a[1] * nx + a[5] * ny + a[9] * nz) + w * (b[1] * nx + b[5] * ny + b[9] * nz);
      N[j + 2] = u * (a[2] * nx + a[6] * ny + a[10] * nz) + w * (b[2] * nx + b[6] * ny + b[10] * nz);
    }
    sk.geo.attributes.position.needsUpdate = true;
    sk.geo.attributes.normal.needsUpdate = true;
  }

  // Направление взгляда головы: к цели, но не больше ~70° от груди.
  headZ(chestFwd) {
    if (!this.anim.look) return chestFwd;
    const d = _hz.subVectors(this.anim.look, this.pose[J.HEAD]);
    d.y *= 0.5;
    d.normalize();
    if (d.dot(chestFwd) < 0.35) d.lerp(chestFwd, 0.6).normalize();
    return d;
  }

  // ===== Хитбоксы =====
  getCapsules() {
    if (!this.capsulesDirty) return this.capsules;
    this.capsulesDirty = false;
    const P = this.pose, s = this.scale, b = this.bulk;
    const caps = this.capsules;
    caps.length = 0;
    const add = (part, a, bb, r) => caps.push({ part, a, b: bb, r });
    if (!this.severed.has('head')) {
      add('head', P[J.HEAD], P[J.HEAD], 0.135 * s);
      const neckTop = new THREE.Vector3().lerpVectors(P[J.NECK], P[J.HEAD], 0.5);
      add('neck', P[J.NECK], neckTop, 0.1 * s);
    }
    const tb = new THREE.Vector3().lerpVectors(P[J.PELVIS], P[J.NECK], 0.08);
    const tt = new THREE.Vector3().lerpVectors(P[J.PELVIS], P[J.NECK], 0.68);
    add('torso', tb, tt, 0.17 * s * b);
    const arm = (side) => {
      const sh = side === 'l' ? J.LSH : J.RSH, el = side === 'l' ? J.LEL : J.REL, ha = side === 'l' ? J.LHA : J.RHA;
      if (!this.severed.has(side + 'arm')) {
        add(side + 'arm', new THREE.Vector3().lerpVectors(P[sh], P[el], 0.22), P[el], 0.06 * s * b);
        if (!this.severed.has(side + 'fore')) add(side + 'fore', P[el], P[ha], 0.055 * s * b);
      }
    };
    arm('l'); arm('r');
    const leg = (side) => {
      const hp = side === 'l' ? J.LHIP : J.RHIP, kn = side === 'l' ? J.LKN : J.RKN, ft = side === 'l' ? J.LFT : J.RFT;
      if (!this.severed.has(side + 'leg')) {
        add(side + 'leg', P[hp], P[kn], 0.08 * s);
        if (!this.severed.has(side + 'shin')) add(side + 'shin', P[kn], P[ft], 0.065 * s);
      }
    };
    leg('l'); leg('r');
    return caps;
  }

  // ===== Реакции =====
  react(dirWorld, strength) {
    this.dirToLocal(dirWorld, _v1);
    _v1.y = Math.max(-0.05, _v1.y);
    this.spr.reactV.addScaledVector(_v1, strength * 15);
  }

  // Перевод в рэгдолл (смерть или нокдаун).
  toRagdoll(impulse, hitJoint = -1, hitImpulse = null) {
    const vels = [];
    for (let i = 0; i < NJ; i++) {
      const v = this.vel[i].clone();
      if (v.length() > 12) v.setLength(12);
      v.add(impulse);
      if (i === hitJoint && hitImpulse) v.add(hitImpulse);
      vels.push(v);
    }
    const cons = [];
    for (const [a, b, st] of BONES) {
      if (this.missing.has(a) || this.missing.has(b)) continue;
      cons.push({ a, b, len: this.pose[a].distanceTo(this.pose[b]), stiff: st || 1 });
    }
    for (const [a, b, mn] of LIMITS) {
      if (this.missing.has(a) || this.missing.has(b)) continue;
      cons.push({ a, b, len: mn * this.scale, min: true, stiff: 0.6 });
    }
    // кости должны иметь правильную длину
    const fix = { [J.LSH + '_' + J.LEL]: this.dim.upper, [J.LEL + '_' + J.LHA]: this.dim.fore, [J.RSH + '_' + J.REL]: this.dim.upper, [J.REL + '_' + J.RHA]: this.dim.fore,
      [J.LHIP + '_' + J.LKN]: this.dim.thigh, [J.LKN + '_' + J.LFT]: this.dim.shin, [J.RHIP + '_' + J.RKN]: this.dim.thigh, [J.RKN + '_' + J.RFT]: this.dim.shin };
    for (const c of cons) { const k = c.a + '_' + c.b; if (fix[k]) c.len = fix[k]; }
    const radii = RADII.map((r) => r * this.scale);
    // поднять над землёй, если что-то провалилось
    const pos = this.pose.map((p, i) => { const q = p.clone(); if (q.y < radii[i]) q.y = radii[i]; return q; });
    this.ragdoll = new Ragdoll(pos, vels, radii, cons, INV_MASS);
    for (const i of this.missing) { this.ragdoll.w[i] = 0; }
    this.mode = 'ragdoll';
    this.ragdollTime = 0;
    for (const name in this.segs) this.segs[name].z.copy(this.segs[name].z);
  }

  // Подняться из рэгдолла.
  getUp(facing) {
    if (this.mode !== 'ragdoll') return;
    this.blendFrom = this.pose.map((p) => p.clone());
    this.root.set(this.pose[J.PELVIS].x, 0, this.pose[J.PELVIS].z);
    this.facing = facing;
    this.mode = 'blend';
    this.feet.init = false;
    this.spr.init = false;
    this.blendT = 0;
    this.blendDur = 0.75;
    this.ragdoll = null;
  }

  // Отделить оружие (выронить). Возвращает объект для физики.
  dropWeapon() {
    if (!this.weapon || !this.weaponAttached) return null;
    this.weaponAttached = false;
    const grip = this.pose[J.RHA].clone();
    const tip = this.weaponTip.clone();
    const vg = this.vel[J.RHA].clone().clampLength(0, 10);
    const vt = vg.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3));
    const rd = new Ragdoll([grip, tip], [vg, vt], [0.04, 0.04], [{ a: 0, b: 1, len: grip.distanceTo(tip), stiff: 1 }]);
    rd.friction = 0.3;
    return { kind: 'weapon', ragdoll: rd, group: this.weapon.group, x: this.weaponX.clone() };
  }

  // Отрубить часть тела. Возвращает гиб (кусок с собственной физикой).
  sever(part, impulse) {
    const def = SEVER[part];
    if (!def || this.severed.has(part)) return null;
    // нельзя отрубить предплечье, если уже нет руки
    if ((part === 'lfore' && this.severed.has('larm')) || (part === 'rfore' && this.severed.has('rarm'))) return null;
    if ((part === 'lshin' && this.severed.has('lleg')) || (part === 'rshin' && this.severed.has('rleg'))) return null;
    const joints = [def.cut, ...def.rest].filter((j) => j === def.cut || !this.missing.has(j));
    const map = new Map(joints.map((j, i) => [j, i]));
    const pos = joints.map((j) => this.pose[j].clone());
    const vel = joints.map((j) => this.vel[j].clone().clampLength(0, 8).add(impulse));
    // закрутка
    for (let i = 1; i < vel.length; i++) vel[i].add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4));
    const cons = [];
    for (const [a, b, st] of BONES) {
      if (st) continue;
      if (map.has(a) && map.has(b)) cons.push({ a: map.get(a), b: map.get(b), len: this.pose[a].distanceTo(this.pose[b]), stiff: 1 });
    }
    const radii = joints.map((j) => RADII[j] * this.scale);
    const segs = [];
    for (const name of def.segs) {
      const sg = this.segs[name];
      if (!sg.attached) continue;
      sg.attached = false;
      segs.push({ group: sg.group, a: map.get(sg.a), b: map.get(sg.b), z: sg.z.clone(), seg: sg });
      // показать срез на отрубленной части
      for (const c of sg.caps) if (c.name === 'cut' && sg.a === def.cut) c.mesh.visible = true;
      if (name === 'head') for (const c of sg.caps) if (c.name === 'headcut') c.mesh.visible = true;
    }
    // оружие улетает вместе с рукой
    let weaponPart = null;
    if ((part === 'rarm' || part === 'rfore') && this.weapon && this.weaponAttached) {
      const ti = pos.length;
      pos.push(this.weaponTip.clone());
      vel.push(vel[vel.length - 1].clone());
      radii.push(0.04);
      const hi = map.get(J.RHA);
      cons.push({ a: hi, b: ti, len: this.weaponLen * 0.95, stiff: 1 });
      if (map.has(J.REL)) cons.push({ a: map.get(J.REL), b: ti, len: this.pose[J.REL].distanceTo(this.weaponTip), stiff: 0.8 });
      else if (map.has(def.cut)) cons.push({ a: 0, b: ti, len: pos[0].distanceTo(this.weaponTip), stiff: 0.8 });
      weaponPart = { group: this.weapon.group, a: hi, b: ti, x: this.weaponX.clone() };
      this.weaponAttached = false;
    }
    for (const j of def.rest) this.missing.add(j);
    this.severed.add(part);
    if (part === 'rarm') this.severed.add('rfore');
    if (part === 'larm') this.severed.add('lfore');
    if (part === 'rleg') this.severed.add('rshin');
    if (part === 'lleg') this.severed.add('lshin');
    // культя на теле
    const stumpName = part.replace('fore', 'arm').replace('shin', 'leg');
    if (part === 'head' || part === 'larm' || part === 'rarm' || part === 'lleg' || part === 'rleg') {
      for (const c of [...this.segs.torso.caps, ...this.segs.chest.caps]) if (c.name === stumpName) c.mesh.visible = true;
    } else {
      const upperName = part === 'lfore' ? 'lupper' : part === 'rfore' ? 'rupper' : part === 'lshin' ? 'lthigh' : 'rthigh';
      for (const c of this.segs[upperName].caps) if (c.name === 'end') c.mesh.visible = true;
    }
    if (this.ragdoll) { this.ragdoll.w[def.rest[0]] = 0; for (const j of def.rest) this.ragdoll.w[j] = 0; this.ragdoll.c = this.ragdoll.c.filter((c) => !this.missing.has(c.a) && !this.missing.has(c.b)); }
    const rd = new Ragdoll(pos, vel, radii, cons);
    rd.friction = 0.2;
    return { kind: 'gib', ragdoll: rd, segs, weaponPart, stumpDir: def.stumpDir, cutJoint: def.cut, part };
  }

  // Скрыть часть (раздавлена/взорвана) без гиба.
  destroyPart(part) {
    const def = SEVER[part];
    if (!def || this.severed.has(part)) return;
    for (const name of def.segs) { this.segs[name].attached = false; this.segs[name].group.visible = false; }
    for (const j of def.rest) this.missing.add(j);
    this.severed.add(part);
    for (const c of [...this.segs.torso.caps, ...this.segs.chest.caps]) if (c.name === part) c.mesh.visible = true;
    if (this.ragdoll) this.ragdoll.c = this.ragdoll.c.filter((c) => !this.missing.has(c.a) && !this.missing.has(c.b));
  }

  hideAll() {
    this.group.visible = false;
  }

  dispose() {
    this.group.removeFromParent();
    this.material.dispose();
    for (const g of this.ownGeos || []) g.dispose();
  }
}

// Обновление гиба/оружия-обломка: ориентировать сегменты по частицам.
export function updateLoosePiece(piece, dt, R, events) {
  piece.ragdoll.step(dt, R, events);
  const p = piece.ragdoll.p;
  if (piece.segs) {
    for (const sg of piece.segs) {
      if (sg.a === undefined || sg.b === undefined) continue;
      orient(sg.group, p[sg.a], p[sg.b], sg.z, sg.z);
    }
  }
  const wp = piece.kind === 'weapon' ? { group: piece.group, a: 0, b: 1, x: piece.x } : piece.weaponPart;
  if (wp) {
    const a = p[wp.a], b = p[wp.b];
    const dir = _v1.subVectors(b, a).normalize();
    const x = _v2.copy(wp.x).addScaledVector(dir, -wp.x.dot(dir));
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    wp.x.copy(x);
    const z = _v3.crossVectors(x, dir).normalize();
    _m.makeBasis(x, dir, z);
    wp.group.quaternion.setFromRotationMatrix(_m);
    wp.group.position.copy(a);
  }
}
