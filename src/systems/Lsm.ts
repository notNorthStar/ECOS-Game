import { CameraView, LsmEngine } from '../lsm';

// Dueño: lsm. Instancia ÚNICA del motor de LSM y de la vista de cámara (MODULO_LSM.md §2).
// Revisa ecos-lsm/README.md §4 para las opciones del constructor; ajusta aquí si hace falta.
export const lsm = new LsmEngine();
export const camView = new CameraView(lsm.video);
