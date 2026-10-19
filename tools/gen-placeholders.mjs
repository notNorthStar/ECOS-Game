#!/usr/bin/env node
// ECOS — generador de arte placeholder (pixel art procedural). Dueño: arte.
//
//   npm run placeholders                 crea SOLO los PNG que no existen y actualiza src/data/assets.json
//   npm run placeholders -- --force      regenera además los que el manifiesto marca "placeholder": true
//   npm run placeholders -- --only=chaneque,fondo_calles   filtra por subcadena de la clave
//
// Nunca sobrescribe arte del equipo: un archivo existente que NO esté marcado placeholder se respeta siempre.
// Sin dependencias: escribe PNG con zlib de Node. Técnicas copiadas de docs/referencias/worlorn
// (dithering Bayer 4×4, ruido fbm, rampas de paleta, árboles recursivos) + contorno de color por pieza.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const MANIFEST = path.join(ROOT, 'src', 'data', 'assets.json');
const TEMPLATES = path.join(ROOT, 'art-templates');
const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes('--force');
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

// ════════════════════════════════════════════════════════════════════════════
// 1. PALETA GLOBAL (63 colores). Documentada en ART_SPEC.md §3. Rampas: oscuro → claro.
// ════════════════════════════════════════════════════════════════════════════
export const PAL = {
  // noche y niebla verde de Xalapa
  ink: '#120e1a', night1: '#0a0f1a', night2: '#0f1826', night3: '#152536', night4: '#1c3340', night5: '#26464c',
  fog1: '#365e5a', fog2: '#4f7c6e', fog3: '#77a08a', fog4: '#a8c4a8',
  // montañas y nieve del Pico de Orizaba
  mtn2: '#24394a', mtn3: '#33505a', snow1: '#8aa4a8', snow2: '#c8dcd8',
  // cantera gris (también pantalón del protagonista)
  can0: '#1e1c24', can1: '#2e2c34', can2: '#45434a', can3: '#625f62', can4: '#8a857e', can5: '#b3ab9c',
  // teja / terracota
  ter0: '#3a1a18', ter1: '#6a2e24', ter2: '#9a4630', ter3: '#c46a40',
  // luz cálida: faroles, ventanas, velas
  warm0: '#7a3a1a', warm1: '#d0742c', warm2: '#f2a640', warm3: '#ffd77a', warm4: '#fff4cc',
  // rosa mexicano (bufanda, neón)
  rosa0: '#5a0a3a', rosa1: '#a8125e', rosa2: '#e8207e', rosa3: '#ff6ab0',
  // turquesa (gema, neón, conjuros)
  tq0: '#0a3a40', tq1: '#128a8a', tq2: '#2ad0c0', tq3: '#9af8e8',
  // morado de la corrupción (antena de la Cofradía)
  pu0: '#2a0a40', pu1: '#5a1890', pu2: '#9a3ae0', pu3: '#d89aff',
  // follaje (también chaqueta del protagonista)
  fo0: '#0a1a14', fo1: '#14301f', fo2: '#22482c', fo3: '#36663a', fo4: '#5a8a46', fo5: '#9ab85a',
  // tierra y madera (también cabello y botas)
  ea0: '#1e120e', ea1: '#3a2418', ea2: '#5c3a24', ea3: '#8a5a34', ea4: '#b88a52',
  // piel
  sk0: '#6a3a30', sk1: '#b4785a', sk2: '#e0a882', sk3: '#f6d0a8',
  // camisa
  sh1: '#9aa0bc', sh2: '#dcdff0',
  // láseres
  gl2: '#8aff6a', gl3: '#e8ffd0', red1: '#c02030', red2: '#ff5040', red3: '#ffb0a0',
};
const PAL_SET = new Set(Object.values(PAL));
const C = (n) => PAL[n] ?? n;

// Rampas por material: [contorno, oscuro, medio, claro]
const R = {
  jacket: ['fo1', 'fo2', 'fo3', 'fo4'], jacketB: ['fo0', 'fo1', 'fo2', 'fo3'],
  pants: ['ink', 'can0', 'can1', 'can2'], pantsB: ['ink', 'ink', 'can0', 'can1'],
  boot: ['ea0', 'ea1', 'ea2', 'ea3'], bootB: ['ea0', 'ea0', 'ea1', 'ea2'],
  skin: ['sk0', 'sk1', 'sk2', 'sk3'], skinB: ['sk0', 'sk0', 'sk1', 'sk2'],
  hair: ['ea0', 'ea1', 'ea2', 'ea3'], scarf: ['rosa0', 'rosa1', 'rosa2', 'rosa3'],
  chSkin: ['ea1', 'fo3', 'fo4', 'fo5'], chSkinB: ['ea0', 'fo2', 'fo3', 'fo4'],
  leaf: ['fo0', 'fo1', 'fo2', 'fo3'], dryLeaf: ['ea0', 'ea2', 'ea3', 'ea4'],
  bark: ['ea0', 'ea1', 'ea2', 'ea3'], barkB: ['ea0', 'ea0', 'ea1', 'ea2'],
  metal: ['can0', 'can2', 'can3', 'can4'], stone: ['can1', 'can3', 'can4', 'can5'],
  gem: ['tq0', 'tq1', 'tq2', 'tq3'], purple: ['pu0', 'pu1', 'pu2', 'pu3'],
};

// ════════════════════════════════════════════════════════════════════════════
// 2. NÚCLEO: lienzo RGBA, PNG, ruido, dithering
// ════════════════════════════════════════════════════════════════════════════
const RGB = new Map();
function rgb(c) {
  c = C(c);
  let v = RGB.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(c, v); }
  return v;
}
/** Color de la paleta más cercano (las mezclas opacas siempre vuelven a la paleta). */
const NEAR = new Map();
function nearestPal(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  let q = NEAR.get(key);
  if (!q) {
    let best = 1e9;
    for (const c of PAL_SET) { const v = rgb(c), e = 2 * (v[0] - r) ** 2 + 4 * (v[1] - g) ** 2 + 3 * (v[2] - b) ** 2; if (e < best) { best = e; q = v; } }
    NEAR.set(key, q);
  }
  return q;
}
const hex = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);

