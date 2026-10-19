import Phaser from 'phaser';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import type { EnemyApi, Hit, LevelTrigger, WorldApi } from '../core/contracts';
import { DEPTH } from '../config/game';
import { playDialogue } from '../scenes/DialogueScene';
import { getSpellDef, startLearning } from './Casting';
import { installInteract, type Interactable } from './Interact';
import { installLightTrail, setObjective } from './LightTrail';
import { addEcos } from './Progression';
import * as ShieldMod from './Shield';
import * as LunaMod from './Luna';
import config from '../data/catemaco.json';

/**
 * Director del Nivel 3 · Catemaco (dueño: contenido). Maneja las tres secciones del nivel
 * (catemaco → campamento → altar_olmeca) con un switch por world.level.id. Copia el patrón de
 * TuxtlaDirector: todo el progreso vive en GameState.flags con prefijo `n03:` y sobrevive a la muerte.
 *
 * Actions de interactuables: n03_examinar · altar · n03_brujo · n03_pista · n03_jaula · n03_salida.
 * Actions de triggers: letras · dialogo · ir_seccion · olmeca_arena.
 */

const flag = (key: string) => !!GameState.flags[`n03:${key}`];
const remember = (key: string) => { GameState.flags[`n03:${key}`] = true; };

type Pt = { x: number; y: number };
type ShieldApiExtra = { unlockShield?: (world: WorldApi) => void };
type LunaApiExtra = { unlockLuna?: (world: WorldApi) => void };

const TITULOS: Record<string, { title: string; subtitle: string }> = {
  catemaco: { title: 'CATEMACO', subtitle: 'El ritual del lago' },
  campamento: { title: 'LAGO DE CATEMACO', subtitle: 'Campamento de la Cofradía' },
  altar_olmeca: { title: 'ALTAR OLMECA', subtitle: 'La Cabeza dormida' },
};
const PALETA_ALEBRIJE = [0xff8a2a, 0x2ad8c8, 0xff4f9a, 0xf2c14e];
const GATO_FALLBACK = '__n03_gato';

interface Piedra {
  sprite: Phaser.GameObjects.Arc;
  sombra: Phaser.GameObjects.Ellipse;
  t: number;
  sx: number;
  sy: number;
  guardada: boolean;
}

/** Instala el director de la sección actual de Catemaco. */
export function installCatemacoDirector(world: WorldApi): void {
  new CatemacoDirector(world);
}

class CatemacoDirector {
  private alive = true;
  private ready = false;
  private busy = false;
  private leaving = false;
  private arenaOn = false;
  private bossSeen = false;
  private arenaStart = 0;
  private barrier: number | null = null;
  private lastHint = -99999;
  private saved = { locked: false, scale: 1 };
  private queue: Promise<void> = Promise.resolve();
  private lastSignature = '';
  private counter: Phaser.GameObjects.Text;
  /** Enemigo en escena → índice de su spec en level.enemies (para recordar a los derrotados). */
  private specOf = new Map<EnemyApi, number>();
  private clusterOf = new Map<EnemyApi, number>();

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
    bus.scoped(scene, 'enemy:removed', ({ enemy }) => this.onRemoved(enemy));
    bus.scoped(scene, 'boss:calmed', () => void this.cabezaCalmada());
    bus.scoped(scene, 'boss:vulnerable', ({ on }) => {
      if (on && !flag('tip_ventana')) {
        remember('tip_ventana');
        this.toast('¡Sus ojos se apagan! Ahora: LUZ, SOL o VOZ (Q). CALMA la enfurece.');
      }
    });
    bus.scoped(scene, 'olmeca:phase', ({ phase }) => this.onPhase(phase));
    bus.scoped(scene, 'luna:state', ({ active }) => { if (active) this.onLunaOn(); });

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
      console.warn('[ECOS] CatemacoDirector: la secuencia falló', err);
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

  private unlockShield(): void {
    const mod = ShieldMod as unknown as ShieldApiExtra;
    try { mod.unlockShield?.(this.world); } catch (err) { console.warn('[ECOS] unlockShield falló', err); }
    GameState.shield.unlocked = true;
  }

