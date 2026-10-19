import type { WorldApi } from '../core/contracts';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, layerWidth } from '../config/game';
import { canvasTexture } from './textures';
import { GameState } from '../core/GameState';

/** Arte procedural provisional del pueblo; no escribe ni reemplaza assets del equipo. */
export function installTuxtlaScenery(world: WorldApi): void {
  const { scene, level } = world;
  const layers = [0.04, 0.15, 0.4, 0.65, 1, 1.25];
  // Elimina solamente los respaldos visuales del mundo: conserva props, atmósfera y actores.
  for (const child of [...scene.children.list]) {
    const image = child as typeof child & { texture?: { key: string } };
    if (image.texture?.key.startsWith('__mundo_capa')) child.destroy();
  }
  layers.forEach((factor, index) => {
    if (scene.textures.exists(`${level.background}_capa${index}`)) return;
    const width = layerWidth(level.width, factor);
    const key = canvasTexture(scene, `__tuxtla_capa${index}_${width}`, width, GAME_HEIGHT, (ctx, w) => {
      if (index === 0) {
        const colors = ['#65516b', '#946575', '#c47d77', '#e6aa7d', '#f1c18d'];
        for (let y = 0; y < 230; y++) {
          ctx.fillStyle = colors[Math.min(4, Math.floor(y / 46))];
          ctx.fillRect(0, y, w, 1);
        }
        ctx.fillStyle = '#f9d69b'; ctx.fillRect(460, 72, 30, 30);
      } else if (index === 1 || index === 2) {
        ctx.fillStyle = index === 1 ? '#596654' : '#39574b';
        for (let x = -40; x < w + 80; x += 40) {
          const top = (index === 1 ? 140 : 176) - Math.round(Math.sin(x * 0.012) * 24);
          ctx.fillRect(x, top, 42, 240 - top);
          if (index === 2) {
            ctx.fillStyle = '#63805a'; ctx.fillRect(x + 8, top - 12, 25, 17);
            ctx.fillStyle = '#39574b';
          }
        }
      } else if (index === 3) {
        const walls = ['#c16f65', '#609387', '#c0a065', '#ad7189'];
        for (let x = 480, n = 0; x < w; x += 205, n++) {
          const h = 68 + (n % 3) * 14;
          ctx.fillStyle = '#544342'; ctx.fillRect(x - 6, 219 - h - 12, 146, 14);
          ctx.fillStyle = walls[n % walls.length]; ctx.fillRect(x, 219 - h, 134, h);
          ctx.fillStyle = '#e5bc8b'; ctx.fillRect(x, 214, 134, 5);
          ctx.fillStyle = '#3a4144'; ctx.fillRect(x + 18, 180, 22, 39);
          ctx.fillRect(x + 76, 163, 29, 22);
          ctx.fillStyle = '#e4b678'; ctx.fillRect(x + 79, 166, 23, 16);
          ctx.fillStyle = '#5e6558'; ctx.fillRect(x + 89, 166, 2, 16);
          for (let roof = x - 4; roof < x + 139; roof += 9) {
            ctx.fillStyle = '#ad6857'; ctx.fillRect(roof, 208 - h, 7, 4);
          }
        }
      } else if (index === 4) {
        ctx.fillStyle = '#857b5e'; ctx.fillRect(0, 220, w, 140);
        ctx.fillStyle = '#b59d74'; ctx.fillRect(0, 237, w, 96);
        for (let y = 240; y < 345; y += 12) for (let x = (y % 24) * 2; x < w; x += 30) {
          ctx.fillStyle = '#a38e6b'; ctx.fillRect(x, y, 25, 1);
          ctx.fillRect(x, y, 1, 9);
        }
        ctx.fillStyle = '#64775a'; ctx.fillRect(0, 220, w, 7);
      } else {
        for (let x = 10; x < w; x += 380) {
          ctx.fillStyle = '#304d42'; ctx.fillRect(x, 351, 80, 9);
          ctx.fillStyle = '#48674b'; ctx.fillRect(x + 10, 343, 48, 9);
        }
      }
    });
    scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(factor, 0)
      .setDepth(index < 4 ? DEPTH.background + index : index === 4 ? DEPTH.ground : DEPTH.foreground);
  });

  // Letras propias: nunca reutilizar la textura que dice XALAPA.
  scene.add.rectangle(230, 218, 245, 33, 0x584c47).setDepth(218);
  scene.add.text(230, 207, 'SAN ANDRÉS TUXTLA', {
    fontFamily: 'monospace', fontSize: '17px', color: '#edc99a', stroke: '#49433d', strokeThickness: 2,
  }).setOrigin(0.5).setDepth(219);

  // La tarima es plana y accesible desde cualquier lado del cinturón transitable.
  const stage = scene.add.graphics().setDepth(DEPTH.ground + 25);
  stage.fillStyle(0x4d3833); stage.fillRect(3150, 240, 220, 73);
  stage.fillStyle(0xa67650); stage.fillRect(3150, 236, 220, 68);
  for (let x = 3156; x < 3368; x += 14) {
    stage.fillStyle(0x75513e); stage.fillRect(x, 237, 1, 66);
    stage.fillStyle(0xc39061); stage.fillRect(x + 1, 239, 1, 61);
  }
  scene.add.text(3260, 220, 'PLAZA DEL FANDANGO', {
    fontFamily: 'monospace', fontSize: '10px', color: '#f3d7a3', backgroundColor: '#4b4745', padding: { x: 5, y: 3 },
  }).setOrigin(0.5).setDepth(220);

  for (const [x, y, color, harp] of [[500, 289, 0x668e83, false], [3070, 263, 0xb67b72, false], [3110, 263, 0x668e83, false], [3330, 263, 0xb9a36c, true]] as const) {
    const g = scene.add.graphics().setPosition(0, y - 263).setDepth(y);
    g.fillStyle(0x4e403c); g.fillEllipse(x, 264, 28, 8);
    g.fillStyle(0x453e43); g.fillRect(x - 8, 247, 6, 15); g.fillRect(x + 2, 247, 6, 15);
    g.fillStyle(color); g.fillRect(x - 10, 225, 20, 24);
    g.fillStyle(0xd3a27e); g.fillRect(x - 7, 209, 14, 16);
    g.fillStyle(0xe5c898); g.fillRect(x - 13, 207, 26, 4); g.fillRect(x - 8, 202, 16, 7);
    g.fillStyle(0xd3a27e); g.fillRect(x - 13, 231, 5, 13); g.fillRect(x + 8, 231, 5, 13);
    g.fillStyle(0xbc874a);
    if (harp) {
      g.fillTriangle(x + 8, 214, x + 35, 214, x + 35, 264);
      g.fillStyle(0x594638); g.fillTriangle(x + 13, 219, x + 31, 219, x + 31, 254);
      g.lineStyle(1, 0xe3c88f);
      for (let i = 0; i < 5; i++) g.lineBetween(x + 15 + i * 3, 220, x + 31, 228 + i * 6);
    } else {
      g.fillEllipse(x + 2, 241, 13, 18); g.fillRect(x + 4, 222, 4, 19);
      g.fillStyle(0x51423a); g.fillEllipse(x + 2, 240, 4, 5);
    }
  }

  const memories: Array<{ id: string; graphic: ReturnType<typeof scene.add.graphics> }> = [];
  for (const item of level.interactables.filter(i => i.action === 'n02_estrofa')) {
    const g = scene.add.graphics().setPosition(item.x, item.y).setDepth(item.y);
    g.setName(item.id);
    g.fillStyle(0x302f40, 0.45); g.fillEllipse(0, 2, 26, 8);
    g.fillStyle(0xe7d8a5); g.fillRect(-8, -16, 16, 16);
    g.fillStyle(0x96785a); g.fillRect(-5, -12, 10, 1); g.fillRect(-5, -8, 8, 1);
    g.fillStyle(0x74e0bb); g.fillRect(3, -22, 2, 8); g.fillRect(4, -22, 4, 2); g.fillEllipse(1, -15, 5, 3);
    memories.push({ id: String(item.data?.verseId), graphic: g });
  }
  const updateMemories = () => {
    for (const memory of memories) memory.graphic.setVisible(!GameState.flags[`n02:estrofa:${memory.id}`]);
  };
  updateMemories();
  scene.events.on('update', updateMemories);
  scene.events.once('shutdown', () => scene.events.off('update', updateMemories));
  scene.add.text(3485, 214, 'CATEMACO →', { fontFamily: 'monospace', fontSize: '11px', color: '#f3d7a3' }).setDepth(215);
  // Marca sutil de horizonte cálido, visible incluso con los efectos reducidos.
  scene.add.rectangle(0, 218, GAME_WIDTH, 1, 0xf1c18d, 0.15).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.background + 4);
}
