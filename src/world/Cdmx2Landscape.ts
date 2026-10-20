/**
 * Paisaje del Nivel 7 (CDMX parte 2): tormenta nocturna sobre la CDMX vista desde lo alto.
 * - teleferico: la cabina es la arena fija (capa 4 = interior con ventanas transparentes). Las
 *   capas 0–3 son MÁS ALTAS y MÁS ANCHAS que la pantalla: Cdmx2Scenery las desplaza hacia abajo y a
 *   la izquierda según el avance del teleférico (la ciudad se hunde mientras la cabina sube).
 * - torre: pasillo de la torre de control (capa 4 = interior con ventanales, consolas y pantallas).
 * - salon_trono: salón del trono del Rey del Olvido (columnas, vitrales con recuerdos borrosos,
 *   espejo negro de la Cofradía, suelo de piedra con una película de agua).
 * Sin Phaser ni DOM (lo usa también tools/gen-cdmx2-scenery.mjs). Solo paleta ART_SPEC §3.
 */
import { C, Lienzo, bayer, concreto, frisoGreca, grieta, halo, hash, miniText, noise1, noise2, ramp } from './CdmxPixels';

export type Cdmx2Section = 'teleferico' | 'torre' | 'salon_trono';
export const CDMX2_BG_PREFIX: Record<Cdmx2Section, string> = {
  teleferico: 'fondo_teleferico', torre: 'fondo_torre', salon_trono: 'fondo_salon_trono',
};
export const CDMX2_SECTION_WIDTH: Record<Cdmx2Section, number> = { teleferico: 800, torre: 2600, salon_trono: 1800 };

const FACTORS = [0.04, 0.15, 0.4, 0.65, 1, 1.25] as const; // = PARALLAX_FACTORS de src/config/game.ts

/** Teleférico: alto extra (subida, px) y ancho extra (deriva diagonal, px) de cada capa exterior. */
export const CABLECAR_RISE = [60, 140, 260, 360, 0, 0] as const;
export const CABLECAR_DRIFT = [0, 40, 160, 300, 0, 0] as const;

/** Tamaño de una capa. En el teleférico las capas 0–3 son más grandes que la pantalla. */
export function cdmx2LayerSize(section: Cdmx2Section, index: number, levelWidth: number = CDMX2_SECTION_WIDTH[section]): { w: number; h: number } {
  const w = Math.ceil(640 + (levelWidth - 640) * FACTORS[index]);
  if (section === 'teleferico') return { w: w + CABLECAR_DRIFT[index], h: 360 + CABLECAR_RISE[index] };
  return { w, h: 360 };
}

/* ============================ DISPOSICIÓN (mundo) ============================ */

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Screen extends Rect { kind: 'estatica' | 'datos' | 'alerta' | 'mapa' }
export interface Vitral extends Rect { motif: 'agua' | 'mujer' | 'ninos' | 'manos' | 'luna'; tint: string }
export interface Lamp { x: number; y: number; tint: string; kind: 'techo' | 'alerta' | 'brasero' | 'vitral' }

/** Interior de la cabina (coordenadas del mundo; capa 4, factor 1). */
export const CABIN = {
  ceil: 30, bar: 33, winTop: 44, winBot: 184, wallBot: 214, floorBot: 345,
  doors: [{ side: 'izq' as const, x0: 26, x1: 98 }, { side: 'der' as const, x0: 702, x1: 774 }],
  doorTop: 40,
  panes: [0, 1, 2, 3].map(i => ({ x0: 112 + i * 147, x1: 112 + i * 147 + 135 })),
};

/** Bahías de la torre de control: cada 200 px, columna estructural de 24 px entre ellas. */
export type BayKind = 'ventanal' | 'roto' | 'monitores' | 'consolas' | 'altar' | 'alerta' | 'puerta';
export const TORRE_BAYS: readonly BayKind[] = ['ventanal', 'monitores', 'roto', 'ventanal', 'consolas', 'ventanal', 'altar', 'roto', 'monitores', 'ventanal', 'roto', 'alerta', 'puerta'];
const BAY = 200;

/** Bahías del salón del trono: columnas cada 200 px desde x = 100. */
export type HallBay = 'arco' | 'trono' | Vitral['motif'];
export const SALON_BAYS: readonly HallBay[] = ['arco', 'agua', 'arco', 'mujer', 'ninos', 'manos', 'trono', 'luna'];
const HALL_X0 = 100;
const VITRAL_TINT: Record<Vitral['motif'], string> = { agua: C.tq2, mujer: C.pu2, ninos: C.wa2, manos: C.ro2, luna: C.mtn3 };

/** Puntos de referencia del mundo (x del suelo, y en la franja 220…345). El JSON del nivel manda. */
export const CDMX2_LANDMARKS = {
  teleferico: {
    /** Puertas laterales de la cabina: por aquí abordan los encapuchados (aparecer en y≈226). */
    puertaIzq: { x: 62, y: 226 },
    puertaDer: { x: 738, y: 226 },
    /** Centro de la arena (la cabina completa: x 20…780). */
    centro: { x: 400, y: 286 },
    arena: { x0: 20, x1: 780 },
  },
  torre: {
    entrada: { x: 70, y: 280 },
    /** Muro de monitores con estática (bahías 1 y 8). */
    monitores: { x0: 212, x1: 388 },
    /** Ventanales rotos (lluvia y charcos en el suelo). */
    rotos: [500, 1500, 2100],
    /** Alcoba tranquila sugerida para checkpoint + Altar de la Memoria. */
    altar: { x: 1300, y: 250 },
    /** Gran consola con el mapa de la línea del teleférico. */
    consola: { x: 900, y: 236 },
    /** Compuerta al salón del trono (salida de la sección). */
    puertaSalon: { x: 2500, y: 228 },
  },
  salon_trono: {
    entrada: { x: 60, y: 280 },
    /** Centro sugerido de la arena del Rey del Olvido. */
    arena: { x: 1050, y: 290 },
    /** Trono (prop_n07_trono) frente al espejo negro de la Cofradía. */
    trono: { x: 1400, y: 236 },
    /** Consola de la falsa llamada (prop_n07_consola_llamada), al fondo a la derecha. */
    consola: { x: 1720, y: 246 },
  },
} as const;

/** Ventanas (mundo) por donde se ve la tormenta: lluvia detrás del vidrio y gotas sobre él. */
export function cdmx2Windows(section: Cdmx2Section): Array<Rect & { broken?: boolean }> {
  if (section === 'teleferico') return CABIN.panes.map(p => ({ x0: p.x0, y0: CABIN.winTop, x1: p.x1, y1: CABIN.winBot }));
  if (section === 'torre') {
    const out: Array<Rect & { broken?: boolean }> = [];
    TORRE_BAYS.forEach((k, i) => {
      if (k !== 'ventanal' && k !== 'roto' && k !== 'altar') return;
      const x0 = i * BAY + 12, x1 = (i + 1) * BAY - 12;
      out.push({ x0: x0 + 6, y0: 40, x1: x1 - 6, y1: 166, broken: k === 'roto' });
    });
    return out;
  }
  // Salón: huecos del techo roto y la parte alta de los arcos.
  const out: Array<Rect & { broken?: boolean }> = [];
  SALON_BAYS.forEach((k, i) => {
    if (k !== 'arco') return;
    const x0 = HALL_X0 + i * BAY + 22, x1 = HALL_X0 + (i + 1) * BAY - 22;
    out.push({ x0: x0 + 10, y0: 0, x1: x1 - 10, y1: 30, broken: true });
  });
  return out;
}

/** Pantallas de la torre (mundo) que el decorado hace parpadear con estática. */
export function cdmx2Screens(section: Cdmx2Section): Screen[] {
  if (section !== 'torre') return [];
  const out: Screen[] = [];
  TORRE_BAYS.forEach((k, i) => {
    const x0 = i * BAY + 12, x1 = (i + 1) * BAY - 12;
    if (k === 'monitores' || k === 'alerta') {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const sx = x0 + 10 + c * 40, sy = 46 + r * 34;
        const kind: Screen['kind'] = k === 'alerta' ? (hash(c, r, i) > 0.3 ? 'alerta' : 'estatica') : hash(c, r, i) > 0.55 ? 'datos' : 'estatica';
        out.push({ x0: sx, y0: sy, x1: sx + 34, y1: sy + 26, kind });
      }
    } else if (k === 'consolas') {
      out.push({ x0: x0 + 30, y0: 50, x1: x1 - 30, y1: 140, kind: 'mapa' });
    }
    if (k === 'ventanal' || k === 'roto' || k === 'consolas' || k === 'monitores' || k === 'alerta') {
      out.push({ x0: x0 + 24, y0: 180, x1: x0 + 46, y1: 192, kind: hash(i, 9) > 0.5 ? 'datos' : 'estatica' });
      out.push({ x0: x1 - 50, y0: 180, x1: x1 - 28, y1: 192, kind: k === 'alerta' ? 'alerta' : 'estatica' });
    }
  });
  return out;
}

