/**
 * Paisaje del Nivel 4 (capas 0–3) para las tres secciones de Oaxaca: atardecer apagado sobre la
 * Sierra, calles de casas coloniales de colores semidestruidas, callejones con el mercado arruinado y
 * las ruinas fortificadas del Templo de Santo Domingo (cantera verde) con su interior dorado.
 * Sin Phaser ni DOM (lo usa también tools/gen-oaxaca-scenery.mjs).
 */
import { C, Lienzo, MUROS, adobe, bayer, dust, frisoGreca, hash, miniText, noise1, noise2, ramp, tejido } from './OaxacaPixels';
import { drawOaxacaForeground, drawOaxacaGround } from './OaxacaTerrain';

export type OaxacaSection = 'oaxaca' | 'callejones' | 'santo_domingo';
export const OAXACA_BG_PREFIX: Record<OaxacaSection, string> = {
  oaxaca: 'fondo_oaxaca', callejones: 'fondo_callejones', santo_domingo: 'fondo_santo_domingo',
};
export const OAXACA_SECTION_WIDTH: Record<OaxacaSection, number> = { oaxaca: 3000, callejones: 3000, santo_domingo: 2400 };

/**
 * Posición x en una capa de factor `f` del rasgo que debe verse detrás de un punto x del mundo
 * cuando el jugador está ahí (cámara centrada). Así el taller, el mercado y el templo coinciden con
 * la ruta del suelo.
 */
export const atWorld = (x: number, f: number): number => Math.round(320 + (x - 320) * f);

/** Puntos de referencia del mundo (x del suelo) que el contenido puede usar. */
export const OAXACA_LANDMARKS = {
  /** Plaza de las letras al inicio de `oaxaca` (losas grandes en el suelo). */
  plazaLetras: { x0: 140, x1: 470 },
  /** Fachada del taller de los artesanos en `oaxaca` (capa 3) y su zaguán. */
  taller: { x: 1500 },
  /** Mercado arruinado en `callejones`. */
  mercado: { x0: 1000, x1: 1900 },
  /** Fachada del templo y puerta del interior en `santo_domingo`. */
  templo: { x: 900, interior: 1650 },
  /** Centro del círculo de fuego fatuo de la arena (suelo de `santo_domingo`). */
  arena: { x: 2030, y: 286 },
} as const;

/** Luz pintada en la capa 3 (coordenadas de esa capa); el decorado le pone halo animado. */
export interface OaxacaLight { x: number; y: number; kind: 'farol' | 'ventana' | 'vela' | 'fatuo' | 'fuego' | 'oro'; }
/** Cable para papel picado (capa 3); el decorado cuelga papel animado. */
export interface OaxacaCable { x0: number; x1: number; y: number; sag: number; }
let lights: OaxacaLight[] | null = null;
let cables: OaxacaCable[] | null = null;
const light = (x: number, y: number, kind: OaxacaLight['kind']): void => { lights?.push({ x: Math.round(x), y: Math.round(y), kind }); };

/* ============================== CAPA 0: CIELO ============================== */

function stars(g: Lienzo, w: number, count: number, maxY: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(i, 1, seed) * w), y = Math.floor(hash(i, 2, seed) ** 1.7 * maxY), b = hash(i, 3, seed);
    g.set(b > 0.94 ? C.wa4 : b > 0.7 ? C.sh0 : C.mtn1, x, y);
    if (b > 0.988) { g.set(C.sh0, x - 1, y); g.set(C.sh0, x + 1, y); g.set(C.sh0, x, y - 1); g.set(C.sh0, x, y + 1); }
  }
}

/** Nube alargada de atardecer: cuerpo oscuro con borde inferior encendido por el sol bajo. */
function streak(g: Lienzo, x: number, y: number, span: number, body: string, mid: string, rim: string, seed: number): void {
  for (let dx = 0; dx < span; dx++) {
    const t = dx / span, env = Math.sin(t * Math.PI) ** 0.7;
    const th = 1 + env * (3 + noise1(dx * 0.07, seed) * 4);
    const top = y - th + noise1(dx * 0.03, seed + 3) * 3;
    for (let py = Math.floor(top); py <= y + 1; py++) {
      if (hash(dx, py, seed) > 0.35 + env * 0.65) continue;
      g.set(py >= y ? rim : py >= y - 1 ? mid : body, x + dx, py);
    }
  }
}

function skyOaxaca(g: Lienzo, w: number): void {
  ramp(g, [C.ink, C.pu0, C.ro0, C.te0, C.te1, C.wa0], 0, 200, w);
  stars(g, w, w * 0.18, 70, 4);
  // Sol hundido detrás de la Sierra: disco tibio con halo tramado.
  const sx = Math.round(w * 0.62), sy = 176, r = 20;
  for (let y = sy - r * 4; y < sy + r; y++) for (let x = sx - r * 4; x < sx + r * 4; x++) {
    const d = Math.hypot(x - sx, (y - sy) * 1.3);
    if (d <= r) g.set(d > r - 2 ? C.wa1 : bayer(x, y) < (r - d) / r ? C.wa3 : C.wa2, x, y);
    else if (d < r * 4) g.veil(d < r * 1.8 ? C.wa1 : C.te1, x, y, ((1 - (d - r) / (r * 3)) ** 2) * 0.6);
  }
  // Rayos de luz partidos por las nubes.
  for (let n = 0; n < 14; n++) {
    const y = 120 + hash(n, 1, 6) * 60, x = hash(n, 2, 6) * w, span = 60 + hash(n, 3, 6) * 140;
    streak(g, x - 30, y, span, n % 3 ? C.ro0 : C.pu0, C.te0, Math.abs(x - sx) < 240 ? C.wa1 : C.te1, n);
  }
  for (let n = 0; n < 6; n++) streak(g, hash(n, 4, 7) * w, 40 + hash(n, 5, 7) * 50, 90 + hash(n, 6, 7) * 120, C.ink, C.pu0, C.ro0, n + 30);
}

function skyCallejones(g: Lienzo, w: number): void {
  // Ya entró la noche: añil profundo con el resplandor rojizo de los incendios en el horizonte.
  ramp(g, [C.ink, C.void, C.deep, C.night, C.pu0, C.ro0], 0, 210, w);
  stars(g, w, w * 0.4, 130, 12);
  // Luna menguante fina.
  const mx = Math.round(w * 0.3), my = 48, r = 10;
  for (let y = my - r; y <= my + r; y++) for (let x = mx - r; x <= mx + r; x++) {
    const d = Math.hypot(x - mx, y - my), d2 = Math.hypot(x - mx - 5, y - my + 2);
    if (d <= r && d2 > r - 1) g.set(d2 < r + 1 ? C.mtn2 : C.mtn3, x, y);
  }
  for (let y = my - 30; y < my + 30; y++) for (let x = mx - 30; x < mx + 30; x++) {
    const d = Math.hypot(x - mx, y - my);
    if (d > r + 1 && d < 30) g.veil(C.mtn0, x, y, (1 - d / 30) * 0.4);
  }
  for (let n = 0; n < 8; n++) streak(g, hash(n, 1, 13) * w, 70 + hash(n, 2, 13) * 110, 80 + hash(n, 3, 13) * 140, C.void, C.night, n % 2 ? C.pu0 : C.mtn0, n + 60);
}

function skySantoDomingo(g: Lienzo, w: number): void {
  // Noche cerrada con un resplandor verde-azul de fuego fatuo que sube del templo.
  ramp(g, [C.ink, C.void, C.deep, C.night, C.tq0, C.fo1], 0, 215, w);
  stars(g, w, w * 0.35, 120, 21);
  const cx = Math.round(w * 0.45);
  for (let y = 60; y < 215; y++) for (let x = 0; x < w; x++) {
    const d = Math.abs(x - cx) / (w * 0.4), k = Math.max(0, 1 - d) * ((y - 60) / 155);
    if (k > 0) g.veil(k > 0.55 ? C.tq1 : C.tq0, x, y, k * 0.45);
  }
  for (let n = 0; n < 6; n++) streak(g, hash(n, 1, 24) * w, 40 + hash(n, 2, 24) * 100, 100 + hash(n, 3, 24) * 120, C.void, C.deep, C.tq0, n + 90);
}

