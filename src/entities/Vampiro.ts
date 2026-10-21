import Phaser from 'phaser';
import type { EnemyKind, Hit, LaserMode, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { DEPTH_TOLERANCE } from '../config/game';
import { FX_DEPTH_BIAS, JUICE } from '../config/combat';
import enemiesData from '../data/enemies.json';
import { hideBossBar, showBossBar, updateBossBar } from '../scenes/HudScene';
import { laserTargets, type LaserTarget } from './LaserShot';
import {
  EnemyBase, FB, burst, fxN, hexColor, hitPlayer, inDescansoRadius, inLuzRadius, inSolLine, planeDist, purifyFx, rand,
  randRange, reduceFx, smokeFx,
} from './EnemyBase';
import { holdPlayer, releaseHold, updateHold } from './Atadura';

/**
 * El Vampiro del Panteón de Belén (minijefe de la versión extendida, Catedral de Guadalajara antes de la emboscada).
 * Cuadro 96×112, pivote (48, 110), ~96 px de alto, kit 'vampiro'. PLACEHOLDER SIMPLE (AGENTS §8.0) si no hay kit:
 * forma humana (hombre alto de traje antiguo y capa) y forma bestial (encorvado, capa como alas, garras).
 * - Dormido en forma humana; al acercarse el jugador (< transformRadius) o al recibir un golpe SE TRANSFORMA
 *   (niebla y murciélagos), aparece la barra de minijefe y emite 'boss:phase' {1}.
 * - ZARPAZOS rápidos (combo de 3 con embestida) · MURCIÉLAGOS que persiguen (el láser los derriba; LUZ y SOL los
 *   dispersan) · RAÍCES del árbol que brotan bajo el jugador y lo ATRAPAN un instante · se vuelve NIEBLA
 *   (intocable), cruza la arena y REAPARECE por la espalda con un zarpazo anunciado.
 * - Sello (barra): SOL ✅ (siempre, con bono) y LUZ ✅ (lo aturde: ventana; también lo saca de la niebla), y el
 *   láser lo desgasta. CALMA ❌: lo cura un poco y lo enfurece. FUEGO, VERDAD, VOZ, PROTECCION, MEMORIA ➖.
 * - Lleno el sello queda AGOTADO (vuelve a su forma humana, de rodillas): solo DESCANSO lo LIBERA. Victoria sin
 *   violencia: se deshace en niebla y murciélagos que se van volando. 'boss:calmed', 'enemy:purified', Ecos.
 * Eventos: 'boss:phase' {1|2}, 'boss:vulnerable' {on}, 'boss:calmed', 'enemy:exhausted', 'enemy:purified',
 * 'enemy:hit', 'ecos:gained', 'hud:toast', 'enemy:removed'.
 */

const V = enemiesData.vampiro;
const TEX_H = '__cb_vampiro_humano';
const TEX_B = '__cb_vampiro_bestia';
const TEX_BAT = '__cb_murcielago';

type St =
  | 'dormant' | 'transform' | 'idle' | 'clawsWindup' | 'claws' | 'batsWindup' | 'rootsWindup'
  | 'mistOut' | 'mist' | 'ambushWindup' | 'vulnerable' | 'exhausted' | 'calmed';

function ensureVampiroTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_H)) return;
  const c = V.colors;
  const g = scene.make.graphics({}, false);
  const suit = hexColor(c.suit);
  const suitL = hexColor(c.suitLight);
  const cape = hexColor(c.cape);
  const lining = hexColor(c.capeLining);
  const skin = hexColor(c.skin);
  const hair = hexColor(c.hair);
  const eyes = hexColor(c.eyes);
  // --- Forma humana: hombre alto, levita antigua, capa de cuello alto. Mira a la derecha. ---
  g.fillStyle(cape, 1).fillTriangle(30, 34, 58, 34, 26, 106); // capa detrás
  g.fillStyle(suit, 1).fillRect(41, 78, 6, 31).fillRect(50, 78, 6, 31); // piernas
  g.fillStyle(0x0a080a, 1).fillRect(40, 107, 8, 3).fillRect(49, 107, 9, 3); // botas
  g.fillStyle(suit, 1).fillRoundedRect(37, 34, 24, 48, 4); // levita
  g.fillStyle(suitL, 1).fillRect(39, 36, 5, 44).fillTriangle(45, 36, 53, 36, 49, 56); // solapa y chaleco
  g.fillStyle(0xe8e0d8, 1).fillTriangle(46, 35, 52, 35, 49, 44); // camisa
  g.fillStyle(lining, 1).fillRect(48, 44, 2, 6); // corbatín
  g.fillStyle(suit, 1).fillRect(55, 40, 6, 30); // brazo
  g.fillStyle(skin, 1).fillRect(55, 69, 6, 5); // mano
  g.fillStyle(lining, 1).fillTriangle(34, 22, 40, 36, 32, 36).fillTriangle(62, 22, 58, 36, 64, 36); // cuello alto
  g.fillStyle(skin, 1).fillRoundedRect(42, 16, 13, 17, 4); // cara
  g.fillStyle(hair, 1).fillRect(41, 12, 15, 6).fillTriangle(41, 18, 46, 18, 43, 25); // pelo y pico
  g.fillStyle(eyes, 1).fillRect(51, 22, 2, 2);
  g.fillStyle(0x6a1020, 1).fillRect(50, 29, 4, 1);
  g.generateTexture(TEX_H, V.frame.w, V.frame.h);
  g.clear();
  // --- Forma bestial: encorvado, capa abierta como alas, orejas puntiagudas y garras. ---
  g.fillStyle(cape, 1).fillTriangle(8, 30, 46, 40, 20, 96).fillTriangle(88, 30, 50, 40, 78, 96); // alas-capa
  g.fillStyle(lining, 1).fillTriangle(14, 36, 44, 44, 24, 88).fillTriangle(82, 36, 52, 44, 72, 88);
  g.fillStyle(suit, 1).fillRect(38, 80, 7, 29).fillRect(52, 80, 7, 29);
  g.fillStyle(0x0a080a, 1).fillRect(36, 107, 10, 3).fillRect(51, 107, 11, 3);
  g.fillStyle(suit, 1).fillRoundedRect(34, 42, 30, 42, 8); // torso encorvado
  g.fillStyle(suitL, 1).fillRect(40, 46, 18, 30);
  g.fillStyle(suit, 1).fillRect(60, 48, 8, 24); // brazo
  g.fillStyle(skin, 1).fillRect(62, 71, 8, 6);
  g.fillStyle(0xf0e8f0, 1).fillTriangle(70, 72, 76, 74, 70, 74).fillTriangle(70, 75, 76, 78, 70, 77); // garras
  g.fillStyle(0x9a90a0, 1).fillRoundedRect(46, 24, 16, 18, 5); // cabeza grisácea
  g.fillStyle(0x9a90a0, 1).fillTriangle(46, 28, 44, 14, 51, 25).fillTriangle(62, 28, 64, 14, 57, 25); // orejas
  g.fillStyle(eyes, 1).fillRect(55, 30, 3, 2).fillRect(49, 30, 2, 2);
  g.fillStyle(0xffffff, 1).fillRect(55, 37, 1, 3).fillRect(58, 37, 1, 3); // colmillos
  g.generateTexture(TEX_B, V.frame.w, V.frame.h);
  g.clear();
  // --- Murciélago 14×8 ---
  g.fillStyle(hexColor(c.bat), 1).fillTriangle(0, 1, 6, 4, 2, 7).fillTriangle(14, 1, 8, 4, 12, 7).fillEllipse(7, 4, 5, 6);
  g.fillStyle(hexColor(c.batEye), 1).fillRect(6, 3, 1, 1).fillRect(8, 3, 1, 1);
  g.generateTexture(TEX_BAT, 14, 8);
  g.destroy();
}

