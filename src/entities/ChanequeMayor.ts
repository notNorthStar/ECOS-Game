import Phaser from 'phaser';
import type { ChanequeVariant, EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, JUICE } from '../config/combat';
import enemiesData from '../data/enemies.json';
import guardian from '../data/guardian.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import { EnemyBase, FB, burst, oneShotFx, planeDist, purifyFx, rand, randRange , hitPlayer } from './EnemyBase';

/**
 * Chaneque Mayor (NIVELES §4, jefe del Nivel 1). 128×128.
 * Fase 1: salto con onda expansiva (esquivable saltando o con la esquiva), llamar chaneques, manotazo.
 * Fase 2 (≤ 50 % de vida, "antena sobrecargada"): además lanza rocas en arco y raíces en línea.
 * Ventana de vulnerabilidad: aturdimiento acumulado con el láser verde o tras un salto fallido.
 * Solo en esa ventana le afecta CALMA (afinidad ✅; PROTECCION neutra). Se calma con 2 puntos de calma
 * (uno por fase; un PERFECTO cuenta doble en la fase 2).
 */

const B = enemiesData.chaneque_mayor;
let bossBarOwner: ChanequeMayor | null = null;
const bossConfig = (profile?: 'tuxtla_guardian'): typeof B => profile === 'tuxtla_guardian'
  ? { ...B, ...guardian, calm: { ...B.calm, ...guardian.calm }, summon: { ...B.summon, ...guardian.summon } } : B;
type Attack = 'slam' | 'summon' | 'melee' | 'rocks' | 'roots';
type St =
  | 'dormant'
  | 'intro'
  | 'idle'
  | 'walk'
  | 'meleeWindup'
  | 'meleeActive'
  | 'recover'
  | 'slamWindup'
  | 'slamAir'
  | 'slamWave'
  | 'summon'
  | 'rocksWindup'
  | 'rocksThrow'
  | 'rootsWindup'
  | 'vulnerable'
  | 'phaseChange'
  | 'calmed';

interface Rock {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  marker: Phaser.GameObjects.Ellipse;
}
interface Root {
  x: number;
  y: number;
  t: number; // empieza negativo (retraso)
  warn: Phaser.GameObjects.Ellipse | null;
  sprite: Phaser.GameObjects.Sprite | null;
  hitDone: boolean;
}
interface Wave {
  x: number;
  y: number;
  t: number;
  hitDone: boolean;
  gfx: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Sprite | null;
}

export class ChanequeMayor extends EnemyBase {
  kind: EnemyKind = 'chaneque_mayor';
  encounterId?: string;
  private readonly cfg: typeof B;
  private readonly guardianProfile: boolean;
  private st: St = 'dormant';
  private stT = 0;
  private phase: 1 | 2 = 1;
  private calmPoints = 0;
  private vulnerableLeft = 0;
  private hitDone = false;
  private slamFrom = { x: 0, y: 0 };
  private slamTo = { x: 0, y: 0 };
  private slamMarker: Phaser.GameObjects.Ellipse | null = null;
  private waves: Wave[] = [];
  private rocks: Rock[] = [];
  private roots: Root[] = [];
  private rocksLeft = 0;
  private rockT = 0;
  private waveHitPlayer = false;
  private electricT = 0;
  private walkPhase = 0;
  private toldNotVulnerable = false;
  private lastPerfect = false;

  constructor(world: WorldApi, x: number, y: number, group?: string, profile?: 'tuxtla_guardian', encounterId?: string) {
    const cfg = bossConfig(profile);
    super(world, x, y, {
      hp: cfg.hp,
      radius: cfg.radius,
      height: cfg.height,
      ecos: cfg.ecos,
      feetY: cfg.frame.feetY,
      frameH: cfg.frame.h,
      fallbackTex: FB.mayor,
      textureKey: 'chaneque_mayor_reposo',
      shadowW: 70,
      kitId: 'chaneque_mayor',
    });
    this.cfg = cfg;
    this.guardianProfile = profile === 'tuxtla_guardian';
    this.encounterId = encounterId;
    this.group = group;
    this.play('chaneque_mayor_reposo');
    this.render(0);
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    const anim: Record<St, string> = {
      dormant: 'chaneque_mayor_reposo',
      intro: 'chaneque_mayor_invocar',
      idle: 'chaneque_mayor_reposo',
      walk: 'chaneque_mayor_caminar',
      meleeWindup: 'chaneque_mayor_golpe',
      meleeActive: 'chaneque_mayor_golpe',
      recover: 'chaneque_mayor_reposo',
      slamWindup: 'chaneque_mayor_salto',
      slamAir: 'chaneque_mayor_salto',
      slamWave: 'chaneque_mayor_reposo',
      summon: 'chaneque_mayor_invocar',
      rocksWindup: 'chaneque_mayor_lanzar',
      rocksThrow: 'chaneque_mayor_lanzar',
      rootsWindup: 'chaneque_mayor_invocar',
      vulnerable: 'chaneque_mayor_aturdido',
      phaseChange: 'chaneque_mayor_dano',
      calmed: 'chaneque_mayor_purificar',
    };
    this.play(anim[st]);
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1;
  }

