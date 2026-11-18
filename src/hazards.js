// Особые арены: кислотные ямы, звери на цепях, лабиринт, шипы.
// Отвечает за визуал, урон от ловушек, навигацию и столкновения со стенами.
import * as THREE from 'three';
import { ARENA_R } from './arena.js';
import { Beast } from './beast.js';
import { J } from './character.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const WALL_T = 0.25; // половина толщины стены
const WALL_H = 2.5;
const CELL = 0.5, GN = 58, GOFF = 14.5;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ближайшая точка на отрезке (XZ).
function closestOnSeg(px, pz, w, out) {
  const dx = w.bx - w.ax, dz = w.bz - w.az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - w.ax) * dx + (pz - w.az) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  out.x = w.ax + dx * t; out.z = w.az + dz * t;
  return out;
}

function segSegDist2D(a, b, w) {
  // расстояние между отрезками a-b и стеной w (через пересечение или концы)
  const d1x = b.x - a.x, d1z = b.z - a.z, d2x = w.bx - w.ax, d2z = w.bz - w.az;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) > 1e-9) {
    const t = ((w.ax - a.x) * d2z - (w.az - a.z) * d2x) / den;
    const u = ((w.ax - a.x) * d1z - (w.az - a.z) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const o = { x: 0, z: 0 };
  let m = Infinity;
  closestOnSeg(a.x, a.z, w, o); m = Math.min(m, Math.hypot(a.x - o.x, a.z - o.z));
  closestOnSeg(b.x, b.z, w, o); m = Math.min(m, Math.hypot(b.x - o.x, b.z - o.z));
  const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z };
  closestOnSeg(w.ax, w.az, seg, o); m = Math.min(m, Math.hypot(w.ax - o.x, w.az - o.z));
  closestOnSeg(w.bx, w.bz, seg, o); m = Math.min(m, Math.hypot(w.bx - o.x, w.bz - o.z));
  return m;
}

