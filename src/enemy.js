// Противник: ИИ, атаки с телеграфом, блок, касты, статусы, нокдауны.
import * as THREE from 'three';
import { ARCHETYPES, WEAPONS, WEAPON_TYPES, ENEMY_CAST, SPELLS } from './data.js';
import { Character, J } from './character.js';
import { ARENA_R } from './arena.js';
import { SPELL_GLYPH, GLYPH_SHAPES } from './gesture.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const ATTACKS = {
  slashR: { W: { h: V(-0.5, 1.5, -0.05), d: V(-0.75, 0.55, -0.35) }, M: { h: V(-0.1, 1.3, 0.55), d: V(0.1, 0.15, 1) }, E: { h: V(0.35, 1.05, 0.3), d: V(0.85, -0.25, 0.45) }, mult: 1 },
  slashL: { W: { h: V(0.3, 1.45, 0.05), d: V(0.8, 0.5, -0.3) }, M: { h: V(-0.05, 1.3, 0.55), d: V(-0.1, 0.15, 1) }, E: { h: V(-0.5, 1.0, 0.25), d: V(-0.85, -0.25, 0.45) }, mult: 1 },
  overhead: { W: { h: V(-0.15, 1.78, -0.1), d: V(-0.1, 0.5, -0.85) }, M: { h: V(-0.1, 1.55, 0.45), d: V(0, 0.75, 0.65) }, E: { h: V(-0.05, 0.85, 0.5), d: V(0, -0.55, 0.8) }, mult: 1.3 },
  thrust: { W: { h: V(-0.25, 1.2, -0.25), d: V(0.05, 0.08, 1) }, M: { h: V(-0.18, 1.25, 0.35), d: V(0.03, 0.05, 1) }, E: { h: V(-0.12, 1.28, 0.72), d: V(0, 0.03, 1) }, mult: 1 }
};
for (const a of Object.values(ATTACKS)) for (const k of ['W', 'M', 'E']) a[k].d.normalize();

const ATTACK_SETS = {
  dagger: ['slashR', 'slashL', 'thrust', 'thrust'],
  sword: ['slashR', 'slashL', 'overhead', 'thrust'],
  axe: ['slashR', 'overhead', 'overhead', 'slashL'],
  mace: ['overhead', 'slashR', 'overhead'],
  spear: ['thrust', 'thrust', 'thrust', 'slashR'],
  greatsword: ['slashR', 'overhead', 'slashL']
};

function guardPose(type) {
  switch (type) {
    case 'dagger': return { h: V(-0.2, 1.1, 0.3), d: V(0.2, 0.35, 0.9).normalize(), l: V(0.2, 1.18, 0.3) };
    case 'greatsword': return { h: V(-0.08, 1.0, 0.3), d: V(0.1, 0.8, 0.55).normalize(), l: null };
    case 'spear': return { h: V(-0.2, 1.05, 0.05), d: V(0.08, 0.12, 1).normalize(), l: null };
    default: return { h: V(-0.22, 1.08, 0.3), d: V(0.15, 0.75, 0.6).normalize(), l: V(0.24, 1.0, 0.2) };
  }
}

