import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH, DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, JUICE, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import {
  EnemyBase, FB, burst, hexColor, hitPlayer, inLuzRadius, inSolLine, planeDist, purifyFx, rand, randRange, solDamage,
} from './EnemyBase';

/**
 * TZITZIMITL (subjefa del Nivel 10, contratos §5). kitId 'tzitzimitl'; si el equipo no entregó el kit,
 * PLACEHOLDER SIMPLE (AGENTS §8.0): esqueleto estelar estilizado (~90 px en un cuadro 96×96, pies en y = 94),
 * falda de estrellas y cuchillos de obsidiana sugeridos. Sin gore: huesos lisos y luz.
 *
 * - Despierta con el jugador a < activateRadius o al recibir un golpe. Vida alta.
 * - Barra: cada una lleva una barrita propia sobre la cabeza y, mientras no haya una Itzpapálotl despierta,
 *   la barra de jefe muestra el total de las Tzitzimime vivas ("Tzitzimime", pips = caídas / total).
 * - ATAQUES (todos anunciados):
 *   · Descenso: sube fuera de la pantalla, su sombra sigue al jugador y se fija ~0.8 s antes de caer.
 *   · Lluvia de estrellas: círculos en el suelo que crecen y estallan.
 *   · Embestida: franja en el suelo y carga en línea.
 * - AFINIDADES: PROTECCION ✅ (cerca: la repele y la aturde), LUZ ✅ (daño + aturdimiento corto), SOL ✅ (daño ×1.5),
 *   CALMA/VOZ/MEMORIA/VERDAD/FUEGO/DESCANSO/ECOS/MAMA ➖. Láser rojo: daño normal. Láser verde: acumula aturdimiento.
 * - 'balam:strike' {x, y} cerca: aturdimiento corto (el daño lo aplica BalamJaguar con takeHit).
 * - Al caer: se deshace en polvo de estrellas, 'ecos:gained' + 'enemy:purified' (~200 Ecos) y sale del mundo.
 *   No emite 'boss:*' (eso es de Itzpapálotl).
 */

const T = enemiesData.tzitzimitl;
const TEX = '__cb_tzitzimitl';

type St = 'dormant' | 'intro' | 'idle' | 'diveWindup' | 'diveUp' | 'diveAim' | 'diveWarn' | 'diveFall' | 'diveRecover'
  | 'rainWindup' | 'chargeWindup' | 'charge' | 'chargeRecover' | 'stunned' | 'falling';
type Attack = 'dive' | 'rain' | 'charge';

interface RainSpot {
  x: number;
  y: number;
  /** < 0: espera su turno; 0..warn: aviso; luego estalla. */
  t: number;
  gfx: Phaser.GameObjects.Graphics;
}

function ensureTzitzimitlTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const c = T.colors;
  const g = scene.make.graphics({}, false);
  const bone = hexColor(c.bone);
  const boneD = hexColor(c.boneDark);
  const star = hexColor(c.star);
  // Falda de estrellas (de la cintura al suelo), con una banda más clara.
  g.fillStyle(hexColor(c.skirt), 1).fillTriangle(48, 46, 18, 94, 78, 94);
  g.fillStyle(hexColor(c.skirtLight), 1).fillTriangle(48, 54, 30, 94, 66, 94);
  g.fillStyle(hexColor(c.skirt), 1).fillRect(26, 86, 44, 8);
  g.fillStyle(star, 1);
  for (const [sx, sy] of [[40, 62], [55, 66], [34, 78], [48, 74], [62, 82], [28, 90], [44, 88], [70, 90], [52, 58]]) {
    g.fillRect(sx, sy, 2, 2).fillRect(sx - 1, sy + 0.5, 4, 1);
  }
  // Cuerpo oscuro (sombra estelar) y costillas.
  g.fillStyle(hexColor(c.body), 1).fillRoundedRect(37, 24, 22, 26, 5);
  g.fillStyle(bone, 1).fillRect(47, 24, 2, 26); // columna
  for (let i = 0; i < 4; i++) g.fillRect(40, 28 + i * 5, 16, 2);
  g.fillStyle(boneD, 1).fillRect(41, 46, 14, 3); // pelvis
  // Brazos óseos con cuchillos de obsidiana (atrás y adelante).
  g.fillStyle(boneD, 1).fillRect(32, 27, 4, 16).fillRect(30, 42, 3, 10);
  g.fillStyle(hexColor(c.knife), 1).fillTriangle(28, 52, 34, 52, 31, 64);
  g.fillStyle(bone, 1).fillRect(60, 27, 4, 14).fillRect(64, 38, 10, 3);
  g.fillStyle(hexColor(c.knife), 1).fillTriangle(73, 34, 73, 44, 86, 39);
  g.fillStyle(hexColor(c.knifeEdge), 1).fillRect(74, 38, 10, 1).fillRect(30, 53, 1, 9);
  // Cráneo estilizado (sin gore: hueso liso) con cuencas encendidas y "cabello" de estrellas.
  g.fillStyle(bone, 1).fillCircle(49, 15, 9);
  g.fillRect(44, 19, 11, 6);
  g.fillStyle(hexColor(c.body), 1).fillRect(45, 23, 9, 1).fillRect(47, 21, 1, 3).fillRect(50, 21, 1, 3);
  g.fillStyle(hexColor(c.eyes), 1).fillRect(46, 13, 3, 3).fillRect(52, 13, 3, 3);
  g.fillStyle(star, 1).fillRect(38, 6, 2, 2).fillRect(42, 2, 2, 2).fillRect(56, 3, 2, 2).fillRect(60, 8, 2, 2).fillRect(36, 12, 1, 1).fillRect(62, 14, 1, 1);
  g.generateTexture(TEX, T.frame.w, T.frame.h);
  g.destroy();
  return TEX;
}

/* ========================= Barra compartida de las Tzitzimime ========================= */

/** Las Tzitzimime vivas de la escena (para la barra de jefe compartida). */
const roster = new Set<Tzitzimitl>();
let rosterTotal = 0;
let rosterFallen = 0;

/** ¿Hay una Itzpapálotl ya despierta? Entonces la barra de jefe es suya. */
function itzpaOwnsBar(world: WorldApi): boolean {
  return world.enemies.some((e) => e.kind === 'itzpapalotl' && e.alive && 'hatched' in e && (e as { hatched: boolean }).hatched);
}

function refreshSharedBar(world: WorldApi): void {
  if (itzpaOwnsBar(world)) return;
  const active = [...roster].filter((t) => t.engaged);
  if (active.length === 0) return;
  const sum = active.reduce((a, t) => a + t.hpRatio, 0);
  updateBossBar(sum / active.length, rosterFallen, Math.max(rosterTotal, rosterFallen + roster.size), active.some((t) => t.isStunned));
}

