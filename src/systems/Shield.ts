import Phaser from 'phaser';
import type { EnemyApi, Hit, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH_TOLERANCE } from '../config/game';
import { keys, SHIELD_ON_RIGHT_CLICK } from '../config/controls';
import { SHIELD as S } from '../config/abilities';
import { HoldDetector } from '../lsm';
import { lsm } from './Lsm';
import { isCasting } from './Casting';

/**
 * Dueño: sistemas (Nivel 3). ESCUDO U (GDD §6.5). LevelScene llama installShield(world) en todas las secciones;
 * no hace nada mientras GameState.shield.unlocked sea false.
 *
 *  - Con cámara: la seña U sostenida (HoldDetector, holdMs 150) con lsm.setMode('shield') (~12 Hz) mientras no
 *    se deletrea; durante conjuros/rueda/aprendizaje el detector queda suspendido (la U aparece en LUZ).
 *  - Sin cámara (o además): CLIC DERECHO mantenido (SHIELD_ON_RIGHT_CLICK) y las teclas de CONTROLS.shield.
 *  - Efecto: reduce el daño (SHIELD.reduction), repele a quien golpea cuerpo a cuerpo y emite 'shield:block'
 *    (los enemigos que lo soporten devuelven su proyectil). El jugador se mueve normal; no dispara (Player) ni
 *    lanza conjuros (Casting).
 *  - Barra GameState.shield.energy: se gasta activa y con cada golpe; se recarga sola; en 0 se rompe (broken)
 *    unos segundos. Bloqueo perfecto: levantado hace < perfectWindowMs → sin gasto, absorbe todo y aturde.
 *  - Emite 'shield:state' {active, energy, broken} y sfx escudo_on / escudo_off / escudo_golpe / escudo_roto.
 */

/* ------------------------------ estado del módulo ------------------------------ */

const rt = {
  world: null as WorldApi | null,
  /** Fracciones de daño acumuladas (la vida va en segmentos enteros). */
  debt: 0,
  activeSince: 0,
  lastBlockAt: -1e9,
  /** Vibración de la burbuja (s). */
  shakeT: 0,
  brokenT: 0,
  idleT: 0,
  /** Opacidad visible de la burbuja (0..1), con transición. */
  vis: 0,
  lastEmitEnergy: -1,
  fx: null as null | ((x: number, y: number, n: number, color: number, spread: number) => void),
};

/** ¿El escudo está levantado ahora? (Player no dispara y Casting no lanza mientras esté activo.) */
export function isShieldActive(): boolean {
  return GameState.shield.unlocked && GameState.shield.active;
}

function emitState(): void {
  const s = GameState.shield;
  rt.lastEmitEnergy = s.energy;
  bus.emit('shield:state', { active: s.active, energy: s.energy, broken: s.broken });
}

function breakShield(world: WorldApi): void {
  const s = GameState.shield;
  s.active = false;
  s.broken = true;
  s.energy = 0;
  rt.brokenT = S.brokenSec;
  rt.idleT = 0;
  rt.shakeT = 0;
  sfx('escudo_roto');
  world.shake(0.006, 160);
  const p = world.player;
  rt.fx?.(p.x, p.y - p.z - S.bubbleLift, 16, S.color, S.bubbleRx * 1.6);
  emitState();
}

function spend(world: WorldApi, amount: number): void {
  const s = GameState.shield;
  s.energy = Math.max(0, s.energy - amount);
  if (s.energy <= 0 && !s.broken) breakShield(world);
}

