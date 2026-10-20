/**
 * Props y NPCs comunes del Nivel 7 (CDMX parte 2). Cada entrada describe un PNG (o tira de cuadros)
 * que genera tools/gen-cdmx2-scenery.mjs y que el juego también dibuja como respaldo si falta.
 * NPCs comunes (técnicos de la torre) con diseño completo (AGENTS.md §8.0): 64×80, pivote (32, 78),
 * mirando a la derecha. El Rey del Olvido, la Llorona, María, Balam, los clones y la guardia de élite
 * NO están aquí: son personajes importantes (placeholders de otros agentes; arte final del equipo).
 */
import { C, Lienzo, bayer, frisoGreca, grieta, hash, miniText, outlineOf } from './CdmxPixels';

export interface Cdmx2ArtSpec {
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

const PROPS = 'escenarios/nivel-07-cdmx2/props';
const NPCS = 'sprites/npcs';

/* =============================== AYUDAS =============================== */

/** Llama (fría = azul del olvido). */
function flame(g: Lienzo, x: number, y: number, frame: number, size = 1, fria = false): void {
  const h = [6, 7, 5, 7][frame % 4] * size, sway = [0, 1, 0, -1][frame % 4];
  const outer = fria ? C.tq0 : C.wa1, mid = fria ? C.tq2 : C.wa2, core = fria ? C.tq3 : C.wa4;
  for (let i = 0; i < h; i++) {
    const t = i / h, half = Math.round((1 - t) * 1.8 * size), sx = x + Math.round(sway * t * size);
    g.rect(outer, sx - half - (i < h * 0.4 ? 1 : 0), y - i, half * 2 + 1 + (i < h * 0.4 ? 2 : 0), 1);
    if (i < h - 1) g.rect(mid, sx - Math.max(0, half - 1), y - i, Math.max(1, half * 2 - 1), 1);
    if (i < h * 0.45) g.set(core, sx, y - i);
  }
}

/** Pantalla con ruido de estática (seed distinto por cuadro). */
function estatica(g: Lienzo, x: number, y: number, w: number, h: number, seed: number, tint: 'gris' | 'rojo' | 'verde' = 'gris'): void {
  const ramp = tint === 'rojo' ? [C.ro0, C.rd0, C.rd1, C.rd2] : tint === 'verde' ? [C.fo1, C.fo3, C.lg0, C.lg1] : [C.night, C.mtn0, C.mtn2, C.sh1];
  for (let py = 0; py < h; py++) {
    const band = hash(py, 3, seed) > 0.9 ? 1 : 0; // franja horizontal que corre
    for (let px = 0; px < w; px++) {
      const v = hash(px + x, py + y, seed) * 0.8 + band * 0.3;
      g.set(ramp[Math.min(3, Math.floor(v * 4))], x + px, y + py);
    }
  }
}

/** Líneas de datos (texto ilegible) en una pantalla. */
function datos(g: Lienzo, x: number, y: number, w: number, h: number, seed: number, c: string = C.tq2): void {
  g.rect(C.night, x, y, w, h);
  for (let r = 1; r < h - 1; r += 2) {
    const len = Math.round(hash(r, 1, seed) * (w - 3));
    for (let k = 0; k < len; k++) if (hash(k, r, seed + 5) > 0.25) g.set(r % 6 === 1 ? C.tq3 : c, x + 1 + k, y + r);
  }
}

/* =============================== TELEFÉRICO =============================== */

/** Hoja corrediza de la puerta de la cabina (con ventanilla transparente). */
function puertaCabina(g: Lienzo): void {
  const W = 72, H = 174;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.set(x < 3 ? C.st4 : x > W - 4 ? C.st1 : bayer(x, y) < 0.1 ? C.st2 : C.st3, x, y);
  g.rect(C.st5, 0, 0, W, 1); g.rect(C.st0, 0, H - 4, W, 4);
  // Ventanilla con empaque y vidrio (hueco = se ve la tormenta).
  g.rect(C.st4, 8, 12, W - 16, 76); g.rect(C.ink, 10, 14, W - 20, 72); g.erase(11, 15, W - 22, 70);
  for (let i = 0; i < 60; i++) for (let k = 0; k < 4; k++) g.veil(C.mtn2, 16 + i * 0.5 + k, 82 - i, 0.14);
  // Franjas del zócalo y letrero.
  g.rect(C.ro1, 3, 154, W - 6, 2); g.rect(C.tq1, 3, 157, W - 6, 1);
  g.rect(C.ink, 14, 96, 44, 9); miniText(g, C.rd1, 'EMERGENCIA', 16, 98);
  // Jaladera y remaches.
  g.rect(C.st1, W - 12, 100, 4, 34); g.rect(C.st5, W - 12, 100, 1, 34);
  for (let y = 6; y < H - 6; y += 22) { g.set(C.st5, 4, y); g.set(C.st5, W - 5, y); }
  // Riel inferior y escurrimientos de lluvia.
  for (let k = 0; k < 8; k++) { const x = 12 + hash(k, 1, 7) * 48; for (let y = 86; y < 86 + 8 + hash(k, 2, 7) * 20; y++) g.set(C.st2, x, y); }
}

/** Correa de mano colgante (el decorado la mece). Origen arriba al centro. */
function asidero(g: Lienzo): void {
  g.rect(C.st5, 3, 0, 6, 3); g.rect(C.st2, 3, 2, 6, 1);
  g.rect(C.ink, 5, 3, 2, 27); g.rect(C.st0, 5, 3, 1, 27);
  // Agarradera triangular de plástico.
  for (let y = 0; y < 12; y++) { const half = Math.round(y * 0.45) + 1; g.rect(C.tq1, 6 - half, 30 + y, half * 2, 1); }
  g.rect(C.tq2, 1, 41, 10, 2); g.erase(4, 34, 4, 5); g.set(C.tq3, 3, 39);
}

/** Otra cabina del teleférico (vista lejana, para el decorado). */
function cabinaLejana(g: Lienzo, f: number): void {
  g.rect(C.st1, 19, 0, 2, 13); g.rect(C.st2, 13, 0, 14, 3); g.ellipse(C.st0, 14, 2, 2, 2); g.ellipse(C.st0, 26, 2, 2, 2);
  g.rect(C.st2, 4, 13, 32, 36); g.rect(C.st3, 4, 13, 32, 2); g.rect(C.st1, 4, 45, 32, 4); g.rect(C.st1, 33, 15, 3, 30);
  g.rect(C.ink, 6, 18, 28, 16);
  g.rect(f % 2 ? C.wa1 : C.wa0, 7, 19, 12, 14); g.rect(C.tq0, 21, 19, 12, 14);
  // Siluetas encapuchadas adentro (la Cofradía controla la línea).
  g.ellipse(C.ink, 12, 26, 3, 3); g.rect(C.ink, 9, 28, 7, 5); g.ellipse(C.ink, 27, 27, 3, 3); g.rect(C.ink, 24, 29, 7, 4);
  g.rect(C.ro1, 4, 38, 32, 2);
  g.outline(outlineOf);
}

/** Torre de celosía cercana que pasa junto a la cabina (origen arriba al centro, en el cable). */
function torreCable(g: Lienzo): void {
  const W = 112, H = 400, cx = W / 2;
  // Ménsula superior con poleas y cables.
  g.rect(C.st1, 2, 14, W - 4, 8); g.rect(C.st3, 2, 14, W - 4, 1); g.rect(C.st0, 2, 21, W - 4, 1);
  for (const px of [12, 34, W - 36, W - 14]) { g.ellipse(C.st0, px, 12, 7, 7); g.ellipse(C.st2, px, 12, 5, 5); g.ellipse(C.st0, px, 12, 1, 1); }
  g.rect(C.rd0, cx - 2, 2, 5, 5); g.rect(C.rd1, cx - 1, 3, 3, 2);
  for (let y = 22; y < H; y++) {
    const half = 10 + Math.round((y - 22) / (H - 22) * 38);
    g.rect(C.st1, cx - half, y, 3, 1); g.rect(C.st3, cx - half, y, 1, 1);
    g.rect(C.st0, cx + half - 3, y, 3, 1);
    if ((y - 22) % 26 === 0) for (let k = 0; k < 26 && y + k < H; k++) {
      const h2 = 10 + Math.round((y + k - 22) / (H - 22) * 38), t = k / 26;
      g.set(C.st1, cx - h2 + 2 + (h2 * 2 - 4) * t, y + k); g.set(C.st0, cx + h2 - 3 - (h2 * 2 - 4) * t, y + k);
    }
    if ((y - 22) % 26 === 0) g.rect(C.st2, cx - half, y, half * 2, 2);
    if (hash(y, 1, 9) > 0.93) g.set(C.sh0, cx - half + 1, y); // agua que escurre
  }
  // Escalera de servicio al centro.
  for (let y = 30; y < H; y += 5) g.rect(C.st0, cx - 3, y, 7, 1);
  g.rect(C.st0, cx - 4, 30, 1, H - 30); g.rect(C.st0, cx + 4, 30, 1, H - 30);
}

/** Estación superior (vista desde la cabina al llegar). */
function estacionSuperior(g: Lienzo, f: number): void {
  const W = 288, H = 200;
  // Cuerpo de concreto con ventanas y boca oscura por donde entran las cabinas.
  for (let y = 30; y < H; y++) for (let x = 10; x < W - 10; x++) g.set(bayer(x, y) < 0.12 ? C.st1 : C.st2, x, y);
  g.rect(C.st3, 0, 22, W, 10); g.rect(C.st4, 0, 22, W, 1); g.rect(C.st0, 0, 31, W, 2);
  for (let k = 0; k < W; k += 18) g.rect(C.st1, k, 32, 3, 6);
  for (let y = 0; y < 110; y++) {
    const half = y < 50 ? Math.round(Math.sqrt(50 * 50 - (50 - y) ** 2) * 1.6) : 80;
    g.rect(C.st4, W / 2 - half - 4, 58 + y, half * 2 + 8, 1);
    g.rect(y > 70 ? C.night : C.ink, W / 2 - half, 58 + y, half * 2, 1);
  }
  // Andén iluminado y rieles de llegada.
  g.rect(C.wa0, W / 2 - 70, 150, 140, 8); g.rect(C.wa2, W / 2 - 70, 150, 140, 1);
  g.line(C.st3, W / 2 - 80, 70, W / 2 + 80, 66); g.line(C.st1, W / 2 - 80, 74, W / 2 + 80, 70);
  for (const wx of [24, 54, W - 76, W - 46]) for (const wy of [48, 90, 132]) {
    const r = hash(wx, wy, 3);
    g.rect(C.ink, wx, wy, 20, 24); g.rect(r > 0.6 ? C.wa1 : r > 0.3 ? C.tq0 : C.night, wx + 2, wy + 2, 16, 20);
  }
  // Pendones morados de la Cofradía y letrero con neón.
  for (const px of [W / 2 - 112, W / 2 + 100]) { g.rect(C.pu0, px, 40, 12, 60); g.rect(C.pu1, px, 40, 12, 2); g.ellipse(C.ink, px + 6, 66, 4, 4); g.set(C.pu2, px + 4, 64); for (let k = 0; k < 12; k += 3) g.set(C.pu0, px + k, 100); }
  g.rect(C.ink, W / 2 - 46, 4, 92, 16); g.rect(C.st0, W / 2 - 45, 5, 90, 14);
  miniText(g, f === 1 ? C.tq0 : C.tq2, 'TELEFERICO', W / 2 - 20, 10);
  g.rect(C.rd0, 6, 24, 4, 4); g.rect(C.rd0, W - 10, 24, 4, 4); if (f === 0) { g.set(C.rd1, 7, 25); g.set(C.rd1, W - 9, 25); }
  // Polea grande de llegada.
  g.ellipse(C.st0, W / 2, 50, 18, 6); g.ellipse(C.st3, W / 2, 50, 14, 4); g.ellipse(C.st0, W / 2, 50, 4, 1);
  g.outline(outlineOf);
}

/** Relámpago (cada cuadro es una forma distinta; el decorado elige uno y lo destella). */
function rayo(g: Lienzo, f: number): void {
  const W = 72, H = 220;
  const path = (x: number, y: number, len: number, seed: number, thick: boolean, depth: number): void => {
    let px = x, py = y;
    for (let s = 0; s < len && py < H; s++) {
      const nx = px + (hash(s, 1, seed) - 0.5) * 9, ny = py + 3 + hash(s, 2, seed) * 5;
      if (thick) { g.line(C.pu2, px - 1, py, nx - 1, ny); g.line(C.pu2, px + 1, py, nx + 1, ny); }
      g.line(thick ? C.wa4 : C.pu3, px, py, nx, ny);
      if (thick && depth < 2 && hash(s, 3, seed) > 0.86) path(nx, ny, 6 + Math.round(hash(s, 4, seed) * 10), seed + s * 13, false, depth + 1);
      px = Math.max(2, Math.min(W - 3, nx)); py = ny;
    }
  };
  path(W / 2 + (hash(f, 9) - 0.5) * 20, 0, 60, 900 + f * 31, true, 0);
}

function bancaCabina(g: Lienzo): void {
  g.rect(C.st4, 0, 10, 104, 5); g.rect(C.st5, 0, 10, 104, 1); g.rect(C.st2, 0, 15, 104, 3);
  for (let x = 4; x < 100; x += 6) g.rect(C.st3, x, 11, 3, 3);
  g.rect(C.st3, 2, 0, 100, 3); g.rect(C.st1, 2, 3, 100, 2);
  for (const x of [6, 50, 94]) { g.rect(C.st1, x, 18, 4, 17); g.rect(C.st3, x, 18, 1, 17); g.rect(C.st0, x - 2, 33, 8, 2); }
  g.rect(C.ro1, 0, 17, 104, 1);
}

function extintor(g: Lienzo): void {
  g.rect(C.rd0, 3, 8, 8, 21); g.rect(C.rd1, 4, 8, 2, 20); g.ellipse(C.rd0, 7, 8, 4, 2);
  g.rect(C.st1, 5, 2, 4, 5); g.rect(C.st4, 4, 1, 7, 2); g.line(C.ink, 10, 3, 13, 9); g.line(C.ink, 13, 9, 11, 18);
  g.rect(C.sh1, 4, 14, 6, 5); g.rect(C.rd0, 5, 16, 4, 1); g.rect(C.st0, 3, 28, 8, 1);
}

function maletas(g: Lienzo): void {
  // Maleta acostada con correa y mochila caída (alguien huyó).
  g.rect(C.ea1, 2, 10, 26, 13); g.rect(C.ea2, 2, 10, 26, 2); g.rect(C.ea0, 2, 21, 26, 2);
  g.rect(C.ea3, 13, 10, 3, 13); g.rect(C.st4, 11, 7, 8, 3); g.erase(13, 8, 4, 1);
  g.ellipse(C.tq0, 35, 16, 8, 7); g.ellipse(C.tq1, 34, 14, 6, 4); g.rect(C.tq0, 30, 18, 11, 5); g.rect(C.wa2, 33, 18, 4, 1);
  g.outline(outlineOf);
}

/* =============================== TORRE =============================== */

function consola(g: Lienzo, f: number, rota: boolean): void {
  const W = 96;
  // Cuerpo con tablero inclinado.
  g.rect(C.st2, 4, 34, W - 8, 30); g.rect(C.st3, 4, 34, W - 8, 2); g.rect(C.st0, 4, 60, W - 8, 4);
  for (let y = 22; y < 36; y++) { const inset = Math.round((y - 22) * 0.4); g.rect(C.st1, 8 - inset, y, W - 16 + inset * 2, 1); }
  g.rect(C.st4, 8, 22, W - 16, 1);
  // Pantallas sobre el tablero.
  for (const [sx, i] of [[12, 0], [52, 1]] as const) {
    g.rect(C.st0, sx - 2, 0, 36, 24); g.rect(C.st3, sx - 2, 0, 36, 1);
    if (rota && i === 1) {
      estatica(g, sx, 2, 32, 20, f * 7 + 3);
      grieta(g, sx + 14, 2, 18, C.ink, 4, 0.3); g.line(C.ink, sx + 4, 6, sx + 28, 14);
    } else datos(g, sx, 2, 32, 20, f * 11 + i, i ? C.lg0 : C.tq2);
  }
  // Botonera que parpadea.
  for (let k = 0; k < 14; k++) {
    const on = hash(k, f, 5) > 0.45, x = 12 + k * 5;
    g.rect(on ? [C.rd1, C.lg0, C.wa2, C.tq2][k % 4] : C.st0, x, 27, 3, 2);
  }
  g.rect(C.st0, 30, 42, 36, 10); for (let k = 0; k < 6; k++) g.rect(C.st4, 33 + k * 5, 44, 3, 6);
  if (rota) {
    // Chispas y humo.
    const sp = [[70, 22], [74, 18], [66, 16], [78, 24]] as const;
    for (let k = 0; k <= f % 3; k++) { const [x, y] = sp[(k + f) % 4]; g.set(C.wa4, x, y); g.set(C.wa3, x + 1, y - 1); g.set(C.wa2, x - 1, y + 1); }
    for (let k = 0; k < 5; k++) g.set(C.st3, 60 + hash(k, f, 2) * 14, 2 + hash(k, f, 3) * 10);
    g.line(C.ink, 60, 38, 74, 48); g.line(C.ink, 74, 48, 80, 46);
  }
  g.outline(outlineOf);
}

function monitorEstatica(g: Lienzo, f: number): void {
  // Monitor de tubo sobre un carrito con ruedas.
  g.rect(C.st2, 2, 0, 44, 36); g.rect(C.st3, 2, 0, 44, 2); g.rect(C.st1, 40, 2, 6, 34);
  g.rect(C.ink, 5, 3, 34, 28); estatica(g, 6, 4, 32, 26, f * 13 + 1);
  g.rect(C.st1, 8, 36, 30, 4); g.rect(C.lg0, 34, 33, 2, 1);
  g.rect(C.st1, 4, 40, 40, 4); g.rect(C.st3, 4, 40, 40, 1);
  g.rect(C.st1, 8, 44, 3, 28); g.rect(C.st1, 37, 44, 3, 28); g.rect(C.st0, 4, 58, 40, 3);
  g.rect(C.st2, 8, 62, 32, 3);
  for (const x of [8, 38]) { g.ellipse(C.ink, x, 76, 3, 3); g.set(C.st3, x, 75); }
  for (let y = 44; y < 72; y++) g.set(C.ink, 24 + Math.round(Math.sin(y * 0.4) * 3), y);
  g.outline(outlineOf);
}

function rack(g: Lienzo, f: number): void {
  g.rect(C.st0, 2, 0, 44, 96); g.rect(C.st2, 2, 0, 44, 2); g.rect(C.st1, 2, 0, 3, 96); g.rect(C.ink, 43, 0, 3, 96);
  for (let u = 0; u < 10; u++) {
    const y = 6 + u * 9;
    g.rect(C.st1, 6, y, 36, 7); g.rect(C.st2, 6, y, 36, 1);
    for (let k = 0; k < 6; k++) { const on = hash(u, k, f + 1) > 0.5; g.set(on ? (k % 3 ? C.lg0 : C.wa2) : C.st0, 30 + k * 2, y + 3); }
    for (let k = 8; k < 26; k += 2) g.set(C.ink, k, y + 3);
  }
  if (f % 2) g.set(C.rd1, 8, 4);
  for (let k = 0; k < 4; k++) for (let y = 96 - 20 + k * 3; y < 96; y++) g.set(k % 2 ? C.ink : C.te1, 10 + k * 8 + Math.sin(y) * 1, y);
  g.outline(outlineOf);
}

function silla(g: Lienzo): void {
  g.rect(C.st0, 6, 0, 14, 16); g.rect(C.st1, 7, 1, 12, 14); g.rect(C.st2, 7, 1, 3, 14);
  g.rect(C.st1, 4, 17, 20, 5); g.rect(C.st2, 4, 17, 20, 1); g.rect(C.st0, 20, 10, 3, 8);
  g.rect(C.st3, 13, 22, 2, 8);
  g.line(C.st2, 14, 30, 4, 33); g.line(C.st2, 14, 30, 24, 33); g.line(C.st2, 14, 30, 14, 34);
  for (const x of [4, 24, 14]) g.rect(C.ink, x - 1, 33, 3, 2);
  g.outline(outlineOf);
}

function cablesSuelo(g: Lienzo): void {
  const cols = [C.ink, C.te1, C.st2, C.wa1, C.ink];
  cols.forEach((c, k) => {
    for (let x = 0; x < 96; x++) {
      const y = 8 + Math.sin(x * 0.07 + k * 1.3) * 4 + k * 1.5;
      g.set(c, x, y); g.set(C.ink, x, y + 1);
    }
  });
  g.rect(C.st1, 40, 6, 10, 9); g.rect(C.st3, 40, 6, 10, 1); g.rect(C.wa2, 42, 9, 2, 2);
}

function charco(g: Lienzo, f: number): void {
  g.ellipse(C.night, 32, 9, 30, 6); g.ellipse(C.mtn0, 31, 8, 26, 4);
  for (let x = 6; x < 58; x++) if (bayer(x, 8) < 0.3) g.set(C.mtn1, x, 8);
  g.set(C.sh0, 18, 7); g.set(C.sh0, 40, 9);
  const r = [3, 7, 11, 15][f % 4];
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    const x = 36 + Math.cos(a) * r, y = 8 + Math.sin(a) * r * 0.3;
    if (g.has(Math.round(x), Math.round(y))) g.set(f === 3 ? C.mtn1 : C.mtn2, x, y);
  }
}

