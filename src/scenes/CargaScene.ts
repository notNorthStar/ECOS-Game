import Phaser from 'phaser';
import { sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { GAME_HEIGHT, GAME_WIDTH, isCatemaco, isCdmx, isCdmx2, isGdl, isOaxaca } from '../config/game';
import { mostrarCapaCarga, type CapaCarga } from '../ui/cargaOverlay';
import consejosData from '../data/consejos.json';

/**
 * Pantalla de carga entre niveles (dueño: interfaz). Clave 'Carga'.
 *
 * La lanza LevelScene encima del nivel (ya pausado) cuando GameState.pendingLoadScreen está activo
 * (lo pone Campaign en cada prepare…Entry()). Muestra una de las 15 ilustraciones al azar (cualquiera,
 * aunque adelante escenas: lo pidió el equipo; solo no repite la inmediata anterior), el lugar al que
 * vas y un consejo al azar de src/data/consejos.json. Se cierra con E / Espacio / Enter / clic o sola
 * a los ~5 s, y reanuda el nivel (y el diálogo de entrada, si lo había).
 *
 * La imagen y los textos van en una capa HTML encima del canvas (src/ui/cargaOverlay.ts) para verse a
 * calidad completa y sin efectos: los originales están en public/assets/ui/carga/hd/ (hasta 1920 px).
 * Las versiones de 640×360 (carga_NN.jpg) solo se dibujan en el lienzo si la HD no carga.
 */

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
/** Número de imágenes: hd/carga_01.jpg … hd/carga_NN.jpg (y su respaldo carga_NN.jpg de 640×360). */
const IMAGENES = 15;
/** Avanza sola tras este tiempo (ms). */
const AUTO_MS = 5200;
/** Ignora pulsaciones al inicio (la E que cerró el nivel anterior no debe saltarse la carga). */
const BLOQUEO_MS = 450;
/** Fundidos de entrada y salida (ms). */
const FUNDIDO_ENTRADA = 350;
const FUNDIDO_SALIDA = 300;

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
  private capa: CapaCarga | null = null;

  constructor() {
    super('Carga');
  }

  init(data: { section?: string; nombre?: string }): void {
    this.section = data?.section ?? GameState.section;
    this.nombre = data?.nombre ?? '';
    // Cualquiera de las 15, sin filtro por nivel; solo evita repetir la de la carga anterior.
    ultimaImagen = alAzar(IMAGENES, ultimaImagen);
    this.imagen = ultimaImagen + 1;
    this.cerrando = false;
    this.pausoDialogo = false;
  }

  private get clave(): string {
    return `carga_${String(this.imagen).padStart(2, '0')}`;
  }

  preload(): void {
    // Respaldo de 640×360 de la imagen elegida (≈100 KB): solo se dibuja si la HD no carga.
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

    // Fondo liso; la ilustración en alta calidad va en la capa HTML (sin oscurecidos ni efectos).
    this.add.rectangle(0, 0, W, H, 0x07060d).setOrigin(0);

    const { lugar, nivel } = destino(this.section, this.nombre);
    ultimoConsejo = alAzar(CONSEJOS.length, ultimoConsejo);
    this.capa = mostrarCapaCarga(this, {
      src: `assets/ui/carga/hd/${this.clave}.jpg`,
      lugar,
      nivel,
      consejo: CONSEJOS[ultimoConsejo] ?? '',
      escalaTexto: GameState.settings.textScale || 1,
      fundidoMs: FUNDIDO_ENTRADA,
      alFallar: () => this.dibujarRespaldo(),
    });
    if (!this.capa) this.dibujarRespaldo();

    // Entrada (la capa HTML no captura el ratón: todo llega a Phaser).
    const avanzar = () => this.cerrar();
    const kb = this.input.keyboard;
    kb?.on('keydown-E', avanzar);
    kb?.on('keydown-SPACE', avanzar);
    kb?.on('keydown-ENTER', avanzar);
    this.input.on('pointerdown', avanzar);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // La capa se quita siempre al detenerse la escena (continuar, volver al título, reinicio…).
      this.capa?.quitar();
      this.capa = null;
      kb?.off('keydown-E', avanzar);
      kb?.off('keydown-SPACE', avanzar);
      kb?.off('keydown-ENTER', avanzar);
      this.input.off('pointerdown', avanzar);
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.capa?.quitar());

    this.cameras.main.fadeIn(FUNDIDO_ENTRADA, 0, 0, 0);
  }

  /** Respaldo dentro del lienzo (640×360) si la capa HTML o su imagen no están disponibles. */
  private dibujarRespaldo(): void {
    if (!this.sys.isActive() || !this.textures.exists(this.clave)) return;
    const img = this.add.image(W / 2, H / 2, this.clave);
    img.setScale(Math.max(W / img.width, H / img.height));
    // Encima del fondo liso (índice 1), por debajo de todo lo demás.
    this.children.moveTo(img, 1);
  }

  update(time: number): void {
    // Si el nivel de debajo desapareció (vuelta al título, reinicio…), la carga se va con él (y su capa HTML).
    if (!this.scene.isActive('Level') && !this.scene.isPaused('Level')) {
      this.scene.stop();
      return;
    }
    const t = time - this.inicio;
    const r = Phaser.Math.Clamp(t / AUTO_MS, 0, 1);
    this.capa?.actualizar(r, 0.55 + 0.45 * Math.abs(Math.sin(t / 420)));
    if (t >= AUTO_MS) this.cerrar();
  }

  private cerrar(): void {
    if (this.cerrando || this.time.now - this.inicio < BLOQUEO_MS) return;
    this.cerrando = true;
    sfx('ui_aceptar');
    this.capa?.fundirSalida(FUNDIDO_SALIDA);
    this.cameras.main.fadeOut(FUNDIDO_SALIDA, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.scene.isPaused('Level')) this.scene.resume('Level');
      if (this.pausoDialogo && this.scene.isPaused('Dialogue')) this.scene.resume('Dialogue');
      this.scene.stop();
    });
  }
}
