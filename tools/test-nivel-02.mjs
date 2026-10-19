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
  const controls = loadTs('src/config/controls.ts');
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
  let spawnEnabled = true;
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
    '../config/controls': controls,
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
    world = { scene, level, player: { controlsLocked: false, x: level.spawn.x, y: level.spawn.y },
      enemies: [], timeScale: 1, flash() {},
      lockArena: (x0, x1) => calls.push(['lockArena', x0, x1]),
      unlockArena: () => calls.push(['unlockArena']),
    };
    bus.scoped(scene, 'arena:start', ({ group }) => {
      if (!spawnEnabled) return;
      for (const spec of level.enemies.filter((enemy) => enemy.group === group)) {
        world.enemies.push({ ...spec, kind: spec.type, alive: true, purified: false, exhausted: false });
      }
    });
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
    state, emitted, dialogues, rewards, install, act, keys: controls.keys,
    emit: async (name, payload) => { bus.emit(name, payload); await flush(); },
    allowSpawns: (enabled) => { spawnEnabled = enabled; },
    get world() { return world; },
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
  for (const id of config.verses) {
    const guardian = config.guardians.find((guard) => guard.verseId === id);
    if (guardian) await clearGuardian(h, guardian.id);
    await h.act('n02_estrofa', id);
  }
}

async function triggerGuardian(h, id) {
  const trigger = level.triggers.find((entry) => entry.action === 'n02_guardian' && entry.data?.guardianId === id);
  assert.ok(trigger, `Trigger del guardián ${id}`);
  await h.emit('trigger:enter', { trigger });
}

