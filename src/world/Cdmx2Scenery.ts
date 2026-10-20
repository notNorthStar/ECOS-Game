import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { CDMX2_SECTIONS, DEPTH, GAME_HEIGHT, GAME_WIDTH, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { canvasTexture, fogTexture, glowTexture } from './textures';
import {
  CABIN, cdmx2Lamps, cdmx2LayerSize, cdmx2Screens, cdmx2Vitrales, cdmx2Windows, drawCdmx2Layer,
  type Cdmx2Section, type Lamp,
} from './Cdmx2Landscape';
import { CDMX2_ART, drawCdmx2Art } from './Cdmx2Art';

export { CDMX2_LANDMARKS, CABIN } from './Cdmx2Landscape';

// Dueño: escenario (Nivel 7). LevelScene lo llama para teleferico / torre / salon_trono.
// Fondos PNG a 1× (tools/gen-cdmx2-scenery.mjs); el mismo dibujo sirve de respaldo por código.
// Efectos: tormenta (lluvia tras los vidrios, gotas en el vidrio, relámpagos), y por sección:
//  - teleferico: la ciudad se hunde con el avance (setCableCarProgress / 'cablecar:progress'),
//    torres que pasan, otras cabinas, estación superior al final, balanceo, asideros, puertas.
//  - torre: pantallas con estática que parpadean, lluvia que entra por los ventanales rotos.
//  - salon_trono: niebla, brillo de vitrales, goteras y ondas en el agua del suelo.
// Respeta GameState.settings.reduceFx (sin destellos fuertes ni balanceo) y world.timeScale.

/** Claves de props del Nivel 7 (clave = nombre del PNG en escenarios/nivel-07-cdmx2/props/). */
export const CDMX2_PROP_KEYS = {
  // Teleférico (puerta, asidero, cabina lejana, torre, estación y rayo los usa este decorado)
  puertaCabina: 'prop_n07_puerta_cabina', asidero: 'prop_n07_asidero', cabinaLejana: 'prop_n07_cabina_lejana',
  torreCable: 'prop_n07_torre_cable', estacionSuperior: 'prop_n07_estacion_superior', rayo: 'prop_n07_rayo',
  bancaCabina: 'prop_n07_banca_cabina', extintor: 'prop_n07_extintor', maletas: 'prop_n07_maletas',
  // Torre de control
  consola: 'prop_n07_consola', consolaRota: 'prop_n07_consola_rota', monitor: 'prop_n07_monitor_estatica',
  rack: 'prop_n07_rack', silla: 'prop_n07_silla', cablesSuelo: 'prop_n07_cables_suelo', charco: 'prop_n07_charco',
  estatica: 'prop_n07_estatica',
  // Salón del trono
  trono: 'prop_n07_trono', columna: 'prop_n07_columna', braseroAzul: 'prop_n07_brasero_azul',
  vitralRoto: 'prop_n07_vitral_roto', consolaLlamada: 'prop_n07_consola_llamada', onda: 'prop_n07_onda',
} as const;

/** NPCs comunes de la torre (tiras 64×80 × 4 cuadros, pivote 32,78; anim = misma clave). */
export const CDMX2_NPC_KEYS = {
  /** Técnica con overol, diadema con micrófono y tableta encendida. */
  tecnica: 'npc_tecnico_1',
  /** Operador mayor con casco amarillo, chaleco reflejante y linterna. */
  operador: 'npc_tecnico_2',
} as const;

/** Luz automática de props del nivel (por clave de textura). */
const PROP_GLOW: Record<string, { dy: number; tint: number; scale: number; alpha: number; flicker: number }> = {
  prop_n07_consola: { dy: -50, tint: 0x2ad0c0, scale: 0.9, alpha: 0.22, flicker: 1.5 },
  prop_n07_consola_rota: { dy: -44, tint: 0xffd77a, scale: 0.8, alpha: 0.26, flicker: 9 },
  prop_n07_monitor_estatica: { dy: -62, tint: 0x9aa0bc, scale: 0.7, alpha: 0.22, flicker: 8 },
  prop_n07_rack: { dy: -50, tint: 0x8aff6a, scale: 0.6, alpha: 0.12, flicker: 3 },
  prop_n07_brasero_azul: { dy: -40, tint: 0x2ad0c0, scale: 1.1, alpha: 0.4, flicker: 5 },
  prop_n07_trono: { dy: -130, tint: 0x9a3ae0, scale: 1.2, alpha: 0.3, flicker: 0.8 },
  prop_n07_consola_llamada: { dy: -58, tint: 0xffd77a, scale: 0.9, alpha: 0.26, flicker: 2 },
  prop_n07_extintor: { dy: -14, tint: 0xc02030, scale: 0.25, alpha: 0.1, flicker: 0.2 },
};

const hex = (c: string): number => parseInt(c.slice(1), 16);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/* ============================ API DEL TELEFÉRICO ============================ */

let cableTarget = 0;
let cableShown = 0;
let doorApi: ((side: 'izq' | 'der' | 'ambas', open: boolean, autoCloseMs: number) => void) | null = null;

/**
 * Avance del teleférico (0 = sale de la estación base, 1 = llega a la estación superior). El fondo se
 * desplaza suave hacia ese valor. También se puede emitir `bus.emit('cablecar:progress', { progress })`.
 */
export function setCableCarProgress(p: number): void {
  cableTarget = clamp01(Number.isFinite(p) ? p : 0);
}

/** Avance que se ve en pantalla (ya suavizado). */
export function getCableCarProgress(): number {
  return cableShown;
}

/**
 * Abre o cierra las puertas laterales de la cabina (por donde abordan los encapuchados).
 * `autoCloseMs` > 0 las vuelve a cerrar solas. Sin efecto fuera del teleférico.
 */
export function openCabinDoor(side: 'izq' | 'der' | 'ambas', open = true, autoCloseMs = 0): void {
  doorApi?.(side, open, autoCloseMs);
}

/* ============================== TEXTURAS ============================== */

/** Registra por código cualquier textura del catálogo que falte en el manifiesto (respaldo). */
export function ensureCdmx2Textures(scene: Phaser.Scene): void {
  for (const spec of CDMX2_ART) {
    if (scene.textures.exists(spec.key)) continue;
    const tex = canvasTexture(scene, spec.key, spec.w * spec.frames, spec.h, ctx => {
      for (let f = 0; f < spec.frames; f++) drawCdmx2Art(spec, f).blit(ctx, f * spec.w, 0);
    });
    const t = scene.textures.get(tex);
    for (let f = 0; f < spec.frames; f++) t.add(f, 0, f * spec.w, 0, spec.w, spec.h);
    if (spec.frames > 1 && !scene.anims.exists(spec.key)) {
      scene.anims.create({ key: spec.key, frames: scene.anims.generateFrameNumbers(spec.key, { start: 0, end: spec.frames - 1 }), frameRate: spec.fps ?? 4, repeat: -1 });
    }
  }
}

/** Coloca un NPC común (técnicos) con pivote en los pies, profundidad = y y animación de reposo. */
export function addCdmx2Npc(world: WorldApi, key: string, x: number, y: number, opts: { id?: string; flipX?: boolean } = {}): Phaser.GameObjects.Sprite {
  const { scene } = world;
  ensureCdmx2Textures(scene);
  const spec = CDMX2_ART.find(s => s.key === key);
  const s = scene.add.sprite(x, y, key).setOrigin(0.5, spec ? spec.feetY / spec.h : 78 / 80).setDepth(y);
  if (opts.flipX) s.setFlipX(true);
  if (opts.id) s.setName(opts.id);
  if (scene.anims.exists(key)) s.play({ key, randomFrame: true });
  return s;
}

const frameCount = (scene: Phaser.Scene, key: string): number => Math.max(1, scene.textures.get(key).frameTotal - 1);

/* ============================== INSTALACIÓN ============================== */

export function installCdmx2Scenery(world: WorldApi): void {
  const { scene, level } = world;
  const section = (CDMX2_SECTIONS as readonly string[]).includes(level.id) ? level.id as Cdmx2Section : 'teleferico';
  ensureCdmx2Textures(scene);

  // Capas: las del manifiesto (equipo o PNG propios) mandan; si faltan, se dibujan por código.
  for (const child of [...scene.children.list]) {
    const image = child as typeof child & { texture?: { key: string } };
    if (image.texture?.key.startsWith('__mundo_capa')) child.destroy();
  }
  const layers: Array<Phaser.GameObjects.Image | null> = [];
  PARALLAX_FACTORS.forEach((factor, index) => {
    const key = `${level.background}_capa${index}`;
    if (scene.textures.exists(key)) {
      const found = scene.children.list.find(c => c instanceof Phaser.GameObjects.Image && c.texture.key === key) as Phaser.GameObjects.Image | undefined;
      layers.push(found ?? null);
      return;
    }
    const { w, h } = cdmx2LayerSize(section, index, level.width);
    const tex = canvasTexture(scene, `__cdmx2_${section}_capa${index}_${w}x${h}`, w, h, ctx => drawCdmx2Layer(section, index, w, h).blit(ctx));
    layers.push(scene.add.image(0, 0, tex).setOrigin(0).setScrollFactor(factor, 0)
      .setDepth(index < 4 ? DEPTH.background + index : index === 4 ? DEPTH.ground : DEPTH.foreground));
  });

  const glow = glowTexture(scene);
  const px = scene.textures.exists('px') ? 'px' : canvasTexture(scene, '__cdmx2_px', 1, 1, ctx => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1, 1); });
  const rnd = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const reduced = () => GameState.settings.reduceFx;
  const updaters: Array<(dt: number, t: number) => void> = [];

  /* ---------- Halos que laten (lámparas pintadas y props) ---------- */
  interface Pulse { img: Phaser.GameObjects.Image; base: number; ph: number; flicker: number; kind?: Lamp['kind']; boost?: number }
  const pulses: Pulse[] = [];
  const addGlow = (x: number, y: number, tint: number, scale: number, alpha: number, depth: number, flicker: number, ph: number): Pulse => {
    const img = scene.add.image(x, y, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale).setAlpha(alpha).setDepth(depth);
    const p = { img, base: alpha, ph, flicker };
    pulses.push(p);
    return p;
  };
  cdmx2Lamps(section).forEach((l, i) => {
    if (l.kind === 'vitral') return; // los vitrales tienen su propio brillo (salón)
    const p = addGlow(l.x, l.y + 4, hex(l.tint), l.kind === 'techo' ? 0.9 : 0.5, l.kind === 'techo' ? 0.22 : 0.3, DEPTH.ground + 4, l.kind === 'alerta' ? 2 : 0.6, rnd(i) * 7);
    p.kind = l.kind;
    if (l.kind === 'techo') p.img.setScale(1.4, 0.6);
  });

  // Props del nivel: luz, NPCs con pivote correcto y animaciones con la escala de tiempo del mundo.
  const animated: Phaser.GameObjects.Sprite[] = [];
  for (const child of [...scene.children.list]) {
    if (!(child instanceof Phaser.GameObjects.Sprite)) continue;
    const key = child.texture?.key;
    if (!key) continue;
    if (key.startsWith('npc_tecnico_')) child.setOrigin(0.5, 78 / 80);
    if ((key.startsWith('prop_n07_') || key.startsWith('npc_tecnico_')) && scene.anims.exists(key) && !child.anims.isPlaying) child.play({ key, randomFrame: true });
    if (child.anims.isPlaying) animated.push(child);
    const g = PROP_GLOW[key];
    if (g) {
      addGlow(child.x, child.y + g.dy * child.scaleY, g.tint, g.scale * child.scaleX, g.alpha, child.depth + 0.5, g.flicker, rnd(child.x) * 7);
      const pool = addGlow(child.x, child.y, g.tint, g.scale, g.alpha * 0.5, DEPTH.ground + 20, g.flicker, rnd(child.x + 1) * 7);
      pool.img.setScale(g.scale * 2.2 * child.scaleX, g.scale * 0.5 * child.scaleY);
    }
  }

  /* ---------- Tormenta: lluvia detrás de los vidrios ---------- */
  const rain: Array<{ img: Phaser.GameObjects.Image; x: number; y: number; v: number }> = [];
  const rainCount = section === 'salon_trono' ? 50 : 110;
  for (let i = 0; i < rainCount; i++) {
    const img = scene.add.image(0, 0, px).setScrollFactor(0).setDepth(DEPTH.background + 3.8)
      .setTint(i % 3 ? 0x77a08a : 0x9aa0bc).setAlpha(0.35 + rnd(i + 3) * 0.35).setScale(1, 4 + Math.round(rnd(i + 4) * 4)).setRotation(0.18);
    rain.push({ img, x: rnd(i + 5) * (GAME_WIDTH + 80), y: rnd(i + 6) * GAME_HEIGHT, v: 300 + rnd(i + 7) * 160 });
  }
  updaters.push(dt => {
    for (const r of rain) {
      r.y += r.v * dt; r.x -= r.v * 0.18 * dt;
      if (r.y > GAME_HEIGHT + 8) { r.y = -8; r.x = rnd(r.x + r.v) * (GAME_WIDTH + 80); }
      if (r.x < -10) r.x += GAME_WIDTH + 80;
      r.img.setPosition(Math.round(r.x), Math.round(r.y));
    }
  });

  // Gotas pegadas al vidrio que resbalan a tirones (ventanas intactas).
  const panes = cdmx2Windows(section);
  const drops: Array<{ img: Phaser.GameObjects.Image; pane: { x0: number; y0: number; x1: number; y1: number }; x: number; y: number; wait: number; v: number }> = [];
  panes.filter(p => !p.broken && section !== 'salon_trono').forEach((pane, pi) => {
    for (let k = 0; k < 7; k++) {
      const img = scene.add.image(0, 0, px).setDepth(DEPTH.ground + 1).setTint(0x9aa0bc).setAlpha(0.75).setScale(1, 2);
      drops.push({ img, pane, x: pane.x0 + 3 + rnd(pi * 9 + k) * (pane.x1 - pane.x0 - 6), y: pane.y0 + rnd(pi * 9 + k + 50) * (pane.y1 - pane.y0), wait: rnd(k + pi) * 2, v: 0 });
    }
  });
  updaters.push(dt => {
    for (const d of drops) {
      if (d.wait > 0) { d.wait -= dt; d.v = 0; } else { d.v = Math.min(70, d.v + dt * 200); d.y += d.v * dt; if (rnd(d.y + d.x) > 0.985) d.wait = 0.2 + rnd(d.x * d.y) * 1.2; }
      if (d.y > d.pane.y1 - 2) { d.y = d.pane.y0 + 2 + rnd(d.x + d.y) * 30; d.x = d.pane.x0 + 3 + rnd(d.y * 3 + d.x) * (d.pane.x1 - d.pane.x0 - 6); d.wait = rnd(d.x) * 2; }
      d.img.setPosition(Math.round(d.x), Math.round(d.y)).setScale(1, d.v > 20 ? 4 : 2);
    }
  });

  /* ---------- Relámpagos ---------- */
  const skyFlash = scene.add.image(0, 0, px).setOrigin(0).setScrollFactor(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
    .setDepth(DEPTH.background + 0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xd89aff).setAlpha(0);
  const roomFlash = scene.add.image(0, 0, px).setOrigin(0).setScrollFactor(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
    .setDepth(DEPTH.fx - 1).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9aa0bc).setAlpha(0);
  const bolt = scene.add.image(0, 0, 'prop_n07_rayo', 0).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH.background + 1.5).setAlpha(0);
  const boltFrames = frameCount(scene, 'prop_n07_rayo');
  let nextStrike = 2 + rnd(9) * 4, strikeT = -1;
  /** 0..1: cuánto ilumina el relámpago en este instante (vitrales, pantallas). */
  let flashK = 0;
  updaters.push((dt, t) => {
    nextStrike -= dt;
    if (nextStrike <= 0) {
      nextStrike = 5 + rnd(t * 3.1) * 9;
      strikeT = 0;
      bolt.setFrame(Math.floor(rnd(t * 7.7) * boltFrames) % boltFrames).setPosition(60 + rnd(t * 5.3) * 520, rnd(t) * 30).setScale(0.9 + rnd(t * 2) * 0.5).setFlipX(rnd(t * 9) > 0.5);
      if (rnd(t * 4.1) > 0.45) sfx('relampago');
    }
    if (strikeT < 0) { flashK = 0; skyFlash.setAlpha(0); roomFlash.setAlpha(0); bolt.setAlpha(0); return; }
    strikeT += dt;
    if (reduced()) {
      // Sin destellos: un resplandor tenue y lento, sin rayo parpadeante.
      flashK = Math.max(0, Math.sin(Math.min(1, strikeT / 1.2) * Math.PI)) * 0.25;
      skyFlash.setAlpha(flashK * 0.3); roomFlash.setAlpha(0); bolt.setAlpha(0);
    } else {
      // Doble destello: 0–0.12 s, apagón breve, 0.2–0.5 s y desvanecido.
      const k = strikeT < 0.12 ? 1 : strikeT < 0.2 ? 0.15 : strikeT < 0.6 ? 1 - (strikeT - 0.2) / 0.4 * 0.7 : Math.max(0, 0.3 - (strikeT - 0.6) * 0.6);
      flashK = k;
      skyFlash.setAlpha(k * 0.45); roomFlash.setAlpha(k * 0.07); bolt.setAlpha(strikeT < 0.5 ? Math.min(1, k + 0.2) : 0);
    }
    if (strikeT > 1.6) strikeT = -1;
  });

  /* ---------- Por sección ---------- */
  if (section === 'teleferico') installTeleferico();
  else if (section === 'torre') installTorre();
  else installSalon();

  function installTeleferico(): void {
    cableTarget = 0; cableShown = 0;
    bus.scoped(scene, 'cablecar:progress', ({ progress }) => setCableCarProgress(progress));

    // Cable de regreso (paralelo al nuestro: no se mueve con el avance) y cabinas que bajan por él.
    const cable = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.background + 3.3);
    const cA = { x: -40, y: 168 }, cB = { x: GAME_WIDTH + 40, y: 36 };
    const cabins = [0, 0.5].map((s, i) => ({ img: scene.add.image(0, 0, 'prop_n07_cabina_lejana', 0).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH.background + 3.31), s, ph: i }));
    const cabLights = cabins.map(() => scene.add.image(0, 0, glow).setScrollFactor(0).setDepth(DEPTH.background + 3.32).setBlendMode(Phaser.BlendModes.ADD).setTint(0xf2a640).setScale(0.35).setAlpha(0.35));

    // Torres de la línea que pasan junto a la cabina (p ≈ 0.28 y 0.62).
    const pylons = [0.28, 0.62].map(at => ({ at, img: scene.add.image(0, 0, 'prop_n07_torre_cable').setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH.background + 3.5).setVisible(false) }));
    const beacon = scene.add.image(0, 0, glow).setScrollFactor(0).setDepth(DEPTH.background + 3.51).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff5040).setScale(0.4).setVisible(false);
    // Estación superior: se acerca desde arriba a la derecha en el último tramo.
    const station = scene.add.sprite(0, 0, 'prop_n07_estacion_superior', 0).setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH.background + 3.6).setVisible(false);
    if (scene.anims.exists('prop_n07_estacion_superior')) station.play('prop_n07_estacion_superior');
    const stationGlow = scene.add.image(0, 0, glow).setScrollFactor(0).setDepth(DEPTH.background + 3.61).setBlendMode(Phaser.BlendModes.ADD).setTint(0xf2a640).setAlpha(0).setScale(2.4, 1);

    // Jirones de nube que pasan (sensación de movimiento aunque la cabina vaya lento).
    const fog = fogTexture(scene);
    const wisps = [0, 1, 2].map(i => ({ img: scene.add.image(0, 0, fog).setScrollFactor(0).setDepth(DEPTH.background + 3.4).setTint(0x4f7c6e).setAlpha(0.22).setScale(2.5, 1.6), x: rnd(i + 30) * 800, y: 40 + rnd(i + 31) * 140, v: 14 + rnd(i + 32) * 10 }));

    // Asideros que se mecen con el balanceo.
    const straps: Array<{ img: Phaser.GameObjects.Image; ph: number }> = [];
    for (let x = 128; x <= 672; x += 48) straps.push({ img: scene.add.image(x, CABIN.bar, 'prop_n07_asidero').setOrigin(0.5, 0).setDepth(DEPTH.ground + 2), ph: rnd(x) * 0.6 });

    // Puertas corredizas (hojas encima del hueco de la capa 4).
    const doors = CABIN.doors.map(d => ({ side: d.side, x0: d.x0, img: scene.add.image(d.x0, CABIN.doorTop, 'prop_n07_puerta_cabina').setOrigin(0, 0).setDepth(DEPTH.ground + 3), open: 0, target: 0, closeIn: 0 }));
    const doorLamps = pulses.filter(p => p.kind === 'alerta');
    doorApi = (side, open, autoCloseMs) => {
      for (const d of doors) if (side === 'ambas' || d.side === side) { d.target = open ? 1 : 0; d.closeIn = open && autoCloseMs > 0 ? autoCloseMs / 1000 : 0; }
    };

    const outside = layers.slice(0, 4);
    const baseW = PARALLAX_FACTORS.map(f => layerWidth(level.width, f));
    updaters.push((dt, t) => {
      const calm = reduced();
      cableShown += (cableTarget - cableShown) * Math.min(1, dt * 1.2);
      const p = cableShown;
      const sway = calm ? 0 : Math.sin(t * 0.8) * 1.6, bobY = calm ? 0 : Math.sin(t * 1.6) * 0.8;
      // Capas exteriores: suben/bajan con el avance y derivan a la izquierda.
      outside.forEach((img, i) => {
        if (!img) return;
        const rise = Math.max(0, img.height - GAME_HEIGHT), drift = Math.max(0, img.width - baseW[i]);
        img.setPosition(Math.round(-drift * p + sway * (i + 1) / 4), Math.round(-rise * (1 - p) + bobY * i / 3));
      });
      // Cable de regreso y cabinas.
      cable.clear();
      cable.lineStyle(1, 0x2e2c34, 1).lineBetween(cA.x + sway, cA.y + bobY, cB.x + sway, cB.y + bobY);
      cable.lineStyle(1, 0x1e1c24, 1).lineBetween(cA.x + sway, cA.y + 4 + bobY, cB.x + sway, cB.y + 4 + bobY);
      cabins.forEach((c, i) => {
        c.s = (c.s + dt * (calm ? 0.03 : 0.06)) % 1;
        const s = 1 - c.s, x = cA.x + (cB.x - cA.x) * s + sway, y = cA.y + (cB.y - cA.y) * s + bobY;
        c.img.setPosition(Math.round(x), Math.round(y)).setFrame(Math.floor(t * 2 + c.ph) % 2);
        cabLights[i].setPosition(x, y + 26);
      });
      // Torres que pasan.
      let beaconOn = false;
      for (const py of pylons) {
        const u = (p - py.at) / 0.14;
        py.img.setVisible(Math.abs(u) < 1);
        if (Math.abs(u) >= 1) continue;
        const x = 300 - u * 470 + sway, y = -14 + u * 70 + bobY;
        py.img.setPosition(Math.round(x), Math.round(y));
        beacon.setPosition(x, y + 4); beaconOn = true;
      }
      beacon.setVisible(beaconOn).setAlpha(calm ? 0.3 : 0.2 + 0.25 * Math.max(0, Math.sin(t * 4)));
      // Estación superior.
      const k = clamp01((p - 0.7) / 0.3), ek = k * k * (3 - 2 * k);
      station.setVisible(k > 0).setPosition(Math.round(860 - ek * 440 + sway), Math.round(-30 + ek * 230 + bobY)).setScale(0.7 + ek * 0.5);
      stationGlow.setPosition(station.x, station.y - 30).setAlpha(k > 0 ? 0.12 + ek * 0.15 : 0);
      // Nubes.
      for (const w of wisps) {
        w.x -= (w.v + (cableTarget - p) * 600) * dt; w.y += (w.v * 0.4) * dt;
        if (w.x < -300 || w.y > 260) { w.x = GAME_WIDTH + 250; w.y = 20 + rnd(t + w.v) * 120; }
        w.img.setPosition(Math.round(w.x), Math.round(w.y));
      }
      for (const s of straps) s.img.setRotation(calm ? 0 : Math.sin(t * 0.8 - 0.4 + s.ph) * 0.07 + sway * 0.01);
      // Puertas.
      let anyOpen = false;
      for (const d of doors) {
        if (d.closeIn > 0) { d.closeIn -= dt; if (d.closeIn <= 0) d.target = 0; }
        d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 2.2);
        d.img.setX(Math.round(d.x0 + (d.side === 'izq' ? -60 : 60) * d.open));
        if (d.open > 0.05) anyOpen = true;
      }
      for (const l of doorLamps) l.base = anyOpen ? 0.5 : 0.18;
    });
  }

  function installTorre(): void {
    // Pantallas: estática que corre, datos que laten, alertas rojas; a ratos se apagan.
    const stKey = 'prop_n07_estatica', stFrames = frameCount(scene, stKey);
    const screens = cdmx2Screens(section).map((s, i) => {
      const w = s.x1 - s.x0, h = s.y1 - s.y0;
      const img = scene.add.image(s.x0, s.y0, stKey, 0).setOrigin(0).setDisplaySize(w, h).setDepth(DEPTH.ground + 1);
      if (s.kind === 'alerta') img.setTint(0xff5040).setBlendMode(Phaser.BlendModes.ADD);
      if (s.kind === 'datos' || s.kind === 'mapa') img.setAlpha(0);
      const halo = scene.add.image((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ground + 2)
        .setTint(s.kind === 'alerta' ? 0xe8207e : s.kind === 'estatica' ? 0x9aa0bc : 0x2ad0c0).setScale(w / 40, h / 40).setAlpha(0.15);
      return { s, img, halo, ph: rnd(i) * 9, off: 0 };
    });
    // Lluvia que entra por los ventanales rotos (enfrente del muro) con salpicaduras.
    const leaks: Array<{ img: Phaser.GameObjects.Image; x0: number; x1: number; x: number; y: number; floor: number; v: number }> = [];
    panes.filter(p => p.broken).forEach((p, pi) => {
      for (let k = 0; k < 16; k++) {
        const img = scene.add.image(0, 0, px).setDepth(DEPTH.ground + 2).setTint(0x9aa0bc).setAlpha(0.6).setScale(1, 5).setRotation(0.18);
        leaks.push({ img, x0: p.x0, x1: p.x1, x: p.x0 + rnd(pi * 20 + k) * (p.x1 - p.x0), y: p.y0 + rnd(pi * 20 + k + 9) * 150, floor: 226 + rnd(k * 3 + pi) * 60, v: 260 + rnd(k + pi * 5) * 80 });
      }
    });
    const splashes = leaks.map(() => scene.add.image(0, 0, px).setDepth(DEPTH.ground + 3).setTint(0xc8dcd8).setScale(3, 1).setAlpha(0));
    updaters.push((dt, t) => {
      const calm = reduced();
      for (const sc of screens) {
        sc.off -= dt;
        if (!calm && sc.off <= 0 && rnd(t * 13 + sc.ph) > 0.996) sc.off = 0.1 + rnd(t + sc.ph) * 0.5; // se apaga un instante
        const dark = sc.off > 0;
        if (sc.s.kind === 'estatica') sc.img.setFrame(calm ? 0 : Math.floor(t * 14 + sc.ph * 3) % stFrames).setAlpha(dark ? 0 : 0.9);
        else if (sc.s.kind === 'alerta') sc.img.setFrame(Math.floor(t * 10 + sc.ph) % stFrames).setAlpha(dark ? 0 : calm ? 0.3 : 0.25 + 0.25 * (Math.sin(t * 5 + sc.ph) > 0 ? 1 : 0));
        else sc.img.setAlpha(dark ? 0.9 : 0).setTint(0x120e1a);
        sc.halo.setAlpha(dark ? 0 : 0.12 + (calm ? 0 : Math.sin(t * 3 + sc.ph) * 0.04) + flashK * 0.1);
      }
      leaks.forEach((l, i) => {
        l.y += l.v * dt; l.x -= l.v * 0.18 * dt;
        const sp = splashes[i];
        if (l.y >= l.floor) {
          sp.setPosition(Math.round(l.x), Math.round(l.floor)).setAlpha(calm ? 0 : 0.8);
          l.y = 40; l.x = l.x0 + rnd(l.x + t) * (l.x1 - l.x0); l.floor = 226 + rnd(l.y + t * 3) * 60;
        }
        sp.setAlpha(Math.max(0, sp.alpha - dt * 6));
        l.img.setPosition(Math.round(l.x), Math.round(l.y));
      });
    });
  }

  function installSalon(): void {
    // Brillo de los vitrales (respiran; el relámpago los enciende) y su reflejo en el agua.
    const vit = cdmx2Vitrales(section).map((v, i) => {
      const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, w = v.x1 - v.x0, h = v.y1 - v.y0;
      const a = scene.add.image(cx, cy, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(v.tint)).setScale(w / 34, h / 34).setAlpha(0.14).setDepth(DEPTH.ground + 4);
      const b = scene.add.image(cx, 262, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(v.tint)).setScale(w / 30, 1.2).setAlpha(0.08).setDepth(DEPTH.ground + 4);
      return { a, b, ph: rnd(i + 80) * 7 };
    });
    const mirror = cdmx2Lamps(section).find(l => l.kind === 'vitral' && l.tint === '#9a3ae0');
    const mirrorGlow = mirror ? scene.add.image(mirror.x, mirror.y, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0x5a1890).setScale(2.6).setAlpha(0.2).setDepth(DEPTH.ground + 4) : null;

    // Niebla baja en dos capas (morada al fondo, gris al frente).
    const fog = fogTexture(scene);
    const mistBack = scene.add.tileSprite(0, 262, GAME_WIDTH, 90, fog).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.ground + 6).setTint(0x5a1890).setTileScale(2, 1).setAlpha(0.2);
    const mistFront = scene.add.tileSprite(0, 336, GAME_WIDTH, 60, fog).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.foreground - 6).setTint(0x9aa0bc).setTileScale(2.4, 0.9).setAlpha(0.1);

    // Goteras por los huecos del techo y ondas en el agua del suelo.
    const ondaKey = 'prop_n07_onda', ondaFrames = frameCount(scene, ondaKey);
    const ripples = Array.from({ length: 10 }, () => ({ img: scene.add.image(0, 0, ondaKey, 0).setDepth(DEPTH.ground + 3).setVisible(false), life: -1 }));
    const ripple = (x: number, y: number) => {
      const r = ripples.find(q => q.life < 0);
      if (r) { r.life = 0; r.img.setPosition(Math.round(x), Math.round(y)).setVisible(true); }
    };
    const holes = panes;
    const drips = Array.from({ length: 12 }, (_, i) => ({ img: scene.add.image(0, 0, px).setDepth(DEPTH.ground + 2).setTint(0x8aa4a8).setScale(1, 3).setAlpha(0.7), x: 0, y: 999, floor: 0, v: 0, wait: rnd(i) * 3 }));
    let nextRipple = 0.5;
    updaters.push((dt, t) => {
      const calm = reduced();
      for (const v of vit) {
        const k = calm ? 0 : Math.sin(t * 0.7 + v.ph) * 0.05;
        v.a.setAlpha(0.14 + k + flashK * 0.25); v.b.setAlpha(0.07 + k * 0.5 + flashK * 0.12);
      }
      mirrorGlow?.setAlpha(0.18 + (calm ? 0 : Math.sin(t * 0.5) * 0.06));
      const camX = scene.cameras.main.scrollX;
      mistBack.tilePositionX = camX * 0.45 + (calm ? 0 : t * 4);
      mistFront.tilePositionX = camX * 0.7 - (calm ? 0 : t * 7);
      if (!calm) {
        for (const d of drips) {
          if (d.y > 900) {
            d.wait -= dt;
            if (d.wait <= 0 && holes.length) {
              const h = holes[Math.floor(rnd(t * 3 + d.v) * holes.length) % holes.length];
              d.x = h.x0 + rnd(t + d.wait) * (h.x1 - h.x0); d.y = 24; d.v = 0; d.floor = 228 + rnd(t * 5) * 100;
            }
            d.img.setVisible(false);
            continue;
          }
          d.v += 600 * dt; d.y += d.v * dt;
          d.img.setVisible(true).setPosition(Math.round(d.x), Math.round(d.y));
          if (d.y >= d.floor) { ripple(d.x, d.floor); d.y = 999; d.wait = 0.3 + rnd(d.x + t) * 2.5; }
        }
        nextRipple -= dt;
        if (nextRipple <= 0) { nextRipple = 0.6 + rnd(t * 2.3) * 1.4; ripple(camX + rnd(t * 1.7) * GAME_WIDTH, 228 + rnd(t * 4.9) * 110); }
      } else for (const d of drips) d.img.setVisible(false);
      for (const r of ripples) {
        if (r.life < 0) continue;
        r.life += dt;
        const f = Math.floor(r.life * 6);
        if (f >= ondaFrames) { r.life = -1; r.img.setVisible(false); continue; }
        r.img.setFrame(f).setAlpha(0.8 - f * 0.15);
      }
    });
  }

  /* ---------- Bucle ---------- */
  let t = 0;
  const update = (_time: number, delta: number) => {
    const dt = Math.min(delta, 50) / 1000 * world.timeScale;
    t += dt;
    const calm = reduced();
    for (const p of pulses) {
      if (calm) { p.img.setAlpha(p.base); continue; }
      let k = 1 + Math.sin(t * (1.2 + p.flicker) + p.ph) * 0.15 + (p.flicker > 3 ? Math.sin(t * 17 + p.ph * 3) * 0.12 : 0);
      if (p.kind === 'alerta') k = Math.sin(t * 5 + p.ph) > 0 ? 1.3 : 0.4;
      // Tubo que falla: se apaga a ratos.
      if (p.kind === 'techo' && p.ph > 6) { const cyc = (t * 0.4 + p.ph) % 5; if (cyc > 4.4) k = Math.sin(t * 50) > 0 ? 0.1 : 1; }
      p.img.setAlpha(Math.max(0, p.base * k + flashK * 0.05));
    }
    for (const s of animated) if (s.active && s.anims) s.anims.timeScale = world.timeScale;
    for (const u of updaters) u(dt, t);
  };
  update(0, 0);
  scene.events.on('update', update);
  scene.events.once('shutdown', () => {
    scene.events.off('update', update);
    doorApi = null;
  });
}
