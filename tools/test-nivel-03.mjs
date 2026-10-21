// Prueba del Nivel 3 (Catemaco): datos de las tres secciones y el director TypeScript real con adaptadores
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
const config = json('src/data/catemaco.json');
const dialogue = json('src/data/dialogue/n03.json');
const levels = {
  catemaco: json('src/data/levels/catemaco.json'),
  campamento: json('src/data/levels/campamento.json'),
  altar_olmeca: json('src/data/levels/altar_olmeca.json'),
};
const directorSource = read('src/systems/CatemacoDirector.ts');
const code = ts.transpileModule(directorSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };

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

function harness({ spellDefs = true, withLunaApi = true } = {}) {
  const state = {
    flags: {}, learnedSpells: ['CALMA', 'PROTECCION', 'VOZ'], mastery: {}, selectedSpell: 'CALMA',
    hp: 1, maxHp: 5, ecos: 0, totalEcosEarned: 0, checkpoint: null, section: 'catemaco',
    shield: { unlocked: false, energy: 1, active: false, broken: false },
    luna: { unlocked: false, energy: 1, active: false }, hasBalam: false,
  };
  const emitter = new EventEmitter();
  const emitted = [];
  const dialogues = [];
  const toasts = [];
  const calls = [];
  const rewards = [];
  const blocks = [];
  const flags = { shieldOn: false };
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
    './Shield': {
      isShieldActive: () => flags.shieldOn,
      shieldFilterHit: (_world, hit) => { blocks.push(hit); return null; },
    },
    './Luna': withLunaApi ? { isLunaActive: () => false, unlockLuna: () => calls.push(['unlockLuna']) } : { isLunaActive: () => false },
    '../data/catemaco.json': config,
    // La salida de Catemaco continúa a Oaxaca (Nivel 4).
    './Campaign': { prepareOaxacaEntry: () => calls.push(['prepareOaxacaEntry']) },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${code}\n})`, {}, {
    filename: fileURLToPath(new URL('src/systems/CatemacoDirector.ts', root)),
  })((name) => {
    assert.ok(name in mods, `Dependencia inesperada: ${name}`);
    return mods[name];
  }, module, module.exports);

  function install(section, { enemies } = {}) {
    const level = levels[section];
    const text = new Proxy({}, { get: (_t, key) => (key === 'setText' ? (t) => { currentText = t; return text; } : key === 'then' ? undefined : () => text) });
    const clock = { now: 0 };
    const scene = {
      events: new EventEmitter().setMaxListeners(0),
      add: {
        text: () => text, circle: fake, ellipse: fake, image: fake, sprite: fake, rectangle: fake, container: fake,
      },
      make: { graphics: fake },
      textures: { exists: () => false },
      anims: { exists: () => false },
      children: { getByName: () => null },
      tweens: { add: (cfg) => { cfg.onComplete?.(); return fake(); } },
      time: {
        get now() { return clock.now; },
        delayedCall: (_ms, callback) => { Promise.resolve().then(callback); return fake(); },
        addEvent: (cfg) => { tickFn = cfg.callback; return fake(); },
      },
      scene: {
        launch: (...args) => calls.push(['launch', ...args]),
        bringToTop() {}, pause() { calls.push(['pause']); },
        isActive: () => true, isPaused: () => false, stop() {},
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
    module.exports.installCatemacoDirector(world);
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
  /** Avanza el UPDATE de la escena (las piedras de práctica) en pasos de 100 ms. */
  async function advance(session, ms) {
    for (let t = 0; t < ms; t += 100) {
      session.clock.now += 100;
      session.scene.events.emit('update', session.clock.now, 100);
    }
    await flush();
  }
  const spirit = (x, y) => ({ kind: 'espiritu', x, y, alive: true, purified: false, exhausted: false, destroy() { this.alive = false; } });
  const hood = (x, y) => ({ kind: 'encapuchado', x, y, alive: true, purified: false, exhausted: false, destroy() { this.alive = false; } });
  return {
    state, emitted, dialogues, toasts, calls, rewards, blocks, flags, install, ready, act, trigger, advance, spirit, hood,
    emit: (name, payload) => bus.emit(name, payload),
    hold: (id) => { waitingDialogue = id; },
    release: async () => { waitingDialogue = null; pending?.(); pending = null; await flush(); },
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

/* ============================== datos ============================== */

const { WalkMap } = loadTs('src/world/WalkMap.ts', { '../config/movement': loadTs('src/config/movement.ts') });
function mapOf(level) {
  const extra = level.props.filter((prop) => prop.collide).map((prop) => ({ shape: 'ellipse', x: prop.x, y: prop.y, ...prop.collide }));
  return new WalkMap(level, extra);
}

await test('Existen las tres secciones con su id, ancho y música', () => {
  assert.deepEqual(Object.keys(levels), ['catemaco', 'campamento', 'altar_olmeca']);
  const widths = { catemaco: 2400, campamento: 3200, altar_olmeca: 2400 };
  const tracks = { catemaco: 'n03_pueblo', campamento: 'n03_lago', altar_olmeca: 'n03_altar' };
  for (const [id, level] of Object.entries(levels)) {
    assert.equal(level.id, id);
    assert.equal(level.width, widths[id]);
    assert.equal(level.music, tracks[id]);
    assert.equal(level.cameraBounds.x1, widths[id]);
    assert.ok(level.background.startsWith('fondo_'));
  }
});

await test('Conteos de enemigos: 3 + 9 encapuchados rojos, 8 espíritus lunaOnly y la Cabeza en su grupo', () => {
  const rank = (level) => level.enemies.filter((e) => e.type === 'encapuchado');
  assert.equal(rank(levels.catemaco).length, 3);
  assert.equal(rank(levels.campamento).length, 9);
  for (const e of [...rank(levels.catemaco), ...rank(levels.campamento)]) assert.equal(e.rank, 'rojo');
  const spirits = levels.altar_olmeca.enemies.filter((e) => e.type === 'espiritu');
  assert.equal(spirits.length, 8);
  for (const s of spirits) { assert.equal(s.lunaOnly, true); assert.equal(s.group, undefined); }
  const boss = levels.altar_olmeca.enemies.filter((e) => e.type === 'cabeza_olmeca');
  assert.equal(boss.length, 1);
  assert.equal(boss[0].group, 'olmeca');
  assert.equal(levels.altar_olmeca.triggers.find((t) => t.action === 'olmeca_arena').data.group, 'olmeca');
});

await test('Interactuables, spawns, checkpoints, enemigos y triggers están en suelo transitable (franja 220–345)', () => {
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
    assert.ok(level.obstacles.every((o) => o.shape !== 'ellipse' || o.water === true), `${id}: obstáculos elípticos son agua`);
  }
});

await test('Ids únicos y checkpoints (altar_memoria) presentes: inicio, pueblo/lago y antes del jefe', () => {
  for (const [id, level] of Object.entries(levels)) {
    const ids = level.interactables.map((it) => it.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: ids de interactuables únicos`);
    assert.ok(level.spawns.checkpoint && level.spawns.inicio && level.spawns.altar, `${id}: spawns checkpoint/inicio/altar`);
    assert.ok(level.props.some((p) => p.key === 'altar_memoria'), `${id}: tiene altar_memoria`);
    assert.ok(level.interactables.some((it) => it.action === 'altar'), `${id}: tiene interactuable altar`);
  }
  assert.ok(levels.altar_olmeca.spawns.altar.x < levels.altar_olmeca.triggers.find((t) => t.action === 'olmeca_arena').x, 'Altar antes de la arena');
});

