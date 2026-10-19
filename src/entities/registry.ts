import type { EnemyApi, EnemySpec, WorldApi } from '../core/contracts';

// STUB — dueño: combate. Fábrica de enemigos que usa LevelScene.spawnEnemy().
export function createEnemy(world: WorldApi, spec: EnemySpec): EnemyApi {
  void world;
  throw new Error(`createEnemy sin implementar: ${spec.type}`);
}
