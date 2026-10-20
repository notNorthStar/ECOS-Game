/**
 * Paisaje del Nivel 6 (capas 0–3) para las tres secciones de la CDMX en ruinas:
 * - xochimilco: noche brumosa, volcanes al fondo, ahuejotes, chinampas, embarcadero con trajineras
 *   varadas y la Isla de las Muñecas (árboles secos con muñecas viejas colgando, velas).
 * - avenidas: avenida devastada en Día de Muertos: rascacielos rotos, edificios art déco y
 *   retrofuturistas, neones, cortinas metálicas, ofrendas en los zaguanes y papel picado.
 * - reforma: Paseo de la Reforma bajo una aurora enfermiza: rascacielos colosales que pierden
 *   pedazos, pirámide mexica al fondo, cables y cabinas del teleférico, la columna rota del Ángel y,
 *   al final, la estación base del teleférico.
 * Sin Phaser ni DOM (lo usa también tools/gen-cdmx-scenery.mjs).
 */
import { C, Lienzo, bayer, calaverita, cempasuchilMata, concreto, dust, frisoGreca, grieta, halo, hash, miniText, noise1, noise2, papelEstatico, ramp, ventanal, NEON } from './CdmxPixels';
import { drawCdmxForeground, drawCdmxGround } from './CdmxTerrain';

export type CdmxSection = 'xochimilco' | 'avenidas' | 'reforma';
export const CDMX_BG_PREFIX: Record<CdmxSection, string> = {
  xochimilco: 'fondo_xochimilco', avenidas: 'fondo_avenidas', reforma: 'fondo_reforma',
};
export const CDMX_SECTION_WIDTH: Record<CdmxSection, number> = { xochimilco: 3000, avenidas: 3200, reforma: 2800 };

/** x en una capa de factor `f` del rasgo que se ve detrás del punto x del mundo (cámara centrada). */
export const atWorld = (x: number, f: number): number => Math.round(320 + (x - 320) * f);

/** Puntos de referencia del mundo (x del suelo, y en la franja 220…345). El JSON del nivel manda. */
export const CDMX_LANDMARKS = {
  xochimilco: {
    /** Embarcadero de madera con arcos de trajinera al inicio (fondo y suelo con tablones). */
    embarcadero: { x0: 120, x1: 560 },
    /** Isla de las Muñecas: árboles con muñecas viejas y la casita del cuidador en la capa 3. */
    islaMunecas: { x0: 1150, x1: 2050 },
    /** Charco de luz donde va la ofrenda flotante / brasero de FUEGO. */
    ofrendaFuego: { x: 2320, y: 268 },
    /** Explanada de tierra firme sugerida para el primer Altar de la Memoria. */
    altar: { x: 2720, y: 250 },
  },
  avenidas: {
    /** Glorieta de entrada con las letras CDMX (losas en el suelo). */
    plazaLetras: { x0: 150, x1: 470 },
    /** Zaguán del edificio con la ofrenda grande (DESCANSO): charco de luz de velas. */
    ofrenda: { x: 1650, y: 246 },
    /** Esquina de la cronista (puesto de periódicos en la capa 3). */
    cronista: { x: 980, y: 244 },
    /** Explanada para el checkpoint / altar. */
    checkpoint: { x: 2350, y: 250 },
  },
  reforma: {
    /** Pedestal roto del Ángel (capa 3) y cráter en el asfalto donde cayó. */
    angel: { x: 1450, y: 272 },
    /** Centro sugerido de la arena de la Nahuala (glorieta agrietada). */
    arena: { x: 1620, y: 286 },
    /** Estación base del teleférico (fachada en la capa 3; salida). */
    estacion: { x: 2560, y: 236 },
  },
} as const;

/* ======================= RASGOS QUE ANIMA EL DECORADO ======================= */

export interface CdmxLight { x: number; y: number; kind: 'vela' | 'farol' | 'ventana' | 'fuego' | 'aurora' | 'neon'; tint?: string }
export interface CdmxCable { x0: number; x1: number; y: number; sag: number }
/** Letrero de neón pintado en la capa 3 (el decorado lo hace parpadear). */
export interface CdmxNeon { x: number; y: number; w: number; h: number; color: string; broken: boolean }
/** Torre lejana (capa 2) de la que se desprenden pedazos. */
export interface CdmxTower { x: number; top: number; w: number }
/** Cable del teleférico en la capa 2 (recta entre dos torres). */
export interface CdmxTele { x0: number; y0: number; x1: number; y1: number }

let lights: CdmxLight[] | null = null;
let cables: CdmxCable[] | null = null;
let neons: CdmxNeon[] | null = null;
const light = (x: number, y: number, kind: CdmxLight['kind']): void => { lights?.push({ x: Math.round(x), y: Math.round(y), kind }); };

/* ============================== CAPA 0: CIELO ============================== */

function stars(g: Lienzo, w: number, count: number, maxY: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(i, 1, seed) * w), y = Math.floor(hash(i, 2, seed) ** 1.6 * maxY), b = hash(i, 3, seed);
    g.set(b > 0.94 ? C.wa4 : b > 0.7 ? C.sh0 : C.mtn1, x, y);
    if (b > 0.99) { g.set(C.sh0, x - 1, y); g.set(C.sh0, x + 1, y); g.set(C.sh0, x, y - 1); g.set(C.sh0, x, y + 1); }
  }
}

/** Banco de bruma alargado (tramado). */
function bruma(g: Lienzo, w: number, y0: number, y1: number, c: string, k: number, seed: number): void {
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const n = noise2(x * 0.01, y * 0.08, seed);
    if (n > 0.45) g.veil(c, x, y, (n - 0.45) * 2 * k * Math.sin((y - y0) / (y1 - y0) * Math.PI));
  }
}

function nubeLarga(g: Lienzo, x: number, y: number, span: number, body: string, rim: string, seed: number): void {
  for (let dx = 0; dx < span; dx++) {
    const t = dx / span, env = Math.sin(t * Math.PI) ** 0.7;
    const th = 1 + env * (3 + noise1(dx * 0.07, seed) * 4);
    const top = y - th + noise1(dx * 0.03, seed + 3) * 3;
    for (let py = Math.floor(top); py <= y + 1; py++) {
      if (hash(dx, py, seed) > 0.35 + env * 0.65) continue;
      g.set(py >= y ? rim : body, x + dx, py);
    }
  }
}

function luna(g: Lienzo, mx: number, my: number, r: number, halo1: string, body: string, hi: string): void {
  for (let y = my - r * 3; y < my + r * 3; y++) for (let x = mx - r * 3; x < mx + r * 3; x++) {
    const d = Math.hypot(x - mx, y - my);
    if (d <= r) g.set(d > r - 1.5 ? body : bayer(x, y) < 0.5 - (x - mx + y - my) / (r * 4) ? hi : body, x, y);
    else if (d < r * 3) g.veil(halo1, x, y, ((1 - (d - r) / (r * 2)) ** 2) * 0.5);
  }
  // Mares lunares.
  g.ellipse(C.mtn2, mx + r * 0.3, my - r * 0.2, r * 0.25, r * 0.2); g.ellipse(C.mtn2, mx - r * 0.35, my + r * 0.3, r * 0.2, r * 0.15);
}

function skyXochimilco(g: Lienzo, w: number): void {
  ramp(g, [C.ink, C.void, C.deep, C.night, C.dusk, C.teal0], 0, 205, w);
  stars(g, w, w * 0.25, 110, 61);
  luna(g, Math.round(w * 0.7), 54, 13, C.fog1, C.mtn2, C.mtn3);
  for (let n = 0; n < 8; n++) nubeLarga(g, hash(n, 1, 62) * w, 50 + hash(n, 2, 62) * 90, 100 + hash(n, 3, 62) * 160, C.night, n % 2 ? C.dusk : C.mtn0, n + 5);
  bruma(g, w, 120, 210, C.fog0, 0.9, 63);
}

