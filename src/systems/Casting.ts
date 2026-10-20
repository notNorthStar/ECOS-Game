import Phaser from 'phaser';
import type { SpellOutcomeEvent, WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { isAction, keys, SPELL_HOLD_MS } from '../config/controls';
import { SLOWMO } from '../config/game';
import type { SpellResult, SpellSession } from '../lsm';
import { camView, lsm, showCamera } from './Lsm';
import { getSpellDef, isMastered, recordCast } from './Mastery';
import { isShieldActive } from './Shield';

/**
 * Dueño: lsm. Conjuros (GDD 6.2–6.4):
 *  - Q tocado (< SPELL_HOLD_MS) → lanza GameState.selectedSpell.
 *  - Q mantenido → rueda (escena 'Spell' modo 'wheel') con el mundo a SLOWMO.wheel; se confirma al soltar Q.
 *  - Dominado (maestría 3) → automático ('perfect', auto: true). Si no → deletreo con cámara o teclado,
 *    en TIEMPO REAL (performance.now()), con el mundo ralentizado y los controles suspendidos.
 *  - Emite 'spell:begin', 'spell:letter', 'spell:resolved' y efectos 'sfx'.
 * También instala Esc (Pausa), Tab (Diario) y la pausa al salir de pantalla completa:
 * LevelScene NO debe manejar Esc ni Tab.
 */

export { SPELLS, getSpellDef } from './Mastery';

/** Estado del deletreo en curso, leído por SpellScene cada cuadro. */
export interface ActiveCast {
  spellId: string;
  session: SpellSession | null;
  auto: boolean;
  result: SpellResult | null;
  /** performance.now() en que terminó (para la animación del resultado). */
  endedAt: number;
}

/** Estado de la rueda, compartido con SpellScene. */
export const wheelState = {
  open: false,
  spells: [] as string[],
  index: 0,
};

let active: ActiveCast | null = null;
let learning = false;

/** El deletreo en curso (o el último resultado mientras se muestra). */
export function getActiveCast(): ActiveCast | null {
  return active;
}

/** true mientras se deletrea, se aprende un conjuro o la rueda está abierta. */
export function isCasting(): boolean {
  return GameState.casting || learning || wheelState.open;
}

/** Ventana por letra según el conjuro y la opción de ventanas largas. */
export function letterWindowFor(spellId: string): number {
  const base = getSpellDef(spellId)?.letterWindowMs ?? 3000;
  return Math.round(base * (GameState.settings.longWindows ? 1.8 : 1));
}

/**
 * Conjuros de HISTORIA (spells.json type 'historia', p. ej. CONSUELO y PAZ): se aprenden y se ven en el Diario,
 * pero no se seleccionan ni aparecen en la rueda; solo se lanzan desde el director con castSpellNow().
 */
export function isStorySpell(spellId: string): boolean {
  return getSpellDef(spellId)?.type === 'historia';
}

/** Agrega un conjuro aprendido sin duplicar y lo selecciona si no hay otro (nunca uno de historia). */
function addLearned(spellId: string, select: boolean): void {
  if (!GameState.learnedSpells.includes(spellId)) GameState.learnedSpells.push(spellId);
  if (isStorySpell(spellId)) return;
  if (select || !GameState.selectedSpell) GameState.selectedSpell = spellId;
}

let currentWorld: WorldApi | null = null;
/** Lanza un conjuro concreto ya (lo instala installCasting). Devuelve false si ahora no se puede. */
let castNowHook: ((spellId: string) => boolean) | null = null;
/** Pedido de castSpellNow en espera de su 'spell:resolved'. */
let pendingNow: { spellId: string; resolve: (ev: SpellOutcomeEvent) => void } | null = null;

function lockWorld(world: WorldApi, scale: number): void {
  world.timeScale = scale;
  world.player.controlsLocked = true;
  keys.locked = true;
}

function unlockWorld(world: WorldApi): void {
  world.timeScale = 1;
  world.player.controlsLocked = false;
  keys.locked = false;
  // Las letras escritas no deben convertirse en acciones (X dispara, E interactúa…) al desbloquear.
  keys.clear();
}

/* ============================== MENÚS (Esc / Tab) ============================== */

// En Phaser 4 pause/launch se encolan: evita abrir dos menús con el mismo evento.
let lastMenuAt = 0;

function levelBusy(world: WorldApi): boolean {
  const sm = world.scene.scene;
  const now = performance.now();
  if (now - lastMenuAt < 250) return true;
  if (!sm.isActive() || sm.isPaused() || isCasting()) return true;
  lastMenuAt = now;
  return false;
}

export function openPause(world: WorldApi): void {
  const sm = world.scene.scene;
  if (levelBusy(world) || sm.isActive('Altar')) return;
  sm.pause();
  if (sm.isActive('Dialogue')) sm.pause('Dialogue');
  sm.launch('Pause');
  sm.bringToTop('Pause');
  bus.emit('game:pause', { paused: true });
  sfx('ui_aceptar');
}

export function openDiario(world: WorldApi): void {
  const sm = world.scene.scene;
  if (levelBusy(world) || sm.isActive('Altar') || sm.isActive('Dialogue')) return;
  sm.pause();
  sm.launch('Diario');
  sm.bringToTop('Diario');
  bus.emit('game:pause', { paused: true });
  sfx('ui_aceptar');
}

/* ============================== INSTALACIÓN ============================== */

export function installCasting(world: WorldApi): void {
  currentWorld = world;
  const scene = world.scene;
  const sm = scene.scene;
  let qDownAt = -1; // performance.now() al presionar Q (o -1)

  const toast = (text: string) => bus.emit('hud:toast', { text, ms: 2000 });

  /* ---------- rueda ---------- */
  const openWheel = () => {
    const usable = GameState.learnedSpells.filter((id) => !isStorySpell(id));
    if (!usable.length) {
      toast('Aún no conoces ningún conjuro');
      return;
    }
    wheelState.open = true;
    wheelState.spells = usable;
    wheelState.index = Math.max(0, wheelState.spells.indexOf(GameState.selectedSpell ?? ''));
    lockWorld(world, SLOWMO.wheel);
    sm.launch('Spell', { mode: 'wheel' });
    sm.bringToTop('Spell');
    sfx('ui_mover');
  };
  const closeWheel = (confirm: boolean) => {
    if (!wheelState.open) return;
    wheelState.open = false;
    if (confirm) {
      const id = wheelState.spells[wheelState.index];
      if (id) {
        GameState.selectedSpell = id;
        sfx('ui_aceptar');
      }
    }
    unlockWorld(world);
    if (sm.isActive('Spell')) sm.stop('Spell');
  };

  /* ---------- lanzar ---------- */
  let forcedPrev: { locked: boolean; scale: number } | null = null;
  /** forced = conjuro pedido por el director (castSpellNow): sin exigir selección ni escudo abajo. */
  const cast = (forced?: string) => {
    if (!forced && (!GameState.learnedSpells.length || !GameState.selectedSpell || isStorySpell(GameState.selectedSpell))) {
      toast('Aún no conoces ningún conjuro');
      return;
    }
    // Con el escudo levantado no se lanzan conjuros (GDD 6.5: defenderse o atacar).
    if (!forced && isShieldActive()) {
      toast('Baja el escudo para lanzar un conjuro');
      return;
    }
    const spellId = forced ?? GameState.selectedSpell!;
    bus.emit('spell:begin', { spellId });
    if (isMastered(spellId)) {
      active = {
        spellId,
        session: null,
        auto: true,
        result: { word: spellId, correct: 1, total: 1, fraction: 1, speedRatio: 0, power: 1, outcome: 'perfect' },
        endedAt: performance.now(),
      };
      sm.launch('Spell', { mode: 'cast' });
      sm.bringToTop('Spell');
      emitResolved(world, active);
      return;
    }
    const def = getSpellDef(spellId);
    const now = performance.now();
    lsm.setMode('spell');
    const session = lsm.startSpell(def?.name ?? spellId, now, { letterWindowMs: letterWindowFor(spellId) });
    active = { spellId, session, auto: false, result: null, endedAt: 0 };
    GameState.casting = true;
    // Lanzado por el director: al terminar se devuelve el bloqueo y la ralentización que él tenía.
    forcedPrev = forced ? { locked: world.player.controlsLocked, scale: world.timeScale } : null;
    const slow = GameState.settings.noExtraSlowmo ? 1 : SLOWMO.spell;
    lockWorld(world, forcedPrev ? Math.min(forcedPrev.scale, slow) : slow);
    showCamera(scene.game.canvas);
    sm.launch('Spell', { mode: 'cast' });
    sm.bringToTop('Spell');
    world.player.playOneShot('protagonista_conjuro');
  };

  const onLetter = (letter: string | undefined, r: 'ok' | 'miss' | null) => {
    if (!r || !letter) return;
    bus.emit('spell:letter', { letter, ok: r === 'ok' });
    sfx(r === 'ok' ? 'letra_ok' : 'letra_fallo');
  };

  const finish = () => {
    if (!active?.session) return;
    const r = active.session.result();
    active.result = r;
    active.endedAt = performance.now();
    GameState.casting = false;
    lsm.setMode('off');
    camView.hide();
    unlockWorld(world);
    if (forcedPrev) {
      world.player.controlsLocked = forcedPrev.locked;
      world.timeScale = forcedPrev.scale;
      forcedPrev = null;
    }
    recordCast(active.spellId, r.outcome, r.fraction);
    emitResolved(world, active);
  };

  /* ---------- teclado (DOM: no se pierden pulsaciones cortas) ---------- */
  const onKeyDown = (e: KeyboardEvent) => {
    if (!sm.isActive() || sm.isPaused()) return;
    const s = active?.session;
    if (GameState.casting && s && !s.done) {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const now = performance.now();
      if (e.code === 'Escape') {
        s.cancel(now);
        finish();
        return;
      }
      if (e.key.length === 1) {
        const letter = s.current;
        onLetter(letter, s.typeLetter(e.key, now));
        if (s.done) finish();
      }
      return;
    }
    if (learning) return;
    if (isAction(e.code, 'spell')) {
      if (e.repeat || qDownAt >= 0 || wheelState.open) return;
      if (world.player.controlsLocked || GameState.casting) return;
      qDownAt = performance.now();
      return;
    }
    if (e.repeat) return;
    if (isAction(e.code, 'pause') && !wheelState.open) openPause(world);
    else if (isAction(e.code, 'diary') && !wheelState.open) openDiario(world);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!isAction(e.code, 'spell')) return;
    if (wheelState.open) {
      qDownAt = -1;
      closeWheel(true);
      return;
    }
    if (qDownAt < 0) return;
    const held = performance.now() - qDownAt;
    qDownAt = -1;
    if (!sm.isActive() || sm.isPaused() || GameState.casting || learning) return;
    if (held < SPELL_HOLD_MS) cast();
  };
  const onFullscreen = () => {
    if (!document.fullscreenElement) openPause(world);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('fullscreenchange', onFullscreen);

  /* ---------- cada cuadro, en tiempo real ---------- */
  const onUpdate = () => {
    const now = performance.now();
    if (qDownAt >= 0 && !wheelState.open && now - qDownAt >= SPELL_HOLD_MS) {
      if (world.player.controlsLocked || GameState.casting || learning) qDownAt = -1;
      else openWheel();
    }
    const s = active?.session;
    if (GameState.casting && s && !s.done) {
      const letter = s.current;
      const r = lsm.cameraReady ? lsm.stepSpell(s, now) : s.update(now, null, 0);
      onLetter(letter, r);
      if (s.done) finish();
      else showCamera(scene.game.canvas); // sigue al canvas si cambia el tamaño de la ventana
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  /* ---------- castSpellNow ---------- */
  castNowHook = (spellId: string) => {
    if (!sm.isActive() || sm.isPaused() || GameState.casting || learning) return false;
    if (wheelState.open) closeWheel(false);
    qDownAt = -1;
    // Un resultado anterior aún en pantalla: se reemplaza por el nuevo deletreo.
    if (sm.isActive('Spell')) sm.stop('Spell');
    cast(spellId);
    return true;
  };

  /* ---------- bus ---------- */
  bus.scoped(scene, 'spell:learned', ({ spellId }) => addLearned(spellId, false));

  /* ---------- limpieza ---------- */
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('fullscreenchange', onFullscreen);
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    if (active?.session && !active.session.done) active.session.cancel(performance.now());
    active = null;
    GameState.casting = false;
    wheelState.open = false;
    keys.locked = false;
    lsm.setMode('off');
    camView.hide();
    if (sm.isActive('Spell')) sm.stop('Spell');
    if (currentWorld === world) currentWorld = null;
    castNowHook = null;
    // Un castSpellNow pendiente no se queda colgado: resuelve como fallo.
    if (pendingNow) {
      const p = world.player;
      const pend = pendingNow;
      pendingNow = null;
      pend.resolve({ spellId: pend.spellId, outcome: 'fail', power: 0, auto: false, x: p.x, y: p.y, facing: p.facing });
    }
    finishLearning?.();
  });
}

function emitResolved(world: WorldApi, cast: ActiveCast): void {
  const r = cast.result!;
  const p = world.player;
  const ev: SpellOutcomeEvent = {
    spellId: cast.spellId,
    outcome: r.outcome,
    power: cast.auto ? 1 : Math.min(1, r.power),
    auto: cast.auto,
    x: p.x,
    y: p.y,
    facing: p.facing,
  };
  bus.emit('spell:resolved', ev);
  if (pendingNow && pendingNow.spellId === cast.spellId) {
    const pend = pendingNow;
    pendingNow = null;
    pend.resolve(ev);
  }
  sfx(r.outcome === 'perfect' ? 'perfecto' : r.outcome === 'partial' ? 'conjuro_ok' : 'conjuro_fallo');
}

/* ============================== LANZAR YA (director) ============================== */

/**
 * Abre YA el deletreo de `spellId` (aunque no esté seleccionado ni esté en la rueda; p. ej. la secuencia
 * CONSUELO → MEMORIA → PAZ del Nivel 7) y resuelve con su resultado: el mismo SpellOutcomeEvent que se emite
 * en 'spell:resolved' (outcome 'fail' | 'partial' | 'perfect'). Funciona con cámara y con teclado (Esc cancela →
 * 'fail'), con ralentización y maestría como un lanzamiento normal (si está dominado, sale 'perfect' auto).
 * Si en este momento se está deletreando o aprendiendo otro conjuro (o hay pausa), espera a que termine.
 * No cambia GameState.selectedSpell. Si la escena se apaga antes, resuelve 'fail'.
 */
export function castSpellNow(world: WorldApi, spellId: string): Promise<SpellOutcomeEvent> {
  const fail = (): SpellOutcomeEvent => {
    const p = world.player;
    return { spellId, outcome: 'fail', power: 0, auto: false, x: p.x, y: p.y, facing: p.facing };
  };
  if (!getSpellDef(spellId)) {
    console.warn(`[ECOS] castSpellNow: conjuro desconocido ${spellId}`);
    return Promise.resolve(fail());
  }
  if (pendingNow) {
    // Un pedido anterior sin terminar se da por fallido (no debería pasar: el director espera cada uno).
    const prev = pendingNow;
    pendingNow = null;
    prev.resolve(fail());
  }
  return new Promise<SpellOutcomeEvent>((resolve) => {
    const req = { spellId, resolve };
    const tryStart = () => {
      if (pendingNow !== req) return; // ya se resolvió (apagado de la escena u otro pedido)
      if (!castNowHook || currentWorld !== world) {
        pendingNow = null;
        resolve(fail());
        return;
      }
      // setTimeout y no scene.time: debe seguir intentando aunque la escena esté en pausa.
      if (!castNowHook(spellId)) setTimeout(tryStart, 60);
    };
    pendingNow = req;
    tryStart();
  });
}

/* ============================== APRENDER (GDD 6.1) ============================== */

let finishLearning: (() => void) | null = null;

/**
 * Primera vez que se aprende un conjuro: tiempo MUY ralentizado, explicación guiada letra por letra
 * (forma de la mano) y un deletreo de práctica que no castiga los errores. Al terminar agrega el
 * conjuro a learnedSpells, lo selecciona y emite 'spell:learned'. La llama el director.
 */
export function startLearning(world: WorldApi, spellId: string): Promise<void> {
  const def = getSpellDef(spellId);
  if (!def) {
    console.warn(`[ECOS] startLearning: conjuro desconocido ${spellId}`);
    return Promise.resolve();
  }
  if (GameState.learnedSpells.includes(spellId)) {
    GameState.selectedSpell = spellId;
    bus.emit('hud:toast', { text: `Ya conoces ${def.title}. Revísalo en el Diario (Tab)`, ms: 2400 });
    return Promise.resolve();
  }
  if (learning) return Promise.resolve();
  learning = true;
  const sm = world.scene.scene;
  const prevLocked = world.player.controlsLocked;
  lockWorld(world, SLOWMO.learn);
  sfx('aprender');
  return new Promise<void>((resolve) => {
    let finished = false;
    const done = (completed = true) => {
      if (finished) return;
      finished = true;
      finishLearning = null;
      learning = false;
      lsm.setMode('off');
      camView.hide();
      if (!completed) {
        keys.locked = false;
        resolve();
        return;
      }
      unlockWorld(world);
      world.player.controlsLocked = prevLocked;
      addLearned(spellId, true);
      if (!GameState.mastery[spellId]) GameState.mastery[spellId] = { level: 0, progress: 0 };
      bus.emit('spell:learned', { spellId });
      bus.emit('hud:toast', {
        text: def.type === 'historia' ? `Aprendiste ${def.title}` : `Aprendiste ${def.title}: toca Q para lanzarlo`,
        ms: 3000,
      });
      if (sm.isActive('Spell')) sm.stop('Spell');
      resolve();
    };
    finishLearning = () => done(false);
    sm.launch('Spell', { mode: 'learn', spellId, onDone: () => done(true) });
    sm.bringToTop('Spell');
  });
}
