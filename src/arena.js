// Арена: песок, стены, трибуны с толпой, факелы, небо.
import * as THREE from 'three';

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

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.torches = [];
    this.crowd = null;
    this.build();
  }

  build() {
    const scene = this.scene;
    // Небо — градиентная сфера
    const skyGeo = new THREE.SphereGeometry(200, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x0b1030) }, mid: { value: new THREE.Color(0x6a2c3a) }, bot: { value: new THREE.Color(0xf09a50) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = vP.y;
          vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bot, mid, smoothstep(-0.05, 0.15, h));
          float st = step(0.9985, hash(floor(vP * 300.0))) * smoothstep(0.3, 0.8, h);
          c += vec3(st);
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(this.sky);
    // Луна
    const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe8c0 }));
    moon.position.set(-60, 70, -120);
    scene.add(moon);

    // Свет
    const hemi = new THREE.HemisphereLight(0xa0a8ff, 0x8a5a30, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffc890, 2.1);
    sun.position.set(-12, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    this.sun = sun;
    scene.fog = new THREE.Fog(0x3a2030, 30, 120);

    // Пол
    const sand = sandTexture();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.2, 64), new THREE.MeshStandardMaterial({ map: sand, roughness: 1, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // кольцо у стены
    const ring = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 0.6, ARENA_R + 0.1, 64), new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 1 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; ring.receiveShadow = true;
    scene.add(ring);

    // Стена
    const stone = stoneTexture();
    stone.repeat.set(14, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95, side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.1, ARENA_R + 0.1, 3.4, 64, 1, true), wallMat);
    wall.position.y = 1.7;
    wall.receiveShadow = true;
    scene.add(wall);
    // верх стены
    const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.35, 0.3, 6, 64), new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.9 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 3.45;
    scene.add(rim);

    // Ворота (два тёмных проёма)
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x0a0605, roughness: 1 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.8, roughness: 0.5 });
    for (const ang of [0, Math.PI]) {
      const g = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.8), gateMat);
      hole.position.set(0, 1.4, 0);
      g.add(hole);
      const arch = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16, 0, Math.PI), gateMat);
      arch.position.set(0, 2.8, 0);
      g.add(arch);
      for (let i = -4; i <= 4; i++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.8, 6), barMat);
        bar.position.set(i * 0.33, 1.9, 0.05);
        g.add(bar);
      }
      g.position.set(Math.sin(ang) * (ARENA_R - 0.02), 0, Math.cos(ang) * (ARENA_R - 0.02));
      g.lookAt(0, 0, 0);
      scene.add(g);
    }

    // Знамёна
    const bannerColors = [0x8a1010, 0xc8a040, 0x1a1a5a];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshStandardMaterial({ color: bannerColors[i % 3], roughness: 0.95, side: THREE.DoubleSide }));
      b.position.set(Math.sin(ang) * (ARENA_R - 0.05), 2.2, Math.cos(ang) * (ARENA_R - 0.05));
      b.lookAt(0, 2.2, 0);
      scene.add(b);
      const emb = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), new THREE.MeshStandardMaterial({ color: i % 3 === 1 ? 0x5a0a0a : 0xd8b050, metalness: 0.5, roughness: 0.5 }));
      emb.position.copy(b.position).multiplyScalar(0.998); emb.position.y = 2.5;
      emb.lookAt(0, 2.5, 0);
      scene.add(emb);
    }

    // Факелы
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const pos = new THREE.Vector3(Math.sin(ang) * (ARENA_R - 0.25), 2.6, Math.cos(ang) * (ARENA_R - 0.25));
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.6, 6), torchMat);
      stick.position.copy(pos);
      scene.add(stick);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), flameMat);
      flame.position.copy(pos).add(new THREE.Vector3(0, 0.45, 0));
      scene.add(flame);
      this.torches.push({ pos: flame.position.clone(), flame });
    }
    // Два реальных источника света от факелов (дёшево для мобильных)
    this.torchLights = [];
    for (const i of [1, 5]) {
      const l = new THREE.PointLight(0xff8a30, 6, 16, 1.5);
      l.position.copy(this.torches[i].pos).multiplyScalar(0.9);
      scene.add(l);
      this.torchLights.push(l);
    }

    // Трибуны
    const standMat = new THREE.MeshStandardMaterial({ color: 0x5e5246, roughness: 1 });
    for (let k = 0; k < 6; k++) {
      const r0 = ARENA_R + 0.6 + k * 1.1;
      const step = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1.1, r0 + 1.1, 0.6, 48, 1, true), standMat);
      step.position.y = 3.6 + k * 0.6;
      scene.add(step);
      const top = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 1.1, 48), standMat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = 3.9 + k * 0.6;
      scene.add(top);
    }
    // Колонны наверху
    const colMat = new THREE.MeshStandardMaterial({ color: 0x9a8a74, roughness: 0.9 });
    const colGeo = new THREE.CylinderGeometry(0.35, 0.4, 5, 8);
    const cols = new THREE.InstancedMesh(colGeo, colMat, 24);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const r = ARENA_R + 8.2;
      m.makeTranslation(Math.sin(ang) * r, 9.5, Math.cos(ang) * r);
      cols.setMatrixAt(i, m);
    }
    scene.add(cols);
    const archRing = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 8.6, ARENA_R + 8.6, 0.8, 48, 1, true), colMat);
    archRing.position.y = 12.3;
    scene.add(archRing);

    // Толпа (инстансы)
    const N = 420;
    const bodyGeo = new THREE.BoxGeometry(0.42, 0.62, 0.3);
    bodyGeo.translate(0, 0.31, 0);
    const headGeo = new THREE.SphereGeometry(0.13, 6, 5);
    headGeo.translate(0, 0.78, 0);
    const merged = mergeGeos([bodyGeo, headGeo]);
    const crowdMat = new THREE.MeshLambertMaterial({ vertexColors: false });
    const crowd = new THREE.InstancedMesh(merged, crowdMat, N);
    crowd.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const palette = [0x8a2a1a, 0x2a4a7a, 0xc8a050, 0x4a6a2a, 0x7a5a3a, 0xd8d0c0, 0x5a2a5a, 0x3a3a3a, 0xa04a1a];
    const col = new THREE.Color();
    this.crowdData = [];
    for (let i = 0; i < N; i++) {
      const row = i % 6;
      const ang = Math.random() * Math.PI * 2;
      // не на воротах
      const gateGap = Math.min(Math.abs(Math.sin(ang)), 1);
      const r = ARENA_R + 1.15 + row * 1.1 + Math.random() * 0.3;
      const y = 3.9 + row * 0.6;
      this.crowdData.push({ x: Math.sin(ang) * r, y, z: Math.cos(ang) * r, ph: Math.random() * 10, amp: 0.05 + Math.random() * 0.1, rot: ang + Math.PI, s: 0.9 + Math.random() * 0.25, g: gateGap });
      col.setHex(palette[Math.floor(Math.random() * palette.length)]);
      col.multiplyScalar(0.6 + Math.random() * 0.5);
      crowd.setColorAt(i, col);
    }
    crowd.frustumCulled = false;
    scene.add(crowd);
    this.crowd = crowd;
    this.excitement = 0.2;
    this.updateCrowd(0, 0);
  }

  updateCrowd(t, dt) {
    if (!this.crowd) return;
    this.excitement = Math.max(0.15, this.excitement - dt * 0.15);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const e = this.excitement;
    for (let i = 0; i < this.crowdData.length; i++) {
      const c = this.crowdData[i];
      const jump = Math.max(0, Math.sin(t * (4 + e * 6) + c.ph)) * c.amp * (0.3 + e * 4);
      p.set(c.x, c.y + jump, c.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rot);
      s.setScalar(c.s);
      m.compose(p, q, s);
      this.crowd.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  cheer(amount = 1) { this.excitement = Math.min(1.2, this.excitement + 0.4 * amount); }

  update(t, dt) {
    for (const tc of this.torches) {
      const f = 0.85 + Math.sin(t * 17 + tc.pos.x) * 0.1 + Math.random() * 0.1;
      tc.flame.scale.set(f, f * (1 + Math.random() * 0.2), f);
    }
    for (const l of this.torchLights) l.intensity = 5.5 + Math.sin(t * 13 + l.position.x) * 0.6 + Math.random() * 0.6;
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
