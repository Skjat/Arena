// Звери на цепи: четвероногие с процедурной походкой, цепью-верёвкой и рэгдоллом.
import * as THREE from 'three';
import { Ragdoll } from './physics.js';
import { ik2, orient } from './character.js';
import { ARENA_R } from './arena.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// Суставы зверя
export const BJ = { HEAD: 0, NECK: 1, HIP: 2, TAIL: 3, SFL: 4, SFR: 5, SBL: 6, SBR: 7, KFL: 8, KFR: 9, KBL: 10, KBR: 11, FFL: 12, FFR: 13, FBL: 14, FBR: 15 };
const NB = 16;
const BONES = [
  [BJ.NECK, BJ.HIP], [BJ.NECK, BJ.SFL], [BJ.NECK, BJ.SFR], [BJ.SFL, BJ.SFR], [BJ.HIP, BJ.SBL], [BJ.HIP, BJ.SBR], [BJ.SBL, BJ.SBR],
  [BJ.SFL, BJ.SBL], [BJ.SFR, BJ.SBR], [BJ.SFL, BJ.SBR], [BJ.SFR, BJ.SBL],
  [BJ.SFL, BJ.KFL], [BJ.KFL, BJ.FFL], [BJ.SFR, BJ.KFR], [BJ.KFR, BJ.FFR], [BJ.SBL, BJ.KBL], [BJ.KBL, BJ.FBL], [BJ.SBR, BJ.KBR], [BJ.KBR, BJ.FBR],
  [BJ.NECK, BJ.HEAD], [BJ.HEAD, BJ.SFL, 0.3], [BJ.HEAD, BJ.SFR, 0.3], [BJ.HIP, BJ.TAIL], [BJ.TAIL, BJ.SBL, 0.2], [BJ.TAIL, BJ.SBR, 0.2]
];
const SEGS = [
  ['body', BJ.HIP, BJ.NECK], ['head', BJ.NECK, BJ.HEAD], ['tail', BJ.HIP, BJ.TAIL],
  ['ufl', BJ.SFL, BJ.KFL], ['lfl', BJ.KFL, BJ.FFL], ['ufr', BJ.SFR, BJ.KFR], ['lfr', BJ.KFR, BJ.FFR],
  ['ubl', BJ.SBL, BJ.KBL], ['lbl', BJ.KBL, BJ.FBL], ['ubr', BJ.SBR, BJ.KBR], ['lbr', BJ.KBR, BJ.FBR]
];

export const BEAST_KINDS = {
  warg: { name: 'Варг', fur: 0x4a4038, belly: 0x6a5a48, hp: 150, dmg: 20, speed: 7, scale: 1.05 },
  bear: { name: 'Пещерный медведь', fur: 0x2e2018, belly: 0x3e2a1e, hp: 220, dmg: 27, speed: 5.5, scale: 1.3 }
};

export class Beast {
  // ctx: { scene, fx, sound, battle|null }
  constructor(ctx, post, chainLen, kind = 'warg', level = 1) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.K = BEAST_KINDS[kind];
    this.kind = kind;
    this.name = this.K.name;
    this.isBeast = true;
    this.team = -1;
    this.post = post.clone();
    this.chainLen = chainLen;
    this.s = this.K.scale;
    this.maxHp = Math.round(this.K.hp * (1 + level * 0.05));
    this.hp = this.maxHp;
    this.dmg = this.K.dmg * (1 + level * 0.05);
    const ang = Math.atan2(-post.x, -post.z);
    this.pos = post.clone().add(V(Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(chainLen * 0.5));
    this.pos.y = 0;
    this.facing = ang;
    this.vel = V(0, 0, 0);
    this.phase = 0;
    this.time = Math.random() * 10;
    this.state = 'idle';
    this.stateT = 1 + Math.random() * 2;
    this.dead = false;
    this.flash = 0;
    this.rear = 0;
    this.jaw = 0;
    this.prey = null;
    this.lostInterest = 0;
    this.pose = Array.from({ length: NB }, () => V(0, 0, 0));
    this.local = Array.from({ length: NB }, () => V(0, 0, 0));
    this.wanderTo = null;
    this.growlT = 2 + Math.random() * 3;
    this.buildMeshes();
    this.buildChain();
    this.computePose(0.016);
    this.updateMeshes();
  }