function skyAvenidas(g: Lienzo, w: number): void {
  // Noche de Día de Muertos: violeta profundo con el resplandor rosa-naranja de incendios y velas.
  ramp(g, [C.ink, C.void, C.pu0, C.ro0, C.te0, C.te1], 0, 208, w);
  stars(g, w, w * 0.2, 90, 71);
  for (let n = 0; n < 10; n++) nubeLarga(g, hash(n, 1, 72) * w, 60 + hash(n, 2, 72) * 110, 90 + hash(n, 3, 72) * 150, n % 3 ? C.pu0 : C.ink, n % 2 ? C.ro0 : C.te1, n + 40);
  // Resplandor cálido abajo (la ciudad entera encendió veladoras).
  for (let y = 150; y < 210; y++) for (let x = 0; x < w; x++) g.veil(C.wa0, x, y, (y - 150) / 60 * 0.35 * (0.6 + noise1(x * 0.01, 7) * 0.6));
}

/** Aurora enfermiza: cortinas verdosas y moradas que ondulan. */
function aurora(g: Lienzo, w: number, y0: number, seed: number): void {
  for (let band = 0; band < 2; band++) {
    const edge = band === 1 ? C.pu0 : C.fo2, body = band === 1 ? C.pu1 : C.fo3, core = band === 1 ? C.pu2 : C.fo4;
    for (let x = 0; x < w; x++) {
      const yc = y0 + band * 30 + Math.sin(x * 0.01 + band * 2 + seed) * 12 + noise1(x * 0.015, seed + band) * 14;
      const len = 30 + noise1(x * 0.04, seed + band + 9) * 36;
      // Intensidad suave a lo ancho, con estrías verticales finas (cortinas).
      const env = Math.max(0, noise1(x * 0.006, seed + band + 3) - 0.3) / 0.7;
      const k = env * (0.55 + 0.45 * noise1(x * 0.2, seed + band + 5));
      if (k <= 0.02) continue;
      for (let y = 0; y < len; y++) {
        const t = y / len, fade = Math.min(1, y / 6) * (1 - t) ** 1.4;
        const a = k * fade * (band === 1 ? 0.7 : 0.95);
        g.veil(a > 0.38 ? core : a > 0.18 ? body : edge, x, yc + y, Math.min(0.85, a * 1.6));
      }
    }
  }
}

function skyReforma(g: Lienzo, w: number): void {
  ramp(g, [C.ink, C.void, C.deep, C.pu0, C.night, C.dusk], 0, 205, w);
  stars(g, w, w * 0.3, 100, 81);
  aurora(g, w, 18, 3);
  for (let n = 0; n < 7; n++) nubeLarga(g, hash(n, 1, 82) * w, 100 + hash(n, 2, 82) * 70, 120 + hash(n, 3, 82) * 150, C.ink, n % 2 ? C.pu0 : C.fo1, n + 70);
  // Lejano resplandor verde bajo las nubes (la aurora se refleja en el humo).
  for (let y = 160; y < 205; y++) for (let x = 0; x < w; x++) g.veil(C.fo1, x, y, (y - 160) / 45 * 0.4);
}

/* =========================== EDIFICIOS Y SILUETAS =========================== */

interface TorreOpts { body: string; dark: string; hi: string; win: number; lean?: number; broken?: number; style?: 'vidrio' | 'deco' | 'retro'; seed: number; holes?: number; antenna?: boolean }

/**
 * Rascacielos por píxel: perfil según estilo (escalonado art déco, cristal, retrofuturista con
 * disco), remate roto, boquetes con varilla expuesta e inclinación opcional (lean px por px de alto).
 */
function torre(g: Lienzo, x: number, base: number, w: number, h: number, o: TorreOpts): void {
  const style = o.style ?? 'vidrio', lean = o.lean ?? 0, broken = o.broken ?? 0, top = base - h;
  const brokenTop = (lx: number) => top + Math.round(broken * h * (0.15 + noise1(lx * 0.18, o.seed) * 0.5 + (lx / w) * 0.25));
  for (let y = top - 14; y < base; y++) {
    const off = Math.round((base - y) * lean), ly = y - top;
    for (let lx = -6; lx < w + 6; lx++) {
      // Perfil del estilo.
      let inside = lx >= 0 && lx < w;
      if (style === 'deco') {
        const step = ly < h * 0.08 ? 0.32 : ly < h * 0.16 ? 0.2 : ly < h * 0.24 ? 0.1 : 0;
        inside = lx >= w * step && lx < w * (1 - step);
        if (ly < 0) inside = ly > -12 && Math.abs(lx - w / 2) < 1 + (12 + ly) * 0.1; // aguja
      } else if (style === 'retro') {
        const disc = ly >= h * 0.06 && ly < h * 0.11;
        inside = disc ? lx >= -5 && lx < w + 5 : ly < h * 0.06 ? Math.abs(lx - w / 2) < w * 0.22 : inside;
        if (ly < 0) inside = ly > -14 && Math.abs(lx - w / 2) < 1;
      } else if (ly < 0) inside = false;
      if (!inside) continue;
      if (broken > 0 && y < brokenTop(lx)) continue;
      // Boquetes por donde se ve el cielo.
      const hole = (o.holes ?? 0) > 0 && noise2(lx * 0.12, ly * 0.09, o.seed + 5) > 1 - (o.holes ?? 0) * 0.35 && ly > h * 0.15;
      if (hole) continue;
      let c = o.body;
      const shade = lx > w * 0.68;
      if (lx < 2) c = o.hi;
      else if (shade) c = o.dark;
      if (style === 'retro' && ly >= h * 0.06 && ly < h * 0.11) c = ly === Math.ceil(h * 0.06) ? o.hi : o.dark;
      else if (ly > 2 && lx > 2 && lx < w - 3) {
        // Ventanas: rejilla según el estilo.
        const vx = style === 'vidrio' ? lx % 3 : lx % 5, vy = style === 'vidrio' ? ly % 4 : ly % 7;
        const isWin = style === 'vidrio' ? vx !== 0 && vy !== 0 : vx >= 1 && vx <= 2 && vy >= 2 && vy <= 4;
        if (isWin) {
          const r = hash(Math.floor(lx / 5), Math.floor(ly / 7), o.seed);
          c = r < o.win * 0.3 ? C.wa2 : r < o.win ? C.wa0 : shade ? C.ink : style === 'vidrio' ? C.night : C.void;
        }
        if (style === 'deco' && lx % 10 === 0) c = o.hi; // pilastras
      }
      g.set(c, x + lx + off, y);
    }
  }
  // Borde roto: varilla y concreto astillado.
  if (broken > 0) for (let lx = 0; lx < w; lx += 1) {
    const y = brokenTop(lx), off = Math.round((base - y) * lean);
    if (g.has(x + lx + off, y)) g.set(o.hi, x + lx + off, y);
    if (hash(lx, 3, o.seed) > 0.94) g.line(o.dark, x + lx + off, y, x + lx + off + (hash(lx, 4, o.seed) - 0.5) * 6, y - 3 - hash(lx, 5, o.seed) * 5);
  }
  if (o.antenna && broken === 0) {
    const ax = x + Math.round(w / 2) + Math.round(h * lean);
    g.rect(o.dark, ax, top - 22, 1, 22); g.rect(o.dark, ax - 3, top - 14, 7, 1);
    g.set(C.rd1, ax, top - 23); light(ax, top - 23, 'farol');
  }
}

/** Pirámide mexica escalonada con escalinata doble y dos templos en la cima. */
function piramide(g: Lienzo, cx: number, base: number, w: number, h: number, tiers: number, body: string, step: string, hi: string, detail: boolean): void {
  const th = h / tiers;
  for (let t = 0; t < tiers; t++) {
    const y0 = Math.round(base - (t + 1) * th), half = Math.round(w / 2 * (1 - t / (tiers + 1.5)));
    // Talud con tablero: muro inclinado de cada cuerpo.
    for (let y = y0; y < Math.round(base - t * th); y++) {
      const k = (y - y0) / th, hw = half - Math.round((1 - k) * 3);
      g.rect(body, cx - hw, y, hw * 2, 1);
      g.set(hi, cx - hw, y);
      if (detail) g.rect(step, cx + hw - Math.round(hw * 0.25), y, Math.round(hw * 0.25), 1);
    }
    g.rect(hi, cx - half + 3, y0, half * 2 - 6, 1);
  }
  // Escalinata doble con alfardas.
  const sw = Math.max(6, Math.round(w * 0.12)), top = Math.round(base - h);
  for (let y = top; y < base; y++) {
    const k = (y - top) / h, half = Math.round(sw * (0.6 + k * 0.5));
    g.rect(step, cx - half, y, half * 2, 1);
    if (detail && y % 2 === 0) g.rect(hi, cx - half + 1, y, half * 2 - 2, 1);
    g.set(C.ink, cx, y);
  }
  // Templos gemelos (lluvia: turquesa; guerra: rojo), techos en silueta.
  for (const side of [-1, 1]) {
    const tx = cx + side * Math.round(sw * 0.9) - 5;
    g.rect(body, tx, top - 12, 11, 12); g.rect(C.ink, tx + 3, top - 8, 5, 8);
    g.rect(detail ? (side < 0 ? C.tq0 : C.te1) : step, tx - 1, top - 16, 13, 4);
    if (detail) for (let k = 0; k < 13; k += 3) g.set(side < 0 ? C.tq1 : C.te2, tx - 1 + k, top - 15);
  }
}

