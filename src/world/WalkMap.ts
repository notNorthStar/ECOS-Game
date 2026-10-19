import type { LevelData } from '../core/contracts';
import { WORLD } from '../config/movement';

/** Obstáculo en el plano del suelo. */
export type Obstacle =
  | { shape: 'ellipse'; x: number; y: number; rx: number; ry: number }
  | { shape: 'rect'; x: number; y: number; w: number; h: number };

/**
 * Colisiones en el plano del suelo (AGENTS.md §3): áreas transitables = unión de polígonos;
 * obstáculos elípticos o rectangulares. Un actor es una elipse de rx = radius, ry = radius / 2.
 */
export class WalkMap {
  readonly polys: number[][][];
  readonly obstacles: Obstacle[];
  /** Límites horizontales extra (arena). */
  minX = -Infinity;
  maxX = Infinity;

  constructor(level: LevelData, extraObstacles: Obstacle[] = []) {
    this.polys = level.walk.filter((p) => p.length >= 3);
    this.obstacles = [...level.obstacles, ...extraObstacles];
  }

  /** Punto dentro de algún polígono transitable. */
  inWalk(x: number, y: number): boolean {
    if (this.polys.length === 0) return true;
    for (const p of this.polys) if (pointInPoly(x, y, p)) return true;
    return false;
  }

  /** Punto dentro de algún obstáculo, inflado por el radio del actor. */
  inObstacle(x: number, y: number, radius = 0): boolean {
    const rr = radius / 2;
    for (const o of this.obstacles) {
      if (o.shape === 'ellipse') {
        const ex = (x - o.x) / (o.rx + radius);
        const ey = (y - o.y) / (o.ry + rr);
        if (ex * ex + ey * ey < 1) return true;
      } else if (x > o.x - radius && x < o.x + o.w + radius && y > o.y - rr && y < o.y + o.h + rr) {
        return true;
      }
    }
    return false;
  }

  isWalkable(x: number, y: number, radius = 0): boolean {
    if (x < this.minX + radius || x > this.maxX - radius) return false;
    if (this.inObstacle(x, y, radius)) return false;
    if (radius <= 0) return this.inWalk(x, y);
    // La elipse de los pies debe quedar dentro de la unión de polígonos (4 extremos + centro).
    const ry = radius / 2;
    return (
      this.inWalk(x, y) &&
      this.inWalk(x - radius, y) &&
      this.inWalk(x + radius, y) &&
      this.inWalk(x, y - ry) &&
      this.inWalk(x, y + ry)
    );
  }

  /**
   * Mueve con deslizamiento: prueba el eje x y el eje y por separado (como Worlorn) y, si un eje
   * choca, intenta rodear el obstáculo con un pequeño empuje en el otro eje.
   */
  moveActor(a: { x: number; y: number; radius: number }, dx: number, dy: number): void {
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.max(1, Math.ceil(dist / WORLD.maxStep));
    const sx = dx / steps;
    const sy = dy / steps;
    const r = a.radius;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0) {
        if (this.isWalkable(a.x + sx, a.y, r)) a.x += sx;
        else if (sy === 0) {
          // Rodear: probar arriba o abajo un poco (deslizar sobre elipses).
          const n = Math.abs(sx) * 0.75;
          if (this.isWalkable(a.x + sx, a.y - n, r)) {
            a.x += sx;
            a.y -= n;
          } else if (this.isWalkable(a.x + sx, a.y + n, r)) {
            a.x += sx;
            a.y += n;
          }
        }
      }
      if (sy !== 0) {
        if (this.isWalkable(a.x, a.y + sy, r)) a.y += sy;
        else if (sx === 0) {
          const n = Math.abs(sy) * 1.2;
          if (this.isWalkable(a.x - n, a.y + sy, r)) {
            a.x -= n;
            a.y += sy;
          } else if (this.isWalkable(a.x + n, a.y + sy, r)) {
            a.x += n;
            a.y += sy;
          }
        }
      }
    }
  }

  randomPointNear(x: number, y: number, r: number, radius = 6): { x: number; y: number } {
    for (let i = 0; i < 24; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      const px = x + Math.cos(ang) * d;
      const py = y + Math.sin(ang) * d * 0.5;
      if (this.isWalkable(px, py, radius)) return { x: px, y: py };
    }
    return this.isWalkable(x, y, radius) ? { x, y } : this.nearestWalkable(x, y, radius);
  }

  /** Busca en espiral el punto transitable más cercano (para reapariciones mal colocadas). */
  nearestWalkable(x: number, y: number, radius = 6): { x: number; y: number } {
    if (this.isWalkable(x, y, radius)) return { x, y };
    for (let d = 4; d < 400; d += 4) {
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(ang) * d;
        const py = y + Math.sin(ang) * d * 0.5;
        if (this.isWalkable(px, py, radius)) return { x: px, y: py };
      }
    }
    return { x, y };
  }
}

/** Par-impar (ray casting). */
export function pointInPoly(x: number, y: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
