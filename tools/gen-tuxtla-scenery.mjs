// Regenera SOLO arte propio identificado por hash. Nunca sobrescribe PNG entregados por el equipo.
// node tools/gen-tuxtla-scenery.mjs [--force] [--preview=archivo.png]
// Usa únicamente TypeScript (ya instalado) y bibliotecas estándar de Node.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const mark = 'ECOS-placeholder:tuxtla-v2';
const force = process.argv.includes('--force');
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
const manifestPath = path.join(root, 'src/data/assets.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const allowed = new Set(fs.readFileSync(path.join(root, 'ART_SPEC.md'), 'utf8').match(/#[0-9a-f]{6}/gi).map(c => c.toLowerCase()));
const colors = new Map();
function rgb(color) {
  if (!colors.has(color)) {
    if (!allowed.has(color.toLowerCase())) throw new Error(`Color fuera de ART_SPEC: ${color}`);
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
function png(raster) {
  const head = Buffer.alloc(13); head.writeUInt32BE(raster.w); head.writeUInt32BE(raster.h, 4); head[8] = 8; head[9] = 6;
  const stride = raster.w * 4 + 1, rows = Buffer.alloc(stride * raster.h);
  for (let y = 0; y < raster.h; y++) Buffer.from(raster.data.buffer, y * raster.w * 4, raster.w * 4).copy(rows, y * stride + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head),
    chunk('tEXt', Buffer.from(`Software\0${mark}`)), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function load(name) {
  const source = fs.readFileSync(path.join(root, `src/world/${name}.ts`), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(exports){${code}\n})`, {}, { filename: name })(module.exports);
  return module.exports;
}
const { drawTuxtlaLandscape } = load('TuxtlaLandscape');
const { drawTuxtlaGround, drawTuxtlaForeground } = load('TuxtlaTerrain');
const factors = [0.04, 0.15, 0.4, 0.65, 1, 1.25];
const layers = [];
let written = 0;
for (let index = 0; index < factors.length; index++) {
  const width = Math.ceil(640 + (3600 - 640) * factors[index]);
  const raster = new Raster(width, 360);
  if (index < 4) drawTuxtlaLandscape(raster, width, 360, index);
  else if (index === 4) drawTuxtlaGround(raster, width, 360);
  else drawTuxtlaForeground(raster, width);
  layers.push(raster);
  const key = `fondo_tuxtla_capa${index}`;
  const rel = `assets/escenarios/nivel-02-san-andres-tuxtla/fondos/${key}.png`;
  const filename = path.join(root, 'public', rel);
  const prev = manifest.images.find(image => image.key === key);
  if (prev && (prev.path !== rel || prev.placeholder === false)) {
    console.log(`Respeta entrada del equipo: ${key} → ${prev.path}`);
    continue;
  }
  const exists = fs.existsSync(filename);
  const bytes = exists ? fs.readFileSync(filename) : null;
  const own = bytes && bytes.includes(mark) && prev?.generatedSha256 === digest(bytes);
  if (exists && !own) {
    console.log(`Respeta arte del equipo: ${key}`);
    if (prev) { prev.placeholder = false; delete prev.generatedSha256; delete prev.generator; }
    else manifest.images.push({ key, path: rel, placeholder: false });
    continue;
  }
  if (exists && !force) { console.log(`Conserva ${key} (usa --force para regenerar arte propio)`); continue; }
  const data = png(raster);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, data);
  const entry = { key, path: rel, placeholder: true, generator: 'tools/gen-tuxtla-scenery.mjs', generatedSha256: digest(data) };
  if (prev) Object.assign(prev, entry); else manifest.images.push(entry);
  console.log(`${key}: ${width}×360 · ${(data.length / 1024).toFixed(1)} KiB`);
  written++;
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const preview = process.argv.find(arg => arg.startsWith('--preview='))?.slice(10);
if (preview) {
  const out = new Raster(1280, 720);
  for (const [n, cam] of [0, 1000, 2000, 2960].entries()) {
    for (let layer = 0; layer < 6; layer++) {
      const raster = layers[layer], offset = Math.round(cam * factors[layer]);
      for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
        const i = (y * raster.w + x + offset) * 4;
        if (!raster.data[i + 3]) continue;
        const o = ((y + Math.floor(n / 2) * 360) * out.w + x + n % 2 * 640) * 4;
        out.data.set(raster.data.subarray(i, i + 4), o);
      }
    }
  }
  fs.mkdirSync(path.dirname(preview), { recursive: true });
  fs.writeFileSync(preview, png(out));
}
console.log(`${written} capas escritas; colores dentro de ART_SPEC, alfa 0/255.`);
