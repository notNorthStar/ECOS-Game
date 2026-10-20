import Phaser from 'phaser';
import type { SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH } from '../config/game';
import { kitAnimatorFor, type KitAnimator } from './CharacterKits';
import { getSpellDef } from './Mastery';

/**
 * Dueño: sistemas (Nivel 10). LA MADRE encadenada en el altar mayor de la Catedral. LevelScene llama
 * installMadre(world) en todas las secciones; no hace nada hasta placeMadre().
 *
 * - placeMadre(world, x, y): aparece encadenada (cadenas de luz morada que la sujetan al altar), dormida.
 * - wakeMadre(): despierta (ojos y gema brillan) y emite 'madre:awake' {on: true}.
 * - madreSign(): responde en señas (las manos se mueven ~MD.signMs, glifos de luz suben). Emite 'madre:sign'
 *   {x, y, ms} e 'itzpa:stagger' {ms} (paraliza a Itzpapálotl: la ventana para ECOS). Resuelve al terminar las
 *   señas. Si ya está respondiendo, devuelve la misma promesa (no encadena otra ventana). Si no está colocada,
 *   emite los eventos igual (en la posición del jugador) para que la secuencia no se atore.
 * - MAMA con Q: este sistema escucha 'spell:resolved'; un MAMA no fallido con la madre colocada y despierta llama
 *   a madreSign() solo. El director también puede llamarla directamente (sin doble ventana: ver arriba).
 * - freeMadre(): las cadenas se rompen en luz. Resuelve al terminar.
 * - getMadrePosition(): posición en el plano del suelo (null si no está).
 * Nunca recibe daño: es intangible, NO se agrega a world.entities.
 * Arte: kit del equipo `madre` (KitAnimator) si existe; si no, placeholder simple (AGENTS.md §8.0):
 * humanoide 64×80, pivote (32, 78).
 */

export const MD = {
  /** Duración de las señas (ms). Se puede ajustar en spells.json → MAMA.effect.signMs. */
  signMs: 1200,
  /** Parálisis de Itzpapálotl (ms). spells.json → MAMA.effect.staggerMs. */
  staggerMs: 3500,
  /** Liberación: las cadenas se rompen (ms). */
  freeMs: 900,
  /** Puntos de anclaje de las cadenas respecto a los pies (px). */
  anchorSpread: 34,
  chainColor: 0x9a5cff,
  chainCore: 0xe6d0ff,
  gemColor: 0x50e0b0,
  signColor: 0xffc8e8,
};

const TEX = '__madre_ph';
const GLOW = '__madre_glow';
/** Placeholder: cuadro 64×80, pivote (32, 78), mirando a la derecha. */
const FRAME = { w: 64, h: 80, feetY: 78 };
/** Alturas sobre los pies: muñecas, pecho (gema) y ojos. */
const WRIST_H = 40;
const GEM_H = 48;
const EYE = { x: 6, h: 64 };

interface Instance {
  place(x: number, y: number): void;
  wake(): void;
  sign(): Promise<void>;
  free(): Promise<void>;
  position(): { x: number; y: number } | null;
}

let inst: Instance | null = null;
let worldRef: WorldApi | null = null;

const signParams = () => {
  const e = getSpellDef('MAMA')?.effect ?? {};
  return { signMs: e.signMs ?? MD.signMs, staggerMs: e.staggerMs ?? MD.staggerMs };
};

/** Coloca a la madre encadenada en el altar (x, y). */
export function placeMadre(world: WorldApi, x: number, y: number): void {
  if (!inst || worldRef !== world) installMadre(world);
  inst?.place(x, y);
}

/** Despierta a la madre: 'madre:awake' {on: true}; ojos y gema brillan. */
export function wakeMadre(): void {
  if (inst) inst.wake();
  else bus.emit('madre:awake', { on: true });
}

/** La madre responde en señas y paraliza a Itzpapálotl ('madre:sign' + 'itzpa:stagger'). */
export function madreSign(): Promise<void> {
  if (inst) return inst.sign();
  // Sin escena (no debería pasar): solo los eventos, para que la pelea no se atore.
  const { signMs, staggerMs } = signParams();
  const p = worldRef?.player;
  bus.emit('madre:sign', { x: p?.x ?? 0, y: p?.y ?? 0, ms: signMs });
  bus.emit('itzpa:stagger', { ms: staggerMs });
  return Promise.resolve();
}

/** Las cadenas de luz se rompen. Resuelve al terminar el efecto. */
export function freeMadre(): Promise<void> {
  return inst ? inst.free() : Promise.resolve();
}

/** Posición de la madre en el plano del suelo (null si no está colocada). */
export function getMadrePosition(): { x: number; y: number } | null {
  return inst?.position() ?? null;
}

