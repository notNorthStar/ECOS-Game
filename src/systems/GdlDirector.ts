import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import type { EnemyApi, LevelTrigger, SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { DEPTH } from '../config/game';
import { playDialogue } from '../scenes/DialogueScene';
import { getSpellDef, startLearning } from './Casting';
import * as CastingMod from './Casting';
import { installInteract, type Interactable } from './Interact';
import { installLightTrail, setObjective } from './LightTrail';
import { addEcos } from './Progression';
import * as BalamMod from './BalamJaguar';
import * as MadreMod from './Madre';
import * as SceneryMod from '../world/GdlScenery';
import * as EpilogoMod from '../scenes/EpilogoScene';
import config from '../data/gdl.json';
import { prepareGdlEntry } from './Campaign';

import { FUENTE, tamFuente } from '../ui/fuente';
/**
 * Director del Nivel 10 · Guadalajara, el final (dueño: contenido). Secciones: gdl_avenida → catedral → catedral_eclipse.
 * Mismo patrón que Cdmx2Director (Nivel 7): el progreso vive en GameState.flags con prefijo `n10:` y sobrevive a la
 * muerte; las secuencias se serializan con run()/exec() y congelan el mundo.
 *
 * - gdl_avenida: intro, `eclipse:progress` 0→0.6 según el avance, 3 encuentros tipo arena (triggers `encuentro`), altar,
 *   punto de control y puerta a la Catedral (exige haber despejado los 3 encuentros).
 * - gdl_avenida: además, momias y el minijefe Don Ernesto (4.º encuentro, antes de la puerta; con diálogo de presentación).
 * - catedral: oleada final en 3 tandas (arena fija, con momias) → minijefe Vampiro (grupo `vampiro`) → aparece la madre; el
 *   trigger del altar mayor lanza la emboscada (diálogos, Códice robado, techo abierto) → gotoSection('catedral_eclipse').
 * - final extendido: al `boss:calmed` el jugador RECUPERA el control (sin enemigos); un rastro de luz lo lleva a la madre;
 *   cerca aparece "Liberar a mamá (E)" (action `n10_liberar`) → freeMadre() + conversación (n10_reencuentro*) → epílogo.
 * - catedral_eclipse: atado (`GameState.bound`) → LUZ → MEMORIA → aprender ECOS → ECOS (un fallo repite ese paso sin
 *   castigo) → Balam jaguar → Fase 1 (3 Tzitzimime, 1 → 2, con oleada menor) → el capullo estalla → Fase 2 (Itzpapálotl:
 *   MAMA abre la ventana, ECOS golpea el núcleo) → `boss:calmed` → final → epílogo.
 *
 * Actions de interactuables: n10_examinar · altar. Actions de triggers: letras · dialogo · punto · encuentro · ir_seccion ·
 * emboscada.
 *
 * APIs de otros agentes (se llaman con guarda por si aún no existen): Casting.castSpellNow, BalamJaguar.awakenJaguar /
 * calmJaguar, Madre.placeMadre / wakeMadre / freeMadre, GdlScenery.openCathedralRoof, escena 'Epilogo' (registrada en main.ts).
 */

const flag = (key: string) => !!GameState.flags[`n10:${key}`];
const remember = (key: string) => { GameState.flags[`n10:${key}`] = true; };

type Pt = { x: number; y: number };
type Encuentro = {
  id: string; nombre: string; grupo: string; x0: number; x1: number; aviso?: string; dialogo?: string;
  /** Minijefe (Don Ernesto): paga `rewards.minijefe`. */
  jefe?: boolean;
  /** Diálogo de presentación, antes de bloquear la arena. */
  intro?: string;
  respaldoMs?: number;
};
type VampiroCfg = {
  grupo: string; nombre: string; intro: string; fin: string; aviso?: string; respaldoMs: number; minMs: number; pausaMs: number;
};
type LiberarCfg = {
  dialogos: string[]; aviso: string; rompeMaxMs: number; acercaMs: number; pasoX: number; gestoMs: number; calmarEn: number; pausaMs: number;
};
type Tanda = { id: string; nombre: string; grupo: string; fin?: string };
type Paso = { id: string; tipo: 'aprender' | 'lanzar'; conjuro: string; intro?: string; ok?: string; repite?: string };
type PasoF1 = { id: string; grupo: string; tzitzimime: number; dialogo?: string; aviso?: string };
type Activo = { grupo: string; start: number; seen: boolean };
type CastingExtra = { castSpellNow?: (world: WorldApi, spellId: string) => Promise<SpellOutcomeEvent> };
type BalamExtra = {
  awakenJaguar?: (world: WorldApi, x: number, y: number) => Promise<void> | void;
  calmJaguar?: () => void;
};
type MadreExtra = {
  placeMadre?: (world: WorldApi, x: number, y: number) => void;
  wakeMadre?: () => void;
  freeMadre?: () => Promise<void> | void;
  /** Versión extendida: libre y de pie, camina y hace señas sin paralizar a nadie. */
  madreApproach?: (x: number, ms?: number) => Promise<void>;
  madreGesture?: (ms?: number) => Promise<void>;
};
type SceneryExtra = { openCathedralRoof?: (ms: number) => void };
type EpilogoExtra = { startEpilogo?: (scene: Phaser.Scene) => void };
type Fase = 'ninguna' | 'cadena' | 'f1' | 'capullo' | 'f2' | 'fin' | 'liberar';

const ENCUENTROS = config.avenida.encuentros as unknown as Encuentro[];
const TANDAS = config.catedral.tandas as unknown as Tanda[];
const PASOS = config.final.pasos as unknown as Paso[];
const PASOS_F1 = config.final.fase1.pasos as unknown as PasoF1[];
const AVISOS = config.avisos as Record<string, string>;
const VAMPIRO = config.catedral.vampiro as unknown as VampiroCfg;
const LIBERAR = config.final.liberar as unknown as LiberarCfg;

const TITULOS: Record<string, { title: string; subtitle: string }> = {
  gdl_avenida: { title: 'GUADALAJARA', subtitle: 'Bajo el eclipse' },
  catedral: { title: 'CATEDRAL METROPOLITANA', subtitle: 'La oleada final' },
  catedral_eclipse: { title: 'EL GRAN ECLIPSE', subtitle: 'Tzitzimime e Itzpapálotl' },
};

/** Instala el director de la sección actual de Guadalajara. */
export function installGdlDirector(world: WorldApi): void {
  new GdlDirector(world);
}

class GdlDirector {
  private alive = true;
  private ready = false;
  private busy = false;
  private leaving = false;
  private saved = { locked: false, scale: 1 };
  private queue: Promise<void> = Promise.resolve();
  private lastSignature = '';
  private lastHint = -99999;
  private counter: Phaser.GameObjects.Text;
  // avenida
  private enc: (Activo & { def: Encuentro; pendiente?: boolean }) | null = null;
  private maxX = 0;
  private lastEclipse = -1;
  // catedral
  private tanda: (Activo & { index: number }) | null = null;
  private gapLeft = 0;
  private oleadaOn = false;
  private vamp: (Activo & { pendiente: boolean }) | null = null;
  private emboscadaOn = false;
  /** Emboscada encolada desde tickCatedral (aún no empieza): evita encolarla dos veces. */
  private emboscadaPend = false;
  // catedral_eclipse
  private fase: Fase = 'ninguna';
  private chainTries = 0;
  private chainRunning = false;
  private f1: (Activo & { index: number }) | null = null;
  private f1Start = false;
  private capulloOn = false;
  private hatched = false;
  private f2Start = 0;
  private f2Seen = false;
  private coreSeen = false;
  private coreEarly = false;
  private recuerdoRunning = false;
  private coreHits = 0;
  private staggerOn = false;
  private finaleRunning = false;
  private liberando = false;
  private lastMama = 0;

  constructor(private world: WorldApi) {
    const scene = world.scene;
    this.counter = scene.add.text(config.hud.x, config.hud.y, '', {
      fontFamily: FUENTE, fontSize: `${tamFuente(config.hud.fontSize)}px`,
      color: '#fff0ce', backgroundColor: '#171521cc', padding: { x: 5, y: 4 },
      lineSpacing: 3,
    }).setScrollFactor(0).setDepth(DEPTH.ui);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.ready = false;
      // Nunca dejar al jugador atado al cambiar de escena, morir o salir al título.
      if (GameState.bound) {
        GameState.bound = false;
        bus.emit('player:bound', { on: false });
      }
      GameState.controlsInverted = false;
      setObjective(null);
    });
    installInteract(world, { enabled: (it) => this.enabled(it) });
    installLightTrail(world);
    bus.scoped(scene, 'interact', ({ id }) => {
      const it = world.level.interactables.find((entry) => entry.id === id);
      if (it && this.enabled(it)) void this.run(() => this.interact(it));
    });
    bus.scoped(scene, 'trigger:enter', ({ trigger }) => void this.onTrigger(trigger));
    bus.scoped(scene, 'boss:calmed', () => { if (this.id === 'catedral_eclipse') void this.finale(); });
    bus.scoped(scene, 'itzpa:core', ({ hits }) => this.onCore(hits));
    bus.scoped(scene, 'itzpa:stagger', ({ ms }) => this.onStagger(ms));
    bus.scoped(scene, 'spell:resolved', (ev) => this.onSpell(ev));

    GameState.section = world.level.id;
    GameState.flags.gema = true;
    this.ensurePrerequisites();
    if (GameState.checkpoint?.section !== world.level.id) {
      const cp = world.level.spawns?.checkpoint ?? world.level.spawn;
      this.checkpoint(cp);
    }
    scene.time.addEvent({ delay: config.tickMs, loop: true, callback: () => this.tick() });
    this.refresh();
    scene.time.delayedCall(100, () => void this.run(() => this.intro()));
  }

  /* ============================== utilidades ============================== */

  private get id(): string { return this.world.level.id; }

  private knows(spellId: string): boolean { return GameState.learnedSpells.includes(spellId); }

  private toast(text: string, ms: number = config.toastMs): void {
    bus.emit('hud:toast', { text, ms });
  }

  /** Aviso corto (≤ 90 caracteres) definido en gdl.json → avisos. */
  private aviso(key: string, ms?: number): void {
    const text = AVISOS[key];
    if (text) this.toast(text, ms);
  }

  private checkpoint(point: Pt): void {
    const section = this.world.level.id;
    GameState.checkpoint = { section, x: point.x, y: point.y };
    bus.emit('checkpoint', { section, x: point.x, y: point.y });
  }

  private say(id: string): Promise<void> {
    if (!this.alive) return Promise.resolve();
    return playDialogue(this.world.scene, id);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.alive) { resolve(); return; }
      this.world.scene.time.delayedCall(ms, () => resolve());
      this.world.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => resolve());
    });
  }

  private thaw(): void { this.world.timeScale = 1; }
  private freeze(): void { this.world.timeScale = 0; this.world.player.controlsLocked = true; }

  private music(track: string): void { bus.emit('music', { track }); }

  private award(amount: number, at?: Pt): void {
    if (amount <= 0) return;
    addEcos(amount);
    sfx('conjuro_ok');
    const p = at ?? this.world.player;
    const text = this.world.scene.add.text(p.x, p.y - 36, `+${amount} Ecos`, {
      fontFamily: FUENTE, fontSize: '11px', color: '#f2c14e', stroke: '#0b0a14', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui - 1);
    this.world.scene.tweens.add({
      targets: text, y: p.y - 70, alpha: 0, duration: 1400, onComplete: () => text.destroy(),
    });
  }

  private sprite(name: string): Phaser.GameObjects.Sprite | null {
    const sprite = this.world.scene.children.getByName(name) as Phaser.GameObjects.Sprite | null;
    return sprite && typeof sprite.setVisible === 'function' ? sprite : null;
  }

  /** Serializa las secuencias (diálogos, triggers, interacciones) y congela el mundo mientras duran. */
  private run(fn: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(() => this.exec(fn));
    return this.queue;
  }

  private async exec(fn: () => Promise<void>): Promise<void> {
    if (!this.alive) return;
    this.busy = true;
    this.saved = { locked: this.world.player.controlsLocked, scale: this.world.timeScale };
    this.world.timeScale = 0;
    this.world.player.controlsLocked = true;
    try {
      await fn();
    } catch (err) {
      console.warn('[ECOS] GdlDirector: la secuencia falló', err);
    } finally {
      if (this.alive) {
        this.busy = false;
        // No restaurar un bloqueo ajeno (p. ej. un conjuro en curso): solo un conjuro activo puede seguir bloqueando;
        // Casting restaura lo suyo al terminar. Nunca dejar el mundo congelado ni al jugador atado por error.
        const casting = GameState.casting;
        this.world.player.controlsLocked = casting ? this.saved.locked : false;
        this.world.timeScale = casting ? this.saved.scale : 1;
        if (GameState.bound && !this.chainRunning) this.setBound(false);
        this.refresh();
      }
    }
  }

  /* ========================= estado y prerrequisitos ========================= */

  private silentLearn(spellId: string): void {
    if (!GameState.learnedSpells.includes(spellId)) GameState.learnedSpells.push(spellId);
    GameState.mastery[spellId] ??= { level: 0, progress: 0 };
  }

  /** Entrada directa (?seccion=…) sin pasar por el Nivel 7: prepara lo necesario. */
  private ensurePrerequisites(): void {
    if (!GameState.flags['n07:fragmento_6']) {
      console.warn('[ECOS] Nivel 10: entrada directa sin los 6 fragmentos; se prepara la entrada a Guadalajara para pruebas.');
      prepareGdlEntry();
      GameState.section = this.id as typeof GameState.section;
    }
    for (const spell of ['LUZ', 'MEMORIA', 'PROTECCION', 'SOL']) {
      if (this.knows(spell)) continue;
      console.warn(`[ECOS] Nivel 10: entrada directa sin ${spell}; se concede para pruebas.`);
      this.silentLearn(spell);
    }
    // Lo aprendido en este nivel debe estar disponible en la rueda al reintentar.
    if (flag('libre') && !this.knows('ECOS')) this.silentLearn('ECOS');
    if (flag('recuerdo') && !this.knows('MAMA')) this.silentLearn('MAMA');
  }

  private setBound(on: boolean): void {
    if (GameState.bound === on) return;
    GameState.bound = on;
    bus.emit('player:bound', { on });
  }

  /* ============================== APIs ajenas con guarda ============================== */

  private placeMadre(at: Pt): void {
    const mod = MadreMod as unknown as MadreExtra;
    if (!mod.placeMadre) { console.warn('[ECOS] Madre.placeMadre aún no existe.'); return; }
    try { mod.placeMadre(this.world, at.x, at.y); } catch (err) { console.warn('[ECOS] placeMadre falló', err); }
  }

  private madreCall(name: 'wakeMadre' | 'freeMadre'): Promise<void> {
    const fn = (MadreMod as unknown as MadreExtra)[name];
    if (!fn) { console.warn(`[ECOS] Madre.${name} aún no existe.`); return Promise.resolve(); }
    try { return Promise.resolve(fn()).catch((err) => console.warn(`[ECOS] ${name} falló`, err)); } catch (err) {
      console.warn(`[ECOS] ${name} falló`, err);
      return Promise.resolve();
    }
  }

  /** madreApproach / madreGesture con tope de espera: la conversación nunca se cuelga si la madre no responde. */
  private async madreMove(name: 'madreApproach' | 'madreGesture', arg: number, maxMs: number): Promise<void> {
    const fn = (MadreMod as unknown as MadreExtra)[name];
    if (!fn) return;
    try { await Promise.race([Promise.resolve(fn(arg)), this.wait(maxMs)]); } catch (err) { console.warn(`[ECOS] ${name} falló`, err); }
  }

  /** Balam crece a jaguar luminoso (con tope de espera: nunca deja la secuencia colgada). */
  private async awaken(): Promise<void> {
    const mod = BalamMod as unknown as BalamExtra;
    const p = this.world.player;
    if (!mod.awakenJaguar) {
      console.warn('[ECOS] BalamJaguar.awakenJaguar aún no existe.');
      GameState.balamJaguar = true;
      bus.emit('balam:jaguar', { on: true });
      return;
    }
    try {
      await Promise.race([
        Promise.resolve(mod.awakenJaguar(this.world, p.x + config.final.jaguarDx, p.y)),
        this.wait(config.final.jaguarMaxMs),
      ]);
    } catch (err) {
      console.warn('[ECOS] awakenJaguar falló', err);
    }
  }

  private calm(): void {
    const mod = BalamMod as unknown as BalamExtra;
    if (!mod.calmJaguar) {
      GameState.balamJaguar = false;
      bus.emit('balam:jaguar', { on: false });
      return;
    }
    try { mod.calmJaguar(); } catch (err) { console.warn('[ECOS] calmJaguar falló', err); }
  }

  private openRoof(ms: number): void {
    const fn = (SceneryMod as unknown as SceneryExtra).openCathedralRoof;
    if (!fn) { console.warn('[ECOS] GdlScenery.openCathedralRoof aún no existe.'); return; }
    try { fn(ms); } catch (err) { console.warn('[ECOS] openCathedralRoof falló', err); }
  }

  private setEclipse(progress: number): void {
    this.lastEclipse = progress;
    bus.emit('eclipse:progress', { progress });
  }

  /* ============================== HUD y objetivo ============================== */

  private triggerBy(pred: (t: LevelTrigger) => boolean): Pt | null {
    const t = this.world.level.triggers.find(pred);
    return t ? { x: t.x + t.w / 2, y: t.y + t.h * 0.55 } : null;
  }

  /** ¿Quedan enemigos vivos de la arena? (World los crea de forma síncrona al emitirse 'arena:start'). */
  private groupAlive(group: string): boolean {
    return this.world.enemies.some((e) => e.group === group && e.alive && !e.purified);
  }

  private encuentrosHechos(): number { return ENCUENTROS.filter((e) => flag(`enc:${e.id}`)).length; }
  private tandasHechas(): number { return TANDAS.filter((t) => flag(`tanda:${t.id}`)).length; }

  private tzTotal(): number { return PASOS_F1.reduce((n, p) => n + p.tzitzimime, 0); }

  private tzCaidas(): number {
    let done = PASOS_F1.filter((p) => flag(`f1:${p.id}`)).reduce((n, p) => n + p.tzitzimime, 0);
    if (this.f1) {
      const paso = PASOS_F1[this.f1.index];
      const vivas = this.world.enemies.filter((e) => e.kind === 'tzitzimitl' && e.group === paso.grupo && e.alive && !e.purified).length;
      done += Math.max(0, paso.tzitzimime - vivas);
    }
    return Math.min(done, this.tzTotal());
  }

  private status(): { text: string; target: Pt | null } {
    switch (this.id) {
      case 'gdl_avenida': {
        const total = ENCUENTROS.length;
        const done = this.encuentrosHechos();
        const head = `AVENIDA ${done}/${total}`;
        if (this.enc) return { text: `${head}\n${this.enc.def.nombre}`, target: null };
        if (done < total) {
          const next = ENCUENTROS.find((e) => !flag(`enc:${e.id}`));
          const target = next ? this.triggerBy((t) => t.action === 'encuentro' && t.data?.id === next.id) : null;
          return { text: `${head}\nAvanza hacia el estadio`, target };
        }
        return { text: `${head}\nEntra a la Catedral`, target: this.triggerBy((t) => t.action === 'ir_seccion') };
      }
      case 'catedral': {
        if (!flag('oleada_fin')) {
          if (this.vamp || this.tandasHechas() >= TANDAS.length) return { text: `${VAMPIRO.nombre.toUpperCase()}\nSOL y LUZ lo hieren`, target: null };
          const total = TANDAS.length;
          const index = Math.min(this.tandasHechas() + 1, total);
          return { text: `OLEADA FINAL ${index}/${total}\nLuna (F) revela a los espíritus`, target: null };
        }
        return { text: 'ALTAR MAYOR\nAcércate a tu madre', target: this.triggerBy((t) => t.action === 'emboscada') };
      }
      case 'catedral_eclipse': {
        if (flag('completo')) return { text: 'EL SOL REGRESA', target: null };
        if (this.fase === 'liberar') {
          const it = this.world.level.interactables.find((x) => x.action === 'n10_liberar');
          return { text: 'EL SOL REGRESA\nLibera a tu madre (E)', target: it ? { x: it.x, y: it.y } : null };
        }
        if (this.fase === 'cadena' || (!flag('libre') && this.fase === 'ninguna')) {
          return { text: 'ATADO\nDeletrea a escondidas: LUZ · MEMORIA · ECOS', target: null };
        }
        if (this.fase === 'f1' || this.fase === 'capullo') {
          return { text: `TZITZIMIME ${this.tzCaidas()}/${this.tzTotal()}\nPROTECCION, LUZ o SOL las repelen`, target: null };
        }
        if (this.fase === 'f2') {
          const max = config.final.fase2.nucleoMax;
          const mama = this.knows('MAMA');
          const hint = !mama ? 'Espera el núcleo'
            : this.staggerOn ? 'ECOS (Q) AHORA' : 'MAMA (Q) abre la ventana';
          return { text: `ITZPAPÁLOTL · NÚCLEO ${this.coreHits}/${max}\n${hint}`, target: null };
        }
        return { text: '', target: null };
      }
      default:
        return { text: '', target: null };
    }
  }

  private refresh(): void {
    if (!this.alive) return;
    const { text, target } = this.status();
    const locked = !!this.enc || !!this.tanda || this.fase === 'f1' || this.fase === 'f2';
    const objective = target && !locked ? { x: target.x, y: target.y, section: this.world.level.id } : null;
    const signature = `${text}|${objective ? `${Math.round(objective.x)},${Math.round(objective.y)}` : '-'}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.counter.setText(text);
    setObjective(objective);
    bus.emit('objective', objective);
  }

  /* ============================== ciclo del nivel ============================== */

  private async intro(): Promise<void> {
    if (!this.alive) return;
    const titles = TITULOS[this.id];
    if (titles) bus.emit('zone:name', titles);
    if (this.world.level.music) this.music(this.world.level.music);
    switch (this.id) {
      case 'gdl_avenida':
        this.setEclipse(config.eclipse.avenida.desde);
        if (!flag('intro')) {
          await this.say('n10_llegada');
          if (!this.alive) return;
          remember('intro');
        }
        this.ready = true;
        break;
      case 'catedral':
        await this.introCatedral();
        break;
      case 'catedral_eclipse':
        await this.introEclipse();
        break;
    }
  }

  private get anyLock(): boolean {
    return !!this.enc || !!this.tanda || this.fase === 'f1' || this.fase === 'f2' || this.fase === 'cadena';
  }

  private enabled(it: Interactable): boolean {
    if (!this.alive || !this.ready || this.busy || this.leaving) return false;
    switch (it.action) {
      case 'n10_examinar':
      case 'altar':
        return !this.enc;
      case 'n10_liberar':
        return this.fase === 'liberar' && !this.liberando && !flag('completo');
      default:
        return false;
    }
  }

  private tick(): void {
    if (!this.alive) return;
    if (this.id === 'gdl_avenida') {
      this.tickEclipseAvenida();
      if (this.enc) this.checkEncounter();
    }
    if (this.id === 'catedral') this.tickCatedral();
    if (this.id === 'catedral_eclipse') this.tickEclipse();
    this.refresh();
  }

  /* ============================== triggers ============================== */

  private async onTrigger(t: LevelTrigger): Promise<void> {
    if (!this.alive || this.leaving) return;
    const data = t.data ?? {};
    switch (t.action) {
      case 'letras': {
        bus.emit('zone:name', {
          title: String(data.title ?? 'GUADALAJARA'), subtitle: typeof data.subtitle === 'string' ? data.subtitle : undefined,
        });
        const cp = this.world.level.spawns?.checkpoint;
        if (cp && !flag(`letras_cp:${this.id}`)) {
          remember(`letras_cp:${this.id}`);
          this.checkpoint(cp);
        }
        break;
      }
      case 'dialogo': {
        if (typeof data.flag === 'string') {
          if (flag(data.flag)) break;
          remember(data.flag);
        }
        const dialogue = data.dialogue;
        await this.run(async () => {
          if (typeof dialogue === 'string') await this.say(dialogue);
          if (typeof data.toast === 'string') this.toast(data.toast, 6500);
        });
        break;
      }
      case 'punto': {
        const spawn = typeof data.spawn === 'string' ? this.world.level.spawns?.[data.spawn] : undefined;
        if (spawn && !flag(`punto:${t.id}`)) {
          remember(`punto:${t.id}`);
          this.checkpoint(spawn);
          this.toast('Punto de control: ofrenda en el altar para recuperar vida. Es el último.', 5500);
        }
        break;
      }
      case 'encuentro':
        this.startEncounter(data);
        break;
      case 'ir_seccion':
        this.leaveSection(data);
        break;
      case 'emboscada':
        if (!this.ready || this.busy || this.anyLock || this.emboscadaOn || this.emboscadaPend || !flag('oleada_fin')) break;
        await this.run(() => this.emboscada(data));
        break;
    }
  }

  private leaveSection(data: Record<string, unknown>): void {
    const section = data.section;
    if (typeof section !== 'string') return;
    if (data.requires === 'encuentros' && this.encuentrosHechos() < ENCUENTROS.length) {
      if (this.world.scene.time.now - this.lastHint > 6000) {
        this.lastHint = this.world.scene.time.now;
        this.aviso('puerta_cerrada');
      }
      return;
    }
    if (!this.ready || this.anyLock || this.busy) return;
    this.leaving = true;
    remember(`salida:${this.id}`);
    this.world.gotoSection(section as Parameters<WorldApi['gotoSection']>[0],
      typeof data.spawn === 'string' ? data.spawn : undefined);
  }

  /* ============================== avenida ============================== */

  /** El eclipse avanza con el recorrido: 0 → 0.6 según la x más lejana alcanzada. */
  private tickEclipseAvenida(): void {
    const px = this.world.player.x;
    if (px > this.maxX) this.maxX = px;
    const span = config.eclipse.avenida;
    const frac = Math.min(1, Math.max(0, this.maxX / (this.world.level.width - 200)));
    const p = span.desde + (span.hasta - span.desde) * frac;
    if (this.lastEclipse < 0 || p - this.lastEclipse >= config.eclipse.paso) this.setEclipse(p);
  }

  private startEncounter(data: Record<string, unknown>): void {
    const def = ENCUENTROS.find((e) => e.id === data.id);
    if (!def || !this.alive || !this.ready || this.busy || this.leaving || this.anyLock) return;
    if (flag(`enc:${def.id}`)) return;
    const enc: NonNullable<GdlDirector['enc']> = { def, grupo: def.grupo, start: this.world.scene.time.now, seen: false };
    this.enc = enc;
    if (def.intro && !flag(`dlg:${def.id}_intro`)) {
      // Minijefe con presentación: la arena se bloquea al terminar el diálogo (mientras tanto el encuentro ya cuenta
      // como activo, así que no se puede disparar dos veces ni salir por la puerta).
      remember(`dlg:${def.id}_intro`);
      enc.pendiente = true;
      const dialogue = def.intro;
      void this.run(() => this.say(dialogue)).then(() => { if (this.alive && this.enc === enc) this.beginEncounter(enc); });
      this.refresh();
      return;
    }
    this.beginEncounter(enc);
  }

  private beginEncounter(enc: NonNullable<GdlDirector['enc']>): void {
    const def = enc.def;
    enc.pendiente = false;
    enc.start = this.world.scene.time.now;
    this.world.lockArena(def.x0, def.x1);
    bus.emit('arena:start', { group: def.grupo });
    enc.seen = this.groupAlive(def.grupo);
    sfx('chaneque_risa');
    if (def.jefe) this.world.shake(0.005, 300);
    if (def.aviso && !flag(`tip:${def.aviso}`)) {
      remember(`tip:${def.aviso}`);
      this.aviso(def.aviso, 6000);
    }
    this.refresh();
  }

  private checkEncounter(): void {
    const e = this.enc;
    if (!e || e.pendiente) return;
    const alive = this.world.enemies.filter((en) => en.group === e.grupo && en.alive && !en.purified);
    if (alive.length > 0) e.seen = true;
    const elapsed = this.world.scene.time.now - e.start;
    if (elapsed < config.avenida.minMs || alive.length > 0) return;
    // Si el tipo de enemigo aún no está integrado (el grupo nunca aparece), el respaldo evita atascar la puerta.
    if (e.seen || elapsed > (e.def.respaldoMs ?? config.avenida.respaldoMs)) this.endEncounter();
  }

  private endEncounter(): void {
    const e = this.enc;
    if (!e) return;
    this.enc = null;
    remember(`enc:${e.def.id}`);
    this.world.unlockArena();
    bus.emit('arena:clear', { group: e.grupo });
    this.award(e.def.jefe ? config.rewards.minijefe : config.rewards.encuentro);
    if (e.def.dialogo) {
      const dialogue = e.def.dialogo;
      void this.run(() => this.say(dialogue));
    } else {
      this.aviso('enc_fin');
    }
    this.refresh();
  }

  /* ============================== catedral ============================== */

  private async introCatedral(): Promise<void> {
    this.setEclipse(config.eclipse.catedral);
    if (flag('emboscada')) {
      // Reintento justo al irse a la sección siguiente: se retoma el viaje.
      this.leaving = true;
      this.world.gotoSection('catedral_eclipse');
      return;
    }
    if (flag('oleada_fin')) {
      this.placeMadre(config.catedral.madre);
      this.ready = true;
      return;
    }
    if (!flag('catedral_llegada')) {
      await this.say('n10_catedral_llegada');
      if (!this.alive) return;
      remember('catedral_llegada');
    }
    this.ready = true;
    this.startOleada();
  }

  private startOleada(): void {
    if (!this.alive || this.oleadaOn) return;
    if (this.tandasHechas() >= TANDAS.length && flag('vampiro_fin')) { this.oleadaFin(); return; }
    this.oleadaOn = true;
    this.world.lockArena(config.catedral.arena.x0, config.catedral.arena.x1);
    this.gapLeft = 1200;
    this.refresh();
  }

  private tickCatedral(): void {
    // El trigger del altar solo avisa al ENTRAR: si en ese momento había un diálogo o la oleada seguía,
    // el aviso se perdía y había que salir y volver a entrar. Aquí se revisa en cada tick.
    if (!this.oleadaOn && flag('oleada_fin') && !flag('emboscada') && this.ready && !this.busy && !this.anyLock && !this.emboscadaOn && !this.emboscadaPend) {
      const t = this.world.level.triggers.find((tr) => tr.action === 'emboscada');
      if (t && this.world.player.x >= t.x) {
        this.emboscadaPend = true;
        void this.run(() => this.emboscada((t.data ?? {}) as Record<string, unknown>)).finally(() => { this.emboscadaPend = false; });
      }
      return;
    }
    if (!this.oleadaOn || this.busy || !this.ready) return;
    if (this.vamp) { this.tickVampiro(); return; }
    if (!this.tanda) {
      this.gapLeft -= config.tickMs;
      if (this.gapLeft <= 0) this.nextTanda();
      return;
    }
    const t = this.tanda;
    const alive = this.world.enemies.filter((e) => e.group === t.grupo && e.alive && !e.purified);
    if (alive.length > 0) t.seen = true;
    const elapsed = this.world.scene.time.now - t.start;
    if (elapsed < config.catedral.minMs || alive.length > 0) return;
    if (t.seen || elapsed > config.catedral.respaldoMs) this.endTanda();
  }

  private nextTanda(): void {
    const index = TANDAS.findIndex((t) => !flag(`tanda:${t.id}`));
    if (index < 0) { this.afterTandas(); return; }
    const def = TANDAS[index];
    this.tanda = { index, grupo: def.grupo, start: this.world.scene.time.now, seen: false };
    bus.emit('arena:start', { group: def.grupo });
    this.tanda.seen = this.groupAlive(def.grupo);
    sfx('chaneque_risa');
    this.world.shake(0.004, 220);
    this.refresh();
  }

  private endTanda(): void {
    const t = this.tanda;
    if (!t) return;
    this.tanda = null;
    const def = TANDAS[t.index];
    remember(`tanda:${def.id}`);
    bus.emit('arena:clear', { group: def.grupo });
    this.award(config.rewards.tanda);
    this.gapLeft = config.catedral.pausaTandaMs;
    if (this.tandasHechas() >= TANDAS.length) {
      this.afterTandas();
    } else {
      this.aviso('tanda_fin');
      if (def.fin) { const dialogue = def.fin; void this.run(() => this.say(dialogue)); }
    }
    this.refresh();
  }

  /** Terminadas las tandas viene el minijefe (Vampiro) y, solo después, el altar mayor. */
  private afterTandas(): void {
    if (flag('vampiro_fin') || !VAMPIRO) { this.oleadaFin(); return; }
    this.startVampiro();
  }

  private startVampiro(): void {
    if (this.vamp || !this.alive) return;
    const v: NonNullable<GdlDirector['vamp']> = { grupo: VAMPIRO.grupo, start: this.world.scene.time.now, seen: false, pendiente: true };
    this.vamp = v;
    const begin = () => {
      if (!this.alive || this.vamp !== v) return;
      v.pendiente = false;
      v.start = this.world.scene.time.now;
      bus.emit('arena:start', { group: VAMPIRO.grupo });
      v.seen = this.groupAlive(VAMPIRO.grupo);
      sfx('chaneque_risa');
      this.world.shake(0.006, 320);
      this.world.flash(0x7a2a4a, 260);
      if (VAMPIRO.aviso) this.aviso(VAMPIRO.aviso, 6000);
      this.refresh();
    };
    this.refresh();
    void this.run(async () => {
      await this.wait(VAMPIRO.pausaMs);
      if (!flag('dlg:vampiro_intro')) {
        remember('dlg:vampiro_intro');
        await this.say(VAMPIRO.intro);
      }
    }).then(begin);
  }

  private tickVampiro(): void {
    const v = this.vamp;
    if (!v || v.pendiente) return;
    const alive = this.world.enemies.filter((e) => e.group === v.grupo && e.alive && !e.purified);
    if (alive.length > 0) v.seen = true;
    const elapsed = this.world.scene.time.now - v.start;
    if (elapsed < VAMPIRO.minMs || alive.length > 0) return;
    // Sin el Vampiro integrado (el grupo nunca aparece), el respaldo evita atascar la Catedral.
    if (v.seen || elapsed > VAMPIRO.respaldoMs) this.endVampiro();
  }

  private endVampiro(): void {
    const v = this.vamp;
    if (!v) return;
    v.pendiente = true; // el Vampiro se da por terminado hasta que acabe su diálogo (oleadaFin lo limpia)
    remember('vampiro_fin');
    bus.emit('arena:clear', { group: v.grupo });
    this.award(config.rewards.minijefe);
    this.world.flash(0xfff0c0, 500);
    void this.run(() => this.say(VAMPIRO.fin)).then(() => { if (this.alive) this.oleadaFin(); });
  }

  private oleadaFin(): void {
    this.oleadaOn = false;
    this.tanda = null;
    this.vamp = null;
    remember('oleada_fin');
    this.world.unlockArena();
    const spawn = this.world.level.spawns?.altar_mayor;
    if (spawn) this.checkpoint(spawn);
    this.placeMadre(config.catedral.madre);
    this.aviso('oleada_fin', 5500);
    void this.run(async () => {
      if (flag('dlg:madre_vista')) return;
      remember('dlg:madre_vista');
      await this.say('n10_madre_vista');
    });
    this.refresh();
  }

  /** La emboscada: la verdad, el Códice robado, el techo abierto → catedral_eclipse. */
  private async emboscada(data: Record<string, unknown>): Promise<void> {
    if (this.emboscadaOn || flag('emboscada')) return;
    this.emboscadaOn = true;
    try {
      await this.emboscadaPasos(data);
    } finally {
      // Si la secuencia se interrumpió por un error, se puede volver a disparar al pisar el trigger.
      if (!flag('emboscada')) this.emboscadaOn = false;
    }
  }

  private async emboscadaPasos(data: Record<string, unknown>): Promise<void> {
    const cfg = config.catedral.emboscada;
    this.music(config.musica.catedral);
    await this.say(typeof data.dialogue === 'string' ? data.dialogue : 'n10_altar_mayor');
    if (!this.alive) return;
    this.world.flash(0xb48cff, 600);
    this.world.shake(0.006, 600);
    sfx('aprender');
    for (const name of cfg.mandos) this.sprite(name)?.setAlpha(1);
    await this.wait(cfg.pausaMandosMs);
    if (!this.alive) return;
    await this.say('n10_emboscada');
    if (!this.alive) return;
    await this.say('n10_codice');
    if (!this.alive) return;
    remember('codice_perdido');
    this.world.flash(0xfff0c0, 500);
    sfx('aprender');
    await this.say('n10_invocacion');
    if (!this.alive) return;
    this.openRoof(cfg.techoMs);
    this.setEclipse(config.eclipse.techo);
    this.world.shake(0.008, cfg.techoMs);
    this.world.flash(0x120a22, 900);
    await this.wait(cfg.techoMs);
    if (!this.alive) return;
    await this.say('n10_techo');
    if (!this.alive) return;
    remember('emboscada');
    this.leaving = true;
    this.world.gotoSection('catedral_eclipse', 'atado');
  }

  /* ============================== interacciones ============================== */

  private async interact(it: Interactable): Promise<void> {
    switch (it.action) {
      case 'n10_examinar': {
        const dialogue = it.data?.dialogue;
        if (typeof dialogue === 'string') await this.say(dialogue);
        if (!this.alive) return;
        this.discover(it.data?.descubrimiento, it);
        break;
      }
      case 'n10_liberar':
        await this.liberarMadre();
        break;
      case 'altar': {
        GameState.hp = GameState.maxHp;
        this.checkpoint(this.world.level.spawns?.altar ?? { x: it.x, y: it.y + 28 });
        sfx('altar');
        const sm = this.world.scene.scene;
        this.world.player.controlsLocked = GameState.casting ? this.saved.locked : false;
        sm.launch('Altar', { section: this.world.level.id, x: it.x, y: it.y });
        sm.bringToTop('Altar');
        sm.pause();
        break;
      }
    }
  }

  private discover(key: unknown, at: Pt): void {
    if (typeof key !== 'string' || flag(`desc:${key}`)) return;
    remember(`desc:${key}`);
    this.award(config.rewards.descubrimiento, at);
  }

  /* ============================== conjuros de la historia ============================== */

  /** Enseña un conjuro con el aprendizaje guiado; si aún no existe en spells.json lo concede con aviso. */
  private async teach(spellId: string): Promise<boolean> {
    if (!this.knows(spellId)) {
      if (!getSpellDef(spellId)) {
        console.warn(`[ECOS] ${spellId} no está en spells.json: se concede sin aprendizaje guiado.`);
        this.silentLearn(spellId);
        GameState.selectedSpell = spellId;
        this.toast(`Aprendiste ${spellId}`);
      } else {
        await startLearning(this.world, spellId);
        if (!this.alive) return false;
        // Casting restaura el tiempo al terminar; los diálogos siguientes se vuelven a congelar.
        this.freeze();
      }
    }
    return this.knows(spellId);
  }

  /** Lanza un conjuro con el tiempo muy ralentizado. Resuelve con su resultado ('fail' | 'partial' | 'perfect'). */
  private async cast(spellId: string): Promise<SpellOutcomeEvent['outcome']> {
    const fn = (CastingMod as unknown as CastingExtra).castSpellNow;
    if (!fn || !getSpellDef(spellId)) {
      console.warn(`[ECOS] castSpellNow o el conjuro ${spellId} aún no existen: el paso se da por logrado.`);
      return 'perfect';
    }
    this.world.timeScale = config.final.timeScale;
    const ev = await fn(this.world, spellId);
    return ev?.outcome ?? 'fail';
  }

  private async pasoAprender(paso: Paso): Promise<void> {
    if (this.knows(paso.conjuro)) return;
    for (let tries = 0; tries < 5 && !(await this.teach(paso.conjuro)); tries++) {
      if (!this.alive) return;
    }
    if (!this.knows(paso.conjuro)) throw new Error(`No se aprendió ${paso.conjuro}`);
    this.award(config.rewards.conjuro);
  }

  private async pasoLanzar(paso: Paso): Promise<void> {
    if (!this.knows(paso.conjuro)) this.silentLearn(paso.conjuro);
    let failed = 0;
    let quick = 0;
    for (;;) {
      const t0 = Date.now();
      const outcome = await this.cast(paso.conjuro);
      if (!this.alive) return;
      this.freeze();
      if (outcome !== 'fail') break;
      // Sin castigo: se repite el mismo paso. Si Casting devuelve 'fail' al instante una y otra vez (no hay deletreo),
      // se corta para no atascar el juego.
      quick = Date.now() - t0 < 250 ? quick + 1 : 0;
      if (quick >= config.final.maxFallosRapidos) {
        console.warn(`[ECOS] ${paso.conjuro}: el deletreo falla al instante; el paso se da por logrado.`);
        break;
      }
      failed++;
      if (failed === 1 && paso.repite) await this.say(paso.repite);
      else this.toast('Otra vez, con calma: el tiempo sigue detenido para ti.', 2800);
      if (!this.alive) return;
      await this.wait(config.final.pausaFalloMs);
      if (!this.alive) return;
    }
    if (paso.ok) await this.say(paso.ok);
  }

  /* ============================== catedral_eclipse ============================== */

  private async introEclipse(): Promise<void> {
    this.setEclipse(config.eclipse.techo);
    if (flag('completo')) {
      this.ready = true;
      this.fase = 'fin';
      this.goEpilogo();
      return;
    }
    this.placeMadre(config.final.madre);
    this.ready = true;
    if (flag('itzpa_cae')) {
      // La jefa ya cayó: no hay pelea que repetir, solo liberar a la madre y hablar con ella.
      await this.reanudarFinal();
      return;
    }
    if (flag('libre')) {
      // Reintento tras morir: no se repite la cadena atada; Balam vuelve a despertar y se retoma la fase alcanzada.
      this.setBound(false);
      await this.awaken();
      if (!this.alive) return;
      await this.say('n10_reintento');
      if (!this.alive) return;
      this.aviso('volver');
      return;
    }
    if (!flag('atado_dlg')) {
      remember('atado_dlg');
      await this.say('n10_atado');
      if (!this.alive) return;
    }
    await this.cadena();
  }

  /** Atado: LUZ → MEMORIA → aprender ECOS → ECOS mientras el culto habla. Un fallo repite ese paso. */
  private async cadena(): Promise<void> {
    if (!this.alive || this.chainRunning || flag('libre')) return;
    this.chainRunning = true;
    this.chainTries++;
    this.fase = 'cadena';
    try {
      this.setBound(true);
      this.aviso('atado', 6500);
      this.refresh();
      for (const paso of PASOS) {
        if (flag(`paso:${paso.id}`)) continue;
        if (paso.intro && !flag(`pi:${paso.id}`)) {
          remember(`pi:${paso.id}`);
          await this.say(paso.intro);
          if (!this.alive) return;
        }
        if (paso.tipo === 'aprender') await this.pasoAprender(paso);
        else await this.pasoLanzar(paso);
        if (!this.alive) return;
        remember(`paso:${paso.id}`);
        this.award(config.rewards.paso);
      }
      this.world.flash(0xffffff, 700);
      this.world.shake(0.007, 700);
      sfx('aprender');
      this.setBound(false);
      remember('libre');
      await this.say('n10_libre');
      if (!this.alive) return;
      this.thaw();
      await this.awaken();
      if (!this.alive) return;
      this.freeze();
      await this.say('n10_jaguar');
    } finally {
      this.chainRunning = false;
      // Pase lo que pase, nunca se deja al jugador atado.
      if (GameState.bound) this.setBound(false);
      this.fase = 'ninguna';
      this.refresh();
    }
  }

  private tickEclipse(): void {
    if (this.busy || !this.ready || this.leaving) return;
    if (!flag('libre')) {
      // La cadena se interrumpió (error de un sistema ajeno): se retoma sin castigo.
      if (this.chainTries < 3 && !this.chainRunning && this.fase === 'ninguna') void this.run(() => this.cadena());
      return;
    }
    if (this.fase === 'ninguna' && !this.finaleRunning) {
      if (flag('f1_fin')) this.startFase2(true);
      else this.startFase1();
      return;
    }
    if (this.fase === 'f1') this.tickFase1();
    if (this.fase === 'f2') this.tickFase2();
  }

  /* ----------------------------- Fase 1: Tzitzimime ----------------------------- */

  private ensureCapullo(): void {
    if (this.capulloOn) return;
    this.capulloOn = true;
    bus.emit('arena:start', { group: config.final.fase2.grupoCapullo });
  }

  private startFase1(): void {
    this.fase = 'f1';
    this.world.lockArena(config.final.arena.x0, config.final.arena.x1);
    this.music(config.musica.tzitzimime);
    this.ensureCapullo();
    this.aviso('capullo', 5000);
    this.nextFase1Step();
  }

  private nextFase1Step(): void {
    const index = PASOS_F1.findIndex((p) => !flag(`f1:${p.id}`));
    if (index < 0) { void this.fase1Fin(); return; }
    const paso = PASOS_F1[index];
    const begin = () => {
      if (!this.alive) return;
      this.f1 = { index, grupo: paso.grupo, start: this.world.scene.time.now, seen: false };
      bus.emit('arena:start', { group: paso.grupo });
      if (this.f1) this.f1.seen = this.groupAlive(paso.grupo);
      this.world.shake(0.005, 300);
      if (paso.aviso) this.aviso(paso.aviso, 6000);
      this.refresh();
    };
    if (paso.dialogo && !flag(`dlg:${paso.id}`)) {
      remember(`dlg:${paso.id}`);
      const dialogue = paso.dialogo;
      this.f1 = null;
      this.f1Start = true;
      void this.run(() => this.say(dialogue)).then(() => { this.f1Start = false; begin(); });
    } else {
      begin();
    }
  }

  private tickFase1(): void {
    const f = this.f1;
    if (!f || this.f1Start) return;
    const alive = this.world.enemies.filter((e) => e.group === f.grupo && e.alive && !e.purified);
    if (alive.length > 0) f.seen = true;
    const elapsed = this.world.scene.time.now - f.start;
    if (elapsed < config.final.fase1.minMs || alive.length > 0) return;
    if (f.seen || elapsed > config.final.fase1.respaldoMs) this.endFase1Step();
  }

  private endFase1Step(): void {
    const f = this.f1;
    if (!f) return;
    this.f1 = null;
    const paso = PASOS_F1[f.index];
    bus.emit('arena:clear', { group: paso.grupo });
    remember(`f1:${paso.id}`);
    this.award(config.rewards.tzitzimime * paso.tzitzimime);
    this.nextFase1Step();
  }

  /** Cae la última Tzitzimitl: el capullo estalla. */
  private async fase1Fin(): Promise<void> {
    if (this.fase === 'capullo' || flag('f1_fin')) return;
    this.fase = 'capullo';
    remember('f1_fin');
    this.f1 = null;
    this.refresh();
    await this.run(async () => {
      await this.say('n10_capullo');
      if (!this.alive) return;
      this.thaw();
      this.world.flash(0xf0e6ff, 700);
      this.world.shake(0.01, 900);
      sfx('aprender');
      this.hatch();
      this.music(config.musica.itzpapalotl);
      this.award(config.rewards.capullo);
      await this.wait(config.final.fase2.capulloMs);
      if (!this.alive) return;
      this.freeze();
      await this.say('n10_itzpa');
      remember('capullo_roto');
    });
    if (this.alive) this.startFase2(false);
  }

  private boss(): EnemyApi | undefined { return this.world.enemies.find((e) => e.kind === 'itzpapalotl'); }

  /** Hace estallar el capullo (Itzpapalotl.hatch si existe; si la jefa nace sola, no hace falta). */
  private hatch(): void {
    if (this.hatched) return;
    this.hatched = true;
    const boss = this.boss();
    const fn = (boss as unknown as { hatch?: () => void } | undefined)?.hatch;
    if (typeof fn === 'function') {
      try { fn.call(boss); } catch (err) { console.warn('[ECOS] Itzpapalotl.hatch falló', err); }
    } else {
      console.warn('[ECOS] Itzpapalotl.hatch aún no existe o la jefa no está en escena.');
    }
  }

  /* ----------------------------- Fase 2: Itzpapálotl ----------------------------- */

  private startFase2(retry: boolean): void {
    if (this.fase === 'f2' || this.fase === 'fin') return;
    this.fase = 'f2';
    this.f2Start = this.world.scene.time.now;
    this.f2Seen = false;
    this.world.lockArena(config.final.arena.x0, config.final.arena.x1);
    this.music(config.musica.itzpapalotl);
    if (retry) {
      // Reintento: las Tzitzimime ya cayeron; el capullo nace roto sin repetir la escena.
      this.ensureCapullo();
      this.hatch();
      this.aviso('luna', 5000);
      if (this.knows('MAMA') && flag('recuerdo')) { this.coreSeen = true; this.resumeMama(); }
    } else {
      this.aviso('luna', 5000);
      if (this.coreEarly) this.onCore(this.coreHits);
    }
    this.refresh();
  }

  private resumeMama(): void {
    this.madreCall('wakeMadre');
    GameState.selectedSpell = 'MAMA';
    this.lastMama = this.world.scene.time.now;
    this.aviso('mama', 5500);
  }

  private tickFase2(): void {
    const boss = this.boss();
    if (boss) {
      this.f2Seen = true;
      // El núcleo no se anunció por evento: tras unos segundos de pelea se da el recuerdo igualmente.
      if (!this.coreSeen && this.world.scene.time.now - this.f2Start > config.final.fase2.nucleoMs) this.onCore(this.coreHits);
      if (this.knows('MAMA') && !this.staggerOn && !this.finaleRunning
        && this.world.scene.time.now - this.lastMama > config.final.fase2.ayudaMamaMs) {
        this.lastMama = this.world.scene.time.now;
        this.aviso('ayuda_mama', 5500);
      }
      return;
    }
    if (!this.f2Seen && this.world.scene.time.now - this.f2Start > config.final.fase2.respaldoMs) {
      console.warn('[ECOS] Itzpapálotl no apareció: se da por calmada (respaldo).');
      void this.finale();
    }
  }

  /** Primera vez que se muestra el núcleo: recuerdo de la infancia, MAMA y la madre despierta. */
  private onCore(hits: number): void {
    if (this.id !== 'catedral_eclipse' || !this.alive) return;
    this.coreHits = Math.max(this.coreHits, hits);
    if (hits >= 1 && hits <= 2) this.aviso(`nucleo_${hits}`, 3500);
    if (this.coreSeen) { this.refresh(); return; }
    // Si el núcleo se muestra al estallar el capullo (antes de la Fase 2), se atiende al empezar la Fase 2.
    if (this.fase !== 'f2') { this.coreEarly = true; return; }
    this.coreSeen = true;
    if (this.recuerdoRunning) return;
    this.recuerdoRunning = true;
    void this.run(async () => {
      try {
        if (!flag('recuerdo') || !this.knows('MAMA')) {
          await this.say('n10_recuerdo');
          if (!this.alive) return;
          remember('recuerdo');
          await this.pasoAprender({ id: 'mama', tipo: 'aprender', conjuro: 'MAMA' });
          if (!this.alive) return;
          await this.say('n10_recuerdo_fin');
          if (!this.alive) return;
        }
        this.resumeMama();
      } finally {
        this.recuerdoRunning = false;
      }
    });
  }

  private onStagger(ms: number): void {
    if (this.id !== 'catedral_eclipse' || !this.alive) return;
    this.staggerOn = true;
    GameState.selectedSpell = 'ECOS';
    this.aviso('ventana', Math.max(2500, ms));
    this.world.scene.time.delayedCall(ms, () => {
      if (!this.alive) return;
      this.staggerOn = false;
      if (this.fase === 'f2' && this.knows('MAMA')) {
        GameState.selectedSpell = 'MAMA';
        if (this.coreHits < config.final.fase2.nucleoMax) this.aviso('ventana_cierra', 3000);
      }
      this.refresh();
    });
    this.refresh();
  }

  private onSpell(ev: SpellOutcomeEvent): void {
    if (this.id !== 'catedral_eclipse' || this.fase !== 'f2' || !this.alive) return;
    if (ev.spellId === 'ECOS' && ev.outcome !== 'fail' && this.knows('MAMA')) GameState.selectedSpell = 'MAMA';
    if (ev.spellId === 'ECOS' && !this.staggerOn && ev.outcome !== 'fail') this.aviso('ecos_rebota', 3500);
  }

  /* ----------------------------- final ----------------------------- */

  /**
   * Itzpapálotl cae (boss:calmed). Versión extendida: tras el diálogo el jugador RECUPERA el control, sin enemigos; un
   * rastro de luz lo lleva a la madre y cerca aparece "Liberar a mamá (E)" (liberarMadre → conversación → epílogo).
   */
  private async finale(): Promise<void> {
    if (!this.alive || this.finaleRunning || flag('completo')) return;
    this.finaleRunning = true;
    this.fase = 'fin';
    this.staggerOn = false;
    this.f1 = null;
    this.world.unlockArena();
    for (const group of [...PASOS_F1.map((p) => p.grupo), config.final.fase2.grupoCapullo]) {
      bus.emit('arena:clear', { group });
    }
    this.refresh();
    // Soundtrack del equipo: "Reencuentro con mamá" entra justo al vencer a los jefes finales y sigue
    // mientras el jugador camina hacia ella, la libera y hablan (decisión del equipo, 2026-10-20).
    this.music('n10_reencuentro');
    await this.run(async () => {
      remember('itzpa_cae');
      this.world.flash(0xffffff, 900);
      sfx('aprender');
      await this.say('n10_final');
      if (!this.alive) return;
      this.setEclipse(config.eclipse.final);
    });
    if (!this.alive) return;
    this.esperarLiberacion();
  }

  /** Deja al jugador libre para caminar hasta la madre (objetivo de luz + interactuable `n10_liberar`). */
  private esperarLiberacion(): void {
    this.fase = 'liberar';
    this.liberando = false;
    this.aviso(LIBERAR.aviso, 7000);
    this.refresh();
  }

  /** Reintento tras la caída de Itzpapálotl (se salió a medias): sin pelea, directo a liberar o a la conversación. */
  private async reanudarFinal(): Promise<void> {
    this.finaleRunning = true;
    this.setBound(false);
    this.setEclipse(config.eclipse.final);
    if (flag('madre_libre')) {
      this.fase = 'fin';
      this.music('n10_reencuentro');
      await Promise.race([this.madreCall('freeMadre'), this.wait(LIBERAR.rompeMaxMs)]);
      if (!this.alive) return;
      await this.conversacion();
      return;
    }
    this.music('n10_reencuentro');
    this.esperarLiberacion();
  }

  /** E sobre la madre: se rompen las cadenas (freeMadre), suena n10_reencuentro y hablan. Nunca deja nada bloqueado. */
  private async liberarMadre(): Promise<void> {
    if (this.fase !== 'liberar' || this.liberando || flag('completo')) return;
    this.liberando = true;
    this.fase = 'fin';
    remember('madre_libre');
    this.refresh();
    try {
      this.music('n10_reencuentro');
      this.world.flash(0xfff0c0, 900);
      await Promise.race([this.madreCall('freeMadre'), this.wait(LIBERAR.rompeMaxMs)]);
      if (!this.alive) return;
      await this.conversacion();
    } finally {
      // Si algo falló a medias, el jugador puede volver a intentarlo con E (no se queda sin salida).
      if (this.alive && !flag('completo')) this.esperarLiberacion();
    }
  }

  /** La conversación con la madre (n10_reencuentro*): ella habla en señas; Balam vuelve a ser gato; luego el epílogo. */
  private async conversacion(): Promise<void> {
    const p = this.world.player;
    await this.madreMove('madreApproach', p.x + LIBERAR.pasoX, LIBERAR.acercaMs + 600);
    if (!this.alive) return;
    const ids = LIBERAR.dialogos;
    for (let i = 0; i < ids.length; i++) {
      if (i === LIBERAR.calmarEn) this.calm();
      // Sus manos se mueven mientras se muestra el diálogo (no se espera: es solo la animación).
      void this.madreMove('madreGesture', LIBERAR.gestoMs, LIBERAR.gestoMs + 500);
      await this.say(ids[i]);
      if (!this.alive) return;
    }
    // Por si la lista de diálogos no llegó al punto de calmar a Balam.
    if (GameState.balamJaguar) this.calm();
    this.setEclipse(config.eclipse.final);
    this.award(config.rewards.final);
    remember('completo');
    this.leaving = true;
    void this.wait(config.epilogo.pausaMs).then(() => { if (this.alive) this.goEpilogo(); });
  }

  /** Epílogo: startEpilogo(scene) de EpilogoScene. Sin él, vuelve al título como PauseScene.quitToTitle. */
  private goEpilogo(): void {
    const start = (EpilogoMod as unknown as EpilogoExtra).startEpilogo;
    if (start) {
      bus.emit('music', { track: config.musica.epilogo });
      try {
        start(this.world.scene);
        return;
      } catch (err) {
        console.warn('[ECOS] startEpilogo falló: se vuelve al título.', err);
      }
    } else {
      console.warn('[ECOS] EpilogoScene.startEpilogo aún no existe: se vuelve al título.');
    }
    const sm = this.world.scene.scene;
    bus.emit('game:pause', { paused: false });
    bus.emit('music', { track: null });
    for (const key of config.epilogo.cerrar) {
      if (sm.isActive(key) || sm.isPaused(key) || sm.isSleeping(key)) sm.stop(key);
    }
    sm.start('Title');
  }
}
