import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { prepareTuxtlaEntry } from '../systems/Campaign';

// Dueño: contenido. Cierre del Nivel 1 (AGENTS.md §5.2 paso 8):
// 1) pantalla de carga narrativa: el auto compartido con estudiantes rumbo a Los Tuxtlas;
// 2) "Continuará" con el mapa de la ruta de los 10 niveles;
// 3) resumen (Ecos, conjuros) y volver al título.

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

const TEXTOS_VIAJE = [
  'Para salir de Xalapa, consigues lugar en un auto viejo compartido.',
  'Viajas con un grupo de estudiantes foráneos que van al sur a ver a sus familias.',
  '—¿También vas a Los Tuxtlas? —te pregunta una de ellas—. Hace mucho que no veo a mi abuela.',
  'Por la ventana, la niebla de Xalapa se queda atrás. En tu mochila, el Códice de las Voces.',
];

/** Ruta de los 10 niveles (NDD v2 §2). Posiciones aproximadas en un mapa estilizado de México. */
const RUTA: Array<{ n: string; nombre: string; x: number; y: number; dx?: number; dy?: number }> = [
  { n: '1', nombre: 'Xalapa', x: 457, y: 188, dx: 8, dy: -12 },
  { n: '2', nombre: 'San Andrés Tuxtla', x: 532, y: 246, dx: -4, dy: 10 },
  { n: '3', nombre: 'Catemaco', x: 566, y: 232, dx: 6, dy: -12 },
  { n: '4', nombre: 'Oaxaca', x: 466, y: 300, dx: 8, dy: 2 },
  { n: '5', nombre: 'Puebla', x: 394, y: 214, dx: -4, dy: 10 },
  { n: '6–7', nombre: 'Ciudad de México', x: 348, y: 194, dx: -60, dy: -16 },
  { n: '8', nombre: 'Guanajuato', x: 244, y: 130, dx: 6, dy: -12 },
  { n: '9', nombre: 'Jalisco', x: 140, y: 150, dx: -30, dy: -16 },
  { n: '10', nombre: 'Guadalajara', x: 158, y: 172, dx: -40, dy: 10 },
];

/** Silueta muy simplificada de México (para cuando no hay arte de mapa_ruta). */
const CONTORNO = [
  [20, 30], [120, 40], [200, 60], [260, 70], [310, 110], [360, 150], [420, 160], [470, 175], [520, 210],
  [580, 215], [600, 190], [630, 170], [632, 230], [600, 262], [560, 280], [520, 300], [480, 330], [420, 320],
  [360, 290], [300, 262], [240, 230], [190, 210], [150, 190], [120, 160], [90, 120], [60, 80], [30, 60],
];

