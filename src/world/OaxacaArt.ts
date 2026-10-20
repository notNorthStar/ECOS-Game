/**
 * Props y NPCs comunes del Nivel 4 (Oaxaca). Cada entrada describe un PNG (o tira de cuadros) que
 * genera tools/gen-oaxaca-scenery.mjs y que el juego también dibuja como respaldo si falta.
 * NPCs comunes con diseño completo (AGENTS.md §8.0): 64×80, pivote (32, 78), ~70 px, mirando a la derecha.
 * Los textiles usan patrones geométricos propios (grecas escalonadas, rombos, estrellas), sin copiar
 * diseños de autor. María, las bestias y la Bruja NO están aquí (son placeholders de otro agente).
 */
import { BIG_OAX, C, Lienzo, adobe, bayer, frisoGreca, hash, outlineOf, patronOn, tejido, type Patron } from './OaxacaPixels';

export interface OaxacaArtSpec {
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

const PROPS = 'escenarios/nivel-04-oaxaca/props';
const NPCS = 'sprites/npcs';

/* =============================== AYUDAS =============================== */

function flame(g: Lienzo, x: number, y: number, frame: number, size = 1, fatuo = false): void {
  const h = [5, 6, 4, 6][frame % 4] * size, sway = [0, 1, 0, -1][frame % 4];
  const outer = fatuo ? C.tq1 : C.wa1, mid = fatuo ? C.tq2 : C.wa2, core = fatuo ? C.tq3 : C.wa4;
  for (let i = 0; i < h; i++) {
    const t = i / h, half = Math.round((1 - t) * 1.6 * size), sx = x + Math.round(sway * t);
    g.rect(outer, sx - half - (i < h * 0.4 ? 1 : 0), y - i, half * 2 + 1 + (i < h * 0.4 ? 2 : 0), 1);
    if (i < h - 1) g.rect(mid, sx - Math.max(0, half - 1), y - i, Math.max(1, half * 2 - 1), 1);
    if (i < h * 0.45) g.set(core, sx, y - i);
  }
}

/** Vela de cera con llama; altura h. */
function vela(g: Lienzo, x: number, base: number, h: number, f: number, color: string = C.sh1): void {
  g.rect(color, x, base - h, 3, h); g.rect(C.wa4, x, base - h, 1, h);
  if (h > 4) g.set(C.sh0, x + 2, base - h + 2);
  g.set(C.ea0, x + 1, base - h - 1);
  flame(g, x + 1, base - h - 2, f);
}

/** Olla de barro negro de Coyotepec: cuerpo globular, cuello corto y brillo bruñido. */
function olla(g: Lienzo, cx: number, base: number, r: number, broken = false): void {
  g.ellipse(C.st0, cx, base - r, r, r);
  g.rect(C.st0, cx - Math.ceil(r * 0.45), base - r * 2 - 3, Math.ceil(r * 0.9) + 1, 4);
  g.rect(C.st1, cx - Math.ceil(r * 0.55), base - r * 2 - 4, Math.ceil(r * 1.1) + 1, 1);
  g.ellipse(C.st1, cx - r * 0.35, base - r * 1.25, r * 0.35, r * 0.45);
  g.set(C.st4, cx - r * 0.45, base - r * 1.45); g.set(C.st3, cx - r * 0.3, base - r * 1.2);
  // Calado decorativo.
  for (let k = -2; k <= 2; k++) g.set(C.ink, cx + k * 2, base - r);
  if (broken) for (let k = 0; k < r; k++) g.erase(cx + k, base - r * 2 - 4, 1, Math.round(r * 0.9 - k * 0.6));
}

function canasta(g: Lienzo, cx: number, base: number, w: number, h: number, fill?: string): void {
  for (let y = 0; y < h; y++) {
    const half = Math.round(w / 2 - (h - y) * 0.15);
    for (let x = -half; x <= half; x++) g.set((x + y * 2 + 40) % 4 < 2 ? C.ea3 : C.ea2, cx + x, base - h + y);
  }
  g.rect(C.ea4, cx - w / 2, base - h, w + 1, 1);
  if (fill) { g.ellipse(fill, cx, base - h - 1, w / 2 - 2, 2); g.set(C.wa4, cx - 2, base - h - 2); }
}

/* ================================ PROPS ================================ */

const noiseWear = (x: number, y: number): boolean => hash(x >> 2, y >> 2, 99) > 0.6;

function letras(g: Lienzo): void {
  const word = 'OAXACA';
  const ramps: Array<[string, string, string, string]> = [
    [C.ro0, C.ro1, C.ro2, C.ro3], [C.tq0, C.tq1, C.tq2, C.tq3], [C.wa0, C.wa1, C.wa2, C.wa3],
    [C.fo1, C.fo3, C.fo4, C.fo5], [C.pu0, C.pu1, C.pu2, C.pu3], [C.te0, C.te2, C.te3, C.wa2],
  ];
  // Base de cantera verde con greca y juntas.
  g.rect(C.mtn0, 2, 58, 172, 14); g.rect(C.fog0, 3, 59, 170, 12); g.rect(C.fog2, 3, 59, 170, 1);
  frisoGreca(g, 6, 62, 164, C.fog1);
  for (let x = 4; x < 172; x++) if (hash(x, 5) > 0.72) g.set(C.fo2, x, 70 - Math.floor(hash(x, 6) * 2));
  for (let n = 0; n < word.length; n++) {
    const glyph = BIG_OAX[word[n]], [o, d, md, l] = ramps[n], ox = 9 + n * 27, oy = 15 + (n % 2);
    const on = (x: number, y: number) => y >= 0 && y < 7 && x >= 0 && x < 5 && glyph[y][x] === '1';
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) {
      g.rect(C.ink, ox + x * 4 + 3, oy + y * 6 + 3, 4, 6); g.rect(d, ox + x * 4 + 2, oy + y * 6 + 2, 4, 6);
    }
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) {
      for (let py = 0; py < 6; py++) for (let px = 0; px < 4; px++) {
        const tx = ox + x * 4 + px, ty = oy + y * 6 + py;
        let c = bayer(tx, ty) < 0.7 - (y * 6 + py) / 42 * 0.6 ? l : md;
        if ((!on(x - 1, y) && px === 0) || (!on(x, y - 1) && py === 0)) c = l;
        // Pintura desgastada: se ve el metal gris debajo y manchas de humo.
        const wear = hash(tx, ty, n + 30);
        if (wear > 0.95 || (wear > 0.9 && noiseWear(tx, ty))) c = C.st3; else if (wear < 0.025) c = C.st1;
        g.set(c, tx, ty);
      }
    }
    for (let y = oy - 1; y < oy + 44; y++) for (let x = ox - 1; x < ox + 22; x++) {
      if (g.get(x, y) === undefined && (g.get(x + 1, y) === l || g.get(x, y + 1) === l || g.get(x + 1, y) === md || g.get(x, y + 1) === md)) g.set(o, x, y);
    }
    // Escurrimientos de óxido.
    const rx = ox + 2 + Math.floor(hash(n, 1) * 15);
    for (let y = oy + 22; y < oy + 30 + n % 3 * 4; y++) if (g.has(rx, y)) g.set(C.ea2, rx, y);
  }
  // La C perdió un pedazo; la segunda A quedó rajada.
  for (let k = 0; k < 10; k++) g.erase(9 + 4 * 27 + 12 + k, 15, 1, 12 - k);
  for (let s = 0, x = 9 + 3 * 27 + 10, y = 16; s < 26; s++) { x += s % 3 === 0 ? 1 : 0; y += 1; if (g.has(x, y)) g.set(C.ink, x, y); }
  // Papel picado roto sobre las letras y veladoras con cempasúchil al pie.
  for (let x = 4; x < 172; x++) g.set(C.ink, x, 5 + Math.round(Math.sin(x * 0.05) * 2));
  for (let x = 8; x < 168; x += 10) {
    const y = 6 + Math.round(Math.sin(x * 0.05) * 2);
    if (hash(x, 3) < 0.35) continue;
    const c = [C.ro2, C.tq2, C.wa2, C.pu2, C.fo4][Math.floor(x / 10) % 5];
    g.rect(c, x, y + 1, 7, 6 - Math.floor(hash(x, 4) * 3)); g.set(C.ink, x + 2, y + 3); g.set(C.ink, x + 4, y + 3);
  }
  for (const vx of [16, 60, 98, 150]) { g.rect(C.sh1, vx, 54, 3, 5); g.rect(C.wa4, vx, 54, 1, 5); g.set(C.wa3, vx + 1, 52); g.set(C.wa2, vx + 1, 53); }
  for (const fx of [28, 120, 166]) for (let k = 0; k < 5; k++) g.rect(k % 2 ? C.wa1 : C.wa2, fx + k * 2 - 4, 55 - (k % 2), 2, 2);
}

