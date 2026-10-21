// Constantes de movimiento, mundo y cámara (dueño: mundo).
// Referencia: worlorn_referencia.html (44 px/s a 270 px de alto → ×1.33 a 360 px).

/** Movimiento en el plano del suelo (px/s). */
export const MOVE = {
  walkSpeed: 78,
  /** Sprint con Shift: 78 × 2.4 ≈ 187 px/s (antes 1.85 ≈ 144; costaba escapar). */
  runMult: 2.4,
  /** W/S (profundidad) es más lento que A/D, como en Worlorn. */
  depthMult: 0.55,
  /** Con dos teclas a la vez (diagonal) ambas componentes se reducen. */
  diagonalMult: 0.75,
  /** Suavizado de la velocidad (1/s). Alto = respuesta casi instantánea. */
  responsiveness: 18,
  /** Distancia entre pasos (px recorridos) para el evento player:step. */
  stepDistance: 18,
} as const;

/**
 * Salto en z con gravedad propia (px, px/s, px/s²).
 *
 * Altura máxima manteniendo Espacio ≈ v² / (2 · gravity · holdGravityMult):
 * - salto normal: 232² / 1019 ≈ 53 px (antes 250 → 61; se bajó en el Nivel 6 para que el doble
 *   salto tenga sentido). Las vigas de la Cabeza Olmeca (maxPlayerZ 46) siguen saltándose.
 * - doble salto: suma ≈ 205² / 1019 ≈ 41 px desde donde se pulse (máx. ≈ 94 px si se pulsa en la
 *   cima; ≈ 65–75 px pulsándolo a media subida).
 *
 * ALTURAS RECOMENDADAS para obstáculos con `height` (LevelData.obstacles, ver WalkMap):
 * - 20–35 px: se suben con el salto normal (cajas, bancas, escalones, trajineras varadas).
 * - 36–50 px: salto normal muy justo → EVITAR (frustra; o es fácil o pide doble salto).
 * - 55–65 px: solo con DOBLE SALTO (cornisas y escombros opcionales con Ecos/pistas).
 * - sin `height` (o ≥ 100): muro; no se cruza nunca.
 * El bloque debe quedar dentro de la franja transitable (walk) para poder pararse encima.
 */
export const JUMP = {
  velocity: 232,
  /** Impulso del segundo salto en el aire (mejora 'doble_salto'): un poco menor que el primero. */
  doubleVelocity: 205,
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
  /** Velocidad máxima; frena hacia el final (promedio ≈ 0.675×). Recorrido ≈ 520 × 0.3 × 0.675 ≈ 105 px (antes ≈ 45). */
  speed: 520,
  /** Duración del desplazamiento (s). */
  duration: 0.3,
  /** Invulnerabilidad (s), un poco más larga que el desplazamiento. */
  iframes: 0.38,
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
  muzzleZ: 43,
  muzzleX: 24,
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
