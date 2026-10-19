import type { Landmark } from './types';
import { LM } from './types';

/**
 * Normaliza los 21 puntos para que no importe dónde está la mano ni su tamaño:
 *  - relativos a la muñeca,
 *  - escalados por la distancia muñeca → nudillo del dedo medio,
 *  - la mano derecha se refleja en X para que ambas manos queden en el mismo marco
 *    (con la palma al frente, el pulgar hacia −x). El video llega SIN espejo a MediaPipe.
 * NO se rota: en LSM la orientación de la mano distingue letras.
 * Resultado: 63 números (x, y, z por punto).
 */
export function normalizeLandmarks(lms: Landmark[], handedness: string): Float32Array {
  const w = lms[LM.WRIST];
  const m = lms[LM.MIDDLE_MCP];
  const scale = Math.hypot(m.x - w.x, m.y - w.y, m.z - w.z) || 1;
  // Con el video SIN espejo que le damos, MediaPipe devuelve la mano real (probado con cámara
  // el 2026-10-17). Reflejamos la derecha para que, con la palma al frente, el pulgar quede
  // hacia −x en ambas manos (ese es el marco que esperan las reglas de rules.ts).
  const mirror = handedness === 'Right' ? -1 : 1;
  const out = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    const p = lms[i];
    out[i * 3] = ((p.x - w.x) / scale) * mirror;
    out[i * 3 + 1] = (p.y - w.y) / scale;
    out[i * 3 + 2] = (p.z - w.z) / scale;
  }
  return out;
}

export function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Punto i de un vector de rasgos normalizado. */
export function pt(f: Float32Array, i: number): Landmark {
  return { x: f[i * 3], y: f[i * 3 + 1], z: f[i * 3 + 2] };
}
