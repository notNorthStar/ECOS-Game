/**
 * Props del Nivel 10 (Guadalajara, el final). Cada entrada describe un PNG (o tira de cuadros) que
 * genera tools/gen-gdl-scenery.mjs y que el juego también dibuja como respaldo si falta.
 * La madre, Balam jaguar, las Tzitzimime e Itzpapálotl (y su capullo) NO están aquí: son personajes
 * importantes (placeholders de otros agentes; arte final del equipo). El alto mando de la Cofradía sí, como
 * placeholder simple (figura de escena sin comportamiento, `prop_n10_alto_mando`).
 * Las cadenas del altar sí: son escenario (prop aparte para que la madre se dibuje encima).
 */
import { BIG_CDMX, C, Lienzo, bayer, hash, noise1, outlineOf } from './CdmxPixels';
import { jacarandaSeca } from './GdlLandscape';

export interface GdlArtSpec {
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
  /** Lo coloca el código (GdlScenery), no el JSON del nivel. */
  code?: boolean;
  draw: (g: Lienzo, frame: number) => void;
}

const PROPS = 'escenarios/nivel-10-guadalajara/props';

/* =============================== AYUDAS =============================== */

/** Letras grandes 5×7 que faltan para GUADALAJARA (G, U, L, J, R); el resto viene de BIG_CDMX. */
const BIG_GDL: Record<string, string[]> = {
  ...BIG_CDMX,
  G: ['01111', '11000', '11000', '11011', '11001', '11001', '01111'],
  U: ['11011', '11011', '11011', '11011', '11011', '11011', '01110'],
  L: ['11000', '11000', '11000', '11000', '11000', '11000', '11111'],
  J: ['00011', '00011', '00011', '00011', '00011', '11011', '01110'],
  R: ['11110', '11011', '11011', '11110', '11100', '11010', '11011'],
};

/** Llama de vela (4 cuadros). */
function flame(g: Lienzo, x: number, y: number, frame: number, size = 1): void {
  const h = [4, 5, 3, 5][frame % 4] * size, sway = [0, 1, 0, -1][frame % 4];
  for (let i = 0; i < h; i++) {
    const t = i / h, half = Math.round((1 - t) * 1.2 * size), sx = x + Math.round(sway * t * size);
    g.rect(C.wa1, sx - half, y - i, half * 2 + 1, 1);
    if (i < h - 1 && half > 0) g.rect(C.wa2, sx - half + 1, y - i, Math.max(1, half * 2 - 1), 1);
    if (i < h * 0.5) g.set(C.wa4, sx, y - i);
  }
}

/** Vela de cera con escurrimientos. */
function vela(g: Lienzo, x: number, base: number, h: number, frame: number, lit = true): void {
  g.rect(C.sh0, x - 1, base - h, 3, h); g.rect(C.sh1, x - 1, base - h, 1, h); g.rect(C.st4, x + 1, base - h, 1, h);
  g.set(C.sh1, x + 2, base - h + 2); g.set(C.sh1, x + 2, base - h + 3);
  g.set(C.ink, x, base - h - 1);
  if (lit) flame(g, x, base - h - 2, frame);
}

/** Óxido y manchas sobre lo ya pintado. */
function oxido(g: Lienzo, w: number, h: number, k: number, seed: number): void {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!g.has(x, y)) continue;
    const n = hash(x >> 1, y >> 1, seed);
    if (n < k * 0.5) g.set(C.te1, x, y); else if (n < k) g.set(C.te2, x, y);
  }
}

/* =============================== AVENIDA =============================== */

/** Letras turísticas GUADALAJARA oxidadas, con veladoras y pétalos de jacaranda. */
function letras(g: Lienzo): void {
  const word = 'GUADALAJARA';
  const ramps: Array<[string, string, string, string]> = [
    [C.ro0, C.ro1, C.ro2, C.ro3], [C.tq0, C.tq1, C.tq2, C.tq3], [C.wa0, C.wa1, C.wa2, C.wa3], [C.pu0, C.pu1, C.pu2, C.pu3],
  ];
  // Base de concreto.
  g.rect(C.st1, 2, 62, 300, 14); g.rect(C.st2, 3, 63, 298, 12); g.rect(C.st4, 3, 63, 298, 1);
  for (let x = 6; x < 300; x += 22) g.rect(C.st1, x, 66, 1, 9);
  for (let n = 0; n < word.length; n++) {
    const glyph = BIG_GDL[word[n]], [o, d, md, l] = ramps[n % 4], ox = 8 + n * 26, oy = 18 + (n % 2);
    const on = (x: number, y: number) => y >= 0 && y < 7 && x >= 0 && x < 5 && glyph[y][x] === '1';
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) { g.rect(C.ink, ox + x * 4 + 3, oy + y * 6 + 3, 4, 6); g.rect(d, ox + x * 4 + 2, oy + y * 6 + 2, 4, 6); }
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) {
      for (let py = 0; py < 6; py++) for (let px = 0; px < 4; px++) {
        const tx = ox + x * 4 + px, ty = oy + y * 6 + py;
        let c = bayer(tx, ty) < 0.7 - (y * 6 + py) / 42 * 0.6 ? l : md;
        if ((!on(x - 1, y) && px === 0) || (!on(x, y - 1) && py === 0)) c = l;
        const wear = hash(tx, ty, n + 80);
        if (wear > 0.95) c = C.te2; else if (wear > 0.93) c = C.te1; else if (wear < 0.02) c = C.st1;
        g.set(c, tx, ty);
      }
    }
    for (let y = oy - 1; y < oy + 44; y++) for (let x = ox - 1; x < ox + 22; x++) {
      if (g.get(x, y) === undefined && (g.get(x + 1, y) === l || g.get(x, y + 1) === l || g.get(x + 1, y) === md || g.get(x, y + 1) === md)) g.set(o, x, y);
    }
    // Escurrimientos de óxido.
    const rx = ox + 2 + Math.floor(hash(n, 1, 81) * 15);
    for (let y = oy + 20; y < oy + 30 + (n % 3) * 5; y++) if (g.has(rx, y)) g.set(C.te2, rx, y);
  }
  // La segunda A está caída de lado y la J perdió el gancho.
  const fa = 8 + 3 * 26;
  for (let k = 0; k < 10; k++) g.erase(fa + 14 + k, 18, 1, 6 + k);
  for (let k = 0; k < 6; k++) g.erase(8 + 7 * 26 + k, 18 + 36, 1, 8);
  // Veladoras de vigilia, flores secas y pétalos.
  for (const vx of [18, 70, 130, 186, 240, 288]) { g.rect(C.sh1, vx, 56, 3, 6); g.rect(C.ro1, vx, 59, 3, 1); g.set(C.wa3, vx + 1, 54); g.set(C.wa2, vx + 1, 55); }
  for (let k = 0; k < 40; k++) g.set(hash(k, 1, 82) > 0.5 ? C.pu2 : C.pu1, 4 + hash(k, 2, 82) * 296, 60 + hash(k, 3, 82) * 4);
  // Manta de la Cofradía amarrada a la R final.
  for (let y = 63; y < 76; y++) g.rect(y > 72 && y % 2 ? C.pu0 : C.ink, 140, y, 24, 1);
  g.ellipse(C.pu1, 152, 68, 3, 3); g.ellipse(C.ink, 152, 68, 1, 1);
}

