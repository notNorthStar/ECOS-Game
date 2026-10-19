import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { DEPTH } from '../config/game';
import type { LevelData, WorldApi } from '../core/contracts';
import * as Hud from '../scenes/HudScene';

// Dueño: contenido. Interactuar con E: busca el interactuable más cercano dentro de su radio,
// muestra el aviso "E · Examinar" flotando sobre el objeto (y en el HUD si existe showPrompt)
// y al presionar E emite 'interact' en el bus. El Director decide qué hace cada action.

export type Interactable = LevelData['interactables'][number];

export interface InteractOptions {
  /** El Director puede ocultar interactuables según el progreso (ej. la antena antes del jefe). */
  enabled?: (it: Interactable) => boolean;
}

const RADIO_DEF = 28;
const ENFRIAMIENTO_MS = 350;

/** Clave en GameState.flags de un interactuable `once` ya usado. */
export const usedKey = (section: string, id: string) => `usado:${section}:${id}`;

/** Marca como usado un interactuable `once` (lo hace el Director cuando la acción se completó). */
export function markUsed(world: WorldApi, id: string): void {
  GameState.flags[usedKey(world.level.id, id)] = true;
}

type HudMod = { showPrompt?: (text: string | null) => void };
const hudPrompt = (text: string | null) => {
  try {
    (Hud as unknown as HudMod).showPrompt?.(text);
  } catch {
    /* el HUD aún no existe */
  }
};

export function installInteract(world: WorldApi, opts: InteractOptions = {}): void {
  const scene = world.scene;
  const lista = world.level.interactables ?? [];
  let actual: Interactable | null = null;
  let ultimo = 0;

  // Aviso flotante en el mundo.
  const aviso = scene.add.container(0, 0).setDepth(DEPTH.foreground + 10).setVisible(false);
  const fondo = scene.add.graphics();
  const tecla = scene.add.text(0, 0, 'E', {
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#0b0a14',
    fontStyle: 'bold',
  });
  const etiqueta = scene.add.text(0, 0, '', {
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#efe6d2',
  });
  aviso.add([fondo, tecla, etiqueta]);
  scene.tweens.add({ targets: aviso, alpha: { from: 0.75, to: 1 }, duration: 600, yoyo: true, repeat: -1 });

  const dibujarAviso = (it: Interactable) => {
    etiqueta.setText(it.prompt);
    const w = 14 + 4 + etiqueta.width + 6;
    fondo.clear();
    fondo.fillStyle(0x0b0a14, 0.8).fillRect(-w / 2, -7, w, 14);
    fondo.lineStyle(1, 0x2a6f6a, 1).strokeRect(-w / 2 + 0.5, -6.5, w - 1, 13);
    fondo.fillStyle(0xf2c14e, 1).fillRect(-w / 2 + 2, -5, 11, 10);
    tecla.setPosition(-w / 2 + 4.5, -6);
    etiqueta.setPosition(-w / 2 + 17, -6);
  };

  const disponible = (it: Interactable) => {
    if (it.once && GameState.flags[usedKey(world.level.id, it.id)]) return false;
    return opts.enabled ? opts.enabled(it) : true;
  };

  const buscar = (): Interactable | null => {
    const p = world.player;
    if (!p) return null;
    let mejor: Interactable | null = null;
    let mejorD = Infinity;
    for (const it of lista) {
      if (!disponible(it)) continue;
      const r = it.radius ?? RADIO_DEF;
      const dx = p.x - it.x;
      const dy = (p.y - it.y) * 1.6; // elipse en el plano del suelo
      const d = Math.hypot(dx, dy);
      if (d <= r && d < mejorD) {
        mejor = it;
        mejorD = d;
      }
    }
    return mejor;
  };

  const onUpdate = () => {
    const p = world.player;
    const bloqueado = !p || p.controlsLocked || keys.locked || GameState.casting;
    const it = bloqueado ? null : buscar();

    if (it !== actual) {
      actual = it;
      if (it) {
        dibujarAviso(it);
        hudPrompt(`E · ${it.prompt}`);
      } else {
        hudPrompt(null);
      }
    }
    if (it) {
      const dy = Number((it.data as { promptDy?: number } | undefined)?.promptDy ?? 48);
      aviso.setPosition(Math.round(it.x), Math.round(it.y - dy));
      aviso.setVisible(true);
    } else {
      aviso.setVisible(false);
    }

    if (it && keys.justPressed('interact') && scene.time.now - ultimo > ENFRIAMIENTO_MS) {
      ultimo = scene.time.now;
      sfx('interactuar');
      try {
        p.playOneShot('protagonista_interactuar');
      } catch {
        /* sin animación */
      }
      bus.emit('interact', { id: it.id, action: it.action, data: it.data });
      // Forzar a recalcular (la acción pudo deshabilitarlo).
      actual = null;
      aviso.setVisible(false);
      hudPrompt(null);
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    hudPrompt(null);
  });
}
