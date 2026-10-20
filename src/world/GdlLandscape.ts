/**
 * Paisaje del Nivel 10 (Guadalajara, el final) y arte del epílogo.
 * - gdl_avenida: avenida tapatía en ruinas (portales de cantera, balcones, jacarandas secas, rieles
 *   del tranvía) bajo una tarde que se apaga; al fondo la silueta de un estadio genérico (sin logos).
 *   El sol NO está pintado: lo dibuja GdlScenery para poder eclipsarlo (setEclipse).
 * - catedral: nave de la Catedral Metropolitana (columnas con capiteles dorados, bóvedas de crucería,
 *   vitrales, órgano, alfombra, ábside dorado con el altar mayor a la derecha, x ≈ 1600).
 * - catedral_eclipse: la misma nave con el techo arrancado: cielo negro del Gran Eclipse, estrellas,
 *   Tzitzimime lejanas como constelaciones, muros rotos, escombro en las orillas y centro despejado.
 * - epílogo: taller de la madre en Xalapa de día y el Códice abierto (páginas con tinta y en blanco).
 * Sin Phaser ni DOM (lo usa también tools/gen-gdl-scenery.mjs). Solo paleta ART_SPEC §3.
 */
import { C, Lienzo, bayer, frisoGreca, grieta, halo, hash, miniText, noise1, noise2, ramp } from './CdmxPixels';

export type GdlSection = 'gdl_avenida' | 'catedral' | 'catedral_eclipse';
export const GDL_BG_PREFIX: Record<GdlSection, string> = {
  gdl_avenida: 'fondo_gdl_avenida', catedral: 'fondo_catedral', catedral_eclipse: 'fondo_catedral_eclipse',
};
export const GDL_SECTION_WIDTH: Record<GdlSection, number> = { gdl_avenida: 2600, catedral: 1800, catedral_eclipse: 1600 };

/** Pantallas fijas del epílogo (640×360, una imagen cada una). */
export const GDL_EPILOGO_KEYS = { taller: 'epilogo_taller', codice: 'epilogo_codice' } as const;
export type GdlEpilogo = keyof typeof GDL_EPILOGO_KEYS;

const FACTORS = [0.04, 0.15, 0.4, 0.65, 1, 1.25] as const; // = PARALLAX_FACTORS de src/config/game.ts

export function gdlLayerSize(_section: GdlSection, index: number, levelWidth: number): { w: number; h: number } {
  return { w: Math.ceil(640 + (levelWidth - 640) * FACTORS[index]), h: 360 };
}

/* ============================ DISPOSICIÓN (mundo) ============================ */

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface GdlVitral extends Rect { tint: string; motif: 'rosa' | 'santo' | 'sol' | 'flor'; broken?: boolean }
export interface GdlLamp { x: number; y: number; tint: string; kind: 'vela' | 'puerta' | 'capilla' | 'farol' }

const BAY = 200;
const NAVE_X0 = 100;
/** Bahías de la nave (desde x = 100, cada 200 px). */
export type NaveBay = 'arco' | 'vitral' | 'organo' | 'abside' | 'roto';
export const CATEDRAL_BAYS: readonly NaveBay[] = ['arco', 'vitral', 'arco', 'organo', 'arco', 'vitral', 'arco', 'abside'];
export const ECLIPSE_BAYS: readonly NaveBay[] = ['arco', 'roto', 'arco', 'roto', 'arco', 'roto', 'abside'];
const bayX = (i: number): number => NAVE_X0 + i * BAY;

/** Puntos de referencia del mundo (x del suelo, y en la franja 222…345). El JSON del nivel manda. */
export const GDL_LANDMARKS = {
  gdl_avenida: {
    entrada: { x: 80, y: 290 },
    /** Letras turísticas GUADALAJARA (prop_n10_letras_gdl, 304×76) sobre la banqueta. */
    letras: { x: 1180, y: 240 },
    /** Hueco despejado para el último Altar de la Memoria + checkpoint (sin pintura encima). */
    altar: { x: 1380, y: 250 },
    checkpoint: { x: 1330, y: 292 },
    /** Tramos sugeridos para los 3 encuentros. */
    encuentros: [{ x0: 360, x1: 1000 }, { x0: 1480, x1: 1980 }, { x0: 2000, x1: 2380 }],
    /** Tranvía abandonado y autos (obstáculos). */
    tranvia: { x: 760, y: 250 },
    /** Portal de la Catedral pintado al final (salida a `catedral`). */
    puertaCatedral: { x: 2440, y: 226 },
  },
  catedral: {
    entrada: { x: 70, y: 292 },
    /** Arena de la oleada final (entre columnas). */
    arena: { x0: 240, x1: 1380 },
    organo: { x: 800, y: 226 },
    /** Altar mayor (prop_n10_altar_mayor) frente al ábside dorado. */
    altarMayor: { x: 1600, y: 238 },
    /** La madre encadenada y las cadenas (prop_n10_cadenas, misma x/y que la madre). */
    madre: { x: 1600, y: 252 },
    /** Donde el jugador cae en la emboscada. */
    emboscada: { x: 1470, y: 292 },
  },
  catedral_eclipse: {
    entrada: { x: 90, y: 292 },
    altarMayor: { x: 1400, y: 238 },
    madre: { x: 1400, y: 252 },
    /** Jugador atado junto al altar (player:bound). */
    atado: { x: 1300, y: 286 },
    /** Arena despejada de la pelea final y lugar del capullo (lo dibuja enemigos). */
    arena: { x0: 260, x1: 1260 },
    centro: { x: 760, y: 290 },
    capullo: { x: 760, y: 262 },
    /** Por donde bajan las Tzitzimime (sombras en el suelo). */
    descenso: [{ x: 500, y: 284 }, { x: 760, y: 262 }, { x: 1020, y: 300 }],
  },
} as const;

/** Vitrales (mundo) de la nave: el decorado los hace brillar. */
export function gdlVitrales(section: GdlSection): GdlVitral[] {
  if (section === 'gdl_avenida') return [];
  const bays = section === 'catedral' ? CATEDRAL_BAYS : ECLIPSE_BAYS;
  const tints = [C.ro2, C.tq2, C.wa2, C.pu2];
  const out: GdlVitral[] = [];
  bays.forEach((k, i) => {
    const cx = bayX(i) + BAY / 2;
    if (k === 'abside') {
      if (section === 'catedral') out.push({ x0: cx - 30, y0: 18, x1: cx + 30, y1: 78, tint: C.ro2, motif: 'rosa' });
      return;
    }
    if (k === 'vitral') out.push({ x0: cx - 30, y0: 56, x1: cx + 30, y1: 186, tint: tints[i % 4], motif: i % 2 ? 'santo' : 'sol' });
    else if (k === 'roto') out.push({ x0: cx - 30, y0: 110, x1: cx + 30, y1: 186, tint: tints[i % 4], motif: 'santo', broken: true });
    else if (section === 'catedral' && k !== 'organo') out.push({ x0: cx - 26, y0: 58, x1: cx + 26, y1: 104, tint: tints[(i + 1) % 4], motif: 'flor' });
  });
  return out;
}

/** Luces pintadas (mundo) para los halos del decorado. */
export function gdlLamps(section: GdlSection): GdlLamp[] {
  const out: GdlLamp[] = [];
  if (section === 'gdl_avenida') {
    out.push({ x: 2445, y: 170, tint: C.wa2, kind: 'puerta' });
    for (const x of [2370, 2490]) out.push({ x, y: 196, tint: C.wa2, kind: 'vela' });
    return out;
  }
  const bays = section === 'catedral' ? CATEDRAL_BAYS : ECLIPSE_BAYS;
  bays.forEach((k, i) => {
    const cx = bayX(i) + BAY / 2;
    if (k === 'vitral') for (const dx of [-20, 0, 20]) out.push({ x: cx + dx, y: 198, tint: C.wa2, kind: 'vela' });
    if (k === 'abside') out.push({ x: cx, y: 120, tint: C.wa3, kind: 'capilla' });
  });
  if (section === 'catedral') out.push({ x: 40, y: 150, tint: C.wa3, kind: 'puerta' });
  return out;
}

/* ============================ AYUDAS DE DIBUJO ============================ */

const fbm = (x: number, y: number, seed: number): number =>
  noise2(x, y, seed) * 0.55 + noise2(x * 2.1, y * 2.1, seed + 1) * 0.3 + noise2(x * 4.3, y * 4.3, seed + 2) * 0.15;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Bandas de nubes (estratos) con borde iluminado. */
function nubes(g: Lienzo, w: number, y0: number, y1: number, seed: number, o: { th: number; sx: number; sy: number; body: [string, string]; rim: string; rimTop?: boolean }): void {
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y++) {
    const env = Math.sin(clamp01((y - y0) / (y1 - y0)) * Math.PI) * 0.15 - o.th;
    for (let x = 0; x < w; x++) {
      const k = fbm(x * o.sx, y * o.sy, seed) + env;
      if (k <= 0) continue;
      const edge = fbm(x * o.sx, (y + (o.rimTop ? -3 : 3)) * o.sy, seed) + env <= 0;
      g.set(edge && bayer(x, y) < 0.7 ? o.rim : k > 0.08 ? o.body[1] : o.body[0], x, y);
    }
  }
}

/** Campo de estrellas (solo sobre colores muy oscuros). */
function estrellas(g: Lienzo, w: number, y0: number, y1: number, n: number, seed: number): void {
  const dark = new Set<string>([C.ink, C.void, C.deep, C.night, C.pu0]);
  for (let i = 0; i < n; i++) {
    const x = Math.round(hash(i, 1, seed) * w), y = Math.round(y0 + hash(i, 2, seed) * (y1 - y0));
    const c = g.get(x, y);
    if (c && !dark.has(c)) continue;
    const r = hash(i, 3, seed);
    g.set(r > 0.93 ? C.sh1 : r > 0.8 ? C.tq3 : r > 0.7 ? C.pu3 : r > 0.4 ? C.mtn2 : C.mtn1, x, y);
    if (r > 0.97) { g.set(C.mtn2, x - 1, y); g.set(C.mtn2, x + 1, y); g.set(C.mtn2, x, y - 1); g.set(C.mtn2, x, y + 1); }
  }
}

/** Arco de medio punto (true si (lx, ly) cae dentro del vano). r = radio, top = y de la clave. */
const enArco = (lx: number, ly: number, cx: number, top: number, r: number): boolean =>
  ly >= top + r ? Math.abs(lx - cx) < r : Math.hypot(lx - cx, ly - (top + r)) < r;
/** Arco apuntado (ojival). */
const enOjiva = (lx: number, ly: number, cx: number, top: number, r: number): boolean => {
  const sy = top + r * 1.25;
  if (ly >= sy) return Math.abs(lx - cx) < r;
  if (ly < top) return false;
  const dy = sy - ly;
  // Dos arcos de radio 1.6r con centros desplazados.
  const R = r * 1.6, off = R - r;
  return Math.hypot(Math.abs(lx - cx) + off, dy) < R;
};

/** Jacaranda seca: tronco torcido, ramas desnudas y unas pocas flores moradas. Raíz en (x, base). */
export function jacarandaSeca(g: Lienzo, x: number, base: number, h: number, seed: number, bloom = 0.3): void {
  const tips: Array<[number, number]> = [];
  const rama = (x0: number, y0: number, ang: number, len: number, th: number, depth: number): void => {
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    const n = Math.ceil(len);
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x0 + (x1 - x0) * t + Math.sin(t * 5 + seed) * len * 0.05, py = y0 + (y1 - y0) * t;
      const w = Math.max(1, Math.round(th * (1 - t * 0.4)));
      g.rect(C.ea1, px - w / 2, py, w, 1);
      if (w > 1) g.set(C.ea2, px - w / 2, py);
    }
    if (depth <= 0 || len < 4) { tips.push([x1, y1]); return; }
    const k = 2 + (hash(depth, 1, seed + x0 | 0) > 0.6 ? 1 : 0);
    for (let j = 0; j < k; j++) {
      const da = (j - (k - 1) / 2) * 0.55 + (hash(j, depth, seed + y0 | 0) - 0.5) * 0.5;
      rama(x1, y1, ang + da, len * (0.62 + hash(j, 9, seed + depth) * 0.18), th * 0.62, depth - 1);
    }
  };
  // Tronco (base ancha con raíces).
  for (let y = 0; y < h * 0.38; y++) {
    const w = Math.round(5 - y / (h * 0.38) * 2), sway = Math.sin(y * 0.08 + seed) * 2;
    g.rect(C.ea1, x + sway - w / 2, base - y, w, 1); g.set(C.ea2, x + sway - w / 2, base - y); g.set(C.ea0, x + sway + w / 2 - 1, base - y);
  }
  g.rect(C.ea0, x - 6, base - 1, 12, 2);
  const topY = base - h * 0.38;
  rama(x + Math.sin(h * 0.38 * 0.08 + seed) * 2, topY, -Math.PI / 2 - 0.5, h * 0.3, 3, 3);
  rama(x + Math.sin(h * 0.38 * 0.08 + seed) * 2, topY, -Math.PI / 2 + 0.45, h * 0.32, 3, 3);
  rama(x, topY + 6, -Math.PI / 2 + 0.05, h * 0.26, 2, 2);
  // Flores que aguantan en las puntas y algunas hojas secas.
  tips.forEach(([tx, ty], i) => {
    if (hash(i, 2, seed) > bloom) { if (hash(i, 5, seed) > 0.6) g.set(C.ea3, tx, ty); return; }
    for (let k = 0; k < 7; k++) {
      const px = tx + (hash(i, k, seed + 3) - 0.5) * 7, py = ty + (hash(k, i, seed + 4) - 0.5) * 5;
      const r = hash(i + k, 6, seed);
      g.set(r > 0.75 ? C.pu3 : r > 0.35 ? C.pu2 : C.pu1, px, py);
    }
  });
  // Pétalos caídos al pie.
  for (let k = 0; k < 14; k++) g.set(hash(k, 7, seed) > 0.5 ? C.pu2 : C.pu1, x + (hash(k, 8, seed) - 0.5) * h * 0.6, base - hash(k, 9, seed) * 3);
}

