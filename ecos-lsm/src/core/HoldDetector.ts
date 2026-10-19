/**
 * Detector de "seña sostenida" para mecánicas en tiempo real, como el ESCUDO de ECOS (GDD 6.5):
 * mientras la letra (U) se mantenga estable frente a la cámara, `active` es true.
 *
 *  - Se activa cuando la letra lleva `holdMs` estable (evita activaciones accidentales).
 *  - Se desactiva si la letra desaparece más de `releaseMs` (tolera parpadeos de la detección).
 *  - `suspended = true` lo apaga (p. ej. mientras se deletrea un conjuro, porque la U aparece en LUZ).
 *
 *   const shield = new HoldDetector('U', { holdMs: 150 });
 *   // cada cuadro (con la detección en modo 'shield'):
 *   const on = shield.update(engine.read(now), now);
 */
export class HoldDetector {
  active = false;
  suspended = false;
  /** Momento en que se activó (para efectos como "bloqueo perfecto"). */
  activeSince = 0;
  private missSince = 0;
  readonly holdMs: number;
  readonly releaseMs: number;

  constructor(
    readonly letter: string,
    opts: { holdMs?: number; releaseMs?: number } = {},
  ) {
    this.holdMs = opts.holdMs ?? 150;
    this.releaseMs = opts.releaseMs ?? 120;
  }

  /** `pred` = lo que devuelve SignClassifier.update / LsmEngine.read (letter + stableMs). */
  update(pred: { letter: string | null; stableMs: number }, now: number): boolean {
    if (this.suspended) {
      this.active = false;
      this.missSince = 0;
      return false;
    }
    const seen = pred.letter === this.letter;
    if (seen) {
      this.missSince = 0;
      if (!this.active && pred.stableMs >= this.holdMs) {
        this.active = true;
        this.activeSince = now;
      }
    } else if (this.active) {
      if (!this.missSince) this.missSince = now;
      if (now - this.missSince > this.releaseMs) this.active = false;
    }
    return this.active;
  }

  reset(): void {
    this.active = false;
    this.missSince = 0;
  }
}
