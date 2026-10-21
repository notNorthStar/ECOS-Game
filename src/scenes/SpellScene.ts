import Phaser from 'phaser';
import { sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { LETTERS, type SpellSession } from '../lsm';
import { createHandDiagram } from '../lsm/adapters/phaser/HandDiagram';
import { camView, lsm, showCamera } from '../systems/Lsm';
import { getActiveCast, wheelState } from '../systems/Casting';
import { getMastery, getSpellDef, MASTERY_MAX } from '../systems/Mastery';
import { FUENTE, PAD_ACENTO, tamFuente } from '../ui/fuente';

/* =====================================================================================
 * Utilidades de interfaz compartidas por las escenas de lsm (Title, Spell, Diario, Pause).
 * Texto con la fuente pixel de la interfaz (src/ui/fuente.ts) en tamaños nítidos
 * (el lienzo es de 640×360 con escalado entero).
 * ===================================================================================== */

export const FONT = FUENTE;

export const COL = {
  ink: '#e8e0d0',
  dim: '#7d8a9a',
  teal: '#3cc4b8',
  tealN: 0x3cc4b8,
  gold: '#f2c86b',
  goldN: 0xf2c86b,
  red: '#e0566b',
  redN: 0xe0566b,
  green: '#7fe08a',
  greenN: 0x7fe08a,
  panelN: 0x0b0f1a,
  panel2N: 0x141b2b,
  edgeN: 0x2a3a52,
} as const;

/**
 * Texto nítido: posición redondeada y contorno oscuro. `size` se expresa en la escala anterior
 * (monospace) y tamFuente() lo convierte al tamaño legible de la fuente pixel (mínimo 11 px).
 */
export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size = 10,
  color: string = COL.ink,
  opts: { ox?: number; oy?: number; wrap?: number; align?: string; stroke?: boolean } = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(Math.round(x), Math.round(y), s, {
    fontFamily: FONT,
    fontSize: `${tamFuente(size)}px`,
    // La pixel en negrita solo luce en tamaños grandes; en chico se empasta.
    fontStyle: size >= 24 ? 'bold' : 'normal',
    color,
    align: opts.align ?? 'left',
    wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
    lineSpacing: 1,
    padding: { top: PAD_ACENTO }, // acentos de mayúsculas sin recortar
  });
  if (opts.stroke !== false) t.setStroke('#05060a', 3);
  t.setOrigin(opts.ox ?? 0, opts.oy ?? 0);
  return t;
}

/** Marco de panel estilo pixel (fondo, borde de 1 px y esquinas marcadas). */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number = COL.tealN,
  alpha = 0.92,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  x = Math.round(x);
  y = Math.round(y);
  g.fillStyle(COL.panelN, alpha).fillRect(x, y, w, h);
  g.fillStyle(COL.panel2N, alpha).fillRect(x + 2, y + 2, w - 4, 3);
  g.lineStyle(1, COL.edgeN, 1).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.fillStyle(accent, 1);
  for (const [cx, cy] of [
    [x, y],
    [x + w - 3, y],
    [x, y + h - 3],
    [x + w - 3, y + h - 3],
  ]) {
    g.fillRect(cx, cy, 3, 3);
  }
  return g;
}

/** 3 puntos de maestría (llenos según el nivel). */
export function masteryDots(scene: Phaser.Scene, x: number, y: number, spellId: string, color = COL.goldN): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const lvl = GameState.mastery[spellId]?.level ?? 0;
  for (let i = 0; i < MASTERY_MAX; i++) {
    const px = Math.round(x - 8 + i * 8);
    g.fillStyle(0x05060a, 1).fillRect(px - 3, y - 3, 6, 6);
    g.fillStyle(i < lvl ? color : 0x2a3346, 1).fillRect(px - 2, y - 2, 4, 4);
  }
  return g;
}

