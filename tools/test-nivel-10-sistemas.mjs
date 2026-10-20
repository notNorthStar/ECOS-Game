// Prueba de los SISTEMAS del Nivel 10 (Guadalajara): Balam jaguar luminoso (aliado), la madre en el altar,
// los conjuros ECOS y MAMA, el jugador atado y el epílogo. Usa el TypeScript real con una escena falsa; no
// sustituye la prueba en navegador (arte, sonido, cámara).
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

const SPELLS = JSON.parse(read('src/data/spells.json'));

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
    hasBalam: true, balamJaguar: false, bound: false, casting: false,
    settings: { reduceFx: false, textScale: 1 },
  };
  const events = new EventEmitter();
  const scene = {
    events: { on: (k, f) => events.on(k, f), once: (k, f) => events.once(k, f), off: (k, f) => events.off(k, f), emit: (k, ...a) => events.emit(k, ...a) },
    add: new Proxy({}, { get: () => () => fake() }),
    make: { graphics: () => fake() },
    textures: { exists: () => true },
    // Los tweens y las llamadas diferidas terminan al instante (síncronos).
    tweens: { add: (cfg) => { cfg.onComplete?.(); return fake(); }, killTweensOf: () => {} },
    time: { addEvent: () => fake(), delayedCall: (_ms, fn) => { fn?.(); return fake(); } },
    scale: { width: 640, height: 360 },
  };
  const player = {
    x: 100, y: 200, z: 0, facing: 1, team: 'player', alive: true, controlsLocked: false, hits: 0,
    takeHit() { this.hits++; return true; },
  };
  const enemies = [];
  const world = {
    scene, player, enemies, timeScale: 1, level: { width: 1800 },
    shake() {}, flash() {}, hitstop() {},
    isWalkable: () => true,
    moveActor: (a, dx, dy) => { a.x += dx; a.y += dy; },
    randomPointNear: (x, y) => ({ x, y }),
  };
  const getSpellDef = (id) => SPELLS.spells.find((s) => s.id === id);
  const deps = {
    phaser: PhaserFake,
    '../core/bus': { bus, sfx: (n) => sfxNames.push(n) },
    '../core/GameState': { GameState },
    '../config/game': { DEPTH: { shadow: -100, foreground: 5000, fx: 6000, ui: 9000 } },
    './CharacterKits': { kitAnimatorFor: () => null },
    './Mastery': { getSpellDef },
  };
  const tick = (ms) => events.emit('update', 0, ms);
  const shutdown = () => events.emit('shutdown');
  return { bus, emitted, sfxNames, GameState, scene, world, player, enemies, deps, tick, shutdown };
}

function enemy(h, kind, x, y, extra = {}) {
  const e = {
    kind, x, y, z: 0, radius: 16, alive: true, purified: false, exhausted: false, hits: [],
    takeHit(hit) { this.hits.push(hit); return true; },
    ...extra,
  };
  h.enemies.push(e);
  return e;
}

/** Compara objetos creados dentro del vm (otro realm) con literales de aquí. */
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}

/* ============================== Balam jaguar ============================== */

await test('awakenJaguar: GameState.balamJaguar, balam:jaguar {on:true} y resuelve', async () => {
  const h = harness();
  const J = loadTs('src/systems/BalamJaguar.ts', h.deps);
  J.installBalamJaguar(h.world);
  assert.equal(J.isJaguarActive(), false);
  await J.awakenJaguar(h.world, 120, 200);
  assert.equal(h.GameState.balamJaguar, true);
  assert.equal(J.isJaguarActive(), true);
  same(h.emitted.find((e) => e.name === 'balam:jaguar').payload, { on: true });
});

await test('El jaguar embiste cada pocos segundos: prioriza Tzitzimime, ignora ilusiones y nunca daña al jugador', async () => {
  const h = harness();
  const J = loadTs('src/systems/BalamJaguar.ts', h.deps);
  J.installBalamJaguar(h.world);
  const comun = enemy(h, 'encapuchado', 150, 200); // más cerca
  const ilusion = enemy(h, 'nahuala', 140, 200, { illusion: true });
  const tzi = enemy(h, 'tzitzimitl', 300, 210);
  await J.awakenJaguar(h.world, 110, 200);
  for (let i = 0; i < 20 * 14; i++) h.tick(50); // 14 s
  const strikes = h.emitted.filter((e) => e.name === 'balam:strike');
  assert.ok(strikes.length >= 2, `embestidas: ${strikes.length}`);
  assert.ok(tzi.hits.length >= 2, 'prioriza a la Tzitzimitl');
  assert.equal(comun.hits.length, 0);
  assert.equal(ilusion.hits.length, 0);
  assert.ok(tzi.hits.every((hit) => hit.damage > 0 && hit.damage < 20 && hit.stun > 0), 'daño moderado + aturdimiento');
  assert.equal(h.player.hits, 0);
});

