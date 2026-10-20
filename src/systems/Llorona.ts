import Phaser from 'phaser';
import type { EnemyApi, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH } from '../config/game';
import { kitAnimatorFor, type KitAnimator } from './CharacterKits';

/**
 * Dueño: sistemas (Nivel 7). LA LLORONA como ALIADA contra el Rey del Olvido (no es enemiga).
 * LevelScene llama installLlorona(world) en todas las secciones; no hace nada hasta summonLlorona().
 *
 * - summonLlorona(world, x, y): aparece (desvanecimiento de entrada) en (x, y) y flota cerca del Rey del
 *   Olvido (enemigo kind 'rey_olvido'); si no hay Rey, cerca del jugador.
 * - GRITO ESPECTRAL cada LL.cooldown s (aleatorio entre min y max, en tiempo del mundo): breve carga
 *   (tiembla y brilla) → onda visual + emite 'llorona:scream' {x, y} + sfx 'llorona_grito'.
 *   Respaldo directo con la API existente: takeHit (daño moderado + aturdimiento, kind 'shockwave') al Rey y a
 *   cualquier otro enemigo dentro del radio (clones que estén en world.enemies se disipan al golpe). Los clones
 *   INTERNOS del Rey (fuera de world.enemies) los disipa el propio Rey escuchando 'llorona:scream'.
 *   NUNCA daña al jugador. Es intangible e invulnerable: NO se agrega a world.entities.
 * - setLloronaWild(on): fuera de control (secuencia final): tiembla, deriva y grita sin objetivo, SIN dañar
 *   y SIN emitir 'llorona:scream' (solo sonido y onda), para que nadie lo tome como ataque.
 * - dismissLlorona(): despedida (sube despacio, brilla y se desvanece). Resuelve al terminar.
 * No sobrevive a reinicios de LevelScene (muerte/cambio de sección): el director la vuelve a invocar.
 * Arte: kit del equipo `llorona` (KitAnimator) si existe; si no, placeholder simple (AGENTS.md §8.0).
 */

export const LL = {
  /** Segundos entre gritos (aleatorio en [min, max]). */
  cooldownMin: 5,
  cooldownMax: 7,
  /** Primer grito tras aparecer. */
  firstDelay: 3,
  /** Carga visible antes del grito (s). */
  windup: 0.7,
  /** Radio del grito en el plano del suelo (elipse ry = rx / 2). */
  radius: 170,
  /** Al Rey: daño moderado y aturdimiento (s). */
  bossDamage: 6,
  bossStun: 2.2,
  /** A otros enemigos (clones, esbirros) dentro del radio. */
  damage: 40,
  stun: 2,
  knockback: 10,
  /** Dónde flota respecto al Rey: px a su lado (hacia el jugador) y separación en profundidad. */
  sideOffset: 70,
  depthOffset: -14,
  speed: 70,
  /** Altura a la que flota (z) y su vaivén. */
  hover: 12,
  bob: 4,
  /** Fuera de control. */
  wildCooldown: 2.6,
  wildDrift: 40,
  ringMs: 650,
  appearMs: 900,
  farewellMs: 2200,
  color: 0xdfe8ff,
  colorCore: 0x9fc4ff,
};

const TEX = '__llorona_ph';
const GLOW = '__llorona_glow';
/** Placeholder: cuadro 64×80, pivote (32, 78), mirando a la derecha (como humanoide del kit). */
const FRAME = { w: 64, h: 80, feetY: 78 };
const HEAD_H = 70;

const planeDist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, (ay - by) * 2);

interface Instance {
  summon(x: number, y: number): void;
  dismiss(): Promise<void>;
  setWild(on: boolean): void;
  readonly present: boolean;
  position(): { x: number; y: number } | null;
}

let inst: Instance | null = null;

/** Invoca a la Llorona en (x, y). Requiere que LevelScene ya la haya instalado (lo hace en create). */
export function summonLlorona(world: WorldApi, x: number, y: number): void {
  if (!inst) installLlorona(world);
  inst?.summon(x, y);
}

/** Despedida: sube, brilla y se desvanece. Resuelve al terminar (o enseguida si no está). */
export function dismissLlorona(): Promise<void> {
  return inst ? inst.dismiss() : Promise.resolve();
}

