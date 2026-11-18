// Визуальные эффекты: кровь, лужи, искры, огонь, обломки, вспышки света, следы клинка.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();

function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  blob(64, 64, 30);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 36;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + Math.random() * 10 * (1 - d / 70));
  }
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    g.lineWidth = 2 + Math.random() * 4;
    g.strokeStyle = '#fff';
    g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function softDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ===== Капли крови (инстансы, вытянутые по скорости) =====
class BloodDrops {
  constructor(scene, decals, cap = 900) {
    this.cap = cap;
    const geo = new THREE.IcosahedronGeometry(0.014, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x700000, roughness: 0.12, metalness: 0.0, emissive: 0x160000 });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
    this.decals = decals;
  }
  spawn(pos, dir, count, speed = 4, spread = 0.5, size = 1) {
    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.cap) this.items.shift();
      const v = new THREE.Vector3(
        dir.x + (Math.random() - 0.5) * spread * 2,
        dir.y + (Math.random() - 0.5) * spread * 2,
        dir.z + (Math.random() - 0.5) * spread * 2
      ).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.9));
      this.items.push({ p: pos.clone(), v, s: size * (0.6 + Math.random() * 1.1), life: 0 });
    }
  }
  update(dt) {
    let n = 0;
    const out = [];
    const cam = this.camPos;
    for (const it of this.items) {
      it.life += dt;
      // капля летит в камеру — брызги на экран
      if (cam && it.life > 0.05 && it.p.distanceToSquared(cam) < 0.12) {
        if (this.onScreenHit) this.onScreenHit();
        continue;
      }
      it.v.y -= 13 * dt;
      it.v.multiplyScalar(1 - 0.6 * dt);
      it.p.addScaledVector(it.v, dt);
      const r = Math.hypot(it.p.x, it.p.z);
      if (it.p.y <= 0.01 || it.life > 3) {
        if (it.p.y <= 0.02 && Math.random() < 0.35) this.decals.add(it.p.x, it.p.z, 0.05 + it.s * 0.07 + Math.random() * 0.05);
        continue;
      }
      if (r > 13.4) {
        if (Math.random() < 0.4) this.decals.addWall(it.p, 0.08 + it.s * 0.06);
        continue;
      }
      if (this.world && this.world.walls.length && it.p.y < 2.4) {
        const n = this.world.wallNormalAt(it.p, 0.02);
        if (n) { if (Math.random() < 0.4) this.decals.addWall(it.p, 0.08 + it.s * 0.06, n); continue; }
      }
      out.push(it);
      const sp = it.v.length();
      _q.setFromUnitVectors(_up, _v.copy(it.v).divideScalar(sp || 1));
      const stretch = 1 + Math.min(2.5, sp * 0.25);
      _s.set(it.s, it.s * stretch, it.s);
      _m.compose(it.p, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.items = out;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.items = []; this.mesh.count = 0; }
}

// ===== Пятна крови на полу и стенах =====
class Decals {
  constructor(scene, cap = 420) {
    this.cap = cap;
    const tex = splatTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x5c0000, roughness: 0.25, metalness: 0.05, alphaMap: tex, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.next = 0;
    this.used = 0;
    this.pools = [];
    // стены
    const wgeo = new THREE.PlaneGeometry(1, 1);
    this.wall = new THREE.InstancedMesh(wgeo, mat, 120);
    this.wall.count = 0;
    this.wall.frustumCulled = false;
    scene.add(this.wall);
    this.wnext = 0; this.wused = 0;
  }
  add(x, z, size, rot = Math.random() * Math.PI * 2, y = 0.012) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.used = Math.min(this.cap, this.used + 1);
    _e.set(0, rot, 0);
    _q.setFromEuler(_e);
    _s.set(size, 1, size * (0.8 + Math.random() * 0.4));
    _p.set(x, y + (i % 7) * 0.0006, z);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    return i;
  }
  addWall(p, size, normal = null) {
    const i = this.wnext;
    this.wnext = (this.wnext + 1) % 120;
    this.wused = Math.min(120, this.wused + 1);
    if (normal) {
      // произвольная стена: плоскость смотрит по нормали
      _q.setFromUnitVectors(_v.set(0, 0, 1), _p.set(normal.x, 0, normal.z).normalize());
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(_v.set(0, 0, 1), Math.random() * 6));
      _s.set(size, size * (1 + Math.random()), 1);
      _p.set(p.x + normal.x * 0.02, Math.max(0.1, p.y), p.z + normal.z * 0.02);
    } else {
      const ang = Math.atan2(p.x, p.z);
      _e.set(0, ang + Math.PI, Math.random() * 6);
      _q.setFromEuler(_e);
      _s.set(size, size * (1 + Math.random()), 1);
      const r = 13.47;
      _p.set(Math.sin(ang) * r, Math.max(0.1, p.y), Math.cos(ang) * r);
    }
    _m.compose(_p, _q, _s);
    this.wall.setMatrixAt(i, _m);
    this.wall.count = this.wused;
    this.wall.instanceMatrix.needsUpdate = true;
  }
  // растущая лужа под телом
  pool(target, maxSize) {
    this.pools.push({ target, size: 0.1, max: maxSize, idx: this.add(target.x, target.z, 0.1, Math.random() * 6, 0.008), rot: Math.random() * 6, life: 0 });
  }
  update(dt) {
    for (const p of this.pools) {
      p.life += dt;
      if (p.size < p.max) {
        p.size += dt * 0.18 * (1 - p.size / p.max + 0.1);
        _e.set(0, p.rot, 0); _q.setFromEuler(_e);
        _s.set(p.size, 1, p.size);
        _p.set(p.target.x, 0.008, p.target.z);
        _m.compose(_p, _q, _s);
        this.mesh.setMatrixAt(p.idx, _m);
        this.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.pools = this.pools.filter((p) => p.life < 14);
  }
  clear() { this.used = 0; this.next = 0; this.mesh.count = 0; this.pools = []; this.wall.count = 0; this.wused = 0; this.wnext = 0; }
}

// ===== Точечные частицы (аддитивные/обычные) =====
class Particles {
  constructor(scene, cap, additive) {
    this.cap = cap;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDotTexture() }, scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        uniform float scale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.mat = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
    this.items = [];
  }
  // opts: {pos, vel, color:[r,g,b], size, life, grav, drag, grow, fade}
  add(o) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({
      p: o.pos.clone(), v: o.vel ? o.vel.clone() : new THREE.Vector3(), c: o.color, c2: o.color2 || null,
      s: o.size, life: o.life, t: 0, g: o.grav || 0, drag: o.drag || 0, grow: o.grow || 0, a: o.alpha ?? 1
    });
  }
  update(dt) {
    const out = [];
    let n = 0;
    for (const it of this.items) {
      it.t += dt;
      if (it.t >= it.life) continue;
      it.v.y -= it.g * dt;
      if (it.drag) it.v.multiplyScalar(Math.max(0, 1 - it.drag * dt));
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < 0.02 && it.g > 0) { it.p.y = 0.02; it.v.y *= -0.3; it.v.x *= 0.6; it.v.z *= 0.6; }
      out.push(it);
      const k = it.t / it.life;
      this.pos[n * 3] = it.p.x; this.pos[n * 3 + 1] = it.p.y; this.pos[n * 3 + 2] = it.p.z;
      if (it.c2) {
        this.col[n * 3] = it.c[0] + (it.c2[0] - it.c[0]) * k;
        this.col[n * 3 + 1] = it.c[1] + (it.c2[1] - it.c[1]) * k;
        this.col[n * 3 + 2] = it.c[2] + (it.c2[2] - it.c[2]) * k;
      } else { this.col[n * 3] = it.c[0]; this.col[n * 3 + 1] = it.c[1]; this.col[n * 3 + 2] = it.c[2]; }
      this.size[n] = it.s * (1 + it.grow * k);
      this.alpha[n] = it.a * (1 - k) * Math.min(1, it.t * 30);
      n++;
    }
    this.items = out;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
  clear() { this.items = []; this.geo.setDrawRange(0, 0); }
}

