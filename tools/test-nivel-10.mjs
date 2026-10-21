// Prueba del Nivel 10 (Guadalajara, el final): datos de las tres secciones, diálogos, créditos y el GdlDirector TypeScript
// real con adaptadores de escenas controlables (mocks de Casting, BalamJaguar, Madre, GdlScenery y del mundo).
// No sustituye las pruebas de controles, cámara, audio audible o render en navegador, ni a Tzitzimitl/Itzpapalotl/
// EpilogoScene reales (su integración se prueba en el navegador).
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const config = json('src/data/gdl.json');
const dialogue = json('src/data/dialogue/n10.json');
const creditos = json('src/data/creditos.json');
const levels = {
  gdl_avenida: json('src/data/levels/gdl_avenida.json'),
  catedral: json('src/data/levels/catedral.json'),
  catedral_eclipse: json('src/data/levels/catedral_eclipse.json'),
};
const directorSource = read('src/systems/GdlDirector.ts');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const code = compile(directorSource);
const flush = async () => { for (let i = 0; i < 16; i++) await new Promise((resolve) => setImmediate(resolve)); };

function loadTs(path, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${compile(read(path))}\n})`, {}, { filename: path })(
    (name) => {
      assert.ok(name in dependencies, `Dependencia inesperada en ${path}: ${name}`);
      return dependencies[name];
    }, module, module.exports);
  return module.exports;
}

/** Objeto que acepta cualquier llamada encadenada (sprites, tweens, gráficos) sin hacer nada. */
function fake() {
  const target = function () {};
  const proxy = new Proxy(target, {
    get: (_t, key) => (key === 'then' ? undefined : key === 'x' || key === 'y' ? 0 : proxy),
    apply: () => proxy,
  });
  return proxy;
}

const LEARNED = ['CALMA', 'PROTECCION', 'VOZ', 'LUZ', 'SOL', 'MEMORIA', 'FUEGO', 'VERDAD', 'DESCANSO', 'CONSUELO', 'PAZ'];
const STAGGER_MS = 3500;

function harness({ learned = LEARNED, castApi = true, jaguarApi = true, madreApi = true, roofApi = true, epilogoRegistered = true,
  spellDefs = true } = {}) {
  const state = {
    flags: { 'n07:fragmento_6': true }, learnedSpells: [...learned], mastery: {}, selectedSpell: 'CALMA',
    hp: 1, maxHp: 5, ecos: 0, totalEcosEarned: 0, checkpoint: null, section: 'gdl_avenida', casting: false,
    controlsInverted: false, balamJaguar: false, bound: false,
    shield: { unlocked: true, energy: 1, active: false, broken: false },
    luna: { unlocked: true, energy: 1, active: false }, hasBalam: true, hasMaria: false,
  };
  const emitter = new EventEmitter();
  const emitted = [];
  const dialogues = [];
  const toasts = [];
  const calls = [];
  const rewards = [];
  const sprites = {};
  const castPlan = []; // resultados forzados de castSpellNow: 'fail' | 'partial' | 'perfect' | 'throw'
  const held = []; // temporizadores de la ventana de la madre, a la espera de endStagger()
  let waitingDialogue = null;
  let pending = null;
  let tickFn = null;
  let options = null;
  let currentText = '';
  let lastWorld = null;
  let clock = 0;
  const snapshots = {};
  const bus = {
    emit(name, payload) {
      emitted.push({ name, payload });
      if (name === 'hud:toast') toasts.push(payload.text);
      emitter.emit(name, payload);
      // El World real crea a los enemigos de una arena al emitirse 'arena:start'.
      if (name === 'arena:start' && lastWorld) {
        for (const spec of lastWorld.level.enemies.filter((e) => e.group === payload.group)) {
          const extra = { group: spec.group, rank: spec.rank, lunaOnly: spec.lunaOnly };
          if (spec.type === 'itzpapalotl') extra.hatch = () => calls.push(['hatch']);
          lastWorld.enemies.push(mk(spec.type)(spec.x, spec.y, extra));
        }
      }
    },
    scoped(scene, name, callback) {
      emitter.on(name, callback);
      scene.events.once('shutdown', () => emitter.off(name, callback));
    },
  };
  const casting = {
    startLearning: async (world, id) => {
      // Casting real restaura el tiempo al acabar; el director debe congelar de nuevo el diálogo siguiente.
      world.timeScale = 1;
      world.player.controlsLocked = false;
      calls.push(['learn', id]);
      state.learnedSpells.push(id);
      state.mastery[id] = { level: 0, progress: 0 };
      state.selectedSpell = id;
    },
    getSpellDef: (id) => (spellDefs ? { id, title: id } : undefined),
  };
  if (castApi) {
    casting.castSpellNow = async (world, id) => {
      const planned = castPlan.shift() ?? 'perfect';
      calls.push(['cast', id, planned, world.timeScale, state.bound]);
      if (planned === 'throw') throw new Error('castSpellNow falló');
      world.timeScale = 1;
      world.player.controlsLocked = false;
      return { spellId: id, outcome: planned, power: planned === 'fail' ? 0 : 1, auto: false, x: 0, y: 0, facing: 1 };
    };
  }
  const balam = jaguarApi ? {
    awakenJaguar: async (_world, x, y) => { calls.push(['awaken', x, y]); state.balamJaguar = true; },
    calmJaguar: () => { calls.push(['calm']); state.balamJaguar = false; },
  } : {};
  const madre = madreApi ? {
    placeMadre: (_world, x, y) => calls.push(['placeMadre', x, y]),
    wakeMadre: () => calls.push(['wakeMadre']),
    freeMadre: () => calls.push(['freeMadre']),
    madreApproach: async (x) => { calls.push(['madreApproach', x]); },
    madreGesture: async () => { calls.push(['madreGesture']); },
  } : {};
  const scenery = roofApi ? { openCathedralRoof: (ms) => calls.push(['roof', ms]) } : {};
  const mods = {
    phaser: { Scenes: { Events: { SHUTDOWN: 'shutdown', UPDATE: 'update' } } },
    '../core/bus': { bus, sfx: (name) => bus.emit('sfx', { name }) },
    '../core/GameState': { GameState: state },
    '../ui/fuente': { FUENTE: 'monospace', TAM: { chico: 11, normal: 11, medio: 13, grande: 16, cartel: 22 }, PAD_ACENTO: 2, tamFuente: (n) => n, conEscala: (n) => n, estiloTexto: (px) => ({ fontFamily: 'monospace', fontSize: px + 'px' }) },
    '../config/game': { DEPTH: { ui: 9000, shadow: -100, foreground: 5000 } },
    '../scenes/DialogueScene': {
      playDialogue: async (_scene, id) => {
        assert.ok(Array.isArray(dialogue[id]) && dialogue[id].length > 0, `Diálogo inexistente: ${id}`);
        dialogues.push(id);
        snapshots[id] = { bound: state.bound, scale: lastWorld.timeScale, locked: lastWorld.player.controlsLocked };
        if (id === waitingDialogue) await new Promise((resolve) => { pending = resolve; });
      },
    },
    './Casting': casting,
    './Interact': { installInteract: (_world, opts) => { options = opts; } },
    './LightTrail': { installLightTrail() {}, setObjective() {} },
    './Progression': { addEcos: (n) => { rewards.push(n); state.ecos += n; state.totalEcosEarned += n; } },
    './BalamJaguar': balam,
    './Madre': madre,
    '../world/GdlScenery': scenery,
    '../scenes/EpilogoScene': epilogoRegistered ? { startEpilogo: () => calls.push(['epilogo']) } : {},
    '../data/gdl.json': config,
    './Campaign': { prepareGdlEntry: () => { calls.push(['prepareGdlEntry']); state.flags['n07:fragmento_6'] = true; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${code}\n})`, {}, {
    filename: fileURLToPath(new URL('src/systems/GdlDirector.ts', root)),
  })((name) => {
    assert.ok(name in mods, `Dependencia inesperada: ${name}`);
    return mods[name];
  }, module, module.exports);

  const mk = (kind) => (x, y, extra = {}) => ({
    kind, x, y, alive: true, purified: false, exhausted: false, destroy() { this.alive = false; }, ...extra,
  });

  function install(section, { enemies, px } = {}) {
    const level = levels[section];
    const text = new Proxy({}, { get: (_t, key) => (key === 'setText' ? (t) => { currentText = t; return text; } : key === 'then' ? undefined : () => text) });
    for (const p of level.props) {
      if (p.id && !sprites[`${section}:${p.id}`]) {
        sprites[`${section}:${p.id}`] = {
          alpha: p.alpha ?? 1, visible: true,
          setAlpha(a) { this.alpha = a; return this; },
          setVisible(v) { this.visible = v; return this; },
        };
      }
    }
    const scene = {
      events: new EventEmitter().setMaxListeners(0),
      add: { text: () => text, circle: fake, ellipse: fake, image: fake, sprite: fake, rectangle: fake, container: fake },
      make: { graphics: fake },
      textures: { exists: () => false },
      anims: { exists: () => false },
      children: { getByName: (name) => sprites[`${section}:${name}`] ?? null },
      tweens: { add: (cfg) => { cfg.onComplete?.(); return fake(); } },
      time: {
        get now() { return clock; },
        delayedCall: (ms, callback) => {
          if (ms === STAGGER_MS) held.push(callback); else Promise.resolve().then(callback);
          return fake();
        },
        addEvent: (cfg) => { tickFn = cfg.callback; return fake(); },
      },
      scene: {
        launch: (...args) => calls.push(['launch', ...args]),
        bringToTop() {}, pause() { calls.push(['pause']); },
        isActive: () => true, isPaused: () => false, isSleeping: () => false,
        stop: (key) => calls.push(['stop', key]),
        start: (key) => calls.push(['start', key]),
      },
    };
    const world = {
      scene, level, player: { x: px ?? 100, y: 295, controlsLocked: false },
      enemies: enemies ?? [], timeScale: 1, arena: null,
      flash() {}, shake() {},
      lockArena(x0, x1) { this.arena = [x0, x1]; calls.push(['lockArena', x0, x1]); },
      unlockArena() { this.arena = null; calls.push(['unlockArena']); },
      remove(e) { const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); },
      spawnEnemy(spec) { const enemy = mk(spec.type)(spec.x, spec.y, spec); this.enemies.push(enemy); return enemy; },
      gotoSection(...args) { calls.push(['goto', ...args]); },
    };
    lastWorld = world;
    module.exports.installGdlDirector(world);
    return {
      world, scene,
      tick: () => { clock += config.tickMs; tickFn?.(); },
      shutdown: () => scene.events.emit('shutdown'),
    };
  }

  async function ready(section, opts) {
    const session = install(section, opts);
    await flush();
    return session;
  }
  async function trigger(id) {
    const t = lastWorld.level.triggers.find((entry) => entry.id === id);
    assert.ok(t, `No existe el trigger ${id}`);
    bus.emit('trigger:enter', { trigger: t });
    await flush();
  }
  async function act(action, match = {}) {
    const it = lastWorld.level.interactables.find((entry) => entry.action === action &&
      Object.entries(match).every(([key, value]) => (key === 'id' ? entry.id : entry.data?.[key]) === value));
    assert.ok(it, `No existe interacción ${action} ${JSON.stringify(match)}`);
    if (!options.enabled(it)) return false;
    bus.emit('interact', { id: it.id, action: it.action, data: it.data });
    await flush();
    return true;
  }
  async function ticks(session, n) {
    for (let i = 0; i < n; i++) { session.tick(); await flush(); }
  }
  /** Vence a todos los enemigos vivos de un grupo (o de todos). */
  function clear(group) {
    for (const e of lastWorld.enemies) {
      if (e.alive && !e.purified && (!group || e.group === group)) e.alive = false;
    }
  }
  return {
    state, emitted, dialogues, toasts, calls, rewards, sprites, castPlan, snapshots, install, ready, act, trigger, ticks, clear, mk,
    emit: (name, payload) => bus.emit(name, payload),
    hold: (id) => { waitingDialogue = id; },
    release: async () => { waitingDialogue = null; pending?.(); pending = null; await flush(); },
    endStagger: async () => { held.splice(0).forEach((cb) => cb()); await flush(); },
    gotos: () => calls.filter(([k]) => k === 'goto'),
    called: (name) => calls.filter(([k]) => k === name),
    get text() { return currentText; },
    get enabled() { return options.enabled; },
    get world() { return lastWorld; },
  };
}

