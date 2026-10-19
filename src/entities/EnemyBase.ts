import Phaser from 'phaser';
import type { EnemyApi, EnemyKind, Hit, SpellOutcomeEvent, Team, WorldApi } from '../core/contracts';
import { bus } from '../core/bus';
import { DEPTH } from '../config/game';
import { FX_DEPTH_BIAS, JUICE } from '../config/combat';
import { getSpellDef } from '../systems/Mastery';
import { kitAnimatorFor, type KitAnimator } from '../systems/CharacterKits';
import { shieldFilterHit } from '../systems/Shield';

/* =====================================================================
 * Utilidades compartidas por las entidades de combate (dueño: combate).
 * - Texturas de respaldo: el arte llega en paralelo; si una clave no existe se
 *   usa una textura generada aquí (mismas medidas y pivote que el arte final).
 * - Efectos (partículas, impactos, estrellitas) con emisores compartidos por escena.
 * - EnemyBase: posición (x, y) en el suelo, z altura, sprite en (x, y − z), sombra en (x, y).
 * ===================================================================== */

/** Claves de texturas de respaldo generadas por código. */
export const FB = {
  px: '__cb_px',
  glow: '__cb_glow',
  star: '__cb_star',
  ring: '__cb_ring',
  chaneque: '__cb_chaneque',
  mayor: '__cb_chaneque_mayor',
  laserGreen: '__cb_laser_verde',
  laserRed: '__cb_laser_rojo',
  eco: '__cb_eco',
  rock: '__cb_roca',
  root: '__cb_raiz',
} as const;

/** Genera (una vez por juego) las texturas de respaldo. */
export function ensureCombatTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  if (tex.exists(FB.px)) return;
  const g = scene.make.graphics({}, false);

  const gen = (key: string, w: number, h: number, draw: () => void) => {
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };

  gen(FB.px, 3, 3, () => {
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 3, 3);
  });
  gen(FB.glow, 32, 32, () => {
    for (let r = 16; r > 0; r -= 2) {
      g.fillStyle(0xffffff, 0.08 + (1 - r / 16) * 0.25).fillCircle(16, 16, r);
    }
  });
  gen(FB.star, 7, 7, () => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(3, 0, 1, 7).fillRect(0, 3, 7, 1).fillRect(2, 2, 3, 3);
  });
  gen(FB.ring, 64, 32, () => {
    g.lineStyle(2, 0xffffff, 1).strokeEllipse(32, 16, 60, 28);
  });
  // Chaneque 48×48, pies en y = 45: cuerpecito con sombrero de hoja.
  gen(FB.chaneque, 48, 48, () => {
    g.fillStyle(0x3d5a2a, 1).fillRect(19, 37, 4, 8).fillRect(25, 37, 4, 8); // piernas
    g.fillStyle(0x6f9a4a, 1).fillRoundedRect(16, 24, 16, 15, 4); // cuerpo
    g.fillStyle(0xc89a6a, 1).fillCircle(24, 20, 7); // cara
    g.fillStyle(0x2b3a1a, 1).fillRect(26, 19, 2, 2).fillRect(21, 19, 2, 2); // ojos
    g.fillStyle(0x8fbf4a, 1).fillTriangle(13, 15, 35, 15, 24, 3); // sombrero
    g.fillStyle(0x5d8a30, 1).fillRect(12, 14, 24, 3);
  });
  // Chaneque Mayor 128×128, pies en y = 122.
  gen(FB.mayor, 128, 128, () => {
    g.fillStyle(0x2f4a22, 1).fillRect(46, 96, 14, 26).fillRect(68, 96, 14, 26);
    g.fillStyle(0x4f7a3a, 1).fillRoundedRect(34, 52, 60, 50, 14);
    g.fillStyle(0x6e5a3a, 1).fillRect(26, 60, 10, 30).fillRect(92, 60, 10, 30); // brazos de raíz
    g.fillStyle(0xb88a5a, 1).fillCircle(64, 44, 18);
    g.fillStyle(0xffe070, 1).fillRect(68, 40, 5, 4).fillRect(55, 40, 5, 4);
    g.fillStyle(0x7fb040, 1).fillTriangle(30, 32, 98, 32, 64, 2);
    g.fillStyle(0x4f7a2a, 1).fillRect(26, 30, 76, 6);
  });
  gen(FB.laserGreen, 32, 6, () => {
    g.fillStyle(0x7dffb0, 0.55).fillRect(0, 0, 32, 6);
    g.fillStyle(0xe8fff0, 1).fillRect(0, 2, 32, 2);
  });
  gen(FB.laserRed, 32, 6, () => {
    g.fillStyle(0xff5a4a, 0.6).fillRect(0, 0, 32, 6);
    g.fillStyle(0xfff0d0, 1).fillRect(0, 2, 32, 2);
  });
  gen(FB.eco, 8, 8, () => {
    g.fillStyle(0x9ff7ff, 0.5).fillCircle(4, 4, 4);
    g.fillStyle(0xffffff, 1).fillCircle(4, 4, 2);
  });
  gen(FB.rock, 16, 16, () => {
    g.fillStyle(0x6a6058, 1).fillCircle(8, 9, 6);
    g.fillStyle(0x8a8078, 1).fillCircle(6, 7, 3);
  });
  gen(FB.root, 24, 48, () => {
    g.fillStyle(0x5a4028, 1).fillTriangle(4, 48, 20, 48, 12, 4);
    g.fillStyle(0x7a5a38, 1).fillTriangle(9, 48, 15, 48, 12, 14);
    g.fillStyle(0x6fa040, 1).fillRect(13, 20, 6, 3);
  });
  g.destroy();
}