/** Ahuejote: árbol columnar y esbelto de las chinampas. */
function ahuejote(g: Lienzo, x: number, base: number, h: number, w: number, dark: string, mid: string, hi: string | null, seed: number): void {
  g.rect(dark, x - 1, base - h * 0.25, 2, h * 0.25);
  for (let y = 0; y < h * 0.9; y++) {
    const t = y / (h * 0.9), half = w / 2 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.95) * (0.75 + noise1(y * 0.25, seed) * 0.4);
    const yy = base - h + y;
    for (let px = -Math.ceil(half); px <= half; px++) {
      if (hash(px, y, seed) > 0.9 && Math.abs(px) > half - 2) continue;
      g.set(hi && px < -half * 0.3 && hash(px, y, seed + 1) > 0.55 ? hi : (px + y) % 5 === 0 ? dark : mid, x + px, yy);
    }
  }
}

/** Volcán nevado (Popocatépetl / Iztaccíhuatl en silueta). */
function volcan(g: Lienzo, cx: number, base: number, w: number, h: number, body: string, snow: string, seed: number, flat = false): void {
  for (let x = -w / 2; x < w / 2; x++) {
    const t = Math.abs(x) / (w / 2);
    const top = flat ? base - h * (1 - t ** 1.5) * (0.85 + noise1(x * 0.04, seed) * 0.15) : base - h * (1 - t) ** 1.25 - noise1(x * 0.08, seed) * 4;
    const crater = !flat && Math.abs(x) < w * 0.04;
    const y0 = Math.round(crater ? top + 4 : top);
    g.rect(body, cx + x, y0, 1, base - y0);
    const snowLen = (1 - t) * h * 0.35 * (0.6 + noise1(x * 0.3, seed + 2) * 0.6);
    for (let y = y0; y < y0 + snowLen; y++) if (bayer(cx + x, y) < 1 - (y - y0) / snowLen * 0.8) g.set(snow, cx + x, y);
  }
}

/** Trajinera de fondo: casco, tablero con el nombre y techo de arco. */
function trajineraFondo(g: Lienzo, x: number, base: number, n: number, tilt: number, s = 1): void {
  const w = Math.round(70 * s), cols = [[C.ro1, C.wa2], [C.tq1, C.ro2], [C.wa1, C.tq1], [C.pu1, C.wa2], [C.fo3, C.ro1]][n % 5];
  const yo = (k: number) => Math.round((k - w / 2) * tilt);
  const hh = Math.round(7 * s), postH = Math.round(22 * s);
  // Casco con franja pintada.
  for (let k = 0; k < w; k++) {
    const bow = k < 6 * s ? Math.round((6 * s - k) * 0.5) : 0;
    const yy = base - hh + yo(k) + bow;
    g.rect(C.ea1, x + k, yy, 1, hh - bow); g.set(C.ea3, x + k, yy);
    g.set(k % 4 < 2 ? cols[0] : cols[1], x + k, yy + 2);
  }
  // Postes y techo de lona pintada (rayas de colores con orilla de flecos).
  for (const px of [Math.round(8 * s), Math.round(w / 2), w - Math.round(6 * s)]) g.rect(C.ea0, x + px, base - hh - postH + yo(px), 1 + Math.floor(s), postH);
  for (let k = Math.round(4 * s); k < w; k++) {
    const yy = base - hh - postH - 2 + yo(k);
    g.rect(Math.floor(k / (3 * s)) % 2 ? cols[0] : cols[1], x + k, yy, 1, Math.round(3 * s));
    if (k % 2 === 0) g.set(cols[0], x + k, yy + Math.round(3 * s));
  }
  // Tablero frontal en arco con el nombre (rayitas) y flores pintadas.
  const aw = Math.round(24 * s), ax = x - Math.round(2 * s), ay = base - hh - postH - Math.round(3 * s) + yo(0);
  for (let k = 0; k < aw; k++) {
    const arch = Math.round(Math.sin(k / (aw - 1) * Math.PI) * 5 * s);
    g.rect(cols[0], ax + k, ay - arch, 1, Math.round(12 * s) + arch); g.set(cols[1], ax + k, ay - arch); g.set(C.ink, ax + k, ay + Math.round(12 * s));
  }
  for (let k = 0; k < 4; k++) g.rect([C.wa3, C.ro3, C.tq3, C.sh1][k], ax + Math.round((3 + k * 5) * s), ay + Math.round(2 * s), Math.ceil(s), Math.ceil(s));
  g.rect(C.sh1, ax + Math.round(4 * s), ay + Math.round(6 * s), aw - Math.round(8 * s), 1);
}

/** Árbol seco de la Isla de las Muñecas, con muñecas viejas colgadas (sin violencia, solo inquietud). */
function arbolMunecas(g: Lienzo, x: number, base: number, h: number, seed: number, bark: string, barkHi: string, dollTone: number): void {
  // Tronco torcido y ramas desnudas.
  let tx = x;
  for (let y = 0; y < h; y++) {
    tx += (noise1(y * 0.05, seed) - 0.5) * 0.8;
    const half = 2 + (1 - y / h) * 3;
    g.rect(bark, tx - half, base - y, half * 2, 1); g.set(barkHi, tx - half, base - y);
  }
  const branches: Array<[number, number]> = [];
  for (let b = 0; b < 6; b++) {
    const by = base - h * (0.45 + hash(b, 1, seed) * 0.5), dir = b % 2 ? 1 : -1, len = 14 + hash(b, 2, seed) * 26;
    let px = x + (noise1((base - by) * 0.05, seed) - 0.5) * 6, py = by;
    for (let s = 0; s < len; s++) {
      px += dir * (0.8 + hash(s, b, seed) * 0.5); py -= 0.4 + hash(s, b + 9, seed) * 0.5;
      g.set(bark, px, py); if (s < len * 0.4) g.set(bark, px, py + 1);
      if (s % 7 === 6) branches.push([px, py]);
    }
    branches.push([px, py]);
  }
  // Muñecas colgadas de cordones: cuerpo pálido, vestido desteñido, cabello revuelto.
  const tones = [[C.sh0, C.ro0, C.st0], [C.sk1, C.pu0, C.ea0], [C.sh1, C.tq0, C.ea1], [C.st5, C.te1, C.st0]];
  branches.forEach(([bx, by], k) => {
    if (hash(k, 3, seed) < 0.3) return;
    const len = 3 + Math.floor(hash(k, 4, seed) * 7), dx = Math.round(bx), dy = Math.round(by) + len;
    g.rect(C.st2, dx, Math.round(by), 1, len);
    const [skin, dress, hair] = tones[(k + dollTone) % tones.length];
    g.rect(hair, dx - 1, dy, 3, 1); g.rect(skin, dx - 1, dy + 1, 3, 2); g.set(C.ink, dx, dy + 1);
    g.rect(dress, dx - 1, dy + 3, 3, 3); g.set(dress, dx - 2, dy + 5); g.set(dress, dx + 2, dy + 5);
    g.set(skin, dx - 1, dy + 6); g.set(skin, dx + 1, dy + 6);
  });
}

