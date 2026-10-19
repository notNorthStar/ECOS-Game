import type { WorldApi } from '../core/contracts';
import { DEPTH, GAME_HEIGHT, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { canvasTexture } from './textures';
import { drawTuxtlaLandscape } from './TuxtlaLandscape';
import { drawTuxtlaGround, drawTuxtlaForeground } from './TuxtlaTerrain';
import { installTuxtlaDecor } from './TuxtlaDecor';

/** Fondos PNG a 1×; el mismo dibujo sirve de respaldo si se retira una capa del manifiesto. */
export function installTuxtlaScenery(world: WorldApi): void {
  const { scene, level } = world;
  // Solo retira los respaldos genéricos de World. Las imágenes del equipo conservan prioridad.
  for (const child of [...scene.children.list]) {
    const image = child as typeof child & { texture?: { key: string } };
    if (image.texture?.key.startsWith('__mundo_capa')) child.destroy();
  }
  PARALLAX_FACTORS.forEach((factor, index) => {
    if (scene.textures.exists(`${level.background}_capa${index}`)) return;
    const width = layerWidth(level.width, factor);
    const key = canvasTexture(scene, `__tuxtla_v2_capa${index}_${width}`, width, GAME_HEIGHT, (ctx, w, h) => {
      if (index < 4) drawTuxtlaLandscape(ctx, w, h, index);
      else if (index === 4) drawTuxtlaGround(ctx, w, h);
      else drawTuxtlaForeground(ctx, w);
    });
    scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(factor, 0)
      .setDepth(index < 4 ? DEPTH.background + index : index === 4 ? DEPTH.ground : DEPTH.foreground);
  });
  installTuxtlaDecor(world);
}
