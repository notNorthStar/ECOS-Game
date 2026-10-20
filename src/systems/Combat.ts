import Phaser from 'phaser';
import type { LaserMode, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { FX_DEPTH_BIAS, HEAT, LASER, SHIELD, SPELLS_FX } from '../config/combat';
import { FB, burst, ensureCombatTextures, playerShield, powerScale, spellParam } from '../entities/EnemyBase';
import { Espiritu } from '../entities/Espiritu';
import { LaserShot, laserTargets, type LaserTarget } from '../entities/LaserShot';
import { installProgression } from './Progression';
import { hideBossBar, showPrompt } from '../scenes/HudScene';

/**
 * Combate (dueño: combate). LevelScene llama installCombat(world) en create().
 * - Láser: 'player:shoot-request' → disparo horizontal (verde aturde, rojo daña × damageMult()),
 *   calor [PROPUESTA] en GameState.laserHeat / laserOverheated; emite 'player:shot'.
 * - Modo del láser con 1 / 2 (GameState.laserMode), si el jugador ya tiene la pistola.
 * - Conjuros: 'spell:resolved' → applySpell() de cada enemigo vivo (+ anillo visual del área).
 * - Ecos y orbes: systems/Progression.ts.
 */

export type { LaserTarget };

/** Registra un blanco no-enemigo para el láser (p. ej. la antena). Devuelve la función para quitarlo. */
export function addLaserTarget(t: LaserTarget): () => void {
  laserTargets.add(t);
  return () => laserTargets.delete(t);
}

export function installCombat(world: WorldApi): void {
  const scene = world.scene;
  ensureCombatTextures(scene);
  installProgression(world);

  const shots: LaserShot[] = [];
  let cooldown = 0;
  let sinceShot = 99;
  let lockLeft = 0;
  let toldOverheat = false;
  let bubble: Phaser.GameObjects.Image | null = null;
  playerShield.until = 0;
  GameState.laserOverheated = false;
  GameState.laserHeat = 0;

  const setMode = (m: LaserMode) => {
    if (GameState.laserMode === m) return;
    GameState.laserMode = m;
    sfx('ui_mover');
  };

  bus.scoped(scene, 'player:shoot-request', ({ x, y, z, facing }) => {
    if (!GameState.hasLaser || GameState.casting) return;
    if (GameState.laserOverheated) {
      if (!toldOverheat) {
        toldOverheat = true;
        sfx('sobrecalentado');
      }
      return;
    }
    if (cooldown > 0) return;
    const mode = GameState.laserMode;
    cooldown = LASER.cooldown[mode];
    sinceShot = 0;
    // Player ya manda la boca del cañón: x adelantada (SHOOT.muzzleX) y z = altura del cañón (SHOOT.muzzleZ).
    const sx = x;
    const h = z;
    shots.push(new LaserShot(world, sx, y, h, facing, mode));
    GameState.laserHeat = Math.min(1, GameState.laserHeat + HEAT.perShot[mode]);
    if (GameState.laserHeat >= 1) {
      GameState.laserOverheated = true;
      lockLeft = HEAT.lockTime;
      toldOverheat = false;
      sfx('sobrecalentado');
      bus.emit('hud:toast', { text: 'Láser sobrecalentado', ms: 1200 });
    }
    sfx(mode === 'green' ? 'disparo_verde' : 'disparo_rojo');
    bus.emit('player:shot', { mode });
  });

  // Al calmar a un jefe se calman SUS esbirros (y solo los suyos; el jefe sigue en el mundo al emitirse):
  // - Chaneque Mayor → sus chaneques quedan agotados y se purifican solos.
  // - Cabeza Olmeca → los espíritus que invocó se disipan.
  bus.scoped(scene, 'boss:calmed', () => {
    const mayor = world.enemies.some((e) => e.kind === 'chaneque_mayor');
    for (const e of [...world.enemies]) {
      if (!e.alive || e.purified) continue;
      if (mayor && e.kind === 'chaneque') {
        if (!e.exhausted) e.takeHit({ damage: 9999, stun: 0, kind: 'spell', sourceX: e.x, knockback: 0 });
        e.applySpell({ spellId: 'CALMA', outcome: 'partial', power: 1, auto: true, x: e.x, y: e.y, facing: 1 });
      } else if (e instanceof Espiritu && e.summonedBy?.kind === 'cabeza_olmeca') {
        e.dissipate();
      }
    }
  });

  bus.scoped(scene, 'spell:resolved', (ev: SpellOutcomeEvent) => {
    if (ev.outcome !== 'fail') spellRing(world, ev);
    // PROTECCION: escudo pasivo breve (spells.json effect.shieldMs / shieldReduction).
    if (ev.outcome !== 'fail' && ev.spellId === 'PROTECCION') {
      const ms = spellParam('PROTECCION', 'shieldMs', SHIELD.ms) * powerScale(ev.power);
      playerShield.until = performance.now() + ms;
      playerShield.reduction = spellParam('PROTECCION', 'shieldReduction', SHIELD.reduction);
      playerShield.debt = 0;
      // Cada PROTECCION (no fallida, también en automático) devuelve corazones (decisión del equipo, 2026-10-19).
      const heal = spellParam('PROTECCION', 'heal', 1);
      if (GameState.hp < GameState.maxHp && heal > 0) {
        GameState.hp = Math.min(GameState.maxHp, GameState.hp + heal);
        healFx(world);
        bus.emit('hud:toast', { text: '+1 corazón', ms: 900 });
      }
    }
    // Copia: applySpell puede invocar enemigos o sacarlos del mundo.
    for (const e of [...world.enemies]) {
      if (!e.alive) continue;
      e.applySpell(ev);
    }
  });

  const onUpdate = (_t: number, deltaMs: number) => {
    const real = Math.min(0.05, deltaMs / 1000);
    const dt = real * world.timeScale;

    if (GameState.hasLaser) {
      if (keys.justPressed('laserGreen')) setMode('green');
      if (keys.justPressed('laserRed')) setMode('red');
    }

    cooldown -= dt;
    sinceShot += dt;
    if (GameState.laserOverheated) {
      lockLeft -= dt;
      GameState.laserHeat = Math.max(0, GameState.laserHeat - HEAT.overheatedCoolRate * dt);
      if (lockLeft <= 0 && GameState.laserHeat <= HEAT.resumeAt) GameState.laserOverheated = false;
    } else if (sinceShot > HEAT.coolDelay) {
      GameState.laserHeat = Math.max(0, GameState.laserHeat - HEAT.coolRate * dt);
    }

    // Burbuja del escudo pasivo.
    const shieldOn = performance.now() < playerShield.until;
    if (shieldOn) {
      const p = world.player;
      if (!bubble) {
        bubble = scene.add.image(p.x, p.y, FB.glow).setTint(SHIELD.color).setBlendMode(Phaser.BlendModes.ADD);
      }
      const left = (playerShield.until - performance.now()) / 1000;
      const blink = left < 0.8 ? (Math.floor(left * 10) % 2 ? 0.15 : 0.5) : 0.45 + 0.1 * Math.sin(performance.now() / 120);
      bubble.setPosition(p.x, p.y - p.z - p.height * 0.5).setDisplaySize(p.radius * 4.2, p.height * 1.3).setAlpha(blink).setDepth(p.y + FX_DEPTH_BIAS);
    } else if (bubble) {
      bubble.destroy();
      bubble = null;
    }

    for (let i = shots.length - 1; i >= 0; i--) {
      shots[i].update(dt);
      if (shots[i].done) shots.splice(i, 1);
    }
  };
  scene.events.on('update', onUpdate);
  const cleanup = () => {
    scene.events.off('update', onUpdate);
    shots.forEach((s) => s.destroy());
    shots.length = 0;
    laserTargets.clear();
    hideBossBar();
    showPrompt(null);
  };
  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);
}