await test('Guardias y jaulas: la jaula c es la última y los guardias del campamento están cerca de las jaulas', () => {
  const level = levels.campamento;
  assert.deepEqual(config.jaulas, ['a', 'b', 'c']);
  for (const id of config.jaulas) assert.ok(level.interactables.some((it) => it.action === 'n03_jaula' && it.data.jaula === id));
  const guards = level.enemies.filter((e) => e.x > 2800);
  assert.ok(guards.length >= 2);
  for (const id of config.pistas) assert.ok(level.interactables.some((it) => it.action === 'n03_pista' && it.data.pista === id), `pista ${id}`);
});

await test('Los diálogos referenciados (nivel, director y datos) existen, tienen texto y hablantes conocidos', () => {
  const ids = new Set();
  for (const level of Object.values(levels)) {
    for (const it of level.interactables) if (typeof it.data?.dialogue === 'string') ids.add(it.data.dialogue);
    for (const t of level.triggers) if (typeof t.data?.dialogue === 'string') ids.add(t.data.dialogue);
  }
  for (const match of directorSource.matchAll(/say\('(n03_[a-z0-9_]+)'\)/g)) ids.add(match[1]);
  for (const id of config.jaulas) ids.add(`n03_jaula_${id}`);
  for (const id of config.pistas) ids.add(`n03_pista_${id}`);
  for (const id of ['n03_intro', 'n03_balam_1', 'n03_balam_2', 'n03_maria_1', 'n03_maria_2', 'n03_salida']) ids.add(id);
  assert.ok(ids.size > 30);
  for (const id of ids) {
    assert.ok(Array.isArray(dialogue[id]) && dialogue[id].length > 0, `Diálogo existente: ${id}`);
    for (const line of dialogue[id]) {
      assert.ok(line.text.trim().length > 0, `Texto no vacío en ${id}`);
      assert.ok(dialogue._hablantes[line.who], `Hablante conocido en ${id}: ${line.who}`);
    }
  }
  for (const key of Object.keys(dialogue._hablantes)) assert.ok(key.startsWith('n03_'), `Prefijo n03_ en hablante ${key}`);
  const text = JSON.stringify(dialogue);
  assert.ok(!/Rey del Olvido|ahog/i.test(text), 'No se adelanta el futuro de María');
});

