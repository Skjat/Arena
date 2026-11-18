// Гуманоид из сегментов: процедурная анимация (IK) + рэгдолл + расчленение.
import * as THREE from 'three';
import { Ragdoll } from './physics.js';
import { buildWeapon } from './weapons3d.js';

export const J = { HEAD: 0, NECK: 1, PELVIS: 2, LSH: 3, RSH: 4, LEL: 5, REL: 6, LHA: 7, RHA: 8, LHIP: 9, RHIP: 10, LKN: 11, RKN: 12, LFT: 13, RFT: 14 };
export const NJ = 15;

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
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function ik2(root, target, l1, l2, pole, outMid, outEnd) {
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
function orient(group, A, B, zRef, outZ) {
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

// ===== Геометрии (кэш) =====
const G = new Map();
function geo(key, fn) { if (!G.has(key)) G.set(key, fn()); return G.get(key); }
function capsule(r, len) { return geo(`cap${r.toFixed(3)}_${len.toFixed(3)}`, () => { const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.translate(0, len / 2, 0); return g; }); }
function box(w, h, d) { return geo(`box${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)); }
function sphere(r, ws = 12, hs = 8) { return geo(`sph${r}_${ws}`, () => new THREE.SphereGeometry(r, ws, hs)); }
function halfSphere(r) { return geo(`hs${r}`, () => new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)); }
function cone(r, h, s = 8) { return geo(`cone${r}_${h}_${s}`, () => new THREE.ConeGeometry(r, h, s)); }
function cyl(rt, rb, h, s = 10, open = false) { return geo(`cyl${rt}_${rb}_${h}_${s}_${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open)); }

export const FLESH_MAT = new THREE.MeshStandardMaterial({ color: 0x6a0000, roughness: 0.35, metalness: 0, emissive: 0x200000 });
const BONE_MAT = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 });
const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0x111111 });

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
    this.weaponTip = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.weaponX = new THREE.Vector3(1, 0, 0);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildMaterials();
    this.buildMeshes();
    if (opts.weaponId) this.setWeapon(opts.weaponId);
    this.capsules = [];
    this.flash = 0;
    this.tint = null; // 'frozen' | 'burn' | 'char'
    this.tintAmt = 0;
  }

  buildMaterials() {
    const L = this.look;
    const std = (color, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    this.mats = {
      skin: std(L.skin, 0.7), cloth: std(L.cloth, 0.9), pants: std(L.pants, 0.9),
      metal: std(L.metal || 0x8e949c, 0.42, 0.85), hair: std(L.hair, 0.95),
      leather: std(0x5a3a22, 0.85), dark: std(0x161616, 0.9),
      gold: std(0xc8a040, 0.35, 0.9), accent: std(L.accent || 0xa01010, 0.8)
    };
    if (L.top === 'chain') { this.mats.metal.roughness = 0.55; }
    this.matList = Object.values(this.mats);
    this.baseColors = this.matList.map((m) => m.color.clone());
  }

  addPart(seg, geom, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    seg.group.add(m);
    return m;
  }

  buildMeshes() {
    const s = this.scale, d = this.dim, L = this.look, M = this.mats, b = this.bulk;
    this.segs = {};
    for (const [name, a, bj] of SEGMENTS) {
      const g = new THREE.Group();
      g.scale.setScalar(1);
      this.group.add(g);
      this.segs[name] = { name, a, b: bj, group: g, z: new THREE.Vector3(0, 0, 1), attached: true, caps: [] };
    }
    const S = this.segs;
    const top = L.top || 'tunic';
    const armored = top === 'plate' || top === 'chain';
    // ---- Торс ----
    const torsoMat = top === 'bare' ? M.skin : top === 'plate' ? M.metal : top === 'chain' ? M.metal : top === 'leather' ? M.leather : M.cloth;
    const tw = 0.36 * s * b, th = d.spine, tdp = 0.21 * s * b;
    // грудь — сужающийся «бочонок», живот, таз
    const chest = geo('chest', () => { const g = new THREE.CylinderGeometry(0.5, 0.37, 1, 10, 1); g.scale(1, 1, 0.58); return g; });
    const belly = geo('belly', () => { const g = new THREE.CylinderGeometry(0.37, 0.42, 1, 10, 1); g.scale(1, 1, 0.62); return g; });
    this.addPart(S.torso, chest, torsoMat, 0, th * 0.66, 0, tw, th * 0.6, tw);
    this.addPart(S.torso, belly, top === 'bare' ? M.skin : (top === 'plate' ? M.cloth : torsoMat), 0, th * 0.2, 0, tw, th * 0.42, tw);
    this.addPart(S.torso, cyl(0.21, 0.21, 1, 10), M.leather, 0, 0.02 * s, 0, tw * 2.15, 0.075 * s, tw * 1.35); // пояс
    this.addPart(S.torso, box(tw * 0.62, 0.05 * s, 0.02), M.gold, 0, 0.02 * s, tdp * 0.53);
    if (top === 'bare') {
      // грудные мышцы и ремень через плечо
      this.addPart(S.torso, box(tw * 0.42, 0.1 * s, 0.03), M.skin, tw * 0.22, th * 0.72, tdp * 0.5);
      this.addPart(S.torso, box(tw * 0.42, 0.1 * s, 0.03), M.skin, -tw * 0.22, th * 0.72, tdp * 0.5);
      const strap = this.addPart(S.torso, box(0.05 * s, th * 0.95, tdp * 1.06), M.leather, 0, th * 0.5, 0);
      strap.rotation.z = 0.6;
    }
    if (top === 'plate') {
      this.addPart(S.torso, chest, M.metal, 0, th * 0.7, 0.008, tw * 1.07, th * 0.5, tw * 1.1);
      this.addPart(S.torso, sphere(0.1 * s * b, 10, 6), M.metal, d.shW * 0.95, th * 0.95, 0, 1, 0.75, 1);
      this.addPart(S.torso, sphere(0.1 * s * b, 10, 6), M.metal, -d.shW * 0.95, th * 0.95, 0, 1, 0.75, 1);
    }
    if (top === 'chain') {
      this.addPart(S.torso, chest, M.metal, 0, th * 0.6, 0, tw * 1.05, th * 0.75, tw * 1.06);
    }
    if (top === 'leather') {
      this.addPart(S.torso, sphere(0.085 * s * b, 10, 6), M.leather, d.shW * 0.95, th * 0.93, 0, 1, 0.7, 1);
      this.addPart(S.torso, sphere(0.085 * s * b, 10, 6), M.leather, -d.shW * 0.95, th * 0.93, 0, 1, 0.7, 1);
      this.addPart(S.torso, box(tw * 0.5, th * 0.3, 0.03), M.cloth, 0, th * 0.65, tdp * 0.52);
    }
    if (top === 'robe') {
      this.addPart(S.torso, cyl(0.17 * s * b, 0.27 * s * b, 0.52 * s, 10, true), M.cloth, 0, -0.25 * s, 0);
      this.addPart(S.torso, box(tw * 0.25, th * 0.9, 0.02), M.gold, 0, th * 0.45, tdp * 0.52);
    }
    if (top === 'tunic') {
      this.addPart(S.torso, cyl(0.17 * s * b, 0.21 * s * b, 0.22 * s, 10, true), M.cloth, 0, -0.08 * s, 0);
    }
    // культи на торсе
    const stump = (seg, name, x, y, z, r = 0.06 * s) => {
      const m = this.addPart(seg, sphere(r, 8, 6), FLESH_MAT, x, y, z, 1, 0.55, 1);
      m.visible = false;
      seg.caps.push({ name, mesh: m });
      return m;
    };
    stump(S.torso, 'head', 0, th, 0, 0.065 * s);
    stump(S.torso, 'larm', d.shW, th * 0.92, 0);
    stump(S.torso, 'rarm', -d.shW, th * 0.92, 0);
    stump(S.torso, 'lleg', d.hipW, -0.02, 0, 0.075 * s);
    stump(S.torso, 'rleg', -d.hipW, -0.02, 0, 0.075 * s);

    // ---- Голова ----
    const H = S.head;
    this.addPart(H, cyl(0.05 * s * b, 0.06 * s * b, 0.12 * s), M.skin, 0, 0.05 * s, 0);
    const headY = d.neck;
    this.addPart(H, sphere(0.112 * s), M.skin, 0, headY, 0.005, 1, 1.12, 1.05);
    this.addPart(H, box(0.03 * s, 0.05 * s, 0.04 * s), M.skin, 0, headY - 0.01 * s, 0.11 * s); // нос
    this.addPart(H, box(0.026 * s, 0.018 * s, 0.01), EYE_MAT, 0.042 * s, headY + 0.025 * s, 0.104 * s);
    this.addPart(H, box(0.026 * s, 0.018 * s, 0.01), EYE_MAT, -0.042 * s, headY + 0.025 * s, 0.104 * s);
    this.addPart(H, box(0.06 * s, 0.012 * s, 0.01), EYE_MAT, 0, headY - 0.06 * s, 0.1 * s); // рот
    const helm = L.helm || 'none';
    if (helm === 'none' || helm === 'horns') this.addPart(H, halfSphere(0.12 * s), M.hair, 0, headY + 0.005, -0.01);
    if (helm === 'helm' || helm === 'cap' || helm === 'horns' || helm === 'gladiator' || helm === 'dragon') {
      const mat = helm === 'cap' ? M.leather : (helm === 'gladiator' ? M.gold : M.metal);
      this.addPart(H, halfSphere(0.13 * s), mat, 0, headY + 0.01, 0);
      if (helm !== 'cap') this.addPart(H, box(0.022 * s, 0.09 * s, 0.02 * s), mat, 0, headY + 0.0, 0.125 * s);
    }
    if (helm === 'gladiator') {
      this.addPart(H, box(0.03 * s, 0.1 * s, 0.26 * s), M.accent, 0, headY + 0.15 * s, -0.01);
      this.addPart(H, box(0.02 * s, 0.1 * s, 0.07 * s), M.gold, 0.11 * s, headY - 0.04 * s, 0.05 * s);
      this.addPart(H, box(0.02 * s, 0.1 * s, 0.07 * s), M.gold, -0.11 * s, headY - 0.04 * s, 0.05 * s);
    }
    if (helm === 'horns' || helm === 'dragon') {
      const hornMat = helm === 'dragon' ? M.dark : BONE_MAT;
      const h1 = this.addPart(H, cone(0.03 * s, 0.2 * s, 6), hornMat, 0.11 * s, headY + 0.1 * s, 0);
      h1.rotation.z = -0.9;
      const h2 = this.addPart(H, cone(0.03 * s, 0.2 * s, 6), hornMat, -0.11 * s, headY + 0.1 * s, 0);
      h2.rotation.z = 0.9;
    }
    if (helm === 'dragon') {
      for (let i = 0; i < 4; i++) {
        const sp = this.addPart(H, cone(0.02 * s, 0.12 * s, 5), M.accent, 0, headY + 0.12 * s - i * 0.04 * s, -0.08 * s - i * 0.02 * s);
        sp.rotation.x = -1.2;
      }
    }
    if (helm === 'knight') {
      this.addPart(H, cyl(0.135 * s, 0.13 * s, 0.27 * s, 12), M.metal, 0, headY + 0.02 * s, 0);
      this.addPart(H, box(0.18 * s, 0.018 * s, 0.02), EYE_MAT, 0, headY + 0.03 * s, 0.132 * s);
      this.addPart(H, box(0.03 * s, 0.07 * s, 0.24 * s), M.accent, 0, headY + 0.17 * s, 0);
    }
    if (helm === 'hood' || helm === 'executioner') {
      const hm = helm === 'executioner' ? M.dark : M.cloth;
      this.addPart(H, sphere(0.127 * s), hm, 0, headY + 0.012, -0.018, 1, 1.12, 1.02);
      if (helm === 'hood') { const c = this.addPart(H, cone(0.08 * s, 0.16 * s), hm, 0, headY + 0.05 * s, -0.12 * s); c.rotation.x = -1.9; }
      if (helm === 'executioner') {
        this.addPart(H, box(0.03 * s, 0.018 * s, 0.01), new THREE.MeshBasicMaterial({ color: 0xff3300 }), 0.042 * s, headY + 0.025 * s, 0.128 * s);
        this.addPart(H, box(0.03 * s, 0.018 * s, 0.01), new THREE.MeshBasicMaterial({ color: 0xff3300 }), -0.042 * s, headY + 0.025 * s, 0.128 * s);
      }
    }
    if (helm === 'mage') {
      this.addPart(H, halfSphere(0.12 * s), M.hair, 0, headY + 0.005, -0.01);
      this.addPart(H, cyl(0.24 * s, 0.24 * s, 0.015 * s, 14), M.cloth, 0, headY + 0.08 * s, 0);
      const hat = this.addPart(H, cone(0.13 * s, 0.34 * s, 10), M.cloth, 0, headY + 0.25 * s, -0.02 * s);
      hat.rotation.x = -0.18;
      // борода
      this.addPart(H, cone(0.06 * s, 0.14 * s, 6), M.hair, 0, headY - 0.12 * s, 0.07 * s, 1, 1, 0.6).rotation.x = Math.PI;
    }
    stump(H, 'headcut', 0, 0.0, 0, 0.055 * s);

    // ---- Руки ----
    const armMat = top === 'bare' || top === 'tunic' ? M.skin : (armored ? M.metal : (top === 'robe' ? M.cloth : M.skin));
    const ur = 0.052 * s * b, fr = 0.046 * s * b;
    for (const side of ['l', 'r']) {
      const up = S[side + 'upper'], fo = S[side + 'fore'];
      this.addPart(up, capsule(ur, d.upper - ur), armMat, 0, ur * 0.5, 0);
      this.addPart(fo, capsule(fr, d.fore - fr * 2), top === 'robe' ? M.cloth : (armored ? M.metal : M.skin), 0, fr, 0);
      this.addPart(fo, box(0.065 * s, 0.09 * s, 0.035 * s), armored ? M.metal : M.skin, 0, d.fore + 0.02 * s, 0.0);
      if (top === 'leather' || top === 'bare') this.addPart(fo, cyl(fr * 1.25, fr * 1.15, 0.1 * s), M.leather, 0, d.fore * 0.7, 0);
      const cap = this.addPart(up, sphere(ur * 1.1, 8, 6), FLESH_MAT, 0, 0, 0, 1, 0.5, 1); cap.visible = false; up.caps.push({ name: 'cut', mesh: cap });
      const cap2 = this.addPart(fo, sphere(fr * 1.1, 8, 6), FLESH_MAT, 0, 0, 0, 1, 0.5, 1); cap2.visible = false; fo.caps.push({ name: 'cut', mesh: cap2 });
      const ecap = this.addPart(up, sphere(ur, 8, 6), FLESH_MAT, 0, d.upper, 0, 1, 0.5, 1); ecap.visible = false; up.caps.push({ name: 'end', mesh: ecap });
    }
    // ---- Ноги ----
    const tr = 0.074 * s * Math.sqrt(b), sr = 0.056 * s * Math.sqrt(b);
    const bootMat = armored ? M.metal : M.leather;
    for (const side of ['l', 'r']) {
      const th2 = S[side + 'thigh'], sh = S[side + 'shin'];
      this.addPart(th2, capsule(tr, d.thigh - tr), M.pants, 0, tr * 0.4, 0);
      this.addPart(sh, capsule(sr, d.shin - sr * 2), M.pants, 0, sr, 0);
      this.addPart(sh, cyl(sr * 1.25, sr * 1.15, d.shin * 0.55), bootMat, 0, d.shin * 0.72, 0);
      this.addPart(sh, box(0.09 * s, 0.07 * s, 0.22 * s), bootMat, 0, d.shin + 0.02 * s, 0.05 * s);
      const c1 = this.addPart(th2, sphere(tr * 1.05, 8, 6), FLESH_MAT, 0, 0, 0, 1, 0.5, 1); c1.visible = false; th2.caps.push({ name: 'cut', mesh: c1 });
      const c2 = this.addPart(sh, sphere(sr * 1.1, 8, 6), FLESH_MAT, 0, 0, 0, 1, 0.5, 1); c2.visible = false; sh.caps.push({ name: 'cut', mesh: c2 });
      const c3 = this.addPart(th2, sphere(tr, 8, 6), FLESH_MAT, 0, d.thigh, 0, 1, 0.5, 1); c3.visible = false; th2.caps.push({ name: 'end', mesh: c3 });
    }
    // Магическое свечение в левой руке
    if (L.glow) {
      const glowMat = new THREE.MeshBasicMaterial({ color: L.glow, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
      this.handGlow = this.addPart(S.lfore, sphere(0.09 * s, 10, 8), glowMat, 0, d.fore + 0.04 * s, 0.03);
      this.handGlow.castShadow = false;
    }
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

  computeLocalPose(dt) {
    const A = this.anim, d = this.dim, P = this.local;
    this.time += dt;
    const speed = Math.hypot(A.vel.x, A.vel.z);
    const moving = speed > 0.25;
    A.phase += dt * (moving ? (2.4 + speed * 1.5) / this.scale : 0);
    const bob = moving ? Math.abs(Math.sin(A.phase)) * 0.045 * this.scale : Math.sin(this.time * 2.2) * 0.008;
    const crouch = A.crouch;
    const pelvisY = (0.9 - crouch * 0.32) * this.scale + (moving ? bob - 0.02 : bob);
    P[J.PELVIS].set(0, pelvisY, 0);
    const pelYaw = A.twist * 0.3;
    const pc = Math.cos(pelYaw), ps = Math.sin(pelYaw);
    P[J.LHIP].set(d.hipW * pc, pelvisY - 0.03 * this.scale, -d.hipW * ps);
    P[J.RHIP].set(-d.hipW * pc, pelvisY - 0.03 * this.scale, d.hipW * ps);
    // ноги
    const dirX = moving ? A.vel.x / speed : 0, dirZ = moving ? A.vel.z / speed : 0;
    const stride = Math.min(1, speed / 3.2) * 0.34 * this.scale;
    for (const side of [1, -1]) {
      const hip = side === 1 ? P[J.LHIP] : P[J.RHIP];
      const ph = A.phase + (side === 1 ? 0 : Math.PI);
      const baseZ = (side === 1 ? 0.13 : -0.1) * this.scale * (1 - Math.min(1, speed / 2));
      const baseX = side * 0.15 * this.scale;
      let fx = baseX, fz = baseZ, fy = d.foot;
      if (moving) {
        const sw = Math.sin(ph);
        fx += dirX * sw * stride;
        fz += dirZ * sw * stride;
        fy += Math.max(0, Math.cos(ph)) * 0.13 * this.scale;
      }
      const foot = side === 1 ? P[J.LFT] : P[J.RFT];
      const knee = side === 1 ? P[J.LKN] : P[J.RKN];
      _v3.set(fx, fy, fz);
      const tgt = _v3.clone();
      ik2(hip, tgt, d.thigh, d.shin, new THREE.Vector3(side * 0.15, 0, 1), knee, foot);
    }
    // корпус
    const lean = A.lean + (moving ? 0.08 : 0.04) + crouch * 0.25;
    const tw = A.twist;
    const up = new THREE.Vector3(0, d.spine, 0);
    up.applyAxisAngle(new THREE.Vector3(1, 0, 0), lean);
    up.applyAxisAngle(UP, tw);
    P[J.NECK].copy(P[J.PELVIS]).add(up);
    const tc = Math.cos(tw), ts = Math.sin(tw);
    P[J.LSH].set(P[J.NECK].x + d.shW * tc, P[J.NECK].y - 0.04 * this.scale, P[J.NECK].z - d.shW * ts);
    P[J.RSH].set(P[J.NECK].x - d.shW * tc, P[J.NECK].y - 0.04 * this.scale, P[J.NECK].z + d.shW * ts);
    // голова
    const hd = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), lean * 0.4);
    if (A.look) {
      this.dirToLocal(_v1.subVectors(A.look, this.toWorld(P[J.NECK], new THREE.Vector3())), _v2);
      _v2.normalize();
      hd.addScaledVector(_v2, 0.35).normalize();
    }
    P[J.HEAD].copy(P[J.NECK]).addScaledVector(hd, d.neck);
    // руки (IK)
    ik2(P[J.RSH], A.rh, d.upper, d.fore, new THREE.Vector3(-0.7, -0.8, -0.5), P[J.REL], P[J.RHA]);
    ik2(P[J.LSH], A.lh, d.upper, d.fore, new THREE.Vector3(0.7, -0.8, -0.4), P[J.LEL], P[J.LHA]);
    // реакция на удар
    if (A.reactT > 0) {
      const k = Math.sin(Math.min(1, A.reactT / 0.35) * Math.PI * 0.5);
      const r = A.react;
      const w = [1.0, 0.75, 0.0, 0.7, 0.7, 0.6, 0.6, 0.5, 0.5, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < NJ; i++) if (w[i]) P[i].addScaledVector(r, w[i] * k);
      A.reactT -= dt;
    }
    if (A.jitter > 0) {
      for (let i = 0; i < NJ; i++) {
        if (i === J.LFT || i === J.RFT) continue;
        P[i].x += (Math.random() - 0.5) * A.jitter;
        P[i].y += (Math.random() - 0.5) * A.jitter;
        P[i].z += (Math.random() - 0.5) * A.jitter;
      }
    }
  }

  // Обновление каждый кадр. ctx: { dt, R, events }
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
    this.updateMeshes();
    this.capsulesDirty = true;
    // эффекты материалов
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    this.applyTint();
    if (this.handGlow) {
      const target = this.castGlow || 0;
      this.handGlow.material.opacity += (target - this.handGlow.material.opacity) * Math.min(1, dt * 10);
      this.handGlow.scale.setScalar(0.6 + this.handGlow.material.opacity * 0.8 + Math.sin(this.time * 30) * 0.08 * target);
      this.handGlow.visible = this.handGlow.material.opacity > 0.02 && !this.severed.has('larm') && !this.severed.has('lfore');
    }
  }

  applyTint() {
    const fl = this.flash;
    const t = this.tint, ta = this.tintAmt;
    for (let i = 0; i < this.matList.length; i++) {
      const m = this.matList[i];
      m.color.copy(this.baseColors[i]);
      m.emissive.setRGB(fl * 0.55, fl * 0.12, fl * 0.08);
      if (t === 'frozen') {
        m.color.lerp(_v1.set(0.6, 0.85, 1.0), ta * 0.8);
        m.emissive.r += 0.05 * ta; m.emissive.g += 0.18 * ta; m.emissive.b += 0.3 * ta;
      } else if (t === 'burn') {
        m.color.multiplyScalar(1 - ta * 0.5);
        const f = (0.3 + Math.random() * 0.3) * ta;
        m.emissive.r += f; m.emissive.g += f * 0.35;
      } else if (t === 'char') {
        m.color.multiplyScalar(1 - ta * 0.85);
        const f = Math.max(0, ta - 0.6) * (0.15 + Math.random() * 0.1);
        m.emissive.r += f;
      }
    }
  }

  updateMeshes() {
    const P = this.pose;
    const fwd = this.forward(new THREE.Vector3());
    const ragdollish = this.mode === 'ragdoll';
    // торс
    const T = this.segs.torso;
    if (T.attached) {
      const left = _v1.subVectors(P[J.LSH], P[J.RSH]).add(_v2.subVectors(P[J.LHIP], P[J.RHIP]));
      const upv = _v2.subVectors(P[J.NECK], P[J.PELVIS]).normalize();
      const z = _v3.crossVectors(left, upv).normalize();
      orient(T.group, P[J.PELVIS], P[J.NECK], z.clone(), T.z);
    }
    for (const name in this.segs) {
      if (name === 'torso') continue;
      const sg = this.segs[name];
      if (!sg.attached) continue;
      const zRef = ragdollish ? sg.z : (name === 'head' ? this.headZ(fwd) : fwd);
      orient(sg.group, P[sg.a], P[sg.b], zRef, sg.z);
    }
    // оружие
    if (this.weapon && this.weaponAttached) {
      const hand = P[J.RHA];
      const dir = new THREE.Vector3();
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
      const z = new THREE.Vector3().crossVectors(this.weaponX, dir).normalize();
      const xx = new THREE.Vector3().crossVectors(dir, z);
      _m.makeBasis(xx, dir, z);
      this.weapon.group.quaternion.setFromRotationMatrix(_m);
      this.weapon.group.position.copy(hand);
    }
  }

  headZ(fwd) {
    if (!this.anim.look) return fwd;
    const d = _v3.subVectors(this.anim.look, this.pose[J.HEAD]);
    d.y *= 0.5;
    return d.normalize();
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
    this.dirToLocal(dirWorld, this.anim.react).multiplyScalar(strength);
    this.anim.react.y = Math.max(-0.05, this.anim.react.y);
    this.anim.reactT = 0.35;
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
      for (const c of this.segs.torso.caps) if (c.name === stumpName) c.mesh.visible = true;
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
    for (const c of this.segs.torso.caps) if (c.name === part) c.mesh.visible = true;
    if (this.ragdoll) this.ragdoll.c = this.ragdoll.c.filter((c) => !this.missing.has(c.a) && !this.missing.has(c.b));
  }

  hideAll() {
    this.group.visible = false;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.matList) m.dispose();
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
