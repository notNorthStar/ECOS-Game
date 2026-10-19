import { normalizeLandmarks } from '../src/core/features';
import { RulesStrategy } from '../src/core/rules';
import { SignClassifier } from '../src/core/SignClassifier';
import type { Landmark } from '../src/core/types';

/**
 * Prueba de las reglas con manos SINTÉTICAS: `npm test` (ver test/run.ts).
 * Construye 21 puntos con la forma de cada letra (según letters.json), los rota
 * (inclinada en la imagen y de lado) y prueba mano derecha e izquierda.
 * Sirve para detectar errores de lógica u orientación; NO mide la precisión con manos reales.
 */
type St = 'ext' | 'curl' | 'touch' | 'curve' | 'hook' | 'hook2' | 'cam' | 'crossL' | 'crossR' | 'meetL' | 'meetR' | 'spread';
type Th = 'ext' | 'side' | 'across' | 'up' | 'touch' | 'cOpp' | 'low' | 'lowTouch' | 'lowO' | 'high' | 'lowTouch2' | 'tuck';

const W = { x: 0.5, y: 0.8 };
const MCP: Record<string, [number, number]> = { index: [0.54, 0.62], middle: [0.5, 0.615], ring: [0.46, 0.62], pinky: [0.42, 0.64] };
const THUMB: Record<Th, number[][]> = {
  ext: [[0.56, 0.76], [0.61, 0.7], [0.66, 0.66], [0.71, 0.63]],
  side: [[0.56, 0.76], [0.61, 0.71], [0.66, 0.68], [0.71, 0.66]],
  across: [[0.56, 0.76], [0.58, 0.69], [0.55, 0.64], [0.5, 0.625]],
  up: [[0.56, 0.76], [0.585, 0.7], [0.59, 0.63], [0.59, 0.575]],
  touch: [[0.56, 0.76], [0.6, 0.7], [0.6, 0.62], [0.565, 0.55]],
  cOpp: [[0.56, 0.76], [0.59, 0.71, -0.03], [0.58, 0.68, -0.06], [0.56, 0.66, -0.08]],
  // E: pulgar doblado abajo, a la altura de los nudillos (con o sin contacto con las puntas)
  low: [[0.56, 0.76], [0.58, 0.71, -0.02], [0.56, 0.675, -0.03], [0.52, 0.665, -0.03]],
  lowTouch: [[0.56, 0.76], [0.58, 0.7, -0.03], [0.56, 0.65, -0.05], [0.53, 0.635, -0.06]],
  // O chica: la punta del pulgar sube solo un poco arriba de los nudillos
  // E del equipo: pulgar abajo de los nudillos, tocando las puntas
  lowTouch2: [[0.56, 0.76], [0.58, 0.71, -0.03], [0.555, 0.665, -0.05], [0.53, 0.645, -0.06]],
  // T: pulgar metido entre índice y medio, con la punta asomando arriba
  tuck: [[0.56, 0.76], [0.575, 0.69, -0.03], [0.55, 0.63, -0.05], [0.52, 0.57, -0.06]],
  // P: la punta del pulgar sube entre índice y medio
  high: [[0.56, 0.76], [0.58, 0.69, -0.03], [0.55, 0.62, -0.05], [0.52, 0.56, -0.06]],
  lowO: [[0.56, 0.76], [0.59, 0.7, -0.03], [0.58, 0.635, -0.05], [0.555, 0.585, -0.06]],
};