/** Vitrales del salón (mundo). */
export function cdmx2Vitrales(section: Cdmx2Section): Vitral[] {
  if (section !== 'salon_trono') return [];
  const out: Vitral[] = [];
  SALON_BAYS.forEach((k, i) => {
    if (k === 'arco' || k === 'trono') return;
    const x0 = HALL_X0 + i * BAY + 22 + 30, x1 = HALL_X0 + (i + 1) * BAY - 22 - 30;
    out.push({ x0, y0: 40, x1, y1: 176, motif: k, tint: VITRAL_TINT[k] });
  });
  return out;
}

/** Lámparas pintadas (mundo) para los halos del decorado. */
export function cdmx2Lamps(section: Cdmx2Section): Lamp[] {
  if (section === 'teleferico') {
    const out: Lamp[] = [];
    for (let x = 130; x < 680; x += 92) out.push({ x: x + 20, y: 20, tint: C.wa3, kind: 'techo' });
    for (const d of CABIN.doors) out.push({ x: (d.x0 + d.x1) / 2, y: 30, tint: C.rd1, kind: 'alerta' });
    return out;
  }
  if (section === 'torre') {
    const out: Lamp[] = [];
    TORRE_BAYS.forEach((k, i) => {
      out.push({ x: i * BAY + 100, y: 18, tint: k === 'alerta' || k === 'puerta' ? C.rd1 : C.tq2, kind: k === 'alerta' || k === 'puerta' ? 'alerta' : 'techo' });
    });
    return out;
  }
  const out: Lamp[] = [];
  for (const v of cdmx2Vitrales(section)) out.push({ x: (v.x0 + v.x1) / 2, y: (v.y0 + v.y1) / 2, tint: v.tint, kind: 'vitral' });
  out.push({ x: hallBayX(6) + 100, y: 92, tint: C.pu2, kind: 'vitral' }); // espejo negro
  return out;
}

const hallBayX = (i: number): number => HALL_X0 + i * BAY;

/* ============================ AYUDAS DE DIBUJO ============================ */

const fbm = (x: number, y: number, seed: number): number =>
  noise2(x, y, seed) * 0.55 + noise2(x * 2.1, y * 2.1, seed + 1) * 0.3 + noise2(x * 4.3, y * 4.3, seed + 2) * 0.15;

/**
 * Nubarrones de tormenta: masas oscuras con el borde de abajo teñido (luz de la ciudad o rayos).
 * `soft` (0..1): las orillas se traman para que se vea a través (jirones cercanos).
 */
function nubarrones(g: Lienzo, w: number, y0: number, y1: number, seed: number, o: { th: number; sx: number; sy: number; body: [string, string, string]; rim: string; top?: string; soft?: number }): void {
  const ya = Math.max(0, y0) - 4, yb = Math.min(g.h, y1) + 4, rows = yb - ya;
  if (rows <= 8) return;
  // Densidad precalculada (una sola evaluación de ruido por píxel).
  const dens = new Float32Array(w * rows);
  for (let r = 0; r < rows; r++) {
    const y = ya + r, env = Math.sin(Math.max(0, Math.min(1, (y - y0) / (y1 - y0))) * Math.PI) * 0.12 - 0.06 - o.th;
    for (let x = 0; x < w; x++) dens[r * w + x] = fbm(x * o.sx, y * o.sy, seed) + env;
  }
  const at = (x: number, y: number) => dens[(y - ya) * w + x];
  for (let y = ya + 4; y < yb - 4; y++) for (let x = 0; x < w; x++) {
    const k = at(x, y);
    if (k <= 0) { if (k > -0.025 && !o.soft) g.veil(o.body[0], x, y, 0.4); continue; }
    if (o.soft && k < 0.08 && bayer(x, y) > k / 0.08 * (1 - o.soft) + o.soft * 0.5) continue;
    let c = k > 0.16 ? o.body[2] : k > 0.06 ? o.body[1] : o.body[0];
    if (at(x, y + 4) <= 0 && k < 0.1) c = bayer(x, y) < 0.6 ? o.rim : c;
    else if (o.top && at(x, y - 3) <= 0 && k < 0.08 && bayer(x, y) < 0.5) c = o.top;
    g.set(c, x, y);
  }
}

/** Velo de lluvia estático (trazos diagonales finos). */
function lluviaVelo(g: Lienzo, w: number, y0: number, y1: number, c: string, count: number, seed: number, len = 6): void {
  for (let i = 0; i < count; i++) {
    const x = hash(i, 1, seed) * w, y = y0 + hash(i, 2, seed) * (y1 - y0);
    for (let k = 0; k < len; k++) if (bayer(Math.round(x - k * 0.35), Math.round(y + k)) < 0.7) g.set(c, x - k * 0.35, y + k);
  }
}

/** Cielo de tormenta completo. `glow`: resplandor de relámpagos lejanos dentro de las nubes. */
function cieloTormenta(g: Lienzo, w: number, h: number, seed: number, sick = false): void {
  ramp(g, sick ? [C.ink, C.pu0, C.void, C.pu0, C.deep, C.night] : [C.ink, C.void, C.deep, C.pu0, C.night, C.dusk], 0, h, w);
  // Relámpagos lejanos atrapados en las nubes (manchas lilas).
  for (let k = 0; k < Math.max(2, w / 220); k++) {
    const cx = hash(k, 1, seed) * w, cy = h * (0.25 + hash(k, 2, seed) * 0.4), r = 40 + hash(k, 3, seed) * 50;
    for (let y = Math.floor(cy - r); y < cy + r; y++) for (let x = Math.floor(cx - r * 1.6); x < cx + r * 1.6; x++) {
      const d = Math.hypot((x - cx) / 1.6, y - cy) / r;
      if (d < 1) g.veil(d < 0.4 ? C.pu1 : C.pu0, x, y, (1 - d) * 0.7);
    }
  }
  nubarrones(g, w, -20, h * 0.55, seed + 3, { th: 0.5, sx: 0.011, sy: 0.03, body: [C.night, C.deep, C.void], rim: C.pu0, top: C.mtn0 });
  nubarrones(g, w, h * 0.3, h * 1.05, seed + 7, { th: 0.52, sx: 0.009, sy: 0.026, body: [C.deep, C.void, C.ink], rim: sick ? C.pu1 : C.te0, top: C.night });
  if (sick) {
    // Remolino enfermizo sobre el salón: espiral morada del Rey del Olvido.
    const cx = w * 0.62, cy = h * 0.22;
    for (let y = 0; y < h * 0.6; y++) for (let x = Math.floor(cx - 220); x < cx + 220; x++) {
      const dx = x - cx, dy = (y - cy) * 2, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (r > 210) continue;
      const s = Math.sin(a * 3 + r * 0.045);
      if (s > 0.55) g.veil(r < 60 ? C.pu2 : C.pu1, x, y, (1 - r / 210) * 0.6);
    }
  }
  stars(g, w, h, seed);
  lluviaVelo(g, w, 0, h, C.night, w * h / 260, seed + 11, 7);
}

function stars(g: Lienzo, w: number, h: number, seed: number): void {
  // Casi no hay estrellas: algún claro entre las nubes.
  for (let i = 0; i < w / 18; i++) {
    const x = hash(i, 1, seed) * w, y = hash(i, 2, seed) * h * 0.4;
    if (g.get(Math.round(x), Math.round(y)) === C.void || g.get(Math.round(x), Math.round(y)) === C.ink) g.set(hash(i, 3, seed) > 0.8 ? C.sh0 : C.mtn1, x, y);
  }
}

/** Sierras y volcanes en silueta (borde del Valle de México). */
function sierra(g: Lienzo, w: number, base: number, seed: number, dark: string, mid: string, volcanes = true): void {
  for (let x = 0; x < w; x++) {
    const top = base - 8 - noise1(x * 0.02, seed) * 16 - noise1(x * 0.08, seed + 1) * 5;
    for (let y = Math.floor(top); y <= base; y++) g.set(y < top + 2 ? mid : dark, x, y);
  }
  if (!volcanes) return;
  // Dos volcanes nevados a lo lejos (silueta genérica, sin detalle).
  for (const [cxf, hh, ww, flat] of [[0.72, 46, 130, false], [0.86, 34, 160, true]] as const) {
    const cx = Math.round(w * cxf);
    for (let x = cx - ww; x < cx + ww; x++) {
      const t = Math.abs(x - cx) / ww, top = base - hh * (1 - t) ** (flat ? 1.3 : 1.7) - (flat ? Math.sin(t * 9) * 2 : 0);
      for (let y = Math.floor(top); y < base - 6; y++) {
        const snow = y < top + 6 + noise1(x * 0.3, seed + cx) * 5 && t < 0.55;
        g.set(snow ? (x < cx ? C.mtn2 : C.mtn1) : y < top + 2 ? mid : dark, x, y);
      }
    }
  }
}

