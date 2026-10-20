/**
 * Props y NPCs comunes del Nivel 6 (CDMX parte 1). Cada entrada describe un PNG (o tira de cuadros)
 * que genera tools/gen-cdmx-scenery.mjs y que el juego también dibuja como respaldo si falta.
 * NPCs comunes con diseño completo (AGENTS.md §8.0): 64×80, pivote (32, 78), ~70 px, mirando a la
 * derecha. Las muñecas poseídas, los nahuales, la Nahuala, María y Balam NO están aquí (son
 * personajes importantes: placeholders del agente de enemigos/sistemas).
 */
import { BIG_CDMX, C, Lienzo, PAPEL, bayer, calaverita, cempasuchil, cempasuchilMata, concreto, grieta, hash, miniText, outlineOf, patronOn } from './CdmxPixels';

export interface CdmxArtSpec {
  key: string;
  /** Carpeta bajo public/assets/. */
  dir: string;
  w: number;
  h: number;
  frames: number;
  fps?: number;
  /** Fila de los pies (pivote). */
  feetY: number;
  /** Fuerza tira aunque tenga un cuadro. */
  sheet?: boolean;
  draw: (g: Lienzo, frame: number) => void;
}

const PROPS = 'escenarios/nivel-06-cdmx/props';
const NPCS = 'sprites/npcs';

/* =============================== AYUDAS =============================== */

function flame(g: Lienzo, x: number, y: number, frame: number, size = 1, alma = false): void {
  const h = [5, 6, 4, 6][frame % 4] * size, sway = [0, 1, 0, -1][frame % 4];
  const outer = alma ? C.tq1 : C.wa1, mid = alma ? C.tq2 : C.wa2, core = alma ? C.tq3 : C.wa4;
  for (let i = 0; i < h; i++) {
    const t = i / h, half = Math.round((1 - t) * 1.6 * size), sx = x + Math.round(sway * t);
    g.rect(outer, sx - half - (i < h * 0.4 ? 1 : 0), y - i, half * 2 + 1 + (i < h * 0.4 ? 2 : 0), 1);
    if (i < h - 1) g.rect(mid, sx - Math.max(0, half - 1), y - i, Math.max(1, half * 2 - 1), 1);
    if (i < h * 0.45) g.set(core, sx, y - i);
  }
}

/** Veladora de vaso (cirio corto) con llama. */
function veladora(g: Lienzo, x: number, base: number, h: number, f: number, vaso: string = C.sh1): void {
  g.rect(vaso, x, base - h, 3, h); g.rect(C.wa4, x, base - h, 1, h);
  if (h > 3) g.set(C.ro2, x + 1, base - Math.ceil(h / 2)); // estampita
  flame(g, x + 1, base - h - 1, f);
}

/** Pan de muerto: bollo redondo con "huesitos" y azúcar. */
function panMuerto(g: Lienzo, cx: number, base: number, r: number): void {
  g.ellipse(C.ea3, cx, base - r * 0.6, r, r * 0.6); g.ellipse(C.ea4, cx - 1, base - r * 0.8, r * 0.6, r * 0.3);
  g.line(C.ea2, cx - r + 1, base - r * 0.7, cx + r - 1, base - r * 0.7); g.ellipse(C.ea2, cx, base - r * 1.15, 1, 1);
  for (let k = 0; k < r; k++) g.set(C.wa4, cx - r + 1 + hash(k, 1, cx) * r * 2, base - r * 0.5 - hash(k, 2, cx) * r * 0.5);
}

/** Retrato enmarcado en la ofrenda. */
function retrato(g: Lienzo, x: number, y: number, w: number, h: number, seed: number): void {
  g.rect(C.ea1, x, y, w, h); g.rect(C.ea3, x, y, w, 1);
  g.rect(C.st4, x + 1, y + 1, w - 2, h - 2); g.rect(C.st3, x + 1, y + h - 4, w - 2, 3);
  g.ellipse(C.st2, x + w / 2, y + h / 2 - 1, Math.max(1, w / 2 - 2), Math.max(1, h / 2 - 3));
  g.rect(C.st1, x + w / 2 - 2, y + h - 4, 4, 3);
  if (hash(seed, 1) > 0.5) g.set(C.st5, x + 2, y + 2);
}

/* =============================== OFRENDAS =============================== */

/** Ofrenda grande de tres niveles con arco de cempasúchil. `descanso`: las almas se acercan a descansar. */
function ofrendaGrande(g: Lienzo, f: number, descanso: boolean): void {
  const W = 112, base = 95, cx = W / 2;
  // Aura de las almas (variante DESCANSO): luz turquesa-lila que respira.
  if (descanso) {
    const k = [0.45, 0.6, 0.75, 0.6][f % 4];
    for (let y = 0; y < base; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - cx) / 54, (y - 46) / 46);
      if (d < 1) g.veil(d < 0.55 ? C.pu1 : C.tq0, x, y, (1 - d) * k);
    }
  }
  // Arco de carrizo forrado de cempasúchil.
  for (let a = 0; a <= 60; a++) {
    const t = a / 60 * Math.PI, ax = cx - Math.cos(t) * 50, ay = 66 - Math.sin(t) * 58;
    g.rect(C.ea2, ax, ay, 2, 2);
    cempasuchil(g, ax + (a % 2 ? 1 : -1), ay + (a % 3) - 1, 2, a);
  }
  // Papel picado colgado del arco.
  for (let x = 14; x < W - 14; x++) g.set(C.ink, x, 22 + Math.round(Math.sin((x - 14) / (W - 28) * Math.PI) * 6));
  for (let k = 0; k < 9; k++) {
    const x0 = 16 + k * 9, y0 = 23 + Math.round(Math.sin((x0 - 10) / (W - 28) * Math.PI) * 6), c = PAPEL[k % PAPEL.length], sw = [0, 1, 0, -1][(f + k) % 4];
    for (let y = 0; y < 9; y++) for (let x = 0; x < 7; x++) if (!(y === 4 && x % 3 === 1) && !(y === 8 && x % 2)) g.set(c, x0 + x + Math.round(sw * y / 9), y0 + y);
  }
  // Tres escalones con mantel morado y blanco calado.
  const tiers: Array<[number, number, number]> = [[18, 64, 76], [12, 76, 86], [6, 86, 95]]; // inset, y0, y1
  tiers.forEach(([ins, y0, y1], i) => {
    g.rect(i === 1 ? C.pu1 : C.sh1, ins, y0, W - ins * 2, y1 - y0); g.rect(i === 1 ? C.pu2 : C.wa4, ins, y0, W - ins * 2, 1);
    for (let x = ins; x < W - ins; x += 3) g.set(i === 1 ? C.pu0 : C.sh0, x, y1 - 2);
    for (let x = ins; x < W - ins; x += 6) g.set(i === 1 ? C.pu3 : C.ro2, x + 2, y0 + 3);
  });
  // Retratos, cruz de flores, pan, calaveritas, frutas, sal, agua y copal.
  retrato(g, cx - 22, 46, 12, 16, 1); retrato(g, cx - 6, 42, 12, 20, 2); retrato(g, cx + 10, 46, 12, 16, 3);
  for (const x of [26, 80]) { panMuerto(g, x, 64, 5); }
  calaverita(g, 32, 70); calaverita(g, 48, 69, C.tq2, C.wa2); calaverita(g, 64, 70, C.pu2, C.ro2); calaverita(g, 74, 70, C.wa2, C.tq2);
  g.ellipse(C.wa1, 22, 82, 3, 3); g.ellipse(C.fo4, 88, 82, 3, 3); g.ellipse(C.rd0, 92, 83, 2, 2); // naranja, guayaba, tejocote
  g.rect(C.tq0, 54, 79, 4, 6); g.rect(C.tq2, 54, 79, 4, 1); // vaso de agua
  g.rect(C.st2, 38, 82, 6, 2); g.rect(C.sh1, 39, 81, 4, 1); // sal
  // Sahumerio con copal: humo que sube ondulando por cuadro.
  g.rect(C.te1, 70, 82, 8, 4); g.rect(C.te2, 70, 82, 8, 1);
  for (let y = 0; y < 22; y++) g.set(y % 2 ? C.sh0 : C.mtn2, 74 + Math.round(Math.sin(y * 0.4 + f * 1.5) * 2), 80 - y);
  // Cempasúchil a los lados y al pie.
  cempasuchilMata(g, 0, 95, 18, 3); cempasuchilMata(g, W - 18, 95, 18, 4);
  g.outline(c => (c === C.sh1 || c === C.wa4 || c === C.sh0 ? C.st2 : outlineOf(c)));
  // Veladoras (sobre el contorno para que brillen).
  [10, 16, 30, 44, 58, 68, 84, 96].forEach((x, k) => veladora(g, x, k % 2 ? 94 : 86, 4 + (k % 3), f + k));
  if (descanso) {
    // Lucecitas que suben: las almas que encontraron el camino.
    for (let k = 0; k < 6; k++) {
      const x = 14 + hash(k, 1, 31) * 84, y = 60 - ((f * 6 + hash(k, 2, 31) * 50) % 56);
      g.set(C.tq3, x, y); g.set(C.tq2, x, y + 1); if (k % 2) g.set(C.pu3, x + 1, y);
    }
  }
}

