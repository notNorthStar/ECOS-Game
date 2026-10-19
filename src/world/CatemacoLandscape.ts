/**
 * Paisaje del Nivel 3 (capas 0–3) para las tres secciones de Catemaco. Noche cerrada, laguna,
 * neblina espesa y, en el altar, un cielo de horror cósmico. Sin Phaser ni DOM.
 */
import { C, Lienzo, bayer, hash, miniText, noise1, noise2 } from './CatemacoPixels';
import { drawCatemacoForeground, drawCatemacoGround } from './CatemacoTerrain';

export type CatemacoSection = 'catemaco' | 'campamento' | 'altar_olmeca';
export const CATEMACO_BG_PREFIX: Record<CatemacoSection, string> = {
  catemaco: 'fondo_catemaco', campamento: 'fondo_campamento', altar_olmeca: 'fondo_altar_olmeca',
};
export const CATEMACO_SECTION_WIDTH: Record<CatemacoSection, number> = { catemaco: 2400, campamento: 3200, altar_olmeca: 2400 };

/** Fuente de luz pintada en la capa 3 (coordenadas de esa capa); el decorado le pone halo animado. */
export interface CatemacoLight { x: number; y: number; kind: 'farol' | 'ventana' | 'antorcha' | 'brasa'; }
let lights: CatemacoLight[] | null = null;
const light = (x: number, y: number, kind: CatemacoLight['kind']): void => { lights?.push({ x: Math.round(x), y: Math.round(y), kind }); };

/* ============================== CAPA 0: CIELO ============================== */

function ramp(g: Lienzo, colors: string[], y0: number, y1: number, w: number): void {
  for (let y = 0; y < g.h; y++) {
    const t = Math.max(0, Math.min(0.9999, (y - y0) / (y1 - y0))) * (colors.length - 1);
    const i = Math.floor(t), f = t - i;
    for (let x = 0; x < w; x++) g.set(bayer(x, y) < f ? colors[Math.min(i + 1, colors.length - 1)] : colors[i], x, y);
  }
}

function stars(g: Lienzo, w: number, count: number, maxY: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(i, 1, seed) * w), y = Math.floor(hash(i, 2, seed) ** 1.6 * maxY);
    const b = hash(i, 3, seed);
    g.set(b > 0.93 ? C.wa4 : b > 0.7 ? C.mtn2 : C.mtn0, x, y);
    if (b > 0.985) { g.set(C.mtn2, x - 1, y); g.set(C.mtn2, x + 1, y); g.set(C.mtn2, x, y - 1); g.set(C.mtn2, x, y + 1); }
  }
}

/** Luna con halo tramado y mares; `tone` permite la luna enferma del altar. */
function moon(g: Lienzo, mx: number, my: number, r: number, halo: string, body: string[], spots: string): void {
  for (let y = my - r * 3; y < my + r * 3; y++) for (let x = mx - r * 3; x < mx + r * 3; x++) {
    const d = Math.hypot(x - mx, y - my);
    if (d > r && d < r * 3) g.veil(halo, x, y, ((1 - (d - r) / (r * 2)) ** 2) * 0.55);
  }
  for (let y = my - r; y <= my + r; y++) for (let x = mx - r; x <= mx + r; x++) {
    const dx = x - mx, dy = y - my, d = Math.hypot(dx, dy);
    if (d > r) continue;
    // Luz desde arriba a la izquierda; terminador tramado.
    const lit = 1 - (dx * 0.55 + dy * 0.45 + r * 0.25) / (r * 1.8);
    const t = Math.max(0, Math.min(0.999, lit)) * (body.length - 1);
    const i = Math.floor(t);
    g.set(bayer(x, y) < t - i ? body[Math.min(i + 1, body.length - 1)] : body[i], x, y);
    if (noise2(x * 0.35, y * 0.35, 9) > 0.66 && d < r - 1) g.set(spots, x, y);
  }
}

/** Banco de nubes alargadas con borde iluminado por la luna. */
function cloudBank(g: Lienzo, x: number, y: number, span: number, dark: string, mid: string, rim: string, seed: number): void {
  for (let dx = -8; dx < span + 8; dx++) {
    const t = dx / span, env = Math.max(0, Math.sin(Math.max(0, Math.min(1, t)) * Math.PI));
    const top = y - env * 6 - noise1(dx * 0.08, seed) * 4, bottom = y + env * 4 + noise1(dx * 0.05, seed + 3) * 2;
    for (let py = Math.floor(top) - 2; py < bottom + 2; py++) {
      const inside = Math.min(py - top, bottom - py);
      const dens = inside >= 2 ? 0.95 : inside >= 0 ? 0.6 : 0.15;
      if (hash(dx, py, seed + 40) > dens * (env * 0.7 + 0.3)) continue;
      g.set(py < top + 1.5 ? rim : py > y + 1 ? dark : mid, x + dx, py);
    }
  }
}

function skyCatemaco(g: Lienzo, w: number): void {
  ramp(g, [C.void, C.deep, C.night, C.dusk, C.mtn0, C.teal0, C.fog0], 0, 215, w);
  stars(g, w, w * 0.5, 150, 3);
  moon(g, Math.round(w * 0.68), 66, 15, C.mtn1, [C.mtn2, C.mtn3, C.wa4], C.mtn2);
  for (let n = 0; n < 7; n++) {
    cloudBank(g, n / 7 * w - 30 + hash(n, 0, 5) * 40, 96 + hash(n, 1, 5) * 70, 70 + hash(n, 2, 5) * 80, C.night, C.mtn0, C.mtn1, n);
  }
  // Resplandor cálido del pueblo sobre el horizonte.
  for (let y = 175; y < 215; y++) for (let x = 0; x < w; x++) g.veil(C.te0, x, y, (y - 175) / 40 * 0.35 * noise1(x * 0.01, 2));
}

