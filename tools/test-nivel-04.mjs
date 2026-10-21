// Prueba del Nivel 4 (Oaxaca): datos de las tres secciones y el director TypeScript real con adaptadores
// de escenas controlables. No sustituye las pruebas de controles, cámara, audio audible o render en navegador.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const config = json('src/data/oaxaca.json');
const dialogue = json('src/data/dialogue/n04.json');
const levels = {
  oaxaca: json('src/data/levels/oaxaca.json'),
  callejones: json('src/data/levels/callejones.json'),
  santo_domingo: json('src/data/levels/santo_domingo.json'),
};
const directorSource = read('src/systems/OaxacaDirector.ts');
const code = ts.transpileModule(directorSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); };

function loadTs(path, dependencies = {}) {
  const source = ts.transpileModule(read(path), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${source}\n})`, {}, { filename: path })(
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

function harness({ spellDefs = true, withMariaApi = true, hasMaria = true } = {}) {
  const state = {
    flags: {}, learnedSpells: ['CALMA', 'PROTECCION', 'VOZ', 'LUZ', 'SOL'], mastery: {}, selectedSpell: 'CALMA',
    hp: 1, maxHp: 5, ecos: 0, totalEcosEarned: 0, checkpoint: null, section: 'oaxaca',
    shield: { unlocked: true, energy: 1, active: false, broken: false },
    luna: { unlocked: true, energy: 1, active: false }, hasBalam: true, hasMaria,
  };
  const emitter = new EventEmitter();
  const emitted = [];
  const dialogues = [];
  const toasts = [];
  const calls = [];
  const rewards = [];
  const maria = [];
  const sprites = {};
  let waitingDialogue = null;
  let pending = null;
  let tickFn = null;
  let options = null;
  let currentText = '';
  let lastWorld = null;
  const bus = {
    emit(name, payload) {
      emitted.push({ name, payload });
      if (name === 'hud:toast') toasts.push(payload.text);
      if (name === 'maria:say') maria.push(payload.text);
      emitter.emit(name, payload);
    },
    scoped(scene, name, callback) {
      emitter.on(name, callback);
      scene.events.once('shutdown', () => emitter.off(name, callback));
    },
  };
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
        if (id === waitingDialogue) await new Promise((resolve) => { pending = resolve; });
      },
    },
    './Casting': {
      startLearning: async (world, id) => {
        // Casting real restaura el tiempo al acabar; el director debe congelar de nuevo el diálogo siguiente.
        world.timeScale = 1;
        world.player.controlsLocked = false;
        state.learnedSpells.push(id);
        state.mastery[id] = { level: 0, progress: 0 };
        state.selectedSpell = id;
      },
      getSpellDef: (id) => (spellDefs ? { id, title: id } : undefined),
    },
    './Interact': { installInteract: (_world, opts) => { options = opts; } },
    './LightTrail': { installLightTrail() {}, setObjective() {} },
    './Progression': { addEcos: (n) => { rewards.push(n); state.ecos += n; state.totalEcosEarned += n; } },
    './Maria': withMariaApi ? { mariaSay: (text) => maria.push(text), wakeMaria() {} } : {},
    '../data/oaxaca.json': config,
    './Campaign': {
      prepareOaxacaEntry: () => { calls.push(['prepareOaxacaEntry']); state.hasMaria = true; state.checkpoint = null; },
      prepareCdmxEntry: () => { calls.push(['prepareCdmxEntry']); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${code}\n})`, {}, {
    filename: fileURLToPath(new URL('src/systems/OaxacaDirector.ts', root)),
  })((name) => {
    assert.ok(name in mods, `Dependencia inesperada: ${name}`);
    return mods[name];
  }, module, module.exports);

  function install(section, { enemies } = {}) {
    const level = levels[section];
    const text = new Proxy({}, { get: (_t, key) => (key === 'setText' ? (t) => { currentText = t; return text; } : key === 'then' ? undefined : () => text) });
    const clock = { now: 0 };
    for (const p of level.props) {
      if (p.id && !sprites[`${section}:${p.id}`]) {
        sprites[`${section}:${p.id}`] = {
          texture: p.key, alpha: 1, visible: true,
          setTexture(k) { this.texture = k; return this; },
          setAlpha(a) { this.alpha = a; return this; },
          setVisible(v) { this.visible = v; return this; },
        };
      }
    }
    const scene = {
      events: new EventEmitter().setMaxListeners(0),
      add: {
        text: () => text, circle: fake, ellipse: fake, image: fake, sprite: fake, rectangle: fake, container: fake,
      },
      make: { graphics: fake },
      textures: { exists: (k) => k === config.pasaje.texturaAbierta },
      anims: { exists: () => false },
      children: { getByName: (name) => sprites[`${section}:${name}`] ?? null },
      tweens: { add: (cfg) => { cfg.onComplete?.(); return fake(); } },
      time: {
        get now() { return clock.now; },
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
      scene, level, player: { x: 100, y: 295, controlsLocked: false, playOneShot() {} },
      enemies: enemies ?? [], timeScale: 1, arena: null,
      flash() {}, shake() {},
      lockArena(x0, x1) { this.arena = [x0, x1]; calls.push(['lockArena', x0, x1]); },
      unlockArena() { this.arena = null; calls.push(['unlockArena']); },
      remove(e) { const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); calls.push(['remove', e]); },
      gotoSection(...args) { calls.push(['goto', ...args]); },
    };
    lastWorld = world;
    module.exports.installOaxacaDirector(world);
    return { world, scene, clock, tick: () => tickFn?.(), shutdown: () => scene.events.emit('shutdown') };
  }

  async function ready(section, opts) {
    const session = install(section, opts);
    await flush();
    return session;
  }
  async function act(action, match = {}) {
    const level = lastWorld.level;
    const it = level.interactables.find((entry) => entry.action === action &&
      Object.entries(match).every(([key, value]) => entry.data?.[key] === value));
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
  const mk = (kind) => (x, y) => ({ kind, x, y, alive: true, purified: false, exhausted: false, destroy() { this.alive = false; } });
  return {
    state, emitted, dialogues, toasts, calls, rewards, maria, sprites, install, ready, act, trigger,
    beast: mk('bestia'), hood: mk('encapuchado'), boss: mk('bruja_guajolote'),
    emit: (name, payload) => bus.emit(name, payload),
    hold: (id) => { waitingDialogue = id; },
    release: async () => { waitingDialogue = null; pending?.(); pending = null; await flush(); },
    purify(enemy) {
      enemy.alive = false;
      enemy.purified = true;
      bus.emit('enemy:purified', { enemy, ecos: 1, perfect: false });
    },
    get text() { return currentText; },
    get enabled() { return options.enabled; },
  };
}

