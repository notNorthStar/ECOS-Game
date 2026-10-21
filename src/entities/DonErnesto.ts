import Phaser from 'phaser';
import type { EnemyKind, Hit, LaserMode, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, JUICE } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import { laserTargets, type LaserTarget } from './LaserShot';
import { FUENTE } from '../ui/fuente';
import {
  EnemyBase, FB, burnFx, burst, fxN, hexColor, hitPlayer, inDescansoRadius, inFuegoLine, inLuzRadius, inVerdadRadius, planeDist,
  purifyFx, rand, randRange, reduceFx, smokeFx,
} from './EnemyBase';

/**
 * Don Ernesto, el Apostador (minijefe de la versión extendida, final de la avenida de Guadalajara).
 * Apostó su alma con el diablo y perdió: MÁS MONSTRUOSO que un señor común (ojos de brasa, sombra con cuernos
 * que crece cuando ataca). Cuadro 96×112, pivote (48, 110), ~100 px de alto, kit 'don_ernesto'.
 * PLACEHOLDER SIMPLE (AGENTS §8.0) si no hay kit.
 * - CARTAS ESPECTRALES en patrones "de azar" (abanico, lluvia, cruz). Las reales hieren al tocar; las FALSAS
 *   (cartas marcadas) se detienen en el aire y estallan en fuego al poco rato. VERDAD disipa TODAS las falsas
 *   y revela las reales; el láser derriba cartas (y desactiva las marcadas).
 * - RULETA: gira sobre su cabeza (mientras gira está EXPUESTO: ventana) y el palo que sale cambia el patrón:
 *   ♥ las cartas te buscan · ♠ más cartas marcadas · ♦ cartas más rápidas · ♣ el suelo arde más.
 * - FUEGO INFERNAL: zonas anunciadas en el suelo que arden unos segundos. BASTÓN ardiente de cerca.
 * - Sello (barra): VERDAD ✅ (lo aturde: ventana), LUZ ✅ y el láser (desgaste). FUEGO ❌: LO CURA y lo enfurece.
 *   Lleno el sello queda AGOTADO (de rodillas, la sombra se encoge): solo DESCANSO libera su alma.
 * - Victoria sin violencia: la sombra con cuernos se deshace hacia arriba y las cartas se vuelven luz dorada.
 * Eventos: 'boss:phase' {1|2}, 'boss:vulnerable' {on}, 'boss:calmed', 'enemy:exhausted', 'enemy:purified',
 * 'enemy:hit', 'ecos:gained', 'hud:toast', 'enemy:removed'.
 */

const E = enemiesData.don_ernesto;
const TEX = '__cb_don_ernesto';
const TEX_SHADOW = '__cb_ernesto_sombra';
const TEX_CARD = '__cb_carta';

type Suit = keyof typeof E.suits;
const SUITS = Object.keys(E.suits) as Suit[];
const SUIT_GLYPH: Record<Suit, string> = { corazones: '♥', picas: '♠', diamantes: '♦', treboles: '♣' };
const SUIT_COLOR: Record<Suit, number> = { corazones: 0xff4050, picas: 0xc060ff, diamantes: 0xffd060, treboles: 0xff7020 };

type St =
  | 'dormant' | 'intro' | 'idle' | 'cardsWindup' | 'roulette' | 'hellfireWindup' | 'caneWindup' | 'cane'
  | 'vulnerable' | 'exhausted' | 'calmed';

function ensureErnestoTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX)) return;
  const c = E.colors;
  const g = scene.make.graphics({}, false);
  const suit = hexColor(c.suit);
  const suitL = hexColor(c.suitLight);
  const skin = hexColor(c.skin);
  const eyes = hexColor(c.eyes);
  // --- Don Ernesto: apostador alto y encorvado, sombrero de ala ancha, chaleco rojo, bastón. Mira a la derecha. ---
  g.fillStyle(suit, 1).fillRect(38, 80, 8, 29).fillRect(51, 80, 8, 29);
  g.fillStyle(0x0c0806, 1).fillRect(36, 107, 11, 3).fillRect(50, 107, 12, 3);
  g.fillStyle(suit, 1).fillRoundedRect(33, 40, 32, 44, 6); // saco
  g.fillStyle(hexColor(c.vest), 1).fillRect(43, 44, 13, 30); // chaleco
  g.fillStyle(hexColor(c.band), 1).fillRect(47, 50, 2, 2).fillRect(47, 58, 2, 2).fillRect(47, 66, 2, 2); // botones
  g.fillStyle(suitL, 1).fillRect(35, 44, 6, 36);
  // Brazo con mano de garra sosteniendo cartas.
  g.fillStyle(suit, 1).fillRect(60, 46, 8, 22);
  g.fillStyle(skin, 1).fillRect(62, 66, 7, 6);
  g.fillStyle(0x201010, 1).fillTriangle(69, 66, 73, 68, 69, 69).fillTriangle(69, 70, 73, 73, 69, 72);
  g.fillStyle(hexColor(c.card), 1).fillRect(66, 58, 5, 8).fillRect(70, 56, 5, 8);
  g.fillStyle(hexColor(c.cardBack), 1).fillRect(71, 57, 3, 6);
  // Bastón.
  g.fillStyle(0x3a2014, 1).fillRect(28, 56, 3, 53);
  g.fillStyle(hexColor(c.band), 1).fillRect(26, 54, 7, 4);
  // Cabeza demacrada, cuernos que asoman bajo el sombrero, sonrisa torcida.
  g.fillStyle(skin, 1).fillRoundedRect(41, 24, 18, 18, 5);
  g.fillStyle(hexColor(c.horns), 1).fillTriangle(42, 22, 36, 8, 46, 20).fillTriangle(58, 22, 64, 8, 54, 20);
  g.fillStyle(hexColor(c.hat), 1).fillRect(30, 20, 40, 4).fillRoundedRect(38, 8, 24, 14, 3);
  g.fillStyle(hexColor(c.band), 1).fillRect(38, 17, 24, 3);
  g.fillStyle(0x120808, 1).fillRect(50, 29, 7, 4).fillRect(43, 29, 4, 4); // cuencas
  g.fillStyle(eyes, 1).fillRect(52, 30, 3, 2).fillRect(44, 30, 2, 2); // brasas
  g.fillStyle(0x200808, 1).fillRect(46, 37, 11, 1).fillRect(56, 35, 1, 2);
  g.fillStyle(0xe8e0c0, 1).fillRect(48, 37, 1, 2).fillRect(53, 37, 1, 2);
  g.generateTexture(TEX, E.frame.w, E.frame.h);
  g.clear();
  // --- Sombra con cuernos (silueta que se proyecta detrás) 120×130, pies abajo al centro. ---
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(60, 80, 64, 96);
  g.fillCircle(60, 34, 22);
  g.fillTriangle(42, 26, 22, 0, 52, 18).fillTriangle(78, 26, 98, 0, 68, 18);
  g.fillTriangle(20, 70, 6, 120, 40, 100).fillTriangle(100, 70, 114, 120, 80, 100);
  g.generateTexture(TEX_SHADOW, 120, 130);
  g.clear();
  // --- Carta espectral 8×11 (reverso rojo con borde dorado). ---
  g.fillStyle(hexColor(c.cardEdge), 1).fillRect(0, 0, 8, 11);
  g.fillStyle(hexColor(c.cardBack), 1).fillRect(1, 1, 6, 9);
  g.fillStyle(hexColor(c.cardEdge), 1).fillRect(3, 3, 2, 5);
  g.generateTexture(TEX_CARD, 8, 11);
  g.destroy();
}

interface Card {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  fake: boolean;
  /** Falsa: segundos de vuelo antes de quedarse flotando. */
  stopAt: number;
  hovering: boolean;
  fuse: number;
  t: number;
  homing: number;
  img: Phaser.GameObjects.Image;
  target: LaserTarget;
}

interface Fire {
  x: number;
  y: number;
  /** < 0 aviso; ≥ 0 arde. */
  t: number;
  tick: number;
  gfx: Phaser.GameObjects.Graphics;
}