function finger(name: string, st: St, thumbTip: Landmark): Landmark[] {
  const [x, y] = MCP[name];
  const P = (dx: number, dy: number, dz = 0) => ({ x: x + dx, y: y + dy, z: dz });
  const s = name === 'index' ? 1 : -1;
  switch (st) {
    case 'ext': return [P(0, 0), P(0, -0.065), P(0, -0.105), P(0, -0.14)];
    case 'curl': return [P(0, 0), P(0, -0.045, -0.03), P(0, -0.015, -0.05), P(0, 0.015, -0.03)];
    case 'touch': return [P(0, 0), P(0.005, -0.05, -0.03), P(0.02, -0.075, -0.05), { x: thumbTip.x - 0.005, y: thumbTip.y - 0.005, z: -0.04 }];
    case 'hook': return [P(0, 0), P(0, -0.05, -0.03), P(0, -0.04, -0.07), P(0, -0.015, -0.08)];
    // Gancho más cerrado, como la E del equipo (alcance ≈1.09)
    case 'hook2': return [P(0, 0), P(0, -0.05, -0.03), P(0, -0.035, -0.07), P(0, -0.005, -0.07)];
    // Índice apuntando HACIA LA CÁMARA: se ve corto (MediaPipe subestima la profundidad)
    case 'cam': return [P(0, 0), P(0, -0.012, -0.02), P(0, -0.016, -0.035), P(0, -0.018, -0.045)];
    case 'curve': return [P(0, 0), P(0, -0.055, -0.03), P(0, -0.07, -0.07), P(0, -0.05, -0.1)];
    case 'crossL': return [P(0, 0), P(-0.015, -0.065), P(-0.035, -0.105), P(-0.055, -0.14)];
    // Puntas de índice y medio apenas alineadas (cruce leve)
    case 'meetL': return [P(0, 0), P(-0.01, -0.065), P(-0.025, -0.105), P(-0.035, -0.14)];
    case 'meetR': return [P(0, 0), P(0.002, -0.065), P(0.004, -0.105), P(0.005, -0.14)];
    case 'crossR': return [P(0, 0), P(0.012, -0.065), P(0.025, -0.105), P(0.035, -0.14)];
    case 'spread': return [P(0, 0), P(0.02 * s, -0.065), P(0.035 * s, -0.105), P(0.05 * s, -0.14)];
  }
}

function hand(thumb: Th, f: Record<'index' | 'middle' | 'ring' | 'pinky', St>): Landmark[] {
  const lm: Landmark[] = [{ x: W.x, y: W.y, z: 0 }];
  for (const [x, y, z = 0] of THUMB[thumb]) lm.push({ x, y, z });
  const tip = lm[4];
  for (const n of ['index', 'middle', 'ring', 'pinky'] as const) lm.push(...finger(n, f[n], tip));
  return lm;
}

