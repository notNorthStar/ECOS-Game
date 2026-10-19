// Constantes de movimiento, mundo y cámara (dueño: mundo).
// Referencia: worlorn_referencia.html (44 px/s a 270 px de alto → ×1.33 a 360 px).

/** Movimiento en el plano del suelo (px/s). */
export const MOVE = {
  walkSpeed: 78,
  runMult: 1.85,
  /** W/S (profundidad) es más lento que A/D, como en Worlorn. */
  depthMult: 0.55,
  /** Con dos teclas a la vez (diagonal) ambas componentes se reducen. */
  diagonalMult: 0.75,
  /** Suavizado de la velocidad (1/s). Alto = respuesta casi instantánea. */
  responsiveness: 18,
  /** Distancia entre pasos (px recorridos) para el evento player:step. */
  stepDistance: 18,
} as const;

/** Salto en z con gravedad propia (px, px/s, px/s²). */
export const JUMP = {
  velocity: 250,
  gravity: 980,
  /** Gravedad mientras se mantiene Espacio y se sube (altura variable). */
  holdGravityMult: 0.52,
  /** Al soltar Espacio subiendo, la velocidad se multiplica por esto. */
  releaseCut: 0.45,
  /** Duración del aterrizaje (anim) en s. */
  landTime: 0.12,
  /** Control horizontal en el aire (multiplicador de la velocidad). */
  airControl: 0.9,
} as const;

/** Esquiva (doble Shift o C). */
export const DODGE = {
  speed: 250,
  /** Duración del desplazamiento (s). */
  duration: 0.26,
  /** Invulnerabilidad (s), un poco más larga que el desplazamiento. */
  iframes: 0.34,
  cooldown: 0.45,
} as const;

/** Daño recibido y muerte. */
export const HURT = {
  invulnerable: 1.0,
  /** Retroceso inicial (px/s) por cada unidad de hit.knockback (si viene en 0 se usa 1). */
  knockbackSpeed: 170,
  knockbackDecay: 9,
  /** Tiempo de aturdimiento (sin control) tras un golpe (s). */
  stagger: 0.22,
  blinkHz: 16,
  /** Espera tras morir antes de reaparecer (ms). */
  respawnMs: 1200,
} as const;

/** Disparo: el jugador solo PIDE el disparo; Combat decide. */
export const SHOOT = {
  /** Altura del cañón sobre los pies (z del disparo = z del jugador + esto). */
  muzzleZ: 34,
  muzzleX: 16,
  /** Repetición al mantener X o clic izquierdo (s). */
  holdRepeat: 0.24,
} as const;

/** Cuerpo del jugador. */
export const PLAYER_BODY = {
  radius: 8,
  height: 62,
  /** Pies dentro del cuadro de 64×80 (estándar del equipo: pivote 32,78). */
  frameSize: 80,
  feetY: 78,
} as const;

/** Cámara. */
export const CAMERA = {
  /** Seguimiento suave: scroll += (objetivo − scroll) · min(1, dt · lerp). Worlorn usa 4. */
  lerp: 4,
  /** Adelanto hacia donde mira el jugador (px). */
  lookAhead: 28,
  lookAheadLerp: 2.5,
  fadeMs: 320,
} as const;

/** Mundo. */
export const WORLD = {
  /** Paso máximo por sub-movimiento en moveActor (px), evita atravesar obstáculos delgados. */
  maxStep: 3,
  /** Hitstop máximo cuando "reducir efectos" está activo (ms). */
  reducedHitstopMax: 30,
} as const;