/* =============================== SALÓN DEL TRONO =============================== */

function trono(g: Lienzo, f: number): void {
  const W = 112, H = 144, cx = W / 2;
  // Estrado escalonado.
  for (let s = 0; s < 3; s++) {
    const y = H - 10 - s * 9, hw = 54 - s * 10;
    g.rect(C.st1, cx - hw, y, hw * 2, 10); g.rect(C.pu1, cx - hw, y, hw * 2, 1); g.rect(C.st0, cx + hw - 10, y + 1, 10, 9);
  }
  // Respaldo alto de obsidiana con cresta escalonada.
  const top = 6, seat = H - 52;
  for (let y = top; y < seat; y++) {
    const ly = y - top, hw = ly < 8 ? 6 : ly < 16 ? 12 : ly < 24 ? 18 : 22;
    g.rect(C.ink, cx - hw, y, hw * 2, 1); g.set(C.pu1, cx - hw, y); g.set(C.st0, cx + hw - 1, y);
  }
  for (let y = top + 28; y < seat - 4; y += 2) g.set(C.pu0, cx - 12 + (y % 4), y);
  frisoGreca(g, cx - 18, top + 40, 36, C.pu0, 'escalon');
  // Ojo/gema en la cresta (late).
  const gem = f === 1 ? C.pu3 : C.pu2;
  g.ellipse(C.pu0, cx, top + 12, 4, 5); g.ellipse(gem, cx, top + 12, 2, 3); g.set(C.sh1, cx - 1, top + 10);
  // Asiento, cojín y brazos con remates escalonados.
  g.rect(C.st0, cx - 30, seat, 60, 18); g.rect(C.st1, cx - 30, seat, 60, 2);
  g.rect(C.ro0, cx - 20, seat - 4, 40, 6); g.rect(C.ro1, cx - 20, seat - 4, 40, 1);
  for (const side of [-1, 1]) {
    const ax = cx + side * 28 - (side > 0 ? 8 : 0);
    g.rect(C.ink, ax, seat - 18, 8, 22); g.rect(C.pu1, ax, seat - 18, 8, 1);
    g.rect(C.st0, ax - 2 + (side > 0 ? 2 : 0), seat - 24, 8, 6); g.rect(C.pu0, ax - 2 + (side > 0 ? 2 : 0), seat - 24, 8, 1);
  }
  // Velo de humo frío al pie.
  for (let y = seat + 18; y < H; y++) for (let x = 4; x < W - 4; x++) if (hash(x, y, f) > 0.92) g.set(C.pu0, x, y);
  g.outline(c => (c === C.pu1 || c === C.pu0 || c === C.pu2 || c === C.pu3 ? C.ink : outlineOf(c)));
}