/** Fachada tapatía: aplanado con desconchados, cornisa, balcones de herrería y portal de arcos. */
type Muro = readonly [string, string, string];
const MUROS_GDL: readonly Muro[] = [
  [C.sk1, C.sk0, C.sk2], // cantera rosada
  [C.ea3, C.ea2, C.ea4], // cantera amarilla
  [C.te2, C.te1, C.te3], // almagre
  [C.st4, C.st3, C.st5], // cal sucia
  [C.wa1, C.wa0, C.wa2], // amarillo
  [C.mtn1, C.mtn0, C.mtn2], // añil
];
function fachada(g: Lienzo, x0: number, w: number, top: number, pal: Muro, seed: number, o: { portal?: boolean; sign?: string; collapsed?: boolean; graffiti?: boolean; oneStory?: boolean } = {}): void {
  const [b, d, l] = pal, base = 214;
  for (let y = top; y < base; y++) for (let x = x0; x < x0 + w; x++) {
    const n = noise2(x * 0.09, y * 0.09, seed);
    let c: string = n < 0.22 ? d : n > 0.8 && bayer(x, y) < 0.5 ? l : b;
    if (noise2(x * 0.045, y * 0.06, seed + 3) > 0.74) {
      // Desconchado: se ve el ladrillo.
      c = (y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0) ? C.te0 : C.te2;
    }
    g.set(c, x, y);
  }
  // Humedad en el zócalo y pilastras de las orillas.
  for (let y = base - 26; y < base; y++) for (let x = x0; x < x0 + w; x++) g.veil(C.ea1, x, y, (y - (base - 26)) / 26 * 0.55);
  g.rect(l, x0, top, 2, base - top); g.rect(d, x0 + w - 2, top, 2, base - top);
  // Cornisa con dentículos y pretil con remates.
  g.rect(l, x0 - 2, top, w + 4, 2); g.rect(b, x0 - 2, top + 2, w + 4, 2); g.rect(d, x0 - 1, top + 4, w + 2, 2);
  for (let x = x0; x < x0 + w; x += 3) g.set(d, x, top + 6);
  g.rect(b, x0, top - 8, w, 8); g.rect(l, x0, top - 8, w, 1);
  for (const px of [x0 + 1, x0 + w - 6]) { g.rect(b, px, top - 14, 5, 6); g.rect(l, px, top - 14, 5, 1); g.ellipse(l, px + 2, top - 16, 2, 2); }
  // Piso alto: ventanas con balcón de herrería.
  const n = o.oneStory ? 0 : Math.max(1, Math.floor((w - 12) / 34));
  for (let i = 0; i < n; i++) {
    const wx = Math.round(x0 + (w / n) * (i + 0.5) - 7), wy = top + 16;
    g.rect(l, wx - 2, wy - 3, 18, 31); g.rect(d, wx - 2, wy - 3, 18, 1);
    const open = hash(i, 1, seed) > 0.5;
    g.rect(C.ink, wx, wy, 14, 27);
    if (open) { g.rect(C.ea1, wx, wy, 3, 27); g.rect(C.ea1, wx + 11, wy, 3, 27); g.rect(C.ea2, wx, wy, 1, 27); }
    else { g.rect(C.ea1, wx, wy, 14, 27); g.rect(C.ea2, wx, wy, 14, 1); for (let yy = wy + 3; yy < wy + 26; yy += 3) g.rect(C.ea0, wx + 1, yy, 12, 1); g.rect(C.ea0, wx + 7, wy, 1, 27); }
    if (hash(i, 2, seed) > 0.75) { g.rect(C.ink, wx + 2, wy + 4, 6, 8); g.set(C.st2, wx + 3, wy + 5); } // vidrio roto
    // Balcón: losa, barrotes y pasamanos.
    g.rect(d, wx - 5, wy + 27, 24, 3); g.rect(l, wx - 5, wy + 27, 24, 1);
    for (let k = 0; k < 24; k += 2) g.rect(C.ink, wx - 5 + k, wy + 18, 1, 9);
    g.rect(C.ink, wx - 5, wy + 17, 24, 1);
    for (let k = 2; k < 22; k += 6) { g.set(C.ink, wx - 4 + k, wy + 21); g.set(C.ink, wx - 3 + k, wy + 22); g.set(C.ink, wx - 2 + k, wy + 21); }
    if (hash(i, 3, seed) > 0.55) for (let k = 0; k < 8; k++) g.set(hash(k, i, seed) > 0.5 ? C.fo3 : C.fo2, wx - 4 + hash(k, 4, seed + i) * 22, wy + 14 + hash(k, 5, seed) * 4); // macetas secas
  }
  // Planta baja.
  const gy = 150;
  g.rect(d, x0, gy - 4, w, 2); g.rect(l, x0, gy - 2, w, 1);
  if (o.portal !== false) {
    // Portal de arcos (sombra profunda con puertas al fondo).
    const span = 30, count = Math.max(1, Math.floor((w - 8) / span));
    const ox = x0 + Math.round((w - count * span) / 2);
    for (let a = 0; a < count; a++) {
      const cx = ox + a * span + span / 2;
      for (let y = gy + 4; y < base; y++) for (let x = cx - 12; x <= cx + 12; x++) {
        if (!enArco(x, y, cx, gy + 6, 12)) continue;
        const depth = (y - gy) / (base - gy);
        g.set(bayer(x, y) < 0.25 + depth * 0.3 ? C.void : C.ink, x, y);
      }
      // Dovelas y clave.
      for (let k = 0; k <= 20; k++) { const t = Math.PI + k / 20 * Math.PI; g.set(l, cx + Math.cos(t) * 13, gy + 18 + Math.sin(t) * 13); }
      g.rect(l, cx - 1, gy + 3, 3, 3);
      // Puerta al fondo, a veces con luz de vela.
      if (hash(a, 6, seed) > 0.45) { g.rect(C.ea0, cx - 5, base - 26, 10, 26); g.rect(C.ea1, cx - 4, base - 25, 3, 25); if (hash(a, 7, seed) > 0.7) g.rect(C.wa0, cx + 1, base - 24, 3, 6); }
    }
  } else {
    // Accesorias: cortinas metálicas y puertas.
    const doors = Math.max(1, Math.floor(w / 44));
    for (let i = 0; i < doors; i++) {
      const dx = Math.round(x0 + (w / doors) * (i + 0.5) - 14);
      g.rect(l, dx - 2, gy + 10, 32, 54);
      for (let y = gy + 12; y < base; y++) g.rect(y % 3 ? C.st3 : C.st2, dx, y, 28, 1);
      if (hash(i, 8, seed) > 0.5) { const up = 14 + Math.round(hash(i, 9, seed) * 18); g.rect(C.ink, dx, base - up, 28, up); }
      for (let k = 0; k < 6; k++) if (hash(k, i, seed + 12) > 0.5) g.set(C.te2, dx + hash(k, 1, seed) * 28, gy + 14 + hash(k, 2, seed) * 40); // óxido
    }
  }
  // Letrero del comercio.
  if (o.sign) {
    const sw = o.sign.length * 4 + 5, sx = Math.round(x0 + w / 2 - sw / 2);
    g.rect(C.ink, sx - 1, gy - 15, sw + 2, 11); g.rect(C.st1, sx, gy - 14, sw, 9);
    miniText(g, C.st5, o.sign, sx + 3, gy - 12);
    for (let k = 0; k < 4; k++) g.set(C.te1, sx + 1 + hash(k, 3, seed) * (sw - 2), gy - 14 + hash(k, 4, seed) * 9);
  }
  // Grafiti de la Cofradía: espejo negro (círculo con rayos).
  if (o.graffiti) {
    const cx = x0 + Math.round(w * (0.25 + hash(1, 1, seed) * 0.5)), cy = 130;
    for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; for (let r = 7; r < 11; r++) g.set(C.pu1, cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.9); }
    g.ellipse(C.pu1, cx, cy, 6, 5); g.ellipse(C.ink, cx, cy, 4, 4);
    for (let k = 0; k < 6; k++) g.set(C.pu1, cx - 5 + k * 2, cy + 8 + k % 3); // escurrido
  }
  grieta(g, x0 + w * 0.3, top + 8, 50, d, seed, 0.2);
  if (o.collapsed) {
    // Derrumbe: se come el remate y medio piso alto en diagonal irregular.
    for (let x = x0 - 2; x < x0 + w + 2; x++) {
      const cut = top - 16 + Math.round(noise1((x - x0) * 0.12, seed) * 22 + clamp01((x - x0) / w) * 52);
      g.erase(x, 0, 1, Math.max(0, cut));
      if (g.has(x, cut)) { g.set(C.te2, x, cut); if (bayer(x, cut) < 0.5) g.set(C.te0, x, cut + 1); }
    }
  }
}

/** Farola de herrería (apagada, pintada). */
function farolPintado(g: Lienzo, x: number, base: number): void {
  g.rect(C.ink, x - 1, base - 70, 2, 70); g.rect(C.ink, x - 3, base - 4, 6, 4);
  g.rect(C.ink, x - 6, base - 72, 12, 2); g.rect(C.st1, x - 4, base - 82, 8, 10); g.rect(C.st3, x - 3, base - 81, 6, 1);
  g.rect(C.ink, x - 5, base - 84, 10, 2); g.set(C.ink, x, base - 86);
}

/* ============================ GDL AVENIDA ============================ */

function aveSky(g: Lienzo, w: number): void {
  ramp(g, [C.deep, C.night, C.mtn0, C.pu0, C.te0, C.te1, C.te2, C.wa1], 0, 290, w);
  // Resplandor del sol (el disco lo dibuja el código para eclipsarlo) en x ≈ 0.6 w.
  const sx = Math.round(w * 0.6), sy = 60;
  halo(g, sx, sy, 210, 150, C.te1, 0.55); halo(g, sx, sy, 130, 95, C.te2, 0.5); halo(g, sx, sy, 60, 46, C.wa1, 0.45);
  nubes(g, w, 30, 130, 1001, { th: 0.5, sx: 0.006, sy: 0.06, body: [C.pu0, C.te0], rim: C.te2 });
  nubes(g, w, 120, 240, 1002, { th: 0.48, sx: 0.005, sy: 0.05, body: [C.te0, C.te1], rim: C.wa1, rimTop: true });
  // Rayos de sol atravesando las nubes (tramados finos).
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * 0.18 + k / 9 * Math.PI * 0.64;
    for (let r = 50; r < 260; r++) {
      const x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r;
      if (bayer(Math.round(x), Math.round(y)) < (1 - r / 260) * 0.25) g.set(C.wa1, x, y);
    }
  }
  estrellas(g, w, 0, 50, 20, 1003);
}

function aveFar(g: Lienzo, w: number): void {
  // Cerros del fondo (sierra genérica) en bruma de tarde.
  for (let x = 0; x < w; x++) {
    const top = 140 - noise1(x * 0.012, 1101) * 36 - noise1(x * 0.05, 1102) * 8;
    for (let y = Math.floor(top); y < 360; y++) g.set(y < top + 2 ? C.te1 : bayer(x, y) < 0.15 ? C.te0 : C.pu0, x, y);
  }
  // Estadio genérico (montículo verde con anillo de techo blanco; sin logos ni marcas).
  const cx = Math.round(w * 0.58), base = 126, half = 150, hh = 56;
  for (let x = cx - half; x < cx + half; x++) {
    const t = Math.abs(x - cx) / half;
    const top = base - hh * clamp01((1 - t) / 0.32);
    for (let y = Math.floor(top); y < 360; y++) {
      const terr = (y - Math.floor(top)) % 6 === 0;
      const rib = (x - cx + 400) % 7 === 0;
      let c: string = y < top + 1 ? C.te2 : terr || rib ? C.fo0 : bayer(x, y) < 0.2 ? C.fo2 : C.fo1;
      // Bruma de distancia: el verde se apaga hacia el pie.
      if (bayer(x, y) < 0.35 + clamp01((y - top) / 60) * 0.3 && y > top + 1) c = (x - cx) > half * 0.3 ? C.pu0 : C.te0;
      g.set(c, x, y);
    }
  }
  // Anillo del techo con huecos (roto) y su sombra; estructuras de acceso.
  const ry = base - hh - 7;
  for (let x = cx - half + 30; x < cx + half - 30; x++) {
    if (noise1((x - cx) * 0.08, 1103) > 0.78) continue;
    g.rect(C.st4, x, ry, 1, 3); g.set(C.st5, x, ry); g.set(C.st2, x, ry + 3);
    if (x % 9 === 0) g.rect(C.st2, x, ry + 3, 1, 4);
  }
  for (const dx of [-80, -30, 30, 80]) { g.rect(C.ink, cx + dx - 3, base - 10, 6, 10); g.rect(C.st1, cx + dx - 3, base - 10, 6, 1); }
  // Torres lejanas recortadas y columnas de humo.
  for (let k = 0, x = 20; x < w; k++) {
    const bw = 10 + Math.round(hash(k, 1, 1104) * 14), bh = 30 + Math.round(hash(k, 2, 1104) * 60);
    if (Math.abs(x + bw / 2 - cx) > half + 20) {
      for (let y = 136 - bh; y < 200; y++) for (let lx = 0; lx < bw; lx++) {
        if (y < 136 - bh + noise1(lx * 0.3, k) * 10 && hash(k, 4) > 0.5) continue;
        g.set(lx === 0 ? C.te1 : (lx % 3 === 1 && (y % 4) === 1 && hash(lx, y, k) < 0.05) ? C.wa0 : C.pu0, x + lx, y);
      }
    }
    x += bw + 18 + Math.round(hash(k, 3, 1104) * 50);
  }
  for (const sx of [w * 0.18, w * 0.86]) {
    for (let y = 20; y < 170; y++) {
      const t = (170 - y) / 150, wob = Math.sin(y * 0.05 + sx) * 10 * t + t * 40;
      for (let lx = -8 - t * 16; lx < 8 + t * 16; lx++) if (noise2((sx + lx) * 0.06, y * 0.05, 1105) > 0.4 + t * 0.2) g.veil(C.st1, sx + lx + wob, y, 0.5 - t * 0.3);
    }
  }
  for (let y = 150; y < 190; y++) for (let x = 0; x < w; x++) g.veil(C.te1, x, y, (1 - Math.abs(y - 168) / 22) * 0.35);
}

/** Torre genérica de templo neogótico (aguja) en silueta. */
function aguja(g: Lienzo, cx: number, base: number, h: number, body: string, rim: string): void {
  const shaft = h * 0.55;
  for (let y = base - shaft; y < base; y++) { g.rect(body, cx - 9, y, 18, 1); g.set(rim, cx - 9, y); }
  for (let y = base - h; y < base - shaft; y++) { const hw = Math.round((y - (base - h)) / (h - shaft) * 9); g.rect(body, cx - hw, y, hw * 2 + 1, 1); g.set(rim, cx - hw, y); }
  for (const dx of [-12, 12]) for (let y = base - shaft - 10; y < base; y++) { const hw = y < base - shaft ? 1 : 2; g.rect(body, cx + dx - hw, y, hw * 2, 1); }
  g.rect(C.ink, cx - 3, base - shaft + 10, 6, 14); g.rect(C.ink, cx - 2, base - shaft + 30, 4, 10);
  g.set(rim, cx, base - h - 2); g.rect(rim, cx - 2, base - h - 4, 5, 1);
}