/** Casita del cuidador de la isla: madera, muñecas clavadas al muro, velas y un farol. */
function casitaIsla(g: Lienzo, x: number, base: number): void {
  const w = 70, h = 46;
  g.rect(C.ea0, x - 1, base - h - 1, w + 2, h + 1);
  for (let px = 0; px < w; px++) for (let y = 0; y < h; y++) g.set(px % 7 === 0 ? C.ea0 : hash(Math.floor(px / 7), y >> 3, 3) > 0.6 ? C.ea2 : C.ea1, x + px, base - h + y);
  for (let k = -4; k < w + 4; k++) { const yy = base - h - 12 + Math.abs(k - w / 2) * 0.35; g.rect(C.st1, x + k, yy, 1, 4); if (k % 4 === 0) g.set(C.st3, x + k, yy); }
  g.rect(C.ink, x + 8, base - 30, 14, 30); g.rect(C.wa0, x + 9, base - 28, 12, 6); light(x + 15, base - 25, 'vela');
  // Muñecas viejas clavadas en el muro (solo siluetas pálidas, ojos vacíos).
  for (let k = 0; k < 9; k++) {
    const dx = x + 28 + (k % 5) * 8, dy = base - h + 6 + Math.floor(k / 5) * 16;
    g.rect(C.st5, dx, dy, 4, 4); g.set(C.ink, dx + 1, dy + 1); g.set(C.ink, dx + 3, dy + 1);
    g.rect([C.ro0, C.tq0, C.pu0, C.te1][k % 4], dx, dy + 4, 4, 5); g.set(C.st5, dx - 1, dy + 5); g.set(C.st5, dx + 4, dy + 5);
  }
  miniText(g, C.st4, 'ISLA', x + 30, base - h - 8);
  for (let k = 0; k < 5; k++) { const vx = x - 10 + k * 4; g.rect(C.sh1, vx, base - 4 - (k % 3), 2, 4 + (k % 3)); g.set(C.wa3, vx, base - 5 - (k % 3)); }
  light(x - 4, base - 6, 'vela');
}

/* ======================== CAPA 1: LEJANÍA ======================== */

function farXochimilco(g: Lienzo, w: number): void {
  // Los volcanes al sureste, apenas visibles entre la bruma.
  volcan(g, Math.round(w * 0.3), 205, 300, 92, C.mtn0, C.mtn1, 2, true);
  volcan(g, Math.round(w * 0.62), 205, 260, 118, C.mtn0, C.mtn2, 3);
  bruma(g, w, 120, 205, C.dusk, 0.8, 4);
  // Cerros con la ciudad en ruinas en la lejanía: torres de silueta.
  for (let x = 0; x < w; x++) { const y = 190 - Math.round(noise1(x * 0.01, 5) * 18); g.rect(C.night, x, y, 1, 205 - y); }
  for (let k = 0; k < w / 70; k++) torre(g, Math.round(hash(k, 1, 6) * w), 196, 8 + Math.round(hash(k, 2, 6) * 8), 20 + hash(k, 3, 6) * 40, { body: C.night, dark: C.deep, hi: C.dusk, win: 0.04, broken: hash(k, 4, 6) > 0.5 ? 0.5 : 0, seed: k });
  bruma(g, w, 170, 210, C.fog0, 0.7, 7);
}

/** Torres colosales de una capa (deterministas: también las usa el decorado). */
function towersFar(section: CdmxSection, w: number): Array<TorreOpts & { x: number; w: number; h: number }> {
  const out: Array<TorreOpts & { x: number; w: number; h: number }> = [];
  const seed = section === 'avenidas' ? 90 : 95;
  for (let k = 0, x = -20; x < w; k++) {
    const tw = 18 + Math.round(hash(k, 1, seed) * 26), th = 90 + Math.round(hash(k, 2, seed) * (section === 'reforma' ? 110 : 80));
    const styles = ['vidrio', 'deco', 'retro'] as const;
    out.push({ x, w: tw, h: th, body: C.deep, dark: C.void, hi: C.night, win: 0.05, style: styles[k % 3], seed: k + seed, lean: hash(k, 3, seed) > 0.8 ? (hash(k, 4, seed) - 0.5) * 0.25 : 0, broken: hash(k, 5, seed) > 0.4 ? 0.2 + hash(k, 6, seed) * 0.4 : 0, holes: hash(k, 7, seed) > 0.6 ? 0.6 : 0, antenna: k % 4 === 1 });
    x += tw + 8 + Math.round(hash(k, 8, seed) * 40);
  }
  return out;
}

function farAvenidas(g: Lienzo, w: number): void {
  for (const t of towersFar('avenidas', w)) torre(g, t.x, 205, t.w, t.h, t);
  bruma(g, w, 120, 205, C.ro0, 0.6, 11);
  for (let x = 0; x < w; x++) { const y = 196 - Math.round(noise1(x * 0.02, 12) * 10); g.rect(C.void, x, y, 1, 205 - y); }
}

function farReforma(g: Lienzo, w: number): void {
  for (const t of towersFar('reforma', w)) torre(g, t.x, 205, t.w, t.h, t);
  // Pirámide mexica enorme en la lejanía (reconstruida por la catástrofe junto a las torres).
  piramide(g, Math.round(w * 0.55), 205, 260, 92, 4, C.night, C.deep, C.dusk, false);
  bruma(g, w, 130, 205, C.fo1, 0.6, 13);
}

/* ======================== CAPA 2: CIUDAD MEDIA ======================== */

/** Torres de la capa 2 (posiciones y alturas deterministas para los pedazos que caen). */
function towersMid(section: CdmxSection, w: number): Array<TorreOpts & { x: number; w: number; h: number }> {
  if (section === 'xochimilco') return [];
  const out: Array<TorreOpts & { x: number; w: number; h: number }> = [];
  const seed = section === 'avenidas' ? 120 : 130, pyr = section === 'reforma' ? atWorld(1450, 0.4) : -9999;
  for (let k = 0, x = 10; x < w; k++) {
    const tw = 28 + Math.round(hash(k, 1, seed) * 30), th = 70 + Math.round(hash(k, 2, seed) * (section === 'reforma' ? 120 : 90));
    if (Math.abs(x + tw / 2 - pyr) < 150) { x += 60; continue; }
    const styles = ['deco', 'vidrio', 'retro', 'vidrio'] as const;
    out.push({ x, w: tw, h: th, body: section === 'reforma' ? C.night : C.st0, dark: C.ink, hi: section === 'reforma' ? C.dusk : C.st1, win: 0.12, style: styles[k % 4], seed: k + seed,
      lean: k % 5 === 3 ? 0.18 * (k % 2 ? 1 : -1) : 0, broken: hash(k, 5, seed) > 0.35 ? 0.15 + hash(k, 6, seed) * 0.35 : 0, holes: hash(k, 7, seed) > 0.5 ? 0.7 : 0, antenna: k % 3 === 0 });
    x += tw + 20 + Math.round(hash(k, 8, seed) * 70);
  }
  return out;
}

/** Torres de la capa 2 de las que se desprenden pedazos (coordenadas de esa capa). */
export function cdmxTowers(section: CdmxSection, width: number): CdmxTower[] {
  return towersMid(section, width).map(t => {
    const top = 205 - t.h + Math.round((t.broken ?? 0) * t.h * 0.4);
    return { x: t.x + Math.round(t.w / 2), top, w: t.w };
  });
}

/** Cables del teleférico en la capa 2 (reforma y, a lo lejos, avenidas). */
export function cdmxTeleCables(section: CdmxSection, width: number): CdmxTele[] {
  if (section === 'xochimilco') return [];
  const out: CdmxTele[] = [];
  const towers = section === 'reforma' ? [0.08, 0.36, 0.64, 0.92] : [0.2, 0.6, 1.0];
  for (let i = 0; i + 1 < towers.length; i++) {
    const x0 = Math.round(width * towers[i]) + 2, x1 = Math.round(width * towers[i + 1]) + 2;
    const y0 = section === 'reforma' ? 70 - i * 14 : 104 - i * 10, y1 = y0 - 14;
    out.push({ x0, y0, x1, y1 });
    out.push({ x0, y0: y0 + 6, x1, y1: y1 + 6 }); // cable de regreso
  }
  return out;
}

