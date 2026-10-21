import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, JUICE, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import { isLunaActive } from '../systems/Luna';
import {
  EnemyBase, FB, burnFx, burst, hexColor, hitPlayer, inFuegoLine, inLuzRadius, inSolLine, inVerdadRadius, planeDist, purifyFx, rand,
  randRange, smokeFx, spellParam,
} from './EnemyBase';

/**
 * La Nahuala (jefa del Nivel 6, contratos §6). Humanoide 64×80, pivote (32, 78), kit 'nahuala'.
 * PLACEHOLDER SIMPLE (AGENTS §8.0): mujer con rebozo negro y ojos de animal.
 * - Arena en Reforma: aparece en x ± arenaHalfWidth; se activa con el jugador a < activateRadius (el director llama lockArena).
 * - COPIAS ILUSORIAS (2–4): entidades falsas (NahualaCopia, `illusion = true`) que imitan sus zarpazos; sus golpes SÍ
 *   dañan, pero se disipan al primer golpe y no dan Ecos. 'nahuala:illusion' {count}. Al invocarlas, la real se
 *   esconde entre ellas. Con Luna la real brilla y las copias se ven translúcidas.
 * - VERDAD: disipa TODAS las copias y aturde a la real (ventana). TRAMPAS de obsidiana anunciadas que estallan al
 *   pisarlas. ZARPAZO en forma semi-animal. FUEGO ❌: la cura un poco y la enfurece (aviso la primera vez).
 * - Sello: el láser (desgaste), VERDAD y LUZ en la ventana la llevan a AGOTADA. Agotada, solo CALMA la LIBERA:
 *   se arrodilla, el humo negro se va. 'boss:calmed', 'enemy:purified', ~400 Ecos (× 1.25 si el último sello fue PERFECTO).
 * Sin violencia gráfica: humo, obsidiana y luz.
 */

const W = enemiesData.nahuala;
const CP = W.copy;
const TEX = '__cb_nahuala';

type St = 'dormant' | 'intro' | 'idle' | 'clawWindup' | 'claw' | 'illusionWindup' | 'trapsWindup' | 'vulnerable' | 'exhausted' | 'calmed';

function ensureNahualaTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const c = W.colors;
  const g = scene.make.graphics({}, false);
  const reb = hexColor(c.rebozo);
  g.fillStyle(hexColor(c.hair), 1).fillRect(26, 18, 9, 30); // cabello largo
  g.fillStyle(reb, 1).fillTriangle(20, 36, 44, 36, 32, 78); // falda larga
  g.fillStyle(hexColor(c.rebozoLight), 1).fillTriangle(24, 44, 40, 44, 32, 76);
  g.fillStyle(reb, 1).fillTriangle(18, 34, 46, 34, 16, 66).fillTriangle(46, 34, 48, 64, 30, 56); // rebozo
  g.fillStyle(reb, 1).fillRect(22, 28, 22, 12);
  g.fillStyle(hexColor(c.skin), 1).fillCircle(34, 22, 7);
  g.fillStyle(reb, 1).fillTriangle(23, 27, 42, 13, 25, 9).fillRect(23, 11, 6, 17); // rebozo sobre la cabeza
  g.fillStyle(hexColor(c.skin), 1).fillRect(44, 40, 4, 6); // mano
  g.fillStyle(0xe8e0d0, 1).fillRect(48, 41, 2, 1).fillRect(48, 43, 2, 1).fillRect(48, 45, 2, 1); // uñas largas
  g.fillStyle(hexColor(c.eyes), 1).fillRect(36, 21, 2, 2).fillRect(32, 21, 1, 2);
  g.generateTexture(TEX, W.frame.w, W.frame.h);
  g.destroy();
  return TEX;
}

/* ============================ Trampa de obsidiana ============================ */

interface Trap {
  x: number;
  y: number;
  /** < 0: anuncio; ≥ 0: armada. */
  t: number;
  gfx: Phaser.GameObjects.Graphics;
}

/* ============================== Copia ilusoria ============================== */

type CopySt = 'appear' | 'stalk' | 'clawWindup' | 'claw' | 'recover';