/** Cúpula de azulejos (amarillo y azul, como las del centro tapatío). */
function cupula(g: Lienzo, cx: number, base: number, r: number, rim: string): void {
  g.rect(C.st2, cx - r - 2, base, r * 2 + 4, 14); g.rect(rim, cx - r - 2, base, r * 2 + 4, 1);
  for (let k = -r + 3; k < r - 3; k += 6) g.rect(C.ink, cx + k, base + 4, 2, 7);
  for (let y = 0; y <= r; y++) {
    const hw = Math.round(Math.sqrt(r * r - (r - y) ** 2));
    for (let x = -hw; x <= hw; x++) {
      const band = Math.floor((x + r) / 4) % 2, row = Math.floor(y / 3) % 2;
      g.set(x === -hw ? rim : band ^ row ? C.wa1 : C.tq1, cx + x, base - r + y);
    }
  }
  g.rect(C.st3, cx - 2, base - r - 8, 5, 8); g.rect(C.wa2, cx, base - r - 13, 1, 5); g.rect(C.wa2, cx - 2, base - r - 11, 5, 1);
}

function aveMid(g: Lienzo, w: number): void {
  // Skyline medio: rascacielos rotos, agujas, cúpulas y un espectacular caído.
  for (let k = 0, x = 10; x < w; k++) {
    const kind = hash(k, 1, 1201);
    if (kind < 0.14) { aguja(g, x + 12, 236, 100 + Math.round(hash(k, 2, 1201) * 30), C.st0, C.te1); x += 80; continue; }
    if (kind < 0.36) { cupula(g, x + 20, 214, 16, C.te1); g.rect(C.st0, x, 228, 44, 12); x += 70; continue; }
    const bw = 22 + Math.round(hash(k, 3, 1201) * 26), bh = 40 + Math.round(hash(k, 4, 1201) * 70), top = 236 - bh;
    for (let y = top; y < 240; y++) for (let lx = 0; lx < bw; lx++) {
      if (hash(k, 5) > 0.5 && y < top + noise1(lx * 0.2, k) * bh * 0.3) continue;
      let c: string = lx < 1 ? C.te1 : lx > bw * 0.7 ? C.ink : C.st0;
      if (lx > 1 && lx < bw - 2 && (y - top) % 6 >= 3 && lx % 4 >= 2) { const r = hash(lx >> 2, (y - top) / 6 | 0, k); c = r < 0.04 ? C.wa1 : r < 0.1 ? C.wa0 : C.ink; }
      g.set(c, x + lx, y);
    }
    x += bw + 24 + Math.round(hash(k, 6, 1201) * 70);
  }
  // Espectacular caído (sin marcas: solo el armazón y lona rota).
  const bx = Math.round(w * 0.42);
  g.line(C.ink, bx, 236, bx + 6, 160, 2); g.line(C.ink, bx + 50, 236, bx + 44, 168, 2);
  for (let y = 0; y < 26; y++) g.rect(y < 2 ? C.te1 : C.st1, bx - 4 + y * 0.3, 150 + y, 62, 1);
  for (let k = 0; k < 20; k++) g.erase(bx + 4 + hash(k, 1, 1202) * 50, 154 + hash(k, 2, 1202) * 20, 3, 2);
  // Bruma de humo bajo.
  for (let y = 200; y < 250; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.02, y * 0.08, 1203) > 0.5) g.veil(C.te0, x, y, (y - 200) / 50 * 0.6);
  g.rect(C.ink, 0, 240, w, 120);
}

/** Monumento de arcos triunfales (genérico, tres vanos con balaustrada). */
function arcosMonumento(g: Lienzo, cx: number, base: number): void {
  const W = 120, H = 104, x0 = cx - W / 2, top = base - H;
  for (let y = top; y < base; y++) for (let x = x0; x < x0 + W; x++) g.set(noise2(x * 0.1, y * 0.1, 1301) < 0.3 ? C.ea2 : x < x0 + 2 ? C.ea4 : C.ea3, x, y);
  for (const [ax, r] of [[cx, 22], [x0 + 18, 10], [x0 + W - 18, 10]] as const) {
    const at = r > 15 ? top + 24 : top + 46;
    for (let y = at; y < base; y++) for (let x = ax - r; x <= ax + r; x++) if (enArco(x, y, ax, at, r)) g.set(bayer(x, y) < 0.3 ? C.te0 : C.ink, x, y);
    for (let k = 0; k <= 16; k++) { const t = Math.PI + k / 16 * Math.PI; g.set(C.ea4, ax + Math.cos(t) * (r + 1), at + r + Math.sin(t) * (r + 1)); }
  }
  g.rect(C.ea4, x0 - 3, top - 2, W + 6, 3); g.rect(C.ea2, x0 - 3, top + 1, W + 6, 2);
  for (let x = x0; x < x0 + W; x += 4) { g.rect(C.ea3, x, top - 10, 2, 8); g.set(C.ea4, x, top - 10); }
  g.rect(C.ea4, x0 - 3, top - 12, W + 6, 2);
  for (const sx of [x0 + 34, x0 + W - 38]) { g.rect(C.ea2, sx, top + 10, 4, 40); g.rect(C.ea4, sx, top + 10, 1, 40); }
  grieta(g, cx + 10, top, 40, C.ea1, 1302, 0.3);
}

function aveNear(g: Lienzo, w: number): void {
  // Azoteas, campanarios y cúpulas cercanas que asoman sobre las fachadas (visibles también por los derrumbes).
  for (let k = 0, x = 0; x < w; k++) {
    const kind = hash(k, 1, 1401);
    if (kind < 0.1) {
      // Campanario de cantera.
      const cx = x + 18, top = 70 + Math.round(hash(k, 2, 1401) * 30);
      for (let y = top; y < 240; y++) g.rect(y < top + 2 ? C.ea4 : C.ea2, cx - 12, y, 24, 1);
      g.rect(C.ea3, cx - 12, top, 2, 240 - top);
      for (const by of [top + 14, top + 46]) { g.rect(C.ink, cx - 6, by, 12, 18); for (let k2 = 0; k2 <= 10; k2++) g.set(C.ink, cx - 6 + k2 * 1.2, by - Math.sin(k2 / 10 * Math.PI) * 5); g.ellipse(C.ea0, cx, by + 8, 3, 4); }
      g.rect(C.ea4, cx - 14, top - 2, 28, 3); cupula(g, cx, top - 3, 8, C.ea4);
      x += 52; continue;
    }
    if (kind < 0.2) { cupula(g, x + 30, 128, 22, C.te2); g.rect(C.st1, x, 134, 60, 106); x += 74; continue; }
    // Azotea: edificio bajo con tinacos, antenas y ropa tendida.
    const bw = 50 + Math.round(hash(k, 3, 1401) * 60), top = 126 + Math.round(hash(k, 4, 1401) * 40);
    const pal = MUROS_GDL[Math.floor(hash(k, 5, 1401) * MUROS_GDL.length)];
    for (let y = top; y < 240; y++) for (let lx = 0; lx < bw; lx++) g.set(lx < 2 ? pal[2] : noise2((x + lx) * 0.1, y * 0.1, k) < 0.3 ? pal[1] : pal[0], x + lx, y);
    for (let y = top; y < 240; y++) for (let lx = 0; lx < bw; lx++) g.veil(C.te0, x + lx, y, 0.45); // más lejos: más oscuro
    g.rect(pal[2], x - 1, top - 3, bw + 2, 3);
    for (let wy = top + 10; wy < 200; wy += 22) for (let wx = x + 6; wx < x + bw - 10; wx += 16) { g.rect(C.ink, wx, wy, 7, 11); if (hash(wx, wy, 1402) > 0.9) g.rect(C.wa0, wx + 1, wy + 1, 5, 4); }
    if (hash(k, 6, 1401) > 0.4) { const tx = x + 8 + Math.round(hash(k, 7) * (bw - 24)); g.rect(C.ink, tx, top - 16, 14, 13); g.rect(C.st2, tx + 1, top - 15, 3, 11); g.rect(C.ink, tx + 2, top - 3, 2, 3); g.rect(C.ink, tx + 10, top - 3, 2, 3); }
    if (hash(k, 8, 1401) > 0.5) { const ax = x + bw - 10; g.rect(C.ink, ax, top - 30, 1, 30); g.rect(C.ink, ax - 5, top - 24, 11, 1); g.rect(C.ink, ax - 3, top - 18, 7, 1); }
    if (hash(k, 9, 1401) > 0.6) { for (let lx = 0; lx < bw - 10; lx++) g.set(C.ink, x + 5 + lx, top - 9 + Math.sin(lx / (bw - 10) * Math.PI) * 3); for (let lx = 8; lx < bw - 14; lx += 7) g.rect([C.ro1, C.tq1, C.sh0, C.wa1][lx % 4], x + 5 + lx, top - 8 + Math.round(Math.sin(lx / (bw - 10) * Math.PI) * 3), 4, 5); }
    x += bw + 4 + Math.round(hash(k, 10, 1401) * 20);
  }
  arcosMonumento(g, Math.round(w * 0.5), 200);
  // Jacarandas lejanas (copas secas) sobre la línea de azoteas.
  for (let k = 0; k < w / 140; k++) jacarandaSeca(g, 40 + k * 140 + hash(k, 1, 1403) * 60, 236, 110 + hash(k, 2, 1403) * 30, 1404 + k, 0.4);
  for (let y = 180; y < 240; y++) for (let x = 0; x < w; x++) g.veil(C.te0, x, y, (y - 180) / 60 * 0.5);
  g.rect(C.ink, 0, 240, w, 120);
}

/** Letrero de nombre de calle (verde, texto genérico). */
function letreroCalle(g: Lienzo, x: number, y: number, text: string): void {
  const sw = text.length * 4 + 5;
  g.rect(C.ink, x, y + 8, 1, 214 - y - 8);
  g.rect(C.fo1, x - 2, y, sw, 9); g.rect(C.fo3, x - 2, y, sw, 1); miniText(g, C.sh1, text, x + 1, y + 2);
}

function aveGround(g: Lienzo, w: number): void {
  const CAT = w - 340; // atrio de la Catedral al final
  // Fachadas a lo largo (con dos lotes derrumbados) hasta el atrio.
  const signs = ['BIRRIA', 'TORTAS', 'FARMACIA', 'HOTEL', 'CANTINA', 'LIBROS', 'PAN', 'MERCERIA', 'BARBERIA', 'DULCES'];
  let x = -10, k = 0;
  while (x < CAT - 20) {
    const bw = Math.min(CAT - 20 - x, 120 + Math.round(hash(k, 1, 1501) * 110));
    if (bw < 50) break;
    const lot = x + bw / 2;
    const ruin = Math.abs(lot - 920) < 70 || Math.abs(lot - 1760) < 60;
    if (ruin) {
      // Lote derrumbado: solo el muro bajo y un montón de cascajo (se ve la ciudad detrás).
      for (let y = 196; y < 214; y++) for (let lx = 0; lx < bw; lx++) {
        const hgt = 196 + Math.abs(Math.sin(lx * 0.07 + k)) * 14;
        if (y > hgt) g.set(hash(x + lx, y, 1502) > 0.7 ? C.te2 : hash(x + lx, y, 1503) > 0.5 ? C.st2 : C.ea1, x + lx, y);
      }
      for (let k2 = 0; k2 < 12; k2++) { const vx = x + hash(k2, 1, k) * bw, vy = 186 + hash(k2, 2, k) * 22; g.line(C.st3, vx, vy, vx + 4 + hash(k2, 3, k) * 6, vy - 3 + hash(k2, 4, k) * 6); }
      g.rect(C.te1, x, 150, 6, 64); g.rect(C.te2, x, 150, 2, 64); // muro medianero en pie
    } else {
      const one = hash(k, 7, 1501) > 0.4, top = one ? 118 + Math.round(hash(k, 2, 1501) * 14) : 70 + Math.round(hash(k, 2, 1501) * 22);
      fachada(g, x, bw, top, MUROS_GDL[(k * 5 + 2) % MUROS_GDL.length], 1510 + k, {
        portal: hash(k, 3, 1501) > 0.35, sign: hash(k, 4, 1501) > 0.35 ? signs[k % signs.length] : undefined,
        collapsed: !one && hash(k, 5, 1501) > 0.65, graffiti: hash(k, 6, 1501) > 0.6, oneStory: one,
      });
    }
    x += bw; k++;
  }
  // Atrio y fachada de la Catedral (cantera, portal con la puerta entreabierta y dos torres con agujas de azulejo amarillo).
  catedralFachada(g, CAT);
  // Banqueta: guarnición de cantera con baldosas.
  for (let y = 214; y < 228; y++) for (let x2 = 0; x2 < w; x2++) {
    const c = y === 214 ? C.st4 : y >= 225 ? (y === 225 ? C.st5 : C.st2) : ((x2 + (y > 219 ? 8 : 0)) % 16 === 0 || y === 220) ? C.st2 : bayer(x2, y) < 0.15 ? C.st4 : C.st3;
    g.set(c, x2, y);
  }
  // Calle: asfalto agrietado con raya de carril, rieles del tranvía, coladeras y pétalos.
  for (let y = 228; y < 345; y++) for (let x2 = 0; x2 < w; x2++) {
    const n = noise2(x2 * 0.05, y * 0.12, 1520);
    g.set(n < 0.3 ? C.st0 : bayer(x2, y) < 0.12 ? C.st2 : C.st1, x2, y);
  }
  for (let x2 = 0; x2 < CAT; x2 += 34) if (hash(x2, 1, 1521) > 0.25) g.rect(C.ea4, x2, 268, 18, 2); // raya desgastada
  for (const ry of [300, 316]) for (let x2 = 0; x2 < w; x2++) { g.set(C.st3, x2, ry); g.set(C.ink, x2, ry + 1); if (hash(x2, ry, 1522) > 0.97) g.set(C.te2, x2, ry); }
  for (let x2 = 3; x2 < w; x2 += 9) g.rect(C.ink, x2, 299, 3, 1);
  for (let k2 = 0; k2 < w / 80; k2++) {
    const gx = hash(k2, 1, 1523) * w, gy = 236 + hash(k2, 2, 1523) * 100;
    grieta(g, gx, gy, 18 + hash(k2, 3, 1523) * 26, C.ink, k2, (hash(k2, 4) - 0.5) * 2);
  }
  for (let k2 = 0; k2 < w / 300; k2++) { const cx = 150 + k2 * 300 + hash(k2, 5) * 80; g.ellipse(C.st3, cx, 336, 9, 3); g.ellipse(C.ink, cx, 336, 7, 2); for (let i = -6; i <= 6; i += 2) g.set(C.st2, cx + i, 336); }
  for (let k2 = 0; k2 < w / 3; k2++) { const px = hash(k2, 6, 1524) * w, py = 228 + hash(k2, 7, 1524) * 116; if (noise2(px * 0.01, py * 0.05, 1525) > 0.45) g.set(hash(k2, 8) > 0.5 ? C.pu2 : C.pu1, px, py); }
  // Charcos que reflejan el cielo de tarde.
  for (let k2 = 0; k2 < w / 260; k2++) {
    const cx = 80 + k2 * 260 + hash(k2, 9, 1526) * 100, cy = 250 + hash(k2, 10, 1526) * 80, rx = 14 + hash(k2, 11) * 16;
    for (let y = -4; y <= 4; y++) for (let x2 = -rx; x2 <= rx; x2++) if ((x2 / rx) ** 2 + (y / 4) ** 2 < 1) g.set(y < 0 ? (bayer(x2 | 0, y) < 0.5 ? C.te1 : C.te2) : C.pu0, cx + x2, cy + y);
  }
  // Jacarandas sobre la banqueta (las del frente), farolas pintadas y letreros de calle.
  for (let x2 = 140; x2 < CAT - 60; x2 += 230 + Math.round(hash(x2, 1, 1527) * 80)) {
    if (Math.abs(x2 - GDL_LANDMARKS.gdl_avenida.altar.x) < 90 || Math.abs(x2 - GDL_LANDMARKS.gdl_avenida.letras.x) < 160) continue;
    jacarandaSeca(g, x2, 222, 140 + hash(x2, 2, 1527) * 30, 1530 + x2, 0.3);
  }
  for (let x2 = 260; x2 < CAT; x2 += 400) farolPintado(g, x2, 224);
  letreroCalle(g, 470, 172, 'ALCALDE');
  letreroCalle(g, 1620, 172, 'MORELOS');
  // Sombra del borde de la banqueta.
  for (let x2 = 0; x2 < w; x2++) { g.set(C.ink, x2, 228); g.veil(C.ink, x2, 229, 0.5); }
  // Banqueta delantera (abajo).
  g.rect(C.st2, 0, 345, w, 15); g.rect(C.st4, 0, 345, w, 1); g.rect(C.ink, 0, 346, w, 1);
  for (let x2 = 0; x2 < w; x2 += 16) g.rect(C.st1, x2, 347, 1, 13);
}

