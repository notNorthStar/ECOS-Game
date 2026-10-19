import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { FX_DEPTH_BIAS, ORBS } from '../config/combat';
import { FB, burst } from './EnemyBase';

/**
 * Eco en vuelo (GDD §5.1): partícula de luz que se dispersa y luego vuela sola al jugador.
 * Lo maneja systems/Progression.ts; al tocar al jugador acredita `value` Ecos.
 */
export class EcoOrb {
  done = false;
  private x: number;
  private y: number; // suelo
  private z: number;
  private vx: number;
  private vy: number;
  private vz: number;
  private t = 0;
  private sprite: Phaser.GameObjects.Sprite;
  private halo: Phaser.GameObjects.Image;
  private trailT = 0;

  constructor(
    private world: WorldApi,
    x: number,
    yDraw: number,
    readonly value: number,
  ) {
    // Se recibe y de dibujo (y − z); se asume altura inicial de 18 px sobre el suelo.
    this.z = 18;
    this.x = x;
    this.y = yDraw + this.z;
    const a = Math.random() * Math.PI * 2;
    const sp = ORBS.burstSpeed * (0.5 + Math.random() * 0.5);
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp * 0.4;
    this.vz = 60 + Math.random() * 80;
    const scene = world.scene;
    const hasTex = scene.textures.exists('fx_eco');
    this.sprite = scene.add.sprite(x, yDraw, hasTex ? 'fx_eco' : FB.eco).setBlendMode(Phaser.BlendModes.ADD);
    if (scene.anims.exists('fx_eco')) this.sprite.play({ key: 'fx_eco', repeat: -1 });
    this.halo = scene.add.image(x, yDraw, FB.glow).setTint(ORBS.color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35).setAlpha(0.7);
  }

  /** Devuelve true en el cuadro en que se recoge. */
  update(dt: number): boolean {
    if (this.done) return false;
    const p = this.world.player;
    this.t += dt;
    if (this.t < ORBS.scatterTime) {
      // Dispersión con un pequeño salto.
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vz -= 400 * dt;
      this.z = Math.max(6, this.z + this.vz * dt);
      this.vx *= 0.92;
      this.vy *= 0.92;
    } else {
      // Busca el pecho del jugador con aceleración creciente.
      const tx = p.x;
      const ty = p.y;
      const tz = p.z + ORBS.pickupHeight;
      const dx = tx - this.x;
      const dy = ty - this.y;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const acc = ORBS.homingAccel * (1 + this.t);
      this.vx += (dx / d) * acc * dt;
      this.vy += (dy / d) * acc * dt;
      this.vz += (dz / d) * acc * dt;
      // Amortigua lo que no apunta al jugador para que no orbite.
      this.vx *= 0.94;
      this.vy *= 0.94;
      this.vz *= 0.94;
      const sp = Math.hypot(this.vx, this.vy, this.vz);
      if (sp > ORBS.maxSpeed) {
        const k = ORBS.maxSpeed / sp;
        this.vx *= k;
        this.vy *= k;
        this.vz *= k;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      if (d < ORBS.pickupRadius || this.t > ORBS.maxLife) {
        this.collect();
        return true;
      }
    }
    const yd = this.y - this.z;
    const depth = this.y + FX_DEPTH_BIAS;
    this.sprite.setPosition(this.x, yd).setDepth(depth);
    this.halo.setPosition(this.x, yd).setDepth(depth - 0.01).setScale(0.3 + 0.08 * Math.sin(this.t * 18));
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.04;
      burst(this.world.scene, 'eco', this.x, yd, depth, 1);
    }
    return false;
  }

  private collect(): void {
    burst(this.world.scene, 'eco', this.x, this.y - this.z, this.y + FX_DEPTH_BIAS, 4);
    this.destroy();
  }

  destroy(): void {
    this.done = true;
    this.sprite.destroy();
    this.halo.destroy();
  }
}
