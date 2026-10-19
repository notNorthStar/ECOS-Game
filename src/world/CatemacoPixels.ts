/**
 * Base de pixel art del Nivel 3 (Catemaco). Sin Phaser ni DOM: la usa el juego (respaldo por código)
 * y tools/gen-catemaco-scenery.mjs (PNG a 1×). Solo colores de la paleta global de ART_SPEC §3,
 * alfa 0/255 y píxeles enteros.
 */

/** Paleta global (ART_SPEC §3), por rampas de oscuro a claro. */
export const C = {
  ink: '#120e1a', void: '#0a0f1a', deep: '#0f1826', night: '#152536', dusk: '#1c3340', teal0: '#26464c',
  fog0: '#365e5a', fog1: '#4f7c6e', fog2: '#77a08a', fog3: '#a8c4a8',
  mtn0: '#24394a', mtn1: '#33505a', mtn2: '#8aa4a8', mtn3: '#c8dcd8',
  st0: '#1e1c24', st1: '#2e2c34', st2: '#45434a', st3: '#625f62', st4: '#8a857e', st5: '#b3ab9c',
  te0: '#3a1a18', te1: '#6a2e24', te2: '#9a4630', te3: '#c46a40',
  wa0: '#7a3a1a', wa1: '#d0742c', wa2: '#f2a640', wa3: '#ffd77a', wa4: '#fff4cc',
  ro0: '#5a0a3a', ro1: '#a8125e', ro2: '#e8207e', ro3: '#ff6ab0',
  tq0: '#0a3a40', tq1: '#128a8a', tq2: '#2ad0c0', tq3: '#9af8e8',
  pu0: '#2a0a40', pu1: '#5a1890', pu2: '#9a3ae0', pu3: '#d89aff',
  fo0: '#0a1a14', fo1: '#14301f', fo2: '#22482c', fo3: '#36663a', fo4: '#5a8a46', fo5: '#9ab85a',
  ea0: '#1e120e', ea1: '#3a2418', ea2: '#5c3a24', ea3: '#8a5a34', ea4: '#b88a52',
  sk0: '#6a3a30', sk1: '#b4785a', sk2: '#e0a882', sk3: '#f6d0a8',
  sh0: '#9aa0bc', sh1: '#dcdff0',
  lg0: '#8aff6a', lg1: '#e8ffd0', rd0: '#c02030', rd1: '#ff5040', rd2: '#ffb0a0',
} as const;

/** Ruido determinista en [0, 1). */
export const hash = (x: number, y: number, seed = 0): number => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Ruido de valor suave 1D (siluetas de cerros, oleaje). */
export const noise1 = (x: number, seed = 0): number => {
  const i = Math.floor(x), f = smooth(x - i);
  return hash(i, 7, seed) * (1 - f) + hash(i + 1, 7, seed) * f;
};
/** Ruido de valor suave 2D. */
export const noise2 = (x: number, y: number, seed = 0): number => {
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Umbral de tramado ordenado 4×4 en [0, 1). */
export const bayer = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** Lo mínimo de un contexto 2D: el canvas del navegador y el Raster del generador lo cumplen. */
export interface PixelTarget {
  fillStyle: unknown;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Lienzo indexado: se dibuja en memoria y se vuelca con tramos horizontales (rápido en canvas).
 * Permite leer píxeles para contornos y transparencia real (borrar).
 */
export class Lienzo {
  private static colors: string[] = [''];
  private static index = new Map<string, number>();
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint8Array(w * h);
  }
  private static id(c: string): number {
    let i = Lienzo.index.get(c);
    if (i === undefined) {
      i = Lienzo.colors.length;
      Lienzo.colors.push(c);
      Lienzo.index.set(c, i);
    }
    return i;
  }
  set(c: string, x: number, y: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = Lienzo.id(c);
  }
  get(x: number, y: number): string | undefined {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return undefined;
    const i = this.px[y * this.w + x];
    return i ? Lienzo.colors[i] : undefined;
  }
  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.px[y * this.w + x] !== 0;
  }
  erase(x: number, y: number, w = 1, h = 1): void {
    for (let iy = Math.max(0, Math.round(y)); iy < Math.min(this.h, Math.round(y + h)); iy++)
      for (let ix = Math.max(0, Math.round(x)); ix < Math.min(this.w, Math.round(x + w)); ix++) this.px[iy * this.w + ix] = 0;
  }
  rect(c: string, x: number, y: number, w = 1, h = 1): void {
    const id = Lienzo.id(c);
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x) + Math.max(1, Math.round(w))), y1 = Math.min(this.h, Math.round(y) + Math.max(1, Math.round(h)));
    for (let iy = y0; iy < y1; iy++) this.px.fill(id, iy * this.w + x0, iy * this.w + Math.max(x0, x1));
  }
  /** Elipse rellena centrada en (cx, cy). */
  ellipse(c: string, cx: number, cy: number, rx: number, ry: number): void {
    if (rx <= 0 || ry <= 0) { this.set(c, cx, cy); return; }
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
      const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)));
      this.rect(c, Math.round(cx) - dx, y, dx * 2 + 1, 1);
    }
  }
  line(c: string, x0: number, y0: number, x1: number, y1: number, t = 1): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.rect(c, x0 + (x1 - x0) * i / n - (t - 1) / 2, y0 + (y1 - y0) * i / n - (t - 1) / 2, t, t);
  }
  /** Mezcla tramada de a → b con proporción t (0..1). */
  dither(a: string, b: string, x: number, y: number, w: number, h: number, t: number): void {
    for (let iy = Math.floor(y); iy < y + h; iy++) for (let ix = Math.floor(x); ix < x + w; ix++) this.set(bayer(ix, iy) < t ? b : a, ix, iy);
  }
  /** Solo pinta los píxeles cuyo umbral de tramado cae bajo t (velos, halos). */
  veil(c: string, x: number, y: number, t: number): void {
    if (bayer(Math.round(x), Math.round(y)) < t) this.set(c, x, y);
  }
  /** Contorno exterior de 1 px: el color lo decide el píxel vecino (contorno de color, no negro). */
  outline(colorFor: (inner: string) => string): void {
    const add: Array<[number, number, string]> = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.has(x, y)) continue;
      const n = this.get(x + 1, y) ?? this.get(x - 1, y) ?? this.get(x, y + 1) ?? this.get(x, y - 1);
      if (n) add.push([x, y, colorFor(n)]);
    }
    for (const [x, y, c] of add) this.set(c, x, y);
  }
  /** Copia otro lienzo encima (transparencia respetada). */
  stamp(src: Lienzo, ox: number, oy: number, flip = false): void {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c) this.set(c, ox + (flip ? src.w - 1 - x : x), oy + y);
    }
  }
  /** Vuelca al destino en tramos horizontales del mismo color. */
  blit(target: PixelTarget, ox = 0, oy = 0): void {
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const id = this.px[y * this.w + x];
        let end = x + 1;
        while (end < this.w && this.px[y * this.w + end] === id) end++;
        if (id) { target.fillStyle = Lienzo.colors[id]; target.fillRect(ox + x, oy + y, end - x, 1); }
        x = end;
      }
    }
  }
}

