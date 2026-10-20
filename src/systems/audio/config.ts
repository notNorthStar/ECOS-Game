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

/**
 * Soundtracks del equipo (rama `soundtrack`, 2026-10-19), asignados por su nombre:
 * - InstrumentalMenuInicio → menú de inicio.
 * - Nivel1_Calle_Chaneques (intro + loop) → calles de Xalapa con chaneques; InstrumentalNivel1Calle → parque.
 * - IntroPelea / LoopPelea → arenas de combate; IntroPeleaChanequeMayor / LoopPeleaChanequeMayor → jefe del Nivel 1.
 * - Nivel2_Calle_Chaneques (intro + loop) → San Andrés Tuxtla mientras se buscan las estrofas (el fandango por
 *   capas, sintetizado, suena al reconstruirlo en la tarima: la grabación no puede representar las capas ausentes).
 * - Nivel3_Calle_Loop → pueblo de Catemaco.
 * - IntroPeleaReyDelOlvido / LoopPeleaReyDelOlvido → jefe del Nivel 7.
 * - ReencuentroConMama → el reencuentro con la madre al final del Nivel 10.
 */
export const MAPA_MUSICA: Record<string, ArchivoPista> = {
  titulo: { bucle: 'InstrumentalMenuInicio.mp3' },
  n01_taller: { bucle: 'InstrumentalNivel1Casa.mp3' },
  n01_calles: { intro: 'Nivel1_Calle_ChanequesIntro.mp3', bucle: 'Nivel1_Calle_Chaneques_Loop.mp3' },
  n01_exploracion: { bucle: 'InstrumentalNivel1Calle.mp3' },
  n01_combate: { intro: 'IntroPelea.mp3', bucle: 'LoopPelea.mp3' },
  n01_jefe: { intro: 'IntroPeleaChanequeMayor.mp3', bucle: 'LoopPeleaChanequeMayor.mp3' },
  n02_calle: { intro: 'Nivel2_Calle_Chaneques_Intro.mp3', bucle: 'Nivel2_Calle_Chaneques_Loop.mp3' },
  n03_pueblo: { bucle: 'Nivel3_Calle_Loop.mp3' },
  n07_jefe: { intro: 'IntroPeleaReyDelOlvido.mp3', bucle: 'LoopPeleaReyDelOlvido.mp3' },
  n10_reencuentro: { bucle: 'ReencuentroConMama.mp3' },
};
