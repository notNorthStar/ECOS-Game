import Phaser from 'phaser';
import type { EnemyApi, LevelTrigger, SectionId, SpellOutcomeEvent } from './contracts';

/**
 * Bus de eventos global y tipado. Es el ÚNICO canal entre sistemas de distintos dueños
 * (mundo, combate, conjuros, director, audio, HUD). Agrega eventos aquí si los necesitas,
 * sin cambiar la forma de los existentes.
 */
export interface BusEvents {
  // Jugador
  'player:shoot-request': { x: number; y: number; z: number; facing: 1 | -1 };
  'player:shot': { mode: 'green' | 'red' };
  'player:hurt': { hp: number; maxHp: number };
  'player:died': Record<string, never>;
  'player:dodge': Record<string, never>;
  'player:jump': Record<string, never>;
  'player:land': Record<string, never>;
  'player:step': Record<string, never>;
  // Conjuros
  'spell:begin': { spellId: string };
  'spell:letter': { letter: string; ok: boolean };
  'spell:resolved': SpellOutcomeEvent;
  'spell:learned': { spellId: string };
  // Enemigos
  'enemy:hit': { enemy: EnemyApi; kind: 'green' | 'red' | 'spell' };
  'enemy:exhausted': { enemy: EnemyApi };
  'enemy:purified': { enemy: EnemyApi; ecos: number; perfect: boolean };
  'enemy:removed': { enemy: EnemyApi };
  'boss:phase': { phase: 1 | 2 | 3 };
  'boss:vulnerable': { on: boolean };
  'boss:calmed': Record<string, never>;
  'antenna:destroyed': Record<string, never>;
  // Progresión
  'ecos:gained': { amount: number; x: number; y: number };
  'ecos:changed': { total: number };
  'upgrade:bought': { id: string; level: number };
  'fandango:progress': { recovered: number; total: number };
  // Nivel 3: escudo U, Luna, Cofradía, Cabeza Olmeca
  'shield:state': { active: boolean; energy: number; broken: boolean };
  'shield:block': { x: number; y: number };
  'luna:state': { active: boolean; energy: number };
  'balam:awake': Record<string, never>;
  'cofradia:down': { enemy: EnemyApi };
  'olmeca:phase': { phase: 1 | 2 | 3 };
  // Nivel 4: María en combate, bestias y pasaje, Bruja Guajolote
  'maria:assist': { kind: string; x: number; y: number };
  'maria:say': { text: string; ms?: number };
  'pasaje:revealed': { id: string };
  'bruja:form': { form: 'humana' | 'ave' };
  // Nivel 6: nahuales infiltrados, Nahuala, muñecas
  'nahual:reveal': { id: string; surprise: boolean };
  'nahual:revealed': { id: string };
  'nahual:fled': { id: string };
  'nahuala:illusion': { count: number };
  // Nivel 7: teleférico, corona del Rey, controles invertidos, la Llorona
  'cablecar:progress': { progress: number };
  'rey:crown': { hp: number; max: number; broken: boolean };
  'controls:invert': { on: boolean; ms: number };
  'llorona:scream': { x: number; y: number };
  'maria:transform': Record<string, never>;
  // Nivel 10: ataduras, Balam jaguar, la madre en el altar, Tzitzimime e Itzpapálotl
  'player:bound': { on: boolean };
  'balam:jaguar': { on: boolean };
  'balam:strike': { x: number; y: number };
  'madre:awake': { on: boolean };
  'madre:sign': { x: number; y: number; ms: number };
  'itzpa:stagger': { ms: number };
  'itzpa:core': { hits: number; max: number };
  'eclipse:progress': { progress: number };
  // Mundo / director
  'trigger:enter': { trigger: LevelTrigger };
  'interact': { id: string; action: string; data?: Record<string, unknown> };
  'zone:name': { title: string; subtitle?: string };
  'dialogue:start': { id: string };
  'dialogue:end': { id: string };
  'arena:start': { group: string };
  'arena:clear': { group: string };
  'checkpoint': { section: SectionId; x: number; y: number };
  'section:goto': { section: SectionId; spawn?: string };
  'hud:toast': { text: string; ms?: number };
  'objective': { x: number; y: number; section: SectionId } | null;
  // Juego
  'game:pause': { paused: boolean };
  'music': { track: string | null };
  'sfx': { name: string };
}

type Key = keyof BusEvents;

class TypedBus {
  private ee = new Phaser.Events.EventEmitter();
  on<K extends Key>(k: K, fn: (p: BusEvents[K]) => void, ctx?: unknown): this {
    this.ee.on(k, fn, ctx);
    return this;
  }
  once<K extends Key>(k: K, fn: (p: BusEvents[K]) => void, ctx?: unknown): this {
    this.ee.once(k, fn, ctx);
    return this;
  }
  off<K extends Key>(k: K, fn?: (p: BusEvents[K]) => void, ctx?: unknown): this {
    this.ee.off(k, fn, ctx);
    return this;
  }
  emit<K extends Key>(k: K, p: BusEvents[K]): void {
    this.ee.emit(k, p);
  }
  /**
   * Suscribe y se desuscribe solo cuando la escena se apaga (shutdown/destroy).
   * Úsalo SIEMPRE desde escenas y sistemas instalados en una escena: la LevelScene se reinicia
   * al cambiar de sección o morir, y los oyentes viejos no deben quedar vivos.
   */
  scoped<K extends Key>(scene: Phaser.Scene, k: K, fn: (p: BusEvents[K]) => void): void {
    this.ee.on(k, fn);
    const off = () => this.ee.off(k, fn);
    scene.events.once('shutdown', off);
    scene.events.once('destroy', off);
  }
}

export const bus = new TypedBus();

/** Atajos para efectos de sonido / música (los implementa systems/Audio.ts escuchando el bus). */
export const sfx = (name: string) => bus.emit('sfx', { name });
