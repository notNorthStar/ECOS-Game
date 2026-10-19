import type { EnemyApi, EnemySpec, WorldApi } from '../core/contracts';
import { Chaneque } from './Chaneque';
import { ChanequeMayor } from './ChanequeMayor';

/**
 * Fábrica de enemigos (dueño: combate). La usa LevelScene.spawnEnemy(spec):
 * crea la entidad (sprite y sombra en la escena) pero NO la agrega al mundo;
 * spawnEnemy debe llamar world.add(e). Al purificarse o retirarse, la entidad
 * se quita sola con world.remove(this) + destroy() y emite 'enemy:removed'.
 */
export function createEnemy(world: WorldApi, spec: EnemySpec): EnemyApi {
  switch (spec.type) {
    case 'chaneque':
      return new Chaneque(world, spec.x, spec.y, spec.variant ?? 'patrulla', spec.group);
    case 'chaneque_mayor':
      return new ChanequeMayor(world, spec.x, spec.y, spec.group);
    default: {
      const t: never = spec.type;
      throw new Error(`Tipo de enemigo desconocido: ${String(t)}`);
    }
  }
}
