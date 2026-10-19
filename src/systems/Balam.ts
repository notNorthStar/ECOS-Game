import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH } from '../config/game';
import { BALAM as B } from '../config/abilities';
import { kitAnimatorFor, type KitAnimator } from './CharacterKits';

/**
 * Dueño: sistemas (Nivel 3). BALAM, el gato negro compañero (GDD §7, NDD Nivel 3).
 * Lo instala installLuna(world) en todas las secciones; aparece cuando GameState.hasBalam es true o al
 * emitirse 'balam:awake' (que además pone hasBalam = true). Sigue al jugador detrás de él y sus ojos brillan
 * con Luna activa. Arte: kit del equipo `kit_balam` (KitAnimator) si existe; si no, placeholder simple
 * (silueta de gato ~24 px con ojos brillantes, AGENTS.md §8.0).
 */

const TEX = { body: '__balam_ph', eye: '__balam_ojo' };
/** Placeholder: cuadro 32×24, pies en y = 22, mirando a la derecha. */
const FRAME = { w: 32, h: 24, feetY: 22 };
/** Ojos respecto a los pies (mirando a la derecha). */
const EYES = { x: 8, y: -13, gap: 2 };

let pendingSpawn: { x: number; y: number } | null = null;
let current: { x: number; y: number } | null = null;

/**
 * Despierta a Balam (lo llama el director cuando el gato toca la gema): hasBalam = true, emite 'balam:awake'
 * y el gato aparece en (x, y) o junto al jugador.
 */
export function wakeBalam(x?: number, y?: number): void {
  pendingSpawn = x !== undefined && y !== undefined ? { x, y } : null;
  bus.emit('balam:awake', {});
}

/** Posición actual de Balam en el plano del suelo (null si no está en la escena). */
export function getBalamPosition(): { x: number; y: number } | null {
  return current ? { ...current } : null;
}

function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.body) && scene.textures.exists(TEX.eye)) return;
  const g = scene.make.graphics({}, false);
  const body = 0x15131f;
  const edge = 0x3a3450;
  // Cola.
  g.lineStyle(2, edge, 1).beginPath().moveTo(7, 15).lineTo(4, 10).lineTo(4, 5).lineTo(6, 3).strokePath();
  g.lineStyle(1, body, 1).beginPath().moveTo(7, 15).lineTo(4, 10).lineTo(4, 5).lineTo(6, 3).strokePath();
  // Patas.
  g.fillStyle(body, 1).fillRect(8, 17, 2, 5).fillRect(12, 18, 2, 4).fillRect(18, 18, 2, 4).fillRect(21, 17, 2, 5);
  // Cuerpo y cabeza con contorno de color (no negro).
  g.fillStyle(edge, 1).fillEllipse(15, 15, 18, 10).fillCircle(23, 10, 6);
  g.fillStyle(body, 1).fillEllipse(15, 15, 16, 8).fillCircle(23, 10, 5);
  // Orejas.
  g.fillStyle(edge, 1).fillTriangle(18, 8, 20, 2, 23, 6).fillTriangle(24, 6, 27, 2, 28, 8);
  g.fillStyle(body, 1).fillTriangle(19, 7, 20, 4, 22, 6).fillTriangle(25, 6, 27, 4, 27, 7);
  // Ojos apagados (el brillo va en otra capa).
  g.fillStyle(0x9adf5a, 1).fillRect(24, 9, 1, 1).fillRect(26, 9, 1, 1);
  g.generateTexture(TEX.body, FRAME.w, FRAME.h);
  g.clear();
  g.fillStyle(0xffffff, 0.35).fillCircle(3, 3, 3);
  g.fillStyle(0xffffff, 1).fillRect(2, 2, 2, 2);
  g.generateTexture(TEX.eye, 6, 6);
  g.destroy();
}

