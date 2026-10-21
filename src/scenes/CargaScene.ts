import Phaser from 'phaser';
import { sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { GAME_HEIGHT, GAME_WIDTH, isCatemaco, isCdmx, isCdmx2, isGdl, isOaxaca } from '../config/game';
import { conEscala, estiloTexto, TAM } from '../ui/fuente';
import consejosData from '../data/consejos.json';

/**
 * Pantalla de carga entre niveles (dueño: interfaz). Clave 'Carga'.
 *
 * La lanza LevelScene encima del nivel (ya pausado) cuando GameState.pendingLoadScreen está activo
 * (lo pone Campaign en cada prepare…Entry()). Muestra una imagen al azar de public/assets/ui/carga/,
 * el lugar al que vas y un consejo al azar de src/data/consejos.json. Se cierra con E / Espacio /
 * Enter / clic o sola a los ~5 s, y reanuda el nivel (y el diálogo de entrada, si lo había).
 */

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
/** Número de imágenes carga_01.jpg … carga_NN.jpg (640×360). */
const IMAGENES = 15;
/**
 * Sin spoilers: a partir de qué nivel de destino puede salir cada imagen (índice 0 = carga_01).
 * Las escenas de jefes y giros salen solo después de ese momento; la emboscada final (13, 15) y el
 * epílogo (14) nunca salen en la carga (99).
 */
const DESDE_NIVEL = [1, 1, 2, 2, 3, 4, 4, 4, 6, 7, 10, 10, 99, 99, 99];

/** Nivel de destino de la sección de entrada (para elegir imágenes sin spoilers). */
function nivelDe(section: string): number {
  if (section === 'tuxtla') return 2;
  if (isCatemaco(section)) return 3;
  if (isOaxaca(section)) return 4;
  if (isCdmx(section)) return 6;
  if (isCdmx2(section)) return 7;
  if (isGdl(section)) return 10;
  return 1;
}
/** Avanza sola tras este tiempo (ms). */
const AUTO_MS = 5200;
/** Ignora pulsaciones al inicio (la E que cerró el nivel anterior no debe saltarse la carga). */
const BLOQUEO_MS = 450;

const CONSEJOS: string[] = (consejosData as { consejos: string[] }).consejos;

/** Lugar de destino según la sección de entrada. */
function destino(section: string, nombre: string): { lugar: string; nivel: string } {
  if (section === 'tuxtla') return { lugar: 'San Andrés Tuxtla', nivel: 'Nivel 2 · La música perdida' };
  if (isCatemaco(section)) return { lugar: 'Catemaco', nivel: 'Nivel 3 · El ritual del lago' };
  if (isOaxaca(section)) return { lugar: 'Oaxaca', nivel: 'Nivel 4 · Los tejidos de la memoria' };
  if (isCdmx(section)) return { lugar: 'Ciudad de México', nivel: 'Nivel 6 · De Xochimilco a Reforma' };
  if (isCdmx2(section)) return { lugar: 'Ciudad de México', nivel: 'Nivel 7 · El Rey del Olvido' };
  if (isGdl(section)) return { lugar: 'Guadalajara', nivel: 'Nivel 10 · La trampa y el eclipse' };
  return { lugar: nombre || 'Xalapa', nivel: '' };
}

let ultimoConsejo = -1;
let ultimaImagen = -1;

/** Índice al azar distinto del anterior (si hay más de uno). */
function alAzar(n: number, previo: number): number {
  if (n <= 1) return 0;
  let i = Phaser.Math.Between(0, n - 1);
  if (i === previo) i = (i + 1 + Phaser.Math.Between(0, n - 2)) % n;
  return i;
}

export class CargaScene extends Phaser.Scene {
  private section = '';
  private nombre = '';
  private imagen = 1;
  private inicio = 0;
  private cerrando = false;
  private pausoDialogo = false;
  private barra!: Phaser.GameObjects.Graphics;
  private aviso!: Phaser.GameObjects.Text;

  constructor() {
    super('Carga');
  }

  init(data: { section?: string; nombre?: string }): void {
    this.section = data?.section ?? GameState.section;
    this.nombre = data?.nombre ?? '';
    const nivel = nivelDe(this.section);
    const permitidas = Array.from({ length: IMAGENES }, (_, i) => i).filter((i) => DESDE_NIVEL[i] <= nivel);
    const pos = alAzar(permitidas.length, permitidas.indexOf(ultimaImagen));
    ultimaImagen = permitidas[pos] ?? 0;
    this.imagen = ultimaImagen + 1;
    this.cerrando = false;
    this.pausoDialogo = false;
  }

  private get clave(): string {
    return `carga_${String(this.imagen).padStart(2, '0')}`;
  }

  preload(): void {
    // Solo la imagen elegida (≈100 KB): no se precargan las 15.
    if (!this.textures.exists(this.clave)) this.load.image(this.clave, `assets/ui/carga/${this.clave}.jpg`);
  }

  create(): void {
    this.inicio = this.time.now;
    // El nivel ya viene en pausa (LevelScene); el diálogo de entrada, si lo hay, también se detiene.
    if (this.scene.isActive('Level')) this.scene.pause('Level');
    if (this.scene.isActive('Dialogue')) {
      this.scene.pause('Dialogue');
      this.pausoDialogo = true;
    }
    this.scene.bringToTop();

    // Imagen a pantalla completa (cover) o, si no cargó, un fondo liso.
    this.add.rectangle(0, 0, W, H, 0x07060d).setOrigin(0);
    if (this.textures.exists(this.clave)) {
      const img = this.add.image(W / 2, H / 2, this.clave);
      const s = Math.max(W / img.width, H / img.height);
      img.setScale(s);
      // Paneo lento (Ken Burns) muy leve; sin él si se piden menos efectos.
      if (!GameState.settings.reduceFx) this.tweens.add({ targets: img, scale: s * 1.04, duration: AUTO_MS + 800, ease: 'Sine.easeOut' });
    }

    // Oscurecido: franja superior suave y degradado inferior en bandas (pixel art, sin degradados finos).
    const g = this.add.graphics();
    for (let i = 0; i < 8; i++) g.fillStyle(0x05060a, 0.5 - i * 0.06).fillRect(0, i * 6, W, 6);
    for (let i = 0; i < 16; i++) g.fillStyle(0x05060a, 0.06 + i * 0.055).fillRect(0, H - 150 + i * 6, W, 6);
    g.fillStyle(0x05060a, 0.92).fillRect(0, H - 54, W, 54);

    const escala = GameState.settings.textScale || 1;
    const { lugar, nivel } = destino(this.section, this.nombre);

    // Destino (arriba a la izquierda).
    this.add.text(16, 12, 'RUMBO A', estiloTexto(TAM.chico, '#8ff7e1')).setLetterSpacing(2);
    this.add.text(16, 25, lugar, { ...estiloTexto(TAM.cartel, '#fff2c8', { grosor: 4 }) });
    if (nivel) this.add.text(16, 51, nivel, estiloTexto(TAM.chico, '#c8d8c0'));

    // Consejo (abajo).
    ultimoConsejo = alAzar(CONSEJOS.length, ultimoConsejo);
    const consejo = CONSEJOS[ultimoConsejo] ?? '';
    const y0 = H - 92;
    this.add.text(16, y0, 'CONSEJO', estiloTexto(TAM.chico, '#f2c86b')).setLetterSpacing(2);
    g.fillStyle(0xf2c86b, 1).fillRect(16, y0 + 15, 22, 1);
    this.add.text(16, y0 + 22, consejo, {
      ...estiloTexto(conEscala(TAM.medio, escala), '#efe6d2'),
      wordWrap: { width: W - 32, useAdvancedWrap: true },
      lineSpacing: 2,
    });

    // Aviso para continuar y barra del tiempo restante.
    this.aviso = this.add.text(W - 16, H - 14, 'E / Espacio para continuar', estiloTexto(TAM.chico, '#8b8aa0')).setOrigin(1, 1);
    this.barra = this.add.graphics();

    // Entrada.
    const avanzar = () => this.cerrar();
    const kb = this.input.keyboard;
    kb?.on('keydown-E', avanzar);
    kb?.on('keydown-SPACE', avanzar);
    kb?.on('keydown-ENTER', avanzar);
    this.input.on('pointerdown', avanzar);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb?.off('keydown-E', avanzar);
      kb?.off('keydown-SPACE', avanzar);
      kb?.off('keydown-ENTER', avanzar);
      this.input.off('pointerdown', avanzar);
    });

    this.cameras.main.fadeIn(350, 0, 0, 0);
  }

  update(time: number): void {
    const t = time - this.inicio;
    const r = Phaser.Math.Clamp(t / AUTO_MS, 0, 1);
    this.barra.clear().fillStyle(0x3cc4b8, 0.8).fillRect(0, H - 2, Math.round(W * r), 2);
    this.aviso.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(t / 420)));
    if (t >= AUTO_MS) this.cerrar();
  }

  private cerrar(): void {
    if (this.cerrando || this.time.now - this.inicio < BLOQUEO_MS) return;
    this.cerrando = true;
    sfx('ui_aceptar');
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.scene.isPaused('Level')) this.scene.resume('Level');
      if (this.pausoDialogo && this.scene.isPaused('Dialogue')) this.scene.resume('Dialogue');
      this.scene.stop();
    });
  }
}