function columnaProp(g: Lienzo): void {
  const W = 48, H = 208, cx = W / 2;
  for (let s = 0; s < 3; s++) { g.rect(C.st2, s * 3, s * 5, W - s * 6, 5); g.rect(C.st3, s * 3, s * 5, W - s * 6, 1); }
  for (let y = 15; y < H - 18; y++) for (let lx = 0; lx < 36; lx++) {
    let c: string = lx < 4 ? C.st3 : lx > 28 ? C.st0 : lx % 7 === 0 ? C.st0 : C.st1;
    if (bayer(lx, y) < 0.06) c = C.pu0;
    g.set(c, cx - 18 + lx, y);
  }
  frisoGreca(g, cx - 16, 24, 32, C.ea2, 'escalon');
  grieta(g, cx - 4, 40, 90, C.ink, 3, 0.15);
  for (let s = 0; s < 3; s++) { g.rect(C.st1, 6 - s * 3, H - 18 + s * 6, W - 12 + s * 6, 6); g.rect(C.st3, 6 - s * 3, H - 18 + s * 6, W - 12 + s * 6, 1); }
  g.outline(outlineOf);
}

function braseroAzul(g: Lienzo, f: number): void {
  // Trípode de bronce oscuro con cuenco de piedra y fuego frío.
  g.line(C.ea1, 16, 30, 6, 55); g.line(C.ea1, 16, 30, 26, 55); g.line(C.ea2, 16, 30, 16, 55);
  g.ellipse(C.st1, 16, 28, 12, 5); g.rect(C.st1, 4, 22, 25, 6); g.rect(C.st3, 4, 22, 25, 1); g.ellipse(C.ink, 16, 22, 10, 2);
  frisoGreca(g, 5, 23, 23, C.st0, 'escalon');
  g.outline(outlineOf);
  flame(g, 16, 21, f, 2, true);
  flame(g, 11, 21, f + 1, 1, true); flame(g, 21, 21, f + 2, 1, true);
}

