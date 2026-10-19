import Phaser from 'phaser';
import type { Hit, PlayerApi, Team, WorldApi } from '../core/contracts';
import { bus } from '../core/bus';
import { GameState, speedMult } from '../core/GameState';
import { DOUBLE_SHIFT_MS, keys } from '../config/controls';
import { DODGE, HURT, JUMP, MOVE, PLAYER_BODY, SHOOT } from '../config/movement';
import { fallbackPlayer } from '../world/textures';
import { kitAnimatorFor, type KitAnimator } from '../systems/CharacterKits';

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

  constructor(
    private world: WorldApi,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
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

  get alive(): boolean {
    return !this.dead;
  }
  get invulnerable(): boolean {
    return this.invulT > 0 || this.state === 'dodge' || this.dead;
  }
  get isDodging(): boolean {
    return this.state === 'dodge';
  }

  private get canAct(): boolean {
    return !this.controlsLocked && !keys.locked && !this.dead;
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vx = this.vy = this.vz = this.kbx = 0;
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
      this.world.moveActor(this, this.kbx * dt, 0);
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
    const ok = this.canAct;
    const dx = ok ? (keys.isDown('right') ? 1 : 0) - (keys.isDown('left') ? 1 : 0) : 0;
    const dy = ok ? (keys.isDown('down') ? 1 : 0) - (keys.isDown('up') ? 1 : 0) : 0;
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
    const air = this.z > 0 ? JUMP.airControl : 1;
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
    if (this.z === 0) {
      this.stepAcc += Math.hypot(this.x - ox, this.y - oy);
      const stride = MOVE.stepDistance * (input.run ? 1.5 : 1);
      if (this.stepAcc >= stride) {
        this.stepAcc = 0;
        bus.emit('player:step', {});
      }
    }
  }

  private handleActions(input: ReturnType<Player['readInput']>, dt: number): void {
    if (!this.canAct) return;
    const now = this.world.scene.time.now;
    // Esquiva: doble Shift o C.
    let dodge = keys.justPressed('dodge');
    if (keys.justPressed('run')) {
      if (now - this.lastShiftAt <= DOUBLE_SHIFT_MS) {
        dodge = true;
        this.lastShiftAt = -9999;
      } else this.lastShiftAt = now;
    }
    if (dodge && this.dodgeCd <= 0 && this.z === 0) {
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
    // Salto.
    if (keys.justPressed('jump') && this.z === 0) {
      this.vz = JUMP.velocity;
      this.z = 0.01;
      this.jumpCut = false;
      bus.emit('player:jump', {});
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
    if (!this.canAct || !GameState.hasLaser || this.state !== 'normal') return;
    bus.emit('player:shoot-request', {
      x: this.x + this.facing * SHOOT.muzzleX,
      y: this.y,
      z: this.z + SHOOT.muzzleZ,
      facing: this.facing,
    });
  }

  private applyZ(dt: number, held: boolean): void {
    if (this.z <= 0 && this.vz <= 0) return;
    const rising = this.vz > 0;
    if (rising && !held && !this.jumpCut) {
      // Altura variable: al soltar Espacio se corta la subida (una sola vez por salto).
      this.vz *= JUMP.releaseCut;
      this.jumpCut = true;
    }
    const g = JUMP.gravity * (rising && !this.jumpCut ? JUMP.holdGravityMult : 1);
    this.vz -= g * dt;
    this.z += this.vz * dt;
    if (this.z <= 0) {
      this.z = 0;
      this.vz = 0;
      this.landT = JUMP.landTime;
      if (!this.dead) bus.emit('player:land', {});
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
    if (this.z > 0) return this.playAnim(this.vz > 0 ? 'protagonista_saltar_subida' : 'protagonista_saltar_caida');
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
    if (!this.hasArt && this.z === 0 && (Math.abs(this.vx) > 4 || Math.abs(this.vy) > 4)) {
      bob = Math.sin(this.time * 18) > 0 ? -1 : 0;
    }
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y - this.z + bob));
    this.sprite.setDepth(this.y);
    if (this.kit) this.kit.apply(this.facing, this.time);
    else if (!this.hasArt) {
      // Inclinación de la silueta de respaldo según el estado (feedback mínimo).
      this.sprite.setAngle(this.state === 'dodge' ? this.facing * 25 : this.state === 'dead' ? this.facing * -80 : 0);
    }
  }

  destroy(): void {
    const scene = this.world.scene;
    scene.input.off('pointerdown', this.onPointerDown);
    scene.input.off('pointerup', this.onPointerUp);
    this.sprite.destroy();
  }
}
