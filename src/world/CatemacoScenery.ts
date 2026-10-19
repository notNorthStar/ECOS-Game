import type Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { DEPTH, GAME_HEIGHT, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { canvasTexture } from './textures';
import { drawCatemacoLayer, type CatemacoSection } from './CatemacoLandscape';
import { CATEMACO_ART, drawCatemacoArt } from './CatemacoArt';
import { installCatemacoDecor } from './CatemacoDecor';

// Dueño: escenario (Nivel 3). LevelScene lo llama para catemaco / campamento / altar_olmeca.
// Fondos PNG a 1× (tools/gen-catemaco-scenery.mjs); el mismo dibujo sirve de respaldo por código.

const SECTIONS: readonly CatemacoSection[] = ['catemaco', 'campamento', 'altar_olmeca'];

/** Claves de los NPCs comunes del Nivel 3 (tiras 64×80 × 4 cuadros, pivote 32,78; anim = misma clave). */
export const CATEMACO_NPC_KEYS = {
  /** Brujo anciano: sombrero de palma, bastón, ramo de albahaca. */
  brujo_anciano: 'npc_brujo_1',
  /** Bruja: rebozo rosa, trenza, veladora encendida. */
  bruja: 'npc_brujo_2',
  /** Brujo del copal: paliacate rojo, sahumador humeante. */
  brujo_copal: 'npc_brujo_3',
  /** Pescador con atarraya y pescado. */
  pescador: 'npc_poblador_n03_1',
  /** Señora con rebozo azul y farol de mano. */
  senora: 'npc_poblador_n03_2',
} as const;

/**
 * Posiciones sugeridas para la sección `catemaco` (el director/JSON manda; esto es solo una guía que
 * coincide con la calle de las casas "LIMPIAS" del fondo y deja libre el centro de la franja).
 */
export const CATEMACO_NPC_SPOTS: ReadonlyArray<{ id: string; key: string; x: number; y: number; flipX?: boolean }> = [
  { id: 'brujo_luz', key: CATEMACO_NPC_KEYS.brujo_anciano, x: 860, y: 236 },
  { id: 'brujo_sol', key: CATEMACO_NPC_KEYS.brujo_copal, x: 1010, y: 240, flipX: true },
  { id: 'bruja_escudo', key: CATEMACO_NPC_KEYS.bruja, x: 1160, y: 236 },
  { id: 'poblador_pescador', key: CATEMACO_NPC_KEYS.pescador, x: 1960, y: 250 },
  { id: 'poblador_senora', key: CATEMACO_NPC_KEYS.senora, x: 520, y: 248, flipX: true },
];

/**
 * Coloca un NPC común (o cualquier tira del catálogo) con pivote en los pies, profundidad = y y su
 * animación de reposo. Lo encuentra después `scene.children.getByName(id)`.
 */
export function addCatemacoNpc(world: WorldApi, key: string, x: number, y: number, opts: { id?: string; flipX?: boolean } = {}): Phaser.GameObjects.Sprite {
  const { scene } = world;
  ensureCatemacoTextures(scene);
  const spec = CATEMACO_ART.find(s => s.key === key);
  const s = scene.add.sprite(x, y, key).setOrigin(0.5, spec ? spec.feetY / spec.h : 78 / 80).setDepth(y);
  if (opts.flipX) s.setFlipX(true);
  if (opts.id) s.setName(opts.id);
  if (scene.anims.exists(key)) s.play({ key, randomFrame: true });
  return s;
}

/** Registra por código cualquier textura del catálogo que falte en el manifiesto (respaldo). */
export function ensureCatemacoTextures(scene: Phaser.Scene): void {
  for (const spec of CATEMACO_ART) {
    if (scene.textures.exists(spec.key)) continue;
    const tex = canvasTexture(scene, spec.key, spec.w * spec.frames, spec.h, ctx => {
      for (let f = 0; f < spec.frames; f++) drawCatemacoArt(spec, f).blit(ctx, f * spec.w, 0);
    });
    const t = scene.textures.get(tex);
    for (let f = 0; f < spec.frames; f++) t.add(f, 0, f * spec.w, 0, spec.w, spec.h);
    if (spec.frames > 1 && !scene.anims.exists(spec.key)) {
      scene.anims.create({ key: spec.key, frames: scene.anims.generateFrameNumbers(spec.key, { start: 0, end: spec.frames - 1 }), frameRate: spec.fps ?? 4, repeat: -1 });
    }
  }
}

export function installCatemacoScenery(world: WorldApi): void {
  const { scene, level } = world;
  const section = SECTIONS.find(s => s === level.id) ?? 'catemaco';
  ensureCatemacoTextures(scene);
  // Solo retira los respaldos genéricos de World; las imágenes del manifiesto (equipo o PNG propios) mandan.
  for (const child of [...scene.children.list]) {
    const image = child as typeof child & { texture?: { key: string } };
    if (image.texture?.key.startsWith('__mundo_capa')) child.destroy();
  }
  PARALLAX_FACTORS.forEach((factor, index) => {
    if (scene.textures.exists(`${level.background}_capa${index}`)) return;
    const width = layerWidth(level.width, factor);
    const key = canvasTexture(scene, `__catemaco_${section}_capa${index}_${width}`, width, GAME_HEIGHT, (ctx, w, h) => {
      drawCatemacoLayer(section, index, w, h).blit(ctx);
    });
    scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(factor, 0)
      .setDepth(index < 4 ? DEPTH.background + index : index === 4 ? DEPTH.ground : DEPTH.foreground);
  });
  installCatemacoDecor(world, section);
}
