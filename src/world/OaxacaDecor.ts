import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { GameState } from '../core/GameState';
import { bus } from '../core/bus';
import { DEPTH, GAME_WIDTH, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { fogTexture, glowTexture } from './textures';
import { oaxacaLayerFeatures, type OaxacaLight, type OaxacaSection } from './OaxacaLandscape';
import { oaxacaGroundMarks } from './OaxacaTerrain';

/**
 * Decorado animado del Nivel 4: halos que laten en faroles, ventanas y velas pintados en la capa 3,
 * papel picado que se mece en los cables, polvo que flota en las calles, brasas de fuego fatuo
 * verde-azulado cerca del templo, neblina baja teñida por sección y luz de los props del nivel.
 * Respeta GameState.settings.reduceFx (todo quieto, sin partículas) y world.timeScale.
 * No añade colisiones. Al recibir `pasaje:revealed`, el muro-pasaje cerrado pasa a abierto.
 */

const LIGHT: Record<OaxacaLight['kind'], { tint: number; scale: number; alpha: number; flicker: number }> = {
  ventana: { tint: 0xf2a640, scale: 0.34, alpha: 0.22, flicker: 0.4 },
  farol: { tint: 0xffd77a, scale: 0.62, alpha: 0.36, flicker: 1 },
  vela: { tint: 0xf2a640, scale: 0.55, alpha: 0.32, flicker: 5 },
  fuego: { tint: 0xd0742c, scale: 0.8, alpha: 0.4, flicker: 5 },
  fatuo: { tint: 0x2ad0c0, scale: 0.7, alpha: 0.3, flicker: 3 },
  oro: { tint: 0xf2a640, scale: 1.5, alpha: 0.16, flicker: 1.5 },
};

/** Luz automática de props del nivel (por clave de textura). */
const PROP_GLOW: Record<string, { dy: number; tint: number; scale: number; alpha: number; flicker: number }> = {
  prop_n04_velas: { dy: -14, tint: 0xf2a640, scale: 0.8, alpha: 0.42, flicker: 5 },
  prop_n04_vela: { dy: -10, tint: 0xf2a640, scale: 0.45, alpha: 0.4, flicker: 6 },
  prop_n04_farol: { dy: -60, tint: 0xffd77a, scale: 0.8, alpha: 0.4, flicker: 1.2 },
  prop_n04_retablo: { dy: -60, tint: 0xf2a640, scale: 1.8, alpha: 0.16, flicker: 2 },
  prop_n04_fragmento_sello: { dy: -10, tint: 0x2ad0c0, scale: 0.7, alpha: 0.5, flicker: 2 },
  prop_n04_muro_pasaje_abierto: { dy: -60, tint: 0x2ad0c0, scale: 1.2, alpha: 0.35, flicker: 1.5 },
  prop_n04_muro_abierto: { dy: -60, tint: 0x2ad0c0, scale: 1.2, alpha: 0.35, flicker: 1.5 },
  prop_n04_candelabro: { dy: -64, tint: 0xf2a640, scale: 0.8, alpha: 0.38, flicker: 5 },
  prop_n04_letras_oaxaca: { dy: -18, tint: 0xf2a640, scale: 1.3, alpha: 0.12, flicker: 0.5 },
};

/** Muro cerrado → abierto al revelarse el pasaje (los dos juegos de claves). */
const PASAJE: Record<string, string> = {
  prop_n04_muro_pasaje_cerrado: 'prop_n04_muro_pasaje_abierto',
  prop_n04_muro_cerrado: 'prop_n04_muro_abierto',
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

export function installOaxacaDecor(world: WorldApi, section: OaxacaSection): void {
  const { scene, level } = world;
  const glow = glowTexture(scene);
  const px = pxTexture(scene);
  const rnd = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const pulses: Pulse[] = [];
  const addGlow = (x: number, y: number, c: { tint: number; scale: number; alpha: number; flicker: number }, depth: number, ph: number, scroll = 1): Phaser.GameObjects.Image => {
    const img = scene.add.image(x, y, glow).setScrollFactor(scroll, scroll === 1 ? 1 : 0).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(c.tint).setScale(c.scale).setAlpha(c.alpha).setDepth(depth);
    pulses.push({ img, base: c.alpha, ph, flicker: c.flicker });
    return img;
  };

  // Halos de las luces pintadas en la capa 3 y papel picado animado en sus cables.
  const f3 = PARALLAX_FACTORS[3];
  const { lights, cables } = oaxacaLayerFeatures(section, layerWidth(level.width, f3));
  lights.forEach((l, i) => addGlow(l.x, l.y, LIGHT[l.kind], DEPTH.background + 3.6, rnd(i) * 7, f3));

  const papel: Array<{ s: Phaser.GameObjects.Image; ph: number; sp: number }> = [];
  const hasPapel = scene.textures.exists('prop_n04_papel_picado') && scene.textures.get('prop_n04_papel_picado').frameTotal > 4;
  if (hasPapel) {
    cables.forEach((c, i) => {
      // Tiras de 128 px colgadas a lo largo del cable (siguen su comba aproximada).
      for (let x = c.x0; x + 128 <= c.x1 + 20; x += 128) {
        const t = (x + 64 - c.x0) / Math.max(1, c.x1 - c.x0);
        const s = scene.add.image(x, c.y + Math.sin(Math.min(1, t) * Math.PI) * c.sag - 4, 'prop_n04_papel_picado', 0)
          .setOrigin(0, 0).setScrollFactor(f3, 0).setDepth(DEPTH.background + 3.7);
        papel.push({ s, ph: rnd(i * 7 + x) * 4, sp: 2.5 + rnd(x + i) * 2 });
      }
    });
  }

  // Props del nivel: luz, NPCs con pivote correcto y animaciones con la escala de tiempo del mundo.
  const npcOriginY = 78 / 80;
  const animated: Phaser.GameObjects.Sprite[] = [];
  const glowFor = (s: Phaser.GameObjects.Sprite, key: string) => {
    const g = PROP_GLOW[key];
    if (!g) return;
    addGlow(s.x, s.y + g.dy * s.scaleY, { ...g, scale: g.scale * s.scaleX }, s.depth + 0.5, rnd(s.x) * 7);
    const pool = addGlow(s.x, s.y, { ...g, alpha: g.alpha * 0.6 }, DEPTH.ground + 20, rnd(s.x + 1) * 7);
    pool.setScale(g.scale * 2.2 * s.scaleX, g.scale * 0.55 * s.scaleY);
  };
  for (const child of [...scene.children.list]) {
    if (!(child instanceof Phaser.GameObjects.Sprite)) continue;
    const key = child.texture?.key;
    if (!key) continue;
    if (key.startsWith('npc_artesano_') || key.startsWith('npc_poblador_n04_')) child.setOrigin(0.5, npcOriginY);
    if ((key.startsWith('prop_n04_') || key.startsWith('npc_')) && scene.anims.exists(key) && !child.anims.isPlaying) child.play({ key, randomFrame: true });
    if (child.anims.isPlaying || key.startsWith('prop_n04_')) animated.push(child);
    glowFor(child, key);
  }

  // El pasaje oculto se abre al purificar a las bestias (evento del contenido).
  bus.scoped(scene, 'pasaje:revealed', () => {
    for (const child of [...scene.children.list]) {
      if (!(child instanceof Phaser.GameObjects.Sprite)) continue;
      const open = PASAJE[child.texture?.key ?? ''];
      if (!open || !scene.textures.exists(open)) continue;
      child.setTexture(open);
      if (scene.anims.exists(open)) child.play(open);
      glowFor(child, open);
      if (!GameState.settings.reduceFx) world.flash(0x2ad0c0, 300);
    }
  });

  // Marcas del suelo: círculo de fuego fatuo de la arena y luz del zaguán del taller.
  for (const m of oaxacaGroundMarks(section)) {
    const fat = m.kind === 'fatuo';
    const img = addGlow(m.x, m.y, { tint: fat ? 0x2ad0c0 : 0xf2a640, scale: 1, alpha: fat ? 0.24 : 0.16, flicker: fat ? 1.2 : 0.5 }, DEPTH.ground + 15, 0);
    img.setScale(fat ? 5 : 3, fat ? 1.3 : 0.6);
  }

  // Neblina baja teñida: polvo cálido en la ciudad, añil en los callejones, verde-azul en el templo.
  const fogTint = section === 'oaxaca' ? 0xc46a40 : section === 'callejones' ? 0x77a08a : 0x2ad0c0;
  const fogAlpha = section === 'oaxaca' ? 0.12 : section === 'callejones' ? 0.16 : 0.14;
  const mist = scene.add.tileSprite(0, 216, GAME_WIDTH, 52, fogTexture(scene)).setOrigin(0, 0.5).setScrollFactor(0)
    .setDepth(DEPTH.ground + 5).setTint(fogTint).setTileScale(1.8, 0.8).setAlpha(fogAlpha);

  // Motas: polvo que flota (ciudad y callejones) y brasas de fuego fatuo que suben (templo).
  const fatuo = section === 'santo_domingo';
  const motes: Mote[] = [];
  const count = Math.round(level.width / (fatuo ? 60 : 110));
  const colors = fatuo ? [0x2ad0c0, 0x9af8e8, 0x8aff6a, 0x128a8a] : section === 'callejones' ? [0xb3ab9c, 0x8a857e, 0xf2a640] : [0xb88a52, 0xb3ab9c, 0xffd77a];
  const fatuoFrom = fatuo ? 600 : 0;
  for (let i = 0; i < count; i++) {
    const x = fatuoFrom + rnd(i + 200) * (level.width - fatuoFrom), y = 170 + rnd(i + 300) * 160;
    const img = scene.add.image(x, y, px).setTint(colors[i % colors.length]).setDepth(DEPTH.foreground - 5);
    if (fatuo && i % 3 === 0) img.setScale(2, 2);
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
    for (const s of animated) if (s.active && s.anims) s.anims.timeScale = world.timeScale;
    for (const p of papel) p.s.setFrame(reduced ? 0 : Math.floor(t * p.sp + p.ph) % 4);
    const camX = scene.cameras.main.scrollX;
    mist.tilePositionX = camX * 0.9 / 1.8 + (reduced ? 0 : t * 5);
    for (const m of motes) {
      m.img.setVisible(!reduced);
      if (reduced) continue;
      if (fatuo) {
        // Brasas de fuego fatuo: suben ondulando y reaparecen abajo.
        m.y -= dt * 12 * m.sp;
        if (m.y < 140) m.y = 335;
        m.img.setPosition(m.ax + Math.sin(t * 1.6 * m.sp + m.ph) * 9, m.y);
        m.img.setAlpha(0.3 + 0.7 * Math.max(0, Math.sin(t * 3 * m.sp + m.ph)));
      } else {
        // Polvo: deriva lenta con el viento.
        m.ax += dt * 6 * m.sp;
        if (m.ax > m.x + 120) m.ax = m.x - 40;
        m.img.setPosition(m.ax, m.ay + Math.sin(t * 0.7 * m.sp + m.ph) * 6);
        m.img.setAlpha(0.25 + 0.4 * Math.max(0, Math.sin(t * 1.3 * m.sp + m.ph)));
      }
    }
  };
  update(0, 0);
  scene.events.on('update', update);
  scene.events.once('shutdown', () => scene.events.off('update', update));
}
