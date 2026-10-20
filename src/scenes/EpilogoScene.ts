import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { keys } from '../config/controls';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { getSpellDef } from '../systems/Mastery';

/**
 * Dueño: sistemas (Nivel 10). EPÍLOGO "Las páginas en blanco" (NDD_v2 §3), después de quebrar el núcleo de
 * Itzpapálotl:
 *  1) pantallas de texto del epílogo sobre el arte del taller (E / Espacio / Enter / clic avanzan);
 *  2) la cita final;
 *  3) créditos con desplazamiento (src/data/creditos.json, que crea contenido; si aún no existe, un respaldo
 *     mínimo). E / Espacio los aceleran; al terminar (o con otro toque al final) sigue;
 *  4) resumen (Ecos totales, conjuros aprendidos, fragmentos 6/6) → vuelve al título.
 * Fondos: `epilogo_taller` y `epilogo_codice` si los cargó el escenario; si no, fondos procedurales cálidos.
 * Se arranca con startEpilogo(escena), que cierra Hud y las capas como Pausa → Salir al título.
 */

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

/** Cierra Hud, Spell, Dialogue, Altar, Diario y Level (como PauseScene.quitToTitle) y arranca el epílogo. */
export function startEpilogo(scene: Phaser.Scene): void {
  const sm = scene.scene;
  bus.emit('game:pause', { paused: false });
  GameState.bound = false;
  GameState.casting = false;
  keys.locked = false;
  keys.clear();
  for (const k of ['Spell', 'Dialogue', 'Altar', 'Diario', 'Pause', 'Hud', 'Ending', 'Level']) {
    if (k === sm.key) continue; // la escena que llama se detiene con start()
    if (sm.isActive(k) || sm.isPaused(k) || sm.isSleeping(k)) sm.stop(k);
  }
  sm.start('Epilogo');
}

/* ------------------------------ créditos ------------------------------ */

const CREDITOS = import.meta.glob('../data/creditos.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** Línea de créditos: encabezado (dorado, más grande), texto normal o separación. */
interface Linea {
  text: string;
  kind: 'titulo' | 'texto' | 'espacio';
}

/** Respaldo con el mismo formato que creditos.json (titulo, estudio, evento, equipo, secciones, cierre). */
const RESPALDO_CREDITOS: unknown = {
  titulo: 'ECOS',
  estudio: 'Listick Games',
  evento: 'Game Jam ANIEI 2026 · Cultura, identidad y patrimonio',
  secciones: [
    {
      titulo: 'Música',
      lineas: [
        'Arreglos originales sobre música tradicional mexicana de dominio público',
        'Son jarocho · "La Llorona" (tradicional) · son jalisciense',
      ],
    },
    { titulo: 'Lengua de Señas Mexicana', lineas: ['Deletreo dactilológico de la LSM', 'Gracias a la comunidad sorda de México'] },
    { titulo: 'Herramientas', lineas: ['Phaser · TypeScript · Vite · MediaPipe', 'Uso de IA declarado en AI_LOG.md'] },
  ],
  cierre: 'Gracias por jugar.',
};

/**
 * Formato acordado con contenido (data/creditos.json): titulo, estudio, evento, equipo[{rol, nombre}],
 * secciones[{titulo, lineas[]}], cierre. Devuelve null si el JSON no tiene esa forma (se usa el lector genérico).
 */
function lineasFormato(data: unknown): Linea[] | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.secciones) && !Array.isArray(o.equipo)) return null;
  const out: Linea[] = [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  if (str(o.titulo)) out.push({ text: String(o.titulo), kind: 'titulo' });
  for (const k of ['estudio', 'evento']) if (str(o[k])) out.push({ text: String(o[k]), kind: 'texto' });
  if (Array.isArray(o.equipo) && o.equipo.length) {
    out.push({ text: '', kind: 'espacio' }, { text: 'Equipo', kind: 'titulo' });
    for (const m of o.equipo as Array<Record<string, unknown>>) {
      const rol = str(m?.rol);
      const nombre = str(m?.nombre);
      if (rol || nombre) out.push({ text: rol && nombre ? `${rol} — ${nombre}` : (rol ?? nombre)!, kind: 'texto' });
    }
  }
  for (const sec of (Array.isArray(o.secciones) ? o.secciones : []) as Array<Record<string, unknown>>) {
    out.push({ text: '', kind: 'espacio' });
    if (str(sec?.titulo)) out.push({ text: String(sec.titulo), kind: 'titulo' });
    const ls = Array.isArray(sec?.lineas) ? sec.lineas : [];
    for (const l of ls) if (str(l)) out.push({ text: String(l), kind: 'texto' });
  }
  return out;
}

