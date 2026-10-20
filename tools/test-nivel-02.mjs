// Ejecuta el director TypeScript real con adaptadores de escenas y entrada controlables.
// No sustituye las pruebas de controles, cámara, audio audible o render en navegador.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const config = json('src/data/tuxtla.json');
const level = json('src/data/levels/tuxtla.json');
const code = ts.transpileModule(readFileSync(new URL('src/systems/TuxtlaDirector.ts', root), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

function loadTs(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
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

function harness() {
  const state = { flags: {}, learnedSpells: [], hp: 1, maxHp: 5, ecos: 0, totalEcosEarned: 0, checkpoint: null };
  const emitter = new EventEmitter();
  const emitted = [];
  const dialogues = [];
  const rewards = [];
  let waitingDialogue = null;
  let pending = null;
  let world;
  let options;
  let currentText = '';
  let campaignCalls = null;
  const bus = {
    emit(name, payload) { emitted.push({ name, payload }); emitter.emit(name, payload); },
    scoped(scene, name, callback) {
      emitter.on(name, callback);
      scene.events.once('shutdown', () => emitter.off(name, callback));
    },
  };
  const mods = {
    phaser: { Scenes: { Events: { SHUTDOWN: 'shutdown' } } },
    '../core/bus': { bus, sfx: (name) => bus.emit('sfx', { name }) },
    '../core/GameState': { GameState: state },
    '../config/game': { DEPTH: { ui: 9000 } },
    '../scenes/DialogueScene': { playDialogue: async (_scene, id) => {
      dialogues.push(id);
      if (id === waitingDialogue) await new Promise((resolve) => { pending = resolve; });
    } },
    './Casting': { startLearning: async (world, id) => {
      // Casting real restaura el tiempo al acabar; el director debe congelar de nuevo el diálogo final.
      world.timeScale = 1;
      world.player.controlsLocked = false;
      state.learnedSpells.push(id);
    } },
    './Interact': {
      installInteract: (_world, opts) => { options = opts; },
      markUsed: (w, id) => { state.flags[`usado:${w.level.id}:${id}`] = true; },
    },
    './LightTrail': { installLightTrail() {}, setObjective() {} },
    './Progression': { addEcos: (n) => { rewards.push(n); state.ecos += n; state.totalEcosEarned += n; } },
    '../data/tuxtla.json': config,
    './Campaign': { prepareCatemacoEntry: () => campaignCalls?.push(['prepareCatemacoEntry']) },
  };
  const module = { exports: {} };
  const execute = vm.runInNewContext(`(function(require,module,exports) { ${code}\n})`, {}, {
    filename: fileURLToPath(new URL('src/systems/TuxtlaDirector.ts', root)),
  });
  execute((name) => {
    assert.ok(name in mods, `Dependencia inesperada: ${name}`);
    return mods[name];
  }, module, module.exports);

  function install() {
    const timers = [];
    const text = { setScrollFactor() { return this; }, setDepth() { return this; }, setText(t) { currentText = t; return this; } };
    const calls = [];
    const scene = {
      events: new EventEmitter(), add: { text: () => text },
      time: { delayedCall: (_ms, callback) => timers.push(callback) },
      scene: {
        launch: (...args) => calls.push(['launch', ...args]),
        bringToTop() {}, pause() { calls.push(['pause']); },
        isActive: () => true, isPaused: () => false, stop() {},
        start: (key) => calls.push(['start', key]),
      },
    };
    world = { scene, level, player: { controlsLocked: false }, enemies: [], timeScale: 1, flash() {}, gotoSection: (...args) => calls.push(['goto', ...args]) };
    campaignCalls = calls;
    module.exports.installTuxtlaDirector(world);
    return { world, calls, timers, shutdown: () => scene.events.emit('shutdown') };
  }
  async function act(action, verseId) {
    const it = level.interactables.find((it) => it.action === action && (!verseId || it.data?.verseId === verseId));
    assert.ok(it, `No existe interacción ${action} ${verseId ?? ''}`);
    bus.emit('interact', { id: it.id, action: it.action, data: it.data });
    await flush();
  }
  return {
    state, emitted, dialogues, rewards, install, act,
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
async function ready(h) {
  const session = h.install();
  session.timers.forEach((fn) => fn());
  await flush();
  return session;
}
async function collectAll(h) {
  await h.act('n02_musicos');
  for (const id of config.verses) await h.act('n02_estrofa', id);
}

await test('No permite recoger antes de intro o antes de hablar con músicos', async () => {
  const h = harness();
  const session = h.install();
  await h.act('n02_estrofa', 'rio');
  assert.equal(h.state.ecos, 0);
  session.timers.forEach((fn) => fn());
  await flush();
  await h.act('n02_estrofa', 'rio');
  assert.equal(h.state.flags['n02:estrofa:rio'], undefined);
  assert.equal(h.state.ecos, 0);
  assert.equal(session.world.player.controlsLocked, false);
});

await test('Guardián vivo o agotado bloquea; purificado permite recuperar', async () => {
  const h = harness();
  const { world } = await ready(h);
  await h.act('n02_musicos');
  const point = level.interactables.find((it) => it.data?.verseId === 'rio');
  world.enemies.push({ x: point.x + 1, y: point.y, alive: true, exhausted: true, purified: false });
  await h.act('n02_estrofa', 'rio');
  assert.equal(h.state.ecos, 0);
  world.enemies[0].purified = true;
  await h.act('n02_estrofa', 'rio');
  assert.equal(h.state.ecos, config.rewards.verse);
  assert.equal(world.timeScale, 1);
});

await test('Fandango incompleto no enseña VOZ ni concede fragmento', async () => {
  const h = harness();
  await ready(h);
  await h.act('n02_fandango');
  assert.ok(h.dialogues.includes('n02_incompleto'));
  assert.equal(h.state.learnedSpells.length, 0);
  assert.equal(h.state.flags['n02:fragmento'], undefined);
});

await test('Cinco estrofas restauran música una a una, sin duplicar premios', async () => {
  const h = harness();
  await ready(h);
  await collectAll(h);
  for (const id of config.verses) await h.act('n02_estrofa', id);
  assert.equal(h.state.ecos, config.verses.length * config.rewards.verse);
  assert.deepEqual(h.emitted.filter((e) => e.name === 'fandango:progress').map((e) => e.payload.recovered), [0, 1, 2, 3, 4, 5]);
  assert.match(h.text, /5\/5/);
});

await test('Fandango enseña VOZ, concede primer fragmento una vez y permite título', async () => {
  const h = harness();
  const { calls } = await ready(h);
  await collectAll(h);
  await h.act('n02_fandango');
  const expected = config.verses.length * config.rewards.verse + config.rewards.voice + config.rewards.fragment;
  assert.equal(h.state.ecos, expected);
  assert.deepEqual(h.state.learnedSpells, ['VOZ']);
  assert.equal(h.state.flags['n02:fragmento'], true);
  assert.equal(h.state.flags['n02:completo'], true);
  await h.act('n02_fandango');
  assert.equal(h.state.ecos, expected);
  await h.act('n02_salida');
  // Continuidad entre niveles: la salida lleva a Catemaco (Nivel 3), ya no al título.
  assert.ok(calls.some(([action]) => action === 'prepareCatemacoEntry'));
  assert.ok(calls.some(([action, name]) => action === 'goto' && name === 'catemaco'));
});

await test('Muerte/reinstalación conserva checkpoint, contador, estrofas y premios', async () => {
  const h = harness();
  const first = await ready(h);
  await h.act('n02_musicos');
  await h.act('n02_estrofa', 'rio');
  const cp = h.state.checkpoint;
  first.shutdown();
  await ready(h);
  assert.equal(h.state.checkpoint, cp);
  assert.match(h.text, /1\/5/);
  await h.act('n02_estrofa', 'rio');
  assert.equal(h.state.ecos, config.rewards.verse);
  assert.equal(h.emitted.filter((e) => e.name === 'checkpoint').length, 1);
});

await test('Recolecciones concurrentes y shutdown durante diálogo no otorgan progreso', async () => {
  const h = harness();
  const session = await ready(h);
  await h.act('n02_musicos');
  h.hold('n02_estrofa_rio');
  await h.act('n02_estrofa', 'rio');
  assert.equal(session.world.timeScale, 0);
  await h.act('n02_estrofa', 'monte');
  assert.ok(!h.dialogues.includes('n02_estrofa_monte'));
  session.shutdown();
  await h.release();
  assert.equal(h.state.ecos, 0);
  assert.equal(h.state.flags['n02:estrofa:rio'], undefined);
});

await test('Salida incompleta permanece en nivel; altar cura y actualiza checkpoint', async () => {
  const h = harness();
  const { calls } = await ready(h);
  await h.act('n02_salida');
  assert.ok(!calls.some(([action]) => action === 'start'));
  await h.act('altar');
  assert.equal(h.state.hp, h.state.maxHp);
  assert.equal(h.state.checkpoint.x, level.spawns.altar.x);
  assert.ok(calls.some(([action, key]) => action === 'launch' && key === 'Altar'));
});

await test('Después del aprendizaje vuelve a congelar mundo y controles durante diálogo final', async () => {
  const h = harness();
  const { world } = await ready(h);
  await collectAll(h);
  h.hold('n02_final');
  await h.act('n02_fandango');
  assert.equal(world.timeScale, 0);
  assert.equal(world.player.controlsLocked, true);
  assert.equal(h.state.flags['n02:fragmento'], undefined);
  await h.release();
  assert.equal(world.timeScale, 1);
  assert.equal(world.player.controlsLocked, false);
  assert.equal(h.state.flags['n02:fragmento'], true);
});

await test('VOZ se valida con checkWord real y conserva efecto de aturdimiento configurable', async () => {
  const { checkWord } = loadTs('src/lsm/core/letters.ts', { '../data/letters.json': json('src/lsm/data/letters.json') });
  const voice = json('src/data/spells.json').spells.find((spell) => spell.id === 'VOZ');
  assert.ok(voice, 'Existe la definición de VOZ');
  assert.equal(checkWord(voice.name).ok, true);
  assert.equal(checkWord(voice.name).letters.join(''), 'VOZ');
  assert.ok(voice.effect.stun > 0 && voice.effect.stunRadius > 0);
});

await test('Los diálogos de misión, recuerdos y referencias de objetos existen y tienen texto', async () => {
  const dialogue = json('src/data/dialogue/n02.json');
  const ids = ['intro', 'musicos', 'incompleto', 'fandango', 'final', 'salida'].map((id) => `n02_${id}`);
  ids.push(...config.verses.map((id) => `n02_estrofa_${id}`));
  ids.push(...level.interactables.flatMap((it) => typeof it.data?.dialogue === 'string' ? [it.data.dialogue] : []));
  for (const id of ids) {
    assert.ok(Array.isArray(dialogue[id]) && dialogue[id].length > 0, `Diálogo existente: ${id}`);
    for (const line of dialogue[id]) {
      assert.ok(line.text.trim().length > 0, `Texto no vacío en ${id}`);
      assert.ok(dialogue._hablantes[line.who], `Hablante conocido en ${id}: ${line.who}`);
    }
  }
});

await test('Mapa coloca interacciones, checkpoints y diez chaneques sin jefe en suelo transitable', async () => {
  const { WalkMap } = loadTs('src/world/WalkMap.ts', { '../config/movement': loadTs('src/config/movement.ts') });
  const extra = level.props.filter((prop) => prop.collide).map((prop) => ({
    shape: 'ellipse', x: prop.x, y: prop.y, ...prop.collide,
  }));
  const walk = new WalkMap(level, extra);
  for (const it of level.interactables) assert.equal(walk.isWalkable(it.x, it.y), true, `Interacción accesible: ${it.id}`);
  for (const [id, point] of Object.entries(level.spawns)) assert.equal(walk.isWalkable(point.x, point.y, 6), true, `Spawn seguro: ${id}`);
  assert.equal(level.enemies.length, 10);
  for (const enemy of level.enemies) {
    assert.equal(enemy.type, 'chaneque', 'Nivel sin jefe');
    assert.equal(walk.isWalkable(enemy.x, enemy.y, 6), true, 'Enemigo en suelo transitable');
  }
});

await test('Chaneque.applySpell real: VOZ aturde sin daño; fuera de radio o fallado no conecta', async () => {
  const combat = loadTs('src/config/combat.ts');
  const voice = json('src/data/spells.json').spells.find((spell) => spell.id === 'VOZ');
  const { Chaneque } = loadTs('src/entities/Chaneque.ts', {
    phaser: { Math: { Clamp: (n, min, max) => Math.max(min, Math.min(max, n)) } },
    '../core/bus': { bus: {}, sfx() {} },
    '../config/game': { DEPTH_TOLERANCE: 10 },
    '../config/combat': combat,
    '../data/enemies.json': json('src/data/enemies.json'),
    '../data/progression.json': json('src/data/progression.json'),
    './EnemyBase': {
      EnemyBase: class {}, FB: {},
      planeDist: (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 1.5),
      powerScale: (power) => 0.75 + 0.25 * Math.max(0, Math.min(1, power)),
      spellParam: (id, key, fallback) => id === 'VOZ' ? (voice.effect[key] ?? fallback) : fallback,
    },
  });
  // Evita render/constructor: se prueba el método real sobre un enemigo con estado explícito.
  const target = Object.create(Chaneque.prototype);
  const hits = [];
  Object.assign(target, { _alive: true, _exhausted: false, st: 'chase', x: 40, y: 0,
    takeHit: (hit) => { hits.push(hit); return true; } });
  const cast = { spellId: 'VOZ', outcome: 'perfect', power: 1, x: 0, y: 0, facing: 1, auto: false };
  assert.equal(target.applySpell(cast), true);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].damage, 0);
  assert.ok(hits[0].stun > 0);
  assert.equal(target.applySpell({ ...cast, outcome: 'fail' }), false);
  target.x = voice.effect.stunRadius + 1;
  assert.equal(target.applySpell(cast), false);
  target.x = 0;
  target._exhausted = true;
  assert.equal(target.applySpell(cast), false);
  assert.equal(hits.length, 1);
});

await test('Entrada de campaña conserva Ecos, mejoras y maestría; prepara láser, conjuros y checkpoint', async () => {
  const state = {
    section: 'jefe', ecos: 348, totalEcosEarned: 500,
    upgrades: { vida: 2, dano: 1, velocidad: 1 },
    learnedSpells: ['CALMA'], mastery: { CALMA: { level: 3, progress: 6 } },
    hp: 1, maxHp: 7, checkpoint: { section: 'jefe', x: 10, y: 290 },
    casting: true, hasLaser: false, flags: {},
  };
  const upgrades = state.upgrades;
  const mastery = state.mastery.CALMA;
  const { prepareTuxtlaEntry } = loadTs('src/systems/Campaign.ts', { '../core/GameState': { GameState: state } });
  prepareTuxtlaEntry();
  assert.equal(state.ecos, 348);
  assert.equal(state.totalEcosEarned, 500);
  assert.equal(state.upgrades, upgrades);
  assert.equal(state.mastery.CALMA, mastery);
  assert.equal(state.mastery.CALMA.level, 3);
  assert.equal(state.mastery.PROTECCION.level, 0);
  assert.deepEqual(state.learnedSpells, ['CALMA', 'PROTECCION']);
  assert.equal(state.section, 'tuxtla');
  assert.equal(state.selectedSpell, 'CALMA');
  assert.equal(state.hp, state.maxHp);
  assert.equal(state.checkpoint, null);
  assert.equal(state.casting, false);
  assert.equal(state.hasLaser, true);
  assert.equal(state.flags.codice, true);
  prepareTuxtlaEntry();
  assert.equal(state.learnedSpells.length, 2, 'Entrar dos veces no duplica conjuros');
});

console.log(`\n${passed} pruebas de misión Nivel 2 correctas.`);
