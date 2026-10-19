/**
 * Suelo (capa 4) y primer plano (capa 5) del Nivel 3. La franja transitable y = 220…345 queda
 * siempre legible: nada en el suelo aparenta un obstáculo. El agua real la dibuja el mundo con los
 * obstáculos "water" del JSON; aquí solo se insinúa la orilla en el horizonte.
 */
import { C, Lienzo, bayer, hash, noise1, noise2 } from './CatemacoPixels';
import type { CatemacoSection } from './CatemacoLandscape';

/* ================================ SUELOS ================================ */

/** Empedrado irregular de piedras redondeadas, más grandes hacia la cámara. */
function cobbles(g: Lienzo, x0: number, x1: number, y0: number, y1: number, cols: string[], hi: string, gap: string, seed: number): void {
  g.rect(gap, x0, y0, x1 - x0, y1 - y0);
  for (let y = y0, row = 0; y < y1; row++) {
    const h = 5 + Math.floor((y - y0) / 26);
    let x = x0 - (row % 2) * 7;
    while (x < x1) {
      const w = 9 + Math.floor(hash(x, row, seed) * 9) + Math.floor((y - y0) / 30);
      const c = cols[Math.floor(hash(x, row, seed + 1) * cols.length)];
      g.rect(c, x + 1, y + 1, w - 2, h - 1); g.rect(c, x + 2, y, w - 4, 1);
      g.rect(hi, x + 2, y, Math.max(1, w - 6), 1);
      if (hash(x, row, seed + 2) > 0.7) g.set(gap, x + w - 3, y + 2);
      x += w;
    }
    y += h;
  }
}

/** Tierra nocturna: dos escalas de ruido y tramado ordenado entre tres tonos (sin manchas planas). */
function soil(g: Lienzo, x0: number, x1: number, y0: number, dark: string, mid: string, light: string, seed: number): void {
  for (let y = y0; y < 360; y++) for (let x = x0; x < x1; x++) {
    const n = noise2(x * 0.03, y * 0.09, seed) * 0.6 + noise2(x * 0.12, y * 0.3, seed + 1) * 0.4;
    const c = n < 0.46 ? dark : n < 0.6 ? (bayer(x, y) < (n - 0.46) / 0.14 ? mid : dark)
      : n < 0.7 ? mid : bayer(x, y) < (n - 0.7) * 3 ? light : mid;
    g.set(c, x, y);
  }
}

/** Velo de humedad: brillo de luna tramado en manchas. */
function wetSheen(g: Lienzo, x0: number, x1: number, y0: number, y1: number, c: string, seed: number, k = 0.4): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const n = noise2(x * 0.03, y * 0.1, seed);
    if (n > 0.62 && g.has(x, y)) g.veil(c, x, y, (n - 0.62) * k * 4);
  }
}

/** Borde inferior: tierra y hierba oscuras que encuadran sin invadir la ruta. */
function bottomEdge(g: Lienzo, w: number, body: string, grass: string, tip: string, seed: number): void {
  for (let x = 0; x < w; x++) {
    const y = 347 + Math.round(noise1(x * 0.05, seed) * 4);
    g.rect(body, x, y, 1, 360 - y);
    if (hash(x, 1, seed) > 0.45) g.rect(grass, x, y - 2, 1, 3);
    if (hash(x, 2, seed) > 0.85) g.set(tip, x, y - 3);
  }
}

/** Orilla en el horizonte: agua oscura que lame una franja de arena húmeda. */
function shoreline(g: Lienzo, x0: number, x1: number, seed: number): void {
  for (let x = x0; x < x1; x++) {
    const edge = 214 + Math.round(noise1(x * 0.04, seed) * 4);
    g.rect(C.deep, x, 205, 1, edge - 205);
    if ((x + seed) % 9 < 4 && hash(x, 1, seed) > 0.4) g.set(C.mtn1, x, 207 + (x % 5));
    if (hash(x, 3, seed) > 0.8) g.rect(C.mtn0, x, 210 + (x % 3), 2, 1);
    g.set(C.mtn2, x, edge - 1);
    g.rect(C.ea1, x, edge, 1, 3);
  }
}

