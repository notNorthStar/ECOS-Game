import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';

/**
 * Texturas generadas por código para el mundo: respaldos mientras llega el arte (el arte del
 * equipo, si existe, SIEMPRE gana) y texturas técnicas (viñeta, brillo, niebla).
 * Las claves generadas empiezan con "__mundo_" para no chocar con el manifiesto.
 */

export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): string {
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx, c.width, c.height);
  scene.textures.addCanvas(key, c);
  return key;
}

/** Devuelve `key` si existe; si no, genera y devuelve la clave de respaldo. */
export function texOr(scene: Phaser.Scene, key: string, fallback: () => string): string {
  return scene.textures.exists(key) ? key : fallback();
}

// --- ruido determinista (mismo estilo que la referencia de Worlorn) ---
const hash = (x: number, y: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const sm = (t: number) => t * t * (3 - 2 * t);
const vn = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = sm(x - xi);
  const v = sm(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const fbm = (x: number, y: number, o = 4) => {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < o; i++) {
    s += a * vn(x * f + i * 17, y * f + i * 31);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
};
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const dither = (x: number, y: number) => (BAYER[y & 3][x & 3] + 0.5) / 16;

/** Elige color de una rampa con tramado ordenado (look pixel art). */
function ramp(cols: string[], t: number, x: number, y: number): string {
  t = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1);
  const i = Math.floor(t);
  return cols[t - i > dither(x, y) ? Math.min(i + 1, cols.length - 1) : i];
}

/** Respaldo de una capa de parallax: cielo, montañas, colinas, ciudad, suelo y primer plano. */
export function fallbackLayer(scene: Phaser.Scene, index: number, width: number): string {
  const key = `__mundo_capa${index}_${width}`;
  return canvasTexture(scene, key, width, GAME_HEIGHT, (ctx, W, H) => {
    const buf = new PixelBuffer(ctx, W, H);
    const px = buf.px;
    drawLayer(index, W, H, px);
    buf.flush();
  });
}

function drawLayer(index: number, W: number, H: number, px: (c: string, x: number, y: number, w?: number, h?: number) => void): void {
  {
    if (index === 0) {
      const sky = ['#06080f', '#0a1018', '#0f1820', '#142229', '#1b2e33', '#25403f', '#31524c', '#3f6658'];
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) px(ramp(sky, Math.pow(y / 240, 1.3), x, y), x, y);
      for (let i = 0; i < W / 3; i++) {
        const x = Math.floor(hash(i, 1) * W);
        const y = Math.floor(Math.pow(hash(i, 2), 1.5) * 150);
        const b = hash(i, 3);
        px(b > 0.9 ? '#e8f0f0' : b > 0.6 ? '#9ab0b8' : '#4a5a68', x, y);
      }
      // Luna pálida tras la niebla.
      const mx = Math.min(W - 60, 470);
      for (let y = 30; y < 110; y++)
        for (let x = mx - 40; x < mx + 40; x++) {
          const d = Math.hypot(x - mx, y - 70);
          if (d < 16) px(ramp(['#f4f0d8', '#d8dcc0', '#b0bca8'], d / 16 + (fbm(x * 0.2, y * 0.2) - 0.5) * 0.5, x, y), x, y);
          else if (d < 40 && (1 - (d - 16) / 24) ** 2 * 0.6 > dither(x, y)) px('#2a4440', x, y);
        }
      return;
    }
    if (index >= 1 && index <= 3) {
      const base = [0, 150, 172, 186][index];
      const amp = [0, 70, 34, 20][index];
      const freq = [0, 0.006, 0.012, 0.02][index];
      const cols = [
        [],
        ['#1c2c34', '#18262e', '#142028'],
        ['#14201f', '#101a1a', '#0d1515'],
        ['#0d1212', '#0a0e0f', '#080b0c'],
      ][index];
      const rim = ['', '#3a5a5c', '#2a4440', '#3a3a30'][index];
      for (let x = 0; x < W; x++) {
        let top = Math.round(base + (fbm(x * freq, index * 7) - 0.5) * amp);
        if (index === 3) {
          // Ciudad cercana: casas con techos planos y ventanas cálidas.
          const bw = 18 + Math.floor(hash(Math.floor(x / 26), 9) * 20);
          const cell = Math.floor(x / bw);
          top = 150 + Math.floor(hash(cell, 4) * 50);
        }
        for (let y = Math.max(0, top); y < 212; y++) {
          const dd = y - top;
          px(dd < 1 ? rim : ramp(cols, dd / 40 + (fbm(x * 0.05, y * 0.05) - 0.5) * 0.4, x, y), x, y);
          if (index === 3 && dd > 4 && y < 200 && x % 7 < 2 && y % 9 < 3 && hash(x >> 3, y >> 3) > 0.82) px('#d89a4a', x, y);
        }
      }
      return;
    }
    if (index === 4) {
      const cols = ['#3a4a3c', '#33423a', '#2c3a33', '#26332d', '#202c27', '#1a2521', '#151e1b'];
      for (let x = 0; x < W; x++) {
        const top = 205 + Math.round((fbm(x * 0.04, 41, 3) - 0.5) * 6);
        for (let y = top; y < H; y++) {
          const t = (y - 205) / (H - 205);
          let c = ramp(cols, t * 0.95 + (fbm(x * 0.03, y * 0.08, 3) - 0.5) * 0.25, x, y);
          // Banqueta / adoquín de Xalapa.
          if ((y - 230) % 22 === 0 && t < 0.8 && fbm(x * 0.1, y) > 0.3) c = '#1a2420';
          px(c, x, y);
        }
        px('#5a6a58', x, top);
      }
      for (let i = 0; i < W * 1.2; i++) {
        const x = Math.floor(hash(i, 11) * W);
        const y = 208 + Math.floor(Math.pow(hash(i, 12), 0.8) * (H - 210));
        const r = hash(i, 13);
        if (r < 0.5) {
          const h = 1 + Math.floor(hash(i, 14) * 4);
          for (let k = 0; k < h; k++) px('#4a6a3a', x, y - k);
        } else if (r < 0.7) px('#5a5a50', x, y, 2, 1);
        else px('#101614', x, y);
      }
      return;
    }
    // Capa 5: primer plano, maleza oscura abajo.
    for (let x = 0; x < W; x++) {
      const base = 340 + Math.round((fbm(x * 0.02, 77, 3) - 0.5) * 18);
      for (let y = base; y < H; y++) px(dither(x, y) > 0.9 ? '#0e1410' : '#050806', x, y);
      if (hash(x, 5) < 0.5) {
        const h = 3 + Math.floor(hash(x, 9) * hash(x, 11) * 26);
        const lean = (hash(x, 13) - 0.5) * 0.5;
        for (let k = 0; k < h; k++) px(k > h - 3 ? '#1a2a1c' : '#050806', x + Math.round(lean * k), base - k);
      }
    }
  }
}

