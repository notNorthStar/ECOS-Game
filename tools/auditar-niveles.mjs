#!/usr/bin/env node
/**
 * Auditoría de mundo de ECOS (dueño: bugs). Recorre src/data/levels/*.json y por cada sección cruza:
 *   - obstáculos (`obstacles` + `collide` de props) con los props visibles (tamaño real del PNG del
 *     manifiesto) y con la capa del suelo pintada (`<background>_capa4.png`, factor 1 = coordenadas
 *     del mundo) → MURO INVISIBLE si no hay nada dibujado encima;
 *   - obstáculos que tapan pasos o puertas (quitarlos agranda el área alcanzable o vuelve alcanzable
 *     una salida/interactuable);
 *   - zonas `walk` que no conectan con el inicio o con la salida;
 *   - interactuables: lejos de la franja (inalcanzables), `radius` chico, `promptDy` que saca el aviso
 *     de pantalla o lo deja flotando lejos del objeto, acción sin caso en el `enabled()` del director
 *     (nunca aparecería el aviso de E) o que depende de una bandera que nadie escribe;
 *   - triggers fuera de la franja o inalcanzables, con acción que el director no maneja.
 *
 * Uso: node tools/auditar-niveles.mjs [seccion…] [--solo-problemas]
 * Salida: reporte por sección; código de salida 1 si hay ERRORES (no por avisos).
 * Las secciones de Guadalajara (otro dueño) se auditan igual pero se marcan como "solo reportar".
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS_DIR = path.join(ROOT, 'src/data/levels');
const PUBLIC = path.join(ROOT, 'public');
const args = process.argv.slice(2);
const SOLO_PROBLEMAS = args.includes('--solo-problemas');
const FILTRO = args.filter((a) => !a.startsWith('--'));

/** Igual que src/config/movement.ts (PLAYER_BODY.radius) y WalkMap. */
const RADIO_JUGADOR = 8;
const RADIO_DEF = 28;
const PROMPT_DY_DEF = 48;
const CELDA = 4;
const AJENAS = new Set(['gdl_avenida', 'catedral', 'catedral_eclipse']);

/* =============================== PNG mínimo =============================== */

const pngCache = new Map();
/** Decodifica un PNG (8 bits por canal o paleta de 1–8 bits, sin entrelazado) a RGBA. */
function leerPng(file) {
  if (pngCache.has(file)) return pngCache.get(file);
  let out = null;
  try {
    const buf = fs.readFileSync(file);
    let pos = 8;
    let w = 0, h = 0, depth = 8, ctype = 6, interlace = 0;
    let pal = null, trns = null;
    const idat = [];
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos);
      const type = buf.toString('ascii', pos + 4, pos + 8);
      const data = buf.subarray(pos + 8, pos + 8 + len);
      if (type === 'IHDR') {
        w = data.readUInt32BE(0); h = data.readUInt32BE(4);
        depth = data[8]; ctype = data[9]; interlace = data[12];
      } else if (type === 'PLTE') pal = data;
      else if (type === 'tRNS') trns = data;
      else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      pos += 12 + len;
    }
    out = { w, h, rgba: null };
    if (interlace || (ctype !== 3 && depth !== 8)) { pngCache.set(file, out); return out; }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
    const bpp = Math.max(1, (chans * depth) / 8);
    const stride = Math.ceil((w * chans * depth) / 8);
    const px = Buffer.alloc(stride * h);
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)];
      const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      const cur = px.subarray(y * stride, (y + 1) * stride);
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        let v = line[i];
        if (f === 1) v += a;
        else if (f === 2) v += b;
        else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        cur[i] = v & 255;
      }
      prev = cur;
    }
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const row = y * stride;
        if (ctype === 6) px.copy(rgba, o, row + x * 4, row + x * 4 + 4);
        else if (ctype === 2) { rgba[o] = px[row + x * 3]; rgba[o + 1] = px[row + x * 3 + 1]; rgba[o + 2] = px[row + x * 3 + 2]; rgba[o + 3] = 255; }
        else if (ctype === 0) { rgba[o] = rgba[o + 1] = rgba[o + 2] = px[row + x]; rgba[o + 3] = 255; }
        else if (ctype === 4) { rgba[o] = rgba[o + 1] = rgba[o + 2] = px[row + x * 2]; rgba[o + 3] = px[row + x * 2 + 1]; }
        else {
          const bit = x * depth;
          const idx = (px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
          rgba[o] = pal[idx * 3]; rgba[o + 1] = pal[idx * 3 + 1]; rgba[o + 2] = pal[idx * 3 + 2];
          rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
        }
      }
    }
    out.rgba = rgba;
  } catch {
    out = null;
  }
  pngCache.set(file, out);
  return out;
}

