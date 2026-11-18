// Бой: связывает игрока, врагов, заклинания и эффекты; считает урон и расчленение.
import * as THREE from 'three';
import { getFight, SPELLS } from './data.js';
import { Player, EYE } from './player.js';
import { Enemy } from './enemy.js';
import { Spells } from './spells.js';
import { J, updateLoosePiece } from './character.js';
import { ARENA_R } from './arena.js';
import { GLYPH_TO_SPELL } from './gesture.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();

// Ближайшие точки двух отрезков (Ericson, RTCD).
function segSeg(p1, q1, p2, q2, c1, c2) {
  const d1 = _a.subVectors(q1, p1), d2 = _b.subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  const EPS = 1e-8;
  if (a <= EPS && e <= EPS) { s = t = 0; }
  else if (a <= EPS) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e <= EPS) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), denom = a * e - b * b;
      s = denom !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  c1.copy(p1).addScaledVector(d1, s);
  c2.copy(p2).addScaledVector(d2, t);
  return { dist: c1.distanceTo(c2), s, t };
}

const PART_MULT = { head: 1.7, neck: 1.5, torso: 1, larm: 0.75, rarm: 0.75, lfore: 0.65, rfore: 0.65, lleg: 0.8, rleg: 0.8, lshin: 0.7, rshin: 0.7 };
const PART_JOINT = { head: J.HEAD, neck: J.NECK, torso: J.NECK, larm: J.LEL, rarm: J.REL, lfore: J.LHA, rfore: J.RHA, lleg: J.LKN, rleg: J.RKN, lshin: J.LFT, rshin: J.RFT };

export class Battle {
  constructor(game, fightN) {
    this.game = game;
    this.scene = game.scene;
    this.camera = game.camera;
    this.fx = game.fx;
    this.sound = game.sound;
    this.haptics = game.haptics;
    this.ui = game.ui;
    this.save = game.save;
    this.fight = getFight(fightN);
    this.fightN = fightN;
    this.time = 0;
    this.timeScale = 1;
    this.hitstopT = 0;
    this.slowT = 0; this.slowScale = 1;
    this.trauma = 0;
    this.shakeOffset = { pos: V(0, 0, 0), rot: V(0, 0, 0) };
    this.loose = [];
    this.events = [];
    this.runeMode = false;
    this.runeT = 0;
    this.started = false;
    this.over = false;
    this.result = null;
    this.stats = { decap: 0, dismember: 0, parries: 0, damageTaken: 0, kills: 0, gibbed: 0, backstabs: 0, maxCombo: 0 };
    this.combo = 0; this.comboT = 0;
    this.fx.clear();
    this.fx.drops.camPos = this.camera.position;
    let lastSplash = 0;
    this.fx.drops.onScreenHit = () => { const t = performance.now(); if (t - lastSplash > 250) { lastSplash = t; this.ui.screenBlood(0.35); } };
    this.player = new Player(this, game.save);
    const n = this.fight.enemies.length;
    this.enemies = this.fight.enemies.map((def, i) => {
      const spread = n === 1 ? 0 : (i - (n - 1) / 2) * 2.4;
      return new Enemy(this, def, V(spread, 0, -4.5));
    });
    this.player.pos.set(0, 0, 5);
    this.player.yaw = 0;
    this.player.pickTarget();
    this.spells = new Spells(this);
    this.countdown = 2.4;
    this.ui.battleStart(this);
    this.sound.crowd(0.05);
  }

  dispose() {
    this.player.dispose();
    for (const e of this.enemies) e.dispose();
    for (const p of this.loose) {
      if (p.segs) for (const s of p.segs) s.group.removeFromParent();
      if (p.group) p.group.removeFromParent();
      if (p.weaponPart) p.weaponPart.group.removeFromParent();
    }
    this.spells.clear();
    this.fx.clear();
    this.fx.drops.camPos = null;
    this.fx.drops.onScreenHit = null;
  }

  // ===== Время и тряска =====
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  slowmo(scale, t) { this.slowScale = Math.min(this.slowScale, scale); this.slowT = Math.max(this.slowT, t); if (this.slowScale >= 1) this.slowScale = scale; }
  shake(amount) { this.trauma = Math.min(1.2, this.trauma + amount); }

  updateShake(rdt) {
    this.trauma = Math.max(0, this.trauma - rdt * 1.8);
    const s = this.trauma * this.trauma;
    const t = performance.now() / 1000;
    const n = (k) => Math.sin(t * 47 + k) * 0.6 + Math.sin(t * 73 + k * 2.3) * 0.4;
    this.shakeOffset.pos.set(n(1) * 0.04 * s, n(2) * 0.04 * s, 0);
    this.shakeOffset.rot.set(n(3) * 0.03 * s, n(4) * 0.03 * s, n(5) * 0.05 * s);
  }

