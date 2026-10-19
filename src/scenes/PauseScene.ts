import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { camView, lsm } from '../systems/Lsm';
import { COL, onDomKey, panel, txt } from './SpellScene';

/**
 * Dueño: lsm. Pausa (Esc): Continuar, Opciones (volumen, ventanas largas, sin ralentización extra,
 * reducir efectos, cámara), Controles (con el aviso de Teclas especiales) y Salir al título.
 * La abre openPause() de systems/Casting.ts (pausa 'Level'); al cerrar reanuda 'Level'.
 */
type Page = 'main' | 'options' | 'controls';

interface Row {
  text: () => string;
  /** dir = -1 / +1 con ←/→; 0 con Enter o clic. */
  act: (dir: -1 | 0 | 1) => void;
}

const CONTROLS_TEXT: Array<[string, string]> = [
  ['Moverse', 'W A S D (a lo ancho y en profundidad)'],
  ['Saltar', 'Espacio'],
  ['Correr', 'Shift (mantener)'],
  ['Esquivar', 'Doble Shift · o C'],
  ['Disparar', 'Clic izquierdo · o X'],
  ['Láser verde / rojo', '1 / 2'],
  ['Interactuar', 'E'],
  ['Conjuro', 'Q tocar: lanzar · Q mantener: rueda'],
  ['Deletrear', 'Seña frente a la cámara · o escribe la letra'],
  ['Diario de Señas', 'Tab'],
  ['Pausa', 'Esc'],
  ['Calibrar LSM', 'F3 durante un conjuro'],
];

