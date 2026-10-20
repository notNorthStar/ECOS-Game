// Prueba del Nivel 7 (CDMX parte 2): datos de las tres secciones y el Cdmx2Director TypeScript real con adaptadores
// de escenas controlables (mocks de Casting, Maria, Llorona y del mundo). No sustituye las pruebas de controles,
// cámara, audio audible o render en navegador, ni al jefe real (ReyOlvido) ni a Llorona.ts reales.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const config = json('src/data/cdmx2.json');
const dialogue = json('src/data/dialogue/n07.json');
const levels = {
  teleferico: json('src/data/levels/teleferico.json'),
  torre: json('src/data/levels/torre.json'),
  salon_trono: json('src/data/levels/salon_trono.json'),
};
const directorSource = read('src/systems/Cdmx2Director.ts');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const code = compile(directorSource);
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve)); };

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

function harness({ hasMaria = true, learned = ['CALMA', 'PROTECCION', 'VOZ', 'LUZ', 'SOL', 'MEMORIA', 'FUEGO', 'VERDAD', 'DESCANSO'],
  spellDefs = true, castApi = true } = {}) {
  const state = {
    flags: {}, learnedSpells: [...learned], mastery: {}, selectedSpell: 'CALMA',
    hp: 1, maxHp: 5, ecos: 0, totalEcosEarned: 0, checkpoint: null, section: 'teleferico', casting: false,
    controlsInverted: false,
    shield: { unlocked: true, energy: 1, active: false, broken: false },
    luna: { unlocked: true, energy: 1, active: false }, hasBalam: true, hasMaria,
  };
  const emitter = new EventEmitter();
  const emitted = [];
  const dialogues = [];
  const toasts = [];
  const calls = [];
  const rewards = [];
  const sprites = {};
  const castPlan = []; // resultados forzados de castSpellNow: 'fail' | 'partial' | 'perfect' | 'throw'
  let waitingDialogue = null;
  let pending = null;
  let tickFn = null;
  let options = null;
  let currentText = '';
  let lastWorld = null;
  let lastSection = null;
  const bus = {
    emit(name, payload) {
      emitted.push({ name, payload });
      if (name === 'hud:toast') toasts.push(payload.text);
      emitter.emit(name, payload);
      // El World real crea a los enemigos de una arena al emitirse 'arena:start'.
      if (name === 'arena:start' && lastWorld) {
        for (const spec of lastWorld.level.enemies.filter((e) => e.group === payload.group)) {
          lastWorld.enemies.push(mk(spec.type)(spec.x, spec.y, { group: spec.group }));
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
      calls.push(['cast', id, planned, world.timeScale]);
      if (planned === 'throw') throw new Error('castSpellNow falló');
      world.timeScale = 1;
      world.player.controlsLocked = false;
      return { spellId: id, outcome: planned, power: planned === 'fail' ? 0 : 1, auto: false, x: 0, y: 0, facing: 1 };
    };
  }
  const mods = {
    phaser: { Scenes: { Events: { SHUTDOWN: 'shutdown', UPDATE: 'update' } } },
    '../core/bus': { bus, sfx: (name) => bus.emit('sfx', { name }) },
    '../core/GameState': { GameState: state },
    '../config/game': { DEPTH: { ui: 9000, shadow: -100, foreground: 5000 } },
    '../scenes/DialogueScene': {
      playDialogue: async (_scene, id) => {
        assert.ok(Array.isArray(dialogue[id]) && dialogue[id].length > 0, `Diálogo inexistente: ${id}`);
        dialogues.push(id);
        if (id === waitingDialogue) await new Promise((resolve) => { pending = resolve; });
      },
    },
    './Casting': casting,
    './Interact': { installInteract: (_world, opts) => { options = opts; } },
    './LightTrail': { installLightTrail() {}, setObjective() {} },
    './Progression': { addEcos: (n) => { rewards.push(n); state.ecos += n; state.totalEcosEarned += n; } },
    './Maria': {
      mariaSay: (text) => calls.push(['mariaSay', text]),
      mariaTransform: () => { calls.push(['mariaTransform']); state.hasMaria = false; },
      getMariaPosition: () => ({ x: 640, y: 300 }),
    },
    './Llorona': {
      summonLlorona: (_world, x, y) => calls.push(['summon', x, y]),
      dismissLlorona: () => calls.push(['dismiss']),
      setLloronaWild: (on) => calls.push(['wild', on]),
    },
    '../data/cdmx2.json': config,
    './Campaign': {
      prepareGdlEntry: () => calls.push(['prepareGdlEntry']),
      prepareCdmx2Entry: () => {
        calls.push(['prepareCdmx2Entry']);
        state.hasMaria = true;
        state.checkpoint = null;
        state.section = 'teleferico';
        for (const id of ['VERDAD', 'FUEGO', 'DESCANSO']) if (!state.learnedSpells.includes(id)) state.learnedSpells.push(id);
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${code}\n})`, {}, {
    filename: fileURLToPath(new URL('src/systems/Cdmx2Director.ts', root)),
  })((name) => {
    assert.ok(name in mods, `Dependencia inesperada: ${name}`);
    return mods[name];
  }, module, module.exports);

  const mk = (kind) => (x, y, extra = {}) => ({
    kind, x, y, alive: true, purified: false, exhausted: false, destroy() { this.alive = false; }, ...extra,
  });

  function install(section, { enemies, px } = {}) {
    const level = levels[section];
    lastSection = section;
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
        now: 0,
        delayedCall: (_ms, callback) => { Promise.resolve().then(callback); return fake(); },
        addEvent: (cfg) => { tickFn = cfg.callback; return fake(); },
      },
      scene: {
        launch: (...args) => calls.push(['launch', ...args]),
        bringToTop() {}, pause() { calls.push(['pause']); },
        isActive: () => true, isPaused: () => false,
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
      remove(e) { const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); calls.push(['remove', e]); },
      spawnEnemy(spec) {
        const enemy = mk(spec.type)(spec.x, spec.y, { group: spec.group, rank: spec.rank, lunaOnly: spec.lunaOnly });
        this.enemies.push(enemy);
        calls.push(['spawn', spec]);
        return enemy;
      },
      gotoSection(...args) { calls.push(['goto', ...args]); },
    };
    lastWorld = world;
    module.exports.installCdmx2Director(world);
    return { world, scene, tick: () => tickFn?.(), shutdown: () => scene.events.emit('shutdown') };
  }

  async function ready(section, opts) {
    const session = install(section, opts);
    await flush();
    return session;
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
  async function trigger(id) {
    const t = lastWorld.level.triggers.find((entry) => entry.id === id);
    assert.ok(t, `No existe el trigger ${id}`);
    bus.emit('trigger:enter', { trigger: t });
    await flush();
  }
  /** Avanza el director n ticks (cada uno = config.teleferico.tickMs de reloj de oleada). */
  async function ticks(session, n) {
    for (let i = 0; i < n; i++) { session.tick(); await flush(); }
  }
  return {
    state, emitted, dialogues, toasts, calls, rewards, sprites, castPlan, install, ready, act, trigger, ticks, mk,
    emit: (name, payload) => bus.emit(name, payload),
    hold: (id) => { waitingDialogue = id; },
    release: async () => { waitingDialogue = null; pending?.(); pending = null; await flush(); },
    down(enemy) { enemy.alive = false; bus.emit('cofradia:down', { enemy }); },
    purify(enemy) { enemy.alive = false; enemy.purified = true; bus.emit('enemy:purified', { enemy, ecos: 1, perfect: false }); },
    gotos: () => calls.filter(([k]) => k === 'goto'),
    get text() { return currentText; },
    get enabled() { return options.enabled; },
    get world() { return lastWorld; },
    get section() { return lastSection; },
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
const progressOf = (h) => h.emitted.filter((e) => e.name === 'cablecar:progress').map((e) => e.payload.progress);

/* ============================== datos ============================== */

const { WalkMap } = loadTs('src/world/WalkMap.ts', { '../config/movement': loadTs('src/config/movement.ts') });
function mapOf(level) {
  const extra = level.props.filter((prop) => prop.collide).map((prop) => ({ shape: 'ellipse', x: prop.x, y: prop.y, ...prop.collide }));
  return new WalkMap(level, extra);
}

await test('Existen las tres secciones con su id, ancho, música y suelo y = 222…345', () => {
  assert.deepEqual(Object.keys(levels), ['teleferico', 'torre', 'salon_trono']);
  const widths = { teleferico: 800, torre: 2600, salon_trono: 1800 };
  const tracks = { teleferico: 'n07_teleferico', torre: 'n07_torre', salon_trono: 'n07_salon' };
  for (const [id, level] of Object.entries(levels)) {
    assert.equal(level.id, id);
    assert.equal(level.width, widths[id]);
    assert.equal(level.music, tracks[id]);
    assert.equal(level.cameraBounds.x1, widths[id]);
    assert.equal(level.background, `fondo_${id}`);
    assert.deepEqual(level.walk, [[[0, 222], [widths[id], 222], [widths[id], 345], [0, 345]]]);
  }
  assert.deepEqual(config.musica, {
    teleferico: 'n07_teleferico', torre: 'n07_torre', salon: 'n07_salon', jefe: 'n07_jefe', llorona: 'n07_llorona',
  });
});

await test('Teleférico: arena fija y sin enemigos estáticos; 3–4 oleadas con espíritus lunaOnly y encapuchados por ambas puertas', () => {
  const t = levels.teleferico;
  assert.equal(t.enemies.length, 0);
  assert.equal(config.teleferico.arena.x0, 0);
  assert.equal(config.teleferico.arena.x1, t.width);
  assert.ok(config.teleferico.olas.length >= 3 && config.teleferico.olas.length <= 4);
  const sides = new Set();
  const kinds = new Set();
  for (const ola of config.teleferico.olas) {
    assert.ok(ola.entradas.length >= 3);
    let prev = -1;
    for (const e of ola.entradas) {
      assert.ok(e.t >= prev, 'entradas ordenadas por tiempo');
      prev = e.t;
      sides.add(e.side);
      kinds.add(e.type);
      assert.ok(['espiritu', 'encapuchado'].includes(e.type));
      if (e.type === 'espiritu') assert.equal(e.lunaOnly, true);
      if (e.type === 'encapuchado') assert.ok(['rojo', 'negro'].includes(e.rank));
    }
  }
  assert.deepEqual([...sides].sort(), ['der', 'izq']);
  assert.deepEqual([...kinds].sort(), ['encapuchado', 'espiritu']);
  const walk = mapOf(t);
  for (const door of Object.values(config.teleferico.puertas)) assert.equal(walk.isWalkable(door.x, door.y, 6), true);
  assert.ok(t.interactables.every((it) => it.action === 'n07_examinar'));
});

await test('Torre: 6–8 élites + algún negro, checkpoint, altar y puerta al salón que exige limpiar a la élite', () => {
  const t = levels.torre;
  const elites = count(t, 'encapuchado', (e) => e.rank === 'elite');
  assert.ok(elites >= 6 && elites <= 8, `élites: ${elites}`);
  assert.equal(elites, config.torre.elites);
  assert.ok(count(t, 'encapuchado', (e) => e.rank === 'negro') >= 1);
  assert.ok(t.enemies.every((e) => e.type === 'encapuchado' && ['negro', 'elite'].includes(e.rank) && !e.group));
  assert.ok(t.spawns.checkpoint && t.spawns.altar && t.spawns[config.torre.puntoControlMitad]);
  assert.ok(t.props.some((p) => p.key === 'altar_memoria'));
  const altar = t.interactables.find((it) => it.action === 'altar');
  assert.ok(altar);
  const puerta = trig(t, 'n07_ir_salon');
  assert.equal(puerta.data.section, 'salon_trono');
  assert.equal(puerta.data.requires, 'elite');
  const lastElite = Math.max(...t.enemies.filter((e) => e.rank === 'elite').map((e) => e.x));
  assert.ok(puerta.x > lastElite, 'la puerta queda después de toda la guardia');
  assert.ok(trig(t, 'n07_punto_mitad').x < altar.x + 100 && trig(t, 'n07_punto_mitad').x < puerta.x);
  assert.ok(trig(t, 'n07_elite_vista').x < Math.min(...t.enemies.filter((e) => e.rank === 'elite').map((e) => e.x)));
});

await test('Salón del trono: arena del Rey (spec con grupo), trigger de la revelación y consola de la falsa llamada', () => {
  const s = levels.salon_trono;
  const rey = s.enemies.filter((e) => e.type === 'rey_olvido');
  assert.equal(rey.length, 1);
  assert.equal(rey[0].group, config.jefe.grupo);
  const rev = trig(s, 'n07_revelacion');
  assert.equal(rev.action, 'revelacion');
  assert.equal(rev.data.group, config.jefe.grupo);
  assert.equal(rev.data.x0, config.jefe.x0);
  assert.equal(rev.data.x1, config.jefe.x1);
  assert.ok(rev.x > rev.data.x0 && rev.x < rey[0].x && rey[0].x < rev.data.x1 && rev.data.x1 <= s.width);
  assert.ok(s.spawns.jefa.x < rev.x, 'el punto de control del jefe queda antes de la revelación');
  assert.ok(s.props.some((p) => p.id === 'n07_fragmento'));
  const consola = s.interactables.find((it) => it.action === 'n07_consola');
  assert.ok(consola && consola.x > rey[0].x);
  assert.deepEqual(PASOS_IDS(), ['consuelo_aprender', 'consuelo_lanzar', 'memoria_lanzar', 'paz_aprender', 'paz_lanzar']);
});
function PASOS_IDS() { return config.final.pasos.map((p) => p.id); }

await test('Suelo transitable (spawns, enemigos, triggers e interactuables), ids únicos y actions conocidas', () => {
  for (const [id, level] of Object.entries(levels)) {
    const walk = mapOf(level);
    for (const it of level.interactables) {
      assert.ok(it.y >= 220 && it.y <= 345, `${id}: ${it.id} dentro de la franja`);
      assert.equal(walk.isWalkable(it.x, it.y), true, `${id}: interactuable accesible ${it.id}`);
      assert.ok(['n07_examinar', 'altar', 'n07_consola'].includes(it.action), `${id}: action ${it.action}`);
    }
    for (const [name, point] of Object.entries(level.spawns)) assert.equal(walk.isWalkable(point.x, point.y, 6), true, `${id}: spawn ${name}`);
    assert.equal(walk.isWalkable(level.spawn.x, level.spawn.y, 6), true, `${id}: spawn principal`);
    assert.ok(level.spawns.checkpoint && level.spawns.inicio, `${id}: spawns checkpoint/inicio`);
    for (const enemy of level.enemies) assert.equal(walk.isWalkable(enemy.x, enemy.y, 6), true, `${id}: ${enemy.type} en (${enemy.x}, ${enemy.y})`);
    for (const t of level.triggers) {
      assert.equal(walk.isWalkable(t.x + t.w / 2, t.y + t.h * 0.55), true, `${id}: trigger ${t.id}`);
      assert.ok(t.x >= 0 && t.x + t.w <= level.width, `${id}: trigger ${t.id} dentro del ancho`);
      assert.ok(['letras', 'dialogo', 'punto', 'ir_seccion', 'revelacion'].includes(t.action), `${id}: action de trigger ${t.action}`);
    }
    for (const prop of level.props) assert.ok(prop.x >= 0 && prop.x <= level.width, `${id}: prop ${prop.key} dentro del ancho`);
    for (const o of level.obstacles) {
      assert.equal(o.shape, 'rect');
      assert.ok(o.height < 32, `${id}: obstáculos saltables con el salto simple`);
    }
    const ids = level.interactables.map((it) => it.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: ids de interactuables únicos`);
    const tids = level.triggers.map((t) => t.id);
    assert.equal(new Set(tids).size, tids.length, `${id}: ids de triggers únicos`);
    const pids = level.props.filter((p) => p.id).map((p) => p.id);
    assert.equal(new Set(pids).size, pids.length, `${id}: ids de props únicos`);
  }
});