/**
 * Luces de la ciudad vista desde arriba: rejilla de calles en perspectiva (más densas en el
 * horizonte), avenidas que convergen y zonas apagadas (el olvido se come barrios enteros).
 */
function ciudadLuces(g: Lienzo, w: number, y0: number, y1: number, seed: number, near = 1): void {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    for (let x = 0; x < w; x++) g.set(bayer(x, y) < 0.3 + t * 0.4 ? C.void : C.deep, x, y);
  }
  // Bruma de luz cálida sobre el horizonte.
  for (let y = y0; y < y0 + 10; y++) for (let x = 0; x < w; x++) g.veil(C.te0, x, y, (1 - (y - y0) / 10) * 0.35 * (0.4 + noise1(x * 0.02, seed)));
  // Avenidas: rectas que salen de un punto de fuga sobre el horizonte.
  const vx = w * 0.45, vy = y0 - 40;
  for (let a = 0; a < 9; a++) {
    const ex = -w * 0.6 + a * w * 0.28 + hash(a, 1, seed) * 60;
    for (let s = 0; s < 1; s += 0.004) {
      const x = vx + (ex - vx) * s, y = vy + (y1 + 40 - vy) * s;
      if (y < y0 + 1 || y >= y1) continue;
      if (noise2(x * 0.01, y * 0.02, seed + 9) < 0.32) continue; // apagón
      if (hash(Math.round(x), Math.round(y), seed) < 0.55) g.set(hash(Math.round(y), a, seed) > 0.3 ? C.wa2 : C.wa3, x, y);
    }
  }
  // Calles y casas encendidas.
  for (let y = y0 + 1; y < y1; y++) {
    const t = (y - y0) / (y1 - y0), step = 1 + Math.floor(t * 3 * near);
    if ((y - y0) % step) continue;
    const n = Math.round(w * (0.16 - t * 0.08));
    for (let k = 0; k < n; k++) {
      const x = Math.floor(hash(k, y, seed) * w);
      if (noise2(x * 0.012, y * 0.03, seed + 9) < 0.36) continue;
      const r = hash(k, y, seed + 1);
      const c = r > 0.97 ? C.tq2 : r > 0.94 ? C.ro2 : r > 0.6 ? C.wa1 : r > 0.25 ? C.wa0 : C.te1;
      g.set(c, x, y);
      if (t * near > 0.55 && r > 0.5) g.set(c === C.wa1 ? C.wa2 : c, x + 1, y);
    }
  }
}

/** Rascacielos lejanos en silueta con ventanas. */
function rascacielos(g: Lienzo, x: number, base: number, w: number, h: number, seed: number, body: string, dark: string, hi: string): void {
  const top = base - h, broken = hash(seed, 1) > 0.5;
  for (let y = top; y < base; y++) for (let lx = 0; lx < w; lx++) {
    if (broken && y < top + noise1(lx * 0.2, seed) * h * 0.25) continue;
    let c = lx < 1 ? hi : lx > w * 0.7 ? dark : body;
    if (lx > 1 && lx < w - 2 && (y - top) % 5 >= 2 && lx % 4 >= 2) {
      const r = hash(Math.floor(lx / 4), Math.floor((y - top) / 5), seed);
      c = r < 0.08 ? C.wa1 : r < 0.18 ? C.wa0 : C.ink;
    }
    g.set(c, x + lx, y);
  }
  if (!broken && hash(seed, 2) > 0.4) { g.rect(dark, x + w / 2, top - 14, 1, 14); g.set(C.rd1, x + w / 2, top - 15); }
}

/** Torre de celosía del teleférico (silueta). */
function torreCable(g: Lienzo, x: number, top: number, base: number, c: string, hi: string): void {
  for (let y = top; y < base; y++) {
    const half = 2 + Math.round((y - top) * 0.07);
    g.set(c, x - half, y); g.set(c, x + half, y);
    if ((y - top) % 8 === 0) { g.line(c, x - half, y, x + half + 1, y + 8); g.line(c, x + half, y, x - half - 1, y + 8); }
  }
  g.rect(c, x - 7, top - 2, 15, 3); g.rect(hi, x - 7, top - 2, 15, 1); g.set(C.rd1, x, top - 3);
}

/** Azotea de la CDMX: losa, pretil, tinacos, antenas y tendederos. */
function azotea(g: Lienzo, x: number, top: number, w: number, h: number, seed: number): void {
  concreto(g, x, top, w, h, C.st1, C.st0, C.st2, seed);
  g.rect(C.st3, x, top, w, 2); g.rect(C.st2, x, top + 2, w, 1);
  // Fachada con ventanas (algunas encendidas: aún vive alguien).
  for (let wy = top + 14; wy < top + h - 8; wy += 16) for (let wx = x + 6; wx < x + w - 10; wx += 14) {
    const r = hash(wx, wy, seed);
    g.rect(r < 0.12 ? C.wa1 : r < 0.2 ? C.wa0 : r < 0.24 ? C.tq0 : C.ink, wx, wy, 7, 9);
    if (r < 0.12) g.set(C.wa3, wx + 1, wy + 1);
  }
  // Tinacos negros con tapa.
  for (let k = 0; k < Math.floor(w / 46); k++) {
    if (hash(k, 1, seed) < 0.35) continue;
    const tx = x + 8 + k * 46 + Math.round(hash(k, 2, seed) * 16);
    g.rect(C.st2, tx - 1, top - 3, 15, 3);
    g.ellipse(C.st0, tx + 6, top - 10, 6, 8); g.rect(C.st0, tx, top - 12, 13, 9);
    g.rect(C.st1, tx + 1, top - 18, 3, 13); g.ellipse(C.ink, tx + 6, top - 19, 6, 2); g.set(C.st2, tx + 2, top - 17);
  }
  // Antena de televisión torcida.
  if (hash(seed, 3) > 0.3) {
    const ax = x + Math.round(w * (0.2 + hash(seed, 4) * 0.6));
    g.line(C.st0, ax, top, ax + 2, top - 28);
    for (let k = 0; k < 4; k++) g.line(C.st0, ax - 6 + k, top - 26 + k * 5, ax + 8 - k, top - 27 + k * 5);
  }
  // Tendedero con ropa empapada.
  if (hash(seed, 5) > 0.4) {
    const lx0 = x + 6, lx1 = x + Math.min(w - 6, 70);
    g.rect(C.st0, lx0, top - 16, 1, 16); g.rect(C.st0, lx1, top - 16, 1, 16);
    for (let lx = lx0; lx <= lx1; lx++) g.set(C.st2, lx, top - 15 + Math.sin((lx - lx0) / (lx1 - lx0) * Math.PI) * 2);
    for (let k = lx0 + 4; k < lx1 - 6; k += 9) {
      const c = [C.ro1, C.tq1, C.wa0, C.pu1, C.mtn1][Math.floor(hash(k, 6, seed) * 5)];
      g.rect(c, k, top - 13 + Math.round(Math.sin((k - lx0) / (lx1 - lx0) * Math.PI) * 2), 5, 6 + Math.round(hash(k, 7, seed) * 3));
    }
  }
  // Charcos de lluvia que reflejan.
  for (let k = 0; k < w / 20; k++) g.set(C.sh0, x + hash(k, 8, seed) * w, top + 1);
}

/* ============================== TELEFÉRICO ============================== */

function telSky(g: Lienzo, w: number): void { cieloTormenta(g, w, g.h, 101); }

function telFar(g: Lienzo, w: number): void {
  const h = g.h, horizon = 112;
  sierra(g, w, horizon, 111, C.ink, C.mtn0);
  ciudadLuces(g, w, horizon, h, 112, 1);
  lluviaVelo(g, w, horizon - 40, h, C.night, w * 1.6, 113, 5);
}

function telMid(g: Lienzo, w: number): void {
  const h = g.h;
  // Banco de nubes bajas que se atraviesa a media subida.
  nubarrones(g, w, 150, 300, 121, { th: 0.6, sx: 0.012, sy: 0.05, body: [C.night, C.dusk, C.mtn0], rim: C.te0, soft: 0.5 });
  // Rascacielos rotos de Reforma y el centro (la cabina los deja abajo).
  for (let x = -10, n = 0; x < w; n++) {
    const bw = 20 + Math.round(hash(n, 1, 122) * 26), bh = 70 + Math.round(hash(n, 2, 122) * 120);
    rascacielos(g, x, h, bw, bh, n + 200, C.night, C.void, C.mtn0);
    x += bw + 6 + Math.round(hash(n, 3, 122) * 30);
  }
  // Línea vecina del teleférico (torres lejanas).
  for (let k = 0; k < 4; k++) torreCable(g, 80 + k * Math.round(w / 4), h - 150 - k * 30, h, C.ink, C.st1);
  lluviaVelo(g, w, 0, h, C.dusk, w * 1.4, 123, 6);
}

