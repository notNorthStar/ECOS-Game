import type Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { CDMX_SECTIONS, DEPTH, GAME_HEIGHT, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { canvasTexture } from './textures';
import { drawCdmxLayer, type CdmxSection } from './CdmxLandscape';
import { CDMX_ART, drawCdmxArt } from './CdmxArt';
import { installCdmxDecor } from './CdmxDecor';

export { CDMX_LANDMARKS } from './CdmxLandscape';

// Dueño: escenario (Nivel 6). LevelScene lo llama para xochimilco / avenidas / reforma.
// Fondos PNG a 1× (tools/gen-cdmx-scenery.mjs); el mismo dibujo sirve de respaldo por código.

/**
 * NPCs comunes del Nivel 6 (tiras 64×80 × 4 cuadros, pivote 32,78; anim = misma clave).
 * Cualquiera puede servir de disfraz de un nahual (`disguise`): todos se ven normales.
 */
export const CDMX_NPC_KEYS = {
  /** Señora con rebozo gris-azul y una veladora encendida en las manos. */
  senora: 'npc_sobreviviente_1',
  /** Vendedor de pan de muerto con charola sobre la cabeza, gorra y mandil. */
  panadero: 'npc_sobreviviente_2',
  /** Joven con chamarra, gorro tejido, mochila y lámpara de mano (parpadea). */
  joven: 'npc_sobreviviente_3',
  /** Anciano con sombrero de fieltro, bufanda roja y bastón. */
  anciano: 'npc_sobreviviente_4',
  /** Cronista con lentes, chalina turquesa, morral y libreta (escribe). */
  cronista: 'npc_sobreviviente_5',
} as const;
export const CDMX_NPC_LIST: readonly string[] = Object.values(CDMX_NPC_KEYS);

/** Claves de props del Nivel 6 (clave = nombre del PNG en escenarios/nivel-06-cdmx/props/). */
export const CDMX_PROP_KEYS = {
  ofrendaGrande: 'prop_n06_ofrenda_grande',
  /** Variante para aprender DESCANSO (aura de las almas, lucecitas que suben). */
  ofrendaDescanso: 'prop_n06_ofrenda_descanso',
  ofrendaChica: 'prop_n06_ofrenda_chica',
  /** Ofrenda flotante varada con brasero (FUEGO). */
  ofrendaFlotante: 'prop_n06_ofrenda_flotante',
  /** Brasero de piedra con fuego (FUEGO, alternativa). */
  brasero: 'prop_n06_brasero',
  /** Estela con glifos que laten (VERDAD). */
  inscripcion: 'prop_n06_inscripcion',
  trajinera: 'prop_n06_trajinera', ahuejote: 'prop_n06_ahuejote',
  /** Árbol con muñecas viejas: decoración, NO la enemiga. */
  arbolMunecas: 'prop_n06_arbol_munecas',
  papelPicado: 'prop_n06_papel_picado', cempasuchil: 'prop_n06_cempasuchil', maceta: 'prop_n06_maceta_cempasuchil',
  calaverita: 'prop_n06_calaverita', calaveritas: 'prop_n06_calaveritas', veladoras: 'prop_n06_veladoras',
  auto: 'prop_n06_auto', auto2: 'prop_n06_auto_2', taxi: 'prop_n06_taxi', posteNeon: 'prop_n06_poste_neon',
  escombros: 'prop_n06_escombros', escombrosGrandes: 'prop_n06_escombros_grandes',
  /** Plataformas para el doble salto (ver CDMX_HIGH_PROPS para la altura sugerida). */
  cornisa: 'prop_n06_cornisa', losaAlta: 'prop_n06_losa_alta', viga: 'prop_n06_viga',
  /** El Ángel caído en dos piezas: tambores de la columna y la figura dorada. */
  angelColumna: 'prop_n06_angel_columna', angelFigura: 'prop_n06_angel_figura',
  letras: 'prop_n06_letras_cdmx', estacion: 'prop_n06_estacion_teleferico', cabina: 'prop_n06_cabina',
} as const;

/**
 * Props que se ven como plataformas altas (zonas opcionales del doble salto). `height` sugerido para
 * el obstáculo del JSON (altura visual del frente) y el semieje de la elipse/rectángulo en el suelo.
 */
export const CDMX_HIGH_PROPS: Readonly<Record<string, { height: number; rx: number; ry: number }>> = {
  prop_n06_cornisa: { height: 32, rx: 42, ry: 10 },
  prop_n06_losa_alta: { height: 34, rx: 46, ry: 10 },
  prop_n06_viga: { height: 36, rx: 54, ry: 12 },
  prop_n06_escombros_grandes: { height: 30, rx: 48, ry: 12 },
};

/** Posiciones sugeridas de NPCs (el director/JSON manda). */
export const CDMX_NPC_SPOTS: Readonly<Record<CdmxSection, ReadonlyArray<{ id: string; key: string; x: number; y: number; flipX?: boolean }>>> = {
  xochimilco: [
    { id: 'n06_anciano_embarcadero', key: CDMX_NPC_KEYS.anciano, x: 430, y: 240 },
  ],
  avenidas: [
    { id: 'n06_cronista', key: CDMX_NPC_KEYS.cronista, x: 990, y: 242 },
    { id: 'n06_senora_ofrenda', key: CDMX_NPC_KEYS.senora, x: 1580, y: 248 },
    { id: 'n06_panadero', key: CDMX_NPC_KEYS.panadero, x: 2050, y: 252, flipX: true },
    { id: 'n06_joven', key: CDMX_NPC_KEYS.joven, x: 2700, y: 246 },
  ],
  reforma: [
    { id: 'n06_superviviente_angel', key: CDMX_NPC_KEYS.senora, x: 1250, y: 250, flipX: true },
    { id: 'n06_superviviente_estacion', key: CDMX_NPC_KEYS.anciano, x: 2440, y: 240 },
  ],
};

/**
 * Coloca un NPC común (o cualquier tira del catálogo) con pivote en los pies, profundidad = y y su
 * animación de reposo. Lo encuentra después `scene.children.getByName(id)`.
 */
export function addCdmxNpc(world: WorldApi, key: string, x: number, y: number, opts: { id?: string; flipX?: boolean } = {}): Phaser.GameObjects.Sprite {
  const { scene } = world;
  ensureCdmxTextures(scene);
  const spec = CDMX_ART.find(s => s.key === key);
  const s = scene.add.sprite(x, y, key).setOrigin(0.5, spec ? spec.feetY / spec.h : 78 / 80).setDepth(y);
  if (opts.flipX) s.setFlipX(true);
  if (opts.id) s.setName(opts.id);
  if (scene.anims.exists(key)) s.play({ key, randomFrame: true });
  return s;
}

/** Registra por código cualquier textura del catálogo que falte en el manifiesto (respaldo). */
export function ensureCdmxTextures(scene: Phaser.Scene): void {
  for (const spec of CDMX_ART) {
    if (scene.textures.exists(spec.key)) continue;
    const tex = canvasTexture(scene, spec.key, spec.w * spec.frames, spec.h, ctx => {
      for (let f = 0; f < spec.frames; f++) drawCdmxArt(spec, f).blit(ctx, f * spec.w, 0);
    });
    const t = scene.textures.get(tex);
    for (let f = 0; f < spec.frames; f++) t.add(f, 0, f * spec.w, 0, spec.w, spec.h);
    if (spec.frames > 1 && !scene.anims.exists(spec.key)) {
      scene.anims.create({ key: spec.key, frames: scene.anims.generateFrameNumbers(spec.key, { start: 0, end: spec.frames - 1 }), frameRate: spec.fps ?? 4, repeat: -1 });
    }
  }
}

export function installCdmxScenery(world: WorldApi): void {
  const { scene, level } = world;
  const section = (CDMX_SECTIONS as readonly string[]).includes(level.id) ? level.id as CdmxSection : 'xochimilco';
  ensureCdmxTextures(scene);
  // Solo retira los respaldos genéricos de World; las imágenes del manifiesto (equipo o PNG propios) mandan.
  for (const child of [...scene.children.list]) {
    const image = child as typeof child & { texture?: { key: string } };
    if (image.texture?.key.startsWith('__mundo_capa')) child.destroy();
  }
  PARALLAX_FACTORS.forEach((factor, index) => {
    if (scene.textures.exists(`${level.background}_capa${index}`)) return;
    const width = layerWidth(level.width, factor);
    const key = canvasTexture(scene, `__cdmx_${section}_capa${index}_${width}`, width, GAME_HEIGHT, (ctx, w, h) => {
      drawCdmxLayer(section, index, w, h).blit(ctx);
    });
    scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(factor, 0)
      .setDepth(index < 4 ? DEPTH.background + index : index === 4 ? DEPTH.ground : DEPTH.foreground);
  });
  installCdmxDecor(world, section);
}