/** Busca al enemigo que lanzó un golpe cuerpo a cuerpo (x de origen exacta, cerca del jugador). */
function findAttacker(world: WorldApi, hit: Hit): EnemyApi | null {
  const p = world.player;
  let best: EnemyApi | null = null;
  let bestD = Infinity;
  for (const e of world.enemies) {
    if (!e.alive || e.exhausted || e.purified) continue;
    if (Math.abs(e.x - hit.sourceX) > 3) continue;
    const d = Math.hypot(e.x - p.x, (e.y - p.y) * 2);
    if (d < S.repelRange && d < bestD && Math.abs(e.y - p.y) < DEPTH_TOLERANCE * 4) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/**
 * Todo golpe de un enemigo al jugador pasa por aquí (EnemyBase.hitPlayer). Devuelve el golpe reducido,
 * o null si el escudo lo absorbió por completo. También gasta barra y puede repeler (emite 'shield:block').
 */
export function shieldFilterHit(world: WorldApi, hit: Hit): Hit | null {
  if (!isShieldActive() || hit.damage <= 0) return hit;
  const p = world.player;
  if (p.invulnerable || !p.alive) return hit;
  const now = performance.now();
  // Golpes continuos (ondas, rayos) llaman cada cuadro: el escudo los cuenta como uno solo.
  if (now - rt.lastBlockAt < 220) return null;
  rt.lastBlockAt = now;

  const perfect = now - rt.activeSince <= S.perfectWindowMs;
  const dir = Math.sign(p.x - hit.sourceX) || -p.facing;
  const cx = p.x - dir * S.bubbleRx * 0.8;
  const cy = p.y - p.z - S.bubbleLift;

  // Repeler: retroceso (y aturdimiento con bloqueo perfecto) al atacante cuerpo a cuerpo.
  if (hit.kind === 'melee') {
    const e = findAttacker(world, hit);
    e?.takeHit({
      damage: 0,
      stun: perfect ? S.perfectStun : 0,
      kind: 'melee',
      sourceX: p.x,
      knockback: S.repelKnockback * (perfect ? 1.5 : 1),
    });
  }
  bus.emit('shield:block', { x: cx, y: p.y });
  sfx('escudo_golpe');
  rt.shakeT = 0.28;
  rt.idleT = 0;
  rt.fx?.(cx, cy, perfect ? 12 : 6, perfect ? 0xffffff : S.colorEdge, 10);
  if (perfect) {
    world.hitstop(60);
    bus.emit('hud:toast', { text: '¡Bloqueo perfecto!', ms: 900 });
    emitState();
    return null;
  }

  spend(world, Math.max(S.minHitCost, hit.damage * S.hitCostPerDamage));
  emitState();
  rt.debt += hit.damage * (1 - S.reduction);
  const dmg = Math.floor(rt.debt + 1e-6);
  rt.debt -= dmg;
  if (dmg <= 0) return null;
  return { ...hit, damage: dmg, knockback: hit.knockback * S.playerKnockbackMult };
}

/** Desbloquea el escudo (lo llama el director con los brujos): barra llena y aviso con instrucciones. */
export function unlockShield(world: WorldApi): void {
  const s = GameState.shield;
  s.unlocked = true;
  s.energy = 1;
  s.broken = false;
  s.active = false;
  rt.brokenT = 0;
  emitState();
  sfx('escudo_on');
  if (!GameState.settings.reduceFx) world.flash(0x50e0b0, 180);
  bus.emit('hud:toast', {
    text: lsm.cameraReady
      ? 'Escudo: sostén la seña U frente a la cámara (o mantén clic derecho)'
      : 'Escudo: mantén CLIC DERECHO. Bloquea golpes, pero no disparas ni lanzas conjuros',
    ms: 4800,
  });
}

/* ------------------------------ instalación ------------------------------ */

const CRACKS: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  [[-0.2, -0.95], [-0.05, -0.6], [-0.25, -0.35], [-0.1, 0.0]],
  [[0.85, -0.3], [0.5, -0.2], [0.42, 0.15], [0.15, 0.25]],
  [[-0.9, 0.25], [-0.55, 0.3], [-0.45, 0.6]],
  [[0.3, 0.9], [0.25, 0.6], [0.45, 0.45]],
];

export function installShield(world: WorldApi): void {
  const scene = world.scene;
  rt.world = world;
  rt.debt = 0;
  rt.vis = 0;
  rt.shakeT = 0;
  rt.lastBlockAt = -1e9;
  const st = GameState.shield;
  st.active = false;
  // Al reiniciar la sección el escudo vuelve sano (la energía se conserva, con un mínimo).
  if (st.broken) {
    st.broken = false;
    st.energy = Math.max(st.energy, S.reactivateMin);
  }
  rt.brokenT = 0;

  const hold = new HoldDetector('U', { holdMs: S.holdMs, releaseMs: S.releaseMs });
  const bubble = scene.add.graphics().setVisible(false);

  // Chispas / esquirlas (rectangulitos con tween; sin texturas externas).
  rt.fx = (x, y, n, color, spread) => {
    const reduced = GameState.settings.reduceFx;
    const count = reduced ? Math.ceil(n / 2) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = spread + Math.random() * 22;
      const r = scene.add
        .rectangle(x, y, 2 + Math.round(Math.random() * 2), 2, color, 1)
        .setDepth(world.player.y + 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAngle(Math.random() * 90);
      scene.tweens.add({
        targets: r,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d * 0.8,
        alpha: 0,
        angle: r.angle + 120,
        duration: 260 + Math.random() * 260,
        onComplete: () => r.destroy(),
      });
    }
  };

  const draw = (t: number) => {
    const p = world.player;
    const g = bubble;
    g.clear();
    if (rt.vis <= 0.01) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const reduced = GameState.settings.reduceFx;
    const shake = rt.shakeT > 0 && !reduced ? (Math.random() - 0.5) * 3 * (rt.shakeT / 0.28) : 0;
    const cx = Math.round(p.x + shake);
    const cy = Math.round(p.y - p.z - S.bubbleLift);
    const breathe = reduced ? 0 : Math.sin(t * 5) * 1.2;
    const rx = S.bubbleRx + breathe + (rt.shakeT > 0 ? 2 : 0);
    const ry = S.bubbleRy + breathe;
    const v = rt.vis;
    const hitGlow = rt.shakeT > 0 ? rt.shakeT / 0.28 : 0;
    const low = st.energy < S.crackBelow;
    const col = low && Math.floor(t * 6) % 2 === 0 ? S.colorBroken : S.color;
    g.setDepth(p.y + 0.6);
    // Domo de energía con el estilo de la gema: relleno suave, borde brillante y facetas.
    g.fillStyle(col, (0.1 + 0.12 * hitGlow) * v).fillEllipse(cx, cy, rx * 2, ry * 2);
    g.fillStyle(0xffffff, 0.06 * v).fillEllipse(cx - rx * 0.35, cy - ry * 0.45, rx * 0.7, ry * 0.5);
    g.lineStyle(1, S.colorEdge, (0.35 + 0.4 * hitGlow) * v);
    g.strokeEllipse(cx, cy, rx * 1.6, ry * 1.6);
    g.lineStyle(1.5, hitGlow > 0 ? 0xffffff : S.colorEdge, (0.75 + 0.25 * hitGlow) * v);
    g.strokeEllipse(cx, cy, rx * 2, ry * 2);
    // Facetas en rombo (la gema) que giran despacio.
    const ph = reduced ? 0 : t * 0.8;
    g.lineStyle(1, S.colorEdge, 0.22 * v);
    for (let i = 0; i < 3; i++) {
      const a = ph + (i * Math.PI) / 3;
      const kx = Math.cos(a);
      g.lineBetween(cx + kx * rx * 0.95, cy - ry * 0.9, cx - kx * rx * 0.95, cy + ry * 0.9);
    }
    // Grietas con poca barra.
    if (low) {
      const k = Math.min(1, (S.crackBelow - st.energy) / S.crackBelow + 0.25);
      g.lineStyle(1, 0xffffff, 0.75 * k * v);
      for (const c of CRACKS) {
        for (let i = 1; i < c.length; i++) {
          g.lineBetween(cx + c[i - 1][0] * rx, cy + c[i - 1][1] * ry, cx + c[i][0] * rx, cy + c[i][1] * ry);
        }
      }
    }
  };

  let time = 0;
  const onUpdate = (_t: number, deltaMs: number) => {
    const realDt = Math.min(deltaMs / 1000, 0.05);
    time += realDt;
    if (!st.unlocked) {
      st.active = false;
      rt.vis = 0;
      bubble.setVisible(false);
      return;
    }
    const dt = realDt * world.timeScale;
    const now = performance.now();
    const p = world.player;
    const casting = isCasting();
    // Atado en el Nivel 10 (GameState.bound): sin escudo.
    const busy = casting || p.controlsLocked || keys.locked || !p.alive || GameState.bound;

    // Cámara: detección continua de la U a baja frecuencia (solo si nadie más usa el módulo).
    let camWant = false;
    hold.suspended = busy;
    if (lsm.cameraReady && !casting) {
      if (lsm.detectionMode === 'off') lsm.setMode('shield');
      if (lsm.detectionMode === 'shield') camWant = hold.update(lsm.read(now), now);
    } else hold.update({ letter: null, stableMs: 0 }, now);

    const mouseWant = SHIELD_ON_RIGHT_CLICK && scene.input.activePointer.rightButtonDown();
    const keyWant = keys.isDown('shield');

    // Roto: espera y recarga mínima.
    if (st.broken) {
      rt.brokenT -= realDt;
      if (rt.brokenT <= 0 && st.energy >= S.reactivateMin) {
        st.broken = false;
        emitState();
      }
    }

    const want = (camWant || mouseWant || keyWant) && !busy && !st.broken && st.energy > 0;
    if (want !== st.active) {
      st.active = want;
      if (want) {
        rt.activeSince = now;
        sfx('escudo_on');
      } else if (!st.broken) sfx('escudo_off');
      emitState();
    }

    // Energía.
    if (st.active) {
      rt.idleT = 0;
      spend(world, S.drainPerSec * dt);
    } else {
      rt.idleT += dt;
      if (rt.idleT >= S.regenDelay && st.energy < 1) st.energy = Math.min(1, st.energy + S.regenPerSec * dt);
    }
    if (Math.abs(st.energy - rt.lastEmitEnergy) >= 0.05 || (st.energy >= 1 && rt.lastEmitEnergy < 1)) emitState();

    // Visual.
    const target = st.active ? 1 : 0;
    rt.vis += (target - rt.vis) * Math.min(1, realDt * (st.active ? 18 : 10));
    if (rt.shakeT > 0) rt.shakeT = Math.max(0, rt.shakeT - realDt);
    draw(time);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  // En pausa no se gasta la cámara: se apaga la detección del escudo (se reanuda sola al volver).
  bus.scoped(scene, 'game:pause', ({ paused }) => {
    if (paused && lsm.detectionMode === 'shield') lsm.setMode('off');
    hold.reset();
  });

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    if (lsm.detectionMode === 'shield') lsm.setMode('off');
    st.active = false;
    rt.fx = null;
    if (rt.world === world) rt.world = null;
    bubble.destroy();
  });
}
