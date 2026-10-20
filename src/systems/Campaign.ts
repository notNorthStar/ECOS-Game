import { GameState } from '../core/GameState';

/** Entrada a Los Tuxtlas desde Xalapa o la selección directa de nivel. Conserva mejoras y maestría. */
export function prepareTuxtlaEntry(): void {
  GameState.section = 'tuxtla';
  GameState.hasLaser = true;
  for (const id of ['CALMA', 'PROTECCION']) {
    if (!GameState.learnedSpells.includes(id)) GameState.learnedSpells.push(id);
    GameState.mastery[id] ??= { level: 0, progress: 0 };
  }
  GameState.selectedSpell = 'CALMA';
  GameState.hp = GameState.maxHp;
  GameState.checkpoint = null;
  GameState.casting = false;
  GameState.flags.codice = true;
}

/**
 * Entrada a Catemaco (Nivel 3) desde el final de Los Tuxtlas o la selección directa de nivel.
 * Conserva Ecos, mejoras y maestría; garantiza lo que el jugador ya debería tener tras el Nivel 2.
 */
export function prepareCatemacoEntry(): void {
  prepareTuxtlaEntry();
  GameState.section = 'catemaco';
  if (!GameState.learnedSpells.includes('VOZ')) GameState.learnedSpells.push('VOZ');
  GameState.mastery.VOZ ??= { level: 0, progress: 0 };
  GameState.flags['n02:completo'] = true;
  GameState.flags['n02:fragmento'] = true;
}

/**
 * Entrada a Oaxaca (Nivel 4) desde la salida de Catemaco o la selección directa de nivel.
 * Garantiza lo obtenido en el Nivel 3: LUZ, SOL, escudo U, Balam + Luna y María como compañera.
 */
export function prepareOaxacaEntry(): void {
  prepareCatemacoEntry();
  GameState.section = 'oaxaca';
  for (const id of ['LUZ', 'SOL']) {
    if (!GameState.learnedSpells.includes(id)) GameState.learnedSpells.push(id);
    GameState.mastery[id] ??= { level: 0, progress: 0 };
  }
  GameState.shield.unlocked = true;
  GameState.shield.broken = false;
  GameState.shield.active = false;
  GameState.luna.unlocked = true;
  GameState.luna.active = false;
  GameState.hasBalam = true;
  GameState.hasMaria = true;
  GameState.checkpoint = null;
  GameState.flags['n03:completo'] = true;
  GameState.flags['n03:maria'] = true;
}

/**
 * Entrada a la CDMX (Nivel 6) desde la salida de Oaxaca o la selección directa de nivel.
 * Puebla (Nivel 5) se omite: el jugador llega con MEMORIA y 3 fragmentos (2.º y 3.º se dan en Oaxaca).
 */
export function prepareCdmxEntry(): void {
  prepareOaxacaEntry();
  GameState.section = 'xochimilco';
  if (!GameState.learnedSpells.includes('MEMORIA')) GameState.learnedSpells.push('MEMORIA');
  GameState.mastery.MEMORIA ??= { level: 0, progress: 0 };
  GameState.checkpoint = null;
  for (const f of ['n04:completo', 'n04:fragmento', 'n04:fragmento_3']) GameState.flags[f] = true;
}

/**
 * Entrada a la CDMX parte 2 (Nivel 7) desde la estación del teleférico del Nivel 6 o el selector de niveles.
 * Garantiza VERDAD, FUEGO y DESCANSO; María sigue con el grupo (se transforma en la Llorona en este nivel).
 */
export function prepareCdmx2Entry(): void {
  prepareCdmxEntry();
  GameState.section = 'teleferico';
  for (const id of ['VERDAD', 'FUEGO', 'DESCANSO']) {
    if (!GameState.learnedSpells.includes(id)) GameState.learnedSpells.push(id);
    GameState.mastery[id] ??= { level: 0, progress: 0 };
  }
  GameState.hasMaria = true;
  GameState.checkpoint = null;
  for (const f of ['n06:completo', 'n06:nahuala', 'cdmx:visitada']) GameState.flags[f] = true;
}