class Cv {
  constructor(w, h) { this.w = w | 0; this.h = h | 0; this.d = new Uint8ClampedArray(this.w * this.h * 4); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  a(x, y) { x = Math.round(x); y = Math.round(y); return this.in(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  get(x, y) { const k = (y * this.w + x) * 4, d = this.d; return hex(d[k], d[k + 1], d[k + 2]); }
  /** Pinta (sobrescribe). alpha 0..1 */
  set(x, y, c, alpha = 1) {
    x = Math.round(x); y = Math.round(y);
    if (!this.in(x, y)) return;
    const v = rgb(c), k = (y * this.w + x) * 4, d = this.d;
    d[k] = v[0]; d[k + 1] = v[1]; d[k + 2] = v[2]; d[k + 3] = Math.round(alpha * 255);
  }
  /** Mezcla "encima" (para brillos semitransparentes). */
  over(x, y, c, alpha = 1) {
    x = Math.round(x); y = Math.round(y);
    if (!this.in(x, y) || alpha <= 0) return;
    const v = rgb(c), k = (y * this.w + x) * 4, d = this.d, da = d[k + 3] / 255;
    const oa = alpha + da * (1 - alpha);
    if (oa <= 0) return;
    for (let i = 0; i < 3; i++) d[k + i] = (v[i] * alpha + d[k + i] * da * (1 - alpha)) / oa;
    d[k + 3] = oa * 255;
    if (d[k + 3] === 255) { const q = nearestPal(d[k], d[k + 1], d[k + 2]); d[k] = q[0]; d[k + 1] = q[1]; d[k + 2] = q[2]; }
  }
  clear(x, y) { x = Math.round(x); y = Math.round(y); if (this.in(x, y)) this.d[(y * this.w + x) * 4 + 3] = 0; }
  rect(x, y, w, h, c, alpha = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, alpha); }
  clone() { const n = new Cv(this.w, this.h); n.d.set(this.d); return n; }
}
const P = (cv, c, x, y, w = 1, h = 1) => cv.rect(Math.round(x), Math.round(y), w, h, c);

// PNG
const CRC_T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(cv) {
  const { w, h, d } = cv, row = w * 4 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) { raw[y * row] = 0; Buffer.from(d.buffer, d.byteOffset + y * w * 4, w * 4).copy(raw, y * row + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function pngSize(file) {
  try { const b = Buffer.alloc(24); const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; } catch { return null; }
}

// Aleatorio con semilla, ruido de valor, fbm, Bayer
let SEED = 1;
const rnd = () => { SEED = (SEED * 16807) % 2147483647; return (SEED - 1) / 2147483646; };
const srand = (s) => { SEED = (Math.abs(s | 0) % 2147483646) + 1; };
const strSeed = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const BY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const D = (x, y) => (BY[y & 3][x & 3] + 0.5) / 16;
const hash = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = (t) => t * t * (3 - 2 * t);
const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi), a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vn(x * f + i * 17, y * f + i * 31); n += a; a *= 0.5; f *= 2; } return s / n; };
/** Elige de una rampa con dithering ordenado (t 0..1). */
const dp = (cols, t, x, y) => { t = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1); const i = Math.floor(t); return cols[(t - i) > D(x, y) ? Math.min(i + 1, cols.length - 1) : i]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ════════════════════════════════════════════════════════════════════════════
// 3. PRIMITIVAS DE DIBUJO
// ════════════════════════════════════════════════════════════════════════════
function ellipse(cv, cx, cy, rx, ry, c, alpha = 1) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const e = ((x - cx) / (rx + 0.25)) ** 2 + ((y - cy) / (ry + 0.25)) ** 2;
      if (e <= 1) cv.set(x, y, c, alpha);
    }
}
function capsule(cv, x0, y0, x1, y1, r, c) {
  const minx = Math.floor(Math.min(x0, x1) - r - 1), maxx = Math.ceil(Math.max(x0, x1) + r + 1);
  const miny = Math.floor(Math.min(y0, y1) - r - 1), maxy = Math.ceil(Math.max(y0, y1) + r + 1);
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const t = clamp(((x - x0) * dx + (y - y0) * dy) / L2, 0, 1), px = x0 + dx * t - x, py = y0 + dy * t - y;
    if (px * px + py * py <= r * r + 0.3) cv.set(x, y, c);
  }
}
function line(cv, x0, y0, x1, y1, c, w = 1, alpha = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) for (let k = 0; k < w; k++) cv.set(x0 + (x1 - x0) * i / n - (w >> 1) + k, y0 + (y1 - y0) * i / n, c, alpha);
}
function poly(cv, pts, c) {
  const ys = pts.map((p) => p[1]), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + (y + 0.5 - ay) * (bx - ax) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) cv.set(x, y, c);
  }
}
/** Árbol recursivo (Worlorn). */
function tree(cv, x, y, len, ang, d, c, rim, leaf) {
  if (d === 0 || len < 1.2) { if (leaf) leaf(x, y); return; }
  const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len, w = d >= 6 ? 3 : d >= 4 ? 2 : 1;
  line(cv, x, y, x1, y1, c, w);
  if (rim && d >= 3) line(cv, x - (w >> 1), y, x1 - (w >> 1), y1, rim, 1);
  const n = d >= 4 ? 2 : (rnd() < 0.5 ? 2 : 3);
  for (let i = 0; i < n; i++) tree(cv, x1, y1, len * (0.62 + rnd() * 0.14), ang + (rnd() - 0.5) * 1.1 + (i - (n - 1) / 2) * 0.62, d - 1, c, rim, leaf);
}
/** Sombreado de una pieza de un solo material: luz arriba-izquierda, sombra abajo-derecha. */
function shade(cv, ramp, o = {}) {
  const dark = o.dark ?? 1, light = o.light ?? 1, [, cd, cm, cl] = ramp.map(C);
  const src = cv.clone(), A = (x, y) => src.a(x, y) > 0;
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    if (!A(x, y)) continue;
    let c = cm;
    let isDark = !A(x + 1, y) || !A(x, y + 1);
    if (dark >= 2) isDark = isDark || !A(x + 2, y) || !A(x, y + 2) || !A(x + 1, y + 1);
    let isLight = !A(x - 1, y) || !A(x, y - 1);
    if (light >= 2) isLight = isLight || (!A(x - 1, y - 1) && !A(x - 2, y));
    if (isLight && !(!A(x + 1, y) && !A(x - 1, y))) c = cl;
    else if (isDark) c = cd;
    cv.set(x, y, c, src.d[(y * cv.w + x) * 4 + 3] / 255);
  }
}
/** Contorno de 1 px de color (no negro) alrededor de lo opaco. */
function outline(cv, c, diag = false) {
  const src = cv.clone(), A = (x, y) => src.a(x, y) > 100;
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    if (src.a(x, y) > 100) continue;
    if (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1) || (diag && (A(x - 1, y - 1) || A(x + 1, y + 1) || A(x + 1, y - 1) || A(x - 1, y + 1)))) cv.set(x, y, c);
  }
}
/** Compone src sobre dst. shear: desplaza cada fila (pivote y, factor k) para inclinar el torso. */
function comp(dst, src, dx = 0, dy = 0, o = {}) {
  for (let y = 0; y < src.h; y++) {
    const sx = o.shear ? Math.round((o.shear.y - (y + dy)) * o.shear.k) : 0;
    for (let x = 0; x < src.w; x++) {
      const k = (y * src.w + x) * 4, a = src.d[k + 3];
      if (!a) continue;
      const tx = (o.flip ? src.w - 1 - x : x) + dx + sx, ty = y + dy;
      const al = (a / 255) * (o.alpha ?? 1);
      if (o.dither && D(tx, ty) > o.dither) continue;
      dst.over(tx, ty, hex(src.d[k], src.d[k + 1], src.d[k + 2]), al);
    }
  }
}
/** Silueta de un color (estelas, destellos). */
function silhouette(src, c) { const n = new Cv(src.w, src.h); for (let i = 0; i < src.w * src.h; i++) if (src.d[i * 4 + 3] > 0) n.set(i % src.w, Math.floor(i / src.w), c, src.d[i * 4 + 3] / 255); return n; }
/** Desvanece con dithering: deja solo los píxeles con D < t. */
function ditherFade(cv, t) { for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) if (D(x, y) >= t) cv.clear(x, y); }
/** Destello: reemplaza con dithering los píxeles opacos por un color claro. */
function flash(cv, c, t) { const s = cv.clone(), A = (x, y) => s.a(x, y) > 100; for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) if (A(x, y) && A(x - 1, y) && A(x + 1, y) && A(x, y - 1) && A(x, y + 1) && D(x, y) < t) cv.set(x, y, c); }
/** Regla del equipo para personajes: alfa solo 0 o 255 (lo semitransparente se resuelve con dithering Bayer). */
function binarize(cv) {
  const d = cv.d;
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    const k = (y * cv.w + x) * 4, a = d[k + 3];
    if (a === 0 || a === 255) continue;
    if (a / 255 > D(x, y)) { const q = nearestPal(d[k], d[k + 1], d[k + 2]); d[k] = q[0]; d[k + 1] = q[1]; d[k + 2] = q[2]; d[k + 3] = 255; } else d[k + 3] = 0;
  }
  return cv;
}
/** Halo suave con dithering de alfa. */
function glow(cv, cx, cy, r, c, strength = 0.6) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy) / r; if (d >= 1) continue;
    const k = (1 - d) * (1 - d) * strength;
    if (k > D(x, y) * 0.5) cv.over(x, y, c, Math.min(0.85, k * 1.2));
  }
}
/** Pieza: capa → forma → sombreado → detalles → contorno. */
function part(W, H, ramp, draw, o = {}) {
  const L = new Cv(W, H);
  draw(L, C(ramp[2]));
  if (!o.noShade) shade(L, ramp, o);
  if (o.detail) o.detail(L);
  if (!o.noOutline) outline(L, C(ramp[0]), o.diag);
  return L;
}
function shearCopy(src, pivotY, k) {
  const n = new Cv(src.w, src.h);
  if (!k) { n.d.set(src.d); return n; }
  comp(n, src, 0, 0, { shear: { y: pivotY, k } });
  return n;
}
function sparkle(cv, x, y, s, c1 = 'warm4', c2 = 'warm2') {
  cv.set(x, y, c1);
  for (let k = 1; k <= s; k++) { const c = k < s ? c1 : c2; cv.set(x + k, y, c, 0.9); cv.set(x - k, y, c, 0.9); cv.set(x, y + k, c, 0.9); cv.set(x, y - k, c, 0.9); }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. RIG DE PERSONAJES (vista de lado, mirando a la derecha)
//    Ángulos de extremidad: 0 = hacia abajo, + = hacia adelante (derecha), π = hacia arriba.
// ════════════════════════════════════════════════════════════════════════════
function rig(spec, pose) {
  const W = spec.W, H = spec.H, F = new Cv(W, H);
  const p = { dx: 0, dy: 0, lean: 0, up: 0, legB: [0, 0], legF: [0, 0], armB: [0.2, 0.3], armF: [-0.12, 0.1], grounded: true, headDx: 0, headDy: 0, ...spec.defaults, ...pose };
  const T = spec.thigh, S = spec.shin;
  const legPts = (hx, hy, l) => {
    const kx = hx + Math.sin(l[0]) * T, ky = hy + Math.cos(l[0]) * T;
    const ax = kx + Math.sin(l[1]) * S, ay = ky + Math.cos(l[1]) * S;
    const f = clamp(-l[1] * 0.8 + (l[2] || 0), -0.7, 1.4);
    return { hx, hy, kx, ky, ax, ay, tx: ax + Math.cos(f) * spec.foot, ty: ay + Math.sin(f) * spec.foot };
  };
  let hipY = spec.hipY + p.dy;
  const cx = spec.cx + p.dx;
  if (p.grounded) {
    const low = (l) => { const q = legPts(0, 0, l); return Math.max(q.ay + spec.footR, q.ty + spec.footR, q.ky + spec.legR); };
    const stand = T + S + spec.footR;
    hipY += stand - Math.max(low(p.legB), low(p.legF));
  }
  hipY = Math.round(hipY);
  const top = hipY - spec.torsoH + p.up;
  const shOff = (y) => Math.round((hipY - y) * p.lean);
  const LB = legPts(cx + spec.hipB, hipY, p.legB), LF = legPts(cx + spec.hipF, hipY, p.legF);
  const armPts = (sx, l) => {
    const sy = top + spec.shY; sx = sx + shOff(sy);
    const ex = sx + Math.sin(l[0]) * spec.upper, ey = sy + Math.cos(l[0]) * spec.upper;
    return { sx, sy, ex, ey, hx: ex + Math.sin(l[1]) * spec.fore, hy: ey + Math.cos(l[1]) * spec.fore, ang: l[1] };
  };
  const AB = armPts(cx + spec.shB, p.armB), AF = armPts(cx + spec.shF, p.armF);
  const ctx = { cx, hipY, top, shOff, AB, AF, LB, LF, p, W, H, F };

  const drawLeg = (q, ramp, footRamp) => {
    comp(F, part(W, H, ramp, (L, m) => { capsule(L, q.hx, q.hy, q.kx, q.ky, spec.legR, m); capsule(L, q.kx, q.ky, q.ax, q.ay, spec.legR * 0.92, m); }));
    comp(F, part(W, H, footRamp, (L, m) => { capsule(L, q.ax, q.ay, q.tx, q.ty, spec.footR, m); if (spec.footDetail) spec.footDetail(L, q); }));
  };
  const drawArm = (a, ramp, handRamp, front) => {
    comp(F, part(W, H, ramp, (L, m) => { capsule(L, a.sx, a.sy, a.ex, a.ey, spec.armR, m); capsule(L, a.ex, a.ey, a.hx, a.hy, spec.armR * 0.9, m); }));
    if (spec.hand) spec.hand(ctx, a, handRamp, front);
    else comp(F, part(W, H, handRamp, (L, m) => ellipse(L, a.hx, a.hy, spec.handR, spec.handR, m)));
  };

  if (spec.pre) spec.pre(ctx);
  drawArm(AB, spec.ramps.armB, spec.ramps.handB, false);
  drawLeg(LB, spec.ramps.legB, spec.ramps.footB);
  drawLeg(LF, spec.ramps.leg, spec.ramps.foot);
  if (spec.behind) spec.behind(ctx);
  // torso (se dibuja derecho y luego se inclina con shear)
  const TL = new Cv(W, H);
  spec.torso(TL, ctx, C(spec.ramps.torso[2]));
  shade(TL, spec.ramps.torso, { dark: spec.torsoDark ?? 2 });
  if (spec.torsoDetail) spec.torsoDetail(TL, ctx);
  const TS = shearCopy(TL, hipY, p.lean);
  outline(TS, C(spec.ramps.torso[0]));
  comp(F, TS);
  // cabeza
  const hd = spec.head(ctx);
  comp(F, hd.cv, Math.round(cx + spec.neckX + shOff(top) + p.headDx - hd.ax), Math.round(top + spec.neckY + p.headDy - hd.ay));
  if (spec.mid) spec.mid(ctx);
  drawArm(AF, spec.ramps.arm, spec.ramps.hand, true);
  if (spec.after) spec.after(ctx);
  // apoyo exacto: la fila más baja con píxeles debe ser spec.feetRow (pivote del equipo)
  if (p.grounded && spec.feetRow) {
    let bot = -1;
    for (let y = H - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < W; x++) if (F.a(x, y)) { bot = y; break; }
    const dy = spec.feetRow - bot;
    if (bot >= 0 && dy) { const G = new Cv(W, H); comp(G, F, 0, dy); F.d.set(G.d); }
  }
  if (p.fx) p.fx(F, ctx);
  return F;
}

// ── 4.1 Protagonista (chibi ~28×54 en 64×64, pies en y = 60) ──────────────────
function protHead(o = {}) {
  const W = 28, H = 27, ax = 12, ay = 24;
  const face = part(W, H, R.skin, (L, m) => {
    ellipse(L, 13, 14, 7, 8, m);
    P(L, m, 19, 20); P(L, m, 21, 15); P(L, m, 21, 16); // mentón y nariz
    P(L, m, 11, 22, 4, 3); // cuello
  }, {
    detail: (L) => {
      const ex = 16, ey = 13;
      if (o.eyes === 'closed') { P(L, 'ea0', ex, ey + 2, 2, 1); }
      else if (o.eyes === 'hurt') { P(L, 'ink', ex, ey); P(L, 'ink', ex + 1, ey + 1); P(L, 'ink', ex, ey + 2); }
      else {
        P(L, 'ea0', ex, ey, 2, 1);
        P(L, 'fo4', ex, ey + 1); P(L, 'ink', ex + 1, ey + 1);
        P(L, o.eyes === 'glow' ? 'tq3' : 'fo3', ex, ey + 2); P(L, o.eyes === 'glow' ? 'tq2' : 'fo4', ex + 1, ey + 2);
        P(L, 'sh2', ex, ey + 1);
      }
      L.over(18, 17, C('rosa3'), 0.45); L.over(19, 17, C('rosa3'), 0.3);
      P(L, 'sk1', 19, 19); P(L, o.eyes === 'hurt' ? 'sk0' : 'sk1', 18, 19);
      P(L, 'sk1', 10, 15); P(L, 'sk0', 10, 16); P(L, 'sk1', 11, 16); // oreja
      P(L, 'sk1', 11, 22, 4, 1);
    },
  });
  const fringe = [10, 11, 8, 10, 8, 9, 7, 8, 6];
  const hair = part(W, H, R.hair, (L, m) => {
    ellipse(L, 12, 10, 9.5, 7.5, m);
    ellipse(L, 8, 15, 5, 6.5, m);
    [[6, 2], [9, 2], [10, 1], [14, 2], [15, 2], [19, 4], [3, 6], [2, 10], [2, 14]].forEach(([x, y]) => P(L, m, x, y));
    for (let x = 14; x < W; x++) for (let y = (fringe[x - 14] ?? 6) + 1; y < H; y++) L.clear(x, y);
    for (let x = 10; x < 14; x++) for (let y = 16; y < H; y++) L.clear(x, y);
    L.clear(10, 15); L.clear(11, 15); L.clear(10, 16);
  }, {
    light: 2,
    detail: (L) => { [[8, 5], [9, 6], [13, 4], [14, 5], [17, 6], [6, 9]].forEach(([x, y]) => { if (L.a(x, y)) P(L, 'ea3', x, y); }); [[5, 14], [6, 16], [4, 12]].forEach(([x, y]) => { if (L.a(x, y)) P(L, 'ea1', x, y); }); },
  });
  const cv = new Cv(W, H); comp(cv, face); comp(cv, hair);
  return { cv, ax, ay };
}
function scarfTail(F, x, y, s) {
  const L = new Cv(F.w, F.h), pts = [];
  for (let k = 0; k <= s.len; k++) pts.push([x - k * (1 - (s.droop ?? 0.5) * 0.35), y + k * (s.droop ?? 0.5) + Math.sin(k * 0.75 + (s.phase ?? 0)) * (s.amp ?? 0.8) * (k / s.len) - (s.lift ?? 0) * k * 0.4]);
  comp(F, part(F.w, F.h, R.scarf, (L2, m) => { for (let i = 0; i + 1 < pts.length; i++) capsule(L2, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i > s.len - 3 ? 0.9 : 1.3, m); }));
  void L;
}
const PROT = {
  W: 64, H: 80, feetRow: 78, cx: 32, hipY: 51, torsoH: 18, thigh: 12.3, shin: 12.3, legR: 2.1, foot: 4, footR: 1.7,
  hipB: -2, hipF: 1, shB: -2, shF: 1, shY: 3, upper: 8.4, fore: 7.6, armR: 1.7, handR: 1.6, neckX: 1, neckY: 0,
  ramps: { leg: R.pants, legB: R.pantsB, foot: R.boot, footB: R.bootB, arm: R.jacket, armB: R.jacketB, hand: R.skin, handB: R.skinB, torso: R.jacket },
  torso(L, c, m) {
    const { cx, top, hipY } = c;
    for (let y = top; y <= hipY + 2; y++) {
      const [a, b] = y === top ? [-3, 2] : y === top + 1 ? [-5, 4] : y >= hipY ? [-6, 5] : [-5, 5];
      for (let x = cx + a; x <= cx + b; x++) L.set(x, y, m);
    }
    ellipse(L, cx - 5, top + 2, 2.5, 2.5, m);
  },
  torsoDetail(L, c) {
    const { cx, top, hipY } = c;
    for (let y = top + 2; y < hipY; y++) { P(L, 'sh1', cx + 3, y); P(L, 'sh2', cx + 4, y); }
    P(L, 'fo4', cx + 2, top + 1); P(L, 'fo4', cx + 2, top + 2); P(L, 'fo4', cx + 2, top + 3);
    for (let x = cx - 5; x <= cx + 2; x++) P(L, 'fo2', x, hipY);
    P(L, 'fo2', cx - 2, hipY - 3, 3, 1);
    P(L, 'fo2', cx - 1, top + 3, 1, 4);
  },
  head: (c) => protHead({ eyes: c.p.eyes }),
  behind(c) { const s = c.p.scarf || {}; scarfTail(c.F, c.cx - 4 + c.shOff(c.top), c.top + 1, { len: 8, ...s }); },
  after(c) {
    const { F, cx, top, shOff, p } = c, o = shOff(top);
    // bufanda alrededor del cuello
    comp(F, part(64, 80, R.scarf, (L, m) => { P(L, m, cx - 3 + o, top - 1, 6, 2); P(L, m, cx - 4 + o, top, 1, 2); P(L, m, cx + o, top + 1, 2, 2); P(L, m, cx + o, top + 3, 1, 1); }));
    // gema en el pecho
    const gx = cx + 2 + shOff(top + 7), gy = top + 7, g = p.gem ?? 0.6;
    glow(F, gx + 0.5, gy + 0.5, 3 + g * 4, C('tq2'), 0.35 + g * 0.45);
    P(F, 'tq0', gx - 1, gy, 1, 2); P(F, 'tq0', gx + 2, gy, 1, 2); P(F, 'tq0', gx, gy - 1, 2, 1); P(F, 'tq0', gx, gy + 2, 2, 1);
    P(F, 'tq2', gx, gy, 2, 2); P(F, g > 0.8 ? 'warm4' : 'tq3', gx, gy); P(F, 'tq1', gx + 1, gy + 1);
  },
  hand(c, a, ramp, front) {
    comp(c.F, part(64, 80, ramp, (L, m) => ellipse(L, a.hx, a.hy, 1.6, 1.6, m)));
    if (front && c.p.gun) drawGun(c.F, a.hx, a.hy, a.ang);
  },
};
function drawGun(F, hx, hy, ang) {
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const L = part(F.w, F.h, R.metal, (L2, m) => {
    capsule(L2, hx - dx * 1, hy - dy * 1 - 1, hx + dx * 6, hy + dy * 6 - 1, 1.3, m);
    capsule(L2, hx, hy, hx - dy * 0.5 + 0.5, hy + 2.5, 0.9, m);
  }, { detail: (L2) => { L2.set(hx + dx * 2, hy + dy * 2 - 1, C('tq2')); L2.set(hx + dx * 3, hy + dy * 3 - 1, C('tq1')); } });
  comp(F, L);
  F.set(hx + dx * 7.5, hy + dy * 7.5 - 1, C('gl2'));
  return [hx + dx * 8.5, hy + dy * 8.5 - 1];
}
const gunTip = (a) => [a.hx + Math.sin(a.ang) * 8.5, a.hy + Math.cos(a.ang) * 8.5 - 1];

function protFrame(anim, i) {
  const PI = Math.PI;
  const walkLegs = (ph, amp, bend) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    const aF = amp * s, aB = -amp * s;
    return { legF: [aF, aF - bend * Math.max(0, c), 0], legB: [aB, aB - bend * Math.max(0, -c), 0] };
  };
  switch (anim) {
    case 'reposo': {
      const up = [0, 0, 1, 1][i];
      return rig(PROT, { up, armF: [-0.1 + up * 0.04, 0.12], armB: [0.12, 0.25], gem: [0.45, 0.7, 1, 0.7][i], scarf: { phase: i * 1.4, amp: 0.7 } });
    }
    case 'caminar': {
      const ph = (i / 6) * 2 * PI, s = Math.sin(ph);
      return rig(PROT, { ...walkLegs(ph, 0.5, 0.9), up: Math.abs(s) > 0.8 ? 1 : 0, lean: 0.06, armF: [-0.45 * s, -0.45 * s + 0.35], armB: [0.45 * s, 0.45 * s + 0.35], scarf: { phase: i * 1.1, amp: 1.1, droop: 0.4 } });
    }
    case 'correr': {
      const ph = (i / 6) * 2 * PI, s = Math.sin(ph);
      const L = walkLegs(ph, 0.85, 1.5);
      return rig(PROT, { ...L, dy: Math.abs(s) > 0.8 ? 0 : -1, grounded: Math.abs(s) > 0.5, lean: 0.24, armF: [-0.9 * s, -0.9 * s + 1.5], armB: [0.9 * s, 0.9 * s + 1.5], scarf: { phase: i * 1.3, amp: 1.4, droop: 0.12, len: 10 },
        fx: (F, c) => { if (Math.abs(s) > 0.8) { const q = s > 0 ? c.LF : c.LB; P(F, 'can4', q.ax - 6, 78, 2, 1); P(F, 'can3', q.ax - 9, 77); } } });
    }
    case 'saltar_subida':
      return rig(PROT, { grounded: false, dy: -3 + i, lean: 0.08, legF: [1.1, -0.4], legB: [-0.15, -0.7], armF: [1.9 - i * 0.2, 2.2], armB: [-0.7, -0.3], scarf: { droop: 1.3, amp: 0.6, phase: i } });
    case 'saltar_caida':
      return rig(PROT, { grounded: false, dy: -2, legF: [0.45, 0.1], legB: [-0.25, -0.45], armF: [2.0 + i * 0.15, 2.4], armB: [2.4, 2.9], scarf: { droop: -0.2, lift: 0.5, amp: 1.2, phase: i * 2 }, eyes: i ? 'open' : 'open' });
    case 'aterrizar':
      return rig(PROT, { legF: i ? [0.6, -0.25] : [1.0, -0.5], legB: i ? [0.25, -0.45] : [0.5, -0.9], lean: i ? 0.08 : 0.18, armF: [0.7, 0.9], armB: [-0.5, -0.2], up: i ? 1 : 2, scarf: { droop: 0.9, phase: 2 } });
    case 'esquivar': {
      const poses = [
        { legF: [0.9, -0.3], legB: [0.3, -0.9], lean: 0.3, armF: [0.6, 1.2], armB: [-0.8, -0.4], up: 2 },
        { legF: [0.9, 0.2], legB: [-0.8, -1.2], lean: 0.55, armF: [-0.9, -0.5], armB: [-1.2, -0.8], up: 2 },
        { legF: [0.8, 0.1], legB: [-0.7, -1.1], lean: 0.5, armF: [-0.7, -0.3], armB: [-1.0, -0.6], up: 2 },
        { legF: [0.6, -0.2], legB: [0.1, -0.7], lean: 0.25, armF: [0.3, 0.8], armB: [-0.4, -0.1], up: 1 },
      ];
      const fig = rig(PROT, { ...poses[i], scarf: { droop: 0.05, amp: 1.6, len: 11, phase: i * 2 } });
      const F = new Cv(64, 80), trail = [[0, 0], [0.55, 0.35], [0.5, 0.3], [0.3, 0.12]][i];
      if (trail[0]) comp(F, silhouette(fig, C('tq2')), -9, 0, { alpha: trail[0], dither: 0.7 });
      if (trail[1]) comp(F, silhouette(fig, C('tq1')), -17, 0, { alpha: trail[1], dither: 0.5 });
      if (i === 1 || i === 2) for (let k = 0; k < 5; k++) P(F, k % 2 ? 'tq3' : 'tq2', 6 + k * 3 + i, 44 + ((k * 7) % 18), 3, 1);
      comp(F, fig);
      return F;
    }
    case 'disparar': {
      const F = rig(PROT, { gun: true, dx: i === 2 ? -1 : 0, lean: i === 2 ? -0.06 : 0.04, legF: [0.35, 0.05], legB: [-0.3, -0.2], armF: [i === 2 ? 1.75 : 1.5, i === 2 ? 1.85 : 1.57], armB: [1.1, 1.55], eyes: 'open', gem: 0.8, scarf: { phase: i, amp: 1 },
        fx: (F2, c) => { if (i === 1) { const [tx, ty] = gunTip(c.AF); glow(F2, tx + 1, ty, 6, C('gl2'), 0.8); sparkle(F2, tx + 2, ty, 3, 'gl3', 'gl2'); P(F2, 'gl3', tx + 3, ty, 4, 1); } } });
      return F;
    }
    case 'conjuro': {
      const pulse = [0.3, 0.6, 1, 0.75][i];
      return rig(PROT, { legF: [0.25, 0.05], legB: [-0.25, -0.15], lean: -0.04, armF: [1.45, 2.55], armB: [1.15, 2.35], eyes: i === 2 ? 'glow' : 'open', gem: 1, up: i === 2 ? -1 : 0, scarf: { droop: 0.2, lift: pulse * 0.5, amp: 1.2, phase: i * 1.6 },
        fx: (F, c) => {
          const hx = (c.AF.hx + c.AB.hx) / 2, hy = Math.min(c.AF.hy, c.AB.hy) - 1;
          glow(F, hx, hy, 7 + pulse * 7, C('tq2'), 0.6 + pulse * 0.4); glow(F, hx, hy, 3 + pulse * 2, C('tq3'), 0.9);
          P(F, 'sk3', c.AF.hx, c.AF.hy - 3, 1, 2); P(F, 'sk3', c.AF.hx + 1, c.AF.hy - 2, 1, 2); // dedos en seña
          for (let k = 0; k < 6; k++) { const a = k * 1.047 + i * 0.6, r = 7 + pulse * 4; F.set(hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.8, C(k % 2 ? 'tq3' : 'warm3'), 0.9); }
          if (pulse > 0.9) sparkle(F, hx, hy - 2, 3, 'warm4', 'tq2');
        } });
    }
    case 'dano': {
      const F = rig(PROT, { dx: -2, lean: -0.22, legF: [0.5, 0.2], legB: [-0.15, -0.5], armF: [1.6, 2.4], armB: [2.0, 2.6], eyes: 'hurt', headDx: -1, scarf: { droop: 0.1, lift: 0.4, amp: 1.5 } });
      if (i === 0) flash(F, C('sh2'), 1);
      return F;
    }
    case 'morir': {
      const poses = [
        { dx: -2, lean: -0.2, legF: [0.4, 0.1], legB: [-0.2, -0.5], armF: [1.4, 2.2], armB: [1.9, 2.5], eyes: 'hurt' },
        { lean: 0.1, legF: [0.9, -0.4], legB: [0.5, -0.8], armF: [0.4, 0.6], armB: [0.2, 0.4], eyes: 'hurt', up: 1 },
        { lean: 0.15, legF: [1.45, 0.05], legB: [0.25, -1.45], armF: [0.6, 0.9], armB: [0.1, 0.2], eyes: 'closed', headDy: 1, up: 1 },
        { lean: 0.28, legF: [1.4, -0.2], legB: [1.3, -1.5], armF: [0.6, 0.4], armB: [0.3, 0.2], eyes: 'closed', headDy: 2, up: 1, gem: 0.3 },
        { lean: 0.38, legF: [1.5, -1.4], legB: [1.4, -1.5], armF: [0.4, 0.2], armB: [0.3, 0.1], eyes: 'closed', headDy: 3, up: 2, gem: 0.1 },
      ];
      return rig(PROT, { ...poses[i], scarf: { droop: 1.2, amp: 0.3 } });
    }
    case 'interactuar': {
      return rig(PROT, { lean: 0.12 + i * 0.03, legF: [0.35, 0.1], legB: [-0.2, -0.3], armF: [0.9 + i * 0.2, 1.2 + i * 0.25], armB: [0.2, 0.4], gem: 0.6 + i * 0.2, scarf: { phase: i },
        fx: (F, c) => { if (i === 2) sparkle(F, c.AF.hx + 3, c.AF.hy - 1, 2, 'warm4', 'warm2'); else if (i === 1) F.set(c.AF.hx + 3, c.AF.hy - 1, C('warm3'), 0.8); } });
    }
  }
  throw new Error('anim desconocida ' + anim);
}