function skyCampamento(g: Lienzo, w: number): void {
  ramp(g, [C.ink, C.void, C.deep, C.night, C.dusk, C.mtn0], 0, 220, w);
  stars(g, w, w * 0.35, 120, 11);
  moon(g, Math.round(w * 0.22), 52, 12, C.mtn0, [C.mtn1, C.mtn2, C.mtn3], C.mtn1);
  for (let n = 0; n < 6; n++) cloudBank(g, n / 6 * w + hash(n, 0, 9) * 50, 70 + hash(n, 1, 9) * 60, 90 + hash(n, 2, 9) * 70, C.deep, C.night, C.mtn0, n + 20);
  // El campamento tiñe la niebla de rojo hacia la derecha.
  for (let y = 120; y < 220; y++) for (let x = Math.floor(w * 0.45); x < w; x++) {
    const k = ((x - w * 0.45) / (w * 0.55)) * ((y - 120) / 100);
    g.veil(k > 0.45 ? C.te1 : C.te0, x, y, k * 0.55);
  }
  // Bandas de neblina espesa, alargadas.
  for (let y = 140; y < 220; y++) for (let x = 0; x < w; x++) {
    if (noise2(x * 0.008, y * 0.25, 4) > 0.6) g.veil(y > 185 ? C.fog0 : C.teal0, x, y, 0.3);
  }
}

function skyAltar(g: Lienzo, w: number): void {
  ramp(g, [C.ink, C.pu0, C.ink, C.void, C.deep, C.fo1], 0, 220, w);
  stars(g, w, w * 0.4, 170, 21);
  // Aurora enfermiza: cortinas de rayos verticales que ondulan, verdes y moradas.
  for (const [band, base, seed] of [[0, 34, 1], [1, 66, 2], [2, 48, 5]] as const) {
    for (let x = 0; x < w; x++) {
      const s = noise1(x * 0.012, seed + 4);
      if (s < 0.38) continue;
      const y0 = base + Math.sin(x * 0.009 + band * 2) * 18 + noise1(x * 0.025, seed) * 14;
      const ray = noise1(x * 0.3, seed + 7);
      const len = 16 + ray * 52 * s;
      for (let dy = 0; dy < len; dy++) {
        const t = dy / len, k = (s - 0.38) * 1.5 * (1 - t) * (0.35 + ray * 0.65);
        const c = band === 1 ? (t < 0.15 ? C.pu3 : t < 0.5 ? C.pu2 : C.pu1) : (t < 0.12 ? C.fo5 : t < 0.45 ? C.fo4 : C.fo3);
        g.veil(c, x, y0 + dy, Math.min(0.6, k));
      }
    }
  }
  // Astro eclipsado: disco negro con corona morada y fleco verde. No es la luna amable del pueblo.
  const ex = Math.round(w * 0.55), ey = 92, r = 22;
  for (let y = ey - 60; y < ey + 60; y++) for (let x = ex - 60; x < ex + 60; x++) {
    const d = Math.hypot(x - ex, y - ey), a = Math.atan2(y - ey, x - ex);
    const flare = r + 4 + Math.abs(Math.sin(a * 5 + 1)) * 9 + noise1(a * 6 + 9, 3) * 10;
    if (d <= r) g.set(d > r - 1.5 ? C.pu1 : C.ink, x, y);
    else if (d < r + 2) g.set(C.pu3, x, y);
    else if (d < flare) g.veil(d < r + 6 ? C.pu2 : C.pu1, x, y, 0.75 - (d - r) / (flare - r) * 0.6);
    else if (d < flare + 14) g.veil(C.fo3, x, y, 0.18);
  }
  for (let n = 0; n < 5; n++) cloudBank(g, n / 5 * w + hash(n, 0, 31) * 60, 150 + hash(n, 1, 31) * 40, 100 + hash(n, 2, 31) * 60, C.pu0, C.ink, C.pu1, n + 50);
}

/* ============================ CAPA 1: LEJANÍA ============================ */

/** Agua de la laguna con reflejos horizontales tramados. */
function lake(g: Lienzo, w: number, y0: number, y1: number, glitterX: number[], glitter: string, seed: number): void {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    for (let x = 0; x < w; x++) {
      g.set(bayer(x, y) < t * 0.8 ? C.void : C.deep, x, y);
      if (noise2(x * 0.06, y * 0.9, seed) > 0.7) g.set(C.night, x, y);
      if (noise2(x * 0.09, y * 1.3, seed + 2) > 0.8) g.set(C.mtn0, x, y);
    }
  }
  // Columna de luz de luna rota en trazos.
  for (const gx of glitterX) for (let y = y0 + 1; y < y1; y++) {
    const spread = 4 + (y - y0) * 0.5;
    for (let k = 0; k < 3; k++) {
      const len = 2 + Math.floor(hash(y, k, seed) * 6), x = gx + (hash(k, y, seed + 1) - 0.5) * spread * 2;
      if (hash(y, k, seed + 2) < 0.75 && y % 2 === 0) g.rect(k === 0 ? glitter : C.mtn1, x, y, len, 1);
    }
  }
  g.rect(C.mtn1, 0, y0, w, 1);
}

function cone(g: Lienzo, w: number, cx: number, peak: number, base: number, spread: number, body: string, rim: string, seed: number): void {
  for (let x = Math.floor(cx - spread * 2.4); x < cx + spread * 2.4; x++) {
    if (x < 0 || x >= w) continue;
    const d = Math.abs(x - cx) / spread;
    const top = Math.round(base - (base - peak) / (1 + d * d * 1.6) + noise1(x * 0.05, seed) * 5);
    // Cráter achatado de volcán.
    const crater = d < 0.12 ? 2 : 0;
    g.rect(body, x, top + crater, 1, base - top - crater);
    if (x < cx && hash(x, 3, seed) > 0.25) g.rect(rim, x, top + crater, 1, 1 + (hash(x, 4, seed) > 0.6 ? 1 : 0));
    // Barrancas iluminadas en la ladera izquierda.
    for (let y = top + 4; y < base; y += 3) if (x < cx && noise2(x * 0.15, y * 0.2, seed) > 0.72) g.set(rim, x, y);
  }
}