// ===== Куски (гор, лёд, камни) =====
class Chunks {
  constructor(scene, cap = 220) {
    this.cap = cap;
    // неровный комок вместо кубика
    const geo = new THREE.IcosahedronGeometry(0.62, 1);
    {
      const p = geo.attributes.position;
      const seen = new Map();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        if (!seen.has(key)) seen.set(key, 0.72 + Math.random() * 0.5);
        const k = seen.get(key);
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
      }
      geo.computeVertexNormals();
    }
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    this.col = new THREE.Color();
  }
  add(pos, vel, size, color, opts = {}) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({
      p: pos.clone(), v: vel.clone(), s: size, c: color,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
      life: 0, max: opts.life || 12, bleed: opts.bleed || 0, rest: false, sx: 0.7 + Math.random() * 0.6
    });
  }
  update(dt, blood) {
    let n = 0;
    const out = [];
    for (const it of this.items) {
      it.life += dt;
      if (it.life > it.max) continue;
      if (!it.rest) {
        it.v.y -= 13 * dt;
        it.p.addScaledVector(it.v, dt);
        it.rot.x += it.spin.x * dt; it.rot.y += it.spin.y * dt; it.rot.z += it.spin.z * dt;
        if (it.p.y < it.s * 0.5) {
          it.p.y = it.s * 0.5;
          if (Math.abs(it.v.y) > 1.5) {
            it.v.y = -it.v.y * 0.3; it.v.x *= 0.6; it.v.z *= 0.6; it.spin.multiplyScalar(0.5);
            if (it.bleed && blood) blood.decals.add(it.p.x, it.p.z, 0.1 + it.s * 1.5);
          } else { it.rest = true; }
        }
        const r = Math.hypot(it.p.x, it.p.z);
        if (r > 13.3) { it.p.x *= 13.3 / r; it.p.z *= 13.3 / r; it.v.x *= -0.4; it.v.z *= -0.4; }
        if (it.bleed && blood && Math.random() < it.bleed * dt * 20) blood.drops.spawn(it.p, _v.set(0, 0.2, 0), 1, 1, 1, 0.6);
      }
      out.push(it);
      const shrink = it.life > it.max - 1 ? (it.max - it.life) : 1;
      _q.setFromEuler(it.rot);
      _s.set(it.s * it.sx, it.s, it.s * (2 - it.sx)).multiplyScalar(shrink);
      _m.compose(it.p, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.col.setHex(it.c);
      this.mesh.setColorAt(n, this.col);
      n++;
    }
    this.items = out;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.items = []; this.mesh.count = 0; }
}

