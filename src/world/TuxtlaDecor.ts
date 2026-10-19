import type Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { GameState } from '../core/GameState';
import { DEPTH } from '../config/game';
import { canvasTexture } from './textures';

// Respaldos dibujados a 1× con rectángulos enteros: sin tipografía suavizada ni assets externos.
const P = {
  ink: '#2e2c34', stone: '#625f62', stoneHi: '#b3ab9c', stoneMid: '#8a857e',
  woodDark: '#3a2418', wood: '#5c3a24', woodMid: '#8a5a34', woodHi: '#b88a52',
  warm: '#ffd77a', cream: '#fff4cc', skinDark: '#6a3a30', skin: '#b4785a', skinHi: '#e0a882',
  green: '#36663a', teal: '#128a8a', mint: '#9af8e8', pink: '#e8207e',
};
type Draw = CanvasRenderingContext2D;
function box(c: Draw, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
function ellipse(c: Draw, color: string, x: number, y: number, w: number, h: number): void {
  for (let row = 0; row < h; row++) {
    const half = Math.floor(Math.sqrt(Math.max(0, 1 - ((row + .5 - h / 2) / (h / 2)) ** 2)) * w / 2);
    box(c, color, x + Math.floor(w / 2) - half, y + row, half * 2, 1);
  }
}
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '11011', '11011', '11111', '11011', '11011', '11011'],
  S: ['01111', '11000', '11000', '01110', '00011', '00011', '11110'],
  N: ['11011', '11111', '11111', '11011', '11011', '11011', '11011'],
  D: ['11110', '11011', '11011', '11011', '11011', '11011', '11110'],
  R: ['11110', '11011', '11011', '11110', '11100', '11010', '11011'],
  E: ['11111', '11000', '11000', '11110', '11000', '11000', '11111'],
  T: ['11111', '01110', '00100', '00100', '00100', '00100', '00100'],
  U: ['11011', '11011', '11011', '11011', '11011', '11011', '01110'],
  X: ['11011', '11011', '01010', '00100', '01010', '11011', '11011'],
  L: ['11000', '11000', '11000', '11000', '11000', '11000', '11111'],
  C: ['01111', '11000', '11000', '11000', '11000', '11000', '01111'],
  M: ['10001', '11011', '11111', '10101', '10001', '10001', '10001'],
  O: ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
  F: ['11111', '11000', '11000', '11110', '11000', '11000', '11000'],
  G: ['01111', '11000', '11000', '11011', '11011', '11011', '01111'],
};
function letters(c: Draw, word: string, x: number, y: number, scale: number, tourist = false): void {
  const colors = [P.teal, P.pink, '#f2a640', '#5a8a46', '#9a3ae0'];
  let n = 0;
  for (const char of word) {
    if (char === ' ') { x += scale * 3; continue; }
    const rows = GLYPHS[char] ?? GLYPHS.A;
    for (let row = 0; row < rows.length; row++) for (let col = 0; col < rows[row].length; col++) {
      if (rows[row][col] !== '1') continue;
      const px = x + col * scale, py = y + row * scale;
      box(c, P.ink, px + 2, py + 3, scale, scale);
      box(c, tourist ? colors[n % colors.length] : P.cream, px, py, scale, scale);
      if (tourist && row === 0) box(c, P.cream, px, py, scale, 1);
      if (tourist && (row * 7 + col * 11 + n * 3) % 13 === 0) box(c, P.stoneHi, px, py + scale - 1, 1, 1);
    }
    x += 6 * scale; n++;
  }
}
function musician(c: Draw, skirt: boolean, harp: boolean): void {
  ellipse(c, '#45434a', 12, 73, 41, 6);
  // Botines, piernas y ribete de luz en el sombrero, cara de perfil hacia la plaza.
  box(c, P.woodDark, 22, 65, 8, 10); box(c, P.woodDark, 34, 65, 9, 10);
  box(c, P.woodMid, 23, 65, 2, 8); box(c, P.woodMid, 35, 65, 2, 8);
  box(c, P.ink, 20, 74, 12, 3); box(c, P.ink, 33, 74, 13, 3);
  if (skirt) {
    for (let y = 42; y < 69; y++) {
      const spread = Math.floor((y - 42) / 3);
      box(c, '#9aa0bc', 25 - spread, y, 17 + spread * 2, 1);
      if (y % 7 < 2) box(c, '#dcdff0', 25 - spread, y, 17 + spread * 2, 1);
    }
    box(c, P.pink, 24, 44, 20, 4); box(c, '#5a0a3a', 40, 47, 3, 16);
  } else {
    box(c, '#45434a', 22, 45, 10, 23); box(c, '#2e2c34', 33, 45, 10, 23);
    box(c, '#625f62', 23, 46, 2, 21); box(c, '#625f62', 34, 46, 2, 21);
  }
  box(c, '#9aa0bc', 21, 28, 22, 19); box(c, '#dcdff0', 22, 29, 14, 16);
  box(c, '#fff4cc', 23, 29, 3, 13); box(c, P.ink, 35, 32, 1, 8);
  box(c, P.pink, 32, 27, 4, 10); box(c, '#a8125e', 35, 30, 2, 9);
  box(c, P.skinDark, 27, 12, 14, 16); box(c, P.skin, 29, 13, 12, 14);
  box(c, P.skinHi, 29, 14, 8, 10); box(c, P.skinHi, 40, 18, 3, 4);
  box(c, P.woodDark, 27, 12, 4, 11); box(c, P.ink, 38, 17, 1, 2);
  box(c, P.skinDark, 37, 24, 4, 1); box(c, P.skin, 32, 26, 6, 4);
  ellipse(c, P.woodDark, 13, 10, 37, 7); ellipse(c, P.woodHi, 14, 8, 35, 6);
  box(c, P.woodMid, 24, 2, 17, 9); box(c, P.woodHi, 25, 2, 14, 6);
  box(c, P.warm, 25, 2, 13, 1); box(c, P.woodDark, 24, 8, 17, 2);
  if (harp) {
    // Arpa en el mismo cuadro: silueta triangular, columna tallada y cuerdas a píxel.
    box(c, P.woodDark, 43, 28, 4, 45); box(c, P.woodMid, 44, 29, 2, 42);
    box(c, P.woodHi, 42, 28, 16, 3); box(c, P.woodDark, 57, 28, 4, 45);
    box(c, P.woodHi, 57, 30, 2, 42); box(c, P.woodMid, 42, 71, 19, 3);
    for (let x = 46; x < 57; x += 2) box(c, P.stoneHi, x, 32, 1, 38 - (x - 46) * 2);
    for (let y = 35; y < 70; y += 9) box(c, P.warm, 57, y, 3, 2);
    box(c, P.skinDark, 38, 35, 6, 4); box(c, P.skinHi, 42, 36, 6, 3);
  } else {
    // Jarana de cinco órdenes, cuello y clavijas; brazo cruza la tapa.
    ellipse(c, P.woodDark, 34, 42, 19, 21); ellipse(c, P.woodMid, 35, 43, 16, 18);
    ellipse(c, P.woodHi, 35, 44, 12, 15); ellipse(c, P.woodDark, 39, 47, 6, 6);
    box(c, P.woodDark, 43, 27, 5, 23); box(c, P.woodHi, 44, 28, 2, 22);
    box(c, P.woodMid, 42, 23, 7, 7); box(c, P.stoneHi, 41, 24, 1, 5); box(c, P.stoneHi, 49, 25, 1, 4);
    box(c, P.cream, 43, 30, 1, 28); box(c, P.woodDark, 38, 57, 9, 2);
    box(c, '#9aa0bc', 19, 33, 7, 12); box(c, P.skinDark, 23, 42, 15, 5);
    box(c, P.skinHi, 25, 42, 14, 3); box(c, P.skinHi, 45, 34, 6, 4);
  }
}