let passed = 0;
async function test(name, run) {
  await run();
  console.log(`✓ ${name}`);
  passed++;
}

const count = (level, type, extra = () => true) => level.enemies.filter((e) => e.type === type && extra(e)).length;
const trig = (level, id) => level.triggers.find((t) => t.id === id);
const eclipseValues = (h) => h.emitted.filter((e) => e.name === 'eclipse:progress').map((e) => e.payload.progress);
const boundEvents = (h) => h.emitted.filter((e) => e.name === 'player:bound').map((e) => e.payload.on);

/* ============================== datos ============================== */

const { WalkMap } = loadTs('src/world/WalkMap.ts', { '../config/movement': loadTs('src/config/movement.ts') });
function mapOf(level) {
  const extra = level.props.filter((prop) => prop.collide).map((prop) => ({ shape: 'ellipse', x: prop.x, y: prop.y, ...prop.collide }));
  return new WalkMap(level, extra);
}

await test('Existen las tres secciones con su id, ancho, música y suelo y = 222…345; los JSON no llevan BOM', () => {
  assert.deepEqual(Object.keys(levels), ['gdl_avenida', 'catedral', 'catedral_eclipse']);
  const widths = { gdl_avenida: 2600, catedral: 1800, catedral_eclipse: 1600 };
  const tracks = { gdl_avenida: 'n10_avenida', catedral: 'n10_catedral', catedral_eclipse: 'n10_catedral' };
  const backgrounds = { gdl_avenida: 'fondo_gdl_avenida', catedral: 'fondo_catedral', catedral_eclipse: 'fondo_catedral_eclipse' };
  for (const [id, level] of Object.entries(levels)) {
    assert.equal(level.id, id);
    assert.equal(level.width, widths[id]);
    assert.equal(level.music, tracks[id]);
    assert.equal(level.cameraBounds.x1, widths[id]);
    assert.equal(level.background, backgrounds[id]);
    assert.deepEqual(level.walk, [[[0, 222], [widths[id], 222], [widths[id], 345], [0, 345]]]);
  }
  for (const path of ['src/data/gdl.json', 'src/data/creditos.json', 'src/data/dialogue/n10.json',
    'src/data/levels/gdl_avenida.json', 'src/data/levels/catedral.json', 'src/data/levels/catedral_eclipse.json']) {
    assert.notEqual(read(path).charCodeAt(0), 0xfeff, `${path} sin BOM`);
  }
  assert.deepEqual(config.musica, {
    avenida: 'n10_avenida', catedral: 'n10_catedral', tzitzimime: 'n10_tzitzimime', itzpapalotl: 'n10_itzpapalotl', epilogo: 'n10_epilogo',
  });
});

await test('Avenida: 4 encuentros con grupo (chaneques, bestias, encapuchados rojo/negro/élite, espíritus lunaOnly, momias y el minijefe Don Ernesto), altar, checkpoint y puerta', () => {
  const a = levels.gdl_avenida;
  assert.equal(config.avenida.encuentros.length, 4);
  const types = new Set();
  const ranks = new Set();
  for (const enc of config.avenida.encuentros) {
    const specs = a.enemies.filter((e) => e.group === enc.grupo);
    assert.ok(specs.length >= (enc.jefe ? 1 : 5), `${enc.id}: grupo con enemigos`);
    for (const s of specs) {
      types.add(s.type);
      if (s.rank) ranks.add(s.rank);
      assert.ok(s.x >= enc.x0 && s.x <= enc.x1, `${enc.id}: ${s.type} dentro de su arena`);
      if (s.type === 'espiritu') assert.equal(s.lunaOnly, true);
    }
    const t = a.triggers.find((tr) => tr.action === 'encuentro' && tr.data.id === enc.id);
    assert.ok(t, `trigger del encuentro ${enc.id}`);
    assert.ok(t.x > enc.x0 && t.x < enc.x1, `${enc.id}: el trigger cae dentro de la arena`);
  }
  assert.ok(a.enemies.every((e) => e.group), 'todo enemigo de la avenida pertenece a una arena');
  assert.deepEqual([...types].sort(), ['bestia', 'chaneque', 'don_ernesto', 'encapuchado', 'espiritu', 'momia']);
  assert.deepEqual([...ranks].sort(), ['elite', 'negro', 'rojo']);
  // Momias en 1–2 encuentros; Don Ernesto es el último encuentro, solo en su grupo, con presentación y cierre.
  const conMomias = config.avenida.encuentros.filter((enc) => a.enemies.some((e) => e.group === enc.grupo && e.type === 'momia'));
  assert.ok(conMomias.length >= 1 && conMomias.length <= 2, `momias en 1–2 encuentros (${conMomias.length})`);
  const jefe = config.avenida.encuentros.at(-1);
  assert.equal(jefe.id, 'av4');
  assert.equal(jefe.jefe, true);
  assert.equal(jefe.grupo, 'don_ernesto');
  assert.deepEqual(a.enemies.filter((e) => e.group === 'don_ernesto').map((e) => e.type), ['don_ernesto']);
  assert.ok(dialogue[jefe.intro] && dialogue[jefe.dialogo], 'Don Ernesto tiene presentación y cierre');
  assert.ok(config.avisos[jefe.aviso] && config.avisos.av2.includes('momias'));
  assert.ok(a.spawns.checkpoint && a.spawns.altar && a.spawns.inicio);
  assert.ok(a.props.some((p) => p.key === 'altar_memoria' && p.anim === 'altar_memoria'));
  const altar = a.interactables.find((it) => it.action === 'altar');
  assert.ok(altar && trig(a, 'n10_av_punto_altar').x < altar.x);
  const puerta = trig(a, 'n10_ir_catedral');
  assert.equal(puerta.data.section, 'catedral');
  assert.equal(puerta.data.requires, 'encuentros');
  const trigX = (enc) => a.triggers.find((tr) => tr.action === 'encuentro' && tr.data.id === enc.id).x;
  assert.ok(puerta.x > Math.max(...config.avenida.encuentros.map(trigX)), 'la puerta queda después de todos los encuentros');
  assert.ok(config.avenida.encuentros.slice(0, -1).every((enc) => enc.x1 <= jefe.x1) && puerta.x <= jefe.x1, 'la puerta queda dentro de la arena del minijefe');
  assert.ok(puerta.x > a.enemies.find((e) => e.type === 'don_ernesto').x - 20, 'Don Ernesto guarda la puerta');
  assert.equal(a.triggers.some((tr) => tr.id === 'n10_av_puerta_aviso'), false, 'el aviso de la puerta lo da el diálogo final de Don Ernesto');
  assert.ok(trig(a, 'n10_av_nombre').data.title === 'GUADALAJARA');
});

