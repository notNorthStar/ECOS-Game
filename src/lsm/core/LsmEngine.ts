import { normalizeLandmarks } from './features';
import { HandTracker } from './HandTracker';
import type { SampleBank } from './knn';
import { explain } from './rules';
import { SignClassifier, type StablePrediction } from './SignClassifier';
import { SpellSession, type LetterResult, type SpellOptions } from './SpellSession';
import type { TrackerStatus } from './types';

/**
 * Modo de detección:
 *  - 'off'    → la cámara puede estar encendida pero no se procesa nada (0 % de costo).
 *  - 'spell'  → deletreo de conjuros (~18 Hz).
 *  - 'shield' → detección continua mientras se juega, p. ej. el escudo con la U (~12 Hz).
 */
export type DetectionMode = 'off' | 'spell' | 'shield';

export interface LsmEngineOptions {
  /** Elemento <video> para la cámara. Si no se da, se crea uno (úsalo con CameraView para mostrarlo). */
  video?: HTMLVideoElement;
  /** Carpeta con `wasm/` y `hand_landmarker.task`, relativa a la página. Por defecto './mediapipe'. */
  assetsPath?: string;
  /** Muestras k-NN (src/data/samples.json → .samples). */
  samples?: SampleBank;
  /** 0 = estricto, 1 = permisivo. Por defecto 0.5. */
  tolerance?: number;
  /** Frecuencias de detección por modo (Hz). */
  hz?: Partial<Record<Exclude<DetectionMode, 'off'>, number>>;
}

/**
 * Fachada del módulo LSM: cámara + detector + clasificador detrás de una API corta.
 * No depende de ningún motor de juego.
 *
 *   const lsm = new LsmEngine({ samples: samplesJson.samples });
 *   lsm.preload();                          // en el título: carga el modelo y lo "calienta"
 *   const ok = await lsm.enableCamera();    // si es false → jugar con teclado (lsm.errorReason)
 *   lsm.setMode('spell');
 *   const s = lsm.startSpell('CALMA', performance.now());
 *   // cada cuadro:  lsm.stepSpell(s, performance.now())   →  'ok' | 'miss' | null
 *   lsm.setMode('off');
 */
export class LsmEngine {
  readonly tracker: HandTracker;
  readonly classifier: SignClassifier;
  readonly video: HTMLVideoElement;
  private mode: DetectionMode = 'off';
  private hz: Record<Exclude<DetectionMode, 'off'>, number>;
  /** Última lectura (para la interfaz y la depuración). */
  last: StablePrediction | null = null;

  constructor(opts: LsmEngineOptions = {}) {
    this.video = opts.video ?? document.createElement('video');
    this.tracker = new HandTracker(this.video, opts.assetsPath ?? './mediapipe');
    this.classifier = new SignClassifier(opts.samples ?? {});
    this.classifier.tolerance = opts.tolerance ?? 0.5;
    this.hz = { spell: 18, shield: 12, ...opts.hz };
  }

  get status(): TrackerStatus {
    return this.tracker.status;
  }

  /** true si la cámara está lista y se puede deletrear con señas. */
  get cameraReady(): boolean {
    return this.tracker.hasCamera;
  }

  /** Motivo amable del último error de cámara ("permiso denegado", "no se encontró cámara"…). */
  get errorReason(): string {
    return this.tracker.errorReason;
  }

  get detectionMode(): DetectionMode {
    return this.mode;
  }

  /** Carga el modelo sin pedir la cámara (llámalo en el título; la primera inferencia tarda ~1.5 s). */
  preload(): Promise<void> {
    return this.tracker.loadModel();
  }

  /** Pide la cámara. Nunca lanza: devuelve false si no hay permiso o cámara. */
  async enableCamera(): Promise<boolean> {
    const ok = await this.tracker.start();
    if (ok) this.applyMode();
    return ok;
  }

  disableCamera(): void {
    this.tracker.stop();
  }

  setTolerance(t: number): void {
    this.classifier.tolerance = Math.min(1, Math.max(0, t));
  }

  /** Cambia la frecuencia de detección. Llama 'off' cuando no se usan señas para no gastar CPU/GPU. */
  setMode(mode: DetectionMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.classifier.reset();
    // La ayuda con la letra objetivo tiene sentido al deletrear, no en el escudo.
    this.classifier.assistTarget = mode === 'spell';
    this.applyMode();
  }

  private applyMode(): void {
    if (this.mode === 'off') this.tracker.setActive(false);
    else {
      this.tracker.setActive(false);
      this.tracker.setActive(true, this.hz[this.mode]);
    }
  }

  /**
   * Lee la letra estable en este momento. `target` = letra que se espera (en conjuros),
   * activa la ayuda para pares difíciles. Sin cámara devuelve letter = null.
   */
  read(now: number, target?: string): StablePrediction {
    this.last = this.classifier.update(this.cameraReady ? this.tracker.lastFrame : null, now, target);
    return this.last;
  }

  startSpell(word: string, now: number, options: Partial<SpellOptions> = {}): SpellSession {
    this.classifier.reset();
    return new SpellSession(word, now, options);
  }

  /** Un paso del deletreo con la cámara (llámalo cada cuadro). El teclado va por session.typeLetter. */
  stepSpell(session: SpellSession, now: number): LetterResult {
    const target = session.current;
    const p = this.read(now, target);
    const r = session.update(now, p.letter, p.stableMs);
    if (r) this.classifier.reset(); // la siguiente letra empieza limpia
    return r;
  }

  /** Diagnóstico para F3: 3 mejores letras y medidas de los dedos del último cuadro. */
  explain(): { top: string; metrics: string; motion: string } | null {
    const f = this.tracker.lastFrame;
    if (!f) return null;
    const e = explain(normalizeLandmarks(f.landmarks, f.handedness), this.classifier.tolerance);
    const motion = `Z: ${this.classifier.lastPointing ? 'apuntando ✔' : 'sin forma de apuntar'} · ${this.classifier.zTracker.debugText}`;
    return { ...e, motion };
  }

  /** Rendimiento de la detección (para el reporte y F3). */
  stats(): { detectHz: number; latencyMs: number } {
    return { detectHz: this.tracker.detectFps, latencyMs: this.tracker.avgLatencyMs };
  }
}
