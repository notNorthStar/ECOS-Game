import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import type { LevelData, WorldApi } from '../core/contracts';
import { FUENTE, TAM } from '../ui/fuente';
import * as Hud from '../scenes/HudScene';

// Dueño: bugs (antes contenido). Interactuar con E: busca el interactuable más cercano dentro de su
// radio, muestra el aviso "E · Examinar" flotando sobre el objeto (y en el HUD si existe showPrompt)
// y al presionar E emite 'interact' en el bus. El Director decide qué hace cada action.
//
// Reglas del aviso (revisión de bugs de mundo, versión extendida):
// - Se dibuja POR ENCIMA del tinte ambiental y la viñeta (DEPTH.fx), que antes lo oscurecían y lo
//   teñían hasta volverlo casi invisible en las secciones oscuras; queda debajo de la interfaz.
// - Siempre dentro de la pantalla: si `promptDy` o la posición del objeto lo sacarían por arriba, por
//   los lados o debajo del HUD de la esquina, se recorta al área visible.
// - `data.destacado: true` → aviso grande y dorado (salidas y objetos clave).
// - `opts.prompt(it)` permite al director cambiar el texto según el progreso.

export type Interactable = LevelData['interactables'][number];

export interface InteractOptions {
  /** El Director puede ocultar interactuables según el progreso (ej. la antena antes del jefe). */
  enabled?: (it: Interactable) => boolean;
  /** Texto del aviso según el progreso (por omisión `it.prompt`). */
  prompt?: (it: Interactable) => string | undefined;
}

const RADIO_DEF = 28;
const PROMPT_DY_DEF = 48;
const ENFRIAMIENTO_MS = 350;
/** Margen del aviso respecto a los bordes de la pantalla. */
const MARGEN = 6;
/** El HUD ocupa la esquina superior izquierda (vida, láser) y la derecha (Ecos): el aviso no baja de aquí. */
const Y_MIN_PANTALLA = 30;

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
  let textoActual = '';
  let ultimo = 0;
  let ancho = 40;

  // Aviso flotante en el mundo, por encima de la atmósfera (tinte/viñeta) y debajo de la interfaz.
  const aviso = scene.add.container(0, 0).setDepth(DEPTH.fx + 20).setVisible(false);
  const fondo = scene.add.graphics();
  const tecla = scene.add.text(0, 0, 'E', {
    fontFamily: FUENTE,
    fontSize: `${TAM.chico}px`,
    color: '#0b0a14',
    fontStyle: 'bold',
  });
  const etiqueta = scene.add.text(0, 0, '', {
    fontFamily: FUENTE,
    fontSize: `${TAM.chico}px`,
    color: '#efe6d2',
    stroke: '#0b0a14',
    strokeThickness: 2,
  });
  // Flechita que apunta al objeto (debajo de la caja).
  const flecha = scene.add.graphics();
  aviso.add([fondo, flecha, tecla, etiqueta]);
  scene.tweens.add({ targets: aviso, alpha: { from: 0.8, to: 1 }, duration: 600, yoyo: true, repeat: -1 });

  const destacado = (it: Interactable) => !!(it.data as { destacado?: unknown } | undefined)?.destacado;

  const dibujarAviso = (it: Interactable, texto: string) => {
    const grande = destacado(it);
    const px = grande ? TAM.medio : TAM.chico;
    etiqueta.setFontSize(px).setText(texto).setColor(grande ? '#ffe9a8' : '#efe6d2');
    tecla.setFontSize(px);
    const alto = grande ? 18 : 15;
    const caja = grande ? 14 : 12;
    const w = 3 + caja + 5 + etiqueta.width + 6;
    ancho = w;
    fondo.clear();
    fondo.fillStyle(0x0b0a14, grande ? 0.92 : 0.85).fillRect(-w / 2, -alto / 2, w, alto);
    fondo.lineStyle(1, grande ? 0xf2c14e : 0x2a6f6a, 1).strokeRect(-w / 2 + 0.5, -alto / 2 + 0.5, w - 1, alto - 1);
    fondo.fillStyle(0xf2c14e, 1).fillRect(-w / 2 + 3, -caja / 2, caja, caja);
    tecla.setOrigin(0.5).setPosition(-w / 2 + 3 + caja / 2, 0);
    etiqueta.setOrigin(0, 0.5).setPosition(-w / 2 + 3 + caja + 5, 0);
    flecha.clear();
    flecha.fillStyle(grande ? 0xf2c14e : 0x2a6f6a, 1).fillTriangle(-4, alto / 2, 4, alto / 2, 0, alto / 2 + 4);
  };

  const disponible = (it: Interactable) => {
    if (it.once && GameState.flags[usedKey(world.level.id, it.id)]) return false;
    return opts.enabled ? opts.enabled(it) : true;
  };

  const textoDe = (it: Interactable) => opts.prompt?.(it) ?? it.prompt;

  const buscar = (): Interactable | null => {
    const p = world.player;
    if (!p) return null;
    let mejor: Interactable | null = null;
    let mejorD = Infinity;
    for (const it of lista) {
      const r = it.radius ?? RADIO_DEF;
      const dx = p.x - it.x;
      const dy = (p.y - it.y) * 1.6; // elipse en el plano del suelo
      const d = Math.hypot(dx, dy);
      if (d > r || d >= mejorD) continue;
      if (!disponible(it)) continue;
      mejor = it;
      mejorD = d;
    }
    return mejor;
  };

  /** Posición del aviso en el mundo, recortada para que siempre se vea completo en pantalla. */
  const colocar = (it: Interactable) => {
    const cam = scene.cameras.main;
    const dy = Number((it.data as { promptDy?: number } | undefined)?.promptDy ?? PROMPT_DY_DEF);
    let x = it.x;
    let y = it.y - dy;
    const x0 = cam.scrollX + ancho / 2 + MARGEN;
    const x1 = cam.scrollX + GAME_WIDTH - ancho / 2 - MARGEN;
    x = x1 > x0 ? Phaser.Math.Clamp(x, x0, x1) : cam.scrollX + GAME_WIDTH / 2;
    y = Phaser.Math.Clamp(y, cam.scrollY + Y_MIN_PANTALLA, cam.scrollY + GAME_HEIGHT - 70);
    aviso.setPosition(Math.round(x), Math.round(y));
  };

  const onUpdate = () => {
    const p = world.player;
    const bloqueado = !p || p.controlsLocked || keys.locked || GameState.casting;
    const it = bloqueado ? null : buscar();
    const texto = it ? textoDe(it) : '';

    if (it !== actual || texto !== textoActual) {
      actual = it;
      textoActual = texto;
      if (it) {
        dibujarAviso(it, texto);
        hudPrompt(`E · ${texto}`);
      } else {
        hudPrompt(null);
      }
    }
    if (it) {
      colocar(it);
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
      // Forzar a recalcular (la acción pudo deshabilitarlo o cambiar su texto).
      actual = null;
      textoActual = '';
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