/** Tranvía abandonado (genérico, crema y rojo deslavados), con pantógrafo roto y vidrios estrellados. */
function tranvia(g: Lienzo): void {
  const W = 184, H = 92;
  // Pantógrafo roto.
  g.line(C.st1, 70, 14, 92, 2, 2); g.line(C.st1, 92, 2, 110, 10, 2); g.rect(C.st0, 64, 14, 54, 3);
  // Techo redondeado.
  for (let x = 6; x < W - 6; x++) { const r = x < 16 ? 16 - x : x > W - 17 ? x - (W - 17) : 0; g.rect(C.st3, x, 16 + Math.round(r * 0.5), 1, 6); g.set(C.st4, x, 16 + Math.round(r * 0.5)); }
  // Caja: franja crema arriba, roja abajo.
  for (let y = 22; y < 74; y++) for (let x = 4; x < W - 4; x++) {
    let c: string = y < 50 ? (bayer(x, y) < 0.1 ? C.st5 : C.ea4) : (bayer(x, y) < 0.1 ? C.te3 : C.te2);
    if (y === 50 || y === 51) c = C.wa1;
    if (x < 6) c = y < 50 ? C.sk3 : C.te3; else if (x > W - 7) c = y < 50 ? C.ea3 : C.te1;
    g.set(c, x, y);
  }
  // Ventanillas (algunas estrelladas, otras sin vidrio).
  for (let k = 0; k < 8; k++) {
    const wx = 12 + k * 21;
    g.rect(C.ea2, wx - 1, 25, 18, 20); g.rect(C.ink, wx, 26, 16, 18);
    const v = hash(k, 1, 91);
    if (v > 0.6) { g.rect(C.mtn1, wx, 26, 16, 18); g.line(C.sh0, wx + 3, 28, wx + 12, 40); g.line(C.sh0, wx + 8, 26, wx + 6, 36); }
    else if (v > 0.3) { g.rect(C.mtn0, wx, 26, 16, 18); g.rect(C.mtn1, wx + 1, 27, 6, 4); }
  }
  // Puerta con bisagras y número de ruta (genérico).
  g.rect(C.te1, 86, 52, 18, 22); g.rect(C.ink, 87, 53, 16, 20); g.rect(C.mtn0, 88, 54, 6, 10); g.rect(C.mtn0, 96, 54, 6, 10);
  g.rect(C.ink, 18, 54, 18, 9); g.rect(C.wa2, 20, 56, 2, 5); g.rect(C.wa2, 24, 56, 4, 1); g.rect(C.wa2, 26, 56, 2, 5); g.rect(C.wa2, 24, 60, 4, 1);
  // Bogies y ruedas sobre el riel.
  g.rect(C.st1, 4, 74, W - 8, 4);
  for (const bx of [30, W - 46]) { g.rect(C.st0, bx - 6, 78, 34, 6); for (const wx of [bx, bx + 22]) { g.ellipse(C.ink, wx, 85, 6, 6); g.ellipse(C.st2, wx, 85, 4, 4); g.ellipse(C.st0, wx, 85, 1, 1); } }
  // Óxido, grafitis y pétalos sobre el techo.
  oxido(g, W, H, 0.06, 92);
  for (let k = 0; k < 5; k++) { const gx = 120 + k * 9; for (let y = 58; y < 70; y++) if (hash(y, k, 93) > 0.4) g.set([C.tq2, C.ro2, C.pu2][k % 3], gx + Math.sin(y * 0.6) * 2, y); }
  for (let k = 0; k < 30; k++) g.set(hash(k, 1, 94) > 0.5 ? C.pu2 : C.pu1, 10 + hash(k, 2, 94) * (W - 20), 16 + hash(k, 3, 94) * 4);
  g.outline(c => (c === C.ea4 || c === C.st5 || c === C.sk3 ? C.ea2 : outlineOf(c)));
}

/** Sedán abandonado: llantas ponchadas, parabrisas estrellado, cofre abierto. */
function auto1(g: Lienzo): void {
  const W = 92;
  // Carrocería.
  for (let x = 4; x < W - 4; x++) {
    const roof = x > 28 && x < 66 ? 8 : x > 20 && x < 74 ? 8 + Math.abs(x < 28 ? 28 - x : x > 66 ? x - 66 : 0) * 1.4 : 22;
    for (let y = Math.round(roof); y < 34; y++) {
      let c: string = y < 22 ? C.mtn1 : bayer(x, y) < 0.12 ? C.mtn2 : C.mtn1;
      if (y === Math.round(roof)) c = C.mtn2;
      if (y > 29) c = C.mtn0;
      g.set(c, x, y);
    }
  }
  // Ventanas (parabrisas estrellado).
  for (let y = 11; y < 21; y++) for (let x = 30; x < 64; x++) if (x !== 47) g.set(x < 47 ? C.night : C.mtn0, x, y);
  g.line(C.sh0, 50, 12, 58, 20); g.line(C.sh0, 54, 12, 52, 19); g.line(C.sh0, 48, 16, 62, 15);
  // Cofre levantado, defensa caída y faros rotos.
  g.line(C.mtn2, W - 22, 22, W - 8, 10, 2); g.line(C.mtn0, W - 8, 10, W - 4, 22);
  g.rect(C.st3, 2, 28, 8, 3); g.rect(C.st3, W - 8, 30, 6, 3); g.rect(C.sh0, W - 7, 23, 3, 3); g.set(C.wa1, 5, 24);
  // Llantas ponchadas.
  for (const wx of [20, W - 22]) { g.ellipse(C.ink, wx, 34, 8, 5); g.ellipse(C.st2, wx, 34, 4, 3); g.rect(C.ink, wx - 9, 37, 18, 2); }
  oxido(g, W, 40, 0.12, 95);
  for (let k = 0; k < 18; k++) g.set(hash(k, 1, 96) > 0.5 ? C.pu2 : C.pu1, 24 + hash(k, 2, 96) * 44, 8 + hash(k, 3, 96) * 2);
  g.outline(outlineOf);
}

