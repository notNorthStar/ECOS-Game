/** Suelo y vegetación frontal a escala 1×. Solo píxeles enteros y colores de ART_SPEC. */
const hash = (x: number, y: number, seed = 0): number => {
  let v = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + seed * 1447) | 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
};
const P = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

function line(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, ex: number, ey: number, thick = 1): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(ex - x, ey - y)));
  for (let i = 0; i <= steps; i++) P(ctx, color, x + (ex - x) * i / steps, y + (ey - y) * i / steps, thick, thick);
}

function ellipse(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, rx: number, ry: number): void {
  for (let j = -ry; j <= ry; j++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (j / ry) ** 2)));
    P(ctx, color, x - half, y + j, half * 2 + 1);
  }
}

function fern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number, front = false): void {
  const dark = front ? '#0a1a14' : '#14301f';
  const green = front ? '#14301f' : '#36663a';
  const light = front ? '#22482c' : '#5a8a46';
  for (let n = 0; n < 9; n++) {
    const angle = -Math.PI + 0.18 + n * 0.35;
    const len = size * (0.55 + hash(n, seed) * 0.45);
    const tx = x + Math.cos(angle) * len;
    const ty = y + Math.sin(angle) * len * 0.7 - 2;
    line(ctx, dark, x, y, tx + 1, ty + 1, 2);
    line(ctx, green, x, y, tx, ty);
    for (let i = 2; i < 9; i++) {
      const t = i / 10;
      const bx = x + (tx - x) * t;
      const by = y + (ty - y) * t;
      const leaf = (1 - t) * len * 0.18;
      line(ctx, i % 3 === 0 ? light : green, bx, by, bx - Math.sin(angle) * leaf, by + Math.cos(angle) * leaf * 0.6);
      line(ctx, green, bx, by, bx + Math.sin(angle) * leaf, by - Math.cos(angle) * leaf * 0.6);
    }
  }
}

