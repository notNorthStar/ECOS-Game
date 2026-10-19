// Valores ajustables de las habilidades del Nivel 3 (dueño: sistemas): escudo U, Luna y Balam.
// GDD §6.5 (escudo) y §7 (Luna). Tiempos en ms o s según el nombre; energías en 0..1.

export const SHIELD = {
  /** La U debe sostenerse este tiempo frente a la cámara antes de activar (GDD 6.5). */
  holdMs: 150,
  /** Tolera parpadeos de la detección antes de soltar (ms). */
  releaseMs: 140,
  /** Reducción del daño recibido con el escudo arriba (0.6 = 60 %). */
  reduction: 0.6,
  /** Retroceso del jugador con escudo (multiplica el del golpe). */
  playerKnockbackMult: 0.35,
  /** Energía que se gasta por segundo con el escudo arriba (1 = barra completa → ~9 s). */
  drainPerSec: 0.11,
  /** Energía extra por cada segmento de daño bloqueado (mín. minHitCost por golpe). */
  hitCostPerDamage: 0.14,
  minHitCost: 0.06,
  /** Recarga por segundo con el escudo abajo, tras regenDelay segundos. */
  regenPerSec: 0.22,
  regenDelay: 0.7,
  /** Al romperse: segundos sin escudo y energía mínima para volver a levantarlo. */
  brokenSec: 3.2,
  reactivateMin: 0.3,
  /** Energía bajo la cual la burbuja se ve agrietada. */
  crackBelow: 0.35,
  /** Retroceso (px) a quien golpea el escudo cuerpo a cuerpo. */
  repelKnockback: 46,
  /** Distancia máxima (plano del suelo) para buscar al atacante y repelerlo. */
  repelRange: 90,
  /** Bloqueo perfecto: escudo levantado hace menos de esto (ms) → sin gasto y aturde. */
  perfectWindowMs: 220,
  perfectStun: 4,
  /** Burbuja: centro sobre los pies (px hacia arriba) y radios. */
  bubbleLift: 36,
  bubbleRx: 26,
  bubbleRy: 40,
  /** Colores con el estilo de la gema. */
  color: 0x50e0b0,
  colorEdge: 0xb8fff0,
  colorBroken: 0xff7a6a,
} as const;

export const LUNA = {
  /** Gasto por segundo activa (1 = barra completa → ~11 s). */
  drainPerSec: 0.09,
  /** Recarga por segundo apagada, tras regenDelay segundos. */
  regenPerSec: 0.07,
  regenDelay: 0.8,
  /** Energía mínima para volver a activarla tras agotarse. */
  reactivateMin: 0.2,
  /** Transición del filtro (s). */
  fadeSec: 0.35,
  /** Saturación que queda con Luna activa (0 = gris, 1 = normal). */
  saturation: 0.3,
  /** Multiplicadores R, G, B del tinte frío y desplazamiento azul (0..255). */
  tint: [0.72, 0.9, 1.2] as readonly number[],
  blueOffset: 14,
  /** Viñeta de bordes brillantes (radio/fuerza normalizados 0..1). */
  edgeColor: 0x7fd8ff,
  edgeRadius: 0.62,
  edgeStrength: 0.42,
  /** Viñeta oscura. */
  darkRadius: 0.45,
  darkStrength: 0.35,
  /** Con "reducir efectos": sin pulso y filtro más suave. */
  reducedScale: 0.7,
} as const;

export const BALAM = {
  /** Distancia detrás del jugador (px) y desfase en profundidad. */
  followBehind: 30,
  followDepth: -8,
  /** Velocidad base y de alcance (px/s). */
  speed: 120,
  catchUpSpeed: 260,
  /** Si se aleja más que esto, reaparece junto al jugador. */
  teleportDist: 320,
  /** Radio de colisión en el plano. */
  radius: 6,
} as const;