await test('Los diálogos referenciados (niveles, director y datos) existen, tienen texto y hablantes n07_', () => {
  const ids = new Set();
  for (const level of Object.values(levels)) {
    for (const it of level.interactables) if (typeof it.data?.dialogue === 'string') ids.add(it.data.dialogue);
    for (const t of level.triggers) if (typeof t.data?.dialogue === 'string') ids.add(t.data.dialogue);
  }
  for (const match of directorSource.matchAll(/'(n07_[a-z0-9_]+)'/g)) if (dialogue[match[1]]) ids.add(match[1]);
  for (const match of read('src/data/cdmx2.json').matchAll(/"(n07_[a-z0-9_]+)"/g)) if (dialogue[match[1]]) ids.add(match[1]);
  assert.ok(ids.size >= 26, `hay diálogos suficientes (${ids.size})`);
  for (const id of ids) {
    assert.ok(Array.isArray(dialogue[id]) && dialogue[id].length > 0, `Diálogo existente: ${id}`);
    for (const line of dialogue[id]) {
      assert.ok(line.text.trim().length > 0, `Texto no vacío en ${id}`);
      assert.ok(dialogue._hablantes[line.who], `Hablante conocido en ${id}: ${line.who}`);
    }
  }
  // Todo diálogo definido se usa (sin huérfanos) y todo prefijo es n07_.
  for (const key of Object.keys(dialogue)) {
    assert.ok(key === '_hablantes' || key.startsWith('n07_'), `Prefijo n07_ en ${key}`);
    if (key !== '_hablantes') assert.ok(ids.has(key), `El diálogo ${key} se usa`);
  }
  for (const key of Object.keys(dialogue._hablantes)) assert.ok(key.startsWith('n07_'), `Prefijo n07_ en hablante ${key}`);
  // Contenido obligatorio de la historia y de la trampa.
  const text = (id) => dialogue[id].map((l) => l.text).join(' ');
  assert.match(text('n07_maria_olvido'), /Yo olvidé algo/);
  // Guanajuato y Jalisco se omiten (2026-10-19): la llamada trampa manda directo a la Catedral de Guadalajara.
  assert.match(text('n07_consola_falsa'), /Guadalajara/);
  assert.match(text('n07_consola_falsa'), /Catedral/);
  assert.doesNotMatch(text('n07_consola_falsa'), /Guanajuato|Jalisco/);
  assert.match(text('n07_fragmento'), /seis de seis/i);
  for (const id of ['n07_revelacion', 'n07_transformacion', 'n07_despedida']) {
    assert.doesNotMatch(text(id), /sangre|cadáver|cuerpo(s)? (sin vida|inerte)/i, `${id}: sin violencia gráfica`);
  }
});

