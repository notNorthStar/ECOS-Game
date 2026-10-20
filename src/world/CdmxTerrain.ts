/**
 * Suelo (capa 4) y primer plano (capa 5) del Nivel 6. La franja transitable y = 220…345 queda
 * siempre legible: lodo agrietado, asfalto y pétalos son planos (no parecen obstáculos). Las
 * colisiones reales (y los obstáculos con `height` del doble salto) las ponen los JSON de nivel.
 */
import { C, Lienzo, bayer, cempasuchil, grieta, halo, hash, noise1, noise2, PAPEL } from './CdmxPixels';
import { CDMX_LANDMARKS, atWorld, type CdmxSection } from './CdmxLandscape';

/* ================================ SUELOS ================================ */

/** Lodo seco del canal: placas poligonales con grietas oscuras y bordes levantados. */
function lodoAgrietado(g: Lienzo, x0: number, x1: number, y0: number, y1: number, seed: number): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    // Celdas de Voronoi baratas: distancia al centro más cercano de una rejilla con jitter.
    // Espacio de celdas con perspectiva: las placas crecen hacia la cámara (v se comprime abajo).
    const dy = y - y0, u = x / 30, v = dy / (11 + dy * 0.06);
    const cx = Math.floor(u), cy = Math.floor(v);
    let d1 = 99, d2 = 99, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const pu = cx + i + 0.15 + hash(cx + i, cy + j, seed) * 0.7, pv = cy + j + 0.15 + hash(cx + i, cy + j, seed + 1) * 0.7;
      const d = Math.hypot(u - pu, (v - pv) * 0.9);
      if (d < d1) { d2 = d1; d1 = d; id = hash(cx + i, cy + j, seed + 2); } else if (d < d2) d2 = d;
    }
    const edge = (d2 - d1) * 14;
    // Placas casi del mismo tono (lodo seco), grietas finas y borde levantado apenas más claro.
    let c: string = id > 0.92 ? C.ea2 : id > 0.3 ? C.ea1 : C.te0;
    if (edge < 0.7) c = C.ink;
    else if (edge < 1.4) c = C.ea0;
    else if (edge < 2.2 && id > 0.3 && bayer(x, y) < 0.35) c = C.ea2; // borde levantado (tramado)
    else if (noise2(x * 0.08, y * 0.2, seed) > 0.7 && bayer(x, y) < 0.4) c = C.ea0;
    g.set(c, x, y);
  }
}

/** Charco de agua estancada que queda en el canal, con reflejo frío. */
function charco(g: Lienzo, x: number, y: number, rx: number, seed: number, warm = false): void {
  g.ellipse(C.ink, x, y, rx + 1, 3); g.ellipse(C.void, x, y, rx, 2);
  for (let j = 0; j < 6; j++) g.rect(j % 3 ? C.night : warm ? C.wa0 : C.tq0, x - rx + hash(j, 1, seed) * rx * 2, y - 1 + (j % 3), 2 + (j % 3), 1);
}

/** Asfalto con grano, parches y grietas. */
function asfalto(g: Lienzo, x0: number, x1: number, y0: number, y1: number, seed: number): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    // Grano fino y parches muy suaves (tramados), sin manchas de camuflaje.
    const n = noise2(x * 0.02, y * 0.06, seed), r = hash(x, y, seed);
    let c: string = r > 0.94 ? C.st2 : r < 0.06 ? C.st0 : C.st1;
    if (n > 0.72 && bayer(x, y) < (n - 0.72) * 2) c = C.st2;
    else if (n < 0.22 && bayer(x, y) < (0.22 - n) * 2.5) c = C.st0;
    g.set(c, x, y);
  }
  for (let k = 0; k < (x1 - x0) / 60; k++) grieta(g, x0 + hash(k, 1, seed) * (x1 - x0), y0 + hash(k, 2, seed) * (y1 - y0 - 40), 20 + hash(k, 3, seed) * 40, C.ink, k + seed, (hash(k, 4, seed) - 0.5) * 2);
}

/** Marcas de carril desgastadas (rayas discontinuas). */
function carriles(g: Lienzo, w: number, ys: number[], c: string, seed: number): void {
  for (const y of ys) for (let x = 0; x < w; x += 48) {
    const len = 24 + Math.floor((y - 220) / 20);
    for (let k = 0; k < len; k++) if (hash(x + k, y, seed) > 0.25) g.rect(c, x + k, y, 1, 1 + Math.floor((y - 220) / 60));
  }
}

