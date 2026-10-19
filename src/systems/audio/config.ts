/**
 * Configuración del audio: mapeo de pistas del juego a archivos de música del equipo.
 *
 * Los archivos viven en `public/assets/audio/musica/` (se admiten .ogg y .mp3).
 * Orden de búsqueda para una pista `X`:
 *   1. `musica_X.ogg`  2. `musica_X.mp3`  3. el archivo indicado aquí.
 * Si ninguno existe, la pista se sintetiza (comportamiento de siempre).
 *
 * `intro` (opcional) suena una sola vez y, sin corte, entra `bucle` repitiéndose.
 * `volumen` (opcional, 0..1) ajusta la ganancia de la pista (por defecto 0.9).
 */
export interface ArchivoPista {
  bucle: string;
  intro?: string;
  volumen?: number;
}

export const MAPA_MUSICA: Record<string, ArchivoPista> = {
  n01_exploracion: { bucle: 'InstrumentalNivel1Calle.mp3' },
  n01_taller: { bucle: 'InstrumentalNivel1Casa.mp3' },
  n01_combate: { intro: 'IntroPelea.mp3', bucle: 'LoopPelea.mp3' },
};