// ===== След клинка =====
export class Trail {
  constructor(scene, color = 0xffffff, segs = 14) {
    this.segs = segs;
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(segs * 2 * 3);
    this.alp = new Float32Array(segs * 2);
    const idx = [];
    for (let i = 0; i < segs - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying float vA; void main(){ gl_FragColor = vec4(color, vA * opacity); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.geo = geo;
    this.active = false;
  }
  push(a, b) {
    this.pts.unshift([a.clone(), b.clone(), 0]);
    if (this.pts.length > this.segs) this.pts.pop();
  }
  update(dt) {
    for (const p of this.pts) p[2] += dt;
    this.pts = this.pts.filter((p) => p[2] < 0.12);
    const n = this.pts.length;
    for (let i = 0; i < this.segs; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      if (!p) { this.alp[i * 2] = 0; this.alp[i * 2 + 1] = 0; continue; }
      this.pos.set([p[0].x, p[0].y, p[0].z], i * 6);
      this.pos.set([p[1].x, p[1].y, p[1].z], i * 6 + 3);
      const a = i < n ? Math.max(0, 1 - p[2] / 0.12) * (1 - i / this.segs) : 0;
      this.alp[i * 2] = 0;
      this.alp[i * 2 + 1] = a * 0.55;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.mesh.visible = n > 1;
  }
}

// ===== Главный контейнер эффектов =====
export class FX {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.decals = new Decals(scene);
    this.drops = new BloodDrops(scene, this.decals);
    this.add = new Particles(scene, 1600, true);
    this.norm = new Particles(scene, 500, false);
    this.chunks = new Chunks(scene);
    this.emitters = [];
    // пул вспышек света (фиксированное число, чтобы не перекомпилировать шейдеры)
    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 8, 1.6);
      scene.add(l);
      this.lights.push({ light: l, t: 0, dur: 0, max: 0 });
    }
    this.lightIdx = 0;
  }