function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX) && scene.textures.exists(GLOW)) return;
  const g = scene.make.graphics({}, false);
  const edge = 0x5a4a78; // contorno de color (no negro)
  const ropa = 0x3a6a78;
  const ropaSombra = 0x2a4a5a;
  const ropaLuz = 0x5a8c98;
  const piel = 0xc89878;
  const pielSombra = 0xa07860;
  const pelo = 0x2a1e2a;
  const P = (pts: number[][]) => pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  // Falda / pantalón y pies.
  g.fillStyle(ropaSombra, 1).fillRect(26, 54, 6, 22).fillRect(33, 54, 6, 22);
  g.fillStyle(edge, 1).fillRect(25, 76, 8, 2).fillRect(32, 76, 9, 2);
  // Torso (blusa con bata de taller).
  const torso = P([[24, 28], [40, 28], [42, 56], [22, 56]]);
  g.fillStyle(ropa, 1).fillPoints(torso, true);
  g.fillStyle(ropaLuz, 1).fillRect(25, 29, 5, 25);
  g.fillStyle(ropaSombra, 1).fillRect(37, 30, 4, 25);
  g.lineStyle(1, edge, 1).strokePoints(torso, true);
  // Brazos (levantados por las cadenas, a los lados).
  g.fillStyle(ropa, 1).fillRect(18, 30, 6, 12).fillRect(40, 30, 6, 12);
  g.fillStyle(piel, 1).fillRect(18, 40, 6, 4).fillRect(40, 40, 6, 4);
  // Cuello y cabeza (de lado, mirando a la derecha).
  g.fillStyle(pielSombra, 1).fillRect(30, 24, 5, 5);
  g.fillStyle(piel, 1).fillEllipse(34, 16, 14, 16);
  g.fillStyle(pielSombra, 1).fillRect(28, 18, 3, 6);
  // Cabello recogido, con mechones.
  g.fillStyle(pelo, 1).fillEllipse(30, 12, 14, 12).fillCircle(24, 16, 4).fillRect(26, 18, 4, 8);
  g.lineStyle(1, edge, 1).strokeEllipse(34, 16, 14, 16);
  // Ojo cerrado (el brillo al despertar va en otra capa).
  g.fillStyle(0x4a3040, 1).fillRect(37, 15, 3, 1);
  // Engaste de la gema en el pecho.
  g.fillStyle(0xd0b060, 1).fillRect(30, 31, 5, 5);
  g.fillStyle(0x2a8a70, 1).fillRect(31, 32, 3, 3);
  g.generateTexture(TEX, FRAME.w, FRAME.h);
  g.clear();
  for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.08 + (1 - r / 16) * 0.25).fillCircle(16, 16, r);
  g.generateTexture(GLOW, 32, 32);
  g.destroy();
}

