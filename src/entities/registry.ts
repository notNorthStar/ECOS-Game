import type { EnemyApi, EnemySpec, WorldApi } from '../core/contracts';
import { Chaneque } from './Chaneque';
import { ChanequeMayor } from './ChanequeMayor';
import { Encapuchado } from './Encapuchado';
import { Espiritu } from './Espiritu';
import { CabezaOlmeca } from './CabezaOlmeca';
import { Bestia } from './Bestia';
import { BrujaGuajolote } from './BrujaGuajolote';
import { Muneca } from './Muneca';
import { Nahual } from './Nahual';
import { Nahuala } from './Nahuala';
import { ReyOlvido } from './ReyOlvido';

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
    // Nivel 3 (dueño: enemigos).
    case 'encapuchado':
      return new Encapuchado(world, spec.x, spec.y, spec.rank ?? 'rojo', spec.group);
    case 'espiritu':
      return new Espiritu(world, spec.x, spec.y, spec.lunaOnly ?? true, spec.group);
    case 'cabeza_olmeca':
      return new CabezaOlmeca(world, spec.x, spec.y, spec.group);
    // Nivel 4 (dueño: enemigos). group en bestias: arena y/o las que abren el pasaje (las de grupo no se retiran).
    case 'bestia':
      return new Bestia(world, spec.x, spec.y, spec.group);
    case 'bruja_guajolote':
      return new BrujaGuajolote(world, spec.x, spec.y, spec.group);
    // Nivel 6 (dueño: enemigos). Nahual: id (lo despierta 'nahual:reveal') y disguise (textura del NPC; sin ella ya está transformado).
    case 'muneca':
      return new Muneca(world, spec.x, spec.y, spec.group);
    case 'nahual':
      return new Nahual(world, spec.x, spec.y, { id: spec.id, disguise: spec.disguise, group: spec.group });
    case 'nahuala':
      return new Nahuala(world, spec.x, spec.y, spec.group);
    // Nivel 7 (dueño: enemigos). Jefe del salón del trono; sus clones de memoria son internos (ReyClon).
    case 'rey_olvido':
      return new ReyOlvido(world, spec.x, spec.y, spec.group);
    default: {
      const t: never = spec.type;
      throw new Error(`Tipo de enemigo desconocido: ${String(t)}`);
    }
  }
}