// ── 4.2 Chaneque (48×48, pies en y = 45) ─────────────────────────────────────
function chanHead(o = {}) {
  const s = 1.3, Q = (v) => Math.round(v * s);
  const W = Q(30), H = Q(28), ax = Q(13), ay = Q(25);
  const eyes = o.eyes ?? 'corrupt';
  const head = part(W, H, R.chSkin, (L, m) => {
    ellipse(L, Q(13), Q(16), 6.5 * s, 6 * s, m);
    capsule(L, Q(18), Q(16), 22.5 * s, 18 * s, 1.2 * s, m);
    poly(L, [[8 * s, 14 * s], [0, 9 * s], [2 * s, 13 * s], [7 * s, 19 * s]], m);
    P(L, m, Q(11), Q(21), Q(4), Q(4));
  }, {
    detail: (L) => {
      P(L, 'fo3', Q(2), Q(11)); P(L, 'fo3', Q(4), Q(13)); P(L, 'fo3', Q(3), Q(12)); // oreja interior
      const ex = Q(16), ey = Q(13), my = Q(19);
      const eyeC = { corrupt: ['pu3', 'pu2'], dim: ['pu1', 'pu1'], calm: ['warm3', 'fo5'], closed: null }[eyes];
      P(L, 'fo3', ex - 1, ey - 1, 3, 1); // ceja
      if (eyeC) { P(L, eyeC[0], ex, ey, 2, 1); P(L, eyeC[1], ex, ey + 1, 2, 1); P(L, eyes === 'calm' ? 'warm4' : 'sh2', ex, ey); }
      else P(L, 'ea1', ex, ey + 1, 2, 1);
      if (eyes === 'calm') { P(L, 'ea1', ex, my, 4, 1); P(L, 'ea1', ex - 1, my - 1); }
      else { P(L, 'ink', ex - 1, my, 6, 1); P(L, 'sh2', ex, my); P(L, 'sh2', ex + 2, my); P(L, 'ea1', ex - 2, my - 1); }
      P(L, 'fo3', Q(11), Q(21), Q(4), 1);
    },
  });
  const cv = new Cv(W, H);
  comp(cv, head);
  if (eyes === 'corrupt') { glow(cv, Q(16) + 1, Q(13), 7, C('pu2'), 0.5); P(cv, 'pu3', Q(16), Q(13), 2, 1); P(cv, 'pu2', Q(16), Q(13) + 1, 2, 1); P(cv, 'sh2', Q(16), Q(13)); }
  const hat = part(W, H, R.leaf, (L, m) => {
    ellipse(L, Q(14), Q(8), 12.5 * s, 2.6 * s, m); ellipse(L, Q(12), Q(6), 5 * s, 3.4 * s, m); ellipse(L, Q(25), Q(10), 2.5 * s, 1.4 * s, m);
  }, { detail: (L) => { for (let x = 3; x < Q(26); x++) if (L.a(x, Q(8))) P(L, 'fo3', x, Q(8)); for (let k = 0; k < 5; k++) { P(L, 'fo3', Q(5 + k * 4.5), Q(8) + 1 + (k % 2)); P(L, 'fo3', Q(6 + k * 4.5), Q(8) - 1 - (k % 2)); } P(L, 'fo4', Q(9), Q(4)); P(L, 'fo4', Q(10), Q(3)); P(L, 'ea2', Q(12), Q(2)); P(L, 'ea2', Q(13), Q(1)); P(L, 'ea3', Q(14), Q(1)); } });
  comp(cv, hat, o.hatDx ?? 0, o.hatDy ?? 0);
  return { cv, ax, ay };
}
const CHAN = {
  W: 64, H: 64, feetRow: 62, cx: 31, hipY: 51, torsoH: 9, thigh: 4.4, shin: 4.4, legR: 1.6, foot: 3.4, footR: 1.55,
  hipB: -1, hipF: 2, shB: -3, shF: 3, shY: 3, upper: 6, fore: 5.7, armR: 1.5, handR: 1.7, neckX: 0, neckY: -1,
  ramps: { leg: R.chSkin, legB: R.chSkinB, foot: R.chSkin, footB: R.chSkinB, arm: R.chSkin, armB: R.chSkinB, hand: R.chSkin, handB: R.chSkinB, torso: R.chSkin },
  defaults: { lean: 0.12, armF: [0.1, 0.3], armB: [-0.1, 0.2] },
  torso(L, c, m) { ellipse(L, c.cx, c.top + 4.5, 5.8, 5.4, m); },
  torsoDetail(L, c) {
    const { cx, hipY } = c;
    for (let x = cx - 6; x <= cx + 6; x++) { const h = 3 + ((x * 7) % 3); for (let y = hipY - 3; y < hipY - 3 + h; y++) P(L, (x + y) % 3 ? 'ea3' : 'ea4', x, y); }
    P(L, 'fo5', cx + 1, c.top + 2); P(L, 'fo5', cx + 2, c.top + 3);
  },
  head: (c) => chanHead({ eyes: c.p.eyes, hatDy: c.p.hatDy, hatDx: c.p.hatDx }),
  hand(c, a, ramp) { comp(c.F, part(64, 64, ramp, (L, m) => ellipse(L, a.hx, a.hy, 1.7, 1.7, m), { detail: (L) => { L.set(a.hx + 1, a.hy + 2, C('sh2')); L.set(a.hx - 1, a.hy + 2, C('sh2')); } })); },
};
function chanFrame(anim, i) {
  const PI = Math.PI;
  const ghostUp = (F, cx, cy, n, t, c = 'pu2') => { for (let k = 0; k < n; k++) { const x = cx + Math.sin(k * 2.3 + t) * 9, y = cy - ((k * 5 + t * 6) % 22); F.over(x, y, C(k % 2 ? c : 'pu3'), 0.8); F.over(x, y - 1, C(c), 0.45); } };
  const sitting = { legF: [1.45, 1.35, -0.3], legB: [1.3, 1.2, -0.3], lean: -0.05, armF: [0.15, 0.1], armB: [-0.1, 0.0], up: 1 };
  switch (anim) {
    case 'reposo': return rig(CHAN, { up: [0, 1, 1, 0][i], hatDy: [0, 0, -1, 0][i], armF: [0.1 + (i % 2) * 0.1, 0.4], legF: [0.15, 0.1], legB: [-0.15, -0.1], eyes: i === 3 ? 'dim' : 'corrupt' });
    case 'caminar': {
      const ph = (i / 6) * 2 * PI, s = Math.sin(ph), c = Math.cos(ph);
      return rig(CHAN, { lean: 0.2, up: Math.abs(s) > 0.8 ? 1 : 0, legF: [0.7 * s, 0.7 * s - 1.1 * Math.max(0, c)], legB: [-0.7 * s, -0.7 * s - 1.1 * Math.max(0, -c)], armF: [-0.6 * s, -0.6 * s + 0.5], armB: [0.6 * s, 0.6 * s + 0.5], hatDy: Math.abs(s) > 0.8 ? 1 : 0 });
    }
    case 'ataque': {
      const poses = [
        { lean: -0.12, legF: [0.7, -0.5], legB: [0.4, -0.7], armF: [-1.6, -2.2], armB: [-0.8, -1.2], up: 1 },
        { dx: 4, lean: 0.4, legF: [0.8, 0.3], legB: [-0.8, -1.1], armF: [1.6, 1.5], armB: [-0.6, -0.3], hatDx: -1 },
        { dx: 4, lean: 0.35, legF: [0.7, 0.2], legB: [-0.7, -1.0], armF: [2.4, 2.6], armB: [-0.4, -0.2], hatDx: -1 },
        { dx: 2, lean: 0.15, legF: [0.4, 0.1], legB: [-0.3, -0.4], armF: [0.6, 0.8], armB: [0.0, 0.2] },
      ];
      return rig(CHAN, { ...poses[i], fx: (F, c) => {
        if (i === 1 || i === 2) { const r = 13, cx0 = c.AF.sx + 1, cy0 = c.AF.sy; const a0 = i === 1 ? -1.4 : -2.2, a1 = i === 1 ? 0.9 : 0.2;
          for (let a = a0; a <= a1; a += 0.08) { const k = (a - a0) / (a1 - a0); F.over(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r, C(k > 0.7 ? 'pu3' : 'pu2'), i === 1 ? 0.9 * k : 0.5 * k); F.over(cx0 + Math.cos(a) * (r - 1), cy0 + Math.sin(a) * (r - 1), C('pu1'), 0.5 * k); } }
      } });
    }
    case 'salto': {
      const poses = [
        { legF: [1.0, -0.6], legB: [0.8, -0.9], lean: 0.25, armF: [-0.6, -0.3], armB: [-0.8, -0.5], up: 2, hatDy: 1 },
        { grounded: false, dy: -7, legF: [1.3, 0.1], legB: [0.9, -0.4], lean: 0.1, armF: [2.6, 2.9], armB: [2.2, 2.6], hatDy: -2 },
        { grounded: false, dy: -3, legF: [0.4, 0.2], legB: [-0.3, -0.2], lean: 0.05, armF: [1.8, 2.0], armB: [1.6, 1.9], hatDy: -1 },
      ];
      return rig(CHAN, poses[i]);
    }
    case 'dano': { const F = rig(CHAN, { dx: -2, lean: -0.3, legF: [0.5, 0.3], legB: [-0.2, -0.5], armF: [1.8, 2.4], armB: [2.2, 2.6], eyes: 'closed', hatDx: -2, hatDy: -1 }); if (!i) flash(F, C('sh2'), 1); return F; }
    case 'agotado':
      return rig(CHAN, { ...sitting, headDx: [-1, 0, 1, 0][i], headDy: 1, eyes: 'dim', hatDy: 1, fx: (F, c) => {
        const hx = c.cx + 3 + [-1, 0, 1, 0][i], hy = c.top - 30;
        for (let k = 0; k < 3; k++) { const a = i * 1.57 + k * 2.09; F.set(hx + Math.cos(a) * 8, hy + Math.sin(a) * 3, C(k === 0 ? 'warm3' : 'pu3')); F.over(hx + Math.cos(a - 0.4) * 8, hy + Math.sin(a - 0.4) * 3, C('pu2'), 0.5); }
      } });
    case 'purificar': {
      let F;
      if (i < 3) F = rig(CHAN, { ...sitting, eyes: i < 2 ? 'corrupt' : 'calm', headDy: 1 - i, fx: (G, c) => ghostUp(G, c.cx, c.top - 8 - i * 5, 5 + i * 2, i) });
      else F = rig(CHAN, { lean: 0.02, legF: [0.1, 0.05], legB: [-0.1, -0.05], armF: [0.5, 1.4], armB: [-0.2, 0.3], eyes: 'calm', up: i === 3 ? 0 : -1 });
      if (i === 1) flash(F, C('sh2'), 0.25);
      if (i === 2) flash(F, C('warm3'), 0.45);
      if (i === 3) { const G = new Cv(64, 64); glow(G, 31, 40, 20, C('warm3'), 0.5); comp(G, F); F = G; sparkle(F, 14, 24, 2); sparkle(F, 48, 30, 2, 'tq3', 'tq2'); }
      if (i >= 4) { const S = silhouette(F, C(i === 4 ? 'warm3' : 'warm4')); ditherFade(F, i === 4 ? 0.45 : 0.1); comp(F, S, 0, 0, { dither: i === 4 ? 0.55 : 0.25 }); for (let k = 0; k < 8; k++) { const x = 18 + ((k * 13) % 28), y = 18 + ((k * 7) % 34) - (i - 4) * 5; F.set(x, y, C(k % 2 ? 'warm4' : 'tq3')); } }
      return F;
    }
  }
  throw new Error('anim chaneque ' + anim);
}

