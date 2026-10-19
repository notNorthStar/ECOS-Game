import Phaser from 'phaser';
import type { DepthEntity, EnemyApi, EnemySpec, LevelData, LevelTrigger, PlayerApi, SectionId, WorldApi } from '../core/contracts';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { keys } from '../config/controls';
import { CAMERA, HURT, WORLD } from '../config/movement';
import { Player } from '../entities/Player';
import { createEnemy } from '../entities/registry';
import { Atmosphere, type WaterSpec } from './Atmosphere';
import { DebugOverlay } from './DebugOverlay';
import { WalkMap, type Obstacle } from './WalkMap';
import { fallbackLayer, fallbackProp, shadowTexture } from './textures';

/** Lo que LevelScene le pide al mundo para reiniciarse (muerte, cambio de sección). */
export interface RestartRequest {
  section: string;
  spawn?: string;
  pos?: { x: number; y: number };
}

/**
 * Implementación de WorldApi (dueño: mundo). Vive dentro de LevelScene; es un objeto aparte porque
 * Phaser.Scene ya tiene una propiedad `scene` (ScenePlugin) incompatible con WorldApi.scene.
 */
export class World implements WorldApi {
  readonly player: PlayerApi;
  readonly fxLayer: Phaser.GameObjects.Layer;
  readonly map: WalkMap;

  private _entities: DepthEntity[] = [];
  private _enemies: EnemyApi[] = [];
  private _timeScale = 1;
  private appliedAnimScale = 1;
  private hitstopUntil = 0;
  private arena: { x0: number; x1: number } | null = null;
  private lookAhead = 0;
  private playerShadow: Phaser.GameObjects.Image;
  private atmosphere: Atmosphere;
  private debug: DebugOverlay;
  private triggersInside = new Set<string>();
  private transitioning = false;

  constructor(
    readonly scene: Phaser.Scene,
    readonly level: LevelData,
    start: { x: number; y: number },
    private entrySpawn: string | undefined,
    private restart: (req: RestartRequest) => void,
  ) {
    const lv = level;
    const cam = scene.cameras.main;
    cam.setBounds(0, 0, lv.width, GAME_HEIGHT);
    cam.setBackgroundColor('#07060d');

    // Parallax: 6 capas por scrollFactor. Ancho = layerWidth(...) → el borde derecho cuadra al final.
    for (let i = 0; i < 6; i++) {
      const f = PARALLAX_FACTORS[i];
      const key = `${lv.background}_capa${i}`;
      const tex = scene.textures.exists(key) ? key : fallbackLayer(scene, i, layerWidth(lv.width, f));
      const depth = i < 4 ? DEPTH.background + i : i === 4 ? DEPTH.ground : DEPTH.foreground;
      scene.add.image(0, 0, tex).setOrigin(0, 0).setScrollFactor(f, 0).setDepth(depth);
    }

    // Props: origen en los pies, profundidad = y.
    const extra: Obstacle[] = [];
    const lamps: Array<{ x: number; y: number; scale: number }> = [];
    for (const p of lv.props) {
      const tex = scene.textures.exists(p.key) ? p.key : fallbackProp(scene, p.key);
      const s = scene.add.sprite(p.x, p.y, tex).setOrigin(0.5, 1);
      s.setDepth(p.foreground ? DEPTH.foreground + 0.5 : p.y);
      if (p.flipX) s.setFlipX(true);
      if (p.alpha !== undefined) s.setAlpha(p.alpha);
      if (p.scale !== undefined) s.setScale(p.scale);
      if (p.id) s.setName(p.id); // el director lo encuentra con scene.children.getByName(id)
      if (p.anim && scene.anims.exists(p.anim)) s.play(p.anim);
      if (p.collide) extra.push({ shape: 'ellipse', x: p.x, y: p.y, rx: p.collide.rx, ry: p.collide.ry });
      if (p.key === 'prop_farol') lamps.push({ x: p.x, y: p.y, scale: p.scale ?? 1 });
    }
    this.map = new WalkMap(lv, extra);

    // Agua: elipses del JSON con el campo extra opcional "water": true.
    const water = (lv.obstacles as Array<Obstacle & { water?: boolean }>).filter(
      (o): o is WaterSpec & Obstacle & { water?: boolean } => o.shape === 'ellipse' && !!o.water,
    ) as unknown as WaterSpec[];
    this.atmosphere = new Atmosphere(scene, lv, lamps, water);

    // Efectos en coordenadas del mundo: por encima de los actores, debajo del primer plano.
    this.fxLayer = scene.add.layer().setDepth(DEPTH.foreground - 10);

    const p0 = this.map.nearestWalkable(start.x, start.y, 7);
    const player = new Player(this, p0.x, p0.y);
    this.player = player;
    this.playerShadow = scene.add.image(p0.x, p0.y, shadowTexture(scene)).setDepth(DEPTH.shadow).setAlpha(0.6);
    this._entities.push(player);

    for (const spec of lv.enemies) if (!spec.group) this.trySpawn(spec);

    this.debug = new DebugOverlay(scene, lv, this.map);

    // Bus (siempre con scoped: la escena se reinicia).
    bus.scoped(scene, 'arena:start', ({ group }) => {
      for (const spec of lv.enemies) if (spec.group === group) this.trySpawn(spec);
    });
    bus.scoped(scene, 'section:goto', ({ section, spawn }) => this.gotoSection(section, spawn));
    bus.scoped(scene, 'player:died', () => {
      scene.time.delayedCall(HURT.respawnMs, () => this.respawn());
    });

    // Cámara inicial centrada en el jugador.
    cam.setScroll(this.cameraTarget(), 0);
  }