function telar(g: Lienzo): void {
  // Telar de pedal: marco de madera, plegadores, peine, urdimbre y tela con greca a medio tejer.
  for (const x of [4, 72]) { g.rect(C.ea1, x, 6, 5, 64); g.rect(C.ea3, x, 6, 1, 64); }
  g.rect(C.ea1, 2, 4, 78, 4); g.rect(C.ea3, 2, 4, 78, 1);
  g.rect(C.ea2, 8, 14, 64, 3); g.rect(C.ea3, 8, 14, 64, 1); // plegador de urdimbre
  g.rect(C.ea2, 8, 52, 64, 4); g.rect(C.ea3, 8, 52, 64, 1); // plegador de tela
  for (let x = 12; x < 68; x += 2) g.rect(C.sh0, x, 17, 1, 18);
  // Peine (batán) colgado.
  g.rect(C.ea0, 9, 33, 62, 3); g.rect(C.ea3, 9, 33, 62, 1); g.line(C.ea1, 12, 8, 12, 33); g.line(C.ea1, 68, 8, 68, 33);
  // Tela tejida con fondo rojo, greca negra y franjas.
  tejido(g, 12, 36, 56, 16, 'greca', C.rd0, C.ink, C.wa2, 0, 2);
  // Lanzadera con hilo y madejas de lana.
  g.rect(C.ea3, 30, 35, 14, 2); g.rect(C.wa1, 34, 35, 5, 1);
  // Pedales y bancos.
  for (let k = 0; k < 3; k++) g.line(C.ea0, 20 + k * 8, 70, 40 + k * 6, 62, 2);
  g.rect(C.ea1, 0, 66, 80, 3); g.rect(C.ea3, 0, 66, 80, 1);
  for (const [x, c] of [[50, C.ro1], [58, C.tq1], [66, C.wa2]] as const) { g.ellipse(c, x, 63, 3, 2); g.set(C.sh1, x - 1, 62); }
  g.outline(outlineOf);
}

/** Textil colgado de una vara con flecos. */
function textil(g: Lienzo, kind: Patron, fondo: string, hilo: string, franja: string, f: number): void {
  const sway = [0, 1, 0, -1][f % 4];
  g.rect(C.ea1, 0, 2, 28, 2); g.rect(C.ea3, 0, 2, 28, 1);
  g.line(C.ea2, 3, 2, 14, 0); g.line(C.ea2, 24, 2, 14, 0);
  for (let y = 0; y < 42; y++) {
    const off = Math.round(sway * (y / 42));
    for (let x = 0; x < 22; x++) {
      const band = y % 14;
      let c = fondo;
      if (band < 2) c = franja;
      else if (band >= 3 && band < 11 && patronOn(kind, x, band - 3)) c = hilo;
      if (x === 0 || x === 21) c = franja;
      g.set(c, 3 + x + off, 4 + y);
    }
  }
  for (let x = 3; x < 25; x += 2) g.rect(hilo, x + sway, 46, 1, 3 + ((x / 2) % 2));
  g.outline(outlineOf);
}

function puesto(g: Lienzo, roto: boolean): void {
  // Puesto de mercado: lona rayada sobre cuatro palos, mesa con barro negro, canastas y textiles.
  const lonaY = roto ? 10 : 4;
  g.rect(C.ea0, 4, lonaY, 3, 68 - lonaY); g.rect(C.ea2, 4, lonaY, 1, 68 - lonaY);
  if (!roto) { g.rect(C.ea0, 89, lonaY, 3, 68 - lonaY); g.rect(C.ea2, 89, lonaY, 1, 68 - lonaY); }
  else { g.line(C.ea0, 89, 70, 70, 30, 3); }
  for (let y = 0; y < 14; y++) for (let x = 0; x < 96; x++) {
    const sag = roto ? Math.round(Math.max(0, x - 40) * 0.45 * (y / 14 + 0.6)) : Math.round(Math.sin(x / 95 * Math.PI) * 2);
    if (roto && x > 50 && hash(x, y, 4) < (x - 50) / 80) continue;
    g.set(Math.floor(x / 8) % 2 ? C.ro1 : C.sh1, x, lonaY + y + sag);
  }
  for (let x = 0; x < (roto ? 50 : 96); x += 8) { g.rect(C.ro1, x, lonaY + 14, 4, 3); g.set(C.ro0, x + 1, lonaY + 16); }
  // Mesa.
  g.rect(C.ea1, 6, 48, 84, 5); g.rect(C.ea3, 6, 48, 84, 1); g.rect(C.ea0, 10, 53, 3, 17); g.rect(C.ea0, 82, 53, 3, 17);
  if (roto) g.line(C.ea1, 50, 50, 90, 66, 4);
  // Mercancía.
  olla(g, 20, 48, 6); olla(g, 34, 48, 5, roto); canasta(g, 52, 48, 16, 7, C.wa1);
  if (!roto) { olla(g, 72, 48, 6); canasta(g, 84, 48, 10, 6, C.ro1); }
  for (let t = 0; t < 3; t++) g.rect([C.rd0, C.tq1, C.wa2][t], 14 + t * 2, 62 - t * 2, 20, 2);
  // Textiles colgados del travesaño.
  for (const [x, kind, a, b] of [[14, 'rombo', C.ink, C.ro2], [62, 'greca', C.rd0, C.wa3]] as const) {
    tejido(g, x, lonaY + 17, 14, 22, kind, a, b, C.wa1, roto ? 0.35 : 0, x);
  }
  g.outline(outlineOf);
}

function ollas(g: Lienzo): void {
  olla(g, 9, 23, 6); olla(g, 30, 23, 7, true); olla(g, 20, 23, 5);
  // Tepalcate a un lado.
  g.rect(C.st0, 34, 21, 4, 2); g.set(C.st3, 34, 21);
  g.outline(() => C.ink);
}

function canastas(g: Lienzo): void {
  canasta(g, 10, 21, 16, 10, C.wa1); canasta(g, 28, 21, 20, 8); canasta(g, 20, 13, 12, 6, C.ro1);
  g.line(C.ea2, 22, 13, 25, 6); g.line(C.ea2, 25, 6, 30, 12);
  g.outline(outlineOf);
}

