// Заклинания игрока и врагов: снаряды, молнии, волны, метеоры, щиты, вампиризм.
import * as THREE from 'three';
import { SPELLS } from './data.js';
import { J } from './character.js';
import { ARENA_R } from './arena.js';
import { EYE } from './player.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3();

const boltGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
boltGeo.translate(0, 0.5, 0);

class Bolt {
  constructor(scene, color) {
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.segs = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(boltGeo, i % 2 ? this.mat : this.coreMat);
      this.group.add(m);
      this.segs.push(m);
    }
    scene.add(this.group);
    this.t = 0;
  }
  place(from, to) {
    const pts = [from.clone()];
    const n = 12;
    const d = _v.subVectors(to, from);
    const len = d.length();
    for (let i = 1; i < n; i++) {
      const p = from.clone().addScaledVector(d, i / n);
      p.add(V((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(len * 0.07));
      pts.push(p);
    }
    pts.push(to.clone());
    let k = 0;
    const seg = (a, b, r) => {
      const m = this.segs[k++];
      if (!m) return;
      const dd = new THREE.Vector3().subVectors(b, a);
      m.position.copy(a);
      m.scale.set(r, dd.length(), r);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), dd.normalize());
      m.visible = true;
    };
    for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1], (0.012 + Math.random() * 0.012) * (0.4 + 0.6 * Math.min(1, i / 3)));
    // ответвления
    for (let i = 0; i < 4; i++) {
      const a = pts[2 + Math.floor(Math.random() * (pts.length - 4))];
      const b = a.clone().add(V((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(len * 0.2));
      seg(a, b, 0.012);
    }
    for (; k < this.segs.length; k++) this.segs[k].visible = false;
  }
  dispose() { this.group.removeFromParent(); }
}

