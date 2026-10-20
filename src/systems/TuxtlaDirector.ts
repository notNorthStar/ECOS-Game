import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import type { WorldApi } from '../core/contracts';
import { DEPTH } from '../config/game';
import { playDialogue } from '../scenes/DialogueScene';
import { startLearning } from './Casting';
import { installInteract, markUsed, type Interactable } from './Interact';
import { installLightTrail, setObjective } from './LightTrail';
import { addEcos } from './Progression';
import config from '../data/tuxtla.json';
import { prepareCatemacoEntry } from './Campaign';

const flag = (key: string) => !!GameState.flags[`n02:${key}`];
const remember = (key: string) => { GameState.flags[`n02:${key}`] = true; };

/** Misión musical sin jefe. Todos los hitos sobreviven al reinicio por muerte. */
export function installTuxtlaDirector(world: WorldApi): void {
  new TuxtlaDirector(world);
}

class TuxtlaDirector {
  private alive = true;
  private busy = true;
  private ready = false;
  private counter: Phaser.GameObjects.Text;

  constructor(private world: WorldApi) {
    const scene = world.scene;
    this.counter = scene.add.text(config.hud.x, config.hud.y, '', {
      fontFamily: 'monospace', fontSize: `${config.hud.fontSize}px`,
      color: '#fff0ce', backgroundColor: '#171521cc', padding: { x: 5, y: 4 },
      lineSpacing: 3,
    }).setScrollFactor(0).setDepth(DEPTH.ui);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.ready = false;
      setObjective(null);
    });
    installInteract(world, { enabled: (it) => this.enabled(it) });
    installLightTrail(world);
    bus.scoped(scene, 'interact', ({ id }) => {
      const it = world.level.interactables.find((entry) => entry.id === id);
      if (it && this.enabled(it)) void this.interact(it);
    });
    GameState.section = world.level.id;
    GameState.flags.gema = true;
    if (GameState.checkpoint?.section !== world.level.id) {
      const cp = world.level.spawns?.checkpoint ?? world.level.spawn;
      this.checkpoint(cp);
    }
    // No se puede recoger una estrofa durante el cuadro previo a la introducción.
    world.player.controlsLocked = true;
    this.refresh();
    scene.time.delayedCall(100, () => void this.intro());
  }

  private get recovered(): number {
    return config.verses.filter((id) => flag(`estrofa:${id}`)).length;
  }

  private toast(text: string): void {
    bus.emit('hud:toast', { text, ms: config.toastMs });
  }

  private checkpoint(point: { x: number; y: number }): void {
    const section = this.world.level.id;
    GameState.checkpoint = { section, ...point };
    bus.emit('checkpoint', { section, ...point });
  }

  private async intro(): Promise<void> {
    if (!this.alive) return;
    bus.emit('zone:name', { title: 'SAN ANDRÉS TUXTLA', subtitle: 'La música perdida' });
    // Soundtrack del equipo mientras se buscan las estrofas; el fandango por capas suena al reconstruirlo.
    bus.emit('music', { track: flag('fandango') ? 'n02_fandango' : 'n02_calle' });
    this.progress();
    if (!flag('intro')) {
      await playDialogue(this.world.scene, 'n02_intro');
      if (!this.alive) return;
      remember('intro');
      this.toast('Punto de control: letras de SAN ANDRÉS TUXTLA');
    }
    this.world.player.controlsLocked = false;
    this.ready = true;
    this.busy = false;
    this.refresh();
  }

  private enabled(it: Interactable): boolean {
    if (!this.alive || !this.ready || this.busy) return false;
    if (it.action === 'n02_estrofa') {
      const id = it.data?.verseId;
      return typeof id === 'string' && config.verses.includes(id) && !flag(`estrofa:${id}`);
    }
    return ['n02_musicos', 'n02_fandango', 'n02_salida', 'altar', 'n02_examinar'].includes(it.action);
  }

  private progress(): void {
    bus.emit('fandango:progress', { recovered: this.recovered, total: config.verses.length });
  }

  private refresh(): void {
    if (!this.alive) return;
    let text: string;
    let target: Interactable | undefined;
    const find = (action: string) => this.world.level.interactables.find((it) => it.action === action);
    if (flag('completo')) {
      text = 'Primer fragmento del Sello recuperado\nRumbo a Catemaco · E en la salida para seguir el viaje';
      target = find('n02_salida');
    } else if (!flag('musicos')) {
      text = 'Habla con los músicos de la plaza';
      target = find('n02_musicos');
    } else if (this.recovered < config.verses.length) {
      text = 'Recupera las estrofas · calma a sus guardianes';
      target = this.world.level.interactables.find((it) =>
        it.action === 'n02_estrofa' && !flag(`estrofa:${String(it.data?.verseId)}`));
    } else {
      text = 'Vuelve a la tarima y reconstruye el fandango';
      target = find('n02_fandango');
    }
    this.counter.setText(`ESTROFAS ${this.recovered}/${config.verses.length}\n${text}`);
    const objective = target ? { x: target.x, y: target.y, section: this.world.level.id } : null;
    setObjective(objective);
    bus.emit('objective', objective);
  }

  private async interact(it: Interactable): Promise<void> {
    this.busy = true;
    const prevLocked = this.world.player.controlsLocked;
    const prevScale = this.world.timeScale;
    // Leer recuerdos o conversar no deja al jugador expuesto a enemigos que lleguen desde lejos.
    this.world.timeScale = 0;
    this.world.player.controlsLocked = true;
    try {
      switch (it.action) {
        case 'n02_musicos':
          await playDialogue(this.world.scene, flag('completo') ? 'n02_final' : 'n02_musicos');
          if (this.alive) remember('musicos');
          break;
        case 'n02_estrofa':
          await this.verse(it);
          break;
        case 'n02_fandango':
          await this.fandango();
          break;
        case 'altar': {
          GameState.hp = GameState.maxHp;
          this.checkpoint(this.world.level.spawns?.altar ?? { x: it.x, y: it.y + 28 });
          sfx('altar');
          const sm = this.world.scene.scene;
          // El menú reanuda Level y requiere que el bloqueo ya esté restaurado.
          this.world.player.controlsLocked = prevLocked;
          sm.launch('Altar', { section: this.world.level.id, x: it.x, y: it.y });
          sm.bringToTop('Altar');
          sm.pause();
          break;
        }
        case 'n02_salida':
          if (!flag('completo')) this.toast('El pueblo aún necesita recuperar su música.');
          else {
            await playDialogue(this.world.scene, 'n02_salida');
            if (!this.alive) return;
            // Continuidad: el viaje sigue a Catemaco (Nivel 3).
            prepareCatemacoEntry();
            this.world.gotoSection('catemaco');
          }
          break;
        case 'n02_examinar': {
          const dialogue = it.data?.dialogue;
          if (typeof dialogue === 'string') await playDialogue(this.world.scene, dialogue);
          break;
        }
      }
    } finally {
      if (this.alive) {
        this.busy = false;
        this.world.player.controlsLocked = prevLocked;
        this.world.timeScale = prevScale;
        this.refresh();
      }
    }
  }

  private async verse(it: Interactable): Promise<void> {
    const id = String(it.data?.verseId);
    if (!config.verses.includes(id) || flag(`estrofa:${id}`)) return;
    if (!flag('musicos')) {
      this.toast('Habla primero con los músicos para reconocer los versos perdidos.');
      return;
    }
    if (this.world.enemies.some((enemy) => enemy.alive && !enemy.purified &&
      Math.hypot(enemy.x - it.x, enemy.y - it.y) < config.guardRadius)) {
      this.toast('Calma a los chaneques cercanos para escuchar este recuerdo.');
      return;
    }
    await playDialogue(this.world.scene, `n02_estrofa_${id}`);
    if (!this.alive) return;
    remember(`estrofa:${id}`);
    markUsed(this.world, it.id);
    // Premio directo: morir antes de alcanzar un orbe no pierde una recompensa ya marcada.
    addEcos(config.rewards.verse);
    sfx('conjuro_ok');
    this.progress();
    this.toast(`La música vuelve: estrofa ${this.recovered} de ${config.verses.length}`);
  }

  private async fandango(): Promise<void> {
    if (flag('completo')) {
      await playDialogue(this.world.scene, 'n02_final');
      return;
    }
    if (this.recovered < config.verses.length) {
      await playDialogue(this.world.scene, 'n02_incompleto');
      return;
    }
    if (!flag('fandango')) {
      // En la tarima vuelve el fandango por capas, ya con todas las estrofas.
      bus.emit('music', { track: 'n02_fandango' });
      await playDialogue(this.world.scene, 'n02_fandango');
      if (!this.alive) return;
      remember('fandango');
    }
    if (!GameState.learnedSpells.includes('VOZ')) {
      await startLearning(this.world, 'VOZ');
      if (!this.alive || !GameState.learnedSpells.includes('VOZ')) return;
      this.world.timeScale = 0;
      this.world.player.controlsLocked = true;
    }
    if (!flag('premio_voz')) {
      remember('premio_voz');
      addEcos(config.rewards.voice);
    }
    await playDialogue(this.world.scene, 'n02_final');
    if (!this.alive) return;
    if (!flag('fragmento')) {
      remember('fragmento');
      addEcos(config.rewards.fragment);
      sfx('aprender');
      this.world.flash(0xf2c14e, 200);
    }
    remember('completo');
    this.progress();
    this.toast('Primer fragmento del Sello recuperado. La Cofradía se dirige a Catemaco.');
  }
}