/** Combi abandonada (puerta corrediza abierta, interior oscuro). */
function auto2(g: Lienzo): void {
  const W = 96;
  for (let y = 6; y < 40; y++) for (let x = 4; x < W - 4; x++) {
    const r = y < 12 ? (x < 10 ? 10 - x : x > W - 11 ? x - (W - 11) : 0) : 0;
    if (r > 12 - y) continue;
    let c: string = y < 24 ? C.sh0 : C.tq1;
    if (y === 24) c = C.st4; if (y > 36) c = C.tq0; if (bayer(x, y) < 0.08) c = y < 24 ? C.sh1 : C.tq2;
    g.set(c, x, y);
  }
  for (let k = 0; k < 4; k++) { const wx = 10 + k * 18; g.rect(C.night, wx, 12, 14, 10); if (hash(k, 1, 97) > 0.5) g.line(C.sh0, wx + 2, 13, wx + 10, 21); }
  g.rect(C.ink, 46, 14, 22, 24); g.rect(C.void, 48, 16, 18, 22); g.rect(C.ea1, 50, 30, 14, 6); // asiento
  g.rect(C.tq1, 68, 14, 20, 24); g.rect(C.tq2, 68, 14, 1, 24);
  g.rect(C.st3, 2, 34, 6, 3); g.rect(C.st3, W - 8, 34, 6, 3);
  for (const wx of [20, W - 20]) { g.ellipse(C.ink, wx, 41, 7, 6); g.ellipse(C.st2, wx, 41, 3, 3); }
  oxido(g, W, 48, 0.1, 98);
  g.outline(outlineOf);
}

/** Farola de herrería tapatía con un foco que todavía titila (cuadro 1 = apagado). */
function farol(g: Lienzo, f: number): void {
  const cx = 12, H = 100;
  g.rect(C.ink, cx - 4, H - 6, 9, 6); g.rect(C.st1, cx - 3, H - 6, 2, 6);
  g.rect(C.ink, cx - 1, 24, 3, H - 30); g.rect(C.st1, cx - 1, 24, 1, H - 30);
  for (const y of [40, 60]) g.rect(C.ink, cx - 2, y, 5, 2);
  for (let k = 0; k < 6; k++) { g.set(C.ink, cx - 3 - k * 0.6, 28 + k); g.set(C.ink, cx + 3 + k * 0.6, 28 + k); }
  // Linterna.
  g.rect(C.ink, cx - 6, 4, 13, 2); g.rect(C.ink, cx - 5, 6, 11, 16);
  const lit = f === 0;
  g.rect(lit ? C.wa2 : C.st1, cx - 4, 7, 9, 13); if (lit) { g.rect(C.wa4, cx - 1, 9, 3, 8); g.rect(C.wa3, cx - 3, 8, 1, 11); }
  g.rect(C.ink, cx, 7, 1, 13); g.rect(C.ink, cx - 6, 20, 13, 2); g.set(C.ink, cx, 2); g.rect(C.ink, cx - 1, 3, 3, 1);
  g.set(C.sh0, cx + 3, 10); // vidrio roto
}

/** Montón de escombro con varillas y cascajo de cantera. */
function escombros(g: Lienzo): void {
  const W = 72, H = 30;
  for (let x = 0; x < W; x++) {
    const top = Math.round(H - 4 - Math.sin(x / W * Math.PI) * 18 - noise1(x * 0.3, 101) * 6);
    for (let y = top; y < H; y++) { const n = hash(x, y, 102); g.set(y === top ? C.st4 : n > 0.75 ? C.ea3 : n > 0.45 ? C.st2 : n > 0.2 ? C.st3 : C.te2, x, y); }
  }
  for (let k = 0; k < 5; k++) { const bx = 10 + k * 13; g.rect(C.ea4, bx, 14 + (k % 2) * 3, 8, 5); g.rect(C.sk3, bx, 14 + (k % 2) * 3, 8, 1); }
  g.line(C.te1, 20, 16, 14, 2); g.line(C.te1, 46, 14, 54, 4); g.line(C.te1, 50, 16, 58, 10);
  g.outline(outlineOf);
}

/** Barricada de la Cofradía: costales, tablas y manta negra con el espejo. */
function barricada(g: Lienzo): void {
  const W = 104, H = 48;
  g.line(C.ea2, 6, H - 2, 30, 6, 3); g.line(C.ea2, W - 8, H - 2, W - 32, 8, 3);
  g.rect(C.ea2, 10, 14, W - 20, 4); g.rect(C.ea3, 10, 14, W - 20, 1);
  for (let y = 18; y < 38; y++) g.rect(y > 34 && y % 2 ? C.ro0 : C.ink, 30, y, 44, 1);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.line(C.rd0, 52, 27, 52 + Math.cos(a) * 9, 27 + Math.sin(a) * 7); }
  g.ellipse(C.pu1, 52, 27, 5, 5); g.ellipse(C.ink, 52, 27, 3, 3);
  for (let row = 0; row < 2; row++) for (let k = 0; k < 7 - row; k++) {
    const sx = 6 + k * 14 + row * 7, sy = H - 10 - row * 7;
    g.ellipse(C.ea3, sx + 6, sy + 3, 7, 4); g.rect(C.ea4, sx + 1, sy, 10, 1); g.set(C.ea2, sx + 6, sy + 3);
  }
  g.outline(outlineOf);
}

/** Bandera de la Cofradía en asta (tela negra con espejo morado) que ondea (4 cuadros). */
function bandera(g: Lienzo, f: number): void {
  g.rect(C.st1, 2, 2, 2, 78); g.rect(C.st3, 2, 2, 1, 78); g.rect(C.st3, 1, 0, 4, 2);
  for (let x = 0; x < 22; x++) {
    const wave = Math.round(Math.sin(x * 0.35 + f * Math.PI / 2) * 2 * (x / 22));
    for (let y = 0; y < 34; y++) g.set(y < 2 ? C.pu0 : (x + f) % 7 === 0 ? C.st0 : C.ink, 4 + x, 4 + y + wave);
    if (x > 6 && x < 16) { const cy = 20 + wave; if (Math.hypot(x - 11, 0) < 5) { g.set(C.pu1, 4 + x, cy - 4); g.set(C.pu1, 4 + x, cy + 4); } }
  }
  const wave = Math.round(Math.sin(11 * 0.35 + f * Math.PI / 2) * 2 * 0.5);
  g.ellipse(C.pu1, 15, 21 + wave, 4, 4); g.ellipse(C.ink, 15, 21 + wave, 2, 2); g.set(C.pu3, 14, 20 + wave);
}