await test('LUZ y SOL se pueden deletrear con checkWord real (letras permitidas, máx. 10)', () => {
  const { checkWord } = loadTs('src/lsm/core/letters.ts', { '../data/letters.json': json('src/lsm/data/letters.json') });
  for (const word of ['LUZ', 'SOL']) {
    const check = checkWord(word);
    assert.equal(check.ok, true, `${word} válido`);
    assert.equal(check.letters.join(''), word);
  }
});

await test('Los números del nivel cuadran: gates de espíritus crecientes, arena dentro del mundo, Ecos aproximados', () => {
  const gates = config.espiritus.gates;
  assert.deepEqual([...gates].sort((a, b) => a - b), gates);
  const spirits = levels.altar_olmeca.enemies.filter((e) => e.type === 'espiritu');
  for (const s of spirits) assert.ok(gates.some((g) => s.x < g), `Espíritu ${s.x} tiene compuerta`);
  assert.ok(gates.at(-1) < levels.altar_olmeca.spawns.altar.x);
  assert.ok(config.arena.x0 >= levels.altar_olmeca.triggers.find((t) => t.action === 'olmeca_arena').x - 150);
  assert.ok(config.arena.x1 <= levels.altar_olmeca.width);
  const r = config.rewards;
  const director = 2 * r.brujo + r.escudo + 3 * r.descubrimiento + config.pistas.length * r.pista + r.deduccion + config.jaulas.length * r.jaula + r.balam;
  assert.ok(director > 100 && director < 260, `Ecos del director razonables (${director})`);
});

/* ============================== director ============================== */

await test('Catemaco: intro, barrera hasta aprender con los brujos y orden LUZ → SOL → escudo', async () => {
  const h = harness();
  const s = await h.ready('catemaco');
  assert.ok(h.dialogues.includes('n03_intro'));
  assert.equal(h.state.flags['n03:intro'], true);
  assert.equal(h.state.checkpoint.section, 'catemaco');
  s.tick();
  assert.deepEqual(h.calls.find(([k]) => k === 'lockArena'), ['lockArena', 0, config.gates.catemacoX]);
  assert.match(h.text, /BRUJOS 0\/3/);
  await h.act('n03_brujo', { brujo: 'sol' });
  assert.ok(h.dialogues.includes('n03_eulalia_pendiente'));
  assert.ok(!h.state.learnedSpells.includes('SOL'));
  await h.act('n03_brujo', { brujo: 'escudo' });
  assert.ok(h.dialogues.includes('n03_atanasio_pendiente'));
  await h.act('n03_brujo', { brujo: 'luz' });
  assert.ok(h.state.learnedSpells.includes('LUZ'));
  assert.equal(h.state.flags['n03:brujo:luz'], true);
  await h.act('n03_brujo', { brujo: 'sol' });
  assert.ok(h.state.learnedSpells.includes('SOL'));
  assert.equal(h.state.ecos, config.rewards.brujo * 2);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  await h.act('n03_brujo', { brujo: 'luz' });
  assert.equal(h.state.ecos, config.rewards.brujo * 2, 'No se premia dos veces');
  assert.match(h.text, /BRUJOS 2\/3/);
});

