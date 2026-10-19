import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandFrame, TrackerStatus } from './types';

/**
 * Envoltura de MediaPipe HandLandmarker.
 *  - Modelo y WASM se sirven desde el propio juego (public/mediapipe/), nunca desde un CDN.
 *  - La cámara solo se pide cuando el jugador la activa.
 *  - La detección corre solo mientras `active` es true (durante los conjuros), limitada a `hz`.
 * No depende de Phaser.
 */
export class HandTracker {
  status: TrackerStatus = 'sin-camara';
  errorReason = '';
  /** Último cuadro detectado (null si no hay mano). */
  lastFrame: HandFrame | null = null;
  /** Latencia promedio (ms) de las últimas detecciones. */
  avgLatencyMs = 0;
  /** Detecciones por segundo reales. */
  detectFps = 0;

  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement;
  private loadPromise: Promise<void> | null = null;
  private active = false;
  private hz = 18;
  private lastDetect = 0;
  private lastVideoTime = -1;
  private rafId = 0;
  private fpsCount = 0;
  private fpsSince = 0;
  private listeners = new Set<(f: HandFrame | null) => void>();
  private statusListeners = new Set<(s: TrackerStatus) => void>();

  constructor(
    video: HTMLVideoElement,
    private basePath = './mediapipe',
  ) {
    this.video = video;
  }

  get videoElement(): HTMLVideoElement {
    return this.video;
  }

  get hasCamera(): boolean {
    return this.status === 'listo';
  }

  onFrame(fn: (f: HandFrame | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: TrackerStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: TrackerStatus, reason = ''): void {
    this.status = s;
    this.errorReason = reason;
    for (const fn of this.statusListeners) fn(s);
  }

  /** Carga el modelo (se puede llamar varias veces; solo carga una). */
  loadModel(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const fileset = await FilesetResolver.forVisionTasks(`${this.basePath}/wasm`);
        const opts = (delegate: 'GPU' | 'CPU') => ({
          baseOptions: { modelAssetPath: `${this.basePath}/hand_landmarker.task`, delegate },
          runningMode: 'VIDEO' as const,
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        try {
          this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU'));
        } catch (err) {
          console.warn('[HandTracker] GPU no disponible, uso CPU:', err);
          this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU'));
        }
        // Detección de calentamiento: la primera inferencia es la más lenta.
        const warm = document.createElement('canvas');
        warm.width = warm.height = 64;
        warm.getContext('2d')?.fillRect(0, 0, 64, 64);
        this.landmarker.detectForVideo(warm, performance.now());
      })();
      this.loadPromise.catch(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  /** Pide la cámara y deja todo listo. Nunca lanza: en error queda status = 'error'. */
  async start(): Promise<boolean> {
    if (this.status === 'listo') return true;
    this.setStatus('cargando');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('el navegador no permite cámara');
      const modelP = this.loadModel();
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      this.video.srcObject = this.stream;
      this.video.muted = true;
      await this.video.play();
      await modelP;
      this.setStatus('listo');
      return true;
    } catch (err) {
      const e = err as Error & { name?: string };
      const reason =
        e?.name === 'NotAllowedError'
          ? 'permiso denegado'
          : e?.name === 'NotFoundError'
            ? 'no se encontró cámara'
            : e?.name === 'NotReadableError'
              ? 'la cámara está ocupada por otra aplicación'
              : e?.message || 'error desconocido';
      console.warn('[HandTracker] sin cámara:', err);
      this.stop();
      this.setStatus('error', reason);
      return false;
    }
  }

  /** Apaga la cámara (el modelo queda cargado). */
  stop(): void {
    this.setActive(false);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    if (this.status === 'listo') this.setStatus('sin-camara');
  }

  /** Activa o desactiva el ciclo de detección. */
  setActive(on: boolean, hz = this.hz): void {
    this.hz = hz;
    if (on === this.active) return;
    this.active = on;
    if (on && this.status === 'listo') {
      this.fpsSince = performance.now();
      this.fpsCount = 0;
      this.loop();
    } else {
      cancelAnimationFrame(this.rafId);
      this.lastFrame = null;
    }
  }

  private loop = (): void => {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastDetect < 1000 / this.hz) return;
    this.lastDetect = now;
    this.detectOnce(now);
  };

  /** Ejecuta una detección inmediata (también la usa la grabadora F9). */
  detectOnce(now = performance.now()): HandFrame | null {
    if (!this.landmarker || this.status !== 'listo' || this.video.readyState < 2) return null;
    if (this.video.currentTime === this.lastVideoTime) return this.lastFrame;
    this.lastVideoTime = this.video.currentTime;
    const t0 = performance.now();
    let frame: HandFrame | null = null;
    try {
      const res = this.landmarker.detectForVideo(this.video, now);
      const latencyMs = performance.now() - t0;
      this.avgLatencyMs = this.avgLatencyMs ? this.avgLatencyMs * 0.85 + latencyMs * 0.15 : latencyMs;
      if (res.landmarks.length > 0) {
        frame = {
          landmarks: res.landmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z })),
          handedness: res.handedness[0]?.[0]?.categoryName ?? 'Right',
          latencyMs,
          timestamp: now,
        };
      }
    } catch (err) {
      console.warn('[HandTracker] fallo de detección:', err);
    }
    this.fpsCount++;
    if (now - this.fpsSince >= 1000) {
      this.detectFps = (this.fpsCount * 1000) / (now - this.fpsSince);
      this.fpsCount = 0;
      this.fpsSince = now;
    }
    this.lastFrame = frame;
    for (const fn of this.listeners) fn(frame);
    return frame;
  }
}
