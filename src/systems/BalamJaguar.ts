import Phaser from 'phaser';
import type { EnemyApi, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH } from '../config/game';
import { kitAnimatorFor, type KitAnimator } from './CharacterKits';

/**
 * Dueño: sistemas (Nivel 10). BALAM en su forma de JAGUAR LUMINOSO: aliado que pelea solo (como la Llorona del
 * Nivel 7). LevelScene llama installBalamJaguar(world) en todas las secciones; no hace nada hasta awakenJaguar().
 *
 * - awakenJaguar(world, x, y): el gato crece a jaguar con un destello (GameState.balamJaguar = true, emite
 *   'balam:jaguar' {on: true}). Resuelve al terminar la transformación.
 * - calmJaguar(): vuelve a gato (destello, 'balam:jaguar' {on: false}). Resuelve al terminar.
 * - Mientras es jaguar: sigue al jugador y cada JG.cooldownMin..Max s (tiempo del mundo) EMBISTE al enemigo vivo
 *   más cercano dentro de JG.range (prioriza kind 'tzitzimitl' e 'itzpapalotl'; ignora ilusiones, agotados y
 *   purificados): breve carga → carrera → emite 'balam:strike' {x, y} + respaldo con takeHit moderado y
 *   aturdimiento (kind 'melee'). NUNCA daña al jugador; es intangible: NO se agrega a world.entities.
 * - El Balam gato (systems/Balam.ts) se oculta solo mientras GameState.balamJaguar es true.
 * - Reintento: si GameState.balamJaguar ya es true al instalarse, el jaguar reaparece junto al jugador sin fanfarria.
 * Arte: kit del equipo `balam_jaguar` (KitAnimator) si existe; si no, placeholder simple (AGENTS.md §8.0):
 * criatura grande ~60 px en cuadro 96×64, pies abajo, turquesa con rosetas doradas.
 */

/** Valores ajustables del jaguar. */
export const JG = {
  /** Segundos entre embestidas (aleatorio en [min, max]). */
  cooldownMin: 4,
  cooldownMax: 6,
  /** Primera embestida tras aparecer. */
  firstDelay: 2.5,
  /** Agazapado antes de saltar (s). */
  windup: 0.45,
  /** Carrera de la embestida (px/s) y tiempo máximo antes de soltar el golpe. */
  dashSpeed: 430,
  dashMaxTime: 0.7,
  /** Distancia (plano del suelo) para buscar presa. */
  range: 460,
  /** Alcance del golpe al final de la carrera (se suma al radio del enemigo). */
  reach: 34,
  /** A Tzitzimime e Itzpapálotl: daño moderado y aturdimiento (s). */
  bossDamage: 6,
  bossStun: 1.4,
  /** A los demás enemigos. */
  damage: 40,
  stun: 2,
  knockback: 18,
  /** Cómo sigue al jugador. */
  followBehind: 52,
  followDepth: 12,
  speed: 120,
  catchUpSpeed: 230,
  teleportDist: 340,
  radius: 14,
  /** Transformaciones (ms). */
  awakenMs: 1100,
  calmMs: 900,
  color: 0x5ff0e0,
  gold: 0xffd060,
};

const TEX = '__balam_jaguar_ph';
const GLOW = '__balam_jaguar_glow';
/** Placeholder: cuadro 96×64, pies en y = 62, mirando a la derecha. */
const FRAME = { w: 96, h: 64, feetY: 62 };

const planeDist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, (ay - by) * 2);

type Mode = 'follow' | 'windup' | 'dash' | 'recover';

interface Instance {
  awaken(x: number, y: number): Promise<void>;
  calm(): Promise<void>;
  readonly present: boolean;
}

let inst: Instance | null = null;

/** Balam gato → jaguar luminoso en (x, y). Resuelve al terminar la transformación. */
export function awakenJaguar(world: WorldApi, x: number, y: number): Promise<void> {
  if (!inst) installBalamJaguar(world);
  return inst ? inst.awaken(x, y) : Promise.resolve();
}