/* ============================== teleférico ============================== */

const cfgOlas = config.teleferico.olas;

await test('Teleférico: intro, 4 oleadas por las puertas, progreso 0→1 creciente y salida a la torre', async () => {
  const h = await (async () => {
    const x = harness();
    return x;
  })();
  h.hold('n07_llegada');
  const s = await h.ready('teleferico');
  assert.equal(s.world.timeScale, 0, 'la intro congela el mundo');
  await h.release();
  assert.deepEqual(h.dialogues.slice(0, 1), ['n07_llegada']);
  assert.equal(s.world.timeScale, 1);
  assert.equal(h.state.checkpoint.section, 'teleferico');
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n07_teleferico'));
  assert.equal(h.state.flags['n07:intro'], true);
  assert.deepEqual(h.world.arena, [0, 800], 'la cabina es una arena fija');
  assert.equal(progressOf(h)[0], 0);
  // Recorre las oleadas: avanza el reloj, mata lo que haya entrado, repite.
  let guard = 0;
  while (!h.gotos().length && guard++ < 400) {
    s.tick();
    await flush();
    for (const e of h.world.enemies) if (e.alive && !e.purified) {
      if (e.kind === 'espiritu') h.purify(e); else h.down(e);
    }
  }
  assert.ok(guard < 400, 'las oleadas terminan');
  const spawns = h.calls.filter(([k]) => k === 'spawn').map(([, spec]) => spec);
  const expected = cfgOlas.reduce((n, o) => n + o.entradas.length, 0);
  assert.equal(spawns.length, expected);
  assert.ok(spawns.every((sp) => sp.group === 'ola' && (sp.x === config.teleferico.puertas.izq.x || sp.x === config.teleferico.puertas.der.x)));
  assert.ok(spawns.some((sp) => sp.type === 'espiritu' && sp.lunaOnly === true));
  assert.ok(spawns.some((sp) => sp.type === 'encapuchado'));
  for (let i = 0; i < cfgOlas.length; i++) assert.equal(h.state.flags[`n07:ola:${i}`], true);
  const prog = progressOf(h);
  assert.equal(prog.at(-1), 1);
  for (let i = 1; i < prog.length; i++) assert.ok(prog[i] >= prog[i - 1] - 1e-9, 'el progreso nunca retrocede');
  assert.ok(prog.every((p) => p >= 0 && p <= 1));
  assert.ok(h.dialogues.includes('n07_tormenta') && h.dialogues.includes('n07_maria_olvido') && h.dialogues.includes('n07_estacion_alta'));
  assert.deepEqual(h.gotos(), [['goto', 'torre']]);
  assert.equal(h.state.flags['n07:teleferico_fin'], true);
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'));
  assert.equal(h.rewards.length >= cfgOlas.length, true);
  assert.equal(s.world.player.controlsLocked, false);
});

