import type { LaserMode, SectionId } from './contracts';

/**
 * Estado persistente de la partida. Sobrevive a los reinicios de LevelScene (muerte, cambio de sección).
 * Es un objeto plano: cualquier sistema lo lee; cada campo tiene un dueño que lo escribe.
 */
export interface MasteryState {
  /** 0..3. 3 = dominado (se lanza en automático). */
  level: number;
  /** Lanzamientos buenos acumulados hacia el siguiente nivel. */
  progress: number;
}

export const GameState = {
  // Vida (dueño: Player / Combat)
  hp: 5,
  maxHp: 5,
  // Ecos y mejoras (dueño: Progression)
  ecos: 0,
  totalEcosEarned: 0,
  upgrades: { vida: 0, dano: 0, velocidad: 0, proteccion: 0 } as Record<string, number>,
  // Láser (dueño: Combat)
  hasLaser: false,
  laserMode: 'green' as LaserMode,
  laserHeat: 0, // 0..1
  laserOverheated: false,
  // Conjuros (dueño: Casting)
  learnedSpells: [] as string[],
  selectedSpell: null as string | null,
  mastery: {} as Record<string, MasteryState>,
  casting: false,
  // Escudo U (dueño: systems/Shield.ts). Se desbloquea en Catemaco con los brujos buenos.
  shield: { unlocked: false, energy: 1, active: false, broken: false },
  // Habilidad Luna con Balam (dueño: systems/Luna.ts). Se desbloquea en Catemaco al despertar Balam.
  luna: { unlocked: false, energy: 1, active: false },
  hasBalam: false,
  // María, compañera de viaje del Nivel 3 al 7 (dueño: systems/Maria.ts). En el Nivel 4 ayuda en combate.
  hasMaria: false,
  // Controles invertidos por la corona del Rey del Olvido (dueño: systems/MindControl.ts; lo lee Player).
  controlsInverted: false,
  // Nivel 10: Balam en forma de jaguar luminoso (dueño: systems/BalamJaguar.ts) y jugador atado (dueño: GdlDirector).
  balamJaguar: false,
  bound: false,
  // Progreso del nivel (dueño: Director)
  section: 'taller' as SectionId,
  checkpoint: null as null | { section: SectionId; x: number; y: number },
  flags: {} as Record<string, boolean>,
  // Pantalla de carga entre niveles (dueño: interfaz). Campaign la pide en cada prepare…Entry(); LevelScene la consume.
  pendingLoadScreen: false,
  // Opciones (dueño: Title / Pause)
  settings: {
    camera: false, // la cámara quedó activa y lista
    longWindows: false, // ventanas de tiempo más largas
    noExtraSlowmo: false,
    reduceFx: false, // sin sacudidas ni destellos
    noInvert: false, // accesibilidad: la corona del Rey no invierte los controles
    musicVolume: 0.3, // bajo por defecto (decisión del equipo); se sube en Pausa → Opciones
    sfxVolume: 0.8,
    textScale: 1,
  },
};

export type GameStateT = typeof GameState;

/** Multiplicador de daño por la mejora "Daño" (+10 % por nivel). */
export const damageMult = () => 1 + 0.1 * (GameState.upgrades.dano ?? 0);
/** Multiplicador de velocidad por la mejora "Velocidad" (+6 % por nivel). */
export const speedMult = () => 1 + 0.06 * (GameState.upgrades.velocidad ?? 0);

/** Reinicia todo para una partida nueva. */
export function resetGameState(): void {
  Object.assign(GameState, {
    hp: 5,
    maxHp: 5,
    ecos: 0,
    totalEcosEarned: 0,
    upgrades: { vida: 0, dano: 0, velocidad: 0, proteccion: 0 },
    hasLaser: false,
    laserMode: 'green',
    laserHeat: 0,
    laserOverheated: false,
    learnedSpells: [],
    selectedSpell: null,
    mastery: {},
    casting: false,
    shield: { unlocked: false, energy: 1, active: false, broken: false },
    luna: { unlocked: false, energy: 1, active: false },
    hasBalam: false,
    hasMaria: false,
    controlsInverted: false,
    balamJaguar: false,
    bound: false,
    section: 'taller',
    checkpoint: null,
    flags: {},
    pendingLoadScreen: false,
  });
}
