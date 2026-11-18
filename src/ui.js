// Интерфейс: экраны меню (DOM), HUD, всплывающие числа урона, экранные эффекты.
import * as THREE from 'three';
import { WEAPONS, WEAPON_TYPES, ARMOR, ARMOR_SLOTS, SPELLS, SPELL_ORDER, MAGIC_UPGRADES, ARCHETYPES, getFight, rankName } from './data.js';
import { glyphSVG, SPELL_GLYPH, recognize, GLYPH_TO_SPELL } from './gesture.js';

const $ = (sel, root = document) => root.querySelector(sel);
const hex = (n) => '#' + new THREE.Color(n).getHexString();

export function unlockWins(rank) { return Math.ceil(rank * 1.5); }

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = $('#screens');
    this.hud = $('#hud');
    this.fx2d = $('#fx2d');
    this.g2 = this.fx2d.getContext('2d');
    this.floats = [];
    this.splats = [];
    this.makeSplats();
    this.hp = { lag: 1, ehpLag: 1 };
    this.bindHud();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.current = null;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.fx2d.width = Math.round(window.innerWidth * dpr);
    this.fx2d.height = Math.round(window.innerHeight * dpr);
    this.dpr = dpr;
  }

  bindHud() {
    const G = this.game;
    const tap = (id, fn) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); G.sound.unlock(); el.classList.add('pressed'); fn(); });
      el.addEventListener('pointerup', () => el.classList.remove('pressed'));
      el.addEventListener('pointercancel', () => el.classList.remove('pressed'));
      el.addEventListener('pointerleave', () => el.classList.remove('pressed'));
    };
    tap('#btn-rune', () => G.input.push({ type: 'rune' }));
    tap('#btn-rune-cancel', () => G.input.push({ type: 'rune' }));
    tap('#btn-dash', () => G.input.push({ type: 'dash' }));
    tap('#btn-pause', () => G.input.push({ type: 'pause' }));
    tap('#btn-target', () => G.input.push({ type: 'target' }));
  }

  // ===== Экраны =====
  clear() { this.screens.innerHTML = ''; this.current = null; }

  screen(html, name) {
    this.screens.innerHTML = `<div class="screen scr-${name}">${html}</div>`;
    this.current = name;
    const root = this.screens.firstElementChild;
    root.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.sound.unlock();
        this.game.sound.click();
        this.onAction(el.dataset.act, el.dataset);
      });
    });
    return root;
  }

  onAction(act, ds) {
    const G = this.game;
    switch (act) {
      case 'menu': this.menu(); break;
      case 'prefight': if (!G.save.seenTutorial) { this.howto('prefight'); G.save.seenTutorial = true; G.persist(); } else this.prefight(); break;
      case 'fight': G.startBattle(); break;
      case 'shop': this.shop(ds.tab || 'weapons'); break;
      case 'grimoire': this.grimoire(); break;
      case 'howto': this.howto(ds.back || 'menu'); break;
      case 'settings': this.settings(ds.back || 'menu'); break;
      case 'practice': this.practice(); break;
      case 'resume': G.resume(); break;
      case 'forfeit': G.forfeit(); break;
      case 'buy': G.buy(ds.kind, ds.id); break;
      case 'equip': G.equip(ds.kind, ds.id); break;
      case 'unequip': G.unequip(ds.slot); break;
      case 'learn': G.learnSpell(ds.id); break;
      case 'upgrade': G.buyUpgrade(ds.id); break;
      case 'set': G.setSetting(ds.key, ds.val); break;
      case 'reset': if (ds.confirm === '1') { G.resetProgress(); } else { const b = this.screens.querySelector('[data-act="reset"]'); b.dataset.confirm = '1'; b.textContent = 'Точно? Нажмите ещё раз'; } break;
      case 'back': this[ds.to || 'menu'](); break;
      case 'results-next': G.leaveBattle(ds.to); break;
      case 'install': this.installTip(); break;
    }
  }

  resBar() {
    const s = this.game.save;
    return `<div class="res"><span class="gold">⛁ ${s.gold}</span><span class="xp">✦ ${s.xp} опыта</span><span class="rank">⚔ ${rankName(s.fightsWon)} · побед: ${s.fightsWon}</span></div>`;
  }

  menu() {
    const s = this.game.save;
    const f = getFight(s.fight);
    const standalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    this.screen(`
      <div class="menu-main">
        <div class="subtitle">гладиаторские поединки · магия · сталь</div>
        <div class="title">АРЕНА КРОВИ</div>
        ${this.resBar()}
        <button class="btn primary" data-act="prefight">В бой · №${s.fight}${f.enemies.some((e) => e.boss) ? ' · БОСС' : ''}</button>
        <div class="row">
          <button class="btn" data-act="shop">Арсенал</button>
          <button class="btn" data-act="grimoire">Гримуар</button>
        </div>
        <div class="row">
          <button class="btn small" data-act="howto">Как играть</button>
          <button class="btn small" data-act="practice">Тренировка рун</button>
          <button class="btn small" data-act="settings">Настройки</button>
        </div>
        ${standalone ? '' : '<div class="ios-tip">Установка на iPhone: Safari → «Поделиться» → «На экран Домой». Игра работает офлайн и на весь экран.</div>'}
      </div>`, 'menu');
    this.game.showMenuScene();
  }

  // ----- Арсенал -----
  shop(tab = 'weapons') {
    const G = this.game, s = G.save;
    let cards = '';
    if (tab === 'weapons') {
      const list = Object.entries(WEAPONS).sort((a, b) => a[1].price - b[1].price);
      for (const [id, w] of list) {
        const T = WEAPON_TYPES[w.type];
        const owned = s.owned.weapons.includes(id);
        const eq = s.equipped.weapon === id;
        const need = unlockWins(w.rank);
        const locked = !owned && s.fightsWon < need;
        const spd = Math.round((0.55 - T.swing) / 0.35 * 100);
        cards += `<div class="card ${eq ? 'equipped' : ''} ${locked ? 'locked' : ''}">
          ${eq ? '<div class="tag">надето</div>' : ''}
          <div class="ty">${T.name}</div><div class="nm">${w.name}</div>
          <div class="st"><b>Урон</b><span>${w.dmg}${w.type === 'spear' ? ' (укол ' + Math.round(w.dmg * T.thrust) + ')' : ''}</span>
          <b>Скорость</b><div class="stat-bar"><i style="width:${Math.max(8, spd)}%"></i></div>
          <b>Дальность</b><div class="stat-bar"><i style="width:${Math.round((T.reach - 1.4) / 1.9 * 100)}%"></i></div>
          <b>Отрубание</b><div class="stat-bar"><i style="width:${Math.round(Math.max(T.sever, T.crush) * 100)}%"></i></div></div>
          <div class="ds">${T.desc}</div>
          <div class="act">${eq ? '' : owned ? `<button class="btn small" data-act="equip" data-kind="weapon" data-id="${id}">Взять</button>`
            : locked ? `<span class="note">🔒 после ${need} побед</span>` : `<button class="btn small" data-act="buy" data-kind="weapon" data-id="${id}" ${s.gold < w.price ? 'disabled' : ''}>Купить · <span class="price">⛁ ${w.price}</span></button>`}</div>
        </div>`;
      }
    } else {
      for (const slot of ['head', 'body', 'hands', 'feet']) {
        const list = Object.entries(ARMOR).filter(([, a]) => a.slot === slot).sort((a, b) => a[1].price - b[1].price);
        for (const [id, a] of list) {
          const owned = s.owned.armor.includes(id);
          const eq = s.equipped[slot] === id;
          const need = unlockWins(a.rank);
          const locked = !owned && s.fightsWon < need;
          const bonus = [];
          if (a.speed) bonus.push(`скорость +${Math.round(a.speed * 100)}%`);
          if (a.manaRegen) bonus.push(`мана реген +${Math.round(a.manaRegen * 100)}%`);
          if (a.manaMax) bonus.push(`мана +${a.manaMax}`);
          if (a.hpBonus) bonus.push(`здоровье +${a.hpBonus}`);
          if (a.staminaRegen) bonus.push(`выносливость +${Math.round(a.staminaRegen * 100)}%`);
          if (a.weight) bonus.push(`вес ${a.weight}`);
          cards += `<div class="card ${eq ? 'equipped' : ''} ${locked ? 'locked' : ''}">
            ${eq ? '<div class="tag">надето</div>' : ''}
            <div class="ty">${ARMOR_SLOTS[slot]}</div><div class="nm">${a.name}</div>
            <div class="st"><b>Броня</b><span>${a.armor}</span></div>
            <div class="ds">${bonus.join(' · ') || '&nbsp;'}</div>
            <div class="act">${eq ? (slot !== 'body' ? `<button class="btn small" data-act="unequip" data-slot="${slot}">Снять</button>` : '') : owned ? `<button class="btn small" data-act="equip" data-kind="armor" data-id="${id}">Надеть</button>`
              : locked ? `<span class="note">🔒 после ${need} побед</span>` : (a.price ? `<button class="btn small" data-act="buy" data-kind="armor" data-id="${id}" ${s.gold < a.price ? 'disabled' : ''}>Купить · <span class="price">⛁ ${a.price}</span></button>` : '')}</div>
          </div>`;
        }
      }
    }
    const root = this.screen(`
      <div class="topbar"><button class="btn small" data-act="menu">← Назад</button><h2>Арсенал</h2>
        <div class="tabs"><button class="tab ${tab === 'weapons' ? 'on' : ''}" data-act="shop" data-tab="weapons">Оружие</button><button class="tab ${tab === 'armor' ? 'on' : ''}" data-act="shop" data-tab="armor">Доспехи</button></div></div>
      ${this.resBar()}
      <div class="scroll" style="flex:1"><div class="grid">${cards}</div></div>`, 'shop');
    this.shopTab = tab;
    this.restoreScroll(root);
  }

  restoreScroll(root) {
    const sc = root.querySelector('.scroll');
    if (!sc) return;
    if (this.lastScroll && this.lastScroll.name === this.current) sc.scrollTop = this.lastScroll.top;
    sc.addEventListener('scroll', () => { this.lastScroll = { name: this.current, top: sc.scrollTop }; });
  }

  // ----- Гримуар -----
  grimoire() {
    const s = this.game.save;
    let cards = '';
    for (const id of SPELL_ORDER) {
      const S = SPELLS[id];
      const lvl = s.spells[id] || 0;
      const cost = lvl < 3 ? S.xp[lvl] : null;
      const dots = [1, 2, 3].map((i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('');
      const L = S.lv[Math.max(0, lvl - 1)];
      const stats = Object.entries(L).map(([k, v]) => `${statName(k)}: ${typeof v === 'boolean' ? 'да' : v}`).join(' · ');
      cards += `<div class="card spell-card ${lvl ? '' : 'locked-soft'}">
        <div class="glyph-box">${glyphSVG(SPELL_GLYPH[id], hex(S.color), 52)}</div>
        <div>
          <div class="nm">${S.name}<span class="lvl">${dots}</span></div>
          <div class="ty">Символ: ${S.hint} · мана ${S.mana}</div>
          <div class="ds">${S.desc}</div>
          <div class="ds" style="color:#9fd8ff">${stats}</div>
          <div class="act">${cost === null ? '<span class="note">Максимальный уровень</span>' : `<button class="btn small" data-act="learn" data-id="${id}" ${s.xp < cost ? 'disabled' : ''}>${lvl ? 'Улучшить' : 'Изучить'} · <span class="xp-cost">✦ ${cost}</span></button>`}</div>
        </div></div>`;
    }
    for (const [id, U] of Object.entries(MAGIC_UPGRADES)) {
      const lvl = s.upgrades[id] || 0;
      const cost = lvl < U.max ? U.cost(lvl) : null;
      const dots = Array.from({ length: U.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      cards += `<div class="card"><div class="ty">Мистерия</div><div class="nm">${U.name}<span class="lvl">${dots}</span></div><div class="ds">${U.desc}</div>
        <div class="act">${cost === null ? '<span class="note">Максимум</span>' : `<button class="btn small" data-act="upgrade" data-id="${id}" ${s.xp < cost ? 'disabled' : ''}>Изучить · <span class="xp-cost">✦ ${cost}</span></button>`}</div></div>`;
    }
    const root = this.screen(`
      <div class="topbar"><button class="btn small" data-act="menu">← Назад</button><h2>Гримуар</h2><button class="btn small" data-act="practice">Тренировка рун</button></div>
      ${this.resBar()}
      <div class="note">В бою нажмите кнопку руны — время замедлится — и нарисуйте символ пальцем.</div>
      <div class="scroll" style="flex:1"><div class="grid">${cards}</div></div>`, 'grimoire');
    this.restoreScroll(root);
  }

  // ----- Тренировка рун -----
  practice() {
    const s = this.game.save;
    const known = SPELL_ORDER.map((id) => `<div class="rune-item ${s.spells[id] ? '' : 'nomana'}">${glyphSVG(SPELL_GLYPH[id], hex(SPELLS[id].color), 26)}<span>${SPELLS[id].name}</span></div>`).join('');
    const root = this.screen(`
      <div class="topbar"><button class="btn small" data-act="back" data-to="grimoire">← Гримуар</button><h2>Тренировка рун</h2><span></span></div>
      <div class="rune-list" style="margin-bottom:6px">${known}</div>
      <div class="practice"><canvas></canvas><div class="msg">Нарисуйте символ</div></div>
      <div class="note">Стрелу можно рисовать в любую сторону — так задаётся направление блинка.</div>`, 'practice');
    const box = root.querySelector('.practice');
    const cv = box.querySelector('canvas');
    const msg = box.querySelector('.msg');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { cv.width = box.clientWidth * dpr; cv.height = box.clientHeight * dpr; };
    fit();
    const g = cv.getContext('2d');
    let strokes = [], cur = null, timer = null;
    const draw = (color = '#7fd8ff') => {
      g.clearRect(0, 0, cv.width, cv.height);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color; g.lineWidth = 8 * dpr; g.shadowColor = color; g.shadowBlur = 16 * dpr;
      for (const st of strokes) { if (st.length < 2) continue; g.beginPath(); g.moveTo(st[0].x * dpr, st[0].y * dpr); for (const p of st) g.lineTo(p.x * dpr, p.y * dpr); g.stroke(); }
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault(); box.setPointerCapture(e.pointerId);
      if (timer) { clearTimeout(timer); timer = null; }
      cur = [pos(e)]; strokes.push(cur); this.game.sound.runeStroke();
    });
    box.addEventListener('pointermove', (e) => { if (!cur) return; cur.push(pos(e)); draw(); });
    const up = () => {
      if (!cur) return;
      cur = null;
      timer = setTimeout(() => {
        const r = recognize(strokes);
        if (r && r.ok) {
          const sp = GLYPH_TO_SPELL[r.glyph];
          const dir = { arrow_up: ' вперёд', arrow_down: ' назад', arrow_left: ' влево', arrow_right: ' вправо' }[r.glyph] || '';
          msg.innerHTML = `${SPELLS[sp].name}${dir} ✓ <small>(${Math.round(r.score * 100)}%)</small>${s.spells[sp] ? '' : ' — ещё не изучено'}`;
          msg.style.color = hex(SPELLS[sp].color);
          draw('#ffd27a');
          this.game.sound.runeOk();
        } else {
          msg.textContent = 'Не распознано — попробуйте чётче';
          msg.style.color = '#ff6a6a';
          draw('#ff4a4a');
          this.game.sound.fizzle();
        }
        strokes = [];
        timer = null;
      }, 380);
    };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  }

  // ----- Перед боем -----
  prefight() {
    const G = this.game, s = G.save;
    const f = getFight(s.fight);
    const cards = f.enemies.map((e) => {
      const A = ARCHETYPES[e.archetype];
      const w = WEAPONS[A.weapon];
      const glyphs = A.spells.map((sp) => glyphSVG(SPELL_GLYPH[sp], hex(SPELLS[sp].color), 24)).join('');
      const hp = Math.round(A.hp * (1 + (e.level - 1) * 0.13) * (e.boss ? 1.35 : 1) * e.groupScale);
      return `<div class="enemy-card ${e.boss ? 'boss' : ''}">
        <div class="ti">${e.boss ? '☠ Босс · ' : ''}${A.title}</div>
        <div class="nm">${e.name}</div>
        <div class="info">Оружие: ${w.name} <span style="color:var(--dim)">(${WEAPON_TYPES[w.type].name.toLowerCase()})</span><br>Здоровье: ${hp}</div>
        ${A.spells.length ? `<div class="info">Магия:</div><div class="glyphs">${glyphs}</div>` : '<div class="info" style="color:var(--dim)">Не владеет магией</div>'}
      </div>`;
    }).join('');
    const w = WEAPONS[s.equipped.weapon];
    this.screen(`
      <div class="topbar"><button class="btn small" data-act="menu">← Назад</button><h2>Бой №${f.n}</h2><span></span></div>
      <div class="scroll" style="flex:1; display:flex; flex-direction:column; align-items:center">
        <div class="row" style="align-items:stretch">
          <div class="enemy-card"><div class="ti">Вы</div><div class="nm">${rankName(s.fightsWon)}</div>
            <div class="info">Оружие: ${w.name}<br>Здоровье: ${100 + (s.upgrades.vitality || 0) * 15 + (ARMOR[s.equipped.body]?.hpBonus || 0)}</div>
            <div class="info">Заклинания:</div><div class="glyphs">${SPELL_ORDER.filter((id) => s.spells[id]).map((id) => glyphSVG(SPELL_GLYPH[id], hex(SPELLS[id].color), 24)).join('')}</div></div>
          <div class="vs" style="align-self:center">VS</div>
          ${cards}
        </div>
        <div class="res" style="margin-top:8px"><span class="gold">Награда: ⛁ ${f.gold}</span><span class="xp">✦ ${f.xp} опыта</span></div>
        <button class="btn primary" data-act="fight">Сражаться!</button>
      </div>`, 'prefight');
    G.showMenuScene(f);
  }

  // ----- Итоги -----
  results(r, rw) {
    const st = r.stats;
    const lines = rw.lines.map(([k, v]) => `<div class="line"><span>${k}</span><span>${v}</span></div>`).join('');
    this.screen(`
      <div class="scroll" style="flex:1; display:flex; flex-direction:column; align-items:center">
        <div style="margin:auto 0; display:flex; flex-direction:column; align-items:center">
        <div class="big-result ${r.win ? 'win' : 'lose'}">${r.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</div>
        <div class="results-box">
          <div class="stats-grid">
            <span>Убито <b>${st.kills}</b></span><span>Головы <b>${st.decap}</b></span><span>Конечности <b>${st.dismember}</b></span>
            <span>Парирования <b>${st.parries}</b></span><span>Урон получен <b>${Math.round(st.damageTaken)}</b></span><span>Комбо <b>${st.maxCombo}</b></span>
          </div>
          ${lines}
          <div class="line total"><span>Итого</span><span><span style="color:var(--gold2)">⛁ +${rw.gold}</span> &nbsp; <span style="color:#8fd8ff">✦ +${rw.xp}</span></span></div>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn" data-act="results-next" data-to="menu">В лагерь</button>
          <button class="btn primary" data-act="results-next" data-to="${r.win ? 'prefight' : 'retry'}">${r.win ? 'Следующий бой' : 'Реванш'}</button>
        </div>
        </div>
      </div>`, 'results');
  }

  pause() {
    this.screen(`<div class="menu-main"><h2>Пауза</h2>
      <button class="btn primary" data-act="resume">Продолжить</button>
      <button class="btn" data-act="howto" data-back="pause">Управление</button>
      <button class="btn" data-act="settings" data-back="pause">Настройки</button>
      <button class="btn" data-act="forfeit">Сдаться</button></div>`, 'pause');
  }

  settings(back = 'menu') {
    const s = this.game.save.settings;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, label]) => `<button class="${String(s[key]) === String(v) ? 'on' : ''}" data-act="set" data-key="${key}" data-val="${v}">${label}</button>`).join('')}</div>`;
    this.settingsBack = back;
    this.screen(`
      <div class="topbar"><button class="btn small" data-act="back" data-to="${back}">← Назад</button><h2>Настройки</h2><span></span></div>
      <div class="scroll" style="flex:1; display:flex; justify-content:center"><div class="settings">
        <div class="set-row"><span>Звук</span>${seg('sound', [[true, 'Вкл'], [false, 'Выкл']])}</div>
        <div class="set-row"><span>Вибрация</span>${seg('haptics', [[true, 'Вкл'], [false, 'Выкл']])}</div>
        <div class="set-row"><span>Графика</span>${seg('quality', [['auto', 'Авто'], ['low', 'Низк.'], ['medium', 'Средн.'], ['high', 'Выс.']])}</div>
        <div class="set-row"><span>Кровь</span>${seg('blood', [[0, 'Мало'], [1, 'Средне'], [2, 'Реки']])}</div>
        <div class="set-row"><span>Левша (джойстик справа)</span>${seg('lefty', [[false, 'Нет'], [true, 'Да']])}</div>
        ${back === 'menu' ? '<div class="set-row"><span>Прогресс</span><button class="btn small" data-act="reset">Сбросить</button></div>' : ''}
        <div class="note">Вибрация на iPhone работает в iOS 18+. Если нет звука — проверьте беззвучный режим.</div>
      </div></div>`, 'settings');
  }

  howto(back = 'menu') {
    const nextBtn = back === 'prefight' ? '<button class="btn primary" data-act="back" data-to="prefight">Понятно, в бой!</button>' : '';
    this.screen(`
      <div class="topbar"><button class="btn small" data-act="back" data-to="${back === 'prefight' ? 'menu' : back}">← Назад</button><h2>Как играть</h2><span></span></div>
      <div class="scroll" style="flex:1; display:flex; flex-direction:column; align-items:center"><div class="howto">
        <div class="card"><div class="nm">🕹 Движение</div>Левый палец — плавающий джойстик. Камера сама держит цель. «»» — рывок с неуязвимостью.</div>
        <div class="card"><div class="nm">⚔ Удар — свайп</div>Проведите пальцем справа — клинок пройдёт по этой линии. Режьте по шее — отрубите голову, по руке — руку. Быстрый свайп бьёт сильнее.</div>
        <div class="card"><div class="nm">🗡 Укол — тап</div>Короткое касание — колющий удар в точку. Копьё и кинжал колют особенно больно.</div>
        <div class="card"><div class="nm">🛡 Блок — удержание</div>Держите палец справа — блок. Нажмите в момент удара врага (оружие светится красным) — ПАРИРОВАНИЕ и оглушение врага.</div>
        <div class="card"><div class="nm">✦ Магия — руны</div>Нажмите кнопку руны: время замедлится. Нарисуйте символ: ↑ блинк, ○ щит, △ огненный шар, V толчок, Z молния, X лёд, S кровопийца, ☆ метеор.</div>
        <div class="card"><div class="nm">👁 Читайте врага</div>Враги тоже колдуют: над головой загорается их руна. Ударьте — и каст прервётся. Оружие врага светится перед ударом.</div>
        <div class="card"><div class="nm">⚖ Оружие</div>Кинжал быстрый и короткий, копьё длинное, топор рубит конечности, булава дробит черепа и броню, двуручник медленный, но страшный.</div>
        <div class="card"><div class="nm">⛁ Прокачка</div>За победы — золото и опыт. Золото — оружие и доспехи в Арсенале. Опыт — заклинания в Гримуаре.</div>
        <div class="card"><div class="nm">⌨ На компьютере</div>WASD — ходьба, мышь — свайпы/клик-укол, ПКМ или F — блок, Q — руна, Пробел — рывок, 1–8 — быстрые заклинания.</div>
      </div>${nextBtn}</div>`, 'howto');
  }

  installTip() {}

  // ===== HUD =====
  battleStart(B) {
    this.clear();
    this.hudCache = null;
    this.hud.classList.remove('hidden');
    document.body.classList.add('in-battle');
    document.body.classList.toggle('lefty', !!this.game.save.settings.lefty);
    $('#countdown').textContent = '';
    $('#btn-target').style.display = B.enemies.length > 1 ? 'flex' : 'none';
    $('#enemy-dots').innerHTML = B.enemies.length > 1 ? B.enemies.map(() => '<i></i>').join('') : '';
    this.shield(false);
    this.runeMode(false, B);
    this.hp.lag = 1; this.hp.ehpLag = 1;
    this.floats = [];
    $('#hurt').style.opacity = 0;
    $('#frost-fx').style.opacity = 0;
  }

  battleEnd() {
    this.hud.classList.add('hidden');
    document.body.classList.remove('in-battle');
    $('#rune-fx').classList.remove('on');
    $('#shield-fx').classList.remove('on');
    $('#hurt').style.opacity = 0;
    this.floats = [];
    this.g2.clearRect(0, 0, this.fx2d.width, this.fx2d.height);
  }

  countdown(t) {
    const el = $('#countdown');
    const txt = t > 1.6 ? '3' : t > 0.8 ? '2' : t > 0 ? '1' : '';
    if (t <= 0) { el.textContent = ''; this.centerText('БОЙ!', 'kill'); return; }
    if (el.textContent !== txt) { el.textContent = txt; this.game.sound.click(); }
  }

  updateHud(B) {
    const P = B.player;
    const C = this.hudCache || (this.hudCache = { el: {}, v: {} });
    const el = (sel) => C.el[sel] || (C.el[sel] = $(sel));
    const set = (sel, k) => {
      k = Math.max(0, Math.min(1, k));
      if (Math.abs((C.v[sel] ?? -1) - k) < 0.002) return;
      C.v[sel] = k;
      el(sel).style.transform = `scaleX(${k.toFixed(3)})`;
    };
    const txt = (sel, t) => { if (C.v[sel + 't'] === t) return; C.v[sel + 't'] = t; el(sel).textContent = t; };
    const hpK = Math.max(0, P.hp / P.maxHp);
    this.hp.lag += (hpK - this.hp.lag) * 0.04;
    if (this.hp.lag < hpK) this.hp.lag = hpK;
    set('#bars .hp .fill', hpK); set('#bars .hp .lag', this.hp.lag);
    txt('#bars .hp span', String(Math.ceil(Math.max(0, P.hp))));
    set('#bars .mana .fill', P.mana / P.maxMana);
    txt('#bars .mana span', String(Math.floor(P.mana)));
    set('#bars .stam .fill', P.stamina / P.maxStamina);
    const t = P.target;
    const tEl = el('#target');
    if (t) {
      if (C.v.tvis !== 1) { tEl.style.opacity = 1; C.v.tvis = 1; }
      const name = `${t.name} <small>${t.title}</small>`;
      if (tEl.dataset.name !== name) { tEl.querySelector('.tname').innerHTML = name; tEl.dataset.name = name; this.hp.ehpLag = t.hp / t.maxHp; }
      const k = Math.max(0, t.hp / t.maxHp);
      this.hp.ehpLag += (k - this.hp.ehpLag) * 0.05;
      if (this.hp.ehpLag < k) this.hp.ehpLag = k;
      set('#target .ehp .fill', k); set('#target .ehp .lag', this.hp.ehpLag);
      set('#target .eshield', t.shield ? t.shield.hp / t.shield.max : 0);
      const st = [];
      if (t.status.burn > 0) st.push('🔥 горит');
      if (t.status.frozen > 0) st.push('❄ заморожен');
      if (t.status.stun > 0) st.push('⚡ оглушён');
      if (t.status.bleed > 0) st.push('🩸 кровоточит');
      if (t.state === 'cast' && t.cast) st.push('✦ колдует: ' + SPELLS[t.cast.spell].name);
      txt('#target .tstatus', st.join('  '));
    } else if (C.v.tvis !== 0) { tEl.style.opacity = 0; C.v.tvis = 0; }
    if (B.enemies.length > 1) {
      const dots = el('#enemy-dots').children;
      B.enemies.forEach((e, i) => { const cls = (e.dead ? 'dead' : '') + (e === t ? ' cur' : ''); if (dots[i] && dots[i].className !== cls) dots[i].className = cls; });
    }
    // мана на кнопке руны
    const runeOp = P.mana >= 15 ? '1' : '0.5';
    if (C.v.runeOp !== runeOp) { el('#btn-rune').style.opacity = runeOp; C.v.runeOp = runeOp; }
    // низкое здоровье
    const low = hpK < 0.3 && !P.dead;
    let hurt = this.hurtLevel || 0;
    if (low) {
      const pulse = 0.35 + Math.sin(performance.now() / 180) * 0.15;
      hurt = Math.max(pulse * (1 - hpK / 0.3), hurt);
      if (Math.sin(performance.now() / 180) > 0.97) B.sound.heartbeat();
    }
    if (P.dead) hurt = 0.9;
    const hs = hurt.toFixed(2);
    if (C.v.hurt !== hs) { el('#hurt').style.opacity = hs; C.v.hurt = hs; }
    this.hurtLevel = Math.max(0, (this.hurtLevel || 0) - 0.03);
    // комбо
    const comboTxt = B.combo >= 3 ? `${B.combo}×<small>комбо</small>` : '';
    if (C.v.combo !== comboTxt) {
      C.v.combo = comboTxt;
      const c = el('#combo');
      if (comboTxt) { c.style.opacity = 1; c.innerHTML = comboTxt; } else c.style.opacity = 0;
    }
  }

  centerText(text, cls = '') {
    const el = $('#center-text');
    el.className = '';
    void el.offsetWidth;
    el.textContent = text;
    el.className = 'show ' + cls;
  }

  spellCast(S) {
    const el = $('#spell-name');
    el.className = '';
    void el.offsetWidth;
    el.textContent = S.name;
    el.style.color = hex(S.color);
    el.className = 'show';
  }

  runeMode(on, B) {
    this.hud.classList.toggle('rune', on);
    $('#rune-panel').classList.toggle('on', on);
    $('#rune-fx').classList.toggle('on', on);
    $('#btn-rune').classList.toggle('active', on);
    $('#btn-dash').style.display = on ? 'none' : 'flex';
    if (on && B) {
      const s = this.game.save;
      $('#rune-panel .rune-list').innerHTML = SPELL_ORDER.filter((id) => s.spells[id]).map((id) => {
        const S = SPELLS[id];
        return `<div class="rune-item ${B.player.mana < S.mana ? 'nomana' : ''}">${glyphSVG(SPELL_GLYPH[id], hex(S.color), 26)}<span>${S.name} · ${S.mana}</span></div>`;
      }).join('');
    }
  }

  shield(on) { $('#shield-fx').classList.toggle('on', on); }
  shieldHit() {
    const el = $('#shield-fx');
    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 150);
  }

  hurt(heavy) { this.hurtLevel = Math.min(0.9, 0.35 + heavy * 0.3); }

  frost(dur) {
    const el = $('#frost-fx');
    el.style.opacity = 1;
    clearTimeout(this.frostTimer);
    this.frostTimer = setTimeout(() => { el.style.opacity = 0; }, dur * 1000);
  }

  flash(color) {
    const el = $('#flash');
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = 1;
    requestAnimationFrame(() => { el.style.transition = 'opacity 0.35s'; el.style.opacity = 0; });
  }

  makeSplats() {
    this.splatImgs = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const blob = (x, y, r, a) => { g.fillStyle = `rgba(${110 + Math.random() * 40},0,0,${a})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
      blob(128, 128, 40 + Math.random() * 25, 0.85);
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 90;
        blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2 + Math.random() * 14 * (1 - d / 130), 0.7 + Math.random() * 0.3);
      }
      for (let k = 0; k < 6; k++) {
        // потёки
        const x = 90 + Math.random() * 80;
        g.fillStyle = 'rgba(120,0,0,0.75)';
        g.fillRect(x, 128, 4 + Math.random() * 6, 40 + Math.random() * 90);
      }
      this.splatImgs.push(c);
    }
  }

  screenBlood(amount = 0.6) {
    const host = $('#blood-screen');
    const n = 1 + Math.floor(amount * 2.5);
    for (let i = 0; i < n; i++) {
      if (host.children.length > 9) host.firstElementChild.remove();
      const src = this.splatImgs[Math.floor(Math.random() * this.splatImgs.length)];
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(src, 0, 0);
      const size = (18 + Math.random() * 22) * Math.min(window.innerWidth, window.innerHeight) / 100 * (0.7 + amount * 0.5);
      const edge = Math.random() < 0.5;
      const x = edge ? (Math.random() < 0.5 ? -size * 0.3 : window.innerWidth - size * 0.7) : Math.random() * (window.innerWidth - size);
      const y = Math.random() * (window.innerHeight - size * 0.6);
      Object.assign(c.style, { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px', opacity: Math.min(0.95, 0.5 + amount * 0.5), transform: `rotate(${Math.random() * 360}deg)` });
      host.appendChild(c);
      setTimeout(() => { c.style.opacity = 0; }, 400 + Math.random() * 600);
      setTimeout(() => c.remove(), 3200);
    }
  }

  floatText(pos, text, color = '#fff', size = 18) {
    this.floats.push({ pos: pos.clone(), text, color, t: 0, life: 1.1, size, vy: 0 });
  }

  damageNumber(pos, dmg, crit = false, kind = null) {
    const color = kind === 'fire' ? '#ff9a3a' : kind === 'lightning' ? '#bfe6ff' : kind === 'frost' ? '#a8f0ff' : kind === 'drain' ? '#ff4060' : crit ? '#ffd23a' : '#ffffff';
    this.floats.push({ pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2, 0)), text: String(Math.round(dmg)), color, t: 0, life: 0.85, size: crit ? 30 : 22, vy: 0 });
  }

  updateFloats(rdt) {
    this.floats = this.floats.filter((f) => (f.t += rdt) < f.life);
  }

  render2d(camera) {
    const g = this.g2, d = this.dpr;
    g.clearRect(0, 0, this.fx2d.width, this.fx2d.height);
    if (!this.floats.length) return;
    const W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    g.textAlign = 'center';
    g.lineJoin = 'round';
    for (const f of this.floats) {
      v.copy(f.pos).project(camera);
      if (v.z > 1) continue;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H - f.t * 50;
      const k = f.t / f.life;
      const pop = f.t < 0.08 ? 1 + (0.08 - f.t) * 6 : 1;
      g.globalAlpha = Math.min(1, (1 - k) * 2);
      g.font = `900 ${Math.round(f.size * pop * d)}px -apple-system, "Segoe UI", sans-serif`;
      g.lineWidth = 4 * d;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(f.text, x * d, y * d);
      g.fillStyle = f.color;
      g.fillText(f.text, x * d, y * d);
    }
    g.globalAlpha = 1;
  }
}

function statName(k) {
  return { dist: 'дальность', absorb: 'поглощение', dur: 'длит.', reflect: 'отражение', dmg: 'урон', burn: 'горение/с', radius: 'радиус', force: 'сила', stun: 'оглушение', chain: 'цепь', freeze: 'заморозка', total: 'выпито' }[k] || k;
}
