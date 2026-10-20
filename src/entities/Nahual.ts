import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE, DEPTH } from '../config/game';
import { FX_DEPTH_BIAS, JUICE, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import progression from '../data/progression.json';
import { kitAnimatorFor, type KitAnimator } from '../systems/CharacterKits';
import { isLunaActive } from '../systems/Luna';
import {
  EnemyBase, FB, burnFx, burst, fuegoDamage, fuegoKnockback, hexColor, hitPlayer, inFuegoLine, inLuzRadius, inMemoriaRadius, inSolLine,
  inVerdadRadius, planeDist, powerScale, purifyFx, rand, randRange, smokeFx, solDamage, solKnockback, spellParam, texOr, verdadStun,
} from './EnemyBase';

/**
 * Nahual infiltrado (minijefe del Nivel 6, contratos §4). PLACEHOLDER SIMPLE (AGENTS §8.0).
 * - Spec: { type: 'nahual', id, disguise, x, y }. Con `disguise` empieza DISFRAZADO con la textura de ese NPC
 *   (64×80, pivote (32, 78)): no ataca, el láser lo atraviesa y no recibe daño. Con Luna se ve bajo él su
 *   SOMBRA ANIMAL (pista). Sin `disguise` aparece ya transformado.
 * - 'nahual:reveal' {id, surprise}: se transforma (humo, sin sangre) en animal (cuadro 96×64, pies y = 62,
 *   kit 'nahual_animal') y, si surprise, lanza de inmediato un ZARPAZO FUERTE (2 de daño).
 * - VERDAD en su radio estando disfrazado: se transforma SIN zarpazo, queda aturdido y emite 'nahual:revealed'.
 * - Transformado: zarpazos en combo, embestida con aviso, salto. Con vida ≤ fleeAt HUYE ('nahual:fled',
 *   Ecos × fleeEcosMult) salvo que esté aturdido: aturdirlo (láser verde, LUZ, VERDAD) y bajarle la vida lo deja
 *   AGOTADO; entonces CALMA / LUZ / MEMORIA lo purifican (60 Ecos × 1.5, × 1.25 PERFECTO, 'enemy:purified').
 */

const N = enemiesData.nahual;
const HU = N.human;
const AN = N.animal;
const TEX_H = '__cb_nahual_humano';
const TEX_A = '__cb_nahual_animal';

type St =
  | 'disguised' | 'transform' | 'idle' | 'chase'
  | 'surpriseWindup' | 'surprise' | 'clawWindup' | 'claw' | 'chargeWindup' | 'charge' | 'pounceWindup' | 'pounce'
  | 'recover' | 'hurt' | 'dizzy' | 'flee' | 'exhausted' | 'purifying';

let toldCalma = false;
let toldExhausted = false;
let toldFlee = false;

function ensureNahualTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_A)) return;
  const c = N.colors;
  const g = scene.make.graphics({}, false);
  // --- Persona (respaldo si no existe la textura del disfraz) 64×80, pies en y = 78.
  g.fillStyle(hexColor(c.clothesDark), 1).fillRect(26, 56, 5, 22).fillRect(33, 56, 5, 22);
  g.fillStyle(hexColor(c.clothes), 1).fillRoundedRect(23, 32, 18, 27, 4);
  g.fillStyle(hexColor(c.clothesDark), 1).fillRect(20, 34, 4, 18).fillRect(40, 34, 4, 18);
  g.fillStyle(hexColor(c.skin), 1).fillCircle(32, 24, 7);
  g.fillStyle(0x2a1a14, 1).fillRect(25, 16, 14, 4);
  g.fillStyle(0x1a1010, 1).fillRect(34, 23, 2, 2);
  g.generateTexture(TEX_H, HU.frame.w, HU.frame.h);
  // --- Animal (jaguar/coyote oscuro) 96×64, pies en y = 62, mira a la derecha.
  g.clear();
  const body = hexColor(c.body);
  const dark = hexColor(c.dark);
  g.fillStyle(dark, 1).fillTriangle(4, 22, 20, 36, 24, 30); // cola
  g.fillStyle(dark, 1).fillRect(24, 44, 7, 18).fillRect(62, 44, 7, 18);
  g.fillStyle(body, 1).fillRect(32, 44, 7, 18).fillRect(70, 44, 7, 18);
  g.fillStyle(body, 1).fillEllipse(48, 37, 56, 22);
  g.fillStyle(hexColor(c.spots), 1).fillCircle(36, 34, 3).fillCircle(46, 31, 3).fillCircle(56, 35, 3).fillCircle(42, 40, 2).fillCircle(52, 41, 2);
  g.fillStyle(body, 1).fillTriangle(66, 28, 80, 24, 72, 42);
  g.fillStyle(body, 1).fillEllipse(81, 27, 18, 14);
  g.fillStyle(body, 1).fillRect(85, 27, 9, 6); // hocico
  g.fillStyle(dark, 1).fillTriangle(75, 21, 78, 12, 81, 21).fillTriangle(81, 21, 85, 13, 86, 23); // orejas
  g.fillStyle(hexColor(c.eyes), 1).fillRect(83, 24, 3, 2);
  g.fillStyle(0xe8e0d0, 1).fillRect(91, 32, 1, 2);
  g.generateTexture(TEX_A, AN.frame.w, AN.frame.h);
  g.destroy();
}

