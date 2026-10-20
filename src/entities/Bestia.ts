import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import progression from '../data/progression.json';
import {
  EnemyBase, FB, burst, hexColor, hitPlayer, inLuzRadius, inMemoriaRadius, inSolLine, planeDist, powerScale, purifyFx,
  rand, randRange, solDamage, solKnockback, spellParam, inVerdadRadius, inFuegoLine, verdadStun, fuegoDamage, fuegoKnockback, burnFx,
} from './EnemyBase';

/**
 * Bestia corrompida (Nivel 4, contratos §6 y §8). Cuadrúpedo inspirado en alebrijes / nahuales oscuros,
 * corrompido con fuego fatuo. Cuadro 96×64, pies en y = 62, ~50 px de alto. PLACEHOLDER SIMPLE (AGENTS §8.0).
 * - Merodea; al ver al jugador lo persigue. Zarpazo cercano anunciado; EMBESTIDA en línea con aviso
 *   (polvo + gruñido + franja en su profundidad); AULLIDO que despierta a las bestias cercanas.
 * - Láser rojo → AGOTADA (como el chaneque). MEMORIA la purifica (agotada o no, dentro del radio):
 *   'enemy:purified' con Ecos × 1.5 (× 1.25 perfecto). Se vuelve un alebrije de colores y se va.
 * - LUZ aturde · SOL daña · VOZ aturde · CALMA ➖ (aturde poco; toast la primera vez) · PROTECCION empuja.
 * - Agotada sin purificar: si pertenece a un `group` (p. ej. las que abren el pasaje) se levanta otra vez
 *   (exhaustedGroupRecovers); si no, se retira sola con los Ecos base.
 * Sin violencia gráfica: nada de sangre; al purificarse el fuego fatuo se apaga.
 */

const B = enemiesData.bestia;
const TEX = '__cb_bestia';

type St =
  | 'idle' | 'chase' | 'swipeWindup' | 'swipe' | 'chargeWindup' | 'charge' | 'howl' | 'recover'
  | 'hurt' | 'dizzy' | 'exhausted' | 'purifying' | 'leaving';

/** Aviso de CALMA una sola vez por partida. */
let toldCalma = false;
let toldExhausted = false;

/** Placeholder: silueta oscura de cuadrúpedo con franjas, ojos que brillan. Mira a la derecha. */
function ensureBestiaTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const c = B.colors;
  const body = hexColor(c.body);
  const dark = hexColor(c.dark);
  const stripe = hexColor(c.stripe);
  const g = scene.make.graphics({}, false);
  // Cola (izquierda), curva hacia arriba.
  g.fillStyle(dark, 1).fillTriangle(6, 18, 18, 34, 24, 28);
  // Patas traseras y delanteras (las de atrás más oscuras).
  g.fillStyle(dark, 1).fillRect(24, 44, 7, 18).fillRect(62, 44, 7, 18);
  g.fillStyle(body, 1).fillRect(32, 44, 7, 18).fillRect(70, 44, 7, 18);
  // Torso.
  g.fillStyle(body, 1).fillEllipse(48, 36, 54, 24);
  // Franjas de alebrije.
  g.fillStyle(stripe, 1).fillRect(34, 28, 3, 14).fillRect(44, 26, 3, 16).fillRect(54, 27, 3, 15);
  // Cuello y cabeza (derecha) con hocico y orejas/cuernos.
  g.fillStyle(body, 1).fillTriangle(66, 26, 78, 22, 72, 40);
  g.fillStyle(body, 1).fillEllipse(80, 24, 18, 14);
  g.fillStyle(body, 1).fillRect(84, 24, 10, 7); // hocico
  g.fillStyle(dark, 1).fillTriangle(74, 18, 78, 6, 80, 18).fillTriangle(80, 18, 86, 8, 85, 20);
  // Ojo y colmillo (sin sangre: solo blanco).
  g.fillStyle(hexColor(c.eyes), 1).fillRect(82, 21, 3, 2);
  g.fillStyle(0xe8e0d0, 1).fillRect(91, 30, 1, 3);
  g.generateTexture(TEX, B.frame.w, B.frame.h);
  g.destroy();
  return TEX;
}