/** Atrio y fachada de la Catedral (desde x0 hasta el final). */
function catedralFachada(g: Lienzo, x0: number): void {
  const w = g.w - x0, cx = x0 + 170;
  // Reja del atrio.
  for (let x = x0 - 20; x < x0 + 40; x++) { if (x % 4 === 0) g.rect(C.ink, x, 186, 1, 28); }
  g.rect(C.ink, x0 - 20, 186, 60, 1); g.rect(C.ink, x0 - 20, 206, 60, 1);
  // Cuerpo central de cantera.
  for (let y = 40; y < 214; y++) for (let x = x0 + 40; x < x0 + w; x++) {
    const row = Math.floor(y / 8), off = row % 2 ? 6 : 0;
    let c: string = noise2(x * 0.1, y * 0.1, 1601) < 0.3 ? C.ea2 : C.ea3;
    if (y % 8 === 7 || (x + off) % 12 === 0) c = C.ea2;
    g.set(c, x, y);
  }
  for (let y = 40; y < 214; y++) for (let x = x0 + 40; x < x0 + w; x++) g.veil(C.te0, x, y, 0.25);
  // Torres con cuerpos y agujas de azulejo amarillo (la derecha se corta en el borde).
  for (const tx of [x0 + 64, x0 + 280]) {
    for (let y = 56; y < 214; y++) { g.rect(C.ea3, tx - 22, y, 44, 1); g.set(C.ea4, tx - 22, y); g.set(C.ea1, tx + 21, y); }
    for (const by of [78, 122]) {
      g.rect(C.ea4, tx - 24, by - 4, 48, 3);
      for (let y = by; y < by + 30; y++) for (let x = tx - 8; x <= tx + 8; x++) if (enArco(x, y, tx, by, 8)) g.set(C.ink, x, y);
      g.ellipse(C.ea0, tx, by + 14, 4, 5); g.rect(C.ea1, tx - 1, by + 8, 2, 3);
    }
    // Aguja de azulejo (cono amarillo con rombos).
    for (let y = 0; y < 56; y++) {
      const hw = Math.round(y / 56 * 20);
      for (let x = -hw; x <= hw; x++) { const tile = ((x + y) >> 2) % 2 === 0 ? C.wa1 : C.wa2; g.set(x === -hw ? C.wa3 : x === hw ? C.wa0 : tile, tx + x, y); }
    }
    g.rect(C.ea4, tx - 24, 54, 48, 3);
  }
  // Portal central: arco de medio punto con puerta de madera entreabierta (luz de velas adentro).
  const top = 104;
  for (let y = top - 6; y < 214; y++) for (let x = cx - 40; x <= cx + 40; x++) if (enArco(x, y, cx, top - 6, 40) && !enArco(x, y, cx, top, 34)) g.set(bayer(x, y) < 0.4 ? C.ea4 : C.ea3, x, y);
  for (let y = top; y < 214; y++) for (let x = cx - 34; x <= cx + 34; x++) if (enArco(x, y, cx, top, 34)) g.set(C.ink, x, y);
  // Hojas de la puerta: la izquierda cerrada, la derecha abierta hacia adentro (se ve luz cálida).
  for (let y = top + 22; y < 214; y++) for (let x = cx - 30; x < cx - 2; x++) g.set((x - cx) % 7 === 0 ? C.ea0 : (y % 18 === 0) ? C.ea0 : C.ea1, x, y);
  for (let y = top + 22; y < 214; y++) for (let x = cx; x < cx + 30; x++) g.set(bayer(x, y) < 0.35 + (y - top) / 200 ? C.wa1 : C.wa0, x, y);
  for (let y = top + 22; y < 214; y++) { g.rect(C.ea1, cx + 22, y, 8, 1); g.set(C.ea2, cx + 22, y); }
  for (const s of [-16, -6]) { g.rect(C.st3, cx + s, 160, 2, 2); }
  // Columnas pareadas, frontón y nicho con reloj sin manecillas.
  for (const dx of [-52, -46, 46, 52]) { g.rect(C.ea4, cx + dx - 2, 90, 4, 124); g.rect(C.ea2, cx + dx + 1, 90, 1, 124); g.rect(C.ea4, cx + dx - 3, 88, 6, 3); }
  for (let y = 0; y < 18; y++) { const hw = 60 - y * 3; g.rect(y === 0 ? C.ea4 : C.ea3, cx - hw, 70 - y, hw * 2, 1); }
  g.rect(C.ea4, cx - 62, 70, 124, 3);
  g.ellipse(C.ea4, cx, 46, 12, 12); g.ellipse(C.st4, cx, 46, 10, 10); g.ellipse(C.st2, cx, 46, 1, 1); g.line(C.ink, cx, 46, cx + 6, 42); g.line(C.ink, cx, 46, cx - 2, 38);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.set(C.ink, cx + Math.cos(a) * 8, 46 + Math.sin(a) * 8); }
  // Escalinata del atrio, veladoras de vigilia y flores secas.
  for (let s = 0; s < 3; s++) g.rect(s % 2 ? C.st3 : C.st4, x0 + 30, 206 + s * 3, w - 30, 3);
  for (const vx of [cx - 60, cx - 52, cx + 50, cx + 58, cx + 64]) { g.rect(C.sh1, vx, 196, 3, 6); g.set(C.wa3, vx + 1, 194); g.set(C.wa2, vx + 1, 195); }
  // Mantas negras de la Cofradía colgando del portal.
  for (const bx of [cx - 70, cx + 62]) { for (let y = 92; y < 160; y++) g.rect(y > 150 && (y + bx) % 3 === 0 ? C.pu0 : C.ink, bx, y, 10 - (y > 150 ? (y - 150) % 3 : 0), 1); g.ellipse(C.pu1, bx + 5, 112, 3, 3); g.ellipse(C.ink, bx + 5, 112, 1, 1); }
  for (let y = 0; y < 214; y++) { const x = x0 + 40; g.set(C.ea4, x, y); }
}

function aveFront(g: Lienzo, w: number): void {
  // Catenaria del tranvía (dos cables que cuelgan entre postes).
  for (let p = 0; p < w; p += 620) {
    g.rect(C.ink, p + 40, 0, 3, 90); g.rect(C.st1, p + 40, 0, 1, 90);
    g.rect(C.ink, p + 20, 20, 60, 3);
    for (const [cy, sag] of [[24, 14], [34, 18]] as const) for (let x = p + 44; x < p + 664 && x < w; x++) {
      const t = (x - p - 44) / 620; g.set(C.ink, x, cy + Math.sin(t * Math.PI) * sag);
    }
  }
  // Ramas secas de jacaranda que cuelgan por arriba (con flores raras).
  for (let k = 0, x = 180; x < w; k++) {
    for (let b = 0; b < 4; b++) {
      let px = x + b * 16, py = 0;
      for (let s = 0; s < 40 + hash(k, b, 1701) * 30; s++) {
        px += (hash(s, b, 1702 + k) - 0.4) * 1.6; py += 1;
        g.rect(C.ink, px, py, s < 20 ? 2 : 1, 1);
        if (s > 20 && hash(s, b, 1703 + k) > 0.92) for (let f = 0; f < 4; f++) g.set(f % 2 ? C.pu1 : C.pu0, px + (hash(f, s, k) - 0.5) * 5, py + (hash(s, f, k) - 0.5) * 4);
      }
    }
    x += 700 + Math.round(hash(k, 9, 1704) * 400);
  }
  // Escombro y cofres de autos en silueta al pie.
  for (let k = 0, x = 400; x < w; k++) {
    const kind = hash(k, 1, 1705);
    if (kind < 0.5) for (let lx = 0; lx < 70; lx++) { const hh = Math.round(4 + Math.abs(Math.sin(lx * 0.15 + k)) * 10 + noise1(lx * 0.3, k) * 6); g.rect(lx % 9 === 0 ? C.st0 : C.ink, x + lx, 360 - hh, 1, hh); }
    else { for (let lx = 0; lx < 90; lx++) { const hh = Math.round(14 + Math.sin(lx / 90 * Math.PI) * 10); g.rect(C.ink, x + lx, 360 - hh, 1, hh); } g.rect(C.te0, x + 6, 340, 20, 2); }
    x += 520 + Math.round(hash(k, 2, 1705) * 500);
  }
}

/* ============================ CATEDRAL (interior) ============================ */

function catSky(g: Lienzo, w: number): void {
  // Lo poco que se ve por los ventanales altos: cielo apagándose con el eclipse.
  ramp(g, [C.ink, C.pu0, C.night, C.te0, C.te1], 0, 360, w);
  estrellas(g, w, 0, 200, w / 6, 2001);
}

function catFar(g: Lienzo, w: number): void {
  // Muro lejano de la nave lateral: penumbra con ventanas altas angostas.
  for (let y = 0; y < 360; y++) for (let x = 0; x < w; x++) g.set(noise2(x * 0.03, y * 0.05, 2101) > 0.6 && bayer(x, y) < 0.4 ? C.pu0 : bayer(x, y) < 0.3 ? C.void : C.ink, x, y);
  for (let x = 30; x < w; x += 70) {
    for (let y = 30; y < 120; y++) for (let lx = -5; lx <= 5; lx++) if (enOjiva(x + lx, y, x, 30, 5)) g.set(y < 60 ? C.te0 : C.pu0, x + lx, y);
  }
}

function catMid(g: Lienzo, w: number): void {
  // Capillas laterales: arcos oscuros con retablos dorados que apenas brillan y velas.
  for (let y = 0; y < 360; y++) for (let x = 0; x < w; x++) g.set(bayer(x, y) < 0.2 ? C.st0 : C.ink, x, y);
  for (let x = 40; x < w; x += 120) {
    const cx = x + 50;
    for (let y = 70; y < 240; y++) for (let lx = -40; lx <= 40; lx++) if (enArco(cx + lx, y, cx, 70, 40)) g.set(C.void, cx + lx, y);
    // Retablo dorado: nichos y columnas salomónicas sugeridas.
    for (let y = 100; y < 230; y++) for (let lx = -30; lx <= 30; lx++) {
      if (!enArco(cx + lx, y, cx, 100, 30)) continue;
      const gold = (Math.abs(lx) % 10 < 2) || (y % 16 < 2);
      if (gold) g.set(hash(cx + lx, y, 2201) > 0.6 ? C.wa1 : C.ea3, cx + lx, y);
      else if (bayer(cx + lx, y) < 0.15) g.set(C.ea1, cx + lx, y);
    }
    g.ellipse(C.ea2, cx, 150, 6, 10); g.ellipse(C.ea1, cx, 150, 4, 8); // nicho central (imagen velada)
    for (let k = 0; k < 5; k++) { const vx = cx - 16 + k * 8; g.rect(C.sh0, vx, 220, 2, 6); g.set(C.wa3, vx, 218); }
    halo(g, cx, 214, 40, 26, C.wa0, 0.6);
    halo(g, cx, 210, 20, 14, C.wa1, 0.5);
  }
}

function catNear(g: Lienzo, w: number): void {
  // Nave lateral cercana: columnas, arcos y lámparas colgantes; ventanas altas de colores apagados.
  for (let y = 0; y < 360; y++) for (let x = 0; x < w; x++) g.set(noise2(x * 0.05, y * 0.05, 2301) < 0.35 ? C.st0 : C.st1, x, y);
  for (let y = 0; y < 360; y++) for (let x = 0; x < w; x++) g.veil(C.ink, x, y, 0.35);
  for (let x = 0; x < w; x += 110) {
    for (let y = 30; y < 240; y++) { g.rect(C.st2, x, y, 20, 1); g.set(C.st3, x, y); g.set(C.st0, x + 19, y); }
    g.rect(C.ea2, x - 3, 30, 26, 6); g.rect(C.wa1, x - 3, 30, 26, 1);
    const cx = x + 65;
    for (let y = 40; y < 120; y++) for (let lx = -16; lx <= 16; lx++) if (enOjiva(cx + lx, y, cx, 40, 16)) g.set((lx + y) % 9 === 0 ? C.ink : [C.ro0, C.tq0, C.pu0, C.te0][((lx + 16) >> 3 ^ (y >> 3)) & 3], cx + lx, y);
    // Lámpara colgante (apagada) con cadena.
    for (let y = 0; y < 150; y += 3) g.rect(C.st2, cx, y, 1, 2);
    g.rect(C.ea2, cx - 8, 150, 17, 3); g.rect(C.wa1, cx - 8, 150, 17, 1);
    for (const dx of [-7, -2, 3, 8]) g.rect(C.sh0, cx + dx, 146, 1, 4);
  }
  g.rect(C.st0, 0, 240, w, 120); for (let y = 240; y < 360; y++) for (let x = 0; x < w; x++) if ((x + (y >> 3) * 8) % 16 === 0) g.set(C.ink, x, y);
}

