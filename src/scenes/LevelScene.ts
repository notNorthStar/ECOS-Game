import Phaser from 'phaser';
import type { LevelData, SectionId, WorldApi } from '../core/contracts';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { SECTIONS, isCatemaco, isCdmx, isOaxaca } from '../config/game';
import { keys } from '../config/controls';
import { CAMERA } from '../config/movement';
import { installCombat } from '../systems/Combat';
import { installCasting } from '../systems/Casting';
import { installDirector } from '../systems/Director';
import { World, type RestartRequest } from '../world/World';
import { installTuxtlaScenery } from '../world/TuxtlaScenery';
import { installCatemacoScenery } from '../world/CatemacoScenery';
import { installShield } from '../systems/Shield';
import { installLuna } from '../systems/Luna';
import { installMaria } from '../systems/Maria';
import { installOaxacaScenery } from '../world/OaxacaScenery';
import { installCdmxScenery } from '../world/CdmxScenery';

// Las secciones se cargan del JSON en build (src/data/levels/*.json). Si falta, se usa sandbox.json.
const LEVELS = import.meta.glob('../data/levels/*.json', { eager: true }) as Record<string, { default?: LevelData } & LevelData>;

function loadLevel(section: string): LevelData {
  const mod = LEVELS[`../data/levels/${section}.json`] ?? LEVELS['../data/levels/sandbox.json'];
  if (!LEVELS[`../data/levels/${section}.json`]) console.warn(`[mundo] no existe la sección "${section}": uso sandbox.json`);
  return (mod.default ?? mod) as LevelData;
}

const isSection = (s: string): s is SectionId => (SECTIONS as readonly string[]).includes(s);

/**
 * Escena del nivel (clave 'Level', dueño: mundo). La API del mundo (WorldApi) está en `this.world`
 * (src/world/World.ts): es lo que reciben installCombat / installCasting / installDirector.
 * init({ section, spawn?, pos? }): section = id de src/data/levels/<id>.json (también 'sandbox').
 */
export class LevelScene extends Phaser.Scene {
  private static usedQuery = false;
  world!: World;
  private section = 'taller';
  private spawnKey?: string;
  private pos?: { x: number; y: number };

  constructor() {
    super('Level');
  }

  init(data: { section?: string; spawn?: string; pos?: { x: number; y: number } }): void {
    this.section = data?.section ?? GameState.section ?? 'taller';
    // Prueba directa: ?seccion=sandbox en la URL fuerza la sección la primera vez.
    const q = new URLSearchParams(location.search).get('seccion');
    if (q && !LevelScene.usedQuery) {
      LevelScene.usedQuery = true;
      this.section = q;
    }
    this.spawnKey = data?.spawn;
    this.pos = data?.pos;
    if (isSection(this.section)) GameState.section = this.section;
  }

  create(): void {
    const level = loadLevel(this.section);
    const start = this.pos ?? (this.spawnKey ? level.spawns?.[this.spawnKey] : undefined) ?? level.spawn;
    keys.endFrame();

    this.world = new World(this, level, start, this.spawnKey, (req) => this.restartWith(req));
    const world: WorldApi = this.world;
    if (level.id === 'tuxtla') installTuxtlaScenery(world);
    if (isCatemaco(level.id)) installCatemacoScenery(world);
    if (isOaxaca(level.id)) installOaxacaScenery(world);
    if (isCdmx(level.id)) installCdmxScenery(world);

    // Sistemas de los otros dueños. Un error en uno no debe tumbar el nivel.
    // Escudo y Luna se instalan siempre: no hacen nada mientras no estén desbloqueados (GameState).
    for (const [name, install] of [
      ['Combat', installCombat],
      ['Casting', installCasting],
      ['Shield', installShield],
      ['Luna', installLuna],
      ['Maria', installMaria],
      ['Director', installDirector],
    ] as const) {
      try {
        install(world);
      } catch (err) {
        console.error(`[mundo] install${name} falló`, err);
      }
    }

    if (!this.scene.isActive('Hud')) this.scene.launch('Hud');

    this.cameras.main.fadeIn(CAMERA.fadeMs, 0, 0, 0);
    bus.emit('zone:name', { title: level.name });
    if (level.music) bus.emit('music', { track: level.music });

    // Limpieza al reiniciar.
    this.events.on('resume', this.onResume, this);
    this.events.once('shutdown', () => {
      this.events.off('resume', this.onResume, this);
      this.world.unlockArena();
      this.tweens.timeScale = 1;
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    // Esc, Tab y la salida de pantalla completa los maneja installCasting (openPause / openDiario).
    this.world.update(dt);
    keys.endFrame();
  }

  private onResume(): void {
    // Las teclas pulsadas en el menú no deben llegar al juego (Esc reabriría la pausa).
    keys.endFrame();
    bus.emit('game:pause', { paused: false });
  }

  private restartWith(req: RestartRequest): void {
    this.scene.restart({ section: req.section, spawn: req.spawn, pos: req.pos });
  }
}