function ofrendaChica(g: Lienzo, f: number): void {
  // Mesita de banqueta: mantel, retrato, pan, calaverita, cempasúchil y veladoras.
  g.rect(C.ea1, 6, 30, 3, 13); g.rect(C.ea1, 39, 30, 3, 13);
  g.rect(C.ro1, 4, 26, 40, 6); for (let x = 4; x < 44; x += 3) g.set(C.ro2, x, 31); g.rect(C.ro2, 4, 26, 40, 1);
  retrato(g, 18, 10, 11, 15, 4);
  panMuerto(g, 10, 26, 4); calaverita(g, 31, 19);
  cempasuchilMata(g, 0, 43, 12, 5); cempasuchilMata(g, 36, 43, 12, 6);
  g.outline(outlineOf);
  veladora(g, 6, 26, 4, f); veladora(g, 38, 26, 5, f + 2); veladora(g, 23, 43, 4, f + 1);
}

/** Ofrenda flotante varada en el lodo: balsa de tablas, brasero de barro con fuego, velas y flores. */
function ofrendaFlotante(g: Lienzo, f: number): void {
  // Balsa inclinada.
  for (let k = 0; k < 88; k++) {
    const yy = 38 + Math.round((k - 44) * 0.04);
    g.rect(C.ea1, 4 + k, yy, 1, 7); g.set(C.ea3, 4 + k, yy); if (k % 11 === 0) g.rect(C.ea0, 4 + k, yy, 1, 7);
  }
  g.ellipse(C.ea0, 48, 47, 46, 1); // lodo pegado
  // Arco de flores pequeño.
  for (let a = 0; a <= 24; a++) { const t = a / 24 * Math.PI; cempasuchil(g, 48 - Math.cos(t) * 30, 34 - Math.sin(t) * 22, 1 + (a % 2), a); }
  // Brasero de barro (FUEGO): cuerpo, patas y carbones.
  g.ellipse(C.te1, 48, 32, 11, 5); g.rect(C.te1, 39, 32, 19, 5); g.rect(C.te2, 39, 32, 19, 1); g.rect(C.te0, 41, 36, 3, 3); g.rect(C.te0, 53, 36, 3, 3);
  for (let k = 0; k < 6; k++) g.set(k % 2 ? C.wa1 : C.rd0, 41 + k * 3, 30);
  cempasuchilMata(g, 6, 40, 20, 7); cempasuchilMata(g, 70, 40, 20, 8);
  g.outline(outlineOf);
  flame(g, 44, 29, f, 2); flame(g, 50, 29, f + 1, 2.4); flame(g, 47, 27, f + 2, 1.6);
  [16, 26, 70, 80].forEach((x, k) => veladora(g, x, 39, 3 + k % 2, f + k));
}

function brasero(g: Lienzo, f: number): void {
  // Brasero de piedra volcánica en pedestal: el fuego que guía a los muertos.
  g.rect(C.st1, 10, 30, 12, 16); g.rect(C.st2, 10, 30, 3, 16); g.rect(C.st0, 6, 44, 20, 3);
  for (let y = 30; y < 44; y += 4) g.set(C.st3, 12, y);
  g.ellipse(C.st1, 16, 26, 13, 5); g.ellipse(C.st2, 15, 25, 11, 3); g.ellipse(C.ink, 16, 24, 9, 2);
  for (let k = 0; k < 8; k++) g.set(k % 2 ? C.wa1 : C.rd0, 9 + k * 2, 24);
  // Greca tallada.
  for (let x = 6; x < 27; x++) if (patronOn('escalon', x, 1)) g.set(C.st0, x, 27);
  g.outline(outlineOf);
  flame(g, 12, 23, f, 2.2); flame(g, 19, 23, f + 1, 2.6); flame(g, 16, 22, f + 2, 3);
  if (f % 2) g.set(C.wa3, 14 + f, 4); else g.set(C.wa2, 18 - f, 6); // chispa
}

/** Inscripción de piedra (VERDAD): estela con glifos tallados que laten débilmente. */
function inscripcion(g: Lienzo, f: number): void {
  const W = 56, base = 55;
  for (let y = 4; y < base - 4; y++) for (let x = 6; x < W - 6; x++) {
    const n = hash(x >> 1, y >> 1, 5);
    g.set(n > 0.82 ? C.st3 : n < 0.15 ? C.st1 : C.st2, x, y);
  }
  for (let k = 6; k < W - 6; k++) { const yy = 4 - Math.round(Math.sin((k - 6) / (W - 13) * Math.PI) * 3); g.rect(C.st2, k, yy, 1, 5); g.set(C.st4, k, yy); }
  g.rect(C.st4, 6, 4, 2, base - 8);
  // Glifos (diseño propio): ojo, espiral de palabra (vírgula), escalón y puntos de numeral.
  const glow = f % 2 ? C.tq2 : C.tq1, cut = C.st0;
  const glyph = (gx: number, gy: number, kind: number) => {
    g.rect(cut, gx, gy, 14, 12); g.rect(C.st1, gx + 1, gy + 1, 12, 10);
    if (kind === 0) { g.ellipse(glow, gx + 7, gy + 6, 5, 3); g.ellipse(cut, gx + 7, gy + 6, 2, 2); g.set(glow, gx + 7, gy + 6); }
    else if (kind === 1) { for (let a = 0; a < 18; a++) g.set(glow, gx + 7 + Math.cos(a * 0.6) * (1 + a * 0.25), gy + 6 + Math.sin(a * 0.6) * (1 + a * 0.2)); }
    else if (kind === 2) { for (let x = 0; x < 12; x++) if (patronOn('greca', x, 1) || patronOn('greca', x, 5)) g.set(glow, gx + 1 + x, gy + 3 + (patronOn('greca', x, 1) ? 0 : 4)); }
    else { for (let k = 0; k < 3; k++) g.ellipse(glow, gx + 3 + k * 4, gy + 4, 1, 1); g.rect(glow, gx + 2, gy + 8, 10, 1); }
  };
  glyph(12, 10, 0); glyph(30, 10, 1); glyph(12, 26, 2); glyph(30, 26, 3);
  g.rect(cut, 12, 41, 32, 1); g.rect(cut, 12, 44, 24, 1);
  grieta(g, 40, 6, 30, C.ink, 3, -0.3);
  g.rect(C.st1, 2, base - 4, W - 4, 4); g.rect(C.st3, 2, base - 4, W - 4, 1);
  for (let x = 4; x < W - 4; x++) if (hash(x, 1, 6) > 0.7) g.set(C.fo2, x, base - 5);
  g.outline(outlineOf);
  veladora(g, 4, base - 3, 3, f); veladora(g, W - 8, base - 3, 4, f + 1);
}

/* ========================= XOCHIMILCO ========================= */

function trajinera(g: Lienzo): void {
  // Trajinera varada e inclinada, con su arco pintado "LUPITA", techo de lámina y bancas.
  const W = 176, tilt = 0.035;
  const y = (x: number) => Math.round((x - W / 2) * tilt);
  for (let x = 6; x < W - 4; x++) {
    const bow = x < 20 ? (20 - x) * 0.5 : x > W - 18 ? (x - (W - 18)) * 0.6 : 0;
    const y0 = 38 + y(x) + bow, y1 = 52 + y(x);
    g.rect(C.ea1, x, y0, 1, y1 - y0); g.set(C.ea3, x, y0); g.set(C.ea2, x, y0 + 1);
    if (x % 4 === 0) g.set(C.ro1, x, y0 + 4); else g.set(C.wa2, x, y0 + 4);
    if (hash(x, 1, 9) > 0.92) g.set(C.ea0, x, y0 + 7);
  }
  // Bancas y mesa.
  for (const bx of [44, 120]) { g.rect(C.ea2, bx, 33 + y(bx), 18, 3); g.rect(C.ea3, bx, 33 + y(bx), 18, 1); }
  g.rect(C.ea3, 76, 30 + y(76), 26, 3); g.rect(C.ea1, 86, 33 + y(86), 4, 6);
  // Postes y techo.
  for (const px of [26, 70, 110, 150]) g.rect(C.ea0, px, 10 + y(px), 3, 30);
  for (let x = 22; x < 158; x++) { g.rect(C.st2, x, 7 + y(x), 1, 3); if (x % 5 === 0) g.set(C.st3, x, 7 + y(x)); g.set(C.ro1, x, 10 + y(x)); }
  // Arco frontal pintado con el nombre y flores.
  for (let k = 0; k < 44; k++) {
    const arch = Math.round(Math.sin(k / 43 * Math.PI) * 8), x = 2 + k, yy = 2 + y(x) - arch;
    g.rect(C.ro1, x, yy, 1, 16 + arch); g.set(C.wa2, x, yy); g.set(C.wa3, x, yy + 1);
    if (k % 7 === 3) cempasuchil(g, x, yy + 3, 1, k);
  }
  miniText(g, C.sh1, 'LUPITA', 8, 8 + y(8));
  for (let k = 0; k < 6; k++) g.set([C.tq2, C.wa3, C.ro3][k % 3], 8 + k * 5, 15 + y(8 + k * 5));
  // Lodo seco pegado al casco y lirios muertos.
  for (let x = 4; x < W; x++) if (hash(x, 3, 9) > 0.4) g.set(hash(x, 4, 9) > 0.5 ? C.ea0 : C.te0, x, 52 + y(x) + Math.floor(hash(x, 5, 9) * 3));
  g.outline(outlineOf);
}