/** Frase de cierre de los créditos (creditos.json → cierre). */
function cierreCreditos(): string {
  const data = Object.values(CREDITOS)[0] as Record<string, unknown> | undefined;
  const c = data && typeof data === 'object' ? data.cierre : null;
  return typeof c === 'string' && c.trim() ? c : 'Gracias por jugar';
}

const TITLE_KEYS = ['titulo', 'title', 'seccion', 'section', 'nombre', 'name', 'rol', 'role'];

/** Convierte cualquier forma razonable de creditos.json en líneas (no conocemos el formato exacto de contenido). */
function lineasDeCreditos(data: unknown): Linea[] {
  const out: Linea[] = [];
  const push = (text: string, kind: Linea['kind']) => {
    if (kind === 'espacio' && (!out.length || out[out.length - 1].kind === 'espacio')) return;
    out.push({ text, kind });
  };
  const walk = (v: unknown, depth: number): void => {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number') {
      push(String(v), 'texto');
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, depth));
      return;
    }
    if (typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    // { rol, nombre } → "rol — nombre"
    const rol = o.rol ?? o.role;
    const nombre = o.nombre ?? o.name ?? o.autor ?? o.author;
    if (typeof rol === 'string' && typeof nombre === 'string' && Object.keys(o).length <= 4) {
      push(`${rol} — ${nombre}`, 'texto');
      const extra = o.licencia ?? o.license ?? o.detalle ?? o.nota;
      if (typeof extra === 'string') push(extra, 'texto');
      return;
    }
    const tk = TITLE_KEYS.find((k) => typeof o[k] === 'string');
    if (tk) {
      push('', 'espacio');
      push(String(o[tk]), depth <= 1 ? 'titulo' : 'texto');
    }
    for (const [k, val] of Object.entries(o)) {
      if (k === tk || k === 'note' || k === 'nota_tecnica' || k.startsWith('_')) continue;
      if (typeof val === 'string' && !tk && depth > 0) {
        push(`${k}: ${val}`, 'texto');
        continue;
      }
      walk(val, depth + 1);
    }
  };
  walk(data, 0);
  while (out.length && out[out.length - 1].kind === 'espacio') out.pop();
  return out;
}

function creditos(): Linea[] {
  const data = Object.values(CREDITOS)[0];
  const lineas = data ? (lineasFormato(data) ?? lineasDeCreditos(data)) : [];
  return lineas.length ? lineas : (lineasFormato(RESPALDO_CREDITOS) ?? []);
}

/* ------------------------------ textos (NDD_v2 §3) ------------------------------ */

type Fondo = 'amanecer' | 'taller' | 'codice';

const PANTALLAS: Array<{ fondo: Fondo; texto: string }> = [
  {
    fondo: 'amanecer',
    texto: 'Con Itzpapálotl derrotada y la Cofradía del Espejo Negro desintegrada, el Sol recupera su brillo sobre Guadalajara y el resto de México.',
  },
  {
    fondo: 'amanecer',
    texto: 'Libres del control oscuro, los espíritus descansan y las comunidades comienzan a recordar sus canciones e historias.',
  },
  {
    fondo: 'taller',
    texto: 'Regresas con tu madre y con Balam, de vuelta en su forma de pequeño gato alebrije, a su taller en Xalapa junto con el Códice restaurado.',
  },
  {
    fondo: 'codice',
    texto: 'Al abrirlo, notan que muchas páginas recuperaron su tinta, pero quedan espacios completamente en blanco…',
  },
  {
    fondo: 'codice',
    texto: '…páginas listas para ser escritas por las comunidades sobrevivientes y las nuevas generaciones que reconstruirán el país.',
  },
];

const CITA = '«La memoria de un pueblo vive en quienes la comparten.»';

const FONT = 'monospace';
const ts = (px: number) => `${Math.round(px * (GameState.settings.textScale || 1))}px`;

/* ------------------------------ escena ------------------------------ */

type Fase = 'titulo' | 'texto' | 'cita' | 'creditos' | 'resumen' | 'salir';