await test('Teleférico: tras morir se retoma en la primera oleada sin completar; no se repiten diálogos ni premios', async () => {
  const h = harness();
  const s = await h.ready('teleferico');
  let guard = 0;
  while (!h.state.flags['n07:ola:1'] && guard++ < 200) {
    s.tick();
    await flush();
    for (const e of h.world.enemies) if (e.alive && !e.purified) { if (e.kind === 'espiritu') h.purify(e); else h.down(e); }
  }
  assert.equal(h.state.flags['n07:ola:2'], undefined);
  const ecos = h.state.ecos;
  const dialoguesBefore = h.dialogues.filter((d) => d === 'n07_llegada').length;
  s.shutdown();
  const s2 = await h.ready('teleferico');
  assert.equal(h.dialogues.filter((d) => d === 'n07_llegada').length, dialoguesBefore, 'la intro no se repite');
  for (let i = 0; i < 12; i++) { s2.tick(); await flush(); }
  const spawned = h.calls.filter(([k]) => k === 'spawn').length;
  assert.ok(spawned > 0);
  const last = h.calls.filter(([k]) => k === 'spawn').slice(-1)[0][1];
  assert.ok(h.world.enemies.length > 0 && last);
  assert.equal(h.state.ecos, ecos, 'sin premios repetidos');
  assert.ok(progressOf(h).some((p) => Math.abs(p - 0.5) < 1e-9), 'tras 2 de 4 oleadas el progreso arranca en 0.5');
});