export class Nahual extends EnemyBase {
  kind: EnemyKind = 'nahual';
  readonly id: string;
  private st: St;
  private stT = 0;
  private hitDone = false;
  private disguised: boolean;
  private animal = false;
  private pendingSurprise = false;
  private pendingVerdad = false;
  private dizzyFor = N.dizzySeconds;
  private cooldown = rand(0.5, 1);
  private chargeCd = rand(1.5, 2.5);
  private pounceCd = rand(2, 3.5);
  private comboLeft = 0;
  private chargeDir: 1 | -1 = 1;
  private chargeLeft = 0;
  private pounceFrom = { x: 0, y: 0 };
  private pounceTo = { x: 0, y: 0 };
  private fleeDir: 1 | -1 = 1;
  private fled = false;
  private sideBias: 1 | -1;

  private humanSprite: Phaser.GameObjects.Sprite;
  private animalSprite: Phaser.GameObjects.Sprite;
  private humanKit: KitAnimator | null;
  private animalKit: KitAnimator | null;
  private lunaShadow: Phaser.GameObjects.Image;
  private eyes: Phaser.GameObjects.Image;
  private warn: Phaser.GameObjects.Graphics | null = null;

  constructor(world: WorldApi, x: number, y: number, opts: { id?: string; disguise?: string; group?: string } = {}) {
    const scene = world.scene;
    ensureNahualTextures(scene);
    const hasDisguiseTex = !!opts.disguise && scene.textures.exists(opts.disguise);
    super(world, x, y, {
      hp: N.hp,
      radius: HU.radius,
      height: HU.height,
      ecos: N.ecos,
      feetY: HU.frame.feetY,
      frameH: HU.frame.h,
      fallbackTex: TEX_H,
      textureKey: hasDisguiseTex ? opts.disguise! : 'nahual_reposo',
      shadowW: HU.shadowW,
      kitId: hasDisguiseTex ? undefined : 'nahual',
    });
    this.id = opts.id ?? `nahual_${this.uid}`;
    this.group = opts.group;
    this.sideBias = this.uid % 2 ? 1 : -1;
    this.humanSprite = this.sprite;
    this.humanKit = this.kit;
    // El disfraz: la animación del NPC si existe; si es un spritesheet, su primer cuadro.
    if (hasDisguiseTex) {
      const key = opts.disguise!;
      if (scene.anims.exists(key)) this.humanSprite.play(key);
      else if (scene.textures.get(key).frameTotal > 2) this.humanSprite.setFrame(0);
      this.hasArt = true;
    }
    this.animalSprite = scene.add.sprite(x, y, texOr(scene, 'nahual_animal_reposo', TEX_A)).setOrigin(0.5, AN.frame.feetY / AN.frame.h).setVisible(false);
    this.animalKit = kitAnimatorFor(this.animalSprite, 'nahual_animal');
    this.animalSprite.setVisible(false);
    // Sombra animal (solo con Luna): silueta del animal proyectada en el suelo.
    this.lunaShadow = scene.add.image(x, y, TEX_A).setOrigin(0.5, AN.frame.feetY / AN.frame.h).setTintMode(Phaser.TintModes.FILL).setTint(0x000000).setAlpha(0);
    this.eyes = scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(N.colors.eyes)).setScale(0.18).setAlpha(0);

