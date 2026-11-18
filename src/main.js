// Точка входа: рендерер, сцена, игровой цикл, переходы между экранами, прогресс.
import * as THREE from 'three';
import { Arena } from './arena.js';
import { FX } from './fx.js';
import { Sound, Haptics } from './audio.js';
import { UI, unlockWins } from './ui.js';
import { Input } from './input.js';
import { Battle } from './battle.js';
import { Character } from './character.js';
import { loadSave, writeSave, resetSave } from './save.js';
import { WEAPONS, ARMOR, SPELLS, MAGIC_UPGRADES, ARCHETYPES, getFight, ARENAS, ARENA_ORDER, FORMATS, FORMAT_ORDER, rewardMult } from './data.js';
import { Hazards } from './hazards.js';
import { SPELL_GLYPH } from './gesture.js';

class Game {
  constructor() {
    this.save = loadSave();
    this.canvas = document.getElementById('gl');
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.04, 400);
    this.scene.add(this.camera);
    this.buildEnvironment();
    this.arena = new Arena(this.scene);
    this.fx = new FX(this.scene, this.save.settings);
    this.sound = new Sound();
    this.sound.enabled = this.save.settings.sound;
    this.haptics = new Haptics();
    this.haptics.enabled = this.save.settings.haptics;
    this.input = new Input(this);
    this.input.lefty = !!this.save.settings.lefty;
    this.ui = new UI(this);
    this.battle = null;
    this.paused = false;
    this.menuChars = [];
    this.time = 0;
    this.last = performance.now();
    this.frameTimes = [];
    this.dprCap = 2;
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.battle && !this.battle.over && !this.paused) this.pause();
      if (document.hidden && this.sound.ctx) this.sound.ctx.suspend();
      else if (!document.hidden && this.sound.ctx) this.sound.ctx.resume();
    });
    window.__game = this;
    // iOS разблокирует звук только на touchend/click
    const unlock = () => this.sound.unlock();
    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('click', unlock);
    document.getElementById('btn-portrait').addEventListener('click', () => {
      document.body.classList.add('portrait-ok');
      this.resize();
    });
    this.ui.menu();
    requestAnimationFrame((t) => this.loop(t));
  }

  buildEnvironment() {
    // карта окружения для бликов на металле
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(vec3(0.55,0.35,0.22), vec3(0.25,0.28,0.55), smoothstep(-0.2, 0.6, h)); c += vec3(1.2,0.8,0.5) * pow(max(0.0, dot(vP, normalize(vec3(-0.5,0.6,0.3)))), 12.0); gl_FragColor = vec4(c, 1.0); }`
    }));
    env.add(sky);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: 0xffd8a0 }));
    panel.position.set(0, 6, -6); panel.lookAt(0, 0, 0);
    env.add(panel);
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  applyQuality() {
    const q = this.save.settings.quality;
    const dev = window.devicePixelRatio || 1;
    this.dprCap = q === 'low' ? 1 : q === 'medium' ? Math.min(dev, 1.5) : Math.min(dev, 2);
    this.dpr = q === 'auto' ? Math.min(dev, 2) : this.dprCap;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.arena.sun.castShadow = q !== 'low';
    this.renderer.setPixelRatio(this.dpr);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const H = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const scale = H / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    if (this.fx) { this.fx.add.mat.uniforms.scale.value = scale; this.fx.norm.mat.uniforms.scale.value = scale; }
  }

  // адаптивное разрешение
  adaptQuality(rdt) {
    if (this.save.settings.quality !== 'auto' || !this.battle) return;
    this.frameTimes.push(rdt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 0.021 && this.dpr > 1) { this.dpr = Math.max(1, this.dpr - 0.25); this.renderer.setPixelRatio(this.dpr); this.resize(); }
    else if (avg < 0.0135 && this.dpr < this.dprCap) { this.dpr = Math.min(this.dprCap, this.dpr + 0.25); this.renderer.setPixelRatio(this.dpr); this.resize(); }
  }

  persist() { writeSave(this.save); }

  knownGlyphs() {
    const set = new Set();
    for (const id of Object.keys(this.save.spells)) {
      if (!this.save.spells[id]) continue;
      if (id === 'blink') ['arrow_up', 'arrow_down', 'arrow_left', 'arrow_right'].forEach((g) => set.add(g));
      else set.add(SPELL_GLYPH[id]);
    }
    return set;
  }

  // ===== Сцена меню =====
  // Превью арены в меню (без игровой логики).
  previewArena(id) {
    if (!id || id === 'random') id = this.previewId || 'colosseum';
    this.arena.setVariant(id);
    if (this.preview && this.previewId === id) return;
    if (this.preview) this.preview.dispose();
    this.fx.clear();
    this.preview = new Hazards({ scene: this.scene, fx: this.fx, sound: this.sound, battle: null }, id, this.save.fight);
    this.previewId = id;
  }

  showMenuScene(fight = null, arenaId = undefined) {
    for (const c of this.menuChars) c.dispose();
    this.menuChars = [];
    this.previewArena(arenaId === undefined ? this.save.prefs.arena : arenaId);
    const f = fight || getFight(this.save.fight);
    f.enemies.forEach((e, i) => {
      const A = ARCHETYPES[e.archetype];
      const ch = new Character(this.scene, { look: A.look, weaponId: A.weapon, scale: e.boss ? 1.14 : 1 });
      ch.root.set((i - (f.enemies.length - 1) / 2) * 1.6, 0, 0);
      ch.facing = 0;
      ch.anim.rh.set(-0.3, 1.0, 0.15);
      ch.anim.wdir.set(0.1, 0.9, 0.4).normalize();
      ch.anim.lh.set(0.25, 1.0, 0.1);
      this.menuChars.push(ch);
    });
  }

  updateMenuScene(rdt) {
    const t = this.time;
    const ang = t * 0.12;
    const r = 4.2;
    this.camera.position.set(Math.sin(ang) * r, 1.9 + Math.sin(t * 0.3) * 0.2, Math.cos(ang) * r);
    this.camera.lookAt(0, 1.2, 0);
    if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); this.resize(); }
    if (this.preview) this.preview.update(rdt);
    for (const ch of this.menuChars) {
      ch.anim.look = this.camera.position.clone();
      // насмешливая поза — поднимает оружие
      const k = (Math.sin(t * 0.9 + ch.root.x) + 1) / 2;
      ch.anim.rh.set(-0.3, 1.0 + k * 0.7, 0.15 + k * 0.1);
      ch.anim.wdir.set(0.1 - k * 0.1, 0.9, 0.4 - k * 0.3).normalize();
      ch.update(rdt, 13.5, null);
    }
  }

  // ===== Бой =====
  startFromPrefs() {
    const p = this.save.prefs;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randArena = p.arena === 'random', randFormat = p.format === 'random';
    this.startBattle({
      arena: randArena ? pick(ARENA_ORDER) : (p.arena || 'colosseum'),
      format: randFormat ? pick(FORMAT_ORDER) : (p.format || 'duel'),
      randArena, randFormat
    });
  }

  startBattle(opts = this.lastOpts || { arena: 'colosseum', format: 'duel' }) {
    for (const c of this.menuChars) c.dispose();
    this.menuChars = [];
    if (this.preview) { this.preview.dispose(); this.preview = null; this.previewId = null; }
    if (this.battle) this.battle.dispose();
    this.lastOpts = opts;
    this.arena.setVariant(opts.arena);
    this.camera.fov = 72; this.camera.updateProjectionMatrix(); this.resize();
    this.input.lefty = !!this.save.settings.lefty;
    this.battle = new Battle(this, this.save.fight, opts);
    this.input.setEnabled(true);
    this.paused = false;
    this.frameTimes = [];
  }

  pause() {
    if (!this.battle || this.battle.over) return;
    this.paused = true;
    this.input.setEnabled(false);
    if (this.battle.runeMode) this.battle.setRuneMode(false);
    this.ui.pause();
  }

  resume() {
    this.paused = false;
    this.ui.clear();
    this.input.setEnabled(true);
    this.last = performance.now();
  }

  forfeit() {
    this.paused = false;
    this.ui.clear();
    if (this.battle) { this.battle.player.hp = 0; this.battle.playerDie(); }
  }

  onBattleEnd(result) {
    const s = this.save;
    const f = result.fight;
    const st = result.stats;
    const lines = [];
    let gold = 0, xp = 0;
    const rm = rewardMult(result.arena, result.format, result.randArena, result.randFormat);
    if (result.win) {
      gold = Math.round(f.gold * rm.mult); xp = Math.round(f.xp * rm.mult);
      lines.push(['Награда за бой', `⛁ ${f.gold} · ✦ ${f.xp}`]);
      if (ARENAS[result.arena].mult !== 1) lines.push([`Арена «${ARENAS[result.arena].name}»`, `×${ARENAS[result.arena].mult}`]);
      if (FORMATS[result.format].mult !== 1) lines.push([`Формат «${FORMATS[result.format].name}»`, `×${FORMATS[result.format].mult}`]);
      if (rm.bonus) lines.push(['🎲 Воля судьбы', `+${Math.round(rm.bonus * 100)}%`]);
      if (st.envKills) { gold += st.envKills * 20; lines.push([`Убийства ловушками ×${st.envKills}`, `⛁ +${st.envKills * 20}`]); }
      if (st.beasts) { gold += st.beasts * 25; xp += st.beasts * 10; lines.push([`Убито зверей ×${st.beasts}`, `⛁ +${st.beasts * 25}`]); }
      if (st.decap) { gold += st.decap * 15; lines.push([`Обезглавливания ×${st.decap}`, `⛁ +${st.decap * 15}`]); }
      if (st.dismember) { gold += st.dismember * 8; lines.push([`Расчленения ×${st.dismember}`, `⛁ +${st.dismember * 8}`]); }
      if (st.gibbed) { gold += st.gibbed * 12; lines.push([`Разорваны в клочья ×${st.gibbed}`, `⛁ +${st.gibbed * 12}`]); }
      if (st.parries) { xp += st.parries * 6; lines.push([`Парирования ×${st.parries}`, `✦ +${st.parries * 6}`]); }
      if (st.backstabs) { xp += st.backstabs * 5; lines.push([`Удары в спину ×${st.backstabs}`, `✦ +${st.backstabs * 5}`]); }
      if (st.damageTaken < 1) { const b = Math.round(f.gold * 0.5); gold += b; xp += Math.round(f.xp * 0.3); lines.push(['Без единой царапины!', `⛁ +${b}`]); }
      s.fightsWon++;
      s.fight++;
    } else {
      xp = Math.round(f.xp * 0.25);
      lines.push(['Утешительный опыт', `✦ +${xp}`]);
      s.stats.deaths++;
    }
    s.gold += gold; s.xp += xp; s.totalXp += xp;
    this.persist();
    this.input.setEnabled(false);
    this.pendingResult = { result, rewards: { gold, xp, lines } };
    setTimeout(() => {
      this.ui.battleEnd();
      this.ui.results(result, this.pendingResult.rewards);
      if (gold) this.sound.coin();
    }, 300);
  }

  leaveBattle(to) {
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    this.ui.battleEnd();
    if (to === 'retry') { this.startBattle(this.lastOpts); return; }
    if (to === 'prefight') this.ui.prefight();
    else this.ui.menu();
  }

  // ===== Магазин и прокачка =====
  buy(kind, id) {
    const s = this.save;
    const item = kind === 'weapon' ? WEAPONS[id] : ARMOR[id];
    if (!item || s.gold < item.price || s.fightsWon < unlockWins(item.rank)) return;
    s.gold -= item.price;
    if (kind === 'weapon') { s.owned.weapons.push(id); s.equipped.weapon = id; }
    else { s.owned.armor.push(id); s.equipped[item.slot] = id; }
    this.sound.coin();
    this.persist();
    this.ui.shop(this.ui.shopTab);
  }

  equip(kind, id) {
    const s = this.save;
    if (kind === 'weapon') s.equipped.weapon = id;
    else s.equipped[ARMOR[id].slot] = id;
    this.persist();
    this.ui.shop(this.ui.shopTab);
  }

  unequip(slot) {
    if (slot === 'body') return;
    this.save.equipped[slot] = null;
    this.persist();
    this.ui.shop(this.ui.shopTab);
  }

  learnSpell(id) {
    const s = this.save, S = SPELLS[id];
    const lvl = s.spells[id] || 0;
    if (lvl >= 3) return;
    const cost = S.xp[lvl];
    if (s.xp < cost) return;
    s.xp -= cost;
    s.spells[id] = lvl + 1;
    this.sound.runeOk();
    this.persist();
    this.ui.grimoire();
  }

  buyUpgrade(id) {
    const s = this.save, U = MAGIC_UPGRADES[id];
    const lvl = s.upgrades[id] || 0;
    if (lvl >= U.max) return;
    const cost = U.cost(lvl);
    if (s.xp < cost) return;
    s.xp -= cost;
    s.upgrades[id] = lvl + 1;
    this.sound.runeOk();
    this.persist();
    this.ui.grimoire();
  }

  setSetting(key, val) {
    const s = this.save.settings;
    let v = val;
    if (val === 'true') v = true; else if (val === 'false') v = false; else if (/^\d+(\.\d+)?$/.test(val)) v = Number(val);
    s[key] = v;
    if (key === 'sound') this.sound.setEnabled(v);
    if (key === 'haptics') { this.haptics.enabled = v; if (v) this.haptics.pulse(1); }
    if (key === 'quality') this.applyQuality();
    if (key === 'lefty') { this.input.lefty = v; document.body.classList.toggle('lefty', v); }
    this.persist();
    this.ui.settings(this.ui.settingsBack);
  }

  resetProgress() {
    this.save = resetSave();
    this.fx.settings = this.save.settings;
    this.persist();
    this.ui.menu();
  }

  // ===== Цикл =====
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let rdt = (now - this.last) / 1000;
    this.last = now;
    if (!(rdt > 0)) rdt = 1 / 60;
    rdt = Math.min(rdt, 1 / 20);
    if (this.manual) return;
    this.tick(rdt);
  }

  // Ручной шаг (для автотестов).
  step(n = 1, dt = 1 / 60) {
    for (let i = 0; i < n; i++) this.tick(dt, i === n - 1);
  }

  tick(rdt, render = true) {
    this.time += rdt;
    this.input.update(rdt);
    if (this.battle) {
      if (!this.paused) this.battle.update(rdt, this.input);
      this.adaptQuality(rdt);
    } else {
      this.updateMenuScene(rdt);
      this.fx.update(rdt);
    }
    this.arena.update(this.time, rdt);
    if (this.battle && !this.paused) this.ui.updateFloats(rdt);
    if (!render) return;
    this.renderer.render(this.scene, this.camera);
    this.ui.render2d(this.camera);
  }
}

function boot() {
  const loading = document.getElementById('loading');
  try {
    new Game();
    loading.style.opacity = 0;
    setTimeout(() => loading.remove(), 600);
  } catch (e) {
    document.getElementById('load-msg').textContent = 'Ошибка запуска: ' + e.message;
    console.error(e);
  }
}

try {
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.__NO_SW) {
    window.addEventListener('load', () => {
      try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* песочница */ }
    });
  }
} catch (e) { /* нет доступа к service worker */ }

boot();
