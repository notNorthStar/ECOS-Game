/** Deterministic, palette-limited pixel scenery. No Phaser or DOM dependency. */
const P = {
  ink: '#120e1a', night: '#152536', blue: '#24394a', haze: '#33505a',
  mist: '#4f7c6e', pale: '#8aa4a8', stone: '#45434a', gray: '#625f62',
  plaster: '#b3ab9c', cream: '#f6d0a8', white: '#fff4cc',
  wine: '#3a1a18', rust: '#6a2e24', tile: '#9a4630', terra: '#c46a40',
  amber: '#d0742c', gold: '#f2a640', glow: '#ffd77a',
  tealDark: '#0a3a40', teal: '#128a8a', cyan: '#2ad0c0',
  roseDark: '#5a0a3a', rose: '#a8125e', pink: '#e8207e',
  forest: '#0a1a14', leafDark: '#14301f', leaf: '#22482c',
  green: '#36663a', olive: '#5a8a46', tip: '#9ab85a',
  woodDark: '#1e120e', wood: '#3a2418', brown: '#5c3a24', tan: '#8a5a34', sand: '#b88a52',
} as const;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hash = (x: number, y: number, seed = 0): number => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

class Pixels {
  constructor(readonly c: CanvasRenderingContext2D) {}
  rect(color: string, x: number, y: number, w = 1, h = 1): void {
    this.c.fillStyle = color;
    this.c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  ellipse(color: string, cx: number, cy: number, rx: number, ry: number): void {
    for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) {
      const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)));
      this.rect(color, cx - dx, y, dx * 2 + 1);
    }
  }
  line(color: string, x0: number, y0: number, x1: number, y1: number): void {
    const count = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let n = 0; n <= count; n++) this.rect(color, x0 + (x1 - x0) * n / count, y0 + (y1 - y0) * n / count);
  }
  dither(a: string, b: string, x: number, y: number, w: number, h: number, t: number): void {
    for (let iy = Math.floor(y); iy < y + h; iy++) for (let ix = Math.floor(x); ix < x + w; ix++) {
      this.rect(BAYER[(iy & 3) * 4 + (ix & 3)] / 16 < t ? b : a, ix, iy);
    }
  }
}

function sky(g: Pixels, width: number, height: number): void {
  const ramp = [P.night, P.blue, P.stone, P.rust, P.terra, P.sand];
  for (let y = 0; y < height; y++) {
    const s = Math.min(ramp.length - 1.001, y / 230 * (ramp.length - 1));
    g.dither(ramp[Math.floor(s)], ramp[Math.floor(s) + 1], 0, y, width, 1, s % 1);
  }
  const sx = Math.round(width * 0.63), sy = 117;
  // Dithered solar halo, then a crisp disk: every pixel belongs to the official palette.
  for (let y = sy - 58; y < sy + 58; y++) for (let x = sx - 80; x < sx + 80; x++) {
    const r = Math.hypot((x - sx) / 1.18, y - sy);
    if (r > 26 && r < 58 && hash(x, y, 44) < (1 - (r - 26) / 32) * 0.18) g.rect(P.amber, x, y);
  }
  g.ellipse(P.gold, sx, sy, 26, 26); g.ellipse(P.glow, sx - 2, sy - 3, 23, 22);
  for (let y = sy + 4; y < sy + 25; y += 4) {
    const rx = Math.sqrt(Math.max(0, 26 * 26 - (y - sy) ** 2));
    g.rect(P.amber, sx - rx, y, rx * 2, 1);
  }
  for (let n = 0; n < 6; n++) {
    const x = n / 6 * width - 35 + hash(n, 0, 12) * 35;
    const y = 32 + hash(n, 1, 12) * 77;
    const span = 66 + hash(n, 2, 12) * 57;
    // A connected vapor bank with noisy wisps, rather than stacked circular disks.
    for (let dx = -10; dx < span + 15; dx++) {
      const t = dx / span;
      const envelope = Math.max(0, Math.sin(Math.max(0, Math.min(1, t)) * Math.PI));
      const hump = Math.sin(t * 13 + n) * 2.5 + Math.sin(t * 24) * 1.5;
      const top = y - envelope * 7 - hump;
      const bottom = y + envelope * 6 + Math.sin(t * 5) * 2;
      for (let py = Math.floor(top) - 3; py < bottom + 3; py++) {
        const distance = Math.min(py - top, bottom - py);
        const density = distance >= 2 ? 0.9 : distance >= 0 ? 0.55 : 0.12;
        if (hash(dx, py, n + 42) > density * (envelope * 0.65 + 0.35)) continue;
        g.rect(py > y + 1 ? P.stone : py < y - 3 ? P.terra : P.gray, x + dx, py);
      }
    }
  }
}