await test('Teleférico: pista de Luna si quedan espíritus invisibles y no se bloquean interacciones durante la oleada', async () => {
  const h = harness();
  const s = await h.ready('teleferico');
  assert.equal(await h.act('n07_examinar'), true);
  assert.ok(h.dialogues.includes('n07_ventana'));
  for (let i = 0; i < 12; i++) { s.tick(); await flush(); }
  assert.equal(await h.act('n07_examinar'), false, 'en plena oleada no se puede examinar');
  for (let i = 0; i < 80; i++) { s.tick(); await flush(); }
  assert.equal(h.toasts.filter((t) => /Habilidad Luna/.test(t)).length, 1, 'la pista sale una sola vez por oleada');
});

/* ============================== torre ============================== */

function torreEnemies(h) {
  return levels.torre.enemies.map((e) => h.mk('encapuchado')(e.x, e.y, { rank: e.rank }));
}

await test('Torre: la puerta exige limpiar a la élite, premia una vez y pasa a salon_trono; el progreso sobrevive a morir', async () => {
  const h = harness();
  const enemies = torreEnemies(h);
  const s = await h.ready('torre', { enemies: [...enemies] });
  assert.equal(h.state.checkpoint.section, 'torre');
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n07_torre'));
  assert.match(h.text, /GUARDIA DE ÉLITE 0\/7/);
  await h.trigger('n07_ir_salon');
  assert.equal(h.gotos().length, 0);
  assert.ok(h.toasts.some((t) => /guardia de élite aún custodia/.test(t)));
  await h.trigger('n07_elite_vista');
  await h.trigger('n07_elite_vista');
  assert.equal(h.dialogues.filter((d) => d === 'n07_elite_vista').length, 1);
  assert.ok(h.calls.some(([k, t]) => k === 'mariaSay' && /rojo oscuro/.test(t)));
  await h.trigger('n07_punto_mitad');
  assert.deepEqual({ x: h.state.checkpoint.x, y: h.state.checkpoint.y }, levels.torre.spawns.mitad);
  // Derrota a tres élites y a los negros; muere y regresa.
  const elites = enemies.filter((e) => e.rank === 'elite');
  for (const e of [...elites.slice(0, 3), ...enemies.filter((e) => e.rank === 'negro')]) h.down(e);
  await flush();
  s.tick();
  assert.match(h.text, /GUARDIA DE ÉLITE 3\/7/);
  s.shutdown();
  const again = torreEnemies(h);
  const s2 = await h.ready('torre', { enemies: [...again] });
  assert.equal(again.filter((e) => e.rank === 'elite' && e.alive).length, 4, 'las élites vencidas no reaparecen');
  assert.equal(again.filter((e) => e.rank === 'negro' && e.alive).length, 0);
  const cp = h.state.checkpoint;
  assert.equal(cp.section, 'torre');
  const left = again.filter((e) => e.rank === 'elite' && e.alive);
  const before = h.state.ecos;
  for (const e of left) h.down(e);
  await flush();
  assert.equal(h.state.flags['n07:elite_fin'], true);
  assert.equal(h.state.ecos - before, config.rewards.torre);
  assert.ok(h.toasts.some((t) => /libre/.test(t)));
  s2.tick();
  assert.match(h.text, /Entra al salón del trono/);
  assert.equal(await h.act('altar'), true);
  assert.ok(h.calls.some(([k, key]) => k === 'launch' && key === 'Altar'));
  assert.deepEqual({ x: h.state.checkpoint.x, y: h.state.checkpoint.y }, levels.torre.spawns.altar);
  await h.trigger('n07_ir_salon');
  assert.deepEqual(h.gotos(), [['goto', 'salon_trono', undefined]]);
  await h.trigger('n07_ir_salon');
  assert.equal(h.gotos().length, 1, 'no sale dos veces');
});

