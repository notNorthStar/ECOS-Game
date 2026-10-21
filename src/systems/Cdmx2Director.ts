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
import * as MariaMod from './Maria';
import * as LloronaMod from './Llorona';
import config from '../data/cdmx2.json';
import { prepareCdmx2Entry, prepareGdlEntry } from './Campaign';

import { FUENTE, tamFuente } from '../ui/fuente';
/**
 * Director del Nivel 7 · CDMX parte 2 (dueño: contenido). Secciones: teleferico → torre → salon_trono.
 * Mismo patrón que CdmxDirector (Nivel 6): todo el progreso vive en GameState.flags con prefijo `n07:` y sobrevive
 * a la muerte; las secuencias se serializan con run()/exec() y congelan el mundo.
 *
 * - teleferico: la cabina es una arena fija (x 0–800). El Director manda 4 oleadas (espíritus lunaOnly y encapuchados
 *   que entran por las puertas) y emite 'cablecar:progress' {progress 0..1}. Al terminar: gotoSection('torre').
 * - torre: guardia de élite (rank 'elite') y algún Negro; checkpoint, altar y puerta (exige limpiar a la élite).
 * - salon_trono: revelación (María SUGERIDA, sin mostrar nada) → mariaTransform() → summonLlorona() → Rey del Olvido
 *   (nace en la arena 'rey' del nivel) → 'boss:calmed' → CONSUELO → MEMORIA → PAZ (cámara muy lenta, sin castigo) →
 *   despedida → 4.º, 5.º y 6.º fragmento → consola con la falsa llamada → Guadalajara (Nivel 10).
 *
 * Actions de interactuables: n07_examinar · altar · n07_consola. Actions de triggers: letras · dialogo · punto ·
 * ir_seccion · revelacion.
 *
 * APIs de otros agentes (se llaman con guarda por si aún no existen): Casting.castSpellNow, Maria.mariaTransform /
 * getMariaPosition, Llorona.summonLlorona / dismissLlorona / setLloronaWild.
 */

const flag = (key: string) => !!GameState.flags[`n07:${key}`];
const remember = (key: string) => { GameState.flags[`n07:${key}`] = true; };

type Pt = { x: number; y: number };
type MariaLine = { text: string; ms?: number };
type Entrada = { t: number; side: 'izq' | 'der'; type: 'espiritu' | 'encapuchado'; rank?: 'rojo' | 'negro' | 'elite'; lunaOnly?: boolean };
type Ola = { nombre: string; entradas: Entrada[] };
type Paso = { id: string; tipo: 'aprender' | 'lanzar'; conjuro: string; intro?: string; ok?: string; repite?: string };
type Wave = { index: number; entries: Entrada[]; next: number; elapsed: number; spawned: EnemyApi[]; hinted: boolean };
type CastingExtra = { castSpellNow?: (world: WorldApi, spellId: string) => Promise<SpellOutcomeEvent> };
type MariaExtra = {
  mariaSay?: (text: string, ms?: number) => void;
  mariaTransform?: () => void;
  getMariaPosition?: () => Pt | null;
};
type LloronaExtra = {
  summonLlorona?: (world: WorldApi, x: number, y: number) => void;
  dismissLlorona?: () => void;
  setLloronaWild?: (on: boolean) => void;
};

const OLAS = config.teleferico.olas as unknown as Ola[];
const PASOS = config.final.pasos as unknown as Paso[];
const DIALOGO_OLA = config.teleferico.dialogoTrasOla as unknown as Record<string, string>;
const SPELL_FALLBACK = ['FUEGO', 'SOL', 'MEMORIA', 'VERDAD'];

const TITULOS: Record<string, { title: string; subtitle: string }> = {
  teleferico: { title: 'TELEFÉRICO', subtitle: 'El ascenso' },
  torre: { title: 'TORRE DE CONTROL', subtitle: 'La guardia de élite' },
  salon_trono: { title: 'SALÓN DEL TRONO', subtitle: 'El Rey del Olvido' },
};

/** Instala el director de la sección actual de la CDMX parte 2. */
export function installCdmx2Director(world: WorldApi): void {
  new Cdmx2Director(world);
}