/** Devuelve `key` si la textura existe; si no, la de respaldo. */
export function texOr(scene: Phaser.Scene, key: string, fallback: string): string {
  return scene.textures.exists(key) ? key : fallback;
}

/**
 * Reproduce una animación si existe. Si no hay animación pero sí textura, muestra su primer cuadro.
 * Devuelve true si había arte real (para desactivar la animación por código).
 */
export function playOr(sprite: Phaser.GameObjects.Sprite, key: string, fallback: string): boolean {
  const scene = sprite.scene;
  if (scene.anims.exists(key)) {
    sprite.play(key, true);
    return true;
  }
  sprite.anims?.stop();
  if (scene.textures.exists(key)) {
    if (sprite.texture.key !== key) sprite.setTexture(key, 0);
    return true;
  }
  if (sprite.texture.key !== fallback) sprite.setTexture(fallback);
  return false;
}

/** Sprite de un solo uso (anim si existe; si no, tween de respaldo) que se destruye solo. */
export function oneShotFx(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  depth: number,
  opts: { tint?: number; scale?: number; fallback?: string; fallbackMs?: number; add?: boolean; flipX?: boolean } = {},
): Phaser.GameObjects.Sprite {
  const hasAnim = scene.anims.exists(key);
  const tex = scene.textures.exists(key) ? key : (opts.fallback ?? FB.glow);
  const s = scene.add.sprite(x, y, tex).setDepth(depth);
  if (opts.scale) s.setScale(opts.scale);
  if (opts.flipX) s.setFlipX(true);
  if (opts.tint !== undefined && (!scene.textures.exists(key) || opts.add)) s.setTint(opts.tint);
  if (opts.add) s.setBlendMode(Phaser.BlendModes.ADD);
  if (hasAnim) {
    s.play(key);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  } else {
    const ms = opts.fallbackMs ?? 260;
    scene.tweens.add({
      targets: s,
      alpha: 0,
      scaleX: s.scaleX * 1.6,
      scaleY: s.scaleY * 1.6,
      duration: ms,
      onComplete: () => s.destroy(),
    });
  }
  return s;
}

/* ----------------------------- Partículas ----------------------------- */

