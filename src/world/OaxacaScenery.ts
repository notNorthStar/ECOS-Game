import type Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { DEPTH, GAME_HEIGHT, OAXACA_SECTIONS, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { canvasTexture } from './textures';
import { drawOaxacaLayer, type OaxacaSection } from './OaxacaLandscape';
import { OAXACA_ART, drawOaxacaArt } from './OaxacaArt';
import { installOaxacaDecor } from './OaxacaDecor';

export { OAXACA_LANDMARKS } from './OaxacaLandscape';

// Dueño: escenario (Nivel 4). LevelScene lo llama para oaxaca / callejones / santo_domingo.
// Fondos PNG a 1× (tools/gen-oaxaca-scenery.mjs); el mismo dibujo sirve de respaldo por código.

/** Claves de los NPCs comunes del Nivel 4 (tiras 64×80 × 4 cuadros, pivote 32,78; anim = misma clave). */
export const OAXACA_NPC_KEYS = {
  /** Tejedora en telar de cintura (sentada; huipil, rebozo añil, trenzas). Anima el machete del telar. */
  tejedora: 'npc_artesano_1',
  /** Tejedor de telar de pedal: sombrero, faja tejida, lanzadera y madejas de lana. */
  tejedor: 'npc_artesano_2',
  /** Anciana maestra: trenzas canas con listones, collares de coral, hila con malacate. */
  maestra: 'npc_artesano_3',
  /** Vendedora del mercado con tenate de flores en la cabeza. */
  vendedora: 'npc_poblador_n04_1',
  /** Señor con sarape de rayas, sombrero y bastón. */
  senor: 'npc_poblador_n04_2',
  /** Joven músico de banda de viento con trompeta. */
  musico: 'npc_poblador_n04_3',
  /** Señora con rebozo morado y canasta de pan. */
  panadera: 'npc_poblador_n04_4',
} as const;
export const OAXACA_NPC_LIST: readonly string[] = Object.values(OAXACA_NPC_KEYS);

/** Claves de props del Nivel 4 (clave = nombre del PNG en escenarios/nivel-04-oaxaca/props/). */
export const OAXACA_PROP_KEYS = {
  letras: 'prop_n04_letras_oaxaca',
  telar: 'prop_n04_telar',
  textiles: ['prop_n04_textil_1', 'prop_n04_textil_2', 'prop_n04_textil_3', 'prop_n04_textil_4'],
  puesto: 'prop_n04_puesto', puestoRoto: 'prop_n04_puesto_roto',
  ollas: 'prop_n04_ollas', olla: 'prop_n04_olla', canastas: 'prop_n04_canastas',
  muroPasajeCerrado: 'prop_n04_muro_pasaje_cerrado', muroPasajeAbierto: 'prop_n04_muro_pasaje_abierto',
  agave: 'prop_n04_agave', agaveGrande: 'prop_n04_agave_grande', andamio: 'prop_n04_andamio',
  velas: 'prop_n04_velas', vela: 'prop_n04_vela', retablo: 'prop_n04_retablo', campana: 'prop_n04_campana',
  fragmento: 'prop_n04_fragmento_sello', juguetes: 'prop_n04_juguetes', ropaNinos: 'prop_n04_ropa_ninos',
  farol: 'prop_n04_farol', papelPicado: 'prop_n04_papel_picado', escombros: 'prop_n04_escombros', barricada: 'prop_n04_barricada',
  // Claves que ya usan los JSON del contenido (los muros son alias de muroPasaje*; ropa = ropaNinos).
  cartel: 'prop_n04_cartel', columnaRota: 'prop_n04_columna_rota', estandarte: 'prop_n04_estandarte',
  candelabro: 'prop_n04_candelabro', fachadaTemplo: 'prop_n04_fachada_templo', textilesRack: 'prop_n04_textiles',
  muroCerrado: 'prop_n04_muro_cerrado', muroAbierto: 'prop_n04_muro_abierto', ropa: 'prop_n04_ropa',
} as const;

/**
 * Posiciones sugeridas (el director/JSON manda). Los artesanos quedan delante de la fachada del
 * taller pintada en la capa 3 (x ≈ 1500 de `oaxaca`), sin tapar el centro de la franja.
 */
export const OAXACA_NPC_SPOTS: ReadonlyArray<{ id: string; key: string; x: number; y: number; flipX?: boolean }> = [
  { id: 'artesano_tejedora', key: OAXACA_NPC_KEYS.tejedora, x: 1400, y: 238 },
  { id: 'artesano_tejedor', key: OAXACA_NPC_KEYS.tejedor, x: 1530, y: 236 },
  { id: 'artesano_maestra', key: OAXACA_NPC_KEYS.maestra, x: 1640, y: 240, flipX: true },
  { id: 'poblador_senor', key: OAXACA_NPC_KEYS.senor, x: 560, y: 250, flipX: true },
  { id: 'poblador_vendedora', key: OAXACA_NPC_KEYS.vendedora, x: 2300, y: 246 },
];

/**
 * Coloca un NPC común (o cualquier tira del catálogo) con pivote en los pies, profundidad = y y su
 * animación de reposo. Lo encuentra después `scene.children.getByName(id)`.
 */
export function addOaxacaNpc(world: WorldApi, key: string, x: number, y: number, opts: { id?: string; flipX?: boolean } = {}): Phaser.GameObjects.Sprite {
  const { scene } = world;
  ensureOaxacaTextures(scene);
  const spec = OAXACA_ART.find(s => s.key === key);
  const s = scene.add.sprite(x, y, key).setOrigin(0.5, spec ? spec.feetY / spec.h : 78 / 80).setDepth(y);
  if (opts.flipX) s.setFlipX(true);
  if (opts.id) s.setName(opts.id);
  if (scene.anims.exists(key)) s.play({ key, randomFrame: true });
  return s;
}

/** Registra por código cualquier textura del catálogo que falte en el manifiesto (respaldo). */
export function ensureOaxacaTextures(scene: Phaser.Scene): void {
  for (const spec of OAXACA_ART) {
    if (scene.textures.exists(spec.key)) continue;
    const tex = canvasTexture(scene, spec.key, spec.w * spec.frames, spec.h, ctx => {
      for (let f = 0; f < spec.frames; f++) drawOaxacaArt(spec, f).blit(ctx, f * spec.w, 0);
    });
    const t = scene.textures.get(tex);
    for (let f = 0; f < spec.frames; f++) t.add(f, 0, f * spec.w, 0, spec.w, spec.h);
    if (spec.frames > 1 && !scene.anims.exists(spec.key)) {
      scene.anims.create({ key: spec.key, frames: scene.anims.generateFrameNumbers(spec.key, { start: 0, end: spec.frames - 1 }), frameRate: spec.fps ?? 4, repeat: -1 });
    }
  }
}

export function installOaxacaScenery(world: WorldApi): void {
  const { scene, level } = world;
  const section = (OAXACA_SECTIONS as readonly string[]).includes(level.id) ? level.id as OaxacaSection : 'oaxaca';
  ensureOaxacaTextures(scene);
  // Solo retira los respaldos genéricos de World; las imágenes del manifiesto (equipo o PNG propios) mandan.
  for (const child of [...scene.children.list]) {
    const image = child as typeof child & { texture?: { key: string } };
    if (image.texture?.key.startsWith('__mundo_capa')) child.destroy();
  }
  PARALLAX_FACTORS.forEach((factor, index) => {
    if (scene.textures.exists(`${level.background}_capa${index}`)) return;
    const width = layerWidth(level.width, factor);
    const key = canvasTexture(scene, `__oaxaca_${section}_capa${index}_${width}`, width, GAME_HEIGHT, (ctx, w, h) => {
      drawOaxacaLayer(section, index, w, h).blit(ctx);
    });
    scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(factor, 0)
      .setDepth(index < 4 ? DEPTH.background + index : index === 4 ? DEPTH.ground : DEPTH.foreground);
  });
  installOaxacaDecor(world, section);
}