function telNear(g: Lienzo, w: number): void {
  const h = g.h;
  // Jirones de nube que pasan cerca.
  nubarrones(g, w, 120, 380, 131, { th: 0.66, sx: 0.016, sy: 0.07, body: [C.dusk, C.teal0, C.mtn0], rim: C.mtn1, soft: 0.7 });
  // Azoteas cercanas al despegar: la cabina sale de entre las casas.
  for (let x = -6, n = 0; x < w; n++) {
    const bw = 70 + Math.round(hash(n, 1, 132) * 70), top = h - 300 + Math.round(hash(n, 2, 132) * 120) + (n % 3 === 1 ? -40 : 0);
    azotea(g, x, top, bw, h - top, n + 300);
    x += bw + Math.round(hash(n, 3, 132) * 10);
  }
  // Cables de luz que cruzan las azoteas.
  for (let k = 0; k < 3; k++) {
    const yA = h - 330 + k * 22;
    for (let x = 0; x < w; x++) g.set(C.ink, x, yA + Math.sin(x / w * Math.PI * 3 + k) * 8 + x * 0.04);
  }
  lluviaVelo(g, w, 0, h, C.mtn0, w * 1.2, 133, 9);
}

/** Interior de la cabina (800 × 360): paredes metálicas, ventanas transparentes, puertas, piso. */
function telCabin(g: Lienzo, w: number): void {
  const K = CABIN;
  // Muro completo; luego se abren ventanas y puertas.
  for (let y = 0; y < K.wallBot; y++) for (let x = 0; x < w; x++) {
    const seam = x % 98 === 0;
    g.set(seam ? C.st1 : y < K.ceil ? (bayer(x, y) < 0.15 ? C.st0 : C.st1) : bayer(x, y) < 0.1 ? C.st2 : C.st3, x, y);
  }
  // Techo: rejillas, remaches y tira de luces (una rota).
  g.rect(C.st0, 0, 0, w, 6); g.rect(C.st2, 0, K.ceil - 3, w, 1); g.rect(C.st4, 0, K.ceil - 2, w, 1); g.rect(C.st0, 0, K.ceil - 1, w, 1);
  for (let x = 4; x < w; x += 12) g.set(C.st3, x, 9);
  for (const l of cdmx2Lamps('teleferico')) if (l.kind === 'techo') {
    const broken = l.x > 420 && l.x < 480;
    g.rect(C.st0, l.x - 22, 15, 44, 8); g.rect(broken ? C.ink : C.wa2, l.x - 20, 17, 40, 4);
    if (!broken) { g.rect(C.wa3, l.x - 20, 17, 40, 1); g.rect(C.wa4, l.x - 14, 18, 10, 1); }
    else for (let k = 0; k < 6; k++) g.set(C.wa0, l.x - 18 + k * 7, 18 + (k % 2));
  }
  for (let x = 40; x < w; x += 160) { g.rect(C.st0, x, 8, 24, 6); for (let k = 0; k < 24; k += 3) g.rect(C.ink, x + k, 9, 1, 4); }
  // Barra para los asideros (Cdmx2Scenery cuelga las correas de aquí).
  g.rect(C.st4, 104, K.bar - 1, 592, 2); g.rect(C.st5, 104, K.bar - 1, 592, 1);
  for (let x = 110; x < 696; x += 96) { g.rect(C.st1, x, K.ceil, 3, K.bar - K.ceil); }
  // Ventanas: marco, empaque de hule, reflejos y gotas pegadas.
  for (const p of K.panes) {
    g.rect(C.st4, p.x0 - 4, K.winTop - 4, p.x1 - p.x0 + 8, K.winBot - K.winTop + 8);
    g.rect(C.st5, p.x0 - 4, K.winTop - 4, p.x1 - p.x0 + 8, 1); g.rect(C.st2, p.x0 - 4, K.winBot + 3, p.x1 - p.x0 + 8, 1);
    g.rect(C.ink, p.x0 - 1, K.winTop - 1, p.x1 - p.x0 + 2, K.winBot - K.winTop + 2);
    g.erase(p.x0, K.winTop, p.x1 - p.x0, K.winBot - K.winTop);
    // Reflejo diagonal (luz de la cabina en el vidrio) y vaho en las esquinas.
    for (let s = 0; s < 2; s++) for (let i = 0; i < 160; i++) {
      const bx = p.x0 + 20 + s * 52 + i * 0.5, by = K.winBot - 2 - i;
      for (let k = 0; k < (s ? 3 : 7); k++) if (by > K.winTop && bx + k < p.x1) g.veil(C.mtn2, bx + k, by, 0.12);
    }
    for (let y = K.winBot - 14; y < K.winBot; y++) for (let x = p.x0; x < p.x1; x++) g.veil(C.mtn1, x, y, (y - K.winBot + 14) / 14 * 0.25 * noise1(x * 0.1, p.x0));
    for (let k = 0; k < 26; k++) g.set(hash(k, 2, p.x0) > 0.5 ? C.sh0 : C.mtn2, p.x0 + hash(k, 1, p.x0) * (p.x1 - p.x0), K.winTop + hash(k, 3, p.x0) * (K.winBot - K.winTop));
  }
  // Puertas laterales: marco grueso y hueco al exterior (la hoja corrediza la pone el decorado).
  for (const d of K.doors) {
    g.rect(C.st1, d.x0 - 6, K.doorTop - 6, d.x1 - d.x0 + 12, K.wallBot - K.doorTop + 6);
    g.rect(C.st4, d.x0 - 6, K.doorTop - 6, d.x1 - d.x0 + 12, 1);
    g.rect(C.wa2, d.x0 - 6, K.doorTop - 4, d.x1 - d.x0 + 12, 2);
    for (let x = d.x0 - 6; x < d.x1 + 6; x += 6) g.rect(C.ink, x, K.doorTop - 4, 3, 2);
    g.erase(d.x0, K.doorTop, d.x1 - d.x0, K.wallBot - K.doorTop);
    // Lámpara de aviso roja y letrero.
    const cx = (d.x0 + d.x1) / 2;
    g.rect(C.st0, cx - 5, K.doorTop - 12, 10, 5); g.rect(C.rd0, cx - 4, K.doorTop - 11, 8, 3); g.set(C.rd1, cx - 2, K.doorTop - 11);
  }
  // Zócalo: franja retrofuturista rosa/turquesa, pasamanos y letreros.
  g.rect(C.st2, 0, K.winBot + 8, w, K.wallBot - K.winBot - 8);
  for (const d of K.doors) g.erase(d.x0, K.winBot + 8, d.x1 - d.x0, K.wallBot - K.winBot - 8);
  for (let x = 0; x < w; x++) {
    if (K.doors.some(d => x >= d.x0 - 6 && x < d.x1 + 6)) continue;
    g.set(C.ro1, x, 194); g.set(C.ro1, x, 195); g.set(C.tq1, x, 197);
    g.set(C.st5, x, 202); g.set(C.st4, x, 203); g.set(C.st1, x, 204);
    g.set(C.st1, x, K.wallBot - 1);
  }
  for (let x = 120; x < 690; x += 72) { g.rect(C.st1, x, 204, 2, 4); }
  for (const x of [130, 600]) { g.rect(C.ink, x, 206, 56, 7); miniText(g, C.wa2, 'NO RECARGARSE', x + 2, 207); }
  // Piso de placa antiderrapante en perspectiva (filas que se separan al acercarse).
  for (let y = K.wallBot; y < K.floorBot; y++) {
    const t = (y - K.wallBot) / (K.floorBot - K.wallBot), rowH = 4 + Math.round(t * 8);
    for (let x = 0; x < w; x++) {
      let c: string = C.st1;
      if ((y - K.wallBot) % rowH === 0 && y > K.wallBot + 3) c = C.st0;
      else if (((x + (y % 2) * 3) % 6 === 0) && y % 3 === 0) c = C.st2;
      else if (bayer(x, y) < 0.06) c = C.st2;
      g.set(c, x, y);
    }
  }
  for (let y = K.wallBot; y < K.wallBot + 4; y++) for (let x = 0; x < w; x++) g.veil(C.ink, x, y, 0.8 - (y - K.wallBot) * 0.2);
  // Franja de seguridad frente a cada puerta y agua que entró con la lluvia.
  for (const d of K.doors) {
    for (let y = K.wallBot; y < K.wallBot + 8; y++) for (let x = d.x0 - 4; x < d.x1 + 4; x++) g.set(((x + y) >> 2) % 2 ? C.wa2 : C.ink, x, y);
    for (let y = K.wallBot + 10; y < K.wallBot + 60; y++) for (let x = d.x0 - 30; x < d.x1 + 30; x++) {
      const n = noise2(x * 0.06, y * 0.12, d.x0);
      if (n > 0.62) g.set(n > 0.72 ? C.mtn1 : C.mtn0, x, y);
      if (n > 0.74 && bayer(x, y) < 0.3) g.set(C.sh0, x, y);
    }
  }
  // Rayones, tornillos de las placas y una mancha de grasa.
  for (let k = 0; k < 40; k++) { const x = hash(k, 1, 140) * w, y = K.wallBot + 8 + hash(k, 2, 140) * 120; g.line(C.st2, x, y, x + 4 + hash(k, 3, 140) * 6, y + 1); }
  g.ellipse(C.st0, 520, 300, 18, 4);
  // Orilla frontal del piso.
  g.rect(C.st0, 0, K.floorBot, w, g.h - K.floorBot); g.rect(C.st2, 0, K.floorBot, w, 1);
  for (let x = 0; x < w; x += 24) g.rect(C.ro0, x, K.floorBot + 5, 12, 2);
}