/** Muro con tapiz enorme que oculta el pasaje; abierto, el tapiz se recoge y brilla la memoria. */
function muroPasaje(g: Lienzo, abierto: boolean, f: number): void {
  const W = 112, base = 103;
  // Muro de cantera y adobe.
  for (let y = 4; y <= base; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor(y / 8), off = row % 2 ? 7 : 0;
    const joint = y % 8 === 0 || (x + off) % 14 === 0;
    g.set(joint ? C.mtn0 : hash(Math.floor((x + off) / 14), row, 3) > 0.7 ? C.fog1 : C.fog0, x, y);
  }
  g.rect(C.fog2, 0, 4, W, 1); adobe(g, 6, 70, 18, 20, 4); adobe(g, 90, 20, 14, 16, 5);
  for (let x = 0; x < W; x++) if (hash(x, 1, 9) > 0.8) g.set(C.fo2, x, base - hash(x, 2, 9) * 6);
  // Vano en arco (siempre detrás del tapiz).
  const ax = 30, aw = 52, top = 24;
  for (let y = top; y <= base; y++) {
    const half = y - top < aw / 2 ? Math.round(Math.sqrt((aw / 2) ** 2 - (aw / 2 - (y - top)) ** 2)) : aw / 2;
    g.rect(C.fog2, ax + aw / 2 - half - 2, y, half * 2 + 4, 1);
    g.rect(abierto ? C.ink : C.mtn0, ax + aw / 2 - half, y, half * 2, 1);
  }
  if (abierto) {
    // Escalones que bajan al corazón de la ciudad y luz turquesa de la memoria.
    for (let s = 0; s < 6; s++) { g.rect(C.st1, ax + 6 + s * 2, base - 6 - s * 6, aw - 12 - s * 4, 3); g.rect(C.st2, ax + 6 + s * 2, base - 6 - s * 6, aw - 12 - s * 4, 1); }
    for (let y = top + 6; y < base - 30; y++) for (let x = ax + 10; x < ax + aw - 10; x++) {
      const d = Math.hypot(x - (ax + aw / 2), (y - (top + 34)) * 1.4);
      if (d < 18) g.veil(d < 8 ? C.tq2 : C.tq1, x, y, (1 - d / 18) * (0.7 + (f % 2) * 0.15));
    }
    // Tapiz recogido y amarrado a la izquierda, con la greca encendida.
    for (let y = 8; y < base - 4; y++) {
      const half = 5 + Math.round(Math.sin(y * 0.3) * 1.5);
      for (let x = -half; x <= half; x++) g.set(patronOn('greca', x + 8, y) ? (y % 12 < 6 ? C.tq2 : C.wa2) : C.rd0, 16 + x, y);
    }
    g.rect(C.ea3, 9, 50, 15, 3); g.rect(C.ea4, 9, 50, 15, 1);
    for (let k = 0; k < 5; k++) g.set(f % 2 ? C.tq3 : C.tq2, 8 + hash(k, f, 3) * 100, 10 + hash(k, f + 1, 3) * 80);
  } else {
    // Tapiz grande con grecas, rombos y una estrella central: "los tejidos guardan la memoria".
    g.rect(C.ea1, 18, 10, 76, 3); g.rect(C.ea3, 18, 10, 76, 1);
    for (let y = 13; y < base - 2; y++) for (let x = 22; x < 90; x++) {
      const u = x - 22, v = y - 13;
      let c: string = C.rd0;
      if (v % 22 < 2) c = C.ink;
      else if (v % 22 >= 3 && v % 22 < 11) c = patronOn('greca', u, v % 22 - 3) ? C.wa2 : C.rd0;
      else if (v % 22 >= 12 && v % 22 < 20) c = patronOn('rombo', u, v % 22 - 12) ? C.ink : C.te1;
      const d = Math.hypot(u - 34, (v - 44) * 1.1);
      if (d < 14) c = patronOn('estrella', Math.floor((u - 20) / 2) + 7, Math.floor((v - 30) / 2) + 7) ? (f % 2 ? C.tq2 : C.tq1) : C.ink;
      if (x === 22 || x === 89) c = C.ink;
      g.set(c, x, y);
    }
    for (let x = 22; x < 90; x += 2) g.rect(C.wa2, x, base - 2, 1, 2);
    // Rasgadura del tiempo.
    g.line(C.mtn0, 70, 60, 76, 80); g.line(C.mtn0, 76, 80, 72, 92);
  }
  g.outline(outlineOf);
}

function agave(g: Lienzo, w: number, h: number): void {
  const cx = w / 2, base = h - 1;
  g.ellipse(C.ea0, cx, base, w / 2 - 4, 2);
  for (let l = 0; l < 13; l++) {
    const a = -Math.PI / 2 + (l - 6) * 0.24, len = (h - 4) * (1 - Math.abs(l - 6) * 0.06);
    const tx = cx + Math.cos(a) * len * (w / h) * 0.75, ty = base + Math.sin(a) * len;
    const back = l % 2 === 0;
    g.line(back ? C.fo2 : C.fo3, cx + (l - 6) * 0.8, base - 1, tx, ty, back ? 2 : 3);
    g.line(back ? C.fo3 : C.fo4, cx + (l - 6) * 0.8 - 1, base - 3, tx - 0.5, ty + 1);
    g.set(C.ea1, tx, ty); // espina terminal
  }
  // Pencas con espinas laterales y un poco de polvo cenizo.
  for (let k = 0; k < w; k++) if (hash(k, 3, w) > 0.82) g.set(C.mtn2, cx - w / 3 + hash(k, 4, w) * w * 0.66, base - hash(k, 5, w) * h * 0.6);
  g.outline(outlineOf);
}

function andamioProp(g: Lienzo): void {
  for (const x of [4, 30, 56]) { g.rect(C.ea1, x, 2, 4, 94); g.rect(C.ea3, x, 2, 1, 94); }
  for (const y of [8, 36, 64]) {
    g.rect(C.ea2, 0, y, 64, 4); g.rect(C.ea4, 0, y, 64, 1); g.rect(C.ea0, 0, y + 4, 64, 1);
    g.line(C.ea1, 6, y + 5, 30, y + 27, 2); g.line(C.ea1, 58, y + 5, 34, y + 27, 2);
  }
  // Cuerdas, cubeta y una veladora olvidada en la plataforma.
  g.line(C.ea4, 44, 12, 44, 30); g.rect(C.st2, 41, 30, 7, 6); g.rect(C.st4, 41, 30, 7, 1);
  g.rect(C.st0, 12, 60, 10, 4); g.rect(C.st2, 12, 60, 10, 1);
  g.outline(outlineOf);
  vela(g, 18, 36, 5, 0);
}

function velas(g: Lienzo, f: number): void {
  // Grupo de veladoras de cera escurrida, como las que deja la gente en el templo.
  g.ellipse(C.sh0, 16, 18, 14, 2); g.ellipse(C.sh1, 15, 17, 11, 1);
  const set: Array<[number, number, string]> = [[3, 7, C.sh1], [8, 11, C.wa4], [13, 6, C.sh1], [18, 13, C.wa4], [23, 8, C.sh1], [27, 5, C.rd1]];
  for (const [x, h, c] of set) { g.rect(c, x, 18 - h, 3, h); g.rect(C.sh0, x + 2, 18 - h, 1, h); g.set(C.ea0, x + 1, 17 - h); }
  g.outline(() => C.st2);
  set.forEach(([x, h], k) => flame(g, x + 1, 16 - h, f + k));
}

function velaSola(g: Lienzo, f: number): void {
  g.rect(C.sh1, 2, 8, 4, 7); g.rect(C.wa4, 2, 8, 1, 7); g.rect(C.sh0, 1, 14, 6, 1);
  g.outline(() => C.st2);
  flame(g, 4, 6, f);
}

function retablo(g: Lienzo): void {
  // Retablo dorado barroco (fragmento), con columnas salomónicas, nichos vacíos y oro descascarado.
  const W = 96, base = 127;
  for (let y = 22; y < base; y++) for (let x = 4; x < W - 4; x++) {
    const n = hash(x >> 1, y >> 1, 7);
    g.set(n > 0.85 ? C.wa1 : n > 0.45 ? C.wa0 : C.ea1, x, y);
  }
  for (let k = 4; k < W - 4; k++) { const yy = 22 - Math.round(Math.sin((k - 4) / (W - 9) * Math.PI) * 20); g.rect(C.wa0, k, yy, 1, 22 - yy); g.set(C.wa2, k, yy); if (k % 8 === 0) g.line(C.wa1, W / 2, 22, k, yy); }
  for (const yy of [22, 62, 100, 124]) { g.rect(C.wa1, 2, yy, W - 4, 3); g.rect(C.wa3, 2, yy, W - 4, 1); g.rect(C.ea0, 2, yy + 3, W - 4, 1); }
  for (const cx of [12, 30, 66, 84]) for (let y = 25; y < 122; y++) {
    if (y > 60 && y < 66) continue;
    const t = Math.round(Math.sin(y * 0.45 + cx) * 2);
    g.rect(C.wa1, cx + t - 2, y, 4, 1); g.set(C.wa3, cx + t - 2, y); g.set(C.ea0, cx + t + 2, y);
  }
  for (const [nx, ny] of [[48, 30], [21, 70], [75, 70], [48, 70]] as const) {
    g.rect(C.ink, nx - 6, ny, 12, 26); g.ellipse(C.ink, nx, ny, 6, 5); g.rect(C.ea0, nx - 4, ny + 22, 8, 3);
  }
  // Ángel pequeño que quedó en el nicho alto (silueta dorada).
  g.ellipse(C.wa1, 48, 36, 2, 2); g.rect(C.wa0, 47, 39, 3, 8); g.line(C.wa1, 45, 40, 41, 37); g.line(C.wa1, 51, 40, 55, 37);
  // Piezas caídas, grietas y oro desprendido.
  for (let k = 0; k < 14; k++) g.erase(70 + k, 100 + Math.round(Math.sin(k * 0.6) * 4), 1, 10 + Math.round(k * 0.3));
  for (let s = 0, x = 30, y = 70; s < 30; s++) { x += hash(s, 1) > 0.5 ? 1 : 0; y += 1; g.set(C.ink, x, y); }
  g.outline(outlineOf);
}

