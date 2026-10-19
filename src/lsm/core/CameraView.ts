import { HAND_CONNECTIONS, type HandFrame } from './types';

/**
 * Vista previa de la cámara como elemento DOM encima del juego (sin depender del motor).
 * El video y el lienzo de puntos se muestran en ESPEJO, que es lo natural para quien seña.
 *
 *   const view = new CameraView(engine.video);           // crea el contenedor en <body>
 *   view.show({ left: 900, top: 20, width: 256, height: 192 });   // px de pantalla
 *   view.drawLandmarks(engine.tracker.lastFrame);        // solo en depuración (F3)
 *   view.hide();
 *
 * Para colocarla sobre una esquina del canvas del juego usa `placeOver(canvas, x, y, w, h, gameW, gameH)`,
 * con coordenadas en píxeles del juego. Usa proporción 4:3 (la de la cámara) para que no se recorte.
 */
export class CameraView {
  readonly box: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(
    readonly video: HTMLVideoElement,
    parent: HTMLElement = document.body,
  ) {
    this.box = document.createElement('div');
    Object.assign(this.box.style, {
      position: 'fixed',
      display: 'none',
      pointerEvents: 'none',
      border: '2px solid #3cc4b8',
      borderRadius: '4px',
      overflow: 'hidden',
      background: '#000',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    this.canvas = document.createElement('canvas');
    for (const el of [video, this.canvas]) {
      Object.assign(el.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: 'scaleX(-1)',
      } satisfies Partial<CSSStyleDeclaration>);
      this.box.appendChild(el);
    }
    video.playsInline = true;
    video.muted = true;
    parent.appendChild(this.box);
    this.ctx = this.canvas.getContext('2d')!;
  }

  show(rect: { left: number; top: number; width: number; height: number }): void {
    Object.assign(this.box.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: 'block',
    });
  }

  /** Coloca la vista sobre el canvas del juego, en coordenadas del juego (p. ej. 640×360). */
  placeOver(gameCanvas: HTMLCanvasElement, x: number, y: number, w: number, h: number, gameW: number, gameH: number): void {
    const r = gameCanvas.getBoundingClientRect();
    const sx = r.width / gameW;
    const sy = r.height / gameH;
    this.show({ left: r.left + x * sx, top: r.top + y * sy, width: w * sx, height: h * sy });
  }

  hide(): void {
    this.box.style.display = 'none';
    this.clear();
  }

  setBorder(color: string): void {
    this.box.style.borderColor = color;
  }

  /** Dibuja el esqueleto de la mano (21 puntos). Úsalo en depuración o en la grabadora. */
  drawLandmarks(frame: HandFrame | null, color = '#7dffb0'): void {
    const w = (this.canvas.width = this.box.clientWidth || 160);
    const h = (this.canvas.height = this.box.clientHeight || 120);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    if (!frame) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = frame.landmarks[a];
      const q = frame.landmarks[b];
      ctx.beginPath();
      ctx.moveTo(p.x * w, p.y * h);
      ctx.lineTo(q.x * w, q.y * h);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (const p of frame.landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy(): void {
    this.box.remove();
  }
}
