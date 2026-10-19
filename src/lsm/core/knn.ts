import type { LetterStrategy, Prediction } from './types';

export type SampleBank = Record<string, number[][]>;

/**
 * k vecinos más cercanos sobre los rasgos normalizados.
 * Las muestras se graban con la escena oculta F9 (scenes/SignRecorderScene.ts).
 */
export class KnnStrategy implements LetterStrategy {
  readonly name = 'k-NN';
  private entries: Array<{ letter: string; v: Float32Array }> = [];

  constructor(
    bank: SampleBank,
    private k = 5,
  ) {
    this.setBank(bank);
  }

  setBank(bank: SampleBank): void {
    this.entries = [];
    for (const [letter, list] of Object.entries(bank)) {
      for (const s of list) this.entries.push({ letter, v: Float32Array.from(s) });
    }
  }

  get size(): number {
    return this.entries.length;
  }

  letters(): string[] {
    return [...new Set(this.entries.map((e) => e.letter))];
  }

  predict(features: Float32Array, _raw: unknown, tolerance: number): Prediction {
    if (this.entries.length < this.k) return { letter: null, confidence: 0 };
    const best: Array<{ d: number; letter: string }> = [];
    for (const e of this.entries) {
      let d = 0;
      for (let i = 0; i < 63; i++) {
        const diff = features[i] - e.v[i];
        d += diff * diff;
      }
      if (best.length < this.k) {
        best.push({ d, letter: e.letter });
        best.sort((a, b) => a.d - b.d);
      } else if (d < best[best.length - 1].d) {
        best[best.length - 1] = { d, letter: e.letter };
        best.sort((a, b) => a.d - b.d);
      }
    }
    const votes = new Map<string, number>();
    for (const b of best) votes.set(b.letter, (votes.get(b.letter) ?? 0) + 1);
    let letter = best[0].letter;
    let top = 0;
    for (const [l, v] of votes) if (v > top) [letter, top] = [l, v];
    // Rechaza si la mano está lejos de todo lo grabado (distancia media alta).
    const meanD = Math.sqrt(best.reduce((s, b) => s + b.d, 0) / best.length);
    const maxD = 1.2 + tolerance * 1.3;
    if (meanD > maxD) return { letter: null, confidence: 0 };
    const closeness = 1 - meanD / maxD;
    return { letter, confidence: (top / best.length) * (0.5 + 0.5 * closeness) };
  }
}