/** Columna de la nave: fuste estriado claro y capitel dorado. `brokenAt` = y donde se rompe (opcional). */
function columnaNave(g: Lienzo, x: number, top: number, brokenAt?: number): void {
  const y0 = brokenAt ?? top;
  for (let y = y0; y < 214; y++) for (let lx = 0; lx < 36; lx++) {
    let c: string = lx < 3 ? C.st5 : lx > 28 ? C.st2 : lx % 6 === 0 ? C.st3 : C.st4;
    if (bayer(lx, y) < 0.06) c = C.st2;
    g.set(c, x - 18 + lx, y);
  }
  if (brokenAt === undefined) {
    // Capitel corintio dorado (hojas de acanto sugeridas).
    for (let s = 0; s < 4; s++) { g.rect(s % 2 ? C.ea3 : C.wa1, x - 22 - s, top + s * 4, 44 + s * 2, 4); g.rect(C.wa2, x - 22 - s, top + s * 4, 44 + s * 2, 1); }
    for (let k = 0; k < 6; k++) { const lx = x - 18 + k * 7; g.rect(C.ea2, lx, top + 6, 3, 8); g.set(C.wa3, lx, top + 6); }
  } else {
    // Rotura irregular con varillas y polvo.
    for (let lx = -18; lx < 18; lx++) { const cut = Math.round(noise1(lx * 0.3, x) * 10); g.erase(x + lx, y0 - 2, 1, cut + 2); g.set(C.st3, x + lx, y0 + cut); }
    g.line(C.te1, x - 4, y0 + 4, x - 8, y0 - 8); g.line(C.te1, x + 6, y0 + 4, x + 9, y0 - 6);
  }
  // Basa moldurada.
  for (let s = 0; s < 3; s++) { g.rect(C.st3, x - 20 - s * 2, 196 + s * 6, 40 + s * 4, 6); g.rect(C.st5, x - 20 - s * 2, 196 + s * 6, 40 + s * 4, 1); }
}

/** Motivo de los vitrales de la Catedral. */
function motivoVitral(m: GdlVitral['motif'], u: number, v: number, tint: string): string {
  const pal: Record<string, [string, string, string]> = {
    [C.ro2]: [C.ro0, C.ro1, C.ro2], [C.tq2]: [C.tq0, C.tq1, C.tq2], [C.wa2]: [C.wa0, C.wa1, C.wa2], [C.pu2]: [C.pu0, C.pu1, C.pu2],
  };
  const [d, m1, l] = pal[tint] ?? [C.mtn0, C.mtn1, C.mtn2];
  if (m === 'rosa') {
    const r = Math.hypot(u - 0.5, v - 0.5), a = Math.atan2(v - 0.5, u - 0.5);
    if (r > 0.5) return '';
    if (r < 0.1) return C.wa2;
    if (Math.abs(Math.sin(a * 6)) < 0.12 || Math.abs(r - 0.3) < 0.025) return C.ink;
    return r < 0.3 ? (Math.sin(a * 12) > 0 ? C.tq1 : C.wa1) : (Math.sin(a * 6) > 0 ? m1 : C.tq0);
  }
  if (m === 'sol') {
    const r = Math.hypot(u - 0.5, (v - 0.32) * 1.3), a = Math.atan2(v - 0.32, u - 0.5);
    if (r < 0.14) return r < 0.1 ? C.wa3 : C.wa2;
    if (r < 0.36 && Math.sin(a * 10) > 0.2) return C.wa1;
    return v > 0.7 ? (Math.floor(v * 20) % 2 ? C.tq1 : C.tq0) : v > 0.55 ? l : d;
  }
  if (m === 'santo') {
    // Figura de pie con aureola (sin rostro), manto en el color del vitral.
    const head = Math.hypot(u - 0.5, (v - 0.22) * 1.3) < 0.08, aureola = Math.abs(Math.hypot(u - 0.5, (v - 0.2) * 1.3) - 0.13) < 0.025;
    const manto = v > 0.3 && v < 0.88 && Math.abs(u - 0.5) < 0.1 + (v - 0.3) * 0.32;
    if (aureola) return C.wa2;
    if (head) return C.sk1;
    if (manto) return Math.abs(u - 0.5) < 0.04 ? l : m1;
    return v < 0.12 ? C.mtn0 : (Math.floor(u * 8) + Math.floor(v * 10)) % 2 ? C.mtn1 : C.mtn0;
  }
  // flor: cuadrifolio sobre fondo de rombos.
  const r = Math.hypot(u - 0.5, v - 0.5), a = Math.atan2(v - 0.5, u - 0.5);
  if (r < 0.36 + Math.cos(a * 4) * 0.08) return r < 0.12 ? C.wa2 : l;
  return ((Math.floor(u * 6) + Math.floor(v * 8)) % 2) ? m1 : d;
}

function vitralNave(g: Lienzo, v: GdlVitral): void {
  const W = v.x1 - v.x0, H = v.y1 - v.y0, cx = W / 2;
  const inside = (lx: number, ly: number): boolean => v.motif === 'rosa' ? Math.hypot(lx - cx, ly - H / 2) < W / 2 : enOjiva(lx, ly, cx, 0, W / 2);
  // Marco de cantera.
  for (let ly = -4; ly < H + 4; ly++) for (let lx = -4; lx < W + 4; lx++) {
    const near = inside(lx, ly) || inside(lx - 3, ly) || inside(lx + 3, ly) || inside(lx, ly + 3) || inside(lx, ly - 3);
    if (near && !inside(lx, ly)) g.set(lx < cx ? C.st5 : C.st3, v.x0 + lx, v.y0 + ly);
  }
  for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++) {
    if (!inside(lx, ly)) continue;
    if (v.broken && noise2(lx * 0.15, ly * 0.15, v.x0) > 0.55) { g.erase(v.x0 + lx, v.y0 + ly); continue; }
    let c = motivoVitral(v.motif, lx / W, ly / H, v.tint);
    if (!c) continue;
    if (v.motif !== 'rosa' && (lx % 10 === 0 || ly % 14 === 0)) c = C.ink; // emplomado
    g.set(c, v.x0 + lx, v.y0 + ly);
  }
  if (v.motif !== 'rosa') g.rect(C.st4, v.x0 - 6, v.y1 + 2, W + 12, 4);
}

/** Bóvedas de crucería sobre la nave (nervios claros, plementería en sombra, claves doradas). */
function bovedas(g: Lienzo, w: number, bays: readonly NaveBay[]): void {
  for (let y = 0; y < 52; y++) for (let x = 0; x < w; x++) g.set(noise2(x * 0.06, y * 0.1, 2401) < 0.4 ? C.st2 : C.st3, x, y);
  for (let y = 0; y < 52; y++) for (let x = 0; x < w; x++) g.veil(C.st1, x, y, 0.6 - y / 52 * 0.5);
  for (let i = 0; i <= bays.length; i++) {
    const xL = bayX(i) - BAY, xR = bayX(i);
    if (i > 0) {
      const cx = (xL + xR) / 2;
      for (let x = xL; x <= xR; x++) {
        const t = (x - xL) / BAY, y = 48 - Math.sin(t * Math.PI) * 40;
        g.rect(C.st5, x, y, 1, 2); g.set(C.st2, x, y + 2);
      }
      // Nervios diagonales hacia la clave.
      g.line(C.st4, xL, 48, cx, 8, 2); g.line(C.st4, xR, 48, cx, 8, 2);
      g.ellipse(C.wa1, cx, 9, 5, 4); g.ellipse(C.wa2, cx - 1, 8, 2, 2); g.set(C.wa3, cx - 2, 7);
    }
  }
  // Entablamento con friso dorado.
  g.rect(C.st4, 0, 48, w, 4); g.rect(C.st5, 0, 48, w, 1); g.rect(C.ea3, 0, 52, w, 3); g.rect(C.wa1, 0, 52, w, 1);
  frisoGreca(g, 0, 55, w, C.ea2, 'greca');
}

/** Órgano monumental sobre el coro (caja dorada, tubos plateados en abanico). */
function organo(g: Lienzo, cx: number): void {
  const x0 = cx - 82, x1 = cx + 82;
  // Caja de madera dorada con remate.
  for (let y = 40; y < 152; y++) for (let x = x0; x < x1; x++) g.set(bayer(x, y) < 0.2 ? C.ea0 : C.ea1, x, y);
  for (let s = 0; s < 3; s++) g.rect(C.wa1, x0 - 4 + s * 6, 36 - s * 4, x1 - x0 + 8 - s * 12, 3);
  g.rect(C.wa2, x0 - 4, 36, x1 - x0 + 8, 1);
  // Tubos en abanico: torres de tubos simétricas.
  const towers = [[-66, 10], [-44, 14], [-20, 18], [0, 22], [20, 18], [44, 14], [66, 10]] as const;
  for (const [dx, n] of towers) {
    const tw = n + 6;
    for (let p = 0; p < n / 3; p++) {
      const px = cx + dx - tw / 2 + 3 + p * 3, len = 54 + Math.round(Math.sin(p / (n / 2) * Math.PI) * 22) + (dx === 0 ? 18 : 0);
      const top = 140 - len;
      g.rect(C.ea0, px - 1, top, 1, len); g.rect(C.sh0, px, top, 2, len); g.rect(C.sh1, px, top, 1, len); g.set(C.st3, px + 1, top + 2);
      g.rect(C.ink, px, 140 - 8, 2, 2); // boca del tubo
    }
    g.rect(C.wa1, cx + dx - tw / 2 + 2, 140, tw - 2, 4);
  }
  // Coro: balcón con barandal dorado.
  g.rect(C.ea1, x0 - 10, 152, x1 - x0 + 20, 16); g.rect(C.wa1, x0 - 10, 152, x1 - x0 + 20, 2);
  for (let x = x0 - 8; x < x1 + 8; x += 5) g.rect(C.ea3, x, 156, 2, 10);
  g.rect(C.wa1, x0 - 10, 166, x1 - x0 + 20, 2);
  for (const sx of [x0 - 4, x1 - 4]) { g.rect(C.st4, sx, 168, 8, 46); g.rect(C.st5, sx, 168, 1, 46); }
  for (let y = 168; y < 214; y++) for (let x = x0 + 4; x < x1 - 4; x++) g.set(bayer(x, y) < 0.3 ? C.void : C.ink, x, y);
  grieta(g, cx + 30, 60, 60, C.ea0, 2501, 0.1);
}

/** Ábside con el ciprés dorado (baldaquino neoclásico) detrás del altar mayor. */
function abside(g: Lienzo, cx: number, broken: boolean): void {
  // Gran arco del presbiterio con casetones.
  for (let y = 60; y < 214; y++) for (let x = cx - 90; x <= cx + 90; x++) {
    if (!enArco(x, y, cx, 60, 90)) continue;
    const inner = enArco(x, y, cx, 72, 78);
    if (!inner) { g.set(((x >> 2) + (y >> 2)) % 2 ? C.ea3 : C.wa1, x, y); continue; }
    g.set(bayer(x, y) < 0.3 ? C.ea1 : C.ea0, x, y);
  }
  halo(g, cx, 150, 80, 70, C.wa0, 0.5);
  // Ciprés: cuatro columnas doradas, cúpula y cruz sencilla.
  for (const dx of [-38, -22, 22, 38]) { g.rect(C.wa1, cx + dx - 3, 104, 6, 96); g.rect(C.wa3, cx + dx - 3, 104, 1, 96); g.rect(C.ea2, cx + dx + 2, 104, 1, 96); }
  g.rect(C.wa1, cx - 44, 98, 88, 6); g.rect(C.wa3, cx - 44, 98, 88, 1);
  for (let y = 0; y < 22; y++) { const hw = Math.round(Math.sqrt(Math.max(0, 22 * 22 - (22 - y) ** 2)) * 1.6); g.rect(y < 2 ? C.wa3 : C.wa1, cx - hw, 76 + y, hw * 2, 1); }
  g.rect(C.wa2, cx - 1, 62, 2, 14); g.rect(C.wa2, cx - 5, 66, 10, 2);
  g.rect(C.ea0, cx - 16, 120, 32, 70); g.ellipse(C.ea1, cx, 140, 8, 12); // nicho vacío (la imagen ya no está)
  // Escalinata del presbiterio.
  for (let s = 0; s < 4; s++) { g.rect(C.st4, cx - 110 + s * 8, 196 + s * 5, 220 - s * 16, 5); g.rect(C.st5, cx - 110 + s * 8, 196 + s * 5, 220 - s * 16, 1); g.rect(C.ro0, cx - 30, 196 + s * 5 + 1, 60, 3); }
  if (broken) for (let k = 0; k < 40; k++) { const px = cx - 80 + hash(k, 1, 2601) * 160, py = 70 + hash(k, 2, 2601) * 120; g.rect(C.ink, px, py, 2 + hash(k, 3) * 4, 1 + hash(k, 4) * 3); }
}

/** Piso de mármol en damero con alfombra roja gastada y luz de vitrales. */
function pisoNave(g: Lienzo, w: number, carpetTo: number, cracked: boolean): void {
  let ry = 214;
  for (let row = 0; ry < 345; row++) {
    const rh = Math.round(6 + row * 1.6), tw = Math.round(20 + row * 2.4);
    for (let y = ry; y < Math.min(345, ry + rh); y++) for (let x = 0; x < w; x++) {
      const col = Math.floor((x + row * 7) / tw), dark = (col + row) % 2 === 0;
      let c: string = dark ? C.st1 : C.st2;
      if (bayer(x, y) < 0.06) c = dark ? C.st2 : C.st3;
      if (y === ry || (x + row * 7) % tw === 0) c = C.st0;
      g.set(c, x, y);
    }
    ry += rh;
  }
  // Alfombra roja con orillas doradas (desgarrada).
  for (let y = 262; y < 292; y++) for (let x = 0; x < carpetTo; x++) {
    if (noise2(x * 0.08, y * 0.2, 2701) > 0.78) continue;
    const edge = y < 264 || y > 289;
    g.set(edge ? (y === 262 || y === 291 ? C.wa1 : C.ea3) : bayer(x, y) < 0.15 ? C.ro1 : C.rd0, x, y);
  }
  if (cracked) for (let k = 0; k < w / 50; k++) grieta(g, hash(k, 1, 2702) * w, 220 + hash(k, 2, 2702) * 110, 20 + hash(k, 3) * 30, C.ink, k, (hash(k, 4) - 0.5) * 3);
  for (let y = 214; y < 222; y++) for (let x = 0; x < w; x++) g.veil(C.ink, x, y, 0.8 - (y - 214) * 0.1);
  g.rect(C.ink, 0, 345, w, 15); g.rect(C.st3, 0, 345, w, 1); frisoGreca(g, 0, 350, w, C.st1, 'greca');
}