/** keydown del DOM (no se pierden pulsaciones cortas); se quita al apagar la escena. */
export function onDomKey(scene: Phaser.Scene, fn: (e: KeyboardEvent) => void): void {
  const h = (e: KeyboardEvent) => {
    if (!scene.sys.isActive()) return;
    fn(e);
  };
  window.addEventListener('keydown', h);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', h));
}

/** Fila de letras de un conjuro: hechas (verde/rojo), actual (resaltada) y pendientes. */
class WordRow {
  private boxes: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  readonly width: number;
  constructor(
    scene: Phaser.Scene,
    private x: number,
    private y: number,
    private letters: string[],
    private cell = 20,
    size = 12,
  ) {
    this.boxes = scene.add.graphics();
    this.width = letters.length * (cell + 2) - 2;
    letters.forEach((l, i) => {
      this.labels.push(txt(scene, x + i * (cell + 2) + cell / 2, y + cell / 2, l, size, COL.dim, { ox: 0.5, oy: 0.5 }));
    });
  }
  draw(index: number, results: ReadonlyArray<'ok' | 'miss' | null>, pulse = 0): void {
    const g = this.boxes;
    g.clear();
    this.letters.forEach((_, i) => {
      const bx = this.x + i * (this.cell + 2);
      const r = results[i];
      let fill: number = 0x111827;
      let edge: number = COL.edgeN;
      let color: string = COL.dim;
      if (r === 'ok') {
        fill = 0x163a2a;
        edge = COL.greenN;
        color = COL.green;
      } else if (r === 'miss') {
        fill = 0x3a1620;
        edge = COL.redN;
        color = COL.red;
      } else if (i === index) {
        fill = 0x1c2c3e;
        edge = COL.goldN;
        color = COL.gold;
      }
      g.fillStyle(fill, 1).fillRect(bx, this.y, this.cell, this.cell);
      g.lineStyle(1, edge, 1).strokeRect(bx + 0.5, this.y + 0.5, this.cell - 1, this.cell - 1);
      if (i === index && !r) {
        g.lineStyle(1, COL.goldN, 0.4 + 0.6 * pulse).strokeRect(bx - 1.5, this.y - 1.5, this.cell + 3, this.cell + 3);
      }
      this.labels[i].setColor(color);
    });
  }
  destroy(): void {
    this.boxes.destroy();
    this.labels.forEach((t) => t.destroy());
  }
}

/** Barra horizontal de progreso 0..1. */
function bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, v: number, color: number): void {
  g.fillStyle(0x05060a, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(0x1a2233, 1).fillRect(x, y, w, h);
  g.fillStyle(color, 1).fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, v))), h);
}

type SpellSceneData =
  | { mode: 'wheel' }
  | { mode: 'cast' }
  | { mode: 'learn'; spellId: string; onDone: () => void };

/* =====================================================================================
 * Escena 'Spell': rueda de conjuros, interfaz del deletreo y aprendizaje guiado.
 * ===================================================================================== */
export class SpellScene extends Phaser.Scene {
  private mode: SpellSceneData['mode'] = 'cast';
  private debugOn = false;
  private debugText?: Phaser.GameObjects.Text;

  constructor() {
    super('Spell');
  }

  init(data: SpellSceneData): void {
    this.mode = data?.mode ?? 'cast';
    this.learnData = data?.mode === 'learn' ? data : null;
  }