await test('Sin jefas ataca al enemigo más cercano; agotados y purificados se ignoran', async () => {
  const h = harness();
  const J = loadTs('src/systems/BalamJaguar.ts', h.deps);
  J.installBalamJaguar(h.world);
  const agotado = enemy(h, 'chaneque', 130, 200, { exhausted: true });
  const lejos = enemy(h, 'chaneque', 380, 200);
  const cerca = enemy(h, 'bestia', 200, 200);
  await J.awakenJaguar(h.world, 110, 200);
  for (let i = 0; i < 20 * 4; i++) h.tick(50);
  assert.ok(cerca.hits.length >= 1);
  assert.equal(agotado.hits.length, 0);
  assert.equal(lejos.hits.length, 0);
});

await test('No ataca durante cinemáticas (controles bloqueados sin deletreo)', async () => {
  const h = harness();
  const J = loadTs('src/systems/BalamJaguar.ts', h.deps);
  J.installBalamJaguar(h.world);
  const t = enemy(h, 'tzitzimitl', 200, 200);
  await J.awakenJaguar(h.world, 110, 200);
  h.player.controlsLocked = true;
  for (let i = 0; i < 20 * 8; i++) h.tick(50);
  assert.equal(t.hits.length, 0);
});

await test('calmJaguar vuelve a gato; reintento con balamJaguar = true reaparece solo', async () => {
  const h = harness();
  const J = loadTs('src/systems/BalamJaguar.ts', h.deps);
  J.installBalamJaguar(h.world);
  await J.awakenJaguar(h.world, 110, 200);
  await J.calmJaguar();
  assert.equal(h.GameState.balamJaguar, false);
  assert.equal(J.isJaguarActive(), false);
  assert.ok(h.emitted.some((e) => e.name === 'balam:jaguar' && e.payload.on === false));
  // Reintento: nueva escena con el estado en true.
  h.shutdown();
  const h2 = harness();
  h2.GameState.balamJaguar = true;
  const J2 = loadTs('src/systems/BalamJaguar.ts', h2.deps);
  J2.installBalamJaguar(h2.world);
  assert.equal(J2.isJaguarActive(), true);
});

await test('El Balam gato se oculta mientras es jaguar', () => {
  const src = read('src/systems/Balam.ts');
  assert.match(src, /GameState\.balamJaguar/);
  assert.match(src, /sprite\.setVisible\(!asJaguar\)/);
});

/* ============================== La madre ============================== */

await test('placeMadre + wakeMadre: madre:awake {on:true} y posición', () => {
  const h = harness();
  const M = loadTs('src/systems/Madre.ts', h.deps);
  M.installMadre(h.world);
  assert.equal(M.getMadrePosition(), null);
  M.placeMadre(h.world, 800, 180);
  same(M.getMadrePosition(), { x: 800, y: 180 });
  M.wakeMadre();
  same(h.emitted.find((e) => e.name === 'madre:awake').payload, { on: true });
});

await test('madreSign: emite madre:sign {x,y,ms} e itzpa:stagger {ms: 3500}; resuelve tras las señas; no encadena', async () => {
  const h = harness();
  const M = loadTs('src/systems/Madre.ts', h.deps);
  M.installMadre(h.world);
  M.placeMadre(h.world, 800, 180);
  M.wakeMadre();
  let done = false;
  const p = M.madreSign().then(() => (done = true));
  const p2 = M.madreSign(); // mientras responde: misma promesa, sin otra ventana
  assert.equal(h.emitted.filter((e) => e.name === 'itzpa:stagger').length, 1);
  const sign = h.emitted.find((e) => e.name === 'madre:sign').payload;
  same(sign, { x: 800, y: 180, ms: 1200 });
  same(h.emitted.find((e) => e.name === 'itzpa:stagger').payload, { ms: 3500 });
  for (let i = 0; i < 20; i++) h.tick(50); // 1 s
  await Promise.resolve();
  assert.equal(done, false);
  for (let i = 0; i < 6; i++) h.tick(50);
  await p;
  await p2;
  assert.equal(done, true);
});

await test('MAMA lanzado (no fallido) con la madre despierta llama a madreSign; fallido o dormida no', () => {
  const h = harness();
  const M = loadTs('src/systems/Madre.ts', h.deps);
  M.installMadre(h.world);
  M.placeMadre(h.world, 800, 180);
  const ev = (outcome) => ({ spellId: 'MAMA', outcome, power: 1, auto: false, x: 0, y: 0, facing: 1 });
  h.bus.emit('spell:resolved', ev('perfect')); // dormida
  assert.equal(h.emitted.filter((e) => e.name === 'madre:sign').length, 0);
  M.wakeMadre();
  h.bus.emit('spell:resolved', ev('fail'));
  assert.equal(h.emitted.filter((e) => e.name === 'madre:sign').length, 0);
  h.bus.emit('spell:resolved', ev('partial'));
  assert.equal(h.emitted.filter((e) => e.name === 'madre:sign').length, 1);
  assert.equal(h.emitted.filter((e) => e.name === 'itzpa:stagger').length, 1);
});