type EmitterName = 'sparkGreen' | 'sparkRed' | 'purify' | 'eco' | 'dust' | 'calm' | 'stun' | 'electric';
const emitters = new WeakMap<Phaser.Scene, Map<EmitterName, Phaser.GameObjects.Particles.ParticleEmitter>>();

function emitterConfig(name: EmitterName): { tex: string; cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig } {
  switch (name) {
    case 'sparkGreen':
      return {
        tex: FB.glow,
        cfg: {
          speed: { min: 30, max: 110 },
          lifespan: { min: 250, max: 420 },
          scale: { start: 0.22, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: [0x7dffb0, 0xc8ffe0, 0x40e0a0],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        },
      };
    case 'sparkRed':
      return {
        tex: FB.px,
        cfg: {
          speed: { min: 70, max: 220 },
          lifespan: { min: 180, max: 380 },
          scale: { start: 1, end: 0.2 },
          gravityY: 420,
          tint: [0xff5a4a, 0xffb040, 0xfff0a0],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        },
      };
    case 'purify':
      return {
        tex: FB.glow,
        cfg: {
          speedX: { min: -25, max: 25 },
          speedY: { min: -80, max: -25 },
          lifespan: { min: 700, max: 1200 },
          scale: { start: 0.35, end: 0 },
          alpha: { start: 0.9, end: 0 },
          tint: [0x9affc0, 0xe0fff0, 0x70e8a0],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        },
      };
    case 'eco':
      return {
        tex: FB.glow,
        cfg: {
          speed: { min: 0, max: 12 },
          lifespan: 320,
          scale: { start: 0.18, end: 0 },
          alpha: { start: 0.8, end: 0 },
          tint: [0x9ff7ff, 0xffffff],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        },
      };
    case 'dust':
      return {
        tex: FB.px,
        cfg: {
          speedX: { min: -70, max: 70 },
          speedY: { min: -40, max: -5 },
          lifespan: { min: 300, max: 600 },
          scale: { start: 1.3, end: 0.3 },
          alpha: { start: 0.7, end: 0 },
          tint: [0x8a7a62, 0x6a5e4a, 0xa89878],
          emitting: false,
        },
      };
    case 'calm':
      return {
        tex: FB.star,
        cfg: {
          speedX: { min: -12, max: 12 },
          speedY: { min: -40, max: -18 },
          lifespan: { min: 600, max: 1000 },
          scale: { start: 0.9, end: 0.2 },
          alpha: { start: 1, end: 0 },
          tint: [0xb8ffd8, 0xe8fff8],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        },
      };
    case 'stun':
      return {
        tex: FB.star,
        cfg: {
          speed: { min: 20, max: 60 },
          lifespan: 450,
          scale: { start: 1, end: 0 },
          tint: [0xfff07a, 0xffffff],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        },
      };
    case 'electric':
      return {
        tex: FB.px,
        cfg: {
          speed: { min: 40, max: 140 },
          lifespan: { min: 120, max: 260 },
          scale: { start: 1, end: 0 },
          tint: [0xc070ff, 0xff60c0, 0xffffff],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        },
      };
  }
}

/** Ráfaga de partículas en coordenadas del mundo (x, yDibujo). */
export function burst(scene: Phaser.Scene, name: EmitterName, x: number, y: number, depth: number, count: number): void {
  let map = emitters.get(scene);
  if (!map) {
    map = new Map();
    emitters.set(scene, map);
    scene.events.once('shutdown', () => emitters.delete(scene));
    scene.events.once('destroy', () => emitters.delete(scene));
  }
  let em = map.get(name);
  if (!em || !em.scene) {
    const { tex, cfg } = emitterConfig(name);
    em = scene.add.particles(0, 0, tex, cfg);
    map.set(name, em);
  }
  em.setDepth(depth);
  em.explode(count, x, y);
}

/** Impacto del láser: destello + chispas (verde suave, rojo caliente). */
export function laserImpact(scene: Phaser.Scene, x: number, yDraw: number, depth: number, mode: 'green' | 'red'): void {
  const color = mode === 'green' ? 0x9affc0 : 0xffa060;
  oneShotFx(scene, 'fx_impacto', x, yDraw, depth + FX_DEPTH_BIAS, { tint: color, scale: 1, fallbackMs: 180 });
  const glow = scene.add.image(x, yDraw, FB.glow).setDepth(depth + FX_DEPTH_BIAS).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9);
  scene.tweens.add({ targets: glow, alpha: 0, scale: 1.8, duration: 160, onComplete: () => glow.destroy() });
  burst(scene, mode === 'green' ? 'sparkGreen' : 'sparkRed', x, yDraw, depth + FX_DEPTH_BIAS, JUICE.sparks[mode]);
  if (scene.textures.exists('fx_chispa') && mode === 'red') {
    // Chispas con el arte del equipo, además de las de respaldo.
    for (let i = 0; i < 3; i++) {
      const c = scene.add.image(x, yDraw, 'fx_chispa').setDepth(depth + FX_DEPTH_BIAS).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: c,
        x: x + Phaser.Math.Between(-24, 24),
        y: yDraw + Phaser.Math.Between(-18, 10),
        alpha: 0,
        duration: 260,
        onComplete: () => c.destroy(),
      });
    }
  }
}