function farCatemaco(g: Lienzo, w: number): void {
  // Sierra de Los Tuxtlas: volcanes escalonados detrás de la laguna.
  cone(g, w, w * 0.18, 112, 190, 90, C.night, C.mtn0, 1);
  cone(g, w, w * 0.52, 98, 190, 120, C.night, C.mtn0, 2);
  cone(g, w, w * 0.86, 120, 190, 80, C.night, C.mtn0, 3);
  for (let x = 0; x < w; x++) {
    const top = Math.round(160 + noise1(x * 0.02, 8) * 14);
    g.rect(C.dusk, x, top, 1, 182 - top);
    if (hash(x, 2, 8) > 0.5) g.set(C.mtn1, x, top);
  }
  lake(g, w, 181, 214, [Math.round(w * 0.6)], C.mtn3, 3);
  // Isla en la laguna con su arboleda.
  const ix = Math.round(w * 0.38);
  g.ellipse(C.ink, ix, 192, 34, 5);
  for (let k = 0; k < 14; k++) g.ellipse(k % 3 ? C.fo0 : C.fo1, ix - 26 + k * 4, 187 - hash(k, 1, 4) * 6, 4 + hash(k, 2, 4) * 3, 4);
  g.rect(C.mtn0, ix - 30, 197, 60, 1);
  // Bruma pegada al agua, en jirones horizontales.
  for (let y = 176; y < 200; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.012, y * 0.35, 6) > 0.6) g.veil(C.fog0, x, y, 0.35);
}

function farCampamento(g: Lienzo, w: number): void {
  for (let x = 0; x < w; x++) {
    const top = Math.round(150 + noise1(x * 0.008, 3) * 26 + noise1(x * 0.04, 4) * 6);
    g.rect(C.deep, x, top, 1, 180 - top);
    if (hash(x, 1, 3) > 0.6) g.set(C.night, x, top);
  }
  lake(g, w, 179, 214, [Math.round(w * 0.2), Math.round(w * 0.24)], C.mtn2, 9);
  // Reflejo rojizo del campamento en el agua lejana.
  for (let y = 182; y < 214; y += 2) for (let x = Math.floor(w * 0.7); x < w * 0.92; x++) {
    if (hash(x, y, 77) < 0.08) g.rect(y % 4 ? C.te1 : C.te0, x, y, 3, 1);
  }
  for (let y = 160; y < 205; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.008, y * 0.3, 8) > 0.6) g.veil(C.fog0, x, y, 0.3);
}

function farAltar(g: Lienzo, w: number): void {
  for (let x = 0; x < w; x++) {
    const top = Math.round(128 + noise1(x * 0.01, 5) * 38 + noise1(x * 0.05, 6) * 7);
    g.rect(C.ink, x, top, 1, 215 - top);
    if (hash(x, 1, 5) > 0.4) g.set(C.pu1, x, top);
    // Copas redondeadas en la silueta.
    if (hash(Math.floor(x / 6), 2, 5) > 0.5) g.set(C.ink, x, top - 1);
  }
  // Montículo ceremonial lejano: pirámide escalonada de tierra.
  const px = Math.round(w * 0.78);
  for (let s = 0; s < 6; s++) g.rect(s % 2 ? C.pu0 : C.ink, px - 46 + s * 7, 150 + s * 9 - 54 + 40, 92 - s * 14, 9);
  for (let y = 150; y < 215; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.02, y * 0.2, 2) > 0.55) g.veil(C.fo2, x, y, 0.25);
}

/* =========================== CAPA 2: PLANO MEDIO =========================== */

function palmSilhouette(g: Lienzo, x: number, foot: number, h: number, seed: number, trunk: string, leaf: string): void {
  for (let dy = 0; dy < h; dy++) g.rect(trunk, x + Math.sin(dy / h * 1.3) * 6, foot - dy, 2, 1);
  const tx = x + Math.sin(1.3) * 6, ty = foot - h;
  for (let n = 0; n < 7; n++) {
    const a = -Math.PI + n * Math.PI / 6 + (hash(n, seed) - 0.5) * 0.3, len = 14 + hash(n, 2, seed) * 10;
    for (let s = 0; s < len; s++) g.rect(leaf, tx + Math.cos(a) * s, ty + Math.sin(a) * s * 0.4 + (s / len) ** 2 * 9, 2, 1);
  }
}

