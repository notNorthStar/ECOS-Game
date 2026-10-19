import Phaser from 'phaser';
import type { Hit, LaserMode, WorldApi } from '../core/contracts';
import { sfx } from '../core/bus';
import { damageMult } from '../core/GameState';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, JUICE, LASER } from '../config/combat';
import { FB, burst, laserImpact } from './EnemyBase';

/**
 * Blanco extra del láser (no enemigo): p. ej. la antena de la Cofradía, que el director registra
 * con `addLaserTarget` (re-exportado desde systems/Combat.ts). onHit devuelve true si absorbe el disparo.
 */
export interface LaserTarget {
  x: number;
  y: number;
  /** Medio ancho en x. */
  radius: number;
  /** Base y alto de la caja de daño. */
  z?: number;
  height: number;
  onHit(mode: LaserMode): boolean;
}

export const laserTargets = new Set<LaserTarget>();

/** Disparo horizontal del láser. Lo actualiza Combat; no es un DepthEntity del mundo. */
export class LaserShot {
  done = false;
  private x: number;
  private readonly y: number;
  /** Altura del disparo sobre el suelo. */
  private readonly h: number;
  private readonly dir: 1 | -1;
  private readonly mode: LaserMode;
  private traveled = 0;
  private sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private trailT = 0;

  constructor(
    private world: WorldApi,
    x: number,
    y: number,
    h: number,
    dir: 1 | -1,
    mode: LaserMode,
  ) {
    this.x = x;
    this.y = y;
    this.h = h;
    this.dir = dir;
    this.mode = mode;
    const scene = world.scene;
    const key = mode === 'green' ? 'fx_laser_verde' : 'fx_laser_rojo';
    const fb = mode === 'green' ? FB.laserGreen : FB.laserRed;
    this.sprite = scene.add.sprite(x, y - h, scene.textures.exists(key) ? key : fb).setFlipX(dir < 0);
    if (scene.anims.exists(key)) this.sprite.play({ key, repeat: -1 });
    this.sprite.setBlendMode(Phaser.BlendModes.ADD);
    const color = mode === 'green' ? LASER.colors.green : LASER.colors.red;
    // Brillo alargado bajo el rayo (el rojo, más intenso y estrecho).
    this.glow = scene.add
      .image(x, y - h, FB.glow)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(mode === 'green' ? 1.6 : 1.4, mode === 'green' ? 0.5 : 0.35)
      .setAlpha(mode === 'green' ? 0.55 : 0.8);
    // Destello de boca.
    const muzzle = scene.add.image(x, y - h, FB.glow).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.7).setDepth(y + FX_DEPTH_BIAS);
    scene.tweens.add({ targets: muzzle, alpha: 0, scale: 1.2, duration: 110, onComplete: () => muzzle.destroy() });
    this.place();
  }

  private place(): void {
    const d = this.y + FX_DEPTH_BIAS;
    this.sprite.setPosition(this.x, this.y - this.h).setDepth(d);
    this.glow.setPosition(this.x, this.y - this.h).setDepth(d - 0.01);
  }

  update(dt: number): void {
    if (this.done) return;
    const step = LASER.speed * dt;
    const x0 = this.x;
    const x1 = this.x + this.dir * step;
    const lead = (LASER.length / 2) * this.dir;
    const a = Math.min(x0 + lead, x1 + lead);
    const b = Math.max(x0 + lead, x1 + lead);

    // Enemigo más cercano en el barrido.
    let best: { dist: number; apply: () => void } | null = null;
    for (const e of this.world.enemies) {
      if (!e.alive || e.purified || e.exhausted) continue;
      if (Math.abs(e.y - this.y) >= DEPTH_TOLERANCE) continue;
      if (this.h < e.z || this.h > e.z + e.height) continue;
      if (e.x + e.radius < a || e.x - e.radius > b) continue;
      const dist = Math.abs(e.x - x0);
      if (!best || dist < best.dist) {
        best = {
          dist,
          apply: () => {
            const hit = this.makeHit();
            if (e.takeHit(hit)) this.impact(e.x - this.dir * e.radius * 0.6, true);
            else this.impact(e.x - this.dir * e.radius, false);
          },
        };
      }
    }
    for (const t of laserTargets) {
      if (Math.abs(t.y - this.y) >= DEPTH_TOLERANCE * 1.5) continue;
      const tz = t.z ?? 0;
      if (this.h < tz || this.h > tz + t.height) continue;
      if (t.x + t.radius < a || t.x - t.radius > b) continue;
      const dist = Math.abs(t.x - x0);
      if (!best || dist < best.dist) {
        best = {
          dist,
          apply: () => {
            if (t.onHit(this.mode)) this.impact(t.x - this.dir * t.radius, true);
            else this.impact(t.x - this.dir * t.radius, false);
          },
        };
      }
    }
    if (best) {
      best.apply();
      return;
    }

    this.x = x1;
    this.traveled += step;
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = this.mode === 'green' ? 0.03 : 0.05;
      burst(this.world.scene, this.mode === 'green' ? 'sparkGreen' : 'sparkRed', this.x - lead, this.y - this.h, this.y + FX_DEPTH_BIAS, 1);
    }
    this.place();
    if (this.traveled >= LASER.range || this.x < -40 || this.x > this.world.level.width + 40) {
      this.fadeOut();
    }
  }

  private makeHit(): Hit {
    if (this.mode === 'green') {
      return { damage: LASER.green.damage, stun: LASER.green.stun, kind: 'laser-green', sourceX: this.x - this.dir * 40, knockback: LASER.green.knockback };
    }
    return {
      damage: LASER.red.damage * damageMult(),
      stun: LASER.red.stun,
      kind: 'laser-red',
      sourceX: this.x - this.dir * 40,
      knockback: LASER.red.knockback,
    };
  }

  private impact(x: number, connected: boolean): void {
    const scene = this.world.scene;
    laserImpact(scene, x, this.y - this.h, this.y, this.mode);
    if (connected) {
      sfx('impacto');
      this.world.hitstop(JUICE.hitstopMs[this.mode]);
      const s = JUICE.shake[this.mode];
      this.world.shake(s.intensity, s.ms);
    }
    this.destroy();
  }

  private fadeOut(): void {
    const scene = this.world.scene;
    const objs = [this.sprite, this.glow];
    this.done = true;
    scene.tweens.add({ targets: objs, alpha: 0, duration: 80, onComplete: () => objs.forEach((o) => o.destroy()) });
  }

  destroy(): void {
    this.done = true;
    this.sprite.destroy();
    this.glow.destroy();
  }
}