await test('Catedral: 3 tandas con TODOS los tipos (muñecas, nahuales, momias y los 3 rangos), minijefe Vampiro, altar mayor y emboscada', () => {
  const c = levels.catedral;
  assert.deepEqual(config.catedral.tandas.map((t) => t.grupo), ['ola1', 'ola2', 'ola3']);
  const types = new Set(c.enemies.map((e) => e.type));
  assert.deepEqual([...types].sort(), ['bestia', 'chaneque', 'encapuchado', 'espiritu', 'momia', 'muneca', 'nahual', 'vampiro']);
  assert.ok(c.enemies.filter((e) => e.type === 'momia').length >= 2, 'momias en alguna tanda');
  assert.ok(c.enemies.filter((e) => e.type === 'momia').every((e) => ['ola2', 'ola3'].includes(e.group)));
  assert.deepEqual(c.enemies.filter((e) => e.group === 'vampiro').map((e) => e.type), ['vampiro']);
  const v = config.catedral.vampiro;
  assert.equal(v.grupo, 'vampiro');
  assert.ok(dialogue[v.intro] && dialogue[v.fin] && config.avisos[v.aviso]);
  assert.ok(c.enemies.find((e) => e.type === 'vampiro').x > 1200, 'el Vampiro espera junto al altar');
  assert.deepEqual([...new Set(c.enemies.filter((e) => e.rank).map((e) => e.rank))].sort(), ['elite', 'negro', 'rojo']);
  assert.ok(c.enemies.every((e) => e.group && (e.group === 'vampiro' || config.catedral.tandas.some((t) => t.grupo === e.group))));
  assert.ok(c.enemies.filter((e) => e.type === 'espiritu').every((e) => e.lunaOnly === true));
  assert.ok(c.enemies.every((e) => e.x >= config.catedral.arena.x0 && e.x <= config.catedral.arena.x1));
  const emb = trig(c, 'n10_cat_altar_mayor');
  assert.equal(emb.action, 'emboscada');
  assert.ok(emb.x >= config.catedral.arena.x1, 'la emboscada queda fuera de la arena de la oleada');
  const altar = c.props.find((p) => p.id === 'n10_altar_mayor');
  assert.ok(altar && altar.x > emb.x && altar.x >= 1600 && altar.x <= 1700);
  assert.deepEqual(c.props.filter((p) => p.id?.startsWith('n10_mando_')).map((p) => p.id), config.catedral.emboscada.mandos);
  assert.ok(c.props.filter((p) => p.id?.startsWith('n10_mando_')).every((p) => p.alpha === 0), 'el alto mando aparece en la escena');
  assert.ok(c.spawns.altar_mayor && c.spawns.checkpoint);
  assert.equal(c.interactables.length, 0, 'sin altares después de la avenida (Ecos sin canje)');
});

await test('Catedral eclipse: Tzitzimime 1 → 2 por grupo, capullo de Itzpapálotl, altar y spawn atado junto a él', () => {
  const e = levels.catedral_eclipse;
  assert.deepEqual(config.final.fase1.pasos.map((p) => p.tzitzimime), [1, 2]);
  for (const paso of config.final.fase1.pasos) {
    assert.equal(count(e, 'tzitzimitl', (s) => s.group === paso.grupo), paso.tzitzimime);
    assert.ok(e.enemies.filter((s) => s.group === paso.grupo).length > paso.tzitzimime, 'oleada menor junto a las Tzitzimime');
  }
  const capullo = e.enemies.filter((s) => s.type === 'itzpapalotl');
  assert.equal(capullo.length, 1);
  assert.equal(capullo[0].group, config.final.fase2.grupoCapullo);
  assert.ok(e.spawns.atado && e.spawns.checkpoint);
  assert.ok(Math.abs(e.spawns.atado.x - e.props.find((p) => p.id === 'n10_altar_mayor').x) <= 300, 'atado junto al altar');
  assert.ok(e.enemies.every((s) => s.x >= config.final.arena.x0 && s.x <= config.final.arena.x1));
  assert.equal(config.final.fase2.nucleoMax, 3);
  assert.ok(config.final.timeScale > 0 && config.final.timeScale <= 0.2, 'cámara lenta durante la cadena');
  assert.deepEqual(config.final.pasos.map((p) => `${p.tipo}:${p.conjuro}`), ['lanzar:LUZ', 'lanzar:MEMORIA', 'aprender:ECOS', 'lanzar:ECOS']);
});

await test('Suelo transitable (spawns, enemigos, triggers e interactuables), ids únicos y actions conocidas', () => {
  for (const [id, level] of Object.entries(levels)) {
    const walk = mapOf(level);
    for (const it of level.interactables) {
      assert.ok(it.y >= 220 && it.y <= 345, `${id}: ${it.id} dentro de la franja`);
      assert.equal(walk.isWalkable(it.x, it.y), true, `${id}: interactuable accesible ${it.id}`);
      assert.ok(['n10_examinar', 'altar', 'n10_liberar'].includes(it.action), `${id}: action ${it.action}`);
    }
    for (const [name, point] of Object.entries(level.spawns)) assert.equal(walk.isWalkable(point.x, point.y, 6), true, `${id}: spawn ${name}`);
    assert.equal(walk.isWalkable(level.spawn.x, level.spawn.y, 6), true, `${id}: spawn principal`);
    assert.ok(level.spawns.checkpoint && level.spawns.inicio, `${id}: spawns checkpoint/inicio`);
    for (const enemy of level.enemies) assert.equal(walk.isWalkable(enemy.x, enemy.y, 6), true, `${id}: ${enemy.type} en (${enemy.x}, ${enemy.y})`);
    for (const t of level.triggers) {
      assert.equal(walk.isWalkable(t.x + t.w / 2, t.y + t.h * 0.55), true, `${id}: trigger ${t.id}`);
      assert.ok(t.x >= 0 && t.x + t.w <= level.width, `${id}: trigger ${t.id} dentro del ancho`);
      assert.ok(['letras', 'dialogo', 'punto', 'encuentro', 'ir_seccion', 'emboscada'].includes(t.action), `${id}: action de trigger ${t.action}`);
    }
    for (const prop of level.props) assert.ok(prop.x >= 0 && prop.x <= level.width, `${id}: prop ${prop.key} dentro del ancho`);
    for (const o of level.obstacles) {
      assert.equal(o.shape, 'rect');
      assert.ok(o.height < 32, `${id}: obstáculos saltables con el salto simple`);
    }
    for (const list of [level.interactables, level.triggers, level.props.filter((p) => p.id)]) {
      const ids = list.map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length, `${id}: ids únicos`);
    }
    // Claves de props: existentes en assets.json o con prefijo prop_n10_ (las mapea el escenario).
    const assets = read('src/data/assets.json');
    for (const prop of level.props) {
      assert.ok(prop.key.startsWith('prop_n10_') || assets.includes(`"${prop.key}"`), `${id}: clave de prop desconocida ${prop.key}`);
    }
  }
});

await test('Diálogos: los referenciados existen, hablantes n10_, sin huérfanos, la historia clave y sin violencia gráfica', () => {
  const ids = new Set();
  for (const level of Object.values(levels)) {
    for (const it of level.interactables) if (typeof it.data?.dialogue === 'string') ids.add(it.data.dialogue);
    for (const t of level.triggers) if (typeof t.data?.dialogue === 'string') ids.add(t.data.dialogue);
  }
  for (const match of directorSource.matchAll(/'(n10_[a-z0-9_]+)'/g)) if (dialogue[match[1]]) ids.add(match[1]);
  for (const match of read('src/data/gdl.json').matchAll(/"(n10_[a-z0-9_]+)"/g)) if (dialogue[match[1]]) ids.add(match[1]);
  assert.ok(ids.size >= 34, `hay diálogos suficientes (${ids.size})`);
  for (const id of ids) {
    assert.ok(Array.isArray(dialogue[id]) && dialogue[id].length > 0, `Diálogo existente: ${id}`);
    for (const line of dialogue[id]) {
      assert.ok(line.text.trim().length > 0, `Texto no vacío en ${id}`);
      assert.ok(dialogue._hablantes[line.who], `Hablante conocido en ${id}: ${line.who}`);
    }
  }
  for (const key of Object.keys(dialogue)) {
    assert.ok(key === '_hablantes' || key.startsWith('n10_'), `Prefijo n10_ en ${key}`);
    if (key !== '_hablantes') assert.ok(ids.has(key), `El diálogo ${key} se usa`);
  }
  for (const key of Object.keys(dialogue._hablantes)) assert.ok(key.startsWith('n10_'), `Prefijo n10_ en hablante ${key}`);
  const text = (id) => dialogue[id].map((l) => l.text).join(' ');
  // La trampa: llamada simulada, memoria borrada, dejados vivos desde Xalapa, Códice robado.
  assert.match(text('n10_emboscada'), /borramos parte de la memoria/);
  assert.match(text('n10_emboscada'), /llamada/);
  assert.match(text('n10_emboscada'), /Fue nuestra/);
  assert.match(text('n10_emboscada'), /Te dejamos vivo desde Xalapa/);
  assert.match(text('n10_emboscada'), /bandeja de plata/);
  assert.match(text('n10_codice'), /Códice/);
  assert.match(text('n10_techo'), /Tzitzimime/);
  assert.match(text('n10_capullo'), /capullo/);
  // MAMA y la madre sorda: señas, no voz.
  assert.match(text('n10_recuerdo'), /M\. Luego A\. Luego otra M\. Luego otra A/);
  assert.match(text('n10_recuerdo'), /No hace falta una voz/);
  assert.match(text('n10_libre'), /Las señas no las ata nadie/);
  assert.match(text('n10_reencuentro'), /aquí estoy/);
  // Final extendido: la conversación con la madre (ella habla en señas; Balam vuelve a gato; sin «mudo»).
  const conversacion = config.final.liberar.dialogos;
  assert.deepEqual(conversacion, ['n10_reencuentro', 'n10_reencuentro_2', 'n10_reencuentro_3']);
  const habla = conversacion.flatMap((id) => dialogue[id]);
  assert.ok(habla.filter((l) => l.who === 'n10_madre').length >= 4 && habla.filter((l) => l.who === 'n10_tu').length >= 2, 'conversación real');
  assert.match(conversacion.map(text).join(' '), /señas/);
  assert.match(text('n10_reencuentro_2'), /Balam/);
  assert.match(text('n10_reencuentro_3'), /Vámonos a casa/);
  assert.match(text('n10_final'), /cadenas del altar/);
  // Minijefes: apostador que pactó con el diablo y hombre alto de traje.
  assert.match(text('n10_ernesto_intro'), /eternidad/);
  assert.match(text('n10_ernesto_intro'), /cuido esta puerta/);
  assert.match(text('n10_ernesto_fin'), /puerta de la Catedral/);
  assert.match(text('n10_vampiro_intro'), /hombre alto de traje/);
  assert.match(text('n10_vampiro_intro'), /criatura/);
  for (const [key, lines] of Object.entries(dialogue)) {
    if (key === '_hablantes') continue;
    const all = lines.map((l) => l.text).join(' ');
    assert.doesNotMatch(all, /sangre|sangr|cadáver|cuerpo(s)? (sin vida|inerte)|mutil|decapit|gore/i, `${key}: sin violencia gráfica`);
    assert.doesNotMatch(all, /\bmud[ao]s?\b|sordomud|pobrecit|enferm[ao]/i, `${key}: lenguaje respetuoso con la comunidad sorda`);
  }
});