function catInterior(g: Lienzo, w: number): void {
  // Muro de la nave: sillares claros en sombra.
  for (let y = 52; y < 214; y++) {
    const row = Math.floor(y / 10), ly = y % 10;
    for (let x = 0; x < w; x++) {
      const off = row % 2 ? 16 : 0, lx = (x + off) % 32, tone = hash(Math.floor((x + off) / 32), row, 2801);
      let c: string = tone > 0.7 ? C.st3 : C.st2;
      if (ly === 9 || lx === 31) c = C.st1;
      else if (ly === 0) c = C.st4;
      g.set(c, x, y);
    }
  }
  bovedas(g, w, CATEDRAL_BAYS);
  CATEDRAL_BAYS.forEach((kind, i) => {
    const x0 = bayX(i), cx = x0 + BAY / 2;
    if (kind === 'arco') {
      // Arco ojival abierto a la nave lateral (se ve la capa 3) y ventana alta encima.
      for (let y = 112; y < 214; y++) for (let x = cx - 62; x <= cx + 62; x++) {
        if (enOjiva(x, y, cx, 112, 62)) g.erase(x, y);
        else if (enOjiva(x, y, cx, 108, 66)) g.set(x < cx ? C.st5 : C.st3, x, y);
      }
    } else if (kind === 'organo') organo(g, cx);
    else if (kind === 'abside') abside(g, cx, false);
    else {
      // Bahía de vitral: altar lateral con velas y cuadro oscuro al pie.
      g.rect(C.st1, cx - 36, 192, 72, 22); g.rect(C.st4, cx - 38, 190, 76, 3); g.rect(C.wa1, cx - 38, 190, 76, 1);
      g.rect(C.ea3, cx - 30, 194, 60, 2);
    }
  });
  for (const v of gdlVitrales('catedral')) vitralNave(g, v);
  for (let i = 0; i <= CATEDRAL_BAYS.length; i++) columnaNave(g, bayX(i), 60);
  // Entrada: portón abierto a la tarde que se apaga.
  for (let y = 70; y < 214; y++) for (let x = 0; x < 74; x++) {
    const inA = enArco(x, y, 36, 70, 30);
    if (inA) g.set(bayer(x, y) < 0.5 - (y - 70) / 400 ? C.te2 : C.te1, x, y);
  }
  for (let y = 120; y < 214; y++) g.rect(C.ea1, 8, y, 6, 1);
  // Fin del muro a la derecha (sacristía en sombra).
  { const ex = bayX(CATEDRAL_BAYS.length) + 24; for (let y = 120; y < 214; y++) for (let x = ex + 10; x < ex + 50; x++) if (enArco(x, y, ex + 30, 120, 20)) g.set(bayer(x, y) < 0.3 ? C.ea0 : C.ink, x, y); }
  pisoNave(g, w, 1490, false);
  // Luz de colores de los vitrales sobre el piso.
  for (const v of gdlVitrales('catedral')) {
    if (v.motif === 'rosa') continue;
    const cx = (v.x0 + v.x1) / 2 + 40;
    for (let y = 226; y < 330; y++) {
      const sp = 18 + (y - 226) * 0.3;
      for (let x = Math.floor(cx - sp + (y - 226) * 0.4); x < cx + sp + (y - 226) * 0.4; x++) if (Math.floor(y / 2) % 2 === 0) g.veil(v.tint, x, y, 0.22 * (1 - (y - 226) / 104));
    }
  }
}

function catFront(g: Lienzo, w: number): void {
  // Arañas de luz colgantes (apagadas), incensario y basas de columnas cercanas; bancas rotas en silueta.
  for (let k = 0, x = 160; x < w; k++) {
    const len = 30 + Math.round(hash(k, 1, 2901) * 40);
    for (let y = 0; y < len; y += 3) { g.rect(C.ink, x, y, 1, 2); g.set(C.st1, x, y); }
    for (let y = 0; y < 10; y++) { const hw = 4 + Math.round(Math.sin(y / 10 * Math.PI) * 14); g.rect(C.ink, x - hw, len + y, hw * 2 + 1, 1); }
    g.rect(C.ea1, x - 18, len + 4, 37, 1);
    for (const dx of [-16, -8, 0, 8, 16]) { g.rect(C.ink, x + dx, len - 3, 1, 4); }
    x += 420 + Math.round(hash(k, 2, 2901) * 300);
  }
  for (let k = 0, x = 360; x < w; k++) {
    g.rect(C.ink, x, 0, 34, 360); g.rect(C.st1, x, 0, 2, 360); g.rect(C.st0, x + 31, 0, 1, 360);
    for (let s = 0; s < 3; s++) g.rect(C.ink, x - 6 - s * 3, 324 + s * 12, 46 + s * 6, 12);
    x += 700 + Math.round(hash(k, 3, 2901) * 300);
  }
  for (let k = 0, x = 120; x < w; k++) {
    // Respaldo de banca roto (silueta) en el borde inferior.
    const bw = 60 + Math.round(hash(k, 4, 2901) * 40), tilt = hash(k, 5, 2901) > 0.5 ? 1 : -1;
    for (let lx = 0; lx < bw; lx++) { const top = 342 + Math.round(lx * 0.08 * tilt); g.rect(C.ink, x + lx, top, 1, 360 - top); if (lx % 12 === 0) g.rect(C.ink, x + lx, top - 8, 2, 8); }
    g.rect(C.ea0, x, 342, bw, 1);
    x += 520 + Math.round(hash(k, 6, 2901) * 300);
  }
}

/* ============================ CATEDRAL CON EL ECLIPSE ============================ */

function eclSky(g: Lienzo, w: number): void {
  ramp(g, [C.ink, C.void, C.void, C.deep, C.pu0, C.ink], 0, 360, w);
  // Vía láctea violácea y polvo estelar.
  for (let y = 0; y < 360; y++) for (let x = 0; x < w; x++) {
    const band = Math.abs(y - (40 + x * 0.25)) / 90;
    if (band < 1 && fbm(x * 0.03, y * 0.05, 3001) > 0.45 + band * 0.25) g.veil(band < 0.4 ? C.pu1 : C.pu0, x, y, (1 - band) * 0.6);
  }
  estrellas(g, w, 0, 330, w * 1.2, 3002);
  // Resplandor frío alrededor de donde el código dibuja el eclipse (x ≈ 0.5 w, y ≈ 74).
  halo(g, Math.round(w * 0.5), 74, 150, 110, C.mtn0, 0.4);
  halo(g, Math.round(w * 0.5), 74, 80, 60, C.mtn1, 0.35);
}

/** Tzitzimitl lejana como constelación: esqueleto de estrellas con falda estelar y cuchillo de obsidiana. */
function tzitzimitlEstelar(g: Lienzo, cx: number, cy: number, s: number, flip: boolean, seed: number): void {
  const f = flip ? -1 : 1;
  const star = (x: number, y: number, big = false): void => {
    const px = cx + x * s * f, py = cy + y * s;
    g.set(big ? C.sh1 : C.tq3, px, py);
    if (big) { g.set(C.mtn2, px - 1, py); g.set(C.mtn2, px + 1, py); g.set(C.mtn2, px, py - 1); g.set(C.mtn2, px, py + 1); }
  };
  const link = (x0: number, y0: number, x1: number, y1: number): void => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * s);
    for (let i = 1; i < n; i++) { const px = cx + (x0 + (x1 - x0) * i / n) * s * f, py = cy + (y0 + (y1 - y0) * i / n) * s; if (bayer(Math.round(px), Math.round(py)) < 0.6) g.set(C.mtn1, px, py); }
  };
  // Cráneo (anillo con cuencas), columna, costillas, brazos abiertos, falda de estrellas.
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; g.set(C.mtn2, cx + Math.cos(a) * 5 * s / 4 * f, cy - 20 * s / 4 + Math.sin(a) * 5 * s / 4); }
  star(-1.5, -5.4, true); star(1.5, -5.4, true);
  star(0, -3.5); star(0, -1); star(0, 1.5); link(0, -3.5, 0, 1.5);
  for (const ry of [-2.5, -1.6, -0.7]) { link(0, ry, -2.2, ry + 0.8); link(0, ry, 2.2, ry + 0.8); }
  star(-4, -1.5); star(-6, -4); link(0, -3, -4, -1.5); link(-4, -1.5, -6, -4);
  star(4, -2); star(6.5, -0.5); link(0, -3, 4, -2); link(4, -2, 6.5, -0.5);
  // Cuchillo de obsidiana en la mano derecha (sugerido).
  for (let k = 0; k < 4 * s / 4; k++) g.set(C.pu1, cx + (6.5 + k * 0.25) * s * f, cy + (-0.5 - k * 0.5) * s);
  for (let k = 0; k < 14; k++) {
    const u = (k / 13 - 0.5) * 7, v = 2 + Math.abs(u) * 0.2 + hash(k, 1, seed) * 3.5;
    star(u, v, hash(k, 2, seed) > 0.75);
    if (k > 0) link(u - 7 / 13, 2 + Math.abs(u - 7 / 13) * 0.2, u, v);
  }
  halo(g, cx, cy, 12 * s, 10 * s, C.mtn0, 0.25, false);
}

function eclFar(g: Lienzo, w: number): void {
  // Tzitzimime lejanas (constelaciones) y estrellas grandes; el resto transparente.
  tzitzimitlEstelar(g, w * 0.18, 70, 5, false, 3101);
  tzitzimitlEstelar(g, w * 0.82, 56, 6, true, 3102);
  tzitzimitlEstelar(g, w * 0.66, 150, 3, false, 3103);
  tzitzimitlEstelar(g, w * 0.32, 168, 3, true, 3104);
  for (let k = 0; k < 18; k++) { const x = hash(k, 1, 3105) * w, y = hash(k, 2, 3105) * 200; g.set(C.sh1, x, y); g.set(C.mtn2, x + 1, y); g.set(C.mtn2, x - 1, y); g.set(C.mtn2, x, y + 1); g.set(C.mtn2, x, y - 1); }
}

function eclMid(g: Lienzo, w: number): void {
  // Restos de nervios de bóveda que quedaron colgando a los lados (silueta con luz fría arriba).
  const rib = (x0: number, x1: number, peak: number, base: number, cut: number): void => {
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      if (t > cut) break;
      const y = base - Math.sin(t * Math.PI) * (base - peak);
      g.rect(C.st0, x, y, 1, 5); g.set(C.mtn1, x, y); g.set(C.ink, x, y + 5);
    }
  };
  for (let k = 0; k < 3; k++) { rib(-40 + k * 70, 220 + k * 70, 20 + k * 6, 210, 0.55 + hash(k, 1, 3201) * 0.2); }
  for (let k = 0; k < 3; k++) { const x1 = w + 40 - k * 70, x0 = x1 - 260; for (let x = x1; x >= x0; x--) { const t = (x1 - x) / 260; if (t > 0.5 + hash(k, 2, 3201) * 0.2) break; const y = 210 - Math.sin(t * Math.PI) * (190 - k * 6); g.rect(C.st0, x, y, 1, 5); g.set(C.mtn1, x, y); } }
  // Pedazos de bóveda flotando todavía (por la energía del eclipse).
  for (let k = 0; k < 7; k++) {
    const cx = w * (0.25 + hash(k, 3, 3202) * 0.5), cy = 40 + hash(k, 4, 3202) * 120, r = 2 + hash(k, 5, 3202) * 5;
    for (let y = -r; y <= r; y++) for (let x = -r * 1.4; x <= r * 1.4; x++) if (Math.abs(x) / 1.4 + Math.abs(y) < r + noise1(x * 0.5, k) * 2) g.set(y < -r * 0.4 ? C.mtn1 : C.st0, cx + x, cy + y);
    g.set(C.tq3, cx, cy - r);
  }
  // Muros de la nave a la altura del horizonte (fondo bajo).
  for (let x = 0; x < w; x++) { const top = 236 - noise1(x * 0.05, 3203) * 30; for (let y = Math.floor(top); y < 360; y++) g.set(y < top + 1 ? C.mtn1 : C.ink, x, y); }
}

function eclNear(g: Lienzo, w: number): void {
  // Muro lejano de la nave, roto arriba: ventanas altas vacías (se ve el cielo) y arcadas a oscuras.
  for (let x = 0; x < w; x++) {
    const top = Math.round(70 + noise1(x * 0.025, 3301) * 60 + noise1(x * 0.12, 3302) * 12);
    for (let y = top; y < 360; y++) {
      const row = Math.floor(y / 10), off = row % 2 ? 16 : 0, lx = (x + off) % 32;
      let c: string = y % 10 === 9 || lx === 31 ? C.ink : hash((x + off) >> 5, row, 3303) > 0.7 ? C.st1 : C.st0;
      if (y < top + 2) c = C.mtn1;
      g.set(c, x, y);
    }
  }
  for (let x = 40; x < w; x += 120) {
    for (let y = 100; y < 170; y++) for (let lx = -16; lx <= 16; lx++) if (enOjiva(x + lx, y, x, 100, 16)) g.erase(x + lx, y);
    for (let y = 186; y < 260; y++) for (let lx = -30; lx <= 30; lx++) if (enArco(x + 60 + lx, y, x + 60, 186, 30)) g.set(C.void, x + 60 + lx, y);
  }
  for (let y = 0; y < 360; y++) for (let x = 0; x < w; x++) if (g.has(x, y)) g.veil(C.mtn0, x, y, 0.15);
}