export class Bestia extends EnemyBase {
  kind: EnemyKind = 'bestia';
  private st: St = 'idle';
  private stT = 0;
  private active = false;
  private cooldown = rand(0.6, 1.4);
  private chargeCd = rand(1.5, 3);
  private howlCd = rand(2, 5);
  private hitDone = false;
  private homeX: number;
  private homeY: number;
  private wanderT = 0;
  private wanderTo: { x: number; y: number } | null = null;
  private sideBias: 1 | -1;
  private lane: number;
  private chargeDir: 1 | -1 = 1;
  private chargeLeft = 0;
  private warn: Phaser.GameObjects.Graphics | null = null;
  private alert: Phaser.GameObjects.Text | null = null;
  private flames: Phaser.GameObjects.Image[] = [];
  private flameT = Math.random() * 10;
  private flameColor = hexColor(B.colors.fire);
  private walkPhase = Math.random() * 10;

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    super(world, x, y, {
      hp: B.hp,
      radius: B.radius,
      height: B.height,
      ecos: B.ecos,
      feetY: B.frame.feetY,
      frameH: B.frame.h,
      fallbackTex: ensureBestiaTexture(world.scene),
      textureKey: 'bestia_reposo',
      shadowW: 52,
      kitId: 'bestia',
    });
    this.group = group;
    this.homeX = x;
    this.homeY = y;
    this.sideBias = this.uid % 2 ? 1 : -1;
    this.lane = ((this.uid % 3) - 1) * 16;
    if (group) this.active = true;
    for (let i = 0; i < B.flames.count; i++) {
      this.flames.push(this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(this.flameColor));
    }
    this.play('bestia_reposo');
    this.render(0);
    this.placeFlames(0);
  }

  get isAttacking(): boolean {
    return this.st === 'swipeWindup' || this.st === 'swipe' || this.st === 'chargeWindup' || this.st === 'charge';
  }

  /** La despierta el aullido de otra bestia. */
  alertByHowl(): void {
    if (this.active || !this._alive || this._exhausted) return;
    this.active = true;
    this.showAlert(true);
    this.scene.time.delayedCall(700, () => this.showAlert(false));
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (st !== 'chargeWindup' && st !== 'charge') this.clearWarn();
    this.showAlert(st === 'swipeWindup' || st === 'chargeWindup');
    if (st !== 'swipeWindup' && st !== 'chargeWindup' && this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      idle: 'bestia_reposo',
      chase: 'bestia_caminar',
      swipeWindup: 'bestia_ataque',
      swipe: 'bestia_ataque',
      chargeWindup: 'bestia_golpe',
      charge: 'bestia_correr',
      howl: 'bestia_invocar',
      recover: 'bestia_reposo',
      hurt: 'bestia_dano',
      dizzy: 'bestia_aturdido',
      exhausted: 'bestia_agotado',
      purifying: 'bestia_purificar',
      leaving: 'bestia_caminar',
    };
    this.play(anim[st]);
  }

  private moveToward(tx: number, ty: number, speed: number, dt: number): number {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return d;
    const step = Math.min(d, speed * dt);
    this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.75);
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
    return d;
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private attackersNow(): number {
    let n = 0;
    for (const e of this.world.enemies) if (e instanceof Bestia && e !== this && e.isAttacking) n++;
    return n;
  }

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    this.cooldown -= dt;
    this.chargeCd -= dt;
    this.howlCd -= dt;
    if (this.stunAcc > 0 && this.st !== 'dizzy') this.stunAcc = Math.max(0, this.stunAcc - B.stunDecay * dt);
    this.stepKnockback(dt);

    if (!this.active && !this._exhausted && planeDist(this.x, this.y, p.x, p.y) < B.aggroRadius) {
      this.active = true;
      sfx('bestia_gruñido');
    }

    switch (this.st) {
      case 'idle': {
        if (this.active) {
          this.set('chase');
          break;
        }
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(1.8, 3.6);
          this.wanderTo = Math.random() < 0.65 ? this.world.randomPointNear(this.homeX, this.homeY, B.wanderRadius) : null;
        }
        if (this.wanderTo && this.moveToward(this.wanderTo.x, this.wanderTo.y, B.walkSpeed, dt) < 3) this.wanderTo = null;
        break;
      }
      case 'chase':
        this.updateChase(dt);
        break;
      case 'swipeWindup':
        this.facePlayer();
        this.telegraph(0x206050);
        if (this.stT >= B.swipe.windup) {
          this.set('swipe');
        }
        break;
      case 'swipe':
        this.world.moveActor(this, this.facing * 120 * dt, 0);
        if (!this.hitDone) {
          this.hitDone = true;
          burst(this.scene, 'sparkGreen', this.x + this.facing * 30, this.y - 26, this.y + FX_DEPTH_BIAS, 6);
          if (Math.abs(p.x - this.x) < B.swipe.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < B.swipe.dodgeHeight) {
            hitPlayer(this.world, { damage: B.swipe.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: B.swipe.knockback });
          }
        }
        if (this.stT >= B.swipe.active) this.toRecover(B.swipe.recover);
        break;
      case 'chargeWindup': {
        // Aviso: polvo bajo las patas, gruñido y franja en su profundidad.
        this.telegraph(0x305060);
        this.bob = -Math.min(3, this.stT * 6);
        if (Math.random() < dt * 22) burst(this.scene, 'dust', this.x - this.facing * 20, this.y, this.y + FX_DEPTH_BIAS, 2);
        this.drawWarn();
        if (this.stT >= B.charge.windup) {
          this.bob = 0;
          this.chargeLeft = B.charge.distance;
          sfx('bestia_embestida');
          this.set('charge');
        }
        break;
      }
      case 'charge': {
        const step = B.charge.speed * dt;
        const x0 = this.x;
        this.world.moveActor(this, this.chargeDir * step, 0);
        const moved = Math.abs(this.x - x0);
        this.chargeLeft -= step;
        this.drawWarn();
        if (Math.random() < dt * 30) burst(this.scene, 'dust', this.x - this.chargeDir * 22, this.y, this.y + FX_DEPTH_BIAS, 1);
        if (!this.hitDone && Math.abs(p.x - this.x) < B.charge.hitRadius + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < B.charge.dodgeHeight && !p.isDodging) {
          this.hitDone = true;
          hitPlayer(this.world, { damage: B.charge.damage, stun: 0, kind: 'melee', sourceX: this.x - this.chargeDir * 10, knockback: B.charge.knockback });
        }
        // Termina al recorrer la distancia o al chocar con algo.
        if (this.chargeLeft <= 0 || moved < step * 0.3) {
          if (moved < step * 0.3) {
            burst(this.scene, 'dust', this.x + this.chargeDir * 20, this.y - 10, this.y + FX_DEPTH_BIAS, 10);
            this.world.shake(0.003, 90);
          }
          this.chargeCd = randRange(B.charge.cooldown);
          this.toRecover(B.charge.recover);
        }
        break;
      }
      case 'howl':
        this.bob = Math.abs(Math.sin(this.stT * 20)) * 1.5;
        if (!this.hitDone && this.stT >= B.howl.windup * 0.5) {
          this.hitDone = true;
          this.howl();
        }
        if (this.stT >= B.howl.windup) {
          this.bob = 0;
          this.set('chase');
        }
        break;
      case 'recover':
        if (this.stT >= 0) {
          this.cooldown = randRange(B.attackCooldown);
          this.set('chase');
        }
        break;
      case 'hurt':
        if (this.stT >= B.hurtSeconds) this.set('chase');
        break;
      case 'dizzy':
        if (this.stT >= B.dizzySeconds) {
          this.setStars(false);
          this.stunAcc = 0;
          this.set('chase');
        }
        break;
      case 'exhausted':
        if (this.stT >= B.exhaustedSeconds) {
          if (this.group && B.exhaustedGroupRecovers) this.standUp();
          else this.retire();
        }
        break;
      case 'purifying':
      case 'leaving':
        break;
    }

    if (this.st !== 'charge' && this.st !== 'purifying' && this.st !== 'leaving') this.separate(dt, B.separation);
    if (!this.hasArt && (this.st === 'chase' || this.st === 'idle') && (this.st === 'chase' || this.wanderTo)) {
      this.walkPhase += dt * 12;
      this.bob = Math.abs(Math.sin(this.walkPhase)) * 1.5;
    } else if (!this.hasArt && this.st === 'charge') {
      this.walkPhase += dt * 24;
      this.bob = Math.abs(Math.sin(this.walkPhase)) * 2.5;
    }

    this.render(dt);
    this.placeFlames(dt);
    this.alert?.setPosition(this.x, this.y - this.z - this.height - 8).setDepth(this.y + FX_DEPTH_BIAS);
  }

  private updateChase(dt: number): void {
    const p = this.world.player;
    const dxp = p.x - this.x;
    const dyp = p.y - this.y;
    const dist = planeDist(this.x, this.y, p.x, p.y);
    if (dist > B.loseDistance && !this.group) {
      this.active = false;
      this.homeX = this.x;
      this.homeY = this.y;
      this.set('idle');
      return;
    }
    const ready = this.cooldown <= 0 && this.attackersNow() < B.maxAttackers;

    // Aullido: llama a las bestias cercanas (una vez cada tanto).
    if (this.howlCd <= 0) {
      this.howlCd = B.howl.cooldown;
      if (Math.random() < B.howl.chance || this.hasSleepingNeighbor()) {
        this.facePlayer();
        this.set('howl');
        sfx('bestia_aullido');
        return;
      }
    }
    // Embestida: a media distancia y casi en la misma profundidad.
    const C = B.charge;
    if (ready && this.chargeCd <= 0 && Math.abs(dxp) > C.minDist && Math.abs(dxp) < C.maxDist && Math.abs(dyp) < C.depthAlign) {
      this.facePlayer();
      this.chargeDir = this.facing;
      sfx('bestia_gruñido');
      this.set('chargeWindup');
      return;
    }
    // Zarpazo cercano.
    if (ready && Math.abs(dxp) < B.swipe.range + this.radius * 0.6 && Math.abs(dyp) < DEPTH_TOLERANCE * 0.7) {
      sfx('bestia_gruñido');
      this.set('swipeWindup');
      return;
    }
    if (ready) {
      const side = Math.sign(-dxp) || this.sideBias;
      this.moveToward(p.x + side * (B.swipe.range * 0.8 + this.radius), p.y, B.chaseSpeed, dt);
    } else {
      // Ronda al jugador a distancia, en su carril de profundidad.
      const d = this.moveToward(p.x + this.sideBias * 80, p.y + this.lane, B.chaseSpeed * 0.7, dt);
      if (d < 4) this.facePlayer();
    }
  }

  private hasSleepingNeighbor(): boolean {
    for (const e of this.world.enemies) {
      if (e instanceof Bestia && e !== this && !e.active && e.alive && !e.exhausted && planeDist(this.x, this.y, e.x, e.y) < B.howl.radius) return true;
    }
    return false;
  }

  private howl(): void {
    const ring = this.scene.add.image(this.x, this.y, FB.ring).setTint(hexColor(B.colors.fire)).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.y - FX_DEPTH_BIAS).setDisplaySize(10, 5);
    this.scene.tweens.add({ targets: ring, displayWidth: B.howl.radius * 2, displayHeight: B.howl.radius, alpha: { from: 0.8, to: 0 }, duration: 800, onComplete: () => ring.destroy() });
    burst(this.scene, 'dark', this.x + this.facing * 30, this.y - 34, this.y + FX_DEPTH_BIAS, 10);
    for (const e of this.world.enemies) {
      if (e instanceof Bestia && e !== this && planeDist(this.x, this.y, e.x, e.y) < B.howl.radius) {
        this.scene.time.delayedCall(rand(150, 450), () => e.alertByHowl());
      }
    }
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

  /** Franja de aviso en la profundidad de la embestida. */
  private drawWarn(): void {
    if (!this.warn) this.warn = this.scene.add.graphics();
    const g = this.warn.clear().setDepth(this.y - 1.5);
    const C = B.charge;
    const x0 = this.st === 'charge' ? this.x : this.x + this.chargeDir * this.radius;
    const len = this.st === 'charge' ? Math.max(0, this.chargeLeft) : C.distance;
    const a = this.st === 'charge' ? 0.15 : Math.floor(this.stT * 12) % 2 === 0 ? 0.35 : 0.14;
    const xa = Math.min(x0, x0 + this.chargeDir * len);
    g.fillStyle(0x60ffd0, a).fillRect(xa, this.y - C.warnHalfWidth, len, C.warnHalfWidth * 2);
    g.lineStyle(1, 0xa0ffe0, a * 2).lineBetween(x0, this.y, x0 + this.chargeDir * len, this.y);
  }

  private clearWarn(): void {
    this.warn?.destroy();
    this.warn = null;
  }

  private showAlert(on: boolean): void {
    if (on && !this.alert) {
      this.alert = this.scene.add
        .text(this.x, this.y, '!', { fontFamily: 'monospace', fontSize: '12px', color: '#a0ffe0', stroke: '#0a2020', strokeThickness: 3 })
        .setOrigin(0.5, 1);
      this.scene.tweens.add({ targets: this.alert, scale: { from: 1.6, to: 1 }, duration: 150 });
    } else if (!on && this.alert) {
      this.alert.destroy();
      this.alert = null;
    }
  }

  /** Llamitas de fuego fatuo sobre el lomo y la cabeza (parpadean; se apagan al agotarse/purificarse). */
  private placeFlames(dt: number): void {
    this.flameT += dt * B.flames.flicker;
    const top = this.y - this.z - this.bob;
    const off = this.st === 'purifying' || this.st === 'leaving';
    const dim = this._exhausted ? 0.3 : 1;
    const xs = [-18, -6, 6, 22];
    const ys = [34, 38, 37, 42];
    this.flames.forEach((f, i) => {
      const k = 0.75 + 0.25 * Math.sin(this.flameT + i * 1.7);
      const ox = xs[i % xs.length] * this.facing;
      f.setPosition(this.x + ox, top - ys[i % ys.length] - k * 3)
        .setScale(B.flames.scale * k * 0.8, B.flames.scale * k * 1.3)
        .setTint(i % 2 ? hexColor(B.colors.fire2) : this.flameColor)
        .setAlpha(off ? 0 : (0.55 + 0.35 * k) * dim * this.sprite.alpha)
        .setDepth(this.y + (i % 2 ? FX_DEPTH_BIAS * 0.5 : -0.05));
    });
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'exhausted' || this.st === 'purifying' || this.st === 'leaving') return false;
    this.active = true;
    this.hp -= hit.damage;
    this.stunAcc += hit.stun;
    this.onDamaged(hit, this.st === 'charge' ? 0.2 : B.knockbackScale);
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (this.hp <= 0) {
      this.exhaust();
    } else if (this.stunAcc >= B.stunThreshold && this.st !== 'dizzy') {
      this.set('dizzy');
      this.setStars(true);
      burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 6);
    } else if (hit.damage >= 1 && this.st !== 'charge' && this.st !== 'dizzy' && this.st !== 'chargeWindup') {
      this.set('hurt');
    }
    return true;
  }

  private exhaust(): void {
    this.hp = 0;
    this._exhausted = true;
    this.kbVel *= 0.5;
    this.set('exhausted');
    this.setStars(true, 0xa0ffe0);
    this.setBaseTint(0xb8b8c8);
    burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 8);
    bus.emit('enemy:exhausted', { enemy: this });
    if (!toldExhausted) {
      toldExhausted = true;
      bus.emit('hud:toast', { text: 'La bestia está agotada: su memoria rota se cura con MEMORIA', ms: 2800 });
    }
  }

  /** Nadie la purificó: la memoria rota la vuelve a levantar (bestias del pasaje). */
  private standUp(): void {
    this.setStars(false);
    this._exhausted = false;
    this.hp = this.maxHp * B.recoverHpFrac;
    this.stunAcc = 0;
    this.setBaseTint(0xffffff);
    burst(this.scene, 'dark', this.x, this.y - 30, this.y + FX_DEPTH_BIAS, 12);
    sfx('bestia_gruñido');
    this.set('chase');
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || ev.outcome === 'fail') return false;
    if (this.st === 'purifying' || this.st === 'leaving') return false;
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    switch (ev.spellId) {
      case 'MEMORIA': {
        // Purifica (agotada o no) dentro del radio; un poco más lejos, aturde.
        if (inMemoriaRadius(ev, this.x, this.y, 'purifyRadius', this._exhausted ? this.radius : 0)) {
          this.purify(ev.outcome === 'perfect');
          return true;
        }
        if (this._exhausted || !inMemoriaRadius(ev, this.x, this.y, 'stunRadius')) return false;
        return this.takeHit({ damage: 0, stun: spellParam('MEMORIA', 'stun', SPELLS_FX.MEMORIA.stun) * power, kind: 'spell', sourceX: ev.x, knockback: 4 });
      }
      case 'CALMA': {
        // ➖: su furia no es miedo, es memoria rota. Apenas la aturde.
        const s = SPELLS_FX.CALMA;
        const r = spellParam('CALMA', 'calmRadius', s.calmRadius) * powerScale(power);
        if (planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y) > r) return false;
        if (!toldCalma) {
          toldCalma = true;
          bus.emit('hud:toast', { text: 'Su furia viene de la memoria rota: usa MEMORIA', ms: 3200 });
        }
        if (this._exhausted) return false;
        return this.takeHit({ damage: 0, stun: spellParam('LUZ', 'lightStun', SPELLS_FX.LUZ.lightStun) * power, kind: 'spell', sourceX: ev.x, knockback: 2 });
      }
      case 'LUZ':
        if (this._exhausted || !inLuzRadius(ev, this.x, this.y)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('LUZ', 'stun', SPELLS_FX.LUZ.stun) * power, kind: 'spell', sourceX: ev.x, knockback: 8 });
      case 'SOL':
        if (!inSolLine(ev, this.x, this.y, this.radius)) return false;
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
      // Nivel 6. VERDAD: aturde (es un ser del folclor, no un disfraz: ➖ leve). FUEGO: daña. DESCANSO: ➖.
      case 'VERDAD':
        if (this._exhausted || !inVerdadRadius(ev, this.x, this.y)) return false;
        return this.takeHit({ damage: 0, stun: verdadStun(ev, true), kind: 'spell', sourceX: ev.x, knockback: 4 });
      case 'FUEGO':
        if (!inFuegoLine(ev, this.x, this.y, this.radius)) return false;
        burnFx(this.scene, this);
        return this.takeHit({ damage: fuegoDamage(ev), stun: 0, kind: 'spell', sourceX: ev.x, knockback: fuegoKnockback(ev) });
    }
    return false;
  }

  /** Purificación con MEMORIA: el fuego fatuo se apaga y queda un alebrije de colores que se va. */
  private purify(perfect: boolean): void {
    this.setStars(false);
    this.clearWarn();
    this.showAlert(false);
    this.z = 0;
    this._exhausted = true;
    this.set('purifying');
    sfx('bestia_purificar');
    purifyFx(this.scene, this.x, this.y, 1);
    // Colores de alebrije (paleta textil) en lugar de la sombra corrompida.
    const cols = B.colors.purified;
    this.setBaseTint(hexColor(cols[this.uid % cols.length]) | 0x606060);
    burst(this.scene, 'calm', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 10);
    const amount = Math.round(this._ecos * progression.bonus.purificar * (perfect ? progression.bonus.perfecto : 1));
    this.scene.time.delayedCall(B.purifySeconds * 1000, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 20 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect });
      this._purified = true;
      this.set('leaving');
      const away = this.x < this.world.player.x ? -1 : 1;
      this.facing = away as 1 | -1;
      this.scene.tweens.add({ targets: this, x: this.x + away * 70, duration: 1100 });
      this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 1100, onComplete: () => this.leaveWorld() });
    });
  }

  /** Nadie la purificó a tiempo (bestia suelta): se va sola con los Ecos base, sin bono. */
  private retire(): void {
    this.setStars(false);
    this.set('leaving');
    this._purified = true;
    bus.emit('ecos:gained', { amount: this._ecos, x: this.x, y: this.y - 20 });
    this.setBaseTint(0xffffff);
    const away = this.x < this.world.player.x ? -1 : 1;
    this.facing = away as 1 | -1;
    this.scene.tweens.add({ targets: this, x: this.x + away * 60, duration: 1000 });
    this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 1000, onComplete: () => this.leaveWorld() });
  }

  protected onDestroy(): void {
    this.clearWarn();
    this.alert?.destroy();
    this.alert = null;
    this.flames.forEach((f) => f.destroy());
    this.flames = [];
  }
}