/** Jaguar → gato. Resuelve al terminar (o enseguida si no hay jaguar). */
export function calmJaguar(): Promise<void> {
  if (inst) return inst.calm();
  GameState.balamJaguar = false;
  return Promise.resolve();
}

/** ¿El jaguar está en escena y peleando? */
export function isJaguarActive(): boolean {
  return !!inst?.present;
}

function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX) && scene.textures.exists(GLOW)) return;
  const g = scene.make.graphics({}, false);
  const edge = 0x2a9ab0; // contorno de color (no negro)
  const body = 0x5ff0e0;
  const light = 0xc8fff6;
  const shade = 0x34c0c8;
  const gold = 0xffd060;
  // Cola larga que sube.
  g.lineStyle(5, edge, 1).beginPath().moveTo(20, 34).lineTo(10, 30).lineTo(6, 20).lineTo(10, 12).strokePath();
  g.lineStyle(3, body, 1).beginPath().moveTo(20, 34).lineTo(10, 30).lineTo(6, 20).lineTo(10, 12).strokePath();
  // Patas traseras y delanteras (las del fondo más oscuras).
  g.fillStyle(shade, 1).fillRect(27, 44, 6, 18).fillRect(62, 44, 6, 18);
  g.fillStyle(edge, 1).fillRect(20, 42, 9, 20).fillRect(56, 42, 9, 20);
  g.fillStyle(body, 1).fillRect(21, 43, 7, 18).fillRect(57, 43, 7, 18);
  g.fillStyle(light, 1).fillRect(20, 60, 9, 2).fillRect(56, 60, 9, 2);
  // Cuerpo.
  g.fillStyle(edge, 1).fillEllipse(44, 38, 52, 22);
  g.fillStyle(body, 1).fillEllipse(44, 38, 50, 20);
  g.fillStyle(light, 1).fillEllipse(42, 32, 38, 7); // lomo iluminado (luz arriba a la izquierda)
  g.fillStyle(shade, 1).fillEllipse(46, 45, 40, 6); // vientre en sombra
  // Cabeza y hocico.
  g.fillStyle(edge, 1).fillCircle(72, 28, 11).fillRect(76, 28, 12, 9);
  g.fillStyle(body, 1).fillCircle(72, 28, 10).fillRect(77, 29, 10, 7);
  g.fillStyle(light, 1).fillRect(80, 33, 7, 3);
  // Orejas.
  g.fillStyle(edge, 1).fillTriangle(64, 21, 67, 13, 71, 19).fillTriangle(72, 18, 76, 12, 78, 20);
  // Rosetas doradas.
  g.fillStyle(gold, 1);
  for (const [x, y] of [[30, 34], [38, 40], [46, 33], [54, 41], [60, 34], [34, 46], [50, 46], [24, 39]]) {
    g.fillCircle(x, y, 2);
  }
  g.fillStyle(body, 1);
  for (const [x, y] of [[30, 34], [46, 33], [54, 41], [60, 34]]) g.fillRect(x, y, 1, 1);
  // Ojo dorado.
  g.fillStyle(0xfff4c0, 1).fillRect(76, 25, 3, 2);
  g.fillStyle(gold, 1).fillRect(77, 25, 1, 2);
  g.generateTexture(TEX, FRAME.w, FRAME.h);
  g.clear();
  for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.08 + (1 - r / 16) * 0.25).fillCircle(16, 16, r);
  g.generateTexture(GLOW, 32, 32);
  g.destroy();
}