export class Tzitzimitl extends EnemyBase {
  kind: EnemyKind = 'tzitzimitl';
  private st: St = 'dormant';
  private stT = 0;
  private stunLeft = 0;
  private lastPerfect = false;
  private told = { neutral: false };
  private rain: RainSpot[] = [];
  private rainPending = 0;
  private rainT = 0;
  private rainFirst = false;
  private chargeDir = { x: 1, y: 0 };
  private chargeLeft = 0;
  private hitDone = false;
  private diveCd = randRange(T.dive.cooldown) * 0.5;
  private warnGfx: Phaser.GameObjects.Graphics;
  private barGfx: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Image;

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    super(world, x, y, {
      hp: T.hp,
      radius: T.radius,
      height: T.height,
      ecos: T.ecos,
      feetY: T.frame.feetY,
      frameH: T.frame.h,
      fallbackTex: ensureTzitzimitlTexture(world.scene),
      textureKey: 'tzitzimitl_reposo',
      shadowW: T.shadowW,
      kitId: 'tzitzimitl',
    });
    this.group = group;
    const scene = this.scene;
    this.warnGfx = scene.add.graphics();
    this.barGfx = scene.add.graphics();
    this.glow = scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(T.colors.star)).setAlpha(0.25).setScale(1.6);
    roster.add(this);
    rosterTotal++;
    // La LevelScene se reinicia al morir o cambiar de sección: la lista compartida no debe quedar sucia.
    scene.events.once('shutdown', () => {
      if (roster.delete(this) && roster.size === 0) {
        rosterTotal = 0;
        rosterFallen = 0;
      }
    });
    bus.scoped(scene, 'balam:strike', (ev) => this.onBalam(ev.x, ev.y));
    this.play('tzitzimitl_reposo');
    this.render(0);
    this.placeFx();
  }

  /* ---------------------------- Consultas ---------------------------- */

  /** Despierta (ya peleando). */
  get engaged(): boolean {
    return this.st !== 'dormant' && this.st !== 'falling';
  }
  /** Ya cayó (o salió del mundo). Método para que TS no estreche el estado tras damage(). */
  get down(): boolean {
    return !this._alive || this.st === 'falling';
  }
  get isStunned(): boolean {
    return this.st === 'stunned';
  }
  get isAware(): boolean {
    return this.st !== 'dormant';
  }
  /** En el aire durante el descenso: intocable. */
  get airborne(): boolean {
    return this.st === 'diveUp' || this.st === 'diveAim' || this.st === 'diveWarn' || this.st === 'diveFall';
  }

  /* ----------------------------- Estado ----------------------------- */

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      dormant: 'reposo', intro: 'invocar', idle: 'caminar', diveWindup: 'salto', diveUp: 'subida', diveAim: 'subida',
      diveWarn: 'subida', diveFall: 'caida', diveRecover: 'aterrizar', rainWindup: 'conjuro', chargeWindup: 'golpe',
      charge: 'ataque', chargeRecover: 'reposo', stunned: 'aturdido', falling: 'morir',
    };
    this.play(`tzitzimitl_${anim[st]}`);
  }

  private activate(): void {
    if (this.st !== 'dormant') return;
    this.set('intro');
    sfx('tzitzimitl_grito');
    this.world.shake(JUICE.shake.bossPhase.intensity * 0.6, JUICE.shake.bossPhase.ms * 0.6);
    burst(this.scene, 'light', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 10);
    if (!itzpaOwnsBar(this.world)) showBossBar(roster.size > 1 ? T.groupName : T.name);
    refreshSharedBar(this.world);
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private toIdle(extra = 0): void {
    this.set('idle');
    this.stT = -(randRange(T.idleBetween) + extra);
  }

  private telegraph(color: number): void {
    // Aviso visible: brillo en el pecho y anillo en el suelo (EnemyBase.warnFx).
    this.warnFx(color);
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 14) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    if (this.st === 'falling') {
      this.placeFx();
      return;
    }
    const p = this.world.player;
    this.stT += dt;
    if (this.diveCd > 0) this.diveCd -= dt;
    if (this.stunAcc > 0 && this.st !== 'stunned') this.stunAcc = Math.max(0, this.stunAcc - T.stunDecay * dt);
    if (!this.airborne) this.stepKnockback(dt);
    this.warnGfx.clear();

    switch (this.st) {
      case 'dormant':
        if (planeDist(this.x, this.y, p.x, p.y) < T.activateRadius) this.activate();
        break;
      case 'intro':
        this.facePlayer();
        if (this.stT >= T.introSeconds) this.toIdle();
        break;
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'diveWindup':
        // En la picada y aturdida sigue mirando al jugador (con el kit por cuadros se veía de espaldas).
        this.facePlayer();
        this.telegraph(0x302050);
        if (this.stT >= T.dive.windup) {
          this.set('diveUp');
          burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 12);
        }
        break;
      case 'diveUp': {
        this.facePlayer();
        const k = Math.min(1, this.stT / T.dive.riseSeconds);
        this.z = T.dive.height * k * k;
        if (k >= 1) this.set('diveAim');
        break;
      }
      case 'diveAim':
        this.facePlayer();
        // Arriba, fuera de la pantalla: la sombra sigue al jugador.
        this.followGround(p.x, p.y);
        this.drawDiveWarn(false);
        if (this.stT >= T.dive.trackSeconds) this.set('diveWarn');
        break;
      case 'diveWarn':
        this.facePlayer();
        this.drawDiveWarn(true);
        if (this.stT >= T.dive.warnSeconds) {
          this.set('diveFall');
          sfx('tzitzimitl_desciende');
        }
        break;
      case 'diveFall': {
        this.facePlayer();
        const k = Math.min(1, this.stT / T.dive.fallSeconds);
        this.z = T.dive.height * (1 - k);
        this.drawDiveWarn(true);
        if (k >= 1) this.diveImpact();
        break;
      }
      case 'diveRecover':
        this.facePlayer();
        if (this.stT >= T.dive.recover) this.toIdle();
        break;
      case 'rainWindup':
        this.facePlayer();
        this.telegraph(0x605020);
        if (Math.random() < dt * 18) burst(this.scene, 'light', this.x + rand(-20, 20), this.y - this.height - rand(0, 20), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= T.rain.windup) this.startRain();
        break;
      case 'chargeWindup':
        this.telegraph(0x601020);
        this.drawChargeWarn();
        if (this.stT >= T.charge.windup) {
          this.set('charge');
          this.chargeLeft = T.charge.distance;
          sfx('tzitzimitl_embestida');
        }
        break;
      case 'charge':
        this.updateCharge(dt);
        break;
      case 'chargeRecover':
        this.facePlayer();
        if (this.stT >= T.charge.recover) this.toIdle();
        break;
      case 'stunned':
        this.facePlayer();
        this.stunLeft -= dt;
        if (this.stunLeft <= 0) {
          this.setStars(false);
          this.stunAcc = 0;
          this.toIdle(0.2);
        }
        break;
    }

    if (!this.airborne && this.st !== 'diveWindup') this.z = 0;
    this.updateRainSpawns(dt);
    this.updateRain(dt);
    if (!this.airborne) this.separate(dt, T.separation);
    if (roster.values().next().value === this) refreshSharedBar(this.world);
    // Aura estelar azul-violeta y polvo de estrellas al embestir o al volar (descenso en picada).
    const quiet = (this.st as string) === 'dormant' || (this.st as string) === 'falling';
    this.setAura(hexColor(T.colors.skirtLight), quiet ? 0 : 0.2, { w: 84, h: 112, dy: 0.5, pulse: 0.3 });
    this.trailFx(dt, !quiet && (this.st === 'charge' || this.airborne), 'stardust', this.st === 'charge' ? 32 : 8, 0.5, 10);
    this.render(dt);
    this.placeFx();
  }

  private updateIdle(dt: number): void {
    const p = this.world.player;
    const side = Math.sign(this.x - p.x) || (this.uid % 2 ? 1 : -1);
    const tx = p.x + side * T.keepDistance;
    const dx = tx - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const step = Math.min(d, T.moveSpeed * dt);
      this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.7);
    }
    this.facePlayer();
    if (this.stT < 0) return;
    this.chooseAttack();
  }

  private chooseAttack(): void {
    const w: Record<Attack, number> = { ...T.weights };
    if (this.diveCd > 0) w.dive = 0;
    // Solo una a la vez cae desde arriba (se leería mal con tres sombras).
    if ([...roster].some((t) => t !== this && t.airborne)) w.dive = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick: Attack = 'rain';
    for (const [k, v] of Object.entries(w) as Array<[Attack, number]>) {
      r -= v;
      if (r <= 0 && v > 0) {
        pick = k;
        break;
      }
    }
    switch (pick) {
      case 'dive':
        this.diveCd = randRange(T.dive.cooldown);
        this.set('diveWindup');
        break;
      case 'rain':
        sfx('estrellas_lluvia');
        this.set('rainWindup');
        break;
      case 'charge': {
        const p = this.world.player;
        const dx = p.x - this.x;
        const dy = (p.y - this.y) * 0.6;
        const d = Math.hypot(dx, dy) || 1;
        this.chargeDir = { x: dx / d, y: dy / d };
        this.facing = dx >= 0 ? 1 : -1;
        this.set('chargeWindup');
        break;
      }
    }
  }

  /* ------------------------------ Descenso ------------------------------ */

  /** En el aire: se coloca sobre el punto transitable más cercano al jugador (su sombra lo delata). */
  private followGround(tx: number, ty: number): void {
    if (this.world.isWalkable(tx, ty, this.radius)) {
      this.x = tx;
      this.y = ty;
    } else {
      const pt = this.world.randomPointNear(tx, ty, 20);
      this.x = pt.x;
      this.y = pt.y;
    }
  }

  private drawDiveWarn(locked: boolean): void {
    const D = T.dive;
    const color = hexColor(T.colors.warn);
    const k = this.st === 'diveWarn' ? Math.min(1, this.stT / D.warnSeconds) : this.st === 'diveFall' ? 1 : 0.3;
    const a = locked ? (Math.floor(this.stT * 14) % 2 === 0 ? 0.85 : 0.4) : 0.35;
    const g = this.warnGfx.setDepth(DEPTH.shadow + 1);
    g.fillStyle(0x000000, 0.25 + 0.3 * k).fillEllipse(this.x, this.y, D.radius * 2 * (0.4 + 0.6 * k), D.radius * (0.4 + 0.6 * k));
    g.lineStyle(1, color, a).strokeEllipse(this.x, this.y, D.radius * 2, D.radius);
  }

  private diveImpact(): void {
    const D = T.dive;
    const p = this.world.player;
    this.z = 0;
    sfx('tzitzimitl_cae');
    this.world.shake(JUICE.shake.bossSlam.intensity, JUICE.shake.bossSlam.ms);
    burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 20);
    burst(this.scene, 'light', this.x, this.y - 10, this.y + FX_DEPTH_BIAS, 12);
    this.shockRing(this.x, this.y, D.radius * 2.2, hexColor(T.colors.star));
    if (planeDist(this.x, this.y, p.x, p.y) <= D.radius + p.radius && p.z < 16 && !p.isDodging) {
      hitPlayer(this.world, { damage: D.damage, stun: 0, kind: 'shockwave', sourceX: this.x, knockback: D.knockback });
    }
    this.set('diveRecover');
  }

  private shockRing(x: number, y: number, r: number, color: number): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.shadow + 1);
    const o = { k: 0 };
    this.scene.tweens.add({
      targets: o, k: 1, duration: 300,
      onUpdate: () => g.clear().lineStyle(3, color, 1 - o.k).strokeEllipse(x, y, r * 2 * o.k, r * o.k),
      onComplete: () => g.destroy(),
    });
  }

  /* ------------------------------ Lluvia de estrellas ------------------------------ */

  private startRain(): void {
    this.rainPending = Phaser.Math.Between(T.rain.count[0], T.rain.count[1]);
    this.rainFirst = true;
    this.rainT = 0;
    this.toIdle(0.4);
  }

  private updateRainSpawns(dt: number): void {
    if (this.rainPending <= 0) return;
    this.rainT -= dt;
    if (this.rainT > 0) return;
    const R = T.rain;
    const p = this.world.player;
    const first = this.rainFirst;
    this.rainFirst = false;
    this.rainPending--;
    this.rainT = R.gap;
    // La primera cae donde está el jugador; las demás alrededor.
    const a = Math.random() * Math.PI * 2;
    const d = first ? 0 : rand(R.radius, R.spread);
    let x = p.x + Math.cos(a) * d;
    let y = p.y + Math.sin(a) * d * 0.5;
    if (!this.world.isWalkable(x, y, 4)) ({ x, y } = this.world.randomPointNear(p.x, p.y, R.spread * 0.5));
    this.rain.push({ x, y, t: 0, gfx: this.scene.add.graphics() });
  }

  private updateRain(dt: number): void {
    const R = T.rain;
    const p = this.world.player;
    const color = hexColor(T.colors.rain);
    for (let i = this.rain.length - 1; i >= 0; i--) {
      const s = this.rain[i];
      s.t += dt;
      const k = Math.min(1, s.t / R.warnSeconds);
      const g = s.gfx.clear().setDepth(DEPTH.shadow + 1);
      if (k < 1) {
        const a = Math.floor(s.t * 12) % 2 === 0 ? 0.8 : 0.4;
        g.lineStyle(1, color, a).strokeEllipse(s.x, s.y, R.radius * 2, R.radius);
        g.fillStyle(color, 0.1 + 0.3 * k).fillEllipse(s.x, s.y, R.radius * 2 * k, R.radius * k);
        // La estrella que cae (de arriba hacia su círculo).
        g.fillStyle(0xffffff, 0.9).fillRect(s.x - 1, s.y - 160 * (1 - k) - 8, 3, 3);
        continue;
      }
      // Estalla.
      burst(this.scene, 'light', s.x, s.y - 6, s.y + FX_DEPTH_BIAS, 8);
      if (planeDist(s.x, s.y, p.x, p.y) <= R.radius + p.radius * 0.5 && p.z < R.maxPlayerZ && !p.isDodging) {
        hitPlayer(this.world, { damage: R.damage, stun: 0, kind: 'projectile', sourceX: s.x, knockback: R.knockback });
      }
      s.gfx.destroy();
      this.rain.splice(i, 1);
    }
  }

  private clearRain(): void {
    this.rain.forEach((s) => s.gfx.destroy());
    this.rain = [];
    this.rainPending = 0;
  }

  /* ------------------------------ Embestida ------------------------------ */

  private drawChargeWarn(): void {
    const C = T.charge;
    const color = hexColor(T.colors.warn);
    const a = Math.floor(this.stT * 14) % 2 === 0 ? 0.6 : 0.25;
    const g = this.warnGfx.setDepth(DEPTH.shadow + 1);
    const x1 = this.x + this.chargeDir.x * C.distance;
    const y1 = this.y + this.chargeDir.y * C.distance;
    g.lineStyle(C.halfWidth * 2, color, a * 0.35).lineBetween(this.x, this.y, x1, y1);
    g.lineStyle(1, color, a).lineBetween(this.x, this.y, x1, y1);
  }

  private updateCharge(dt: number): void {
    const C = T.charge;
    const p = this.world.player;
    const step = Math.min(this.chargeLeft, C.speed * dt);
    const ox = this.x;
    const oy = this.y;
    this.world.moveActor(this, this.chargeDir.x * step, this.chargeDir.y * step);
    const moved = Math.hypot(this.x - ox, this.y - oy);
    this.chargeLeft -= step;
    if (Math.random() < dt * 30) burst(this.scene, 'light', this.x - this.facing * 10, this.y - rand(10, 60), this.y + FX_DEPTH_BIAS, 1);
    if (!this.hitDone && planeDist(this.x, this.y, p.x, p.y) < this.radius + p.radius + 6 && Math.abs(p.y - this.y) < DEPTH_TOLERANCE * 1.5 && p.z < C.dodgeHeight && !p.isDodging) {
      this.hitDone = true;
      hitPlayer(this.world, { damage: C.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: C.knockback });
    }
    // Termina al recorrer la distancia o al chocar con algo.
    if (this.chargeLeft <= 0 || moved < step * 0.3) {
      burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 8);
      this.set('chargeRecover');
    }
  }

  /* ------------------------------ Aturdir / golpes ------------------------------ */

  private cancelAttack(): void {
    this.warnGfx.clear();
    if (this.airborne) this.z = 0;
  }

  private stun(seconds: number): void {
    if (this.st === 'falling' || this.st === 'dormant' || this.st === 'intro') return;
    if (this.airborne) return; // en el aire no la alcanza
    const was = this.st === 'stunned';
    this.cancelAttack();
    if (!was) {
      this.set('stunned');
      this.setStars(true);
      burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 6);
    }
    this.stunLeft = Math.max(was ? this.stunLeft : 0, seconds);
  }

  private onBalam(x: number, y: number): void {
    if (!this._alive || !this.engaged) return;
    if (planeDist(this.x, this.y, x, y) > T.balam.radius) return;
    this.stun(T.balam.stunSeconds);
  }

  private damage(n: number, perfect = false): void {
    if (n <= 0) return;
    this.lastPerfect = perfect || this.lastPerfect;
    this.hp -= n;
    if (this.hp <= 0) this.fall();
  }

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'falling') return false;
    if (this.airborne || this.st === 'intro') return false;
    if (this.st === 'dormant') this.activate();
    this.flashT = JUICE.flashMs / 1000;
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (hit.kind === 'laser-green') {
      // Verde: aturde (acumula) y casi no daña.
      this.stunAcc += hit.stun * T.laser.greenStun;
      this.damage(hit.damage * T.laser.greenDamageMult);
      if (!this.down && this.stunAcc >= T.stunThreshold && this.st !== 'stunned') {
        this.stunAcc = 0;
        this.stun(T.stunSeconds);
      }
      return true;
    }
    const mult = hit.kind === 'laser-red' ? T.laser.redMult : 1;
    this.damage(hit.damage * mult);
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'falling' || ev.outcome === 'fail') return false;
    const near = planeDist(this.x, this.y, ev.x, ev.y) <= T.spellRange;
    if (this.st === 'dormant') {
      if (near) this.activate();
      return false;
    }
    if (this.airborne || this.st === 'intro') return false;
    const perfect = ev.outcome === 'perfect';
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    switch (ev.spellId) {
      case 'PROTECCION': {
        // ✅ La repele y la aturde (solo de cerca).
        const P = T.proteccion;
        if (planeDist(this.x, this.y, ev.x + ev.facing * SPELLS_FX.PROTECCION.forward, ev.y) > P.radius) return false;
        this.flashT = JUICE.flashMs / 1000;
        this.onDamaged({ damage: 0, stun: 0, kind: 'spell', sourceX: ev.x, knockback: P.knockback * (0.6 + 0.4 * power) });
        burst(this.scene, 'light', this.x, this.y - this.height * 0.5, this.y + FX_DEPTH_BIAS, 10);
        this.damage(P.damage * power, perfect);
        if (!this.down) this.stun(P.stunSeconds * (0.6 + 0.4 * power));
        bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
        return true;
      }
      case 'LUZ': {
        if (!inLuzRadius(ev, this.x, this.y, 'stunRadius', this.radius)) return false;
        this.flashT = JUICE.flashMs / 1000;
        this.world.hitstop(JUICE.hitstopMs.spell);
        burst(this.scene, 'light', this.x, this.y - this.height * 0.5, this.y + FX_DEPTH_BIAS, 14);
        bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
        this.damage(T.luz.damage * Math.max(0.3, power), perfect);
        if (!this.down) this.stun(T.luz.stunSeconds);
        return true;
      }
      case 'SOL': {
        if (!inSolLine(ev, this.x, this.y, this.radius)) return false;
        this.flashT = JUICE.flashMs / 1000;
        this.world.hitstop(JUICE.hitstopMs.spell);
        burst(this.scene, 'sun', this.x, this.y - this.height * 0.5, this.y + FX_DEPTH_BIAS, 14);
        bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
        this.damage(solDamage(ev) * T.sol.mult, perfect);
        return true;
      }
    }
    // ➖ El resto no le hace nada; una pista la primera vez.
    if (!this.told.neutral && planeDist(this.x, this.y, ev.x, ev.y) <= 200 && ev.spellId !== 'MAMA' && ev.spellId !== 'ECOS') {
      this.told.neutral = true;
      bus.emit('hud:toast', { text: `${ev.spellId} no le hace nada. Las Tzitzimime temen a LUZ, SOL y PROTECCION`, ms: 3000 });
    }
    return false;
  }

  /* ------------------------------ Caída ------------------------------ */

  /** Vida en 0: se deshace en polvo de estrellas (sin violencia). */
  private fall(): void {
    if (this.st === 'falling') return;
    this.hp = 0;
    this.cancelAttack();
    this.clearRain();
    this.setStars(false);
    this.set('falling');
    this._exhausted = true;
    this.z = 0;
    roster.delete(this);
    rosterFallen++;
    sfx('tzitzimitl_polvo');
    this.world.flash(hexColor(T.colors.star), 160);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    this.setBaseTint(0xfff8e0);
    // El cuerpo se vuelve luz y se deshace hacia arriba, entre estrellas.
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, scaleY: 1.15, duration: T.fallSeconds * 1000, ease: 'Quad.easeIn' });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: T.fallSeconds * 1000 });
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      this.scene.time.delayedCall((i * T.fallSeconds * 1000) / steps, () => {
        if (!this._alive) return;
        burst(this.scene, 'light', this.x + rand(-14, 14), this.y - rand(10, this.height), this.y + FX_DEPTH_BIAS, 4);
        burst(this.scene, 'stun', this.x + rand(-12, 12), this.y - rand(20, this.height), this.y + FX_DEPTH_BIAS, 2);
      });
    }
    const amount = Math.round(this._ecos * (this.lastPerfect ? T.perfectBonus : 1));
    this.scene.time.delayedCall(T.fallSeconds * 1000, () => {
      if (!this._alive) return;
      purifyFx(this.scene, this.x, this.y, 0.9);
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 40 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: this.lastPerfect });
      this.leaveWorld();
    });
    // Barra compartida: si era la última, se oculta (salvo que ya sea de Itzpapálotl).
    if (roster.size === 0) {
      if (!itzpaOwnsBar(this.world)) {
        updateBossBar(0, rosterFallen, Math.max(rosterTotal, rosterFallen), false);
        this.scene.time.delayedCall(T.fallSeconds * 1000, () => {
          if (roster.size === 0 && !itzpaOwnsBar(this.world)) hideBossBar();
        });
      }
      rosterTotal = 0;
      rosterFallen = 0;
    } else {
      refreshSharedBar(this.world);
    }
  }

  /** Se disipa sin más (p. ej. al calmarse Itzpapálotl): Ecos base, sin bono. */
  dissipate(): void {
    if (!this._alive || this.st === 'falling') return;
    this.lastPerfect = false;
    this.fall();
  }

  /* ------------------------------ Efectos ------------------------------ */

  private placeFx(): void {
    const t = this.scene.time.now / 1000;
    const top = this.y - this.z - this.bob;
    const falling = this.st === 'falling';
    this.glow
      .setPosition(this.x, top - this.height * 0.45)
      .setAlpha(falling ? 0 : this.st === 'dormant' ? 0.12 : 0.22 + 0.08 * Math.sin(t * 3 + this.uid))
      .setDepth(this.y - 0.1);
    // Barrita propia sobre la cabeza.
    const g = this.barGfx.clear();
    if (!this.engaged || this.st === 'diveAim' || this.st === 'diveWarn' || this.st === 'diveUp') return;
    const w = 34;
    const x0 = Math.round(this.x - w / 2);
    const y0 = Math.round(top - this.height - 10);
    g.setDepth(this.y + FX_DEPTH_BIAS);
    g.fillStyle(0x000000, 0.6).fillRect(x0 - 1, y0 - 1, w + 2, 5);
    g.fillStyle(this.st === 'stunned' ? 0xffffff : hexColor(T.colors.bar), 1).fillRect(x0, y0, Math.max(0, Math.round(w * this.hpRatio)), 3);
  }

  protected onDestroy(): void {
    this.clearRain();
    this.warnGfx.destroy();
    this.barGfx.destroy();
    this.glow.destroy();
    if (roster.delete(this)) {
      // Salió del mundo sin caer (cambio de sección / reinicio).
      if (roster.size === 0) {
        rosterTotal = 0;
        rosterFallen = 0;
      }
    }
  }
}