  get bloodMul() { return [0.25, 0.6, 1][this.settings.blood ?? 2] ?? 1; }

  blood(pos, dir, amount = 1, speed = 4.5) {
    const n = Math.round(14 * amount * this.bloodMul);
    this.drops.spawn(pos, dir, n, speed, 0.55, 1 + amount * 0.3);
    // туман из брызг
    for (let i = 0; i < Math.round(5 * amount * this.bloodMul); i++) {
      this.norm.add({ pos, vel: _v.copy(dir).multiplyScalar(1 + Math.random() * 1.5).add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5))), color: [0.45, 0.0, 0.0], size: 0.12 + Math.random() * 0.12, life: 0.4 + Math.random() * 0.3, grow: 2, drag: 3, alpha: 0.6 });
    }
  }

  bloodBurst(pos, amount = 2) {
    const n = Math.round(40 * amount * this.bloodMul);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.drops.spawn(pos, dir, 1, 3 + Math.random() * 5 * amount, 0.2, 1.5);
    }
    for (let i = 0; i < 12 * this.bloodMul; i++) {
      this.norm.add({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), color: [0.4, 0, 0], size: 0.3, life: 0.6, grow: 2.5, drag: 4, alpha: 0.7 });
    }
  }

  // фонтан из культи
  emitter(getPos, getDir, rate, dur, speed = 3.5) {
    this.emitters.push({ getPos, getDir, rate, dur, t: 0, acc: 0, speed });
  }

  sparks(pos, dir, count = 16, color = [1, 0.75, 0.35]) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5) * 1.6, dir.y + Math.random() * 1.2, dir.z + (Math.random() - 0.5) * 1.6).normalize().multiplyScalar(3 + Math.random() * 7);
      this.add.add({ pos, vel: v, color: [color[0] * 2.2, color[1] * 2.2, color[2] * 2.2], color2: [1.6, 0.4, 0.05], size: 0.014 + Math.random() * 0.016, life: 0.3 + Math.random() * 0.4, grav: 9, drag: 1 });
    }
    this.add.add({ pos, vel: _v.set(0, 0, 0), color: [2.5, 1.9, 1.0], size: 0.22, life: 0.09 });
    this.flashLight(pos, 0xffc070, 3, 0.12);
  }

  fire(pos, scale = 1, count = 3) {
    for (let i = 0; i < count; i++) {
      this.add.add({
        pos: _v.set(pos.x + (Math.random() - 0.5) * 0.2 * scale, pos.y + (Math.random() - 0.5) * 0.2 * scale, pos.z + (Math.random() - 0.5) * 0.2 * scale),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.5),
        color: [1.5, 0.75, 0.2], color2: [0.7, 0.08, 0.0], size: (0.13 + Math.random() * 0.14) * scale, life: 0.35 + Math.random() * 0.3, grow: -0.6, drag: 1, alpha: 0.75
      });
    }
    if (Math.random() < 0.3) this.norm.add({ pos, vel: new THREE.Vector3(0, 1.2, 0), color: [0.08, 0.06, 0.05], size: 0.3 * scale, life: 1, grow: 2, alpha: 0.5 });
  }

  explosion(pos, radius = 2.5, color = [1, 0.55, 0.15]) {
    for (let i = 0; i < 70; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize();
      this.add.add({ pos, vel: d.multiplyScalar(2 + Math.random() * radius * 3), color: [color[0] * 1.5, color[1] * 1.5, color[2] * 1.5], color2: [0.6, 0.05, 0], size: 0.3 + Math.random() * 0.4, life: 0.4 + Math.random() * 0.5, drag: 3, grow: 1, alpha: 0.7 });
    }
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5).normalize();
      this.norm.add({ pos, vel: d.multiplyScalar(1 + Math.random() * 3), color: [0.12, 0.1, 0.09], size: 0.6 + Math.random() * 0.6, life: 1.2 + Math.random(), drag: 2, grow: 2.5, alpha: 0.7 });
    }
    for (let i = 0; i < 30; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
      this.add.add({ pos, vel: d.multiplyScalar(6 + Math.random() * 8), color: [2.2, 1.5, 0.6], size: 0.028, life: 0.6 + Math.random() * 0.6, grav: 9 });
    }
    this.flashLight(pos, 0xff8833, 25, 0.5, radius * 4);
    // выжженное пятно
    if (pos.y < 1) this.decals.add(pos.x, pos.z, radius * 1.1, Math.random() * 6, 0.006);
  }

  magicBurst(pos, colorHex, count = 30, speed = 4) {
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      this.add.add({ pos, vel: d.multiplyScalar(speed * (0.3 + Math.random())), color: [c.r * 1.6, c.g * 1.6, c.b * 1.6], color2: [c.r * 0.3, c.g * 0.3, c.b * 0.5], size: 0.05 + Math.random() * 0.09, life: 0.4 + Math.random() * 0.4, drag: 2 });
    }
    this.flashLight(pos, colorHex, 6, 0.25);
  }

  // пламя факела/жаровни (вызывается каждый кадр)
  torch(pos, dt, scale = 1) {
    if (Math.random() < dt * 34) {
      this.add.add({
        pos: _v.set(pos.x + (Math.random() - 0.5) * 0.06 * scale, pos.y, pos.z + (Math.random() - 0.5) * 0.06 * scale),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.25),
        color: [1.9, 0.95, 0.25], color2: [0.9, 0.12, 0.0], size: (0.16 + Math.random() * 0.1) * scale, life: 0.3 + Math.random() * 0.25, grow: -0.7, alpha: 0.8
      });
    }
    if (Math.random() < dt * 3) this.add.add({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6), color: [2.2, 1.2, 0.3], size: 0.02, life: 0.7 + Math.random() * 0.6, grav: -0.5 });
  }

  dust(pos, count = 8) {
    for (let i = 0; i < count; i++) {
      this.norm.add({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1, (Math.random() - 0.5) * 2), color: [0.55, 0.45, 0.32], size: 0.3 + Math.random() * 0.3, life: 0.8 + Math.random() * 0.5, drag: 2.5, grow: 2, alpha: 0.5 });
    }
  }

  flashLight(pos, color, intensity, dur, dist = 8) {
    const L = this.lights[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    L.light.position.copy(pos);
    L.light.color.setHex(color);
    L.light.distance = dist;
    L.t = 0; L.dur = dur; L.max = intensity;
    L.light.intensity = intensity;
  }

  gore(pos, dir, amount = 1, colors = [0x8a0a0a, 0xc04040, 0xe8dcc0, 0x5a0000]) {
    for (let i = 0; i < Math.round(10 * amount); i++) {
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5) * 2, Math.abs(dir.y) + Math.random() * 2, dir.z + (Math.random() - 0.5) * 2).multiplyScalar(2 + Math.random() * 3);
      this.chunks.add(pos, v, 0.03 + Math.random() * 0.06, colors[Math.floor(Math.random() * colors.length)], { bleed: 0.6, life: 14 });
    }
  }

  update(dt) {
    for (const e of this.emitters) {
      e.t += dt;
      const k = Math.max(0, 1 - e.t / e.dur);
      e.acc += e.rate * k * dt * this.bloodMul;
      const pos = e.getPos();
      if (!pos) { e.t = e.dur; continue; }
      while (e.acc >= 1) {
        e.acc -= 1;
        const dir = e.getDir();
        // пульсирующий фонтан
        const pulse = 0.6 + 0.4 * Math.abs(Math.sin(e.t * 9));
        this.drops.spawn(pos, dir, 1, e.speed * pulse * (0.5 + k * 0.7), 0.18, 1.2);
      }
    }
    this.emitters = this.emitters.filter((e) => e.t < e.dur);
    this.drops.update(dt);
    this.decals.update(dt);
    this.add.update(dt);
    this.norm.update(dt);
    this.chunks.update(dt, this);
    for (const L of this.lights) {
      if (L.dur > 0) {
        L.t += dt;
        const k = Math.max(0, 1 - L.t / L.dur);
        L.light.intensity = L.max * k * k;
        if (k <= 0) L.dur = 0;
      }
    }
  }

  clear() {
    this.drops.clear(); this.decals.clear(); this.add.clear(); this.norm.clear(); this.chunks.clear();
    this.emitters = [];
    for (const L of this.lights) { L.light.intensity = 0; L.dur = 0; }
  }
}
