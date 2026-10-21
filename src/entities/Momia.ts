import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import progression from '../data/progression.json';
import {
  EnemyBase, FB, burnFx, burst, fuegoDamage, fxN, hexColor, hitPlayer, inDescansoRadius, inFuegoLine, inLuzRadius, inSolLine,
  inVerdadRadius, planeDist, powerScale, purifyFx, rand, randRange, reduceFx, solDamage, solKnockback, spellParam, verdadStun,
} from './EnemyBase';
import { holdPlayer, releaseHold, updateHold } from './Atadura';

/**
 * Momia (versión extendida: avenida y Catedral de Guadalajara). Muerto que no descansa: SÍ es folclor.
 * Humanoide 64×80, pivote (32, 78), ~64 px de alto, kit 'momia'. PLACEHOLDER SIMPLE (AGENTS §8.0) si no hay kit.
 * - Lenta y resistente (poco retroceso). Arrastra los pies levantando polvo.
 * - AGARRE: de cerca, la mano vendada atrapa e INMOVILIZA un instante (Atadura 'vendas').
 * - VENDAS: lanza una tira de venda en línea (se esquiva saltando o esquivando); si atrapa, inmoviliza.
 * - GRITO DE POLVO: onda de polvo en anillo alrededor (se esquiva saltando).
 * Afinidades (coherente con las muñecas, pero es folclor):
 * - Láser rojo → AGOTADA (se arrodilla). Agotada: DESCANSO o CALMA la purifican; si no, se levanta a los
 *   exhaustedSeconds con media vida.
 * - DESCANSO ✅ la purifica SIEMPRE (descansa en paz): Ecos × purificar (× perfecto).
 * - LUZ ✅ aturde fuerte, daña un poco y suelta el agarre. CALMA: solo agotada.
 * - FUEGO / SOL ➖ (daño reducido × neutralMult), VERDAD ➖ (aturde leve), VOZ / PROTECCION aturden y empujan, MEMORIA ✖.
 * Eventos: 'enemy:hit', 'enemy:exhausted', 'enemy:purified', 'ecos:gained', 'enemy:removed'.
 */

const M = enemiesData.momia;
const TEX = '__cb_momia';

type St =
  | 'idle' | 'chase' | 'grabWindup' | 'grab' | 'wrapWindup' | 'wrap' | 'screamWindup' | 'scream'
  | 'recover' | 'hurt' | 'dizzy' | 'exhausted' | 'purifying';

let toldCalma = false;
let toldExhausted = false;
/** Gemidos repartidos entre todas las momias (no saturar el audio). */
let lastGroan = 0;

/** Placeholder: momia encorvada, vendas claras con franjas oscuras y brazos al frente. Mira a la derecha. */
function ensureMomiaTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const c = M.colors;
  const wrap = hexColor(c.wrap);
  const dark = hexColor(c.wrapDark);
  const gap = hexColor(c.gap);
  const g = scene.make.graphics({}, false);
  // Piernas.
  g.fillStyle(dark, 1).fillRect(25, 56, 6, 22).fillRect(34, 56, 6, 22);
  g.fillStyle(wrap, 1).fillRect(26, 56, 4, 21).fillRect(35, 56, 4, 21);
  // Torso (encorvado hacia adelante).
  g.fillStyle(dark, 1).fillRoundedRect(22, 28, 22, 31, 5);
  g.fillStyle(wrap, 1).fillRoundedRect(23, 29, 20, 29, 4);
  // Franjas de venda.
  g.fillStyle(dark, 1);
  for (let y = 32; y < 78; y += 6) g.fillRect(22, y, 22, 1);
  g.fillStyle(gap, 1).fillRect(30, 40, 3, 2).fillRect(26, 50, 2, 2);
  // Brazos estirados al frente.
  g.fillStyle(dark, 1).fillRect(36, 32, 20, 6);
  g.fillStyle(wrap, 1).fillRect(37, 33, 18, 4);
  g.fillStyle(dark, 1).fillRect(42, 33, 1, 4).fillRect(49, 33, 1, 4);
  // Venda suelta colgando del brazo.
  g.fillStyle(wrap, 1).fillRect(46, 37, 2, 8).fillRect(47, 45, 2, 4);
  // Cabeza adelantada.
  g.fillStyle(dark, 1).fillCircle(38, 22, 9);
  g.fillStyle(wrap, 1).fillCircle(38, 22, 8);
  g.fillStyle(dark, 1).fillRect(30, 18, 16, 1).fillRect(30, 26, 16, 1);
  // Hueco de los ojos.
  g.fillStyle(gap, 1).fillRect(38, 20, 7, 4);
  g.fillStyle(hexColor(c.eyes), 1).fillRect(39, 21, 2, 2).fillRect(43, 21, 1, 2);
  g.generateTexture(TEX, M.frame.w, M.frame.h);
  g.destroy();
  return TEX;
}

