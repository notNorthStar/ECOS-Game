import Phaser from 'phaser';
import type { EnemyApi, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH, isCatemaco } from '../config/game';
import { MARIA as M } from '../config/abilities';
import { kitAnimatorFor, type KitAnimator } from './CharacterKits';
import { isLunaActive } from './Luna';

// Sin importar entities/EnemyBase a propósito: el HUD importa este módulo (getMariaStatus) y así no se
// forma un ciclo HudScene → Maria → EnemyBase → Shield → Casting → … → HudScene.

/** Distancia en el plano del suelo (elipse ry = rx / 2), igual que EnemyBase.planeDist. */
const planeDist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, (ay - by) * 2);
/** ¿Una entidad lunaOnly existe ahora para el jugador? (igual que EnemyBase.lunaVisible). */
const lunaVisible = (e: { lunaOnly?: boolean }) => !e.lunaOnly || isLunaActive();

/**
 * Dueño: sistemas (Nivel 4). MARÍA, compañera de viaje (Niveles 3–7; NDD: busca desesperadamente a sus hijos).
 * LevelScene llama installMaria(world) en todas las secciones; no hace nada mientras GameState.hasMaria sea false.
 *
 * - Sigue al jugador como Balam, del otro lado (delante en profundidad) y más lejos. Respeta colisiones,
 *   timeScale, profundidad por y y sombra. Reaparece junto al jugador si se aleja mucho.
 * - Es invulnerable e intangible: NO se agrega a world.entities (nadie la golpea ni la empuja).
 * - LAMENTO cada MARIA.cooldown s si hay enemigos cerca: onda azul pálida que aturde sin daño
 *   (jefes: aturdimiento leve). Emite 'maria:assist' {kind:'lamento'} y sfx 'maria_lamento'.
 * - Comentarios: mariaSay(text, ms?) → 'maria:say' → globo sobre ella (o toast si no está en escena).
 *   Además, frases propias ocasionales en reposo (máx. 1 por minuto), solo sobre sus hijos.
 * Arte: kit del equipo `kit_maria` (KitAnimator) si existe; si no, placeholder simple (AGENTS.md §8.0).
 */

const TEX = '__maria_ph';
const GLOW = '__maria_glow';
/** Placeholder: cuadro 64×80, pivote (32, 78), mirando a la derecha. */
const FRAME = { w: 64, h: 80, feetY: 78 };
/** Altura aproximada de la cabeza sobre los pies (para el globo y el brillo). */
const HEAD_H = 70;

let pendingSpawn: { x: number; y: number } | null = null;
let spawnHook: ((x?: number, y?: number) => void) | null = null;
let current: { x: number; y: number } | null = null;
const status = { visible: false, charge: 0, casting: false };

/** Hace que María hable: globo sobre ella (o toast con su nombre). ms = duración (por defecto MARIA.sayMs). */
export function mariaSay(text: string, ms?: number): void {
  bus.emit('maria:say', ms === undefined ? { text } : { text, ms });
}

/**
 * Hace aparecer a María (si el director lo necesita): hasMaria = true y aparece en (x, y) o junto al jugador.
 * Si la escena aún no la instaló, aparecerá al instalarse.
 */
export function wakeMaria(x?: number, y?: number): void {
  GameState.hasMaria = true;
  pendingSpawn = x !== undefined && y !== undefined ? { x, y } : null;
  spawnHook?.(x, y);
}

let transformHook: (() => Promise<void>) | null = null;

/**
 * Nivel 7: María se transforma (en la Llorona). Deja de seguir, la envuelven agua y niebla y desaparece
 * (sugerido, sin violencia). Al terminar: GameState.hasMaria = false y emite 'maria:transform'.
 * Si no está en escena, solo actualiza el estado y emite el evento. Resuelve al terminar el efecto (~1.8 s).
 * Para colocar a la Llorona donde estaba, lee getMariaPosition() ANTES de llamarla.
 */
export function mariaTransform(): Promise<void> {
  if (transformHook) return transformHook();
  GameState.hasMaria = false;
  pendingSpawn = null;
  bus.emit('maria:transform', {});
  return Promise.resolve();
}

/** Posición actual de María en el plano del suelo (null si no está en la escena). */
export function getMariaPosition(): { x: number; y: number } | null {
  return current ? { ...current } : null;
}

/** Para el HUD: ¿se ve?, carga del lamento 0..1 y si lo está preparando. */
export function getMariaStatus(): Readonly<{ visible: boolean; charge: number; casting: boolean }> {
  return status;
}