/** Primer plano de la cabina: viga del techo, postes frontales y orilla del piso. */
function telFront(g: Lienzo, w: number): void {
  g.rect(C.ink, 0, 0, w, 7); g.rect(C.st0, 0, 7, w, 2);
  for (let x = 6; x < w; x += 16) g.set(C.st1, x, 4);
  for (const x0 of [0, w - 16]) {
    g.rect(C.ink, x0, 0, 16, g.h); g.rect(C.st0, x0 + (x0 ? 0 : 12), 0, 4, g.h); g.rect(C.st1, x0 + (x0 ? 1 : 13), 0, 1, g.h);
    for (let y = 30; y < g.h; y += 40) g.set(C.st2, x0 + 8, y);
  }
  g.rect(C.ink, 0, g.h - 6, w, 6); g.rect(C.st0, 0, g.h - 7, w, 1);
}

/* ============================ TORRE DE CONTROL ============================ */

function torSky(g: Lienzo, w: number): void { cieloTormenta(g, w, 360, 201); }

function torFar(g: Lienzo, w: number): void {
  sierra(g, w, 168, 211, C.ink, C.mtn0);
  ciudadLuces(g, w, 168, 360, 212, 0.7);
}

function torMid(g: Lienzo, w: number): void {
  nubarrones(g, w, 90, 230, 221, { th: 0.55, sx: 0.01, sy: 0.04, body: [C.night, C.dusk, C.mtn0], rim: C.te0 });
  for (let x = 20, n = 0; x < w; n++) {
    const bw = 16 + Math.round(hash(n, 1, 222) * 20), bh = 40 + Math.round(hash(n, 2, 222) * 70);
    rascacielos(g, x, 250, bw, bh, n + 400, C.night, C.void, C.mtn0);
    x += bw + 30 + Math.round(hash(n, 3, 222) * 90);
  }
  // Línea del teleférico que sube a la torre (cables y torres).
  const ts = [0.05, 0.35, 0.65, 0.95].map(f => Math.round(w * f));
  ts.forEach((x, i) => torreCable(g, x, 150 - i * 18, 250, C.ink, C.st1));
  for (let i = 0; i + 1 < ts.length; i++) {
    g.line(C.st1, ts[i], 150 - i * 18, ts[i + 1], 150 - (i + 1) * 18);
    g.line(C.st0, ts[i], 154 - i * 18, ts[i + 1], 154 - (i + 1) * 18);
    const cx = Math.round((ts[i] + ts[i + 1]) / 2), cy = Math.round(150 - i * 18 - 9);
    g.rect(C.st1, cx, cy, 1, 5); g.rect(C.st2, cx - 4, cy + 5, 9, 7); g.rect(C.wa1, cx - 3, cy + 7, 3, 3);
  }
  lluviaVelo(g, w, 0, 360, C.dusk, w * 1.3, 223, 6);
}

/** Estructura exterior de la torre: vigas en X, mástil de antenas y canaletas. */
function torNear(g: Lienzo, w: number): void {
  for (let x = 60, n = 0; x < w; x += 300, n++) {
    for (const [ax, bx] of [[x, x + 140], [x + 140, x]] as const) {
      g.line(C.st0, ax, 30, bx, 230, 5); g.line(C.st1, ax, 29, bx, 229, 1);
    }
    g.rect(C.ink, x - 4, 0, 8, 360); g.rect(C.st0, x - 2, 0, 2, 360);
    g.rect(C.ink, x + 136, 0, 8, 360); g.rect(C.st0, x + 138, 0, 2, 360);
    for (let y = 20; y < 360; y += 30) { g.rect(C.st1, x - 4, y, 8, 2); g.rect(C.st1, x + 136, y, 8, 2); }
    if (n % 2 === 0) { // mástil con focos rojos
      const mx = x + 220;
      g.rect(C.ink, mx, 0, 3, 360);
      for (let y = 10; y < 300; y += 50) { g.rect(C.st0, mx - 6, y, 15, 2); g.set(C.rd1, mx + 1, y - 1); }
    }
  }
  lluviaVelo(g, w, 0, 360, C.mtn0, w * 0.9, 233, 10);
}

/** Consola empotrada bajo una ventana (escritorio con botones y dos pantallas). */
function consolaMuro(g: Lienzo, x0: number, x1: number, alerta: boolean): void {
  g.rect(C.st1, x0 + 4, 172, x1 - x0 - 8, 42); g.rect(C.st3, x0 + 4, 172, x1 - x0 - 8, 2); g.rect(C.st0, x0 + 4, 208, x1 - x0 - 8, 6);
  g.rect(C.st2, x0 + 4, 196, x1 - x0 - 8, 10);
  for (let x = x0 + 54; x < x1 - 56; x += 5) {
    const r = hash(x, 3, x0);
    g.rect(r > 0.8 ? C.rd1 : r > 0.55 ? C.lg0 : r > 0.3 ? C.wa2 : C.st4, x, 199, 2, 2);
    if (r > 0.5) g.rect(C.st4, x, 203, 3, 1);
  }
  for (const sx of [x0 + 24, x1 - 50]) { g.rect(C.ink, sx - 1, 179, 24, 14); g.rect(alerta && sx > x0 + 30 ? C.rd0 : C.tq0, sx, 180, 22, 12); }
}

/** Pared de monitores (12 pantallas). */
function muroMonitores(g: Lienzo, x0: number, x1: number, alerta: boolean, seed: number): void {
  g.rect(C.st0, x0 + 4, 38, x1 - x0 - 8, 130);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const sx = x0 + 10 + c * 40, sy = 46 + r * 34;
    g.rect(C.st2, sx - 2, sy - 2, 38, 30); g.rect(C.st3, sx - 2, sy - 2, 38, 1);
    for (let y = 0; y < 26; y++) for (let x = 0; x < 34; x++) {
      const v = hash(sx + x, sy + y, seed);
      g.set(alerta ? (y % 3 === 0 ? C.rd0 : v > 0.7 ? C.rd1 : C.ro0) : v > 0.75 ? C.mtn2 : v > 0.4 ? C.mtn0 : C.night, sx + x, sy + y);
    }
    g.rect(C.st0, sx + 15, sy + 28, 4, 4);
  }
  // Cables que cuelgan de los monitores.
  for (let k = 0; k < 6; k++) { const cx = x0 + 20 + k * 28; for (let y = 150; y < 172; y++) g.set(k % 2 ? C.ink : C.st0, cx + Math.sin(y * 0.3 + k) * 2, y); }
}