export class EpilogoScene extends Phaser.Scene {
  private fase: Fase = 'titulo';
  private idx = 0;
  private listoEn = 0;
  private fondoActual: Fondo | null = null;
  private capaFondo!: Phaser.GameObjects.Container;
  private capaTexto!: Phaser.GameObjects.Container;
  private rollo: Phaser.GameObjects.Container | null = null;
  private rolloFin = 0;
  private rapido = false;
  private ayuda!: Phaser.GameObjects.Text;

  constructor() {
    super('Epilogo');
  }

  create(): void {
    keys.locked = false;
    keys.clear();
    GameState.bound = false;
    GameState.balamJaguar = false;
    GameState.flags['n10:completo'] = true;
    this.fase = 'titulo';
    this.idx = 0;
    this.fondoActual = null;
    this.rollo = null;
    this.rapido = false;
    this.cameras.main.setBackgroundColor('#07060d');
    bus.emit('music', { track: 'n10_epilogo' });

    this.capaFondo = this.add.container(0, 0);
    this.capaTexto = this.add.container(0, 0).setDepth(10);
    this.ayuda = this.add
      .text(W - 12, H - 14, 'E / Espacio', { fontFamily: FONT, fontSize: '8px', color: '#8b8aa0' })
      .setOrigin(1, 0)
      .setDepth(20)
      .setAlpha(0);

    this.mostrarTitulo();

    const avanzar = () => this.avanzar();
    const soltar = () => (this.rapido = false);
    this.input.keyboard?.on('keydown-E', avanzar);
    this.input.keyboard?.on('keydown-SPACE', avanzar);
    this.input.keyboard?.on('keydown-ENTER', avanzar);
    this.input.keyboard?.on('keyup-E', soltar);
    this.input.keyboard?.on('keyup-SPACE', soltar);
    this.input.on('pointerdown', avanzar);
    this.input.on('pointerup', soltar);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown-E', avanzar);
      this.input.keyboard?.off('keydown-SPACE', avanzar);
      this.input.keyboard?.off('keydown-ENTER', avanzar);
      this.input.keyboard?.off('keyup-E', soltar);
      this.input.keyboard?.off('keyup-SPACE', soltar);
      this.input.off('pointerdown', avanzar);
      this.input.off('pointerup', soltar);
    });
  }

  update(_t: number, delta: number): void {
    if (this.fase !== 'creditos' || !this.rollo) return;
    const vel = this.rapido ? 120 : 22; // px/s
    this.rollo.y -= vel * (delta / 1000);
    if (this.rollo.y <= this.rolloFin) {
      this.rollo.y = this.rolloFin;
      this.irResumen();
    }
  }

  /* ------------------------------ fondos ------------------------------ */

  private ponerFondo(f: Fondo): void {
    if (this.fondoActual === f) return;
    this.fondoActual = f;
    const viejo = this.capaFondo.list.slice();
    const nuevo = this.add.container(0, 0).setAlpha(0);
    this.capaFondo.add(nuevo);
    if (f === 'taller' && this.textures.exists('epilogo_taller')) nuevo.add(this.add.image(W / 2, H / 2, 'epilogo_taller').setDisplaySize(W, H));
    else if (f === 'codice' && this.textures.exists('epilogo_codice')) nuevo.add(this.add.image(W / 2, H / 2, 'epilogo_codice').setDisplaySize(W, H));
    else if (f === 'codice' && this.textures.exists('epilogo_taller')) {
      nuevo.add(this.add.image(W / 2, H / 2, 'epilogo_taller').setDisplaySize(W, H));
      nuevo.add(this.dibujarCodice(true));
    } else if (f === 'taller') nuevo.add(this.dibujarTaller());
    else if (f === 'codice') {
      nuevo.add(this.dibujarTaller());
      nuevo.add(this.dibujarCodice(true));
    } else nuevo.add(this.dibujarAmanecer());
    if (f === 'codice') sfx('codice_abre');
    this.tweens.add({
      targets: nuevo,
      alpha: 1,
      duration: 900,
      onComplete: () => viejo.forEach((o) => o.destroy()),
    });
  }

  /** Amanecer cálido sobre la ciudad: el sol regresa. */
  private dibujarAmanecer(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillGradientStyle(0x2b3a6a, 0x2b3a6a, 0xf0a060, 0xf0a060, 1).fillRect(0, 0, W, 230);
    g.fillStyle(0xffe0a0, 0.5).fillCircle(W / 2, 176, 40);
    g.fillStyle(0xffe0a0, 1).fillCircle(W / 2, 176, 30);
    g.fillStyle(0xfff2c8, 1).fillCircle(W / 2, 176, 23);
    // Siluetas de la ciudad y de las torres de la Catedral.
    g.fillStyle(0x3a2a3a, 1);
    for (let x = 0; x < W; x += 38) g.fillRect(x, 200 + ((x * 7) % 26), 30, 60);
    g.fillRect(290, 150, 14, 90).fillRect(336, 150, 14, 90);
    g.fillTriangle(286, 150, 297, 118, 308, 150).fillTriangle(332, 150, 343, 118, 354, 150);
    g.fillRect(300, 180, 40, 60);
    g.fillStyle(0x24202c, 1).fillRect(0, 236, W, H - 236);
    c.add(g);
    // Rayos que respiran.
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i + 0.5) * (Math.PI / 7);
      const r = this.add
        .rectangle(W / 2, 176, 260, 3, 0xfff2c8, 0.12)
        .setOrigin(0, 0.5)
        .setRotation(a)
        .setBlendMode(Phaser.BlendModes.ADD);
      c.add(r);
      if (!GameState.settings.reduceFx) this.tweens.add({ targets: r, alpha: 0.03, duration: 1600 + i * 170, yoyo: true, repeat: -1 });
    }
    return c;
  }

  /** Taller de Xalapa de día (respaldo si el escenario no generó epilogo_taller). */
  private dibujarTaller(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0x5a3e30, 1).fillRect(0, 0, W, H); // pared de madera cálida
    g.fillStyle(0x6a4a38, 1);
    for (let x = 0; x < W; x += 40) g.fillRect(x, 0, 2, 250);
    // Ventana con la niebla verde de Xalapa y luz de día.
    g.fillStyle(0xcfe8d8, 1).fillRect(400, 40, 150, 110);
    g.fillStyle(0x8fbfa0, 1).fillRect(400, 110, 150, 40);
    g.lineStyle(4, 0x3a2820, 1).strokeRect(400, 40, 150, 110).lineBetween(475, 40, 475, 150).lineBetween(400, 95, 550, 95);
    // Haz de luz.
    g.fillStyle(0xfff2c8, 0.12).fillTriangle(400, 150, 550, 150, 300, 330);
    // Estantes con herramientas y circuitos.
    g.fillStyle(0x3a2820, 1).fillRect(40, 70, 200, 6).fillRect(40, 130, 200, 6);
    const cosas = [0x7fe0d0, 0xe0457b, 0xf2c14e, 0x8ff7e1, 0xc89878];
    for (let i = 0; i < 9; i++) g.fillStyle(cosas[i % cosas.length], 1).fillRect(50 + i * 21, 52 + (i % 3) * 4, 12, 18 - (i % 3) * 4);
    for (let i = 0; i < 7; i++) g.fillStyle(cosas[(i + 2) % cosas.length], 1).fillRect(56 + i * 26, 116, 14, 14);
    // Mesa de trabajo.
    g.fillStyle(0x3a2820, 1).fillRect(0, 250, W, 110);
    g.fillStyle(0x7a5640, 1).fillRect(0, 244, W, 10);
    c.add(g);
    // Motas de polvo en la luz.
    if (!GameState.settings.reduceFx) {
      for (let i = 0; i < 18; i++) {
        const m = this.add.rectangle(330 + Math.random() * 200, 150 + Math.random() * 150, 1, 1, 0xfff2c8, 0.7);
        c.add(m);
        this.tweens.add({ targets: m, y: m.y - 20, alpha: 0.1, duration: 2500 + Math.random() * 2000, yoyo: true, repeat: -1 });
      }
    }
    return c;
  }

  /** El Códice abierto: páginas con tinta y páginas en blanco. */
  private dibujarCodice(sobreMesa: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(W / 2, sobreMesa ? 200 : H / 2);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillEllipse(0, 70, 300, 24);
    g.fillStyle(0x6a3a28, 1).fillRect(-140, -70, 280, 140); // tapas
    g.fillStyle(0xf0e4c8, 1).fillRect(-132, -64, 128, 128).fillRect(4, -64, 128, 128); // páginas
    g.fillStyle(0xd8c8a8, 1).fillRect(-4, -64, 8, 128); // lomo
    // Página izquierda: glifos y tinta recuperada (teal, rosa, dorado).
    const tintas = [0x2a8a70, 0xe0457b, 0xb08020, 0x3a2a4a];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 7; col++) {
        if ((row * 7 + col) % 5 === 3) continue;
        g.fillStyle(tintas[(row + col) % tintas.length], 0.85).fillRect(-124 + col * 16, -56 + row * 13, 10, 7);
      }
    }
    // Página derecha: unas pocas líneas arriba y el resto EN BLANCO.
    g.fillStyle(0x3a2a4a, 0.8);
    for (let row = 0; row < 2; row++) g.fillRect(14, -56 + row * 13, 100 - row * 30, 5);
    c.add(g);
    // La gema del Códice brilla.
    const gema = this.add.circle(0, -74, 5, 0x50e0b0, 1);
    const brillo = this.add.circle(0, -74, 12, 0x8ff7e1, 0.3).setBlendMode(Phaser.BlendModes.ADD);
    c.add([brillo, gema]);
    if (!GameState.settings.reduceFx) this.tweens.add({ targets: brillo, scale: 1.6, alpha: 0.1, duration: 1200, yoyo: true, repeat: -1 });
    return c;
  }

  /* ------------------------------ fases ------------------------------ */

  private limpiarTexto(): void {
    this.capaTexto.removeAll(true);
  }

  private mostrarTitulo(): void {
    this.cameras.main.fadeIn(1200, 0, 0, 0);
    this.ponerFondo('amanecer');
    const t1 = this.add.text(W / 2, 64, 'Epílogo', { fontFamily: FONT, fontSize: ts(11), color: '#f2c14e' }).setOrigin(0.5);
    const t2 = this.add
      .text(W / 2, 90, 'Las páginas en blanco', { fontFamily: FONT, fontSize: ts(20), color: '#fff2c8', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(1, 1, '#3a2a3a', 0, false, true);
    this.capaTexto.add([t1, t2]);
    t1.setAlpha(0);
    t2.setAlpha(0);
    this.tweens.add({ targets: [t1, t2], alpha: 1, duration: 1400, delay: 600 });
    this.listoEn = this.time.now + 900;
    this.time.delayedCall(1800, () => this.ayuda.setAlpha(1));
  }

  private mostrarPantalla(i: number): void {
    const p = PANTALLAS[i];
    this.ponerFondo(p.fondo);
    this.limpiarTexto();
    const caja = this.add.graphics();
    caja.fillStyle(0x07060d, 0.72).fillRect(0, H - 74, W, 74);
    caja.fillStyle(0xf2c14e, 1).fillRect(0, H - 74, W, 1);
    const texto = this.add.text(24, H - 62, p.texto, {
      fontFamily: FONT,
      fontSize: ts(11),
      color: '#efe6d2',
      wordWrap: { width: W - 48, useAdvancedWrap: true },
      lineSpacing: 3,
    });
    texto.setAlpha(0);
    this.tweens.add({ targets: texto, alpha: 1, duration: 600 });
    this.capaTexto.add([caja, texto]);
    this.listoEn = this.time.now + 500;
  }

  private mostrarCita(): void {
    this.fase = 'cita';
    this.limpiarTexto();
    const velo = this.add.rectangle(0, 0, W, H, 0x07060d, 0.6).setOrigin(0);
    const cita = this.add
      .text(W / 2, H / 2 - 8, CITA, {
        fontFamily: FONT,
        fontSize: ts(13),
        color: '#fff2c8',
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: W - 80, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const firma = this.add.text(W / 2, H / 2 + 26, 'ECOS', { fontFamily: FONT, fontSize: ts(10), color: '#8ff7e1' }).setOrigin(0.5);
    for (const o of [velo, cita, firma]) o.setAlpha(0);
    this.capaTexto.add([velo, cita, firma]);
    this.tweens.add({ targets: velo, alpha: 1, duration: 900 });
    this.tweens.add({ targets: [cita, firma], alpha: 1, duration: 1600, delay: 500 });
    this.listoEn = this.time.now + 1500;
  }

  private mostrarCreditos(): void {
    this.fase = 'creditos';
    this.limpiarTexto();
    this.ayuda.setText('Mantén E / Espacio para acelerar');
    const velo = this.add.rectangle(0, 0, W, H, 0x07060d, 0.93).setOrigin(0);
    this.capaTexto.add(velo);
    const rollo = this.add.container(0, H + 10);
    let y = 0;
    const lineas = creditos();
    for (const l of lineas) {
      if (l.kind === 'espacio') {
        y += 14;
        continue;
      }
      const t = this.add
        .text(W / 2, y, l.text, {
          fontFamily: FONT,
          fontSize: ts(l.kind === 'titulo' ? 12 : 9),
          color: l.kind === 'titulo' ? '#f2c14e' : '#efe6d2',
          fontStyle: l.kind === 'titulo' ? 'bold' : 'normal',
          align: 'center',
          wordWrap: { width: W - 120, useAdvancedWrap: true },
        })
        .setOrigin(0.5, 0);
      rollo.add(t);
      y += t.height + (l.kind === 'titulo' ? 6 : 3);
    }
    y += 30;
    rollo.add(this.add.text(W / 2, y, cierreCreditos(), { fontFamily: FONT, fontSize: ts(12), color: '#e0457b' }).setOrigin(0.5, 0));
    y += 20;
    this.capaTexto.add(rollo);
    this.rollo = rollo;
    // Termina cuando "Gracias por jugar" queda a media pantalla.
    this.rolloFin = H / 2 - y;
    this.listoEn = this.time.now + 400;
  }

  private irResumen(): void {
    if (this.fase === 'resumen' || this.fase === 'salir') return;
    this.fase = 'resumen';
    this.rollo = null;
    this.rapido = false;
    this.ayuda.setText('E / Espacio: volver al título');
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.time.delayedCall(550, () => {
      this.limpiarTexto();
      this.cameras.main.fadeIn(700, 0, 0, 0);
      const ecos = Math.max(GameState.totalEcosEarned || 0, GameState.ecos || 0);
      const nombres = GameState.learnedSpells.map((id) => getSpellDef(id)?.title ?? id);
      // Se llega al final con el Sello completo (los 6 fragmentos, Nivel 7).
      const lineas = [
        'Nivel 10 · Guadalajara: la trampa y el eclipse final',
        '',
        `Ecos totales: ${ecos}`,
        `Conjuros aprendidos: ${nombres.length}`,
        nombres.join(' · ') || '—',
        'Fragmentos del Sello: 6 / 6',
      ];
      const velo = this.add.rectangle(0, 0, W, H, 0x07060d, 0.75).setOrigin(0);
      const titulo = this.add.text(W / 2, 40, 'ECOS', { fontFamily: FONT, fontSize: '28px', color: '#8ff7e1', fontStyle: 'bold' }).setOrigin(0.5, 0);
      const cuerpo = this.add
        .text(W / 2, 96, lineas.join('\n'), {
          fontFamily: FONT,
          fontSize: ts(10),
          color: '#efe6d2',
          align: 'center',
          lineSpacing: 5,
          wordWrap: { width: W - 80, useAdvancedWrap: true },
        })
        .setOrigin(0.5, 0);
      const cita = this.add.text(W / 2, H - 58, CITA, { fontFamily: FONT, fontSize: ts(9), color: '#f2c14e', fontStyle: 'italic' }).setOrigin(0.5, 0);
      this.capaTexto.add([velo, titulo, cuerpo, cita]);
      this.listoEn = this.time.now + 900;
      sfx('aprender');
    });
  }

  private avanzar(): void {
    if (this.fase === 'creditos') {
      // Mantener acelera; un toque cuando ya terminó pasa al resumen.
      this.rapido = true;
      if (this.time.now >= this.listoEn && this.rollo && this.rollo.y <= this.rolloFin + 1) this.irResumen();
      return;
    }
    if (this.time.now < this.listoEn) return;
    sfx('ui_aceptar');
    if (this.fase === 'titulo') {
      this.fase = 'texto';
      this.idx = 0;
      this.mostrarPantalla(0);
    } else if (this.fase === 'texto') {
      this.idx++;
      if (this.idx < PANTALLAS.length) this.mostrarPantalla(this.idx);
      else this.mostrarCita();
    } else if (this.fase === 'cita') {
      this.mostrarCreditos();
    } else if (this.fase === 'resumen') {
      this.fase = 'salir';
      bus.emit('music', { track: null });
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.time.delayedCall(650, () => this.scene.start('Title'));
    }
  }
}
