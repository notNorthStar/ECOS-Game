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
