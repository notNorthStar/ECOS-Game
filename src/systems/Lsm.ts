import samples from '../lsm/data/samples.json';
import { CameraView, LsmEngine, type SampleBank } from '../lsm';

// Dueño: lsm. Instancia ÚNICA del motor de LSM y de la vista de cámara (MODULO_LSM.md §2, README §4.2).
export const lsm = new LsmEngine({ samples: samples.samples as unknown as SampleBank, tolerance: 0.5 });
export const camView = new CameraView(lsm.video);

/** Coloca la vista de la cámara en coordenadas del juego (640×360), proporción 4:3. */
export function showCamera(canvas: HTMLCanvasElement, x = 504, y = 8, w = 128, h = 96): void {
  if (!lsm.cameraReady) return;
  camView.placeOver(canvas, x, y, w, h, 640, 360);
}