function vitralRoto(g: Lienzo): void {
  const cols = [C.tq2, C.pu2, C.wa2, C.ro2, C.mtn3, C.tq1];
  for (let k = 0; k < 16; k++) {
    const x = 4 + hash(k, 1, 77) * 62, y = 6 + hash(k, 2, 77) * 14, s = 2 + Math.round(hash(k, 3, 77) * 4);
    for (let i = 0; i < s; i++) g.rect(cols[k % cols.length], x + i, y + Math.round(i * 0.4), s - i, 1);
    g.line(C.ink, x, y + s * 0.4 + 1, x + s, y + s * 0.4 + 1);
  }
  g.line(C.st0, 10, 18, 40, 12); g.line(C.st0, 30, 20, 60, 16);
  g.outline(c => (c === C.ink || c === C.st0 ? C.ink : C.st0));
}

/** Consola de la falsa llamada: auricular, pantalla con onda de voz y aviso que parpadea. */
function consolaLlamada(g: Lienzo, f: number): void {
  const W = 64;
  g.rect(C.st1, 10, 40, W - 20, 40); g.rect(C.st2, 10, 40, W - 20, 2); g.rect(C.st0, 10, 76, W - 20, 4);
  frisoGreca(g, 12, 66, W - 24, C.st0, 'escalon');
  // Pantalla inclinada.
  g.rect(C.st0, 6, 4, W - 12, 36); g.rect(C.st3, 6, 4, W - 12, 1);
  g.rect(C.night, 9, 7, W - 18, 30);
  const on = f % 2 === 0;
  if (on) miniText(g, C.wa3, 'LLAMADA', 18, 10);
  for (let x = 11; x < W - 11; x++) {
    const a = Math.sin(x * 0.7 + f * 1.7) * Math.sin(x * 0.13 + f) * 7;
    for (let k = 0; k <= Math.abs(a); k++) g.set(k > 4 ? C.tq3 : C.tq2, x, 26 + (a > 0 ? -k : k));
  }
  // Auricular sobre su base y cordón enroscado.
  g.rect(C.st0, 14, 44, 24, 6); g.rect(C.ink, 12, 42, 6, 6); g.rect(C.ink, 34, 42, 6, 6); g.rect(C.st0, 16, 41, 20, 3);
  for (let k = 0; k < 10; k++) g.set(k % 2 ? C.st3 : C.ink, 40 + k, 50 + Math.round(Math.sin(k) * 1.5));
  g.rect(on ? C.rd1 : C.rd0, W - 18, 48, 4, 4); if (on) g.set(C.rd2, W - 18, 48);
  for (let k = 0; k < 3; k++) g.rect(C.st3, 18 + k * 8, 56, 5, 3);
  g.outline(outlineOf);
}