function groundCatemaco(g: Lienzo, w: number): void {
  // Calle empedrada de los brujos que termina en el malecón y una bajada de arena a la laguna.
  const sand0 = Math.round(w * 0.78);
  g.rect(C.st1, 0, 205, w, 155);
  // Banqueta de cantera al pie de las casas.
  for (let x = 0; x < sand0; x += 26) {
    g.rect(C.st3, x, 206, 25, 10); g.rect(C.st4, x + 1, 206, 23, 1); g.rect(C.st2, x, 214, 25, 2);
    g.rect(C.st0, x + 25, 206, 1, 10);
    if (hash(x, 3) > 0.6) g.rect(C.fo2, x + 4, 213, 3, 2);
  }
  g.rect(C.st0, 0, 216, sand0, 2);
  cobbles(g, 0, sand0, 218, 360, [C.st1, C.st1, C.st2, C.st1, C.st0], C.st2, C.ink, 4);
  // Brillo de luna en algunas piedras (luz desde arriba a la izquierda).
  for (let k = 0; k < sand0 / 3; k++) {
    const x = hash(k, 1, 21) * sand0, y = 220 + hash(k, 2, 21) * 125;
    if (g.get(x, y) === C.st2) g.rect(C.st3, x, y, 2, 1);
  }
  // Plaza de las letras: losas grandes con rosetón al inicio.
  for (let y = 236; y < 300; y += 16) for (let x = 120; x < 420; x += 30) {
    g.rect(C.st0, x, y, 30, 16); g.rect(C.st2, x + 1, y + 1, 28, 14); g.rect(C.st3, x + 1, y + 1, 28, 1);
    if (hash(x, y, 4) > 0.6) g.rect(C.st1, x + 3 + hash(x, y, 5) * 20, y + 5, 4, 2);
  }
  for (let y = -26; y <= 26; y++) for (let x = -70; x <= 70; x++) {
    const d = Math.hypot(x / 2.6, y);
    if ((d > 20 && d < 21.3) || (d > 24 && d < 25)) g.set(C.st4, 270 + x, 268 + y);
    if (d < 18 && (Math.abs(x * 0.38 - y) < 0.7 || Math.abs(x * 0.38 + y) < 0.7 || Math.abs(y) < 0.5)) g.set(C.st3, 270 + x, 268 + y);
  }
  // Bajada de arena oscura: el empedrado se deshace en la orilla.
  const sand = new Lienzo(w, 360);
  soil(sand, sand0 - 60, w, 205, C.ea0, C.ea1, C.ea2, 3);
  for (let x = sand0 - 60; x < w; x++) {
    const t = (x - (sand0 - 60)) / 60;
    for (let y = 205; y < 360; y++) {
      if (x < sand0 && hash(x, y, 9) > t) continue;
      g.set(sand.get(x, y) ?? C.ea0, x, y);
    }
  }
  shoreline(g, sand0, w, 2);
  for (let k = 0; k < 40; k++) {
    const x = sand0 + hash(k, 1, 6) * (w - sand0), y = 232 + hash(k, 2, 6) * 100;
    g.rect(C.ea0, x, y, 2, 1); g.set(C.ea4, x, y - 1);
  }
  // Charcos con el reflejo de los faroles.
  for (let i = 0; i < 9; i++) {
    const x = 520 + i * 160 + hash(i, 1, 3) * 60, y = 240 + hash(i, 2, 3) * 80, rx = 10 + hash(i, 3, 3) * 14;
    if (x > sand0 - 70) continue;
    g.ellipse(C.void, x, y, rx, 3);
    for (let j = 0; j < 7; j++) g.rect(j % 3 ? C.mtn0 : C.wa1, x - rx + hash(j, i, 4) * rx * 2, y - 1 + (j % 3), 2 + (j % 3), 1);
  }
  wetSheen(g, 0, sand0 - 60, 220, 345, C.mtn0, 5, 0.12);
  // Sombras tramadas de las casas sobre el empedrado cercano al muro.
  for (let y = 218; y < 236; y++) for (let x = 0; x < sand0; x++) g.veil(C.st0, x, y, (236 - y) / 18 * 0.6);
  bottomEdge(g, w, C.ea0, C.fo1, C.fo3, 7);
}