/** Banqueta de losas de concreto con guarnición. */
function banqueta(g: Lienzo, x0: number, x1: number, seed: number, guarnicion: string = C.st3): void {
  for (let x = x0; x < x1; x += 24) {
    const c = hash(x, 1, seed) > 0.7 ? C.st2 : C.st3;
    g.rect(c, x, 205, 23, 11); g.rect(C.st4, x + 1, 205, 21, 1); g.rect(C.st1, x + 23, 205, 1, 11);
    if (hash(x, 3, seed) > 0.6) g.line(C.st1, x + 4, 206, x + 12, 215);
  }
  g.rect(guarnicion, x0, 216, x1 - x0, 2); g.rect(C.st0, x0, 218, x1 - x0, 1);
}

/** Losas grandes de plaza en perspectiva. */
function losas(g: Lienzo, x0: number, x1: number, y0: number, y1: number, cols: string[], hi: string, gap: string, seed: number): void {
  for (let y = y0, row = 0; y < y1; row++) {
    const h = 9 + Math.floor((y - y0) / 20);
    let x = x0 - (row % 2) * 14;
    while (x < x1) {
      const lw = 34 + Math.floor(hash(x, row, seed) * 30) + Math.floor((y - y0) / 6), c = cols[Math.floor(hash(x, row, seed + 1) * cols.length)];
      g.rect(gap, Math.max(x, x0), y, Math.min(lw, x1 - x), h); g.rect(c, Math.max(x + 1, x0), y + 1, Math.min(lw - 2, x1 - x - 1), h - 2); g.rect(hi, Math.max(x + 1, x0), y + 1, Math.min(lw - 3, x1 - x - 1), 1);
      x += lw;
    }
    y += h;
  }
}

/** Sendero de pétalos de cempasúchil (guía de las almas) que serpentea por el suelo. */
function senderoPetalos(g: Lienzo, x0: number, x1: number, yc: number, seed: number, density = 1): void {
  for (let x = x0; x < x1; x++) {
    const y = yc + Math.sin(x * 0.008 + seed) * 22 + noise1(x * 0.03, seed) * 10;
    const half = 5 + noise1(x * 0.05, seed + 1) * 5;
    for (let k = 0; k < 3 * density; k++) {
      if (hash(x, k, seed) > 0.55) continue;
      const py = y + (hash(x, k + 3, seed) - 0.5) * half * 2;
      g.set(hash(x, k + 6, seed) > 0.6 ? C.wa2 : hash(x, k + 7, seed) > 0.3 ? C.wa1 : C.wa3, x, py);
    }
  }
}