  /* ----------------------------- WorldApi ----------------------------- */

  get entities(): ReadonlyArray<DepthEntity> {
    return this._entities;
  }
  get enemies(): ReadonlyArray<EnemyApi> {
    return this._enemies;
  }

  get timeScale(): number {
    return this._timeScale;
  }
  set timeScale(v: number) {
    this._timeScale = Math.max(0, v);
    this.scene.tweens.timeScale = this._timeScale;
  }

  add(e: DepthEntity): void {
    if (this._entities.includes(e)) return;
    this._entities.push(e);
    if (isEnemy(e)) this._enemies.push(e);
  }

  remove(e: DepthEntity): void {
    const i = this._entities.indexOf(e);
    if (i >= 0) this._entities.splice(i, 1);
    const j = this._enemies.indexOf(e as EnemyApi);
    if (j >= 0) this._enemies.splice(j, 1);
  }

  spawnEnemy(spec: EnemySpec): EnemyApi {
    const e = createEnemy(this, spec);
    this.add(e);
    return e;
  }

  moveActor(a: { x: number; y: number; radius: number }, dx: number, dy: number): void {
    const ox = a.x;
    this.map.moveActor(a, dx, dy);
    if (a === this.player) {
      // Límites del mundo y de la arena solo para el jugador (los enemigos pueden entrar desde fuera).
      const x0 = (this.arena?.x0 ?? 0) + a.radius;
      const x1 = (this.arena?.x1 ?? this.level.width) - a.radius;
      if (a.x < x0 && a.x < ox) a.x = Math.min(ox, x0);
      if (a.x > x1 && a.x > ox) a.x = Math.max(ox, x1);
    }
  }

  isWalkable(x: number, y: number, radius = 0): boolean {
    return x >= 0 && x <= this.level.width && this.map.isWalkable(x, y, radius);
  }

  randomPointNear(x: number, y: number, r: number): { x: number; y: number } {
    return this.map.randomPointNear(x, y, r);
  }

  lockArena(x0: number, x1: number): void {
    this.arena = { x0: Math.max(0, x0), x1: Math.min(this.level.width, x1) };
  }
  unlockArena(): void {
    this.arena = null;
  }

  shake(intensity: number, ms: number): void {
    if (GameState.settings.reduceFx) return;
    // Acepta fracción de pantalla (Phaser, ~0.005) o píxeles (> 1).
    const i = intensity > 1 ? intensity / GAME_WIDTH : intensity;
    this.scene.cameras.main.shake(ms, i, true);
  }

  hitstop(ms: number): void {
    if (GameState.settings.reduceFx) ms = Math.min(ms, WORLD.reducedHitstopMax);
    this.hitstopUntil = Math.max(this.hitstopUntil, performance.now() + ms);
  }

  flash(color: number, ms: number): void {
    if (GameState.settings.reduceFx) return;
    this.scene.cameras.main.flash(ms, (color >> 16) & 255, (color >> 8) & 255, color & 255, true);
  }

  gotoSection(section: SectionId, spawn?: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    GameState.section = section;
    this.player.controlsLocked = true;
    this.scene.cameras.main.fadeOut(CAMERA.fadeMs, 0, 0, 0, (_c: unknown, progress: number) => {
      if (progress >= 1) this.restart({ section, spawn });
    });
  }

