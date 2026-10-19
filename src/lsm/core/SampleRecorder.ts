import { normalizeLandmarks } from './features';
import type { SampleBank } from './knn';
import type { HandFrame } from './types';

/**
 * Grabadora de muestras para el clasificador k-NN (sin interfaz).
 * Cada muestra = 63 números (21 puntos × x,y,z) normalizados: relativos a la muñeca,
 * escalados por el largo de la palma y con la mano derecha reflejada (ver features.ts).
 *
 *   rec.start('S', 30);
 *   // cada cuadro con mano: rec.push(frame)  → true al completar
 *   classifier.knn.setBank(rec.bank);        // usar las muestras de inmediato
 *   download(rec.toJSON());                  // guardar en src/data/samples.json
 */
export class SampleRecorder {
  bank: SampleBank;
  letter: string | null = null;
  private remaining = 0;

  constructor(initial: SampleBank = {}) {
    this.bank = JSON.parse(JSON.stringify(initial));
  }

  get recording(): boolean {
    return this.remaining > 0;
  }

  /** Muestras que faltan por grabar de la letra actual. */
  get pending(): number {
    return this.remaining;
  }

  /** Empieza a grabar `count` muestras de una letra (reemplaza las anteriores de esa letra). */
  start(letter: string, count = 30): void {
    this.letter = letter.toUpperCase();
    this.bank[this.letter] = [];
    this.remaining = count;
  }

  /** Agrega un cuadro si se está grabando. Devuelve true cuando termina la letra. */
  push(frame: HandFrame | null): boolean {
    if (!this.remaining || !frame || !this.letter) return false;
    const v = Array.from(normalizeLandmarks(frame.landmarks, frame.handedness)).map((n) => Math.round(n * 1000) / 1000);
    this.bank[this.letter].push(v);
    this.remaining--;
    return this.remaining === 0;
  }

  clear(letter: string): void {
    delete this.bank[letter.toUpperCase()];
  }

  counts(): Record<string, number> {
    return Object.fromEntries(Object.entries(this.bank).map(([l, s]) => [l, s.length]));
  }

  /** Formato de src/data/samples.json */
  toJSON(): string {
    return JSON.stringify(
      {
        version: 1,
        note: 'Muestras k-NN. Cada muestra: 63 números (21 puntos × x,y,z) normalizados respecto a la muñeca y al largo de la palma, con la mano derecha reflejada.',
        samples: this.bank,
      },
      null,
      1,
    );
  }
}
