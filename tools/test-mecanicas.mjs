// Prueba de las MECÁNICAS de la versión extendida: cooldowns por conjuro (Casting), excepción de los
// conjuros de historia (castSpellNow), curación de PROTECCION por nivel de mejora y maestría ligada al Altar.
// Usa el TypeScript real con dependencias falsas (sin Phaser ni cámara); no sustituye la prueba en navegador.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const spellsJson = JSON.parse(read('src/data/spells.json'));
const progressionJson = JSON.parse(read('src/data/progression.json'));

function loadTs(path, dependencies, globals = {}) {
  const source = ts.transpileModule(read(path), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${source}\n})`, { console, setTimeout, performance, ...globals }, { filename: path })(
    (name) => {
      assert.ok(name in dependencies, `Dependencia inesperada en ${path}: ${name}`);
      return dependencies[name];
    }, module, module.exports);
  return module.exports;
}

const letrasDe = (n) => n.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().split('');

/** Sesión de deletreo falsa: acepta las letras correctas; Esc la cancela. */
class FakeSession {
  constructor(name) { this.letters = letrasDe(name); this.i = 0; this.done = false; this.cancelled = false; }
  get current() { return this.letters[this.i]; }
  typeLetter(k) {
    if (k.toUpperCase() !== this.current) return 'miss';
    this.i++;
    if (this.i >= this.letters.length) this.done = true;
    return 'ok';
  }
  update() { return null; }
  cancel() { this.cancelled = true; this.done = true; }
  result() {
    return this.cancelled
      ? { word: '', correct: 0, total: this.letters.length, fraction: 0, speedRatio: 0, power: 0, outcome: 'fail' }
      : { word: '', correct: this.letters.length, total: this.letters.length, fraction: 1, speedRatio: 0, power: 1, outcome: 'perfect' };
  }
}

function harness() {
  const emitter = new EventEmitter();
  const emitted = [];
  const bus = {
    emit(name, payload) { emitted.push({ name, payload }); emitter.emit(name, payload); },
    on(name, fn) { emitter.on(name, fn); },
    scoped(_scene, name, fn) { emitter.on(name, fn); },
  };
  const sfxNames = [];
  const sfx = (n) => sfxNames.push(n);
  const GameState = {
    hp: 3, maxHp: 5, ecos: 0, casting: false,
    learnedSpells: ['LUZ', 'CALMA', 'SOL', 'PROTECCION'], selectedSpell: 'LUZ', mastery: {},
    upgrades: { vida: 0, dano: 0, velocidad: 0, proteccion: 0 }, flags: {}, section: 'taller',
    settings: { longWindows: false, noExtraSlowmo: false, textScale: 1 },
  };
  const winEvents = new EventEmitter();
  const window = {
    addEventListener: (k, f) => winEvents.on(k, f),
    removeEventListener: (k, f) => winEvents.off(k, f),
  };
  const document = { addEventListener() {}, removeEventListener() {}, fullscreenElement: null };
  const sceneEvents = new EventEmitter();
  const sm = { isActive: () => true, isPaused: () => false, launch() {}, bringToTop() {}, stop() {}, pause() {}, resume() {} };
  const scene = {
    scene: sm, game: { canvas: {} },
    events: { on: (k, f) => sceneEvents.on(k, f), once: (k, f) => sceneEvents.once(k, f), off: (k, f) => sceneEvents.off(k, f) },
  };
  const player = { x: 100, y: 200, facing: 1, controlsLocked: false, playOneShot() {} };
  const world = { scene, player, timeScale: 1 };
  const keys = { locked: false, clear() {} };

  const Mastery = loadTs('src/systems/Mastery.ts', {
    '../data/spells.json': spellsJson, '../core/bus': { bus, sfx }, '../core/GameState': { GameState },
    '../lsm': { checkWord: () => ({ ok: true, unsupported: [], tooLong: false }), spellLetters: letrasDe },
  });
  const Progression = loadTs('src/systems/Progression.ts', {
    '../core/bus': { bus, sfx }, '../core/GameState': { GameState },
    '../config/combat': { ORBS: { maxPerBurst: 8 } }, '../config/game': { isCdmx: () => false },
    '../data/progression.json': progressionJson, '../entities/EcoOrb': { EcoOrb: class {} }, './Mastery': Mastery,
  });
  const Casting = loadTs('src/systems/Casting.ts', {
    phaser: { Scenes: { Events: { UPDATE: 'update', SHUTDOWN: 'shutdown' } } },
    '../core/bus': { bus, sfx }, '../core/GameState': { GameState },
    '../config/controls': { isAction: (code, a) => a === 'spell' && code === 'KeyQ', keys, SPELL_HOLD_MS: 200 },
    '../config/game': { SLOWMO: { wheel: 0.2, spell: 0.2, learn: 0.1 } },
    './Lsm': {
      lsm: { setMode() {}, startSpell: (name) => new FakeSession(name), cameraReady: false, stepSpell() { return null; } },
      camView: { hide() {} }, showCamera() {},
    },
    './Mastery': Mastery, './Shield': { isShieldActive: () => false },
  }, { window, document });

  const tick = (ms) => sceneEvents.emit('update', 0, ms);
  const key = (type, code, k = '') => winEvents.emit(type, { code, key: k, repeat: false, ctrlKey: false, altKey: false, metaKey: false });
  /** Q tocado: lanza el conjuro seleccionado. */
  const pulsarQ = () => { key('keydown', 'KeyQ'); key('keyup', 'KeyQ'); };
  const teclear = (spellId) => {
    for (const l of letrasDe(spellsJson.spells.find((s) => s.id === spellId).name)) key('keydown', 'Key' + l, l.toLowerCase());
  };
  const count = (name, pred = () => true) => emitted.filter((e) => e.name === name && pred(e.payload)).length;
  const toasts = () => emitted.filter((e) => e.name === 'hud:toast').map((e) => e.payload.text);
  Casting.installCasting(world);
  return { Mastery, Progression, Casting, GameState, emitted, sfxNames, world, tick, key, pulsarQ, teclear, count, toasts };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}

/* ============================== DATOS ============================== */

await test('spells.json: cooldowns elegidos por conjuro', () => {
  const cd = Object.fromEntries(spellsJson.spells.map((s) => [s.id, s.cooldownMs]));
  assert.equal(cd.PROTECCION, 20000);
  for (const id of ['LUZ', 'SOL', 'FUEGO', 'VERDAD', 'VOZ', 'ECOS']) assert.ok(cd[id] >= 6000 && cd[id] <= 8000, id);
  assert.equal(cd.CALMA, 1500);
  assert.equal(cd.DESCANSO, 4000);
  assert.equal(cd.MEMORIA, 4000);
  for (const id of ['CONSUELO', 'PAZ']) assert.equal(cd[id], 0, id);
  assert.equal(cd.MAMA, 3000);
});

/* ============================== COOLDOWNS ============================== */

await test('Lanzar inicia la recarga, emite spell:cooldown y getCooldown la refleja', () => {
  const h = harness();
  assert.deepEqual({ ...h.Casting.getCooldown('LUZ') }, { remaining: 0, total: 6000 });
  h.pulsarQ();
  h.teclear('LUZ');
  assert.equal(h.count('spell:resolved'), 1);
  assert.deepEqual({ ...h.Casting.getCooldown('LUZ') }, { remaining: 6000, total: 6000 });
  const first = h.emitted.find((e) => e.name === 'spell:cooldown').payload;
  assert.deepEqual({ ...first }, { spellId: 'LUZ', remaining: 6000, total: 6000 });
});

await test('Mientras corre no deja lanzar ese conjuro (aviso + sonido) pero sí otros', () => {
  const h = harness();
  h.pulsarQ(); h.teclear('LUZ');
  h.tick(50);
  const before = h.count('spell:begin');
  h.sfxNames.length = 0;
  h.pulsarQ(); // LUZ otra vez
  assert.equal(h.count('spell:begin'), before, 'no debe empezar otro deletreo');
  assert.ok(h.toasts().some((t) => /^LUZ se recarga: \d s$/.test(t)), h.toasts().join('|'));
  assert.ok(h.sfxNames.includes('ui_mover'));
  assert.equal(h.GameState.casting, false);
  h.GameState.selectedSpell = 'CALMA';
  h.pulsarQ();
  assert.equal(h.count('spell:begin', (p) => p.spellId === 'CALMA'), 1, 'CALMA sí se puede');
  h.teclear('CALMA');
  assert.ok(h.Casting.getCooldown('CALMA').remaining > 0);
});

await test('La recarga avanza con el tiempo del juego, emite cada ~250 ms y un final con remaining 0', () => {
  const h = harness();
  h.pulsarQ(); h.teclear('LUZ');
  h.emitted.length = 0;
  for (let i = 0; i < 119; i++) h.tick(50); // 5.95 s
  assert.ok(h.Casting.getCooldown('LUZ').remaining > 0);
  const avisos = h.emitted.filter((e) => e.name === 'spell:cooldown').map((e) => e.payload);
  assert.ok(avisos.length >= 20 && avisos.length <= 26, `avisos: ${avisos.length}`);
  assert.ok(avisos.every((a) => a.total === 6000 && a.remaining > 0));
  h.tick(50);
  h.tick(50);
  const last = h.emitted.filter((e) => e.name === 'spell:cooldown').pop().payload;
  assert.equal(last.remaining, 0);
  assert.equal(h.Casting.getCooldown('LUZ').remaining, 0);
  h.pulsarQ();
  assert.equal(h.GameState.casting, true, 'ya se puede lanzar de nuevo');
});

await test('Sin cuadros de la escena (pausa) la recarga no avanza; un cuadro enorme se limita a 100 ms', () => {
  const h = harness();
  h.pulsarQ(); h.teclear('LUZ');
  for (let i = 0; i < 10; i++) h.tick(100);
  const r = h.Casting.getCooldown('LUZ').remaining;
  assert.equal(r, 5000);
  // Pausa: LevelScene no emite 'update'; aunque pase el tiempo real, nada cambia.
  assert.equal(h.Casting.getCooldown('LUZ').remaining, r);
  h.tick(5000);
  assert.equal(h.Casting.getCooldown('LUZ').remaining, r - 100);
});

await test('Un lanzamiento fallido (Esc) deja una recarga corta: 25 % con tope de 2 s', () => {
  const h = harness();
  h.pulsarQ();
  h.key('keydown', 'Escape');
  assert.equal(h.count('spell:resolved', (p) => p.outcome === 'fail'), 1);
  assert.equal(h.Casting.getCooldown('LUZ').remaining, 1500);
  h.GameState.selectedSpell = 'PROTECCION';
  h.pulsarQ();
  h.key('keydown', 'Escape');
  assert.equal(h.Casting.getCooldown('PROTECCION').remaining, 2000);
  h.GameState.selectedSpell = 'CALMA';
  h.pulsarQ();
  h.key('keydown', 'Escape');
  assert.equal(h.Casting.getCooldown('CALMA').remaining, 375);
});

await test('Un conjuro dominado (auto) también respeta su recarga', () => {
  const h = harness();
  h.GameState.selectedSpell = 'SOL';
  h.GameState.mastery.SOL = { level: 3, progress: 0 };
  h.pulsarQ();
  assert.equal(h.count('spell:resolved', (p) => p.spellId === 'SOL' && p.auto), 1);
  assert.equal(h.Casting.getCooldown('SOL').remaining, 8000);
  h.pulsarQ();
  assert.equal(h.count('spell:begin', (p) => p.spellId === 'SOL'), 1);
  assert.ok(h.toasts().some((t) => t.startsWith('SOL se recarga')));
});

await test('castSpellNow (historia) IGNORA la recarga: ni la respeta ni la inicia', async () => {
  const h = harness();
  h.pulsarQ(); h.teclear('LUZ'); // LUZ en recarga
  const p1 = h.Casting.castSpellNow(h.world, 'LUZ');
  h.teclear('LUZ');
  const ev = await p1;
  assert.equal(ev.outcome, 'perfect');
  assert.equal(h.Casting.getCooldown('LUZ').remaining, 6000, 'no la reinicia ni la alarga');
  for (let i = 0; i < 10; i++) h.tick(100);
  const p2 = h.Casting.castSpellNow(h.world, 'LUZ');
  h.teclear('LUZ');
  await p2;
  assert.equal(h.Casting.getCooldown('LUZ').remaining, 5000, 'tampoco la reinicia');
  // Una forzada sin recarga previa no inicia ninguna (MEMORIA, ECOS de la cadena atado del Nivel 10).
  for (const id of ['MEMORIA', 'ECOS']) {
    const p = h.Casting.castSpellNow(h.world, id);
    h.teclear(id);
    const r = await p;
    assert.equal(r.outcome, 'perfect', id);
    assert.equal(h.Casting.getCooldown(id).remaining, 0, id);
  }
  // Y una forzada cancelada con Esc (fallo) tampoco deja penalización.
  const pf = h.Casting.castSpellNow(h.world, 'MEMORIA');
  h.key('keydown', 'Escape');
  assert.equal((await pf).outcome, 'fail');
  assert.equal(h.Casting.getCooldown('MEMORIA').remaining, 0);
});

await test('Los conjuros de historia (CONSUELO, PAZ) no tienen recarga', async () => {
  const h = harness();
  for (const id of ['CONSUELO', 'PAZ', 'CONSUELO']) {
    const p = h.Casting.castSpellNow(h.world, id);
    h.teclear(id);
    assert.equal((await p).outcome, 'perfect');
  }
  assert.equal(h.count('spell:cooldown', (p) => p.spellId === 'CONSUELO' || p.spellId === 'PAZ'), 0);
});

await test('Reaparecer o cambiar de nivel (installCasting) limpia las recargas', () => {
  const h = harness();
  h.pulsarQ(); h.teclear('LUZ');
  h.emitted.length = 0;
  h.Casting.installCasting(h.world);
  assert.equal(h.Casting.getCooldown('LUZ').remaining, 0);
  assert.equal(h.count('spell:cooldown', (p) => p.spellId === 'LUZ' && p.remaining === 0), 1);
});

/* ============================== PROTECCION ============================== */

await test('getProteccionHeal: 1, 2 y 3 según la mejora del Altar', () => {
  const h = harness();
  assert.equal(h.Progression.getProteccionHeal(), 1);
  h.GameState.upgrades.proteccion = 1;
  assert.equal(h.Progression.getProteccionHeal(), 2);
  h.GameState.upgrades.proteccion = 2;
  assert.equal(h.Progression.getProteccionHeal(), 3);
});

await test('Combat cura con getProteccionHeal (no con effect.heal fijo)', () => {
  const src = read('src/systems/Combat.ts');
  assert.match(src, /getProteccionHeal\(\)/);
  assert.doesNotMatch(src, /spellParam\('PROTECCION', 'heal'/);
});

await test('Mejora "Protección" del Altar: 2 niveles (250 y 450 Ecos), bloqueada sin el conjuro', () => {
  const h = harness();
  const fila = () => h.Progression.upgradeRows().find((r) => r.def.id === 'proteccion');
  assert.ok(fila(), 'la fila existe en upgradeRows (AltarScene la dibuja sola)');
  assert.equal(fila().def.maxLevel, 2);
  assert.deepEqual([...fila().def.costs], [250, 450]);
  h.GameState.learnedSpells = ['LUZ'];
  assert.equal(fila().locked, true);
  h.GameState.ecos = 1000;
  assert.equal(h.Progression.buyUpgrade('proteccion'), false);
  h.GameState.learnedSpells = ['PROTECCION'];
  assert.equal(fila().locked, false);
  assert.match(fila().next, /2/);
  assert.equal(h.Progression.buyUpgrade('proteccion'), true);
  assert.equal(h.GameState.ecos, 750);
  assert.equal(h.GameState.upgrades.proteccion, 1);
  assert.match(fila().next, /3/);
  h.GameState.ecos = 400;
  assert.equal(h.Progression.buyUpgrade('proteccion'), false, 'faltan Ecos');
  h.GameState.ecos = 450;
  assert.equal(h.Progression.buyUpgrade('proteccion'), true);
  assert.equal(h.GameState.ecos, 0);
  assert.equal(fila().maxed, true);
  assert.equal(h.Progression.buyUpgrade('proteccion'), false, 'ya está al máximo');
  assert.equal(h.Progression.getProteccionHeal(), 3);
});

await test('Maestría de PROTECCION = nivel de la mejora; lanzarlo no la sube ni se auto-lanza', () => {
  const h = harness();
  const { getMastery, isMastered, recordCast, pointsToNext } = h.Mastery;
  h.GameState.ecos = 1000;
  assert.equal(getMastery('PROTECCION').level, 0);
  for (let i = 0; i < 10; i++) assert.equal(recordCast('PROTECCION', 'perfect', 1), false);
  assert.equal(getMastery('PROTECCION').level, 0);
  assert.equal(getMastery('PROTECCION').progress, 0);
  h.Progression.buyUpgrade('proteccion');
  assert.equal(getMastery('PROTECCION').level, 1);
  h.Progression.buyUpgrade('proteccion');
  assert.equal(getMastery('PROTECCION').level, 2);
  assert.equal(pointsToNext('PROTECCION'), 0);
  // Aun forzando un nivel 3 a mano, no queda "dominada" ni se auto-lanza.
  h.GameState.mastery.PROTECCION = { level: 3, progress: 0 };
  assert.equal(getMastery('PROTECCION').level, 2);
  assert.equal(isMastered('PROTECCION'), false);
  // Q con PROTECCION: siempre deletreo, nunca resolución automática.
  h.GameState.selectedSpell = 'PROTECCION';
  h.pulsarQ();
  assert.equal(h.GameState.casting, true, 'abre el deletreo');
  h.teclear('PROTECCION');
  const ev = h.emitted.filter((e) => e.name === 'spell:resolved').pop().payload;
  assert.equal(ev.auto, false);
  assert.equal(getMastery('PROTECCION').level, 2, 'lanzarlo no cambia la maestría');
  assert.equal(h.Casting.getCooldown('PROTECCION').total, 20000);
  // Partida nueva (upgrades a 0): su maestría vuelve a 0.
  h.GameState.upgrades.proteccion = 0;
  assert.equal(getMastery('PROTECCION').level, 0);
});

await test('Los demás conjuros siguen subiendo de maestría al lanzarlos', () => {
  const h = harness();
  assert.equal(h.Mastery.recordCast('LUZ', 'perfect', 1), true); // 2 pts de 2 → nivel 1
  assert.equal(h.Mastery.getMastery('LUZ').level, 1);
});

console.log(`\n${passed} pruebas de mecánicas correctas`);
