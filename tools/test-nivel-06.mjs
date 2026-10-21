// Prueba del Nivel 6 (CDMX parte 1): datos de las tres secciones y el director TypeScript real con adaptadores
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
const config = json('src/data/cdmx.json');
const dialogue = json('src/data/dialogue/n06.json');
const levels = {
  xochimilco: json('src/data/levels/xochimilco.json'),
  avenidas: json('src/data/levels/avenidas.json'),
  reforma: json('src/data/levels/reforma.json'),
};
const directorSource = read('src/systems/CdmxDirector.ts');
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
    flags: {}, learnedSpells: ['CALMA', 'PROTECCION', 'VOZ', 'LUZ', 'SOL', 'MEMORIA'], mastery: {}, selectedSpell: 'CALMA',
    hp: 1, maxHp: 5, ecos: 0, totalEcosEarned: 0, checkpoint: null, section: 'xochimilco',
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
        calls.push(['learn', id]);
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
    '../data/cdmx.json': config,
    './Campaign': {
      prepareCdmx2Entry: () => { calls.push(['prepareCdmx2Entry']); },
      prepareCdmxEntry: () => {
        calls.push(['prepareCdmxEntry']);
        state.hasMaria = true;
        state.checkpoint = null;
        if (!state.learnedSpells.includes('MEMORIA')) state.learnedSpells.push('MEMORIA');
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports) { ${code}\n})`, {}, {
    filename: fileURLToPath(new URL('src/systems/CdmxDirector.ts', root)),
  })((name) => {
    assert.ok(name in mods, `Dependencia inesperada: ${name}`);
    return mods[name];
  }, module, module.exports);

  function install(section, { enemies, px } = {}) {
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
      textures: { exists: () => false },
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
      scene, level, player: { x: px ?? 100, y: 295, controlsLocked: false, playOneShot() {} },
      enemies: enemies ?? [], timeScale: 1, arena: null,
      flash() {}, shake() {},
      lockArena(x0, x1) { this.arena = [x0, x1]; calls.push(['lockArena', x0, x1]); },
      unlockArena() { this.arena = null; calls.push(['unlockArena']); },
      remove(e) { const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); calls.push(['remove', e]); },
      gotoSection(...args) { calls.push(['goto', ...args]); },
    };
    lastWorld = world;
    module.exports.installCdmxDirector(world);
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
  const mk = (kind) => (x, y, extra = {}) => ({ kind, x, y, alive: true, purified: false, exhausted: false, destroy() { this.alive = false; }, ...extra });
  return {
    state, emitted, dialogues, toasts, calls, rewards, maria, sprites, install, ready, act, trigger,
    doll: mk('muneca'), hood: mk('encapuchado'), chaneque: mk('chaneque'), nahual: mk('nahual'), nahuala: mk('nahuala'),
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

const count = (level, type, extra = () => true) => level.enemies.filter((e) => e.type === type && extra(e)).length;
const trig = (level, id) => level.triggers.find((t) => t.id === id);
const inRect = (o, x, y) => o.shape === 'rect' && x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h;
const heightObstacleAt = (level, x, y) => level.obstacles.find((o) => o.height && inRect(o, x, y));
/** Salto normal ≈ 32 px de altura máxima (movement.ts: v²/2g); el doble salto llega a ≈ 64. */
const SINGLE_JUMP = 32;

/* ============================== datos ============================== */

const { WalkMap } = loadTs('src/world/WalkMap.ts', { '../config/movement': loadTs('src/config/movement.ts') });
function mapOf(level) {
  const extra = level.props.filter((prop) => prop.collide).map((prop) => ({ shape: 'ellipse', x: prop.x, y: prop.y, ...prop.collide }));
  return new WalkMap(level, extra);
}

await test('Existen las tres secciones con su id, ancho, música y suelo y = 222…345', () => {
  assert.deepEqual(Object.keys(levels), ['xochimilco', 'avenidas', 'reforma']);
  const widths = { xochimilco: 3000, avenidas: 3200, reforma: 2800 };
  const tracks = { xochimilco: 'n06_xochimilco', avenidas: 'n06_avenidas', reforma: 'n06_reforma' };
  for (const [id, level] of Object.entries(levels)) {
    assert.equal(level.id, id);
    assert.equal(level.width, widths[id]);
    assert.equal(level.music, tracks[id]);
    assert.equal(level.cameraBounds.x1, widths[id]);
    assert.equal(level.background, `fondo_${id}`);
    assert.deepEqual(level.walk, [[[0, 222], [widths[id], 222], [widths[id], 345], [0, 345]]]);
  }
});

await test('Conteos: 8 muñecas en 3 grupos de arena (Xochimilco), 5 + 3 chaneques + 3 rojos + 2 nahuales (avenidas), rojos, negros, nahual y Nahuala (Reforma)', () => {
  const x = levels.xochimilco;
  assert.equal(count(x, 'muneca'), 8);
  const groups = {};
  for (const e of x.enemies.filter((e) => e.type === 'muneca')) groups[e.group] = (groups[e.group] ?? 0) + 1;
  assert.deepEqual(groups, { muneca_a: 3, muneca_b: 3, muneca_c: 2 });
  assert.deepEqual(config.emboscadas.grupos, ['muneca_a', 'muneca_b', 'muneca_c']);
  for (const g of config.emboscadas.grupos) {
    const t = x.triggers.find((tr) => tr.action === 'emboscada' && tr.data.group === g);
    assert.ok(t, `trigger de emboscada ${g}`);
    assert.ok(t.x > t.data.x0 && t.x < t.data.x1, `${g}: el trigger queda dentro de su arena`);
    for (const e of x.enemies.filter((e) => e.group === g)) {
      assert.ok(e.x > t.x && e.x > t.data.x0 && e.x < t.data.x1, `${g}: muñeca en (${e.x}) dentro de la arena y delante del trigger`);
    }
  }
  const a = levels.avenidas;
  assert.equal(count(a, 'muneca'), 5);
  assert.equal(count(a, 'chaneque'), 3);
  assert.equal(count(a, 'encapuchado', (e) => e.rank === 'rojo'), 3);
  assert.equal(count(a, 'nahual'), 2);
  const r = levels.reforma;
  assert.equal(count(r, 'encapuchado', (e) => e.rank === 'rojo'), 4);
  assert.equal(count(r, 'encapuchado', (e) => e.rank === 'negro'), 3);
  assert.equal(count(r, 'nahual'), 1);
  const boss = r.enemies.filter((e) => e.type === 'nahuala');
  assert.equal(boss.length, 1);
  assert.equal(boss[0].group, config.arena.grupo);
  const arena = trig(r, 'n06_nahuala_arena');
  assert.equal(arena.data.group, config.arena.grupo);
  assert.equal(arena.data.x0, config.arena.x0);
  assert.equal(arena.data.x1, config.arena.x1);
  assert.ok(boss[0].x > config.arena.x0 && boss[0].x < config.arena.x1, 'La Nahuala nace dentro de la arena');
  assert.ok(config.arena.x1 <= r.width);
  for (const level of Object.values(levels)) {
    for (const e of level.enemies.filter((x) => x.type === 'encapuchado')) assert.ok(['rojo', 'negro'].includes(e.rank));
  }
  // Total ~13 muñecas (NIVELES_ECOS: ~15) y 3 nahuales minijefes.
  assert.equal(count(x, 'muneca') + count(a, 'muneca'), 13);
  assert.equal(count(a, 'nahual') + count(r, 'nahual'), 3);
});

await test('Nahuales infiltrados: id único, disfraz npc_sobreviviente_N e interactuable de diálogo en la misma posición', () => {
  const ids = [];
  for (const level of [levels.avenidas, levels.reforma]) {
    for (const e of level.enemies.filter((x) => x.type === 'nahual')) {
      assert.match(e.id, /^nahual_\d$/);
      assert.match(e.disguise, /^npc_sobreviviente_[1-5]$/);
      assert.equal(e.group, undefined, 'el nahual está suelto, no en una arena');
      ids.push(e.id);
      const it = level.interactables.find((entry) => entry.action === 'n06_nahual' && entry.data.nahualId === e.id);
      assert.ok(it, `interactuable de ${e.id}`);
      assert.equal(it.x, e.x);
      assert.equal(it.y, e.y);
      assert.ok(dialogue[it.data.dialogue], `diálogo ${it.data.dialogue}`);
    }
  }
  assert.deepEqual(ids, ['nahual_1', 'nahual_2', 'nahual_3']);
  // Los disfraces no se repiten y los sobrevivientes reales usan otras texturas de la misma serie.
  const disguises = [levels.avenidas, levels.reforma].flatMap((l) => l.enemies.filter((x) => x.type === 'nahual').map((x) => x.disguise));
  assert.equal(new Set(disguises).size, 3);
});

await test('Suelo transitable (spawns, enemigos, triggers e interactuables); las zonas de doble salto son obstáculos con height', () => {
  for (const [id, level] of Object.entries(levels)) {
    const walk = mapOf(level);
    for (const it of level.interactables) {
      assert.ok(it.y >= 220 && it.y <= 345 || it.action === 'n06_premio', `${id}: ${it.id} dentro de la franja`);
      if (it.action === 'n06_premio') {
        const o = heightObstacleAt(level, it.x, it.y);
        assert.ok(o, `${id}: el premio ${it.id} está encima de un obstáculo con height`);
        assert.ok(o.height > SINGLE_JUMP + 15, `${id}: ${it.id} exige doble salto (height ${o.height})`);
        assert.ok((it.radius ?? 28) <= 20, `${id}: ${it.id} con radio pequeño para no activarse desde el suelo`);
        assert.equal(walk.isWalkable(it.x, it.y), false);
      } else {
        assert.equal(walk.isWalkable(it.x, it.y), true, `${id}: interactuable accesible ${it.id}`);
      }
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
    // Nadie se atora: ningún obstáculo cierra la franja completa y todo lo opcional es opcional.
    for (const o of level.obstacles) {
      assert.equal(o.shape, 'rect');
      assert.ok(o.height >= 20, `${id}: obstáculo con height`);
      assert.ok(o.y >= 222 && o.y + o.h < 345 - 20 || o.height < SINGLE_JUMP, `${id}: obstáculo alto lejos del paso principal`);
    }
  }
  const premios = Object.values(levels).flatMap((l) => l.interactables.filter((it) => it.action === 'n06_premio'));
  assert.equal(premios.length, 4, 'una zona de doble salto en Xochimilco, dos en las avenidas y una en Reforma');
  assert.ok(Object.values(levels).every((l) => l.obstacles.some((o) => o.height > SINGLE_JUMP + 15)));
});

await test('Ids únicos, altar y checkpoints: FUEGO antes del altar de Xochimilco; punto de control y altar antes de la Nahuala', () => {
  for (const [id, level] of Object.entries(levels)) {
    const ids = level.interactables.map((it) => it.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: ids de interactuables únicos`);
    const tids = level.triggers.map((t) => t.id);
    assert.equal(new Set(tids).size, tids.length, `${id}: ids de triggers únicos`);
    assert.ok(level.spawns.checkpoint && level.spawns.inicio && level.spawns.altar, `${id}: spawns checkpoint/inicio/altar`);
    assert.ok(level.props.some((p) => p.key === 'altar_memoria'), `${id}: tiene altar_memoria`);
    assert.ok(level.interactables.some((it) => it.action === 'altar'), `${id}: tiene interactuable altar`);
    for (const t of level.triggers) {
      assert.ok(['letras', 'dialogo', 'emboscada', 'ir_seccion', 'punto', 'nahuala_arena'].includes(t.action), `${id}: action de trigger ${t.action}`);
    }
    for (const it of level.interactables) {
      assert.ok(['n06_examinar', 'altar', 'n06_fuego', 'n06_descanso', 'n06_cronista', 'n06_nahual', 'n06_premio', 'n06_habitante', 'n06_estacion'].includes(it.action), `${id}: action ${it.action}`);
    }
  }
  const x = levels.xochimilco;
  const fuego = x.interactables.find((it) => it.action === 'n06_fuego');
  const altar = x.interactables.find((it) => it.action === 'altar');
  assert.ok(fuego.x < altar.x && altar.x < config.gates.fuegoX, 'ofrenda → altar → compuerta');
  assert.ok(config.gates.fuegoX < trig(x, 'n06_emb_b').x);
  assert.ok(trig(x, 'n06_emb_a').x < fuego.x, 'la primera emboscada llega antes de FUEGO');
  const r = levels.reforma;
  assert.ok(r.spawns.altar.x < trig(r, 'n06_punto_jefa').x && trig(r, 'n06_punto_jefa').x < trig(r, 'n06_nahuala_arena').x);
  assert.ok(r.spawns.jefa.x < trig(r, 'n06_nahuala_arena').x);
  assert.ok(r.triggers.findIndex((t) => t.id === 'n06_negros_vista') >= 0, 'se presenta a los Negros');
  const firstNegro = Math.min(...r.enemies.filter((e) => e.rank === 'negro').map((e) => e.x));
  assert.ok(trig(r, 'n06_negros_vista').x < firstNegro, 'el aviso de los Negros llega antes que el primero');
  const a = levels.avenidas;
  const desc = a.interactables.find((it) => it.action === 'n06_descanso');
  const cron = a.interactables.find((it) => it.action === 'n06_cronista');
  const firstNahual = Math.min(...a.enemies.filter((e) => e.type === 'nahual').map((e) => e.x));
  assert.ok(desc.x < cron.x && cron.x < config.gates.verdadX && config.gates.verdadX < firstNahual, 'DESCANSO → cronista → compuerta → nahuales');
  assert.ok(config.gates.verdadX < trig(a, 'n06_tip_nahual').x);
  assert.ok(a.spawns.altar.x > firstNahual, 'checkpoint intermedio tras el primer nahual');
  // Cierre: habitantes y estación dentro de la arena de la Nahuala (aparecen al vencerla); salida al final.
  const hab = r.interactables.filter((it) => it.action === 'n06_habitante').map((it) => it.data.habitante).sort();
  assert.deepEqual(hab, ['a', 'b']);
  const est = r.interactables.find((it) => it.action === 'n06_estacion');
  assert.ok(est.x > Math.max(...r.interactables.filter((it) => it.action === 'n06_habitante').map((it) => it.x)));
  for (const name of ['n06_habitante_a', 'n06_habitante_b', 'n06_estacion']) assert.ok(r.props.some((p) => p.id === name), `prop ${name}`);
  assert.equal(x.triggers.find((t) => t.action === 'ir_seccion').data.section, 'avenidas');
  assert.equal(a.triggers.find((t) => t.action === 'ir_seccion').data.section, 'reforma');
});