  private unlockLuna(): void {
    const mod = LunaMod as unknown as LunaApiExtra;
    try { mod.unlockLuna?.(this.world); } catch (err) { console.warn('[ECOS] unlockLuna falló', err); }
    GameState.luna.unlocked = true;
  }

  /** Entrar directo a campamento/altar (?seccion=…) sin pasar por los brujos o por Balam: prepara lo necesario. */
  private ensurePrerequisites(): void {
    if (this.id !== 'catemaco' && !flag('brujos_ok')) {
      console.warn('[ECOS] Nivel 3: entrada directa sin brujos; se conceden LUZ, SOL y escudo para pruebas.');
      this.silentLearn('LUZ');
      this.silentLearn('SOL');
      GameState.selectedSpell ??= 'LUZ';
      GameState.shield.unlocked = true;
      remember('brujos_ok');
    }
    if (this.id === 'altar_olmeca' && !GameState.hasBalam) {
      console.warn('[ECOS] Nivel 3: entrada directa sin Balam; se activa Luna para pruebas.');
      GameState.hasBalam = true;
      this.unlockLuna();
      remember('balam');
    }
  }

  /** Enlaza cada enemigo creado por el mundo con su spec (mismo orden de level.enemies, sin grupo). */
  private indexEnemies(): void {
    const pool = [...this.world.enemies];
    const gates = config.espiritus.gates;
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
      if (spec.type === 'espiritu') {
        const cluster = gates.findIndex((gate) => spec.x < gate);
        this.clusterOf.set(best, cluster < 0 ? gates.length - 1 : cluster);
      }
    });
  }

  /** Quita a los enemigos ya derrotados antes de morir y restaura el decorado (jaulas, María). */
  private restoreWorld(): void {
    for (const [enemy, index] of [...this.specOf.entries()]) {
      if (!flag(`down:${this.id}:${index}`)) continue;
      this.specOf.delete(enemy);
      this.clusterOf.delete(enemy);
      try {
        this.world.remove(enemy);
        enemy.destroy();
      } catch (err) {
        console.warn('[ECOS] no se pudo quitar a un enemigo ya derrotado', err);
      }
    }
    if (this.id === 'campamento') {
      for (const id of config.jaulas) if (flag(`jaula:${id}`)) this.openCageVisual(id);
    }
    if (this.id === 'altar_olmeca' && flag('maria')) this.spawnMaria(config.maria.llegaA, 300);
  }

  private markDown(enemy: EnemyApi): void {
    const index = this.specOf.get(enemy);
    if (index !== undefined) remember(`down:${this.id}:${index}`);
    this.refresh();
  }

  private onRemoved(enemy: EnemyApi): void {
    if (!this.alive) return;
    if (enemy.kind === 'cabeza_olmeca' && enemy.purified) void this.cabezaCalmada();
  }

  /* ============================== HUD y objetivo ============================== */

  private find(action: string, pred: (it: Interactable) => boolean = () => true): Interactable | undefined {
    return this.world.level.interactables.find((it) => it.action === action && pred(it));
  }

  private triggerCenter(action: string): Pt | null {
    const t = this.world.level.triggers.find((entry) => entry.action === action);
    return t ? { x: t.x + t.w / 2, y: t.y + t.h * 0.55 } : null;
  }

  private get pistasCount(): number {
    return config.pistas.filter((id) => flag(`pista:${id}`)).length;
  }
  private get jaulasCount(): number {
    return config.jaulas.filter((id) => flag(`jaula:${id}`)).length;
  }
  private get brujosCount(): number {
    return config.brujos.filter((id) => flag(`brujo:${id}`)).length;
  }
  private get spiritsRemaining(): number {
    return this.world.level.enemies
      .filter((spec, index) => spec.type === 'espiritu' && !spec.group && !flag(`down:${this.id}:${index}`))
      .length;
  }

  private spiritTarget(): Pt | null {
    const alive = this.world.enemies.filter((e) => e.kind === 'espiritu' && e.alive && !e.purified);
    if (alive.length > 0) {
      const first = alive.reduce((a, b) => (a.x <= b.x ? a : b));
      return { x: first.x, y: first.y };
    }
    const spec = this.world.level.enemies.find((s, i) => s.type === 'espiritu' && !flag(`down:${this.id}:${i}`));
    return spec ? { x: spec.x, y: spec.y } : null;
  }

  private status(): { text: string; target: Pt | null } {
    const level = this.world.level;
    switch (this.id) {
      case 'catemaco': {
        const done = this.brujosCount;
        let hint: string;
        let target: Pt | null;
        const brujo = (kind: string) => this.find('n03_brujo', (it) => it.data?.brujo === kind);
        if (!flag('brujo:luz')) { hint = 'Habla con Don Cirilo en la casa de los brujos'; target = brujo('luz') ?? null; }
        else if (!flag('brujo:sol')) { hint = 'Doña Eulalia te enseñará el sol'; target = brujo('sol') ?? null; }
        else if (!flag('brujo:escudo')) { hint = 'Don Atanasio te enseñará el escudo'; target = brujo('escudo') ?? null; }
        else { hint = 'Sigue el camino hacia el lago · cuidado con los encapuchados'; target = this.triggerCenter('ir_seccion'); }
        return { text: `BRUJOS ${done}/${config.brujos.length}\n${hint}`, target };
      }
      case 'campamento': {
        const head = `PISTAS ${this.pistasCount}/${config.pistas.length} · GATOS ${this.jaulasCount}/${config.jaulas.length}`;
        if (flag('balam')) {
          const hint = flag('luna_tut') ? 'Sigue la orilla hacia el altar olmeca' : 'Mantén F para usar la Habilidad Luna';
          return { text: `${head}\n${hint}`, target: this.triggerCenter('ir_seccion') };
        }
        if (this.pistasCount < config.pistasMinimas) {
          const next = config.pistas.find((id) => !flag(`pista:${id}`));
          return {
            text: `${head}\nInfíltrate y busca pistas de la Cofradía`,
            target: next ? (this.find('n03_pista', (it) => it.data?.pista === next) ?? null) : null,
          };
        }
        const cage = config.jaulas.map((id) => this.find('n03_jaula', (it) => it.data?.jaula === id))
          .find((it) => it && !flag(`jaula:${String(it.data?.jaula)}`));
        return { text: `${head}\nFrustra el sacrificio: abre las jaulas sin que te vean`, target: cage ?? null };
      }
      case 'altar_olmeca': {
        const total = level.enemies.filter((e) => e.type === 'espiritu' && !e.group).length;
        const left = this.spiritsRemaining;
        const head = `ESPÍRITUS ${total - left}/${total}`;
        if (flag('maria')) {
          return { text: `${head}\nE en la salida: camino a Oaxaca`, target: this.find('n03_salida') ?? null };
        }
        if (flag('cabeza')) return { text: `${head}\nLa Cabeza duerme`, target: null };
        if (this.arenaOn) return { text: `${head}\nCabeza Olmeca: aprovecha sus ventanas`, target: null };
        if (left > 0) return { text: `${head}\nMantén F (Luna) y purifica a los espíritus con LUZ`, target: this.spiritTarget() };
        return { text: `${head}\nEntra a la explanada de la Cabeza Olmeca`, target: this.triggerCenter('olmeca_arena') };
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
    if (this.id === 'catemaco' && !flag('intro')) {
      await this.say('n03_intro');
      if (!this.alive) return;
      remember('intro');
    }
    this.ready = true;
    // Si murió o salió durante el cierre del jefe, se retoma la escena de María.
    if (this.id === 'altar_olmeca' && flag('cabeza') && !flag('maria')) await this.mariaScene(false);
  }

  private enabled(it: Interactable): boolean {
    if (!this.alive || !this.ready || this.busy || this.arenaOn) return false;
    switch (it.action) {
      case 'n03_jaula': return !flag(`jaula:${String(it.data?.jaula)}`);
      case 'n03_salida': return flag('maria');
      case 'n03_examinar':
      case 'altar':
      case 'n03_brujo':
      case 'n03_pista':
        return true;
      default:
        return false;
    }
  }

  private tick(): void {
    if (!this.alive) return;
    this.updateBarrier();
    if (this.arenaOn) this.checkBossFallback();
    this.refresh();
  }

  /** Muros invisibles: pueblo sin aprender nada y espíritus sin purificar. */
  private updateBarrier(): void {
    if (this.arenaOn || this.leaving) return;
    let want: number | null = null;
    if (this.id === 'catemaco') {
      want = flag('brujos_ok') ? null : config.gates.catemacoX;
    } else if (this.id === 'altar_olmeca') {
      const live = new Set<number>();
      for (const [enemy, cluster] of this.clusterOf) {
        if (this.world.enemies.includes(enemy) && enemy.alive && !enemy.purified) live.add(cluster);
      }
      if (live.size > 0) want = config.espiritus.gates[Math.min(...live)] ?? null;
    }
    if (want !== this.barrier) {
      this.barrier = want;
      if (want === null) this.world.unlockArena();
      else this.world.lockArena(0, want);
    }
    if (want !== null && this.world.player.x > want - 70 && this.world.scene.time.now - this.lastHint > 9000) {
      this.lastHint = this.world.scene.time.now;
      if (this.id === 'catemaco') this.toast('Antes de seguir, aprende lo que los brujos pueden enseñarte.');
      else this.toast(GameState.luna.active
        ? 'Algo bloquea el paso. Purifica a los espíritus con LUZ (Q).'
        : 'Algo invisible bloquea el paso. Mantén F para ver con Luna.');
    }
  }

  private onLunaOn(): void {
    if (!this.alive) return;
    if (this.id === 'campamento' && flag('balam') && !flag('luna_tut')) {
      remember('luna_tut');
      this.toast('Luna se gasta mientras la mantienes y se recarga sola al soltarla.', 5500);
      this.refresh();
    }
    if (this.id === 'altar_olmeca' && !flag('espiritus_vistos')) {
      remember('espiritus_vistos');
      void this.run(() => this.say('n03_espiritus'));
    }
  }

  /* ============================== triggers ============================== */

  private async onTrigger(t: LevelTrigger): Promise<void> {
    if (!this.alive || this.leaving) return;
    const data = t.data ?? {};
    switch (t.action) {
      case 'letras': {
        bus.emit('zone:name', {
          title: String(data.title ?? 'CATEMACO'), subtitle: typeof data.subtitle === 'string' ? data.subtitle : undefined,
        });
        const cp = this.world.level.spawns?.checkpoint;
        if (cp && !flag('letras_cp')) {
          remember('letras_cp');
          this.checkpoint(cp);
          this.toast('Punto de control: letras de CATEMACO');
        }
        break;
      }
      case 'dialogo': {
        const dialogue = data.dialogue;
        await this.run(async () => {
          if (typeof dialogue === 'string') await this.say(dialogue);
          if (typeof data.toast === 'string') this.toast(data.toast, 6000);
        });
        break;
      }
      case 'ir_seccion':
        await this.leaveSection(data);
        break;
      case 'olmeca_arena':
        await this.startBoss(data);
        break;
    }
  }

  private async leaveSection(data: Record<string, unknown>): Promise<void> {
    const section = data.section;
    if (typeof section !== 'string') return;
    const requires = typeof data.requires === 'string' ? data.requires : null;
    if (requires && !flag(requires)) {
      this.toast(requires === 'brujos_ok'
        ? 'Antes de seguir, aprende lo que los brujos pueden enseñarte.'
        : 'Aún no puedes dejar el campamento: falta frustrar el ritual de los gatos.');
      return;
    }
    if (!this.ready) return;
    this.leaving = true;
    if (this.id === 'campamento' && !flag('campamento_fin')) {
      await this.run(async () => { await this.say('n03_campamento_fin'); });
      remember('campamento_fin');
    }
    if (!this.alive) return;
    remember(`salida:${this.id}`);
    this.world.gotoSection(section as Parameters<WorldApi['gotoSection']>[0],
      typeof data.spawn === 'string' ? data.spawn : undefined);
  }

  /* ============================== interacciones ============================== */

  private async interact(it: Interactable): Promise<void> {
    switch (it.action) {
      case 'n03_examinar': {
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
      case 'n03_brujo':
        await this.brujo(it);
        break;
      case 'n03_pista':
        await this.pista(it);
        break;
      case 'n03_jaula':
        await this.jaula(it);
        break;
      case 'n03_salida':
        await this.salida();
        break;
    }
  }

  private discover(key: unknown, at: Pt): void {
    if (typeof key !== 'string' || flag(`desc:${key}`)) return;
    remember(`desc:${key}`);
    this.award(config.rewards.descubrimiento, at);
  }

  /* ---------------------------------- brujos ---------------------------------- */

  private checkBrujos(): void {
    if (this.brujosCount === config.brujos.length && !flag('brujos_ok')) {
      remember('brujos_ok');
      this.toast('Los brujos te abren el camino hacia el lago.');
    }
  }

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

  private async brujo(it: Interactable): Promise<void> {
    const kind = String(it.data?.brujo);
    const allDone = this.brujosCount === config.brujos.length;
    if (kind === 'luz') {
      if (flag('brujo:luz')) { await this.say(allDone ? 'n03_cirilo_final' : 'n03_cirilo_repite'); return; }
      await this.say('n03_cirilo');
      if (!(await this.teach('LUZ')) || !this.alive) return;
      remember('brujo:luz');
      this.award(config.rewards.brujo, it);
      await this.say('n03_luz_fin');
    } else if (kind === 'sol') {
      if (!flag('brujo:luz')) { await this.say('n03_eulalia_pendiente'); return; }
      if (flag('brujo:sol')) { await this.say('n03_eulalia_repite'); return; }
      await this.say('n03_eulalia');
      if (!(await this.teach('SOL')) || !this.alive) return;
      remember('brujo:sol');
      this.award(config.rewards.brujo, it);
      await this.say('n03_sol_fin');
    } else if (kind === 'escudo') {
      if (!flag('brujo:luz') || !flag('brujo:sol')) { await this.say('n03_atanasio_pendiente'); return; }
      if (flag('brujo:escudo')) { await this.say('n03_atanasio_repite'); return; }
      if (!flag('escudo_visto')) {
        await this.say('n03_atanasio');
        if (!this.alive) return;
        remember('escudo_visto');
        this.unlockShield();
      }
      await this.say('n03_atanasio_practica');
      if (!this.alive) return;
      const ok = await this.practicaEscudo(it);
      if (!ok || !this.alive) return;
      remember('brujo:escudo');
      this.award(config.rewards.escudo, it);
      await this.say('n03_atanasio_fin');
    }
    this.checkBrujos();
  }

  /**
   * Mini tutorial del escudo: Don Atanasio lanza piedras de río que buscan al jugador. Si el escudo está
   * levantado en la ventana final del vuelo cuenta como bloqueo. Las piedras no hacen daño.
   * Tras `intentosMax` lanzamientos fallidos se da por aprendido para no atascar el nivel.
   */
  private practicaEscudo(brujo: Pt): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const world = this.world;
      const scene = world.scene;
      const cfg = config.escudo;
      let clock = 0;
      let nextThrow = 900;
      let blocked = 0;
      let thrown = 0;
      let stone: Piedra | null = null;
      let done = false;
      world.timeScale = 1;
      world.player.controlsLocked = false;
      this.toast('Mantén el CLIC DERECHO (o la seña U) para levantar el escudo antes del impacto.', 6000);

      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
        if (stone) { stone.sprite.destroy(); stone.sombra.destroy(); stone = null; }
        if (this.alive) this.freeze();
        resolve(ok);
      };
      const launch = () => {
        thrown++;
        const sx = brujo.x;
        const sy = brujo.y;
        const sprite = scene.add.circle(sx, sy - 40, 4, 0xb8b0a0).setStrokeStyle(1, 0x3a3548);
        const sombra = scene.add.ellipse(sx, sy, 10, 4, 0x000000, 0.4);
        stone = { sprite, sombra, t: 0, sx, sy, guardada: false };
        sfx('chaneque_risa');
      };
      const onUpdate = (_time: number, delta: number) => {
        if (done) return;
        if (!this.alive) { finish(false); return; }
        clock += delta;
        const player = world.player;
        if (!stone) {
          if (clock >= nextThrow) launch();
          return;
        }
        const s = stone;
        s.t += delta;
        const p = Math.min(1, s.t / cfg.vueloMs);
        const gx = s.sx + (player.x - s.sx) * p;
        const gy = s.sy + (player.y - s.sy) * p;
        const h = 40 + (16 - 40) * p + Math.sin(Math.PI * p) * cfg.arco;
        s.sprite.setPosition(gx, gy - h).setDepth(gy + 1);
        s.sombra.setPosition(gx, gy).setDepth(DEPTH.shadow + 1);
        if (s.t >= cfg.vueloMs - cfg.ventanaBloqueoMs && ShieldMod.isShieldActive()) s.guardada = true;
        if (p < 1) return;
        const hit: Hit = { damage: 1, stun: 0, kind: 'projectile', sourceX: gx, knockback: 0 };
        if (s.guardada) {
          // Gasta barra del escudo y emite 'shield:block'; el golpe nunca llega al jugador.
          try { ShieldMod.shieldFilterHit(world, hit); } catch { /* escudo aún no disponible */ }
          blocked++;
          this.toast(`¡Bloqueo ${blocked}/${cfg.piedras}!`, 1600);
        } else {
          this.toast('Se te escapó. Levanta el escudo ANTES de que llegue la piedra.', 2200);
        }
        s.sprite.destroy();
        s.sombra.destroy();
        stone = null;
        nextThrow = clock + cfg.intervaloMs;
        if (blocked >= cfg.piedras) finish(true);
        else if (thrown >= cfg.intentosMax) {
          this.toast('Don Atanasio confía en que le tomarás el modo al escudo.', 4500);
          finish(true);
        }
      };
      scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => finish(false));
    });
  }

  /* ---------------------------------- campamento ---------------------------------- */

  private async pista(it: Interactable): Promise<void> {
    const key = String(it.data?.pista);
    const dialogue = it.data?.dialogue;
    if (typeof dialogue === 'string') await this.say(dialogue);
    if (!this.alive || !config.pistas.includes(key) || flag(`pista:${key}`)) return;
    remember(`pista:${key}`);
    this.award(config.rewards.pista, it);
    this.toast(`Pista ${this.pistasCount} de ${config.pistas.length}`, 2400);
    if (this.pistasCount === config.pistas.length && !flag('deduccion')) {
      remember('deduccion');
      await this.say('n03_deduccion');
      if (this.alive) this.award(config.rewards.deduccion);
    }
  }

  private guardsNear(at: Pt): boolean {
    return this.world.enemies.some((enemy) => enemy.kind === 'encapuchado' && enemy.alive && !enemy.purified &&
      !enemy.exhausted && Math.hypot(enemy.x - at.x, (enemy.y - at.y) * 1.5) < config.guardRadius);
  }

  private async jaula(it: Interactable): Promise<void> {
    const id = String(it.data?.jaula);
    if (!config.jaulas.includes(id) || flag(`jaula:${id}`)) return;
    if (this.guardsNear(it)) {
      this.toast('Hay encapuchados demasiado cerca de la jaula. Despéjalos primero.', 4500);
      return;
    }
    const last = config.jaulas[config.jaulas.length - 1];
    if (id === last && this.jaulasCount < config.jaulas.length - 1) {
      this.toast('Libera primero las otras jaulas.', 3500);
      return;
    }
    await this.say(`n03_jaula_${id}`);
    if (!this.alive) return;
    remember(`jaula:${id}`);
    this.openCageVisual(id);
    this.award(config.rewards.jaula, it);
    sfx('conjuro_ok');
    if (id === last) await this.balam(it);
    else this.runAwayCat(it);
  }

  private openCageVisual(id: string): void {
    const sprite = this.world.scene.children.getByName(`n03_jaula_${id}`) as Phaser.GameObjects.Sprite | null;
    if (!sprite || typeof sprite.setTexture !== 'function') return;
    if (this.world.scene.textures.exists('prop_n03_jaula_abierta')) sprite.setTexture('prop_n03_jaula_abierta');
    else sprite.setAlpha(0.55);
  }

  private spawnCat(x: number, y: number): Phaser.GameObjects.Sprite {
    const scene = this.world.scene;
    let key = 'prop_n03_gato_negro';
    if (!scene.textures.exists(key)) {
      key = GATO_FALLBACK;
      if (!scene.textures.exists(key)) {
        const g = scene.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0x15121c, 1).fillEllipse(9, 11, 14, 8).fillCircle(14, 7, 4);
        g.fillTriangle(11, 4, 12, 0, 14, 4).fillTriangle(14, 4, 16, 0, 17, 4);
        g.fillStyle(0xf2c14e, 1).fillRect(13, 6, 1, 1).fillRect(16, 6, 1, 1);
        g.generateTexture(key, 20, 16);
        g.destroy();
      }
    }
    const cat = scene.add.sprite(x, y, key).setOrigin(0.5, 0.95).setDepth(y);
    if (scene.anims.exists(key)) cat.play(key);
    return cat;
  }

  private runAwayCat(from: Pt): void {
    const cat = this.spawnCat(from.x, from.y);
    const dir = from.x < this.world.player.x ? -1 : 1;
    this.world.scene.tweens.add({
      targets: cat, x: from.x + dir * 300, alpha: 0, duration: 1500, ease: 'Quad.easeIn',
      onComplete: () => cat.destroy(),
    });
  }

  /** Escena de Balam: el último gato toca la gema y el Códice, se vuelve alebrije y se desbloquea Luna. */
  private async balam(cage: Pt): Promise<void> {
    const world = this.world;
    const scene = world.scene;
    const cat = this.spawnCat(cage.x, cage.y - 4);
    await this.say('n03_balam_1');
    if (!this.alive) { cat.destroy(); return; }
    this.thaw();
    scene.tweens.add({ targets: cat, x: world.player.x + 24, y: world.player.y + 2, duration: 700, ease: 'Sine.easeInOut' });
    await this.wait(750);
    if (!this.alive) return;
    world.flash(0xf2c14e, 700);
    world.shake(0.004, 700);
    sfx('aprender');
    scene.tweens.add({ targets: cat, scale: 1.8, duration: 800, yoyo: true });
    for (let i = 0; i < 8; i++) scene.time.delayedCall(i * 190, () => cat.setTint(PALETA_ALEBRIJE[i % PALETA_ALEBRIJE.length]));
    await this.wait(1700);
    if (!this.alive) return;
    this.freeze();
    await this.say('n03_balam_2');
    if (!this.alive) return;
    this.thaw();
    scene.tweens.add({ targets: cat, alpha: 0, duration: 600, onComplete: () => cat.destroy() });
    await this.wait(650);
    if (!this.alive) return;
    this.freeze();
    // Balam.ts toma el relevo como compañero real cuando GameState.hasBalam = true.
    GameState.hasBalam = true;
    this.unlockLuna();
    remember('balam');
    bus.emit('balam:awake', {});
    this.award(config.rewards.balam);
    this.toast('Habilidad Luna desbloqueada: mantén F para ver con los ojos de Balam.', 6500);
  }

  /* ---------------------------------- altar y jefe ---------------------------------- */

  private async startBoss(data: Record<string, unknown>): Promise<void> {
    if (!this.alive || !this.ready || flag('cabeza') || this.arenaOn || this.leaving) return;
    if (!flag('cabeza_intro')) {
      await this.run(async () => {
        await this.say('n03_cabeza_intro');
        if (this.alive) remember('cabeza_intro');
      });
    }
    if (!this.alive || flag('cabeza') || this.arenaOn) return;
    const group = typeof data.group === 'string' ? data.group : 'olmeca';
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
    this.toast('Fase 1: salta las ondas de choque (Espacio). Cuando sus ojos se apaguen, ataca.', 6500);
    this.refresh();
  }

  private onPhase(phase: 1 | 2 | 3): void {
    if (!this.alive || !this.arenaOn) return;
    this.bossSeen = true;
    if (phase === 2) this.toast('Fase 2: láseres oculares. Muévete en profundidad (W/S) o levanta el escudo.', 6000);
    else if (phase === 3) this.toast('Fase 3: invoca espíritus. Mantén F (Luna) y purifícalos con LUZ.', 6000);
  }

  /** Respaldo: si el jefe nunca aparece (enemigo aún no integrado) el nivel no se queda atascado. */
  private checkBossFallback(): void {
    const boss = this.world.enemies.find((e) => e.kind === 'cabeza_olmeca');
    if (boss) { this.bossSeen = true; return; }
    if (!this.bossSeen && this.world.scene.time.now - this.arenaStart > 5000) {
      console.warn('[ECOS] La Cabeza Olmeca no apareció: se da el jefe por calmado (respaldo).');
      void this.cabezaCalmada();
    }
  }

  private async cabezaCalmada(): Promise<void> {
    if (!this.alive || flag('cabeza')) return;
    remember('cabeza');
    this.arenaOn = false;
    this.barrier = null;
    this.world.unlockArena();
    bus.emit('arena:clear', { group: 'olmeca' });
    bus.emit('music', { track: config.arena.musicaAltar });
    this.refresh();
    await this.wait(1200);
    if (!this.alive) return;
    await this.run(() => this.mariaScene(true));
  }

  private spawnMaria(x: number, y: number): Phaser.GameObjects.GameObject {
    const scene = this.world.scene;
    let obj: Phaser.GameObjects.GameObject;
    if (scene.textures.exists('npc_maria')) {
      obj = scene.add.sprite(x, y, 'npc_maria').setOrigin(0.5, 1).setDepth(y);
    } else {
      // Placeholder: AGENTS.md §8.0, María es personaje importante (el arte lo entrega el equipo).
      const box = scene.add.rectangle(0, -40, 28, 72, 0x7a3b6e).setStrokeStyle(1, 0xf2c14e);
      const initial = scene.add.text(0, -40, 'M', { fontFamily: 'monospace', fontSize: '14px', color: '#fff0ce' }).setOrigin(0.5);
      obj = scene.add.container(x, y, [box, initial]).setDepth(y);
    }
    return obj;
  }

  /** Cierre de Veracruz: María aparece en busca de sus hijos y se une al grupo (NDD Nivel 3). */
  private async mariaScene(playCabezaFin: boolean): Promise<void> {
    if (!this.alive || flag('maria')) return;
    if (playCabezaFin) await this.say('n03_cabeza_fin');
    if (!this.alive) return;
    const world = this.world;
    const cfg = config.maria;
    const y = 300;
    const maria = this.spawnMaria(cfg.entraDesdeX, y) as Phaser.GameObjects.GameObject & { x: number };
    this.thaw();
    world.scene.tweens.add({
      targets: maria, x: cfg.llegaA, duration: (Math.abs(cfg.entraDesdeX - cfg.llegaA) / cfg.velocidadPx) * 1000,
    });
    await this.wait((Math.abs(cfg.entraDesdeX - cfg.llegaA) / cfg.velocidadPx) * 1000 + 200);
    if (!this.alive) return;
    this.freeze();
    await this.say('n03_maria_1');
    await this.say('n03_maria_2');
    if (!this.alive) return;
    remember('maria');
    sfx('aprender');
    this.toast('María se une a tu viaje junto con Balam.', 5500);
  }

  private async salida(): Promise<void> {
    if (!flag('maria')) { this.toast('Aún falta cerrar lo que pasó en el altar.'); return; }
    await this.say('n03_salida');
    if (!this.alive) return;
    remember('completo');
    const sm = this.world.scene.scene;
    for (const key of ['Hud', 'Dialogue', 'Spell', 'Altar', 'Diario', 'Pause']) {
      if (sm.isActive(key) || sm.isPaused(key)) sm.stop(key);
    }
    bus.emit('music', { track: null });
    sm.start('Title');
  }
}
