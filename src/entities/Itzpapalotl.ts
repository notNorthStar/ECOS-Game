import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH } from '../config/game';
import { FX_DEPTH_BIAS, JUICE, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import { isLunaActive } from '../systems/Luna';
import {
  EnemyBase, FB, burnFx, burst, hexColor, hitPlayer, inFuegoLine, inLuzRadius, inSolLine, planeDist, purifyFx, rand, randRange, solDamage,
} from './EnemyBase';

/**
 * ITZPAPÁLOTL (jefa final del Nivel 10, contratos §5). kitId 'itzpapalotl'; si el equipo no entregó el kit,
 * PLACEHOLDER SIMPLE (AGENTS §8.0): diosa mariposa de obsidiana, cuerpo ≤ 120 px (cuadro 96×120, pies en y = 118).
 * Las ALAS son piezas aparte (más anchas que el cuerpo) y el NÚCLEO un brillo en el pecho, ambos por código.
 *
 * CAPULLO: nace como un capullo de obsidiana que late, invulnerable e inactivo. El Director lo hace estallar con
 *   `hatch()` (o `hatchItzpapalotl(world)`), normalmente cuando cae la última Tzitzimitl. Al estallar: barra de jefe,
 *   'boss:phase' 1 e 'itzpa:core' {hits: 0, max: 3}.
 * NÚCLEO (3 golpes, 'itzpa:core' {hits, max}): SOLO ECOS lo daña y SOLO mientras está paralizada por la madre
 *   ('itzpa:stagger' {ms}, lo emite madreSign() al deletrear MAMA). Fuera de esa ventana, ECOS rebota con aviso.
 *   Cada golpe sube de fase ('boss:phase' 2 y 3): regenera alas y se vuelve más agresiva.
 * ALAS: LUZ / SOL / láser rojo / Balam las dañan. Rotas → queda más lenta (alas caídas y opacas) y la parálisis de
 *   la madre dura más. CALMA ❌ y FUEGO ❌ la refuerzan: recupera las alas y ataca de inmediato.
 *   PROTECCION ✅: bloquea el ataque en curso (deshace mariposas y cortes cercanos) y la aturde poco. Resto ➖.
 * ATAQUES: cortes/portales dimensionales en el suelo que SOLO se ven con Luna (sin Luna, un destello tenue como pista
 *   y un aviso único); mariposas de obsidiana (proyectiles visibles que persiguen); aleteo que empuja.
 * 'balam:strike' {x, y} cerca: la aturde poco y deja las alas expuestas (más daño a las alas), no el núcleo.
 * VICTORIA (3 golpes): 'boss:calmed', se quiebra en obsidiana y luz (sin violencia), 'ecos:gained' + 'enemy:purified',
 *   oculta la barra y sale del mundo.
 */

const I = enemiesData.itzpapalotl;
const TEX = '__cb_itzpapalotl';
const WING_TEX = '__cb_itzpa_ala';
const COCOON_TEX = '__cb_itzpa_capullo';
const BFLY_TEX = '__cb_itzpa_mariposa';

type St =
  | 'cocoon' | 'hatch' | 'intro' | 'idle' | 'bflyWindup' | 'flapWindup' | 'flapGust' | 'riftWindup'
  | 'stunned' | 'stagger' | 'recoil' | 'calmed';
type Phase = 1 | 2 | 3;
type Attack = 'butterflies' | 'flap' | 'rifts';

interface Butterfly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  img: Phaser.GameObjects.Image;
}

interface Rift {
  x: number;
  y: number;
  ang: number;
  t: number;
  hitDone: boolean;
  sounded: boolean;
  gfx: Phaser.GameObjects.Graphics;
}

function ensureItzpaTextures(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const c = I.colors;
  const g = scene.make.graphics({}, false);
  const body = hexColor(c.body);
  const bodyL = hexColor(c.bodyLight);
  const obs = hexColor(c.obsidian);
  const edge = hexColor(c.obsidianEdge);
  // Cuerpo (≤ 120 px): vestido largo de obsidiana con filos, torso, brazos y tocado de navajas. Mira a la derecha.
  g.fillStyle(body, 1).fillTriangle(48, 50, 26, 118, 70, 118);
  g.fillStyle(bodyL, 1).fillTriangle(48, 60, 38, 118, 58, 118);
  g.fillStyle(edge, 1);
  for (let i = 0; i < 5; i++) g.fillTriangle(27 + i * 9, 118, 32 + i * 9, 118, 29.5 + i * 9, 110);
  g.fillStyle(obs, 1).fillRoundedRect(38, 34, 20, 26, 5); // torso
  g.fillStyle(edge, 1).fillRect(38, 56, 20, 2); // cinturón
  g.fillStyle(bodyL, 1).fillRect(32, 36, 5, 22).fillRect(59, 36, 5, 16); // brazos
  g.fillStyle(hexColor(c.skin), 1).fillRect(32, 57, 5, 4).fillRect(63, 50, 6, 4); // manos (garras sugeridas)
  g.fillStyle(edge, 1).fillTriangle(69, 49, 69, 55, 75, 52);
  // Cabeza y tocado de navajas de obsidiana.
  g.fillStyle(hexColor(c.skin), 1).fillCircle(49, 24, 8);
  g.fillStyle(obs, 1).fillRect(41, 26, 16, 6); // máscara inferior
  g.fillStyle(hexColor(c.eyes), 1).fillRect(51, 22, 3, 2).fillRect(46, 22, 2, 2);
  g.fillStyle(obs, 1);
  for (let i = 0; i < 6; i++) g.fillTriangle(37 + i * 4.5, 18, 41 + i * 4.5, 18, 39 + i * 4.5, 3 + Math.abs(i - 2.5) * 2);
  g.fillStyle(edge, 1).fillRect(38, 17, 23, 2);
  g.generateTexture(TEX, I.frame.w, I.frame.h);

  // Ala derecha (se refleja para la izquierda): dos lóbulos de obsidiana con filo morado y navajas en el borde.
  g.clear();
  const W = I.wing;
  const wing = hexColor(c.wing);
  const wEdge = hexColor(c.wingEdge);
  g.fillStyle(wing, 1).fillTriangle(0, 40, 84, 4, 70, 50); // lóbulo superior
  g.fillStyle(wing, 1).fillTriangle(0, 46, 64, 52, 40, 82); // lóbulo inferior
  g.lineStyle(1, wEdge, 1).strokeTriangle(0, 40, 84, 4, 70, 50).strokeTriangle(0, 46, 64, 52, 40, 82);
  g.fillStyle(wEdge, 1);
  for (const [x, y] of [[80, 6], [74, 18], [72, 34], [56, 58], [48, 72], [40, 80]]) g.fillTriangle(x, y, x + 4, y + 2, x + 1, y + 5);
  g.fillStyle(hexColor(c.eyes), 0.9).fillCircle(44, 30, 4).fillCircle(32, 60, 3); // "ojos" de las alas
  g.generateTexture(WING_TEX, W.w, W.h);

  // Capullo de obsidiana 64×96 (origen abajo al centro).
  g.clear();
  const C = I.cocoon;
  g.fillStyle(hexColor(c.cocoon), 1).fillEllipse(32, 50, 46, 88);
  g.fillStyle(bodyL, 1).fillEllipse(26, 40, 14, 52);
  g.lineStyle(1, hexColor(c.cocoonEdge), 1).strokeEllipse(32, 50, 46, 88);
  g.lineStyle(1, hexColor(c.cocoonEdge), 0.8).lineBetween(32, 10, 28, 30).lineBetween(28, 30, 36, 52).lineBetween(36, 52, 30, 80);
  g.lineBetween(18, 40, 26, 48).lineBetween(46, 60, 38, 70);
  g.fillStyle(obs, 1).fillRect(28, 92, 8, 4);
  g.generateTexture(COCOON_TEX, C.w, C.h);

  // Mariposa de obsidiana 12×10.
  g.clear();
  g.fillStyle(hexColor(c.butterfly), 1).fillTriangle(6, 5, 0, 0, 1, 6).fillTriangle(6, 5, 12, 0, 11, 6).fillTriangle(6, 5, 2, 10, 5, 6).fillTriangle(6, 5, 10, 10, 7, 6);
  g.fillStyle(hexColor(c.butterflyEdge), 1).fillRect(5, 2, 2, 7).fillRect(0, 0, 1, 1).fillRect(11, 0, 1, 1);
  g.generateTexture(BFLY_TEX, 12, 10);
  g.destroy();
  return TEX;
}