function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX) && scene.textures.exists(GLOW)) return;
  const g = scene.make.graphics({}, false);
  const edge = 0x4a3a5a; // contorno de color (no negro)
  const rebozo = 0x262536;
  const rebozoLuz = 0x3a3a52;
  const vestido = 0x5a2a3a;
  const vestidoLuz = 0x7a3a4a;
  const piel = 0xb07a58;
  const P = (pts: number[][]) => pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  // Falda larga.
  const falda = P([[24, 42], [40, 42], [45, 77], [19, 77]]);
  g.fillStyle(vestido, 1).fillPoints(falda, true);
  g.fillStyle(vestidoLuz, 1).fillPoints(P([[26, 44], [31, 44], [28, 76], [21, 76]]), true);
  g.lineStyle(1, edge, 1).strokePoints(falda, true);
  // Pies.
  g.fillStyle(0x2a1a14, 1).fillRect(27, 76, 5, 2).fillRect(34, 76, 6, 2);
  // Blusa (apenas asoma) y manos juntas al frente.
  g.fillStyle(0xd8cdb8, 1).fillRect(29, 26, 10, 17);
  // Rebozo: cubre la cabeza y cae por la espalda.
  const manto = P([[25, 9], [37, 7], [42, 16], [41, 30], [38, 40], [30, 44], [23, 54], [19, 44], [21, 22]]);
  g.fillStyle(rebozo, 1).fillPoints(manto, true);
  g.lineStyle(1, edge, 1).strokePoints(manto, true);
  // Rayas del tejido del rebozo.
  g.lineStyle(1, rebozoLuz, 1).lineBetween(21, 34, 39, 30).lineBetween(21, 40, 37, 37).lineBetween(22, 47, 31, 43);
  g.fillStyle(0x8a3a5a, 1).fillRect(22, 52, 2, 3).fillRect(19, 46, 2, 3); // flecos
  // Cara (de lado, mirando a la derecha) bajo el rebozo.
  g.fillStyle(piel, 1).fillEllipse(37, 18, 8, 10);
  g.fillStyle(0x1a1420, 1).fillRect(32, 12, 4, 9); // cabello
  g.fillStyle(0x2a1a20, 1).fillRect(39, 17, 1, 1); // ojo
  g.fillStyle(0x8a5a40, 1).fillRect(40, 21, 1, 1); // boca (seria)
  // Manos.
  g.fillStyle(piel, 1).fillCircle(39, 39, 2.5);
  g.generateTexture(TEX, FRAME.w, FRAME.h);
  g.clear();
  for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.08 + (1 - r / 16) * 0.25).fillCircle(16, 16, r);
  g.generateTexture(GLOW, 32, 32);
  g.destroy();
}