// ── 4.3 Chaneque Mayor (128×128, pies en y = 122) ────────────────────────────
function mayorHead(o) {
  const W = 66, H = 60, ax = 26, ay = 52, corr = o.corr ?? 1, eyes = o.eyes ?? 'corrupt';
  srand(777);
  const cv = new Cv(W, H);
  const head = part(W, H, R.bark, (L, m) => {
    ellipse(L, 28, 36, 14, 12, m);
    capsule(L, 36, 41, 47, 44, 5.5, m);
    capsule(L, 30, 30, 45, 33, 3.6, m);
    P(L, m, 20, 44, 14, 9);
  }, {
    dark: 2,
    detail: (L) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!L.a(x, y)) continue;
        if (fbm(x * 0.4, y * 0.09, 2) > 0.62) P(L, 'ea1', x, y);
        const moss = fbm(x * 0.18 + 5, y * 0.18, 3) + (34 - y) * 0.04;
        if (moss > 0.75) P(L, dp(['fo2', 'fo3', 'fo4'], (moss - 0.75) * 2.5, x, y), x, y);
        if (o.flowers && moss > 0.85 && hash(x, y) > 0.93) P(L, hash(y, x) > 0.5 ? 'rosa3' : 'warm3', x, y);
      }
      P(L, 'ink', 39, 47, 12, 1); for (const x of [41, 45, 49]) { P(L, 'can5', x, 46); P(L, 'can4', x, 45); }
      P(L, 'ink', 51, 41); P(L, 'ea0', 33, 34, 13, 1);
      const ec = { corrupt: ['pu3', 'pu2'], dim: ['pu1', 'pu0'], calm: ['warm3', 'warm2'] }[eyes];
      P(L, ec[0], 40, 36, 2, 1); P(L, ec[1], 40, 37, 2, 1); P(L, ec[0], 46, 36, 2, 1); P(L, ec[1], 46, 37, 1, 1); P(L, 'sh2', 40, 36);
    },
  });
  if (eyes === 'corrupt') { glow(cv, 42, 37, 9, C('pu2'), 0.5 * corr + 0.2); }
  // cuernos de rama
  const horns = new Cv(W, H);
  const leaf = (x, y) => { P(horns, hash(x | 0, y | 0) > 0.5 ? 'fo3' : 'fo4', x - 1, y - 1, 2, 2); if (o.flowers && hash(y | 0, x | 0) > 0.7) P(horns, 'rosa3', x, y - 1); };
  tree(horns, 22, 27, 9, -2.2, 4, C('ea1'), C('ea3'), leaf);
  tree(horns, 31, 25, 10, -1.75, 4, C('ea1'), C('ea3'), leaf);
  outline(horns, C('ea0'));
  comp(cv, horns); comp(cv, head);
  return { cv, ax, ay };
}
function veins(F, c, corr) {
  if (corr <= 0.02) return;
  srand(4242);
  const G = new Cv(F.w, F.h);
  for (let v = 0; v < 6; v++) {
    let x = c.cx + (rnd() - 0.5) * 14, y = c.hipY - 14 + (rnd() - 0.5) * 10, a = rnd() * 6.28;
    const n = 10 + rnd() * 14;
    for (let k = 0; k < n; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 1.4; y += Math.sin(a) * 1.4; if (k / n < corr) { G.set(x + c.shOff(y), y, C(k % 3 ? 'pu2' : 'pu3')); } }
  }
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (G.a(x, y) && F.a(x, y) > 200) F.set(x, y, G.get(x, y));
}
const MAYOR = {
  W: 128, H: 128, feetRow: 126, cx: 60, hipY: 98, torsoH: 34, thigh: 12.5, shin: 11.5, legR: 5.5, foot: 8, footR: 3.2,
  hipB: -9, hipF: 6, shB: -12, shF: 8, shY: 6, upper: 17, fore: 16, armR: 5, handR: 5.5, neckX: 14, neckY: 4,
  ramps: { leg: R.bark, legB: R.barkB, foot: R.bark, footB: R.barkB, arm: R.bark, armB: R.barkB, hand: R.bark, handB: R.barkB, torso: R.bark },
  defaults: { lean: 0.28 },
  torso(L, c, m) { const { cx, top, hipY } = c; ellipse(L, cx, top + 18, 21, 18, m); ellipse(L, cx - 2, top + 5, 22, 10, m); ellipse(L, cx + 4, hipY - 6, 16, 9, m); },
  torsoDetail(L, c) {
    const fl = c.p.flowers;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (!L.a(x, y)) continue;
      if (fbm(x * 0.45, y * 0.07, 2) > 0.63) P(L, 'ea1', x, y);
      else if (fbm(x * 0.5 + 9, y * 0.1, 2) > 0.7) P(L, 'ea3', x, y);
      const moss = fbm(x * 0.12, y * 0.15 + 3, 3) + (c.top + 10 - y) * 0.03;
      if (moss > 0.6) P(L, dp(['fo1', 'fo2', 'fo3', 'fo4'], (moss - 0.6) * 2.5, x, y), x, y);
      if (fl && moss > 0.72 && hash(x * 3, y) > 0.92) P(L, hash(x, y * 5) > 0.5 ? 'rosa3' : 'warm3', x, y);
    }
  },
  head: (c) => mayorHead({ corr: c.p.corr, eyes: c.p.eyes, flowers: c.p.flowers }),
  mid(c) { veins(c.F, c, c.p.corr ?? 1); },
  hand(c, a, ramp) {
    const dx = Math.sin(a.ang), dy = Math.cos(a.ang);
    comp(c.F, part(128, 128, ramp, (L, m) => {
      ellipse(L, a.hx, a.hy, 5.5, 5, m);
      for (let k = -1; k <= 1; k++) capsule(L, a.hx, a.hy, a.hx + dx * 8 + dy * k * 3.5, a.hy + dy * 8 - dx * k * 3.5, 1.6, m);
    }, { dark: 2 }));
    if (c.p.rock && a === c.AF) drawRock(c.F, a.hx + dx * 6, a.hy + dy * 6 - 4, 6);
  },
  footDetail(L, q) { for (let k = 0; k < 3; k++) line(L, q.tx, q.ty + 1, q.tx + 3 + k * 3, q.ty + 2 + (k === 1 ? 0 : 1), C('ea2'), 1); line(L, q.ax - 4, q.ay + 2, q.ax - 8, q.ay + 3, C('ea2')); },
};
function drawRock(F, x, y, r) {
  comp(F, part(F.w, F.h, R.stone, (L, m) => { ellipse(L, x, y, r, r * 0.85, m); P(L, m, x - r, y, 2, 2); }, { dark: 2, detail: (L) => { L.set(x - 1, y + 1, C('can2')); L.set(x + 1, y - 1, C('can2')); } }));
}
function mayorFrame(anim, i) {
  const PI = Math.PI;
  const debris = (F, x, y, n, spread) => { for (let k = 0; k < n; k++) { const a = -PI * (0.1 + 0.8 * hash(k, i + 3)), r = spread * (0.4 + hash(k + 9, i) * 0.6); const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.6; P(F, k % 3 ? 'ea3' : 'can4', px, py, 2, 2); P(F, 'ea1', px, py + 2, 2, 1); } };
  const stars = (F, x, y, t) => { for (let k = 0; k < 4; k++) { const a = t + k * 1.57; sparkle(F, x + Math.cos(a) * 14, y + Math.sin(a) * 4, 2, 'warm4', 'warm2'); } };
  switch (anim) {
    case 'reposo': return rig(MAYOR, { up: [0, 1, 2, 1][i], armF: [0.15, 0.05], armB: [0.0, -0.05], legF: [0.18, 0.0], legB: [-0.15, -0.05], corr: 0.85 + 0.15 * Math.sin(i * 1.57) });
    case 'caminar': {
      const ph = (i / 6) * 2 * PI, s = Math.sin(ph), c = Math.cos(ph);
      return rig(MAYOR, { lean: 0.33, up: Math.abs(s) > 0.8 ? 2 : 0, legF: [0.42 * s, 0.42 * s - 0.7 * Math.max(0, c)], legB: [-0.42 * s, -0.42 * s - 0.7 * Math.max(0, -c)], armF: [-0.3 * s + 0.15, -0.3 * s + 0.2], armB: [0.3 * s, 0.3 * s + 0.1] });
    }
    case 'salto': {
      const poses = [
        { legF: [1.0, -0.5], legB: [0.8, -0.8], lean: 0.45, armF: [-0.5, -0.3], armB: [-0.7, -0.5], up: 3 },
        { grounded: false, dy: -10, legF: [0.9, 0.2], legB: [0.4, -0.4], lean: 0.2, armF: [2.4, 2.7], armB: [2.2, 2.5] },
        { grounded: false, dy: -14, legF: [0.6, 0.0], legB: [0.2, -0.5], lean: 0.1, armF: [2.9, 3.1], armB: [2.8, 3.0] },
        { legF: [1.05, -0.4], legB: [0.9, -0.8], lean: 0.5, armF: [0.7, 0.4], armB: [0.5, 0.3], up: 4, fx: (F) => { debris(F, 96, 124, 10, 20); debris(F, 26, 124, 6, 14); } },
      ];
      return rig(MAYOR, poses[i]);
    }
    case 'golpe': {
      const poses = [
        { lean: 0.05, armF: [2.8, 3.0], armB: [2.6, 2.9], legF: [0.3, 0.0], legB: [-0.3, -0.1], up: -1 },
        { lean: -0.05, armF: [3.0, 3.3], armB: [2.9, 3.2], legF: [0.35, 0.0], legB: [-0.35, -0.1], up: -2, fx: (F, c) => { glow(F, c.AF.hx, c.AF.hy, 10, C('pu2'), 0.6); } },
        { lean: 0.5, armF: [1.0, 0.55], armB: [0.8, 0.5], legF: [0.8, -0.3], legB: [0.3, -0.7], up: 2 },
        { lean: 0.55, armF: [1.05, 0.55], armB: [0.85, 0.5], legF: [0.85, -0.3], legB: [0.3, -0.75], up: 3, fx: (F, c) => { const gx = c.AF.hx + 4; for (let a = 0; a < PI; a += 0.05) { F.over(gx + Math.cos(a) * 20, 126 - Math.sin(a) * 5, C('pu3'), 0.7); F.over(gx + Math.cos(a) * 26, 126 - Math.sin(a) * 7, C('pu2'), 0.45); } debris(F, gx, 122, 12, 18); } },
        { lean: 0.35, armF: [0.6, 0.4], armB: [0.4, 0.3], legF: [0.4, -0.1], legB: [0.0, -0.3], up: 1 },
      ];
      return rig(MAYOR, poses[i]);
    }
    case 'invocar': {
      const k = (i + 1) / 4;
      return rig(MAYOR, { lean: -0.05, armF: [2.3, 2.6], armB: [2.1, 2.4], legF: [0.35, 0.05], legB: [-0.35, -0.1], up: -1, corr: 1, fx: (F, c) => {
        glow(F, c.AF.hx, c.AF.hy, 8 + k * 8, C('pu2'), 0.7); glow(F, c.AB.hx, c.AB.hy, 6 + k * 6, C('pu2'), 0.5);
        for (let a = 0; a < 2 * PI; a += 0.04) { const r = 18 + k * 22; if (D(Math.round(a * 30), i) < 0.6) F.over(c.cx + Math.cos(a) * r, 124 + Math.sin(a) * r * 0.18, C('pu3'), 0.75); }
        for (let n = 0; n < 6; n++) { const a = n * 1.05 + i * 0.5; sparkle(F, c.cx + 10 + Math.cos(a) * (14 + k * 10), 50 + Math.sin(a) * 10, 1 + (n % 2), 'pu3', 'pu2'); }
      } });
    }
    case 'lanzar': {
      const poses = [
        { lean: 0.55, armF: [0.55, 0.3], armB: [0.3, 0.2], legF: [0.7, -0.2], legB: [0.2, -0.6], up: 2, rock: true },
        { lean: 0.05, armF: [-2.4, -2.9], armB: [0.8, 1.2], legF: [0.5, 0.1], legB: [-0.4, -0.3], up: -1, rock: true },
        { lean: 0.4, armF: [1.9, 1.6], armB: [-0.6, -0.4], legF: [0.75, 0.1], legB: [-0.55, -0.6], fx: (F, c) => { const x = c.AF.hx + 14, y = c.AF.hy - 4; for (let k = 1; k < 12; k++) F.over(x - k * 2, y, C('can4'), 0.5 - k * 0.04); drawRock(F, x, y, 6); } },
        { lean: 0.45, armF: [1.2, 0.9], armB: [-0.3, -0.2], legF: [0.6, 0.1], legB: [-0.45, -0.5] },
      ];
      return rig(MAYOR, poses[i]);
    }
    case 'aturdido':
      return rig(MAYOR, { lean: 0.5, legF: [0.9, -0.5], legB: [0.7, -0.8], armF: [0.25, 0.1], armB: [0.1, 0.0], headDy: 5, headDx: [-1, 0, 1, 0][i], up: 3, eyes: 'dim', corr: 0.5, fx: (F, c) => stars(F, c.cx + 26 + [-1, 0, 1, 0][i], c.top - 16, i * 1.2) });
    case 'dano': { const F = rig(MAYOR, { dx: -3, lean: 0.05, armF: [1.2, 1.8], armB: [1.4, 2.0], legF: [0.4, 0.1], legB: [-0.3, -0.4], headDx: -2 }); if (!i) flash(F, C('sh2'), 1); return F; }
    case 'purificar': {
      const corr = Math.max(0, 1 - i / 5), calm = i >= 4;
      const pose = calm
        ? { lean: 0.18 - (i - 4) * 0.02, armF: [0.2, 0.3], armB: [0.0, 0.1], legF: [0.15, 0.0], legB: [-0.15, -0.05], eyes: 'calm', corr: 0, flowers: i >= 5, up: -(i - 4) % 2 }
        : { lean: 0.5, legF: [0.9, -0.5], legB: [0.7, -0.8], armF: [0.25, 0.1], armB: [0.1, 0.0], headDy: 4 - i, up: 3 - i, eyes: i < 2 ? 'corrupt' : 'dim', corr };
      let F = rig(MAYOR, { ...pose, fx: (G, c) => {
        if (!calm) for (let k = 0; k < 10 + i * 4; k++) { const x = c.cx - 20 + hash(k, i) * 60, y = 100 - ((k * 9 + i * 14) % 80); G.over(x, y, C(k % 2 ? 'pu3' : 'pu2'), 0.8); G.over(x, y + 1, C('pu1'), 0.5); }
      } });
      if (i === 3) flash(F, C('warm3'), 0.4);
      if (calm) { const G = new Cv(128, 128); glow(G, 64, 70, 46 + (i - 4) * 4, C('warm3'), 0.25 + (i === 7 ? 0.2 : 0)); comp(G, F); F = G; for (let k = 0; k < 6 + i; k++) sparkle(F, 20 + hash(k, i * 7) * 90, 20 + hash(i, k * 3) * 80, 1 + (k % 2), k % 3 ? 'warm4' : 'tq3', 'warm2'); }
      return F;
    }
  }
  throw new Error('anim mayor ' + anim);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. FONDOS (6 capas por sección, alto 360; horizonte del suelo y ≈ 205)
// ════════════════════════════════════════════════════════════════════════════
function background(sec, L, w) {
  const cv = new Cv(w, 360);
  srand(strSeed(sec + L));
  [skyLayer, mountainLayer, cityLayer, nearLayer, groundLayer, foreLayer][L](cv, sec);
  return cv;
}
function skyLayer(cv, sec) {
  const W = cv.w, boss = sec === 'jefe';
  const ramp = boss ? ['night1', 'night1', 'pu0', 'night2', 'pu0', 'pu1', 'night5', 'fog1'] : ['night1', 'night2', 'night2', 'night3', 'night4', 'night5', 'fog1', 'fog2'];
  const moon = boss ? null : { x: Math.round(W * 0.68), y: 62, r: 15 };
  for (let y = 0; y < 360; y++) for (let x = 0; x < W; x++) {
    let c = dp(ramp, Math.pow(Math.min(1, y / 235), 1.25), x, y);
    if (y < 200) {
      const n = fbm(x * 0.006, y * 0.022, 5), band = 1 - Math.abs(y - 95 + Math.sin(x * 0.004) * 25) / 60, v = n * 0.95 + band * 0.3 - 0.62;
      if (v > D(x, y) * 0.22) {
        c = dp(boss ? ['night2', 'pu0', 'pu1', 'rosa0'] : ['night3', 'night4', 'night5', 'fog1'], v * 2.4, x, y);
        const above = fbm(x * 0.006, (y - 3) * 0.022, 5) * 0.95 + band * 0.3 - 0.62;
        if (above < v - 0.03 && D(x, y) < 0.6) c = boss ? 'pu2' : (moon && Math.abs(x - moon.x) < 220 ? 'snow1' : 'fog2');
      }
    }
    cv.set(x, y, c);
  }
  // estrellas
  for (let i = 0; i < W * 0.35; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(Math.pow(rnd(), 1.5) * 150), b = rnd();
    if (fbm(x * 0.006, y * 0.022, 5) > 0.55) continue;
    cv.set(x, y, b > 0.9 ? 'warm4' : b > 0.6 ? 'snow2' : b > 0.3 ? 'snow1' : 'fog2');
    if (b > 0.985) { ['snow1'].forEach((c) => { cv.set(x - 1, y, c); cv.set(x + 1, y, c); cv.set(x, y - 1, c); cv.set(x, y + 1, c); }); }
  }
  if (moon) {
    const { x: mx, y: my, r } = moon;
    for (let y = my - r - 40; y <= my + r + 40; y++) for (let x = mx - r - 40; x <= mx + r + 40; x++) {
      const d = Math.hypot(x - mx, y - my);
      if (d < r) { let c = dp(['snow1', 'snow2', 'warm4'], 1 - (d / r) * 0.6 - (x - mx + y - my) / (r * 4) - 0.15, x, y); if (fbm(x * 0.2, y * 0.2, 3) > 0.62) c = 'snow1'; if (fbm(x * 0.12 + 7, y * 0.12, 2) > 0.66) c = 'fog3'; cv.set(x, y, c); }
      else if (d < r + 40) { const k = 1 - (d - r) / 40; if (k * k * 0.8 > D(x, y)) cv.set(x, y, k > 0.6 ? 'fog3' : k > 0.35 ? 'fog2' : 'fog1'); }
    }
  }
  if (boss) { const gx = Math.round(W * 0.5); for (let y = 60; y < 360; y++) for (let x = gx - 260; x < gx + 260; x++) { const e = ((x - gx) / 260) ** 2 + ((y - 190) / 140) ** 2; if (e < 1) { const k = 1 - e; if (k * k * 0.7 > D(x, y)) cv.set(x, y, k > 0.6 ? 'pu2' : k > 0.3 ? 'pu1' : 'pu0'); } } }
}
function mountainLayer(cv, sec) {
  const W = cv.w, boss = sec === 'jefe', px = Math.round(W * 0.42);
  const ridge = (x) => 150 + (fbm(x * 0.005, 3, 4) - 0.5) * 70 + (fbm(x * 0.03, 8, 2) - 0.5) * 10;
  const peak = (x) => 52 + Math.abs(x - px) * 0.6 + (fbm(x * 0.05, 5, 3) - 0.5) * 10 + Math.max(0, Math.abs(x - px) - 60) * 0.25;
  const top = (x) => Math.round(Math.min(ridge(x), peak(x)));
  const body = boss ? ['night2', 'pu0', 'night3', 'night4'] : ['mtn2', 'mtn3', 'night4', 'night5', 'fog1'];
  for (let x = 0; x < W; x++) {
    const t0 = top(x), sl = top(x + 2) - top(x - 2), isPeak = peak(x) < ridge(x);
    for (let y = Math.max(0, t0); y < 240; y++) {
      const dd = y - t0, haze = (y - t0) / (240 - t0);
      let c = dp(body, haze * 0.9 + (fbm(x * 0.03, y * 0.03, 3) - 0.5) * 0.35, x, y);
      if (dd < 2) c = boss ? (sl < 0 ? 'pu2' : 'pu1') : (sl < 0 ? 'snow1' : 'mtn3');
      if (isPeak && !boss) {
        const snowLine = 104 + (fbm(x * 0.08, 2, 3) - 0.5) * 30;
        if (y < snowLine && fbm(x * 0.09, y * 0.15, 3) > 0.3 + (y - t0) * 0.004) c = x < px + (y - t0) * 0.1 ? (D(x, y) > 0.85 ? 'snow1' : 'snow2') : (D(x, y) > 0.6 ? 'mtn3' : 'snow1');
        else if (y < snowLine + 14 && fbm(x * 0.2, y * 0.3, 2) > 0.62) c = 'snow1';
      }
      cv.set(x, y, c);
    }
  }
  // cerros cercanos
  for (let x = 0; x < W; x++) { const t = Math.round(186 + (fbm(x * 0.012, 21, 3) - 0.5) * 30); for (let y = t; y < 240; y++) cv.set(x, y, y === t ? (boss ? 'pu1' : 'fog1') : dp(boss ? ['pu0', 'night2'] : ['night4', 'night3'], (y - t) / 30, x, y)); }
  // banda de nubes que cruza el pico
  for (let y = 100; y < 190; y++) for (let x = 0; x < W; x++) {
    const v = fbm(x * 0.008, y * 0.05, 4) + (1 - Math.abs(y - 140) / 45) * 0.5 - 0.72;
    if (v > D(x, y) * 0.3) cv.set(x, y, dp(boss ? ['pu0', 'night4', 'pu1'] : ['fog1', 'fog2', 'fog3', 'fog4'], v * 2.2 + (y < 130 ? 0.2 : 0), x, y));
  }
}
function houseSil(cv, x, base, w, h, wall, roof, win, rimC) {
  for (let y = base - h; y < 240; y++) for (let i = 0; i < w; i++) cv.set(x + i, y, i === 0 && rimC ? rimC : wall);
  for (let i = -1; i <= w; i++) cv.set(x + i, base - h - 1, roof);
  for (let wy = base - h + 3; wy < base - 3; wy += 6) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (rnd() < 0.35) cv.set(wx, wy, rnd() < 0.7 ? win : 'warm3');
}
function cityLayer(cv, sec) {
  const W = cv.w;
  if (sec === 'jefe') {
    for (let x = 0; x < W; x++) { const t = Math.round(178 + (fbm(x * 0.01, 4, 3) - 0.5) * 30); for (let y = t; y < 240; y++) cv.set(x, y, dp(['pu0', 'night2', 'night1'], (y - t) / 25, x, y)); }
    for (let i = 0; i < W / 18; i++) { const x = rnd() * W, t = Math.round(178 + (fbm(x * 0.01, 4, 3) - 0.5) * 30); tree(cv, x, t + 2, 7 + rnd() * 8, -Math.PI / 2 + (rnd() - 0.5) * 0.3, 5, C('night1'), C('pu1')); }
    return;
  }
  const hill = (x) => 168 + (fbm(x * 0.007, 11, 4) - 0.5) * 44;
  for (let x = 0; x < W; x++) { const t = Math.round(hill(x)); for (let y = t; y < 240; y++) cv.set(x, y, y === t ? 'fog1' : dp(['night4', 'night3', 'night3'], (y - t) / 40 + (fbm(x * 0.05, y * 0.05, 2) - 0.5) * 0.3, x, y)); }
  let x = 0;
  while (x < W) {
    const w = 6 + Math.floor(rnd() * 12), h = 6 + Math.floor(rnd() * 16), b = Math.round(hill(x + w / 2)) + 6;
    houseSil(cv, x, b, w, h, rnd() < 0.5 ? 'night4' : 'mtn2', rnd() < 0.6 ? 'ter0' : 'night3', 'warm2', 'fog1');
    x += w + Math.floor(rnd() * 5);
  }
  // catedral / torres
  for (const cx of [Math.round(W * 0.3), Math.round(W * 0.78)]) {
    const b = Math.round(hill(cx)) + 4;
    for (const tx of [cx - 14, cx + 10]) { for (let y = b - 46; y < b; y++) for (let i = 0; i < 5; i++) cv.set(tx + i, y, i === 0 ? 'fog1' : 'mtn2'); cv.set(tx + 2, b - 40, 'warm2'); cv.set(tx + 2, b - 30, 'warm3'); for (let k = 0; k < 6; k++) cv.rect(tx + Math.floor(k / 2), b - 47 - k, 5 - Math.floor(k / 2) * 2, 1, 'mtn2'); }
    ellipse(cv, cx - 1, b - 30, 7, 7, 'mtn2'); cv.rect(cx - 8, b - 30, 15, 30, 'mtn2'); cv.set(cx - 1, b - 39, 'snow1'); cv.set(cx - 1, b - 40, 'snow1');
  }
  if (sec === 'parque') antennaFar(cv, Math.round(W * 0.66), Math.round(hill(W * 0.66)) + 4, 120);
  // niebla baja
  for (let y = 175; y < 240; y++) for (let xx = 0; xx < W; xx++) { const v = fbm(xx * 0.01, y * 0.08, 3) + (y - 175) / 60 - 0.75; if (v > D(xx, y) * 0.6) cv.set(xx, y, v > 0.5 ? 'fog2' : 'fog1'); }
}
function antennaFar(cv, x, base, h) {
  for (let y = base - h; y < base; y++) { const k = (y - (base - h)) / h, hw = 1 + k * 7; for (let i = -hw; i <= hw; i++) if (Math.abs(i) > hw - 1 || (y + Math.round(i)) % 6 === 0 || (y - Math.round(i)) % 6 === 0) cv.set(x + i, y, Math.abs(i) > hw - 1 && i < 0 ? 'can2' : 'night2'); }
  for (let y = base - h + 6; y < base - 10; y += 18) { glow(cv, x, y, 7, C('pu2'), 0.6); cv.set(x, y, 'pu3'); }
  glow(cv, x, base - h - 2, 14, C('pu2'), 0.8); cv.rect(x - 1, base - h - 3, 3, 3, 'pu3'); cv.set(x, base - h - 2, 'warm4');
}

// capa 3: lo cercano
const WALLS = [['can1', 'can2', 'can3'], ['ea1', 'ea2', 'ea3'], ['ter0', 'ter1', 'ter2'], ['tq0', 'night5', 'tq1'], ['rosa0', 'ter1', 'rosa1'], ['can2', 'can3', 'can4']];
function colonialHouse(cv, x0, base, w, h, ramp) {
  const top = base - h;
  for (let y = top; y < base + 30; y++) for (let x = x0; x < x0 + w; x++) {
    let c = dp(ramp, 0.55 + (fbm(x * 0.05, y * 0.04, 3) - 0.5) * 0.7 - (y - top) / h * 0.25, x, y);
    if (x === x0) c = ramp[2]; else if (x === x0 + w - 1) c = 'ink';
    if (y > base - 12) c = dp(['can1', 'can2', 'can3'], 0.5 + (fbm(x * 0.2, y * 0.2, 2) - 0.5), x, y);
    if (y === base - 12) c = 'can4';
    cv.set(x, y, c);
  }
  // cornisa y tejado
  const flat = rnd() < 0.35;
  if (flat) { cv.rect(x0 - 2, top - 3, w + 4, 3, 'can3'); cv.rect(x0 - 2, top - 3, w + 4, 1, 'can5'); cv.rect(x0 - 2, top, w + 4, 1, 'can1'); for (let x = x0; x < x0 + w; x += 6) cv.rect(x, top - 8, 2, 5, 'can3'); cv.rect(x0 - 1, top - 9, w + 2, 1, 'can4'); }
  else for (let r = 0; r < 7; r++) for (let x = x0 - 4 + r; x < x0 + w + 4 - r; x++) cv.set(x, top - 1 - r, r === 0 ? 'ter0' : ((x + (r % 2) * 2) % 4 === 0 ? 'ter1' : r > 4 ? 'ter3' : 'ter2'));
  // ventanas y balcones (dos pisos)
  const floors = h > 90 ? 2 : 1, nW = Math.max(1, Math.floor((w - 10) / 26));
  for (let f = 0; f < floors; f++) {
    const wy = base - 14 - 26 - f * 40;
    for (let k = 0; k < nW; k++) {
      const wx = x0 + Math.round((w - nW * 26) / 2) + k * 26 + 7, door = f === 0 && k === Math.floor(nW / 2);
      const ww = door ? 12 : 9, wh = door ? 30 : 18, yy = door ? base - 12 - wh : wy;
      const lit = !door && rnd() < 0.55;
      if (lit) glow(cv, wx + ww / 2, yy + wh / 2, 18, C('warm1'), 0.35);
      for (let y = yy - 3; y < yy + wh + 2; y++) for (let x = wx - 2; x < wx + ww + 2; x++) cv.set(x, y, y >= yy + wh ? 'can5' : 'can4');
      for (let y = yy; y < yy + wh; y++) for (let x = wx; x < wx + ww; x++) {
        const arch = y - yy < 3 && Math.abs(x - wx - ww / 2 + 0.5) > ww / 2 - (3 - (y - yy));
        if (arch) continue;
        let c = door ? ((x - wx) % 4 === 0 ? 'ea0' : dp(['ea1', 'ea2'], (y - yy) / wh, x, y)) : lit ? dp(['warm1', 'warm2', 'warm3'], 1 - (y - yy) / wh + 0.2, x, y) : dp(['night1', 'night2', 'night3'], (y - yy) / wh, x, y);
        if (!door && (x === wx + Math.floor(ww / 2) || y === yy + Math.floor(wh / 2))) c = lit ? 'warm0' : 'can1';
        cv.set(x, y, c);
      }
      if (f > 0 || (floors === 1 && !door && rnd() < 0.4)) { cv.rect(wx - 4, yy + wh + 1, ww + 8, 2, 'can3'); for (let x = wx - 4; x < wx + ww + 4; x += 2) cv.rect(x, yy + wh - 6, 1, 7, 'ink'); cv.rect(wx - 4, yy + wh - 7, ww + 8, 1, 'ink'); if (rnd() < 0.5) for (let i = 0; i < 6; i++) cv.set(wx - 4 + rnd() * (ww + 8), yy + wh - 7 + rnd() * 3, rnd() < 0.5 ? 'rosa2' : 'fo3'); }
    }
  }
  // farol de pared
  if (rnd() < 0.5) { const lx = x0 + 4, ly = base - 60; cv.rect(lx, ly, 1, 6, 'ink'); cv.rect(lx, ly + 6, 5, 1, 'ink'); glow(cv, lx + 4, ly + 10, 16, C('warm2'), 0.6); cv.rect(lx + 3, ly + 7, 3, 4, 'warm3'); cv.set(lx + 4, ly + 8, 'warm4'); }
  // anuncio de neón roto
  if (rnd() < 0.3) { const nx = x0 + 8 + Math.floor(rnd() * (w - 40)), ny = top + 8, col = rnd() < 0.5 ? 'rosa2' : 'tq2'; glow(cv, nx + 14, ny + 4, 18, C(col), 0.4); for (let i = 0; i < 28; i++) { const on = hash(i, nx) > 0.2; cv.set(nx + i, ny, on ? col : 'rosa0'); cv.set(nx + i, ny + 8, on ? col : 'rosa0'); if (i % 5 < 3 && hash(nx, i) > 0.3) cv.set(nx + i, ny + 4, on ? (col === 'rosa2' ? 'rosa3' : 'tq3') : 'can1'); } cv.rect(nx, ny, 1, 9, col); cv.rect(nx + 27, ny, 1, 9, col); }
}
function nearLayer(cv, sec) {
  const W = cv.w;
  if (sec === 'calles' || sec === 'taller') {
    let x = -10;
    while (x < W) { const w = 70 + Math.floor(rnd() * 70), h = 80 + Math.floor(rnd() * 60); colonialHouse(cv, x, 212, w, h, WALLS[Math.floor(rnd() * WALLS.length)]); x += w + (rnd() < 0.25 ? 6 + Math.floor(rnd() * 20) : 0); }
    // cables
    for (let i = 0; i < W / 140; i++) { const a = rnd() * W, b = a + 80 + rnd() * 160, y0 = 70 + rnd() * 50, y1 = 70 + rnd() * 50, sag = 8 + rnd() * 14; for (let t = 0; t <= 1; t += 1 / (b - a)) cv.set(a + (b - a) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag, 'ink'); }
    fogBand(cv, 185, 215, 0.6);
    if (sec === 'taller') tallerWall(cv);
    return;
  }
  if (sec === 'parque') {
    // balaustrada de terraza al fondo
    for (let x = 0; x < W; x++) for (let y = 160; y < 200; y++) cv.set(x, y, y < 163 ? (y === 160 ? 'can4' : 'can3') : y > 180 ? dp(['can2', 'can1'], (y - 180) / 20, x, y) : (x % 7 < 3 ? (x % 7 === 0 ? 'can4' : 'can3') : 'night3'));
    for (let i = 0; i < W / 70; i++) { const x = (i + rnd() * 0.6) * 70; parkTree(cv, x, 182, 0.8 + rnd() * 0.5); if (rnd() < 0.5) lampPost(cv, x + 35, 182, 60); }
    fogBand(cv, 170, 200, 0.5);
    return;
  }
  // jefe: la antena gigante
  for (let i = 0; i < W / 90; i++) { const x = rnd() * W; if (Math.abs(x - W / 2) < 90) continue; tree(cv, x, 205, 18 + rnd() * 12, -Math.PI / 2 + (rnd() - 0.5) * 0.3, 7, C('night1'), C('pu1')); }
  antennaBig(cv, Math.round(W / 2), 210, 190, 0);
  fogBand(cv, 175, 215, 0.6, ['pu0', 'pu1']);
}
function fogBand(cv, y0, y1, k, cols = ['fog1', 'fog2']) { for (let y = y0; y < y1; y++) for (let x = 0; x < cv.w; x++) { const v = fbm(x * 0.012, y * 0.1, 3) * k + (y - y0) / (y1 - y0) * 0.6 - 0.55; if (v > D(x, y) * 0.5) cv.set(x, y, v > 0.35 ? cols[1] : cols[0]); } }
function parkTree(cv, x, base, s) {
  const h = Math.round(70 * s);
  for (let y = base - h; y < base + 10; y++) for (let i = -2; i <= 2; i++) cv.set(x + i, y, i === -2 ? 'ea2' : i === 2 ? 'ea0' : 'ea1');
  const blobs = [];
  for (let k = 0; k < 9; k++) blobs.push([x + (rnd() - 0.5) * 50 * s, base - h - 6 + (rnd() - 0.5) * 34 * s, (14 + rnd() * 10) * s]);
  const cx = x - 60 * s, cy = base - h - 50 * s;
  for (let y = Math.floor(cy); y < base - h + 40 * s; y++) for (let xx = Math.floor(cx); xx < x + 60 * s; xx++) {
    let best = 9;
    for (const [bx, by, r] of blobs) best = Math.min(best, Math.hypot(xx - bx, (y - by) * 1.2) / r);
    const n = fbm(xx * 0.15, y * 0.15, 3);
    if (best + (n - 0.5) * 0.5 < 1) { const lit = (cx - xx) * 0 + (best < 0.85 ? 0 : 0) + (1 - best) * 0.4 + (n - 0.5) + ((x - xx) + (cy + 30 - y)) / (60 * s) * 0.4; cv.set(xx, y, dp(['fo0', 'fo1', 'fo2', 'fo3'], lit + 0.3, xx, y)); }
  }
}
function lampPost(cv, x, base, h) {
  cv.rect(x, base - h, 2, h, 'ink'); cv.rect(x - 1, base - 3, 4, 3, 'can1');
  glow(cv, x + 1, base - h - 2, 22, C('warm2'), 0.55);
  cv.rect(x - 2, base - h - 6, 6, 5, 'warm3'); cv.rect(x - 1, base - h - 5, 4, 3, 'warm4'); cv.rect(x - 3, base - h - 7, 8, 1, 'ink');
}
function antennaBig(cv, x, base, h, phase) {
  const top = base - h;
  for (let y = top; y < base; y++) {
    const k = (y - top) / h, hw = 3 + k * 26;
    for (let i = -hw; i <= hw; i++) {
      const edge = Math.abs(i) > hw - 1.5, brace = (Math.round(y + i * 1.3) % 14 + 14) % 14 === 0 || (Math.round(y - i * 1.3) % 14 + 14) % 14 === 0;
      const ring = (y - top) % 28 === 0;
      if (edge || brace || ring) cv.set(x + i, y, edge ? (i < 0 ? 'can3' : 'can1') : 'can2');
    }
  }
  for (let y = top + 14, n = 0; y < base - 10; y += 28, n++) { const k = (y - top) / h, hw = 3 + k * 26; for (const s of [-1, 1]) { const on = (n + phase) % 2 === 0; glow(cv, x + s * hw, y, on ? 9 : 5, C('pu2'), on ? 0.7 : 0.35); cv.rect(x + s * hw - 1, y - 1, 2, 2, on ? 'pu3' : 'pu1'); } }
  // platos de la antena
  for (const [dy, s] of [[30, -1], [60, 1], [95, -1]]) { const yy = top + dy, xx = x + s * (6 + dy * 0.14); ellipse(cv, xx + s * 6, yy, 3, 7, 'can3'); ellipse(cv, xx + s * 7, yy, 1.5, 5, 'can1'); }
  glow(cv, x, top - 4, 26, C('pu2'), 0.9); cv.rect(x - 2, top - 6, 5, 5, 'pu3'); cv.rect(x - 1, top - 5, 3, 3, 'warm4');
  cv.rect(x, top - 20, 1, 14, 'can3');
}
function tallerWall(cv) {
  // pared interior: opaca salvo los ventanales (se ve la ciudad de las capas 0–2)
  const W = cv.w, wins = [];
  for (let wx = 70; wx < W - 120; wx += 250 + Math.floor(rnd() * 60)) wins.push([wx, 40, 110, 96]);
  const inWin = (x, y) => wins.some(([a, b, w, h]) => x >= a && x < a + w && y >= b && y < b + h);
  for (let y = 0; y < 230; y++) for (let x = 0; x < W; x++) {
    if (inWin(x, y)) { cv.clear(x, y); continue; }
    let c = dp(['ink', 'can0', 'can1', 'can2'], 0.45 + (fbm(x * 0.02, y * 0.03, 4) - 0.5) * 0.8 + (y > 150 ? -0.15 : 0), x, y);
    const brick = fbm(x * 0.015 + 50, y * 0.02, 3) > 0.64;
    if (brick) { const by = Math.floor(y / 5), bx = Math.floor((x + (by % 2) * 6) / 12); c = (y % 5 === 0 || (x + (by % 2) * 6) % 12 === 0) ? 'ter0' : (hash(bx, by) > 0.5 ? 'ter1' : 'ter0'); }
    if (y >= 196) c = y === 196 ? 'ea3' : y < 202 ? 'ea2' : 'ea1';
    cv.set(x, y, c);
  }
  for (const [a, b, w, h] of wins) {
    for (let x = a - 3; x < a + w + 3; x++) { cv.set(x, b - 1, 'ea1'); cv.set(x, b - 2, 'ea2'); cv.set(x, b + h, 'ea3'); cv.set(x, b + h + 1, 'ea2'); cv.set(x, b + h + 2, 'ea0'); }
    for (let y = b; y < b + h; y++) { cv.rect(a - 2, y, 2, 1, 'ea1'); cv.rect(a + w, y, 2, 1, 'ea0'); for (let k = 1; k < 3; k++) cv.rect(a + Math.round(w * k / 3), y, 2, 1, 'ea1'); if ((y - b) === Math.round(h / 2)) cv.rect(a, y, w, 2, 'ea1'); }
    // vidrio sucio y uno roto
    for (let y = b; y < b + h; y++) for (let x = a; x < a + w; x++) if (!cv.a(x, y) && D(x, y) < 0.12 && fbm(x * 0.05, y * 0.05, 2) > 0.5) cv.set(x, y, 'fog1', 0.6);
    const cxk = a + w * 0.8, cyk = b + 18; for (let r = 0; r < 6; r++) { const ang = r * 1.1; line(cv, cxk, cyk, cxk + Math.cos(ang) * 12, cyk + Math.sin(ang) * 10, C('snow1'), 1, 0.5); }
  }
  // repisas, cables y carteles
  for (let x = 20; x < W; x += 180 + Math.floor(rnd() * 100)) {
    if (inWin(x, 150) || inWin(x + 60, 150)) continue;
    const sy = 140 + Math.floor(rnd() * 20);
    cv.rect(x, sy, 60, 3, 'ea2'); cv.rect(x, sy + 3, 60, 1, 'ea0');
    for (let k = 0; k < 8; k++) { const ox = x + 3 + k * 7, hh = 4 + Math.floor(rnd() * 8), col = ['can3', 'tq1', 'warm1', 'ea3', 'rosa1', 'can4'][Math.floor(rnd() * 6)]; cv.rect(ox, sy - hh, 4, hh, col); cv.rect(ox, sy - hh, 1, hh, 'can4'); }
  }
  for (let x = 10; x < W; x += 260) { if (inWin(x + 20, 100)) continue; const py = 60 + Math.floor(rnd() * 40); cv.rect(x + 20, py, 24, 32, 'can2'); cv.rect(x + 22, py + 2, 20, 28, rnd() < 0.5 ? 'rosa0' : 'tq0'); cv.rect(x + 24, py + 6, 16, 3, 'warm1'); cv.rect(x + 24, py + 12, 12, 2, 'can4'); cv.rect(x + 24, py + 16, 14, 2, 'can4'); ellipse(cv, x + 32, py + 23, 4, 4, 'tq1'); }
  for (let y = 18; y < 22; y++) for (let x = 0; x < W; x++) cv.set(x, y, y === 18 ? 'can3' : y === 21 ? 'ink' : 'can2');
}

// capa 4: suelo
function groundLayer(cv, sec) {
  const W = cv.w;
  if (sec === 'taller') {
    for (let y = 196; y < 360; y++) {
      const t = (y - 196) / 164, ph = Math.floor(Math.pow(y - 196, 0.78));
      for (let x = 0; x < W; x++) {
        const row = Math.floor(ph / 5), off = hash(row, 3) * 90, seg = Math.floor((x + off) / 90);
        let c = dp(['ea1', 'ea2', 'ea3'], 0.35 + hash(seg, row) * 0.4 + (fbm(x * 0.1, y * 0.5, 2) - 0.5) * 0.4 - t * 0.2, x, y);
        if (ph % 5 === 0) c = 'ea0';
        if ((x + off) % 90 === 0) c = 'ea0';
        if (y < 200) c = y === 196 ? 'ea0' : 'ea1';
        cv.set(x, y, c);
      }
    }
    // tapete de sarape
    const rx = Math.round(W * 0.42), sar = ['rosa2', 'warm2', 'tq1', 'fo3', 'rosa1', 'warm1', 'ter2', 'tq2'];
    for (let y = 250; y < 320; y++) for (let x = rx; x < rx + 260; x++) { const sk = Math.round((y - 250) * 0.3); if (x < rx + sk || x > rx + 230 + sk) continue; const b = Math.floor((x - rx - sk) / 6); let c = sar[b % sar.length]; if ((x - rx - sk) % 6 === 0) c = 'ink'; if (D(x, y) < 0.15) c = 'can1'; cv.set(x, y, c); }
    for (let i = 0; i < W / 40; i++) { const x = rnd() * W, y = 215 + rnd() * 130; if (rnd() < 0.5) { cv.rect(x, y, 6, 4, 'sh2'); cv.rect(x + 1, y + 1, 3, 1, 'sh1'); } else line(cv, x, y, x + 20 + rnd() * 20, y + (rnd() - 0.5) * 10, C('ink')); }
    return;
  }
  const boss = sec === 'jefe', park = sec === 'parque';
  const T0 = park ? 168 : 198;
  // banqueta / terraza
  const walkTop = park ? 205 : 214;
  for (let y = T0; y < walkTop; y++) for (let x = 0; x < W; x++) {
    let c = dp(['can2', 'can3', 'can4'], 0.5 + (fbm(x * 0.05, y * 0.2, 3) - 0.5) * 0.6 - (y - T0) * 0.008, x, y);
    if ((x + Math.floor(y / 8) * 12) % 24 === 0 || (y - T0) % 8 === 0) c = 'can1';
    if (y === T0) c = 'can5';
    cv.set(x, y, c);
  }
  // bordillo / muro de contención
  const curb = park ? 12 : 4;
  for (let y = walkTop; y < walkTop + curb; y++) for (let x = 0; x < W; x++) {
    let c = park ? ((y - walkTop) % 6 === 0 || (x + ((y - walkTop) > 5 ? 10 : 0)) % 20 === 0 ? 'can1' : dp(['can2', 'can3'], fbm(x * 0.1, y * 0.2, 2), x, y)) : (y === walkTop ? 'can5' : 'can2');
    if (y === walkTop && park) c = 'can4';
    cv.set(x, y, c);
  }
  if (park) for (let sx = 300; sx < W; sx += 720) for (let s = 0; s < 6; s++) for (let x = sx - s * 2; x < sx + 48 + s * 2; x++) { const y0 = 186 + s * 5; for (let y = y0; y < y0 + 5; y++) cv.set(x, y, y === y0 ? 'can5' : y === y0 + 4 ? 'can1' : 'can3'); }
  // empedrado / baldosas (Worley con celdas que crecen hacia abajo: perspectiva)
  const Y0 = walkTop + curb, cells = new Map();
  const cellPt = (i, j) => { const k = i * 7919 + j; let p = cells.get(k); if (!p) { p = [hash(i, j * 3 + 1), hash(i * 5 + 2, j)]; cells.set(k, p); } return p; };
  for (let y = Y0; y < 360; y++) {
    const t = (y - Y0) / (360 - Y0), ch = park || boss ? 1 : 1;
    for (let x = 0; x < W; x++) {
      let c;
      if (park || boss) {
        const th = Math.round(8 + t * 6), tw = Math.round(th * 1.5), row = Math.floor(Math.pow(y - Y0, 0.9) / th * 1.6), tx = Math.floor((x + (row % 2) * tw / 2) / tw);
        const lx = (x + (row % 2) * tw / 2) % tw, ly = (Math.pow(y - Y0, 0.9) * 1.6) % th;
        c = (lx < 1 || ly < 1) ? 'can0' : dp(boss ? ['night3', 'can1', 'can2'] : ['can1', 'can2', 'can2', 'can3'], 0.35 + hash(tx, row) * 0.3 + (fbm(x * 0.03, y * 0.05, 3) - 0.5) * 0.6 + (lx < 2 || ly < 2 ? 0.15 : 0) - t * 0.15, x, y);
        if (!boss && c !== 'can0' && hash(tx * 7, row) > 0.9) c = dp(['ter0', 'ter1'], 0.5 + (fbm(x * 0.1, y * 0.1, 2) - 0.5), x, y);
        if (!boss && fbm(x * 0.02 + 30, y * 0.04, 3) > 0.64 && D(x, y) < 0.5) c = (lx + ly) % 3 ? 'fo1' : 'fo2';
      } else {
        const sx = 12, sy = 7, gx = x / sx, gy = (y - Y0) / sy, ix = Math.floor(gx), iy = Math.floor(gy);
        let d1 = 9, d2 = 9, best = null;
        for (let j = iy - 1; j <= iy + 1; j++) for (let i = ix - 1; i <= ix + 1; i++) { const p = cellPt(i, j), dx = i + p[0] - gx, dy = j + p[1] - gy, d = Math.hypot(dx, dy); if (d < d1) { d2 = d1; d1 = d; best = [dx, dy, i, j]; } else if (d < d2) d2 = d; }
        if (d2 - d1 < 0.13) c = d2 - d1 < 0.06 ? 'ink' : 'can0';
        else { const lit = 0.3 + (best[0] + best[1] * 1.5) * 0.55 + hash(best[2], best[3]) * 0.4 - t * 0.15 - d1 * 0.3; c = dp(['can0', 'can1', 'can2', 'can3', 'can4'], lit, x, y); }
      }
      cv.set(x, y, c);
    }
    void ch;
  }
  // charcos con reflejos y luz de faroles
  for (let i = 0; i < W / 260; i++) {
    const px = rnd() * W, py = Y0 + 20 + rnd() * 110, rx = 14 + rnd() * 26, ry = 3 + rnd() * 4;
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) { const e = ((x - px) / rx) ** 2 + ((y - py) / ry) ** 2; if (e < 1 && fbm(x * 0.2, y * 0.4, 2) > 0.3) cv.set(x, y, e > 0.8 ? 'can1' : dp(boss ? ['pu0', 'pu1'] : ['night2', 'night4', 'fog1'], 1 - e + (D(x, y) - 0.5) * 0.2, x, y)); }
    if (!boss) for (let k = 0; k < 4; k++) cv.rect(px - 3 + rnd() * 6, py - ry + 1 + k * 2, 2 + rnd() * 3, 1, k % 2 ? 'warm2' : 'warm3');
  }
  for (let lx = 160; lx < W; lx += 420) for (let y = Y0; y < 360; y++) for (let x = lx - 70; x < lx + 70; x++) { const e = ((x - lx) / 70) ** 2 + ((y - Y0 - 40) / 50) ** 2; if (e < 1 && cv.a(x, y)) { const g = cv.get(x, y), k = 1 - e; if (boss) { if (g === C('can2') && k > D(x, y)) cv.set(x, y, 'pu1'); } else if (g === C('can4') || g === C('can3')) { if (k > D(x, y) * 0.8) cv.set(x, y, k > 0.55 ? 'warm1' : 'ea4'); } else if (g === C('can2') && k * 0.7 > D(x, y)) cv.set(x, y, 'ea2'); } }
  // pasto, hojas y basura
  for (let i = 0; i < W / 6; i++) {
    const x = Math.floor(rnd() * W), y = Y0 + Math.floor(rnd() * (360 - Y0)), r = rnd();
    if (r < 0.35) { const h = 1 + Math.floor(rnd() * 3); for (let k = 0; k < h; k++) cv.set(x + (k > 1 ? 1 : 0), y - k, boss ? 'pu1' : park ? 'fo3' : 'fo2'); }
    else if (r < 0.55) cv.rect(x, y, 2, 1, ['ea3', 'ea4', 'fo4', 'warm1', 'rosa1'][Math.floor(rnd() * 5)]);
  }
  if (boss) {
    // raíces y grietas moradas hacia la antena
    const cx = W / 2;
    for (let k = 0; k < 18; k++) { let x = cx + (rnd() - 0.5) * 40, y = 215 + rnd() * 10, a = Math.PI / 2 + (rnd() - 0.5) * 2.6; const n = 60 + rnd() * 160; for (let s = 0; s < n; s++) { a += (rnd() - 0.5) * 0.3; x += Math.cos(a) * 1.5; y += Math.sin(a) * 0.6 + 0.15; if (y > 358) break; cv.set(x, y, s % 3 ? 'ea1' : 'ea0'); cv.set(x, y + 1, 'ea0'); if (hash(k, s) > 0.8) { cv.set(x, y - 1, 'pu3'); glow(cv, x, y, 3, C('pu2'), 0.5); } } }
  }
}
// capa 5: primer plano (casi todo transparente)
function foreLayer(cv, sec) {
  const W = cv.w, boss = sec === 'jefe';
  const dark = boss ? ['ink', 'pu0'] : sec === 'taller' ? ['ink', 'can0'] : ['ink', 'fo0'];
  // franja inferior desenfocada
  for (let x = 0; x < W; x++) {
    const base = 346 + Math.round((fbm(x * 0.02, 77, 3) - 0.5) * 12);
    for (let y = base; y < 360; y++) cv.set(x, y, D(x, y) > 0.85 ? dark[1] : dark[0]);
    if (sec !== 'taller' && hash(x, 5) < 0.5) { const h = 2 + Math.floor(hash(x, 9) * hash(x, 11) * 16), lean = (hash(x, 13) - 0.5) * 0.6; for (let k = 0; k < h; k++) cv.set(x + Math.round(lean * k), base - k, k > h - 3 ? (boss ? 'pu1' : 'fo1') : dark[0]); }
  }
  if (sec === 'calles') {
    for (let x = 500; x < W; x += 1100 + Math.floor(rnd() * 400)) { for (let y = 0; y < 360; y++) for (let i = 0; i < 9; i++) cv.set(x + i, y, i === 0 ? 'can1' : D(x + i, y) > 0.92 ? 'can0' : 'ink'); }
    for (let x = 0; x < W; x += 520 + Math.floor(rnd() * 200)) bougainvillea(cv, x, 0);
    for (let i = 0; i < W / 400; i++) { const a = rnd() * W, b = a + 300 + rnd() * 200, y0 = rnd() * 20, sag = 20 + rnd() * 20; for (let t = 0; t <= 1; t += 1 / (b - a)) { cv.set(a + (b - a) * t, y0 + Math.sin(t * Math.PI) * sag, 'ink'); cv.set(a + (b - a) * t, y0 + 1 + Math.sin(t * Math.PI) * sag, 'ink'); } }
  } else if (sec === 'parque' || boss) {
    for (let x = 0; x < W; x += 380 + Math.floor(rnd() * 260)) {
      const G = new Cv(W, 120);
      const ang = Math.PI / 2 + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.4);
      tree(G, x, -6, 22, ang, 7, C(dark[0]), C(boss ? 'pu1' : 'fo1'), (lx, ly) => { for (let k = 0; k < 5; k++) { const qx = lx + (rnd() - 0.5) * 8, qy = ly + (rnd() - 0.5) * 6; G.set(qx, qy, C(boss ? 'night1' : 'fo0')); G.set(qx + 1, qy, C(boss ? 'night1' : 'fo0')); G.set(qx, qy + 1, C(boss ? 'pu0' : 'fo1')); } });
      comp(cv, G);
    }
    if (!boss) for (let x = 120; x < W; x += 900) { for (let y = 318; y < 360; y++) for (let xx = x; xx < x + 200; xx++) { const post = (xx - x) % 26 < 6, rail = y < 324 || (y > 338 && y < 342); if (post || rail) cv.set(xx, y, D(xx, y) > 0.8 ? 'can0' : 'ink'); } }
    for (let x = 0; x < W; x += 260 + Math.floor(rnd() * 200)) { const r = 18 + rnd() * 14; for (let y = Math.floor(360 - r); y < 360; y++) for (let xx = Math.floor(x - r * 1.6); xx < x + r * 1.6; xx++) { const e = ((xx - x) / (r * 1.6)) ** 2 + ((y - 362) / r) ** 2; if (e < 1 && fbm(xx * 0.15, y * 0.15, 2) > 0.3 + e * 0.2) cv.set(xx, y, e > 0.7 && D(xx, y) > 0.5 ? (boss ? 'pu0' : 'fo1') : dark[0]); } }
  } else {
    // taller: focos colgando, cables y orilla de mesa
    for (let x = 200; x < W; x += 420 + Math.floor(rnd() * 120)) { const len = 30 + Math.floor(rnd() * 40); cv.rect(x, 0, 1, len, 'ink'); cv.rect(x - 2, len, 5, 3, 'can1'); glow(cv, x, len + 6, 20, C('warm2'), 0.55); ellipse(cv, x, len + 6, 3, 4, 'warm3'); cv.set(x - 1, len + 5, 'warm4'); }
    for (let i = 0; i < W / 300; i++) { const a = rnd() * W, b = a + 200 + rnd() * 200, sag = 10 + rnd() * 30; for (let t = 0; t <= 1; t += 1 / (b - a)) cv.set(a + (b - a) * t, Math.sin(t * Math.PI) * sag, 'ink'); }
    for (let x = 700; x < W; x += 1100) for (let y = 326; y < 360; y++) for (let xx = x; xx < x + 160; xx++) cv.set(xx, y, y < 330 ? (y === 326 ? 'ea2' : 'ea1') : D(xx, y) > 0.85 ? 'ea0' : 'ink');
  }
}
function bougainvillea(cv, x, y) {
  for (let k = 0; k < 60; k++) {
    const px = x + (rnd() - 0.3) * 70, py = y + Math.pow(rnd(), 1.6) * 60 - (Math.abs(px - x - 20) * 0.3);
    if (py < 0) continue;
    ellipse(cv, px, py, 2 + rnd() * 3, 1.5 + rnd() * 2, C(rnd() < 0.6 ? 'rosa1' : 'rosa0'));
    if (rnd() < 0.4) cv.set(px - 1, py - 1, 'rosa2');
    if (rnd() < 0.3) cv.set(px + 2, py + 1, 'fo1');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 6. TEXTO PIXEL 3×5 (letras del mapa, grabados, logo)
// ════════════════════════════════════════════════════════════════════════════
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', L: '100100100100111', M: '101111111101101', N: '110101101101101',
  O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111',
  V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', ' ': '000000000000000',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110',
  6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110', '.': '000000000000010', '—': '000000111000000',
};
function text(cv, str, x, y, c, s = 1, shadow) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r * 3 + k] === '1') { if (shadow) cv.rect(cx + k * s + 1, y + r * s + 1, s, s, shadow); cv.rect(cx + k * s, y + r * s, s, s, c); }
    cx += 4 * s;
  }
  return cx - x;
}
const textW = (str, s = 1) => str.length * 4 * s - s;
// letras grandes 5×7 (letras turísticas y logo)
const BIG = {
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'], A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
};
/** Máscara de letra grande con celdas cw×ch (esquinas redondeadas). */
function bigMask(ch, cw, chh) {
  const g = BIG[ch], m = new Cv(5 * cw, 7 * chh);
  for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (g[r][k] === '1') m.rect(k * cw, r * chh, cw, chh, '#ffffff');
  return m;
}

