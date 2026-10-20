import type Phaser from 'phaser';
import type { SECTIONS } from '../config/game';

/**
 * CONTRATOS ENTRE SISTEMAS. Cada sistema tiene un dueño (ver docs/ARQUITECTURA.md);
 * los demás solo dependen de estas interfaces. No cambies la forma de lo que ya existe:
 * si necesitas algo nuevo, AGRÉGALO como campo opcional y avisa.
 *
 * Coordenadas (AGENTS.md §3): (x, y) = posición en el plano del suelo, en píxeles del mundo;
 * z = altura del salto (≥ 0, hacia arriba). El sprite se dibuja en (x, y − z) y la sombra en (x, y).
 * Profundidad de dibujo: setDepth(y). Golpes conectan si |Δy| < DEPTH_TOLERANCE.
 */

export type SectionId = (typeof SECTIONS)[number];
export type Team = 'player' | 'enemy';
export type LaserMode = 'green' | 'red';

/** Un golpe. */
export interface Hit {
  /** Daño a la vida (en segmentos para el jugador; en puntos para enemigos). */
  damage: number;
  /** Aturdimiento acumulado (láser verde). */
  stun: number;
  kind: 'laser-green' | 'laser-red' | 'melee' | 'shockwave' | 'projectile' | 'spell';
  /** X de quien golpea, para el retroceso. */
  sourceX: number;
  knockback: number;
}

/** Cualquier cosa que vive en el plano del suelo con profundidad. */
export interface DepthEntity {
  x: number;
  y: number;
  z: number;
  /** Radio de colisión en el plano del suelo (elipse rx = radius, ry = radius / 2). */
  radius: number;
  /** Altura de la caja de daño, para disparos (un disparo a altura h golpea si z ≤ h ≤ z + height). */
  height: number;
  team: Team;
  readonly alive: boolean;
  /** Avanza la lógica. dt en SEGUNDOS, ya multiplicado por world.timeScale. */
  update(dt: number): void;
  /** Devuelve true si el golpe conectó (no invulnerable, etc.). */
  takeHit(hit: Hit): boolean;
  destroy(): void;
}

export interface PlayerApi extends DepthEntity {
  facing: 1 | -1;
  /** true durante diálogos, deletreo, cinemáticas: el jugador no responde a la entrada. */
  controlsLocked: boolean;
  readonly invulnerable: boolean;
  readonly isDodging: boolean;
  /** Animación puntual (ej. 'protagonista_conjuro', 'protagonista_interactuar'). */
  playOneShot(animKey: string): void;
  /** Teletransporta (respawn, cambio de sección). */
  setPosition(x: number, y: number): void;
}

export type EnemyKind =
  | 'chaneque' | 'chaneque_mayor' | 'encapuchado' | 'espiritu' | 'cabeza_olmeca'
  // Nivel 4 (Oaxaca)
  | 'bestia' | 'bruja_guajolote'
  // Nivel 6 (CDMX 1)
  | 'muneca' | 'nahual' | 'nahuala'
  // Nivel 7 (CDMX 2). Los clones de memoria son internos del Rey (como las copias de la Nahuala).
  | 'rey_olvido'
  // Nivel 10 (Guadalajara): subjefas del eclipse y la jefa final.
  | 'tzitzimitl'
  | 'itzpapalotl';
export type ChanequeVariant = 'patrulla' | 'saltador' | 'travieso';
/** Rangos de la Cofradía: el MISMO modelo con recolor (GDD §9). En el Nivel 3 solo aparece 'rojo'. */
export type CofradiaRank = 'rojo' | 'negro' | 'elite';

export interface EnemyApi extends DepthEntity {
  kind: EnemyKind;
  /** Agotado: vida en 0, espera a ser purificado (no ataca). */
  readonly exhausted: boolean;
  /** Purificado o retirado: sale del mundo. */
  readonly purified: boolean;
  /** Grupo de arena al que pertenece (o undefined si anda suelto). */
  group?: string;
  /** Ecos base que da (GDD 5.1). */
  readonly ecos: number;
  /** Solo se puede ver, golpear y purificar con la Habilidad Luna activa; sin ella es invisible pero SÍ ataca (Nivel 3+). */
  readonly lunaOnly?: boolean;
  /** Aplica un conjuro. Devuelve true si tuvo efecto. */
  applySpell(ev: SpellOutcomeEvent): boolean;
}

export interface EnemySpec {
  type: EnemyKind;
  variant?: ChanequeVariant;
  /** Solo encapuchados. */
  rank?: CofradiaRank;
  /** Solo espíritus: si true (por defecto) solo se ven con Luna. */
  lunaOnly?: boolean;
  /** Identificador del enemigo (p. ej. un nahual infiltrado que el director despierta por id). */
  id?: string;
  /** Solo nahuales: clave de la textura del NPC que imita mientras está disfrazado (sin disfraz = ya transformado). */
  disguise?: string;
  x: number;
  y: number;
  /** Si tiene grupo, NO aparece al cargar: aparece al emitirse 'arena:start' con ese grupo. */
  group?: string;
}

