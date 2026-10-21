import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { prepareTuxtlaEntry } from '../systems/Campaign';

import { FUENTE, tamFuente } from '../ui/fuente';
// Dueño: contenido. Cierre del Nivel 1 (AGENTS.md §5.2 paso 8):
// pantalla de carga narrativa (el auto compartido con estudiantes rumbo a Los Tuxtlas) y, al terminar,
// continúa directo a San Andrés Tuxtla (Nivel 2). El mapa animado de la ruta y el resumen se quitaron
// (decisión del equipo, 2026-10-19: los niveles ya tienen continuidad).

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

const TEXTOS_VIAJE = [
  'Para salir de Xalapa, consigues lugar en un auto viejo compartido.',
  'Viajas con un grupo de estudiantes foráneos que van al sur a ver a sus familias.',
  '—¿También vas a Los Tuxtlas? —te pregunta una de ellas—. Hace mucho que no veo a mi abuela.',
  'Por la ventana, la niebla de Xalapa se queda atrás. En tu mochila, el Códice de las Voces.',
];

export class EndingScene extends Phaser.Scene {
  private fase: 'viaje' | 'saliendo' = 'viaje';
  private listoEn = 0;
  private capas: Array<{ objs: Phaser.GameObjects.GameObject[]; vel: number }> = [];

  constructor() {
    super('Ending');
  }

  create(): void {
    keys.locked = false;
    keys.clear();
    this.capas = [];
    this.fase = 'viaje';
    this.listoEn = 0;
    this.cameras.main.setBackgroundColor('#07060d');
    bus.emit('music', { track: 'n01_exploracion' });
    this.viaje();

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
  }

  update(_t: number, delta: number): void {
    if (this.fase !== 'viaje') return;
    const dt = delta / 1000;
    for (const c of this.capas) {
      for (const o of c.objs) {
        const g = o as unknown as { x: number };
        g.x -= c.vel * dt;
        if (g.x < -80) g.x += W + 160;
      }
    }
  }

  /* ------------------------------ 1. el viaje ------------------------------ */

  private viaje(): void {
    this.cameras.main.fadeIn(900, 0, 0, 0);
    if (this.textures.exists('pantalla_carga')) {
      this.add.image(W / 2, H / 2, 'pantalla_carga').setDisplaySize(W, H);
    } else {
      this.dibujarCarretera();
    }

    const caja = this.add.graphics();
    caja.fillStyle(0x07060d, 0.75).fillRect(0, H - 62, W, 62);
    caja.fillStyle(0xe0457b, 1).fillRect(0, H - 62, W, 1);
    const texto = this.add.text(24, H - 50, '', {
      fontFamily: FUENTE,
      fontSize: `${tamFuente(Math.round(11 * (GameState.settings.textScale || 1)))}px`,
      color: '#efe6d2',
      wordWrap: { width: W - 48, useAdvancedWrap: true },
      lineSpacing: 3,
    });
    this.add
      .text(W - 12, 10, 'Rumbo a Los Tuxtlas…', { fontFamily: FUENTE, fontSize: '11px', color: '#8ff7e1' })
      .setOrigin(1, 0);

    let i = 0;
    const siguiente = () => {
      if (this.fase !== 'viaje') return;
      if (i >= TEXTOS_VIAJE.length) {
        this.add
          .text(W - 12, H - 14, 'E / Espacio', { fontFamily: FUENTE, fontSize: '11px', color: '#8b8aa0' })
          .setOrigin(1, 0);
        this.time.delayedCall(3500, () => this.irTuxtla());
        return;
      }
      if (i === 0) this.listoEn = this.time.now;
      texto.setText(TEXTOS_VIAJE[i++]);
      texto.setAlpha(0);
      this.tweens.add({ targets: texto, alpha: 1, duration: 500 });
      this.time.delayedCall(3600, siguiente);
    };
    this.time.delayedCall(700, siguiente);
  }

