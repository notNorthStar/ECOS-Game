import Phaser from 'phaser';
import type { SectionId } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { buyUpgrade, upgradeRows, type UpgradeRow } from '../systems/Progression';
import { conEscala, FUENTE, PAD_ACENTO, tamFuente } from '../ui/fuente';

/**
 * Altar de la Memoria (GDD §5.1). Dueño: combate. Escena 'Altar'.
 * Se lanza con data { section, x, y }: restaura la vida, guarda el checkpoint y muestra las mejoras
 * (nivel, siguiente efecto, costo; bloqueadas con candado). Teclado: W/S (↑/↓), E/Enter, Esc. Ratón.
 * Al cerrar reanuda 'Level'.
 */

interface AltarData {
  section?: SectionId;
  x?: number;
  y?: number;
}

// Estilo (dueño: interfaz): fuente pixel; tamFuente() lleva los tamaños anteriores a uno legible (mín. 11 px).
const style = (size: number, color = '#f4ead2'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FUENTE,
  fontSize: `${conEscala(tamFuente(size), GameState.settings.textScale || 1)}px`,
  color,
  stroke: '#0a0a12',
  strokeThickness: size <= 10 ? 2 : 3,
  padding: { top: PAD_ACENTO },
});

/** Recorta un texto de una línea con "…" para que no pase de `max` px (la fuente pixel es más ancha). */
function ajustarAncho(t: Phaser.GameObjects.Text, max: number): void {
  if (t.width <= max) return;
  const full = t.text;
  let n = full.length;
  while (n > 4 && t.width > max) t.setText(`${full.slice(0, --n).trimEnd()}…`);
}

const PANEL_W = 480; // más ancho que con la monoespaciada: las descripciones caben en una línea
const ROW_H = 30;

export class AltarScene extends Phaser.Scene {
  private sel = 0;
  private rows: { bg: Phaser.GameObjects.Graphics; name: Phaser.GameObjects.Text; info: Phaser.GameObjects.Text; cost: Phaser.GameObjects.Text; pips: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone }[] = [];
  private data_: UpgradeRow[] = [];
  private ecosText!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private closing = false;
  private top = 0;

  constructor() {
    super('Altar');
  }

