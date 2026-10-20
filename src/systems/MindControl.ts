import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH } from '../config/game';

/**
 * Dueño: sistemas (Nivel 7). CORONA DEL REY DEL OLVIDO: controles invertidos unos segundos.
 * LevelScene llama installMindControl(world) en todas las secciones.
 *
 * - Escucha 'controls:invert' {on, ms} (lo emite el Rey). on:true → GameState.controlsInverted = true durante
 *   ms (en TIEMPO REAL, para que dure lo anunciado aunque el mundo esté ralentizado) y distorsión morada de
 *   pantalla. on:false lo apaga. Un nuevo on:true mientras dura lo extiende (no lo acorta).
 * - settings.noInvert (accesibilidad): solo el aviso visual, NO invierte.
 * - settings.reduceFx: tinte fijo y suave, sin bandas ni pulsos.
 * - La primera vez en la partida muestra "¡La corona confunde tu mente!".
 * - Nunca deja controlsInverted pegado: se limpia al vencer, al morir, al cambiar de sección (shutdown) y al instalarse.
 * Player.readInput lee GameState.controlsInverted (solo movimiento).
 */

const MC = {
  color: 0x8a3ad8,
  /** Alfa máximo del tinte morado. */
  tintAlpha: 0.22,
  tintAlphaReduced: 0.12,
  /** Bandas horizontales que ondulan (distorsión). */
  bands: 7,
  bandAlpha: 0.1,
  fadeMs: 260,
  /** Si llega on:true sin ms (o 0), dura esto. */
  defaultMs: 3500,
  warnText: '¡La corona confunde tu mente!',
  warnMs: 1800,
};

/** Aviso de la primera vez: una sola vez por partida (sobrevive a reinicios de LevelScene). */
let warned = false;

/** ¿Está activa la confusión (aunque noInvert evite invertir)? Para el HUD o pruebas. */
let activeNow = false;
export const isMindControlled = (): boolean => activeNow;

export function installMindControl(world: WorldApi): void {
  const scene = world.scene;
  // Al instalarse (nueva sección o tras morir) nunca arrastra una inversión anterior.
  GameState.controlsInverted = false;
  activeNow = false;

  const W = scene.scale.width;
  const H = scene.scale.height;
  let overlay: Phaser.GameObjects.Container | null = null;
  let tint: Phaser.GameObjects.Rectangle | null = null;
  const bands: Phaser.GameObjects.Rectangle[] = [];
  let left = 0; // segundos reales que faltan
  let t = 0;

  const reduceFx = () => GameState.settings.reduceFx;

  const ensureOverlay = () => {
    if (overlay) return overlay;
    tint = scene.add.rectangle(0, 0, W, H, MC.color, 1).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const items: Phaser.GameObjects.GameObject[] = [tint];
    for (let i = 0; i < MC.bands; i++) {
      const b = scene.add
        .rectangle(0, (H / MC.bands) * i, W + 40, 6 + (i % 3) * 3, 0xc890ff, MC.bandAlpha)
        .setOrigin(0, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      bands.push(b);
      items.push(b);
    }
    overlay = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(DEPTH.fx + 50).setAlpha(0);
    return overlay;
  };

  const warn = () => {
    if (warned) return;
    warned = true;
    const scale = GameState.settings.textScale || 1;
    const txt = scene.add
      .text(W / 2, H * 0.28, MC.warnText, {
        fontFamily: 'monospace',
        fontSize: `${Math.round(12 * scale)}px`,
        color: '#f0d8ff',
        stroke: '#2a0a40',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui - 10)
      .setAlpha(0);
    scene.tweens.add({ targets: txt, alpha: 1, duration: 200 });
    scene.tweens.add({
      targets: txt,
      alpha: 0,
      delay: MC.warnMs,
      duration: 400,
      onComplete: () => txt.destroy(),
    });
  };

  const start = (ms: number) => {
    const sec = (ms > 0 ? ms : MC.defaultMs) / 1000;
    const wasActive = activeNow;
    left = Math.max(left, sec);
    activeNow = true;
    GameState.controlsInverted = !GameState.settings.noInvert;
    if (wasActive) return;
    const o = ensureOverlay();
    scene.tweens.killTweensOf(o);
    scene.tweens.add({ targets: o, alpha: 1, duration: MC.fadeMs });
    for (const b of bands) b.setVisible(!reduceFx());
    if (!reduceFx()) world.shake(0.004, 220);
    warn();
  };

  const stop = (instant = false) => {
    left = 0;
    activeNow = false;
    GameState.controlsInverted = false;
    if (!overlay) return;
    const o = overlay;
    scene.tweens.killTweensOf(o);
    if (instant) o.setAlpha(0);
    else scene.tweens.add({ targets: o, alpha: 0, duration: MC.fadeMs });
  };

  bus.scoped(scene, 'controls:invert', ({ on, ms }) => (on ? start(ms) : stop()));
  bus.scoped(scene, 'player:died', () => stop(true));

  const onUpdate = (_time: number, deltaMs: number) => {
    if (!activeNow) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    t += dt;
    left -= dt;
    // Si se cambia la opción a media confusión, se respeta al momento.
    GameState.controlsInverted = !GameState.settings.noInvert;
    if (left <= 0) {
      stop();
      return;
    }
    if (tint) {
      const base = reduceFx() ? MC.tintAlphaReduced : MC.tintAlpha;
      const pulse = reduceFx() ? 0 : 0.06 * Math.sin(t * 7);
      // MULTIPLY con alfa: oscurece hacia el morado.
      tint.setAlpha(base + pulse);
    }
    if (!reduceFx()) {
      for (let i = 0; i < bands.length; i++) {
        const b = bands[i];
        b.setVisible(true);
        b.x = -20 + Math.sin(t * 5 + i * 1.3) * 14;
        b.y = ((H / MC.bands) * i + t * 40 * (i % 2 ? 1 : -1) + H) % H;
      }
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    GameState.controlsInverted = false;
    activeNow = false;
    overlay?.destroy();
    overlay = null;
    tint = null;
    bands.length = 0;
  });
}