/** Capa 4: empedrado húmedo y banquetas, con un cinturón continuo claramente transitable. */
export function drawTuxtlaGround(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  P(ctx, '#45434a', 0, 215, width, height - 215);
  // Banqueta de cantera: borde iluminado, canto oscuro, juntas y desgaste.
  P(ctx, '#625f62', 0, 217, width, 13);
  for (let x = 0; x < width; x += 28) {
    P(ctx, '#8a857e', x + 1, 216, 26, 2);
    P(ctx, '#45434a', x + 1, 226, 26, 3);
    P(ctx, '#2e2c34', x, 217, 1, 12);
    if (hash(x, 3) > 0.4) P(ctx, '#b3ab9c', x + 3, 216, 8);
    if (hash(x, 4) > 0.5) P(ctx, '#36663a', x + 1, 225, 3, 2);
  }
  // Piedras irregulares, más grandes cerca de cámara; no forman paredes ni obstáculos falsos.
  const stone = ['#625f62', '#8a857e', '#8a857e', '#8a857e', '#625f62', '#8a857e'];
  for (let y = 231, row = 0; y < height; row++) {
    const h = 6 + Math.floor((y - 231) / 25);
    let x = -(row % 2) * 11;
    while (x < width) {
      const n = hash(x, row, 71);
      const w = 11 + Math.floor(n * 12) + Math.floor((y - 231) / 32);
      const color = stone[Math.floor(hash(x, row, 91) * stone.length)];
      P(ctx, color, x + 1, y, w - 1, h - 1);
      P(ctx, '#b3ab9c', x + 3, y, w - 5);
      P(ctx, '#45434a', x + 1, y + h - 1, w - 1);
      // Esquinas rotas: la cantera del pavimento no debe leerse como un muro de ladrillos.
      P(ctx, '#45434a', x + 1, y);
      P(ctx, '#45434a', x + w - 1, y);
      if (hash(x, row, 17) > 0.7) P(ctx, '#b3ab9c', x + 3, y + 1, 3);
      if (hash(x, row, 18) > 0.6) P(ctx, '#45434a', x + w - 4, y + 2, 2, 2);
      x += w + 1;
    }
    y += h + 1;
  }
  // Desgaste de baja densidad: humedad, pequeños fragmentos de hoja y musgo en las juntas.
  for (let i = 0; i < width * 5; i++) {
    const x = Math.floor(hash(i, 15) * width);
    const y = 231 + Math.floor(hash(i, 16) * 129);
    const r = hash(i, 17);
    if (r < 0.45) P(ctx, '#625f62', x, y, 2);
    else if (r < 0.63) P(ctx, '#b3ab9c', x, y);
    else if (r < 0.72) P(ctx, '#22482c', x, y, 2);
    else if (r > 0.97) P(ctx, '#9a4630', x, y, 2);
  }
  // Charcos pequeños y planos: el brillo dibuja el cielo, no un lago que parezca infranqueable.
  for (let i = 0; i < 18; i++) {
    const x = 560 + i * 167 + hash(i, 31) * 65;
    const y = 242 + hash(i, 33) * 87;
    const rx = 11 + hash(i, 32) * 18;
    ellipse(ctx, '#26464c', x, y, rx, 3);
    for (let j = 0; j < 12; j++) {
      const px = x - rx + hash(j, i, 51) * rx * 2;
      P(ctx, j % 3 ? '#4f7c6e' : '#8a857e', px, y - 1 + (j % 3), 2 + j % 4);
    }
  }
  // Rosetones discretos de cantera al inicio y en la plaza final.
  for (const cx of [230, 3060, 3400]) {
    for (let y = -17; y <= 17; y++) for (let x = -46; x <= 46; x++) {
      const d = Math.hypot(x / 2.5, y);
      if ((d > 13 && d < 14.2) || (d > 16 && d < 17)) P(ctx, '#b3ab9c', cx + x, 291 + y);
      if (d < 12 && (Math.abs(x * 0.4 - y) < 0.7 || Math.abs(x * 0.4 + y) < 0.7)) P(ctx, '#8a857e', cx + x, 291 + y);
    }
  }
  // Tierra, musgo y hierbas confinan el borde inferior sin invadir la ruta.
  for (let x = 0; x < width; x++) {
    const y = 345 + Math.round(Math.sin(x * 0.04) * 2 + hash(x, 40) * 3);
    P(ctx, '#1e120e', x, y, 1, height - y);
    if (hash(x, 42) > 0.4) P(ctx, '#22482c', x, y - 2, 1, 4);
    if (hash(x, 43) > 0.8) P(ctx, '#5a8a46', x, y - 3, 2);
  }
  // Sombras tramadas de follaje, no velo uniforme encima de los personajes.
  for (let x = 0; x < width; x++) for (let y = 230; y < 249; y++) {
    const shade = Math.sin(x * 0.023) * 0.4 + Math.sin(x * 0.071 + y * 0.09) * 0.3;
    if (hash(x, y, 2) < shade * (249 - y) / 22) P(ctx, '#45434a', x, y);
  }
}

/** Capa 5: helechos, hojas tropicales y bugambilia encuadran el suelo. Centro siempre libre. */
export function drawTuxtlaForeground(ctx: CanvasRenderingContext2D, width: number): void {
  for (let x = -20, i = 0; x < width + 60; x += 88, i++) {
    const y = 354 + hash(i, 91) * 8;
    if (hash(i, 92) > 0.32) fern(ctx, x, y, 21 + hash(i, 93) * 19, i, true);
    for (let j = 0; j < 13; j++) {
      const px = x + hash(i, j, 86) * 65;
      const h = 4 + hash(i, j, 87) * 11;
      line(ctx, j % 4 ? '#14301f' : '#22482c', px, 361, px - 2, 361 - h);
    }
    if (hash(i, 94) > 0.7) {
      for (let j = 0; j < 9; j++) {
        const px = x + hash(i, j, 95) * 30;
        const py = y - hash(i, j, 96) * 12;
        P(ctx, '#5a0a3a', px, py, 4, 3);
        P(ctx, '#a8125e', px, py, 2, 2);
        P(ctx, '#e8207e', px, py, 1);
      }
    }
  }
  // Ramas altas puntuales; los vacíos permiten leer el cielo y el HUD.
  for (let x = 710; x < width; x += 1340) {
    line(ctx, '#1e120e', x - 90, 0, x + 60, 17, 4);
    for (let i = 0; i < 8; i++) {
      const bx = x - 70 + i * 17;
      const by = 3 + i * 2;
      line(ctx, '#14301f', bx, by, bx + 18, by + 17);
      for (let j = 0; j < 5; j++) {
        ellipse(ctx, j % 2 ? '#14301f' : '#22482c', bx + j * 3, by + j * 3, 4, 2);
      }
    }
  }
}