/** Luz verde de purificación (fx_purificar + brillo + partículas). */
export function purifyFx(scene: Phaser.Scene, x: number, y: number, size = 1): void {
  oneShotFx(scene, 'fx_purificar', x, y - 24 * size, y + FX_DEPTH_BIAS, {
    tint: 0x9affc0,
    scale: size,
    fallbackMs: 900,
    add: !scene.textures.exists('fx_purificar'),
  });
  const glow = scene.add.image(x, y - 20 * size, FB.glow).setDepth(y + FX_DEPTH_BIAS).setTint(0x7dffb0).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6 * size).setAlpha(0);
  scene.tweens.add({
    targets: glow,
    alpha: { from: 0, to: 0.95 },
    scale: 3.2 * size,
    duration: 500,
    yoyo: true,
    hold: 200,
    onComplete: () => glow.destroy(),
  });
  // Columna de luz.
  const col = scene.add.rectangle(x, y, 18 * size, 140 * size, 0xb8ffd8, 0.0).setOrigin(0.5, 1).setDepth(y + FX_DEPTH_BIAS).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: col, fillAlpha: 0.45, scaleX: 0.2, duration: 700, yoyo: true, onComplete: () => col.destroy() });
  burst(scene, 'purify', x, y - 16 * size, y + FX_DEPTH_BIAS, Math.round(18 * size));
}

/** Distancia en el plano del suelo con la elipse de colisión (ry = rx / 2). */
export function planeDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = (ay - by) * 2;
  return Math.sqrt(dx * dx + dy * dy);
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randRange = (r: readonly number[] | number[]) => rand(r[0], r[1] ?? r[0]);
export const hexColor = (s: string) => parseInt(s.replace('#', ''), 16);

/**
 * Parámetro del efecto de un conjuro: primero getSpellDef(id).effect (data/spells.json, dueño: lsm),
 * si no existe, el valor de respaldo de config/combat.ts.
 */
export function spellParam(spellId: string, key: string, fallback: number): number {
  const v = getSpellDef(spellId)?.effect?.[key];
  return typeof v === 'number' ? v : fallback;
}

/** Escala del radio de un conjuro según su fuerza (parcial 0.5..1 → 0.75..1). */
export const powerScale = (power: number) => 0.75 + 0.25 * Math.max(0, Math.min(1, power));

/* ----------------------- Golpes al jugador ----------------------- */

/** Escudo pasivo de PROTECCION (lo activa Combat): reduce el daño que recibe el jugador. */
export const playerShield = { until: 0, reduction: 0, debt: 0 };

/**
 * Todos los golpes de enemigos al jugador pasan por aquí. Con el escudo activo el daño se reduce;
 * como la vida va en segmentos enteros, la fracción se acumula y descuenta al completar 1.
 */
