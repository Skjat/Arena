// Арена: песок, стены, трибуны с толпой, факелы, небо.
import * as THREE from 'three';
import { lathe } from './meshkit.js';
import { enhance, RIM } from './gfx.js';

export const ARENA_R = 13.5;

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sandTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b8935f'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 34;
      img.data[i] += n; img.data[i + 1] += n * 0.9; img.data[i + 2] += n * 0.7;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},${40 + Math.random() * 30},${0.08 + Math.random() * 0.12})`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 30, 3 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(60,45,30,${Math.random() * 0.4})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, 7);
}

function flagstoneTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4440'; g.fillRect(0, 0, w, h);
    const n = 6, cs = w / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = 95 + Math.random() * 45;
      g.fillStyle = `rgb(${v + 6},${v},${v - 8})`;
      const ox = (j % 2) * cs * 0.5;
      g.fillRect(i * cs + ox + 3, j * cs + 3, cs - 6, cs - 6);
      for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(i * cs + ox + Math.random() * cs, j * cs + Math.random() * cs, 4, 4); }
    }
  }, 6);
}

function stoneTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#6b5f52'; g.fillRect(0, 0, w, h);
    const rows = 8, bh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 32;
      for (let x = -64; x < w; x += 64) {
        const v = 80 + Math.random() * 40;
        g.fillStyle = `rgb(${v + 10},${v},${v - 12})`;
        g.fillRect(x + off + 2, r * bh + 2, 60, bh - 4);
        for (let k = 0; k < 20; k++) {
          g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
          g.fillRect(x + off + Math.random() * 60, r * bh + Math.random() * bh, 3, 3);
        }
      }
    }
    // грязь снизу
    const grd = g.createLinearGradient(0, h * 0.6, 0, h);
    grd.addColorStop(0, 'rgba(40,25,10,0)'); grd.addColorStop(1, 'rgba(40,25,10,0.55)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, 1);
}

function noiseBump() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const v = 110 + Math.random() * 60; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? 40 : 220},${Math.random() < 0.5 ? 40 : 220},${120},0.12)`;
    g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 26, 3 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function bannerTexture(base, emblem, kind) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // фактура ткани
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`; g.fillRect(0, y, w, 1); }
    g.strokeStyle = emblem; g.lineWidth = 6;
    g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = emblem;
    g.translate(w / 2, h * 0.42);
    if (kind === 0) {
      // скрещённые мечи
      for (const a of [-0.6, 0.6]) { g.save(); g.rotate(a); g.fillRect(-4, -62, 8, 100); g.fillRect(-18, 30, 36, 7); g.restore(); }
    } else if (kind === 1) {
      // череп
      g.beginPath(); g.arc(0, -8, 34, 0, Math.PI * 2); g.fill();
      g.fillRect(-20, 14, 40, 26);
      g.fillStyle = base;
      g.beginPath(); g.arc(-13, -8, 9, 0, Math.PI * 2); g.arc(13, -8, 9, 0, Math.PI * 2); g.fill();
      for (let i = -1; i <= 1; i++) g.fillRect(i * 11 - 2, 22, 4, 18);
    } else {
      // солнце
      g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * Math.PI / 6); g.fillRect(-3, 30, 6, 20); g.restore(); }
    }
  }, 1);
}

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.torches = [];
    this.crowd = null;
    this.build();
  }

  build() {
    const scene = this.scene;
    // ---- Небо: градиент, облака, звёзды, зарево у горизонта
    const skyGeo = new THREE.SphereGeometry(200, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x02040f) }, mid: { value: new THREE.Color(0x1c0a16) }, bot: { value: new THREE.Color(0xa8400f) }, time: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform float time; varying vec3 vP;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float h = vP.y;
          vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bot, mid, smoothstep(-0.06, 0.12, h));
          // облака
          vec2 uv = vP.xz / max(0.12, h + 0.25) * 1.6 + vec2(time * 0.004, 0.0);
          float cl = n2(uv) * 0.55 + n2(uv * 2.3) * 0.3 + n2(uv * 5.1) * 0.15;
          cl = smoothstep(0.52, 0.85, cl) * smoothstep(0.02, 0.3, h);
          c = mix(c, mix(vec3(0.42, 0.16, 0.08), vec3(0.06, 0.05, 0.1), smoothstep(0.1, 0.5, h)), cl * 0.7);
          float st = step(0.9987, hash(floor(vP * 320.0))) * smoothstep(0.25, 0.7, h) * (1.0 - cl);
          c += vec3(st) * (0.6 + 0.4 * sin(time * 2.0 + vP.x * 90.0));
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(this.sky);
    // Луна с ореолом (яркость выше 1 — светится через bloom)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.6), fog: false }));
    moon.position.set(-60, 72, -120);
    scene.add(moon);

    // ---- Свет
    const hemi = new THREE.HemisphereLight(0xa0a8ff, 0x8a5a30, 0.9);
    scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight(0xffc890, 2.1);
    sun.position.set(-12, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const SR = 11;
    sun.shadow.camera.left = -SR; sun.shadow.camera.right = SR;
    sun.shadow.camera.top = SR; sun.shadow.camera.bottom = -SR;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 2.2;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.sunDir = new THREE.Vector3(-12, 22, 8).normalize();
    // холодный контровой свет (лунный) — отделяет фигуры от фона
    const back = new THREE.DirectionalLight(0x6a8cff, 0.75);
    back.position.set(14, 12, -16);
    scene.add(back);
    this.back = back;
    scene.fog = new THREE.Fog(0x3a2030, 30, 120);

    // ---- Пол
    const sand = sandTexture();
    const bump = noiseBump();
    bump.repeat.set(10, 10);
    const floorMat = enhance(new THREE.MeshStandardMaterial({ map: sand, roughness: 0.96, metalness: 0, bumpMap: bump, bumpScale: 1.4 }), { world: 0.34, scale: 0.33 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.2, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.floor = floor;
    this.sandTex = sand;
    // затемнение у стены
    const ring = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 1.6, ARENA_R + 0.1, 64, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.006;
    scene.add(ring);

    // ---- Стена: кладка, цоколь, карниз, пилястры
    const stone = stoneTexture();
    stone.repeat.set(14, 1);
    const stoneBump = stoneTexture();
    stoneBump.repeat.set(14, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: stone, bumpMap: stoneBump, bumpScale: 2.5, roughness: 0.92, side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.1, ARENA_R + 0.1, 3.4, 72, 1, true), wallMat);
    wall.position.y = 1.7;
    wall.receiveShadow = true;
    scene.add(wall);
    const trimMat = enhance(new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.88 }), { world: 0.3, scale: 1.4 });
    const plinth = new THREE.Mesh(lathe([[0, ARENA_R - 0.16], [0.28, ARENA_R - 0.14], [0.36, ARENA_R - 0.04], [0.4, ARENA_R + 0.1]], { radial: 72, rings: 4 }), trimMat);
    plinth.material.side = THREE.DoubleSide;
    scene.add(plinth);
    const cornice = new THREE.Mesh(lathe([[3.0, ARENA_R + 0.1], [3.1, ARENA_R - 0.06], [3.22, ARENA_R - 0.2], [3.34, ARENA_R - 0.22], [3.42, ARENA_R - 0.05], [3.5, ARENA_R + 0.5]], { radial: 72, rings: 8 }), trimMat);
    scene.add(cornice);
    const pilGeo = new THREE.CylinderGeometry(0.22, 0.25, 2.7, 10, 1, false, 0, Math.PI);
    const pil = new THREE.InstancedMesh(pilGeo, trimMat, 24);
    const capGeo = new THREE.BoxGeometry(0.62, 0.16, 0.3);
    const caps = new THREE.InstancedMesh(capGeo, trimMat, 48);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      if (i === 0 || i === 12) ss.set(0.0001, 0.0001, 0.0001); else ss.set(1, 1, 1); // у ворот пилястр нет
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang + Math.PI / 2);
      pp.set(Math.sin(ang) * (ARENA_R + 0.08), 1.72, Math.cos(ang) * (ARENA_R + 0.08));
      mm.compose(pp, qq, ss); pil.setMatrixAt(i, mm);
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      pp.set(Math.sin(ang) * (ARENA_R - 0.05), 3.0, Math.cos(ang) * (ARENA_R - 0.05));
      mm.compose(pp, qq, ss); caps.setMatrixAt(i * 2, mm);
      pp.y = 0.46; mm.compose(pp, qq, ss); caps.setMatrixAt(i * 2 + 1, mm);
    }
    pil.receiveShadow = true;
    scene.add(pil, caps);

    // ---- Ворота: тёмный проём, каменная арка, решётка
    const gateMat = new THREE.MeshBasicMaterial({ color: 0x040302 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.85, roughness: 0.45 });
    for (const ang of [0, Math.PI]) {
      const g = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5), gateMat);
      hole.position.set(0, 1.25, 0);
      g.add(hole);
      const arch = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20, 0, Math.PI), gateMat);
      arch.position.set(0, 2.5, 0);
      g.add(arch);
      const archStone = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.17, 6, 20, Math.PI), trimMat);
      archStone.position.set(0, 2.5, 0.04);
      g.add(archStone);
      for (const sx of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.5, 0.3), trimMat);
        jamb.position.set(sx * 1.62, 1.25, 0.04);
        g.add(jamb);
      }
      for (let i = -4; i <= 4; i++) {
        const hgt = 2.5 + Math.sqrt(Math.max(0, 1.5 * 1.5 - Math.pow(i * 0.33, 2)));
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, hgt, 6), barMat);
        bar.position.set(i * 0.33, hgt / 2, 0.06);
        g.add(bar);
      }
      for (const y of [0.7, 1.6, 2.5]) {
        const hb = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.05), barMat);
        hb.position.set(0, y, 0.07);
        g.add(hb);
      }
      g.position.set(Math.sin(ang) * (ARENA_R - 0.02), 0, Math.cos(ang) * (ARENA_R - 0.02));
      g.lookAt(0, 0, 0);
      scene.add(g);
    }

    // ---- Знамёна: ткань с эмблемой, колышется
    const banners = [bannerTexture('#7a1010', '#e0b040', 0), bannerTexture('#c09030', '#4a0a0a', 1), bannerTexture('#1a1f5a', '#e0b040', 2)];
    this.bannerMats = [];
    const bgeo = new THREE.PlaneGeometry(1.1, 2.2, 6, 10);
    {
      // «ласточкин хвост» снизу
      const p = bgeo.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < -1.05) p.setY(i, p.getY(i) + (0.55 - Math.abs(p.getX(i))) * 0.5);
    }
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6);
    poleGeo.rotateZ(Math.PI / 2);
    for (let k = 0; k < 3; k++) {
      const mat = new THREE.MeshStandardMaterial({ map: banners[k], roughness: 0.95, side: THREE.DoubleSide });
      const u = { uTime: { value: 0 } };
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = u.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float sway = 1.0 - uv.y;
            transformed += objectNormal * sin(uTime * 1.7 + position.x * 1.3 + position.z * 1.3 + position.y * 2.2) * 0.075 * sway;`);
      };
      this.bannerMats.push(u);
      for (let i = k; i < 12; i += 3) {
        const ang = (i / 12) * Math.PI * 2 + Math.PI / 24;
        const deg = ang * 180 / Math.PI;
        if (Math.abs(((deg - 22.5) % 45 + 45) % 45) < 4 || Math.abs(((deg - 22.5) % 45 + 45) % 45 - 45) < 4) continue; // место занято факелом
        const b = new THREE.Mesh(bgeo, mat);
        b.position.set(Math.sin(ang) * (ARENA_R - 0.14), 2.0, Math.cos(ang) * (ARENA_R - 0.14));
        b.lookAt(0, 2.0, 0);
        scene.add(b);
        const pole = new THREE.Mesh(poleGeo, barMat);
        pole.position.copy(b.position); pole.position.y = 3.12;
        pole.quaternion.copy(b.quaternion);
        scene.add(pole);
      }
    }

    // ---- Факелы: кованый держатель и чаша, пламя — частицы
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.6, metalness: 0.8 });
    const bowlGeo = lathe([[0, 0.03], [0.05, 0.1], [0.12, 0.14], [0.14, 0.13]], { radial: 10, rings: 4, capA: true });
    const armGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.45, 6);
    armGeo.rotateX(Math.PI / 2 - 0.5);
    const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.2, 0.25) });
    this.emberMat = emberMat;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
      const pos = dir.clone().multiplyScalar(ARENA_R - 0.45); pos.y = 2.45;
      const bowl = new THREE.Mesh(bowlGeo, iron);
      bowl.position.copy(pos);
      scene.add(bowl);
      const arm = new THREE.Mesh(armGeo, iron);
      arm.position.copy(dir).multiplyScalar(ARENA_R - 0.2); arm.position.y = 2.33;
      arm.lookAt(0, 2.33, 0);
      scene.add(arm);
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), emberMat);
      ember.position.copy(pos); ember.position.y += 0.13; ember.scale.y = 0.5;
      scene.add(ember);
      this.torches.push({ pos: pos.clone().add(new THREE.Vector3(0, 0.16, 0)), ember });
    }
    // Два реальных источника света от факелов (дёшево для мобильных)
    this.torchLights = [];
    for (const i of [1, 5]) {
      const l = new THREE.PointLight(0xff8a30, 7, 17, 1.5);
      l.position.copy(this.torches[i].pos).multiplyScalar(0.9);
      scene.add(l);
      this.torchLights.push(l);
    }

    // ---- Трибуны
    const standMat = enhance(new THREE.MeshStandardMaterial({ color: 0x5e5246, roughness: 1 }), { world: 0.3, scale: 0.9 });
    for (let k = 0; k < 6; k++) {
      const r0 = ARENA_R + 0.6 + k * 1.1;
      const step = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1.1, r0 + 1.1, 0.6, 56, 1, true), standMat);
      step.position.y = 3.6 + k * 0.6;
      scene.add(step);
      const top = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 1.1, 56), standMat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = 3.9 + k * 0.6;
      scene.add(top);
    }
    // Колоннада наверху: колонны с капителями и антаблемент
    const colMat = enhance(new THREE.MeshStandardMaterial({ color: 0x9a8a74, roughness: 0.9 }), { world: 0.25, scale: 0.8 });
    const colGeo = lathe([[0, 0.46], [0.15, 0.46], [0.22, 0.36], [2.4, 0.33], [4.5, 0.3], [4.62, 0.4], [4.8, 0.48], [5, 0.5]], { radial: 12, rings: 14 });
    const cols = new THREE.InstancedMesh(colGeo, colMat, 28);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      const r = ARENA_R + 8.2;
      m.makeTranslation(Math.sin(ang) * r, 7.0, Math.cos(ang) * r);
      cols.setMatrixAt(i, m);
    }
    scene.add(cols);
    const archRing = new THREE.Mesh(lathe([[12.0, ARENA_R + 7.6], [12.15, ARENA_R + 7.5], [12.7, ARENA_R + 7.5], [12.85, ARENA_R + 7.25], [13.0, ARENA_R + 7.25]], { radial: 56, rings: 5 }), colMat);
    archRing.material.side = THREE.DoubleSide;
    scene.add(archRing);
    const backWall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 9.2, ARENA_R + 9.2, 8, 56, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1, side: THREE.BackSide }));
    backWall.position.y = 9;
    scene.add(backWall);

    // ---- Толпа (инстансы): тела с поднятыми руками и головы
    const N = 320;
    const body = new THREE.CapsuleGeometry(0.17, 0.3, 2, 7); body.translate(0, 0.33, 0);
    const armL = new THREE.CapsuleGeometry(0.045, 0.3, 1, 5); armL.rotateZ(-0.6); armL.translate(0.24, 0.72, 0);
    const armR = new THREE.CapsuleGeometry(0.045, 0.3, 1, 5); armR.rotateZ(0.6); armR.translate(-0.24, 0.72, 0);
    const bodies = new THREE.InstancedMesh(mergeGeos([body, armL, armR]), new THREE.MeshLambertMaterial(), N);
    const headGeo = new THREE.SphereGeometry(0.12, 8, 6); headGeo.translate(0, 0.8, 0);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial(), N);
    const palette = [0x8a2a1a, 0x2a4a7a, 0xc8a050, 0x4a6a2a, 0x7a5a3a, 0xd8d0c0, 0x5a2a5a, 0x3a3a3a, 0xa04a1a];
    const skins = [0xd8a888, 0xc08a68, 0x9a6a4a, 0xe8c0a0, 0x7a5238];
    const col = new THREE.Color();
    this.crowdData = [];
    for (let i = 0; i < N; i++) {
      const row = i % 6;
      const ang = Math.random() * Math.PI * 2;
      const r = ARENA_R + 1.15 + row * 1.1 + Math.random() * 0.3;
      const y = 3.9 + row * 0.6;
      this.crowdData.push({ x: Math.sin(ang) * r, y, z: Math.cos(ang) * r, ph: Math.random() * 10, amp: 0.05 + Math.random() * 0.1, rot: ang + Math.PI, s: 0.9 + Math.random() * 0.25 });
      col.setHex(palette[Math.floor(Math.random() * palette.length)]).multiplyScalar(0.55 + Math.random() * 0.5);
      bodies.setColorAt(i, col);
      col.setHex(skins[Math.floor(Math.random() * skins.length)]).multiplyScalar(0.8);
      heads.setColorAt(i, col);
    }
    bodies.frustumCulled = false; heads.frustumCulled = false;
    scene.add(bodies, heads);
    this.crowd = bodies;
    this.crowdHeads = heads;
    this.excitement = 0.2;
    this.updateCrowd(0, 0);
    this.mergeStatic([this.sky, moon, floor, ring, bodies, heads]);
  }

  // Слить неподвижные меши арены по материалам — в разы меньше вызовов отрисовки.
  mergeStatic(skip) {
    const scene = this.scene;
    scene.updateMatrixWorld(true);
    const groups = new Map();
    const remove = [];
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || skip.includes(o) || o === this.camera) return;
      let p = o.parent, bad = false;
      while (p) { if (p.isCamera) bad = true; p = p.parent; }
      if (bad || !o.geometry.attributes.normal) return;
      if (!groups.has(o.material)) groups.set(o.material, []);
      groups.get(o.material).push(o);
      remove.push(o);
    });
    const n3 = new THREE.Matrix3(), v = new THREE.Vector3();
    for (const [mat, list] of groups) {
      if (list.length < 2) { remove.splice(remove.indexOf(list[0]), 1); continue; }
      let total = 0;
      const parts = list.map((m) => { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry; total += g.attributes.position.count; return [m, g]; });
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
      let o = 0, shadow = false;
      for (const [m, g] of parts) {
        n3.getNormalMatrix(m.matrixWorld);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
          pos[(o + i) * 3] = v.x; pos[(o + i) * 3 + 1] = v.y; pos[(o + i) * 3 + 2] = v.z;
          v.fromBufferAttribute(N, i).applyMatrix3(n3).normalize();
          nor[(o + i) * 3] = v.x; nor[(o + i) * 3 + 1] = v.y; nor[(o + i) * 3 + 2] = v.z;
          if (U) { uv[(o + i) * 2] = U.getX(i); uv[(o + i) * 2 + 1] = U.getY(i); }
        }
        o += P.count;
        shadow = shadow || m.receiveShadow;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = shadow;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    for (const m of remove) m.removeFromParent();
  }

  // Тени следуют за игроком: выше плотность текселей там, где смотрит камера.
  followShadow(pos) {
    const s = this.sun;
    const texel = (2 * 11) / s.shadow.mapSize.x * 4;
    const x = Math.round(pos.x * 0.6 / texel) * texel, z = Math.round(pos.z * 0.6 / texel) * texel;
    s.target.position.set(x, 0, z);
    s.position.set(x, 0, z).addScaledVector(this.sunDir, 30);
    s.target.updateMatrixWorld();
  }

  updateCrowd(t, dt) {
    if (!this.crowd) return;
    this.excitement = Math.max(0.15, this.excitement - dt * 0.15);
    const m = this._m || (this._m = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion());
    const s = this._s || (this._s = new THREE.Vector3()), p = this._p || (this._p = new THREE.Vector3());
    const up = this._up || (this._up = new THREE.Vector3(0, 1, 0));
    const e = this.excitement;
    for (let i = 0; i < this.crowdData.length; i++) {
      const c = this.crowdData[i];
      const jump = Math.max(0, Math.sin(t * (4 + e * 6) + c.ph)) * c.amp * (0.3 + e * 4);
      p.set(c.x, c.y + jump, c.z);
      q.setFromAxisAngle(up, c.rot);
      s.setScalar(c.s);
      m.compose(p, q, s);
      this.crowd.setMatrixAt(i, m);
      this.crowdHeads.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    this.crowdHeads.instanceMatrix.needsUpdate = true;
  }

  // Оформление под конкретную арену.
  setVariant(id) {
    if (this.variant === id) return;
    this.variant = id;
    const V = {
      colosseum: { floor: 0xffffff, fog: 0x3a2030, sky: 0xa0a8ff, ground: 0x8a5a30, sun: 0xffc890, sunI: 2.1, tex: 'sand' },
      acid: { floor: 0x9aa88a, fog: 0x1c2a16, sky: 0x9ac090, ground: 0x4a6a30, sun: 0xd8ffb0, sunI: 1.7, tex: 'stone' },
      beasts: { floor: 0x9a8070, fog: 0x2a1610, sky: 0x9a8aa0, ground: 0x6a3a20, sun: 0xffa060, sunI: 1.6, tex: 'sand' },
      labyrinth: { floor: 0xd8d0c8, fog: 0x2a2e3e, sky: 0xc0c8ff, ground: 0x7a7068, sun: 0xe8e0ff, sunI: 2.3, tex: 'stone', hemiI: 1.5 },
      spikes: { floor: 0xa08070, fog: 0x2e1414, sky: 0xc0a0a0, ground: 0x7a3020, sun: 0xffb090, sunI: 2.0, tex: 'sand' }
    }[id] || {};
    if (V.tex === 'stone' && !this.stoneTex) this.stoneTex = flagstoneTexture();
    this.floor.material.map = V.tex === 'stone' ? this.stoneTex : this.sandTex;
    this.floor.material.color.setHex(V.floor);
    this.floor.material.needsUpdate = true;
    this.scene.fog.color.setHex(V.fog);
    this.hemi.color.setHex(V.sky);
    this.hemi.groundColor.setHex(V.ground);
    this.sun.color.setHex(V.sun);
    this.sun.intensity = V.sunI;
    this.hemi.intensity = V.hemiI || 0.9;
    const rim = { colosseum: [0.2, 0.14, 0.09], acid: [0.1, 0.2, 0.06], beasts: [0.2, 0.11, 0.07], labyrinth: [0.12, 0.14, 0.22], spikes: [0.22, 0.1, 0.08] }[id] || [0.2, 0.14, 0.09];
    RIM.value.setRGB(rim[0], rim[1], rim[2]);
  }

  cheer(amount = 1) { this.excitement = Math.min(1.2, this.excitement + 0.4 * amount); }

  update(t, dt, fx = null) {
    this.sky.material.uniforms.time.value = t;
    for (const u of this.bannerMats) u.uTime.value = t;
    for (const tc of this.torches) {
      if (fx) fx.torch(tc.pos, dt);
    }
    const fl = 0.8 + Math.random() * 0.4;
    this.emberMat.color.setRGB(3.0 * fl, 1.2 * fl, 0.25 * fl);
    for (const l of this.torchLights) l.intensity = 6.5 + Math.sin(t * 13 + l.position.x) * 0.7 + Math.random() * 0.7;
    this.updateCrowd(t, dt);
  }
}

// Простое слияние BufferGeometry (без индексов) — чтобы не тянуть addons.
function mergeGeos(geos) {
  const parts = geos.map((g) => g.index ? g.toNonIndexed() : g);
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