function ahuejoteProp(g: Lienzo): void {
  const W = 40, H = 128;
  g.rect(C.ea1, 18, H - 30, 4, 29); g.rect(C.ea2, 18, H - 30, 1, 29);
  g.ellipse(C.ea0, 20, H - 1, 9, 1);
  for (let y = 0; y < H - 22; y++) {
    const t = y / (H - 22), half = 15 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.95) * (0.75 + hash(y >> 2, 1, 3) * 0.35);
    for (let px = -Math.ceil(half); px <= half; px++) {
      if (hash(px, y, 4) > 0.86 && Math.abs(px) > half - 2) continue;
      const lit = px < -half * 0.25;
      const c = (px * 3 + y) % 7 === 0 ? C.fo1 : lit ? (hash(px, y, 5) > 0.5 ? C.fo3 : C.fo4) : C.fo2;
      g.set(c, W / 2 + px, 2 + y);
    }
  }
  for (let k = 0; k < 18; k++) g.set(C.fo5, W / 2 - 8 + hash(k, 1, 6) * 8, 6 + hash(k, 2, 6) * 90);
  g.outline(outlineOf);
}

/** Árbol seco de la Isla de las Muñecas (decoración; NO es la enemiga). Las muñecas se mecen. */
function arbolMunecasProp(g: Lienzo, f: number): void {
  const H = 128, base = H - 1;
  // Tronco.
  for (let y = 0; y < 90; y++) {
    const cx = 50 + Math.round(Math.sin(y * 0.05) * 3), half = 3 + Math.round((1 - y / 90) * 4);
    g.rect(C.ea0, cx - half, base - y, half * 2, 1); g.set(C.st2, cx - half, base - y); if (y % 5 === 0) g.set(C.st1, cx, base - y);
  }
  for (let k = -12; k < 13; k++) g.set(C.ea0, 50 + k, base - Math.abs(k) * 0.3); // raíces
  // Ramas desnudas.
  const tips: Array<[number, number]> = [];
  const ramas: Array<[number, number, number, number]> = [[50, 60, -1, 34], [50, 70, 1, 38], [51, 48, -1, 28], [51, 52, 1, 30], [52, 40, 1, 20], [50, 42, -1, 22]];
  for (const [x0, y0, dir, len] of ramas) {
    let px = x0, py = y0;
    for (let s = 0; s < len; s++) {
      px += dir * (0.9 + hash(s, y0, 3) * 0.4); py -= 0.35 + hash(s, y0 + 1, 3) * 0.5;
      g.set(C.ea0, px, py); if (s < len * 0.5) g.set(C.ea0, px, py + 1); if (s < len * 0.2) g.set(C.st1, px, py + 2);
      if (s % 9 === 8) tips.push([px, py]);
    }
    tips.push([px, py]);
    g.line(C.ea0, px, py, px + dir * 4, py - 5);
  }
  // Muñecas viejas colgadas por cordones: ropa desteñida, cabello revuelto, sin daño explícito.
  const looks: Array<[string, string, string]> = [[C.sh0, C.ro1, C.ea3], [C.sk2, C.tq1, C.ea0], [C.sh1, C.pu1, C.wa2], [C.sk1, C.wa1, C.st0], [C.st5, C.fo3, C.ea2]];
  tips.forEach(([tx, ty], k) => {
    if (k % 3 === 2) return;
    const len = 6 + (k * 5) % 12, sw = [0, 1, 0, -1][(f + k) % 4] * (k % 2 ? 1 : -1);
    const dx = Math.round(tx) + sw, dy = Math.round(ty) + len;
    g.line(C.st3, tx, ty, dx, dy);
    const [skin, dress, hair] = looks[k % looks.length];
    // Cabeza, cabello, ojos fijos, vestidito, brazos y piernas colgando.
    g.rect(hair, dx - 2, dy, 5, 2); g.rect(skin, dx - 2, dy + 1, 5, 4); g.set(hair, dx - 2, dy + 2);
    g.set(C.ink, dx - 1, dy + 2); g.set(C.ink, dx + 1, dy + 2); g.set(C.ro1, dx, dy + 4);
    g.rect(dress, dx - 2, dy + 5, 5, 5); g.rect(dress, dx - 3, dy + 9, 7, 1); g.set(C.sh1, dx, dy + 6);
    g.set(skin, dx - 3, dy + 6); g.set(skin, dx + 3, dy + 6); g.set(skin, dx - 3, dy + 7); g.set(skin, dx + 3, dy + 7);
    g.rect(skin, dx - 1, dy + 10, 1, 3); g.rect(skin, dx + 1, dy + 10, 1, 3 - (k % 2));
    if (k % 4 === 1) g.set(C.st3, dx + 1, dy + 3); // grieta de la porcelana
  });
  // Moños y listones viejos atados a las ramas.
  for (let k = 0; k < 5; k++) { const [tx, ty] = tips[(k * 3) % tips.length]; g.rect(PAPEL[k % PAPEL.length], tx - 1, ty + 1, 3, 2); g.set(PAPEL[k % PAPEL.length], tx, ty + 3); }
  g.outline(c => (c === C.sh1 || c === C.sh0 || c === C.st5 ? C.st1 : outlineOf(c)));
  // Veladoras al pie.
  veladora(g, 34, base - 1, 4, f); veladora(g, 64, base - 1, 3, f + 2);
}

/* ========================= DÍA DE MUERTOS ========================= */

function papelPicado(g: Lienzo, f: number): void {
  // Tira de papel picado: banderitas caladas con flor y calavera simplificada, se mecen por cuadro.
  const W = 128;
  for (let x = 0; x < W; x++) g.set(C.ink, x, 1 + Math.round(Math.sin(x / (W - 1) * Math.PI) * 6));
  for (let k = 0; k < 8; k++) {
    if (k === 6) continue; // una se cayó
    const x0 = 4 + k * 15, y0 = 2 + Math.round(Math.sin((x0 + 6) / (W - 1) * Math.PI) * 6), c = PAPEL[k % PAPEL.length];
    const sw = [0, 1, 0, -1][(f + k) % 4], torn = k === 3;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) {
      const px = x + Math.round(sw * y / 16), yy = y0 + y;
      if (torn && y > 9 && x > 6 - (y - 9)) continue;
      // Calado: calaverita (ojos y dientes) o flor, orilla en picos.
      if (k % 2 === 0) {
        if ((y === 5 || y === 6) && (x === 3 || x === 4 || x === 7 || x === 8)) continue;
        if (y === 9 && x === 5 || y === 9 && x === 6) continue;
        if (y === 11 && x > 2 && x < 9 && x % 2 === 0) continue;
      } else {
        if (Math.abs(x - 5.5) + Math.abs(y - 7) < 2.5 && (x + y) % 2 === 0) continue;
        if ((y === 3 || y === 11) && (x === 2 || x === 9)) continue;
      }
      if (y === 15 && x % 3 === 1) continue;
      g.set(y === 0 ? C.ink : c, x0 + px, yy);
    }
  }
}

function cempasuchilProp(g: Lienzo): void {
  cempasuchilMata(g, 0, 15, 28, 11);
  for (const [x, y] of [[5, 7], [13, 5], [21, 8]] as const) cempasuchil(g, x, y, 3, x);
  g.outline(c => (c.startsWith('#f') || c === C.wa1 ? C.wa0 : outlineOf(c)));
}

function maceta(g: Lienzo): void {
  g.rect(C.te1, 4, 14, 12, 9); g.rect(C.te2, 3, 13, 14, 2); g.rect(C.te3, 3, 13, 14, 1); g.rect(C.te0, 13, 15, 3, 8);
  for (let k = 0; k < 5; k++) g.line(C.fo2, 10, 14, 4 + k * 3, 7 - (k % 2) * 2);
  for (const [x, y, r] of [[5, 6, 2], [10, 4, 3], [15, 6, 2], [8, 9, 2], [13, 10, 2]] as const) cempasuchil(g, x, y, r, x + y);
  g.outline(outlineOf);
}

function calaveritaProp(g: Lienzo): void { calaverita(g, 2, 2); g.outline(() => C.st2); }