export function hitPlayer(world: WorldApi, hit: Hit): boolean {
  // Escudo U (Nivel 3): puede reducir o absorber por completo el golpe.
  const filtered = shieldFilterHit(world, hit);
  if (!filtered) return false;
  hit = filtered;
  if (performance.now() < playerShield.until && hit.damage > 0) {
    playerShield.debt += hit.damage * (1 - playerShield.reduction);
    const dmg = Math.floor(playerShield.debt + 1e-6);
    playerShield.debt -= dmg;
    return world.player.takeHit({ ...hit, damage: dmg, knockback: hit.knockback * 0.5 });
  }
  return world.player.takeHit(hit);
}

/* ------------------------------- Base -------------------------------- */

let uidCounter = 0;

export abstract class EnemyBase implements EnemyApi {
  x: number;
  y: number;
  z = 0;
  radius: number;
  height: number;
  team: Team = 'enemy';
  abstract kind: EnemyKind;
  group?: string;
  readonly uid = ++uidCounter;

  protected world: WorldApi;
  protected scene: Phaser.Scene;
  protected sprite: Phaser.GameObjects.Sprite;
  protected shadow: Phaser.GameObjects.Image | Phaser.GameObjects.Ellipse;
  protected shadowW: number;
  protected stars: Phaser.GameObjects.Image[] = [];
  protected starsT = 0;
  protected hp: number;
  protected maxHp: number;
  protected stunAcc = 0;
  protected facing: 1 | -1 = -1;
  /** Velocidad de retroceso en x (px/s); decae exponencialmente. */
  protected kbVel = 0;
  protected flashT = 0;
  /** Desplazamiento visual por código cuando no hay animación (respiración / pasos). */
  protected bob = 0;
  protected hasArt = false;
  protected fallbackTex: string;
  protected baseTint = 0xffffff;

  protected _alive = true;
  protected _exhausted = false;
  protected _purified = false;
  protected _ecos: number;
  private destroyed = false;

  /** Arte del kit del equipo (vistas fijas animadas por código), si existe. */
  protected kit: KitAnimator | null = null;
  protected kitTime = 0;

  constructor(world: WorldApi, x: number, y: number, o: { hp: number; radius: number; height: number; ecos: number; feetY: number; frameH: number; fallbackTex: string; textureKey: string; shadowW: number; kitId?: string }) {
    this.world = world;
    this.scene = world.scene;
    this.x = x;
    this.y = y;
    this.hp = this.maxHp = o.hp;
    this.radius = o.radius;
    this.height = o.height;
    this._ecos = o.ecos;
    this.fallbackTex = o.fallbackTex;
    ensureCombatTextures(this.scene);
    this.shadowW = o.shadowW;
    if (this.scene.textures.exists('fx_sombra')) {
      this.shadow = this.scene.add.image(x, y, 'fx_sombra').setAlpha(0.5);
      this.shadow.setScale(o.shadowW / 32, o.shadowW / 32);
    } else {
      this.shadow = this.scene.add.ellipse(x, y, o.shadowW, o.shadowW * 0.32, 0x000000, 0.35);
    }
    this.shadow.setDepth(DEPTH.shadow + y * 0.0001);
    this.sprite = this.scene.add.sprite(x, y, texOr(this.scene, o.textureKey, o.fallbackTex));
    this.sprite.setOrigin(0.5, o.feetY / o.frameH);
    if (o.kitId) {
      this.kit = kitAnimatorFor(this.sprite, o.kitId);
      if (this.kit) this.hasArt = true;
    }
  }

  get alive(): boolean {
    return this._alive;
  }
  get exhausted(): boolean {
    return this._exhausted;
  }
  get purified(): boolean {
    return this._purified;
  }
  get ecos(): number {
    return this._ecos;
  }
  get hpRatio(): number {
    return Math.max(0, this.hp / this.maxHp);
  }

  abstract update(dt: number): void;
  abstract takeHit(hit: Hit): boolean;
  abstract applySpell(ev: SpellOutcomeEvent): boolean;

