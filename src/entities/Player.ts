import Phaser from 'phaser';
import type { Hit, PlayerApi, Team, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState, speedMult } from '../core/GameState';
import { DOUBLE_SHIFT_MS, keys } from '../config/controls';
import { DODGE, HURT, JUMP, MOVE, PLAYER_BODY, SHOOT } from '../config/movement';
import { fallbackPlayer } from '../world/textures';
import { kitAnimatorFor, type KitAnimator } from '../systems/CharacterKits';
import { isShieldActive } from '../systems/Shield';

/**
 * Suelo bajo los pies (obstáculos con `height`, Nivel 6): altura del bloque sobre el que se está
 * (0 = suelo normal) y su borde frontal en y (para dibujarse delante del prop). Lo da World.
 */
export type GroundFn = (x: number, y: number, radius: number, z: number) => { height: number; frontY: number };
const FLAT_GROUND: GroundFn = (_x, y) => ({ height: 0, frontY: y });

type State = 'normal' | 'dodge' | 'hurt' | 'dead';

/**
 * Protagonista (dueño: mundo). Posición (x, y) en el plano del suelo + altura z; el sprite se
 * dibuja en (x, y − z) con profundidad y. La sombra la dibuja LevelScene.
 */
export class Player implements PlayerApi {
  x: number;
  y: number;
  z = 0;
  radius: number = PLAYER_BODY.radius;
  height: number = PLAYER_BODY.height;
  team: Team = 'player';
  facing: 1 | -1 = 1;
  controlsLocked = false;

  readonly sprite: Phaser.GameObjects.Sprite;

  private state: State = 'normal';
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private kbx = 0;
  private stateT = 0;
  private invulT = 0;
  private dodgeCd = 0;
  private dodgeDir = { x: 1, y: 0 };
  private lastShiftAt = -9999;
  private landT = 0;
  private jumpCut = true;
  /** Segundo salto ya usado en este vuelo (mejora 'doble_salto'); se repone al aterrizar. */
  private airJumpUsed = false;
  /** Suelo actual (altura del bloque bajo los pies; 0 = suelo normal). Se recalcula cada cuadro. */
  private ground = { height: 0, frontY: 0 };
  private stepAcc = 0;
  private shootHoldT = 0;
  private oneShot: { key: string; t: number } | null = null;
  private time = 0;
  private dead = false;
  private hasArt: boolean;
  private kit: KitAnimator | null;
  private mouseShoot = false;
  private onPointerDown: (p: Phaser.Input.Pointer) => void;
  private onPointerUp: (p: Phaser.Input.Pointer) => void;
  /** Ataduras de luz (Nivel 10, GameState.bound). Se crean al usarse por primera vez. */
  private bonds: Phaser.GameObjects.Graphics | null = null;

  constructor(
    private world: WorldApi,
    x: number,
    y: number,
    private groundFn: GroundFn = FLAT_GROUND,
  ) {
    this.x = x;
    this.y = y;
    this.ground = { height: 0, frontY: y };
    // Nivel 10: cada LevelScene nueva (muerte, cambio de sección) empieza sin ataduras; el director las vuelve a poner.
    Player.clearBound();
    const scene = world.scene;
    this.hasArt = scene.textures.exists('protagonista_reposo');
    const tex = this.hasArt ? 'protagonista_reposo' : fallbackPlayer(scene);
    this.sprite = scene.add.sprite(x, y, tex).setOrigin(0.5, PLAYER_BODY.feetY / PLAYER_BODY.frameSize);
    this.sprite.setDepth(y);
    // Arte del kit del equipo (vistas fijas + animación por código), si ya lo entregaron.
    this.kit = kitAnimatorFor(this.sprite, 'protagonista');
    if (this.kit) this.hasArt = true;

    // Clic izquierdo = disparar, como en cualquier juego (decisión del equipo, 2026-10-19).
    this.onPointerDown = (p) => {
      if (p.leftButtonDown()) {
        this.mouseShoot = true;
        this.tryShoot();
        this.shootHoldT = SHOOT.holdRepeat;
      }
    };
    this.onPointerUp = (p) => {
      if (!p.leftButtonDown()) this.mouseShoot = false;
    };
    scene.input.on('pointerdown', this.onPointerDown);
    scene.input.on('pointerup', this.onPointerUp);

    bus.scoped(scene, 'player:shot', () => this.playOneShot('protagonista_disparar'));
  }

