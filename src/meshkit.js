// Набор инструментов для процедурных моделей: тела вращения с рельефом, трубки,
// деформации, вырезание оболочек и слияние деталей в один меш с цветами по вершинам.
import * as THREE from 'three';

const cache = new Map();
export function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// Гладкая интерполяция профиля [[t, r], ...] (Catmull-Rom по радиусу).
function sampleProfile(profile, t) {
  const n = profile.length;
  if (t <= profile[0][0]) return profile[0][1];
  if (t >= profile[n - 1][0]) return profile[n - 1][1];
  let i = 0;
  while (i < n - 2 && t > profile[i + 1][0]) i++;
  const p0 = profile[Math.max(0, i - 1)], p1 = profile[i], p2 = profile[i + 1], p3 = profile[Math.min(n - 1, i + 2)];
  const u = (t - p1[0]) / (p2[0] - p1[0] || 1);
  const m1 = (p2[1] - p0[1]) / ((p2[0] - p0[0]) || 1) * (p2[0] - p1[0]);
  const m2 = (p3[1] - p1[1]) / ((p3[0] - p1[0]) || 1) * (p2[0] - p1[0]);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
}

// Тело вращения вокруг оси Y.
// profile: [[y, r], ...] в абсолютных единицах (y по возрастанию).
// opts: radial, rings, sx, sz (эллипс), roundA/roundB (полусферические торцы),
//       capA/capB (плоские крышки), bulge(t, phi, y) → множитель радиуса,
//       shift(t, y) → [dx, dz] смещение оси.
export function lathe(profile, o = {}) {
  const radial = o.radial || 14, rings = o.rings || 10;
  const sx = typeof o.sx === 'number' ? o.sx : 1, sz = typeof o.sz === 'number' ? o.sz : 1;
  const y0 = profile[0][0], y1 = profile[profile.length - 1][0];
  const rows = []; // {y, r, t}
  const hemi = 4;
  const rA = profile[0][1], rB = profile[profile.length - 1][1];
  if (o.roundA) for (let k = hemi; k >= 1; k--) { const a = (k / hemi) * Math.PI / 2; rows.push({ y: y0 - rA * Math.sin(a), r: rA * Math.cos(a), t: 0 }); }
  // высоты колец: равномерные + точные «разрезы» для резких цветовых границ
  const ys = [];
  for (let i = 0; i <= rings; i++) ys.push(y0 + (y1 - y0) * (i / rings));
  if (o.cuts) {
    const eps = (y1 - y0) * 0.004;
    for (const c of o.cuts) {
      if (c <= y0 + eps * 2 || c >= y1 - eps * 2) continue;
      // убрать слишком близкие равномерные кольца
      for (let i = ys.length - 2; i >= 1; i--) if (Math.abs(ys[i] - c) < (y1 - y0) / rings * 0.3) ys.splice(i, 1);
      ys.push(c - eps, c + eps);
    }
    ys.sort((a, b) => a - b);
  }
  for (const y of ys) rows.push({ y, r: Math.max(0, sampleProfile(profile, y)), t: (y - y0) / ((y1 - y0) || 1) });
  if (o.roundB) for (let k = 1; k <= hemi; k++) { const a = (k / hemi) * Math.PI / 2; rows.push({ y: y1 + rB * Math.sin(a), r: rB * Math.cos(a), t: 1 }); }
  const pos = [], idx = [];
  // сектор по углу (phi0..phi1) — для клапанов, щитков и т. п.
  const sector = o.phi0 !== undefined;
  const cols = sector ? radial + 1 : radial;
  for (const row of rows) {
    const sh = o.shift ? o.shift(row.t, row.y) : null;
    for (let j = 0; j < cols; j++) {
      const phi = sector ? o.phi0 + (o.phi1 - o.phi0) * (j / radial) : (j / radial) * Math.PI * 2;
      const k = o.bulge ? o.bulge(row.t, phi, row.y) : 1;
      const szv = typeof o.sz === 'function' ? o.sz(row.y) : sz;
      const sxv = typeof o.sx === 'function' ? o.sx(row.y) : sx;
      pos.push(Math.cos(phi) * row.r * sxv * k + (sh ? sh[0] : 0), row.y, Math.sin(phi) * row.r * szv * k + (sh ? sh[1] : 0));
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = i * cols + (sector ? j + 1 : (j + 1) % radial), c = a + cols, d = b + cols;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (sector) {
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g0.setIndex(idx);
    g0.computeVertexNormals();
    return g0;
  }
  const cap = (rowIdx, flip) => {
    const row = rows[rowIdx];
    if (row.r < 1e-5) return;
    const sh = o.shift ? o.shift(row.t, row.y) : null;
    const ci = pos.length / 3;
    pos.push(sh ? sh[0] : 0, row.y, sh ? sh[1] : 0);
    for (let j = 0; j < radial; j++) {
      const a = rowIdx * radial + j, b = rowIdx * radial + (j + 1) % radial;
      if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  };
  if (o.capA) cap(0, true);
  if (o.capB) cap(rows.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Трубка переменного радиуса вдоль кривой (рога, хвосты, локоны, ремни).
export function tube(points, radius, o = {}) {
  const radial = o.radial || 8, segs = o.segs || 12;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  const p = new THREE.Vector3();
  const sx = o.sx ?? 1, sy = o.sy ?? 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const r = typeof radius === 'function' ? radius(t) : radius;
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a) * r * sx, cy = Math.sin(a) * r * sy;
      pos.push(p.x + N.x * cx + B.x * cy, p.y + N.y * cx + B.y * cy, p.z + N.z * cx + B.z * cy);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
    idx.push(a, b, c, b, d, c);
  }
  // крышки-точки
  const endCap = (i, flip) => {
    curve.getPointAt(i === 0 ? 0 : 1, p);
    const ci = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + (j + 1) % radial;
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  endCap(0, true); endCap(segs, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Эллипсоид (кэшируется по числу сегментов; масштаб задаётся в детали).
export function ball(w = 14, h = 10) {
  return cached(`ball${w}_${h}`, () => new THREE.SphereGeometry(1, w, h));
}

// Деформация копии геометрии: fn(v: Vector3) меняет позицию вершины.
export function deform(geo, fn) {
  const g = geo.clone();
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v, i);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Оболочка: оставить только треугольники, где test(centroid в исходных координатах) истинно,
// затем применить transform к вершинам.
export function shell(geo, test, transform = null) {
  const src = geo.index ? geo : geo.clone();
  const p = src.attributes.position;
  const index = src.index ? src.index.array : Array.from({ length: p.count }, (_, i) => i);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  const idx = [];
  for (let i = 0; i < index.length; i += 3) {
    a.fromBufferAttribute(p, index[i]); b.fromBufferAttribute(p, index[i + 1]); c.fromBufferAttribute(p, index[i + 2]);
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (test(m)) idx.push(index[i], index[i + 1], index[i + 2]);
  }
  // компактизация вершин
  const map = new Map(), pos = [], nidx = [];
  const v = new THREE.Vector3();
  for (const i of idx) {
    if (!map.has(i)) {
      v.fromBufferAttribute(p, i);
      if (transform) transform(v);
      map.set(i, pos.length / 3);
      pos.push(v.x, v.y, v.z);
    }
    nidx.push(map.get(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(nidx);
  g.computeVertexNormals();
  return g;
}

const _m4 = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// Описание детали: { geo, mat | matFn, pos:[x,y,z], scale:[x,y,z]|number, rot:[x,y,z] }
// mat: { c: THREE.Color, r: roughness, m: metalness }
// matFn(localPos: Vector3, worldPos: Vector3) → mat (для полос, окантовки и т. п.)
export function mergeParts(parts) {
  let vCount = 0, iCount = 0;
  for (const part of parts) {
    vCount += part.geo.attributes.position.count;
    iCount += part.geo.index ? part.geo.index.count : part.geo.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3), pbr = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  const local = new THREE.Vector3();
  for (const part of parts) {
    const g = part.geo;
    const P = g.attributes.position, N = g.attributes.normal;
    const sc = part.scale === undefined ? [1, 1, 1] : (typeof part.scale === 'number' ? [part.scale, part.scale, part.scale] : part.scale);
    _p.set(...(part.pos || [0, 0, 0]));
    _e.set(...(part.rot || [0, 0, 0]));
    _q.setFromEuler(_e);
    if (part.quat) _q.copy(part.quat);
    _s.set(sc[0], sc[1], sc[2]);
    _m4.compose(_p, _q, _s);
    _n3.getNormalMatrix(_m4);
    const flip = sc[0] * sc[1] * sc[2] < 0;
    for (let i = 0; i < P.count; i++) {
      local.fromBufferAttribute(P, i);
      _v.copy(local).applyMatrix4(_m4);
      pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z;
      const mat = part.matFn ? part.matFn(local, _v) : part.mat;
      col[(vo + i) * 3] = mat.c.r; col[(vo + i) * 3 + 1] = mat.c.g; col[(vo + i) * 3 + 2] = mat.c.b;
      pbr[(vo + i) * 3] = mat.r; pbr[(vo + i) * 3 + 1] = mat.m; pbr[(vo + i) * 3 + 2] = mat.e || 0;
      _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
      nor[(vo + i) * 3] = _v.x; nor[(vo + i) * 3 + 1] = _v.y; nor[(vo + i) * 3 + 2] = _v.z;
    }
    if (g.index) {
      const I = g.index.array;
      for (let i = 0; i < I.length; i += 3) {
        idx[io + i] = I[i] + vo;
        idx[io + i + 1] = I[flip ? i + 2 : i + 1] + vo;
        idx[io + i + 2] = I[flip ? i + 1 : i + 2] + vo;
      }
      io += I.length;
    } else {
      for (let i = 0; i < P.count; i += 3) {
        idx[io + i] = vo + i; idx[io + i + 1] = vo + (flip ? i + 2 : i + 1); idx[io + i + 2] = vo + (flip ? i + 1 : i + 2);
      }
      io += P.count;
    }
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export function matOf(hex, rough = 0.8, metal = 0) {
  return { c: new THREE.Color(hex), r: rough, m: metal };
}

// Сборщик деталей по группам: add(group, geo, mat, ...) → build(material) создаёт по одному мешу на группу.
export class PartBuilder {
  constructor() { this.map = new Map(); }
  add(group, geo, mat, pos = [0, 0, 0], scale = 1, rot = null) {
    if (!this.map.has(group)) this.map.set(group, []);
    const part = { geo, pos, scale };
    if (typeof mat === 'function') part.matFn = mat; else part.mat = mat;
    if (rot) part.rot = rot;
    this.map.get(group).push(part);
    return part;
  }
  build(material, shadows = true) {
    const geos = [];
    for (const [group, parts] of this.map) {
      const g = mergeParts(parts);
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = false;
      group.add(mesh);
      geos.push(g);
    }
    this.map.clear();
    return geos;
  }
}
