// Построение тела гуманоида: гладкая анатомия из тел вращения, лицо, причёски, шлемы, одежда.
// Каждый сегмент — один меш с цветами по вершинам (один материал на персонажа).
import * as THREE from 'three';
import { lathe, tube, ball, deform, shell, cached, matOf, PartBuilder, mergeParts } from './meshkit.js';
import { bodyMaterial } from './gfx.js';
import { J } from './joints.js';

export const FLESH_MAT = new THREE.MeshStandardMaterial({ color: 0x6a0000, roughness: 0.3, metalness: 0, emissive: 0x200000 });
const BONE_MAT = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.55 });
const EYE_WHITE = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.25 });
const PUPIL = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
const MOUTH = new THREE.MeshBasicMaterial({ color: 0x1a0606 });

const SEGMENTS = [
  ['torso', J.PELVIS, J.NECK], ['head', J.NECK, J.HEAD],
  ['lupper', J.LSH, J.LEL], ['lfore', J.LEL, J.LHA], ['rupper', J.RSH, J.REL], ['rfore', J.REL, J.RHA],
  ['lthigh', J.LHIP, J.LKN], ['lshin', J.LKN, J.LFT], ['rthigh', J.RHIP, J.RKN], ['rshin', J.RKN, J.RFT]
];

export const FOOT_REST = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
export const SPINE_SPLIT = 0.46;

// Голова: деформированная сфера (череп + челюсть). Единичный радиус.
function headBase() {
  return cached('headBase', () => {
    const g = new THREE.SphereGeometry(1, 26, 20);
    return deform(g, (v) => {
      const y = v.y, z = v.z;
      let x = v.x * 0.84, ny = y * 1.14, nz = z * 0.98;
      if (y < 0) {
        const k = Math.pow(-y, 1.3);
        x *= 1 - 0.3 * k;               // сужение к подбородку
        nz *= 1 - 0.1 * k;
        if (z > 0) nz += 0.1 * k * z;     // подбородок вперёд
        else nz *= 1 - 0.22 * k;          // затылок переходит в шею
      } else if (z < 0) nz *= 1.08;       // выпуклый затылок
      if (z > 0.55) nz -= (z - 0.55) * 0.3; // плоское лицо
      v.set(x, ny, nz);
    });
  });
}

const HAIR_STYLES = ['short', 'short', 'bald', 'long', 'mohawk', 'topknot', 'ponytail', 'cropped'];