/** Busca a Itzpapálotl en el mundo (capullo o despierta). */
export function findItzpapalotl(world: WorldApi): Itzpapalotl | null {
  for (const e of world.enemies) if (e instanceof Itzpapalotl && e.alive) return e;
  return null;
}

/** Atajo para el Director: hace estallar el capullo. Devuelve false si no hay capullo. */
export function hatchItzpapalotl(world: WorldApi): boolean {
  return findItzpapalotl(world)?.hatch() ?? false;
}

export class Itzpapalotl extends EnemyBase {
  kind: EnemyKind = 'itzpapalotl';
  /** El aviso "algo invisible te corta" sale una sola vez por partida. */
  static toldInvisible = false;
  private st: St = 'cocoon';
  private stT = 0;
  private phase: Phase = 1;
  private hits = 0;
  private wingHp: number = I.wings.hp[0];
  private wingMax: number = I.wings.hp[0];
  private wingsBroken = false;
  private wingExposedT = 0;
  private rageT = 0;
  private stunLeft = 0;
  private staggerLeft = 0;
  private lastPerfect = false;
  private bounceToastT = 0;
  private pulseT = 0;
  private flapPushT = 0;
  private flapHitDone = false;
  private butterflies: Butterfly[] = [];
  private bflyPending = 0;
  private bflyT = 0;
  private rifts: Rift[] = [];
  private riftPending = 0;
  private riftT = 0;
  private warnGfx: Phaser.GameObjects.Graphics;
  private cocoon: Phaser.GameObjects.Image;
  private cocoonGlow: Phaser.GameObjects.Image;
  private wingL: Phaser.GameObjects.Image;
  private wingR: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private told = { cocoon: false, stagger: false, wings: false, wingsBroken: false, rage: false, neutral: false, green: false };

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    super(world, x, y, {
      hp: 100,
      radius: I.radius,
      height: I.height,
      ecos: I.ecos,
      feetY: I.frame.feetY,
      frameH: I.frame.h,
      fallbackTex: ensureItzpaTextures(world.scene),
      textureKey: 'itzpapalotl_reposo',
      shadowW: I.shadowW,
      kitId: 'itzpapalotl',
    });
    this.group = group;
    const scene = this.scene;
    this.warnGfx = scene.add.graphics();
    this.cocoonGlow = scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(I.colors.cocoonEdge)).setAlpha(0.4);
    this.cocoon = scene.add.image(x, y, COCOON_TEX).setOrigin(0.5, 1);
    this.wingL = scene.add.image(x, y, WING_TEX).setOrigin(1, 0.5).setFlipX(true).setVisible(false);
    this.wingR = scene.add.image(x, y, WING_TEX).setOrigin(0, 0.5).setVisible(false);
    this.core = scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(I.colors.core)).setVisible(false);
    this.sprite.setVisible(false);
    bus.scoped(scene, 'itzpa:stagger', (ev) => this.onStagger(ev.ms));
    bus.scoped(scene, 'balam:strike', (ev) => this.onBalam(ev.x, ev.y));
    this.play('itzpapalotl_reposo');
    this.render(0);
    this.placeFx();
  }

  /* ---------------------------- Consultas ---------------------------- */

  /** Sigue siendo capullo (invulnerable). */
  get isCocoon(): boolean {
    return this.st === 'cocoon' || this.st === 'hatch';
  }
  /** Ya estalló el capullo (la barra de jefe es suya). */
  get hatched(): boolean {
    return this.st !== 'cocoon' && this.st !== 'hatch';
  }
  /** Paralizada por la madre: el núcleo acepta ECOS. */
  get staggered(): boolean {
    return this.st === 'stagger';
  }
  get coreHits(): number {
    return this.hits;
  }
  get currentPhase(): Phase {
    return this.phase;
  }
  get wingsDown(): boolean {
    return this.wingsBroken;
  }
  get isAware(): boolean {
    return this.hatched;
  }

  /* ----------------------------- Estado ----------------------------- */

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      cocoon: 'reposo', hatch: 'reposo', intro: 'invocar', idle: 'caminar', bflyWindup: 'conjuro', flapWindup: 'golpe',
      flapGust: 'ataque', riftWindup: 'lanzar', stunned: 'aturdido', stagger: 'aturdido', recoil: 'dano', calmed: 'morir',
    };
    this.play(`itzpapalotl_${anim[st]}`);
  }

  /**
   * Hace estallar el capullo (lo llama el Director, p. ej. al caer la última Tzitzimitl).
   * Devuelve false si ya no era capullo.
   */
  hatch(): boolean {
    if (!this._alive || this.st !== 'cocoon') return false;
    this.set('hatch');
    sfx('itzpa_capullo_grieta');
    return true;
  }

  private finishHatch(): void {
    sfx('capullo_estalla');
    this.world.flash(hexColor(I.colors.cocoonEdge), 260);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    // Esquirlas del capullo (obsidiana, sin violencia).
    const top = this.y - I.cocoon.h * 0.5;
    this.shards(this.x, top, 16, hexColor(I.colors.cocoon), hexColor(I.colors.cocoonEdge));
    burst(this.scene, 'dark', this.x, top, this.y + FX_DEPTH_BIAS, 24);
    this.cocoon.setVisible(false);
    this.cocoonGlow.setVisible(false);
    this.sprite.setVisible(true).setAlpha(0);
    this.wingL.setVisible(true);
    this.wingR.setVisible(true);
    this.core.setVisible(true);
    this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 400 });
    this.set('intro');
    sfx('itzpa_grito');
    showBossBar(I.name);
    this.pushHud();
    bus.emit('boss:phase', { phase: 1 });
    bus.emit('itzpa:core', { hits: 0, max: I.core.max });
  }

  private pushHud(): void {
    const max = I.core.max;
    const wingFrac = this.wingsBroken ? 0 : this.wingHp / this.wingMax;
    updateBossBar((max - this.hits - 1 + wingFrac) / max, this.hits, max, this.st === 'stagger');
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    if (this.st === 'calmed') {
      this.placeFx();
      return;
    }
    const p = this.world.player;
    this.stT += dt;
    if (this.rageT > 0) this.rageT -= dt;
    if (this.wingExposedT > 0) this.wingExposedT -= dt;
    if (this.bounceToastT > 0) this.bounceToastT -= dt;
    this.warnGfx.clear();

    switch (this.st) {
      case 'cocoon': {
        // Late: un pulso cada pulseSeconds (el sonido solo si el jugador está cerca).
        this.pulseT += dt;
        if (this.pulseT >= I.cocoon.pulseSeconds) {
          this.pulseT = 0;
          if (planeDist(this.x, this.y, p.x, p.y) < 420) sfx('capullo_late');
        }
        break;
      }
      case 'hatch':
        if (Math.random() < dt * (6 + 30 * (this.stT / I.cocoon.hatchSeconds))) {
          burst(this.scene, 'dark', this.x + rand(-18, 18), this.y - rand(10, I.cocoon.h - 6), this.y + FX_DEPTH_BIAS, 2);
        }
        this.world.shake(0.002 + 0.004 * (this.stT / I.cocoon.hatchSeconds), 60);
        if (this.stT >= I.cocoon.hatchSeconds) this.finishHatch();
        break;
      case 'intro':
        this.facePlayer();
        if (this.stT >= I.introSeconds) this.toIdle();
        break;
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'bflyWindup':
        this.facePlayer();
        this.telegraph(0x401870);
        if (this.stT >= I.butterflies.windup * this.haste) this.releaseButterflies();
        break;
      case 'flapWindup':
        this.telegraph(0x503070);
        this.drawFlapWarn();
        if (this.stT >= I.flap.windup * this.haste) this.startGust();
        break;
      case 'flapGust':
        this.updateGust(dt);
        break;
      case 'riftWindup':
        this.telegraph(0x601080);
        if (Math.random() < dt * 14) burst(this.scene, 'dark', this.x + rand(-20, 20), this.y - rand(30, 90), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= I.rifts.windup * this.haste) this.openRifts();
        break;
      case 'stunned':
        this.stunLeft -= dt;
        if (this.stunLeft <= 0) {
          this.setStars(false);
          this.toIdle();
        }
        break;
      case 'stagger':
        this.staggerLeft -= dt;
        if (Math.random() < dt * 6) burst(this.scene, 'calm', this.x + rand(-10, 10), this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 1);
        if (this.staggerLeft <= 0) this.endStagger();
        break;
      case 'recoil':
        if (Math.random() < dt * 12) burst(this.scene, 'light', this.x + rand(-12, 12), this.y - rand(30, 90), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= I.core.recoilSeconds) this.toIdle();
        break;
    }

    // Flota (salvo capullo y parálisis).
    if (this.hatched) {
      const grounded = this.st === 'stagger' || this.st === 'stunned';
      const target = grounded ? 0 : I.hoverZ + Math.sin(this.scene.time.now / 400 + this.uid) * I.bob;
      this.z += (target - this.z) * Math.min(1, dt * 6);
      this.stepKnockback(dt);
    }
    this.updateButterflySpawns(dt);
    this.updateButterflies(dt);
    this.updateRiftSpawns(dt);
    this.updateRifts(dt);
    if (this.hatched) this.pushHud();
    this.render(dt);
    this.placeFx();
  }

  /** Multiplicador de los avisos y pausas: fase, furia (❌) y alas rotas (más lenta). */
  private get haste(): number {
    let h = I.phaseHaste[this.phase - 1] ?? 1;
    if (this.rageT > 0) h *= I.rage.hasteMult;
    if (this.wingsBroken) h *= I.slowed.hasteMult;
    return h;
  }

  private get speed(): number {
    let s = I.moveSpeed;
    if (this.rageT > 0) s *= I.rage.speedMult;
    if (this.wingsBroken) s *= I.slowed.speedMult;
    return s;
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private toIdle(): void {
    this.set('idle');
    this.stT = -randRange(I.idleBetween) * this.haste;
  }

  private telegraph(color: number): void {
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 14) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  private updateIdle(dt: number): void {
    const p = this.world.player;
    const side = Math.sign(this.x - p.x) || 1;
    const tx = p.x + side * I.keepDistance;
    const dx = tx - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const step = Math.min(d, this.speed * dt);
      this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.6);
    }
    this.facePlayer();
    if (this.stT < 0) return;
    this.chooseAttack();
  }

  private chooseAttack(): void {
    const key = `phase${this.phase}` as 'phase1' | 'phase2' | 'phase3';
    const w: Record<Attack, number> = { ...I.weights[key] };
    if (this.butterflies.length > 6) w.butterflies = 0;
    if (this.rifts.length > 0) w.rifts = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (total <= 0) {
      this.toIdle();
      return;
    }
    let r = Math.random() * total;
    let pick: Attack = 'flap';
    for (const [k, v] of Object.entries(w) as Array<[Attack, number]>) {
      r -= v;
      if (r <= 0 && v > 0) {
        pick = k;
        break;
      }
    }
    this.startAttack(pick);
  }

  private startAttack(a: Attack): void {
    switch (a) {
      case 'butterflies':
        this.set('bflyWindup');
        break;
      case 'flap':
        this.set('flapWindup');
        break;
      case 'rifts':
        this.set('riftWindup');
        break;
    }
  }

  /** Cancela el ataque que preparaba (no lo ya lanzado). */
  private cancelAttack(): void {
    this.warnGfx.clear();
    this.flapPushT = 0;
  }

  /* ------------------------------ Mariposas de obsidiana ------------------------------ */

  private get extra(): number {
    return I.phaseExtra[this.phase - 1] ?? 0;
  }

  private releaseButterflies(): void {
    this.bflyPending = Phaser.Math.Between(I.butterflies.count[0], I.butterflies.count[1]) + this.extra;
    this.bflyT = 0;
    sfx('itzpa_mariposas');
    this.toIdle();
  }

  private updateButterflySpawns(dt: number): void {
    if (this.bflyPending <= 0) return;
    this.bflyT -= dt;
    if (this.bflyT > 0) return;
    const B = I.butterflies;
    this.bflyPending--;
    this.bflyT = B.gap;
    const p = this.world.player;
    const a = Math.atan2((p.y - this.y) * 2, p.x - this.x) + rand(-1.2, 1.2);
    const x = this.x + this.facing * 16;
    const y = this.y;
    const img = this.scene.add.image(x, y - B.z, BFLY_TEX).setDepth(y);
    this.butterflies.push({ x, y, vx: Math.cos(a) * B.speed, vy: Math.sin(a) * B.speed * 0.5, life: B.lifeSeconds, img });
    burst(this.scene, 'dark', x, y - B.z, y + FX_DEPTH_BIAS, 3);
  }

  private updateButterflies(dt: number): void {
    const B = I.butterflies;
    const p = this.world.player;
    const t = this.scene.time.now / 1000;
    for (let i = this.butterflies.length - 1; i >= 0; i--) {
      const b = this.butterflies[i];
      b.life -= dt;
      // Gira hacia el jugador (en el plano: y pesa el doble).
      const want = Math.atan2((p.y - b.y) * 2, p.x - b.x);
      const cur = Math.atan2(b.vy * 2, b.vx);
      const diff = Phaser.Math.Angle.Wrap(want - cur);
      const na = cur + Phaser.Math.Clamp(diff, -B.turn * dt, B.turn * dt);
      b.vx = Math.cos(na) * B.speed;
      b.vy = Math.sin(na) * B.speed * 0.5;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const flutter = Math.sin(t * 22 + i);
      b.img.setPosition(Math.round(b.x), Math.round(b.y - B.z + Math.sin(t * 6 + i) * 2)).setDepth(b.y).setScale(0.6 + 0.4 * Math.abs(flutter), 1).setFlipX(b.vx < 0);
      if (b.life < 0.5) b.img.setAlpha(Math.max(0, b.life / 0.5));
      let gone = b.life <= 0;
      if (!gone && planeDist(b.x, b.y, p.x, p.y) < B.hitRadius + p.radius * 0.5 && p.z < B.z + 8 && !p.isDodging) {
        hitPlayer(this.world, { damage: B.damage, stun: 0, kind: 'projectile', sourceX: b.x, knockback: B.knockback });
        burst(this.scene, 'dark', b.x, b.y - B.z, b.y + FX_DEPTH_BIAS, 6);
        gone = true;
      }
      if (gone) {
        b.img.destroy();
        this.butterflies.splice(i, 1);
      }
    }
  }

  private clearButterflies(near?: { x: number; y: number; r: number }): number {
    let n = 0;
    for (let i = this.butterflies.length - 1; i >= 0; i--) {
      const b = this.butterflies[i];
      if (near && planeDist(b.x, b.y, near.x, near.y) > near.r) continue;
      burst(this.scene, 'light', b.x, b.y - I.butterflies.z, b.y + FX_DEPTH_BIAS, 3);
      b.img.destroy();
      this.butterflies.splice(i, 1);
      n++;
    }
    if (!near) this.bflyPending = 0;
    return n;
  }

  /* ------------------------------ Aleteo ------------------------------ */

  private drawFlapWarn(): void {
    const F = I.flap;
    const k = Math.min(1, this.stT / (F.windup * this.haste));
    const color = hexColor(I.colors.flap);
    const a = Math.floor(this.stT * 12) % 2 === 0 ? 0.6 : 0.3;
    const g = this.warnGfx.setDepth(DEPTH.shadow + 1);
    g.lineStyle(1, color, a).strokeEllipse(this.x, this.y, F.radius * 2, F.radius);
    g.lineStyle(2, color, 0.7).strokeEllipse(this.x, this.y, F.radius * 2 * k, F.radius * k);
  }

  private startGust(): void {
    this.set('flapGust');
    this.flapPushT = I.flap.seconds;
    this.flapHitDone = false;
    sfx('itzpa_aleteo');
    this.world.shake(0.006, 240);
    const F = I.flap;
    const g = this.scene.add.graphics().setDepth(DEPTH.shadow + 1);
    const color = hexColor(I.colors.flap);
    const cx = this.x;
    const cy = this.y;
    const o = { k: 0 };
    this.scene.tweens.add({
      targets: o, k: 1, duration: F.seconds * 1000,
      onUpdate: () => g.clear().lineStyle(4, color, 0.8 * (1 - o.k)).strokeEllipse(cx, cy, F.radius * 2 * o.k, F.radius * o.k),
      onComplete: () => g.destroy(),
    });
  }

  private updateGust(dt: number): void {
    const F = I.flap;
    const p = this.world.player;
    this.flapPushT -= dt;
    if (Math.random() < dt * 40) burst(this.scene, 'calm', this.x + rand(-40, 40), this.y - rand(20, 90), this.y + FX_DEPTH_BIAS, 1);
    const d = planeDist(this.x, this.y, p.x, p.y);
    if (d <= F.radius && !p.isDodging) {
      const dx = p.x - this.x;
      const dy = (p.y - this.y) * 2;
      const n = Math.hypot(dx, dy) || 1;
      const fall = 1 - d / F.radius;
      this.world.moveActor(p, (dx / n) * F.push * (0.4 + 0.6 * fall) * dt, (dy / n) * F.push * 0.3 * fall * dt);
      if (!this.flapHitDone && d <= F.damageRadius + p.radius && p.z < 20) {
        this.flapHitDone = true;
        hitPlayer(this.world, { damage: F.damage, stun: 0, kind: 'shockwave', sourceX: this.x, knockback: F.knockback });
      }
    }
    if (this.flapPushT <= 0) this.toIdle();
  }

  /* ------------------------------ Cortes dimensionales (Luna) ------------------------------ */

  private openRifts(): void {
    this.riftPending = Phaser.Math.Between(I.rifts.count[0], I.rifts.count[1]) + this.extra;
    this.riftT = 0;
    this.toIdle();
  }

  private updateRiftSpawns(dt: number): void {
    if (this.riftPending <= 0) return;
    this.riftT -= dt;
    if (this.riftT > 0) return;
    const R = I.rifts;
    const p = this.world.player;
    const first = this.rifts.length === 0;
    this.riftPending--;
    this.riftT = R.gap;
    const a = Math.random() * Math.PI * 2;
    const d = first ? 0 : rand(R.length * 0.4, R.spread);
    let x = p.x + Math.cos(a) * d;
    let y = p.y + Math.sin(a) * d * 0.5;
    if (!this.world.isWalkable(x, y, 4)) ({ x, y } = this.world.randomPointNear(p.x, p.y, R.spread * 0.5));
    this.rifts.push({ x, y, ang: rand(-0.6, 0.6) + (Math.random() < 0.5 ? 0 : Math.PI / 2), t: 0, hitDone: false, sounded: false, gfx: this.scene.add.graphics() });
  }

  /** Distancia del jugador al corte, en el plano (y pesa el doble). */
  private riftDist(r: Rift, px: number, py: number): number {
    const R = I.rifts;
    const hx = Math.cos(r.ang) * R.length * 0.5;
    const hy = Math.sin(r.ang) * R.length * 0.25;
    const ax = r.x - hx;
    const ay = (r.y - hy) * 2;
    const bx = r.x + hx;
    const by = (r.y + hy) * 2;
    const qx = px;
    const qy = py * 2;
    const vx = bx - ax;
    const vy = by - ay;
    const L = vx * vx + vy * vy || 1;
    const k = Phaser.Math.Clamp(((qx - ax) * vx + (qy - ay) * vy) / L, 0, 1);
    return Math.hypot(qx - (ax + vx * k), qy - (ay + vy * k));
  }

  private updateRifts(dt: number): void {
    const R = I.rifts;
    const p = this.world.player;
    const luna = isLunaActive();
    const color = hexColor(I.colors.rift);
    for (let i = this.rifts.length - 1; i >= 0; i--) {
      const r = this.rifts[i];
      r.t += dt;
      const hx = Math.cos(r.ang) * R.length * 0.5;
      const hy = Math.sin(r.ang) * R.length * 0.25;
      const g = r.gfx.clear().setDepth(DEPTH.shadow + 1);
      const warn = r.t < R.warnSeconds;
      const k = Math.min(1, r.t / R.warnSeconds);
      // Sin Luna: solo un destello tenue al final del aviso y durante el corte (pista para activar Luna).
      const hint = !luna && (k > 0.6 || !warn) ? R.hintAlpha * (0.5 + 0.5 * Math.abs(Math.sin(r.t * 20))) : 0;
      const vis = luna ? 1 : hint;
      if (warn) {
        if (vis > 0) {
          // Portal: una grieta morada que se abre en el suelo.
          const a = (Math.floor(r.t * 12) % 2 === 0 ? 0.8 : 0.45) * vis;
          g.fillStyle(color, 0.15 * vis).fillEllipse(r.x, r.y, R.length * k, R.length * 0.3 * k);
          g.lineStyle(1, color, a).lineBetween(r.x - hx * k, r.y - hy * k, r.x + hx * k, r.y + hy * k);
        }
        continue;
      }
      if (!r.sounded) {
        r.sounded = true;
        if (luna) sfx('itzpa_corte');
      }
      if (vis > 0) {
        const flick = 0.75 + 0.25 * Math.sin(r.t * 50);
        g.lineStyle(R.halfWidth * 1.5, color, 0.35 * vis * flick).lineBetween(r.x - hx, r.y - hy, r.x + hx, r.y + hy);
        g.lineStyle(2, 0xffffff, 0.9 * vis).lineBetween(r.x - hx, r.y - hy, r.x + hx, r.y + hy);
        if (luna && Math.random() < dt * 20) burst(this.scene, 'dark', r.x + rand(-hx, hx), r.y - 4, r.y + FX_DEPTH_BIAS, 1);
      }
      if (!r.hitDone && this.riftDist(r, p.x, p.y) < R.halfWidth * 2 + p.radius && p.z < R.maxPlayerZ && !p.isDodging) {
        r.hitDone = true;
        if (hitPlayer(this.world, { damage: R.damage, stun: 0, kind: 'projectile', sourceX: r.x, knockback: R.knockback })) {
          if (!luna && !Itzpapalotl.toldInvisible) {
            Itzpapalotl.toldInvisible = true;
            bus.emit('hud:toast', { text: 'Algo invisible te corta. Pulsa F (Luna) para ver los portales y esquivarlos.', ms: 4200 });
          }
        }
      }
      if (r.t >= R.warnSeconds + R.activeSeconds) {
        r.gfx.destroy();
        this.rifts.splice(i, 1);
      }
    }
  }

  private clearRifts(near?: { x: number; y: number; r: number }): void {
    for (let i = this.rifts.length - 1; i >= 0; i--) {
      const r = this.rifts[i];
      if (near && planeDist(r.x, r.y, near.x, near.y) > near.r) continue;
      r.gfx.destroy();
      this.rifts.splice(i, 1);
    }
    if (!near) this.riftPending = 0;
  }

  /* ------------------------------ Parálisis (MAMA) y núcleo (ECOS) ------------------------------ */

  /** 'itzpa:stagger' {ms}: la madre la paraliza (madreSign). Única ventana para ECOS al núcleo. */
  private onStagger(ms: number): void {
    if (!this._alive || !this.hatched || this.st === 'calmed') return;
    const secs = (Math.max(ms, I.stagger.minMs) / 1000) * (this.wingsBroken ? I.slowed.staggerMult : 1);
    const was = this.st === 'stagger';
    this.cancelAttack();
    this.clearRifts();
    this.clearButterflies();
    this.setStars(true, hexColor(I.colors.coreOpen));
    this.set('stagger');
    this.staggerLeft = Math.max(was ? this.staggerLeft : 0, secs);
    if (!was) {
      bus.emit('boss:vulnerable', { on: true });
      this.world.flash(0xfff0d0, 140);
    }
    if (!this.told.stagger) {
      this.told.stagger = true;
      bus.emit('hud:toast', { text: '¡Tu madre la detuvo! Golpea su núcleo con ECOS (Q)', ms: 3200 });
    }
    this.pushHud();
  }

  private endStagger(): void {
    this.setStars(false);
    bus.emit('boss:vulnerable', { on: false });
    this.toIdle();
  }

  private coreHit(perfect: boolean): void {
    this.lastPerfect = perfect || this.lastPerfect;
    this.hits = Math.min(I.core.max, this.hits + 1);
    this.setStars(false);
    bus.emit('boss:vulnerable', { on: false });
    bus.emit('itzpa:core', { hits: this.hits, max: I.core.max });
    this.flashT = JUICE.flashMs / 1000;
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    this.world.flash(hexColor(I.colors.coreOpen), 200);
    const c = this.corePos();
    burst(this.scene, 'light', c.x, c.y, this.y + FX_DEPTH_BIAS, 24);
    this.shards(c.x, c.y, 8, hexColor(I.colors.obsidian), hexColor(I.colors.coreOpen));
    if (this.hits >= I.core.max) {
      this.calm();
      return;
    }
    // Nueva fase: alas nuevas (más fuertes) y más agresiva.
    this.phase = (this.hits + 1) as Phase;
    bus.emit('boss:phase', { phase: this.phase });
    this.wingMax = I.wings.hp[this.phase - 1] ?? this.wingMax;
    this.wingHp = this.wingMax;
    this.wingsBroken = false;
    this.set('recoil');
    bus.emit('hud:toast', { text: this.phase === 2 ? '¡El núcleo se agrieta! Le crecen alas nuevas' : '¡Un golpe más! Está desesperada', ms: 2600 });
    this.pushHud();
  }

  private corePos(): { x: number; y: number } {
    return { x: this.x + this.facing * 2, y: this.y - this.z - this.bob - I.frame.feetY + 46 };
  }

  /* ------------------------------ Alas ------------------------------ */

  private damageWings(n: number, perfect = false): void {
    if (n <= 0) return;
    this.lastPerfect = perfect || this.lastPerfect;
    if (this.wingsBroken) {
      if (!this.told.wingsBroken) {
        this.told.wingsBroken = true;
        bus.emit('hud:toast', { text: 'Sus alas ya están rotas: deletrea MAMA y golpea el núcleo con ECOS', ms: 3200 });
      }
      return;
    }
    const mult = this.wingExposedT > 0 ? I.wings.exposedMult : 1;
    this.wingHp = Math.max(0, this.wingHp - n * mult);
    burst(this.scene, 'dark', this.x + rand(-40, 40), this.y - this.z - I.wing.offsetY, this.y + FX_DEPTH_BIAS, 4);
    if (this.wingHp <= 0) this.breakWings();
    this.pushHud();
  }

  private breakWings(): void {
    this.wingsBroken = true;
    sfx('itzpa_alas_rotas');
    this.world.shake(JUICE.shake.red.intensity * 2, JUICE.shake.red.ms * 2);
    this.world.flash(hexColor(I.colors.wingEdge), 140);
    for (const w of [this.wingL, this.wingR]) this.shards(w.x + (w === this.wingL ? -30 : 30), w.y, 8, hexColor(I.colors.wing), hexColor(I.colors.wingEdge));
    if (!this.told.wings) {
      this.told.wings = true;
      bus.emit('hud:toast', { text: '¡Sus alas se quiebran! Está más lenta. Ahora: MAMA y luego ECOS', ms: 3400 });
    }
  }

  /** CALMA ❌ / FUEGO ❌: recupera las alas y ataca de inmediato. */
  private enrage(spell: string): void {
    this.wingHp = this.wingMax;
    this.wingsBroken = false;
    this.rageT = I.rage.seconds;
    sfx('itzpa_furia');
    this.world.flash(hexColor(I.colors.rift), 140);
    burst(this.scene, 'dark', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 18);
    if (!this.told.rage) {
      this.told.rage = true;
      bus.emit('hud:toast', { text: `¡${spell} la fortalece! Sus alas se recuperan`, ms: 3000 });
    }
    if (this.st !== 'stagger' && this.st !== 'recoil' && this.st !== 'intro') {
      this.cancelAttack();
      this.setStars(false);
      this.startAttack('flap');
    }
    this.pushHud();
  }

  /* ------------------------------ Aturdir ------------------------------ */

  private stun(seconds: number): void {
    if (this.st === 'stagger' || this.st === 'recoil' || this.st === 'intro' || this.isCocoon || this.st === 'calmed') return;
    const was = this.st === 'stunned';
    this.cancelAttack();
    if (!was) {
      this.set('stunned');
      this.setStars(true);
      burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 5);
    }
    this.stunLeft = Math.max(was ? this.stunLeft : 0, seconds);
  }

  private onBalam(x: number, y: number): void {
    if (!this._alive || !this.hatched || this.st === 'calmed') return;
    if (planeDist(this.x, this.y, x, y) > I.balam.radius) return;
    this.wingExposedT = I.wings.exposedSeconds;
    this.stun(I.balam.stunSeconds);
  }

  /* ------------------------------ Golpes y conjuros ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'calmed') return false;
    if (this.isCocoon) {
      // El capullo es invulnerable: el golpe rebota.
      burst(this.scene, 'dark', this.x, this.y - I.cocoon.h * 0.5, this.y + FX_DEPTH_BIAS, 3);
      if (!this.told.cocoon) {
        this.told.cocoon = true;
        bus.emit('hud:toast', { text: 'El capullo de obsidiana es invulnerable', ms: 2400 });
      }
      return false;
    }
    if (this.st === 'intro') return false;
    this.flashT = JUICE.flashMs / 1000;
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (hit.kind === 'laser-green') {
      // ➖ El verde no la aturde.
      if (!this.told.green) {
        this.told.green = true;
        bus.emit('hud:toast', { text: 'El láser verde no la detiene: rompe sus alas con LUZ, SOL o el rojo', ms: 3000 });
      }
      return true;
    }
    const mult = hit.kind === 'laser-red' ? I.wings.laserRedMult : I.wings.balamMult;
    this.damageWings(hit.damage * mult);
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'calmed' || ev.outcome === 'fail') return false;
    if (this.isCocoon) return false; // capullo: nada le hace (y durante la liberación se lanza ECOS cerca)
    const perfect = ev.outcome === 'perfect';
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    const near = planeDist(this.x, this.y, ev.x, ev.y) <= I.spellRange;
    switch (ev.spellId) {
      case 'ECOS': {
        if (!near) return false;
        if (this.st === 'stagger') {
          this.coreHit(perfect);
          return true;
        }
        // Fuera de la ventana: rebota.
        const c = this.corePos();
        burst(this.scene, 'dark', c.x, c.y, this.y + FX_DEPTH_BIAS, 10);
        sfx('itzpa_rebote');
        if (this.bounceToastT <= 0) {
          this.bounceToastT = 5;
          bus.emit('hud:toast', { text: 'Necesitas que tu madre la detenga: deletrea MAMA', ms: 3000 });
        }
        return false;
      }
      case 'LUZ': {
        if (!inLuzRadius(ev, this.x, this.y, 'stunRadius', this.radius + 40)) return false;
        burst(this.scene, 'light', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 14);
        this.flashT = JUICE.flashMs / 1000;
        this.world.hitstop(JUICE.hitstopMs.spell);
        bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
        this.damageWings(I.wings.luz * Math.max(0.3, power), perfect);
        return true;
      }
      case 'SOL': {
        if (!inSolLine(ev, this.x, this.y, this.radius + 10)) return false;
        burst(this.scene, 'sun', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 14);
        this.flashT = JUICE.flashMs / 1000;
        this.world.hitstop(JUICE.hitstopMs.spell);
        bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
        this.damageWings(solDamage(ev) * I.wings.solMult, perfect);
        return true;
      }
      case 'PROTECCION': {
        // ✅ Bloquea: deshace mariposas y cortes alrededor del jugador y, si está cerca, la aturde poco.
        const P = I.proteccion;
        const cx = ev.x + ev.facing * SPELLS_FX.PROTECCION.forward;
        const n = this.clearButterflies({ x: cx, y: ev.y, r: P.radius });
        this.clearRifts({ x: cx, y: ev.y, r: P.radius });
        const close = planeDist(this.x, this.y, cx, ev.y) <= P.radius + this.radius;
        if (close) {
          this.stun(P.stunSeconds * (0.6 + 0.4 * power));
          burst(this.scene, 'light', this.x, this.y - this.height * 0.5, this.y + FX_DEPTH_BIAS, 10);
        }
        if (n > 0 || close) sfx('itzpa_bloqueo');
        return n > 0 || close;
      }
      case 'CALMA': {
        if (!near) return false;
        this.enrage('CALMA');
        return false;
      }
      case 'FUEGO': {
        if (!inFuegoLine(ev, this.x, this.y, this.radius + 10)) return false;
        burnFx(this.scene, this, 400);
        this.enrage('FUEGO');
        return false;
      }
    }
    // ➖ VOZ, MEMORIA, VERDAD, DESCANSO, MAMA (MAMA la detiene vía madreSign → 'itzpa:stagger', no aquí).
    if (!this.told.neutral && ev.spellId !== 'MAMA' && planeDist(this.x, this.y, ev.x, ev.y) <= 260) {
      this.told.neutral = true;
      bus.emit('hud:toast', { text: `${ev.spellId} no le hace nada a Itzpapálotl`, ms: 2400 });
    }
    return false;
  }

  /* ------------------------------ Victoria ------------------------------ */

  /** Tercer golpe al núcleo: se quiebra en obsidiana y luz (sin violencia). */
  private calm(): void {
    this.clearButterflies();
    this.clearRifts();
    this.cancelAttack();
    this.setStars(false);
    this.rageT = 0;
    bus.emit('boss:vulnerable', { on: false });
    this.set('calmed');
    this._exhausted = true;
    this.hp = 0;
    sfx('itzpa_cae');
    this.world.flash(hexColor(I.colors.freed), 320);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    updateBossBar(0, I.core.max, I.core.max, false);
    bus.emit('boss:calmed', {});
    const ms = I.calmSeconds * 1000;
    // Las alas se desprenden y se deshacen en esquirlas; el cuerpo se vuelve luz.
    for (const w of [this.wingL, this.wingR]) {
      const dir = w === this.wingL ? -1 : 1;
      this.scene.tweens.add({ targets: w, y: w.y + 40, x: w.x + dir * 20, angle: dir * 30, alpha: 0, duration: ms * 0.7, ease: 'Quad.easeIn' });
    }
    this.setBaseTint(0xfff8e0);
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: ms, ease: 'Quad.easeIn' });
    this.scene.tweens.add({ targets: [this.core, this.shadow], alpha: 0, duration: ms });
    for (let i = 0; i < 8; i++) {
      this.scene.time.delayedCall((i * ms) / 8, () => {
        if (!this._alive) return;
        this.shards(this.x + rand(-20, 20), this.y - rand(20, this.height), 4, hexColor(I.colors.obsidian), hexColor(I.colors.obsidianEdge));
        burst(this.scene, 'light', this.x + rand(-16, 16), this.y - rand(20, this.height), this.y + FX_DEPTH_BIAS, 4);
      });
    }
    const amount = Math.round(this._ecos * (this.lastPerfect ? I.perfectBonus : 1));
    this.scene.time.delayedCall(ms, () => {
      if (!this._alive) return;
      purifyFx(this.scene, this.x, this.y, 1.4);
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 50 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: this.lastPerfect });
      hideBossBar();
      this.leaveWorld();
    });
  }

  /* ------------------------------ Efectos ------------------------------ */

  /** Esquirlas de obsidiana que saltan y se desvanecen (sin sangre). */
  private shards(x: number, y: number, n: number, c1: number, c2: number): void {
    for (let k = 0; k < n; k++) {
      const s = this.scene.add.image(x, y, FB.px).setTint(k % 3 ? c1 : c2)
        .setScale(rand(0.8, 1.8), rand(0.6, 1.2)).setAngle(rand(0, 180)).setDepth(this.y + FX_DEPTH_BIAS);
      this.scene.tweens.add({
        targets: s, x: x + rand(-60, 60), y: this.y - rand(0, 12), angle: s.angle + rand(-300, 300),
        duration: rand(450, 800), ease: 'Quad.easeIn',
        onComplete: () => this.scene.tweens.add({ targets: s, alpha: 0, duration: 500, onComplete: () => s.destroy() }),
      });
    }
  }

  private placeFx(): void {
    const t = this.scene.time.now / 1000;
    if (this.isCocoon) {
      // El capullo late (escala y brillo).
      const beat = Math.pow(Math.max(0, Math.sin((t / I.cocoon.pulseSeconds) * Math.PI * 2)), 6);
      const shake = this.st === 'hatch' ? rand(-1.5, 1.5) * (1 + this.stT) : 0;
      this.cocoon.setPosition(Math.round(this.x + shake), Math.round(this.y)).setScale(1 + 0.05 * beat, 1 + 0.03 * beat).setDepth(this.y);
      // Al estallar parpadea en morado.
      if (this.st === 'hatch' && Math.floor(this.stT * 10) % 2 === 0) this.cocoon.setTintMode(Phaser.TintModes.FILL).setTint(hexColor(I.colors.cocoonEdge));
      else this.cocoon.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffffff);
      this.cocoonGlow.setPosition(this.x, this.y - I.cocoon.h * 0.5).setScale(2 + 0.6 * beat, 3 + 0.8 * beat).setAlpha(0.25 + 0.45 * beat).setDepth(this.y - 0.1);
      return;
    }
    const calmed = this.st === 'calmed';
    const top = this.y - this.z - this.bob;
    // Alas: aleteo suave; rápido al aletear; caídas y opacas si están rotas.
    if (!calmed) {
      const gust = this.st === 'flapGust';
      const windup = this.st === 'flapWindup';
      const speed = gust ? 30 : windup ? 4 : this.wingsBroken ? 2 : 5;
      const amp = gust ? 0.45 : this.wingsBroken ? 0.05 : 0.15;
      const intro = this.st === 'intro' ? Math.min(1, this.stT / (I.introSeconds * 0.6)) : 1;
      const sx = (windup ? 1.15 : 0.9 + amp * Math.sin(t * speed)) * intro * (this.wingsBroken ? 0.75 : 1);
      const droop = this.wingsBroken ? 28 : this.st === 'stagger' ? 12 : 0;
      const tint = this.wingsBroken ? hexColor(I.colors.wingBroken) : this.wingExposedT > 0 ? 0xffd0ff : this.rageT > 0 ? 0xffa0c0 : 0xffffff;
      const ay = top - I.wing.offsetY;
      this.wingL.setPosition(Math.round(this.x - I.wing.offsetX), Math.round(ay)).setScale(sx, 1).setAngle(-droop).setTint(tint).setAlpha(this.wingsBroken ? 0.6 : 1).setDepth(this.y - 0.2);
      this.wingR.setPosition(Math.round(this.x + I.wing.offsetX), Math.round(ay)).setScale(sx, 1).setAngle(droop).setTint(tint).setAlpha(this.wingsBroken ? 0.6 : 1).setDepth(this.y - 0.2);
    }
    // Núcleo: brillo en el pecho; abierto (dorado, grande) durante la parálisis.
    const c = this.corePos();
    const open = this.st === 'stagger';
    this.core
      .setPosition(c.x, c.y)
      .setTint(open ? hexColor(I.colors.coreOpen) : hexColor(I.colors.core))
      .setScale(open ? 0.9 + 0.25 * Math.sin(t * 10) : 0.35 + 0.05 * Math.sin(t * 3))
      .setDepth(this.y + 0.1);
    if (!calmed) this.core.setAlpha(open ? 0.95 : 0.55);
  }

  protected onDestroy(): void {
    this.clearButterflies();
    this.clearRifts();
    this.warnGfx.destroy();
    this.cocoon.destroy();
    this.cocoonGlow.destroy();
    this.wingL.destroy();
    this.wingR.destroy();
    this.core.destroy();
    if (this.st !== 'calmed' && this.hatched) hideBossBar();
  }
}