class Cdmx2Director {
  private alive = true;
  private ready = false;
  private busy = false;
  private leaving = false;
  private bossOn = false;
  private bossSeen = false;
  private arenaStart = 0;
  private wavesRunning = false;
  private wave: Wave | null = null;
  private gapLeft = 0;
  private lastProgress = -1;
  private finalRunning = false;
  private finalTries = 0;
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
      fontFamily: FUENTE, fontSize: `${tamFuente(config.hud.fontSize)}px`,
      color: '#fff0ce', backgroundColor: '#171521cc', padding: { x: 5, y: 4 },
      lineSpacing: 3,
    }).setScrollFactor(0).setDepth(DEPTH.ui);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.ready = false;
      // Nunca dejar los controles invertidos al cambiar de escena o reiniciar.
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
    bus.scoped(scene, 'cofradia:down', ({ enemy }) => this.markDown(enemy));
    bus.scoped(scene, 'enemy:purified', ({ enemy }) => this.markDown(enemy));
    bus.scoped(scene, 'boss:calmed', () => { if (this.id === 'salon_trono') void this.reyCalmado(); });
    bus.scoped(scene, 'boss:vulnerable', ({ on }) => {
      if (on && this.id === 'salon_trono' && !flag('tip_ventana')) {
        remember('tip_ventana');
        this.toast('Ventana abierta: la corona se rompe con SOL o FUEGO. MEMORIA debilita al Rey.', 6500);
      }
    });
    bus.scoped(scene, 'rey:crown', ({ broken }) => {
      if (broken && !flag('tip_corona')) {
        remember('tip_corona');
        this.toast('¡Corona rota! El Rey queda vulnerable: remátalo y completa su sello con MEMORIA.', 6000);
      }
    });
    bus.scoped(scene, 'controls:invert', ({ on }) => {
      if (on && !flag('tip_invertir')) {
        remember('tip_invertir');
        this.toast('El pulso mental invierte tus controles unos segundos. (Se puede desactivar en Opciones → Accesibilidad.)', 6500);
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
    scene.time.addEvent({ delay: config.teleferico.tickMs, loop: true, callback: () => this.tick() });
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
    const mod = MariaMod as unknown as MariaExtra;
    try {
      if (mod.mariaSay) mod.mariaSay(line.text, line.ms ?? config.comentarioMariaMs);
      else bus.emit('maria:say', { text: line.text, ms: line.ms ?? config.comentarioMariaMs });
    } catch (err) {
      console.warn('[ECOS] mariaSay falló', err);
    }
  }

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

  private thaw(): void { this.world.timeScale = 1; }
  private freeze(): void { this.world.timeScale = 0; this.world.player.controlsLocked = true; }

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
      console.warn('[ECOS] Cdmx2Director: la secuencia falló', err);
    } finally {
      if (this.alive) {
        this.busy = false;
        // No restaurar un bloqueo ajeno (p. ej. el conjuro que vence al jefe): solo un conjuro en curso puede
        // seguir bloqueando; Casting restaura lo suyo al terminar. Nunca dejar el mundo congelado.
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
  }

  /** Entrada directa (?seccion=…) sin pasar por el Nivel 6: prepara lo necesario. */
  private ensurePrerequisites(): void {
    const sinMaria = flag('transformada') || flag('despedida');
    if (!GameState.hasMaria && !sinMaria) {
      console.warn('[ECOS] Nivel 7: entrada directa sin María; se prepara la entrada a la CDMX parte 2 para pruebas.');
      prepareCdmx2Entry();
      GameState.section = this.id as typeof GameState.section;
    }
    if (sinMaria) GameState.hasMaria = false;
    for (const spell of SPELL_FALLBACK) {
      if (this.knows(spell)) continue;
      console.warn(`[ECOS] Nivel 7: entrada directa sin ${spell}; se concede para pruebas.`);
      this.silentLearn(spell);
    }
  }

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

  /** Quita a los enemigos ya derrotados antes de morir y esconde el fragmento hasta su momento. */
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
    if (this.id === 'salon_trono') this.sprite('n07_fragmento')?.setAlpha(0);
  }

  private markDown(enemy: EnemyApi): void {
    const index = this.specOf.get(enemy);
    if (index !== undefined) {
      remember(`down:${this.id}:${index}`);
      if (this.id === 'torre' && this.elitesPending().length === 0 && !flag('elite_fin')) this.eliteFin();
    }
    this.refresh();
  }

  /* ============================== HUD y objetivo ============================== */

  private triggerBy(pred: (t: LevelTrigger) => boolean): Pt | null {
    const t = this.world.level.triggers.find(pred);
    return t ? { x: t.x + t.w / 2, y: t.y + t.h * 0.55 } : null;
  }

  private triggerCenter(action: string): Pt | null { return this.triggerBy((t) => t.action === action); }

  private eliteSpecs(): Array<{ index: number; x: number; y: number }> {
    const out: Array<{ index: number; x: number; y: number }> = [];
    this.world.level.enemies.forEach((spec, index) => {
      if (spec.type === 'encapuchado' && spec.rank === 'elite') out.push({ index, x: spec.x, y: spec.y });
    });
    return out;
  }

  private elitesPending(): Array<{ index: number; x: number; y: number }> {
    return this.eliteSpecs().filter((e) => !flag(`down:torre:${e.index}`));
  }

  private wavesDone(): number { return OLAS.filter((_o, i) => flag(`ola:${i}`)).length; }

  private progress(): number {
    if (flag('teleferico_fin')) return 1;
    const done = this.wavesDone();
    let frac = 0;
    if (this.wave && this.wave.entries.length > 0) {
      const dead = this.wave.spawned.filter((e) => !e.alive || e.purified).length;
      frac = dead / this.wave.entries.length;
    }
    return Math.min(1, (done + frac) / OLAS.length);
  }

  private emitProgress(force = false): void {
    const p = this.progress();
    if (!force && Math.abs(p - this.lastProgress) < 0.01) return;
    this.lastProgress = p;
    bus.emit('cablecar:progress', { progress: p });
  }

  private status(): { text: string; target: Pt | null } {
    switch (this.id) {
      case 'teleferico': {
        const head = `ASCENSO ${Math.round(this.progress() * 100)}%`;
        if (this.wave) return { text: `${head}\n${OLAS[this.wave.index].nombre}\nLuna (F) revela a los espíritus`, target: null };
        return { text: `${head}\nOLA ${Math.min(this.wavesDone() + 1, OLAS.length)}/${OLAS.length}`, target: null };
      }
      case 'torre': {
        const total = this.eliteSpecs().length;
        const pending = this.elitesPending();
        const head = `GUARDIA DE ÉLITE ${total - pending.length}/${total}`;
        if (pending.length > 0) {
          const first = pending[0];
          const live = this.world.enemies.find((e) => e.kind === 'encapuchado' && e.alive && Math.hypot(e.x - first.x, e.y - first.y) < 300);
          return { text: `${head}\nAbre paso hasta el salón del trono`, target: live ? { x: live.x, y: live.y } : { x: first.x, y: first.y } };
        }
        return { text: `${head}\nEntra al salón del trono`, target: this.triggerCenter('ir_seccion') };
      }
      case 'salon_trono': {
        if (flag('completo')) return { text: 'CUATRO DE SEIS FRAGMENTOS', target: null };
        if (flag('final_fin')) {
          return { text: 'FRAGMENTO 4/6\nUsa la consola detrás del trono', target: this.world.level.interactables.find((it) => it.action === 'n07_consola') ?? null };
        }
        if (flag('rey')) return { text: 'LA LLORONA\nCONSUELO · MEMORIA · PAZ', target: null };
        if (this.bossOn) return { text: 'EL REY DEL OLVIDO\nRompe la corona con SOL o FUEGO · MEMORIA lo debilita', target: null };
        return { text: 'SALÓN DEL TRONO\nAcércate al trono', target: this.triggerCenter('revelacion') };
      }
      default:
        return { text: '', target: null };
    }
  }

  private refresh(): void {
    if (!this.alive) return;
    const { text, target } = this.status();
    const locked = this.wavesRunning || this.bossOn;
    const objective = target && !locked ? { x: target.x, y: target.y, section: this.world.level.id } : null;
    const signature = `${text}|${objective ? `${Math.round(objective.x)},${Math.round(objective.y)}` : '-'}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.counter.setText(text);
    setObjective(objective);
    bus.emit('objective', objective);
  }

  /* ============================== ciclo del nivel ============================== */

  private music(track: string): void { bus.emit('music', { track }); }

  private async intro(): Promise<void> {
    if (!this.alive) return;
    const titles = TITULOS[this.id];
    if (titles) bus.emit('zone:name', titles);
    if (this.world.level.music) this.music(this.world.level.music);
    if (this.id === 'teleferico') {
      this.emitProgress(true);
      if (!flag('intro')) {
        await this.say('n07_llegada');
        if (!this.alive) return;
        remember('intro');
        this.world.scene.time.delayedCall(2500, () => this.mariaOnce('subida'));
      }
    } else if (this.id === 'torre' && !flag('torre_intro')) {
      remember('torre_intro');
      this.world.scene.time.delayedCall(2500, () => this.mariaOnce('torre'));
    }
    this.ready = true;
    if (this.id === 'teleferico') this.startWaves();
    if (this.id === 'salon_trono') await this.resumeSalon();
  }

  private get anyLock(): boolean { return this.bossOn || this.wavesRunning; }

  private enabled(it: Interactable): boolean {
    if (!this.alive || !this.ready || this.busy || this.leaving) return false;
    switch (it.action) {
      case 'n07_consola': return flag('final_fin') && !flag('completo');
      case 'n07_examinar':
      case 'altar':
        // En el teleférico solo se puede mirar entre oleadas; con el Rey en pie, nada.
        return !this.bossOn && !this.wave;
      default:
        return false;
    }
  }

  private tick(): void {
    if (!this.alive) return;
    if (this.id === 'teleferico') this.tickWaves();
    if (this.bossOn) this.checkBossFallback();
    if (this.id === 'salon_trono' && flag('rey') && !flag('final_fin') && this.ready && !this.busy
      && !this.finalRunning && this.finalTries < 3) {
      // Si la secuencia final se interrumpió (error de un sistema ajeno), se retoma sin castigo.
      void this.run(() => this.finalSequence());
    }
    this.refresh();
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
          this.toast('Punto de control: la guardia de élite sigue más adelante. Descansa en el altar si lo necesitas.', 5500);
        }
        break;
      }
      case 'ir_seccion':
        await this.leaveSection(data);
        break;
      case 'revelacion':
        await this.revelacion(data);
        break;
    }
  }

  private async leaveSection(data: Record<string, unknown>): Promise<void> {
    const section = data.section;
    if (typeof section !== 'string') return;
    if (data.requires === 'elite' && this.elitesPending().length > 0) {
      if (this.world.scene.time.now - this.lastHint > 6000) {
        this.lastHint = this.world.scene.time.now;
        this.toast('La guardia de élite aún custodia la puerta del trono. Despeja el pasillo.');
      }
      return;
    }
    if (!this.ready || this.anyLock || this.busy) return;
    this.leaving = true;
    remember(`salida:${this.id}`);
    this.world.gotoSection(section as Parameters<WorldApi['gotoSection']>[0],
      typeof data.spawn === 'string' ? data.spawn : undefined);
  }

  /* ============================== teleférico: oleadas ============================== */

  private startWaves(): void {
    if (!this.alive || this.wavesRunning) return;
    if (this.wavesDone() >= OLAS.length) { void this.llegada(); return; }
    this.wavesRunning = true;
    this.world.lockArena(config.teleferico.arena.x0, config.teleferico.arena.x1);
    bus.emit('arena:start', { group: config.teleferico.arena.grupo });
    this.gapLeft = 1200;
    this.refresh();
  }

  private nextWave(): void {
    const index = OLAS.findIndex((_o, i) => !flag(`ola:${i}`));
    if (index < 0) { void this.llegada(); return; }
    const entries = [...OLAS[index].entradas].sort((a, b) => a.t - b.t);
    this.wave = { index, entries, next: 0, elapsed: 0, spawned: [], hinted: false };
    sfx('chaneque_risa');
    this.refresh();
  }

  private tickWaves(): void {
    if (!this.wavesRunning || this.busy || !this.ready) return;
    const step = config.teleferico.tickMs;
    if (!this.wave) {
      this.gapLeft -= step;
      if (this.gapLeft <= 0) this.nextWave();
      this.emitProgress();
      return;
    }
    const w = this.wave;
    w.elapsed += step;
    while (w.next < w.entries.length && w.entries[w.next].t <= w.elapsed) {
      this.spawnEntry(w, w.entries[w.next], w.next);
      w.next++;
    }
    const live = w.spawned.filter((e) => e.alive && !e.purified);
    if (!w.hinted && live.length > 0 && w.elapsed > config.teleferico.pistaLunaMs && !GameState.luna.active) {
      w.hinted = true;
      this.toast('Quedan espíritus invisibles: activa la Habilidad Luna (F) para verlos y purificarlos.', 6000);
    }
    this.emitProgress();
    if (w.next >= w.entries.length && live.length === 0) this.endWave();
  }

  private spawnEntry(w: Wave, e: Entrada, n: number): void {
    const door = config.teleferico.puertas[e.side];
    const y = door.y + ((n % 3) - 1) * 24;
    try {
      const enemy = this.world.spawnEnemy({
        type: e.type, rank: e.rank, lunaOnly: e.lunaOnly, x: door.x, y, group: config.teleferico.arena.grupo,
      });
      w.spawned.push(enemy);
      this.world.shake(0.003, 180);
    } catch (err) {
      console.warn('[ECOS] Nivel 7: no se pudo crear a un enemigo de la oleada', e, err);
    }
  }

  private endWave(): void {
    const w = this.wave;
    if (!w) return;
    this.wave = null;
    this.gapLeft = config.teleferico.pausaEntreOlasMs;
    remember(`ola:${w.index}`);
    this.award(config.rewards.ola);
    this.emitProgress(true);
    const dialogue = DIALOGO_OLA[String(w.index)];
    if (dialogue && !flag(`dlg:ola${w.index}`)) {
      remember(`dlg:ola${w.index}`);
      void this.run(async () => {
        await this.say(dialogue);
        if (w.index === 0) this.mariaOnce('tormenta');
      });
    }
    if (this.wavesDone() >= OLAS.length) void this.llegada();
    this.refresh();
  }

  private async llegada(): Promise<void> {
    if (this.leaving) return;
    this.wavesRunning = false;
    this.wave = null;
    this.emitProgress(true);
    this.world.unlockArena();
    bus.emit('arena:clear', { group: config.teleferico.arena.grupo });
    await this.run(async () => {
      if (!flag('estacion_dlg')) {
        await this.say('n07_estacion_alta');
        if (!this.alive) return;
        remember('estacion_dlg');
      }
      remember('teleferico_fin');
      await this.wait(config.teleferico.estacionMs);
      if (!this.alive) return;
      this.leaving = true;
      remember('salida:teleferico');
      this.world.gotoSection('torre');
    });
  }

  /* ============================== torre ============================== */

  private eliteFin(): void {
    remember('elite_fin');
    this.award(config.rewards.torre);
    this.toast('La guardia de élite cae. La puerta del salón del trono queda libre.', 5500);
    this.refresh();
  }

  /* ============================== interacciones ============================== */

  private async interact(it: Interactable): Promise<void> {
    switch (it.action) {
      case 'n07_examinar': {
        const dialogue = it.data?.dialogue;
        if (typeof dialogue === 'string') await this.say(dialogue);
        if (!this.alive) return;
        this.discover(it.data?.descubrimiento, it);
        break;
      }
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
      case 'n07_consola':
        await this.consolaFalsa();
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
        // Casting restaura el tiempo al terminar; los diálogos siguientes se vuelven a congelar.
        this.freeze();
      }
    }
    return this.knows(spellId);
  }

  /* ============================== salón del trono ============================== */

  private reyPos(): Pt {
    const spec = this.world.level.enemies.find((e) => e.type === 'rey_olvido');
    return spec ? { x: spec.x, y: spec.y } : { x: this.world.player.x + 300, y: 292 };
  }

  private summon(at: Pt): void {
    const mod = LloronaMod as unknown as LloronaExtra;
    if (!mod.summonLlorona) { console.warn('[ECOS] Llorona.summonLlorona aún no existe.'); return; }
    mod.summonLlorona(this.world, at.x, at.y);
  }

  private wild(on: boolean): void {
    (LloronaMod as unknown as LloronaExtra).setLloronaWild?.(on);
  }

  /** Reanuda el salón tras morir o volver: jefe a medias, secuencia final a medias o consola pendiente. */
  private async resumeSalon(): Promise<void> {
    if (flag('rey') && !flag('final_fin')) {
      this.music(config.musica.llorona);
      this.summon(this.reyPos());
      this.wild(true);
      await this.finalSequence();
    } else if (flag('transformada') && !flag('rey')) {
      // Reintento tras morir: el jefe se reinicia limpio y la Llorona vuelve a su lado.
      await this.say('n07_reintento');
      if (!this.alive) return;
      this.startBoss(true);
    }
  }

  private async revelacion(data: Record<string, unknown>): Promise<void> {
    if (!this.alive || !this.ready || this.leaving || flag('revelacion') || flag('transformada') || this.anyLock) return;
    remember('revelacion');
    const mariaAt = ((MariaMod as unknown as MariaExtra).getMariaPosition?.() ?? null)
      ?? { x: this.world.player.x - 70, y: this.world.player.y };
    await this.run(async () => {
      await this.say('n07_revelacion');
      if (!this.alive) return;
      this.thaw();
      this.world.flash(0xcfe8ff, 700);
      this.world.shake(0.005, 700);
      sfx('aprender');
      const maria = MariaMod as unknown as MariaExtra;
      if (maria.mariaTransform) maria.mariaTransform();
      else { console.warn('[ECOS] Maria.mariaTransform aún no existe.'); GameState.hasMaria = false; }
      GameState.hasMaria = false;
      await this.wait(900);
      if (!this.alive) return;
      this.freeze();
      remember('transformada');
      const jefa = this.world.level.spawns?.jefa;
      if (jefa) this.checkpoint(jefa);
      this.summon(mariaAt);
      await this.say('n07_transformacion');
      if (!this.alive) return;
      await this.say('n07_pelea_aviso');
    });
    if (!this.alive) return;
    this.startBoss(false, data);
  }

  private startBoss(retry: boolean, data: Record<string, unknown> = {}): void {
    if (!this.alive || flag('rey') || this.bossOn) return;
    const x0 = typeof data.x0 === 'number' ? data.x0 : config.jefe.x0;
    const x1 = typeof data.x1 === 'number' ? data.x1 : config.jefe.x1;
    const group = typeof data.group === 'string' ? data.group : config.jefe.grupo;
    this.bossOn = true;
    this.bossSeen = false;
    this.arenaStart = this.world.scene.time.now;
    this.world.lockArena(x0, x1);
    if (retry) {
      const rey = this.reyPos();
      this.summon({ x: rey.x + config.jefe.llorona.dx, y: rey.y + config.jefe.llorona.dy });
    }
    if (this.knows('SOL')) GameState.selectedSpell = 'SOL';
    this.music(config.musica.jefe);
    bus.emit('arena:start', { group });
    if (!retry) this.toast('El Rey del Olvido: rompe su corona (SOL o FUEGO en sus ventanas). La Llorona lo grita; tú esquiva el pulso.', 7500);
    this.refresh();
  }

  /** Respaldo: si el Rey nunca aparece (enemigo aún no integrado) el nivel no se queda atascado. */
  private checkBossFallback(): void {
    const boss = this.world.enemies.find((e) => e.kind === 'rey_olvido');
    if (boss) { this.bossSeen = true; return; }
    if (!this.bossSeen && this.world.scene.time.now - this.arenaStart > config.jefe.respaldoMs) {
      console.warn('[ECOS] El Rey del Olvido no apareció: se da por calmado (respaldo).');
      void this.reyCalmado();
    }
  }

  private async reyCalmado(): Promise<void> {
    if (!this.alive || flag('rey')) return;
    remember('rey');
    this.bossOn = false;
    this.world.unlockArena();
    bus.emit('arena:clear', { group: config.jefe.grupo });
    this.music(config.musica.llorona);
    this.refresh();
    await this.wait(1200);
    if (!this.alive) return;
    await this.run(() => this.finalSequence());
  }

  /* ----------------- CONSUELO → MEMORIA → PAZ, despedida y fragmento ----------------- */

  /** Lanza un conjuro con el tiempo muy ralentizado. Resuelve con su resultado ('fail' | 'partial' | 'perfect'). */
  private async cast(spellId: string): Promise<SpellOutcomeEvent['outcome']> {
    const fn = (CastingMod as unknown as CastingExtra).castSpellNow;
    if (!fn) {
      console.warn('[ECOS] Casting.castSpellNow aún no existe: el paso se da por logrado.');
      return 'perfect';
    }
    this.world.timeScale = config.final.timeScale;
    const ev = await fn(this.world, spellId);
    return ev?.outcome ?? 'fail';
  }

  private async finalSequence(): Promise<void> {
    if (!this.alive || this.finalRunning || flag('final_fin')) return;
    this.finalRunning = true;
    this.finalTries++;
    try {
      this.wild(true);
      if (!flag('dlg:rey_cae')) {
        remember('dlg:rey_cae');
        await this.say('n07_rey_cae');
        if (!this.alive) return;
      }
      for (const paso of PASOS) {
        if (flag(`paso:${paso.id}`)) continue;
        if (paso.tipo === 'aprender') await this.pasoAprender(paso);
        else await this.pasoLanzar(paso);
        if (!this.alive) return;
        remember(`paso:${paso.id}`);
        this.award(config.rewards.paso);
      }
      this.wild(false);
      await this.despedida();
      if (!this.alive) return;
      await this.fragmento();
      if (!this.alive) return;
      remember('final_fin');
      this.toast('Cuarto fragmento del Sello. Usa la consola detrás del trono (E).', 7000);
    } finally {
      this.finalRunning = false;
      this.refresh();
    }
  }

  private async pasoAprender(paso: Paso): Promise<void> {
    if (!this.knows(paso.conjuro)) {
      if (paso.intro && !flag(`pi:${paso.id}`)) {
        remember(`pi:${paso.id}`);
        await this.say(paso.intro);
        if (!this.alive) return;
      }
      for (let tries = 0; tries < 5 && !(await this.teach(paso.conjuro)); tries++) {
        if (!this.alive) return;
      }
      if (!this.knows(paso.conjuro)) throw new Error(`No se aprendió ${paso.conjuro}`);
      this.award(config.rewards.conjuro);
    }
  }

  private async pasoLanzar(paso: Paso): Promise<void> {
    if (!this.knows(paso.conjuro)) this.silentLearn(paso.conjuro);
    if (paso.intro && !flag(`pi:${paso.id}`)) {
      remember(`pi:${paso.id}`);
      await this.say(paso.intro);
      if (!this.alive) return;
    }
    let failed = 0;
    for (;;) {
      GameState.selectedSpell = paso.conjuro;
      const outcome = await this.cast(paso.conjuro);
      if (!this.alive) return;
      this.freeze();
      if (outcome !== 'fail') break;
      // Sin castigo: se repite el mismo paso.
      failed++;
      if (failed === 1 && paso.repite) await this.say(paso.repite);
      else this.toast('Otra vez, con calma: el tiempo sigue detenido para ti.', 2800);
      if (!this.alive) return;
    }
    if (paso.ok) await this.say(paso.ok);
  }

  private async despedida(): Promise<void> {
    if (flag('despedida')) return;
    await this.say('n07_despedida');
    if (!this.alive) return;
    this.thaw();
    this.world.flash(0xbfe0ff, 900);
    sfx('aprender');
    (LloronaMod as unknown as LloronaExtra).dismissLlorona?.();
    GameState.hasMaria = false;
    remember('despedida');
    this.music(config.musica.salon);
    await this.wait(config.final.pausaMs);
    if (!this.alive) return;
    this.freeze();
  }

  private async fragmento(): Promise<void> {
    if (flag('fragmento_4')) return;
    const frag = this.sprite('n07_fragmento');
    frag?.setAlpha(1);
    this.world.flash(0xfff0c0, 600);
    sfx('aprender');
    await this.say('n07_fragmento');
    if (!this.alive) return;
    // Guanajuato y Jalisco se omiten (decisión del equipo, 2026-10-19): el Rey guardaba del 4.º al 6.º fragmento.
    remember('fragmento_4');
    remember('fragmento_5');
    remember('fragmento_6');
    this.award(config.rewards.fragmento);
    frag?.setAlpha(0);
  }

  private async consolaFalsa(): Promise<void> {
    if (!flag('final_fin') || flag('completo')) return;
    await this.say('n07_consola_falsa');
    if (!this.alive) return;
    remember('consola');
    this.award(config.rewards.consola);
    await this.say('n07_cierre');
    if (!this.alive) return;
    remember('completo');
    this.toast(config.salida.aviso, 6500);
    this.leaving = true;
    await this.wait(config.salida.esperaMs);
    if (!this.alive) return;
    // Sigue Guadalajara (Nivel 10, el final): Guanajuato y Jalisco se omiten.
    prepareGdlEntry();
    this.world.gotoSection('gdl_avenida');
  }
}