export function buildBody(ch) {
  const s = ch.scale, b = ch.bulk, d = ch.dim, L = ch.look;
  const sb = Math.sqrt(b);
  const rnd = () => Math.random();
  // ---- материалы-описания ----
  const tone = 0.88 + rnd() * 0.2;
  const skinC = new THREE.Color(L.skin).multiplyScalar(tone);
  const M = {
    skin: { c: skinC, r: 0.58, m: 0 },
    skin2: { c: skinC.clone().multiplyScalar(0.86), r: 0.6, m: 0 },
    cloth: matOf(L.cloth, 0.92), cloth2: { c: new THREE.Color(L.cloth).multiplyScalar(0.72), r: 0.92, m: 0 },
    pants: matOf(L.pants, 0.9), leather: matOf(0x5a3a22, 0.78), leather2: matOf(0x3e2716, 0.8),
    metal: matOf(L.metal || (L.top === 'chain' ? 0x666b72 : 0x9aa0a8), L.top === 'chain' ? 0.62 : 0.34, L.top === 'chain' ? 0.7 : 0.95),
    metal2: matOf(0x5e636a, 0.42, 0.9),
    hair: matOf(L.hair, 0.88), gold: matOf(0xd0a544, 0.32, 0.95), dark: matOf(0x141416, 0.85),
    accent: matOf(L.accent || 0xa01414, 0.82), bone: matOf(0xe8dcc0, 0.5), sole: matOf(0x1e1410, 0.95), fur: matOf(0x3a2a1c, 0.98)
  };
  ch.material = bodyMaterial();
  ch.segs = {};
  for (const [name, a, bj] of SEGMENTS) {
    const g = new THREE.Group();
    ch.group.add(g);
    ch.segs[name] = { name, a, b: bj, group: g, z: new THREE.Vector3(0, 0, 1), attached: true, caps: [] };
  }
  // грудь — отдельная группа того же логического сегмента (скручивание корпуса)
  const chestG = new THREE.Group();
  ch.group.add(chestG);
  ch.segs.chest = { name: 'chest', a: J.PELVIS, b: J.NECK, group: chestG, z: new THREE.Vector3(0, 0, 1), attached: true, caps: [] };
  const S = ch.segs;
  const B = new PartBuilder();
  const top = L.top || 'tunic';
  const armored = top === 'plate' || top === 'chain';
  const helm = L.helm || 'none';

  // культя: мясо + кость
  const stump = (seg, name, x, y, z, r, flipY = false) => {
    const g = new THREE.Group();
    const f = new THREE.Mesh(ball(12, 8), FLESH_MAT);
    f.scale.set(r, r * 0.45, r);
    const bn = new THREE.Mesh(ball(8, 6), BONE_MAT);
    bn.scale.set(r * 0.36, r * 0.5, r * 0.36);
    bn.position.y = flipY ? -r * 0.15 : r * 0.15;
    g.add(f, bn);
    g.position.set(x, y, z);
    g.visible = false;
    seg.group.add(g);
    seg.caps.push({ name, mesh: g });
  };

  // =============== ТАЗ ===============
  const Lh = d.spine * SPINE_SPLIT, Lc = d.spine * (1 - SPINE_SPLIT);
  const chestMat = top === 'bare' ? M.skin : top === 'plate' ? M.metal : top === 'chain' ? M.metal : top === 'leather' ? M.leather : M.cloth;
  const topMat = top === 'bare' ? M.skin : top === 'plate' ? M.cloth : top === 'chain' ? M.metal : top === 'leather' ? M.leather : M.cloth;
  // пояс и пряжка
  B.add(S.torso.group, lathe([[0.07 * s, 0.146 * s], [0.085 * s, 0.153 * s], [0.115 * s, 0.15 * s], [0.128 * s, 0.14 * s]], { radial: 18, rings: 4, sx: b, sz: 0.69 * b }), M.leather2);
  B.add(S.torso.group, ball(10, 8), M.gold, [0, 0.097 * s, 0.103 * s * b], [0.028 * s, 0.024 * s, 0.012 * s]);
  // юбки/набедренники
  const skirtGeo = (y0, y1, r0, r1, o = {}) => lathe([[y1 * s, r1 * s], [(y1 + (y0 - y1) * 0.5) * s, (r1 + (r0 - r1) * 0.6) * s], [y0 * s, r0 * s]],
    { radial: o.radial || 20, rings: 7, sx: b, sz: (o.sz || 0.92) * b, cuts: (o.cuts || []).map((c) => c * s), phi0: o.phi0, phi1: o.phi1 });
  const skirt = (y0, y1, r0, r1, mat, o = {}) => B.add(S.torso.group, skirtGeo(y0, y1, r0, r1, o), mat);
  // длина «юбки», нарисованной на бёдрах (чтобы ноги не торчали сквозь ткань)
  let hem = 0, hemMat = null;
  if (top === 'tunic') { skirt(0.1, -0.25, 0.15, 0.215, (p) => (p.y < -0.215 * s ? M.cloth2 : M.cloth), { cuts: [-0.215] }); hem = 0.2; hemMat = M.cloth; }
  if (top === 'leather') { skirt(0.09, -0.21, 0.152, 0.21, (p) => (p.y < -0.18 * s ? M.leather2 : M.leather), { cuts: [-0.18] }); hem = 0.16; hemMat = M.leather; }
  if (top === 'chain') { skirt(0.1, -0.23, 0.15, 0.21, M.metal); hem = 0.18; hemMat = M.metal; }
  if (top === 'plate') {
    skirt(0.1, -0.14, 0.158, 0.225, (p) => (p.y < -0.11 * s ? M.gold : M.metal), { cuts: [-0.11] });
    skirt(0.05, -0.25, 0.15, 0.2, M.accent);
    hem = 0.2; hemMat = M.accent;
  }
  if (top === 'robe') { skirt(0.1, -0.8, 0.15, 0.34, (p) => (p.y < -0.75 * s ? M.gold : (p.y < -0.71 * s ? M.cloth2 : M.cloth)), { sz: 1.0, cuts: [-0.75, -0.71] }); hem = 9; hemMat = M.cloth; }
  if (top === 'bare') {
    // набедренная повязка: передний и задний клапаны
    const flap = (front) => skirtGeo(0.09, -0.3, 0.154, 0.172, { radial: 6, sz: 0.8, cuts: [-0.27], phi0: (front ? 0.5 : 1.5) * Math.PI - 0.5, phi1: (front ? 0.5 : 1.5) * Math.PI + 0.5 });
    B.add(S.torso.group, flap(true), (p) => (p.y < -0.27 * s ? M.gold : M.accent));
    B.add(S.torso.group, flap(false), M.accent);
  }
  stump(S.torso, 'lleg', d.hipW, -0.03 * s, 0, 0.078 * s, true);
  stump(S.torso, 'rleg', -d.hipW, -0.03 * s, 0, 0.078 * s, true);

  // =============== ГРУДЬ ===============
  const chestBulge = (t, phi, y) => {
    const front = Math.max(0, Math.sin(phi)), back = Math.max(0, -Math.sin(phi));
    const band = Math.exp(-Math.pow((y - 0.17 * s) / (0.07 * s), 2));
    return 1 + band * (front * 0.13 + back * 0.05) * (top === 'plate' ? 1.25 : 1);
  };
  const neckSkin = top === 'bare' ? null : 0.262 * s;
  const chestScale = top === 'plate' ? 1.06 : top === 'chain' || top === 'leather' ? 1.03 : 1;
  // ---- единая «кожа» торса: плавно скручивается между тазом и грудью ----
  const buildSkin = (hipParts, chestParts) => {
    const cs = chestScale;
    const prof = [[-0.115 * s, 0.045 * s], [-0.07 * s, 0.112 * s], [0, 0.15 * s], [0.08 * s, 0.14 * s], [0.17 * s, 0.125 * s], [Lh, 0.125 * s * (0.5 + 0.5 * cs)],
      [Lh + 0.08 * s, 0.15 * s * cs], [Lh + 0.155 * s, 0.176 * s * cs], [Lh + 0.212 * s, 0.172 * s * cs], [Lh + 0.25 * s, 0.138 * s * cs], [Lh + 0.276 * s, 0.085 * s], [Lh + Lc + 0.035 * s, 0.05 * s]];
    const cuts = [0.088 * s];
    if (neckSkin) cuts.push(Lh + neckSkin);
    if (top === 'leather') cuts.push(Lh - 0.04 * s, Lh + 0.235 * s);
    const g0 = lathe(prof, {
      radial: 22, rings: 22, sx: b, sz: (y) => (y < Lh ? 0.68 : 0.64 + 0.04 * Math.max(0, 1 - (y - Lh) / (0.1 * s))) * b, capA: true, capB: true, cuts,
      bulge: (t, phi, y) => chestBulge(t, phi, y - Lh)
    });
    const base = { geo: g0, matFn: (p) => {
      if (p.y < 0.088 * s) return M.pants;
      const cy = p.y - Lh;
      if (neckSkin && cy > neckSkin) return top === 'chain' ? M.metal : M.skin;
      if (top === 'leather' && (cy < -0.04 * s || cy > 0.235 * s)) return M.leather2;
      return chestMat;
    } };
    // детали таза и груди идут в тот же меш с жёсткими весами (0 — таз, 1 — грудь)
    for (const part of chestParts) part.pos = [part.pos[0], part.pos[1] + Lh, part.pos[2]];
    const nb = g0.attributes.position.count;
    const nh = hipParts.reduce((a, q) => a + q.geo.attributes.position.count, 0);
    const geo = mergeParts([base, ...hipParts, ...chestParts]);
    const mesh = new THREE.Mesh(geo, ch.material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    ch.group.add(mesh);
    const rest = geo.attributes.position.array.slice();
    const restN = geo.attributes.normal.array.slice();
    const w = new Float32Array(rest.length / 3);
    for (let i = 0; i < w.length; i++) {
      if (i >= nb) { w[i] = i < nb + nh ? 0 : 1; continue; }
      const t = Math.max(0, Math.min(1, (rest[i * 3 + 1] - (Lh - 0.1 * s)) / (0.2 * s)));
      w[i] = t * t * (3 - 2 * t);
    }
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    ch.torsoSkin = { mesh, geo, rest, restN, w, Lh };
    ch.skinGeos = (ch.skinGeos || []).concat([geo]);
  };
  if (top === 'robe') B.add(chestG, lathe([[-0.07 * s, 0.121 * s], [0.08 * s, 0.153 * s], [0.16 * s, 0.181 * s], [0.24 * s, 0.155 * s]], { radial: 3, rings: 8, sx: b, sz: 0.66 * b, bulge: chestBulge, phi0: Math.PI / 2 - 0.2, phi1: Math.PI / 2 + 0.2 }), M.gold);
  if (top === 'bare' || top === 'leather') {
    // перевязь через плечо: шнур, облегающий торс
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const th = (i / 20) * Math.PI * 2;
      let r = 0.15 * s, y = 0.1 * s;
      for (let k = 0; k < 3; k++) {
        y = 0.1 * s + 0.8 * r * b * Math.cos(th);
        const yy = Math.max(-0.08 * s, Math.min(0.25 * s, y));
        r = 0.126 * s + (0.176 - 0.126) * s * Math.max(0, Math.min(1, yy / (0.16 * s))) - Math.max(0, yy - 0.2 * s) * 0.5;
      }
      const front = Math.max(0, Math.sin(th));
      pts.push(new THREE.Vector3((r + 0.01 * s) * b * chestScale * Math.cos(th), y, (r + 0.012 * s) * 0.64 * b * chestScale * Math.sin(th) * (1 + 0.14 * front * Math.exp(-Math.pow((y - 0.17 * s) / (0.07 * s), 2)))));
    }
    B.add(chestG, tube(pts, 0.013 * s, { radial: 6, segs: 40, sy: 0.6 }), M.leather2);
  }
  if (top === 'bare') {
    // грудные мышцы, пресс, перевязь
    for (const sx of [1, -1]) B.add(chestG, ball(12, 8), M.skin, [sx * 0.072 * s * b, 0.168 * s, 0.078 * s * b], [0.074 * s * b, 0.052 * s, 0.03 * s]);
    B.add(chestG, ball(8, 6), M.gold, [-0.035 * s, 0.165 * s, 0.118 * s * b], [0.02 * s, 0.02 * s, 0.009 * s]);
  }
  if (top === 'plate') {
    // горжет и ребро нагрудника
    B.add(chestG, lathe([[0.255 * s, 0.1 * s], [0.285 * s, 0.075 * s], [0.31 * s, 0.07 * s]], { radial: 16, rings: 3 }), M.metal);
    B.add(chestG, ball(8, 12), M.metal, [0, 0.13 * s, 0.108 * s * b], [0.012 * s, 0.12 * s, 0.018 * s]);
    B.add(chestG, lathe([[-0.06 * s, 0.128 * s], [-0.035 * s, 0.136 * s], [-0.01 * s, 0.132 * s]], { radial: 18, rings: 3, sx: b, sz: 0.66 * b }), M.gold);
  }
  if (top === 'leather') {
    for (let i = 0; i < 5; i++) B.add(chestG, ball(6, 5), M.gold, [(i - 2) * 0.045 * s, 0.215 * s, 0.1 * s * b - Math.abs(i - 2) * 0.012 * s], 0.009 * s);
  }
  if (top === 'chain') {
    B.add(chestG, lathe([[0.19 * s, 0.176 * s], [0.225 * s, 0.168 * s], [0.25 * s, 0.14 * s]], { radial: 18, rings: 3, sx: b * 1.05, sz: 0.66 * b }), M.leather2);
  }
  if (top === 'robe') {
    B.add(chestG, lathe([[0.245 * s, 0.105 * s], [0.275 * s, 0.1 * s], [0.3 * s, 0.07 * s]], { radial: 16, rings: 3, sz: 0.8 }), M.gold);
  }
  stump(S.chest, 'head', 0, Lc + 0.01 * s, 0, 0.062 * s);
  stump(S.chest, 'larm', d.shW, Lc - 0.045 * s, 0, 0.062 * s);
  stump(S.chest, 'rarm', -d.shW, Lc - 0.045 * s, 0, 0.062 * s);

  // =============== ГОЛОВА ===============
  const H = S.head.group;
  const hy = d.neck, R = 0.108 * s;
  const fullHelm = helm === 'knight' || helm === 'executioner';
  B.add(H, lathe([[-0.04 * s, 0.056 * s * sb], [0.04 * s, 0.047 * s * sb], [0.13 * s, 0.046 * s]], { radial: 12, rings: 5 }), top === 'chain' || helm === 'knight' ? M.metal : M.skin);
  const hb = headBase();
  if (!fullHelm) {
    B.add(H, hb, M.skin, [0, hy, 0.004 * s], R);
    // надбровная дуга, нос, уши, скулы
    B.add(H, ball(10, 6), M.skin, [0, hy + 0.034 * s, 0.083 * s], [0.07 * s, 0.014 * s, 0.022 * s]);
    B.add(H, ball(8, 8), M.skin, [0, hy - 0.006 * s, 0.1 * s], [0.014 * s, 0.034 * s, 0.022 * s]);
    B.add(H, ball(8, 6), M.skin, [0, hy - 0.026 * s, 0.108 * s], [0.017 * s, 0.013 * s, 0.015 * s]);
    for (const sx of [1, -1]) {
      B.add(H, ball(8, 6), M.skin2, [sx * 0.092 * s, hy + 0.002 * s, -0.004 * s], [0.012 * s, 0.03 * s, 0.02 * s]);
      // брови (сдвинуты — злой взгляд)
      B.add(H, ball(8, 5), M.hair, [sx * 0.04 * s, hy + 0.043 * s, 0.096 * s], [0.026 * s, 0.0065 * s, 0.01 * s], [0, 0, sx * 0.34]);
    }
    // губы
    B.add(H, ball(8, 5), M.skin2, [0, hy - 0.052 * s, 0.092 * s], [0.03 * s, 0.009 * s, 0.012 * s]);
    // глаза (моргают) и рот (открывается) — по одному мешу, без теней
    const eyeW = matOf(0xf2efe6, 0.25), pupil = matOf(0x0a0806, 0.3), mouthM = matOf(0x1a0606, 0.6);
    const eyeParts = [];
    for (const sx of [1, -1]) {
      eyeParts.push({ geo: ball(10, 8), mat: eyeW, pos: [sx * 0.04 * s, 0, 0], scale: [0.017 * s, 0.012 * s, 0.012 * s] });
      eyeParts.push({ geo: ball(8, 6), mat: pupil, pos: [sx * 0.039 * s, -0.001 * s, 0.008 * s], scale: [0.0085 * s, 0.0085 * s, 0.006 * s] });
    }
    const eyeGeo = mergeParts(eyeParts);
    const eyes = new THREE.Mesh(eyeGeo, ch.material);
    eyes.position.set(0, hy + 0.017 * s, 0.085 * s);
    H.add(eyes);
    const mouthGeo = mergeParts([{ geo: ball(10, 6), mat: mouthM }]);
    const mouth = new THREE.Mesh(mouthGeo, ch.material);
    mouth.position.set(0, hy - 0.058 * s, 0.092 * s);
    mouth.scale.set(0.026 * s, 0.004 * s, 0.012 * s);
    H.add(mouth);
    ch.faceParts = { eyes, mouth, mouthBase: [0.026 * s, 0.004 * s, 0.012 * s] };
    ch.skinGeos = (ch.skinGeos || []).concat([eyeGeo, mouthGeo]);
  }
  // ---- волосы и борода ----
  const hairAt = (g, mat, k = 1.045) => B.add(H, g, mat, [0, hy, 0.004 * s], R * k);
  const capShort = () => cached('hairShort', () => shell(hb, (m) => m.y > 0.56 || (m.z < 0.28 && m.y > -0.3)));
  const capCropped = () => cached('hairCrop', () => shell(hb, (m) => m.y > 0.62 || (m.z < 0.1 && m.y > 0.0)));
  const capLong = () => cached('hairLong', () => shell(hb, (m) => m.y > 0.56 || (m.z < 0.22 && m.y > -0.78)));
  const hairStyle = L.hairStyle || (helm === 'mage' ? 'long' : HAIR_STYLES[Math.floor(rnd() * HAIR_STYLES.length)]);
  const showHair = helm === 'none' || helm === 'mage';
  if (showHair) {
    if (hairStyle === 'short' || hairStyle === 'topknot' || hairStyle === 'ponytail') hairAt(capShort(), M.hair);
    if (hairStyle === 'cropped') hairAt(capCropped(), M.hair, 1.025);
    if (hairStyle === 'long') {
      hairAt(capLong(), M.hair, 1.06);
      B.add(H, ball(12, 8), M.hair, [0, hy - 0.1 * s, -0.07 * s], [0.095 * s, 0.11 * s, 0.05 * s]);
    }
    if (hairStyle === 'topknot') B.add(H, ball(10, 8), M.hair, [0, hy + 0.13 * s, -0.035 * s], [0.032 * s, 0.036 * s, 0.032 * s]);
    if (hairStyle === 'ponytail') B.add(H, tube([[0, hy + 0.06 * s, -0.1 * s], [0, hy + 0.03 * s, -0.16 * s], [0, hy - 0.08 * s, -0.17 * s], [0, hy - 0.17 * s, -0.13 * s]], (t) => (0.028 - t * 0.02) * s, { radial: 7, segs: 8 }), M.hair);
    if (hairStyle === 'mohawk') {
      const mh = cached('mohawk', () => shell(hb, (m) => Math.abs(m.x) < 0.2 && m.y > 0.05 && m.z < 0.8, (v) => { const k = 1.0 + 0.42 * Math.max(0, v.y); v.x *= 0.55; v.y *= k; v.z *= 1 + 0.1 * Math.max(0, v.y); }));
      hairAt(mh, M.accent, 1.04);
    }
  }
  const beardable = helm !== 'hood' && !fullHelm && helm !== 'gladiator';
  const beard = L.beard ?? (helm === 'mage' ? 'long' : (beardable && rnd() < 0.45 ? (rnd() < 0.5 ? 'full' : 'stubble') : null));
  if (beard && beardable) {
    const bg = cached('beard', () => shell(hb, (m) => m.y < -0.2 && m.z > -0.15 && !(m.y > -0.56 && m.y < -0.36 && Math.abs(m.x) < 0.22 && m.z > 0.6)));
    hairAt(bg, beard === 'stubble' ? { c: M.hair.c.clone().lerp(M.skin.c, 0.55), r: 0.8, m: 0 } : M.hair, beard === 'stubble' ? 1.012 : 1.05);
    if (beard === 'long') B.add(H, lathe([[-0.2 * s, 0.006 * s], [-0.12 * s, 0.04 * s], [-0.02 * s, 0.07 * s]], { radial: 10, rings: 6, sz: 0.55, capA: true }), M.hair, [0, hy - 0.07 * s, 0.055 * s]);
    if (ch.faceParts) ch.faceParts.mouth.position.z += 0.006 * s;
  }

  // ---- шлемы ----
  const dome = (r, frac = 0.54) => cached(`dome${frac}`, () => new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * frac));
  const backGuard = () => cached('backGuard', () => new THREE.SphereGeometry(1, 16, 6, Math.PI * 1.2, Math.PI * 0.6, Math.PI * 0.5, Math.PI * 0.3));
  if (helm === 'helm' || helm === 'cap' || helm === 'horns' || helm === 'gladiator' || helm === 'dragon') {
    const hm = helm === 'cap' ? M.leather : helm === 'gladiator' ? M.gold : helm === 'dragon' ? M.metal2 : M.metal;
    const hr = 0.123 * s;
    B.add(H, dome(0, 0.47), hm, [0, hy + 0.034 * s, 0], [hr, hr * 0.98, hr * 1.04]);
    B.add(H, new THREE.TorusGeometry(hr * 0.995, 0.011 * s, 6, 24), helm === 'horns' ? M.fur : hm, [0, hy + 0.046 * s, 0], [1, 1.04, helm === 'horns' ? 2.2 : 1], [Math.PI / 2, 0, 0]);
    if (helm !== 'cap') {
      B.add(H, backGuard(), hm, [0, hy + 0.04 * s, -0.004 * s], [hr * 1.0, hr * 1.25, hr * 1.04]);
      B.add(H, ball(6, 10), hm, [0, hy + 0.01 * s, 0.124 * s], [0.01 * s, 0.045 * s, 0.008 * s]);
    }
  }
  if (helm === 'gladiator') {
    B.add(H, lathe([[-0.018 * s, 0.178 * s], [-0.01 * s, 0.155 * s], [0, 0.123 * s]], { radial: 22, rings: 3, sz: 1.08 }), M.gold, [0, hy + 0.046 * s, 0]);
    const crest = new THREE.TorusGeometry(0.105 * s, 0.03 * s, 6, 18, Math.PI * 1.05);
    B.add(H, crest, M.accent, [0, hy + 0.06 * s, -0.012 * s], [1, 1, 0.3], [0, Math.PI / 2, 0]);
    B.add(H, cached('faceGuard', () => new THREE.SphereGeometry(1, 14, 6, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.52, Math.PI * 0.3)), (p) => (p.y > -0.2 ? M.dark : M.gold), [0, hy + 0.035 * s, 0], [0.125 * s, 0.135 * s, 0.13 * s]);
  }
  if (helm === 'horns' || helm === 'dragon') {
    const hornMat = helm === 'dragon' ? M.dark : M.bone;
    for (const sx of [1, -1]) {
      const pts = helm === 'dragon'
        ? [[sx * 0.1 * s, hy + 0.06 * s, 0], [sx * 0.16 * s, hy + 0.1 * s, -0.04 * s], [sx * 0.18 * s, hy + 0.17 * s, -0.12 * s], [sx * 0.15 * s, hy + 0.22 * s, -0.2 * s]]
        : [[sx * 0.1 * s, hy + 0.08 * s, 0], [sx * 0.17 * s, hy + 0.1 * s, 0.01 * s], [sx * 0.205 * s, hy + 0.18 * s, 0.03 * s], [sx * 0.175 * s, hy + 0.26 * s, 0.06 * s]];
      B.add(H, tube(pts, (t) => (0.03 - t * 0.026) * s, { radial: 8, segs: 10 }), hornMat);
    }
  }
  if (helm === 'dragon') {
    for (let i = 0; i < 5; i++) {
      const a = 0.2 + i * 0.42;
      B.add(H, new THREE.ConeGeometry(0.016 * s, 0.09 * s, 6), M.accent, [0, hy + (0.012 + Math.cos(a) * 0.14) * s, -Math.sin(a) * 0.13 * s], 1, [-a, 0, 0]);
    }
    const eyeGlow = new THREE.Mesh(ball(10, 6), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
    eyeGlow.position.set(0, hy + 0.018 * s, 0.1 * s); eyeGlow.scale.set(0.062 * s, 0.007 * s, 0.01 * s);
    H.add(eyeGlow);
  }
  if (helm === 'knight') {
    const hp = [[-0.15 * s, 0.112 * s], [-0.05 * s, 0.124 * s], [0.06 * s, 0.123 * s], [0.115 * s, 0.1 * s], [0.145 * s, 0.05 * s], [0.152 * s, 0.0]];
    B.add(H, lathe(hp, { radial: 20, rings: 12, sz: 1.06 }), M.metal, [0, hy, 0.004 * s]);
    B.add(H, new THREE.TorusGeometry(0.1235 * s, 0.0085 * s, 5, 16, Math.PI * 0.85), M.dark, [0, hy + 0.02 * s, 0.006 * s], [1, 1, 1], [Math.PI / 2, 0, Math.PI * 0.075]);
    B.add(H, ball(6, 10), M.gold, [0, hy - 0.03 * s, 0.13 * s], [0.009 * s, 0.11 * s, 0.006 * s]);
    B.add(H, new THREE.TorusGeometry(0.124 * s, 0.006 * s, 5, 24), M.gold, [0, hy - 0.13 * s, 0.004 * s], [1, 1.06, 1], [Math.PI / 2, 0, 0]);
    B.add(H, tube([[0, hy + 0.15 * s, 0], [0, hy + 0.24 * s, -0.04 * s], [0, hy + 0.22 * s, -0.15 * s], [0, hy + 0.1 * s, -0.22 * s]], (t) => (0.012 + Math.sin(t * Math.PI) * 0.03) * s, { radial: 7, segs: 10 }), M.accent);
  }
  if (helm === 'hood') {
    const hg = cached('hood', () => shell(hb, (m) => !(m.z > 0.5 && Math.abs(m.x) < 0.62 && m.y < 0.6 && m.y > -0.95), (v) => { if (v.z < -0.2 && v.y > 0.2) { v.z *= 1.18; v.y *= 1.06; } }));
    B.add(H, hg, M.cloth, [0, hy, 0.0], R * 1.16);
    B.add(H, lathe([[-0.03 * s, 0.17 * s], [0.03 * s, 0.1 * s], [0.07 * s, 0.07 * s]], { radial: 14, rings: 4, sz: 0.8 }), M.cloth2, [0, 0, -0.01 * s]);
  }
  if (helm === 'executioner') {
    const ex = cached('exhood', () => deform(hb, (v) => { if (v.y > 0.5) { v.y *= 1.12; v.z -= 0.08 * (v.y - 0.5); } }));
    B.add(H, ex, M.dark, [0, hy, 0.004 * s], R * 1.08);
    B.add(H, lathe([[-0.02 * s, 0.15 * s], [0.03 * s, 0.09 * s], [0.07 * s, 0.062 * s]], { radial: 14, rings: 4, sz: 0.8 }), M.dark);
    B.add(H, new THREE.TorusGeometry(0.066 * s, 0.009 * s, 5, 16), M.leather, [0, 0.085 * s, 0], 1, [Math.PI / 2, 0, 0]);
    const glow = new THREE.Group();
    for (const sx of [1, -1]) {
      const e = new THREE.Mesh(ball(8, 6), new THREE.MeshBasicMaterial({ color: 0xff4a10 }));
      e.position.set(sx * 0.04 * s, 0, 0); e.scale.set(0.018 * s, 0.008 * s, 0.008 * s);
      glow.add(e);
    }
    glow.position.set(0, hy + 0.02 * s, 0.108 * s);
    H.add(glow);
  }
  if (helm === 'mage') {
    const brim = lathe([[-0.034 * s, 0.265 * s], [-0.022 * s, 0.2 * s], [-0.006 * s, 0.13 * s], [0.006 * s, 0.1 * s]], { radial: 22, rings: 6 });
    B.add(H, brim, M.cloth, [0, hy + 0.07 * s, 0], 1, [-0.08, 0, 0]);
    const hh = 0.4 * s;
    const coneG = lathe([[0, 0.115 * s], [hh * 0.4, 0.07 * s], [hh * 0.75, 0.03 * s], [hh, 0.004 * s]], { radial: 16, rings: 12, capB: true, shift: (t) => [0, -t * t * 0.14 * s] });
    B.add(H, coneG, (p) => (p.y < 0.035 * s ? M.gold : M.cloth), [0, hy + 0.07 * s, 0], 1, [-0.1, 0, 0]);
  }
  stump(S.head, 'headcut', 0, 0, 0, 0.052 * s, true);

  // =============== РУКИ ===============
  const armTop = top === 'plate' ? M.metal : top === 'chain' ? M.metal : top === 'robe' ? M.cloth : M.skin;
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const up = S[side + 'upper'], fo = S[side + 'fore'];
    const lu = d.upper, lf = d.fore;
    const upProf = [[0, 0.06 * s * b], [lu * 0.25, 0.058 * s * b], [lu * 0.55, 0.05 * s * b], [lu, 0.041 * s * b]];
    B.add(up.group, lathe(upProf, { radial: 12, rings: 8, roundA: true, roundB: true, cuts: top === 'tunic' || top === 'leather' ? [lu * 0.44, lu * 0.5] : null, bulge: (t, phi) => 1 + 0.12 * Math.max(0, Math.sin(phi)) * Math.exp(-Math.pow((t - 0.4) / 0.25, 2)) }),
      (p) => {
        if (top === 'tunic' || top === 'leather') return p.y < lu * 0.5 ? (p.y > lu * 0.44 ? M.cloth2 : M.cloth) : M.skin;
        return armTop;
      });
    if (top === 'plate') {
      B.add(up.group, ball(14, 10), M.metal, [0, 0.005 * s, 0], [0.082 * s * b, 0.07 * s, 0.085 * s * b]);
      B.add(up.group, lathe([[0.02 * s, 0.08 * s * b], [0.07 * s, 0.085 * s * b], [0.085 * s, 0.07 * s * b]], { radial: 12, rings: 3 }), M.gold);
    }
    if (top === 'leather') B.add(up.group, ball(12, 8), M.leather2, [0, 0.0, 0], [0.074 * s * b, 0.06 * s, 0.078 * s * b]);
    if (top === 'chain') B.add(up.group, ball(12, 8), M.leather2, [0, 0.0, 0], [0.07 * s * b, 0.055 * s, 0.072 * s * b]);
    stump(up, 'cut', 0, 0, 0, 0.058 * s * b, true);
    stump(up, 'end', 0, lu, 0, 0.042 * s * b);
    // предплечье
    const foProf = [[0, 0.041 * s * b], [lf * 0.25, 0.046 * s * b], [lf * 0.7, 0.034 * s * b], [lf, 0.027 * s * b]];
    const foreMat = top === 'robe' ? M.cloth : (top === 'chain' ? M.metal : M.skin);
    B.add(fo.group, lathe(foProf, { radial: 12, rings: 8, roundA: true, capB: true }), foreMat);
    if (top === 'robe') {
      B.add(fo.group, lathe([[lf * 0.1, 0.048 * s], [lf * 0.6, 0.062 * s], [lf * 0.98, 0.085 * s]], { radial: 12, rings: 5, cuts: [lf * 0.9] }), (p) => (p.y > lf * 0.9 ? M.gold : M.cloth));
    } else if (top === 'plate') {
      B.add(fo.group, lathe([[lf * 0.12, 0.05 * s * b], [lf * 0.4, 0.052 * s * b], [lf * 0.92, 0.036 * s * b]], { radial: 12, rings: 5, cuts: [lf * 0.84] }), (p) => (p.y > lf * 0.84 ? M.gold : M.metal));
      B.add(fo.group, ball(10, 8), M.metal, [0, 0, -0.008 * s], [0.05 * s * b, 0.045 * s, 0.055 * s * b]);
    } else if (top === 'leather' || top === 'bare' || top === 'tunic') {
      B.add(fo.group, lathe([[lf * 0.45, 0.043 * s * b], [lf * 0.7, 0.039 * s * b], [lf * 0.93, 0.032 * s * b]], { radial: 12, rings: 4, cuts: [lf * 0.52, lf * 0.86] }), (p) => (p.y > lf * 0.86 || p.y < lf * 0.52 ? M.leather2 : M.leather));
    }
    // кисть: ладонь, согнутые пальцы, большой палец
    const hm = top === 'plate' ? M.metal : (top === 'chain' ? M.leather2 : M.skin);
    const hs = s * Math.min(1.12, sb);
    B.add(fo.group, ball(10, 8), hm, [0, lf + 0.036 * hs, 0], [0.036 * hs, 0.044 * hs, 0.021 * hs]);
    if (side === 'r') {
      B.add(fo.group, ball(10, 8), hm, [0, lf + 0.07 * hs, 0.02 * hs], [0.037 * hs, 0.026 * hs, 0.027 * hs]);
      B.add(fo.group, ball(8, 6), hm, [0, lf + 0.055 * hs, 0.035 * hs], [0.034 * hs, 0.02 * hs, 0.016 * hs]);
      B.add(fo.group, ball(8, 6), hm, [sx * 0.03 * hs, lf + 0.048 * hs, 0.026 * hs], [0.014 * hs, 0.026 * hs, 0.017 * hs], [0.5, 0, 0]);
    } else {
      for (let f = 0; f < 4; f++) {
        const fx = (f - 1.5) * 0.019 * hs;
        B.add(fo.group, ball(6, 6), hm, [fx, lf + (0.092 - Math.abs(f - 1.5) * 0.006) * hs, 0.01 * hs], [0.0085 * hs, 0.03 * hs, 0.009 * hs], [0.45, 0, -fx * 6]);
      }
      B.add(fo.group, ball(8, 6), hm, [sx * 0.036 * hs, lf + 0.045 * hs, 0.014 * hs], [0.011 * hs, 0.028 * hs, 0.012 * hs], [0.3, 0, -sx * 0.7]);
    }
    stump(fo, 'cut', 0, 0, 0, 0.042 * s * b, true);
  }

  // =============== НОГИ ===============
  const bootMat = armored ? M.metal : M.leather;
  for (const side of ['l', 'r']) {
    const th = S[side + 'thigh'], sh = S[side + 'shin'];
    const lt = d.thigh, ls = d.shin;
    const thProf = [[0, 0.088 * s * sb], [lt * 0.3, 0.084 * s * sb], [lt * 0.7, 0.064 * s * sb], [lt, 0.053 * s * sb]];
    const legMat = top === 'robe' ? M.cloth : M.pants;
    B.add(th.group, lathe(thProf, { radial: 12, rings: 10, roundA: true, roundB: true, cuts: [hem < 1 && hem > 0 ? hem * s : -1, top === 'bare' ? lt * 0.55 : -1], bulge: (t, phi) => 1 + 0.1 * Math.max(0, Math.sin(phi)) * Math.exp(-Math.pow((t - 0.35) / 0.3, 2)) }),
      (p) => {
        if (hemMat && p.y < hem * s) return hemMat;
        if (top === 'bare') return p.y > lt * 0.55 ? M.skin : M.pants;
        return legMat;
      });
    if (top === 'plate') B.add(th.group, lathe([[lt * 0.25, 0.09 * s * sb], [lt * 0.6, 0.074 * s * sb], [lt * 0.9, 0.06 * s * sb]], { radial: 12, rings: 4, bulge: (t, phi) => (Math.sin(phi) > -0.2 ? 1 : 0.86) }), M.metal);
    stump(th, 'cut', 0, 0, 0, 0.08 * s * sb, true);
    stump(th, 'end', 0, lt, 0, 0.054 * s * sb);
    const shProf = [[0, 0.053 * s * sb], [ls * 0.22, 0.061 * s * sb], [ls * 0.6, 0.044 * s * sb], [ls, 0.036 * s * sb]];
    const bootTop = ls * 0.42;
    B.add(sh.group, lathe(shProf, { radial: 12, rings: 9, roundA: true, capB: true, cuts: [bootTop], bulge: (t, phi) => 1 + 0.2 * Math.max(0, -Math.sin(phi)) * Math.exp(-Math.pow((t - 0.25) / 0.2, 2)) }),
      (p) => (p.y > bootTop ? bootMat : (top === 'bare' ? M.skin : (top === 'robe' ? M.cloth : M.pants))));
    B.add(sh.group, lathe([[bootTop - 0.02 * s, 0.062 * s * sb], [bootTop + 0.02 * s, 0.064 * s * sb], [bootTop + 0.05 * s, 0.056 * s * sb]], { radial: 12, rings: 3 }), armored ? M.gold : M.leather2);
    if (armored) B.add(sh.group, ball(10, 8), M.metal, [0, 0, 0.012 * s], [0.058 * s * sb, 0.055 * s, 0.06 * s * sb]);
    // ступня — отдельная подгруппа: остаётся плоской на земле
    const foot = new THREE.Group();
    foot.position.set(0, ls, 0);
    foot.quaternion.copy(FOOT_REST);
    sh.group.add(foot);
    sh.foot = foot;
    B.add(foot, ball(12, 8), bootMat, [0, -0.04 * s, 0.05 * s], [0.05 * s * sb, 0.04 * s, 0.12 * s]);
    B.add(foot, ball(10, 8), bootMat, [0, -0.03 * s, -0.015 * s], [0.046 * s * sb, 0.048 * s, 0.055 * s]);
    B.add(foot, ball(10, 6), M.sole, [0, -0.068 * s, 0.045 * s], [0.052 * s * sb, 0.013 * s, 0.125 * s]);
    stump(sh, 'cut', 0, 0, 0, 0.055 * s * sb, true);
  }

  {
    const hipParts = B.map.get(S.torso.group) || [], chestParts = B.map.get(chestG) || [];
    B.map.delete(S.torso.group); B.map.delete(chestG);
    buildSkin(hipParts, chestParts);
  }
  ch.ownGeos = B.build(ch.material).concat(ch.skinGeos || []);
  // ступни и лицо не отбрасывают тень (экономия вызовов отрисовки)
  for (const side of ['l', 'r']) for (const m of S[side + 'shin'].foot.children) m.castShadow = false;

  // Магическое свечение в левой руке
  if (L.glow) {
    const glowMat = new THREE.MeshBasicMaterial({ color: L.glow, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    ch.handGlow = new THREE.Mesh(ball(12, 10), glowMat);
    ch.handGlow.position.set(0, d.fore + 0.05 * s, 0.03 * s);
    ch.handGlow.scale.setScalar(0.09 * s);
    ch.handGlowBase = 0.09 * s;
    S.lfore.group.add(ch.handGlow);
  }
}
