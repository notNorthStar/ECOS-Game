import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { GameState } from '../core/GameState';
import { DEPTH, GAME_WIDTH, PARALLAX_FACTORS, layerWidth } from '../config/game';
import { fogTexture, glowTexture } from './textures';
import { cdmxLayerFeatures, cdmxTeleCables, cdmxTowers, type CdmxLight, type CdmxSection } from './CdmxLandscape';
import { cdmxGroundMarks } from './CdmxTerrain';

/**
 * Decorado animado del Nivel 6: halos que laten en velas, faroles, ventanas y braseros pintados en la
 * capa 3; neones que parpadean (algunos se apagan a ratos); papel picado que se mece en los cables;
 * cabinas del teleférico que avanzan lento por sus cables (capa 2); pedazos que se desprenden de los
 * rascacielos del fondo; pétalos de cempasúchil a la deriva (avenidas, reforma), bruma y luciérnagas
 * de vela en Xochimilco; neblina baja teñida y luz de los props del nivel.
 * Respeta GameState.settings.reduceFx (todo quieto, sin partículas) y world.timeScale. No añade
 * colisiones.
 */

const LIGHT: Record<CdmxLight['kind'], { tint: number; scale: number; alpha: number; flicker: number }> = {
  ventana: { tint: 0xf2a640, scale: 0.34, alpha: 0.2, flicker: 0.4 },
  farol: { tint: 0xffd77a, scale: 0.5, alpha: 0.32, flicker: 1 },
  vela: { tint: 0xf2a640, scale: 0.5, alpha: 0.32, flicker: 5 },
  fuego: { tint: 0xd0742c, scale: 1.1, alpha: 0.45, flicker: 5 },
  aurora: { tint: 0x5a8a46, scale: 2, alpha: 0.12, flicker: 0.3 },
  neon: { tint: 0x2ad0c0, scale: 0.6, alpha: 0.3, flicker: 2 },
};

/** Luz automática de props del nivel (por clave de textura). */
const PROP_GLOW: Record<string, { dy: number; tint: number; scale: number; alpha: number; flicker: number }> = {
  prop_n06_ofrenda_grande: { dy: -40, tint: 0xf2a640, scale: 1.6, alpha: 0.3, flicker: 4 },
  prop_n06_ofrenda_descanso: { dy: -44, tint: 0x9a3ae0, scale: 1.8, alpha: 0.3, flicker: 1.2 },
  prop_n06_ofrenda_chica: { dy: -20, tint: 0xf2a640, scale: 0.8, alpha: 0.32, flicker: 5 },
  prop_n06_ofrenda_flotante: { dy: -20, tint: 0xd0742c, scale: 1.3, alpha: 0.42, flicker: 6 },
  prop_n06_brasero: { dy: -30, tint: 0xd0742c, scale: 1.1, alpha: 0.45, flicker: 6 },
  prop_n06_inscripcion: { dy: -30, tint: 0x2ad0c0, scale: 0.9, alpha: 0.2, flicker: 1 },
  prop_n06_veladoras: { dy: -12, tint: 0xf2a640, scale: 0.7, alpha: 0.4, flicker: 5 },
  prop_n06_poste_neon: { dy: -72, tint: 0xe8207e, scale: 0.9, alpha: 0.32, flicker: 3 },
  prop_n06_estacion_teleferico: { dy: -40, tint: 0xf2a640, scale: 2.2, alpha: 0.18, flicker: 1 },
  prop_n06_arbol_munecas: { dy: -4, tint: 0xf2a640, scale: 0.6, alpha: 0.26, flicker: 5 },
  prop_n06_letras_cdmx: { dy: -18, tint: 0xf2a640, scale: 1.1, alpha: 0.12, flicker: 0.5 },
  prop_n06_angel_figura: { dy: -24, tint: 0xffd77a, scale: 1.4, alpha: 0.12, flicker: 0.4 },
};

const hex = (c: string): number => parseInt(c.slice(1), 16);

interface Pulse { img: Phaser.GameObjects.Image; base: number; ph: number; flicker: number; neon?: boolean }
interface Mote { img: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number; ax: number; ay: number }