function mountains(g: Pixels, width: number): void {
  const ramps = [[P.haze, P.pale], [P.tealDark, P.mist], [P.leafDark, P.leaf]];
  for (let layer = 0; layer < 3; layer++) {
    for (let x = 0; x < width; x++) {
      const mountain = Math.exp(-(((x - width * 0.35) / (115 + layer * 30)) ** 2)) * (71 - layer * 10);
      const shoulder = Math.exp(-(((x - width * 0.79) / 145) ** 2)) * 46;
      const top = Math.round(174 + layer * 18 - mountain - shoulder + Math.sin(x * 0.017 + layer) * 9 + Math.sin(x * 0.047) * 2);
      g.rect(ramps[layer][0], x, top, 1, 222 - top);
      for (let y = top + 2; y < Math.min(222, top + 35); y++) {
        if (hash(x >> 2, y >> 1, layer) < 0.1 && ((x + y * 2) % 11 < 3)) g.rect(ramps[layer][1], x, y);
      }
      if (layer < 2) for (let y = 177 + layer * 17; y < 203 + layer * 9; y++) {
        if (((x + y * 3) & 7) === 0 && hash(x, y, 50) > 0.35) g.rect(P.mist, x, y);
      }
    }
  }
}

function palm(g: Pixels, x: number, foot: number, h: number, seed: number): void {
  for (let dy = 0; dy < h; dy++) {
    const xx = x + Math.sin(dy / h * 1.4) * 8;
    g.rect(P.wood, xx, foot - dy, 4); g.rect(dy % 6 < 2 ? P.sand : P.tan, xx, foot - dy, 2);
  }
  const top = foot - h, cx = x + 8;
  for (let n = 0; n < 8; n++) {
    const angle = n * Math.PI / 4 + seed * 0.2;
    const len = 23 + hash(n, seed) * 19;
    for (let step = 0; step < len; step++) {
      const xx = cx + Math.cos(angle) * step;
      const yy = top + Math.sin(angle) * step * 0.3 + (step / len) ** 2 * 14;
      g.rect(n < 4 ? P.green : P.leafDark, xx, yy, 4, 2);
      if (step % 3 === 0) g.line(P.leaf, xx, yy, xx - 3, yy + 7);
      if (n < 3) g.rect(P.olive, xx, yy, 2);
    }
  }
}