/* ============================ CAPA 1: LA SIERRA ============================ */

/** Cordillera: cresta con ruido en dos escalas, barrancas y bosque en motas. */
function ridge(g: Lienzo, w: number, top: number, amp: number, freq: number, seed: number, body: string, rim: string, tex: string | null, base = 215): void {
  for (let x = 0; x < w; x++) {
    const y = Math.round(top - noise1(x * freq, seed) * amp - noise1(x * freq * 4, seed + 1) * amp * 0.25);
    g.rect(body, x, y, 1, base - y);
    if (hash(x, 1, seed) > 0.3) g.set(rim, x, y);
    if (!tex) continue;
    // Barrancas: vetas diagonales y bosque punteado.
    for (let yy = y + 3; yy < base; yy += 2) {
      const n = noise2(x * 0.08, yy * 0.12, seed + 4);
      if (n > 0.68) g.set(tex, x, yy);
      else if (n < 0.2 && (x + yy) % 3 === 0) g.set(rim, x, yy);
    }
  }
}

function farOaxaca(g: Lienzo, w: number): void {
  // Sierra Norte en tres cordilleras verdes; la bruma del atardecer las separa.
  ridge(g, w, 128, 70, 0.006, 1, C.pu0, C.ro0, null);
  dust(g, 0, w, 90, 215, C.te0, 0.3, 2);
  ridge(g, w, 156, 48, 0.009, 2, C.fo1, C.te1, C.fo0);
  dust(g, 0, w, 140, 215, C.ro0, 0.22, 3);
  ridge(g, w, 182, 26, 0.014, 3, C.fo2, C.fo3, C.fo1);
  // Pueblitos en la ladera, ya casi sin luz.
  for (let k = 0; k < 18; k++) {
    const x = hash(k, 1, 8) * w, y = 196 + hash(k, 2, 8) * 10;
    g.rect(C.fo0, x, y, 3, 2);
    if (hash(k, 3, 8) > 0.6) g.set(C.wa1, x + 1, y);
  }
}

function farCallejones(g: Lienzo, w: number): void {
  ridge(g, w, 160, 46, 0.007, 5, C.deep, C.night, null);
  ridge(g, w, 182, 26, 0.011, 6, C.fo0, C.fo1, C.ink);
  dust(g, 0, w, 150, 215, C.pu0, 0.25, 6);
}

function farSantoDomingo(g: Lienzo, w: number): void {
  ridge(g, w, 155, 48, 0.006, 9, C.deep, C.tq0, null);
  ridge(g, w, 180, 28, 0.01, 10, C.fo0, C.fo1, C.ink);
  dust(g, 0, w, 150, 215, C.tq0, 0.3, 9);
}

/* ========================= CAPA 2: CIUDAD LEJANA ========================= */

/** Cúpula de azulejo con linternilla. */
function dome(g: Lienzo, x: number, base: number, r: number, body: string, tile: string, hi: string): void {
  g.rect(body, x - r, base - 4, r * 2 + 1, 4);
  for (let y = 0; y <= r; y++) {
    const half = Math.round(Math.sqrt(r * r - y * y));
    for (let px = -half; px <= half; px++) {
      const c = (px + 64) % 4 === 0 ? tile : px < -half * 0.3 ? hi : body;
      g.set(c, x + px, base - 4 - y);
    }
  }
  g.rect(body, x - 1, base - 6 - r, 3, 3); g.set(hi, x, base - 8 - r); g.rect(body, x, base - 11 - r, 1, 3);
}

/** Campanario simple de silueta con vanos (opcionalmente encendidos). */
function belfry(g: Lienzo, x: number, base: number, h: number, body: string, hi: string, lit: boolean): void {
  g.rect(body, x, base - h, 10, h); g.rect(hi, x, base - h, 1, h);
  g.rect(body, x + 1, base - h - 8, 8, 8); g.rect(C.ink, x + 3, base - h - 6, 4, 5);
  if (lit) { g.rect(C.wa1, x + 4, base - h - 5, 2, 3); }
  dome(g, x + 5, base - h - 8, 4, body, hi, hi);
}

function cityRow(g: Lienzo, w: number, base: number, seed: number, wall: string, roof: string, winLit: number, broken: number): void {
  for (let n = 0, x = 0; x < w; n++) {
    const bw = 12 + Math.floor(hash(n, 1, seed) * 22), bh = 8 + Math.floor(hash(n, 2, seed) * 16);
    const b = base - Math.round(noise1(x * 0.01, seed) * 8);
    g.rect(wall, x, b - bh, bw, bh);
    g.rect(roof, x, b - bh, bw, 1);
    // Casas rotas: el contorno del techo se desmorona.
    if (hash(n, 4, seed) < broken) for (let k = 0; k < bw; k++) g.erase(x + k, b - bh, 1, Math.round(noise1(k * 0.5, n) * bh * 0.6));
    for (let wx = x + 2; wx < x + bw - 2; wx += 4) for (let wy = b - bh + 3; wy < b - 2; wy += 5) {
      if (!g.has(wx, wy)) continue;
      const lit = hash(wx, wy, seed + 9);
      g.rect(lit < winLit ? (lit < winLit * 0.3 ? C.wa2 : C.wa1) : C.ink, wx, wy, 2, 2);
    }
    x += bw + Math.floor(hash(n, 3, seed) * 4);
  }
}

/** Columna de humo tramado (incendios lejanos). */
function smokeColumn(g: Lienzo, x: number, base: number, rise: number, seed: number, c1: string, c2: string): void {
  for (let y = base; y > base - rise; y--) {
    const up = base - y, cx = x + up * 0.3 + Math.sin(y * 0.06 + seed) * (2 + up * 0.06), half = 2 + up * 0.1;
    for (let px = Math.floor(cx - half); px < cx + half; px++) {
      if (noise2(px * 0.2, y * 0.12, seed) > 0.4) g.veil(up < rise * 0.3 ? c1 : c2, px, y, 0.5 * (1 - up / rise));
    }
  }
  g.rect(C.wa1, x - 1, base - 1, 3, 1); g.set(C.wa3, x, base - 2);
}

function midOaxaca(g: Lienzo, w: number): void {
  cityRow(g, w, 200, 3, C.ro0, C.te1, 0.12, 0.25);
  // Cúpulas y campanarios del centro histórico (siluetas ficticias).
  for (const f of [0.12, 0.38, 0.71, 0.9]) {
    const x = Math.round(w * f);
    g.rect(C.pu0, x - 16, 170, 32, 30);
    belfry(g, x - 22, 196, 34, C.pu0, C.ro0, hash(x, 1) > 0.4);
    belfry(g, x + 12, 196, 34, C.pu0, C.ro0, false);
    dome(g, x, 172, 10, C.pu0, C.te1, C.ro0);
  }
  cityRow(g, w, 210, 4, C.pu0, C.ro0, 0.18, 0.35);
  for (let k = 0; k < 5; k++) smokeColumn(g, hash(k, 1, 5) * w, 205, 70 + hash(k, 2, 5) * 40, k, C.te0, C.pu0);
  dust(g, 0, w, 185, 215, C.te0, 0.3, 11);
}

