import Phaser from 'phaser';
import type { CofradiaRank, EnemyApi, EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { isShieldActive } from '../systems/Shield';
import { FUENTE } from '../ui/fuente';
import {
  EnemyBase, FB, burst, hexColor, hitPlayer, inLuzRadius, inMemoriaRadius, inSolLine, lunaVisible, planeDist, powerScale, rand, randRange,
  smokeFx, solDamage, solKnockback, spellParam, inVerdadRadius, inFuegoLine, verdadStun, fuegoDamage, fuegoKnockback, burnFx,
} from './EnemyBase';

/**
 * Encapuchado de la Cofradía del Espejo Negro (GDD §9, NIVELES §4 Nivel 3). Humanoide 64×80, pivote (32, 78).
 * El MISMO modelo sirve para los tres rangos (rojo / negro / élite): recolor y números en enemies.json → ranks.
 * - Patrulla con cono de visión: si no te ve puedes pasar o sorprenderlo (daño × surpriseMult).
 *   "?" mientras sospecha; "!" al descubrirte (avisa a los cercanos).
 * - En combate: guarda distancia, se cubre tras obstáculos y cambia de carril de profundidad.
 *   Ataques anunciados: golpe con báculo (cerca) y proyectil de energía oscura (el escudo U lo devuelve).
 * - No se purifica: al llegar a 0 queda INCONSCIENTE (cae, humo, se desvanece). Sin sangre.
 * Afinidades (contratos §5): LUZ aturde · SOL daño fuerte · VOZ aturde · CALMA ✖ · PROTECCION empuja · láser rojo daña.
 */

const E = enemiesData.encapuchado;
const BOLT = E.bolt;

type St = 'patrol' | 'alert' | 'combat' | 'staffWindup' | 'staffActive' | 'boltWindup' | 'recover' | 'hurt' | 'dizzy' | 'down';

/** Aviso de CALMA una sola vez por partida. */
let toldCalma = false;
let toldMemoria = false;

const texKey = (rank: CofradiaRank) => `__cb_encapuchado_${rank}`;

/** Placeholder simple (AGENTS §8.0): túnica y capucha del color del rango, ojos que brillan, báculo. Mira a la derecha. */
function ensureEncapuchadoTexture(scene: Phaser.Scene, rank: CofradiaRank): string {
  const key = texKey(rank);
  if (scene.textures.exists(key)) return key;
  const r = E.ranks[rank];
  const robe = hexColor(r.robe);
  const dark = hexColor(r.dark);
  const trim = hexColor(r.trim);
  const eyes = hexColor(r.eyes);
  const g = scene.make.graphics({}, false);
  // Báculo (detrás).
  g.fillStyle(0x5a3a22, 1).fillRect(45, 18, 3, 60);
  g.fillStyle(0x7a40c0, 1).fillCircle(46, 16, 4);
  g.fillStyle(0xd0a0ff, 1).fillRect(45, 14, 2, 2);
  // Túnica.
  g.fillStyle(dark, 1).fillTriangle(22, 40, 22, 78, 13, 78).fillTriangle(42, 40, 42, 78, 51, 78);
  g.fillStyle(robe, 1).fillRect(22, 32, 20, 46);
  g.fillStyle(dark, 1).fillRect(31, 50, 2, 28);
  g.fillStyle(trim, 1).fillRect(22, 48, 20, 3).fillRect(14, 76, 37, 2);
  // Brazo con manga.
  g.fillStyle(robe, 1).fillRect(38, 36, 8, 14);
  g.fillStyle(dark, 1).fillRect(42, 46, 5, 4);
  // Capucha puntiaguda.
  g.fillStyle(robe, 1).fillCircle(32, 24, 11).fillTriangle(21, 24, 43, 24, 30, 5);
  g.fillStyle(trim, 1).fillRect(22, 32, 20, 2);
  // Rostro en sombra y ojos.
  g.fillStyle(0x0c0608, 1).fillEllipse(35, 25, 13, 11);
  g.fillStyle(eyes, 1).fillRect(33, 24, 2, 2).fillRect(38, 24, 2, 2);
  g.generateTexture(key, E.frame.w, E.frame.h);
  g.destroy();
  return key;
}

/* ============================ Proyectil oscuro ============================ */

/** Proyectiles vivos (por si otro sistema, p. ej. el escudo, quiere devolverlos con reflect()). */
export const activeBolts = new Set<EnergyBolt>();

/**
 * Proyectil de energía oscura. Viaja en el plano del suelo a altura fija (saltar lo esquiva).
 * Si llega al jugador con el escudo U levantado, el escudo absorbe el golpe y el proyectil REBOTA
 * hacia el que lo lanzó (dañando enemigos). Se actualiza solo con el 'update' de la escena.
 */
export class EnergyBolt {
  x: number;
  y: number;
  readonly h: number;
  private vx: number;
  private vy: number;
  private traveled = 0;
  private reflected = false;
  done = false;
  private core: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private trailT = 0;
  private readonly onUpdate: (t: number, ms: number) => void;
  private readonly onShutdown = () => this.destroy();

  constructor(private world: WorldApi, x: number, y: number, tx: number, ty: number, private owner: EnemyApi | null, private damage: number) {
    this.x = x;
    this.y = y;
    this.h = BOLT.height;
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    this.vx = (dx / d) * BOLT.speed;
    this.vy = (dy / d) * BOLT.speed;
    const scene = world.scene;
    const color = hexColor(BOLT.color);
    this.glow = scene.add.image(x, y - this.h, FB.glow).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9);
    this.core = scene.add.image(x, y - this.h, FB.glow).setTint(0xf0d0ff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35);
    this.shadow = scene.add.ellipse(x, y, 10, 4, 0x000000, 0.3);
    this.onUpdate = (_t, ms) => this.update(Math.min(0.05, ms / 1000) * this.world.timeScale);
    scene.events.on('update', this.onUpdate);
    scene.events.once('shutdown', this.onShutdown);
    activeBolts.add(this);
    this.place();
  }

  get isReflected(): boolean {
    return this.reflected;
  }

  private place(): void {
    const d = this.y + FX_DEPTH_BIAS;
    const pulse = 1 + 0.15 * Math.sin(this.traveled * 0.2);
    this.glow.setPosition(this.x, this.y - this.h).setDepth(d).setScale(0.9 * pulse);
    this.core.setPosition(this.x, this.y - this.h).setDepth(d + 0.01);
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1);
  }

  /** Devuelve el proyectil hacia quien lo lanzó (o en sentido contrario). Ahora daña enemigos. */
  reflect(): void {
    if (this.done || this.reflected) return;
    this.reflected = true;
    this.traveled = 0;
    const speed = BOLT.speed * BOLT.reflectSpeedMult;
    const o = this.owner;
    if (o && o.alive && !o.purified) {
      const dx = o.x - this.x;
      const dy = o.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * speed;
      this.vy = (dy / d) * speed;
    } else {
      this.vx = -Math.sign(this.vx || 1) * speed;
      this.vy = 0;
    }
    const c = hexColor(BOLT.reflectColor);
    this.glow.setTint(c);
    this.core.setTint(0xffffff);
    burst(this.world.scene, 'light', this.x, this.y - this.h, this.y + FX_DEPTH_BIAS, 8);
    sfx('proyectil_reflejo');
  }

  private update(dt: number): void {
    if (this.done) return;
    const step = Math.hypot(this.vx, this.vy) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.traveled += step;
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.04;
      burst(this.world.scene, this.reflected ? 'light' : 'dark', this.x, this.y - this.h, this.y + FX_DEPTH_BIAS, 1);
    }
    this.place();

    if (!this.reflected) {
      const p = this.world.player;
      if (planeDist(this.x, this.y, p.x, p.y) < BOLT.hitRadius + p.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z <= this.h && !p.isDodging) {
        const shielded = isShieldActive();
        hitPlayer(this.world, { damage: this.damage, stun: 0, kind: 'projectile', sourceX: this.x - Math.sign(this.vx) * 10, knockback: BOLT.knockback });
        if (shielded) this.reflect();
        else return this.pop();
      }
    } else {
      for (const e of this.world.enemies) {
        if (!e.alive || e.purified || e.exhausted || !lunaVisible(e)) continue;
        if (Math.abs(e.y - this.y) >= DEPTH_TOLERANCE * 1.5) continue;
        if (Math.abs(e.x - this.x) > e.radius + BOLT.hitRadius) continue;
        if (this.h < e.z || this.h > e.z + e.height) continue;
        e.takeHit({ damage: BOLT.reflectDamage, stun: BOLT.reflectStun, kind: 'projectile', sourceX: this.x - Math.sign(this.vx) * 10, knockback: BOLT.reflectKnockback });
        this.world.hitstop(40);
        return this.pop();
      }
    }
    if (this.traveled > BOLT.range || this.x < -40 || this.x > this.world.level.width + 40) this.fade();
  }

  private pop(): void {
    burst(this.world.scene, this.reflected ? 'light' : 'dark', this.x, this.y - this.h, this.y + FX_DEPTH_BIAS, 10);
    this.destroy();
  }

  private fade(): void {
    if (this.done) return;
    this.done = true;
    this.world.scene.events.off('update', this.onUpdate);
    this.world.scene.events.off('shutdown', this.onShutdown);
    activeBolts.delete(this);
    const objs = [this.glow, this.core, this.shadow];
    this.world.scene.tweens.add({ targets: objs, alpha: 0, duration: 120, onComplete: () => objs.forEach((o) => o.destroy()) });
  }

  destroy(): void {
    if (this.done && !this.glow.scene) return;
    this.done = true;
    activeBolts.delete(this);
    this.world.scene.events.off('update', this.onUpdate);
    this.world.scene.events.off('shutdown', this.onShutdown);
    this.glow.destroy();
    this.core.destroy();
    this.shadow.destroy();
  }
}