interface Bat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  img: Phaser.GameObjects.Image;
  target: LaserTarget;
}

interface Root {
  x: number;
  y: number;
  /** < 0: aviso; 0..riseTime: brota; después se retira. */
  t: number;
  hitDone: boolean;
  gfx: Phaser.GameObjects.Graphics;
}

export class Vampiro extends EnemyBase {
  kind: EnemyKind = 'vampiro';
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
  private clawsLeft = 0;
  private bats: Bat[] = [];
  private batsPending = 0;
  private batSpawnT = 0;
  private roots: Root[] = [];
  private mistFrom = { x: 0, y: 0 };
  private mistTo = { x: 0, y: 0 };
  private bestial = false;
  private eye: Phaser.GameObjects.Image;
  private mistCloud: Phaser.GameObjects.Image;
  private told = { calma: false, descanso: false, exhausted: false, luz: false, laser: false };

  constructor(world: WorldApi, x: number, y: number, group?: string) {
    ensureVampiroTextures(world.scene);
    super(world, x, y, {
      hp: 100,
      radius: V.radius,
      height: V.height,
      ecos: V.ecos,
      feetY: V.frame.feetY,
      frameH: V.frame.h,
      fallbackTex: TEX_H,
      textureKey: 'vampiro_reposo',
      shadowW: V.shadowW,
      kitId: 'vampiro',
    });
    this.group = group;
    this.homeX = x;
    this.facing = world.player.x >= x ? 1 : -1;
    this.eye = this.scene.add.image(x, y, FB.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(V.colors.eyes)).setScale(0.18).setAlpha(0.4);
    this.mistCloud = this.scene.add.image(x, y, FB.glow).setTint(hexColor(V.colors.mist)).setAlpha(0);
    this.play('vampiro_reposo');
    this.render(0);
    this.placeFx();
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
      dormant: 'reposo', transform: 'invocar', idle: 'caminar', clawsWindup: 'golpe', claws: 'ataque', batsWindup: 'invocar',
      rootsWindup: 'conjuro', mistOut: 'esquivar', mist: 'reposo', ambushWindup: 'golpe', vulnerable: 'aturdido',
      exhausted: 'agotado', calmed: 'morir',
    };
    this.play(`vampiro_${anim[st]}`);
  }

  /** Cambia el placeholder entre forma humana y bestial (con kit solo cambia el tinte). */
  private setBestial(on: boolean): void {
    this.bestial = on;
    if (!this.kit) {
      this.fallbackTex = on ? TEX_B : TEX_H;
      if (!this.hasArt) this.sprite.setTexture(this.fallbackTex);
    }
    this.setBaseTint(on && this.kit ? 0xd8c0d0 : 0xffffff);
  }

  private pushHud(): void {
    updateBossBar(1 - this.seal / V.seal.total, this.seal, V.seal.total, this.st === 'vulnerable' || this.st === 'exhausted');
  }

  private activate(): void {
    if (this.st !== 'dormant') return;
    this.set('transform');
    this.facePlayer();
    sfx('vampiro_transforma');
    showBossBar(V.name);
    this.pushHud();
    bus.emit('boss:phase', { phase: 1 });
    this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
    bus.emit('hud:toast', { text: 'El caballero se transforma… ¡SOL y LUZ lo debilitan!', ms: 3000 });
    // Sale una nube de murciélagos (solo visual).
    this.fleeBats(fxN(10), false);
  }

  /* ------------------------------ Actualizar ------------------------------ */

  update(dt: number): void {
    if (!this._alive) return;
    const p = this.world.player;
    this.stT += dt;
    if (this.rageT > 0) this.rageT -= dt;
    this.stepKnockback(dt);
    updateHold(this, dt);

    switch (this.st) {
      case 'dormant':
        this.facePlayer();
        if (planeDist(this.x, this.y, p.x, p.y) < V.transformRadius) this.activate();
        break;
      case 'transform': {
        this.facePlayer();
        const k = Math.min(1, this.stT / V.transformSeconds);
        if (!reduceFx() && Math.random() < dt * 30) burst(this.scene, 'mist', this.x + rand(-20, 20), this.y - rand(10, 90), this.y + FX_DEPTH_BIAS, 1);
        // Tiembla y a la mitad cambia de forma.
        this.bob = reduceFx() ? 0 : Math.sin(this.stT * 50) * (1 - k);
        if (!this.bestial && k >= 0.5) {
          this.setBestial(true);
          smokeFx(this.scene, this.x, this.y, 1.3);
          this.world.flash(0x8a1a30, 160);
        }
        if (k >= 1) {
          this.bob = 0;
          this.toIdle();
        }
        break;
      }
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'clawsWindup':
      case 'ambushWindup': {
        this.facePlayer();
        this.telegraph(0x601020);
        const w = this.st === 'ambushWindup' ? V.mist.ambushWindup : V.claws.windup * this.haste;
        if (this.stT >= w) {
          this.clawsLeft = V.claws.hits;
          this.set('claws');
        }
        break;
      }
      case 'claws':
        this.updateClaws(dt);
        break;
      case 'batsWindup':
        this.facePlayer();
        this.telegraph(0x401020);
        if (Math.random() < dt * 20) burst(this.scene, 'mist', this.x + rand(-24, 24), this.y - rand(40, 90), this.y + FX_DEPTH_BIAS, 1);
        if (this.stT >= V.bats.windup * this.haste) {
          const extra = this.phase === 2 ? V.phase2.batsExtra : 0;
          this.batsPending = Math.min(V.bats.max - this.bats.length, Phaser.Math.Between(V.bats.count[0], V.bats.count[1]) + extra);
          this.batSpawnT = 0;
          sfx('vampiro_murcielagos');
          this.toIdle();
        }
        break;
      case 'rootsWindup':
        this.facePlayer();
        this.telegraph(0x302010);
        if (this.stT >= V.roots.windup * this.haste) {
          this.spawnRoots();
          this.toIdle();
        }
        break;
      case 'mistOut': {
        const k = Math.min(1, this.stT / V.mist.windup);
        this.sprite.setAlpha(1 - k);
        if (Math.random() < dt * 30) burst(this.scene, 'mist', this.x + rand(-14, 14), this.y - rand(10, 80), this.y + FX_DEPTH_BIAS, 1);
        if (k >= 1) this.startMist();
        break;
      }
      case 'mist':
        this.updateMist(dt);
        break;
      case 'vulnerable':
        // Aturdido, pero sin darle la espalda al jugador (kit por cuadros).
        this.facePlayer();
        this.vulnerableLeft -= dt;
        if (Math.random() < dt * 5) burst(this.scene, 'mist', this.x + rand(-10, 10), this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, 1);
        if (this.vulnerableLeft <= 0) this.endVulnerable();
        break;
      case 'exhausted':
        this.facePlayer();
        if (Math.random() < dt * 3) burst(this.scene, 'mist', this.x + rand(-8, 8), this.y - 30, this.y + FX_DEPTH_BIAS, 1);
        break;
      case 'calmed':
        break;
    }

    this.updateBatSpawns(dt);
    this.updateBats(dt);
    this.updateRoots(dt);
    if (this.st !== 'dormant' && this.st !== 'calmed') this.pushHud();
    // Niebla que se arrastra a sus pies; densa al lanzarse con los zarpazos.
    const awake = this.st !== 'dormant' && this.st !== 'calmed' && this.st !== 'mist';
    this.setAura(this.rageT > 0 ? 0xff3050 : 0x8a1a30, awake ? (this.st === 'exhausted' ? 0.08 : 0.18) : 0, { w: 90, h: 120, dy: 0.5, pulse: 0.3 });
    this.trailFx(dt, awake, 'mist', this.st === 'claws' ? 30 : 4, this.st === 'claws' ? 0.4 : 0.05, 14);
    this.render(dt);
    this.placeFx();
  }

  private get haste(): number {
    let h = this.rageT > 0 ? V.calma.hasteMult : 1;
    if (this.phase === 2) h *= V.phase2.hasteMult;
    return h;
  }

  private facePlayer(): void {
    const dx = this.world.player.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private toIdle(): void {
    this.set('idle');
    this.stT = -randRange(V.idleBetween) * this.haste;
  }

  private telegraph(color: number): void {
    this.warnFx(color);
    if (this.flashT > 0) return;
    const blink = Math.floor(this.stT * 14) % 2 === 0;
    this.sprite.setTintMode(Phaser.TintModes.ADD).setTint(blink ? color : 0x000000);
  }

  private clampArena(x: number, y: number): { x: number; y: number } {
    return {
      x: Phaser.Math.Clamp(x, this.homeX - V.arenaHalfWidth, this.homeX + V.arenaHalfWidth),
      y: Phaser.Math.Clamp(y, V.band[0] + 6, V.band[1] - 6),
    };
  }

  private updateIdle(dt: number): void {
    const p = this.world.player;
    const side = Math.sign(this.x - p.x) || 1;
    const t = this.clampArena(p.x + side * V.keepDistance, p.y);
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const step = Math.min(d, V.moveSpeed * dt * (this.rageT > 0 ? 1.4 : 1));
      this.world.moveActor(this, (dx / d) * step, (dy / d) * step * 0.7);
    }
    this.facePlayer();
    if (this.stT < 0) return;
    this.chooseAttack();
  }

  private chooseAttack(): void {
    const w: Record<string, number> = { ...V.weights };
    const p = this.world.player;
    const close = Math.abs(p.x - this.x) < V.keepDistance + 50 && Math.abs(p.y - this.y) < 40;
    if (!close) w.claws = 0;
    if (this.bats.length + this.batsPending >= V.bats.max) w.bats = 0;
    if (this.roots.length > 0) w.roots = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (total <= 0) {
      this.toIdle();
      return;
    }
    let r = Math.random() * total;
    let pick = 'claws';
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) {
        pick = k;
        break;
      }
    }
    switch (pick) {
      case 'claws':
        sfx('vampiro_sisea');
        this.set('clawsWindup');
        break;
      case 'bats':
        this.set('batsWindup');
        break;
      case 'roots':
        sfx('vampiro_raices');
        this.set('rootsWindup');
        break;
      case 'mist':
        sfx('vampiro_niebla');
        this.set('mistOut');
        break;
    }
  }

  /* ------------------------------ Zarpazos ------------------------------ */

  private updateClaws(dt: number): void {
    const C = V.claws;
    const p = this.world.player;
    const per = C.active + C.gap;
    if (Math.abs(p.x - this.x) > C.range * 0.6 && this.stT % per < C.active) this.world.moveActor(this, this.facing * C.lunge * dt, 0);
    const hitIndex = C.hits - this.clawsLeft;
    if (this.stT >= hitIndex * per && !this.hitDone) {
      this.hitDone = true;
      this.clawFx(hitIndex);
      if (Math.abs(p.x - this.x) < C.range + this.radius && Math.abs(p.y - this.y) < DEPTH_TOLERANCE && p.z < C.dodgeHeight && !p.isDodging) {
        hitPlayer(this.world, { damage: C.damage, stun: 0, kind: 'melee', sourceX: this.x, knockback: C.knockback });
      }
    }
    if (this.stT >= (hitIndex + 1) * per - 1e-6 && this.hitDone) {
      this.clawsLeft--;
      this.hitDone = false;
      if (this.clawsLeft <= 0) {
        this.toIdle();
        this.stT -= C.recover;
      }
    }
  }

  private clawFx(i: number): void {
    const x = this.x + this.facing * 26;
    const y = this.y - 50 + (i % 2) * 8;
    const g = this.scene.add.graphics().setDepth(this.y + FX_DEPTH_BIAS).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(2, 0xff6080, 0.9);
    for (let k = 0; k < 3; k++) {
      const oy = (k - 1) * 6;
      const dir = i % 2 ? -1 : 1;
      g.beginPath();
      g.moveTo(x - this.facing * 12, y + oy - 8 * dir);
      g.lineTo(x, y + oy);
      g.lineTo(x + this.facing * 12, y + oy + 6 * dir);
      g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    sfx('vampiro_zarpazo');
  }

  /* ------------------------------ Murciélagos ------------------------------ */

  private updateBatSpawns(dt: number): void {
    if (this.batsPending <= 0) return;
    this.batSpawnT -= dt;
    if (this.batSpawnT > 0) return;
    this.batSpawnT = V.bats.gap;
    this.batsPending--;
    const B = V.bats;
    const a = rand(-0.9, 0.9) + (this.facing > 0 ? 0 : Math.PI);
    const bx = this.x + rand(-10, 10);
    const by = this.y + rand(-6, 6);
    const img = this.scene.add.image(bx, by - B.z, TEX_BAT).setDepth(by);
    const bat: Bat = {
      x: bx, y: by, vx: Math.cos(a) * B.speed, vy: Math.sin(a) * B.speed * 0.5, life: B.lifeSeconds, img,
      target: { x: bx, y: by, radius: 7, z: B.z - 10, height: 22, onHit: (_m: LaserMode) => this.killBat(bat) },
    };
    laserTargets.add(bat.target);
    this.bats.push(bat);
    burst(this.scene, 'mist', bx, by - B.z, by + FX_DEPTH_BIAS, 2);
  }

  /** Derribado por el láser: se deshace en humo (absorbe el disparo). */
  private killBat(b: Bat): boolean {
    const i = this.bats.indexOf(b);
    if (i < 0) return false;
    burst(this.scene, 'smoke', b.x, b.y - V.bats.z, b.y + FX_DEPTH_BIAS, 3);
    this.removeBat(i);
    return true;
  }

  private removeBat(i: number): void {
    const b = this.bats[i];
    laserTargets.delete(b.target);
    b.img.destroy();
    this.bats.splice(i, 1);
  }

  private updateBats(dt: number): void {
    const B = V.bats;
    const p = this.world.player;
    const t = this.scene.time.now / 1000;
    for (let i = this.bats.length - 1; i >= 0; i--) {
      const b = this.bats[i];
      b.life -= dt;
      const want = Math.atan2((p.y - b.y) * 2, p.x - b.x);
      const cur = Math.atan2(b.vy * 2, b.vx);
      const diff = Phaser.Math.Angle.Wrap(want - cur);
      const na = cur + Phaser.Math.Clamp(diff, -B.turn * dt, B.turn * dt);
      b.vx = Math.cos(na) * B.speed;
      b.vy = Math.sin(na) * B.speed * 0.5;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.target.x = b.x;
      b.target.y = b.y;
      const flap = Math.sin(t * 28 + i);
      b.img.setPosition(Math.round(b.x), Math.round(b.y - B.z + Math.sin(t * 7 + i) * 2)).setDepth(b.y).setScale(1, 0.5 + 0.5 * Math.abs(flap)).setFlipX(b.vx < 0);
      if (b.life < 0.5) b.img.setAlpha(Math.max(0, b.life / 0.5));
      let gone = b.life <= 0;
      if (!gone && planeDist(b.x, b.y, p.x, p.y) < B.hitRadius + p.radius * 0.5 && p.z < B.z + 8 && !p.isDodging) {
        hitPlayer(this.world, { damage: B.damage, stun: 0, kind: 'projectile', sourceX: b.x, knockback: B.knockback });
        burst(this.scene, 'mist', b.x, b.y - B.z, b.y + FX_DEPTH_BIAS, 4);
        gone = true;
      }
      if (gone) this.removeBat(i);
    }
  }

  private clearBats(near?: { x: number; y: number; r: number }): number {
    let n = 0;
    for (let i = this.bats.length - 1; i >= 0; i--) {
      const b = this.bats[i];
      if (near && planeDist(b.x, b.y, near.x, near.y) > near.r) continue;
      burst(this.scene, 'light', b.x, b.y - V.bats.z, b.y + FX_DEPTH_BIAS, 3);
      this.removeBat(i);
      n++;
    }
    if (!near) this.batsPending = 0;
    return n;
  }

  /** Murciélagos que huyen volando (solo visual: transformación y victoria). */
  private fleeBats(n: number, up: boolean): void {
    for (let i = 0; i < n; i++) {
      const img = this.scene.add.image(this.x + rand(-12, 12), this.y - rand(30, 80), TEX_BAT).setDepth(this.y + FX_DEPTH_BIAS);
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.scene.tweens.add({
        targets: img,
        x: img.x + dir * rand(80, 220),
        y: img.y - (up ? rand(120, 220) : rand(20, 90)),
        scaleY: { from: 1, to: 0.4 },
        alpha: { from: 1, to: 0 },
        delay: i * 40,
        duration: rand(700, 1300),
        ease: 'Sine.easeOut',
        onComplete: () => img.destroy(),
      });
      img.setFlipX(dir < 0);
    }
  }

  /* ------------------------------ Raíces ------------------------------ */

  private spawnRoots(): void {
    const R = V.roots;
    const p = this.world.player;
    for (let i = 0; i < R.count; i++) {
      const pt = this.clampArena(i === 0 ? p.x : p.x + rand(-R.spread, R.spread), i === 0 ? p.y : p.y + rand(-R.spread, R.spread) * 0.4);
      this.roots.push({ x: pt.x, y: pt.y, t: -R.warnTime - i * 0.1, hitDone: false, gfx: this.scene.add.graphics() });
    }
  }

  private updateRoots(dt: number): void {
    const R = V.roots;
    const p = this.world.player;
    const col = hexColor(V.colors.root);
    for (let i = this.roots.length - 1; i >= 0; i--) {
      const r = this.roots[i];
      r.t += dt;
      const g = r.gfx.clear().setDepth(r.y);
      if (r.t < 0) {
        // Aviso: grietas en la tierra que parpadean.
        const a = Math.floor(r.t * 14) % 2 === 0 ? 0.8 : 0.35;
        g.lineStyle(1, 0xff6040, a).strokeEllipse(r.x, r.y, R.radius * 2, R.radius);
        g.lineStyle(1, col, a);
        for (let k = 0; k < 4; k++) g.lineBetween(r.x, r.y, r.x + Math.cos(k * 1.6) * R.radius, r.y + Math.sin(k * 1.6) * R.radius * 0.5);
        if (Math.random() < dt * 10) burst(this.scene, 'dust', r.x + rand(-8, 8), r.y, r.y + FX_DEPTH_BIAS, 1);
        continue;
      }
      if (r.t - dt < 0) sfx('vampiro_raiz');
      const k = Math.min(1, r.t / (R.riseTime * 0.4));
      const fade = r.t > R.riseTime ? Math.max(0, 1 - (r.t - R.riseTime) / 0.5) : 1;
      // Raíces retorcidas que brotan.
      for (let s = -2; s <= 2; s++) {
        const h = (22 + (2 - Math.abs(s)) * 10) * k;
        g.lineStyle(3 - Math.abs(s) * 0.5, col, fade);
        g.beginPath();
        g.moveTo(r.x + s * 6, r.y);
        g.lineTo(r.x + s * 4 + Math.sin(s + r.t * 4) * 3, r.y - h * 0.5);
        g.lineTo(r.x + s * 2, r.y - h);
        g.strokePath();
      }
      if (!r.hitDone && r.t <= R.riseTime && planeDist(r.x, r.y, p.x, p.y) < R.radius + p.radius * 0.5 && p.z <= R.maxPlayerZ && !p.isDodging) {
        r.hitDone = true;
        if (hitPlayer(this.world, { damage: R.damage, stun: 0, kind: 'shockwave', sourceX: r.x, knockback: R.knockback })) {
          holdPlayer(this.world, this, 'raices', R.holdSeconds);
        }
      }
      if (fade <= 0) {
        r.gfx.destroy();
        this.roots.splice(i, 1);
      }
    }
  }

  private clearRoots(): void {
    this.roots.forEach((r) => r.gfx.destroy());
    this.roots = [];
  }

  /* ------------------------------ Niebla ------------------------------ */

  private startMist(): void {
    this.set('mist');
    this.height = 0; // intocable: el láser pasa de largo
    this.sprite.setAlpha(0);
    this.shadow.setVisible(false);
    const p = this.world.player;
    this.mistFrom = { x: this.x, y: this.y };
    // Reaparece por la espalda del jugador.
    this.mistTo = this.clampArena(p.x - p.facing * V.mist.behindDist, p.y + rand(-6, 6));
  }

  private updateMist(dt: number): void {
    const k = Math.min(1, this.stT / V.mist.travelSeconds);
    const e = k * k * (3 - 2 * k);
    const tx = this.mistFrom.x + (this.mistTo.x - this.mistFrom.x) * e;
    const ty = this.mistFrom.y + (this.mistTo.y - this.mistFrom.y) * e;
    this.world.moveActor(this, tx - this.x, ty - this.y);
    if (Math.random() < dt * (reduceFx() ? 8 : 26)) burst(this.scene, 'mist', this.x + rand(-12, 12), this.y - rand(4, 40), this.y + FX_DEPTH_BIAS, 1);
    if (k >= 1) this.reappear(false);
  }

  /** Sale de la niebla: normal (ataca de inmediato) o forzado por LUZ / SOL (queda aturdido). */
  private reappear(forced: boolean): void {
    this.height = V.height;
    this.shadow.setVisible(true);
    this.sprite.setAlpha(1);
    smokeFx(this.scene, this.x, this.y, 1);
    burst(this.scene, 'mist', this.x, this.y - 40, this.y + FX_DEPTH_BIAS, fxN(12));
    this.facePlayer();
    if (forced) return;
    sfx('vampiro_sisea');
    this.set('ambushWindup');
  }

  /* -------------------------- Vulnerabilidad -------------------------- */

  private startVulnerable(seconds: number): void {
    if (this.st === 'mist' || this.st === 'mistOut') this.reappear(true);
    this.set('vulnerable');
    this.vulnerableLeft = seconds;
    bus.emit('boss:vulnerable', { on: true });
    this.pushHud();
  }

  private endVulnerable(): void {
    if (this.st === 'vulnerable') bus.emit('boss:vulnerable', { on: false });
    this.toIdle();
  }

  private addSeal(n: number, perfect: boolean): void {
    this.lastPerfect = perfect;
    this.seal = Math.min(V.seal.total, this.seal + n);
    this.flashT = JUICE.flashMs / 1000;
    this.world.hitstop(JUICE.hitstopMs.spell);
    this.world.shake(JUICE.shake.red.intensity, JUICE.shake.red.ms);
    burst(this.scene, 'light', this.x, this.y - this.height * 0.6, this.y + FX_DEPTH_BIAS, fxN(14));
    if (this.seal >= V.seal.total) {
      this.exhaust();
      return;
    }
    if (this.phase === 1 && this.seal >= V.phase2At) {
      this.phase = 2;
      bus.emit('boss:phase', { phase: 2 });
      sfx('vampiro_sisea');
      this.world.shake(JUICE.shake.bossPhase.intensity, JUICE.shake.bossPhase.ms);
      bus.emit('hud:toast', { text: '¡El Vampiro se enfurece! Más murciélagos', ms: 2600 });
    }
    this.pushHud();
  }

  /* ------------------------------ Golpes ------------------------------ */

  takeHit(hit: Hit): boolean {
    if (!this._alive || this.st === 'calmed' || this.st === 'exhausted' || this.st === 'mist') return false;
    if (this.st === 'dormant') {
      this.activate();
      return true;
    }
    if (this.st === 'transform') return false;
    this.flashT = JUICE.flashMs / 1000;
    const kind = hit.kind === 'laser-green' ? 'green' : hit.kind === 'laser-red' ? 'red' : 'spell';
    bus.emit('enemy:hit', { enemy: this, kind });
    const L = V.laser;
    const mult = this.st === 'vulnerable' ? L.windowMult : 1;
    this.chip += (hit.damage * L.chipPerDamage + hit.stun * L.chipPerStun) * mult;
    if (!this.told.laser && hit.kind === 'laser-red' && this.st !== 'vulnerable') {
      this.told.laser = true;
      bus.emit('hud:toast', { text: 'El láser apenas lo roza: SOL y LUZ lo queman de verdad', ms: 2800 });
    }
    if (this.chip >= L.sealAt) {
      this.chip = 0;
      const was = this.st === 'vulnerable';
      this.addSeal(1, false);
      if (!was && this._alive && !this._exhausted) this.startVulnerable(L.staggerSeconds);
    }
    return true;
  }

  applySpell(ev: SpellOutcomeEvent): boolean {
    if (!this._alive || this.st === 'calmed' || ev.outcome === 'fail') return false;
    const near = planeDist(this.x, this.y, ev.x, ev.y) <= V.spellRange;
    if (this.st === 'dormant') {
      if (near) this.activate();
      return false;
    }
    if (this.st === 'transform') return false;
    const perfect = ev.outcome === 'perfect';
    const gain = perfect ? V.seal.perfect : V.seal.partial;
    switch (ev.spellId) {
      case 'SOL': {
        // ✅ La luz del sol es su debilidad clásica: sello con bono, lo saca de la niebla y dispersa murciélagos.
        if (this.st === 'exhausted') return false;
        const ln = this.clearBatsInSol(ev);
        if (!inSolLine(ev, this.x, this.y, this.radius + 16)) return ln > 0;
        this.addSeal(gain + V.seal.solBonus, perfect);
        if (this._alive && !this._exhausted && this.st !== 'vulnerable') this.startVulnerable(V.luz.stunSeconds * 0.6);
        return true;
      }
      case 'LUZ': {
        // ✅ Lo ciega: ventana de vulnerabilidad + sello; dispersa murciélagos cercanos.
        if (this.st === 'exhausted') return false;
        this.clearBats({ x: ev.x, y: ev.y, r: 150 });
        if (!inLuzRadius(ev, this.x, this.y, 'stunRadius', this.radius + 40)) return false;
        this.addSeal(gain, perfect);
        if (this._alive && !this._exhausted && this.st !== 'vulnerable') {
          this.startVulnerable(V.luz.stunSeconds * (0.6 + 0.4 * ev.power));
          this.setStars(true, 0xfff4c0);
          this.scene.time.delayedCall(1200, () => this.setStars(false));
        }
        if (!this.told.luz) {
          this.told.luz = true;
          bus.emit('hud:toast', { text: '¡La luz lo ciega! Aprovecha: SOL, LUZ y el láser', ms: 2600 });
        }
        return true;
      }
      case 'CALMA': {
        // ❌ No es un alma confundida: es hambre. Se cura un poco y se enfurece.
        if (!near || this.st === 'exhausted') return false;
        this.seal = Math.max(0, this.seal - V.calma.heal);
        this.rageT = V.calma.rageSeconds;
        sfx('vampiro_sisea');
        this.world.flash(0x8a1a30, 140);
        if (!this.told.calma) {
          this.told.calma = true;
          bus.emit('hud:toast', { text: '¡La CALMA lo alimenta! No sirve contra el Vampiro', ms: 3000 });
        }
        if (this.st === 'vulnerable') this.endVulnerable();
        this.pushHud();
        return false;
      }
      case 'DESCANSO': {
        if (this.st === 'exhausted' && inDescansoRadius(ev, this.x, this.y, this.radius + 40)) {
          this.calm(perfect);
          return true;
        }
        if (near && !this.told.descanso) {
          this.told.descanso = true;
          bus.emit('hud:toast', { text: 'Aún no descansa: primero debilítalo con SOL y LUZ', ms: 2800 });
        }
        return false;
      }
    }
    return false; // FUEGO, VERDAD, VOZ, PROTECCION, MEMORIA, ECOS ➖
  }

  private clearBatsInSol(ev: SpellOutcomeEvent): number {
    let n = 0;
    for (let i = this.bats.length - 1; i >= 0; i--) {
      const b = this.bats[i];
      if (!inSolLine(ev, b.x, b.y, 10)) continue;
      burst(this.scene, 'sun', b.x, b.y - V.bats.z, b.y + FX_DEPTH_BIAS, 3);
      this.removeBat(i);
      n++;
    }
    return n;
  }

  /** AGOTADO: vuelve a su forma humana, de rodillas; solo DESCANSO lo libera. */
  private exhaust(): void {
    this.clearBats();
    this.clearRoots();
    releaseHold(this);
    this.rageT = 0;
    if (this.st === 'mist' || this.st === 'mistOut') this.reappear(true);
    this.setBestial(false);
    this.set('exhausted');
    this._exhausted = true;
    this.hp = 0;
    this.z = 0;
    this.setStars(true, 0xd0c0ff);
    bus.emit('boss:vulnerable', { on: true });
    bus.emit('enemy:exhausted', { enemy: this });
    sfx('vampiro_agotado');
    smokeFx(this.scene, this.x, this.y, 1.2);
    if (!this.told.exhausted) {
      this.told.exhausted = true;
      bus.emit('hud:toast', { text: 'Está agotado… dale DESCANSO (Q) para liberarlo', ms: 3600 });
    }
    if (!this.kit) this.sprite.setScale(1, 0.86);
    this.pushHud();
  }

  /* ------------------------------ Liberado ------------------------------ */

  /** Victoria sin violencia: se deshace en niebla y murciélagos que se van volando. */
  private calm(perfect: boolean): void {
    this.setStars(false);
    bus.emit('boss:vulnerable', { on: false });
    this.set('calmed');
    sfx('vampiro_liberar');
    this.world.flash(0xe8e0ff, 300);
    this.world.hitstop(JUICE.hitstopMs.bossPhase);
    updateBossBar(0, V.seal.total, V.seal.total, false);
    bus.emit('boss:calmed', {});
    purifyFx(this.scene, this.x, this.y, 1.3);
    this.fleeBats(fxN(16), true);
    for (let i = 0; i < 8; i++) {
      this.scene.time.delayedCall(i * 110, () => {
        if (!this.sprite.active) return;
        burst(this.scene, 'mist', this.x + rand(-16, 16), this.y - rand(10, 90), this.y + FX_DEPTH_BIAS, fxN(5));
      });
    }
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 300, duration: 1300 });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, delay: 300, duration: 1300 });
    const amount = Math.round(this._ecos * (perfect || this.lastPerfect ? V.perfectBonus : 1));
    this.scene.time.delayedCall(1800, () => {
      if (!this._alive) return;
      bus.emit('ecos:gained', { amount, x: this.x, y: this.y - 50 });
      bus.emit('enemy:purified', { enemy: this, ecos: amount, perfect: perfect || this.lastPerfect });
      hideBossBar();
      // Queda una lucecita pálida donde estaba (su alma ya descansa).
      const glow = this.scene.add.image(this.x, this.y - 30, FB.glow).setTint(hexColor(V.colors.freed)).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.y).setScale(0.6);
      this.scene.tweens.add({ targets: glow, y: glow.y - 60, alpha: { from: 0.9, to: 0 }, duration: 1800, onComplete: () => glow.destroy() });
      this.leaveWorld();
    });
  }

  /* ------------------------------ Efectos ------------------------------ */

  private placeFx(): void {
    const top = this.y - this.z - this.bob;
    const t = this.scene.time.now / 1000;
    const off = this.st === 'calmed' || this.st === 'exhausted' || this.st === 'mist';
    const hungry = this.isAttackState;
    this.eye
      .setPosition(
        this.x + this.facing * (this.kit ? V.eye.dx : this.bestial ? 8 : 4),
        top - (this.kit ? V.eye.dy : this.bestial ? 77 : 84),
      )
      .setAlpha(off ? 0 : (hungry ? 1 : this.st === 'dormant' ? 0.35 : 0.6 + 0.25 * Math.sin(t * 4)) * this.sprite.alpha)
      .setScale(hungry ? 0.28 : 0.18)
      .setDepth(this.y + FX_DEPTH_BIAS);
    // Nube de niebla que viaja mientras está disperso.
    const misty = this.st === 'mist';
    this.mistCloud
      .setPosition(this.x, this.y - 30)
      .setDisplaySize(70, 50)
      .setAlpha(misty ? 0.45 + (reduceFx() ? 0 : 0.1 * Math.sin(t * 8)) : 0)
      .setDepth(this.y);
  }

  private get isAttackState(): boolean {
    return this.st === 'clawsWindup' || this.st === 'claws' || this.st === 'ambushWindup' || this.st === 'batsWindup' || this.st === 'rootsWindup';
  }

  protected onDestroy(): void {
    releaseHold(this);
    this.clearBats();
    this.clearRoots();
    this.eye.destroy();
    this.mistCloud.destroy();
    if (this.st !== 'calmed') hideBossBar();
  }
}
