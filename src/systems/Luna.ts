import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { keys } from '../config/controls';
import { LUNA as L } from '../config/abilities';
import { installBalam } from './Balam';

/**
 * Dueño: sistemas (Nivel 3). HABILIDAD LUNA con Balam (GDD §7). LevelScene llama installLuna(world) en todas
 * las secciones; no hace nada mientras GameState.luna.unlocked sea false. También instala a Balam.
 *
 *  - Tecla F (CONTROLS.luna) alterna. Barra GameState.luna.energy: se gasta activa y se recarga sola apagada.
 *    Al agotarse se apaga y no vuelve hasta tener LUNA.reactivateMin.
 *  - Filtro sobre la cámara del nivel (filtros de Phaser 4): matriz de color (desaturación + tinte frío),
 *    viñeta oscura y viñeta cian en ADD (bordes brillantes). Respeta "reducir efectos" (sin pulso, más suave).
 *    Si no hay filtros (Canvas), un rectángulo con blend MULTIPLY.
 *  - Emite 'luna:state' {active, energy}; sfx luna_on / luna_off.
 *  - isLunaActive(): la usan las entidades lunaOnly (espíritus).
 */

/** ¿Luna está activa ahora? Las entidades lunaOnly solo se ven, se golpean y atacan si devuelve true. */
export function isLunaActive(): boolean {
  return GameState.luna.unlocked && GameState.luna.active;
}

let lastEmitEnergy = -1;
function emitState(): void {
  lastEmitEnergy = GameState.luna.energy;
  bus.emit('luna:state', { active: GameState.luna.active, energy: GameState.luna.energy });
}

/** Activa o apaga Luna desde código (director, tutorial). Devuelve el estado final. */
export function setLunaActive(on: boolean): boolean {
  const l = GameState.luna;
  if (!l.unlocked) return false;
  if (on && l.energy < L.reactivateMin) {
    bus.emit('hud:toast', { text: 'Luna se está recargando…', ms: 1200 });
    sfx('ui_mover');
    return l.active;
  }
  if (on === l.active) return on;
  l.active = on;
  sfx(on ? 'luna_on' : 'luna_off');
  emitState();
  return on;
}

/** Desbloquea Luna (lo llama el director al despertar Balam): barra llena y aviso con instrucciones. */
export function unlockLuna(world: WorldApi): void {
  const l = GameState.luna;
  l.unlocked = true;
  l.energy = 1;
  l.active = false;
  emitState();
  sfx('luna_on');
  if (!GameState.settings.reduceFx) world.flash(0x7fd8ff, 220);
  bus.emit('hud:toast', { text: 'Habilidad Luna: pulsa F para ver lo oculto con los ojos de Balam', ms: 4800 });
}

/** Matriz 5×4 (fila R, G, B, A; desplazamientos 0..255) entre identidad (k = 0) y la visión Luna (k = 1). */
function lunaMatrix(k: number): number[] {
  const s = 1 - (1 - L.saturation) * k; // saturación que queda
  const lr = 0.299;
  const lg = 0.587;
  const lb = 0.114;
  const tint = [1 + (L.tint[0] - 1) * k, 1 + (L.tint[1] - 1) * k, 1 + (L.tint[2] - 1) * k];
  const row = (ch: number, t: number, off: number) => {
    const r = lr * (1 - s) + (ch === 0 ? s : 0);
    const g = lg * (1 - s) + (ch === 1 ? s : 0);
    const b = lb * (1 - s) + (ch === 2 ? s : 0);
    return [r * t, g * t, b * t, 0, off];
  };
  return [...row(0, tint[0], 0), ...row(1, tint[1], 0), ...row(2, tint[2], L.blueOffset * k), 0, 0, 0, 1, 0];
}