function calaveritas(g: Lienzo): void {
  calaverita(g, 2, 7, C.ro2, C.tq2); calaverita(g, 12, 6, C.tq2, C.wa2); calaverita(g, 22, 7, C.pu2, C.ro2);
  calaverita(g, 7, 1, C.wa2, C.pu2); calaverita(g, 17, 1, C.fo4, C.ro2);
  g.outline(() => C.st2);
}

function veladoras(g: Lienzo, f: number): void {
  g.ellipse(C.sh0, 16, 18, 14, 2); g.ellipse(C.sh1, 15, 17, 11, 1);
  const set: Array<[number, number, string]> = [[3, 7, C.sh1], [8, 10, C.rd1], [13, 6, C.sh1], [18, 12, C.wa4], [23, 8, C.tq2], [27, 5, C.sh1]];
  for (const [x, h, c] of set) { g.rect(c, x, 18 - h, 3, h); g.rect(C.sh0, x + 2, 18 - h, 1, h); g.set(C.ro2, x + 1, 18 - Math.ceil(h / 2)); }
  g.outline(() => C.st2);
  set.forEach(([x, h], k) => flame(g, x + 1, 16 - h, f + k));
}

/* ============================ CIUDAD ============================ */

/** Auto abandonado (retrofuturista, sin marca): llantas ponchadas, vidrios rotos, flores en el cofre. */
function auto(g: Lienzo, body: string, dark: string, hi: string, roof: string, taxi: boolean): void {
  const W = 96, base = 43;
  // Carrocería redondeada.
  for (let x = 4; x < W - 4; x++) {
    const t = (x - 4) / (W - 8);
    const topCab = t > 0.25 && t < 0.72 ? 6 + Math.round(Math.abs(t - 0.48) * 22) : 99;
    const topBody = 20 - Math.round(Math.sin(t * Math.PI) * 4);
    const y0 = Math.min(topCab, topBody);
    for (let y = y0; y < base - 6; y++) {
      let c = y < topBody ? roof : y < topBody + 2 ? hi : y > base - 12 ? dark : body;
      if (taxi && y >= topBody + 6 && y < topBody + 9) c = C.sh1;
      g.set(c, x, y);
    }
  }
  // Ventanas rotas.
  for (let x = 30; x < 70; x++) for (let y = 9; y < 19; y++) {
    if (g.get(x, y) !== roof || x % 20 < 2) continue;
    g.set(hash(x, y, 4) > 0.75 ? C.mtn1 : C.ink, x, y);
  }
  g.line(C.mtn2, 34, 10, 40, 17); g.line(C.mtn2, 56, 11, 60, 15);
  // Defensas cromadas, faros (uno roto), puertas.
  g.rect(C.st4, 2, base - 12, 8, 3); g.rect(C.st4, W - 10, base - 12, 8, 3);
  g.ellipse(C.wa3, 7, 22, 2, 2); g.ellipse(C.ink, W - 7, 22, 2, 2);
  g.rect(dark, 46, 20, 1, 16); g.rect(C.st4, 40, 25, 3, 1); g.rect(C.st4, 60, 25, 3, 1);
  if (taxi) { g.rect(C.st0, 42, 3, 12, 3); g.rect(C.wa3, 43, 4, 10, 1); }
  // Llantas ponchadas.
  for (const wx of [20, 76]) { g.ellipse(C.st0, wx, base - 6, 9, 6); g.ellipse(C.st1, wx, base - 6, 5, 4); g.ellipse(C.st3, wx, base - 7, 2, 2); g.rect(C.st0, wx - 9, base - 2, 18, 2); }
  // Óxido, polvo y un ramo de cempasúchil con veladora sobre el cofre.
  for (let k = 0; k < 40; k++) { const x = 6 + hash(k, 1, 7) * (W - 12), y = 18 + hash(k, 2, 7) * 18; if (g.has(x, y)) g.set(hash(k, 3, 7) > 0.5 ? C.te1 : C.ea2, x, y); }
  cempasuchilMata(g, W - 26, 18, 14, 3);
  g.outline(outlineOf);
}

/** Poste de neón con letrero vertical que parpadea (un cuadro casi apagado). */
function posteNeon(g: Lienzo, f: number): void {
  g.rect(C.st1, 14, 34, 4, 61); g.rect(C.st2, 14, 34, 1, 61); g.rect(C.st0, 10, 92, 12, 4);
  g.rect(C.ink, 4, 2, 24, 40); g.rect(C.st0, 5, 3, 22, 38);
  g.outline(() => C.st1);
  const on = f !== 2, c = on ? (f === 3 ? C.ro1 : C.ro2) : C.ro0, c2 = on ? C.ro3 : C.ro0;
  const word = 'TACOS';
  for (let k = 0; k < word.length; k++) miniText(g, k === 3 && f % 2 ? C.ro0 : c, word[k], 14, 5 + k * 7);
  g.rect(c, 6, 4, 1, 36); g.rect(c, 25, 4, 1, 36); g.set(c2, 6, 4); g.set(c2, 25, 39);
  if (on) for (let k = 0; k < 5; k++) g.set(C.ro3, 15, 6 + k * 7);
}

function escombros(g: Lienzo): void {
  for (let k = 0; k < 46; k++) {
    const x = 4 + hash(k, 1, 6) * 56, y = 22 - (hash(k, 2, 6) ** 1.5) * 14 * Math.sin((x - 2) / 60 * Math.PI) - 1;
    const r = hash(k, 3, 6);
    if (r < 0.45) { g.rect(C.st2, x, y, 5, 3); g.rect(C.st4, x, y, 4, 1); }
    else if (r < 0.65) { g.rect(C.st3, x, y, 4, 2); g.set(C.st5, x, y); }
    else if (r < 0.75) { g.rect(PAPEL[k % PAPEL.length], x, y, 2, 1); }
    else if (r < 0.85) { g.set(C.tq1, x, y); g.set(C.mtn2, x + 1, y); }
    else g.rect(C.te1, x, y, 3, 2);
  }
  g.line(C.te2, 8, 10, 30, 4); g.line(C.te2, 30, 12, 50, 6); // varillas
  g.outline(outlineOf);
}

/** Bloque de escombro grande (obstáculo): losas de concreto apiladas con varilla. */
function escombrosGrandes(g: Lienzo): void {
  const W = 104, base = 47;
  for (let k = 0; k < 5; k++) {
    const x = 6 + k * 18 + Math.round(hash(k, 1, 8) * 6), w = 22 + Math.round(hash(k, 2, 8) * 14), h = 10 + Math.round(hash(k, 3, 8) * 18);
    const y = base - h - (k % 2) * 4;
    concreto(g, x, y, w, h, C.st3, C.st2, C.st4, k + 20); g.rect(C.st5, x, y, w, 1); g.rect(C.st1, x + w - 4, y + 1, 4, h - 1);
  }
  for (let y = 10; y < base; y++) for (let x = 0; x < W; x++) if (!g.has(x, y) && y > base - 8 && hash(x, y, 9) > 0.4) g.set(C.st2, x, y);
  for (let k = 0; k < 7; k++) g.line(C.te2, 14 + k * 12, 18 + (k % 3) * 4, 18 + k * 12 + (k % 2 ? 6 : -4), 4 + (k % 3) * 3);
  grieta(g, 40, 22, 20, C.st1, 4, 0);
  g.outline(outlineOf);
}

/**
 * Plataforma para el doble salto (vista desde un poco arriba): cara superior plana bien legible y
 * frente de 30–36 px. `kind`: cornisa art déco, losa de concreto o viga de acero.
 */
function plataforma(g: Lienzo, w: number, h: number, top: number, kind: 'cornisa' | 'losa' | 'viga'): void {
  const front = h - top - 1;
  // Cara superior (el jugador la lee como "aquí se pisa").
  for (let y = 1; y <= top; y++) for (let x = 2; x < w - 2; x++) {
    const c = kind === 'viga' ? (x % 12 < 1 ? C.st1 : C.st3) : hash(x >> 2, y, 3) > 0.75 ? C.st4 : C.st5;
    g.set(c, x, y);
  }
  g.rect(C.sh0, 2, 1, w - 4, 1);
  // Frente.
  if (kind === 'cornisa') {
    concreto(g, 2, top + 1, w - 4, front, C.te2, C.te1, C.te3, 5);
    for (let s = 0; s < 3; s++) { g.rect(C.te3, 2, top + 1 + s * 5, w - 4, 1); g.rect(C.te0, 2, top + 4 + s * 5, w - 4, 1); }
    for (let x = 6; x < w - 6; x += 10) { g.rect(C.te3, x, top + 16, 3, front - 16); g.rect(C.te0, x + 3, top + 16, 1, front - 16); } // pilastras
    for (let x = 4; x < w - 4; x++) if (patronOn('escalon', x, 2)) g.set(C.te0, x, top + 18);
  } else if (kind === 'losa') {
    for (let s = 0; s < 3; s++) {
      const y0 = top + 1 + s * Math.floor(front / 3), lh = Math.floor(front / 3), ox = (s - 1) * 3;
      concreto(g, 2 + Math.max(0, ox), y0, w - 4 - Math.abs(ox), lh, C.st3, C.st2, C.st4, s + 9);
      g.rect(C.st1, 2, y0 + lh - 1, w - 4, 1);
    }
    for (let k = 0; k < 6; k++) g.line(C.te2, 6 + k * 15, top + 4, 4 + k * 15, top - 3);
  } else {
    // Viga de acero en I sobre dos bloques de concreto.
    g.rect(C.st1, 2, top + 1, w - 4, 4); g.rect(C.st3, 2, top + 1, w - 4, 1); g.rect(C.st0, 6, top + 5, w - 12, 5); g.rect(C.st2, 2, top + 10, w - 4, 3);
    for (let x = 10; x < w - 10; x += 14) { g.set(C.st4, x, top + 2); g.set(C.te2, x + 2, top + 11); }
    for (const bx of [6, w - 34]) concreto(g, bx, top + 13, 28, front - 12, C.st3, C.st2, C.st4, bx);
  }
  for (let x = 0; x < w; x++) if (hash(x, 7, 2) > 0.6) g.set(C.st2, x, h - 1 - Math.floor(hash(x, 8, 2) * 2));
  grieta(g, w * 0.6, top + 3, front - 4, C.ink, w, 0.2);
  g.outline(outlineOf);
}