/** Fuera de control (true) o de vuelta a la normalidad (false). */
export function setLloronaWild(on: boolean): void {
  inst?.setWild(on);
}

/** ¿Está en escena? */
export function isLloronaPresent(): boolean {
  return !!inst?.present;
}

/** Posición en el plano del suelo (null si no está), p. ej. para globos de diálogo. */
export function getLloronaPosition(): { x: number; y: number } | null {
  return inst?.position() ?? null;
}

function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX) && scene.textures.exists(GLOW)) return;
  const g = scene.make.graphics({}, false);
  const edge = 0x8a9ac0; // contorno de color (no negro)
  const vestido = 0xe8ecf4;
  const sombraTela = 0xb8c2d8;
  const velo = 0xf4f6ff;
  const P = (pts: number[][]) => pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  // Vestido largo que se deshace en jirones abajo (flota: sin pies).
  const falda = P([[25, 34], [39, 34], [46, 66], [43, 74], [39, 68], [35, 77], [31, 69], [26, 76], [22, 68], [18, 72]]);
  g.fillStyle(vestido, 1).fillPoints(falda, true);
  g.fillStyle(sombraTela, 1).fillPoints(P([[34, 36], [39, 36], [44, 64], [39, 66]]), true);
  g.lineStyle(1, edge, 1).strokePoints(falda, true);
  // Torso y brazos caídos.
  g.fillStyle(vestido, 1).fillRect(26, 22, 12, 14);
  g.fillStyle(sombraTela, 1).fillRect(35, 24, 3, 12);
  // Velo largo que cubre la cabeza y cae por la espalda.
  const v = P([[27, 6], [37, 5], [42, 13], [41, 26], [36, 30], [30, 40], [21, 50], [17, 40], [21, 20]]);
  g.fillStyle(velo, 0.95).fillPoints(v, true);
  g.lineStyle(1, edge, 1).strokePoints(v, true);
  // Rostro pálido, apenas visible bajo el velo (de lado, mirando a la derecha).
  g.fillStyle(0xcfd8e8, 1).fillEllipse(37, 16, 7, 9);
  g.fillStyle(0x1a1e30, 1).fillRect(32, 10, 3, 10); // cabello oscuro bajo el velo
  g.fillStyle(0x4a5a80, 1).fillRect(39, 15, 1, 1); // ojo
  g.fillStyle(0x7a8ab0, 1).fillRect(39, 17, 1, 2); // lágrima
  // Manos.
  g.fillStyle(0xdfe6f2, 1).fillCircle(39, 37, 2);
  g.generateTexture(TEX, FRAME.w, FRAME.h);
  g.clear();
  for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.08 + (1 - r / 16) * 0.25).fillCircle(16, 16, r);
  g.generateTexture(GLOW, 32, 32);
  g.destroy();
}