export function installLuna(world: WorldApi): void {
  const scene = world.scene;
  const l = GameState.luna;
  // Cada sección empieza con Luna apagada (la energía se conserva).
  l.active = false;
  lastEmitEnergy = -1;

  // Balam (compañero) vive con Luna: se instala siempre y aparece cuando GameState.hasBalam.
  try {
    installBalam(world);
  } catch (err) {
    console.error('[Luna] installBalam falló', err);
  }

  /* ---------- filtro de la cámara (se crea al usarse por primera vez) ---------- */
  const cam = scene.cameras.main;
  let cm: Phaser.Filters.ColorMatrix | null = null;
  let vDark: Phaser.Filters.Vignette | null = null;
  let vEdge: Phaser.Filters.Vignette | null = null;
  let overlay: Phaser.GameObjects.Rectangle | null = null;
  let filtersOk = true;

  const ensureFilters = () => {
    if (cm || overlay) return;
    try {
      const list = cam.filters?.internal;
      if (!list) throw new Error('sin filtros');
      cm = list.addColorMatrix();
      vDark = list.addVignette(0.5, 0.5, L.darkRadius, 0, 0x060a20);
      vEdge = list.addVignette(0.5, 0.5, L.edgeRadius, 0, L.edgeColor, Phaser.BlendModes.ADD);
    } catch {
      filtersOk = false;
      overlay = scene.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x8ab0ff, 1)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(5900)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setAlpha(0);
    }
  };
  const removeFilters = () => {
    // La cámara puede estar ya destruida al apagarse la escena: entonces sus filtros se fueron con ella.
    try {
      const list = cam.filters?.internal;
      if (list) for (const f of [cm, vDark, vEdge]) if (f) list.remove(f);
    } catch {
      /* nada que limpiar */
    }
    cm = vDark = vEdge = null;
    overlay?.destroy();
    overlay = null;
  };

  let k = 0; // intensidad visible 0..1
  let idleT = 0;
  let time = 0;

  const applyVisual = () => {
    if (k <= 0.001 && !cm && !overlay) return;
    ensureFilters();
    const reduced = GameState.settings.reduceFx;
    const kk = k * (reduced ? L.reducedScale : 1);
    const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(time * 3.2);
    if (filtersOk && cm && vDark && vEdge) {
      const on = kk > 0.001;
      cm.active = on;
      vDark.active = on;
      vEdge.active = on;
      if (!on) return;
      cm.colorMatrix.set(lunaMatrix(kk));
      vDark.strength = L.darkStrength * kk;
      vEdge.strength = L.edgeStrength * kk * pulse;
      vEdge.radius = L.edgeRadius + (reduced ? 0 : 0.03 * Math.sin(time * 2.1));
    } else if (overlay) {
      overlay.setAlpha(0.45 * kk);
    }
  };

  const onUpdate = (_t: number, deltaMs: number) => {
    const realDt = Math.min(deltaMs / 1000, 0.05);
    time += realDt;
    if (!l.unlocked) {
      l.active = false;
      if (k > 0) {
        k = 0;
        applyVisual();
      }
      return;
    }
    const p = world.player;
    // Tecla F (respeta el bloqueo de entrada: diálogos, deletreo).
    if (keys.justPressed('luna') && !p.controlsLocked && p.alive) setLunaActive(!l.active);

    const dt = realDt * world.timeScale;
    if (l.active) {
      idleT = 0;
      l.energy = Math.max(0, l.energy - L.drainPerSec * dt);
      if (l.energy <= 0) {
        l.active = false;
        sfx('luna_off');
        bus.emit('hud:toast', { text: 'Luna agotada: espera a que se recargue', ms: 1600 });
        emitState();
      }
    } else {
      idleT += dt;
      if (idleT >= L.regenDelay && l.energy < 1) l.energy = Math.min(1, l.energy + L.regenPerSec * dt);
    }
    if (Math.abs(l.energy - lastEmitEnergy) >= 0.05 || (l.energy >= 1 && lastEmitEnergy < 1)) emitState();

    const target = l.active ? 1 : 0;
    const step = GameState.settings.reduceFx ? 1 : realDt / L.fadeSec;
    k = target > k ? Math.min(target, k + step) : Math.max(target, k - step);
    applyVisual();
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    removeFilters();
    l.active = false;
  });
}