/* ============================ REFORMA ============================ */

/** Columna del Ángel caída: tambores de cantera partidos con anillos dorados, en el asfalto. */
function angelColumna(g: Lienzo): void {
  const W = 208, base = 55;
  for (let d = 0; d < 4; d++) {
    const x0 = 6 + d * 50 + (d > 1 ? 6 : 0), len = 44, cy = 34 + d % 2, r = 13 - Math.floor(d / 2);
    for (let x = 0; x < len; x++) for (let y = -r; y <= r; y++) {
      const t = (y + r) / (2 * r);
      let c: string = t < 0.2 ? C.st5 : t < 0.55 ? C.st4 : t < 0.85 ? C.st3 : C.st2;
      if (x % 10 === 0 && t > 0.1) c = C.st2; // estrías
      if (x < 3 || x > len - 4) c = C.wa1; // anillos de bronce dorado
      if ((x < 3 || x > len - 4) && t < 0.3) c = C.wa3;
      g.set(c, x0 + x, cy + y);
    }
    // Cara de rotura en el extremo (elipse de piedra clara).
    g.ellipse(C.st4, x0 + len, cy, 3, r); g.ellipse(C.st3, x0 + len, cy, 1, r - 3);
    for (let k = 0; k < 5; k++) g.set(C.st2, x0 + len + 1, cy - r + 2 + k * 5);
  }
  // Polvo y fragmentos.
  for (let k = 0; k < 40; k++) g.rect(hash(k, 3, 2) > 0.8 ? C.wa2 : C.st3, 4 + hash(k, 1, 2) * (W - 8), base - hash(k, 2, 2) * 6, 2, 1);
  for (let x = 2; x < W - 2; x++) g.set(C.st1, x, base);
  grieta(g, 60, 22, 22, C.st1, 2, 0.4); grieta(g, 130, 24, 20, C.st1, 3, -0.2);
  g.outline(outlineOf);
  // Veladoras y cempasúchil que la gente dejó encima.
  cempasuchilMata(g, 70, 22, 16, 4); cempasuchilMata(g, 160, 24, 14, 5);
}

/** La Victoria alada dorada, caída de espaldas: un ala rota hacia arriba, corona de laurel en la mano. */
function angelFigura(g: Lienzo): void {
  const W = 144, base = 71;
  // Ala trasera (aplastada en el suelo) y ala delantera alzada y rota.
  for (let k = 0; k < 60; k++) {
    const x = 40 + k, y0 = base - 8 - Math.round(Math.sin(k / 59 * Math.PI) * 6);
    g.rect(C.wa0, x, y0, 1, 6);
    if (k % 4 === 0) g.set(C.wa1, x, y0);
  }
  for (let f = 0; f < 9; f++) {
    // Plumas del ala alzada: abanico desde el hombro (x≈64, y≈44) hacia arriba-izquierda.
    const a = -Math.PI * (0.55 + f * 0.045), len = 40 - Math.abs(f - 4) * 3;
    for (let s = 0; s < len; s++) {
      const x = 64 + Math.cos(a) * s, y = 42 + Math.sin(a) * s;
      g.set(s > len - 6 ? C.wa1 : f % 2 ? C.wa2 : C.wa1, x, y); g.set(C.wa0, x + 1, y + 1);
      if (s % 5 === 0) g.set(C.wa3, x, y);
    }
  }
  // Raíz del ala unida al hombro.
  g.ellipse(C.wa1, 63, 46, 6, 5); g.ellipse(C.wa2, 62, 45, 3, 3);
  // Rotura del ala alzada (punta faltante) y trozo caído al lado.
  for (let k = 0; k < 10; k++) g.erase(28 + k, 4 + Math.round(k * 0.6), 4, 6);
  g.rect(C.wa1, 14, base - 6, 10, 4); g.rect(C.wa2, 14, base - 6, 10, 1); g.rect(C.wa0, 22, base - 4, 4, 2);
  // Cuerpo tendido de espaldas: piernas con túnica, torso, brazo con la corona de laurel extendido.
  for (let x = 60; x < 128; x++) {
    const t = (x - 60) / 68, half = Math.round(8 - t * 3 + Math.sin(t * Math.PI) * 2), cy = base - 14 + Math.round(t * 4);
    for (let y = -half; y <= half; y++) {
      const tt = (y + half) / (half * 2 + 1);
      g.set(tt < 0.25 ? C.wa3 : tt < 0.6 ? C.wa2 : tt < 0.85 ? C.wa1 : C.wa0, x, cy + y);
      if ((x + y * 2) % 7 === 0 && tt > 0.3) g.set(C.wa1, x, cy + y); // pliegues de la túnica
    }
  }
  // Piernas bajo la túnica (pliegue que las separa), pies descalzos y cintura ceñida.
  for (let x = 98; x < 128; x++) g.set(C.wa0, x, base - 11 + Math.round((x - 98) * 0.12));
  g.rect(C.wa0, 84, base - 20, 2, 12); g.rect(C.wa3, 82, base - 20, 1, 10);
  g.ellipse(C.wa2, 130, base - 14, 3, 2); g.ellipse(C.wa2, 131, base - 8, 3, 2); g.set(C.wa3, 129, base - 15);
  // Torso y pecho en luz.
  g.ellipse(C.wa3, 72, base - 17, 6, 3);
  // Cabeza (perfil hacia arriba) con cabello recogido.
  g.ellipse(C.wa2, 54, base - 18, 6, 6); g.ellipse(C.wa3, 52, base - 20, 3, 3); g.rect(C.wa1, 49, base - 22, 4, 6);
  g.set(C.wa0, 58, base - 18); g.set(C.wa0, 59, base - 16);
  // Brazo extendido con la corona de laurel; el otro brazo con la cadena rota.
  g.line(C.wa2, 70, base - 20, 92, base - 34, 3); g.line(C.wa1, 70, base - 18, 92, base - 32);
  for (let a = 0; a < 18; a++) { const x = 96 + Math.cos(a * 0.35) * 6, y = base - 36 + Math.sin(a * 0.35) * 5; g.set(a % 2 ? C.wa1 : C.fo4, x, y); }
  g.line(C.wa1, 76, base - 8, 100, base - 4, 2);
  for (let k = 0; k < 4; k++) g.ellipse(C.wa0, 104 + k * 4, base - 3, 1, 1);
  // Pátina, grietas y polvo.
  for (let k = 0; k < 30; k++) { const x = 40 + hash(k, 1, 4) * 90, y = 20 + hash(k, 2, 4) * 50; if (g.has(x, y)) g.set(hash(k, 3, 4) > 0.5 ? C.tq1 : C.ea2, x, y); }
  grieta(g, 90, base - 20, 10, C.wa0, 6, 0);
  for (let x = 4; x < W - 4; x++) if (hash(x, 1, 5) > 0.45) g.set(C.st2, x, base - Math.floor(hash(x, 2, 5) * 2));
  g.outline(c => (c.startsWith('#f') || c === C.wa1 ? C.wa0 : outlineOf(c)));
}

