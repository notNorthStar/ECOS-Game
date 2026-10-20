import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState, resetGameState } from '../core/GameState';
import { camView, lsm, showCamera } from '../systems/Lsm';
import { COL, onDomKey, panel, txt } from './SpellScene';
import { prepareCatemacoEntry, prepareCdmx2Entry, prepareCdmxEntry, prepareOaxacaEntry, prepareTuxtlaEntry } from '../systems/Campaign';
import type { SectionId } from '../core/contracts';

/**
 * Dueño: lsm. Título "ECOS" + elegir cámara o solo teclado + privacidad + prueba en vivo de la cámara
 * (MODULO_LSM.md "Pantalla de cámara"). Termina con resetGameState() (conserva settings) y Level 'taller'.
 */
type Phase = 'menu' | 'waiting' | 'test' | 'failed';

type EntrySection = SectionId;
type MenuEntry = { label: string; act: () => void; color?: string };

/** Nivel 1 a media partida: láser, tutorial, CALMA y (desde el jefe) PROTECCIÓN, como si se hubiera jugado. */
function prepareXalapa(section: 'calles' | 'parque' | 'jefe'): () => void {
  return () => {
    GameState.hasLaser = true;
    const learn = (id: string) => {
      if (!GameState.learnedSpells.includes(id)) GameState.learnedSpells.push(id);
      GameState.mastery[id] ??= { level: 0, progress: 0 };
    };
    learn('CALMA');
    GameState.selectedSpell = 'CALMA';
    for (const f of ['intro', 'tutorial', 'tut_salto', 'tut_esquiva', 'tut_verde', 'tut_rojo', 'calma', 'gema']) GameState.flags[f] = true;
    if (section !== 'calles') for (const f of ['in_calles', 'altar_intro', 'altar', 'letras']) GameState.flags[f] = true;
    if (section === 'jefe') {
      learn('PROTECCION');
      for (const f of ['in_parque', 'arena_parque1', 'arena_parque2', 'proteccion']) GameState.flags[f] = true;
    }
  };
}

/** Selector de niveles (pruebas): cada sección con lo que el jugador ya tendría al llegar ahí. Puebla (N5) se omite. */
const LEVEL_SELECT: ReadonlyArray<{ label: string; section: EntrySection; prep: (() => void) | null }> = [
  { label: 'Nivel 1 · Xalapa — Taller de mamá', section: 'taller', prep: null },
  { label: 'Nivel 1 · Xalapa — Calles', section: 'calles', prep: prepareXalapa('calles') },
  { label: 'Nivel 1 · Xalapa — Parque Juárez', section: 'parque', prep: prepareXalapa('parque') },
  { label: 'Nivel 1 · Xalapa — Jefe: Chaneque Mayor', section: 'jefe', prep: prepareXalapa('jefe') },
  { label: 'Nivel 2 · San Andrés Tuxtla', section: 'tuxtla', prep: prepareTuxtlaEntry },
  { label: 'Nivel 3 · Catemaco — Pueblo y brujos', section: 'catemaco', prep: prepareCatemacoEntry },
  { label: 'Nivel 3 · Catemaco — Lago y campamento', section: 'campamento', prep: prepareCatemacoEntry },
  { label: 'Nivel 3 · Catemaco — Jefe: Cabeza Olmeca', section: 'altar_olmeca', prep: prepareCatemacoEntry },
  { label: 'Nivel 4 · Oaxaca — Ciudad y artesanos', section: 'oaxaca', prep: prepareOaxacaEntry },
  { label: 'Nivel 4 · Oaxaca — Callejones', section: 'callejones', prep: prepareOaxacaEntry },
  { label: 'Nivel 4 · Oaxaca — Jefa: Bruja Guajolote', section: 'santo_domingo', prep: prepareOaxacaEntry },
  { label: 'Nivel 6 · CDMX — Xochimilco', section: 'xochimilco', prep: prepareCdmxEntry },
  { label: 'Nivel 6 · CDMX — Avenidas', section: 'avenidas', prep: prepareCdmxEntry },
  { label: 'Nivel 6 · CDMX — Jefa: la Nahuala', section: 'reforma', prep: prepareCdmxEntry },
  { label: 'Nivel 7 · CDMX 2 — Teleférico', section: 'teleferico', prep: prepareCdmx2Entry },
  { label: 'Nivel 7 · CDMX 2 — Torre de control', section: 'torre', prep: prepareCdmx2Entry },
  { label: 'Nivel 7 · CDMX 2 — Jefe: Rey del Olvido', section: 'salon_trono', prep: prepareCdmx2Entry },
];

