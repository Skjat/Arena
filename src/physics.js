// Простая физика рэгдоллов (Position Based Dynamics): частицы + дистанционные ограничения.
import * as THREE from 'three';

export const GRAVITY = 13.5;

export class Ragdoll {
  // positions/velocities: массивы Vector3; radii: массив радиусов; constraints: [{a,b,len,stiff,min}]
  constructor(positions, velocities, radii, constraints, invMass = null) {
    this.n = positions.length;
    this.p = positions.map((v) => v.clone());
    this.v = velocities.map((v) => v.clone());
    this.old = positions.map((v) => v.clone());
    this.r = radii.slice();
    this.w = invMass ? invMass.slice() : new Array(this.n).fill(1);
    this.c = constraints;
    this.age = 0;
    this.still = 0;
    this.asleep = false;
    this.friction = 0.14;
    this.bounce = 0.25;
    this.drag = 0.4;
  }

  impulse(i, vel) {
    this.v[i].add(vel);
    this.asleep = false; this.still = 0;
  }

  impulseAll(vel, scale = 1) {
    for (let i = 0; i < this.n; i++) this.v[i].addScaledVector(vel, scale);
    this.asleep = false; this.still = 0;
  }

  speed() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.v[i].length();
    return s / this.n;
  }

  center(out) {
    out.set(0, 0, 0);
    for (let i = 0; i < this.n; i++) out.add(this.p[i]);
    return out.divideScalar(this.n);
  }

  // R — радиус арены. events — массив для событий удара (стена/земля).
  step(dt, R, events) {
    if (this.asleep || dt <= 0) return;
    this.age += dt;
    const sub = dt > 1 / 70 ? 2 : 1;
    const h = dt / sub;
    const p = this.p, v = this.v, old = this.old, r = this.r;
    const damp = Math.exp(-this.drag * h);
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < this.n; i++) {
        v[i].y -= GRAVITY * h;
        v[i].multiplyScalar(damp);
        old[i].copy(p[i]);
        p[i].addScaledVector(v[i], h);
      }
      // События удара (по скорости до коррекции).
      if (events) {
        for (let i = 0; i < this.n; i++) {
          if (p[i].y < r[i] && v[i].y < -5) events.push({ type: 'ground', speed: -v[i].y, i, pos: p[i].clone() });
          const d = Math.hypot(p[i].x, p[i].z);
          if (d > R - r[i]) {
            const radial = (v[i].x * p[i].x + v[i].z * p[i].z) / (d || 1);
            if (radial > 5) events.push({ type: 'wall', speed: radial, i, pos: p[i].clone() });
          }
        }
      }
      for (let it = 0; it < 5; it++) {
        for (const c of this.c) {
          const a = p[c.a], b = p[c.b];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (len < 1e-6) continue;
          if (c.min && len >= c.len) continue;
          const wa = this.w[c.a], wb = this.w[c.b], ws = wa + wb;
          if (ws === 0) continue;
          const diff = ((len - c.len) / len) * (c.stiff ?? 1);
          const ka = diff * (wa / ws), kb = diff * (wb / ws);
          a.x += dx * ka; a.y += dy * ka; a.z += dz * ka;
          b.x -= dx * kb; b.y -= dy * kb; b.z -= dz * kb;
        }
        for (let i = 0; i < this.n; i++) {
          const q = p[i];
          if (q.y < r[i]) q.y = r[i];
          const d = Math.hypot(q.x, q.z);
          const lim = R - r[i];
          if (d > lim) { q.x *= lim / d; q.z *= lim / d; }
        }
      }
      for (let i = 0; i < this.n; i++) {
        const q = p[i];
        // трение о землю
        if (q.y <= r[i] + 0.004) {
          q.x = old[i].x + (q.x - old[i].x) * (1 - this.friction);
          q.z = old[i].z + (q.z - old[i].z) * (1 - this.friction);
        }
        const vy = v[i].y;
        v[i].subVectors(q, old[i]).divideScalar(h);
        if (q.y <= r[i] + 0.004 && vy < -3) v[i].y = -vy * this.bounce;
        const d = Math.hypot(q.x, q.z);
        if (d >= R - r[i] - 0.002) {
          // отскок от стены
          const nx = q.x / d, nz = q.z / d;
          const radial = v[i].x * nx + v[i].z * nz;
          if (radial > -0.5) { v[i].x -= nx * (radial * 1.3 + 0.5); v[i].z -= nz * (radial * 1.3 + 0.5); }
        }
      }
    }
    const sp = this.speed();
    if (sp < 0.12 && this.age > 0.6) {
      this.still += dt;
      if (this.still > 1.2) {
        this.asleep = true;
        for (const vv of this.v) vv.set(0, 0, 0);
      }
    } else this.still = 0;
  }
}