await test('Los diálogos referenciados (nivel, director y datos) existen, tienen texto y hablantes conocidos', () => {
  const ids = new Set();
  for (const level of Object.values(levels)) {
    for (const it of level.interactables) if (typeof it.data?.dialogue === 'string') ids.add(it.data.dialogue);
    for (const t of level.triggers) if (typeof t.data?.dialogue === 'string') ids.add(t.data.dialogue);
    for (const it of level.interactables.filter((entry) => entry.action === 'n06_habitante')) ids.add(`n06_habitante_${it.data.habitante}`);
  }
  for (const match of directorSource.matchAll(/'(n06_[a-z0-9_]+)'/g)) if (dialogue[match[1]]) ids.add(match[1]);
  assert.ok(ids.size > 28, `hay diálogos suficientes (${ids.size})`);
  for (const id of ids) {
    assert.ok(Array.isArray(dialogue[id]) && dialogue[id].length > 0, `Diálogo existente: ${id}`);
    for (const line of dialogue[id]) {
      assert.ok(line.text.trim().length > 0, `Texto no vacío en ${id}`);
      assert.ok(dialogue._hablantes[line.who], `Hablante conocido en ${id}: ${line.who}`);
    }
  }
  for (const key of Object.keys(dialogue._hablantes)) assert.ok(key.startsWith('n06_'), `Prefijo n06_ en hablante ${key}`);
  for (const key of Object.keys(dialogue)) assert.ok(key === '_hablantes' || key.startsWith('n06_'), `Prefijo n06_ en ${key}`);
  // Los diálogos de aprendizaje que usa el director.
  for (const id of ['n06_intro', 'n06_fuego', 'n06_fuego_fin', 'n06_ofrenda', 'n06_descanso_fin', 'n06_cronista', 'n06_verdad_fin',
    'n06_nahuala_intro', 'n06_nahuala_fin', 'n06_habitantes_fin', 'n06_estacion', 'n06_negros_vista']) {
    assert.ok(dialogue[id], `Diálogo del director: ${id}`);
  }
  // Historia (NDD): ni Rey del Olvido en los comentarios de María antes del cierre, ni su pasado ni que es la Llorona.
  const mariaLines = [...Object.values(config.maria).map((m) => m.text),
    ...Object.values(dialogue).filter(Array.isArray).flat().filter((l) => l.who === 'n06_maria').map((l) => l.text)];
  assert.ok(mariaLines.length > 20);
  const everything = JSON.stringify(dialogue) + JSON.stringify(config.maria);
  assert.ok(!/Llorona|ahog|esposa|esposo|marido|mis hijos (los )?(maté|ahogué)/i.test(everything), 'No se adelanta el pasado de María');
  for (const key of ['llegada', 'canales', 'fuego', 'ciudad', 'descanso', 'avenidas', 'verdad', 'nahual', 'angel', 'negros', 'jefa', 'rey', 'final']) {
    assert.ok(config.maria[key].text.length > 30, `Comentario de María: ${key}`);
  }
  // Español de México, de «tú»: sin voseo.
  assert.ok(!/\b(vos|sos|tenés|podés|querés|vení|mirá)\b/i.test(everything));
});