await test('Escudo: práctica de 3 piedras exige tener el escudo arriba; se premia una vez y abre el camino', async () => {
  const h = harness();
  const s = await h.ready('catemaco');
  s.tick();
  await h.act('n03_brujo', { brujo: 'luz' });
  await h.act('n03_brujo', { brujo: 'sol' });
  await h.act('n03_brujo', { brujo: 'escudo' });
  assert.equal(h.state.shield.unlocked, true);
  assert.ok(h.dialogues.includes('n03_atanasio_practica'));
  assert.equal(s.world.timeScale, 1, 'La práctica corre en tiempo real');
  assert.equal(s.world.player.controlsLocked, false);
  assert.equal(h.state.flags['n03:brujo:escudo'], undefined);
  // Sin escudo las piedras no cuentan.
  await h.advance(s, 5000);
  assert.equal(h.blocks.length, 0);
  assert.equal(h.state.flags['n03:brujo:escudo'], undefined);
  h.flags.shieldOn = true;
  await h.advance(s, 20000);
  assert.equal(h.blocks.length, config.escudo.piedras);
  assert.equal(h.state.flags['n03:brujo:escudo'], true);
  assert.equal(h.state.flags['n03:brujos_ok'], true);
  assert.ok(h.dialogues.includes('n03_atanasio_fin'));
  assert.equal(h.state.ecos, config.rewards.brujo * 2 + config.rewards.escudo);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  s.tick();
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'), 'Se abre la barrera del pueblo');
});

await test('Escudo: si nunca se levanta, tras los intentos máximos se da por aprendido (sin atascar el nivel)', async () => {
  const h = harness();
  const s = await h.ready('catemaco');
  await h.act('n03_brujo', { brujo: 'luz' });
  await h.act('n03_brujo', { brujo: 'sol' });
  await h.act('n03_brujo', { brujo: 'escudo' });
  await h.advance(s, 70000);
  assert.equal(h.state.flags['n03:brujo:escudo'], true);
  assert.equal(h.state.flags['n03:brujos_ok'], true);
});

await test('Conjuros sin definición aún en spells.json se conceden con aviso en vez de atascar', async () => {
  const h = harness({ spellDefs: false });
  await h.ready('catemaco');
  await h.act('n03_brujo', { brujo: 'luz' });
  assert.ok(h.state.learnedSpells.includes('LUZ'));
  assert.equal(h.state.flags['n03:brujo:luz'], true);
});

await test('Salir de Catemaco sin los brujos no cambia de sección; con ellos sí, hacia el campamento', async () => {
  const h = harness();
  await h.ready('catemaco');
  await h.trigger('n03_a_campamento');
  assert.ok(!h.calls.some(([k]) => k === 'goto'));
  assert.ok(h.toasts.some((t) => /brujos/.test(t)));
  h.state.flags['n03:brujos_ok'] = true;
  await h.trigger('n03_a_campamento');
  assert.deepEqual(h.calls.find(([k]) => k === 'goto'), ['goto', 'campamento', 'inicio']);
});

await test('Campamento: seis pistas premian una vez; la deducción completa se paga una sola vez', async () => {
  const h = harness();
  await h.ready('campamento');
  for (const id of config.pistas) await h.act('n03_pista', { pista: id });
  for (const id of config.pistas) await h.act('n03_pista', { pista: id });
  assert.equal(h.state.ecos, config.pistas.length * config.rewards.pista + config.rewards.deduccion);
  assert.ok(h.dialogues.includes('n03_deduccion'));
  assert.equal(h.dialogues.filter((id) => id === 'n03_deduccion').length, 1);
  assert.match(h.text, /PISTAS 6\/6/);
});

