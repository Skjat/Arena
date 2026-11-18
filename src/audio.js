// Процедурный звук на Web Audio API — никаких файлов, всё синтезируется.

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.lastPlay = {};
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(comp); comp.connect(ctx.destination);
    // Буфер белого шума.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Реверберация арены.
    this.reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    this.reverb.buffer = ir;
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.22;
    this.revSend.connect(this.reverb); this.reverb.connect(this.master);
    this.startCrowd();
    if (ctx.state === 'suspended') ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  get t() { return this.ctx.currentTime; }

  ok(name, minGap = 0.03) {
    if (!this.ctx || !this.enabled) return false;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return false;
    this.lastPlay[name] = now;
    return true;
  }

  out(node, rev = 0) {
    node.connect(this.master);
    if (rev > 0) {
      const g = this.ctx.createGain(); g.gain.value = rev;
      node.connect(g); g.connect(this.revSend);
    }
  }

  // Шумовой всплеск через фильтр.
  noise({ dur = 0.2, type = 'bandpass', freq = 1000, freqEnd = null, q = 1, gain = 0.5, attack = 0.005, when = 0, rev = 0, curve = 'exp' }) {
    if (!this.ctx || !this.enabled) return null;
    const ctx = this.ctx, t0 = this.t + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    else g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); this.out(g, rev);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
    return g;
  }

  tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.2, gain = 0.3, attack = 0.005, when = 0, rev = 0, detune = 0 }) {
    if (!this.ctx || !this.enabled) return null;
    const ctx = this.ctx, t0 = this.t + when;
    const o = ctx.createOscillator();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); this.out(g, rev);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return g;
  }

  // ===== Боевые звуки =====
  swing(weight = 1) {
    if (!this.ok('swing', 0.05)) return;
    const w = Math.max(0.5, Math.min(2, weight));
    this.noise({ dur: 0.16 + 0.12 * w, type: 'bandpass', freq: 2400 / w, freqEnd: 500 / w, q: 1.6, gain: 0.32, attack: 0.04 });
  }

  hit(heavy = 1) {
    if (!this.ok('hit', 0.03)) return;
    const h = Math.min(2.2, heavy);
    this.tone({ type: 'sine', freq: 140 * (1.2 - h * 0.15), freqEnd: 45, dur: 0.22, gain: 0.55 * h });
    this.noise({ dur: 0.14, type: 'lowpass', freq: 1800, freqEnd: 300, gain: 0.5 });
    // хлюп
    this.noise({ dur: 0.18, type: 'bandpass', freq: 900, freqEnd: 260, q: 6, gain: 0.45, when: 0.01 });
  }

  gore() {
    if (!this.ok('gore', 0.05)) return;
    this.noise({ dur: 0.35, type: 'bandpass', freq: 700, freqEnd: 140, q: 4, gain: 0.7 });
    this.noise({ dur: 0.08, type: 'highpass', freq: 2500, gain: 0.35 });
    this.noise({ dur: 0.9, type: 'bandpass', freq: 3500, freqEnd: 1500, q: 1.2, gain: 0.18, attack: 0.05, when: 0.05, curve: 'lin' });
    this.tone({ type: 'sine', freq: 90, freqEnd: 35, dur: 0.3, gain: 0.5 });
  }

  crunch() {
    if (!this.ok('crunch', 0.05)) return;
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.05, type: 'bandpass', freq: 1200 + Math.random() * 2500, q: 3, gain: 0.4, when: i * 0.018 });
    this.noise({ dur: 0.4, type: 'lowpass', freq: 600, freqEnd: 120, gain: 0.6 });
  }

  clang(bright = 1) {
    if (!this.ok('clang', 0.04)) return;
    const base = 480 + Math.random() * 120;
    [1, 2.76, 5.4, 8.93].forEach((m, i) => this.tone({ type: 'sine', freq: base * m * bright, dur: 0.5 - i * 0.08, gain: 0.22 / (i + 1), rev: 0.6 }));
    this.noise({ dur: 0.05, type: 'highpass', freq: 3000, gain: 0.4 });
  }

  parry() {
    if (!this.ok('parry', 0.05)) return;
    this.clang(1.4);
    this.tone({ type: 'triangle', freq: 1800, freqEnd: 2600, dur: 0.35, gain: 0.12, rev: 0.8, when: 0.02 });
  }

  thud(v = 1) {
    if (!this.ok('thud', 0.06)) return;
    this.tone({ type: 'sine', freq: 70, freqEnd: 32, dur: 0.25, gain: Math.min(0.8, 0.3 * v) });
    this.noise({ dur: 0.12, type: 'lowpass', freq: 500, gain: Math.min(0.5, 0.2 * v) });
  }

  step() {
    if (!this.ok('step', 0.12)) return;
    this.noise({ dur: 0.07, type: 'lowpass', freq: 700, gain: 0.07 });
  }

  // голос: формантный синтез
  voice(pitch = 1, kind = 'grunt') {
    if (!this.ok('voice' + kind, 0.25)) return;
    const ctx = this.ctx, t0 = this.t;
    const dur = kind === 'death' ? 0.75 : kind === 'scream' ? 0.9 : 0.28;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = (kind === 'scream' ? 260 : 125) * pitch;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(f0 * (kind === 'grunt' ? 0.8 : 1.15), t0 + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t0 + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 6;
    const vg = ctx.createGain(); vg.gain.value = f0 * 0.04;
    vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.28, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const forms = kind === 'grunt' ? [[500, 8], [1000, 9]] : [[750, 7], [1200, 8], [2600, 10]];
    for (const [f, q] of forms) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      o.connect(bp); bp.connect(g);
    }
    this.out(g, 0.4);
    o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
    this.noise({ dur: dur * 0.6, type: 'bandpass', freq: 1500, q: 1, gain: 0.05 });
  }

  // ===== Магия =====
  fireCast() {
    if (!this.ok('fireCast')) return;
    this.noise({ dur: 0.6, type: 'lowpass', freq: 400, freqEnd: 3000, gain: 0.5, attack: 0.1 });
    this.tone({ type: 'sawtooth', freq: 90, freqEnd: 220, dur: 0.5, gain: 0.08 });
  }

  explode(size = 1) {
    if (!this.ok('explode', 0.05)) return;
    this.noise({ dur: 1.2 * size, type: 'lowpass', freq: 2500, freqEnd: 80, gain: 0.9, rev: 0.7 });
    this.tone({ type: 'sine', freq: 70, freqEnd: 25, dur: 0.9 * size, gain: 0.8 });
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.04, type: 'highpass', freq: 3000, gain: 0.2, when: 0.05 + Math.random() * 0.5 });
  }

  zap() {
    if (!this.ok('zap')) return;
    this.noise({ dur: 0.12, type: 'highpass', freq: 2000, gain: 0.8, rev: 0.6 });
    const ctx = this.ctx, t0 = this.t;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 8); }
    ws.curve = curve;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(ws); ws.connect(g); this.out(g, 0.3);
    o.start(t0); o.stop(t0 + 0.55);
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.03, type: 'highpass', freq: 4000, gain: 0.5, when: 0.05 + i * 0.06 });
  }

  ice() {
    if (!this.ok('ice')) return;
    for (let i = 0; i < 6; i++) this.tone({ type: 'sine', freq: 1800 + Math.random() * 2400, dur: 0.4, gain: 0.07, when: i * 0.03, rev: 0.7 });
    this.noise({ dur: 0.4, type: 'highpass', freq: 5000, gain: 0.2 });
  }

  shatter() {
    if (!this.ok('shatter')) return;
    for (let i = 0; i < 14; i++) this.tone({ type: 'triangle', freq: 1500 + Math.random() * 4000, dur: 0.18, gain: 0.08, when: Math.random() * 0.25, rev: 0.5 });
    this.noise({ dur: 0.5, type: 'highpass', freq: 3000, freqEnd: 8000, gain: 0.4 });
    this.crunch();
  }

  push() {
    if (!this.ok('push')) return;
    this.tone({ type: 'sine', freq: 220, freqEnd: 40, dur: 0.6, gain: 0.7 });
    this.noise({ dur: 0.5, type: 'bandpass', freq: 300, freqEnd: 1500, q: 0.8, gain: 0.5, rev: 0.5 });
  }

  blink() {
    if (!this.ok('blink')) return;
    this.tone({ type: 'sine', freq: 300, freqEnd: 2400, dur: 0.18, gain: 0.25, rev: 0.4 });
    this.noise({ dur: 0.2, type: 'bandpass', freq: 4000, freqEnd: 800, q: 2, gain: 0.3 });
  }

  shield() {
    if (!this.ok('shield')) return;
    this.tone({ type: 'sine', freq: 220, freqEnd: 330, dur: 0.8, gain: 0.2, attack: 0.1, rev: 0.6 });
    this.tone({ type: 'sine', freq: 331, freqEnd: 495, dur: 0.8, gain: 0.14, attack: 0.1, rev: 0.6 });
  }

  shieldHit() {
    if (!this.ok('shieldHit', 0.05)) return;
    this.tone({ type: 'sine', freq: 600, freqEnd: 300, dur: 0.3, gain: 0.25, rev: 0.6 });
    this.noise({ dur: 0.1, type: 'bandpass', freq: 2000, q: 4, gain: 0.2 });
  }

  drain() {
    if (!this.ok('drain')) return;
    const ctx = this.ctx, t0 = this.t;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 160;
    const l = ctx.createOscillator(); l.frequency.value = 9;
    const lg = ctx.createGain(); lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.22, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
    o.connect(g); this.out(g, 0.6);
    o.start(t0); l.start(t0); o.stop(t0 + 1.4); l.stop(t0 + 1.4);
  }

  meteorFall() {
    if (!this.ok('meteor')) return;
    this.tone({ type: 'sawtooth', freq: 1400, freqEnd: 120, dur: 1.0, gain: 0.08 });
    this.noise({ dur: 1.0, type: 'bandpass', freq: 3000, freqEnd: 300, q: 1.5, gain: 0.4, attack: 0.6, curve: 'lin' });
  }

  castCharge(color = 'fire') {
    if (!this.ok('charge', 0.2)) return;
    this.tone({ type: 'sine', freq: 200, freqEnd: 600, dur: 0.7, gain: 0.12, attack: 0.3, rev: 0.5 });
    this.noise({ dur: 0.7, type: 'bandpass', freq: 800, freqEnd: 2500, q: 3, gain: 0.12, attack: 0.4 });
  }

  // ===== Руны и UI =====
  runeOpen() {
    if (!this.ok('runeOpen')) return;
    this.tone({ type: 'sine', freq: 520, freqEnd: 260, dur: 0.4, gain: 0.15, rev: 0.8 });
  }

  runeStroke() {
    if (!this.ok('runeStroke', 0.08)) return;
    this.tone({ type: 'sine', freq: 880 + Math.random() * 300, dur: 0.25, gain: 0.07, rev: 0.8 });
  }

  runeOk() {
    if (!this.ok('runeOk')) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.35, gain: 0.1, when: i * 0.04, rev: 0.8 }));
  }

  fizzle() {
    if (!this.ok('fizzle')) return;
    this.tone({ type: 'sawtooth', freq: 300, freqEnd: 80, dur: 0.4, gain: 0.1 });
    this.noise({ dur: 0.4, type: 'highpass', freq: 3000, gain: 0.15 });
  }

  click() {
    if (!this.ok('click', 0.03)) return;
    this.tone({ type: 'triangle', freq: 900, freqEnd: 600, dur: 0.06, gain: 0.12 });
  }

  coin() {
    if (!this.ok('coin', 0.05)) return;
    this.tone({ type: 'square', freq: 1320, dur: 0.08, gain: 0.06 });
    this.tone({ type: 'square', freq: 1760, dur: 0.25, gain: 0.06, when: 0.07 });
  }

  gong() {
    if (!this.ok('gong')) return;
    [1, 1.48, 2.1, 2.9].forEach((m, i) => this.tone({ type: 'sine', freq: 110 * m, dur: 2.5 - i * 0.4, gain: 0.3 / (i + 1), rev: 1 }));
  }

  heartbeat() {
    if (!this.ok('heart', 0.5)) return;
    this.tone({ type: 'sine', freq: 60, freqEnd: 40, dur: 0.15, gain: 0.45 });
    this.tone({ type: 'sine', freq: 55, freqEnd: 38, dur: 0.15, gain: 0.35, when: 0.2 });
  }

  // ===== Толпа =====
  startCrowd() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.3;
    const lg = ctx.createGain(); lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.crowdGain = g; this.crowdFilter = bp;
    this.crowdLevel = 0.03;
    g.gain.setTargetAtTime(this.crowdLevel, ctx.currentTime, 1);
  }

  crowd(level) {
    if (!this.ctx || !this.crowdGain) return;
    this.crowdLevel = level;
    this.crowdGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.6);
  }

  cheer(amount = 1) {
    if (!this.ctx || !this.crowdGain || !this.ok('cheer', 0.8)) return;
    const t = this.ctx.currentTime;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.crowdLevel + 0.12 * amount, t, 0.15);
    g.setTargetAtTime(this.crowdLevel, t + 1.2 + amount, 0.8);
    this.crowdFilter.frequency.setTargetAtTime(1100, t, 0.2);
    this.crowdFilter.frequency.setTargetAtTime(700, t + 1.5, 0.8);
    // отдельные выкрики
    for (let i = 0; i < 6 * amount; i++) {
      this.noise({ dur: 0.3 + Math.random() * 0.4, type: 'bandpass', freq: 600 + Math.random() * 1400, q: 6, gain: 0.04, when: Math.random() * 0.8, attack: 0.08 });
    }
  }
}

// Хаптика: на iOS 18+ клик по label переключателя даёт отклик Taptic Engine.
export class Haptics {
  constructor() {
    this.enabled = true;
    this.last = 0;
    try {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.id = 'haptic-switch';
      input.style.display = 'none';
      const label = document.createElement('label');
      label.htmlFor = 'haptic-switch';
      label.style.display = 'none';
      document.body.appendChild(input);
      document.body.appendChild(label);
      this.label = label;
    } catch (e) { this.label = null; }
  }

  pulse(strength = 1) {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.last < 60) return;
    this.last = now;
    try {
      if (navigator.vibrate) { navigator.vibrate(Math.round(10 + strength * 25)); return; }
      if (this.label) {
        this.label.click();
        if (strength > 1.5) setTimeout(() => this.label.click(), 90);
        if (strength > 2.5) setTimeout(() => this.label.click(), 180);
      }
    } catch (e) { /* ignore */ }
  }
}
