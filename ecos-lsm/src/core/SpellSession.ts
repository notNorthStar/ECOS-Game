import { MOTION_LETTERS, spellLetters } from './letters';

export type LetterResult = 'ok' | 'miss' | null;
export type SpellOutcome = 'fail' | 'partial' | 'perfect';

export interface SpellOptions {
  /** Ventana de tiempo por letra (ms). Multiplícala para la opción de accesibilidad "ventanas largas". */
  letterWindowMs: number;
  /** Cuánto hay que sostener la seña correcta para confirmarla (ms). */
  holdMs: number;
  /** Menos de esta fracción de letras correctas = conjuro fallido. */
  failBelow: number;
  /** "PERFECTO": 100 % de aciertos y tiempo promedio por debajo de esta fracción de la ventana. */
  perfectSpeed: number;
  /** Las letras con movimiento (Z) tienen esta ventana extra, sin penalizar la rapidez. */
  motionWindowFactor: number;
}

export const DEFAULT_SPELL_OPTIONS: SpellOptions = {
  letterWindowMs: 3000,
  holdMs: 300,
  failBelow: 0.5,
  perfectSpeed: 0.55,
  motionWindowFactor: 1.6,
};

export interface SpellResult {
  word: string;
  correct: number;
  total: number;
  /** 0..1 letras correctas */
  fraction: number;
  /** tiempo promedio usado / ventana (0..1, menor = más rápido) */
  speedRatio: number;
  /** 0..~1.2 fuerza final: fracción × bono de rapidez (0 si falló) */
  power: number;
  outcome: SpellOutcome;
}

/**
 * Lógica pura de un deletreo (sin motor de juego): letra actual, ventana de tiempo,
 * confirmación por cámara (sostener la seña) o por teclado, y puntuación final (GDD 6.3).
 *
 *   const s = new SpellSession('CALMA', performance.now());
 *   // cada cuadro:
 *   const pred = engine.read(now, s.current);     // letra estable de la cámara
 *   const r = s.update(now, pred.letter, pred.stableMs);
 *   // teclado:  s.typeLetter(e.key, now)
 *   if (s.done) s.result();
 */
export class SpellSession {
  readonly word: string;
  readonly letters: string[];
  readonly results: LetterResult[];
  readonly options: SpellOptions;
  index = 0;
  done = false;
  /** Progreso 0..1 de sostener la seña correcta (para la interfaz). */
  holdProgress = 0;
  private letterStart: number;
  private times: number[] = [];

  constructor(word: string, now: number, options: Partial<SpellOptions> = {}) {
    this.word = word;
    this.letters = spellLetters(word);
    this.results = this.letters.map(() => null);
    this.options = { ...DEFAULT_SPELL_OPTIONS, ...options };
    this.letterStart = now;
    if (!this.letters.length) this.done = true;
  }

  /** Letra que se debe hacer ahora (undefined al terminar). */
  get current(): string | undefined {
    return this.letters[this.index];
  }

  /** Ventana de la letra actual: las letras con movimiento tienen más tiempo. */
  get letterWindow(): number {
    const o = this.options;
    return o.letterWindowMs * (this.current && MOTION_LETTERS.has(this.current) ? o.motionWindowFactor : 1);
  }

  /** 0..1 cuánto queda de la ventana de la letra actual. */
  timeLeft(now: number): number {
    return Math.max(0, 1 - (now - this.letterStart) / this.letterWindow);
  }

  /**
   * Avanza el reloj con lo que ve la cámara: `detected` es la letra estable (o null) y
   * `stableMs` cuánto lleva sostenida. Devuelve 'ok' | 'miss' cuando se resuelve una letra.
   */
  update(now: number, detected: string | null, stableMs: number): LetterResult {
    if (this.done) return null;
    if (detected && detected === this.current) {
      this.holdProgress = Math.min(1, stableMs / this.options.holdMs);
      if (stableMs >= this.options.holdMs) return this.resolve('ok', now);
    } else {
      this.holdProgress = 0;
    }
    if (now - this.letterStart >= this.letterWindow) return this.resolve('miss', now);
    return null;
  }

  /** Respaldo de teclado: escribir la letra. Una tecla equivocada cuenta como fallo. */
  typeLetter(ch: string, now: number): LetterResult {
    if (this.done) return null;
    const typed = spellLetters(ch)[0];
    if (!typed) return null; // teclas que no son letras se ignoran
    return this.resolve(typed === this.current ? 'ok' : 'miss', now);
  }

  /** Cancela el deletreo (por ejemplo, con Esc). Las letras pendientes cuentan como fallo. */
  cancel(now: number): void {
    while (!this.done) this.resolve('miss', now);
  }

  private resolve(r: 'ok' | 'miss', now: number): LetterResult {
    this.results[this.index] = r;
    // Tiempo como fracción de la ventana de ESA letra (la Z no penaliza la rapidez)
    const w = this.letterWindow;
    this.times.push((r === 'ok' ? now - this.letterStart : w) * (this.options.letterWindowMs / w));
    this.index++;
    this.letterStart = now;
    this.holdProgress = 0;
    if (this.index >= this.letters.length) this.done = true;
    return r;
  }

  result(): SpellResult {
    const o = this.options;
    const total = this.letters.length;
    const correct = this.results.filter((r) => r === 'ok').length;
    const fraction = total ? correct / total : 0;
    const avg = this.times.reduce((s, x) => s + x, 0) / Math.max(1, this.times.length);
    const speedRatio = Math.min(1, avg / o.letterWindowMs);
    let outcome: SpellOutcome;
    if (fraction < o.failBelow) outcome = 'fail';
    else if (fraction === 1 && speedRatio <= o.perfectSpeed) outcome = 'perfect';
    else outcome = 'partial';
    const power = outcome === 'fail' ? 0 : fraction * (1 + 0.2 * (1 - speedRatio));
    return { word: this.word, correct, total, fraction, speedRatio, power, outcome };
  }
}
