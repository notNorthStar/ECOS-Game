import Phaser from 'phaser';
import type { EnemyApi, EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, JUICE, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import { kitAnimatorFor, type KitAnimator } from '../systems/CharacterKits';
import { isShieldActive } from '../systems/Shield';
import {
  EnemyBase, FB, burst, hexColor, hitPlayer, inSolLine, lunaVisible, planeDist, purifyFx, rand, randRange, smokeFx, spellParam, texOr,
} from './EnemyBase';

/**
 * Bruja Guajolote / Tlahuelpuchi (jefa del Nivel 4, contratos §7). PLACEHOLDER SIMPLE en ambas formas (AGENTS §8.0).
 * - Forma HUMANA (cuadro 64×80, pivote (32, 78), kit 'bruja_guajolote'): flota, se teletransporta por la arena y
 *   lanza abanicos de fuego fatuo (verde-azul) que el escudo U DEVUELVE (si le pegan, baja la guardia). Débil a LUZ.
 * - Forma de AVE gigante (cuadro 160×128, pivote (80, 124), kit 'bruja_guajolote_ave'): embestidas a lo ancho
 *   anunciadas con una franja en su profundidad (cambiar de carril con W/S o esquivar), charcos de fuego fatuo en el
 *   suelo que dañan unos segundos y aleteo que empuja. Débil a SOL.
 * - Alterna de forma cada formSeconds o al recibir su conjuro débil ('bruja:form'); transición con humo y plumas.
 * - Tras sus ataques grandes baja la guardia (ventana): el conjuro débil de su forma o MEMORIA avanzan el sello
 *   (parcial 1, PERFECTO 2; MEMORIA × bossSeal). El conjuro equivocado le da un escudo breve y la apura.
 *   El láser solo la desgasta: acumula "chip" y al llenarlo abre una ventana corta; nunca la vence solo.
 * - Sello completo: el fuego fatuo se apaga y queda una mujer inconsciente, liberada. 'boss:calmed',
 *   ~350 Ecos (× 1.25 si el último sello fue PERFECTO), 'enemy:purified'. No invoca esbirros.
 * Sin violencia gráfica: nada de sangre; humo, plumas y luz.
 */

const W = enemiesData.bruja_guajolote;
const H = W.human;
const A = W.ave;
const WB = H.bolts;
const TEX_H = '__cb_bruja_humana';
const TEX_A = '__cb_bruja_ave';

type Form = 'humana' | 'ave';
type St =
  | 'dormant' | 'intro' | 'idle'
  | 'teleportOut' | 'teleportIn' | 'boltsWindup' | 'bolts'
  | 'chargeWindup' | 'charge' | 'fireWindup' | 'flapWindup' | 'flap'
  | 'vulnerable' | 'transform' | 'calmed';

function ensureBrujaTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_H)) return;
  const c = W.colors;
  const g = scene.make.graphics({}, false);
  // --- Forma humana 64×80, mira a la derecha: mujer flotando con rebozo oscuro y cabello largo.
  g.fillStyle(hexColor(c.hair), 1).fillRect(26, 18, 8, 34); // cabello largo por detrás
  g.fillStyle(hexColor(c.dark), 1).fillTriangle(22, 36, 44, 36, 32, 78); // falda que se deshace en humo
  g.fillStyle(hexColor(c.rebozo), 1).fillTriangle(20, 36, 46, 36, 18, 70).fillTriangle(46, 36, 48, 66, 30, 60);
  g.fillStyle(hexColor(c.rebozo), 1).fillRect(23, 28, 20, 14); // hombros
  g.fillStyle(hexColor(c.skin), 1).fillCircle(34, 22, 7); // rostro
  g.fillStyle(hexColor(c.rebozo), 1).fillTriangle(24, 26, 42, 14, 26, 10).fillRect(24, 12, 6, 16); // rebozo sobre la cabeza
  g.fillStyle(hexColor(c.rebozo), 1).fillRect(42, 38, 10, 4); // brazo extendido
  g.fillStyle(hexColor(c.skin), 1).fillRect(51, 37, 3, 5); // mano
  g.fillStyle(hexColor(c.eyes), 1).fillRect(36, 21, 2, 2);
  g.generateTexture(TEX_H, H.frame.w, H.frame.h);
  // --- Forma de ave 160×128, mira a la derecha: guajolote gigante con cola en abanico.
  g.clear();
  const fe = hexColor(c.feather);
  const fd = hexColor(c.featherDark);
  g.fillStyle(fd, 1).fillCircle(46, 66, 42); // cola en abanico
  g.fillStyle(fe, 1).fillCircle(46, 66, 34);
  g.lineStyle(2, fd, 1);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.55 + i * 0.15);
    g.lineBetween(46, 66, 46 + Math.cos(a) * 40, 66 - Math.abs(Math.sin(a)) * 40);
  }
  g.fillStyle(0x5a5040, 1).fillRect(76, 102, 4, 22).fillRect(94, 102, 4, 22); // patas
  g.fillStyle(0x5a5040, 1).fillRect(72, 122, 12, 2).fillRect(90, 122, 12, 2);
  g.fillStyle(fe, 1).fillEllipse(86, 82, 88, 54); // cuerpo
  g.fillStyle(fd, 1).fillEllipse(82, 78, 58, 30); // ala
  g.lineStyle(1, fe, 1).lineBetween(60, 80, 104, 80).lineBetween(64, 86, 100, 86);
  g.fillStyle(fe, 1).fillTriangle(110, 70, 122, 30, 130, 66); // cuello
  g.fillStyle(0x6a6060, 1).fillCircle(126, 30, 9); // cabeza
  g.fillStyle(0x8a8070, 1).fillTriangle(133, 26, 146, 31, 133, 34); // pico
  g.fillStyle(hexColor(c.wattle), 1).fillEllipse(134, 42, 6, 14).fillRect(129, 20, 3, 8); // carúncula fantasmal
  g.fillStyle(hexColor(c.eyes), 1).fillRect(127, 26, 3, 3);
  g.generateTexture(TEX_A, A.frame.w, A.frame.h);
  g.destroy();
}