export class PauseScene extends Phaser.Scene {
  private page: Page = 'main';
  private rows: Row[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private idx = 0;
  private content?: Phaser.GameObjects.Container;
  private busy = false;

  constructor() {
    super('Pause');
  }

  create(): void {
    this.busy = false;
    this.add.rectangle(0, 0, 640, 360, 0x05060a, 0.7).setOrigin(0);
    this.show('main');
    onDomKey(this, (e) => this.onKey(e));
  }

  private show(page: Page): void {
    this.page = page;
    this.idx = 0;
    this.content?.destroy();
    this.labels = [];
    const c = this.add.container(0, 0);
    this.content = c;
    if (page === 'main') {
      c.add(panel(this, 220, 84, 200, 172, COL.tealN));
      c.add(txt(this, 320, 98, 'PAUSA', 16, COL.teal, { ox: 0.5 }));
      this.rows = [
        { text: () => 'Continuar', act: () => this.close() },
        { text: () => 'Opciones', act: () => this.show('options') },
        { text: () => 'Controles', act: () => this.show('controls') },
        { text: () => 'Salir al título', act: () => this.quitToTitle() },
      ];
      this.buildRows(c, 320, 136, 24, 0.5);
    } else if (page === 'options') {
      c.add(panel(this, 130, 46, 380, 268, COL.tealN));
      c.add(txt(this, 320, 58, 'OPCIONES', 16, COL.teal, { ox: 0.5 }));
      const st = GameState.settings;
      const pct = (v: number) => `${Math.round(v * 100)} %`;
      const yesNo = (b: boolean) => (b ? 'Sí' : 'No');
      const vol = (key: 'musicVolume' | 'sfxVolume', dir: -1 | 0 | 1) => {
        let v = Math.round(st[key] * 10) + (dir === 0 ? 1 : dir);
        if (v > 10) v = dir === 0 ? 0 : 10;
        if (v < 0) v = 0;
        st[key] = v / 10;
        if (key === 'sfxVolume') sfx('ui_mover');
      };
      this.rows = [
        { text: () => `Música            < ${pct(st.musicVolume)} >`, act: (d) => vol('musicVolume', d) },
        { text: () => `Efectos           < ${pct(st.sfxVolume)} >`, act: (d) => vol('sfxVolume', d) },
        { text: () => `Ventanas largas   < ${yesNo(st.longWindows)} >`, act: () => (st.longWindows = !st.longWindows) },
        { text: () => `Sin ralentización < ${yesNo(st.noExtraSlowmo)} >`, act: () => (st.noExtraSlowmo = !st.noExtraSlowmo) },
        { text: () => `Reducir efectos   < ${yesNo(st.reduceFx)} >`, act: () => (st.reduceFx = !st.reduceFx) },
        { text: () => `Cámara            < ${this.busy ? '…' : lsm.cameraReady ? 'Activa' : 'Apagada'} >`, act: () => void this.toggleCamera() },
        { text: () => 'Volver', act: () => this.show('main') },
      ];
      this.buildRows(c, 168, 88, 20, 0);
      this.hint = txt(this, 320, 238, '', 8, COL.dim, { ox: 0.5, wrap: 340, align: 'center' });
      c.add(this.hint);
      c.add(txt(this, 320, 296, '↑↓ elegir · ←→ / Enter cambiar · Esc volver', 8, COL.dim, { ox: 0.5 }));
    } else {
      c.add(panel(this, 70, 20, 500, 320, COL.tealN));
      c.add(txt(this, 320, 30, 'CONTROLES', 16, COL.teal, { ox: 0.5 }));
      CONTROLS_TEXT.forEach(([a, k], i) => {
        c.add(txt(this, 90, 56 + i * 15, a, 10, COL.gold));
        c.add(txt(this, 250, 56 + i * 15, k, 10, COL.ink));
      });
      c.add(
        txt(
          this,
          320,
          242,
          'Aviso: pulsar Shift 5 veces seguidas abre "Teclas especiales" de Windows y el juego no lo puede bloquear. Esquiva con C, o desactiva el atajo en Configuración → Accesibilidad → Teclado → Teclas especiales.',
          8,
          COL.dim,
          { ox: 0.5, wrap: 460, align: 'center' },
        ),
      );
      c.add(txt(this, 320, 284, 'Mientras deletreas con teclado, todas las letras escriben y el movimiento se suspende.', 8, COL.dim, { ox: 0.5, wrap: 460, align: 'center' }));
      this.rows = [{ text: () => 'Volver', act: () => this.show('main') }];
      this.buildRows(c, 320, 314, 20, 0.5);
    }
    this.refresh();
  }

  private hint?: Phaser.GameObjects.Text;

  private buildRows(c: Phaser.GameObjects.Container, x: number, y: number, step: number, ox: number): void {
    this.rows.forEach((r, i) => {
      const t = txt(this, x, y + i * step, r.text(), 12, COL.ink, { ox });
      t.setInteractive({ useHandCursor: true });
      t.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
        this.idx = i;
        this.refresh();
      });
      t.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        this.idx = i;
        this.activate(0);
      });
      c.add(t);
      this.labels.push(t);
    });
  }

  private refresh(): void {
    this.labels.forEach((t, i) => {
      t.setText((i === this.idx ? '> ' : '  ') + this.rows[i].text());
      t.setColor(i === this.idx ? COL.gold : COL.ink);
    });
    if (this.page === 'options' && this.hint) {
      const hints = [
        'Volumen de la música.',
        'Volumen de los efectos de sonido.',
        'Cada letra de un conjuro tiene casi el doble de tiempo.',
        'El mundo no se ralentiza al deletrear (más difícil).',
        'Sin sacudidas de cámara ni destellos.',
        lsm.cameraReady
          ? 'Apágala para jugar solo con teclado.'
          : 'Actívala para deletrear con señas. Se procesa en tu equipo; no se graba ni se envía nada.',
        '',
      ];
      this.hint.setText(hints[this.idx] ?? '');
    }
  }

  private activate(dir: -1 | 0 | 1): void {
    const r = this.rows[this.idx];
    if (!r) return;
    sfx('ui_aceptar');
    const before = this.page;
    r.act(dir);
    if (this.page === before && this.scene.isActive()) this.refresh();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
    const n = this.rows.length;
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.idx = (this.idx + n - 1) % n;
        sfx('ui_mover');
        this.refresh();
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.idx = (this.idx + 1) % n;
        sfx('ui_mover');
        this.refresh();
        break;
      case 'ArrowLeft':
      case 'KeyA':
        if (this.page === 'options') this.activate(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        if (this.page === 'options') this.activate(1);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.activate(0);
        break;
      case 'Escape':
        if (this.page === 'main') this.close();
        else this.show('main');
        break;
    }
  }

  private async toggleCamera(): Promise<void> {
    if (this.busy) return;
    if (lsm.cameraReady) {
      lsm.setMode('off');
      camView.hide();
      lsm.disableCamera();
      GameState.settings.camera = false;
      bus.emit('hud:toast', { text: 'Cámara apagada: deletrea con el teclado', ms: 2000 });
      return;
    }
    this.busy = true;
    this.refresh();
    const ok = await lsm.enableCamera();
    this.busy = false;
    GameState.settings.camera = ok;
    if (!this.scene.isActive()) return;
    if (!ok) this.hint?.setText(`No pudimos usar la cámara (${lsm.errorReason || 'motivo desconocido'}). Seguirás con teclado.`);
    else lsm.setMode('off');
    this.labels.forEach((t, i) => t.setText((i === this.idx ? '> ' : '  ') + this.rows[i].text()));
  }

  private close(): void {
    this.scene.resume('Level');
    if (this.scene.isPaused('Dialogue')) this.scene.resume('Dialogue');
    bus.emit('game:pause', { paused: false });
    this.scene.stop();
  }

  private quitToTitle(): void {
    bus.emit('game:pause', { paused: false });
    bus.emit('music', { track: null });
    for (const k of ['Spell', 'Dialogue', 'Altar', 'Diario', 'Hud', 'Ending', 'Level']) {
      if (this.scene.isActive(k) || this.scene.isPaused(k) || this.scene.isSleeping(k)) this.scene.stop(k);
    }
    this.scene.start('Title');
  }
}