// ════════════════════════════════════════════════════════════════════════════
// 7. EFECTOS, LETRAS, ALTAR, PROPS
// ════════════════════════════════════════════════════════════════════════════
function fxFrame(k, i, w, h) {
  const cv = new Cv(w, h);
  switch (k) {
    case 'fx_laser_verde': case 'fx_laser_rojo': {
      const g = k === 'fx_laser_verde', [c0, c1, c2] = g ? ['fo4', 'gl2', 'gl3'] : ['red1', 'red2', 'red3'];
      for (let x = 0; x < w; x++) {
        const fade = x < 6 ? x / 6 : 1, wob = Math.sin(x * 0.7 + i * 2) > 0.3 ? 1 : 0;
        cv.set(x, 0 + (wob ? 1 : 0), c0, 0.5 * fade); cv.set(x, 5 - (wob ? 0 : 1), c0, 0.5 * fade);
        cv.set(x, 1, c1, fade); cv.set(x, 4, c1, fade); cv.set(x, 2, c2, fade); cv.set(x, 3, x % 4 === i * 2 ? c1 : c2, fade);
      }
      cv.rect(w - 3, 1, 3, 4, c2); cv.set(w - 1, 0, c1); cv.set(w - 1, 5, c1);
      if (!g) for (let x = 2; x < w; x += 5) cv.set(x + i * 2, i ? 0 : 5, 'warm3');
      return cv;
    }
    case 'fx_impacto': { const r = 2 + i * 2.2; for (let a = 0; a < 6.28; a += 0.2) { const rr = r * (Math.floor(a / 0.785) % 2 ? 0.6 : 1); cv.set(8 + Math.cos(a) * rr, 8 + Math.sin(a) * rr, i < 2 ? 'warm4' : i < 3 ? 'warm2' : 'warm1', 1 - i * 0.2); } if (i < 2) { ellipse(cv, 8, 8, 3 - i, 3 - i, C('warm4')); ellipse(cv, 8, 8, 1.5, 1.5, C('sh2')); } else for (let n = 0; n < 6; n++) cv.set(8 + Math.cos(n) * (r + 1), 8 + Math.sin(n) * (r + 1), 'warm3', 0.7); return cv; }
    case 'fx_eco': { glow(cv, 3.5, 3.5, 4.5, C('tq2'), 0.7 + (i % 2) * 0.2); ellipse(cv, 3.5, 3.5, 1.4, 1.4, C('tq3')); cv.set(3, 3, 'sh2'); const a = i * 1.57; cv.set(3.5 + Math.cos(a) * 3, 3.5 + Math.sin(a) * 3, 'warm4'); return cv; }
    case 'fx_purificar': {
      const r = 6 + i * 5;
      glow(cv, 32, 36, r + 6, C('warm3'), 0.6 - i * 0.08);
      for (let a = 0; a < 6.28; a += 0.04) { cv.over(32 + Math.cos(a) * r, 36 + Math.sin(a) * r * 0.85, C(i < 3 ? 'warm4' : 'tq3'), 1 - i * 0.14); }
      for (let n = 0; n < 10 + i * 2; n++) { const x = 32 + (hash(n, 1) - 0.5) * 50, y = 50 - hash(n, 2) * 30 - i * 5; if (y > 0) { cv.set(x, y, n % 3 ? 'warm4' : 'rosa3'); if (n % 4 === 0) sparkle(cv, x, y, 1, 'warm4', 'tq3'); } }
      if (i < 2) sparkle(cv, 32, 36, 4 + i * 2);
      return cv;
    }
    case 'fx_onda': {
      const rx = 10 + i * 9, ry = 3 + i * 2.2;
      for (let a = 0; a < 6.28; a += 0.02) { const x = 48 + Math.cos(a) * rx, y = 20 + Math.sin(a) * ry; cv.set(x, y, Math.sin(a) > 0 ? 'pu3' : 'pu2', 1 - i * 0.15); cv.set(x, y + 1, 'pu1', 0.7 - i * 0.12); }
      for (let n = 0; n < 12; n++) { const a = -Math.PI * hash(n, 4), r = rx * (0.7 + hash(n, 5) * 0.4); const y = 20 + Math.sin(a) * ry - hash(n, 6) * (6 - i); cv.rect(48 + Math.cos(a) * r, y, 2, 1, n % 2 ? 'can4' : 'ea3'); }
      return cv;
    }
    case 'fx_roca': drawRock(cv, 8, 8.5, 6); return cv;
    case 'fx_raiz': {
      const hh = [4, 16, 34, 44, 26][i];
      for (let y = 47; y > 47 - hh; y--) { const k = (47 - y) / 44, wd = Math.max(1, Math.round(5 * (1 - k)) + 1), sw = Math.round(Math.sin(y * 0.3) * 2); for (let x = -wd; x <= wd; x++) cv.set(12 + x + sw, y, x === -wd ? 'ea3' : x === wd ? 'ea0' : 'ea1'); if (y % 7 === 0 && wd > 2) { cv.set(12 + wd + sw + 1, y, 'ea2'); cv.set(12 + wd + sw + 2, y - 1, 'ea2'); } if (i >= 2 && y % 5 === 0) cv.set(12 + sw, y, 'pu3'); }
      if (i >= 2) glow(cv, 12, 47 - hh, 5, C('pu2'), 0.6);
      for (let x = 3; x < 21; x++) if (hash(x, i) > 0.3) cv.set(x, 47, x % 3 ? 'ea2' : 'can4');
      if (i === 4) for (let n = 0; n < 8; n++) cv.rect(4 + hash(n, 9) * 16, 30 + hash(n, 8) * 16, 2, 2, 'ea2');
      return cv;
    }
    case 'fx_chispa': P(cv, 'warm4', 1, 1, 2, 2); cv.set(0, 1, 'warm2'); cv.set(3, 2, 'warm2'); cv.set(1, 0, 'warm3'); cv.set(2, 3, 'warm3'); return cv;
    case 'fx_sombra': for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = ((x - 15.5) / 16) ** 2 + ((y - 4.5) / 5) ** 2; if (e < 1) cv.set(x, y, 'ink', e < 0.5 ? 0.55 : 0.35); } return cv;
    case 'fx_rastro': { glow(cv, 3.5, 3.5, 4, C('tq2'), 0.5 + 0.15 * Math.sin(i * 1.57)); ellipse(cv, 3.5, 3.5, i % 2 ? 1 : 1.5, i % 2 ? 1 : 1.5, C('tq3')); if (i === 2) cv.set(3, 3, 'warm4'); return cv; }
    case 'fx_gota': for (let y = 0; y < 5; y++) cv.set(0, y, y > 2 ? 'snow2' : 'snow1', 0.25 + y * 0.15); return cv;
    case 'fx_luciernaga': cv.set(1, 1, 'warm4'); for (const [x, y] of [[0, 1], [2, 1], [1, 0], [1, 2]]) cv.set(x, y, 'warm2', 0.55); return cv;
    case 'fx_hoja': { const pts = [[[1, 2], [2, 2], [3, 2], [2, 1], [4, 3]], [[2, 1], [2, 2], [2, 3], [1, 2], [3, 4]], [[1, 1], [2, 2], [3, 3], [2, 1], [4, 4]], [[3, 1], [2, 2], [1, 3], [3, 2], [0, 4]]][i]; pts.forEach(([x, y], n) => cv.set(x, y, n === 4 ? 'ea2' : n === 1 ? 'fo4' : i % 2 ? 'ea3' : 'fo3')); return cv; }
    case 'fx_niebla': for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = (fbm(x * 0.03, y * 0.06, 4) + fbm((x - w) * 0.03, y * 0.06, 4) * 0) * 1, fall = Math.sin((y / h) * Math.PI), edge = Math.min(1, Math.min(x, w - 1 - x) / 40); const a = Math.max(0, n - 0.35) * 1.4 * fall * edge; if (a > 0.02) cv.set(x, y, a > 0.35 ? 'fog4' : 'fog3', Math.min(0.55, a)); } return cv;
    case 'fx_brillo': for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 15.5, y - 15.5) / 16; if (d < 1) cv.set(x, y, d < 0.25 ? 'warm4' : 'warm3', Math.pow(1 - d, 2) * 0.9); } return cv;
  }
  throw new Error('fx ' + k);
}
function letrasXalapa() {
  const cv = new Cv(192, 72), word = 'XALAPA', cols = [['rosa0', 'rosa1', 'rosa2', 'rosa3'], ['warm0', 'warm1', 'warm2', 'warm3'], ['tq0', 'tq1', 'tq2', 'tq3'], ['fo1', 'fo3', 'fo4', 'fo5'], ['pu0', 'pu1', 'pu2', 'pu3'], ['ter0', 'ter2', 'ter3', 'warm2']];
  // base de cantera
  for (let y = 60; y < 72; y++) for (let x = 2; x < 190; x++) cv.set(x, y, y === 60 ? 'can5' : y === 71 ? 'can0' : (x % 24 === 0 || y === 66) ? 'can1' : dp(['can2', 'can3', 'can4'], 0.6 + (fbm(x * 0.2, y * 0.3, 2) - 0.5) - (y - 60) * 0.03, x, y));
  for (let n = 0; n < 6; n++) {
    const m = bigMask(word[n], 5, 7), ox = 8 + n * 30 + (n % 2 ? 0 : 0), oy = 9 + (n % 2), [o, d, md, l] = cols[n];
    // extrusión (profundidad hacia abajo-derecha)
    for (let k = 3; k >= 1; k--) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a(x, y)) cv.set(ox + x + k, oy + y + k, k === 3 ? 'ink' : d);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!m.a(x, y)) continue;
      const tx = ox + x, ty = oy + y;
      let c = dp([md, l], 0.75 - y / m.h * 0.6, tx, ty);
      if (!m.a(x - 1, y) || !m.a(x, y - 1)) c = l;
      // motivo pintado (grecas / puntos) y óxido
      if ((x + y * 2) % 9 === 0 && m.a(x - 1, y) && m.a(x + 1, y)) c = n % 2 ? 'warm4' : 'sh2';
      const rust = fbm(tx * 0.18 + n * 9, ty * 0.12, 3);
      if (rust > 0.62) c = rust > 0.7 ? 'ea2' : 'ea3';
      if (rust > 0.58 && rust <= 0.62 && D(tx, ty) < 0.5) c = 'ter2';
      cv.set(tx, ty, c);
    }
    // escurrimientos de óxido
    for (let k = 0; k < 2; k++) { const rx = ox + 3 + Math.floor(hash(n, k) * 18); for (let y = oy + 20 + Math.floor(hash(k, n) * 10); y < oy + 30 + k * 8; y++) if (cv.a(rx, y)) cv.set(rx, y, 'ea2'); }
    // contorno
    const L = new Cv(192, 72); for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a(x, y)) L.set(ox + x, oy + y, '#ffffff');
    for (let y = 0; y < 72; y++) for (let x = 0; x < 192; x++) if (!L.a(x, y) && (L.a(x - 1, y) || L.a(x, y - 1) || L.a(x + 1, y) || L.a(x, y + 1)) && !(cv.a(x, y) && cv.get(x, y) === C(d))) cv.set(x, y, o);
  }
  // plantas trepadoras y focos de feria (algunos fundidos)
  for (let n = 0; n < 7; n++) { const x = 6 + n * 30 + (n % 3) * 4; for (let y = 59; y > 59 - 6 - (n % 3) * 4; y--) { cv.set(x + Math.round(Math.sin(y * 0.6) * 1.5), y, 'fo2'); if (y % 3 === 0) cv.set(x + 1 + Math.round(Math.sin(y * 0.6) * 1.5), y, 'fo4'); } }
  for (let x = 6; x < 188; x += 7) { const on = hash(x, 3) > 0.35; cv.set(x, 4 + Math.round(Math.sin(x * 0.05) * 2), on ? 'warm3' : 'can2'); if (on) cv.set(x, 5 + Math.round(Math.sin(x * 0.05) * 2), 'warm1', 0.6); }
  for (let x = 4; x < 188; x++) cv.set(x, 3 + Math.round(Math.sin(x * 0.05) * 2), 'ink');
  return cv;
}
function altar(i) {
  const cv = new Cv(48, 48);
  glow(cv, 24, 24, 22, C('warm2'), 0.25 + (i % 2) * 0.08);
  // gradas
  const steps = [[6, 38, 36, 8, 'can3'], [10, 30, 28, 8, 'can4'], [15, 23, 18, 7, 'can3']];
  for (const [x, y, w, h, c] of steps) { cv.rect(x, y, w, h, c); cv.rect(x, y, w, 1, 'can5'); cv.rect(x, y + h - 1, w, 1, 'can1'); cv.rect(x + w - 1, y, 1, h, 'can2'); }
  outline(cv, C('can0'));
  // circuitos turquesa en el frente
  for (const [x0, y0, x1] of [[8, 42, 20], [24, 43, 40], [12, 34, 22], [26, 35, 36]]) { cv.rect(x0, y0, x1 - x0, 1, 'tq1'); cv.set(x0, y0, 'tq2'); cv.set(x1, y0, (i + x0) % 3 ? 'tq2' : 'tq3'); cv.rect(x1, y0, 1, 3, 'tq1'); }
  // pantalla / gema central
  cv.rect(20, 14, 8, 9, 'can1'); cv.rect(21, 15, 6, 7, 'tq0'); P(cv, 'tq2', 23, 17, 2, 3); cv.set(23, 17, i % 2 ? 'warm4' : 'tq3'); glow(cv, 24, 18, 7, C('tq2'), 0.4);
  // cempasúchil
  for (const [x, y] of [[8, 37], [12, 37], [37, 37], [41, 37], [12, 29], [35, 29], [17, 22], [31, 22]]) { P(cv, 'warm2', x - 1, y - 1, 3, 2); cv.set(x, y - 2, 'warm3'); cv.set(x, y - 1, 'warm1'); }
  // papel picado
  for (let x = 4; x < 44; x++) cv.set(x, 3 + Math.round(Math.sin((x - 4) / 40 * Math.PI) * 3), 'ink');
  const pc = ['rosa2', 'warm2', 'tq2', 'fo4', 'pu2'];
  for (let n = 0; n < 5; n++) { const x = 6 + n * 8, y = 4 + Math.round(Math.sin((x - 4) / 40 * Math.PI) * 3); cv.rect(x, y, 6, 6, pc[n]); cv.clear(x + 2, y + 2); cv.clear(x + 3, y + 4); cv.set(x + 1, y + 6, pc[n]); cv.set(x + 4, y + 6, pc[n]); }
  // velas con flama que parpadea
  for (const [x, y, hh] of [[9, 38, 6], [38, 38, 6], [14, 30, 4], [33, 30, 4], [24, 23, 0]]) {
    if (hh) { cv.rect(x, y - hh, 2, hh, 'sh2'); cv.rect(x + 1, y - hh, 1, hh, 'sh1'); }
    const fy = y - hh - 1, f = (i + x) % 4;
    glow(cv, x + 0.5, fy - 1, 4, C('warm2'), 0.55);
    cv.set(x, fy, 'warm2'); cv.set(x + 1, fy, 'warm2'); cv.set(x + (f < 2 ? 0 : 1), fy - 1, 'warm3'); cv.set(x + (f % 2), fy - 2, f === 3 ? 'warm2' : 'warm4');
  }
  return cv;
}
function propFrame(k, i, w, h) {
  const cv = new Cv(w, h);
  const wood = (x, y, ww, hh, hor = true) => { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) cv.set(xx, yy, ((hor ? yy - y : xx - x) % 4 === 3) ? 'ea1' : dp(['ea1', 'ea2', 'ea3'], 0.5 + (fbm(xx * (hor ? 0.08 : 0.5), yy * (hor ? 0.5 : 0.08), 2) - 0.5) * 0.8, xx, yy)); };
  const done = (c = 'ea0') => { outline(cv, C(c)); return cv; };
  switch (k) {
    case 'prop_mesa_taller': {
      wood(2, 18, 92, 6); cv.rect(2, 18, 92, 1, 'ea4');
      for (const x of [6, 86]) { cv.rect(x, 24, 4, 23, 'ea1'); cv.rect(x, 24, 1, 23, 'ea3'); }
      cv.rect(8, 36, 80, 2, 'ea1');
      // placa de circuitos, cautín, tornillo de banco, lámpara
      cv.rect(14, 13, 22, 5, 'fo2'); for (let x = 15; x < 35; x += 3) cv.set(x, 14 + (x % 2), 'warm2'); cv.rect(16, 16, 6, 1, 'tq1'); cv.set(30, 14, 'rosa2');
      cv.rect(42, 15, 14, 2, 'can3'); cv.rect(56, 15, 4, 2, 'warm1'); cv.set(60, 15, 'warm3');
      cv.rect(70, 10, 10, 8, 'can2'); cv.rect(70, 10, 10, 1, 'can4'); cv.rect(80, 13, 6, 2, 'can3');
      line(cv, 88, 17, 84, 4, C('can1')); line(cv, 84, 4, 76, 2, C('can1')); cv.rect(72, 1, 6, 3, 'can3'); glow(cv, 75, 8, 12, C('warm3'), 0.4);
      cv.rect(38, 12, 3, 6, 'tq1'); cv.rect(38, 11, 3, 1, 'tq3');
      for (let n = 0; n < 4; n++) cv.rect(20 + n * 14, 39, 8, 7, ['can2', 'ea2', 'rosa1', 'tq0'][n]);
      return done();
    }
    case 'prop_estante': {
      wood(2, 2, 3, 77, false); wood(43, 2, 3, 77, false);
      for (let s = 0; s < 4; s++) { const y = 18 + s * 19; wood(2, y, 44, 2); for (let x = 6; x < 42;) { const bw = 3 + Math.floor(rnd() * 5), bh = 6 + Math.floor(rnd() * 10), c = ['can3', 'tq1', 'warm1', 'ea3', 'rosa1', 'can4', 'fo3', 'pu1'][Math.floor(rnd() * 8)]; if (x + bw > 42) break; cv.rect(x, y - bh, bw, bh, c); cv.rect(x, y - bh, 1, bh, 'can5'); if (rnd() < 0.3) cv.set(x + 1, y - bh + 2, 'warm4'); x += bw + (rnd() < 0.3 ? 2 : 0); } }
      cv.rect(2, 2, 44, 2, 'ea3');
      return done();
    }
    case 'prop_pistola_laser': {
      glow(cv, 8, 8, 8, C(i ? 'gl2' : 'tq2'), 0.45);
      const L = part(16, 16, R.metal, (L2, m) => { capsule(L2, 3, 7, 12, 7, 1.5, m); capsule(L2, 5, 8, 4, 12, 1.1, m); }, { detail: (L2) => { L2.set(7, 7, C('tq2')); L2.set(8, 7, C('tq1')); L2.set(12, 6, C('gl2')); } });
      comp(cv, L); cv.set(13, 7, i ? 'gl3' : 'gl2'); if (i) sparkle(cv, 4, 3, 1, 'warm4', 'tq3');
      return cv;
    }
    case 'prop_grabado_calma': {
      for (let y = 4; y < 48; y++) for (let x = 3; x < 37; x++) { const top = 4 + (Math.abs(x - 20) > 10 ? Math.abs(x - 20) - 10 : 0); if (y < top) continue; cv.set(x, y, dp(['can2', 'can3', 'can4'], 0.6 + (fbm(x * 0.2, y * 0.2, 3) - 0.5) - (x - 3) / 60, x, y)); }
      // mano en seña (C) tallada y brillando
      const glowC = 'tq2';
      glow(cv, 20, 22, 14, C('tq2'), 0.35);
      for (const [x, y] of [[16, 14], [17, 13], [18, 12], [19, 12], [20, 12], [21, 13], [15, 15], [15, 16], [15, 17], [15, 18], [15, 19], [15, 20], [16, 21], [17, 22], [18, 22], [19, 22], [20, 22], [21, 21], [22, 14], [22, 20]]) { cv.set(x + 2, y + 2, 'can1'); cv.set(x + 2, y + 1, glowC); }
      for (let y = 26; y < 32; y++) { cv.set(19, y, 'can1'); cv.set(20, y, 'tq1'); cv.set(25, y, 'can1'); }
      text(cv, 'CALMA', 10, 37, C('tq3'), 1, C('can1'));
      for (let x = 6; x < 34; x += 4) cv.set(x, 7 + (x % 3), 'can1');
      return done('can0');
    }
    case 'prop_farol': {
      cv.rect(7, 22, 2, 46, 'ink'); cv.rect(7, 22, 1, 46, 'can2'); cv.rect(5, 66, 6, 6, 'can1'); cv.rect(5, 66, 6, 1, 'can3'); cv.rect(6, 40, 4, 2, 'can1');
      glow(cv, 8, 13, 9, C('warm2'), i ? 0.75 : 0.6);
      cv.rect(4, 8, 8, 12, 'ink'); cv.rect(5, 9, 6, 10, i ? 'warm3' : 'warm2'); cv.rect(6, 11, 4, 6, i ? 'warm4' : 'warm3'); cv.rect(7, 9, 2, 10, 'ink');
      cv.rect(3, 6, 10, 2, 'ink'); cv.rect(5, 4, 6, 2, 'ink'); cv.set(8, 2, 'ink'); cv.set(8, 3, 'ink'); cv.rect(4, 20, 8, 2, 'ink');
      return cv;
    }
    case 'prop_banca': {
      for (const x of [4, 41]) { cv.rect(x, 10, 3, 14, 'ink'); cv.rect(x - 1, 22, 5, 2, 'ink'); }
      wood(2, 2, 44, 3); wood(2, 7, 44, 2); wood(2, 12, 44, 3); cv.rect(2, 12, 44, 1, 'ea4'); cv.rect(4, 5, 2, 7, 'ink'); cv.rect(42, 5, 2, 7, 'ink');
      return done('ink');
    }
    case 'prop_arbol': { srand(9001); parkTree(cv, 40, 108, 0.8); for (let x = 30; x < 50; x++) cv.set(x, 109, 'ea0'); return cv; }
    case 'prop_arbusto': {
      const L = part(48, 32, R.leaf, (L2, m) => { for (const [x, y, r] of [[14, 20, 10], [26, 16, 12], [36, 21, 9], [22, 24, 9]]) ellipse(L2, x, y, r, r * 0.8, m); }, { dark: 2, detail: (L2) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) if (L2.a(x, y) && fbm(x * 0.3, y * 0.3, 2) > 0.62) L2.set(x, y, C('fo1')); for (let n = 0; n < 9; n++) { const x = 10 + hash(n, 1) * 30, y = 10 + hash(n, 2) * 16; if (L2.a(x, y)) { L2.set(x, y, C('rosa2')); L2.set(x + 1, y, C('rosa3')); } } } });
      comp(cv, L); for (let x = 6; x < 44; x++) if (!cv.a(x, 30)) cv.set(x, 30, 'fo0');
      return cv;
    }
    case 'prop_antena': antennaBig(cv, 32, 143, 128, i); return cv;
    case 'prop_antena_rota': {
      const T = new Cv(64, 144); antennaBig(T, 32, 143, 128, 0);
      for (let y = 0; y < 144; y++) for (let x = 0; x < 64; x++) if (T.a(x, y) && y > 70 && !(['pu2', 'pu3', 'pu1', 'warm4'].map(C).includes(T.get(x, y)))) cv.set(x, y, T.get(x, y));
      // tramo superior caído e inclinado
      for (let y = 20; y < 72; y++) for (let x = 0; x < 64; x++) if (T.a(x, y) && !(['pu2', 'pu3', 'pu1', 'warm4'].map(C).includes(T.get(x, y)))) { const nx = Math.round(32 + (x - 32) * 0.5 + (72 - y) * 0.45), ny = Math.round(72 - (72 - y) * 0.75); if (ny > 10) cv.set(nx, ny, T.get(x, y)); }
      for (let n = 0; n < 8; n++) sparkle(cv, 20 + hash(n, 3) * 24, 66 + hash(n, 4) * 10, 1, 'warm4', 'warm2');
      for (let n = 0; n < 6; n++) cv.rect(10 + hash(n, 7) * 44, 138 + hash(n, 8) * 5, 2, 1, 'can3');
      return cv;
    }
    case 'prop_busto_juarez': {
      // pedestal de cantera
      for (let y = 40; y < 88; y++) for (let x = 10; x < 38; x++) { const ww = y > 80 ? 0 : y > 44 ? 2 : 0; if (x < 10 + ww || x >= 38 - ww) continue; cv.set(x, y, dp(['can2', 'can3', 'can4'], 0.7 - (x - 10) / 40 + (fbm(x * 0.3, y * 0.2, 2) - 0.5) * 0.4, x, y)); }
      cv.rect(8, 40, 32, 3, 'can4'); cv.rect(8, 40, 32, 1, 'can5'); cv.rect(8, 82, 32, 6, 'can3'); cv.rect(8, 82, 32, 1, 'can5');
      cv.rect(15, 54, 18, 9, 'ea3'); cv.rect(15, 54, 18, 1, 'warm2'); P(cv, 'ea1', 17, 57, 14, 1); P(cv, 'ea1', 17, 59, 10, 1);
      // busto de bronce con pátina
      const B = part(48, 88, ['ea0', 'ea1', 'ea2', 'fo3'], (L2, m) => { ellipse(L2, 24, 32, 13, 8, m); P(L2, m, 11, 32, 26, 8); ellipse(L2, 24, 16, 7, 8.5, m); P(L2, m, 21, 22, 6, 8); }, { dark: 2, detail: (L2) => { for (let y = 0; y < 41; y++) for (let x = 0; x < 48; x++) if (L2.a(x, y) && fbm(x * 0.25, y * 0.25, 2) > 0.6) L2.set(x, y, C('fo2')); P(L2, 'ea0', 20, 15, 3, 1); P(L2, 'ea0', 26, 15, 3, 1); P(L2, 'ea0', 22, 21, 5, 1); P(L2, 'ea0', 18, 9, 12, 2); P(L2, 'ea3', 18, 8, 6, 1); P(L2, 'sh1', 23, 28, 2, 8); P(L2, 'ea0', 24, 30, 1, 1); } });
      for (let y = 0; y < 88; y++) for (let x = 0; x < 48; x++) if (cv.a(x, y) && y < 9) cv.clear(x, y);
      comp(cv, B);
      return done('can0');
    }
    case 'prop_nota_madre': { glow(cv, 8, 8, 8, C('warm3'), 0.4); cv.rect(3, 4, 10, 9, 'sh2'); cv.rect(3, 4, 10, 1, 'sh1'); for (let y = 6; y < 12; y += 2) cv.rect(5, y, 6 - (y % 4), 1, 'can3'); cv.set(11, 11, 'rosa2'); cv.rect(8, 4, 1, 9, 'sh1'); return done('can2'); }
    case 'prop_codice': {
      glow(cv, 12, 12, 12, C('tq2'), 0.45);
      for (let n = 0; n < 4; n++) { const x = 3 + n * 5, up = n % 2 ? 1 : 0; cv.rect(x, 6 + up, 5, 13, n % 2 ? 'ea3' : 'ea4'); cv.rect(x + 4, 6 + up, 1, 13, 'ea2'); cv.set(x + 1, 9 + up, ['ter2', 'tq1', 'rosa1', 'warm1'][n]); cv.set(x + 2, 9 + up, ['ter2', 'tq1', 'rosa1', 'warm1'][n]); cv.set(x + 2, 13 + up, 'ea1'); cv.rect(x + 1, 15 + up, 3, 1, 'ter1'); }
      return done('ea0');
    }
    case 'prop_escalera': {
      for (let s = 0; s < 6; s++) { const y = 8 + s * 7, x0 = 0, x1 = 48; for (let yy = y; yy < y + 7; yy++) for (let x = x0; x < x1; x++) cv.set(x, yy, yy < y + 2 ? (yy === y ? 'can5' : 'can4') : dp(['can1', 'can2', 'can3'], 0.6 - (yy - y) * 0.08 + (fbm(x * 0.2, yy * 0.3, 2) - 0.5) * 0.4, x, yy)); }
      for (let y = 8; y < 48; y++) { cv.set(0, y, 'can1'); cv.set(47, y, 'can0'); }
      return cv;
    }
    case 'prop_barandal': {
      cv.rect(0, 0, 64, 4, 'can4'); cv.rect(0, 0, 64, 1, 'can5'); cv.rect(0, 3, 64, 1, 'can2'); cv.rect(0, 20, 64, 4, 'can3'); cv.rect(0, 20, 64, 1, 'can4');
      for (let x = 2; x < 62; x += 8) { for (let y = 4; y < 20; y++) { const bulge = y > 8 && y < 16 ? 1 : 0; for (let k = -bulge; k < 4 + bulge; k++) cv.set(x + k, y, k <= 0 ? 'can4' : k >= 3 ? 'can1' : 'can3'); } }
      return done('can0');
    }
    case 'prop_poste': {
      wood(6, 8, 4, 88, false); cv.rect(0, 10, 16, 3, 'ea2'); cv.rect(0, 10, 16, 1, 'ea3');
      for (const x of [1, 7, 13]) { cv.rect(x, 7, 2, 3, 'tq1'); cv.set(x, 7, 'tq3'); }
      cv.rect(4, 30, 8, 6, 'can2'); cv.rect(5, 31, 6, 2, 'rosa1'); cv.set(6, 31, 'warm3');
      return done();
    }
    case 'prop_auto_viejo': {
      // vocho turquesa oxidado
      const body = part(96, 40, ['tq0', 'tq0', 'tq1', 'tq2'], (L2, m) => { ellipse(L2, 46, 22, 40, 12, m); ellipse(L2, 44, 14, 22, 11, m); P(L2, m, 8, 22, 80, 8); }, { dark: 2, detail: (L2) => {
        for (let y = 0; y < 40; y++) for (let x = 0; x < 96; x++) if (L2.a(x, y)) { const r = fbm(x * 0.15, y * 0.2, 3); if (r > 0.6) L2.set(x, y, C(r > 0.68 ? 'ea2' : 'ter1')); }
        for (let y = 6; y < 15; y++) for (let x = 30; x < 60; x++) { const e = ((x - 44) / 15) ** 2 + ((y - 15) / 9) ** 2; if (e < 1 && x !== 45) L2.set(x, y, C(y < 9 ? 'fog1' : 'night3')); }
        P(L2, 'can4', 6, 26, 84, 2); P(L2, 'warm3', 84, 18, 3, 3); P(L2, 'red1', 8, 19, 3, 3); P(L2, 'ink', 50, 18, 1, 9); P(L2, 'can4', 54, 20, 3, 1);
      } });
      comp(cv, body);
      for (const x of [24, 70]) { ellipse(cv, x, 32, 7, 6, C('ink')); ellipse(cv, x, 32, 3, 3, C('can2')); cv.rect(x - 7, 37, 14, 2, 'ink'); }
      return cv;
    }
    case 'prop_caja': { wood(2, 4, 28, 23); cv.rect(2, 4, 28, 1, 'ea4'); cv.rect(2, 4, 3, 23, 'ea3'); cv.rect(27, 4, 3, 23, 'ea1'); line(cv, 5, 6, 26, 25, C('ea1'), 2); text(cv, 'TUX', 10, 13, C('ter1')); return done(); }
    case 'prop_puerta_taller': {
      cv.rect(0, 0, 40, 80, 'can2'); cv.rect(0, 0, 40, 2, 'can4');
      wood(4, 4, 32, 76, false); cv.rect(4, 4, 32, 1, 'ea0');
      for (let y = 4; y < 80; y++) { cv.set(19, y, 'ea0'); cv.set(20, y, 'ea0'); }
      cv.rect(30, 42, 3, 3, 'warm2'); cv.set(30, 42, 'warm3');
      for (let y = 6; y < 80; y++) cv.set(35, y, 'warm1', 0.7);
      glow(cv, 36, 70, 8, C('warm2'), 0.4); cv.rect(8, 10, 8, 10, 'night3'); cv.rect(24, 10, 8, 10, 'night3'); cv.set(9, 11, 'fog2'); cv.set(25, 11, 'fog2');
      return cv;
    }
  }
  throw new Error('prop ' + k);
}