export class NahualaCopia extends EnemyBase {
  kind: EnemyKind = 'nahuala';
  /** Es una ilusión: no da Ecos y se disipa al primer golpe. */
  readonly illusion = true;
  private st: CopySt = 'appear';
  private stT = 0;
  private hitDone = false;
  private cooldown: number;
  private life = W.illusion.lifeSeconds;
  private eye: Phaser.GameObjects.Image;
  private gone = false;
  private sideBias: 1 | -1;

  constructor(world: WorldApi, x: number, y: number, readonly owner: Nahuala) {
    super(world, x, y, {
      hp: CP.hp,
      radius: W.radius,
      height: W.height,
      ecos: 0,
      feetY: W.frame.feetY,
      frameH: W.frame.h,
      fallbackTex: ensureNahualaTexture(world.scene),
      textureKey: 'nahuala_reposo',
      shadowW: W.shadowW,
      kitId: 'nahuala',
    });
    this.group = owner.group;
    this.cooldown = randRange(CP.startDelay);
    this.sideBias = this.uid % 2 ? 1 : -1;
    this.eye = this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(W.colors.eyes)).setScale(0.2);
    this.sprite.setAlpha(0);
    this.play('nahuala_reposo');
    this.render(0);
  }

  get isAware(): boolean {
    return true;
  }

  /** Mira al jugador al aparecer. */
  facePlayerNow(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private set(st: CopySt): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<CopySt, string> = { appear: 'invocar', stalk: 'caminar', clawWindup: 'golpe', claw: 'ataque', recover: 'reposo' };
    this.play(`nahuala_${anim[st]}`);
  }

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    this.cooldown -= dt;
    this.life -= dt;
    if (this.life <= 0) return this.dissipate();
    this.stepKnockback(dt);
    switch (this.st) {
      case 'appear':
        if (this.stT >= 0.35) this.set('stalk');
        break;
      case 'stalk': {
        const dxp = p.x - this.x;
        const dyp = p.y - this.y;
        if (this.cooldown <= 0 && Math.abs(dxp) < W.claw.range + this.radius && Math.abs(dyp) < DEPTH_TOLERANCE * 0.8) {
          this.set('clawWindup');
          break;
        }
        const side = Math.sign(-dxp) || this.sideBias;
        const tx = p.x + side * (W.claw.range * 0.8 + this.radius);
        const dx = tx - this.x;
        const dy = p.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          const step = Math.min(d, CP.speed * dt);
          this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.8);
        }
        if (Math.abs(dxp) > 2) this.facing = dxp > 0 ? 1 : -1;
        break;
      }
      case 'clawWindup':
        if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(Math.floor(this.stT * 14) % 2 ? 0x402060 : 0x000000);
        if (this.stT >= W.claw.windup) this.set('claw');
        break;
      case 'claw':
        // Salto semi-animal hacia el jugador; el golpe conecta en cualquier momento del zarpazo.
        if (Math.abs(p.x - this.x) > W.claw.range * 0.6) this.world.moveActor(this, this.facing * W.claw.lunge * dt, 0);
        if (this.stT <= dt + 1e-6) clawFx(this.scene, this.x + this.facing * 24, this.y - 34, this.y, this.facing);
        if (!this.hitDone && Math.abs(p.x - this.x) < W.claw.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < W.claw.dodgeHeight && !p.isDodging) {
          this.hitDone = true;
          hitPlayer(this.world, { damage: W.claw.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: W.claw.knockback });
        }
        if (this.stT >= W.claw.active) {
          this.set('recover');
          this.stT = -W.claw.recover;
        }
        break;
      case 'recover':
        if (this.stT >= 0) {
          this.cooldown = randRange(CP.attackCooldown);
          this.set('stalk');
        }
        break;
    }
    this.separate(dt, 30);
    // Con Luna se nota que es falsa: translúcida y sin sombra animal.
    const target = this.st === 'appear' ? Math.min(1, this.stT / 0.35) : 1;
    const luna = isLunaActive();
    this.sprite.setAlpha(target * (luna ? CP.lunaAlpha : CP.alpha));
    this.shadow.setAlpha(luna ? 0.08 : 0.35);
    this.render(dt);
    const top = this.y - this.z - this.bob;
    this.eye.setPosition(this.x + this.facing * (this.kit ? W.eye.dx : 3), top - (this.kit ? W.eye.dy : 57)).setAlpha(this.sprite.alpha * 0.7).setDepth(this.y + FX_DEPTH_BIAS);
  }

  takeHit(_hit: Hit): boolean {
    if (!this._alive || this.gone) return false;
    bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
    this.dissipate();
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.gone || ev.outcome === 'fail') return false;
    // VERDAD la maneja la Nahuala (disipa todas). Los conjuros que alcanzan a la copia la deshacen.
    let hits = false;
    switch (ev.spellId) {
      case 'LUZ':
        hits = inLuzRadius(ev, this.x, this.y);
        break;
      case 'SOL':
        hits = inSolLine(ev, this.x, this.y, this.radius);
        break;
      case 'FUEGO':
        hits = inFuegoLine(ev, this.x, this.y, this.radius);
        break;
      case 'VOZ':
        hits = planeDist(this.x, this.y, ev.x, ev.y) <= spellParam('VOZ', 'stunRadius', SPELLS_FX.VOZ.stunRadius);
        break;
      case 'PROTECCION':
        hits = planeDist(this.x, this.y, ev.x, ev.y) <= SPELLS_FX.PROTECCION.pushRadius;
        break;
    }
    if (!hits) return false;
    this.dissipate();
    return true;
  }

  /** Se deshace en humo negro (sin Ecos). */
  dissipate(): void {
    if (this.gone || !this._alive) return;
    this.gone = true;
    this._exhausted = true;
    smokeFx(this.scene, this.x, this.y, 0.9);
    burst(this.scene, 'dark', this.x, this.y - 36, this.y + FX_DEPTH_BIAS, 8);
    this.owner.copyGone(this);
    this.leaveWorld();
  }

  protected onDestroy(): void {
    this.eye.destroy();
  }
}