function campana(g: Lienzo): void {
  // Campana de bronce caída de lado, con el badajo afuera y una grieta.
  for (let x = 0; x < 30; x++) {
    const r = 6 + Math.round((x / 29) ** 1.6 * 9);
    for (let y = -r; y <= r; y++) g.set(y < -r * 0.4 ? C.tq1 : y < r * 0.3 ? C.tq0 : C.st1, 4 + x, 18 + y);
  }
  g.rect(C.tq2, 6, 13, 18, 1); g.rect(C.wa0, 30, 4, 3, 28); g.rect(C.wa1, 30, 4, 1, 28);
  g.ellipse(C.ink, 34, 18, 2, 14);
  g.line(C.st2, 34, 18, 38, 24, 2); g.ellipse(C.st2, 38, 26, 2, 2);
  g.rect(C.ea1, 0, 14, 5, 8); g.rect(C.ea3, 0, 14, 5, 1);
  for (let s = 0, x = 14, y = 8; s < 14; s++) { x += 1; y += hash(s, 3) > 0.5 ? 1 : 0; g.set(C.ink, x, y); }
  for (let k = 0; k < 12; k++) g.set(C.tq2, 6 + hash(k, 1, 4) * 24, 14 + hash(k, 2, 4) * 12); // pátina
  g.outline(outlineOf);
}

function fragmento(g: Lienzo, f: number): void {
  // 2.º fragmento del Sello: cuña de jade con incrustación dorada y un glifo de greca que brilla.
  const glow = [0.35, 0.55, 0.75, 0.55][f % 4];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const d = Math.hypot(x - 10, y - 10);
    if (d > 6 && d < 10) g.veil(d < 8 ? C.tq2 : C.tq1, x, y, glow * (1 - (d - 6) / 4));
  }
  const pts = [[5, 15], [15, 15], [15, 5]];
  for (let y = 5; y <= 15; y++) for (let x = 5; x <= 15; x++) {
    if (x + (15 - y) < 10) continue;
    const r = Math.hypot(x - 5, y - 15);
    g.set(r > 9 ? C.fo3 : (x + y) % 5 === 0 ? C.fo2 : C.fo4, x, y);
  }
  for (let k = 0; k < 9; k++) g.set(C.wa2, 15 - Math.round(Math.cos(k * 0.18) * 9), 15 - Math.round(Math.sin(k * 0.18) * 9));
  g.set(C.tq3, 12, 12); g.set(C.tq3, 13, 11); g.set(C.tq2, 12, 10); g.set(C.tq2, 14, 13);
  void pts;
  g.set(C.wa4, 7 + (f % 4) * 2, 14 - (f % 4) * 2);
  g.outline(c => (c === C.tq1 || c === C.tq2 ? C.tq0 : C.fo1));
}

function juguetes(g: Lienzo): void {
  // Juguetes de madera abandonados: trompo, carrito y una muñeca de trapo con trenzas.
  g.ellipse(C.ro1, 6, 14, 4, 3); g.rect(C.ro2, 3, 12, 6, 1); g.line(C.st2, 6, 17, 6, 19); g.rect(C.wa2, 2, 14, 8, 1);
  g.line(C.sh0, 9, 12, 15, 10);
  g.rect(C.tq1, 13, 12, 12, 4); g.rect(C.tq2, 13, 12, 12, 1); g.rect(C.tq1, 16, 9, 6, 3); g.rect(C.sh0, 17, 10, 3, 1);
  g.ellipse(C.ink, 15, 17, 2, 2); g.ellipse(C.ink, 23, 17, 2, 2); g.set(C.st3, 15, 17); g.set(C.st3, 23, 17);
  // Muñeca de trapo tumbada.
  g.rect(C.ro1, 27, 13, 9, 5); g.rect(C.wa2, 27, 15, 9, 1); g.ellipse(C.sk1, 38, 14, 3, 3); g.set(C.ink, 39, 13);
  g.rect(C.st0, 36, 11, 4, 2); g.line(C.st0, 38, 16, 37, 19); g.set(C.rd1, 37, 19);
  g.rect(C.sh1, 24, 17, 4, 2); g.rect(C.sh1, 24, 13, 3, 2);
  g.outline(outlineOf);
}

function ropaNinos(g: Lienzo): void {
  // Huipil pequeño bordado, un sombrerito de palma y un huarache de niño, tirados en el suelo.
  g.rect(C.sh1, 2, 8, 16, 14); g.rect(C.sh0, 2, 8, 2, 14); g.rect(C.sh1, 0, 8, 20, 4);
  for (let x = 3; x < 17; x++) if (patronOn('zigzag', x, 0) || x % 3 === 0) g.set([C.ro1, C.wa1, C.tq1][x % 3], x, 11);
  for (let x = 4; x < 16; x += 2) g.set(C.rd0, x, 20);
  g.rect(C.st2, 8, 8, 4, 2);
  g.ellipse(C.ea3, 29, 20, 9, 3); g.rect(C.ea4, 25, 13, 8, 6); g.rect(C.ea3, 25, 17, 8, 2); g.rect(C.rd0, 25, 16, 8, 1);
  g.rect(C.ea2, 33, 24, 7, 3); g.rect(C.ea1, 33, 23, 7, 1); g.set(C.ea0, 36, 23);
  g.outline(c => (c === C.sh1 || c === C.sh0 ? C.st2 : outlineOf(c)));
}

function farolPoste(g: Lienzo, f: number): void {
  g.rect(C.ink, 6, 18, 4, 52); g.rect(C.st2, 6, 18, 1, 52); g.rect(C.ink, 3, 66, 10, 6); g.rect(C.st1, 3, 66, 10, 1);
  for (let y = 30; y < 62; y += 9) g.rect(C.st1, 5, y, 6, 1);
  g.rect(C.ink, 2, 4, 12, 13); g.rect(C.ink, 1, 2, 14, 2); g.rect(C.ink, 6, 0, 4, 2);
  g.outline(() => C.st1);
  g.rect(f % 4 === 2 ? C.wa1 : C.wa2, 3, 5, 10, 11); g.rect(C.wa3, 5, 6, 6, 8); g.rect(C.wa4, 7, 8 + (f % 2), 2, 4);
  g.rect(C.ink, 7, 5, 1, 11); g.rect(C.ink, 3, 10, 10, 1);
}

function papelPicado(g: Lienzo, f: number): void {
  // Tira de papel picado en un cable: banderitas con calado que se mecen por cuadro; algunas rotas.
  const W = 128, cols = [C.ro2, C.tq2, C.wa2, C.pu2, C.fo4, C.ro3];
  for (let x = 0; x < W; x++) g.set(C.ink, x, 1 + Math.round(Math.sin(x / (W - 1) * Math.PI) * 6));
  for (let k = 0; k < 8; k++) {
    if (k === 5) continue; // una se cayó
    const x0 = 4 + k * 15, y0 = 2 + Math.round(Math.sin((x0 + 6) / (W - 1) * Math.PI) * 6), c = cols[k % cols.length];
    const sw = [0, 1, 0, -1][(f + k) % 4], torn = k === 2 || k === 6;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) {
      const px = x + Math.round(sw * y / 16), yy = y0 + y;
      if (torn && y > 8 && x > 5 - (y - 8)) continue;
      // Calado: flor y rombos recortados, orilla en picos.
      if ((y === 5 || y === 6) && (x === 3 || x === 8)) continue;
      if (y > 7 && y < 11 && Math.abs(x - 5.5) + Math.abs(y - 9) < 2) continue;
      if (y === 15 && x % 3 === 1) continue;
      g.set(y === 0 ? C.ink : c, x0 + px, yy);
    }
  }
}

function escombros(g: Lienzo): void {
  for (let k = 0; k < 40; k++) {
    const x = 4 + hash(k, 1, 6) * 48, y = 18 - (hash(k, 2, 6) ** 1.5) * 12 * Math.sin((x - 2) / 52 * Math.PI) - 1;
    const r = hash(k, 3, 6);
    if (r < 0.4) { g.rect(C.st2, x, y, 4, 3); g.rect(C.st4, x, y, 3, 1); }
    else if (r < 0.7) { g.rect(C.te1, x, y, 5, 2); g.rect(C.te3, x, y, 4, 1); }
    else if (r < 0.85) { g.rect(C.ro1, x, y, 4, 3); g.set(C.ro2, x, y); }
    else adobe(g, x, y, 6, 4, k);
  }
  g.line(C.ea1, 6, 8, 40, 16, 3); g.line(C.ea3, 6, 7, 40, 15);
  g.outline(outlineOf);
}