function midCallejones(g: Lienzo, w: number): void {
  cityRow(g, w, 196, 7, C.night, C.mtn0, 0.1, 0.3);
  cityRow(g, w, 208, 8, C.deep, C.night, 0.14, 0.4);
  // Tinacos, antenas y cables de las azoteas.
  for (let k = 0; k < w / 40; k++) {
    const x = hash(k, 1, 9) * w, y = 186 + hash(k, 2, 9) * 14;
    if (k % 3 === 0) { g.rect(C.void, x, y - 6, 6, 6); g.rect(C.night, x, y - 6, 6, 1); g.rect(C.void, x + 1, y, 1, 3); g.rect(C.void, x + 4, y, 1, 3); }
    else if (k % 3 === 1) { g.rect(C.void, x, y - 14, 1, 14); g.rect(C.void, x - 3, y - 12, 7, 1); g.rect(C.void, x - 2, y - 9, 5, 1); }
  }
  for (let k = 0; k < 4; k++) smokeColumn(g, hash(k, 3, 9) * w, 204, 80, k + 10, C.ro0, C.pu0);
  dust(g, 0, w, 180, 215, C.pu0, 0.3, 12);
}

/** Órgano (cactus columnar) del jardín. */
function organo(g: Lienzo, x: number, base: number, h: number, body: string, hi: string, seed: number): void {
  const arms = 2 + Math.floor(hash(seed, 1) * 3);
  for (let a = 0; a < arms; a++) {
    const ax = x + (a - arms / 2) * 5, ah = h * (0.6 + hash(seed, a + 2) * 0.4);
    g.rect(body, ax, base - ah, 4, ah); g.rect(hi, ax, base - ah, 1, ah);
    g.ellipse(body, ax + 1.5, base - ah, 2, 1);
  }
}

function midSantoDomingo(g: Lienzo, w: number): void {
  cityRow(g, w, 198, 15, C.deep, C.night, 0.06, 0.4);
  // Jardín con órganos y agaves detrás de la barda del exconvento.
  for (let k = 0; k < w / 22; k++) organo(g, hash(k, 1, 16) * w, 212, 18 + hash(k, 2, 16) * 26, C.fo0, C.fo1, k);
  for (let k = 0; k < w / 30; k++) {
    const x = hash(k, 3, 16) * w;
    for (let l = 0; l < 7; l++) g.line(C.fo0, x, 212, x + (l - 3) * 3, 212 - 6 - (3 - Math.abs(l - 3)) * 2);
  }
  // Cúpula lejana del exconvento y resplandor fatuo.
  dome(g, Math.round(w * 0.5), 182, 12, C.night, C.tq0, C.tq1);
  dust(g, 0, w, 175, 215, C.tq0, 0.3, 17);
}

/* ======================= CAPA 3: CASAS COLONIALES ======================= */

interface CasaOpts { night?: number; story2?: boolean; dmg?: number; flowers?: boolean; sign?: string; taller?: boolean }

/** Marco de cantera verde (fog) alrededor de un vano. */
function cantera(g: Lienzo, x: number, y: number, w: number, h: number, arch = false): void {
  g.rect(C.fog0, x - 3, y - 3, w + 6, h + 4);
  g.rect(C.fog1, x - 2, y - 2, w + 4, h + 2);
  g.rect(C.fog2, x - 2, y - 2, 1, h + 2); g.rect(C.fog2, x - 2, y - 2, w + 4, 1);
  if (arch) for (let k = 0; k < w + 4; k++) g.set(C.fog2, x - 2 + k, y - 3 - Math.round(Math.sin(k / (w + 3) * Math.PI) * 3));
  g.rect(C.fog0, x - 4, y + h, w + 8, 2); g.rect(C.fog2, x - 4, y + h, w + 8, 1);
}

/** Ventana colonial con reja de hierro; devuelve si quedó encendida. */
function ventana(g: Lienzo, x: number, y: number, w: number, h: number, seed: number, boarded = false): boolean {
  cantera(g, x, y, w, h);
  const lit = !boarded && hash(x, y, seed) > 0.55;
  g.rect(lit ? C.wa1 : C.void, x, y, w, h);
  if (lit) { g.rect(C.wa2, x + 1, y + 1, Math.ceil(w / 2), h - 6); g.rect(C.wa3, x + 2, y + 2, 2, 4); g.rect(C.wa0, x, y + h - 5, w, 5); light(x + w / 2, y + h / 2, 'ventana'); }
  else if (!boarded) for (let k = 0; k < h; k += 3) g.set(C.night, x + 1 + (k % 4), y + k);
  if (boarded) {
    for (let k = 0; k < 3; k++) { g.rect(C.ea1, x - 1, y + 3 + k * 7, w + 2, 4); g.rect(C.ea2, x - 1, y + 3 + k * 7, w + 2, 1); }
    g.line(C.ea0, x, y + 2, x + w, y + h - 2, 2);
  } else {
    // Reja de hierro forjado con remates.
    for (let k = 1; k < w; k += 3) g.rect(C.ink, x + k, y - 1, 1, h + 1);
    g.rect(C.ink, x - 1, y + Math.round(h * 0.35), w + 2, 1); g.rect(C.ink, x - 1, y + h - 2, w + 2, 1);
    for (let k = 1; k < w; k += 6) g.set(C.ink, x + k + 1, y + 2);
  }
  return lit;
}

/** Balcón de hierro sobre una repisa de cantera. */
function balcon(g: Lienzo, x: number, y: number, w: number): void {
  g.rect(C.fog0, x - 4, y, w + 8, 3); g.rect(C.fog2, x - 4, y, w + 8, 1);
  for (let k = 0; k < 3; k++) g.rect(C.fog0, x - 2 + k * ((w + 2) / 2), y + 3, 2, 3 - k % 2);
  g.rect(C.ink, x - 4, y - 10, w + 8, 1);
  for (let k = -3; k < w + 4; k += 3) g.rect(C.ink, x + k, y - 9, 1, 9);
  for (let k = 0; k < w; k += 8) { g.set(C.ink, x + k + 1, y - 6); g.set(C.ink, x + k + 2, y - 5); g.set(C.ink, x + k + 1, y - 4); }
}

/** Bugambilia que cae por el muro. */
function bugambilia(g: Lienzo, x: number, y: number, w: number, len: number, seed: number): void {
  for (let k = 0; k < w * len / 6; k++) {
    const px = x + hash(k, 1, seed) * w, py = y + (hash(k, 2, seed) ** 1.6) * len * (1 - Math.abs(px - x - w / 2) / w);
    g.set(hash(k, 3, seed) > 0.6 ? C.fo2 : hash(k, 4, seed) > 0.4 ? C.ro2 : C.ro1, px, py);
    if (hash(k, 5, seed) > 0.85) g.set(C.ro3, px + 1, py);
  }
}

/** Farol de pared de hierro con vidrio cálido. */
function farolPared(g: Lienzo, x: number, y: number): void {
  g.rect(C.ink, x - 6, y - 4, 7, 1); g.rect(C.ink, x - 6, y - 4, 1, 4); g.rect(C.ink, x, y - 4, 1, 3);
  g.rect(C.ink, x - 3, y - 1, 7, 1); g.rect(C.ea0, x - 2, y, 5, 8); g.rect(C.wa2, x - 1, y + 1, 3, 6); g.set(C.wa4, x, y + 2);
  g.rect(C.ink, x - 3, y + 8, 7, 1);
  light(x, y + 4, 'farol');
}

/** Cable con papel picado (se registra; el decorado lo anima). Aquí solo se pintan jirones caídos. */
function cablePapel(g: Lienzo, x0: number, x1: number, y: number, sag: number, seed: number): void {
  cables?.push({ x0: Math.round(x0), x1: Math.round(x1), y: Math.round(y), sag });
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0), yy = y + Math.sin(t * Math.PI) * sag;
    g.set(C.ink, x, yy);
    // Jirones de papel que quedaron colgando de un cable roto.
    if ((x - x0) % 11 === 5 && hash(x, 1, seed) > 0.7) g.rect([C.ro1, C.tq1, C.wa1, C.pu1, C.fo3][Math.floor(hash(x, 2, seed) * 5)], x - 1, yy + 1, 3, 2 + Math.floor(hash(x, 3, seed) * 3));
  }
}