await test('Conjuros de la historia: ECOS y MAMA se deletrean con letras permitidas de la LSM (y existen en spells.json cuando sistemas los agregue)', () => {
  const allowed = new Set('ABCDEFGHILMNOPRSTUVWYZ');
  for (const word of ['LUZ', 'MEMORIA', 'ECOS', 'MAMA']) {
    assert.ok([...word].every((ch) => allowed.has(ch)), `${word}: solo letras permitidas`);
    assert.ok(word.length <= 10);
  }
  const spells = json('src/data/spells.json');
  const list = spells.spells ?? spells;
  const find = (id) => (Array.isArray(list) ? list.find((s) => s.id === id) : list[id]);
  for (const id of ['ECOS', 'MAMA']) {
    const def = find(id);
    if (def) assert.equal((def.name ?? id).normalize('NFD').replace(/[̀-ͯ]/g, ''), id);
    else console.log(`  (aviso) ${id} aún no está en spells.json: el director lo concede sin aprendizaje guiado.`);
  }
});

await test('gdl.json: avisos ≤ 90 caracteres, números coherentes y música de cada fase', () => {
  for (const [key, text] of Object.entries(config.avisos)) assert.ok(text.length <= 90, `aviso ${key}: ${text.length} caracteres`);
  for (const key of ['av1', 'av2', 'av3', 'av4', 'vampiro', 'liberar', 'tz1', 'tz2', 'capullo', 'mama', 'ventana', 'ventana_cierra', 'luna', 'nucleo_1', 'nucleo_2']) assert.ok(config.avisos[key], `aviso ${key}`);
  assert.deepEqual(config.eclipse.avenida, { desde: 0, hasta: 0.6 });
  assert.equal(config.eclipse.techo, 1);
  assert.equal(config.eclipse.final, 0);
  const regulares = [levels.gdl_avenida, levels.catedral].flatMap((l) => l.enemies).length;
  assert.ok(regulares >= 40, `suficientes enemigos comunes (${regulares})`);
  const directos = config.rewards.encuentro * 3 + config.rewards.minijefe * 2 + config.rewards.tanda * 3 + config.rewards.paso * 4 + config.rewards.conjuro * 2 +
    config.rewards.tzitzimime * 3 + config.rewards.capullo + config.rewards.final;
  assert.ok(directos >= 300 && directos <= 700, `recompensas directas razonables (${directos})`);
});

await test('Créditos: equipo real de Listick Games, IAs, herramientas, soundtrack del equipo y declaración de IA; sin marcadores "[nombre]"', () => {
  assert.equal(creditos.estudio, 'Listick Games');
  const all = JSON.stringify(creditos);
  assert.doesNotMatch(all, /\[nombre\]/);
  const equipo = Object.fromEntries(creditos.equipo.map((m) => [m.nombre, m.roles]));
  assert.deepEqual(Object.keys(equipo), ['Luis David Sosa Fernández', 'Dylan Antonio Hernández Gregorio', 'Miguel Ángel Marcelo Taracena',
    'Mendoza Herrera Gonzalo', 'Jose Manuel Hernández Pacheco']);
  assert.deepEqual(equipo['Luis David Sosa Fernández'], ['Dev Principal', 'Dirección Narrativa', 'Diseño de Niveles', 'Jefe de Proyecto']);
  assert.deepEqual(equipo['Dylan Antonio Hernández Gregorio'], ['Diseño de Arte', 'Diseño de Personajes']);
  assert.deepEqual(equipo['Miguel Ángel Marcelo Taracena'], ['Escritor', 'Diseño de Personajes', 'Diseño de Mecánicas', 'Diseño de Niveles', 'Support Developer']);
  assert.deepEqual(equipo['Mendoza Herrera Gonzalo'], ['Diseñador de Audio', 'Soundtrack', 'Tester', 'QA']);
  assert.deepEqual(equipo['Jose Manuel Hernández Pacheco'], ['Concept Arts', 'Tester']);
  const ias = creditos.secciones.find((sec) => /Inteligencias artificiales/.test(sec.titulo));
  assert.ok(ias, 'sección de IAs');
  assert.deepEqual(ias.lineas.map((l) => l.nombre), ['Claude Code (Anthropic) · Opus 5.5', 'Codex (OpenAI)', 'Gemini Nano Banana (Google)']);
  assert.match(ias.lineas[0].roles.join(','), /Soporte Narrativo.*Documentación/);
  const herramientas = creditos.secciones.find((sec) => sec.titulo === 'Herramientas').lineas.join(' ');
  for (const re of [/Phaser 4/, /TypeScript/, /Vite/, /MediaPipe Tasks Vision/, /Web Audio API/, /Node\.js/, /Python/, /Pillow/, /Git/, /GitHub/, /REAPER/]) assert.match(herramientas, re);
  // La pista de La Llorona no suena en el juego (decisión del equipo, 2026-10-20): no debe acreditarse.
  assert.doesNotMatch(all, /dominio público/);
  for (const re of [/inteligencia artificial/i, /AI_LOG\.md/, /Lengua de Señas Mexicana/, /REAPER/]) assert.match(all, re);
  for (const sec of creditos.secciones) assert.ok(sec.titulo && sec.lineas.length > 0);
  assert.ok(creditos.cierre);
  // CREDITOS.md en sincronía.
  const md = read('CREDITOS.md');
  for (const nombre of Object.keys(equipo)) assert.ok(md.includes(nombre), `CREDITOS.md: ${nombre}`);
  for (const nombre of ['Claude Code', 'Codex', 'Gemini Nano Banana', 'REAPER', 'Pillow']) assert.ok(md.includes(nombre), `CREDITOS.md: ${nombre}`);
  // La escena de epílogo entiende el formato {nombre, roles[]}.
  const epilogo = read('src/scenes/EpilogoScene.ts');
  assert.match(epilogo, /roles/);
  assert.match(epilogo, /lineasPersona/);
});

/* ============================== avenida ============================== */

await test('Avenida: intro, checkpoint, música; el eclipse sube 0 → 0.6 con el avance y nunca retrocede', async () => {
  const h = harness();
  h.hold('n10_llegada');
  const s = await h.ready('gdl_avenida');
  assert.equal(s.world.timeScale, 0, 'la intro congela el mundo');
  await h.release();
  assert.deepEqual(h.dialogues.slice(0, 1), ['n10_llegada']);
  assert.equal(s.world.timeScale, 1);
  assert.equal(h.state.checkpoint.section, 'gdl_avenida');
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n10_avenida'));
  assert.equal(h.state.flags['n10:intro'], true);
  assert.equal(eclipseValues(h)[0], 0);
  for (const x of [200, 900, 1500, 2100, 2500, 2590, 1000]) { s.world.player.x = x; await h.ticks(s, 1); }
  const values = eclipseValues(h);
  for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1] - 1e-9, 'el eclipse nunca retrocede');
  assert.ok(values.every((v) => v >= 0 && v <= 0.6 + 1e-9));
  assert.ok(Math.abs(values.at(-1) - 0.6) < 0.03, 'al final de la avenida el eclipse llega a ~0.6');
});

