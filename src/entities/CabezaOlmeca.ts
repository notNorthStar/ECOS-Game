import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { FX_DEPTH_BIAS, JUICE } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import { EnemyBase, FB, burst, hexColor, hitPlayer, inSolLine, inFuegoLine, planeDist, purifyFx, rand, randRange } from './EnemyBase';
import { Espiritu } from './Espiritu';

/**
 * Cabeza Olmeca Poseída (jefe del Nivel 3, contratos §6). Estática, gran escala (cuadro 160×128, ~120 px).
 * PLACEHOLDER SIMPLE (AGENTS §8.0): bloque de piedra con rasgos olmecas básicos y ojos que brillan.
 * - Fase 1: ondas de choque por el suelo en carriles de profundidad (cambiar de carril con W/S o saltar).
 * - Fase 2: + láseres oculares anunciados que barren la franja a la profundidad del jugador (W/S o escudo).
 * - Fase 3: + invoca espíritus lunaOnly (usar Luna + LUZ).
 * Tras cada ataque grande sus ojos se apagan unos segundos (ventana): LUZ / SOL / VOZ avanzan su "sello".
 * Cambia de fase al completar seal.perPhase[fase]. CALMA la enfurece (contraataque rápido). El láser no le hace nada.
 * Al vencerla: 'boss:calmed' (Combat disipa a sus espíritus), ~300 Ecos (perfecto ×1.25).
 */

const B = enemiesData.cabeza_olmeca;
const TEX = '__cb_cabeza_olmeca';

type Phase = 1 | 2 | 3;
type Attack = 'waves' | 'beams' | 'summon';
type St =
  | 'dormant'
  | 'intro'
  | 'idle'
  | 'wavesWindup'
  | 'waves'
  | 'beamsWindup'
  | 'beams'
  | 'summon'
  | 'vulnerable'
  | 'phaseChange'
  | 'calmed';

interface LaneWave {
  y: number;
  half: number;
  t: number; // < 0: aviso
  speed: number;
  hitDone: boolean;
  gfx: Phaser.GameObjects.Graphics;
  fx: Phaser.GameObjects.Sprite[];
}

interface Beam {
  y: number;
  side: 1 | -1;
  t: number; // < 0: aviso
  hitT: number;
  gfx: Phaser.GameObjects.Graphics;
}

function ensureCabezaTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const g = scene.make.graphics({}, false);
  const stone = 0x6e7464;
  const dark = 0x4a5044;
  const light = 0x8e9682;
  // Orejeras.
  g.fillStyle(dark, 1).fillRoundedRect(10, 44, 18, 50, 6).fillRoundedRect(132, 44, 18, 50, 6);
  // Bloque de la cara.
  g.fillStyle(stone, 1).fillRoundedRect(22, 14, 116, 110, 18);
  g.fillStyle(light, 1).fillRoundedRect(28, 18, 30, 60, 10); // luz arriba a la izquierda
  g.fillStyle(stone, 1).fillRoundedRect(34, 30, 92, 90, 14);
  // Casco con banda y adorno central.
  g.fillStyle(dark, 1).fillRoundedRect(18, 8, 124, 30, 12);
  g.fillStyle(light, 1).fillRect(26, 30, 108, 4);
  g.fillStyle(0x3a4036, 1).fillRect(72, 12, 16, 18);
  // Cejas y cuencas de los ojos.
  g.fillStyle(dark, 1).fillRect(44, 44, 30, 5).fillRect(86, 44, 30, 5);
  g.fillStyle(0x2a2e26, 1).fillEllipse(60, 56, 26, 11).fillEllipse(100, 56, 26, 11);
  // Nariz ancha.
  g.fillStyle(light, 1).fillTriangle(80, 52, 66, 86, 94, 86);
  g.fillStyle(dark, 1).fillEllipse(72, 84, 8, 5).fillEllipse(88, 84, 8, 5);
  // Labios gruesos.
  g.fillStyle(dark, 1).fillRoundedRect(56, 94, 48, 16, 7);
  g.fillStyle(0x2a2e26, 1).fillRect(60, 101, 40, 3);
  // Grietas.
  g.lineStyle(1, 0x3a4036, 1).lineBetween(40, 70, 48, 84).lineBetween(48, 84, 44, 98).lineBetween(122, 64, 116, 80);
  g.generateTexture(TEX, B.frame.w, B.frame.h);
  g.destroy();
  return TEX;
}

