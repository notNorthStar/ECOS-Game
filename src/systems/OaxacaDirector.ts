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
import config from '../data/oaxaca.json';
import { prepareOaxacaEntry } from './Campaign';

/**
 * Director del Nivel 4 · Oaxaca (dueño: contenido). Maneja las tres secciones del nivel
 * (oaxaca → callejones → santo_domingo) con un switch por world.level.id, siguiendo el patrón de
 * CatemacoDirector: todo el progreso vive en GameState.flags con prefijo `n04:` y sobrevive a la muerte.
 *
 * Actions de interactuables: n04_examinar · altar · n04_artesano · n04_juguetes · n04_muro · n04_fragmento · n04_salida.
 * Actions de triggers: letras · dialogo · ir_seccion · bruja_arena.
 */

const flag = (key: string) => !!GameState.flags[`n04:${key}`];
const remember = (key: string) => { GameState.flags[`n04:${key}`] = true; };

type Pt = { x: number; y: number };
type MariaApiExtra = { mariaSay?: (text: string, ms?: number) => void; wakeMaria?: (x?: number, y?: number) => void };
type MariaLine = { text: string; ms?: number };

const TITULOS: Record<string, { title: string; subtitle: string }> = {
  oaxaca: { title: 'OAXACA', subtitle: 'Los tejidos de la memoria' },
  callejones: { title: 'CALLEJONES', subtitle: 'El mercado arruinado' },
  santo_domingo: { title: 'SANTO DOMINGO', subtitle: 'Las ruinas fortificadas' },
};
const FRAGMENTO_FALLBACK = '__n04_fragmento';

/** Instala el director de la sección actual de Oaxaca. */
export function installOaxacaDirector(world: WorldApi): void {
  new OaxacaDirector(world);
}