// ════════════════════════════════════════════════════════════════════════════
// 8. INTERFAZ
// ════════════════════════════════════════════════════════════════════════════
const MX = [[-117.1, 32.5], [-115.5, 32.6], [-111, 31.3], [-106.5, 31.7], [-104.4, 29.6], [-103, 29], [-101, 29.4], [-99.5, 27.5], [-97.5, 25.9], [-97.7, 23.8], [-97.8, 22.2], [-97.3, 21], [-96.1, 19.2], [-95.7, 18.8], [-94.4, 18.15], [-92.6, 18.6], [-91.8, 18.6], [-90.5, 19.8], [-90.4, 20.9], [-89.6, 21.3], [-87, 21.6], [-86.8, 21.1], [-87.5, 20.2], [-88.3, 18.5], [-89.15, 17.8], [-90.98, 17.8], [-91.4, 17.2], [-90.4, 16.1], [-92.2, 15], [-92.25, 14.5], [-93.9, 15.9], [-95.2, 16.2], [-97.1, 15.9], [-99.9, 16.85], [-102.2, 17.95], [-104.3, 19.1], [-105.7, 20.4], [-105.25, 20.65], [-105.3, 21.5], [-106.4, 23.2], [-109.1, 25.6], [-110.9, 27.9], [-113.5, 31.3], [-114.8, 31.8], [-114.8, 31], [-113.5, 28.9], [-112.3, 27.3], [-110.3, 24.2], [-109.9, 22.9], [-110.2, 23.4], [-112, 24.6], [-113.6, 26.7], [-114.2, 28], [-115.1, 27.8], [-116, 30], [-116.6, 31.8]];
const ROUTE = [['Xalapa', -96.92, 19.54], ['San Andres Tuxtla', -95.4, 18.3], ['Catemaco', -94.9, 18.55], ['Oaxaca', -96.73, 17.07], ['Puebla', -98.2, 19.04], ['CDMX', -99.3, 19.25], ['CDMX', -99.0, 19.7], ['Guanajuato', -101.26, 21.02], ['Jalisco', -103.9, 21.0], ['Guadalajara', -103.3, 20.5]];
function uiFrame(k, i, w, h) {
  const cv = new Cv(w, h);
  switch (k) {
    case 'ui_vida': {
      const heart = ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000'];
      const L = new Cv(12, 12);
      heart.forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') L.set(x + 2, y + 2, i ? 'can1' : 'rosa2'); }));
      if (!i) { shade(L, R.scarf); L.set(3, 3, 'sh2'); } else { L.set(3, 3, 'can2'); }
      outline(L, C(i ? 'can0' : 'rosa0')); comp(cv, L); return cv;
    }
    case 'ui_eco': glow(cv, 3.5, 3.5, 4.5, C('tq2'), 0.6); ellipse(cv, 3.5, 3.5, 2, 2, C('tq2')); P(cv, 'tq3', 3, 3, 1, 1); cv.set(2, 2, 'sh2'); return cv;
    case 'ui_gema': {
      const p = [0.4, 0.7, 1, 0.7][i];
      glow(cv, 11.5, 11.5, 8 + p * 4, C('tq2'), 0.3 + p * 0.4);
      const g = part(24, 24, R.gem, (L, m) => poly(L, [[12, 4], [19, 11], [12, 20], [5, 11]], m), { detail: (L) => { line(L, 6, 11, 18, 11, C('tq1')); line(L, 12, 5, 9, 11, C('tq3')); line(L, 12, 5, 15, 11, C('tq1')); L.set(9, 8, C('sh2')); if (p > 0.9) L.set(10, 7, C('warm4')); } });
      comp(cv, g); if (p > 0.9) sparkle(cv, 18, 5, 2, 'warm4', 'tq3');
      return cv;
    }
    case 'ui_rueda': {
      const c = 79.5;
      for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
        const d = Math.hypot(x - c, y - c), a = Math.atan2(y - c, x - c);
        if (d > 79) continue;
        if (d > 75) cv.set(x, y, d > 77 ? 'tq0' : 'tq1');
        else if (d > 70) { const fret = (Math.floor((a + Math.PI) / (Math.PI / 24)) + (d > 72.5 ? 1 : 0)) % 2; cv.set(x, y, fret ? 'warm1' : 'ea1'); }
        else if (d > 68) cv.set(x, y, 'tq1');
        else if (d > 26) { const seg = ((a + Math.PI * 2 + Math.PI / 6) % (Math.PI / 3)); cv.set(x, y, seg < 0.03 || seg > Math.PI / 3 - 0.03 ? 'tq1' : 'night1', seg < 0.03 || seg > Math.PI / 3 - 0.03 ? 1 : 0.78); }
        else if (d > 24) cv.set(x, y, 'tq2');
        else cv.set(x, y, 'night2', 0.85);
      }
      for (let n = 0; n < 6; n++) { const a = n * Math.PI / 3 - Math.PI / 2; ellipse(cv, c + Math.cos(a) * 48, c + Math.sin(a) * 48, 13, 13, C('night3'), 0.6); }
      return cv;
    }
    case 'ui_marco': {
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const e = Math.min(x, y, 23 - x, 23 - y);
        cv.set(x, y, e === 0 ? 'tq0' : e === 1 ? 'tq1' : e === 2 ? 'night3' : 'night1', e < 3 ? 1 : 0.88);
      }
      for (const [x, y] of [[0, 0], [20, 0], [0, 20], [20, 20]]) { cv.rect(x, y, 4, 4, 'warm1'); cv.rect(x + 1, y + 1, 2, 2, 'warm3'); }
      return cv;
    }
    case 'ui_tecla': { cv.rect(1, 1, 14, 14, 'can1'); cv.rect(1, 1, 14, 12, 'can3'); cv.rect(2, 2, 12, 9, 'can4'); cv.rect(2, 2, 12, 1, 'can5'); return done2(cv, 'ink'); }
    case 'titulo_logo': {
      glow(cv, 160, 48, 80, C('tq1'), 0.35);
      const word = 'ECOS';
      for (let n = 0; n < 4; n++) {
        const m = bigMask(word[n], 13, 11), ox = 24 + n * 70, oy = 9;
        for (let k = 5; k >= 1; k--) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a(x, y)) cv.set(ox + x + k, oy + y + k, k > 3 ? 'pu0' : 'rosa1');
        for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a(x, y)) {
          let c = dp(['tq1', 'tq2', 'tq3', 'sh2'], 1 - y / m.h * 0.95 + (x / m.w) * 0.1, ox + x, oy + y);
          if (!m.a(x - 1, y) || !m.a(x, y - 1)) c = 'sh2';
          if (y % 11 === 5 && (x + n) % 13 > 3 && (x + n) % 13 < 9) c = 'warm3';
          cv.set(ox + x, oy + y, c);
        }
      }
      outline(cv, C('tq0'));
      for (const [x, y] of [[18, 8], [300, 14], [160, 4], [292, 82], [70, 88]]) sparkle(cv, x, y, 2, 'warm4', 'tq3');
      return cv;
    }
    case 'mapa_ruta': {
      const X = (lon) => Math.round(40 + (lon + 118) / 32 * 560), Y = (lat) => Math.round(24 + (33 - lat) / 19 * 316);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const wave = (y + Math.round(Math.sin(x * 0.08) * 2)) % 8 === 0 && D(x, y) < 0.5; cv.set(x, y, wave ? 'tq1' : dp(['night2', 'night3', 'tq0'], 0.4 + (fbm(x * 0.01, y * 0.01, 3) - 0.5), x, y)); }
      const land = new Cv(w, h); poly(land, MX.map(([lo, la]) => [X(lo), Y(la)]), C('ea3'));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (land.a(x, y)) { let c = dp(['ea2', 'ea3', 'ea4'], 0.55 + (fbm(x * 0.03, y * 0.03, 4) - 0.5) * 0.8, x, y); if (fbm(x * 0.4, y * 0.05, 2) > 0.66) c = 'ea2'; cv.set(x, y, c); }
      outline(land, C('ea0')); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (land.a(x, y) && land.get(x, y) === C('ea0')) { cv.set(x, y, 'ea0'); cv.set(x, y + 1, 'tq1'); }
      // sierras
      for (let n = 0; n < 40; n++) { const t = n / 40, x = X(-108 + t * 9), y = Y(28 - t * 7) + Math.round((hash(n, 2) - 0.5) * 12); for (let k = 0; k < 4; k++) { cv.set(x - k, y + k, 'ea1'); cv.set(x + k, y + k, 'ea1'); } cv.set(x, y, 'ea4'); }
      // ruta
      const pts = ROUTE.map(([, lo, la]) => [X(lo), Y(la)]);
      for (let n = 0; n + 1 < pts.length; n++) { const [ax, ay] = pts[n], [bx, by] = pts[n + 1], L = Math.hypot(bx - ax, by - ay), mx = (ax + bx) / 2, my = (ay + by) / 2 - L * 0.25; for (let t = 0; t <= 1; t += 1 / (L * 1.5)) { const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx, y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by; if (Math.floor(t * L / 3) % 2 === 0) { cv.set(x, y, 'rosa2'); cv.set(x, y + 1, 'rosa0'); } } }
      pts.forEach(([x, y], n) => { if (n === 0) glow(cv, x, y, 14, C('tq2'), 0.7); ellipse(cv, x, y, 4, 4, C(n === 0 ? 'tq0' : 'ea0')); ellipse(cv, x, y, 3, 3, C(n === 0 ? 'tq2' : 'warm2')); cv.set(x - 1, y - 1, n === 0 ? 'tq3' : 'warm4'); const lab = String(n + 1); const lx = x + (n % 2 ? -6 - textW(lab) : 6), ly = y - 3 + (n === 6 ? -8 : n === 5 ? 6 : 0); text(cv, lab, lx, ly, C('sh2'), 1, C('ink')); });
      // título y rosa de los vientos
      cv.rect(0, 0, w, 30, 'night1', 0.0); text(cv, 'LA RUTA DE LOS ECOS', 320 - textW('LA RUTA DE LOS ECOS', 2) / 2, 12, C('warm3'), 2, C('ink'));
      const rx = 560, ry = 300; for (let k = -12; k <= 12; k++) { cv.set(rx + k, ry, 'ea4'); cv.set(rx, ry + k, 'ea4'); } poly(cv, [[rx, ry - 14], [rx - 3, ry], [rx + 3, ry]], C('rosa2')); text(cv, 'N', rx - 1, ry - 22, C('sh2'));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = ((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2 - 0.75; if (e > 0 && e * 1.4 > D(x, y)) cv.set(x, y, e > 0.35 ? 'ink' : 'night1'); }
      return cv;
    }
    case 'pantalla_carga': {
      srand(55);
      skyLayer(cv, 'calles'); const M = new Cv(w, h); mountainLayer(M, 'calles'); comp(cv, M);
      for (let y = 230; y < 360; y++) for (let x = 0; x < w; x++) cv.set(x, y, dp(['night2', 'night3', 'night4'], (y - 230) / 130 + (fbm(x * 0.02, y * 0.1, 2) - 0.5) * 0.3, x, y));
      for (let y = 262; y < 300; y++) for (let x = 0; x < w; x++) cv.set(x, y, y === 262 || y === 299 ? 'can3' : (y === 280 && x % 24 < 12) ? 'warm2' : dp(['can0', 'can1'], 0.5 + (fbm(x * 0.05, y * 0.2, 2) - 0.5), x, y));
      for (let n = 0; n < 30; n++) { const x = n * 23 + hash(n, 1) * 10; tree(cv, x, 262, 8 + hash(n, 2) * 10, -Math.PI / 2, 5, C('night1'), C('fo1')); }
      const car = propFrame('prop_auto_viejo', 0, 96, 40);
      // haz de los faros
      for (let y = 270; y < 300; y++) for (let x = 372; x < 520; x++) { const k = 1 - (x - 372) / 148, sp = (x - 372) * 0.12; if (Math.abs(y - 284) < 3 + sp && k * 0.6 > D(x, y)) cv.set(x, y, k > 0.6 ? 'warm3' : 'warm2'); }
      comp(cv, car, 280, 252);
      for (const x of [322, 334, 346]) { ellipse(cv, x, 261, 2.5, 3, C('ink')); cv.rect(x - 3, 264, 6, 3, 'ink'); }
      for (let n = 0; n < 40; n++) cv.set(hash(n, 4) * w, 200 + hash(n, 5) * 50, n % 3 ? 'warm2' : 'warm3');
      return cv;
    }
    case 'retrato_madre': case 'retrato_protagonista': {
      const madre = k === 'retrato_madre';
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) cv.set(x, y, dp(madre ? ['night2', 'pu0', 'night3'] : ['night2', 'night3', 'tq0'], y / 48 + (fbm(x * 0.1, y * 0.1, 2) - 0.5) * 0.3, x, y));
      const hairR = madre ? ['ink', 'ea0', 'ea1', 'ea2'] : R.hair;
      if (madre) comp(cv, part(48, 48, hairR, (L, m) => { ellipse(L, 24, 22, 15, 15, m); P(L, m, 9, 22, 30, 22); }));
      comp(cv, part(48, 48, madre ? ['fo1', 'fo2', 'fo3', 'fo4'] : R.jacket, (L, m) => { ellipse(L, 24, 50, 20, 12, m); }, { detail: (L) => { if (madre) { P(L, 'pu1', 20, 40, 8, 8); } else { P(L, 'sh2', 21, 40, 6, 8); P(L, 'sh1', 21, 40, 1, 8); } } }));
      comp(cv, part(48, 48, R.skin, (L, m) => { ellipse(L, 24, 24, 10, 12, m); P(L, m, 20, 34, 8, 5); }, { detail: (L) => {
        const eye = madre ? 'ea1' : 'fo4';
        P(L, 'ea0', 18, 23, 3, 1); P(L, 'ea0', 27, 23, 3, 1); P(L, eye, 19, 24, 2, 2); P(L, eye, 27, 24, 2, 2); P(L, 'sh2', 19, 24); P(L, 'sh2', 27, 24);
        P(L, 'sk1', 24, 27, 1, 3); P(L, madre ? 'rosa1' : 'sk1', 22, 32, 4, 1); L.over(17, 29, C('rosa3'), 0.4); L.over(30, 29, C('rosa3'), 0.4);
        if (madre) { P(L, 'can3', 17, 23, 5, 4); P(L, 'can3', 26, 23, 5, 4); P(L, eye, 19, 24, 2, 2); P(L, eye, 27, 24, 2, 2); P(L, 'can3', 22, 24, 4, 1); }
      } }));
      if (madre) { comp(cv, part(48, 48, hairR, (L, m) => { ellipse(L, 24, 15, 12, 7, m); P(L, m, 12, 14, 4, 16); P(L, m, 32, 14, 4, 16); })); P(cv, 'tq2', 13, 31, 2, 2); P(cv, 'tq2', 33, 31, 2, 2); }
      else {
        comp(cv, part(48, 48, R.hair, (L, m) => { ellipse(L, 24, 14, 13, 8, m); P(L, m, 12, 14, 4, 10); P(L, m, 32, 14, 3, 8); for (let x = 14; x < 34; x += 3) P(L, m, x, 19, 2, 2 + (x % 2)); }));
        comp(cv, part(48, 48, R.scarf, (L, m) => { P(L, m, 16, 37, 16, 4); P(L, m, 26, 41, 3, 5); }));
        glow(cv, 23, 44, 4, C('tq2'), 0.6); P(cv, 'tq2', 22, 43, 2, 2); cv.set(22, 43, 'tq3');
      }
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (x === 0 || y === 0 || x === 47 || y === 47) cv.set(x, y, 'tq1'); else if (x === 1 || y === 1 || x === 46 || y === 46) cv.set(x, y, 'tq0');
      return cv;
    }
  }
  throw new Error('ui ' + k);
}
function done2(cv, c) { outline(cv, C(c)); return cv; }