await test('Avenida: los 4 encuentros bloquean la arena, spawnean por grupo, pagan una vez y la puerta exige los 4 (Don Ernesto incluido)', async () => {
  const h = harness();
  const s = await h.ready('gdl_avenida');
  assert.match(h.text, /AVENIDA 0\/4/);
  await h.trigger('n10_ir_catedral');
  assert.deepEqual(h.gotos(), [], 'la puerta no abre sin despejar');
  assert.ok(h.toasts.includes(config.avisos.puerta_cerrada));
  for (const enc of config.avenida.encuentros) {
    const before = h.rewards.length;
    await h.trigger(`n10_av_enc${enc.id.slice(2)}`);
    assert.deepEqual(h.world.arena, [enc.x0, enc.x1], `${enc.id}: arena bloqueada`);
    const group = h.world.enemies.filter((e) => e.group === enc.grupo);
    assert.equal(group.length, levels.gdl_avenida.enemies.filter((e) => e.group === enc.grupo).length);
    assert.match(h.text, new RegExp(enc.nombre));
    await h.trigger(`n10_av_enc${enc.id.slice(2)}`);
    assert.equal(h.world.enemies.filter((e) => e.group === enc.grupo).length, group.length, 'no se reinicia mientras está activo');
    await h.ticks(s, 2);
    assert.equal(h.world.arena !== null, true, 'no termina con enemigos vivos');
    h.clear(enc.grupo);
    await h.ticks(s, 8);
    assert.equal(h.world.arena, null, `${enc.id}: arena liberada`);
    assert.equal(h.state.flags[`n10:enc:${enc.id}`], true);
    assert.ok(h.rewards.length > before);
    await h.trigger(`n10_av_enc${enc.id.slice(2)}`);
    assert.equal(h.world.enemies.filter((e) => e.group === enc.grupo && e.alive).length, 0, 'un encuentro hecho no se repite');
  }
  assert.ok(h.dialogues.includes('n10_av3_fin'));
  assert.ok(h.dialogues.includes('n10_ernesto_intro') && h.dialogues.includes('n10_ernesto_fin'));
  assert.ok(h.dialogues.indexOf('n10_ernesto_intro') < h.dialogues.indexOf('n10_ernesto_fin'));
  assert.match(h.text, /AVENIDA 4\/4/);
  await h.trigger('n10_ir_catedral');
  assert.deepEqual(h.gotos(), [['goto', 'catedral', undefined]]);
  assert.equal(s.world.player.controlsLocked, false);
});

await test('Avenida: muerte a media pelea → el encuentro se reinicia, lo ya hecho se recuerda; altar, punto de control y examinables', async () => {
  const h = harness();
  const s = await h.ready('gdl_avenida');
  await h.trigger('n10_av_enc1');
  h.clear('av1');
  await h.ticks(s, 8);
  await h.trigger('n10_av_enc2');
  assert.ok(h.world.arena);
  const ecos = h.state.ecos;
  s.shutdown();
  const s2 = await h.ready('gdl_avenida');
  assert.equal(h.state.flags['n10:enc:av1'], true);
  assert.equal(h.state.flags['n10:enc:av2'], undefined);
  assert.equal(h.world.arena, null);
  assert.equal(h.dialogues.filter((d) => d === 'n10_llegada').length, 1, 'la intro no se repite');
  await h.trigger('n10_av_enc2');
  assert.ok(h.world.enemies.filter((e) => e.group === 'av2' && e.alive).length > 0, 'av2 vuelve limpio');
  assert.equal(h.state.ecos, ecos, 'sin premios repetidos');
  h.clear('av2');
  await h.ticks(s2, 8);
  // Altar y punto de control (no se puede ofrendar con una arena activa).
  await h.trigger('n10_av_punto_altar');
  assert.deepEqual([h.state.checkpoint.x, h.state.checkpoint.y], [levels.gdl_avenida.spawns.altar.x, levels.gdl_avenida.spawns.altar.y]);
  assert.equal(await h.act('altar'), true);
  assert.ok(h.calls.some(([k, key]) => k === 'launch' && key === 'Altar'));
  assert.equal(h.state.hp, h.state.maxHp);
  assert.equal(await h.act('n10_examinar', { dialogue: 'n10_cartel' }), true);
  const afterCartel = h.rewards.length;
  assert.equal(await h.act('n10_examinar', { dialogue: 'n10_cartel' }), true);
  assert.equal(h.rewards.length, afterCartel, 'el descubrimiento paga una sola vez');
  await h.trigger('n10_av_nombre');
  assert.ok(h.emitted.some((e) => e.name === 'zone:name' && e.payload.title === 'GUADALAJARA'));
});

await test('Don Ernesto: presentación ANTES de la arena, minijefe pagado aparte, la puerta no abre hasta liberarlo y no se repite', async () => {
  const h = harness();
  const s = await h.ready('gdl_avenida');
  const done = (id) => { h.state.flags[`n10:enc:${id}`] = true; };
  done('av1'); done('av2'); done('av3');
  await h.ticks(s, 1);
  h.hold('n10_ernesto_intro');
  await h.trigger('n10_av_enc4');
  assert.equal(s.world.timeScale, 0, 'la presentación congela el mundo');
  assert.equal(h.world.arena, null, 'la arena aún no se bloquea durante el diálogo');
  assert.equal(h.world.enemies.filter((e) => e.group === 'don_ernesto').length, 0);
  await h.trigger('n10_av_enc4');
  await h.trigger('n10_ir_catedral');
  assert.deepEqual(h.gotos(), [], 'no se puede salir mientras Don Ernesto manda');
  await h.release();
  assert.deepEqual(h.world.arena, [2220, 2590]);
  assert.deepEqual(h.world.enemies.filter((e) => e.group === 'don_ernesto').map((e) => e.kind), ['don_ernesto']);
  assert.ok(h.toasts.includes(config.avisos.av4));
  assert.match(h.text, /Don Ernesto/);
  await h.ticks(s, 8);
  assert.notEqual(h.world.arena, null, 'no termina con el minijefe vivo');
  await h.trigger('n10_ir_catedral');
  assert.deepEqual(h.gotos(), [], 'la puerta sigue cerrada');
  const before = h.rewards.length;
  h.clear('don_ernesto');
  await h.ticks(s, 8);
  assert.equal(h.world.arena, null);
  assert.equal(h.state.flags['n10:enc:av4'], true);
  assert.equal(h.rewards.slice(before)[0], config.rewards.minijefe);
  assert.deepEqual(h.dialogues.slice(-1), ['n10_ernesto_fin']);
  await h.trigger('n10_ir_catedral');
  assert.deepEqual(h.gotos(), [['goto', 'catedral', undefined]]);
  // Reintento: la presentación no se repite.
  s.shutdown();
  const h2 = harness();
  h2.state.flags['n10:dlg:av4_intro'] = true;
  Object.assign(h2.state.flags, { 'n10:enc:av1': true, 'n10:enc:av2': true, 'n10:enc:av3': true });
  const s2 = await h2.ready('gdl_avenida');
  await h2.trigger('n10_av_enc4');
  assert.equal(h2.dialogues.includes('n10_ernesto_intro'), false);
  assert.deepEqual(h2.world.arena, [2220, 2590], 'tras morir, Don Ernesto vuelve sin repetir su presentación');
  assert.equal(s2.world.timeScale, 1);
});

await test('Don Ernesto: si el enemigo aún no está integrado (el grupo nunca aparece) el respaldo libera la puerta y nada queda bloqueado', async () => {
  const h = harness();
  const level = levels.gdl_avenida;
  const original = level.enemies;
  level.enemies = original.filter((e) => e.type !== 'don_ernesto');
  try {
    const s = await h.ready('gdl_avenida');
    Object.assign(h.state.flags, { 'n10:enc:av1': true, 'n10:enc:av2': true, 'n10:enc:av3': true });
    await h.trigger('n10_av_enc4');
    assert.ok(h.world.arena);
    await h.ticks(s, Math.ceil(config.avenida.encuentros[3].respaldoMs / config.tickMs) + 3);
    assert.equal(h.world.arena, null);
    assert.equal(h.state.flags['n10:enc:av4'], true);
    assert.equal(s.world.timeScale, 1);
    assert.equal(s.world.player.controlsLocked, false);
  } finally {
    level.enemies = original;
  }
});

/* ============================== catedral ============================== */

async function playCatedral(h, s) {
  let guard = 0;
  while (!h.state.flags['n10:oleada_fin'] && guard++ < 200) {
    await h.ticks(s, 1);
    h.clear();
  }
  assert.ok(guard < 200, 'la oleada termina');
}

await test('Catedral: oleada en 3 tandas con todos los tipos; al limpiar aparece la madre; premios y diálogos una sola vez', async () => {
  const h = harness();
  h.state.section = 'catedral';
  const s = await h.ready('catedral');
  assert.deepEqual(h.dialogues.slice(0, 1), ['n10_catedral_llegada']);
  assert.deepEqual(h.world.arena, [config.catedral.arena.x0, config.catedral.arena.x1]);
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n10_catedral'));
  assert.equal(eclipseValues(h)[0], config.eclipse.catedral);
  assert.match(h.text, /OLEADA FINAL 1\/3/);
  await h.trigger('n10_cat_altar_mayor');
  assert.equal(h.world.arena !== null, true, 'la emboscada no se dispara durante la oleada');
  assert.equal(h.dialogues.includes('n10_emboscada'), false);
  const seen = new Set();
  const groups = [];
  let guard = 0;
  while (!h.state.flags['n10:oleada_fin'] && guard++ < 200) {
    await h.ticks(s, 1);
    for (const e of h.world.enemies) { if (e.alive) { seen.add(`${e.kind}${e.rank ? ':' + e.rank : ''}`); if (!groups.includes(e.group)) groups.push(e.group); } }
    h.clear();
  }
  assert.ok(guard < 200);
  assert.deepEqual(groups, ['ola1', 'ola2', 'ola3', 'vampiro'], 'tandas en orden y, al final, el Vampiro');
  for (const kind of ['chaneque', 'encapuchado:rojo', 'encapuchado:negro', 'encapuchado:elite', 'espiritu', 'bestia', 'muneca', 'nahual', 'momia', 'vampiro']) {
    assert.ok(seen.has(kind), `aparece ${kind}`);
  }
  for (const t of config.catedral.tandas) assert.equal(h.state.flags[`n10:tanda:${t.id}`], true);
  assert.ok(h.dialogues.includes('n10_ola_1_fin') && h.dialogues.includes('n10_ola_2_fin') && h.dialogues.includes('n10_madre_vista'));
  const orden = ['n10_ola_2_fin', 'n10_vampiro_intro', 'n10_vampiro_fin', 'n10_madre_vista'].map((d) => h.dialogues.indexOf(d));
  assert.deepEqual([...orden].sort((x, y) => x - y), orden, 'Vampiro: presentación → cierre → la madre aparece');
  assert.equal(h.state.flags['n10:vampiro_fin'], true);
  assert.equal(h.world.arena, null);
  assert.deepEqual(h.called('placeMadre').at(-1), ['placeMadre', config.catedral.madre.x, config.catedral.madre.y]);
  assert.equal(h.state.checkpoint.x, levels.catedral.spawns.altar_mayor.x);
  assert.match(h.text, /ALTAR MAYOR/);
  assert.equal(h.rewards.length >= 3, true);
  assert.equal(s.world.player.controlsLocked, false);
  assert.equal(s.world.timeScale, 1);
});