function barricada(g: Lienzo): void {
  // Fortificación de la Cofradía: sacos, tablas, puertas viejas y estacas.
  for (let r = 0; r < 3; r++) for (let k = 0; k < 7 - r; k++) {
    const x = 8 + k * 10 + r * 5, y = 32 - r * 7;
    g.ellipse(C.ea2, x, y, 6, 3); g.rect(C.ea3, x - 4, y - 2, 7, 1); g.set(C.ea1, x + 4, y + 1);
  }
  g.rect(C.ea1, 52, 6, 22, 24); g.rect(C.ea2, 53, 7, 20, 22); for (let y = 10; y < 28; y += 5) g.rect(C.ea1, 53, y, 20, 1);
  g.rect(C.te1, 55, 12, 6, 6); // pintura vieja de una puerta
  for (let k = 0; k < 4; k++) g.line(C.ea0, 2 + k * 6, 35, 12 + k * 6, 4 + k * 3, 2);
  g.line(C.rd0, 50, 16, 76, 14); // trapo rojo de la Cofradía
  g.outline(outlineOf);
}

function cartel(g: Lienzo): void {
  // Tablero de avisos de madera con carteles de desaparecidos y un aviso de la Cofradía rasgado.
  g.rect(C.ea1, 6, 30, 3, 26); g.rect(C.ea1, 39, 30, 3, 26); g.rect(C.ea3, 6, 30, 1, 26);
  g.rect(C.ea0, 2, 2, 44, 32); g.rect(C.ea2, 3, 3, 42, 30); g.rect(C.ea3, 3, 3, 42, 1);
  for (const [x, y, c] of [[6, 6, C.wa4], [17, 8, C.sh1], [29, 5, C.wa4], [8, 19, C.sh1], [31, 18, C.te2]] as const) {
    g.rect(c, x, y, 10, 12); g.rect(C.st3, x + 2, y + 2, 6, 4); g.rect(C.st2, x + 2, y + 8, 6, 1); g.set(C.rd1, x + 5, y);
  }
  g.rect(C.rd0, 20, 20, 9, 10); g.ellipse(C.st0, 24, 25, 3, 3); g.line(C.ea2, 20, 30, 28, 22);
  g.rect(C.ea1, 0, 0, 48, 3); g.rect(C.ea3, 0, 0, 48, 1);
  g.outline(outlineOf);
}

function columnaRota(g: Lienzo): void {
  // Fuste de cantera verde partido, con capitel caído a un lado.
  for (let y = 10; y < 46; y++) {
    g.rect(C.fog0, 6, y, 12, 1); g.rect(C.fog1, 6, y, 3, 1); g.rect(C.teal0, 15, y, 3, 1);
    if (y % 6 === 0) g.rect(C.teal0, 6, y, 12, 1);
  }
  for (let k = 0; k < 12; k++) g.erase(6 + k, 0, 1, 10 + Math.round(Math.abs(Math.sin(k * 1.3)) * 5 + k * 0.3));
  g.rect(C.fog0, 3, 44, 18, 4); g.rect(C.fog2, 3, 44, 18, 1);
  g.rect(C.fog0, 22, 38, 14, 8); g.rect(C.fog1, 22, 38, 14, 2); g.rect(C.teal0, 24, 44, 10, 2);
  for (let k = 0; k < 8; k++) g.set(C.fo2, 4 + hash(k, 1, 5) * 30, 46 - hash(k, 2, 5) * 4);
  g.outline(outlineOf);
}

function estandarteN04(g: Lienzo): void {
  // Estandarte de la Cofradía en Oaxaca: tela roja deshilachada con el Espejo Negro y greca negra.
  g.rect(C.ea1, 11, 0, 2, 80); g.rect(C.ea2, 11, 0, 1, 80); g.rect(C.ea0, 2, 4, 20, 2);
  for (let y = 6; y < 56; y++) {
    const w = y > 48 ? 18 - (y - 48) * 2 : 18;
    for (let x = 0; x < w; x++) g.set(y > 40 && y < 46 && patronOn('greca', x, y - 40) ? C.ink : y % 11 === 0 ? C.te1 : C.te0, 12 - w / 2 + x, y);
  }
  g.ellipse(C.rd0, 12, 22, 6, 6); g.ellipse(C.st0, 12, 22, 4, 4); g.set(C.mtn2, 10, 20);
  g.outline(outlineOf);
}

function candelabro(g: Lienzo, f: number): void {
  // Candelero alto de hierro con cinco velas (la llama late por cuadro).
  g.rect(C.st0, 14, 20, 3, 46); g.rect(C.st2, 14, 20, 1, 46);
  g.rect(C.st0, 8, 64, 15, 3); g.line(C.st0, 9, 67, 5, 71, 2); g.line(C.st0, 22, 67, 26, 71, 2); g.rect(C.st0, 14, 67, 3, 4);
  g.rect(C.st0, 3, 22, 25, 2);
  const arms: Array<[number, number, number]> = [[3, 16, 6], [8, 14, 8], [14, 12, 10], [21, 14, 8], [26, 16, 6]];
  for (const [x, top] of arms) { g.line(C.st0, x + 1, 22, x + 1, top + 2); g.rect(C.st1, x - 1, top, 5, 2); }
  g.outline(() => C.st1);
  arms.forEach(([x, top, h], k) => {
    g.rect(C.sh1, x, top - h, 3, h); g.set(C.wa4, x, top - h);
    flame(g, x + 1, top - h - 1, f + k);
  });
}

function fachadaTemplo(g: Lienzo): void {
  // Portada del templo en cantera verde: arco con columnas pareadas, nicho y puertas entreabiertas.
  const W = 112, base = 127;
  g.rect(C.teal0, 4, 20, W - 8, base - 20); g.rect(C.fog0, 4, 20, 4, base - 20);
  for (let py = 20; py < base; py++) for (let px = 4; px < W - 4; px++) {
    if (py % 7 === 6 || (px + (Math.floor(py / 7) % 2) * 6) % 12 === 11) g.set(C.dusk, px, py);
  }
  for (let k = 0; k < W - 8; k++) {
    const yy = 20 - Math.round(Math.sin(k / (W - 9) * Math.PI) * 16);
    g.rect(C.teal0, 4 + k, yy, 1, 20 - yy); g.set(C.fog1, 4 + k, yy);
  }
  g.rect(C.fog1, 0, 56, W, 3); g.rect(C.fog2, 0, 56, W, 1);
  for (const cx of [14, 26, W - 32, W - 20]) { g.rect(C.fog0, cx, 59, 7, 68); g.rect(C.fog1, cx, 59, 2, 68); g.rect(C.dusk, cx + 6, 59, 1, 68); }
  g.rect(C.ink, W / 2 - 6, 26, 12, 24); g.ellipse(C.ink, W / 2, 26, 6, 5); g.rect(C.night, W / 2 - 2, 32, 4, 16);
  const aw = 36, ah = 60;
  for (let y = 0; y < ah; y++) {
    const half = y < aw / 2 ? Math.round(Math.sqrt((aw / 2) ** 2 - (aw / 2 - y) ** 2)) : aw / 2;
    g.rect(C.fog1, W / 2 - half - 2, base - ah + y - 2, half * 2 + 4, 1); g.rect(C.ink, W / 2 - half, base - ah + y, half * 2, 1);
  }
  g.rect(C.ea0, W / 2 - 18, base - 40, 14, 40); g.rect(C.ea1, W / 2 - 17, base - 39, 12, 39);
  g.rect(C.ea0, W / 2 + 6, base - 40, 12, 40); g.rect(C.tq0, W / 2 - 4, base - 40, 10, 40); g.rect(C.tq1, W / 2, base - 30, 2, 30);
  for (const [x0, y0] of [[30, 64], [80, 30], [70, 90]] as const) {
    let x = x0, y = y0;
    for (let s = 0; s < 18; s++) { x += (hash(s, x0) - 0.5) * 3; y += 1.5; g.set(C.ink, x, y); }
  }
  g.outline(outlineOf);
}

/** Tendedero con varios textiles colgados (rack del taller o del mercado). */
function textilesRack(g: Lienzo, f: number): void {
  g.rect(C.ea1, 2, 4, 3, 60); g.rect(C.ea1, 75, 4, 3, 60); g.rect(C.ea3, 2, 4, 1, 60);
  g.rect(C.ea2, 0, 4, 80, 3); g.rect(C.ea3, 0, 4, 80, 1);
  TEXTILES.forEach(([k, a, b, c], i) => {
    const x0 = 6 + i * 17, sw = [0, 1, 0, -1][(f + i) % 4];
    for (let y = 0; y < 40 + (i % 2) * 6; y++) for (let x = 0; x < 15; x++) {
      const band = y % 14;
      let col = a;
      if (band < 2 || x === 0 || x === 14) col = c;
      else if (band >= 3 && band < 11 && patronOn(k, x, band - 3)) col = b;
      g.set(col, x0 + x + Math.round(sw * y / 46), 7 + y);
    }
  });
  g.outline(outlineOf);
}