/** Tres arañazos curvos que se desvanecen (sin sangre). */
function clawFx(scene: Phaser.Scene, x: number, y: number, depth: number, facing: number): void {
  const g = scene.add.graphics().setDepth(depth + FX_DEPTH_BIAS).setBlendMode(Phaser.BlendModes.ADD);
  g.lineStyle(2, 0xd8b0ff, 0.9);
  for (let i = 0; i < 3; i++) {
    const oy = (i - 1) * 7;
    g.beginPath();
    g.moveTo(x - facing * 12, y + oy - 8);
    g.lineTo(x, y + oy);
    g.lineTo(x + facing * 12, y + oy + 6);
    g.strokePath();
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  sfx('nahual_zarpazo');
}

/* ================================== Jefa ================================== */

export class Nahuala extends EnemyBase {
  kind: EnemyKind = 'nahuala';
  readonly illusion = false;
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
  private copies: NahualaCopia[] = [];
  private traps: Trap[] = [];
  private aura: Phaser.GameObjects.Image;
  private eye: Phaser.GameObjects.Image;
  private told = { fuego: false, calma: false, luz: false, exhausted: false, verdad: false, laser: false, luzFuera: false };

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    super(world, x, y, {
      hp: 100,
      radius: W.radius,
      height: W.height,
      ecos: W.ecos,
      feetY: W.frame.feetY,
      frameH: W.frame.h,
      fallbackTex: ensureNahualaTexture(world.scene),
      textureKey: 'nahuala_reposo',
      shadowW: W.shadowW,
      kitId: 'nahuala',
    });
    this.group = group;
    this.homeX = x;
    this.aura = this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(W.colors.luna)).setAlpha(0);
    this.eye = this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(W.colors.eyes)).setScale(0.22);
    this.play('nahuala_reposo');
    this.render(0);
    this.placeFx();
  }

  /** Copias vivas (para el director / pruebas). */
  get copyCount(): number {
    return this.copies.length;
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
      dormant: 'reposo', intro: 'invocar', idle: 'caminar', clawWindup: 'golpe', claw: 'ataque',
      illusionWindup: 'conjuro', trapsWindup: 'invocar', vulnerable: 'aturdido', exhausted: 'agotado', calmed: 'morir',
    };
    this.play(`nahuala_${anim[st]}`);
  }

  private pushHud(): void {
    updateBossBar(1 - this.seal / W.seal.total, this.seal, W.seal.total, this.st === 'vulnerable' || this.st === 'exhausted');
  }

  private activate(): void {
    if (this.st !== 'dormant') return;
    this.set('intro');
    sfx('nahuala_risa');
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    showBossBar(W.name);
    this.pushHud();
    bus.emit('boss:phase', { phase: 1 });
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    if (this.rageT > 0) this.rageT -= dt;
    this.stepKnockback(dt);

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
      case 'clawWindup':
        this.facePlayer();
        this.telegraph(0x402060);
        if (this.stT >= W.claw.windup * this.haste) this.set('claw');
        break;
      case 'claw':
        // Salto semi-animal hacia el jugador; el golpe conecta en cualquier momento del zarpazo.
        if (Math.abs(p.x - this.x) > W.claw.range * 0.6) this.world.moveActor(this, this.facing * W.claw.lunge * dt, 0);
        if (this.stT <= dt + 1e-6) clawFx(this.scene, this.x + this.facing * 24, this.y - 34, this.y, this.facing);
        if (!this.hitDone && Math.abs(p.x - this.x) < W.claw.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < W.claw.dodgeHeight && !p.isDodging) {
          this.hitDone = true;
          hitPlayer(this.world, { damage: W.claw.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: W.claw.knockback });
        }
        if (this.stT >= W.claw.active) {
          this.toIdle();
          this.stT -= W.claw.recover;
        }
        break;
      case 'illusionWindup':
        this.facePlayer();
        this.telegraph(0x301848);
        if (Math.random() < dt * 20) burst(this.scene, 'dark', this.x + rand(-20, 20), this.y - rand(10, 70), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= W.illusion.windup * this.haste) {
          this.spawnCopies();
          this.toIdle();
          this.stT = -W.illusion.afterSeconds;
        }
        break;
      case 'trapsWindup':
        this.facePlayer();
        this.telegraph(0x281838);
        if (this.stT >= W.traps.windup * this.haste) {
          this.spawnTraps();
          // Tras sembrar las trampas baja la guardia, si no la cuidan sus copias.
          if (this.copies.length === 0) this.startVulnerable(W.vulnerableSeconds);
          else this.toIdle();
        }
        break;
      case 'vulnerable':
        // Aturdida, pero sin darle la espalda al jugador (con el kit por cuadros se notaba).
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

    this.updateTraps(dt);
    if (this.st !== 'dormant' && this.st !== 'calmed') this.pushHud();
    // Humo negro que se arrastra del rebozo (más denso al lanzarse con el zarpazo).
    const hunting = this.st !== 'dormant' && this.st !== 'calmed' && this.st !== 'exhausted';
    this.trailFx(dt, hunting, this.st === 'claw' ? 'dark' : 'smoke', this.st === 'claw' ? 40 : 3, this.st === 'claw' ? 0.5 : 0.15, 10);
    this.render(dt);
    this.placeFx();
  }

  private get haste(): number {
    return this.rageT > 0 ? W.fuego.hasteMult : 1;
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private toIdle(): void {
    this.set('idle');
    this.stT = -randRange(W.idleBetween) * this.haste * (this.phase === 2 ? 0.8 : 1);
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
    const side = Math.sign(this.x - p.x) || 1;
    const tx = Phaser.Math.Clamp(p.x + side * W.keepDistance, this.homeX - W.arenaHalfWidth, this.homeX + W.arenaHalfWidth);
    const ty = Phaser.Math.Clamp(p.y, W.band[0], W.band[1]);
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const step = Math.min(d, W.moveSpeed * dt * (this.rageT > 0 ? 1.4 : 1));
      this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.7);
    }
    this.facePlayer();
    if (this.stT < 0) return;
    this.chooseAttack();
  }

  private chooseAttack(): void {
    const w: Record<string, number> = { ...W.weights };
    if (this.copies.length >= W.illusion.maxCopies) w.illusion = 0;
    if (this.traps.length >= W.traps.maxActive) w.traps = 0;
    const p = this.world.player;
    // El zarpazo solo si está cerca; si no, se acerca de un salto.
    const close = Math.abs(p.x - this.x) < W.keepDistance + 40 && Math.abs(p.y - this.y) < 40;
    if (!close) w.claw = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (total <= 0) {
      this.toIdle();
      return;
    }
    let r = Math.random() * total;
    let pick = 'claw';
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) {
        pick = k;
        break;
      }
    }
    switch (pick) {
      case 'claw':
        sfx('nahuala_risa');
        this.set('clawWindup');
        break;
      case 'illusion':
        sfx('nahuala_ilusion');
        this.set('illusionWindup');
        break;
      case 'traps':
        this.set('trapsWindup');
        break;
    }
  }

  /* ------------------------------ Copias ------------------------------ */

  private spawnCopies(): void {
    const I = W.illusion;
    const extra = this.phase === 2 ? W.phase2.copiesExtra : 0;
    const n = Math.min(Phaser.Math.Between(I.count[0], I.count[1]) + extra, I.maxCopies - this.copies.length);
    if (n <= 0) return;
    const p = this.world.player;
    // n + 1 puntos alrededor del jugador: la real toma uno al azar (se esconde entre ellas).
    const pts: Array<{ x: number; y: number }> = [];
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / (n + 1)) * Math.PI * 2;
      const x = Phaser.Math.Clamp(p.x + Math.cos(a) * I.radius, this.homeX - W.arenaHalfWidth, this.homeX + W.arenaHalfWidth);
      const y = Phaser.Math.Clamp(p.y + Math.sin(a) * I.radius * 0.5, W.band[0] + 6, W.band[1] - 6);
      pts.push(this.world.isWalkable(x, y, this.radius) ? { x, y } : this.world.randomPointNear(x, y, 24));
    }
    Phaser.Utils.Array.Shuffle(pts);
    smokeFx(this.scene, this.x, this.y, 1.1);
    const mine = pts.pop()!;
    this.x = mine.x;
    this.y = mine.y;
    smokeFx(this.scene, this.x, this.y, 0.9);
    for (const pt of pts) {
      const c = new NahualaCopia(this.world, pt.x, pt.y, this);
      c.facePlayerNow();
      this.world.add(c);
      this.copies.push(c);
      smokeFx(this.scene, pt.x, pt.y, 0.9);
    }
    this.sprite.setAlpha(0);
    this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 350 });
    bus.emit('nahuala:illusion', { count: pts.length });
    if (!this.told.verdad) {
      this.told.verdad = true;
      bus.emit('hud:toast', { text: '¡Copias! VERDAD las rompe todas · con Luna (F) la real brilla', ms: 3200 });
    }
  }

  /** La llama la copia al disiparse. */
  copyGone(c: NahualaCopia): void {
    const i = this.copies.indexOf(c);
    if (i >= 0) this.copies.splice(i, 1);
  }

  private dissipateCopies(): number {
    const n = this.copies.length;
    for (const c of [...this.copies]) c.dissipate();
    this.copies = [];
    return n;
  }

  /* ------------------------------ Trampas ------------------------------ */

  private spawnTraps(): void {
    const T = W.traps;
    const p = this.world.player;
    const n = T.count + (this.phase === 2 ? W.phase2.trapsExtra : 0);
    for (let i = 0; i < n && this.traps.length < T.maxActive; i++) {
      const x = i === 0 ? p.x : p.x + rand(-T.spread, T.spread);
      const y = Phaser.Math.Clamp(i === 0 ? p.y : p.y + rand(-T.spread, T.spread) * 0.4, W.band[0] + 6, W.band[1] - 6);
      this.traps.push({ x, y, t: -T.warnTime - i * 0.06, gfx: this.scene.add.graphics() });
    }
    sfx('nahuala_risa');
  }

  private updateTraps(dt: number): void {
    const T = W.traps;
    const p = this.world.player;
    const edge = hexColor(W.colors.obsidianEdge);
    const obs = hexColor(W.colors.obsidian);
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const tr = this.traps[i];
      tr.t += dt;
      const g = tr.gfx.clear().setDepth(tr.y - 1.5);
      if (tr.t < 0) {
        // Anuncio: el círculo se dibuja parpadeando mientras "brota" la obsidiana.
        const k = 1 + tr.t / T.warnTime;
        const a = Math.floor(tr.t * 14) % 2 === 0 ? 0.75 : 0.3;
        g.lineStyle(1, edge, a).strokeEllipse(tr.x, tr.y, T.radius * 2, T.radius);
        g.fillStyle(obs, 0.5 * Math.max(0, k)).fillEllipse(tr.x, tr.y, T.radius * 2 * Math.max(0.2, k), T.radius * Math.max(0.2, k));
        continue;
      }
      const left = T.lifeSeconds - tr.t;
      const fade = Math.min(1, left / 0.6);
      const glint = 0.5 + 0.5 * Math.sin(tr.t * 5 + i);
      g.fillStyle(obs, 0.85 * fade).fillEllipse(tr.x, tr.y, T.radius * 2, T.radius);
      g.lineStyle(1, edge, (0.4 + 0.4 * glint) * fade).strokeEllipse(tr.x, tr.y, T.radius * 2, T.radius);
      g.fillStyle(0xffffff, 0.35 * glint * fade).fillRect(tr.x - T.radius * 0.4, tr.y - 2, 4, 1);
      if (planeDist(tr.x, tr.y, p.x, p.y) < T.radius + p.radius * 0.5 && p.z <= T.maxPlayerZ && !p.isDodging) {
        this.explodeTrap(i);
        hitPlayer(this.world, { damage: T.damage, stun: 0, kind: 'shockwave', sourceX: tr.x, knockback: T.knockback });
        continue;
      }
      if (left <= 0) {
        tr.gfx.destroy();
        this.traps.splice(i, 1);
      }
    }
  }

  private explodeTrap(i: number): void {
    const tr = this.traps[i];
    sfx('nahuala_trampa');
    // Esquirlas de obsidiana que saltan (vidrio negro, sin sangre).
    for (let k = 0; k < 8; k++) {
      const s = this.scene.add.image(tr.x, tr.y - 4, FB.px).setTint(k % 2 ? hexColor(W.colors.obsidian) : hexColor(W.colors.obsidianEdge)).setScale(rand(1, 2), rand(0.6, 1.2)).setAngle(rand(0, 180)).setDepth(tr.y + FX_DEPTH_BIAS);
      this.scene.tweens.add({ targets: s, x: tr.x + rand(-40, 40), y: tr.y - rand(10, 50), angle: s.angle + rand(-200, 200), alpha: 0, duration: rand(400, 700), onComplete: () => s.destroy() });
    }
    burst(this.scene, 'dark', tr.x, tr.y - 6, tr.y + FX_DEPTH_BIAS, 10);
    this.world.shake(0.004, 100);
    tr.gfx.destroy();
    this.traps.splice(i, 1);
  }

  private clearTraps(): void {
    this.traps.forEach((t) => t.gfx.destroy());
    this.traps = [];
  }

  /* -------------------------- Vulnerabilidad -------------------------- */

  private startVulnerable(seconds: number): void {
    this.set('vulnerable');
    this.vulnerableLeft = seconds;
    bus.emit('boss:vulnerable', { on: true });
    if (!this.told.luz) {
      this.told.luz = true;
      bus.emit('hud:toast', { text: '¡Está expuesta! VERDAD o LUZ (Q) y el láser rojo la debilitan', ms: 3000 });
    }
    this.pushHud();
  }

  private endVulnerable(): void {
    if (this.st === 'vulnerable') bus.emit('boss:vulnerable', { on: false });
    this.toIdle();
  }

  private addSeal(n: number, perfect: boolean): void {
    this.lastPerfect = perfect;
    this.seal = Math.min(W.seal.total, this.seal + n);
    this.flashT = JUICE.flashMs / 1000;
    this.world.hitstop(JUICE.hitstopMs.spell);
    this.world.shake(JUICE.shake.red.intensity, JUICE.shake.red.ms);
    burst(this.scene, 'light', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 14);
    if (this.seal >= W.seal.total) {
      this.exhaust();
      return;
    }
    if (this.phase === 1 && this.seal >= W.phase2At) {
      this.phase = 2;
      bus.emit('boss:phase', { phase: 2 });
      sfx('nahuala_risa');
      this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
      bus.emit('hud:toast', { text: '¡La Nahuala se desespera! Más copias y más trampas', ms: 2600 });
    }
    this.pushHud();
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'calmed' || this.st === 'exhausted') return false;
    if (this.st === 'dormant') this.activate();
    if (this.st === 'intro') return false;
    this.flashT = JUICE.flashMs / 1000;
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    // Daño leve: desgaste que, al llenarse, avanza el sello (más rápido en la ventana).
    const L = W.laser;
    const mult = this.st === 'vulnerable' ? L.windowMult : 1;
    this.chip += (hit.damage * L.chipPerDamage + hit.stun * L.chipPerStun) * mult;
    if (!this.told.laser && hit.kind === 'laser-red' && this.st !== 'vulnerable') {
      this.told.laser = true;
      bus.emit('hud:toast', { text: 'El láser apenas la desgasta: rompe sus ilusiones con VERDAD', ms: 2800 });
    }
    if (this.chip >= L.sealAt) {
      this.chip = 0;
      const wasVulnerable = this.st === 'vulnerable';
      this.addSeal(1, false);
      if (!wasVulnerable && this._alive && !this._exhausted) this.startVulnerable(L.staggerSeconds);
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
    if (this.st === 'intro') return false;
    const perfect = ev.outcome === 'perfect';
    const sealGain = (perfect ? W.seal.perfect : W.seal.partial);
    switch (ev.spellId) {
      case 'CALMA': {
        if (!near) return false;
        if (this.st === 'exhausted') {
          this.lastPerfect = perfect || this.lastPerfect;
          this.calm(perfect);
          return true;
        }
        if (!this.told.calma) {
          this.told.calma = true;
          bus.emit('hud:toast', { text: 'Todavía no te escucha: debilítala con VERDAD, LUZ y el láser', ms: 2800 });
        }
        return false;
      }
      case 'VERDAD': {
        // VERDAD alcanza a la real (y disipa a todas las copias) dentro de su onda o cerca.
        if (this.st === 'exhausted') return false;
        if (!inVerdadRadius(ev, this.x, this.y, this.radius + 60) && !near) return false;
        const n = this.dissipateCopies();
        if (n > 0) this.world.flash(0xd8f0ff, 120);
        const bossSeal = spellParam('VERDAD', 'bossSeal', SPELLS_FX.VERDAD.bossSeal);
        if (this.st === 'vulnerable') this.addSeal(Math.max(1, Math.round(sealGain * bossSeal)), perfect);
        else {
          if (W.seal.verdadOutsideWindow > 0) this.addSeal(W.seal.verdadOutsideWindow, perfect);
          if (this._alive && !this._exhausted) {
            this.startVulnerable(spellParam('VERDAD', 'stunSeconds', W.verdadStunSeconds) * (0.6 + 0.4 * ev.power));
            this.setStars(true, 0xd8f0ff);
            this.scene.time.delayedCall(1200, () => this.setStars(false));
          }
        }
        return true;
      }
      case 'LUZ': {
        if (this.st === 'exhausted' || !inLuzRadius(ev, this.x, this.y, 'stunRadius', this.radius + 40)) return false;
        if (this.st !== 'vulnerable') {
          if (!this.told.luzFuera) {
            this.told.luzFuera = true;
            bus.emit('hud:toast', { text: 'LUZ solo la alcanza cuando está expuesta (después de VERDAD o de sembrar trampas)', ms: 3000 });
          }
          return false;
        }
        this.addSeal(sealGain, perfect);
        return true;
      }
      case 'FUEGO': {
        if (this.st === 'exhausted') return false;
        if (!inFuegoLine(ev, this.x, this.y, this.radius + 20) && !(near && Math.abs(ev.y - this.y) < this.radius)) return false;
        // ❌: el fuego la alimenta. Se cura un poco y se enfurece.
        this.seal = Math.max(0, this.seal - W.fuego.heal);
        this.rageT = W.fuego.rageSeconds;
        burnFx(this.scene, this, 600);
        sfx('nahuala_risa');
        this.world.flash(0xff6a20, 140);
        if (!this.told.fuego) {
          this.told.fuego = true;
          bus.emit('hud:toast', { text: '¡El fuego la alimenta! FUEGO no sirve contra la Nahuala', ms: 3000 });
        }
        if (this.st === 'vulnerable') this.endVulnerable();
        this.pushHud();
        return false;
      }
    }
    return false; // PROTECCION, VOZ, SOL, MEMORIA, DESCANSO: ➖
  }

  /** AGOTADA: se arrodilla; solo CALMA la libera. */
  private exhaust(): void {
    this.dissipateCopies();
    this.clearTraps();
    this.rageT = 0;
    this.set('exhausted');
    this._exhausted = true;
    this.hp = 0;
    this.z = 0;
    this.setStars(true, 0xc0a0ff);
    bus.emit('boss:vulnerable', { on: true });
    bus.emit('enemy:exhausted', { enemy: this });
    sfx('nahuala_risa');
    if (!this.told.exhausted) {
      this.told.exhausted = true;
      bus.emit('hud:toast', { text: 'Está agotada… libérala con CALMA (Q)', ms: 3600 });
    }
    if (!this.kit) this.scene.tweens.add({ targets: this.sprite, scaleY: 0.82, duration: 500, ease: 'Quad.easeOut' });
    this.pushHud();
  }

  /* ------------------------------ Liberada ------------------------------ */

  private calm(perfect: boolean): void {
    this.dissipateCopies();
    this.clearTraps();
    this.setStars(false);
    bus.emit('boss:vulnerable', { on: false });
    this.set('calmed');
    this.setBaseTint(0xffffff);
    sfx('nahuala_liberar');
    this.world.flash(0x9affc0, 300);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    updateBossBar(0, W.seal.total, W.seal.total, false);
    bus.emit('boss:calmed', {});
    // El humo negro se va hacia arriba.
    for (let i = 0; i < 6; i++) {
      this.scene.time.delayedCall(i * 120, () => {
        if (!this.sprite.active) return;
        burst(this.scene, 'smoke', this.x + rand(-12, 12), this.y - rand(20, 60), this.y + FX_DEPTH_BIAS, 4);
        burst(this.scene, 'dark', this.x + rand(-10, 10), this.y - rand(30, 70), this.y + FX_DEPTH_BIAS, 3);
      });
    }
    purifyFx(this.scene, this.x, this.y, 1.4);
    this.scene.time.delayedCall(700, () => purifyFx(this.scene, this.x, this.y, 1));
    const amount = Math.round(this._ecos * (perfect || this.lastPerfect ? W.perfectBonus : 1));
    this.scene.time.delayedCall(1800, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 40 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: perfect || this.lastPerfect });
      hideBossBar();
      // La mujer liberada se queda arrodillada en su lugar; la entidad sale del mundo.
      const sp = this.sprite;
      const rest = this.scene.add.image(sp.x, sp.y, sp.texture.key, sp.frame.name)
        .setOrigin(sp.originX, sp.originY).setDepth(sp.depth).setFlipX(sp.flipX).setScale(sp.scaleX, sp.scaleY);
      void rest;
      const glow = this.scene.add.image(sp.x, sp.y - 10, FB.glow).setTint(hexColor(W.colors.freed)).setBlendMode(Phaser.BlendModes.ADD).setDepth(sp.depth - 0.1).setScale(1.6, 0.8);
      this.scene.tweens.add({ targets: glow, alpha: { from: 0.4, to: 0.1 }, duration: 1600, yoyo: true, repeat: -1 });
      this.leaveWorld();
    });
  }

  /* ------------------------------ Efectos ------------------------------ */

  private placeFx(): void {
    const top = this.y - this.z - this.bob;
    const t = this.scene.time.now / 1000;
    const calmed = this.st === 'calmed';
    // Con Luna la real se distingue: brillo frío alrededor y ojos encendidos.
    const luna = isLunaActive() && !calmed && this.st !== 'dormant';
    const rage = this.rageT > 0;
    this.aura
      .setPosition(this.x, top - this.height * 0.55)
      .setTint(rage ? 0xff6a20 : hexColor(W.colors.luna))
      .setScale((this.radius / 16) * 2.4, (this.height / 16) * 0.95)
      .setAlpha(luna ? 0.45 + 0.15 * Math.sin(t * 6) : rage ? 0.3 : 0)
      .setDepth(this.y - 0.2);
    this.eye
      .setPosition(this.x + this.facing * (this.kit ? W.eye.dx : 3), top - (this.kit ? W.eye.dy : 57))
      .setAlpha(calmed || this.st === 'exhausted' ? 0 : (luna ? 1 : 0.7) * this.sprite.alpha)
      .setScale(luna ? 0.3 : 0.22)
      .setDepth(this.y + FX_DEPTH_BIAS);
  }

  protected onDestroy(): void {
    this.clearTraps();
    for (const c of [...this.copies]) {
      this.world.remove(c);
      c.destroy();
    }
    this.copies = [];
    this.aura.destroy();
    this.eye.destroy();
    if (this.st !== 'calmed') hideBossBar();
  }
}