  /* ----------------------------- internos ----------------------------- */

  private trySpawn(spec: EnemySpec): void {
    try {
      this.spawnEnemy(spec);
    } catch (err) {
      // El sistema de combate llega en paralelo: no tumbar el nivel por un enemigo.
      console.warn('[mundo] no se pudo crear el enemigo', spec, err);
    }
  }

  private respawn(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    GameState.hp = GameState.maxHp;
    const cp = GameState.checkpoint;
    this.scene.cameras.main.fadeOut(CAMERA.fadeMs, 0, 0, 0, (_c: unknown, progress: number) => {
      if (progress < 1) return;
      if (cp) {
        GameState.section = cp.section;
        this.restart({ section: cp.section, pos: { x: cp.x, y: cp.y } });
      } else this.restart({ section: this.level.id, spawn: this.entrySpawn });
    });
  }

  private cameraBounds(): { x0: number; x1: number } {
    const b = this.arena ?? this.level.cameraBounds ?? { x0: 0, x1: this.level.width };
    return { x0: Math.max(0, b.x0), x1: Math.min(this.level.width, b.x1) };
  }

  private cameraTarget(): number {
    const { x0, x1 } = this.cameraBounds();
    const target = this.player.x + this.lookAhead - GAME_WIDTH / 2;
    if (x1 - x0 <= GAME_WIDTH) return (x0 + x1) / 2 - GAME_WIDTH / 2;
    return Phaser.Math.Clamp(target, x0, x1 - GAME_WIDTH);
  }

  private updateTriggers(): void {
    const p = this.player;
    for (const t of this.level.triggers) {
      const inside = p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h;
      const was = this.triggersInside.has(t.id);
      if (inside && !was) {
        this.triggersInside.add(t.id);
        this.fireTrigger(t);
      } else if (!inside && was) this.triggersInside.delete(t.id);
    }
  }

  private fireTrigger(t: LevelTrigger): void {
    const flag = 'trg:' + t.id;
    if (t.once) {
      if (GameState.flags[flag]) return;
      GameState.flags[flag] = true;
    }
    bus.emit('trigger:enter', { trigger: t });
  }

  /** Ajusta anims.timeScale de los sprites de la escena (ralentización y hitstop). */
  private applyAnimScale(s: number): void {
    if (s === 1 && this.appliedAnimScale === 1) return;
    const visit = (list: Phaser.GameObjects.GameObject[]) => {
      for (const o of list) {
        if (o instanceof Phaser.GameObjects.Sprite) o.anims.timeScale = s;
        else if (o instanceof Phaser.GameObjects.Layer) visit(o.list);
      }
    };
    visit(this.scene.children.list);
    this.appliedAnimScale = s;
  }

  /** Un cuadro del mundo. dt real en segundos. */
  update(dt: number): void {
    if (keys.justPressed('debug')) this.debug.toggle();

    const frozen = performance.now() < this.hitstopUntil;
    const wdt = frozen ? 0 : dt * this._timeScale;
    this.applyAnimScale(frozen ? 0 : this._timeScale);

    if (wdt > 0) {
      const list = this._entities.slice();
      for (const e of list) e.update(wdt);
    }

    // Sombra del jugador (los enemigos dibujan la suya: EnemyBase).
    const p = this.player;
    const k = Math.max(0.45, 1 - p.z / 110);
    this.playerShadow
      .setPosition(Math.round(p.x), Math.round(p.y))
      .setScale(((p.radius * 2.6) / 32) * k, k)
      .setAlpha(0.6 * k);

    if (!this.transitioning) this.updateTriggers();

    // Cámara: seguimiento suave con adelanto hacia donde mira el jugador.
    const cam = this.scene.cameras.main;
    this.lookAhead += (p.facing * CAMERA.lookAhead - this.lookAhead) * Math.min(1, dt * CAMERA.lookAheadLerp);
    const target = this.cameraTarget();
    cam.scrollX += (target - cam.scrollX) * Math.min(1, dt * CAMERA.lerp);

    this.atmosphere.update(frozen ? 0 : dt * Math.max(0.15, this._timeScale), cam.scrollX);
    this.debug.draw(this._entities, this.scene.game.loop.actualFps, this._timeScale);
  }
}

function isEnemy(e: DepthEntity): e is EnemyApi {
  return e.team === 'enemy' && 'kind' in e;
}