await test('VERDAD, FUEGO y DESCANSO se pueden deletrear con checkWord real (letras permitidas, máx. 10)', () => {
  const { checkWord } = loadTs('src/lsm/core/letters.ts', { '../data/letters.json': json('src/lsm/data/letters.json') });
  for (const word of ['VERDAD', 'FUEGO', 'DESCANSO', 'CALMA']) {
    const check = checkWord(word);
    assert.equal(check.ok, true, `${word} válido`);
    assert.equal(check.letters.join(''), word);
    assert.ok(check.letters.length <= 10);
  }
  assert.deepEqual(config.conjuros, ['FUEGO', 'DESCANSO', 'VERDAD']);
});

await test('Los números del nivel cuadran: compuertas, arena y Ecos totales cerca de ~800', () => {
  assert.ok(config.gates.fuegoX < levels.xochimilco.width && config.gates.verdadX < levels.avenidas.width);
  assert.ok(config.arena.x0 >= trig(levels.reforma, 'n06_nahuala_arena').x - 100);
  const r = config.rewards;
  const enemigos = 13 * 4 + 3 * 5 + 7 * 8 + 3 * 15 + 3 * 60 + 400;
  const extras = 3 * r.conjuro + 3 * r.emboscada + 4 * r.premio + 2 * r.habitante + r.estacion + 14 * r.descubrimiento;
  assert.ok(enemigos + extras > 700 && enemigos + extras < 1000, `Ecos del nivel razonables (${enemigos + extras})`);
  assert.ok(extras < 250, `Ecos del director razonables (${extras})`);
});

