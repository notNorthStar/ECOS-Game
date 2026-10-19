/**
 * Props y NPCs comunes del Nivel 3 (Catemaco). Cada entrada describe un PNG (o tira de cuadros)
 * que genera tools/gen-catemaco-scenery.mjs y que el juego también puede dibujar como respaldo.
 * NPCs comunes con diseño completo (AGENTS.md §8.0): 64×80, pivote (32, 78), ~70 px, mirando a la derecha.
 */
import { BIG, C, Lienzo, bayer, hash, miniText, outlineOf } from './CatemacoPixels';

export interface CatemacoArtSpec {
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

const PROPS = 'escenarios/nivel-03-catemaco/props';
const NPCS = 'sprites/npcs';

/* =============================== AYUDAS =============================== */

function flame(g: Lienzo, x: number, y: number, frame: number, size = 1, red = false): void {
  // Llama de 3 tonos con punta que cambia por cuadro (sin semitransparencia).
  const h = [5, 6, 4, 6][frame % 4] * size, sway = [0, 1, 0, -1][frame % 4];
  const outer = red ? C.rd0 : C.wa1, mid = red ? C.rd1 : C.wa2, core = red ? C.wa2 : C.wa4;
  for (let i = 0; i < h; i++) {
    const t = i / h, half = Math.round((1 - t) * 1.6 * size);
    const sx = x + Math.round(sway * t);
    g.rect(outer, sx - half - (i < h * 0.4 ? 1 : 0), y - i, half * 2 + 1 + (i < h * 0.4 ? 2 : 0), 1);
    if (i < h - 1) g.rect(mid, sx - Math.max(0, half - 1), y - i, Math.max(1, half * 2 - 1), 1);
    if (i < h * 0.45) g.set(core, sx, y - i);
  }
}

function smoke(g: Lienzo, x: number, y: number, frame: number, rise: number, c1: string, c2: string): void {
  for (let i = 0; i < rise; i++) {
    const t = i / rise, px = x + Math.round(Math.sin(i * 0.35 + frame * 1.5) * (1 + t * 3));
    if ((i + frame * 2) % 7 > 4) continue;
    g.set(t < 0.5 ? c1 : c2, px, y - i);
    if (t > 0.3 && (i + frame) % 3 === 0) g.set(c2, px + 1, y - i);
  }
}

/** Disco del Espejo Negro: obsidiana con aro rojo y brillo frío. */
function mirror(g: Lienzo, x: number, y: number, r: number): void {
  g.ellipse(C.rd0, x, y, r + 1, r + 1); g.ellipse(C.st0, x, y, r, r);
  g.ellipse(C.st1, x - 1, y - 1, Math.max(1, r - 2), Math.max(1, r - 2));
  g.set(C.mtn2, x - Math.ceil(r / 2), y - Math.ceil(r / 2)); g.set(C.st0, x, y);
}

/* ================================ PROPS ================================ */

function letras(g: Lienzo): void {
  const word = 'CATEMACO';
  const ramps: Array<[string, string, string, string]> = [
    [C.ro0, C.ro1, C.ro2, C.ro3], [C.wa0, C.wa1, C.wa2, C.wa3], [C.tq0, C.tq1, C.tq2, C.tq3], [C.fo1, C.fo3, C.fo4, C.fo5],
    [C.pu0, C.pu1, C.pu2, C.pu3], [C.te0, C.te2, C.te3, C.wa2], [C.ro0, C.ro1, C.ro2, C.ro3], [C.tq0, C.tq1, C.tq2, C.tq3],
  ];
  // Base de cantera con juntas, musgo y veladoras de los brujos.
  g.rect(C.st0, 2, 58, 220, 14); g.rect(C.st2, 3, 59, 218, 12); g.rect(C.st4, 3, 59, 218, 1); g.rect(C.st1, 3, 66, 218, 1);
  for (let x = 6; x < 220; x += 24) g.rect(C.st1, x, 60, 1, 11);
  for (let x = 4; x < 220; x++) if (hash(x, 5) > 0.75) g.set(C.fo2, x, 70 - Math.floor(hash(x, 6) * 2));
  for (let n = 0; n < word.length; n++) {
    const glyph = BIG[word[n]], [o, d, md, l] = ramps[n], ox = 8 + n * 26, oy = 15 + (n % 2);
    const on = (x: number, y: number) => y >= 0 && y < 7 && x >= 0 && x < 5 && glyph[y][x] === '1';
    // Celdas de 4×6: cada letra mide 20×42 con extrusión hacia abajo-derecha.
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) {
      g.rect(C.ink, ox + x * 4 + 3, oy + y * 6 + 3, 4, 6); g.rect(d, ox + x * 4 + 2, oy + y * 6 + 2, 4, 6);
    }
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) {
      for (let py = 0; py < 6; py++) for (let px = 0; px < 4; px++) {
        const tx = ox + x * 4 + px, ty = oy + y * 6 + py;
        let c = bayer(tx, ty) < 0.75 - (y * 6 + py) / 42 * 0.6 ? l : md;
        if ((!on(x - 1, y) && px === 0) || (!on(x, y - 1) && py === 0)) c = l;
        if ((tx * 3 + ty * 5 + n) % 17 === 0) c = n % 2 ? C.wa4 : C.sh1; // mosaico de talavera
        if (hash(tx, ty, n + 30) > 0.93) c = C.ea2; // óxido de la humedad del lago
        g.set(c, tx, ty);
      }
    }
    // Contorno de color de cada letra.
    for (let y = oy - 1; y < oy + 44; y++) for (let x = ox - 1; x < ox + 22; x++) {
      if (g.get(x, y) === undefined && (g.get(x + 1, y) === l || g.get(x, y + 1) === l || g.get(x + 1, y) === md || g.get(x, y + 1) === md)) g.set(o, x, y);
    }
    // Escurrimientos de óxido.
    const rx = ox + 2 + Math.floor(hash(n, 1) * 15);
    for (let y = oy + 24; y < oy + 30 + n % 3 * 4; y++) if (g.has(rx, y)) g.set(C.ea2, rx, y);
  }
  // Cable con focos de feria (algunos fundidos) y veladoras al pie.
  for (let x = 4; x < 220; x++) g.set(C.ink, x, 5 + Math.round(Math.sin(x * 0.045) * 2));
  for (let x = 8; x < 220; x += 8) {
    const y = 6 + Math.round(Math.sin(x * 0.045) * 2), on = hash(x, 3) > 0.3;
    g.rect(on ? C.wa3 : C.st2, x, y, 2, 2); if (on) g.set(C.wa4, x, y);
  }
  for (const vx of [14, 70, 121, 178, 206]) {
    g.rect(C.rd0, vx, 54, 4, 5); g.rect(C.rd1, vx, 54, 1, 5); g.rect(C.wa4, vx + 1, 53, 2, 1); g.set(C.wa3, vx + 1, 51); g.set(C.wa2, vx + 2, 52);
  }
}