/** Autobús urbano volcado de lado (techo hacia el frente, ventanas hacia arriba). */
function autobusVolcado(g: Lienzo): void {
  const W = 152, H = 64;
  // Costado (ahora es la cara de arriba) y techo (cara frontal).
  for (let y = 8; y < 30; y++) for (let x = 6; x < W - 6; x++) g.set(bayer(x, y) < 0.1 ? C.wa2 : y < 10 ? C.wa2 : C.wa1, x, y);
  for (let k = 0; k < 7; k++) { const wx = 14 + k * 19; g.rect(C.ink, wx, 11, 15, 12); if (hash(k, 1, 201) > 0.5) g.rect(C.mtn0, wx + 1, 12, 13, 10); }
  for (let y = 30; y < H - 6; y++) for (let x = 4; x < W - 4; x++) g.set(y < 32 ? C.st4 : bayer(x, y) < 0.1 ? C.st4 : C.st3, x, y);
  for (let x = 20; x < W - 20; x += 24) g.rect(C.st2, x, 34, 14, 3); // escotillas
  g.rect(C.te1, 4, 44, W - 8, 3); // franja
  // Ruedas que miran al lado (asoman arriba) y chasis.
  for (const wx of [30, W - 34]) { g.ellipse(C.ink, wx, 6, 9, 4); g.ellipse(C.st2, wx, 6, 4, 2); }
  g.rect(C.st0, 10, H - 6, W - 20, 4);
  // Parabrisas reventado en el frente y vidrio regado.
  g.rect(C.ink, W - 10, 10, 6, 46); g.line(C.sh0, W - 9, 14, W - 6, 30);
  for (let k = 0; k < 14; k++) g.set(C.sh0, W - 30 + hash(k, 2, 202) * 26, H - 2 - hash(k, 3, 202) * 2);
  oxido(g, W, H, 0.08, 203);
  for (let k = 0; k < 24; k++) g.set(hash(k, 4, 204) > 0.5 ? C.pu2 : C.pu1, 10 + hash(k, 5, 204) * (W - 20), 8 + hash(k, 6, 204) * 3);
  g.outline(outlineOf);
}

/** Tablero con carteles de personas desaparecidas (siluetas sin rostro y hojas sin texto legible). */
function cartelDesaparecidos(g: Lienzo): void {
  const W = 56, H = 72;
  g.rect(C.ea1, 6, 20, 3, H - 20); g.rect(C.ea1, W - 9, 20, 3, H - 20);
  g.rect(C.ea2, 2, 4, W - 4, 44); g.rect(C.ea3, 2, 4, W - 4, 1); g.rect(C.ea1, 2, 47, W - 4, 2);
  for (let k = 0; k < 9; k++) {
    const px = 5 + (k % 4) * 12 + (k > 3 ? 4 : 0), py = 7 + Math.floor(k / 4) * 14, tilt = hash(k, 1, 211) > 0.5 ? 1 : 0;
    g.rect(k % 3 === 0 ? C.wa4 : C.sh1, px, py + tilt, 10, 13);
    g.ellipse(C.st2, px + 5, py + 4 + tilt, 2, 2); g.rect(C.st2, px + 3, py + 6 + tilt, 5, 3);
    for (let r = 0; r < 2; r++) g.rect(C.st3, px + 1, py + 10 + r * 2 + tilt, 8, 1);
    g.set(C.rd0, px + 5, py + tilt);
  }
  for (const vx of [12, 26, 40]) { g.rect(C.sh1, vx, H - 8, 3, 6); g.set(C.wa3, vx + 1, H - 10); g.set(C.wa2, vx + 1, H - 9); }
  for (let k = 0; k < 8; k++) g.set(k % 2 ? C.ea3 : C.pu1, 8 + hash(k, 2, 212) * 40, H - 3);
  g.outline(outlineOf);
}

/** Radio de transistores abandonada (2 cuadros: el foco del dial parpadea). */
function radioVieja(g: Lienzo, f: number): void {
  g.rect(C.ea2, 2, 6, 24, 15); g.rect(C.ea3, 2, 6, 24, 1);
  g.ellipse(C.ea0, 9, 14, 5, 5); for (let y = 10; y < 19; y += 2) g.rect(C.ea1, 5, y, 9, 1);
  g.rect(C.ink, 16, 9, 8, 4); g.rect(f ? C.wa2 : C.wa0, 17, 10, 2, 2);
  g.ellipse(C.st3, 20, 17, 2, 2); g.line(C.st3, 6, 6, 18, 0);
  g.outline(outlineOf);
}

/** Portón de la Catedral (dos hojas de madera; cuadro 0 cerrado, 1 entreabierto con luz de velas). */
function puertaCatedral(g: Lienzo, f: number): void {
  const W = 72, H = 108, cx = W / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!(y >= 36 || Math.hypot(x - cx, y - 36) < 36)) continue;
    const frame = !(y >= 40 || Math.hypot(x - cx, y - 40) < 32) || x < 4 || x > W - 5;
    g.set(frame ? (x < cx ? C.ea4 : C.ea3) : C.ink, x, y);
  }
  for (let y = 40; y < H; y++) for (let x = 4; x < W - 4; x++) {
    if (y < 40 + 32 && Math.hypot(x - cx, y - 40) >= 32 && y < 40) continue;
    if (y < 72 && Math.hypot(x - cx, y - 72) > 32) continue;
    const right = x >= cx;
    if (f === 1 && right && x < cx + 26) { g.set(bayer(x, y) < 0.4 + (y - 40) / 160 ? C.wa1 : C.wa0, x, y); continue; }
    g.set((x - 4) % 8 === 0 || y % 20 === 0 ? C.ea0 : C.ea1, x, y);
  }
  if (f === 1) for (let y = 44; y < H; y++) g.rect(C.ea2, cx + 26, y, 4, 1);
  g.rect(C.st3, cx - 6, 74, 2, 3); if (f === 0) g.rect(C.st3, cx + 4, 74, 2, 3);
  g.rect(C.ea0, cx - 1, 40, 2, H - 40);
}

