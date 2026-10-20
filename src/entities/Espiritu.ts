import Phaser from 'phaser';
import type { EnemyApi, EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import progression from '../data/progression.json';
import { isLunaActive } from '../systems/Luna';
import {
  EnemyBase, FB, burst, hexColor, hitPlayer, inLuzRadius, inMemoriaRadius, inSolLine, planeDist, powerScale, purifyFx, rand, randRange,
  solDamage, solKnockback, spellParam, inVerdadRadius, inFuegoLine, inDescansoRadius, verdadStun, fuegoDamage, fuegoKnockback, burnFx,
} from './EnemyBase';

/**
 * Espíritu (Nivel 3, sendero al altar olmeca). Criatura flotante ~40 px, translúcida. Placeholder simple.
 * lunaOnly (por defecto): SIEMPRE ataca (deriva hacia el jugador con correa a su punto de origen, lo toca y le
 * drena vida), pero sin Luna es invisible e intocable: no se le puede ver ni golpear ni purificar (decisión del
 * equipo, 2026-10-19: el chiste es que necesitas Luna para defenderte). Sin Luna solo deja un destello tenue al
 * preparar el golpe, y la primera vez que te hiere avisa que actives Luna.
 * Con Luna: brilla, se le puede golpear y su cuerpo empuja al jugador (bloquea el paso en grupo).
 * Afinidades (contratos §5): LUZ purifica (en radio) · CALMA purifica · SOL daña · VOZ aturde · PROTECCION ➖ · láser ✖.
 * Con vida en 0 (SOL) queda agotado: se purifica con LUZ / CALMA o se va solo con los Ecos base.
 */

const S = enemiesData.espiritu;
const TEX = '__cb_espiritu';

type St = 'float' | 'drift' | 'windup' | 'touch' | 'recover' | 'dizzy' | 'exhausted' | 'purifying';

function ensureEspirituTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEX)) return TEX;
  const g = scene.make.graphics({}, false);
  const c = hexColor(S.color);
  // Cola de humo que se adelgaza hacia abajo.
  g.fillStyle(c, 0.35).fillTriangle(14, 26, 34, 26, 22, 46);
  g.fillStyle(c, 0.55).fillTriangle(16, 24, 32, 24, 26, 42);
  // Cuerpo (cabeza redonda) con halo.
  g.fillStyle(c, 0.3).fillCircle(24, 20, 15);
  g.fillStyle(c, 0.85).fillCircle(24, 20, 11);
  g.fillStyle(0xffffff, 0.8).fillCircle(21, 16, 4);
  // Ojos huecos y boca.
  g.fillStyle(0x10283a, 1).fillEllipse(20, 20, 4, 6).fillEllipse(29, 20, 4, 6);
  g.fillStyle(0x10283a, 0.8).fillEllipse(25, 27, 4, 3);
  g.generateTexture(TEX, S.frame.w, S.frame.h);
  g.destroy();
  return TEX;
}

export class Espiritu extends EnemyBase {
  kind: EnemyKind = 'espiritu';
  /** El aviso "algo invisible te ataca" sale una sola vez por partida. */
  static toldInvisible = false;
  /** Jefe que lo invocó (la Cabeza Olmeca): al calmarla, se disipa. */
  summonedBy: EnemyApi | null = null;
  private st: St = 'float';
  private stT = 0;
  private cooldown = rand(0.6, 1.6);
  private homeX: number;
  private homeY: number;
  private vis = 0;
  private floatT = Math.random() * 10;
  private wanderTo: { x: number; y: number } | null = null;
  private wanderT = 0;
  private hitDone = false;
  private glow: Phaser.GameObjects.Image;
  private wasTangible = false;

  constructor(world: WorldApi, x: number, y: number, lunaOnly = true, group?: string) {
    super(world, x, y, {
      hp: S.hp,
      radius: S.radius,
      height: S.height,
      ecos: S.ecos,
      feetY: S.frame.feetY,
      frameH: S.frame.h,
      fallbackTex: ensureEspirituTexture(world.scene),
      textureKey: 'espiritu_reposo',
      shadowW: 18,
      kitId: 'espiritu',
    });
    this.lunaOnly = lunaOnly;
    this.group = group;
    this.homeX = x;
    this.homeY = y;
    this.z = S.hoverZ;
    this.glow = this.scene.add.image(x, y, FB.glow).setTint(hexColor(S.color)).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.vis = this.tangible ? 1 : 0;
    this.play('espiritu_reposo');
    this.applyVisibility(0);
    this.render(0);
  }