/* ============================== salón del trono ============================== */

async function salonRevelado(opts = {}) {
  const h = harness(opts);
  const s = await h.ready('salon_trono', { px: 650 });
  await h.trigger('n07_revelacion');
  return { h, s };
}

await test('Salón: la revelación (sin violencia) transforma a María, invoca a la Llorona y empieza el jefe con arena y música', async () => {
  const h = harness();
  h.hold('n07_revelacion');
  const s = await h.ready('salon_trono', { px: 650 });
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n07_salon'));
  assert.match(h.text, /Acércate al trono/);
  await h.trigger('n07_revelacion');
  assert.equal(s.world.timeScale, 0);
  assert.equal(h.calls.some(([k]) => k === 'mariaTransform'), false, 'no se transforma antes del diálogo');
  await h.release();
  assert.deepEqual(h.dialogues.filter((d) => /^n07_(revelacion|transformacion|pelea_aviso)$/.test(d)),
    ['n07_revelacion', 'n07_transformacion', 'n07_pelea_aviso']);
  const order = h.calls.map(([k]) => k);
  assert.ok(order.indexOf('mariaTransform') < order.indexOf('summon'));
  assert.deepEqual(h.calls.find(([k]) => k === 'summon').slice(1), [640, 300], 'nace donde estaba María');
  assert.equal(h.state.hasMaria, false);
  assert.equal(h.state.flags['n07:transformada'], true);
  assert.deepEqual({ x: h.state.checkpoint.x, y: h.state.checkpoint.y }, levels.salon_trono.spawns.jefa);
  assert.deepEqual(s.world.arena, [config.jefe.x0, config.jefe.x1]);
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n07_jefe'));
  assert.ok(h.emitted.some((e) => e.name === 'arena:start' && e.payload.group === 'rey'));
  assert.equal(h.world.enemies.filter((e) => e.kind === 'rey_olvido').length, 1, 'el Rey nace en su arena');
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  s.tick();
  assert.match(h.text, /EL REY DEL OLVIDO/);
  // La revelación no se repite.
  await h.trigger('n07_revelacion');
  assert.equal(h.dialogues.filter((d) => d === 'n07_revelacion').length, 1);
  assert.equal(h.calls.filter(([k]) => k === 'mariaTransform').length, 1);
  // Avisos de la corona y de los controles invertidos, una vez cada uno.
  h.emit('boss:vulnerable', { on: true });
  h.emit('boss:vulnerable', { on: true });
  h.emit('rey:crown', { hp: 0, max: 5, broken: true });
  h.emit('controls:invert', { on: true, ms: 3500 });
  h.emit('controls:invert', { on: true, ms: 3500 });
  assert.equal(h.toasts.filter((t) => /SOL o FUEGO/.test(t) && /Ventana/.test(t)).length, 1);
  assert.equal(h.toasts.filter((t) => /Corona rota/.test(t)).length, 1);
  assert.equal(h.toasts.filter((t) => /invierte tus controles/.test(t)).length, 1);
});

await test('Muerte durante el jefe: el reintento reinicia al Rey limpio, vuelve a invocar a la Llorona y no repite la revelación', async () => {
  const { h, s } = await salonRevelado();
  assert.equal(h.world.enemies.filter((e) => e.kind === 'rey_olvido').length, 1);
  h.state.controlsInverted = true; // la corona lo había invertido al morir
  s.shutdown();
  assert.equal(h.state.controlsInverted, false, 'nunca quedan controles invertidos');
  const summonsBefore = h.calls.filter(([k]) => k === 'summon').length;
  const s2 = await h.ready('salon_trono', { px: 640 });
  assert.equal(h.dialogues.filter((d) => d === 'n07_revelacion').length, 1);
  assert.ok(h.dialogues.includes('n07_reintento'));
  assert.equal(h.calls.filter(([k]) => k === 'summon').length, summonsBefore + 1);
  assert.equal(h.calls.filter(([k]) => k === 'mariaTransform').length, 1);
  assert.equal(h.state.hasMaria, false);
  assert.equal(h.world.enemies.filter((e) => e.kind === 'rey_olvido').length, 1, 'un solo Rey, nuevo');
  assert.deepEqual(s2.world.arena, [config.jefe.x0, config.jefe.x1]);
  assert.equal(s2.world.timeScale, 1);
  assert.equal(s2.world.player.controlsLocked, false);
});