export function installLlorona(world: WorldApi): void {
  const scene = world.scene;
  let sprite: Phaser.GameObjects.Sprite | null = null;
  let shadow: Phaser.GameObjects.Ellipse | null = null;
  let aura: Phaser.GameObjects.Image | null = null;
  let kit: KitAnimator | null = null;
  const me = { x: 0, y: 0, radius: 10 };
  let facing: 1 | -1 = 1;
  let time = 0;
  let cd: number = LL.firstDelay;
  let windup = 0;
  let wild = false;
  let leaving = false;
  let leavingDone: Promise<void> | null = null;
  let resolveLeave: (() => void) | null = null;
  let driftTarget: { x: number; y: number } | null = null;

  const reduceFx = () => GameState.settings.reduceFx;

  const findRey = (): EnemyApi | null => {
    for (const e of world.enemies) if (e.kind === 'rey_olvido' && e.alive && !e.purified && !e.exhausted) return e;
    return null;
  };

  const clear = () => {
    if (aura) scene.tweens.killTweensOf(aura);
    if (shadow) scene.tweens.killTweensOf(shadow);
    sprite?.destroy();
    shadow?.destroy();
    aura?.destroy();
    sprite = null;
    shadow = null;
    aura = null;
    kit = null;
    windup = 0;
    wild = false;
    leaving = false;
    leavingDone = null;
    driftTarget = null;
    const r = resolveLeave;
    resolveLeave = null;
    r?.();
  };

  const summon = (x: number, y: number) => {
    if (sprite && !leaving) return;
    if (sprite) clear();
    ensureTexture(scene);
    me.x = x;
    me.y = y;
    cd = LL.firstDelay;
    shadow = scene.add.ellipse(x, y, 20, 5, 0x000000, 0.25).setDepth(DEPTH.shadow + y * 0.0001);
    sprite = scene.add.sprite(x, y - LL.hover, TEX).setOrigin(0.5, FRAME.feetY / FRAME.h);
    kit = kitAnimatorFor(sprite, 'llorona');
    aura = scene.add.image(x, y - HEAD_H / 2, GLOW).setTint(LL.color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25).setScale(2.5);
    sprite.setAlpha(0);
    scene.tweens.add({ targets: sprite, alpha: 0.92, duration: LL.appearMs });
    if (!reduceFx()) world.flash(0xdfe8ff, 220);
    sfx('llorona_aparece');
  };

  const ring = (x: number, y: number, color: number, scale = 1) => {
    const r = LL.radius * scale;
    const n = reduceFx() ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const e = scene.add
        .ellipse(x, y, r * 2, r, 0x000000, 0)
        .setStrokeStyle(i === 0 ? 2 : 1, i === 0 ? color : LL.colorCore, reduceFx() ? 0.5 : 0.9)
        .setDepth(y - 1)
        .setScale(0.06);
      scene.tweens.add({
        targets: e,
        scale: 1,
        alpha: 0,
        delay: i * 120,
        duration: LL.ringMs,
        ease: 'Sine.easeOut',
        onComplete: () => e.destroy(),
      });
    }
    if (!reduceFx()) {
      const glow = scene.add.image(x, y - HEAD_H * 0.6 - LL.hover, GLOW).setTint(LL.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 1);
      scene.tweens.add({ targets: glow, scale: 5, alpha: 0, duration: LL.ringMs, onComplete: () => glow.destroy() });
    }
  };

  const scream = () => {
    const x = me.x;
    const y = me.y;
    if (wild) sfx('llorona_grito'); // con objetivo suena por 'llorona:scream' (audio/cdmx2.ts)
    ring(x, y, LL.color, wild ? 0.8 : 1);
    if (!reduceFx()) world.shake(wild ? 0.003 : 0.005, 260);
    if (wild) return; // fuera de control: sin objetivo y sin daño
    bus.emit('llorona:scream', { x, y });
    // Respaldo directo: aturde/daña a los enemigos dentro del radio (nunca al jugador).
    for (const e of [...world.enemies]) {
      if (!e.alive || e.purified || e.exhausted) continue;
      if (planeDist(e.x, e.y, x, y) > LL.radius + e.radius) continue;
      const boss = e.kind === 'rey_olvido';
      e.takeHit({
        damage: boss ? LL.bossDamage : LL.damage,
        stun: boss ? LL.bossStun : LL.stun,
        kind: 'shockwave',
        sourceX: x,
        knockback: boss ? 0 : LL.knockback,
      });
    }
  };

  const dismiss = (): Promise<void> => {
    if (!sprite) return Promise.resolve();
    if (leavingDone) return leavingDone;
    leaving = true;
    windup = 0;
    const s = sprite;
    sfx('llorona_despedida');
    leavingDone = new Promise<void>((resolve) => {
      resolveLeave = resolve;
      const targets: Phaser.GameObjects.GameObject[] = [s];
      if (aura) targets.push(aura);
      if (aura && !reduceFx()) scene.tweens.add({ targets: aura, scale: 5, duration: LL.farewellMs * 0.5, yoyo: true });
      if (shadow) scene.tweens.add({ targets: shadow, alpha: 0, duration: LL.farewellMs * 0.6 });
      scene.tweens.add({
        targets: s,
        alpha: 0,
        duration: LL.farewellMs,
        ease: 'Sine.easeIn',
        onComplete: () => {
          if (aura) aura.setAlpha(0);
          clear();
        },
      });
    });
    return leavingDone;
  };

  const setWild = (on: boolean) => {
    wild = on;
    cd = on ? Math.min(cd, 1) : LL.firstDelay;
    driftTarget = null;
  };

  /* ------------------------------ Update ----------------------------- */

  const onUpdate = (_t: number, deltaMs: number) => {
    if (!sprite || !shadow) return;
    const realDt = Math.min(deltaMs / 1000, 0.05);
    const dt = realDt * world.timeScale;
    time += dt;

    // A dónde flota.
    let goal: { x: number; y: number } | null = null;
    if (leaving) {
      goal = null;
    } else if (wild) {
      if (!driftTarget || planeDist(driftTarget.x, driftTarget.y, me.x, me.y) < 6) {
        driftTarget = world.randomPointNear(me.x, me.y, LL.wildDrift);
      }
      goal = driftTarget;
    } else {
      const rey = findRey();
      const p = world.player;
      if (rey) {
        // A un costado del Rey, del lado del jugador (para que el grito lo alcance sin estorbar).
        const side = p.x >= rey.x ? 1 : -1;
        goal = { x: rey.x + side * LL.sideOffset, y: rey.y + LL.depthOffset };
        facing = rey.x >= me.x ? 1 : -1;
      } else {
        goal = { x: p.x - p.facing * 50, y: p.y - 10 };
        facing = p.x >= me.x ? 1 : -1;
      }
    }
    if (goal && windup <= 0) {
      const dx = goal.x - me.x;
      const dy = goal.y - me.y;
      const d = Math.hypot(dx, dy * 2);
      if (d > 4) {
        const k = Math.min(1, ((wild ? LL.speed * 0.6 : LL.speed) * dt) / d);
        // Flota: no choca con obstáculos, pero no sale del mundo.
        me.x = Phaser.Math.Clamp(me.x + dx * k, 0, world.level.width);
        me.y = Phaser.Math.Clamp(me.y + dy * k, 0, 360);
        if (wild && Math.abs(dx) > 2) facing = dx > 0 ? 1 : -1;
      }
    }

    // Grito.
    if (!leaving) {
      if (windup > 0) {
        windup -= dt;
        if (windup <= 0) {
          scream();
          cd = wild ? LL.wildCooldown : Phaser.Math.FloatBetween(LL.cooldownMin, LL.cooldownMax);
        }
      } else if (cd > 0) {
        cd -= dt;
      } else if (wild || findRey()) {
        windup = LL.windup;
      }
    }

    // Dibujo: flota con vaivén; tiembla al cargar o fuera de control (en tiempo real).
    const z = LL.hover + Math.sin(time * 2.4) * LL.bob + (leaving ? (1 - sprite.alpha) * 40 : 0);
    const shaking = (windup > 0 || wild) && !reduceFx();
    const jx = shaking ? Phaser.Math.Between(-1, 1) * (wild ? 2 : 1) : 0;
    sprite.setPosition(Math.round(me.x + jx), Math.round(me.y - z)).setDepth(me.y);
    if (kit) {
      kit.setAnim(windup > 0 ? 'llorona_invocar' : 'llorona_reposo');
      kit.apply(facing, time);
    } else {
      sprite.setFlipX(facing < 0);
      sprite.setScale(1, 1 + Math.sin(time * 2.2) * 0.015);
    }
    shadow.setPosition(Math.round(me.x), Math.round(me.y)).setDepth(DEPTH.shadow + me.y * 0.0001);
    if (aura && !leaving) {
      const target = windup > 0 ? (reduceFx() ? 0.4 : 0.7 + 0.2 * Math.sin(time * 25)) : wild ? 0.45 : 0.22;
      aura.setAlpha(aura.alpha + (target - aura.alpha) * Math.min(1, realDt * 8));
    }
    aura?.setPosition(sprite.x, me.y - z - HEAD_H * 0.55).setDepth(me.y - 0.5);
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const self: Instance = {
    summon,
    dismiss,
    setWild,
    get present() {
      return !!sprite && !leaving;
    },
    position: () => (sprite ? { x: me.x, y: me.y } : null),
  };
  inst = self;

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    clear();
    if (inst === self) inst = null;
  });
}