  protected play(key: string): void {
    if (this.kit) return this.kit.setAnim(key);
    this.hasArt = playOr(this.sprite, key, this.fallbackTex);
  }

  /** Destello blanco + retroceso. */
  protected onDamaged(hit: Hit, knockScale = 1): void {
    this.flashT = JUICE.flashMs / 1000;
    const dir = Math.sign(this.x - hit.sourceX) || -this.facing;
    // knockback = px totales; con decaimiento k = 10 → v0 = px × 10.
    this.kbVel += dir * hit.knockback * knockScale * 10;
  }

  protected stepKnockback(dt: number): void {
    if (Math.abs(this.kbVel) < 1) {
      this.kbVel = 0;
      return;
    }
    this.world.moveActor(this, this.kbVel * dt, 0);
    this.kbVel *= Math.exp(-10 * dt);
  }

  /** Empuja lejos de otros enemigos para no amontonarse. */
  protected separate(dt: number, dist: number): void {
    let px = 0;
    let py = 0;
    for (const o of this.world.enemies) {
      if (o === this || !o.alive || o.purified) continue;
      const dx = this.x - o.x;
      const dy = (this.y - o.y) * 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      const min = Math.max(dist, this.radius + o.radius);
      if (d < min && d > 0.001) {
        const f = (min - d) / min;
        px += (dx / d) * f;
        py += (dy / d) * f * 0.5;
      } else if (d <= 0.001) {
        px += this.uid % 2 ? 1 : -1;
      }
    }
    if (px || py) this.world.moveActor(this, px * 60 * dt, py * 60 * dt);
  }

  protected setStars(on: boolean, color = 0xfff07a): void {
    if (on && this.stars.length === 0) {
      for (let i = 0; i < 3; i++) {
        this.stars.push(this.scene.add.image(this.x, this.y, FB.star).setTint(color).setBlendMode(Phaser.BlendModes.ADD));
      }
    } else if (!on) {
      this.stars.forEach((s) => s.destroy());
      this.stars = [];
    }
  }

  /** Coloca sprite, sombra y estrellitas. Llamar al final de update(). */
  protected render(dt: number): void {
    const sp = this.sprite;
    sp.setPosition(Math.round(this.x), Math.round(this.y - this.z - this.bob));
    sp.setDepth(this.y);
    sp.setFlipX(this.facing < 0);
    if (this.kit) {
      this.kitTime += dt;
      this.kit.apply(this.facing, this.kitTime);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      sp.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      if (this.flashT <= 0) sp.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    }
    const sh = this.shadow;
    sh.setPosition(Math.round(this.x), Math.round(this.y));
    sh.setDepth(DEPTH.shadow + this.y * 0.0001);
    const s = Math.max(0.45, 1 - this.z / 140);
    if (sh instanceof Phaser.GameObjects.Ellipse) sh.setScale(s);
    else sh.setScale((this.shadowW / 32) * s, (this.shadowW / 32) * s);
    if (this.stars.length) {
      this.starsT += dt * 4;
      const top = this.y - this.z - this.height - 4;
      this.stars.forEach((st, i) => {
        const a = this.starsT + (i * Math.PI * 2) / this.stars.length;
        st.setPosition(this.x + Math.cos(a) * this.radius * 1.2, top + Math.sin(a) * 3);
        st.setDepth(this.y + (Math.sin(a) > 0 ? FX_DEPTH_BIAS : -FX_DEPTH_BIAS));
      });
    }
  }

  protected setBaseTint(c: number): void {
    this.baseTint = c;
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(c);
  }

  /** Sale del mundo: quita del mundo, destruye y avisa. */
  protected leaveWorld(): void {
    if (!this._alive) return;
    this._alive = false;
    this._purified = true;
    this.world.remove(this);
    this.destroy();
    bus.emit('enemy:removed', { enemy: this });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this._alive = false;
    this.setStars(false);
    this.onDestroy();
    this.sprite.destroy();
    this.shadow.destroy();
  }

  /** Limpieza extra de subclases. */
  protected onDestroy(): void {}
}
