import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, GDL_SECTIONS, PARALLAX_FACTORS } from '../config/game';
import { canvasTexture, fogTexture, glowTexture } from './textures';
import {
  drawGdlAurora, drawGdlLayer, drawGdlRoofHole, gdlLamps, gdlLayerSize, gdlVitrales, type GdlSection,
} from './GdlLandscape';
import { GDL_ART, drawGdlArt } from './GdlArt';

export { GDL_LANDMARKS, GDL_EPILOGO_KEYS } from './GdlLandscape';

/**
 * Dueño: escenario (Nivel 10, Guadalajara). LevelScene lo llama para gdl_avenida, catedral y catedral_eclipse.
 * Fondos PNG a 1× (tools/gen-gdl-scenery.mjs); el mismo dibujo sirve de respaldo por código.
 * - Eclipse: escucha 'eclipse:progress' {progress} (o setEclipse(p), 0..1). El sol del fondo se tapa
 *   con el disco de la luna, aparece la corona, el cielo se oscurece y la luz ambiente se enfría.
 *   Al volver a 0 (final) regresa el sol y una luz dorada.
 * - gdl_avenida: sol + luna + corona, pétalos de jacaranda y ceniza, faroles que titilan, luz en la puerta.
 * - catedral: brillo de vitrales, haces de luz con polvo, velas; openCathedralRoof(ms) abre el techo
 *   (temblor, grietas, polvo, escombro que cae y el cielo del eclipse por el hueco).
 * - catedral_eclipse: corona del Gran Eclipse, aurora, estrellas que caen lento, haces de luz fría,
 *   chispas estelares que suben.
 * Respeta GameState.settings.reduceFx (sin destellos ni temblor, menos partículas) y world.timeScale.
 */

/** Claves de props del Nivel 10 (clave = nombre del PNG en escenarios/nivel-10-guadalajara/props/). */
export const GDL_PROP_KEYS = {
  // Avenida
  letras: 'prop_n10_letras_gdl', tranvia: 'prop_n10_tranvia', auto1: 'prop_n10_auto_1', auto2: 'prop_n10_auto_2',
  autobusVolcado: 'prop_n10_autobus_volcado', jacaranda: 'prop_n10_jacaranda', farol: 'prop_n10_farol',
  escombros: 'prop_n10_escombros', barricada: 'prop_n10_barricada', bandera: 'prop_n10_bandera',
  cartelDesaparecidos: 'prop_n10_cartel_desaparecidos', radioVieja: 'prop_n10_radio_vieja', puertaCatedral: 'prop_n10_puerta_catedral',
  // Catedral
  altarMayor: 'prop_n10_altar_mayor', cadenas: 'prop_n10_cadenas', cadenasRotas: 'prop_n10_cadenas_rotas',
  banca: 'prop_n10_banca', bancaRota: 'prop_n10_banca_rota', velas: 'prop_n10_velas', candelabro: 'prop_n10_candelabro',
  columna: 'prop_n10_columna', pulpito: 'prop_n10_pulpito', vitralRoto: 'prop_n10_vitral_roto', organo: 'prop_n10_organo',
  // Catedral con el eclipse
  escombrosTecho: 'prop_n10_escombros_techo',
} as const;

/** Texturas que solo usa este decorado (no van en el JSON del nivel). */
export const GDL_CODE_KEYS = GDL_ART.filter(s => s.code).map(s => s.key);

/** Luz automática de props del nivel (por clave de textura). */
const PROP_GLOW: Record<string, { dy: number; tint: number; scale: number; alpha: number; flicker: number }> = {
  prop_n10_farol: { dy: -88, tint: 0xf2a640, scale: 0.7, alpha: 0.3, flicker: 9 },
  prop_n10_velas: { dy: -14, tint: 0xf2a640, scale: 0.55, alpha: 0.35, flicker: 6 },
  prop_n10_candelabro: { dy: -62, tint: 0xffd77a, scale: 0.6, alpha: 0.32, flicker: 6 },
  prop_n10_altar_mayor: { dy: -86, tint: 0xffd77a, scale: 1.5, alpha: 0.3, flicker: 3 },
  prop_n10_puerta_catedral: { dy: -40, tint: 0xd0742c, scale: 0.9, alpha: 0.2, flicker: 2 },
  prop_n10_radio_vieja: { dy: -12, tint: 0xf2a640, scale: 0.2, alpha: 0.2, flicker: 4 },
  prop_n10_cartel_desaparecidos: { dy: -8, tint: 0xf2a640, scale: 0.4, alpha: 0.25, flicker: 6 },
};
/** Props que no se animan solos (el Director decide su cuadro). */
const NO_AUTOPLAY = new Set(['prop_n10_puerta_catedral', 'prop_n10_escombro']);

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (c: string): number => parseInt(c.slice(1), 16);
const lerpColor = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/* ============================ API DEL ECLIPSE ============================ */

