// Процедурные модели оружия. Начало координат — центр рукояти, +Y — к острию.
import * as THREE from 'three';
import { WEAPON_TYPES, TIERS, WEAPONS } from './data.js';

const geoCache = new Map();

function bladeShape(len, width, tipLen, shape = 'straight') {
  const s = new THREE.Shape();
  const w = width / 2;
  if (shape === 'leaf') {
    s.moveTo(-w * 0.4, 0);
    s.quadraticCurveTo(-w * 1.4, len * 0.45, 0, len);
    s.quadraticCurveTo(w * 1.4, len * 0.45, w * 0.4, 0);
  } else if (shape === 'curved') {
    s.moveTo(-w, 0);
    s.lineTo(-w * 0.95, len - tipLen);
    s.quadraticCurveTo(-w * 0.5, len - tipLen * 0.3, w * 0.2, len);
    s.quadraticCurveTo(w * 0.9, len * 0.6, w, 0);
  } else {
    s.moveTo(-w, 0);
    s.lineTo(-w, len - tipLen);
    s.lineTo(0, len);
    s.lineTo(w, len - tipLen);
    s.lineTo(w, 0);
  }
  s.closePath();
  return s;
}

function extrude(shape, depth, bevel = 0.004) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 1.2, bevelSegments: 1, curveSegments: 6
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

function axeHeadShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.05);
  s.lineTo(0.06, -0.06);
  s.quadraticCurveTo(0.16, -0.16, 0.24, -0.14);
  s.quadraticCurveTo(0.28, 0, 0.24, 0.16);
  s.quadraticCurveTo(0.16, 0.15, 0.06, 0.07);
  s.lineTo(0, 0.06);
  s.closePath();
  return s;
}

function cached(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}

export function makeMaterials(tierName) {
  const tier = TIERS[tierName] || TIERS.iron;
  const blade = new THREE.MeshStandardMaterial({
    color: tier.blade, metalness: tier.metal, roughness: tier.rough,
    emissive: tier.glow ? tier.glow : 0x000000, emissiveIntensity: tier.glow ? 0.35 : 0
  });
  const grip = new THREE.MeshStandardMaterial({ color: tier.grip, roughness: 0.9, metalness: 0 });
  const fitting = new THREE.MeshStandardMaterial({ color: tier.glow ? 0x2a2a30 : 0x7a5a2a, metalness: 0.8, roughness: 0.35 });
  return { blade, grip, fitting, baseBlade: new THREE.Color(tier.blade), baseEmissive: new THREE.Color(tier.glow || 0), glowIntensity: tier.glow ? 0.35 : 0 };
}