/* ============================== director ============================== */

await test('Xochimilco: intro, María, compuerta hasta aprender FUEGO y ofrenda que enseña FUEGO una sola vez', async () => {
  const h = harness();
  const s = await h.ready('xochimilco');
  assert.ok(h.dialogues.includes('n06_intro'));
  assert.equal(h.state.flags['n06:intro'], true);
  assert.equal(h.state.checkpoint.section, 'xochimilco');
  assert.ok(h.maria.some((t) => /puertas/.test(t)), 'María comenta al llegar a la ciudad');
  s.tick();
  assert.deepEqual(h.calls.find(([k]) => k === 'lockArena'), ['lockArena', 0, config.gates.fuegoX]);
  assert.match(h.text, /EMBOSCADAS 0\/3/);
  assert.ok(!h.state.learnedSpells.includes('FUEGO'));
  assert.equal(await h.act('n06_fuego'), true);
  assert.deepEqual(h.calls.find(([k]) => k === 'learn'), ['learn', 'FUEGO']);
  assert.ok(h.state.learnedSpells.includes('FUEGO'));
  assert.equal(h.state.selectedSpell, 'FUEGO');
  assert.equal(h.state.flags['n06:fuego'], true);
  assert.ok(['n06_fuego', 'n06_fuego_fin'].every((id) => h.dialogues.includes(id)));
  assert.equal(h.state.ecos, config.rewards.conjuro);
  assert.ok(h.toasts.some((t) => /FUEGO/.test(t) && /Nahuala/.test(t)), 'Avisa de la afinidad de FUEGO');
  assert.ok(h.maria.some((t) => /fuego guíe/.test(t)));
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  await h.act('n06_fuego');
  assert.equal(h.state.ecos, config.rewards.conjuro, 'No se premia dos veces');
  assert.ok(h.dialogues.includes('n06_fuego_repite'));
  s.tick();
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'), 'Se abre la compuerta');
});

await test('Conjuro sin definición aún en spells.json: FUEGO, DESCANSO y VERDAD se conceden con aviso en vez de atascar', async () => {
  const h = harness({ spellDefs: false });
  await h.ready('xochimilco');
  await h.act('n06_fuego');
  assert.ok(h.state.learnedSpells.includes('FUEGO'));
  assert.equal(h.state.flags['n06:fuego'], true);
  assert.ok(h.toasts.some((t) => /FUEGO/.test(t)));
  assert.ok(!h.calls.some(([k]) => k === 'learn'));
  const h2 = harness({ spellDefs: false });
  await h2.ready('avenidas');
  await h2.act('n06_descanso');
  await h2.act('n06_cronista');
  assert.ok(h2.state.learnedSpells.includes('DESCANSO') && h2.state.learnedSpells.includes('VERDAD'));
});

await test('Salir de Xochimilco sin FUEGO no cambia de sección; con FUEGO sí, hacia avenidas', async () => {
  const h = harness();
  await h.ready('xochimilco');
  await h.trigger('n06_a_avenidas');
  assert.ok(!h.calls.some(([k]) => k === 'goto'));
  assert.ok(h.toasts.some((t) => /FUEGO/.test(t)));
  await h.act('n06_fuego');
  await h.trigger('n06_a_avenidas');
  assert.deepEqual(h.calls.find(([k]) => k === 'goto'), ['goto', 'avenidas', 'inicio']);
});

await test('Emboscada de muñecas: lockArena + arena:start una vez, no termina antes de tiempo y premia al limpiarse', async () => {
  const h = harness();
  h.state.flags['n06:fuego'] = true;
  h.state.learnedSpells.push('FUEGO');
  const s = await h.ready('xochimilco', { enemies: [] });
  const t = trig(levels.xochimilco, 'n06_emb_a');
  await h.trigger('n06_emb_a');
  assert.deepEqual(h.calls.filter(([k]) => k === 'lockArena').at(-1), ['lockArena', t.data.x0, t.data.x1]);
  assert.ok(h.emitted.some((e) => e.name === 'arena:start' && e.payload.group === 'muneca_a'));
  assert.ok(h.toasts.some((x) => /muñecas/i.test(x) && /destruir/.test(x)), 'Explica que se pueden destruir');
  assert.match(h.text, /Muñecas/);
  await h.trigger('n06_emb_a');
  await h.trigger('n06_emb_b');
  assert.equal(h.emitted.filter((e) => e.name === 'arena:start').length, 1, 'No reinicia la emboscada en curso ni abre otra encima');
  assert.equal(await h.act('altar'), false, 'Sin altar durante el combate');
  const dolls = levels.xochimilco.enemies.filter((e) => e.group === 'muneca_a').map((e) => h.doll(e.x, e.y, { group: 'muneca_a' }));
  s.world.enemies.push(...dolls);
  s.clock.now = 800;
  s.tick();
  assert.equal(h.state.flags['n06:emb:muneca_a'], undefined);
  dolls.slice(0, 2).forEach((d) => h.purify(d));
  s.clock.now = 4000;
  s.tick();
  assert.equal(h.state.flags['n06:emb:muneca_a'], undefined, 'Falta una muñeca');
  h.purify(dolls[2]);
  s.clock.now = 5000;
  s.tick();
  assert.equal(h.state.flags['n06:emb:muneca_a'], true);
  assert.ok(h.emitted.some((e) => e.name === 'arena:clear' && e.payload.group === 'muneca_a'));
  assert.equal(h.calls.filter(([k]) => k === 'unlockArena').length >= 1, true);
  assert.equal(h.state.ecos, config.rewards.emboscada);
  assert.match(h.text, /EMBOSCADAS 1\/3/);
  // Ya limpiada: volver a pisar el trigger no la repite.
  await h.trigger('n06_emb_a');
  assert.equal(h.emitted.filter((e) => e.name === 'arena:start').length, 1);
  // FUEGO aprendido: la siguiente emboscada explica FUEGO / DESCANSO.
  await h.trigger('n06_emb_b');
  assert.ok(h.toasts.some((x) => /FUEGO/.test(x) && /DESCANSO/.test(x)));
});