let passed = 0;
async function test(name, run) {
  await run();
  console.log(`✓ ${name}`);
  passed++;
}

/** Aprende a los tres artesanos en orden (flujo completo del taller). */
async function aprenderMemoria(h) {
  await h.act('n04_artesano', { artesano: 'gudelia' });
  await h.act('n04_artesano', { artesano: 'facundo' });
  await h.act('n04_artesano', { artesano: 'lucrecia' });
}

/* ============================== datos ============================== */

const { WalkMap } = loadTs('src/world/WalkMap.ts', { '../config/movement': loadTs('src/config/movement.ts') });
function mapOf(level) {
  const extra = level.props.filter((prop) => prop.collide).map((prop) => ({ shape: 'ellipse', x: prop.x, y: prop.y, ...prop.collide }));
  return new WalkMap(level, extra);
}

await test('Existen las tres secciones con su id, ancho y música', () => {
  assert.deepEqual(Object.keys(levels), ['oaxaca', 'callejones', 'santo_domingo']);
  const widths = { oaxaca: 3000, callejones: 3000, santo_domingo: 2400 };
  const tracks = { oaxaca: 'n04_ciudad', callejones: 'n04_ciudad', santo_domingo: 'n04_templo' };
  for (const [id, level] of Object.entries(levels)) {
    assert.equal(level.id, id);
    assert.equal(level.width, widths[id]);
    assert.equal(level.music, tracks[id]);
    assert.equal(level.cameraBounds.x1, widths[id]);
    assert.ok(level.background.startsWith('fondo_'));
    assert.deepEqual(level.walk, [[[0, 222], [widths[id], 222], [widths[id], 345], [0, 345]]]);
  }
});

await test('Conteos de enemigos: calles 4 encapuchados + 3 bestias, callejones 7 + 4, templo 3 + la Bruja en su grupo', () => {
  const count = (level, type) => level.enemies.filter((e) => e.type === type).length;
  assert.equal(count(levels.oaxaca, 'encapuchado'), 4);
  assert.equal(count(levels.oaxaca, 'bestia'), 3);
  assert.equal(count(levels.callejones, 'bestia'), 7);
  assert.equal(count(levels.callejones, 'encapuchado'), 4);
  assert.equal(count(levels.santo_domingo, 'encapuchado'), 3);
  for (const level of Object.values(levels)) {
    for (const e of level.enemies.filter((x) => x.type === 'encapuchado')) assert.equal(e.rank, 'rojo');
  }
  const boss = levels.santo_domingo.enemies.filter((e) => e.type === 'bruja_guajolote');
  assert.equal(boss.length, 1);
  assert.equal(boss[0].group, config.arena.grupo);
  const trig = levels.santo_domingo.triggers.find((t) => t.action === 'bruja_arena');
  assert.equal(trig.data.group, config.arena.grupo);
  assert.equal(trig.data.x0, config.arena.x0);
  assert.equal(trig.data.x1, config.arena.x1);
  assert.ok(boss[0].x > config.arena.x0 && boss[0].x < config.arena.x1, 'La Bruja nace dentro de la arena');
  // Total ~10 bestias y ~8 encapuchados rojos fuera de la jefa (NIVELES_ECOS §4).
  const bestias = count(levels.oaxaca, 'bestia') + count(levels.callejones, 'bestia');
  assert.equal(bestias, 10);
});