// ════════════════════════════════════════════════════════════════════════════
// 8b. PLANTILLAS PARA EL EQUIPO (art-templates/)
// ════════════════════════════════════════════════════════════════════════════
function makeTemplates() {
  const T = [
    ['plantilla_humanoide_64x80.png', 64, 80, 78, () => protFrame('reposo', 0), 'protagonista y NPCs'],
    ['plantilla_chaneque_64x64.png', 64, 64, 62, () => chanFrame('reposo', 0), 'chaneque'],
    ['plantilla_jefe_128x128.png', 128, 128, 126, () => mayorFrame('reposo', 0), 'Chaneque Mayor'],
  ];
  fs.mkdirSync(TEMPLATES, { recursive: true });
  for (const [name, w, h, feet, sil] of T) {
    const file = path.join(TEMPLATES, name);
    if (fs.existsSync(file) && (!isOurs(file) || !FORCE)) continue;
    const cv = new Cv(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = ((x >> 3) + (y >> 3)) % 2 ? 'sh2' : 'snow2', a = 1;
      if (x % 8 === 0 || y % 8 === 0) { c = 'can4'; }
      if (x === w / 2) c = 'tq1';
      cv.set(x, y, c, a);
    }
    const S = silhouette(sil(), C('sh1'));
    comp(cv, S);
    for (let x = 0; x < w; x++) { cv.set(x, feet, 'rosa2'); }
    cv.set(w / 2, feet, 'rosa0'); cv.set(w / 2 - 1, feet + 1, 'rosa0'); cv.set(w / 2 + 1, feet + 1, 'rosa0');
    fs.writeFileSync(file, withMark(encodePNG(cv)));
  }
}