export function installBalamJaguar(world: WorldApi): void {
  const scene = world.scene;
  let sprite: Phaser.GameObjects.Sprite | null = null;
  let shadow: Phaser.GameObjects.Ellipse | null = null;
  let aura: Phaser.GameObjects.Image | null = null;
  let kit: KitAnimator | null = null;
  const me = { x: 0, y: 0, radius: JG.radius };
  let facing: 1 | -1 = 1;
  let time = 0;
  let cd: number = JG.firstDelay;
  let mode: Mode = 'follow';
  let modeT = 0;
  let target: EnemyApi | null = null;
  let transforming = false;
  let leaving: Promise<void> | null = null;
  let pending: Array<() => void> = [];

  const reduceFx = () => GameState.settings.reduceFx;

  const settle = () => {
    const p = pending;
    pending = [];
    p.forEach((r) => r());
  };

  const clear = () => {
    for (const o of [sprite, shadow, aura]) if (o) scene.tweens.killTweensOf(o);
    sprite?.destroy();
    shadow?.destroy();
    aura?.destroy();
    sprite = null;
    shadow = null;
    aura = null;
    kit = null;
    target = null;
    mode = 'follow';
    transforming = false;
    leaving = null;
    settle();
  };

  const behind = () => {
    const p = world.player;
    return { x: p.x - p.facing * JG.followBehind, y: p.y + JG.followDepth };
  };

  const walkable = (x: number, y: number) => (world.isWalkable(x, y, JG.radius) ? { x, y } : world.randomPointNear(x, y, 30));

  const burst = (x: number, y: number, color: number, scale: number) => {
    const n = reduceFx() ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const e = scene.add.ellipse(x, y, 60, 30, 0x000000, 0).setStrokeStyle(2, i ? JG.gold : color, 0.9).setDepth(y - 1).setScale(0.1);
      scene.tweens.add({ targets: e, scale: scale, alpha: 0, delay: i * 110, duration: 600, ease: 'Sine.easeOut', onComplete: () => e.destroy() });
    }
    if (!reduceFx()) {
      const glow = scene.add.image(x, y - 24, GLOW).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 1).setScale(1.5);
      scene.tweens.add({ targets: glow, scale: 6 * scale, alpha: 0, duration: 550, onComplete: () => glow.destroy() });
    }
  };

  const spawn = (x: number, y: number) => {
    ensureTextures(scene);
    const pt = walkable(x, y);
    me.x = pt.x;
    me.y = pt.y;
    cd = JG.firstDelay;
    mode = 'follow';
    leaving = null;
    transforming = false;
    shadow =scene.add.ellipse(me.x, me.y, 54, 10, 0x000000, 0.3).setDepth(DEPTH.shadow + me.y * 0.0001);
    sprite = scene.add.sprite(me.x, me.y, TEX).setOrigin(0.5, FRAME.feetY / FRAME.h);
    kit = kitAnimatorFor(sprite, 'balam_jaguar');
    aura = scene.add.image(me.x, me.y - 26, GLOW).setTint(JG.color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3).setScale(3.2, 2);
  };

  const awaken = (x: number, y: number): Promise<void> => {
    GameState.hasBalam = true;
    GameState.balamJaguar = true;
    if (sprite && !leaving) {
      // Ya es jaguar (p. ej. el director lo vuelve a despertar tras un reintento): solo se acerca.
      const pt = walkable(x, y);
      me.x = pt.x;
      me.y = pt.y;
      return Promise.resolve();
    }
    if (sprite) clear();
    spawn(x, y);
    bus.emit('balam:jaguar', { on: true });
    // El rugido lo pone audio al oír 'balam:jaguar' {on: true} (jaguar_ruge).
    world.shake(0.006, 320);
    if (!reduceFx()) world.flash(0x9ff0ff, 260);
    burst(me.x, me.y, JG.color, 2.2);
    transforming = true;
    const s = sprite!;
    s.setScale(0.35).setAlpha(0.2);
    return new Promise<void>((resolve) => {
      pending.push(resolve);
      scene.tweens.add({
        targets: s,
        scale: 1,
        alpha: 1,
        duration: JG.awakenMs,
        ease: 'Back.easeOut',
        onComplete: () => {
          transforming = false;
          settle();
        },
      });
    });
  };

  const calm = (): Promise<void> => {
    GameState.balamJaguar = false;
    if (!sprite) {
      bus.emit('balam:jaguar', { on: false });
      return Promise.resolve();
    }
    if (leaving) return leaving;
    const s = sprite;
    mode = 'follow';
    target = null;
    transforming = true;
    bus.emit('balam:jaguar', { on: false });
    sfx('jaguar_calma');
    burst(me.x, me.y, JG.color, 1.4);
    leaving = new Promise<void>((resolve) => {
      pending.push(resolve);
      if (aura) scene.tweens.add({ targets: aura, alpha: 0, duration: JG.calmMs });
      if (shadow) scene.tweens.add({ targets: shadow, alpha: 0, duration: JG.calmMs });
      scene.tweens.add({ targets: s, scale: 0.3, alpha: 0, duration: JG.calmMs, ease: 'Sine.easeIn', onComplete: () => clear() });
    });
    return leaving;
  };

  /* ------------------------------ Presa y embestida ----------------------------- */

  const valid = (e: EnemyApi | null): e is EnemyApi =>
    !!e && e.alive && !e.purified && !e.exhausted && !(e as { illusion?: boolean }).illusion
    // El capullo de Itzpapálotl es invulnerable: no gastar embestidas en él durante la Fase 1.
    && !(e as { isCocoon?: boolean }).isCocoon;

  const findPrey = (): EnemyApi | null => {
    let best: EnemyApi | null = null;
    let bestD = Infinity;
    let bestPrio = false;
    for (const e of world.enemies) {
      if (!valid(e)) continue;
      const d = planeDist(e.x, e.y, me.x, me.y);
      if (d > JG.range) continue;
      const prio = e.kind === 'tzitzimitl' || e.kind === 'itzpapalotl';
      if ((prio && !bestPrio) || (prio === bestPrio && d < bestD)) {
        best = e;
        bestD = d;
        bestPrio = prio;
      }
    }
    return best;
  };

  const strike = (e: EnemyApi) => {
    const boss = e.kind === 'tzitzimitl' || e.kind === 'itzpapalotl';
    bus.emit('balam:strike', { x: e.x, y: e.y });
    // El golpe lo pone audio al oír 'balam:strike' (jaguar_embiste).
    burst(e.x, e.y, JG.color, 1);
    if (!reduceFx()) world.hitstop(40);
    world.shake(0.004, 160);
    // Respaldo directo con la API existente (el enemigo decide qué hace con el golpe).
    e.takeHit({
      damage: boss ? JG.bossDamage : JG.damage,
      stun: boss ? JG.bossStun : JG.stun,
      kind: 'melee',
      sourceX: me.x,
      knockback: boss ? 0 : JG.knockback,
    });
  };

  /* ------------------------------ Update ----------------------------- */

  const onUpdate = (_t: number, deltaMs: number) => {
    if (!sprite || !shadow) return;
    const realDt = Math.min(deltaMs / 1000, 0.05);
    const dt = realDt * world.timeScale;
    time += dt;
    modeT += dt;
    const p = world.player;
    // En cinemáticas y diálogos (controles bloqueados sin deletreo) no ataca.
    const quiet = transforming || !!leaving || (p.controlsLocked && !GameState.casting) || !p.alive;

    if (mode === 'windup' || mode === 'dash') {
      if (quiet || !valid(target)) {
        mode = 'recover';
        modeT = 0;
      }
    }

    let moving = false;
    switch (mode) {
      case 'follow': {
        const t = behind();
        const dx = t.x - me.x;
        const dy = t.y - me.y;
        const d = Math.hypot(dx, dy * 2);
        if (d > JG.teleportDist) {
          const pt = world.randomPointNear(t.x, t.y, 24);
          me.x = pt.x;
          me.y = pt.y;
        } else if (d > 10) {
          const k = Math.min(1, ((d > 70 ? JG.catchUpSpeed : JG.speed) * dt) / d);
          world.moveActor(me, dx * k, dy * k);
          if (Math.abs(dx) > 2) facing = dx > 0 ? 1 : -1;
          moving = true;
        } else facing = p.x >= me.x ? 1 : -1;
        if (!quiet) {
          cd -= dt;
          if (cd <= 0) {
            target = findPrey();
            if (target) {
              mode = 'windup';
              modeT = 0;
              facing = target.x >= me.x ? 1 : -1;
              sfx('jaguar_prepara');
            } else cd = 0.5; // nada cerca: vuelve a mirar en un momento
          }
        }
        break;
      }
      case 'windup':
        if (modeT >= JG.windup) {
          mode = 'dash';
          modeT = 0;
        }
        break;
      case 'dash': {
        const e = target!;
        const side = me.x <= e.x ? -1 : 1; // se detiene del lado por el que llega
        const gx = e.x + side * Math.max(10, e.radius * 0.6);
        const dx = gx - me.x;
        const dy = e.y - me.y;
        const d = Math.hypot(dx, dy * 2);
        facing = e.x >= me.x ? 1 : -1;
        if (d <= JG.reach + e.radius || modeT >= JG.dashMaxTime) {
          if (planeDist(e.x, e.y, me.x, me.y) <= JG.reach + e.radius + 24) strike(e);
          mode = 'recover';
          modeT = 0;
        } else {
          const k = Math.min(1, (JG.dashSpeed * dt) / d);
          // Salta por encima de lo que estorbe: no choca, pero no sale del mundo.
          me.x = Phaser.Math.Clamp(me.x + dx * k, 0, world.level.width);
          me.y = Phaser.Math.Clamp(me.y + dy * k, 0, 360);
          moving = true;
        }
        break;
      }
      case 'recover':
        if (modeT >= 0.35) {
          mode = 'follow';
          target = null;
          cd = Phaser.Math.FloatBetween(JG.cooldownMin, JG.cooldownMax);
          // Si terminó fuera del suelo transitable, vuelve a uno cercano.
          if (!world.isWalkable(me.x, me.y, JG.radius)) {
            const pt = world.randomPointNear(me.x, me.y, 30);
            me.x = pt.x;
            me.y = pt.y;
          }
        }
        break;
    }

    // Dibujo.
    const z = mode === 'dash' ? Math.sin(Math.min(1, modeT / JG.dashMaxTime) * Math.PI) * 14 : 0;
    const crouch = mode === 'windup' && !reduceFx() ? Phaser.Math.Between(-1, 1) : 0;
    sprite.setPosition(Math.round(me.x + crouch), Math.round(me.y - z)).setDepth(me.y);
    if (kit) {
      kit.setAnim(mode === 'windup' || mode === 'dash' ? 'balam_jaguar_ataque' : moving ? 'balam_jaguar_correr' : 'balam_jaguar_reposo');
      kit.apply(facing, time);
    } else {
      sprite.setFlipX(facing < 0);
      if (!transforming && !leaving) {
        if (mode === 'windup') sprite.setScale(1.04, 0.9);
        else if (mode === 'dash') sprite.setScale(1.08, 0.95);
        else sprite.setScale(1, 1 + Math.sin(time * (moving ? 12 : 2.4)) * (moving ? 0.03 : 0.015));
      }
    }
    shadow.setPosition(Math.round(me.x), Math.round(me.y)).setDepth(DEPTH.shadow + me.y * 0.0001);
    if (aura && !leaving) {
      const want = mode === 'windup' || mode === 'dash' ? 0.6 : reduceFx() ? 0.25 : 0.25 + 0.08 * Math.sin(time * 3);
      aura.setAlpha(aura.alpha + (want - aura.alpha) * Math.min(1, realDt * 8));
    }
    aura?.setPosition(sprite.x, me.y - z - 26).setDepth(me.y - 0.5);
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const self: Instance = {
    awaken,
    calm,
    get present() {
      return !!sprite && !leaving && GameState.balamJaguar;
    },
  };
  inst = self;

  // Reintento (muerte / cambio de sección): si ya era jaguar, reaparece junto al jugador sin fanfarria.
  if (GameState.balamJaguar) {
    const t = behind();
    spawn(t.x, t.y);
  }

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    clear();
    if (inst === self) inst = null;
  });
}
