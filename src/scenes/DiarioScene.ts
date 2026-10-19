import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { LETTERS } from '../lsm';
import { createHandDiagram } from '../lsm/adapters/phaser/HandDiagram';
import { getMastery, getSpellDef, MASTERY_MAX, pointsToNext } from '../systems/Mastery';
import { COL, masteryDots, onDomKey, panel, txt } from './SpellScene';

/**
 * Dueño: lsm. Diario de Señas (Tab, GDD 6.1): conjuros aprendidos, sus letras con el esquema de la mano
 * y la explicación de cada seña. Tab o Esc cierra y reanuda 'Level'. Lo abre openDiario() de Casting.
 */
export class DiarioScene extends Phaser.Scene {
  private spellIdx = 0;
  private letterIdx = 0;
  private page?: Phaser.GameObjects.Container;
  private hands: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('Diario');
  }

  create(): void {
    this.spellIdx = Math.max(0, GameState.learnedSpells.indexOf(GameState.selectedSpell ?? ''));
    this.letterIdx = 0;
    this.hands = [];
    this.page = undefined;
    this.add.rectangle(0, 0, 640, 360, 0x05060a, 0.72).setOrigin(0);
    panel(this, 16, 12, 608, 336, COL.goldN, 0.97);
    txt(this, 320, 20, 'DIARIO DE SEÑAS', 16, COL.gold, { ox: 0.5 });
    txt(this, 320, 336, 'W/S conjuro · A/D letra · clic · Tab o Esc: cerrar', 8, COL.dim, { ox: 0.5, oy: 1 });
    this.render();
    onDomKey(this, (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Tab' || e.code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) this.close();
      return;
    }
    const n = GameState.learnedSpells.length;
    const id = GameState.learnedSpells[this.spellIdx];
    const nl = id ? (getSpellDef(id)?.letters.length ?? 0) : 0;
    if ((e.code === 'KeyW' || e.code === 'ArrowUp') && n > 1) {
      this.spellIdx = (this.spellIdx + n - 1) % n;
      this.letterIdx = 0;
    } else if ((e.code === 'KeyS' || e.code === 'ArrowDown') && n > 1) {
      this.spellIdx = (this.spellIdx + 1) % n;
      this.letterIdx = 0;
    } else if ((e.code === 'KeyA' || e.code === 'ArrowLeft') && nl) {
      this.letterIdx = (this.letterIdx + nl - 1) % nl;
    } else if ((e.code === 'KeyD' || e.code === 'ArrowRight') && nl) {
      this.letterIdx = (this.letterIdx + 1) % nl;
    } else return;
    sfx('ui_mover');
    this.render();
  }

  private render(): void {
    this.page?.destroy();
    this.hands.forEach((h) => h.destroy());
    this.hands = [];
    const c = this.add.container(0, 0);
    this.page = c;
    const learned = GameState.learnedSpells;
    if (!learned.length) {
      c.add(
        txt(this, 320, 150, 'Aún no has aprendido ningún conjuro.\nBusca grabados, notas y personajes: interactúa con E.', 10, COL.ink, {
          ox: 0.5,
          align: 'center',
        }),
      );
      return;
    }
    // lista de conjuros (izquierda)
    learned.forEach((id, i) => {
      const def = getSpellDef(id);
      const y = 48 + i * 30;
      const sel = i === this.spellIdx;
      const t = txt(this, 30, y, `${sel ? '>' : ' '} ${(def?.name ?? id).toUpperCase()}`, 10, sel ? COL.gold : COL.ink);
      t.setInteractive({ useHandCursor: true });
      t.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        this.spellIdx = i;
        this.letterIdx = 0;
        sfx('ui_mover');
        this.render();
      });
      c.add(t);
      c.add(masteryDots(this, 52, y + 18, id));
    });
    const g = this.add.graphics();
    g.lineStyle(1, COL.edgeN, 1).lineBetween(150.5, 44, 150.5, 320);
    c.add(g);

    // detalle (derecha)
    const id = learned[this.spellIdx];
    const def = getSpellDef(id);
    if (!def) return;
    const m = getMastery(id);
    const x0 = 164;
    c.add(txt(this, x0, 44, def.name.toUpperCase(), 16, COL.gold));
    c.add(
      txt(
        this,
        606,
        48,
        m.level >= MASTERY_MAX ? 'Dominado: se lanza solo' : `Maestría ${m.level}/3 · faltan ${pointsToNext(id)} pts`,
        8,
        COL.dim,
        { ox: 1 },
      ),
    );
    c.add(txt(this, x0, 66, def.desc, 8, COL.ink, { wrap: 440 }));
    if (def.learnedFrom) c.add(txt(this, x0, 80, `Aprendido: ${def.learnedFrom}`, 8, COL.dim, { wrap: 440 }));

    // letras con su mano
    const L = def.letters;
    const cell = 44;
    const startX = Math.round(x0 + (440 - L.length * cell) / 2);
    L.forEach((letter, i) => {
      const cx = startX + i * cell + cell / 2;
      const sel = i === this.letterIdx;
      const bg = this.add.graphics();
      bg.fillStyle(sel ? 0x1c2c3e : 0x0e1522, 1).fillRect(cx - 20, 98, 40, 92);
      bg.lineStyle(1, sel ? COL.goldN : COL.edgeN, 1).strokeRect(cx - 19.5, 98.5, 39, 91);
      c.add(bg);
      const hand = createHandDiagram(this, cx, 140, letter, 1);
      hand.setScale(0.75);
      this.hands.push(hand);
      c.add(txt(this, cx, 178, letter, 12, sel ? COL.gold : COL.ink, { ox: 0.5, oy: 0.5 }));
      const zone = this.add.zone(cx, 144, 40, 92).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        this.letterIdx = i;
        sfx('ui_mover');
        this.render();
      });
      c.add(zone);
    });

    // letra seleccionada en grande
    const letter = L[this.letterIdx];
    const ld = LETTERS[letter];
    const big = createHandDiagram(this, x0 + 60, 262, letter, 2);
    this.hands.push(big);
    c.add(txt(this, x0 + 130, 204, letter, 32, COL.gold));
    c.add(txt(this, x0 + 130, 246, ld?.desc ?? 'Seña sin descripción.', 10, COL.ink, { wrap: 300 }));
    if (ld?.motion) c.add(txt(this, x0 + 130, 296, 'Lleva movimiento: traza la Z con el índice.', 8, COL.gold));
    c.add(txt(this, x0 + 130, 310, 'Esquema provisional, pendiente de verificar con la SEP.', 8, COL.dim));
  }

  private close(): void {
    sfx('ui_aceptar');
    this.scene.resume('Level');
    bus.emit('game:pause', { paused: false });
    this.scene.stop();
  }
}