function midCatemaco(g: Lienzo, w: number): void {
  // Pueblo trepando la ladera de la otra orilla: cubos con ventanas cálidas.
  // Pueblo en la otra orilla: cubos pequeños con ventanas cálidas, dejando ver la laguna abajo.
  for (let n = 0, x = 0; x < w; n++) {
    const bw = 10 + Math.floor(hash(n, 1, 12) * 14), bh = 8 + Math.floor(hash(n, 2, 12) * 12);
    const base = 186 - Math.round(noise1(x * 0.008, 2) * 10);
    if (hash(n, 4, 12) > 0.22) {
      g.rect(C.night, x, base - bh, bw, bh);
      g.rect(C.mtn0, x, base - bh, 2, bh);
      for (let k = 0; k < 3; k++) g.rect(k === 0 ? C.te1 : C.te0, x - 1 + k, base - bh - 3 + k, bw + 2 - k * 2, 1);
      for (let wx = x + 3; wx < x + bw - 2; wx += 4) for (let wy = base - bh + 3; wy < base - 2; wy += 5) {
        const lit = hash(wx, wy, 13);
        if (lit > 0.6) g.rect(lit > 0.88 ? C.wa3 : C.wa1, wx, wy, 1, 2);
      }
      // Reflejo de ventanas en el agua.
      if (hash(n, 5, 12) > 0.5) for (let ry = base + 3; ry < base + 14; ry += 2) g.rect(C.wa0, x + bw / 2 + (ry % 3) - 1, ry, 2, 1);
    }
    x += bw + Math.floor(hash(n, 3, 12) * 8);
  }
  // Templo ficticio de fachada clara a la luz de la luna (no copia la basílica real).
  const cx = Math.round(w * 0.47), b = 188;
  g.rect(C.mtn0, cx - 16, b - 46, 32, 46); g.rect(C.mtn1, cx - 14, b - 44, 28, 44);
  for (const tx of [cx - 23, cx + 15]) {
    g.rect(C.mtn1, tx, b - 68, 8, 68); g.rect(C.mtn2, tx, b - 68, 2, 68);
    g.rect(C.mtn2, tx - 1, b - 70, 10, 2); g.ellipse(C.mtn1, tx + 4, b - 74, 4, 5); g.set(C.wa3, tx + 4, b - 81); g.rect(C.wa3, tx + 3, b - 79, 3, 1);
    g.rect(C.night, tx + 2, b - 62, 4, 6); g.rect(C.wa2, tx + 3, b - 60, 2, 3);
  }
  g.ellipse(C.mtn2, cx, b - 46, 10, 6); g.rect(C.mtn1, cx - 9, b - 46, 18, 3);
  g.ellipse(C.night, cx, b - 16, 5, 7); g.rect(C.night, cx - 5, b - 16, 11, 16); g.rect(C.wa1, cx - 3, b - 13, 7, 13);
  g.rect(C.wa3, cx - 1, b - 36, 3, 3);
  for (let ry = b + 2; ry < b + 22; ry += 2) g.rect(ry % 4 ? C.mtn1 : C.wa0, cx - 6 + (ry % 5), ry, 10 - (ry - b) / 3, 1);
  // Lanchas de pescadores fondeadas en la laguna.
  for (let k = 0; k < 6; k++) {
    const bx = hash(k, 8, 2) * w, by = 194 + hash(k, 9, 2) * 10;
    g.rect(C.ink, bx, by, 12, 2); g.rect(C.ink, bx + 2, by + 2, 8, 1); g.set(C.mtn1, bx, by);
    if (k % 2) { g.rect(C.ink, bx + 5, by - 7, 1, 7); g.set(C.wa2, bx + 5, by - 8); }
  }
  for (let k = 0; k < 6; k++) palmSilhouette(g, hash(k, 3, 2) * w, 188 - hash(k, 5, 2) * 6, 20 + hash(k, 4, 2) * 12, k, C.void, C.deep);
  for (let y = 178; y < 205; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.01, y * 0.3, 14) > 0.62) g.veil(C.fog1, x, y, 0.3);
}

function mangrove(g: Lienzo, x: number, base: number, size: number, seed: number, body: string, hi: string): void {
  // Raíces en arco que bajan al agua.
  for (let r = 0; r < 6; r++) {
    const rx = x - size * 0.7 + r * size * 0.28;
    for (let t = 0; t <= 1; t += 0.04) {
      const px = x + (rx - x) * t, py = base - size * 0.55 + Math.sin(t * Math.PI * 0.5) * size * 0.55;
      g.rect(body, px, py, 1, 1);
    }
  }
  g.rect(body, x - 1, base - size * 1.1, 3, size * 0.6);
  for (let k = 0; k < 12; k++) {
    const cx = x + (hash(k, 1, seed) - 0.5) * size * 1.6, cy = base - size * 1.1 - hash(k, 2, seed) * size * 0.5;
    g.ellipse(body, cx, cy, size * 0.35, size * 0.2);
    if (k < 5) g.ellipse(hi, cx - 2, cy - 2, size * 0.18, size * 0.07);
  }
}

function midCampamento(g: Lienzo, w: number): void {
  // Islotes de manglar y palafitos de pescadores.
  for (let k = 0; k < 10; k++) mangrove(g, k / 10 * w * 0.7 + hash(k, 1, 6) * 60, 204, 18 + hash(k, 2, 6) * 12, k, C.void, C.night);
  for (const hx of [w * 0.12, w * 0.33]) {
    const x = Math.round(hx);
    for (let p = 0; p < 4; p++) g.rect(C.void, x + p * 9, 186, 1, 20);
    g.rect(C.void, x - 3, 170, 34, 16);
    for (let k = 0; k < 7; k++) g.rect(C.night, x - 6 + k, 170 - 7 + k, 40 - k * 2, 1);
    g.rect(C.wa1, x + 8, 175, 3, 4);
  }
  // Campamento lejano de la Cofradía: lonas, antorchas y humo rojo sobre una punta de tierra.
  const x0 = Math.round(w * 0.66);
  g.rect(C.ink, x0 - 40, 196, w - x0 + 40, 12);
  for (let k = 0; k < 7; k++) {
    const tx = x0 + k * ((w - x0) / 7), th = 12 + hash(k, 3, 7) * 10;
    for (let y = 0; y < th; y++) g.rect(y > th * 0.5 ? C.te0 : C.ink, tx - y * 0.9, 196 - th + y, y * 1.8 + 1, 1);
    g.rect(C.te1, tx - 2, 190, 4, 6);
    if (k % 2 === 0) { g.rect(C.ea1, tx + 14, 182, 1, 14); g.rect(C.rd1, tx + 13, 180, 3, 2); g.set(C.wa3, tx + 14, 180); }
  }
  // Columnas de humo que se inclinan con el viento, teñidas por las antorchas.
  for (let k = 0; k < 3; k++) {
    const sx = x0 + 30 + k * ((w - x0) / 3);
    for (let y = 192; y > 100; y--) {
      const up = 192 - y, cx = sx + up * 0.35 + Math.sin(y * 0.07 + k) * (2 + up * 0.08), half = 3 + up * 0.12;
      for (let x = Math.floor(cx - half); x < cx + half; x++) {
        if (noise2(x * 0.15, y * 0.1, k + 5) > 0.35) g.veil(up < 40 ? C.te0 : C.st1, x, y, 0.55 * (1 - up / 92));
      }
    }
  }
  for (let y = 170; y < 214; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.01, y * 0.3, 15) > 0.58) g.veil(C.fog0, x, y, 0.32);
}