await test('Emboscada: las tres limpias disparan el comentario de María sobre la gran ciudad; respaldo si las muñecas no aparecen', async () => {
  const h = harness();
  const s = await h.ready('xochimilco', { enemies: [] });
  for (const g of ['n06_emb_a', 'n06_emb_b', 'n06_emb_c']) {
    await h.trigger(g);
    s.tick();
    assert.equal(h.state.flags[`n06:emb:${g.replace('n06_emb_', 'muneca_')}`], undefined);
    s.clock.now += config.emboscadas.respaldoMs + 500;
    s.tick();
    await flush();
    assert.equal(h.state.flags[`n06:emb:${g.replace('n06_emb_', 'muneca_')}`], true, 'El respaldo evita atascos');
  }
  assert.ok(h.maria.some((t) => /gran ciudad/.test(t)));
  assert.equal(h.state.ecos, 3 * config.rewards.emboscada);
  assert.match(h.text, /EMBOSCADAS 3\/3/);
});

await test('Cornisas de doble salto: el premio y la pista se dan una sola vez', async () => {
  const h = harness();
  await h.ready('xochimilco');
  assert.equal(await h.act('n06_premio'), true);
  assert.ok(h.dialogues.includes('n06_cornisa_1'));
  assert.equal(h.state.ecos, config.rewards.premio);
  assert.equal(await h.act('n06_premio'), false, 'Ya cobrado: no vuelve a ofrecerse');
  assert.equal(h.state.ecos, config.rewards.premio);
});

await test('Avenidas: compuerta hasta VERDAD; la cronista la enseña con el aviso de Luna; el toast no se repite', async () => {
  const h = harness();
  const s = await h.ready('avenidas', { enemies: [] });
  assert.equal(h.state.learnedSpells.includes('FUEGO'), true, 'Entrada directa concede FUEGO para pruebas');
  s.tick();
  assert.deepEqual(h.calls.find(([k]) => k === 'lockArena'), ['lockArena', 0, config.gates.verdadX]);
  assert.match(h.text, /NAHUALES 0\/2/);
  assert.match(h.text, /DESCANSO/);
  await h.act('n06_descanso');
  assert.ok(h.state.learnedSpells.includes('DESCANSO'));
  assert.ok(h.dialogues.includes('n06_ofrenda') && h.dialogues.includes('n06_descanso_fin'));
  assert.ok(h.toasts.some((t) => /DESCANSO/.test(t) && /alma/.test(t)));
  assert.ok(h.maria.some((t) => /Los míos tienen que estar vivos/.test(t)), 'Desesperación de María');
  s.tick();
  assert.match(h.text, /Doña Refugio/);
  assert.ok(!h.state.learnedSpells.includes('VERDAD'));
  await h.act('n06_cronista');
  assert.ok(h.state.learnedSpells.includes('VERDAD'));
  assert.equal(h.state.flags['n06:verdad'], true);
  assert.ok(h.dialogues.includes('n06_cronista') && h.dialogues.includes('n06_verdad_fin'));
  const tip = 'Con Luna (F) puedes ver la sombra de los nahuales disfrazados; VERDAD los descubre';
  assert.equal(h.toasts.filter((t) => t === tip).length, 1);
  assert.equal(h.state.ecos, 2 * config.rewards.conjuro);
  await h.trigger('n06_tip_nahual');
  assert.equal(h.toasts.filter((t) => t === tip).length, 1, 'No se repite el tutorial');
  s.tick();
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'));
  await h.act('n06_cronista');
  assert.ok(h.dialogues.includes('n06_cronista_repite'));
  assert.equal(h.state.ecos, 2 * config.rewards.conjuro);
});

await test('Tutorial de nahuales por trigger si aún no se mostró (jugador que ya sabe VERDAD)', async () => {
  const h = harness();
  h.state.learnedSpells.push('FUEGO', 'DESCANSO', 'VERDAD');
  await h.ready('avenidas', { enemies: [] });
  await h.trigger('n06_tip_nahual');
  await h.trigger('n06_tip_nahual');
  assert.equal(h.toasts.filter((t) => /sombra de los nahuales/.test(t)).length, 1);
});

/** Avenidas con VERDAD y los dos nahuales como enemigos (para los casos de infiltrados). */
async function avenidasConNahuales() {
  const h = harness();
  h.state.learnedSpells.push('FUEGO', 'DESCANSO', 'VERDAD');
  const level = levels.avenidas;
  const enemies = level.enemies.map((e) => {
    if (e.type === 'nahual') return h.nahual(e.x, e.y, { id: e.id });
    if (e.type === 'muneca') return h.doll(e.x, e.y);
    if (e.type === 'chaneque') return h.chaneque(e.x, e.y);
    return h.hood(e.x, e.y);
  });
  const s = await h.ready('avenidas', { enemies: [...enemies] });
  return { h, s, enemies, nahuales: enemies.filter((e) => e.kind === 'nahual') };
}