function altarBrujos(g: Lienzo, f: number): void {
  // Mesa con mantel de manta, imagen del ojo, huevos de limpia, hierbas, flores y veladoras.
  g.rect(C.ea0, 6, 34, 52, 21); g.rect(C.ea1, 7, 35, 50, 19);
  g.rect(C.sh0, 4, 30, 56, 12); g.rect(C.sh1, 4, 30, 56, 2); g.rect(C.sh0, 4, 42, 56, 1);
  for (let x = 5; x < 59; x += 4) { g.set(C.ro1, x, 39); g.set(C.wa1, x + 2, 39); }
  for (let x = 6; x < 58; x += 3) g.rect(C.sh0, x, 43, 1, 3 + (x % 2));
  g.rect(C.ea0, 8, 54, 4, 1); g.rect(C.ea0, 52, 54, 4, 1);
  // Retablo con el ojo que todo lo ve.
  g.rect(C.ea0, 22, 6, 20, 24); g.rect(C.wa0, 23, 7, 18, 22); g.rect(C.tq0, 25, 9, 14, 18);
  g.ellipse(C.sh1, 32, 17, 5, 3); g.ellipse(C.tq1, 32, 17, 2, 2); g.set(C.ink, 32, 17);
  for (let k = 0; k < 6; k++) g.set(C.wa2, 32 + Math.round(Math.cos(k) * 7), 17 + Math.round(Math.sin(k) * 7));
  g.rect(C.wa2, 22, 6, 20, 1);
  // Huevos, ramo de albahaca y flores de cempasúchil.
  g.ellipse(C.sh1, 14, 28, 2, 2); g.ellipse(C.wa4, 18, 28, 2, 2); g.set(C.sh0, 15, 29);
  g.line(C.fo2, 44, 29, 52, 25, 2); g.ellipse(C.fo3, 52, 24, 3, 2); g.set(C.fo5, 51, 23);
  for (const [x, y] of [[8, 27], [56, 27], [11, 25]]) { g.rect(C.wa1, x - 1, y, 3, 2); g.set(C.wa2, x, y); }
  g.outline(outlineOf);
  // Veladoras (las llamas parpadean por cuadro).
  for (const [x, h, k] of [[10, 7, 0], [20, 9, 1], [44, 8, 2], [54, 6, 3]] as const) {
    g.rect(k % 2 ? C.rd0 : C.sh1, x, 30 - h, 4, h); g.rect(k % 2 ? C.rd1 : C.wa4, x, 30 - h, 1, h);
    g.set(C.ea0, x + 2, 29 - h); flame(g, x + 2, 28 - h, f + k);
  }
  smoke(g, 52, 21, f, 14, C.st4, C.st3);
}

function jaula(g: Lienzo, open: boolean): void {
  // Jaula de varas de madera atadas con soga roja; cerrada lleva un gato negro asustado dentro.
  g.rect(C.ea0, 2, 31, 32, 4); g.rect(C.ea2, 2, 31, 32, 1);
  g.rect(C.ea0, 2, 5, 32, 3); g.rect(C.ea2, 2, 5, 32, 1);
  g.rect(C.ea1, 15, 1, 6, 4); g.rect(C.ea3, 16, 1, 4, 1);
  if (!open) {
    g.ellipse(C.ink, 18, 27, 8, 4); g.ellipse(C.ink, 23, 21, 4, 4);
    g.set(C.ink, 20, 16); g.set(C.ink, 26, 16); g.rect(C.ink, 20, 17, 2, 1); g.rect(C.ink, 25, 17, 2, 1);
    g.set(C.lg0, 22, 21); g.set(C.lg0, 25, 21); g.rect(C.st1, 10, 28, 2, 3); g.line(C.st0, 10, 27, 7, 22);
  }
  for (let x = 3; x < 34; x += 5) {
    if (open && x > 8 && x < 30) continue;
    g.rect(C.ea1, x, 8, 2, 23); g.set(C.ea3, x, 8 + (x % 4));
  }
  if (open) {
    // Puerta de varas abierta hacia el frente, colgando de la bisagra izquierda; soga cortada.
    for (let k = 0; k < 4; k++) g.rect(C.ea1, 9 + k * 5, 26 + k, 2, 8 - k);
    g.line(C.ea1, 8, 26, 26, 29); g.line(C.ea1, 8, 33, 26, 33);
    g.rect(C.rd0, 2, 17, 6, 1); g.rect(C.rd0, 30, 17, 4, 1); g.set(C.rd1, 8, 18); g.set(C.rd1, 30, 18);
  } else { g.rect(C.rd0, 2, 17, 32, 1); g.set(C.rd1, 3, 17); }
  g.outline(outlineOf);
}