await test('Jaulas: guardias cerca bloquean; la última exige las otras; Balam despierta, Luna se desbloquea', async () => {
  const h = harness();
  const cageA = levels.campamento.interactables.find((it) => it.data?.jaula === 'a');
  const guard = h.hood(cageA.x + 20, cageA.y);
  const s = await h.ready('campamento', { enemies: [guard] });
  await h.act('n03_jaula', { jaula: 'a' });
  assert.equal(h.state.flags['n03:jaula:a'], undefined);
  assert.ok(h.toasts.some((t) => /encapuchados/.test(t)));
  guard.alive = false;
  await h.act('n03_jaula', { jaula: 'c' });
  assert.equal(h.state.flags['n03:jaula:c'], undefined, 'La última exige las otras');
  await h.act('n03_jaula', { jaula: 'a' });
  await h.act('n03_jaula', { jaula: 'b' });
  assert.equal(h.state.hasBalam, false);
  assert.equal(await h.act('n03_jaula', { jaula: 'a' }), false, 'Una jaula abierta deja de ser interactuable');
  await h.act('n03_jaula', { jaula: 'c' });
  assert.ok(['n03_jaula_c', 'n03_balam_1', 'n03_balam_2'].every((id) => h.dialogues.includes(id)));
  assert.equal(h.state.hasBalam, true);
  assert.equal(h.state.luna.unlocked, true);
  assert.ok(h.calls.some(([k]) => k === 'unlockLuna'));
  assert.ok(h.emitted.some((e) => e.name === 'balam:awake'));
  assert.equal(h.state.flags['n03:balam'], true);
  assert.equal(h.state.ecos, config.jaulas.length * config.rewards.jaula + config.rewards.balam);
  assert.equal(s.world.player.controlsLocked, false);
  assert.equal(s.world.timeScale, 1);
  assert.match(h.text, /Luna/);
  h.emit('luna:state', { active: true, energy: 1 });
  assert.equal(h.state.flags['n03:luna_tut'], true, 'El primer uso de Luna cierra el tutorial de F');
});

await test('Luna sin API de unlockLuna: el director desbloquea GameState.luna por su cuenta', async () => {
  const h = harness({ withLunaApi: false });
  await h.ready('campamento');
  for (const id of config.jaulas) await h.act('n03_jaula', { jaula: id });
  assert.equal(h.state.luna.unlocked, true);
  assert.equal(h.state.hasBalam, true);
});

await test('Tutorial de Luna: el primer luna:state activo lo marca; salir del campamento exige Balam', async () => {
  const h = harness();
  await h.ready('campamento');
  await h.trigger('n03_a_altar');
  assert.ok(!h.calls.some(([k]) => k === 'goto'));
  for (const id of config.jaulas) await h.act('n03_jaula', { jaula: id });
  assert.equal(h.state.flags['n03:luna_tut'], undefined);
  h.state.flags['n03:balam'] = true;
  await h.trigger('n03_a_altar');
  assert.ok(h.dialogues.includes('n03_campamento_fin'));
  assert.deepEqual(h.calls.find(([k]) => k === 'goto'), ['goto', 'altar_olmeca', 'inicio']);
});

await test('Muerte y reinstalación conservan pistas y checkpoint; cofradia:down / purified recuerdan a los derrotados', async () => {
  const h = harness();
  const level = levels.campamento;
  const mk = () => level.enemies.map((e) => h.hood(e.x, e.y));
  const first = mk();
  const s1 = await h.ready('campamento', { enemies: first });
  await h.act('n03_pista', { pista: 'huellas' });
  const cp = h.state.checkpoint;
  h.emit('cofradia:down', { enemy: first[0] });
  h.emit('enemy:purified', { enemy: first[4], ecos: 1, perfect: false });
  h.emit('cofradia:down', { enemy: { kind: 'encapuchado' } }); // invocado/no mapeado: se ignora
  assert.equal(h.state.flags['n03:down:campamento:0'], true);
  assert.equal(h.state.flags['n03:down:campamento:4'], true);
  assert.equal(Object.keys(h.state.flags).filter((k) => k.startsWith('n03:down:')).length, 2);
  s1.shutdown();
  const all = mk();
  const second = [...all];
  const s2 = await h.ready('campamento', { enemies: second });
  assert.equal(h.state.checkpoint, cp);
  assert.equal(all[0].alive, false, 'El derrotado no reaparece');
  assert.equal(all[4].alive, false);
  assert.equal(all.filter((e) => e.alive).length, level.enemies.length - 2);
  assert.equal(s2.world.enemies.length, level.enemies.length - 2);
  assert.match(h.text, /PISTAS 1\/6/);
  assert.equal(h.emitted.filter((e) => e.name === 'checkpoint').length, 1, 'Solo el checkpoint de la primera entrada');
});