await test('freeMadre rompe las cadenas y resuelve; shutdown no deja promesas colgadas', async () => {
  const h = harness();
  const M = loadTs('src/systems/Madre.ts', h.deps);
  M.installMadre(h.world);
  await M.freeMadre(); // sin madre: resuelve
  M.placeMadre(h.world, 800, 180);
  await M.freeMadre();
  assert.ok(h.sfxNames.includes('cadenas_rotas'));
  M.wakeMadre();
  const p = M.madreSign();
  h.shutdown();
  await p;
  assert.equal(M.getMadrePosition(), null);
});

/* ============================== Conjuros ECOS y MAMA ============================== */

await test('ECOS y MAMA en spells.json: 4 letras LSM válidas, historia con combate: true, effect y effectDoc', () => {
  const allowed = new Set('ABCDEFGHILMNOPRSTUVWYZ');
  for (const id of ['ECOS', 'MAMA']) {
    const s = SPELLS.spells.find((x) => x.id === id);
    assert.ok(s, `falta ${id}`);
    assert.equal(s.type, 'historia');
    assert.equal(s.combate, true);
    const letters = s.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    assert.equal(letters.length, 4);
    for (const c of letters) assert.ok(allowed.has(c), `${id}: letra ${c} no permitida`);
    assert.ok(Object.keys(s.effect).length > 0);
    assert.ok(SPELLS.effectDoc[id], `falta effectDoc de ${id}`);
  }
  assert.equal(SPELLS.spells.find((x) => x.id === 'MAMA').effect.staggerMs, 3500);
  // CONSUELO y PAZ siguen siendo solo de historia.
  for (const id of ['CONSUELO', 'PAZ']) assert.notEqual(SPELLS.spells.find((x) => x.id === id).combate, true);
});

await test('Casting: los de historia con combate entran a la rueda y se lanzan con Q', () => {
  const src = read('src/systems/Casting.ts');
  assert.match(src, /def\?\.type === 'historia' && !def\.combate/);
  assert.match(src, /filter\(\(id\) => !isStorySpell\(id\)\)/);
  assert.match(read('src/systems/Mastery.ts'), /combate\?: boolean/);
});

/* ============================== Jugador atado ============================== */

await test('Player: atado no se mueve, no actúa ni dispara; ataduras se limpian al morir y en escena nueva', () => {
  const src = read('src/entities/Player.ts');
  assert.match(src, /const ok = this\.canAct && !GameState\.bound/);
  assert.match(src, /if \(!this\.canAct \|\| GameState\.bound\) return;/);
  assert.match(src, /!this\.canAct \|\| GameState\.bound \|\| !GameState\.hasLaser/);
  assert.match(src, /this\.dead = true;\n\s+Player\.clearBound\(\);/);
  assert.match(src, /Player\.clearBound\(\);\n\s+const scene = world\.scene;/);
  assert.match(src, /drawBonds/);
  // Escudo bloqueado mientras está atado; el deletreo (Casting) no mira bound.
  assert.match(read('src/systems/Shield.ts'), /\|\| GameState\.bound;/);
  assert.doesNotMatch(read('src/systems/Casting.ts'), /GameState\.bound/);
});

/* ============================== Epílogo ============================== */

await test('EpilogoScene: escena "Epilogo", startEpilogo, créditos con respaldo, cita y registro en main.ts', () => {
  const src = read('src/scenes/EpilogoScene.ts');
  assert.match(src, /super\('Epilogo'\)/);
  assert.match(src, /export function startEpilogo\(scene: Phaser\.Scene\): void/);
  for (const k of ['Spell', 'Dialogue', 'Altar', 'Diario', 'Hud', 'Level']) assert.ok(src.includes(`'${k}'`), `no cierra ${k}`);
  assert.match(src, /import\.meta\.glob\('\.\.\/data\/creditos\.json'/);
  assert.match(src, /Listick Games/);
  assert.match(src, /La memoria de un pueblo vive en quienes la comparten\./);
  assert.match(src, /epilogo_taller/);
  assert.match(src, /epilogo_codice/);
  assert.match(src, /Fragmentos del Sello: 6 \/ 6/);
  assert.match(src, /scene\.start\('Title'\)/);
  const main = read('src/main.ts');
  assert.match(main, /import \{ EpilogoScene \} from '\.\/scenes\/EpilogoScene';/);
  assert.match(main, /EpilogoScene,\n/);
});

console.log(`\n${passed} pruebas de sistemas del Nivel 10 correctas.`);