function ceiba(g: Lienzo, x: number, base: number, h: number, seed: number, body: string, hi: string, crown: string): void {
  // Tronco con contrafuertes y copa en sombrilla.
  for (let y = base - h; y < base; y++) {
    const t = (y - (base - h)) / h, half = 4 + (t > 0.75 ? (t - 0.75) * 60 : 0);
    g.rect(body, x - half, y, half * 2, 1);
    g.set(hi, x - half, y);
  }
  for (let k = 0; k < 16; k++) {
    const cx = x + (hash(k, 1, seed) - 0.5) * h * 1.3, cy = base - h - hash(k, 2, seed) * h * 0.25;
    g.ellipse(crown, cx, cy, 14 + hash(k, 3, seed) * 10, 6 + hash(k, 4, seed) * 4);
  }
}

function midAltar(g: Lienzo, w: number): void {
  for (let x = 0; x < w; x++) {
    const top = Math.round(150 + noise1(x * 0.03, 9) * 30);
    g.rect(C.fo0, x, top, 1, 215 - top);
    if (hash(x, 3, 9) > 0.7) g.set(C.fo1, x, top);
  }
  for (let k = 0; k < 8; k++) ceiba(g, k / 8 * w + hash(k, 1, 4) * 70, 212, 70 + hash(k, 2, 4) * 40, k, C.ink, C.pu0, C.fo0);
  // Lianas colgando entre las copas.
  for (let k = 0; k < 40; k++) {
    const x = hash(k, 5, 4) * w, len = 20 + hash(k, 6, 4) * 60;
    for (let y = 0; y < len; y++) g.set(C.fo1, x + Math.sin(y * 0.15 + k) * 2, 80 + hash(k, 7, 4) * 40 + y);
  }
  for (let y = 170; y < 215; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.012, y * 0.3, 7) > 0.58) g.veil(y > 195 ? C.pu1 : C.pu0, x, y, 0.3);
}

/* ============================ CAPA 3: CERCANO ============================ */

/** Casa lacustre de noche: muros de colores apagados, teja, faroles y ventanas cálidas. */
function house(g: Lienzo, x: number, width: number, h: number, n: number): void {
  const ground = 214, top = ground - h;
  const walls: Array<[string, string, string]> = [
    [C.te0, C.te1, C.te2], [C.tq0, C.fo0, C.tq1], [C.ro0, C.pu0, C.ro1], [C.st2, C.st1, C.st3], [C.ea1, C.ea0, C.ea2],
  ];
  const [wall, shade, hi] = walls[n % walls.length];
  g.rect(C.ink, x - 1, top - 1, width + 2, h + 1);
  g.rect(wall, x, top, width, h);
  g.rect(shade, x + width - 12, top, 12, h);
  g.rect(hi, x, top, 2, h);
  // Salitre y desconchados tramados.
  for (let k = 0; k < width * 1.2; k++) {
    const px = x + hash(k, n, 1) * width, py = top + hash(k, n, 2) * h;
    if (hash(k, n, 3) > 0.45) g.set(shade, px, py);
    if (py > ground - 14 && hash(k, n, 4) > 0.5) g.set(C.st2, px, py);
  }
  g.rect(C.st1, x, ground - 9, width, 9); g.rect(C.st2, x, ground - 9, width, 1);
  // Tejado de teja con hiladas y alero de vigas.
  const rise = 13 + (n % 3) * 3;
  for (let y = 0; y < rise; y++) {
    const inset = Math.floor((rise - y) * 0.7);
    g.rect(C.te0, x + inset - 6, top - rise + y, width - inset * 2 + 12, 1);
    for (let tx = x + inset - 5; tx < x + width - inset + 5; tx += 5) {
      g.rect(y % 4 === 0 ? C.ea0 : (tx + n + y) % 10 < 5 ? C.te1 : C.te2, tx, top - rise + y, 3, 1);
    }
    if (y < 2) g.rect(C.st3, x + inset - 4, top - rise + y, width - inset * 2 + 8, 1);
  }
  g.rect(C.ea0, x - 6, top, width + 12, 3);
  for (let bx = x - 4; bx < x + width + 4; bx += 9) g.rect(C.ea1, bx, top + 3, 2, 3);
  // Puerta de madera y ventanas con luz.
  const dx = x + 10 + (n % 2) * 18;
  g.rect(C.ea0, dx - 1, ground - 40, 20, 40); g.rect(n % 3 === 0 ? C.wa0 : C.ea1, dx, ground - 38, 18, 38);
  for (let k = 3; k < 18; k += 5) g.rect(C.ea0, dx + k, ground - 36, 1, 34);
  if (n % 3 === 0) { g.rect(C.wa1, dx + 2, ground - 36, 14, 4); g.rect(C.wa2, dx + 3, ground - 35, 12, 2); }
  for (let wx = x + 8; wx < x + width - 20; wx += 30) {
    if (Math.abs(wx - dx) < 24) continue;
    const lit = hash(wx, n, 6) > 0.35;
    g.rect(C.ea0, wx - 1, top + 12, 16, 22);
    g.rect(lit ? C.wa1 : C.void, wx, top + 13, 14, 20);
    if (lit) { g.rect(C.wa2, wx + 1, top + 14, 6, 9); g.rect(C.wa3, wx + 2, top + 15, 2, 4); g.rect(C.wa0, wx, top + 26, 14, 7); light(wx + 7, top + 23, 'ventana'); }
    g.rect(C.ea0, wx + 6, top + 13, 2, 20); g.rect(C.ea0, wx, top + 22, 14, 1);
    // Postigos y reja.
    g.rect(shade, wx - 5, top + 13, 4, 20); g.rect(shade, wx + 15, top + 13, 4, 20);
    for (let k = 0; k < 14; k += 3) g.rect(C.ink, wx + k, top + 13, 1, 20);
    g.rect(C.st3, wx - 3, top + 33, 20, 2);
  }
  // Farol de pared encendido (el decorado añade el halo que late).
  const lx = dx + 24;
  g.rect(C.ink, lx, ground - 46, 6, 1); g.rect(C.ink, lx + 4, ground - 46, 1, 3);
  g.rect(C.ea0, lx + 2, ground - 43, 7, 10); g.rect(C.wa2, lx + 3, ground - 42, 5, 7); g.rect(C.wa4, lx + 4, ground - 41, 2, 4);
  light(lx + 5, ground - 39, 'farol');
  // Letrero de los brujos de Catemaco en algunas fachadas.
  if (n % 4 === 1) {
    const sx = x + width - 50, sy = top + 6;
    g.rect(C.ea0, sx - 1, sy - 1, 42, 10); g.rect(C.st5, sx, sy, 40, 8);
    miniText(g, C.te0, 'LIMPIAS', sx + 3, sy + 2);
    g.ellipse(C.pu1, sx + 34, sy + 4, 2, 2); g.set(C.wa3, sx + 34, sy + 4);
  }
  // Macetas con albahaca y ruda.
  for (let k = 0; k < 2; k++) {
    const px = x + width - 10 - k * 13;
    g.rect(C.te1, px, ground - 8, 7, 7); g.rect(C.te2, px - 1, ground - 9, 9, 2);
    g.ellipse(C.fo2, px + 3, ground - 13, 4, 3); g.set(C.fo4, px + 2, ground - 15);
  }
}

