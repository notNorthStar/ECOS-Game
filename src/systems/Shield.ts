import type { Hit, WorldApi } from '../core/contracts';
import { GameState } from '../core/GameState';

// STUB — dueño: sistemas (Nivel 3). Escudo U (GDD §6.5). LevelScene llama installShield(world).
// Con cámara: la seña U sostenida (HoldDetector, lsm.setMode('shield')); sin cámara: clic derecho mantenido.

/** ¿El escudo está levantado ahora? (Player no dispara y Casting no lanza mientras esté activo.) */
export function isShieldActive(): boolean {
  return GameState.shield.unlocked && GameState.shield.active;
}

/**
 * Todo golpe de un enemigo al jugador pasa por aquí (EnemyBase.hitPlayer). Devuelve el golpe reducido,
 * o null si el escudo lo absorbió por completo. También gasta barra y puede repeler (emite 'shield:block').
 */
export function shieldFilterHit(world: WorldApi, hit: Hit): Hit | null {
  void world;
  return hit;
}

export function installShield(world: WorldApi): void {
  void world;
}
