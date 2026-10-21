import Phaser from 'phaser';
import { bus, sfx, type BusEvents } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH, DEPTH_TOLERANCE, GAME_HEIGHT, GAME_WIDTH } from '../config/game';
import { FUENTE, TAM, tamFuente } from '../ui/fuente';
import type { EnemyApi, LevelTrigger, SectionId, WorldApi } from '../core/contracts';
import * as Casting from './Casting';
import { installInteract, markUsed, type Interactable } from './Interact';
import { installLightTrail, setObjective } from './LightTrail';
import { playDialogue } from '../scenes/DialogueScene';
import { installTuxtlaDirector } from './TuxtlaDirector';
import { installCatemacoDirector } from './CatemacoDirector';
import { isCatemaco, isCdmx, isCdmx2, isGdl, isOaxaca } from '../config/game';
import { installCdmx2Director } from './Cdmx2Director';
import { installGdlDirector } from './GdlDirector';
import { installCdmxDirector } from './CdmxDirector';
import { installOaxacaDirector } from './OaxacaDirector';

/**
 * Dueño: contenido. Guion del Nivel 1 (AGENTS.md §5.2, NIVELES_ECOS.md §4):
 * taller (intro → pistola → tutorial → CALMA → rastro de luz) → calles (chaneques sueltos, letras XALAPA
 * + altar) → parque (2 arenas → nota de la madre → PROTECCION) → jefe (Chaneque Mayor → antena → busto
 * de Juárez y el Códice) → Ending.
 *
 * LevelScene se reinicia al cambiar de sección o morir, así que el Director se reinstala cada vez:
 * TODO el progreso vive en GameState.flags; lo que no se marcó como hecho (p. ej. una arena a medias)
 * vuelve a empezar.
 *
 * Actions de interactuables: examinar · recoger_laser · aprender_calma · salir · altar · nota_madre ·
 * antena · busto. Actions de triggers: dialogo · letras · arena · jefe · salir.
 */

const flag = (k: string) => !!GameState.flags[k];
const setFlag = (k: string) => {
  GameState.flags[k] = true;
};

/** Blanco de práctica del taller. */
const BLANCO = { x: 760, y: 288 };
/** Disparos rojos para romper la antena. */
const ANTENA_VIDA = 5;
/** Si no logra romperla a disparos, tras este tiempo se ofrece "Sobrecargar" con E. */
const ANTENA_RESPALDO_MS = 25000;

type Datos = Record<string, unknown> | undefined;
const str = (d: Datos, k: string) => (d && typeof d[k] === 'string' ? (d[k] as string) : undefined);
const num = (d: Datos, k: string) => (d && typeof d[k] === 'number' ? (d[k] as number) : undefined);

type CastingMod = { startLearning?: (w: WorldApi, id: string) => Promise<void> };

export function installDirector(world: WorldApi): void {
  if (world.level.id === 'tuxtla') {
    installTuxtlaDirector(world);
    return;
  }
  if (isCatemaco(world.level.id)) {
    installCatemacoDirector(world);
    return;
  }
  if (isOaxaca(world.level.id)) {
    installOaxacaDirector(world);
    return;
  }
  if (isCdmx(world.level.id)) {
    installCdmxDirector(world);
    return;
  }
  if (isCdmx2(world.level.id)) {
    installCdmx2Director(world);
    return;
  }
  if (isGdl(world.level.id)) {
    installGdlDirector(world);
    return;
  }
  new Director(world);
}

class Director {
  private vivo = true;
  private ocupado = false; // una secuencia con diálogo en curso
  private tutorialEnCurso = false;
  private arena: { group: string; total: number; quitados: Set<EnemyApi>; inicio: number; jefe: boolean } | null =
    null;
  private esperaBlanco: { mode: 'green' | 'red'; resolve: (ok: boolean) => void } | null = null;
  private blanco?: Phaser.GameObjects.Container;
  private antenaVida = ANTENA_VIDA;
  private calmadoEn = 0;
  private avisoSalida = 0;
  private avisoVerde = false;
  /** Texto del paso del tutorial en curso (para el objetivo del HUD). */
  private pasoTutorial: string | null = null;
  /** Objetivo actual (rastro de luz y flecha de borde de pantalla). */
  private objetivo: { x: number; y: number } | null = null;
  private objTxt: Phaser.GameObjects.Text;
  private flechaG: Phaser.GameObjects.Graphics;
  private flechaTxt: Phaser.GameObjects.Text;
  private puertaFx: { glow: Phaser.GameObjects.Graphics; cartel: Phaser.GameObjects.Container } | null = null;