class OaxacaDirector {
  private alive = true;
  private ready = false;
  private busy = false;
  private leaving = false;
  private arenaOn = false;
  private bossSeen = false;
  private revealing = false;
  private arenaStart = 0;
  private barrier: number | null = null;
  private lastHint = -99999;
  private saved = { locked: false, scale: 1 };
  private queue: Promise<void> = Promise.resolve();
  private lastSignature = '';
  private counter: Phaser.GameObjects.Text;
  /** Enemigo en escena → índice de su spec en level.enemies (para recordar a los derrotados). */
  private specOf = new Map<EnemyApi, number>();

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
      if (it && this.enabled(it)) void this.run(() => this.interact(it));
    });
    bus.scoped(scene, 'trigger:enter', ({ trigger }) => void this.onTrigger(trigger));
    bus.scoped(scene, 'cofradia:down', ({ enemy }) => this.markDown(enemy));
    bus.scoped(scene, 'enemy:purified', ({ enemy }) => this.markDown(enemy));
    bus.scoped(scene, 'enemy:exhausted', ({ enemy }) => this.onExhausted(enemy));
    bus.scoped(scene, 'enemy:removed', ({ enemy }) => this.onRemoved(enemy));
    bus.scoped(scene, 'boss:calmed', () => void this.brujaCalmada());
    bus.scoped(scene, 'boss:vulnerable', ({ on }) => {
      if (on && !flag('tip_ventana')) {
        remember('tip_ventana');
        this.toast('¡Se queda sin defensas! Ataca con el conjuro que le duele: LUZ (humana), SOL (ave) o MEMORIA.');
      }
    });
    bus.scoped(scene, 'bruja:form', ({ form }) => this.onForm(form));

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
      console.warn('[ECOS] OaxacaDirector: la secuencia falló', err);
    } finally {
      if (this.alive) {
        this.busy = false;
        this.world.player.controlsLocked = this.saved.locked;
        this.world.timeScale = this.saved.scale;
        this.refresh();
      }
    }
  }

  /* ========================= estado y prerrequisitos ========================= */

  private silentLearn(spellId: string): void {
    if (!GameState.learnedSpells.includes(spellId)) GameState.learnedSpells.push(spellId);
    GameState.mastery[spellId] ??= { level: 0, progress: 0 };
  }

  /** Entrada directa (?seccion=…) sin pasar por Catemaco o los artesanos: prepara lo necesario. */
  private ensurePrerequisites(): void {
    if (!GameState.hasMaria) {
      console.warn('[ECOS] Nivel 4: entrada directa sin María; se prepara la entrada a Oaxaca para pruebas.');
      prepareOaxacaEntry();
      GameState.section = this.id as typeof GameState.section;
    }
    if (this.id !== 'oaxaca' && !flag('memoria')) {
      console.warn('[ECOS] Nivel 4: entrada directa sin los artesanos; se concede MEMORIA para pruebas.');
      this.silentLearn('MEMORIA');
      GameState.selectedSpell = 'MEMORIA';
      for (const a of config.artesanos) remember(`artesano:${a}`);
      remember('memoria');
    }
    if (this.id === 'santo_domingo' && !flag('pasaje')) remember('pasaje');
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

  private muro(): Phaser.GameObjects.Sprite | null {
    const sprite = this.world.scene.children.getByName(config.pasaje.muroId) as Phaser.GameObjects.Sprite | null;
    return sprite && typeof sprite.setTexture === 'function' ? sprite : null;
  }

  private openWallVisual(animate: boolean): void {
    const sprite = this.muro();
    if (!sprite) return;
    const scene = this.world.scene;
    if (scene.textures.exists(config.pasaje.texturaAbierta)) sprite.setTexture(config.pasaje.texturaAbierta);
    else if (animate) scene.tweens.add({ targets: sprite, alpha: 0.35, duration: 900 });
    else sprite.setAlpha(0.35);
  }

  /** Fragmento del Sello: oculto hasta vencer a la Bruja; fallback dibujado si falta la textura. */
  private fragmento(): Phaser.GameObjects.Sprite | null {
    const sprite = this.world.scene.children.getByName('n04_fragmento') as Phaser.GameObjects.Sprite | null;
    return sprite && typeof sprite.setVisible === 'function' ? sprite : null;
  }

  /** Quita a los enemigos ya derrotados antes de morir y restaura el decorado (muro, fragmento). */
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
    if (this.id === 'callejones' && flag('pasaje')) this.openWallVisual(false);
    if (this.id === 'santo_domingo') {
      const frag = this.fragmento();
      if (frag) frag.setVisible(flag('bruja') && !flag('fragmento'));
    }
  }

  private markDown(enemy: EnemyApi): void {
    const index = this.specOf.get(enemy);
    if (index !== undefined) remember(`down:${this.id}:${index}`);
    this.refresh();
    this.checkPasaje();
  }

  private onRemoved(enemy: EnemyApi): void {
    if (!this.alive) return;
    if (enemy.kind === 'bestia' && enemy.purified) this.markDown(enemy);
    if (enemy.kind === 'bruja_guajolote' && enemy.purified) void this.brujaCalmada();
  }

  private onExhausted(enemy: EnemyApi): void {
    if (!this.alive || enemy.kind !== 'bestia' || flag('tip_agotada')) return;
    remember('tip_agotada');
    this.toast(flag('memoria')
      ? 'La bestia está agotada: purifícala con MEMORIA (Q).'
      : 'La bestia está agotada, pero aún no sabes cómo liberarla: pregunta a los artesanos.');
  }

  /* ============================== HUD y objetivo ============================== */

  private find(action: string, pred: (it: Interactable) => boolean = () => true): Interactable | undefined {
    return this.world.level.interactables.find((it) => it.action === action && pred(it));
  }

  private triggerCenter(action: string): Pt | null {
    const t = this.world.level.triggers.find((entry) => entry.action === action);
    return t ? { x: t.x + t.w / 2, y: t.y + t.h * 0.55 } : null;
  }

  private get artesanosCount(): number {
    return config.artesanos.filter((id) => flag(`artesano:${id}`)).length;
  }

  /** Specs de bestias que forman el grupo del pasaje (callejones, x entre pasaje.x0 y pasaje.x1). */
  private pasajeSpecs(): Array<{ index: number; x: number; y: number }> {
    const { x0, x1 } = config.pasaje;
    const out: Array<{ index: number; x: number; y: number }> = [];
    this.world.level.enemies.forEach((spec, index) => {
      if (spec.type === 'bestia' && !spec.group && spec.x >= x0 && spec.x <= x1) out.push({ index, x: spec.x, y: spec.y });
    });
    return out;
  }

  private pasajeRemaining(): number {
    return this.pasajeSpecs().filter((s) => !flag(`down:callejones:${s.index}`)).length;
  }

  private pasajeTarget(): Pt | null {
    const alive = this.world.enemies.filter((e) => e.kind === 'bestia' && e.alive && !e.purified &&
      e.x >= config.pasaje.x0 && e.x <= config.pasaje.x1);
    if (alive.length > 0) {
      const first = alive.reduce((a, b) => (a.x <= b.x ? a : b));
      return { x: first.x, y: first.y };
    }
    const spec = this.pasajeSpecs().find((s) => !flag(`down:callejones:${s.index}`));
    return spec ? { x: spec.x, y: spec.y } : null;
  }

  private status(): { text: string; target: Pt | null } {
    switch (this.id) {
      case 'oaxaca': {
        const head = `ARTESANOS ${this.artesanosCount}/${config.artesanos.length}`;
        const art = (who: string) => this.find('n04_artesano', (it) => it.data?.artesano === who) ?? null;
        if (!flag('artesano:gudelia')) return { text: `${head}\nHabla con Doña Gudelia, en el taller`, target: art('gudelia') };
        if (!flag('artesano:facundo')) return { text: `${head}\nDon Facundo conoce a las bestias`, target: art('facundo') };
        if (!flag('artesano:lucrecia')) return { text: `${head}\nDoña Lucrecia te enseñará MEMORIA`, target: art('lucrecia') };
        return { text: `${head}\nSigue la calle hacia los callejones · MEMORIA purifica bestias`, target: this.triggerCenter('ir_seccion') };
      }
      case 'callejones': {
        const total = this.pasajeSpecs().length;
        const left = this.pasajeRemaining();
        const head = `MURO ${flag('pasaje') ? total : total - left}/${total}`;
        if (flag('pasaje')) return { text: `${head}\nEntra al pasaje hacia Santo Domingo`, target: this.triggerCenter('ir_seccion') };
        return { text: `${head}\nPurifica con MEMORIA a las bestias junto al muro`, target: this.pasajeTarget() };
      }
      case 'santo_domingo': {
        const head = 'TEMPLO DE SANTO DOMINGO';
        if (flag('fragmento')) return { text: `${head}\nE en la salida: camino a la CDMX`, target: this.find('n04_salida') ?? null };
        if (flag('bruja')) return { text: `${head}\nToma los fragmentos del Sello`, target: this.find('n04_fragmento') ?? null };
        if (this.arenaOn) return { text: `${head}\nBruja Guajolote: LUZ en forma humana, SOL en ave`, target: null };
        return { text: `${head}\nEntra al interior dorado`, target: this.triggerCenter('bruja_arena') };
      }
      default:
        return { text: '', target: null };
    }
  }

  private refresh(): void {
    if (!this.alive) return;
    const { text, target } = this.status();
    const objective = target && !this.arenaOn ? { x: target.x, y: target.y, section: this.world.level.id } : null;
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
    if (this.id === 'oaxaca' && !flag('intro')) {
      await this.say('n04_intro');
      if (!this.alive) return;
      remember('intro');
    }
    this.ready = true;
    if (this.id === 'oaxaca' && !flag('maria_llegada')) {
      remember('maria_llegada');
      this.world.scene.time.delayedCall(2500, () => this.mariaSay('llegada'));
    }
    // Si murió o salió durante el cierre de la jefa, se retoma la escena final.
    if (this.id === 'santo_domingo' && flag('bruja') && !flag('bruja_fin')) await this.brujaFin();
  }

  private enabled(it: Interactable): boolean {
    if (!this.alive || !this.ready || this.busy || this.arenaOn) return false;
    switch (it.action) {
      case 'n04_fragmento': return flag('bruja') && !flag('fragmento');
      case 'n04_salida': return flag('fragmento');
      case 'n04_examinar':
      case 'altar':
      case 'n04_artesano':
      case 'n04_juguetes':
      case 'n04_muro':
        return true;
      default:
        return false;
    }
  }

  private tick(): void {
    if (!this.alive) return;
    this.updateBarrier();
    if (this.arenaOn) this.checkBossFallback();
    this.checkPasaje();
    this.refresh();
  }

  /** Muros invisibles: calle sin aprender MEMORIA y muro del pasaje sin revelar. */
  private updateBarrier(): void {
    if (this.arenaOn || this.leaving) return;
    let want: number | null = null;
    if (this.id === 'oaxaca') want = flag('memoria') ? null : config.gates.memoriaX;
    else if (this.id === 'callejones') want = flag('pasaje') ? null : config.gates.pasajeX;
    if (want !== this.barrier) {
      this.barrier = want;
      if (want === null) this.world.unlockArena();
      else this.world.lockArena(0, want);
    }
    if (want !== null && this.world.player.x > want - 70 && this.world.scene.time.now - this.lastHint > 9000) {
      this.lastHint = this.world.scene.time.now;
      this.toast(this.id === 'oaxaca'
        ? 'Antes de seguir, visita el taller de los artesanos: te enseñarán a liberar a las bestias.'
        : 'El muro sigue cerrado. Purifica con MEMORIA (Q) a las bestias de la calle.');
    }
  }

  /* ============================== triggers ============================== */

  private async onTrigger(t: LevelTrigger): Promise<void> {
    if (!this.alive || this.leaving) return;
    const data = t.data ?? {};
    switch (t.action) {
      case 'letras': {
        bus.emit('zone:name', {
          title: String(data.title ?? 'OAXACA'), subtitle: typeof data.subtitle === 'string' ? data.subtitle : undefined,
        });
        const cp = this.world.level.spawns?.checkpoint;
        if (cp && !flag(`letras_cp:${this.id}`)) {
          remember(`letras_cp:${this.id}`);
          this.checkpoint(cp);
          if (this.id === 'oaxaca') this.toast('Punto de control: letras de OAXACA');
        }
        break;
      }
      case 'dialogo': {
        const dialogue = data.dialogue;
        await this.run(async () => {
          if (typeof dialogue === 'string') await this.say(dialogue);
          if (typeof data.toast === 'string') this.toast(data.toast, 6000);
        });
        if (typeof data.maria === 'string' && !flag(`maria:${data.maria}`)) {
          remember(`maria:${data.maria}`);
          this.mariaSay(data.maria);
        }
        break;
      }
      case 'ir_seccion':
        await this.leaveSection(data);
        break;
      case 'bruja_arena':
        await this.startBoss(data);
        break;
    }
  }

  private async leaveSection(data: Record<string, unknown>): Promise<void> {
    const section = data.section;
    if (typeof section !== 'string') return;
    const requires = typeof data.requires === 'string' ? data.requires : null;
    if (requires && !flag(requires)) {
      this.toast(requires === 'memoria'
        ? 'Antes de seguir, aprende MEMORIA con los artesanos.'
        : 'El pasaje sigue cerrado: purifica a las bestias del muro con MEMORIA.');
      return;
    }
    if (!this.ready) return;
    this.leaving = true;
    if (!this.alive) return;
    remember(`salida:${this.id}`);
    this.world.gotoSection(section as Parameters<WorldApi['gotoSection']>[0],
      typeof data.spawn === 'string' ? data.spawn : undefined);
  }

  /* ============================== interacciones ============================== */

  private async interact(it: Interactable): Promise<void> {
    switch (it.action) {
      case 'n04_examinar': {
        const dialogue = it.data?.dialogue;
        if (typeof dialogue === 'string') await this.say(dialogue);
        this.discover(it.data?.descubrimiento, it);
        break;
      }
      case 'altar': {
        GameState.hp = GameState.maxHp;
        this.checkpoint(this.world.level.spawns?.altar ?? { x: it.x, y: it.y + 28 });
        sfx('altar');
        const sm = this.world.scene.scene;
        // El menú reanuda Level y requiere que el bloqueo ya esté restaurado.
        this.world.player.controlsLocked = this.saved.locked;
        sm.launch('Altar', { section: this.world.level.id, x: it.x, y: it.y });
        sm.bringToTop('Altar');
        sm.pause();
        break;
      }
      case 'n04_artesano':
        await this.artesano(it);
        break;
      case 'n04_juguetes':
        await this.juguetes(it);
        break;
      case 'n04_muro':
        await this.say(flag('pasaje') ? 'n04_muro_abierto' : 'n04_muro_cerrado');
        break;
      case 'n04_fragmento':
        await this.tomarFragmento(it);
        break;
      case 'n04_salida':
        await this.salida();
        break;
    }
  }

  private discover(key: unknown, at: Pt): void {
    if (typeof key !== 'string' || flag(`desc:${key}`)) return;
    remember(`desc:${key}`);
    this.award(config.rewards.descubrimiento, at);
  }

  /* --------------------------------- artesanos --------------------------------- */

  /** Enseña un conjuro con el aprendizaje guiado; si aún no existe en spells.json lo concede con aviso. */
  private async teach(spellId: string): Promise<boolean> {
    if (!GameState.learnedSpells.includes(spellId)) {
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
    return GameState.learnedSpells.includes(spellId);
  }

  private async artesano(it: Interactable): Promise<void> {
    const kind = String(it.data?.artesano);
    if (kind === 'gudelia') {
      if (flag('artesano:gudelia')) { await this.say('n04_gudelia_repite'); return; }
      await this.say('n04_gudelia');
      if (!this.alive) return;
      remember('artesano:gudelia');
      this.award(config.rewards.artesano, it);
    } else if (kind === 'facundo') {
      if (!flag('artesano:gudelia')) { await this.say('n04_facundo_pendiente'); return; }
      if (flag('artesano:facundo')) { await this.say('n04_facundo_repite'); return; }
      await this.say('n04_facundo');
      if (!this.alive) return;
      remember('artesano:facundo');
      this.award(config.rewards.artesano, it);
    } else if (kind === 'lucrecia') {
      if (!flag('artesano:gudelia') || !flag('artesano:facundo')) { await this.say('n04_lucrecia_pendiente'); return; }
      if (flag('artesano:lucrecia')) { await this.say('n04_lucrecia_repite'); return; }
      await this.say('n04_lucrecia');
      if (!this.alive) return;
      if (!(await this.teach('MEMORIA')) || !this.alive) return;
      remember('artesano:lucrecia');
      remember('memoria');
      this.award(config.rewards.artesano + config.rewards.memoria, it);
      await this.say('n04_memoria_fin');
      if (this.alive) this.toast('Las bestias se purifican con MEMORIA (Q). El láser rojo las agota antes.', 6000);
    }
  }

  /* ---------------------------------- callejones ---------------------------------- */

  /** Juguetes y ropa de niños: Ecos una vez y un comentario de María desde su angustia. */
  private async juguetes(it: Interactable): Promise<void> {
    const dialogue = it.data?.dialogue;
    if (typeof dialogue === 'string') await this.say(dialogue);
    if (!this.alive) return;
    const key = typeof it.data?.descubrimiento === 'string' ? it.data.descubrimiento : it.id;
    if (!flag(`desc:${key}`)) {
      remember(`desc:${key}`);
      this.award(config.rewards.juguetes, it);
    }
    const maria = it.data?.maria;
    if (typeof maria === 'string' && !flag(`maria:${maria}`)) {
      remember(`maria:${maria}`);
      this.mariaSay(maria);
    }
  }

  /** Comprueba si las bestias del grupo del pasaje ya fueron purificadas y, si sí, lo revela. */
  private checkPasaje(): void {
    if (!this.alive || this.id !== 'callejones' || flag('pasaje') || this.revealing) return;
    if (this.pasajeSpecs().length === 0 || this.pasajeRemaining() > 0) return;
    this.revealing = true;
    void this.run(() => this.revelarPasaje());
  }

  private async revelarPasaje(): Promise<void> {
    if (!this.alive || flag('pasaje')) return;
    const world = this.world;
    remember('pasaje');
    this.barrier = null;
    world.unlockArena();
    this.thaw();
    world.flash(0xf2c14e, 700);
    world.shake(0.005, 900);
    sfx('aprender');
    this.openWallVisual(true);
    bus.emit('pasaje:revealed', { id: config.pasaje.id });
    await this.wait(900);
    if (!this.alive) return;
    this.freeze();
    await this.say('n04_pasaje');
    if (!this.alive) return;
    this.award(config.rewards.pasaje);
    const cp = world.level.spawns?.pasaje;
    if (cp) this.checkpoint(cp);
    this.toast('El pasaje oculto está abierto: sigue hacia el corazón de la ciudad.', 5500);
  }

  /* ---------------------------------- templo y jefa ---------------------------------- */

  private async startBoss(data: Record<string, unknown>): Promise<void> {
    if (!this.alive || !this.ready || flag('bruja') || this.arenaOn || this.leaving) return;
    if (!flag('bruja_intro')) {
      await this.run(async () => {
        await this.say('n04_bruja_intro');
        if (this.alive) remember('bruja_intro');
      });
    }
    if (!this.alive || flag('bruja') || this.arenaOn) return;
    const group = typeof data.group === 'string' ? data.group : config.arena.grupo;
    const x0 = typeof data.x0 === 'number' ? data.x0 : config.arena.x0;
    const x1 = typeof data.x1 === 'number' ? data.x1 : config.arena.x1;
    this.arenaOn = true;
    this.bossSeen = false;
    this.arenaStart = this.world.scene.time.now;
    this.barrier = null;
    this.world.lockArena(x0, x1);
    if (GameState.learnedSpells.includes('LUZ')) GameState.selectedSpell = 'LUZ';
    bus.emit('music', { track: config.arena.musicaJefe });
    bus.emit('arena:start', { group });
    this.toast('Bruja Guajolote: LUZ en forma humana, SOL en forma de ave. MEMORIA le duele en las dos.', 7000);
    this.refresh();
  }

  private onForm(form: 'humana' | 'ave'): void {
    if (!this.alive || !this.arenaOn) return;
    this.bossSeen = true;
    if (form === 'humana' && !flag('tip_humana')) {
      remember('tip_humana');
      this.toast('Forma humana: devuelve su fuego con el escudo (clic derecho) y úsale LUZ (Q).', 6000);
    } else if (form === 'ave' && !flag('tip_ave')) {
      remember('tip_ave');
      this.toast('Forma de ave: esquiva sus embestidas y los charcos de fuego. SOL (Q) la debilita.', 6000);
    }
  }

  /** Respaldo: si la jefa nunca aparece (enemigo aún no integrado) el nivel no se queda atascado. */
  private checkBossFallback(): void {
    const boss = this.world.enemies.find((e) => e.kind === 'bruja_guajolote');
    if (boss) { this.bossSeen = true; return; }
    if (!this.bossSeen && this.world.scene.time.now - this.arenaStart > config.respaldoJefeMs) {
      console.warn('[ECOS] La Bruja Guajolote no apareció: se da la jefa por calmada (respaldo).');
      void this.brujaCalmada();
    }
  }

  private async brujaCalmada(): Promise<void> {
    if (!this.alive || flag('bruja')) return;
    remember('bruja');
    this.arenaOn = false;
    this.barrier = null;
    this.world.unlockArena();
    bus.emit('arena:clear', { group: config.arena.grupo });
    bus.emit('music', { track: config.arena.musicaTemplo });
    this.refresh();
    await this.wait(1200);
    if (!this.alive) return;
    await this.run(() => this.brujaFin());
  }

  private ensureFragmentoVisual(): Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc | null {
    const frag = this.fragmento();
    if (frag) return frag;
    const scene = this.world.scene;
    const it = this.find('n04_fragmento');
    if (!it) return null;
    // Respaldo dibujado si el prop no existe en el decorado.
    if (!scene.textures.exists(FRAGMENTO_FALLBACK)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xf2c14e, 1).fillCircle(8, 8, 7);
      g.fillStyle(0xfff0ce, 1).fillCircle(6, 6, 3);
      g.generateTexture(FRAGMENTO_FALLBACK, 16, 16);
      g.destroy();
    }
    const sprite = scene.add.sprite(it.x, it.y - 12, FRAGMENTO_FALLBACK).setOrigin(0.5, 1).setDepth(it.y);
    sprite.setName('n04_fragmento');
    return sprite as unknown as Phaser.GameObjects.Arc;
  }

  /** Cierre de la jefa: el fuego fatuo se apaga y aparecen el 2.º y el 3.er fragmentos del Sello. */
  private async brujaFin(): Promise<void> {
    if (!this.alive || flag('bruja_fin')) return;
    const world = this.world;
    await this.say('n04_bruja_fin');
    if (!this.alive) return;
    this.thaw();
    world.flash(0xcfe8ff, 900);
    world.shake(0.004, 700);
    sfx('aprender');
    const frag = this.ensureFragmentoVisual();
    if (frag) {
      frag.setVisible(true).setAlpha(0);
      world.scene.tweens.add({ targets: frag, alpha: 1, duration: 1200 });
    }
    await this.wait(1300);
    if (!this.alive) return;
    this.freeze();
    remember('bruja_fin');
    this.toast('Se apagó el fuego fatuo. El fragmento del Sello te espera: pulsa E.', 5500);
    this.refresh();
  }

  private async tomarFragmento(it: Interactable): Promise<void> {
    if (!flag('bruja') || flag('fragmento')) return;
    await this.say('n04_fragmento');
    if (!this.alive) return;
    remember('fragmento');
    // Decisión del equipo (2026-10-19): Puebla se omite y su fragmento (el 3.º) también se entrega aquí.
    GameState.flags['n04:fragmento_3'] = true;
    this.award(config.rewards.fragmento, it);
    sfx('aprender');
    const frag = this.fragmento();
    if (frag) this.world.scene.tweens.add({ targets: frag, alpha: 0, duration: 700, onComplete: () => frag.setVisible(false) });
    this.toast('2.º y 3.er fragmentos del Sello recuperados (3 de 6).', 5500);
    this.mariaSay('final');
    this.refresh();
  }

  private async salida(): Promise<void> {
    if (!flag('fragmento')) { this.toast('Aún falta recuperar el fragmento del Sello.'); return; }
    await this.say('n04_salida');
    if (!this.alive) return;
    remember('completo');
    // CDMX (Nivel 6) todavía no existe: se vuelve al título conservando el progreso.
    const sm = this.world.scene.scene;
    for (const key of ['Hud', 'Dialogue', 'Spell', 'Altar', 'Diario', 'Pause']) {
      if (sm.isActive(key) || sm.isPaused(key)) sm.stop(key);
    }
    bus.emit('music', { track: null });
    sm.start('Title');
  }
}