// Возвращает { group, mats, length, type }
export function buildWeapon(weaponId) {
  const item = WEAPONS[weaponId] || WEAPONS.rusty_sword;
  const type = item.type;
  const mats = makeMaterials(item.tier);
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  let length = WEAPON_TYPES[type].len;

  if (type === 'dagger') {
    add(cached('dagger_blade', () => extrude(bladeShape(0.28, 0.05, 0.08), 0.008)), mats.blade, 0, 0.07, 0);
    add(cached('dagger_guard', () => new THREE.BoxGeometry(0.11, 0.022, 0.03)), mats.fitting, 0, 0.065, 0);
    add(cached('dagger_grip', () => new THREE.CylinderGeometry(0.016, 0.017, 0.11, 8)), mats.grip, 0, 0.005, 0);
    add(cached('pommel_s', () => new THREE.SphereGeometry(0.022, 8, 6)), mats.fitting, 0, -0.055, 0);
    length = 0.36;
  } else if (type === 'sword') {
    add(cached('sword_blade', () => extrude(bladeShape(0.82, 0.062, 0.13), 0.01)), mats.blade, 0, 0.1, 0);
    add(cached('sword_fuller', () => new THREE.BoxGeometry(0.012, 0.6, 0.016)), mats.fitting, 0, 0.4, 0).material = mats.blade;
    add(cached('sword_guard', () => new THREE.BoxGeometry(0.2, 0.028, 0.04)), mats.fitting, 0, 0.09, 0);
    add(cached('sword_grip', () => new THREE.CylinderGeometry(0.018, 0.02, 0.16, 8)), mats.grip, 0, 0.0, 0);
    add(cached('pommel_m', () => new THREE.SphereGeometry(0.03, 8, 6)), mats.fitting, 0, -0.09, 0);
    length = 0.95;
  } else if (type === 'greatsword') {
    add(cached('gs_blade', () => extrude(bladeShape(1.2, 0.09, 0.18), 0.014)), mats.blade, 0, 0.17, 0);
    add(cached('gs_guard', () => new THREE.BoxGeometry(0.34, 0.035, 0.05)), mats.fitting, 0, 0.16, 0);
    add(cached('gs_ricasso', () => new THREE.BoxGeometry(0.05, 0.1, 0.02)), mats.fitting, 0, 0.22, 0);
    add(cached('gs_grip', () => new THREE.CylinderGeometry(0.02, 0.022, 0.3, 8)), mats.grip, 0, 0.0, 0);
    add(cached('pommel_l', () => new THREE.SphereGeometry(0.038, 8, 6)), mats.fitting, 0, -0.16, 0);
    length = 1.4;
  } else if (type === 'axe') {
    add(cached('axe_haft', () => new THREE.CylinderGeometry(0.022, 0.026, 0.82, 8)), mats.grip, 0, 0.25, 0);
    const head = add(cached('axe_head', () => extrude(axeHeadShape(), 0.022, 0.006)), mats.blade, 0.01, 0.56, 0);
    head.rotation.set(0, 0, 0);
    add(cached('axe_back', () => new THREE.BoxGeometry(0.06, 0.08, 0.045)), mats.fitting, -0.02, 0.56, 0);
    add(cached('axe_spike', () => new THREE.ConeGeometry(0.02, 0.1, 6)), mats.fitting, 0, 0.7, 0);
    length = 0.9;
  } else if (type === 'mace') {
    add(cached('mace_haft', () => new THREE.CylinderGeometry(0.02, 0.024, 0.66, 8)), mats.grip, 0, 0.18, 0);
    add(cached('mace_head', () => new THREE.DodecahedronGeometry(0.085, 0)), mats.blade, 0, 0.54, 0);
    const spike = cached('mace_spike', () => new THREE.ConeGeometry(0.022, 0.075, 5));
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0.7, 0.5, 0.5], [-0.7, 0.5, -0.5], [0.7, -0.3, -0.6], [-0.6, -0.3, 0.7]];
    for (const d of dirs) {
      const v = new THREE.Vector3(...d).normalize();
      const m = add(spike, mats.blade, v.x * 0.1, 0.54 + v.y * 0.1, v.z * 0.1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    }
    add(cached('mace_ring', () => new THREE.CylinderGeometry(0.032, 0.032, 0.04, 8)), mats.fitting, 0, 0.44, 0);
    length = 0.82;
  } else if (type === 'spear') {
    add(cached('spear_shaft', () => new THREE.CylinderGeometry(0.02, 0.023, 1.9, 8)), mats.grip, 0, 0.45, 0);
    add(cached('spear_head', () => extrude(bladeShape(0.34, 0.07, 0.2, 'leaf'), 0.012)), mats.blade, 0, 1.38, 0);
    add(cached('spear_socket', () => new THREE.CylinderGeometry(0.022, 0.028, 0.1, 8)), mats.fitting, 0, 1.36, 0);
    add(cached('spear_butt', () => new THREE.ConeGeometry(0.024, 0.08, 6)), mats.fitting, 0, -0.52, 0, Math.PI, 0, 0);
    length = 1.72;
  }
  g.userData.length = length;
  return { group: g, mats, length, type };
}

// Покрыть клинок кровью (0..1)
export function setBloodiness(mats, amount) {
  const blood = new THREE.Color(0x5a0505);
  mats.blade.color.copy(mats.baseBlade).lerp(blood, Math.min(0.75, amount));
  mats.blade.roughness = Math.max(mats.blade.roughness, 0.15 + amount * 0.25);
}