function teleTorres(g: Lienzo, section: CdmxSection, w: number): void {
  const cables2 = cdmxTeleCables(section, w);
  // Torres de celosía donde se apoyan los cables.
  const xs = new Map<number, number>();
  for (const c of cables2) { xs.set(c.x0, Math.min(xs.get(c.x0) ?? 999, c.y0)); xs.set(c.x1, Math.min(xs.get(c.x1) ?? 999, c.y1)); }
  for (const [x, top] of xs) {
    for (let y = top; y < 205; y++) {
      const half = 2 + Math.round((y - top) * 0.06);
      g.set(C.st1, x - half, y); g.set(C.st1, x + half, y);
      if ((y - top) % 8 === 0) g.line(C.st1, x - half, y, x + half + 1, y + 8);
    }
    g.rect(C.st2, x - 5, top - 1, 11, 2); g.set(C.rd1, x, top - 2); light(x, top - 2, 'farol');
  }
  for (const c of cables2) g.line(C.st1, c.x0, c.y0, c.x1, c.y1);
}

function midXochimilco(g: Lienzo, w: number): void {
  // Hilera de ahuejotes de las chinampas, con bruma entre ellos.
  for (let x = 0; x < w; x++) { const y = 200 + Math.round(noise1(x * 0.03, 20) * 3); g.rect(C.fo0, x, y, 1, 210 - y); }
  for (let k = 0, x = -10; x < w; k++) {
    ahuejote(g, x, 202, 46 + hash(k, 1, 21) * 40, 9 + hash(k, 2, 21) * 6, C.fo0, C.fo1, null, k);
    x += 10 + Math.round(hash(k, 3, 21) * 26);
  }
  // Trajineras abandonadas en el canal lejano y velas sobre el agua estancada.
  for (let k = 0; k < w / 260; k++) trajineraFondo(g, Math.round(hash(k, 4, 21) * w), 206, k, 0);
  bruma(g, w, 150, 212, C.fog0, 0.85, 22);
  for (let k = 0; k < w / 120; k++) { const x = hash(k, 5, 21) * w; g.set(C.wa2, x, 204); g.set(C.wa3, x, 203); light(x, 203, 'vela'); }
}

function midAvenidas(g: Lienzo, w: number): void {
  teleTorres(g, 'avenidas', w);
  for (const t of towersMid('avenidas', w)) torre(g, t.x, 208, t.w, t.h, t);
  // Edificios bajos con anuncios espectaculares apagados.
  for (let n = 0, x = 0; x < w; n++) {
    const bw = 30 + Math.round(hash(n, 1, 31) * 40), bh = 26 + Math.round(hash(n, 2, 31) * 30);
    torre(g, x, 210, bw, bh, { body: C.st1, dark: C.st0, hi: C.st2, win: 0.16, style: 'deco', seed: n + 300, broken: hash(n, 3, 31) > 0.6 ? 0.3 : 0 });
    if (n % 3 === 1) {
      const sx = x + 4, sy = 210 - bh - 22;
      g.rect(C.st0, sx + 6, sy + 14, 2, 10); g.rect(C.ink, sx, sy, bw - 8, 14); g.rect(C.pu0, sx + 1, sy + 1, bw - 10, 12);
      for (let k = 0; k < bw - 10; k++) if (hash(k, n, 32) > 0.7) g.set(C.ro0, sx + 1 + k, sy + 1 + hash(k, n, 33) * 12);
    }
    x += bw + Math.round(hash(n, 4, 31) * 6);
  }
  for (let k = 0; k < 5; k++) humo(g, hash(k, 1, 34) * w, 206, 90, k, C.te0, C.pu0);
  dust(g, 0, w, 175, 212, C.ro0, 0.3, 35);
}

function midReforma(g: Lienzo, w: number): void {
  // Pirámide más cercana detrás del Ángel, flanqueada por torres derrumbadas.
  piramide(g, atWorld(1450, 0.4), 210, 230, 104, 5, C.st1, C.st0, C.st2, true);
  teleTorres(g, 'reforma', w);
  for (const t of towersMid('reforma', w)) torre(g, t.x, 210, t.w, t.h, t);
  // Copas de ahuehuetes y fresnos del camellón de Reforma.
  for (let k = 0, x = 0; x < w; k++) {
    const r = 8 + hash(k, 1, 41) * 7;
    for (let j = 0; j < 3; j++) g.ellipse(j === 1 ? C.fo1 : C.fo0, x + j * r * 0.7, 202 - r - j % 2 * 3, r, r * 0.8);
    x += r * 2 + hash(k, 2, 41) * 20;
  }
  bruma(g, w, 160, 212, C.fo1, 0.6, 42);
}

/** Columna de humo tramado. */
function humo(g: Lienzo, x: number, base: number, rise: number, seed: number, c1: string, c2: string): void {
  for (let y = base; y > base - rise; y--) {
    const up = base - y, cx = x + up * 0.3 + Math.sin(y * 0.06 + seed) * (2 + up * 0.06), half = 2 + up * 0.1;
    for (let px = Math.floor(cx - half); px < cx + half; px++) {
      if (noise2(px * 0.2, y * 0.12, seed) > 0.4) g.veil(up < rise * 0.3 ? c1 : c2, px, y, 0.5 * (1 - up / rise));
    }
  }
  g.rect(C.wa1, x - 1, base - 1, 3, 1); g.set(C.wa3, x, base - 2);
}

/* ======================= CAPA 3: LO CERCANO ======================= */

/** Letrero de neón (lo hace parpadear el decorado). */
function neon(g: Lienzo, x: number, y: number, text: string, color: string, broken: boolean): void {
  const w = text.length * 4 + 5, h = 9;
  g.rect(C.ink, x - 1, y - 1, w + 2, h + 2); g.rect(C.st0, x, y, w, h);
  miniText(g, color, text, x + 3, y + 2);
  if (broken) for (let k = 0; k < text.length; k++) if (hash(k, x, 7) > 0.65) g.rect(C.st1, x + 3 + k * 4, y + 2, 3, 5);
  neons?.push({ x: Math.round(x), y: Math.round(y), w, h, color, broken });
}

/** Ofrenda de zaguán (pintada): mesa con mantel, cempasúchil, calaveritas y velas. */
function ofrendaZaguan(g: Lienzo, x: number, base: number, seed: number): void {
  g.rect(C.sh0, x, base - 10, 26, 2); g.rect(C.ro1, x, base - 8, 26, 3); for (let k = 0; k < 26; k += 3) g.set(C.ro2, x + k, base - 6);
  g.rect(C.ea1, x + 2, base - 5, 2, 5); g.rect(C.ea1, x + 22, base - 5, 2, 5);
  g.rect(C.ea2, x + 6, base - 18, 14, 8); g.rect(C.st3, x + 8, base - 16, 10, 5); // retrato
  calaverita(g, x + 1, base - 17); calaverita(g, x + 19, base - 17, C.tq2, C.wa2);
  cempasuchilMata(g, x - 2, base - 10, 10, seed); cempasuchilMata(g, x + 18, base - 10, 10, seed + 1);
  for (let k = 0; k < 4; k++) { const vx = x + 4 + k * 6; g.rect(C.sh1, vx, base - 14, 2, 4); g.set(C.wa3, vx, base - 15); g.set(C.wa2, vx + 1, base - 16); }
  light(x + 13, base - 14, 'vela');
}

/** Cortina metálica de local (bajada, con grafiti y abolladuras). */
function cortina(g: Lienzo, x: number, y: number, w: number, h: number, seed: number, open = 0): void {
  for (let py = 0; py < h - open; py++) for (let px = 0; px < w; px++) g.set(py % 3 === 0 ? C.st1 : (px + py) % 9 === 0 ? C.st2 : C.st2, x + px, y + py);
  for (let py = h - open; py < h; py++) g.rect(C.ink, x, y + py, w, 1);
  g.rect(C.st3, x, y, w, 1);
  // Grafiti: trazos de colores propios (no copia firmas reales).
  const c = [C.ro1, C.tq1, C.pu1, C.wa1][seed % 4];
  for (let k = 0; k < w * 0.8; k++) { const px = x + 3 + k * 0.9, py = y + h * 0.45 + Math.sin(k * 0.5 + seed) * 4; if (py < y + h - open) g.set(c, px, py); }
  if (hash(seed, 1) > 0.5) miniText(g, C.wa2, 'SE RENTA', x + 3, y + 4);
  for (let k = 0; k < 4; k++) g.ellipse(C.st1, x + hash(k, 2, seed) * w, y + hash(k, 3, seed) * (h - open), 2, 1);
}

