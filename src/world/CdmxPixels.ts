/**
 * Base de pixel art del Nivel 6 (CDMX parte 1). Reutiliza el lienzo indexado, el ruido, la paleta y
 * los patrones del Nivel 4 (OaxacaPixels) y agrega lo propio de la CDMX en ruinas: letras grandes
 * con D, flores de cempasúchil, calaveritas de azúcar, papel picado, ventanas de rascacielos y
 * concreto agrietado. Sin Phaser ni DOM: la usan el juego (respaldo por código) y
 * tools/gen-cdmx-scenery.mjs (PNG a 1×). Solo paleta ART_SPEC §3.
 */
import { BIG_OAX, C, Lienzo, bayer, dust, frisoGreca, hash, miniText, noise1, noise2, outlineOf, patronOn, ramp } from './OaxacaPixels';

export { C, Lienzo, bayer, dust, frisoGreca, hash, miniText, noise1, noise2, outlineOf, patronOn, ramp };

/** Letras grandes 5×7 para las letras turísticas CDMX (agrega la D). */
export const BIG_CDMX: Record<string, string[]> = {
  ...BIG_OAX,
  D: ['11110', '11011', '11011', '11011', '11011', '11011', '11110'],
};

/** Colores del papel picado y de los neones. */
export const PAPEL = [C.ro2, C.tq2, C.wa2, C.pu2, C.fo4, C.ro3] as const;
export const NEON = [C.ro2, C.tq2, C.pu2, C.wa2] as const;

/** Flor de cempasúchil (r = 1..3): pétalos en dos naranjas con centro oscuro. */
export function cempasuchil(g: Lienzo, x: number, y: number, r = 2, seed = 0): void {
  if (r <= 1) { g.set(C.wa2, x, y); g.set(C.wa1, x + 1, y); g.set(C.wa3, x, y - 1); return; }
  g.ellipse(C.wa1, x, y, r, r);
  for (let k = 0; k < r * 5; k++) {
    const a = hash(k, 1, seed + x) * Math.PI * 2, d = hash(k, 2, seed + y) * r;
    g.set(hash(k, 3, seed) > 0.4 ? C.wa2 : C.wa3, x + Math.cos(a) * d, y + Math.sin(a) * d - 0.5);
  }
  g.set(C.wa0, x, y + 1);
  if (r >= 3) g.set(C.wa3, x - 1, y - 2);
}

/** Montón de cempasúchil: varias flores con hojas, a lo ancho (`w`). */
export function cempasuchilMata(g: Lienzo, x: number, base: number, w: number, seed: number): void {
  for (let k = 0; k < w / 2; k++) g.line(C.fo2, x + hash(k, 1, seed) * w, base, x + hash(k, 2, seed) * w, base - 3 - hash(k, 3, seed) * 4);
  for (let k = 0; k < Math.max(2, w / 4); k++) {
    cempasuchil(g, x + 2 + hash(k, 4, seed) * (w - 4), base - 4 - hash(k, 5, seed) * 5, 1 + Math.round(hash(k, 6, seed) * 2), seed + k);
  }
}

/** Calaverita de azúcar de 7×7 (sobre fondo). `col` = color de los adornos. */
export function calaverita(g: Lienzo, x: number, y: number, col: string = C.ro2, alt: string = C.tq2): void {
  g.ellipse(C.sh1, x + 3, y + 3, 3, 3); g.rect(C.sh1, x + 1, y + 5, 5, 2);
  g.rect(C.sh0, x, y + 3, 1, 2); g.rect(C.sh0, x + 1, y + 6, 5, 1);
  g.rect(col, x + 1, y + 2, 2, 2); g.rect(col, x + 4, y + 2, 2, 2); // ojos de flor
  g.set(alt, x + 1, y + 2); g.set(alt, x + 5, y + 2);
  g.set(C.ink, x + 3, y + 4);
  g.set(C.st3, x + 2, y + 6); g.set(C.st3, x + 4, y + 6);
  g.set(C.wa2, x + 3, y);
}

/** Tira de papel picado estática (fondos): cuerda con banderitas caladas. */
export function papelEstatico(g: Lienzo, x0: number, x1: number, y: number, sag: number, seed: number, size = 7, dark = false): void {
  for (let x = Math.floor(x0); x <= x1; x++) g.set(C.ink, x, y + Math.sin((x - x0) / (x1 - x0) * Math.PI) * sag);
  for (let x = x0 + 3, k = 0; x < x1 - size; x += size + 2, k++) {
    if (hash(k, 1, seed) < 0.18) continue; // banderitas que se cayeron
    const yy = Math.round(y + Math.sin((x + size / 2 - x0) / (x1 - x0) * Math.PI) * sag) + 1;
    const c = dark ? [C.ro0, C.pu0, C.tq0, C.te0][k % 4] : PAPEL[(k + seed) % PAPEL.length];
    const h = Math.round(size * 1.2);
    for (let py = 0; py < h; py++) for (let px = 0; px < size; px++) {
      if (py === Math.floor(h / 2) && px % 3 === 1) continue; // calado
      if (py === h - 1 && px % 2 === 1) continue; // orilla en picos
      g.set(c, x + px, yy + py);
    }
  }
}

/** Concreto con grietas y manchas (muros de rascacielos, losas). */
export function concreto(g: Lienzo, x: number, y: number, w: number, h: number, base: string, dark: string, hi: string, seed: number): void {
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const n = noise2((x + px) * 0.12, (y + py) * 0.12, seed);
    g.set(n > 0.72 ? hi : n < 0.25 ? dark : base, x + px, y + py);
  }
}

/** Grieta que baja serpenteando desde (x, y). */
export function grieta(g: Lienzo, x: number, y: number, len: number, c: string, seed: number, dir = 0): void {
  let px = x, py = y;
  for (let s = 0; s < len; s++) {
    px += (hash(s, 1, seed) - 0.5) * 2.4 + dir * 0.5; py += 1;
    g.set(c, px, py);
    if (hash(s, 2, seed) > 0.86) g.set(c, px + 1, py);
  }
}

/** Halo tramado sobre lo ya pintado (luz de velas, neones). */
export function halo(g: Lienzo, cx: number, cy: number, rx: number, ry: number, c: string, k: number, onlyPainted = true): void {
  for (let y = Math.floor(cy - ry); y < cy + ry; y++) for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d < 1 && (!onlyPainted || g.has(x, y))) g.veil(c, x, y, (1 - d) * k);
  }
}

/** Ventana ciega/encendida de rascacielos. */
export function ventanal(g: Lienzo, x: number, y: number, w: number, h: number, seed: number, litChance: number, frame: string): void {
  const r = hash(x, y, seed);
  const c = r < litChance * 0.25 ? C.wa2 : r < litChance ? C.wa0 : r < litChance + 0.12 ? C.tq0 : C.ink;
  g.rect(c, x, y, w, h);
  if (c === C.wa2) g.set(C.wa3, x, y);
  if (hash(x, y, seed + 1) > 0.8) g.set(frame, x + w - 1, y + h - 1); // vidrio roto
}