function nearCatemaco(g: Lienzo, w: number): void {
  const at = (f: number) => Math.round(w * f);
  palmSilhouette(g, at(0.02), 214, 92, 1, C.ea0, C.fo1);
  let x = at(0.06);
  for (let n = 0; x < at(0.5); n++) {
    const bw = 96 + Math.floor(hash(n, 1, 33) * 46), bh = 70 + Math.floor(hash(n, 2, 33) * 32);
    house(g, x, bw, bh, n);
    x += bw + 14 + Math.floor(hash(n, 3, 33) * 26);
    if (n === 1) { palmSilhouette(g, x - 8, 214, 84, n, C.ea0, C.fo1); x += 18; }
  }
  // Hueco del malecón: la laguna y la isla se ven a través. Barandal y faroles de poste.
  for (let bx = at(0.53); bx < at(0.74); bx += 4) { g.rect(C.st2, bx, 200, 2, 14); g.set(C.st4, bx, 200); }
  g.rect(C.st3, at(0.53), 198, at(0.74) - at(0.53), 3); g.rect(C.st5, at(0.53), 198, at(0.74) - at(0.53), 1);
  for (const px of [at(0.55), at(0.645), at(0.73)]) {
    g.rect(C.ink, px, 140, 3, 74); g.rect(C.st2, px, 140, 1, 74);
    g.rect(C.ink, px - 4, 132, 11, 9); g.rect(C.wa2, px - 3, 133, 9, 7); g.rect(C.wa4, px - 1, 134, 4, 4);
    g.rect(C.ink, px - 5, 130, 13, 2);
    light(px + 1, 136, 'farol');
  }
  x = at(0.77);
  for (let n = 5; x < w - 40; n++) {
    const bw = 100 + Math.floor(hash(n, 1, 34) * 40), bh = 66 + Math.floor(hash(n, 2, 34) * 30);
    house(g, x, bw, bh, n);
    x += bw + 18;
  }
  palmSilhouette(g, w - 30, 214, 88, 7, C.ea0, C.fo1);
  // Cable con papel picado oscuro sobre la calle de los brujos.
  for (let x0 = at(0.05); x0 < at(0.48); x0 += 160) {
    for (let dx = 0; dx < 160; dx++) {
      const y = 108 + Math.sin(dx / 160 * Math.PI) * 12;
      g.set(C.ink, x0 + dx, y);
      if (dx % 12 < 8 && dx > 6 && dx < 154) g.rect([C.ro0, C.pu0, C.te0, C.tq0][Math.floor(dx / 12) % 4], x0 + dx, y + 1, 1, 7 - (dx % 12 === 3 ? 2 : 0));
    }
  }
}

/** Lona de la Cofradía con símbolo del Espejo Negro. */
function tent(g: Lienzo, x: number, w: number, h: number, seed: number): void {
  const base = 214;
  for (let y = 0; y < h; y++) {
    const half = (w / 2) * (y / h) + 2;
    g.rect(y < 2 ? C.te1 : C.te0, x - half, base - h + y, half * 2, 1);
    g.set(C.ink, x - half - 1, base - h + y); g.set(C.ink, x + half, base - h + y);
    if (y > h * 0.3 && hash(y, 1, seed) > 0.6) g.set(C.ea0, x - half + hash(y, 2, seed) * half * 2, base - h + y);
  }
  // Entrada abierta con luz roja dentro.
  for (let y = 0; y < h * 0.55; y++) {
    const half = y * 0.45;
    g.rect(y > h * 0.25 ? C.rd0 : C.te1, x - half, base - h * 0.55 + y, half * 2 + 1, 1);
  }
  g.rect(C.ea1, x, base - h - 6, 1, 8);
  light(x, base - h * 0.2, 'antorcha');
  // Espejo Negro: disco de obsidiana con aro rojo.
  g.ellipse(C.rd0, x - w * 0.25, base - h * 0.45, 5, 5); g.ellipse(C.st0, x - w * 0.25, base - h * 0.45, 3, 3);
  g.set(C.st3, x - w * 0.25 - 1, base - h * 0.45 - 2);
}

