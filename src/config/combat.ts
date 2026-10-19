// Configuración del combate (dueño: combate). Todo lo ajustable del láser, los impactos,
// los conjuros sobre enemigos, los Ecos en vuelo y el HUD vive aquí.
// Estadísticas de enemigos: src/data/enemies.json · Costos y mejoras: src/data/progression.json.

/** Láser (GDD §4). */
export const LASER = {
  /** Velocidad del disparo (px/s). */
  speed: 560,
  /** Alcance máximo (px). */
  range: 340,
  /** Altura del pecho desde la que sale el disparo (px sobre z del jugador). */
  chestHeight: 26,
  /** Separación horizontal desde el centro del jugador. */
  muzzleOffset: 16,
  /** Largo del rayo para la colisión (px). */
  length: 26,
  /** Tiempo mínimo entre disparos (s). */
  cooldown: { green: 0.16, red: 0.26 },
  /** Golpe por modo. Daño en puntos de vida del enemigo (rojo × damageMult()). */
  green: { damage: 0.5, stun: 1, knockback: 6 },
  red: { damage: 10, stun: 0, knockback: 16 },
  /** Colores del brillo (respaldo y partículas). */
  colors: { green: 0x7dffb0, red: 0xff5a4a, greenCore: 0xe8fff0, redCore: 0xfff0d0 },
} as const;

/** [PROPUESTA — CONFIRMAR] Calentamiento del láser (GDD §4). heat va de 0 a 1. */
export const HEAT = {
  perShot: { green: 0.09, red: 0.2 },
  /** Enfriamiento por segundo tras `coolDelay` sin disparar. */
  coolRate: 0.45,
  coolDelay: 0.3,
  /** Al llegar a 1 queda bloqueado al menos `lockTime` s y hasta bajar a `resumeAt`. */
  lockTime: 1.4,
  resumeAt: 0.35,
  /** Enfriamiento mientras está sobrecalentado. */
  overheatedCoolRate: 0.55,
} as const;

/** "Jugo" de los impactos (el mundo respeta la opción de reducir efectos). */
export const JUICE = {
  hitstopMs: { green: 25, red: 55, spell: 90, bossPhase: 160 },
  shake: {
    green: { intensity: 0.0015, ms: 60 },
    red: { intensity: 0.004, ms: 90 },
    bossSlam: { intensity: 0.012, ms: 260 },
    bossPhase: { intensity: 0.01, ms: 400 },
    rock: { intensity: 0.004, ms: 100 },
  },
  /** Parpadeo blanco al recibir daño (ms). */
  flashMs: 80,
  sparks: { green: 7, red: 12 },
} as const;

/**
 * Conjuros sobre enemigos (GDD §6, NIVELES §3). Radios en px del plano del suelo.
 * RESPALDO: si data/spells.json (dueño: lsm) define effect.purifyRadius / calmRadius / calmMs, mandan esos.
 */
export const SPELLS_FX = {
  CALMA: {
    /** Radio para purificar agotados (escala con power: radio × (0.75 + 0.25 × power)). */
    purifyRadius: 90,
    /** Radio para calmar a los no agotados. */
    calmRadius: 110,
    /** Segundos de calma (× power). */
    calmSeconds: 4.5,
    /** El centro se adelanta hacia donde mira el jugador. */
    forward: 24,
  },
  PROTECCION: {
    purifyRadius: 64,
    /** A los no agotados los empuja y aturde un poco. */
    pushRadius: 70,
    knockback: 40,
    stun: 2,
    forward: 10,
  },
} as const;

/** Escudo pasivo de PROTECCION (respaldo; mandan effect.shieldMs / shieldReduction de spells.json). */
export const SHIELD = {
  ms: 3000,
  reduction: 0.6,
  color: 0xf2c86b,
} as const;

/** Ecos en vuelo (EcoOrb). */
export const ORBS = {
  /** Máximo de orbes por evento (el valor se reparte). */
  maxPerBurst: 12,
  burstSpeed: 120,
  /** Tiempo de dispersión antes de volar al jugador (s). */
  scatterTime: 0.35,
  homingAccel: 900,
  maxSpeed: 520,
  pickupRadius: 12,
  /** Altura a la que se recogen (pecho del jugador). */
  pickupHeight: 22,
  color: 0x9ff7ff,
  /** Tope de vida de un orbe (s): si algo falla, se acredita solo. */
  maxLife: 4,
} as const;

/** Profundidad extra para dibujar efectos por delante del actor en la misma y. */
export const FX_DEPTH_BIAS = 0.5;

/** HUD. */
export const HUD = {
  heartSpacing: 14,
  zoneFadeIn: 900,
  zoneHold: 2600,
  zoneFadeOut: 1400,
  toastMs: 2600,
  bossBarWidth: 300,
} as const;