/** Props de respaldo independientes de las capas de paisaje y del suelo. */
export function installTuxtlaDecor(world: WorldApi): void {
  const { scene, level } = world;
  const image = (key: string, w: number, h: number, x: number, y: number, draw: (c: Draw) => void, depth = y) => {
    const tex = scene.textures.exists(key) ? key : canvasTexture(scene, `__tuxtla_decor_${key}`, w, h, draw);
    return scene.add.image(x, y, tex).setOrigin(.5, 1).setDepth(depth);
  };
  image('letras_san_andres_tuxtla', 304, 50, 230, 225, c => {
    box(c, P.ink, 1, 40, 302, 9); box(c, P.stone, 3, 38, 298, 9);
    box(c, P.stoneMid, 3, 36, 298, 4); box(c, P.stoneHi, 5, 36, 294, 1);
    for (let x = 5; x < 300; x += 27) { box(c, P.ink, x, 41, 1, 5); box(c, P.stoneMid, x + 7, 45, 3, 1); }
    letters(c, 'SAN ANDRES TUXTLA', 7, 12, 3, true);
    box(c, P.cream, 144, 7, 5, 2); box(c, P.cream, 147, 5, 4, 2);
    // Pequeñas matas que crecen en las juntas, sin tapar la lectura.
    box(c, '#22482c', 16, 44, 9, 3); box(c, '#5a8a46', 20, 40, 2, 6);
  }, 225);

  image('tarima_tuxtla', 250, 87, 3260, 315, c => {
    ellipse(c, '#45434a', 0, 71, 250, 15);
    box(c, P.woodDark, 6, 9, 238, 68); box(c, P.woodMid, 8, 5, 234, 65);
    for (let x = 9, n = 0; x < 241; x += 13, n++) {
      box(c, n % 3 === 0 ? P.woodHi : P.woodMid, x, 6, 11, 62);
      box(c, P.woodDark, x + 11, 6, 1, 64); box(c, P.woodHi, x + 1, 7, 1, 59);
      for (let y = 16; y < 61; y += 11) {
        box(c, P.wood, x + 3 + n % 3, y + n % 4, 1, 7);
        box(c, P.woodDark, x + 6, y + 3, 3, 1);
      }
      box(c, P.ink, x + 5, 9, 1, 2); box(c, P.stoneHi, x + 5, 9, 1, 1);
      box(c, P.ink, x + 5, 63, 1, 2);
    }
    box(c, P.woodHi, 7, 68, 236, 2); box(c, P.wood, 7, 70, 236, 6);
    for (let x = 15; x < 240; x += 35) box(c, P.woodDark, x, 71, 2, 5);
  }, DEPTH.ground + 25);

  // Portada y faroles a la espalda de los músicos; todos los pies quedan fuera del paso central.
  image('portada_fandango', 330, 127, 3260, 222, c => {
    for (const x of [9, 301]) {
      box(c, P.ink, x, 18, 17, 109); box(c, P.stone, x + 2, 19, 13, 108);
      box(c, P.stoneMid, x + 2, 19, 4, 107); box(c, P.stoneHi, x, 123, 18, 3);
      for (let y = 31; y < 120; y += 17) box(c, P.ink, x + 6, y, 8, 1);
      box(c, P.stoneHi, x - 3, 18, 23, 4); box(c, P.stoneMid, x - 1, 13, 19, 5);
      box(c, P.woodDark, x + 5, 4, 7, 10); box(c, P.warm, x + 6, 5, 5, 7);
      box(c, P.cream, x + 7, 5, 2, 5); box(c, P.ink, x + 4, 3, 9, 2);
    }
    // Cuerda en curva escalonada con banderines recortados de papel picado.
    for (let x = 25; x < 305; x++) {
      const y = 22 + Math.round(Math.sin((x - 25) / 280 * Math.PI) * 14);
      box(c, P.woodDark, x, y, 1, 1);
      if ((x - 25) % 23 < 15) {
        const offset = (x - 25) % 23;
        box(c, [P.teal, P.pink, P.woodHi][Math.floor((x - 25) / 23) % 3], x, y + 2, 1, 12 - (offset % 4 === 0 ? 2 : 0));
        if (offset > 3 && offset < 11) { c.clearRect(x, y + 5, 1, 2); c.clearRect(x, y + 10, 1, 1); }
      }
    }
    box(c, P.woodDark, 76, 53, 177, 23); box(c, P.woodHi, 76, 53, 177, 1);
    letters(c, 'FANDANGO', 141, 61, 1);
    box(c, P.warm, 80, 57, 2, 2); box(c, P.warm, 247, 70, 2, 2);
  }, 222);

  const musicians: Array<{ sprite: Phaser.GameObjects.Image; y: number; phase: number }> = [];
  for (const [x, y, skirt, harp] of [[500, 289, false, false], [3070, 263, false, false],
    [3115, 266, true, false], [3330, 263, false, true]] as const) {
    const sprite = image(`musico_tuxtla_${skirt ? 'falda' : harp ? 'arpa' : 'jarana'}`, 64, 80, x, y,
      c => musician(c, skirt, harp));
    musicians.push({ sprite, y, phase: x * .03 });
  }

  const memories: Array<{ id: string; sprite: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; y: number; phase: number }> = [];
  for (const [index, item] of level.interactables.filter(it => it.action === 'n02_estrofa').entries()) {
    const sprite = image(`recuerdo_tuxtla_${index % 2}`, 42, 42, item.x, item.y, c => {
      ellipse(c, '#45434a', 2, 34, 38, 7);
      if (index % 2 === 0) {
        box(c, P.woodDark, 4, 25, 33, 12); box(c, P.woodMid, 5, 25, 31, 9);
        box(c, P.woodHi, 5, 25, 31, 1); box(c, P.woodDark, 9, 27, 1, 7);
        box(c, P.woodDark, 31, 27, 1, 7); box(c, P.ink, 19, 28, 6, 2);
      }
      box(c, P.woodDark, 12, 18, 20, 15); box(c, '#b3ab9c', 11, 17, 20, 14);
      box(c, P.cream, 12, 17, 17, 12); box(c, P.woodHi, 27, 18, 2, 3);
      for (let y = 21; y < 28; y += 3) box(c, P.woodMid, 14, y, 11, 1);
      // Fragmento musical alzado, dos corcheas unidas con silueta contrastada.
      box(c, '#0a3a40', 17, 1, 13, 3); box(c, P.teal, 17, 3, 2, 12); box(c, P.teal, 28, 3, 2, 9);
      ellipse(c, P.mint, 12, 12, 7, 5); ellipse(c, P.mint, 23, 9, 7, 5);
      box(c, P.mint, 18, 1, 12, 2); box(c, P.warm, 6, 10, 1, 3); box(c, P.warm, 5, 11, 3, 1);
    });
    const glowKey = canvasTexture(scene, '__tuxtla_recuerdo_brillo', 42, 42, c => {
      for (let y = 0; y < 30; y++) for (let x = 1; x < 41; x++) {
        if (Math.hypot(x - 23, y - 12) < 14 && (x + y * 3) % 5 === 0) box(c, P.teal, x, y, 1, 1);
      }
      box(c, P.mint, 35, 8, 2, 2); box(c, P.warm, 9, 3, 1, 1);
    });
    const glow = scene.add.image(item.x, item.y, glowKey).setOrigin(.5, 1).setDepth(item.y - .1);
    memories.push({ id: String(item.data?.verseId), sprite, glow, y: item.y, phase: index * 1.7 });
  }

  image('salida_tuxtla', 111, 81, 3502, 230, c => {
    box(c, P.woodDark, 48, 23, 9, 58); box(c, P.woodMid, 49, 23, 5, 58);
    box(c, P.woodHi, 49, 25, 1, 53); box(c, P.woodDark, 8, 12, 91, 22);
    box(c, P.woodMid, 9, 13, 89, 19); box(c, P.woodHi, 10, 14, 87, 1);
    for (let x = 99; x < 109; x++) box(c, P.woodMid, x, 13 + (x - 99), 1, 20 - (x - 99) * 2);
    letters(c, 'CATEMACO', 17, 19, 1); box(c, P.stoneHi, 51, 29, 2, 2);
    box(c, '#22482c', 35, 76, 32, 5); box(c, '#5a8a46', 42, 72, 2, 9);
  }, 230);

  // Luces discretas, recortadas en escalones. No añaden zonas de colisión.
  const lanterns: Phaser.GameObjects.Image[] = [];
  const glowKey = canvasTexture(scene, '__tuxtla_farol_resplandor', 42, 64, c => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 42; x++) {
      const r = ((x - 21) / 21) ** 2 + ((y - 24) / 36) ** 2;
      if (r < 1 && (x + y) % (r < .35 ? 3 : 7) === 0) box(c, P.warm, x, y, 1, 1);
    }
  });
  for (const x of [3112, 3404]) lanterns.push(scene.add.image(x, 105, glowKey).setAlpha(.35).setDepth(223));
  let elapsed = 0;
  const update = (_time: number, delta: number) => {
    elapsed += Math.min(delta, 50) * world.timeScale / 1000;
    const reduced = GameState.settings.reduceFx;
    for (const npc of musicians) npc.sprite.setY(npc.y + (reduced ? 0 : Math.round(Math.sin(elapsed * 2 + npc.phase) * .65)));
    for (const memory of memories) {
      const visible = !GameState.flags[`n02:estrofa:${memory.id}`];
      memory.sprite.setVisible(visible);
      memory.glow.setVisible(visible && !reduced).setAlpha(.28 + Math.sin(elapsed * 2 + memory.phase) * .12);
    }
    for (const glow of lanterns) glow.setVisible(!reduced).setAlpha(.3 + Math.sin(elapsed * 1.8) * .04);
  };
  update(0, 0);
  scene.events.on('update', update);
  scene.events.once('shutdown', () => scene.events.off('update', update));
}
