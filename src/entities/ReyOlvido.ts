import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH, DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, JUICE, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import {
  EnemyBase, FB, burnFx, burst, fuegoDamage, hexColor, hitPlayer, inFuegoLine, inLuzRadius, inMemoriaRadius, inSolLine, inVerdadRadius,
  planeDist, powerScale, purifyFx, rand, randRange, smokeFx, solDamage, spellParam,
} from './EnemyBase';

/**
 * EL REY DEL OLVIDO (jefe del Nivel 7, contratos §5). kitId 'rey_olvido'; si el equipo no entregó el kit,
 * PLACEHOLDER SIMPLE (AGENTS §8.0): humanoide imponente (~88 px con la corona, cuadro 96×96, pies en y = 94),
 * túnica oscura y capa. La CORONA se dibuja aparte (brilla, se agrieta y se rompe) para que se lea siempre.
 *
 * - Se activa con el jugador a < activateRadius (el director llama lockArena). Barra de jefe como los demás.
 * - CORONA con vida propia ('rey:crown' {hp, max, broken}). Solo SOL o FUEGO la dañan, y solo en su VENTANA
 *   (la corona brilla naranja): tras su rayo, con el grito de la Llorona, VERDAD o al desgastarlo con el láser.
 *   Rota → 'boss:phase' 2 y el Rey queda VULNERABLE.
 * - SELLO: con la corona rota, MEMORIA en la ventana lo avanza (✅ el olvido contra la memoria). Lleno → 'boss:calmed':
 *   cae inconsciente (sin violencia), ~600 Ecos. Fase 3 ('boss:phase' 3) al llegar a phase3At.
 * - CALMA ❌: lo enfurece (ataque inmediato + cura leve de corona o sello). LUZ ➖. VERDAD disipa los clones y lo
 *   aturde un momento. Láser: daño reducido (casi nada con la corona intacta); al acumularse lo tambalea (ventana).
 * - ATAQUES (todos anunciados): pulso mental (anillo morado ~1 s) → 'controls:invert' {on:true, ms}; rayo de la corona
 *   en el carril del jugador (se esquiva saltando o con la esquiva: respeta maxPlayerZ); ondas al suelo saltables;
 *   clones de memoria (siluetas translúcidas que atacan cuerpo a cuerpo y se disipan con un golpe, VERDAD o el grito).
 * - Escucha 'llorona:scream' {x, y}: cerca lo aturde y abre ventana; disipa los clones en radio.
 */

const R = enemiesData.rey_olvido;
const CL = R.clone;
const TEX = '__cb_rey_olvido';
const CROWN_TEX = '__cb_rey_corona';

type St =
  | 'dormant' | 'intro' | 'idle' | 'pulseWindup' | 'beamWindup' | 'beamFire' | 'wavesWindup' | 'clonesWindup'
  | 'window' | 'crownBreak' | 'calmed';
type Phase = 1 | 2 | 3;
type Attack = 'pulse' | 'beam' | 'waves' | 'clones';

function ensureReyTextures(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const c = R.colors;
  const g = scene.make.graphics({}, false);
  const robe = hexColor(c.robe);
  const robeL = hexColor(c.robeLight);
  const cape = hexColor(c.cape);
  const lining = hexColor(c.capeLining);
  // Capa (detrás): amplia, cae de los hombros al suelo.
  g.fillStyle(cape, 1).fillTriangle(30, 28, 66, 28, 14, 94).fillTriangle(30, 28, 66, 28, 82, 94).fillRect(30, 28, 36, 66);
  g.fillStyle(lining, 1).fillTriangle(16, 92, 24, 60, 26, 94).fillTriangle(80, 92, 72, 60, 70, 94);
  // Túnica.
  g.fillStyle(robe, 1).fillRect(36, 30, 26, 64);
  g.fillStyle(robeL, 1).fillRect(46, 34, 6, 60);
  g.fillStyle(hexColor(c.gem), 1).fillRect(36, 56, 26, 3);
  // Hombreras.
  g.fillStyle(robeL, 1).fillRoundedRect(28, 26, 42, 10, 4);
  // Brazo con cetro (mira a la derecha).
  g.fillStyle(robe, 1).fillRect(60, 34, 9, 18);
  g.fillStyle(0x6a5a40, 1).fillRect(70, 26, 3, 68);
  g.fillStyle(hexColor(c.gem), 1).fillCircle(71, 24, 4);
  g.fillStyle(0xf0d0ff, 1).fillRect(70, 22, 2, 2);
  g.fillStyle(hexColor(c.skin), 1).fillRect(66, 48, 6, 5);
  // Cabeza (la corona va aparte).
  g.fillStyle(hexColor(c.skin), 1).fillCircle(50, 20, 8);
  g.fillStyle(robe, 1).fillRect(42, 24, 16, 5); // barba / cuello alto
  g.fillStyle(hexColor(c.eyes), 1).fillRect(53, 19, 2, 2).fillRect(48, 19, 2, 2);
  g.generateTexture(TEX, R.frame.w, R.frame.h);

  // Corona 22×12 (origen abajo al centro): banda dorada, cinco picos y gema.
  g.clear();
  const gold = hexColor(c.crown);
  g.fillStyle(gold, 1).fillRect(1, 7, 20, 5);
  g.fillTriangle(1, 8, 5, 8, 2, 1).fillTriangle(6, 8, 10, 8, 7, 2).fillTriangle(9, 8, 13, 8, 11, 0);
  g.fillTriangle(12, 8, 16, 8, 15, 2).fillTriangle(17, 8, 21, 8, 20, 1);
  g.fillStyle(0xfff4c0, 1).fillRect(2, 8, 18, 1);
  g.fillStyle(hexColor(c.gem), 1).fillRect(9, 8, 4, 3);
  g.generateTexture(CROWN_TEX, 22, 12);
  g.destroy();
  return TEX;
}