  physEvents(enemy) {
    const ev = [];
    ev.owner = enemy;
    this.events.push(ev);
    return ev;
  }

  // ===== Главный цикл =====
  update(rdt, input) {
    // масштаб времени
    let ts = 1;
    if (this.runeMode) ts = 0.12;
    if (this.slowT > 0) { this.slowT -= rdt; ts = Math.min(ts, this.slowScale); if (this.slowT <= 0) this.slowScale = 1; }
    if (this.hitstopT > 0) { this.hitstopT -= rdt; ts = Math.min(ts, 0.04); }
    this.timeScale = ts;
    const dt = rdt * ts;
    this.time += dt;
    this.updateShake(rdt);
    if (this.runeMode) {
      this.runeT += rdt;
      if (this.runeT > 4.5) this.setRuneMode(false);
    }
    // отсчёт
    if (!this.started) {
      this.countdown -= rdt;
      this.ui.countdown(this.countdown);
      if (this.countdown <= 0) { this.started = true; this.sound.gong(); this.sound.cheer(1); this.game.arena.cheer(1); }
    }
    this.handleInput(input);
    this.player.update(dt, input);
    for (const e of this.enemies) e.update(dt);
    const evs = this.events.slice();
    this.events.length = 0;
    for (const ev of evs) if (ev.length) this.processImpacts(ev.owner, ev);
    // физика отрубленных частей
    for (const p of this.loose) {
      const ev = [];
      updateLoosePiece(p, dt, ARENA_R, ev);
      for (const e of ev) if (e.speed > 6) this.sound.thud(e.speed / 8);
    }
    this.handleRagdollCollisions();
    this.spells.update(dt);
    this.fx.update(dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.checkEnd(rdt);
    this.ui.updateHud(this);
  }

  // столкновения рэгдоллов со стенами и другими врагами (боулинг)
  handleRagdollCollisions() {
    for (const e of this.enemies) {
      if (e.ch.mode !== 'ragdoll' || !e.ch.ragdoll) continue;
      const rd = e.ch.ragdoll;
      const pel = rd.p[J.PELVIS], pv = rd.v[J.PELVIS];
      const sp = pv.length();
      if (sp > 5) {
        for (const o of this.enemies) {
          if (o === e || o.dead || o.ch.mode !== 'anim') continue;
          const d = Math.hypot(o.pos.x - pel.x, o.pos.z - pel.z);
          if (d < 0.8 && pel.y < 1.6) {
            const vel = pv.clone().multiplyScalar(0.7).add(V(0, 2, 0));
            this.damageEnemyMagic(o, { amount: sp * 1.5, kind: 'impact', dir: pv.clone().normalize(), knockdown: vel, point: o.chest() });
            rd.impulseAll(pv.clone().multiplyScalar(-0.4), 1);
            this.ui.floatText(o.chest(), 'СТРАЙК!', '#ffcc33');
            this.sound.thud(2);
          }
        }
      }
    }
  }

  // ===== Ввод =====
  handleInput(input) {
    const P = this.player;
    for (const ev of input.consume()) {
      if (this.over) continue;
      if (!this.started && ev.type !== 'pause') continue;
      switch (ev.type) {
        case 'press': if (!this.runeMode) P.pressBlock(); break;
        case 'release': P.releaseBlock(); break;
        case 'swing': if (!this.runeMode) P.startSwing(ev.a, ev.b, ev.speed); break;
        case 'thrust': if (!this.runeMode) P.startThrust(ev.p); break;
        case 'dash': P.doDash(input.move); break;
        case 'rune': this.setRuneMode(!this.runeMode); break;
        case 'runeCast': this.castRune(ev.result); break;
        case 'quickcast': this.quickCast(ev.spell, ev.glyph); break;
        case 'target': P.pickTarget(true); this.sound.click(); break;
        case 'pause': this.game.pause(); break;
      }
    }
  }

  setRuneMode(on) {
    if (this.player.dead || this.over) on = false;
    if (on === this.runeMode) return;
    this.runeMode = on;
    this.runeT = 0;
    this.game.input.setRuneMode(on);
    this.ui.runeMode(on, this);
    if (on) { this.sound.runeOpen(); this.player.releaseBlock(); }
  }

  castRune(result) {
    const P = this.player;
    this.setRuneMode(false);
    if (!result || !result.ok) {
      this.ui.centerText('Руна не распознана', 'fail');
      this.sound.fizzle();
      return;
    }
    const spell = GLYPH_TO_SPELL[result.glyph];
    this.quickCast(spell, result.glyph);
  }

  quickCast(spell, glyph) {
    const P = this.player;
    const lvl = this.save.spells[spell];
    if (!lvl) { this.ui.centerText('Заклинание не изучено', 'fail'); this.sound.fizzle(); return; }
    const S = SPELLS[spell];
    if (P.mana < S.mana) { this.ui.centerText('Мало маны', 'fail'); this.sound.fizzle(); return; }
    P.mana -= S.mana;
    this.sound.runeOk();
    this.ui.spellCast(S);
    this.spells.playerCast(spell, lvl, glyph || 'arrow_up');
    this.haptics.pulse(1);
  }

  onPlayerSwing() {
    for (const e of this.enemies) e.onPlayerSwing();
  }

  // ===== Попадания игрока =====
  sweepHits(P, s, u0, u1) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const steps = Math.max(1, Math.ceil((u1 - u0) / 0.035));
    const reach = P.wtype.reach;
    for (let i = 1; i <= steps; i++) {
      if (!P.swing) return;
      const u = u0 + (u1 - u0) * (i / steps);
      const ndc = { x: s.a.x + (s.b.x - s.a.x) * u, y: s.a.y + (s.b.y - s.a.y) * u };
      const dir = P.rayLocal(ndc, new THREE.Vector3()).applyQuaternion(cam.quaternion);
      const p0 = camPos.clone().addScaledVector(dir, 0.25);
      const p1 = camPos.clone().addScaledVector(dir, reach);
      // направление движения клинка в мире
      const ndc2 = { x: s.a.x + (s.b.x - s.a.x) * Math.min(1, u + 0.05), y: s.a.y + (s.b.y - s.a.y) * Math.min(1, u + 0.05) };
      const ndc1 = { x: s.a.x + (s.b.x - s.a.x) * Math.max(0, u - 0.05), y: s.a.y + (s.b.y - s.a.y) * Math.max(0, u - 0.05) };
      const sdir = P.rayLocal(ndc2, new THREE.Vector3()).sub(P.rayLocal(ndc1, new THREE.Vector3())).applyQuaternion(cam.quaternion).normalize();
      sdir.addScaledVector(dir, 0.35).normalize();
      if (this.testBlade(P, s, p0, p1, sdir)) return;
    }
  }

