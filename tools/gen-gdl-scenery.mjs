// Nivel 10 (Guadalajara, el final): genera fondos (avenida, catedral, catedral con el eclipse), props
// y las dos pantallas del epílogo (taller de Xalapa de día y el Códice abierto) como PNG a 1× con la
// paleta oficial. El sol del fondo NO se pinta: lo dibuja GdlScenery para poder eclipsarlo.
// Regenera SOLO arte propio (marca + hash). Nunca sobrescribe PNG entregados por el equipo.
//   node tools/gen-gdl-scenery.mjs [--force] [--only=texto] [--preview=carpeta] [--dry]
// Usa únicamente TypeScript (ya instalado) y bibliotecas estándar de Node.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const mark = 'ECOS-placeholder:gdl-v1';
const generator = 'tools/gen-gdl-scenery.mjs';
const force = process.argv.includes('--force');
const dry = process.argv.includes('--dry');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const previewDir = process.argv.find(a => a.startsWith('--preview='))?.slice(10);
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
const manifestPath = path.join(root, 'src/data/assets.json');
const allowed = new Set(fs.readFileSync(path.join(root, 'ART_SPEC.md'), 'utf8').match(/#[0-9a-f]{6}/gi).map(c => c.toLowerCase()));

/* ---------------- Raster RGBA que valida la paleta ---------------- */
const colors = new Map();
function rgb(color) {
  if (!colors.has(color)) {
    if (!allowed.has(String(color).toLowerCase())) throw new Error(`Color fuera de ART_SPEC: ${color}`);
    colors.set(color, [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]);
  }
  return colors.get(color);
}
class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); this.fillStyle = '#120e1a'; }
  fillRect(x, y, w, h) {
    const [r, g, b] = rgb(this.fillStyle);
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let iy = y0; iy < y1; iy++) for (let ix = x0; ix < x1; ix++) {
      const i = (iy * this.w + ix) * 4;
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
    }
  }
}
const table = new Uint32Array(256).map((_, i) => {
  let c = i; for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const b of content) crc = table[(crc ^ b) & 255] ^ crc >>> 8;
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, content, checksum]);
}
function png(raster, withMark = true) {
  const head = Buffer.alloc(13); head.writeUInt32BE(raster.w); head.writeUInt32BE(raster.h, 4); head[8] = 8; head[9] = 6;
  const stride = raster.w * 4 + 1, rows = Buffer.alloc(stride * raster.h);
  for (let y = 0; y < raster.h; y++) Buffer.from(raster.data.buffer, y * raster.w * 4, raster.w * 4).copy(rows, y * stride + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head),
    ...(withMark ? [chunk('tEXt', Buffer.from(`Software\0${mark}`))] : []),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------------- Carga los .ts de src/world (con require entre hermanos) ---------------- */
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const source = fs.readFileSync(path.join(root, `src/world/${name}.ts`), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  cache.set(name, module);
  const require = (spec) => {
    if (!spec.startsWith('./')) throw new Error(`${name}: import no permitido en el generador: ${spec}`);
    return load(spec.slice(2));
  };
  // En el contexto principal (no vm): dentro de un contexto nuevo de vm, Math.imul es ~70× más lento.
  new Function('exports', 'require', 'module', `${code}
//# sourceURL=${name}.ts`)(module.exports, require, module);
  return module.exports;
}
const { drawGdlLayer, gdlLayerSize, drawGdlEpilogo, GDL_BG_PREFIX, GDL_SECTION_WIDTH, GDL_EPILOGO_KEYS } = load('GdlLandscape');
const { GDL_ART, drawGdlArt } = load('GdlArt');

/* ---------------- Escritura segura ---------------- */
const factors = [0.04, 0.15, 0.4, 0.65, 1, 1.25]; // = PARALLAX_FACTORS de src/config/game.ts
const BASE = 'assets/escenarios/nivel-10-guadalajara';
const pending = []; // { list: 'images' | 'sheets', entry, raster, file }
const layers = {};
const epilogos = [];
let written = 0, kept = 0, team = 0;

function plan(list, entry, raster) {
  if (only && !entry.key.includes(only)) return;
  pending.push({ list, entry, raster, file: path.join(root, 'public', entry.path) });
}

for (const [section, prefix] of Object.entries(GDL_BG_PREFIX)) {
  layers[section] = [];
  for (let index = 0; index < 6; index++) {
    const key = `${prefix}_capa${index}`;
    if (only && !key.includes(only)) { layers[section].push(null); continue; }
    const { w, h } = gdlLayerSize(section, index, GDL_SECTION_WIDTH[section]);
    const raster = new Raster(w, h);
    drawGdlLayer(section, index, w, h).blit(raster);
    layers[section].push(raster);
    plan('images', { key, path: `${BASE}/fondos/${key}.png` }, raster);
  }
}
for (const [kind, key] of Object.entries(GDL_EPILOGO_KEYS)) {
  if (only && !key.includes(only)) continue;
  const raster = new Raster(640, 360);
  drawGdlEpilogo(kind).blit(raster);
  epilogos.push({ key, raster });
  plan('images', { key, path: `${BASE}/epilogo/${key}.png` }, raster);
}
for (const spec of GDL_ART) {
  if (only && !spec.key.includes(only)) continue;
  const raster = new Raster(spec.w * spec.frames, spec.h);
  for (let f = 0; f < spec.frames; f++) drawGdlArt(spec, f).blit(raster, f * spec.w, 0);
  const entry = { key: spec.key, path: `assets/${spec.dir}/${spec.key}.png` };
  if (spec.frames > 1 || spec.sheet) {
    Object.assign(entry, { frameWidth: spec.w, frameHeight: spec.h, frames: spec.frames, frameRate: spec.fps ?? 4, repeat: -1, originY: +(spec.feetY / spec.h).toFixed(4) });
    plan('sheets', entry, raster);
  } else plan('images', entry, raster);
}

// --dry: solo vistas previas (no toca PNG del juego ni el manifiesto).
if (dry) pending.length = 0;
// El manifiesto se lee justo antes de escribir: otros agentes pueden estar agregando entradas.
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.images ??= []; manifest.sheets ??= [];
for (const { list, entry, raster, file } of pending) {
  const prev = manifest[list].find(e => e.key === entry.key) ?? manifest[list === 'images' ? 'sheets' : 'images'].find(e => e.key === entry.key);
  if (prev && (prev.path !== entry.path || prev.placeholder === false)) { console.log(`Respeta entrada del equipo: ${entry.key} → ${prev.path}`); team++; continue; }
  const exists = fs.existsSync(file);
  const bytes = exists ? fs.readFileSync(file) : null;
  const own = bytes && bytes.includes(mark) && prev?.generatedSha256 === digest(bytes);
  if (exists && !own) {
    console.log(`Respeta arte del equipo: ${entry.key}`); team++;
    if (prev) { prev.placeholder = false; delete prev.generatedSha256; delete prev.generator; }
    else manifest[list].push({ ...entry, placeholder: false });
    continue;
  }
  if (exists && !force) { kept++; continue; }
  const data = png(raster);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  const full = { ...entry, placeholder: true, generator, generatedSha256: digest(data) };
  if (prev) { for (const k of Object.keys(prev)) delete prev[k]; Object.assign(prev, full); } else manifest[list].push(full);
  console.log(`${entry.key}: ${raster.w}×${raster.h} · ${(data.length / 1024).toFixed(1)} KiB`);
  written++;
}
if (!dry) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

/* ---------------- Vistas previas (no van al juego) ---------------- */
if (previewDir) {
  fs.mkdirSync(previewDir, { recursive: true });
  for (const [section, rs] of Object.entries(layers)) {
    if (rs.some(r => !r)) continue;
    const width = GDL_SECTION_WIDTH[section];
    // Cuatro posiciones de cámara (inicio, 1/3, 2/3, final).
    const shots = [0, 1 / 3, 2 / 3, 1].map(t => (width - 640) * t);
    const out = new Raster(1280, 720);
    for (const [n, cam] of shots.entries()) for (let layer = 0; layer < 6; layer++) {
      const r = rs[layer], ox = Math.round(cam * factors[layer]);
      for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
        const sx = x + ox;
        if (sx < 0 || sx >= r.w) continue;
        const i = (y * r.w + sx) * 4;
        if (!r.data[i + 3]) continue;
        const o = ((y + Math.floor(n / 2) * 360) * out.w + x + n % 2 * 640) * 4;
        out.data.set(r.data.subarray(i, i + 4), o);
      }
    }
    fs.writeFileSync(path.join(previewDir, `preview_${section}.png`), png(out, false));
    // Tira completa de la capa 4 (suelo) a 1×, para revisar el recorrido entero.
    fs.writeFileSync(path.join(previewDir, `preview_${section}_capa4.png`), png(rs[4], false));
  }
  for (const { key, raster } of epilogos) fs.writeFileSync(path.join(previewDir, `preview_${key}.png`), png(raster, false));
  // Hoja de contactos de props a 2× sobre fondo nocturno.
  const sheet = GDL_ART.filter(s => !only || s.key.includes(only));
  let cx = 4, cy = 4, rowH = 0; const W = 1000;
  const placed = sheet.map(s => {
    const w = s.w * s.frames * 2;
    if (cx + w > W) { cx = 4; cy += rowH + 6; rowH = 0; }
    const p = { s, x: cx, y: cy }; cx += w + 6; rowH = Math.max(rowH, s.h * 2); return p;
  });
  const out = new Raster(W, cy + rowH + 4); out.fillStyle = '#26464c'; out.fillRect(0, 0, W, out.h);
  for (const { s, x, y } of placed) for (let f = 0; f < s.frames; f++) {
    const g = drawGdlArt(s, f);
    for (let py = 0; py < s.h; py++) for (let px = 0; px < s.w; px++) {
      const c = g.get(px, py); if (!c) continue;
      out.fillStyle = c; out.fillRect(x + (f * s.w + px) * 2, y + py * 2, 2, 2);
    }
  }
  fs.writeFileSync(path.join(previewDir, 'preview_props.png'), png(out, false));
}
console.log(`${written} escritos · ${kept} propios conservados (usa --force) · ${team} del equipo respetados. Paleta ART_SPEC, alfa 0/255.`);
