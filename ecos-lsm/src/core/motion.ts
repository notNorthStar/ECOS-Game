import type { Landmark } from './types';
import { LM } from './types';

/**
 * Reconocedor de letras CON MOVIMIENTO por trayectoria (sin Phaser).
 *
 * Z de LSM: con la mano "apuntando" (índice estirado) se traza una Z en el aire.
 * Seguimos la punta del índice mientras se mantiene esa forma, simplificamos el trazo a sus esquinas
 * (Ramer–Douglas–Peucker) y buscamos los tres trazos de la Z vistos DESDE LA PERSONA:
 *   1) hacia su derecha  2) diagonal hacia abajo y a su izquierda  3) hacia su derecha.
 * El video llega sin espejo, así que la x se invierte (1 − x) para trabajar desde su punto de vista.
 * Las medidas se escalan por el largo de la palma en la imagen (independiente de la distancia a la cámara).
 */

interface Pt {
  x: number;
  y: number;
  t: number;
}

const BUFFER_MS = 2200; // trazo máximo que se considera
const GAP_MS = 300; // si se pierde la forma más que esto, se reinicia el trazo
const MIN_POINTS = 8;

function rdp(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points;
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-9;
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
    if (d > maxD) [maxD, idx] = [d, i];
  }
  if (maxD <= eps) return [a, b];
  const left = rdp(points.slice(0, idx + 1), eps);
  const right = rdp(points.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

export class ZTracker {
  private pts: Pt[] = [];
  private lastPoseAt = -Infinity;
  private palm = 0.15; // largo de palma en unidades de imagen (se actualiza)
  /** Último trazo simplificado (para depuración en pantalla). */
  lastCorners: Array<{ x: number; y: number }> = [];

  /** Resumen para F3: puntos del trazo y esquinas encontradas. */
  get debugText(): string {
    return `trazo ${this.pts.length} pts · esquinas ${this.lastCorners.length}`;
  }

  reset(): void {
    this.pts = [];
    this.lastCorners = [];
  }

  /**
   * Agrega un cuadro. `pointing` = la mano tiene la forma de la Z (índice estirado, demás doblados).
   * Devuelve true en el cuadro en que se reconoce una Z completa.
   */
  push(landmarks: Landmark[] | null, pointing: boolean, now: number): boolean {
    if (!landmarks || !pointing) {
      if (now - this.lastPoseAt > GAP_MS) this.reset();
      return false;
    }
    this.lastPoseAt = now;
    const w = landmarks[LM.WRIST];
    const m = landmarks[LM.MIDDLE_MCP];
    this.palm = this.palm * 0.8 + Math.hypot(m.x - w.x, m.y - w.y) * 0.2;
    // Punto cargado al NUDILLO del índice (75 %) y no a la punta: al girar el dedo hacia la cámara la punta
    // se tapa y salta, mientras que el nudillo sigue el movimiento de la mano casi sin cambiar.
    const tip = landmarks[LM.INDEX_TIP];
    const knuckle = landmarks[LM.INDEX_MCP];
    const px = tip.x * 0.25 + knuckle.x * 0.75;
    const py = tip.y * 0.25 + knuckle.y * 0.75;
    this.pts.push({ x: 1 - px, y: py, t: now });
    while (this.pts.length && now - this.pts[0].t > BUFFER_MS) this.pts.shift();
    if (this.pts.length < MIN_POINTS) return false;
    if (this.detect()) {
      this.reset();
      return true;
    }
    return false;
  }

  private detect(): boolean {
    const P = this.palm || 0.15;
    const corners = rdp(this.pts, 0.18 * P);
    this.lastCorners = corners.map(({ x, y }) => ({ x, y }));
    // Busca 3 trazos consecutivos con la forma de la Z
    for (let i = 0; i + 3 < corners.length; i++) {
      const s = [0, 1, 2].map((k) => ({ dx: corners[i + k + 1].x - corners[i + k].x, dy: corners[i + k + 1].y - corners[i + k].y }));
      const len = s.map((v) => Math.hypot(v.dx, v.dy));
      // 1 y 3: hacia la derecha, casi horizontales
      const horizRight = (k: number) => s[k].dx > 0 && Math.abs(s[k].dy) < 0.65 * s[k].dx && len[k] >= 0.55 * P;
      // 2: diagonal hacia abajo (y crece hacia abajo) y a la izquierda
      const diag = s[1].dx < -0.3 * len[1] && s[1].dy > 0.35 * len[1] && len[1] >= 0.7 * P;
      if (horizRight(0) && diag && horizRight(2)) return true;
    }
    return false;
  }
}