  create(): void {
    // La misma instancia se reutiliza en cada launch: limpia referencias a objetos ya destruidos.
    this.castUi = this.castRow = this.castHand = this.castBars = this.castDesc = this.castLetterBig = undefined;
    this.learnPage = this.practiceRow = this.practiceBars = this.practiceMsg = undefined;
    this.wheelHi = this.wheelTitle = this.wheelDesc = undefined;
    this.castHandLetter = '';
    this.debugOn = false;
    this.debugText = txt(this, 6, 6, '', 8, COL.green, { wrap: 360 }).setDepth(100).setVisible(false);
    onDomKey(this, (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.debugOn = !this.debugOn;
        this.debugText?.setVisible(this.debugOn);
        if (!this.debugOn) camView.clear();
      }
    });
    if (this.mode === 'wheel') this.createWheel();
    else if (this.mode === 'learn') this.createLearn();
    else this.createCast();
  }

  update(): void {
    if (this.mode === 'wheel') this.updateWheel();
    else if (this.mode === 'learn') this.updateLearn();
    else this.updateCast();
    if (this.debugOn) this.updateDebug();
  }

  private updateDebug(): void {
    const ex = lsm.explain();
    const st = lsm.stats();
    const lines = [`LSM ${lsm.status} · ${st.detectHz.toFixed(0)} Hz · ${st.latencyMs.toFixed(0)} ms · modo ${lsm.detectionMode}`];
    if (ex) lines.push(ex.top, ex.metrics, ex.motion);
    else lines.push(lsm.cameraReady ? 'Sin mano a la vista' : 'Sin cámara (teclado)');
    this.debugText?.setText(lines.join('\n'));
    if (lsm.cameraReady) camView.drawLandmarks(lsm.tracker.lastFrame);
  }

  /* =============================== RUEDA =============================== */
  private wheelItems: Array<{ angle: number; label: Phaser.GameObjects.Text; x: number; y: number }> = [];
  private wheelHi?: Phaser.GameObjects.Graphics;
  private wheelTitle?: Phaser.GameObjects.Text;
  private wheelDesc?: Phaser.GameObjects.Text;
  private wheelShown = -1;
  private readonly wcx = 320;
  private readonly wcy = 160;

  private createWheel(): void {
    const { wcx: cx, wcy: cy } = this;
    this.wheelItems = [];
    this.wheelShown = -1;
    this.add.rectangle(0, 0, 640, 360, 0x05060a, 0.45).setOrigin(0);
    if (this.textures.exists('ui_rueda')) {
      this.add.image(cx, cy, 'ui_rueda');
    } else {
      const g = this.add.graphics();
      g.fillStyle(COL.panelN, 0.88).fillCircle(cx, cy, 82);
      g.lineStyle(2, COL.tealN, 0.9).strokeCircle(cx, cy, 82);
      g.lineStyle(1, COL.edgeN, 1).strokeCircle(cx, cy, 76);
      g.lineStyle(1, COL.edgeN, 1).strokeCircle(cx, cy, 34);
      g.fillStyle(COL.panel2N, 1).fillCircle(cx, cy, 33);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillStyle(COL.tealN, 0.7).fillRect(Math.round(cx + Math.cos(a) * 79) - 1, Math.round(cy + Math.sin(a) * 79) - 1, 2, 2);
      }
    }
    this.wheelHi = this.add.graphics();
    const n = wheelState.spells.length;
    wheelState.spells.forEach((id, i) => {
      const angle = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
      const r = n === 1 ? 0 : 56;
      const x = Math.round(cx + Math.cos(angle) * r);
      const y = Math.round(cy + Math.sin(angle) * r);
      const def = getSpellDef(id);
      const label = txt(this, x, y - 4, def?.name.toUpperCase() ?? id, n > 4 ? 8 : 10, COL.ink, { ox: 0.5, oy: 0.5 });
      masteryDots(this, x, y + 8, id);
      this.wheelItems.push({ angle, label, x, y });
    });
    txt(this, cx, cy - 104, 'CONJUROS', 12, COL.teal, { ox: 0.5 });
    this.wheelTitle = txt(this, cx, cy + 92, '', 12, COL.gold, { ox: 0.5 });
    this.wheelDesc = txt(this, cx, cy + 110, '', 10, COL.ink, { ox: 0.5, wrap: 360, align: 'center' });
    txt(this, cx, 344, 'Suelta Q para elegir  ·  WASD o ratón', 8, COL.dim, { ox: 0.5 });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (dx * dx + dy * dy < 18 * 18 || n < 2) return;
      this.pickByAngle(Math.atan2(dy, dx));
    });
    onDomKey(this, (e) => {
      const dir: Record<string, [number, number]> = {
        KeyW: [0, -1],
        ArrowUp: [0, -1],
        KeyS: [0, 1],
        ArrowDown: [0, 1],
        KeyA: [-1, 0],
        ArrowLeft: [-1, 0],
        KeyD: [1, 0],
        ArrowRight: [1, 0],
      };
      const d = dir[e.code];
      if (!d || n < 2) return;
      if (n === 2) {
        // con dos conjuros (arriba/abajo), cualquier dirección alterna
        wheelState.index = d[1] < 0 || d[0] < 0 ? 0 : 1;
      } else this.pickByAngle(Math.atan2(d[1], d[0]));
    });
  }

  private pickByAngle(a: number): void {
    let best = 0;
    let bestD = Infinity;
    this.wheelItems.forEach((it, i) => {
      const d = Math.abs(Phaser.Math.Angle.Wrap(it.angle - a));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    wheelState.index = best;
  }

  private updateWheel(): void {
    if (!wheelState.open) return;
    const i = wheelState.index;
    if (i === this.wheelShown) return;
    if (this.wheelShown >= 0) sfx('ui_mover');
    this.wheelShown = i;
    const it = this.wheelItems[i];
    const g = this.wheelHi!;
    g.clear();
    if (it) {
      g.fillStyle(COL.goldN, 0.16).fillCircle(it.x, it.y + 2, 22);
      g.lineStyle(1, COL.goldN, 0.9).strokeCircle(it.x, it.y + 2, 22);
    }
    this.wheelItems.forEach((w, j) => w.label.setColor(j === i ? COL.gold : COL.ink));
    const id = wheelState.spells[i];
    const def = id ? getSpellDef(id) : undefined;
    const m = id ? getMastery(id) : null;
    this.wheelTitle?.setText(def ? `${def.title}  ·  maestría ${m?.level ?? 0}/3${(m?.level ?? 0) >= MASTERY_MAX ? ' (dominado)' : ''}` : '');
    this.wheelDesc?.setText(def?.desc ?? '');
  }

  /* =============================== DELETREO =============================== */
  private castRow?: WordRow;
  private castHand?: Phaser.GameObjects.Container;
  private castHandLetter = '';
  private castDesc?: Phaser.GameObjects.Text;
  private castLetterBig?: Phaser.GameObjects.Text;
  private castBars?: Phaser.GameObjects.Graphics;
  private castUi?: Phaser.GameObjects.Container;
  private resultShown = false;
  private resultAt = 0;

  private createCast(): void {
    this.resultShown = false;
    this.castHandLetter = '';
    this.castHand = undefined;
    const a = getActiveCast();
    if (!a) {
      this.scene.stop();
      return;
    }
    if (a.auto || !a.session) return; // solo mostrará el resultado
    const def = getSpellDef(a.spellId);
    const s = a.session;
    const ui = this.add.container(0, 0);
    this.castUi = ui;
    const px = 96;
    const py = 222;
    ui.add(panel(this, px, py, 448, 130, COL.goldN));
    // marco de la mano
    const hg = this.add.graphics();
    hg.fillStyle(0x0e1522, 1).fillRect(px + 8, py + 10, 76, 100);
    hg.lineStyle(1, COL.edgeN, 1).strokeRect(px + 8.5, py + 10.5, 75, 99);
    ui.add(hg);
    this.castLetterBig = txt(this, px + 12, py + 12, '', 16, COL.gold);
    ui.add(this.castLetterBig);
    ui.add(txt(this, px + 46, py + 114, 'LSM', 8, COL.dim, { ox: 0.5 }));
    // título
    const tx = px + 96;
    ui.add(txt(this, tx, py + 8, (def?.name ?? a.spellId).toUpperCase(), 12, COL.gold));
    ui.add(
      txt(this, px + 440, py + 10, lsm.cameraReady ? 'Haz la seña o escríbela' : 'Escribe cada letra', 8, COL.dim, { ox: 1 }),
    );
    this.castRow = new WordRow(this, tx, py + 28, s.letters, 20, 12);
    this.castDesc = txt(this, tx, py + 56, '', 8, COL.ink, { wrap: 338 });
    ui.add(this.castDesc);
    ui.add(txt(this, tx, py + 96, 'TIEMPO', 8, COL.dim));
    if (lsm.cameraReady) ui.add(txt(this, tx, py + 110, 'SOSTÉN', 8, COL.dim));
    ui.add(txt(this, px + 440, py + 120, 'Esc: cancelar', 8, COL.dim, { ox: 1 }));
    this.castBars = this.add.graphics();
    ui.add(this.castBars);
    ui.setAlpha(0);
    this.tweens.add({ targets: ui, alpha: 1, duration: 120 });
  }

  private setHand(letter: string, x: number, y: number, scale: number): void {
    if (letter === this.castHandLetter) return;
    this.castHandLetter = letter;
    this.castHand?.destroy();
    this.castHand = createHandDiagram(this, x, y, letter, scale);
    this.castHand.setScale(0.6);
    this.tweens.add({ targets: this.castHand, scale: 1, duration: 140, ease: 'Back.Out' });
  }

  private updateCast(): void {
    const a = getActiveCast();
    if (!a) {
      this.scene.stop();
      return;
    }
    const now = performance.now();
    const s = a.session;
    if (s && !a.result) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 120);
      this.castRow?.draw(s.index, s.results, pulse);
      const L = s.current ?? '';
      if (L) {
        this.setHand(L, 96 + 46, 222 + 60, 1);
        this.castLetterBig?.setText(L);
        this.castDesc?.setText(LETTERS[L]?.desc ?? '');
      }
      const g = this.castBars!;
      g.clear();
      const tl = s.timeLeft(now);
      bar(g, 96 + 146, 222 + 98, 290, 5, tl, tl < 0.3 ? COL.redN : COL.tealN);
      if (lsm.cameraReady) {
        bar(g, 96 + 146, 222 + 112, 290, 5, s.holdProgress, COL.goldN);
        camView.setBorder(s.holdProgress > 0 ? '#f2c86b' : '#3cc4b8');
      }
      return;
    }
    if (a.result && !this.resultShown) this.showResult(a);
    if (this.resultShown && now - this.resultAt > 1300) this.scene.stop();
  }

  private showResult(a: NonNullable<ReturnType<typeof getActiveCast>>): void {
    this.resultShown = true;
    this.resultAt = performance.now();
    const r = a.result!;
    if (a.session) {
      this.castRow?.draw(-1, a.session.results);
      this.castBars?.clear();
    }
    if (this.castUi) this.tweens.add({ targets: this.castUi, alpha: 0, delay: 650, duration: 300 });
    this.castHand?.destroy();
    this.castHand = undefined;
    let label: string;
    let color: string;
    if (a.auto) {
      label = `${(getSpellDef(a.spellId)?.name ?? a.spellId).toUpperCase()}`;
      color = COL.teal;
    } else if (r.outcome === 'perfect') {
      label = 'PERFECTO';
      color = COL.gold;
    } else if (r.outcome === 'partial') {
      label = 'BIEN';
      color = COL.teal;
    } else {
      label = 'FALLO';
      color = COL.red;
    }
    const big = txt(this, 320, 150, label, 32, color, { ox: 0.5, oy: 0.5 });
    big.setStroke('#05060a', 6);
    const sub = a.auto
      ? 'Dominado · lanzado en automático'
      : r.outcome === 'fail'
        ? `${r.correct}/${r.total} letras · inténtalo otra vez`
        : `${r.correct}/${r.total} letras · fuerza ${Math.round(Math.min(1, r.power) * 100)} %`;
    const small = txt(this, 320, 176, sub, 10, COL.ink, { ox: 0.5 });
    big.setScale(1.6).setAlpha(0);
    this.tweens.add({ targets: big, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out' });
    this.tweens.add({ targets: [big, small], alpha: 0, delay: 950, duration: 300 });
    if (r.outcome === 'perfect' && !GameState.settings.reduceFx) {
      const g = this.add.graphics();
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        g.fillStyle(COL.goldN, 1).fillRect(Math.round(320 + Math.cos(ang) * 70), Math.round(150 + Math.sin(ang) * 26), 2, 2);
      }
      this.tweens.add({ targets: g, alpha: 0, scale: 1.2, duration: 700 });
    }
  }

  /* =============================== APRENDER =============================== */
  private learnData: { spellId: string; onDone: () => void } | null = null;
  private learnStep: 'intro' | 'letter' | 'practice' | 'end' = 'intro';
  private learnIdx = 0;
  private learnPage?: Phaser.GameObjects.Container;
  private practice: SpellSession | null = null;
  private practiceResults: Array<'ok' | 'miss' | null> = [];
  private practiceRow?: WordRow;
  private practiceBars?: Phaser.GameObjects.Graphics;
  private practiceMsg?: Phaser.GameObjects.Text;
  private learnLetters: string[] = [];

  private createLearn(): void {
    const d = this.learnData;
    const def = d ? getSpellDef(d.spellId) : undefined;
    if (!d || !def) {
      d?.onDone();
      this.scene.stop();
      return;
    }
    this.learnLetters = def.letters;
    this.learnStep = 'intro';
    this.learnIdx = 0;
    this.practice = null;
    this.castHandLetter = '';
    this.castHand = undefined;
    this.add.rectangle(0, 0, 640, 360, 0x05060a, 0.62).setOrigin(0);
    this.showLearnPage();

    const next = () => this.learnNext();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      if (this.learnStep !== 'practice') next();
    });
    onDomKey(this, (e) => {
      if (e.repeat) return;
      if (this.learnStep === 'practice') {
        if (e.code === 'Escape') {
          this.endPractice();
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && this.practice && !this.practice.done) {
          this.onPracticeResult(this.practice.typeLetter(e.key, performance.now()));
        }
        return;
      }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'NumpadEnter') next();
      else if ((e.code === 'ArrowLeft' || e.code === 'Backspace') && this.learnStep === 'letter') {
        if (this.learnIdx > 0) {
          this.learnIdx--;
          sfx('ui_mover');
          this.showLearnPage();
        } else {
          this.learnStep = 'intro';
          this.showLearnPage();
        }
      }
    });
  }

  private learnNext(): void {
    sfx('ui_aceptar');
    if (this.learnStep === 'intro') {
      this.learnStep = 'letter';
      this.learnIdx = 0;
    } else if (this.learnStep === 'letter') {
      if (this.learnIdx < this.learnLetters.length - 1) this.learnIdx++;
      else {
        this.learnStep = 'practice';
        this.learnIdx = 0;
      }
    } else if (this.learnStep === 'end') {
      this.learnData?.onDone();
      return;
    }
    this.showLearnPage();
  }

  private clearLearnPage(): void {
    this.learnPage?.destroy();
    this.castHand?.destroy();
    this.castHand = undefined;
    this.castHandLetter = '';
    this.practiceRow?.destroy();
    this.practiceRow = undefined;
    this.practiceBars = undefined;
    this.practiceMsg = undefined;
  }

  private showLearnPage(): void {
    this.clearLearnPage();
    const def = getSpellDef(this.learnData!.spellId)!;
    const page = this.add.container(0, 0);
    this.learnPage = page;
    page.add(panel(this, 60, 36, 520, 288, COL.goldN, 0.96));
    const L = this.learnLetters;
    const footer = (s: string) => page.add(txt(this, 320, 304, s, 8, COL.dim, { ox: 0.5 }));

    if (this.learnStep === 'intro') {
      page.add(txt(this, 320, 56, 'NUEVO CONJURO', 10, COL.teal, { ox: 0.5 }));
      page.add(txt(this, 320, 74, def.name.toUpperCase(), 32, COL.gold, { ox: 0.5 }));
      // Bloques apilados según su altura real (la fuente pixel ocupa más que la monoespaciada).
      const d1 = txt(this, 320, 118, def.desc, 10, COL.ink, { ox: 0.5, wrap: 440, align: 'center' });
      page.add(d1);
      const d2 = txt(
        this,
        320,
        Math.max(156, d1.y + d1.height + 8),
        'Los conjuros se deletrean en Lengua de Señas Mexicana (LSM), letra por letra, con el alfabeto manual que te enseñó tu madre.',
        10,
        COL.ink,
        { ox: 0.5, wrap: 440, align: 'center' },
      );
      page.add(d2);
      page.add(
        txt(
          this,
          320,
          Math.max(206, d2.y + d2.height + 10),
          lsm.cameraReady
            ? 'Con la cámara: haz cada seña y sostenla un momento.'
            : 'Sin cámara: escribe cada letra en el teclado mientras miras la seña.',
          10,
          COL.teal,
          { ox: 0.5, wrap: 440, align: 'center' },
        ),
      );
      page.add(txt(this, 320, 244, `${L.length} letras`, 10, COL.dim, { ox: 0.5 }));
      footer('Enter, Espacio o clic: continuar');
      return;
    }

    if (this.learnStep === 'letter') {
      const i = this.learnIdx;
      const letter = L[i];
      page.add(txt(this, 320, 48, `${def.name.toUpperCase()}  ·  letra ${i + 1} de ${L.length}`, 10, COL.teal, { ox: 0.5 }));
      const row = new WordRow(this, Math.round(320 - (L.length * 22 - 2) / 2), 66, L, 20, 12);
      row.draw(i, L.map((_, j) => (j < i ? 'ok' : null)));
      this.practiceRow = row;
      const hg = this.add.graphics();
      hg.fillStyle(0x0e1522, 1).fillRect(100, 100, 150, 180);
      hg.lineStyle(1, COL.edgeN, 1).strokeRect(100.5, 100.5, 149, 179);
      page.add(hg);
      this.setHand(letter, 175, 196, 2);
      page.add(txt(this, 280, 104, letter, 48, COL.gold));
      const ld = LETTERS[letter];
      page.add(txt(this, 280, 168, ld?.desc ?? '', 10, COL.ink, { wrap: 280 }));
      if (ld?.motion) page.add(txt(this, 280, 248, 'Esta letra lleva movimiento: traza la Z con el índice.', 8, COL.gold, { wrap: 280 }));
      page.add(txt(this, 280, 266, 'Esquema provisional, pendiente de verificar con la SEP.', 8, COL.dim, { wrap: 280 }));
      footer('Enter / → / clic: siguiente   ·   ←: anterior');
      return;
    }

    if (this.learnStep === 'practice') {
      page.add(txt(this, 320, 48, 'PRÁCTICA', 12, COL.teal, { ox: 0.5 }));
      page.add(
        txt(
          this,
          320,
          66,
          lsm.cameraReady ? 'Haz cada seña frente a la cámara (o escribe la letra). Sin prisa.' : 'Escribe cada letra en el teclado. Sin prisa.',
          10,
          COL.ink,
          { ox: 0.5, wrap: 460, align: 'center' },
        ),
      );
      this.practiceResults = L.map(() => null);
      this.practiceRow = new WordRow(this, Math.round(320 - (L.length * 26 - 2) / 2), 92, L, 24, 14);
      const hg = this.add.graphics();
      hg.fillStyle(0x0e1522, 1).fillRect(110, 128, 130, 150);
      hg.lineStyle(1, COL.edgeN, 1).strokeRect(110.5, 128.5, 129, 149);
      page.add(hg);
      this.practiceMsg = txt(this, 270, 136, '', 12, COL.gold, { wrap: 290 });
      page.add(this.practiceMsg);
      this.practiceBars = this.add.graphics();
      page.add(this.practiceBars);
      page.add(txt(this, 270, 236, 'TIEMPO', 8, COL.dim));
      if (lsm.cameraReady) page.add(txt(this, 270, 252, 'SOSTÉN', 8, COL.dim));
      footer('Esc: omitir la práctica');
      this.learnIdx = 0;
      if (lsm.cameraReady) {
        lsm.setMode('spell');
        showCamera(this.game.canvas, 472, 44, 100, 75);
      }
      this.startPracticeLetter();
      return;
    }

    // end
    page.add(txt(this, 320, 70, '¡APRENDISTE', 16, COL.teal, { ox: 0.5 }));
    page.add(txt(this, 320, 92, `${def.name.toUpperCase()}!`, 32, COL.gold, { ox: 0.5 }));
    const fin = txt(this, 320, 140, def.desc, 10, COL.ink, { ox: 0.5, wrap: 440, align: 'center' });
    page.add(fin);
    page.add(
      txt(
        this,
        320,
        Math.max(184, fin.y + fin.height + 8),
        'Q (tocar): lanzar el conjuro seleccionado\nQ (mantener): rueda de conjuros\nTab: Diario de Señas',
        10,
        COL.ink,
        { ox: 0.5, align: 'center' },
      ),
    );
    page.add(txt(this, 320, 246, 'Al dominarlo (3 niveles de maestría) se lanzará solo.', 8, COL.dim, { ox: 0.5 }));
    footer('Enter, Espacio o clic: continuar');
  }

  private startPracticeLetter(): void {
    const letter = this.learnLetters[this.learnIdx];
    // Ventana amplia y una sola letra por sesión: un error no castiga, se repite la letra.
    this.practice = lsm.startSpell(letter, performance.now(), { letterWindowMs: 12000 });
    this.setHand(letter, 175, 214, 2);
    this.practiceMsg?.setText(`${letter}\n\n${LETTERS[letter]?.desc ?? ''}`).setColor(COL.ink);
  }

  private onPracticeResult(r: 'ok' | 'miss' | null): void {
    if (!r) return;
    const letter = this.learnLetters[this.learnIdx];
    if (r === 'ok') {
      sfx('letra_ok');
      this.practiceResults[this.learnIdx] = 'ok';
      this.learnIdx++;
      if (this.learnIdx >= this.learnLetters.length) {
        this.time.delayedCall(350, () => this.endPractice());
        this.practice = null;
        return;
      }
      this.startPracticeLetter();
    } else {
      sfx('letra_fallo');
      this.practice = lsm.startSpell(letter, performance.now(), { letterWindowMs: 12000 });
      this.practiceMsg?.setText(`Casi. Otra vez: ${letter}\n\n${LETTERS[letter]?.desc ?? ''}`).setColor(COL.gold);
    }
  }

  private endPractice(): void {
    if (this.learnStep !== 'practice') return;
    this.practice = null;
    lsm.setMode('off');
    camView.hide();
    this.learnStep = 'end';
    sfx('perfecto');
    this.showLearnPage();
  }

  private updateLearn(): void {
    if (this.learnStep !== 'practice') return;
    const now = performance.now();
    this.practiceRow?.draw(this.learnIdx, this.practiceResults, 0.5 + 0.5 * Math.sin(now / 120));
    const s = this.practice;
    if (!s || s.done) return;
    const r = lsm.cameraReady ? lsm.stepSpell(s, now) : s.update(now, null, 0);
    if (r) {
      this.onPracticeResult(r);
      return;
    }
    if (lsm.cameraReady) showCamera(this.game.canvas, 472, 44, 100, 75);
    const g = this.practiceBars;
    if (g) {
      g.clear();
      bar(g, 320, 238, 220, 5, s.timeLeft(now), COL.tealN);
      if (lsm.cameraReady) bar(g, 320, 254, 220, 5, s.holdProgress, COL.goldN);
    }
  }
}