await test('Altar olmeca: compuertas de espíritus se abren por grupos al purificarlos', async () => {
  const h = harness();
  h.state.hasBalam = true;
  h.state.luna.unlocked = true;
  h.state.flags['n03:brujos_ok'] = true;
  const level = levels.altar_olmeca;
  const spirits = level.enemies.filter((e) => e.type === 'espiritu').map((e) => h.spirit(e.x, e.y));
  const s = await h.ready('altar_olmeca', { enemies: [...spirits] });
  s.tick();
  const locks = () => h.calls.filter(([k]) => k === 'lockArena').map(([, , x1]) => x1);
  assert.deepEqual(locks(), [config.espiritus.gates[0]]);
  assert.match(h.text, /ESPÍRITUS 0\/8/);
  spirits.slice(0, 3).forEach((sp) => { sp.alive = false; sp.purified = true; });
  s.world.enemies.splice(0, 3);
  s.tick();
  assert.deepEqual(locks(), [config.espiritus.gates[0], config.espiritus.gates[1]]);
  spirits.slice(3, 6).forEach((sp) => { sp.alive = false; sp.purified = true; });
  s.world.enemies.splice(0, 3);
  s.tick();
  spirits.slice(6).forEach((sp) => { sp.alive = false; sp.purified = true; });
  s.world.enemies.splice(0, 2);
  s.tick();
  assert.deepEqual(locks(), config.espiritus.gates.slice(0, 3));
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'));
});

await test('Jefe: la arena inicia una vez con lockArena + arena:start; boss:calmed lleva a María y a la salida', async () => {
  const h = harness();
  h.state.hasBalam = true;
  h.state.luna.unlocked = true;
  h.state.flags['n03:brujos_ok'] = true;
  h.state.learnedSpells.push('LUZ');
  const boss = { kind: 'cabeza_olmeca', x: 2230, y: 300, alive: true, purified: false, exhausted: false, destroy() {} };
  const s = await h.ready('altar_olmeca', { enemies: [] });
  assert.equal(await h.act('n03_salida'), false, 'La salida está cerrada antes de María');
  await h.trigger('n03_olmeca_arena');
  assert.ok(h.dialogues.includes('n03_cabeza_intro'));
  assert.deepEqual(h.calls.filter(([k]) => k === 'lockArena').at(-1), ['lockArena', 1800, 2400]);
  assert.ok(h.emitted.some((e) => e.name === 'arena:start' && e.payload.group === 'olmeca'));
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n03_jefe'));
  assert.equal(h.state.selectedSpell, 'LUZ');
  const arenaStarts = () => h.emitted.filter((e) => e.name === 'arena:start').length;
  await h.trigger('n03_olmeca_arena');
  assert.equal(arenaStarts(), 1, 'No reinicia la arena en curso');
  s.world.enemies.push(boss);
  s.tick();
  assert.equal(h.state.flags['n03:cabeza'], undefined);
  assert.equal(await h.act('altar'), false, 'Sin altar durante el combate');
  h.emit('boss:vulnerable', { on: true });
  h.emit('olmeca:phase', { phase: 2 });
  assert.ok(h.toasts.some((t) => /ojos/.test(t)));
  assert.ok(h.toasts.some((t) => /Fase 2/.test(t)));
  h.emit('boss:calmed', {});
  await flush();
  await flush();
  assert.equal(h.state.flags['n03:cabeza'], true);
  assert.ok(h.emitted.some((e) => e.name === 'arena:clear'));
  assert.ok(h.dialogues.includes('n03_cabeza_fin'));
  assert.deepEqual(h.dialogues.slice(-2), ['n03_maria_1', 'n03_maria_2']);
  assert.equal(h.state.flags['n03:maria'], true);
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  assert.equal(await h.act('n03_salida'), true);
  assert.ok(h.dialogues.includes('n03_salida'));
  // La salida continúa a Oaxaca (Nivel 4) en vez de volver al título.
  assert.ok(h.calls.some(([k]) => k === 'prepareOaxacaEntry'));
  assert.ok(h.calls.some(([k, key]) => k === 'goto' && key === 'oaxaca'));
  h.emit('boss:calmed', {});
  await flush();
  assert.equal(h.dialogues.filter((id) => id === 'n03_maria_1').length, 1, 'María no se repite');
});