function city(g: Pixels, width: number): void {
  for (let n = 0, x = -15; x < width; n++, x += 35 + Math.floor(hash(n, 8) * 32)) {
    const w = 30 + hash(n, 3) * 25, h = 17 + hash(n, 4) * 37;
    const base = 203 + Math.sin(x * 0.008) * 8;
    g.rect(n % 2 ? P.haze : P.tealDark, x, base - h, w, h);
    g.rect(P.gray, x - 2, base - h - 3, w + 4, 3);
    for (let wx = x + 5; wx < x + w - 5; wx += 10) for (let y = base - h + 7; y < base - 4; y += 11) {
      g.rect(hash(wx, y) > 0.67 ? P.sand : P.night, wx, y, 3, 5);
    }
    if (n % 5 === 0) palm(g, x + w + 7, base, 43, n);
  }
  // Fictitious bell tower: a recognizable regional landmark without copying a building.
  for (const x of [Math.round(width * 0.31), Math.round(width * 0.79)]) {
    g.rect(P.stone, x, 122, 27, 87); g.rect(P.gray, x + 2, 123, 19, 81);
    g.rect(P.plaster, x + 3, 124, 3, 79); g.rect(P.sand, x - 3, 148, 33, 4);
    g.rect(P.sand, x - 2, 119, 31, 4); g.rect(P.plaster, x + 5, 103, 17, 17);
    g.ellipse(P.plaster, x + 13, 104, 8, 7);
    g.rect(P.night, x + 9, 127, 9, 17); g.ellipse(P.night, x + 13, 128, 4, 5);
    g.rect(P.tan, x + 11, 133, 5, 7); g.rect(P.sand, x + 9, 140, 9, 2);
    g.rect(P.wood, x + 13, 91, 1, 8); g.rect(P.wood, x + 10, 94, 7);
    for (let y = 159; y < 202; y += 14) g.rect(P.tealDark, x + 11, y, 6, 8);
  }
  for (let y = 204; y < 219; y++) for (let x = 0; x < width; x++) {
    if (hash(x, y, 30) < 0.14) g.rect(P.mist, x, y);
  }
}

function arch(g: Pixels, x: number, y: number, w: number, h: number, inner: string): void {
  g.rect(P.wood, x - 2, y + w / 2, w + 4, h - w / 2);
  g.ellipse(P.sand, x + w / 2, y + w / 2, w / 2 + 2, w / 2 + 2);
  g.rect(inner, x, y + w / 2, w, h - w / 2);
  g.ellipse(inner, x + w / 2, y + w / 2, w / 2, w / 2);
}