export class Momia extends EnemyBase {
  kind: EnemyKind = 'momia';
  private st: St = 'idle';
  private stT = 0;
  private hitDone = false;
  private cooldown = rand(0.6, 1.4);
  private wrapCd = rand(1.5, 3);
  private screamCd = rand(3, 6);
  private homeX: number;
  private homeY: number;
  private eyes: Phaser.GameObjects.Image;
  private wrapGfx: Phaser.GameObjects.Graphics;
  private wrapLen = 0;
  private screamGfx: Phaser.GameObjects.Graphics;
  private walkPhase = Math.random() * 10;

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    super(world, x, y, {
      hp: M.hp,
      radius: M.radius,
      height: M.height,
      ecos: M.ecos,
      feetY: M.frame.feetY,
      frameH: M.frame.h,
      fallbackTex: ensureMomiaTexture(world.scene),
      textureKey: 'momia_reposo',
      shadowW: M.shadowW,
      kitId: 'momia',
    });
    this.group = group;
    this.homeX = x;
    this.homeY = y;
    this.facing = world.player.x >= x ? 1 : -1;
    this.eyes = this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(M.colors.eyes)).setScale(0.16);
    this.wrapGfx = this.scene.add.graphics();
    this.screamGfx = this.scene.add.graphics();
    // Los de grupo salen de la tierra (aparecen al empezar su arena).
    if (group) {
      this.sprite.setAlpha(0);
      this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 500 });
      burst(this.scene, 'dust', x, y - 4, y + FX_DEPTH_BIAS, fxN(10));
    }
    this.play('momia_reposo');
    this.render(0);
  }

  get isAware(): boolean {
    return this.st !== 'idle' && this.st !== 'purifying';
  }

  get isAttacking(): boolean {
    return this.st === 'grabWindup' || this.st === 'grab' || this.st === 'wrapWindup' || this.st === 'wrap' || this.st === 'screamWindup' || this.st === 'scream';
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      idle: 'reposo', chase: 'caminar', grabWindup: 'golpe', grab: 'ataque', wrapWindup: 'lanzar', wrap: 'lanzar',
      screamWindup: 'invocar', scream: 'invocar', recover: 'reposo', hurt: 'dano', dizzy: 'aturdido',
      exhausted: 'agotado', purifying: 'purificar',
    };
    this.play(`momia_${anim[st]}`);
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private attackersNow(): number {
    let n = 0;
    for (const e of this.world.enemies) if (e instanceof Momia && e !== this && e.isAttacking) n++;
    return n;
  }

  private groan(force = false): void {
    const now = this.scene.time.now;
    if (!force && now - lastGroan < 2200) return;
    lastGroan = now;
    sfx('momia_gemido');
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    this.cooldown -= dt;
    this.wrapCd -= dt;
    this.screamCd -= dt;
    if (this.stunAcc > 0 && this.st !== 'dizzy') this.stunAcc = Math.max(0, this.stunAcc - M.stunDecay * dt);
    this.stepKnockback(dt);
    this.bob = 0;
    updateHold(this, dt);

    switch (this.st) {
      case 'idle': {
        const d = planeDist(this.x, this.y, p.x, p.y);
        if (this.group || d < M.aggroRadius) {
          this.groan(true);
          this.set('chase');
        }
        break;
      }
      case 'chase':
        this.updateChase(dt);
        break;
      case 'grabWindup':
        this.facePlayer();
        this.telegraph(0x605030);
        if (this.stT >= M.grab.windup) this.set('grab');
        break;
      case 'grab':
        this.world.moveActor(this, this.facing * M.lungeSpeed * 1.5 * dt, 0);
        if (!this.hitDone) {
          this.hitDone = true;
          burst(this.scene, 'bandage', this.x + this.facing * 18, this.y - 36, this.y + FX_DEPTH_BIAS, fxN(5));
          if (Math.abs(p.x - this.x) < M.grab.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < M.grab.dodgeHeight && !p.isDodging) {
            if (hitPlayer(this.world, { damage: M.grab.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: M.grab.knockback })) {
              sfx('momia_agarre');
              holdPlayer(this.world, this, 'vendas', M.grab.holdSeconds);
            }
          }
        }
        if (this.stT >= M.grab.active) this.toRecover(M.grab.recover);
        break;
      case 'wrapWindup':
        this.facePlayer();
        this.telegraph(0x504020);
        if (this.stT >= M.wrap.windup) {
          this.wrapLen = 0;
          sfx('momia_vendas');
          this.set('wrap');
        }
        break;
      case 'wrap':
        this.updateWrap(dt);
        break;
      case 'screamWindup':
        this.facePlayer();
        this.telegraph(0x403020);
        this.bob = -Math.min(3, this.stT * 5);
        if (Math.random() < dt * 16) burst(this.scene, 'dust', this.x + rand(-14, 14), this.y - 2, this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= M.scream.windup) {
          sfx('momia_grito');
          this.world.shake(0.004, 160);
          burst(this.scene, 'dust', this.x, this.y - 30, this.y + FX_DEPTH_BIAS, fxN(16));
          this.set('scream');
        }
        break;
      case 'scream':
        this.updateScream();
        break;
      case 'recover':
        if (this.stT >= 0) {
          this.cooldown = randRange(M.attackCooldown);
          this.set('chase');
        }
        break;
      case 'hurt':
        if (this.stT >= M.hurtSeconds) this.set('chase');
        break;
      case 'dizzy':
        if (this.stT >= M.dizzySeconds) {
          this.setStars(false);
          this.stunAcc = 0;
          this.set('chase');
        }
        break;
      case 'exhausted':
        if (Math.random() < dt * 2) burst(this.scene, 'bandage', this.x + rand(-8, 8), this.y - 20, this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= M.exhaustedSeconds) this.recoverFromExhaustion();
        break;
      case 'purifying':
        break;
    }

    if (this.st !== 'wrap') this.wrapGfx.clear();
    if (this.st !== 'scream') this.screamGfx.clear();
    if (this.st !== 'purifying' && this.st !== 'exhausted') this.separate(dt, M.separation);
    // Arrastra los pies: balanceo lento sin arte y polvo al caminar.
    const walking = this.st === 'chase';
    if (!this.hasArt && walking) {
      this.walkPhase += dt * 6;
      this.bob = Math.abs(Math.sin(this.walkPhase)) * 1.5;
    }
    this.trailFx(dt, walking, 'dust', 5, 0.02, 9);
    this.render(dt);
    this.placeEyes();
  }

  private updateChase(dt: number): void {
    const p = this.world.player;
    const dxp = p.x - this.x;
    const dyp = p.y - this.y;
    const dist = planeDist(this.x, this.y, p.x, p.y);
    if (dist > M.loseDistance && !this.group) {
      // Vuelve despacio a su sitio.
      const dx = this.homeX - this.x;
      const dy = this.homeY - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) this.world.moveActor(this, (dx / d) * M.walkSpeed * dt, (dy / d) * M.walkSpeed * dt);
      else this.set('idle');
      return;
    }
    if (Math.random() < dt * 0.25) this.groan();
    const ready = this.cooldown <= 0 && this.attackersNow() < M.maxAttackers;
    if (ready && this.screamCd <= 0 && dist < M.scream.radius * 0.8 && Math.random() < M.scream.chance) {
      this.screamCd = randRange(M.scream.cooldown);
      this.set('screamWindup');
      return;
    }
    const W = M.wrap;
    if (ready && this.wrapCd <= 0 && Math.abs(dxp) > W.minDist && Math.abs(dxp) < W.maxDist && Math.abs(dyp) < W.depthAlign) {
      this.wrapCd = randRange(W.cooldown);
      this.set('wrapWindup');
      return;
    }
    if (ready && Math.abs(dxp) < M.grab.range + this.radius && Math.abs(dyp) < DEPTH_TOLERANCE * 0.8) {
      this.set('grabWindup');
      return;
    }
    // Avanza lento hacia el lado del jugador; si lo tiene atrapado otra momia, apura el paso.
    const side = Math.sign(-dxp) || (this.uid % 2 ? 1 : -1);
    const tx = p.x + side * (M.grab.range * 0.8);
    const dx = tx - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      const sp = Math.min(d, M.walkSpeed * dt);
      this.world.moveActor(this, (dx / d) * sp, (dy / d) * sp * 0.8);
    }
    if (Math.abs(dxp) > 2) this.facing = dxp > 0 ? 1 : -1;
  }

  /** Tira de venda que se extiende en línea; si alcanza al jugador lo atrapa y lo jala un poco. */
  private updateWrap(dt: number): void {
    const W = M.wrap;
    const p = this.world.player;
    this.wrapLen = Math.min(W.maxDist, this.wrapLen + W.speed * dt);
    const x0 = this.x + this.facing * 14;
    const x1 = x0 + this.facing * this.wrapLen;
    const yDraw = this.y - W.height;
    const g = this.wrapGfx.clear().setDepth(this.y + FX_DEPTH_BIAS);
    const wav = reduceFx() ? 0 : 2;
    g.lineStyle(4, hexColor(M.colors.wrapDark), 0.95);
    g.beginPath();
    g.moveTo(x0, yDraw);
    const steps = 8;
    for (let i = 1; i <= steps; i++) g.lineTo(x0 + ((x1 - x0) * i) / steps, yDraw + Math.sin(i * 1.7 + this.stT * 20) * wav);
    g.strokePath();
    g.lineStyle(2, hexColor(M.colors.wrap), 1);
    g.lineBetween(x0, yDraw, x1, yDraw);
    if (!this.hitDone) {
      const along = (p.x - x0) * this.facing;
      if (along >= 0 && along <= this.wrapLen && Math.abs(p.y - this.y) < W.halfWidth + 4 && p.z < W.dodgeHeight && !p.isDodging) {
        this.hitDone = true;
        if (W.damage > 0) hitPlayer(this.world, { damage: W.damage, stun: 0, kind: 'projectile', sourceX: this.x, knockback: 0 });
        if (holdPlayer(this.world, this, 'vendas', W.holdSeconds)) {
          sfx('momia_agarre');
          burst(this.scene, 'bandage', p.x, p.y - p.z - 24, p.y + FX_DEPTH_BIAS, fxN(8));
        }
      }
    }
    if (this.wrapLen >= W.maxDist || this.hitDone) {
      if (this.stT > 0.25) this.toRecover(W.recover);
    }
  }

  /** Grito de polvo: anillo que se expande; daña una vez si pasa por el jugador en el suelo. */
  private updateScream(): void {
    const S = M.scream;
    const p = this.world.player;
    const k = Math.min(1, this.stT / S.waveTime);
    const r = S.radius * k;
    const g = this.screamGfx.clear().setDepth(this.y - FX_DEPTH_BIAS);
    g.lineStyle(S.thickness * 0.5, hexColor(M.colors.dust), 0.55 * (1 - k * 0.6));
    g.strokeEllipse(this.x, this.y, r * 2, r);
    g.lineStyle(2, 0xe8dcc0, 0.6 * (1 - k));
    g.strokeEllipse(this.x, this.y, r * 1.8, r * 0.9);
    if (!reduceFx() && Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      burst(this.scene, 'dust', this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.5 - 4, this.y + FX_DEPTH_BIAS, 1);
    }
    if (!this.hitDone) {
      const d = planeDist(this.x, this.y, p.x, p.y);
      if (Math.abs(d - r) < S.thickness && p.z < S.dodgeHeight && !p.isDodging) {
        this.hitDone = true;
        hitPlayer(this.world, { damage: S.damage, stun: 0, kind: 'shockwave', sourceX: this.x, knockback: S.knockback });
      }
    }
    if (k >= 1) this.toRecover(S.recover);
  }

  private toRecover(seconds: number): void {
    this.set('recover');
    this.stT = -seconds;
  }

  private telegraph(color: number): void {
    this.warnFx(color);
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 12) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  private placeEyes(): void {
    const top = this.y - this.z - this.bob;
    const off = this.st === 'exhausted' || this.st === 'purifying' || this.st === 'idle';
    const pulse = reduceFx() ? 0.8 : 0.6 + 0.3 * Math.sin(this.scene.time.now / 200 + this.uid);
    this.eyes
      .setPosition(this.x + this.facing * 7, top - this.height * 0.86)
      .setAlpha(off ? (this.st === 'idle' ? 0.3 : 0) : (this.isAttacking ? 1 : pulse) * this.sprite.alpha)
      .setScale(this.isAttacking ? 0.24 : 0.16)
      .setDepth(this.y + FX_DEPTH_BIAS);
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'exhausted' || this.st === 'purifying') return false;
    if (this.st === 'idle') this.set('chase');
    this.hp -= hit.damage;
    this.stunAcc += hit.stun;
    this.onDamaged(hit, M.knockbackScale);
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (hit.damage > 0) burst(this.scene, 'bandage', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, fxN(3));
    if (this.hp <= 0) {
      this.exhaust();
    } else if (this.stunAcc >= M.stunThreshold && this.st !== 'dizzy') {
      this.set('dizzy');
      this.setStars(true);
      releaseHold(this);
      burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 5);
    } else if (hit.damage >= 1 && this.st !== 'dizzy' && !this.isAttacking) {
      // Resistente: los golpes no interrumpen sus ataques.
      this.set('hurt');
    }
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || ev.outcome === 'fail' || this.st === 'purifying') return false;
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    const perfect = ev.outcome === 'perfect';
    switch (ev.spellId) {
      case 'DESCANSO':
        // ✅ Descansa en paz (agotada o no).
        if (!inDescansoRadius(ev, this.x, this.y, this.radius)) return false;
        this.purify(perfect);
        return true;
      case 'CALMA': {
        const r = spellParam('CALMA', 'purifyRadius', SPELLS_FX.CALMA.purifyRadius) * powerScale(power);
        if (planeDist(this.x, this.y, ev.x + ev.facing * SPELLS_FX.CALMA.forward, ev.y) > r + this.radius) return false;
        if (this._exhausted) {
          this.purify(perfect);
          return true;
        }
        if (!toldCalma) {
          toldCalma = true;
          bus.emit('hud:toast', { text: 'La momia no escucha la CALMA: agótala con el láser rojo o dale DESCANSO', ms: 3400 });
        }
        return false;
      }
      case 'LUZ':
        // ✅ La luz la ciega: aturde fuerte, daña un poco y suelta el agarre.
        if (this._exhausted || !inLuzRadius(ev, this.x, this.y)) return false;
        releaseHold(this);
        return this.takeHit({
          damage: M.luz.damage * power,
          stun: spellParam('LUZ', 'stun', SPELLS_FX.LUZ.stun) * M.luz.stunMult * power,
          kind: 'spell', sourceX: ev.x, knockback: 4,
        });
      case 'FUEGO':
        // ➖ Las vendas viejas apenas arden.
        if (this._exhausted || !inFuegoLine(ev, this.x, this.y, this.radius)) return false;
        burnFx(this.scene, this, 500);
        return this.takeHit({ damage: fuegoDamage(ev) * M.neutralMult, stun: 0, kind: 'spell', sourceX: ev.x, knockback: 6 });
      case 'SOL':
        if (this._exhausted || !inSolLine(ev, this.x, this.y, this.radius)) return false;
        return this.takeHit({ damage: solDamage(ev) * M.neutralMult, stun: 0, kind: 'spell', sourceX: ev.x, knockback: solKnockback(ev) * 0.5 });
      case 'VERDAD':
        if (this._exhausted || !inVerdadRadius(ev, this.x, this.y)) return false;
        return this.takeHit({ damage: 0, stun: verdadStun(ev, true), kind: 'spell', sourceX: ev.x, knockback: 0 });
      case 'VOZ': {
        const s = SPELLS_FX.VOZ;
        if (this._exhausted || planeDist(this.x, this.y, ev.x, ev.y) > spellParam('VOZ', 'stunRadius', s.stunRadius) * powerScale(power)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('VOZ', 'stun', s.stun) * power, kind: 'spell', sourceX: ev.x, knockback: spellParam('VOZ', 'knockback', s.knockback) * power * 0.5 });
      }
      case 'PROTECCION': {
        const s = SPELLS_FX.PROTECCION;
        if (this._exhausted || planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y) > s.pushRadius) return false;
        releaseHold(this);
        return this.takeHit({ damage: 0, stun: s.stun * power, kind: 'spell', sourceX: ev.x, knockback: s.knockback * power });
      }
    }
    return false; // MEMORIA, ECOS ✖
  }

  /** AGOTADA: se arrodilla entre vendas sueltas; DESCANSO o CALMA la purifican. */
  private exhaust(): void {
    this.hp = 0;
    this._exhausted = true;
    this.stunAcc = 0;
    releaseHold(this);
    this.setStars(true, 0xe8dcc0);
    this.set('exhausted');
    sfx('momia_agotada');
    burst(this.scene, 'bandage', this.x, this.y - this.height * 0.5, this.y + FX_DEPTH_BIAS, fxN(10));
    if (!this.kit) this.sprite.setScale(1, 0.84);
    bus.emit('enemy:exhausted', { enemy: this });
    if (!toldExhausted) {
      toldExhausted = true;
      bus.emit('hud:toast', { text: 'La momia está agotada: dale DESCANSO (o CALMA) para que descanse en paz', ms: 3400 });
    }
  }

  /** Nadie la purificó a tiempo: se levanta de nuevo con media vida. */
  private recoverFromExhaustion(): void {
    this._exhausted = false;
    this.hp = Math.max(1, Math.round(this.maxHp * M.recoverHpFrac));
    this.setStars(false);
    if (!this.kit) this.sprite.setScale(1, 1);
    burst(this.scene, 'dust', this.x, this.y - 10, this.y + FX_DEPTH_BIAS, fxN(12));
    this.groan(true);
    this.set('chase');
  }

  /** Descansa en paz: las vendas caen, el polvo se asienta y una lucecita sube (sin violencia). */
  private purify(perfect: boolean): void {
    if (this.st === 'purifying') return;
    releaseHold(this);
    this.setStars(false);
    this.set('purifying');
    this._exhausted = true;
    this.z = 0;
    sfx('momia_descansa');
    purifyFx(this.scene, this.x, this.y, 1);
    const top = this.y - this.height;
    // Tiras de venda que caen al suelo.
    for (let i = 0; i < fxN(10); i++) {
      const strip = this.scene.add.image(this.x + rand(-8, 8), top + rand(0, this.height * 0.8), FB.px)
        .setTint(i % 2 ? hexColor(M.colors.wrap) : hexColor(M.colors.wrapDark))
        .setScale(rand(2.5, 4.5), 0.8).setAngle(rand(-40, 40)).setDepth(this.y + FX_DEPTH_BIAS);
      this.scene.tweens.add({
        targets: strip,
        x: strip.x + rand(-22, 22),
        y: this.y + rand(-3, 3),
        angle: strip.angle + rand(-120, 120),
        duration: rand(600, 1000),
        ease: 'Quad.easeIn',
        onComplete: () => this.scene.tweens.add({ targets: strip, alpha: 0, delay: 900, duration: 600, onComplete: () => strip.destroy() }),
      });
    }
    // El cuerpo se vuelve polvo y se asienta.
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 300, duration: M.purifySeconds * 1000 * 0.8 });
    burst(this.scene, 'dust', this.x, this.y - 20, this.y + FX_DEPTH_BIAS, fxN(14));
    const soul = this.scene.add.image(this.x, this.y - this.height * 0.7, FB.glow)
      .setTint(hexColor(M.colors.soul)).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3).setDepth(this.y + FX_DEPTH_BIAS);
    this.scene.tweens.add({ targets: soul, y: soul.y - 80, alpha: { from: 1, to: 0 }, delay: 300, duration: 1400, ease: 'Sine.easeIn', onComplete: () => soul.destroy() });
    const amount = Math.round(this._ecos * progression.bonus.purificar * (perfect ? progression.bonus.perfecto : 1));
    bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 30 });
    bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect });
    this.scene.time.delayedCall(M.purifySeconds * 1000, () => this.leaveWorld());
  }

  protected onDestroy(): void {
    releaseHold(this);
    this.eyes.destroy();
    this.wrapGfx.destroy();
    this.screamGfx.destroy();
  }
}