  private telegraph(on: boolean): void {
    if (this.flashT > 0) return;
    if (on) {
      const blink = Math.floor(this.stT * 12) % 2 === 0;
      this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? 0x804020 : 0x201008);
    } else this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
  }

  private showHud(): void {
    bossBarOwner = this;
    showBossBar(this.cfg.name);
  }

  private hideHud(): void {
    if (bossBarOwner !== this) return;
    hideBossBar();
    bossBarOwner = null;
  }

  private bossIdentity(): { enemy?: ChanequeMayor; encounterId?: string } {
    return this.guardianProfile ? { enemy: this, encounterId: this.encounterId } : {};
  }

  private pushHud(): void {
    if (bossBarOwner !== this || this.st === 'dormant') return;
    updateBossBar(this.hpRatio, this.calmPoints, this.cfg.calm.required, this.st === 'vulnerable');
  }

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    if (this.st !== 'vulnerable' && this.stunAcc > 0) this.stunAcc = Math.max(0, this.stunAcc - this.cfg.stunDecay * dt);
    this.stepKnockback(dt);

    switch (this.st) {
      case 'dormant':
        if (planeDist(this.x, this.y, p.x, p.y) < this.cfg.activateRadius) {
          this.set('intro');
          sfx('jefe_rugido');
          this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
          this.showHud();
          bus.emit('boss:phase', { phase: 1, ...this.bossIdentity() });
        }
        break;
      case 'intro':
        this.facePlayer();
        if (this.stT > 1.4) this.toIdle();
        break;
      case 'idle':
        this.facePlayer();
        if (this.stT > 0) this.chooseAttack();
        break;
      case 'walk': {
        this.facePlayer();
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) this.world.moveActor(this, (dx / d) * this.cfg.walkSpeed * dt, (dy / d) * this.cfg.walkSpeed * 0.7 * dt);
        if (!this.hasArt) {
          this.walkPhase += dt * 8;
          this.bob = Math.abs(Math.sin(this.walkPhase)) * 3;
        }
        if ((Math.abs(dx) < this.cfg.melee.range && Math.abs(dy) < DEPTH_TOLERANCE) || this.stT > 1.6) {
          this.bob = 0;
          this.set('meleeWindup');
        }
        break;
      }
      case 'meleeWindup':
        this.facePlayer();
        this.telegraph(true);
        if (this.stT >= this.cfg.melee.windup) {
          this.telegraph(false);
          sfx('jefe_golpe');
          this.set('meleeActive');
        }
        break;
      case 'meleeActive':
        if (!this.hitDone) {
          this.hitDone = true;
          this.world.moveActor(this, this.facing * 8, 0);
          if (Math.abs(p.x - this.x) < this.cfg.melee.range + 6 && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < 30) {
            hitPlayer(this.world, { damage: this.cfg.melee.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: this.cfg.melee.knockback });
          }
          burst(this.scene, 'dust', this.x + this.facing * 30, this.y, this.y + FX_DEPTH_BIAS, 8);
        }
        if (this.stT >= this.cfg.melee.active) this.set('recover');
        break;
      case 'recover':
        if (this.stT >= this.cfg.melee.recover) this.toIdle();
        break;
      case 'slamWindup':
        this.facePlayer();
        this.telegraph(true);
        this.bob = -Math.min(6, this.stT * 12);
        this.slamTo = { x: p.x, y: p.y };
        this.updateSlamMarker();
        if (this.stT >= this.cfg.slam.windup) {
          this.telegraph(false);
          this.bob = 0;
          this.slamFrom = { x: this.x, y: this.y };
          sfx('salto');
          this.set('slamAir');
        }
        break;
      case 'slamAir': {
        const t = Math.min(1, this.stT / this.cfg.slam.airTime);
        // Sigue un poco al jugador durante la primera mitad del salto.
        if (t < 0.5) {
          this.slamTo.x += (p.x - this.slamTo.x) * Math.min(1, dt * 2);
          this.slamTo.y += (p.y - this.slamTo.y) * Math.min(1, dt * 2);
        }
        this.updateSlamMarker();
        const tx = this.slamFrom.x + (this.slamTo.x - this.slamFrom.x) * t;
        const ty = this.slamFrom.y + (this.slamTo.y - this.slamFrom.y) * t;
        this.world.moveActor(this, tx - this.x, ty - this.y);
        this.z = 4 * this.cfg.slam.peak * t * (1 - t);
        if (t >= 1) {
          this.z = 0;
          this.clearSlamMarker();
          this.land();
          this.set('slamWave');
        }
        break;
      }
      case 'slamWave':
        // Espera a que la onda termine; si no tocó al jugador, queda vulnerable (salto fallido).
        if (this.waves.length === 0 && this.stT > 0.2) {
          if (!this.waveHitPlayer) this.startVulnerable(this.cfg.vulnerableMissedJump);
          else this.toIdle();
        }
        break;
      case 'summon':
        if (this.stT >= this.cfg.summon.windup && !this.hitDone) {
          this.hitDone = true;
          this.summon();
        }
        if (this.stT >= this.cfg.summon.windup + 0.5) this.toIdle();
        break;
      case 'rocksWindup':
        this.facePlayer();
        this.telegraph(true);
        if (this.stT >= this.cfg.rocks.windup) {
          this.telegraph(false);
          this.rocksLeft = this.cfg.rocks.count;
          this.rockT = 0;
          this.set('rocksThrow');
        }
        break;
      case 'rocksThrow':
        this.facePlayer();
        this.rockT -= dt;
        if (this.rocksLeft > 0 && this.rockT <= 0) {
          this.rockT = this.cfg.rocks.interval;
          this.rocksLeft--;
          this.throwRock();
        }
        if (this.rocksLeft === 0 && this.stT > this.cfg.rocks.interval * this.cfg.rocks.count + 0.4) this.toIdle();
        break;
      case 'rootsWindup':
        this.facePlayer();
        this.telegraph(true);
        if (this.stT >= this.cfg.roots.windup) {
          this.telegraph(false);
          this.spawnRoots();
          this.set('recover');
          this.stT = -0.6;
        }
        break;
      case 'vulnerable':
        this.vulnerableLeft -= dt;
        this.pushHud();
        if (this.vulnerableLeft <= 0) this.endVulnerable();
        break;
      case 'phaseChange':
        this.electricT -= dt;
        if (this.electricT <= 0) {
          this.electricT = 0.06;
          burst(this.scene, 'electric', this.x + rand(-30, 30), this.y - rand(20, 90), this.y + FX_DEPTH_BIAS, 4);
        }
        if (this.stT >= 1.6) this.toIdle();
        break;
      case 'calmed':
        break;
    }

    // Fase 2: chispas de la antena sobrecargada.
    if (!this.guardianProfile && this.phase === 2 && this.st !== 'calmed' && this.st !== 'phaseChange') {
      this.electricT -= dt;
      if (this.electricT <= 0) {
        this.electricT = rand(0.25, 0.6);
        burst(this.scene, 'electric', this.x + rand(-26, 26), this.y - this.z - rand(30, 90), this.y + FX_DEPTH_BIAS, 3);
      }
    }

    this.updateWaves(dt);
    this.updateRocks(dt);
    this.updateRoots(dt);
    this.render(dt);
  }

  private toIdle(): void {
    this.set('idle');
    this.stT = -randRange(this.cfg.idleBetween) * (this.phase === 2 ? 0.75 : 1);
  }

  private aliveMinions(): number {
    let n = 0;
    for (const e of this.world.enemies) if (e.kind === 'chaneque' && (!this.guardianProfile || e.group === this.group) && e.alive && !e.exhausted && !e.purified) n++;
    return n;
  }

  private chooseAttack(): void {
    const p = this.world.player;
    const w: Record<string, number> = { ...(this.phase === 1 ? this.cfg.weights.phase1 : this.cfg.weights.phase2) };
    const close = Math.abs(p.x - this.x) < 90 && Math.abs(p.y - this.y) < 30;
    if (!close) w.melee = 0;
    // Lejos: a veces camina hacia el jugador para presionarlo.
    if (!close && Math.abs(p.x - this.x) > 180 && Math.random() < 0.35) {
      this.set('walk');
      return;
    }
    if (this.aliveMinions() >= this.cfg.summon.maxMinions) w.summon = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick: Attack = 'slam';
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) {
        pick = k as Attack;
        break;
      }
    }
    switch (pick) {
      case 'melee':
        this.set(close ? 'meleeWindup' : 'walk');
        break;
      case 'slam':
        this.set('slamWindup');
        break;
      case 'summon':
        this.set('summon');
        sfx('jefe_rugido');
        break;
      case 'rocks':
        this.set('rocksWindup');
        break;
      case 'roots':
        this.set('rootsWindup');
        break;
    }
  }

  /* --------------------------- Salto y onda --------------------------- */

  private updateSlamMarker(): void {
    if (!this.slamMarker) {
      this.slamMarker = this.scene.add.ellipse(0, 0, 70, 22, 0xff5030, 0.18).setStrokeStyle(1, 0xffa070, 0.9);
    }
    this.slamMarker.setPosition(this.slamTo.x, this.slamTo.y).setDepth(this.slamTo.y - 1);
    this.slamMarker.setAlpha(0.55 + 0.45 * Math.sin(this.stT * 22));
  }

  private clearSlamMarker(): void {
    this.slamMarker?.destroy();
    this.slamMarker = null;
  }

  private land(): void {
    sfx('jefe_golpe');
    this.world.shake(JUICE.shake.bossSlam.intensity, JUICE.shake.bossSlam.ms);
    burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 22);
    this.waveHitPlayer = false;
    const p = this.world.player;
    // Aplastamiento directo bajo el jefe.
    if (planeDist(this.x, this.y, p.x, p.y) < this.radius + 6 && p.z < this.cfg.slam.dodgeHeight && !p.isDodging) {
      if (hitPlayer(this.world, { damage: this.cfg.slam.damage, stun: 0, kind: 'shockwave', sourceX: this.x, knockback: this.cfg.slam.knockback })) this.waveHitPlayer = true;
    }
    const gfx = this.scene.add.graphics().setDepth(this.y - 2);
    let sprite: Phaser.GameObjects.Sprite | null = null;
    if (this.scene.textures.exists('fx_onda')) {
      sprite = this.scene.add.sprite(this.x, this.y, 'fx_onda').setDepth(this.y - 1).setBlendMode(Phaser.BlendModes.ADD);
      if (this.scene.anims.exists('fx_onda')) sprite.play({ key: 'fx_onda', repeat: -1 });
    }
    this.waves.push({ x: this.x, y: this.y, t: 0, hitDone: false, gfx, sprite });
  }

  private updateWaves(dt: number): void {
    const p = this.world.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      const k = Math.min(1, w.t / this.cfg.slam.waveTime);
      const r = this.cfg.slam.waveMaxRadius * k;
      w.gfx.clear();
      w.gfx.lineStyle(4, 0xffd0a0, 0.8 * (1 - k)).strokeEllipse(w.x, w.y, r * 2, r);
      w.gfx.lineStyle(2, 0xffffff, 0.9 * (1 - k)).strokeEllipse(w.x, w.y, r * 2 - 6, r - 3);
      if (w.sprite) w.sprite.setDisplaySize(r * 2 + 4, Math.max(4, r * 0.66)).setAlpha(1 - k);
      if (!w.hitDone) {
        const d = planeDist(p.x, p.y, w.x, w.y);
        if (Math.abs(d - r) < this.cfg.slam.waveThickness && p.z < this.cfg.slam.dodgeHeight && !p.isDodging) {
          w.hitDone = true;
          if (hitPlayer(this.world, { damage: this.cfg.slam.damage, stun: 0, kind: 'shockwave', sourceX: w.x, knockback: this.cfg.slam.knockback })) this.waveHitPlayer = true;
        }
      }
      if (k >= 1) {
        w.gfx.destroy();
        w.sprite?.destroy();
        this.waves.splice(i, 1);
      }
    }
  }

  /* ------------------------------ Invocar ----------------------------- */

  private summon(): void {
    const n = Math.min(this.cfg.summon.count, this.cfg.summon.maxMinions - this.aliveMinions());
    for (let i = 0; i < n; i++) {
      const pt = this.world.randomPointNear(this.x + (i % 2 ? 60 : -60), this.y, 30);
      const variant = this.cfg.summon.variants[Math.floor(Math.random() * this.cfg.summon.variants.length)] as ChanequeVariant;
      oneShotFx(this.scene, 'fx_purificar', pt.x, pt.y - 20, pt.y + FX_DEPTH_BIAS, { tint: 0x80ff80, fallbackMs: 400 });
      burst(this.scene, 'dust', pt.x, pt.y, pt.y + FX_DEPTH_BIAS, 10);
      this.world.spawnEnemy({ type: 'chaneque', variant, x: pt.x, y: pt.y,
        ...(this.guardianProfile ? { group: this.group, encounterId: this.encounterId } : {}) });
    }
    sfx('chaneque_risa');
  }

  /* ------------------------------- Rocas ------------------------------ */

  private throwRock(): void {
    const p = this.world.player;
    const pt = this.world.randomPointNear(p.x + rand(-this.cfg.rocks.spread, this.cfg.rocks.spread), p.y + rand(-this.cfg.rocks.spread, this.cfg.rocks.spread) * 0.4, 6);
    const sx = this.x + this.facing * 24;
    const sy = this.y;
    const sprite = this.scene.add.image(sx, sy - 70, this.scene.textures.exists('fx_roca') ? 'fx_roca' : FB.rock);
    const shadow = this.scene.add.ellipse(sx, sy, 14, 5, 0x000000, 0.35);
    const marker = this.scene.add.ellipse(pt.x, pt.y, 28, 9, 0xff5030, 0.2).setStrokeStyle(1, 0xffa070, 0.9).setDepth(pt.y - 1);
    this.rocks.push({ sx, sy, tx: pt.x, ty: pt.y, t: 0, sprite, shadow, marker });
    sfx('jefe_golpe');
  }

  private updateRocks(dt: number): void {
    const p = this.world.player;
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      const k = Math.min(1, r.t / this.cfg.rocks.flightTime);
      const x = r.sx + (r.tx - r.sx) * k;
      const y = r.sy + (r.ty - r.sy) * k;
      const z = 70 * (1 - k) + 4 * this.cfg.rocks.peak * k * (1 - k);
      r.sprite.setPosition(x, y - z).setDepth(y).setRotation(r.t * 8);
      r.shadow.setPosition(x, y).setDepth(y - 1).setScale(0.5 + 0.5 * k);
      r.marker.setAlpha(0.5 + 0.5 * Math.sin(r.t * 24));
      if (k >= 1) {
        burst(this.scene, 'dust', x, y, y + FX_DEPTH_BIAS, 10);
        oneShotFx(this.scene, 'fx_impacto', x, y - 4, y + FX_DEPTH_BIAS, { tint: 0xc0a080, fallbackMs: 200 });
        this.world.shake(JUICE.shake.rock.intensity, JUICE.shake.rock.ms);
        sfx('impacto');
        if (planeDist(p.x, p.y, x, y) < this.cfg.rocks.hitRadius && Math.abs(p.y - y) < DEPTH_TOLERANCE && p.z < 20) {
          hitPlayer(this.world, { damage: this.cfg.rocks.damage, stun: 0, kind: 'projectile', sourceX: x, knockback: this.cfg.rocks.knockback });
        }
        r.sprite.destroy();
        r.shadow.destroy();
        r.marker.destroy();
        this.rocks.splice(i, 1);
      }
    }
  }

  /* ------------------------------ Raíces ------------------------------ */

  private spawnRoots(): void {
    const p = this.world.player;
    const dir = Math.sign(p.x - this.x) || this.facing;
    const y = p.y;
    sfx('jefe_rugido');
    for (let i = 0; i < this.cfg.roots.count; i++) {
      const x = this.x + dir * (40 + i * this.cfg.roots.spacing);
      if (x < 0 || x > this.world.level.width) break;
      this.roots.push({ x, y, t: -i * this.cfg.roots.interval, warn: null, sprite: null, hitDone: false });
    }
  }

  private updateRoots(dt: number): void {
    const p = this.world.player;
    const R = this.cfg.roots;
    for (let i = this.roots.length - 1; i >= 0; i--) {
      const r = this.roots[i];
      r.t += dt;
      if (r.t < 0) continue;
      if (r.t < R.warnTime) {
        // Aviso: grieta que parpadea y polvo.
        if (!r.warn) {
          r.warn = this.scene.add.ellipse(r.x, r.y, 22, 7, 0x3a2a10, 0.6).setStrokeStyle(1, 0xffb060, 0.9).setDepth(r.y - 1);
          burst(this.scene, 'dust', r.x, r.y, r.y + FX_DEPTH_BIAS, 4);
        }
        r.warn.setAlpha(0.4 + 0.6 * (Math.floor(r.t * 16) % 2));
        continue;
      }
      if (!r.sprite) {
        const hasTex = this.scene.textures.exists('fx_raiz');
        r.sprite = this.scene.add.sprite(r.x, r.y, hasTex ? 'fx_raiz' : FB.root).setOrigin(0.5, 1).setDepth(r.y);
        if (this.scene.anims.exists('fx_raiz')) r.sprite.play('fx_raiz');
        else r.sprite.setScale(1, 0.1);
        burst(this.scene, 'dust', r.x, r.y, r.y + FX_DEPTH_BIAS, 6);
        this.world.shake(0.002, 50);
      }
      const k = (r.t - R.warnTime) / R.riseTime;
      if (!this.scene.anims.exists('fx_raiz')) {
        const grow = k < 0.25 ? k / 0.25 : k > 0.75 ? (1 - k) / 0.25 : 1;
        r.sprite.setScale(1, Math.max(0.05, grow));
      }
      if (!r.hitDone && k < 0.45) {
        if (Math.abs(p.x - r.x) < R.hitHalfWidth && Math.abs(p.y - r.y) < DEPTH_TOLERANCE && p.z < R.dodgeHeight) {
          r.hitDone = true;
          hitPlayer(this.world, { damage: R.damage, stun: 0, kind: 'projectile', sourceX: r.x, knockback: R.knockback });
        }
      }
      if (k >= 1) {
        r.warn?.destroy();
        r.sprite.destroy();
        this.roots.splice(i, 1);
      }
    }
  }

  /* -------------------------- Vulnerabilidad -------------------------- */

  private startVulnerable(seconds: number): void {
    this.clearSlamMarker();
    this.telegraph(false);
    this.z = 0;
    this.bob = 0;
    this.set('vulnerable');
    this.vulnerableLeft = seconds;
    this.stunAcc = 0;
    this.setStars(true);
    this.toldNotVulnerable = false;
    burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 10);
    bus.emit('boss:vulnerable', { on: true, ...this.bossIdentity() });
    bus.emit('hud:toast', { text: '¡Está vulnerable! Lanza CALMA (Q)', ms: 2200 });
    this.pushHud();
  }

  private endVulnerable(): void {
    this.setStars(false);
    bus.emit('boss:vulnerable', { on: false, ...this.bossIdentity() });
    // En fase 2, si llegó al piso de vida, se recupera un poco.
    if (this.hp <= 1) this.hp = Math.max(this.hp, this.maxHp * this.cfg.floorHpRefill);
    this.pushHud();
    this.toIdle();
  }

  private enterPhase2(): void {
    if (this.phase === 2) return;
    if (this.st === 'vulnerable') {
      this.setStars(false);
      bus.emit('boss:vulnerable', { on: false, ...this.bossIdentity() });
    }
    this.clearSlamMarker();
    this.telegraph(false);
    this.z = 0;
    this.phase = 2;
    this.hp = Math.min(this.hp, this.maxHp * this.cfg.phase2At);
    this.set('phaseChange');
    this.setBaseTint(0xf0c8ff);
    sfx('jefe_rugido');
    if (!this.guardianProfile) sfx('antena_zumbido');
    this.world.flash(0xc070ff, 220);
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    bus.emit('boss:phase', { phase: 2, ...this.bossIdentity() });
    bus.emit('hud:toast', { text: this.guardianProfile ? guardian.phase2Message : '¡La antena sobrecarga al Chaneque Mayor!', ms: 2600 });
    this.pushHud();
  }

  takeHit(hit: Hit): boolean {
    if (!this._alive) return false;
    if (this.st === 'calmed' || this.st === 'phaseChange' || this.st === 'intro') return false;
    if (this.st === 'dormant') {
      this.set('intro');
      this.showHud();
      bus.emit('boss:phase', { phase: 1, ...this.bossIdentity() });
    }
    this.hp -= hit.damage;
    this.onDamaged(hit, 0); // sin retroceso: es enorme
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (this.st !== 'vulnerable') {
      this.stunAcc += hit.stun;
      if (this.stunAcc >= this.cfg.stunThreshold && this.z < 4) {
        this.startVulnerable(this.cfg.vulnerableStun);
        return true;
      }
    }
    if (this.phase === 1 && this.hp <= this.maxHp * this.cfg.phase2At) {
      this.enterPhase2();
    } else if (this.phase === 2 && this.hp <= 1) {
      this.hp = 1;
      if (this.st !== 'vulnerable') this.startVulnerable(this.cfg.vulnerableFloorHp);
    }
    this.pushHud();
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'calmed' || ev.outcome === 'fail') return false;
    if (ev.spellId !== 'CALMA') return false; // PROTECCION: neutra
    if (planeDist(this.x, this.y, ev.x, ev.y) > (this.guardianProfile ? guardian.spellRange : 260)) return false;
    if (this.st !== 'vulnerable') {
      if (!this.toldNotVulnerable) {
        this.toldNotVulnerable = true;
        bus.emit('hud:toast', { text: this.guardianProfile ? guardian.protectedMessage : 'La antena lo protege. Atúrdelo con el láser verde o esquiva su salto.', ms: 2800 });
      }
      return false;
    }
    const perfect = ev.outcome === 'perfect';
    this.lastPerfect = perfect;
    this.calmPoints += perfect ? this.cfg.calm.perfect : this.cfg.calm.partial;
    bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
    this.world.hitstop(JUICE.hitstopMs.spell);
    burst(this.scene, 'calm', this.x, this.y - this.height * 0.7, this.y + FX_DEPTH_BIAS, 14);
    purifyFx(this.scene, this.x, this.y, 0.7);
    if (this.phase === 1) {
      this.calmPoints = Math.min(this.calmPoints, this.cfg.calm.phase1Cap);
      this.enterPhase2();
      return true;
    }
    if (this.calmPoints >= this.cfg.calm.required) {
      this.calm();
    } else {
      bus.emit('hud:toast', { text: 'Se resiste… ¡una vez más!', ms: 1800 });
      this.endVulnerable();
    }
    this.pushHud();
    return true;
  }

  private calm(): void {
    if (this.st === 'calmed') return;
    this.setStars(false);
    this.clearProjectiles();
    bus.emit('boss:vulnerable', { on: false, ...this.bossIdentity() });
    this.phase = 2;
    this.set('calmed');
    this.setBaseTint(0xffffff);
    this._exhausted = true;
    sfx('purificar');
    if (this.guardianProfile) this._purified = true;
    bus.emit('boss:calmed', this.bossIdentity());
    if (this.guardianProfile) {
      bus.emit('ecos:gained', { amount: this._ecos, x: this.x, y: this.y - 50 });
      bus.emit('enemy:purified', { enemy: this, ecos: this._ecos, perfect: this.lastPerfect });
    }
    this.pushHud();
    purifyFx(this.scene, this.x, this.y, 1.6);
    this.scene.time.delayedCall(700, () => purifyFx(this.scene, this.x, this.y, 1.2));
    const amount = Math.round(this._ecos * (this.lastPerfect && this.cfg.calm.perfectEcosBonus ? this.cfg.perfectBonus : 1));
    this.scene.time.delayedCall(1800, () => {
      if (!this._alive) return;
      if (!this.guardianProfile) {
        bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 50 });
        bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: this.lastPerfect });
      }
      this.hideHud();
      this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 1200, onComplete: () => this.leaveWorld() });
    });
  }

  private clearProjectiles(): void {
    this.clearSlamMarker();
    this.waves.forEach((w) => {
      w.gfx.destroy();
      w.sprite?.destroy();
    });
    this.waves = [];
    this.rocks.forEach((r) => {
      r.sprite.destroy();
      r.shadow.destroy();
      r.marker.destroy();
    });
    this.rocks = [];
    this.roots.forEach((r) => {
      r.warn?.destroy();
      r.sprite?.destroy();
    });
    this.roots = [];
  }

  /** Fase actual (para el director). */
  get currentPhase(): 1 | 2 {
    return this.phase;
  }

  protected onDestroy(): void {
    this.clearProjectiles();
    this.hideHud();
  }
}
