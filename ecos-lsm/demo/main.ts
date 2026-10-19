/**
 * Página de prueba del módulo ecos-lsm (sin juego). `npm run dev` → http://localhost:5180
 * Sirve como EJEMPLO DE INTEGRACIÓN: todo lo que hace aquí es lo que hará el juego.
 */
import samplesJson from '../src/data/samples.json';
import {
  CameraView,
  HoldDetector,
  LETTERS,
  LsmEngine,
  SampleRecorder,
  checkWord,
  type SampleBank,
  type SpellSession,
} from '../src/index';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// --- Motor (una sola instancia en todo el juego) ---
const lsm = new LsmEngine({ samples: (samplesJson as { samples: SampleBank }).samples, tolerance: 0.5 });
lsm.preload().catch((e) => console.warn('El modelo no cargó todavía', e)); // como en el título del juego
const view = new CameraView(lsm.video);
const shield = new HoldDetector('U', { holdMs: 150 });
const recorder = new SampleRecorder((samplesJson as { samples: SampleBank }).samples);
let spell: SpellSession | null = null;

function placeView(): void {
  const r = $('camslot').getBoundingClientRect();
  if (lsm.cameraReady) view.show({ left: r.left, top: r.top, width: r.width, height: r.height });
}
window.addEventListener('resize', placeView);
window.addEventListener('scroll', placeView);

// --- Cámara ---
$('btnCam').addEventListener('click', async () => {
  if (lsm.cameraReady) {
    lsm.disableCamera();
    view.hide();
    $('btnCam').textContent = 'Activar cámara';
  } else {
    $('status').textContent = 'pidiendo permiso…';
    const ok = await lsm.enableCamera();
    if (!ok) {
      $('status').textContent = `sin cámara: ${lsm.errorReason} → se juega con teclado`;
      return;
    }
    $('btnCam').textContent = 'Apagar cámara';
    lsm.setMode('spell');
    placeView();
  }
});
$<HTMLInputElement>('tol').addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  lsm.setTolerance(v);
  $('tolv').textContent = v.toFixed(2);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'F3') {
    e.preventDefault();
    const c = $<HTMLInputElement>('chkDebug');
    c.checked = !c.checked;
  }
});

// --- Deletreo ---
function renderBoxes(): void {
  const box = $('boxes');
  box.innerHTML = '';
  if (!spell) return;
  spell.letters.forEach((l, i) => {
    const s = document.createElement('span');
    s.textContent = l;
    const r = spell!.results[i];
    s.className = r ?? (i === spell!.index ? 'cur' : '');
    box.appendChild(s);
  });
}
$<HTMLInputElement>('word').addEventListener('input', (e) => {
  const c = checkWord((e.target as HTMLInputElement).value);
  $('wordCheck').innerHTML = c.ok
    ? `✔ ${c.letters.join('')}`
    : `<span class="warn">${c.unsupported.length ? `sin cámara: ${c.unsupported.join(', ')}` : c.tooLong ? 'más de 10 letras' : 'vacío'}</span>`;
});
$('btnSpell').addEventListener('click', () => {
  shieldBox().checked = false;
  shield.suspended = true; // mientras se deletrea, el escudo no cuenta (la U aparece en LUZ)
  lsm.setMode('spell');
  spell = lsm.startSpell($<HTMLInputElement>('word').value, performance.now());
  renderBoxes();
  $('btnSpell').blur();
});
window.addEventListener('keydown', (e) => {
  if (!spell || spell.done || e.target instanceof HTMLInputElement) return;
  if (e.key === 'Escape') spell.cancel(performance.now());
  else if (spell.typeLetter(e.key, performance.now())) renderBoxes();
});

// --- Escudo ---
const shieldBox = () => $<HTMLInputElement>('chkShield');
shieldBox().addEventListener('change', () => {
  shield.reset();
  shield.suspended = !shieldBox().checked;
  lsm.setMode(shieldBox().checked ? 'shield' : 'spell');
});

// --- Grabadora k-NN ---
$('btnRec').addEventListener('click', () => {
  if (!lsm.cameraReady) return alert('Activa la cámara primero.');
  recorder.start($<HTMLInputElement>('recLetter').value || 'S', 30);
});
$('btnSave').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([recorder.toJSON()], { type: 'application/json' }));
  a.download = 'samples.json';
  a.click();
});

// --- Pruebas sintéticas (las mismas de npm test) ---
$('btnTests').addEventListener('click', async () => {
  const t = await import('../test/syntheticHands');
  $('tests').textContent = [0.15, 0.5, 0.9].map((tol) => `tol ${tol}: ${t.runRulesTest(tol).split('\n')[0]}`).join('\n') + '\n' + t.runMotionTest();
});

// --- Bucle principal (en el juego: el update de la escena) ---
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const statusTxt = lsm.cameraReady ? `cámara lista · modo ${lsm.detectionMode}` : lsm.status === 'cargando' ? 'cargando…' : $('status').textContent!;
  $('status').textContent = statusTxt;
  $('status').classList.toggle('on', lsm.cameraReady);

  // Deletreo
  if (spell && !spell.done) {
    const r = lsm.cameraReady ? lsm.stepSpell(spell, now) : spell.update(now, null, 0);
    if (r) renderBoxes();
    $('timeBar').style.width = `${spell.timeLeft(now) * 100}%`;
    $('holdBar').style.width = `${spell.holdProgress * 100}%`;
    const cur = spell.current;
    if (cur) $('spellInfo').textContent = `Haz la ${cur}: ${LETTERS[cur]?.desc ?? ''}`;
  }
  // El deletreo puede terminar por cámara, por tiempo o por teclado: se reporta una sola vez.
  if (spell && spell.done) {
    const res = spell.result();
    renderBoxes();
    $('spellInfo').textContent = `Resultado: ${res.outcome === 'perfect' ? '¡PERFECTO!' : res.outcome === 'fail' ? 'falló' : `${Math.round(res.fraction * 100)} %`} · fuerza ${res.power.toFixed(2)}`;
    shield.suspended = !shieldBox().checked;
    spell = null;
  } else if (!spell) {
    const p = lsm.read(now);
    if (shieldBox().checked) {
      const on = shield.update(p, now);
      $('shield').textContent = on ? 'ACTIVO' : 'apagado';
      $('shield').classList.toggle('on', on);
    }
  }

  // Grabadora
  if (recorder.recording && recorder.push(lsm.tracker.lastFrame)) {
    lsm.classifier.knn.setBank(recorder.bank); // usar las muestras nuevas de inmediato
  }
  $('recInfo').textContent = recorder.recording
    ? `● grabando ${recorder.letter}: faltan ${recorder.pending}`
    : `Muestras: ${Object.entries(recorder.counts()).map(([l, n]) => `${l}:${n}`).join('  ') || '(ninguna)'}`;

  // Lectura en vivo
  const last = lsm.last;
  $('letter').textContent = lsm.cameraReady ? (last?.letter ?? '—') : '—';
  const dbg = $<HTMLInputElement>('chkDebug').checked;
  if (lsm.cameraReady) {
    if (dbg) view.drawLandmarks(lsm.tracker.lastFrame);
    else view.clear();
    const e = lsm.explain();
    const s = lsm.stats();
    $('live').textContent = e
      ? `reglas: ${e.top}\n${dbg ? `${e.metrics}\n${e.motion}\n` : ''}detección ${s.detectHz.toFixed(1)} Hz · ${s.latencyMs.toFixed(1)} ms`
      : 'Muestra tu mano a la cámara';
  }
}
requestAnimationFrame(frame);