/** Basura y escombro plano: concreto, vidrio, papel picado caído, veladoras apagadas. */
function escombro(g: Lienzo, x0: number, x1: number, density: number, seed: number, papel = true): void {
  for (let k = 0; k < (x1 - x0) * density; k++) {
    const x = x0 + hash(k, 1, seed) * (x1 - x0), y = 222 + hash(k, 2, seed) * 122, r = hash(k, 3, seed);
    if (r < 0.35) { g.rect(C.st0, x, y + 1, 4, 1); g.rect(C.st3, x, y, 3, 1); }
    else if (r < 0.5) { g.set(C.tq1, x, y); g.set(C.mtn2, x + 1, y); } // vidrio
    else if (r < 0.66 && papel) g.rect(PAPEL[Math.floor(hash(k, 4, seed) * PAPEL.length)], x, y, 2, 1);
    else if (r < 0.72) { g.rect(C.sh0, x, y, 2, 2); g.set(C.st3, x, y + 1); } // veladora apagada
    else if (r < 0.78) g.set(C.te2, x, y);
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

function wallShade(g: Lienzo, x0: number, x1: number, y0: number, y1: number, c: string): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.veil(c, x, y, (y1 - y) / (y1 - y0) * 0.6);
}

function groundXochimilco(g: Lienzo, w: number): void {
  const L = CDMX_LANDMARKS.xochimilco;
  // Bordo de chinampa (tierra húmeda con pasto) y talud que baja al canal seco.
  g.rect(C.ea0, 0, 205, w, 155);
  for (let x = 0; x < w; x++) {
    const y = 214 + Math.round(noise1(x * 0.02, 3) * 5);
    for (let yy = 205; yy < y; yy++) g.set(hash(x, yy, 4) > 0.55 ? C.fo1 : C.fo0, x, yy);
    g.set(C.fo2, x, 205 + Math.floor(hash(x, 1, 4) * 3));
    g.rect(C.ea1, x, y, 1, 4); g.set(C.ea2, x, y);
  }
  lodoAgrietado(g, 0, w, 222, 360, 9);
  // Tablones del embarcadero que entran al canal.
  const { x0, x1 } = L.embarcadero;
  for (let y = 222, r = 0; y < 266; r++) {
    const h = 6 + Math.floor((y - 222) / 26);
    for (let x = x0 + Math.round(hash(r, 1, 5) * 30); x < x1 - Math.round(hash(r, 2, 5) * 40); x += 30) {
      const tw = 28 + Math.floor((y - 222) / 10);
      if (hash(x, r, 5) > 0.85) continue; // tablón faltante
      g.rect(C.ea0, x, y, tw, h); g.rect(hash(x, r, 6) > 0.5 ? C.ea2 : C.ea3, x + 1, y, tw - 2, h - 1); g.rect(C.ea4, x + 1, y, tw - 3, 1);
      g.set(C.st3, x + 3, y + 2); g.set(C.st3, x + tw - 4, y + 2);
    }
    y += h;
  }
  // Lirios secos, charcos y huellas de trajineras arrastradas.
  for (let k = 0; k < w / 40; k++) {
    const x = hash(k, 1, 7) * w, y = 240 + hash(k, 2, 7) * 100;
    if (x > x0 - 20 && x < x1 + 20 && y < 300) continue;
    if (k % 3 === 0) charco(g, x, y, 10 + hash(k, 3, 7) * 16, k);
    else for (let j = 0; j < 5; j++) { g.ellipse(C.fo1, x + j * 3, y + (j % 2), 2, 1); g.set(C.ea3, x + j * 3, y - 1); }
  }
  for (let k = 0; k < 4; k++) {
    const x = 700 + k * 600, y = 260 + hash(k, 4, 7) * 50;
    for (let dx = 0; dx < 140; dx++) { g.set(C.ea0, x + dx, y + Math.sin(dx * 0.04) * 3); g.set(C.ea0, x + dx, y + 10 + Math.sin(dx * 0.04) * 3); }
  }
  // Isla de las Muñecas: veladoras regadas y cempasúchil marchito sobre el lodo.
  const { x0: i0, x1: i1 } = L.islaMunecas;
  for (let k = 0; k < (i1 - i0) / 10; k++) {
    const x = i0 + hash(k, 1, 8) * (i1 - i0), y = 224 + hash(k, 2, 8) * 50;
    if (k % 4 === 0) { g.rect(C.sh0, x, y, 2, 3); g.set(C.wa2, x, y - 1); }
    else if (k % 4 === 1) cempasuchil(g, x, y, 1, k);
    else g.set(C.te1, x, y);
  }
  // Charco de luz donde arde la ofrenda flotante (FUEGO) y explanada firme del altar.
  halo(g, L.ofrendaFuego.x, L.ofrendaFuego.y, 90, 22, C.wa0, 0.55);
  halo(g, L.ofrendaFuego.x, L.ofrendaFuego.y, 40, 10, C.wa1, 0.5);
  const ax = L.altar.x;
  for (let y = 226; y < 290; y++) for (let x = ax - 110; x < ax + 110; x++) {
    const d = Math.hypot((x - ax) / 110, (y - 256) / 32);
    if (d < 1 && hash(x, y, 9) > d * 0.8) g.set(hash(x, y, 10) > 0.8 ? C.fo1 : C.ea1, x, y);
  }
  wallShade(g, 0, w, 220, 236, C.ink);
  bottomEdge(g, w, C.ink, C.fo0, C.fo2, 7);
}

function groundAvenidas(g: Lienzo, w: number): void {
  const L = CDMX_LANDMARKS.avenidas;
  g.rect(C.st1, 0, 205, w, 155);
  banqueta(g, 0, w, 11);
  asfalto(g, 0, w, 219, 360, 12);
  carriles(g, w, [262, 306], C.st4, 13);
  // Coladeras y baches.
  for (let x = 160; x < w; x += 420) { g.rect(C.ink, x, 224, 16, 5); for (let k = 0; k < 16; k += 3) g.rect(C.st2, x + k, 224, 1, 5); }
  for (let k = 0; k < w / 300; k++) { const x = hash(k, 1, 14) * w, y = 240 + hash(k, 2, 14) * 90; g.ellipse(C.st0, x, y, 12, 4); g.ellipse(C.ink, x, y + 1, 9, 2); }
  // Glorieta de las letras: losas de cantera rosa y gris con un sol de pétalos.
  const { x0, x1 } = L.plazaLetras;
  losas(g, x0, x1, 228, 312, [C.st2, C.st2, C.te1, C.st3], C.st3, C.st0, 15);
  // Sendero de pétalos de cempasúchil que guía hacia la ofrenda grande.
  senderoPetalos(g, 0, w, 282, 2);
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2;
    for (let r = 10; r < 34; r++) g.set(r % 3 ? C.wa1 : C.wa2, L.ofrenda.x + Math.cos(a) * r * 2.4, L.ofrenda.y + 18 + Math.sin(a) * r * 0.55);
  }
  halo(g, L.ofrenda.x, L.ofrenda.y - 6, 120, 24, C.wa0, 0.55);
  // Mesa del puesto de la cronista: periódicos regados.
  for (let k = 0; k < 14; k++) { const x = L.cronista.x - 40 + hash(k, 1, 16) * 80, y = 228 + hash(k, 2, 16) * 30; g.rect(C.sh0, x, y, 6, 4); g.rect(C.st4, x + 1, y + 1, 4, 1); }
  escombro(g, 0, w, 0.16, 17);
  for (const cx of [atWorld(600, 1), L.checkpoint.x, 2900]) escombro(g, cx - 90, cx + 90, 0.6, cx, false);
  wallShade(g, 0, w, 219, 236, C.ink);
  bottomEdge(g, w, C.ink, C.st0, C.st2, 18);
}