/* =============================== Encapuchado =============================== */

export class Encapuchado extends EnemyBase {
  kind: EnemyKind = 'encapuchado';
  readonly rank: CofradiaRank;
  private R: (typeof E.ranks)[CofradiaRank];
  private st: St = 'patrol';
  private stT = 0;
  private aware = false;
  private suspicion = 0;
  private homeX: number;
  private homeY: number;
  private patrolDir: 1 | -1;
  private pauseT = 0;
  private cooldown = rand(0.6, 1.4);
  private repositionT = 0;
  private target: { x: number; y: number } | null = null;
  private coverHoldT = 0;
  private lostT = 0;
  private hitDone = false;
  private boltAim = { x: 0, y: 0 };
  private icon: Phaser.GameObjects.Text | null = null;
  private iconChar = '';
  private cone: Phaser.GameObjects.Graphics | null = null;
  private orb: Phaser.GameObjects.Image | null = null;
  private walkPhase = Math.random() * 10;
  /** Brillo rojo de los ojos (solo élite). */
  private eyeGlow: Phaser.GameObjects.Image | null = null;

  constructor(world: WorldApi, x: number, y: number, rank: CofradiaRank = 'rojo', group?: string) {
    const R = E.ranks[rank];
    const scene = world.scene;
    super(world, x, y, {
      hp: R.hp,
      radius: E.radius,
      height: E.height,
      ecos: R.ecos,
      feetY: E.frame.feetY,
      frameH: E.frame.h,
      fallbackTex: ensureEncapuchadoTexture(scene, rank),
      textureKey: `encapuchado_${rank}_reposo`,
      shadowW: 24,
      kitId: 'encapuchado',
    });
    this.rank = rank;
    // Arte de Codex: una variante por rango (rojo / negro / elite).
    this.kit?.setVariant(rank);
    this.R = R;
    this.group = group;
    this.homeX = x;
    this.homeY = y;
    this.patrolDir = this.uid % 2 ? 1 : -1;
    this.facing = this.patrolDir;
    // Con el kit del equipo (un solo modelo) el rango se distingue con tinte (ranks.<rango>.kitTint).
    // Si el kit ya trae la variante del rango (arte de Codex), no se tiñe encima.
    if (this.kit && rank !== 'rojo' && !this.kit.kit.variants?.includes(rank)) this.setBaseTint(hexColor(R.kitTint));
    // Élite (Nivel 7): ojos rojos que brillan, con o sin kit (Negro con detalles rojos).
    if (R.eyeGlow > 0) {
      this.eyeGlow = this.scene.add.image(x, y, FB.glow).setTint(hexColor(R.trim)).setBlendMode(Phaser.BlendModes.ADD).setScale(0.32, 0.2).setAlpha(R.eyeGlow);
    }
    // Los de un grupo de arena aparecen ya alertas.
    if (group) this.becomeAware(false);
    if (E.vision.showCone && !group) this.cone = this.scene.add.graphics();
    this.play('encapuchado_reposo');
    this.render(0);
  }