function gato(g: Lienzo, f: number, lying: boolean): void {
  if (lying) {
    const breath = f % 2;
    g.ellipse(C.st0, 13, 10 - breath, 9, 3 + breath); g.ellipse(C.ink, 22, 8, 4, 3);
    g.set(C.ink, 20, 4); g.set(C.ink, 24, 4); g.rect(C.ink, 20, 5, 5, 1);
    g.line(C.ink, 4, 11, 1, 7); g.set(C.ink, 1, 6);
    g.rect(C.st1, 9, 7 - breath, 6, 1);
    g.set(f % 2 ? C.st0 : C.wa2, 24, 8);
    g.outline(() => C.st1);
    return;
  }
  // Sentado de perfil: cuerpo en gota, cola que se mueve y parpadeo en el cuadro 2.
  g.ellipse(C.ink, 11, 14, 5, 5); g.rect(C.ink, 7, 14, 9, 5); g.ellipse(C.ink, 14, 7, 4, 3);
  g.set(C.ink, 12, 3); g.set(C.ink, 16, 3); g.rect(C.ink, 12, 4, 2, 1); g.rect(C.ink, 15, 4, 2, 1);
  g.rect(C.st1, 9, 10, 2, 6); g.set(C.st1, 13, 5);
  g.rect(C.ink, 13, 15, 2, 4); g.rect(C.ink, 10, 18, 3, 1);
  const tail = [[6, 18, 2, 15], [6, 18, 1, 13], [6, 18, 2, 14], [6, 18, 3, 16]][f % 4];
  g.line(C.ink, tail[0], tail[1], tail[2], tail[3]); g.set(C.ink, tail[2], tail[3] - 1);
  if (f % 4 !== 2) { g.set(C.wa3, 16, 7); g.set(C.lg0, 17, 7); } else g.rect(C.st1, 16, 7, 2, 1);
  g.outline(() => C.st1);
}

function lona(g: Lienzo, w: number, h: number): void {
  const cx = w / 2, base = h - 1;
  for (let y = 4; y < base; y++) {
    const t = (y - 4) / (base - 4), half = Math.round(t * (w / 2 - 3) + 2);
    g.rect(C.te0, cx - half, y, half * 2, 1);
    g.rect(C.te1, cx - half, y, Math.max(1, half - 3), 1);
    if (hash(y, 1, w) > 0.7) g.set(C.ea0, cx - half + hash(y, 2, w) * half * 2, y);
    if (y % 9 === 0) g.rect(C.te0, cx - half, y, half * 2, 1);
  }
  // Abertura con luz roja interior y faldón recogido.
  const dh = Math.round(h * 0.55);
  for (let y = 0; y < dh; y++) {
    const half = Math.round(y * 0.42);
    g.rect(y > dh * 0.4 ? C.rd0 : C.te1, cx - half + 2, base - dh + y, half * 2 + 1, 1);
    if (y > dh * 0.6) g.rect(C.rd1, cx - Math.round(half * 0.4) + 2, base - dh + y, Math.round(half * 0.8), 1);
  }
  g.line(C.ea1, cx + 3, base - dh, cx + w * 0.3, base - 4, 2);
  g.rect(C.ea1, cx - 1, 0, 2, 6); g.rect(C.ea2, cx - 1, 0, 1, 6);
  mirror(g, Math.round(cx - w * 0.22), Math.round(base - h * 0.45), Math.max(3, Math.round(w / 20)));
  // Vientos y estacas.
  g.line(C.st3, cx - 2, 3, 0, base, 1); g.line(C.st3, cx + 2, 3, w - 1, base, 1);
  g.rect(C.ea2, 0, base - 2, 2, 3); g.rect(C.ea2, w - 2, base - 2, 2, 3);
  g.outline(outlineOf);
}

function antorcha(g: Lienzo, f: number): void {
  g.rect(C.ea1, 7, 18, 3, 37); g.rect(C.ea2, 7, 18, 1, 37); g.rect(C.ea0, 6, 52, 5, 3);
  g.rect(C.ea0, 5, 14, 7, 5); g.rect(C.st2, 5, 15, 7, 1); g.rect(C.st2, 5, 18, 7, 1);
  g.rect(C.rd0, 6, 30, 5, 2);
  g.outline(outlineOf);
  flame(g, 8, 13, f, 2, true);
  if (f % 2 === 0) g.set(C.wa3, 6 + f % 3, 1); else g.set(C.rd1, 10, 2);
}

function cajaCofradia(g: Lienzo): void {
  g.rect(C.ea1, 1, 6, 30, 21); g.rect(C.ea2, 1, 6, 30, 2); g.rect(C.ea0, 1, 15, 30, 1);
  for (let x = 1; x < 31; x += 10) g.rect(C.ea0, x, 6, 1, 21);
  g.rect(C.st2, 1, 6, 30, 1); g.rect(C.st3, 0, 4, 32, 3); g.rect(C.st4, 0, 4, 32, 1);
  mirror(g, 16, 18, 4);
  g.rect(C.sh0, 22, 2, 8, 3); g.set(C.ink, 24, 3); g.set(C.ink, 27, 3);
  g.outline(outlineOf);
}

function nota(g: Lienzo): void {
  for (let y = 2; y < 14; y++) g.rect(y % 2 ? C.wa4 : C.sh1, 2 + (y > 10 ? 1 : 0), y, 11, 1);
  for (let y = 4; y < 12; y += 2) g.rect(C.st3, 4, y, 6 + (y % 4 === 0 ? 1 : -2), 1);
  g.ellipse(C.rd0, 11, 12, 2, 2); g.set(C.rd1, 10, 11);
  g.outline(() => C.st2);
}