    this.disguised = !!opts.disguise;
    if (this.disguised) {
      this.st = 'disguised';
      this.height = 0; // el láser lo atraviesa
    } else {
      this.st = 'idle';
      this.swapToAnimal();
    }
    this.facing = -1;

    bus.scoped(scene, 'nahual:reveal', ({ id, surprise }) => {
      if (id === this.id && this._alive) this.reveal(surprise, false);
    });
    this.render(0);
    this.placeFx();
  }

  /** ¿Sigue disfrazado? (para el director). */
  get isDisguised(): boolean {
    return this.disguised;
  }

  /** María no ataca a un "sobreviviente" que aún no se revela. */
  get isAware(): boolean {
    return !this.disguised;
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (st !== 'chargeWindup' && st !== 'charge') this.clearWarn();
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    if (!this.animal) return; // el disfraz conserva la animación del NPC
    const anim: Record<St, string> = {
      disguised: 'reposo',
      transform: 'invocar',
      idle: 'reposo',
      chase: 'correr',
      surpriseWindup: 'golpe',
      surprise: 'ataque',
      clawWindup: 'golpe',
      claw: 'ataque',
      chargeWindup: 'golpe',
      charge: 'correr',
      pounceWindup: 'golpe',
      pounce: 'salto',
      recover: 'reposo',
      hurt: 'dano',
      dizzy: 'aturdido',
      flee: 'correr',
      exhausted: 'agotado',
      purifying: 'purificar',
    };
    this.play(`nahual_animal_${anim[st]}`);
  }

  /* --------------------------- Transformación --------------------------- */

  /** surprise: zarpazo fuerte inmediato (al hablarle). byVerdad: sin zarpazo, aturdido y 'nahual:revealed'. */
  reveal(surprise: boolean, byVerdad: boolean): void {
    if (!this.disguised || !this._alive) return;
    this.disguised = false;
    this.pendingSurprise = surprise && !byVerdad;
    this.pendingVerdad = byVerdad;
    this.set('transform');
    sfx('nahual_transformar');
    smokeFx(this.scene, this.x, this.y, 1.3);
    burst(this.scene, 'dark', this.x, this.y - 40, this.y + FX_DEPTH_BIAS, 14);
    if (byVerdad) bus.emit('nahual:revealed', { id: this.id });
    if (!toldFlee) {
      toldFlee = true;
      bus.emit('hud:toast', { text: '¡Un nahual! Con poca vida huye: atúrdelo antes de rematarlo', ms: 3000 });
    }
  }

  private updateTransform(): void {
    const half = N.transformSeconds / 2;
    if (!this.hitDone && this.stT >= half) {
      this.hitDone = true;
      this.swapToAnimal();
      smokeFx(this.scene, this.x, this.y, 1.1);
      this.world.shake(0.004, 120);
    }
    const k = this.stT < half ? 1 - this.stT / half : (this.stT - half) / half;
    this.sprite.setAlpha(0.3 + 0.7 * Math.min(1, k));
    if (this.stT < N.transformSeconds) return;
    this.sprite.setAlpha(1);
    this.facePlayer();
    if (this.pendingSurprise) {
      this.pendingSurprise = false;
      sfx('nahual_zarpazo');
      this.set('surpriseWindup');
    } else if (this.pendingVerdad) {
      this.pendingVerdad = false;
      this.startDizzy(spellParam('VERDAD', 'stunSeconds', N.verdadStunSeconds));
    } else this.set('chase');
  }

  private swapToAnimal(): void {
    if (this.animal) return;
    this.animal = true;
    const from = this.sprite;
    this.sprite = this.animalSprite;
    this.kit = this.animalKit;
    this.hasArt = !!this.kit || this.scene.textures.exists('nahual_animal_reposo');
    this.fallbackTex = TEX_A;
    this.radius = AN.radius;
    this.height = AN.height;
    this.shadowW = AN.shadowW;
    if (this.shadow instanceof Phaser.GameObjects.Ellipse) this.shadow.setSize(AN.shadowW, AN.shadowW * 0.32);
    from.setVisible(false);
    this.sprite.setVisible(true).setAlpha(from.alpha).setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    if (!this.world.isWalkable(this.x, this.y, this.radius)) {
      const pt = this.world.randomPointNear(this.x, this.y, 30);
      this.x = pt.x;
      this.y = pt.y;
    }
    this.play('nahual_animal_reposo');
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    this.cooldown -= dt;
    this.chargeCd -= dt;
    this.pounceCd -= dt;
    if (this.stunAcc > 0 && this.st !== 'dizzy') this.stunAcc = Math.max(0, this.stunAcc - N.stunDecay * dt);
    if (this.st !== 'disguised') this.stepKnockback(dt);
    this.bob = 0;

    switch (this.st) {
      case 'disguised': {
        // Se queda como el NPC: mira al jugador cuando está cerca.
        if (planeDist(this.x, this.y, p.x, p.y) < 120) this.facePlayer();
        break;
      }
      case 'transform':
        this.updateTransform();
        break;
      case 'idle':
        if (this.group || planeDist(this.x, this.y, p.x, p.y) < N.aggroRadius) this.set('chase');
        break;
      case 'chase':
        this.updateChase(dt);
        break;
      case 'surpriseWindup':
        this.telegraph(0x804010);
        if (this.stT >= N.surprise.windup) this.set('surprise');
        break;
      case 'surprise':
        this.world.moveActor(this, this.facing * 220 * dt, 0);
        if (!this.hitDone) {
          this.hitDone = true;
          burst(this.scene, 'sparkRed', this.x + this.facing * 34, this.y - 30, this.y + FX_DEPTH_BIAS, 10);
          this.world.shake(JUICE.shake.red.intensity * 1.5, JUICE.shake.red.ms);
          if (Math.abs(p.x - this.x) < N.surprise.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE * 1.4 && !p.isDodging) {
            hitPlayer(this.world, { damage: N.surprise.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: N.surprise.knockback });
          }
        }
        if (this.stT >= 0.2) this.toRecover(N.claw.recover);
        break;
      case 'clawWindup':
        this.facePlayer();
        this.telegraph(0x603010);
        if (this.stT >= N.claw.windup * (this.comboLeft < N.claw.combo ? 0.6 : 1)) this.set('claw');
        break;
      case 'claw':
        this.world.moveActor(this, this.facing * 140 * dt, 0);
        if (!this.hitDone) {
          this.hitDone = true;
          sfx('nahual_zarpazo');
          burst(this.scene, 'sparkRed', this.x + this.facing * 30, this.y - 28, this.y + FX_DEPTH_BIAS, 5);
          if (Math.abs(p.x - this.x) < N.claw.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < N.claw.dodgeHeight) {
            hitPlayer(this.world, { damage: N.claw.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: N.claw.knockback });
          }
        }
        if (this.stT >= N.claw.active) {
          this.comboLeft--;
          if (this.comboLeft > 0) this.set('clawWindup');
          else this.toRecover(N.claw.recover);
        }
        break;
      case 'chargeWindup':
        this.telegraph(0x503018);
        this.bob = -Math.min(3, this.stT * 6);
        if (Math.random() < dt * 22) burst(this.scene, 'dust', this.x - this.facing * 20, this.y, this.y + FX_DEPTH_BIAS, 2);
        this.drawWarn();
        if (this.stT >= N.charge.windup) {
          this.chargeLeft = N.charge.distance;
          this.set('charge');
        }
        break;
      case 'charge': {
        const C = N.charge;
        const step = C.speed * dt;
        const x0 = this.x;
        this.world.moveActor(this, this.chargeDir * step, 0);
        const moved = Math.abs(this.x - x0);
        this.chargeLeft -= step;
        this.drawWarn();
        if (Math.random() < dt * 30) burst(this.scene, 'dust', this.x - this.chargeDir * 22, this.y, this.y + FX_DEPTH_BIAS, 1);
        if (!this.hitDone && Math.abs(p.x - this.x) < C.hitRadius + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < C.dodgeHeight && !p.isDodging) {
          this.hitDone = true;
          hitPlayer(this.world, { damage: C.damage, stun: 0, kind: 'melee', sourceX: this.x - this.chargeDir * 10, knockback: C.knockback });
        }
        if (this.chargeLeft <= 0 || moved < step * 0.3) {
          this.chargeCd = randRange(C.cooldown);
          this.toRecover(C.recover);
        }
        break;
      }
      case 'pounceWindup':
        this.facePlayer();
        this.telegraph(0x604020);
        this.bob = -Math.min(3, this.stT * 8);
        if (this.stT >= N.pounce.windup) {
          this.pounceFrom = { x: this.x, y: this.y };
          const dx = p.x - this.x;
          const dy = p.y - this.y;
          const d = Math.hypot(dx, dy) || 1;
          const reach = Math.min(d, N.pounce.maxDist);
          this.pounceTo = { x: this.x + (dx / d) * reach, y: this.y + (dy / d) * reach };
          sfx('nahual_zarpazo');
          this.set('pounce');
        }
        break;
      case 'pounce': {
        const P = N.pounce;
        const k = Math.min(1, this.stT / P.time);
        const tx = this.pounceFrom.x + (this.pounceTo.x - this.pounceFrom.x) * k;
        const ty = this.pounceFrom.y + (this.pounceTo.y - this.pounceFrom.y) * k;
        this.world.moveActor(this, tx - this.x, ty - this.y);
        this.z = Math.sin(Math.PI * k) * P.peak;
        if (!this.hitDone && k > 0.5 && planeDist(this.x, this.y, p.x, p.y) < P.hitRadius + p.radius && Math.abs(this.z - p.z) < 26 && !p.isDodging) {
          this.hitDone = true;
          hitPlayer(this.world, { damage: P.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: P.knockback });
        }
        if (k >= 1) {
          this.z = 0;
          burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 10);
          this.world.shake(0.003, 90);
          this.pounceCd = randRange(P.cooldown);
          this.toRecover(P.recover);
        }
        break;
      }
      case 'recover':
        if (this.stT >= 0) {
          this.cooldown = randRange(N.attackCooldown);
          this.set('chase');
        }
        break;
      case 'hurt':
        if (this.stT >= N.hurtSeconds) this.afterStagger();
        break;
      case 'dizzy':
        if (this.z > 0) this.z = Math.max(0, this.z - 200 * dt);
        if (this.stT >= this.dizzyFor) {
          this.setStars(false);
          this.stunAcc = 0;
          this.afterStagger();
        }
        break;
      case 'flee':
        this.updateFlee(dt);
        break;
      case 'exhausted':
        if (this.stT >= N.exhaustedSeconds) {
          // Nadie lo purificó: recupera el aliento y escapa.
          this.setStars(false);
          this._exhausted = false;
          this.setBaseTint(0xffffff);
          this.hp = 1;
          this.startFlee();
        }
        break;
      case 'purifying':
        break;
    }

    if (this.animal && this.st !== 'charge' && this.st !== 'pounce' && this.st !== 'purifying' && this.st !== 'flee') this.separate(dt, N.separation);
    if (this.animal && !this.hasArt && (this.st === 'chase' || this.st === 'flee')) this.bob = Math.abs(Math.sin(this.stT * 16)) * 1.5;
    this.render(dt);
    this.placeFx();
  }

  private updateChase(dt: number): void {
    const p = this.world.player;
    const dxp = p.x - this.x;
    const dyp = p.y - this.y;
    const ready = this.cooldown <= 0;
    const C = N.charge;
    if (ready && this.chargeCd <= 0 && Math.abs(dxp) > C.minDist && Math.abs(dxp) < C.maxDist && Math.abs(dyp) < C.depthAlign) {
      this.facePlayer();
      this.chargeDir = this.facing;
      this.set('chargeWindup');
      return;
    }
    const P = N.pounce;
    const d = planeDist(this.x, this.y, p.x, p.y);
    if (ready && this.pounceCd <= 0 && d > P.minDist && d < P.maxDist) {
      this.set('pounceWindup');
      return;
    }
    if (ready && Math.abs(dxp) < N.claw.range + this.radius * 0.6 && Math.abs(dyp) < DEPTH_TOLERANCE * 0.7) {
      this.comboLeft = N.claw.combo;
      this.set('clawWindup');
      return;
    }
    const side = Math.sign(-dxp) || this.sideBias;
    const tx = p.x + side * (N.claw.range * 0.8 + this.radius);
    const dx = tx - this.x;
    const dy = p.y - this.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 2) {
      const step = Math.min(dd, N.chaseSpeed * dt);
      this.world.moveActor(this, (dx / dd) * step, (dy / dd) * step * 0.8);
    }
    if (Math.abs(dxp) > 2) this.facing = dxp > 0 ? 1 : -1;
  }

  /** Tras un tirón o aturdimiento: si tiene poca vida, huye; si no, sigue peleando. */
  private afterStagger(): void {
    if (this.hp > 0 && this.hpRatio <= N.fleeAt) this.startFlee();
    else this.set('chase');
  }

  private startDizzy(seconds: number): void {
    this.dizzyFor = seconds;
    this.set('dizzy');
    this.setStars(true);
    burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 6);
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private toRecover(seconds: number): void {
    this.set('recover');
    this.stT = -seconds;
  }

  private telegraph(color: number): void {
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 14) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  private drawWarn(): void {
    if (!this.warn) this.warn = this.scene.add.graphics();
    const C = N.charge;
    const g = this.warn.clear().setDepth(this.y - 1.5);
    const x0 = this.st === 'charge' ? this.x : this.x + this.chargeDir * this.radius;
    const len = this.st === 'charge' ? Math.max(0, this.chargeLeft) : C.distance;
    const a = this.st === 'charge' ? 0.15 : Math.floor(this.stT * 12) % 2 === 0 ? 0.35 : 0.14;
    const xa = Math.min(x0, x0 + this.chargeDir * len);
    g.fillStyle(0xffb040, a).fillRect(xa, this.y - C.warnHalfWidth, len, C.warnHalfWidth * 2);
    g.lineStyle(1, 0xffe0a0, a * 2).lineBetween(x0, this.y, x0 + this.chargeDir * len, this.y);
  }

  private clearWarn(): void {
    this.warn?.destroy();
    this.warn = null;
  }

  /* ------------------------------ Huida ------------------------------ */

  private startFlee(): void {
    this.clearWarn();
    this.z = 0;
    const p = this.world.player;
    this.fleeDir = this.x >= p.x ? 1 : -1;
    this.facing = this.fleeDir;
    this.set('flee');
    sfx('nahual_huir');
    burst(this.scene, 'dark', this.x, this.y - 30, this.y + FX_DEPTH_BIAS, 10);
  }

  private updateFlee(dt: number): void {
    const x0 = this.x;
    this.world.moveActor(this, this.fleeDir * N.fleeSpeed * dt, 0);
    // Si choca, rodea por la profundidad.
    if (Math.abs(this.x - x0) < N.fleeSpeed * dt * 0.3) this.world.moveActor(this, 0, (this.uid % 2 ? 1 : -1) * N.fleeSpeed * 0.6 * dt);
    this.facing = this.fleeDir;
    if (Math.random() < dt * 20) burst(this.scene, 'dust', this.x - this.fleeDir * 20, this.y, this.y + FX_DEPTH_BIAS, 1);
    const view = this.scene.cameras.main.worldView;
    const off = this.x < view.x - 40 || this.x > view.right + 40;
    const left = N.fleeSeconds - this.stT;
    if (left < 0.5) this.sprite.setAlpha(Math.max(0, left / 0.5));
    if (off || left <= 0) this.escape();
  }

  /** Se escapó: Ecos parciales y sale del mundo. */
  private escape(): void {
    if (this.fled) return;
    this.fled = true;
    const amount = Math.round(this._ecos * N.fleeEcosMult);
    bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 30 });
    bus.emit('nahual:fled', { id: this.id });
    bus.emit('hud:toast', { text: 'El nahual escapó…', ms: 1600 });
    this.leaveWorld();
  }

  /* ------------------------------ Golpes ------------------------------ */

  private get untouchable(): boolean {
    return this.disguised || this.st === 'transform' || this.st === 'exhausted' || this.st === 'purifying';
  }

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.untouchable) return false;
    this.hp -= hit.damage;
    this.stunAcc += hit.stun;
    this.onDamaged(hit, this.st === 'charge' || this.st === 'pounce' ? 0.2 : N.knockbackScale);
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (this.hp <= 0) {
      this.exhaust();
    } else if (this.stunAcc >= N.stunThreshold && this.st !== 'dizzy') {
      // Aturdirlo detiene la huida.
      this.clearWarn();
      this.z = 0;
      this.startDizzy(N.dizzySeconds);
    } else if (this.st === 'dizzy') {
      // Aturdido no huye: se puede rematar.
    } else if (this.hpRatio <= N.fleeAt && this.st !== 'flee') {
      this.startFlee();
    } else if (hit.damage >= 1 && this.st !== 'charge' && this.st !== 'pounce' && this.st !== 'chargeWindup' && this.st !== 'flee' && this.st !== 'claw' && this.st !== 'surprise') {
      this.set('hurt');
    }
    return true;
  }

  private exhaust(): void {
    this.hp = 0;
    this._exhausted = true;
    this.kbVel *= 0.5;
    this.z = 0;
    this.clearWarn();
    this.set('exhausted');
    this.setStars(true, 0xffd080);
    this.setBaseTint(0xb0a8b0);
    burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 8);
    bus.emit('enemy:exhausted', { enemy: this });
    if (!toldExhausted) {
      toldExhausted = true;
      bus.emit('hud:toast', { text: 'El nahual está agotado: purifícalo con CALMA, LUZ o MEMORIA', ms: 3000 });
    }
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || ev.outcome === 'fail') return false;
    if (this.st === 'purifying' || this.st === 'transform') return false;
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    const perfect = ev.outcome === 'perfect';
    // Disfrazado: solo VERDAD lo afecta (lo obliga a mostrarse, sin zarpazo sorpresa).
    if (this.disguised) {
      if (ev.spellId !== 'VERDAD' || !inVerdadRadius(ev, this.x, this.y, this.radius)) return false;
      this.reveal(false, true);
      return true;
    }
    switch (ev.spellId) {
      case 'CALMA': {
        const s = SPELLS_FX.CALMA;
        const r = Math.max(spellParam('CALMA', 'purifyRadius', s.purifyRadius), spellParam('CALMA', 'calmRadius', s.calmRadius)) * powerScale(power);
        if (planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y) > r + this.radius) return false;
        if (this._exhausted) {
          this.purify(perfect);
          return true;
        }
        if (!toldCalma) {
          toldCalma = true;
          bus.emit('hud:toast', { text: 'Su furia no cede todavía: agótalo primero y luego CALMA', ms: 2800 });
        }
        return false;
      }
      case 'LUZ':
        if (this._exhausted) {
          if (!inLuzRadius(ev, this.x, this.y, 'purifyRadius', this.radius)) return false;
          this.purify(perfect);
          return true;
        }
        if (!inLuzRadius(ev, this.x, this.y)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('LUZ', 'stun', SPELLS_FX.LUZ.stun) * power * 1.5, kind: 'spell', sourceX: ev.x, knockback: 6 });
      case 'MEMORIA':
        if (!this._exhausted || !inMemoriaRadius(ev, this.x, this.y, 'purifyRadius', this.radius)) return false;
        this.purify(perfect);
        return true;
      case 'VERDAD':
        if (this._exhausted || !inVerdadRadius(ev, this.x, this.y, this.radius)) return false;
        return this.takeHit({ damage: 0, stun: verdadStun(ev) * 1.5, kind: 'spell', sourceX: ev.x, knockback: 4 });
      case 'FUEGO':
        if (this._exhausted || !inFuegoLine(ev, this.x, this.y, this.radius)) return false;
        burnFx(this.scene, this);
        return this.takeHit({ damage: fuegoDamage(ev), stun: 0, kind: 'spell', sourceX: ev.x, knockback: fuegoKnockback(ev) });
      case 'SOL':
        if (this._exhausted || !inSolLine(ev, this.x, this.y, this.radius)) return false;
        return this.takeHit({ damage: solDamage(ev), stun: 0, kind: 'spell', sourceX: ev.x, knockback: solKnockback(ev) });
      case 'VOZ': {
        const s = SPELLS_FX.VOZ;
        if (this._exhausted || planeDist(this.x, this.y, ev.x, ev.y) > spellParam('VOZ', 'stunRadius', s.stunRadius) * powerScale(power)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('VOZ', 'stun', s.stun) * power, kind: 'spell', sourceX: ev.x, knockback: spellParam('VOZ', 'knockback', s.knockback) * power });
      }
      case 'PROTECCION': {
        const s = SPELLS_FX.PROTECCION;
        if (this._exhausted || planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y) > s.pushRadius) return false;
        return this.takeHit({ damage: 0, stun: s.stun * power, kind: 'spell', sourceX: ev.x, knockback: s.knockback * power });
      }
    }
    return false; // DESCANSO ➖
  }

  /** Purificado: el humo oscuro se va y queda una persona que se aleja en paz. */
  private purify(perfect: boolean): void {
    this.setStars(false);
    this.clearWarn();
    this.set('purifying');
    this._exhausted = true;
    sfx('purificar');
    smokeFx(this.scene, this.x, this.y, 1.2);
    purifyFx(this.scene, this.x, this.y, 1.1);
    this.setBaseTint(0xffffff);
    const amount = Math.round(this._ecos * progression.bonus.purificar * (perfect ? N.perfectBonus : 1));
    this.scene.time.delayedCall(N.purifySeconds * 1000, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 30 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect });
      this._purified = true;
      const away = this.x < this.world.player.x ? -1 : 1;
      this.facing = away as 1 | -1;
      this.scene.tweens.add({ targets: this, x: this.x + away * 60, duration: 1200 });
      this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 1200, onComplete: () => this.leaveWorld() });
    });
  }

  /* ------------------------------ Efectos ------------------------------ */

  private placeFx(): void {
    // Sombra animal con Luna (solo disfrazado: es la pista).
    const luna = this.disguised && isLunaActive();
    const S = N.lunaShadow;
    const target = luna ? S.alpha * (0.85 + 0.15 * Math.sin(this.scene.time.now / 260)) : 0;
    const a = this.lunaShadow.alpha + (target - this.lunaShadow.alpha) * 0.15;
    this.lunaShadow
      .setPosition(Math.round(this.x + this.facing * S.offsetX), Math.round(this.y))
      .setScale(this.facing < 0 ? -1 : 1, -S.squash)
      .setAlpha(a)
      .setDepth(DEPTH.shadow + this.y * 0.0001 + 0.00005);
    // Ojos de animal: tenues con Luna en el disfraz; encendidos al transformarse.
    let eyeA = 0;
    if (this.disguised) eyeA = luna ? 0.5 : 0;
    else if (this.animal && this.st !== 'purifying' && this.st !== 'exhausted') eyeA = 0.75 * this.sprite.alpha;
    const top = this.y - this.z - this.bob;
    const ex = this.disguised ? this.x + this.facing * 3 : this.x + this.facing * 34;
    const ey = this.disguised ? top - HU.height * 0.8 : top - AN.height * 0.82;
    this.eyes.setPosition(ex, ey).setAlpha(eyeA).setDepth(this.y + FX_DEPTH_BIAS);
  }

  protected onDestroy(): void {
    this.clearWarn();
    this.lunaShadow.destroy();
    this.eyes.destroy();
    // EnemyBase destruye el sprite actual; aquí el otro.
    (this.sprite === this.humanSprite ? this.animalSprite : this.humanSprite).destroy();
    void this.humanKit;
  }
}