/** Órgano de coro pequeño (realejo) con tubos plateados. */
function organoProp(g: Lienzo): void {
  const W = 72, H = 112, cx = W / 2;
  g.rect(C.ea1, 6, 40, W - 12, H - 40); g.rect(C.ea2, 6, 40, 2, H - 40); g.rect(C.wa1, 4, 38, W - 8, 3);
  for (let k = 0; k < 15; k++) {
    const px = 9 + k * 4, len = 26 + Math.round(Math.sin(k / 14 * Math.PI) * 18);
    g.rect(C.ea0, px - 1, 40 - len, 1, len); g.rect(C.sh0, px, 40 - len, 2, len); g.rect(C.sh1, px, 40 - len, 1, len); g.rect(C.ink, px, 34, 2, 2);
  }
  g.rect(C.ink, 12, 62, W - 24, 8); for (let x = 13; x < W - 12; x += 3) g.rect(C.sh1, x, 63, 2, 6); // teclado
  for (let k = 0; k < 3; k++) { g.rect(C.ea0, 12 + k * 18, 76, 12, 30); g.rect(C.wa1, 12 + k * 18, 76, 12, 1); }
  g.rect(C.ea0, cx - 20, H - 4, 40, 4);
  g.outline(outlineOf);
}

/* =============================== CATEDRAL =============================== */

/** Altar mayor: mesa de mármol con frontal dorado, sagrario, candeleros y escalones (2 cuadros: velas). */
function altarMayor(g: Lienzo, f: number): void {
  const W = 168, H = 120, cx = W / 2;
  // Escalones (tres) con alfombra roja al centro.
  for (let s = 0; s < 3; s++) {
    const y = H - 8 - s * 8, hw = 82 - s * 10;
    g.rect(C.st4, cx - hw, y, hw * 2, 8); g.rect(C.st5, cx - hw, y, hw * 2, 1); g.rect(C.st2, cx - hw, y + 7, hw * 2, 1);
    g.rect(C.rd0, cx - 22, y + 1, 44, 6); g.rect(C.ro1, cx - 22, y + 1, 44, 1);
  }
  // Mesa del altar con frontal dorado y mantel.
  const top = H - 66;
  g.rect(C.st4, cx - 52, top, 104, 42); g.rect(C.st5, cx - 52, top, 104, 1);
  g.rect(C.sh1, cx - 54, top - 3, 108, 4); g.rect(C.sh0, cx - 54, top, 108, 1);
  for (let x = cx - 54; x < cx + 54; x += 4) g.rect(C.sh1, x, top + 1, 2, 4 + (x % 8 === 0 ? 2 : 0)); // encaje
  g.rect(C.wa1, cx - 44, top + 10, 88, 28); g.rect(C.ea3, cx - 42, top + 12, 84, 24);
  for (let k = 0; k < 4; k++) { const px = cx - 36 + k * 24; g.rect(C.wa2, px, top + 14, 1, 20); g.ellipse(C.wa1, px + 12, top + 24, 5, 7); g.ellipse(C.ea2, px + 12, top + 24, 3, 5); }
  g.rect(C.wa3, cx - 44, top + 10, 88, 1);
  // Sagrario dorado al centro.
  g.rect(C.wa1, cx - 10, top - 26, 20, 23); g.rect(C.wa3, cx - 10, top - 26, 20, 1); g.rect(C.ea2, cx - 6, top - 20, 12, 15); g.rect(C.wa2, cx - 1, top - 18, 2, 10);
  for (let y = 0; y < 8; y++) { const hw = 10 - y; g.rect(C.wa1, cx - hw, top - 34 + y, hw * 2, 1); }
  // Candeleros altos con velas encendidas (titilan).
  for (const dx of [-46, -30, 30, 46]) {
    const bx = cx + dx;
    g.rect(C.wa1, bx - 3, top - 4, 7, 2); g.rect(C.ea3, bx - 1, top - 20, 3, 16); g.rect(C.wa2, bx - 1, top - 20, 1, 16); g.rect(C.wa1, bx - 3, top - 22, 7, 2);
    vela(g, bx, top - 22, 10, (f * 2 + (dx > 0 ? 1 : 0) + (Math.abs(dx) > 40 ? 2 : 0)) % 4);
  }
  // Flores secas en jarrones y cera derramada.
  for (const dx of [-60, 56]) { g.rect(C.st3, cx + dx, top + 28, 8, 12); g.rect(C.st5, cx + dx, top + 28, 1, 12); for (let k = 0; k < 10; k++) g.set(k % 3 ? C.ea3 : C.pu1, cx + dx + 4 + (hash(k, 1, 111) - 0.5) * 12, top + 18 + hash(k, 2, 111) * 10); }
  for (let k = 0; k < 6; k++) g.rect(C.sh1, cx - 50 + k * 19, top + 1, 1, 3 + (k % 3));
  g.outline(c => (c === C.sh1 || c === C.sh0 || c === C.wa4 || c === C.wa3 ? C.st3 : outlineOf(c)));
}

/**
 * Cadenas del altar para la madre: dos cadenas que bajan del techo y terminan en grilletes a la
 * altura de las muñecas (pivote = pies de la madre: colócalas en la misma x/y que ella). 2 cuadros: balanceo.
 */
function cadenas(g: Lienzo, f: number, rotas = false): void {
  const W = 96, H = 160, sway = f ? 1 : 0;
  // Grilletes a la altura de las muñecas de un humanoide 64×80 (pies en y = H - 1): ~40 px sobre los pies.
  const wristY = H - 46;
  for (const [x0, xw] of [[18, 34], [W - 18, W - 34]] as const) {
    const end = rotas ? wristY - 40 - (x0 < 48 ? 6 : 0) : wristY;
    for (let y = 0; y < end; y += 4) {
      const t = y / wristY, x = Math.round(x0 + (xw - x0) * t * t + Math.sin(t * Math.PI) * sway * 2);
      // Eslabones alternados (de frente y de canto).
      if ((y / 4) % 2) { g.rect(C.st2, x - 1, y, 3, 4); g.set(C.st4, x - 1, y); g.set(C.ink, x, y + 1); g.set(C.ink, x, y + 2); }
      else { g.rect(C.st3, x, y, 1, 4); g.set(C.st5, x, y); }
    }
    if (rotas) {
      // Eslabón abierto y destello de la ruptura.
      const x = Math.round(x0 + (xw - x0) * ((end / wristY) ** 2));
      g.rect(C.st3, x - 2, end, 2, 3); g.rect(C.st3, x + 1, end + 1, 2, 3); g.set(C.wa3, x, end + 4);
    } else {
      g.rect(C.st1, xw - 4, wristY - 1, 9, 6); g.rect(C.st4, xw - 4, wristY - 1, 9, 1); g.rect(C.ink, xw - 2, wristY + 1, 5, 2);
      g.set(C.pu2, xw, wristY + 4); // sello morado de la Cofradía
    }
  }
  // Argolla del techo (arriba) y grillete del tobillo con su cadena al suelo.
  g.rect(C.st1, 14, 0, 8, 3); g.rect(C.st1, W - 22, 0, 8, 3);
  if (!rotas) {
    for (let x = 30; x < 66; x += 3) { g.rect(C.st2, x, H - 4 + ((x / 3) % 2), 2, 2); g.set(C.st4, x, H - 4); }
    g.rect(C.st1, 42, H - 8, 12, 4); g.rect(C.st4, 42, H - 8, 12, 1);
  } else for (let x = 20; x < 76; x += 3) { g.rect(C.st2, x, H - 3, 2, 2); g.set(C.st4, x, H - 3); }
}