export class EndingScene extends Phaser.Scene {
  private fase: 'viaje' | 'mapa' | 'resumen' = 'viaje';
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
      fontFamily: 'monospace',
      fontSize: `${Math.round(11 * (GameState.settings.textScale || 1))}px`,
      color: '#efe6d2',
      wordWrap: { width: W - 48, useAdvancedWrap: true },
      lineSpacing: 3,
    });
    this.add
      .text(W - 12, 10, 'Rumbo a Los Tuxtlas…', { fontFamily: 'monospace', fontSize: '9px', color: '#8ff7e1' })
      .setOrigin(1, 0);

    let i = 0;
    const siguiente = () => {
      if (this.fase !== 'viaje') return;
      if (i >= TEXTOS_VIAJE.length) {
        this.add
          .text(W - 12, H - 14, 'E / Espacio', { fontFamily: 'monospace', fontSize: '8px', color: '#8b8aa0' })
          .setOrigin(1, 0);
        this.time.delayedCall(3500, () => this.fase === 'viaje' && this.irMapa());
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

  /* ------------------------------ 2. Continuará + mapa ------------------------------ */

  private irMapa(): void {
    if (this.fase !== 'viaje') return;
    this.fase = 'mapa';
    this.listoEn = this.time.now;
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.time.delayedCall(650, () => {
      this.tweens.killAll();
      this.children.removeAll(true);
      this.cameras.main.fadeIn(800, 0, 0, 0);
      this.dibujarMapa();
    });
  }

  private dibujarMapa(): void {
    if (this.textures.exists('mapa_ruta')) {
      this.add.image(W / 2, H / 2, 'mapa_ruta').setDisplaySize(W, H);
    } else {
      const fondo = this.add.graphics();
      fondo.fillStyle(0x0d1420, 1).fillRect(0, 0, W, H);
      // Cuadrícula de pergamino digital.
      fondo.lineStyle(1, 0x1a2a38, 1);
      for (let x = 0; x < W; x += 32) fondo.lineBetween(x + 0.5, 0, x + 0.5, H);
      for (let y = 0; y < H; y += 32) fondo.lineBetween(0, y + 0.5, W, y + 0.5);
      const pts = CONTORNO.map(([x, y]) => new Phaser.Math.Vector2(x, y));
      fondo.fillStyle(0x1c2b26, 1).fillPoints(pts, true);
      fondo.lineStyle(1, 0x3f6e5f, 1).strokePoints(pts, true);
    }

    // Ruta punteada que se dibuja poco a poco.
    const ruta = this.add.graphics();
    const segs: Array<[number, number, number, number]> = [];
    for (let i = 0; i < RUTA.length - 1; i++) segs.push([RUTA[i].x, RUTA[i].y, RUTA[i + 1].x, RUTA[i + 1].y]);
    const prog = { t: 0 };
    this.tweens.add({
      targets: prog,
      t: segs.length,
      duration: 4200,
      delay: 700,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        ruta.clear();
        ruta.fillStyle(0xf2c14e, 1);
        for (let i = 0; i < segs.length && i < prog.t; i++) {
          const [x0, y0, x1, y1] = segs[i];
          const f = Math.min(1, prog.t - i);
          const len = Math.hypot(x1 - x0, y1 - y0);
          for (let d = 0; d < len * f; d += 6) {
            const k = d / len;
            ruta.fillRect(Math.round(x0 + (x1 - x0) * k), Math.round(y0 + (y1 - y0) * k), 2, 2);
          }
        }
      },
    });

    RUTA.forEach((c, i) => {
      const actual = i === 0;
      const punto = this.add.circle(c.x, c.y, actual ? 5 : 3, actual ? 0x8ff7e1 : 0xe0457b).setAlpha(0);
      const label = this.add
        .text(c.x + (c.dx ?? 6), c.y + (c.dy ?? -12), `${c.n} · ${c.nombre}`, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: actual ? '#8ff7e1' : '#efe6d2',
          backgroundColor: '#07060dcc',
          padding: { x: 2, y: 1 },
        })
        .setAlpha(0);
      this.tweens.add({ targets: [punto, label], alpha: 1, duration: 300, delay: 700 + i * 460 });
      if (actual) this.tweens.add({ targets: punto, scale: 1.6, duration: 700, yoyo: true, repeat: -1 });
    });

    this.add
      .text(W / 2, 22, 'Rumbo a San Andrés Tuxtla', { fontFamily: 'monospace', fontSize: '19px', color: '#f2c14e', fontStyle: 'bold' })
      .setOrigin(0.5, 0);
    this.add
      .text(W / 2, 50, 'La ruta del Códice de las Voces: seis fragmentos del sello', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#cfd8d4',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(W - 12, H - 14, 'E / Espacio', { fontFamily: 'monospace', fontSize: '8px', color: '#8b8aa0' })
      .setOrigin(1, 0);
    sfx('aprender');
  }

  /* ------------------------------ 3. resumen ------------------------------ */

  private irResumen(): void {
    this.fase = 'resumen';
    this.listoEn = this.time.now;
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.time.delayedCall(550, () => {
      this.tweens.killAll();
      this.children.removeAll(true);
      this.cameras.main.fadeIn(600, 0, 0, 0);
      const ecos = Math.max(GameState.totalEcosEarned || 0, GameState.ecos || 0);
      const conjuros = GameState.learnedSpells.length ? GameState.learnedSpells.join(' · ') : '—';
      const mejoras = Object.entries(GameState.upgrades)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k} ${n}`)
        .join(' · ');
      const lineas = [
        'Nivel 1 · Xalapa: el misterio del Parque Juárez',
        '',
        `Ecos liberados: ${ecos}`,
        `Conjuros aprendidos: ${conjuros}`,
        `Mejoras del altar: ${mejoras || 'ninguna'}`,
        'Recompensa: el Códice de las Voces y el mapa',
        '',
        '«La memoria de un pueblo vive en quienes la comparten.»',
      ];
      this.add
        .text(W / 2, 40, 'ECOS', { fontFamily: 'monospace', fontSize: '28px', color: '#8ff7e1', fontStyle: 'bold' })
        .setOrigin(0.5, 0);
      this.add
        .text(W / 2, 96, lineas.join('\n'), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#efe6d2',
          align: 'center',
          lineSpacing: 5,
        })
        .setOrigin(0.5, 0);
      this.add
        .text(W / 2, H - 50, 'Gracias por jugar · Listick Games', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#e0457b',
        })
        .setOrigin(0.5, 0);
      this.add
        .text(W / 2, H - 28, 'E / Espacio: continuar a San Andrés Tuxtla', { fontFamily: 'monospace', fontSize: '9px', color: '#8b8aa0' })
        .setOrigin(0.5, 0);
    });
  }

  private avanzar(): void {
    if (this.time.now - this.listoEn < 700) return;
    if (this.fase === 'viaje') {
      if (this.listoEn === 0) return; // aún no aparece el primer texto
      this.irMapa();
    } else if (this.fase === 'mapa') {
      this.irResumen();
    } else {
      sfx('ui_aceptar');
      prepareTuxtlaEntry();
      this.scene.start('Level', { section: 'tuxtla' });
    }
  }
}