/* ============================ Proyectil de fuego fatuo ============================ */

/** Fuego fatuo: viaja en el plano a altura fija (saltar lo esquiva). El escudo U lo DEVUELVE hacia la bruja. */
class WispBolt {
  x: number;
  y: number;
  done = false;
  private vx: number;
  private vy: number;
  private traveled = 0;
  private reflected = false;
  private trailT = 0;
  private core: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;

  constructor(private world: WorldApi, x: number, y: number, dirX: number, dirY: number, private owner: EnemyApi, private damage: number) {
    this.x = x;
    this.y = y;
    const d = Math.hypot(dirX, dirY) || 1;
    this.vx = (dirX / d) * WB.speed;
    this.vy = (dirY / d) * WB.speed;
    const scene = world.scene;
    this.glow = scene.add.image(x, y - WB.height, FB.glow).setTint(hexColor(WB.color)).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8);
    this.core = scene.add.image(x, y - WB.height, FB.glow).setTint(hexColor(WB.core)).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3);
    this.shadow = scene.add.ellipse(x, y, 9, 3, 0x000000, 0.3);
    this.place();
  }

  private place(): void {
    const d = this.y + FX_DEPTH_BIAS;
    const k = 1 + 0.2 * Math.sin(this.traveled * 0.25);
    this.glow.setPosition(this.x, this.y - WB.height).setDepth(d).setScale(0.8 * k, 1.0 * k);
    this.core.setPosition(this.x, this.y - WB.height).setDepth(d + 0.01);
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1);
  }

  private reflect(): void {
    if (this.reflected) return;
    this.reflected = true;
    this.traveled = 0;
    const speed = WB.speed * WB.reflectSpeedMult;
    const o = this.owner;
    if (o.alive && !o.purified) {
      const dx = o.x - this.x;
      const dy = o.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * speed;
      this.vy = (dy / d) * speed;
    } else {
      this.vx = -Math.sign(this.vx || 1) * speed;
      this.vy = 0;
    }
    this.glow.setTint(hexColor(WB.reflectColor));
    this.core.setTint(0xffffff);
    burst(this.world.scene, 'light', this.x, this.y - WB.height, this.y + FX_DEPTH_BIAS, 8);
    sfx('proyectil_reflejo');
  }

  update(dt: number): void {
    if (this.done) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.traveled += Math.hypot(this.vx, this.vy) * dt;
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.045;
      burst(this.world.scene, this.reflected ? 'light' : 'purify', this.x, this.y - WB.height, this.y + FX_DEPTH_BIAS, 1);
    }
    this.place();
    if (!this.reflected) {
      const p = this.world.player;
      if (planeDist(this.x, this.y, p.x, p.y) < WB.hitRadius + p.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z <= WB.height && !p.isDodging) {
        const shielded = isShieldActive();
        hitPlayer(this.world, { damage: this.damage, stun: 0, kind: 'projectile', sourceX: this.x - Math.sign(this.vx) * 10, knockback: WB.knockback });
        if (shielded) this.reflect();
        else return this.pop();
      }
    } else {
      for (const e of this.world.enemies) {
        if (!e.alive || e.purified || e.exhausted || !lunaVisible(e)) continue;
        if (Math.abs(e.y - this.y) >= DEPTH_TOLERANCE * 1.5) continue;
        if (Math.abs(e.x - this.x) > e.radius + WB.hitRadius) continue;
        if (WB.height < e.z - 4 || WB.height > e.z + e.height) continue;
        e.takeHit({ damage: WB.reflectDamage, stun: 0, kind: 'projectile', sourceX: this.x - Math.sign(this.vx) * 10, knockback: 8 });
        this.world.hitstop(40);
        return this.pop();
      }
    }
    if (this.traveled > WB.range || this.x < -40 || this.x > this.world.level.width + 40) this.pop(false);
  }

  pop(sparks = true): void {
    if (this.done) return;
    if (sparks) burst(this.world.scene, this.reflected ? 'light' : 'purify', this.x, this.y - WB.height, this.y + FX_DEPTH_BIAS, 8);
    this.destroy();
  }

  destroy(): void {
    this.done = true;
    this.glow.destroy();
    this.core.destroy();
    this.shadow.destroy();
  }
}

/** Charco de fuego fatuo en el suelo: aviso (t < 0) y luego quema unos segundos. */
interface Puddle {
  x: number;
  y: number;
  t: number;
  tickT: number;
  gfx: Phaser.GameObjects.Graphics;
}

/* =================================== Jefa =================================== */

export class BrujaGuajolote extends EnemyBase {
  kind: EnemyKind = 'bruja_guajolote';
  private form: Form = 'humana';
  private st: St = 'dormant';
  private stT = 0;
  private phase: 1 | 2 = 1;
  private seal = 0;
  private lastPerfect = false;
  private formT = W.formSeconds;
  private shieldT = 0;
  private haste = 1;
  private vulnerableLeft = 0;
  private chip = 0;
  private homeX: number;
  private homeY: number;
  private floatT = 0;
  private hitDone = false;
  private pendingTransform = false;

  private humanSprite: Phaser.GameObjects.Sprite;
  private aveSprite: Phaser.GameObjects.Sprite;
  private humanKit: KitAnimator | null;
  private aveKit: KitAnimator | null;

