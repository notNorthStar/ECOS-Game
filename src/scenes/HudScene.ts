import Phaser from 'phaser';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { HUD, LASER } from '../config/combat';
import { lsm } from '../systems/Lsm';
import { getMariaStatus } from '../systems/Maria';

/**
 * HUD (dueño: combate). Escena 'Hud', encima de 'Level'.
 * Vida en segmentos, calor y modo del láser, conjuro seleccionado con su maestría, Ecos, gema,
 * avisos ('hud:toast'), nombre de zona ('zone:name'), barra del jefe y aviso de interacción.
 *
 * API para otros sistemas (funciona aunque el HUD aún no esté creado: guarda el estado):
 *   showPrompt(text | null)                — aviso de interacción, p. ej. "E · Examinar"
 *   showBossBar(name) / hideBossBar()      — barra del jefe
 *   updateBossBar(ratio, calm, calmMax, vulnerable)
 */

/* ------------------------- Estado compartido ------------------------- */

const shared = {
  prompt: null as string | null,
  boss: { visible: false, name: '', ratio: 1, calm: 0, calmMax: 2, vulnerable: false },
};

// Oyentes de módulo (una sola vez): así no se pierden avisos emitidos antes de que el HUD se cree
// (p. ej. el director anuncia la zona en el mismo create() de Level que lanza 'Hud').
const pending = {
  toasts: [] as { text: string; ms: number; at: number }[],
  zone: null as null | { title: string; subtitle?: string; at: number },
};
bus.on('hud:toast', ({ text, ms }) => {
  pending.toasts.push({ text, ms: ms ?? HUD.toastMs, at: performance.now() });
  if (pending.toasts.length > 6) pending.toasts.shift();
});
bus.on('zone:name', ({ title, subtitle }) => {
  pending.zone = { title, subtitle, at: performance.now() };
});

export function showPrompt(text: string | null): void {
  shared.prompt = text;
}
export function showBossBar(name: string): void {
  Object.assign(shared.boss, { visible: true, name, ratio: 1, calm: 0, vulnerable: false });
}
export function updateBossBar(ratio: number, calm = shared.boss.calm, calmMax = shared.boss.calmMax, vulnerable = false): void {
  Object.assign(shared.boss, { ratio: Phaser.Math.Clamp(ratio, 0, 1), calm, calmMax, vulnerable });
}
export function hideBossBar(): void {
  shared.boss.visible = false;
}

/* ------------------------------ Escena ------------------------------- */

const FONT = 'monospace';
const TX = {
  heartFull: '__hud_vida_llena',
  heartEmpty: '__hud_vida_vacia',
  eco: '__hud_eco',
  gem: '__hud_gema',
  hand: '__hud_mano_u',
  moon: '__hud_luna',
  maria: '__hud_maria',
};

/** Posiciones de las barras de escudo y Luna (Nivel 3). */
const ABIL = { iconX: 30, barX: 38, barW: 46, shieldY: 52, lunaY: 64, mariaY: 76 };

function textStyle(size: number, color = '#f4ead2', stroke = '#10101a'): Phaser.Types.GameObjects.Text.TextStyle {
  const scale = GameState.settings.textScale || 1;
  return { fontFamily: FONT, fontSize: `${Math.round(size * scale)}px`, color, stroke, strokeThickness: 3 };
}