function casa(g: Lienzo, x: number, width: number, h: number, n: number, o: CasaOpts = {}): void {
  const ground = 214, top = ground - h, [wall, shade, hi] = MUROS[n % MUROS.length];
  g.rect(C.ink, x - 1, top - 1, width + 2, h + 1);
  g.rect(wall, x, top, width, h);
  // Sombra tramada del atardecer hacia la derecha y luz en el borde izquierdo.
  for (let y = top; y < ground; y++) for (let px = 0; px < 16; px++) g.veil(shade, x + width - 16 + px, y, px / 16 + 0.1);
  g.rect(hi, x, top, 2, h);
  // Cal desgastada, manchas de humedad que escurren desde el pretil.
  for (let k = 0; k < width * 1.4; k++) {
    const px = x + hash(k, n, 1) * width, py = top + hash(k, n, 2) * h;
    g.set(hash(k, n, 3) > 0.5 ? shade : hi, px, py);
  }
  for (let k = 0; k < width / 9; k++) {
    const px = x + hash(k, n, 7) * width, len = 6 + hash(k, n, 8) * 22;
    for (let y = 0; y < len; y++) if (bayer(px, top + 4 + y) < 0.7 - y / len * 0.6) g.set(shade, px, top + 4 + y);
  }
  // Penumbra: la noche apaga el color del muro (tramado con su sombra).
  if (o.night) for (let y = top; y < ground; y++) for (let px = x; px < x + width; px++) g.veil(shade, px, y, o.night * (0.6 + (y - top) / h * 0.4));
  // Guardapolvo pintado y banqueta.
  const gp = MUROS[(n + 3) % MUROS.length][1];
  g.rect(gp, x, ground - 12, width, 12); g.rect(C.ink, x, ground - 13, width, 1);
  for (let k = 0; k < width; k += 2) if (hash(k, n, 9) > 0.7) g.set(C.st2, x + k, ground - 12 + hash(k, n, 10) * 10);
  // Pretil con cornisa de cantera y gárgolas de lámina.
  g.rect(C.fog0, x - 2, top - 6, width + 4, 6); g.rect(C.fog1, x - 2, top - 6, width + 4, 2); g.rect(C.fog2, x - 2, top - 6, width + 4, 1);
  g.rect(C.ink, x - 2, top, width + 4, 1);
  for (let k = 12; k < width - 6; k += 34) { g.rect(C.ea1, x + k, top - 3, 8, 2); g.set(C.ea3, x + k + 7, top - 3); }
  // Vanos: puerta con arco y ventanas con reja (planta alta si tiene dos pisos).
  const dx = x + 14 + (n % 3) * 10, dw = 20, dh = 36;
  cantera(g, dx, ground - dh - 2, dw, dh, true);
  const open = o.taller || n % 4 === 0;
  g.rect(open ? C.wa0 : C.ea0, dx, ground - dh - 2, dw, dh);
  if (open) {
    g.rect(C.wa1, dx + 3, ground - dh + 4, dw - 6, dh - 8); g.rect(C.wa2, dx + 5, ground - dh + 8, 5, dh - 14);
    light(dx + dw / 2, ground - dh / 2, 'ventana');
  } else {
    g.rect(C.ea1, dx + 1, ground - dh - 1, dw / 2 - 1, dh - 1); g.rect(C.ea2, dx + 1, ground - dh - 1, 1, dh - 1);
    for (let k = 0; k < 4; k++) g.rect(C.ea0, dx + 2, ground - dh + 4 + k * 8, dw - 4, 1);
    g.rect(C.ea0, dx + dw / 2, ground - dh - 2, 1, dh);
    g.set(C.wa2, dx + dw / 2 - 2, ground - dh / 2); g.set(C.wa2, dx + dw / 2 + 2, ground - dh / 2);
  }
  const lowY = ground - 46;
  for (let wx = dx + dw + 14; wx < x + width - 18; wx += 30) ventana(g, wx, lowY, 13, 26, n, hash(wx, n, 4) < (o.dmg ?? 0) * 0.6);
  if (o.story2) {
    g.rect(C.fog0, x - 2, ground - 64, width + 4, 2); g.rect(C.fog2, x - 2, ground - 64, width + 4, 1);
    for (let wx = x + 12; wx < x + width - 14; wx += 32) {
      ventana(g, wx, ground - 96, 14, 26, n + 9, hash(wx, n, 5) < (o.dmg ?? 0) * 0.5);
      if (hash(wx, n, 6) > 0.35) balcon(g, wx, ground - 69, 14);
    }
  }
  farolPared(g, dx + dw + 7, ground - 58);
  if (o.sign) {
    const sw = o.sign.length * 4 + 5, sx = dx + dw / 2 - sw / 2, sy = ground - dh - 15;
    g.rect(C.ea0, sx - 1, sy - 1, sw + 2, 9); g.rect(C.ea3, sx, sy, sw, 7); g.rect(C.ea4, sx, sy, sw, 1);
    miniText(g, C.ea0, o.sign, sx + 3, sy + 1);
  }
  if (o.taller) {
    // Textiles tendidos en la fachada del taller: grecas, rombos y estrellas.
    const kinds = ['greca', 'rombo', 'estrella', 'zigzag'] as const;
    const cols: Array<[string, string, string]> = [[C.rd0, C.wa2, C.ink], [C.mtn0, C.sh1, C.ro1], [C.ink, C.ro2, C.wa1], [C.fo2, C.wa3, C.te1]];
    for (let k = 0; k < 4; k++) {
      const tx = x + width - 96 + k * 22, ty = top + 10;
      if (tx < dx + dw + 4) continue;
      g.rect(C.ea2, tx - 2, ty - 2, 22, 2);
      tejido(g, tx, ty, 18, 30 + (k % 2) * 6, kinds[k], cols[k][0], cols[k][1], cols[k][2], 0, k);
      for (let fx = tx; fx < tx + 18; fx += 2) g.rect(cols[k][1], fx, ty + 30 + (k % 2) * 6, 1, 3);
    }
  }
  if (o.flowers) bugambilia(g, x + width * 0.55, top - 4, width * 0.45, 46, n);
  // Daño: esquina del pretil derrumbada con adobe expuesto y grietas.
  const dmg = o.dmg ?? 0;
  if (dmg > 0.2) {
    const left = n % 2 === 0, cw = Math.round(width * (0.2 + dmg * 0.25)), ch = Math.round(h * (0.15 + dmg * 0.35));
    const cx0 = left ? x - 2 : x + width - cw + 2;
    for (let k = 0; k < cw + 2; k++) {
      const t = left ? 1 - k / cw : k / cw, depth = Math.round(Math.max(0, t) * ch + noise1(k * 0.6, n) * 6);
      if (depth <= 0) continue;
      g.erase(cx0 + k, top - 7, 1, depth + 7);
      // Borde roto: adobe y cal.
      adobe(g, cx0 + k, top + depth, 1, 5, n);
      g.set(C.st3, cx0 + k, top + depth);
    }
    for (let c = 0; c < 2; c++) {
      let px = left ? x + cw * 0.6 : x + width - cw * 0.6, py = top + ch * 0.6;
      for (let s = 0; s < 24 * dmg; s++) { px += (hash(s, c, n) - 0.5) * 3 + (left ? 0.6 : -0.6); py += 1.4; g.set(C.ink, px, py); if (s % 3 === 0) g.set(shade, px + 1, py); }
    }
    // Parche de adobe visible donde se cayó el aplanado.
    adobe(g, x + width * 0.3 + hash(n, 3) * width * 0.3, top + h * 0.35, 14 + dmg * 10, 10, n + 1);
  }
}

