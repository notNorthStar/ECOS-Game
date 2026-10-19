// Copia el runtime WASM de MediaPipe desde node_modules a public/mediapipe/wasm
// y descarga el modelo hand_landmarker.task si todavía no existe (ya viene incluido en el paquete).
// Así nunca se depende de un CDN (requisito para itch.io sin conexión y para Electron).
//
// En el juego: copia este script a tools/ y ajusta `dst` si tu carpeta pública es otra.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dst = join(root, 'public', 'mediapipe', 'wasm');
const model = join(root, 'public', 'mediapipe', 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (!existsSync(src)) {
  console.error('No encuentro node_modules/@mediapipe/tasks-vision. Ejecuta primero: npm install');
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
// Solo lo que usa FilesetResolver.forVisionTasks (sin la variante de módulos ES): ahorra ~12 MB.
cpSync(src, dst, { recursive: true, filter: (p) => !p.includes('module_internal') });
console.log('WASM de MediaPipe copiado a', dst);

if (!existsSync(model)) {
  console.log('Descargando modelo desde', MODEL_URL);
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`No se pudo descargar el modelo: ${res.status}`);
  writeFileSync(model, Buffer.from(await res.arrayBuffer()));
  console.log('Modelo guardado en', model);
}