/** Onda en el agua del suelo (el decorado la reproduce y la desvanece). */
function onda(g: Lienzo, f: number): void {
  const r = 3 + f * 4;
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    if (f === 3 && Math.sin(a * 5) < 0) continue;
    g.set(f < 2 ? C.mtn2 : C.mtn1, 16 + Math.cos(a) * r, 6 + Math.sin(a) * r * 0.32);
  }
}

/* ================================ NPCs ================================ */

interface Look { skin: [string, string, string]; shirt: [string, string, string]; pants: [string, string]; feet: string }

/** Cuerpo base de perfil (mirando a la derecha). `bob` baja torso y cabeza 1 px al respirar. */
function body(g: Lienzo, l: Look, bob: number): void {
  g.rect(l.pants[1], 26, 50, 7, 26); g.rect(l.pants[0], 33, 50, 7, 26);
  g.rect(l.pants[1], 33, 50, 1, 26); g.rect(l.pants[1], 32, 56, 1, 18);
  g.rect(l.feet, 26, 76, 8, 2); g.rect(l.feet, 33, 76, 9, 2);
  const ty = 28 + bob, tx = 23;
  for (let y = 0; y < 23 - bob; y++) {
    const inset = y === 0 ? 2 : y === 1 ? 1 : y > 15 ? 1 : 0;
    g.rect(l.shirt[1], tx + inset, ty + y, 19 - inset * 2, 1);
    if (y > 0 && y < 21 - bob) g.rect(l.shirt[0], tx + 2 + inset, ty + y, 12 - inset, 1);
  }
  g.rect(l.shirt[2], tx + 3, ty + 2, 2, 16 - bob);
  g.rect(l.shirt[1], tx + 10, ty + 5, 1, 14 - bob);
  head(g, 25, 9 + bob, l.skin);
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

const outlineChar = (c: string): string => (c === C.sh1 || c === C.sh0 || c === C.wa4 || c === C.wa3 ? C.st2 : outlineOf(c));

/** Técnica de la torre: overol gris-turquesa, diadema con micrófono, chongo y tableta encendida. */
function tecnica(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.tq0, C.dusk, C.tq1], pants: [C.night, C.dusk], feet: C.st0 };
  body(g, look, bob);
  // Overol: cinturón de herramientas y parche.
  g.rect(C.st0, 24, 47 + bob, 18, 3); g.rect(C.wa2, 30, 47 + bob, 2, 3); g.rect(C.st3, 36, 48 + bob, 4, 4);
  g.rect(C.wa1, 25, 33 + bob, 4, 3); // parche naranja de seguridad
  for (let y = 52; y < 76; y += 6) g.set(C.tq1, 27, y);
  const hx = 25, hy = 9 + bob;
  // Cabello negro con chongo y diadema con micrófono.
  g.rect(C.ea0, hx + 1, hy - 1, 13, 5); g.rect(C.ea0, hx, hy + 1, 7, 10); g.ellipse(C.ea0, hx - 1, hy + 3, 3, 3); g.set(C.ea1, hx + 4, hy);
  g.rect(C.st0, hx + 4, hy - 2, 8, 1); g.rect(C.st0, hx + 4, hy - 2, 1, 10); g.rect(C.st1, hx + 2, hy + 7, 4, 5);
  g.line(C.st0, hx + 5, hy + 12, hx + 13, hy + 14); g.rect(C.ink, hx + 13, hy + 13, 2, 2);
  // Brazos sosteniendo la tableta (la pantalla cambia).
  g.line(look.shirt[1], 30, 31 + bob, 40, 41 + bob, 4); g.rect(C.sk1, 39, 39 + bob, 4, 4);
  g.rect(C.st0, 39, 32 + bob, 12, 9); datos(g, 40, 33 + bob, 10, 7, f + 40, f % 2 ? C.tq2 : C.lg0);
  g.line(look.shirt[0], 33, 33 + bob, 46, 41 + bob, 3); g.rect(C.sk2, 45, 40 + bob, 3, 3);
  g.outline(outlineChar);
}