/** Lote derrumbado: muro bajo, vigas caídas y montón de escombro. */
function ruina(g: Lienzo, x: number, width: number, n: number): void {
  const ground = 214;
  for (let k = 0; k < width; k++) {
    const hgt = Math.round(14 + (noise1(k * 0.03, n) * 30 + noise1(k * 0.2, n + 1) * 5) * Math.sin(k / width * Math.PI));
    adobe(g, x + k, ground - hgt, 1, hgt, n);
    if (hash(k, 1, n) > 0.3) g.set(C.te3, x + k, ground - hgt);
  }
  // Restos del aplanado pintado en el muro.
  for (let k = 0; k < width * 0.4; k++) g.rect(MUROS[n % MUROS.length][0], x + 4 + k, ground - 14 - hash(k, 2, n) * 10, 1, 4 + hash(k, 3, n) * 6);
  g.line(C.ea1, x + width * 0.2, ground - 40, x + width * 0.7, ground - 8, 3); g.line(C.ea2, x + width * 0.2, ground - 41, x + width * 0.7, ground - 9);
  for (let k = 0; k < width * 1.5; k++) {
    const px = x + hash(k, 4, n) * width, py = ground - (hash(k, 5, n) ** 2) * 14;
    g.rect(hash(k, 6, n) > 0.5 ? C.st2 : C.te1, px, py, 2 + hash(k, 7, n) * 3, 2);
  }
}

/** Farol de poste de hierro (luz que late en el decorado). */
function farolPoste(g: Lienzo, x: number): void {
  g.rect(C.ink, x, 140, 3, 74); g.rect(C.st1, x, 140, 1, 74);
  g.rect(C.ink, x - 2, 206, 7, 8);
  g.rect(C.ink, x - 4, 130, 11, 10); g.rect(C.wa2, x - 3, 131, 9, 8); g.rect(C.wa4, x - 1, 132, 4, 5);
  g.rect(C.ink, x - 5, 128, 13, 2); g.rect(C.ink, x, 125, 3, 3);
  light(x + 1, 135, 'farol');
}

function nearOaxaca(g: Lienzo, w: number): void {
  const at = (X: number) => atWorld(X, 0.65);
  const taller = at(OAXACA_LANDMARKS.taller.x);
  let x = -10;
  for (let n = 0; x < w; n++) {
    // Hueco de calle lateral: se ven la Sierra y la ciudad.
    if (n === 5 || n === 12) { x += 70; continue; }
    if (n === 3 || n === 15) { ruina(g, x, 90, n); x += 96; continue; }
    const isTaller = x < taller && x + 160 > taller && n > 4;
    const bw = isTaller ? 170 : 96 + Math.floor(hash(n, 1, 41) * 60);
    const bh = isTaller ? 84 : 72 + Math.floor(hash(n, 2, 41) * 60);
    casa(g, x, bw, bh, isTaller ? 5 : n, {
      night: 0.22, story2: bh > 96, dmg: isTaller ? 0.1 : hash(n, 3, 41), flowers: hash(n, 4, 41) > 0.6,
      sign: isTaller ? 'TALLER' : n === 8 ? 'MEZCAL' : undefined, taller: isTaller,
    });
    if (isTaller) light(x + 30, 200, 'vela');
    x += bw + (hash(n, 5, 41) > 0.7 ? 6 : 0);
  }
  for (let px = 120; px < w; px += 330) farolPoste(g, px + Math.round(hash(px, 1) * 40));
  for (let x0 = 40; x0 < w - 200; x0 += 230) cablePapel(g, x0, x0 + 170 + hash(x0, 2) * 40, 92 + hash(x0, 3) * 20, 10 + hash(x0, 4) * 8, x0);
}

/** Puesto de mercado al fondo: lona rayada sobre palos, mesa y mercancía. */
function puestoFondo(g: Lienzo, x: number, n: number): void {
  const ground = 214, w = 54 + (n % 3) * 10, lonaY = 150 + (n % 2) * 6;
  const [a, b] = [[C.ro1, C.sh1], [C.tq1, C.wa4], [C.wa1, C.ro0], [C.fo3, C.wa3], [C.pu1, C.wa2]][n % 5];
  g.rect(C.ea0, x, lonaY, 2, ground - lonaY); g.rect(C.ea0, x + w, lonaY, 2, ground - lonaY);
  for (let y = 0; y < 14; y++) {
    const sag = Math.round(Math.sin(y / 14 * Math.PI) * 1.5);
    for (let k = -4; k < w + 6; k++) g.set(Math.floor((k + 40) / 6) % 2 ? a : b, x + k, lonaY + y + sag);
  }
  // Lona rasgada en algunos puestos.
  if (n % 3 === 1) for (let k = 0; k < 18; k++) g.erase(x + w * 0.4 + k, lonaY + 4 + Math.round(Math.sin(k * 0.4) * 3), 1, 11);
  for (let k = -4; k < w + 6; k += 6) g.rect(a, x + k, lonaY + 14, 3, 3);
  // Mesa con canastas, ollas de barro negro y textiles doblados.
  g.rect(C.ea1, x + 2, ground - 22, w - 2, 4); g.rect(C.ea3, x + 2, ground - 22, w - 2, 1);
  g.rect(C.ea0, x + 4, ground - 18, 2, 18); g.rect(C.ea0, x + w - 4, ground - 18, 2, 18);
  for (let k = 0; k < 4; k++) {
    const ox = x + 6 + k * 12;
    if ((k + n) % 3 === 0) { g.ellipse(C.st0, ox + 3, ground - 26, 4, 4); g.rect(C.st0, ox + 1, ground - 31, 4, 2); g.set(C.st3, ox + 1, ground - 28); }
    else if ((k + n) % 3 === 1) { g.rect(C.ea3, ox, ground - 28, 9, 6); for (let t = 0; t < 9; t += 2) g.set(C.ea4, ox + t, ground - 27); g.line(C.ea2, ox, ground - 28, ox + 4, ground - 33); g.line(C.ea2, ox + 4, ground - 33, ox + 8, ground - 28); }
    else for (let t = 0; t < 3; t++) g.rect([C.rd0, C.tq1, C.wa1][(t + k) % 3], ox, ground - 24 - t * 2, 10, 2);
  }
  // Textiles colgando de la lona.
  for (let k = 0; k < 2; k++) tejido(g, x + 8 + k * (w - 26), lonaY + 16, 10, 22, k ? 'rombo' : 'zigzag', [C.ink, C.mtn0, C.rd0][n % 3], C.wa3, C.ro1, 0.2, n + k);
}

/** Mural geométrico pelado (sol, colibrí y greca), pintura propia. */
function mural(g: Lienzo, x: number, y: number, w: number, h: number, seed: number): void {
  g.rect(C.tq0, x, y, w, h);
  frisoGreca(g, x, y + 2, w, C.wa2);
  frisoGreca(g, x, y + h - 10, w, C.ro2, 'escalon');
  // Sol de rayos escalonados.
  const sx = x + w * 0.3, sy = y + h * 0.5;
  for (let a = 0; a < 12; a++) g.line(C.wa1, sx, sy, sx + Math.cos(a * 0.524) * 14, sy + Math.sin(a * 0.524) * 12, 2);
  g.ellipse(C.wa2, sx, sy, 7, 6); g.ellipse(C.wa3, sx - 1, sy - 1, 4, 3); g.set(C.ink, sx - 2, sy - 1); g.set(C.ink, sx + 2, sy - 1);
  // Colibrí de perfil.
  const cx = x + w * 0.68, cy = y + h * 0.45;
  g.ellipse(C.fo4, cx, cy, 6, 3); g.ellipse(C.ro2, cx + 4, cy - 2, 3, 2); g.line(C.ink, cx + 6, cy - 2, cx + 13, cy);
  g.line(C.tq2, cx - 2, cy - 1, cx - 9, cy - 10, 2); g.line(C.tq2, cx - 4, cy, cx - 12, cy - 6, 2); g.line(C.fo4, cx - 5, cy + 1, cx - 11, cy + 5, 2);
  // La pintura se descascara.
  for (let k = 0; k < w * h * 0.07; k++) {
    const px = x + hash(k, 1, seed) * w, py = y + hash(k, 2, seed) * h;
    if (noise2(px * 0.12, py * 0.12, seed) > 0.62) g.rect(C.st3, px, py, 2, 1);
  }
}