interface EdificioOpts { story: number; style: 'deco' | 'retro' | 'colonial'; dmg: number; sign?: string; neonColor?: string; shop?: boolean; ofrenda?: boolean; papel?: boolean }

/** Edificio art déco o retrofuturista de la avenida (capa 3). */
function edificio(g: Lienzo, x: number, w: number, h: number, n: number, o: EdificioOpts): void {
  const ground = 214, top = ground - h;
  const ramps: Array<[string, string, string]> = o.style === 'retro'
    ? [[C.tq0, C.ink, C.tq1], [C.st2, C.st1, C.st3], [C.mtn0, C.night, C.mtn1]]
    : [[C.te1, C.te0, C.te2], [C.st3, C.st2, C.st4], [C.ea2, C.ea1, C.ea3], [C.ro0, C.pu0, C.ro1]];
  const [wall, shade, hi] = ramps[n % ramps.length];
  g.rect(C.ink, x - 1, top - 1, w + 2, h + 1);
  concreto(g, x, top, w, h, wall, shade, hi, n + 400);
  for (let y = top; y < ground; y++) for (let px = 0; px < 14; px++) g.veil(shade, x + w - 14 + px, y, px / 14 + 0.1);
  g.rect(hi, x, top, 2, h);
  // Penumbra nocturna.
  for (let y = top; y < ground; y++) for (let px = x; px < x + w; px++) g.veil(C.ink, px, y, 0.25 + (y - top) / h * 0.15);
  if (o.style === 'deco') {
    // Remate escalonado (zigurat) con aguja, pilastras y friso geométrico.
    for (let s = 0; s < 3; s++) { const inset = 6 + s * 7; g.rect(wall, x + inset, top - 6 - s * 6, w - inset * 2, 6); g.rect(hi, x + inset, top - 6 - s * 6, w - inset * 2, 1); }
    g.rect(hi, x + w / 2 - 1, top - 30, 2, 12);
    for (let px = x + 8; px < x + w - 6; px += 12) { g.rect(hi, px, top + 4, 2, h - 30); g.rect(shade, px + 2, top + 4, 1, h - 30); }
    frisoGreca(g, x + 4, top + 2, w - 8, shade, 'escalon');
  } else if (o.style === 'retro') {
    // Esquina redondeada, bandas horizontales (streamline) y ojos de buey, antena con anillo.
    for (let y = 0; y < 14; y++) g.erase(x + w - 1 - Math.round(14 - Math.sqrt(196 - (14 - y) ** 2)), top + y, 20, 1);
    for (let y = top + 10; y < ground - 30; y += 12) { g.rect(hi, x, y, w, 2); g.rect(C.ink, x, y + 2, w, 1); }
    g.rect(C.st1, x + 10, top - 26, 2, 26); g.ellipse(C.st2, x + 11, top - 26, 6, 2); g.ellipse(C.ink, x + 11, top - 26, 4, 1);
    light(x + 11, top - 28, 'farol');
  } else {
    g.rect(C.fog0, x - 2, top - 5, w + 4, 5); g.rect(C.fog1, x - 2, top - 5, w + 4, 1);
  }
  // Ventanas por piso.
  const floors = Math.max(1, Math.floor((h - 36) / o.story));
  for (let f = 0; f < floors; f++) {
    const wy = top + 10 + f * o.story;
    for (let wx = x + 6; wx < x + w - 10; wx += o.style === 'retro' ? 12 : 10) {
      if (o.style === 'retro') { g.ellipse(C.ink, wx + 3, wy + 4, 3, 3); g.ellipse(hash(wx, wy, n) > 0.75 ? C.wa1 : C.night, wx + 3, wy + 4, 2, 2); }
      else { g.rect(C.ink, wx - 1, wy - 1, 7, o.story - 4); ventanal(g, wx, wy, 5, o.story - 6, n, 0.22, C.st3); }
      if (hash(wx, wy, n + 1) > 0.78 && o.style !== 'retro') { light(wx + 2, wy + 4, 'ventana'); }
    }
  }
  // Planta baja: local con cortina metálica o zaguán.
  if (o.shop) {
    cortina(g, x + 6, ground - 30, Math.min(48, w - 30), 30, n, hash(n, 9) > 0.6 ? 10 : 0);
    if (o.sign) neon(g, x + 6, ground - 44, o.sign, o.neonColor ?? NEON[n % NEON.length], hash(n, 5) > 0.5);
  }
  if (o.ofrenda) {
    const zx = x + w - 40;
    g.rect(C.ink, zx, ground - 34, 30, 34); g.rect(C.wa0, zx + 2, ground - 32, 26, 6);
    ofrendaZaguan(g, zx + 2, ground, n);
  }
  // Daño: esquina derrumbada con varilla, grietas.
  if (o.dmg > 0.2) {
    const left = n % 2 === 0, cw = Math.round(w * (0.2 + o.dmg * 0.3)), ch = Math.round(h * (0.15 + o.dmg * 0.4));
    const cx0 = left ? x - 2 : x + w - cw + 2;
    for (let k = 0; k < cw + 2; k++) {
      // Borde mellado en escalones (losas que se desprendieron por piso), no una rampa recta.
      const t = left ? 1 - k / cw : k / cw;
      const depth = Math.round(Math.max(0, t) ** 0.8 * ch + noise1(k * 0.6, n) * 6 + (hash(Math.floor(k / 5), 2, n) - 0.4) * 14 * t);
      if (depth <= 0) continue;
      g.erase(cx0 + k, top - 40, 1, depth + 40);
      g.set(C.st4, cx0 + k, top + depth);
      if (k % 4 === 0) g.line(C.te2, cx0 + k, top + depth, cx0 + k + (left ? -2 : 2), top + depth - 5); // varilla oxidada
    }
    for (let c = 0; c < 3; c++) grieta(g, left ? x + cw * 0.6 : x + w - cw * 0.6, top + ch * 0.6 + c * 10, 30 * o.dmg, C.ink, n + c, left ? 0.6 : -0.6);
  }
  if (o.papel) cables?.push({ x0: Math.round(x + 4), x1: Math.round(x + w - 4), y: top + 20, sag: 6 });
}

/** Puesto de periódicos de la cronista: techito de lámina, revistas viejas, foco. */
function puestoPeriodicos(g: Lienzo, x: number): void {
  const base = 214;
  g.rect(C.fo1, x, base - 34, 40, 34); g.rect(C.fo2, x, base - 34, 40, 2);
  for (let k = -3; k < 44; k++) g.rect(C.st2, x + k, base - 42 + Math.round(k * 0.08), 1, 4);
  for (let k = 0; k < 5; k++) for (let r = 0; r < 2; r++) g.rect([C.sh1, C.wa3, C.ro1, C.tq1, C.sh0][(k + r) % 5], x + 3 + k * 7, base - 30 + r * 10, 6, 8);
  miniText(g, C.wa3, 'DIARIO', x + 8, base - 40);
  g.rect(C.wa2, x + 19, base - 37, 2, 2); light(x + 20, base - 36, 'farol');
}