/** Oscurece un color a su contorno natural (rampa del material). */
const OUTLINE: Record<string, string> = {};
for (const ramp of [
  [C.sk0, C.sk1, C.sk2, C.sk3], [C.st1, C.st2, C.st3, C.st4, C.st5, C.sh0, C.sh1, C.wa4],
  [C.ea0, C.ea1, C.ea2, C.ea3, C.ea4], [C.te0, C.te1, C.te2, C.te3], [C.ro0, C.ro1, C.ro2, C.ro3],
  [C.fo1, C.fo2, C.fo3, C.fo4, C.fo5], [C.tq0, C.tq1, C.tq2, C.tq3], [C.pu0, C.pu1, C.pu2, C.pu3],
  [C.wa0, C.wa1, C.wa2, C.wa3], [C.rd0, C.rd1, C.rd2],
]) for (const c of ramp) OUTLINE[c] = ramp[0] === C.st1 ? C.st1 : ramp[0];
OUTLINE[C.sk0] = C.ea0; OUTLINE[C.ea0] = C.ink; OUTLINE[C.te0] = C.ea0; OUTLINE[C.ro0] = C.ink;
OUTLINE[C.st1] = C.st0; OUTLINE[C.pu0] = C.ink; OUTLINE[C.fo1] = C.fo0; OUTLINE[C.wa0] = C.ea0;
export const outlineOf = (c: string): string => OUTLINE[c] ?? C.st0;

/** Fuente 3×5 para letreros pequeños (solo mayúsculas que usamos). */
const MINI: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  I: '111010010010111', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111',
  Z: '111001010100111', H: '101101111101101', G: '011100101101011', F: '111100110100100', Y: '101101010010010',
};
export function miniText(g: Lienzo, c: string, text: string, x: number, y: number): void {
  for (const ch of text) {
    const m = MINI[ch];
    if (m) for (let i = 0; i < 15; i++) if (m[i] === '1') g.set(c, x + (i % 3), y + Math.floor(i / 3));
    x += 4;
  }
}

/** Letras grandes 5×7 para las letras turísticas. */
export const BIG: Record<string, string[]> = {
  C: ['01111', '11000', '11000', '11000', '11000', '11000', '01111'],
  A: ['01110', '11011', '11011', '11111', '11011', '11011', '11011'],
  T: ['11111', '11111', '01110', '01110', '01110', '01110', '01110'],
  E: ['11111', '11000', '11000', '11110', '11000', '11000', '11111'],
  M: ['10001', '11011', '11111', '11111', '10101', '10001', '10001'],
  O: ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
};
