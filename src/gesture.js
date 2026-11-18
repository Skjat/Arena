// Распознавание рун: облачный распознаватель $P (Vatavu, Anthony, Wobbrock).
// Чувствителен к повороту (стрела вверх ≠ стрела вниз), не зависит от порядка
// и направления штрихов, поддерживает многоштриховые символы.

const N = 40;

function lerpPts(pts, per = 12) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * Math.PI / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

// Базовые формы (единичный квадрат, ось Y вниз как на экране).
// Каждая форма — массив штрихов, штрих — массив точек.
export const GLYPH_SHAPES = {
  arrow_up: [[[0.5, 1], [0.5, 0]], [[0.18, 0.34], [0.5, 0], [0.82, 0.34]]],
  arrow_down: [[[0.5, 0], [0.5, 1]], [[0.18, 0.66], [0.5, 1], [0.82, 0.66]]],
  arrow_left: [[[1, 0.5], [0, 0.5]], [[0.34, 0.18], [0, 0.5], [0.34, 0.82]]],
  arrow_right: [[[0, 0.5], [1, 0.5]], [[0.66, 0.18], [1, 0.5], [0.66, 0.82]]],
  circle: [arc(0.5, 0.5, 0.5, 0.5, -90, 270, 36)],
  triangle: [[[0.5, 0], [1, 0.88], [0, 0.88], [0.5, 0]]],
  z: [[[0, 0], [1, 0], [0, 1], [1, 1]]],
  v: [[[0, 0], [0.5, 1], [1, 0]]],
  x: [[[0, 0], [1, 1]], [[1, 0], [0, 1]]],
  s: [arc(0.5, 0.25, 0.3, 0.25, -30, -270, 18).concat(arc(0.5, 0.75, 0.3, 0.25, -90, 150, 18))],
  star: [(() => {
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const a = (-90 + k * 144) * Math.PI / 180;
      pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
    }
    return pts;
  })()]
};

// Какой символ какому заклинанию соответствует.
export const GLYPH_TO_SPELL = {
  arrow_up: 'blink', arrow_down: 'blink', arrow_left: 'blink', arrow_right: 'blink',
  circle: 'shield', triangle: 'fireball', v: 'push', z: 'lightning', x: 'frost', s: 'drain', star: 'meteor'
};

export const SPELL_GLYPH = {
  blink: 'arrow_up', shield: 'circle', fireball: 'triangle', push: 'v', lightning: 'z',
  frost: 'x', drain: 's', meteor: 'star'
};

function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

function pathLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) if (points[i].id === points[i - 1].id) d += dist(points[i - 1], points[i]);
  return d;
}

function resample(points, n) {
  const I = pathLength(points) / (n - 1);
  if (I <= 0) return null;
  let D = 0;
  const src = points.map((p) => ({ ...p }));
  const out = [{ ...src[0] }];
  for (let i = 1; i < src.length; i++) {
    if (src[i].id === src[i - 1].id) {
      const d = dist(src[i - 1], src[i]);
      if (D + d >= I) {
        const t = (I - D) / d;
        const q = { x: src[i - 1].x + t * (src[i].x - src[i - 1].x), y: src[i - 1].y + t * (src[i].y - src[i - 1].y), id: src[i].id };
        out.push(q);
        src.splice(i, 0, q);
        D = 0;
      } else D += d;
    }
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  out.length = n;
  return out;
}

function scale(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  return points.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
}

function translateToOrigin(points) {
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= points.length; cy /= points.length;
  return points.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

function normalize(points) {
  const r = resample(points, N);
  if (!r) return null;
  return translateToOrigin(scale(r));
}

function cloudDistance(pts1, pts2, start) {
  const n = pts1.length;
  const matched = new Array(n).fill(false);
  let sum = 0, i = start;
  do {
    let index = -1, min = Infinity;
    for (let j = 0; j < n; j++) {
      if (!matched[j]) {
        const d = dist(pts1[i], pts2[j]);
        if (d < min) { min = d; index = j; }
      }
    }
    matched[index] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * min;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

function greedyCloudMatch(points, tmpl) {
  const e = 0.5;
  const step = Math.floor(Math.pow(points.length, 1 - e));
  let min = Infinity;
  for (let i = 0; i < points.length; i += step) {
    const d1 = cloudDistance(points, tmpl, i);
    const d2 = cloudDistance(tmpl, points, i);
    min = Math.min(min, d1, d2);
  }
  return min;
}

function rotateStrokes(strokes, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return strokes.map((st) => st.map(([x, y]) => {
    const dx = x - 0.5, dy = y - 0.5;
    return [0.5 + dx * c - dy * s, 0.5 + dx * s + dy * c];
  }));
}

function strokesToPoints(strokes) {
  const pts = [];
  strokes.forEach((st, id) => {
    const dense = lerpPts(st, 10);
    for (const [x, y] of dense) pts.push({ x, y, id });
  });
  return pts;
}

// Шаблоны: базовые формы + слегка повёрнутые варианты для терпимости к наклону.
const TEMPLATES = [];
for (const [name, strokes] of Object.entries(GLYPH_SHAPES)) {
  const angles = name === 'circle' ? [0] : [-14, 0, 14];
  for (const ang of angles) {
    TEMPLATES.push({ name, points: normalize(strokesToPoints(rotateStrokes(strokes, ang))) });
  }
  // Однoштриховой вариант стрелы (древко + наконечник одним движением).
  if (name.startsWith('arrow')) {
    const [shaft, head] = strokes;
    const single = [[...shaft, head[0], head[1], head[2]]];
    TEMPLATES.push({ name, points: normalize(strokesToPoints(single)) });
  }
}

// strokes: [[{x,y}, ...], ...] в экранных координатах.
// allowed: множество имён символов, которые знает игрок (или null — все).
export function recognize(strokes, allowed = null) {
  const pts = [];
  let total = 0;
  strokes.forEach((st, id) => {
    for (let i = 0; i < st.length; i++) {
      pts.push({ x: st[i].x, y: st[i].y, id });
      if (i > 0) total += Math.hypot(st[i].x - st[i - 1].x, st[i].y - st[i - 1].y);
    }
  });
  if (pts.length < 6 || total < 40) return null;
  const cand = normalize(pts);
  if (!cand) return null;
  const best = {};
  for (const t of TEMPLATES) {
    if (allowed && !allowed.has(t.name)) continue;
    const d = greedyCloudMatch(cand, t.points);
    if (best[t.name] === undefined || d < best[t.name]) best[t.name] = d;
  }
  const ranked = Object.entries(best).sort((a, b) => a[1] - b[1]);
  if (!ranked.length) return null;
  const [name, d] = ranked[0];
  const second = ranked[1] ? ranked[1][1] : Infinity;
  const score = Math.max(0, Math.min(1, 1.25 - d / 2.2));
  return { glyph: name, distance: d, second, score, ok: d < 2.25 };
}

// SVG-путь символа для интерфейса (координаты 0..100).
export function glyphSVGPath(name) {
  const strokes = GLYPH_SHAPES[name];
  return strokes.map((st) => st.map(([x, y], i) => `${i ? 'L' : 'M'}${(8 + x * 84).toFixed(1)} ${(8 + y * 84).toFixed(1)}`).join(' ')).join(' ');
}

export function glyphSVG(name, color = '#ffd27a', size = 48) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="glyph"><path d="${glyphSVGPath(name)}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export const _test = { normalize, greedyCloudMatch, TEMPLATES, strokesToPoints };