function groundReforma(g: Lienzo, w: number): void {
  const L = CDMX_LANDMARKS.reforma;
  g.rect(C.st1, 0, 205, w, 155);
  banqueta(g, 0, w, 21, C.st4);
  asfalto(g, 0, w, 219, 360, 22);
  carriles(g, w, [252, 290, 328], C.sh0, 23);
  // Ciclovía verde desteñida.
  for (let x = 0; x < w; x++) { if (hash(x >> 3, 1, 24) > 0.15) g.rect(C.fo2, x, 226, 1, 3); if (x % 160 < 12) g.set(C.sh0, x, 227); }
  // Cráter del Ángel: asfalto hundido con grietas radiales y pedacitos dorados.
  const { x: ax, y: ay } = L.angel;
  for (let y = ay - 40; y < ay + 40; y++) for (let x = ax - 170; x < ax + 170; x++) {
    const d = Math.hypot((x - ax) / 170, (y - ay) / 40);
    if (d < 1) g.veil(d < 0.55 ? C.st0 : C.ink, x, y, (1 - d) * 0.8);
  }
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2 + hash(k, 1, 25) * 0.3, len = 60 + hash(k, 2, 25) * 120;
    let px = ax, py = ay;
    for (let s = 0; s < len; s++) { px += Math.cos(a) * 1.2 + (hash(s, k, 25) - 0.5); py += Math.sin(a) * 0.3 + (hash(s, k + 9, 25) - 0.5) * 0.6; if (py > 222 && py < 344) { g.set(C.ink, px, py); if (s < len * 0.3) g.set(C.st0, px, py + 1); } }
  }
  for (let k = 0; k < 40; k++) { const x = ax - 150 + hash(k, 1, 26) * 300, y = ay - 30 + hash(k, 2, 26) * 60; g.rect(hash(k, 3, 26) > 0.5 ? C.wa1 : C.wa2, x, y, 2, 1); if (k % 5 === 0) g.set(C.wa3, x, y); }
  // Glorieta de la arena (anillo de adoquín) y las ofrendas de la gente al pie del monumento.
  const { x: rx, y: ry } = L.arena;
  for (let y = -46; y <= 46; y++) for (let x = -160; x <= 160; x++) {
    const d = Math.hypot(x / 3.4, y);
    if (d > 42 && d < 46) g.set((Math.floor(x / 4) + y) % 3 ? C.st2 : C.st3, rx + x, ry + y);
  }
  for (let k = 0; k < 30; k++) { const x = ax - 120 + hash(k, 1, 27) * 240, y = 226 + hash(k, 2, 27) * 18; cempasuchil(g, x, y, 1, k); }
  // Plaza de la estación: losas claras y franjas amarillas de andén.
  const ex = L.estacion.x;
  losas(g, ex - 220, w, 219, 360, [C.st1, C.st2, C.st1], C.st3, C.st0, 28);
  for (let x = ex - 220; x < w; x++) if ((x >> 3) % 2 === 0) g.rect(C.wa2, x, 224, 1, 2);
  halo(g, ex, 232, 140, 18, C.wa0, 0.4);
  escombro(g, 0, w, 0.18, 29);
  for (const cx of [500, 1100, 2100]) escombro(g, cx - 100, cx + 100, 0.7, cx, false);
  wallShade(g, 0, w, 219, 236, C.ink);
  bottomEdge(g, w, C.ink, C.st0, C.fo1, 30);
}

