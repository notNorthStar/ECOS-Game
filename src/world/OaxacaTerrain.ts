/**
 * Suelo (capa 4) y primer plano (capa 5) del Nivel 4. La franja transitable y = 220…345 queda
 * siempre legible: el escombro y la mercancía del suelo son planos (no parecen obstáculos).
 * Las colisiones reales las ponen los JSON de nivel.
 */
import { C, Lienzo, hash, noise1, patronOn } from './OaxacaPixels';
import { OAXACA_LANDMARKS, atWorld, type OaxacaSection } from './OaxacaLandscape';

/* ================================ SUELOS ================================ */

/** Empedrado irregular: piedras de río redondeadas, más grandes hacia la cámara. */
function cobbles(g: Lienzo, x0: number, x1: number, y0: number, y1: number, cols: string[], hi: string, gap: string, seed: number): void {
  g.rect(gap, x0, y0, x1 - x0, y1 - y0);
  for (let y = y0, row = 0; y < y1; row++) {
    const h = 5 + Math.floor((y - y0) / 28);
    let x = x0 - (row % 2) * 6;
    while (x < x1) {
      const w = 8 + Math.floor(hash(x, row, seed) * 8) + Math.floor((y - y0) / 30);
      const c = cols[Math.floor(hash(x, row, seed + 1) * cols.length)];
      g.rect(c, x + 1, y + 1, w - 2, h - 1); g.rect(c, x + 2, y, w - 4, 1);
      g.rect(hi, x + 2, y, Math.max(1, w - 6), 1);
      if (hash(x, row, seed + 2) > 0.75) g.set(gap, x + w - 3, y + 2);
      x += w;
    }
    y += h;
  }
}

/** Banqueta de losas de cantera verde con su guarnición. */
function banqueta(g: Lienzo, x0: number, x1: number, seed: number): void {
  for (let x = x0; x < x1; x += 28) {
    const c = hash(x, 1, seed) > 0.7 ? C.fog0 : C.fog1;
    g.rect(c, x, 206, 27, 10); g.rect(C.fog2, x + 1, 206, 25, 1); g.rect(C.mtn0, x + 27, 206, 1, 10);
    if (hash(x, 3, seed) > 0.6) g.line(C.mtn0, x + 4, 207, x + 12, 214);
    if (hash(x, 4, seed) > 0.7) g.rect(C.fo2, x + 20, 214, 3, 1);
  }
  g.rect(C.fog0, x0, 216, x1 - x0, 2); g.rect(C.mtn0, x0, 218, x1 - x0, 1);
}

/** Losas grandes de una plaza o explanada, con hiladas que crecen hacia la cámara. */
function losas(g: Lienzo, x0: number, x1: number, y0: number, y1: number, cols: string[], hi: string, gap: string, seed: number): void {
  for (let y = y0, row = 0; y < y1; row++) {
    const h = 9 + Math.floor((y - y0) / 20);
    let x = x0 - (row % 2) * 14;
    while (x < x1) {
      const lw = 34 + Math.floor(hash(x, row, seed) * 30) + Math.floor((y - y0) / 6), c = cols[Math.floor(hash(x, row, seed + 1) * cols.length)];
      g.rect(gap, x, y, lw, h); g.rect(c, x + 1, y + 1, lw - 2, h - 2); g.rect(hi, x + 1, y + 1, lw - 3, 1);
      if (hash(x, row, seed + 2) > 0.7) g.line(gap, x + 5, y + 2, x + 12, y + h - 2);
      x += lw;
    }
    y += h;
  }
}

/** Velo de luz cálida o fría sobre lo ya pintado (manchas de luz de faroles, reflejos). */
function glowPool(g: Lienzo, cx: number, cy: number, rx: number, ry: number, c: string, k: number): void {
  for (let y = Math.floor(cy - ry); y < cy + ry; y++) for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d < 1 && g.has(x, y)) g.veil(c, x, y, (1 - d) * k);
  }
}

