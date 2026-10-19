import Phaser from 'phaser';
import type { LaserMode, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { FX_DEPTH_BIAS, HEAT, LASER, SHIELD, SPELLS_FX } from '../config/combat';
import { FB, ensureCombatTextures, playerShield, powerScale, spellParam } from '../entities/EnemyBase';
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

  // Al calmar al Chaneque Mayor, sus chaneques se calman con él (quedan agotados y se purifican solos).
  bus.scoped(scene, 'boss:calmed', () => {
    for (const e of [...world.enemies]) {
      if (!e.alive || e.purified || e.kind !== 'chaneque') continue;
      if (!e.exhausted) e.takeHit({ damage: 9999, stun: 0, kind: 'spell', sourceX: e.x, knockback: 0 });
      e.applySpell({ spellId: 'CALMA', outcome: 'partial', power: 1, auto: true, x: e.x, y: e.y, facing: 1 });
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

/** Anillo que muestra el área del conjuro en el suelo. */
function spellRing(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
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