await test('Vampiro: minijefe tras la oleada y antes de la emboscada; arena fija, presentación, premio aparte; la madre y el altar solo después', async () => {
  const h = harness();
  h.state.section = 'catedral';
  const s = await h.ready('catedral');
  let guard = 0;
  while (!h.state.flags['n10:tanda:ola3'] && guard++ < 200) { await h.ticks(s, 1); if (!h.state.flags['n10:tanda:ola3']) h.clear(); }
  assert.ok(guard < 200);
  await h.ticks(s, 2);
  assert.equal(h.state.flags['n10:oleada_fin'], undefined, 'la oleada no termina con el Vampiro pendiente');
  assert.deepEqual(h.called('placeMadre'), [], 'la madre aún no aparece');
  assert.ok(h.dialogues.includes('n10_vampiro_intro'));
  assert.deepEqual(h.world.enemies.filter((e) => e.group === 'vampiro' && e.alive).map((e) => e.kind), ['vampiro']);
  assert.notEqual(h.world.arena, null, 'la arena sigue cerrada');
  assert.match(h.text, /VAMPIRO/);
  assert.ok(h.toasts.includes(config.avisos.vampiro));
  await h.trigger('n10_cat_altar_mayor');
  assert.equal(h.dialogues.includes('n10_emboscada'), false, 'no hay emboscada con el Vampiro vivo');
  await h.ticks(s, 10);
  assert.equal(h.state.flags['n10:vampiro_fin'], undefined);
  const before = h.rewards.length;
  h.clear('vampiro');
  await h.ticks(s, 10);
  assert.equal(h.state.flags['n10:vampiro_fin'], true);
  assert.ok(h.rewards.slice(before).includes(config.rewards.minijefe));
  assert.equal(h.state.flags['n10:oleada_fin'], true);
  assert.equal(h.world.arena, null);
  assert.equal(h.called('placeMadre').length, 1);
  assert.ok(h.dialogues.includes('n10_vampiro_fin'));
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  // Reintento: tras morir contra el Vampiro la oleada no se repite y su presentación tampoco.
  const h2 = harness();
  h2.state.section = 'catedral';
  Object.assign(h2.state.flags, { 'n10:catedral_llegada': true, 'n10:tanda:ola1': true, 'n10:tanda:ola2': true, 'n10:tanda:ola3': true, 'n10:dlg:vampiro_intro': true });
  const s2 = await h2.ready('catedral');
  await h2.ticks(s2, 6);
  assert.deepEqual(h2.world.enemies.filter((e) => e.alive).map((e) => e.group), ['vampiro']);
  assert.equal(h2.dialogues.includes('n10_vampiro_intro'), false);
  assert.equal(h2.state.flags['n10:oleada_fin'], undefined);
});

await test('Vampiro: si el enemigo aún no está integrado, el respaldo no deja la Catedral atascada', async () => {
  const h = harness();
  h.state.section = 'catedral';
  const level = levels.catedral;
  const original = level.enemies;
  level.enemies = original.filter((e) => e.type !== 'vampiro');
  try {
    const s = await h.ready('catedral');
    await playCatedral(h, s);
    assert.equal(h.state.flags['n10:oleada_fin'], true);
    assert.equal(s.world.timeScale, 1);
  } finally {
    level.enemies = original;
  }
});

await test('Catedral: muerte en una tanda retoma la primera sin completar; la emboscada abre el techo, roba el Códice y pasa a catedral_eclipse', async () => {
  const h = harness();
  h.state.section = 'catedral';
  const s = await h.ready('catedral');
  let guard = 0;
  while (!h.state.flags['n10:tanda:ola1'] && guard++ < 100) { await h.ticks(s, 1); h.clear(); }
  assert.equal(h.state.flags['n10:tanda:ola2'], undefined);
  const dialoguesBefore = h.dialogues.filter((d) => d === 'n10_catedral_llegada').length;
  s.shutdown();
  const s2 = await h.ready('catedral');
  assert.equal(h.dialogues.filter((d) => d === 'n10_catedral_llegada').length, dialoguesBefore);
  await h.ticks(s2, 6);
  assert.ok(h.world.enemies.some((e) => e.group === 'ola2' && e.alive), 'reaparece la segunda tanda');
  await playCatedral(h, s2);
  // Emboscada.
  h.hold('n10_emboscada');
  await h.trigger('n10_cat_altar_mayor');
  assert.equal(s2.world.timeScale, 0);
  assert.equal(s2.world.player.controlsLocked, true);
  assert.deepEqual(h.dialogues.slice(-2), ['n10_altar_mayor', 'n10_emboscada']);
  for (const id of config.catedral.emboscada.mandos) assert.equal(h.sprites[`catedral:${id}`].alpha, 1, `${id} visible`);
  await h.release();
  assert.deepEqual(h.dialogues.slice(-5), ['n10_altar_mayor', 'n10_emboscada', 'n10_codice', 'n10_invocacion', 'n10_techo']);
  assert.equal(h.state.flags['n10:codice_perdido'], true);
  assert.deepEqual(h.called('roof'), [['roof', config.catedral.emboscada.techoMs]]);
  assert.equal(eclipseValues(h).at(-1), 1);
  assert.deepEqual(h.gotos(), [['goto', 'catedral_eclipse', 'atado']]);
  assert.equal(h.state.flags['n10:emboscada'], true);
  await h.trigger('n10_cat_altar_mayor');
  assert.equal(h.dialogues.filter((d) => d === 'n10_emboscada').length, 1, 'la emboscada no se repite');
});

await test('Catedral: si falta openCathedralRoof o placeMadre no se rompe nada', async () => {
  const h = harness({ roofApi: false, madreApi: false });
  h.state.section = 'catedral';
  const s = await h.ready('catedral');
  await playCatedral(h, s);
  await h.trigger('n10_cat_altar_mayor');
  assert.deepEqual(h.gotos(), [['goto', 'catedral_eclipse', 'atado']]);
  assert.equal(s.world.timeScale, 1);
});

/* ============================== catedral_eclipse ============================== */

const castCalls = (h) => h.called('cast').map(([, id]) => id);

await test('Eclipse: atado → LUZ → MEMORIA → aprender ECOS → ECOS (fail repite ese paso sin castigo) → libre, Balam jaguar', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  h.castPlan.push('perfect', 'fail', 'fail', 'partial', 'perfect');
  h.hold('n10_culto_2');
  const s = await h.ready('catedral_eclipse');
  assert.equal(h.state.bound, true, 'atado mientras el culto habla');
  assert.deepEqual(boundEvents(h), [true]);
  assert.equal(h.snapshots.n10_culto_2.bound, true);
  assert.equal(s.world.timeScale, 0);
  assert.deepEqual(h.called('placeMadre'), [['placeMadre', config.final.madre.x, config.final.madre.y]]);
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n10_catedral'));
  assert.equal(eclipseValues(h)[0], 1);
  await h.release();
  assert.deepEqual(castCalls(h), ['LUZ', 'MEMORIA', 'MEMORIA', 'MEMORIA', 'ECOS']);
  assert.deepEqual(h.called('learn'), [['learn', 'ECOS']]);
  assert.ok(h.called('cast').every(([, , , scale, bound]) => scale === config.final.timeScale && bound === true), 'cámara lenta y atado en cada lanzamiento');
  assert.equal(h.dialogues.filter((d) => d === 'n10_memoria_repite').length, 1, 'el primer fallo explica; los demás solo avisan');
  assert.ok(h.toasts.some((t) => /Otra vez, con calma/.test(t)));
  const order = h.dialogues.filter((d) => /^n10_(atado|culto|luz|memoria|ecos|libre|jaguar)/.test(d));
  assert.deepEqual(order, ['n10_atado', 'n10_culto_1', 'n10_luz_ok', 'n10_culto_2', 'n10_memoria_repite', 'n10_memoria_ok',
    'n10_culto_3', 'n10_ecos_aviso', 'n10_ecos_ok', 'n10_libre', 'n10_jaguar']);
  assert.equal(h.state.bound, false);
  assert.deepEqual(boundEvents(h), [true, false]);
  assert.equal(h.state.flags['n10:libre'], true);
  assert.equal(h.called('awaken').length, 1);
  assert.equal(h.state.balamJaguar, true);
  for (const id of ['luz', 'memoria', 'ecos_aprender', 'ecos']) assert.equal(h.state.flags[`n10:paso:${id}`], true);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
});