export class CabezaOlmeca extends EnemyBase {
  kind: EnemyKind = 'cabeza_olmeca';
  private st: St = 'dormant';
  private stT = 0;
  private phase: Phase = 1;
  private seal = 0;
  private sealDone = 0;
  private readonly sealTotal = B.seal.perPhase.reduce((a, b) => a + b, 0);
  private vulnerableLeft = 0;
  private lastPerfect = false;
  private lanes: LaneWave[] = [];
  private slamsLeft = 0;
  private slamT = 0;
  private rage = false;
  private beams: Beam[] = [];
  private beamsLeft = 0;
  private beamT = 0;
  private eyes: Phaser.GameObjects.Image[] = [];
  private eyeMode: 'on' | 'charge' | 'off' | 'calm' = 'on';
  private told = { laser: false, closed: false, rage: false, luna: false, window: false, memoria: false };

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    super(world, x, y, {
      hp: 100,
      radius: B.radius,
      height: B.height,
      ecos: B.ecos,
      feetY: B.frame.feetY,
      frameH: B.frame.h,
      fallbackTex: ensureCabezaTexture(world.scene),
      textureKey: 'cabeza_olmeca_reposo',
      shadowW: 130,
      kitId: 'cabeza_olmeca',
    });
    this.group = group;
    this.facing = 1;
    for (let i = 0; i < 2; i++) {
      this.eyes.push(this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(B.eyes.color)).setAlpha(0.35));
    }
    this.play('cabeza_olmeca_reposo');
    this.render(0);
    this.placeEyes();
  }

  /** Fase actual (para el director). */
  get currentPhase(): Phase {
    return this.phase;
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    const anim: Record<St, string> = {
      dormant: 'cabeza_olmeca_reposo',
      intro: 'cabeza_olmeca_invocar',
      idle: 'cabeza_olmeca_reposo',
      wavesWindup: 'cabeza_olmeca_golpe',
      waves: 'cabeza_olmeca_reposo',
      beamsWindup: 'cabeza_olmeca_ataque',
      beams: 'cabeza_olmeca_ataque',
      summon: 'cabeza_olmeca_invocar',
      vulnerable: 'cabeza_olmeca_aturdido',
      phaseChange: 'cabeza_olmeca_dano',
      calmed: 'cabeza_olmeca_purificar',
    };
    this.play(anim[st]);
  }

  private pushHud(): void {
    const cap = B.seal.perPhase[this.phase - 1];
    updateBossBar(1 - (this.sealDone + this.seal) / this.sealTotal, this.seal, cap, this.st === 'vulnerable');
  }

  private activate(): void {
    if (this.st !== 'dormant') return;
    this.set('intro');
    sfx('jefe_rugido');
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    showBossBar(B.name);
    this.pushHud();
    bus.emit('olmeca:phase', { phase: 1 });
    bus.emit('boss:phase', { phase: 1 });
  }

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;

    switch (this.st) {
      case 'dormant':
        if (planeDist(this.x, this.y, p.x, p.y) < B.activateRadius) this.activate();
        break;
      case 'intro':
        this.eyeMode = 'charge';
        if (this.stT > 1.6) this.toIdle();
        break;
      case 'idle':
        this.eyeMode = 'on';
        if (this.stT > 0) this.chooseAttack();
        break;
      case 'wavesWindup':
        this.eyeMode = 'charge';
        this.telegraph(true);
        if (this.stT >= (this.rage ? B.rage.windup : B.waves.windup)) {
          this.telegraph(false);
          this.slam();
          this.set('waves');
        }
        break;
      case 'waves':
        this.eyeMode = 'on';
        if (this.lanes.length === 0) {
          if (this.slamsLeft > 0) {
            this.slamT -= dt;
            if (this.slamT <= 0) this.slam();
          } else if (this.rage) {
            this.rage = false;
            this.toIdle();
          } else this.startVulnerable();
        }
        break;
      case 'beamsWindup':
        this.eyeMode = 'charge';
        this.telegraph(true);
        if (this.stT >= B.beams.windup) {
          this.telegraph(false);
          this.beamsLeft = Phaser.Math.Between(B.beams.count[0], B.beams.count[1]);
          this.beamT = 0;
          this.set('beams');
        }
        break;
      case 'beams':
        this.eyeMode = 'charge';
        if (this.beams.length === 0) {
          if (this.beamsLeft > 0) {
            this.beamT -= dt;
            if (this.beamT <= 0) {
              this.beamsLeft--;
              this.fireBeam();
            }
          } else this.startVulnerable();
        }
        break;
      case 'summon':
        this.eyeMode = 'charge';
        if (this.stT >= B.summon.windup) {
          this.summon();
          this.toIdle();
        }
        break;
      case 'vulnerable':
        this.eyeMode = 'off';
        this.vulnerableLeft -= dt;
        if (Math.random() < dt * 6) burst(this.scene, 'dust', this.x + rand(-40, 40), this.y - rand(10, 100), this.y + FX_DEPTH_BIAS, 1);
        this.pushHud();
        if (this.vulnerableLeft <= 0) this.endVulnerable();
        break;
      case 'phaseChange':
        this.eyeMode = 'charge';
        if (Math.random() < dt * 20) burst(this.scene, 'dark', this.x + rand(-60, 60), this.y - rand(20, 110), this.y + FX_DEPTH_BIAS, 3);
        if (this.stT >= B.phaseChangeSeconds) this.toIdle();
        break;
      case 'calmed':
        this.eyeMode = 'calm';
        break;
    }

    if (this.st !== 'calmed') this.pushPlayer();
    this.updateLanes(dt);
    this.updateBeams(dt);
    this.render(dt);
    this.placeEyes();
  }

  private toIdle(): void {
    this.set('idle');
    this.stT = -randRange(B.idleBetween) * (this.phase === 3 ? 0.8 : 1);
  }

  private telegraph(on: boolean): void {
    // Aviso visible: brillo en el pecho y anillo en el suelo (EnemyBase.warnFx).
    if (on) this.warnFx(0x602018);
    if (this.flashT > 0) return;
    if (on) {
      const blink = Math.floor(this.stT * 12) % 2 === 0;
      this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? 0x602018 : 0x100404);
    } else this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
  }

  /** Es un bloque enorme: empuja al jugador fuera de su base. */
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

  private placeEyes(): void {
    const t = performance.now() / 1000;
    const color =
      this.eyeMode === 'off' ? hexColor(B.eyes.offColor) : this.eyeMode === 'calm' ? hexColor(B.eyes.calmColor) : hexColor(B.eyes.color);
    const base = this.eyeMode === 'off' ? 0.15 : this.eyeMode === 'charge' ? 0.85 + 0.15 * Math.sin(t * 30) : this.eyeMode === 'calm' ? 0.5 : 0.55 + 0.2 * Math.sin(t * 4);
    const scale = this.eyeMode === 'charge' ? 1.1 : this.eyeMode === 'off' ? 0.5 : 0.8;
    const top = this.y - this.z - this.bob;
    this.eyes.forEach((e, i) => {
      e.setPosition(this.x + (i === 0 ? -B.eyes.dx : B.eyes.dx), top - B.eyes.dy)
        .setTint(color)
        .setAlpha(Math.max(0, base) * this.sprite.alpha)
        .setScale(scale, scale * 0.6)
        .setDepth(this.y + FX_DEPTH_BIAS);
    });
  }

  private chooseAttack(): void {
    const w: Record<string, number> = { ...(this.phase === 1 ? B.weights.phase1 : this.phase === 2 ? B.weights.phase2 : B.weights.phase3) };
    if (w.summon && this.aliveSpirits() >= B.summon.maxSpirits) w.summon = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick: Attack = 'waves';
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) {
        pick = k as Attack;
        break;
      }
    }
    if (pick === 'waves') this.startWaves(false);
    else if (pick === 'beams') {
      sfx('olmeca_carga');
      this.set('beamsWindup');
    } else {
      sfx('jefe_rugido');
      this.set('summon');
    }
  }

  /* ----------------------- Fase 1: ondas por carriles ----------------------- */

  private startWaves(rage: boolean): void {
    this.rage = rage;
    this.slamsLeft = rage ? 1 : Phaser.Math.Between(B.waves.slams[0], B.waves.slams[1]);
    this.slamT = 0;
    this.set('wavesWindup');
  }

  private slam(): void {
    this.slamsLeft--;
    this.slamT = B.waves.slamGap;
    sfx('jefe_golpe');
    this.world.shake(JUICE.shake.bossSlam.intensity, JUICE.shake.bossSlam.ms);
    burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 24);
    const W = B.waves;
    const [b0, b1] = B.band;
    const laneH = (b1 - b0) / W.lanes;
    const p = this.world.player;
    const pLane = Phaser.Math.Clamp(Math.floor((p.y - b0) / laneH), 0, W.lanes - 1);
    const k = this.rage ? 2 : Math.min(W.lanes - 1, Phaser.Math.Between(W.activeLanes[0], W.activeLanes[1]));
    const set = new Set<number>([pLane]);
    if (this.rage) set.add(pLane > 0 ? pLane - 1 : pLane + 1);
    while (set.size < k) set.add(Phaser.Math.Between(0, W.lanes - 1));
    const hasFx = this.scene.textures.exists('fx_onda');
    for (const i of set) {
      const fx: Phaser.GameObjects.Sprite[] = [];
      if (hasFx) {
        for (let s = 0; s < 2; s++) {
          const sp = this.scene.add.sprite(this.x, b0 + (i + 0.5) * laneH, 'fx_onda').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
          if (this.scene.anims.exists('fx_onda')) sp.play({ key: 'fx_onda', repeat: -1 });
          fx.push(sp);
        }
      }
      this.lanes.push({
        y: b0 + (i + 0.5) * laneH,
        half: laneH / 2,
        t: -(this.rage ? B.rage.windup : W.warnTime),
        speed: W.speed * (this.rage ? B.rage.speedMult : 1),
        hitDone: false,
        gfx: this.scene.add.graphics(),
        fx,
      });
    }
  }

  private updateLanes(dt: number): void {
    const p = this.world.player;
    const W = B.waves;
    const x0 = this.x - this.radius;
    const x1 = this.x + this.radius;
    for (let i = this.lanes.length - 1; i >= 0; i--) {
      const L = this.lanes[i];
      L.t += dt;
      const g = L.gfx.clear().setDepth(L.y - 1.5);
      if (L.t < 0) {
        // Aviso: la franja del carril parpadea.
        const a = Math.floor(L.t * 14) % 2 === 0 ? 0.35 : 0.12;
        g.fillStyle(0xff7040, a).fillRect(x0 - W.range, L.y - L.half + 2, W.range * 2 + this.radius * 2, L.half * 2 - 4);
        g.lineStyle(1, 0xffb070, 0.7).lineBetween(x0 - W.range, L.y, x1 + W.range, L.y);
        continue;
      }
      const dist = L.speed * L.t;
      const xr = x1 + dist;
      const xl = x0 - dist;
      const k = Math.min(1, dist / W.range);
      const alpha = 1 - k * 0.7;
      // Frente de onda (ambos lados) con estela.
      g.fillStyle(0xffd0a0, 0.25 * alpha).fillRect(xl, L.y - 2, xr - xl, 4);
      g.fillStyle(0xffe0b0, 0.85 * alpha).fillEllipse(xr, L.y, 16, L.half * 1.6).fillEllipse(xl, L.y, 16, L.half * 1.6);
      g.fillStyle(0xffffff, 0.9 * alpha).fillEllipse(xr, L.y, 6, L.half).fillEllipse(xl, L.y, 6, L.half);
      L.fx.forEach((s, j) => s.setVisible(true).setPosition(j === 0 ? xr : xl, L.y).setDisplaySize(30, L.half * 1.8).setDepth(L.y - 1).setAlpha(alpha));
      if (Math.random() < dt * 30) burst(this.scene, 'dust', Math.random() < 0.5 ? xr : xl, L.y, L.y + FX_DEPTH_BIAS, 1);
      if (!L.hitDone && Math.abs(p.y - L.y) < L.half && p.z < W.dodgeHeight && !p.isDodging) {
        if (Math.abs(p.x - xr) < W.thickness || Math.abs(p.x - xl) < W.thickness) {
          L.hitDone = true;
          hitPlayer(this.world, { damage: W.damage, stun: 0, kind: 'shockwave', sourceX: this.x, knockback: W.knockback });
        }
      }
      if (k >= 1) {
        L.gfx.destroy();
        L.fx.forEach((s) => s.destroy());
        this.lanes.splice(i, 1);
      }
    }
  }

  /* ---------------------- Fase 2: láseres oculares ---------------------- */

  private fireBeam(): void {
    const p = this.world.player;
    const [b0, b1] = B.band;
    const side: 1 | -1 = p.x >= this.x ? 1 : -1;
    this.beams.push({ y: Phaser.Math.Clamp(p.y, b0, b1), side, t: -B.beams.warnTime, hitT: 0, gfx: this.scene.add.graphics() });
    sfx('olmeca_laser');
  }

  private updateBeams(dt: number): void {
    const p = this.world.player;
    const Bm = B.beams;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      b.hitT -= dt;
      const start = this.x + b.side * this.radius;
      const end = start + b.side * Bm.range;
      const yDraw = b.y - Bm.chestHeight;
      const g = b.gfx.clear().setDepth(b.y + FX_DEPTH_BIAS);
      if (b.t < 0) {
        // Aviso: línea fina roja en el suelo y a la altura del pecho.
        const a = Math.floor(b.t * 16) % 2 === 0 ? 0.8 : 0.25;
        g.lineStyle(1, 0xff3040, a).lineBetween(start, yDraw, end, yDraw);
        g.fillStyle(0xff3040, a * 0.25).fillRect(Math.min(start, end), b.y - Bm.halfWidth, Bm.range, Bm.halfWidth * 2);
        continue;
      }
      const sweep = Math.min(Bm.range, Bm.sweepSpeed * b.t);
      const front = start + b.side * sweep;
      const eyeX = this.x + b.side * B.eyes.dx;
      const eyeY = this.y - B.eyes.dy;
      const flick = 0.8 + 0.2 * Math.sin(b.t * 60);
      g.lineStyle(7, 0xff2040, 0.35 * flick).lineBetween(eyeX, eyeY, start, yDraw).lineBetween(start, yDraw, front, yDraw);
      g.lineStyle(3, 0xff6070, 0.9 * flick).lineBetween(eyeX, eyeY, start, yDraw).lineBetween(start, yDraw, front, yDraw);
      g.lineStyle(1, 0xffffff, 1).lineBetween(start, yDraw, front, yDraw);
      if (Math.random() < dt * 40) burst(this.scene, 'sparkRed', front, yDraw, b.y + FX_DEPTH_BIAS, 2);
      const inX = b.side > 0 ? p.x >= start && p.x <= front : p.x <= start && p.x >= front;
      if (inX && Math.abs(p.y - b.y) < Bm.halfWidth && p.z < Bm.maxPlayerZ && b.hitT <= 0) {
        b.hitT = Bm.tickSeconds;
        hitPlayer(this.world, { damage: Bm.damage, stun: 0, kind: 'projectile', sourceX: this.x, knockback: Bm.knockback });
      }
      if (b.t >= Bm.range / Bm.sweepSpeed + Bm.holdTime) {
        b.gfx.destroy();
        this.beams.splice(i, 1);
        this.beamT = Bm.gap;
      }
    }
  }

  /* -------------------------- Fase 3: espíritus -------------------------- */

  private aliveSpirits(): number {
    let n = 0;
    for (const e of this.world.enemies) if (e instanceof Espiritu && e.summonedBy === this && e.alive && !e.purified) n++;
    return n;
  }

  private summon(): void {
    const n = Math.min(B.summon.count, B.summon.maxSpirits - this.aliveSpirits());
    const p = this.world.player;
    for (let i = 0; i < n; i++) {
      let pt = this.world.randomPointNear(p.x + rand(-B.summon.radius, B.summon.radius), p.y, 24);
      if (planeDist(pt.x, pt.y, this.x, this.y) < this.radius + 30) pt = this.world.randomPointNear(p.x, p.y, 30);
      burst(this.scene, 'dark', pt.x, pt.y - 20, pt.y + FX_DEPTH_BIAS, 12);
      const e = this.world.spawnEnemy({ type: 'espiritu', x: pt.x, y: pt.y, lunaOnly: true });
      if (e instanceof Espiritu) e.summonedBy = this;
    }
    sfx('olmeca_invocar');
    if (!this.told.luna) {
      this.told.luna = true;
      bus.emit('hud:toast', { text: 'Invocó espíritus: activa Luna (F) para verlos y purifícalos con LUZ', ms: 3200 });
    }
  }

  /* -------------------------- Vulnerabilidad -------------------------- */

  private startVulnerable(): void {
    this.telegraph(false);
    this.set('vulnerable');
    this.vulnerableLeft = B.vulnerableSeconds;
    sfx('olmeca_ojos_apagados');
    bus.emit('boss:vulnerable', { on: true });
    if (!this.told.window) {
      this.told.window = true;
      bus.emit('hud:toast', { text: '¡Sus ojos se apagaron! Lanza LUZ, SOL o VOZ (Q)', ms: 2600 });
    }
    this.pushHud();
  }

  private endVulnerable(): void {
    if (this.st === 'vulnerable') bus.emit('boss:vulnerable', { on: false });
    this.pushHud();
    this.toIdle();
  }

  private nextPhase(): void {
    this.sealDone += B.seal.perPhase[this.phase - 1];
    this.seal = 0;
    this.phase = (this.phase + 1) as Phase;
    bus.emit('boss:vulnerable', { on: false });
    this.set('phaseChange');
    sfx('jefe_rugido');
    this.world.flash(0xa040ff, 220);
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    bus.emit('olmeca:phase', { phase: this.phase });
    if (this.phase === 2) bus.emit('boss:phase', { phase: 2 });
    bus.emit('hud:toast', {
      text: this.phase === 2 ? '¡La Cabeza despierta sus ojos! Cambia de profundidad (W/S) o usa el escudo' : '¡Llama a los espíritus del altar!',
      ms: 2800,
    });
    this.pushHud();
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'calmed') return false;
    if (this.st === 'dormant') this.activate();
    // Es piedra: ni el láser ni los golpes la dañan.
    if ((hit.kind === 'laser-red' || hit.kind === 'laser-green') && !this.told.laser) {
      this.told.laser = true;
      bus.emit('hud:toast', { text: 'Es piedra: el láser no le hace nada. Espera a que sus ojos se apaguen', ms: 2800 });
    }
    return false;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'calmed' || this.st === 'dormant' || ev.outcome === 'fail') return false;
    const near = planeDist(this.x, this.y, ev.x, ev.y) <= B.spellRange;
    if (ev.spellId === 'CALMA') {
      if (!near) return false;
      this.enrage();
      return false;
    }
    if (ev.spellId === 'MEMORIA') {
      // Nivel 4: ➖ (la piedra no guarda memoria rota: la posesión es de la Cofradía).
      if (near && !this.told.memoria) {
        this.told.memoria = true;
        bus.emit('hud:toast', { text: 'MEMORIA no la alcanza: usa LUZ, SOL o VOZ en su ventana', ms: 2600 });
      }
      return false;
    }
    // Nivel 6: FUEGO cuenta como SOL (ofensivo en línea). VERDAD y DESCANSO: ➖ (no hay ilusión ni muerto que liberar).
    if (ev.spellId !== 'LUZ' && ev.spellId !== 'SOL' && ev.spellId !== 'VOZ' && ev.spellId !== 'FUEGO') return false; // PROTECCION ➖
    const lineHit = ev.spellId === 'SOL' ? inSolLine(ev, this.x, this.y, this.radius + 20) : ev.spellId === 'FUEGO' ? inFuegoLine(ev, this.x, this.y, this.radius + 20) : false;
    const hits = ev.spellId === 'SOL' || ev.spellId === 'FUEGO' ? lineHit || (near && Math.abs(ev.y - this.y) < this.radius) : near;
    if (!hits) return false;
    if (this.st !== 'vulnerable') {
      if (!this.told.closed) {
        this.told.closed = true;
        bus.emit('hud:toast', { text: 'Sus ojos la protegen: espera a que se apaguen tras un ataque', ms: 2600 });
      }
      return false;
    }
    const perfect = ev.outcome === 'perfect';
    this.lastPerfect = perfect;
    this.seal += perfect ? B.seal.perfect : B.seal.partial;
    bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
    this.flashT = JUICE.flashMs / 1000;
    this.world.hitstop(JUICE.hitstopMs.spell);
    this.world.shake(JUICE.shake.red.intensity, JUICE.shake.red.ms);
    burst(this.scene, ev.spellId === 'SOL' ? 'sun' : 'light', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 16);
    const cap = B.seal.perPhase[this.phase - 1];
    if (this.seal >= cap) {
      if (this.phase === 3) this.calm();
      else this.nextPhase();
    } else this.pushHud();
    return true;
  }

  /** CALMA la enfurece: cierra la ventana y contraataca rápido con una onda en el carril del jugador. */
  private enrage(): void {
    if (this.st === 'phaseChange' || this.st === 'intro') return;
    if (!this.told.rage) {
      this.told.rage = true;
      bus.emit('hud:toast', { text: '¡CALMA la enfurece! Usa LUZ, SOL o VOZ', ms: 2600 });
    }
    if (this.st === 'vulnerable') bus.emit('boss:vulnerable', { on: false });
    this.world.flash(0xff3020, 160);
    sfx('jefe_rugido');
    // Si estaba a mitad de otro ataque, la onda se suma al terminar; si no, contraataca ya.
    if (this.st === 'idle' || this.st === 'vulnerable' || this.st === 'summon') this.startWaves(true);
    this.pushHud();
  }

  private calm(): void {
    this.sealDone = this.sealTotal;
    this.seal = 0;
    this.clearAttacks();
    this.telegraph(false);
    bus.emit('boss:vulnerable', { on: false });
    this.set('calmed');
    this.eyeMode = 'calm';
    this._exhausted = true;
    sfx('purificar');
    this.world.flash(0x9affc0, 300);
    updateBossBar(0, B.seal.perPhase[2], B.seal.perPhase[2], false);
    bus.emit('boss:calmed', {});
    purifyFx(this.scene, this.x, this.y, 1.8);
    this.scene.time.delayedCall(700, () => purifyFx(this.scene, this.x, this.y, 1.3));
    const amount = Math.round(this._ecos * (this.lastPerfect ? B.perfectBonus : 1));
    this.scene.time.delayedCall(1800, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 60 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: this.lastPerfect });
      hideBossBar();
      // La piedra se queda en su lugar (en calma); la entidad sale del mundo.
      const sp = this.sprite;
      const rest = this.scene.add.image(sp.x, sp.y, sp.texture.key, sp.frame.name).setOrigin(sp.originX, sp.originY).setDepth(sp.depth).setFlipX(sp.flipX);
      this.eyes.forEach((e) => {
        const copy = this.scene.add.image(e.x, e.y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(B.eyes.calmColor)).setScale(e.scaleX, e.scaleY).setDepth(e.depth);
        this.scene.tweens.add({ targets: copy, alpha: { from: 0.5, to: 0.15 }, duration: 1600, yoyo: true, repeat: -1 });
      });
      void rest;
      this.leaveWorld();
    });
  }

  private clearAttacks(): void {
    this.lanes.forEach((l) => {
      l.gfx.destroy();
      l.fx.forEach((s) => s.destroy());
    });
    this.lanes = [];
    this.beams.forEach((b) => b.gfx.destroy());
    this.beams = [];
    this.slamsLeft = 0;
    this.beamsLeft = 0;
  }

  protected onDestroy(): void {
    this.clearAttacks();
    this.eyes.forEach((e) => e.destroy());
    this.eyes = [];
    if (this.st !== 'calmed') hideBossBar();
  }
}