export class DonErnesto extends EnemyBase {
  kind: EnemyKind = 'don_ernesto';
  private st: St = 'dormant';
  private stT = 0;
  private hitDone = false;
  private phase: 1 | 2 = 1;
  private seal = 0;
  private chip = 0;
  private lastPerfect = false;
  private vulnerableLeft = 0;
  private rageT = 0;
  private homeX: number;
  private suit: Suit | null = null;
  private suitLeft = 0;
  private cards: Card[] = [];
  private fires: Fire[] = [];
  private shadowFig: Phaser.GameObjects.Image;
  private eyeL: Phaser.GameObjects.Image;
  private eyeR: Phaser.GameObjects.Image;
  private wheel: Phaser.GameObjects.Graphics;
  private wheelText: Phaser.GameObjects.Text;
  private wheelAngle = 0;
  private wheelPick: Suit = 'corazones';
  private told = { fuego: false, descanso: false, exhausted: false, verdad: false, laser: false, ruleta: false };

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    ensureErnestoTextures(world.scene);
    super(world, x, y, {
      hp: 100,
      radius: E.radius,
      height: E.height,
      ecos: E.ecos,
      feetY: E.frame.feetY,
      frameH: E.frame.h,
      fallbackTex: TEX,
      textureKey: 'don_ernesto_reposo',
      shadowW: E.shadowW,
      kitId: 'don_ernesto',
    });
    this.group = group;
    this.homeX = x;
    this.facing = world.player.x >= x ? 1 : -1;
    this.shadowFig = this.scene.add.image(x, y, TEX_SHADOW).setOrigin(0.5, 1).setTint(hexColor(E.colors.shadow)).setAlpha(0.35);
    this.eyeL = this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(E.colors.eyes)).setScale(0.16);
    this.eyeR = this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(E.colors.eyes)).setScale(0.2);
    this.wheel = this.scene.add.graphics();
    this.wheelText = this.scene.add.text(x, y, '', { fontFamily: FUENTE, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0);
    this.play('don_ernesto_reposo');
    this.render(0);
    this.placeFx();
  }

  get isAware(): boolean {
    return this.st !== 'dormant';
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      dormant: 'reposo', intro: 'invocar', idle: 'caminar', cardsWindup: 'lanzar', roulette: 'conjuro', hellfireWindup: 'invocar',
      caneWindup: 'golpe', cane: 'ataque', vulnerable: 'aturdido', exhausted: 'agotado', calmed: 'purificar',
    };
    this.play(`don_ernesto_${anim[st]}`);
  }

  private pushHud(): void {
    updateBossBar(1 - this.seal / E.seal.total, this.seal, E.seal.total, this.st === 'vulnerable' || this.st === 'exhausted' || this.st === 'roulette');
  }

  private activate(): void {
    if (this.st !== 'dormant') return;
    this.set('intro');
    sfx('ernesto_risa');
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    this.world.flash(0xff4010, 160);
    showBossBar(E.name);
    this.pushHud();
    bus.emit('boss:phase', { phase: 1 });
    bus.emit('hud:toast', { text: 'Don Ernesto apuesta tu alma… VERDAD revela sus trampas', ms: 3200 });
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    if (this.rageT > 0) this.rageT -= dt;
    if (this.suit) {
      this.suitLeft -= dt;
      if (this.suitLeft <= 0) this.suit = null;
    }
    this.stepKnockback(dt);

    switch (this.st) {
      case 'dormant':
        this.facePlayer();
        if (planeDist(this.x, this.y, p.x, p.y) < E.activateRadius) this.activate();
        break;
      case 'intro':
        this.facePlayer();
        if (!reduceFx() && Math.random() < dt * 25) burst(this.scene, 'ember', this.x + rand(-24, 24), this.y - rand(0, 30), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= E.introSeconds) this.toIdle();
        break;
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'cardsWindup':
        this.facePlayer();
        this.telegraph(0x604010);
        if (Math.random() < dt * 14) burst(this.scene, 'cardSpark', this.x + this.facing * 20, this.y - 50, this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= E.cards.windup * this.haste) {
          this.throwCards();
          this.toIdle();
        }
        break;
      case 'roulette':
        this.facePlayer();
        this.updateRoulette();
        break;
      case 'hellfireWindup':
        this.facePlayer();
        this.telegraph(0x602008);
        if (Math.random() < dt * 24) burst(this.scene, 'ember', this.x + rand(-20, 20), this.y - rand(0, 20), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= E.hellfire.windup * this.haste) {
          this.spawnFires();
          this.toIdle();
        }
        break;
      case 'caneWindup':
        this.facePlayer();
        this.telegraph(0x703010);
        if (this.stT >= E.cane.windup * this.haste) this.set('cane');
        break;
      case 'cane': {
        const C = E.cane;
        if (Math.abs(p.x - this.x) > C.range * 0.6) this.world.moveActor(this, this.facing * C.lunge * dt, 0);
        if (this.stT <= dt + 1e-6) {
          burst(this.scene, 'ember', this.x + this.facing * 26, this.y - 50, this.y + FX_DEPTH_BIAS, fxN(8));
          sfx('ernesto_baston');
        }
        if (!this.hitDone && Math.abs(p.x - this.x) < C.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < C.dodgeHeight && !p.isDodging) {
          this.hitDone = true;
          hitPlayer(this.world, { damage: C.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: C.knockback });
        }
        if (this.stT >= C.active) {
          this.toIdle();
          this.stT -= C.recover;
        }
        break;
      }
      case 'vulnerable':
        // Aturdido, pero sin darle la espalda al jugador (kit por cuadros).
        this.facePlayer();
        this.vulnerableLeft -= dt;
        if (Math.random() < dt * 5) burst(this.scene, 'smoke', this.x + rand(-10, 10), this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 1);
        if (this.vulnerableLeft <= 0) this.endVulnerable();
        break;
      case 'exhausted':
        this.facePlayer();
        if (Math.random() < dt * 3) burst(this.scene, 'smoke', this.x + rand(-8, 8), this.y - 30, this.y + FX_DEPTH_BIAS, 1);
        break;
      case 'calmed':
        break;
    }

    this.updateCards(dt);
    this.updateFires(dt);
    if (this.st !== 'roulette') this.wheel.clear();
    if (this.st !== 'dormant' && this.st !== 'calmed') this.pushHud();
    // Aura de brasas y chispas que se le desprenden (más al atacar o enfurecido).
    const awake = this.st !== 'dormant' && this.st !== 'calmed';
    const hot = this.rageT > 0 || this.st === 'hellfireWindup' || this.st === 'cane';
    this.setAura(hot ? 0xff5010 : 0xa01808, awake ? (this.st === 'exhausted' ? 0.06 : hot ? 0.3 : 0.16) : 0.06, { w: 96, h: 124, dy: 0.5, pulse: 0.35 });
    this.trailFx(dt, awake && this.st !== 'exhausted', 'ember', hot ? 26 : 5, 0.2, 14);
    this.render(dt);
    this.placeFx();
  }

  private get haste(): number {
    let h = this.rageT > 0 ? E.fuego.hasteMult : 1;
    if (this.phase === 2) h *= E.phase2.hasteMult;
    return h;
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private toIdle(): void {
    this.set('idle');
    this.stT = -randRange(E.idleBetween) * this.haste;
  }

  private telegraph(color: number): void {
    this.warnFx(color);
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 14) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  private clampArena(x: number, y: number): { x: number; y: number } {
    return {
      x: Phaser.Math.Clamp(x, this.homeX - E.arenaHalfWidth, this.homeX + E.arenaHalfWidth),
      y: Phaser.Math.Clamp(y, E.band[0] + 6, E.band[1] - 6),
    };
  }

  private updateIdle(dt: number): void {
    const p = this.world.player;
    const side = Math.sign(this.x - p.x) || 1;
    const t = this.clampArena(p.x + side * E.keepDistance, p.y);
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const step = Math.min(d, E.moveSpeed * dt * (this.rageT > 0 ? 1.4 : 1));
      this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.7);
    }
    this.facePlayer();
    if (this.stT < 0) return;
    this.chooseAttack();
  }

  private chooseAttack(): void {
    const w: Record<string, number> = { ...E.weights };
    const p = this.world.player;
    const close = Math.abs(p.x - this.x) < 70 && Math.abs(p.y - this.y) < 30;
    if (!close) w.cane = 0;
    else w.cane *= 2;
    if (this.suit) w.roulette = 0;
    if (this.fires.length >= E.hellfire.max) w.hellfire = 0;
    if (this.cards.length >= E.cards.max) w.cards = 0;
    w.hellfire *= this.suit ? E.suits[this.suit].fire : 1;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (total <= 0) {
      this.toIdle();
      return;
    }
    let r = Math.random() * total;
    let pick = 'cards';
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) {
        pick = k;
        break;
      }
    }
    switch (pick) {
      case 'cards':
        sfx('ernesto_barajea');
        this.set('cardsWindup');
        break;
      case 'roulette':
        this.startRoulette();
        break;
      case 'hellfire':
        sfx('ernesto_risa');
        this.set('hellfireWindup');
        break;
      case 'cane':
        this.set('caneWindup');
        break;
    }
  }

  /* ------------------------------ Cartas ------------------------------ */

  private throwCards(): void {
    const C = E.cards;
    const p = this.world.player;
    const S = this.suit ? E.suits[this.suit] : null;
    const extra = (this.phase === 2 ? E.phase2.cardsExtra : 0) + (S?.cards ?? 0);
    const n = Math.min(C.max - this.cards.length, Phaser.Math.Between(C.count[0], C.count[1]) + extra);
    const falseRatio = C.falseRatio + (this.phase === 2 ? E.phase2.falseExtra : 0) + (S?.falseRatio ?? 0);
    const speed = C.speed * ((S as { speedMult?: number } | null)?.speedMult ?? 1);
    const homing = S?.homing ?? 0;
    // Patrón "de azar".
    const pattern = Phaser.Utils.Array.GetRandom(['abanico', 'lluvia', 'cruz'] as const);
    const base = Math.atan2((p.y - this.y) * 2, p.x - this.x);
    const spread = Phaser.Math.DegToRad(C.spreadDeg);
    sfx('ernesto_cartas');
    for (let i = 0; i < n; i++) {
      let a = base;
      let delay = 0;
      if (pattern === 'abanico') a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      else if (pattern === 'lluvia') {
        a = base + rand(-spread * 0.4, spread * 0.4);
        delay = i * 0.09;
      } else a = base + (i % 4) * (Math.PI / 2) + (i >= 4 ? Math.PI / 4 : 0); // cruz: en todas direcciones
      const fake = Math.random() < falseRatio;
      this.scene.time.delayedCall(delay * 1000, () => {
        if (!this._alive || this.st === 'exhausted' || this.st === 'calmed') return;
        this.spawnCard(a, speed, fake, homing);
      });
    }
  }

  private spawnCard(a: number, speed: number, fake: boolean, homing: number): void {
    const C = E.cards;
    const x = this.x + this.facing * 18;
    const y = this.y;
    const img = this.scene.add.image(x, y - C.z, TEX_CARD).setDepth(y + FX_DEPTH_BIAS);
    const card: Card = {
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.5, dist: 0, fake,
      stopAt: randRange(C.falseStopAfter), hovering: false, fuse: C.falseFuse, t: 0, homing, img,
      target: { x, y, radius: 6, z: C.z - 10, height: 22, onHit: (_m: LaserMode) => this.shootCard(card) },
    };
    laserTargets.add(card.target);
    this.cards.push(card);
  }

  /** El láser derriba una carta (si es marcada, la desactiva sin estallar). */
  private shootCard(c: Card): boolean {
    const i = this.cards.indexOf(c);
    if (i < 0) return false;
    burst(this.scene, 'cardSpark', c.x, c.y - E.cards.z, c.y + FX_DEPTH_BIAS, fxN(5));
    this.removeCard(i);
    return true;
  }

  private removeCard(i: number): void {
    const c = this.cards[i];
    laserTargets.delete(c.target);
    c.img.destroy();
    this.cards.splice(i, 1);
  }

  private updateCards(dt: number): void {
    const C = E.cards;
    const p = this.world.player;
    const now = this.scene.time.now / 1000;
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      c.t += dt;
      if (c.fake && !c.hovering && c.t >= c.stopAt) {
        c.hovering = true;
        c.vx = c.vy = 0;
      }
      if (c.hovering) {
        // Carta marcada: flota, late cada vez más rápido y estalla en fuego.
        c.fuse -= dt;
        const rate = 4 + (1 - c.fuse / C.falseFuse) * 18;
        const beat = 0.5 + 0.5 * Math.sin(now * rate);
        c.img.setPosition(Math.round(c.x), Math.round(c.y - C.z + Math.sin(now * 3 + i) * 2)).setScale(1 + 0.25 * beat, 1).setAngle(0)
          .setTint(beat > 0.7 ? 0xff8060 : 0xffffff);
        if (c.fuse <= 0) {
          this.explodeCard(i);
          continue;
        }
      } else {
        if (c.homing > 0) {
          const want = Math.atan2((p.y - c.y) * 2, p.x - c.x);
          const cur = Math.atan2(c.vy * 2, c.vx);
          const sp = Math.hypot(c.vx, c.vy * 2);
          const na = cur + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(want - cur), -c.homing * dt, c.homing * dt);
          c.vx = Math.cos(na) * sp;
          c.vy = Math.sin(na) * sp * 0.5;
        }
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.dist += Math.hypot(c.vx, c.vy) * dt;
        // Gira como naipe lanzado.
        c.img.setPosition(Math.round(c.x), Math.round(c.y - C.z)).setDepth(c.y + FX_DEPTH_BIAS).setScale(Math.abs(Math.cos(c.t * 14)) * 0.8 + 0.2, 1);
        if (!reduceFx() && Math.random() < dt * 10) burst(this.scene, 'cardSpark', c.x, c.y - C.z, c.y + FX_DEPTH_BIAS, 1);
        // Solo las reales hieren al tocar (las falsas son humo hasta que estallan).
        if (!c.fake && planeDist(c.x, c.y, p.x, p.y) < C.hitRadius + p.radius * 0.5 && p.z < C.z + 8 && !p.isDodging) {
          hitPlayer(this.world, { damage: C.damage, stun: 0, kind: 'projectile', sourceX: c.x, knockback: C.knockback });
          burst(this.scene, 'cardSpark', c.x, c.y - C.z, c.y + FX_DEPTH_BIAS, fxN(6));
          this.removeCard(i);
          continue;
        }
      }
      c.target.x = c.x;
      c.target.y = c.y;
      if (c.dist > C.range || c.x < this.homeX - E.arenaHalfWidth - 120 || c.x > this.homeX + E.arenaHalfWidth + 120) {
        if (c.fake && !c.hovering) {
          c.hovering = true;
          c.vx = c.vy = 0;
        } else if (!c.fake) {
          c.img.setAlpha(0);
          this.removeCard(i);
        }
      }
    }
  }

  /** La carta marcada estalla en fuego infernal (daño en radio, se esquiva saltando). */
  private explodeCard(i: number): void {
    const C = E.cards;
    const c = this.cards[i];
    const p = this.world.player;
    sfx('ernesto_estalla');
    burst(this.scene, 'ember', c.x, c.y - 10, c.y + FX_DEPTH_BIAS, fxN(14));
    burst(this.scene, 'sun', c.x, c.y - 14, c.y + FX_DEPTH_BIAS, fxN(8));
    const ring = this.scene.add.image(c.x, c.y, FB.ring).setTint(hexColor(E.colors.fire)).setBlendMode(Phaser.BlendModes.ADD).setDepth(c.y - FX_DEPTH_BIAS).setDisplaySize(8, 4);
    this.scene.tweens.add({ targets: ring, displayWidth: C.falseRadius * 2, displayHeight: C.falseRadius, alpha: { from: 1, to: 0 }, duration: 300, onComplete: () => ring.destroy() });
    if (planeDist(c.x, c.y, p.x, p.y) < C.falseRadius + p.radius * 0.5 && p.z < 14 && !p.isDodging) {
      hitPlayer(this.world, { damage: C.falseDamage, stun: 0, kind: 'shockwave', sourceX: c.x, knockback: C.falseKnockback });
    }
    this.removeCard(i);
  }

  /** VERDAD: las cartas falsas se deshacen (humo violeta) y las reales brillan un instante. */
  private revealCards(): number {
    let n = 0;
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      if (c.fake) {
        burst(this.scene, 'dark', c.x, c.y - E.cards.z, c.y + FX_DEPTH_BIAS, fxN(5));
        this.removeCard(i);
        n++;
      } else {
        c.img.setTint(0xffe070);
        const glow = this.scene.add.image(c.x, c.y - E.cards.z, FB.glow).setTint(0xffe070).setBlendMode(Phaser.BlendModes.ADD).setScale(0.4).setDepth(c.y + FX_DEPTH_BIAS);
        this.scene.tweens.add({ targets: glow, alpha: 0, scale: 1, duration: 500, onComplete: () => glow.destroy() });
      }
    }
    return n;
  }

  private clearCards(): void {
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      burst(this.scene, 'cardSpark', c.x, c.y - E.cards.z, c.y + FX_DEPTH_BIAS, 2);
      this.removeCard(i);
    }
  }

  /* ------------------------------ Ruleta ------------------------------ */

  private startRoulette(): void {
    this.set('roulette');
    this.wheelPick = Phaser.Utils.Array.GetRandom(SUITS);
    sfx('ernesto_ruleta');
    // Mientras gira la ruleta está expuesto.
    bus.emit('boss:vulnerable', { on: true });
    if (!this.told.ruleta) {
      this.told.ruleta = true;
      bus.emit('hud:toast', { text: '¡La ruleta gira! Mientras gira está expuesto', ms: 2600 });
    }
  }

  private updateRoulette(): void {
    const R = E.roulette;
    this.facePlayer();
    const k = Math.min(1, this.stT / R.spinSeconds);
    // Gira rápido y frena.
    const spin = (1 - k) * (1 - k);
    this.wheelAngle += spin * 0.6 + 0.01;
    const top = this.y - this.z - this.bob - this.height - 22;
    const g = this.wheel.clear().setDepth(this.y + FX_DEPTH_BIAS);
    const r = 15;
    const shown = k >= 1 ? this.wheelPick : SUITS[Math.floor(this.wheelAngle * 3) % SUITS.length];
    for (let i = 0; i < 8; i++) {
      const a0 = this.wheelAngle + (i / 8) * Math.PI * 2;
      const a1 = a0 + Math.PI / 4;
      g.fillStyle(i % 2 ? 0x1a0808 : 0x9a1a20, 0.85);
      g.slice(this.x, top, r, a0, a1, false).fillPath();
    }
    g.lineStyle(2, hexColor(E.colors.cardEdge), 0.95).strokeCircle(this.x, top, r);
    g.fillStyle(hexColor(E.colors.cardEdge), 1).fillTriangle(this.x - 3, top - r - 5, this.x + 3, top - r - 5, this.x, top - r + 1);
    this.wheelText
      .setText(SUIT_GLYPH[shown])
      .setColor(`#${SUIT_COLOR[shown].toString(16).padStart(6, '0')}`)
      .setPosition(this.x, top)
      .setAlpha(1)
      .setDepth(this.y + FX_DEPTH_BIAS + 0.01);
    if (k >= 1 && this.stT >= R.spinSeconds + 0.35) this.endRoulette();
  }

  private endRoulette(): void {
    const s = this.wheelPick;
    this.suit = s;
    this.suitLeft = E.roulette.suitSeconds;
    sfx('ernesto_ruleta_fin');
    bus.emit('boss:vulnerable', { on: false });
    bus.emit('hud:toast', { text: E.suits[s].label, ms: 2400 });
    burst(this.scene, 'cardSpark', this.x, this.y - this.height - 22, this.y + FX_DEPTH_BIAS, fxN(12));
    this.wheelText.setAlpha(0);
    this.toIdle();
  }

  /* ------------------------------ Fuego infernal ------------------------------ */

  private spawnFires(): void {
    const H = E.hellfire;
    const p = this.world.player;
    const n = H.count + (this.suit === 'treboles' ? 2 : 0) + (this.phase === 2 ? 1 : 0);
    for (let i = 0; i < n && this.fires.length < H.max; i++) {
      const pt = this.clampArena(i === 0 ? p.x : p.x + rand(-H.spread, H.spread), i === 0 ? p.y : p.y + rand(-H.spread, H.spread) * 0.4);
      this.fires.push({ x: pt.x, y: pt.y, t: -H.warnTime - i * 0.08, tick: 0, gfx: this.scene.add.graphics() });
    }
  }

  private updateFires(dt: number): void {
    const H = E.hellfire;
    const p = this.world.player;
    const fire = hexColor(E.colors.fire);
    const fire2 = hexColor(E.colors.fire2);
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      const g = f.gfx.clear().setDepth(f.y - 1.5);
      if (f.t < 0) {
        const a = Math.floor(f.t * 14) % 2 === 0 ? 0.8 : 0.3;
        g.lineStyle(1, fire2, a).strokeEllipse(f.x, f.y, H.radius * 2, H.radius);
        g.fillStyle(fire, 0.25 * a).fillEllipse(f.x, f.y, H.radius * 2, H.radius);
        continue;
      }
      if (f.t - dt < 0) sfx('ernesto_fuego');
      const left = H.lifeSeconds - f.t;
      const fade = Math.min(1, left / 0.5);
      const flick = reduceFx() ? 0.8 : 0.7 + 0.3 * Math.sin(f.t * 20 + i);
      g.fillStyle(0x200404, 0.5 * fade).fillEllipse(f.x, f.y, H.radius * 2.1, H.radius * 1.05);
      g.fillStyle(fire, 0.55 * fade * flick).fillEllipse(f.x, f.y - 2, H.radius * 1.8, H.radius * 0.8);
      g.fillStyle(fire2, 0.6 * fade * flick).fillEllipse(f.x, f.y - 3, H.radius, H.radius * 0.4);
      if (Math.random() < dt * (reduceFx() ? 4 : 14)) burst(this.scene, 'ember', f.x + rand(-H.radius, H.radius), f.y - 4, f.y + FX_DEPTH_BIAS, 1);
      f.tick -= dt;
      if (f.tick <= 0 && planeDist(f.x, f.y, p.x, p.y) < H.radius + p.radius * 0.4 && p.z <= H.maxPlayerZ && !p.isDodging) {
        f.tick = H.tickSeconds;
        hitPlayer(this.world, { damage: H.damage, stun: 0, kind: 'shockwave', sourceX: f.x, knockback: H.knockback });
      }
      if (left <= 0) {
        f.gfx.destroy();
        this.fires.splice(i, 1);
      }
    }
  }

  private clearFires(): void {
    this.fires.forEach((f) => f.gfx.destroy());
    this.fires = [];
  }

  /* -------------------------- Vulnerabilidad -------------------------- */

  private startVulnerable(seconds: number): void {
    if (this.st === 'roulette') this.wheelText.setAlpha(0);
    this.set('vulnerable');
    this.vulnerableLeft = seconds;
    bus.emit('boss:vulnerable', { on: true });
    this.pushHud();
  }

  private endVulnerable(): void {
    if (this.st === 'vulnerable') bus.emit('boss:vulnerable', { on: false });
    this.toIdle();
  }

  private get exposed(): boolean {
    return this.st === 'vulnerable' || this.st === 'roulette';
  }

  private addSeal(n: number, perfect: boolean): void {
    this.lastPerfect = perfect;
    this.seal = Math.min(E.seal.total, this.seal + n);
    this.flashT = JUICE.flashMs / 1000;
    this.world.hitstop(JUICE.hitstopMs.spell);
    this.world.shake(JUICE.shake.red.intensity, JUICE.shake.red.ms);
    burst(this.scene, 'light', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, fxN(14));
    if (this.seal >= E.seal.total) {
      this.exhaust();
      return;
    }
    if (this.phase === 1 && this.seal >= E.phase2At) {
      this.phase = 2;
      bus.emit('boss:phase', { phase: 2 });
      sfx('ernesto_risa');
      this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
      bus.emit('hud:toast', { text: '¡Don Ernesto sube la apuesta! Más cartas marcadas', ms: 2600 });
    }
    this.pushHud();
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'calmed' || this.st === 'exhausted') return false;
    if (this.st === 'dormant') {
      this.activate();
      return true;
    }
    if (this.st === 'intro') return false;
    this.flashT = JUICE.flashMs / 1000;
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    const L = E.laser;
    const mult = this.exposed ? L.windowMult : 1;
    this.chip += (hit.damage * L.chipPerDamage + hit.stun * L.chipPerStun) * mult;
    if (!this.told.laser && hit.kind === 'laser-red' && !this.exposed) {
      this.told.laser = true;
      bus.emit('hud:toast', { text: 'El láser apenas lo raspa: VERDAD y LUZ lo hacen perder', ms: 2800 });
    }
    if (this.chip >= L.sealAt) {
      this.chip = 0;
      const was = this.exposed;
      this.addSeal(1, false);
      if (!was && this._alive && !this._exhausted) this.startVulnerable(L.staggerSeconds);
    }
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'calmed' || ev.outcome === 'fail') return false;
    const near = planeDist(this.x, this.y, ev.x, ev.y) <= E.spellRange;
    if (this.st === 'dormant') {
      if (near) this.activate();
      return false;
    }
    if (this.st === 'intro') return false;
    const perfect = ev.outcome === 'perfect';
    const gain = perfect ? E.seal.perfect : E.seal.partial;
    switch (ev.spellId) {
      case 'VERDAD': {
        // ✅ La verdad rompe sus trampas de azar: disipa las cartas falsas y lo deja expuesto.
        if (this.st === 'exhausted' || !near) return false;
        const n = this.revealCards();
        if (n > 0) this.world.flash(0xd8f0ff, 120);
        if (!inVerdadRadius(ev, this.x, this.y, this.radius + 60) && n === 0) return false;
        if (this.exposed) this.addSeal(gain, perfect);
        else {
          this.addSeal(1, perfect);
          if (this._alive && !this._exhausted) {
            this.startVulnerable(E.verdad.stunSeconds * (0.6 + 0.4 * ev.power));
            this.setStars(true, 0xd8f0ff);
            this.scene.time.delayedCall(1200, () => this.setStars(false));
          }
        }
        if (!this.told.verdad) {
          this.told.verdad = true;
          bus.emit('hud:toast', { text: '¡Sus trampas se deshacen! LUZ y el láser lo hacen perder', ms: 2600 });
        }
        return true;
      }
      case 'LUZ': {
        // ✅
        if (this.st === 'exhausted' || !inLuzRadius(ev, this.x, this.y, 'stunRadius', this.radius + 40)) return false;
        this.addSeal(gain, perfect);
        if (this._alive && !this._exhausted && !this.exposed) this.startVulnerable(E.luz.stunSeconds);
        return true;
      }
      case 'FUEGO': {
        // ❌ El fuego infernal es suyo: lo cura y lo enfurece.
        if (this.st === 'exhausted') return false;
        if (!inFuegoLine(ev, this.x, this.y, this.radius + 20) && !(near && Math.abs(ev.y - this.y) < this.radius)) return false;
        this.seal = Math.max(0, this.seal - E.fuego.heal);
        this.rageT = E.fuego.rageSeconds;
        burnFx(this.scene, this, 700);
        sfx('ernesto_risa');
        this.world.flash(0xff4010, 160);
        if (!this.told.fuego) {
          this.told.fuego = true;
          bus.emit('hud:toast', { text: '¡El fuego lo cura! FUEGO no sirve contra Don Ernesto', ms: 3000 });
        }
        if (this.st === 'vulnerable') this.endVulnerable();
        this.pushHud();
        return false;
      }
      case 'DESCANSO': {
        if (this.st === 'exhausted' && inDescansoRadius(ev, this.x, this.y, this.radius + 40)) {
          this.calm(perfect);
          return true;
        }
        if (near && !this.told.descanso) {
          this.told.descanso = true;
          bus.emit('hud:toast', { text: 'Su alma aún está apostada: primero hazlo perder con VERDAD y LUZ', ms: 3000 });
        }
        return false;
      }
    }
    return false; // CALMA, SOL, VOZ, PROTECCION, MEMORIA, ECOS ➖
  }

  /** AGOTADO: cae de rodillas, la sombra se encoge; solo DESCANSO libera su alma. */
  private exhaust(): void {
    this.clearCards();
    this.clearFires();
    this.wheel.clear();
    this.wheelText.setAlpha(0);
    this.suit = null;
    this.rageT = 0;
    this.set('exhausted');
    this._exhausted = true;
    this.hp = 0;
    this.z = 0;
    this.setStars(true, 0xffc080);
    bus.emit('boss:vulnerable', { on: true });
    bus.emit('enemy:exhausted', { enemy: this });
    sfx('ernesto_agotado');
    smokeFx(this.scene, this.x, this.y, 1.2);
    if (!this.told.exhausted) {
      this.told.exhausted = true;
      bus.emit('hud:toast', { text: 'Perdió la apuesta… libera su alma con DESCANSO (Q)', ms: 3600 });
    }
    if (!this.kit) this.sprite.setScale(1, 0.86);
    this.pushHud();
  }

  /* ------------------------------ Liberado ------------------------------ */

  /** Victoria sin violencia: la sombra con cuernos sube y se deshace; las cartas se vuelven luz dorada. */
  private calm(perfect: boolean): void {
    this.setStars(false);
    bus.emit('boss:vulnerable', { on: false });
    this.set('calmed');
    this.setBaseTint(0xffffff);
    sfx('ernesto_liberar');
    this.world.flash(0xffe8b0, 300);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    updateBossBar(0, E.seal.total, E.seal.total, false);
    bus.emit('boss:calmed', {});
    purifyFx(this.scene, this.x, this.y, 1.4);
    // La sombra se separa hacia arriba y se desvanece.
    this.scene.tweens.add({ targets: this.shadowFig, y: this.shadowFig.y - 90, scaleX: 1.4, scaleY: 1.6, alpha: 0, duration: 1500, ease: 'Sine.easeIn' });
    // Naipes de luz que suben girando.
    for (let i = 0; i < fxN(12); i++) {
      const card = this.scene.add.image(this.x + rand(-20, 20), this.y - rand(20, 80), TEX_CARD).setTint(0xffe8b0).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.y + FX_DEPTH_BIAS);
      this.scene.tweens.add({
        targets: card, x: card.x + rand(-60, 60), y: card.y - rand(80, 160), angle: rand(-360, 360), alpha: { from: 1, to: 0 },
        delay: i * 60, duration: rand(900, 1400), ease: 'Sine.easeOut', onComplete: () => card.destroy(),
      });
    }
    burst(this.scene, 'cardSpark', this.x, this.y - 50, this.y + FX_DEPTH_BIAS, fxN(20));
    this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, delay: 900, duration: 1100 });
    const amount = Math.round(this._ecos * (perfect || this.lastPerfect ? E.perfectBonus : 1));
    this.scene.time.delayedCall(2000, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 50 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: perfect || this.lastPerfect });
      hideBossBar();
      const soul = this.scene.add.image(this.x, this.y - 40, FB.glow).setTint(hexColor(E.colors.freed)).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.y).setScale(0.5);
      this.scene.tweens.add({ targets: soul, y: soul.y - 70, alpha: { from: 1, to: 0 }, duration: 1800, onComplete: () => soul.destroy() });
      this.leaveWorld();
    });
  }

  /* ------------------------------ Efectos ------------------------------ */

  private placeFx(): void {
    const t = this.scene.time.now / 1000;
    const top = this.y - this.z - this.bob;
    const calmed = this.st === 'calmed';
    const exhausted = this.st === 'exhausted';
    const attacking = this.st === 'cardsWindup' || this.st === 'hellfireWindup' || this.st === 'caneWindup' || this.st === 'cane' || this.st === 'roulette';
    // Sombra con cuernos detrás: crece al atacar, tiembla enfurecida, se encoge agotado.
    if (!calmed) {
      const grow = exhausted ? 0.55 : attacking ? 1.12 : this.st === 'dormant' ? 0.9 : 1;
      const flick = reduceFx() ? 0 : Math.sin(t * 7 + this.uid) * 0.03;
      const shake = this.rageT > 0 && !reduceFx() ? rand(-1, 1) : 0;
      this.shadowFig
        .setPosition(Math.round(this.x - this.facing * 10 + shake), Math.round(this.y - this.z - 4))
        .setScale(grow + flick, grow + flick)
        .setFlipX(this.facing < 0)
        .setAlpha((exhausted ? 0.18 : attacking ? 0.55 : 0.38) * this.sprite.alpha)
        .setDepth(this.y - 0.4);
    }
    // Ojos de brasa.
    const glow = calmed ? 0 : exhausted ? 0.15 : attacking || this.rageT > 0 ? 1 : 0.6 + 0.25 * Math.sin(t * 5);
    if (this.kit) {
      // Pixel art de perfil: un solo ojo visible, bajo el ala del sombrero (eye.dx/dy sobre los pies).
      this.eyeR.setPosition(this.x + this.facing * E.eye.dx, top - E.eye.dy).setAlpha(glow).setDepth(this.y + FX_DEPTH_BIAS);
      this.eyeL.setAlpha(0);
    } else {
      const ey = top - 75;
      this.eyeR.setPosition(this.x + this.facing * 5, ey).setAlpha(glow).setDepth(this.y + FX_DEPTH_BIAS);
      this.eyeL.setPosition(this.x - this.facing * 2, ey).setAlpha(glow * 0.8).setDepth(this.y + FX_DEPTH_BIAS);
    }
  }

  protected onDestroy(): void {
    this.clearCards();
    this.clearFires();
    this.shadowFig.destroy();
    this.eyeL.destroy();
    this.eyeR.destroy();
    this.wheel.destroy();
    this.wheelText.destroy();
    if (this.st !== 'calmed') hideBossBar();
  }
}