/* ================================ NPCs ================================ */

interface Look { skin: [string, string, string]; shirt: [string, string, string]; pants: [string, string]; feet: string; }

/** Cuerpo base de perfil (mirando a la derecha). `bob` baja torso y cabeza 1 px al respirar. */
function body(g: Lienzo, l: Look, bob: number, stoop = 0, skirt?: [string, string, string]): void {
  const [sk0, sk1, sk2] = l.skin;
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
    g.rect(l.pants[1], 33, 50, 1, 26);
    g.rect(sk1, 27, 74, 5, 2); g.rect(sk1, 34, 74, 5, 2);
    g.rect(l.pants[1], 32, 56, 1, 18);
  }
  g.rect(l.feet, 26, 76, 8, 2); g.rect(l.feet, 33, 76, 9, 2); g.set(C.ea3, 41, 76);
  const ty = 28 + bob, tx = 23 + stoop;
  for (let y = 0; y < 23 - bob; y++) {
    const inset = y === 0 ? 2 : y === 1 ? 1 : y > 15 ? 1 : 0;
    g.rect(l.shirt[1], tx + inset, ty + y, 19 - inset * 2, 1);
    if (y > 0 && y < 21 - bob) g.rect(l.shirt[0], tx + 2 + inset, ty + y, 12 - inset, 1);
  }
  g.rect(l.shirt[2], tx + 3, ty + 2, 2, 16 - bob);
  g.rect(l.shirt[1], tx + 10, ty + 5, 1, 14 - bob);
  head(g, 25 + stoop * 2, 9 + bob + stoop, l.skin);
  void sk0; void sk2;
}

/** Cabeza de perfil; (hx, hy) = esquina de referencia como en el Nivel 3. */
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

function necklace(g: Lienzo, x: number, y: number, beads: string[], len = 9, drop = 4): void {
  for (let k = 0; k < len; k++) g.set(beads[k % beads.length], x + k, y + Math.round(Math.sin(k / (len - 1) * Math.PI) * drop));
}

/** Bordado geométrico de pecho de huipil. */
function bordado(g: Lienzo, x: number, y: number, w: number, h: number, cols: string[]): void {
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (patronOn('rombo', px, py) || py === 0 || py === h - 1) g.set(cols[(px + py) % cols.length], x + px, y + py);
  }
}

function hatPalma(g: Lienzo, hx: number, hy: number, wide: number, band: string = C.ea1): void {
  g.ellipse(C.ea3, hx + 8, hy + 1, wide, 3); g.rect(C.ea4, hx + 8 - wide, hy, wide * 2, 1);
  g.rect(C.ea3, hx + 2, hy - 7, 12, 7); g.rect(C.ea4, hx + 3, hy - 7, 8, 5);
  g.rect(band, hx + 2, hy - 2, 12, 2);
  for (let x = hx + 8 - wide; x < hx + 8 + wide; x += 3) g.set(C.ea2, x, hy + 1);
}

const outlineChar = (c: string): string => (c === C.sh1 || c === C.sh0 || c === C.wa4 ? C.st2 : outlineOf(c));

/** Tejedora en telar de cintura: sentada sobre sus talones, el telar va de su cintura a un poste. */
function tejedora(g: Lienzo, f: number): void {
  const skin: [string, string, string] = [C.sk0, C.sk1, C.sk2];
  const beat = [0, 2, 3, 1][f % 4]; // golpe del machete
  // Poste y mecate al frente.
  g.rect(C.ea1, 59, 30, 4, 48); g.rect(C.ea3, 59, 30, 1, 48); g.rect(C.ea0, 58, 76, 6, 2);
  g.line(C.ea4, 59, 44, 54, 50);
  // Enredo oscuro (falda) doblado bajo las piernas; faja roja.
  g.ellipse(C.night, 30, 70, 15, 8); g.rect(C.night, 16, 68, 28, 10); g.rect(C.mtn0, 16, 68, 28, 1);
  for (let x = 17; x < 43; x += 4) g.set(C.mtn1, x, 73);
  g.rect(C.sk1, 13, 75, 6, 3); g.rect(C.sk0, 13, 77, 6, 1); // pie bajo el cuerpo
  // Torso con huipil blanco y bordado rojo y amarillo.
  for (let y = 0; y < 22; y++) g.rect(y < 2 ? C.sh0 : C.sh1, 22 + (y < 2 ? 2 : 0), 42 + y, 16 - (y < 2 ? 4 : 0), 1);
  g.rect(C.sh0, 22, 44, 2, 20);
  bordado(g, 25, 46, 11, 7, [C.rd0, C.wa2, C.ro1]);
  g.rect(C.rd0, 22, 62, 17, 3); g.rect(C.rd1, 22, 62, 17, 1);
  // Mecapal (correa de la cintura) y urdimbre tensa hasta el poste.
  g.rect(C.ea3, 36, 60, 4, 4);
  for (let k = 0; k < 5; k++) g.line(k % 2 ? C.sh0 : C.sh1, 40, 59 + k, 58, 44 + k);
  // Tela tejida cerca del cuerpo: greca roja sobre manta.
  for (let x = 40; x < 49; x++) for (let k = 0; k < 6; k++) {
    const y = 59 + k - Math.round((x - 40) * 15 / 18);
    g.set(patronOn('greca', x, k + 1) ? C.rd0 : C.sh1, x, y);
  }
  // Machete de madera (batidor) que sube y baja.
  g.line(C.ea2, 51, 44 + beat, 53, 58 + beat, 2); g.set(C.ea4, 51, 44 + beat);
  // Brazos hacia la urdimbre.
  g.line(C.sh0, 30, 46, 46, 52 + beat, 3); g.rect(C.sk1, 46, 50 + beat, 3, 3); g.set(C.sk2, 46, 50 + beat);
  g.line(C.sh1, 28, 47, 43, 56, 3); g.rect(C.sk1, 43, 55, 3, 3);
  // Cabeza ligeramente inclinada hacia el trabajo, trenzas y rebozo sobre la cabeza.
  head(g, 22, 22, skin);
  g.rect(C.st0, 22, 21, 14, 4); g.rect(C.st0, 22, 22, 6, 12);
  for (let y = 34; y < 56; y += 3) { g.rect(C.st0, 21 + (y % 2), y, 3, 3); g.set(C.mtn0, 22, y); }
  g.rect(C.ro1, 21, 56, 3, 2);
  // Rebozo añil con rayas y flecos, cubre cabeza y hombros.
  for (let y = 18; y < 50; y++) {
    const x0 = y < 24 ? 21 - (y - 18) * 0.3 : 18, x1 = y < 24 ? 36 : y < 30 ? 30 : 26;
    g.rect(y % 5 === 0 ? C.mtn1 : C.mtn0, x0, y, x1 - x0, 1);
    if (y > 44) for (let x = x0; x < x1; x += 2) g.set(C.sh0, x, y + 2);
  }
  g.rect(C.mtn1, 21, 18, 15, 1);
  necklace(g, 30, 43, [C.wa2, C.rd1, C.wa2], 7, 2);
  g.rect(C.wa2, 33, 36, 1, 2); // arete
  g.outline(outlineChar);
}

/** Tejedor de telar de pedal: sombrero, camisa de manta, faja, lanzadera y madejas de lana. */
function tejedor(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh1, C.sh0, C.wa4], pants: [C.sh0, C.sh1], feet: C.ea2 };
  // Madejas de lana colgadas al hombro (por la espalda).
  for (const [y, c, d] of [[30, C.rd0, C.rd1], [36, C.wa1, C.wa2], [42, C.tq0, C.tq1]] as const) { g.ellipse(c, 21, y + bob, 4, 3); g.set(d, 20, y - 1 + bob); }
  body(g, look, bob);
  const hx = 25, hy = 9 + bob;
  g.rect(C.st0, hx, hy + 1, 6, 9); g.rect(C.st0, hx + 12, hy + 12, 5, 1); // cabello y bigote
  hatPalma(g, hx, hy + 1, 13, C.rd0);
  // Faja tejida con greca y cotón de lana sobre el hombro.
  g.rect(C.rd0, 24, 47 + bob, 19, 3); for (let x = 24; x < 43; x += 2) g.set(C.wa2, x, 48 + bob);
  g.line(C.ea2, 27, 29 + bob, 39, 47 + bob, 2);
  const [ax, ay] = arm(g, look, bob, 12, -3 + (f === 1 ? -1 : f === 3 ? 1 : 0));
  // Lanzadera de madera con la canilla de hilo y la hebra que cae.
  g.rect(C.ea3, ax - 2, ay - 4, 10, 3); g.rect(C.ea4, ax - 2, ay - 4, 10, 1); g.rect(C.wa1, ax + 2, ay - 4, 3, 2);
  g.line(C.wa2, ax + 7, ay - 2, ax + 9, ay + 8);
  g.outline(outlineChar);
}