function charcos(g: Lienzo, x0: number, x1: number, n: number, seed: number, warm: string): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + hash(i, 1, seed) * (x1 - x0), y = 240 + hash(i, 2, seed) * 85, rx = 9 + hash(i, 3, seed) * 14;
    g.ellipse(C.ink, x, y, rx + 1, 3); g.ellipse(C.void, x, y, rx, 2);
    for (let j = 0; j < 6; j++) g.rect(j % 3 ? C.night : warm, x - rx + hash(j, i, seed) * rx * 2, y - 1 + (j % 3), 2 + (j % 3), 1);
  }
}

/** Escombro plano: tejas rotas, piedras, papel picado caído. */
function escombro(g: Lienzo, x0: number, x1: number, density: number, seed: number, papel = true): void {
  for (let k = 0; k < (x1 - x0) * density; k++) {
    const x = x0 + hash(k, 1, seed) * (x1 - x0), y = 222 + hash(k, 2, seed) * 122, r = hash(k, 3, seed);
    if (r < 0.35) { g.rect(C.st0, x, y + 1, 4, 1); g.rect(C.st3, x, y, 3, 1); }
    else if (r < 0.55) { g.rect(C.te1, x, y, 3, 2); g.set(C.te3, x, y); }
    else if (r < 0.7 && papel) g.rect([C.ro2, C.tq2, C.wa2, C.pu2, C.fo4][Math.floor(hash(k, 4, seed) * 5)], x, y, 2, 1);
    else if (r < 0.78) g.set(C.ea3, x, y);
  }
}

function bottomEdge(g: Lienzo, w: number, body: string, grass: string, tip: string, seed: number): void {
  for (let x = 0; x < w; x++) {
    const y = 347 + Math.round(noise1(x * 0.05, seed) * 4);
    g.rect(body, x, y, 1, 360 - y);
    if (hash(x, 1, seed) > 0.5) g.rect(grass, x, y - 2, 1, 3);
    if (hash(x, 2, seed) > 0.88) g.set(tip, x, y - 3);
  }
}

/** Sombra tramada de los muros sobre el empedrado cercano. */
function wallShade(g: Lienzo, x0: number, x1: number, y0: number, y1: number, c: string): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.veil(c, x, y, (y1 - y) / (y1 - y0) * 0.6);
}

function groundOaxaca(g: Lienzo, w: number): void {
  g.rect(C.st1, 0, 205, w, 155);
  banqueta(g, 0, w, 3);
  cobbles(g, 0, w, 219, 360, [C.st1, C.st1, C.st2, C.st0, C.st1, C.st1, C.teal0], C.st2, C.ink, 4);
  // Plaza de las letras: losas de cantera verde con una estrella de telar incrustada.
  const { x0, x1 } = OAXACA_LANDMARKS.plazaLetras;
  losas(g, x0, x1, 228, 312, [C.fog0, C.fog1, C.fog0, C.st2], C.fog2, C.mtn0, 6);
  const cx = (x0 + x1) / 2, cy = 272;
  for (let y = -30; y <= 30; y++) for (let x = -84; x <= 84; x++) {
    const d = Math.hypot(x / 2.8, y);
    if ((d > 26 && d < 27.4) || (d > 29 && d < 30)) g.set(C.fog2, cx + x, cy + y);
    if (d < 22 && patronOn('estrella', Math.floor((x + 84) / 6) - 7, Math.floor((y + 30) / 2) - 8)) g.set(C.fog2, cx + x, cy + y);
  }
  for (let x = x0; x < x1; x++) { g.set(C.fog2, x, 227); g.set(C.mtn0, x, 312); }
  // Rastros del desastre: escombro plano, papel picado caído y charcos con faroles.
  escombro(g, 0, w, 0.12, 5);
  for (const ruinX of [atWorld(600, 1), 1350, 2450]) escombro(g, ruinX - 80, ruinX + 80, 0.6, ruinX);
  charcos(g, 520, w, 10, 3, C.wa1);
  wallShade(g, 0, w, 219, 236, C.st0);
  // Charco de luz del taller (zaguán abierto).
  glowPool(g, OAXACA_LANDMARKS.taller.x - 40, 232, 70, 14, C.wa0, 0.5);
  bottomEdge(g, w, C.ea0, C.fo1, C.fo3, 7);
}