/* ============================== Clon de memoria ============================== */

type CloneSt = 'appear' | 'stalk' | 'windup' | 'strike' | 'recover';

/** Silueta translúcida del Rey: ataca cuerpo a cuerpo y se disipa con un golpe, VERDAD o el grito de la Llorona. */
export class ReyClon extends EnemyBase {
  kind: EnemyKind = 'rey_olvido';
  /** Es una ilusión: no da Ecos. */
  readonly illusion = true;
  private st: CloneSt = 'appear';
  private stT = 0;
  private hitDone = false;
  private cooldown = randRange(CL.startDelay);
  private life = CL.lifeSeconds;
  private gone = false;
  private sideBias: 1 | -1;

  constructor(world: WorldApi, x: number, y: number, readonly owner: ReyOlvido) {
    super(world, x, y, {
      hp: CL.hp,
      radius: R.radius,
      height: R.height,
      ecos: 0,
      feetY: R.frame.feetY,
      frameH: R.frame.h,
      fallbackTex: ensureReyTextures(world.scene),
      textureKey: 'rey_olvido_reposo',
      shadowW: R.shadowW,
      kitId: 'rey_olvido',
    });
    this.group = owner.group;
    this.sideBias = this.uid % 2 ? 1 : -1;
    this.setBaseTint(hexColor(R.colors.clone));
    this.sprite.setAlpha(0);
    this.facePlayer();
    this.play('rey_olvido_reposo');
    this.render(0);
  }

  get isAware(): boolean {
    return true;
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private set(st: CloneSt): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<CloneSt, string> = { appear: 'invocar', stalk: 'caminar', windup: 'golpe', strike: 'ataque', recover: 'reposo' };
    this.play(`rey_olvido_${anim[st]}`);
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
        if (this.stT >= 0.4) this.set('stalk');
        break;
      case 'stalk': {
        const dxp = p.x - this.x;
        const dyp = p.y - this.y;
        if (this.cooldown <= 0 && Math.abs(dxp) < CL.range + this.radius && Math.abs(dyp) < DEPTH_TOLERANCE * 0.8) {
          this.set('windup');
          break;
        }
        const side = Math.sign(-dxp) || this.sideBias;
        const tx = p.x + side * (CL.range * 0.8 + this.radius);
        const dx = tx - this.x;
        const dy = p.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          const step = Math.min(d, CL.speed * dt);
          this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.8);
        }
        this.facePlayer();
        break;
      }
      case 'windup':
        this.facePlayer();
        if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(Math.floor(this.stT * 14) % 2 ? 0x502080 : 0x000000);
        if (this.stT >= CL.windup) this.set('strike');
        break;
      case 'strike':
        if (Math.abs(p.x - this.x) > CL.range * 0.6) this.world.moveActor(this, this.facing * CL.lunge * dt, 0);
        if (this.stT <= dt + 1e-6) burst(this.scene, 'dark', this.x + this.facing * 22, this.y - 40, this.y + FX_DEPTH_BIAS, 8);
        if (!this.hitDone && Math.abs(p.x - this.x) < CL.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < CL.dodgeHeight && !p.isDodging) {
          this.hitDone = true;
          hitPlayer(this.world, { damage: CL.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: CL.knockback });
        }
        if (this.stT >= CL.active) {
          this.set('recover');
          this.stT = -CL.recover;
        }
        break;
      case 'recover':
        if (this.stT >= 0) {
          this.cooldown = randRange(CL.attackCooldown);
          this.set('stalk');
        }
        break;
    }
    this.separate(dt, 30);
    const k = this.st === 'appear' ? Math.min(1, this.stT / 0.4) : 1;
    // Parpadea un poco: se nota que es un recuerdo, no el Rey.
    const flicker = 0.85 + 0.15 * Math.sin(this.scene.time.now / 90 + this.uid);
    this.sprite.setAlpha(k * CL.alpha * flicker);
    this.shadow.setAlpha(0.15);
    this.render(dt);
  }

  takeHit(_hit: Hit): boolean {
    if (!this._alive || this.gone) return false;
    bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
    this.dissipate();
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.gone || ev.outcome === 'fail') return false;
    let hits = false;
    switch (ev.spellId) {
      case 'VERDAD':
        hits = inVerdadRadius(ev, this.x, this.y, this.radius);
        break;
      case 'LUZ':
        hits = inLuzRadius(ev, this.x, this.y);
        break;
      case 'SOL':
        hits = inSolLine(ev, this.x, this.y, this.radius);
        break;
      case 'FUEGO':
        hits = inFuegoLine(ev, this.x, this.y, this.radius);
        break;
      case 'MEMORIA':
        hits = inMemoriaRadius(ev, this.x, this.y, 'stunRadius');
        break;
      case 'VOZ':
        hits = planeDist(this.x, this.y, ev.x, ev.y) <= spellParam('VOZ', 'stunRadius', SPELLS_FX.VOZ.stunRadius) * powerScale(ev.power);
        break;
      case 'PROTECCION':
        hits = planeDist(this.x, this.y, ev.x, ev.y) <= SPELLS_FX.PROTECCION.pushRadius;
        break;
    }
    if (!hits) return false;
    this.dissipate();
    return true;
  }

  /** Se deshace en bruma morada (sin Ecos). */
  dissipate(): void {
    if (this.gone || !this._alive) return;
    this.gone = true;
    this._exhausted = true;
    smokeFx(this.scene, this.x, this.y, 0.8);
    burst(this.scene, 'dark', this.x, this.y - 40, this.y + FX_DEPTH_BIAS, 10);
    sfx('rey_clon_disipa');
    this.owner.cloneGone(this);
    this.leaveWorld();
  }
}

/* ================================== Jefe ================================== */