/** Anciana maestra: trenzas con listones, collares de coral y oro, huipil bordado y malacate. */
function maestra(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0, stoop = 1;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh1, C.sh0, C.wa4], pants: [C.ea1, C.ea2], feet: C.ea1 };
  // Trenzas canosas con listones, cayendo por la espalda.
  for (let y = 20; y < 50; y += 3) { g.rect(C.st4, 22 + (y % 2), y + bob, 4, 3); g.set(C.st5, 23, y + bob); }
  g.rect(C.ro2, 21, 49 + bob, 5, 2); g.rect(C.tq1, 22, 51 + bob, 3, 3);
  body(g, look, bob, stoop, [C.rd0, C.te1, C.ink]);
  const hx = 27, hy = 10 + bob;
  // Cabello cano con raya y arrugas.
  g.rect(C.st4, hx, hy - 1, 14, 4); g.rect(C.st4, hx, hy, 6, 11); g.rect(C.st5, hx + 3, hy - 1, 7, 1);
  g.set(C.sk0, hx + 11, hy + 11); g.set(C.sk0, hx + 14, hy + 4); g.rect(C.sk0, hx + 12, hy + 13, 2, 1);
  // Huipil con bordado de rombos y grecas en el pecho.
  bordado(g, 26, 31 + bob, 14, 9, [C.pu1, C.ro1, C.wa1, C.tq1]);
  for (let x = 25; x < 42; x++) if (patronOn('greca', x, 2)) g.set(C.rd0, x, 45 + bob);
  // Collares: varias vueltas de coral, cuentas doradas y una medalla.
  necklace(g, 30, 29 + bob, [C.rd1, C.rd0], 11, 4);
  necklace(g, 30, 31 + bob, [C.wa2, C.wa3], 11, 5);
  necklace(g, 31, 33 + bob, [C.rd1, C.wa2, C.rd0], 9, 5);
  g.rect(C.wa2, 35, 38 + bob, 2, 2); g.set(C.wa3, 35, 38 + bob);
  g.rect(C.wa2, hx + 5, hy + 13, 1, 3); g.set(C.rd1, hx + 5, hy + 16); // arete
  // Malacate (huso) girando en una jícara: hila algodón.
  const [ax, ay] = arm(g, look, bob, 11, 2, stoop);
  g.ellipse(C.ea2, ax + 4, 74, 5, 2); g.rect(C.ea3, ax, 72, 9, 2);
  g.line(C.sh1, ax + 1, ay, ax + 4, 70);
  g.rect(C.ea3, ax + 4, ay + 6, 1, 14 - 0); g.rect(C.ea4, ax + 2, ay + 14, 5, 2);
  const spin = f % 4;
  g.set(spin === 0 ? C.rd0 : C.ea1, ax + 2 + spin, ay + 15);
  g.ellipse(C.sh1, ax + 4, ay + 10, 2, 3); g.set(C.sh0, ax + 3 + (spin % 2), ay + 10);
  g.outline(outlineChar);
}

/** Vendedora del mercado con tenate de flores en la cabeza y mandil. */
function vendedora(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.ro1, C.ro0, C.ro2], pants: [C.st1, C.st2], feet: C.ea2 };
  body(g, look, bob, 0, [C.mtn0, C.night, C.ink]);
  const hx = 25, hy = 9 + bob;
  g.rect(C.st0, hx, hy - 1, 14, 5); g.rect(C.st0, hx, hy, 6, 11);
  for (let y = 20; y < 44; y += 3) { g.rect(C.st0, 23, y + bob, 3, 3); g.set(C.mtn0, 24, y + bob); }
  // Mandil a cuadros.
  for (let y = 47; y < 68; y++) for (let x = 30; x < 42; x++) g.set((Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? C.sh1 : C.tq1, x, y + bob);
  // Tenate de palma en la cabeza con flores de cempasúchil y mano que lo sostiene.
  g.rect(C.ea3, hx - 1, hy - 7, 20, 6); for (let x = hx - 1; x < hx + 19; x += 2) g.set(C.ea4, x, hy - 6 + (x % 4 ? 1 : 3));
  g.rect(C.ea2, hx - 1, hy - 2, 20, 1);
  for (let k = 0; k < 6; k++) { g.ellipse(k % 2 ? C.wa1 : C.wa2, hx + 1 + k * 3, hy - 9 - (k % 2), 2, 2); g.set(C.wa3, hx + 1 + k * 3, hy - 10 - (k % 2)); }
  g.ellipse(C.fo3, hx + 17, hy - 9, 2, 1);
  g.line(C.ro1, 40, 31 + bob, 45, hy - 1, 3); g.rect(C.sk1, 44, hy - 3, 3, 3);
  necklace(g, 31, 30 + bob, [C.wa2, C.sh1], 8);
  g.rect(C.wa2, hx + 5, hy + 13, 1, 2);
  const [ax, ay] = arm(g, look, bob, 6, 4 + (f === 1 ? 1 : 0));
  // Ramito de flores en la mano.
  g.line(C.fo2, ax + 1, ay, ax + 3, ay - 5); g.ellipse(C.wa2, ax + 3, ay - 6, 2, 2); g.set(C.wa3, ax + 3, ay - 7);
  g.outline(outlineChar);
}

/** Señor con sarape de rayas al hombro, sombrero y bastón. */
function senorSarape(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0, stoop = 1;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh1, C.sh0, C.wa4], pants: [C.st2, C.st3], feet: C.ea2 };
  g.rect(C.ea1, 44, 34, 2, 44); g.rect(C.ea3, 44, 34, 1, 44); g.rect(C.ea2, 42, 32, 5, 3);
  body(g, look, bob, stoop);
  const hx = 27, hy = 10 + bob;
  g.rect(C.st4, hx, hy + 2, 5, 8); g.rect(C.sh1, hx + 11, hy + 13, 6, 1); g.set(C.sk0, hx + 12, hy + 5);
  hatPalma(g, hx, hy + 1, 14, C.st0);
  // Sarape con rayas de colores y rombo central, doblado sobre el hombro izquierdo.
  for (let y = 0; y < 30; y++) {
    const x0 = 20 + Math.round(y * 0.1), x1 = 36 - Math.round(Math.max(0, y - 10) * 0.35);
    for (let x = x0; x < x1; x++) {
      const band = Math.floor(y / 3) % 5;
      let c: string = [C.rd0, C.wa2, C.ink, C.tq1, C.ro1][band];
      if (y > 10 && y < 22 && Math.abs(x - 28) + Math.abs(y - 16) < 5) c = C.wa3;
      g.set(c, x, 28 + bob + y);
    }
    if (y === 29) for (let x = x0; x < x1; x += 2) g.rect(C.rd0, x, 58 + bob, 1, 3);
  }
  const [ax, ay] = arm(g, look, bob, 14, 1 + (f === 3 ? 1 : 0), stoop);
  void ax; void ay;
  g.outline(outlineChar);
}

/** Joven músico de banda de viento con trompeta y gorra. */
function musico(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh1, C.sh0, C.wa4], pants: [C.night, C.mtn0], feet: C.ink };
  body(g, look, bob);
  const hx = 25, hy = 9 + bob;
  g.rect(C.st0, hx, hy, 7, 8); g.rect(C.mtn0, hx, hy - 2, 15, 4); g.rect(C.mtn0, hx + 12, hy, 6, 1); g.rect(C.wa2, hx + 6, hy - 1, 2, 2);
  g.rect(C.rd0, 29, 27 + bob, 10, 2); // paliacate
  g.rect(C.ink, 24, 47 + bob, 19, 2);
  const [ax, ay] = arm(g, look, bob, 9, -9);
  // Trompeta al costado, abollada.
  g.rect(C.wa1, ax - 2, ay - 2, 12, 2); g.rect(C.wa2, ax - 2, ay - 2, 12, 1); g.rect(C.wa1, ax + 9, ay - 4, 3, 6); g.set(C.wa3, ax + 10, ay - 4);
  g.rect(C.wa0, ax + 2, ay, 3, 2);
  if (f === 1) g.set(C.wa3, ax + 4, ay - 2);
  g.outline(outlineChar);
}