  /** Quita las ataduras del Nivel 10 (GameState.bound) y avisa con 'player:bound' si estaban puestas. */
  private static clearBound(): void {
    if (!GameState.bound) return;
    GameState.bound = false;
    bus.emit('player:bound', { on: false });
  }

  get alive(): boolean {
    return !this.dead;
  }
  get invulnerable(): boolean {
    return this.invulT > 0 || this.state === 'dodge' || this.dead;
  }
  get isDodging(): boolean {
    return this.state === 'dodge';
  }

  /** Con los pies en el suelo o sobre un bloque (z = altura del suelo actual). */
  private get grounded(): boolean {
    return this.z <= this.ground.height && this.vz <= 0;
  }

  private get canAct(): boolean {
    return !this.controlsLocked && !keys.locked && !this.dead;
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vx = this.vy = this.vz = this.kbx = 0;
    this.ground = { height: 0, frontY: y };
    this.airJumpUsed = false;
    this.sync();
  }

  playOneShot(animKey: string): void {
    if (this.dead) return;
    const anim = this.world.scene.anims.get(animKey);
    const dur = anim ? anim.duration / 1000 || 0.35 : 0.35;
    this.oneShot = { key: animKey, t: dur };
    this.playAnim(animKey, true);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.invulT > 0) this.invulT -= dt;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.landT > 0) this.landT -= dt;
    if (this.oneShot) {
      this.oneShot.t -= dt;
      if (this.oneShot.t <= 0) this.oneShot = null;
    }
    this.stateT -= dt;

    if (this.state === 'dead') {
      this.applyZ(dt, false);
      this.sync();
      return;
    }

    const input = this.readInput();

    if (this.state === 'dodge') {
      const k = Math.max(0, this.stateT / DODGE.duration);
      const sp = DODGE.speed * (0.35 + 0.65 * k) * speedMult();
      this.world.moveActor(this, this.dodgeDir.x * sp * dt, this.dodgeDir.y * sp * 0.6 * dt);
      if (this.stateT <= 0) this.state = 'normal';
    } else if (this.state === 'hurt') {
      if (!GameState.bound) this.world.moveActor(this, this.kbx * dt, 0);
      this.kbx *= Math.exp(-HURT.knockbackDecay * dt);
      if (this.stateT <= 0) this.state = 'normal';
    } else {
      this.updateMove(input, dt);
      this.handleActions(input, dt);
    }

    this.applyZ(dt, input.jumpHeld);
    this.updateAnim();
    this.sync();
  }

  private readInput() {
    // Atado (Nivel 10, GameState.bound): no se mueve ni salta; el deletreo (Casting) sigue funcionando.
    const ok = this.canAct && !GameState.bound;
    // Corona del Rey del Olvido (systems/MindControl.ts): invierte SOLO el movimiento, no el apuntado ni los conjuros.
    const inv = GameState.controlsInverted ? -1 : 1;
    const dx = ok ? inv * ((keys.isDown('right') ? 1 : 0) - (keys.isDown('left') ? 1 : 0)) : 0;
    const dy = ok ? inv * ((keys.isDown('down') ? 1 : 0) - (keys.isDown('up') ? 1 : 0)) : 0;
    return {
      dx,
      dy,
      run: ok && keys.isDown('run'),
      jumpHeld: ok && keys.isDown('jump'),
    };
  }

  private updateMove(input: ReturnType<Player['readInput']>, dt: number): void {
    const { dx, dy } = input;
    const run = input.run ? MOVE.runMult : 1;
    const diag = dx !== 0 && dy !== 0 ? MOVE.diagonalMult : 1;
    const air = !this.grounded ? JUMP.airControl : 1;
    const sp = MOVE.walkSpeed * run * diag * air * speedMult();
    const tx = dx * sp;
    const ty = dy * sp * MOVE.depthMult;
    const k = Math.min(1, dt * MOVE.responsiveness);
    this.vx += (tx - this.vx) * k;
    this.vy += (ty - this.vy) * k;
    if (Math.abs(this.vx) < 0.5 && dx === 0) this.vx = 0;
    if (Math.abs(this.vy) < 0.5 && dy === 0) this.vy = 0;
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;

    const ox = this.x;
    const oy = this.y;
    this.world.moveActor(this, this.vx * dt, this.vy * dt);
    if (this.grounded) {
      this.stepAcc += Math.hypot(this.x - ox, this.y - oy);
      const stride = MOVE.stepDistance * (input.run ? 1.5 : 1);
      if (this.stepAcc >= stride) {
        this.stepAcc = 0;
        bus.emit('player:step', {});
      }
    }
  }

  private handleActions(input: ReturnType<Player['readInput']>, dt: number): void {
    if (!this.canAct || GameState.bound) return;
    const now = this.world.scene.time.now;
    // Esquiva: doble Shift o C.
    let dodge = keys.justPressed('dodge');
    if (keys.justPressed('run')) {
      if (now - this.lastShiftAt <= DOUBLE_SHIFT_MS) {
        dodge = true;
        this.lastShiftAt = -9999;
      } else this.lastShiftAt = now;
    }
    if (dodge && this.dodgeCd <= 0 && this.grounded) {
      const len = Math.hypot(input.dx, input.dy);
      this.dodgeDir = len > 0 ? { x: input.dx / len, y: input.dy / len } : { x: this.facing, y: 0 };
      this.state = 'dodge';
      this.stateT = DODGE.duration;
      this.invulT = Math.max(this.invulT, DODGE.iframes);
      this.dodgeCd = DODGE.cooldown;
      this.oneShot = null;
      bus.emit('player:dodge', {});
      return;
    }
    // Salto (desde el suelo o desde encima de un bloque).
    if (keys.justPressed('jump')) {
      if (this.grounded) {
        this.vz = JUMP.velocity;
        this.z = this.ground.height + 0.01;
        this.jumpCut = false;
        this.airJumpUsed = false;
        bus.emit('player:jump', {});
      } else if (!this.airJumpUsed && (GameState.upgrades.doble_salto ?? 0) > 0) {
        // Doble salto (GDD §2.1): una vez por vuelo, impulso algo menor; mantiene la altura variable.
        this.vz = JUMP.doubleVelocity;
        this.jumpCut = false;
        this.airJumpUsed = true;
        this.doubleJumpFx();
        bus.emit('player:jump', {});
        sfx('doble_salto');
      }
    }
    // Modo del láser.
    if (keys.justPressed('laserGreen')) GameState.laserMode = 'green';
    if (keys.justPressed('laserRed')) GameState.laserMode = 'red';
    // Disparo: tocar o mantener.
    if (keys.justPressed('shoot')) {
      this.tryShoot();
      this.shootHoldT = SHOOT.holdRepeat;
    } else if (keys.isDown('shoot') || this.mouseShoot) {
      this.shootHoldT -= dt;
      if (this.shootHoldT <= 0) {
        this.tryShoot();
        this.shootHoldT = SHOOT.holdRepeat;
      }
    }
  }

  private tryShoot(): void {
    // Con el escudo levantado no se dispara (GDD 6.5: defenderse o atacar).
    if (!this.canAct || GameState.bound || !GameState.hasLaser || this.state !== 'normal' || isShieldActive()) return;
    bus.emit('player:shoot-request', {
      x: this.x + this.facing * SHOOT.muzzleX,
      y: this.y,
      z: this.z + SHOOT.muzzleZ,
      facing: this.facing,
    });
  }

  private applyZ(dt: number, held: boolean): void {
    // Suelo bajo los pies: 0 o la altura de un bloque con `height` (el jugador está encima).
    this.ground = this.groundFn(this.x, this.y, this.radius, this.z);
    const floor = this.ground.height;
    if (this.z <= floor && this.vz <= 0) {
      this.z = floor;
      return;
    }
    const rising = this.vz > 0;
    if (rising && !held && !this.jumpCut) {
      // Altura variable: al soltar Espacio se corta la subida (una sola vez por salto).
      this.vz *= JUMP.releaseCut;
      this.jumpCut = true;
    }
    const g = JUMP.gravity * (rising && !this.jumpCut ? JUMP.holdGravityMult : 1);
    this.vz -= g * dt;
    this.z += this.vz * dt;
    if (this.z <= floor) {
      // Aterriza en el suelo o encima del bloque; al salir de su borde vuelve a caer (z > suelo).
      this.z = floor;
      this.vz = 0;
      this.airJumpUsed = false;
      this.landT = JUMP.landTime;
      if (!this.dead) bus.emit('player:land', {});
    }
  }

  /** Anillo de luz bajo los pies + plumas que caen (doble salto). Reducible con reduceFx. */
  private doubleJumpFx(): void {
    const scene = this.world.scene;
    const fx = this.world.fxLayer;
    const x = this.x;
    const y = this.y - this.z;
    const ring = scene.add.ellipse(x, y, 16, 6).setStrokeStyle(1.5, 0xfff2b0, 0.95);
    fx.add(ring);
    scene.tweens.add({
      targets: ring,
      scaleX: 2.4,
      scaleY: 2.4,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    const feathers = GameState.settings.reduceFx ? 2 : 6;
    for (let i = 0; i < feathers; i++) {
      const f = scene.add.rectangle(x + (Math.random() - 0.5) * 18, y, 2, 4, i % 2 ? 0xfff2b0 : 0x9affe0, 0.9);
      fx.add(f);
      scene.tweens.add({
        targets: f,
        x: f.x + (Math.random() - 0.5) * 20,
        y: y + 10 + Math.random() * 14,
        angle: (Math.random() - 0.5) * 180,
        alpha: 0,
        duration: 420 + Math.random() * 220,
        ease: 'Sine.Out',
        onComplete: () => f.destroy(),
      });
    }
  }

  takeHit(hit: Hit): boolean {
    if (this.invulnerable || this.dead) return false;
    GameState.hp = Math.max(0, GameState.hp - hit.damage);
    bus.emit('player:hurt', { hp: GameState.hp, maxHp: GameState.maxHp });
    const dir = this.x >= hit.sourceX ? 1 : -1;
    this.kbx = dir * HURT.knockbackSpeed * (hit.knockback || 1);
    this.oneShot = null;
    if (GameState.hp <= 0) {
      this.die();
      return true;
    }
    this.state = 'hurt';
    this.stateT = HURT.stagger;
    this.invulT = HURT.invulnerable;
    this.playAnim('protagonista_dano', true);
    return true;
  }

  private die(): void {
    this.dead = true;
    Player.clearBound();
    this.state = 'dead';
    this.vx = this.vy = 0;
    this.sprite.setAlpha(1);
    this.playAnim('protagonista_morir', true);
    bus.emit('player:died', {});
  }

  private updateAnim(): void {
    if (this.state === 'dead') return;
    // Parpadeo de invulnerabilidad (no durante la esquiva, que tiene su propia anim).
    if (this.invulT > 0 && this.state !== 'dodge') {
      this.sprite.setAlpha(Math.sin(this.time * HURT.blinkHz * Math.PI * 2) > 0 ? 1 : 0.25);
    } else this.sprite.setAlpha(this.state === 'dodge' ? 0.75 : 1);

    this.sprite.setFlipX(this.facing < 0);
    if (this.state === 'hurt') return this.playAnim('protagonista_dano');
    if (this.state === 'dodge') return this.playAnim('protagonista_esquivar');
    if (this.oneShot) return;
    if (!this.grounded) return this.playAnim(this.vz > 0 ? 'protagonista_saltar_subida' : 'protagonista_saltar_caida');
    if (this.landT > 0) return this.playAnim('protagonista_aterrizar');
    const moving = Math.abs(this.vx) > 4 || Math.abs(this.vy) > 4;
    if (!moving) return this.playAnim('protagonista_reposo');
    const running = Math.abs(this.vx) > MOVE.walkSpeed * 1.2 * speedMult();
    this.playAnim(running ? 'protagonista_correr' : 'protagonista_caminar');
  }

  private playAnim(key: string, restart = false): void {
    if (this.kit) return this.kit.setAnim(key, restart);
    const scene = this.world.scene;
    if (scene.anims.exists(key)) {
      if (restart) this.sprite.play(key);
      else this.sprite.play(key, true);
    } else if (this.hasArt && scene.textures.exists(key) && this.sprite.texture.key !== key) {
      this.sprite.setTexture(key, 0);
    }
  }

  private sync(): void {
    // Rebote sutil al caminar si no hay arte animado todavía.
    let bob = 0;
    if (!this.hasArt && this.grounded && (Math.abs(this.vx) > 4 || Math.abs(this.vy) > 4)) {
      bob = Math.sin(this.time * 18) > 0 ? -1 : 0;
    }
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y - this.z + bob));
    // Encima de un bloque se dibuja delante de su prop (borde frontal del bloque).
    this.sprite.setDepth(this.ground.height > 0 ? Math.max(this.y, this.ground.frontY) + 0.5 : this.y);
    if (this.kit) this.kit.apply(this.facing, this.time);
    else if (!this.hasArt) {
      // Inclinación de la silueta de respaldo según el estado (feedback mínimo).
      this.sprite.setAngle(this.state === 'dodge' ? this.facing * 25 : this.state === 'dead' ? this.facing * -80 : 0);
    }
    this.drawBonds();
  }

  /** Nivel 10: tres anillos de luz morada que rodean al jugador mientras está atado (GameState.bound). */
  private drawBonds(): void {
    if (!GameState.bound || this.dead) {
      this.bonds?.setVisible(false);
      return;
    }
    if (!this.bonds) this.bonds = this.world.scene.add.graphics();
    const g = this.bonds.clear().setVisible(true);
    const cx = Math.round(this.x);
    const feet = Math.round(this.y - this.z);
    const pulse = GameState.settings.reduceFx ? 0.8 : 0.65 + 0.25 * Math.sin(this.time * 5);
    for (const [i, h] of [16, 34, 52].entries()) {
      const wob = GameState.settings.reduceFx ? 0 : Math.sin(this.time * 3 + i * 1.7) * 1.5;
      g.lineStyle(3, 0x9a5cff, 0.35 * pulse).strokeEllipse(cx, feet - h + wob, 30, 9);
      g.lineStyle(1, 0xe6d0ff, pulse).strokeEllipse(cx, feet - h + wob, 26, 7);
    }
    // Hilos de luz que bajan al suelo (las cadenas que lo sujetan al altar).
    g.lineStyle(1, 0xc8a0ff, 0.5 * pulse).lineBetween(cx - 13, feet - 16, cx - 22, feet + 2).lineBetween(cx + 13, feet - 16, cx + 22, feet + 2);
    g.setDepth(this.sprite.depth + 0.3);
  }

  destroy(): void {
    const scene = this.world.scene;
    scene.input.off('pointerdown', this.onPointerDown);
    scene.input.off('pointerup', this.onPointerUp);
    this.bonds?.destroy();
    this.bonds = null;
    this.sprite.destroy();
  }
}