  /** ¿Ya descubrió al jugador? (para el director: infiltración). */
  get isAware(): boolean {
    return this.aware;
  }

  get isAttacking(): boolean {
    return this.st === 'staffWindup' || this.st === 'staffActive' || this.st === 'boltWindup';
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (st !== 'boltWindup') this.clearOrb();
    if (st !== 'staffWindup' && st !== 'boltWindup' && this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      patrol: 'encapuchado_caminar',
      alert: 'encapuchado_reposo',
      combat: 'encapuchado_caminar',
      staffWindup: 'encapuchado_ataque',
      staffActive: 'encapuchado_ataque',
      boltWindup: 'encapuchado_conjuro',
      recover: 'encapuchado_reposo',
      hurt: 'encapuchado_dano',
      dizzy: 'encapuchado_aturdido',
      down: 'encapuchado_morir',
    };
    this.play(anim[st]);
  }

  private get dmgMult(): number {
    return this.R.damageMult;
  }

  private moveToward(tx: number, ty: number, speed: number, dt: number): number {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return d;
    const step = Math.min(d, speed * dt);
    this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.8);
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
    return d;
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private attackersNow(): number {
    let n = 0;
    for (const e of this.world.enemies) if (e instanceof Encapuchado && e !== this && e.isAttacking) n++;
    return n;
  }