function nearCampamento(g: Lienzo, w: number): void {
  const at = (f: number) => Math.round(w * f);
  // Muelles sobre pilotes que entran a la laguna (vista lateral).
  for (const [x0, len] of [[at(0.04), 150], [at(0.3), 120]] as const) {
    for (let p = 0; p <= len; p += 22) {
      g.rect(C.ink, x0 + p, 182, 3, 24); g.rect(C.ea1, x0 + p, 182, 1, 24);
      g.rect(C.mtn0, x0 + p - 2, 204, 7, 1); // anillo de agua en el pilote
      if (p % 44 === 0) { g.rect(C.ea1, x0 + p, 168, 2, 14); g.set(C.ea3, x0 + p, 168); }
    }
    g.rect(C.ea0, x0 - 2, 178, len + 6, 5); g.rect(C.ea2, x0 - 2, 178, len + 6, 1);
    for (let k = 0; k < len; k += 7) g.set(C.ea0, x0 + k, 179);
    g.line(C.ea2, x0, 172, x0 + len, 172);
    // Lancha amarrada con su cuerda, flotando sobre su reflejo.
    const bx = x0 + len * 0.45;
    for (let y = 0; y < 6; y++) g.rect(y === 0 ? C.st3 : y < 3 ? C.tq0 : C.ink, bx - 18 + y, 195 + y, 40 - y * 2 + (y < 2 ? 4 : 0), 1);
    g.rect(C.st4, bx - 16, 195, 34, 1); g.line(C.ea2, bx + 20, 195, bx + 26, 182);
    for (let ry = 202; ry < 205; ry++) g.rect(C.mtn0, bx - 14 + (ry % 2) * 3, ry, 26, 1);
  }
  // Manglares cercanos y juncos.
  for (const mx of [at(0.2), at(0.45), at(0.52), at(0.98)]) mangrove(g, mx, 214, 30 + hash(mx, 1) * 10, mx, C.ink, C.fo1);
  for (let k = 0; k < 70; k++) {
    const x = hash(k, 1, 18) * w, h = 10 + hash(k, 2, 18) * 22;
    for (let s = 0; s < 4; s++) g.line(s % 2 ? C.fo1 : C.fo0, x + s * 2, 214, x + s * 2 + (hash(k, s, 3) - 0.5) * 6, 214 - h + s * 3);
    if (hash(k, 4, 18) > 0.6) g.rect(C.ea1, x + 3, 214 - h - 2, 2, 5);
  }
  // Campamento de la Cofradía: lonas, estandartes con el Espejo Negro y antorchas (las llamas laten en código).
  const c0 = at(0.6);
  for (let k = 0; k < 6; k++) tent(g, c0 + 20 + k * at(0.066) + hash(k, 1, 4) * 20, 76 + hash(k, 2, 4) * 34, 54 + hash(k, 3, 4) * 22, k);
  for (let k = 0; k < 5; k++) {
    const bx = c0 - 30 + k * at(0.085);
    g.rect(C.ea0, bx, 140, 2, 74); g.rect(C.ea0, bx - 8, 142, 18, 2);
    for (let y = 144; y < 178; y++) g.rect(y > 172 && (y + bx) % 3 === 0 ? C.ink : C.te0, bx - 7, y, 16 - (y > 174 ? (y - 174) * 2 : 0), 1);
    g.ellipse(C.rd0, bx + 1, 158, 5, 5); g.ellipse(C.st0, bx + 1, 158, 3, 3); g.set(C.st4, bx, 156);
    // Antorcha de poste junto al estandarte.
    const tx = bx + 16;
    g.rect(C.ea0, tx, 168, 2, 46); g.rect(C.ea1, tx - 1, 164, 4, 5);
    g.rect(C.rd0, tx - 1, 159, 4, 5); g.rect(C.rd1, tx, 158, 2, 4); g.set(C.wa3, tx, 161);
    light(tx + 1, 160, 'antorcha');
  }
  // Empalizada baja que separa el campamento de la orilla.
  for (let px = c0 - 60; px < w; px += 5) { g.rect(C.ea0, px, 196 - (px % 3), 3, 18 + (px % 3)); g.set(C.ea2, px, 196 - (px % 3)); }
  g.rect(C.ea1, c0 - 60, 202, w - c0 + 60, 2);
}

function stela(g: Lienzo, x: number, base: number, h: number, seed: number, body: string, hi: string, glyph: string): void {
  const wd = Math.round(h * 0.42);
  g.rect(C.ink, x - 1, base - h - 1, wd + 2, h + 1);
  g.rect(body, x, base - h, wd, h);
  g.ellipse(body, x + wd / 2, base - h, wd / 2, 4);
  g.rect(hi, x, base - h, 2, h);
  // Relieve olmeca: rostro de perfil, tocado y bandas.
  g.rect(glyph, x + 4, base - h + 8, wd - 8, 1); g.rect(glyph, x + 4, base - h + 22, wd - 8, 1);
  g.ellipse(glyph, x + wd / 2, base - h + 15, 4, 4); g.set(body, x + wd / 2, base - h + 15);
  for (let y = base - h + 28; y < base - 6; y += 6) g.rect(glyph, x + 4 + (y % 4), y, wd - 10, 1);
  for (let k = 0; k < h; k++) if (hash(k, seed, 2) > 0.8) g.set(C.fo2, x + hash(k, seed, 3) * wd, base - hash(k, seed, 4) * h * 0.5);
}