function torInterior(g: Lienzo, w: number): void {
  // Techo y muro base.
  for (let y = 0; y < 214; y++) for (let x = 0; x < w; x++) g.set(y < 28 ? (bayer(x, y) < 0.2 ? C.st0 : C.st1) : bayer(x, y) < 0.12 ? C.st1 : C.st2, x, y);
  // Charolas de cables en el techo.
  g.rect(C.st0, 0, 8, w, 6); for (let x = 0; x < w; x += 10) g.rect(C.st2, x, 8, 1, 6);
  for (let x = 0; x < w; x++) { g.set(C.wa1, x, 13 + Math.round(Math.sin(x * 0.05) * 1)); g.set(C.ink, x, 12 + Math.round(Math.sin(x * 0.07 + 1))); }
  g.rect(C.st4, 0, 26, w, 1); g.rect(C.st0, 0, 27, w, 1);
  for (const l of cdmx2Lamps('torre')) { g.rect(C.st0, l.x - 26, 16, 52, 7); g.rect(l.kind === 'alerta' ? C.rd0 : C.tq1, l.x - 24, 18, 48, 3); g.rect(l.kind === 'alerta' ? C.rd1 : C.tq2, l.x - 24, 18, 48, 1); }
  TORRE_BAYS.forEach((kind, i) => {
    const x0 = i * BAY + 12, x1 = (i + 1) * BAY - 12;
    if (kind === 'ventanal' || kind === 'roto' || kind === 'altar') {
      // Ventanal panorámico de dos hojas.
      g.rect(C.st4, x0 + 2, 36, x1 - x0 - 4, 134); g.rect(C.st5, x0 + 2, 36, x1 - x0 - 4, 1);
      g.rect(C.ink, x0 + 5, 39, x1 - x0 - 10, 128);
      g.erase(x0 + 6, 40, x1 - x0 - 12, 126);
      const mid = Math.round((x0 + x1) / 2);
      if (kind !== 'roto') {
        g.rect(C.st3, mid - 2, 40, 4, 126); g.rect(C.st4, mid - 2, 40, 1, 126);
        for (let i2 = 0; i2 < 120; i2++) for (let k = 0; k < 5; k++) g.veil(C.mtn2, x0 + 14 + i2 * 0.5 + k, 164 - i2, 0.1);
      } else {
        // Vidrio estrellado: quedan esquirlas en el marco.
        for (const [ex, dir] of [[x0 + 6, 1], [x1 - 6, -1]] as const) for (let y = 40; y < 166; y++) {
          const len = Math.max(0, Math.round(noise1(y * 0.2, x0) * 22 - 6));
          for (let k = 0; k < len; k++) g.set(k === len - 1 ? C.mtn3 : bayer(ex + k * dir, y) < 0.5 ? C.mtn2 : C.mtn1, ex + k * dir, y);
        }
        for (let x = x0 + 6; x < x1 - 6; x++) { const len = Math.round(noise1(x * 0.25, x1) * 10); for (let k = 0; k < len; k++) g.set(C.mtn1, x, 40 + k); }
      }
      if (kind === 'altar') {
        // Alcoba tranquila: nicho con una ofrenda mínima pintada en el muro y luz cálida.
        consolaMuro(g, x0, x1, false);
        halo(g, (x0 + x1) / 2, 190, 90, 30, C.wa0, 0.35);
      } else consolaMuro(g, x0, x1, false);
    } else if (kind === 'monitores' || kind === 'alerta') {
      muroMonitores(g, x0, x1, kind === 'alerta', i * 17);
      consolaMuro(g, x0, x1, kind === 'alerta');
    } else if (kind === 'consolas') {
      // Pantalla grande con el mapa de la línea del teleférico.
      g.rect(C.st0, x0 + 24, 44, x1 - x0 - 48, 102); g.rect(C.st3, x0 + 24, 44, x1 - x0 - 48, 1);
      g.rect(C.night, x0 + 30, 50, x1 - x0 - 60, 90);
      for (let y = 52; y < 138; y += 6) for (let x = x0 + 32; x < x1 - 32; x += 2) g.set(C.dusk, x, y);
      const pts = [[x0 + 40, 128], [x0 + 80, 102], [x0 + 112, 84], [x1 - 40, 60]] as const;
      for (let k = 0; k + 1 < pts.length; k++) g.line(C.tq2, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
      for (const [px, py] of pts) { g.rect(C.tq3, px - 2, py - 2, 5, 5); }
      g.rect(C.wa2, x0 + 96, 92, 3, 3); g.rect(C.rd1, x1 - 42, 58, 5, 5);
      miniText(g, C.tq2, 'LINEA', x0 + 34, 54);
      consolaMuro(g, x0, x1, false);
    } else {
      // Compuerta al salón del trono: doble hoja con el espejo negro de la Cofradía.
      g.rect(C.st0, x0 + 10, 40, x1 - x0 - 20, 174); g.rect(C.st1, x0 + 14, 46, x1 - x0 - 28, 168);
      const cx = Math.round((x0 + x1) / 2);
      g.rect(C.ink, cx - 1, 46, 2, 168);
      for (let y = 46; y < 214; y += 14) g.rect(C.st0, x0 + 14, y, x1 - x0 - 28, 1);
      g.ellipse(C.pu0, cx, 100, 24, 24); g.ellipse(C.ink, cx, 100, 20, 20); g.ellipse(C.void, cx - 4, 96, 9, 9); g.set(C.pu2, cx - 8, 92);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.line(C.ea2, cx + Math.cos(a) * 26, 100 + Math.sin(a) * 26, cx + Math.cos(a) * 34, 100 + Math.sin(a) * 34, 2); }
      for (const sx of [x0 + 18, x1 - 24]) { g.rect(C.rd0, sx, 60, 6, 120); for (let y = 62; y < 178; y += 4) g.set(C.rd1, sx + 2, y); }
    }
    // Columna estructural entre bahías.
    const cxl = i * BAY;
    g.rect(C.st1, cxl - 12, 28, 24, 186); g.rect(C.st3, cxl - 12, 28, 3, 186); g.rect(C.st0, cxl + 8, 28, 4, 186);
    for (let y = 40; y < 214; y += 24) { g.set(C.st4, cxl - 6, y); g.set(C.st4, cxl + 4, y); }
    g.rect(C.wa2, cxl - 12, 150, 24, 4); for (let x = cxl - 12; x < cxl + 12; x += 4) g.rect(C.ink, x, 150, 2, 4);
  });
  // Piso de rejilla metálica con franja de precaución y haces de cable.
  for (let y = 214; y < 345; y++) {
    const t = (y - 214) / 131, rowH = 5 + Math.round(t * 9);
    for (let x = 0; x < w; x++) {
      let c: string = (x % 32 === 0) ? C.st0 : C.st1;
      if ((y - 214) % rowH === 0) c = C.st0;
      else if ((x + y) % 4 === 0 && y % 2 === 0) c = C.st2;
      g.set(c, x, y);
    }
  }
  for (let y = 216; y < 222; y++) for (let x = 0; x < w; x++) g.set(((x + y) >> 2) % 2 ? C.wa2 : C.ink, x, y);
  for (let y = 214; y < 216; y++) g.rect(C.ink, 0, y, w, 1);
  for (let k = 0; k < 5; k++) {
    const yb = 240 + k * 22 + Math.round(hash(k, 1, 240) * 10);
    for (let x = 0; x < w; x++) {
      const yy = yb + Math.sin(x * 0.012 + k) * 6 + noise1(x * 0.03, k) * 4;
      if (noise1(x * 0.004, k + 40) < 0.45) continue;
      g.set(C.ink, x, yy); g.set(k % 2 ? C.st2 : C.te1, x, yy - 1);
    }
  }
  // Charcos y vidrios rotos frente a los ventanales estrellados.
  TORRE_BAYS.forEach((kind, i) => {
    if (kind !== 'roto') return;
    const cx = i * BAY + 100;
    for (let y = 222; y < 300; y++) for (let x = cx - 90; x < cx + 90; x++) {
      const n = noise2(x * 0.04, y * 0.1, i);
      if (n > 0.55) g.set(n > 0.68 ? C.mtn0 : C.night, x, y);
      if (n > 0.72 && bayer(x, y) < 0.12) g.set(C.mtn2, x, y);
    }
    for (let k = 0; k < 30; k++) { const x = cx - 80 + hash(k, 1, i) * 160, y = 224 + hash(k, 2, i) * 70; g.set(C.mtn3, x, y); if (k % 3 === 0) g.set(C.mtn2, x + 1, y); }
  });
  g.rect(C.st0, 0, 345, w, 15); g.rect(C.st2, 0, 345, w, 1);
  for (let x = 0; x < w; x += 40) g.rect(C.wa1, x, 350, 20, 2);
}

/** Primer plano de la torre: cables colgantes, frentes de columna y haces de cable. */
function torFront(g: Lienzo, w: number): void {
  for (let k = 0, x = 120; x < w; k++) {
    const len = 30 + Math.round(hash(k, 1, 250) * 60), x2 = x + 20 + Math.round(hash(k, 2, 250) * 40);
    for (let s = 0; s <= 1; s += 0.01) g.set(k % 3 ? C.ink : C.st0, x + (x2 - x) * s, Math.sin(s * Math.PI) * len);
    if (k % 2) { for (let y = 0; y < len * 0.8; y++) g.set(C.ink, x2 + 10, y); g.rect(C.wa2, x2 + 9, Math.round(len * 0.8), 3, 2); }
    if (k % 4 === 0) {
      g.rect(C.ink, x + 200, 0, 22, 360); g.rect(C.st0, x + 200, 0, 3, 360);
      for (let y = 20; y < 360; y += 36) g.set(C.st1, x + 210, y);
    }
    x += 260 + Math.round(hash(k, 3, 250) * 200);
  }
  for (let x = 0; x < w; x++) if (noise1(x * 0.01, 251) > 0.55) { g.set(C.ink, x, 352 + Math.sin(x * 0.04) * 3); g.set(C.ink, x, 353 + Math.sin(x * 0.04) * 3); }
}

/* ============================ SALÓN DEL TRONO ============================ */

function salSky(g: Lienzo, w: number): void { cieloTormenta(g, w, 360, 301, true); }

function salFar(g: Lienzo, w: number): void {
  nubarrones(g, w, 60, 260, 311, { th: 0.5, sx: 0.009, sy: 0.03, body: [C.pu0, C.night, C.void], rim: C.pu1 });
  ciudadLuces(g, w, 250, 360, 312, 0.5);
}