/** Banca de madera de la nave (intacta o rota). */
function banca(g: Lienzo, rota: boolean): void {
  const W = 104, H = 40;
  // Respaldo y asiento en perspectiva lateral.
  for (let x = 4; x < W - 4; x++) {
    if (rota && x > 50 && x < 60) continue;
    const drop = rota && x >= 60 ? Math.round((x - 60) * 0.35) : 0;
    g.rect(C.ea2, x, 4 + drop, 1, 14); g.set(C.ea4, x, 4 + drop); g.set(C.ea1, x, 17 + drop);
    g.rect(C.ea3, x, 22 + Math.round(drop * 0.6), 1, 5); g.set(C.ea4, x, 22 + Math.round(drop * 0.6));
    if (x % 18 === 0) g.rect(C.ea1, x, 8 + drop, 1, 8);
  }
  for (const lx of [8, W - 12]) g.rect(C.ea1, lx, 18, 4, H - 20);
  g.rect(C.ea0, 6, H - 3, W - 12, 2);
  // Reclinatorio.
  g.rect(C.ea1, 10, H - 9, W - 20, 3); g.rect(C.rd0, 12, H - 9, W - 24, 1);
  if (rota) { g.line(C.ea3, 50, 18, 46, 30); g.line(C.ea3, 60, 22, 64, 34); for (let k = 0; k < 6; k++) g.rect(C.ea3, 40 + hash(k, 1, 121) * 30, H - 4, 3, 1); }
  else for (let k = 0; k < 3; k++) g.rect(C.ink, 22 + k * 30, 10, 6, 4); // cancioneros olvidados
  g.outline(outlineOf);
}

/** Grupo de veladoras en el suelo (titilan). */
function velas(g: Lienzo, f: number): void {
  const H = 28;
  g.ellipse(C.sh0, 16, H - 3, 14, 2); g.ellipse(C.sh1, 16, H - 4, 12, 1);
  [[6, 12], [11, 18], [16, 9], [21, 15], [26, 11]].forEach(([x, h], i) => vela(g, x, H - 3, h, (f + i) % 4));
}

/** Candelabro de pie (dorado) con tres velas. */
function candelabro(g: Lienzo, f: number): void {
  const cx = 12, H = 76;
  g.rect(C.ea2, cx - 7, H - 4, 15, 4); g.rect(C.wa1, cx - 7, H - 4, 15, 1);
  g.rect(C.ea3, cx - 1, 22, 3, H - 26); g.rect(C.wa2, cx - 1, 22, 1, H - 26);
  for (const y of [34, 50]) { g.ellipse(C.wa1, cx, y, 3, 2); }
  g.rect(C.ea3, cx - 9, 20, 19, 2); g.rect(C.wa2, cx - 9, 20, 19, 1);
  for (const dx of [-8, 0, 8]) { g.rect(C.wa1, cx + dx - 2, 18, 5, 2); vela(g, cx + dx, 18, dx === 0 ? 9 : 7, (f + (dx + 8) / 8) % 4); }
}

/** Columna exenta de la nave (para el primer plano y obstáculos). */
function columnaProp(g: Lienzo): void {
  const W = 48, H = 208, cx = W / 2;
  for (let y = 22; y < H - 14; y++) for (let lx = 0; lx < 34; lx++) {
    let c: string = lx < 3 ? C.st5 : lx > 27 ? C.st2 : lx % 6 === 0 ? C.st3 : C.st4;
    if (bayer(lx, y) < 0.05) c = C.st2;
    g.set(c, cx - 17 + lx, y);
  }
  for (let s = 0; s < 4; s++) { g.rect(s % 2 ? C.ea3 : C.wa1, cx - 21 - s, 2 + s * 5, 42 + s * 2, 5); g.rect(C.wa2, cx - 21 - s, 2 + s * 5, 42 + s * 2, 1); }
  for (let k = 0; k < 6; k++) { g.rect(C.ea2, cx - 17 + k * 7, 8, 3, 10); g.set(C.wa3, cx - 17 + k * 7, 8); }
  for (let s = 0; s < 3; s++) { g.rect(C.st3, cx - 20 - s * 2, H - 14 + s * 4, 40 + s * 4, 4); g.rect(C.st5, cx - 20 - s * 2, H - 14 + s * 4, 40 + s * 4, 1); }
  for (let y = 60; y < 150; y++) if (hash(y, 1, 131) > 0.8) g.set(C.st2, cx - 4 + Math.sin(y * 0.2) * 3, y); // grieta
  g.outline(outlineOf);
}

/** Púlpito de madera tallada con tornavoz. */
function pulpito(g: Lienzo): void {
  const W = 56, H = 96, cx = W / 2;
  g.rect(C.ea2, cx - 3, 56, 7, H - 60); g.rect(C.ea3, cx - 3, 56, 1, H - 60); g.rect(C.ea1, cx - 10, H - 4, 21, 4);
  for (let y = 30; y < 58; y++) { const hw = 16 - Math.max(0, y - 48); g.rect(C.ea2, cx - hw, y, hw * 2, 1); g.set(C.ea4, cx - hw, y); }
  g.rect(C.wa1, cx - 17, 30, 34, 2); g.rect(C.wa1, cx - 14, 40, 28, 1);
  for (let k = 0; k < 3; k++) { g.rect(C.ea1, cx - 12 + k * 9, 34, 6, 12); g.rect(C.wa1, cx - 12 + k * 9, 34, 6, 1); }
  g.rect(C.ea1, cx + 14, 6, 3, 26); // respaldo
  for (let y = 0; y < 6; y++) { const hw = 6 + y * 2; g.rect(y === 5 ? C.wa1 : C.ea2, cx + 15 - hw, y + 2, hw * 2, 1); } // tornavoz
  g.outline(outlineOf);
}

/**
 * Alto mando de la Cofradía: PLACEHOLDER SIMPLE (personaje importante, AGENTS.md §8.0; arte final del equipo).
 * Encapuchado negro con ribetes dorados y máscara de obsidiana, cuadro humanoide 64×80 con pies en y = 79.
 */
