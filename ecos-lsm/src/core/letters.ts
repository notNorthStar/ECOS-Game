import lettersData from '../data/letters.json';

export type FingerState = 'ext' | 'curl' | 'bent' | 'touch' | 'across';

export interface LetterDef {
  fingers: Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', FingerState>;
  orientation: string;
  desc: string;
  review: boolean;
  source?: string;
  crossed?: boolean;
  spread?: boolean;
  /** Grados para girar el esquema (G y H apuntan de lado; M y N hacia abajo). */
  rotation?: number;
  /** Letra con movimiento: trayectoria a trazar (por ahora "Z"). */
  motion?: string;
}

/** Formas de mano de cada letra soportada (para mostrar la seña y para la documentación). */
export const LETTERS = lettersData.letters as unknown as Record<string, LetterDef>;

/** Letras que el módulo reconoce con la cámara (estáticas + Z por trayectoria). */
export const SUPPORTED_LETTERS: ReadonlySet<string> = new Set(Object.keys(LETTERS));

/** Letras que se reconocen por trayectoria (src/core/motion.ts). */
export const MOTION_LETTERS: ReadonlySet<string> = new Set(
  Object.entries(LETTERS)
    .filter(([, d]) => d.motion)
    .map(([l]) => l),
);

/**
 * Convierte el nombre de un conjuro en la lista de letras a deletrear:
 * mayúsculas, sin acentos (PROTECCIÓN → PROTECCION), sin espacios ni signos.
 * Ojo: la Ñ se conserva (no es una N con acento) y NO está soportada.
 */
export function spellLetters(word: string): string[] {
  return word
    .toUpperCase()
    .replace(/Ñ/g, '\u0000')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'Ñ')
    .replace(/[^A-ZÑ]/g, '')
    .split('');
}

export interface WordCheck {
  ok: boolean;
  letters: string[];
  /** Letras que la cámara no puede reconocer (el conjuro solo se podría hacer con teclado). */
  unsupported: string[];
  tooLong: boolean;
}

/** Valida que un conjuro se pueda deletrear con la cámara (GDD 6.6: letras permitidas, máximo 10). */
export function checkWord(word: string, maxLetters = 10): WordCheck {
  const letters = spellLetters(word);
  const unsupported = [...new Set(letters.filter((l) => !SUPPORTED_LETTERS.has(l)))];
  const tooLong = letters.length > maxLetters;
  return { ok: unsupported.length === 0 && !tooLong && letters.length > 0, letters, unsupported, tooLong };
}