  /** ¿Existe ahora para el jugador? (lunaOnly → solo con Luna). */
  get tangible(): boolean {
    return !this.lunaOnly || isLunaActive();
  }

  private set(st: St): void {
    this.st = st;
    this.stT = 0;
    this.hitDone = false;
    const anim: Record<St, string> = {
      float: 'espiritu_reposo',
      drift: 'espiritu_caminar',
      windup: 'espiritu_ataque',
      touch: 'espiritu_ataque',
      recover: 'espiritu_reposo',
      dizzy: 'espiritu_aturdido',
      exhausted: 'espiritu_agotado',
      purifying: 'espiritu_purificar',
    };
    this.play(anim[st]);
  }

  private moveToward(tx: number, ty: number, speed: number, dt: number): number {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return d;
    const step = Math.min(d, speed * dt);
    this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.8);
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
    return d;
  }

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    const tangible = this.tangible;
    this.stT += dt;
    this.cooldown -= dt;
    this.floatT += dt;
    if (this.stunAcc > 0 && this.st !== 'dizzy') this.stunAcc = Math.max(0, this.stunAcc - S.stunDecay * dt);
    this.stepKnockback(dt);

    if (tangible && !this.wasTangible && this.st !== 'purifying') {
      // Aparece al activar Luna.
      burst(this.scene, 'purify', this.x, this.y - this.z - 16, this.y + FX_DEPTH_BIAS, 4);
    }
    this.wasTangible = tangible;

    switch (this.st) {
      case 'float':
        this.wander(dt);
        // Ataca con o sin Luna: invisible no significa inofensivo.
        if (planeDist(this.x, this.y, p.x, p.y) < S.aggroRadius) this.set('drift');
        break;
      case 'drift': {
        const leash = planeDist(this.x, this.y, this.homeX, this.homeY) > S.leashRadius;
        const d = planeDist(this.x, this.y, p.x, p.y);
        if (leash || d > S.aggroRadius * 1.4) {
          this.moveToward(this.homeX, this.homeY, S.driftSpeed, dt);
          if (planeDist(this.x, this.y, this.homeX, this.homeY) < 8) this.set('float');
          break;
        }
        if (d > S.attack.range * 0.7) this.moveToward(p.x, p.y, S.driftSpeed, dt);
        if (d < S.attack.range && Math.abs(p.y - this.y) < DEPTH_TOLERANCE * 1.5 && this.cooldown <= 0) this.set('windup');
        break;
      }
      case 'windup':
        this.facing = p.x > this.x ? 1 : -1;
        if (this.stT >= S.attack.windup) this.set('touch');
        break;
      case 'touch':
        this.moveToward(p.x, p.y, S.driftSpeed * 2.5, dt);
        if (!this.hitDone) {
          this.hitDone = true;
          if (planeDist(this.x, this.y, p.x, p.y) < S.attack.range + 6 && Math.abs(p.y - this.y) < DEPTH_TOLERANCE * 1.5) {
            if (hitPlayer(this.world, { damage: S.attack.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: S.attack.knockback })) {
              this.drainFx();
              if (!tangible && !Espiritu.toldInvisible) {
                Espiritu.toldInvisible = true;
                bus.emit('hud:toast', { text: 'Algo invisible te ataca. Pulsa F (Luna) para verlo y defenderte.', ms: 4200 });
              }
            }
          }
        }
        if (this.stT >= S.attack.active) {
          this.set('recover');
          this.stT = -S.attack.recover;
        }
        break;
      case 'recover':
        if (this.stT >= 0) {
          this.cooldown = randRange(S.attack.cooldown);
          this.set('drift');
        }
        break;
      case 'dizzy':
        if (this.stT >= S.dizzySeconds) {
          this.setStars(false);
          this.stunAcc = 0;
          this.set('float');
        }
        break;
      case 'exhausted':
        if (this.stT >= S.exhaustedSeconds) this.retire();
        break;
      case 'purifying':
        break;
    }

    // Bloquea el paso (solo si existe para el jugador).
    if (S.blocks && tangible && this.st !== 'purifying' && this.st !== 'exhausted') this.pushPlayer();

    // Flota: z con vaivén.
    const bob = this.st === 'exhausted' ? 0 : Math.sin(this.floatT * 2.4 + this.uid) * S.bob;
    this.z = Math.max(2, (this.st === 'exhausted' ? S.hoverZ * 0.3 : S.hoverZ) + bob);
    this.applyVisibility(dt);
    this.render(dt);
  }

  private wander(dt: number): void {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = rand(1.5, 3);
      this.wanderTo = { x: this.homeX + rand(-S.wanderRadius, S.wanderRadius), y: this.homeY + rand(-S.wanderRadius, S.wanderRadius) * 0.4 };
    }
    if (this.wanderTo && this.moveToward(this.wanderTo.x, this.wanderTo.y, S.driftSpeed * 0.4, dt) < 2) this.wanderTo = null;
  }

  private pushPlayer(): void {
    const p = this.world.player;
    const min = this.radius + p.radius;
    const dx = p.x - this.x;
    const dy = (p.y - this.y) * 2;
    const d = Math.hypot(dx, dy);
    if (d >= min) return;
    const nx = d > 0.01 ? dx / d : p.x >= this.x ? 1 : -1;
    const ny = d > 0.01 ? dy / d : 0;
    const push = min - d;
    this.world.moveActor(p, nx * push, ny * push * 0.5);
  }

  /** Alpha según Luna (aparece y desaparece suave) + parpadeo translúcido. */
  private applyVisibility(dt: number): void {
    const target = this.tangible || this.st === 'purifying' ? 1 : 0;
    const k = dt > 0 ? Math.min(1, S.fadeSpeed * dt) : 1;
    this.vis += (target - this.vis) * k;
    if (Math.abs(target - this.vis) < 0.01) this.vis = target;
    const flicker = 0.85 + 0.15 * Math.sin(this.floatT * 7 + this.uid);
    const dim = this.st === 'exhausted' ? 0.5 : 1;
    if (this.st !== 'purifying') this.sprite.setAlpha(this.vis * S.alpha * flicker * dim);
    this.shadow.setAlpha(this.vis * 0.25);
    this.stars.forEach((s) => s.setAlpha(this.vis));
    const windup = this.st === 'windup' ? 0.4 + 0.4 * Math.abs(Math.sin(this.stT * 18)) : 0;
    // Invisible: solo un destello tenue al preparar el golpe, como pista para activar Luna.
    const hint = !this.tangible && (this.st === 'windup' || this.st === 'touch') ? S.invisibleHintAlpha * (0.5 + windup) : 0;
    this.glow
      .setPosition(this.x, this.y - this.z - this.height * 0.55)
      .setDepth(this.y - 0.1)
      .setScale(1.6 + windup)
      .setTint(this.st === 'windup' ? 0xa0c0ff : hexColor(S.color))
      .setAlpha(Math.max(this.vis * (0.35 + windup) * dim, hint));
  }

  private drainFx(): void {
    const p = this.world.player;
    for (let i = 0; i < 5; i++) {
      const m = this.scene.add.image(p.x, p.y - p.z - 24, FB.glow).setTint(0x9ff0ff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.25).setDepth(this.y + FX_DEPTH_BIAS);
      this.scene.tweens.add({
        targets: m,
        x: this.x + rand(-4, 4),
        y: this.y - this.z - 20,
        alpha: 0,
        delay: i * 50,
        duration: 380,
        onComplete: () => m.destroy(),
      });
    }
  }

  takeHit(hit: Hit): boolean {
    if (!this._alive || !this.tangible) return false;
    if (this.st === 'exhausted' || this.st === 'purifying') return false;
    // El láser lo atraviesa: no le afecta.
    if (hit.kind === 'laser-green' || hit.kind === 'laser-red') return false;
    this.hp -= hit.damage;
    this.stunAcc += hit.stun;
    this.onDamaged(hit, 0.6);
    bus.emit('enemy:hit', { enemy: this, kind: 'spell' });
    if (this.hp <= 0) this.exhaust();
    else if (this.stunAcc >= S.stunThreshold && this.st !== 'dizzy') {
      this.set('dizzy');
      this.setStars(true);
      burst(this.scene, 'stun', this.x, this.y - this.z - this.height, this.y + FX_DEPTH_BIAS, 6);
    }
    return true;
  }

  private exhaust(): void {
    this.hp = 0;
    this._exhausted = true;
    this.setStars(true, 0x9ff0ff);
    this.set('exhausted');
    bus.emit('enemy:exhausted', { enemy: this });
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || ev.outcome === 'fail' || this.st === 'purifying') return false;
    if (!this.tangible) return false; // sin Luna no existe para el jugador
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    const perfect = ev.outcome === 'perfect';
    switch (ev.spellId) {
      case 'LUZ':
        if (!inLuzRadius(ev, this.x, this.y, 'purifyRadius')) return false;
        this.purify(perfect);
        return true;
      case 'CALMA': {
        const s = SPELLS_FX.CALMA;
        const r = Math.max(spellParam('CALMA', 'purifyRadius', s.purifyRadius), spellParam('CALMA', 'calmRadius', s.calmRadius)) * powerScale(power);
        if (planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y) > r) return false;
        this.purify(perfect);
        return true;
      }
      case 'MEMORIA':
        // Nivel 4: purifica como CALMA dentro de su radio.
        if (!inMemoriaRadius(ev, this.x, this.y)) return false;
        this.purify(perfect);
        return true;
      case 'SOL':
        if (!inSolLine(ev, this.x, this.y, this.radius)) return false;
        return this.takeHit({ damage: solDamage(ev), stun: 0, kind: 'spell', sourceX: ev.x, knockback: solKnockback(ev) * 0.5 });
      case 'VOZ': {
        const s = SPELLS_FX.VOZ;
        if (this._exhausted || planeDist(this.x, this.y, ev.x, ev.y) > spellParam('VOZ', 'stunRadius', s.stunRadius) * powerScale(power)) return false;
        return this.takeHit({ damage: 0, stun: spellParam('VOZ', 'stun', s.stun) * power, kind: 'spell', sourceX: ev.x, knockback: 0 });
      }
      // Nivel 6. DESCANSO: son muertos que no descansan → los libera (purifica). VERDAD: aturde. FUEGO: daña.
      case 'DESCANSO':
        if (!inDescansoRadius(ev, this.x, this.y, this.radius)) return false;
        this.purify(perfect);
        return true;
      case 'VERDAD':
        if (this._exhausted || !inVerdadRadius(ev, this.x, this.y)) return false;
        return this.takeHit({ damage: 0, stun: verdadStun(ev), kind: 'spell', sourceX: ev.x, knockback: 0 });
      case 'FUEGO':
        if (!inFuegoLine(ev, this.x, this.y, this.radius)) return false;
        burnFx(this.scene, this);
        return this.takeHit({ damage: fuegoDamage(ev), stun: 0, kind: 'spell', sourceX: ev.x, knockback: fuegoKnockback(ev) * 0.5 });
    }
    return false; // PROTECCION: ➖
  }

  /** Purificación (con bono +50 %, ×1.25 si es PERFECTO). bonus = false: Ecos base (disipado por el jefe). */
  purify(perfect: boolean, bonus = true): void {
    if (!this._alive || this.st === 'purifying') return;
    this.setStars(false);
    this.set('purifying');
    this._exhausted = true;
    sfx('purificar');
    purifyFx(this.scene, this.x, this.y, 0.6);
    const amount = Math.round(this._ecos * (bonus ? progression.bonus.purificar : 1) * (perfect ? progression.bonus.perfecto : 1));
    this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 200 });
    this.scene.time.delayedCall(S.purifySeconds * 1000, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 20 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect });
      this._purified = true;
      this.scene.tweens.add({ targets: [this.sprite, this.glow], alpha: 0, y: '-=14', duration: 600, onComplete: () => this.leaveWorld() });
      this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 600 });
    });
  }

  /** La Cabeza Olmeca fue calmada: sus espíritus se disipan (Ecos base). */
  dissipate(): void {
    this.purify(false, false);
  }

  /** Nadie lo purificó: se desvanece con los Ecos base. */
  private retire(): void {
    this.setStars(false);
    this.set('purifying');
    this._purified = true;
    bus.emit('ecos:gained', { amount: this._ecos, x: this.x, y: this.y - 20 });
    this.scene.tweens.add({ targets: [this.sprite, this.shadow, this.glow], alpha: 0, duration: 900, onComplete: () => this.leaveWorld() });
  }

  protected onDestroy(): void {
    this.glow.destroy();
  }
}
