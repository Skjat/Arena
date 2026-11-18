// Процедурные модели оружия. Начало координат — центр хвата, +Y — к острию.
// Клинок — отдельный меш (свечение замаха, кровь), остальное слито в один меш с цветами по вершинам.
import * as THREE from 'three';
import { WEAPON_TYPES, TIERS, WEAPONS } from './data.js';
import { lathe, tube, ball, matOf, mergeParts, cached } from './meshkit.js';
import { bodyMaterial } from './gfx.js';

// Клинок ромбовидного сечения с гранями. profile(t) → полуширина (0..1 от width/2), t — вдоль длины.
function bladeGeo(len, width, thick, profile, o = {}) {
  const rings = o.rings || 14;
  const pos = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const w = Math.max(0.0005, profile(t) * width / 2);
    const th = Math.max(0.0004, thick / 2 * (o.thickProfile ? o.thickProfile(t) : (1 - t * 0.55)) * Math.min(1, w / (width * 0.12)));
    const y = t * len;
    const bx = o.curve ? o.curve(t) : 0;
    pos.push(bx - w, y, 0, bx, y, th, bx + w, y, 0, bx, y, -th);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < 4; j++) {
    const a = i * 4 + j, b = i * 4 + (j + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

const straight = (tip) => (t) => (t < 1 - tip ? 1 - t * 0.12 : (1 - (1 - tip) * 0.12) * Math.pow(Math.max(0, (1 - t) / tip), 0.75));
const leaf = (t) => Math.sin(Math.min(1, t * 1.15 + 0.12) * Math.PI) * (t < 0.3 ? 0.75 + t * 0.83 : 1) * (1 - t * 0.15);

export function makeMaterials(tierName) {
  const tier = TIERS[tierName] || TIERS.iron;
  // один материал на всё оружие: цвета по вершинам, свечение замаха и кровь — через юниформы
  const mat = bodyMaterial();
  mat.userData.u.uEmMask.value = 1; // светится только клинок
  mat.emissive.set(tier.glow || 0x000000);
  mat.emissiveIntensity = tier.glow ? 0.9 : 0;
  return {
    blade: mat, hilt: mat, grip: mat, fitting: mat, tier,
    baseBlade: new THREE.Color(tier.blade), baseRough: tier.rough, baseEmissive: new THREE.Color(tier.glow || 0), glowIntensity: tier.glow ? 0.9 : 0
  };
}

// Возвращает { group, mats, length, type }
export function buildWeapon(weaponId) {
  const item = WEAPONS[weaponId] || WEAPONS.rusty_sword;
  const type = item.type;
  const mats = makeMaterials(item.tier);
  const tier = mats.tier;
  const g = new THREE.Group();
  const fancy = !!tier.glow;
  const M = {
    grip: matOf(tier.grip, 0.85), wrap: { c: new THREE.Color(tier.grip).multiplyScalar(0.65), r: 0.9, m: 0 },
    fit: fancy ? matOf(0x34343c, 0.3, 0.95) : (item.tier === 'rusty' ? matOf(0x6a5444, 0.6, 0.7) : matOf(0xb8923e, 0.34, 0.95)),
    steel: matOf(tier.blade, tier.rough + 0.1, tier.metal), wood: matOf(0x4a3222, 0.85), cloth: matOf(0xa01818, 0.9)
  };
  const parts = [];
  const add = (geo, mat, pos = [0, 0, 0], scale = 1, rot = null) => { const p = { geo, pos, scale }; if (typeof mat === 'function') p.matFn = mat; else p.mat = mat; if (rot) p.rot = rot; parts.push(p); };
  const bladeMat = { ...matOf(tier.blade, tier.rough, tier.metal), e: 1 };
  const addBlade = (geo, pos = [0, 0, 0], quat = null) => { const p = { geo, pos, scale: 1, mat: bladeMat }; if (quat) p.quat = quat; parts.push(p); };
  // рукоять с обмоткой
  const grip = (y0, y1, r) => {
    add(lathe([[y0, r * 0.92], [(y0 + y1) / 2, r * 1.08], [y1, r * 0.95]], { radial: 10, rings: 6 }), M.grip);
    const n = Math.max(3, Math.round((y1 - y0) / 0.028));
    for (let i = 0; i < n; i++) add(new THREE.TorusGeometry(r * 1.06, r * 0.16, 4, 10), M.wrap, [0, y0 + (i + 0.5) * (y1 - y0) / n, 0], 1, [Math.PI / 2 + 0.25, 0, 0]);
  };
  const pommel = (y, r) => add(lathe([[-r * 1.1, r * 0.3], [-r * 0.7, r * 0.95], [0, r], [r * 0.6, r * 0.6]], { radial: 10, rings: 6, capA: true }), M.fit, [0, y, 0]);
  const guard = (y, half, r, droop = 0) => {
    add(tube([[-half, y - droop, 0], [-half * 0.5, y, 0], [0, y + r * 0.2, 0], [half * 0.5, y, 0], [half, y - droop, 0]], (t) => r * (0.75 + 0.55 * Math.abs(t - 0.5) * 2), { radial: 8, segs: 12 }), M.fit);
    add(ball(8, 6), M.fit, [0, y, 0], [r * 1.6, r * 1.5, r * 2.0]);
  };
  let length = WEAPON_TYPES[type].len;

  if (type === 'dagger') {
    grip(-0.055, 0.045, 0.016);
    pommel(-0.065, 0.02);
    guard(0.055, 0.06, 0.011, 0.008);
    addBlade(bladeGeo(0.3, 0.05, 0.012, straight(0.42)), [0, 0.06, 0]);
    length = 0.36;
  } else if (type === 'sword') {
    grip(-0.085, 0.07, 0.018);
    pommel(-0.1, 0.028);
    guard(0.085, 0.11, 0.014, 0.012);
    addBlade(bladeGeo(0.84, 0.066, 0.014, straight(0.2)), [0, 0.09, 0]);
    length = 0.95;
  } else if (type === 'greatsword') {
    grip(-0.16, 0.14, 0.021);
    pommel(-0.18, 0.036);
    guard(0.155, 0.18, 0.018, 0.03);
    add(lathe([[0.16, 0.03], [0.26, 0.026]], { radial: 4, rings: 2, sz: 0.4 }), M.steel);
    for (const sx of [1, -1]) add(new THREE.ConeGeometry(0.012, 0.06, 6), M.fit, [sx * 0.045, 0.255, 0], 1, [0, 0, -sx * Math.PI / 2]);
    addBlade(bladeGeo(1.2, 0.092, 0.018, straight(0.17)), [0, 0.17, 0]);
    length = 1.4;
  } else if (type === 'axe') {
    add(lathe([[-0.2, 0.024], [0.1, 0.021], [0.45, 0.022], [0.66, 0.026]], { radial: 10, rings: 8, capA: true, capB: true, shift: (t) => [Math.sin(t * Math.PI) * -0.012, 0] }), M.wood);
    for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.026, 0.005, 4, 10), M.wrap, [0, -0.14 + i * 0.035, 0], 1, [Math.PI / 2 + 0.2, 0, 0]);
    // лезвие: клин, утончающийся к кромке
    const shape = new THREE.Shape();
    shape.moveTo(0.0, -0.055);
    shape.quadraticCurveTo(0.09, -0.07, 0.16, -0.17);
    shape.quadraticCurveTo(0.235, -0.02, 0.19, 0.17);
    shape.quadraticCurveTo(0.1, 0.075, 0.0, 0.06);
    shape.closePath();
    const head = cached('axeHead', () => {
      const e = new THREE.ExtrudeGeometry(shape, { depth: 0.036, bevelEnabled: false, curveSegments: 12 });
      e.translate(0, 0, -0.018);
      const p = e.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) * Math.max(0.04, 1 - x / 0.2)); }
      e.computeVertexNormals();
      return e;
    });
    addBlade(head, [0.012, 0.55, 0]);
    add(lathe([[0.47, 0.03], [0.55, 0.034], [0.63, 0.03]], { radial: 8, rings: 3, sz: 0.75 }), M.steel);
    add(new THREE.ConeGeometry(0.02, 0.09, 6), M.steel, [-0.045, 0.55, 0], 1, [0, 0, Math.PI / 2]);
    add(lathe([[0, 0.02], [0.08, 0.004]], { radial: 6, rings: 3, capB: true }), M.steel, [0, 0.66, 0]);
    add(lathe([[-0.01, 0.027], [0.012, 0.03], [0.03, 0.02]], { radial: 8, rings: 3 }), M.fit, [0, -0.215, 0]);
    length = 0.9;
  } else if (type === 'mace') {
    add(lathe([[-0.16, 0.022], [0.1, 0.019], [0.44, 0.021]], { radial: 10, rings: 6, capA: true }), M.wood);
    for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.024, 0.005, 4, 10), M.wrap, [0, -0.12 + i * 0.035, 0], 1, [Math.PI / 2 + 0.2, 0, 0]);
    add(lathe([[-0.012, 0.026], [0.012, 0.03], [0.03, 0.02]], { radial: 8, rings: 3 }), M.fit, [0, -0.17, 0]);
    add(lathe([[0.42, 0.024], [0.46, 0.034], [0.5, 0.03]], { radial: 10, rings: 3 }), M.fit);
    // ядро и перья
    const core = lathe([[0.47, 0.03], [0.52, 0.05], [0.58, 0.052], [0.63, 0.036], [0.66, 0.015]], { radial: 10, rings: 8, capB: true });
    addBlade(core);
    const fl = cached('maceFlange', () => bladeGeo(0.075, 0.2, 0.016, (t) => (t < 0.12 ? 0.62 + t * 3 : 1 - Math.pow((t - 0.12) / 0.88, 1.3)), { rings: 8, thickProfile: () => 1 }));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      addBlade(fl, [Math.cos(a) * 0.04, 0.555, -Math.sin(a) * 0.04], new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, -Math.PI / 2, 'YZX')));
    }
    add(lathe([[0, 0.016], [0.07, 0.003]], { radial: 6, rings: 3, capB: true }), M.steel, [0, 0.655, 0]);
    length = 0.82;
  } else if (type === 'spear') {
    add(lathe([[-0.55, 0.018], [0.2, 0.021], [1.34, 0.019]], { radial: 10, rings: 10, capA: true }), M.wood);
    for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.023, 0.0045, 4, 10), M.wrap, [0, -0.05 + i * 0.03, 0], 1, [Math.PI / 2 + 0.2, 0, 0]);
    for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.023, 0.0045, 4, 10), M.wrap, [0, 0.4 + i * 0.03, 0], 1, [Math.PI / 2 + 0.2, 0, 0]);
    add(lathe([[1.28, 0.024], [1.34, 0.027], [1.42, 0.016]], { radial: 10, rings: 4 }), M.fit);
    add(tube([[-0.07, 1.335, 0], [0, 1.345, 0], [0.07, 1.335, 0]], (t) => 0.009 - Math.abs(t - 0.5) * 0.008, { radial: 6, segs: 6 }), M.fit);
    add(lathe([[1.2, 0.03], [1.24, 0.026], [1.28, 0.03]], { radial: 10, rings: 3 }), M.cloth);
    add(lathe([[-0.64, 0.002], [-0.56, 0.02]], { radial: 6, rings: 3, capA: true }), M.steel);
    addBlade(bladeGeo(0.36, 0.085, 0.016, leaf), [0, 1.4, 0]);
    length = 1.72;
  }
  const hiltGeo = mergeParts(parts);
  const hilt = new THREE.Mesh(hiltGeo, mats.hilt);
  hilt.castShadow = true;
  g.add(hilt);
  g.userData.length = length;
  return { group: g, mats, length, type };
}

// Покрыть клинок кровью (0..1)
export function setBloodiness(mats, amount) {
  mats.blade.userData.u.uBlood.value = Math.min(0.95, amount * 1.15);
}