function house(g: Pixels, x: number, width: number, h: number, n: number): void {
  const ground = 218, top = ground - h;
  const pairs = [[P.tile, P.terra], [P.tealDark, P.teal], [P.roseDark, P.rose], [P.tan, P.sand], [P.gray, P.plaster]];
  const [shade, wall] = pairs[n % pairs.length];
  g.rect(P.woodDark, x - 1, top - 1, width + 3, h + 2);
  g.rect(wall, x, top, width, h);
  g.rect(shade, x + width - 15, top, 15, h);
  g.rect(P.sand, x, ground - 12, width, 12); g.rect(P.brown, x, ground - 3, width, 3);
  for (let k = 0; k < width * 0.8; k++) {
    const px = x + hash(k, n, 1) * width, py = top + hash(k, n, 2) * h;
    if (hash(k, n, 4) > 0.35) g.rect(shade, px, py, 1 + hash(k, n, 5) * 4, 1 + hash(k, n, 8) * 2);
    if (py > ground - 24) g.rect(P.gray, px, py, 2, 1);
  }
  // Recesses and plaster trim, with individually shaded roof tiles.
  const roofRise = 12 + n % 3 * 2;
  for (let y = 0; y < roofRise; y++) {
    const inset = Math.floor((roofRise - y) * 0.65);
    g.rect(P.rust, x + inset - 5, top - roofRise + y, width - inset * 2 + 10, 1);
    for (let tx = x + inset - 4; tx < x + width - inset + 4; tx += 6) {
      g.rect(y % 5 === 0 ? P.wine : (tx + n) % 12 < 6 ? P.tile : P.terra, tx, top - roofRise + y, 4, 1);
    }
  }
  g.rect(P.wood, x - 5, top, width + 10, 4); g.rect(P.sand, x - 3, top + 4, width + 6, 2);
  for (let tx = x + 5; tx < x + width; tx += 15) g.rect(P.brown, tx, top + 6, 3, 4);
  const doorX = x + 13 + (n % 2) * 20;
  arch(g, doorX, ground - 48, 22, 46, P.woodDark);
  g.rect(P.brown, doorX + 3, ground - 31, 16, 29);
  for (let dx = 4; dx < 19; dx += 5) g.rect(P.wood, doorX + dx, ground - 30, 1, 27);
  g.rect(P.gold, doorX + 16, ground - 18, 2, 2);
  const twoFloors = h >= 104;
  const windowY = top + 19;
  for (let wx = x + 12; wx < x + width - 24; wx += 39) {
    arch(g, wx, windowY, 17, 27, n % 3 === 0 ? P.sand : P.night);
    g.rect(P.wood, wx + 7, windowY + 6, 2, 19);
    g.rect(P.wood, wx + 1, windowY + 14, 15, 2);
    g.rect(shade, wx - 5, windowY + 8, 4, 20); g.rect(P.wood, wx - 5, windowY + 8, 1, 20);
    g.rect(P.plaster, wx - 3, windowY + 27, 23, 3);
    if (twoFloors) {
      g.rect(P.stone, wx - 5, windowY + 24, 27, 2);
      g.rect(P.woodDark, wx - 5, windowY + 31, 27, 2);
      for (let ix = wx - 4; ix < wx + 22; ix += 4) g.rect(P.woodDark, ix, windowY + 24, 1, 8);
      g.rect(P.sand, wx - 6, windowY + 33, 29, 3);
      g.rect(P.wood, wx - 2, windowY + 36, 2, 3); g.rect(P.wood, wx + 16, windowY + 36, 2, 3);
    }
  }
  if (twoFloors) g.rect(P.sand, x, top + 59, width, 3);
  if (width > 130) {
    arch(g, x + width - 42, ground - 38, 22, 31, P.night);
    for (let ix = 0; ix < 20; ix += 4) g.rect(P.wood, x + width - 41 + ix, ground - 33, 1, 23);
    g.rect(P.wood, x + width - 41, ground - 22, 20, 1);
  }
  // Broken neon box, terracotta pots, creepers and a caged warm wall lantern.
  if (n % 3 === 1) {
    const nx = x + width - 46, ny = top + 10;
    g.rect(P.woodDark, nx, ny, 32, 11); g.rect(P.gray, nx - 1, ny - 1, 34, 1);
    for (let k = 0; k < 5; k++) {
      const color = k === 2 ? P.tealDark : P.cyan;
      g.rect(color, nx + 4 + k * 5, ny + 3, 1, 5);
      if (k !== 2) g.rect(color, nx + 4 + k * 5, ny + 3, 3, 1);
    }
    g.line(P.ink, nx + 5, ny + 12, nx + 8, ny + 22);
  }
  const lx = doorX + 30;
  g.line(P.woodDark, lx, ground - 38, lx + 6, ground - 38);
  g.rect(P.woodDark, lx + 4, ground - 37, 7, 12);
  g.rect(P.gold, lx + 5, ground - 35, 5, 7); g.rect(P.glow, lx + 5, ground - 35, 2, 5);
  g.rect(P.woodDark, lx + 7, ground - 35, 1, 7);
  for (let k = 0; k < 2; k++) {
    const px = x + width - 13 - k * 15;
    g.rect(P.rust, px, ground - 9, 9, 8); g.rect(P.terra, px - 1, ground - 11, 11, 3);
    g.line(P.leaf, px + 4, ground - 12, px + 1, ground - 24);
    g.ellipse(P.green, px, ground - 20, 5, 2); g.ellipse(P.olive, px + 7, ground - 24, 5, 2);
  }
  if (n % 4 === 0) for (let y = top + 8; y < ground - 13; y += 3) {
    const vx = x + 3 + Math.sin(y * 0.15) * 3;
    g.rect(P.leafDark, vx, y, 2, 4); g.rect(P.green, vx - 3, y + 1, 5, 2);
    if (y % 9 === 0) g.rect(P.pink, vx - 2, y, 2, 2);
  }
}

