/**
 * Pruebas del módulo (sin cámara ni navegador): `npm test`.
 * Manos y trayectorias SINTÉTICAS: detectan errores de lógica u orientación,
 * NO miden la precisión con manos reales (eso se prueba con la página demo y la cámara).
 */
import { HoldDetector } from '../src/core/HoldDetector';
import { checkWord, spellLetters } from '../src/core/letters';
import { SpellSession } from '../src/core/SpellSession';
import { runMotionTest, runRulesTest } from './syntheticHands';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function ratio(report: string): [number, number] {
  const m = report.match(/^(\d+)\/(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 1];
}

console.log('\n== Reglas geométricas (manos sintéticas, 6 posturas × 2 manos) ==');
for (const tol of [0.15, 0.5, 0.9]) {
  const r = runRulesTest(tol);
  const [ok, total] = ratio(r);
  check(`tolerancia ${tol}: ${ok}/${total}`, ok === total, ok === total ? '' : '\n' + r.split('\n').filter((l) => l.includes('✘')).join('\n'));
}

console.log('\n== Letras con movimiento (Z por trayectoria) ==');
{
  const r = runMotionTest();
  const [ok, total] = ratio(r);
  check(`trayectorias ${ok}/${total}`, ok === total, ok === total ? '' : '\n' + r);
}

console.log('\n== Sesión de deletreo ==');
{
  // Teclado rápido y correcto → PERFECTO
  let t = 0;
  const s = new SpellSession('Calma', t);
  for (const ch of 'calma') s.typeLetter(ch, (t += 300));
  const r = s.result();
  check('teclado rápido → perfecto', r.outcome === 'perfect' && r.fraction === 1, JSON.stringify(r));
}
{
  // Cámara: sostener la letra 300 ms confirma; si nunca aparece, la ventana vence
  const s = new SpellSession('LUZ', 0);
  let r = s.update(100, 'L', 100);
  check('seña sostenida 100 ms aún no confirma', r === null && s.holdProgress > 0.3 && s.holdProgress < 0.4);
  r = s.update(320, 'L', 320);
  check('seña sostenida 300 ms confirma', r === 'ok' && s.current === 'U');
  r = s.update(320 + 3001, null, 0);
  check('ventana vencida → fallo de la letra', r === 'miss' && s.current === 'Z');
  // La Z (movimiento) tiene ventana ×1.6
  r = s.update(320 + 3001 + 4000, null, 0);
  check('la Z tiene 1.6× de ventana (a los 4 s sigue abierta)', r === null);
  r = s.update(320 + 3001 + 4400, 'Z', 400);
  const res = s.result();
  check('LUZ con 2/3 → parcial', r === 'ok' && res.outcome === 'partial' && Math.abs(res.fraction - 2 / 3) < 1e-9, JSON.stringify(res));
}
{
  const s = new SpellSession('PAZ', 0);
  s.typeLetter('x', 100);
  s.typeLetter('x', 200);
  s.typeLetter('z', 300);
  check('menos de 50 % → falla con fuerza 0', s.result().outcome === 'fail' && s.result().power === 0);
  const c = new SpellSession('SOL', 0);
  c.cancel(50);
  check('cancelar → todas fallidas', c.done && c.result().correct === 0);
  const k = new SpellSession('SOL', 0);
  check('teclas que no son letras se ignoran', k.typeLetter('1', 10) === null && k.index === 0);
}

console.log('\n== Escudo (seña sostenida en tiempo real) ==');
{
  const d = new HoldDetector('U', { holdMs: 150, releaseMs: 120 });
  check('U 100 ms → aún apagado', d.update({ letter: 'U', stableMs: 100 }, 100) === false);
  check('U 150 ms → encendido', d.update({ letter: 'U', stableMs: 150 }, 150) === true);
  check('parpadeo de 80 ms → sigue encendido', d.update({ letter: null, stableMs: 0 }, 200) && d.update({ letter: null, stableMs: 0 }, 280));
  d.update({ letter: 'U', stableMs: 20 }, 290);
  d.update({ letter: 'V', stableMs: 0 }, 300);
  check('otra letra > 120 ms → apagado', d.update({ letter: 'V', stableMs: 130 }, 430) === false);
  d.suspended = true;
  check('suspendido (deletreando) → apagado aunque haya U', d.update({ letter: 'U', stableMs: 999 }, 500) === false);
}

console.log('\n== Validación de conjuros (GDD 6.6 y catálogo de NIVELES_ECOS.md) ==');
{
  // Catálogo completo de docs/NIVELES_ECOS.md §2 (historia + propuestas)
  for (const w of ['CALMA', 'PROTECCIÓN', 'VOZ', 'LUZ', 'SOL', 'MEMORIA', 'VERDAD', 'FUEGO', 'DESCANSO', 'CONSUELO', 'PAZ', 'MAMA', 'ECOS']) {
    const c = checkWord(w);
    check(`${w} → ${c.letters.join('')}`, c.ok, JSON.stringify(c));
  }
  check('acentos se ignoran', spellLetters('Protección').join('') === 'PROTECCION');
  check('la Ñ no se confunde con N', checkWord('NIÑO').unsupported.includes('Ñ'));
  check('J y X no soportadas', checkWord('JAX').unsupported.join('') === 'JX');
  check('Q no soportada (excluida en el GDD)', checkWord('QUESO').unsupported.includes('Q'));
  check('más de 10 letras → inválido', checkWord('ABCDEFGHILM').tooLong);
}

console.log(`\n${failures ? `✘ ${failures} prueba(s) fallaron` : '✔ Todas las pruebas pasaron'}\n`);
process.exit(failures ? 1 : 0);