function groundCallejones(g: Lienzo, w: number): void {
  g.rect(C.st0, 0, 205, w, 155);
  banqueta(g, 0, w, 8);
  cobbles(g, 0, w, 219, 360, [C.st1, C.st0, C.st0, C.st1, C.dusk], C.st1, C.ink, 9);
  // Canal de desagüe al centro del callejón.
  for (let x = 0; x < w; x++) { const y = 280 + Math.round(noise1(x * 0.01, 2) * 3); g.rect(C.ink, x, y, 1, 2); if (hash(x, 1, 6) > 0.8) g.set(C.mtn0, x, y); }
  // Piso del mercado: petates tendidos y mercancía tirada.
  const { x0, x1 } = OAXACA_LANDMARKS.mercado;
  for (let k = 0; k < (x1 - x0) / 70; k++) {
    const px = x0 + k * 70 + hash(k, 1, 11) * 20, py = 228 + hash(k, 2, 11) * 90, pw = 34 + hash(k, 3, 11) * 14, ph = 10 + hash(k, 4, 11) * 5;
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const skew = Math.round(y * 0.3);
      if (hash(x, y, k + 40) < 0.12 && (x < 3 || x > pw - 4)) continue; // bordes deshilachados
      g.set((x + y) % 4 < 2 ? C.ea2 : C.ea1, px + x - skew, py + y);
    }
    g.rect(C.ea1, px - Math.round(ph * 0.6), py + ph, pw, 1);
  }
  // Tepalcates de barro negro, maíz regado, flores de cempasúchil y fruta aplastada.
  for (let k = 0; k < (x1 - x0) * 0.5; k++) {
    const x = x0 - 40 + hash(k, 1, 12) * (x1 - x0 + 80), y = 224 + hash(k, 2, 12) * 120, r = hash(k, 3, 12);
    if (r < 0.3) { g.rect(C.st0, x, y, 3, 2); g.set(C.st3, x, y); }
    else if (r < 0.5) g.set(C.wa3, x, y);
    else if (r < 0.62) { g.rect(C.wa1, x, y, 2, 2); g.set(C.wa2, x, y); }
    else if (r < 0.7) g.set(C.ro2, x, y);
  }
  escombro(g, 0, w, 0.1, 13);
  charcos(g, 0, w, 12, 14, C.wa0);
  wallShade(g, 0, w, 219, 240, C.ink);
  bottomEdge(g, w, C.ink, C.fo0, C.fo2, 3);
}