export function drawCdmxGround(g: Lienzo, section: CdmxSection, width: number): void {
  if (section === 'xochimilco') groundXochimilco(g, width);
  else if (section === 'avenidas') groundAvenidas(g, width);
  else groundReforma(g, width);
}

/* ============================== PRIMER PLANO ============================== */

/** Tule / carrizo en silueta. */
function tule(g: Lienzo, x: number, base: number, h: number, seed: number): void {
  for (let k = 0; k < 7; k++) {
    const lean = (hash(k, 1, seed) - 0.5) * 0.5, len = h * (0.6 + hash(k, 2, seed) * 0.4);
    g.line(C.ink, x + k * 2, base, x + k * 2 + lean * len, base - len, 2);
    if (k % 3 === 0) { g.ellipse(C.ea0, x + k * 2 + lean * len, base - len, 1, 4); }
  }
}

/** Papel picado cercano casi en silueta. */
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

export function drawCdmxForeground(g: Lienzo, section: CdmxSection, width: number): void {
  for (let x = 0; x < width; x++) {
    const y = 352 + Math.round(noise1(x * 0.03, 2) * 5);
    g.rect(C.ink, x, y, 1, 360 - y);
  }
  if (section === 'xochimilco') {
    for (let x = 30, i = 0; x < width; x += 140, i++) if (hash(i, 1, 3) > 0.35) tule(g, x, 364, 26 + hash(i, 2, 3) * 22, i);
    // Rama seca que asoma arriba con un cordón vacío (las muñecas están en la isla, no aquí).
    for (let x0 = 400; x0 < width; x0 += 1300) {
      for (let dx = 0; dx < 220; dx++) { const yy = Math.round(4 + dx * 0.12 + Math.sin(dx * 0.05) * 4); g.rect(C.ink, x0 + dx, yy - 2, 1, 4 - Math.floor(dx / 80)); }
      g.rect(C.ink, x0 + 120, 20, 1, 16);
    }
  } else if (section === 'avenidas') {
    for (let x0 = 260; x0 < width - 300; x0 += 900) papelCercano(g, x0, 300, 2, x0);
    // Macetas de cempasúchil en silueta y una banca rota.
    for (let x = 80, i = 0; x < width; x += 210, i++) {
      if (hash(i, 1, 4) > 0.5) { g.rect(C.ink, x - 10, 346, 20, 14); for (let k = 0; k < 6; k++) g.ellipse(C.te0, x - 8 + k * 3, 344 - (k % 2) * 2, 3, 3); }
      else if (hash(i, 2, 4) > 0.6) { g.rect(C.ink, x - 20, 344, 40, 3); g.rect(C.ink, x - 18, 347, 3, 13); g.rect(C.ink, x + 14, 347, 3, 13); }
    }
  } else {
    // Varillas retorcidas, una farola doblada y cables colgando arriba.
    for (let x = 60, i = 0; x < width; x += 190, i++) {
      if (hash(i, 1, 5) > 0.5) for (let k = 0; k < 4; k++) g.line(C.ink, x + k * 5, 362, x + k * 5 + (hash(k, i, 5) - 0.5) * 18, 336 - hash(k, i + 2, 5) * 14, 2);
      else if (hash(i, 2, 5) > 0.5) g.ellipse(C.ink, x, 358, 22, 9);
    }
    for (let x0 = 300; x0 < width; x0 += 1000) {
      for (let y = 0; y < 60; y++) g.rect(C.ink, x0 + Math.round(y * y * 0.01), y, 3, 1);
      g.rect(C.ink, x0 + 36, 58, 18, 5);
    }
    for (let x0 = 700; x0 < width; x0 += 1100) for (let dx = 0; dx < 360; dx++) g.set(C.ink, x0 + dx, 10 + Math.sin(dx / 360 * Math.PI) * 30);
  }
}

/** Marcas del suelo con brillo animado en el decorado. */
export function cdmxGroundMarks(section: CdmxSection): Array<{ x: number; y: number; kind: 'fuego' | 'vela' | 'oro' }> {
  if (section === 'xochimilco') return [{ ...CDMX_LANDMARKS.xochimilco.ofrendaFuego, kind: 'fuego' }];
  if (section === 'avenidas') return [{ x: CDMX_LANDMARKS.avenidas.ofrenda.x, y: CDMX_LANDMARKS.avenidas.ofrenda.y, kind: 'vela' }];
  return [{ ...CDMX_LANDMARKS.reforma.angel, kind: 'oro' }, { x: CDMX_LANDMARKS.reforma.estacion.x, y: 232, kind: 'vela' }];
}