await test('Nahual por diálogo: reproduce su línea y emite nahual:reveal {id, surprise:true} cuando el mundo ya se descongeló', async () => {
  const { h, s } = await avenidasConNahuales();
  const emittedBefore = () => h.emitted.filter((e) => e.name === 'nahual:reveal');
  // Mientras el diálogo está abierto, el mundo sigue congelado y aún no se transforma.
  h.hold('n06_nahual_1');
  assert.equal(await h.act('n06_nahual', { nahualId: 'nahual_1' }), true);
  assert.equal(s.world.timeScale, 0);
  assert.equal(emittedBefore().length, 0, 'No ataca con el mundo congelado');
  await h.release();
  assert.ok(h.dialogues.includes('n06_nahual_1'));
  assert.equal(JSON.stringify(emittedBefore().map((e) => e.payload)), JSON.stringify([{ id: 'nahual_1', surprise: true }]));
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  assert.equal(await h.act('n06_nahual', { nahualId: 'nahual_1' }), false, 'Ya no se puede hablar de nuevo mientras se transforma');
  h.emit('nahual:revealed', { id: 'nahual_1' });
  assert.equal(await h.act('n06_nahual', { nahualId: 'nahual_1' }), false);
  assert.ok(h.maria.some((t) => /sobreviviente puede ser un disfraz/.test(t)));
  assert.equal(emittedBefore().length, 1);
  // El otro nahual sigue disponible.
  assert.equal(await h.act('n06_nahual', { nahualId: 'nahual_2' }), true);
  assert.equal(emittedBefore().length, 2);
});

await test('Nahual por VERDAD: si nahual:revealed llega antes, se quita su diálogo y no se emite reveal', async () => {
  const { h } = await avenidasConNahuales();
  assert.equal(h.enabled(levels.avenidas.interactables.find((it) => it.data?.nahualId === 'nahual_2')), true);
  h.emit('nahual:revealed', { id: 'nahual_2' });
  assert.equal(await h.act('n06_nahual', { nahualId: 'nahual_2' }), false);
  assert.ok(!h.emitted.some((e) => e.name === 'nahual:reveal'), 'El director no fuerza al ya revelado');
  assert.ok(h.toasts.some((t) => /VERDAD/.test(t) && /sorpresa/.test(t)));
  assert.ok(!h.dialogues.includes('n06_nahual_2'));
});

await test('Nahual que huye o se purifica: queda registrado, no reaparece tras morir y su diálogo no vuelve', async () => {
  const { h, s, enemies, nahuales } = await avenidasConNahuales();
  assert.match(h.text, /NAHUALES 0\/2/);
  h.emit('nahual:fled', { id: 'nahual_1' });
  assert.equal(h.state.flags['n06:nahual:nahual_1:fin'], true);
  assert.equal(h.state.flags[`n06:down:avenidas:${levels.avenidas.enemies.findIndex((e) => e.id === 'nahual_1')}`], true);
  assert.ok(h.toasts.some((t) => /huyó/.test(t)));
  h.purify(nahuales[1]);
  assert.equal(h.state.flags['n06:nahual:nahual_2:fin'], true);
  await flush();
  s.tick();
  assert.match(h.text, /NAHUALES 2\/2/);
  assert.match(h.text, /Reforma/);
  const cp = h.state.checkpoint;
  s.shutdown();
  const again = levels.avenidas.enemies.map((e) => (e.type === 'nahual' ? h.nahual(e.x, e.y, { id: e.id }) : h.hood(e.x, e.y)));
  const s2 = await h.ready('avenidas', { enemies: [...again] });
  assert.equal(h.state.checkpoint, cp);
  const live = again.filter((e) => e.alive);
  assert.equal(again.filter((e) => e.kind === 'nahual' && e.alive).length, 0, 'Los nahuales vencidos no reaparecen');
  assert.ok(live.length > 0);
  assert.equal(await h.act('n06_nahual', { nahualId: 'nahual_1' }), false);
  assert.equal(await h.act('n06_nahual', { nahualId: 'nahual_2' }), false);
  s2.tick();
  void enemies;
});

await test('Tutoriales de agotamiento: nahual agotado y Nahuala agotada muestran el aviso correcto', async () => {
  const h = harness();
  const nahual = h.nahual(1660, 292, { id: 'nahual_1' });
  const nahuala = h.nahuala(2380, 290);
  await h.ready('reforma', { enemies: [nahual, nahuala] });
  h.emit('enemy:exhausted', { enemy: nahual });
  assert.ok(h.toasts.some((t) => /nahual está agotado/.test(t) && /CALMA/.test(t)));
  h.emit('enemy:exhausted', { enemy: nahuala });
  assert.ok(h.toasts.some((t) => /Nahuala/.test(t) && /CALMA/.test(t) && /FUEGO/.test(t)));
});

await test('Reforma: aviso de los Encapuchados Negros, punto de control antes de la jefa y comentario de María una vez', async () => {
  const h = harness();
  const s = await h.ready('reforma', { enemies: [] });
  assert.ok(['FUEGO', 'DESCANSO', 'VERDAD'].every((id) => h.state.learnedSpells.includes(id)), 'Entrada directa concede los tres conjuros');
  await h.trigger('n06_negros_vista');
  await h.trigger('n06_negros_vista');
  assert.ok(h.dialogues.includes('n06_negros_vista'));
  assert.ok(h.toasts.some((t) => /Encapuchados Negros/.test(t)), 'Presenta a los Negros con un aviso');
  assert.equal(h.maria.filter((t) => /pesan más/.test(t)).length, 1);
  await h.trigger('n06_punto_jefa');
  assert.deepEqual({ x: h.state.checkpoint.x, y: h.state.checkpoint.y }, levels.reforma.spawns.jefa);
  const cps = h.emitted.filter((e) => e.name === 'checkpoint').length;
  await h.trigger('n06_punto_jefa');
  assert.equal(h.emitted.filter((e) => e.name === 'checkpoint').length, cps, 'El punto de control se da una sola vez');
  void s;
});