function groundSantoDomingo(g: Lienzo, w: number): void {
  const inside = OAXACA_LANDMARKS.templo.interior;
  g.rect(C.st1, 0, 205, w, 155);
  // Arriate de agaves al pie de la barda.
  for (let x = 0; x < inside; x++) {
    g.rect(C.ea0, x, 205, 1, 10); if (hash(x, 1, 2) > 0.6) g.set(C.ea1, x, 206 + (x % 7));
    g.set(C.fog1, x, 215); g.set(C.fog0, x, 216);
  }
  // Explanada de cantera verde con losas que crecen hacia la cámara.
  losas(g, 0, inside, 217, 360, [C.st1, C.st1, C.st1, C.teal0, C.st2], C.st2, C.st0, 21);
  for (let k = 0; k < inside * 0.2; k++) {
    const x = hash(k, 1, 22) * inside, y = 218 + hash(k, 2, 22) * 126;
    if (g.get(x, y) === C.st0) g.set(C.fo1, x, y); // hierba entre juntas
  }
  escombro(g, 0, inside, 0.08, 23, false);
  // Huellas de fuego fatuo que se arrastran hacia la puerta.
  for (let k = 0; k < 40; k++) {
    const x = inside - 500 + k * 12, y = 270 + Math.sin(k * 0.6) * 12;
    if (k % 2) { g.rect(C.tq0, x, y, 3, 1); g.set(C.tq1, x + 1, y); }
  }
  // Interior: piso de baldosas de barro en perspectiva, en penumbra.
  for (let y = 205, row = 0; y < 360; row++) {
    const h = 5 + Math.floor((y - 205) / 22), tw = h * 3;
    for (let x = inside - (row % 2) * Math.round(tw / 2); x < w; x += tw) {
      const c = hash(x, row, 41) > 0.75 ? C.ea1 : (Math.floor(x / tw) + row) % 2 ? C.ea0 : C.st0;
      g.rect(C.ink, x, y, tw, h); g.rect(c, x + 1, y + 1, tw - 1, h - 1);
      g.rect(c === C.st0 ? C.st1 : C.ea1, x + 1, y + 1, tw - 2, 1);
      if (hash(x, row, 42) > 0.85) g.line(C.ink, x + 2, y + 1, x + tw / 2, y + h - 1);
    }
    y += h;
  }
  // Umbral de cantera.
  g.rect(C.fog0, inside - 6, 205, 10, 155); g.rect(C.fog1, inside - 6, 205, 2, 155);
  // Reflejos dorados al pie de los retablos.
  for (let rx = inside + 80; rx < w; rx += 230) glowPool(g, rx, 224, 60, 12, C.wa0, 0.6);
  // Círculo de fuego fatuo de la arena de la jefa.
  const { x: ax, y: ay } = OAXACA_LANDMARKS.arena;
  for (let y = -40; y <= 40; y++) for (let x = -130; x <= 130; x++) {
    const d = Math.hypot(x / 3, y), a = Math.atan2(y, x / 3);
    if ((d > 37 && d < 39) || (d > 30 && d < 31)) g.set(C.tq1, ax + x, ay + y);
    if (d > 31 && d < 37 && Math.abs(Math.sin(a * 8)) < 0.2) g.set(C.tq2, ax + x, ay + y);
    if (d < 22 && patronOn('greca', Math.floor((x + 130) / 3), Math.floor((y + 40) / 2)) && d > 8) g.set(C.tq0, ax + x, ay + y);
    if (d < 4) g.set(C.tq1, ax + x, ay + y);
  }
  // Cera derretida de veladoras.
  for (let k = 0; k < 14; k++) { const x = inside + hash(k, 1, 33) * (w - inside), y = 220 + hash(k, 2, 33) * 120; g.rect(C.st3, x, y, 2, 1); }
  bottomEdge(g, inside, C.ea0, C.fo1, C.fo3, 5);
  for (let x = inside; x < w; x++) { const y = 349 + Math.round(noise1(x * 0.05, 9) * 3); g.rect(C.ink, x, y, 1, 360 - y); }
}

export function drawOaxacaGround(g: Lienzo, section: OaxacaSection, width: number): void {
  if (section === 'oaxaca') groundOaxaca(g, width);
  else if (section === 'callejones') groundCallejones(g, width);
  else groundSantoDomingo(g, width);
}

/* ============================== PRIMER PLANO ============================== */

function agaveFront(g: Lienzo, x: number, y: number, size: number, dark: string, mid: string): void {
  for (let l = 0; l < 11; l++) {
    const a = -Math.PI / 2 + (l - 5) * 0.27, len = size * (1 - Math.abs(l - 5) * 0.07);
    const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len;
    g.line(dark, x + (l - 5) * 1.5, y, tx, ty, 3);
    g.line(mid, x + (l - 5) * 1.5 - 1, y - 2, tx - 1, ty + 2);
    g.set(C.ink, tx, ty - 1);
  }
}

/** Tira de papel picado cercana (casi en silueta) colgada de un cable. */
function papelCercano(g: Lienzo, x0: number, len: number, y: number, seed: number): void {
  for (let dx = 0; dx < len; dx++) {
    const yy = y + Math.sin(dx / len * Math.PI) * 14;
    g.set(C.ink, x0 + dx, yy);
    const k = dx % 20;
    if (k < 15 && dx > 4 && dx < len - 6 && hash(Math.floor(dx / 20), 1, seed) > 0.25) {
      const c = [C.ro0, C.pu0, C.tq0, C.te0][Math.floor(dx / 20) % 4];
      for (let py = 1; py < 15; py++) if (!((py === 5 || py === 9) && (k === 4 || k === 10)) && !(py > 12 && k % 3 === 1)) g.set(c, x0 + dx, yy + py);
    }
  }
}