/** Avance inicial del eclipse por sección (el Director lo ajusta con 'eclipse:progress'). */
const ECLIPSE_DEFAULT: Record<GdlSection, number> = { gdl_avenida: 0, catedral: 0.75, catedral_eclipse: 1 };
let eclipseTarget = 0;
let eclipseShown = 0;
let roofApi: ((ms: number) => Promise<void>) | null = null;

/**
 * Avance del eclipse (0 = sol de la tarde, 1 = Gran Eclipse total). El fondo se ajusta suave hacia
 * ese valor. Equivale a `bus.emit('eclipse:progress', { progress })`.
 */
export function setEclipse(p: number): void {
  eclipseTarget = clamp01(Number.isFinite(p) ? p : 0);
}

/** Avance del eclipse que se ve en pantalla (ya suavizado). */
export function getEclipse(): number {
  return eclipseShown;
}

/**
 * Abre el techo de la Catedral (escena de la emboscada en `catedral`): temblor, grietas, polvo,
 * escombro que cae y el cielo del Gran Eclipse por el hueco. Se resuelve al terminar (`ms`).
 * Fuera de `catedral` se resuelve de inmediato. La sección `catedral_eclipse` ya tiene el techo abierto.
 */
export function openCathedralRoof(ms = 4000): Promise<void> {
  return roofApi ? roofApi(Math.max(500, ms)) : Promise.resolve();
}

/* ============================== TEXTURAS ============================== */

/** Registra por código cualquier textura del catálogo que falte en el manifiesto (respaldo). */
export function ensureGdlTextures(scene: Phaser.Scene): void {
  for (const spec of GDL_ART) {
    if (scene.textures.exists(spec.key)) continue;
    const tex = canvasTexture(scene, spec.key, spec.w * spec.frames, spec.h, ctx => {
      for (let f = 0; f < spec.frames; f++) drawGdlArt(spec, f).blit(ctx, f * spec.w, 0);
    });
    const t = scene.textures.get(tex);
    for (let f = 0; f < spec.frames; f++) t.add(f, 0, f * spec.w, 0, spec.w, spec.h);
    if (spec.frames > 1 && !scene.anims.exists(spec.key)) {
      scene.anims.create({ key: spec.key, frames: scene.anims.generateFrameNumbers(spec.key, { start: 0, end: spec.frames - 1 }), frameRate: spec.fps ?? 4, repeat: -1 });
    }
  }
}

const frameCount = (scene: Phaser.Scene, key: string): number => Math.max(1, scene.textures.get(key).frameTotal - 1);

/* ============================== INSTALACIÓN ============================== */