export class HudScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Image[] = [];
  private heartsMax = -1;
  private heartsHp = -1;
  private gem!: Phaser.GameObjects.Sprite;
  private gemGlow!: Phaser.GameObjects.Image;
  private laserBox!: Phaser.GameObjects.Container;
  private laserMode!: Phaser.GameObjects.Text;
  private heatBar!: Phaser.GameObjects.Graphics;
  private heatLabel!: Phaser.GameObjects.Text;
  private spellBox!: Phaser.GameObjects.Container;
  private spellName!: Phaser.GameObjects.Text;
  private masteryDots!: Phaser.GameObjects.Graphics;
  private ecoIcon!: Phaser.GameObjects.Image;
  private ecoText!: Phaser.GameObjects.Text;
  private ecoShown = 0;
  private zoneBox!: Phaser.GameObjects.Container;
  private zoneTitle!: Phaser.GameObjects.Text;
  private zoneSub!: Phaser.GameObjects.Text;
  private zoneLines!: Phaser.GameObjects.Graphics;
  private zoneTween: Phaser.Tweens.TweenChain | null = null;
  private toastText!: Phaser.GameObjects.Text;
  private toastBg!: Phaser.GameObjects.Graphics;
  private toastLeft = 0;
  private bossBox!: Phaser.GameObjects.Container;
  private bossName!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossShown = 1;
  private promptBox!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private promptBg!: Phaser.GameObjects.Graphics;
  private promptShown: string | null = null;
  private t = 0;
  // Nivel 3 (dueño: sistemas): barras del escudo U y de Luna; ocultas hasta desbloquearse.
  private shieldIcon!: Phaser.GameObjects.Image;
  private shieldIconGlow!: Phaser.GameObjects.Image;
  private lunaIcon!: Phaser.GameObjects.Image;
  private abilityBars!: Phaser.GameObjects.Graphics;
  private shieldLabel!: Phaser.GameObjects.Text;
  private lunaLabel!: Phaser.GameObjects.Text;
  // Nivel 4 (dueño: sistemas): recarga del lamento de María.
  private mariaIcon!: Phaser.GameObjects.Image;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.makeTextures();
    this.hearts = [];
    this.heartsMax = -1;
    this.heartsHp = -1;
    this.ecoShown = GameState.ecos;
    this.toastLeft = 0;
    this.promptShown = null;
    this.zoneTween = null;

    // Gema (arriba a la izquierda) — pulsa.
    this.gemGlow = this.add.image(20, 20, '__hud_glow').setTint(0x7dffd0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
    this.gem = this.add.sprite(20, 20, this.textures.exists('ui_gema') ? 'ui_gema' : TX.gem);
    if (this.anims.exists('ui_gema')) this.gem.play({ key: 'ui_gema', repeat: -1 });

    // Láser.
    this.laserMode = this.add.text(0, 0, '', textStyle(8)).setOrigin(0, 0.5);
    this.heatBar = this.add.graphics();
    this.heatLabel = this.add.text(70, 0, '', textStyle(7, '#ff7a6a')).setOrigin(0, 0.5);
    this.laserBox = this.add.container(38, 34, [this.heatBar, this.laserMode, this.heatLabel]);

    // Escudo U y Luna (bajo el láser).
    this.abilityBars = this.add.graphics();
    this.shieldIconGlow = this.add.image(ABIL.iconX, ABIL.shieldY, '__hud_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0x7dffd0).setAlpha(0).setScale(0.7);
    this.shieldIcon = this.add.image(ABIL.iconX, ABIL.shieldY, TX.hand);
    this.lunaIcon = this.add.image(ABIL.iconX, ABIL.lunaY, TX.moon);
    this.shieldLabel = this.add.text(ABIL.barX + ABIL.barW + 5, ABIL.shieldY, '', textStyle(7, '#ff7a6a')).setOrigin(0, 0.5);
    this.lunaLabel = this.add.text(ABIL.barX + ABIL.barW + 5, ABIL.lunaY, '', textStyle(7, '#bfe6ff')).setOrigin(0, 0.5);
    this.mariaIcon = this.add.image(ABIL.iconX, ABIL.mariaY, TX.maria).setVisible(false);

    // Conjuro seleccionado (abajo a la izquierda).
    this.spellName = this.add.text(0, 0, '', textStyle(9, '#c8ffe0')).setOrigin(0, 0.5);
    this.masteryDots = this.add.graphics();
    this.spellBox = this.add.container(12, GAME_HEIGHT - 16, [this.spellName, this.masteryDots]);

    // Ecos (arriba a la derecha).
    this.ecoIcon = this.add.image(GAME_WIDTH - 14, 14, this.textures.exists('ui_eco') ? 'ui_eco' : TX.eco).setScale(1.25);
    this.ecoText = this.add.text(GAME_WIDTH - 24, 14, String(GameState.ecos), textStyle(10, '#bff8ff')).setOrigin(1, 0.5);

    // Nombre de zona (cartel grande tipo Worlorn).
    this.zoneLines = this.add.graphics();
    this.zoneTitle = this.add.text(0, -8, '', { ...textStyle(22, '#f4ead2', '#0a0a12'), strokeThickness: 4 }).setOrigin(0.5).setLetterSpacing(4);
    this.zoneSub = this.add.text(0, 16, '', textStyle(9, '#c8d8c0')).setOrigin(0.5).setLetterSpacing(2);
    this.zoneBox = this.add.container(GAME_WIDTH / 2, 92, [this.zoneLines, this.zoneTitle, this.zoneSub]).setAlpha(0);

    // Avisos.
    this.toastBg = this.add.graphics();
    this.toastText = this.add.text(0, 0, '', { ...textStyle(9), align: 'center', wordWrap: { width: GAME_WIDTH - 60 } }).setOrigin(0.5);
    const toastBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 72, [this.toastBg, this.toastText]);
    toastBox.setName('toast');
    this.toastText.setAlpha(0);

    // Barra del jefe.
    this.bossName = this.add.text(0, -10, '', textStyle(9, '#ffe0b0')).setOrigin(0.5, 0.5).setLetterSpacing(2);
    this.bossBar = this.add.graphics();
    this.bossBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 22, [this.bossBar, this.bossName]).setVisible(false);

    // Aviso de interacción.
    this.promptBg = this.add.graphics();
    this.promptText = this.add.text(0, 0, '', textStyle(9, '#ffffff')).setOrigin(0.5);
    this.promptBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 46, [this.promptBg, this.promptText]).setVisible(false);

    // Los avisos de una vida anterior del HUD caducan; la zona, si es reciente, se muestra.
    const now = performance.now();
    pending.toasts = pending.toasts.filter((t) => now - t.at < 1500);
    if (pending.zone && now - pending.zone.at > 1500) pending.zone = null;
    bus.scoped(this, 'ecos:changed', () => this.pulseEcos());
    bus.scoped(this, 'player:hurt', () => this.shakeHearts());
  }

  /* ---------------------------- Texturas ---------------------------- */

  private makeTextures(): void {
    if (this.textures.exists(TX.heartFull) && this.textures.exists(TX.maria)) return;
    const g = this.make.graphics({}, false);
    // Segmento de vida 12×12: rombo verde-jade (la gema), lleno / vacío.
    const seg = (fill: number, edge: number, a: number) => {
      g.clear();
      g.fillStyle(edge, 1).fillTriangle(6, 0, 12, 6, 6, 12).fillTriangle(6, 0, 0, 6, 6, 12);
      g.fillStyle(fill, a).fillTriangle(6, 2, 10, 6, 6, 10).fillTriangle(6, 2, 2, 6, 6, 10);
    };
    seg(0x6fffc0, 0x1f6050, 1);
    g.fillStyle(0xffffff, 0.9).fillRect(5, 3, 2, 2);
    g.generateTexture(TX.heartFull, 12, 12);
    seg(0x0a1a18, 0x2a4440, 1);
    g.generateTexture(TX.heartEmpty, 12, 12);
    g.clear();
    g.fillStyle(0x9ff7ff, 0.5).fillCircle(4, 4, 4);
    g.fillStyle(0xffffff, 1).fillCircle(4, 4, 2);
    g.generateTexture(TX.eco, 8, 8);
    g.clear();
    g.fillStyle(0x1a5a4a, 1).fillTriangle(12, 1, 23, 12, 12, 23).fillTriangle(12, 1, 1, 12, 12, 23);
    g.fillStyle(0x50e0b0, 1).fillTriangle(12, 4, 20, 12, 12, 20).fillTriangle(12, 4, 4, 12, 12, 20);
    g.fillStyle(0xc8fff0, 1).fillRect(10, 7, 3, 4);
    g.generateTexture(TX.gem, 24, 24);
    g.clear();
    for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.06 + (1 - r / 16) * 0.2).fillCircle(16, 16, r);
    g.generateTexture('__hud_glow', 32, 32);
    // Mano con la seña U (dos dedos juntos hacia arriba), 9×11, blanca para teñirla.
    g.clear();
    g.fillStyle(0xffffff, 1).fillRect(2, 0, 2, 6).fillRect(4, 0, 2, 6).fillRect(1, 5, 7, 5).fillRect(0, 6, 2, 2).fillRect(7, 3, 1, 3);
    g.fillStyle(0x808080, 1).fillRect(4, 1, 1, 4);
    g.generateTexture(TX.hand, 9, 11);
    // Luna creciente 10×10.
    g.clear();
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      pts.push(new Phaser.Math.Vector2(5 + Math.cos(a) * 5 - 1, 5 + Math.sin(a) * 5));
    }
    for (let i = 12; i >= 0; i--) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      pts.push(new Phaser.Math.Vector2(5 + Math.cos(a) * 2 - 1, 5 + Math.sin(a) * 4.6));
    }
    g.fillStyle(0xffffff, 1).fillPoints(pts, true);
    g.generateTexture(TX.moon, 10, 10);
    // María: silueta con rebozo 9×11, blanca para teñirla.
    g.clear();
    g.fillStyle(0xffffff, 1).fillEllipse(4.5, 3, 7, 6).fillTriangle(1, 3, 8, 3, 4.5, 11).fillTriangle(2, 6, 8, 6, 9, 11).fillRect(1, 6, 7, 5);
    g.fillStyle(0x808080, 1).fillRect(5, 2, 2, 3);
    g.generateTexture(TX.maria, 9, 11);
    g.destroy();
  }

  /* ------------------------------ Vida ------------------------------ */

  private heartTex(full: boolean): { key: string; frame?: number } {
    if (this.textures.exists('ui_vida')) {
      const tex = this.textures.get('ui_vida');
      return { key: 'ui_vida', frame: tex.frameTotal > 2 ? (full ? 0 : 1) : undefined };
    }
    return { key: full ? TX.heartFull : TX.heartEmpty };
  }

  private updateHearts(): void {
    const max = GameState.maxHp;
    const hp = Math.max(0, Math.ceil(GameState.hp));
    if (max !== this.heartsMax) {
      this.hearts.forEach((h) => h.destroy());
      this.hearts = [];
      for (let i = 0; i < max; i++) {
        const t = this.heartTex(true);
        this.hearts.push(this.add.image(40 + i * HUD.heartSpacing, 16, t.key, t.frame));
      }
      this.heartsMax = max;
      this.heartsHp = -1;
    }
    if (hp !== this.heartsHp) {
      this.hearts.forEach((h, i) => {
        const t = this.heartTex(i < hp);
        h.setTexture(t.key, t.frame);
        if (this.textures.exists('ui_vida') && this.textures.get('ui_vida').frameTotal <= 2 && i >= hp) h.setTint(0x303838);
        else h.clearTint();
        if (i === hp && this.heartsHp > hp) {
          this.tweens.add({ targets: h, scale: { from: 1.8, to: 1 }, duration: 220 });
        }
      });
      if (hp > this.heartsHp && this.heartsHp >= 0) {
        this.hearts.slice(this.heartsHp, hp).forEach((h) => this.tweens.add({ targets: h, scale: { from: 1.5, to: 1 }, duration: 260 }));
      }
      this.heartsHp = hp;
    }
    // Último segmento: late.
    if (hp === 1 && this.hearts[0]) this.hearts[0].setScale(1 + 0.15 * Math.max(0, Math.sin(this.t * 8)));
  }

  private shakeHearts(): void {
    this.hearts.forEach((h, i) => {
      this.tweens.add({ targets: h, y: { from: 16 + (i % 2 ? -2 : 2), to: 16 }, duration: 160 });
    });
  }

  /* ------------------------------ Láser ----------------------------- */

  private updateLaser(): void {
    this.laserBox.setVisible(GameState.hasLaser);
    if (!GameState.hasLaser) return;
    const green = GameState.laserMode === 'green';
    const col = green ? LASER.colors.green : LASER.colors.red;
    this.laserMode.setText(green ? '1 VERDE' : '2 ROJO').setColor(green ? '#7dffb0' : '#ff7a6a');
    const g = this.heatBar;
    const w = 46;
    const x = 0;
    const y = 8;
    g.clear();
    g.fillStyle(0x0a0a12, 0.85).fillRect(x - 1, y - 1, w + 2, 6);
    const heat = Phaser.Math.Clamp(GameState.laserHeat, 0, 1);
    const over = GameState.laserOverheated;
    const heatCol = over ? (Math.floor(this.t * 8) % 2 ? 0xff3020 : 0xffd040) : heat > 0.75 ? 0xff7040 : heat > 0.45 ? 0xffd060 : col;
    g.fillStyle(heatCol, 1).fillRect(x, y, Math.round(w * heat), 4);
    g.lineStyle(1, 0x3a3a4a, 1).strokeRect(x - 1, y - 1, w + 2, 6);
    // Indicador del modo.
    g.fillStyle(col, 1).fillRect(-8, -3, 5, 5);
    this.laserMode.setPosition(0, 0);
    this.heatLabel.setPosition(w + 6, y + 2).setText(over ? 'CALOR' : '').setAlpha(0.5 + 0.5 * Math.abs(Math.sin(this.t * 8)));
  }

  /* ------------------------- Escudo U y Luna ------------------------- */

  private updateAbilities(): void {
    const sh = GameState.shield;
    const lu = GameState.luna;
    const g = this.abilityBars;
    g.clear();
    const bar = (y: number, ratio: number, fill: number, frame: number) => {
      const w = ABIL.barW;
      g.fillStyle(0x0a0a12, 0.85).fillRect(ABIL.barX - 1, y - 3, w + 2, 6);
      g.fillStyle(fill, 1).fillRect(ABIL.barX, y - 2, Math.round(w * Phaser.Math.Clamp(ratio, 0, 1)), 4);
      g.lineStyle(1, frame, 1).strokeRect(ABIL.barX - 1, y - 3, w + 2, 6);
    };
    const blink = Math.floor(this.t * 8) % 2 === 0;

    // Escudo: la mano se enciende cuando la cámara ve la U.
    const showShield = sh.unlocked;
    this.shieldIcon.setVisible(showShield);
    this.shieldIconGlow.setVisible(showShield);
    this.shieldLabel.setVisible(showShield);
    if (showShield) {
      const seesU = lsm.cameraReady && lsm.last?.letter === 'U';
      this.shieldIcon.setTint(sh.broken ? 0x6a3a3a : seesU || sh.active ? 0xc8fff0 : lsm.cameraReady ? 0x4a7a6a : 0x3a4a46);
      this.shieldIconGlow.setAlpha(seesU ? 0.75 + 0.25 * Math.sin(this.t * 10) : sh.active ? 0.4 : 0);
      const fill = sh.broken ? (blink ? 0xff5a4a : 0x6a2a2a) : sh.active ? 0x9affe0 : sh.energy < 0.35 ? 0xffb060 : 0x50e0b0;
      bar(ABIL.shieldY, sh.energy, fill, sh.active ? 0x9affe0 : 0x2a5a4a);
      this.shieldLabel.setText(sh.broken ? 'ROTO' : '').setAlpha(blink ? 1 : 0.6);
    }

    // Luna.
    const showLuna = lu.unlocked;
    this.lunaIcon.setVisible(showLuna);
    this.lunaLabel.setVisible(showLuna);
    if (showLuna) {
      this.lunaIcon.setTint(lu.active ? 0xe8f6ff : 0x5a6a8a).setScale(lu.active ? 1 + 0.1 * Math.sin(this.t * 4) : 1);
      bar(ABIL.lunaY, lu.energy, lu.active ? 0xbfe6ff : 0x6a8ad0, lu.active ? 0xbfe6ff : 0x2a3a5a);
      this.lunaLabel.setText(lu.active ? '' : 'F');
    }

    // María: recarga de su lamento (solo si está en escena).
    const ma = getMariaStatus();
    const showMaria = GameState.hasMaria && ma.visible;
    this.mariaIcon.setVisible(showMaria);
    if (showMaria) {
      const ready = ma.charge >= 1;
      this.mariaIcon.setTint(ma.casting ? 0xffffff : ready ? 0xbfd8ff : 0x5a6a8a).setScale(ma.casting ? 1 + 0.15 * Math.sin(this.t * 20) : 1);
      bar(ABIL.mariaY, ma.charge, ma.casting ? 0xe8f2ff : ready ? 0xbfd8ff : 0x6a7ab0, ready ? 0xbfd8ff : 0x2a3a5a);
    }
  }

  /* ----------------------------- Conjuro ---------------------------- */

  private updateSpell(): void {
    const id = GameState.selectedSpell;
    this.spellBox.setVisible(!!id);
    if (!id) return;
    const lvl = GameState.mastery[id]?.level ?? 0;
    this.spellName.setText(`Q  ${id}`);
    const g = this.masteryDots;
    g.clear();
    const x0 = this.spellName.width + 8;
    for (let i = 0; i < 3; i++) {
      const filled = i < lvl;
      g.fillStyle(filled ? 0x9affc0 : 0x1a2a24, 1).fillCircle(x0 + i * 9, 0, 3);
      g.lineStyle(1, 0x5aa080, 1).strokeCircle(x0 + i * 9, 0, 3);
    }
    if (lvl >= 3) this.spellName.setColor(Math.floor(this.t * 2) % 2 ? '#e0fff0' : '#9affc0');
    else this.spellName.setColor('#c8ffe0');
  }

  /* ------------------------------ Ecos ------------------------------ */

  private pulseEcos(): void {
    this.tweens.add({ targets: this.ecoIcon, scale: { from: 2, to: 1.25 }, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.ecoText, scale: { from: 1.25, to: 1 }, duration: 200 });
  }

  private updateEcos(dt: number): void {
    const target = GameState.ecos;
    if (this.ecoShown !== target) {
      const diff = target - this.ecoShown;
      const step = Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 10)));
      this.ecoShown += Math.sign(diff) * Math.min(Math.abs(diff), step);
      this.ecoText.setText(String(this.ecoShown));
    }
  }

  /* --------------------------- Nombre de zona -------------------------- */

  private showZone(title: string, subtitle?: string): void {
    this.zoneTween?.stop();
    this.zoneTitle.setText(title.toUpperCase());
    this.zoneSub.setText(subtitle ?? '');
    const w = Math.max(this.zoneTitle.width, this.zoneSub.width) + 40;
    const g = this.zoneLines;
    g.clear();
    g.fillStyle(0x000000, 0.35).fillRect(-w / 2 - 20, -26, w + 40, subtitle ? 56 : 40);
    g.lineStyle(1, 0xd8cca8, 0.8);
    g.lineBetween(-w / 2, 8, -14, 8).lineBetween(14, 8, w / 2, 8);
    g.fillStyle(0xd8cca8, 0.9).fillRect(-2, 6, 4, 4);
    this.zoneBox.setAlpha(0).setScale(1.06);
    this.zoneTween = this.tweens.chain({
      targets: this.zoneBox,
      tweens: [
        { alpha: 1, scale: 1, duration: HUD.zoneFadeIn, ease: 'Sine.easeOut' },
        { alpha: 1, duration: HUD.zoneHold },
        { alpha: 0, duration: HUD.zoneFadeOut, ease: 'Sine.easeIn' },
      ],
    });
  }

  /* ------------------------------ Avisos ----------------------------- */

  private updateToast(dt: number): void {
    if (this.toastLeft > 0) {
      this.toastLeft -= dt * 1000;
      if (this.toastLeft <= 0) {
        this.tweens.add({ targets: [this.toastText, this.toastBg], alpha: 0, duration: 250 });
      }
      return;
    }
    const next = pending.toasts.shift();
    if (!next) return;
    this.toastText.setText(next.text).setAlpha(1);
    const w = this.toastText.width + 16;
    const h = Math.max(18, this.toastText.height + 6); // avisos largos ocupan dos líneas
    this.toastBg.clear().fillStyle(0x0a0a14, 0.75).fillRoundedRect(-w / 2, -h / 2, w, h, 4).lineStyle(1, 0x5a8a7a, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
    this.toastBg.setAlpha(1);
    this.toastLeft = next.ms;
    this.tweens.add({ targets: [this.toastText, this.toastBg], y: { from: 6, to: 0 }, duration: 160 });
  }

  /* --------------------------- Barra del jefe -------------------------- */

  private updateBoss(dt: number): void {
    const b = shared.boss;
    this.bossBox.setVisible(b.visible);
    if (!b.visible) {
      this.bossShown = 1;
      return;
    }
    this.bossName.setText(b.vulnerable ? `${b.name.toUpperCase()} · ¡VULNERABLE!` : b.name.toUpperCase());
    this.bossName.setColor(b.vulnerable ? (Math.floor(this.t * 6) % 2 ? '#9affc0' : '#ffffff') : '#ffe0b0');
    this.bossShown += (b.ratio - this.bossShown) * Math.min(1, dt * 4);
    const w = HUD.bossBarWidth;
    const g = this.bossBar;
    g.clear();
    g.fillStyle(0x0a0a12, 0.85).fillRect(-w / 2 - 2, -3, w + 4, 9);
    g.fillStyle(0xffffff, 0.35).fillRect(-w / 2, -1, w * this.bossShown, 5);
    g.fillStyle(b.vulnerable ? 0x7dffb0 : 0xd05a3a, 1).fillRect(-w / 2, -1, w * b.ratio, 5);
    g.lineStyle(1, 0x8a7a5a, 1).strokeRect(-w / 2 - 2, -3, w + 4, 9);
    // Marca de la fase 2 (50 %).
    g.fillStyle(0xf4ead2, 0.8).fillRect(-1, -3, 1, 9);
    // Puntos de calma.
    for (let i = 0; i < b.calmMax; i++) {
      const x = w / 2 + 10 + i * 10;
      g.fillStyle(i < b.calm ? 0x9affc0 : 0x1a2a24, 1).fillCircle(x, 2, 3.5);
      g.lineStyle(1, 0x5aa080, 1).strokeCircle(x, 2, 3.5);
    }
  }

  /* ----------------------------- Interacción ---------------------------- */

  private updatePrompt(): void {
    const p = shared.prompt;
    if (p === this.promptShown) return;
    this.promptShown = p;
    if (!p) {
      this.promptBox.setVisible(false);
      return;
    }
    this.promptText.setText(p);
    const w = this.promptText.width + 14;
    this.promptBg.clear().fillStyle(0x0a0a14, 0.7).fillRoundedRect(-w / 2, -8, w, 16, 3);
    this.promptBox.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.promptBox, alpha: 1, duration: 120 });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.t += dt;
    if (pending.zone) {
      const z = pending.zone;
      pending.zone = null;
      this.showZone(z.title, z.subtitle);
    }
    // Encima de la escena del nivel (y debajo de menús).
    this.updateHearts();
    const pulse = 1 + 0.08 * Math.sin(this.t * 2.4);
    this.gem.setScale(pulse);
    this.gemGlow.setScale(0.9 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 2.4))).setAlpha(0.35 + 0.25 * Math.sin(this.t * 2.4));
    this.updateLaser();
    this.updateAbilities();
    this.updateSpell();
    this.updateEcos(dt);
    this.updateToast(dt);
    this.updateBoss(dt);
    this.updatePrompt();
  }
}
