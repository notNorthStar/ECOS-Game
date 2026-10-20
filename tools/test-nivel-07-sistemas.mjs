// Prueba de los SISTEMAS del Nivel 7 (CDMX parte 2): MindControl (controles invertidos), la Llorona aliada
// y los conjuros de historia CONSUELO y PAZ. Usa el TypeScript real con una escena falsa; no sustituye la
// prueba en navegador (distorsión visible, sonido, cámara).
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function loadTs(path, dependencies = {}) {
  const source = ts.transpileModule(read(path), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${source}\n})`, { console, setTimeout }, { filename: path })(
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
    get: (_t, key) => (key === 'then' ? undefined : key === 'alpha' ? 1 : key === 'x' || key === 'y' ? 0 : proxy),
    set: () => true,
    apply: () => proxy,
  });
  return proxy;
}

const PhaserFake = {
  BlendModes: { ADD: 1, MULTIPLY: 2 },
  Scenes: { Events: { UPDATE: 'update', SHUTDOWN: 'shutdown' } },
  Math: {
    Clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    FloatBetween: (a, b) => (a + b) / 2,
    Between: () => 0,
    Vector2: class { constructor(x, y) { this.x = x; this.y = y; } },
  },
};

function harness() {
  const emitter = new EventEmitter();
  const emitted = [];
  const bus = {
    emit(name, payload) { emitted.push({ name, payload }); emitter.emit(name, payload); },
    on(name, fn) { emitter.on(name, fn); },
    scoped(scene, name, fn) { emitter.on(name, fn); scene.events.once('shutdown', () => emitter.off(name, fn)); },
  };
  const sfxNames = [];
  const GameState = {
    controlsInverted: false, hasMaria: true,
    settings: { noInvert: false, reduceFx: false, textScale: 1 },
  };
  const events = new EventEmitter();
  const scene = {
    events: { on: (k, f) => events.on(k, f), once: (k, f) => events.once(k, f), off: (k, f) => events.off(k, f), emit: (k, ...a) => events.emit(k, ...a) },
    add: new Proxy({}, { get: () => () => fake() }),
    make: { graphics: () => fake() },
    textures: { exists: () => true },
    // Los tweens terminan al instante (onComplete síncrono).
    tweens: { add: (cfg) => { cfg.onComplete?.(); return fake(); }, killTweensOf: () => {} },
    time: { addEvent: () => fake(), delayedCall: () => fake() },
    scale: { width: 640, height: 360 },
  };
  const player = { x: 100, y: 200, z: 0, facing: 1, team: 'player', alive: true, hits: 0, takeHit() { this.hits++; return true; } };
  const enemies = [];
  const world = {
    scene, player, enemies, timeScale: 1, level: { width: 1800 },
    shake() {}, flash() {},
    randomPointNear: (x, y) => ({ x, y }),
  };
  const deps = {
    phaser: PhaserFake,
    '../core/bus': { bus, sfx: (n) => sfxNames.push(n) },
    '../core/GameState': { GameState },
    '../config/game': { DEPTH: { shadow: -100, foreground: 5000, fx: 6000, ui: 9000 } },
    './CharacterKits': { kitAnimatorFor: () => null },
  };
  const tick = (ms) => events.emit('update', 0, ms);
  const shutdown = () => events.emit('shutdown');
  return { bus, emitted, sfxNames, GameState, scene, world, player, enemies, deps, tick, shutdown };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}

/* ============================== MindControl ============================== */

await test('controls:invert activa controlsInverted y se apaga solo al vencer', () => {
  const h = harness();
  const { installMindControl, isMindControlled } = loadTs('src/systems/MindControl.ts', h.deps);
  installMindControl(h.world);
  h.bus.emit('controls:invert', { on: true, ms: 1000 });
  assert.equal(h.GameState.controlsInverted, true);
  assert.equal(isMindControlled(), true);
  for (let i = 0; i < 15; i++) h.tick(50); // 0.75 s
  assert.equal(h.GameState.controlsInverted, true);
  for (let i = 0; i < 10; i++) h.tick(50); // +0.5 s
  assert.equal(h.GameState.controlsInverted, false);
  assert.equal(isMindControlled(), false);
});

await test('controls:invert {on:false} lo apaga al momento', () => {
  const h = harness();
  const { installMindControl } = loadTs('src/systems/MindControl.ts', h.deps);
  installMindControl(h.world);
  h.bus.emit('controls:invert', { on: true, ms: 4000 });
  h.bus.emit('controls:invert', { on: false, ms: 0 });
  assert.equal(h.GameState.controlsInverted, false);
});

await test('settings.noInvert: solo el aviso visual, nunca invierte', () => {
  const h = harness();
  h.GameState.settings.noInvert = true;
  const { installMindControl, isMindControlled } = loadTs('src/systems/MindControl.ts', h.deps);
  installMindControl(h.world);
  h.bus.emit('controls:invert', { on: true, ms: 3000 });
  h.tick(50);
  assert.equal(h.GameState.controlsInverted, false);
  assert.equal(isMindControlled(), true);
});

await test('Nunca queda pegado: se limpia al morir, en shutdown y al instalarse', () => {
  const h = harness();
  const { installMindControl } = loadTs('src/systems/MindControl.ts', h.deps);
  installMindControl(h.world);
  h.bus.emit('controls:invert', { on: true, ms: 4000 });
  h.bus.emit('player:died', {});
  assert.equal(h.GameState.controlsInverted, false);
  h.bus.emit('controls:invert', { on: true, ms: 4000 });
  h.shutdown();
  assert.equal(h.GameState.controlsInverted, false);
  // Tras el shutdown ya no escucha.
  h.bus.emit('controls:invert', { on: true, ms: 4000 });
  assert.equal(h.GameState.controlsInverted, false);
  // Instalar con el estado sucio lo limpia.
  h.GameState.controlsInverted = true;
  installMindControl(h.world);
  assert.equal(h.GameState.controlsInverted, false);
});

await test('Player invierte solo el movimiento cuando controlsInverted', () => {
  const src = read('src/entities/Player.ts');
  assert.match(src, /GameState\.controlsInverted \? -1 : 1/);
});

/* ============================== Llorona ============================== */

function rey(h, x = 400, y = 200) {
  const e = {
    kind: 'rey_olvido', x, y, z: 0, radius: 20, alive: true, purified: false, exhausted: false, hits: [],
    takeHit(hit) { this.hits.push(hit); return true; },
  };
  h.enemies.push(e);
  return e;
}

await test('La Llorona grita cada pocos segundos: emite llorona:scream y aturde/daña al Rey, nunca al jugador', () => {
  const h = harness();
  const L = loadTs('src/systems/Llorona.ts', h.deps);
  L.installLlorona(h.world);
  const r = rey(h);
  h.player.x = 380; h.player.y = 200; // jugador DENTRO del radio del grito
  L.summonLlorona(h.world, 380, 190);
  assert.equal(L.isLloronaPresent(), true);
  for (let i = 0; i < 20 * 12; i++) h.tick(50); // 12 s
  const screams = h.emitted.filter((e) => e.name === 'llorona:scream');
  assert.ok(screams.length >= 2, `gritos: ${screams.length}`);
  assert.ok(r.hits.length >= 2);
  assert.ok(r.hits.every((hit) => hit.stun > 0 && hit.damage > 0 && hit.damage < 20), 'daño moderado + aturdimiento');
  assert.equal(h.player.hits, 0);
});

await test('Fuera de control (setLloronaWild): grita sin objetivo, sin dañar ni emitir llorona:scream', () => {
  const h = harness();
  const L = loadTs('src/systems/Llorona.ts', h.deps);
  L.installLlorona(h.world);
  const r = rey(h);
  L.summonLlorona(h.world, 400, 190);
  L.setLloronaWild(true);
  for (let i = 0; i < 20 * 8; i++) h.tick(50);
  assert.equal(h.emitted.filter((e) => e.name === 'llorona:scream').length, 0);
  assert.equal(r.hits.length, 0);
  assert.ok(h.sfxNames.filter((n) => n === 'llorona_grito').length >= 2);
});

await test('dismissLlorona resuelve tras la despedida y la saca de escena; shutdown no deja promesas colgadas', async () => {
  const h = harness();
  const L = loadTs('src/systems/Llorona.ts', h.deps);
  L.installLlorona(h.world);
  await L.dismissLlorona(); // sin Llorona: resuelve enseguida
  L.summonLlorona(h.world, 300, 200);
  await L.dismissLlorona();
  assert.equal(L.isLloronaPresent(), false);
  assert.equal(L.getLloronaPosition(), null);
  h.shutdown();
  await L.dismissLlorona();
});

/* ============================== Conjuros de historia ============================== */

await test('CONSUELO (8) y PAZ (3) en spells.json: tipo historia, letras LSM válidas y effect', () => {
  const data = JSON.parse(read('src/data/spells.json'));
  const allowed = new Set('ABCDEFGHILMNOPRSTUVWYZ');
  for (const [id, len] of [['CONSUELO', 8], ['PAZ', 3]]) {
    const s = data.spells.find((x) => x.id === id);
    assert.ok(s, `falta ${id}`);
    assert.equal(s.type, 'historia');
    assert.equal(s.name.length, len);
    for (const c of s.name) assert.ok(allowed.has(c), `${id}: letra ${c} no permitida`);
    assert.ok(Object.keys(s.effect).length > 0);
    assert.ok(data.effectDoc[id], `falta effectDoc de ${id}`);
  }
});

await test('Casting: castSpellNow exportado y los conjuros de historia fuera de la rueda', () => {
  const src = read('src/systems/Casting.ts');
  assert.match(src, /export function castSpellNow\(world: WorldApi, spellId: string\): Promise<SpellOutcomeEvent>/);
  assert.match(src, /filter\(\(id\) => !isStorySpell\(id\)\)/);
});

console.log(`\n${passed} pruebas de sistemas del Nivel 7 correctas.`);