  constructor(private w: WorldApi) {
    const scene = w.scene;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.vivo = false;
      this.esperaBlanco?.resolve(false);
      this.esperaBlanco = null;
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    });

    installInteract(w, { enabled: (it) => this.habilitado(it), prompt: (it) => this.textoAviso(it) });
    installLightTrail(w);

    // Objetivo en el HUD (misma posición y estilo que el contador de los otros niveles).
    this.objTxt = scene.add
      .text(12, 90, '', {
        fontFamily: FUENTE,
        fontSize: `${tamFuente(TAM.chico)}px`,
        color: '#fff0ce',
        backgroundColor: '#171521cc',
        padding: { x: 5, y: 4 },
        lineSpacing: 2,
        wordWrap: { width: 230 },
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setVisible(false);
    // Flecha en el borde de la pantalla cuando el objetivo queda fuera de la vista.
    this.flechaG = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.ui);
    this.flechaTxt = scene.add
      .text(0, 0, '', { fontFamily: FUENTE, fontSize: `${tamFuente(TAM.chico)}px`, color: '#c8fff2', stroke: '#0b0a14', strokeThickness: 3 })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setOrigin(0.5)
      .setVisible(false);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    bus.scoped(scene, 'trigger:enter', ({ trigger }) => void this.onTrigger(trigger));
    bus.scoped(scene, 'interact', (p) => void this.onInteract(p.id, p.action, p.data));
    bus.scoped(scene, 'player:shoot-request', (p) => this.onDisparo(p));
    bus.scoped(scene, 'enemy:removed', ({ enemy }) => this.onEnemigoFuera(enemy));
    bus.scoped(scene, 'enemy:purified', ({ enemy }) => this.onEnemigoFuera(enemy));
    bus.scoped(scene, 'boss:calmed', () => void this.jefeCalmado());
    bus.scoped(scene, 'enemy:exhausted', () => {
      if (flag('tip_agotado')) return;
      setFlag('tip_agotado');
      this.toast('Toca Q y deletrea CALMA: los chaneques cercanos se calman para siempre', 6000);
    });

    scene.time.addEvent({ delay: 400, loop: true, callback: () => this.revisarArena() });

    GameState.section = w.level.id;
    // Checkpoint intermedio al entrar a una sección nueva (las letras de XALAPA lo reemplazan en calles).
    if (!GameState.checkpoint || GameState.checkpoint.section !== w.level.id) {
      const cp = w.level.spawns?.checkpoint ?? w.level.spawns?.inicio ?? w.level.spawn;
      this.checkpoint(cp.x, cp.y);
    }

    // Esperar un instante: LevelScene lanza el HUD después de instalar los sistemas.
    scene.time.delayedCall(80, () => void this.entrar());
  }

  /* ============================== utilidades ============================== */

  private get scene(): Phaser.Scene {
    return this.w.scene;
  }

  private toast(text: string, ms = 4000): void {
    bus.emit('hud:toast', { text, ms });
  }

  private ecos(amount: number, x: number, y: number): void {
    bus.emit('ecos:gained', { amount, x, y });
  }

  private lock(on: boolean): void {
    if (this.w.player) this.w.player.controlsLocked = on;
  }

  private checkpoint(x: number, y: number): void {
    const section = this.w.level.id;
    GameState.checkpoint = { section, x, y };
    bus.emit('checkpoint', { section, x, y });
  }

  private esperarMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.vivo) return resolve();
      this.scene.time.delayedCall(ms, () => resolve());
      this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => resolve());
    });
  }

  /** Espera un evento del bus (con predicado y tiempo límite opcionales). true = llegó el evento. */
  private esperar<K extends keyof BusEvents>(k: K, pred: (p: BusEvents[K]) => boolean = () => true, ms = 0) {
    return new Promise<boolean>((resolve) => {
      let hecho = false;
      let timer: Phaser.Time.TimerEvent | undefined;
      const fn = (p: BusEvents[K]) => {
        if (pred(p)) fin(true);
      };
      const fin = (ok: boolean) => {
        if (hecho) return;
        hecho = true;
        bus.off(k, fn);
        timer?.remove();
        resolve(ok);
      };
      bus.on(k, fn);
      if (ms > 0) timer = this.scene.time.delayedCall(ms, () => fin(false));
      this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => fin(false));
    });
  }

  private async dialogo(id: string): Promise<void> {
    if (!this.vivo) return;
    await playDialogue(this.scene, id);
  }

  private interactable(id: string): Interactable | undefined {
    return this.w.level.interactables.find((i) => i.id === id);
  }

  /** Busca un prop por su id (LevelScene le pone setName(id)). */
  private prop(id: string): Phaser.GameObjects.GameObject | null {
    const visitar = (list: Phaser.GameObjects.GameObject[]): Phaser.GameObjects.GameObject | null => {
      for (const o of list) {
        if (o.name === id) return o;
        const hijos = (o as unknown as { list?: unknown }).list;
        if (Array.isArray(hijos)) {
          const r = visitar(hijos as Phaser.GameObjects.GameObject[]);
          if (r) return r;
        }
      }
      return null;
    };
    return visitar(this.scene.children.list);
  }

  private ocultarProp(id: string): void {
    const o = this.prop(id) as unknown as Phaser.GameObjects.Components.Visible | null;
    o?.setVisible(false);
  }

  /** Aprende un conjuro: explicación guiada del sistema de LSM (Casting) o respaldo si aún no existe. */
  private async aprender(id: string): Promise<void> {
    const mod = Casting as unknown as CastingMod;
    let guiado = false;
    if (typeof mod.startLearning === 'function') {
      try {
        await mod.startLearning(this.w, id);
        guiado = true;
      } catch (err) {
        console.warn('[Director] startLearning falló; uso el respaldo', err);
      }
    }
    if (!GameState.learnedSpells.includes(id)) {
      GameState.learnedSpells.push(id);
      if (!GameState.mastery[id]) GameState.mastery[id] = { level: 0, progress: 0 };
      bus.emit('spell:learned', { spellId: id });
      if (!guiado) {
        sfx('aprender');
        this.toast(`Aprendiste ${id}: toca Q para lanzarlo`, 4000);
      }
    }
    if (!GameState.selectedSpell) GameState.selectedSpell = id;
    const p = this.w.player;
    this.ecos(25, p.x, p.y - 30);
  }

  /* ============================== objetivo (rastro de luz) ============================== */

  private centroTrigger(pred: (t: LevelTrigger) => boolean): { x: number; y: number } | null {
    const t = this.w.level.triggers.find(pred);
    return t ? { x: t.x + t.w / 2, y: t.y + t.h * 0.55 } : null;
  }

  private posInteractable(id: string): { x: number; y: number } | null {
    const it = this.interactable(id);
    return it ? { x: it.x, y: it.y } : null;
  }

  private calcularObjetivo(): { x: number; y: number } | null {
    const salida = () => this.centroTrigger((t) => t.action === 'salir');
    const arena = (g: string) => this.centroTrigger((t) => (t.data as Datos)?.group === g);
    switch (this.w.level.id) {
      case 'taller':
        if (!GameState.hasLaser) return this.posInteractable('pistola');
        if (!flag('tutorial')) return BLANCO;
        if (!flag('calma')) return this.posInteractable('grabado');
        return this.posInteractable('puerta');
      case 'calles':
        if (!flag('altar')) return this.posInteractable('altar');
        return salida();
      case 'parque':
        if (!flag('arena_parque1')) return arena('parque1');
        if (!flag('arena_parque2')) return arena('parque2');
        if (!flag('proteccion')) return this.posInteractable('nota');
        return salida();
      case 'jefe':
        if (!flag('boss')) return { x: 1080, y: 290 };
        if (!flag('antena')) return this.posInteractable('antena');
        if (!flag('codice')) return this.posInteractable('busto');
        return null;
      default:
        return null;
    }
  }

  private actualizarObjetivo(): void {
    if (!this.vivo) return;
    const o = this.calcularObjetivo();
    this.objetivo = o;
    const payload = o ? { x: o.x, y: o.y, section: this.w.level.id as SectionId } : null;
    setObjective(payload);
    bus.emit('objective', payload);
    this.actualizarTextoObjetivo();
    this.actualizarPuerta();
  }

  /** Qué tiene que hacer el jugador ahora, en una línea (objetivo del HUD). */
  private textoObjetivo(): string | null {
    switch (this.w.level.id) {
      case 'taller':
        if (!flag('intro')) return null;
        if (!GameState.hasLaser) return 'Recoge la pistola láser de mamá, junto a la mesa (E)';
        if (!flag('tutorial')) return this.pasoTutorial ?? 'Práctica con el blanco del taller';
        if (!flag('calma')) return 'Lee el grabado de la pared (E)';
        return 'Sal del taller por la puerta de la derecha →';
      case 'calles':
        if (!flag('altar')) return 'Sigue el rastro de luz hasta las letras de XALAPA';
        return 'Sigue la calle hacia la derecha, al Parque Juárez →';
      case 'parque':
        if (!flag('arena_parque1') || !flag('arena_parque2')) return 'Calma a los chaneques del parque';
        if (!flag('proteccion')) return 'Sube a la terraza por las escaleras: la nota de mamá está junto al farol';
        return 'Sigue el camino del parque hacia la derecha →';
      case 'jefe':
        if (!flag('boss')) return 'Calma al Chaneque Mayor';
        if (!flag('antena')) return 'Rompe la antena con el láser ROJO (2)';
        if (!flag('codice')) return 'Ve al busto de Benito Juárez (E)';
        return null;
      default:
        return null;
    }
  }

  private actualizarTextoObjetivo(): void {
    if (!this.vivo) return;
    const t = this.textoObjetivo();
    this.objTxt.setText(t ? `OBJETIVO\n${t}` : '').setVisible(!!t);
  }

  /** Texto del aviso de E según el progreso (la puerta avisa si todavía no se puede salir). */
  private textoAviso(it: Interactable): string | undefined {
    if (it.action === 'salir') {
      const req = str(it.data as Datos, 'requiere');
      if (req && !flag(req)) return `${it.prompt} (aún no)`;
    }
    return undefined;
  }

  /** Por qué todavía no se puede salir (en el taller, el paso concreto que falta). */
  private motivoSalida(d: Datos): string {
    if (this.w.level.id === 'taller') {
      if (!GameState.hasLaser) return 'Antes de salir, recoge la pistola láser de mamá (está junto a la mesa).';
      if (!flag('tutorial')) return 'Antes de salir, termina la práctica con el blanco del taller.';
      if (!flag('calma')) return 'Antes de salir, lee el grabado de la pared (E): la gema te lo pide.';
    }
    return str(d, 'aviso') ?? 'Todavía no.';
  }

  /** Cada cuadro: flecha de borde de pantalla hacia el objetivo cuando queda fuera de la vista. */
  private onUpdate(): void {
    if (!this.vivo) return;
    const g = this.flechaG;
    g.clear();
    const o = this.objetivo;
    const p = this.w.player;
    const ocupado = !p || p.controlsLocked || this.scene.scene.isActive('Dialogue');
    if (!o || ocupado) {
      this.flechaTxt.setVisible(false);
      return;
    }
    const cam = this.scene.cameras.main;
    const sx = o.x - cam.scrollX;
    const fuera = sx < 0 ? -1 : sx > GAME_WIDTH ? 1 : 0;
    if (!fuera) {
      this.flechaTxt.setVisible(false);
      return;
    }
    const t = this.scene.time.now / 1000;
    const bote = Math.sin(t * 6) * 3;
    const x = fuera > 0 ? GAME_WIDTH - 14 + bote : 14 - bote;
    const y = Phaser.Math.Clamp(o.y - cam.scrollY - 30, 120, GAME_HEIGHT - 90);
    g.fillStyle(0x0b0a14, 0.6).fillCircle(x - fuera * 2, y, 11);
    g.fillStyle(0x8ff7e1, 0.95).fillTriangle(x + fuera * 8, y, x - fuera * 5, y - 8, x - fuera * 5, y + 8);
    const salida = this.w.level.id === 'taller' && flag('calma');
    this.flechaTxt
      .setText(salida ? 'Salida' : 'Objetivo')
      .setPosition(fuera > 0 ? GAME_WIDTH - 40 : 40, y + 18)
      .setVisible(true);
  }

  /**
   * Puerta del taller: cartel de SALIDA siempre visible (apagado mientras no se puede salir) y,
   * cuando ya se puede, la puerta se ilumina con la luz de la gema y una flecha que rebota.
   */
  private crearPuerta(): void {
    if (this.w.level.id !== 'taller' || this.puertaFx) return;
    const it = this.interactable('puerta');
    const prop = this.prop('puerta') as unknown as Phaser.GameObjects.Sprite | null;
    const x = prop?.x ?? it?.x ?? 1210;
    const pie = prop?.y ?? (it ? it.y - 14 : 208);
    const alto = prop ? prop.displayHeight : 80;
    const ancho = prop ? prop.displayWidth : 40;
    // Encima de la puerta (depth pie + 0.5) con mezcla aditiva: la puerta "se enciende".
    const glow = this.scene.add.graphics().setDepth(pie + 0.5).setBlendMode(Phaser.BlendModes.ADD);
    glow.fillStyle(0xffd27a, 0.3).fillRect(x - ancho / 2 - 8, pie - alto - 8, ancho + 16, alto + 8);
    glow.fillStyle(0xffe9a8, 0.35).fillRect(x - ancho / 2 + 3, pie - alto + 3, ancho - 6, alto - 3);
    glow.lineStyle(2, 0xffe9a8, 0.9).strokeRect(x - ancho / 2 - 1, pie - alto - 1, ancho + 2, alto + 1);
    glow.fillStyle(0xffd27a, 0.35).fillEllipse(x, pie + 6, ancho + 56, 18);
    glow.fillStyle(0xffd27a, 0.16).fillTriangle(x - ancho / 2, pie, x + ancho / 2, pie, x - 36, pie + 50);
    const fondo = this.scene.add.graphics();
    const texto = this.scene.add
      .text(0, 0, 'SALIDA', { fontFamily: FUENTE, fontSize: `${tamFuente(TAM.chico)}px`, color: '#ffe9a8', fontStyle: 'bold' })
      .setOrigin(0.5);
    const w = texto.width + 10;
    fondo.fillStyle(0x1a120c, 0.95).fillRect(-w / 2, -8, w, 16);
    fondo.lineStyle(1, 0xf2c14e, 1).strokeRect(-w / 2 + 0.5, -7.5, w - 1, 15);
    const flecha = this.scene.add.graphics();
    flecha.fillStyle(0xf2c14e, 1).fillTriangle(-6, 12, 6, 12, 0, 20);
    // Por encima del aviso de E de la puerta (que flota justo sobre el marco).
    const cartel = this.scene.add.container(x, pie - alto - 40, [fondo, texto, flecha]).setDepth(pie + 1);
    this.scene.tweens.add({ targets: flecha, y: 4, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: glow, alpha: { from: 0.65, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
    this.puertaFx = { glow, cartel };
    this.actualizarPuerta();
  }

  private actualizarPuerta(): void {
    const fx = this.puertaFx;
    if (!fx) return;
    const abierta = flag('calma');
    fx.glow.setVisible(abierta);
    fx.cartel.setAlpha(abierta ? 1 : 0.55);
    const t = fx.cartel.list[1] as Phaser.GameObjects.Text | undefined;
    t?.setColor(abierta ? '#ffe9a8' : '#b8ac98');
  }

  /* ============================== interactuables ============================== */

  private habilitado(it: Interactable): boolean {
    switch (it.action) {
      case 'recoger_laser':
        return !GameState.hasLaser;
      case 'aprender_calma':
        return GameState.hasLaser && flag('tutorial') && !flag('calma');
      case 'nota_madre':
        return !flag('proteccion');
      case 'antena':
        // Respaldo por si no logra romperla a disparos.
        return (
          flag('boss') && !flag('antena') && (this.calmadoEn === 0 || this.scene.time.now - this.calmadoEn > ANTENA_RESPALDO_MS)
        );
      case 'busto':
        return flag('antena') && !flag('codice');
      default:
        return true;
    }
  }

  private async onInteract(id: string, action: string, data: Datos): Promise<void> {
    if (!this.vivo || this.ocupado) return;
    const it = this.interactable(id);
    this.ocupado = true;
    try {
      switch (action) {
        case 'examinar':
          await this.examinar(id, data, it);
          break;
        case 'recoger_laser':
          await this.recogerLaser(id);
          break;
        case 'aprender_calma':
          await this.aprenderCalma(id);
          break;
        case 'salir':
          this.salir(data);
          break;
        case 'altar':
          await this.altar(it);
          break;
        case 'nota_madre':
          await this.notaMadre(id);
          break;
        case 'antena':
          await this.destruirAntena();
          break;
        case 'busto':
          await this.busto(id);
          break;
        default:
          console.warn(`[Director] action desconocida: ${action}`);
      }
    } finally {
      this.ocupado = false;
    }
  }

  private async examinar(id: string, data: Datos, it?: Interactable): Promise<void> {
    const d = str(data, 'dialogue');
    if (d) await this.dialogo(d);
    if (!this.vivo) return;
    const premio = num(data, 'ecos');
    const clave = `eco:${this.w.level.id}:${id}`;
    if (premio && !flag(clave)) {
      setFlag(clave);
      this.ecos(premio, it?.x ?? this.w.player.x, (it?.y ?? this.w.player.y) - 30);
    }
  }

  /* ============================== secciones ============================== */

  private async entrar(): Promise<void> {
    if (!this.vivo) return;
    switch (this.w.level.id) {
      case 'taller':
        await this.entrarTaller();
        break;
      case 'calles':
        await this.entrarCalles();
        break;
      case 'parque':
        await this.entrarParque();
        break;
      case 'jefe':
        this.entrarJefe();
        break;
    }
    this.actualizarObjetivo();
  }

  /* ------------------------------ taller ------------------------------ */

  private async entrarTaller(): Promise<void> {
    this.crearBlanco();
    this.crearPuerta();
    if (GameState.hasLaser) this.ocultarProp('pistola');
    if (!flag('intro')) {
      this.lock(true);
      await this.esperarMs(900);
      await this.dialogo('taller_intro');
      if (!this.vivo) return;
      setFlag('intro');
      this.lock(false);
      this.actualizarTextoObjetivo();
      this.toast('WASD: moverte (W/S hacia el fondo y el frente) · E: interactuar', 6000);
    } else if (GameState.hasLaser && !flag('tutorial')) {
      void this.tutorial();
    }
  }

  private async recogerLaser(id: string): Promise<void> {
    if (GameState.hasLaser) return;
    GameState.hasLaser = true;
    GameState.laserMode = 'green';
    markUsed(this.w, id);
    this.ocultarProp('pistola');
    sfx('mejora');
    this.w.flash(0x8ff7e1, 160);
    await this.dialogo('taller_pistola');
    if (!this.vivo) return;
    this.toast('Pistola láser: clic izquierdo o X para disparar · 1 verde · 2 rojo', 5000);
    this.actualizarObjetivo();
    void this.tutorial();
  }

  private async tutorial(): Promise<void> {
    if (this.tutorialEnCurso || flag('tutorial')) return;
    this.tutorialEnCurso = true;
    await this.esperarMs(1200);
    const pasos: Array<{ flag: string; texto: string; esperar: () => Promise<boolean> }> = [
      {
        flag: 'tut_salto',
        texto: 'Espacio: saltar. Mantenlo para saltar más alto',
        esperar: () => this.esperar('player:jump', undefined, 15000),
      },
      {
        flag: 'tut_esquiva',
        texto: 'Mantén Shift para correr · Doble Shift o C: esquivar (un instante invulnerable)',
        esperar: () => this.esperar('player:dodge', undefined, 18000),
      },
      {
        flag: 'tut_verde',
        texto: '1: láser VERDE, aturde. Ponte a la altura del blanco y dispara (clic izquierdo o X)',
        esperar: () => this.esperarBlanco('green', 35000),
      },
      {
        flag: 'tut_rojo',
        texto: '2: láser ROJO, daña. Si disparas sin parar se sobrecalienta',
        esperar: () => this.esperarBlanco('red', 35000),
      },
    ];
    for (const p of pasos) {
      if (flag(p.flag)) continue;
      this.toast(p.texto, 8000);
      this.pasoTutorial = `Práctica: ${p.texto}`;
      this.actualizarTextoObjetivo();
      const ok = await p.esperar();
      if (!this.vivo) return;
      setFlag(p.flag);
      if (ok) {
        sfx('letra_ok');
        this.toast('¡Bien!', 1200);
      }
      await this.esperarMs(1000);
      if (!this.vivo) return;
    }
    setFlag('tutorial');
    this.tutorialEnCurso = false;
    this.pasoTutorial = null;
    this.actualizarTextoObjetivo();
    this.ocupado = true;
    await this.dialogo('taller_tutorial_fin');
    this.ocupado = false;
    if (!this.vivo) return;
    this.toast('Examina el grabado de la pared (E)', 5000);
    this.actualizarObjetivo();
  }

  private async aprenderCalma(id: string): Promise<void> {
    if (flag('calma')) return;
    this.lock(true);
    await this.dialogo('taller_grabado');
    if (!this.vivo) return;
    this.lock(false);
    await this.aprender('CALMA');
    if (!this.vivo) return;
    setFlag('calma');
    markUsed(this.w, id);
    this.lock(true);
    this.w.flash(0x8ff7e1, 400);
    setFlag('gema');
    this.actualizarObjetivo();
    await this.dialogo('taller_gema');
    if (!this.vivo) return;
    this.lock(false);
    this.toast('Sal del taller por la puerta iluminada de la derecha (E). La gema te marca el camino', 7000);
  }

  /** Blanco de práctica dibujado (no es un enemigo: el Director detecta los disparos). */
  private crearBlanco(): void {
    if (this.w.level.id !== 'taller') return;
    const c = this.scene.add.container(BLANCO.x, BLANCO.y).setDepth(BLANCO.y);
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.3).fillEllipse(0, 0, 26, 8);
    g.fillStyle(0x5a3b26, 1).fillRect(-2, -26, 4, 26); // poste
    g.fillStyle(0x7a5236, 1).fillRect(-12, -46, 24, 24); // tabla
    g.fillStyle(0xe8d9b0, 1).fillCircle(0, -34, 10);
    g.fillStyle(0xe0457b, 1).fillCircle(0, -34, 7);
    g.fillStyle(0xe8d9b0, 1).fillCircle(0, -34, 4);
    g.fillStyle(0xe0457b, 1).fillCircle(0, -34, 2);
    c.add(g);
    this.blanco = c;
  }

  private esperarBlanco(mode: 'green' | 'red', ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t = this.scene.time.delayedCall(ms, () => {
        if (this.esperaBlanco?.resolve === fin) this.esperaBlanco = null;
        resolve(false);
      });
      const fin = (ok: boolean) => {
        t.remove();
        resolve(ok);
      };
      this.esperaBlanco = { mode, resolve: fin };
    });
  }

  /** ¿Un disparo desde (x, y) hacia `facing` alcanza el punto (tx, ty)? Devuelve la distancia o -1. */
  private alcanza(p: BusEvents['player:shoot-request'], tx: number, ty: number, tolY: number, max: number): number {
    if (Math.abs(p.y - ty) > tolY) return -1;
    const dx = (tx - p.x) * p.facing;
    return dx > -6 && dx < max ? Math.max(0, dx) : -1;
  }

  private onDisparo(p: BusEvents['player:shoot-request']): void {
    if (!GameState.hasLaser || GameState.laserOverheated) return;
    const mode = GameState.laserMode;

    // Blanco de práctica.
    if (this.blanco) {
      const d = this.alcanza(p, BLANCO.x, BLANCO.y, DEPTH_TOLERANCE + 4, 560);
      if (d >= 0) this.scene.time.delayedCall(40 + d * 1.6, () => this.golpeBlanco(mode));
    }

    // Antena, después de calmar al jefe.
    if (this.w.level.id === 'jefe' && flag('boss') && !flag('antena')) {
      const a = this.posInteractable('antena') ?? { x: 1400, y: 240 };
      const d = this.alcanza(p, a.x, a.y - 8, 26, 520);
      if (d < 0) return;
      if (mode !== 'red') {
        if (!this.avisoVerde) {
          this.avisoVerde = true;
          this.toast('El verde no le hace nada. Cambia al láser rojo (2)', 3500);
        }
        return;
      }
      this.scene.time.delayedCall(40 + d * 1.6, () => void this.golpeAntena());
    }
  }

  private golpeBlanco(mode: 'green' | 'red'): void {
    if (!this.vivo || !this.blanco) return;
    sfx('impacto');
    const b = this.blanco;
    this.scene.tweens.add({ targets: b, angle: { from: mode === 'red' ? -8 : -4, to: 0 }, duration: 260, ease: 'Back.easeOut' });
    const txt = this.scene.add
      .text(BLANCO.x, BLANCO.y - 56, mode === 'green' ? '¡Aturdido!' : '¡Impacto!', {
        fontFamily: FUENTE,
        fontSize: '11px',
        color: mode === 'green' ? '#7dff9a' : '#ff6b5a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(BLANCO.y + 1);
    this.scene.tweens.add({ targets: txt, y: txt.y - 14, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
    const e = this.esperaBlanco;
    if (e && e.mode === mode) {
      this.esperaBlanco = null;
      e.resolve(true);
    }
  }

  /* ------------------------------ calles ------------------------------ */

  private async entrarCalles(): Promise<void> {
    if (flag('in_calles')) return;
    setFlag('in_calles');
    this.lock(true);
    await this.esperarMs(700);
    await this.dialogo('calles_inicio');
    if (!this.vivo) return;
    this.lock(false);
    this.toast('Sigue el rastro de luz hacia el Parque Juárez', 4000);
  }

  private async altar(it?: Interactable): Promise<void> {
    if (!flag('altar_intro')) {
      setFlag('altar_intro');
      await this.dialogo('altar_intro');
      if (!this.vivo) return;
    }
    const x = it?.x ?? this.w.player.x;
    const y = it?.y ?? this.w.player.y;
    GameState.hp = GameState.maxHp;
    const sp = this.w.level.spawns?.altar ?? { x, y: y + 30 };
    this.checkpoint(sp.x, sp.y);
    setFlag('altar');
    sfx('altar');
    // Sin destello aquí: la escena se pausa enseguida y el destello quedaría congelado detrás del menú.
    this.actualizarObjetivo();
    const sm = this.scene.scene;
    sm.launch('Altar', { section: this.w.level.id, x, y });
    sm.bringToTop('Altar');
    sm.pause();
  }

  /* ------------------------------ parque ------------------------------ */

  private async entrarParque(): Promise<void> {
    if (flag('in_parque')) return;
    setFlag('in_parque');
    this.toast('Las terrazas se suben por las escaleras', 4000);
  }

  private async notaMadre(id: string): Promise<void> {
    if (flag('proteccion')) return;
    this.lock(true);
    await this.dialogo('nota_madre');
    if (!this.vivo) return;
    this.lock(false);
    await this.aprender('PROTECCION');
    if (!this.vivo) return;
    setFlag('proteccion');
    markUsed(this.w, id);
    this.ocultarProp('nota');
    this.actualizarObjetivo();
    this.toast('Mantén Q para abrir la rueda y elegir entre CALMA y PROTECCION', 6000);
  }

  /* ------------------------------ arenas ------------------------------ */

  private iniciarArena(group: string, x0: number, x1: number, jefe: boolean): void {
    if (this.arena || flag(`arena_${group}`)) return;
    const total = this.w.level.enemies.filter((e) => e.group === group).length;
    this.arena = { group, total, quitados: new Set(), inicio: this.scene.time.now, jefe };
    this.w.lockArena(x0, x1);
    bus.emit('arena:start', { group });
    sfx('chaneque_risa');
    if (!jefe) {
      bus.emit('music', { track: 'n01_combate' });
      this.toast('¡Chaneques alterados! Cánsalos con el láser y purifícalos con un conjuro (Q)', 5000);
    }
  }

  private onEnemigoFuera(enemy: EnemyApi): void {
    // Solo cuenta si de verdad salió del mundo (purificado/retirado), no al destruirse la escena.
    if (!this.vivo || !enemy.purified) return;
    if (enemy.kind === 'chaneque_mayor' && this.w.level.id === 'jefe') {
      void this.jefeCalmado();
      return;
    }
    const a = this.arena;
    if (!a || enemy.group !== a.group) return;
    a.quitados.add(enemy);
    this.revisarArena();
  }

  private revisarArena(): void {
    const a = this.arena;
    if (!a || !this.vivo) return;
    const t = this.scene.time.now - a.inicio;
    if (t < 1500) return;
    const vivos = this.w.enemies.filter((e) => e.group === a.group && e.alive && !e.purified);
    if (a.jefe) {
      // Respaldo: si el jefe ya no está (o nunca apareció), se da por calmado.
      if (!flag('boss') && t > 4000 && !vivos.some((e) => e.kind === 'chaneque_mayor')) void this.jefeCalmado();
      return;
    }
    if (vivos.length === 0 || (a.total > 0 && a.quitados.size >= a.total)) void this.limpiarArena();
  }

  private async limpiarArena(): Promise<void> {
    const a = this.arena;
    if (!a) return;
    this.arena = null;
    setFlag(`arena_${a.group}`);
    this.w.unlockArena();
    bus.emit('arena:clear', { group: a.group });
    bus.emit('music', { track: this.w.level.music ?? 'n01_exploracion' });
    sfx('conjuro_ok');
    this.toast('La calma vuelve al parque', 2500);
    this.actualizarObjetivo();
    if (a.group === 'parque2') {
      await this.esperarMs(900);
      if (!this.vivo || this.ocupado) return;
      this.ocupado = true;
      await this.dialogo('arena_parque2_fin');
      this.ocupado = false;
    }
  }

  /* ------------------------------ jefe ------------------------------ */

  private entrarJefe(): void {
    if (flag('antena')) this.romperAntenaVisual(false);
    if (flag('boss') && !flag('antena')) this.calmadoEn = 0; // tras reaparecer: respaldo inmediato
  }

  private async iniciarJefe(data: Datos): Promise<void> {
    if (flag('boss') || this.arena || this.ocupado) return;
    this.ocupado = true;
    if (!flag('d_jefe_intro')) {
      this.lock(true);
      await this.dialogo('jefe_intro');
      if (!this.vivo) return;
      setFlag('d_jefe_intro');
      this.lock(false);
    }
    this.ocupado = false;
    // CALMA es el conjuro efectivo contra el Chaneque Mayor (NIVELES_ECOS §3).
    if (GameState.learnedSpells.includes('CALMA')) GameState.selectedSpell = 'CALMA';
    const group = str(data, 'group') ?? 'jefe';
    this.iniciarArena(group, num(data, 'x0') ?? 0, num(data, 'x1') ?? this.w.level.width, true);
    this.toast('Atúrdelo con el láser verde o espera a que falle su salto. Entonces: CALMA (Q)', 7000);
  }

  private async jefeCalmado(): Promise<void> {
    if (!this.vivo || flag('boss') || this.w.level.id !== 'jefe') return;
    setFlag('boss');
    this.calmadoEn = this.scene.time.now;
    this.actualizarObjetivo();
    await this.esperarMs(1200);
    if (!this.vivo) return;
    this.ocupado = true;
    await this.dialogo('jefe_calmado');
    this.ocupado = false;
    if (!this.vivo) return;
    this.toast('Rompe la antena con el láser ROJO (2)', 6000);
  }

  private async golpeAntena(): Promise<void> {
    if (!this.vivo || flag('antena')) return;
    this.antenaVida--;
    sfx('impacto');
    this.w.shake(0.004, 120);
    const o = this.prop('antena') as unknown as Phaser.GameObjects.Image | null;
    if (o && 'setTint' in o) {
      o.setTint(0xff6b5a);
      this.scene.time.delayedCall(90, () => o.active && o.clearTint());
    }
    if (this.antenaVida <= 0) await this.destruirAntena();
  }

  private romperAntenaVisual(fx: boolean): void {
    const o = this.prop('antena') as unknown as Phaser.GameObjects.Sprite | null;
    if (o) {
      o.anims?.stop?.();
      if (this.scene.textures.exists('prop_antena_rota')) o.setTexture('prop_antena_rota');
      else {
        o.setTint(0x55505e);
        o.setAngle(-6);
      }
    }
    if (!fx) return;
    const a = this.posInteractable('antena') ?? { x: 1400, y: 240 };
    for (let i = 0; i < 18; i++) {
      const chispa = this.scene.add.rectangle(a.x, a.y - 60 - Math.random() * 60, 2, 2, i % 2 ? 0xf2c14e : 0x8ff7e1);
      chispa.setDepth(a.y + 2);
      this.scene.tweens.add({
        targets: chispa,
        x: a.x + Phaser.Math.Between(-60, 60),
        y: chispa.y + Phaser.Math.Between(-30, 50),
        alpha: 0,
        duration: Phaser.Math.Between(400, 900),
        onComplete: () => chispa.destroy(),
      });
    }
  }

  private async destruirAntena(): Promise<void> {
    if (flag('antena') || !flag('boss')) return;
    setFlag('antena');
    this.romperAntenaVisual(true);
    this.w.shake(0.012, 500);
    this.w.flash(0xffffff, 220);
    sfx('antena_rota');
    bus.emit('antenna:destroyed', {});
    const a = this.posInteractable('antena') ?? { x: 1400, y: 240 };
    this.ecos(20, a.x, a.y - 60);
    this.arena = null;
    setFlag('arena_jefe');
    this.w.unlockArena();
    bus.emit('arena:clear', { group: 'jefe' });
    bus.emit('music', { track: 'n01_exploracion' });
    this.actualizarObjetivo();
    await this.esperarMs(900);
    if (!this.vivo) return;
    this.lock(true);
    await this.dialogo('antena_rota');
    if (!this.vivo) return;
    this.lock(false);
    this.toast('Ve al busto de Benito Juárez', 4000);
  }

  private async busto(id: string): Promise<void> {
    if (flag('codice')) return;
    this.lock(true);
    await this.dialogo('codice');
    if (!this.vivo) return;
    setFlag('codice');
    markUsed(this.w, id);
    sfx('aprender');
    const p = this.w.player;
    this.ecos(20, p.x, p.y - 30);
    setObjective(null);
    bus.emit('objective', null);
    await this.esperarMs(900);
    if (!this.vivo) return;
    const scene = this.scene;
    scene.cameras.main.fadeOut(1200, 0, 0, 0);
    await this.esperarMs(1300);
    if (!this.vivo) return;
    const sm = scene.scene;
    for (const k of ['Hud', 'Dialogue', 'Spell', 'Altar', 'Diario', 'Pause']) {
      if (sm.isActive(k) || sm.isPaused(k)) sm.stop(k);
    }
    bus.emit('music', { track: null });
    sm.start('Ending');
  }

  /* ============================== triggers ============================== */

  private async onTrigger(t: LevelTrigger): Promise<void> {
    if (!this.vivo) return;
    const d = t.data as Datos;
    switch (t.action) {
      case 'dialogo': {
        const f = str(d, 'flag') ?? `trg:${t.id}`;
        const id = str(d, 'dialogue');
        if (!id || flag(f) || this.ocupado) return;
        setFlag(f);
        this.ocupado = true;
        await this.dialogo(id);
        this.ocupado = false;
        return;
      }
      case 'letras': {
        bus.emit('zone:name', { title: str(d, 'title') ?? 'XALAPA', subtitle: str(d, 'subtitle') });
        if (!flag('letras')) {
          setFlag('letras');
          sfx('altar');
          const sp = this.w.level.spawns?.altar;
          if (sp) this.checkpoint(sp.x, sp.y);
          this.toast('Punto de control: las letras de XALAPA', 3000);
        }
        return;
      }
      case 'arena': {
        const g = str(d, 'group');
        if (!g) return;
        this.iniciarArena(g, num(d, 'x0') ?? 0, num(d, 'x1') ?? this.w.level.width, false);
        return;
      }
      case 'jefe':
        await this.iniciarJefe(d);
        return;
      case 'salir':
        this.salir(d);
        return;
      default:
        console.warn(`[Director] trigger con action desconocida: ${t.action}`);
    }
  }

  private salir(d: Datos): void {
    const req = str(d, 'requiere');
    if (req && !flag(req)) {
      if (this.scene.time.now - this.avisoSalida > 2500) {
        this.avisoSalida = this.scene.time.now;
        this.toast(this.motivoSalida(d), 4000);
      }
      return;
    }
    const section = str(d, 'section') as SectionId | undefined;
    if (!section) return;
    sfx('ui_aceptar');
    this.w.gotoSection(section, str(d, 'spawn'));
  }
}