function groundCampamento(g: Lienzo, w: number): void {
  // Orilla fangosa: arena mojada, conchas, tablones y huellas que llevan al campamento.
  soil(g, 0, w, 205, C.ea0, C.ea1, C.ea2, 3);
  shoreline(g, 0, w, 5);
  // Lodazales oscuros que reflejan la luna (planos, no parecen muros).
  for (let i = 0; i < 20; i++) {
    const x = hash(i, 1, 8) * w, y = 240 + hash(i, 2, 8) * 90, rx = 12 + hash(i, 3, 8) * 18;
    g.ellipse(C.ea0, x, y, rx + 2, 3 + hash(i, 4, 8) * 2);
    g.ellipse(C.void, x, y, rx, 2 + hash(i, 4, 8) * 2);
    for (let j = 0; j < 5; j++) g.rect(j % 2 ? C.mtn0 : C.mtn1, x - rx * 0.7 + hash(j, i, 2) * rx * 1.4, y - 1 + j % 2, 2 + j % 3, 1);
  }
  // Tablones y troncos varados, tendidos en el plano del suelo.
  for (let k = 0; k < w / 140; k++) {
    const x = hash(k, 1, 2) * w, y = 232 + hash(k, 2, 2) * 105, len = 14 + hash(k, 3, 2) * 16;
    g.rect(C.ea0, x, y + 1, len, 3); g.rect(C.ea2, x, y, len, 2); g.rect(C.ea3, x + 1, y, len - 3, 1);
    g.set(C.st3, x + 3, y + 1); g.set(C.ea1, x + len - 4, y + 1);
  }
  // Conchas, piedras y juncos rotos.
  for (let k = 0; k < w / 6; k++) {
    const x = hash(k, 1, 11) * w, y = 222 + hash(k, 2, 11) * 120, r = hash(k, 3, 11);
    if (r < 0.4) { g.rect(C.st2, x, y, 3, 2); g.set(C.st4, x, y); }
    else if (r < 0.55) { g.rect(C.sh0, x, y, 2, 1); g.set(C.sh1, x, y); }
    else if (r < 0.8) g.line(C.fo1, x, y, x + 3, y - 4);
  }
  // Huellas de botas de los encapuchados camino al campamento.
  for (let x = Math.round(w * 0.35); x < w * 0.95; x += 11) {
    const y = 300 + Math.round(Math.sin(x * 0.01) * 10) + (x % 22 < 11 ? 0 : 5);
    g.rect(C.ea0, x, y, 4, 2); g.set(C.ea0, x + 4, y + 1);
  }
  // Círculo ritual pintado en ocre rojo, en el corazón del campamento.
  const cx = Math.round(w * 0.82), cy = 285;
  for (let y = -34; y <= 34; y++) for (let x = -100; x <= 100; x++) {
    const d = Math.hypot(x / 3, y);
    if ((d > 30 && d < 31.5) || (d > 25 && d < 26) || (d < 22 && Math.abs(Math.sin(Math.atan2(y, x / 3) * 6)) < 0.08 && d > 8)) g.set(C.te1, cx + x, cy + y);
    if (d < 6 && d > 4.5) g.set(C.rd0, cx + x, cy + y);
  }
  // Resplandor rojizo de antorchas sobre el fango del campamento.
  for (let y = 220; y < 345; y++) for (let x = Math.round(w * 0.6); x < w; x++) {
    if (g.get(x, y) === C.ea2 || g.get(x, y) === C.ea1) g.veil(C.te0, x, y, 0.35 * noise2(x * 0.02, y * 0.04, 6));
  }
  bottomEdge(g, w, C.ea0, C.fo0, C.fo2, 3);
}

