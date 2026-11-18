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

  // Точка прицела: враг под прицелом или точка по направлению взгляда.
  playerAim() {
    const P = this.player;
    const t = P.spellTarget();
    if (t) return t.chest();
    const cam = this.battle.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    return cam.position.clone().addScaledVector(fwd, 14);
  }

  // Точка на земле по направлению взгляда (для метеора).
  groundAim(maxDist = 16) {
    const cam = this.battle.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let d = maxDist;
    if (fwd.y < -0.02) d = Math.min(maxDist, cam.position.y / -fwd.y);
    const p = cam.position.clone().addScaledVector(fwd, d);
    p.y = 0;
    const r = Math.hypot(p.x, p.z), lim = ARENA_R - 1;
    if (r > lim) p.multiplyScalar(lim / r);
    return p;
  }

  // Урон по любому бойцу (игроку или ИИ) от заклинания.
  hit(target, caster, o) {
    const B = this.battle;
    if (!target || target.dead) return;
    if (target.isPlayer) {
      B.damagePlayer({ amount: o.amount, dir: (o.dir || V(0, 0, 1)).clone().setY(0).normalize(), source: caster && !caster.isPlayer ? caster : null, kind: o.kind, blockable: !!o.blockable, knock: o.knock, stun: o.stunP, stagger: o.stagger, slow: o.slow, silent: o.silent });
    } else {
      B.damageEnemyMagic(target, { amount: o.amount, kind: o.kind, dir: o.dir, point: o.point || target.chest(), burn: o.burn, stun: o.stun, freeze: o.freeze, knockdown: o.knockdown, explosive: o.explosive, silent: o.silent, attacker: caster });
    }
  }

  // Все живые бойцы, враждебные команде team.
  foesOfTeam(team) { return this.battle.combatants().filter((c) => c.team !== team); }

  // ===== Каст игрока =====
  playerCast(id, lvl, glyph) {
    const B = this.battle, P = this.player, S = SPELLS[id], L = S.lv[lvl - 1];
    const col = new THREE.Color(S.color);
    P.castColor.copy(col);
    P.castGlow = 1;
    const hand = this.playerHand();
    const foes = B.hostilesOf(P);
    const corpses = B.enemies.filter((e) => e.dead);
    const aimed = P.spellTarget();
    switch (id) {
      case 'blink': {
        const dirMap = { arrow_up: [0, 1], arrow_down: [0, -1], arrow_left: [-1, 0], arrow_right: [1, 0] };
        const [dx, dy] = dirMap[glyph] || [0, 1];
        const f = P.forward(new THREE.Vector3()), r = P.right(new THREE.Vector3());
        const dir = f.multiplyScalar(dy).add(r.multiplyScalar(dx)).normalize();
        const start = P.pos.clone(); start.y = 0;
        // идём по пути шагами и останавливаемся перед стеной, столбом или краем арены
        const H = B.hazards;
        const ok = (q, r) => (H ? H.walkable(q, r) : Math.hypot(q.x, q.z) <= ARENA_R - 0.6);
        const blockers = B.combatants().filter((c) => !c.isPlayer).concat(B.beasts.filter((b) => !b.dead));
        const inBody = (q) => blockers.some((c) => Math.hypot(q.x - c.pos.x, q.z - c.pos.z) < 0.85);
        let end = start.clone();
        const stepLen = 0.15, steps = Math.ceil(L.dist / stepLen);
        for (let i = 1; i <= steps; i++) {
          const q = start.clone().addScaledVector(dir, Math.min(L.dist, i * stepLen));
          if (!ok(q, 0.6)) break;
          end.copy(q);
        }
        // нельзя оказаться внутри противника: сначала пробуем проскочить за него, иначе отступаем
        if (inBody(end)) {
          let fixed = null;
          for (let k = 1; k <= 8; k++) {
            const q = end.clone().addScaledVector(dir, k * stepLen);
            if (!ok(q, 0.6)) break;
            if (!inBody(q)) { fixed = q; break; }
          }
          if (!fixed) {
            for (let k = 1; k <= steps; k++) {
              const q = end.clone().addScaledVector(dir, -k * stepLen);
              if (q.distanceTo(start) > L.dist + 0.01) break;
              if (!inBody(q) && ok(q, 0.6)) { fixed = q; break; }
            }
          }
          end = fixed || start.clone();
        }
        for (let i = 0; i <= 14; i++) {
          const p = start.clone().lerp(end, i / 14); p.y = 1 + Math.random() * 0.8;
          this.fx.add.add({ pos: p, vel: V((Math.random() - 0.5) * 0.5, Math.random() * 0.5, (Math.random() - 0.5) * 0.5), color: [0.4, 0.8, 1], size: 0.25, life: 0.5 + Math.random() * 0.3 });
        }
        if (end.distanceTo(start) < 0.3) { B.ui.centerText('Блинк упёрся в препятствие', 'fail'); }
        P.pos.copy(end); P.pos.y = 0;
        P.invuln = Math.max(P.invuln, 0.35);
        P.fovKick = 14;
        B.sound.blink();
        for (const e of foes) {
          const toP = V(P.pos.x - e.pos.x, 0, P.pos.z - e.pos.z).normalize();
          const dot = Math.sin(e.ch.facing) * toP.x + Math.cos(e.ch.facing) * toP.z;
          if (dot < -0.3 && Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < 4) { P.backstabT = 1.6; B.ui.flash('rgba(120,200,255,0.25)'); }
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
        const dir = this.playerAim().sub(hand).normalize();
        this.spawnProjectile({ kind: 'fire', team: 0, owner: P, pos: hand, dir, speed: 19, dmg: L.dmg, burn: L.burn, radius: L.radius, color: S.color, homeTarget: aimed, turn: 2, size: 0.22 });
        B.sound.fireCast();
        break;
      }
      case 'frost': {
        const dir = this.playerAim().sub(hand).normalize();
        this.spawnProjectile({ kind: 'frost', team: 0, owner: P, pos: hand, dir, speed: 17, dmg: L.dmg, freeze: L.freeze, color: S.color, homeTarget: aimed, turn: 2, size: 0.17 });
        B.sound.ice();
        break;
      }
      case 'lightning': {
        const targets = [];
        let cur = aimed;
        if (!cur) { B.sound.zap(); this.boltVisual(hand, this.playerAim(), S.color); B.ui.centerText('Молния: нет цели в прицеле', 'fail'); break; }
        targets.push(cur);
        for (let c = 0; c < L.chain; c++) {
          const next = foes.filter((e) => !targets.includes(e)).sort((a, b) => a.pos.distanceTo(cur.pos) - b.pos.distanceTo(cur.pos))[0];
          if (!next || next.pos.distanceTo(cur.pos) > 8) break;
          targets.push(next); cur = next;
        }
        let from = hand.clone().lerp(targets[0].chest(), 0.12);
        targets.forEach((e, i) => {
          const to = e.chest();
          this.boltVisual(from, to, S.color);
          this.hit(e, P, { amount: L.dmg * (i ? 0.7 : 1), kind: 'lightning', dir: to.clone().sub(from).normalize(), stun: L.stun, point: to });
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
        // толчок бьёт туда, куда смотрит игрок
        for (const e of [...foes, ...corpses]) {
          const d = V(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z);
          if (e.dead && e.ch.ragdoll) d.set(e.ch.ragdoll.p[J.PELVIS].x - P.pos.x, 0, e.ch.ragdoll.p[J.PELVIS].z - P.pos.z);
          const dist = d.length();
          if (dist > 6.5) continue;
          d.normalize();
          if (d.dot(f) < Math.cos(0.9)) continue;
          const fall = 1 - dist / 7;
          const vel = d.clone().multiplyScalar(L.force * (0.6 + fall * 0.6)).add(V(0, 3 + fall * 3, 0));
          if (e.dead) { if (e.ch.ragdoll) e.ch.ragdoll.impulseAll(vel, 1); continue; }
          this.hit(e, P, { amount: L.dmg, kind: 'force', dir: d, knockdown: vel, point: e.chest() });
        }
        for (const b of B.beasts) {
          if (b.dead) continue;
          const d = V(b.pos.x - P.pos.x, 0, b.pos.z - P.pos.z);
          if (d.length() < 6 && d.normalize().dot(f) > Math.cos(0.9)) { b.vel.addScaledVector(d, L.force * 0.6); b.hurt(L.dmg, d); }
        }
        B.sound.push();
        B.shake(0.4);
        break;
      }
      case 'drain': {
        const t = aimed;
        if (!t) { B.sound.fizzle(); B.ui.centerText('Кровопийца: нет цели в прицеле', 'fail'); break; }
        this.beams.push({ caster: P, target: t, t: 0, dur: 1.3, total: L.total, color: S.color });
        B.sound.drain();
        break;
      }
      case 'meteor': {
        const t = aimed;
        const pos = t ? t.pos.clone() : this.groundAim();
        pos.y = 0;
        this.spawnMeteor(pos, 0, L.dmg, L.radius, 1.0, t, P);
        break;
      }
    }
  }

  // ===== Каст ИИ-бойца (врага или союзника) =====
  enemyCast(e, id, lvl) {
    const B = this.battle, S = SPELLS[id], L = S.lv[Math.min(3, lvl) - 1];
    const T = e.foe && !e.foe.dead ? e.foe : null;
    const hand = e.ch.pose[J.LHA].clone();
    const scale = 0.55;
    if (!T && id !== 'shield') return;
    const aim = T ? T.chest().add(V(0, 0.1, 0)) : null;
    switch (id) {
      case 'fireball': {
        const dir = aim.clone().sub(hand).normalize();
        this.spawnProjectile({ kind: 'fire', team: e.team, pos: hand, dir, speed: 13, dmg: L.dmg * scale, burn: L.burn * 0.5, radius: L.radius * 0.8, color: S.color, homeTarget: T, turn: 1.3, size: 0.22, owner: e });
        B.sound.fireCast();
        break;
      }
      case 'frost': {
        const dir = aim.clone().sub(hand).normalize();
        this.spawnProjectile({ kind: 'frost', team: e.team, pos: hand, dir, speed: 13, dmg: L.dmg * 0.6, freeze: 2.0, color: S.color, homeTarget: T, turn: 1.3, size: 0.17, owner: e });
        B.sound.ice();
        break;
      }
      case 'lightning': {
        if (B.hazards && B.hazards.losBlocked(e.pos, T.pos)) break;
        this.boltVisual(hand, aim, S.color);
        B.sound.zap();
        if (e.distTo(T) < 16) this.hit(T, e, { amount: L.dmg * scale, kind: 'lightning', dir: aim.clone().sub(hand), stun: L.stun * 0.7, stunP: 0.25 });
        break;
      }
      case 'push': {
        const d = e.toward(T).clone().normalize();
        this.wave(e.pos.clone().addScaledVector(d, 0.8), d, S.color);
        B.sound.push();
        for (const c of this.foesOfTeam(e.team)) {
          const dd = V(c.pos.x - e.pos.x, 0, c.pos.z - e.pos.z);
          const dist = dd.length();
          if (dist > 6) continue;
          dd.normalize();
          if (dd.dot(d) < Math.cos(0.9)) continue;
          if (c.isPlayer) this.hit(c, e, { amount: L.dmg * 0.7, kind: 'force', dir: dd, knock: L.force * 0.9, stagger: 0.45 });
          else this.hit(c, e, { amount: L.dmg * 0.7, kind: 'force', dir: dd, knockdown: dd.clone().multiplyScalar(L.force * 0.8).add(V(0, 3.5, 0)) });
        }
        break;
      }
      case 'blink': {
        const from = e.pos.clone();
        let to;
        const tf = T.isPlayer ? T.forward(new THREE.Vector3()) : V(Math.sin(T.ch.facing), 0, Math.cos(T.ch.facing));
        const tr = V(tf.z, 0, -tf.x);
        if (e.canFight && Math.random() < 0.7) to = T.pos.clone().addScaledVector(tf, -1.4).addScaledVector(tr, (Math.random() - 0.5) * 2);
        else to = V((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18);
        const rr = Math.hypot(to.x, to.z), lim = ARENA_R - 1;
        if (rr > lim) to.multiplyScalar(lim / rr);
        to.y = 0;
        if (B.hazards) {
          if (!B.hazards.isFree(to.x, to.z)) to.copy(B.hazards.freeNear(to.x, to.z));
          if (!B.hazards.walkable(to, 0.5)) to.copy(from);
        }
        for (let i = 0; i <= 10; i++) {
          const p = from.clone().lerp(to, i / 10); p.y = 1 + Math.random() * 0.6;
          this.fx.add.add({ pos: p, vel: V(0, 0.4, 0), color: [0.4, 0.8, 1], size: 0.25, life: 0.5 });
        }
        e.pos.copy(to);
        B.sound.blink();
        if (e.canFight) e.thinkT = 0;
        break;
      }
      case 'shield': {
        e.shield = { hp: L.absorb * 0.8, t: L.dur, max: L.absorb };
        B.sound.shield();
        break;
      }
      case 'drain': {
        if (e.distTo(T) > 11) break;
        this.beams.push({ caster: e, target: T, t: 0, dur: 1.3, total: L.total * 0.6, color: S.color });
        B.sound.drain();
        break;
      }
      case 'meteor': {
        const m = this.markers.find((mk) => mk.owner === e);
        const pos = m ? m.pos.clone() : T.pos.clone();
        this.cancelMarkers(e, true);
        this.spawnMeteor(pos, e.team, L.dmg * 0.45, L.radius * 0.9, 0.55, null, e);
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
      const ht = pr.homeTarget;
      if (ht && !ht.dead) {
        const want = ht.chest().sub(pr.pos).normalize().multiplyScalar(pr.speed);
        pr.vel.lerp(want, Math.min(1, dt * (pr.turn || 1.3))).setLength(pr.speed);
      }
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);
      pr.glow.scale.setScalar(pr.size * (1 + Math.sin(pr.life * 40) * 0.12));
      if (pr.kind === 'fire') this.fx.fire(pr.pos, 1.1, 2);
      else this.fx.add.add({ pos: pr.pos, vel: V((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4), color: [0.6, 0.95, 1], size: 0.14, life: 0.4 });
      let hit = false, hitTarget = null;
      for (const c of B.combatants()) {
        if (c.team === pr.team) continue;
        if (c.isPlayer) {
          const d = Math.hypot(pr.pos.x - c.pos.x, pr.pos.z - c.pos.z);
          if (d < 0.55 && pr.pos.y < EYE + 0.3) {
            if (c.shield && c.shield.reflect) {
              pr.team = 0; pr.homeTarget = pr.owner && !pr.owner.dead ? pr.owner : null; pr.turn = 4;
              pr.vel.multiplyScalar(-1.3); pr.speed *= 1.3; pr.owner = c;
              B.sound.shieldHit(); B.ui.floatText(pr.pos, 'ОТРАЖЕНО', '#9fe8ff');
              hit = 'reflect';
              break;
            }
            hit = true; hitTarget = c; break;
          }
        } else if (c.chest().distanceTo(pr.pos) < 0.45 * c.ch.scale + pr.size) { hit = true; hitTarget = c; break; }
      }
      if (hit === 'reflect') { keep.push(pr); continue; }
      const r = Math.hypot(pr.pos.x, pr.pos.z);
      if (pr.pos.y < 0.05 || r > ARENA_R || pr.life > 4) hit = true;
      if (B.hazards && B.hazards.pointInWall(pr.pos, pr.size)) hit = true;
      if (hit) { this.impact(pr, hitTarget); pr.mesh.removeFromParent(); continue; }
      keep.push(pr);
    }
    this.projectiles = keep;
  }

  impact(pr, hitTarget) {
    const B = this.battle, P = this.player;
    const caster = pr.owner || null;
    if (pr.kind === 'fire') {
      this.fx.explosion(pr.pos, pr.radius);
      B.sound.explode(pr.radius / 2.5);
      B.shake(Math.max(0.25, 0.9 - P.pos.distanceTo(pr.pos) * 0.06));
      for (const c of this.foesOfTeam(pr.team)) {
        const cp = c.chest();
        const d = cp.distanceTo(pr.pos);
        if (d > pr.radius + 0.4) continue;
        const fall = 1 - Math.min(1, d / (pr.radius + 0.4));
        const dir = cp.sub(pr.pos).setY(0).normalize();
        if (c.isPlayer) {
          this.hit(c, caster, { amount: pr.dmg * (1 - (1 - fall) * 0.5), kind: 'fire', dir, blockable: true, knock: 4 });
        } else {
          const vel = dir.clone().multiplyScalar(5 + fall * 8).add(V(0, 4 + fall * 4, 0));
          this.hit(c, caster, { amount: pr.dmg * (c === hitTarget ? 1 : 0.5 + fall * 0.5), kind: 'fire', dir, burn: pr.burn, knockdown: fall > 0.35 || c === hitTarget ? vel : null, point: pr.pos.clone(), explosive: true });
        }
      }
      for (const e of B.enemies) {
        if (!e.dead || !e.ch.ragdoll) continue;
        const d = e.ch.ragdoll.p[J.PELVIS].distanceTo(pr.pos);
        if (d < pr.radius + 0.5) e.ch.ragdoll.impulseAll(e.ch.ragdoll.p[J.PELVIS].clone().sub(pr.pos).setY(0).normalize().multiplyScalar(6).add(V(0, 5, 0)), 1);
      }
      for (const b of B.beasts) if (!b.dead && b.chest().distanceTo(pr.pos) < pr.radius + 0.5) b.hurt(pr.dmg * 0.6, b.chest().sub(pr.pos).setY(0).normalize());
    } else if (pr.kind === 'frost') {
      this.fx.magicBurst(pr.pos, 0x9ff0ff, 40, 4);
      for (let i = 0; i < 10; i++) this.fx.chunks.add(pr.pos, V((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.04 + Math.random() * 0.05, 0xc8f4ff, { life: 3 });
      B.sound.ice();
      if (hitTarget) {
        if (hitTarget.isPlayer) this.hit(hitTarget, caster, { amount: pr.dmg, kind: 'frost', dir: pr.vel.clone(), blockable: true, slow: 2.5 });
        else this.hit(hitTarget, caster, { amount: pr.dmg, kind: 'frost', dir: pr.vel.clone().normalize(), freeze: pr.freeze, point: pr.pos.clone() });
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
    let marker = owner && !owner.isPlayer ? this.markers.find((m) => m.owner === owner) : null;
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
      if (m.target && !m.target.dead && m.t < m.delay * 0.6) { m.pos.x = m.target.pos.x; m.pos.z = m.target.pos.z; if (m.marker) m.marker.mesh.position.set(m.pos.x, 0.03, m.pos.z); }
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
        for (const c of this.foesOfTeam(m.team)) {
          const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
          if (d > m.radius) continue;
          const fall = 1 - d / m.radius;
          const dir = V(c.pos.x - p.x, 0, c.pos.z - p.z).normalize();
          if (c.isPlayer) this.hit(c, m.owner, { amount: m.dmg * (1 - (1 - fall) * 0.6), kind: 'fire', dir, knock: 8, stagger: 0.6 });
          else this.hit(c, m.owner, { amount: m.dmg * (0.4 + fall * 0.6), kind: 'fire', dir, burn: 6, knockdown: dir.clone().multiplyScalar(6 + fall * 10).add(V(0, 6 + fall * 8, 0)), point: p, explosive: true });
        }
        for (const e of B.enemies) {
          if (!e.dead || !e.ch.ragdoll) continue;
          const pel = e.ch.ragdoll.p[J.PELVIS];
          if (Math.hypot(pel.x - p.x, pel.z - p.z) < m.radius) e.ch.ragdoll.impulseAll(V(pel.x - p.x, 0, pel.z - p.z).normalize().multiplyScalar(8).add(V(0, 8, 0)), 1);
        }
        for (const b of B.beasts) if (!b.dead && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < m.radius) b.hurt(m.dmg * 0.7, V(b.pos.x - p.x, 0, b.pos.z - p.z).normalize());
        continue;
      }
      keep.push(m);
    }
    this.meteors = keep;
  }

  // ===== Луч вампиризма =====
  updateBeams(dt) {
    const keep = [];
    for (const b of this.beams) {
      b.t += dt;
      const c = b.caster, t = b.target;
      if (c.dead || t.dead) continue;
      if (!c.isPlayer && (c.state === 'stagger' || c.state === 'knock' || c.status.stun > 0 || c.status.frozen > 0)) continue;
      if (Math.hypot(c.pos.x - t.pos.x, c.pos.z - t.pos.z) > 13) continue;
      const per = b.total / b.dur * dt;
      this.hit(t, c, { amount: per, kind: 'drain', dir: V(0, 0, 0), silent: true });
      c.hp = Math.min(c.maxHp, c.hp + per);
      const from = t.isPlayer ? V(t.pos.x, EYE - 0.3, t.pos.z) : t.chest();
      const to = c.isPlayer ? this.playerHand() : c.chest();
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