function nearCallejones(g: Lienzo, w: number): void {
  const at = (X: number) => atWorld(X, 0.65);
  const m0 = at(OAXACA_LANDMARKS.mercado.x0), m1 = at(OAXACA_LANDMARKS.mercado.x1);
  // Callejón: muros altos y pegados, de dos pisos, más oscuros.
  let x = -10;
  for (let n = 20; x < m0 - 40; n++) {
    const bw = 90 + Math.floor(hash(n, 1, 51) * 50);
    casa(g, x, bw, 104 + Math.floor(hash(n, 2, 51) * 24), n, { night: 0.5, story2: true, dmg: 0.2 + hash(n, 3, 51) * 0.7, flowers: n % 3 === 0 });
    if (n === 21) mural(g, x + bw * 0.45, 214 - 98, Math.min(52, bw * 0.45), 34, n);
    x += bw;
  }
  // Mercado: nave de arcos con techo de lámina caído y puestos con lonas delante.
  const hallTop = 96;
  g.rect(C.st0, m0 - 30, hallTop, m1 - m0 + 60, 214 - hallTop);
  for (let k = m0 - 30; k < m1 + 30; k++) {
    const sag = Math.round(noise1(k * 0.03, 3) * 10);
    g.rect(C.st1, k, hallTop - 8 + sag, 1, 8); if ((k + 3) % 6 === 0) g.set(C.st3, k, hallTop - 8 + sag);
    if (hash(Math.floor(k / 40), 4) > 0.65 && (k % 40) < 22) g.erase(k, hallTop - 9 + sag, 1, 10);
  }
  for (let ax = m0 - 20; ax < m1 + 10; ax += 64) {
    // Arco de medio punto sobre pilares de cantera; adentro la penumbra del mercado.
    g.rect(C.fog0, ax, hallTop + 6, 10, 108); g.rect(C.fog1, ax, hallTop + 6, 2, 108);
    for (let k = 0; k < 54; k++) {
      const yy = hallTop + 10 + Math.round((1 - Math.sin(k / 53 * Math.PI)) * 0 + 26 - Math.sin(k / 53 * Math.PI) * 24);
      g.rect(C.void, ax + 10 + k, yy, 1, 214 - yy);
      g.set(C.fog1, ax + 10 + k, yy - 1); g.set(C.fog0, ax + 10 + k, yy - 2);
    }
    g.rect(C.ink, ax + 10, hallTop + 6, 54, 4);
  }
  miniText(g, C.st4, 'MERCADO', m0 + 40, hallTop + 1);
  for (let k = 0, px = m0 - 10; px < m1; k++, px += 74) puestoFondo(g, px, k);
  for (let k = 0; k < 6; k++) { const fx = m0 + k * (m1 - m0) / 6 + 20; g.rect(C.ink, fx, hallTop + 10, 1, 20); g.rect(C.ea0, fx - 2, hallTop + 30, 5, 6); g.rect(C.wa2, fx - 1, hallTop + 31, 3, 4); light(fx, hallTop + 33, 'farol'); }
  x = m1 + 40;
  for (let n = 40; x < w; n++) {
    const bw = 90 + Math.floor(hash(n, 1, 52) * 50);
    casa(g, x, bw, 100 + Math.floor(hash(n, 2, 52) * 30), n, { night: 0.5, story2: true, dmg: 0.3 + hash(n, 3, 52) * 0.6, flowers: n % 4 === 1 });
    if (n === 41) mural(g, x + 10, 214 - 100, Math.min(60, bw - 20), 36, n);
    x += bw;
  }
  // Textiles tendidos de lado a lado y cables enredados del callejón.
  for (let x0 = 30; x0 < w - 150; x0 += 260) cablePapel(g, x0, x0 + 150, 84 + hash(x0, 1) * 16, 8, x0 + 1);
  for (let x0 = 160; x0 < w; x0 += 410) {
    for (let dx = 0; dx < 120; dx++) g.set(C.ink, x0 + dx, 112 + Math.sin(dx / 120 * Math.PI) * 10);
    for (let k = 0; k < 4; k++) {
      const tx = x0 + 14 + k * 26, ty = 112 + Math.round(Math.sin((14 + k * 26) / 120 * Math.PI) * 10);
      tejido(g, tx, ty, 14, 26, (['greca', 'rombo', 'estrella', 'zigzag'] as const)[k], [C.rd0, C.ink, C.mtn0, C.ro0][k], [C.wa2, C.ro2, C.sh1, C.tq2][k], C.wa1, 0.25, k + x0);
    }
  }
}

/** Andamio de madera (capa 3). */
function andamio(g: Lienzo, x: number, top: number, w: number, base = 214): void {
  for (let px = x; px <= x + w; px += Math.max(12, Math.round(w / 3))) { g.rect(C.ea0, px, top, 3, base - top); g.rect(C.ea2, px, top, 1, base - top); }
  for (let y = top + 6; y < base; y += 26) {
    g.rect(C.ea1, x - 3, y, w + 9, 3); g.rect(C.ea3, x - 3, y, w + 9, 1);
    g.line(C.ea0, x, y + 3, x + w, y + 25 > base ? base : y + 25);
  }
}

/** Grupo de velas encendidas al pie de un muro. */
function velasMuro(g: Lienzo, x: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const vx = x + k * 4 + (k % 2), vh = 3 + (k * 7) % 5;
    g.rect(k % 3 ? C.sh1 : C.wa4, vx, 213 - vh, 2, vh); g.set(C.wa2, vx, 212 - vh); g.set(C.wa3, vx, 211 - vh);
  }
  light(x + n * 2, 205, 'vela');
}

/** Aparejo de sillares: juntas horizontales y verticales alternadas. */
function sillares(g: Lienzo, x: number, y: number, w: number, h: number, c: string, seed: number): void {
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const row = Math.floor(py / 7), off = row % 2 ? 6 : 0;
    if (py % 7 === 6 || ((px + off) % 12 === 11 && hash(Math.floor((px + off) / 12), row, seed) > 0.2)) g.set(c, x + px, y + py);
  }
}