interface Beam {
  y: number;
  side: 1 | -1;
  /** < 0: aviso; ≥ 0: activo. */
  t: number;
  hitT: number;
  gfx: Phaser.GameObjects.Graphics;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  hitDone: boolean;
  gfx: Phaser.GameObjects.Graphics;
}

export class ReyOlvido extends EnemyBase {
  kind: EnemyKind = 'rey_olvido';
  readonly illusion = false;
  private st: St = 'dormant';
  private stT = 0;
  private phase: Phase = 1;
  private crownHp = R.crown.hp;
  private seal = 0;
  private chip = 0;
  private lastPerfect = false;
  private windowLeft = 0;
  private rageT = 0;
  private pulseCd = 0;
  private homeX: number;
  private clones: ReyClon[] = [];
  private beams: Beam[] = [];
  private rings: Ring[] = [];
  private ringsPending = 0;
  private ringT = 0;
  private beamPlan: { y: number; side: 1 | -1 } | null = null;
  private pulseGfx: Phaser.GameObjects.Graphics;
  private crown: Phaser.GameObjects.Image;
  private crownGlow: Phaser.GameObjects.Image;
  private eye: Phaser.GameObjects.Image;
  private told = { crownClosed: false, crownOpen: false, memoriaCrown: false, memoriaWait: false, calma: false, luz: false, laser: false, broken: false, clones: false };

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    super(world, x, y, {
      hp: 100,
      radius: R.radius,
      height: R.height,
      ecos: R.ecos,
      feetY: R.frame.feetY,
      frameH: R.frame.h,
      fallbackTex: ensureReyTextures(world.scene),
      textureKey: 'rey_olvido_reposo',
      shadowW: R.shadowW,
      kitId: 'rey_olvido',
    });
    this.group = group;
    this.homeX = x;
    const scene = this.scene;
    this.pulseGfx = scene.add.graphics();
    this.crownGlow = scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(R.colors.crownGlow)).setAlpha(0.5);
    this.crown = scene.add.image(x, y, CROWN_TEX).setOrigin(0.5, 1);
    this.eye = scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(R.colors.eyes)).setScale(0.22);
    // El grito de la Llorona (aliada, dueño: sistemas) aturde al Rey y disipa clones.
    bus.scoped(scene, 'llorona:scream', (ev) => this.onScream(ev.x, ev.y));
    this.play('rey_olvido_reposo');
    this.render(0);
    this.placeFx();
  }

  /* ---------------------------- Consultas ---------------------------- */

  get crownBroken(): boolean {
    return this.crownHp <= 0;
  }
  get crownState(): { hp: number; max: number; broken: boolean } {
    return { hp: Math.max(0, this.crownHp), max: R.crown.hp, broken: this.crownBroken };
  }
  get sealState(): { seal: number; total: number } {
    return { seal: this.seal, total: R.seal.total };
  }
  get cloneCount(): number {
    return this.clones.length;
  }
  get currentPhase(): Phase {
    return this.phase;
  }
  get isAware(): boolean {
    return this.st !== 'dormant';
  }
  /** ¿Está abierta una ventana? (corona expuesta o cuerpo vulnerable). */
  get inWindow(): boolean {
    return this.st === 'window';
  }

  /* ----------------------------- Estado ----------------------------- */

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      dormant: 'reposo', intro: 'invocar', idle: 'caminar', pulseWindup: 'conjuro', beamWindup: 'conjuro', beamFire: 'lanzar',
      wavesWindup: 'golpe', clonesWindup: 'invocar', window: 'aturdido', crownBreak: 'dano', calmed: 'morir',
    };
    this.play(`rey_olvido_${anim[st]}`);
  }

  private emitCrown(): void {
    bus.emit('rey:crown', this.crownState);
  }

  private pushHud(): void {
    // Barra: la mitad es la corona y la otra mitad el sello. Los puntos de calma son el sello.
    const crownPart = this.crownBroken ? 0 : this.crownHp / R.crown.hp;
    const sealPart = 1 - this.seal / R.seal.total;
    updateBossBar(0.5 * crownPart + 0.5 * sealPart, this.seal, R.seal.total, this.st === 'window');
  }

  private activate(): void {
    if (this.st !== 'dormant') return;
    this.set('intro');
    sfx('rey_risa');
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    showBossBar(R.name);
    this.pushHud();
    this.emitCrown();
    bus.emit('boss:phase', { phase: 1 });
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
    if (this.pulseCd > 0) this.pulseCd -= dt;
    this.stepKnockback(dt);

    switch (this.st) {
      case 'dormant':
        if (planeDist(this.x, this.y, p.x, p.y) < R.activateRadius) this.activate();
        break;
      case 'intro':
        this.facePlayer();
        if (this.stT >= R.introSeconds) this.toIdle();
        break;
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'pulseWindup':
        this.facePlayer();
        this.telegraph(0x401870);
        this.drawPulseWarn();
        if (this.stT >= R.pulse.windup * this.haste) this.firePulse();
        break;
      case 'beamWindup':
        this.telegraph(0x605010);
        if (this.stT >= R.beam.windup * this.haste) this.fireBeam();
        break;
      case 'beamFire':
        // Espera a que el rayo termine; luego la corona queda "sobrecalentada" (ventana).
        if (this.beams.length === 0) this.openWindow(this.crownBroken ? R.vulnerableSeconds * 0.6 : R.crown.windowSeconds, false);
        break;
      case 'wavesWindup':
        this.facePlayer();
        this.telegraph(0x503018);
        if (this.stT >= R.waves.windup * this.haste) this.slam();
        break;
      case 'clonesWindup':
        this.facePlayer();
        this.telegraph(0x301848);
        if (Math.random() < dt * 20) burst(this.scene, 'dark', this.x + rand(-24, 24), this.y - rand(10, 80), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= R.clones.windup * this.haste) {
          this.spawnClones();
          this.toIdle();
          this.stT = -R.clones.afterSeconds;
        }
        break;
      case 'window':
        // Aturdido pero sigue mirando al jugador (con kit por cuadros se veía de espaldas si lo rodeabas).
        this.facePlayer();
        this.windowLeft -= dt;
        if (this.stT > 1.5) this.setStars(false);
        if (Math.random() < dt * 4) burst(this.scene, this.crownBroken ? 'smoke' : 'sun', this.x + rand(-8, 8), this.y - this.height - 4, this.y + FX_DEPTH_BIAS, 1);
        if (this.windowLeft <= 0) this.closeWindow();
        break;
      case 'crownBreak':
        this.facePlayer();
        if (Math.random() < dt * 10) burst(this.scene, 'dark', this.x + rand(-10, 10), this.y - rand(40, 90), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= R.crown.brokenStunSeconds) this.openWindow(R.vulnerableSeconds, true);
        break;
    }

    this.updateRingSpawns(dt);
    this.updateBeams(dt);
    this.updateRings(dt);
    if (this.st !== 'pulseWindup') this.pulseGfx.clear();
    if (this.st !== 'dormant') this.pushHud();
    // Aura violeta de olvido y destellos dorados que se desprenden de la corona mientras está entera.
    const reigning = (this.st as string) !== 'dormant' && (this.st as string) !== 'calmed';
    this.setAura(this.rageT > 0 ? 0xff60c0 : hexColor(R.colors.pulse), reigning ? 0.16 : 0.05, { w: 96, h: 124, dy: 0.5, pulse: 0.25 });
    this.trailFx(dt, reigning && !this.crownBroken, 'light', 3, 1.02, 6);
    this.render(dt);
    this.placeFx();
  }

  /** Multiplicador de los tiempos de aviso (furia de CALMA y fase 3 lo aceleran). */
  private get haste(): number {
    let h = this.rageT > 0 ? R.calma.hasteMult : 1;
    if (this.phase === 3) h *= R.phase3.hasteMult;
    return h;
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private toIdle(): void {
    this.set('idle');
    this.stT = -randRange(R.idleBetween) * this.haste;
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
    const tx = Phaser.Math.Clamp(p.x + side * R.keepDistance, this.homeX - R.arenaHalfWidth, this.homeX + R.arenaHalfWidth);
    const ty = Phaser.Math.Clamp(p.y, R.band[0], R.band[1]);
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const step = Math.min(d, R.moveSpeed * dt * (this.rageT > 0 ? R.calma.speedMult : 1));
      this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.7);
    }
    this.facePlayer();
    if (this.stT < 0) return;
    this.chooseAttack();
  }

  private chooseAttack(): void {
    const key = `phase${this.phase}` as 'phase1' | 'phase2' | 'phase3';
    const w: Record<Attack, number> = { ...R.weights[key] };
    if (this.pulseCd > 0) w.pulse = 0;
    if (this.clones.length >= R.clones.max) w.clones = 0;
    if (this.beams.length > 0) w.beam = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (total <= 0) {
      this.toIdle();
      return;
    }
    let r = Math.random() * total;
    let pick: Attack = 'waves';
    for (const [k, v] of Object.entries(w) as Array<[Attack, number]>) {
      r -= v;
      if (r <= 0) {
        pick = k;
        break;
      }
    }
    this.startAttack(pick);
  }

  private startAttack(a: Attack): void {
    switch (a) {
      case 'pulse':
        sfx('rey_pulso_carga');
        this.set('pulseWindup');
        break;
      case 'beam': {
        const p = this.world.player;
        // El carril se fija al empezar el aviso: moverse de carril, saltar o esquivar lo evita.
        this.beamPlan = { y: Phaser.Math.Clamp(p.y, R.band[0], R.band[1]), side: p.x >= this.x ? 1 : -1 };
        this.facing = this.beamPlan.side;
        sfx('rey_corona_carga');
        this.set('beamWindup');
        break;
      }
      case 'waves':
        this.set('wavesWindup');
        break;
      case 'clones':
        sfx('rey_clones');
        this.set('clonesWindup');
        break;
    }
  }

  /* ------------------------------ Pulso mental ------------------------------ */

  private drawPulseWarn(): void {
    const k = Math.min(1, this.stT / (R.pulse.windup * this.haste));
    const rr = R.pulse.radius;
    const color = hexColor(R.colors.pulse);
    const a = Math.floor(this.stT * 12) % 2 === 0 ? 0.7 : 0.35;
    const g = this.pulseGfx.clear().setDepth(DEPTH.shadow + 1);
    // Anillo exterior (alcance) parpadeando y anillo interior que crece hasta él.
    g.lineStyle(1, color, a).strokeEllipse(this.x, this.y, rr * 2, rr);
    g.lineStyle(2, color, 0.8).strokeEllipse(this.x, this.y, rr * 2 * k, rr * k);
    g.fillStyle(color, 0.08 + 0.1 * k).fillEllipse(this.x, this.y, rr * 2 * k, rr * k);
  }

  private firePulse(): void {
    const P = R.pulse;
    const p = this.world.player;
    this.pulseCd = P.cooldown;
    sfx('rey_pulso');
    this.world.flash(hexColor(R.colors.pulse), 160);
    this.world.shake(0.006, 200);
    // Onda visual que se expande.
    const g = this.scene.add.graphics().setDepth(DEPTH.shadow + 1);
    const color = hexColor(R.colors.pulse);
    const cx = this.x;
    const cy = this.y;
    const o = { k: 0 };
    this.scene.tweens.add({
      targets: o, k: 1, duration: 320,
      onUpdate: () => {
        g.clear().lineStyle(4, color, 1 - o.k * 0.8).strokeEllipse(cx, cy, P.radius * 2 * o.k, P.radius * o.k);
      },
      onComplete: () => g.destroy(),
    });
    burst(this.scene, 'dark', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 16);
    // Dentro del alcance y sin esquivar: la corona confunde la mente (MindControl decide si invierte o solo distorsiona).
    if (planeDist(cx, cy, p.x, p.y) <= P.radius && !p.isDodging) bus.emit('controls:invert', { on: true, ms: P.invertMs });
    this.toIdle();
  }

  /* ------------------------------ Rayo de la corona ------------------------------ */

  private fireBeam(): void {
    const plan = this.beamPlan ?? { y: this.y, side: this.facing };
    this.beamPlan = null;
    this.beams.push({ y: plan.y, side: plan.side, t: -R.beam.warnTime, hitT: 0, gfx: this.scene.add.graphics() });
    this.set('beamFire');
  }

  private crownPos(): { x: number; y: number } {
    return { x: this.x + this.facing * 2, y: this.y - this.z - this.bob - this.height + R.crown.offsetY };
  }

  private updateBeams(dt: number): void {
    const p = this.world.player;
    const B = R.beam;
    const color = hexColor(R.colors.beam);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      const wasWarn = b.t < 0;
      b.t += dt;
      b.hitT -= dt;
      const c = this.crownPos();
      const start = this.x + b.side * this.radius;
      const end = start + b.side * B.range;
      const yDraw = b.y - B.chestHeight;
      const g = b.gfx.clear().setDepth(b.y + FX_DEPTH_BIAS);
      if (b.t < 0) {
        // Aviso: línea fina dorada a la altura del pecho + franja en el suelo del carril.
        const a = Math.floor(b.t * 16) % 2 === 0 ? 0.85 : 0.3;
        g.lineStyle(1, color, a).lineBetween(c.x, c.y - 6, start, yDraw).lineBetween(start, yDraw, end, yDraw);
        g.fillStyle(color, a * 0.22).fillRect(Math.min(start, end), b.y - B.halfWidth, B.range, B.halfWidth * 2);
        continue;
      }
      if (wasWarn) {
        sfx('rey_rayo');
        this.world.shake(0.004, 120);
      }
      const flick = 0.8 + 0.2 * Math.sin(b.t * 60);
      g.lineStyle(8, color, 0.35 * flick).lineBetween(c.x, c.y - 6, start, yDraw).lineBetween(start, yDraw, end, yDraw);
      g.lineStyle(3, 0xfff0a0, 0.9 * flick).lineBetween(c.x, c.y - 6, start, yDraw).lineBetween(start, yDraw, end, yDraw);
      g.lineStyle(1, 0xffffff, 1).lineBetween(start, yDraw, end, yDraw);
      if (Math.random() < dt * 30) burst(this.scene, 'sun', start + b.side * rand(0, B.range), yDraw, b.y + FX_DEPTH_BIAS, 1);
      const inX = b.side > 0 ? p.x >= start && p.x <= end : p.x <= start && p.x >= end;
      // Saltar por encima (maxPlayerZ) o esquivar lo evita.
      if (inX && Math.abs(p.y - b.y) < B.halfWidth && p.z < B.maxPlayerZ && !p.isDodging && b.hitT <= 0) {
        b.hitT = B.tickSeconds;
        hitPlayer(this.world, { damage: B.damage, stun: 0, kind: 'projectile', sourceX: this.x, knockback: B.knockback });
      }
      if (b.t >= B.activeTime) {
        b.gfx.destroy();
        this.beams.splice(i, 1);
      }
    }
  }

  private clearBeams(): void {
    this.beams.forEach((b) => b.gfx.destroy());
    this.beams = [];
  }

  /* ------------------------------ Ondas al suelo ------------------------------ */

  private slam(): void {
    const n = Phaser.Math.Between(R.waves.count[0], R.waves.count[1]) + (this.phase === 3 ? R.phase3.wavesExtra : 0);
    this.ringsPending = n;
    this.ringT = 0;
    this.toIdle();
  }

  private updateRingSpawns(dt: number): void {
    if (this.ringsPending <= 0) return;
    this.ringT -= dt;
    if (this.ringT > 0) return;
    this.ringsPending--;
    this.ringT = R.waves.gap;
    this.rings.push({ x: this.x, y: this.y, t: 0, hitDone: false, gfx: this.scene.add.graphics() });
    sfx('rey_onda');
    this.world.shake(JUICE.shake.bossSlam.intensity * 0.6, JUICE.shake.bossSlam.ms);
    burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 18);
  }

  private updateRings(dt: number): void {
    const p = this.world.player;
    const W = R.waves;
    const color = hexColor(R.colors.pulse);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const rad = W.speed * r.t;
      const k = Math.min(1, rad / W.range);
      const g = r.gfx.clear().setDepth(DEPTH.shadow + 1);
      g.lineStyle(5, color, 0.35 * (1 - k * 0.6)).strokeEllipse(r.x, r.y, rad * 2, rad);
      g.lineStyle(2, 0xe0c0ff, 0.9 * (1 - k * 0.6)).strokeEllipse(r.x, r.y, rad * 2, rad);
      if (!r.hitDone && Math.abs(planeDist(r.x, r.y, p.x, p.y) - rad) < W.thickness && p.z < W.dodgeHeight && !p.isDodging) {
        r.hitDone = true;
        hitPlayer(this.world, { damage: W.damage, stun: 0, kind: 'shockwave', sourceX: r.x, knockback: W.knockback });
      }
      if (k >= 1) {
        r.gfx.destroy();
        this.rings.splice(i, 1);
      }
    }
  }

  private clearRings(): void {
    this.rings.forEach((r) => r.gfx.destroy());
    this.rings = [];
    this.ringsPending = 0;
  }

  /* ------------------------------ Clones de memoria ------------------------------ */

  private spawnClones(): void {
    const C = R.clones;
    const extra = this.phase === 3 ? R.phase3.clonesExtra : 0;
    const max = C.max + extra;
    const n = Math.min(Phaser.Math.Between(C.count[0], C.count[1]) + extra, max - this.clones.length);
    if (n <= 0) return;
    const p = this.world.player;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const x = Phaser.Math.Clamp(p.x + Math.cos(a) * C.radius, this.homeX - R.arenaHalfWidth, this.homeX + R.arenaHalfWidth);
      const y = Phaser.Math.Clamp(p.y + Math.sin(a) * C.radius * 0.5, R.band[0] + 6, R.band[1] - 6);
      const pt = this.world.isWalkable(x, y, this.radius) ? { x, y } : this.world.randomPointNear(x, y, 24);
      const c = new ReyClon(this.world, pt.x, pt.y, this);
      this.world.add(c);
      this.clones.push(c);
      smokeFx(this.scene, pt.x, pt.y, 0.8);
    }
    if (this.clones.length > 0 && !this.told.clones) {
      this.told.clones = true;
      bus.emit('hud:toast', { text: '¡Clones de memoria! Un golpe, VERDAD o el grito de la Llorona los deshacen', ms: 3000 });
    }
  }

  /** La llama el clon al disiparse. */
  cloneGone(c: ReyClon): void {
    const i = this.clones.indexOf(c);
    if (i >= 0) this.clones.splice(i, 1);
  }

  private dissipateClones(near?: { x: number; y: number; r: number }): number {
    let n = 0;
    for (const c of [...this.clones]) {
      if (near && planeDist(c.x, c.y, near.x, near.y) > near.r) continue;
      c.dissipate();
      n++;
    }
    return n;
  }

  /* ------------------------------ Ventanas ------------------------------ */

  /** Abre una ventana: con la corona intacta, la corona queda expuesta (SOL/FUEGO); rota, el cuerpo (MEMORIA). */
  private openWindow(seconds: number, stars: boolean): void {
    if (this.st === 'calmed') return;
    const wasOpen = this.st === 'window';
    this.cancelAttack();
    this.set('window');
    this.windowLeft = Math.max(wasOpen ? this.windowLeft : 0, seconds);
    if (stars) this.setStars(true, this.crownBroken ? 0xc0a0ff : 0xffb040);
    if (!wasOpen) {
      bus.emit('boss:vulnerable', { on: true });
      sfx(this.crownBroken ? 'rey_vulnerable' : 'rey_corona_expuesta');
    }
    if (!this.crownBroken && !this.told.crownOpen) {
      this.told.crownOpen = true;
      bus.emit('hud:toast', { text: '¡La corona está expuesta! Rómpela con SOL o FUEGO (Q)', ms: 3000 });
    } else if (this.crownBroken && !this.told.broken) {
      this.told.broken = true;
      bus.emit('hud:toast', { text: 'Sin corona está vulnerable: devuélvele la MEMORIA (Q)', ms: 3200 });
    }
    this.pushHud();
  }

  private closeWindow(): void {
    this.setStars(false);
    if (this.st === 'window') bus.emit('boss:vulnerable', { on: false });
    this.toIdle();
  }

  /** Interrumpe el ataque que estaba preparando (no los rayos/ondas ya lanzados). */
  private cancelAttack(): void {
    this.beamPlan = null;
    this.pulseGfx.clear();
    // Un rayo todavía en aviso se cancela; el activo termina solo.
    for (let i = this.beams.length - 1; i >= 0; i--) {
      if (this.beams[i].t < 0) {
        this.beams[i].gfx.destroy();
        this.beams.splice(i, 1);
      }
    }
  }

  private onScream(x: number, y: number): void {
    if (!this._alive || this.st === 'calmed' || this.st === 'dormant') return;
    const S = R.scream;
    const n = this.dissipateClones({ x, y, r: S.cloneRadius });
    if (n > 0) burst(this.scene, 'light', x, y - 40, y + FX_DEPTH_BIAS, 6);
    if (this.st === 'intro' || this.st === 'crownBreak') return;
    if (planeDist(this.x, this.y, x, y) > S.radius) return;
    this.flashT = JUICE.flashMs / 1000;
    this.world.hitstop(JUICE.hitstopMs.spell);
    this.openWindow(Math.max(S.stunSeconds, S.windowSeconds), true);
  }

  /* ------------------------------ Corona y sello ------------------------------ */

  private damageCrown(n: number, perfect: boolean): void {
    this.lastPerfect = perfect;
    this.crownHp = Math.max(0, this.crownHp - n);
    this.world.hitstop(JUICE.hitstopMs.spell);
    this.world.shake(JUICE.shake.red.intensity, JUICE.shake.red.ms);
    const c = this.crownPos();
    burst(this.scene, 'sun', c.x, c.y - 6, this.y + FX_DEPTH_BIAS, 14);
    sfx('rey_corona_golpe');
    this.emitCrown();
    if (this.crownHp <= 0) this.breakCrown();
    this.pushHud();
  }

  private breakCrown(): void {
    const c = this.crownPos();
    sfx('rey_corona_rota');
    this.world.flash(hexColor(R.colors.crownGlow), 260);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    // Esquirlas doradas que caen (sin sangre: metal y luz).
    for (let k = 0; k < 12; k++) {
      const s = this.scene.add.image(c.x, c.y - 6, FB.px).setTint(k % 3 ? hexColor(R.colors.crown) : hexColor(R.colors.gem))
        .setScale(rand(0.8, 1.6), rand(0.6, 1.2)).setAngle(rand(0, 180)).setDepth(this.y + FX_DEPTH_BIAS);
      this.scene.tweens.add({
        targets: s, x: c.x + rand(-50, 50), y: this.y - rand(0, 10), angle: s.angle + rand(-300, 300),
        duration: rand(500, 800), ease: 'Quad.easeIn', onComplete: () => this.scene.tweens.add({ targets: s, alpha: 0, duration: 600, onComplete: () => s.destroy() }),
      });
    }
    burst(this.scene, 'light', c.x, c.y - 6, this.y + FX_DEPTH_BIAS, 20);
    this.dissipateClones();
    this.phase = 2;
    bus.emit('boss:phase', { phase: 2 });
    this.cancelAttack();
    this.setStars(false);
    if (this.st === 'window') bus.emit('boss:vulnerable', { on: false });
    this.set('crownBreak');
  }

  private addSeal(n: number, perfect: boolean): void {
    this.lastPerfect = perfect;
    this.seal = Math.min(R.seal.total, this.seal + n);
    this.flashT = JUICE.flashMs / 1000;
    this.world.hitstop(JUICE.hitstopMs.spell);
    this.world.shake(JUICE.shake.red.intensity, JUICE.shake.red.ms);
    burst(this.scene, 'light', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 14);
    sfx('rey_sello');
    if (this.seal >= R.seal.total) {
      this.calm(perfect);
      return;
    }
    if (this.phase === 2 && this.seal >= R.phase3At) {
      this.phase = 3;
      bus.emit('boss:phase', { phase: 3 });
      sfx('rey_risa');
      this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
      bus.emit('hud:toast', { text: '¡El Rey se aferra al olvido! Más clones y más ondas', ms: 2600 });
    }
    this.pushHud();
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'calmed') return false;
    if (this.st === 'dormant') this.activate();
    if (this.st === 'intro') return false;
    this.flashT = JUICE.flashMs / 1000;
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    // Daño reducido: un desgaste que, al llenarse, lo tambalea (abre ventana). Con la corona intacta, casi nada.
    const L = R.laser;
    let mult = this.crownBroken ? L.brokenMult : L.crownIntactMult;
    if (this.st === 'window') mult *= L.windowMult;
    this.chip += (hit.damage * L.chipPerDamage + hit.stun * L.chipPerStun) * mult;
    if (!this.told.laser && hit.kind === 'laser-red' && !this.crownBroken) {
      this.told.laser = true;
      bus.emit('hud:toast', { text: 'La corona lo protege: el láser apenas lo roza', ms: 2800 });
    }
    if (this.chip >= L.staggerAt) {
      this.chip = 0;
      if (this.st !== 'window' && this.st !== 'crownBreak') this.openWindow(L.staggerSeconds, true);
    }
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'calmed' || ev.outcome === 'fail') return false;
    const near = planeDist(this.x, this.y, ev.x, ev.y) <= R.spellRange;
    if (this.st === 'dormant') {
      if (near) this.activate();
      return false;
    }
    if (this.st === 'intro') return false;
    const perfect = ev.outcome === 'perfect';
    switch (ev.spellId) {
      case 'SOL':
      case 'FUEGO': {
        const inLine = ev.spellId === 'SOL' ? inSolLine(ev, this.x, this.y, this.radius + 10) : inFuegoLine(ev, this.x, this.y, this.radius + 10);
        if (!inLine) return false;
        if (ev.spellId === 'FUEGO') burnFx(this.scene, this, 500);
        if (!this.crownBroken) {
          if (this.st === 'window') {
            this.damageCrown(perfect ? R.crown.perfect : R.crown.partial, perfect);
            return true;
          }
          // Corona cerrada: el conjuro rebota en ella.
          const c = this.crownPos();
          burst(this.scene, 'sun', c.x, c.y - 6, this.y + FX_DEPTH_BIAS, 6);
          sfx('rey_corona_rebote');
          if (!this.told.crownClosed) {
            this.told.crownClosed = true;
            bus.emit('hud:toast', { text: 'La corona está cerrada: espera a que brille (tras su rayo o el grito de la Llorona)', ms: 3200 });
          }
          return false;
        }
        // Sin corona: daño como un golpe fuerte (desgaste).
        const dmg = ev.spellId === 'SOL' ? solDamage(ev) : fuegoDamage(ev);
        return this.takeHit({ damage: dmg, stun: 0, kind: 'spell', sourceX: ev.x, knockback: 0 });
      }
      case 'MEMORIA': {
        if (!inMemoriaRadius(ev, this.x, this.y, 'stunRadius', this.radius + 40) && !near) return false;
        if (!this.crownBroken) {
          if (!this.told.memoriaCrown) {
            this.told.memoriaCrown = true;
            bus.emit('hud:toast', { text: 'La corona bloquea sus recuerdos: primero rómpela con SOL o FUEGO', ms: 3200 });
          }
          return false;
        }
        if (this.st !== 'window') {
          if (!this.told.memoriaWait) {
            this.told.memoriaWait = true;
            bus.emit('hud:toast', { text: 'Todavía se resiste: espera a que baje la guardia (estrellitas)', ms: 3000 });
          }
          return false;
        }
        const bossSeal = spellParam('MEMORIA', 'bossSeal', SPELLS_FX.MEMORIA.bossSeal);
        this.addSeal(Math.max(1, Math.round((perfect ? R.seal.perfect : R.seal.partial) * bossSeal)), perfect);
        return true;
      }
      case 'VERDAD': {
        const clonesNear = this.clones.some((c) => inVerdadRadius(ev, c.x, c.y, c.radius));
        const meNear = inVerdadRadius(ev, this.x, this.y, this.radius + 60);
        if (!clonesNear && !meNear) return false;
        const n = this.dissipateClones();
        if (n > 0) this.world.flash(0xd8f0ff, 120);
        // Revela al verdadero: lo aturde un momento (ventana corta).
        if (meNear && this.st !== 'window' && this.st !== 'crownBreak') this.openWindow(R.verdad.stunSeconds * (0.6 + 0.4 * ev.power), true);
        return true;
      }
      case 'CALMA': {
        if (!near) return false;
        // ❌ La calma del olvido es la suya: lo fortalece y lo enfurece.
        if (!this.crownBroken) {
          this.crownHp = Math.min(R.crown.hp, this.crownHp + R.calma.crownHeal);
          this.emitCrown();
        } else {
          this.seal = Math.max(0, this.seal - R.calma.sealHeal);
        }
        this.rageT = R.calma.rageSeconds;
        this.world.flash(hexColor(R.colors.pulse), 140);
        sfx('rey_furia');
        if (!this.told.calma) {
          this.told.calma = true;
          bus.emit('hud:toast', { text: '¡CALMA lo fortalece! El olvido ya es su calma', ms: 3000 });
        }
        if (this.st === 'window') this.closeWindow();
        // Ataque inmediato.
        if (this.st !== 'crownBreak') {
          this.cancelAttack();
          this.startAttack('pulse');
        }
        this.pushHud();
        return false;
      }
      case 'LUZ': {
        if (!this.told.luz && inLuzRadius(ev, this.x, this.y, 'stunRadius', this.radius + 40)) {
          this.told.luz = true;
          bus.emit('hud:toast', { text: 'LUZ no le hace nada al Rey', ms: 2400 });
        }
        return false;
      }
    }
    return false; // PROTECCION, VOZ, DESCANSO: ➖
  }

  /* ------------------------------ Vencido ------------------------------ */

  /** Corona rota + sello completo: cae inconsciente (sin violencia). 'boss:calmed' y ~600 Ecos. */
  private calm(perfect: boolean): void {
    this.dissipateClones();
    this.clearBeams();
    this.clearRings();
    this.pulseGfx.clear();
    this.setStars(false);
    this.rageT = 0;
    bus.emit('controls:invert', { on: false, ms: 0 });
    bus.emit('boss:vulnerable', { on: false });
    this.set('calmed');
    this._exhausted = true;
    this.hp = 0;
    this.z = 0;
    this.setBaseTint(0xffffff);
    sfx('rey_cae');
    this.world.flash(hexColor(R.colors.freed), 300);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    updateBossBar(0, R.seal.total, R.seal.total, false);
    bus.emit('boss:calmed', {});
    // Cae de espaldas, despacio, entre bruma morada que se va.
    const dir = this.facing;
    this.scene.tweens.add({ targets: this.sprite, angle: -dir * 82, y: this.sprite.y + 6, duration: 900, ease: 'Quad.easeIn' });
    for (let i = 0; i < 6; i++) {
      this.scene.time.delayedCall(i * 140, () => {
        if (!this.sprite.active) return;
        burst(this.scene, 'dark', this.x + rand(-14, 14), this.y - rand(20, 70), this.y + FX_DEPTH_BIAS, 3);
        burst(this.scene, 'smoke', this.x + rand(-12, 12), this.y - rand(10, 40), this.y + FX_DEPTH_BIAS, 2);
      });
    }
    this.scene.time.delayedCall(900, () => {
      if (this._alive) purifyFx(this.scene, this.x, this.y, 1.2);
    });
    const amount = Math.round(this._ecos * (perfect || this.lastPerfect ? R.perfectBonus : 1));
    this.scene.time.delayedCall(1800, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 40 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: perfect || this.lastPerfect });
      hideBossBar();
      // El Rey queda tendido, inconsciente; la entidad sale del mundo.
      const sp = this.sprite;
      this.scene.add.image(sp.x, sp.y, sp.texture.key, sp.frame.name)
        .setOrigin(sp.originX, sp.originY).setDepth(sp.depth).setFlipX(sp.flipX).setScale(sp.scaleX, sp.scaleY).setAngle(sp.angle);
      this.leaveWorld();
    });
  }

  /* ------------------------------ Efectos ------------------------------ */

  private placeFx(): void {
    const t = this.scene.time.now / 1000;
    const c = this.crownPos();
    const calmed = this.st === 'calmed';
    const exposed = this.st === 'window' && !this.crownBroken;
    const visible = !this.crownBroken && !calmed;
    // Corona: se agrieta (se apaga) al perder vida; en su ventana brilla naranja.
    const k = this.crownHp / R.crown.hp;
    const base = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x7a7068), Phaser.Display.Color.ValueToColor(0xffffff), 1, 0.35 + 0.65 * k,
    );
    const tint = exposed ? hexColor(R.colors.crownExposed) : Phaser.Display.Color.GetColor(base.r, base.g, base.b);
    this.crown
      .setVisible(visible)
      .setPosition(Math.round(c.x), Math.round(c.y))
      .setFlipX(this.facing < 0)
      .setTint(tint)
      .setDepth(this.y + 0.1);
    this.crownGlow
      .setVisible(visible)
      .setPosition(c.x, c.y - 6)
      .setTint(exposed ? hexColor(R.colors.crownExposed) : hexColor(R.colors.crownGlow))
      .setScale(exposed ? 1.3 + 0.2 * Math.sin(t * 10) : 0.8 + 0.08 * Math.sin(t * 3))
      .setAlpha(exposed ? 0.85 : 0.35 + 0.2 * k)
      .setDepth(this.y + 0.05);
    const top = this.y - this.z - this.bob;
    this.eye
      .setPosition(this.x + this.facing * 3, top - 75)
      .setAlpha(calmed || this.st === 'dormant' ? 0 : 0.6 + 0.3 * Math.sin(t * 4))
      .setScale(this.rageT > 0 ? 0.32 : 0.22)
      .setTint(this.rageT > 0 ? 0xff60c0 : hexColor(R.colors.eyes))
      .setDepth(this.y + FX_DEPTH_BIAS);
  }

  protected onDestroy(): void {
    this.clearBeams();
    this.clearRings();
    for (const c of [...this.clones]) {
      this.world.remove(c);
      c.destroy();
    }
    this.clones = [];
    this.pulseGfx.destroy();
    this.crown.destroy();
    this.crownGlow.destroy();
    this.eye.destroy();
    if (this.st !== 'calmed') {
      hideBossBar();
      bus.emit('controls:invert', { on: false, ms: 0 });
    }
  }
}