function nearXochimilco(g: Lienzo, w: number): void {
  const L = CDMX_LANDMARKS.xochimilco, at = (X: number) => atWorld(X, 0.65);
  const e0 = at(L.embarcadero.x0), e1 = at(L.embarcadero.x1), i0 = at(L.islaMunecas.x0), i1 = at(L.islaMunecas.x1);
  // Bordo de la chinampa (tierra y tule) a todo lo ancho.
  for (let x = 0; x < w; x++) {
    const y = 200 + Math.round(noise1(x * 0.04, 50) * 5);
    g.rect(C.ea0, x, y, 1, 214 - y); if (hash(x, 1, 50) > 0.5) g.rect(C.fo1, x, y - 2, 1, 3);
    if (hash(x, 2, 50) > 0.93) g.line(C.fo2, x, y, x + (hash(x, 3, 50) - 0.5) * 4, y - 8 - hash(x, 4, 50) * 6);
  }
  // Ahuejotes cercanos.
  for (let k = 0, x = 20; x < w; k++) {
    const inIsla = x > i0 - 40 && x < i1 + 40;
    if (!inIsla && !(x > e0 - 20 && x < e1 + 20)) ahuejote(g, x, 206, 110 + hash(k, 1, 51) * 70, 14 + hash(k, 2, 51) * 8, C.fo0, C.fo1, C.fo2, k + 10);
    x += 60 + Math.round(hash(k, 3, 51) * 90);
  }
  // Embarcadero: arcos de madera pintados con el nombre y faroles.
  for (let x = e0; x < e1; x += 2) g.rect(C.ea1, x, 204, 2, 4);
  g.rect(C.ea3, e0, 204, e1 - e0, 1);
  for (let ax = e0 + 20, k = 0; ax < e1 - 40; ax += 110, k++) {
    g.rect(C.ea0, ax, 140, 4, 66); g.rect(C.ea0, ax + 60, 140, 4, 66);
    for (let j = 0; j < 64; j++) { const yy = 136 - Math.round(Math.sin(j / 63 * Math.PI) * 8); g.rect([C.ro1, C.tq1, C.wa1][k % 3], ax + j, yy, 1, 10); g.set(C.wa3, ax + j, yy); }
    miniText(g, C.sh1, k === 0 ? 'EMBARCADERO' : 'CUEMANCO', ax + 6, 139);
    g.rect(C.ink, ax + 1, 152, 2, 6); g.rect(C.wa2, ax, 158, 4, 4); light(ax + 2, 160, 'farol');
  }
  papelEstatico(g, e0, e1, 118, 10, 3, 6);
  cables?.push({ x0: e0 + 30, x1: e1 - 30, y: 104, sag: 10 });
  // Trajineras varadas en el canal seco, inclinadas.
  for (const [X, n, tilt] of [[e0 + 40, 0, 0.04], [e0 + 190, 1, -0.05], [at(900), 2, 0.07], [at(2250), 3, -0.03], [at(2550), 4, 0.05]] as const) trajineraFondo(g, X, 216, n, tilt, 1.7);
  // Isla de las Muñecas: árboles secos con muñecas, casita, velas y cempasúchil marchito.
  for (let k = 0, x = i0; x < i1; k++) {
    arbolMunecas(g, x, 210, 90 + hash(k, 1, 52) * 50, k + 3, k % 2 ? C.st1 : C.ea0, C.st2, k);
    x += 48 + Math.round(hash(k, 2, 52) * 40);
  }
  casitaIsla(g, Math.round((i0 + i1) / 2) - 35, 210);
  for (let k = 0; k < 8; k++) { const vx = i0 + hash(k, 3, 52) * (i1 - i0); g.rect(C.sh1, vx, 206, 2, 4); g.set(C.wa3, vx, 205); light(vx, 205, 'vela'); }
  // Brasero y estela de luz donde se aprende FUEGO.
  const fx = at(L.ofrendaFuego.x);
  g.rect(C.st1, fx - 6, 196, 12, 10); g.rect(C.st2, fx - 8, 194, 16, 3); g.rect(C.wa1, fx - 5, 189, 10, 5); g.rect(C.wa2, fx - 3, 186, 6, 4); g.set(C.wa4, fx, 185);
  light(fx, 188, 'fuego');
  halo(g, fx, 190, 60, 40, C.wa0, 0.4);
}

function nearAvenidas(g: Lienzo, w: number): void {
  const L = CDMX_LANDMARKS.avenidas, at = (X: number) => atWorld(X, 0.65);
  const ofr = at(L.ofrenda.x), cro = at(L.cronista.x), ck = at(L.checkpoint.x);
  const signs = ['HOTEL', 'TACOS', 'CINE', 'FARMACIA', 'BAR', 'PAN', 'SALON', 'METRO'];
  let x = -10;
  for (let n = 0; x < w; n++) {
    if (Math.abs(x - cro) < 30) { puestoPeriodicos(g, x + 10); x += 64; continue; }
    if (Math.abs(x - ck) < 60 && n > 2) {
      // Hueco de un edificio caído: se ve la ciudad media; escombro y una estructura de acero.
      for (let k = 0; k < 120; k++) { const hgt = Math.round(10 + noise1(k * 0.08, n) * 24 * Math.sin(k / 120 * Math.PI)); concreto(g, x + k, 214 - hgt, 1, hgt, C.st2, C.st1, C.st3, n); }
      for (const px of [20, 70]) { g.rect(C.st1, x + px, 120, 3, 94); g.rect(C.te1, x + px, 120, 1, 94); }
      g.line(C.st1, x + 20, 140, x + 73, 170, 2); g.line(C.st1, x + 73, 130, x + 20, 180, 2);
      x += 130; continue;
    }
    const isOfr = x < ofr && x + 150 > ofr && n > 3;
    // Calles laterales: huecos por donde se ven las torres colosales del fondo.
    if (!isOfr && n % 4 === 2) { x += 56 + Math.round(hash(n, 6, 61) * 30); continue; }
    const style = (['deco', 'retro', 'deco', 'colonial'] as const)[n % 4];
    const bw = isOfr ? 170 : 96 + Math.round(hash(n, 1, 61) * 60), bh = isOfr ? 108 : 70 + Math.round(hash(n, 2, 61) * 64);
    edificio(g, x, bw, bh, n, { story: 16, style: isOfr ? 'deco' : style, dmg: isOfr ? 0.15 : hash(n, 3, 61), shop: !isOfr, sign: signs[n % signs.length], ofrenda: isOfr || hash(n, 4, 61) > 0.7 });
    if (isOfr) {
      // Arco de cempasúchil sobre el zaguán de la ofrenda grande.
      const ax = x + bw - 44;
      for (let k = 0; k < 40; k++) { const yy = 214 - 40 - Math.round(Math.sin(k / 39 * Math.PI) * 14); cempasuchilMata(g, ax + k - 2, yy + 3, 4, k); }
      halo(g, ax + 18, 196, 60, 30, C.wa1, 0.45);
      light(ax + 18, 196, 'vela');
    }
    x += bw + (hash(n, 5, 61) > 0.7 ? 6 : 0);
  }
  // Papel picado cruzando la avenida: la mitad de los tramos lleva papel pintado y la otra mitad
  // solo la cuerda, donde el decorado cuelga papel animado.
  for (let x0 = 40, k = 0; x0 < w - 200; x0 += 260, k++) {
    const y = Math.round(70 + hash(x0, 1) * 18);
    if (k % 2) papelEstatico(g, x0, x0 + 180, y, 9, x0, 6);
    else { for (let x = x0; x <= x0 + 180; x++) g.set(C.ink, x, y + Math.sin((x - x0) / 180 * Math.PI) * 9); cables?.push({ x0, x1: x0 + 180, y, sag: 9 }); }
  }
  // Postes de alumbrado retrofuturistas con foco apagado o parpadeante.
  for (let px = 90; px < w; px += 300) {
    g.rect(C.st1, px, 120, 3, 94); g.rect(C.st2, px, 120, 1, 94); g.rect(C.st1, px - 12, 118, 18, 3); g.ellipse(C.st2, px - 12, 122, 4, 2);
    if (hash(px, 3) > 0.4) { g.rect(C.tq2, px - 15, 123, 7, 1); light(px - 12, 124, 'neon'); }
  }
}

