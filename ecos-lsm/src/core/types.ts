/** Tipos del módulo de manos. Este módulo NO depende de Phaser. */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type TrackerStatus = 'sin-camara' | 'cargando' | 'listo' | 'error';

export interface HandFrame {
  /** 21 puntos normalizados de la imagen (0..1), como los entrega MediaPipe. */
  landmarks: Landmark[];
  /** 'Left' | 'Right' según MediaPipe (desde el punto de vista de la imagen). */
  handedness: string;
  /** Milisegundos que tardó la detección de este cuadro. */
  latencyMs: number;
  timestamp: number;
}

export interface Prediction {
  letter: string | null;
  confidence: number; // 0..1
}

/** Interfaz común para comparar estrategias de clasificación. */
export interface LetterStrategy {
  readonly name: string;
  /** tolerance: 0 = estricto, 1 = muy permisivo */
  predict(features: Float32Array, raw: Landmark[], tolerance: number): Prediction;
}

/** Índices de los 21 puntos de MediaPipe Hands. */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

/** Conexiones para dibujar el esqueleto de la mano (overlay de depuración). */
export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
