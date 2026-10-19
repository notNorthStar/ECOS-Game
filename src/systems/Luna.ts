import type { WorldApi } from '../core/contracts';
import { GameState } from '../core/GameState';

// STUB — dueño: sistemas (Nivel 3). Habilidad Luna con Balam (GDD §7). LevelScene llama installLuna(world).
// Tecla F: filtro visual + barra que se gasta y se recarga. Revela entidades con lunaOnly.

/** ¿Luna está activa ahora? Las entidades lunaOnly solo se ven, se golpean y atacan si devuelve true. */
export function isLunaActive(): boolean {
  return GameState.luna.unlocked && GameState.luna.active;
}

export function installLuna(world: WorldApi): void {
  void world;
}
