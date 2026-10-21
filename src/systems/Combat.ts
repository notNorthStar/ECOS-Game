import Phaser from 'phaser';
import type { LaserMode, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { FX_DEPTH_BIAS, HEAT, LASER, SHIELD, SPELLS_FX } from '../config/combat';
import { FB, burst, ensureCombatTextures, playerShield, powerScale, spellParam } from '../entities/EnemyBase';
import { Espiritu } from '../entities/Espiritu';
import { NahualaCopia } from '../entities/Nahuala';
import { Tzitzimitl } from '../entities/Tzitzimitl';
import { LaserShot, laserTargets, type LaserTarget } from '../entities/LaserShot';
import { getProteccionHeal, installProgression } from './Progression';
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
    const itzpa = world.enemies.some((e) => e.kind === 'itzpapalotl');
    for (const e of [...world.enemies]) {
      if (!e.alive || e.purified) continue;
      if (mayor && e.kind === 'chaneque') {
        if (!e.exhausted) e.takeHit({ damage: 9999, stun: 0, kind: 'spell', sourceX: e.x, knockback: 0 });
        e.applySpell({ spellId: 'CALMA', outcome: 'partial', power: 1, auto: true, x: e.x, y: e.y, facing: 1 });
      } else if (e instanceof Espiritu && e.summonedBy?.kind === 'cabeza_olmeca') {
        e.dissipate();
      } else if (e instanceof NahualaCopia) {
        // Nivel 6: al liberar a la Nahuala sus copias ilusorias se desvanecen (y nada más).
        e.dissipate();
      } else if (itzpa && e instanceof Tzitzimitl) {
        // Nivel 10: al quebrarse Itzpapálotl, las Tzitzimime que queden se deshacen en luz (Ecos base).
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
      const heal = getProteccionHeal(); // 1, 2 o 3 según la mejora 'Protección' del Altar
      if (GameState.hp < GameState.maxHp && heal > 0) {
        GameState.hp = Math.min(GameState.maxHp, GameState.hp + heal);
        healFx(world);
        bus.emit('hud:toast', { text: heal > 1 ? `+${heal} de vida` : '+1 de vida', ms: 900 });
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
  if (ev.spellId === 'VERDAD') return verdadFx(world, ev);
  if (ev.spellId === 'FUEGO') return fuegoFx(world, ev);
  if (ev.spellId === 'DESCANSO') return descansoFx(world, ev);
  if (ev.spellId === 'ECOS') return ecosFx(world, ev);
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
  // El haz nace con su largo final y crece por escala: animar `width` no recalcula el origen y, mirando a la
  // izquierda (origen 1), el haz crecía hacia el lado equivocado.
  const ox = ev.facing > 0 ? 0 : 1;
  const beam = scene.add.rectangle(x0, yDraw, len, half * 1.6, s.color, 0.75).setOrigin(ox, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale(0.01, 1);
  const core = scene.add.rectangle(x0, yDraw, len, half * 0.5, 0xfff8d0, 1).setOrigin(ox, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 0.01).setScale(0.01, 1);
  const ground = scene.add.rectangle(x0, ev.y, len, half * 2, s.color, 0.2).setOrigin(ox, 0.5).setDepth(ev.y - FX_DEPTH_BIAS).setScale(0.01, 1);
  scene.tweens.add({ targets: [beam, core, ground], scaleX: 1, duration: 160, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: [beam, core, ground], alpha: 0, scaleY: 0.2, delay: 220, duration: 380, onComplete: () => [beam, core, ground].forEach((o) => o.destroy()) });
  const flare = scene.add.image(x0, yDraw, FB.glow).setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale(1.4);
  scene.tweens.add({ targets: flare, alpha: 0, scale: 2.6, duration: 300, onComplete: () => flare.destroy() });
  for (let i = 1; i <= 6; i++) {
    const px = x0 + ev.facing * (len * i) / 6;
    scene.time.delayedCall(i * 25, () => burst(scene, 'sun', px, yDraw, depth, 4));
  }
  world.shake(0.004, 120);
}

/* ======================= Nivel 6: VERDAD, FUEGO y DESCANSO ======================= */

/**
 * VERDAD: una onda de claridad que se expande y "rompe" como un espejo: grietas radiales en el suelo,
 * anillo frío y esquirlas de cristal que saltan y se desvanecen.
 */
function verdadFx(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
  const s = SPELLS_FX.VERDAD;
  const r = spellParam('VERDAD', 'revealRadius', s.revealRadius) * powerScale(ev.power);
  const cx = ev.x + ev.facing * s.forward;
  const cy = ev.y;
  const ring = scene.add.image(cx, cy, FB.ring).setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(ev.y - FX_DEPTH_BIAS).setDisplaySize(8, 4);
  scene.tweens.add({ targets: ring, displayWidth: r * 2, displayHeight: r, alpha: { from: 1, to: 0 }, duration: s.fxMs * 0.8, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  // Grietas de espejo: líneas quebradas desde el centro que crecen y luego se apagan.
  const g = scene.add.graphics().setDepth(ev.y - FX_DEPTH_BIAS).setBlendMode(Phaser.BlendModes.ADD);
  const cracks = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    const pts: Array<{ x: number; y: number }> = [];
    let d = 0;
    while (d < 1) {
      d = Math.min(1, d + 0.18 + Math.random() * 0.15);
      const wob = (Math.random() - 0.5) * 0.35;
      pts.push({ x: Math.cos(a + wob) * d, y: Math.sin(a + wob) * d * 0.5 });
    }
    return pts;
  });
  const anim = { k: 0 };
  const draw = () => {
    const grow = Math.min(1, anim.k / 0.45);
    const fade = anim.k < 0.55 ? 1 : 1 - (anim.k - 0.55) / 0.45;
    g.clear();
    g.lineStyle(1.5, s.color, 0.9 * fade);
    for (const c of cracks) {
      g.beginPath();
      g.moveTo(cx, cy);
      for (const p of c) {
        if (Math.hypot(p.x, p.y * 2) > grow) break;
        g.lineTo(cx + p.x * r, cy + p.y * r);
      }
      g.strokePath();
    }
    g.lineStyle(1, 0xffffff, 0.6 * fade);
    g.strokeEllipse(cx, cy, r * grow * 0.9, r * grow * 0.45);
  };
  draw();
  scene.tweens.add({ targets: anim, k: 1, duration: s.fxMs, onUpdate: draw, onComplete: () => g.destroy() });
  // Esquirlas de cristal que saltan.
  for (let i = 0; i < s.shards; i++) {
    const a = Math.random() * Math.PI * 2;
    const d0 = Math.random() * r * 0.3;
    const sh = scene.add.image(cx + Math.cos(a) * d0, cy - 20 + Math.sin(a) * d0 * 0.5, FB.px)
      .setTint(i % 3 ? s.color : 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6, 0.8).setAngle(Math.random() * 180).setDepth(ev.y + FX_DEPTH_BIAS);
    scene.tweens.add({
      targets: sh,
      x: sh.x + Math.cos(a) * r * 0.7,
      y: sh.y + Math.sin(a) * r * 0.35 - 10,
      angle: sh.angle + (Math.random() - 0.5) * 400,
      alpha: 0,
      duration: 450 + Math.random() * 350,
      ease: 'Quad.easeOut',
      onComplete: () => sh.destroy(),
    });
  }
  const glow = scene.add.image(cx, cy - 24, FB.glow).setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(ev.y + FX_DEPTH_BIAS).setScale(0.5);
  scene.tweens.add({ targets: glow, scale: (r / 16) * 0.7, alpha: { from: 0.8, to: 0 }, duration: 480, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
  world.flash(s.color, 110);
  sfx('verdad');
}

/** FUEGO: llamarada en línea (lengua de fuego que se extiende, núcleo amarillo, chispas y brasas). */
function fuegoFx(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
  const s = SPELLS_FX.FUEGO;
  const len = spellParam('FUEGO', 'length', s.length) * powerScale(ev.power);
  const half = spellParam('FUEGO', 'width', s.width);
  const x0 = ev.x + ev.facing * s.forward;
  const yDraw = ev.y - 22;
  const depth = ev.y + FX_DEPTH_BIAS;
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1);
    const px = x0 + ev.facing * len * k;
    scene.time.delayedCall(i * 18, () => {
      // Bola de fuego que crece, sube un poco y se apaga.
      const size = (0.9 + 0.6 * Math.sin(k * Math.PI)) * (half / 16);
      const outer = scene.add.image(px, yDraw + (Math.random() - 0.5) * 6, FB.glow).setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale(size * 1.4, size);
      const inner = scene.add.image(px, yDraw, FB.glow).setTint(0xffe070).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 0.01).setScale(size * 0.7, size * 0.5);
      scene.tweens.add({
        targets: [outer, inner],
        y: yDraw - 10 - Math.random() * 10,
        alpha: 0,
        scaleX: size * 0.4,
        duration: 380 + Math.random() * 160,
        ease: 'Quad.easeIn',
        onComplete: () => {
          outer.destroy();
          inner.destroy();
        },
      });
      burst(scene, 'sun', px, yDraw, depth, 3);
      if (i % 3 === 0) burst(scene, 'sparkRed', px, yDraw, depth, 3);
    });
  }
  // Franja de calor en el suelo.
  // Crece por escala (ver solFx): animar `width` con origen 1 la dibujaba hacia el lado contrario.
  const ground = scene.add.rectangle(x0, ev.y, len, half * 2, s.color, 0.22).setOrigin(ev.facing > 0 ? 0 : 1, 0.5).setDepth(ev.y - FX_DEPTH_BIAS).setScale(0.01, 1);
  scene.tweens.add({ targets: ground, scaleX: 1, duration: steps * 18, ease: 'Linear' });
  scene.tweens.add({ targets: ground, alpha: 0, delay: 360, duration: 420, onComplete: () => ground.destroy() });
  const flare = scene.add.image(x0, yDraw, FB.glow).setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale(1.2);
  scene.tweens.add({ targets: flare, alpha: 0, scale: 2.4, duration: 260, onComplete: () => flare.destroy() });
  world.shake(0.005, 140);
  sfx('fuego');
}

/** DESCANSO: pétalos de cempasúchil que caen girando en círculo y luces de vela que suben despacio. */
function descansoFx(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
  const s = SPELLS_FX.DESCANSO;
  const r = spellParam('DESCANSO', 'purifyRadius', s.purifyRadius) * powerScale(ev.power);
  const cx = ev.x + ev.facing * s.forward;
  const cy = ev.y;
  // Círculo de pétalos en el suelo (como el camino de flores de una ofrenda).
  const ring = scene.add.image(cx, cy, FB.ring).setTint(0xffa020).setBlendMode(Phaser.BlendModes.ADD).setDepth(cy - FX_DEPTH_BIAS).setDisplaySize(8, 4);
  scene.tweens.add({ targets: ring, displayWidth: r * 2, displayHeight: r, alpha: { from: 0.9, to: 0 }, duration: s.fxMs * 0.7, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
  for (let i = 0; i < s.petalCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r;
    const tx = cx + Math.cos(a) * d;
    const ty = cy + Math.sin(a) * d * 0.5;
    const col = s.petals[i % s.petals.length];
    const p = scene.add.image(tx + (Math.random() - 0.5) * 30, ty - 70 - Math.random() * 40, FB.px)
      .setTint(col).setScale(1.4, 1).setAngle(Math.random() * 180).setDepth(ty + FX_DEPTH_BIAS);
    scene.tweens.add({
      targets: p,
      x: tx,
      y: ty - 1,
      angle: p.angle + (Math.random() - 0.5) * 540,
      delay: Math.random() * 300,
      duration: 700 + Math.random() * 500,
      ease: 'Sine.easeIn',
      onComplete: () => scene.tweens.add({ targets: p, alpha: 0, delay: 500, duration: 500, onComplete: () => p.destroy() }),
    });
  }
  // Lucecitas de vela que suben.
  for (let i = 0; i < s.lights; i++) {
    const lx = cx + (Math.random() - 0.5) * r * 1.4;
    const ly = cy + (Math.random() - 0.5) * r * 0.5;
    const l = scene.add.image(lx, ly - 4, FB.glow).setTint(i % 2 ? 0xffe8a0 : 0xffc060).setBlendMode(Phaser.BlendModes.ADD).setScale(0.22).setDepth(ly + FX_DEPTH_BIAS).setAlpha(0);
    scene.tweens.add({
      targets: l,
      y: ly - 60 - Math.random() * 40,
      x: lx + (Math.random() - 0.5) * 16,
      alpha: { from: 0.95, to: 0 },
      delay: 150 + i * 70,
      duration: s.fxMs,
      ease: 'Sine.easeOut',
      onComplete: () => l.destroy(),
    });
  }
  const glow = scene.add.image(cx, cy - 10, FB.glow).setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setDepth(cy - FX_DEPTH_BIAS).setScale(r / 16, r / 32).setAlpha(0);
  scene.tweens.add({ targets: glow, alpha: { from: 0, to: 0.35 }, duration: 400, yoyo: true, hold: 300, onComplete: () => glow.destroy() });
  world.flash(0xffb040, 100);
  sfx('descanso');
}

/**
 * ECOS (Nivel 10): sobrecarga de la gema. Ondas concéntricas de sonido (anillos turquesa que se expanden)
 * y un destello en el pecho del jugador. Solo visual: el efecto lo decide cada enemigo (Itzpapálotl: núcleo).
 */
function ecosFx(world: WorldApi, ev: SpellOutcomeEvent): void {
  const scene = world.scene;
  const s = SPELLS_FX.ECOS;
  const r = s.radius * powerScale(ev.power);
  for (let i = 0; i < s.rings; i++) {
    const ring = scene.add.image(ev.x, ev.y, FB.ring).setTint(i % 2 ? 0xffffff : s.color)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(ev.y - FX_DEPTH_BIAS).setDisplaySize(8, 4).setAlpha(0);
    scene.tweens.add({ targets: ring, displayWidth: r * 2, displayHeight: r, alpha: { from: 1, to: 0 }, delay: i * 120, duration: s.fxMs, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }
  const glow = scene.add.image(ev.x, ev.y - 26, FB.glow).setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(ev.y + FX_DEPTH_BIAS).setScale(0.4);
  scene.tweens.add({ targets: glow, scale: 3, alpha: { from: 1, to: 0 }, duration: 500, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
  burst(scene, 'eco', ev.x, ev.y - 26, ev.y + FX_DEPTH_BIAS, 20);
  world.flash(s.color, 120);
  world.shake(0.004, 140);
}