await test('Eclipse: un deletreo que falla al instante muchas veces no cuelga el juego; un error de Casting no deja nada bloqueado y se reintenta', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  h.castPlan.push(...Array(8).fill('fail'));
  const s = await h.ready('catedral_eclipse');
  assert.equal(h.state.flags['n10:libre'], true, 'el paso se da por logrado tras 6 fallos instantáneos');
  assert.equal(h.state.bound, false);
  s.shutdown();
  // Error de un sistema ajeno a mitad de la cadena.
  const h2 = harness();
  h2.state.section = 'catedral_eclipse';
  h2.castPlan.push('perfect', 'throw');
  const s2 = await h2.ready('catedral_eclipse');
  assert.equal(h2.state.flags['n10:libre'], undefined);
  assert.equal(h2.state.bound, false, 'nunca queda atado');
  assert.equal(s2.world.timeScale, 1, 'nunca queda congelado');
  assert.equal(s2.world.player.controlsLocked, false);
  await h2.ticks(s2, 1);
  assert.equal(h2.state.flags['n10:libre'], true, 'el tick reintenta la cadena');
  assert.equal(h2.state.flags['n10:paso:luz'], true);
  assert.equal(castCalls(h2).filter((id) => id === 'LUZ').length, 1, 'LUZ no se repite');
});

async function freeAndFase1(h) {
  const s = await h.ready('catedral_eclipse');
  await h.ticks(s, 1);
  return s;
}

await test('Fase 1: arena, capullo presente, 3 Tzitzimime escalonadas 1 → 2 con oleada menor; al caer todas el capullo estalla', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  const s = await freeAndFase1(h);
  assert.deepEqual(h.world.arena, [config.final.arena.x0, config.final.arena.x1]);
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n10_tzitzimime'));
  assert.ok(h.world.enemies.some((e) => e.kind === 'itzpapalotl'), 'el capullo ya está en escena');
  assert.deepEqual(h.dialogues.slice(-1), ['n10_tz_1']);
  assert.equal(h.world.enemies.filter((e) => e.kind === 'tzitzimitl' && e.alive).length, 1);
  assert.ok(h.world.enemies.some((e) => e.group === 'f1_a' && e.kind !== 'tzitzimitl'), 'oleada menor');
  assert.match(h.text, /TZITZIMIME 0\/3/);
  assert.ok(h.toasts.includes(config.avisos.tz1));
  await h.ticks(s, 2);
  assert.equal(h.world.enemies.filter((e) => e.kind === 'tzitzimitl' && e.alive).length, 1, 'la segunda oleada no entra antes');
  h.clear('f1_a');
  await h.ticks(s, 8);
  assert.equal(h.state.flags['n10:f1:f1_a'], true);
  assert.equal(h.world.enemies.filter((e) => e.kind === 'tzitzimitl' && e.alive).length, 2, 'entran 2 Tzitzimime');
  assert.ok(h.dialogues.includes('n10_tz_2'));
  assert.match(h.text, /TZITZIMIME 1\/3/);
  h.clear('f1_b');
  await h.ticks(s, 8);
  assert.equal(h.state.flags['n10:f1_fin'], true);
  assert.ok(h.dialogues.includes('n10_capullo'));
  assert.equal(h.called('hatch').length, 1, 'el capullo estalla una sola vez');
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n10_itzpapalotl'));
  assert.ok(h.dialogues.includes('n10_itzpa'));
  assert.match(h.text, /ITZPAPÁLOTL/);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
});

await test('Fase 2: el núcleo dispara el recuerdo → aprende MAMA → madre despierta; MAMA abre la ventana y ECOS golpea; 3 golpes → final → caminar a la madre → E → conversación → epílogo', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  const s = await freeAndFase1(h);
  h.clear('f1_a'); await h.ticks(s, 8); h.clear('f1_b'); await h.ticks(s, 8);
  assert.equal(h.called('wakeMadre').length, 0, 'la madre sigue dormida hasta el recuerdo');
  h.hold('n10_recuerdo_fin');
  h.emit('itzpa:core', { hits: 0, max: 3 });
  await flush();
  assert.equal(s.world.timeScale, 0, 'el recuerdo congela la pelea');
  assert.deepEqual(h.called('learn'), [['learn', 'ECOS'], ['learn', 'MAMA']]);
  await h.release();
  assert.deepEqual(h.dialogues.slice(-2), ['n10_recuerdo', 'n10_recuerdo_fin']);
  assert.equal(h.called('wakeMadre').length, 1);
  assert.equal(h.state.selectedSpell, 'MAMA');
  assert.ok(h.toasts.includes(config.avisos.mama));
  assert.equal(h.state.flags['n10:recuerdo'], true);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  h.emit('itzpa:core', { hits: 0, max: 3 });
  await flush();
  assert.equal(h.dialogues.filter((d) => d === 'n10_recuerdo').length, 1, 'el recuerdo solo ocurre una vez');
  // Ventana: la madre responde, ECOS al núcleo.
  h.emit('madre:sign', { x: 1400, y: 262, ms: 1200 });
  h.emit('itzpa:stagger', { ms: STAGGER_MS });
  assert.equal(h.state.selectedSpell, 'ECOS');
  assert.ok(h.toasts.includes(config.avisos.ventana));
  assert.match(h.text, /ECOS \(Q\) AHORA/);
  assert.ok(h.toasts.every((t) => t.length <= 90), 'avisos cortos');
  await h.endStagger();
  assert.equal(h.state.selectedSpell, 'MAMA');
  assert.ok(h.toasts.includes(config.avisos.ventana_cierra));
  assert.match(h.text, /MAMA \(Q\) abre la ventana/);
  h.emit('itzpa:core', { hits: 1, max: 3 });
  h.emit('itzpa:core', { hits: 2, max: 3 });
  assert.ok(h.toasts.includes(config.avisos.nucleo_1) && h.toasts.includes(config.avisos.nucleo_2));
  assert.match(h.text, /NÚCLEO 2\/3/);
  // Final.
  h.emit('boss:calmed', {});
  await flush();
  await h.ticks(s, 1);
  // Final extendido, parte 1: la jefa cae, el jugador RECUPERA el control y camina hacia la madre.
  assert.deepEqual(h.dialogues.slice(-1), ['n10_final']);
  assert.equal(eclipseValues(h).at(-1), 0, 'el sol regresa');
  assert.equal(h.state.flags['n10:itzpa_cae'], true);
  assert.equal(h.world.arena, null, 'sin enemigos: la arena se abre');
  assert.equal(s.world.timeScale, 1, 'el mundo no queda congelado');
  assert.equal(s.world.player.controlsLocked, false, 'el jugador recupera el control');
  assert.equal(h.called('freeMadre').length, 0, 'la madre sigue encadenada hasta pulsar E');
  assert.equal(h.state.flags['n10:completo'], undefined);
  assert.deepEqual(h.called('epilogo'), []);
  assert.match(h.text, /Libera a tu madre/);
  const liberar = levels.catedral_eclipse.interactables.find((it) => it.action === 'n10_liberar');
  assert.ok(liberar && liberar.prompt === 'Liberar a mamá', 'interactuable "Liberar a mamá (E)"');
  const objetivo = h.emitted.filter((e) => e.name === 'objective').at(-1).payload;
  assert.deepEqual([objetivo.x, objetivo.y, objetivo.section], [liberar.x, liberar.y, 'catedral_eclipse'], 'rastro de luz hacia la madre');
  assert.ok(h.toasts.includes(config.avisos.liberar));
  assert.equal(h.enabled(liberar), true);
  assert.equal(h.world.enemies.filter((e) => e.alive && e.kind !== 'itzpapalotl').length, 0, 'sin enemigos (la jefa calmada se retira sola)');
  await h.ticks(s, 3);
  assert.equal(h.called('start').length, 0);
  assert.equal(h.called('hatch').length, 1, 'no se reinicia la pelea');
  // Parte 2: E rompe las cadenas, suena n10_reencuentro y hablan.
  assert.equal(await h.act('n10_liberar'), true);
  assert.deepEqual(h.dialogues.slice(-3), ['n10_reencuentro', 'n10_reencuentro_2', 'n10_reencuentro_3']);
  assert.equal(h.called('freeMadre').length, 1);
  assert.equal(h.called('madreApproach').length, 1);
  assert.ok(h.called('madreGesture').length >= 3, 'la madre hace señas durante la conversación');
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n10_reencuentro'));
  assert.equal(h.called('calm').length, 1, 'Balam vuelve a gato');
  assert.equal(h.state.balamJaguar, false);
  assert.ok(h.dialogues.indexOf('n10_reencuentro_2') > h.dialogues.indexOf('n10_reencuentro'));
  assert.equal(h.state.flags['n10:madre_libre'], true);
  assert.equal(h.state.flags['n10:completo'], true);
  assert.equal(await h.act('n10_liberar'), false, 'no se puede liberar dos veces');
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n10_epilogo'));
  assert.deepEqual(h.called('epilogo'), [['epilogo']]);
  assert.deepEqual(h.called('start'), [], 'no vuelve al título');
  assert.equal(h.state.bound, false);
  assert.equal(h.world.arena, null);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
});

async function hastaLiberar(h) {
  const s = await freeAndFase1(h);
  h.clear('f1_a'); await h.ticks(s, 8); h.clear('f1_b'); await h.ticks(s, 8);
  h.emit('itzpa:core', { hits: 0, max: 3 });
  await flush();
  h.emit('boss:calmed', {});
  await flush();
  await h.ticks(s, 1);
  return s;
}