export function installMadre(world: WorldApi): void {
  const scene = world.scene;
  worldRef = world;
  let sprite: Phaser.GameObjects.Sprite | null = null;
  let shadow: Phaser.GameObjects.Ellipse | null = null;
  let chains: Phaser.GameObjects.Graphics | null = null;
  let hands: Phaser.GameObjects.Graphics | null = null;
  let gem: Phaser.GameObjects.Image | null = null;
  let eye: Phaser.GameObjects.Image | null = null;
  let kit: KitAnimator | null = null;
  const me = { x: 0, y: 0 };
  let facing: 1 | -1 = -1;
  let time = 0;
  let awake = false;
  let chained = true;
  let awakeK = 0;
  let signing: { t: number; ms: number; promise: Promise<void>; resolve: () => void } | null = null;
  let freeing: Promise<void> | null = null;
  const pending: Array<() => void> = [];

  const reduceFx = () => GameState.settings.reduceFx;

  const clear = () => {
    for (const o of [sprite, shadow, chains, hands, gem, eye]) {
      if (!o) continue;
      scene.tweens.killTweensOf(o);
      o.destroy();
    }
    sprite = null;
    shadow = null;
    chains = null;
    hands = null;
    gem = null;
    eye = null;
    kit = null;
    awake = false;
    chained = true;
    awakeK = 0;
    freeing = null;
    if (signing) signing.resolve();
    signing = null;
    pending.splice(0).forEach((r) => r());
  };

  const place = (x: number, y: number) => {
    if (sprite) clear();
    ensureTextures(scene);
    me.x = x;
    me.y = y;
    facing = world.player.x >= x ? 1 : -1;
    shadow = scene.add.ellipse(x, y, 26, 6, 0x000000, 0.3).setDepth(DEPTH.shadow + y * 0.0001);
    sprite = scene.add.sprite(x, y, TEX).setOrigin(0.5, FRAME.feetY / FRAME.h);
    kit = kitAnimatorFor(sprite, 'madre');
    chains = scene.add.graphics();
    hands = scene.add.graphics();
    gem = scene.add.image(x, y - GEM_H, GLOW).setTint(MD.gemColor).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.15).setScale(0.6);
    eye = scene.add.image(x, y - EYE.h, GLOW).setTint(0xb8fff0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.25);
  };

  const wake = () => {
    if (awake) return;
    awake = true;
    bus.emit('madre:awake', { on: true });
    // Sonido: audio escucha 'madre:awake' (madre_despierta).
    if (sprite && !reduceFx()) {
      const ring = scene.add.ellipse(me.x, me.y - GEM_H, 20, 20, MD.gemColor, 0).setStrokeStyle(2, MD.gemColor, 0.9).setDepth(me.y + 1);
      scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
    }
  };

  /** Glifo de luz (una mano pequeña) que sube desde las manos. */
  const glyph = (x: number, y: number) => {
    const s = scene.add.image(x, y, GLOW).setTint(MD.signColor).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3).setDepth(me.y + 1);
    scene.tweens.add({ targets: s, y: y - 26, alpha: 0, scale: 0.6, duration: 700, onComplete: () => s.destroy() });
  };

  const sign = (): Promise<void> => {
    if (signing) return signing.promise;
    const { signMs, staggerMs } = signParams();
    const at = sprite ? { x: me.x, y: me.y } : { x: world.player.x, y: world.player.y };
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    if (sprite) signing = { t: 0, ms: signMs, promise, resolve };
    if (!awake && sprite) wake();
    bus.emit('madre:sign', { x: at.x, y: at.y, ms: signMs });
    bus.emit('itzpa:stagger', { ms: staggerMs });
    // Sonido: audio escucha 'madre:sign' (madre_senas) e 'itzpa:stagger' (itzpa_cristal).
    if (!reduceFx()) world.flash(0xffc8e8, 160);
    if (!sprite) {
      // Sin la madre en escena: solo los eventos, resuelve tras el mismo tiempo.
      scene.time.delayedCall(signMs, resolve);
    }
    return promise;
  };

  const free = (): Promise<void> => {
    if (!sprite) return Promise.resolve();
    if (freeing) return freeing;
    if (!chained) return Promise.resolve();
    sfx('cadenas_rotas');
    world.shake(0.004, 220);
    if (!reduceFx()) world.flash(0xd8b8ff, 220);
    // Eslabones de luz que salen volando y se apagan.
    const n = reduceFx() ? 6 : 18;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const sx = me.x + side * (8 + Math.random() * MD.anchorSpread);
      const sy = me.y - Math.random() * WRIST_H;
      const bit = scene.add.rectangle(sx, sy, 3, 2, i % 3 ? MD.chainColor : MD.chainCore, 1).setDepth(me.y + 1).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: bit,
        x: sx + side * (20 + Math.random() * 40),
        y: sy - 10 - Math.random() * 40,
        angle: Math.random() * 360,
        alpha: 0,
        duration: MD.freeMs * (0.6 + Math.random() * 0.4),
        ease: 'Cubic.easeOut',
        onComplete: () => bit.destroy(),
      });
    }
    freeing = new Promise<void>((resolve) => {
      pending.push(resolve);
      scene.time.delayedCall(MD.freeMs, () => {
        chained = false;
        chains?.clear();
        freeing = null;
        const i = pending.indexOf(resolve);
        if (i >= 0) pending.splice(i, 1);
        resolve();
      });
    });
    // Desde ya dejan de dibujarse completas: se ven "rotas" mientras vuelan los eslabones.
    chained = false;
    return freeing;
  };

  // MAMA lanzado con Q (o por el director): la madre despierta responde sola.
  bus.scoped(scene, 'spell:resolved', (ev: SpellOutcomeEvent) => {
    if (ev.spellId !== 'MAMA' || ev.outcome === 'fail') return;
    if (sprite && awake) void sign();
  });

  /* ------------------------------ Update ----------------------------- */

  const onUpdate = (_t: number, deltaMs: number) => {
    if (!sprite || !shadow || !chains || !hands || !gem || !eye) return;
    const realDt = Math.min(deltaMs / 1000, 0.05);
    time += realDt;
    const p = world.player;
    if (Math.abs(p.x - me.x) > 6) facing = p.x >= me.x ? 1 : -1;

    // Señas (en tiempo real: la ventana no depende de la ralentización).
    let signK = 0;
    if (signing) {
      signing.t += realDt * 1000;
      signK = Math.min(1, signing.t / signing.ms);
      if (!reduceFx() && Math.random() < realDt * 10) glyph(me.x + facing * 10, me.y - WRIST_H - 6);
      if (signing.t >= signing.ms) {
        const s = signing;
        signing = null;
        s.resolve();
      }
    }

    sprite.setPosition(Math.round(me.x), Math.round(me.y)).setDepth(me.y);
    if (kit) {
      kit.setAnim(signing ? 'madre_conjuro' : 'madre_reposo');
      kit.apply(facing, time);
    } else {
      sprite.setFlipX(facing < 0);
      // Respira despacio; dormida, casi no se mueve.
      sprite.setScale(1, 1 + Math.sin(time * (awake ? 2.4 : 1.2)) * (awake ? 0.015 : 0.006));
    }
    shadow.setPosition(Math.round(me.x), Math.round(me.y)).setDepth(DEPTH.shadow + me.y * 0.0001);

    // Ojos y gema.
    awakeK += ((awake ? 1 : 0) - awakeK) * Math.min(1, realDt * 3);
    const pulse = reduceFx() ? 1 : 0.8 + 0.2 * Math.sin(time * 4);
    gem.setPosition(me.x, me.y - GEM_H).setDepth(me.y + 0.3).setAlpha(0.15 + 0.7 * awakeK * pulse + (signing ? 0.2 : 0)).setScale(0.6 + 0.6 * awakeK);
    eye.setPosition(me.x + facing * EYE.x, me.y - EYE.h).setDepth(me.y + 0.3).setAlpha(0.9 * awakeK * pulse);

    // Manos haciendo señas: dos puntos de luz que trazan formas frente al pecho.
    hands.clear();
    if (signing) {
      const a = signK * Math.PI * 4;
      const cx = me.x + facing * 9;
      const cy = me.y - WRIST_H - 4;
      const h1 = { x: cx + Math.cos(a) * 5, y: cy + Math.sin(a * 1.5) * 4 };
      const h2 = { x: cx + facing * 4 + Math.sin(a) * 4, y: cy + 3 + Math.cos(a * 0.75) * 3 };
      for (const h of [h1, h2]) {
        hands.fillStyle(MD.signColor, 0.35).fillCircle(h.x, h.y, 4);
        hands.fillStyle(0xfff0f8, 1).fillRect(Math.round(h.x) - 1, Math.round(h.y) - 1, 3, 3);
      }
      hands.setDepth(me.y + 0.4);
    }

    // Cadenas de luz morada: de las muñecas a dos anclas del altar (detrás y a los lados), con vaivén y parpadeo.
    chains.clear();
    if (chained) {
      const flick = reduceFx() ? 0.85 : 0.65 + 0.25 * Math.sin(time * 7) + 0.1 * Math.sin(time * 23);
      for (const side of [-1, 1]) {
        const wx = me.x + side * 11;
        const wy = me.y - WRIST_H;
        const ax = me.x + side * MD.anchorSpread;
        const ay = me.y - 4;
        const topX = me.x + side * (MD.anchorSpread - 6);
        const topY = me.y - WRIST_H - 22;
        for (const [x2, y2] of [
          [ax, ay],
          [topX, topY],
        ]) {
          const sag = reduceFx() ? 2 : 2 + Math.sin(time * 2 + side) * 1.5;
          const mx = (wx + x2) / 2;
          const my = (wy + y2) / 2 + sag;
          chains.lineStyle(3, MD.chainColor, 0.3 * flick).beginPath().moveTo(wx, wy).lineTo(mx, my).lineTo(x2, y2).strokePath();
          chains.lineStyle(1, MD.chainCore, flick).beginPath().moveTo(wx, wy).lineTo(mx, my).lineTo(x2, y2).strokePath();
          // Eslabones.
          for (let k = 1; k < 5; k++) {
            const t = k / 5;
            const lx = t < 0.5 ? wx + (mx - wx) * t * 2 : mx + (x2 - mx) * (t - 0.5) * 2;
            const ly = t < 0.5 ? wy + (my - wy) * t * 2 : my + (y2 - my) * (t - 0.5) * 2;
            chains.fillStyle(MD.chainCore, flick).fillRect(Math.round(lx) - 1, Math.round(ly) - 1, 2, 2);
          }
        }
        chains.fillStyle(MD.chainColor, 0.5 * flick).fillCircle(ax, ay, 3).fillCircle(topX, topY, 3);
      }
      chains.setDepth(me.y + 0.2);
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const self: Instance = {
    place,
    wake,
    sign,
    free,
    position: () => (sprite ? { x: me.x, y: me.y } : null),
  };
  inst = self;

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    clear();
    if (inst === self) inst = null;
    if (worldRef === world) worldRef = null;
  });
}
