/**
 * Base de pixel art del Nivel 4 (Oaxaca). Reutiliza el lienzo indexado, el ruido y la paleta del
 * Nivel 3 (CatemacoPixels) y agrega lo propio de Oaxaca: letras grandes con X, patrones textiles
 * geométricos (grecas escalonadas, rombos, zigzag) y colores de muro. Sin Phaser ni DOM: la usa el
 * juego (respaldo por código) y tools/gen-oaxaca-scenery.mjs (PNG a 1×). Solo paleta ART_SPEC §3.
 */
import { BIG, C, Lienzo, bayer, hash, miniText, noise1, noise2, outlineOf } from './CatemacoPixels';

export { C, Lienzo, bayer, hash, miniText, noise1, noise2, outlineOf };

/** Letras grandes 5×7 para las letras turísticas OAXACA (agrega la X). */
export const BIG_OAX: Record<string, string[]> = {
  ...BIG,
  X: ['11011', '11011', '01110', '01110', '01110', '11011', '11011'],
};

/** Rampas de muro de las casas coloniales: [muro, sombra, luz]. */
export const MUROS: ReadonlyArray<readonly [string, string, string]> = [
  [C.ro1, C.ro0, C.ro2], // rosa mexicano
  [C.mtn0, C.night, C.mtn1], // añil apagado
  [C.ea3, C.ea2, C.ea4], // amarillo ocre
  [C.fo3, C.fo2, C.fo4], // verde
  [C.te2, C.te1, C.te3], // terracota
  [C.tq1, C.tq0, C.tq2], // turquesa
  [C.wa1, C.wa0, C.wa2], // naranja de cal
];

/**
 * Patrones textiles geométricos (inspirados en las grecas escalonadas de Mitla y en rombos de telar;
 * dibujo propio, sin copiar diseños de autor). Cada patrón es una baldosa de 1 y 0.
 */
const TILES: Record<'greca' | 'rombo' | 'zigzag' | 'estrella' | 'escalon', string[]> = {
  // Greca escalonada (xicalcoliuhqui simplificado): gancho en espiral cuadrada.
  greca: ['11111110', '00000010', '01111010', '01000010', '01011110', '01000000', '01111111', '00000000'],
  // Rombos concéntricos.
  rombo: ['00010000', '00101000', '01010100', '10101010', '01010100', '00101000', '00010000', '00000000'],
  zigzag: ['10000001', '01000010', '00100100', '00011000', '00000000', '00000000'],
  // Estrella de ocho puntas de telar.
  estrella: ['0001000', '0011100', '1111111', '0110110', '1111111', '0011100', '0001000'],
  escalon: ['1100', '1110', '0111', '0011'],
};
export type Patron = keyof typeof TILES;
export const PATRONES = Object.keys(TILES) as Patron[];

/** ¿El patrón está "encendido" en (x, y)? (coordenadas locales del tejido). */
export function patronOn(kind: Patron, x: number, y: number): boolean {
  const t = TILES[kind];
  const row = t[((y % t.length) + t.length) % t.length];
  return row[((x % row.length) + row.length) % row.length] === '1';
}

/**
 * Rellena un rectángulo con un tejido: fondo, banda de patrón y franjas. `wear` (0..1) quita hilos
 * para que se vea viejo/roto.
 */
export function tejido(g: Lienzo, x: number, y: number, w: number, h: number, kind: Patron, fondo: string, hilo: string, franja: string, wear = 0, seed = 0): void {
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (wear > 0 && hash(px + x, py + y, seed + 70) < wear * (py / h)) continue;
    let c = fondo;
    const band = py % 14;
    if (band < 2) c = franja;
    else if (band >= 3 && band < 11 && patronOn(kind, px, band - 3)) c = hilo;
    else if (band === 12 && (px + seed) % 4 < 2) c = franja;
    g.set(c, x + px, y + py);
  }
}

/** Banda horizontal de greca (frisos de cantera, murales, bordes de huipil). */
export function frisoGreca(g: Lienzo, x: number, y: number, w: number, c: string, kind: Patron = 'greca'): void {
  for (let py = 0; py < 8; py++) for (let px = 0; px < w; px++) if (patronOn(kind, px, py)) g.set(c, x + px, y + py);
}

/** Banda de ladrillo de adobe expuesto (muros semidestruidos). */
export function adobe(g: Lienzo, x: number, y: number, w: number, h: number, seed: number): void {
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const row = Math.floor(py / 4), off = row % 2 ? 4 : 0;
    const joint = py % 4 === 3 || (px + off) % 9 === 8;
    const c = joint ? C.te0 : hash(Math.floor((px + off) / 9), row, seed) > 0.6 ? C.te2 : C.te1;
    g.set(c, x + px, y + py);
  }
}

/** Contorno de lienzo con mezcla de tonos (útil para siluetas en el fondo). */
export function dust(g: Lienzo, x0: number, x1: number, y0: number, y1: number, c: string, k: number, seed: number): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (noise2(x * 0.02, y * 0.15, seed) > 0.58) g.veil(c, x, y, k);
  }
}

/** Degradado vertical tramado (cielos). */
export function ramp(g: Lienzo, colors: string[], y0: number, y1: number, w: number, yMax = g.h): void {
  for (let y = 0; y < yMax; y++) {
    const t = Math.max(0, Math.min(0.9999, (y - y0) / (y1 - y0))) * (colors.length - 1);
    const i = Math.floor(t), f = t - i;
    for (let x = 0; x < w; x++) g.set(bayer(x, y) < f ? colors[Math.min(i + 1, colors.length - 1)] : colors[i], x, y);
  }
}