function pistaEspejo(g: Lienzo): void {
  // Fragmento de espejo de obsidiana con reflejo turquesa.
  g.line(C.st0, 3, 12, 8, 2, 3); g.line(C.st0, 8, 2, 13, 11, 3); g.rect(C.st0, 3, 10, 10, 3);
  g.line(C.st1, 5, 10, 8, 4); g.set(C.tq2, 7, 6); g.set(C.mtn2, 6, 8);
  g.rect(C.rd0, 4, 13, 8, 1);
  g.outline(() => C.st2);
}

function tablero(g: Lienzo): void {
  // Tablero de pistas: mapa de la laguna, notas clavadas e hilo rojo (tono detectivesco).
  g.line(C.ea1, 8, 50, 14, 4, 2); g.line(C.ea1, 40, 50, 34, 4, 2); g.line(C.ea0, 24, 54, 24, 30, 2);
  g.rect(C.ea0, 4, 4, 40, 32); g.rect(C.ea3, 5, 5, 38, 30); g.rect(C.ea4, 5, 5, 38, 1);
  for (let k = 0; k < 40; k++) g.set(C.ea2, 5 + hash(k, 1, 3) * 38, 5 + hash(k, 2, 3) * 30);
  g.rect(C.sh0, 8, 8, 16, 12); g.ellipse(C.tq0, 16, 14, 6, 3); g.set(C.fo3, 14, 13);
  g.rect(C.wa4, 28, 8, 10, 8); g.rect(C.st3, 29, 10, 7, 1); g.rect(C.st3, 29, 12, 5, 1);
  g.rect(C.sh1, 10, 24, 9, 8); g.rect(C.st3, 11, 26, 6, 1);
  g.rect(C.st5, 28, 21, 10, 11); mirror(g, 33, 26, 2);
  for (const [x, y] of [[16, 8], [33, 8], [14, 24], [33, 21]]) g.set(C.rd1, x, y);
  g.line(C.rd0, 16, 9, 33, 9); g.line(C.rd0, 33, 9, 33, 21); g.line(C.rd0, 14, 24, 16, 9);
  g.outline(outlineOf);
}

function muelle(g: Lienzo): void {
  // Tramo de muelle sobre pilotes; los pies del prop quedan en la base de los pilotes.
  for (let p = 4; p < 160; p += 26) { g.rect(C.ea0, p, 10, 5, 30); g.rect(C.ea2, p, 10, 1, 30); g.rect(C.fo2, p, 32, 5, 2); g.rect(C.tq0, p, 36, 5, 4); }
  for (let x = 0; x < 160; x += 8) {
    g.rect(C.ea1, x, 6, 7, 5); g.rect(hash(x, 1) > 0.5 ? C.ea3 : C.ea2, x, 6, 7, 1); g.set(C.st4, x + 1, 8);
  }
  g.rect(C.ea0, 0, 11, 160, 2);
  g.line(C.ea1, 4, 13, 30, 30); g.line(C.ea1, 30, 13, 56, 30);
  for (const x of [2, 80, 156]) { g.rect(C.ea1, x, 0, 3, 7); g.rect(C.ea3, x, 0, 1, 7); }
  g.line(C.ea3, 80, 2, 66, 9);
  g.outline(outlineOf);
}

function lancha(g: Lienzo): void {
  for (let y = 0; y < 14; y++) {
    const inset = Math.round((y / 13) ** 1.6 * 12);
    g.rect(y < 3 ? C.tq1 : y < 9 ? C.tq0 : C.st1, 4 + inset, 10 + y, 88 - inset * 2 - (y > 6 ? 4 : 0), 1);
  }
  g.rect(C.sh1, 4, 10, 88, 1); g.rect(C.ea2, 6, 8, 82, 2); g.rect(C.ea3, 6, 8, 82, 1);
  g.line(C.ea2, 86, 8, 92, 4, 2);
  miniText(g, C.sh1, 'LUPITA', 34, 15);
  // Remo y red de pesca doblada dentro.
  g.line(C.ea3, 20, 2, 60, 10, 2); g.rect(C.ea3, 56, 8, 8, 3);
  for (let x = 12; x < 30; x += 2) g.set(C.st4, x, 6 + (x % 4 === 0 ? 1 : 0));
  g.outline(outlineOf);
}

function estela(g: Lienzo, broken: boolean): void {
  const h = broken ? 40 : 72, top = 75 - h, w = 30, x = 5;
  g.rect(C.st2, x, top + 4, w, h - 4); g.ellipse(C.st2, x + w / 2, top + 5, w / 2, 5);
  g.rect(C.st3, x, top + 4, 3, h - 4); g.rect(C.st1, x + w - 4, top + 4, 4, h - 4);
  if (broken) {
    // Fractura diagonal irregular.
    for (let k = 0; k < w; k++) g.erase(x + k, top - 2, 1, 4 + Math.round(k * 0.35 + Math.sin(k * 0.9) * 2));
  } else {
    // Relieve olmeca: rostro de labios gruesos con yelmo, ojos almendrados y bandas de glifos.
    g.rect(C.st1, x + 6, top + 8, 18, 4); g.rect(C.st3, x + 6, top + 8, 18, 1);
    g.rect(C.st1, x + 8, top + 16, 5, 2); g.rect(C.st1, x + 18, top + 16, 5, 2);
    g.rect(C.st1, x + 14, top + 18, 3, 8); g.rect(C.st1, x + 10, top + 28, 11, 3); g.rect(C.st3, x + 10, top + 31, 11, 1);
    for (let y = top + 38; y < top + 66; y += 9) {
      g.rect(C.st1, x + 4, y, 22, 1);
      for (let k = 0; k < 3; k++) { g.rect(C.st1, x + 6 + k * 7, y + 3, 4, 4); g.set(C.st3, x + 6 + k * 7, y + 3); }
    }
  }
  for (let k = 0; k < 20; k++) g.set(hash(k, 3) > 0.5 ? C.fo2 : C.fo3, x + hash(k, 4) * w, 75 - hash(k, 5) ** 2 * h * 0.6);
  g.rect(C.st1, x - 2, 72, w + 4, 4);
  g.outline(outlineOf);
}