// Текстуры рун над головой кастующего.
const runeTexCache = {};
function runeTexture(glyph, color) {
  const key = glyph + color;
  if (runeTexCache[key]) return runeTexCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#' + new THREE.Color(color).getHexString();
  g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = g.strokeStyle; g.shadowBlur = 18;
  for (const st of GLYPH_SHAPES[glyph]) {
    g.beginPath();
    st.forEach(([x, y], i) => { const px = 18 + x * 92, py = 18 + y * 92; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  runeTexCache[key] = t;
  return t;
}

export class Enemy {
  constructor(battle, def, spawnPos) {
    this.battle = battle;
    this.def = def;
    const A = ARCHETYPES[def.archetype];
    this.arch = A;
    this.name = def.name;
    this.title = (def.boss ? 'Босс · ' : '') + A.title;
    const lvl = def.level;
    const scale = def.boss ? 1.14 : 1;
    this.ch = new Character(battle.scene, { look: A.look, weaponId: A.weapon, scale });
    this.weaponItem = WEAPONS[A.weapon];
    this.wtype = WEAPON_TYPES[this.weaponItem.type];
    this.wkind = this.weaponItem.type;
    this.maxHp = Math.round(A.hp * (1 + (lvl - 1) * 0.13) * (def.boss ? 1.35 : 1) * def.groupScale);
    this.hp = this.maxHp;
    const ab = Math.min(12, Math.floor(lvl / 2));
    this.armor = { head: A.armor.head + ab * 0.6, body: A.armor.body + ab, limbs: A.armor.limbs + ab * 0.4 };
    this.dmgScale = 0.6 * (1 + (lvl - 1) * 0.07) * (def.boss ? 1.1 : 1) * (def.groupScale < 1 ? 0.85 : 1);
    this.skill = Math.min(1, 0.3 + lvl * 0.04 + (def.boss ? 0.15 : 0));
    this.spellLevel = Math.min(3, 1 + Math.floor(lvl / 7));
    this.spells = A.spells.slice();
    this.spellCd = {};
    for (const s of this.spells) this.spellCd[s] = 2 + Math.random() * 3;
    this.pos = this.ch.root;
    this.pos.copy(spawnPos);
    this.vel = new THREE.Vector3();
    this.ch.facing = Math.atan2(-spawnPos.x, -spawnPos.z);
    this.state = 'intro';
    this.stateT = 1.2 + Math.random() * 0.4;
    this.attack = null;
    this.cast = null;
    this.blockT = 0;
    this.blockStart = -10;
    this.status = { stun: 0, frozen: 0, burn: 0, burnDps: 0, slow: 0, bleed: 0, bleedDps: 0 };
    this.shield = null;
    this.thinkT = 0.5;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.dead = false;
    this.deathT = 0;
    this.knockT = 0;
    this.time = 0;
    this.lastHitT = -10;
    this.maxPoise = Math.round(A.hp * 0.32 * (def.boss ? 1.7 : 1) + lvl * 1.5);
    this.poise = this.maxPoise;
    this.poiseT = 0;
    this.recentHits = 0;
    this.arm = { h: guardPose(this.wkind).h.clone(), d: guardPose(this.wkind).d.clone(), l: V(0.24, 1.0, 0.2) };
    this.voicePitch = 0.8 + Math.random() * 0.4 - (A.look.bulk ? 0.15 : 0);
    // руна над головой
    this.rune = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.rune.scale.setScalar(0.7);
    this.rune.visible = false;
    battle.scene.add(this.rune);
    // сфера щита
    this.shieldMesh = makeShieldMesh(0x88e0ff, 1.05 * scale);
    this.shieldMesh.visible = false;
    battle.scene.add(this.shieldMesh);
    this.ch.update(1 / 60, ARENA_R, null);
  }

  get alive() { return !this.dead; }

  aimPoint() {
    if (this.ch.mode === 'ragdoll') return _v.copy(this.ch.pose[J.PELVIS]).setY(Math.max(0.6, this.ch.pose[J.PELVIS].y + 0.3));
    return _v.set(this.pos.x, 1.25 * this.ch.scale, this.pos.z);
  }

  chest(out = new THREE.Vector3()) {
    return out.lerpVectors(this.ch.pose[J.PELVIS], this.ch.pose[J.NECK], 0.6);
  }

  get busy() { return this.state === 'attack' || this.state === 'cast' || this.state === 'stagger' || this.state === 'knock' || this.state === 'getup' || this.status.frozen > 0 || this.status.stun > 0; }

  get canFight() { return !this.dead && !this.ch.severed.has('rarm') && !this.ch.severed.has('rfore'); }

  get leftOk() { return !this.ch.severed.has('larm') && !this.ch.severed.has('lfore'); }

  toPlayer() {
    const p = this.battle.player.pos;
    const d = _v2.set(p.x - this.pos.x, 0, p.z - this.pos.z);
    return d;
  }

  distToPlayer() { return Math.hypot(this.battle.player.pos.x - this.pos.x, this.battle.player.pos.z - this.pos.z); }

  facingDot() {
    const d = this.toPlayer().normalize();
    return Math.sin(this.ch.facing) * d.x + Math.cos(this.ch.facing) * d.z;
  }

  // ===== Реакции на действия игрока =====
  onPlayerSwing() {
    if (this.dead || this.busy && this.state !== 'attack') return;
    const dist = this.distToPlayer();
    if (dist > this.battle.player.wtype.reach + 0.8) return;
    if (this.state === 'attack' && this.attack && this.attack.phase !== 'windup') return;
    const r = Math.random();
    const weaponSlow = this.battle.player.wtype.swing;
    if (this.state !== 'attack' && r < this.arch.dodge * 0.6 && this.ch.mode === 'anim') {
      // отскок
      const away = this.toPlayer().normalize().multiplyScalar(-1);
      const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(this.strafeDir * 0.6);
      this.vel.copy(away.add(side).normalize().multiplyScalar(7));
      this.state = 'dodge'; this.stateT = 0.28;
      return;
    }
    const turtle = this.arch.block > 0.1 ? Math.min(0.45, this.recentHits * 0.15) : 0;
    const chance = this.arch.block * (0.6 + this.skill * 0.6) * (weaponSlow > 0.35 ? 1.3 : weaponSlow < 0.25 ? 0.4 : 1) + turtle;
    if (this.state !== 'attack' && Math.random() < chance && this.canFight) {
      setTimeout(() => { if (!this.dead && !this.busy) this.startBlock(0.5 + Math.random() * 0.4); }, Math.max(0, this.arch.react * (1.2 - this.skill * 0.5) * 1000 * 0.5));
    }
  }

  startBlock(dur) {
    if (this.dead || this.busy || !this.canFight) return;
    this.state = 'block';
    this.stateT = dur;
    this.blockStart = this.time;
  }

  get blocking() { return this.state === 'block' && this.ch.mode === 'anim' && this.canFight; }

  // ===== Главный цикл =====
  update(dt) {
    this.time += dt;
    const B = this.battle;
    const ch = this.ch;
    for (const k in this.spellCd) this.spellCd[k] -= dt;
    // фикс руны и щита
    this.updateRune(dt);
    this.updateShield(dt);
    if (this.dead) {
      this.deathT += dt;
      ch.update(dt, ARENA_R, B.physEvents(this));
      if (this.status.burn > 0) {
        this.status.burn -= dt;
        ch.tint = 'char'; ch.tintAmt = Math.min(1, ch.tintAmt + dt * 0.5);
        if (Math.random() < 0.5) B.fx.fire(ch.pose[Math.floor(Math.random() * 15)], 1, 1);
      }
      return;
    }
    // восстановление стойки
    this.recentHits = Math.max(0, this.recentHits - dt * 0.7);
    if (this.poiseT > 0) this.poiseT -= dt;
    else this.poise = Math.min(this.maxPoise, this.poise + this.maxPoise * 0.4 * dt);
    // статусы
    const S = this.status;
    if (S.burn > 0) {
      S.burn -= dt;
      this.hp -= S.burnDps * dt;
      ch.tint = 'burn'; ch.tintAmt = 1;
      if (Math.random() < 0.8) B.fx.fire(ch.pose[Math.floor(Math.random() * 15)], 1, 1);
      if (this.hp <= 0) { B.killEnemy(this, { kind: 'fire', dir: V(0, 0, 0), part: 'torso' }); return; }
      if (S.burn <= 0 && ch.tint === 'burn') { ch.tint = 'char'; ch.tintAmt = 0.4; }
    }
    if (S.bleed > 0) {
      S.bleed -= dt;
      this.hp -= S.bleedDps * dt;
      if (Math.random() < dt * 10) B.fx.drops.spawn(this.chest(), V(0, -0.2, 0), 1, 1, 0.6, 0.8);
      if (this.hp <= 0) { B.killEnemy(this, { kind: 'bleed', dir: V(0, 0, 0), part: 'torso' }); return; }
    }
    if (S.frozen > 0) {
      S.frozen -= dt;
      ch.tint = 'frozen'; ch.tintAmt = Math.min(1, S.frozen * 2);
      ch.frozen = true;
      if (Math.random() < dt * 6) B.fx.add.add({ pos: ch.pose[Math.floor(Math.random() * 15)], vel: V(0, 0.3, 0), color: [0.7, 0.95, 1], size: 0.08, life: 0.8 });
      if (S.frozen <= 0) { ch.frozen = false; ch.tint = null; ch.tintAmt = 0; }
      ch.update(dt, ARENA_R, null);
      return;
    }
    ch.frozen = false;
    if (S.stun > 0) {
      S.stun -= dt;
      ch.anim.jitter = 0.04;
      if (Math.random() < dt * 8) B.fx.add.add({ pos: ch.pose[Math.floor(Math.random() * 15)], vel: V((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), color: [0.7, 0.85, 1], size: 0.06, life: 0.15 });
      if (S.stun <= 0) ch.anim.jitter = 0;
    }
    // нокдаун
    if (ch.mode === 'ragdoll') {
      this.knockT += dt;
      const ev = B.physEvents(this);
      ch.update(dt, ARENA_R, ev);
      const sp = ch.ragdoll ? ch.ragdoll.speed() : 0;
      if ((this.knockT > 1.4 && sp < 0.6) || this.knockT > 3.2) {
        if (this.ch.severed.has('lleg') || this.ch.severed.has('rleg') || this.ch.severed.has('lshin') || this.ch.severed.has('rshin')) {
          B.killEnemy(this, { kind: 'bleed', dir: V(0, 0, 0), part: 'torso' });
          return;
        }
        const d = this.toPlayer();
        ch.getUp(Math.atan2(d.x, d.z));
        this.state = 'getup'; this.stateT = 0.8;
        this.vel.set(0, 0, 0);
      }
      return;
    }
    if (this.state !== 'intro' && !B.player.dead) this.think(dt);
    else if (this.state === 'intro') { this.stateT -= dt; if (this.stateT <= 0 && B.started) this.state = 'idle'; }
    if (B.player.dead && this.state !== 'taunt') { this.state = 'taunt'; this.attack = null; this.cast = null; }
    this.move(dt);
    this.animate(dt);
    ch.update(dt, ARENA_R, null);
  }

  think(dt) {
    const B = this.battle;
    this.stateT -= dt;
    const dist = this.distToPlayer();
    const reach = this.wtype.enemyReach * this.ch.scale;
    const st = this.state;
    if (this.status.stun > 0) return;
    if (st === 'attack') { this.updateAttack(dt); return; }
    if (st === 'cast') { this.updateCast(dt); return; }
    if (st === 'stagger' || st === 'getup' || st === 'dodge' || st === 'taunt') {
      if (this.stateT <= 0) { this.state = 'idle'; this.thinkT = 0.1; }
      return;
    }
    if (st === 'block') {
      if (this.stateT <= 0) { this.state = 'idle'; this.thinkT = 0.15; }
      // контратака из блока
      if (dist <= reach && Math.random() < dt * 1.5 * this.arch.aggr) this.startAttack();
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = 0.18 + Math.random() * 0.25 * (1.3 - this.skill);
    const A = this.arch;
    const hpFrac = this.hp / this.maxHp;
    const ready = (s) => this.spells.includes(s) && this.spellCd[s] <= 0;
    // защитные заклинания
    if (ready('shield') && !this.shield && (hpFrac < 0.6 || Math.random() < 0.15) && dist < 9) return this.startCast('shield');
    if (ready('drain') && hpFrac < 0.75 && dist < 9 && Math.random() < 0.5) return this.startCast('drain');
    if (!this.canFight) {
      // без руки с оружием — магия или кулак левой; без обеих рук — бегство
      const leftOk = this.leftOk;
      for (const s of ['fireball', 'lightning', 'frost', 'push', 'meteor']) if (leftOk && ready(s) && Math.random() < 0.5) return this.startCast(s);
      if (!leftOk) { this.state = 'flee'; return; }
      if (dist > 1.25) { this.state = 'approach'; return; }
      if (Math.random() < 0.7) return this.startAttack();
      this.state = 'strafe';
      return;
    }
    if (dist > reach + 0.35) {
      const casterBias = A.caster ? 0.55 : 0.25;
      for (const s of ['meteor', 'lightning', 'fireball', 'frost']) {
        if (ready(s) && dist > 3 && dist < 16 && Math.random() < casterBias) return this.startCast(s);
      }
      if (ready('blink') && dist > 5.5 && Math.random() < 0.4) return this.startCast('blink');
      if (ready('push') && dist < 5 && Math.random() < 0.15) return this.startCast('push');
      this.state = A.caster && dist < 5 && Math.random() < 0.3 ? 'strafe' : 'approach';
      return;
    }
    // в зоне досягаемости
    if (ready('push') && dist < 3.5 && Math.random() < 0.18) return this.startCast('push');
    const pl = B.player;
    if (pl.state === 'swing' && Math.random() < A.block * 0.8) return this.startBlock(0.6);
    if (Math.random() < A.aggr * (0.75 + this.skill * 0.4)) return this.startAttack();
    if (Math.random() < A.block * 0.7) return this.startBlock(0.5 + Math.random() * 0.6);
    this.state = 'strafe';
    if (Math.random() < 0.3) this.strafeDir *= -1;
  }

  move(dt) {
    const B = this.battle;
    const toP = this.toPlayer();
    const dist = toP.length();
    const dir = dist > 1e-4 ? toP.clone().divideScalar(dist) : V(0, 0, 1);
    const side = V(-dir.z, 0, dir.x).multiplyScalar(this.strafeDir);
    const speed = this.arch.speed * (this.status.slow > 0 ? 0.5 : 1) * (this.def.boss ? 1.05 : 1);
    const reach = this.canFight ? this.wtype.enemyReach * this.ch.scale : 1.1;
    let want = V(0, 0, 0);
    switch (this.state) {
      case 'approach': {
        want.copy(dir).multiplyScalar(speed);
        if (dist < reach * 0.85) this.state = 'idle';
        break;
      }
      case 'strafe': {
        const pref = this.arch.keepDistance ? reach * 0.95 : (this.arch.caster ? 4.5 : this.wtype.prefRange);
        want.copy(side).multiplyScalar(speed * 0.55).addScaledVector(dir, (dist - pref) * 1.5);
        if (want.length() > speed) want.setLength(speed);
        if (this.stateT < -1.2) { this.state = 'idle'; this.stateT = 0; }
        break;
      }
      case 'block': want.copy(dir).multiplyScalar(dist > reach ? speed * 0.3 : 0); break;
      case 'flee': want.copy(dir).multiplyScalar(-speed * 0.8); break;
      case 'attack': {
        if (this.attack && this.attack.phase === 'windup') want.copy(dir).multiplyScalar(Math.max(0, dist - reach * 0.7) * 2.5);
        if (this.attack && this.attack.phase === 'strike') want.copy(dir).multiplyScalar(this.wkind === 'spear' ? 1.5 : 2.5);
        break;
      }
      case 'dodge': {
        this.stateT -= 0;
        want.copy(this.vel);
        break;
      }
      default: break;
    }
    if (this.state !== 'dodge') {
      const acc = 1 - Math.exp(-dt * 10);
      this.vel.x += (want.x - this.vel.x) * acc;
      this.vel.z += (want.z - this.vel.z) * acc;
    } else this.vel.multiplyScalar(Math.exp(-dt * 6));
    if (this.knock) {
      this.vel.add(this.knock);
      this.knock = null;
    }
    this.pos.addScaledVector(this.vel, dt);
    // разведение с игроком и друг с другом
    const p = B.player.pos;
    const dd = _v.set(this.pos.x - p.x, 0, this.pos.z - p.z);
    const L = dd.length(), min = 0.7 * this.ch.scale;
    if (L < min && L > 1e-4) this.pos.addScaledVector(dd, (min - L) / L);
    for (const o of B.enemies) {
      if (o === this || o.dead || o.ch.mode === 'ragdoll') continue;
      const d2 = _v.set(this.pos.x - o.pos.x, 0, this.pos.z - o.pos.z);
      const l2 = d2.length();
      if (l2 < 0.75 && l2 > 1e-4) this.pos.addScaledVector(d2, (0.75 - l2) / l2 * 0.5);
    }
    const r = Math.hypot(this.pos.x, this.pos.z), lim = ARENA_R - 0.5;
    if (r > lim) { this.pos.x *= lim / r; this.pos.z *= lim / r; if (this.state === 'strafe') this.strafeDir *= -1; }
    // поворот к игроку
    const lockTurn = this.state === 'attack' && this.attack && this.attack.phase !== 'windup';
    const wantYaw = Math.atan2(toP.x, toP.z);
    let diff = wantYaw - this.ch.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnRate = lockTurn ? 1.2 : (this.state === 'stagger' ? 1 : 7);
    this.ch.facing += diff * Math.min(1, dt * turnRate);
  }

  animate(dt) {
    const ch = this.ch, A = ch.anim, s = ch.scale;
    const lv = ch.dirToLocal(this.vel, new THREE.Vector3());
    A.vel.copy(lv);
    A.look = this.battle.player.dead ? null : _v.set(this.battle.player.pos.x, 1.5, this.battle.player.pos.z).clone();
    const g = guardPose(this.wkind);
    let th = g.h.clone(), td = g.d.clone(), tl = g.l ? g.l.clone() : null;
    let rate = 12;
    A.lean = 0; A.twist = 0; A.crouch = 0.08;
    let glow = 0;
    const st = this.state;
    if (st === 'attack' && this.attack) {
      const at = this.attack, K = ATTACKS[at.type];
      if (at.phase === 'windup') {
        const k = Math.min(1, at.t / at.windup);
        const e = 1 - (1 - k) * (1 - k);
        th = at.from.h.clone().lerp(K.W.h, e);
        td = at.from.d.clone().lerp(K.W.d, e).normalize();
        A.twist = (at.type === 'slashR' ? 0.45 : at.type === 'slashL' ? -0.35 : 0) * e;
        A.lean = (at.type === 'overhead' ? -0.15 : at.type === 'thrust' ? -0.05 : 0) * e;
        A.crouch = 0.12;
        glow = k;
        rate = 0;
      } else if (at.phase === 'strike') {
        const u = Math.min(1, at.t / at.strike);
        const e = u * u * (3 - 2 * u);
        const a = 1 - e;
        th = K.W.h.clone().multiplyScalar(a * a).addScaledVector(K.M.h, 2 * a * e).addScaledVector(K.E.h, e * e);
        td = K.W.d.clone().multiplyScalar(a * a).addScaledVector(K.M.d, 2 * a * e).addScaledVector(K.E.d, e * e).normalize();
        A.twist = (at.type === 'slashR' ? 0.45 - e * 0.9 : at.type === 'slashL' ? -0.35 + e * 0.7 : 0);
        A.lean = at.type === 'overhead' ? -0.15 + e * 0.45 : at.type === 'thrust' ? e * 0.25 : 0.1;
        A.crouch = 0.15;
        glow = 1 - u * 0.5;
        rate = 0;
      } else {
        th = K.E.h.clone(); td = K.E.d.clone();
        rate = 5;
        A.lean = 0.1;
      }
      if (this.wkind === 'spear' && at.type === 'thrust' && !at.unarmed) { th.z += 0.12; }
      if (at.unarmed) { tl = V(-th.x, th.y, th.z); th = g.h.clone(); td = g.d.clone(); }
    } else if (st === 'block') {
      th.set(-0.12, 1.35, 0.36); td.set(1, 0.25, 0.15).normalize();
      if (this.wkind === 'spear') { td.set(0.85, 0.45, 0.2).normalize(); }
      tl = V(0.22, 1.32, 0.34);
      rate = 18;
    } else if (st === 'cast' && this.cast) {
      tl = V(0.1, 1.5, 0.48);
      th = V(-0.3, 0.95, 0.15);
      A.lean = -0.08;
      A.twist = -0.25;
      rate = 10;
    } else if (st === 'stagger') {
      th.set(-0.45, 1.2, -0.12); td.set(-0.5, 0.6, -0.3).normalize();
      tl = V(0.45, 1.25, -0.1);
      A.lean = -0.35;
      rate = 10;
    } else if (st === 'taunt') {
      th.set(-0.3, 1.85, 0.1); td.set(0, 1, 0.1).normalize();
      tl = V(0.35, 1.3, 0.1);
      A.lean = -0.1;
      rate = 6;
    } else if (st === 'intro') {
      th.set(-0.25, 1.0, 0.05); td.set(0, 1, 0.3).normalize();
      A.lean = -0.05;
    }
    if (this.status.stun > 0) { A.lean = -0.2; }
    if (!this.canFight && st !== 'attack' && st !== 'cast') { tl = V(0.16, 1.32, 0.3); }
    // левая рука на древке для двуручного
    if (!tl && st !== 'cast') tl = th.clone().addScaledVector(td, this.wkind === 'spear' ? 0.42 : 0.2);
    if (!tl) tl = V(0.24, 1.0, 0.2);
    th.multiplyScalar(s); tl.multiplyScalar(s);
    if (rate === 0) {
      this.arm.h.copy(th); this.arm.d.copy(td); this.arm.l.copy(tl);
    } else {
      const k = 1 - Math.exp(-dt * rate);
      this.arm.h.lerp(th, k); this.arm.d.lerp(td, k).normalize(); this.arm.l.lerp(tl, k);
    }
    A.rh.copy(this.arm.h); A.wdir.copy(this.arm.d); A.lh.copy(this.arm.l);
    // свечение оружия при замахе (телеграф)
    const m = ch.weapon && ch.weapon.mats;
    if (m) {
      m.blade.emissive.copy(m.baseEmissive).lerp(new THREE.Color(0xff3010), glow * 0.9);
      m.blade.emissiveIntensity = Math.max(m.glowIntensity, glow * 0.9);
    }
    ch.castGlow = st === 'cast' ? 1 : 0;
  }

  // ===== Атака =====
  startAttack() {
    const unarmed = !this.canFight;
    if (unarmed && !this.leftOk) return;
    const set = unarmed ? ['thrust', 'slashR'] : ATTACK_SETS[this.wkind];
    const type = set[Math.floor(Math.random() * set.length)];
    const speedK = 1 - this.skill * 0.25;
    this.attack = {
      type, phase: 'windup', t: 0, unarmed,
      windup: unarmed ? 0.42 : this.wtype.windup * speedK * (0.85 + Math.random() * 0.3),
      strike: unarmed ? 0.12 : this.wtype.strike,
      recover: unarmed ? 0.45 : this.wtype.recover * (1.2 - this.skill * 0.4),
      hitDone: false,
      from: { h: this.arm.h.clone().divideScalar(this.ch.scale), d: this.arm.d.clone() }
    };
    this.state = 'attack';
    this.battle.sound.tone({ type: 'sine', freq: 180, freqEnd: 120, dur: 0.2, gain: 0.05 });
  }

  updateAttack(dt) {
    const at = this.attack;
    if (!at) { this.state = 'idle'; return; }
    at.t += dt;
    if (at.phase === 'windup' && at.t >= at.windup) {
      at.phase = 'strike'; at.t = 0;
      this.battle.sound.swing(this.wtype.swing / 0.3);
    } else if (at.phase === 'strike') {
      if (!at.hitDone && at.t >= at.strike * 0.5) {
        at.hitDone = true;
        this.tryHitPlayer(at);
      }
      if (at.t >= at.strike) { at.phase = 'recover'; at.t = 0; }
    } else if (at.phase === 'recover' && at.t >= at.recover) {
      this.attack = null;
      this.state = 'idle';
      this.thinkT = 0.05 + Math.random() * 0.2;
    }
  }

  tryHitPlayer(at) {
    const B = this.battle, P = B.player;
    if (P.dead) return;
    const dist = this.distToPlayer();
    const reach = (at.unarmed ? 1.0 : this.wtype.enemyReach) * this.ch.scale + 0.35;
    if (dist > reach) return;
    if (this.facingDot() < Math.cos(1.0)) return;
    const K = ATTACKS[at.type];
    const dmg = at.unarmed ? 12 * this.dmgScale : this.weaponItem.dmg * this.dmgScale * K.mult * (this.wkind === 'spear' && at.type === 'thrust' ? 1.2 : 1);
    const dir = this.toPlayer().normalize();
    B.damagePlayer({ amount: dmg, dir, source: this, kind: 'melee', blockable: true, knock: this.wtype.knock * 0.6, guardBreak: this.wtype.guardBreak });
  }

  // ===== Магия =====
  startCast(spell) {
    const c = ENEMY_CAST[spell];
    if (!c || !this.leftOk) return;
    this.spellCd[spell] = c.cd * (1.2 - this.skill * 0.3) + Math.random() * 2;
    this.cast = { spell, t: 0, dur: c.time * (1.1 - this.skill * 0.2) };
    this.state = 'cast';
    const col = SPELLS[spell].color;
    this.rune.material.map = runeTexture(SPELL_GLYPH[spell], col);
    this.rune.material.needsUpdate = true;
    this.rune.visible = true;
    this.runeT = 0;
    this.battle.sound.castCharge();
    if (spell === 'meteor') this.battle.spells.meteorMarker(this, this.battle.player.pos.clone(), this.cast.dur);
  }

  updateCast(dt) {
    const c = this.cast;
    if (!c) { this.state = 'idle'; return; }
    c.t += dt;
    if (Math.random() < 0.6) {
      const hand = this.ch.pose[J.LHA];
      const col = new THREE.Color(SPELLS[c.spell].color);
      this.battle.fx.add.add({ pos: hand, vel: V((Math.random() - 0.5), Math.random() * 1.2, (Math.random() - 0.5)), color: [col.r, col.g, col.b], size: 0.12, life: 0.35 });
    }
    if (c.t >= c.dur) {
      this.battle.spells.enemyCast(this, c.spell, this.spellLevel);
      this.cast = null;
      this.state = 'idle';
      this.thinkT = 0.3;
      this.rune.visible = false;
    }
  }

  interrupt() {
    if (this.state === 'cast') {
      this.cast = null;
      this.rune.visible = false;
      this.battle.ui.floatText(this.chest(), 'ПРЕРВАНО', '#9fd8ff');
      this.battle.spells.cancelMarkers(this);
    }
  }

  updateRune(dt) {
    if (!this.rune.visible) return;
    this.runeT = (this.runeT || 0) + dt;
    const head = this.ch.pose[J.HEAD];
    this.rune.position.set(head.x, head.y + 0.55 * this.ch.scale + Math.sin(this.runeT * 4) * 0.04, head.z);
    this.rune.material.opacity = Math.min(1, this.runeT * 5);
    this.rune.material.rotation = Math.sin(this.runeT * 2) * 0.1;
    if (this.dead) this.rune.visible = false;
  }

  updateShield(dt) {
    if (this.shield) {
      this.shield.t -= dt;
      if (this.shield.t <= 0 || this.shield.hp <= 0 || this.dead) {
        if (this.shield.hp <= 0) { this.battle.fx.magicBurst(this.chest(), 0x88e0ff, 30, 5); this.battle.sound.shatter(); }
        this.shield = null;
      }
    }
    this.shieldMesh.visible = !!this.shield;
    if (this.shield) {
      this.shieldMesh.position.copy(this.chest());
      const u = this.shieldMesh.material.uniforms;
      u.time.value += dt;
      u.hit.value = Math.max(0, u.hit.value - dt * 3);
    }
  }

  // ===== Попадания =====
  stagger(t) {
    if (this.dead || this.ch.mode !== 'anim') return;
    this.interrupt();
    this.attack = null;
    this.state = 'stagger';
    this.stateT = t;
  }

  knockdown(vel, hitJoint = -1) {
    if (this.dead) return;
    this.interrupt();
    this.attack = null;
    if (this.ch.mode === 'ragdoll') { this.ch.ragdoll.impulseAll(vel, 1); return; }
    this.ch.toRagdoll(vel, hitJoint, null);
    this.state = 'knock';
    this.knockT = 0;
  }

  dispose() {
    this.ch.dispose();
    this.rune.removeFromParent();
    this.shieldMesh.removeFromParent();
  }
}

export function makeShieldMesh(color, radius) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 }, hit: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float time; uniform float hit; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
        float hex = 0.5 + 0.5 * sin(vP.x * 30.0 + time * 2.0) * sin(vP.y * 30.0 - time) * sin(vP.z * 30.0);
        float a = f * 0.9 + hex * 0.06 + hit * 0.5;
        gl_FragColor = vec4(color * (1.0 + hit), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), mat);
  m.renderOrder = 7;
  return m;
}