export class TitleScene extends Phaser.Scene {
  private phase: Phase = 'menu';
  private entrySection: EntrySection = 'taller';
  /** Lo que el jugador ya tendría al llegar a esa sección (null = partida nueva desde el taller). */
  private entryPrep: (() => void) | null = null;
  private inLevelSelect = false;
  private useCamera = false;
  private menuLayer?: Phaser.GameObjects.Container;
  private menuIdx = 0;
  private menuItems: Array<{ label: Phaser.GameObjects.Text; act: () => void; color?: string }> = [];
  private cursor?: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;
  private liveLetter?: Phaser.GameObjects.Text;
  private liveTop?: Phaser.GameObjects.Text;
  private motes: Array<{ o: Phaser.GameObjects.Rectangle; vx: number; vy: number }> = [];
  private fogs: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super('Title');
  }

  create(): void {
    this.phase = 'menu';
    this.entrySection = 'taller';
    this.entryPrep = null;
    this.inLevelSelect = false;
    this.useCamera = lsm.cameraReady;
    this.menuLayer = undefined;
    this.menuIdx = 0;
    this.menuItems = [];
    this.motes = [];
    this.fogs = [];
    this.overlay = undefined;
    // La partida no corre: nada de detección hasta elegir.
    lsm.setMode('off');
    camView.hide();
    void lsm.preload().catch((err: unknown) => console.warn('[ECOS] No se pudo precargar el modelo de manos', err));
    bus.emit('music', { track: 'titulo' });

    this.drawBackground();
    this.drawLogo();

    this.showMainMenu();

    txt(this, 320, 260, 'La cámara se procesa en tu equipo; no se graba ni se envía nada.', 8, COL.teal, { ox: 0.5 });
    txt(this, 320, 274, 'El juego se puede terminar completo solo con teclado.', 8, COL.dim, { ox: 0.5 });
    txt(
      this,
      320,
      300,
      'Aviso: esquivar con doble Shift puede abrir "Teclas especiales" de Windows (5 Shift seguidos).\nUsa C para esquivar, o desactívalo en Configuración → Accesibilidad → Teclado → Teclas especiales.',
      8,
      COL.dim,
      { ox: 0.5, align: 'center', wrap: 600 },
    );
    txt(this, 320, 340, '↑↓ · Enter · ratón · Esc: volver            Listick Games · Game Jam ANIEI 2026', 8, COL.dim, { ox: 0.5 });

    onDomKey(this, (e) => this.onKey(e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      camView.hide();
      lsm.setMode('off');
    });
  }

  /* ----------------------------- fondo ----------------------------- */
  private drawBackground(): void {
    const g = this.add.graphics();
    // cielo nocturno en bandas (pixel art: sin degradados suaves)
    const bands = [0x07060d, 0x0a0a16, 0x0d1020, 0x10162a, 0x131d33, 0x16263a, 0x183040];
    bands.forEach((c, i) => g.fillStyle(c, 1).fillRect(0, i * 30, 640, 30));
    g.fillStyle(0x183040, 1).fillRect(0, 210, 640, 150);
    // estrellas
    const rnd = new Phaser.Math.RandomDataGenerator(['ecos']);
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0xcfd8ff, rnd.realInRange(0.2, 0.8)).fillRect(rnd.between(0, 639), rnd.between(0, 150), 1, 1);
    }
    // Pico de Orizaba lejano y ciudad (siluetas)
    g.fillStyle(0x1b2a40, 1).fillTriangle(380, 210, 470, 120, 560, 210);
    g.fillStyle(0xbfd0e0, 0.5).fillTriangle(452, 138, 470, 120, 488, 138);
    g.fillStyle(0x0f1a2a, 1);
    let x = 0;
    while (x < 640) {
      const w = rnd.between(18, 46);
      const h = rnd.between(18, 64);
      g.fillRect(x, 230 - h, w, h + 130);
      // ventanas con neón cálido
      for (let k = 0; k < 3; k++) {
        if (rnd.frac() < 0.5) g.fillStyle(rnd.pick([0xf2c86b, 0xe86a92, 0x3cc4b8]), 0.7).fillRect(x + rnd.between(3, w - 5), 230 - h + rnd.between(4, h), 2, 2);
        g.fillStyle(0x0f1a2a, 1);
      }
      x += w + rnd.between(0, 4);
    }
    g.fillStyle(0x0a121e, 1).fillRect(0, 280, 640, 80);
    // niebla verde de Xalapa
    for (let i = 0; i < 3; i++) {
      const f = this.add.graphics();
      f.fillStyle(0x7fa8a0, 0.06 + i * 0.02);
      for (let k = 0; k < 8; k++) f.fillEllipse(k * 110, 0, 180, 26);
      f.setPosition(-60 - i * 40, 210 + i * 26);
      this.fogs.push(f);
    }
    // luciérnagas / motas
    for (let i = 0; i < 26; i++) {
      const o = this.add.rectangle(rnd.between(0, 640), rnd.between(150, 350), 1, 1, rnd.pick([0xf2c86b, 0x7fe0d0]), 0.8);
      this.motes.push({ o, vx: rnd.realInRange(-6, 6), vy: rnd.realInRange(-8, -2) });
    }
    // viñeta
    const v = this.add.graphics();
    for (let i = 0; i < 6; i++) {
      v.lineStyle(10, 0x000000, 0.12).strokeRect(i * 6 - 5, i * 6 - 5, 640 - i * 12 + 10, 360 - i * 12 + 10);
    }
  }

  private drawLogo(): void {
    if (this.textures.exists('titulo_logo')) {
      const img = this.add.image(320, 92, 'titulo_logo');
      this.tweens.add({ targets: img, y: 96, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      return;
    }
    // Texto "ECOS" con brillo (eco desplazado) mientras no exista titulo_logo.
    const echoes: Phaser.GameObjects.Text[] = [];
    for (let i = 3; i >= 1; i--) {
      const e = txt(this, 320, 88, 'ECOS', 64, COL.teal, { ox: 0.5, oy: 0.5, stroke: false });
      e.setAlpha(0.12 * (4 - i));
      e.setScale(1 + i * 0.06);
      echoes.push(e);
    }
    const main = txt(this, 320, 88, 'ECOS', 64, '#e8f6f2', { ox: 0.5, oy: 0.5 });
    main.setStroke('#0b2a2c', 8);
    main.setShadow(0, 0, '#3cc4b8', 12, true, true);
    echoes.forEach((e, i) =>
      this.tweens.add({
        targets: e,
        scale: e.scale + 0.08,
        alpha: 0,
        duration: 2200,
        delay: i * 500,
        repeat: -1,
        ease: 'Sine.Out',
      }),
    );
    txt(this, 320, 132, 'El misterio del Parque Juárez', 12, COL.gold, { ox: 0.5 });
    txt(this, 320, 150, 'Conjuros deletreados en Lengua de Señas Mexicana', 8, COL.dim, { ox: 0.5 });
  }

  update(_t: number, dtMs: number): void {
    const dt = dtMs / 1000;
    for (const m of this.motes) {
      m.o.x += m.vx * dt;
      m.o.y += m.vy * dt;
      if (m.o.y < 140) {
        m.o.y = 350;
        m.o.x = Phaser.Math.Between(0, 640);
      }
      m.o.setAlpha(0.4 + 0.4 * Math.sin((m.o.x + this.time.now / 300) * 0.5));
    }
    this.fogs.forEach((f, i) => {
      f.x += (4 + i * 3) * dt;
      if (f.x > 0) f.x -= 110;
    });
    if (this.phase === 'test') {
      const now = performance.now();
      const p = lsm.read(now);
      this.liveLetter?.setText(p.letter ?? '·');
      const ex = lsm.explain();
      this.liveTop?.setText(ex ? ex.top : 'Pon tu mano frente a la cámara');
      showCamera(this.game.canvas, 232, 92, 176, 132);
      camView.drawLandmarks(lsm.tracker.lastFrame);
    }
  }

  /* ----------------------------- menú ----------------------------- */

  /** Construye una lista de opciones (reemplaza la anterior). */
  private buildMenu(entries: MenuEntry[], y0: number, step: number, size: number, backdrop?: { y: number; h: number }): void {
    this.menuLayer?.destroy();
    const c = this.add.container(0, 0);
    if (backdrop) {
      c.add(this.add.rectangle(0, 0, 640, 360, 0x05060a, 0.82).setOrigin(0));
      c.add(panel(this, 96, backdrop.y, 448, backdrop.h, COL.tealN));
    }
    this.menuItems = [];
    entries.forEach(({ label: s, act, color }, i) => {
      const label = txt(this, 320, Math.round(y0 + i * step), s, size, color ?? COL.ink, { ox: 0.5 });
      label.setInteractive({ useHandCursor: true });
      label.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.select(i));
      label.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (this.phase === 'menu') this.activate(i);
      });
      c.add(label);
      this.menuItems.push({ label, act, color });
    });
    this.cursor = txt(this, 0, 0, '>', size + 2, COL.gold);
    c.add(this.cursor);
    this.menuLayer = c;
    this.menuIdx = 0;
    this.select(0, true);
  }

  private showMainMenu(): void {
    this.inLevelSelect = false;
    const ready = lsm.cameraReady;
    this.buildMenu(
      [
        { label: ready ? '1 · Jugar · Cámara activa' : '1 · Jugar · Con cámara', act: () => this.begin('taller', null, true) },
        { label: '2 · Jugar · Solo teclado', act: () => this.begin('taller', null, false) },
        { label: '3 · Seleccionar nivel', act: () => this.showLevelSelect() },
      ],
      168,
      18,
      12,
    );
  }

  /** Selector de niveles y secciones (para probar sin pasarse el juego completo). */
  private showLevelSelect(): void {
    this.inLevelSelect = true;
    const cam = this.useCamera ? 'SÍ' : 'NO (solo teclado)';
    const entries: MenuEntry[] = [
      { label: `Cámara: ${cam}  ·  Enter para cambiar`, act: () => { this.useCamera = !this.useCamera; const i = this.menuIdx; this.showLevelSelect(); this.select(i, true); }, color: COL.teal },
      ...LEVEL_SELECT.map((l) => ({ label: l.label, act: () => this.begin(l.section, l.prep, this.useCamera) })),
      { label: '← Volver (Esc)', act: () => this.showMainMenu(), color: COL.dim },
    ];
    this.buildMenu(entries, 30, 16, 8, { y: 12, h: 340 });
    this.menuLayer?.add(txt(this, 320, 16, 'SELECCIONAR NIVEL', 10, COL.gold, { ox: 0.5 }));
  }

  /** Arranca en una sección: prepara lo que el jugador ya tendría al llegar ahí y elige cámara o teclado. */
  private begin(section: EntrySection, prep: (() => void) | null, camera: boolean): void {
    this.entrySection = section;
    this.entryPrep = prep;
    if (camera) void this.chooseCamera();
    else this.chooseKeyboard();
  }

  private select(i: number, silent = false): void {
    if (this.phase !== 'menu') return;
    if (i !== this.menuIdx && !silent) sfx('ui_mover');
    this.menuIdx = i;
    this.menuItems.forEach((m, j) => m.label.setColor(j === i ? COL.gold : (m.color ?? COL.ink)));
    const l = this.menuItems[i].label;
    this.cursor?.setPosition(Math.round(l.x - l.width / 2 - 16), l.y);
  }

  private activate(i: number): void {
    sfx('ui_aceptar');
    this.menuItems[i].act();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.phase === 'menu') {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.select((this.menuIdx + this.menuItems.length - 1) % this.menuItems.length);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.select((this.menuIdx + 1) % this.menuItems.length);
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') this.activate(this.menuIdx);
      else if (e.code === 'Escape' && this.inLevelSelect) this.showMainMenu();
      else if (!this.inLevelSelect && (e.code === 'Digit1' || e.code === 'Numpad1')) this.activate(0);
      else if (!this.inLevelSelect && (e.code === 'Digit2' || e.code === 'Numpad2')) this.activate(1);
      else if (!this.inLevelSelect && (e.code === 'Digit3' || e.code === 'Numpad3')) this.activate(2);
    } else if (this.phase === 'test' || this.phase === 'failed') {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter' || e.code === 'Escape') this.startGame();
    }
  }

  private showOverlay(h = 210): Phaser.GameObjects.Container {
    this.overlay?.destroy();
    const c = this.add.container(0, 0);
    c.add(this.add.rectangle(0, 0, 640, 360, 0x05060a, 0.78).setOrigin(0));
    c.add(panel(this, 120, Math.round(180 - h / 2), 400, h, COL.tealN));
    this.overlay = c;
    return c;
  }

  private button(c: Phaser.GameObjects.Container, y: number, label: string, fn: () => void): void {
    const t = txt(this, 320, y, `[ ${label} ]`, 12, COL.gold, { ox: 0.5 });
    t.setInteractive({ useHandCursor: true });
    t.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => t.setColor('#ffffff'));
    t.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => t.setColor(COL.gold));
    t.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, fn);
    c.add(t);
  }

  private async chooseCamera(): Promise<void> {
    this.phase = 'waiting';
    const c = this.showOverlay(90);
    c.add(txt(this, 320, 160, 'Activando la cámara…', 12, COL.ink, { ox: 0.5 }));
    c.add(txt(this, 320, 182, 'Si el navegador pregunta, permite el acceso a la cámara.', 8, COL.dim, { ox: 0.5 }));
    const ok = lsm.cameraReady || (await lsm.enableCamera());
    if (!this.scene.isActive()) return;
    GameState.settings.camera = ok;
    if (ok) this.showCameraTest();
    else this.showCameraFailed();
  }

  private showCameraTest(): void {
    this.phase = 'test';
    lsm.setMode('spell');
    const c = this.showOverlay(318);
    c.add(txt(this, 320, 30, 'PRUEBA DE CÁMARA', 12, COL.teal, { ox: 0.5 }));
    c.add(txt(this, 320, 48, 'Haz una letra (por ejemplo A, B o L) y mira cómo la leemos.', 8, COL.ink, { ox: 0.5 }));
    // marco de la vista (la vista DOM va encima: 232,92 · 176×132)
    const g = this.add.graphics();
    g.lineStyle(1, COL.edgeN, 1).strokeRect(229.5, 89.5, 181, 137);
    c.add(g);
    c.add(txt(this, 300 - 168, 72, 'LETRA', 8, COL.dim));
    this.liveLetter = txt(this, 150, 130, '·', 48, COL.gold, { ox: 0.5, oy: 0.5 });
    c.add(this.liveLetter);
    this.liveTop = txt(this, 320, 236, '', 8, COL.dim, { ox: 0.5, wrap: 380, align: 'center' });
    c.add(this.liveTop);
    c.add(txt(this, 320, 262, 'La cámara se procesa en tu equipo; no se graba ni se envía nada.', 8, COL.teal, { ox: 0.5 }));
    this.button(c, 290, 'Continuar (Enter)', () => this.startGame());
    showCamera(this.game.canvas, 232, 92, 176, 132);
  }

  private showCameraFailed(): void {
    this.phase = 'failed';
    const c = this.showOverlay(150);
    c.add(txt(this, 320, 118, 'No pudimos usar la cámara', 12, COL.gold, { ox: 0.5 }));
    c.add(txt(this, 320, 140, `(${lsm.errorReason || 'motivo desconocido'})`, 8, COL.dim, { ox: 0.5, wrap: 360, align: 'center' }));
    c.add(
      txt(this, 320, 166, 'No pasa nada: jugarás con el teclado escribiendo cada letra.\nPuedes intentar de nuevo desde Pausa → Opciones.', 8, COL.ink, {
        ox: 0.5,
        align: 'center',
        wrap: 360,
      }),
    );
    this.button(c, 212, 'Continuar con teclado (Enter)', () => this.startGame());
  }

  private chooseKeyboard(): void {
    if (lsm.cameraReady) lsm.disableCamera();
    GameState.settings.camera = false;
    this.startGame();
  }

  private startGame(): void {
    if (this.phase === 'waiting') return;
    this.phase = 'waiting';
    lsm.setMode('off');
    camView.hide();
    sfx('ui_aceptar');
    resetGameState(); // conserva settings
    this.entryPrep?.();
    GameState.section = this.entrySection;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('Level', { section: this.entrySection });
    });
  }
}
