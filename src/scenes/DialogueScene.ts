import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import type { WorldApi } from '../core/contracts';

// Dueño: contenido. Caja de diálogo pixel art con retrato, nombre y máquina de escribir.
// Avanza con E, Espacio, Enter o clic. Bloquea al jugador mientras dura y al terminar emite 'dialogue:end'.

interface Linea {
  who: string;
  text: string;
}
interface Hablante {
  nombre: string;
  retrato: string;
}

const FILES = import.meta.glob('../data/dialogue/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>;
const DATOS: Record<string, unknown> = {};
const HABLANTES: Record<string, Hablante> = {};
for (const path of Object.keys(FILES).sort()) {
  const file = FILES[path];
  Object.assign(HABLANTES, file._hablantes ?? {});
  for (const [id, dialogue] of Object.entries(file)) {
    if (id !== '_hablantes') DATOS[id] = dialogue;
  }
}

/** Busca un diálogo por id en los JSON de diálogos. */
export function getDialogue(id: string): Linea[] {
  const d = DATOS[id];
  return Array.isArray(d) ? (d as Linea[]) : [];
}

/**
 * Reproduce un diálogo sobre la escena actual y resuelve al terminar.
 * Si ya hay otro diálogo abierto, espera a que termine.
 */
export function playDialogue(scene: Phaser.Scene, id: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const abrir = () => {
      const fin = (p: { id: string }) => {
        if (p.id !== id) return;
        bus.off('dialogue:end', fin);
        resolve();
      };
      bus.on('dialogue:end', fin);
      scene.scene.launch('Dialogue', { id });
      scene.scene.bringToTop('Dialogue');
    };
    if (scene.scene.isActive('Dialogue')) {
      const esperar = () => {
        bus.off('dialogue:end', esperar);
        // Dejar que la escena anterior termine de cerrarse.
        setTimeout(abrir, 30);
      };
      bus.on('dialogue:end', esperar);
    } else {
      abrir();
    }
  });
}

const CPS = 45; // caracteres por segundo
const CAJA = { x: 12, y: GAME_HEIGHT - 92, w: GAME_WIDTH - 24, h: 82 };

export class DialogueScene extends Phaser.Scene {
  private id = '';
  private lineas: Linea[] = [];
  private idx = 0;
  private visibles = 0;
  private escribiendo = false;
  private abiertoEn = 0;
  private texto!: Phaser.GameObjects.Text;
  private nombre!: Phaser.GameObjects.Text;
  private nombreFondo!: Phaser.GameObjects.Graphics;
  private retrato?: Phaser.GameObjects.Image;
  private retratoMarco!: Phaser.GameObjects.Graphics;
  private flecha!: Phaser.GameObjects.Text;
  private prevLock = { controls: false, keys: false };
  private cerrando = false;

  constructor() {
    super('Dialogue');
  }

  init(data: { id?: string }): void {
    this.id = data?.id ?? '';
    this.lineas = getDialogue(this.id);
    this.idx = 0;
    this.visibles = 0;
    this.escribiendo = false;
    this.cerrando = false;
    this.retrato = undefined;
  }

  create(): void {
    this.abiertoEn = this.time.now;
    bus.emit('dialogue:start', { id: this.id });
    this.bloquear(true);

    if (this.lineas.length === 0) {
      console.warn(`[Dialogue] diálogo vacío o inexistente: ${this.id}`);
      this.terminar();
      return;
    }

    const s = GameState.settings.textScale || 1;

    // Caja: 9-slice si existe el marco del equipo; si no, dibujada.
    if (this.textures.exists('ui_marco')) {
      this.add
        .nineslice(CAJA.x + CAJA.w / 2, CAJA.y + CAJA.h / 2, 'ui_marco', undefined, CAJA.w, CAJA.h, 8, 8, 8, 8)
        .setAlpha(0.96);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x0b0a14, 0.92).fillRect(CAJA.x, CAJA.y, CAJA.w, CAJA.h);
      g.lineStyle(1, 0x2a6f6a, 1).strokeRect(CAJA.x + 0.5, CAJA.y + 0.5, CAJA.w - 1, CAJA.h - 1);
      g.lineStyle(1, 0xe8d9b0, 0.5).strokeRect(CAJA.x + 2.5, CAJA.y + 2.5, CAJA.w - 5, CAJA.h - 5);
      // Esquinas en rosa mexicano.
      g.fillStyle(0xe0457b, 1);
      for (const [cx, cy] of [
        [CAJA.x, CAJA.y],
        [CAJA.x + CAJA.w - 3, CAJA.y],
        [CAJA.x, CAJA.y + CAJA.h - 3],
        [CAJA.x + CAJA.w - 3, CAJA.y + CAJA.h - 3],
      ]) {
        g.fillRect(cx, cy, 3, 3);
      }
    }

