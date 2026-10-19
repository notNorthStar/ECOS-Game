import Phaser from 'phaser';
import manifest from '../data/assets.json';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { isKitFile, queueKits, registerKits } from '../systems/CharacterKits';

// Dueño: arte. Carga el manifiesto src/data/assets.json (lo genera `npm run placeholders`),
// crea una animación por cada tira con la MISMA clave que su textura y pasa a 'Title'.
// Reemplazar un PNG por arte del equipo (mismo nombre y medidas) no requiere tocar este código.

interface ImageEntry {
  key: string;
  path: string;
  placeholder?: boolean;
}
interface SheetEntry extends ImageEntry {
  frameWidth: number;
  frameHeight: number;
  frames: number;
  frameRate: number;
  repeat: number;
  originY: number;
}
interface AssetManifest {
  images: ImageEntry[];
  sheets: SheetEntry[];
  /** ids extra de personajes del kit del equipo (los de KIT_IDS se buscan siempre). */
  kits?: string[];
}

const MANIFEST = manifest as AssetManifest;

/** originY (pivote en los pies) de cada tira, para que las entidades lo consulten: SHEET_ORIGIN_Y[key]. */
export const SHEET_ORIGIN_Y: Readonly<Record<string, number>> = Object.fromEntries(MANIFEST.sheets.map((s) => [s.key, s.originY]));

export class BootScene extends Phaser.Scene {
  private failed = new Set<string>();

  constructor() {
    super('Boot');
  }

  preload(): void {
    // Phaser 4.2.1 pierde archivos de la cola cuando la caché del navegador responde al instante
    // (segunda visita): se quedaba trabado en 32 archivos (maxParallelDownloads). Con todos en paralelo
    // la cola nunca se usa. Son archivos chicos y locales; no hay costo real.
    this.load.maxParallelDownloads = 1024;
    this.drawLoader();
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (isKitFile(file.key)) return; // un kit que el equipo aún no entrega no es un error
      this.failed.add(file.key);
      console.warn(`[Boot] No se pudo cargar "${file.key}" (${String(file.url)}). Se usa un sustituto.`);
    });
    for (const img of MANIFEST.images) this.load.image(img.key, img.path);
    for (const s of MANIFEST.sheets) this.load.spritesheet(s.key, s.path, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    // Personajes del kit del equipo (public/assets/sprites/personajes/<id>/), si existen.
    queueKits(this, MANIFEST.kits ?? []);
  }

  create(): void {
    // textura de 1×1 blanca para partículas
    if (!this.textures.exists('px')) {
      const t = this.textures.createCanvas('px', 1, 1);
      if (t) {
        const ctx = t.getContext();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        t.refresh();
      }
    }
    // sustitutos para lo que falló (para que nada truene)
    for (const img of MANIFEST.images) if (!this.textures.exists(img.key)) this.makeFallback(img.key, 16, 16, 1);
    for (const s of MANIFEST.sheets) if (!this.textures.exists(s.key)) this.makeFallback(s.key, s.frameWidth, s.frameHeight, s.frames);

    for (const s of MANIFEST.sheets) {
      if (this.anims.exists(s.key)) continue;
      const tex = this.textures.get(s.key);
      const available = Math.max(1, tex.frameTotal - 1); // frameTotal incluye __BASE
      const end = Math.min(s.frames, available) - 1;
      this.anims.create({
        key: s.key,
        frames: this.anims.generateFrameNumbers(s.key, { start: 0, end }),
        frameRate: s.frameRate,
        repeat: s.repeat,
      });
    }
    registerKits(this);
    if (this.failed.size) console.warn(`[Boot] ${this.failed.size} archivo(s) con sustituto:`, [...this.failed]);
    this.scene.start('Title');
  }

  /** Barra de carga: gema turquesa sobre fondo nocturno. */
  private drawLoader(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 220;
    const g = this.add.graphics();
    g.fillStyle(0x07060d, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.lineStyle(1, 0x128a8a, 1).strokeRect(cx - w / 2 - 3, cy + 14, w + 6, 10);
    const gem = this.add.graphics();
    const bar = this.add.graphics();
    const label = this.add
      .text(cx, cy + 34, 'DESPERTANDO LOS ECOS…', { fontFamily: 'monospace', fontSize: '10px', color: '#9af8e8' })
      .setOrigin(0.5, 0);
    const drawGem = (p: number): void => {
      gem.clear();
      gem.fillStyle(0x2ad0c0, 0.15 + p * 0.25).fillCircle(cx, cy - 14, 18 + p * 6);
      gem.fillStyle(0x2ad0c0, 1).fillTriangle(cx, cy - 30, cx + 12, cy - 16, cx - 12, cy - 16);
      gem.fillStyle(0x128a8a, 1).fillTriangle(cx - 12, cy - 16, cx + 12, cy - 16, cx, cy + 2);
      gem.fillStyle(0x9af8e8, 1).fillRect(cx - 5, cy - 22, 3, 3);
    };
    drawGem(0);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      bar.clear();
      bar.fillStyle(0x128a8a, 1).fillRect(cx - w / 2, cy + 17, w * p, 4);
      bar.fillStyle(0x9af8e8, 1).fillRect(cx - w / 2, cy + 17, w * p, 1);
      bar.fillStyle(0xe8207e, 1).fillRect(cx - w / 2 + w * p - 2, cy + 16, 2, 6);
      drawGem(p);
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => label.setText('LISTO'));
  }

  private makeFallback(key: string, fw: number, fh: number, frames: number): void {
    const t = this.textures.createCanvas(key, fw * frames, fh);
    if (!t) return;
    const ctx = t.getContext();
    for (let i = 0; i < frames; i++) {
      ctx.fillStyle = 'rgba(232,32,126,0.35)';
      ctx.fillRect(i * fw, 0, fw, fh);
      ctx.strokeStyle = '#e8207e';
      ctx.strokeRect(i * fw + 0.5, 0.5, fw - 1, fh - 1);
      if (frames > 1) t.add(i, 0, i * fw, 0, fw, fh);
    }
    t.refresh();
  }
}