/** Destello dorado que sube por el jugador al recuperar vida. */
function healFx(world: WorldApi): void {
  const scene = world.scene;
  const p = world.player;
  sfx('mejora');
  for (let i = 0; i < 8; i++) {
    const s = scene.add
      .image(p.x + (Math.random() - 0.5) * 20, p.y - p.z - 6, FB.glow)
      .setTint(0xff7a9a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.35)
      .setDepth(p.y + FX_DEPTH_BIAS);
    scene.tweens.add({ targets: s, y: s.y - 30 - Math.random() * 20, alpha: 0, duration: 650 + i * 40, onComplete: () => s.destroy() });
  }
}

/** Anillo que muestra el área del conjuro en el suelo. */
function spellRing(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
  if (ev.spellId === 'LUZ') return luzFx(world, ev);
  if (ev.spellId === 'SOL') return solFx(world, ev);
  if (ev.spellId === 'MEMORIA') return memoriaFx(world, ev);
  if (ev.spellId === 'VOZ') {
    const radius = spellParam('VOZ', 'stunRadius', SPELLS_FX.VOZ.stunRadius) * powerScale(ev.power);
    const wave = scene.add.image(ev.x, ev.y, FB.ring).setTint(0xf2c86b)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(ev.y - FX_DEPTH_BIAS).setDisplaySize(8, 4);
    scene.tweens.add({ targets: wave, displayWidth: radius * 2, displayHeight: radius,
      alpha: { from: 1, to: 0 }, duration: 700, onComplete: () => wave.destroy() });
    return;
  }
  const isCalma = ev.spellId === 'CALMA';
  const cfg = isCalma ? SPELLS_FX.CALMA : SPELLS_FX.PROTECCION;
  if (!isCalma && ev.spellId !== 'PROTECCION') return;
  const r = spellParam(ev.spellId, 'purifyRadius', cfg.purifyRadius) * powerScale(ev.power);
  const cx = ev.x + ev.facing * cfg.forward;
  const color = isCalma ? 0x9affc0 : 0x9ad8ff;
  const ring = scene.add
    .image(cx, ev.y, FB.ring)
    .setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(ev.y - FX_DEPTH_BIAS)
    .setDisplaySize(8, 4);
  scene.tweens.add({
    targets: ring,
    displayWidth: r * 2,
    displayHeight: r,
    alpha: { from: 1, to: 0 },
    duration: 650,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/** LUZ: destello blanco-dorado en radio alrededor del jugador (anillo en el suelo + resplandor + chispas). */
function luzFx(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
  const s = SPELLS_FX.LUZ;
  const r = spellParam('LUZ', 'purifyRadius', s.purifyRadius) * powerScale(ev.power);
  const cx = ev.x + ev.facing * s.forward;
  const ring = scene.add.image(cx, ev.y, FB.ring).setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(ev.y - FX_DEPTH_BIAS).setDisplaySize(8, 4);
  scene.tweens.add({ targets: ring, displayWidth: r * 2, displayHeight: r, alpha: { from: 1, to: 0 }, duration: 600, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  const glow = scene.add.image(cx, ev.y - 24, FB.glow).setTint(0xfff8e0).setBlendMode(Phaser.BlendModes.ADD).setDepth(ev.y + FX_DEPTH_BIAS).setScale(0.6);
  scene.tweens.add({ targets: glow, scale: (r / 16) * 0.9, alpha: { from: 0.95, to: 0 }, duration: 520, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
  burst(scene, 'light', cx, ev.y - 24, ev.y + FX_DEPTH_BIAS, 22);
  world.flash(s.color, 120);
}

/**
 * MEMORIA (Nivel 4): "los tejidos guardan la memoria". Hilos de colores que salen del jugador y se tejen
 * en rombos concéntricos (patrón de grecas/rombos de los textiles oaxaqueños) mientras se expanden por el suelo.
 */
function memoriaFx(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
  const s = SPELLS_FX.MEMORIA;
  const r = spellParam('MEMORIA', 'purifyRadius', s.purifyRadius) * powerScale(ev.power);
  const cx = ev.x + ev.facing * s.forward;
  const cy = ev.y;
  const cols = s.colors;
  const g = scene.add.graphics().setDepth(ev.y - FX_DEPTH_BIAS);
  const lift = scene.add.graphics().setDepth(ev.y + FX_DEPTH_BIAS).setBlendMode(Phaser.BlendModes.ADD);
  const phase = Math.random() * Math.PI;
  const anim = { k: 0 };
  const draw = () => {
    const k = anim.k;
    const grow = Math.min(1, k / 0.6);
    const R = r * (1 - Math.pow(1 - grow, 3));
    const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    g.clear();
    lift.clear();
    // Hilos radiales en zigzag (como la urdimbre), cada uno de un color de la paleta.
    for (let i = 0; i < s.threads; i++) {
      const a = phase + (i / s.threads) * Math.PI * 2;
      const c = cols[i % cols.length];
      g.lineStyle(1.5, c, 0.85 * fade);
      g.beginPath();
      g.moveTo(cx, cy);
      const steps = 6;
      for (let j = 1; j <= steps; j++) {
        const d = (R * j) / steps;
        const zig = (j % 2 ? 1 : -1) * 3;
        const px = cx + Math.cos(a) * d - Math.sin(a) * zig;
        const py = cy + (Math.sin(a) * d + Math.cos(a) * zig) * 0.5;
        g.lineTo(px, py);
      }
      g.strokePath();
    }
    // Rombos concéntricos (trama) con pequeños escalones de greca en las puntas.
    for (let j = 1; j <= s.rings; j++) {
      const rr = (R * j) / s.rings;
      const c = cols[(j + 1) % cols.length];
      g.lineStyle(2, c, 0.75 * fade);
      g.strokePoints([
        new Phaser.Math.Vector2(cx - rr, cy),
        new Phaser.Math.Vector2(cx, cy - rr * 0.5),
        new Phaser.Math.Vector2(cx + rr, cy),
        new Phaser.Math.Vector2(cx, cy + rr * 0.5),
      ], true);
      const st = 4 + j;
      g.fillStyle(c, 0.6 * fade);
      g.fillRect(cx - rr - st / 2, cy - 1, st, 2).fillRect(cx + rr - st / 2, cy - 1, st, 2);
    }
    // Brillo del tejido que se levanta un poco del suelo.
    lift.fillStyle(0xfff0e0, 0.18 * fade).fillEllipse(cx, cy - 6, R * 1.2, R * 0.35);
  };
  draw();
  scene.tweens.add({
    targets: anim,
    k: 1,
    duration: s.fxMs,
    ease: 'Linear',
    onUpdate: draw,
    onComplete: () => {
      g.destroy();
      lift.destroy();
    },
  });
  // Motas de colores que suben (la memoria que regresa).
  for (let i = 0; i < 5; i++) {
    scene.time.delayedCall(i * 70, () => burst(scene, 'calm', cx + (Math.random() - 0.5) * r, cy - 10, ev.y + FX_DEPTH_BIAS, 3));
  }
  world.flash(0xf0c0ff, 110);
  sfx('memoria');
}

/** SOL: ráfaga en línea hacia donde mira el jugador (haz que crece, núcleo blanco y partículas a lo largo). */
function solFx(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
  const s = SPELLS_FX.SOL;
  const len = spellParam('SOL', 'length', s.length) * powerScale(ev.power);
  const half = spellParam('SOL', 'width', s.width);
  const x0 = ev.x + ev.facing * s.forward;
  const yDraw = ev.y - 24;
  const depth = ev.y + FX_DEPTH_BIAS;
  const beam = scene.add.rectangle(x0, yDraw, 4, half * 1.6, s.color, 0.75).setOrigin(ev.facing > 0 ? 0 : 1, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
  const core = scene.add.rectangle(x0, yDraw, 4, half * 0.5, 0xfff8d0, 1).setOrigin(ev.facing > 0 ? 0 : 1, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 0.01);
  const ground = scene.add.rectangle(x0, ev.y, 4, half * 2, s.color, 0.2).setOrigin(ev.facing > 0 ? 0 : 1, 0.5).setDepth(ev.y - FX_DEPTH_BIAS);
  scene.tweens.add({ targets: [beam, core, ground], width: len, duration: 160, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: [beam, core, ground], alpha: 0, scaleY: 0.2, delay: 220, duration: 380, onComplete: () => [beam, core, ground].forEach((o) => o.destroy()) });
  const flare = scene.add.image(x0, yDraw, FB.glow).setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale(1.4);
  scene.tweens.add({ targets: flare, alpha: 0, scale: 2.6, duration: 300, onComplete: () => flare.destroy() });
  for (let i = 1; i <= 6; i++) {
    const px = x0 + ev.facing * (len * i) / 6;
    scene.time.delayedCall(i * 25, () => burst(scene, 'sun', px, yDraw, depth, 4));
  }
  world.shake(0.004, 120);
}