function eclInterior(g: Lienzo, w: number): void {
  // Muros de la nave arrancados arriba (sin bóvedas): arista irregular con luz fría.
  for (let y = 0; y < 214; y++) {
    const row = Math.floor(y / 10), ly = y % 10;
    for (let x = 0; x < w; x++) {
      const off = row % 2 ? 16 : 0, lx = (x + off) % 32, tone = hash(Math.floor((x + off) / 32), row, 3401);
      let c: string = tone > 0.7 ? C.st2 : C.st1;
      if (ly === 9 || lx === 31) c = C.st0; else if (ly === 0) c = C.st3;
      g.set(c, x, y);
    }
  }
  const rim: number[] = [];
  for (let x = 0; x < w; x++) {
    const top = Math.round(56 + noise1(x * 0.02, 3402) * 50 + noise1(x * 0.1, 3403) * 14 + (Math.abs(x - 760) < 420 ? 30 * Math.cos((x - 760) / 420 * Math.PI / 2) : 0));
    rim.push(top);
    g.erase(x, 0, 1, top);
    g.set(C.mtn2, x, top); g.set(C.mtn1, x, top + 1);
  }
  ECLIPSE_BAYS.forEach((kind, i) => {
    const cx = bayX(i) + BAY / 2;
    if (kind === 'arco') {
      for (let y = 112; y < 214; y++) for (let x = cx - 62; x <= cx + 62; x++) {
        if (enOjiva(x, y, cx, 112, 62)) g.erase(x, y);
        else if (enOjiva(x, y, cx, 108, 66) && y > rim[x] + 2) g.set(x < cx ? C.st3 : C.st1, x, y);
      }
    } else if (kind === 'roto') {
      // Vitral reventado: solo el marco y algunos vidrios.
      const v: GdlVitral = { x0: cx - 30, y0: Math.max(56, rim[cx] + 8), x1: cx + 30, y1: 186, tint: [C.ro2, C.tq2, C.pu2][i % 3], motif: 'santo', broken: true };
      vitralNave(g, v);
      for (let k = 0; k < 30; k++) g.set([C.ro1, C.tq1, C.pu1, C.wa1][k % 4], cx - 40 + hash(k, 1, 3404 + i) * 80, 200 + hash(k, 2, 3404 + i) * 12);
    } else if (kind === 'abside') abside(g, cx, true);
  });
  // Columnas: algunas completas, otras rotas a distintas alturas.
  for (let i = 0; i <= ECLIPSE_BAYS.length; i++) {
    const x = bayX(i), broken = hash(i, 1, 3405) > 0.35 || i === 3;
    columnaNave(g, x, Math.max(60, rim[Math.min(w - 1, x)] + 4), broken ? Math.max(rim[Math.min(w - 1, x)] + 6, 70 + Math.round(hash(i, 2, 3405) * 90)) : undefined);
  }
  for (let x = bayX(ECLIPSE_BAYS.length); x < w; x++) g.erase(x, 0, 1, rim[x]);
  // Entrada (izquierda).
  for (let y = 80; y < 214; y++) for (let x = 0; x < 74; x++) if (enArco(x, y, 36, 80, 30)) g.set(bayer(x, y) < 0.3 ? C.night : C.void, x, y);
  pisoNave(g, w, 1260, true);
  // Escombro amontonado al pie de los muros y en las orillas (el centro queda limpio).
  for (let x = 0; x < w; x++) {
    const edge = x < 260 || x > 1260;
    const hh = Math.round((edge ? 10 : 3) + noise1(x * 0.07, 3406) * (edge ? 16 : 5));
    for (let y = 214 - hh; y < 214 + (edge ? 8 : 2); y++) {
      const n = hash(x, y, 3407);
      g.set(y === 214 - hh ? C.st3 : n > 0.8 ? C.st3 : n > 0.4 ? C.st2 : C.st1, x, y);
    }
  }
  for (let k = 0; k < 60; k++) {
    const x = hash(k, 1, 3408) < 0.5 ? hash(k, 2, 3408) * 240 : 1280 + hash(k, 3, 3408) * 320, y = 228 + hash(k, 4, 3408) * 110, r = 2 + hash(k, 5, 3408) * 4;
    g.ellipse(C.st2, x, y, r, r * 0.6); g.rect(C.st4, x - r / 2, y - r * 0.6, r, 1);
  }
  // Charcos de luz fría bajo el cielo abierto (centro) y polvo de estrellas en el suelo.
  for (const [cx, rx] of [[520, 90], [760, 120], [1020, 90]] as const) {
    for (let y = 240; y < 330; y++) for (let x = cx - rx; x < cx + rx; x++) {
      const d = Math.hypot((x - cx) / rx, (y - 285) / 45);
      if (d < 1) g.veil(d < 0.5 ? C.mtn1 : C.mtn0, x, y, (1 - d) * 0.45);
    }
  }
  for (let k = 0; k < w / 6; k++) { const x = hash(k, 6, 3409) * w, y = 226 + hash(k, 7, 3409) * 116; g.set(hash(k, 8) > 0.7 ? C.tq3 : C.mtn2, x, y); }
  // Cadenas rotas del culto en el suelo cerca del altar.
  for (let k = 0; k < 3; k++) { const x0 = 1300 + k * 40; for (let s = 0; s < 14; s++) { g.rect(C.st1, x0 + s * 3, 330 - k * 6 + Math.sin(s) * 2, 2, 2); g.set(C.st3, x0 + s * 3, 330 - k * 6 + Math.sin(s) * 2); } }
}

function eclFront(g: Lienzo, w: number): void {
  // Grandes trozos de nervio de bóveda caídos en las esquinas, cadenas que cuelgan y escombro al pie.
  for (let k = 0, x = 60; x < w; k++) {
    const len = 50 + Math.round(hash(k, 1, 3501) * 70);
    for (let y = 0; y < len; y += 3) { g.rect(C.ink, x, y, 2, 2); g.set(C.st1, x, y); }
    if (hash(k, 2, 3501) > 0.5) { g.rect(C.ink, x - 3, len, 8, 3); } else for (let y = len; y < len + 6; y++) g.set(C.ink, x + (y - len), y); // eslabón roto
    x += 260 + Math.round(hash(k, 3, 3501) * 260);
  }
  for (const [x0, flip] of [[0, false], [w - 260, true]] as const) {
    for (let lx = 0; lx < 160; lx++) {
      const t = lx / 160, y = 352 - Math.sin(t * Math.PI * 0.9) * 40;
      const px = flip ? x0 + 259 - lx : x0 + lx;
      if (t > 0.42 && t < 0.47) continue; // quiebre
      g.rect(C.ink, px, y, 1, 360 - y); g.set(C.mtn1, px, y); g.set(C.st0, px, y + 1);
    }
  }
  for (let k = 0, x = 140; x < w; k++) {
    for (let lx = 0; lx < 80; lx++) { const hh = Math.round(6 + Math.abs(Math.sin(lx * 0.12 + k)) * 12 + noise1(lx * 0.3, k + 5) * 8); g.rect(C.ink, x + lx, 360 - hh, 1, hh); if (lx % 7 === 0) g.set(C.mtn0, x + lx, 360 - hh); }
    x += 440 + Math.round(hash(k, 4, 3502) * 340);
  }
}

/** Hueco del techo para la transición de openCathedralRoof (cielo del eclipse con orilla rota abajo). */
export function drawGdlRoofHole(w: number, h: number): Lienzo {
  const g = new Lienzo(w, h);
  ramp(g, [C.ink, C.void, C.deep, C.pu0], 0, h, w);
  estrellas(g, w, 0, h, w * h / 140, 3601);
  halo(g, w / 2, h * 0.45, 90, 60, C.mtn0, 0.4, true);
  for (let x = 0; x < w; x++) {
    const edge = Math.round(h - 22 - noise1(x * 0.04, 3602) * 40 - noise1(x * 0.2, 3603) * 10 + Math.pow(Math.abs(x - w / 2) / (w / 2), 2) * 30);
    for (let y = Math.max(0, edge); y < h; y++) {
      if (y < edge + 5) g.set(y === edge ? C.st4 : y < edge + 3 ? C.st3 : C.st1, x, y); else g.erase(x, y);
    }
  }
  return g;
}

/** Cortinas de aurora del eclipse (vetas verticales tramadas; el código las mueve con ADD). */
export function drawGdlAurora(w: number, h: number, seed: number): Lienzo {
  const g = new Lienzo(w, h);
  for (let x = 0; x < w; x++) {
    const k = noise1(x * 0.03, seed) * 0.7 + noise1(x * 0.11, seed + 1) * 0.3;
    if (k < 0.35) continue;
    const top = Math.round(h * 0.15 + noise1(x * 0.02, seed + 2) * h * 0.3), len = Math.round((k - 0.3) * h * 1.2);
    for (let y = top; y < Math.min(h, top + len); y++) {
      const t = (y - top) / len;
      if (bayer(x, y) < (1 - t) * (k - 0.2) * 1.4) g.set(t < 0.15 ? C.tq3 : t < 0.5 ? C.tq2 : (x + y) % 5 === 0 ? C.pu2 : C.tq1, x, y);
    }
  }
  return g;
}

/* ================================ EPÍLOGO ================================ */

function epilogoTaller(g: Lienzo): void {
  const W = 640, H = 360;
  // Muro de aplanado crema con zoclo de azulejo (luz cálida de mañana).
  for (let y = 0; y < 250; y++) for (let x = 0; x < W; x++) {
    const n = noise2(x * 0.15, y * 0.15, 4001);
    g.set(n < 0.25 && bayer(x, y) < 0.35 ? C.sk2 : n > 0.8 && bayer(x, y) < 0.3 ? C.wa4 : C.sk3, x, y);
  }
  for (let y = 0; y < 250; y++) for (let x = 0; x < W; x++) g.veil(C.sk1, x, y, Math.max(0, (x - 420) / 220) * 0.5 + Math.max(0, (y - 180) / 70) * 0.3);
  for (let y = 214; y < 250; y++) for (let x = 0; x < W; x++) {
    const tx = x % 12, ty = (y - 214) % 12;
    g.set(tx === 0 || ty === 0 ? C.st4 : (Math.abs(tx - 6) + Math.abs(ty - 6) < 3) ? C.tq1 : (tx + ty) % 6 === 0 ? C.mtn1 : C.sh1, x, y);
  }
  g.rect(C.ea3, 0, 212, W, 2);
  // Ventana grande: Xalapa de día con niebla suave, cerros verdes y tejados rojos.
  const wx0 = 60, wx1 = 300, wy0 = 34, wy1 = 196;
  for (let y = wy0; y < wy1; y++) for (let x = 0; x < W; x++) {
    if (x < wx0 || x >= wx1) continue;
    const t = (y - wy0) / (wy1 - wy0);
    let c: string = t < 0.4 ? (bayer(x, y) < t * 1.5 ? C.mtn3 : C.sh1) : C.mtn3;
    // Cerros (dos planos) con niebla.
    const far = wy0 + 92 - noise1(x * 0.02, 4002) * 26, near = wy0 + 118 - noise1(x * 0.03, 4003) * 20;
    if (y > far) c = bayer(x, y) < 0.5 ? C.fo4 : C.fog2;
    if (y > near) c = bayer(x, y) < 0.3 ? C.fo3 : C.fo4;
    if (y > wy0 + 128) {
      // Tejados rojos y muros blancos del barrio.
      const hx = Math.floor((x - wx0) / 22), lx = (x - wx0) % 22, roof = wy0 + 128 + Math.round(hash(hx, 1, 4004) * 8);
      c = y < roof + 6 - Math.abs(lx - 11) * 0.4 ? C.te2 : y < roof + 7 ? C.te1 : (lx > 4 && lx < 9 && y > roof + 12 && y < roof + 20) ? C.ea1 : hash(hx, 2, 4004) > 0.5 ? C.sh1 : C.sk3;
      if (y < roof - 1) c = C.fo3;
    }
    g.set(c, x, y);
  }
  // Torre de iglesia lejana y nubes/niebla en jirones.
  for (let y = wy0 + 70; y < wy0 + 128; y++) g.rect(C.sh0, 236, y, 8, 1);
  g.rect(C.sh0, 234, wy0 + 66, 12, 4); g.rect(C.te2, 238, wy0 + 58, 4, 8); g.rect(C.ink, 238, wy0 + 76, 4, 6);
  for (let y = wy0; y < wy1; y++) for (let x = wx0; x < wx1; x++) if (noise2(x * 0.02, y * 0.07, 4005) > 0.62) g.veil(C.sh1, x, y, 0.55);
  // Marco y parteluces de madera, alféizar con macetas.
  for (const fx of [wx0 - 6, wx1, (wx0 + wx1) / 2 - 3]) g.rect(C.ea2, fx, wy0 - 6, 6, wy1 - wy0 + 12);
  for (const fy of [wy0 - 6, wy1, (wy0 + wy1) / 2 - 2]) g.rect(C.ea2, wx0 - 6, fy, wx1 - wx0 + 12, fy === (wy0 + wy1) / 2 - 2 ? 4 : 6);
  g.rect(C.ea4, wx0 - 6, wy0 - 6, wx1 - wx0 + 12, 1); g.rect(C.ea3, wx0 - 10, wy1 + 6, wx1 - wx0 + 20, 6); g.rect(C.ea4, wx0 - 10, wy1 + 6, wx1 - wx0 + 20, 1);
  for (const px of [80, 130, 270]) {
    g.rect(C.te2, px - 6, wy1 - 6, 12, 12); g.rect(C.te3, px - 6, wy1 - 6, 12, 1);
    for (let k = 0; k < 18; k++) { const a = -Math.PI / 2 + (hash(k, 1, px) - 0.5) * 2.4, r = 4 + hash(k, 2, px) * 10; g.line(hash(k, 3) > 0.5 ? C.fo4 : C.fo3, px, wy1 - 6, px + Math.cos(a) * r, wy1 - 6 + Math.sin(a) * r); }
    if (px === 130) for (let k = 0; k < 5; k++) g.set(C.ro2, px - 6 + hash(k, 4) * 12, wy1 - 14 - hash(k, 5) * 6);
  }
  // Helecho colgante (arriba a la izquierda).
  g.rect(C.st3, 26, 0, 1, 40); g.ellipse(C.te2, 26, 44, 9, 5); g.rect(C.te3, 17, 40, 19, 1);
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * (0.15 + k / 13 * 0.7), len = 16 + hash(k, 1, 4006) * 20;
    for (let s = 0; s < len; s++) { const px = 26 + Math.cos(a) * s * 0.9, py = 44 + Math.sin(a) * s * 0.5 + s * s * 0.02; g.set(C.fo3, px, py); if (s % 3 === 0) { g.set(C.fo4, px - 1, py + 1); g.set(C.fo4, px + 1, py + 1); } }
  }
  // Repisas con libros, frascos, radios viejos, carretes de cable y un retrato.
  for (const sy of [62, 112, 162]) {
    g.rect(C.ea2, 380, sy, 236, 5); g.rect(C.ea4, 380, sy, 236, 1); g.rect(C.ea1, 380, sy + 5, 236, 1);
    for (let x = 384, k = 0; x < 610; k++) {
      const kind = hash(k, sy, 4007);
      if (kind < 0.55) { const bw = 4 + Math.round(hash(k, 1, sy) * 4), bh = 22 + Math.round(hash(k, 2, sy) * 14); const col = [C.ro1, C.tq1, C.ea2, C.mtn1, C.wa1, C.fo3, C.te2][k % 7]; g.rect(col, x, sy - bh, bw, bh); g.rect(C.sh1, x + 1, sy - bh + 4, bw - 2, 1); g.rect(C.ink, x + bw - 1, sy - bh, 1, bh); x += bw + 1; }
      else if (kind < 0.7) { g.rect(C.mtn2, x, sy - 14, 10, 14); g.rect(C.sh1, x + 1, sy - 13, 2, 10); g.rect(C.ea3, x, sy - 16, 10, 2); g.rect([C.lg0, C.wa2, C.ro2][k % 3], x + 2, sy - 8, 6, 7); x += 14; }
      else if (kind < 0.82) { g.rect(C.ea3, x, sy - 18, 26, 18); g.rect(C.ea4, x, sy - 18, 26, 1); g.ellipse(C.ea1, x + 7, sy - 9, 5, 5); for (let y = sy - 14; y < sy - 4; y += 2) g.rect(C.ea1, x + 15, y, 9, 1); g.rect(C.st3, x + 20, sy - 26, 1, 8); x += 30; }
      else if (kind < 0.9) { g.ellipse(C.ea2, x + 6, sy - 6, 6, 6); g.ellipse([C.ro1, C.tq1, C.wa1][k % 3], x + 6, sy - 6, 4, 4); g.ellipse(C.ea1, x + 6, sy - 6, 1, 1); x += 14; }
      else { g.rect(C.ea1, x, sy - 22, 18, 22); g.rect(C.sh1, x + 2, sy - 20, 14, 18); g.ellipse(C.sk1, x + 6, sy - 13, 2, 3); g.ellipse(C.sk1, x + 11, sy - 12, 2, 2); g.rect(C.ro1, x + 4, sy - 10, 4, 7); g.rect(C.tq1, x + 9, sy - 10, 4, 6); x += 22; }
    }
  }
  // Dibujos de manos en señas clavados en el muro (abecedario LSM sugerido).
  for (const [px, py] of [[318, 40], [342, 58], [322, 92]] as const) {
    g.rect(C.sh1, px, py, 18, 22); g.rect(C.st4, px + 17, py + 1, 1, 22); g.rect(C.ro2, px + 8, py - 1, 2, 2);
    g.ellipse(C.ea2, px + 9, py + 13, 3, 4); for (let k = 0; k < 3; k++) g.rect(C.ea2, px + 6 + k * 2, py + 5 + (k % 2) * 2, 1, 5);
  }
  // Mesa de trabajo con estación de soldar, lupa con lámpara, tarjetas, desarmadores, taza y el Códice cerrado.
  for (let y = 0; y < 8; y++) g.rect(y === 0 ? C.ea4 : y < 3 ? C.ea3 : C.ea2, 170, 236 + y, 450, 1);
  for (const lx of [184, 600]) { g.rect(C.ea1, lx, 244, 8, 80); g.rect(C.ea2, lx, 244, 2, 80); }
  g.rect(C.ea1, 184, 300, 424, 4);
  // Estación de soldar.
  g.rect(C.st2, 200, 220, 34, 16); g.rect(C.st3, 200, 220, 34, 1); g.rect(C.ink, 205, 224, 12, 6); g.rect(C.rd1, 207, 226, 3, 2); g.rect(C.lg0, 212, 226, 3, 2); g.line(C.ink, 234, 228, 252, 214); g.line(C.st3, 252, 214, 262, 206, 2);
  // Lupa con lámpara de brazo.
  g.line(C.st3, 300, 236, 300, 190, 2); g.line(C.st3, 300, 190, 330, 176, 2); g.ellipse(C.st3, 336, 178, 11, 5); g.ellipse(C.mtn3, 336, 178, 9, 3); g.set(C.sh1, 332, 177);
  // Tarjetas de circuito y cables.
  g.rect(C.fo2, 350, 228, 30, 8); for (let k = 0; k < 8; k++) g.set(k % 2 ? C.wa2 : C.lg1, 352 + k * 3, 230 + k % 3); g.rect(C.fo3, 350, 228, 30, 1);
  for (let s = 0; s < 40; s++) g.set([C.ro2, C.tq2][s > 20 ? 1 : 0], 384 + s, 233 + Math.sin(s * 0.3) * 2);
  g.rect(C.st4, 430, 232, 16, 3); g.rect(C.wa1, 446, 232, 10, 3); g.rect(C.st4, 440, 228, 14, 2); g.rect(C.ro1, 454, 228, 6, 2);
  // Taza humeante.
  g.rect(C.sh1, 470, 224, 12, 12); g.rect(C.st4, 470, 224, 12, 1); g.rect(C.ea1, 471, 225, 10, 2); g.ellipse(C.sh1, 484, 230, 3, 3); g.ellipse(C.sk3, 484, 230, 1, 1);
  for (let k = 0; k < 14; k++) g.veil(C.sh1, 474 + Math.sin(k * 0.6) * 3, 220 - k, 0.6);
  // Códice cerrado (tapas de piel con seis fragmentos del Sello).
  g.rect(C.ea0, 512, 222, 64, 14); g.rect(C.ea1, 512, 222, 64, 12); g.rect(C.ea2, 512, 222, 64, 1); g.rect(C.sk3, 514, 233, 60, 2);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.ellipse(C.tq2, 544 + Math.cos(a) * 9, 228 + Math.sin(a) * 3, 1, 1); }
  g.ellipse(C.tq3, 544, 228, 2, 1);
  // Piso de duela con tapete y la canasta de Balam (vacía, con su cobija).
  for (let y = 250; y < H; y++) for (let x = 0; x < W; x++) {
    const plank = Math.floor((y - 250) / (6 + (y - 250) * 0.06)), lx = (x + plank * 37) % 90;
    g.set(lx === 0 ? C.ea1 : bayer(x, y) < 0.15 ? C.ea2 : (plank % 2 ? C.ea3 : C.ea4), x, y);
  }
  for (let y = 300; y < 344; y++) for (let x = 200 - (y - 300); x < 520 + (y - 300); x++) {
    const ty = y - 300, edge = ty < 3 || ty > 40;
    g.set(edge ? C.ro0 : ((x >> 3) + (ty >> 2)) % 4 === 0 ? C.tq1 : ((x >> 2) + ty) % 7 === 0 ? C.wa1 : C.ro1, x, y);
  }
  g.ellipse(C.ea2, 96, 312, 34, 12); g.ellipse(C.ea3, 96, 309, 32, 10); g.ellipse(C.ea1, 96, 306, 26, 6);
  for (let x = 64; x < 128; x += 3) g.set(C.ea4, x, 312 + Math.sin(x) * 1);
  g.ellipse(C.tq1, 98, 305, 20, 4); g.ellipse(C.tq2, 94, 304, 10, 2);
  // Sol de mañana: haces que entran por la ventana hacia el piso y la mesa.
  for (let k = 0; k < 4; k++) {
    for (let y = wy0; y < H; y++) {
      const off = (y - wy0) * 0.9, xa = wx0 + 10 + k * 60 + off, xb = xa + 36;
      for (let x = Math.floor(xa); x < xb; x++) if (!(x < wx1 && y < wy1 && x >= wx0)) g.veil(C.wa4, x, y, 0.18 * (1 - (y - wy0) / (H - wy0)) + 0.06);
    }
  }
  halo(g, 180, 120, 200, 140, C.wa3, 0.18);
  // Motas de polvo en la luz.
  for (let k = 0; k < 60; k++) { const x = wx0 + hash(k, 1, 4008) * 300 + 40, y = wy0 + hash(k, 2, 4008) * 250; g.set(C.wa4, x, y); }
}