export class Spells {
  constructor(battle) {
    this.battle = battle;
    this.scene = battle.scene;
    this.fx = battle.fx;
    this.projectiles = [];
    this.bolts = [];
    this.beams = [];
    this.meteors = [];
    this.markers = [];
    this.waves = [];
    this.sphereGeo = new THREE.SphereGeometry(1, 16, 12);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  get player() { return this.battle.player; }

  // Точка левой руки игрока в мире.
  playerHand() {
    const cam = this.battle.camera;
    cam.updateMatrixWorld();
    return V(-0.22, -0.2, -0.55).applyMatrix4(cam.matrixWorld);
  }

  playerAim() {
    const P = this.player;
    if (P.target) return P.target.chest();
    const f = P.forward(new THREE.Vector3());
    return V(P.pos.x + f.x * 10, 1.2, P.pos.z + f.z * 10);
  }

  // ===== Каст игрока =====
  playerCast(id, lvl, glyph) {
    const B = this.battle, P = this.player, S = SPELLS[id], L = S.lv[lvl - 1];
    const col = new THREE.Color(S.color);
    P.castColor.copy(col);
    P.castGlow = 1;
    const hand = this.playerHand();
    switch (id) {
      case 'blink': {
        const dirMap = { arrow_up: [0, 1], arrow_down: [0, -1], arrow_left: [-1, 0], arrow_right: [1, 0] };
        const [dx, dy] = dirMap[glyph] || [0, 1];
        const f = P.forward(new THREE.Vector3()), r = P.right(new THREE.Vector3());
        const dir = f.multiplyScalar(dy).add(r.multiplyScalar(dx)).normalize();
        const start = P.pos.clone();
        let end = start.clone().addScaledVector(dir, L.dist);
        const er = Math.hypot(end.x, end.z), lim = ARENA_R - 0.6;
        if (er > lim) end.multiplyScalar(lim / er);
        // не застревать в противнике
        for (const e of B.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(end.x - e.pos.x, end.z - e.pos.z);
          if (d < 0.9) end.addScaledVector(dir, 0.9 - d + 0.2);
        }
        const er2 = Math.hypot(end.x, end.z);
        if (er2 > lim) end.multiplyScalar(lim / er2);
        // след из частиц
        for (let i = 0; i <= 14; i++) {
          const p = start.clone().lerp(end, i / 14); p.y = 1 + Math.random() * 0.8;
          this.fx.add.add({ pos: p, vel: V((Math.random() - 0.5) * 0.5, Math.random() * 0.5, (Math.random() - 0.5) * 0.5), color: [0.4, 0.8, 1], size: 0.25, life: 0.5 + Math.random() * 0.3 });
        }
        P.pos.copy(end);
        P.invuln = Math.max(P.invuln, 0.35);
        P.fovKick = 14;
        B.sound.blink();
        // удар в спину?
        for (const e of B.enemies) {
          if (e.dead) continue;
          const toP = V(P.pos.x - e.pos.x, 0, P.pos.z - e.pos.z).normalize();
          const dot = Math.sin(e.ch.facing) * toP.x + Math.cos(e.ch.facing) * toP.z;
          if (dot < -0.3 && Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < 4) { P.backstabT = 1.6; P.target = e; B.ui.flash('rgba(120,200,255,0.25)'); }
        }
        B.ui.flash('rgba(140,210,255,0.35)');
        break;
      }
      case 'shield': {
        P.shield = { hp: L.absorb, max: L.absorb, t: L.dur, reflect: !!L.reflect };
        B.ui.shield(true);
        B.sound.shield();
        this.fx.magicBurst(hand, S.color, 25, 2);
        break;
      }
      case 'fireball': {
        const aim = this.playerAim();
        const dir = aim.clone().sub(hand).normalize();
        this.spawnProjectile({ kind: 'fire', team: 0, pos: hand, dir, speed: 19, dmg: L.dmg, burn: L.burn, radius: L.radius, color: S.color, home: P.target, size: 0.22 });
        B.sound.fireCast();
        break;
      }
      case 'frost': {
        const aim = this.playerAim();
        const dir = aim.clone().sub(hand).normalize();
        this.spawnProjectile({ kind: 'frost', team: 0, pos: hand, dir, speed: 17, dmg: L.dmg, freeze: L.freeze, color: S.color, home: P.target, size: 0.17 });
        B.sound.ice();
        break;
      }
      case 'lightning': {
        const targets = [];
        let cur = P.target && !P.target.dead ? P.target : null;
        if (!cur) { B.sound.zap(); this.boltVisual(hand, this.playerAim(), S.color); break; }
        targets.push(cur);
        for (let c = 0; c < L.chain; c++) {
          const next = B.enemies.filter((e) => !e.dead && !targets.includes(e)).sort((a, b) => a.pos.distanceTo(cur.pos) - b.pos.distanceTo(cur.pos))[0];
          if (!next || next.pos.distanceTo(cur.pos) > 8) break;
          targets.push(next); cur = next;
        }
        let from = hand.clone().lerp(targets[0].chest(), 0.12);
        targets.forEach((e, i) => {
          const to = e.chest();
          this.boltVisual(from, to, S.color);
          B.damageEnemyMagic(e, { amount: L.dmg * (i ? 0.7 : 1), kind: 'lightning', dir: to.clone().sub(from).normalize(), stun: L.stun, point: to });
          from = to;
        });
        B.sound.zap();
        B.shake(0.3);
        B.ui.flash('rgba(200,230,255,0.35)');
        break;
      }
      case 'push': {
        const f = P.forward(new THREE.Vector3());
        this.wave(P.pos.clone().addScaledVector(f, 0.8), f, S.color);
        for (const e of B.enemies) {
          const d = V(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z);
          const dist = d.length();
          if (dist > 6.5) continue;
          d.normalize();
          if (d.dot(f) < Math.cos(0.9)) continue;
          const fall = 1 - dist / 7;
          const vel = d.clone().multiplyScalar(L.force * (0.6 + fall * 0.6)).add(V(0, 3 + fall * 3, 0));
          if (e.dead) { if (e.ch.ragdoll) e.ch.ragdoll.impulseAll(vel, 1); continue; }
          B.damageEnemyMagic(e, { amount: L.dmg, kind: 'force', dir: d, knockdown: vel, point: e.chest() });
        }
        B.sound.push();
        B.shake(0.4);
        break;
      }
      case 'drain': {
        const t = P.target && !P.target.dead ? P.target : null;
        if (!t) { B.sound.fizzle(); break; }
        this.beams.push({ from: t, toPlayer: true, t: 0, dur: 1.3, total: L.total, done: 0, color: S.color });
        B.sound.drain();
        break;
      }
      case 'meteor': {
        const t = P.target && !P.target.dead ? P.target : null;
        const pos = t ? t.pos.clone() : P.pos.clone().addScaledVector(P.forward(new THREE.Vector3()), 6);
        pos.y = 0;
        this.spawnMeteor(pos, 0, L.dmg, L.radius, 1.0, t);
        break;
      }
    }
  }

  // ===== Каст врага =====
  enemyCast(e, id, lvl) {
    const B = this.battle, P = this.player, S = SPELLS[id], L = S.lv[Math.min(3, lvl) - 1];
    const hand = e.ch.pose[J.LHA].clone();
    const aim = V(P.pos.x, EYE - 0.35, P.pos.z);
    switch (id) {
      case 'fireball': {
        const dir = aim.clone().sub(hand).normalize();
        this.spawnProjectile({ kind: 'fire', team: 1, pos: hand, dir, speed: 13, dmg: L.dmg * 0.55, burn: L.burn * 0.5, radius: L.radius * 0.8, color: S.color, homePlayer: true, size: 0.22, owner: e });
        B.sound.fireCast();
        break;
      }
      case 'frost': {
        const dir = aim.clone().sub(hand).normalize();
        this.spawnProjectile({ kind: 'frost', team: 1, pos: hand, dir, speed: 13, dmg: L.dmg * 0.6, freeze: 2.2, color: S.color, homePlayer: true, size: 0.17, owner: e });
        B.sound.ice();
        break;
      }
      case 'lightning': {
        const to = aim.clone();
        this.boltVisual(hand, to, S.color);
        B.sound.zap();
        if (e.distToPlayer() < 16) B.damagePlayer({ amount: L.dmg * 0.55, dir: to.clone().sub(hand).setY(0).normalize(), source: e, kind: 'lightning', blockable: false, stun: 0.25 });
        break;
      }
      case 'push': {
        const d = e.toPlayer();
        const dist = d.length();
        d.normalize();
        this.wave(e.pos.clone().addScaledVector(d, 0.8), d, S.color);
        B.sound.push();
        if (dist < 6) B.damagePlayer({ amount: L.dmg * 0.7, dir: d, source: e, kind: 'force', blockable: false, knock: L.force * 0.9, stagger: 0.45 });
        break;
      }
      case 'blink': {
        const from = e.pos.clone();
        let to;
        const r = Math.random();
        const pf = P.forward(new THREE.Vector3()), pr = P.right(new THREE.Vector3());
        if (e.canFight && r < 0.7) to = P.pos.clone().addScaledVector(pf, -1.4).addScaledVector(pr, (Math.random() - 0.5) * 2); // за спину
        else to = V((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18);
        const rr = Math.hypot(to.x, to.z), lim = ARENA_R - 1;
        if (rr > lim) to.multiplyScalar(lim / rr);
        to.y = 0;
        for (let i = 0; i <= 10; i++) {
          const p = from.clone().lerp(to, i / 10); p.y = 1 + Math.random() * 0.6;
          this.fx.add.add({ pos: p, vel: V(0, 0.4, 0), color: [0.4, 0.8, 1], size: 0.25, life: 0.5 });
        }
        e.pos.copy(to);
        e.ch.root.copy(to);
        B.sound.blink();
        if (e.canFight) { e.thinkT = 0; }
        break;
      }
      case 'shield': {
        e.shield = { hp: L.absorb * 0.8, t: L.dur, max: L.absorb };
        B.sound.shield();
        break;
      }
      case 'drain': {
        if (e.distToPlayer() > 11) break;
        this.beams.push({ from: e, toPlayer: false, t: 0, dur: 1.3, total: L.total * 0.6, done: 0, color: S.color });
        B.sound.drain();
        break;
      }
      case 'meteor': {
        const m = this.markers.find((mk) => mk.owner === e);
        const pos = m ? m.pos.clone() : P.pos.clone();
        this.cancelMarkers(e, true);
        this.spawnMeteor(pos, 1, L.dmg * 0.45, L.radius * 0.9, 0.55, null, e);
        break;
      }
    }
  }

  // ===== Снаряды =====
  spawnProjectile(o) {
    const col = new THREE.Color(o.color);
    const core = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: o.kind === 'fire' ? 0xffe0a0 : 0xe8ffff }));
    core.scale.setScalar(o.size * 0.6);
    const glow = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(o.size);
    const g = new THREE.Group();
    g.add(core); g.add(glow);
    g.position.copy(o.pos);
    this.scene.add(g);
    this.projectiles.push({ ...o, pos: o.pos.clone(), vel: o.dir.clone().multiplyScalar(o.speed), mesh: g, glow, life: 0 });
  }

  updateProjectiles(dt) {
    const B = this.battle, P = this.player;
    const keep = [];
    for (const pr of this.projectiles) {
      pr.life += dt;
      // самонаведение
      let target = null;
      if (pr.home && !pr.home.dead) target = pr.home.chest();
      if (pr.homePlayer && !P.dead) target = V(P.pos.x, EYE - 0.4, P.pos.z);
      if (target) {
        const want = target.clone().sub(pr.pos).normalize().multiplyScalar(pr.speed);
        const turn = pr.team === 0 ? 4 : 1.3;
        pr.vel.lerp(want, Math.min(1, dt * turn)).setLength(pr.speed);
      }
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);
      pr.glow.scale.setScalar(pr.size * (1 + Math.sin(pr.life * 40) * 0.12));
      // след
      if (pr.kind === 'fire') this.fx.fire(pr.pos, 1.1, 2);
      else this.fx.add.add({ pos: pr.pos, vel: V((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4), color: [0.6, 0.95, 1], size: 0.14, life: 0.4 });
      let hit = false, hitEnemy = null;
      if (pr.team === 0) {
        for (const e of B.enemies) {
          if (e.dead) continue;
          const c = e.chest();
          if (c.distanceTo(pr.pos) < 0.45 * e.ch.scale + pr.size) { hit = true; hitEnemy = e; break; }
        }
      } else if (!P.dead) {
        const d = Math.hypot(pr.pos.x - P.pos.x, pr.pos.z - P.pos.z);
        if (d < 0.55 && pr.pos.y < EYE + 0.3) {
          // отражение щитом
          if (P.shield && P.shield.reflect) {
            pr.team = 0; pr.homePlayer = false; pr.home = pr.owner && !pr.owner.dead ? pr.owner : P.target;
            pr.vel.multiplyScalar(-1.3); pr.speed *= 1.3;
            B.sound.shieldHit(); B.ui.floatText(pr.pos, 'ОТРАЖЕНО', '#9fe8ff');
            keep.push(pr); continue;
          }
          hit = true;
        }
      }
      const r = Math.hypot(pr.pos.x, pr.pos.z);
      if (pr.pos.y < 0.05 || r > ARENA_R || pr.life > 4) hit = true;
      if (hit) { this.impact(pr, hitEnemy); pr.mesh.removeFromParent(); continue; }
      keep.push(pr);
    }
    this.projectiles = keep;
  }

  impact(pr, hitEnemy) {
    const B = this.battle, P = this.player;
    if (pr.kind === 'fire') {
      this.fx.explosion(pr.pos, pr.radius);
      B.sound.explode(pr.radius / 2.5);
      B.shake(Math.max(0.25, 0.9 - P.pos.distanceTo(pr.pos) * 0.06));
      if (pr.team === 0) {
        for (const e of B.enemies) {
          const d = e.chest().distanceTo(pr.pos);
          if (d > pr.radius + 0.4) continue;
          const fall = 1 - Math.min(1, d / (pr.radius + 0.4));
          const dir = e.chest().sub(pr.pos).setY(0).normalize();
          const vel = dir.clone().multiplyScalar(5 + fall * 8).add(V(0, 4 + fall * 4, 0));
          if (e.dead) { if (e.ch.ragdoll) e.ch.ragdoll.impulseAll(vel, 1); continue; }
          B.damageEnemyMagic(e, { amount: pr.dmg * (e === hitEnemy ? 1 : 0.5 + fall * 0.5), kind: 'fire', dir, burn: pr.burn, knockdown: fall > 0.35 || e === hitEnemy ? vel : null, point: pr.pos.clone(), explosive: true });
        }
      } else {
        const d = Math.hypot(pr.pos.x - P.pos.x, pr.pos.z - P.pos.z);
        if (d < pr.radius) {
          const dir = V(P.pos.x - pr.pos.x, 0, P.pos.z - pr.pos.z).normalize();
          B.damagePlayer({ amount: pr.dmg * (1 - d / pr.radius * 0.5), dir, source: pr.owner, kind: 'fire', blockable: true, knock: 4, burn: pr.burn });
        }
      }
    } else if (pr.kind === 'frost') {
      this.fx.magicBurst(pr.pos, 0x9ff0ff, 40, 4);
      for (let i = 0; i < 10; i++) this.fx.chunks.add(pr.pos, V((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.04 + Math.random() * 0.05, 0xc8f4ff, { life: 3 });
      B.sound.ice();
      if (pr.team === 0 && hitEnemy) {
        B.damageEnemyMagic(hitEnemy, { amount: pr.dmg, kind: 'frost', dir: pr.vel.clone().normalize(), freeze: pr.freeze, point: pr.pos.clone() });
      } else if (pr.team === 1) {
        const d = Math.hypot(pr.pos.x - P.pos.x, pr.pos.z - P.pos.z);
        if (d < 1.2) B.damagePlayer({ amount: pr.dmg, dir: pr.vel.clone().setY(0).normalize(), source: pr.owner, kind: 'frost', blockable: true, slow: 2.5 });
      }
    }
  }

  // ===== Визуал молнии =====
  boltVisual(from, to, color) {
    const b = new Bolt(this.scene, color);
    b.from = from.clone(); b.to = to.clone();
    b.place(b.from, b.to);
    this.bolts.push(b);
    this.fx.flashLight(to, 0x9fd8ff, 15, 0.3, 10);
    this.fx.sparks(to, V(0, 1, 0), 20, [0.7, 0.85, 1]);
  }

  wave(pos, dir, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(pos); m.position.y = 0.9;
    m.lookAt(pos.clone().add(dir).setY(0.9));
    m.rotateX(Math.PI / 2);
    this.scene.add(m);
    this.waves.push({ mesh: m, t: 0, dir: dir.clone() });
    for (let i = 0; i < 25; i++) {
      const v = dir.clone().multiplyScalar(6 + Math.random() * 6).add(V((Math.random() - 0.5) * 5, Math.random() * 2, (Math.random() - 0.5) * 5));
      this.fx.norm.add({ pos: pos.clone().setY(0.2), vel: v, color: [0.6, 0.5, 0.4], size: 0.4, life: 0.7, drag: 3, grow: 2, alpha: 0.5 });
    }
  }

  // ===== Метеор =====
  meteorMarker(owner, pos, dur) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.set(pos.x, 0.03, pos.z);
    m.scale.setScalar(3.2);
    this.scene.add(m);
    this.markers.push({ owner, pos: pos.clone(), mesh: m, t: 0, dur: dur + 0.6 });
  }

  cancelMarkers(owner, keepVisual = false) {
    for (const mk of this.markers) {
      if (mk.owner !== owner) continue;
      if (!keepVisual) { mk.mesh.removeFromParent(); mk.dead = true; }
    }
    if (!keepVisual) this.markers = this.markers.filter((m) => !m.dead);
  }

  spawnMeteor(pos, team, dmg, radius, delay, target, owner = null) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ color: 0x2a1a10, emissive: 0xff4400, emissiveIntensity: 0.8, roughness: 1 }));
    const start = pos.clone().add(V(-8, 22, -6));
    rock.position.copy(start);
    this.scene.add(rock);
    let marker = this.markers.find((m) => m.owner === owner && owner);
    if (!marker) {
      this.meteorMarker(null, pos, delay);
      marker = this.markers[this.markers.length - 1];
    }
    this.meteors.push({ rock, start, pos: pos.clone(), t: 0, delay, team, dmg, radius, target, marker, owner });
    this.battle.sound.meteorFall();
  }

  updateMeteors(dt) {
    const B = this.battle, P = this.player;
    for (const mk of this.markers) {
      mk.t += dt;
      mk.mesh.material.opacity = 0.4 + Math.sin(mk.t * 18) * 0.3;
      mk.mesh.rotation.y += dt * 2;
      if (mk.t > mk.dur + 2) { mk.mesh.removeFromParent(); mk.dead = true; }
    }
    this.markers = this.markers.filter((m) => !m.dead);
    const keep = [];
    for (const m of this.meteors) {
      m.t += dt;
      if (m.team === 0 && m.target && !m.target.dead && m.t < m.delay * 0.6) { m.pos.x = m.target.pos.x; m.pos.z = m.target.pos.z; if (m.marker) m.marker.mesh.position.set(m.pos.x, 0.03, m.pos.z); }
      const k = Math.min(1, m.t / m.delay);
      m.rock.position.lerpVectors(m.start, m.pos, k * k);
      m.rock.rotation.x += dt * 5; m.rock.rotation.y += dt * 3;
      this.fx.fire(m.rock.position, 2.5, 4);
      if (k >= 1) {
        m.rock.removeFromParent();
        if (m.marker) { m.marker.mesh.removeFromParent(); m.marker.dead = true; }
        const p = m.pos.clone().setY(0.3);
        this.fx.explosion(p, m.radius);
        this.fx.explosion(p.clone().setY(1), m.radius * 0.7);
        for (let i = 0; i < 20; i++) this.fx.chunks.add(p, V((Math.random() - 0.5) * 10, 4 + Math.random() * 8, (Math.random() - 0.5) * 10), 0.08 + Math.random() * 0.12, 0x3a2a1a, { life: 6 });
        B.sound.explode(1.8);
        B.shake(1.2);
        B.hitstop(0.08);
        if (m.team === 0) {
          for (const e of B.enemies) {
            const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
            if (d > m.radius) continue;
            const fall = 1 - d / m.radius;
            const dir = V(e.pos.x - p.x, 0, e.pos.z - p.z).normalize();
            const vel = dir.clone().multiplyScalar(6 + fall * 10).add(V(0, 6 + fall * 8, 0));
            if (e.dead) { if (e.ch.ragdoll) e.ch.ragdoll.impulseAll(vel, 1); continue; }
            B.damageEnemyMagic(e, { amount: m.dmg * (0.4 + fall * 0.6), kind: 'fire', dir, burn: 6, knockdown: vel, point: p, explosive: true });
          }
        } else {
          const d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
          if (d < m.radius) B.damagePlayer({ amount: m.dmg * (1 - d / m.radius * 0.6), dir: V(P.pos.x - p.x, 0, P.pos.z - p.z).normalize(), source: m.owner, kind: 'fire', blockable: false, knock: 8, stagger: 0.6 });
        }
        continue;
      }
      keep.push(m);
    }
    this.meteors = keep;
  }

  // ===== Луч вампиризма =====
  updateBeams(dt) {
    const B = this.battle, P = this.player;
    const keep = [];
    for (const b of this.beams) {
      b.t += dt;
      const e = b.from;
      if (e.dead || P.dead) continue;
      if (!b.toPlayer && (e.state === 'stagger' || e.state === 'knock' || e.status.stun > 0 || e.status.frozen > 0)) continue;
      const dist = e.distToPlayer();
      if (dist > 13) continue;
      const per = b.total / b.dur * dt;
      const ep = e.chest();
      const pp = this.playerHand();
      if (b.toPlayer) {
        B.damageEnemyMagic(e, { amount: per, kind: 'drain', dir: V(0, 0, 0), point: ep, silent: true });
        P.hp = Math.min(P.maxHp, P.hp + per);
      } else {
        B.damagePlayer({ amount: per, dir: V(0, 0, 0), source: e, kind: 'drain', blockable: false, silent: true });
        e.hp = Math.min(e.maxHp, e.hp + per);
      }
      // поток кровавых частиц
      const from = b.toPlayer ? ep : V(P.pos.x, EYE - 0.3, P.pos.z);
      const to = b.toPlayer ? pp : ep;
      for (let i = 0; i < 3; i++) {
        const v = to.clone().sub(from).multiplyScalar(2.2).add(V((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5));
        this.fx.add.add({ pos: from.clone().add(V((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)), vel: v, color: [1, 0.1, 0.15], color2: [0.4, 0, 0], size: 0.12, life: 0.45 });
      }
      if (b.t < b.dur) keep.push(b);
    }
    this.beams = keep;
  }

  update(dt) {
    this.updateProjectiles(dt);
    this.updateMeteors(dt);
    this.updateBeams(dt);
    const keepB = [];
    for (const b of this.bolts) {
      b.t += dt;
      if (b.t > 0.28) { b.dispose(); continue; }
      if (Math.random() < 0.6) b.place(b.from, b.to);
      b.mat.opacity = b.coreMat.opacity = 1 - b.t / 0.28;
      keepB.push(b);
    }
    this.bolts = keepB;
    const keepW = [];
    for (const w of this.waves) {
      w.t += dt;
      const s = 0.5 + w.t * 14;
      w.mesh.scale.set(s, s, s * 0.6);
      w.mesh.position.addScaledVector(w.dir, dt * 10);
      w.mesh.material.opacity = Math.max(0, 0.8 - w.t * 2);
      if (w.t > 0.4) { w.mesh.removeFromParent(); continue; }
      keepW.push(w);
    }
    this.waves = keepW;
  }

  clear() {
    for (const p of this.projectiles) p.mesh.removeFromParent();
    for (const b of this.bolts) b.dispose();
    for (const m of this.meteors) m.rock.removeFromParent();
    for (const m of this.markers) m.mesh.removeFromParent();
    for (const w of this.waves) w.mesh.removeFromParent();
    this.projectiles = []; this.bolts = []; this.beams = []; this.meteors = []; this.markers = []; this.waves = [];
  }
}