function brasero(g: Lienzo, f: number): void {
  // Brasero de piedra en trípode con brasas que laten.
  g.line(C.st1, 8, 39, 12, 22, 2); g.line(C.st1, 24, 39, 20, 22, 2); g.rect(C.st1, 15, 24, 2, 15);
  g.rect(C.st2, 5, 16, 22, 8); g.rect(C.st3, 5, 16, 22, 1); g.rect(C.st1, 7, 23, 18, 2);
  for (let x = 7; x < 25; x += 4) g.set(C.st1, x, 19);
  g.outline(outlineOf);
  for (let x = 7; x < 25; x++) g.set((x + f) % 3 === 0 ? C.wa2 : C.rd0, x, 15);
  flame(g, 12, 14, f, 2, true); flame(g, 19, 14, f + 2, 1.5, true); flame(g, 16, 14, f + 1, 2);
  for (let k = 0; k < 3; k++) g.set(C.wa2, 10 + ((f * 5 + k * 7) % 14), 2 + ((f + k) * 3) % 6);
}

function pedestal(g: Lienzo): void {
  // Plataforma escalonada para la Cabeza Olmeca (la cabeza la pone el agente de enemigos).
  const steps: Array<[number, number, number, number]> = [[0, 40, 176, 16], [10, 26, 156, 14], [24, 14, 128, 12]];
  for (const [x, y, w, h] of steps) {
    g.rect(C.st2, x, y, w, h); g.rect(C.st4, x, y, w, 1); g.rect(C.st3, x, y + 1, w, 1); g.rect(C.st1, x, y + h - 2, w, 2);
    for (let bx = x + 12; bx < x + w - 6; bx += 18) g.rect(C.st1, bx, y + 2, 1, h - 3);
    for (let k = 0; k < w / 4; k++) g.set(C.st3, x + hash(k, y) * w, y + 2 + hash(y, k) * (h - 4));
  }
  // Greca olmeca y cruz de San Andrés en la cara frontal.
  for (let x = 30; x < 146; x += 12) { g.rect(C.st1, x, 17, 8, 1); g.rect(C.st1, x + 7, 17, 1, 5); g.rect(C.st1, x + 3, 21, 5, 1); }
  for (const cx of [60, 116]) { g.line(C.st1, cx - 5, 44, cx + 5, 52); g.line(C.st1, cx + 5, 44, cx - 5, 52); }
  // Grietas con luz morada del ritual.
  for (const [x0, y0, len] of [[40, 30, 14], [130, 42, 12], [88, 16, 9]] as const) {
    let x = x0, y = y0;
    for (let s = 0; s < len; s++) { x += s % 2 ? 1 : 0; y += 1; g.set(s % 3 ? C.pu1 : C.pu2, x, y); }
  }
  for (let k = 0; k < 30; k++) g.set(k % 2 ? C.fo2 : C.fo1, hash(k, 1, 9) * 176, 54 - hash(k, 2, 9) * 6);
  g.outline(outlineOf);
}

function estandarte(g: Lienzo): void {
  g.rect(C.ea1, 11, 0, 2, 80); g.rect(C.ea2, 11, 0, 1, 80); g.rect(C.ea0, 2, 4, 20, 2);
  for (let y = 6; y < 54; y++) {
    const w = y > 46 ? 18 - (y - 46) * 2 : 18;
    if (w > 0) g.rect(y % 13 === 0 ? C.ink : C.te0, 12 - w / 2 + (y > 46 ? 0 : 0), y, w, 1);
  }
  g.rect(C.te1, 3, 6, 18, 1);
  mirror(g, 12, 22, 5);
  for (let k = 0; k < 8; k++) g.set(C.rd0, 12 + Math.round(Math.cos(k * 0.785) * 8), 22 + Math.round(Math.sin(k * 0.785) * 8));
  g.rect(C.rd0, 6, 36, 12, 1); g.rect(C.rd0, 8, 39, 8, 1);
  g.outline(outlineOf);
}

/* ================================ NPCs ================================ */

interface Look {
  skin: [string, string, string];
  shirt: [string, string, string];
  pants: [string, string];
  feet: string;
}

