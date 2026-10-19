import Phaser from 'phaser';
import type { LevelData } from '../core/contracts';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { fogTexture, glowTexture, vignetteTexture } from './textures';

/** Obstáculo elíptico marcado como agua (campo extra opcional en el JSON: "water": true). */
export interface WaterSpec {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

interface Mote {
  x: number;
  y: number;
  v: number;
  ph: number;
  c: number;
}

const hex = (s: string | undefined, def: number) => (s ? parseInt(s.replace('#', ''), 16) : def);

/**
 * Atmósfera a nivel Worlorn (según level.ambience): niebla en capas que se desplaza, llovizna,
 * luciérnagas, hojas, polvo, brasas, luces que laten en los faroles, agua con reflejos,
 * tinte ambiental y viñeta. Las partículas son píxeles dibujados con Graphics (look pixel art).
 */
export class Atmosphere {
  private fogs: Array<{ ts: Phaser.GameObjects.TileSprite; par: number; speed: number; baseA: number; ph: number }> = [];
  private screenG: Phaser.GameObjects.Graphics;
  private worldG: Phaser.GameObjects.Graphics;
  private waterG: Phaser.GameObjects.Graphics | null = null;
  private lights: Array<{ glow: Phaser.GameObjects.Image; pool: Phaser.GameObjects.Image; ph: number }> = [];
  private rain: Mote[] = [];
  private splashes: Array<{ x: number; y: number; t: number }> = [];
  private leaves: Mote[] = [];
  private dust: Mote[] = [];
  private embers: Array<Mote & { vx: number; life: number; L: number }> = [];
  private flies: Array<{ x: number; y: number; ph: number; sp: number; ax: number; ay: number }> = [];
  private t = 0;

  constructor(
    scene: Phaser.Scene,
    private level: LevelData,
    lampPositions: Array<{ x: number; y: number; scale: number }>,
    private water: WaterSpec[],
  ) {
    const amb = level.ambience;
    const fog = Phaser.Math.Clamp(amb.fog ?? 0, 0, 1);
    const fogColor = 0xc8dccc;
    const ft = fogTexture(scene);
    const rnd = Math.random;

    // Niebla: horizonte (detrás del suelo), banda baja y-ordenada, y velo frontal.
    if (fog > 0) {
      const mk = (y: number, h: number, depth: number, par: number, speed: number, alpha: number, scale: number) => {
        const ts = scene.add
          .tileSprite(0, y, GAME_WIDTH, h, ft)
          .setOrigin(0, 0.5)
          .setScrollFactor(0)
          .setDepth(depth)
          .setTint(fogColor)
          .setTileScale(scale, scale * 0.9)
          .setAlpha(alpha);
        this.fogs.push({ ts, par, speed, baseA: alpha, ph: rnd() * 6 });
      };
      mk(170, 110, DEPTH.background + 3.5, 0.5, 5, 0.55 * fog, 1.6);
      mk(205, 70, DEPTH.background + 4.5, 0.8, -3, 0.4 * fog, 1.2);
      mk(232, 60, 230, 1.0, 7, 0.28 * fog, 1.4);
      mk(330, 110, DEPTH.foreground - 3, 1.3, 12, 0.22 * fog, 2.2);
    }

    // Agua: superficie, reflejos y ondas (se dibuja bajo los actores).
    if (water.length) {
      this.waterG = scene.add.graphics().setDepth(DEPTH.ground + 10);
    }

    // Luces que laten en los faroles.
    const gt = glowTexture(scene);
    for (const l of lampPositions) {
      const glow = scene.add
        .image(l.x, l.y - 66 * l.scale, gt)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffc070)
        .setScale(1.6 * l.scale)
        .setDepth(l.y + 0.5);
      const pool = scene.add
        .image(l.x, l.y, gt)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffa850)
        .setScale(2.6 * l.scale, 0.7 * l.scale)
        .setDepth(DEPTH.ground + 20);
      this.lights.push({ glow, pool, ph: rnd() * 6 });
    }

