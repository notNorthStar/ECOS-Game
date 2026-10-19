import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { GameState } from '../core/GameState';
import { DEPTH, GAME_WIDTH, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { fogTexture, glowTexture } from './textures';
import { catemacoLayerLights, type CatemacoLight, type CatemacoSection } from './CatemacoLandscape';
import { catemacoGroundMarks } from './CatemacoTerrain';

/**
 * Decorado animado del Nivel 3: halos que laten en faroles y antorchas pintados en la capa 3,
 * destellos de luna en la laguna, neblina baja teñida por sección, luciérnagas o motas enfermizas,
 * brillo de los círculos rituales y luz/animación de los props del nivel (antorchas, braseros, altar).
 * Todo respeta GameState.settings.reduceFx (sin parpadeos ni partículas, halos quietos) y world.timeScale.
 * No añade colisiones.
 */

const LIGHT: Record<CatemacoLight['kind'], { tint: number; scale: number; alpha: number; flicker: number }> = {
  ventana: { tint: 0xf2a640, scale: 0.32, alpha: 0.22, flicker: 0.4 },
  farol: { tint: 0xffd77a, scale: 0.62, alpha: 0.38, flicker: 1 },
  antorcha: { tint: 0xff5040, scale: 0.8, alpha: 0.42, flicker: 5 },
  brasa: { tint: 0xff5040, scale: 0.7, alpha: 0.4, flicker: 4 },
};

/** Luz y animación automática de props del nivel (por clave de textura). */
const PROP_GLOW: Record<string, { dy: number; tint: number; scale: number; alpha: number; flicker: number }> = {
  prop_n03_antorcha: { dy: -50, tint: 0xff5040, scale: 0.9, alpha: 0.45, flicker: 6 },
  prop_n03_brasero: { dy: -26, tint: 0xff5040, scale: 1.1, alpha: 0.45, flicker: 5 },
  prop_n03_altar_brujos: { dy: -30, tint: 0xffd77a, scale: 1.0, alpha: 0.35, flicker: 3 },
  prop_n03_lona: { dy: -18, tint: 0xc02030, scale: 0.8, alpha: 0.3, flicker: 2 },
  prop_n03_lona_chica: { dy: -12, tint: 0xc02030, scale: 0.6, alpha: 0.28, flicker: 2 },
  prop_n03_letras_catemaco: { dy: -18, tint: 0xf2a640, scale: 1.4, alpha: 0.14, flicker: 0.5 },
};

interface Pulse { img: Phaser.GameObjects.Image; base: number; ph: number; flicker: number }
interface Mote { img: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number; ax: number; ay: number }

const pxTexture = (scene: Phaser.Scene): string => {
  if (!scene.textures.exists('px')) {
    const t = scene.textures.createCanvas('px', 1, 1);
    if (t) { t.getContext().fillStyle = '#ffffff'; t.getContext().fillRect(0, 0, 1, 1); t.refresh(); }
  }
  return 'px';
};

export function installCatemacoDecor(world: WorldApi, section: CatemacoSection): void {
  const { scene, level } = world;
  const glow = glowTexture(scene);
  const px = pxTexture(scene);
  const rnd = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const pulses: Pulse[] = [];

  // Halos de las luces pintadas en la capa 3 (mismo factor de parallax que la capa).
  const f3 = PARALLAX_FACTORS[3];
  catemacoLayerLights(section, layerWidth(level.width, f3)).forEach((l, i) => {
    const c = LIGHT[l.kind];
    const img = scene.add.image(l.x, l.y, glow).setScrollFactor(f3, 0).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(c.tint).setScale(c.scale).setAlpha(c.alpha).setDepth(DEPTH.background + 3.6);
    pulses.push({ img, base: c.alpha, ph: rnd(i) * 7, flicker: c.flicker });
  });

  // Props del nivel: animación de reposo automática (cuadro inicial aleatorio) y luz cálida o roja.
  const npcOriginY = 78 / 80;
  for (const child of [...scene.children.list]) {
    const s = child as Phaser.GameObjects.Sprite;
    const key = s.texture?.key;
    if (!key || !(s instanceof Phaser.GameObjects.Sprite)) continue;
    if (key.startsWith('npc_brujo_') || key.startsWith('npc_poblador_n03_')) s.setOrigin(0.5, npcOriginY);
    if ((key.startsWith('prop_n03_') || key.startsWith('npc_')) && scene.anims.exists(key) && !s.anims.isPlaying) {
      s.play({ key, randomFrame: true });
    }
    const g = PROP_GLOW[key];
    if (g) {
      const img = scene.add.image(s.x, s.y + g.dy * s.scaleY, glow).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(g.tint).setScale(g.scale * s.scaleX).setAlpha(g.alpha).setDepth(s.depth + 0.5);
      pulses.push({ img, base: g.alpha, ph: rnd(s.x) * 7, flicker: g.flicker });
      // Charco de luz en el suelo.
      const pool = scene.add.image(s.x, s.y, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(g.tint)
        .setScale(g.scale * 2.2, g.scale * 0.55).setAlpha(g.alpha * 0.6).setDepth(DEPTH.ground + 20);
      pulses.push({ img: pool, base: g.alpha * 0.6, ph: rnd(s.x + 1) * 7, flicker: g.flicker });
    }
  }

  // Círculos rituales pintados en el suelo: brillo que respira.
  for (const m of catemacoGroundMarks(section, level.width)) {
    const tint = m.kind === 'ritual' ? 0xc02030 : 0x9a3ae0;
    const img = scene.add.image(m.x, m.y, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(tint)
      .setScale(5, 1.3).setAlpha(0.22).setDepth(DEPTH.ground + 15);
    pulses.push({ img, base: 0.22, ph: 0, flicker: 0.6 });
  }

  // Destellos de luna sobre la laguna lejana (capa 1).
  const glints: Array<{ img: Phaser.GameObjects.Image; ph: number; sp: number }> = [];
  if (section !== 'altar_olmeca') {
    const f1 = PARALLAX_FACTORS[1], w1 = layerWidth(level.width, f1);
    const y0 = section === 'catemaco' ? 184 : 182;
    for (let i = 0; i < 46; i++) {
      const img = scene.add.image(rnd(i + 50) * w1, y0 + rnd(i + 90) * 20, px).setOrigin(0, 0.5)
        .setScrollFactor(f1, 0).setScale(2 + Math.floor(rnd(i + 7) * 5), 1)
        .setTint(rnd(i + 3) > 0.7 ? 0xc8dccc : 0x8aa4a8).setDepth(DEPTH.background + 1.5);
      glints.push({ img, ph: rnd(i + 11) * 7, sp: 1.2 + rnd(i + 13) * 2 });
    }
  }

  // Neblina baja teñida por sección, pegada al fondo de la franja (debajo de los actores).
  const fogTint = section === 'catemaco' ? 0x77a08a : section === 'campamento' ? 0xa8c4a8 : 0x9a3ae0;
  const fogAlpha = section === 'campamento' ? 0.3 : section === 'catemaco' ? 0.18 : 0.2;
  const mist = scene.add.tileSprite(0, 214, GAME_WIDTH, 52, fogTexture(scene)).setOrigin(0, 0.5).setScrollFactor(0)
    .setDepth(DEPTH.ground + 5).setTint(fogTint).setTileScale(1.8, 0.8).setAlpha(fogAlpha);
  let mist2: Phaser.GameObjects.TileSprite | null = null;
  if (section === 'altar_olmeca') {
    mist2 = scene.add.tileSprite(0, 236, GAME_WIDTH, 40, fogTexture(scene)).setOrigin(0, 0.5).setScrollFactor(0)
      .setDepth(DEPTH.ground + 6).setTint(0x5a8a46).setTileScale(1.3, 0.7).setAlpha(0.12);
  }

  // Motas: luciérnagas cálidas en el pueblo, chispas en el campamento, motas enfermizas en el altar.
  const motes: Mote[] = [];
  const count = section === 'altar_olmeca' ? Math.round(level.width / 70) : Math.round(level.width / 140);
  const colors = section === 'altar_olmeca' ? [0x9ab85a, 0xd89aff, 0x8aff6a] : section === 'campamento' ? [0xff5040, 0xf2a640] : [0xffd77a, 0x9ab85a];
  for (let i = 0; i < count; i++) {
    const x = rnd(i + 200) * level.width, y = 170 + rnd(i + 300) * 160;
    const img = scene.add.image(x, y, px).setTint(colors[i % colors.length]).setDepth(DEPTH.foreground - 5);
    if (i % 4 === 0) img.setScale(2, 1);
    motes.push({ img, x, y, ph: rnd(i + 400) * 7, sp: 0.5 + rnd(i + 500) * 0.9, ax: x, ay: y });
  }

  let t = 0;
  const update = (_time: number, delta: number) => {
    const dt = Math.min(delta, 50) / 1000 * world.timeScale;
    t += dt;
    const reduced = GameState.settings.reduceFx;
    for (const p of pulses) {
      const wobble = reduced ? 0 : Math.sin(t * (1.2 + p.flicker) + p.ph) * 0.08 + (p.flicker > 3 ? Math.sin(t * 17 + p.ph * 3) * 0.06 : 0);
      p.img.setAlpha(Math.max(0, p.base * (1 + wobble * 2)));
    }
    for (const g of glints) g.img.setVisible(!reduced && Math.sin(t * g.sp + g.ph) > 0.35);
    const camX = scene.cameras.main.scrollX;
    mist.tilePositionX = camX * 0.9 / 1.8 + (reduced ? 0 : t * 6);
    if (mist2) mist2.tilePositionX = camX / 1.3 - (reduced ? 0 : t * 4);
    for (const m of motes) {
      m.img.setVisible(!reduced);
      if (reduced) continue;
      if (section === 'campamento') {
        // Chispas que suben y reaparecen abajo.
        m.y -= dt * 14 * m.sp;
        if (m.y < 150) m.y = 330;
        m.img.setPosition(m.ax + Math.sin(t * 2 + m.ph) * 6, m.y);
      } else {
        m.img.setPosition(m.ax + Math.sin(t * 0.6 * m.sp + m.ph) * 18, m.ay + Math.sin(t * 0.9 * m.sp + m.ph * 2) * 10);
      }
      m.img.setAlpha(0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 * m.sp + m.ph)));
    }
  };
  update(0, 0);
  scene.events.on('update', update);
  scene.events.once('shutdown', () => scene.events.off('update', update));
}
