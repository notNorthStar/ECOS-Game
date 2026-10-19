import Phaser from 'phaser';
import type { ChanequeVariant, EnemyKind, Hit, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, SPELLS_FX } from '../config/combat';
import enemiesData from '../data/enemies.json';
import progression from '../data/progression.json';
import { EnemyBase, FB, burst, hexColor, inLuzRadius, inSolLine, planeDist, powerScale, purifyFx, rand, randRange, solDamage, solKnockback, spellParam , hitPlayer } from './EnemyBase';

/**
 * Chaneque (NIVELES §4, GDD §9). Pequeño, rápido, en grupos de 3–6, con travesuras.
 * Variantes: patrulla (rodea y se acomoda en la profundidad), saltador (salta en z hacia el jugador),
 * travieso (roba distancia, empuja, se ríe, huye y vuelve).
 * Al llegar a 0 de vida queda AGOTADO; se purifica con CALMA o PROTECCION. Nada de sangre.
 */

const C = enemiesData.chaneque;
type St =
  | 'idle'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'recover'
  | 'jumpWindup'
  | 'jump'
  | 'flee'
  | 'hurt'
  | 'dizzy'
  | 'calm'
  | 'exhausted'
  | 'purifying'
  | 'leaving';

export class Chaneque extends EnemyBase {
  kind: EnemyKind = 'chaneque';
  readonly variant: ChanequeVariant;
  private st: St = 'idle';
  private stT = 0;
  private cooldown = rand(0.4, 1.2);
  private jumpCd = 0;
  private active = false;
  private hitDone = false;
  private homeX: number;
  private homeY: number;
  private wanderT = 0;
  private wanderTo: { x: number; y: number } | null = null;
  private lane = 0;
  private sideBias: 1 | -1;
  private jumpFrom = { x: 0, y: 0 };
  private jumpTo = { x: 0, y: 0 };
  private marker: Phaser.GameObjects.Ellipse | null = null;
  private alert: Phaser.GameObjects.Text | null = null;
  private walkPhase = Math.random() * 10;
  private calmFxT = 0;
  private laughT = 0;

  constructor(world: WorldApi, x: number, y: number, variant: ChanequeVariant = 'patrulla', group?: string) {
    super(world, x, y, {
      hp: C.hp,
      radius: C.radius,
      height: C.height,
      ecos: progression.ecos.chaneque,
      feetY: C.frame.feetY,
      frameH: C.frame.h,
      fallbackTex: FB.chaneque,
      textureKey: 'chaneque_reposo',
      shadowW: 22,
      kitId: 'chaneque',
    });
    this.variant = variant;
    this.group = group;
    this.homeX = x;
    this.homeY = y;
    this.sideBias = this.uid % 2 ? 1 : -1;
    this.lane = ((this.uid % 3) - 1) * 14;
    this.setBaseTint(hexColor(C.variants[variant].tint));
    // Los de un grupo de arena aparecen ya en combate.
    if (group) this.active = true;
    this.play('chaneque_reposo');
    this.render(0);
  }

  /** Está en una acción de ataque (para limitar cuántos atacan a la vez). */
  get isAttacking(): boolean {
    return this.st === 'windup' || this.st === 'attack' || this.st === 'jumpWindup' || this.st === 'jump';
  }

  private set(st: St, t = 0): void {
    this.st = st;
    this.stT = t;
    this.hitDone = false;
    this.showAlert(st === 'windup' || st === 'jumpWindup');
    if (st !== 'jumpWindup' && st !== 'jump') this.clearMarker();
    switch (st) {
      case 'idle':
      case 'calm':
      case 'recover':
        this.play('chaneque_reposo');
        break;
      case 'chase':
      case 'flee':
        this.play('chaneque_caminar');
        break;
      case 'windup':
      case 'attack':
        this.play('chaneque_ataque');
        break;
      case 'jumpWindup':
      case 'jump':
        this.play('chaneque_salto');
        break;
      case 'hurt':
        this.play('chaneque_dano');
        break;
      case 'dizzy':
      case 'exhausted':
        this.play('chaneque_agotado');
        break;
      case 'purifying':
        this.play('chaneque_purificar');
        break;
      case 'leaving':
        this.play('chaneque_caminar');
        break;
    }
  }

  private get speed(): number {
    return C.walkSpeed * C.variants[this.variant].speedMult;
  }