/** Pedestal roto del Ángel: basamento escalonado, columna partida, coronas y figuras en sombra. */
function pedestalAngel(g: Lienzo, cx: number): void {
  const base = 214;
  // Basamento circular escalonado (en perspectiva).
  for (let s = 0; s < 4; s++) { const hw = 90 - s * 16, y = base - s * 7; g.rect(C.st2, cx - hw, y - 7, hw * 2, 7); g.rect(C.st4, cx - hw, y - 7, hw * 2, 1); g.rect(C.st1, cx + hw - 12, y - 6, 12, 6); }
  // Grupo escultórico en sombra en las esquinas (figuras sedentes de bronce, silueta genérica).
  for (const side of [-1, 1]) {
    const sx = cx + side * 54;
    g.ellipse(C.ink, sx, base - 36, 8, 10); g.ellipse(C.ink, sx, base - 50, 4, 5); g.rect(C.st0, sx - 10, base - 28, 20, 4);
    g.set(C.tq0, sx - 2, base - 48); // pátina
  }
  // Fuste partido: la columna se cortó a media altura (la parte superior está en el suelo como prop).
  const ch = 120;
  for (let y = base - 28 - ch; y < base - 28; y++) {
    const half = 11 - Math.round((base - 28 - y) / ch * 2);
    g.rect(C.st3, cx - half, y, half * 2, 1); g.rect(C.st4, cx - half, y, 3, 1); g.rect(C.st2, cx + half - 4, y, 4, 1);
    if ((y - base) % 26 === 0) g.rect(C.wa1, cx - half - 1, y, half * 2 + 2, 2); // anillos dorados
  }
  for (let k = -12; k < 12; k++) g.erase(cx + k, base - 28 - ch - 10, 1, 10 + Math.round(Math.abs(Math.sin(k * 0.9)) * 7 + (k + 12) * 0.4));
  for (let k = -12; k < 12; k++) { const yy = base - 28 - ch + Math.round(Math.abs(Math.sin(k * 0.9)) * 7 + (k + 12) * 0.4); g.set(C.st5, cx + k, yy); }
  g.rect(C.st2, cx - 18, base - 36, 36, 8); g.rect(C.st4, cx - 18, base - 36, 36, 1);
  miniText(g, C.wa1, 'LA NACION', cx - 17, base - 34);
  grieta(g, cx - 6, base - 28 - ch + 10, 60, C.ink, 4, 0.2);
  // Ofrendas y veladoras al pie del monumento.
  for (let k = 0; k < 7; k++) { const vx = cx - 70 + k * 22; g.rect(C.sh1, vx, base - 5, 2, 4); g.set(C.wa3, vx, base - 6); cempasuchilMata(g, vx + 3, base - 1, 8, k); }
  light(cx, base - 8, 'vela');
  halo(g, cx, base - 10, 100, 30, C.wa0, 0.35);
}

/** Estación base del teleférico (fachada retrofuturista con arco y cables que suben). */
function estacion(g: Lienzo, cx: number): void {
  const base = 214, w = 200, h = 120, x = cx - w / 2, top = base - h;
  concreto(g, x, top, w, h, C.st2, C.st1, C.st3, 77);
  g.rect(C.ink, x - 1, top - 1, w + 2, 1);
  // Gran arco de vidrio roto con luz cálida adentro.
  for (let y = 0; y < 80; y++) {
    const half = y < 40 ? Math.round(Math.sqrt(40 * 40 - (40 - y) ** 2) * 1.4) : 56;
    g.rect(C.st4, cx - half - 3, top + 30 + y, half * 2 + 6, 1);
    for (let px = -half; px < half; px++) g.set((px + 200) % 10 === 0 || y % 14 === 0 ? C.st1 : hash(px, y, 5) > 0.85 ? C.ink : y > 50 ? C.wa0 : C.tq0, cx + px, top + 30 + y);
  }
  light(cx, top + 90, 'ventana'); light(cx - 30, top + 96, 'ventana'); light(cx + 30, top + 96, 'ventana');
  // Volado del techo y torre de cables con poleas.
  g.rect(C.st3, x - 10, top - 8, w + 20, 8); g.rect(C.st5, x - 10, top - 8, w + 20, 1);
  for (let k = 0; k < w + 20; k += 16) g.rect(C.st1, x - 10 + k, top, 2, 4);
  g.rect(C.st1, cx + 50, top - 70, 8, 62); g.rect(C.st3, cx + 50, top - 70, 2, 62);
  g.ellipse(C.st2, cx + 54, top - 72, 12, 4); g.ellipse(C.ink, cx + 54, top - 72, 8, 2);
  g.line(C.st1, cx + 54, top - 74, cx + 240, top - 160); g.line(C.st1, cx + 54, top - 70, cx + 240, top - 154);
  // Letrero (y un neón turquesa que aún late).
  g.rect(C.ink, cx - 46, top + 8, 92, 14); g.rect(C.st0, cx - 45, top + 9, 90, 12);
  miniText(g, C.tq2, 'TELEFERICO', cx - 20, top + 13);
  neons?.push({ x: cx - 45, y: top + 9, w: 90, h: 12, color: C.tq2, broken: false });
  // Boquetes y varilla.
  for (const [hx, hy] of [[x + 14, top + 20], [x + w - 30, top + 40]] as const) { g.ellipse(C.ink, hx, hy, 9, 7); for (let k = 0; k < 5; k++) g.line(C.te2, hx - 6 + k * 3, hy - 6, hx - 5 + k * 3, hy + 4); }
}

/** Edificio de oficinas bajo de vidrio de Reforma, roto. */
function oficinas(g: Lienzo, x: number, w: number, h: number, n: number): void {
  torre(g, x, 214, w, h, { body: C.dusk, dark: C.night, hi: C.mtn1, win: 0.1, style: n % 3 === 1 ? 'deco' : 'vidrio', seed: n + 600, broken: 0.25 + hash(n, 1, 70) * 0.3, holes: 0.8 });
  // Lobby con vidrios rotos y luz de velas.
  g.rect(C.ink, x + 6, 190, w - 12, 24); for (let k = 0; k < w - 12; k += 8) g.rect(C.st1, x + 6 + k, 190, 1, 24);
  if (hash(n, 2, 70) > 0.5) { g.rect(C.wa0, x + 10, 204, 10, 10); light(x + 15, 206, 'vela'); }
}

function nearReforma(g: Lienzo, w: number): void {
  const L = CDMX_LANDMARKS.reforma, at = (X: number) => atWorld(X, 0.65);
  const ang = at(L.angel.x), est = at(L.estacion.x);
  // Oficinas y hoteles a los lados de la avenida.
  for (let n = 0, x = -10; x < w; n++) {
    if (Math.abs(x + 60 - ang) < 160 || x + 100 > est - 140) { x += 50; continue; }
    const bw = 90 + Math.round(hash(n, 1, 71) * 60), bh = 110 + Math.round(hash(n, 2, 71) * 70);
    oficinas(g, x, bw, bh, n);
    if (n % 3 === 0) neon(g, x + 10, 214 - 46, ['HOTEL', 'BANCO', 'CAFE'][(n / 3) % 3], NEON[n % 4], true);
    x += bw + 20 + Math.round(hash(n, 3, 71) * 40);
  }
  // Árboles del camellón (siluetas grandes) entre edificios.
  for (let k = 0, x = 40; x < w; k++) {
    if (Math.abs(x - ang) > 130 && x < est - 150) for (let j = 0; j < 4; j++) g.ellipse(j % 2 ? C.fo1 : C.fo0, x + (j - 1.5) * 10, 170 - j % 2 * 8, 16, 12);
    if (Math.abs(x - ang) > 130 && x < est - 150) g.rect(C.ea0, x - 1, 176, 3, 38);
    x += 140 + Math.round(hash(k, 1, 72) * 80);
  }
  pedestalAngel(g, ang);
  estacion(g, est);
  // Cables eléctricos caídos.
  for (let x0 = 100; x0 < w - 300; x0 += 420) for (let dx = 0; dx < 260; dx++) g.set(C.ink, x0 + dx, 90 + Math.sin(dx / 260 * Math.PI) * 30 + dx * 0.1);
}

/* ================================ DESPACHO ================================ */

/** Luces, cables de papel picado y neones de la capa 3 (para el decorado animado). */
export function cdmxLayerFeatures(section: CdmxSection, width: number): { lights: CdmxLight[]; cables: CdmxCable[]; neons: CdmxNeon[] } {
  lights = []; cables = []; neons = [];
  drawCdmxLayer(section, 3, width);
  const out = { lights, cables, neons };
  lights = null; cables = null; neons = null;
  return out;
}

/** Dibuja una capa completa (0–5) de una sección en un lienzo nuevo de width × 360. */
export function drawCdmxLayer(section: CdmxSection, index: number, width: number, height = 360): Lienzo {
  const g = new Lienzo(width, height);
  const table: Record<CdmxSection, Array<(g: Lienzo, w: number) => void>> = {
    xochimilco: [skyXochimilco, farXochimilco, midXochimilco, nearXochimilco],
    avenidas: [skyAvenidas, farAvenidas, midAvenidas, nearAvenidas],
    reforma: [skyReforma, farReforma, midReforma, nearReforma],
  };
  if (index < 4) table[section][index](g, width);
  else if (index === 4) drawCdmxGround(g, section, width);
  else drawCdmxForeground(g, section, width);
  return g;
}