const all = (s: St) => ({ index: s, middle: s, ring: s, pinky: s });
const CASES: Record<string, Landmark[]> = {
  S: hand('across', all('curl')),
  T: hand('tuck', { index: 'hook', middle: 'curl', ring: 'curl', pinky: 'curl' }),
  A: hand('up', all('curl')),
  'A (pulgar al costado)': hand('side', all('curl')),
  O: hand('touch', all('touch')),
  // Como en la cámara del equipo: círculo chico y bajo (el contacto queda casi a la altura de los nudillos)
  'O (círculo bajo)': hand('lowO', { index: 'touch', middle: 'touch', ring: 'curve', pinky: 'curve' }),
  C: hand('cOpp', all('curve')),
  E: hand('low', all('hook')),
  'E (puntas tocando el pulgar)': hand('lowTouch', all('hook')),
  'E (como en la cámara del equipo)': hand('lowTouch2', all('hook2')),
  L: hand('ext', { index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' }),
  F: hand('touch', { index: 'touch', middle: 'ext', ring: 'ext', pinky: 'ext' }),
  R: hand('across', { index: 'crossL', middle: 'crossR', ring: 'curl', pinky: 'curl' }),
  // P: el medio se abre lejos del índice (en la cámara del equipo la separación fue 0.84–1.02)
  P: hand('high', { index: 'spread', middle: 'spread', ring: 'curl', pinky: 'curl' }),
  'R (cruce leve)': hand('across', { index: 'meetL', middle: 'meetR', ring: 'curl', pinky: 'curl' }),
  // Como en la cámara del equipo: R con el pulgar algo levantado (antes salía P)
  'R (pulgar alto)': hand('high', { index: 'crossL', middle: 'crossR', ring: 'curl', pinky: 'curl' }),
  U: hand('across', { index: 'ext', middle: 'ext', ring: 'curl', pinky: 'curl' }),
  V: hand('across', { index: 'spread', middle: 'spread', ring: 'curl', pinky: 'curl' }),
  B: hand('across', all('ext')),
  W: hand('across', { index: 'spread', middle: 'ext', ring: 'spread', pinky: 'curl' }),
  // G y H: la L y la U giradas 90° (el índice apunta de lado)
  G: rotate(hand('ext', { index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' }), -Math.PI / 2, 0),
  H: rotate(hand('across', { index: 'ext', middle: 'ext', ring: 'curl', pinky: 'curl' }), -Math.PI / 2, 0),
  'H (pulgar arriba)': rotate(hand('high', { index: 'ext', middle: 'ext', ring: 'curl', pinky: 'curl' }), -Math.PI / 2, 0),
  // M y N: tres o dos dedos hacia abajo (la mano girada 180°)
  M: rotate(hand('across', { index: 'ext', middle: 'ext', ring: 'ext', pinky: 'curl' }), Math.PI, 0),
  'M (anular semidoblado)': rotate(hand('across', { index: 'ext', middle: 'ext', ring: 'curve', pinky: 'curl' }), Math.PI, 0),
  N: rotate(hand('across', { index: 'ext', middle: 'ext', ring: 'curl', pinky: 'curl' }), Math.PI, 0),
  // Como en la cámara del equipo: anular y meñique doblados pero "colgando" (llegan lejos)
  'N (anular y meñique colgando)': rotate(hand('across', { index: 'ext', middle: 'ext', ring: 'curve', pinky: 'curve' }), Math.PI, 0),
  I: hand('across', { index: 'curl', middle: 'curl', ring: 'curl', pinky: 'ext' }),
  Y: hand('ext', { index: 'curl', middle: 'curl', ring: 'curl', pinky: 'ext' }),
};

/** Rota alrededor de la muñeca: roll (en el plano de la imagen) y yaw (mano de lado). */
function rotate(lm: Landmark[], roll: number, yaw: number): Landmark[] {
  return lm.map((p) => {
    let x = p.x - W.x;
    let y = p.y - W.y;
    let z = p.z;
    [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
    [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    return { x: x + W.x, y: y + W.y, z };
  });
}

const POSES: Array<[number, number]> = [[0, 0], [0.44, 0], [-0.44, 0], [0, 0.7], [0, -0.7], [0.3, 0.5]];

export function runRulesTest(tolerance = 0.5): string {
  const rules = new RulesStrategy();
  const rows: string[] = [];
  let ok = 0;
  let total = 0;
  for (const [name, base] of Object.entries(CASES)) {
    const want = name[0];
    const fails: string[] = [];
    for (const side of ['der', 'izq'] as const)
      for (const [roll, yaw] of POSES) {
        let lm = rotate(base, roll, yaw);
        if (side === 'izq') lm = lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
        // Con video sin espejo, MediaPipe etiqueta la mano real.
        const pred = rules.predict(normalizeLandmarks(lm, side === 'der' ? 'Right' : 'Left'), lm, tolerance);
        total++;
        if (pred.letter === want) ok++;
        else fails.push(`${side} giro${Math.round((roll * 180) / Math.PI)}° lado${Math.round((yaw * 180) / Math.PI)}° → ${pred.letter ?? '—'}`);
      }
    rows.push(`${name}: ${fails.length ? '✘ ' + fails.join(', ') : `✔ ${POSES.length * 2}/${POSES.length * 2}`}`);
  }
  return `${ok}/${total} correctas\n${rows.join('\n')}`;
}

// ---------------------------------------------------------------- letras con movimiento (Z)

/**
 * Prueba del reconocedor de trayectoria: una mano "apuntando" se desplaza cuadro a cuadro (18 Hz)
 * siguiendo un camino visto DESDE QUIEN SEÑA (ux, uy); la imagen llega sin espejo (x = 1 − ux).
 */
export function runMotionTest(): string {
  const pointing = hand('across', { index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' });
  const pointingCam = hand('across', { index: 'cam', middle: 'curl', ring: 'curl', pinky: 'curl' });
  const tip0 = pointing[8];
  // camFrom: fracción del trazo desde la que el índice apunta hacia la cámara (como en la prueba real)
  const framesAlong = (path: Array<[number, number]>, seconds: number, mirrorHand = false, camFrom = 2) => {
    const n = Math.round(seconds * 18);
    const segLens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
    const total = segLens.reduce((a, b) => a + b, 0);
    const out: Landmark[][] = [];
    for (let k = 0; k <= n; k++) {
      let d = (k / n) * total;
      let i = 0;
      while (i < segLens.length - 1 && d > segLens[i]) d -= segLens[i++];
      const f = Math.min(1, d / (segLens[i] || 1));
      const ux = path[i][0] + (path[i + 1][0] - path[i][0]) * f;
      const uy = path[i][1] + (path[i + 1][1] - path[i][1]) * f;
      const dx = 1 - ux - tip0.x;
      const dy = uy - tip0.y;
      const base = k / n >= camFrom ? pointingCam : pointing;
      let lm = base.map((p) => ({ x: p.x + dx, y: p.y + dy, z: p.z }));
      if (mirrorHand) {
        // mano izquierda: reflejamos la forma alrededor de la punta del índice (la trayectoria no cambia)
        const t = lm[8];
        lm = lm.map((p) => ({ x: 2 * t.x - p.x, y: p.y, z: p.z }));
      }
      out.push(lm);
    }
    return out;
  };
  const Z: Array<[number, number]> = [[0.35, 0.25], [0.65, 0.25], [0.35, 0.55], [0.65, 0.55]];
  const scale = (p: Array<[number, number]>, k: number, cx = 0.5, cy = 0.4) => p.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as [number, number]);
  const cases: Array<{ name: string; frames: Landmark[][]; hand: 'Right' | 'Left'; want: boolean }> = [
    { name: 'Z normal (1.2 s)', frames: framesAlong(Z, 1.2), hand: 'Right', want: true },
    { name: 'Z lenta (2 s)', frames: framesAlong(Z, 2.0), hand: 'Right', want: true },
    { name: 'Z rápida (0.7 s)', frames: framesAlong(Z, 0.7), hand: 'Right', want: true },
    { name: 'Z chica', frames: framesAlong(scale(Z, 0.6), 1.0), hand: 'Right', want: true },
    { name: 'Z mano izquierda', frames: framesAlong(Z, 1.2, true), hand: 'Left', want: true },
    { name: 'Z con el índice hacia la cámara en la 2.ª mitad', frames: framesAlong(Z, 1.4, false, 0.45), hand: 'Right', want: true },
    { name: 'Z algo chueca', frames: framesAlong([[0.35, 0.27], [0.66, 0.23], [0.37, 0.56], [0.64, 0.53]], 1.2), hand: 'Right', want: true },
    { name: '✗ línea recta', frames: framesAlong([[0.3, 0.4], [0.7, 0.4]], 1.0), hand: 'Right', want: false },
    { name: '✗ Z al revés (espejo)', frames: framesAlong(Z.map(([x, y]) => [1 - x, y] as [number, number]), 1.2), hand: 'Right', want: false },
    { name: '✗ círculo', frames: framesAlong(Array.from({ length: 13 }, (_, i) => [0.5 + 0.15 * Math.cos((i / 12) * Math.PI * 2), 0.4 + 0.15 * Math.sin((i / 12) * Math.PI * 2)] as [number, number]), 1.4), hand: 'Right', want: false },
    { name: '✗ mano quieta', frames: framesAlong([[0.5, 0.4], [0.5, 0.4]], 1.5), hand: 'Right', want: false },
    { name: '✗ zigzag vertical', frames: framesAlong([[0.4, 0.2], [0.4, 0.6], [0.5, 0.2], [0.5, 0.6]], 1.2), hand: 'Right', want: false },
  ];
  const rows: string[] = [];
  let ok = 0;
  for (const c of cases) {
    const cls = new SignClassifier({});
    let got = false;
    c.frames.forEach((lm, k) => {
      const p = cls.update({ landmarks: lm, handedness: c.hand, latencyMs: 0, timestamp: k * 55 }, k * 55, 'Z');
      if (p.letter === 'Z' && p.stableMs >= 300) got = true;
    });
    const pass = got === c.want;
    if (pass) ok++;
    rows.push(`${pass ? '✔' : '✘'} ${c.name} → ${got ? 'Z' : 'nada'}`);
  }
  return `${ok}/${cases.length} trayectorias correctas\n${rows.join('\n')}`;
}