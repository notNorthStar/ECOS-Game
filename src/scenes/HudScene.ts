import Phaser from 'phaser';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { HUD, LASER } from '../config/combat';
import { lsm } from '../systems/Lsm';
import { getMariaStatus } from '../systems/Maria';
import { getCooldown, getSpellDef } from '../systems/Casting';
import { getMastery, MASTERY_MAX } from '../systems/Mastery';
import { conEscala, estiloTexto, TAM } from '../ui/fuente';

/**
 * HUD (dueño: interfaz). Escena 'Hud', encima de 'Level'.
 *
 * Minimalista, todo en la esquina superior izquierda (termina antes de y = 70 para no encimarse
 * con los contadores de misión de los directores, que van en x 12, y ≥ 74):
 *   fila 1 · gema + barra de vida (un segmento por unidad; destello al recibir daño y al curar) + Ecos
 *   fila 2 · modo del láser (verde/rojo) + calor
 *   fila 3 · conjuro seleccionado: anillo de recarga ('spell:cooldown' / getCooldown), nombre y maestría
 *   fila 4 · escudo U y Luna · fila 5 · lamento de María
 * Además: avisos ('hud:toast'), nombre de zona ('zone:name'), barra del jefe y aviso de interacción.
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
  /** Conjuros cuya recarga acaba de terminar (para el destello de "listo"). */
  ready: new Set<string>(),
};
bus.on('hud:toast', ({ text, ms }) => {
  pending.toasts.push({ text, ms: ms ?? HUD.toastMs, at: performance.now() });
  if (pending.toasts.length > 6) pending.toasts.shift();
});
bus.on('zone:name', ({ title, subtitle }) => {
  pending.zone = { title, subtitle, at: performance.now() };
});
// Recargas (las emite Casting): el HUD lee el valor exacto con getCooldown() cada cuadro y usa
// el aviso final (remaining 0) para el destello de "listo".
bus.on('spell:cooldown', ({ spellId, remaining, total }) => {
  if (remaining <= 0 && total > 0) pending.ready.add(spellId);
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

const TX = {
  eco: '__hud_eco',
  gem: '__hud_gema',
  hand: '__hud_mano_u',
  moon: '__hud_luna',
  maria: '__hud_maria',
  glow: '__hud_glow',
};

/** Distribución (px del lienzo de 640×360). */
const L = {
  iconX: 12, // columna de íconos
  x0: 22, // inicio de barras y textos
  vidaY: 11,
  vidaH: 6,
  /** Ancho de cada unidad de vida (la barra crece con las mejoras de Vida). */
  vidaSeg: 11,
  laserY: 24,
  heatW: 40,
  spellY: 37,
  abilY: 50,
  mariaY: 61,
  abilW: 28,
  lunaX: 66,
} as const;

/** Paleta del HUD. */
const C = {
  ink: '#efe6d2',
  dim: '#8b93a6',
  jade: 0x6fffc0,
  jadeDark: 0x1f6050,
  back: 0x0a0a12,
  edge: 0x2a4440,
  hurt: 0xff5a4a,
  heal: 0xc8fff0,
};

/** Texto chico del HUD: fuente pixel a 11 px, contorno fino. */
const chico = (color: string = C.ink) => estiloTexto(TAM.chico, color, { grosor: 2 });

export class HudScene extends Phaser.Scene {
  private gem!: Phaser.GameObjects.Sprite;
  private gemGlow!: Phaser.GameObjects.Image;
  private vida!: Phaser.GameObjects.Graphics;
  private vidaFlash!: Phaser.GameObjects.Graphics;
  private vidaShown = -1; // vida que dibuja la barra "fantasma" (persigue a la real)
  private vidaPrev = -1;
  private ecoIcon!: Phaser.GameObjects.Image;
  private ecoText!: Phaser.GameObjects.Text;
  private ecoShown = 0;
  private laser!: Phaser.GameObjects.Graphics;
  private laserLabel!: Phaser.GameObjects.Text;
  private spellRing!: Phaser.GameObjects.Graphics;
  private spellName!: Phaser.GameObjects.Text;
  private spellCd!: Phaser.GameObjects.Text;
  private spellDots!: Phaser.GameObjects.Graphics;
  private spellReadyFx!: Phaser.GameObjects.Image;
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
  // Escudo U, Luna y María (se ocultan hasta desbloquearse).
  private shieldIcon!: Phaser.GameObjects.Image;
  private shieldIconGlow!: Phaser.GameObjects.Image;
  private lunaIcon!: Phaser.GameObjects.Image;
  private lunaKey!: Phaser.GameObjects.Text;
  private abilityBars!: Phaser.GameObjects.Graphics;
  private mariaIcon!: Phaser.GameObjects.Image;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.makeTextures();
    this.vidaShown = -1;
    this.vidaPrev = -1;
    this.ecoShown = GameState.ecos;
    this.toastLeft = 0;
    this.promptShown = null;
    this.zoneTween = null;
    const s = GameState.settings.textScale || 1;

    // Fila 1: gema + vida + Ecos.
    this.gemGlow = this.add.image(L.iconX, L.vidaY, TX.glow).setTint(0x7dffd0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setScale(0.6);
    this.gem = this.add.sprite(L.iconX, L.vidaY, this.textures.exists('ui_gema') ? 'ui_gema' : TX.gem);
    this.gem.setDisplaySize(12, 12);
    if (this.anims.exists('ui_gema')) this.gem.play({ key: 'ui_gema', repeat: -1 });
    this.vida = this.add.graphics();
    this.vidaFlash = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.ecoIcon = this.add.image(0, L.vidaY, this.textures.exists('ui_eco') ? 'ui_eco' : TX.eco);
    this.ecoText = this.add.text(0, L.vidaY, String(GameState.ecos), chico('#bff8ff')).setOrigin(0, 0.5);

    // Fila 2: láser.
    this.laser = this.add.graphics();
    this.laserLabel = this.add.text(L.x0 + L.heatW + 6, L.laserY, '', chico()).setOrigin(0, 0.5);

    // Fila 3: conjuro con su recarga y maestría.
    this.spellReadyFx = this.add.image(L.iconX, L.spellY, TX.glow).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.55);
    this.spellRing = this.add.graphics();
    this.spellName = this.add.text(L.x0, L.spellY, '', chico()).setOrigin(0, 0.5);
    this.spellDots = this.add.graphics();
    this.spellCd = this.add.text(0, L.spellY, '', chico(C.dim)).setOrigin(0, 0.5);

    // Filas 4 y 5: escudo U, Luna y María.
    this.abilityBars = this.add.graphics();
    this.shieldIconGlow = this.add.image(L.iconX, L.abilY, TX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0x7dffd0).setAlpha(0).setScale(0.5);
    this.shieldIcon = this.add.image(L.iconX, L.abilY, TX.hand);
    this.lunaIcon = this.add.image(L.lunaX - 8, L.abilY, TX.moon);
    this.lunaKey = this.add.text(L.lunaX + L.abilW + 4, L.abilY, 'F', chico('#bfe6ff')).setOrigin(0, 0.5);
    this.mariaIcon = this.add.image(L.iconX, L.mariaY, TX.maria).setVisible(false);

    // Nombre de zona (cartel tipo Worlorn).
    this.zoneLines = this.add.graphics();
    this.zoneTitle = this.add.text(0, -8, '', estiloTexto(TAM.cartel, '#f4ead2', { grosor: 4 })).setOrigin(0.5).setLetterSpacing(3);
    this.zoneSub = this.add.text(0, 14, '', estiloTexto(conEscala(TAM.chico, s), '#c8d8c0')).setOrigin(0.5).setLetterSpacing(1);
    this.zoneBox = this.add.container(GAME_WIDTH / 2, 92, [this.zoneLines, this.zoneTitle, this.zoneSub]).setAlpha(0);

    // Avisos.
    this.toastBg = this.add.graphics();
    this.toastText = this.add
      .text(0, 0, '', { ...estiloTexto(conEscala(TAM.chico, s)), align: 'center', wordWrap: { width: GAME_WIDTH - 80 }, lineSpacing: 1 })
      .setOrigin(0.5);
    const toastBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 72, [this.toastBg, this.toastText]);
    toastBox.setName('toast');
    this.toastText.setAlpha(0);

    // Barra del jefe.
    this.bossName = this.add.text(0, -11, '', estiloTexto(TAM.chico, '#ffe0b0')).setOrigin(0.5, 0.5).setLetterSpacing(2);
    this.bossBar = this.add.graphics();
    this.bossBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 22, [this.bossBar, this.bossName]).setVisible(false);

    // Aviso de interacción.
    this.promptBg = this.add.graphics();
    this.promptText = this.add.text(0, 0, '', estiloTexto(conEscala(TAM.chico, s), '#ffffff', { grosor: 2 })).setOrigin(0.5);
    this.promptBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 46, [this.promptBg, this.promptText]).setVisible(false);

    // Los avisos de una vida anterior del HUD caducan; la zona, si es reciente, se muestra.
    const now = performance.now();
    pending.toasts = pending.toasts.filter((t) => now - t.at < 1500);
    if (pending.zone && now - pending.zone.at > 1500) pending.zone = null;
    pending.ready.clear();
    bus.scoped(this, 'ecos:changed', () => this.pulseEcos());
  }

  /* ---------------------------- Texturas ---------------------------- */

  private makeTextures(): void {
    if (this.textures.exists(TX.maria) && this.textures.exists(TX.glow)) return;
    const g = this.make.graphics({}, false);
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
    g.generateTexture(TX.glow, 32, 32);
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

  private updateVida(dt: number): void {
    const max = Math.max(1, GameState.maxHp);
    const hp = Phaser.Math.Clamp(GameState.hp, 0, max);
    const w = max * L.vidaSeg;
    const x = L.x0;
    const y = L.vidaY - L.vidaH / 2;

    // Cambios: daño → destello rojo-blanco sobre lo perdido; curación → destello verde sobre lo ganado.
    if (this.vidaPrev >= 0 && hp !== this.vidaPrev) this.flashVida(this.vidaPrev, hp, max);
    if (this.vidaShown < 0 || hp > this.vidaShown) this.vidaShown = hp;
    this.vidaPrev = hp;
    // La barra fantasma (lo perdido) se vacía con un pequeño retraso.
    if (this.vidaShown > hp) this.vidaShown = Math.max(hp, this.vidaShown - dt * Math.max(1.2, (this.vidaShown - hp) * 3));

    const g = this.vida;
    g.clear();
    g.fillStyle(C.back, 0.75).fillRect(x - 1, y - 1, w + 2, L.vidaH + 2);
    g.fillStyle(0x16242a, 1).fillRect(x, y, w, L.vidaH);
    // Lo recién perdido.
    if (this.vidaShown > hp) g.fillStyle(C.hurt, 0.85).fillRect(x, y, Math.round((w * this.vidaShown) / max), L.vidaH);
    // Vida actual; con 1 unidad o menos, late en coral.
    const low = hp <= 1;
    const beat = low ? 0.5 + 0.5 * Math.sin(this.t * 7) : 0;
    const fill = low ? Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xff7a6a), Phaser.Display.Color.ValueToColor(0xffd0c0), 100, Math.round(beat * 100)) : null;
    const col = fill ? Phaser.Display.Color.GetColor(fill.r, fill.g, fill.b) : C.jade;
    const fw = Math.round((w * hp) / max);
    g.fillStyle(col, 1).fillRect(x, y, fw, L.vidaH);
    g.fillStyle(0xffffff, 0.35).fillRect(x, y, fw, 1); // brillo superior
    g.fillStyle(C.jadeDark, 0.6).fillRect(x, y + L.vidaH - 1, fw, 1); // sombra inferior
    // Segmentos sutiles: una marca por unidad de vida.
    for (let i = 1; i < max; i++) g.fillStyle(C.back, 0.55).fillRect(x + i * L.vidaSeg, y, 1, L.vidaH);
    g.lineStyle(1, low ? 0x6a3a3a : C.edge, 1).strokeRect(x - 1.5, y - 1.5, w + 3, L.vidaH + 3);

    // Ecos a la derecha de la barra.
    const ex = x + w + 12;
    this.ecoIcon.setPosition(ex, L.vidaY);
    this.ecoText.setPosition(ex + 7, L.vidaY);
  }

  private flashVida(prev: number, hp: number, max: number): void {
    const w = max * L.vidaSeg;
    const y = L.vidaY - L.vidaH / 2;
    const a = Math.min(prev, hp);
    const b = Math.max(prev, hp);
    const fx = this.vidaFlash;
    fx.clear();
    const hurt = hp < prev;
    if (hurt) {
      // Toda la barra parpadea y lo perdido brilla.
      fx.fillStyle(0xffffff, 0.45).fillRect(L.x0 - 1, y - 1, w + 2, L.vidaH + 2);
      fx.fillStyle(0xffffff, 0.9).fillRect(L.x0 + Math.round((w * a) / max), y, Math.max(2, Math.round((w * (b - a)) / max)), L.vidaH);
    } else {
      fx.fillStyle(C.heal, 0.9).fillRect(L.x0 + Math.round((w * a) / max), y - 2, Math.max(2, Math.round((w * (b - a)) / max)), L.vidaH + 4);
      fx.fillStyle(C.jade, 0.35).fillRect(L.x0 - 2, y - 2, w + 4, L.vidaH + 4);
    }
    this.tweens.killTweensOf(fx);
    fx.setAlpha(1);
    this.tweens.add({ targets: fx, alpha: 0, duration: hurt ? 260 : 520, ease: 'Sine.easeOut' });
    if (hurt && !GameState.settings.reduceFx) {
      this.tweens.add({ targets: [this.vida, fx], x: { from: 2, to: 0 }, duration: 160, ease: 'Bounce.easeOut' });
    }
    if (!hurt) this.tweens.add({ targets: this.gemGlow, scale: { from: 1.1, to: 0.6 }, duration: 500 });
  }

  /* ------------------------------ Láser ----------------------------- */

  private updateLaser(): void {
    const g = this.laser;
    g.clear();
    this.laserLabel.setVisible(GameState.hasLaser);
    if (!GameState.hasLaser) return;
    const green = GameState.laserMode === 'green';
    const col = green ? LASER.colors.green : LASER.colors.red;
    const y = L.laserY;
    // Chip del modo (1 verde aturde / 2 rojo daña).
    g.fillStyle(C.back, 0.8).fillRect(L.iconX - 4, y - 4, 8, 8);
    g.fillStyle(col, 1).fillRect(L.iconX - 3, y - 3, 6, 6);
    g.fillStyle(0xffffff, 0.5).fillRect(L.iconX - 3, y - 3, 6, 1);
    // Calor: barra fina.
    const heat = Phaser.Math.Clamp(GameState.laserHeat, 0, 1);
    const over = GameState.laserOverheated;
    const blink = Math.floor(this.t * 8) % 2 === 0;
    const heatCol = over ? (blink ? 0xff3020 : 0xffd040) : heat > 0.75 ? 0xff7040 : heat > 0.45 ? 0xffd060 : col;
    g.fillStyle(C.back, 0.75).fillRect(L.x0 - 1, y - 2, L.heatW + 2, 4);
    g.fillStyle(0x1e2838, 1).fillRect(L.x0, y - 1, L.heatW, 2);
    if (heat > 0) g.fillStyle(heatCol, 1).fillRect(L.x0, y - 1, Math.max(1, Math.round(L.heatW * heat)), 2);
    if (over) this.laserLabel.setText('CALOR').setColor('#ff7a6a').setAlpha(blink ? 1 : 0.6);
    else this.laserLabel.setText(green ? 'VERDE' : 'ROJO').setColor(green ? '#7dffb0' : '#ff8a7a').setAlpha(0.85);
  }

  /* ------------------------- Escudo U, Luna y María ------------------------- */

  private updateAbilities(): void {
    const sh = GameState.shield;
    const lu = GameState.luna;
    const g = this.abilityBars;
    g.clear();
    const bar = (x: number, y: number, ratio: number, fill: number) => {
      g.fillStyle(C.back, 0.75).fillRect(x - 1, y - 2, L.abilW + 2, 4);
      g.fillStyle(0x1e2838, 1).fillRect(x, y - 1, L.abilW, 2);
      const r = Phaser.Math.Clamp(ratio, 0, 1);
      if (r > 0) g.fillStyle(fill, 1).fillRect(x, y - 1, Math.max(1, Math.round(L.abilW * r)), 2);
    };
    const blink = Math.floor(this.t * 8) % 2 === 0;

    // Escudo (clic derecho o la seña U con cámara): la mano se enciende cuando la cámara ve la U.
    const showShield = sh.unlocked;
    this.shieldIcon.setVisible(showShield);
    this.shieldIconGlow.setVisible(showShield);
    if (showShield) {
      const seesU = lsm.cameraReady && lsm.last?.letter === 'U';
      this.shieldIcon.setTint(sh.broken ? 0x8a4a4a : seesU || sh.active ? 0xc8fff0 : 0x5a8a7a);
      this.shieldIconGlow.setAlpha(seesU ? 0.75 + 0.25 * Math.sin(this.t * 10) : sh.active ? 0.4 : 0);
      const fill = sh.broken ? (blink ? 0xff5a4a : 0x6a2a2a) : sh.active ? 0x9affe0 : sh.energy < 0.35 ? 0xffb060 : 0x50e0b0;
      bar(L.x0, L.abilY, sh.broken ? 1 : sh.energy, fill);
    }

    // Luna (F): los espíritus solo se ven con ella activa.
    const showLuna = lu.unlocked;
    this.lunaIcon.setVisible(showLuna);
    this.lunaKey.setVisible(showLuna && !lu.active);
    if (showLuna) {
      this.lunaIcon.setTint(lu.active ? 0xe8f6ff : 0x6a7a9a).setScale(lu.active ? 1 + 0.1 * Math.sin(this.t * 4) : 1);
      bar(L.lunaX, L.abilY, lu.energy, lu.active ? 0xbfe6ff : 0x6a8ad0);
    }

    // María: recarga de su lamento (solo si está en escena).
    const ma = getMariaStatus();
    const showMaria = GameState.hasMaria && ma.visible;
    this.mariaIcon.setVisible(showMaria);
    if (showMaria) {
      const ready = ma.charge >= 1;
      this.mariaIcon.setTint(ma.casting ? 0xffffff : ready ? 0xbfd8ff : 0x5a6a8a).setScale(ma.casting ? 1 + 0.15 * Math.sin(this.t * 20) : 1);
      bar(L.x0, L.mariaY, ma.charge, ma.casting ? 0xe8f2ff : ready ? 0xbfd8ff : 0x6a7ab0);
    }
  }

  /* ----------------------------- Conjuro ---------------------------- */

  private updateSpell(): void {
    const id = GameState.selectedSpell;
    const visible = !!id;
    this.spellRing.setVisible(visible);
    this.spellName.setVisible(visible);
    this.spellDots.setVisible(visible);
    this.spellCd.setVisible(visible);
    if (!id) return;
    const def = getSpellDef(id);
    const color = Phaser.Display.Color.HexStringToColor(def?.color ?? '#7fe0d0').color;
    const lvl = getMastery(id).level;
    const cd = getCooldown(id);
    const cooling = cd.remaining > 0 && cd.total > 0;
    const frac = cooling ? Phaser.Math.Clamp(cd.remaining / cd.total, 0, 1) : 0;

    // Anillo de recarga: lleno = listo; mientras recarga, el arco restante se vacía en sentido horario.
    const g = this.spellRing;
    const x = L.iconX;
    const y = L.spellY;
    g.clear();
    g.fillStyle(C.back, 0.8).fillCircle(x, y, 6);
    if (cooling) {
      g.fillStyle(0x2a3346, 1).fillCircle(x, y, 4);
      g.lineStyle(2, 0x3a4458, 1).strokeCircle(x, y, 5);
      g.lineStyle(2, 0xf2c86b, 1);
      g.beginPath();
      g.arc(x, y, 5, -Math.PI / 2 + (1 - frac) * Math.PI * 2, Math.PI * 1.5, false);
      g.strokePath();
    } else {
      g.fillStyle(color, 1).fillCircle(x, y, 4);
      g.fillStyle(0xffffff, 0.6).fillRect(x - 2, y - 3, 2, 1);
      g.lineStyle(1, color, 0.7).strokeCircle(x, y, 5.5);
    }
    if (pending.ready.delete(id)) {
      // Destello al quedar listo.
      this.tweens.killTweensOf(this.spellReadyFx);
      this.spellReadyFx.setTint(color).setAlpha(0.9).setScale(0.9);
      this.tweens.add({ targets: this.spellReadyFx, alpha: 0, scale: 0.45, duration: 450, ease: 'Sine.easeOut' });
    }

    const name = (def?.name ?? id).toUpperCase();
    if (this.spellName.text !== `Q ${name}`) this.spellName.setText(`Q ${name}`);
    const mastered = lvl >= MASTERY_MAX;
    const hex = def?.color ?? '#c8ffe0';
    this.spellName.setColor(cooling ? C.dim : mastered && Math.floor(this.t * 2) % 2 ? '#ffffff' : hex);

    // Maestría: 3 cuadritos.
    const d = this.spellDots;
    d.clear();
    const dx = L.x0 + this.spellName.width + 5;
    for (let i = 0; i < MASTERY_MAX; i++) {
      const px = dx + i * 6;
      d.fillStyle(C.back, 0.8).fillRect(px - 1, y - 3, 6, 6);
      d.fillStyle(i < lvl ? color : 0x2a3346, 1).fillRect(px, y - 2, 4, 4);
    }
    this.spellCd.setPosition(dx + MASTERY_MAX * 6 + 4, y).setText(cooling ? `${Math.ceil(cd.remaining / 1000)} s` : '');
  }

  /* ------------------------------ Ecos ------------------------------ */

  private pulseEcos(): void {
    this.tweens.add({ targets: this.ecoIcon, scale: { from: 1.8, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.ecoText, scale: { from: 1.2, to: 1 }, duration: 200 });
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
    g.fillStyle(0x000000, 0.3).fillRect(-w / 2 - 20, -26, w + 40, subtitle ? 54 : 40);
    g.lineStyle(1, 0xd8cca8, 0.8);
    g.lineBetween(-w / 2, 6, -14, 6).lineBetween(14, 6, w / 2, 6);
    g.fillStyle(0xd8cca8, 0.9).fillRect(-2, 4, 4, 4);
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
    const w = this.toastText.width + 18;
    const h = Math.max(18, this.toastText.height + 6); // avisos largos ocupan dos líneas
    this.toastBg.clear().fillStyle(0x0a0a14, 0.62).fillRoundedRect(-w / 2, -h / 2, w, h, 3);
    this.toastBg.fillStyle(0x5a8a7a, 0.9).fillRect(-w / 2 + 3, -h / 2, w - 6, 1);
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
    const h = this.promptText.height + 4;
    this.promptBg.clear().fillStyle(0x0a0a14, 0.65).fillRoundedRect(-w / 2, -h / 2, w, h, 3);
    this.promptBox.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.promptBox, alpha: 1, duration: 120 });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.t += dt;
    // La barra del jefe ocupa el mismo lugar que la caja de diálogo: se oculta mientras alguien habla.
    this.bossBox.setAlpha(this.scene.isActive('Dialogue') ? 0 : 1);
    // Mientras se ve la pantalla de carga, el nombre de zona y los avisos esperan.
    const enCarga = this.scene.isActive('Carga');
    if (pending.zone && !enCarga) {
      const z = pending.zone;
      pending.zone = null;
      this.showZone(z.title, z.subtitle);
    }
    this.updateVida(dt);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.4);
    this.gemGlow.setAlpha(0.25 + 0.25 * pulse);
    this.updateLaser();
    this.updateAbilities();
    this.updateSpell();
    this.updateEcos(dt);
    if (!enCarga) this.updateToast(dt);
    this.updateBoss(dt);
    this.updatePrompt();
  }
}