await test('Nahuala: la arena inicia una vez (lockArena + arena:start), boss:calmed abre el cierre, habitantes y estación', async () => {
  const h = harness();
  const s = await h.ready('reforma', { enemies: [] });
  assert.equal(h.sprites['reforma:n06_habitante_a'].visible, false, 'Los habitantes están ocultos antes de la jefa');
  assert.equal(h.sprites['reforma:n06_habitante_b'].visible, false);
  assert.equal(await h.act('n06_habitante', { habitante: 'a' }), false);
  assert.equal(await h.act('n06_estacion'), false);
  await h.trigger('n06_nahuala_arena');
  assert.ok(h.dialogues.includes('n06_nahuala_intro'));
  assert.deepEqual(h.calls.filter(([k]) => k === 'lockArena').at(-1), ['lockArena', config.arena.x0, config.arena.x1]);
  assert.ok(h.emitted.some((e) => e.name === 'arena:start' && e.payload.group === 'nahuala'));
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n06_jefe'));
  assert.equal(h.state.selectedSpell, 'VERDAD');
  const starts = () => h.emitted.filter((e) => e.name === 'arena:start').length;
  await h.trigger('n06_nahuala_arena');
  assert.equal(starts(), 1, 'No reinicia la arena en curso');
  s.world.enemies.push(h.nahuala(2380, 290, { group: 'nahuala' }));
  s.tick();
  assert.equal(h.state.flags['n06:nahuala'], undefined);
  assert.equal(await h.act('altar'), false, 'Sin altar durante el combate');
  h.emit('nahuala:illusion', { count: 3 });
  h.emit('nahuala:illusion', { count: 2 });
  assert.equal(h.toasts.filter((t) => /Copias ilusorias/.test(t)).length, 1);
  h.emit('boss:vulnerable', { on: true });
  assert.ok(h.toasts.some((t) => /Nahuala/.test(t) && /CALMA/.test(t)));
  h.emit('boss:calmed', {});
  await flush();
  assert.equal(h.state.flags['n06:nahuala'], true);
  assert.ok(h.emitted.some((e) => e.name === 'arena:clear' && e.payload.group === 'nahuala'));
  assert.ok(h.emitted.some((e) => e.name === 'music' && e.payload.track === 'n06_reforma'));
  assert.ok(h.dialogues.includes('n06_nahuala_fin'));
  assert.equal(h.state.flags['n06:nahuala_fin'], true);
  assert.equal(h.sprites['reforma:n06_habitante_a'].visible, true);
  assert.equal(h.sprites['reforma:n06_habitante_b'].visible, true);
  assert.ok(h.maria.some((t) => /También le quitaron lo suyo/.test(t)));
  assert.equal(s.world.timeScale, 1);
  assert.equal(s.world.player.controlsLocked, false);
  // Habitantes: el Rey del Olvido y la mujer que coincide con tu madre; la estación se abre después de ambos.
  assert.equal(await h.act('n06_estacion'), false, 'Antes hay que hablar con los habitantes');
  await h.act('n06_habitante', { habitante: 'a' });
  assert.ok(h.dialogues.includes('n06_habitante_a'));
  assert.ok(!h.dialogues.includes('n06_habitantes_fin'));
  assert.equal(await h.act('n06_habitante', { habitante: 'a' }), true, 'Se puede repetir');
  assert.equal(h.state.ecos, config.rewards.habitante, 'Premio una sola vez');
  assert.equal(await h.act('n06_estacion'), false);
  await h.act('n06_habitante', { habitante: 'b' });
  assert.ok(h.dialogues.includes('n06_habitante_b') && h.dialogues.includes('n06_habitantes_fin'));
  assert.equal(h.state.flags['n06:habitantes_fin'], true);
  assert.ok(h.maria.some((t) => /Rey del Olvido/.test(t)));
  assert.equal(h.state.ecos, 2 * config.rewards.habitante);
  s.tick();
  assert.match(h.text, /estación/);
  // Salida: continúa al Nivel 7 (teleférico).
  assert.equal(await h.act('n06_estacion'), true);
  assert.ok(h.dialogues.includes('n06_estacion'));
  assert.equal(h.state.flags['n06:completo'], true);
  assert.ok(h.calls.some(([k]) => k === 'prepareCdmx2Entry'), 'prepara la entrada al Nivel 7');
  assert.ok(h.calls.some(([k, key]) => k === 'goto' && key === 'teleferico'), 'continúa al teleférico');
  assert.equal(h.state.ecos, 2 * config.rewards.habitante + config.rewards.estacion);
  h.emit('boss:calmed', {});
  await flush();
  assert.equal(h.dialogues.filter((id) => id === 'n06_nahuala_fin').length, 1, 'El cierre no se repite');
});

await test('Respaldo de la jefa: si la Nahuala no aparece, el nivel no se atasca', async () => {
  const h = harness();
  const s = await h.ready('reforma', { enemies: [] });
  await h.trigger('n06_nahuala_arena');
  s.tick();
  assert.equal(h.state.flags['n06:nahuala'], undefined);
  s.clock.now = config.respaldoJefeMs + 1000;
  s.tick();
  await flush();
  assert.equal(h.state.flags['n06:nahuala'], true);
  assert.ok(h.dialogues.includes('n06_nahuala_fin'));
  assert.ok(h.calls.some(([k]) => k === 'unlockArena'));
  assert.equal(await h.act('n06_habitante', { habitante: 'a' }), true);
});

await test('Si se muere tras vencer a la Nahuala, al reiniciar se retoma el cierre y los habitantes están visibles', async () => {
  const h = harness();
  h.state.learnedSpells.push('FUEGO', 'DESCANSO', 'VERDAD');
  h.state.flags['n06:nahuala'] = true;
  await h.ready('reforma', { enemies: [] });
  assert.ok(h.dialogues.includes('n06_nahuala_fin'));
  assert.ok(!h.dialogues.includes('n06_nahuala_intro'));
  assert.equal(h.sprites['reforma:n06_habitante_a'].visible, true);
  // Con todo hecho, un reinicio ya no repite nada y deja la estación disponible.
  const h2 = harness();
  h2.state.learnedSpells.push('FUEGO', 'DESCANSO', 'VERDAD');
  Object.assign(h2.state.flags, { 'n06:nahuala': true, 'n06:nahuala_fin': true, 'n06:habitantes_fin': true });
  await h2.ready('reforma', { enemies: [] });
  assert.ok(!h2.dialogues.includes('n06_nahuala_fin'));
  assert.equal(h2.sprites['reforma:n06_habitante_b'].visible, true);
  assert.equal(await h2.act('n06_estacion'), true);
  // Una vez vencida, el trigger de la arena no la reinicia.
  const before = h2.emitted.filter((e) => e.name === 'arena:start').length;
  await h2.trigger('n06_nahuala_arena');
  assert.equal(h2.emitted.filter((e) => e.name === 'arena:start').length, before);
});