await test('Interactuables, spawns, enemigos y triggers están en suelo transitable (franja 220–345)', () => {
  for (const [id, level] of Object.entries(levels)) {
    const walk = mapOf(level);
    for (const it of level.interactables) {
      assert.equal(walk.isWalkable(it.x, it.y), true, `${id}: interactuable accesible ${it.id}`);
      assert.ok(it.y >= 220 && it.y <= 345, `${id}: ${it.id} dentro de la franja`);
    }
    for (const [name, point] of Object.entries(level.spawns)) {
      assert.equal(walk.isWalkable(point.x, point.y, 6), true, `${id}: spawn seguro ${name}`);
    }
    assert.equal(walk.isWalkable(level.spawn.x, level.spawn.y, 6), true, `${id}: spawn principal`);
    for (const enemy of level.enemies) {
      assert.equal(walk.isWalkable(enemy.x, enemy.y, 6), true, `${id}: ${enemy.type} en (${enemy.x}, ${enemy.y})`);
    }
    for (const t of level.triggers) {
      assert.equal(walk.isWalkable(t.x + t.w / 2, t.y + t.h * 0.55), true, `${id}: trigger ${t.id}`);
      assert.ok(t.x >= 0 && t.x + t.w <= level.width, `${id}: trigger ${t.id} dentro del ancho`);
    }
    for (const prop of level.props) assert.ok(prop.x >= 0 && prop.x <= level.width, `${id}: prop ${prop.key} dentro del ancho`);
  }
});