function letras(g: Lienzo): void {
  const word = 'CDMX';
  const ramps: Array<[string, string, string, string]> = [
    [C.ro0, C.ro1, C.ro2, C.ro3], [C.tq0, C.tq1, C.tq2, C.tq3], [C.pu0, C.pu1, C.pu2, C.pu3], [C.wa0, C.wa1, C.wa2, C.wa3],
  ];
  g.rect(C.st1, 2, 58, 132, 14); g.rect(C.st2, 3, 59, 130, 12); g.rect(C.st4, 3, 59, 130, 1);
  for (let x = 4; x < 132; x++) if (patronOn('escalon', x, 1)) g.set(C.st1, x, 64);
  for (let n = 0; n < word.length; n++) {
    const glyph = BIG_CDMX[word[n]], [o, d, md, l] = ramps[n], ox = 10 + n * 30, oy = 14 + (n % 2);
    const on = (x: number, y: number) => y >= 0 && y < 7 && x >= 0 && x < 5 && glyph[y][x] === '1';
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) {
      g.rect(C.ink, ox + x * 4 + 3, oy + y * 6 + 3, 4, 6); g.rect(d, ox + x * 4 + 2, oy + y * 6 + 2, 4, 6);
    }
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) {
      for (let py = 0; py < 6; py++) for (let px = 0; px < 4; px++) {
        const tx = ox + x * 4 + px, ty = oy + y * 6 + py;
        let c = bayer(tx, ty) < 0.7 - (y * 6 + py) / 42 * 0.6 ? l : md;
        if ((!on(x - 1, y) && px === 0) || (!on(x, y - 1) && py === 0)) c = l;
        const wear = hash(tx, ty, n + 60);
        if (wear > 0.94) c = C.st3; else if (wear < 0.03) c = C.st1;
        g.set(c, tx, ty);
      }
    }
    for (let y = oy - 1; y < oy + 44; y++) for (let x = ox - 1; x < ox + 22; x++) {
      if (g.get(x, y) === undefined && (g.get(x + 1, y) === l || g.get(x, y + 1) === l || g.get(x + 1, y) === md || g.get(x, y + 1) === md)) g.set(o, x, y);
    }
    const rx = ox + 2 + Math.floor(hash(n, 1) * 15);
    for (let y = oy + 22; y < oy + 30 + n % 3 * 4; y++) if (g.has(rx, y)) g.set(C.ea2, rx, y);
  }
  // La M perdió un pedazo y la X está ladeada y rajada.
  for (let k = 0; k < 9; k++) g.erase(10 + 2 * 30 + 13 + k, 14, 1, 11 - k);
  for (let s = 0, x = 10 + 3 * 30 + 8, y = 15; s < 28; s++) { x += s % 4 === 0 ? 1 : 0; y += 1; if (g.has(x, y)) g.set(C.ink, x, y); }
  // Papel picado roto, cempasúchil y veladoras al pie.
  for (let x = 4; x < 132; x++) g.set(C.ink, x, 5 + Math.round(Math.sin(x * 0.05) * 2));
  for (let x = 8; x < 128; x += 10) {
    const y = 6 + Math.round(Math.sin(x * 0.05) * 2);
    if (hash(x, 3) < 0.3) continue;
    g.rect(PAPEL[Math.floor(x / 10) % PAPEL.length], x, y + 1, 7, 6 - Math.floor(hash(x, 4) * 3)); g.set(C.ink, x + 2, y + 3); g.set(C.ink, x + 4, y + 3);
  }
  for (const vx of [14, 52, 90, 122]) { g.rect(C.sh1, vx, 54, 3, 5); g.rect(C.wa4, vx, 54, 1, 5); g.set(C.wa3, vx + 1, 52); g.set(C.wa2, vx + 1, 53); }
  for (const fx of [28, 70, 108]) cempasuchilMata(g, fx - 6, 58, 12, fx);
}

/** Fachada de la estación base del teleférico (prop independiente del fondo). */
function estacionProp(g: Lienzo, f: number): void {
  const W = 192, H = 144, base = H - 1, top = 30;
  concreto(g, 6, top, W - 12, base - top, C.st2, C.st1, C.st3, 31);
  g.rect(C.st3, 0, top - 8, W, 8); g.rect(C.st5, 0, top - 8, W, 1); g.rect(C.st1, 0, top - 1, W, 1);
  // Bandas horizontales retrofuturistas.
  for (let y = top + 8; y < top + 30; y += 6) { g.rect(C.st3, 6, y, W - 12, 2); g.rect(C.st1, 6, y + 2, W - 12, 1); }
  // Arco de vidrio con luz cálida y la cabina detenida en el andén.
  const cx = W / 2;
  for (let y = 0; y < 70; y++) {
    const half = y < 34 ? Math.round(Math.sqrt(34 * 34 - (34 - y) ** 2) * 1.5) : 51;
    g.rect(C.st4, cx - half - 3, base - 70 + y, half * 2 + 6, 1);
    for (let px = -half; px < half; px++) g.set((px + 200) % 12 === 0 || y % 16 === 0 ? C.st1 : hash(px, y, 6) > 0.88 ? C.ink : y > 36 ? C.wa0 : C.tq0, cx + px, base - 70 + y);
  }
  for (let y = base - 38; y < base; y++) for (let x = cx - 14; x < cx + 14; x++) g.set(y < base - 30 ? C.st3 : x === cx ? C.st2 : C.ro1, x, y);
  g.rect(C.wa2, cx - 10, base - 28, 8, 6); g.rect(C.wa2, cx + 2, base - 28, 8, 6);
  // Letrero con neón turquesa (parpadea por cuadro).
  g.rect(C.ink, cx - 46, top + 2, 92, 13); g.rect(C.st0, cx - 45, top + 3, 90, 11);
  miniText(g, f === 1 ? C.tq0 : C.tq2, 'TELEFERICO', cx - 20, top + 6);
  // Torre de poleas sobre el techo y cables que suben.
  g.rect(C.st1, W - 46, 0, 8, top - 8); g.rect(C.st3, W - 46, 0, 2, top - 8);
  g.ellipse(C.st2, W - 42, 4, 10, 3); g.ellipse(C.ink, W - 42, 4, 6, 1);
  // Boquetes y varilla.
  for (const [hx, hy] of [[20, top + 40], [W - 26, top + 54]] as const) { g.ellipse(C.ink, hx, hy, 8, 6); for (let k = 0; k < 4; k++) g.line(C.te2, hx - 5 + k * 3, hy - 5, hx - 4 + k * 3, hy + 3); }
  g.outline(outlineOf);
}

/** Cabina del teleférico colgando de su brazo (para el decorado o como prop). */
function cabina(g: Lienzo, f: number): void {
  g.rect(C.st1, 15, 0, 2, 10); g.rect(C.st2, 11, 0, 10, 2);
  g.rect(C.st2, 4, 10, 24, 26); g.rect(C.st3, 4, 10, 24, 2); g.rect(C.st1, 4, 33, 24, 3);
  g.rect(C.ink, 6, 14, 20, 12); g.rect(f % 2 ? C.wa1 : C.wa0, 7, 15, 8, 10); g.rect(C.tq0, 17, 15, 8, 10);
  g.rect(C.ro1, 4, 28, 24, 2);
  g.outline(outlineOf);
}

/* ================================ NPCs ================================ */

interface Look { skin: [string, string, string]; shirt: [string, string, string]; pants: [string, string]; feet: string }

/** Cuerpo base de perfil (mirando a la derecha). `bob` baja torso y cabeza 1 px al respirar. */
function body(g: Lienzo, l: Look, bob: number, stoop = 0, skirt?: [string, string, string]): void {
  const sk1 = l.skin[1];
  if (skirt) {
    for (let y = 48; y < 76; y++) {
      const spread = Math.floor((y - 48) / 6);
      g.rect(skirt[0], 24 - spread, y, 17 + spread * 2, 1);
      g.rect(skirt[1], 24 - spread, y, 5, 1);
      if (y > 71) g.rect(skirt[2], 24 - spread, y, 17 + spread * 2, 1);
    }
    g.rect(sk1, 29, 76, 4, 2); g.rect(sk1, 35, 76, 4, 2);
  } else {
    g.rect(l.pants[1], 26, 50, 7, 26); g.rect(l.pants[0], 33, 50, 7, 26);
    g.rect(l.pants[1], 33, 50, 1, 26); g.rect(l.pants[1], 32, 56, 1, 18);
  }
  g.rect(l.feet, 26, 76, 8, 2); g.rect(l.feet, 33, 76, 9, 2);
  const ty = 28 + bob, tx = 23 + stoop;
  for (let y = 0; y < 23 - bob; y++) {
    const inset = y === 0 ? 2 : y === 1 ? 1 : y > 15 ? 1 : 0;
    g.rect(l.shirt[1], tx + inset, ty + y, 19 - inset * 2, 1);
    if (y > 0 && y < 21 - bob) g.rect(l.shirt[0], tx + 2 + inset, ty + y, 12 - inset, 1);
  }
  g.rect(l.shirt[2], tx + 3, ty + 2, 2, 16 - bob);
  g.rect(l.shirt[1], tx + 10, ty + 5, 1, 14 - bob);
  head(g, 25 + stoop * 2, 9 + bob + stoop, l.skin);
}