/** Resultado de un conjuro, emitido por Casting en 'spell:resolved'. */
export interface SpellOutcomeEvent {
  spellId: string; // 'CALMA' | 'PROTECCION' | 'VOZ' | 'LUZ' | 'SOL'
  outcome: 'fail' | 'partial' | 'perfect';
  /** 0..1 (fuerza proporcional; 1 = perfecto). */
  power: number;
  /** Lanzado en automático por estar dominado. */
  auto: boolean;
  x: number;
  y: number;
  facing: 1 | -1;
}

/* ============================== MUNDO ============================== */

/** API del mundo: la implementa LevelScene (dueño: agente de mundo). */
export interface WorldApi {
  readonly scene: Phaser.Scene;
  readonly level: LevelData;
  readonly player: PlayerApi;
  /** Todas las entidades vivas (jugador incluido). */
  readonly entities: ReadonlyArray<DepthEntity>;
  readonly enemies: ReadonlyArray<EnemyApi>;
  /** Escala de tiempo del mundo (1 normal, <1 ralentizado). Las entidades ya reciben dt escalado. */
  timeScale: number;
  add(e: DepthEntity): void;
  remove(e: DepthEntity): void;
  spawnEnemy(spec: EnemySpec): EnemyApi;
  /** Mueve con colisiones (áreas transitables + obstáculos), deslizando. Modifica a.x / a.y. */
  moveActor(a: { x: number; y: number; radius: number }, dx: number, dy: number): void;
  isWalkable(x: number, y: number, radius?: number): boolean;
  /** Punto transitable aleatorio cerca de (x, y). */
  randomPointNear(x: number, y: number, r: number): { x: number; y: number };
  /** Limita la cámara y al jugador a [x0, x1] (arenas). */
  lockArena(x0: number, x1: number): void;
  unlockArena(): void;
  /** Jugo (respeta la opción de reducir efectos). */
  shake(intensity: number, ms: number): void;
  hitstop(ms: number): void;
  flash(color: number, ms: number): void;
  /** Cambia de sección (reinicia LevelScene). spawn = clave en level.spawns, o el spawn por defecto. */
  gotoSection(section: SectionId, spawn?: string): void;
  /** Contenedor para efectos en coordenadas del mundo (partículas, láseres). */
  readonly fxLayer: Phaser.GameObjects.Layer;
}

/* ========================= DATOS DE NIVEL ========================= */
/** Formato JSON de cada sección: src/data/levels/<seccion>.json (dueño: agente de contenido). */
export interface LevelData {
  id: SectionId;
  /** Nombre visible de la zona. */
  name: string;
  /** Ancho del mundo en px (alto siempre 360). */
  width: number;
  /** Prefijo de las capas de fondo: `${background}_capa0..5` (ver docs/ARQUITECTURA.md). */
  background: string;
  ambience: {
    fog: number; // 0..1
    rain?: boolean;
    fireflies?: boolean;
    leaves?: boolean;
    embers?: boolean;
    dust?: boolean;
    /** Tinte de iluminación ambiental, ej. '#7fa8a0'. */
    tint?: string;
    darkness?: number; // 0..1, viñeta / oscuridad
  };
  music?: string; // 'n01_exploracion' | 'n01_combate' | 'n01_taller' | 'n01_jefe'
  /** Polígonos transitables [[x,y], ...] en el plano del suelo. Unión de todos. */
  walk: number[][][];
  obstacles: Array<
    | { shape: 'ellipse'; x: number; y: number; rx: number; ry: number; height?: number }
    | { shape: 'rect'; x: number; y: number; w: number; h: number; height?: number }
  >;
  /** Props decorativos ordenados por y. key = clave de textura del manifiesto. */
  props: Array<{
    key: string;
    x: number;
    y: number; // línea de los pies (origen 0.5, 1)
    /** Obstáculo elíptico en los pies. */
    collide?: { rx: number; ry: number };
    foreground?: boolean;
    flipX?: boolean;
    /** Animación en bucle (clave de anim), si es un spritesheet animado. */
    anim?: string;
    /** id opcional para que el director lo encuentre (ej. 'antena'). */
    id?: string;
    alpha?: number;
    scale?: number;
  }>;
  spawn: { x: number; y: number };
  spawns?: Record<string, { x: number; y: number }>;
  enemies: EnemySpec[];
  /** Rectángulos en el plano del suelo; al entrar el jugador se emite 'trigger:enter'. */
  triggers: LevelTrigger[];
  /** Objetos con los que se interactúa con E. Emiten 'interact'. */
  interactables: Array<{
    id: string;
    x: number;
    y: number;
    radius?: number; // por defecto 28
    prompt: string; // "Examinar", "Leer", "Recoger"
    action: string;
    data?: Record<string, unknown>;
    /** Si es once, desaparece tras usarse (y se recuerda en GameState.flags). */
    once?: boolean;
  }>;
  /** Límites de cámara opcionales. */
  cameraBounds?: { x0: number; x1: number };
}

export interface LevelTrigger {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  once?: boolean;
  action: string;
  data?: Record<string, unknown>;
}
