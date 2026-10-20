import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import type { EnemyApi, LevelTrigger, WorldApi } from '../core/contracts';
import { DEPTH } from '../config/game';
import { playDialogue } from '../scenes/DialogueScene';
import { getSpellDef, startLearning } from './Casting';
import { installInteract, type Interactable } from './Interact';
import { installLightTrail, setObjective } from './LightTrail';
import { addEcos } from './Progression';
import * as MariaMod from './Maria';
import config from '../data/cdmx.json';
import { prepareCdmx2Entry, prepareCdmxEntry } from './Campaign';

/**
 * Director del Nivel 6 · CDMX parte 1 (dueño: contenido). Maneja las tres secciones
 * (xochimilco → avenidas → reforma) con un switch por world.level.id, siguiendo el patrón de OaxacaDirector:
 * todo el progreso vive en GameState.flags con prefijo `n06:` y sobrevive a la muerte.
 * (El Nivel 5, Puebla, se omite: aquí se aprenden FUEGO, DESCANSO y VERDAD, y se presentan los Encapuchados Negros.)
 *
 * Actions de interactuables: n06_examinar · altar · n06_fuego · n06_descanso · n06_cronista · n06_nahual ·
 *   n06_premio · n06_habitante · n06_estacion.
 * Actions de triggers: letras · dialogo · emboscada · ir_seccion · punto · nahuala_arena.
 *
 * Contrato de los nahuales infiltrados (docs/NIVEL_06_CONTRATOS.md §4): el nivel pone al nahual como enemigo
 * ({id, disguise}) y, encima, un interactuable `n06_nahual` con data.nahualId. Al hablarle se reproduce su línea y
 * se emite 'nahual:reveal' {id, surprise:true}; si 'nahual:revealed' llega antes (VERDAD), se quita su diálogo.
 */

const flag = (key: string) => !!GameState.flags[`n06:${key}`];
const remember = (key: string) => { GameState.flags[`n06:${key}`] = true; };

type Pt = { x: number; y: number };
type MariaApiExtra = { mariaSay?: (text: string, ms?: number) => void; wakeMaria?: (x?: number, y?: number) => void };
type MariaLine = { text: string; ms?: number };
type Ambush = { group: string; x0: number; x1: number; start: number; seen: boolean };

const TITULOS: Record<string, { title: string; subtitle: string }> = {
  xochimilco: { title: 'XOCHIMILCO', subtitle: 'La Isla de las Muñecas' },
  avenidas: { title: 'AVENIDAS', subtitle: 'Día de Muertos' },
  reforma: { title: 'REFORMA', subtitle: 'El Ángel caído' },
};
const SPELL_FLAG: Record<string, string> = { FUEGO: 'fuego', DESCANSO: 'descanso', VERDAD: 'verdad' };

/** Instala el director de la sección actual de la CDMX. */
export function installCdmxDirector(world: WorldApi): void {
  new CdmxDirector(world);
}

class CdmxDirector {
  private alive = true;
  private ready = false;
  private busy = false;
  private leaving = false;
  private bossOn = false;
  private bossSeen = false;
  private arenaStart = 0;
  private ambush: Ambush | null = null;
  private barrier: number | null = null;
  private lastHint = -99999;
  private saved = { locked: false, scale: 1 };
  private queue: Promise<void> = Promise.resolve();
  private lastSignature = '';
  private counter: Phaser.GameObjects.Text;
  /** Enemigo en escena → índice de su spec en level.enemies (para recordar a los derrotados). */
  private specOf = new Map<EnemyApi, number>();
  /** Nahuales ya revelados en esta carga (su diálogo ya no aplica) y los que están por transformarse. */
  private revealed = new Set<string>();
  private revealing = new Set<string>();
  private talked = new Set<string>();
  private pendingReveals: string[] = [];