  /* ------------------------------ Detección ------------------------------ */

  /** 0 = no lo ve; >0 = velocidad relativa con la que lo nota (más cerca, más rápido). */
  private seeRate(): number {
    const p = this.world.player;
    const V = E.vision;
    const d = planeDist(this.x, this.y, p.x, p.y);
    if (d < V.closeRadius) return 2;
    const dx = p.x - this.x;
    if (dx * this.facing <= 0 || Math.abs(dx) > V.range) return 0;
    const ang = Phaser.Math.RadToDeg(Math.atan2(Math.abs(p.y - this.y) * 2, Math.abs(dx)));
    if (ang > V.halfAngleDeg) return 0;
    return 1 + (1 - Math.abs(dx) / V.range);
  }

  /** Descubre al jugador: "!" y avisa a los encapuchados cercanos. */
  becomeAware(propagate = true): void {
    if (this.aware || this.st === 'down') return;
    this.aware = true;
    this.suspicion = 1;
    this.cone?.destroy();
    this.cone = null;
    this.setIcon('!');
    this.facePlayer();
    if (this.st === 'patrol') this.set('alert');
    if (propagate) {
      sfx('encapuchado_alerta');
      for (const e of this.world.enemies) {
        if (!(e instanceof Encapuchado) || e === this || e.aware || !e.alive) continue;
        if (planeDist(this.x, this.y, e.x, e.y) > E.vision.alertRadius) continue;
        this.scene.time.delayedCall(rand(150, 400), () => e.becomeAware(false));
      }
    }
  }

