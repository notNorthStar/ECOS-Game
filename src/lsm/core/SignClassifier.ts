import { normalizeLandmarks } from './features';
import { KnnStrategy, type SampleBank } from './knn';
import { ZTracker } from './motion';
import { RulesStrategy, analyzeHand } from './rules';
import type { HandFrame, LetterStrategy, Prediction } from './types';

export type StrategyMode = 'auto' | 'reglas' | 'k-NN';

export interface StablePrediction extends Prediction {
  /** Milisegundos que la letra lleva estable (con histéresis). */
  stableMs: number;
  strategy: string;
  /** Predicción cruda de cada estrategia, para el overlay de depuración. */
  raw: Record<string, Prediction>;
}

/**
 * Clasifica letras con dos estrategias intercambiables y estabiliza el resultado:
 * suavizado por votación de varios cuadros + histéresis antes de confirmar.
 */
export class SignClassifier {
  readonly rules = new RulesStrategy();
  readonly knn: KnnStrategy;
  mode: StrategyMode = 'auto';
  /** 0 = estricto, 1 = muy permisivo. Afecta umbrales de reglas, k-NN e histéresis. */
  tolerance = 0.5;
  /**
   * Ayuda con la letra objetivo: si la letra pedida queda entre las 2 mejores de las reglas con un
   * puntaje razonable, se acepta (pares que la cámara casi no distingue, como R/U). Útil en conjuros;
   * conviene apagarla en detecciones libres como el escudo.
   */
  assistTarget = true;

  private history: Array<{ letter: string | null; conf: number; t: number }> = [];
  private current: string | null = null;
  private currentSince = 0;
  private missSince = 0;
  /** Letras con movimiento: la Z se reconoce por la trayectoria del índice. */
  readonly zTracker = new ZTracker();
  private motionHitAt = -Infinity;
  /** ¿El último cuadro tenía la forma de apuntar? (diagnóstico) */
  lastPointing = false;

  constructor(bank: SampleBank) {
    this.knn = new KnnStrategy(bank);
  }

  /** Estrategia a usar para una letra objetivo: k-NN si hay muestras de esa letra. */
  private pick(target?: string): LetterStrategy {
    if (this.mode === 'reglas') return this.rules;
    if (this.mode === 'k-NN') return this.knn;
    if (target && this.knn.letters().includes(target)) return this.knn;
    return this.rules;
  }

  reset(): void {
    this.history = [];
    this.current = null;
    this.currentSince = 0;
    this.missSince = 0;
    this.zTracker.reset();
    this.motionHitAt = -Infinity;
  }

  /** Procesa un cuadro (o su ausencia) y devuelve la letra estabilizada. */
  update(frame: HandFrame | null, now: number, target?: string): StablePrediction {
    const strategy = this.pick(target);
    const raw: Record<string, Prediction> = {};
    let pred: Prediction = { letter: null, confidence: 0 };
    if (frame) {
      const feats = normalizeLandmarks(frame.landmarks, frame.handedness);
      raw[this.rules.name] = this.rules.predict(feats, frame.landmarks, this.tolerance);
      if (this.knn.size > 0) raw[this.knn.name] = this.knn.predict(feats, frame.landmarks, this.tolerance);
      pred = raw[strategy.name] ?? pred;
      // Z: seguir la punta del índice mientras la mano está en forma de "apuntar"
      const h = analyzeHand(feats);
      // Forma de "apuntar": lo fiable es que medio, anular y meñique estén doblados. El índice solo debe
      // llegar más lejos que ellos: al apuntar hacia la cámara (esquinas de abajo de la Z) se ve corto y
      // "estirado" daba 0 (cámara del equipo, 2026-10-17), lo que reiniciaba el trazo a la mitad.
      const Fh = h.fingers;
      const othersMax = Math.max(Fh.middle.reach, Fh.ring.reach, Fh.pinky.reach);
      const pointing = othersMax < 1.0 && (Fh.index.ext > 0.5 || Fh.index.reach > othersMax + 0.08);
      this.lastPointing = pointing;
      if (this.zTracker.push(frame.landmarks, pointing, now)) this.motionHitAt = now;
      // Durante un conjuro sabemos qué letra se pide. Si la cámara no distingue bien un par parecido
      // (MediaPipe casi no registra el cruce de dedos de la R y la reporta como U), aceptamos la letra
      // objetivo cuando está entre las 2 mejores con un puntaje razonable. Una seña muy distinta no llega.
      if (this.assistTarget && target && strategy === this.rules && pred.letter !== target) {
        const ranked = this.rules.ranked(feats, this.tolerance);
        const pos = ranked.findIndex(([l]) => l === target);
        const score = pos >= 0 ? ranked[pos][1] : 0;
        if (pos >= 0 && pos <= 1 && score >= 0.15 - this.tolerance * 0.05) {
          pred = { letter: target, confidence: Math.max(score, 0.55) };
          raw['objetivo'] = { letter: target, confidence: score };
        }
      }
    }

    // Una letra con movimiento recién trazada se reporta como YA SOSTENIDA durante 700 ms,
    // para que el conjuro la confirme igual que una seña estática.
    if (now - this.motionHitAt < 700) {
      raw['movimiento'] = { letter: 'Z', confidence: 1 };
      if (this.current !== 'Z') this.currentSince = this.motionHitAt - 400;
      this.current = 'Z';
      this.history = [];
      return { letter: 'Z', confidence: 1, stableMs: now - this.currentSince, strategy: 'movimiento', raw };
    }

    // Suavizado: votación ponderada por confianza en los últimos ~350 ms.
    this.history.push({ letter: pred.letter, conf: pred.confidence, t: now });
    while (this.history.length && now - this.history[0].t > 350) this.history.shift();
    const votes = new Map<string, number>();
    let total = 0;
    for (const h of this.history) {
      total += 1;
      if (h.letter) votes.set(h.letter, (votes.get(h.letter) ?? 0) + h.conf);
    }
    let smoothed: string | null = null;
    let score = 0;
    for (const [l, v] of votes) if (v > score) [smoothed, score] = [l, v];
    const confidence = total ? score / total : 0;

    // Histéresis: hace falta más confianza para cambiar de letra que para mantenerla.
    const enter = 0.5 - this.tolerance * 0.15;
    const keep = enter - 0.15;
    if (smoothed && smoothed === this.current && confidence >= keep) {
      this.missSince = 0;
    } else if (smoothed && confidence >= enter) {
      this.current = smoothed;
      this.currentSince = now;
      this.missSince = 0;
    } else {
      // Toleramos ~150 ms de "hueco" antes de soltar la letra actual.
      if (!this.missSince) this.missSince = now;
      if (now - this.missSince > 150) {
        this.current = null;
        this.currentSince = now;
      }
    }

    return {
      letter: this.current,
      confidence,
      stableMs: this.current ? now - this.currentSince : 0,
      strategy: strategy.name,
      raw,
    };
  }
}