function salMid(g: Lienzo, w: number): void {
  // Agujas de la torre y antenas recortadas contra la tormenta.
  for (let x = 30, n = 0; x < w; n++) {
    const bw = 18 + Math.round(hash(n, 1, 322) * 22), bh = 90 + Math.round(hash(n, 2, 322) * 120);
    for (let y = 300 - bh; y < 300; y++) {
      const half = Math.max(1, Math.round(bw / 2 * Math.min(1, (y - (300 - bh)) / (bh * 0.35))));
      g.rect(C.ink, x + bw / 2 - half, y, half * 2, 1); g.set(C.pu0, x + bw / 2 - half, y);
    }
    g.set(C.rd1, x + bw / 2, 300 - bh - 1);
    x += bw + 60 + Math.round(hash(n, 3, 322) * 120);
  }
  g.rect(C.ink, 0, 300, w, 60);
  lluviaVelo(g, w, 0, 300, C.pu0, w * 1.2, 323, 7);
}

/** Columnata del fondo del salón (se ve por los arcos). */
function salNear(g: Lienzo, w: number): void {
  g.rect(C.void, 0, 20, w, 194);
  for (let y = 20; y < 214; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.02, y * 0.04, 331) > 0.62) g.veil(C.pu0, x, y, 0.5);
  for (let x = 20; x < w; x += 90) {
    // Arco escalonado entre columnas.
    for (let s = 0; s < 4; s++) g.rect(C.st0, x + 8 + s * 4, 40 + s * 5, 74 - s * 8, 2);
    g.rect(C.ink, x, 30, 16, 184); g.rect(C.st0, x + 2, 30, 3, 184); g.rect(C.pu0, x + 13, 30, 1, 184);
    g.rect(C.st0, x - 3, 30, 22, 6); g.rect(C.st0, x - 3, 204, 22, 10);
    // Brasero azul (fuego frío del olvido).
    g.rect(C.st0, x + 40, 186, 10, 10); g.rect(C.tq1, x + 41, 182, 8, 4); g.set(C.tq3, x + 44, 180);
    halo(g, x + 45, 182, 26, 18, C.tq0, 0.5, false);
  }
  g.rect(C.ink, 0, 0, w, 22);
  g.rect(C.st0, 0, 214, w, 146);
  for (let y = 214; y < 240; y++) for (let x = 0; x < w; x++) g.veil(C.pu0, x, y, 0.3);
}

/** Motivo de un vitral (u, v en 0..1) → color. Recuerdos borrosos: agua, siluetas, la luna. */
function motivo(m: Vitral['motif'], u: number, v: number): string {
  const wave = (k: number) => Math.sin(u * 14 + k) * 0.03;
  if (m === 'agua') {
    if (v < 0.35) return v < 0.15 ? C.pu0 : C.pu1;
    if (v < 0.4 + wave(0)) return C.tq3;
    return (Math.floor((v + wave(1)) * 18) % 2) ? C.tq1 : v > 0.75 ? C.tq0 : C.tq2;
  }
  if (m === 'luna') {
    const d = Math.hypot(u - 0.5, (v - 0.3) * 1.2);
    if (d < 0.17) return d < 0.13 ? C.sh1 : C.mtn3;
    if (v > 0.62 + wave(2)) return Math.abs(u - 0.5) < 0.08 + (v - 0.62) * 0.3 && (Math.floor(v * 30) % 2) ? C.mtn3 : C.tq0;
    return d < 0.3 ? C.mtn1 : C.mtn0;
  }
  if (m === 'mujer') {
    // Silueta de mujer de pie junto al río (sin rostro; borrosa).
    const head = Math.hypot(u - 0.5, (v - 0.3) * 1.3) < 0.07;
    const dress = v > 0.36 && v < 0.82 && Math.abs(u - 0.5) < 0.06 + (v - 0.36) * 0.35;
    const veil = v > 0.24 && v < 0.6 && Math.abs(u - 0.47) < 0.1 + (v - 0.24) * 0.2 && u < 0.5;
    if (head || dress || veil) return veil && !head ? C.pu1 : C.pu0;
    if (v > 0.78 + wave(3)) return (Math.floor(v * 24) % 2) ? C.tq1 : C.tq0;
    return v < 0.2 ? C.void : C.mtn0;
  }
  if (m === 'ninos') {
    // Dos siluetas pequeñas tomadas de la mano, con la luz cálida de una casa detrás.
    const kid = (cx: number) => Math.hypot(u - cx, (v - 0.48) * 1.2) < 0.06 || (v > 0.53 && v < 0.78 && Math.abs(u - cx) < 0.05 + (v - 0.53) * 0.12);
    const hands = v > 0.6 && v < 0.63 && u > 0.38 && u < 0.62;
    if (kid(0.36) || kid(0.64) || hands) return C.ea0;
    if (v > 0.8 + wave(4)) return (Math.floor(v * 24) % 2) ? C.tq1 : C.tq0;
    const d = Math.hypot(u - 0.5, v - 0.35);
    return d < 0.18 ? C.wa2 : d < 0.3 ? C.wa1 : d < 0.42 ? C.wa0 : C.te0;
  }
  // manos: dos manos que se buscan (sin tocarse).
  const handL = Math.hypot((u - 0.3) * 1.4, v - 0.55) < 0.12 || (u > 0.34 && u < 0.44 && Math.abs(v - 0.5 - (Math.floor(u * 50) % 3) * 0.03) < 0.02);
  const handR = Math.hypot((u - 0.7) * 1.4, v - 0.55) < 0.12 || (u > 0.54 && u < 0.66 && Math.abs(v - 0.5 - (Math.floor(u * 50) % 3) * 0.03) < 0.02);
  if (handL || handR) return C.sk1;
  const d = Math.hypot(u - 0.5, v - 0.5);
  return d < 0.15 ? C.ro3 : d < 0.3 ? C.ro2 : d < 0.45 ? C.ro1 : C.ro0;
}

/** Vitral escalonado con emplomado irregular y el motivo desenfocado (tramado). */
function vitral(g: Lienzo, v: Vitral): void {
  const W = v.x1 - v.x0, H = v.y1 - v.y0;
  const steps = (lx: number) => { const d = Math.abs(lx - W / 2) / (W / 2); return d > 0.75 ? 26 : d > 0.5 ? 16 : d > 0.25 ? 8 : 0; };
  g.rect(C.st0, v.x0 - 6, v.y0 - 6, W + 12, H + 12);
  for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++) {
    if (ly < steps(lx)) { g.set(C.st0, v.x0 + lx, v.y0 + ly); continue; }
    // Desenfoque: el motivo se muestrea con un temblor (recuerdo que no se deja ver).
    const jx = (hash(lx, ly, 7) - 0.5) * 0.06 + Math.sin(ly * 0.3) * 0.015, jy = (hash(lx, ly, 8) - 0.5) * 0.05;
    let c = motivo(v.motif, lx / W + jx, ly / H + jy);
    if (bayer(lx, ly) < 0.18) c = motivo(v.motif, lx / W - jx * 2, ly / H + jy * 2);
    g.set(c, v.x0 + lx, v.y0 + ly);
  }
  // Emplomado: retícula irregular.
  for (let lx = 0; lx < W; lx += 12) for (let ly = steps(lx); ly < H; ly++) g.set(C.ink, v.x0 + lx + Math.round(Math.sin(ly * 0.08 + lx) * 2), v.y0 + ly);
  for (let ly = 14; ly < H; ly += 16) for (let lx = 0; lx < W; lx++) if (ly >= steps(lx)) g.set(C.ink, v.x0 + lx, v.y0 + ly + Math.round(Math.sin(lx * 0.1 + ly) * 2));
  // Marco escalonado de cantera oscura y brillo superior izquierdo.
  for (let lx = 0; lx < W; lx++) g.set(C.st2, v.x0 + lx, v.y0 + steps(lx) - 1);
  g.rect(C.st2, v.x0 - 6, v.y0 - 6, 2, H + 12); g.rect(C.st0, v.x1 + 4, v.y0 - 6, 2, H + 12);
  g.rect(C.st1, v.x0 - 10, v.y1 + 4, W + 20, 6); g.rect(C.st3, v.x0 - 10, v.y1 + 4, W + 20, 1);
}