  thrustHits(P, s, depth) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const dir = P.rayLocal(s.a, new THREE.Vector3()).applyQuaternion(cam.quaternion);
    const reach = P.wtype.reach * (0.6 + 0.45 * depth);
    const p0 = camPos.clone().addScaledVector(dir, 0.25);
    const p1 = camPos.clone().addScaledVector(dir, reach);
    this.testBlade(P, s, p0, p1, dir.clone());
  }

  // Проверка клинка против капсул всех врагов. Возвращает true, если удар остановлен блоком.
  testBlade(P, s, p0, p1, sdir) {
    const hits = [];
    const len = p0.distanceTo(p1);
    for (const e of this.enemies) {
      if (s.hit.has(e)) continue;
      let best = null;
      for (const c of e.ch.getCapsules()) {
        const res = segSeg(p0, p1, c.a, c.b, _c1, _c2);
        const margin = e.dead ? 0.02 : 0.07;
        if (res.dist < c.r + margin) {
          // торс — «запасная» цель: мелкие части приоритетнее
          const score = res.s * len + (c.part === 'torso' ? 0.3 : c.part === 'head' ? 0.06 : 0);
          if (!best || score < best.score) {
            const point = _c2.clone().add(_c1.clone().sub(_c2).clampLength(0, c.r));
            best = { e, part: c.part, point, score };
          }
        }
      }
      if (best) hits.push(best);
    }
    hits.sort((a, b) => (a.e.dead - b.e.dead) || (a.score - b.score));
    for (const h of hits) {
      s.hit.add(h.e);
      if (this.playerHitEnemy(P, s, h.e, h.part, h.point, sdir)) return true;
    }
    return false;
  }

  // Удары рэгдоллов о стены и землю.
  processImpacts(e, evs) {
    for (const ev of evs) {
      if (ev.type === 'wall' && ev.speed > 5.5) {
        this.sound.thud(ev.speed / 5);
        this.fx.decals.addWall(ev.pos, 0.35 + ev.speed * 0.04);
        this.fx.blood(ev.pos, V(-ev.pos.x, 0.3, -ev.pos.z).normalize(), 1, 3);
        this.fx.dust(ev.pos, 6);
        if (!e.dead && e.time - (e.lastImpactT || -9) > 0.35) {
          e.lastImpactT = e.time;
          const dmg = (ev.speed - 4.5) * 5.5;
          this.ui.floatText(ev.pos, 'В СТЕНУ!', '#ffcc33');
          this.shake(0.3);
          this.damageEnemyMagic(e, { amount: dmg, kind: 'impact', dir: V(-ev.pos.x, 0, -ev.pos.z).normalize(), point: ev.pos.clone() });
        }
      } else if (ev.type === 'ground' && ev.speed > 7) {
        this.sound.thud(ev.speed / 7);
        this.fx.dust(ev.pos, 5);
        if (!e.dead && ev.speed > 11 && e.time - (e.lastImpactT || -9) > 0.35) {
          e.lastImpactT = e.time;
          this.damageEnemyMagic(e, { amount: (ev.speed - 9) * 3, kind: 'impact', dir: V(0, 1, 0), point: ev.pos.clone() });
        }
      }
    }
  }

  playerHitEnemy(P, s, e, part, point, dir) {
    const W = P.wtype;
    const kind = s.kind;
    const fx = this.fx;
    // по трупу — только кровь и расчленение
    if (e.dead) {
      fx.blood(point, dir, 1.2, 4);
      this.sound.hit(0.6);
      if (PART_JOINT[part] !== undefined && Math.random() < W.sever * 1.4 + 0.1) this.severPart(e, part, dir, 1);
      P.bloodOnBlade = Math.min(1, (P.bloodOnBlade || 0) + 0.15);
      s.hits++;
      if (e.ch.ragdoll) e.ch.ragdoll.impulse(PART_JOINT[part] ?? J.PELVIS, dir.clone().multiplyScalar(W.knock * 0.8));
      return false;
    }
    const toP = V(P.pos.x - e.pos.x, 0, P.pos.z - e.pos.z).normalize();
    const facing = Math.sin(e.ch.facing) * toP.x + Math.cos(e.ch.facing) * toP.z;
    const backstab = P.backstabT > 0 || facing < -0.35;
    // блок врага
    if (e.blocking && facing > 0.25 && !backstab) {
      fx.sparks(point, dir.clone().multiplyScalar(-1), 22);
      this.sound.clang();
      this.haptics.pulse(1);
      if (W.guardBreak) {
        e.stagger(0.95);
        this.ui.floatText(e.chest(), 'БЛОК ПРОБИТ', '#ffaa33');
        this.hitstop(0.06);
        return true;
      }
      // идеальное парирование опытного врага
      if (e.time - e.blockStart < 0.18 && e.skill > 0.6) {
        P.stagger(0.6);
        this.ui.floatText(e.chest(), 'ПАРИРОВАНО', '#ff6644');
        this.sound.parry();
      } else {
        P.recoil(point);
        this.ui.floatText(e.chest(), 'БЛОК', '#cccccc');
      }
      e.vel.addScaledVector(toP, -1.5);
      this.hitstop(0.05);
      return true;
    }
    // магический щит
    let dmg = this.wdmg(P, s) * PART_MULT[part];
    const armor = part === 'head' || part === 'neck' ? e.armor.head : part === 'torso' ? e.armor.body : e.armor.limbs;
    const effArmor = armor * (1 - W.armorPierce);
    dmg *= 100 / (100 + effArmor * 4);
    if (backstab) { dmg *= W.backstab; this.stats.backstabs++; }
    if (e.status.frozen > 0) dmg *= 1.5;
    if (e.status.stun > 0) dmg *= 1.2;
    if (e.ch.mode === 'ragdoll') dmg *= 1.25;
    if (s.hits > 0) dmg *= 0.7;
    if (e.shield) {
      const absorbed = Math.min(e.shield.hp, dmg);
      e.shield.hp -= absorbed;
      dmg -= absorbed;
      e.shieldMesh.material.uniforms.hit.value = 1;
      this.sound.shieldHit();
      fx.magicBurst(point, 0x88e0ff, 12, 3);
      if (dmg <= 0.5) { P.recoil(point); this.hitstop(0.04); return true; }
    }
    s.hits++;
    this.applyMeleeDamage(e, dmg, part, point, dir, W, backstab, kind, P);
    return false;
  }

  wdmg(P, s) {
    const W = P.wtype;
    return P.wdmg * (s.kind === 'thrust' ? W.thrust : W.slash) * s.power;
  }

  applyMeleeDamage(e, dmg, part, point, dir, W, backstab, kind, P) {
    const fx = this.fx;
    const heavy = Math.min(2, dmg / 20);
    const wasFrozen = e.status.frozen > 0;
    e.hp -= dmg;
    e.lastHitT = e.time;
    this.combo++; this.comboT = 2.5;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    P.bloodOnBlade = Math.min(1, (P.bloodOnBlade || 0) + 0.12 + heavy * 0.05);
    e.ch.flash = 0.6;
    this.ui.damageNumber(point, dmg, part === 'head' || backstab);
    if (backstab) this.ui.floatText(point.clone().add(V(0, 0.3, 0)), 'УДАР В СПИНУ!', '#ff3344');
    if (wasFrozen) {
      fx.magicBurst(point, 0xc8f4ff, 20, 4);
      this.sound.ice();
    } else {
      fx.blood(point, dir.clone().add(V(0, 0.25, 0)), 1 + heavy, 3.5 + heavy * 2);
      if (part === 'neck' || part === 'head') fx.blood(point, dir.clone().multiplyScalar(-0.5).add(V(0, 0.6, 0)), 0.8, 3);
    }
    this.sound.hit(heavy);
    if (Math.random() < 0.5) this.sound.voice(e.voicePitch, 'grunt');
    this.haptics.pulse(0.8 + heavy * 0.5);
    this.shake(0.15 + heavy * 0.12);
    this.hitstop(0.045 + heavy * 0.03);
    // близкий удар — брызги на экран
    if (e.distToPlayer() < 2.0 && Math.random() < 0.35 + heavy * 0.2) this.ui.screenBlood(0.4 + heavy * 0.2);
    // кровотечение
    if (W.bleed > 0 && !wasFrozen) { e.status.bleed = Math.max(e.status.bleed, 2.5 * W.bleed); e.status.bleedDps = Math.max(e.status.bleedDps, 1.5 * W.bleed + dmg * 0.04); }
    const killed = e.hp <= 0;
    if (killed) {
      this.killEnemy(e, { kind: 'melee', dir, part, point, weapon: W, overkill: -e.hp, heavy, frozen: wasFrozen });
      return;
    }
    // замороженный враг разбивается от мощного удара
    if (wasFrozen && dmg > e.maxHp * 0.3) {
      this.killEnemy(e, { kind: 'melee', dir, part, point, weapon: W, overkill: 0, heavy, frozen: true });
      return;
    }
    // отрубание конечностей у живого
    const limb = part === 'larm' || part === 'rarm' || part === 'lfore' || part === 'rfore';
    if (limb && W.sever > 0 && dmg > 12 && Math.random() < W.sever * 0.55 * Math.min(1.4, dmg / 22)) {
      this.severPart(e, part, dir, 1);
      if ((part === 'rarm' || part === 'rfore') && Math.random() < 0.6) this.ui.floatText(e.chest().add(V(0, 0.5, 0)), ['Это просто царапина!', 'Ерунда!', 'Я ещё не закончил!'][Math.floor(Math.random() * 3)], '#ffffff', 16);
      e.hp -= e.maxHp * 0.1;
      e.status.bleed = 8; e.status.bleedDps = Math.max(e.status.bleedDps, e.maxHp * 0.025);
      this.sound.voice(e.voicePitch, 'scream');
      this.slowmo(0.35, 0.5);
      if (e.hp <= 0) { this.killEnemy(e, { kind: 'melee', dir, part: 'torso', point, weapon: W, overkill: 0, heavy }); return; }
    }
    const legHit = (part === 'lleg' || part === 'rleg' || part === 'lshin' || part === 'rshin');
    if (legHit && W.sever > 0.5 && dmg > 22 && Math.random() < W.sever * 0.3) {
      this.severPart(e, part, dir, 1);
      e.knockdown(dir.clone().multiplyScalar(2).add(V(0, 1, 0)), PART_JOINT[part]);
      this.sound.voice(e.voicePitch, 'scream');
      return;
    }
    // реакция
    e.interrupt();
    e.ch.react(dir, 0.1 + Math.min(0.25, dmg / e.maxHp));
    e.knock = dir.clone().setY(0).multiplyScalar(W.knock * 0.5);
    // устойчивость (poise): лёгкие удары не сбивают атаку, пока не сломана стойка
    e.poise -= dmg * (W.guardBreak ? 1.5 : 1) * (kind === 'thrust' ? 0.8 : 1) * (backstab ? 2 : 1);
    e.poiseT = 1.2;
    e.recentHits = (e.recentHits || 0) + 1;
    if (W.knock >= 7 && (part === 'head' || e.poise <= 0) && kind !== 'thrust') {
      e.poise = e.maxPoise;
      e.knockdown(dir.clone().setY(0).multiplyScalar(W.knock * 0.6).add(V(0, 2.5, 0)), PART_JOINT[part]);
    } else if (e.poise <= 0) {
      e.poise = e.maxPoise;
      e.attack = null;
      e.stagger(0.5 + Math.min(0.4, dmg / e.maxHp));
      this.ui.floatText(e.chest().add(V(0, 0.35, 0)), 'ОШЕЛОМЛЁН', '#ffaa33', 15);
    }
  }

  // Урон заклинаниями/физикой.
  damageEnemyMagic(e, o) {
    if (e.dead) return;
    let dmg = o.amount;
    if (e.shield && o.kind !== 'drain' && o.kind !== 'impact') {
      const absorbed = Math.min(e.shield.hp, dmg);
      e.shield.hp -= absorbed; dmg -= absorbed;
      e.shieldMesh.material.uniforms.hit.value = 1;
      this.sound.shieldHit();
      if (dmg <= 0.5) return;
    }
    if (e.status.frozen > 0 && o.kind !== 'frost') dmg *= 1.3;
    e.hp -= dmg;
    e.lastHitT = e.time;
    if (!o.silent) {
      this.ui.damageNumber(o.point || e.chest(), dmg, false, o.kind);
      e.ch.flash = 0.5;
      if (o.kind !== 'frost' && o.kind !== 'lightning') this.fx.blood(o.point || e.chest(), o.dir || V(0, 1, 0), 0.7, 3);
      this.sound.voice(e.voicePitch, 'grunt');
    }
    if (o.burn) { e.status.burn = 3; e.status.burnDps = o.burn; }
    if (o.stun) { e.status.stun = Math.max(e.status.stun, o.stun); e.interrupt(); e.attack = null; if (e.state === 'attack') e.state = 'idle'; }
    if (o.freeze && e.hp > 0) { e.status.frozen = o.freeze; e.interrupt(); e.attack = null; if (e.state === 'attack' || e.state === 'cast') e.state = 'idle'; if (e.ch.mode === 'ragdoll') e.status.frozen = 0; }
    if (e.hp <= 0) {
      this.killEnemy(e, { kind: o.kind, dir: o.dir || V(0, 0, 0), part: 'torso', point: o.point, overkill: -e.hp, explosive: o.explosive, knock: o.knockdown });
      return;
    }
    if (!o.silent) e.interrupt();
    if (o.knockdown) e.knockdown(o.knockdown, J.PELVIS);
  }

  // Отрубить часть (с учётом иерархии).
  severPart(e, part, dir, power = 1) {
    let key = part;
    if (part === 'neck' || part === 'head') key = 'head';
    if (!['head', 'larm', 'rarm', 'lfore', 'rfore', 'lleg', 'rleg', 'lshin', 'rshin'].includes(key)) return null;
    const vel = dir.clone().multiplyScalar(3 + power * 2).add(V(0, 2 + Math.random() * 2, 0));
    const gib = e.ch.sever(key, vel);
    if (!gib) return null;
    this.loose.push(gib);
    if (this.loose.length > 40) {
      const old = this.loose.shift();
      if (old.segs) for (const s of old.segs) s.group.removeFromParent();
      if (old.weaponPart) old.weaponPart.group.removeFromParent();
      if (old.group) old.group.removeFromParent();
    }
    const fx = this.fx;
    const ch = e.ch;
    const [ja, jb] = gib.stumpDir;
    const cut = gib.cutJoint;
    // фонтан из культи на теле
    fx.emitter(() => (ch.group.visible ? ch.pose[cut] : null), () => V().subVectors(ch.pose[jb], ch.pose[ja]).normalize().add(V(0, 0.4, 0)).normalize(), key === 'head' ? 70 : 40, key === 'head' ? 4 : 2.6, key === 'head' ? 4.2 : 3);
    // капли с отрубленного куска
    const rd = gib.ragdoll;
    fx.emitter(() => rd.p[0], () => V().subVectors(rd.p[0], rd.p[1]).normalize(), 20, 2, 1.5);
    fx.blood(ch.pose[cut], dir, 2.2, 5);
    this.sound.gore();
    this.haptics.pulse(2);
    this.shake(0.4);
    this.game.arena.cheer(1);
    this.sound.cheer(0.8);
    if (key === 'head') { this.stats.decap++; this.save.stats.decapitations++; }
    else { this.stats.dismember++; this.save.stats.dismemberments++; }
    // выбитое оружие отлетает с рукой
    return gib;
  }

  killEnemy(e, info) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    e.state = 'dead';
    e.attack = null;
    e.interrupt();
    e.cast = null;
    e.rune.visible = false;
    e.ch.anim.jitter = 0;
    e.ch.frozen = false;
    this.stats.kills++;
    this.save.stats.kills++;
    const fx = this.fx, W = info.weapon;
    const dir = (info.dir && info.dir.lengthSq() > 0) ? info.dir.clone() : V(0, 0, 1);
    let msg = null;
    // разбить замороженного
    if (info.frozen || e.status.frozen > 0) {
      const ch = e.ch;
      for (let i = 0; i < 15; i++) {
        if (ch.missing.has(i)) continue;
        for (let k = 0; k < 3; k++) {
          const v = dir.clone().multiplyScalar(2 + Math.random() * 4).add(V((Math.random() - 0.5) * 5, Math.random() * 5, (Math.random() - 0.5) * 5));
          fx.chunks.add(ch.pose[i], v, 0.06 + Math.random() * 0.08, Math.random() < 0.7 ? 0xbfe8ff : 0x8a1010, { bleed: 0.2, life: 10 });
        }
      }
      fx.magicBurst(ch.pose[J.NECK], 0xc8f4ff, 60, 6);
      fx.bloodBurst(ch.pose[J.PELVIS], 1);
      ch.hideAll();
      if (ch.weapon && ch.weaponAttached) { const w = ch.dropWeapon(); if (w) this.loose.push(w); w && (w.group.visible = true); }
      this.sound.shatter();
      this.stats.gibbed++; this.save.stats.gibbed++;
      msg = 'ВДРЕБЕЗГИ!';
      this.finishKill(e, msg, 1.4);
      return;
    }
    // рэгдолл
    const knock = W ? W.knock : 3;
    const impulse = info.knock ? info.knock.clone() : dir.clone().setY(0).multiplyScalar(knock * 0.75).add(V(0, 1.2 + knock * 0.15, 0));
    const hitJ = PART_JOINT[info.part] ?? J.NECK;
    if (e.ch.mode !== 'ragdoll') e.ch.toRagdoll(impulse, hitJ, dir.clone().multiplyScalar(knock * 0.8));
    else e.ch.ragdoll.impulseAll(impulse, 0.6);
    const wp = e.ch.dropWeapon();
    if (wp) this.loose.push(wp);
    const part = info.part;
    const sev = W ? W.sever : 0;
    // взрыв: разорвать на куски
    if (info.explosive && info.overkill > e.maxHp * 0.25) {
      for (const p of ['head', 'larm', 'rarm', 'lleg', 'rleg']) {
        if (Math.random() < 0.75) {
          const out = V().subVectors(e.ch.pose[SEVERJ[p]], e.ch.pose[J.PELVIS]).normalize();
          this.severPart(e, p, out.multiplyScalar(2).add(dir), 3);
        }
      }
      fx.bloodBurst(e.ch.pose[J.PELVIS], 2.5);
      fx.gore(e.ch.pose[J.PELVIS], V(0, 1, 0), 2);
      this.stats.gibbed++; this.save.stats.gibbed++;
      msg = 'РАЗОРВАН!';
    } else if ((part === 'head' || part === 'neck') && W) {
      if (W.crush > 0 && Math.random() < W.crush) {
        // череп вдребезги
        const hp = e.ch.pose[J.HEAD].clone();
        e.ch.destroyPart('head');
        fx.bloodBurst(hp, 2);
        fx.gore(hp, dir, 2.2, [0x8a0a0a, 0xd8a888, 0xe8dcc0, 0x5a0000, 0xb05050]);
        fx.emitter(() => e.ch.pose[J.NECK], () => V().subVectors(e.ch.pose[J.NECK], e.ch.pose[J.PELVIS]).normalize(), 60, 3.5, 3.5);
        this.sound.crunch(); this.sound.gore();
        this.stats.gibbed++; this.save.stats.gibbed++;
        msg = 'ЧЕРЕП РАЗДРОБЛЕН!';
      } else if (sev > 0 && Math.random() < Math.min(0.95, sev * 1.5 + 0.2)) {
        this.severPart(e, 'head', dir, 2);
        msg = 'ОБЕЗГЛАВЛЕН!';
        this.slowmo(0.25, 1.1);
      }
    } else if (W && sev > 0.3 && part && part !== 'torso' && Math.random() < sev) {
      this.severPart(e, part, dir, 2);
      msg = 'РАСЧЛЕНЁН!';
    } else if (W && sev > 0.5 && part === 'torso' && info.overkill > 15 && Math.random() < sev * 0.5) {
      this.severPart(e, Math.random() < 0.5 ? 'larm' : 'rarm', dir, 2);
      msg = 'РАСЧЛЕНЁН!';
    }
    if (info.kind === 'fire') { e.status.burn = 4; e.ch.tint = 'char'; }
    if (info.kind === 'lightning') { e.ch.tint = 'char'; e.ch.tintAmt = 0.6; }
    fx.bloodBurst(e.ch.pose[J.NECK], 0.8);
    this.sound.voice(e.voicePitch, 'death');
    this.finishKill(e, msg, 1);
  }

  finishKill(e, msg, power) {
    const fx = this.fx;
    // лужа под телом
    const pel = e.ch.ragdoll ? e.ch.ragdoll.p[J.PELVIS] : e.ch.pose[J.PELVIS];
    setTimeout(() => { if (e.ch.group.visible) fx.decals.pool(pel, 1.4 + Math.random() * 0.6); }, 900);
    this.hitstop(0.11);
    this.shake(0.5);
    this.haptics.pulse(3);
    this.game.arena.cheer(1.5);
    this.sound.cheer(1.5);
    if (msg) this.ui.centerText(msg, 'kill');
    const alive = this.enemies.filter((x) => !x.dead).length;
    if (alive === 0) this.slowmo(0.2, 1.6);
    else if (msg) this.slowmo(0.35, 0.6);
    if (this.player.target === e) this.player.pickTarget();
  }

  // ===== Урон по игроку =====
  damagePlayer(o) {
    const P = this.player;
    if (P.dead || this.over) return;
    if (P.invuln > 0 && o.kind !== 'drain') {
      if (!o.silent) this.ui.floatText(V(P.pos.x, EYE, P.pos.z).add(P.forward(V()).multiplyScalar(1)), 'УКЛОН', '#9fd8ff');
      return;
    }
    let dmg = o.amount;
    const src = o.source;
    // блок
    if (o.blockable && P.blocking && src) {
      const toS = V(src.pos.x - P.pos.x, 0, src.pos.z - P.pos.z).normalize();
      const f = P.forward(V());
      if (toS.dot(f) > Math.cos(1.25)) {
        const sincePress = P.time - P.blockStart;
        const point = V(P.pos.x, EYE - 0.15, P.pos.z).addScaledVector(f, 0.6);
        if (o.kind === 'melee' && sincePress < 0.24) {
          // ПАРИРОВАНИЕ
          this.fx.sparks(point, toS, 40, [1, 0.9, 0.6]);
          this.sound.parry();
          this.haptics.pulse(2);
          this.ui.centerText('ПАРИРОВАНИЕ!', 'parry');
          this.ui.flash('rgba(255,240,200,0.3)');
          src.stagger && src.stagger(1.1);
          P.stamina = Math.min(P.maxStamina, P.stamina + 20);
          this.slowmo(0.3, 0.45);
          this.stats.parries++; this.save.stats.parries++;
          this.shake(0.3);
          return;
        }
        dmg *= 1 - P.wtype.block;
        P.stamina -= o.amount * 1.3 * (o.guardBreak ? 1.5 : 1);
        this.fx.sparks(point, toS, 18);
        this.sound.clang();
        this.haptics.pulse(1);
        this.shake(0.25);
        if (P.stamina <= 0) {
          P.stamina = 0;
          P.stagger(0.7);
          this.ui.centerText('ЗАЩИТА СЛОМЛЕНА', 'fail');
          dmg = o.amount * 0.6;
        }
        if (o.kind === 'fire' && dmg > 0) this.fx.explosion(point, 0.8);
      }
    }
    // щит
    if (P.shield && dmg > 0) {
      const absorbed = Math.min(P.shield.hp, dmg);
      P.shield.hp -= absorbed;
      dmg -= absorbed;
      this.sound.shieldHit();
      this.ui.shieldHit();
      if (P.shield.hp <= 0) { P.shield = null; this.ui.shield(false); this.sound.shatter(); }
      if (dmg <= 0.3) return;
    }
    // броня
    if (o.kind !== 'drain') dmg *= 100 / (100 + P.armor * 3);
    P.hp -= dmg;
    this.stats.damageTaken += dmg;
    if (o.silent) { if (P.hp <= 0) this.playerDie(); return; }
    // эффекты
    const heavy = Math.min(2, dmg / 15);
    this.shake(0.3 + heavy * 0.3);
    this.haptics.pulse(1.5 + heavy);
    this.ui.hurt(heavy);
    if (o.kind === 'melee') { this.ui.screenBlood(0.5 + heavy * 0.3); this.sound.hit(heavy); this.fx.blood(V(P.pos.x, EYE - 0.4, P.pos.z), o.dir.clone().add(V(0, 0.3, 0)), 0.8, 3); }
    if (o.kind === 'fire') this.ui.flash('rgba(255,120,30,0.35)');
    if (o.kind === 'frost' || o.slow) { P.slowT = o.slow || 2; this.ui.frost(o.slow || 2); }
    if (o.kind === 'lightning') this.ui.flash('rgba(200,230,255,0.5)');
    if (o.knock) P.knock = o.dir.clone().setY(0).multiplyScalar(o.knock);
    if (o.stagger) P.stagger(o.stagger);
    if (o.stun) P.stagger(o.stun);
    if (o.guardBreak && heavy > 0.8) P.stagger(0.25);
    this.sound.voice(1.15, 'grunt');
    this.combo = 0;
    if (P.hp <= 0) this.playerDie();
  }

  playerDie() {
    const P = this.player;
    if (P.dead) return;
    P.hp = 0;
    P.die();
    this.setRuneMode(false);
    this.slowmo(0.3, 2);
    this.sound.voice(1.0, 'death');
    this.sound.cheer(2);
    this.ui.screenBlood(1);
    this.ui.centerText('ВЫ ПАЛИ', 'dead');
  }

  checkEnd(rdt) {
    if (this.over) return;
    const alive = this.enemies.filter((e) => !e.dead).length;
    if (this.player.dead) {
      this.endT = (this.endT || 0) + rdt;
      if (this.endT > 2.6) this.finish(false);
    } else if (alive === 0 && this.started) {
      this.endT = (this.endT || 0) + rdt;
      if (this.endT > 2.8) this.finish(true);
    }
  }

  finish(win) {
    this.over = true;
    this.setRuneMode(false);
    this.result = { win, stats: this.stats, fight: this.fight };
    this.game.onBattleEnd(this.result);
  }
}

const SEVERJ = { head: J.HEAD, larm: J.LEL, rarm: J.REL, lleg: J.LKN, rleg: J.RKN };