function altoMando(g: Lienzo): void {
  const cx = 32;
  for (let y = 14; y < 79; y++) {
    const hw = Math.round(8 + (y - 14) * 0.24);
    g.rect(C.ink, cx - hw, y, hw * 2, 1);
    g.set(C.wa1, cx - hw, y); g.set(C.wa1, cx + hw - 1, y); // ribetes dorados
  }
  for (let y = 2; y < 18; y++) { const hw = y < 6 ? 3 + y : 9; g.rect(C.ink, cx - hw, y, hw * 2, 1); } // capucha
  g.rect(C.pu1, cx - 4, 9, 8, 7); g.set(C.wa3, cx - 2, 11); g.set(C.wa3, cx + 1, 11); // máscara y ojos
  g.rect(C.wa1, cx - 1, 24, 2, 40); // banda dorada al frente
  g.rect(C.wa2, cx - 3, 30, 6, 4); // medallón del espejo negro
  g.set(C.ink, cx - 1, 31); g.set(C.ink, cx, 32);
  g.outline(outlineOf);
}

/** Vidrios de vitral rotos en el suelo. */
function vidrios(g: Lienzo): void {
  for (let k = 0; k < 26; k++) {
    const x = 4 + hash(k, 1, 141) * 56, y = 3 + hash(k, 2, 141) * 10, c = [C.ro2, C.tq2, C.wa2, C.pu2, C.ro1, C.tq1][k % 6];
    g.set(c, x, y); g.set(c, x + 1, y); if (hash(k, 3, 141) > 0.5) g.set(C.sh1, x, y - 1);
    if (hash(k, 4, 141) > 0.7) { g.set(C.ink, x + 2, y); g.set(c, x + 2, y + 1); }
  }
  for (let k = 0; k < 3; k++) g.line(C.ink, 10 + k * 18, 8, 18 + k * 18, 11 + k % 2);
}

/** Bloque de bóveda caído (con nervio claro y clave dorada). */
function bloqueBoveda(g: Lienzo): void {
  const W = 100, H = 52;
  for (let x = 2; x < W - 2; x++) {
    const top = Math.round(14 + noise1(x * 0.12, 151) * 14 + Math.abs(x - W / 2) * 0.12);
    for (let y = top; y < H - 2; y++) g.set(y < top + 2 ? C.st5 : bayer(x, y) < 0.12 ? C.st2 : y > H - 10 ? C.st2 : C.st3, x, y);
  }
  for (let x = 10; x < W - 10; x++) { const y = Math.round(36 - Math.sin((x - 10) / (W - 20) * Math.PI) * 18); g.rect(C.st5, x, y, 1, 3); g.set(C.st2, x, y + 3); }
  g.ellipse(C.wa1, W / 2, 18, 5, 4); g.ellipse(C.wa2, W / 2 - 1, 17, 2, 2);
  g.line(C.te1, 20, 30, 12, 22); g.line(C.te1, 78, 32, 88, 22);
  for (let k = 0; k < 10; k++) g.rect(C.st3, hash(k, 1, 152) * W, H - 4, 2 + hash(k, 2, 152) * 3, 2);
  g.outline(outlineOf);
}

/* =============================== FX (código) =============================== */

/** Pedazo de techo que cae (4 cuadros = 4 formas distintas, no animación). */
function escombro(g: Lienzo, f: number): void {
  const cx = 12, cy = 12, r = 6 + (f % 2) * 3;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const a = Math.atan2(y, x), rr = r * (0.65 + noise1(a * 2 + 3, f + 161) * 0.45);
    if (Math.hypot(x, y) > rr) continue;
    g.set(y < -rr * 0.5 ? C.st5 : x > rr * 0.4 ? C.st2 : bayer(x + 12, y + 12) < 0.15 ? C.st2 : C.st4, cx + x, cy + y);
  }
  if (f === 2) { g.rect(C.wa1, cx - 4, cy - 2, 8, 2); g.rect(C.wa2, cx - 4, cy - 2, 8, 1); } // trozo de friso dorado
  if (f === 3) { g.rect(C.ro1, cx - 3, cy, 4, 3); g.rect(C.tq1, cx + 1, cy - 2, 3, 3); } // vitral
  g.outline(outlineOf);
}

/** Estrella que cae despacio (cabeza brillante y estela). */
function estrellaCaida(g: Lienzo, f: number): void {
  const hx = 5, hy = 11;
  for (let k = 1; k < 9; k++) if (bayer(hx + k, hy - k) < 1 - k / 9) g.set(k < 3 ? C.tq3 : k < 6 ? C.mtn2 : C.mtn1, hx + k, hy - k);
  g.set(C.sh1, hx, hy); g.set(C.sh1, hx + 1, hy - 1);
  const big = f % 2 === 0;
  if (big) { g.set(C.mtn3, hx - 1, hy); g.set(C.mtn3, hx + 1, hy); g.set(C.mtn3, hx, hy + 1); g.set(C.mtn3, hx, hy - 1); }
  if (f === 1) { g.set(C.sh1, hx - 2, hy); g.set(C.sh1, hx + 2, hy); }
  if (f === 3) { g.set(C.tq3, hx, hy + 2); g.set(C.tq3, hx, hy - 2); }
}

/** Haz de luz diagonal (tramado; el código lo tiñe y lo suma con ADD). */
function rayoLuz(g: Lienzo): void {
  const W = 64, H = 240;
  for (let y = 0; y < H; y++) {
    const t = y / H, cx = 18 + t * 28, hw = 8 + t * 12;
    for (let x = Math.floor(cx - hw); x < cx + hw; x++) {
      const d = Math.abs(x - cx) / hw, k = (1 - d) * (1 - t * 0.7) * 0.8;
      if (x >= 0 && x < W && bayer(x, y) < k) g.set(d < 0.35 ? C.sh1 : C.mtn3, x, y);
    }
  }
}

/** Disco del sol (brillo de la tarde). */
function sol(g: Lienzo): void {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const r = Math.hypot(x - 31.5, y - 31.5);
    if (r < 19) g.set(r < 12 ? C.wa4 : r < 16 ? C.wa3 : C.wa2, x, y);
    else if (r < 30 && bayer(x, y) < (30 - r) / 11 * 0.6) g.set(r < 24 ? C.wa2 : C.wa1, x, y);
  }
}

/** Disco de la luna que eclipsa (negro con borde apenas visible). */
function lunaEclipse(g: Lienzo): void {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const r = Math.hypot(x - 31.5, y - 31.5);
    if (r < 20.5) g.set(r > 19.5 ? C.night : bayer(x, y) < 0.08 ? C.void : C.ink, x, y);
  }
}