/** Fachada barroca del templo de Santo Domingo en cantera verde, en ruinas fortificadas. */
function templo(g: Lienzo, cx: number): void {
  const base = 214, body = C.teal0, lit = C.fog0, hi = C.fog1, sh = C.dusk;
  const tw = 54, fw = 150; // ancho de torre y de fachada
  // Nave detrás de la fachada.
  g.rect(C.night, cx - fw / 2 - 10, 96, fw + 20, base - 96);
  // Torres.
  for (const side of [-1, 1]) {
    const tx = cx + side * (fw / 2 + tw / 2) - tw / 2;
    g.rect(body, tx, 70, tw, base - 70); g.rect(lit, tx, 70, 6, base - 70); g.rect(C.night, tx + tw - 8, 70, 8, base - 70);
    sillares(g, tx, 70, tw, base - 70, sh, 2);
    for (let y = 70; y < base; y += 34) { g.rect(hi, tx - 2, y, tw + 4, 2); g.rect(C.night, tx - 2, y + 2, tw + 4, 1); }
    // Campanario de dos cuerpos con vanos.
    for (const [by, bh] of [[30, 40], [4, 26]] as const) {
      const bw = by === 30 ? tw - 6 : tw - 18, bx = tx + (tw - bw) / 2;
      g.rect(body, bx, by, bw, bh); g.rect(lit, bx, by, 3, bh); g.rect(hi, bx - 2, by + bh - 2, bw + 4, 2);
      for (let k = 0; k < 2; k++) {
        const vx = bx + 5 + k * (bw - 18) / 1, vw = Math.max(6, Math.round((bw - 16) / 2.2));
        if (vx + vw > bx + bw - 2) continue;
        for (let y = 0; y < bh - 10; y++) {
          const half = y < vw / 2 ? Math.round(Math.sqrt((vw / 2) ** 2 - (vw / 2 - y) ** 2)) : vw / 2;
          g.rect(C.ink, vx + vw / 2 - half, by + 5 + y, half * 2, 1);
        }
        if (side < 0 && by === 30) { g.rect(C.wa2, vx + vw / 2 - 1, by + 20, 3, 3); light(vx + vw / 2, by + 21, 'vela'); }
      }
    }
    // Cupulín de azulejo.
    dome(g, tx + tw / 2, 6, 8, body, C.tq0, hi);
  }
  // Fachada-retablo: tres cuerpos con columnas pareadas y nichos.
  const fx = cx - fw / 2;
  g.rect(body, fx, 60, fw, base - 60); g.rect(lit, fx, 60, 4, base - 60);
  sillares(g, fx, 60, fw, base - 60, sh, 1);
  for (let row = 0; row < 3; row++) {
    const ry = 70 + row * 46;
    g.rect(hi, fx - 3, ry - 3, fw + 6, 3); g.rect(sh, fx - 3, ry, fw + 6, 1);
    for (const c of [10, 26, fw - 34, fw - 18]) {
      g.rect(lit, fx + c, ry, 7, 43); g.rect(hi, fx + c, ry, 2, 43); g.rect(sh, fx + c + 6, ry, 1, 43);
      for (let y = ry + 4; y < ry + 42; y += 6) g.set(sh, fx + c + 3 + (y % 4 ? 1 : -1), y);
    }
    // Nichos con santos en sombra.
    for (const nx of [19, fw - 25]) {
      g.rect(C.ink, fx + nx - 2, ry + 12, 9, 22); g.ellipse(C.ink, fx + nx + 2, ry + 12, 4, 4);
      g.rect(C.night, fx + nx, ry + 18, 4, 14); g.ellipse(C.night, fx + nx + 2, ry + 16, 2, 2);
    }
  }
  // Ventana del coro octagonal con luz de velas y relieve central.
  g.ellipse(sh, cx, 95, 15, 13); g.ellipse(C.ink, cx, 95, 12, 10); g.ellipse(C.wa0, cx, 96, 9, 7); g.ellipse(C.wa1, cx - 2, 95, 4, 4);
  light(cx, 96, 'fatuo');
  frisoGreca(g, fx + 40, 162, fw - 80, hi);
  // Remate curvo con la cruz caída de lado.
  for (let k = 0; k < fw - 30; k++) {
    const t = k / (fw - 31), s2 = Math.abs(t - 0.5) * 2;
    // Frontón mixtilíneo: volutas a los lados, escalón y remate central.
    const yy = 60 - Math.round(s2 > 0.7 ? (1 - s2) * 30 : s2 > 0.35 ? 9 + Math.sin((s2 - 0.35) / 0.35 * Math.PI) * 3 : 22 - s2 * 10);
    g.rect(body, fx + 15 + k, yy, 1, 60 - yy); g.set(hi, fx + 15 + k, yy); g.set(sh, fx + 15 + k, yy + 1);
  }
  for (const vx of [fx + 22, fx + fw - 22]) { g.ellipse(lit, vx, 54, 4, 4); g.ellipse(C.night, vx, 54, 2, 2); }
  g.rect(C.ink, cx - 5, 42, 10, 16); g.ellipse(C.ink, cx, 42, 5, 4); g.rect(C.night, cx - 2, 46, 4, 10); // nicho del remate
  g.line(sh, cx + 4, 36, cx + 14, 30, 2); g.line(sh, cx + 7, 30, cx + 10, 37, 2);
  // Portada: arco de medio punto, puertas de madera entreabiertas.
  const pw = 34, ph = 46;
  for (let y = 0; y < ph; y++) {
    const half = y < pw / 2 ? Math.round(Math.sqrt((pw / 2) ** 2 - (pw / 2 - y) ** 2)) : pw / 2;
    g.rect(hi, cx - half - 2, base - ph + y - 2, half * 2 + 4, 1);
    g.rect(C.ink, cx - half, base - ph + y, half * 2, 1);
  }
  g.rect(C.ea0, cx - 16, base - 30, 12, 30); g.rect(C.ea1, cx - 15, base - 29, 10, 29); g.rect(C.ea0, cx + 6, base - 30, 10, 30);
  g.rect(C.tq0, cx - 4, base - 30, 10, 30); g.rect(C.tq1, cx - 1, base - 22, 3, 22);
  light(cx + 1, base - 14, 'fatuo');
  // Ruina: la torre derecha perdió su remate y hay grietas y boquetes.
  const rx = cx + fw / 2;
  for (let k = 0; k < tw + 4; k++) g.erase(rx + k, 0, 1, 40 + Math.round(noise1(k * 0.3, 7) * 26 + k * 0.4));
  for (let k = 0; k < tw + 4; k++) { const yy = 40 + Math.round(noise1(k * 0.3, 7) * 26 + k * 0.4); g.set(C.st3, rx + k, yy); g.set(sh, rx + k, yy + 1); }
  for (const [x0, y0] of [[cx - 30, 120], [cx + 40, 74], [rx + 20, 110], [fx - 30, 150]] as const) {
    let px = x0, py = y0;
    for (let s = 0; s < 26; s++) { px += (hash(s, x0) - 0.5) * 3; py += 1.5; g.set(C.ink, px, py); if (s % 2) g.set(sh, px + 1, py); }
  }
  g.ellipse(C.ink, fx + 30, 140, 8, 6); adobe(g, fx + 24, 136, 4, 6, 3);
  // Andamio en la torre izquierda y barricada de la Cofradía (sacos, tablas, estacas).
  andamio(g, cx - fw / 2 - tw - 10, 52, tw + 16);
  for (let k = 0; k < 9; k++) {
    const bx = cx - fw / 2 - tw - 30 + k * 30;
    if (Math.abs(bx + 6 - cx) < 24) continue;
    for (let r = 0; r < 2; r++) { g.ellipse(C.ea2, bx + r * 6, 210 - r * 5, 7, 3); g.rect(C.ea3, bx + r * 6 - 4, 208 - r * 5, 6, 1); }
  }
  for (let k = 0; k < 6; k++) g.line(C.ea1, rx + 4 + k * 9, 214, rx + 10 + k * 9, 190, 2);
  velasMuro(g, cx - 36, 6); velasMuro(g, cx + 22, 5); velasMuro(g, fx - 40, 4);
}

/** Barda del atrio con almenas improvisadas y arcos ciegos. */
function barda(g: Lienzo, x0: number, x1: number): void {
  for (let x = x0; x < x1; x++) {
    const top = 168 + ((Math.floor((x - x0) / 10) % 2) ? 0 : -6);
    g.rect(C.teal0, x, top, 1, 214 - top);
    if ((x - x0) % 10 === 0) g.rect(C.dusk, x, top, 1, 214 - top);
    if ((x + Math.floor((top - 160) / 1)) % 23 === 0) g.rect(C.dusk, x, top + 18, 1, 6);
    g.set(C.fog1, x, top); g.set(C.fog0, x, top + 1);
  }
  for (let ax = x0 + 20; ax < x1 - 30; ax += 48) {
    for (let k = 0; k < 24; k++) { const yy = 184 - Math.round(Math.sin(k / 23 * Math.PI) * 6); g.rect(C.night, ax + k, yy, 1, 214 - yy); g.set(C.fog1, ax + k, yy - 1); }
  }
  for (let k = 0; k < (x1 - x0) / 4; k++) g.set(C.fo1, x0 + hash(k, 1, 3) * (x1 - x0), 210 - hash(k, 2, 3) * 30);
}