await test('Respaldo del jefe: si la Cabeza no aparece, el nivel no se atasca', async () => {
  const h = harness();
  h.state.hasBalam = true;
  h.state.luna.unlocked = true;
  h.state.flags['n03:brujos_ok'] = true;
  const s = await h.ready('altar_olmeca', { enemies: [] });
  await h.trigger('n03_olmeca_arena');
  s.tick();
  assert.equal(h.state.flags['n03:cabeza'], undefined);
  s.clock.now = 6000;
  s.tick();
  await flush();
  assert.equal(h.state.flags['n03:cabeza'], true);
  assert.ok(h.dialogues.includes('n03_cabeza_fin'));
  assert.ok(h.dialogues.includes('n03_maria_1') && h.dialogues.includes('n03_maria_2'));
  assert.equal(h.state.flags['n03:maria'], true);
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'));
  await h.act('n03_salida');
  assert.ok(h.dialogues.includes('n03_salida'));
  // La salida continúa a Oaxaca (Nivel 4) en vez de volver al título.
  assert.ok(h.calls.some(([k]) => k === 'prepareOaxacaEntry'));
  assert.ok(h.calls.some(([k, key]) => k === 'goto' && key === 'oaxaca'));
  assert.equal(h.state.flags['n03:completo'], true);
});

await test('Si se muere tras vencer a la Cabeza, al reiniciar se retoma la escena de María', async () => {
  const h = harness();
  h.state.hasBalam = true;
  h.state.luna.unlocked = true;
  h.state.flags['n03:brujos_ok'] = true;
  h.state.flags['n03:cabeza'] = true;
  await h.ready('altar_olmeca', { enemies: [] });
  assert.ok(h.dialogues.includes('n03_maria_1'));
  assert.ok(!h.dialogues.includes('n03_cabeza_fin'), 'No repite el cierre del jefe');
  assert.equal(h.state.flags['n03:maria'], true);
});

await test('Entrada directa a campamento o altar prepara LUZ, SOL, escudo (y Balam en el altar) para pruebas', async () => {
  const h = harness();
  await h.ready('altar_olmeca', { enemies: [] });
  assert.ok(h.state.learnedSpells.includes('LUZ') && h.state.learnedSpells.includes('SOL'));
  assert.equal(h.state.shield.unlocked, true);
  assert.equal(h.state.hasBalam, true);
  assert.equal(h.state.luna.unlocked, true);
});

await test('Shutdown durante un diálogo no concede premios ni deja el mundo congelado', async () => {
  const h = harness();
  const s = await h.ready('campamento');
  h.hold('n03_pista_huellas');
  await h.act('n03_pista', { pista: 'huellas' });
  assert.equal(s.world.timeScale, 0);
  s.shutdown();
  await h.release();
  assert.equal(h.state.ecos, 0);
  assert.equal(h.state.flags['n03:pista:huellas'], undefined);
});

await test('Altar: cura, actualiza checkpoint y abre el menú del Altar', async () => {
  const h = harness();
  await h.ready('catemaco');
  await h.act('altar');
  assert.equal(h.state.hp, h.state.maxHp);
  assert.equal(h.state.checkpoint.x, levels.catemaco.spawns.altar.x);
  assert.ok(h.calls.some(([k, key]) => k === 'launch' && key === 'Altar'));
});

console.log(`\n${passed} pruebas del Nivel 3 correctas.`);