/** Operador mayor: casco amarillo, chaleco reflejante, bigote y linterna que barre la luz. */
function operador(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.ea4], shirt: [C.st3, C.st2, C.st4], pants: [C.ea1, C.ea2], feet: C.ea0 };
  body(g, look, bob);
  // Chaleco naranja con cintas reflejantes.
  for (let y = 30; y < 50; y++) g.rect(y < 32 ? C.wa0 : C.wa1, 24, y + bob, 17, 1);
  g.rect(C.sh1, 24, 38 + bob, 17, 2); g.rect(C.sh1, 24, 44 + bob, 17, 2); g.rect(C.wa0, 31, 30 + bob, 1, 20);
  // Botas de trabajo.
  g.rect(C.ea0, 25, 72, 9, 6); g.rect(C.ea0, 33, 72, 10, 6); g.rect(C.ea2, 33, 72, 10, 1);
  const hx = 25, hy = 9 + bob;
  // Canas, bigote y casco con lámpara.
  g.rect(C.st3, hx, hy + 2, 6, 8); g.rect(C.st4, hx + 1, hy + 3, 3, 3);
  g.rect(C.st3, hx + 11, hy + 13, 5, 2);
  g.ellipse(C.wa2, hx + 8, hy + 1, 9, 4); g.rect(C.wa2, hx - 1, hy + 1, 19, 3); g.rect(C.wa3, hx + 2, hy - 2, 7, 1);
  g.rect(C.wa1, hx - 2, hy + 4, 22, 1); g.rect(C.st1, hx + 16, hy, 3, 3); g.set(C.wa4, hx + 18, hy + 1);
  // Brazo con la linterna (barre arriba y abajo).
  const aim = [0, 1, 2, 1][f % 4];
  g.line(look.shirt[1], 30, 31 + bob, 41, 40 + bob - aim, 4); g.rect(C.sk1, 40, 38 + bob - aim, 4, 4);
  g.rect(C.st0, 42, 37 + bob - aim, 8, 4); g.rect(C.st3, 42, 37 + bob - aim, 8, 1); g.rect(C.wa3, 50, 37 + bob - aim, 1, 4);
  g.outline(outlineChar);
  for (let k = 0; k < 10; k++) for (let j = -Math.floor(k / 3); j <= Math.floor(k / 3); j++) g.veil(C.wa3, 52 + k, 39 + bob - aim + j - Math.round(k * (aim - 1) * 0.2), 0.45 - k * 0.04);
}