function head(g: Lienzo, hx: number, hy: number, skin: [string, string, string]): void {
  const [sk0, sk1, sk2] = skin;
  g.rect(sk0, hx + 6, hy + 16, 6, 4);
  g.ellipse(sk1, hx + 8, hy + 9, 8, 9);
  g.rect(sk1, hx + 9, hy + 13, 6, 4);
  g.ellipse(sk2, hx + 8, hy + 7, 5, 5);
  g.rect(sk1, hx + 15, hy + 8, 2, 4); g.set(sk2, hx + 16, hy + 8);
  g.set(C.ink, hx + 13, hy + 8); g.set(C.ink, hx + 13, hy + 9); g.set(sk2, hx + 12, hy + 7);
  g.rect(sk0, hx + 11, hy + 6, 3, 1);
  g.rect(sk0, hx + 12, hy + 14, 3, 1);
  g.rect(sk0, hx + 4, hy + 8, 3, 4); g.set(sk1, hx + 5, hy + 9);
}

function arm(g: Lienzo, l: Look, bob: number, reach: number, drop: number, stoop = 0): [number, number] {
  const sx = 29 + stoop, sy = 31 + bob, hx = sx + reach, hy = sy + 14 + drop;
  g.line(l.shirt[1], sx, sy, hx - 1, hy - 1, 4); g.line(l.shirt[0], sx, sy, hx - 1, hy - 2, 2);
  g.rect(l.skin[1], hx - 1, hy - 1, 4, 4); g.set(l.skin[2], hx - 1, hy - 1);
  return [hx, hy];
}

const outlineChar = (c: string): string => (c === C.sh1 || c === C.sh0 || c === C.wa4 ? C.st2 : outlineOf(c));

/** 1 · Señora con rebozo gris-azul y una veladora encendida entre las manos. */
function senoraVeladora(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh0, C.st4, C.sh1], pants: [C.st1, C.st2], feet: C.ea1 };
  body(g, look, bob, 1, [C.te1, C.te0, C.ea0]);
  const hx = 27, hy = 10 + bob;
  g.rect(C.st0, hx + 2, hy, 10, 3); g.rect(C.st3, hx + 4, hy, 4, 1); // canas
  // Rebozo gris-azul de rayas finas: cubre cabeza y hombros y cae por la espalda con flecos.
  for (let y = -2; y < 44; y++) {
    // Sobre la cabeza, luego cae por la espalda; un extremo cruza el hombro en diagonal.
    const x0 = y < 2 ? hx + 1 - y : hx - 4, x1 = y < 2 ? hx + 12 : y < 16 ? hx + 6 : y < 28 ? hx + 6 + Math.round((28 - y) * 0.6) : hx + 4;
    g.rect(y % 3 === 0 ? C.mtn2 : y % 3 === 1 ? C.mtn1 : C.mtn0, x0, hy + y, x1 - x0, 1);
    if (y > 37 && y % 2 === 0) for (let x = x0; x < x1; x += 2) g.set(C.sh0, x, hy + y + 1);
  }
  // Brazos juntos al frente sosteniendo la veladora (vaso con la Virgen pintada).
  g.line(C.mtn1, 30, 32 + bob, 40, 42 + bob, 4); g.rect(C.sk1, 39, 40 + bob, 4, 4); g.set(C.sk2, 39, 40 + bob);
  g.rect(C.sh1, 41, 33 + bob, 4, 8); g.rect(C.wa4, 41, 33 + bob, 1, 8); g.rect(C.tq1, 42, 36 + bob, 2, 3);
  g.rect(C.sk1, 43, 39 + bob, 3, 3);
  g.rect(C.wa2, hx + 5, hy + 13, 1, 2); // arete
  g.outline(outlineChar);
  flame(g, 43, 31 + bob, f, 1.2);
}

/** 2 · Vendedor de pan de muerto: gorra, mandil, charola de pan sobre el hombro. */
function vendedorPan(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.wa1, C.wa0, C.wa2], pants: [C.st1, C.st2], feet: C.ea1 };
  body(g, look, bob);
  const hx = 25, hy = 9 + bob;
  g.rect(C.ea0, hx, hy + 1, 6, 9); g.rect(C.ea0, hx + 12, hy + 13, 5, 1); // cabello y bigote
  // Gorra.
  g.rect(C.tq0, hx + 1, hy - 1, 13, 4); g.rect(C.tq1, hx + 2, hy - 1, 8, 1); g.rect(C.tq0, hx + 12, hy + 2, 7, 1);
  // Mandil blanco con harina.
  for (let y = 36; y < 64; y++) g.rect(y < 38 ? C.sh0 : C.sh1, 30, y + bob, 11, 1);
  for (let k = 0; k < 6; k++) g.set(C.sh0, 31 + hash(k, 1, 4) * 9, 42 + hash(k, 2, 4) * 18 + bob);
  // Brazo levantado sostiene la charola de pan sobre el hombro.
  // Charola sobre la cabeza, sostenida con una mano en alto.
  const tray = f === 1 ? -1 : 0, ty = 5 + bob + tray;
  g.line(C.wa0, 34, 31 + bob, 44, 18 + bob, 4); g.line(C.wa0, 44, 18 + bob, 45, ty + 3, 3); g.rect(C.sk1, 44, ty + 1, 4, 4);
  g.rect(C.ea2, 20, ty, 30, 3); g.rect(C.ea3, 20, ty, 30, 1);
  for (let k = 0; k < 5; k++) panMuerto(g, 23 + k * 6, ty, 3);
  g.rect(C.ro1, 20, ty + 3, 30, 1); // servilleta bordada
  // Otro brazo con una bolsa de papel.
  const [ax, ay] = arm(g, look, bob, 4, 3);
  g.rect(C.ea4, ax - 2, ay + 1, 7, 8); g.rect(C.ea3, ax - 2, ay + 1, 7, 1);
  g.outline(outlineChar);
}

/** 3 · Joven con chamarra, gorro, mochila y lámpara de mano. */
function jovenMochila(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.te2, C.te1, C.te3], pants: [C.night, C.mtn0], feet: C.sh1 };
  // Mochila a la espalda.
  g.rect(C.fo2, 16, 30 + bob, 9, 18); g.rect(C.fo3, 16, 30 + bob, 9, 2); g.rect(C.fo1, 16, 40 + bob, 9, 1); g.rect(C.wa2, 18, 42 + bob, 2, 2);
  body(g, look, bob);
  const hx = 25, hy = 9 + bob;
  g.rect(C.st0, hx, hy + 1, 7, 8); g.rect(C.st0, hx + 4, hy + 2, 8, 2);
  // Gorro tejido.
  g.rect(C.ro1, hx + 1, hy - 3, 13, 5); g.rect(C.ro2, hx + 2, hy - 3, 9, 1); for (let x = hx + 1; x < hx + 14; x += 2) g.set(C.ro0, x, hy + 1);
  g.set(C.sh1, hx + 7, hy - 4);
  // Chamarra: cierre, bolsillos, cuello, tirantes de la mochila.
  g.rect(C.st4, 37, 30 + bob, 1, 18); g.rect(C.te1, 24, 28 + bob, 19, 2); g.rect(C.fo1, 28, 30 + bob, 2, 16);
  g.rect(C.te1, 33, 42 + bob, 4, 3);
  // Tenis.
  g.rect(C.sh1, 26, 76, 8, 2); g.rect(C.sh1, 33, 76, 9, 2); g.rect(C.rd0, 35, 76, 2, 1);
  // Brazo con la lámpara (encendida/apagada al parpadear).
  const [ax, ay] = arm(g, look, bob, 10, -2 + (f === 3 ? 1 : 0));
  g.rect(C.st1, ax, ay - 2, 6, 3); g.rect(C.st3, ax, ay - 2, 6, 1);
  g.outline(outlineChar);
  if (f !== 2) { g.rect(C.wa4, ax + 6, ay - 2, 1, 3); g.set(C.wa3, ax + 7, ay - 1); }
}

/** 4 · Anciano con sombrero de fieltro, saco viejo, bufanda y bastón. */
function ancianoSombrero(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0, stoop = 2;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.ea2, C.ea1, C.ea3], pants: [C.st2, C.st3], feet: C.ea0 };
  // Bastón.
  g.rect(C.ea1, 47, 36, 2, 42); g.rect(C.ea3, 47, 36, 1, 42); g.rect(C.ea2, 44, 34, 5, 3);
  body(g, look, bob, stoop);
  const hx = 29, hy = 11 + bob;
  g.rect(C.st4, hx, hy + 2, 5, 8); g.rect(C.sh1, hx + 11, hy + 13, 6, 2); g.set(C.sk0, hx + 12, hy + 5); g.set(C.sk0, hx + 14, hy + 11);
  // Sombrero de fieltro con ala corta y cinta.
  g.rect(C.st1, hx - 1, hy, 19, 2); g.rect(C.st2, hx + 2, hy - 7, 12, 7); g.rect(C.st3, hx + 3, hy - 7, 8, 1);
  g.rect(C.ink, hx + 2, hy - 2, 12, 2); g.rect(C.st1, hx + 7, hy - 7, 2, 2);
  // Bufanda tejida y solapas del saco.
  g.rect(C.rd0, 26, 28 + bob, 16, 3); g.rect(C.rd1, 27, 28 + bob, 10, 1); g.rect(C.rd0, 27, 31 + bob, 3, 8);
  g.line(C.ea1, 33, 31 + bob, 38, 44 + bob, 1); g.rect(C.st5, 34, 32 + bob, 2, 4); // camisa
  const [ax, ay] = arm(g, look, bob, 16, 3 + (f === 1 ? 1 : 0), stoop);
  void ax; void ay;
  g.outline(outlineChar);
}