async function clearGuardian(h, id) {
  await triggerGuardian(h, id);
  const enemy = h.world.enemies.find((entry) => entry.encounterId === id && !entry.purified);
  assert.ok(enemy, `Guardián creado ${id}`);
  enemy.purified = true;
  await h.emit('boss:calmed', { encounterId: id, enemy });
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
  assert.ok(calls.some(([action, name]) => action === 'start' && name === 'Title'));
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

await test('Mapa ampliado coloca interacciones, checkpoints, catorce chaneques y dos guardianes en suelo transitable', async () => {
  const { WalkMap } = loadTs('src/world/WalkMap.ts', { '../config/movement': loadTs('src/config/movement.ts') });
  const extra = level.props.filter((prop) => prop.collide).map((prop) => ({
    shape: 'ellipse', x: prop.x, y: prop.y, ...prop.collide,
  }));
  const walk = new WalkMap(level, extra);
  for (const it of level.interactables) assert.equal(walk.isWalkable(it.x, it.y), true, `Interacción accesible: ${it.id}`);
  for (const [id, point] of Object.entries(level.spawns)) assert.equal(walk.isWalkable(point.x, point.y, 6), true, `Spawn seguro: ${id}`);
  assert.equal(level.width, 7200);
  assert.equal(level.enemies.filter((enemy) => enemy.type === 'chaneque').length, 14);
  const guardians = level.enemies.filter((enemy) => enemy.type === 'chaneque_mayor');
  assert.equal(guardians.length, 2);
  assert.equal(new Set(guardians.map((enemy) => enemy.encounterId)).size, 2);
  for (const guard of guardians) {
    assert.equal(guard.bossProfile, 'tuxtla_guardian');
    assert.equal(guard.group, `n02_guardian_${guard.encounterId}`);
  }
  for (const enemy of level.enemies) {
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

await test('ChanequeMayor real separa perfiles, eventos N1 y recompensas únicas de guardianes', async () => {
  const events = [];
  const guardian = json('src/data/guardian.json');
  const enemies = json('src/data/enemies.json');
  const { ChanequeMayor } = loadTs('src/entities/ChanequeMayor.ts', {
    phaser: {},
    '../core/bus': { bus: { emit: (name, payload) => events.push({ name, payload }) }, sfx() {} },
    '../config/game': { DEPTH_TOLERANCE: 10 },
    '../config/combat': loadTs('src/config/combat.ts'),
    '../data/enemies.json': enemies,
    '../data/guardian.json': guardian,
    '../scenes/HudScene': { hideBossBar() {}, showBossBar() {}, updateBossBar() {} },
    './EnemyBase': {
      EnemyBase: class {
        constructor(world, x, y, options) { Object.assign(this, { world, scene: world.scene, x, y, _alive: true, _ecos: options.ecos }); }
        play() {} render() {} setStars() {} setBaseTint() {}
      },
      FB: { mayor: 'fallback' }, purifyFx() {},
    },
  });
  function actor(profile, id) {
    const timers = [];
    const world = { scene: { time: { delayedCall: (ms, fn) => timers.push({ ms, fn }) }, tweens: { add() {} } } };
    const enemy = new ChanequeMayor(world, 100, 290, id ? `n02_guardian_${id}` : 'jefe', profile, id);
    // Los efectos gráficos no alteran la lógica de calm ni su identidad.
    enemy.clearProjectiles = () => {};
    enemy.pushHud = () => {};
    enemy.hideHud = () => {};
    enemy.leaveWorld = () => {};
    return { enemy, timers };
  }
  for (const id of ['monte', 'memoria']) {
    const { enemy, timers } = actor('tuxtla_guardian', id);
    assert.equal(enemy.cfg.hp, guardian.hp);
    assert.equal(enemy.cfg.calm.required, enemies.chaneque_mayor.calm.required);
    const before = events.filter((entry) => entry.name === 'ecos:gained').length;
    enemy.calm();
    enemy.calm();
    assert.equal(events.filter((entry) => entry.name === 'ecos:gained').length, before + 1);
    assert.equal(events.findLast((entry) => entry.name === 'ecos:gained').payload.amount, guardian.ecos);
    const calmed = events.findLast((entry) => entry.name === 'boss:calmed').payload;
    assert.equal(calmed.encounterId, id);
    assert.equal(calmed.enemy, enemy);
    assert.equal(enemy._purified, true);
    for (const timer of timers) timer.fn();
    assert.equal(events.filter((entry) => entry.name === 'ecos:gained').length, before + 1, 'El fade no repite premio');
  }
  const { enemy, timers } = actor(undefined, undefined);
  assert.equal(enemy.cfg.hp, enemies.chaneque_mayor.hp);
  const before = events.filter((entry) => entry.name === 'ecos:gained').length;
  enemy.calm();
  const payload = events.findLast((entry) => entry.name === 'boss:calmed').payload;
  assert.equal(Object.keys(payload).length, 0, 'El jefe N1 conserva evento sin encounterId');
  assert.equal(events.filter((entry) => entry.name === 'ecos:gained').length, before, 'N1 conserva premio diferido');
  for (const timer of timers) timer.fn();
  assert.equal(events.filter((entry) => entry.name === 'ecos:gained').length, before + 1);
});

await test('Estrofas 2 y 5 exigen sus guardianes aunque no haya enemigos cercanos', async () => {
  const h = harness();
  await ready(h);
  await h.act('n02_musicos');
  for (const guardian of config.guardians) {
    await h.act('n02_estrofa', guardian.verseId);
    assert.equal(h.state.flags[`n02:estrofa:${guardian.verseId}`], undefined);
    await h.emit('boss:calmed', { encounterId: guardian.id });
    assert.equal(h.state.flags[`n02:guardian:${guardian.id}`], undefined, 'Sin arena activa, un evento suelto no desbloquea');
  }
  assert.equal(h.state.ecos, 0);
});

await test('Guardianes independientes: checkpoint previo, identidad, arena propia y checkpoint posterior', async () => {
  const h = harness();
  const { calls, world } = await ready(h);
  const [first, second] = config.guardians;
  await triggerGuardian(h, first.id);
  assert.ok(calls.some(([type, x0, x1]) => type === 'lockArena' && x0 === first.x0 && x1 === first.x1));
  assert.equal(h.state.checkpoint.x, level.spawns[first.checkpointSpawn].x);
  const arenaIndex = h.emitted.findIndex((event) => event.name === 'arena:start');
  assert.equal(h.emitted[arenaIndex - 1].name, 'checkpoint', 'Checkpoint grabado antes de crear enemigos');
  assert.equal(world.enemies.filter((enemy) => enemy.encounterId === first.id).length, 1);
  assert.equal(world.enemies.filter((enemy) => enemy.encounterId === second.id).length, 0);
  await h.emit('boss:calmed', {});
  await h.emit('boss:calmed', { encounterId: second.id });
  await h.emit('boss:calmed', { encounterId: first.id, enemy: { kind: 'chaneque', encounterId: first.id } });
  assert.equal(h.state.flags[`n02:guardian:${first.id}`], undefined);
  const firstEnemy = world.enemies.find((enemy) => enemy.encounterId === first.id);
  firstEnemy.purified = true;
  await h.emit('boss:calmed', { encounterId: first.id, enemy: firstEnemy });
  assert.equal(h.state.flags[`n02:guardian:${first.id}`], true);
  assert.equal(h.state.flags[`n02:guardian:${second.id}`], undefined);
  assert.equal(h.state.checkpoint.x, level.spawns[first.clearedSpawn].x);
  assert.ok(calls.some(([type]) => type === 'unlockArena'));
  await clearGuardian(h, second.id);
  assert.equal(h.state.flags[`n02:guardian:${second.id}`], true);
  assert.equal(h.state.checkpoint.x, level.spawns[second.clearedSpawn].x);
  assert.equal(h.emitted.filter((event) => event.name === 'arena:clear').length, 2);
});

await test('Muerte antes del guardián permite reintento; purificado permanece sin duplicar encuentros', async () => {
  const h = harness();
  const guard = config.guardians[0];
  const first = await ready(h);
  await triggerGuardian(h, guard.id);
  first.shutdown();
  assert.equal(h.state.flags[`n02:guardian:${guard.id}`], undefined);
  const second = await ready(h);
  await clearGuardian(h, guard.id);
  const cp = h.state.checkpoint;
  const count = h.emitted.filter((event) => event.name === 'arena:start').length;
  await h.emit('boss:calmed', { encounterId: guard.id });
  second.shutdown();
  await ready(h);
  await triggerGuardian(h, guard.id);
  assert.equal(h.emitted.filter((event) => event.name === 'arena:start').length, count);
  assert.equal(h.state.checkpoint, cp);
  assert.equal(h.emitted.filter((event) => event.name === 'arena:clear').length, 1);
  assert.equal(h.state.flags[`n02:guardian:${guard.id}`], true);
  const other = config.guardians[1];
  await triggerGuardian(h, other.id);
  assert.equal(h.emitted.filter((event) => event.name === 'arena:start').length, count + 1);
  assert.equal(h.world.enemies.filter((enemy) => enemy.encounterId === guard.id).length, 0);
  assert.equal(h.world.enemies.filter((enemy) => enemy.encounterId === other.id).length, 1);
});

await test('Fallo de aparición desbloquea arena sin regalar victoria ni recuerdo', async () => {
  const h = harness();
  const { calls } = await ready(h);
  const guard = config.guardians[0];
  h.allowSpawns(false);
  await triggerGuardian(h, guard.id);
  await h.emit('boss:calmed', { encounterId: guard.id });
  assert.equal(h.state.flags[`n02:guardian:${guard.id}`], undefined);
  assert.ok(calls.some(([name]) => name === 'unlockArena'));
  assert.equal(h.state.ecos, 0);
  h.allowSpawns(true);
  await clearGuardian(h, guard.id);
  assert.equal(h.state.flags[`n02:guardian:${guard.id}`], true);
});

await test('Combat real calma solo invocados del encuentro/grupo; N1 conserva calma global de comunes', async () => {
  const handlers = new Map();
  const state = { laserOverheated: false, laserHeat: 0 };
  const { installCombat } = loadTs('src/systems/Combat.ts', {
    phaser: {},
    '../core/bus': { bus: { scoped: (_scene, name, fn) => handlers.set(name, fn), emit() {} }, sfx() {} },
    '../core/GameState': { GameState: state },
    '../config/controls': { keys: { justPressed: () => false } },
    '../config/combat': loadTs('src/config/combat.ts'),
    '../entities/EnemyBase': { ensureCombatTextures() {}, playerShield: {}, FB: {} },
    '../entities/LaserShot': { LaserShot: class {}, laserTargets: new Set() },
    './Progression': { installProgression() {} },
    '../scenes/HudScene': { hideBossBar() {}, showPrompt() {} },
  });
  function enemy(kind, encounterId, group, extra = {}) {
    const hits = [], spells = [];
    return { kind, encounterId, group, alive: true, purified: false, exhausted: false, x: 7000, y: 300,
      hits, spells, takeHit: (hit) => { hits.push(hit); }, applySpell: (spell) => { spells.push(spell); }, ...extra };
  }
  const summoned = enemy('chaneque', 'monte', 'n02_guardian_monte');
  const exhausted = enemy('chaneque', 'monte', 'n02_guardian_monte', { exhausted: true });
  const common = enemy('chaneque');
  const otherChild = enemy('chaneque', 'memoria', 'n02_guardian_memoria');
  const wrongGroup = enemy('chaneque', 'monte', 'otro_grupo');
  const wrongId = enemy('chaneque', 'memoria', 'n02_guardian_monte');
  const otherGuardian = enemy('chaneque_mayor', 'memoria', 'n02_guardian_memoria');
  const dead = enemy('chaneque', 'monte', 'n02_guardian_monte', { alive: false });
  const purified = enemy('chaneque', 'monte', 'n02_guardian_monte', { purified: true });
  const enemies = [summoned, exhausted, common, otherChild, wrongGroup, wrongId, otherGuardian, dead, purified];
  const world = { scene: { events: new EventEmitter() }, enemies };
  installCombat(world);
  const calmed = handlers.get('boss:calmed');
  assert.equal(typeof calmed, 'function');
  calmed({ encounterId: 'monte', enemy: { group: 'n02_guardian_monte' } });
  assert.equal(summoned.hits.length, 1);
  assert.equal(summoned.spells.length, 1);
  assert.equal(summoned.spells[0].spellId, 'CALMA');
  assert.equal(exhausted.hits.length, 0);
  assert.equal(exhausted.spells.length, 1);
  for (const e of [common, otherChild, wrongGroup, wrongId, otherGuardian, dead, purified]) {
    assert.equal(e.hits.length + e.spells.length, 0, `Preserva enemigo ajeno: ${e.kind} ${e.encounterId ?? 'común'}`);
  }
  calmed({ encounterId: 'monte' });
  assert.equal(summoned.spells.length, 1, 'Sin entidad/grupo no afecta invocados');
  for (const e of enemies) { e.hits.length = 0; e.spells.length = 0; }
  calmed({});
  for (const e of [summoned, exhausted, common, otherChild, wrongGroup, wrongId]) {
    assert.equal(e.spells.length, 1, 'Evento N1 mantiene purificación de todos los comunes vivos');
  }
  for (const e of [otherGuardian, dead, purified]) assert.equal(e.spells.length, 0);
});

await test('Interact real evita reapertura con E posterior al cierre y permite nueva pulsación tras enfriamiento', async () => {
  const controls = loadTs('src/config/controls.ts');
  const emitter = new EventEmitter();
  const interactions = [];
  const bus = {
    scoped: (scene, name, fn) => {
      emitter.on(name, fn);
      scene.events.once('shutdown', () => emitter.off(name, fn));
    },
    emit: (name, payload) => {
      if (name === 'interact') interactions.push(payload);
      emitter.emit(name, payload);
    },
  };
  const { installInteract } = loadTs('src/systems/Interact.ts', {
    phaser: { Scenes: { Events: { UPDATE: 'update', SHUTDOWN: 'shutdown' } } },
    '../core/bus': { bus, sfx() {} },
    '../core/GameState': { GameState: { flags: {}, casting: false } },
    '../config/controls': controls,
    '../config/game': { DEPTH: { foreground: 5000 } },
    '../scenes/HudScene': { showPrompt() {} },
  });
  // Solo se omiten dibujos; entrada, búsqueda por radio, reloj y suscripciones son los reales.
  const drawable = () => ({
    width: 40, setDepth() { return this; }, setVisible() { return this; }, add() { return this; },
    clear() { return this; }, fillStyle() { return this; }, fillRect() { return this; },
    lineStyle() { return this; }, strokeRect() { return this; }, setPosition() { return this; },
    setText() { return this; },
  });
  const scene = { events: new EventEmitter(), time: { now: 1000 },
    add: { container: drawable, graphics: drawable, text: drawable }, tweens: { add() {} } };
  const item = { id: 'musicos', action: 'n02_musicos', prompt: 'Hablar', x: 100, y: 290 };
  installInteract({ scene, level: { id: 'tuxtla', interactables: [item] },
    player: { x: 100, y: 290, controlsLocked: false, playOneShot() {} } });
  bus.emit('dialogue:end', { id: 'n02_musicos' });
  // El keydown llega DESPUÉS de dialogue:end: clear() anterior no habría podido consumirlo.
  controls.keys.handleDown('KeyE');
  scene.events.emit('update');
  assert.equal(interactions.length, 0, 'La E del cierre no reabre en el mismo cuadro');
  assert.equal(controls.keys.justPressed('interact'), true, 'La protección funciona con E todavía pendiente');
  controls.keys.endFrame();
  controls.keys.handleUp('KeyE');
  scene.time.now = 1350;
  controls.keys.handleDown('KeyE');
  scene.events.emit('update');
  assert.equal(interactions.length, 0, 'Se respeta el límite de 350 ms');
  controls.keys.endFrame();
  controls.keys.handleUp('KeyE');
  scene.time.now = 1351;
  controls.keys.handleDown('KeyE');
  scene.events.emit('update');
  assert.equal(interactions.length, 1, 'Nueva pulsación tras enfriamiento funciona');
  assert.equal(interactions[0].id, item.id);
});

console.log(`\n${passed} pruebas de misión Nivel 2 correctas.`);