function groundAltar(g: Lienzo, w: number): void {
  const c0 = Math.round(w * 0.68);
  // Sendero de tierra de la selva, hojarasca y raíces que cruzan.
  soil(g, 0, c0 + 40, 205, C.ink, C.ea0, C.ea1, 2);
  for (let y = 205; y < 360; y++) for (let x = 0; x < c0 + 40; x++) {
    // Hojarasca: motas pequeñas, no manchas.
    const leaf = hash(x, y, 1);
    if (leaf > 0.985) g.rect(leaf > 0.995 ? C.fo3 : C.fo1, x, y, 2, 1);
    else if (leaf < 0.01) g.set(C.ea2, x, y);
  }
  for (let k = 0; k < 16; k++) {
    // Raíces planas: anchas y pegadas al suelo para no leerse como obstáculos.
    const x0 = hash(k, 1, 4) * c0, y0 = 214 + hash(k, 2, 4) * 20, len = 90 + hash(k, 3, 4) * 120;
    for (let t = 0; t < len; t++) {
      const x = x0 + t, y = y0 + t * 0.35 + Math.sin(t * 0.05 + k) * 6;
      if (y > 340) break;
      g.rect(C.ea1, x, y, 1, 3); g.set(C.ea2, x, y); g.set(C.ink, x, y + 3);
    }
  }
  // Plataforma ceremonial: losas de piedra con el círculo de la Cabeza Olmeca.
  // Losas irregulares: hileras de alto creciente hacia la cámara y juntas con musgo.
  for (let y = 205, row = 0; y < 360; row++) {
    const h = 9 + Math.floor((y - 205) / 22);
    let x = c0 - (row % 3) * 13;
    while (x < w) {
      const lw = 22 + Math.floor(hash(x, row, 5) * 26), c = hash(x, row, 3) > 0.75 ? C.st2 : C.st1;
      g.rect(C.st0, x, y, lw, h); g.rect(c, x + 1, y + 1, lw - 2, h - 2);
      g.rect(c === C.st2 ? C.st3 : C.st2, x + 1, y + 1, lw - 3, 1);
      if (hash(x, row, 6) > 0.6) g.rect(C.fo1, x + lw - 4, y + h - 1, 5, 1);
      if (hash(x, row, 7) > 0.7) g.line(C.st0, x + 4, y + 2, x + 9, y + h - 2);
      x += lw;
    }
    y += h;
  }
  // Transición irregular: la selva invade las losas.
  for (let y = 205; y < 360; y++) for (let x = c0 - 30; x < c0 + 60; x++) {
    if (hash(x, y, 8) < (c0 + 60 - x) / 120) g.set(noise2(x * 0.1, y * 0.1, 3) > 0.5 ? C.fo1 : C.ea0, x, y);
  }
  const cx = Math.round((c0 + w) / 2 + 40), cy = 286;
  for (let y = -40; y <= 40; y++) for (let x = -130; x <= 130; x++) {
    const d = Math.hypot(x / 3, y), a = Math.atan2(y, x / 3);
    if ((d > 38 && d < 40) || (d > 31 && d < 32)) g.set(C.st3, cx + x, cy + y);
    if (d > 32 && d < 38 && Math.abs(Math.sin(a * 10)) < 0.25) g.set(C.st4, cx + x, cy + y);
    if (d < 26 && d > 24) g.set(C.pu1, cx + x, cy + y);
    if (d < 12 && Math.abs(Math.sin(a * 4)) < 0.2) g.set(C.pu2, cx + x, cy + y);
  }
  // Grietas con brillo morado (la corrupción del dios olmeca).
  for (let k = 0; k < 10; k++) {
    let x = cx + (hash(k, 1, 9) - 0.5) * 200, y = cy + (hash(k, 2, 9) - 0.5) * 60;
    for (let s = 0; s < 18; s++) {
      x += (hash(k, s, 3) - 0.5) * 6 + (k % 2 ? 2 : -2); y += (hash(s, k, 4) - 0.5) * 3;
      g.set(C.ink, x, y); if (s % 3 === 0) g.set(C.pu2, x, y - 1);
    }
  }
  // Niebla baja tramada en la selva.
  for (let y = 205; y < 236; y++) for (let x = 0; x < w; x++) if (noise2(x * 0.008, y * 0.3, 6) > 0.62) g.veil(C.pu0, x, y, 0.28 * (236 - y) / 31);
  bottomEdge(g, w, C.ink, C.fo1, C.pu1, 5);
}

export function drawCatemacoGround(g: Lienzo, section: CatemacoSection, width: number): void {
  if (section === 'catemaco') groundCatemaco(g, width);
  else if (section === 'campamento') groundCampamento(g, width);
  else groundAltar(g, width);
}

/* ============================== PRIMER PLANO ============================== */

function fernFront(g: Lienzo, x: number, y: number, size: number, seed: number, dark: string, mid: string): void {
  for (let n = 0; n < 8; n++) {
    const a = -Math.PI + 0.25 + n * 0.38, len = size * (0.6 + hash(n, seed) * 0.4);
    const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len * 0.7;
    g.line(dark, x, y, tx, ty, 2);
    for (let i = 2; i < 9; i++) {
      const t = i / 10, bx = x + (tx - x) * t, by = y + (ty - y) * t, l = (1 - t) * len * 0.2;
      g.line(i % 3 ? dark : mid, bx, by, bx - Math.sin(a) * l, by + Math.cos(a) * l * 0.6);
    }
  }
}