export class Hazards {
  // ctx: { scene, fx, sound, battle|null }
  constructor(ctx, id, level = 1) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.id = id;
    this.level = level;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.walls = [];
    this.pools = [];
    this.traps = [];
    this.beasts = [];
    this.posts = [];
    this.time = 0;
    this.navCache = new Map();
    if (id === 'acid') this.buildAcid();
    if (id === 'beasts') this.buildBeasts();
    if (id === 'labyrinth') this.buildLabyrinth();
    if (id === 'spikes') this.buildSpikes();
    this.buildNavGrid();
  }

  get battle() { return this.ctx.battle; }

  // ===================== КИСЛОТА =====================
  buildAcid() {
    const defs = [[6.8, 0.85, 2.0], [6.8, 2.3, 2.0], [6.8, 3.95, 2.0], [6.8, 5.45, 2.0], [3.7, Math.PI / 2, 1.3], [3.7, Math.PI * 1.5, 1.3], [10.6, 0.0, 1.5], [10.6, Math.PI, 1.5]];
    this.acidMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = (vUv - 0.5) * 6.0;
          float r = length(vUv - 0.5) * 2.0;
          float w = n(p + vec2(time * 0.6, time * 0.4)) * 0.6 + n(p * 2.3 - time * 0.8) * 0.4;
          vec3 c = mix(vec3(0.15, 0.55, 0.05), vec3(0.65, 1.0, 0.2), w);
          c += vec3(0.4, 0.6, 0.1) * smoothstep(0.75, 0.95, w);
          float edge = smoothstep(1.0, 0.85, r);
          gl_FragColor = vec4(c * (0.9 + 0.2 * sin(time * 3.0 + r * 8.0)), edge * 0.95);
        }`,
      transparent: true, depthWrite: false
    });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2a3418, roughness: 1 });
    for (const [r, a, R] of defs) {
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 32), this.acidMat);
      disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.025, z);
      disc.renderOrder = 2;
      this.group.add(disc);
      const rim = new THREE.Mesh(new THREE.RingGeometry(R - 0.05, R + 0.3, 32), rimMat);
      rim.rotation.x = -Math.PI / 2; rim.position.set(x, 0.018, z);
      rim.receiveShadow = true;
      this.group.add(rim);
      this.pools.push({ x, z, r: R });
    }
  }

  inAcid(x, z) {
    for (const p of this.pools) if (Math.hypot(x - p.x, z - p.z) < p.r - 0.15) return p;
    return null;
  }

  updateAcid(dt) {
    this.acidMat.uniforms.time.value = this.time;
    const fx = this.ctx.fx;
    for (const p of this.pools) {
      if (Math.random() < dt * 6 * p.r) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * p.r * 0.9;
        fx.add.add({ pos: V(p.x + Math.cos(a) * rr, 0.05, p.z + Math.sin(a) * rr), vel: V(0, 0.5 + Math.random() * 0.6, 0), color: [0.5, 1, 0.2], size: 0.1 + Math.random() * 0.12, life: 0.5 });
      }
      if (Math.random() < dt * 1.5) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * p.r * 0.8;
        fx.norm.add({ pos: V(p.x + Math.cos(a) * rr, 0.1, p.z + Math.sin(a) * rr), vel: V(0, 0.6, 0), color: [0.35, 0.5, 0.2], size: 0.5, life: 1.6, grow: 2, alpha: 0.25 });
      }
    }
    const B = this.battle;
    if (!B || !B.started) return;
    const DPS = 24 + this.level * 1.2;
    // игрок
    const P = B.player;
    if (!P.dead && !P.dash && this.inAcid(P.pos.x, P.pos.z)) {
      B.damagePlayer({ amount: DPS * dt, dir: V(0, 0, 0), kind: 'acid', blockable: false, silent: true });
      this.acidTick = (this.acidTick || 0) - dt;
      if (this.acidTick <= 0) {
        this.acidTick = 0.35;
        B.ui.flash('rgba(120,255,60,0.25)');
        B.ui.hurt(0.6);
        this.ctx.sound.sizzle();
        B.haptics.pulse(1);
        if (!this.warned) { this.warned = true; B.ui.centerText('КИСЛОТА!', 'fail'); }
      }
      if (Math.random() < dt * 15) fx.norm.add({ pos: V(P.pos.x, 0.2, P.pos.z), vel: V(0, 1, 0), color: [0.4, 0.6, 0.2], size: 0.6, life: 0.8, grow: 2, alpha: 0.4 });
    }
    // бойцы и трупы
    for (const e of B.enemies) {
      const ch = e.ch;
      const pp = ch.mode === 'ragdoll' && ch.ragdoll ? ch.ragdoll.p[J.PELVIS] : e.pos;
      if (!this.inAcid(pp.x, pp.z) || pp.y > 0.9) continue;
      if (Math.random() < dt * 12) fx.norm.add({ pos: V(pp.x, 0.3, pp.z), vel: V(0, 1.2, 0), color: [0.45, 0.6, 0.2], size: 0.5, life: 1, grow: 2, alpha: 0.4 });
      if (e.dead) {
        if (ch.tint !== 'acid') { ch.tint = 'acid'; ch.tintAmt = 0; }
        ch.tintAmt = Math.min(2, ch.tintAmt + dt * 0.35);
        if (Math.random() < dt * 3) this.ctx.sound.sizzle();
        continue;
      }
      ch.tint = 'acid'; ch.tintAmt = Math.min(0.9, (ch.tintAmt || 0) + dt);
      e.acidT = (e.acidT || 0) + dt;
      if (e.acidT > 0.5) { e.acidT = 0; this.ctx.sound.sizzle(); if (Math.random() < 0.5) this.ctx.sound.voice(e.voicePitch, 'scream'); }
      B.damageEnemyMagic(e, { amount: DPS * dt, kind: 'acid', dir: V(0, 1, 0), point: pp.clone(), silent: true, hazard: 'acid' });
    }
    // гибы растворяются
    for (const g of B.loose) {
      const p0 = g.ragdoll.p[0];
      if (!this.inAcid(p0.x, p0.z) || p0.y > 0.5) continue;
      g.acid = (g.acid || 0) + dt;
      if (Math.random() < dt * 6) fx.norm.add({ pos: p0, vel: V(0, 1, 0), color: [0.4, 0.55, 0.2], size: 0.35, life: 0.8, grow: 2, alpha: 0.4 });
      const k = Math.max(0.05, 1 - g.acid / 5);
      if (g.segs) for (const s of g.segs) s.group.scale.setScalar(k);
      if (g.group) g.group.scale.setScalar(k);
    }
  }

  // ===================== ЗВЕРИ =====================
  buildBeasts() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.8, roughness: 0.5 });
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.7 });
    const angles = [1.05, 2.1, 4.2, 5.25];
    angles.forEach((a, i) => {
      const post = V(Math.sin(a) * 10.2, 0, Math.cos(a) * 10.2);
      this.posts.push({ x: post.x, z: post.z, r: 0.22 });
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 8), postMat);
      p.position.set(post.x, 0.75, post.z); p.castShadow = true;
      this.group.add(p);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12), ironMat);
      ring.position.set(post.x, 1.15, post.z); ring.rotation.x = Math.PI / 2;
      this.group.add(ring);
      // кости вокруг
      for (let k = 0; k < 7; k++) {
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3 + Math.random() * 0.25, 5), boneMat);
        const ba = Math.random() * Math.PI * 2, br = 0.6 + Math.random() * 2.5;
        bone.position.set(post.x + Math.cos(ba) * br, 0.03, post.z + Math.sin(ba) * br);
        bone.rotation.set(Math.PI / 2, 0, Math.random() * 6);
        this.group.add(bone);
      }
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), boneMat);
      skull.position.set(post.x + 0.8, 0.08, post.z - 0.5);
      this.group.add(skull);
      this.ctx.fx.decals.add(post.x + (Math.random() - 0.5), post.z + (Math.random() - 0.5), 1.6, Math.random() * 6, 0.009);
      const kind = i % 2 === 0 ? 'warg' : 'bear';
      this.beasts.push(new Beast(this.ctx, post, 4.0, kind, this.level));
    });
    // звенья цепей одним инстанс-мешем
    const linkGeo = new THREE.TorusGeometry(0.05, 0.014, 4, 8);
    linkGeo.scale(1.6, 1, 1);
    this.links = new THREE.InstancedMesh(linkGeo, ironMat, this.beasts.length * 11 * 3);
    this.links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.links.castShadow = true;
    this.links.frustumCulled = false;
    this.group.add(this.links);
  }

  updateBeasts(dt) {
    let n = 0;
    for (const b of this.beasts) {
      b.update(dt);
      const p = b.rope.p;
      for (let i = 0; i < p.length - 1; i++) {
        const d = _v.subVectors(p[i + 1], p[i]);
        const L = d.length();
        if (L < 1e-5) continue;
        d.divideScalar(L);
        for (let k = 0; k < 3; k++) {
          _q.setFromUnitVectors(X, d);
          const roll = new THREE.Quaternion().setFromAxisAngle(d, ((i * 3 + k) % 2) * Math.PI / 2);
          _q.premultiply(roll);
          _s.set(1, 1, 1);
          const pos = p[i].clone().lerp(p[i + 1], (k + 0.5) / 3);
          _m.compose(pos, _q, _s);
          this.links.setMatrixAt(n++, _m);
        }
      }
    }
    this.links.count = n;
    this.links.instanceMatrix.needsUpdate = true;
  }

  // ===================== ЛАБИРИНТ =====================
  buildLabyrinth() {
    const W = this.walls;
    const ring = (r, n, gaps, off = 0) => {
      for (let i = 0; i < n; i++) {
        if (gaps.includes(i)) continue;
        const a0 = off + (i / n) * Math.PI * 2, a1 = off + ((i + 1) / n) * Math.PI * 2;
        W.push({ ax: Math.sin(a0) * r, az: Math.cos(a0) * r, bx: Math.sin(a1) * r, bz: Math.cos(a1) * r });
      }
    };
    const radial = (deg, r0, r1) => {
      const a = deg * Math.PI / 180;
      W.push({ ax: Math.sin(a) * r0, az: Math.cos(a) * r0, bx: Math.sin(a) * r1, bz: Math.cos(a) * r1 });
    };
    ring(3.6, 8, [0, 3, 5], Math.PI / 8);
    ring(8.3, 12, [0, 3, 6, 9], Math.PI / 12);
    radial(25, 4.0, 7.9); radial(145, 4.0, 7.9); radial(265, 4.0, 7.9);
    radial(80, 8.7, 13.3); radial(200, 8.7, 13.3); radial(320, 8.7, 13.3);
    radial(105, 10.8, 13.3); radial(255, 10.8, 13.3);
    // меш: все стены в одной геометрии
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#7a6e62'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let x = -64; x < w; x += 64) {
        const v = 115 + Math.random() * 45;
        g.fillStyle = `rgb(${v + 8},${v},${v - 10})`;
        g.fillRect(x + (r % 2) * 32 + 2, r * 32 + 2, 60, 28);
      }
      const grd = g.createLinearGradient(0, h * 0.5, 0, h);
      grd.addColorStop(0, 'rgba(30,15,5,0)'); grd.addColorStop(1, 'rgba(30,15,5,0.5)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    const parts = [];
    for (const w of W) {
      const L = Math.hypot(w.bx - w.ax, w.bz - w.az) + WALL_T * 2;
      const g = new THREE.BoxGeometry(L, WALL_H, WALL_T * 2).toNonIndexed();
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 2.5, uv.getY(i));
      const m = new THREE.Matrix4().makeRotationY(-Math.atan2(w.bz - w.az, w.bx - w.ax));
      m.setPosition((w.ax + w.bx) / 2, WALL_H / 2, (w.az + w.bz) / 2);
      g.applyMatrix4(m);
      parts.push(g);
    }
    let total = 0;
    for (const g of parts) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uvs = new Float32Array(total * 2);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      uvs.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    // факелы на стенах
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    this.flames = [];
    for (let i = 0; i < W.length; i += 3) {
      const w = W[i];
      const mx = (w.ax + w.bx) / 2, mz = (w.az + w.bz) / 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 5), flameMat);
      f.position.set(mx, WALL_H + 0.15, mz);
      this.group.add(f);
      this.flames.push(f);
    }
  }

  wallDist(x, z) {
    let m = Infinity;
    const o = { x: 0, z: 0 };
    for (const w of this.walls) {
      closestOnSeg(x, z, w, o);
      m = Math.min(m, Math.hypot(x - o.x, z - o.z));
    }
    return m - WALL_T;
  }

  // Можно ли стоять в точке (стены, столбы, край арены).
  walkable(p, r = 0.5) {
    if (Math.hypot(p.x, p.z) > ARENA_R - Math.max(0.5, r)) return false;
    if (this.walls.length && this.wallDist(p.x, p.z) < r) return false;
    for (const c of this.posts) if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + r) return false;
    return true;
  }

  // Вытолкнуть круг радиуса r из стен и столбов. Возвращает true при столкновении.
  collide(pos, r) {
    let hit = false;
    for (const c of this.posts) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 1e-5) { pos.x = c.x + dx / d * min; pos.z = c.z + dz / d * min; hit = true; }
    }
    if (!this.walls.length) return hit;
    const o = { x: 0, z: 0 };
    for (const w of this.walls) {
      closestOnSeg(pos.x, pos.z, w, o);
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz), min = WALL_T + r;
      if (d < min) {
        if (d > 1e-5) { pos.x = o.x + dx / d * min; pos.z = o.z + dz / d * min; }
        else { pos.x += min; }
        hit = true;
      }
    }
    return hit;
  }

  // Для физики рэгдоллов: вернуть нормаль, если частица в стене (и вытолкнуть).
  ragdollCollide(q, r) {
    if (!this.walls.length || q.y > WALL_H + r) return null;
    const o = { x: 0, z: 0 };
    let n = null;
    for (const w of this.walls) {
      closestOnSeg(q.x, q.z, w, o);
      const dx = q.x - o.x, dz = q.z - o.z;
      const d = Math.hypot(dx, dz), min = WALL_T + r;
      if (d < min && d > 1e-5) {
        q.x = o.x + dx / d * min; q.z = o.z + dz / d * min;
        n = { x: dx / d, z: dz / d };
      }
    }
    return n;
  }

  wallNormalAt(q, r) {
    if (!this.walls.length || q.y > WALL_H + r) return null;
    const o = { x: 0, z: 0 };
    for (const w of this.walls) {
      closestOnSeg(q.x, q.z, w, o);
      const dx = q.x - o.x, dz = q.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < WALL_T + r && d > 1e-5) return { x: dx / d, z: dz / d };
    }
    return null;
  }

  losBlocked(a, b) {
    if (!this.walls.length) return false;
    for (const w of this.walls) if (segSegDist2D(a, b, w) < WALL_T * 0.6) return true;
    return false;
  }

  // Первая точка на пути a→b, упирающаяся в стену (для блинка и снарядов).
  pathClear(a, b, r = 0.4) {
    if (!this.walls.length && !this.posts.length) return b.clone();
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(L / 0.15);
    const p = a.clone();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const q = V(a.x + (b.x - a.x) * t, b.y, a.z + (b.z - a.z) * t);
      if (!this.walkable(q, r)) return p;
      p.copy(q);
    }
    return p;
  }

  pointInWall(p, r = 0.05) {
    return this.walls.length && p.y < WALL_H && this.wallDist(p.x, p.z) < r;
  }

  // ===================== НАВИГАЦИЯ =====================
  buildNavGrid() {
    this.blocked = new Uint8Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = i * CELL - GOFF + CELL / 2, z = j * CELL - GOFF + CELL / 2;
      let b = Math.hypot(x, z) > ARENA_R - 0.5;
      if (!b && this.walls.length) b = this.wallDist(x, z) < 0.35;
      this.blocked[j * GN + i] = b ? 1 : 0;
    }
  }

  cellOf(x, z) {
    const i = Math.max(0, Math.min(GN - 1, Math.floor((x + GOFF) / CELL)));
    const j = Math.max(0, Math.min(GN - 1, Math.floor((z + GOFF) / CELL)));
    return j * GN + i;
  }

  field(key, to) {
    const c = this.cellOf(to.x, to.z);
    let f = this.navCache.get(key);
    if (f && f.cell === c && this.time - f.t < 0.6) return f.dist;
    if (!f) { f = { dist: new Float32Array(GN * GN) }; this.navCache.set(key, f); }
    f.cell = c; f.t = this.time;
    const dist = f.dist;
    dist.fill(Infinity);
    const q = new Int32Array(GN * GN);
    let h = 0, tl = 0;
    dist[c] = 0; q[tl++] = c;
    while (h < tl) {
      const cur = q[h++];
      const ci = cur % GN, cj = (cur / GN) | 0;
      const d0 = dist[cur] + 1;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
        const nc = nj * GN + ni;
        if (this.blocked[nc] || dist[nc] <= d0) continue;
        dist[nc] = d0; q[tl++] = nc;
      }
    }
    return dist;
  }

  // Направление движения к цели в обход стен (null — можно идти напрямую).
  navDir(from, to, key) {
    if (!this.walls.length || !this.losBlocked(from, to)) return null;
    const dist = this.field(key, to);
    const c = this.cellOf(from.x, from.z);
    const ci = c % GN, cj = (c / GN) | 0;
    let best = -1, bd = dist[c];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
      const nc = nj * GN + ni;
      if (this.blocked[nc]) continue;
      if (di && dj && (this.blocked[cj * GN + ni] || this.blocked[nj * GN + ci])) continue;
      if (dist[nc] < bd) { bd = dist[nc]; best = nc; }
    }
    if (best < 0) return null;
    const bx = (best % GN) * CELL - GOFF + CELL / 2, bz = ((best / GN) | 0) * CELL - GOFF + CELL / 2;
    const d = V(bx - from.x, 0, bz - from.z);
    return d.lengthSq() > 1e-6 ? d.normalize() : null;
  }

  // Взгляд вперёд по пути к цели (для камеры игрока в лабиринте).
  navLookAhead(from, to, key, steps = 4) {
    if (!this.walls.length) return null;
    const dist = this.field(key, to);
    let c = this.cellOf(from.x, from.z);
    for (let k = 0; k < steps; k++) {
      const ci = c % GN, cj = (c / GN) | 0;
      let best = -1, bd = dist[c];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
        const nc = nj * GN + ni;
        if (this.blocked[nc] || dist[nc] >= bd) continue;
        if (di && dj && (this.blocked[cj * GN + ni] || this.blocked[nj * GN + ci])) continue;
        bd = dist[nc]; best = nc;
      }
      if (best < 0) break;
      c = best;
    }
    const bx = (c % GN) * CELL - GOFF + CELL / 2, bz = ((c / GN) | 0) * CELL - GOFF + CELL / 2;
    const d = V(bx - from.x, 0, bz - from.z);
    return d.lengthSq() > 0.01 ? d.normalize() : null;
  }

  // ===================== ШИПЫ =====================
  buildSpikes() {
    const spots = [[0, 0]];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; spots.push([Math.sin(a) * 5.6, Math.cos(a) * 5.6]); }
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; spots.push([Math.sin(a) * 9.8, Math.cos(a) * 9.8]); }
    const grateTex = canvasTex(64, 64, (g) => {
      g.fillStyle = '#1a1a1c'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#4a4a50';
      for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 5, 64); g.fillRect(0, i, 64, 5); }
    });
    grateTex.repeat.set(1, 1);
    const half = 1.0;
    const grateMat = new THREE.MeshStandardMaterial({ map: grateTex, metalness: 0.6, roughness: 0.6 });
    const grateGeo = new THREE.PlaneGeometry(half * 2, half * 2); grateGeo.rotateX(-Math.PI / 2);
    this.grates = new THREE.InstancedMesh(grateGeo, grateMat, spots.length);
    this.grates.receiveShadow = true;
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glows = new THREE.InstancedMesh(grateGeo, glowMat, spots.length);
    this.glows.renderOrder = 3;
    const spikeGeo = new THREE.ConeGeometry(0.07, 1.0, 6); spikeGeo.translate(0, 0.5, 0);
    this.spikeMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea6, metalness: 0.85, roughness: 0.35 });
    const per = 16;
    this.spikes = new THREE.InstancedMesh(spikeGeo, this.spikeMat, spots.length * per);
    this.spikes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * per * 3).fill(1), 3);
    this.spikes.castShadow = true;
    this.spikes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    spots.forEach(([x, z], i) => {
      _m.makeTranslation(x, 0.012, z);
      this.grates.setMatrixAt(i, _m);
      this.traps.push({ x, z, half, state: 'idle', t: 1.5 + Math.random() * 4, h: 0, idx: i, bloody: 0, offsets: Array.from({ length: per }, (_, k) => [((k % 4) - 1.5) * 0.45 + (Math.random() - 0.5) * 0.1, (Math.floor(k / 4) - 1.5) * 0.45 + (Math.random() - 0.5) * 0.1, 0.8 + Math.random() * 0.4]) });
    });
    this.group.add(this.grates, this.glows, this.spikes);
    this.spikesPer = per;
  }

  onTrap(t, x, z, pad = 0) { return Math.abs(x - t.x) < t.half + pad && Math.abs(z - t.z) < t.half + pad; }

  updateSpikes(dt) {
    const B = this.battle;
    const live = !B || B.started;
    const per = this.spikesPer;
    const col = new THREE.Color();
    for (const t of this.traps) {
      t.t -= dt;
      if (live) {
        if (t.state === 'idle' && t.t <= 0) { t.state = 'warn'; t.t = 0.95; if (B) this.nearSound(t, 'click'); }
        else if (t.state === 'warn' && t.t <= 0) { t.state = 'up'; t.t = 0.75; this.fireTrap(t); }
        else if (t.state === 'up' && t.t <= 0) { t.state = 'down'; t.t = 0.4; }
        else if (t.state === 'down' && t.t <= 0) { t.state = 'idle'; t.t = 2.5 + Math.random() * 3.5; }
      }
      const target = t.state === 'up' ? 1 : t.state === 'down' ? Math.max(0, t.t / 0.4) : t.state === 'warn' ? 0.06 + Math.sin(this.time * 40) * 0.03 : 0;
      t.h += (target - t.h) * Math.min(1, dt * (t.state === 'up' ? 40 : 12));
      // свечение решётки
      const g = t.state === 'warn' ? (0.6 + Math.sin(this.time * 25) * 0.4) : t.state === 'up' ? 0.4 : 0;
      _m.compose(V(t.x, 0.02, t.z), _q.identity(), _s.setScalar(g > 0.01 ? 1 : 0.0001));
      this.glows.setMatrixAt(t.idx, _m);
      for (let k = 0; k < per; k++) {
        const [ox, oz, hh] = t.offsets[k];
        _m.compose(V(t.x + ox, -1.0 + t.h * (1.0 + hh * 0.3), t.z + oz), _q.identity(), _s.set(1, hh, 1));
        this.spikes.setMatrixAt(t.idx * per + k, _m);
        col.setRGB(1, 1, 1).lerp(new THREE.Color(0.45, 0.02, 0.02), Math.min(1, t.bloody));
        this.spikes.setColorAt(t.idx * per + k, col);
      }
    }
    this.glows.material.opacity = 0.35 + Math.sin(this.time * 25) * 0.2;
    this.glows.instanceMatrix.needsUpdate = true;
    this.spikes.instanceMatrix.needsUpdate = true;
    this.spikes.instanceColor.needsUpdate = true;
  }

  nearSound(t, kind) {
    const B = this.battle;
    if (!B) return;
    const d = Math.hypot(B.player.pos.x - t.x, B.player.pos.z - t.z);
    if (d > 9) return;
    if (kind === 'click') this.ctx.sound.trapClick();
    else this.ctx.sound.spikes();
  }

  fireTrap(t) {
    const B = this.battle;
    if (!B) return;
    this.nearSound(t, 'spikes');
    const fx = this.ctx.fx;
    let impaled = false;
    const P = B.player;
    if (!P.dead && this.onTrap(t, P.pos.x, P.pos.z)) {
      impaled = true;
      B.damagePlayer({ amount: 32 + this.level * 1.5, dir: V(0, 1, 0), kind: 'spikes', blockable: false, stagger: 0.4 });
      B.ui.screenBlood(0.9);
      B.shake(0.8);
      fx.blood(V(P.pos.x, 0.6, P.pos.z), V(0, 1, 0), 2, 5);
    }
    for (const e of B.enemies) {
      const ch = e.ch;
      const pp = ch.mode === 'ragdoll' && ch.ragdoll ? ch.ragdoll.p[J.PELVIS] : e.pos;
      if (!this.onTrap(t, pp.x, pp.z) || pp.y > 1.2) continue;
      impaled = true;
      const up = V((Math.random() - 0.5) * 2, 7 + Math.random() * 3, (Math.random() - 0.5) * 2);
      fx.blood(V(pp.x, 0.5, pp.z), V(0, 1, 0), 2.5, 6);
      fx.bloodBurst(V(pp.x, 0.8, pp.z), 1.2);
      if (e.dead) { if (ch.ragdoll) ch.ragdoll.impulseAll(up, 0.8); continue; }
      B.damageEnemyMagic(e, { amount: 40 + this.level * 2, kind: 'spikes', dir: V(0, 1, 0), knockdown: up, point: V(pp.x, 0.7, pp.z), hazard: 'spikes' });
    }
    for (const g of B.loose) {
      const p0 = g.ragdoll.p[0];
      if (this.onTrap(t, p0.x, p0.z) && p0.y < 0.6) g.ragdoll.impulseAll(V(0, 6, 0), 1);
    }
    for (let k = 0; k < 10; k++) fx.dust(V(t.x + (Math.random() - 0.5) * 2, 0.1, t.z + (Math.random() - 0.5) * 2), 1);
    if (impaled) { t.bloody = Math.min(1, t.bloody + 0.6); fx.decals.add(t.x, t.z, 1.8, Math.random() * 6, 0.02); }
  }

  // ===================== ИИ: обход опасностей =====================
  // Добавляет к желаемой скорости отталкивание от опасных зон.
  avoid(agent, want, speed) {
    const p = agent.pos;
    const foe = agent.foe;
    const push = (cx, cz, R, k) => {
      const dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > R || d < 1e-4) return;
      // не мешать догонять цель, если она сама в зоне — кроме кислоты и шипов
      const f = (R - d) / R;
      want.x += dx / d * speed * k * f;
      want.z += dz / d * speed * k * f;
    };
    for (const pl of this.pools) push(pl.x, pl.z, pl.r + 1.1, 2.2);
    for (const t of this.traps) if (t.state === 'warn' || t.state === 'up') push(t.x, t.z, t.half * 1.5 + 0.9, 2.5);
    for (const b of this.beasts) {
      if (b.dead) continue;
      const foeInside = foe && Math.hypot(foe.pos.x - b.post.x, foe.pos.z - b.post.z) < b.reachR;
      if (!foeInside) push(b.post.x, b.post.z, b.reachR + 0.6, 1.4);
    }
    const L = Math.hypot(want.x, want.z);
    if (L > speed) { want.x *= speed / L; want.z *= speed / L; }
  }

  // Свободно ли место для появления.
  isFree(x, z) {
    if (Math.hypot(x, z) > ARENA_R - 1.2) return false;
    for (const c of this.posts) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.8) return false;
    if (this.walls.length && this.wallDist(x, z) < 0.8) return false;
    for (const pl of this.pools) if (Math.hypot(x - pl.x, z - pl.z) < pl.r + 1.0) return false;
    for (const t of this.traps) if (this.onTrap(t, x, z, 0.6)) return false;
    for (const b of this.beasts) if (Math.hypot(x - b.post.x, z - b.post.z) < b.reachR + 0.5) return false;
    return true;
  }

  freeNear(x, z) {
    if (this.isFree(x, z)) return V(x, 0, z);
    for (let r = 0.5; r < 9; r += 0.5) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (this.isFree(px, pz)) return V(px, 0, pz);
      }
    }
    return V(x, 0, z);
  }

  // Расстановка участников в зависимости от формата.
  spawnLayout(format, nAllies, nHostiles) {
    const out = { player: null, allies: [], hostiles: [] };
    if (format === 'ffa') {
      const n = nHostiles + 1;
      const R = this.id === 'labyrinth' ? 6.2 : 6.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = this.freeNear(Math.sin(a) * R, Math.cos(a) * R);
        if (i === 0) out.player = p; else out.hostiles.push(p);
      }
      return out;
    }
    out.player = this.freeNear(0, 5.2);
    const allyX = [-2.2, 2.2];
    for (let i = 0; i < nAllies; i++) out.allies.push(this.freeNear(allyX[i % 2], 4.6));
    const hx = nHostiles === 1 ? [0] : nHostiles === 2 ? [-1.4, 1.4] : [-2.4, 0, 2.4];
    for (let i = 0; i < nHostiles; i++) out.hostiles.push(this.freeNear(hx[i % hx.length], -4.8 - (i >= 3 ? 1.5 : 0)));
    return out;
  }

  update(dt) {
    this.time += dt;
    if (this.pools.length) this.updateAcid(dt);
    if (this.beasts.length) this.updateBeasts(dt);
    if (this.traps.length) this.updateSpikes(dt);
    if (this.flames) for (const f of this.flames) { const k = 0.85 + Math.random() * 0.3; f.scale.set(k, k * (1 + Math.random() * 0.3), k); }
  }

  dispose() {
    for (const b of this.beasts) b.dispose();
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