await test('Rey calmado → CONSUELO → MEMORIA → PAZ (con un fallo repetido sin castigo) → despedida → fragmentos 4–6 → consola → Guadalajara', async () => {
  const { h, s } = await salonRevelado();
  h.castPlan.push('perfect', 'fail', 'partial', 'fail', 'fail', 'perfect');
  h.emit('boss:calmed', {});
  await flush();
  const seq = h.calls.filter(([k]) => ['learn', 'cast', 'wild', 'dismiss'].includes(k))
    .map(([k, a, b]) => (k === 'cast' ? `cast:${a}:${b}` : k === 'wild' ? `wild:${a}` : `${k}${a ? ':' + a : ''}`));
  assert.deepEqual(seq, [
    'wild:true', 'learn:CONSUELO', 'cast:CONSUELO:perfect',
    'cast:MEMORIA:fail', 'cast:MEMORIA:partial',
    'learn:PAZ', 'cast:PAZ:fail', 'cast:PAZ:fail', 'cast:PAZ:perfect',
    'wild:false', 'dismiss',
  ]);
  // Tiempo muy ralentizado en cada lanzamiento.
  assert.ok(h.calls.filter(([k]) => k === 'cast').every((c) => c[3] === config.final.timeScale));
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n07_llorona'));
  assert.ok(h.emitted.some((e) => e.name === 'arena:clear' && e.payload.group === 'rey'));
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'));
  const dlg = h.dialogues.filter((d) => /^n07_(rey_cae|consuelo|consuelo_ok|memoria_aviso|memoria_ok|memoria_repite|paz|paz_ok|paz_repite|despedida|fragmento)$/.test(d));
  assert.deepEqual(dlg, ['n07_rey_cae', 'n07_consuelo', 'n07_consuelo_ok', 'n07_memoria_aviso', 'n07_memoria_repite', 'n07_memoria_ok',
    'n07_paz', 'n07_paz_repite', 'n07_paz_ok', 'n07_despedida', 'n07_fragmento']);
  assert.ok(h.toasts.some((t) => /Otra vez, con calma/.test(t)), 'del segundo fallo en adelante, aviso corto');
  assert.equal(h.state.hasMaria, false);
  assert.equal(h.state.flags['n07:despedida'], true);
  for (const n of [4, 5, 6]) assert.equal(h.state.flags[`n07:fragmento_${n}`], true, `fragmento ${n} (el Rey guardaba del 4.º al 6.º)`);
  assert.equal(h.state.flags['n07:final_fin'], true);
  assert.equal(h.state.flags['n07:completo'], undefined);
  assert.equal(h.state.hasBalam, true, 'Balam se queda');
  assert.ok(['CONSUELO', 'MEMORIA', 'PAZ'].every((id) => h.state.learnedSpells.includes(id)));
  assert.equal(s.world.timeScale, 1, 'el mundo no queda congelado');
  assert.equal(s.world.player.controlsLocked, false);
  assert.equal(h.sprites['salon_trono:n07_fragmento'].alpha, 0);
  // La consola con la falsa llamada solo existe tras el final y lleva a Guadalajara (Nivel 10).
  s.tick();
  assert.match(h.text, /consola/);
  assert.equal(await h.act('n07_consola'), true);
  assert.ok(h.dialogues.includes('n07_consola_falsa') && h.dialogues.includes('n07_cierre'));
  assert.equal(h.state.flags['n07:completo'], true);
  assert.ok(h.toasts.some((t) => /Seis de seis/.test(t)));
  assert.deepEqual(h.calls.filter(([k]) => k === 'start'), []);
  assert.ok(h.calls.some(([k]) => k === 'prepareGdlEntry'), 'prepara la entrada a Guadalajara');
  assert.deepEqual(h.gotos().at(-1), ['goto', 'gdl_avenida']);
  assert.equal(await h.act('n07_consola'), false, 'solo una vez');
  assert.equal(h.state.ecos, h.rewards.reduce((a, b) => a + b, 0));
});

await test('La consola no existe antes de terminar la secuencia y los Ecos de los pasos se dan una sola vez', async () => {
  const { h } = await salonRevelado();
  assert.equal(await h.act('n07_consola'), false);
  h.emit('boss:calmed', {});
  await flush();
  const ecos = h.state.ecos;
  h.emit('boss:calmed', {});
  await flush();
  assert.equal(h.state.ecos, ecos);
  assert.equal(h.calls.filter(([k, a]) => k === 'learn' && a === 'CONSUELO').length, 1);
});