/** 5 · Cronista con lentes, chalina, morral y libreta (escribe: el lápiz se mueve). */
function cronista(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk1, C.sk2, C.sk3], shirt: [C.pu1, C.pu0, C.pu2], pants: [C.st2, C.st3], feet: C.ea1 };
  // Morral de lana con rombos a la espalda.
  g.line(C.ea2, 27, 29 + bob, 22, 48 + bob, 1);
  for (let y = 44; y < 56; y++) for (let x = 16; x < 26; x++) g.set(patronOn('rombo', x, y) ? C.wa2 : C.rd0, x, y + bob);
  body(g, look, bob, 0, [C.st1, C.st0, C.ink]);
  const hx = 25, hy = 9 + bob;
  // Cabello corto y lentes redondos.
  g.rect(C.ea0, hx, hy - 1, 14, 5); g.rect(C.ea0, hx, hy, 7, 12); g.rect(C.ea1, hx + 3, hy - 1, 6, 1);
  g.rect(C.st0, hx + 11, hy + 7, 5, 1); g.rect(C.st0, hx + 11, hy + 7, 1, 3); g.rect(C.st0, hx + 15, hy + 7, 1, 3); g.set(C.mtn3, hx + 13, hy + 8);
  // Chalina turquesa.
  g.rect(C.tq1, 26, 27 + bob, 16, 3); g.rect(C.tq2, 27, 27 + bob, 10, 1); g.rect(C.tq1, 38, 30 + bob, 3, 12);
  for (let k = 0; k < 3; k++) g.set(C.tq3, 38 + k, 42 + bob);
  // Libreta abierta en una mano y lápiz en la otra.
  g.line(C.pu0, 30, 31 + bob, 41, 38 + bob, 4); g.rect(C.sk2, 40, 37 + bob, 3, 3);
  g.rect(C.sh1, 40, 33 + bob, 10, 7); g.rect(C.sh0, 45, 33 + bob, 1, 7); for (let k = 0; k < 3; k++) g.rect(C.st3, 41, 35 + k * 2 + bob, 3, 1);
  const px = 46 + (f % 2), py = 34 + bob + (f === 2 ? 1 : 0);
  g.line(C.pu0, 33, 33 + bob, px - 2, py + 4, 3); g.rect(C.sk2, px - 3, py + 3, 3, 3);
  g.line(C.wa2, px - 1, py + 3, px + 2, py - 1);
  g.outline(outlineChar);
}

/* ============================== CATÁLOGO ============================== */

export const CDMX_ART: CdmxArtSpec[] = [
  { key: 'prop_n06_ofrenda_grande', dir: PROPS, w: 112, h: 96, frames: 4, fps: 8, feetY: 95, draw: (g, f) => ofrendaGrande(g, f, false) },
  { key: 'prop_n06_ofrenda_descanso', dir: PROPS, w: 112, h: 96, frames: 4, fps: 6, feetY: 95, draw: (g, f) => ofrendaGrande(g, f, true) },
  { key: 'prop_n06_ofrenda_chica', dir: PROPS, w: 48, h: 44, frames: 4, fps: 8, feetY: 43, draw: ofrendaChica },
  { key: 'prop_n06_ofrenda_flotante', dir: PROPS, w: 96, h: 48, frames: 4, fps: 8, feetY: 47, draw: ofrendaFlotante },
  { key: 'prop_n06_brasero', dir: PROPS, w: 32, h: 48, frames: 4, fps: 8, feetY: 47, draw: brasero },
  { key: 'prop_n06_inscripcion', dir: PROPS, w: 56, h: 56, frames: 2, fps: 2, feetY: 55, draw: inscripcion },
  { key: 'prop_n06_trajinera', dir: PROPS, w: 176, h: 58, frames: 1, feetY: 57, draw: g => trajinera(g) },
  { key: 'prop_n06_ahuejote', dir: PROPS, w: 40, h: 128, frames: 1, feetY: 127, draw: g => ahuejoteProp(g) },
  { key: 'prop_n06_arbol_munecas', dir: PROPS, w: 104, h: 128, frames: 4, fps: 2, feetY: 127, draw: arbolMunecasProp },
  { key: 'prop_n06_papel_picado', dir: PROPS, w: 128, h: 28, frames: 4, fps: 4, feetY: 27, draw: papelPicado },
  { key: 'prop_n06_cempasuchil', dir: PROPS, w: 28, h: 16, frames: 1, feetY: 15, draw: g => cempasuchilProp(g) },
  { key: 'prop_n06_maceta_cempasuchil', dir: PROPS, w: 20, h: 24, frames: 1, feetY: 23, draw: g => maceta(g) },
  { key: 'prop_n06_calaverita', dir: PROPS, w: 12, h: 12, frames: 1, feetY: 11, draw: g => calaveritaProp(g) },
  { key: 'prop_n06_calaveritas', dir: PROPS, w: 32, h: 16, frames: 1, feetY: 15, draw: g => calaveritas(g) },
  { key: 'prop_n06_veladoras', dir: PROPS, w: 32, h: 20, frames: 4, fps: 8, feetY: 19, draw: veladoras },
  { key: 'prop_n06_auto', dir: PROPS, w: 96, h: 44, frames: 1, feetY: 43, draw: g => auto(g, C.tq1, C.tq0, C.tq2, C.tq1, false) },
  { key: 'prop_n06_auto_2', dir: PROPS, w: 96, h: 44, frames: 1, feetY: 43, draw: g => auto(g, C.wa1, C.te1, C.wa2, C.te2, false) },
  { key: 'prop_n06_taxi', dir: PROPS, w: 96, h: 44, frames: 1, feetY: 43, draw: g => auto(g, C.ro2, C.ro1, C.ro3, C.sh1, true) },
  { key: 'prop_n06_poste_neon', dir: PROPS, w: 32, h: 96, frames: 4, fps: 5, feetY: 95, draw: posteNeon },
  { key: 'prop_n06_escombros', dir: PROPS, w: 64, h: 24, frames: 1, feetY: 23, draw: g => escombros(g) },
  { key: 'prop_n06_escombros_grandes', dir: PROPS, w: 104, h: 48, frames: 1, feetY: 47, draw: g => escombrosGrandes(g) },
  // Plataformas del doble salto: cara superior plana + frente; altura visual ≈ h − top.
  { key: 'prop_n06_cornisa', dir: PROPS, w: 88, h: 44, frames: 1, feetY: 43, draw: g => plataforma(g, 88, 44, 10, 'cornisa') },
  { key: 'prop_n06_losa_alta', dir: PROPS, w: 96, h: 46, frames: 1, feetY: 45, draw: g => plataforma(g, 96, 46, 10, 'losa') },
  { key: 'prop_n06_viga', dir: PROPS, w: 112, h: 50, frames: 1, feetY: 49, draw: g => plataforma(g, 112, 50, 12, 'viga') },
  { key: 'prop_n06_angel_columna', dir: PROPS, w: 208, h: 56, frames: 1, feetY: 55, draw: g => angelColumna(g) },
  { key: 'prop_n06_angel_figura', dir: PROPS, w: 144, h: 72, frames: 1, feetY: 71, draw: g => angelFigura(g) },
  { key: 'prop_n06_letras_cdmx', dir: PROPS, w: 136, h: 72, frames: 1, feetY: 71, draw: g => letras(g) },
  { key: 'prop_n06_estacion_teleferico', dir: PROPS, w: 192, h: 144, frames: 2, fps: 2, feetY: 143, draw: estacionProp },
  { key: 'prop_n06_cabina', dir: PROPS, w: 32, h: 38, frames: 2, fps: 2, feetY: 37, draw: cabina },
  { key: 'npc_sobreviviente_1', dir: NPCS, w: 64, h: 80, frames: 4, fps: 5, feetY: 78, draw: senoraVeladora },
  { key: 'npc_sobreviviente_2', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: vendedorPan },
  { key: 'npc_sobreviviente_3', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: jovenMochila },
  { key: 'npc_sobreviviente_4', dir: NPCS, w: 64, h: 80, frames: 4, fps: 3, feetY: 78, draw: ancianoSombrero },
  { key: 'npc_sobreviviente_5', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: cronista },
];

/** Dibuja un cuadro de una entrada del catálogo. */
export function drawCdmxArt(spec: CdmxArtSpec, frame: number): Lienzo {
  const g = new Lienzo(spec.w, spec.h);
  spec.draw(g, frame);
  return g;
}
