// Игрок: камера от первого лица, вьюмодель оружия, удары по свайпу, блок, рывок.
import * as THREE from 'three';
import { WEAPONS, WEAPON_TYPES, ARMOR, MAGIC_UPGRADES } from './data.js';
import { buildWeapon, setBloodiness } from './weapons3d.js';
import { Trail } from './fx.js';
import { lathe, tube, ball, matOf, PartBuilder } from './meshkit.js';
import { bodyMaterial } from './gfx.js';
import { ARENA_R } from './arena.js';

const EYE = 1.62;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();

function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }

export class Player {
  constructor(battle, save) {
    this.battle = battle;
    this.camera = battle.camera;
    this.team = 0;
    this.isPlayer = true;
    this.name = 'Вы';
    this.pos = new THREE.Vector3(0, 0, 8.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = -0.05;
    this.time = 0;
    this.applyLoadout(save);
    this.hp = this.maxHp; this.mana = this.maxMana; this.stamina = this.maxStamina;
    this.state = 'idle';
    this.stateT = 0;
    this.swing = null;
    this.buffer = null;
    this.blockHeld = false;
    this.blockStart = -10;
    this.blockAmt = 0;
    this.dash = null;
    this.invuln = 0;
    this.shield = null;
    this.slowT = 0;
    this.staggerT = 0;
    this.backstabT = 0;
    this.blood = 0;
    this.target = null;
    this.dead = false;
    this.deathT = 0;
    this.bob = 0;
    this.fovKick = 0;
    this.castGlow = 0;
    this.castColor = new THREE.Color(0x66ccff);
    this.buildViewmodel();
  }

  applyLoadout(save) {
    const eq = save.equipped;
    this.weaponId = eq.weapon;
    const item = WEAPONS[eq.weapon];
    this.wtype = WEAPON_TYPES[item.type];
    this.wdmg = item.dmg;
    let armor = 0, speed = 0, weight = 0, manaRegen = 0, staminaRegen = 0, manaMax = 0, hpBonus = 0;
    for (const slot of ['head', 'body', 'hands', 'feet']) {
      const a = ARMOR[eq[slot]];
      if (!a) continue;
      armor += a.armor; weight += a.weight || 0; speed += a.speed || 0;
      manaRegen += a.manaRegen || 0; staminaRegen += a.staminaRegen || 0; manaMax += a.manaMax || 0; hpBonus += a.hpBonus || 0;
    }
    this.armor = armor;
    this.speed = 4.3 * (1 + speed) * (1 - weight * 0.025);
    const up = save.upgrades;
    this.maxHp = 100 + hpBonus + up.vitality * 15;
    this.maxMana = 100 + manaMax + up.manaPool * 20;
    this.maxStamina = 100;
    this.manaRegen = 2.2 * (1 + manaRegen + up.manaFlow * 0.25);
    this.staminaRegen = 32 * (1 + staminaRegen);
    this.handsLook = eq.hands ? ARMOR[eq.hands] : null;
  }

  buildViewmodel() {
    const cam = this.camera;
    this.vm = new THREE.Group();
    cam.add(this.vm);
    this.hand = new THREE.Group();
    this.vm.add(this.hand);
    const w = buildWeapon(this.weaponId);
    this.weapon = w;
    w.group.traverse((o) => { o.castShadow = false; });
    this.vmScale = w.type === 'spear' ? 0.62 : w.type === 'greatsword' ? 0.66 : 0.74;
    w.group.scale.setScalar(this.vmScale);
    this.hand.add(w.group);
    // материалы рук: кожа либо перчатки/латные рукавицы
    const HL = this.handsLook;
    const skin = matOf(0xd8a888, 0.6);
    const gl = HL ? matOf(HL.color, HL.look === 'gauntlets' ? 0.36 : 0.8, HL.look === 'gauntlets' ? 0.9 : 0) : skin;
    const gl2 = HL ? { c: gl.c.clone().multiplyScalar(0.7), r: gl.r, m: gl.m } : matOf(0xb88a6c, 0.62);
    const sleeve = matOf(0x4a3424, 0.9), brace = matOf(0x3a2616, 0.8), stud = matOf(0xb8923e, 0.35, 0.9);
    this.vmMat = bodyMaterial();
    const B = new PartBuilder();
    // --- правая кисть: кулак вокруг рукояти (ось рукояти — Y)
    const finger = new THREE.TorusGeometry(0.027, 0.0105, 6, 12, Math.PI * 1.35);
    for (let i = 0; i < 4; i++) {
      B.add(this.hand, finger, i % 2 ? gl2 : gl, [0, 0.033 - i * 0.021, 0.004], [1, 1, 1.05], [Math.PI / 2, 0, -0.35]);
    }
    B.add(this.hand, ball(12, 10), gl, [0.012, -0.002, 0.03], [0.036, 0.05, 0.03]);
    B.add(this.hand, tube([[0.03, 0.0, 0.03], [0.012, 0.035, 0.0], [-0.016, 0.05, -0.022]], (t) => 0.0125 - t * 0.003, { radial: 7, segs: 6 }), gl);
    B.add(this.hand, ball(10, 8), gl, [0.022, -0.045, 0.045], [0.03, 0.03, 0.03]);
    // --- предплечья (единичной длины, растягиваются по Y)
    const foreGeo = lathe([[0, 0.052], [0.3, 0.05], [0.75, 0.036], [1, 0.03]], { radial: 12, rings: 8, roundA: true, cuts: [0.42, 0.9] });
    const foreMat = (p) => (p.y > 0.9 ? gl : p.y > 0.42 ? brace : sleeve);
    this.forearm = new THREE.Group();
    this.vm.add(this.forearm);
    B.add(this.forearm, foreGeo, foreMat);
    for (let i = 0; i < 3; i++) B.add(this.forearm, ball(6, 5), stud, [0, 0.5 + i * 0.14, 0.04 - i * 0.004], [0.008, 0.004, 0.006]);
    this.sleeve = new THREE.Group();
    this.vm.add(this.sleeve);
    B.add(this.sleeve, lathe([[0, 0.075], [0.5, 0.068], [1, 0.058]], { radial: 12, rings: 5, roundB: true }), sleeve);
    // --- левая рука (магия): раскрытая ладонь
    this.lhand = new THREE.Group();
    this.vm.add(this.lhand);
    B.add(this.lhand, ball(12, 10), gl, [0, 0.0, 0], [0.04, 0.046, 0.016]);
    const fl = [[-0.03, 0.06, -0.38], [-0.011, 0.07, -0.12], [0.009, 0.068, 0.1], [0.027, 0.058, 0.32]];
    for (const [fx, len, splay] of fl) {
      const base = [fx, 0.04, 0];
      const tip = [fx + Math.sin(splay) * len, 0.04 + Math.cos(splay) * len, 0.022];
      const mid = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, -0.004];
      B.add(this.lhand, tube([base, mid, tip], (t) => 0.0095 - t * 0.003, { radial: 6, segs: 6 }), gl);
    }
    B.add(this.lhand, tube([[-0.036, 0.005, 0.004], [-0.06, 0.03, 0.016], [-0.066, 0.058, 0.03]], (t) => 0.011 - t * 0.003, { radial: 6, segs: 5 }), gl);
    this.lforearm = new THREE.Group();
    this.vm.add(this.lforearm);
    B.add(this.lforearm, foreGeo, foreMat);
    this.vmGeos = B.build(this.vmMat, false);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.palmGlow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), glowMat);
    this.palmGlow.position.set(0, 0.03, 0.05);
    this.lhand.add(this.palmGlow);
    this.lhandAmt = 0;
    this.trail = new Trail(this.battle.scene, 0xffffff, 16);
    this.vmState = { h: new THREE.Vector3(0.26, -0.28, -0.45), d: new THREE.Vector3(-0.25, 0.8, -0.55).normalize(), x: new THREE.Vector3(1, 0, 0) };
    this.sway = new THREE.Vector3();
    this.prevYaw = this.yaw; this.prevPitch = this.pitch;
  }

  dispose() {
    this.vm.removeFromParent();
    this.trail.mesh.removeFromParent();
    this.vmMat.dispose();
    for (const g of this.vmGeos || []) g.dispose();
  }

  // Луч из камеры через точку NDC в локальных координатах камеры.
  rayLocal(ndc, out) {
    const cam = this.camera;
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    return out.set(ndc.x * t * cam.aspect, ndc.y * t, -1).normalize();
  }

  get eye() { return _v2.set(this.pos.x, EYE + this.bob, this.pos.z); }

  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, EYE - 0.45, this.pos.z); }
  aimPoint() { return new THREE.Vector3(this.pos.x, EYE - 0.3, this.pos.z); }

  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  // Помощь в прицеливании (лёгкая): линия удара чуть сдвигается по горизонтали
  // к ближайшему врагу рядом с ней, сохраняя высоту реза. Целиться всё равно нужно самому.
  assistLine(a, b) {
    const asp = this.camera.aspect;
    let best = null, bestShift = Infinity;
    for (const t of this.battle.hostilesOf(this)) {
      if (Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) > this.wtype.reach + 1.0) continue;
      const c = t.chest().project(this.camera);
      if (c.z > 1 || Math.abs(c.x) > 1 || Math.abs(c.y) > 1) continue;
      const A = { x: a.x * asp, y: a.y }, Bp = { x: b.x * asp, y: b.y }, C = { x: c.x * asp, y: c.y };
      const dx = Bp.x - A.x, dy = Bp.y - A.y;
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      let shift = 0;
      if (Math.abs(uy) > 0.3) shift = C.x - (A.x + ux * (C.y - A.y) / uy);
      if (Math.abs(shift) < Math.abs(bestShift)) { bestShift = shift; best = { A, Bp, C, ux, uy, L }; }
    }
    if (!best || Math.abs(bestShift) > asp * 0.4) return [a, b];
    const { A, Bp, C, ux, uy, L } = best;
    A.x += bestShift; Bp.x += bestShift;
    const tc = (C.x - A.x) * ux + (C.y - A.y) * uy;
    const margin = 0.3;
    if (tc < margin) { A.x -= ux * (margin - tc); A.y -= uy * (margin - tc); }
    if (tc > L - margin) { Bp.x += ux * (tc - L + margin); Bp.y += uy * (tc - L + margin); }
    return [{ x: A.x / asp, y: A.y }, { x: Bp.x / asp, y: Bp.y }];
  }

  assistPoint(p) {
    let best = null, bd = 0.35;
    for (const t of this.battle.hostilesOf(this)) {
      const c = t.chest().project(this.camera);
      if (c.z > 1) continue;
      const d = Math.abs(p.x - c.x) * this.camera.aspect;
      if (d < bd && Math.abs(p.y - c.y) < 0.6) { bd = d; best = c; }
    }
    if (!best) return p;
    return { x: best.x + (p.x - best.x) * 0.3, y: p.y };
  }

  // ===== Действия =====
  startSwing(a, b, speed) {
    if (this.dead) return;
    if (!this.canAct()) { this.buffer = { kind: 'swing', a, b, speed, t: 0 }; return; }
    [a, b] = this.assistLine(a, b);
    const tired = this.stamina < this.wtype.stamina;
    this.stamina = Math.max(0, this.stamina - this.wtype.stamina);
    const dur = this.wtype.swing * (tired ? 1.35 : 1);
    this.state = 'swing';
    this.swing = { kind: 'slash', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, t: 0, dur, hit: new Set(), prevU: 0, power: Math.min(1.2, Math.max(0.85, 0.85 + speed * 0.15)) * (tired ? 0.6 : 1), hits: 0 };
    this.blockHeld = false;
    this.battle.sound.swing(this.wtype.swing / 0.3);
    this.battle.onPlayerSwing();
    this.trail.pts = [];
  }

  startThrust(p) {
    if (this.dead) return;
    if (!this.canAct()) { this.buffer = { kind: 'thrust', p, t: 0 }; return; }
    p = this.assistPoint(p);
    const tired = this.stamina < this.wtype.stamina;
    this.stamina = Math.max(0, this.stamina - this.wtype.stamina * 0.8);
    this.state = 'swing';
    this.swing = { kind: 'thrust', a: { x: p.x, y: p.y }, b: { x: p.x, y: p.y }, t: 0, dur: this.wtype.swing * 0.95 * (tired ? 1.35 : 1), hit: new Set(), prevU: 0, power: tired ? 0.6 : 1, hits: 0 };
    this.blockHeld = false;
    this.battle.sound.swing(0.8);
    this.battle.onPlayerSwing();
    this.trail.pts = [];
  }

  canAct() {
    if (this.dead || this.staggerT > 0) return false;
    if (this.state === 'swing') return this.swing.t / this.swing.dur > 0.78;
    if (this.state === 'recoil') return false;
    return true;
  }

  // Мана за агрессию: удары клинком, парирования и убийства пополняют её.
  gainMana(v) { this.mana = Math.min(this.maxMana, this.mana + v); }

  pressBlock() { if (!this.dead) { this.blockHeld = true; this.blockStart = this.time; } }
  releaseBlock() { this.blockHeld = false; }

  get blocking() { return this.blockHeld && this.state === 'idle' && this.staggerT <= 0 && this.stamina > 0; }

  doDash(dirLocal) {
    if (this.dead || this.dash || this.staggerT > 0 || this.stamina < 18) return;
    this.stamina -= 18;
    let x = dirLocal.x, y = dirLocal.y;
    if (Math.hypot(x, y) < 0.2) { x = 0; y = -1; }
    const f = this.forward(new THREE.Vector3()), r = this.right(new THREE.Vector3());
    const dir = f.multiplyScalar(y).add(r.multiplyScalar(x)).normalize();
    this.dash = { dir, t: 0, dur: 0.22 };
    this.invuln = Math.max(this.invuln, 0.24);
    this.fovKick = 6;
    this.battle.sound.swing(0.6);
  }

  recoil(point) {
    this.state = 'recoil';
    this.stateT = 0.32;
    this.swing = null;
    this.battle.shake(0.35);
    this.recoilFrom = this.vmState.h.clone();
  }

  stagger(t) {
    this.staggerT = Math.max(this.staggerT, t);
    this.state = 'idle';
    this.swing = null;
    this.blockHeld = false;
  }

  // ===== Цель (без захвата камеры) =====
  // Враг, на которого смотрит прицел (в пределах конуса), с учётом стен.
  aimTarget(coneDeg = 20, maxDist = 30) {
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const eye = cam.position;
    const cos = Math.cos(coneDeg * Math.PI / 180);
    let best = null, bs = -Infinity;
    for (const e of this.battle.hostilesOf(this)) {
      const d = e.chest().sub(eye);
      const dist = d.length();
      if (dist > maxDist) continue;
      const dot = d.divideScalar(dist).dot(fwd);
      if (dot < cos) continue;
      if (this.battle.hazards && this.battle.hazards.losBlocked(this.pos, e.pos)) continue;
      const sc = dot * 10 - dist * 0.05;
      if (sc > bs) { bs = sc; best = e; }
    }
    return best;
  }

  spellTarget() { return this.aimTarget(18); }

  updateAim(dt) {
    const t = this.aimTarget(28);
    if (t) { this.target = t; this.targetT = 2; }
    else {
      this.targetT = (this.targetT || 0) - dt;
      if (this.targetT <= 0 || (this.target && this.target.dead)) this.target = null;
    }
    if (this.target && this.target.dead) this.target = null;
  }

  // Быстрый разворот к ближайшему врагу (одноразовый, без привязки).
  quickTurn() {
    const list = this.battle.hostilesOf(this);
    if (!list.length) return;
    const cur = this.aimTarget(25);
    const cands = list.filter((e) => e !== cur);
    const pool = cands.length ? cands : list;
    pool.sort((a, b) => Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) - Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z));
    const e = pool[0];
    const tp = e.chest();
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z;
    this.turnTo = { yaw: Math.atan2(-dx, -dz), pitch: Math.max(-0.5, Math.min(0.2, Math.atan2(tp.y - EYE, Math.max(0.8, Math.hypot(dx, dz))))) };
  }

  pickTarget() { this.updateAim(0); }

  // ===== Обновление =====
  update(dt, input) {
    this.time += dt;
    const B = this.battle;
    if (this.dead) { this.updateDeath(dt); return; }
    // регенерация
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * dt);
    const stRegen = (this.blocking ? 0.25 : 1) * (this.state === 'swing' ? 0.3 : 1);
    this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * stRegen * dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.staggerT = Math.max(0, this.staggerT - dt);
    this.backstabT = Math.max(0, this.backstabT - dt);
    this.blood = Math.max(0, this.blood - dt * 0.02);
    if (this.shield) {
      this.shield.t -= dt;
      if (this.shield.t <= 0 || this.shield.hp <= 0) { this.shield = null; B.ui.shield(false); }
    }
    // свободный обзор: палец/мышь/стрелки
    const lk = input.look;
    if (lk.x || lk.y) {
      const sens = (lk.mouse ? 0.0023 : 0.0052) * (B.save.settings.sens || 1);
      this.yaw -= lk.x * sens;
      this.pitch -= lk.y * sens * 0.85;
      this.pitch = Math.max(-1.1, Math.min(0.9, this.pitch));
      lk.x = 0; lk.y = 0;
      this.turnTo = null;
    }

    // движение
    const mv = input.move;
    const f = this.forward(new THREE.Vector3()), r = this.right(new THREE.Vector3());
    let spd = this.speed * (this.slowT > 0 ? 0.5 : 1) * (this.blocking ? 0.55 : 1) * (this.state === 'swing' ? 0.6 : 1) * (this.staggerT > 0 ? 0.3 : 1);
    const want = f.multiplyScalar(mv.y).add(r.multiplyScalar(mv.x));
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(spd);
    const acc = 1 - Math.exp(-dt * 14);
    this.vel.x += (want.x - this.vel.x) * acc;
    this.vel.z += (want.z - this.vel.z) * acc;
    if (this.dash) {
      this.dash.t += dt;
      const k = 1 - this.dash.t / this.dash.dur;
      this.pos.addScaledVector(this.dash.dir, 13 * Math.max(0, k) * dt * 1.6);
      if (this.dash.t >= this.dash.dur) this.dash = null;
    }
    if (this.knock) {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.exp(-dt * 6));
      if (this.knock.lengthSq() < 0.05) this.knock = null;
    }
    this.pos.addScaledVector(this.vel, dt);
    // столкновения
    for (const e of B.enemies) {
      if (e.dead || e.ch.mode === 'ragdoll') continue;
      const d = _v.subVectors(this.pos, e.pos); d.y = 0;
      const L = d.length(), min = 0.7 * e.ch.scale;
      if (L < min && L > 1e-4) this.pos.addScaledVector(d, (min - L) / L);
    }
    if (B.hazards) { B.hazards.collide(this.pos, 0.6); B.hazards.collide(this.pos, 0.6); }
    const rr = Math.hypot(this.pos.x, this.pos.z), lim = ARENA_R - 0.45;
    if (rr > lim) { this.pos.x *= lim / rr; this.pos.z *= lim / rr; }
    // покачивание при ходьбе
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase = (this.walkPhase || 0) + dt * sp * 2.2;
    const prevBob = this.bob;
    this.bob = Math.sin(this.walkPhase * 2) * 0.025 * Math.min(1, sp / 3);
    if (prevBob > -0.015 && this.bob <= -0.015 && sp > 1) B.sound.step();

    // быстрый разворот (кнопка ◎)
    if (this.turnTo) {
      let diff = this.turnTo.yaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const k = Math.min(1, dt * 12);
      this.yaw += diff * k;
      this.pitch += (this.turnTo.pitch - this.pitch) * k;
      if (Math.abs(diff) < 0.02) this.turnTo = null;
    }
    this.updateAim(dt);

    // таймеры состояний
    if (this.state === 'recoil') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'idle';
    }
    if (this.state === 'swing') this.updateSwing(dt);
    if (this.buffer) {
      this.buffer.t += dt;
      if (this.buffer.t > 0.45) this.buffer = null;
      else if (this.canAct()) {
        const b = this.buffer; this.buffer = null;
        if (b.kind === 'swing') this.startSwing(b.a, b.b, b.speed); else this.startThrust(b.p);
      }
    }
    this.blockAmt += ((this.blocking && this.time - this.blockStart > 0.1 ? 1 : 0) - this.blockAmt) * Math.min(1, dt * 18);
    this.updateCamera(dt);
    this.updateViewmodel(dt);
    // кровь на клинке медленно сохнет
    this.bloodOnBlade = Math.max(0, (this.bloodOnBlade || 0) - dt * 0.01);
    setBloodiness(this.weapon.mats, Math.min(1, this.bloodOnBlade));
  }

  updateCamera(dt) {
    const cam = this.camera;
    const B = this.battle;
    cam.position.set(this.pos.x, EYE + this.bob, this.pos.z);
    const sh = B.shakeOffset;
    cam.position.add(sh.pos);
    cam.rotation.set(this.pitch + sh.rot.x, this.yaw + sh.rot.y, sh.rot.z + this.tilt(), 'YXZ');
    this.fovKick *= Math.exp(-dt * 6);
    const fov = 72 + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  tilt() {
    // лёгкий крен при стрейфе
    const r = this.right(_v);
    const side = this.vel.x * r.x + this.vel.z * r.z;
    return -side * 0.008;
  }

  updateSwing(dt) {
    const s = this.swing;
    if (!s) { this.state = 'idle'; return; }
    s.t += dt;
    const k = s.t / s.dur;
    if (s.kind === 'slash') {
      const u0 = 0.17, u1 = 0.6;
      if (k >= u0 && s.prevU < 1) {
        const u = Math.min(1, (k - u0) / (u1 - u0));
        const ue = ease(u);
        this.battle.sweepHits(this, s, s.prevU, ue);
        s.prevU = ue;
        if (u >= 1) s.prevU = 1;
      }
    } else {
      const u0 = 0.2, u1 = 0.52;
      if (k >= u0 && k <= u1 + 0.05 && !s.done) {
        const depth = Math.min(1, (k - u0) / (u1 - u0));
        this.battle.thrustHits(this, s, depth);
        if (depth >= 1) s.done = true;
      }
    }
    if (this.swing && s.t >= s.dur) { this.state = 'idle'; this.swing = null; }
  }

  // ===== Вьюмодель =====
  swingPose(s, u, outH, outD, outX) {
    const a = s.a, b = s.b;
    const nx = a.x + (b.x - a.x) * u, ny = a.y + (b.y - a.y) * u;
    const T = this.rayLocal({ x: nx, y: ny }, new THREE.Vector3()).multiplyScalar(Math.min(1.8, this.wtype.reach * 0.75));
    outH.set(nx * 0.24 + 0.08, ny * 0.17 - 0.2, -0.42);
    outD.subVectors(T, outH).normalize();
    const ra = this.rayLocal(a, new THREE.Vector3()), rb = this.rayLocal(b, new THREE.Vector3());
    outX.subVectors(rb, ra).normalize();
  }

  updateViewmodel(dt) {
    const st = this.vmState;
    const idleH = new THREE.Vector3(0.27 + Math.sin(this.time * 1.3) * 0.005, -0.3 + Math.sin(this.time * 2.1) * 0.006 + this.bob * 0.5, -0.46);
    const idleD = new THREE.Vector3(-0.32, 0.72, -0.62).normalize();
    const idleX = new THREE.Vector3(0.3, 0.2, 0.9).normalize();
    if (this.wtype === WEAPON_TYPES.spear) { idleH.set(0.2, -0.26, -0.35); idleD.set(-0.12, 0.25, -1).normalize(); idleX.set(1, 0, 0); }
    if (this.wtype === WEAPON_TYPES.dagger) { idleD.set(-0.15, 0.6, -0.8).normalize(); }
    const blockH = new THREE.Vector3(0.05, -0.12, -0.4), blockD = new THREE.Vector3(-1, 0.22, -0.3).normalize(), blockX = new THREE.Vector3(0, 1, 0.2).normalize();
    // инерция оружия: при повороте камеры и стрейфе оружие чуть отстаёт
    let dyaw = this.yaw - this.prevYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const idt = 1 / Math.max(dt, 1e-3);
    const r0 = this.right(_v);
    const side = this.vel.x * r0.x + this.vel.z * r0.z;
    const tx = Math.max(-0.07, Math.min(0.07, dyaw * idt * 0.014 - side * 0.006));
    const ty = Math.max(-0.05, Math.min(0.05, -(this.pitch - this.prevPitch) * idt * 0.012));
    this.prevYaw = this.yaw; this.prevPitch = this.pitch;
    const sk = Math.min(1, dt * 9);
    this.sway.x += (tx - this.sway.x) * sk; this.sway.y += (ty - this.sway.y) * sk;
    idleH.x += this.sway.x; idleH.y += this.sway.y;
    idleD.x += this.sway.x * 1.6; idleD.y -= this.sway.y * 0.8; idleD.normalize();
    let H = idleH.clone(), D = idleD.clone(), X = idleX.clone();
    if (this.blockAmt > 0.01) { blockH.x += this.sway.x * 0.6; blockH.y += this.sway.y * 0.6; H.lerp(blockH, this.blockAmt); D.lerp(blockD, this.blockAmt).normalize(); X.lerp(blockX, this.blockAmt).normalize(); }
    let trail = false;
    if (this.state === 'swing' && this.swing) {
      const s = this.swing;
      const k = s.t / s.dur;
      const sh = new THREE.Vector3(), sd = new THREE.Vector3(), sx = new THREE.Vector3();
      if (s.kind === 'slash') {
        const u0 = 0.17, u1 = 0.6;
        if (k < u0) {
          this.swingPose(s, -0.12, sh, sd, sx);
          const w = easeOut(k / u0);
          H.lerp(sh, w); D.lerp(sd, w).normalize(); X.lerp(sx, w).normalize();
        } else if (k < u1) {
          const u = ease((k - u0) / (u1 - u0));
          this.swingPose(s, -0.12 + u * 1.24, sh, sd, sx);
          H.copy(sh); D.copy(sd); X.copy(sx);
          trail = true;
        } else {
          this.swingPose(s, 1.12, sh, sd, sx);
          const w = ease((k - u1) / (1 - u1));
          H.copy(sh).lerp(idleH, w); D.copy(sd).lerp(idleD, w).normalize(); X.copy(sx).lerp(idleX, w).normalize();
          trail = w < 0.3;
        }
      } else {
        const T = this.rayLocal(s.a, new THREE.Vector3()).multiplyScalar(this.wtype.reach);
        const back = new THREE.Vector3(0.18, -0.2, -0.22);
        const fwd = this.rayLocal(s.a, new THREE.Vector3()).multiplyScalar(0.62).add(new THREE.Vector3(0.1, -0.12, 0));
        const u0 = 0.2, u1 = 0.52;
        let h;
        if (k < u0) h = idleH.clone().lerp(back, easeOut(k / u0));
        else if (k < u1) { h = back.clone().lerp(fwd, easeOut((k - u0) / (u1 - u0))); trail = true; }
        else h = fwd.clone().lerp(idleH, ease((k - u1) / (1 - u1)));
        H.copy(h);
        D.subVectors(T, H).normalize();
        X.set(1, 0, 0);
        if (k >= u1) D.lerp(idleD, ease((k - u1) / (1 - u1))).normalize();
      }
    } else if (this.state === 'recoil') {
      const k = 1 - this.stateT / 0.32;
      const off = new THREE.Vector3(0.12, 0.08, 0.12).multiplyScalar(Math.sin(k * Math.PI) * 1.0);
      H.add(off);
      D.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(k * Math.PI) * 0.5);
    }
    if (this.staggerT > 0) {
      H.add(new THREE.Vector3(0.1, -0.15, 0.1).multiplyScalar(Math.min(1, this.staggerT * 2)));
    }
    st.h.copy(H); st.d.copy(D); st.x.copy(X);
    // ориентация кисти: Y = клинок, X = направление ребра
    const y = D.clone().normalize();
    const x = X.clone().addScaledVector(y, -X.dot(y));
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    _m.makeBasis(x, y, z);
    this.hand.quaternion.setFromRotationMatrix(_m);
    this.hand.position.copy(H);
    // предплечье
    const elbow = new THREE.Vector3(H.x * 0.6 + 0.18, H.y - 0.3, H.z * 0.3 + 0.12);
    this.placeLimb(this.forearm, elbow, H.clone().addScaledVector(y, -0.03));
    const shoulder = new THREE.Vector3(0.32, -0.55, 0.15);
    this.placeLimb(this.sleeve, shoulder, elbow);
    // левая рука
    const castOn = this.battle.runeMode || this.castGlow > 0.05;
    this.lhandAmt += ((castOn ? 1 : 0) - this.lhandAmt) * Math.min(1, dt * 10);
    const lh = new THREE.Vector3(-0.23 + this.sway.x * 0.5, -0.56 + this.lhandAmt * 0.43 + Math.sin(this.time * 2.3) * 0.006, -0.46);
    this.lhand.position.copy(lh);
    this.lhand.rotation.set(-0.75 + this.lhandAmt * 0.25, 0.35, 0.25 + Math.sin(this.time * 3.1) * 0.04);
    this.lhand.visible = this.lhandAmt > 0.02;
    this.lforearm.visible = this.lhand.visible;
    this.placeLimb(this.lforearm, new THREE.Vector3(-0.34, -0.9, -0.08), lh.clone().add(new THREE.Vector3(0, -0.03, 0.01)));
    this.castGlow = Math.max(0, this.castGlow - dt * 2);
    const g = Math.max(this.battle.runeMode ? 0.6 : 0, this.castGlow);
    this.palmGlow.material.opacity = g * (0.55 + Math.sin(this.time * 25) * 0.15);
    this.palmGlow.material.color.copy(this.castColor);
    this.palmGlow.scale.setScalar(0.8 + g * 1.0);
    // след клинка (мировые координаты)
    if (trail) {
      const cam = this.camera;
      cam.updateMatrixWorld();
      const L = this.weapon.length;
      const pa = new THREE.Vector3().copy(H).addScaledVector(y, L * 0.35 * this.vmScale).applyMatrix4(cam.matrixWorld);
      const pb = new THREE.Vector3().copy(H).addScaledVector(y, L * this.vmScale).applyMatrix4(cam.matrixWorld);
      this.trail.push(pa, pb);
    }
    this.trail.mat.uniforms.color.value.setHex(this.swing && this.swing.hits > 0 ? 0xff4040 : 0xdde8ff);
    this.trail.update(dt);
  }

  placeLimb(mesh, a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const L = d.length();
    mesh.position.copy(a);
    mesh.scale.set(1, L, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  // ===== Смерть =====
  die() {
    this.dead = true;
    this.deathT = 0;
    this.vm.visible = false;
    this.deathRoll = (Math.random() - 0.5) * 1.6;
  }

  updateDeath(dt) {
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 0.9);
    const cam = this.camera;
    const e = k * k;
    cam.position.set(this.pos.x, EYE - (EYE - 0.25) * e, this.pos.z);
    cam.rotation.set(this.pitch + e * 0.5, this.yaw, this.deathRoll * e, 'YXZ');
    this.trail.update(dt);
  }
}

export { EYE };