/** Escribe píxeles en un ImageData (mucho más rápido que fillRect por píxel). */
class PixelBuffer {
  private img: ImageData;
  private cache = new Map<string, [number, number, number]>();
  constructor(
    private ctx: CanvasRenderingContext2D,
    private W: number,
    private H: number,
  ) {
    this.img = ctx.createImageData(W, H);
  }
  px = (c: string, x: number, y: number, w = 1, h = 1): void => {
    let v = this.cache.get(c);
    if (!v) {
      const n = parseInt(c.slice(1), 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      this.cache.set(c, v);
    }
    x = Math.round(x);
    y = Math.round(y);
    const d = this.img.data;
    const x1 = Math.min(this.W, x + w);
    const y1 = Math.min(this.H, y + h);
    for (let j = Math.max(0, y); j < y1; j++)
      for (let i = Math.max(0, x); i < x1; i++) {
        const k = (j * this.W + i) * 4;
        d[k] = v[0];
        d[k + 1] = v[1];
        d[k + 2] = v[2];
        d[k + 3] = 255;
      }
  };
  flush(): void {
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/** Silueta de respaldo para el jugador (64×64, pies en y = 60). */
export function fallbackPlayer(scene: Phaser.Scene): string {
  return canvasTexture(scene, '__mundo_protagonista', 64, 64, (ctx) => {
    const P = (c: string, x: number, y: number, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    // ~28×54 chibi: cabeza grande, chamarra, gema roja.
    P('#1a1018', 22, 8, 20, 18);
    P('#4a2c1a', 23, 9, 18, 8);
    P('#e0b090', 26, 15, 14, 10);
    P('#1a0c0c', 35, 18, 2, 3);
    P('#1a1018', 20, 26, 24, 22);
    P('#3e6a6a', 21, 27, 22, 20);
    P('#24444a', 21, 40, 22, 7);
    P('#ff5a6a', 31, 32, 3, 3);
    P('#1a1018', 23, 48, 8, 12);
    P('#1a1018', 33, 48, 8, 12);
    P('#2e2838', 24, 48, 6, 11);
    P('#2e2838', 34, 48, 6, 11);
    P('#140e10', 23, 57, 9, 3);
    P('#140e10', 33, 57, 9, 3);
  });
}

/** Rectángulo de respaldo para un prop sin arte. */
export function fallbackProp(scene: Phaser.Scene, key: string): string {
  const sizes: Record<string, [number, number]> = {
    prop_farol: [16, 72],
    prop_arbol: [80, 112],
    prop_arbusto: [48, 32],
    prop_banca: [48, 24],
    prop_poste: [16, 96],
    prop_antena: [64, 144],
    prop_busto_juarez: [48, 88],
    prop_estante: [48, 80],
    prop_mesa_taller: [96, 48],
    prop_auto_viejo: [96, 40],
    prop_caja: [32, 28],
    prop_columna: [14, 58],
    letras_xalapa: [192, 72],
    altar_memoria: [48, 48],
  };
  const [w, h] = sizes[key] ?? [24, 40];
  return canvasTexture(scene, `__mundo_${key}`, w, h, (ctx) => {
    if (key === 'prop_farol' || key === 'prop_poste') {
      ctx.fillStyle = '#1c2224';
      ctx.fillRect(w / 2 - 2, 6, 4, h - 6);
      ctx.fillStyle = '#3a4448';
      ctx.fillRect(w / 2 - 1, 6, 1, h - 6);
      ctx.fillStyle = key === 'prop_farol' ? '#ffd68a' : '#2a3234';
      ctx.fillRect(w / 2 - 4, 0, 8, 7);
      return;
    }
    if (key === 'prop_columna') {
      // Columna de cantera, luz desde arriba a la izquierda.
      const cols = ['#b0a088', '#8a7c6a', '#6a5e52', '#4a4038', '#2a2420'];
      for (let x = 2; x < w - 2; x++) {
        ctx.fillStyle = cols[Math.min(cols.length - 1, Math.floor(((x - 2) / (w - 4)) * cols.length))];
        ctx.fillRect(x, 4, 1, h - 8);
      }
      ctx.fillStyle = '#c8b8a0';
      ctx.fillRect(0, 0, w, 3);
      ctx.fillRect(0, h - 4, w, 3);
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(0, 3, w, 1);
      ctx.fillRect(0, h - 1, w, 1);
      for (let y = 12; y < h - 6; y += 10) ctx.fillRect(3, y, w - 6, 1);
      return;
    }
    if (key === 'prop_arbol') {
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(w / 2 - 4, h - 50, 8, 50);
      for (let i = 0; i < 260; i++) {
        const a = hash(i, 1) * Math.PI * 2;
        const d = Math.sqrt(hash(i, 2)) * 34;
        ctx.fillStyle = hash(i, 3) > 0.7 ? '#2e4a30' : '#1a2c1e';
        ctx.fillRect(w / 2 + Math.cos(a) * d - 2, 40 + Math.sin(a) * d * 0.8 - 2, 5, 4);
      }
      return;
    }
    ctx.fillStyle = '#1e1a22';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3a3440';
    ctx.fillRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = '#4e4656';
    ctx.fillRect(1, 1, w - 2, 2);
  });
}

/** Sombra elíptica 32×10. */
export function shadowTexture(scene: Phaser.Scene): string {
  return texOr(scene, 'fx_sombra', () =>
    canvasTexture(scene, '__mundo_sombra', 32, 10, (ctx, w, h) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const e = ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2;
          if (e < 1) {
            ctx.fillStyle = e < 0.55 ? 'rgba(4,6,8,0.55)' : 'rgba(4,6,8,0.3)';
            ctx.fillRect(x, y, 1, 1);
          }
        }
    }),
  );
}

/** Brillo radial suave para luces (se usa con blend ADD). */
export function glowTexture(scene: Phaser.Scene): string {
  return texOr(scene, 'fx_brillo', () =>
    canvasTexture(scene, '__mundo_brillo', 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
  );
}

/** Banda de niebla 256×64 que se repite en x (se usa en TileSprite). */
export function fogTexture(scene: Phaser.Scene): string {
  return texOr(scene, 'fx_niebla', () =>
    canvasTexture(scene, '__mundo_niebla', 256, 64, (ctx, w, h) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          // Ruido periódico en x (para que la textura se repita sin costura).
          const a = (x / w) * Math.PI * 2;
          const n = fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + y * 0.06, 4);
          const fall = Math.sin((y / h) * Math.PI);
          const v = (n - 0.38) * 2.2 * fall;
          if (v > dither(x, y) * 0.8) {
            ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, 0.25 + v * 0.5).toFixed(2)})`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
    }),
  );
}

/** Viñeta de pantalla completa (tramada, como Worlorn). */
export function vignetteTexture(scene: Phaser.Scene): string {
  return canvasTexture(scene, '__mundo_vineta', GAME_WIDTH, GAME_HEIGHT, (ctx, W, H) => {
    const buf = new PixelBuffer(ctx, W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / (W / 2);
        const dy = (y - H / 2) / (H / 2);
        const e = dx * dx * 0.55 + dy * dy * 0.75;
        const k = e - 0.5;
        if (k > 0 && k * 1.6 > dither(x, y)) buf.px(k > 0.35 ? '#020304' : '#06080c', x, y);
      }
    buf.flush();
  });
}
