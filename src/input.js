// Ввод: сенсорный джойстик, свайпы-удары, тап-укол, удержание-блок, рисование рун.
// Работает и с мышью/клавиатурой (для ПК).
import { recognize } from './gesture.js';

export class Input {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('touch');
    this.canvas = document.getElementById('rune-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.joyBase = document.getElementById('joy-base');
    this.joyKnob = document.getElementById('joy-knob');
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0, mouse: false }; // накопленный поворот камеры (пиксели)
    this.lookBuf = { x: 0, y: 0 };            // поворот, отложенный до распознавания жеста
    this.queue = [];
    this.ptrs = new Map();
    this.joy = null;
    this.keys = new Set();
    this.runeMode = false;
    this.strokes = [];
    this.finalizeAt = 0;
    this.fade = null;
    this.enabled = false;
    this.lefty = false;
    this.attackMode = 'swipe'; // 'swipe' — удар взмахом, 'button' — кнопкой
    this.bind();
    this.resize();
  }

  push(ev) { if (this.enabled) this.queue.push(ev); }
  consume() { const q = this.queue; this.queue = []; return q; }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.dpr = dpr;
    this.redraw();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.queue = [];
      this.ptrs.clear();
      this.endJoy();
      this.keys.clear();
      this.updateKeyMove();
      this.look.x = 0; this.look.y = 0;
      this.lookBuf.x = 0; this.lookBuf.y = 0;
      if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (_) { /* ignore */ } }
    }
  }

  setRuneMode(on) {
    this.runeMode = on;
    if (on && document.pointerLockElement) { try { document.exitPointerLock(); } catch (_) { /* ignore */ } }
    this.strokes = [];
    this.finalizeAt = 0;
    // активные касания атаки превращаются в «пустые»
    for (const [id, p] of this.ptrs) if (p.role === 'attack') p.role = 'dead';
    if (!on && !this.fade) this.clearCanvas();
    this.canvas.style.display = on || this.fade ? 'block' : 'none';
    this.redraw();
  }

  ndc(x, y) { return { x: (x / window.innerWidth) * 2 - 1, y: -(y / window.innerHeight) * 2 + 1 }; }

  inMoveZone(x) {
    const W = window.innerWidth;
    return this.lefty ? x > W * 0.6 : x < W * 0.4;
  }

  bind() {
    const el = this.el;
    const opts = { passive: false };
    el.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    window.addEventListener('pointermove', (e) => this.onMove(e), opts);
    window.addEventListener('pointerup', (e) => this.onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // запрет прокрутки/зума на iOS
    document.addEventListener('touchmove', (e) => { if (e.target.closest && e.target.closest('.scroll')) return; e.preventDefault(); }, opts);
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => { this.keys.clear(); this.updateKeyMove(); });
    // мышь с захватом указателя: обзор движением мыши
    window.addEventListener('mousemove', (e) => this.onMouseLook(e));
    document.addEventListener('pointerlockerror', () => { this.lockFails = (this.lockFails || 0) + 1; });
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) this.lockFails = 0; });
    this.bindAttackButton();
  }

  // Пороги жестов, нормированные к телефону в альбомной ориентации.
  gp() {
    const W = window.innerWidth, H = window.innerHeight;
    const k = Math.max(0.8, Math.min(1.8, Math.min(W, H) / 390));
    return { W, H, slop: 8 * k, thr: 30 * k, vSwipe: 1.1 * k };
  }

  // Скорость пальца (px/мс) за последние ms миллисекунд.
  speedOver(p, ms) {
    const sm = p.samples, cur = sm[sm.length - 1];
    let ref = sm[0];
    for (let k = sm.length - 2; k >= 0; k--) { if (cur.t - sm[k].t >= ms) { ref = sm[k]; break; } }
    const dt = Math.max(8, cur.t - ref.t);
    return Math.hypot(cur.x - ref.x, cur.y - ref.y) / dt;
  }

  addLook(p, dx, dy) {
    this.look.x += dx; this.look.y += dy;
    if (p.lookAcc) { p.lookAcc.x += dx; p.lookAcc.y += dy; }
  }

  // Удар по линии: из точки S в направлении (dirx, diry).
  fireSwing(S, dirx, diry, speed) {
    const { W, H } = this.gp();
    let maxT = W * 0.55;
    // обрезать по краю экрана
    const tx = dirx > 0 ? (W - S.x) / dirx : dirx < 0 ? -S.x / dirx : Infinity;
    const ty = diry > 0 ? (H - S.y) / diry : diry < 0 ? -S.y / diry : Infinity;
    maxT = Math.min(maxT, tx, ty);
    let a = { x: S.x - dirx * W * 0.1, y: S.y - diry * W * 0.1 };
    const b = { x: S.x + dirx * maxT, y: S.y + diry * maxT };
    if (Math.hypot(b.x - a.x, b.y - a.y) < W * 0.3) a = { x: b.x - dirx * W * 0.32, y: b.y - diry * W * 0.32 };
    this.push({ type: 'swing', a: this.ndc(a.x, a.y), b: this.ndc(b.x, b.y), speed });
  }

  // Удар через центр экрана (прицел) — для кнопки удара.
  swingThroughCenter(dirx, diry, speed = 1) {
    const { W, H } = this.gp();
    const a = { x: W / 2 - dirx * W * 0.3, y: H / 2 - diry * W * 0.3 }, b = { x: W / 2 + dirx * W * 0.3, y: H / 2 + diry * W * 0.3 };
    this.push({ type: 'swing', a: this.ndc(a.x, a.y), b: this.ndc(b.x, b.y), speed });
  }

  onDown(e) {
    e.preventDefault();
    this.game.sound.unlock();
    if (!this.enabled) return;
    const x = e.clientX, y = e.clientY;
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (this.runeMode) {
      this.ptrs.set(e.pointerId, { role: 'draw', stroke: [{ x, y }] });
      this.strokes.push(this.ptrs.get(e.pointerId).stroke);
      this.finalizeAt = 0;
      this.game.sound.runeStroke();
      this.redraw();
      return;
    }
    if (e.pointerType === 'mouse') {
      // первый клик захватывает мышь для обзора (если браузер позволяет)
      const canLock = !!this.el.requestPointerLock && (this.lockFails || 0) < 2;
      if (!document.pointerLockElement && canLock) {
        if (!this.lockPending) {
          this.lockPending = true;
          try {
            const r = this.el.requestPointerLock();
            if (r && r.catch) r.catch(() => {});
          } catch (_) { this.lockFails = 2; }
          setTimeout(() => {
            this.lockPending = false;
            if (!document.pointerLockElement) this.lockFails = (this.lockFails || 0) + 1;
          }, 350);
        }
        return;
      }
      if (e.button === 2) {
        // ПКМ: блок; без захвата мыши перетаскивание ещё и поворачивает камеру
        this.ptrs.set(e.pointerId, { role: 'block', lx: x, ly: y });
        this.push({ type: 'press' });
        return;
      }
      if (document.pointerLockElement) {
        this.ptrs.set(e.pointerId, { role: 'mattack', t: performance.now(), ax: 0, ay: 0, swung: false });
        this.push({ type: 'press' });
        return;
      }
    }
    if (e.pointerType !== 'mouse' && this.inMoveZone(x) && !this.joy) {
      this.joy = { id: e.pointerId, ox: x, oy: y };
      this.ptrs.set(e.pointerId, { role: 'joy' });
      this.joyBase.style.display = 'block';
      this.joyBase.style.left = x + 'px';
      this.joyBase.style.top = y + 'px';
      this.joyKnob.style.transform = 'translate(-50%,-50%)';
      return;
    }
    const now = performance.now();
    const p = {
      role: 'attack', sx: x, sy: y, ax: x, ay: y, lx: x, ly: y, t: now, swung: false, lastDir: null, mode: 'pending',
      samples: [{ t: now, x, y }], moveT: 0, heldBefore: 0, lookAcc: { x: 0, y: 0 }, lastT: now
    };
    this.ptrs.set(e.pointerId, p);
    this.push({ type: 'press' });
  }

  onMove(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    if (p.role === 'joy') {
      const R = 58;
      let dx = x - this.joy.ox, dy = y - this.joy.oy;
      const L = Math.hypot(dx, dy);
      if (L > R) { dx *= R / L; dy *= R / L; }
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      let mx = dx / R, my = -dy / R;
      const m = Math.hypot(mx, my);
      if (m < 0.15) { mx = 0; my = 0; }
      this.move.x = mx; this.move.y = my;
      return;
    }
    if (p.role === 'draw') {
      const last = p.stroke[p.stroke.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 3) { p.stroke.push({ x, y }); this.redraw(); }
      return;
    }
    if (p.role === 'block') {
      if (!document.pointerLockElement) { this.look.x += x - p.lx; this.look.y += y - p.ly; }
      p.lx = x; p.ly = y;
      return;
    }
    if (p.role !== 'attack') return;
    const G = this.gp();
    const now = performance.now();
    p.samples.push({ t: now, x, y });
    if (p.samples.length > 14) p.samples.shift();

    // --- обзор: камера следует за пальцем
    if (p.mode === 'look') {
      this.addLook(p, x - p.lx, y - p.ly);
      p.lx = x; p.ly = y;
      return;
    }

    // --- ещё не решено: по умолчанию это обзор, удар — только резкий взмах с места
    if (p.mode === 'pending') {
      const d0 = Math.hypot(x - p.sx, y - p.sy);
      if (d0 < G.slop) return;
      if (!p.moveT) { p.moveT = now; p.heldBefore = now - p.t; }
      // пока жест не распознан, поворот копится в буфере (иначе камера дёргалась бы перед каждым ударом)
      p.lookAcc.x += x - p.lx; p.lookAcc.y += y - p.ly;
      p.lx = x; p.ly = y;
      const sinceMove = now - p.moveT;
      const swipeOk = this.attackMode !== 'button' && p.heldBefore < 220;
      const v = this.speedOver(p, 60);
      const toLook = () => {
        p.mode = 'look';
        // накопленный поворот плавно отдаётся камере
        this.lookBuf.x += p.lookAcc.x; this.lookBuf.y += p.lookAcc.y;
        // короткое касание без паузы — чистый обзор; после удержания — блок с поворотом
        if (p.heldBefore < 250) this.push({ type: 'release' });
      };
      if (!swipeOk) { toLook(); return; }
      if (d0 >= G.thr) {
        if (sinceMove <= 170 && v >= G.vSwipe) {
          // резкий взмах с места — удар вдоль движения пальца, камера не поворачивается
          p.mode = 'swiped';
          const dx = x - p.sx, dy = y - p.sy;
          this.fireSwing({ x: p.sx, y: p.sy }, dx / d0, dy / d0, Math.min(1.5, v / (G.vSwipe * 2)));
          p.swung = true;
          p.lastDir = { x: dx / d0, y: dy / d0 };
          p.ax = x; p.ay = y; p.lastT = now;
        } else toLook();
      } else if (sinceMove > 110 || (sinceMove > 45 && v < G.vSwipe * 0.5)) toLook();
      return;
    }

    // --- после взмаха: смена направления на скорости — следующий удар серии; замедление — обзор
    if (p.mode === 'swiped') {
      const v = this.speedOver(p, 60);
      if (v < G.vSwipe * 0.4 && now - p.lastT > 140) {
        p.mode = 'look'; p.lx = x; p.ly = y;
        return;
      }
      const dx = x - p.ax, dy = y - p.ay;
      const L = Math.hypot(dx, dy);
      if (L < G.thr) return;
      const dirx = dx / L, diry = dy / L;
      const dot = p.lastDir ? p.lastDir.x * dirx + p.lastDir.y * diry : 0;
      if (dot > 0.4) { p.ax = x; p.ay = y; return; }
      if (L < G.thr * 1.6 || v < G.vSwipe) return;
      this.fireSwing({ x: p.ax, y: p.ay }, dirx, diry, Math.min(1.5, v / (G.vSwipe * 2)));
      p.lastDir = { x: dirx, y: diry };
      p.ax = x; p.ay = y; p.lastT = now;
    }
  }

  onUp(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.role === 'joy') { this.endJoy(); return; }
    if (p.role === 'block') { this.push({ type: 'release' }); return; }
    if (p.role === 'draw') {
      const anyDrawing = [...this.ptrs.values()].some((q) => q.role === 'draw');
      if (!anyDrawing) this.finalizeAt = performance.now() + 380;
      return;
    }
    if (p.role === 'attack') {
      const dt = performance.now() - p.t;
      // укол — только чистый тап: палец не сдвигался
      if (p.mode === 'pending' && !p.moveT && dt < 260) this.push({ type: 'thrust', p: this.ndc(p.sx, p.sy) });
      // короткий сдвиг, отпущенный до распознавания, — это тоже поворот камеры
      if (p.mode === 'pending' && p.moveT) { this.lookBuf.x += p.lookAcc.x; this.lookBuf.y += p.lookAcc.y; }
      this.push({ type: 'release' });
    }
    if (p.role === 'mattack') {
      if (!p.swung && performance.now() - p.t < 280) this.push({ type: 'thrust', p: { x: 0, y: 0 } });
      this.push({ type: 'release' });
    }
  }

  // Кнопка удара (режим «Кнопка»): тап — удар через прицел, взмах от кнопки — удар в эту сторону.
  bindAttackButton() {
    const btn = document.getElementById('btn-attack');
    if (!btn) return;
    let st = null;
    this.autoDir = 0;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.game.sound.unlock();
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, swung: false };
      btn.classList.add('pressed');
    });
    btn.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id || st.swung) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y, L = Math.hypot(dx, dy);
      if (L >= 22) { this.swingThroughCenter(dx / L, dy / L, 1.1); st.swung = true; }
    });
    const up = (e) => {
      if (!st || e.pointerId !== st.id) return;
      btn.classList.remove('pressed');
      if (!st.swung) {
        // чередование направлений: справа налево, слева направо, наискось, сверху
        const dirs = [[-1, 0.18], [1, 0.18], [-0.75, 0.66], [0.75, 0.66], [0.05, 1]];
        const d = dirs[this.autoDir++ % dirs.length], L = Math.hypot(d[0], d[1]);
        this.swingThroughCenter(d[0] / L, d[1] / L, 0.9);
      }
      st = null;
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }

  // Мышь в режиме захвата: обзор, а с зажатой ЛКМ — быстрый рывок мыши = удар.
  onMouseLook(e) {
    if (!this.enabled || document.pointerLockElement !== this.el) return;
    if (this.runeMode) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    const att = [...this.ptrs.values()].find((q) => q.role === 'mattack');
    if (att && !att.swung && performance.now() - att.t < 220) {
      att.ax += mx; att.ay += my;
      const L = Math.hypot(att.ax, att.ay);
      if (L >= 24) {
        const W = window.innerWidth, H = window.innerHeight;
        const dx = att.ax / L, dy = att.ay / L;
        const a = { x: W / 2 - dx * W * 0.3, y: H / 2 - dy * W * 0.3 }, b = { x: W / 2 + dx * W * 0.3, y: H / 2 + dy * W * 0.3 };
        this.push({ type: 'swing', a: this.ndc(a.x, a.y), b: this.ndc(b.x, b.y), speed: Math.min(1.5, L / 40) });
        att.swung = true;
      }
      return;
    }
    this.look.x += mx; this.look.y += my;
    this.look.mouse = true;
  }

  endJoy() {
    this.joy = null;
    this.move.x = 0; this.move.y = 0;
    this.joyBase.style.display = 'none';
    this.updateKeyMove();
  }

  onKey(e, down) {
    const k = e.code;
    if (down && !e.repeat) this.game.sound.unlock();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyL', 'KeyI', 'KeyK'].includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
      this.updateKeyMove();
      e.preventDefault();
      return;
    }
    if (!this.enabled || e.repeat) return;
    if (down) {
      if (k === 'Space') { this.push({ type: 'dash' }); e.preventDefault(); }
      else if (k === 'KeyQ' || k === 'KeyE' || k === 'ShiftLeft' || k === 'ShiftRight') this.push({ type: 'rune' });
      else if (k === 'KeyF') this.push({ type: 'press' });
      else if (k === 'Tab') { this.push({ type: 'target' }); e.preventDefault(); }
      else if (k === 'Escape' || k === 'KeyP') this.push({ type: 'pause' });
      else if (/^Digit[1-8]$/.test(k)) {
        const order = ['blink', 'shield', 'fireball', 'push', 'lightning', 'frost', 'drain', 'meteor'];
        this.push({ type: 'quickcast', spell: order[Number(k.slice(5)) - 1], glyph: 'arrow_up' });
      }
    } else if (k === 'KeyF') this.push({ type: 'release' });
  }

  updateKeyMove() {
    if (this.joy) return;
    const K = this.keys;
    let x = 0, y = 0;
    if (K.has('KeyW')) y += 1;
    if (K.has('KeyS')) y -= 1;
    if (K.has('KeyA')) x -= 1;
    if (K.has('KeyD')) x += 1;
    const L = Math.hypot(x, y) || 1;
    this.move.x = x / L; this.move.y = y / L;
  }

  // Вызывается каждый кадр (реальное время).
  update(rdt) {
    // стрелки — поворот камеры
    const K = this.keys;
    if (this.enabled) {
      const tx = (K.has('ArrowRight') || K.has('KeyL') ? 1 : 0) - (K.has('ArrowLeft') || K.has('KeyJ') ? 1 : 0);
      const ty = (K.has('ArrowDown') || K.has('KeyK') ? 1 : 0) - (K.has('ArrowUp') || K.has('KeyI') ? 1 : 0);
      this.look.x += tx * 520 * rdt; this.look.y += ty * 300 * rdt;
    }
    // отдать камере отложенный поворот (за ~3 кадра, без рывка)
    const lb = this.lookBuf;
    if (lb.x || lb.y) {
      const k = Math.min(1, rdt * 28);
      this.look.x += lb.x * k; this.look.y += lb.y * k;
      lb.x -= lb.x * k; lb.y -= lb.y * k;
      if (Math.abs(lb.x) < 0.3 && Math.abs(lb.y) < 0.3) { this.look.x += lb.x; this.look.y += lb.y; lb.x = 0; lb.y = 0; }
    }
    if (this.runeMode && this.finalizeAt && performance.now() >= this.finalizeAt) {
      this.finalizeAt = 0;
      const strokes = this.strokes.filter((s) => s.length > 1);
      const result = recognize(strokes, this.game.knownGlyphs());
      this.fade = { strokes: this.strokes, t: 0, ok: !!(result && result.ok) };
      this.strokes = [];
      this.push({ type: 'runeCast', result });
    }
    if (this.fade) {
      this.fade.t += rdt;
      if (this.fade.t > 0.45) {
        this.fade = null;
        if (!this.runeMode) { this.clearCanvas(); this.canvas.style.display = 'none'; }
      }
      this.redraw();
    }
  }

  clearCanvas() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }

  redraw() {
    const g = this.ctx, d = this.dpr || 1;
    this.clearCanvas();
    const drawSet = (strokes, color, alpha, width) => {
      g.save();
      g.globalAlpha = alpha;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.shadowColor = color; g.shadowBlur = 22 * d;
      g.strokeStyle = color; g.lineWidth = width * d;
      for (const st of strokes) {
        if (st.length < 2) continue;
        g.beginPath();
        g.moveTo(st[0].x * d, st[0].y * d);
        for (let i = 1; i < st.length; i++) g.lineTo(st[i].x * d, st[i].y * d);
        g.stroke();
      }
      g.shadowBlur = 0;
      g.strokeStyle = '#ffffff'; g.lineWidth = width * 0.35 * d;
      for (const st of strokes) {
        if (st.length < 2) continue;
        g.beginPath();
        g.moveTo(st[0].x * d, st[0].y * d);
        for (let i = 1; i < st.length; i++) g.lineTo(st[i].x * d, st[i].y * d);
        g.stroke();
      }
      g.restore();
    };
    if (this.strokes.length) drawSet(this.strokes, '#7fd8ff', 1, 9);
    if (this.fade) {
      const k = 1 - this.fade.t / 0.45;
      drawSet(this.fade.strokes, this.fade.ok ? '#ffd27a' : '#ff4a4a', k, 9 + (1 - k) * 10);
    }
  }
}