// @@CONTINUA@@

// ════════════════════════════════════════════════════════════════════════════
// 9. REGISTRO DE ASSETS (ARQUITECTURA.md §4 — lista cerrada)
// ════════════════════════════════════════════════════════════════════════════
const ASSETS = [];
/** gen(i) devuelve un Cv de w×h para el cuadro i. frames = 1 → imagen. */
function reg(dir, key, w, h, frames, fps, repeat, feetY, gen, prio = 'media') { ASSETS.push({ dir, key, w, h, frames, fps, repeat, feetY, gen, prio }); }

const PROT_ANIMS = [['reposo', 4, 6, -1], ['caminar', 6, 10, -1], ['correr', 6, 14, -1], ['saltar_subida', 2, 8, 0], ['saltar_caida', 2, 8, 0], ['aterrizar', 2, 12, 0], ['esquivar', 4, 16, 0], ['disparar', 3, 16, 0], ['conjuro', 4, 8, -1], ['dano', 2, 10, 0], ['morir', 5, 8, 0], ['interactuar', 3, 8, 0]];
for (const [a, n, fps, rep] of PROT_ANIMS) reg('sprites/protagonista', 'protagonista_' + a, 64, 80, n, fps, rep, 78, (i) => binarize(protFrame(a, i)), 'alta');
const CHAN_ANIMS = [['reposo', 4, 6, -1], ['caminar', 6, 10, -1], ['ataque', 4, 12, 0], ['salto', 3, 10, 0], ['dano', 2, 10, 0], ['agotado', 4, 6, -1], ['purificar', 6, 10, 0]];
for (const [a, n, fps, rep] of CHAN_ANIMS) reg('sprites/enemigos', 'chaneque_' + a, 64, 64, n, fps, rep, 62, (i) => binarize(chanFrame(a, i)), 'alta');
const MAYOR_ANIMS = [['reposo', 4, 5, -1], ['caminar', 6, 8, -1], ['salto', 4, 8, 0], ['golpe', 5, 10, 0], ['invocar', 4, 8, 0], ['lanzar', 4, 10, 0], ['aturdido', 4, 6, -1], ['dano', 2, 10, 0], ['purificar', 8, 8, 0]];
for (const [a, n, fps, rep] of MAYOR_ANIMS) reg('sprites/jefes', 'chaneque_mayor_' + a, 128, 128, n, fps, rep, 126, (i) => binarize(mayorFrame(a, i)), 'alta');

const FX = [['fx_laser_verde', 32, 6, 2, 12, -1], ['fx_laser_rojo', 32, 6, 2, 12, -1], ['fx_impacto', 16, 16, 4, 20, 0], ['fx_eco', 8, 8, 4, 8, -1], ['fx_purificar', 64, 64, 6, 12, 0], ['fx_onda', 96, 32, 5, 14, 0], ['fx_roca', 16, 16, 1], ['fx_raiz', 24, 48, 5, 12, 0], ['fx_chispa', 4, 4, 1], ['fx_sombra', 32, 10, 1], ['fx_rastro', 8, 8, 4, 10, -1], ['fx_gota', 1, 5, 1], ['fx_luciernaga', 3, 3, 1], ['fx_hoja', 5, 5, 4, 8, -1], ['fx_niebla', 256, 64, 1], ['fx_brillo', 32, 32, 1]];
for (const [k, w, h, n, fps = 1, rep = 0] of FX) reg('sprites/efectos', k, w, h, n, fps, rep, null, (i) => fxFrame(k, i, w, h), 'media');

reg('escenarios/comun', 'letras_xalapa', 192, 72, 1, 1, 0, null, () => letrasXalapa(), 'alta');
reg('escenarios/comun', 'altar_memoria', 48, 48, 4, 6, -1, 46, (i) => altar(i), 'alta');

const PROPS = [['prop_mesa_taller', 96, 48, 1], ['prop_estante', 48, 80, 1], ['prop_pistola_laser', 16, 16, 2, 4, -1], ['prop_grabado_calma', 40, 48, 1], ['prop_farol', 16, 72, 2, 3, -1], ['prop_banca', 48, 24, 1], ['prop_arbol', 80, 112, 1], ['prop_arbusto', 48, 32, 1], ['prop_antena', 64, 144, 4, 6, -1], ['prop_antena_rota', 64, 144, 1], ['prop_busto_juarez', 48, 88, 1], ['prop_nota_madre', 16, 16, 1], ['prop_codice', 24, 24, 1], ['prop_escalera', 48, 48, 1], ['prop_barandal', 64, 24, 1], ['prop_poste', 16, 96, 1], ['prop_auto_viejo', 96, 40, 1], ['prop_caja', 32, 28, 1], ['prop_puerta_taller', 40, 80, 1]];
for (const [k, w, h, n, fps = 1, rep = 0] of PROPS) reg('escenarios/nivel-01-xalapa/props', k, w, h, n, fps, rep, null, (i) => propFrame(k, i, w, h), 'media');

const SECTION_W = { taller: 1280, calles: 2560, parque: 2880, jefe: 1600 };
const PARALLAX = [0.04, 0.15, 0.4, 0.65, 1, 1.25]; // = PARALLAX_FACTORS de src/config/game.ts
const layerWidth = (lw, f) => Math.ceil(640 + (lw - 640) * f);
for (const [sec, sw] of Object.entries(SECTION_W)) for (let L = 0; L < 6; L++) {
  const w = layerWidth(sw, PARALLAX[L]);
  reg('escenarios/nivel-01-xalapa/fondos', `fondo_${sec}_capa${L}`, w, 360, 1, 1, 0, null, () => background(sec, L, w), sec === 'taller' ? 'media' : 'alta');
}

const UI = [['ui_vida', 12, 12, 2, 1, 0], ['ui_eco', 8, 8, 1], ['ui_gema', 24, 24, 4, 6, -1], ['ui_rueda', 160, 160, 1], ['ui_marco', 24, 24, 1], ['ui_tecla', 16, 16, 1], ['titulo_logo', 320, 96, 1], ['mapa_ruta', 640, 360, 1], ['pantalla_carga', 640, 360, 1], ['retrato_madre', 48, 48, 1], ['retrato_protagonista', 48, 48, 1]];
for (const [k, w, h, n, fps = 1, rep = 0] of UI) reg('ui', k, w, h, n, fps, rep, null, (i) => uiFrame(k, i, w, h), k === 'titulo_logo' || k === 'ui_vida' ? 'alta' : 'media');

// ════════════════════════════════════════════════════════════════════════════
// 10. ESCRITURA SEGURA + MANIFIESTO
// ════════════════════════════════════════════════════════════════════════════
const MARK = 'ECOS-placeholder';
function withMark(png) {
  // inserta un chunk tEXt antes de IEND para reconocer nuestros placeholders (el arte del equipo no lo tiene)
  const txt = chunk('tEXt', Buffer.from('Software\0' + MARK + ' (tools/gen-placeholders.mjs)', 'latin1'));
  return Buffer.concat([png.subarray(0, png.length - 12), txt, png.subarray(png.length - 12)]);
}
const isOurs = (file) => { try { return fs.readFileSync(file).includes(MARK); } catch { return false; } };
function render(a) {
  srand(strSeed(a.key));
  if (a.frames === 1) { const c = a.gen(0); if (c.w !== a.w || c.h !== a.h) throw new Error(`${a.key}: ${c.w}×${c.h} ≠ ${a.w}×${a.h}`); return c; }
  const strip = new Cv(a.w * a.frames, a.h);
  for (let i = 0; i < a.frames; i++) { srand(strSeed(a.key) + i * 101); const f = a.gen(i); comp(strip, f, i * a.w, 0); }
  return strip;
}
function auditPalette(cv, key) {
  const off = new Set();
  for (let i = 0; i < cv.w * cv.h; i++) if (cv.d[i * 4 + 3] === 255) { const h = hex(cv.d[i * 4], cv.d[i * 4 + 1], cv.d[i * 4 + 2]); if (!PAL_SET.has(h)) off.add(h); }
  if (off.size) console.warn(`  · ${key}: ${off.size} colores opacos fuera de la paleta`);
}
function loadManifest() {
  try { const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); return { images: m.images ?? [], sheets: m.sheets ?? [] }; } catch { return { images: [], sheets: [] }; }
}
function main() {
  const t0 = Date.now();
  const man = loadManifest();
  const prev = new Map([...man.images, ...man.sheets].map((e) => [e.key, e]));
  const ours = new Set(ASSETS.map((a) => a.key));
  const images = man.images.filter((e) => !ours.has(e.key)); // conserva lo que agregó el equipo
  const sheets = man.sheets.filter((e) => !ours.has(e.key));
  let made = 0, kept = 0, team = 0;
  const match = (k) => !ONLY.length || ONLY.some((o) => k.includes(o));
  for (const a of ASSETS) {
    const rel = `assets/${a.dir}/${a.key}.png`, file = path.join(PUB, rel);
    const exists = fs.existsSync(file);
    let placeholder = true;
    if (exists && !isOurs(file)) {
      placeholder = false; team++;
      const s = pngSize(file), ew = a.w * a.frames;
      if (s && (s.w !== ew || s.h !== a.h)) console.warn(`⚠ ${rel} (arte del equipo) mide ${s.w}×${s.h}; ART_SPEC pide ${ew}×${a.h}. No se toca: avisar al equipo.`);
    } else if ((!exists || FORCE) && match(a.key)) {
      const cv = render(a);
      auditPalette(cv, a.key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, withMark(encodePNG(cv)));
      made++;
    } else if (exists) kept++;
    void prev;
    if (a.frames === 1) images.push({ key: a.key, path: rel, placeholder });
    else sheets.push({ key: a.key, path: rel, frameWidth: a.w, frameHeight: a.h, frames: a.frames, frameRate: a.fps, repeat: a.repeat, originY: a.feetY ? +(a.feetY / a.h).toFixed(4) : 0.5, placeholder });
  }
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify({ images, sheets }, null, 2) + '\n');
  if (!ONLY.length || ONLY.includes('templates')) makeTemplates();
  console.log(`placeholders: ${made} generados, ${kept} placeholders existentes conservados, ${team} del equipo respetados · ${Object.keys(PAL).length} colores · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
main();