  buildMeshes() {
    const s = this.s, K = this.K;
    const std = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    this.mats = { fur: std(K.fur), belly: std(K.belly), dark: std(0x141010), teeth: std(0xe8e0c8, 0.5), iron: new THREE.MeshStandardMaterial({ color: 0x4a4a4e, metalness: 0.8, roughness: 0.45 }) };
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3010 });
    this.matList = [this.mats.fur, this.mats.belly];
    this.baseColors = this.matList.map((m) => m.color.clone());
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.segs = {};
    for (const [name, a, b] of SEGS) {
      const g = new THREE.Group();
      this.group.add(g);
      this.segs[name] = { group: g, a, b, z: V(0, 1, 0) };
    }
    const add = (seg, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
      this.segs[seg].group.add(m);
      return m;
    };
    const cap = (r, l) => { const g = new THREE.CapsuleGeometry(r, l, 3, 8); g.translate(0, l / 2, 0); return g; };
    const L = 0.95 * s;
    // тело: ось Y от бёдер к шее, Z — вверх
    add('body', cap(0.24 * s, L - 0.1 * s), this.mats.fur, 0, -0.05 * s, 0, 1, 1, 1.1);
    add('body', new THREE.SphereGeometry(0.28 * s, 10, 8), this.mats.fur, 0, L * 0.85, 0.02 * s, 1, 1, 1.12);
    add('body', new THREE.SphereGeometry(0.2 * s, 10, 8), this.mats.belly, 0, L * 0.5, -0.1 * s, 1.1, 1.6, 0.9);
    for (let i = 0; i < 6; i++) {
      const c = add('body', new THREE.ConeGeometry(0.05 * s, 0.18 * s, 5), this.mats.dark, 0, L * (0.25 + i * 0.12), 0.26 * s);
      c.rotation.x = -0.4;
    }
    // голова: ось Y от шеи к голове
    const H = 0.46 * s;
    add('head', cap(0.13 * s, H * 0.6), this.mats.fur, 0, 0, 0);
    add('head', new THREE.BoxGeometry(0.26 * s, 0.22 * s, 0.24 * s), this.mats.fur, 0, H, 0.02 * s);
    add('head', new THREE.BoxGeometry(0.15 * s, 0.22 * s, 0.12 * s), this.mats.dark, 0, H + 0.18 * s, -0.02 * s);
    this.jawMesh = add('head', new THREE.BoxGeometry(0.13 * s, 0.2 * s, 0.05 * s), this.mats.fur, 0, H + 0.15 * s, -0.09 * s);
    for (const sx of [-1, 1]) {
      add('head', new THREE.BoxGeometry(0.05 * s, 0.035 * s, 0.03 * s), this.eyeMat, sx * 0.085 * s, H + 0.06 * s, 0.11 * s);
      const ear = add('head', new THREE.ConeGeometry(0.05 * s, 0.13 * s, 4), this.mats.fur, sx * 0.09 * s, H - 0.04 * s, 0.15 * s);
      ear.rotation.x = -0.5;
      for (let t = 0; t < 2; t++) {
        const tooth = add('head', new THREE.ConeGeometry(0.012 * s, 0.05 * s, 4), this.mats.teeth, sx * (0.03 + t * 0.03) * s, H + 0.27 * s, -0.05 * s);
        tooth.rotation.x = Math.PI;
      }
    }
    // ошейник
    const collar = add('head', new THREE.TorusGeometry(0.15 * s, 0.03 * s, 6, 12), this.mats.iron, 0, 0.06 * s, 0);
    collar.rotation.x = Math.PI / 2;
    add('tail', cap(0.04 * s, 0.5 * s), this.mats.fur, 0, 0, 0);
    for (const leg of ['fl', 'fr', 'bl', 'br']) {
      add('u' + leg, cap(0.075 * s, 0.3 * s), this.mats.fur, 0, 0, 0);
      add('l' + leg, cap(0.055 * s, 0.3 * s), this.mats.fur, 0, 0, 0);
      add('l' + leg, new THREE.BoxGeometry(0.11 * s, 0.07 * s, 0.14 * s), this.mats.dark, 0, 0.37 * s, 0.03 * s);
    }
  }

  buildChain() {
    const N = 12;
    this.chainN = N;
    const top = this.post.clone().setY(1.15);
    const pts = [], vels = [], radii = [], cons = [];
    for (let i = 0; i < N; i++) {
      pts.push(top.clone().lerp(this.collarPos(V()), i / (N - 1)));
      vels.push(V(0, 0, 0)); radii.push(0.03);
      if (i) cons.push({ a: i - 1, b: i, len: this.chainLen * 1.04 / (N - 1), stiff: 1 });
    }
    const w = new Array(N).fill(1); w[0] = 0; w[N - 1] = 0;
    this.rope = new Ragdoll(pts, vels, radii, cons, w);
    this.rope.drag = 1.5;
    this.rope.friction = 0.3;
  }

  collarPos(out) {
    if (this.dead && this.ragdoll) return out.copy(this.ragdoll.p[BJ.NECK]);
    return out.copy(this.pose[BJ.NECK]).lerp(this.pose[BJ.HEAD], 0.12);
  }

  toWorld(l, out) {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    return out.set(this.pos.x + l.x * c + l.z * s, l.y, this.pos.z - l.x * s + l.z * c);
  }

  computePose(dt) {
    const s = this.s, P = this.local;
    this.time += dt;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.phase += dt * (sp > 0.3 ? 3 + sp * 1.4 : 0);
    const bob = sp > 0.3 ? Math.abs(Math.sin(this.phase)) * 0.05 * s : Math.sin(this.time * 2) * 0.01;
    const crouch = this.state === 'windup' ? 0.12 * s : 0;
    const rear = this.rear;
    const H = 0.78 * s - crouch + bob;
    P[BJ.HIP].set(0, H - 0.02 * s, -0.48 * s);
    // встать на дыбы: перед поднимается
    P[BJ.NECK].set(0, H + 0.05 * s + rear * 0.6 * s, 0.47 * s - rear * 0.25 * s);
    const lunge = this.state === 'lunge' ? 0.25 * s : 0;
    P[BJ.HEAD].copy(P[BJ.NECK]).add(V(0, 0.08 * s - lunge * 0.4 + Math.sin(this.time * 3) * 0.02, 0.4 * s + lunge));
    if (this.state === 'maul') P[BJ.HEAD].add(V(Math.sin(this.time * 18) * 0.12 * s, -0.35 * s, -0.05));
    P[BJ.TAIL].copy(P[BJ.HIP]).add(V(Math.sin(this.time * (sp > 1 ? 9 : 3)) * 0.18 * s, (this.state === 'chase' || this.state === 'windup' ? 0.1 : -0.28) * s, -0.45 * s));
    const sw = 0.15 * s;
    P[BJ.SFL].copy(P[BJ.NECK]).add(V(sw, -0.12 * s, -0.04 * s));
    P[BJ.SFR].copy(P[BJ.NECK]).add(V(-sw, -0.12 * s, -0.04 * s));
    P[BJ.SBL].copy(P[BJ.HIP]).add(V(sw * 0.9, -0.06 * s, 0));
    P[BJ.SBR].copy(P[BJ.HIP]).add(V(-sw * 0.9, -0.06 * s, 0));
    const stride = Math.min(1, sp / 4) * 0.3 * s;
    const legs = [[BJ.SFL, BJ.KFL, BJ.FFL, 0], [BJ.SFR, BJ.KFR, BJ.FFR, Math.PI], [BJ.SBL, BJ.KBL, BJ.FBL, Math.PI], [BJ.SBR, BJ.KBR, BJ.FBR, 0]];
    const lu = 0.36 * s, ll = 0.38 * s;
    for (const [sh, kn, ft, ph] of legs) {
      const base = P[sh];
      const front = sh === BJ.SFL || sh === BJ.SFR;
      let fz = base.z + (front ? 0.04 * s : -0.02 * s), fy = 0.05 * s;
      if (front && rear > 0.05) { fz = base.z + 0.25 * s * rear; fy = base.y - 0.45 * s; }
      else if (sp > 0.3) { fz += Math.sin(this.phase + ph) * stride; fy += Math.max(0, Math.cos(this.phase + ph)) * 0.13 * s; }
      const target = V(base.x * 1.05, fy, fz);
      ik2(base, target, lu, ll, V(0, 0.2, -1), P[kn], P[ft]);
    }
    for (let i = 0; i < NB; i++) this.toWorld(P[i], this.pose[i]);
  }

  updateMeshes() {
    const P = this.ragdoll && this.dead ? this.ragdoll.p : this.pose;
    const up = V(0, 1, 0);
    const fwd = V(Math.sin(this.facing), 0, Math.cos(this.facing));
    for (const name in this.segs) {
      const sg = this.segs[name];
      let zRef;
      if (this.dead) zRef = sg.z;
      else zRef = name === 'body' || name === 'tail' ? up : (name === 'head' ? up.clone().addScaledVector(fwd, -0.3) : fwd);
      orient(sg.group, P[sg.a], P[sg.b], zRef, sg.z);
    }
    this.jawMesh.rotation.x = -this.jaw * 0.6;
    this.jawMesh.position.z = -0.09 * this.s - this.jaw * 0.05;
    // вспышка при попадании
    for (let i = 0; i < this.matList.length; i++) {
      this.matList[i].color.copy(this.baseColors[i]);
      this.matList[i].emissive.setRGB(this.flash * 0.6, this.flash * 0.1, this.flash * 0.05);
    }
  }

  chest(out = V()) {
    const P = this.ragdoll && this.dead ? this.ragdoll.p : this.pose;
    return out.lerpVectors(P[BJ.NECK], P[BJ.HIP], 0.3);
  }

  getCapsules() {
    const P = this.ragdoll && this.dead ? this.ragdoll.p : this.pose, s = this.s;
    const caps = [
      { part: 'body', a: P[BJ.HIP], b: P[BJ.NECK], r: 0.3 * s },
      { part: 'head', a: P[BJ.HEAD], b: P[BJ.HEAD], r: 0.2 * s },
      { part: 'neck', a: P[BJ.NECK], b: P[BJ.HEAD], r: 0.14 * s }
    ];
    for (const [a, b] of [[BJ.SFL, BJ.FFL], [BJ.SFR, BJ.FFR], [BJ.SBL, BJ.FBL], [BJ.SBR, BJ.FBR]]) caps.push({ part: 'leg', a: P[a], b: P[b], r: 0.08 * s });
    return caps;
  }

  get reachR() { return this.chainLen + 1.4; }

  // ===== ИИ =====
  pickPrey() {
    const B = this.ctx.battle;
    if (!B) return null;
    let best = null, bd = Infinity;
    for (const c of B.combatants()) {
      if (c.dead) continue;
      if (B.hazards && c.pos && !c.isPlayer && c.ch && c.ch.mode === 'ragdoll') continue;
      const dp = Math.hypot(c.pos.x - this.post.x, c.pos.z - this.post.z);
      if (dp > this.reachR) continue;
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return best;
    if (this.lostInterest > 0) return null;
    // трупы
    for (const e of B.enemies) {
      if (!e.dead || !e.ch.group.visible || !e.ch.ragdoll) continue;
      const pel = e.ch.ragdoll.p[2];
      const dp = Math.hypot(pel.x - this.post.x, pel.z - this.post.z);
      if (dp < this.chainLen + 0.9 && e.mauled < 5) return e;
    }
    return null;
  }

  update(dt, R = ARENA_R) {
    const B = this.ctx.battle;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.jaw = Math.max(0, this.jaw - dt * 3);
    if (this.dead) {
      this.ragdoll.step(dt, R, null);
      this.updateMeshes();
      this.updateRope(dt);
      return;
    }
    this.stateT -= dt;
    this.lostInterest = Math.max(0, this.lostInterest - dt);
    this.growlT -= dt;
    if (this.growlT <= 0) { this.growlT = 3 + Math.random() * 4; if (B) this.ctx.sound.growl(this.kind === 'bear' ? 0.7 : 1); }
    const prey = this.state === 'idle' || this.state === 'chase' || this.state === 'maul' ? this.pickPrey() : this.prey;
    if (prey !== this.prey && (this.state === 'idle' || this.state === 'chase' || this.state === 'maul')) {
      this.prey = prey;
      if (prey && !prey.dead) { this.state = 'chase'; }
      else if (prey && prey.dead) { this.state = 'maul'; this.stateT = 0.6; }
      else this.state = 'idle';
    }
    let want = V(0, 0, 0);
    const speed = this.K.speed;
    const preyPos = this.prey ? (this.prey.dead && this.prey.ch ? this.prey.ch.ragdoll.p[2] : this.prey.pos) : null;
    const toPrey = preyPos ? V(preyPos.x - this.pos.x, 0, preyPos.z - this.pos.z) : null;
    const dPrey = toPrey ? toPrey.length() : 99;
    this.rear = Math.max(0, this.rear - dt * 3);
    switch (this.state) {
      case 'idle': {
        if (!this.wanderTo || this.stateT <= 0) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * this.chainLen * 0.8;
          this.wanderTo = this.post.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
          this.stateT = 2 + Math.random() * 3;
        }
        const d = V(this.wanderTo.x - this.pos.x, 0, this.wanderTo.z - this.pos.z);
        if (d.length() > 0.4) want.copy(d.normalize()).multiplyScalar(1.3);
        break;
      }
      case 'chase': {
        if (!this.prey) { this.state = 'idle'; break; }
        if (dPrey < 1.7 * this.s) { this.state = 'windup'; this.stateT = 0.42; this.ctx.sound.growl(1.3); break; }
        want.copy(toPrey).normalize().multiplyScalar(speed);
        // натянутая цепь — встаёт на дыбы и рвётся вперёд
        const dPost = Math.hypot(this.pos.x - this.post.x, this.pos.z - this.post.z);
        if (dPost > this.chainLen - 0.15) { this.rear = Math.min(1, this.rear + dt * 6); if (Math.random() < dt * 2) this.ctx.sound.chain(); }
        break;
      }
      case 'windup': {
        want.copy(toPrey || V()).setLength(0.5);
        this.jaw = Math.min(1, this.jaw + dt * 3);
        if (this.stateT <= 0) {
          this.state = 'lunge'; this.stateT = 0.2; this.bit = false;
          this.ctx.sound.roar(this.kind === 'bear' ? 0.7 : 1);
          if (toPrey) this.vel.copy(toPrey).setLength(10);
        }
        break;
      }
      case 'lunge': {
        this.jaw = 1;
        if (!this.bit && dPrey < 1.75 * this.s && this.prey && !this.prey.dead) { this.bit = true; this.bite(this.prey, toPrey.clone().normalize()); }
        if (this.stateT <= 0) { this.state = 'recover'; this.stateT = 0.75; }
        break;
      }
      case 'recover': case 'stagger': {
        if (this.stateT <= 0) this.state = this.prey ? 'chase' : 'idle';
        break;
      }
      case 'maul': {
        if (!this.prey || !this.prey.dead) { this.state = 'idle'; break; }
        if (dPrey > 1.2) want.copy(toPrey).normalize().multiplyScalar(speed * 0.6);
        else if (this.stateT <= 0) {
          this.stateT = 0.8;
          this.jaw = 1;
          if (B) B.beastMaul(this, this.prey);
          this.prey.mauled = (this.prey.mauled || 0) + 1;
          if (this.prey.mauled >= 5) { this.lostInterest = 8; this.prey = null; this.state = 'idle'; }
        }
        break;
      }
    }
    // движение
    if (this.state !== 'lunge') {
      const acc = 1 - Math.exp(-dt * 8);
      this.vel.x += (want.x - this.vel.x) * acc;
      this.vel.z += (want.z - this.vel.z) * acc;
    } else this.vel.multiplyScalar(Math.exp(-dt * 3));
    this.pos.addScaledVector(this.vel, dt);
    // цепь не пускает дальше
    const dx = this.pos.x - this.post.x, dz = this.pos.z - this.post.z;
    const dp = Math.hypot(dx, dz);
    if (dp > this.chainLen) {
      this.pos.x = this.post.x + dx / dp * this.chainLen;
      this.pos.z = this.post.z + dz / dp * this.chainLen;
      if (this.state === 'lunge') { this.vel.multiplyScalar(0.2); this.rear = 1; this.ctx.sound.chain(); }
    }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > R - 0.8) { this.pos.x *= (R - 0.8) / r; this.pos.z *= (R - 0.8) / r; }
    if (B && B.player && !B.player.dead) {
      const pd = _v.set(this.pos.x - B.player.pos.x, 0, this.pos.z - B.player.pos.z);
      const L = pd.length();
      if (L < 0.9 * this.s && L > 1e-4) this.pos.addScaledVector(pd, (0.9 * this.s - L) / L);
    }
    // поворот
    const look = toPrey && this.state !== 'idle' ? toPrey : (this.vel.lengthSq() > 0.05 ? this.vel : null);
    if (look) {
      let diff = Math.atan2(look.x, look.z) - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * (this.state === 'lunge' ? 2 : 8));
    }
    this.computePose(dt);
    this.updateMeshes();
    this.updateRope(dt);
  }

  bite(prey, dir) {
    const B = this.ctx.battle;
    if (!B) return;
    if (prey.isPlayer) {
      B.damagePlayer({ amount: this.dmg, dir, source: this, kind: 'melee', blockable: true, knock: 5 });
    } else {
      B.beastBite(this, prey, dir);
    }
  }

  stagger(t) {
    if (this.dead) return;
    this.state = 'stagger'; this.stateT = t;
    this.vel.set(0, 0, 0);
    this.ctx.sound.yelp();
  }

  hurt(dmg, dir) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flash = 1;
    this.vel.addScaledVector(dir, 2);
    if (this.hp <= 0) { this.die(dir); return true; }
    if (Math.random() < 0.4) this.ctx.sound.yelp();
    if (dmg > this.maxHp * 0.15 && this.state !== 'lunge') this.stagger(0.4);
    return false;
  }

  die(dir) {
    this.dead = true;
    this.state = 'dead';
    const cons = [];
    for (const [a, b, st] of BONES) cons.push({ a, b, len: this.pose[a].distanceTo(this.pose[b]), stiff: st || 1 });
    const vel = this.pose.map(() => dir.clone().multiplyScalar(3).add(V(0, 2, 0)));
    const radii = this.pose.map((_, i) => (i === BJ.NECK || i === BJ.HIP ? 0.2 : 0.07) * this.s);
    const pos = this.pose.map((p, i) => { const q = p.clone(); if (q.y < radii[i]) q.y = radii[i]; return q; });
    this.ragdoll = new Ragdoll(pos, vel, radii, cons);
    for (const sg of Object.values(this.segs)) sg.z.set(0, 1, 0);
    this.eyeMat.color.setHex(0x220000);
    this.ctx.sound.yelp();
  }

  updateRope(dt) {
    const rp = this.rope;
    const N = this.chainN;
    rp.p[0].set(this.post.x, 1.15, this.post.z);
    this.collarPos(rp.p[N - 1]);
    rp.asleep = false;
    rp.step(Math.min(dt, 1 / 30), ARENA_R, null);
    rp.p[0].set(this.post.x, 1.15, this.post.z);
    this.collarPos(rp.p[N - 1]);
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