await test('Ids únicos, altar (checkpoint) en cada sección y orden: altar antes de la arena de la Bruja', () => {
  for (const [id, level] of Object.entries(levels)) {
    const ids = level.interactables.map((it) => it.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: ids de interactuables únicos`);
    const tids = level.triggers.map((t) => t.id);
    assert.equal(new Set(tids).size, tids.length, `${id}: ids de triggers únicos`);
    assert.ok(level.spawns.checkpoint && level.spawns.inicio && level.spawns.altar, `${id}: spawns checkpoint/inicio/altar`);
    assert.ok(level.props.some((p) => p.key === 'altar_memoria'), `${id}: tiene altar_memoria`);
    assert.ok(level.interactables.some((it) => it.action === 'altar'), `${id}: tiene interactuable altar`);
  }
  assert.ok(levels.santo_domingo.spawns.altar.x < levels.santo_domingo.triggers.find((t) => t.action === 'bruja_arena').x);
  assert.ok(levels.callejones.spawns.altar.x > 800 && levels.callejones.spawns.altar.x < config.pasaje.x0, 'Checkpoint intermedio');
});

await test('Taller: tres artesanos con orden gudelia → facundo → lucrecia, telar y textiles; salida pide MEMORIA', () => {
  const level = levels.oaxaca;
  assert.deepEqual(config.artesanos, ['gudelia', 'facundo', 'lucrecia']);
  for (const id of config.artesanos) {
    assert.ok(level.interactables.some((it) => it.action === 'n04_artesano' && it.data.artesano === id), `artesano ${id}`);
  }
  const x = (id) => level.interactables.find((it) => it.data?.artesano === id).x;
  assert.ok(x('gudelia') < x('facundo') && x('facundo') < x('lucrecia'));
  assert.ok(level.props.some((p) => p.key === 'npc_artesano_1') && level.props.some((p) => p.key === 'npc_artesano_3'));
  const exit = level.triggers.find((t) => t.action === 'ir_seccion');
  assert.equal(exit.data.requires, 'memoria');
  assert.equal(exit.data.section, 'callejones');
  assert.ok(config.gates.memoriaX > x('lucrecia'), 'La compuerta está después del taller');
  // El taller queda antes de las bestias para que MEMORIA ya esté aprendida al probarla.
  for (const b of level.enemies.filter((e) => e.type === 'bestia')) assert.ok(b.x > config.gates.memoriaX);
});

await test('Callejones: el grupo del pasaje son 3 bestias, hay muro con id, y la compuerta cae entre ellas y el muro', () => {
  const level = levels.callejones;
  const group = level.enemies.filter((e) => e.type === 'bestia' && e.x >= config.pasaje.x0 && e.x <= config.pasaje.x1);
  assert.equal(group.length, 3);
  const wall = level.props.find((p) => p.id === config.pasaje.muroId);
  assert.ok(wall && wall.key === 'prop_n04_muro_cerrado');
  assert.ok(config.gates.pasajeX > Math.max(...group.map((b) => b.x)), 'El grupo queda de este lado de la compuerta');
  assert.ok(config.gates.pasajeX < wall.x);
  assert.ok(level.spawns.pasaje.x < config.gates.pasajeX);
  assert.equal(level.triggers.find((t) => t.action === 'ir_seccion').data.requires, 'pasaje');
  assert.ok(level.interactables.some((it) => it.action === 'n04_juguetes' && it.data.maria === 'juguetes'));
  assert.ok(level.interactables.some((it) => it.action === 'n04_juguetes' && it.data.maria === 'ropa'));
});

await test('Los diálogos referenciados (nivel, director y datos) existen, tienen texto y hablantes conocidos', () => {
  const ids = new Set();
  for (const level of Object.values(levels)) {
    for (const it of level.interactables) if (typeof it.data?.dialogue === 'string') ids.add(it.data.dialogue);
    for (const t of level.triggers) if (typeof t.data?.dialogue === 'string') ids.add(t.data.dialogue);
  }
  for (const match of directorSource.matchAll(/say\('?(n04_[a-z0-9_]+)'?\)/g)) ids.add(match[1]);
  for (const match of directorSource.matchAll(/'(n04_[a-z0-9_]+)'/g)) if (dialogue[match[1]]) ids.add(match[1]);
  assert.ok(ids.size > 25, `hay diálogos suficientes (${ids.size})`);
  for (const id of ids) {
    assert.ok(Array.isArray(dialogue[id]) && dialogue[id].length > 0, `Diálogo existente: ${id}`);
    for (const line of dialogue[id]) {
      assert.ok(line.text.trim().length > 0, `Texto no vacío en ${id}`);
      assert.ok(dialogue._hablantes[line.who], `Hablante conocido en ${id}: ${line.who}`);
    }
  }
  for (const key of Object.keys(dialogue._hablantes)) assert.ok(key.startsWith('n04_'), `Prefijo n04_ en hablante ${key}`);
  for (const key of Object.keys(dialogue)) assert.ok(key === '_hablantes' || key.startsWith('n04_'), `Prefijo n04_ en ${key}`);
  const everything = JSON.stringify(dialogue) + JSON.stringify(config.maria);
  assert.ok(!/Rey del Olvido|ahog|esposa|Llorona/i.test(everything), 'No se adelanta el pasado ni el futuro de María');
  for (const key of ['llegada', 'artesanos', 'juguetes', 'ropa', 'templo', 'final']) {
    assert.ok(config.maria[key].text.length > 20, `Comentario de María: ${key}`);
  }
});

await test('MEMORIA, LUZ y SOL se pueden deletrear con checkWord real (letras permitidas, máx. 10)', () => {
  const { checkWord } = loadTs('src/lsm/core/letters.ts', { '../data/letters.json': json('src/lsm/data/letters.json') });
  for (const word of ['MEMORIA', 'LUZ', 'SOL']) {
    const check = checkWord(word);
    assert.equal(check.ok, true, `${word} válido`);
    assert.equal(check.letters.join(''), word);
  }
});

await test('Los números del nivel cuadran: compuertas, arena dentro del mundo y Ecos del director razonables', () => {
  assert.ok(config.gates.pasajeX < levels.callejones.width);
  assert.ok(config.arena.x0 >= levels.santo_domingo.triggers.find((t) => t.action === 'bruja_arena').x - 150);
  assert.ok(config.arena.x1 <= levels.santo_domingo.width);
  const r = config.rewards;
  const items = 8 * r.descubrimiento;
  const director = 3 * r.artesano + r.memoria + 2 * r.juguetes + r.pasaje + r.fragmento + items;
  assert.ok(director > 100 && director < 300, `Ecos del director razonables (${director})`);
});

/* ============================== director ============================== */

await test('Oaxaca: intro, comentario de María, barrera hasta aprender MEMORIA y orden de los artesanos', async () => {
  const h = harness();
  const s = await h.ready('oaxaca');
  assert.ok(h.dialogues.includes('n04_intro'));
  assert.equal(h.state.flags['n04:intro'], true);
  assert.equal(h.state.checkpoint.section, 'oaxaca');
  assert.ok(h.maria.some((t) => /puertas/.test(t)), 'María comenta al llegar');
  s.tick();
  assert.deepEqual(h.calls.find(([k]) => k === 'lockArena'), ['lockArena', 0, config.gates.memoriaX]);
  assert.match(h.text, /ARTESANOS 0\/3/);
  await h.act('n04_artesano', { artesano: 'facundo' });
  assert.ok(h.dialogues.includes('n04_facundo_pendiente'));
  await h.act('n04_artesano', { artesano: 'lucrecia' });
  assert.ok(h.dialogues.includes('n04_lucrecia_pendiente'));
  assert.ok(!h.state.learnedSpells.includes('MEMORIA'));
  await h.act('n04_artesano', { artesano: 'gudelia' });
  assert.equal(h.state.flags['n04:artesano:gudelia'], true);
  await h.act('n04_artesano', { artesano: 'lucrecia' });
  assert.ok(!h.state.learnedSpells.includes('MEMORIA'), 'Lucrecia espera a Facundo');
  await h.act('n04_artesano', { artesano: 'facundo' });
  await h.act('n04_artesano', { artesano: 'lucrecia' });
  assert.ok(h.state.learnedSpells.includes('MEMORIA'));
  assert.equal(h.state.selectedSpell, 'MEMORIA');
  assert.equal(h.state.flags['n04:memoria'], true);
  assert.ok(['n04_gudelia', 'n04_facundo', 'n04_lucrecia', 'n04_memoria_fin'].every((id) => h.dialogues.includes(id)));
  assert.equal(h.state.ecos, 3 * config.rewards.artesano + config.rewards.memoria);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  await h.act('n04_artesano', { artesano: 'lucrecia' });
  assert.equal(h.state.ecos, 3 * config.rewards.artesano + config.rewards.memoria, 'No se premia dos veces');
  assert.ok(h.dialogues.includes('n04_lucrecia_repite'));
  s.tick();
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'), 'Se abre la compuerta de la calle');
  assert.match(h.text, /ARTESANOS 3\/3/);
});

await test('Conjuro sin definición aún en spells.json: MEMORIA se concede con aviso en vez de atascar', async () => {
  const h = harness({ spellDefs: false });
  await h.ready('oaxaca');
  await aprenderMemoria(h);
  assert.ok(h.state.learnedSpells.includes('MEMORIA'));
  assert.equal(h.state.flags['n04:memoria'], true);
  assert.ok(h.toasts.some((t) => /MEMORIA/.test(t)));
});

await test('Descubrimientos y pobladores: se premian una sola vez', async () => {
  const h = harness();
  await h.ready('oaxaca');
  await h.act('n04_examinar', { descubrimiento: 'letrero' });
  await h.act('n04_examinar', { descubrimiento: 'letrero' });
  await h.act('n04_examinar', { descubrimiento: 'telar' });
  await h.act('n04_examinar', { dialogue: 'n04_poblador_1' });
  assert.equal(h.state.ecos, 2 * config.rewards.descubrimiento);
  assert.ok(h.dialogues.includes('n04_poblador_1'));
});

await test('Salir de Oaxaca sin MEMORIA no cambia de sección; con ella sí, hacia callejones', async () => {
  const h = harness();
  await h.ready('oaxaca');
  await h.trigger('n04_a_callejones');
  assert.ok(!h.calls.some(([k]) => k === 'goto'));
  assert.ok(h.toasts.some((t) => /MEMORIA/.test(t)));
  h.state.flags['n04:memoria'] = true;
  await h.trigger('n04_a_callejones');
  assert.deepEqual(h.calls.find(([k]) => k === 'goto'), ['goto', 'callejones', 'inicio']);
});

await test('Triggers de diálogo: el del taller y el del templo lanzan el comentario de María una vez', async () => {
  const h = harness();
  await h.ready('oaxaca');
  await h.trigger('n04_taller_vista');
  await h.trigger('n04_taller_vista');
  assert.equal(h.maria.filter((t) => /cobija/.test(t)).length, 1);
  assert.ok(h.dialogues.includes('n04_taller_vista'));
  await h.trigger('n04_vista_calles');
  assert.ok(h.toasts.some((t) => /Encapuchados/.test(t)));
});

await test('Sin Maria.mariaSay, el comentario viaja por el bus (maria:say)', async () => {
  const h = harness({ withMariaApi: false });
  await h.ready('callejones');
  await h.act('n04_juguetes', { maria: 'juguetes' });
  assert.ok(h.emitted.some((e) => e.name === 'maria:say' && /trompo/.test(e.payload.text)));
});

await test('Callejones: juguetes y ropa premian una vez y disparan a María; el muro cerrado bloquea hasta purificar', async () => {
  const h = harness();
  const s = await h.ready('callejones');
  assert.equal(h.state.flags['n04:memoria'], true, 'Entrada directa concede MEMORIA para pruebas');
  assert.ok(h.state.learnedSpells.includes('MEMORIA'));
  s.tick();
  assert.deepEqual(h.calls.find(([k]) => k === 'lockArena'), ['lockArena', 0, config.gates.pasajeX]);
  await h.act('n04_juguetes', { maria: 'juguetes' });
  await h.act('n04_juguetes', { maria: 'juguetes' });
  await h.act('n04_juguetes', { maria: 'ropa' });
  assert.equal(h.state.ecos, 2 * config.rewards.juguetes);
  assert.equal(h.maria.length, 2, 'Un comentario por objeto');
  assert.ok(h.maria.some((t) => /trompo/.test(t)) && h.maria.some((t) => /ropita/.test(t)));
  await h.act('n04_muro');
  assert.ok(h.dialogues.includes('n04_muro_cerrado'));
  await h.trigger('n04_a_santo_domingo');
  assert.ok(!h.calls.some(([k]) => k === 'goto'));
  assert.ok(h.toasts.some((t) => /pasaje/i.test(t)));
});

await test('Pasaje: al purificar las 3 bestias del grupo se revela (pasaje:revealed, muro abierto, compuerta libre)', async () => {
  const h = harness();
  const level = levels.callejones;
  const beasts = level.enemies.map((e) => (e.type === 'bestia' ? h.beast(e.x, e.y) : h.hood(e.x, e.y)));
  const s = await h.ready('callejones', { enemies: [...beasts] });
  // Las bestias sueltas (fuera del grupo marcado) no cuentan.
  h.purify(beasts[0]);
  h.purify(beasts[1]);
  await flush();
  assert.equal(h.state.flags['n04:pasaje'], undefined);
  assert.match(h.text, /MURO 0\/3/);
  h.purify(beasts[4]);
  h.purify(beasts[5]);
  await flush();
  assert.equal(h.state.flags['n04:pasaje'], undefined, 'Faltan bestias del grupo');
  assert.match(h.text, /MURO 2\/3/);
  h.purify(beasts[6]);
  await flush();
  assert.equal(h.state.flags['n04:pasaje'], true);
  assert.ok(h.emitted.some((e) => e.name === 'pasaje:revealed' && e.payload.id === config.pasaje.id));
  assert.equal(h.emitted.filter((e) => e.name === 'pasaje:revealed').length, 1);
  assert.equal(h.sprites[`callejones:${config.pasaje.muroId}`].texture, config.pasaje.texturaAbierta);
  assert.ok(h.dialogues.includes('n04_pasaje'));
  assert.equal(h.state.ecos, config.rewards.pasaje);
  assert.equal(h.state.checkpoint.x, level.spawns.pasaje.x);
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'));
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  s.tick();
  assert.equal(h.emitted.filter((e) => e.name === 'pasaje:revealed').length, 1, 'No se revela dos veces');
  assert.match(h.text, /MURO 3\/3/);
  await h.act('n04_muro');
  assert.ok(h.dialogues.includes('n04_muro_abierto'));
  await h.trigger('n04_a_santo_domingo');
  assert.deepEqual(h.calls.find(([k]) => k === 'goto'), ['goto', 'santo_domingo', 'inicio']);
});

await test('Muerte y reinstalación conservan el progreso: derrotados no reaparecen, pasaje abierto y checkpoint', async () => {
  const h = harness();
  const level = levels.callejones;
  const mkAll = () => level.enemies.map((e) => (e.type === 'bestia' ? h.beast(e.x, e.y) : h.hood(e.x, e.y)));
  const first = mkAll();
  const s1 = await h.ready('callejones', { enemies: first });
  h.emit('cofradia:down', { enemy: first[7] });
  h.emit('cofradia:down', { enemy: { kind: 'encapuchado' } }); // no mapeado: se ignora
  h.purify(first[0]);
  for (const i of [4, 5, 6]) h.purify(first[i]);
  await flush();
  assert.equal(h.state.flags['n04:pasaje'], true);
  const cp = h.state.checkpoint;
  assert.equal(Object.keys(h.state.flags).filter((k) => k.startsWith('n04:down:')).length, 5);
  s1.shutdown();
  const all = mkAll();
  const s2 = await h.ready('callejones', { enemies: [...all] });
  assert.equal(h.state.checkpoint, cp);
  for (const i of [0, 4, 5, 6, 7]) assert.equal(all[i].alive, false, `El derrotado ${i} no reaparece`);
  assert.equal(all.filter((e) => e.alive).length, level.enemies.length - 5);
  assert.equal(h.sprites[`callejones:${config.pasaje.muroId}`].texture, config.pasaje.texturaAbierta);
  s2.tick();
  assert.equal(h.emitted.filter((e) => e.name === 'pasaje:revealed').length, 1, 'No se vuelve a revelar al reiniciar');
  assert.equal(h.emitted.filter((e) => e.name === 'checkpoint').filter((e) => e.payload.section === 'callejones').length, 2,
    'Checkpoint inicial más el del pasaje');
});

await test('Tutoriales: bestia agotada sin MEMORIA y con MEMORIA muestran el aviso correcto', async () => {
  const h = harness();
  const b = h.beast(2240, 285);
  await h.ready('oaxaca', { enemies: [b] });
  h.emit('enemy:exhausted', { enemy: b });
  assert.ok(h.toasts.some((t) => /artesanos/.test(t)));
  const h2 = harness();
  h2.state.flags['n04:memoria'] = true;
  const b2 = h2.beast(2240, 285);
  await h2.ready('oaxaca', { enemies: [b2] });
  h2.emit('enemy:exhausted', { enemy: b2 });
  assert.ok(h2.toasts.some((t) => /purifícala con MEMORIA/.test(t)));
});

await test('Santo Domingo: la arena inicia una vez con lockArena + arena:start; boss:calmed lleva al fragmento y a la salida', async () => {
  const h = harness();
  const boss = h.boss(2150, 290);
  const s = await h.ready('santo_domingo', { enemies: [] });
  assert.equal(h.state.flags['n04:pasaje'], true, 'Entrada directa prepara el pasaje');
  assert.equal(h.sprites['santo_domingo:n04_fragmento'].visible, false, 'El fragmento está oculto hasta vencer a la Bruja');
  assert.equal(await h.act('n04_fragmento'), false);
  assert.equal(await h.act('n04_salida'), false, 'La salida está cerrada antes del fragmento');
  await h.trigger('n04_bruja_arena');
  assert.ok(h.dialogues.includes('n04_bruja_intro'));
  assert.deepEqual(h.calls.filter(([k]) => k === 'lockArena').at(-1), ['lockArena', config.arena.x0, config.arena.x1]);
  assert.ok(h.emitted.some((e) => e.name === 'arena:start' && e.payload.group === 'bruja'));
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n04_jefe'));
  assert.equal(h.state.selectedSpell, 'LUZ');
  const starts = () => h.emitted.filter((e) => e.name === 'arena:start').length;
  await h.trigger('n04_bruja_arena');
  assert.equal(starts(), 1, 'No reinicia la arena en curso');
  s.world.enemies.push(boss);
  s.tick();
  assert.equal(h.state.flags['n04:bruja'], undefined);
  assert.equal(await h.act('altar'), false, 'Sin altar durante el combate');
  h.emit('bruja:form', { form: 'humana' });
  h.emit('bruja:form', { form: 'ave' });
  h.emit('boss:vulnerable', { on: true });
  assert.ok(h.toasts.some((t) => /LUZ/.test(t) && /Forma humana/.test(t)));
  assert.ok(h.toasts.some((t) => /SOL/.test(t) && /ave/.test(t)));
  assert.ok(h.toasts.some((t) => /defensas/.test(t)));
  h.emit('boss:calmed', {});
  await flush();
  assert.equal(h.state.flags['n04:bruja'], true);
  assert.ok(h.emitted.some((e) => e.name === 'arena:clear'));
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n04_templo'));
  assert.ok(h.dialogues.includes('n04_bruja_fin'));
  assert.equal(h.state.flags['n04:bruja_fin'], true);
  assert.equal(h.sprites['santo_domingo:n04_fragmento'].visible, true);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  assert.equal(await h.act('n04_salida'), false, 'Primero el fragmento');
  assert.equal(await h.act('n04_fragmento'), true);
  assert.ok(h.dialogues.includes('n04_fragmento'));
  assert.equal(h.state.flags['n04:fragmento'], true);
  assert.equal(h.state.ecos, config.rewards.fragmento);
  // Puebla se omite: la Bruja entrega el 2.º y el 3.er fragmento (decisión del equipo, 2026-10-19).
  assert.equal(h.state.flags['n04:fragmento_3'], true);
  assert.ok(h.maria.some((t) => /Tres fragmentos/.test(t)), 'María dice algo breve al final');
  assert.equal(await h.act('n04_fragmento'), false, 'El fragmento no se toma dos veces');
  assert.equal(await h.act('n04_salida'), true);
  assert.ok(h.dialogues.includes('n04_salida'));
  assert.equal(h.state.flags['n04:completo'], true);
  // Puebla se omite: la salida de Oaxaca continúa a la CDMX (Nivel 6).
  assert.ok(h.calls.some(([k]) => k === 'prepareCdmxEntry'), 'prepara la entrada a la CDMX');
  assert.ok(h.calls.some(([k, key]) => k === 'goto' && key === 'xochimilco'), 'continúa a la CDMX');
  h.emit('boss:calmed', {});
  await flush();
  assert.equal(h.dialogues.filter((id) => id === 'n04_bruja_fin').length, 1, 'El cierre no se repite');
});

await test('Respaldo de la jefa: si la Bruja no aparece, el nivel no se atasca', async () => {
  const h = harness();
  const s = await h.ready('santo_domingo', { enemies: [] });
  await h.trigger('n04_bruja_arena');
  s.tick();
  assert.equal(h.state.flags['n04:bruja'], undefined);
  s.clock.now = config.respaldoJefeMs + 1000;
  s.tick();
  await flush();
  assert.equal(h.state.flags['n04:bruja'], true);
  assert.ok(h.dialogues.includes('n04_bruja_fin'));
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'));
  assert.equal(await h.act('n04_fragmento'), true);
});

await test('Si se muere tras vencer a la Bruja, al reiniciar se retoma el cierre y el fragmento sigue disponible', async () => {
  const h = harness();
  h.state.flags['n04:memoria'] = true;
  h.state.flags['n04:pasaje'] = true;
  h.state.flags['n04:bruja'] = true;
  await h.ready('santo_domingo', { enemies: [] });
  assert.ok(h.dialogues.includes('n04_bruja_fin'));
  assert.ok(!h.dialogues.includes('n04_bruja_intro'));
  assert.equal(h.sprites['santo_domingo:n04_fragmento'].visible, true);
  assert.equal(await h.act('n04_fragmento'), true);
  // Tras tomarlo y volver a cargar, el fragmento queda oculto.
  const h2 = harness();
  Object.assign(h2.state.flags, { 'n04:memoria': true, 'n04:pasaje': true, 'n04:bruja': true, 'n04:bruja_fin': true, 'n04:fragmento': true });
  await h2.ready('santo_domingo', { enemies: [] });
  assert.equal(h2.sprites['santo_domingo:n04_fragmento'].visible, false);
  assert.equal(await h2.act('n04_salida'), true);
});

await test('Orden del nivel: taller → pasaje → jefa, de punta a punta con un mismo estado', async () => {
  const h = harness();
  // 1. Oaxaca: aprender MEMORIA.
  let s = await h.ready('oaxaca', { enemies: [] });
  s.tick();
  await aprenderMemoria(h);
  await h.trigger('n04_a_callejones');
  assert.deepEqual(h.calls.filter(([k]) => k === 'goto').at(-1), ['goto', 'callejones', 'inicio']);
  s.shutdown();
  // 2. Callejones: purificar el grupo del pasaje.
  const beasts = levels.callejones.enemies.filter((e) => e.type === 'bestia').map((e) => h.beast(e.x, e.y));
  s = await h.ready('callejones', { enemies: [...beasts] });
  assert.equal(h.state.checkpoint.section, 'callejones');
  for (const b of beasts.slice(4)) h.purify(b);
  await flush();
  assert.equal(h.state.flags['n04:pasaje'], true);
  await h.trigger('n04_a_santo_domingo');
  assert.deepEqual(h.calls.filter(([k]) => k === 'goto').at(-1), ['goto', 'santo_domingo', 'inicio']);
  s.shutdown();
  // 3. Santo Domingo: jefa → fragmento → salida.
  s = await h.ready('santo_domingo', { enemies: [] });
  await h.trigger('n04_bruja_arena');
  s.world.enemies.push(h.boss(2150, 290));
  h.emit('boss:calmed', {});
  await flush();
  await h.act('n04_fragmento');
  await h.act('n04_salida');
  assert.equal(h.state.flags['n04:completo'], true);
  const dirEcos = 3 * config.rewards.artesano + config.rewards.memoria + config.rewards.pasaje + config.rewards.fragmento;
  assert.equal(h.state.ecos, dirEcos);
  assert.ok(h.state.learnedSpells.includes('MEMORIA'));
});

await test('Entrada directa a Oaxaca sin María prepara la entrada (para pruebas) y respeta el checkpoint propio', async () => {
  const h = harness({ hasMaria: false });
  await h.ready('oaxaca', { enemies: [] });
  assert.ok(h.calls.some(([k]) => k === 'prepareOaxacaEntry'));
  assert.equal(h.state.checkpoint.section, 'oaxaca');
  assert.equal(h.state.section, 'oaxaca');
});

await test('Shutdown durante un diálogo no concede premios ni deja el mundo congelado', async () => {
  const h = harness();
  const s = await h.ready('oaxaca');
  h.hold('n04_gudelia');
  await h.act('n04_artesano', { artesano: 'gudelia' });
  assert.equal(s.world.timeScale, 0);
  s.shutdown();
  await h.release();
  assert.equal(h.state.ecos, 0);
  assert.equal(h.state.flags['n04:artesano:gudelia'], undefined);
});

await test('Altar: cura, actualiza checkpoint y abre el menú del Altar', async () => {
  const h = harness();
  await h.ready('santo_domingo', { enemies: [] });
  await h.act('altar');
  assert.equal(h.state.hp, h.state.maxHp);
  assert.equal(h.state.checkpoint.x, levels.santo_domingo.spawns.altar.x);
  assert.ok(h.calls.some(([k, key]) => k === 'launch' && key === 'Altar'));
});

console.log(`\n${passed} pruebas del Nivel 4 correctas.`);