await test('Final extendido: salir a medias no repite la pelea; el objetivo vuelve y la conversación se retoma sin duplicar premios', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  const s = await hastaLiberar(h);
  const hatches = h.called('hatch').length;
  const ecos = h.state.ecos;
  s.shutdown();
  const s2 = await h.ready('catedral_eclipse');
  await h.ticks(s2, 3);
  assert.equal(h.world.enemies.filter((e) => e.alive && e.group !== 'capullo').length, 0, 'no reaparecen Tzitzimime');
  assert.equal(h.called('hatch').length, hatches, 'el capullo no vuelve a estallar');
  assert.match(h.text, /Libera a tu madre/);
  assert.deepEqual(h.called('placeMadre').length, 2);
  assert.equal(h.dialogues.filter((d) => d === 'n10_reintento').length, 0);
  assert.equal(h.state.ecos, ecos);
  assert.equal(await h.act('n10_liberar'), true);
  assert.equal(h.state.flags['n10:completo'], true);
  assert.deepEqual(h.called('epilogo'), [['epilogo']]);
  // Se salió JUSTO después de romper las cadenas: la conversación se reanuda sola.
  const h2 = harness();
  Object.assign(h2.state.flags, { 'n10:libre': true, 'n10:itzpa_cae': true, 'n10:madre_libre': true, 'n10:f1_fin': true, 'n10:recuerdo': true });
  h2.state.section = 'catedral_eclipse';
  await h2.ready('catedral_eclipse');
  assert.deepEqual(h2.dialogues.filter((d) => /^n10_reencuentro/.test(d)), ['n10_reencuentro', 'n10_reencuentro_2', 'n10_reencuentro_3']);
  assert.equal(h2.state.flags['n10:completo'], true);
  assert.deepEqual(h2.called('epilogo'), [['epilogo']]);
});

await test('Final extendido: si la conversación falla a medias (error ajeno) el jugador puede volver a intentarlo con E y nada queda bloqueado', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  const s = await hastaLiberar(h);
  const fail = h.world.scene;
  const real = fail.time.delayedCall;
  let boom = true;
  h.world.scene.time.delayedCall = (ms, cb) => { if (boom && ms === config.final.liberar.rompeMaxMs) { boom = false; throw new Error('timer roto'); } return real(ms, cb); };
  assert.equal(await h.act('n10_liberar'), true);
  assert.equal(h.state.flags['n10:completo'], undefined, 'no se completó');
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  assert.match(h.text, /Libera a tu madre/, 'vuelve a esperar la liberación');
  assert.equal(await h.act('n10_liberar'), true);
  assert.equal(h.state.flags['n10:completo'], true);
});



await test('Muerte en la Fase 1: no repite la cadena atada, Balam vuelve a despertar y se retoma en la Tzitzimitl alcanzada', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  const s = await freeAndFase1(h);
  h.clear('f1_a'); await h.ticks(s, 8);
  assert.equal(h.state.flags['n10:f1:f1_a'], true);
  const castsBefore = h.called('cast').length;
  const ecos = h.state.ecos;
  s.shutdown();
  const s2 = await h.ready('catedral_eclipse');
  assert.equal(h.state.bound, false);
  assert.deepEqual(boundEvents(h), [true, false], 'no vuelve a atarse');
  assert.equal(h.called('cast').length, castsBefore, 'la cadena no se repite');
  assert.equal(h.called('awaken').length, 2, 'Balam vuelve a despertar');
  assert.ok(h.dialogues.includes('n10_reintento'));
  assert.equal(h.dialogues.filter((d) => d === 'n10_atado').length, 1);
  await h.ticks(s2, 1);
  assert.equal(h.world.enemies.filter((e) => e.kind === 'tzitzimitl' && e.alive).length, 2, 'reaparece la segunda oleada, no la primera');
  assert.equal(h.world.enemies.filter((e) => e.group === 'f1_a' && e.alive).length, 0);
  assert.equal(h.state.ecos, ecos, 'sin premios repetidos');
  assert.equal(s2.world.timeScale, 1);
  assert.equal(s2.world.player.controlsLocked, false);
});

await test('Muerte en la Fase 2: reaparece directo en Fase 2 (capullo ya roto, sin cinematic), la madre despierta y MAMA seleccionado', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  const s = await freeAndFase1(h);
  h.clear('f1_a'); await h.ticks(s, 8); h.clear('f1_b'); await h.ticks(s, 8);
  h.emit('itzpa:core', { hits: 0, max: 3 });
  await flush();
  assert.equal(h.state.flags['n10:recuerdo'], true);
  s.shutdown();
  const s2 = await h.ready('catedral_eclipse');
  await h.ticks(s2, 1);
  assert.equal(h.dialogues.filter((d) => d === 'n10_capullo').length, 1, 'la escena del capullo no se repite');
  assert.equal(h.dialogues.filter((d) => d === 'n10_recuerdo').length, 1, 'el recuerdo no se repite');
  assert.equal(h.world.enemies.filter((e) => e.kind === 'tzitzimitl' && e.alive).length, 0);
  assert.ok(h.world.enemies.some((e) => e.kind === 'itzpapalotl'));
  assert.equal(h.called('hatch').length, 2, 'el capullo nace roto');
  assert.deepEqual(h.world.arena, [config.final.arena.x0, config.final.arena.x1]);
  assert.equal(h.called('wakeMadre').length, 2);
  assert.equal(h.state.selectedSpell, 'MAMA');
  assert.equal(h.state.bound, false);
  assert.match(h.text, /ITZPAPÁLOTL/);
  assert.equal(h.called('learn').filter(([, id]) => id === 'MAMA').length, 1);
});

await test('Sin APIs de otros agentes (jaguar, madre, ECOS/MAMA en spells.json, castSpellNow, escena Epilogo) el nivel igual se puede terminar y vuelve al título', async () => {
  const h = harness({ castApi: false, jaguarApi: false, madreApi: false, roofApi: false, epilogoRegistered: false, spellDefs: false });
  h.state.section = 'catedral_eclipse';
  const s = await h.ready('catedral_eclipse');
  assert.equal(h.state.flags['n10:libre'], true);
  assert.equal(h.state.bound, false);
  assert.equal(h.state.balamJaguar, true, 'respaldo: marca el jaguar aunque no exista la API');
  assert.ok(h.state.learnedSpells.includes('ECOS'));
  await h.ticks(s, 1);
  h.clear('f1_a'); await h.ticks(s, 8); h.clear('f1_b'); await h.ticks(s, 8);
  assert.equal(h.called('hatch').length, 1);
  h.emit('itzpa:core', { hits: 0, max: 3 });
  await flush();
  assert.ok(h.state.learnedSpells.includes('MAMA'));
  h.emit('boss:calmed', {});
  await flush();
  await h.ticks(s, 1);
  assert.equal(await h.act('n10_liberar'), true);
  await h.ticks(s, 1);
  assert.equal(h.state.flags['n10:completo'], true);
  assert.equal(h.state.balamJaguar, false);
  assert.deepEqual(h.called('start'), [['start', 'Title']]);
  for (const key of ['Hud', 'Level', 'Dialogue']) assert.ok(h.calls.some(([k, name]) => k === 'stop' && name === key), `cierra ${key}`);
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === null));
});

await test('Respaldos: si Itzpapálotl nunca aparece se da por calmada; si el núcleo no avisa, el recuerdo ocurre igualmente', async () => {
  const h = harness();
  h.state.section = 'catedral_eclipse';
  const s = await freeAndFase1(h);
  h.clear('f1_a'); await h.ticks(s, 8); h.clear('f1_b'); await h.ticks(s, 8);
  await h.ticks(s, Math.ceil(config.final.fase2.nucleoMs / config.tickMs) + 2);
  assert.equal(h.state.flags['n10:recuerdo'], true, 'sin evento itzpa:core el recuerdo llega por tiempo');
  const h2 = harness();
  h2.state.section = 'catedral_eclipse';
  const original = levels.catedral_eclipse.enemies;
  levels.catedral_eclipse.enemies = original.filter((e) => e.type !== 'itzpapalotl'); // la jefa aún no está integrada
  try {
    const s2 = await freeAndFase1(h2);
    h2.clear('f1_a'); await h2.ticks(s2, 8); h2.clear('f1_b'); await h2.ticks(s2, 8);
    await h2.ticks(s2, Math.ceil(config.final.fase2.respaldoMs / config.tickMs) + 3);
    assert.equal(h2.state.flags['n10:itzpa_cae'], true, 'respaldo: la jefa ausente se da por calmada');
    assert.equal(await h2.act('n10_liberar'), true, 'y se puede liberar a la madre');
    assert.equal(h2.state.flags['n10:completo'], true, 'respaldo: no se queda atascado');
  } finally {
    levels.catedral_eclipse.enemies = original;
  }
});

await test('Entrada directa sin fragmentos prepara la entrada; ECOS/MAMA se recuerdan al reintentar; el cierre de escena nunca deja atado', async () => {
  const h = harness();
  h.state.flags = {};
  h.state.section = 'catedral';
  await h.ready('catedral');
  assert.ok(h.called('prepareGdlEntry').length >= 1);
  assert.equal(h.state.section, 'catedral');
  const h2 = harness({ learned: LEARNED.filter((x) => x !== 'LUZ') });
  h2.state.section = 'catedral_eclipse';
  h2.hold('n10_culto_1');
  const s2 = await h2.ready('catedral_eclipse');
  assert.ok(h2.state.learnedSpells.includes('LUZ'), 'se concede LUZ para pruebas');
  assert.equal(h2.state.bound, true);
  s2.shutdown();
  assert.equal(h2.state.bound, false, 'al salir de la escena nunca se deja atado');
  assert.equal(boundEvents(h2).at(-1), false);
  await h2.release();
});

console.log(`\n${passed} pruebas correctas.`);