export function installMaria(world: WorldApi): void {
  const scene = world.scene;
  current = null;
  status.visible = false;
  status.charge = 0;
  status.casting = false;
  // En Catemaco su aparición la maneja el director (NPC de la escena del altar).
  if (isCatemaco(world.level.id)) return;

  let sprite: Phaser.GameObjects.Sprite | null = null;
  let shadow: Phaser.GameObjects.Ellipse | null = null;
  let aura: Phaser.GameObjects.Image | null = null;
  let kit: KitAnimator | null = null;
  const me = { x: 0, y: 0, radius: M.radius };
  let facing: 1 | -1 = 1;
  let time = 0;
  let moving = false;
  let dist = 0;
  // Lamento.
  let cd: number = M.firstDelay;
  let windup = 0;
  // Comentarios.
  let bubble: Phaser.GameObjects.Container | null = null;
  let bubbleLeft = 0;
  let idleT = 0;
  let lastSayAt = -Infinity;
  let lastPhrase = -1;

  const reduceFx = () => GameState.settings.reduceFx;

  const behind = () => {
    const p = world.player;
    return { x: p.x - p.facing * M.followBehind, y: p.y + M.followDepth };
  };

  const spawn = (x: number, y: number, fadeIn: boolean) => {
    if (sprite) return;
    ensureTexture(scene);
    me.x = x;
    me.y = y;
    shadow = scene.add.ellipse(x, y, 22, 6, 0x000000, 0.35).setDepth(DEPTH.shadow + y * 0.0001);
    sprite = scene.add.sprite(x, y, TEX).setOrigin(0.5, FRAME.feetY / FRAME.h);
    kit = kitAnimatorFor(sprite, 'maria');
    aura = scene.add.image(x, y - HEAD_H / 2, GLOW).setTint(M.color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(2);
    current = { x, y };
    status.visible = true;
    if (fadeIn) {
      sprite.setAlpha(0);
      scene.tweens.add({ targets: sprite, alpha: 1, duration: 500 });
    }
  };

  const placeNear = (at: { x: number; y: number }) =>
    world.isWalkable(at.x, at.y, M.radius) ? at : world.randomPointNear(at.x, at.y, 24);

  if (GameState.hasMaria) {
    const pt = placeNear(pendingSpawn ?? behind());
    pendingSpawn = null;
    spawn(pt.x, pt.y, false);
  }

  /* --------------------------- Transformación --------------------------- */

  let transforming = false;
  transformHook = () => {
    const finish = () => {
      GameState.hasMaria = false;
      pendingSpawn = null;
      current = null;
      status.visible = false;
      status.casting = false;
      bus.emit('maria:transform', {});
    };
    if (!sprite || transforming) {
      if (!transforming) finish();
      return Promise.resolve();
    }
    transforming = true;
    windup = 0;
    hideBubble();
    const s = sprite;
    const x = me.x;
    const y = me.y;
    const ms = 1800;
    sfx('maria_transformar');
    return new Promise<void>((resolve) => {
      // Agua: ondas a sus pies; niebla: motas pálidas que suben y la envuelven.
      const waves = reduceFx() ? 1 : 4;
      for (let i = 0; i < waves; i++) {
        const w = scene.add
          .ellipse(x, y, 60, 18, 0x000000, 0)
          .setStrokeStyle(1, i % 2 ? M.colorCore : M.color, 0.8)
          .setDepth(y - 1)
          .setScale(0.1);
        scene.tweens.add({ targets: w, scale: 1.4, alpha: 0, delay: i * 320, duration: 900, onComplete: () => w.destroy() });
      }
      if (!reduceFx()) {
        const mist = scene.time.addEvent({ delay: 90, repeat: Math.floor(ms / 90) - 1, callback: () => motes(x, y - HEAD_H * 0.5, y + 1, 2) });
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => mist.remove());
      }
      if (aura) scene.tweens.add({ targets: aura, alpha: reduceFx() ? 0.4 : 0.8, scale: 3.5, duration: ms * 0.6, yoyo: true });
      s.setTint(0xcfe0ff);
      scene.tweens.add({
        targets: s,
        alpha: 0,
        scaleY: 1.08,
        duration: ms,
        ease: 'Sine.easeIn',
        onComplete: () => {
          s.destroy();
          shadow?.destroy();
          aura?.destroy();
          if (sprite === s) sprite = null;
          shadow = null;
          aura = null;
          kit = null;
          transforming = false;
          finish();
          resolve();
        },
      });
      if (shadow) scene.tweens.add({ targets: shadow, alpha: 0, duration: ms });
      // Si la escena se apaga a media transformación, igual se completa el estado.
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (!transforming) return;
        transforming = false;
        finish();
        resolve();
      });
    });
  };

  spawnHook = (x?: number, y?: number) => {
    if (sprite) return;
    const at = x !== undefined && y !== undefined ? { x, y } : behind();
    pendingSpawn = null;
    const pt = placeNear(at);
    spawn(pt.x, pt.y, true);
  };

  /* ------------------------------ Globo ------------------------------ */

  const hideBubble = () => {
    if (!bubble) return;
    const b = bubble;
    bubble = null;
    scene.tweens.add({ targets: b, alpha: 0, duration: 200, onComplete: () => b.destroy() });
  };

  const showBubble = (text: string, ms: number) => {
    lastSayAt = time;
    idleT = 0;
    if (!sprite) {
      bus.emit('hud:toast', { text: `María: ${text}`, ms });
      return;
    }
    bubble?.destroy();
    const scale = GameState.settings.textScale || 1;
    const t = scene.add
      .text(0, 0, text, {
        fontFamily: 'monospace',
        fontSize: `${Math.round(8 * scale)}px`,
        color: '#eef4ff',
        align: 'center',
        wordWrap: { width: M.bubbleWidth * scale },
      })
      .setOrigin(0.5, 1);
    const name = scene.add
      .text(0, 0, 'MARÍA', { fontFamily: 'monospace', fontSize: `${Math.round(7 * scale)}px`, color: '#bfd8ff' })
      .setOrigin(0.5, 1);
    const w = Math.max(t.width, name.width) + 10;
    const h = t.height + name.height + 6;
    t.setPosition(0, -4);
    name.setPosition(0, -4 - t.height - 1);
    const g = scene.add.graphics();
    g.fillStyle(0x0c0c18, 0.82).fillRoundedRect(-w / 2, -h - 2, w, h, 4);
    g.lineStyle(1, 0x7a8ab0, 0.9).strokeRoundedRect(-w / 2, -h - 2, w, h, 4);
    g.fillStyle(0x0c0c18, 0.82).fillTriangle(-4, -2, 4, -2, 0, 4);
    bubble = scene.add.container(0, 0, [g, name, t]).setDepth(DEPTH.foreground + 20).setAlpha(0);
    scene.tweens.add({ targets: bubble, alpha: 1, duration: 160 });
    bubbleLeft = ms / 1000;
    placeBubble();
  };

  const placeBubble = () => {
    if (!bubble || !sprite) return;
    // Que no se salga de la pantalla a lo ancho.
    const cam = scene.cameras.main;
    const half = (bubble.getBounds().width || M.bubbleWidth) / 2;
    const x = Phaser.Math.Clamp(sprite.x, cam.worldView.x + half + 4, cam.worldView.right - half - 4);
    bubble.setPosition(Math.round(x), Math.round(me.y - HEAD_H - 6));
  };

  bus.scoped(scene, 'maria:say', ({ text, ms }) => {
    if (!GameState.hasMaria) return;
    showBubble(text, ms ?? M.sayMs);
  });

  /* ----------------------------- Lamento ----------------------------- */

  const targetable = (e: EnemyApi): boolean => {
    if (!e.alive || e.exhausted || e.purified) return false;
    if (!lunaVisible(e)) return false;
    if (M.immuneKinds.includes(e.kind)) return false;
    // No rompe el sigilo: a los encapuchados que aún no ven al jugador no los toca.
    const aware = (e as unknown as { isAware?: boolean }).isAware;
    if (aware === false) return false;
    return true;
  };

  const shouldLament = (): boolean => {
    const p = world.player;
    if (p.controlsLocked && !GameState.casting) return false;
    for (const e of world.enemies) {
      if (!targetable(e)) continue;
      if (planeDist(e.x, e.y, me.x, me.y) <= M.triggerRange && planeDist(e.x, e.y, p.x, p.y) <= M.playerRange) return true;
    }
    return false;
  };

  /** Motas azul pálido que suben y se apagan (el eco del lamento). */
  const motes = (x: number, y: number, depth: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const m = scene.add
        .image(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 6), GLOW)
        .setTint(i % 2 ? M.color : M.colorCore)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.25)
        .setDepth(depth);
      scene.tweens.add({
        targets: m,
        x: m.x + Phaser.Math.Between(-18, 18),
        y: m.y - Phaser.Math.Between(16, 34),
        alpha: 0,
        scale: 0.05,
        duration: Phaser.Math.Between(500, 850),
        onComplete: () => m.destroy(),
      });
    }
  };

  const releaseLament = () => {
    const x = me.x;
    const y = me.y;
    sfx('maria_lamento');
    // Onda: anillos en el plano del suelo (elipse ry = rx / 2), azul pálido.
    const r = M.radiusStun;
    const rings = reduceFx() ? 1 : 2;
    for (let i = 0; i < rings; i++) {
      const ring = scene.add
        .ellipse(x, y, r * 2, r, 0x000000, 0)
        .setStrokeStyle(i === 0 ? 2 : 1, i === 0 ? M.color : M.colorCore, reduceFx() ? 0.5 : 0.9)
        .setDepth(y - 1)
        .setScale(0.08);
      scene.tweens.add({
        targets: ring,
        scale: 1,
        alpha: 0,
        delay: i * 110,
        duration: M.ringMs,
        ease: 'Sine.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
    if (!reduceFx()) {
      const glow = scene.add.image(x, y - HEAD_H * 0.55, GLOW).setTint(M.colorCore).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 1).setScale(1);
      scene.tweens.add({ targets: glow, scale: 4, alpha: 0, duration: M.ringMs, onComplete: () => glow.destroy() });
      motes(x, y - HEAD_H * 0.6, y + 1, 10);
    }
    // Aturde sin daño.
    for (const e of [...world.enemies]) {
      if (!targetable(e)) continue;
      if (planeDist(e.x, e.y, x, y) > r + e.radius) continue;
      const boss = M.bossKinds.includes(e.kind);
      const ok = e.takeHit({ damage: 0, stun: boss ? M.bossStun : M.stun, kind: 'shockwave', sourceX: x, knockback: 0 });
      if (ok && !reduceFx()) motes(e.x, e.y - e.height * 0.8, e.y + 1, 4);
    }
    bus.emit('maria:assist', { kind: 'lamento', x, y });
  };

  /** ¿Hay enemigos atacables cerca del jugador? (para no hablar en combate). */
  const shouldLamentNearby = (): boolean => {
    const p = world.player;
    for (const e of world.enemies) {
      if (targetable(e) && planeDist(e.x, e.y, p.x, p.y) <= M.playerRange) return true;
    }
    return false;
  };

  /* ------------------------------ Update ----------------------------- */

  const onUpdate = (_t: number, deltaMs: number) => {
    if (!sprite || !shadow || transforming) return;
    const realDt = Math.min(deltaMs / 1000, 0.05);
    const dt = realDt * world.timeScale;
    time += dt;
    const p = world.player;

    // Seguir (se queda quieta mientras canta el lamento).
    const t = behind();
    const dx = t.x - me.x;
    const dy = t.y - me.y;
    dist = Math.hypot(dx, dy * 2);
    if (dist > M.teleportDist) {
      const pt = world.randomPointNear(t.x, t.y, 20);
      me.x = pt.x;
      me.y = pt.y;
      moving = false;
    } else if (windup <= 0 && dist > 10) {
      const sp = (dist > 70 ? M.catchUpSpeed : M.speed) * dt;
      const k = Math.min(1, sp / dist);
      world.moveActor(me, dx * k, dy * k);
      if (Math.abs(dx) > 2) facing = dx > 0 ? 1 : -1;
      moving = true;
    } else {
      moving = false;
      if (windup <= 0) facing = p.x >= me.x ? 1 : -1;
    }
    current = { x: me.x, y: me.y };

    // Lamento.
    if (windup > 0) {
      windup -= dt;
      if (windup <= 0) {
        releaseLament();
        cd = M.cooldown;
      }
    } else if (cd > 0) {
      cd -= dt;
    } else if (shouldLament()) {
      windup = M.windup;
      // Mira hacia el enemigo más cercano.
      let best: EnemyApi | null = null;
      let bd = Infinity;
      for (const e of world.enemies) {
        if (!targetable(e)) continue;
        const d = planeDist(e.x, e.y, me.x, me.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (best) facing = best.x >= me.x ? 1 : -1;
    }
    status.casting = windup > 0;
    status.charge = windup > 0 ? 1 : Phaser.Math.Clamp(1 - cd / M.cooldown, 0, 1);

    // Dibujo.
    const sway = !kit && moving ? Math.abs(Math.sin(time * 9)) * 1.5 : 0;
    sprite.setPosition(Math.round(me.x), Math.round(me.y - sway)).setDepth(me.y);
    if (kit) {
      kit.setAnim(windup > 0 ? 'maria_invocar' : moving ? (dist > 70 ? 'maria_correr' : 'maria_caminar') : 'maria_reposo');
      kit.apply(facing, time);
    } else {
      sprite.setFlipX(facing < 0);
      // Respiración / temblor al cantar (placeholder sin animación).
      const k = windup > 0 ? 1 + Math.sin(time * 30) * 0.015 : 1 + Math.sin(time * 2.2) * 0.012;
      sprite.setScale(1, k);
    }
    shadow.setPosition(Math.round(me.x), Math.round(me.y)).setDepth(DEPTH.shadow + me.y * 0.0001);
    if (aura) {
      const target = windup > 0 ? (reduceFx() ? 0.35 : 0.6 + 0.2 * Math.sin(time * 20)) : 0;
      aura.setAlpha(aura.alpha + (target - aura.alpha) * Math.min(1, realDt * 10));
      aura.setPosition(sprite.x, me.y - HEAD_H * 0.55).setDepth(me.y - 0.5);
    }

    // Globo.
    if (bubble) {
      bubbleLeft -= realDt;
      if (bubbleLeft <= 0) hideBubble();
      else placeBubble();
    }

    // Frases propias en reposo (máx. 1 por minuto), nunca en combate ni en diálogos.
    const calm = !moving && windup <= 0 && !p.controlsLocked && !GameState.casting && !shouldLamentNearby();
    idleT = calm ? idleT + dt : 0;
    if (
      calm &&
      !bubble &&
      M.idlePhrases.length > 0 &&
      idleT >= M.idleSaySec &&
      time >= M.idleFirstSec &&
      time - lastSayAt >= M.idleSayMinSec
    ) {
      let i = Math.floor(Math.random() * M.idlePhrases.length);
      if (i === lastPhrase && M.idlePhrases.length > 1) i = (i + 1) % M.idlePhrases.length;
      lastPhrase = i;
      mariaSay(M.idlePhrases[i]);
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    sprite?.destroy();
    shadow?.destroy();
    aura?.destroy();
    bubble?.destroy();
    sprite = null;
    shadow = null;
    aura = null;
    bubble = null;
    current = null;
    spawnHook = null;
    transformHook = null;
    status.visible = false;
    status.casting = false;
  });
}