/** Corona solar del Gran Eclipse (2 cuadros: los filamentos cambian). Centro transparente. */
function corona(g: Lienzo, f: number): void {
  const c = 95.5;
  for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
    const r = Math.hypot(x - c, y - c), a = Math.atan2(y - c, x - c);
    if (r < 20) continue;
    if (r < 23) { g.set(r < 21.5 ? C.sh1 : C.mtn3, x, y); continue; }
    const streak = Math.pow(Math.abs(Math.sin(a * 7 + f * 0.4 + Math.sin(a * 3) * 0.8)), 3) * 0.7 + noise1(a * 9 + f * 3, 171) * 0.3;
    const k = streak * Math.max(0, 1 - (r - 22) / 72) * 1.1;
    if (bayer(x, y) < k) g.set(r < 34 ? C.sh1 : r < 56 ? C.tq3 : C.mtn2, x, y);
  }
}

/* ============================== CATÁLOGO ============================== */

export const GDL_ART: GdlArtSpec[] = [
  // Avenida
  { key: 'prop_n10_letras_gdl', dir: PROPS, w: 304, h: 76, frames: 1, feetY: 75, draw: g => letras(g) },
  { key: 'prop_n10_tranvia', dir: PROPS, w: 184, h: 92, frames: 1, feetY: 91, draw: g => tranvia(g) },
  { key: 'prop_n10_auto_1', dir: PROPS, w: 92, h: 40, frames: 1, feetY: 39, draw: g => auto1(g) },
  { key: 'prop_n10_auto_2', dir: PROPS, w: 96, h: 48, frames: 1, feetY: 47, draw: g => auto2(g) },
  { key: 'prop_n10_jacaranda', dir: PROPS, w: 120, h: 150, frames: 1, feetY: 149, draw: g => jacarandaSeca(g, 60, 149, 150, 181, 0.35) },
  { key: 'prop_n10_farol', dir: PROPS, w: 24, h: 100, frames: 2, fps: 3, feetY: 99, draw: farol },
  { key: 'prop_n10_escombros', dir: PROPS, w: 72, h: 30, frames: 1, feetY: 29, draw: g => escombros(g) },
  { key: 'prop_n10_barricada', dir: PROPS, w: 104, h: 48, frames: 1, feetY: 47, draw: g => barricada(g) },
  { key: 'prop_n10_bandera', dir: PROPS, w: 28, h: 80, frames: 4, fps: 4, feetY: 79, draw: bandera },
  { key: 'prop_n10_autobus_volcado', dir: PROPS, w: 152, h: 64, frames: 1, feetY: 63, draw: g => autobusVolcado(g) },
  { key: 'prop_n10_cartel_desaparecidos', dir: PROPS, w: 56, h: 72, frames: 1, feetY: 71, draw: g => cartelDesaparecidos(g) },
  { key: 'prop_n10_puerta_catedral', dir: PROPS, w: 72, h: 108, frames: 2, fps: 1, feetY: 107, draw: puertaCatedral },
  { key: 'prop_n10_organo', dir: PROPS, w: 72, h: 112, frames: 1, feetY: 111, draw: g => organoProp(g) },
  { key: 'prop_n10_radio_vieja', dir: PROPS, w: 28, h: 22, frames: 2, fps: 2, feetY: 21, draw: radioVieja },
  // Catedral
  { key: 'prop_n10_altar_mayor', dir: PROPS, w: 168, h: 120, frames: 2, fps: 3, feetY: 119, draw: altarMayor },
  { key: 'prop_n10_cadenas', dir: PROPS, w: 96, h: 160, frames: 2, fps: 1, feetY: 159, draw: (g, f) => cadenas(g, f) },
  { key: 'prop_n10_cadenas_rotas', dir: PROPS, w: 96, h: 160, frames: 1, feetY: 159, draw: g => cadenas(g, 0, true) },
  { key: 'prop_n10_banca', dir: PROPS, w: 104, h: 40, frames: 1, feetY: 39, draw: g => banca(g, false) },
  { key: 'prop_n10_banca_rota', dir: PROPS, w: 104, h: 40, frames: 1, feetY: 39, draw: g => banca(g, true) },
  { key: 'prop_n10_velas', dir: PROPS, w: 32, h: 28, frames: 4, fps: 6, feetY: 27, draw: velas },
  { key: 'prop_n10_candelabro', dir: PROPS, w: 24, h: 76, frames: 4, fps: 6, feetY: 75, draw: candelabro },
  { key: 'prop_n10_columna', dir: PROPS, w: 48, h: 208, frames: 1, feetY: 207, draw: g => columnaProp(g) },
  { key: 'prop_n10_pulpito', dir: PROPS, w: 56, h: 96, frames: 1, feetY: 95, draw: g => pulpito(g) },
  { key: 'prop_n10_alto_mando', dir: PROPS, w: 64, h: 80, frames: 1, feetY: 79, draw: g => altoMando(g) },
  { key: 'prop_n10_vitral_roto', dir: PROPS, w: 64, h: 16, frames: 1, feetY: 15, draw: g => vidrios(g) },
  // Catedral con el eclipse
  { key: 'prop_n10_escombros_techo', dir: PROPS, w: 100, h: 52, frames: 1, feetY: 51, draw: g => bloqueBoveda(g) },
  // Efectos que coloca el código (GdlScenery); no van en el JSON del nivel.
  { key: 'prop_n10_escombro', dir: PROPS, w: 24, h: 24, frames: 4, fps: 1, feetY: 23, sheet: true, code: true, draw: escombro },
  { key: 'prop_n10_estrella_caida', dir: PROPS, w: 16, h: 16, frames: 4, fps: 8, feetY: 15, code: true, draw: estrellaCaida },
  { key: 'prop_n10_rayo_luz', dir: PROPS, w: 64, h: 240, frames: 1, feetY: 239, code: true, draw: g => rayoLuz(g) },
  { key: 'prop_n10_sol', dir: PROPS, w: 64, h: 64, frames: 1, feetY: 63, code: true, draw: g => sol(g) },
  { key: 'prop_n10_luna_eclipse', dir: PROPS, w: 64, h: 64, frames: 1, feetY: 63, code: true, draw: g => lunaEclipse(g) },
  { key: 'prop_n10_corona', dir: PROPS, w: 192, h: 192, frames: 2, fps: 2, feetY: 191, code: true, draw: corona },
];

/** Dibuja un cuadro de una entrada del catálogo. */
export function drawGdlArt(spec: GdlArtSpec, frame: number): Lienzo {
  const g = new Lienzo(spec.w, spec.h);
  spec.draw(g, frame);
  return g;
}