await test('Si la secuencia final falla (castSpellNow lanza), el mundo no queda congelado ni bloqueado y se retoma desde ese paso', async () => {
  const { h, s } = await salonRevelado();
  h.castPlan.push('perfect', 'throw');
  h.emit('boss:calmed', {});
  await flush();
  assert.equal(s.world.timeScale, 1, 'timeScale restaurado');
  assert.equal(s.world.player.controlsLocked, false, 'controles liberados');
  assert.equal(h.state.flags['n07:paso:consuelo_lanzar'], true);
  assert.equal(h.state.flags['n07:paso:memoria_lanzar'], undefined);
  assert.equal(h.state.flags['n07:final_fin'], undefined);
  // El tick la retoma sin repetir lo ya logrado.
  s.tick();
  await flush();
  assert.equal(h.state.flags['n07:final_fin'], true);
  assert.equal(h.calls.filter(([k, a]) => k === 'learn' && a === 'CONSUELO').length, 1);
  assert.equal(h.calls.filter(([k, a, o]) => k === 'cast' && a === 'CONSUELO' && o === 'perfect').length, 1);
  assert.equal(s.world.timeScale, 1);
});

await test('Salir o morir con el Rey ya calmado reanuda la secuencia final con la Llorona de nuevo', async () => {
  const { h, s } = await salonRevelado();
  h.castPlan.push('perfect', 'throw', 'throw');
  h.emit('boss:calmed', {});
  await flush();
  s.shutdown();
  const summons = h.calls.filter(([k]) => k === 'summon').length;
  const s2 = await h.ready('salon_trono', { px: 700 });
  assert.equal(h.calls.filter(([k]) => k === 'summon').length, summons + 1);
  assert.equal(h.state.flags['n07:final_fin'], undefined, 'la reanudación también puede fallar sin congelar nada');
  assert.equal(s2.world.timeScale, 1);
  s2.tick();
  await flush();
  assert.equal(h.state.flags['n07:final_fin'], true);
  assert.equal(h.dialogues.filter((d) => d === 'n07_rey_cae').length, 1);
  assert.equal(s2.world.timeScale, 1);
  assert.equal(s2.world.player.controlsLocked, false);
});

await test('Conjuros sin spells.json o sin castSpellNow (otros agentes aún no integrados): la secuencia se completa con avisos', async () => {
  const h = harness({ spellDefs: false, castApi: false });
  const s = await h.ready('salon_trono', { px: 650 });
  await h.trigger('n07_revelacion');
  h.emit('boss:calmed', {});
  await flush();
  assert.equal(h.state.flags['n07:final_fin'], true);
  assert.ok(['CONSUELO', 'MEMORIA', 'PAZ'].every((id) => h.state.learnedSpells.includes(id)));
  assert.equal(s.world.timeScale, 1);
});

await test('Respaldo: si el Rey nunca aparece, el nivel no se atasca', async () => {
  const h = harness();
  const level = levels.salon_trono;
  const saved = level.enemies.splice(0);
  const s = await h.ready('salon_trono', { px: 650 });
  await h.trigger('n07_revelacion');
  s.tick();
  assert.equal(h.state.flags['n07:rey'], undefined);
  s.scene.time.now = config.jefe.respaldoMs + 5000;
  s.tick();
  await flush();
  assert.equal(h.state.flags['n07:rey'], true);
  assert.equal(h.state.flags['n07:final_fin'], true);
  level.enemies.push(...saved);
});

await test('Casting en curso: no se restaura un bloqueo ajeno al terminar una secuencia', async () => {
  const h = harness();
  const s = await h.ready('torre', { enemies: [] });
  h.state.casting = true;
  s.world.timeScale = 0.2;
  s.world.player.controlsLocked = true;
  await h.trigger('n07_torre_vista');
  assert.equal(s.world.timeScale, 0.2);
  assert.equal(s.world.player.controlsLocked, true);
  h.state.casting = false;
  await h.trigger('n07_elite_vista');
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
});

await test('Entrada directa sin María ni conjuros: se prepara la entrada; con María transformada no se la devuelve', async () => {
  const h = harness({ hasMaria: false, learned: [] });
  await h.ready('torre', { enemies: [] });
  assert.ok(h.calls.some(([k]) => k === 'prepareCdmx2Entry'));
  assert.equal(h.state.section, 'torre');
  assert.ok(['FUEGO', 'SOL', 'MEMORIA', 'VERDAD'].every((id) => h.state.learnedSpells.includes(id)));
  const h2 = harness({ hasMaria: false });
  h2.state.flags['n07:transformada'] = true;
  await h2.ready('salon_trono', { px: 640 });
  assert.equal(h2.calls.some(([k]) => k === 'prepareCdmx2Entry'), false);
  assert.equal(h2.state.hasMaria, false);
});

await test('Flags: todos llevan el prefijo n07: y los esperados existen al terminar', async () => {
  const { h } = await salonRevelado();
  h.emit('boss:calmed', {});
  await flush();
  await h.act('n07_consola');
  for (const key of Object.keys(h.state.flags)) assert.ok(key === 'gema' || key.startsWith('n07:'), `flag ${key}`);
  for (const key of ['n07:revelacion', 'n07:transformada', 'n07:rey', 'n07:despedida', 'n07:fragmento_4', 'n07:consola', 'n07:completo']) {
    assert.equal(h.state.flags[key], true, key);
  }
});

console.log(`\n${passed} pruebas del Nivel 7 correctas.`);