/* =============================== manifiesto =============================== */

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/assets.json'), 'utf8'));
const assetByKey = new Map();
for (const a of manifest.images ?? []) assetByKey.set(a.key, { ...a, sheet: false });
for (const a of manifest.sheets ?? []) assetByKey.set(a.key, { ...a, sheet: true });

/** Tamaño en pantalla de un prop (cuadro del spritesheet o PNG completo). null si no hay PNG. */
function tamProp(key) {
  const a = assetByKey.get(key);
  if (!a) return null;
  if (a.sheet && a.frameWidth) return { w: a.frameWidth, h: a.frameHeight };
  const png = leerPngCabecera(path.join(PUBLIC, a.path));
  return png;
}
/** Ancho dibujado (píxeles opacos) en el 40 % inferior del primer cuadro del prop: lo que "pisa" el suelo. */
function anchoOpacoBase(key) {
  const a = assetByKey.get(key);
  if (!a) return null;
  const png = leerPng(path.join(PUBLIC, a.path));
  if (!png?.rgba) return null;
  const fw = a.frameWidth ?? png.w, fh = a.frameHeight ?? png.h;
  let x0 = Infinity, x1 = -Infinity;
  for (let y = Math.floor(fh * 0.6); y < fh; y++) for (let x = 0; x < fw; x++) {
    if (png.rgba[(y * png.w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  }
  return x1 >= x0 ? x1 - x0 + 1 : 0;
}
function leerPngCabecera(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    fs.closeSync(fd);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/* =============================== geometría (copia de WalkMap) =============================== */

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function hitsObstacle(o, x, y, r) {
  const rr = r / 2;
  if (o.shape === 'ellipse') {
    const ex = (x - o.x) / (o.rx + r);
    const ey = (y - o.y) / (o.ry + rr);
    return ex * ex + ey * ey < 1;
  }
  return x > o.x - r && x < o.x + o.w + r && y > o.y - rr && y < o.y + o.h + rr;
}
function bbox(o) {
  return o.shape === 'ellipse'
    ? { x0: o.x - o.rx, x1: o.x + o.rx, y0: o.y - o.ry, y1: o.y + o.ry }
    : { x0: o.x, x1: o.x + o.w, y0: o.y, y1: o.y + o.h };
}

class Mapa {
  constructor(level, obstacles) {
    this.level = level;
    this.polys = level.walk.filter((p) => p.length >= 3);
    this.obstacles = obstacles;
  }
  inWalk(x, y) {
    if (!this.polys.length) return true;
    return this.polys.some((p) => pointInPoly(x, y, p));
  }
  walkable(x, y, r = RADIO_JUGADOR, ignorar = null, conAltura = false) {
    if (x < r || x > this.level.width - r) return false;
    for (const o of this.obstacles) {
      if (o === ignorar) continue;
      if (conAltura && o.height !== undefined) continue;
      if (hitsObstacle(o, x, y, r)) return false;
    }
    const ry = r / 2;
    return this.inWalk(x, y) && this.inWalk(x - r, y) && this.inWalk(x + r, y) && this.inWalk(x, y - ry) && this.inWalk(x, y + ry);
  }
  /** BFS en rejilla desde los puntos dados. Devuelve Set de índices de celda. */
  alcanzable(desde, ignorar = null, conAltura = false) {
    const W = Math.ceil(this.level.width / CELDA) + 1;
    const H = Math.ceil(360 / CELDA) + 1;
    const ok = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) ok[j * W + i] = this.walkable(i * CELDA, j * CELDA, RADIO_JUGADOR, ignorar, conAltura) ? 1 : 0;
    const vis = new Uint8Array(W * H);
    const cola = [];
    for (const p of desde) {
      const c = this.celdaCercana(p.x, p.y, ok, W, H);
      if (c >= 0 && !vis[c]) { vis[c] = 1; cola.push(c); }
    }
    while (cola.length) {
      const c = cola.pop();
      const i = c % W, j = (c / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (ok[n] && !vis[n]) { vis[n] = 1; cola.push(n); }
      }
    }
    return { vis, ok, W, H };
  }
  celdaCercana(x, y, ok, W, H) {
    let best = -1, bd = Infinity;
    const ci = Math.round(x / CELDA), cj = Math.round(y / CELDA);
    for (let dj = -12; dj <= 12; dj++) for (let di = -12; di <= 12; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= W || j >= H || !ok[j * W + i]) continue;
      const d = Math.hypot(di, dj * 2);
      if (d < bd) { bd = d; best = j * W + i; }
    }
    return best;
  }
}

/** Distancia mínima (métrica de Interact: dy × 1.6) desde una celda alcanzable al punto. */
function distAlcanzable(R, x, y) {
  const { vis, W, H } = R;
  let best = Infinity;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!vis[j * W + i]) continue;
    const d = Math.hypot(i * CELDA - x, (j * CELDA - y) * 1.6);
    if (d < best) best = d;
  }
  return best;
}
function cuenta(R) {
  let n = 0;
  for (const v of R.vis) n += v;
  return n;
}
function rectAlcanzable(R, t) {
  const { vis, W } = R;
  for (let y = Math.ceil(t.y / CELDA); y * CELDA <= t.y + t.h; y++)
    for (let x = Math.ceil(t.x / CELDA); x * CELDA <= t.x + t.w; x++) if (vis[y * W + x]) return true;
  return false;
}