function epilogoCodice(g: Lienzo): void {
  const W = 640, H = 360;
  // Mesa de madera con luz cálida en el centro.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const grain = noise2(x * 0.01, y * 0.2, 4101);
    g.set(grain > 0.62 ? C.ea2 : grain < 0.3 ? C.ea0 : C.ea1, x, y);
  }
  halo(g, 320, 180, 360, 220, C.ea2, 0.6); halo(g, 320, 180, 220, 150, C.ea3, 0.35);
  // Biombo del Códice: páginas plegadas a los lados (en blanco), pliego central abierto.
  const pageW = 150, pageH = 230, top = 66, cx = 320;
  const pagina = (x0: number, skew: number, shade: number, ink: boolean): void => {
    for (let y = 0; y < pageH; y++) for (let x = 0; x < pageW; x++) {
      const px = x0 + x, py = top + y + Math.round((x / pageW) * skew);
      const n = noise2(px * 0.25, py * 0.25, 4102);
      let c: string = n < 0.22 && bayer(px, py) < 0.4 ? C.sk2 : bayer(px, py) < 0.06 ? C.wa4 : C.sk3;
      if (shade > 0 && bayer(px, py) < shade) c = C.sk2;
      if (x < 2 || y < 2 || x > pageW - 3 || y > pageH - 3) c = C.ea4;
      g.set(c, px, py);
    }
    // Recuadro rojo de los registros (en blanco también, apenas trazado).
    const red = ink ? C.rd0 : C.sk2;
    for (let x = 8; x < pageW - 8; x++) { g.set(red, x0 + x, top + 8 + Math.round(x / pageW * skew)); g.set(red, x0 + x, top + pageH - 9 + Math.round(x / pageW * skew)); }
    for (let y = 8; y < pageH - 8; y++) { g.set(red, x0 + 8, top + y); g.set(red, x0 + pageW - 9, top + y + skew); }
  };
  // Pliegues laterales (en perspectiva) y sombra bajo el libro.
  for (let y = top + 8; y < top + pageH + 12; y++) for (let x = cx - pageW * 2 + 10; x < cx + pageW * 2 - 10; x++) g.veil(C.ea0, x, y, 0.6);
  pagina(cx - pageW * 2 + 20, 6, 0.25, false);
  pagina(cx + pageW - 20, -6, 0.25, false);
  pagina(cx - pageW, 0, 0, true);
  pagina(cx, 0, 0.05, false);
  // Pliegue central.
  for (let y = top; y < top + pageH; y++) { g.set(C.ea3, cx - 1, y); g.set(C.sk1, cx, y); g.set(C.ea4, cx + 1, y); }
  // Página izquierda con tinta: registros con glifos (sol que regresa, mariposa de obsidiana quebrada,
  // jaguar, manos en señas, madre e hijo, huellas de camino y los seis fragmentos).
  const L = cx - pageW;
  for (const ry of [top + 80, top + 150]) for (let x = L + 8; x < L + pageW - 8; x++) g.set(C.rd0, x, ry);
  // Registro 1: sol con rayos y disco del eclipse que se aparta.
  const sx = L + 44, sy = top + 44;
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.line(C.wa1, sx + Math.cos(a) * 14, sy + Math.sin(a) * 14, sx + Math.cos(a) * 22, sy + Math.sin(a) * 22); }
  g.ellipse(C.ink, sx, sy, 13, 13); g.ellipse(C.wa2, sx, sy, 11, 11); g.ellipse(C.rd0, sx, sy, 4, 4); g.ellipse(C.ink, sx + 26, sy - 10, 6, 6);
  // Mariposa de obsidiana quebrada (alas partidas).
  const bx = L + 108, by = top + 44;
  for (const s of [-1, 1]) for (let y = -14; y <= 14; y++) for (let x = 2; x < 22; x++) {
    if ((x / 22) ** 2 + (y / (y < 0 ? 14 : 10)) ** 2 > 1) continue;
    const crack = Math.abs(x - 10 - y * 0.4) < 1;
    g.set(crack ? C.sk3 : (x > 16 || Math.abs(y) > 10) ? C.ink : C.pu0, bx + s * x, by + y);
  }
  g.rect(C.ink, bx - 1, by - 12, 3, 24); g.set(C.ink, bx - 3, by - 15); g.set(C.ink, bx + 3, by - 15);
  // Registro 2: madre e hijo frente a frente con manos en señas; jaguar (Balam) a los pies.
  const figura = (fx: number, fy: number, tall: number, col: string): void => {
    g.ellipse(C.ink, fx, fy, 6, 6); g.ellipse(C.sk1, fx, fy, 5, 5); g.set(C.ink, fx + 2, fy - 1);
    g.rect(C.ink, fx - 6, fy + 6, 13, tall); g.rect(col, fx - 5, fy + 7, 11, tall - 2);
    for (let k = 0; k < 4; k++) g.rect(C.ink, fx - 3 + k * 2, fy + tall + 6, 1, 4);
  };
  figura(L + 38, top + 98, 26, C.tq1); figura(L + 104, top + 102, 20, C.wa1);
  for (const [hx, hy] of [[L + 56, top + 108], [L + 86, top + 110]] as const) { g.ellipse(C.ink, hx, hy, 5, 4); g.ellipse(C.sk1, hx, hy, 4, 3); for (let k = 0; k < 3; k++) g.rect(C.ink, hx - 2 + k * 2, hy - 7, 1, 4); }
  for (let k = 0; k < 6; k++) g.set(C.rd0, L + 62 + k * 3, top + 100 + (k % 2) * 2); // vírgulas (el habla en señas)
  // Jaguar luminoso estilizado.
  g.ellipse(C.ink, L + 72, top + 140, 16, 5); g.ellipse(C.wa2, L + 72, top + 140, 14, 4); for (let k = 0; k < 6; k++) g.ellipse(C.ink, L + 62 + k * 4, top + 139 + (k % 2), 1, 1);
  g.ellipse(C.ink, L + 90, top + 136, 5, 4); g.ellipse(C.wa2, L + 90, top + 136, 4, 3);
  // Registro 3: camino de huellas que cruza la página y los seis fragmentos del Sello.
  for (let k = 0; k < 9; k++) { const fx = L + 16 + k * 14, fy = top + 170 + (k % 2) * 6; g.ellipse(C.ink, fx, fy, 2, 3); g.rect(C.ink, fx - 2, fy - 5, 1, 1); g.rect(C.ink, fx, fy - 6, 1, 1); g.rect(C.ink, fx + 2, fy - 5, 1, 1); }
  for (let k = 0; k < 6; k++) { const fx = L + 26 + k * 20, fy = top + 202; g.ellipse(C.ink, fx, fy, 6, 6); g.ellipse(C.tq1, fx, fy, 5, 5); g.ellipse(C.tq2, fx - 1, fy - 1, 2, 2); }
  // Página derecha: en blanco, con una sola huella de tinta fresca al inicio (lo que falta por escribir).
  g.ellipse(C.ink, cx + 24, top + 26, 2, 3); g.rect(C.ink, cx + 22, top + 21, 1, 1); g.rect(C.ink, cx + 24, top + 20, 1, 1); g.rect(C.ink, cx + 26, top + 21, 1, 1);
  // Pincel y tintero al lado.
  g.ellipse(C.ink, 560, 300, 14, 6); g.ellipse(C.st1, 560, 298, 12, 4); g.ellipse(C.ink, 560, 297, 8, 2);
  g.line(C.ea3, 520, 330, 600, 270, 2); g.line(C.ink, 600, 270, 608, 264, 3); g.set(C.ea4, 540, 314);
  // Luz de mañana desde la izquierda.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.veil(C.wa4, x, y, Math.max(0, 0.16 - Math.abs(x * 0.6 - y + 40) / 400));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot((x - 320) / 360, (y - 180) / 220); if (d > 0.85) g.veil(C.ink, x, y, (d - 0.85) * 2.5); }
}

/** Dibuja una pantalla del epílogo (640×360). */
export function drawGdlEpilogo(kind: GdlEpilogo): Lienzo {
  const g = new Lienzo(640, 360);
  if (kind === 'taller') epilogoTaller(g); else epilogoCodice(g);
  return g;
}

/* ================================ DESPACHO ================================ */

/** Dibuja una capa completa (0–5) de una sección en un lienzo nuevo del tamaño de gdlLayerSize. */
export function drawGdlLayer(section: GdlSection, index: number, width: number, height = 360): Lienzo {
  const g = new Lienzo(width, height);
  const table: Record<GdlSection, Array<(g: Lienzo, w: number) => void>> = {
    gdl_avenida: [aveSky, aveFar, aveMid, aveNear, aveGround, aveFront],
    catedral: [catSky, catFar, catMid, catNear, catInterior, catFront],
    catedral_eclipse: [eclSky, eclFar, eclMid, eclNear, eclInterior, eclFront],
  };
  table[section][index](g, width);
  return g;
}
