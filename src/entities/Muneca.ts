import Phaser from 'phaser';
import type { EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import progression from '../data/progression.json';
import {
  EnemyBase, FB, burnFx, burst, hexColor, hitPlayer, inDescansoRadius, inFuegoLine, inLuzRadius, inSolLine, planeDist, powerScale,
  rand, randRange, solDamage, solKnockback, spellParam,
} from './EnemyBase';

/**
 * Muñeca poseída (Nivel 6, contratos §5 y §7). OBJETO, no ser del folclor: no se purifica ni queda agotada.
 * Cuadro 48×48, pies en y = 46, ~30 px de alto. PLACEHOLDER SIMPLE (AGENTS §8.0): muñeca vieja con ojos rojos.
 * - Emboscada: espera escondida; al acercarse el jugador (o al empezar su arena) CAE de los árboles o
 *   SE LEVANTA del lodo. Corretea con tirones, se ríe, salta a morder y araña de cerca.
 * - Láser rojo / SOL / FUEGO: se ROMPE en pedazos de tela y porcelana (sin sangre). Ecos base. 'enemy:removed'.
 *   FUEGO la destruye de un golpe.
 * - DESCANSO: libera el alma atrapada (sale una lucecita y la muñeca queda inerte en el suelo).
 *   Ecos × 1.5 (× 1.25 PERFECTO), 'enemy:purified' y luego 'enemy:removed'.
 * - LUZ y VOZ aturden · PROTECCION empuja · CALMA / MEMORIA ✖ · VERDAD ➖.
 */

const M = enemiesData.muneca;
const TEX = '__cb_muneca';

type St =
  | 'hidden' | 'entering' | 'chase' | 'scratchWindup' | 'scratch' | 'leapWindup' | 'leap' | 'recover'
  | 'hurt' | 'dizzy' | 'freed' | 'broken';

let toldCalma = false;
let toldDescanso = false;
/** Las risitas se reparten entre todas las muñecas (para no saturar el audio). */
let lastGiggle = 0;

/** Placeholder: muñeca vieja de vestido gastado, cara de porcelana agrietada. Mira a la derecha. */
function ensureMunecaTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const c = M.colors;
  const g = scene.make.graphics({}, false);
  // Piernitas y zapatos.
  g.fillStyle(hexColor(c.skinDark), 1).fillRect(20, 38, 3, 7).fillRect(25, 38, 3, 7);
  g.fillStyle(0x3a2a22, 1).fillRect(19, 44, 5, 2).fillRect(25, 44, 5, 2);
  // Vestido (trapecio) con holán.
  g.fillStyle(hexColor(c.dressDark), 1).fillTriangle(14, 40, 34, 40, 24, 22);
  g.fillStyle(hexColor(c.dress), 1).fillTriangle(16, 39, 32, 39, 24, 23);
  g.fillStyle(hexColor(c.dressDark), 1).fillRect(15, 38, 18, 2);
  // Bracitos.
  g.fillStyle(hexColor(c.skin), 1).fillRect(15, 26, 3, 8).fillRect(30, 26, 3, 8);
  // Cabeza de porcelana con grieta y cabello revuelto.
  g.fillStyle(hexColor(c.hair), 1).fillCircle(23, 15, 8);
  g.fillStyle(hexColor(c.skin), 1).fillCircle(25, 17, 6);
  g.fillStyle(hexColor(c.hair), 1).fillRect(17, 9, 10, 3).fillRect(16, 12, 3, 10);
  g.fillStyle(hexColor(c.skinDark), 1).fillRect(26, 12, 1, 3).fillRect(27, 15, 1, 2).fillRect(26, 17, 1, 2);
  // Cuencas oscuras y ojos rojos.
  g.fillStyle(0x201010, 1).fillRect(26, 16, 3, 2).fillRect(22, 16, 2, 2);
  g.fillStyle(hexColor(c.eyes), 1).fillRect(27, 16, 1, 1).fillRect(22, 16, 1, 1);
  // Boquita cosida.
  g.fillStyle(0x6a3030, 1).fillRect(26, 20, 3, 1);
  g.generateTexture(TEX, M.frame.w, M.frame.h);
  g.destroy();
  return TEX;
}