    this.worldG = scene.add.graphics().setDepth(DEPTH.foreground - 2);
    this.screenG = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.foreground - 1);

    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    if (amb.rain) for (let i = 0; i < 110; i++) this.rain.push({ x: rnd() * W, y: rnd() * H, v: 200 + rnd() * 90, ph: rnd(), c: rnd() < 0.5 ? 0x9ab8c8 : 0x6a8898 });
    if (amb.leaves) {
      const cols = [0xc24a1a, 0xe07a2a, 0x6a8a2a, 0xd8a040];
      for (let i = 0; i < 26; i++) this.leaves.push({ x: rnd() * W, y: rnd() * H, v: 8 + rnd() * 10, ph: rnd() * 7, c: cols[i % 4] });
    }
    if (amb.dust) for (let i = 0; i < 80; i++) this.dust.push({ x: rnd() * W, y: rnd() * H, v: 3 + rnd() * 7, ph: rnd() * 7, c: rnd() < 0.5 ? 0xd8d0c8 : 0x9a9aa8 });
    if (amb.fireflies) {
      const n = Math.round(level.width / 55);
      for (let i = 0; i < n; i++) {
        const x = rnd() * level.width;
        const y = 200 + rnd() * 140;
        this.flies.push({ x, y, ph: rnd() * 7, sp: 0.6 + rnd() * 0.8, ax: x, ay: y });
      }
    }

    // Tinte ambiental (multiplica) y viñeta.
    if (amb.tint) {
      scene.add
        .rectangle(0, 0, W, H, hex(amb.tint, 0xffffff))
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(DEPTH.fx)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setAlpha(0.55);
    }
    const dark = Phaser.Math.Clamp(amb.darkness ?? 0.3, 0, 1);
    scene.add
      .image(0, 0, vignetteTexture(scene))
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.fx + 2)
      .setAlpha(0.55 + dark * 0.45);
    if (dark > 0.5) {
      scene.add
        .rectangle(0, 0, W, H, 0x02040a)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(DEPTH.fx + 1)
        .setAlpha((dark - 0.5) * 0.6);
    }
  }

  update(dt: number, camX: number): void {
    this.t += dt;
    const t = this.t;
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const wrap = (v: number) => ((v % W) + W) % W;

    for (const f of this.fogs) {
      f.ts.tilePositionX = (camX * f.par + t * f.speed) / f.ts.tileScaleX;
      f.ts.setAlpha(f.baseA * (0.85 + 0.15 * Math.sin(t * 0.3 + f.ph)));
    }

    for (const l of this.lights) {
      const p = 0.5 + 0.5 * Math.sin(t * 1.7 + l.ph);
      const flick = Math.random() < 0.015 ? 0.5 : 1;
      l.glow.setAlpha((0.35 + 0.3 * p) * flick);
      l.pool.setAlpha((0.18 + 0.14 * p) * flick);
    }

    if (this.waterG) this.drawWater(camX);

    const g = this.screenG;
    g.clear();
    for (const r of this.rain) {
      r.y += r.v * dt;
      r.x -= r.v * 0.18 * dt;
      if (r.y > H) {
        if (Math.random() < 0.35) this.splashes.push({ x: r.x, y: 220 + Math.random() * 130, t: 0.18 });
        r.y = -6;
        r.x = Math.random() * (W + 40);
      }
      g.fillStyle(r.c, 0.4);
      const sx = wrap(r.x - camX * 1.05);
      g.fillRect(sx, r.y, 1, 3);
      g.fillRect(sx - 1, r.y + 3, 1, 2);
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.splashes.splice(i, 1);
        continue;
      }
      g.fillStyle(0xb8d0d8, s.t * 3);
      g.fillRect(s.x - 1, s.y, 1, 1);
      g.fillRect(s.x + 1, s.y, 1, 1);
      g.fillRect(s.x, s.y - 1, 1, 1);
    }
    for (const a of this.dust) {
      a.y += a.v * dt;
      a.x += (-6 + Math.sin(t * 0.8 + a.ph) * 5) * dt;
      if (a.y > H) {
        a.y = -2;
        a.x = Math.random() * W;
      }
      g.fillStyle(a.c, 0.5);
      g.fillRect(Math.round(wrap(a.x - camX * 0.6)), Math.round(a.y), 1, 1);
    }
    for (const l of this.leaves) {
      l.y += l.v * dt;
      l.x += (10 + Math.sin(t * 1.5 + l.ph) * 14) * dt;
      if (l.y > H) {
        l.y = -2;
        l.x = Math.random() * W;
      }
      g.fillStyle(l.c, 1);
      g.fillRect(Math.round(wrap(l.x - camX * 1.1)), Math.round(l.y), Math.sin(t * 5 + l.ph) > 0 ? 2 : 1, 1);
    }
    if (this.level.ambience.embers) {
      if (Math.random() < 0.5 && this.embers.length < 50) {
        this.embers.push({ x: Math.random() * W, y: H + 2, v: 14 + Math.random() * 20, vx: (Math.random() - 0.5) * 8, ph: Math.random() * 6, c: 0, life: 0, L: 3 + Math.random() * 4 });
      }
      for (let i = this.embers.length - 1; i >= 0; i--) {
        const e = this.embers[i];
        e.life += dt;
        if (e.life > e.L) {
          this.embers.splice(i, 1);
          continue;
        }
        e.y -= e.v * dt;
        e.x += (e.vx + Math.sin(t * 3 + e.ph) * 6) * dt;
        g.fillStyle(e.life < e.L * 0.4 ? 0xffd080 : 0xff6a2a, 1 - e.life / e.L);
        g.fillRect(Math.round(wrap(e.x - camX * 0.9)), Math.round(e.y), 1, 1);
      }
    }

    // Luciérnagas (coordenadas del mundo).
    const w = this.worldG;
    w.clear();
    for (const f of this.flies) {
      f.x = f.ax + Math.sin(t * f.sp + f.ph) * 22 + Math.sin(t * f.sp * 2.3) * 6;
      f.y = f.ay + Math.cos(t * f.sp * 0.8 + f.ph) * 10;
      if (f.x < camX - 10 || f.x > camX + W + 10) continue;
      const p = Math.sin(t * 2.2 + f.ph * 3);
      if (p < -0.2) continue;
      w.fillStyle(0xc8ff6a, 0.15 * (p + 0.2));
      w.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3);
      w.fillStyle(0xeaffb0, 0.4 + 0.6 * p);
      w.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
    }
  }

  private drawWater(camX: number): void {
    const g = this.waterG!;
    const t = this.t;
    g.clear();
    for (const o of this.water) {
      if (o.x + o.rx < camX - 20 || o.x - o.rx > camX + GAME_WIDTH + 20) continue;
      g.fillStyle(0x0c1a20, 1);
      g.fillEllipse(o.x, o.y, o.rx * 2, o.ry * 2, 48);
      g.fillStyle(0x16303a, 1);
      g.fillEllipse(o.x, o.y - o.ry * 0.15, o.rx * 1.85, o.ry * 1.5, 48);
      // Reflejo de la luna (sigue la cámara a la velocidad del cielo).
      const mx = camX + 470 - camX * 0.04;
      for (let y = o.y - o.ry + 2; y < o.y + o.ry - 1; y += 1) {
        const k = (y - (o.y - o.ry)) / (2 * o.ry);
        const hw = 2 + k * 8;
        for (let sx = Math.round(mx - hw); sx <= Math.round(mx + hw); sx += 1) {
          const e = ((sx - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2;
          if (e < 0.92 && Math.sin(y * 2.3 + t * 4 + sx * 0.6) > 0.1) {
            g.fillStyle(k < 0.4 ? 0xe8f0d8 : 0x9ab8a8, 0.6 - k * 0.35);
            g.fillRect(sx, y, 1, 1);
          }
        }
      }
      // Ondas que viajan.
      for (let k = 0; k < 10; k++) {
        const y = o.y - o.ry * 0.7 + k * ((o.ry * 1.4) / 10);
        const x = o.x - o.rx * 0.85 + ((t * 7 + k * 61) % (o.rx * 1.7));
        const e1 = ((x - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2;
        const e2 = ((x + 6 - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2;
        if (e1 < 0.9 && e2 < 0.9) {
          g.fillStyle(0x4a7a80, 0.8);
          g.fillRect(Math.round(x), Math.round(y), 5, 1);
        }
      }
      // Orilla.
      g.lineStyle(1, 0x050a0c, 1);
      g.strokeEllipse(o.x, o.y, o.rx * 2, o.ry * 2, 48);
    }
  }
}