function reeds(g: Lienzo, x: number, base: number, h: number, seed: number): void {
  for (let s = 0; s < 6; s++) {
    const lean = (hash(s, 1, seed) - 0.5) * 12, hh = h * (0.6 + hash(s, 2, seed) * 0.4);
    g.line(s % 2 ? C.ink : C.fo0, x + s * 3, base, x + s * 3 + lean, base - hh);
    if (hash(s, 3, seed) > 0.5) g.rect(C.ea0, x + s * 3 + lean - 1, base - hh - 5, 3, 7);
  }
}

export function drawCatemacoForeground(g: Lienzo, section: CatemacoSection, width: number): void {
  // Orilla inferior oscura común; el centro de la pantalla siempre queda libre.
  for (let x = 0; x < width; x++) {
    const y = 352 + Math.round(noise1(x * 0.03, 2) * 5);
    g.rect(C.ink, x, y, 1, 360 - y);
  }
  if (section === 'catemaco') {
    for (let x = -20, i = 0; x < width + 40; x += 110, i++) {
      if (hash(i, 1, 3) > 0.4) fernFront(g, x, 358, 20 + hash(i, 2, 3) * 14, i, C.fo0, C.fo1);
      // Flores de cempasúchil marchitas de una ofrenda.
      if (hash(i, 4, 3) > 0.75) for (let k = 0; k < 6; k++) g.rect(k % 2 ? C.wa0 : C.wa1, x + 10 + k * 3, 350 - (k % 3), 2, 2);
    }
    // Cable con focos al frente, alto, muy espaciado.
    for (let x0 = 400; x0 < width; x0 += 1200) for (let dx = 0; dx < 260; dx++) {
      const y = 4 + Math.sin(dx / 260 * Math.PI) * 14;
      g.set(C.ink, x0 + dx, y);
      if (dx % 26 === 13) { g.rect(C.ink, x0 + dx, y + 1, 1, 2); g.rect(dx % 52 === 13 ? C.wa2 : C.st2, x0 + dx - 1, y + 3, 3, 3); }
    }
  } else if (section === 'campamento') {
    for (let x = -10, i = 0; x < width + 40; x += 70, i++) if (hash(i, 1, 4) > 0.35) reeds(g, x, 360, 26 + hash(i, 2, 4) * 26, i);
    // Rama de manglar que asoma por arriba.
    for (let x0 = 600; x0 < width; x0 += 1500) {
      g.line(C.ink, x0 - 120, 0, x0 + 80, 22, 4);
      for (let k = 0; k < 9; k++) {
        const bx = x0 - 100 + k * 20, by = 4 + k * 2;
        g.ellipse(C.fo0, bx, by + 6, 9, 4); g.ellipse(C.ink, bx + 3, by + 9, 6, 2);
      }
    }
  } else {
    for (let x = -20, i = 0; x < width + 40; x += 90, i++) if (hash(i, 1, 6) > 0.3) fernFront(g, x, 360, 24 + hash(i, 2, 6) * 18, i, C.ink, C.fo0);
    // Lianas que cuelgan del borde superior.
    for (let x0 = 150; x0 < width; x0 += 520) for (let v = 0; v < 3; v++) {
      const len = 30 + hash(x0, v, 2) * 50;
      for (let y = 0; y < len; y++) g.rect(C.ink, x0 + v * 9 + Math.sin(y * 0.12 + v) * 3, y, 2, 1);
      g.ellipse(C.fo0, x0 + v * 9, len, 4, 3);
    }
  }
}

/** Centros de los círculos pintados en el suelo (mismo cálculo que arriba) para los brillos del decorado. */
export function catemacoGroundMarks(section: CatemacoSection, width: number): Array<{ x: number; y: number; kind: 'ritual' | 'olmeca' }> {
  if (section === 'campamento') return [{ x: Math.round(width * 0.82), y: 285, kind: 'ritual' }];
  if (section === 'altar_olmeca') return [{ x: Math.round((Math.round(width * 0.68) + width) / 2 + 40), y: 286, kind: 'olmeca' }];
  return [];
}