export class Muneca extends EnemyBase {
  kind: EnemyKind = 'muneca';
  private st: St = 'hidden';
  private stT = 0;
  private hitDone = false;
  private cooldown = rand(0.4, 1.0);
  private leapCd = rand(1, 2);
  private giggleT = randRange(M.giggle.every);
  private jitterT = 0;
  private jitter = { x: 0, y: 0 };
  private dropMode: boolean;
  private leapFrom = { x: 0, y: 0 };
  private leapTo = { x: 0, y: 0 };
  private eyes: Phaser.GameObjects.Image;
  private walkPhase = Math.random() * 10;
  private readonly fullHeight = M.height;

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    super(world, x, y, {
      hp: M.hp,
      radius: M.radius,
      height: M.height,
      ecos: M.ecos,
      feetY: M.frame.feetY,
      frameH: M.frame.h,
      fallbackTex: ensureMunecaTexture(world.scene),
      textureKey: 'muneca_reposo',
      shadowW: M.shadowW,
      kitId: 'muneca',
    });
    this.group = group;
    this.dropMode = Math.random() < M.dropChance;
    this.eyes = this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(M.colors.eyes)).setScale(0.18).setAlpha(0);
    // Escondida: no se ve, no se golpea (altura 0: el láser pasa por encima) y no ataca.
    this.height = 0;
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.play('muneca_reposo');
    this.render(0);
  }

  /** María y otros sistemas no la tocan mientras sigue escondida. */
  get isAware(): boolean {
    return this.st !== 'hidden' && this.st !== 'entering';
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    if (this.flashT <= 0 && st !== 'scratchWindup' && st !== 'leapWindup') this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    const anim: Record<St, string> = {
      hidden: 'muneca_reposo',
      entering: 'muneca_salto',
      chase: 'muneca_correr',
      scratchWindup: 'muneca_ataque',
      scratch: 'muneca_ataque',
      leapWindup: 'muneca_golpe',
      leap: 'muneca_salto',
      recover: 'muneca_reposo',
      hurt: 'muneca_dano',
      dizzy: 'muneca_aturdido',
      freed: 'muneca_morir',
      broken: 'muneca_morir',
    };
    this.play(anim[st]);
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private attackersNow(): number {
    let n = 0;
    for (const e of this.world.enemies) if (e instanceof Muneca && e !== this && e.isAttacking) n++;
    return n;
  }

  get isAttacking(): boolean {
    return this.st === 'scratchWindup' || this.st === 'scratch' || this.st === 'leapWindup' || this.st === 'leap';
  }

  /* ------------------------------ Emboscada ------------------------------ */

  private startAmbush(): void {
    this.set('entering');
    this.sprite.setVisible(true);
    this.shadow.setVisible(true);
    this.height = this.fullHeight;
    this.facePlayer();
    if (this.dropMode) {
      // Cae de las ramas: aparece arriba, un poco desplazada.
      this.x += rand(-M.drop.spreadX, M.drop.spreadX);
      if (!this.world.isWalkable(this.x, this.y, this.radius)) {
        const pt = this.world.randomPointNear(this.x, this.y, 30);
        this.x = pt.x;
        this.y = pt.y;
      }
      this.z = M.drop.fromZ;
      this.sprite.setAlpha(1);
    } else {
      // Se levanta del lodo: sale desde abajo entre salpicaduras oscuras.
      this.z = -this.fullHeight * 0.6;
      this.sprite.setAlpha(0);
      burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 10);
    }
    this.giggle(true);
  }

  private updateEntering(dt: number): void {
    if (this.dropMode) {
      const k = Math.min(1, this.stT / M.drop.fallSeconds);
      this.z = M.drop.fromZ * (1 - k * k);
      if (Math.random() < dt * 20) burst(this.scene, 'dust', this.x + rand(-6, 6), this.y - this.z - 10, this.y + FX_DEPTH_BIAS, 1);
      if (k >= 1) {
        this.z = 0;
        burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 8);
        this.set('chase');
      }
    } else {
      const k = Math.min(1, this.stT / M.rise.seconds);
      this.z = -this.fullHeight * 0.6 * (1 - k);
      this.sprite.setAlpha(Math.min(1, k * 1.6));
      if (Math.random() < dt * 14) burst(this.scene, 'dust', this.x + rand(-8, 8), this.y, this.y + FX_DEPTH_BIAS, 1);
      if (k >= 1) {
        this.z = 0;
        this.sprite.setAlpha(1);
        this.set('chase');
      }
    }
  }

  private giggle(force = false): void {
    const now = this.scene.time.now;
    if (!force && now - lastGiggle < 900) return;
    lastGiggle = now;
    sfx('muneca_risa');
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    this.cooldown -= dt;
    this.leapCd -= dt;
    if (this.stunAcc > 0 && this.st !== 'dizzy') this.stunAcc = Math.max(0, this.stunAcc - M.stunDecay * dt);
    this.stepKnockback(dt);
    this.bob = 0;

    switch (this.st) {
      case 'hidden':
        if (this.group || planeDist(this.x, this.y, p.x, p.y) < M.ambushRadius) this.startAmbush();
        break;
      case 'entering':
        this.updateEntering(dt);
        break;
      case 'chase':
        this.updateChase(dt);
        break;
      case 'scratchWindup':
        this.facePlayer();
        this.telegraph(0x602020);
        if (this.stT >= M.scratch.windup) this.set('scratch');
        break;
      case 'scratch':
        this.world.moveActor(this, this.facing * 90 * dt, 0);
        if (!this.hitDone) {
          this.hitDone = true;
          burst(this.scene, 'sparkRed', this.x + this.facing * 14, this.y - 16, this.y + FX_DEPTH_BIAS, 3);
          if (Math.abs(p.x - this.x) < M.scratch.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < M.scratch.dodgeHeight) {
            hitPlayer(this.world, { damage: M.scratch.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: M.scratch.knockback });
          }
        }
        if (this.stT >= M.scratch.active) this.toRecover(M.scratch.recover);
        break;
      case 'leapWindup':
        this.facePlayer();
        this.telegraph(0x703020);
        this.bob = -Math.min(2, this.stT * 6);
        if (this.stT >= M.leap.windup) {
          this.leapFrom = { x: this.x, y: this.y };
          const dx = p.x - this.x;
          const dy = p.y - this.y;
          const d = Math.hypot(dx, dy) || 1;
          const reach = Math.min(d, M.leap.maxDist);
          this.leapTo = { x: this.x + (dx / d) * reach, y: this.y + (dy / d) * reach };
          this.giggle();
          this.set('leap');
        }
        break;
      case 'leap': {
        const L = M.leap;
        const k = Math.min(1, this.stT / L.time);
        const tx = this.leapFrom.x + (this.leapTo.x - this.leapFrom.x) * k;
        const ty = this.leapFrom.y + (this.leapTo.y - this.leapFrom.y) * k;
        this.world.moveActor(this, tx - this.x, ty - this.y);
        this.z = Math.sin(Math.PI * k) * L.peak;
        // Mordida al caer sobre el jugador.
        if (!this.hitDone && k > 0.35 && planeDist(this.x, this.y, p.x, p.y) < L.hitRadius + p.radius && Math.abs(this.z - p.z) < 22 && !p.isDodging) {
          this.hitDone = true;
          hitPlayer(this.world, { damage: L.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: L.knockback });
        }
        if (k >= 1) {
          this.z = 0;
          burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 4);
          this.leapCd = randRange(L.cooldown);
          this.toRecover(L.recover);
        }
        break;
      }
      case 'recover':
        if (this.stT >= 0) {
          this.cooldown = randRange(M.attackCooldown);
          this.set('chase');
        }
        break;
      case 'hurt':
        if (this.z > 0) this.z = Math.max(0, this.z - 200 * dt);
        if (this.stT >= M.hurtSeconds) this.set('chase');
        break;
      case 'dizzy':
        if (this.z > 0) this.z = Math.max(0, this.z - 200 * dt);
        if (this.stT >= M.dizzySeconds) {
          this.setStars(false);
          this.stunAcc = 0;
          this.set('chase');
        }
        break;
      case 'freed':
      case 'broken':
        break;
    }

    if (this.st !== 'hidden' && this.st !== 'leap' && this.st !== 'freed' && this.st !== 'broken') this.separate(dt, M.separation);
    // Corretea a tirones (sin arte: rebote rápido).
    if (!this.hasArt && this.st === 'chase') {
      this.walkPhase += dt * 22;
      this.bob = Math.abs(Math.sin(this.walkPhase)) * 2;
    }
    this.render(dt);
    this.placeEyes();
  }

  private updateChase(dt: number): void {
    const p = this.world.player;
    const dxp = p.x - this.x;
    const dyp = p.y - this.y;
    const dist = planeDist(this.x, this.y, p.x, p.y);
    if (dist > M.loseDistance && !this.group) return;
    this.giggleT -= dt;
    if (this.giggleT <= 0) {
      this.giggleT = randRange(M.giggle.every);
      if (Math.random() < M.giggle.chance) this.giggle();
    }
    const ready = this.cooldown <= 0 && this.attackersNow() < M.maxAttackers;
    const L = M.leap;
    if (ready && this.leapCd <= 0 && Math.abs(dxp) > L.minDist && Math.abs(dxp) < L.maxDist && Math.abs(dyp) < L.depthAlign) {
      this.set('leapWindup');
      return;
    }
    if (ready && Math.abs(dxp) < M.scratch.range + this.radius && Math.abs(dyp) < DEPTH_TOLERANCE * 0.8) {
      this.set('scratchWindup');
      return;
    }
    // Movimiento a tirones: cambia de rumbo cada poco (inquietante).
    this.jitterT -= dt;
    if (this.jitterT <= 0) {
      this.jitterT = rand(0.25, 0.6);
      this.jitter = { x: rand(-M.jitter, M.jitter), y: rand(-M.jitter, M.jitter) * 0.5 };
    }
    const side = Math.sign(-dxp) || (this.uid % 2 ? 1 : -1);
    const tx = p.x + side * (M.scratch.range * 0.7) + (ready ? 0 : this.jitter.x * 2);
    const ty = p.y + this.jitter.y;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      const step = Math.min(d, M.chaseSpeed * dt * (0.7 + 0.6 * Math.abs(Math.sin(this.stT * 9))));
      this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.8);
    }
    if (Math.abs(dxp) > 2) this.facing = dxp > 0 ? 1 : -1;
  }

  private toRecover(seconds: number): void {
    this.set('recover');
    this.stT = -seconds;
  }

  private telegraph(color: number): void {
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 16) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  private placeEyes(): void {
    const head = this.y - this.z - this.bob - this.fullHeight * 0.95;
    const on = this.st !== 'hidden' && this.st !== 'freed' && this.st !== 'broken';
    const pulse = 0.6 + 0.4 * Math.sin(this.scene.time.now / 120 + this.uid);
    this.eyes
      .setPosition(this.x + this.facing * 2, head)
      .setAlpha(on ? (this.isAttacking ? 1 : pulse) * this.sprite.alpha : 0)
      .setScale(this.isAttacking ? 0.26 : 0.18)
      .setDepth(this.y + FX_DEPTH_BIAS);
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'hidden' || this.st === 'entering' || this.st === 'freed' || this.st === 'broken') return false;
    this.hp -= hit.damage;
    this.stunAcc += hit.stun;
    this.onDamaged(hit, this.st === 'leap' ? 0.3 : M.knockbackScale);
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (this.hp <= 0) {
      this.breakApart();
    } else if (this.stunAcc >= M.stunThreshold && this.st !== 'dizzy') {
      this.set('dizzy');
      this.setStars(true);
      burst(this.scene, 'stun', this.x, this.y - this.fullHeight, this.y + FX_DEPTH_BIAS, 5);
    } else if (hit.damage >= 1 && this.st !== 'dizzy' && this.st !== 'leap') {
      this.set('hurt');
    }
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || ev.outcome === 'fail') return false;
    if (this.st === 'hidden' || this.st === 'entering' || this.st === 'freed' || this.st === 'broken') return false;
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    switch (ev.spellId) {
      case 'DESCANSO':
        if (!inDescansoRadius(ev, this.x, this.y, this.radius)) return false;
        this.free(ev.outcome === 'perfect');
        return true;
      case 'FUEGO':
        if (!inFuegoLine(ev, this.x, this.y, this.radius)) return false;
        burnFx(this.scene, this, 300);
        bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
        this.breakApart(true);
        return true;
      case 'SOL':
        if (!inSolLine(ev, this.x, this.y, this.radius)) return false;
        return this.takeHit({ damage: solDamage(ev), stun: 0, kind: 'spell', sourceX: ev.x, knockback: solKnockback(ev) });
      case 'LUZ':
        if (!inLuzRadius(ev, this.x, this.y)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('LUZ', 'stun', SPELLS_FX.LUZ.stun) * power, kind: 'spell', sourceX: ev.x, knockback: 6 });
      case 'VOZ': {
        const s = SPELLS_FX.VOZ;
        if (planeDist(this.x, this.y, ev.x, ev.y) > spellParam('VOZ', 'stunRadius', s.stunRadius) * powerScale(power)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('VOZ', 'stun', s.stun) * power, kind: 'spell', sourceX: ev.x, knockback: spellParam('VOZ', 'knockback', s.knockback) * power });
      }
      case 'PROTECCION': {
        const s = SPELLS_FX.PROTECCION;
        if (planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y) > s.pushRadius) return false;
        return this.takeHit({ damage: 0, stun: s.stun * power, kind: 'spell', sourceX: ev.x, knockback: s.knockback * power * 1.5 });
      }
      case 'CALMA':
      case 'MEMORIA': {
        // ✖: no es un ser del folclor; es un objeto con un alma atrapada.
        const r = spellParam('CALMA', 'calmRadius', SPELLS_FX.CALMA.calmRadius) * 1.5;
        if (!toldCalma && planeDist(this.x, this.y, ev.x, ev.y) < r) {
          toldCalma = true;
          bus.emit('hud:toast', { text: 'La muñeca no es un ser del folclor: rómpela (láser rojo, FUEGO) o libera su alma con DESCANSO', ms: 3400 });
        }
        return false;
      }
    }
    return false; // VERDAD ➖
  }

  /** Se rompe en pedazos de tela y porcelana (sin sangre). Ecos base. */
  private breakApart(byFire = false): void {
    if (this.st === 'broken' || this.st === 'freed') return;
    this.hp = 0;
    this._exhausted = true;
    this.setStars(false);
    this.set('broken');
    sfx('muneca_romper');
    const c = M.colors;
    const top = this.y - this.z;
    const depth = this.y + FX_DEPTH_BIAS;
    for (let i = 0; i < M.pieces; i++) {
      const cloth = i % 2 === 0;
      const pal = cloth ? c.cloth : c.porcelain;
      const col = hexColor(pal[i % pal.length]);
      const piece = this.scene.add.image(this.x + rand(-4, 4), top - rand(6, this.fullHeight), FB.px)
        .setTint(byFire && cloth ? 0x3a2a20 : col)
        .setScale(cloth ? rand(1.2, 2.2) : rand(0.8, 1.4), cloth ? rand(0.8, 1.4) : rand(0.8, 1.4))
        .setAngle(rand(0, 180))
        .setDepth(depth);
      const dx = rand(-34, 34);
      const landY = this.y + rand(-4, 4);
      this.scene.tweens.add({ targets: piece, x: piece.x + dx, angle: piece.angle + rand(-300, 300), duration: rand(380, 620) });
      this.scene.tweens.add({
        targets: piece,
        y: { from: piece.y, to: landY },
        ease: 'Bounce.easeOut',
        duration: rand(420, 650),
        onComplete: () => this.scene.tweens.add({ targets: piece, alpha: 0, delay: 1400, duration: 600, onComplete: () => piece.destroy() }),
      });
    }
    burst(this.scene, byFire ? 'sun' : 'dust', this.x, top - 14, depth, 10);
    burst(this.scene, 'smoke', this.x, top - 10, depth, 4);
    bus.emit('ecos:gained', { amount: this._ecos, x: this.x, y: this.y - 20 });
    this.leaveWorld();
  }

  /** DESCANSO: el alma sale como una lucecita y la muñeca queda inerte (Ecos con bono). */
  private free(perfect: boolean): void {
    if (this.st === 'freed' || this.st === 'broken') return;
    this._exhausted = true;
    this.setStars(false);
    this.set('freed');
    this.z = 0;
    sfx('muneca_liberar');
    if (!toldDescanso) {
      toldDescanso = true;
      bus.emit('hud:toast', { text: 'Su alma por fin descansa', ms: 2000 });
    }
    const soulY = this.y - this.fullHeight * 0.8;
    const soul = this.scene.add.image(this.x, soulY, FB.glow).setTint(hexColor(M.colors.soul)).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3).setDepth(this.y + FX_DEPTH_BIAS);
    this.scene.tweens.add({ targets: soul, scale: 0.55, duration: 300, yoyo: true, repeat: 1 });
    this.scene.tweens.add({
      targets: soul,
      y: soulY - 70,
      x: this.x + rand(-12, 12),
      alpha: { from: 1, to: 0 },
      delay: 350,
      duration: M.freedSeconds * 1000,
      ease: 'Sine.easeIn',
      onComplete: () => soul.destroy(),
    });
    burst(this.scene, 'calm', this.x, soulY, this.y + FX_DEPTH_BIAS, 6);
    const amount = Math.round(this._ecos * progression.bonus.purificar * (perfect ? progression.bonus.perfecto : 1));
    bus.emit('ecos:gained', { amount, x: this.x, y: soulY });
    bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect });
    // Queda inerte: una muñeca vieja tirada en el suelo (decorado), y la entidad sale del mundo.
    const sp = this.sprite;
    const rest = this.scene.add.image(sp.x, sp.y, sp.texture.key, sp.frame.name)
      .setOrigin(sp.originX, sp.originY).setDepth(sp.depth).setFlipX(sp.flipX).setScale(sp.scaleX, sp.scaleY).setTint(0xb8b0a8);
    this.scene.tweens.add({ targets: rest, angle: -this.facing * 80, delay: 250, duration: 420, ease: 'Quad.easeIn' });
    this.scene.tweens.add({ targets: rest, alpha: 0, delay: M.inertSeconds * 1000, duration: 900, onComplete: () => rest.destroy() });
    this.leaveWorld();
  }

  protected onDestroy(): void {
    this.eyes.destroy();
  }
}