/** Cuerpo base de perfil (mirando a la derecha). `bob` baja torso y cabeza 1 px al respirar. */
function body(g: Lienzo, l: Look, bob: number, stoop = 0, skirt?: [string, string, string]): void {
  const [sk0, sk1, sk2] = l.skin;
  // Piernas y huaraches.
  if (skirt) {
    for (let y = 48; y < 76; y++) {
      const spread = Math.floor((y - 48) / 5);
      g.rect(skirt[0], 24 - spread, y, 17 + spread * 2, 1);
      g.rect(skirt[1], 24 - spread, y, 5, 1);
      if (y > 70) g.rect(skirt[2], 24 - spread, y, 17 + spread * 2, 1);
      if (y === 72) for (let x = 24 - spread; x < 41 + spread; x += 3) g.set(C.wa2, x, y);
    }
    g.rect(sk1, 28, 76, 4, 2); g.rect(sk1, 35, 76, 4, 2);
  } else {
    g.rect(l.pants[1], 26, 50, 7, 26); g.rect(l.pants[0], 33, 50, 7, 26);
    g.rect(l.pants[1], 33, 50, 1, 26); g.rect(l.pants[0], 26, 72, 7, 4);
    g.rect(sk1, 27, 74, 5, 2); g.rect(sk1, 34, 74, 5, 2);
  }
  g.rect(l.feet, 26, 76, 8, 2); g.rect(l.feet, 33, 76, 9, 2); g.set(C.ea3, 41, 76);
  if (!skirt) g.rect(l.pants[1], 32, 56, 1, 18); // separación entre piernas
  // Torso: camisa de manta con pliegues, hombros redondos y cintura; luz desde arriba a la izquierda.
  const ty = 28 + bob, tx = 23 + stoop;
  for (let y = 0; y < 23 - bob; y++) {
    const inset = y === 0 ? 2 : y === 1 ? 1 : y > 15 ? 1 : 0;
    g.rect(l.shirt[1], tx + inset, ty + y, 19 - inset * 2, 1);
    if (y > 0 && y < 21 - bob) g.rect(l.shirt[0], tx + 2 + inset, ty + y, 12 - inset, 1);
  }
  g.rect(l.shirt[2], tx + 3, ty + 2, 2, 16 - bob);
  g.rect(l.shirt[1], tx + 10, ty + 5, 1, 14 - bob);
  // Cuello y cabeza redondeada.
  const hx = 25 + stoop * 2, hy = 9 + bob + stoop;
  g.rect(sk0, hx + 6, hy + 16, 6, 4);
  g.ellipse(sk1, hx + 8, hy + 9, 8, 9);
  g.rect(sk1, hx + 9, hy + 13, 6, 4); // mandíbula
  g.ellipse(sk2, hx + 8, hy + 7, 5, 5);
  g.rect(sk1, hx + 15, hy + 8, 2, 4); g.set(sk2, hx + 16, hy + 8); // nariz
  g.set(C.ink, hx + 13, hy + 8); g.set(C.ink, hx + 13, hy + 9); g.set(sk2, hx + 12, hy + 7); // ojo
  g.rect(sk0, hx + 11, hy + 6, 3, 1); // ceja
  g.rect(sk0, hx + 12, hy + 14, 3, 1); // boca
  g.rect(sk0, hx + 4, hy + 8, 3, 4); g.set(sk1, hx + 5, hy + 9); // oreja
}

/** Brazo delantero; devuelve la posición de la mano. */
function arm(g: Lienzo, l: Look, bob: number, reach: number, drop: number, stoop = 0): [number, number] {
  const sx = 29 + stoop, sy = 31 + bob;
  const hx = sx + reach, hy = sy + 14 + drop;
  g.line(l.shirt[1], sx, sy, hx - 1, hy - 1, 4); g.line(l.shirt[0], sx, sy, hx - 1, hy - 2, 2);
  g.rect(l.skin[1], hx - 1, hy - 1, 4, 4); g.set(l.skin[2], hx - 1, hy - 1);
  return [hx, hy];
}

function necklace(g: Lienzo, x: number, y: number, beads: string[], len = 9): void {
  for (let k = 0; k < len; k++) g.set(beads[k % beads.length], x + k, y + Math.round(Math.sin(k / (len - 1) * Math.PI) * 4));
}

function hatPalma(g: Lienzo, hx: number, hy: number, wide: number): void {
  g.ellipse(C.ea3, hx + 8, hy + 1, wide, 3); g.rect(C.ea4, hx + 8 - wide, hy, wide * 2, 1);
  g.rect(C.ea3, hx + 2, hy - 7, 12, 7); g.rect(C.ea4, hx + 3, hy - 7, 8, 5);
  g.rect(C.ea1, hx + 2, hy - 2, 12, 2);
  for (let x = hx + 8 - wide; x < hx + 8 + wide; x += 3) g.set(C.ea2, x, hy + 1);
}

const outlineChar = (c: string): string => (c === C.sh1 || c === C.sh0 || c === C.wa4 ? C.st2 : outlineOf(c));

function brujoAnciano(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0, stoop = 2;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh1, C.sh0, C.wa4], pants: [C.sh0, C.sh1], feet: C.ea2 };
  // Bastón detrás del cuerpo.
  g.rect(C.ea1, 21, 30, 2, 48); g.rect(C.ea3, 21, 30, 1, 48); g.rect(C.ea2, 19, 28, 5, 3);
  body(g, look, bob, stoop);
  const hx = 29, hy = 11 + bob;
  // Cabello y barba canos, arrugas.
  g.rect(C.st5, hx, hy + 2, 5, 10); g.rect(C.sh1, hx + 9, hy + 13, 7, 5); g.rect(C.st5, hx + 10, hy + 17, 5, 2);
  g.rect(C.sh1, hx + 11, hy + 12, 5, 1); g.set(C.sk0, hx + 11, hy + 5); g.set(C.sk0, hx + 14, hy + 11);
  hatPalma(g, hx, hy + 1, 14);
  // Faja roja y morral de ixtle.
  g.rect(C.rd0, 25, 47 + bob, 19, 3); g.rect(C.rd1, 25, 47 + bob, 19, 1);
  g.line(C.ea3, 27, 30 + bob, 41, 46 + bob); g.rect(C.ea3, 38, 44 + bob, 7, 7); g.rect(C.ea4, 38, 44 + bob, 7, 1);
  necklace(g, 34, 29 + bob, [C.te2, C.wa1, C.te3, C.tq1]);
  const [ax, ay] = arm(g, look, bob, 13, -2 + (f === 1 ? -1 : 0), stoop);
  // Ramo de albahaca para la limpia.
  g.line(C.fo2, ax + 1, ay, ax + 6, ay - 7, 2);
  for (const [dx, dy] of [[5, -9], [7, -7], [3, -8], [6, -11]]) g.ellipse(f % 2 && dx === 7 ? C.fo4 : C.fo3, ax + dx, ay + dy, 2, 1);
  g.set(C.fo5, ax + 5, ay - 10);
  g.outline(outlineChar);
}