/* =============================== directores =============================== */

const DIRECTORES = [
  { file: 'Director.ts', secciones: ['taller', 'calles', 'parque', 'jefe', 'sandbox'], fn: 'habilitado', defecto: true },
  { file: 'TuxtlaDirector.ts', secciones: ['tuxtla'], fn: 'enabled' },
  { file: 'CatemacoDirector.ts', secciones: ['catemaco', 'campamento', 'altar_olmeca'], fn: 'enabled' },
  { file: 'OaxacaDirector.ts', secciones: ['oaxaca', 'callejones', 'santo_domingo'], fn: 'enabled' },
  { file: 'CdmxDirector.ts', secciones: ['xochimilco', 'avenidas', 'reforma'], fn: 'enabled' },
  { file: 'Cdmx2Director.ts', secciones: ['teleferico', 'torre', 'salon_trono'], fn: 'enabled' },
  { file: 'GdlDirector.ts', secciones: ['gdl_avenida', 'catedral', 'catedral_eclipse'], fn: 'enabled' },
];
const SRC_TODO = (() => {
  const out = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.ts$/.test(f.name)) out.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(path.join(ROOT, 'src'));
  return out.join('\n');
})();

/** Extrae el cuerpo de `private <fn>(it…` del director y qué acciones habilita. */
function analizarDirector(d) {
  const src = fs.readFileSync(path.join(ROOT, 'src/systems', d.file), 'utf8');
  const ini = src.search(new RegExp(`private ${d.fn}\\(it`));
  let cuerpo = '';
  if (ini >= 0) {
    let i = src.indexOf('{', ini), prof = 0;
    for (let k = i; k < src.length; k++) {
      if (src[k] === '{') prof++;
      else if (src[k] === '}' && --prof === 0) { cuerpo = src.slice(i, k + 1); break; }
    }
  }
  const acciones = new Map(); // acción → expresión que la habilita
  // Trozos "case 'x': <cuerpo>" hasta el siguiente case/default; los vacíos caen al siguiente (fallthrough).
  const trozos = cuerpo.split(/(?=case '|default:)/);
  let pendientes = [];
  for (const t of trozos) {
    const m = t.match(/^case '([^']+)':([\s\S]*)$/);
    if (!m) { pendientes = []; continue; }
    const expr = m[2].replace(/[\s}]+$/, '').trim();
    pendientes.push(m[1]);
    if (expr) {
      for (const a of pendientes) acciones.set(a, expr);
      pendientes = [];
    }
  }
  // Patrón de Tuxtla: ['a', 'b'].includes(it.action)
  const inc = cuerpo.match(/\[([^\]]+)\]\.includes\(it\.action\)/);
  if (inc) for (const s of inc[1].match(/'([^']+)'/g) ?? []) acciones.set(s.slice(1, -1), 'true');
  const ifAct = [...cuerpo.matchAll(/it\.action === '([^']+)'/g)].map((x) => x[1]);
  for (const a of ifAct) acciones.set(a, acciones.get(a) ?? '(condicional)');
  const defecto = d.defecto ?? /default:\s*return true/.test(cuerpo);
  // Todas las acciones que el director maneja en algún switch (interactuables y triggers).
  const manejadas = new Set([...src.matchAll(/case '([^']+)'/g)].map((x) => x[1]));
  const flagsLeidas = [...cuerpo.matchAll(/flag\('([^']+)'\)/g)].map((x) => x[1]);
  return { acciones, defecto, manejadas, flagsLeidas, cuerpo };
}
/** ¿Alguien escribe esta bandera? (remember/setFlag/flags[…] = / flags.x =). */
function banderaSeEscribe(f) {
  const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(remember|setFlag|setF|mark|recordar)\\(\\s*'${esc}'|flags\\[\\s*'${esc}'\\s*\\]\\s*=|flags\\.${esc}\\s*=`).test(SRC_TODO);
}

/* =============================== auditoría =============================== */

const ESC = (process.stdout.isTTY ? { r: '\x1b[31m', y: '\x1b[33m', g: '\x1b[32m', d: '\x1b[2m', x: '\x1b[0m' } : { r: '', y: '', g: '', d: '', x: '' });

function auditar(file) {
  const level = JSON.parse(fs.readFileSync(path.join(LEVELS_DIR, file), 'utf8'));
  const id = level.id ?? file.replace('.json', '');
  const errores = [];
  const avisos = [];
  const info = [];

  // Obstáculos: los del JSON + los `collide` de props (World.ts).
  const obs = [];
  for (const o of level.obstacles ?? []) obs.push({ ...o, _origen: 'obstacles', _prop: null });
  for (const p of level.props ?? []) {
    if (p.collide) obs.push({ shape: 'ellipse', x: p.x, y: p.y, rx: p.collide.rx, ry: p.collide.ry, _origen: `collide de ${p.key}${p.id ? '#' + p.id : ''} (${p.x},${p.y})`, _prop: p });
  }
  const mapa = new Mapa(level, obs);

  // Props visibles (rectángulo en pantalla, origen 0.5,1).
  const rects = [];
  for (const p of level.props ?? []) {
    const t = tamProp(p.key);
    const s = p.scale ?? 1;
    const w = (t?.w ?? 32) * s, h = (t?.h ?? 32) * s;
    rects.push({ p, x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h, y1: p.y, conPng: !!t, invisible: p.alpha !== undefined && p.alpha < 0.25 });
    if (!t) avisos.push(`prop ${p.key} (${p.x},${p.y}) sin PNG en el manifiesto: se ve un respaldo genérico${p.collide ? ' y TIENE colisión' : ''}`);
  }

  // Capa del suelo pintada.
  const capa4 = assetByKey.get(`${level.background}_capa4`);
  const suelo = capa4 ? leerPng(path.join(PUBLIC, capa4.path)) : null;
  const pix = (x, y) => {
    if (!suelo?.rgba) return null;
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= suelo.w || y >= suelo.h) return null;
    const o = (y * suelo.w + x) * 4;
    return [suelo.rgba[o], suelo.rgba[o + 1], suelo.rgba[o + 2], suelo.rgba[o + 3]];
  };
  /** Color medio y alfa medio de un rectángulo de la capa del suelo. */
  const media = (x0, y0, x1, y1, excluir = null) => {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
      if (excluir && excluir(x, y)) continue;
      const c = pix(x, y);
      if (!c) continue;
      r += c[0]; g += c[1]; b += c[2]; a += c[3]; n++;
    }
    return n ? { r: r / n, g: g / n, b: b / n, a: a / n, n } : null;
  };

  // Puntos de partida: spawn y spawns.
  const inicios = [level.spawn, ...Object.values(level.spawns ?? {})].filter(Boolean);
  const R = mapa.alcanzable([level.spawn]);
  const Rtodos = mapa.alcanzable(inicios);
  const Ralt = mapa.alcanzable(inicios, null, true); // cruzando bloques con `height` (salto)
  const nR = cuenta(Rtodos);

  // Spawns fuera de la franja.
  for (const [k, s] of Object.entries({ spawn: level.spawn, ...(level.spawns ?? {}) })) {
    if (!mapa.walkable(s.x, s.y)) {
      const c = mapa.celdaCercana(s.x, s.y, R.ok, R.W, R.H);
      errores.push(`spawn "${k}" (${s.x},${s.y}) no es transitable${c < 0 ? ' y no hay suelo cerca' : ' (World lo reubica, pero conviene corregirlo)'}`);
    }
  }

  // Zonas walk sin conexión.
  level.walk.forEach((poly, i) => {
    let total = 0, alc = 0;
    for (let j = 0; j < R.H; j++) for (let k = 0; k < R.W; k++) {
      if (!pointInPoly(k * CELDA, j * CELDA, poly) || !Rtodos.ok[j * R.W + k]) continue;
      total++;
      if (Rtodos.vis[j * R.W + k]) alc++;
      else if (Ralt.vis[j * R.W + k]) alc += 0.999;
    }
    if (total === 0) avisos.push(`walk[${i}] no tiene ningún punto donde quepa el jugador (radio ${RADIO_JUGADOR})`);
    else if (alc / total < 0.6) errores.push(`walk[${i}] solo ${Math.round((alc / total) * 100)} % alcanzable desde los spawns: zona desconectada`);
  });

  // Obstáculos.
  for (const o of obs) {
    const b = bbox(o);
    const nombre = o._origen === 'obstacles' ? `obstáculo ${o.shape} (${o.x},${o.y}${o.shape === 'rect' ? ` ${o.w}×${o.h}` : ` r${o.rx}/${o.ry}`})` : o._origen;
    // ¿Toca la franja transitable? Si no, es inofensivo.
    let tocaFranja = false;
    for (let y = b.y0 - 4; y <= b.y1 + 4 && !tocaFranja; y += 2) for (let x = b.x0 - 4; x <= b.x1 + 4; x += 2) if (mapa.inWalk(x, y)) { tocaFranja = true; break; }
    if (!tocaFranja) { info.push(`${nombre}: fuera de la franja (inofensivo)`); continue; }
    if (o.water) continue; // el agua la dibuja Atmosphere

    // ¿Lo cubre algún prop visible? (el prop debe tapar la huella en x y llegar a la línea de pies)
    const cubre = rects.filter((r) => !r.invisible && r.x1 > b.x0 + (b.x1 - b.x0) * 0.25 && r.x0 < b.x1 - (b.x1 - b.x0) * 0.25 && r.y1 >= b.y0 - 6 && r.y0 <= b.y1);
    const propio = o._prop ? rects.find((r) => r.p === o._prop) : null;
    let dibujado = cubre.length > 0;
    let motivo = cubre.map((r) => r.p.key).join(', ');
    if (propio) {
      // Huella mucho más ancha que el dibujo = muro invisible a los lados.
      const opaco = anchoOpacoBase(o._prop.key);
      const ancho = opaco ? opaco * (o._prop.scale ?? 1) : propio.x1 - propio.x0;
      if (propio.invisible) { dibujado = false; motivo = 'su prop es casi transparente'; }
      else if (o.rx * 2 > ancho * 1.35 + 8) avisos.push(`${nombre}: la colisión (ancho ${o.rx * 2}) es más ancha que el dibujo (${Math.round(ancho)}) → muro invisible a los lados`);
      else if (o.ry > 18 && o.ry * 2 > (propio.y1 - propio.y0) * 0.9) avisos.push(`${nombre}: la colisión es muy profunda (ry ${o.ry}) para el dibujo`);
      else dibujado = true;
    }
    // Capa del suelo: ¿hay algo pintado en la huella (distinto del piso de alrededor)?
    let pintado = null;
    if (!dibujado && suelo?.rgba) {
      // Solo la huella (sin subir a la pared del fondo: la pared siempre "se ve distinta").
      const dentro = media(b.x0, Math.max(b.y0, b.y1 - 24), b.x1, b.y1, (x, y) => !mapa.inWalk(x, y));
      const fuera = media(b.x0 - 48, b.y0, b.x1 + 48, b.y1 + 10, (x, y) => (x >= b.x0 - 6 && x <= b.x1 + 6) || !mapa.inWalk(x, y) || obs.some((q) => q !== o && hitsObstacle(q, x, y, 0)));
      if (dentro && fuera && dentro.a > 30) {
        const diff = (Math.abs(dentro.r - fuera.r) + Math.abs(dentro.g - fuera.g) + Math.abs(dentro.b - fuera.b)) / 3;
        pintado = diff;
        if (diff > 14) { dibujado = true; motivo = `pintado en ${level.background}_capa4 (Δcolor ${diff.toFixed(0)})`; }
      } else if (dentro && dentro.a <= 30) motivo = 'la capa del suelo es transparente ahí';
    }
    if (!dibujado) {
      const msg = `${nombre}: MURO INVISIBLE (sin prop encima${pintado !== null ? `; capa4 Δcolor ${pintado.toFixed(0)}` : suelo ? '' : '; sin PNG de capa4'}${motivo ? '; ' + motivo : ''})`;
      (suelo || o._origen === 'obstacles' ? errores : avisos).push(msg);
    } else if (!SOLO_PROBLEMAS) info.push(`${nombre}: visible (${motivo || 'prop propio'})`);

    // ¿Tapa un paso? Quitarlo agranda mucho el área alcanzable.
    // Se descuentan las celdas que ocupa el propio obstáculo (inflado por el radio del jugador).
    const sin = mapa.alcanzable(inicios, o);
    let extra = 0;
    for (let k = 0; k < sin.vis.length; k++) {
      if (!sin.vis[k] || Rtodos.vis[k]) continue;
      const x = (k % sin.W) * CELDA, y = Math.floor(k / sin.W) * CELDA;
      if (!hitsObstacle(o, x, y, RADIO_JUGADOR + CELDA)) extra++;
    }
    if (extra > 12) errores.push(`${nombre}: TAPA UN PASO (quitarlo abre ${extra * CELDA * CELDA} px² de franja que hoy no se alcanza)`);
  }

  // Bordes de la franja: si el suelo pintado sigue igual más allá del borde, el jugador choca con
  // "nada" (muro invisible en el borde de walk). Se agrupan tramos contiguos.
  if (suelo?.rgba) {
    for (const lado of ['arriba', 'abajo']) {
      let tramo = null;
      const cerrar = () => {
        if (tramo && tramo.x1 - tramo.x0 >= 48) avisos.push(`borde ${lado} de la franja en x=${tramo.x0}..${tramo.x1} (y≈${Math.round(tramo.y)}): el suelo pintado continúa igual más allá → se siente como muro invisible`);
        tramo = null;
      };
      for (let x = 16; x < level.width - 16; x += 8) {
        let yb = null;
        if (lado === 'arriba') { for (let y = 150; y < 360; y++) if (mapa.inWalk(x, y)) { yb = y; break; } }
        else for (let y = 359; y > 150; y--) if (mapa.inWalk(x, y)) { yb = y; break; }
        if (yb === null || (lado === 'abajo' && yb > 340)) { cerrar(); continue; }
        const s = lado === 'arriba' ? -1 : 1;
        const fueraM = media(x - 3, Math.min(yb + s * 8, yb + s * 18), x + 3, Math.max(yb + s * 8, yb + s * 18));
        const dentroM = media(x - 3, Math.min(yb - s * 3, yb - s * 12), x + 3, Math.max(yb - s * 3, yb - s * 12));
        // Un obstáculo/prop justo en el borde también "explica" el tope.
        const explicado = rects.some((r) => x > r.x0 && x < r.x1 && Math.abs(r.y1 - yb) < 14);
        if (!fueraM || !dentroM || fueraM.a < 200 || explicado) { cerrar(); continue; }
        const diff = (Math.abs(fueraM.r - dentroM.r) + Math.abs(fueraM.g - dentroM.g) + Math.abs(fueraM.b - dentroM.b)) / 3;
        if (diff < 6) { if (!tramo) tramo = { x0: x, x1: x, y: yb }; else tramo.x1 = x; }
        else cerrar();
      }
      cerrar();
    }
  }

  // Director.
  const dir = DIRECTORES.find((d) => d.secciones.includes(id));
  const an = dir ? analizarDirector(dir) : null;

  // Interactuables.
  for (const it of level.interactables ?? []) {
    const r = it.radius ?? RADIO_DEF;
    const nom = `interactuable "${it.id}" (${it.action}) en (${it.x},${it.y})`;
    const d = distAlcanzable(Rtodos, it.x, it.y);
    const dAlt = distAlcanzable(Ralt, it.x, it.y);
    if (d > r) {
      if (dAlt <= r) avisos.push(`${nom}: solo se alcanza saltando sobre un bloque con altura`);
      else errores.push(`${nom}: INALCANZABLE: el punto transitable más cercano queda a ${d.toFixed(0)} px (radio ${r})`);
    } else if (d > r * 0.7) avisos.push(`${nom}: hay que pegarse mucho (borde a ${d.toFixed(0)} de radio ${r})`);
    // Radio chico a propósito si está encima de un bloque con altura (no debe activarse desde el suelo).
    const sobreBloque = obs.some((o) => o.height !== undefined && hitsObstacle(o, it.x, it.y, 0));
    if (r < 22 && !sobreBloque) avisos.push(`${nom}: radius ${r} muy chico (mín. recomendado 24)`);
    const dy = Number(it.data?.promptDy ?? PROMPT_DY_DEF);
    const yAviso = it.y - dy;
    if (yAviso < 10) errores.push(`${nom}: promptDy ${dy} deja el aviso fuera de pantalla (y=${yAviso})`);
    else if (yAviso < 34 && (it.x < 140 || it.x > level.width - 80)) avisos.push(`${nom}: el aviso (y=${yAviso}) cae junto al HUD`);
    // ¿El aviso queda cerca del dibujo del objeto?
    const propRect = rects.find((q) => q.p.id === it.id) ?? rects.filter((q) => Math.abs(q.p.x - it.x) < 24 && Math.abs(q.p.y - it.y) < 24).sort((a, b) => Math.abs(a.p.x - it.x) - Math.abs(b.p.x - it.x))[0];
    if (propRect && propRect.conPng) {
      const top = propRect.y0;
      if (yAviso < top - 40) avisos.push(`${nom}: el aviso flota ${Math.round(top - yAviso)} px sobre ${propRect.p.key} (promptDy ${dy})`);
      if (yAviso > propRect.y1 + 4) avisos.push(`${nom}: el aviso queda debajo de los pies de ${propRect.p.key}`);
    }
    if (an) {
      const en = an.acciones.get(it.action);
      if (en === undefined && !an.defecto) errores.push(`${nom}: la acción "${it.action}" no está en ${dir.fn}() de ${dir.file} → el aviso de E NUNCA aparece`);
      else if (en && /return false\s*$/.test(en)) errores.push(`${nom}: ${dir.fn}() devuelve false para "${it.action}"`);
      if (!an.manejadas.has(it.action)) errores.push(`${nom}: ${dir.file} no maneja la acción "${it.action}"`);
      if (en) for (const f of [...en.matchAll(/flag\('([^']+)'\)/g)].map((x) => x[1])) if (!banderaSeEscribe(f)) avisos.push(`${nom}: depende de la bandera "${f}" y no encontré quién la escribe`);
    }
  }

  // Triggers.
  for (const t of level.triggers ?? []) {
    const nom = `trigger "${t.id}" (${t.action}) [${t.x},${t.y} ${t.w}×${t.h}]`;
    if (!rectAlcanzable(Rtodos, t)) {
      if (rectAlcanzable(Ralt, t)) avisos.push(`${nom}: solo se alcanza saltando sobre un bloque`);
      else errores.push(`${nom}: INALCANZABLE / fuera de la franja transitable`);
    } else {
      // Que cubra todo el alto de la franja en su x (si no, se puede pasar de largo por arriba o abajo).
      const cx = t.x + t.w / 2;
      let fuera = 0, total = 0;
      for (let y = 0; y < 360; y += CELDA) {
        if (!Rtodos.vis[Math.round(y / CELDA) * Rtodos.W + Math.round(cx / CELDA)]) continue;
        total++;
        if (y < t.y || y > t.y + t.h) fuera++;
      }
      if (total && fuera / total > 0.35 && /salir|seccion|arena|jefe|emboscada/.test(t.action))
        avisos.push(`${nom}: no cubre todo el alto de la franja en x=${cx} (${Math.round((fuera / total) * 100)} % se puede rodear)`);
    }
    if (an && !an.manejadas.has(t.action)) {
      // Un cartel de zona sin manejar es cosmético; cualquier otra acción es un trigger muerto.
      (t.action === 'letras' ? avisos : errores).push(`${nom}: ${dir.file} no maneja la acción de trigger "${t.action}"`);
    }
  }

  // Salidas.
  const salidas = [
    ...(level.triggers ?? []).filter((t) => /salir|salida|seccion/.test(t.action) || t.data?.section),
    ...(level.interactables ?? []).filter((i) => /salir|salida|estacion|consola/.test(i.action) || i.data?.section),
  ];
  if (!salidas.length) info.push('sin salida en el JSON (la maneja el director o es la última sección)');

  return { id, file, errores, avisos, info, ajena: AJENAS.has(id), pngSuelo: !!suelo?.rgba };
}

/* =============================== reporte =============================== */

const files = fs.readdirSync(LEVELS_DIR).filter((f) => f.endsWith('.json') && f !== 'sandbox.json').filter((f) => !FILTRO.length || FILTRO.includes(f.replace('.json', '')));
let totalErr = 0, totalAv = 0;
for (const f of files) {
  const r = auditar(f);
  totalErr += r.ajena ? 0 : r.errores.length;
  totalAv += r.ajena ? 0 : r.avisos.length;
  const etiqueta = r.ajena ? ' (Guadalajara: otro dueño, SOLO REPORTAR)' : '';
  const estado = r.errores.length ? `${ESC.r}${r.errores.length} error(es)${ESC.x}` : `${ESC.g}OK${ESC.x}`;
  console.log(`\n== ${r.id}${etiqueta} — ${estado}, ${r.avisos.length} aviso(s)${r.pngSuelo ? '' : ' · sin PNG de suelo (fondo por código)'}`);
  for (const e of r.errores) console.log(`  ${ESC.r}ERROR${ESC.x}  ${e}`);
  for (const a of r.avisos) console.log(`  ${ESC.y}aviso${ESC.x}  ${a}`);
  if (!SOLO_PROBLEMAS) for (const i of r.info) console.log(`  ${ESC.d}info   ${i}${ESC.x}`);
}
console.log(`\nTotal (sin Guadalajara): ${totalErr} error(es), ${totalAv} aviso(s).`);
process.exit(totalErr ? 1 : 0);