/** Señora con rebozo morado y canasta de pan de yema. */
function panadera(g: Lienzo, f: number): void {
  const bob = f >= 2 ? 1 : 0;
  const look: Look = { skin: [C.sk0, C.sk1, C.sk2], shirt: [C.sh0, C.st4, C.sh1], pants: [C.ea1, C.ea2], feet: C.ea1 };
  body(g, look, bob, 1, [C.te1, C.te0, C.ea0]);
  const hx = 27, hy = 10 + bob;
  g.rect(C.st0, hx + 2, hy, 10, 3);
  for (let y = -2; y < 40; y++) {
    const x0 = y < 2 ? hx + 1 - y : hx - 3, x1 = y < 2 ? hx + 12 : y < 18 ? hx + 6 : hx + 14;
    g.rect(y % 4 === 0 ? C.pu2 : C.pu1, x0, hy + y, x1 - x0, 1);
    if (y > 33 && y % 2 === 0) for (let x = x0; x < x1; x += 2) g.set(C.pu3, x, hy + y + 1);
  }
  const [ax, ay] = arm(g, look, bob, 9, 3, 1);
  canasta(g, ax + 3, ay + 9, 14, 7);
  for (let k = 0; k < 3; k++) { g.ellipse(C.wa1, ax - 1 + k * 4, ay + 1, 2, 2); g.set(C.wa2, ax - 2 + k * 4, ay); }
  g.outline(outlineChar);
}

/* ============================== CATÁLOGO ============================== */

const TEXTILES: Array<[Patron, string, string, string]> = [
  ['greca', C.rd0, C.ink, C.wa2], ['rombo', C.ink, C.ro2, C.wa1], ['estrella', C.mtn0, C.sh1, C.ro1], ['zigzag', C.fo2, C.wa3, C.te1],
];

export const OAXACA_ART: OaxacaArtSpec[] = [
  { key: 'prop_n04_letras_oaxaca', dir: PROPS, w: 176, h: 72, frames: 1, feetY: 71, draw: g => letras(g) },
  { key: 'prop_n04_telar', dir: PROPS, w: 80, h: 72, frames: 1, feetY: 71, draw: g => telar(g) },
  ...TEXTILES.map(([k, a, b, c], i): OaxacaArtSpec => ({ key: `prop_n04_textil_${i + 1}`, dir: PROPS, w: 28, h: 50, frames: 4, fps: 3, feetY: 49, draw: (g, f) => textil(g, k, a, b, c, f) })),
  { key: 'prop_n04_puesto', dir: PROPS, w: 96, h: 72, frames: 1, feetY: 71, draw: g => puesto(g, false) },
  { key: 'prop_n04_puesto_roto', dir: PROPS, w: 96, h: 72, frames: 1, feetY: 71, draw: g => puesto(g, true) },
  { key: 'prop_n04_ollas', dir: PROPS, w: 40, h: 24, frames: 1, feetY: 23, draw: g => ollas(g) },
  { key: 'prop_n04_olla', dir: PROPS, w: 16, h: 20, frames: 1, feetY: 19, draw: g => { olla(g, 8, 19, 6); g.outline(() => C.ink); } },
  { key: 'prop_n04_canastas', dir: PROPS, w: 40, h: 22, frames: 1, feetY: 21, draw: g => canastas(g) },
  { key: 'prop_n04_muro_pasaje_cerrado', dir: PROPS, w: 112, h: 104, frames: 2, fps: 2, feetY: 103, draw: (g, f) => muroPasaje(g, false, f) },
  { key: 'prop_n04_muro_pasaje_abierto', dir: PROPS, w: 112, h: 104, frames: 2, fps: 3, feetY: 103, draw: (g, f) => muroPasaje(g, true, f) },
  { key: 'prop_n04_agave', dir: PROPS, w: 32, h: 28, frames: 1, feetY: 27, draw: g => agave(g, 32, 28) },
  { key: 'prop_n04_agave_grande', dir: PROPS, w: 56, h: 44, frames: 1, feetY: 43, draw: g => agave(g, 56, 44) },
  { key: 'prop_n04_andamio', dir: PROPS, w: 64, h: 96, frames: 1, feetY: 95, draw: g => andamioProp(g) },
  { key: 'prop_n04_velas', dir: PROPS, w: 32, h: 20, frames: 4, fps: 8, feetY: 19, draw: velas },
  { key: 'prop_n04_vela', dir: PROPS, w: 8, h: 16, frames: 4, fps: 8, feetY: 15, draw: velaSola },
  { key: 'prop_n04_retablo', dir: PROPS, w: 96, h: 128, frames: 1, feetY: 127, draw: g => retablo(g) },
  { key: 'prop_n04_campana', dir: PROPS, w: 40, h: 32, frames: 1, feetY: 31, draw: g => campana(g) },
  { key: 'prop_n04_fragmento_sello', dir: PROPS, w: 20, h: 20, frames: 4, fps: 6, feetY: 19, draw: fragmento },
  { key: 'prop_n04_juguetes', dir: PROPS, w: 44, h: 22, frames: 1, feetY: 21, draw: g => juguetes(g) },
  { key: 'prop_n04_ropa_ninos', dir: PROPS, w: 42, h: 28, frames: 1, feetY: 27, draw: g => ropaNinos(g) },
  { key: 'prop_n04_farol', dir: PROPS, w: 16, h: 72, frames: 4, fps: 6, feetY: 71, draw: farolPoste },
  { key: 'prop_n04_papel_picado', dir: PROPS, w: 128, h: 28, frames: 4, fps: 4, feetY: 27, draw: papelPicado },
  { key: 'prop_n04_escombros', dir: PROPS, w: 56, h: 20, frames: 1, feetY: 19, draw: g => escombros(g) },
  { key: 'prop_n04_barricada', dir: PROPS, w: 80, h: 38, frames: 1, feetY: 37, draw: g => barricada(g) },
  // Claves que ya usan los JSON del contenido (alias y piezas extra).
  { key: 'prop_n04_cartel', dir: PROPS, w: 48, h: 56, frames: 1, feetY: 55, draw: g => cartel(g) },
  { key: 'prop_n04_columna_rota', dir: PROPS, w: 40, h: 48, frames: 1, feetY: 47, draw: g => columnaRota(g) },
  { key: 'prop_n04_estandarte', dir: PROPS, w: 24, h: 80, frames: 1, feetY: 79, draw: g => estandarteN04(g) },
  { key: 'prop_n04_candelabro', dir: PROPS, w: 32, h: 72, frames: 4, fps: 8, feetY: 71, draw: candelabro },
  { key: 'prop_n04_fachada_templo', dir: PROPS, w: 112, h: 128, frames: 1, feetY: 127, draw: g => fachadaTemplo(g) },
  { key: 'prop_n04_textiles', dir: PROPS, w: 80, h: 64, frames: 4, fps: 3, feetY: 63, draw: textilesRack },
  { key: 'prop_n04_muro_cerrado', dir: PROPS, w: 112, h: 104, frames: 2, fps: 2, feetY: 103, draw: (g, f) => muroPasaje(g, false, f) },
  { key: 'prop_n04_muro_abierto', dir: PROPS, w: 112, h: 104, frames: 2, fps: 3, feetY: 103, draw: (g, f) => muroPasaje(g, true, f) },
  { key: 'prop_n04_ropa', dir: PROPS, w: 42, h: 28, frames: 1, feetY: 27, draw: g => ropaNinos(g) },
  { key: 'npc_artesano_1', dir: NPCS, w: 64, h: 80, frames: 4, fps: 5, feetY: 78, draw: tejedora },
  { key: 'npc_artesano_2', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: tejedor },
  { key: 'npc_artesano_3', dir: NPCS, w: 64, h: 80, frames: 4, fps: 6, feetY: 78, draw: maestra },
  { key: 'npc_poblador_n04_1', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: vendedora },
  { key: 'npc_poblador_n04_2', dir: NPCS, w: 64, h: 80, frames: 4, fps: 3, feetY: 78, draw: senorSarape },
  { key: 'npc_poblador_n04_3', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: musico },
  { key: 'npc_poblador_n04_4', dir: NPCS, w: 64, h: 80, frames: 4, fps: 4, feetY: 78, draw: panadera },
];

/** Dibuja un cuadro de una entrada del catálogo. */
export function drawOaxacaArt(spec: OaxacaArtSpec, frame: number): Lienzo {
  const g = new Lienzo(spec.w, spec.h);
  spec.draw(g, frame);
  return g;
}