  private setIcon(ch: '' | '?' | '!'): void {
    if (ch === this.iconChar) return;
    this.iconChar = ch;
    this.icon?.destroy();
    this.icon = null;
    if (!ch) return;
    const color = ch === '!' ? '#ff6050' : '#ffe070';
    this.icon = this.scene.add.text(this.x, this.y, ch, { fontFamily: FUENTE, fontSize: '13px', color, stroke: '#200808', strokeThickness: 3 }).setOrigin(0.5, 1);
    this.scene.tweens.add({ targets: this.icon, scale: { from: 1.7, to: 1 }, duration: 160 });
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive || this.st === 'down') return;
    const p = this.world.player;
    this.stT += dt;
    this.cooldown -= dt;
    if (this.stunAcc > 0 && this.st !== 'dizzy') this.stunAcc = Math.max(0, this.stunAcc - E.stunDecay * dt);
    this.stepKnockback(dt);

    switch (this.st) {
      case 'patrol':
        this.updatePatrol(dt);
        break;
      case 'alert':
        this.facePlayer();
        if (this.stT >= E.alertSeconds) {
          this.repositionT = 0;
          this.set('combat');
        }
        break;
      case 'combat':
        this.updateCombat(dt);
        break;
      case 'staffWindup': {
        this.facePlayer();
        this.telegraph(0x802020);
        if (this.stT >= E.staff.windup) {
          sfx('encapuchado_golpe');
          this.set('staffActive');
        }
        break;
      }
      case 'staffActive':
        this.world.moveActor(this, this.facing * 90 * dt, 0);
        if (!this.hitDone) {
          this.hitDone = true;
          if (Math.abs(p.x - this.x) < E.staff.range + 8 && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < E.staff.dodgeHeight) {
            hitPlayer(this.world, { damage: E.staff.damage * this.dmgMult, stun: 0, kind: 'melee', sourceX: this.x, knockback: E.staff.knockback });
          }
          burst(this.scene, 'dark', this.x + this.facing * 26, this.y - 30, this.y + FX_DEPTH_BIAS, 6);
        }
        if (this.stT >= E.staff.active) this.toRecover(E.staff.recover);
        break;
      case 'boltWindup': {
        this.facePlayer();
        this.telegraph(0x401060);
        this.updateOrb();
        if (this.stT >= BOLT.windup) {
          this.fireBolt();
          this.toRecover(BOLT.recover);
        }
        break;
      }
      case 'recover':
        if (this.stT >= 0) {
          this.cooldown = randRange(E.attackCooldown) * this.R.cooldownMult;
          this.set('combat');
        }
        break;
      case 'hurt':
        if (this.stT >= E.hurtSeconds) this.set('combat');
        break;
      case 'dizzy':
        if (this.stT >= E.dizzySeconds) {
          this.setStars(false);
          this.stunAcc = 0;
          this.set('combat');
        }
        break;
    }

    if (this.st !== 'staffActive') this.separate(dt, E.separation);
    if (!this.hasArt && (this.st === 'patrol' || this.st === 'combat') && this.isMoving) {
      this.walkPhase += dt * 10;
      this.bob = Math.abs(Math.sin(this.walkPhase)) * 1.5;
    } else if (!this.hasArt) this.bob = 0;