await test('Muerte y reinstalación conservan el progreso: derrotados no reaparecen, emboscadas hechas y checkpoint', async () => {
  const h = harness();
  const level = levels.avenidas;
  const mkAll = () => level.enemies.map((e) => (e.type === 'muneca' ? h.doll(e.x, e.y) : e.type === 'nahual' ? h.nahual(e.x, e.y, { id: e.id }) :
    e.type === 'chaneque' ? h.chaneque(e.x, e.y) : h.hood(e.x, e.y)));
  h.state.learnedSpells.push('FUEGO', 'DESCANSO', 'VERDAD');
  const first = mkAll();
  const s1 = await h.ready('avenidas', { enemies: first });
  h.emit('cofradia:down', { enemy: first[0] });
  h.emit('cofradia:down', { enemy: { kind: 'encapuchado' } }); // no mapeado: se ignora
  h.purify(first[1]);
  h.purify(first[2]);
  await flush();
  const cp = h.state.checkpoint;
  assert.equal(Object.keys(h.state.flags).filter((k) => k.startsWith('n06:down:')).length, 3);
  s1.shutdown();
  const all = mkAll();
  const s2 = await h.ready('avenidas', { enemies: [...all] });
  assert.equal(h.state.checkpoint, cp);
  for (const i of [0, 1, 2]) assert.equal(all[i].alive, false, `El derrotado ${i} no reaparece`);
  assert.equal(all.filter((e) => e.alive).length, level.enemies.length - 3);
  s2.tick();
  // Emboscada hecha: sobrevive a morir.
  const hx = harness();
  hx.state.flags['n06:emb:muneca_a'] = true;
  hx.state.flags['n06:fuego'] = true;
  hx.state.learnedSpells.push('FUEGO');
  await hx.ready('xochimilco', { enemies: [] });
  await hx.trigger('n06_emb_a');
  assert.ok(!hx.emitted.some((e) => e.name === 'arena:start'));
});

await test('Orden del nivel de punta a punta con un mismo estado: ofrenda de FUEGO → avenidas → nahuales → Nahuala → estación', async () => {
  const h = harness();
  // 1. Xochimilco.
  let s = await h.ready('xochimilco', { enemies: [] });
  for (const g of ['n06_emb_a', 'n06_emb_b', 'n06_emb_c']) {
    await h.trigger(g);
    s.clock.now += config.emboscadas.respaldoMs + 500;
    s.tick();
  }
  await h.act('n06_fuego');
  await h.trigger('n06_a_avenidas');
  assert.deepEqual(h.calls.filter(([k]) => k === 'goto').at(-1), ['goto', 'avenidas', 'inicio']);
  s.shutdown();
  // 2. Avenidas.
  s = await h.ready('avenidas', { enemies: [] });
  assert.equal(h.state.checkpoint.section, 'avenidas');
  await h.act('n06_descanso');
  await h.act('n06_cronista');
  await h.trigger('n06_a_reforma');
  assert.deepEqual(h.calls.filter(([k]) => k === 'goto').at(-1), ['goto', 'reforma', 'inicio']);
  s.shutdown();
  // 3. Reforma.
  s = await h.ready('reforma', { enemies: [] });
  await h.trigger('n06_nahuala_arena');
  s.world.enemies.push(h.nahuala(2380, 290));
  h.emit('boss:calmed', {});
  await flush();
  await h.act('n06_habitante', { habitante: 'a' });
  await h.act('n06_habitante', { habitante: 'b' });
  await h.act('n06_estacion');
  assert.equal(h.state.flags['n06:completo'], true);
  for (const spell of ['FUEGO', 'DESCANSO', 'VERDAD']) assert.ok(h.state.learnedSpells.includes(spell));
  assert.equal(h.calls.filter(([k]) => k === 'learn').length, 3, 'Los tres conjuros se aprenden con el aprendizaje guiado');
});

await test('Entrada directa a una sección sin María prepara la entrada a la CDMX (para pruebas) y respeta el checkpoint propio', async () => {
  const h = harness({ hasMaria: false });
  await h.ready('xochimilco', { enemies: [] });
  assert.ok(h.calls.some(([k]) => k === 'prepareCdmxEntry'));
  assert.equal(h.state.checkpoint.section, 'xochimilco');
  assert.equal(h.state.section, 'xochimilco');
});

await test('Sin Maria.mariaSay, el comentario viaja por el bus (maria:say)', async () => {
  const h = harness({ withMariaApi: false });
  await h.ready('reforma', { enemies: [] });
  await h.act('n06_examinar', { descubrimiento: 'angel' });
  assert.ok(h.emitted.some((e) => e.name === 'maria:say' && /Ángel caído/.test(e.payload.text)));
});

await test('Descubrimientos y sobrevivientes: se premian una sola vez', async () => {
  const h = harness();
  await h.ready('avenidas');
  await h.act('n06_examinar', { descubrimiento: 'arco' });
  await h.act('n06_examinar', { descubrimiento: 'arco' });
  await h.act('n06_examinar', { descubrimiento: 'organillo' });
  await h.act('n06_examinar', { descubrimiento: 'sobreviviente_a' });
  assert.equal(h.state.ecos, 3 * config.rewards.descubrimiento);
  assert.ok(h.dialogues.includes('n06_sobreviviente_a'));
});

await test('Shutdown durante un diálogo no concede premios ni deja el mundo congelado', async () => {
  const h = harness();
  const s = await h.ready('xochimilco');
  h.hold('n06_fuego');
  await h.act('n06_fuego');
  assert.equal(s.world.timeScale, 0);
  s.shutdown();
  await h.release();
  assert.equal(h.state.ecos, 0);
  assert.equal(h.state.flags['n06:fuego'], undefined);
  assert.ok(!h.state.learnedSpells.includes('FUEGO'));
});

await test('Altar: cura, actualiza checkpoint y abre el menú del Altar', async () => {
  const h = harness();
  await h.ready('reforma', { enemies: [] });
  await h.act('altar');
  assert.equal(h.state.hp, h.state.maxHp);
  assert.equal(h.state.checkpoint.x, levels.reforma.spawns.altar.x);
  assert.ok(h.calls.some(([k, key]) => k === 'launch' && key === 'Altar'));
});

console.log(`\n${passed} pruebas del Nivel 6 correctas.`);