export function drawOaxacaForeground(g: Lienzo, section: OaxacaSection, width: number): void {
  for (let x = 0; x < width; x++) {
    const y = 352 + Math.round(noise1(x * 0.03, 2) * 5);
    g.rect(C.ink, x, y, 1, 360 - y);
  }
  if (section === 'oaxaca') {
    for (let x = 30, i = 0; x < width; x += 150, i++) {
      if (hash(i, 1, 3) > 0.5) agaveFront(g, x, 362, 22 + hash(i, 2, 3) * 14, C.ink, C.fo0);
      else if (hash(i, 3, 3) > 0.5) for (let k = 0; k < 7; k++) g.rect(k % 2 ? C.st0 : C.ink, x + k * 4, 350 - (k % 3) * 2, 5, 10);
    }
    for (let x0 = 300; x0 < width - 300; x0 += 1100) papelCercano(g, x0, 280, 2, x0);
  } else if (section === 'callejones') {
    // Canastas y costales en silueta abajo; cables y un rebozo colgado arriba.
    for (let x = 60, i = 0; x < width; x += 170, i++) {
      if (hash(i, 1, 4) > 0.5) { g.ellipse(C.ink, x, 356, 14, 8); for (let k = -12; k < 13; k += 3) g.set(C.ea0, x + k, 352); }
      else if (hash(i, 2, 4) > 0.5) agaveFront(g, x, 362, 18, C.ink, C.ea0);
    }
    for (let x0 = 200; x0 < width; x0 += 900) {
      for (let dx = 0; dx < 340; dx++) g.set(C.ink, x0 + dx, 6 + Math.sin(dx / 340 * Math.PI) * 18);
      for (let k = 0; k < 3; k++) {
        const tx = x0 + 70 + k * 90, ty = 6 + Math.round(Math.sin((70 + k * 90) / 340 * Math.PI) * 18);
        const th = 34 + k * 6;
        for (let y = 0; y < th; y++) for (let x = 0; x < 24; x++) {
          if (y >= th - 3 && x % 2 === 1) continue; // flecos
          const band = y % 12;
          let c: string = k === 1 ? C.night : C.ro0;
          if (band < 1 || x === 0 || x === 23) c = C.ink;
          else if (band >= 2 && band < 10 && patronOn(k === 1 ? 'rombo' : 'greca', x, band - 2)) c = k === 1 ? C.ro0 : C.te0;
          g.set(c, tx + x, ty + y);
        }
        g.rect(C.ea0, tx - 2, ty - 1, 28, 2);
      }
    }
  } else {
    const inside = atWorld(OAXACA_LANDMARKS.templo.interior, 1.25);
    for (let x = 20, i = 0; x < inside; x += 120, i++) if (hash(i, 1, 6) > 0.35) agaveFront(g, x, 364, 24 + hash(i, 2, 6) * 16, C.ink, C.fo0);
    // Interior: borde de la bóveda y candiles colgantes en silueta.
    for (let x = inside; x < width; x++) {
      const y = 10 + Math.round(Math.abs(Math.sin((x - inside) / 300 * Math.PI)) * 14);
      g.rect(C.ink, x, 0, 1, y);
    }
    for (let x0 = inside + 160; x0 < width; x0 += 420) {
      g.rect(C.ink, x0, 0, 1, 40);
      g.rect(C.ink, x0 - 16, 40, 33, 2); g.rect(C.ink, x0 - 10, 42, 21, 3);
      for (let k = -16; k <= 16; k += 8) { g.rect(C.ink, x0 + k, 34, 2, 6); g.set(C.wa2, x0 + k, 32); g.set(C.wa3, x0 + k, 33); }
    }
  }
}

/** Marcas del suelo con brillo animado en el decorado. */
export function oaxacaGroundMarks(section: OaxacaSection): Array<{ x: number; y: number; kind: 'fatuo' | 'taller' }> {
  if (section === 'santo_domingo') return [{ ...OAXACA_LANDMARKS.arena, kind: 'fatuo' }];
  if (section === 'oaxaca') return [{ x: OAXACA_LANDMARKS.taller.x - 40, y: 232, kind: 'taller' }];
  return [];
}