function columnaSalon(g: Lienzo, x: number): void {
  // Fuste con estrías, capitel escalonado y basa.
  for (let y = 20; y < 214; y++) for (let lx = 0; lx < 44; lx++) {
    let c: string = lx < 4 ? C.st3 : lx > 34 ? C.st0 : lx % 8 === 0 ? C.st0 : C.st1;
    if (bayer(lx, y) < 0.08) c = C.pu0;
    g.set(c, x - 22 + lx, y);
  }
  for (let s = 0; s < 4; s++) { g.rect(C.st2, x - 26 - s * 3, 20 + s * 5, 52 + s * 6, 5); g.rect(C.st3, x - 26 - s * 3, 20 + s * 5, 52 + s * 6, 1); }
  for (let s = 0; s < 3; s++) { g.rect(C.st1, x - 26 - s * 3, 200 + s * 5 - 10, 52 + s * 6, 5); g.rect(C.st3, x - 26 - s * 3, 200 + s * 5 - 10, 52 + s * 6, 1); }
  frisoGreca(g, x - 20, 46, 40, C.ea2, 'escalon');
  grieta(g, x - 6, 60, 70, C.ink, x, 0.1);
}

function salInterior(g: Lienzo, w: number): void {
  // Muro de fondo: cantera oscura con velo morado.
  for (let y = 0; y < 214; y++) {
    const row = Math.floor(y / 12), ly = y % 12;
    for (let x = 0; x < w; x++) {
      const off = row % 2 ? 14 : 0, col = Math.floor((x + off) / 28), lx = (x + off) % 28;
      const tone = hash(col, row, 340), n = noise2(x * 0.08, y * 0.08, 341);
      let c: string = tone > 0.75 ? C.st1 : C.st0;
      if (ly === 11 || lx === 27) c = C.ink;
      else if (ly === 0) c = tone > 0.75 ? C.st2 : C.st1;
      else if (n < 0.25 && bayer(x, y) < 0.5) c = C.ink;
      else if (n > 0.75 && bayer(x, y) < 0.3) c = C.pu0;
      g.set(c, x, y);
    }
  }
  for (let y = 0; y < 18; y++) g.rect(C.ink, 0, y, w, 1);
  // Huecos del techo roto (se ve la tormenta).
  for (const r of cdmx2Windows('salon_trono')) {
    for (let x = r.x0; x < r.x1; x++) {
      const d = Math.round(10 + noise1(x * 0.15, r.x0) * 18);
      g.erase(x, 0, 1, d);
      g.set(C.st2, x, d);
    }
  }
  SALON_BAYS.forEach((kind, i) => {
    const x0 = hallBayX(i) + 22, x1 = hallBayX(i + 1) - 22, cx = Math.round((x0 + x1) / 2);
    if (kind === 'arco') {
      // Arco escalonado abierto a la columnata del fondo.
      const W = x1 - x0 - 20;
      for (let y = 40; y < 214; y++) {
        const ly = y - 40, inset = ly < 10 ? 30 : ly < 20 ? 20 : ly < 30 ? 10 : 0;
        g.erase(x0 + 10 + inset, y, W - inset * 2, 1);
        g.set(C.st2, x0 + 9 + inset, y); g.set(C.ink, x0 + 10 + W - inset, y);
      }
      frisoGreca(g, x0 + 10, 30, W, C.ea1);
    } else if (kind === 'trono') {
      // Espejo negro de la Cofradía con rayos escalonados, y estrado al fondo.
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        for (let r = 52; r < 80 + (k % 2) * 14; r++) g.set(k % 2 ? C.ea1 : C.ea2, cx + Math.cos(a) * r, 92 + Math.sin(a) * r * 0.9);
      }
      g.ellipse(C.pu1, cx, 92, 48, 46); g.ellipse(C.ink, cx, 92, 44, 42);
      for (let y = 52; y < 132; y++) for (let x = cx - 44; x < cx + 44; x++) {
        if (!g.has(x, y) || g.get(x, y) !== C.ink) continue;
        const d = Math.hypot(x - cx + 14, y - 78);
        if (d < 22) g.veil(C.pu0, x, y, (1 - d / 22) * 0.9);
      }
      g.set(C.pu3, cx - 18, 72); g.set(C.pu2, cx - 17, 73); g.set(C.pu2, cx - 19, 74);
      grieta(g, cx + 8, 60, 50, C.pu1, 7, 0.4);
      halo(g, cx, 92, 70, 66, C.pu0, 0.4);
      for (let s = 0; s < 4; s++) { g.rect(C.st1, cx - 90 + s * 12, 170 + s * 11, 180 - s * 24, 11); g.rect(C.pu1, cx - 90 + s * 12, 170 + s * 11, 180 - s * 24, 1); }
    } else {
      vitral(g, cdmx2Vitrales('salon_trono').find(v => v.x0 === x0 + 30)!);
    }
    if (kind !== 'arco') frisoGreca(g, x0, 196, x1 - x0, C.ea1);
  });
  for (let i = 0; i <= SALON_BAYS.length; i++) columnaSalon(g, hallBayX(i));
  // Entrada (izquierda): umbral oscuro.
  g.rect(C.ink, 0, 60, 70, 154); g.rect(C.st2, 70, 60, 2, 154);
  for (let s = 0; s < 3; s++) g.rect(C.st1, 0, 60 - s * 6, 76 + s * 4, 6);
  // Piso de piedra pulida con una película de agua: reflejos de los vitrales y ondas.
  for (let y = 214; y < 345; y++) {
    const t = (y - 214) / 131, rowH = 6 + Math.round(t * 12);
    for (let x = 0; x < w; x++) {
      const tile = ((y - 214) % rowH === 0) || ((x + Math.floor((y - 214) / rowH) * 37) % 64 === 0);
      g.set(tile ? C.ink : bayer(x, y) < 0.12 ? C.st1 : C.st0, x, y);
    }
  }
  for (const v of cdmx2Vitrales('salon_trono')) {
    const cx = (v.x0 + v.x1) / 2;
    for (let y = 216; y < 330; y++) {
      const spread = (v.x1 - v.x0) / 2 * (0.8 + (y - 216) / 114 * 0.5), wob = Math.sin(y * 0.5) * 3;
      for (let x = Math.floor(cx - spread); x < cx + spread; x++) {
        const k = (1 - Math.abs(x - cx) / spread) * (1 - (y - 216) / 114) * 0.45;
        if (Math.floor(y / 2) % 2 === 0) g.veil(motivo(v.motif, (x - cx) / (spread * 2) + 0.5, 1 - (y - 216) / 140), x + wob, y, k);
      }
    }
  }
  const mirror = hallBayX(6) + 100;
  for (let y = 216; y < 300; y++) for (let x = mirror - 50; x < mirror + 50; x++) if (Math.floor(y / 2) % 2 === 0) g.veil(C.pu0, x + Math.sin(y * 0.4) * 2, y, (1 - Math.abs(x - mirror) / 50) * 0.5);
  for (let k = 0; k < 26; k++) {
    const cx = hash(k, 1, 350) * w, cy = 230 + hash(k, 2, 350) * 105, rx = 6 + hash(k, 3, 350) * 14;
    for (let a = 0; a < Math.PI * 2; a += 0.08) if (Math.sin(a * 3 + k) > -0.2) g.set(C.mtn0, cx + Math.cos(a) * rx, cy + Math.sin(a) * rx * 0.25);
  }
  for (let y = 214; y < 222; y++) for (let x = 0; x < w; x++) g.veil(C.ink, x, y, 0.8 - (y - 214) * 0.1);
  g.rect(C.ink, 0, 345, w, 15); g.rect(C.st1, 0, 345, w, 1);
  frisoGreca(g, 0, 349, w, C.st1, 'greca');
}

/** Primer plano del salón: basas de columnas cercanas y cadenas que cuelgan. */
function salFront(g: Lienzo, w: number): void {
  for (let k = 0, x = 260; x < w; k++) {
    g.rect(C.ink, x, 0, 30, 360); g.rect(C.st0, x, 0, 3, 360); g.rect(C.pu0, x + 27, 0, 1, 360);
    for (let s = 0; s < 3; s++) g.rect(C.ink, x - 6 - s * 3, 330 + s * 10, 42 + s * 6, 10);
    x += 520 + Math.round(hash(k, 1, 360) * 240);
  }
  for (let k = 0, x = 120; x < w; k++) {
    const len = 40 + Math.round(hash(k, 2, 361) * 50);
    for (let y = 0; y < len; y += 3) { g.rect(C.st0, x, y, 2, 2); g.set(C.st1, x, y); }
    g.rect(C.st0, x - 2, len, 6, 4);
    x += 180 + Math.round(hash(k, 3, 361) * 160);
  }
}

/* ================================ DESPACHO ================================ */

/** Dibuja una capa completa (0–5) de una sección en un lienzo nuevo del tamaño de cdmx2LayerSize. */
export function drawCdmx2Layer(section: Cdmx2Section, index: number, width: number, height = 360): Lienzo {
  const g = new Lienzo(width, height);
  const table: Record<Cdmx2Section, Array<(g: Lienzo, w: number) => void>> = {
    teleferico: [telSky, telFar, telMid, telNear, telCabin, telFront],
    torre: [torSky, torFar, torMid, torNear, torInterior, torFront],
    salon_trono: [salSky, salFar, salMid, salNear, salInterior, salFront],
  };
  table[section][index](g, width);
  return g;
}