const pxTexture = (scene: Phaser.Scene): string => {
  if (!scene.textures.exists('px')) {
    const t = scene.textures.createCanvas('px', 1, 1);
    if (t) { t.getContext().fillStyle = '#ffffff'; t.getContext().fillRect(0, 0, 1, 1); t.refresh(); }
  }
  return 'px';
};

export function installCdmxDecor(world: WorldApi, section: CdmxSection): void {
  const { scene, level } = world;
  const glow = glowTexture(scene);
  const px = pxTexture(scene);
  const rnd = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const pulses: Pulse[] = [];
  const addGlow = (x: number, y: number, c: { tint: number; scale: number; alpha: number; flicker: number }, depth: number, ph: number, scroll = 1): Phaser.GameObjects.Image => {
    const img = scene.add.image(x, y, glow).setScrollFactor(scroll, scroll === 1 ? 1 : 0).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(c.tint).setScale(c.scale).setAlpha(c.alpha).setDepth(depth);
    pulses.push({ img, base: c.alpha, ph, flicker: c.flicker });
    return img;
  };

  // Capa 3: halos de luces, neones y papel picado en sus cables.
  const f3 = PARALLAX_FACTORS[3];
  const { lights, cables, neons } = cdmxLayerFeatures(section, layerWidth(level.width, f3));
  lights.forEach((l, i) => addGlow(l.x, l.y, LIGHT[l.kind], DEPTH.background + 3.6, rnd(i) * 7, f3));
  neons.forEach((n, i) => {
    const img = addGlow(n.x + n.w / 2, n.y + n.h / 2, { tint: hex(n.color), scale: 1, alpha: 0.34, flicker: 2 }, DEPTH.background + 3.6, rnd(i + 50) * 7, f3);
    img.setScale(Math.max(0.4, n.w / 40), Math.max(0.3, n.h / 26));
    pulses[pulses.length - 1].neon = n.broken || i % 3 === 0;
  });

  const papel: Array<{ s: Phaser.GameObjects.Image; ph: number; sp: number }> = [];
  const papelKey = 'prop_n06_papel_picado';
  if (scene.textures.exists(papelKey) && scene.textures.get(papelKey).frameTotal > 4) {
    cables.forEach((c, i) => {
      for (let x = c.x0; x + 128 <= c.x1 + 20; x += 128) {
        const t = (x + 64 - c.x0) / Math.max(1, c.x1 - c.x0);
        const s = scene.add.image(x, c.y + Math.sin(Math.min(1, t) * Math.PI) * c.sag - 4, papelKey, 0)
          .setOrigin(0, 0).setScrollFactor(f3, 0).setDepth(DEPTH.background + 3.7);
        papel.push({ s, ph: rnd(i * 7 + x) * 4, sp: 2.5 + rnd(x + i) * 2 });
      }
    });
  }

  // Capa 2: cabinas del teleférico que se deslizan por sus cables.
  const f2 = PARALLAX_FACTORS[2], w2 = layerWidth(level.width, f2);
  const cabinas: Array<{ img: Phaser.GameObjects.Image; light: Phaser.GameObjects.Image; c: { x0: number; y0: number; x1: number; y1: number }; t: number; sp: number }> = [];
  const cabKey = scene.textures.exists('prop_n06_cabina') ? 'prop_n06_cabina' : null;
  if (cabKey) cdmxTeleCables(section, w2).forEach((c, i) => {
    for (let k = 0; k < 2; k++) {
      const img = scene.add.image(0, 0, cabKey, 0).setOrigin(0.5, 0).setScrollFactor(f2, 0).setDepth(DEPTH.background + 2.5).setScale(0.55);
      const light = scene.add.image(0, 0, glow).setScrollFactor(f2, 0).setDepth(DEPTH.background + 2.6).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xf2a640).setScale(0.25).setAlpha(0.35);
      cabinas.push({ img, light, c, t: (rnd(i * 3 + k) + k * 0.5) % 1, sp: (i % 2 ? -1 : 1) * (0.012 + rnd(i + 9) * 0.008) });
    }
  });

  // Capa 2: pedazos que se desprenden de los rascacielos rotos.
  const towers = cdmxTowers(section, w2);
  const chunks: Array<{ img: Phaser.GameObjects.Image; x: number; y: number; vy: number; top: number; wait: number; tower: number }> = [];
  for (let i = 0; i < Math.min(towers.length, 10); i++) {
    const img = scene.add.image(0, 0, px).setScrollFactor(f2, 0).setDepth(DEPTH.background + 2.4).setTint(i % 2 ? 0x45434a : 0x625f62).setScale(2, 2).setVisible(false);
    chunks.push({ img, x: 0, y: 0, vy: 0, top: 0, wait: 1 + rnd(i + 70) * 8, tower: i });
  }

  // Props del nivel: luz, NPCs con pivote correcto y animaciones con la escala de tiempo del mundo.
  const npcOriginY = 78 / 80;
  const animated: Phaser.GameObjects.Sprite[] = [];
  for (const child of [...scene.children.list]) {
    if (!(child instanceof Phaser.GameObjects.Sprite)) continue;
    const key = child.texture?.key;
    if (!key) continue;
    if (key.startsWith('npc_sobreviviente_')) child.setOrigin(0.5, npcOriginY);
    if ((key.startsWith('prop_n06_') || key.startsWith('npc_sobreviviente_')) && scene.anims.exists(key) && !child.anims.isPlaying) child.play({ key, randomFrame: true });
    if (child.anims.isPlaying || key.startsWith('prop_n06_')) animated.push(child);
    const g = PROP_GLOW[key];
    if (g) {
      addGlow(child.x, child.y + g.dy * child.scaleY, { ...g, scale: g.scale * child.scaleX }, child.depth + 0.5, rnd(child.x) * 7);
      const pool = addGlow(child.x, child.y, { ...g, alpha: g.alpha * 0.6 }, DEPTH.ground + 20, rnd(child.x + 1) * 7);
      pool.setScale(g.scale * 2.2 * child.scaleX, g.scale * 0.55 * child.scaleY);
    }
  }

  // Marcas del suelo: fuego de la ofrenda flotante, ofrenda grande, oro del Ángel, andén.
  for (const m of cdmxGroundMarks(section)) {
    const c = m.kind === 'fuego' ? { tint: 0xd0742c, a: 0.26, f: 4 } : m.kind === 'oro' ? { tint: 0xffd77a, a: 0.12, f: 0.6 } : { tint: 0xf2a640, a: 0.18, f: 2 };
    addGlow(m.x, m.y, { tint: c.tint, scale: 1, alpha: c.a, flicker: c.f }, DEPTH.ground + 15, 0).setScale(4, 0.9);
  }

  // Neblina baja: verde-azul en los canales, rosada de humo en las avenidas, verde enfermiza en Reforma.
  const fogTint = section === 'xochimilco' ? 0x77a08a : section === 'avenidas' ? 0xa8125e : 0x5a8a46;
  const fogAlpha = section === 'xochimilco' ? 0.22 : 0.12;
  const mist = scene.add.tileSprite(0, 216, GAME_WIDTH, section === 'xochimilco' ? 70 : 52, fogTexture(scene)).setOrigin(0, 0.5).setScrollFactor(0)
    .setDepth(DEPTH.ground + 5).setTint(fogTint).setTileScale(1.8, 0.8).setAlpha(fogAlpha);

  // Motas: luciérnagas de vela en Xochimilco; pétalos de cempasúchil que caen en avenidas y Reforma.
  const petalos = section !== 'xochimilco';
  const motes: Mote[] = [];
  const count = Math.round(level.width / (petalos ? 70 : 90));
  const colors = petalos ? [0xf2a640, 0xd0742c, 0xffd77a, 0xd0742c] : [0xffd77a, 0xf2a640, 0x9af8e8];
  for (let i = 0; i < count; i++) {
    const x = rnd(i + 200) * level.width, y = petalos ? rnd(i + 300) * 360 : 170 + rnd(i + 300) * 160;
    const img = scene.add.image(x, y, px).setTint(colors[i % colors.length]).setDepth(DEPTH.foreground - 5);
    if (petalos && i % 3 === 0) img.setScale(2, 1);
    motes.push({ img, x, y, ph: rnd(i + 400) * 7, sp: 0.5 + rnd(i + 500) * 0.9, ax: x, ay: y });
  }

  let t = 0;
  const update = (_time: number, delta: number) => {
    const dt = Math.min(delta, 50) / 1000 * world.timeScale;
    t += dt;
    const reduced = GameState.settings.reduceFx;
    for (const p of pulses) {
      if (reduced) { p.img.setAlpha(p.base); continue; }
      let k = 1 + Math.sin(t * (1.2 + p.flicker) + p.ph) * 0.16 + (p.flicker > 3 ? Math.sin(t * 17 + p.ph * 3) * 0.12 : 0);
      // Neón dañado: se apaga a ratos con un chisporroteo.
      if (p.neon) { const cyc = (t * 0.35 + p.ph) % 4; if (cyc > 3.4) k = Math.sin(t * 60 + p.ph) > 0 ? 0.15 : 1; }
      p.img.setAlpha(Math.max(0, p.base * k));
    }
    for (const s of animated) if (s.active && s.anims) s.anims.timeScale = world.timeScale;
    for (const p of papel) p.s.setFrame(reduced ? 0 : Math.floor(t * p.sp + p.ph) % 4);
    for (const c of cabinas) {
      if (!reduced) c.t = (c.t + dt * c.sp + 1) % 1;
      const x = c.c.x0 + (c.c.x1 - c.c.x0) * c.t, y = c.c.y0 + (c.c.y1 - c.c.y0) * c.t;
      c.img.setPosition(x, y); c.light.setPosition(x, y + 10);
    }
    for (const ch of chunks) {
      const tw = towers[ch.tower];
      if (reduced || !tw) { ch.img.setVisible(false); continue; }
      if (!ch.img.visible) {
        ch.wait -= dt;
        if (ch.wait <= 0) { ch.x = tw.x + (rnd(t * 13 + ch.tower) - 0.5) * tw.w * 0.6; ch.y = tw.top; ch.vy = 0; ch.img.setVisible(true); }
        continue;
      }
      ch.vy += dt * 60; ch.y += ch.vy * dt;
      ch.img.setPosition(ch.x, ch.y).setAlpha(Math.max(0.2, 1 - (ch.y - tw.top) / 160));
      if (ch.y > 206) { ch.img.setVisible(false); ch.wait = 3 + rnd(t + ch.tower) * 9; }
    }
    const camX = scene.cameras.main.scrollX;
    mist.tilePositionX = camX * 0.9 / 1.8 + (reduced ? 0 : t * 5);
    for (const m of motes) {
      m.img.setVisible(!reduced);
      if (reduced) continue;
      if (petalos) {
        // Pétalos: caen lento girando y se mecen con el viento.
        m.ay += dt * 10 * m.sp; m.ax += dt * 7 * m.sp;
        if (m.ay > 345) { m.ay = -4; m.ax = m.x + Math.sin(t + m.ph) * 60; }
        m.img.setPosition(m.ax + Math.sin(t * 1.4 * m.sp + m.ph) * 8, m.ay);
        m.img.setScale(1 + Math.round(Math.abs(Math.sin(t * 3 * m.sp + m.ph))), 1);
      } else {
        // Luces de vela que flotan sobre el canal seco.
        m.img.setPosition(m.ax + Math.sin(t * 0.6 * m.sp + m.ph) * 10, m.ay + Math.sin(t * 0.9 * m.sp + m.ph * 2) * 6);
        m.img.setAlpha(0.2 + 0.7 * Math.max(0, Math.sin(t * 1.8 * m.sp + m.ph)));
      }
    }
  };
  update(0, 0);
  scene.events.on('update', update);
  scene.events.once('shutdown', () => scene.events.off('update', update));
}