export function installGdlScenery(world: WorldApi): void {
  const { scene, level } = world;
  const section = (GDL_SECTIONS as readonly string[]).includes(level.id) ? level.id as GdlSection : 'gdl_avenida';
  ensureGdlTextures(scene);

  // Capas: las del manifiesto (equipo o PNG propios) mandan; si faltan, se dibujan por código.
  for (const child of [...scene.children.list]) {
    const image = child as typeof child & { texture?: { key: string } };
    if (image.texture?.key.startsWith('__mundo_capa')) child.destroy();
  }
  PARALLAX_FACTORS.forEach((factor, index) => {
    if (scene.textures.exists(`${level.background}_capa${index}`)) return;
    const { w, h } = gdlLayerSize(section, index, level.width);
    const tex = canvasTexture(scene, `__gdl_${section}_capa${index}_${w}x${h}`, w, h, ctx => drawGdlLayer(section, index, w, h).blit(ctx));
    scene.add.image(0, 0, tex).setOrigin(0).setScrollFactor(factor, 0)
      .setDepth(index < 4 ? DEPTH.background + index : index === 4 ? DEPTH.ground : DEPTH.foreground);
  });

  const glow = glowTexture(scene);
  const px = scene.textures.exists('px') ? 'px' : canvasTexture(scene, '__gdl_px', 1, 1, ctx => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1, 1); });
  const rnd = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const reduced = () => GameState.settings.reduceFx;
  const updaters: Array<(dt: number, t: number, raw: number) => void> = [];
  const screen = (tint: number, depth: number, add = false) => scene.add.image(0, 0, px).setOrigin(0).setScrollFactor(0)
    .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(depth).setTint(tint).setAlpha(0).setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);

  /* ---------- Eclipse: estado ---------- */
  eclipseTarget = ECLIPSE_DEFAULT[section];
  eclipseShown = eclipseTarget;
  bus.scoped(scene, 'eclipse:progress', ({ progress }) => setEclipse(progress));

  /* ---------- Halos que laten (luces pintadas y props) ---------- */
  interface Pulse { img: Phaser.GameObjects.Image; base: number; ph: number; flicker: number; eclipseDim?: number }
  const pulses: Pulse[] = [];
  const addGlow = (x: number, y: number, tint: number, scale: number, alpha: number, depth: number, flicker: number, ph: number): Pulse => {
    const img = scene.add.image(x, y, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale).setAlpha(alpha).setDepth(depth);
    const p = { img, base: alpha, ph, flicker };
    pulses.push(p);
    return p;
  };
  gdlLamps(section).forEach((l, i) => {
    const big = l.kind === 'puerta' || l.kind === 'capilla';
    addGlow(l.x, l.y, hex(l.tint), big ? 1.3 : 0.35, big ? 0.28 : 0.3, DEPTH.ground + 4, l.kind === 'vela' ? 6 : 1.2, rnd(i) * 7);
  });

  // Props: luz automática y animaciones con la escala de tiempo del mundo.
  const animated: Phaser.GameObjects.Sprite[] = [];
  for (const child of [...scene.children.list]) {
    if (!(child instanceof Phaser.GameObjects.Sprite)) continue;
    const key = child.texture?.key;
    if (!key || !key.startsWith('prop_n10_')) continue;
    if (!NO_AUTOPLAY.has(key) && scene.anims.exists(key) && !child.anims.isPlaying) child.play({ key, randomFrame: true });
    if (child.anims.isPlaying) animated.push(child);
    const g = PROP_GLOW[key];
    if (g) {
      addGlow(child.x, child.y + g.dy * child.scaleY, g.tint, g.scale * child.scaleX, g.alpha, child.depth + 0.5, g.flicker, rnd(child.x) * 7);
      const pool = addGlow(child.x, child.y, g.tint, g.scale, g.alpha * 0.5, DEPTH.ground + 20, g.flicker, rnd(child.x + 1) * 7);
      pool.img.setScale(g.scale * 2.2 * child.scaleX, g.scale * 0.5 * child.scaleY);
    }
  }

  /* ---------- Luz ambiente (se enfría con el eclipse) ---------- */
  const cold = screen(0x0f1826, DEPTH.fx - 4);
  const warm = screen(0xf2a640, DEPTH.fx - 4.5, true);
  const icy = screen(0x128a8a, DEPTH.fx - 4.6, true);
  const ambient: Record<GdlSection, (p: number) => [number, number, number]> = {
    gdl_avenida: p => [p * 0.3, (1 - p) * 0.06, p * 0.02],
    catedral: p => [0.08 + p * 0.14, (1 - p) * 0.04, p * 0.025],
    catedral_eclipse: p => [p * 0.22, (1 - p) * 0.16, p * 0.045],
  };

  /* ---------- Sol, luna y corona (avenida y catedral con el eclipse) ---------- */
  let sky: ((p: number, t: number) => void) | null = null;
  if (section !== 'catedral') {
    const sun = section === 'gdl_avenida' ? { x: Math.round(gdlLayerSize(section, 0, level.width).w * 0.6), y: 60 } : { x: Math.round(gdlLayerSize(section, 0, level.width).w * 0.5), y: 74 };
    const sf = PARALLAX_FACTORS[0];
    const darken = screen(0x0a0f1a, DEPTH.background + 0.3);
    const dawn = screen(0xf2a640, DEPTH.background + 0.35, true);
    const halo = scene.add.image(sun.x, sun.y, glow).setScrollFactor(sf, 0).setDepth(DEPTH.background + 0.4).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a);
    const corona = scene.add.sprite(sun.x, sun.y, 'prop_n10_corona', 0).setScrollFactor(sf, 0).setDepth(DEPTH.background + 0.45).setBlendMode(Phaser.BlendModes.ADD);
    const sunImg = scene.add.image(sun.x, sun.y, 'prop_n10_sol').setScrollFactor(sf, 0).setDepth(DEPTH.background + 0.5);
    const moon = scene.add.image(sun.x, sun.y, 'prop_n10_luna_eclipse').setScrollFactor(sf, 0).setDepth(DEPTH.background + 0.55);
    const rim = scene.add.image(sun.x, sun.y, glow).setScrollFactor(sf, 0).setDepth(DEPTH.background + 0.56).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9af8e8).setScale(0.9);
    const coronaFrames = frameCount(scene, 'prop_n10_corona');
    // Rayos de la tarde (avenida): haces anchos que bajan desde el sol.
    const rays = section === 'gdl_avenida' ? [-0.5, 0, 0.45].map((r, i) => scene.add.image(sun.x, sun.y + 10, 'prop_n10_rayo_luz').setOrigin(0.3, 0).setScrollFactor(sf * 2, 0)
      .setDepth(DEPTH.background + 1.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xf2a640).setRotation(r).setScale(2.2 + i * 0.3, 1.4).setAlpha(0)) : [];
    sky = (p, t) => {
      const calm = reduced();
      darken.setAlpha(section === 'gdl_avenida' ? p * 0.62 : 0);
      dawn.setAlpha(section === 'catedral_eclipse' ? (1 - p) * 0.4 : 0);
      halo.setScale(3.6 - p * 1.6).setAlpha(0.06 + (1 - p) * 0.5);
      moon.setPosition(sun.x + (1 - p) * 46, sun.y - (1 - p) * 14).setAlpha(clamp01(p * 12));
      const full = smooth(0.78, 1, p);
      corona.setAlpha(full * 0.85).setRotation(calm ? 0 : t * 0.02).setFrame(calm ? 0 : Math.floor(t * 1.5) % coronaFrames);
      rim.setAlpha(full * (0.25 + (calm ? 0 : Math.sin(t * 2) * 0.06)));
      sunImg.setAlpha(1);
      rays.forEach((r, i) => r.setAlpha((1 - p) * (0.06 + (calm ? 0 : Math.sin(t * 0.4 + i) * 0.02))));
    };
  }

  /* ---------- Por sección ---------- */
  if (section === 'gdl_avenida') installAvenida();
  else if (section === 'catedral') installCatedral();
  else installEclipse();

  function installAvenida(): void {
    // Pétalos de jacaranda que caen y ceniza fina (pantalla).
    const n = reduced() ? 18 : 40;
    const tints = [0x9a3ae0, 0xd89aff, 0x5a1890, 0x9aa0bc];
    const bits = Array.from({ length: n }, (_, i) => ({
      img: scene.add.image(0, 0, px).setScrollFactor(0).setDepth(DEPTH.foreground - 2).setTint(tints[i % 4]).setScale(i % 4 === 3 ? 1 : 2, 1).setAlpha(0.8),
      x: rnd(i + 1) * GAME_WIDTH, y: rnd(i + 2) * GAME_HEIGHT, v: 14 + rnd(i + 3) * 18, ph: rnd(i + 4) * 7,
    }));
    updaters.push((dt, t) => {
      for (const b of bits) {
        b.y += b.v * dt; b.x += (Math.sin(t * 1.3 + b.ph) * 10 - 6) * dt;
        if (b.y > GAME_HEIGHT + 4) { b.y = -4; b.x = rnd(t + b.ph) * (GAME_WIDTH + 40); }
        if (b.x < -10) b.x += GAME_WIDTH + 20;
        b.img.setPosition(Math.round(b.x), Math.round(b.y)).setRotation(Math.sin(t * 3 + b.ph) * 0.8);
      }
    });
  }

  function installCatedral(): void {
    // Vitrales que brillan (más tenues y fríos mientras avanza el eclipse) y su luz sobre el piso.
    const vit = gdlVitrales('catedral').map((v, i) => {
      const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, w = v.x1 - v.x0, h = v.y1 - v.y0;
      const a = scene.add.image(cx, cy, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(v.tint)).setScale(w / 34, h / 34).setDepth(DEPTH.ground + 4);
      const shaft = v.motif === 'rosa' ? null : scene.add.image(cx - 8, v.y0 + 10, 'prop_n10_rayo_luz').setOrigin(0.3, 0).setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.ground + 5).setScale(v.motif === 'flor' ? 1 : 1.3, v.motif === 'flor' ? 1 : 1.1);
      return { a, shaft, tint: hex(v.tint), ph: rnd(i + 40) * 7 };
    });
    // Polvo que flota en los haces de luz (mundo).
    const motes = Array.from({ length: reduced() ? 24 : 60 }, (_, i) => ({
      img: scene.add.image(0, 0, px).setDepth(DEPTH.ground + 6).setTint(0xffd77a).setBlendMode(Phaser.BlendModes.ADD),
      x: 100 + rnd(i + 7) * (level.width - 200), y: 60 + rnd(i + 8) * 240, ph: rnd(i + 9) * 9,
    }));
    updaters.push((dt, t) => {
      const calm = reduced(), p = eclipseShown;
      for (const v of vit) {
        const k = calm ? 0 : Math.sin(t * 0.6 + v.ph) * 0.03;
        v.a.setAlpha((0.16 + k) * (1 - p * 0.5));
        v.shaft?.setTint(lerpColor(0xffd77a, 0x5a7aa8, p)).setAlpha((0.09 + k) * (1 - p * 0.55));
      }
      for (const m of motes) {
        m.y -= dt * 3; m.x += Math.sin(t * 0.5 + m.ph) * dt * 4;
        if (m.y < 50) m.y = 310;
        m.img.setPosition(Math.round(m.x), Math.round(m.y)).setAlpha(calm ? 0.25 : 0.2 + Math.sin(t * 2 + m.ph) * 0.2);
      }
    });
    installRoof();
  }

  /** Apertura del techo (solo en `catedral`). */
  function installRoof(): void {
    let pending: Array<() => void> = [];
    let running: { t: number; dur: number; hole: Phaser.GameObjects.Image; corona: Phaser.GameObjects.Image; moon: Phaser.GameObjects.Image; cx: number; nextDebris: number; nextShake: number; flashed: boolean } | null = null;
    const cracks = scene.add.graphics().setDepth(DEPTH.ground + 2.5);
    let crackLines: Array<Array<{ x: number; y: number }>> = [];
    const debris: Array<{ img: Phaser.GameObjects.Image; vx: number; vy: number; vr: number; floor: number; life: number }> = [];
    const falling: Array<{ img: Phaser.GameObjects.Image; x: number; y: number; v: number }> = [];
    const settle = scene.add.tileSprite(0, 290, GAME_WIDTH, 90, fogTexture(scene)).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.foreground - 5).setTint(0x8a857e).setAlpha(0);
    const finish = () => { const list = pending; pending = []; for (const r of list) r(); };

    roofApi = (ms) => new Promise<void>(resolve => {
      pending.push(resolve);
      if (running) return; // ya se está abriendo: se resuelve junto
      const cx = scene.cameras.main.scrollX + GAME_WIDTH / 2;
      const holeKey = canvasTexture(scene, '__gdl_roof_hole', GAME_WIDTH + 80, 160, ctx => drawGdlRoofHole(GAME_WIDTH + 80, 160).blit(ctx));
      const hole = scene.add.image(cx, 0, holeKey).setOrigin(0.5, 0).setDepth(DEPTH.ground + 3).setVisible(false);
      const corona = scene.add.image(cx, 62, 'prop_n10_corona', 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ground + 3.4).setAlpha(0).setScale(0.7);
      const moon = scene.add.image(cx, 62, 'prop_n10_luna_eclipse').setDepth(DEPTH.ground + 3.5).setAlpha(0).setScale(0.7);
      // Grietas: líneas quebradas que salen de la clave de la bóveda.
      crackLines = Array.from({ length: 8 }, (_, i) => {
        const pts = [{ x: cx + (rnd(i + 11) - 0.5) * 60, y: 6 + rnd(i + 12) * 20 }];
        const dir = (i % 2 ? 1 : -1) * (0.6 + rnd(i + 13) * 1.4);
        for (let s = 0; s < 9; s++) { const last = pts[pts.length - 1]; pts.push({ x: last.x + dir * (12 + rnd(i * 9 + s) * 18), y: Math.min(110, last.y + rnd(i * 7 + s) * 12 - 2) }); }
        return pts;
      });
      running = { t: 0, dur: ms / 1000, hole, corona, moon, cx, nextDebris: 0, nextShake: 0, flashed: false };
    });

    const spawnDebris = (cx: number, spread: number) => {
      const img = scene.add.image(cx + (Math.random() - 0.5) * spread, -10, 'prop_n10_escombro', Math.floor(Math.random() * frameCount(scene, 'prop_n10_escombro')))
        .setDepth(DEPTH.ground + 30).setScale(0.6 + Math.random() * 0.8);
      debris.push({ img, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 40, vr: (Math.random() - 0.5) * 6, floor: 230 + Math.random() * 100, life: 0 });
    };
    const spawnDust = (x: number) => {
      if (falling.length > 90) return;
      falling.push({ img: scene.add.image(x, 0, px).setDepth(DEPTH.ground + 29).setTint(0xb3ab9c).setAlpha(0.8).setScale(1, 2), x, y: 4 + Math.random() * 40, v: 20 + Math.random() * 40 });
    };

    updaters.push((_dt, _t, raw) => {
      // Escombro y polvo siguen aunque la secuencia termine (se asientan).
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        if (d.life > 0) { d.life += raw; d.img.setAlpha(Math.max(0, 1 - d.life / 1.6)); if (d.life > 1.6) { d.img.destroy(); debris.splice(i, 1); } continue; }
        d.vy += 520 * raw; d.img.x += d.vx * raw; d.img.y += d.vy * raw; d.img.rotation += d.vr * raw;
        d.img.setDepth(d.img.y < d.floor ? DEPTH.ground + 30 : d.floor);
        if (d.img.y >= d.floor) { d.img.y = d.floor; d.life = 0.001; d.img.setDepth(d.floor - 1); for (let k = 0; k < 3; k++) spawnDust(d.img.x + (k - 1) * 4); }
      }
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.v += 160 * raw; f.y += f.v * raw;
        f.img.setPosition(Math.round(f.x), Math.round(f.y)).setAlpha(Math.max(0, f.img.alpha - raw * 0.25));
        if (f.y > 340 || f.img.alpha <= 0) { f.img.destroy(); falling.splice(i, 1); }
      }
      if (!running) { settle.setAlpha(Math.max(0, settle.alpha - raw * 0.08)); return; }
      const r = running, calm = reduced();
      r.t += raw;
      const k = clamp01(r.t / r.dur);
      // 1) Temblor, grietas y polvo que cae del techo.
      r.nextShake -= raw;
      if (!calm && k < 0.75 && r.nextShake <= 0) { world.shake(k < 0.3 ? 0.003 : 0.006, 220); r.nextShake = 0.25; }
      cracks.clear();
      const crackK = smooth(0, 0.3, k);
      cracks.lineStyle(1, 0x120e1a, 1);
      for (const line of crackLines) {
        const n = Math.max(1, Math.floor((line.length - 1) * crackK));
        cracks.beginPath(); cracks.moveTo(line[0].x, line[0].y);
        for (let s = 1; s <= n; s++) cracks.lineTo(line[s].x, line[s].y);
        cracks.strokePath();
      }
      if (k < 0.85 && Math.random() < (calm ? 0.3 : 0.9)) spawnDust(r.cx + (Math.random() - 0.5) * GAME_WIDTH);
      // 2) Se abre el hueco: el cielo del eclipse entra desde el centro y cae el escombro.
      if (k >= 0.3) {
        if (!r.flashed) {
          r.flashed = true;
          if (!calm) world.flash(0xc8dcd8, 260);
          setEclipse(1);
          r.hole.setVisible(true);
        }
        const open = smooth(0.3, 0.75, k), w = Math.max(2, Math.round(r.hole.width * open));
        r.hole.setCrop(Math.round((r.hole.width - w) / 2), 0, w, r.hole.height);
        r.nextDebris -= raw;
        if (k < 0.8 && r.nextDebris <= 0) { spawnDebris(r.cx, Math.max(40, w * 0.8)); r.nextDebris = calm ? 0.22 : 0.07; }
        settle.setAlpha(Math.max(settle.alpha, smooth(0.4, 0.8, k) * (calm ? 0.12 : 0.22)));
        settle.tilePositionX += raw * 8;
        r.corona.setAlpha(smooth(0.5, 1, k) * 0.8);
        r.moon.setAlpha(smooth(0.45, 0.8, k));
        cracks.setAlpha(1 - open);
      }
      if (k >= 1) { running = null; cracks.clear(); finish(); }
    });
    scene.events.once('shutdown', finish);
  }

  function installEclipse(): void {
    // Aurora del eclipse (dos cortinas que ondulan) en el cielo.
    const auroras = [0, 1].map(i => {
      const key = canvasTexture(scene, `__gdl_aurora_${i}`, 360, 150, ctx => drawGdlAurora(360, 150, 51 + i * 7).blit(ctx));
      return { img: scene.add.image(160 + i * 300, 20 + i * 12, key).setOrigin(0.5, 0).setScrollFactor(0.06, 0).setDepth(DEPTH.background + 0.42).setBlendMode(Phaser.BlendModes.ADD).setFlipX(i === 1), x: 160 + i * 300, ph: i * 2.1 };
    });
    // Estrellas que titilan (cielo) y estrellas que caen despacio (entre la capa 1 y la 2).
    const twinkles = Array.from({ length: 26 }, (_, i) => ({
      img: scene.add.image(rnd(i + 60) * 700, rnd(i + 61) * 170, px).setScrollFactor(PARALLAX_FACTORS[0], 0).setDepth(DEPTH.background + 0.2).setTint(i % 3 ? 0xdcdff0 : 0x9af8e8),
      ph: rnd(i + 62) * 9, sp: 1 + rnd(i + 63) * 3,
    }));
    const starFrames = frameCount(scene, 'prop_n10_estrella_caida');
    const stars = Array.from({ length: reduced() ? 6 : 14 }, (_, i) => {
      const img = scene.add.sprite(0, 0, 'prop_n10_estrella_caida', i % starFrames).setScrollFactor(0.2, 0).setDepth(DEPTH.background + 1.5).setBlendMode(Phaser.BlendModes.ADD);
      if (scene.anims.exists('prop_n10_estrella_caida')) img.play({ key: 'prop_n10_estrella_caida', randomFrame: true });
      return { img, x: rnd(i + 70) * 1000, y: rnd(i + 71) * 220, vx: -(10 + rnd(i + 72) * 14), vy: 14 + rnd(i + 73) * 18 };
    });
    animated.push(...stars.map(s => s.img));
    // Haces de luz fría que bajan por el techo abierto sobre la arena.
    const shafts = [520, 760, 1020].map((x, i) => ({ img: scene.add.image(x - 30, -10, 'prop_n10_rayo_luz').setOrigin(0.3, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ground + 5).setTint(0x9af8e8).setScale(1.7, 1.45), ph: i * 1.7 }));
    // Vitrales reventados: brillo frío tenue.
    const vit = gdlVitrales('catedral_eclipse').map((v, i) => ({ img: scene.add.image((v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, glow).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(v.tint)).setScale(1.6, 2).setDepth(DEPTH.ground + 4), ph: rnd(i + 80) * 7 }));
    // Chispas estelares que suben del suelo de la arena.
    const sparks = Array.from({ length: reduced() ? 14 : 36 }, (_, i) => ({
      img: scene.add.image(0, 0, px).setDepth(DEPTH.ground + 40).setBlendMode(Phaser.BlendModes.ADD).setTint(i % 3 ? 0x9af8e8 : 0xd89aff),
      x: 260 + rnd(i + 90) * 1000, y: 230 + rnd(i + 91) * 110, v: 6 + rnd(i + 92) * 10, ph: rnd(i + 93) * 9, top: 60 + rnd(i + 94) * 100,
    }));
    updaters.push((dt, t) => {
      const calm = reduced(), p = eclipseShown;
      for (const a of auroras) {
        a.img.setX(a.x + (calm ? 0 : Math.sin(t * 0.15 + a.ph) * 30)).setScale(1 + (calm ? 0 : Math.sin(t * 0.3 + a.ph) * 0.06), 1)
          .setAlpha(p * (0.28 + (calm ? 0 : Math.sin(t * 0.5 + a.ph) * 0.1)));
      }
      for (const s of twinkles) s.img.setAlpha(p * (calm ? 0.7 : 0.45 + Math.sin(t * s.sp + s.ph) * 0.45));
      for (const s of stars) {
        s.x += s.vx * dt * (calm ? 0.5 : 1); s.y += s.vy * dt * (calm ? 0.5 : 1);
        if (s.y > 230 || s.x < -40) { s.y = -10; s.x = 100 + rnd(t * 3.3 + s.vx) * 900; }
        s.img.setPosition(Math.round(s.x), Math.round(s.y)).setAlpha(p * (s.y < 200 ? 0.9 : Math.max(0, (230 - s.y) / 30)));
      }
      for (const s of shafts) s.img.setAlpha(0.03 + p * (0.07 + (calm ? 0 : Math.sin(t * 0.4 + s.ph) * 0.025)) + (1 - p) * 0.05).setTint(lerpColor(0xffd77a, 0x9af8e8, p));
      for (const v of vit) v.img.setAlpha(0.08 + (calm ? 0 : Math.sin(t * 0.7 + v.ph) * 0.03));
      for (const s of sparks) {
        s.y -= s.v * dt; s.x += Math.sin(t + s.ph) * dt * 3;
        if (s.y < s.top) { s.y = 240 + rnd(t + s.ph) * 100; s.x = 260 + rnd(t * 1.7 + s.ph) * 1000; }
        s.img.setPosition(Math.round(s.x), Math.round(s.y)).setAlpha(p * Math.max(0, Math.min(1, (s.y - s.top) / 40)) * (calm ? 0.5 : 0.5 + Math.sin(t * 6 + s.ph) * 0.4));
      }
    });
  }

  /* ---------- Bucle ---------- */
  let t = 0;
  const update = (_time: number, delta: number) => {
    const raw = Math.min(delta, 50) / 1000;
    const dt = raw * world.timeScale;
    t += dt;
    const calm = reduced();
    // El eclipse avanza suave (en tiempo real: no se congela con la cámara lenta de los conjuros).
    eclipseShown += (eclipseTarget - eclipseShown) * Math.min(1, raw * 1.5);
    if (Math.abs(eclipseTarget - eclipseShown) < 0.001) eclipseShown = eclipseTarget;
    const p = eclipseShown;
    const [c, w, i] = ambient[section](p);
    cold.setAlpha(c); warm.setAlpha(w); icy.setAlpha(i);
    sky?.(p, t);
    for (const pl of pulses) {
      if (calm) { pl.img.setAlpha(pl.base); continue; }
      const k = 1 + Math.sin(t * (1.2 + pl.flicker) + pl.ph) * 0.15 + (pl.flicker > 3 ? Math.sin(t * 17 + pl.ph * 3) * 0.12 : 0);
      pl.img.setAlpha(Math.max(0, pl.base * k));
    }
    for (const s of animated) if (s.active && s.anims) s.anims.timeScale = world.timeScale;
    for (const u of updaters) u(dt, t, raw);
  };
  update(0, 0);
  scene.events.on('update', update);
  scene.events.once('shutdown', () => {
    scene.events.off('update', update);
    roofApi = null;
  });
}