  constructor(private world: WorldApi) {
    const scene = world.scene;
    this.counter = scene.add.text(config.hud.x, config.hud.y, '', {
      fontFamily: 'monospace', fontSize: `${config.hud.fontSize}px`,
      color: '#fff0ce', backgroundColor: '#171521cc', padding: { x: 5, y: 4 },
      lineSpacing: 3,
    }).setScrollFactor(0).setDepth(DEPTH.ui);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.ready = false;
      setObjective(null);
    });
    installInteract(world, { enabled: (it) => this.enabled(it) });
    installLightTrail(world);
    bus.scoped(scene, 'interact', ({ id }) => {
      const it = world.level.interactables.find((entry) => entry.id === id);
      if (it && this.enabled(it)) void this.run(() => this.interact(it)).then(() => this.flushReveals());
    });
    bus.scoped(scene, 'trigger:enter', ({ trigger }) => void this.onTrigger(trigger));
    bus.scoped(scene, 'cofradia:down', ({ enemy }) => this.markDown(enemy));
    bus.scoped(scene, 'enemy:purified', ({ enemy }) => this.markDown(enemy));
    bus.scoped(scene, 'enemy:exhausted', ({ enemy }) => this.onExhausted(enemy));
    bus.scoped(scene, 'enemy:removed', ({ enemy }) => this.onRemoved(enemy));
    bus.scoped(scene, 'nahual:revealed', ({ id }) => this.onRevealed(id));
    bus.scoped(scene, 'nahual:fled', ({ id }) => this.onFled(id));
    bus.scoped(scene, 'nahuala:illusion', () => {
      if (flag('tip_ilusion')) return;
      remember('tip_ilusion');
      this.toast('Copias ilusorias: VERDAD las disipa y deja expuesta a la real. Con Luna (F) la real se ve distinta.', 6500);
    });
    bus.scoped(scene, 'boss:calmed', () => { if (this.id === 'reforma') void this.nahualaCalmada(); });
    bus.scoped(scene, 'boss:vulnerable', ({ on }) => {
      if (on && !flag('tip_ventana')) {
        remember('tip_ventana');
        this.toast('La Nahuala se debilita: golpéala y dale VERDAD. Cuando quede agotada, solo CALMA la libera.', 6500);
      }
    });

    GameState.section = world.level.id;
    GameState.flags.gema = true;
    this.ensurePrerequisites();
    if (GameState.checkpoint?.section !== world.level.id) {
      const cp = world.level.spawns?.checkpoint ?? world.level.spawn;
      this.checkpoint(cp);
    }
    this.indexEnemies();
    this.restoreWorld();
    scene.time.addEvent({ delay: 300, loop: true, callback: () => this.tick() });
    this.refresh();
    scene.time.delayedCall(100, () => void this.run(() => this.intro()));
  }

  /* ============================== utilidades ============================== */

  private get id(): string { return this.world.level.id; }

  private knows(spellId: string): boolean { return GameState.learnedSpells.includes(spellId); }

  private toast(text: string, ms: number = config.toastMs): void {
    bus.emit('hud:toast', { text, ms });
  }

  /** Comentario de María (globo sobre ella si Maria.ts lo soporta; si no, el bus lo convierte en toast). */
  private mariaSay(key: string): void {
    const line = (config.maria as Record<string, MariaLine | undefined>)[key];
    if (!line || !this.alive || !GameState.hasMaria) return;
    const mod = MariaMod as unknown as MariaApiExtra;
    try {
      if (mod.mariaSay) mod.mariaSay(line.text, line.ms ?? config.comentarioMariaMs);
      else bus.emit('maria:say', { text: line.text, ms: line.ms ?? config.comentarioMariaMs });
    } catch (err) {
      console.warn('[ECOS] mariaSay falló', err);
    }
  }

  /** Comentario de María una sola vez por partida. */
  private mariaOnce(key: string): void {
    if (flag(`maria:${key}`)) return;
    remember(`maria:${key}`);
    this.mariaSay(key);
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

  /** Descongela el mundo un momento (los tweens van con world.timeScale) manteniendo los controles bloqueados. */
  private thaw(): void { this.world.timeScale = 1; }
  private freeze(): void { this.world.timeScale = 0; this.world.player.controlsLocked = true; }

  /** Premio directo (sobrevive a morir antes de recoger un orbe) con texto flotante. */
  private award(amount: number, at?: Pt): void {
    if (amount <= 0) return;
    addEcos(amount);
    sfx('conjuro_ok');
    const p = at ?? this.world.player;
    const text = this.world.scene.add.text(p.x, p.y - 36, `+${amount} Ecos`, {
      fontFamily: 'monospace', fontSize: '10px', color: '#f2c14e', stroke: '#0b0a14', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui - 1);
    this.world.scene.tweens.add({
      targets: text, y: p.y - 70, alpha: 0, duration: 1400, onComplete: () => text.destroy(),
    });
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
      console.warn('[ECOS] CdmxDirector: la secuencia falló', err);
    } finally {
      if (this.alive) {
        this.busy = false;
        // No restaurar un bloqueo ajeno: si la secuencia empezó mientras terminaba un conjuro (p. ej. el que
        // vence al jefe), el estado guardado era 'bloqueado / cámara lenta' y el jugador quedaba congelado.
        // Solo un conjuro en curso puede seguir bloqueando; Casting restaura lo suyo al terminar.
        const casting = GameState.casting;
        this.world.player.controlsLocked = casting ? this.saved.locked : false;
        this.world.timeScale = casting ? this.saved.scale : 1;
        this.refresh();
      }
    }
  }

  /* ========================= estado y prerrequisitos ========================= */

  private silentLearn(spellId: string): void {
    if (!GameState.learnedSpells.includes(spellId)) GameState.learnedSpells.push(spellId);
    GameState.mastery[spellId] ??= { level: 0, progress: 0 };
    const key = SPELL_FLAG[spellId];
    if (key) remember(key);
  }

  /** Entrada directa (?seccion=…) sin pasar por Oaxaca o por las secciones previas: prepara lo necesario. */
  private ensurePrerequisites(): void {
    if (!GameState.hasMaria) {
      console.warn('[ECOS] Nivel 6: entrada directa sin María; se prepara la entrada a la CDMX para pruebas.');
      prepareCdmxEntry();
      GameState.section = this.id as typeof GameState.section;
    }
    for (const spell of config.conjuros) if (this.knows(spell)) remember(SPELL_FLAG[spell]);
    if (this.id !== 'xochimilco' && !this.knows('FUEGO')) {
      console.warn('[ECOS] Nivel 6: entrada directa sin la ofrenda de Xochimilco; se concede FUEGO para pruebas.');
      this.silentLearn('FUEGO');
    }
    if (this.id === 'reforma') {
      for (const spell of ['DESCANSO', 'VERDAD']) {
        if (this.knows(spell)) continue;
        console.warn(`[ECOS] Nivel 6: entrada directa a Reforma sin ${spell}; se concede para pruebas.`);
        this.silentLearn(spell);
      }
    }
  }

  /** Enlaza cada enemigo creado por el mundo con su spec (mismo orden de level.enemies, sin grupo). */
  private indexEnemies(): void {
    const pool = [...this.world.enemies];
    this.world.level.enemies.forEach((spec, index) => {
      if (spec.group) return;
      let best: EnemyApi | undefined;
      let bestD = Infinity;
      for (const enemy of pool) {
        if (enemy.kind !== spec.type) continue;
        const d = Math.hypot(enemy.x - spec.x, enemy.y - spec.y);
        if (d < bestD) { best = enemy; bestD = d; }
      }
      if (!best || bestD > 60) return;
      pool.splice(pool.indexOf(best), 1);
      this.specOf.set(best, index);
    });
  }

  private sprite(name: string): Phaser.GameObjects.Sprite | null {
    const sprite = this.world.scene.children.getByName(name) as Phaser.GameObjects.Sprite | null;
    return sprite && typeof sprite.setVisible === 'function' ? sprite : null;
  }

  /** Quita a los enemigos ya derrotados antes de morir y restaura el decorado (habitantes tras la Nahuala). */
  private restoreWorld(): void {
    for (const [enemy, index] of [...this.specOf.entries()]) {
      if (!flag(`down:${this.id}:${index}`)) continue;
      this.specOf.delete(enemy);
      try {
        this.world.remove(enemy);
        enemy.destroy();
      } catch (err) {
        console.warn('[ECOS] no se pudo quitar a un enemigo ya derrotado', err);
      }
    }
    if (this.id === 'reforma') this.showHabitantes(flag('nahuala_fin'));
  }

  private showHabitantes(visible: boolean): void {
    for (const name of ['n06_habitante_a', 'n06_habitante_b']) this.sprite(name)?.setVisible(visible);
  }

  private markSpecDown(index: number): void {
    remember(`down:${this.id}:${index}`);
    const spec = this.world.level.enemies[index];
    if (spec?.type === 'nahual' && spec.id) remember(`nahual:${spec.id}:fin`);
  }

  private markDown(enemy: EnemyApi): void {
    const index = this.specOf.get(enemy);
    if (index !== undefined) this.markSpecDown(index);
    this.refresh();
  }

  private onRemoved(enemy: EnemyApi): void {
    if (!this.alive) return;
    // Muñecas rotas o liberadas, nahuales purificados: solo cuenta si de verdad salieron del mundo.
    // Una muñeca rota (láser/FUEGO) sale del mundo sin marcarse 'purified': igual cuenta como resuelta.
    if (enemy.kind === 'muneca' || (enemy.kind === 'nahual' && enemy.purified)) this.markDown(enemy);
  }

  private onExhausted(enemy: EnemyApi): void {
    if (!this.alive) return;
    if (enemy.kind === 'nahual' && !flag('tip_nahual_agotado')) {
      remember('tip_nahual_agotado');
      this.toast('El nahual está agotado: purifícalo con CALMA, LUZ o MEMORIA (Q) para quedarte con todos sus Ecos.', 6000);
    } else if (enemy.kind === 'nahuala' && !flag('tip_nahuala_agotada')) {
      remember('tip_nahuala_agotada');
      this.toast('La Nahuala quedó agotada: ahora solo CALMA (Q) la libera. No uses FUEGO contra ella.', 6500);
    }
  }

  /* ============================== nahuales ============================== */

  private nahualIdOf(it: Interactable): string | null {
    return typeof it.data?.nahualId === 'string' ? it.data.nahualId : null;
  }

  private onRevealed(id: string): void {
    if (!this.alive) return;
    this.revealed.add(id);
    this.revealing.delete(id);
    remember(`nahual:${id}:revelado`);
    if (this.talked.has(id)) {
      this.mariaOnce('nahual');
    } else if (!flag('tip_verdad_nahual')) {
      remember('tip_verdad_nahual');
      this.toast('VERDAD le arrancó el disfraz al nahual antes de que atacara: ahora pelea, pero sin zarpazo sorpresa.', 6000);
    }
    this.refresh();
  }

  private onFled(id: string): void {
    if (!this.alive) return;
    const index = this.world.level.enemies.findIndex((spec) => spec.id === id);
    if (index >= 0) this.markSpecDown(index);
    else remember(`nahual:${id}:fin`);
    this.revealed.add(id);
    this.revealing.delete(id);
    if (!flag('tip_huida')) {
      remember('tip_huida');
      this.toast('El nahual huyó herido y dejó parte de sus Ecos. Si lo agotas, puedes purificarlo y quedarte con todos.', 5500);
    }
    this.refresh();
  }

  /** Tras cerrar el diálogo (mundo ya descongelado) se desata la transformación con el zarpazo sorpresa. */
  private flushReveals(): void {
    if (!this.alive) return;
    const ids = this.pendingReveals.splice(0);
    for (const id of ids) {
      this.talked.add(id);
      bus.emit('nahual:reveal', { id, surprise: true });
    }
  }

  private async interactNahual(it: Interactable): Promise<void> {
    const id = this.nahualIdOf(it);
    if (!id || this.revealed.has(id) || this.revealing.has(id) || flag(`nahual:${id}:fin`)) return;
    const dialogue = it.data?.dialogue;
    if (typeof dialogue === 'string') await this.say(dialogue);
    if (!this.alive) return;
    this.revealing.add(id);
    this.pendingReveals.push(id);
  }

  /* ============================== HUD y objetivo ============================== */

  private find(action: string, pred: (it: Interactable) => boolean = () => true): Interactable | undefined {
    return this.world.level.interactables.find((it) => it.action === action && pred(it));
  }

  private triggerBy(pred: (t: LevelTrigger) => boolean): Pt | null {
    const t = this.world.level.triggers.find(pred);
    return t ? { x: t.x + t.w / 2, y: t.y + t.h * 0.55 } : null;
  }

  private triggerCenter(action: string): Pt | null { return this.triggerBy((t) => t.action === action); }

  private get grupos(): string[] { return config.emboscadas.grupos; }
  private groupsDone(): number { return this.grupos.filter((g) => flag(`emb:${g}`)).length; }

  private nahualSpecs(): Array<{ id: string; index: number; x: number; y: number }> {
    const out: Array<{ id: string; index: number; x: number; y: number }> = [];
    this.world.level.enemies.forEach((spec, index) => {
      if (spec.type === 'nahual' && spec.id) out.push({ id: spec.id, index, x: spec.x, y: spec.y });
    });
    return out;
  }

  private nahualesPending(): Array<{ id: string; x: number; y: number }> {
    return this.nahualSpecs().filter((n) => !flag(`nahual:${n.id}:fin`));
  }

  private habitantesCount(): number {
    return ['a', 'b'].filter((h) => flag(`habitante:${h}`)).length;
  }

  private status(): { text: string; target: Pt | null } {
    switch (this.id) {
      case 'xochimilco': {
        const head = `EMBOSCADAS ${this.groupsDone()}/${this.grupos.length}`;
        if (this.ambush) return { text: `${head}\n¡Muñecas! Rómpelas: láser rojo (2)${this.knows('FUEGO') ? ' o FUEGO' : ''}`, target: null };
        const emb = (g: string) => this.triggerBy((t) => t.action === 'emboscada' && t.data?.group === g);
        if (!flag('emb:muneca_a')) return { text: `${head}\nCruza los canales secos · cuidado con las muñecas`, target: emb('muneca_a') };
        if (!this.knows('FUEGO')) return { text: `${head}\nEnciende la ofrenda flotante: aprenderás FUEGO`, target: this.find('n06_fuego') ?? null };
        if (!flag('emb:muneca_b')) return { text: `${head}\nCruza la isla`, target: emb('muneca_b') };
        if (!flag('emb:muneca_c')) return { text: `${head}\nSigue hacia la gran ciudad`, target: emb('muneca_c') };
        return { text: `${head}\nSal de Xochimilco hacia las avenidas`, target: this.triggerCenter('ir_seccion') };
      }
      case 'avenidas': {
        const total = this.nahualSpecs().length;
        const head = `NAHUALES ${total - this.nahualesPending().length}/${total}`;
        if (!this.knows('DESCANSO')) return { text: `${head}\nReza ante la ofrenda grande: DESCANSO`, target: this.find('n06_descanso') ?? null };
        if (!this.knows('VERDAD')) return { text: `${head}\nHabla con Doña Refugio, la cronista: VERDAD`, target: this.find('n06_cronista') ?? null };
        const pending = this.nahualesPending();
        if (pending.length > 0) {
          const first = pending[0];
          const live = this.world.enemies.find((e) => e.kind === 'nahual' && e.alive && Math.hypot(e.x - first.x, e.y - first.y) < 400);
          return {
            text: `${head}\nNo todos los sobrevivientes son gente · Luna (F) y VERDAD`,
            target: live ? { x: live.x, y: live.y } : { x: first.x, y: first.y },
          };
        }
        return { text: `${head}\nSigue hacia Reforma`, target: this.triggerCenter('ir_seccion') };
      }
      case 'reforma': {
        if (flag('nahuala_fin')) {
          const head = `HABITANTES ${this.habitantesCount()}/2`;
          if (flag('habitantes_fin')) return { text: `${head}\nSube a la estación del teleférico`, target: this.find('n06_estacion') ?? null };
          const next = this.find('n06_habitante', (it) => !flag(`habitante:${String(it.data?.habitante)}`));
          return { text: `${head}\nHabla con los habitantes de Reforma`, target: next ?? null };
        }
        if (this.bossOn) return { text: 'LA NAHUALA\nVERDAD revela a la real · CALMA la libera cuando esté agotada', target: null };
        return { text: 'REFORMA\nSigue por la avenida hasta el Ángel caído', target: this.triggerCenter('nahuala_arena') };
      }
      default:
        return { text: '', target: null };
    }
  }

  private refresh(): void {
    if (!this.alive) return;
    const { text, target } = this.status();
    const locked = this.ambush !== null || this.bossOn;
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
    if (this.world.level.music) bus.emit('music', { track: this.world.level.music });
    if (this.id === 'xochimilco' && !flag('intro')) {
      await this.say('n06_intro');
      if (!this.alive) return;
      remember('intro');
    }
    this.ready = true;
    if (this.id === 'xochimilco' && !flag('maria_llegada')) {
      remember('maria_llegada');
      this.world.scene.time.delayedCall(2500, () => this.mariaSay('llegada'));
    }
    // Si murió o salió durante el cierre de la jefa, se retoma la escena final.
    if (this.id === 'reforma' && flag('nahuala') && !flag('nahuala_fin')) await this.nahualaFin();
  }

  private get anyLock(): boolean { return this.bossOn || this.ambush !== null; }

  private enabled(it: Interactable): boolean {
    if (!this.alive || !this.ready || this.busy || this.anyLock) return false;
    switch (it.action) {
      case 'n06_nahual': {
        const id = this.nahualIdOf(it);
        return !!id && !this.revealed.has(id) && !this.revealing.has(id) && !flag(`nahual:${id}:fin`);
      }
      case 'n06_premio': return !flag(`premio:${it.id}`);
      case 'n06_habitante': return flag('nahuala_fin');
      case 'n06_estacion': return flag('habitantes_fin');
      case 'n06_examinar':
      case 'altar':
      case 'n06_fuego':
      case 'n06_descanso':
      case 'n06_cronista':
        return true;
      default:
        return false;
    }
  }

  private tick(): void {
    if (!this.alive) return;
    this.updateBarrier();
    if (this.ambush) this.checkAmbush();
    if (this.bossOn) this.checkBossFallback();
    this.refresh();
  }

  /** Muros invisibles: sin FUEGO la isla no sigue (xochimilco) y sin VERDAD no se pasa a los nahuales (avenidas). */
  private updateBarrier(): void {
    if (this.anyLock || this.leaving) return;
    let want: number | null = null;
    if (this.id === 'xochimilco') want = this.knows('FUEGO') ? null : config.gates.fuegoX;
    else if (this.id === 'avenidas') want = this.knows('VERDAD') ? null : config.gates.verdadX;
    if (want !== this.barrier) {
      this.barrier = want;
      if (want === null) this.world.unlockArena();
      else this.world.lockArena(0, want);
    }
    if (want !== null && this.world.player.x > want - 70 && this.world.scene.time.now - this.lastHint > 9000) {
      this.lastHint = this.world.scene.time.now;
      this.toast(this.id === 'xochimilco'
        ? 'Antes de seguir, enciende la ofrenda flotante: el fuego guía a los muertos y rompe a las muñecas.'
        : 'Antes de seguir, habla con Doña Refugio, la cronista: te enseñará a descubrir a los nahuales.');
    }
  }

  /* ============================== triggers ============================== */

  private async onTrigger(t: LevelTrigger): Promise<void> {
    if (!this.alive || this.leaving) return;
    const data = t.data ?? {};
    switch (t.action) {
      case 'letras': {
        bus.emit('zone:name', {
          title: String(data.title ?? 'CDMX'), subtitle: typeof data.subtitle === 'string' ? data.subtitle : undefined,
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
        if (typeof data.maria === 'string') this.mariaOnce(data.maria);
        break;
      }
      case 'punto': {
        const spawn = typeof data.spawn === 'string' ? this.world.level.spawns?.[data.spawn] : undefined;
        if (spawn && !flag(`punto:${t.id}`)) {
          remember(`punto:${t.id}`);
          this.checkpoint(spawn);
          this.toast('Punto de control: la Nahuala espera más adelante. Prepara VERDAD y CALMA.', 5500);
        }
        break;
      }
      case 'emboscada':
        await this.startAmbush(data);
        break;
      case 'ir_seccion':
        await this.leaveSection(data);
        break;
      case 'nahuala_arena':
        await this.startBoss(data);
        break;
    }
  }

  private async leaveSection(data: Record<string, unknown>): Promise<void> {
    const section = data.section;
    if (typeof section !== 'string') return;
    const requires = typeof data.requires === 'string' ? data.requires : null;
    if (requires) {
      const ok = requires === 'fuego' ? this.knows('FUEGO') : flag(requires);
      if (!ok) {
        this.toast('Todavía no: antes enciende la ofrenda flotante y aprende FUEGO.');
        return;
      }
    }
    if (!this.ready || this.anyLock) return;
    this.leaving = true;
    if (!this.alive) return;
    remember(`salida:${this.id}`);
    this.world.gotoSection(section as Parameters<WorldApi['gotoSection']>[0],
      typeof data.spawn === 'string' ? data.spawn : undefined);
  }

  /* ============================== emboscadas (muñecas) ============================== */

  private async startAmbush(data: Record<string, unknown>): Promise<void> {
    const group = data.group;
    if (!this.alive || !this.ready || typeof group !== 'string') return;
    if (flag(`emb:${group}`) || this.anyLock || this.leaving) return;
    const x0 = typeof data.x0 === 'number' ? data.x0 : 0;
    const x1 = typeof data.x1 === 'number' ? data.x1 : this.world.level.width;
    this.ambush = { group, x0, x1, start: this.world.scene.time.now, seen: false };
    this.barrier = null;
    this.world.lockArena(x0, x1);
    bus.emit('arena:start', { group });
    sfx('chaneque_risa');
    if (!flag('tip_muneca')) {
      remember('tip_muneca');
      this.toast('¡Muñecas poseídas! No son seres del folclor: sí puedes destruirlas. Láser rojo (2) o disparos.', 6500);
    } else if (this.knows('FUEGO') && !flag('tip_muneca_fuego')) {
      remember('tip_muneca_fuego');
      this.toast('FUEGO (Q) destruye muñecas en línea. DESCANSO libera el alma atrapada sin romperlas.', 6000);
    }
    this.refresh();
  }

  private checkAmbush(): void {
    const a = this.ambush;
    if (!a) return;
    const alive = this.world.enemies.filter((e) => e.group === a.group && e.alive && !e.purified);
    if (alive.length > 0) a.seen = true;
    const elapsed = this.world.scene.time.now - a.start;
    if (elapsed < config.emboscadas.minMs || alive.length > 0) return;
    if (a.seen || elapsed > config.emboscadas.respaldoMs) this.endAmbush();
  }

  private endAmbush(): void {
    const a = this.ambush;
    if (!a) return;
    this.ambush = null;
    remember(`emb:${a.group}`);
    this.barrier = null;
    this.world.unlockArena();
    bus.emit('arena:clear', { group: a.group });
    this.award(config.rewards.emboscada);
    if (this.groupsDone() >= this.grupos.length) {
      this.toast('Las muñecas callan. Al norte se levanta la Ciudad de México.', 5500);
      this.world.scene.time.delayedCall(1800, () => this.mariaSay('ciudad'));
    } else {
      this.toast('Las muñecas quedan inertes.', 2500);
    }
    this.refresh();
  }

  /* ============================== interacciones ============================== */

  private async interact(it: Interactable): Promise<void> {
    switch (it.action) {
      case 'n06_examinar': {
        const dialogue = it.data?.dialogue;
        if (typeof dialogue === 'string') await this.say(dialogue);
        if (!this.alive) return;
        this.discover(it.data?.descubrimiento, it);
        if (typeof it.data?.maria === 'string') this.mariaOnce(it.data.maria);
        break;
      }
      case 'altar': {
        GameState.hp = GameState.maxHp;
        this.checkpoint(this.world.level.spawns?.altar ?? { x: it.x, y: it.y + 28 });
        sfx('altar');
        const sm = this.world.scene.scene;
        // El menú reanuda Level y requiere que el bloqueo ya esté restaurado.
        this.world.player.controlsLocked = GameState.casting ? this.saved.locked : false;
        sm.launch('Altar', { section: this.world.level.id, x: it.x, y: it.y });
        sm.bringToTop('Altar');
        sm.pause();
        break;
      }
      case 'n06_fuego':
        await this.aprender(it, 'FUEGO', 'n06_fuego', 'n06_fuego_fin', 'n06_fuego_repite', 'fuego',
          'FUEGO (Q): daño fuerte en línea. Destruye muñecas y deja inconscientes a los encapuchados. No lo uses contra la Nahuala.');
        break;
      case 'n06_descanso':
        await this.aprender(it, 'DESCANSO', 'n06_ofrenda', 'n06_descanso_fin', 'n06_descanso_repite', 'descanso',
          'DESCANSO (Q): libera el alma atrapada en una muñeca poseída, sin violencia.');
        break;
      case 'n06_cronista':
        await this.cronista(it);
        break;
      case 'n06_nahual':
        await this.interactNahual(it);
        break;
      case 'n06_premio':
        await this.premio(it);
        break;
      case 'n06_habitante':
        await this.habitante(it);
        break;
      case 'n06_estacion':
        await this.salida();
        break;
    }
  }

  private discover(key: unknown, at: Pt): void {
    if (typeof key !== 'string' || flag(`desc:${key}`)) return;
    remember(`desc:${key}`);
    this.award(config.rewards.descubrimiento, at);
  }

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
        // Casting restaura el tiempo al terminar; el diálogo final se vuelve a congelar.
        this.freeze();
      }
    }
    return this.knows(spellId);
  }

  /** Ofrenda que enseña un conjuro (FUEGO en Xochimilco, DESCANSO en las avenidas). */
  private async aprender(it: Interactable, spellId: string, intro: string, fin: string, repite: string,
    key: string, tip: string): Promise<void> {
    if (this.knows(spellId)) { await this.say(repite); return; }
    await this.say(intro);
    if (!this.alive) return;
    if (!(await this.teach(spellId)) || !this.alive) return;
    remember(key);
    this.award(config.rewards.conjuro, it);
    await this.say(fin);
    if (!this.alive) return;
    this.toast(tip, 6500);
    this.mariaOnce(key);
  }

  private async cronista(it: Interactable): Promise<void> {
    if (this.knows('VERDAD')) { await this.say('n06_cronista_repite'); return; }
    await this.say('n06_cronista');
    if (!this.alive) return;
    if (!(await this.teach('VERDAD')) || !this.alive) return;
    remember('verdad');
    this.award(config.rewards.conjuro, it);
    await this.say('n06_verdad_fin');
    if (!this.alive) return;
    if (!flag('tip_nahual')) {
      remember('tip_nahual');
      this.toast('Con Luna (F) puedes ver la sombra de los nahuales disfrazados; VERDAD los descubre', 7000);
    }
  }

  /** Cornisas y escombros altos (doble salto): Ecos una sola vez y una pista. */
  private async premio(it: Interactable): Promise<void> {
    const dialogue = it.data?.dialogue;
    if (typeof dialogue === 'string') await this.say(dialogue);
    if (!this.alive || flag(`premio:${it.id}`)) return;
    remember(`premio:${it.id}`);
    this.award(config.rewards.premio, it);
  }

  /* ============================== Reforma: la Nahuala y el cierre ============================== */

  private async startBoss(data: Record<string, unknown>): Promise<void> {
    if (!this.alive || !this.ready || flag('nahuala') || this.anyLock || this.leaving) return;
    if (!flag('nahuala_intro')) {
      await this.run(async () => {
        await this.say('n06_nahuala_intro');
        if (this.alive) remember('nahuala_intro');
      });
    }
    if (!this.alive || flag('nahuala') || this.anyLock) return;
    const group = typeof data.group === 'string' ? data.group : config.arena.grupo;
    const x0 = typeof data.x0 === 'number' ? data.x0 : config.arena.x0;
    const x1 = typeof data.x1 === 'number' ? data.x1 : config.arena.x1;
    this.bossOn = true;
    this.bossSeen = false;
    this.arenaStart = this.world.scene.time.now;
    this.barrier = null;
    this.world.lockArena(x0, x1);
    if (this.knows('VERDAD')) GameState.selectedSpell = 'VERDAD';
    bus.emit('music', { track: config.arena.musicaJefe });
    bus.emit('arena:start', { group });
    this.toast('La Nahuala: VERDAD disipa sus copias y revela a la real. Esquiva los círculos de obsidiana. Al final, CALMA.', 7500);
    this.refresh();
  }

  /** Respaldo: si la jefa nunca aparece (enemigo aún no integrado) el nivel no se queda atascado. */
  private checkBossFallback(): void {
    const boss = this.world.enemies.find((e) => e.kind === 'nahuala');
    if (boss) { this.bossSeen = true; return; }
    if (!this.bossSeen && this.world.scene.time.now - this.arenaStart > config.respaldoJefeMs) {
      console.warn('[ECOS] La Nahuala no apareció: se da la jefa por calmada (respaldo).');
      void this.nahualaCalmada();
    }
  }

  private async nahualaCalmada(): Promise<void> {
    if (!this.alive || flag('nahuala')) return;
    remember('nahuala');
    this.bossOn = false;
    this.barrier = null;
    this.world.unlockArena();
    bus.emit('arena:clear', { group: config.arena.grupo });
    bus.emit('music', { track: config.arena.musicaCalle });
    this.refresh();
    await this.wait(1200);
    if (!this.alive) return;
    await this.run(() => this.nahualaFin());
  }

  /** Cierre de la jefa: la mujer liberada y la salida de los verdaderos habitantes. */
  private async nahualaFin(): Promise<void> {
    if (!this.alive || flag('nahuala_fin')) return;
    const world = this.world;
    await this.say('n06_nahuala_fin');
    if (!this.alive) return;
    this.thaw();
    world.flash(0xcfe8ff, 800);
    world.shake(0.004, 600);
    sfx('aprender');
    this.showHabitantes(true);
    await this.wait(900);
    if (!this.alive) return;
    this.freeze();
    remember('nahuala_fin');
    this.mariaSay('jefa');
    this.toast('La Nahuala quedó libre. Los habitantes de Reforma salen de sus escondites: habla con ellos.', 6000);
    this.refresh();
  }

  private async habitante(it: Interactable): Promise<void> {
    const which = String(it.data?.habitante);
    if (which !== 'a' && which !== 'b') return;
    await this.say(`n06_habitante_${which}`);
    if (!this.alive) return;
    if (!flag(`habitante:${which}`)) {
      remember(`habitante:${which}`);
      this.award(config.rewards.habitante, it);
    }
    if (this.habitantesCount() >= 2 && !flag('habitantes_fin')) {
      await this.say('n06_habitantes_fin');
      if (!this.alive) return;
      remember('habitantes_fin');
      this.mariaSay('rey');
      this.toast('Sube a la estación del teleférico: ahí empieza el camino hacia el Rey del Olvido.', 6000);
    }
  }

  private async salida(): Promise<void> {
    if (!flag('habitantes_fin')) { this.toast('Antes habla con los habitantes de Reforma.'); return; }
    await this.say('n06_estacion');
    if (!this.alive) return;
    remember('completo');
    this.award(config.rewards.estacion);
    this.leaving = true;
    this.mariaSay('final');
    await this.wait(1800);
    if (!this.alive) return;
    // Continúa al Nivel 7: el teleférico hacia el Rey del Olvido.
    prepareCdmx2Entry();
    this.world.gotoSection('teleferico');
  }
}