    this.retratoMarco = this.add.graphics();
    this.nombreFondo = this.add.graphics();
    this.nombre = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: `${Math.round(10 * s)}px`,
      color: '#f2c14e',
      fontStyle: 'bold',
    });
    this.texto = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: `${Math.round(11 * s)}px`,
      color: '#efe6d2',
      lineSpacing: 3,
      wordWrap: { width: CAJA.w - 90, useAdvancedWrap: true },
    });
    this.flecha = this.add
      .text(CAJA.x + CAJA.w - 14, CAJA.y + CAJA.h - 14, '▼', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#7fe0c8',
      })
      .setVisible(false);
    this.tweens.add({ targets: this.flecha, y: '+=2', duration: 400, yoyo: true, repeat: -1 });
    this.add
      .text(CAJA.x + CAJA.w - 6, CAJA.y + CAJA.h + 2, 'E / Espacio', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#8b8aa0',
      })
      .setOrigin(1, 0);

    const avanzar = () => this.avanzar();
    this.input.keyboard?.on('keydown-E', avanzar);
    this.input.keyboard?.on('keydown-SPACE', avanzar);
    this.input.keyboard?.on('keydown-ENTER', avanzar);
    this.input.on('pointerdown', avanzar);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown-E', avanzar);
      this.input.keyboard?.off('keydown-SPACE', avanzar);
      this.input.keyboard?.off('keydown-ENTER', avanzar);
      this.input.off('pointerdown', avanzar);
    });

    this.mostrarLinea();
  }

  update(_t: number, delta: number): void {
    // Mantener el bloqueo aunque otro sistema lo libere a media conversación.
    if (!this.cerrando) {
      const w = this.mundo();
      if (w?.player) w.player.controlsLocked = true;
      keys.locked = true;
    }
    if (!this.escribiendo) return;
    const linea = this.lineas[this.idx];
    this.visibles = Math.min(linea.text.length, this.visibles + (CPS * delta) / 1000);
    this.texto.setText(linea.text.slice(0, Math.floor(this.visibles)));
    if (this.visibles >= linea.text.length) {
      this.escribiendo = false;
      this.flecha.setVisible(true);
    }
  }

  private mundo(): Partial<WorldApi> | undefined {
    // LevelScene implementa WorldApi; puede no existir (p. ej. diálogo lanzado desde otra escena).
    // La API del mundo vive en LevelScene.world (Phaser.Scene ya usa la propiedad `scene`).
    const lvl = this.scene.get('Level') as unknown as { world?: Partial<WorldApi> } | undefined;
    return lvl?.world;
  }

  private bloquear(on: boolean): void {
    const w = this.mundo();
    if (on) {
      this.prevLock.controls = !!w?.player?.controlsLocked;
      this.prevLock.keys = keys.locked;
      if (w?.player) w.player.controlsLocked = true;
      keys.locked = true;
    } else {
      if (w?.player) w.player.controlsLocked = this.prevLock.controls;
      keys.locked = this.prevLock.keys;
      keys.clear();
    }
  }

  private mostrarLinea(): void {
    const linea = this.lineas[this.idx];
    const h = HABLANTES[linea.who] ?? { nombre: linea.who, retrato: '' };
    const hayRetrato = !!h.retrato && this.textures.exists(h.retrato);

    this.retrato?.destroy();
    this.retrato = undefined;
    this.retratoMarco.clear();
    const px = CAJA.x + 10;
    const py = CAJA.y + 17;
    if (hayRetrato) {
      this.retratoMarco.fillStyle(0x15131f, 1).fillRect(px - 2, py - 2, 52, 52);
      this.retratoMarco.lineStyle(1, 0x2a6f6a, 1).strokeRect(px - 1.5, py - 1.5, 51, 51);
      this.retrato = this.add.image(px, py, h.retrato).setOrigin(0, 0).setDisplaySize(48, 48);
    } else if (h.nombre) {
      // Retrato de respaldo: silueta simple con el color del hablante.
      const col = linea.who === 'mama' ? 0xb0607e : 0x4e8f86;
      this.retratoMarco.fillStyle(0x15131f, 1).fillRect(px - 2, py - 2, 52, 52);
      this.retratoMarco.lineStyle(1, 0x2a6f6a, 1).strokeRect(px - 1.5, py - 1.5, 51, 51);
      this.retratoMarco.fillStyle(col, 1).fillCircle(px + 24, py + 20, 11);
      this.retratoMarco.fillRect(px + 10, py + 33, 28, 15);
      this.retratoMarco.fillStyle(0x8ff7e1, 1).fillRect(px + 22, py + 38, 4, 4); // gema
    }
    const conRetrato = hayRetrato || !!h.nombre;
    const tx = conRetrato ? CAJA.x + 70 : CAJA.x + 16;
    this.texto.setPosition(tx, CAJA.y + (h.nombre ? 18 : 12));
    this.texto.setWordWrapWidth(CAJA.x + CAJA.w - 16 - tx, true);
    this.texto.setFontStyle(linea.who === 'narrador' ? 'italic' : '');
    this.texto.setColor(linea.who === 'narrador' ? '#cfd8d4' : linea.who === 'mama' ? '#f4d6e2' : '#efe6d2');

    this.nombreFondo.clear();
    this.nombre.setText(h.nombre);
    this.nombre.setPosition(tx, CAJA.y + 5);
    if (h.nombre) {
      this.nombreFondo.fillStyle(0xe0457b, 1).fillRect(tx - 4, CAJA.y + 15, this.nombre.width + 8, 1);
    }

    this.texto.setText('');
    this.visibles = 0;
    this.escribiendo = true;
    this.flecha.setVisible(false);
  }

  private avanzar(): void {
    if (this.cerrando) return;
    // Evita que la misma pulsación que abrió el diálogo lo adelante.
    if (this.time.now - this.abiertoEn < 220) return;
    if (this.escribiendo) {
      const linea = this.lineas[this.idx];
      this.visibles = linea.text.length;
      this.texto.setText(linea.text);
      this.escribiendo = false;
      this.flecha.setVisible(true);
      return;
    }
    sfx('ui_aceptar');
    this.idx++;
    if (this.idx >= this.lineas.length) this.terminar();
    else this.mostrarLinea();
  }

  private terminar(): void {
    if (this.cerrando) return;
    this.cerrando = true;
    this.bloquear(false);
    const id = this.id;
    this.scene.stop();
    bus.emit('dialogue:end', { id });
  }
}