function bruja(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh1, C.sh0, C.wa4], pants: [C.st1, C.st2], feet: C.ea2 };
  // Trenza larga por la espalda con listón rojo.
  for (let y = 18; y < 52; y += 3) { g.rect(C.st0, 22 + (y % 2), y + bob, 4, 3); g.set(C.mtn0, 23, y + bob); }
  g.rect(C.rd1, 22, 52 + bob, 4, 2);
  body(g, look, bob, 0, [C.st1, C.st0, C.ro0]);
  const hx = 25, hy = 9 + bob;
  // Cabello negro con raya al centro y arete dorado.
  g.rect(C.st0, hx, hy - 1, 14, 5); g.rect(C.st0, hx, hy, 6, 12); g.rect(C.mtn0, hx + 3, hy, 6, 1);
  g.rect(C.wa2, hx + 5, hy + 13, 1, 2);
  // Bordado del huipil.
  for (let x = 24; x < 41; x += 2) { g.set(x % 4 ? C.ro2 : C.wa2, x, 31 + bob); g.set(C.tq1, x + 1, 33 + bob); }
  // Rebozo rosa sobre los hombros y cayendo por la espalda.
  for (let y = 28; y < 50; y++) {
    const w = y < 34 ? 18 : 8;
    g.rect(C.ro0, 21, y + bob, w, 1);
    if (y % 4 === 0) g.rect(C.ro1, 21, y + bob, w, 1);
    if (y > 46) for (let x = 21; x < 29; x += 2) g.set(C.ro2, x, y + bob + 2);
  }
  necklace(g, 31, 34 + bob, [C.rd0, C.sh1, C.rd1], 10);
  const [ax, ay] = arm(g, look, bob, 11, -6);
  // Veladora en la mano con llama viva.
  g.rect(C.sh1, ax, ay - 6, 4, 6); g.rect(C.wa4, ax, ay - 6, 1, 6); g.rect(C.ro1, ax, ay - 3, 4, 1);
  g.outline(outlineChar);
  flame(g, ax + 2, ay - 7, f);
}

function brujoCopal(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh1, C.sh0, C.wa4], pants: [C.sh0, C.sh1], feet: C.ea1 };
  body(g, look, bob);
  const hx = 25, hy = 9 + bob;
  // Cabello negro corto, bigote y paliacate rojo al cuello.
  g.rect(C.st0, hx, hy - 1, 15, 5); g.rect(C.st0, hx, hy, 7, 9); g.rect(C.st1, hx + 4, hy - 1, 6, 1);
  g.rect(C.st0, hx + 12, hy + 12, 5, 1);
  g.rect(C.rd0, 29, 27 + bob, 10, 3); g.rect(C.rd1, 30, 27 + bob, 6, 1); g.line(C.rd0, 31, 30 + bob, 29, 34 + bob, 2);
  // Pliegues de guayabera y collar de caracoles y semillas.
  for (const x of [28, 37]) g.rect(C.sh0, x, 33 + bob, 1, 14);
  necklace(g, 32, 31 + bob, [C.sh1, C.te2, C.sh1, C.ea3], 10);
  g.rect(C.te1, 24, 47 + bob, 19, 2);
  const [ax, ay] = arm(g, look, bob, 12, 2);
  // Sahumador de barro colgando con brasas de copal.
  g.line(C.st3, ax + 1, ay + 2, ax + 1, ay + 6);
  g.rect(C.te2, ax - 3, ay + 6, 9, 5); g.rect(C.te3, ax - 3, ay + 6, 9, 1); g.rect(C.te1, ax - 1, ay + 11, 5, 2);
  g.outline(outlineChar);
  for (let x = ax - 2; x < ax + 5; x++) g.set((x + f) % 2 ? C.wa2 : C.rd0, x, ay + 5);
  smoke(g, ax + 1, ay + 3, f, 26, C.st5, C.st4);
  smoke(g, ax + 3, ay + 1, f + 2, 18, C.sh0, C.st4);
}

function pescador(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.tq1, C.tq0, C.tq2], pants: [C.st2, C.st3], feet: C.sk1 };
  body(g, look, bob);
  // Pantalón arremangado: pantorrilla descubierta.
  g.rect(C.sk1, 27, 66, 5, 8); g.rect(C.sk1, 34, 66, 5, 8); g.rect(C.st3, 26, 64, 14, 2);
  const hx = 25, hy = 9 + bob;
  g.rect(C.st1, hx, hy + 2, 6, 8); g.rect(C.st1, hx + 11, hy + 13, 5, 3); // barba de días
  hatPalma(g, hx, hy + 1, 11);
  // Atarraya (red) al hombro con plomos.
  for (let y = 0; y < 22; y++) for (let x = 0; x < 12 - Math.floor(y / 3); x++) if ((x + y) % 3 === 0) g.set(C.st4, 21 + x - Math.floor(y / 4), 30 + bob + y);
  for (let x = 16; x < 28; x += 3) g.set(C.st3, x, 52 + bob);
  const [ax, ay] = arm(g, look, bob, 8, 2);
  // Pescado colgando de un cordel.
  g.line(C.ea3, ax + 1, ay + 2, ax + 1, ay + 6);
  g.ellipse(C.mtn1, ax + 1, ay + 11, 2, 5); g.set(C.mtn2, ax, ay + 8); g.rect(C.mtn1, ax - 1, ay + 16, 4, 1 + (f % 2));
  g.outline(outlineChar);
}