function street(g: Pixels, width: number): void {
  // Spatial rhythm follows the whole parallax width, rather than a repeating facade strip.
  const scale = width / 2564;
  const at = (x: number) => Math.round(x * scale);
  house(g, at(160), 126, 79, 3);
  palm(g, at(44), 218, 96, 3);
  palm(g, at(349), 218, 74, 5);
  for (let x = at(440), n = 0; x < at(960); n++) {
    const w = 108 + Math.floor(hash(n, 4, 41) * 51);
    const h = 91 + Math.floor(hash(n, 5, 41) * 34);
    house(g, x, w, h, n + 1);
    x += w + 20 + Math.floor(hash(n, 6, 41) * 24);
  }
  // The tropical clearing deliberately exposes the distant hills and town.
  palm(g, at(1030), 218, 89, 1);
  palm(g, at(1460), 218, 95, 6);
  for (const [x, seed] of [[at(1110), 3], [at(1390), 5]] as const) {
    const tx = x;
    g.rect(P.wood, tx, 192, 3, 26);
    for (let k = 0; k < 7; k++) {
      const cx = tx + Math.sin(k * 2.3 + seed) * 13, cy = 189 + Math.cos(k * 1.7) * 7;
      g.ellipse(P.leafDark, cx, cy, 13, 7);
      g.ellipse(P.green, cx - 3, cy - 2, 9, 4);
    }
  }
  house(g, at(1530), 156, 105, 4);
  house(g, at(1715), 125, 87, 3);
  // Arcade fronts, whose openings give the workshop district a different silhouette.
  for (let ax = at(1530) + 68; ax < at(1530) + 145; ax += 29) {
    arch(g, ax, 176, 22, 40, P.woodDark);
    g.rect(P.plaster, ax - 3, 187, 3, 29);
    g.rect(P.sand, ax - 5, 213, 7, 4);
  }
  // Low plaza wings frame a broad central gap, leaving the distant bell tower visible.
  house(g, at(1900), 145, 65, 1);
  house(g, at(2385), 152, 69, 4);
  palm(g, at(2080), 218, 73, 9);
  palm(g, at(2340), 218, 78, 7);
  for (const x of [at(90), at(1180), at(1320), at(2170), at(2280)]) {
      const tx = x;
      // Small low bushes leave most of the vista unobstructed.
      g.rect(P.wood, tx, 207, 3, 11);
      for (let k = 0; k < 5; k++) {
        const cx = tx + Math.sin(k * 2.3) * 12, cy = 209 + Math.cos(k * 1.7) * 5;
        g.ellipse(P.leafDark, cx, cy, 13, 7);
        g.ellipse(P.green, cx - 3, cy - 2, 8, 4);
      }
  }
  /* The street and workshop carry utility cables; gardens and plaza retain open sky. */
  for (const [start, end] of [[at(420), at(995)], [at(1510), at(1850)]]) {
    for (let x = start, k = 0; x < end; x += 230, k++) {
      const next = Math.min(x + 230, end);
      g.rect(P.woodDark, x, 107, 3, 111); g.rect(P.tan, x, 107, 1, 110);
      g.rect(P.wood, x - 10, 115, 23, 3);
      for (let ins = -7; ins < 12; ins += 8) g.rect(P.tealDark, x + ins, 111, 3, 4);
      for (let dx = 0; dx < next - x; dx++) {
        const sag = Math.sin(dx / (next - x) * Math.PI) * 14;
        g.rect(P.ink, x + dx, 116 + sag);
        if (k % 2 === 0) g.rect(P.wood, x + dx, 123 + sag * 0.9);
      }
      if (k % 3 === 1) { g.rect(P.stone, x + 4, 142, 11, 15); g.rect(P.teal, x + 6, 145, 3, 2); }
    }
  }
}

/** Draw one transparent landscape layer at native 640×360 scale (variable parallax width). */
export function drawTuxtlaLandscape(ctx: CanvasRenderingContext2D, width: number, height: number, index: number): void {
  const g = new Pixels(ctx);
  if (index === 0) sky(g, width, height);
  else if (index === 1) mountains(g, width);
  else if (index === 2) city(g, width);
  else if (index === 3) street(g, width);
}