    this.render(dt);
    this.icon?.setPosition(this.x, this.y - this.z - this.height - 6).setDepth(this.y + FX_DEPTH_BIAS);
    if (this.icon && this.iconChar === '!' && this.st !== 'alert' && this.stT > 1.2) this.setIcon('');
    this.drawCone();
    if (this.eyeGlow) {
      const pulse = 0.75 + 0.25 * Math.sin(this.scene.time.now / 160 + this.uid);
      this.eyeGlow
        .setPosition(this.x + this.facing * 4, this.y - this.z - this.bob - 54)
        .setDepth(this.y + FX_DEPTH_BIAS)
        .setAlpha(this.R.eyeGlow * pulse * this.sprite.alpha);
    }
  }

  private isMoving = false;

  private toRecover(seconds: number): void {
    this.set('recover');
    this.stT = -seconds;
  }

  private telegraph(color: number): void {
    // Aviso visible: brillo en el pecho y anillo en el suelo (EnemyBase.warnFx).
    this.warnFx(color);
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 14) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  private updatePatrol(dt: number): void {
    const P = E.patrol;
    const rate = this.seeRate();
    if (rate > 0) {
      this.suspicion += (dt / E.vision.noticeSeconds) * rate;
      this.setIcon('?');
      // Se detiene y mira hacia lo que vio.
      this.facePlayer();
      this.isMoving = false;
      if (this.suspicion >= 1) this.becomeAware();
      return;
    }
    this.suspicion = Math.max(0, this.suspicion - E.vision.forgetRate * dt);
    if (this.suspicion <= 0) this.setIcon('');
    if (this.pauseT > 0) {
      this.pauseT -= dt;
      this.isMoving = false;
      return;
    }
    const tx = this.homeX + this.patrolDir * P.range;
    const d = this.moveToward(tx, this.homeY, E.walkSpeed * this.R.speedMult, dt);
    this.isMoving = true;
    if (d < 3) {
      this.patrolDir = this.patrolDir === 1 ? -1 : 1;
      this.pauseT = randRange(P.pause);
      // Mira hacia el siguiente tramo durante la pausa: el jugador puede aprovechar su espalda.
      this.scene.time.delayedCall(this.pauseT * 500, () => {
        if (this.st === 'patrol') this.facing = this.patrolDir;
      });
    }
  }

  private updateCombat(dt: number): void {
    const p = this.world.player;
    const dxp = p.x - this.x;
    const dyp = p.y - this.y;
    const dist = planeDist(this.x, this.y, p.x, p.y);
    const [keepMin, keepMax] = E.keepDistance;

    // Lo pierde de vista si se aleja mucho tiempo: vuelve a patrullar desde aquí.
    if (dist > E.loseDistance) {
      this.lostT += dt;
      if (this.lostT > E.loseSeconds) {
        this.aware = false;
        this.suspicion = 0;
        this.homeX = this.x;
        this.homeY = this.y;
        this.lostT = 0;
        this.setIcon('?');
        if (E.vision.showCone && !this.cone) this.cone = this.scene.add.graphics();
        this.set('patrol');
        return;
      }
    } else this.lostT = 0;

    const ready = this.cooldown <= 0 && this.attackersNow() < E.maxAttackers;
    // Cerca y en el mismo carril: báculo.
    if (ready && Math.abs(dxp) < E.staff.range && Math.abs(dyp) < DEPTH_TOLERANCE * 0.8) {
      this.set('staffWindup');
      return;
    }
    // A media distancia: proyectil (apunta a donde está el jugador al lanzarlo).
    if (ready && dist > keepMin * 0.6 && dist < BOLT.range * 0.75 && this.coverHoldT <= 0) {
      this.boltAim = { x: p.x, y: p.y };
      sfx('encapuchado_conjuro');
      this.set('boltWindup');
      return;
    }

    // Reposición: cobertura o carril de profundidad distinto al del jugador.
    this.repositionT -= dt;
    if (this.coverHoldT > 0) this.coverHoldT -= dt;
    if (!this.target || this.repositionT <= 0) {
      this.repositionT = randRange(E.reposition.every);
      const cover = Math.random() < E.reposition.coverChance ? this.findCover() : null;
      if (cover) {
        this.target = cover;
        this.coverHoldT = randRange(E.reposition.coverHold);
      } else {
        const side = Math.sign(this.x - p.x) || (this.uid % 2 ? 1 : -1);
        const lanes = [-E.reposition.depthOffset, 0, E.reposition.depthOffset];
        const off = lanes[Math.floor(Math.random() * lanes.length)];
        const want = rand(keepMin, keepMax);
        this.target = this.world.randomPointNear(p.x + side * want, p.y + off, 10);
      }
    }
    // Demasiado cerca y sin poder atacar: retrocede.
    if (dist < keepMin * 0.7 && !ready) {
      const away = Math.sign(this.x - p.x) || 1;
      this.target = { x: this.x + away * 40, y: this.y };
    }
    const d = this.moveToward(this.target.x, this.target.y, E.combatSpeed * this.R.speedMult, dt);
    this.isMoving = d > 3;
    if (!this.isMoving) this.facePlayer();
  }

  /** Busca un punto detrás de un obstáculo, del lado contrario al jugador. */
  private findCover(): { x: number; y: number } | null {
    const p = this.world.player;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const ob of this.world.level.obstacles) {
      const ox = ob.shape === 'ellipse' ? ob.x : ob.x + ob.w / 2;
      const oy = ob.shape === 'ellipse' ? ob.y : ob.y + ob.h / 2;
      const halfW = ob.shape === 'ellipse' ? ob.rx : ob.w / 2;
      if (planeDist(this.x, this.y, ox, oy) > E.reposition.coverSearch) continue;
      const side = Math.sign(ox - p.x) || 1;
      const cx = ox + side * (halfW + this.radius + 6);
      const cy = oy;
      if (Math.abs(cx - p.x) < E.keepDistance[0]) continue;
      if (!this.world.isWalkable(cx, cy, this.radius)) continue;
      const d = planeDist(this.x, this.y, cx, cy);
      if (d < bestD) {
        bestD = d;
        best = { x: cx, y: cy };
      }
    }
    return best;
  }

  private updateOrb(): void {
    const ox = this.x + this.facing * 14;
    const oy = this.y - this.z - 64;
    if (!this.orb) {
      this.orb = this.scene.add.image(ox, oy, FB.glow).setTint(hexColor(BOLT.color)).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2);
    }
    const k = Math.min(1, this.stT / BOLT.windup);
    this.orb.setPosition(ox, oy).setDepth(this.y + FX_DEPTH_BIAS).setScale(0.2 + 0.6 * k).setAlpha(0.6 + 0.4 * Math.sin(this.stT * 30));
  }

  private clearOrb(): void {
    this.orb?.destroy();
    this.orb = null;
  }

  private fireBolt(): void {
    const sx = this.x + this.facing * 16;
    new EnergyBolt(this.world, sx, this.y, this.boltAim.x, this.boltAim.y, this, BOLT.damage * this.dmgMult);
    sfx('proyectil_oscuro');
  }

  private drawCone(): void {
    const g = this.cone;
    if (!g) return;
    g.clear();
    if (this.st !== 'patrol') return;
    const V = E.vision;
    const a = Phaser.Math.DegToRad(V.halfAngleDeg);
    const ex = this.x + this.facing * V.range;
    const spread = Math.tan(a) * V.range * 0.5; // ry = rx / 2 en el plano
    const alpha = V.coneAlpha * (1 + this.suspicion * 2);
    g.fillStyle(this.suspicion > 0 ? 0xffd060 : 0xfff0c0, alpha);
    g.fillTriangle(this.x, this.y, ex, this.y - spread, ex, this.y + spread);
    g.setDepth(this.y - 2);
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'down') return false;
    const surprise = !this.aware;
    const mult = surprise ? E.surpriseMult : 1;
    if (surprise) {
      burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 6);
      bus.emit('hud:toast', { text: '¡Sorpresa! Daño doble', ms: 1200 });
    }
    this.becomeAware();
    this.hp -= hit.damage * mult;
    this.stunAcc += hit.stun * mult;
    this.onDamaged(hit, E.knockbackScale);
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (this.hp <= 0) {
      this.knockOut();
    } else if (this.stunAcc >= E.stunThreshold && this.st !== 'dizzy') {
      this.clearOrb();
      this.set('dizzy');
      this.setStars(true);
      burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 6);
    } else if (hit.damage * mult >= 1 && this.st !== 'dizzy' && this.st !== 'staffActive') {
      this.set('hurt');
    }
    return true;
  }

  /** INCONSCIENTE: cae, humo y se desvanece. Ecos base (no se purifica). */
  private knockOut(): void {
    this.hp = 0;
    this._exhausted = true;
    this.setStars(false);
    this.setIcon('');
    this.clearOrb();
    this.cone?.destroy();
    this.cone = null;
    this.set('down');
    this.eyeGlow?.destroy();
    this.eyeGlow = null;
    this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    sfx('encapuchado_cae');
    bus.emit('ecos:gained', { amount: this._ecos, x: this.x, y: this.y - 30 });
    bus.emit('cofradia:down', { enemy: this });
    const dir = this.facing;
    // Cae de espaldas (gira sobre los pies) y se hunde en humo.
    this.scene.tweens.add({ targets: this.sprite, angle: -dir * 80, y: this.sprite.y + 4, duration: 380, ease: 'Quad.easeIn' });
    this.scene.time.delayedCall(320, () => {
      if (!this._alive) return;
      smokeFx(this.scene, this.x, this.y, 1);
      this.world.shake(0.002, 80);
    });
    this.scene.time.delayedCall(E.downSeconds * 500, () => {
      if (this._alive) smokeFx(this.scene, this.x, this.y, 1.3);
    });
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      alpha: 0,
      delay: E.downSeconds * 450,
      duration: E.downSeconds * 550,
      onComplete: () => this.leaveWorld(),
    });
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'down' || ev.outcome === 'fail') return false;
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    switch (ev.spellId) {
      case 'CALMA': {
        // No es un ser del folclor: CALMA no le hace nada.
        const r = spellParam('CALMA', 'calmRadius', SPELLS_FX.CALMA.calmRadius) * powerScale(power);
        if (!toldCalma && planeDist(this.x, this.y, ev.x, ev.y) < r * 1.5) {
          toldCalma = true;
          bus.emit('hud:toast', { text: 'La Cofradía no es un ser del folclor: usa el láser rojo o SOL', ms: 3200 });
        }
        return false;
      }
      case 'MEMORIA': {
        // Nivel 4: ➖ (no es un ser del folclor; su memoria no está rota, está vendida).
        if (!toldMemoria && inMemoriaRadius(ev, this.x, this.y, 'stunRadius')) {
          toldMemoria = true;
          bus.emit('hud:toast', { text: 'MEMORIA no afecta a la Cofradía: usa SOL o el láser rojo', ms: 3000 });
        }
        return false;
      }
      case 'SOL':
        if (!inSolLine(ev, this.x, this.y, this.radius)) return false;
        return this.takeHit({ damage: solDamage(ev) * this.R.solMult, stun: 0, kind: 'spell', sourceX: ev.x, knockback: solKnockback(ev) });
      case 'LUZ':
        if (!inLuzRadius(ev, this.x, this.y)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('LUZ', 'stun', SPELLS_FX.LUZ.stun) * power, kind: 'spell', sourceX: ev.x, knockback: 6 });
      case 'VOZ': {
        const s = SPELLS_FX.VOZ;
        if (planeDist(this.x, this.y, ev.x, ev.y) > spellParam('VOZ', 'stunRadius', s.stunRadius) * powerScale(power)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('VOZ', 'stun', s.stun) * power, kind: 'spell', sourceX: ev.x, knockback: spellParam('VOZ', 'knockback', s.knockback) * power });
      }
      case 'PROTECCION': {
        const s = SPELLS_FX.PROTECCION;
        if (planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y) > s.pushRadius) return false;
        return this.takeHit({ damage: 0, stun: s.stun * power, kind: 'spell', sourceX: ev.x, knockback: s.knockback * power });
      }
      // Nivel 6. VERDAD: aturde (rompe su máscara de seguridad). FUEGO: inconsciente (daño fuerte, como SOL). DESCANSO: ➖.
      case 'VERDAD':
        if (!inVerdadRadius(ev, this.x, this.y)) return false;
        return this.takeHit({ damage: 0, stun: verdadStun(ev), kind: 'spell', sourceX: ev.x, knockback: 6 });
      case 'FUEGO':
        if (!inFuegoLine(ev, this.x, this.y, this.radius)) return false;
        burnFx(this.scene, this);
        return this.takeHit({ damage: fuegoDamage(ev) * this.R.solMult, stun: 0, kind: 'spell', sourceX: ev.x, knockback: fuegoKnockback(ev) });
    }
    return false;
  }

  protected onDestroy(): void {
    this.icon?.destroy();
    this.icon = null;
    this.cone?.destroy();
    this.cone = null;
    this.clearOrb();
    this.eyeGlow?.destroy();
    this.eyeGlow = null;
  }
}
