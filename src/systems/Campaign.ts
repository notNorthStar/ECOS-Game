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