export function installBalam(world: WorldApi): void {
  const scene = world.scene;
  current = null;
  let sprite: Phaser.GameObjects.Sprite | null = null;
  let shadow: Phaser.GameObjects.Ellipse | null = null;
  let eyes: Phaser.GameObjects.Image[] = [];
  let kit: KitAnimator | null = null;
  const cat = { x: 0, y: 0, z: 0, radius: B.radius };
  let facing: 1 | -1 = 1;
  let time = 0;
  let moving = false;
  let eyeGlow = 0;

  const spawn = (x: number, y: number, puff: boolean) => {
    if (sprite) return;
    ensureTextures(scene);
    cat.x = x;
    cat.y = y;
    shadow = scene.add.ellipse(x, y, 18, 5, 0x000000, 0.35).setDepth(DEPTH.shadow + y * 0.0001);
    sprite = scene.add.sprite(x, y, TEX.body).setOrigin(0.5, FRAME.feetY / FRAME.h);
    kit = kitAnimatorFor(sprite, 'balam');
    eyes = [0, 1].map(() => scene.add.image(x, y, TEX.eye).setTint(0xc8ff6a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
    current = { x, y };
    if (puff) {
      sfx('balam_maullido');
      const glow = scene.add.ellipse(x, y - 10, 30, 30, 0x9adf5a, 0.5).setDepth(y + 1).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: glow, scale: 2.4, alpha: 0, duration: 600, onComplete: () => glow.destroy() });
      sprite.setAlpha(0);
      scene.tweens.add({ targets: sprite, alpha: 1, duration: 400 });
    }
  };

  const behind = () => {
    const p = world.player;
    return { x: p.x - p.facing * B.followBehind, y: p.y + B.followDepth };
  };

  if (GameState.hasBalam) {
    const t = behind();
    const pt = world.isWalkable(t.x, t.y, B.radius) ? t : world.randomPointNear(t.x, t.y, 24);
    spawn(pt.x, pt.y, false);
  }

  bus.scoped(scene, 'balam:awake', () => {
    GameState.hasBalam = true;
    const at = pendingSpawn ?? behind();
    pendingSpawn = null;
    const pt = world.isWalkable(at.x, at.y, B.radius) ? at : world.randomPointNear(at.x, at.y, 24);
    spawn(pt.x, pt.y, true);
  });

  const onUpdate = (_t: number, deltaMs: number) => {
    if (!sprite || !shadow) return;
    const realDt = Math.min(deltaMs / 1000, 0.05);
    const dt = realDt * world.timeScale;
    time += dt;
    const p = world.player;
    const t = behind();
    const dx = t.x - cat.x;
    const dy = t.y - cat.y;
    const d = Math.hypot(dx, dy * 2);
    if (d > B.teleportDist) {
      const pt = world.randomPointNear(t.x, t.y, 20);
      cat.x = pt.x;
      cat.y = pt.y;
      moving = false;
    } else if (d > 8) {
      const sp = (d > 60 ? B.catchUpSpeed : B.speed) * dt;
      const k = Math.min(1, sp / d);
      world.moveActor(cat, dx * k, dy * k);
      if (Math.abs(dx) > 2) facing = dx > 0 ? 1 : -1;
      moving = true;
    } else {
      moving = false;
      facing = p.x >= cat.x ? 1 : -1;
    }
    current = { x: cat.x, y: cat.y };

    // Saltitos al caminar (solo sin arte del kit; el kit se anima por código).
    const hop = !kit && moving ? Math.abs(Math.sin(time * 14)) * 2 : 0;
    sprite.setPosition(Math.round(cat.x), Math.round(cat.y - hop)).setDepth(cat.y);
    if (kit) {
      kit.setAnim(moving ? (d > 60 ? 'balam_correr' : 'balam_caminar') : 'balam_reposo');
      kit.apply(facing, time);
    } else sprite.setFlipX(facing < 0);
    shadow.setPosition(Math.round(cat.x), Math.round(cat.y)).setDepth(DEPTH.shadow + cat.y * 0.0001);

    // Ojos: brillan con Luna activa.
    const target = GameState.luna.active ? 1 : 0;
    eyeGlow += (target - eyeGlow) * Math.min(1, realDt * 6);
    const pulse = GameState.settings.reduceFx ? 1 : 0.8 + 0.2 * Math.sin(time * 6);
    const ex = sprite.x + facing * EYES.x;
    const ey = sprite.y + EYES.y;
    eyes.forEach((e, i) => {
      e.setPosition(ex + facing * EYES.gap * i, ey)
        .setDepth(cat.y + 0.2)
        .setAlpha(0.15 + 0.85 * eyeGlow * pulse)
        .setScale(0.8 + 0.7 * eyeGlow);
    });
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    sprite?.destroy();
    shadow?.destroy();
    eyes.forEach((e) => e.destroy());
    sprite = null;
    shadow = null;
    eyes = [];
    current = null;
  });
}