  private bolts: WispBolt[] = [];
  private volleysLeft = 0;
  private volleyT = 0;
  private puddles: Puddle[] = [];
  private chargesLeft = 0;
  private chargeY = 0;
  private chargeDir: 1 | -1 = 1;
  private chargeFrom = { x: 0, y: 0, z: 0 };
  private chargeStartX = 0;
  private warn: Phaser.GameObjects.Graphics | null = null;
  private eye: Phaser.GameObjects.Image;
  private aura: Phaser.GameObjects.Image;
  private shieldFx: Phaser.GameObjects.Image | null = null;
  private orb: Phaser.GameObjects.Image | null = null;
  private told = { laser: false, window: false, wrong: false, shield: false, forced: false, memoria: false };

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    const scene = world.scene;
    ensureBrujaTextures(scene);
    super(world, x, y, {
      hp: 100,
      radius: H.radius,
      height: H.height,
      ecos: W.ecos,
      feetY: H.frame.feetY,
      frameH: H.frame.h,
      fallbackTex: TEX_H,
      textureKey: 'bruja_guajolote_reposo',
      shadowW: H.shadowW,
      kitId: 'bruja_guajolote',
    });
    this.group = group;
    this.homeX = x;
    this.homeY = y;
    this.humanSprite = this.sprite;
    this.humanKit = this.kit;
    this.aveSprite = scene.add.sprite(x, y, texOr(scene, 'bruja_guajolote_ave_reposo', TEX_A)).setOrigin(0.5, A.frame.feetY / A.frame.h).setVisible(false);
    this.aveKit = kitAnimatorFor(this.aveSprite, 'bruja_guajolote_ave');
    this.aveSprite.setVisible(false);
    this.aura = scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(W.colors.fire)).setAlpha(0);
    this.eye = scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(W.colors.eyes)).setScale(0.25);
    this.facing = -1;
    this.z = H.floatZ;
    this.play('bruja_guajolote_reposo');
    this.render(0);
    this.placeFx(0);
  }

  /** Forma actual (para el director). */
  get currentForm(): Form {
    return this.form;
  }

  private get prefix(): string {
    return this.form === 'humana' ? 'bruja_guajolote' : 'bruja_guajolote_ave';
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (st !== 'chargeWindup' && st !== 'charge') this.clearWarn();
    if (st !== 'boltsWindup' && st !== 'bolts') this.clearOrb();
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      dormant: 'reposo',
      intro: 'invocar',
      idle: this.form === 'humana' ? 'reposo' : 'caminar',
      teleportOut: 'conjuro',
      teleportIn: 'reposo',
      boltsWindup: 'conjuro',
      bolts: 'lanzar',
      chargeWindup: 'salto',
      charge: 'correr',
      fireWindup: 'invocar',
      flapWindup: 'golpe',
      flap: 'ataque',
      vulnerable: 'aturdido',
      transform: 'invocar',
      calmed: 'morir',
    };
    this.play(`${this.prefix}_${anim[st]}`);
  }

  private pushHud(): void {
    updateBossBar(1 - this.seal / W.seal.total, this.seal, W.seal.total, this.st === 'vulnerable');
  }

  private activate(): void {
    if (this.st !== 'dormant') return;
    this.set('intro');
    sfx('bruja_risa');
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    showBossBar(W.name);
    this.pushHud();
    bus.emit('boss:phase', { phase: 1 });
    bus.emit('bruja:form', { form: this.form });
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    this.floatT += dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    const fighting = this.st !== 'dormant' && this.st !== 'intro' && this.st !== 'transform' && this.st !== 'vulnerable' && this.st !== 'calmed';
    if (fighting) this.formT -= dt;

    switch (this.st) {
      case 'dormant':
        if (planeDist(this.x, this.y, p.x, p.y) < W.activateRadius) this.activate();
        break;
      case 'intro':
        this.facePlayer();
        if (this.stT >= W.introSeconds) this.toIdle();
        break;
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'teleportOut':
        this.sprite.setAlpha(Math.max(0, 1 - this.stT / H.teleport.windup));
        if (this.stT >= H.teleport.windup) {
          const pt = this.teleportPoint();
          this.x = pt.x;
          this.y = pt.y;
          smokeFx(this.scene, this.x, this.y, 0.8);
          this.facePlayer();
          this.set('teleportIn');
        }
        break;
      case 'teleportIn':
        this.sprite.setAlpha(Math.min(1, this.stT / (H.teleport.windup * 0.7)));
        if (this.stT >= H.teleport.windup * 0.7) {
          this.sprite.setAlpha(1);
          this.toIdle();
        }
        break;
      case 'boltsWindup':
        this.facePlayer();
        this.telegraph(0x206058);
        this.updateOrb();
        if (this.stT >= WB.windup) {
          this.volleysLeft = Phaser.Math.Between(WB.volleys[0], WB.volleys[1]);
          this.volleyT = 0;
          this.set('bolts');
        }
        break;
      case 'bolts':
        this.facePlayer();
        this.volleyT -= dt;
        if (this.volleyT <= 0 && this.volleysLeft > 0) {
          this.volleysLeft--;
          this.volleyT = WB.volleyGap;
          this.fireVolley();
        }
        if (this.volleysLeft <= 0 && this.volleyT <= 0) this.startVulnerable(W.vulnerableSeconds);
        break;
      case 'chargeWindup':
        this.updateChargeWindup();
        break;
      case 'charge':
        this.updateCharge(dt);
        break;
      case 'fireWindup':
        this.facePlayer();
        this.telegraph(0x1a5070);
        if (Math.random() < dt * 16) burst(this.scene, 'purify', this.x + rand(-30, 30), this.y - rand(20, 90), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= A.fire.windup) {
          this.spawnPuddles();
          this.startVulnerable(W.vulnerableSeconds);
        }
        break;
      case 'flapWindup':
        this.facePlayer();
        this.telegraph(0x403020);
        if (this.stT >= A.flap.windup) {
          sfx('bruja_aleteo');
          this.set('flap');
        }
        break;
      case 'flap':
        this.updateFlap(dt);
        break;
      case 'vulnerable':
        // Aturdida, pero sin darle la espalda al jugador (con el kit por cuadros se notaba).
        this.facePlayer();
        this.vulnerableLeft -= dt;
        if (Math.random() < dt * 5) burst(this.scene, 'smoke', this.x + rand(-10, 10), this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 1);
        if (this.vulnerableLeft <= 0) this.endVulnerable();
        break;
      case 'transform':
        this.updateTransform();
        break;
      case 'calmed':
        break;
    }

    // Altura: la humana flota con vaivén; el ave camina (salvo en la embestida). En la ventana bajan.
    if (this.st !== 'chargeWindup' && this.st !== 'charge' && this.st !== 'calmed') {
      const target = this.form === 'humana'
        ? (this.st === 'vulnerable' ? 2 : H.floatZ + Math.sin(this.floatT * 2.2) * H.bob)
        : (this.st === 'vulnerable' ? 0 : A.hoverZ);
      this.z += (target - this.z) * Math.min(1, dt * 6);
    }

    if (this.form === 'ave' && this.st !== 'calmed' && this.st !== 'charge' && this.st !== 'chargeWindup') this.pushPlayer();
    this.updateBolts(dt);
    this.updatePuddles(dt);
    if (this.st !== 'dormant' && this.st !== 'calmed') this.pushHud();
    // Forma de ave: suelta plumas oscuras al moverse (muchas al embestir o aletear); humana: chispas de fuego fatuo.
    const ave = this.form === 'ave' && this.st !== 'calmed' && this.st !== 'dormant';
    const wild = this.st === 'charge' || this.st === 'flap';
    this.trailFx(dt, ave, 'feather', wild ? 24 : 2.5, 0.6, 30);
    this.trailFx(dt, this.form === 'humana' && this.st !== 'calmed' && this.st !== 'dormant', 'sparkGreen', 2, 0.3, 8);
    this.render(dt);
    this.placeFx(dt);
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private toIdle(): void {
    this.set('idle');
    this.stT = -randRange(W.idleBetween) * this.haste * (this.phase === 2 ? 0.8 : 1);
    this.haste = 1;
  }

  private telegraph(color: number): void {
    // Aviso visible: brillo en el pecho y anillo en el suelo (EnemyBase.warnFx).
    this.warnFx(color);
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 14) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  private updateIdle(dt: number): void {
    const p = this.world.player;
    // Se mantiene a su distancia preferida, a la altura de profundidad del jugador.
    const F = this.form === 'humana' ? H : A;
    const side = Math.sign(this.x - p.x) || 1;
    const tx = Phaser.Math.Clamp(p.x + side * F.keepDistance, this.homeX - W.arenaHalfWidth, this.homeX + W.arenaHalfWidth);
    const ty = Phaser.Math.Clamp(p.y, W.band[0], W.band[1]);
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const step = Math.min(d, F.moveSpeed * dt);
      if (this.form === 'humana') {
        // Flota: no necesita suelo transitable, pero no sale de la franja.
        this.x += (dx / d) * step;
        this.y = Phaser.Math.Clamp(this.y + (dy / d) * step * 0.6, W.band[0], W.band[1]);
      } else this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.6);
    }
    this.facePlayer();
    if (this.stT < 0) return;
    if (this.pendingTransform || this.formT <= 0) {
      this.startTransform();
      return;
    }
    this.chooseAttack();
  }

  private chooseAttack(): void {
    const w: Record<string, number> = { ...(this.form === 'humana' ? H.weights : A.weights) };
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick = Object.keys(w)[0];
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) {
        pick = k;
        break;
      }
    }
    switch (pick) {
      case 'teleport':
        sfx('bruja_teleport');
        smokeFx(this.scene, this.x, this.y, 0.8);
        this.set('teleportOut');
        break;
      case 'bolts':
        sfx('bruja_risa');
        this.set('boltsWindup');
        break;
      case 'charge': {
        const extra = this.phase === 2 ? W.phase2.chargesExtra : 0;
        this.chargesLeft = Phaser.Math.Between(A.charge.count[0], A.charge.count[1]) + extra;
        this.beginChargeWindup();
        break;
      }
      case 'fire':
        sfx('bruja_fuego');
        this.set('fireWindup');
        break;
      case 'flap':
        this.set('flapWindup');
        break;
    }
  }

  /* --------------------------- Forma humana --------------------------- */

  private teleportPoint(): { x: number; y: number } {
    const p = this.world.player;
    for (let i = 0; i < 12; i++) {
      const x = this.homeX + rand(-W.arenaHalfWidth, W.arenaHalfWidth);
      const y = rand(W.band[0] + 8, W.band[1] - 8);
      if (planeDist(x, y, p.x, p.y) >= H.teleport.minPlayerDist) return { x, y };
    }
    return { x: this.homeX + (p.x < this.homeX ? 1 : -1) * W.arenaHalfWidth * 0.8, y: this.homeY };
  }

  private updateOrb(): void {
    const ox = this.x + this.facing * 20;
    const oy = this.y - this.z - 40;
    if (!this.orb) this.orb = this.scene.add.image(ox, oy, FB.glow).setTint(hexColor(WB.color)).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2);
    const k = Math.min(1, this.stT / WB.windup);
    this.orb.setPosition(ox, oy).setDepth(this.y + FX_DEPTH_BIAS).setScale(0.2 + 0.7 * k).setAlpha(0.6 + 0.4 * Math.sin(this.stT * 30));
  }

  private clearOrb(): void {
    this.orb?.destroy();
    this.orb = null;
  }

  /** Abanico de fuego fatuo hacia el jugador (ángulo medido en el plano con ry = rx / 2). */
  private fireVolley(): void {
    const p = this.world.player;
    const sx = this.x + this.facing * 18;
    const n = WB.count + (this.phase === 2 ? W.phase2.boltsExtra : 0);
    const base = Math.atan2((p.y - this.y) * 2, p.x - sx);
    const spread = Phaser.Math.DegToRad(WB.spreadDeg);
    for (let i = 0; i < n; i++) {
      const a = base + spread * (n > 1 ? i / (n - 1) - 0.5 : 0);
      this.bolts.push(new WispBolt(this.world, sx, this.y, Math.cos(a), Math.sin(a) * 0.5, this, WB.damage));
    }
    sfx('bruja_fuego');
    burst(this.scene, 'purify', sx, this.y - WB.height, this.y + FX_DEPTH_BIAS, 6);
  }

  private updateBolts(dt: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].update(dt);
      if (this.bolts[i].done) this.bolts.splice(i, 1);
    }
  }

  /* ---------------------------- Forma de ave ---------------------------- */

  private beginChargeWindup(): void {
    const p = this.world.player;
    this.chargeY = Phaser.Math.Clamp(p.y, W.band[0] + 4, W.band[1] - 4);
    // Sale del lado de la arena donde está y cruza hacia el otro.
    const fromLeft = this.x < this.homeX;
    this.chargeStartX = this.homeX + (fromLeft ? -1 : 1) * (W.arenaHalfWidth + 20);
    this.chargeDir = fromLeft ? 1 : -1;
    this.chargeFrom = { x: this.x, y: this.y, z: this.z };
    this.set('chargeWindup');
  }

  private updateChargeWindup(): void {
    const C = A.charge;
    const k = Phaser.Math.Clamp(this.stT / (C.windup * 0.6), 0, 1);
    const e = k * k * (3 - 2 * k);
    this.x = this.chargeFrom.x + (this.chargeStartX - this.chargeFrom.x) * e;
    this.y = this.chargeFrom.y + (this.chargeY - this.chargeFrom.y) * e;
    this.z = this.chargeFrom.z + (C.flyZ - this.chargeFrom.z) * e;
    this.facing = this.chargeDir;
    this.drawWarn();
    if (this.stT >= C.windup) {
      sfx('bruja_embestida');
      this.set('charge');
    }
  }

  private updateCharge(dt: number): void {
    const C = A.charge;
    const p = this.world.player;
    this.x += this.chargeDir * C.speed * dt;
    this.y = this.chargeY;
    this.z += (A.hoverZ + 4 - this.z) * Math.min(1, dt * 10);
    this.facing = this.chargeDir;
    this.drawWarn();
    if (Math.random() < dt * 30) burst(this.scene, 'dust', this.x - this.chargeDir * 30, this.y, this.y + FX_DEPTH_BIAS, 2);
    if (!this.hitDone && Math.abs(p.y - this.chargeY) < C.halfWidth + p.radius * 0.5 && Math.abs(p.x - this.x) < this.radius && !p.isDodging) {
      this.hitDone = true;
      hitPlayer(this.world, { damage: C.damage, stun: 0, kind: 'melee', sourceX: this.x - this.chargeDir * 10, knockback: C.knockback });
    }
    const end = this.homeX + this.chargeDir * (W.arenaHalfWidth + 20);
    if ((this.x - end) * this.chargeDir >= 0) {
      this.chargesLeft--;
      if (this.chargesLeft > 0) {
        this.beginChargeWindup();
        this.stT = -C.gap;
      } else {
        // Aterriza dentro de la arena y baja la guardia.
        this.x = Phaser.Math.Clamp(this.x, this.homeX - W.arenaHalfWidth, this.homeX + W.arenaHalfWidth);
        burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 16);
        this.world.shake(JUICE.shake.bossSlam.intensity * 0.5, JUICE.shake.bossSlam.ms);
        this.startVulnerable(W.vulnerableSeconds);
      }
    }
  }

  /** Franja de aviso a lo ancho de la arena en la profundidad de la embestida. */
  private drawWarn(): void {
    if (!this.warn) this.warn = this.scene.add.graphics();
    const C = A.charge;
    const g = this.warn.clear().setDepth(this.chargeY - 1.5);
    const x0 = this.homeX - W.arenaHalfWidth - 40;
    const w = W.arenaHalfWidth * 2 + 80;
    const a = this.st === 'charge' ? 0.12 : Math.floor(this.stT * 12) % 2 === 0 ? 0.38 : 0.14;
    g.fillStyle(hexColor(W.colors.fire), a).fillRect(x0, this.chargeY - C.halfWidth, w, C.halfWidth * 2);
    g.lineStyle(1, 0xc0fff0, Math.min(1, a * 2)).lineBetween(x0, this.chargeY, x0 + w, this.chargeY);
  }

  private clearWarn(): void {
    this.warn?.destroy();
    this.warn = null;
  }

  private spawnPuddles(): void {
    const p = this.world.player;
    const F = A.fire;
    for (let i = 0; i < F.count; i++) {
      const x = i === 0 ? p.x : p.x + rand(-F.spread, F.spread);
      const y = Phaser.Math.Clamp(i === 0 ? p.y : p.y + rand(-F.spread, F.spread) * 0.35, W.band[0] + 6, W.band[1] - 6);
      this.puddles.push({ x, y, t: -F.warnTime - i * 0.08, tickT: 0, gfx: this.scene.add.graphics() });
    }
    sfx('bruja_fuego');
  }

  private updatePuddles(dt: number): void {
    const F = A.fire;
    const p = this.world.player;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const P = this.puddles[i];
      P.t += dt;
      P.tickT -= dt;
      const g = P.gfx.clear().setDepth(P.y - 1.5);
      if (P.t < 0) {
        const a = Math.floor(P.t * 14) % 2 === 0 ? 0.7 : 0.25;
        g.lineStyle(1, 0xa0fff0, a).strokeEllipse(P.x, P.y, F.radius * 2, F.radius);
        g.fillStyle(hexColor(W.colors.fire), a * 0.2).fillEllipse(P.x, P.y, F.radius * 2, F.radius);
        continue;
      }
      const left = F.lifeSeconds - P.t;
      const fade = Math.min(1, left / 0.5);
      const flick = 0.8 + 0.2 * Math.sin(P.t * 18 + i);
      g.fillStyle(hexColor(W.colors.fire2), 0.3 * fade).fillEllipse(P.x, P.y, F.radius * 2.2, F.radius * 1.1);
      g.fillStyle(hexColor(W.colors.fire), 0.45 * fade * flick).fillEllipse(P.x, P.y, F.radius * 1.8, F.radius * 0.9);
      g.fillStyle(0xe0fff8, 0.5 * fade * flick).fillEllipse(P.x, P.y, F.radius * 0.8, F.radius * 0.4);
      if (Math.random() < dt * 14) burst(this.scene, 'purify', P.x + rand(-F.radius, F.radius) * 0.8, P.y - 4, P.y + FX_DEPTH_BIAS, 1);
      if (P.tickT <= 0 && planeDist(P.x, P.y, p.x, p.y) < F.radius && p.z <= F.maxPlayerZ && !p.isDodging) {
        P.tickT = F.tickSeconds;
        hitPlayer(this.world, { damage: F.damage, stun: 0, kind: 'shockwave', sourceX: P.x, knockback: F.knockback });
      }
      if (left <= 0) {
        P.gfx.destroy();
        this.puddles.splice(i, 1);
      }
    }
  }

  private updateFlap(dt: number): void {
    const F = A.flap;
    const p = this.world.player;
    const d = planeDist(this.x, this.y, p.x, p.y);
    if (d < F.radius && p.z < 30) {
      const dir = Math.sign(p.x - this.x) || this.facing;
      const k = 1 - d / F.radius;
      this.world.moveActor(p, dir * F.push * k * dt, 0);
    }
    if (Math.random() < dt * 30) burst(this.scene, 'dust', this.x + this.facing * rand(20, F.radius * 0.6), this.y + rand(-8, 8), this.y + FX_DEPTH_BIAS, 2);
    if (!this.hitDone) {
      this.hitDone = true;
      this.feathers(6);
      const ring = this.scene.add.image(this.x, this.y, FB.ring).setTint(0xd0c0a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.y - FX_DEPTH_BIAS).setDisplaySize(20, 10);
      this.scene.tweens.add({ targets: ring, displayWidth: F.radius * 2, displayHeight: F.radius, alpha: { from: 0.7, to: 0 }, duration: F.seconds * 1000, onComplete: () => ring.destroy() });
    }
    if (this.stT >= F.seconds) this.toIdle();
  }

  /** El ave es enorme: empuja al jugador fuera de su cuerpo. */
  private pushPlayer(): void {
    const p = this.world.player;
    const min = this.radius + p.radius;
    const dx = p.x - this.x;
    const dy = (p.y - this.y) * 2;
    const d = Math.hypot(dx, dy);
    if (d >= min) return;
    const nx = d > 0.01 ? dx / d : 1;
    const ny = d > 0.01 ? dy / d : 0;
    this.world.moveActor(p, nx * (min - d), ny * (min - d) * 0.5);
  }

  /* --------------------------- Transformación --------------------------- */

  private startTransform(): void {
    this.pendingTransform = false;
    this.clearOrb();
    this.clearWarn();
    if (this.st === 'vulnerable') bus.emit('boss:vulnerable', { on: false });
    this.set('transform');
    sfx('bruja_transformar');
    smokeFx(this.scene, this.x, this.y, this.form === 'humana' ? 1.2 : 1.8);
    this.feathers(W.feathers);
  }

  private updateTransform(): void {
    const half = W.transformSeconds / 2;
    if (!this.hitDone && this.stT >= half) {
      this.hitDone = true;
      this.swapForm(this.form === 'humana' ? 'ave' : 'humana');
      smokeFx(this.scene, this.x, this.y, 1.5);
      this.feathers(Math.round(W.feathers / 2));
    }
    // Encoge y crece entre el humo.
    const k = this.stT < half ? 1 - this.stT / half : (this.stT - half) / half;
    this.sprite.setAlpha(0.25 + 0.75 * Math.min(1, k));
    if (this.stT >= W.transformSeconds) {
      this.sprite.setAlpha(1);
      this.formT = W.formSeconds * (this.phase === 2 ? W.phase2FormMult : 1);
      this.toIdle();
    }
  }

  private swapForm(to: Form): void {
    if (this.form === to) return;
    const from = this.sprite;
    this.form = to;
    const human = to === 'humana';
    this.sprite = human ? this.humanSprite : this.aveSprite;
    this.kit = human ? this.humanKit : this.aveKit;
    this.hasArt = !!this.kit;
    this.fallbackTex = human ? TEX_H : TEX_A;
    this.radius = human ? H.radius : A.radius;
    this.height = human ? H.height : A.height;
    const sw = human ? H.shadowW : A.shadowW;
    this.shadowW = sw;
    if (this.shadow instanceof Phaser.GameObjects.Ellipse) this.shadow.setSize(sw, sw * 0.32);
    from.setVisible(false);
    this.sprite.setVisible(true).setAlpha(from.alpha).setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    // Si ahora es el ave y no cabe aquí, la acomoda en un punto transitable.
    if (!human && !this.world.isWalkable(this.x, this.y, this.radius)) {
      const pt = this.world.randomPointNear(this.x, this.y, 30);
      this.x = pt.x;
      this.y = pt.y;
    }
    this.play(`${this.prefix}_${human ? 'reposo' : 'caminar'}`);
    bus.emit('bruja:form', { form: to });
  }

  /** Plumas oscuras que caen girando (sin sangre). */
  private feathers(n: number): void {
    const col = hexColor(W.colors.feather);
    for (let i = 0; i < n; i++) {
      const f = this.scene.add.image(this.x + rand(-20, 20), this.y - this.z - rand(20, this.height), FB.px)
        .setTint(i % 3 ? col : hexColor(W.colors.fire)).setScale(2.4, 1).setAngle(rand(0, 180)).setDepth(this.y + FX_DEPTH_BIAS);
      this.scene.tweens.add({
        targets: f,
        x: f.x + rand(-50, 50),
        y: this.y - rand(0, 6),
        angle: f.angle + rand(-240, 240),
        alpha: 0,
        duration: rand(900, 1600),
        ease: 'Sine.easeIn',
        onComplete: () => f.destroy(),
      });
    }
  }

  /* -------------------------- Vulnerabilidad -------------------------- */

  private startVulnerable(seconds: number): void {
    this.clearOrb();
    this.clearWarn();
    this.set('vulnerable');
    this.vulnerableLeft = seconds;
    this.shieldT = 0;
    bus.emit('boss:vulnerable', { on: true });
    if (!this.told.window) {
      this.told.window = true;
      bus.emit('hud:toast', { text: '¡Bajó la guardia! Humana: LUZ · Ave: SOL · MEMORIA siempre (Q)', ms: 3000 });
    }
    this.pushHud();
  }

  private endVulnerable(): void {
    if (this.st === 'vulnerable') bus.emit('boss:vulnerable', { on: false });
    this.pushHud();
    this.toIdle();
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'calmed') return false;
    if (this.st === 'dormant') this.activate();
    if (this.st === 'transform' || this.st === 'intro' || (this.st === 'teleportOut' && this.sprite.alpha < 0.4)) return false;
    this.flashT = JUICE.flashMs / 1000;
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    const canStagger = this.st !== 'vulnerable' && this.st !== 'charge' && this.st !== 'chargeWindup';
    // Su propio fuego fatuo devuelto por el escudo: baja la guardia.
    if (hit.kind === 'projectile') {
      burst(this.scene, 'light', this.x, this.y - this.z - this.height * 0.6, this.y + FX_DEPTH_BIAS, 12);
      if (canStagger) this.startVulnerable(W.reflectStaggerSeconds);
      return true;
    }
    // Láser y golpes: solo la desgastan (chip). Al llenarse, ventana corta. Nunca la vencen.
    const L = W.laser;
    this.chip += hit.damage * L.chipPerDamage + hit.stun * L.chipPerStun;
    if (!this.told.laser && (hit.kind === 'laser-red' || hit.kind === 'laser-green')) {
      this.told.laser = true;
      bus.emit('hud:toast', { text: 'El láser apenas la desgasta: devuélvele su fuego con el escudo o usa su conjuro débil', ms: 3200 });
    }
    if (this.chip >= L.staggerAt) {
      this.chip = 0;
      if (canStagger) {
        burst(this.scene, 'stun', this.x, this.y - this.z - this.height, this.y + FX_DEPTH_BIAS, 8);
        this.startVulnerable(L.staggerSeconds);
      }
    }
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'calmed' || ev.outcome === 'fail') return false;
    const near = planeDist(this.x, this.y, ev.x, ev.y) <= W.spellRange;
    if (this.st === 'dormant') {
      if (near) this.activate();
      return false;
    }
    if (this.st === 'intro' || this.st === 'transform') return false;
    // Nivel 6: VERDAD y DESCANSO ➖ (no la apuran). FUEGO cae en "conjuro equivocado": es fuego fatuo y lo aviva.
    if (ev.spellId === 'VERDAD' || ev.spellId === 'DESCANSO') return false;
    const weak = this.form === 'humana' ? 'LUZ' : 'SOL';
    const hits = ev.spellId === 'SOL' ? inSolLine(ev, this.x, this.y, this.radius + 20) || (near && Math.abs(ev.y - this.y) < this.radius) : near;
    if (!hits) return false;
    const isMemoria = ev.spellId === 'MEMORIA';

    if (ev.spellId === weak || isMemoria) {
      if (this.shieldT > 0) {
        if (!this.told.shield) {
          this.told.shield = true;
          bus.emit('hud:toast', { text: 'Su escudo de fuego fatuo la protege un momento…', ms: 2200 });
        }
        burst(this.scene, 'purify', this.x, this.y - this.z - this.height * 0.5, this.y + FX_DEPTH_BIAS, 8);
        return false;
      }
      if (this.st === 'vulnerable') {
        const perfect = ev.outcome === 'perfect';
        this.lastPerfect = perfect;
        const mult = isMemoria ? spellParam('MEMORIA', 'bossSeal', SPELLS_FX.MEMORIA.bossSeal) : 1;
        this.seal = Math.min(W.seal.total, this.seal + Math.max(1, Math.round((perfect ? W.seal.perfect : W.seal.partial) * mult)));
        bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
        this.flashT = JUICE.flashMs / 1000;
        this.world.hitstop(JUICE.hitstopMs.spell);
        this.world.shake(JUICE.shake.red.intensity, JUICE.shake.red.ms);
        burst(this.scene, ev.spellId === 'SOL' ? 'sun' : isMemoria ? 'calm' : 'light', this.x, this.y - this.z - this.height * 0.6, this.y + FX_DEPTH_BIAS, 16);
        if (this.seal >= W.seal.total) {
          this.calm();
          return true;
        }
        if (this.phase === 1 && this.seal >= W.seal.phase2At) this.enterPhase2();
        // Su conjuro débil la obliga a cambiar de forma; MEMORIA la deja como está.
        if (!isMemoria) this.startTransform();
        this.pushHud();
        return true;
      }
      if (!isMemoria) {
        // Fuera de la ventana el conjuro débil la obliga a cambiar de forma, pero no la sella.
        if (!this.told.forced) {
          this.told.forced = true;
          bus.emit('hud:toast', { text: '¡La obligaste a cambiar de forma! séllala cuando baje la guardia', ms: 2800 });
        }
        if (this.st !== 'charge' && this.st !== 'chargeWindup') {
          this.startTransform();
          return true;
        }
        this.pendingTransform = true;
        return true;
      }
      if (!this.told.memoria) {
        this.told.memoria = true;
        bus.emit('hud:toast', { text: 'MEMORIA la alcanza cuando baja la guardia tras un ataque grande', ms: 2600 });
      }
      return false;
    }

    // Conjuro equivocado (CALMA, VOZ, PROTECCION, o LUZ/SOL de la otra forma): escudo breve y se apura.
    this.wrongSpell();
    return false;
  }

  private wrongSpell(): void {
    this.shieldT = W.wrongSpell.shieldSeconds;
    this.haste = W.wrongSpell.hasteMult;
    if (!this.told.wrong) {
      this.told.wrong = true;
      bus.emit('hud:toast', { text: '¡Se ríe del conjuro! Humana: LUZ · Ave: SOL · MEMORIA siempre', ms: 3000 });
    }
    sfx('bruja_risa');
    this.world.flash(hexColor(W.colors.fire), 120);
    if (this.st === 'vulnerable') this.endVulnerable();
    else if (this.st === 'idle' && this.stT < 0) this.stT *= W.wrongSpell.hasteMult;
  }

  private enterPhase2(): void {
    this.phase = 2;
    bus.emit('boss:phase', { phase: 2 });
    sfx('bruja_risa');
    this.world.flash(hexColor(W.colors.fire), 200);
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    bus.emit('hud:toast', { text: '¡El fuego fatuo arde más fuerte! Ya casi la liberas', ms: 2600 });
  }

  /* ------------------------------ Liberada ------------------------------ */

  private calm(): void {
    this.clearAttacks();
    this.shieldT = 0;
    bus.emit('boss:vulnerable', { on: false });
    if (this.form === 'ave') {
      smokeFx(this.scene, this.x, this.y, 2);
      this.feathers(W.feathers);
      this.swapForm('humana');
    }
    this.set('calmed');
    this._exhausted = true;
    this.sprite.setAlpha(1);
    this.setBaseTint(0xffffff);
    sfx('purificar');
    this.world.flash(0x9affc0, 300);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    updateBossBar(0, W.seal.total, W.seal.total, false);
    bus.emit('boss:calmed', {});
    purifyFx(this.scene, this.x, this.y, 1.4);
    this.scene.time.delayedCall(700, () => purifyFx(this.scene, this.x, this.y, 1));
    // Baja al suelo y queda recostada, inconsciente (sin el fuego fatuo).
    this.scene.tweens.add({ targets: this, z: 0, duration: 900, ease: 'Quad.easeOut' });
    if (!this.kit) this.scene.tweens.add({ targets: this.sprite, angle: -this.facing * 85, delay: 500, duration: 700, ease: 'Quad.easeIn' });
    const amount = Math.round(this._ecos * (this.lastPerfect ? W.perfectBonus : 1));
    this.scene.time.delayedCall(1800, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 40 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: this.lastPerfect });
      hideBossBar();
      // La mujer liberada se queda en su lugar; la entidad sale del mundo.
      const sp = this.sprite;
      const rest = this.scene.add.image(sp.x, sp.y, sp.texture.key, sp.frame.name)
        .setOrigin(sp.originX, sp.originY).setDepth(sp.depth).setFlipX(sp.flipX).setAngle(sp.angle).setScale(sp.scaleX, sp.scaleY);
      const glow = this.scene.add.image(sp.x, sp.y - 10, FB.glow).setTint(0x9affc0).setBlendMode(Phaser.BlendModes.ADD).setDepth(sp.depth - 0.1).setScale(1.6, 0.8);
      this.scene.tweens.add({ targets: glow, alpha: { from: 0.4, to: 0.1 }, duration: 1600, yoyo: true, repeat: -1 });
      void rest;
      this.leaveWorld();
    });
  }

  private clearAttacks(): void {
    this.bolts.forEach((b) => b.destroy());
    this.bolts = [];
    this.puddles.forEach((p) => p.gfx.destroy());
    this.puddles = [];
    this.clearWarn();
    this.clearOrb();
    this.volleysLeft = 0;
    this.chargesLeft = 0;
  }

  /* ------------------------------ Efectos ------------------------------ */

  /** Ojo que brilla, aura de fuego fatuo y escudo del conjuro equivocado. */
  private placeFx(dt: number): void {
    void dt;
    const F = this.form === 'humana' ? H : A;
    const top = this.y - this.z - this.bob;
    const calmed = this.st === 'calmed';
    const vuln = this.st === 'vulnerable';
    const t = this.floatT;
    const alpha = this.sprite.alpha;
    this.eye
      .setPosition(this.x + this.facing * F.eye.dx, top - F.eye.dy)
      .setTint(calmed ? 0x9affc0 : hexColor(W.colors.eyes))
      .setAlpha(calmed ? 0 : (vuln ? 0.25 : 0.7 + 0.3 * Math.sin(t * 6)) * alpha)
      .setScale(this.form === 'humana' ? 0.22 : 0.32)
      .setDepth(this.y + FX_DEPTH_BIAS);
    const dormant = this.st === 'dormant';
    this.aura
      .setPosition(this.x, top - this.height * 0.55)
      .setScale((this.radius / 16) * 2.2, (this.height / 16) * 0.9)
      .setAlpha(calmed ? 0 : (dormant ? 0.15 : vuln ? 0.12 : 0.28 + 0.1 * Math.sin(t * 9)) * alpha)
      .setDepth(this.y - 0.2);
    if (this.shieldT > 0) {
      if (!this.shieldFx) this.shieldFx = this.scene.add.image(this.x, top, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(W.colors.fire2));
      const blink = this.shieldT < 0.6 ? (Math.floor(this.shieldT * 12) % 2 ? 0.15 : 0.5) : 0.45 + 0.1 * Math.sin(t * 10);
      this.shieldFx.setPosition(this.x, top - this.height * 0.5).setDisplaySize(this.radius * 4, this.height * 1.25).setAlpha(blink).setDepth(this.y + FX_DEPTH_BIAS);
    } else if (this.shieldFx) {
      this.shieldFx.destroy();
      this.shieldFx = null;
    }
  }

  protected onDestroy(): void {
    this.clearAttacks();
    this.eye.destroy();
    this.aura.destroy();
    this.shieldFx?.destroy();
    this.shieldFx = null;
    // EnemyBase destruye el sprite actual; aquí el de la otra forma.
    (this.sprite === this.humanSprite ? this.aveSprite : this.humanSprite).destroy();
    if (this.st !== 'calmed') hideBossBar();
  }
}