  private attackersNow(): number {
    let n = 0;
    for (const e of this.world.enemies) if (e instanceof Chaneque && e !== this && e.isAttacking) n++;
    return n;
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

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    this.cooldown -= dt;
    this.jumpCd -= dt;
    if (this.stunAcc > 0 && this.st !== 'dizzy') this.stunAcc = Math.max(0, this.stunAcc - C.stunDecay * dt);
    this.stepKnockback(dt);

    if (!this.active && planeDist(this.x, this.y, p.x, p.y) < C.aggroRadius) {
      this.active = true;
      if (this.variant === 'travieso') sfx('chaneque_risa');
    }

    const a = C.attack;
    switch (this.st) {
      case 'idle': {
        if (this.active) {
          this.set('chase');
          break;
        }
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(1.5, 3.5);
          this.wanderTo = Math.random() < 0.6 ? this.world.randomPointNear(this.homeX, this.homeY, 40) : null;
        }
        if (this.wanderTo && this.moveToward(this.wanderTo.x, this.wanderTo.y, this.speed * 0.4, dt) < 3) this.wanderTo = null;
        break;
      }
      case 'chase':
        this.updateChase(dt);
        break;
      case 'windup': {
        this.facePlayer();
        const w = this.variant === 'travieso' ? C.variants.travieso.windup : a.windup;
        // Destello del aviso.
        const blink = Math.floor(this.stT * 14) % 2 === 0;
        if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? 0x705020 : 0x000000);
        if (this.stT >= w) {
          this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
          sfx('chaneque_ataque');
          this.set('attack');
        }
        break;
      }
      case 'attack': {
        // Pequeña embestida hacia delante.
        this.world.moveActor(this, this.facing * 110 * dt, 0);
        if (!this.hitDone) {
          this.hitDone = true;
          const dx = Math.abs(p.x - this.x);
          if (dx < a.range + 8 && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < a.dodgeHeight) {
            const trav = this.variant === 'travieso';
            hitPlayer(this.world, {
              damage: trav ? C.variants.travieso.damage : a.damage,
              stun: 0,
              kind: 'melee',
              sourceX: this.x,
              knockback: trav ? C.variants.travieso.shoveKnockback : a.knockback,
            });
          }
        }
        if (this.stT >= a.active) {
          if (this.variant === 'travieso') {
            sfx('chaneque_risa');
            this.set('flee', 0);
            this.stT = -randRange(C.variants.travieso.fleeSeconds);
          } else this.set('recover');
        }
        break;
      }
      case 'recover':
        if (this.stT >= a.recover) {
          this.cooldown = randRange(a.cooldown);
          this.set('chase');
        }
        break;
      case 'jumpWindup': {
        const v = C.variants.saltador;
        this.facePlayer();
        this.bob = -Math.min(3, this.stT * 8); // se agacha
        this.updateMarker();
        if (this.stT >= v.jumpWindup) {
          this.bob = 0;
          sfx('salto');
          this.set('jump');
          this.jumpFrom = { x: this.x, y: this.y };
        }
        break;
      }
      case 'jump': {
        const v = C.variants.saltador;
        const t = Math.min(1, this.stT / v.jumpTime);
        const tx = this.jumpFrom.x + (this.jumpTo.x - this.jumpFrom.x) * t;
        const ty = this.jumpFrom.y + (this.jumpTo.y - this.jumpFrom.y) * t;
        this.world.moveActor(this, tx - this.x, ty - this.y);
        this.z = 4 * v.jumpPeak * t * (1 - t);
        this.updateMarker();
        if (t >= 1) {
          this.z = 0;
          burst(this.scene, 'dust', this.x, this.y, this.y + FX_DEPTH_BIAS, 8);
          sfx('aterrizar');
          if (planeDist(this.x, this.y, p.x, p.y) < v.landRadius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < 14) {
            hitPlayer(this.world, { damage: v.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: v.knockback });
          }
          this.jumpCd = randRange(v.jumpCooldown);
          this.set('recover');
        }
        break;
      }
      case 'flee': {
        // stT empieza negativo: huye hasta llegar a 0, riéndose.
        const away = Math.sign(this.x - p.x) || this.sideBias;
        this.moveToward(this.x + away * 60, this.y + this.lane * 0.2, this.speed * C.variants.travieso.fleeSpeedMult, dt);
        this.laughT -= dt;
        if (this.laughT <= 0) {
          this.laughT = rand(0.8, 1.4);
          this.bob = 3;
          this.scene.tweens.add({ targets: this, bob: 0, duration: 160 });
        }
        if (this.stT >= 0) {
          this.cooldown = randRange(a.cooldown);
          this.set('chase');
        }
        break;
      }
      case 'hurt':
        if (this.stT >= C.hurtSeconds) this.set('chase');
        break;
      case 'dizzy':
        if (this.stT >= C.dizzySeconds) {
          this.setStars(false);
          this.stunAcc = 0;
          this.set('chase');
        }
        break;
      case 'calm':
        this.calmFxT -= dt;
        if (this.calmFxT <= 0) {
          this.calmFxT = 0.5;
          burst(this.scene, 'calm', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 1);
        }
        if (this.stT >= 0) {
          this.setBaseTint(hexColor(C.variants[this.variant].tint));
          this.set('chase');
        }
        break;
      case 'exhausted':
        if (this.z > 0) this.z = Math.max(0, this.z - 200 * dt);
        if (this.stT >= C.exhaustedSeconds) this.retire();
        break;
      case 'purifying':
      case 'leaving':
        break;
    }

    if (this.st !== 'jump' && this.st !== 'purifying' && this.st !== 'leaving') this.separate(dt, C.separation);

    // Animación por código si no hay arte: pasitos.
    if (!this.hasArt && (this.st === 'chase' || this.st === 'flee')) {
      this.walkPhase += dt * 14;
      this.bob = Math.abs(Math.sin(this.walkPhase)) * 2;
    } else if (!this.hasArt && this.st === 'idle') this.bob = 0;

    this.render(dt);
    this.alert?.setPosition(this.x, this.y - this.z - this.height - 8).setDepth(this.y + FX_DEPTH_BIAS);
  }

  private updateChase(dt: number): void {
    const p = this.world.player;
    const a = C.attack;
    const dxp = p.x - this.x;
    const dyp = p.y - this.y;
    const ready = this.cooldown <= 0 && this.attackersNow() < C.maxAttackers;

    // Saltador: salta desde media distancia.
    if (this.variant === 'saltador' && this.jumpCd <= 0 && ready) {
      const v = C.variants.saltador;
      const d = Math.abs(dxp);
      if (d > v.jumpMinDist && d < v.jumpMaxDist && Math.abs(dyp) < 50) {
        this.jumpTo = { x: p.x, y: p.y };
        this.set('jumpWindup');
        return;
      }
    }

    const side: number = ready ? Math.sign(-dxp) || this.sideBias : this.sideBias;
    if (ready) {
      // Se acomoda en la misma profundidad y se acerca a rango.
      const tx = p.x + side * (a.range * 0.75);
      this.moveToward(tx, p.y, this.speed * (this.variant === 'travieso' ? 1.25 : 1), dt);
      if (Math.abs(dxp) < a.range && Math.abs(dyp) < DEPTH_TOLERANCE * 0.7) {
        this.set('windup');
        return;
      }
    } else {
      // Rodea: espera en un anillo, a su lado preferido y en su carril de profundidad.
      const ring = this.variant === 'patrulla' ? C.variants.patrulla.ringDistance : 56;
      const tx = p.x + this.sideBias * ring;
      const ty = p.y + this.lane;
      const d = this.moveToward(tx, ty, this.speed * 0.8, dt);
      if (d < 4) this.facePlayer();
    }
  }

  private showAlert(on: boolean): void {
    if (on && !this.alert) {
      this.alert = this.scene.add
        .text(this.x, this.y, '!', { fontFamily: 'monospace', fontSize: '12px', color: '#ffe070', stroke: '#3a2000', strokeThickness: 3 })
        .setOrigin(0.5, 1);
      this.scene.tweens.add({ targets: this.alert, scale: { from: 1.6, to: 1 }, duration: 150 });
    } else if (!on && this.alert) {
      this.alert.destroy();
      this.alert = null;
      if (this.flashT <= 0) this.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.baseTint);
    }
  }

  /** Sombra de aviso donde va a caer el saltador. */
  private updateMarker(): void {
    if (!this.marker) {
      this.marker = this.scene.add.ellipse(this.jumpTo.x, this.jumpTo.y, 30, 10, 0xff6040, 0.25).setStrokeStyle(1, 0xffb070, 0.8);
    }
    this.marker.setPosition(this.jumpTo.x, this.jumpTo.y).setDepth(this.jumpTo.y - 1);
    this.marker.setAlpha(0.5 + 0.5 * Math.sin(this.stT * 20));
  }

  private clearMarker(): void {
    this.marker?.destroy();
    this.marker = null;
  }

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'exhausted' || this.st === 'purifying' || this.st === 'leaving') return false;
    this.active = true;
    this.hp -= hit.damage;
    this.stunAcc += hit.stun;
    this.onDamaged(hit, C.knockbackScale);
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    if (this.hp <= 0) {
      this.exhaust();
    } else if (this.stunAcc >= C.stunThreshold && this.st !== 'dizzy') {
      this.z = 0;
      this.set('dizzy');
      this.setStars(true);
      burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 6);
    } else if (hit.damage >= 1 && this.st !== 'jump' && this.st !== 'dizzy') {
      this.set('hurt');
    }
    return true;
  }

  private exhaust(): void {
    this.hp = 0;
    this._exhausted = true;
    this.kbVel *= 0.5;
    this.set('exhausted');
    this.setStars(true);
    this.setBaseTint(0xc8c8c8);
    burst(this.scene, 'stun', this.x, this.y - this.height, this.y + FX_DEPTH_BIAS, 8);
    bus.emit('enemy:exhausted', { enemy: this });
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || ev.outcome === 'fail') return false;
    if (this.st === 'purifying' || this.st === 'leaving') return false;
    const power = Phaser.Math.Clamp(ev.power, 0, 1);
    if (ev.spellId === 'VOZ') {
      const s = SPELLS_FX.VOZ;
      const radius = spellParam('VOZ', 'stunRadius', s.stunRadius) * powerScale(power);
      if (this._exhausted || planeDist(this.x, this.y, ev.x, ev.y) > radius) return false;
      return this.takeHit({ damage: 0, stun: spellParam('VOZ', 'stun', s.stun) * power,
        kind: 'spell', sourceX: ev.x, knockback: spellParam('VOZ', 'knockback', s.knockback) * power });
    }
    if (ev.spellId === 'CALMA') {
      const s = SPELLS_FX.CALMA;
      const d = planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y);
      // CALMA calma PARA SIEMPRE (decisión del equipo, 2026-10-19): todo chaneque en el radio se purifica,
      // esté agotado o no. El aturdimiento del láser es momentáneo; la seña es lo que lo resuelve.
      const r = this._exhausted
        ? Math.max(spellParam('CALMA', 'purifyRadius', s.purifyRadius), spellParam('CALMA', 'calmRadius', s.calmRadius))
        : spellParam('CALMA', 'calmRadius', s.calmRadius);
      if (d > r * powerScale(power)) return false;
      this.z = 0;
      this.purify(ev.outcome === 'perfect');
      return true;
    }
    if (ev.spellId === 'PROTECCION') {
      const s = SPELLS_FX.PROTECCION;
      const d = planeDist(this.x, this.y, ev.x + ev.facing * s.forward, ev.y);
      // PROTECCION también purifica para siempre en su área pequeña; más lejos solo empuja y aturde.
      if (d <= spellParam('PROTECCION', 'purifyRadius', s.purifyRadius) * powerScale(power)) {
        this.z = 0;
        this.purify(ev.outcome === 'perfect');
        return true;
      }
      if (d > s.pushRadius) return false;
      this.takeHit({ damage: 0, stun: s.stun * power, kind: 'spell', sourceX: ev.x, knockback: s.knockback * power });
      return true;
    }
    // Nivel 3. LUZ: ➖ (solo aturde un poco). SOL: daño en línea (puede dejarlo agotado).
    if (ev.spellId === 'LUZ') {
      if (this._exhausted || !inLuzRadius(ev, this.x, this.y)) return false;
      return this.takeHit({ damage: 0, stun: spellParam('LUZ', 'lightStun', SPELLS_FX.LUZ.lightStun) * power, kind: 'spell', sourceX: ev.x, knockback: 4 });
    }
    if (ev.spellId === 'SOL') {
      if (!inSolLine(ev, this.x, this.y, this.radius)) return false;
      return this.takeHit({ damage: solDamage(ev), stun: 0, kind: 'spell', sourceX: ev.x, knockback: solKnockback(ev) });
    }
    return false;
  }

  /** Purificación con conjuro: luz verde, Ecos con bono, regresa a la naturaleza. */
  private purify(perfect: boolean): void {
    this.setStars(false);
    this.set('purifying');
    this.setBaseTint(0xffffff);
    sfx('purificar');
    purifyFx(this.scene, this.x, this.y, 0.8);
    const amount = Math.round(this._ecos * progression.bonus.purificar * (perfect ? progression.bonus.perfecto : 1));
    this.scene.time.delayedCall(C.purifySeconds * 1000, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 16 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect });
      this._purified = true;
      this.scene.tweens.add({
        targets: this.sprite,
        alpha: 0,
        duration: 500,
        onComplete: () => this.leaveWorld(),
      });
      this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 500 });
    });
  }

  /** Nadie lo purificó a tiempo: se va solo y deja los Ecos base, sin bono. */
  private retire(): void {
    this.setStars(false);
    this.set('leaving');
    this._purified = true;
    bus.emit('ecos:gained', { amount: this._ecos, x: this.x, y: this.y - 16 });
    this.setBaseTint(0xffffff);
    const away = this.x < this.world.player.x ? -1 : 1;
    this.facing = away as 1 | -1;
    this.scene.tweens.add({
      targets: this,
      x: this.x + away * 50,
      duration: 900,
    });
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      alpha: 0,
      duration: 900,
      onComplete: () => this.leaveWorld(),
    });
  }

  protected onDestroy(): void {
    this.clearMarker();
    this.alert?.destroy();
    this.alert = null;
  }
}