function senora(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh0, C.st4, C.sh1], pants: [C.ea1, C.ea2], feet: C.ea1 };
  body(g, look, bob, 1, [C.ea2, C.ea1, C.ea0]);
  const hx = 27, hy = 10 + bob;
  // Cabello canoso y rebozo azul de noche que cubre la nuca y cae por hombros y espalda.
  g.rect(C.st5, hx + 3, hy, 9, 3); g.rect(C.st4, hx + 3, hy + 2, 9, 1);
  for (let y = -2; y < 40; y++) {
    const x0 = y < 2 ? hx + 1 - y : hx - 3, x1 = y < 2 ? hx + 12 : y < 18 ? hx + 6 : hx + 14;
    g.rect(y % 4 === 0 ? C.mtn1 : C.mtn0, x0, hy + y, x1 - x0, 1);
    if (y > 32 && y % 2 === 0) for (let x = x0; x < x1; x += 2) g.set(C.mtn2, x, hy + y + 1);
  }
  necklace(g, 33, 30 + bob, [C.wa2, C.wa1], 7);
  const [ax, ay] = arm(g, look, bob, 10, 4, 1);
  // Farol de mano encendido.
  g.line(C.st0, ax + 1, ay + 2, ax + 1, ay + 4);
  g.rect(C.st0, ax - 2, ay + 4, 7, 9); g.rect(C.st0, ax - 3, ay + 4, 9, 1);
  g.outline(outlineChar);
  g.rect(f % 2 ? C.wa2 : C.wa3, ax - 1, ay + 6, 5, 6); g.rect(C.wa4, ax, ay + 7 + (f % 2), 2, 3);
}

/* ============================== CATÁLOGO ============================== */

export const CATEMACO_ART: CatemacoArtSpec[] = [
  { key: 'prop_n03_letras_catemaco', dir: PROPS, w: 224, h: 72, frames: 1, feetY: 71, draw: g => letras(g) },
  { key: 'prop_n03_altar_brujos', dir: PROPS, w: 64, h: 56, frames: 4, fps: 6, feetY: 54, draw: altarBrujos },
  { key: 'prop_n03_jaula_cerrada', dir: PROPS, w: 40, h: 36, frames: 1, feetY: 35, draw: g => jaula(g, false) },
  { key: 'prop_n03_jaula_abierta', dir: PROPS, w: 40, h: 36, frames: 1, feetY: 35, draw: g => jaula(g, true) },
  { key: 'prop_n03_gato_negro', dir: PROPS, w: 24, h: 20, frames: 4, fps: 3, feetY: 19, draw: (g, f) => gato(g, f, false) },
  { key: 'prop_n03_gato_negro_echado', dir: PROPS, w: 28, h: 14, frames: 2, fps: 2, feetY: 13, draw: (g, f) => gato(g, f, true) },
  { key: 'prop_n03_lona', dir: PROPS, w: 96, h: 72, frames: 1, feetY: 71, draw: g => lona(g, 96, 72) },
  { key: 'prop_n03_lona_chica', dir: PROPS, w: 64, h: 48, frames: 1, feetY: 47, draw: g => lona(g, 64, 48) },
  { key: 'prop_n03_antorcha', dir: PROPS, w: 16, h: 56, frames: 4, fps: 8, feetY: 55, draw: antorcha },
  { key: 'prop_n03_caja_cofradia', dir: PROPS, w: 32, h: 28, frames: 1, feetY: 27, draw: g => cajaCofradia(g) },
  { key: 'prop_n03_nota', dir: PROPS, w: 16, h: 16, frames: 1, feetY: 15, draw: g => nota(g) },
  { key: 'prop_n03_pista_espejo', dir: PROPS, w: 16, h: 16, frames: 1, feetY: 15, draw: g => pistaEspejo(g) },
  { key: 'prop_n03_tablero_pistas', dir: PROPS, w: 48, h: 56, frames: 1, feetY: 55, draw: g => tablero(g) },
  { key: 'prop_n03_muelle', dir: PROPS, w: 160, h: 40, frames: 1, feetY: 39, draw: g => muelle(g) },
  { key: 'prop_n03_lancha', dir: PROPS, w: 96, h: 28, frames: 1, feetY: 24, draw: g => lancha(g) },
  { key: 'prop_n03_estela', dir: PROPS, w: 40, h: 76, frames: 1, feetY: 75, draw: g => estela(g, false) },
  { key: 'prop_n03_estela_rota', dir: PROPS, w: 40, h: 76, frames: 1, feetY: 75, draw: g => estela(g, true) },
  { key: 'prop_n03_brasero', dir: PROPS, w: 32, h: 40, frames: 4, fps: 8, feetY: 39, draw: brasero },
  { key: 'prop_n03_pedestal_olmeca', dir: PROPS, w: 176, h: 56, frames: 1, feetY: 55, draw: g => pedestal(g) },
  { key: 'prop_n03_estandarte', dir: PROPS, w: 24, h: 80, frames: 1, feetY: 79, draw: g => estandarte(g) },
  { key: 'npc_brujo_1', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: brujoAnciano },
  { key: 'npc_brujo_2', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: bruja },
  { key: 'npc_brujo_3', dir: NPCS, w: 64, h: 80, frames: 4, fps: 5, feetY: 78, draw: brujoCopal },
  { key: 'npc_poblador_n03_1', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: pescador },
  { key: 'npc_poblador_n03_2', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: senora },
];

/** Dibuja un cuadro de una entrada del catálogo. */
export function drawCatemacoArt(spec: CatemacoArtSpec, frame: number): Lienzo {
  const g = new Lienzo(spec.w, spec.h);
  spec.draw(g, frame);
  return g;
}