/* ============================== CATÁLOGO ============================== */

export const CDMX2_ART: Cdmx2ArtSpec[] = [
  // Teleférico
  { key: 'prop_n07_puerta_cabina', dir: PROPS, w: 72, h: 174, frames: 1, feetY: 173, draw: g => puertaCabina(g) },
  { key: 'prop_n07_asidero', dir: PROPS, w: 12, h: 44, frames: 1, feetY: 43, draw: g => asidero(g) },
  { key: 'prop_n07_cabina_lejana', dir: PROPS, w: 40, h: 52, frames: 2, fps: 2, feetY: 51, draw: cabinaLejana },
  { key: 'prop_n07_torre_cable', dir: PROPS, w: 112, h: 400, frames: 1, feetY: 399, draw: g => torreCable(g) },
  { key: 'prop_n07_estacion_superior', dir: PROPS, w: 288, h: 200, frames: 2, fps: 2, feetY: 199, draw: estacionSuperior },
  { key: 'prop_n07_rayo', dir: PROPS, w: 72, h: 220, frames: 4, fps: 1, feetY: 219, draw: rayo },
  { key: 'prop_n07_banca_cabina', dir: PROPS, w: 104, h: 36, frames: 1, feetY: 35, draw: g => bancaCabina(g) },
  { key: 'prop_n07_extintor', dir: PROPS, w: 14, h: 30, frames: 1, feetY: 29, draw: g => extintor(g) },
  { key: 'prop_n07_maletas', dir: PROPS, w: 44, h: 24, frames: 1, feetY: 23, draw: g => maletas(g) },
  // Torre de control
  { key: 'prop_n07_consola', dir: PROPS, w: 96, h: 64, frames: 4, fps: 3, feetY: 63, draw: (g, f) => consola(g, f, false) },
  { key: 'prop_n07_consola_rota', dir: PROPS, w: 96, h: 64, frames: 4, fps: 8, feetY: 63, draw: (g, f) => consola(g, f, true) },
  { key: 'prop_n07_monitor_estatica', dir: PROPS, w: 48, h: 80, frames: 4, fps: 10, feetY: 79, draw: monitorEstatica },
  { key: 'prop_n07_rack', dir: PROPS, w: 48, h: 96, frames: 4, fps: 3, feetY: 95, draw: rack },
  { key: 'prop_n07_silla', dir: PROPS, w: 28, h: 36, frames: 1, feetY: 35, draw: g => silla(g) },
  { key: 'prop_n07_cables_suelo', dir: PROPS, w: 96, h: 20, frames: 1, feetY: 19, draw: g => cablesSuelo(g) },
  { key: 'prop_n07_charco', dir: PROPS, w: 64, h: 16, frames: 4, fps: 4, feetY: 15, draw: charco },
  { key: 'prop_n07_estatica', dir: PROPS, w: 32, h: 24, frames: 4, fps: 12, feetY: 23, draw: (g, f) => estatica(g, 0, 0, 32, 24, f * 17 + 5) },
  // Salón del trono
  { key: 'prop_n07_trono', dir: PROPS, w: 112, h: 144, frames: 2, fps: 1, feetY: 143, draw: trono },
  { key: 'prop_n07_columna', dir: PROPS, w: 48, h: 208, frames: 1, feetY: 207, draw: g => columnaProp(g) },
  { key: 'prop_n07_brasero_azul', dir: PROPS, w: 32, h: 56, frames: 4, fps: 7, feetY: 55, draw: braseroAzul },
  { key: 'prop_n07_vitral_roto', dir: PROPS, w: 72, h: 24, frames: 1, feetY: 23, draw: g => vitralRoto(g) },
  { key: 'prop_n07_consola_llamada', dir: PROPS, w: 64, h: 80, frames: 4, fps: 3, feetY: 79, draw: consolaLlamada },
  { key: 'prop_n07_onda', dir: PROPS, w: 32, h: 12, frames: 4, fps: 6, feetY: 11, draw: onda },
  // NPCs comunes de la torre
  { key: 'npc_tecnico_1', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: tecnica },
  { key: 'npc_tecnico_2', dir: NPCS, w: 64, h: 80, frames: 4, fps: 3, feetY: 78, draw: operador },
];

/** Dibuja un cuadro de una entrada del catálogo. */
export function drawCdmx2Art(spec: Cdmx2ArtSpec, frame: number): Lienzo {
  const g = new Lienzo(spec.w, spec.h);
  spec.draw(g, frame);
  return g;
}