  private dibujarCarretera(): void {
    // Cielo nocturno.
    const cielo = this.add.graphics();
    cielo.fillGradientStyle(0x0b0f24, 0x0b0f24, 0x2b2346, 0x2b2346, 1).fillRect(0, 0, W, 220);
    for (let i = 0; i < 70; i++) {
      const s = this.add.rectangle(Math.random() * W, Math.random() * 170, 1, 1, 0xffffff, 0.3 + Math.random() * 0.6);
      this.tweens.add({ targets: s, alpha: 0.1, duration: 800 + Math.random() * 1600, yoyo: true, repeat: -1 });
    }
    this.add.circle(520, 52, 12, 0xf3ecd2, 1);
    this.add.circle(526, 48, 11, 0x0b0f24, 1); // luna menguante

    // Montañas lejanas y cerros (parallax).
    const montes = (color: number, base: number, alto: number, vel: number, paso: number) => {
      const objs: Phaser.GameObjects.GameObject[] = [];
      for (let x = -80; x < W + 160; x += paso) {
        const h = alto * (0.6 + Math.random() * 0.5);
        const tri = this.add.triangle(x, base - h, 0, h, paso * 0.8, 0, paso * 1.6, h, color).setOrigin(0, 0);
        objs.push(tri);
      }
      this.capas.push({ objs, vel });
    };
    montes(0x1c1a33, 222, 70, 6, 120);
    montes(0x15241f, 236, 46, 18, 90);

    // Suelo, carretera y líneas.
    const g = this.add.graphics();
    g.fillStyle(0x0f1a16, 1).fillRect(0, 236, W, H - 236);
    g.fillStyle(0x24232b, 1).fillRect(0, 262, W, 44);
    g.fillStyle(0x3a3944, 1).fillRect(0, 262, W, 2);
    const lineas: Phaser.GameObjects.GameObject[] = [];
    for (let x = 0; x < W + 160; x += 48) lineas.push(this.add.rectangle(x, 284, 22, 2, 0xe8d9b0, 0.8));
    this.capas.push({ objs: lineas, vel: 220 });

    // Postes y árboles cercanos.
    const cerca: Phaser.GameObjects.GameObject[] = [];
    for (let x = 0; x < W + 160; x += 140) {
      cerca.push(this.add.rectangle(x, 246, 3, 40, 0x2a2730).setOrigin(0.5, 1));
      cerca.push(this.add.circle(x + 60, 236, 16, 0x112018));
    }
    this.capas.push({ objs: cerca, vel: 120 });

    // El auto viejo compartido (con estudiantes en las ventanas).
    const auto = this.add.container(260, 282);
    const a = this.add.graphics();
    a.fillStyle(0x000000, 0.35).fillEllipse(48, 20, 110, 8);
    a.fillStyle(0x6f8f86, 1).fillRect(0, 0, 100, 16); // carrocería
    a.fillStyle(0x6f8f86, 1).fillRect(18, -14, 58, 14); // cabina
    a.fillStyle(0x2e3b44, 1).fillRect(22, -11, 22, 10).fillRect(48, -11, 24, 10); // ventanas
    a.fillStyle(0xe8b78a, 1).fillCircle(30, -5, 3).fillCircle(38, -5, 3).fillCircle(56, -5, 3).fillCircle(65, -5, 3);
    a.fillStyle(0x8ff7e1, 1).fillRect(55, -2, 2, 2); // la gema
    a.fillStyle(0x4b5f59, 1).fillRect(0, 10, 100, 2);
    a.fillStyle(0xd8a04a, 1).fillRect(36, -18, 30, 4); // mochilas en el techo
    a.fillStyle(0xfff3b0, 1).fillRect(98, 3, 3, 4); // faro
    a.fillStyle(0xe0457b, 1).fillRect(0, 3, 2, 4); // calavera trasera
    a.fillStyle(0x15141a, 1).fillCircle(20, 16, 7).fillCircle(80, 16, 7);
    a.fillStyle(0x6b6a72, 1).fillCircle(20, 16, 3).fillCircle(80, 16, 3);
    auto.add(a);
    // Haz de luz de los faros.
    const haz = this.add.triangle(360, 285, 0, 14, 120, 0, 120, 28, 0xfff3b0, 0.12).setOrigin(0, 0.5);
    this.tweens.add({ targets: [auto], y: '+=1', duration: 180, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: haz, alpha: 0.6, duration: 900, yoyo: true, repeat: -1 });
  }

  private avanzar(): void {
    if (this.fase !== 'viaje') return;
    if (this.listoEn === 0) return; // aún no aparece el primer texto
    if (this.time.now - this.listoEn < 700) return;
    this.irTuxtla();
  }

  /** Continuidad: del viaje se pasa directo a San Andrés Tuxtla (Nivel 2). */
  private irTuxtla(): void {
    if (this.fase !== 'viaje') return;
    this.fase = 'saliendo';
    sfx('ui_aceptar');
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.time.delayedCall(650, () => {
      prepareTuxtlaEntry();
      this.scene.start('Level', { section: 'tuxtla' });
    });
  }
}