function nearAltar(g: Lienzo, w: number): void {
  const at = (f: number) => Math.round(w * f);
  // Troncos colosales con corteza, musgo y raíces tabulares; la aurora los perfila por la derecha.
  for (let k = 0; k < 5; k++) {
    const x = Math.round(at(0.03 + k * 0.135) + hash(k, 1, 8) * 40), wd = Math.round(26 + hash(k, 2, 8) * 18);
    for (let y = 0; y < 214; y++) {
      const flare = y > 150 ? Math.round(((y - 150) / 64) ** 2 * 22) : 0, sway = Math.round(Math.sin(y * 0.02 + k) * 2);
      const x0 = x - flare + sway, x1 = x + wd + flare + sway;
      g.set(C.ink, x0 - 1, y); g.set(C.ink, x1, y);
      for (let px = x0; px < x1; px++) {
        const u = (px - x0) / (x1 - x0), bark = noise2(px * 0.5, y * 0.05, k);
        let c: string = bark > 0.62 ? C.ea1 : bark < 0.25 ? C.ink : C.ea0;
        if (u > 0.86) c = bayer(px, y) < 0.5 ? C.pu0 : C.ea0;
        if (u > 0.94 && y < 200) c = C.pu1;
        if (u < 0.12 && noise2(px * 0.2, y * 0.1, k + 3) > 0.55) c = C.fo1;
        g.set(c, px, y);
      }
      if (noise2(x * 0.1, y * 0.06, k + 9) > 0.7) g.rect(C.fo2, x0 + 2, y, Math.round(wd * 0.25), 1);
    }
    // Raíces tabulares que se abren sobre el suelo.
    for (const dir of [-1, 1]) for (let r = 0; r < 2; r++) {
      const reach = 18 + r * 14 + hash(k, r, 4) * 10;
      for (let t = 0; t < reach; t++) {
        const hgt = (reach - t) * 0.8;
        const rx = dir < 0 ? x - 22 - t : x + wd + 22 + t;
        g.rect(C.ea0, rx, 214 - hgt, 2, hgt); g.set(dir > 0 ? C.pu0 : C.ea1, rx, 214 - hgt);
      }
    }
  }
  // Dosel cerrado arriba: hojas oscuras con bordes tocados por la aurora.
  const open = at(0.64); // el dosel se abre sobre el claro ceremonial: se ve el astro eclipsado
  for (let x = 0; x < w; x++) {
    const fade = x > open ? (x - open) * 0.35 : 0;
    const bottom = Math.round(18 + noise1(x * 0.03, 2) * 26 + noise1(x * 0.11, 3) * 8 - fade);
    if (bottom < 2) continue;
    g.rect(C.ink, x, 0, 1, bottom);
    for (let y = bottom - 6; y < bottom + 3; y++) if (hash(x, y, 7) > 0.45 + (y - bottom + 6) * 0.06) g.set(C.fo0, x, y);
    if (hash(x, 9, 7) > 0.55) g.set(C.fo1, x, bottom - 2);
    if (hash(x, 10, 7) > 0.9) g.set(C.fo3, x, bottom - 1);
  }
  // Lianas del dosel con hojas.
  for (let k = 0; k < 28; k++) {
    const lx = hash(k, 1, 12) * open, len = 30 + hash(k, 2, 12) * 110;
    for (let y = 20; y < 20 + len; y++) {
      const px = lx + Math.sin(y * 0.05 + k) * 4;
      g.set(C.ink, px, y);
      if (y % 7 === 0) { g.rect(C.fo1, px - 2, y, 2, 1); g.set(C.fo2, px - 2, y - 1); }
    }
  }
  // Claro ceremonial al final: muro de piedra, estelas y braseros.
  const c0 = at(0.7);
  for (let x = c0; x < w; x++) {
    const top = 176 + Math.round(noise1(x * 0.1, 3) * 3);
    g.rect(C.st1, x, top, 1, 214 - top);
    if ((x - c0) % 14 === 0) g.rect(C.ink, x, top, 1, 214 - top);
    g.set(C.st3, x, top);
  }
  for (let y = 182; y < 214; y += 8) g.rect(C.ink, c0, y, w - c0, 1);
  for (let k = 0; k < 5; k++) stela(g, c0 + 20 + k * ((w - c0 - 50) / 4), 212, 50 + (k % 2) * 16, k, C.st2, C.st3, C.st1);
  // Braseros sobre el muro, entre estelas.
  for (let k = 0; k < 4; k++) {
    const bx = Math.round(c0 + 20 + (k + 0.5) * ((w - c0 - 50) / 4) + 10);
    g.rect(C.st0, bx - 5, 170, 11, 5); g.rect(C.st2, bx - 4, 170, 9, 1); g.rect(C.st0, bx - 1, 175, 3, 3);
    g.rect(C.rd0, bx - 3, 167, 7, 3); g.rect(C.rd1, bx - 2, 166, 5, 2); g.set(C.wa3, bx, 166);
    light(bx, 166, 'brasa');
  }
  // Raíces que trepan el muro y musgo morado de la corrupción.
  for (let k = 0; k < 18; k++) {
    const x = c0 + hash(k, 1, 6) * (w - c0);
    for (let y = 214; y > 180 - hash(k, 2, 6) * 20; y--) g.set(k % 3 ? C.ea1 : C.pu1, x + Math.sin(y * 0.3 + k) * 2, y);
  }
}

/* ================================ DESPACHO ================================ */

/** Posiciones de las luces pintadas en la capa 3 (para halos animados del decorado). */
export function catemacoLayerLights(section: CatemacoSection, width: number): CatemacoLight[] {
  lights = [];
  drawCatemacoLayer(section, 3, width);
  const out = lights;
  lights = null;
  return out;
}

/** Dibuja una capa completa (0–5) de una sección en un lienzo nuevo de width × 360. */
export function drawCatemacoLayer(section: CatemacoSection, index: number, width: number, height = 360): Lienzo {
  const g = new Lienzo(width, height);
  const table: Record<CatemacoSection, Array<(g: Lienzo, w: number) => void>> = {
    catemaco: [skyCatemaco, farCatemaco, midCatemaco, nearCatemaco],
    campamento: [skyCampamento, farCampamento, midCampamento, nearCampamento],
    altar_olmeca: [skyAltar, farAltar, midAltar, nearAltar],
  };
  if (index < 4) table[section][index](g, width);
  else if (index === 4) drawCatemacoGround(g, section, width);
  else drawCatemacoForeground(g, section, width);
  return g;
}