/** Agave de silueta para la capa 3. */
function agaveSil(g: Lienzo, x: number, base: number, s: number, body: string, hi: string): void {
  for (let l = 0; l < 9; l++) {
    const a = -Math.PI / 2 + (l - 4) * 0.32, len = s * (1 - Math.abs(l - 4) * 0.08);
    g.line(body, x, base, x + Math.cos(a) * len, base + Math.sin(a) * len, 2);
    g.set(hi, x + Math.cos(a) * len, base + Math.sin(a) * len);
  }
}

/** Interior de la nave: penumbra con retablos dorados, bóveda nervada y velas. */
function interior(g: Lienzo, x0: number, w: number): void {
  for (let x = x0; x < w; x++) for (let y = 0; y < 214; y++) {
    const n = noise2(x * 0.05, y * 0.05, 3);
    g.set(n > 0.62 ? C.ea0 : bayer(x, y) < 0.25 ? C.st0 : C.ink, x, y);
  }
  // Bóveda: arcos fajones y nervaduras.
  for (let ax = x0 + 40; ax < w; ax += 150) {
    for (let k = -70; k <= 70; k++) {
      const yy = 40 - Math.round(Math.sqrt(Math.max(0, 70 * 70 - k * k)) * 0.5);
      g.rect(C.st1, ax + k, yy + 34, 1, 3); g.set(C.st2, ax + k, yy + 34);
    }
    g.rect(C.st1, ax - 72, 40, 8, 174); g.rect(C.st2, ax - 72, 40, 2, 174);
  }
  // Retablos dorados entre los pilares.
  for (let rx = x0 + 60, k = 0; rx < w - 60; rx += 150, k++) {
    const rw = 96, top = 52;
    for (let y = top; y < 196; y++) for (let x = rx - rw / 2; x < rx + rw / 2; x++) {
      const u = (x - rx + rw / 2) / rw, v = (y - top) / 144;
      const n = noise2(x * 0.3, y * 0.3, k);
      // Oro casi apagado: brillos tramados por la luz de las velas de abajo.
      let c: string = n > 0.6 ? C.ea1 : n > 0.3 ? C.ea0 : C.ink;
      if (n > 0.82 && bayer(x, y) < 0.2 + v * 0.4) c = C.wa0;
      if (n > 0.95 && v > 0.55) c = C.wa1;
      if (Math.abs(u - 0.5) < 0.12 && v > 0.15 && v < 0.55) c = C.ink; // nicho central
      g.set(c, x, y);
    }
    // Columnas salomónicas.
    for (const cxo of [-38, 38]) for (let y = top + 4; y < 194; y++) {
      const tw = Math.round(Math.sin(y * 0.35 + cxo) * 1.5);
      g.rect(C.wa0, rx + cxo + tw - 1, y, 3, 1); if ((y + cxo) % 3 === 0) g.set(y > 130 ? C.wa2 : C.wa1, rx + cxo + tw - 1, y);
    }
    for (const yy of [top, top + 48, top + 96, 194]) { g.rect(C.wa0, rx - rw / 2 - 2, yy, rw + 4, 2); for (let k3 = 0; k3 < rw + 4; k3 += 2) g.set(yy > 120 ? C.wa2 : C.wa1, rx - rw / 2 - 2 + k3, yy); }
    g.ellipse(C.ink, rx, top + 24, 8, 8); g.ellipse(C.ea1, rx, top + 26, 3, 3); // santo en sombra
    // Remate en abanico.
    for (let k2 = -rw / 2; k2 < rw / 2; k2++) { const yy = top - Math.round(Math.sin((k2 + rw / 2) / rw * Math.PI) * 18); g.rect(C.ea0, rx + k2, yy, 1, top - yy); g.set(C.wa0, rx + k2, yy); if (k2 % 8 === 0) g.line(C.ea1, rx, top, rx + k2, yy); }
    // Piezas caídas y grietas del retablo.
    if (k % 2 === 1) for (let k2 = 0; k2 < 20; k2++) g.erase(rx + 10 + k2, 120 + Math.round(noise1(k2 * 0.4, k) * 30), 1, 20);
    light(rx, 120, 'oro');
    for (let v2 = 0; v2 < 3; v2++) velasMuro(g, rx - 30 + v2 * 22, 4);
  }
  // Marco de la puerta: grosor del muro de cantera.
  g.rect(C.fog0, x0, 0, 16, 214); g.rect(C.fog1, x0, 0, 4, 214); g.rect(C.mtn0, x0 + 14, 0, 2, 214);
}

function nearSantoDomingo(g: Lienzo, w: number): void {
  const at = (X: number) => atWorld(X, 0.65);
  const cx = at(OAXACA_LANDMARKS.templo.x), inside = at(OAXACA_LANDMARKS.templo.interior);
  barda(g, -10, cx - 150);
  for (let k = 0; k < 10; k++) agaveSil(g, 20 + k * ((cx - 190) / 10) + hash(k, 1, 4) * 12, 214, 10 + hash(k, 2, 4) * 8, C.fo1, C.fo3);
  templo(g, cx);
  // Muro lateral de la nave con contrafuertes, ventanas ciegas y andamios.
  const n0 = cx + 140;
  g.rect(C.teal0, n0, 84, inside - n0, 130); g.rect(C.fog1, n0, 84, inside - n0, 1);
  sillares(g, n0, 85, inside - n0, 129, C.dusk, 3);
  for (let y = 84; y < 214; y++) for (let x = n0; x < inside; x++) g.veil(C.night, x, y, (y - 84) / 130 * 0.5);
  for (let bx = n0 + 10; bx < inside - 20; bx += 70) {
    g.rect(C.night, bx + 14, 84, 12, 130); g.rect(C.fog0, bx + 12, 90, 4, 124); g.rect(C.fog1, bx + 12, 90, 1, 124);
    g.rect(C.ink, bx + 40, 110, 12, 30); g.ellipse(C.ink, bx + 46, 110, 6, 6);
    if (hash(bx, 2) > 0.5) { g.rect(C.tq0, bx + 42, 116, 8, 22); light(bx + 46, 125, 'fatuo'); }
  }
  andamio(g, n0 + 60, 96, 60);
  velasMuro(g, n0 + 20, 5);
  interior(g, inside, w);
}

/* ================================ DESPACHO ================================ */

/** Luces y cables de papel picado de la capa 3 (para el decorado animado). */
export function oaxacaLayerFeatures(section: OaxacaSection, width: number): { lights: OaxacaLight[]; cables: OaxacaCable[] } {
  lights = []; cables = [];
  drawOaxacaLayer(section, 3, width);
  const out = { lights, cables };
  lights = null; cables = null;
  return out;
}

/** Dibuja una capa completa (0–5) de una sección en un lienzo nuevo de width × 360. */
export function drawOaxacaLayer(section: OaxacaSection, index: number, width: number, height = 360): Lienzo {
  const g = new Lienzo(width, height);
  const table: Record<OaxacaSection, Array<(g: Lienzo, w: number) => void>> = {
    oaxaca: [skyOaxaca, farOaxaca, midOaxaca, nearOaxaca],
    callejones: [skyCallejones, farCallejones, midCallejones, nearCallejones],
    santo_domingo: [skySantoDomingo, farSantoDomingo, midSantoDomingo, nearSantoDomingo],
  };
  if (index < 4) table[section][index](g, width);
  else if (index === 4) drawOaxacaGround(g, section, width);
  else drawOaxacaForeground(g, section, width);
  return g;
}