  create(data: AltarData): void {
    this.sel = 0;
    this.rows = [];
    this.closing = false;

    // Restaura vida y guarda checkpoint (si el director no lo guardó ya en esta sección).
    GameState.hp = GameState.maxHp;
    const section = data?.section ?? GameState.section;
    if (data && typeof data.x === 'number' && typeof data.y === 'number') {
      const cp = GameState.checkpoint;
      if (!cp || cp.section !== section) {
        GameState.checkpoint = { section, x: data.x, y: data.y };
        bus.emit('checkpoint', { section, x: data.x, y: data.y });
      }
    }
    if (this.scene.isActive('Level')) this.scene.pause('Level');
    this.scene.bringToTop();

    // Fondo.
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05040a, 0.72).setOrigin(0);
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 200 });

    const n = upgradeRows().length + 1; // + Salir
    const panelH = 86 + n * ROW_H;
    const px = (GAME_WIDTH - PANEL_W) / 2;
    const py = Math.max(8, (GAME_HEIGHT - panelH) / 2);
    this.top = py + 62;
    const g = this.add.graphics();
    if (this.textures.exists('ui_marco')) {
      this.add.nineslice(GAME_WIDTH / 2, py + panelH / 2, 'ui_marco', undefined, PANEL_W, panelH, 8, 8, 8, 8);
    } else {
      g.fillStyle(0x0e0c18, 0.95).fillRoundedRect(px, py, PANEL_W, panelH, 6);
      g.lineStyle(2, 0xc8a050, 1).strokeRoundedRect(px, py, PANEL_W, panelH, 6);
      g.lineStyle(1, 0x5a8a7a, 0.7).strokeRoundedRect(px + 4, py + 4, PANEL_W - 8, panelH - 8, 4);
    }
    // Velas.
    for (const cx of [px + 18, px + PANEL_W - 18]) {
      const glow = this.add.circle(cx, py + 22, 8, 0xffc060, 0.25).setBlendMode(Phaser.BlendModes.ADD);
      this.add.rectangle(cx, py + 30, 4, 10, 0xf4ead2);
      const fl = this.add.ellipse(cx, py + 22, 4, 7, 0xffd070);
      this.tweens.add({ targets: [fl, glow], scaleY: { from: 0.85, to: 1.15 }, alpha: { from: 0.8, to: 1 }, duration: 260 + Math.random() * 120, yoyo: true, repeat: -1 });
    }

    this.add.text(GAME_WIDTH / 2, py + 18, 'ALTAR DE LA MEMORIA', style(13, '#f2d48a')).setOrigin(0.5).setLetterSpacing(2);
    this.add.text(GAME_WIDTH / 2, py + 34, 'Vida restaurada · Punto de control guardado', style(8, '#9affc0')).setOrigin(0.5);
    this.ecosText = this.add.text(GAME_WIDTH / 2, py + 48, '', style(9, '#bff8ff')).setOrigin(0.5);
    this.msg = this.add.text(GAME_WIDTH / 2, py + panelH - 12, 'W/S elegir · E comprar · Esc salir', style(8, '#a8a090')).setOrigin(0.5);

    for (let i = 0; i < n; i++) {
      const y = this.top + i * ROW_H;
      const bg = this.add.graphics();
      const name = this.add.text(px + 20, y + 8, '', style(10)).setOrigin(0, 0.5);
      const info = this.add.text(px + 20, y + 21, '', style(7, '#b8b0a0')).setOrigin(0, 0.5);
      const cost = this.add.text(px + PANEL_W - 18, y + 14, '', style(9, '#bff8ff')).setOrigin(1, 0.5);
      const pips = this.add.graphics();
      const zone = this.add.zone(px + 8, y, PANEL_W - 16, ROW_H - 2).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        if (this.sel !== i) {
          this.sel = i;
          sfx('ui_mover');
          this.refresh();
        }
      });
      zone.on('pointerdown', () => {
        this.sel = i;
        this.accept();
      });
      this.rows.push({ bg, name, info, cost, pips, zone });
    }

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.refresh();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.closing) return;
    const n = this.rows.length;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.sel = (this.sel - 1 + n) % n;
        sfx('ui_mover');
        this.refresh();
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.sel = (this.sel + 1) % n;
        sfx('ui_mover');
        this.refresh();
        break;
      case 'KeyE':
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.accept();
        break;
      case 'Escape':
        this.close();
        break;
    }
  }

  private accept(): void {
    if (this.closing) return;
    if (this.sel >= this.data_.length) {
      this.close();
      return;
    }
    const r = this.data_[this.sel];
    if (r.locked) {
      this.say(`Bloqueado: ${r.def.lockText ?? ''}`, '#ff9a8a');
      sfx('conjuro_fallo');
      return;
    }
    if (r.maxed) {
      this.say('Ya está al máximo', '#a8a090');
      return;
    }
    if (buyUpgrade(r.def.id)) {
      this.say(`${r.def.name} sube a nivel ${r.level + 1}`, '#9affc0');
      const row = this.rows[this.sel];
      this.tweens.add({ targets: [row.name, row.cost], scale: { from: 1.25, to: 1 }, duration: 220 });
      this.cameras.main.flash(120, 255, 230, 160);
    } else {
      this.say(`Faltan ${(r.cost ?? 0) - GameState.ecos} Ecos`, '#ff9a8a');
      sfx('conjuro_fallo');
    }
    this.refresh();
  }

  private say(text: string, color: string): void {
    this.msg.setText(text).setColor(color);
    this.time.delayedCall(1800, () => {
      if (!this.closing) this.msg.setText('W/S elegir · E comprar · Esc salir').setColor('#a8a090');
    });
  }

  private refresh(): void {
    this.data_ = upgradeRows();
    this.ecosText.setText(`Ecos: ${GameState.ecos}`);
    const px = (GAME_WIDTH - PANEL_W) / 2;
    this.rows.forEach((row, i) => {
      const y = this.top + i * ROW_H;
      const selected = i === this.sel;
      row.bg.clear();
      if (selected) {
        row.bg.fillStyle(0x2a4a40, 0.6).fillRoundedRect(px + 8, y, PANEL_W - 16, ROW_H - 2, 3);
        row.bg.lineStyle(1, 0x9affc0, 0.8).strokeRoundedRect(px + 8, y, PANEL_W - 16, ROW_H - 2, 3);
      }
      row.pips.clear();
      if (i >= this.data_.length) {
        row.name.setText(selected ? '› Salir' : '  Salir').setColor('#f4ead2');
        row.info.setText('');
        row.cost.setText('');
        return;
      }
      const r = this.data_[i];
      const prefix = selected ? '› ' : '  ';
      row.name.setText(`${prefix}${r.def.name}`).setColor(r.locked ? '#7a7468' : '#f4ead2');
      row.info.setText(r.locked ? r.next : r.maxed ? 'Nivel máximo' : `Siguiente: ${r.next}`).setColor(r.locked ? '#c88a6a' : '#b8b0a0');
      ajustarAncho(row.info, PANEL_W - 96); // una línea, sin pisar el costo
      if (r.locked) row.cost.setText(`${r.def.costs[0]}`).setColor('#5a5650');
      else if (r.maxed) row.cost.setText('MÁX').setColor('#f2d48a');
      else row.cost.setText(`${r.cost}`).setColor(r.affordable ? '#bff8ff' : '#ff8a7a');
      if (r.locked) this.drawLock(row.pips, px + PANEL_W - 70, y + 8);
      // Niveles (pips).
      const pxPips = px + 200;
      for (let k = 0; k < r.def.maxLevel; k++) {
        const filled = k < r.level;
        row.pips.fillStyle(filled ? 0x9affc0 : 0x1a2a24, r.locked ? 0.4 : 1).fillRect(pxPips + k * 10, y + 5, 7, 7);
        row.pips.lineStyle(1, 0x5aa080, r.locked ? 0.4 : 1).strokeRect(pxPips + k * 10, y + 5, 7, 7);
      }
    });
  }

  /** Candado pequeño (12×12). */
  private drawLock(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.lineStyle(2, 0xc8a050, 1).strokeRoundedRect(x + 2, y - 1, 8, 8, 3);
    g.fillStyle(0xc8a050, 1).fillRect(x, y + 4, 12, 8);
    g.fillStyle(0x3a2a10, 1).fillRect(x + 5, y + 6, 2, 4);
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    sfx('ui_aceptar');
    // Que la tecla con que se cerró no la lea el nivel (E reabriría el altar; Esc pausaría).
    keys.endFrame();
    this.input.keyboard?.off('keydown', this.onKey, this);
    if (this.scene.isPaused('Level')) this.scene.resume('Level');
    this.scene.stop();
  }
}
