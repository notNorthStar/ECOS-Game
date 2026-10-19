import { pt } from './features';
import type { Landmark, LetterStrategy, Prediction } from './types';
import { LM } from './types';

/**
 * Clasificador por reglas geométricas.
 *
 * Todo se mide en el MARCO DE LA PROPIA MANO (no en el de la imagen):
 *   - eje "arriba": de la muñeca al nudillo del dedo medio,
 *   - eje "lado":   del nudillo del meñique al del índice (hacia el pulgar),
 * con la unidad = largo de la palma. Así inclinar o girar la mano no cambia las medidas
 * (antes la I pedía la mano perfectamente recta, la Y solo salía girada y la O nunca salía,
 * porque con la mano de lado el ancho de la palma "se aplastaba" en la imagen).
 *
 * Cada letra se puntúa con lógica difusa (0..1) y gana la más alta.
 * Las formas siguen letters.json (pendientes de verificación humana).
 * Las letras con movimiento (por ahora la Z) se reconocen por trayectoria en motion.ts.
 */

/** Rampa lineal: 0 por debajo de a, 1 por encima de b. */
function ramp(v: number, a: number, b: number): number {
  if (a === b) return v >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (v - a) / (b - a)));
}
const sub = (a: Landmark, b: Landmark): Landmark => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Landmark, b: Landmark) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Landmark) => Math.hypot(a.x, a.y, a.z);
const scale = (a: Landmark, k: number): Landmark => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const norm = (a: Landmark) => scale(a, 1 / (len(a) || 1));
const dist = (a: Landmark, b: Landmark) => len(sub(a, b));

/** Punto en coordenadas de la mano: side (hacia el pulgar), up (hacia los dedos). */
interface HandPt {
  side: number;
  up: number;
  p: Landmark; // posición 3D original (para distancias)
}

interface FingerInfo {
  ext: number; // 0..1 qué tan estirado
  curl: number; // 0..1 qué tan cerrado contra la palma
  reach: number; // distancia muñeca→punta / muñeca→nudillo
  tip: HandPt;
  mcp: HandPt;
}

const FINGERS = {
  index: [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP],
  middle: [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP],
  ring: [LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP],
  pinky: [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP],
} as const;

type FingerName = keyof typeof FINGERS;

export function analyzeHand(f: Float32Array) {
  const wrist = pt(f, LM.WRIST);
  const indexMcp = pt(f, LM.INDEX_MCP);
  const middleMcp = pt(f, LM.MIDDLE_MCP);
  const pinkyMcp = pt(f, LM.PINKY_MCP);
  // Marco de la mano
  const up = norm(sub(middleMcp, wrist));
  const s0 = sub(indexMcp, pinkyMcp);
  const side = norm(sub(s0, scale(up, dot(s0, up))));
  const toHand = (p: Landmark): HandPt => {
    const r = sub(p, wrist);
    return { side: dot(r, side), up: dot(r, up), p };
  };
  const palmWidth = len(s0) || 0.6;

  const fingers = {} as Record<FingerName, FingerInfo>;
  for (const name of Object.keys(FINGERS) as FingerName[]) {
    const [a, b, c, d] = FINGERS[name].map((i) => pt(f, i));
    const path = dist(a, b) + dist(b, c) + dist(c, d);
    const straight = dist(a, d) / (path || 1);
    const reach = dist(wrist, d) / (dist(wrist, a) || 1);
    fingers[name] = {
      ext: ramp(straight, 0.7, 0.86) * ramp(reach, 1.2, 1.5),
      curl: 1 - ramp(reach, 1.0, 1.3),
      reach,
      tip: toHand(d),
      mcp: toHand(a),
    };
  }

  const tCmc = pt(f, LM.THUMB_CMC);
  const tMcp = pt(f, LM.THUMB_MCP);
  const tIp = pt(f, LM.THUMB_IP);
  const tTip = pt(f, LM.THUMB_TIP);
  const thumbTip = toHand(tTip);
  const iM = fingers.index.mcp;
  // Qué tanto sobresale la punta del pulgar hacia afuera del nudillo del índice (en anchos de palma):
  //   > 0  pulgar al costado (A, L, Y)      < 0  pulgar sobre la palma o los dedos (S, B, E)
  const sideRel = (thumbTip.side - iM.side) / palmWidth;
  const thumbOut = ramp(sideRel, 0.1, 0.4);
  const thumbAcross = ramp(-sideRel, 0.05, 0.3);
  const thumbUp = ramp(thumbTip.up - iM.up, -0.1, 0.2);
  const thumbStraight = dist(tCmc, tTip) / (dist(tCmc, tMcp) + dist(tMcp, tIp) + dist(tIp, tTip) || 1);
  // Pulgar estirado: recto y con la punta lejos del nudillo del índice (en cualquier dirección)
  const thumbExt = Math.min(ramp(thumbStraight, 0.78, 0.9), ramp(dist(tTip, iM.p), 0.45, 0.75));

  // Las ÚNICAS medidas en el marco de la IMAGEN: hacia dónde apunta el índice.
  // Distinguen formas que solo cambian de orientación: L/G, U/H (de lado) y U/N, M (hacia abajo).
  const iTip = pt(f, LM.INDEX_TIP);
  const dirX = Math.abs(iTip.x - indexMcp.x);
  const dirY = Math.abs(iTip.y - indexMcp.y);
  const pointsSideways = ramp(dirX / (dirY + 1e-6), 1.0, 1.7);
  // Hacia abajo (y de la imagen crece hacia abajo): M y N son formas conocidas apuntando al suelo.
  const down = iTip.y - indexMcp.y;
  const pointsDown = down > 0 ? ramp(down / (dirX + 1e-6), 1.0, 1.7) : 0;

  return { fingers, thumbTip, thumbOut, thumbAcross, thumbUp, thumbExt, sideRel, palmWidth, pointsSideways, pointsDown };
}

export type HandAnalysis = ReturnType<typeof analyzeHand>;

const and = (...v: number[]) => Math.min(...v);
const not = (v: number) => 1 - v;

export function scoreLetters(h: HandAnalysis, tolerance: number): Record<string, number> {
  const { fingers: F, thumbTip, thumbOut, thumbAcross, thumbUp, thumbExt, pointsSideways, pointsDown } = h;
  // Ni de lado ni hacia abajo: la orientación normal (L, U, V, R, B)
  const upright = and(not(pointsSideways), not(pointsDown));
  // Distancias en "largos de palma" (independientes de la rotación)
  const tipDist = (p: HandPt) => dist(thumbTip.p, p.p);
  const touch = (p: HandPt) => 1 - ramp(tipDist(p), 0.2 + tolerance * 0.1, 0.42 + tolerance * 0.15);
  // Pinza firme: yema del índice contra yema del pulgar (la O, aunque el círculo quede bajo)
  const pinch = 1 - ramp(tipDist(F.index.tip), 0.15 + tolerance * 0.05, 0.3 + tolerance * 0.1);
  const allCurled = and(F.index.curl, F.middle.curl, F.ring.curl, F.pinky.curl);
  const noneExt = and(not(F.index.ext), not(F.middle.ext), not(F.ring.ext), not(F.pinky.ext));
  const imGap = dist(F.index.tip.p, F.middle.tip.p);
  // Cruce índice/medio (R): las puntas cambian de orden respecto a los nudillos en el eje "lado".
  const dMcp = F.index.mcp.side - F.middle.mcp.side || 0.2;
  const tipOrder = (F.index.tip.side - F.middle.tip.side) / dMcp; // ~1 paralelos, ≤0 cruzados
  // Cruce completo en cuanto las puntas se alinean (tipOrder 0); dedos paralelos (U) quedan en ~0.6–1.
  const crossed = ramp(-tipOrder, -0.4 - tolerance * 0.15, 0);
  const twoUp = and(F.index.ext, F.middle.ext, not(F.ring.ext), not(F.pinky.ext));
  // Dedos curvos, ni estirados ni cerrados contra la palma (C, O)
  const curved = (fi: FingerInfo) => and(not(fi.ext), ramp(fi.reach, 0.95, 1.15));
  const fourCurved = and(curved(F.index), curved(F.middle), curved(F.ring) * 0.5 + 0.5);
  // Altura de la punta del pulgar respecto a los nudillos (eje "arriba" de la mano):
  //   O → índice y pulgar se juntan ARRIBA de los nudillos (círculo hueco)
  //   E → el pulgar queda abajo, a la altura de los nudillos, y las puntas descansan encima
  const thumbHeight = thumbTip.up - F.index.mcp.up;
  const thumbLow = 1 - ramp(thumbHeight, 0.05, 0.2);
  // Pulgar ALTO: su punta sube entre índice y medio, a la altura de los dedos (P). En R, U y V queda abajo.
  const thumbHigh = ramp(thumbHeight, 0.15, 0.3);
  // Pulgar metido entre índice y medio con la punta arriba (T)
  const thumbTucked = ramp(thumbHeight, 0.15, 0.25);
  const tipsAboveThumb = and(ramp(F.index.tip.up - thumbTip.up, -0.05, 0.08), ramp(F.middle.tip.up - thumbTip.up, -0.08, 0.05));
  // Dedos en gancho: ni estirados ni hundidos en la palma (puño de la S/A)
  const hooked = (fi: FingerInfo) => and(not(fi.ext), ramp(fi.reach, 0.9, 1.02));
  // Qué tan arriba de su nudillo queda la punta del índice: E baja hasta los nudillos; C se queda arriba.
  const indexTipHigh = ramp(F.index.tip.up - F.index.mcp.up, 0.15, 0.25);
  // Anular RELATIVO a tus propios dedos: 1 = llega como el medio (estirado), 0 = como el meñique (cerrado).
  // Un corte absoluto fallaba con la mano hacia abajo: los dedos doblados cuelgan y aun así "llegan lejos".
  const ringRel = (F.ring.reach - F.pinky.reach) / Math.max(0.05, F.middle.reach - F.pinky.reach);
  const pinkyFolded = ramp(F.middle.reach - F.pinky.reach, 0.1, 0.25);

  return {
    // A: puño con el pulgar al costado (hacia arriba o afuera), nunca cruzado al frente.
    A: and(allCurled, Math.max(thumbOut, thumbUp * 0.9), not(thumbAcross), not(touch(F.index.tip))),
    // S: puño con el pulgar cruzado por delante de los dedos.
    // (En la S las puntas quedan hundidas en la palma, DEBAJO del pulgar; en la E quedan encima.)
    // (En la S el pulgar queda bajo, cruzado al frente: altura 0.04 en la cámara del equipo; en la T sube a 0.32.)
    S: and(allCurled, thumbAcross, not(thumbExt), not(tipsAboveThumb) * 0.5 + 0.5, not(thumbTucked)),
    // T: puño con el pulgar METIDO entre índice y medio; su punta sube (0.32) y el índice se dobla encima
    // (alcance 1.05 contra 0.91 en la S), separando las puntas de índice y medio (0.42 contra 0.20).
    T: and(not(F.index.ext), F.middle.curl, F.ring.curl, F.pinky.curl, thumbTucked, not(thumbExt), ramp(F.index.reach, 0.95, 1.02), ramp(imGap, 0.28, 0.36) * 0.5 + 0.5),
    // E: dedos en gancho con las puntas descansando SOBRE el pulgar, que queda abajo
    // (a la altura de los nudillos). Puede tocar el pulgar o no.
    E: and(noneExt, hooked(F.index), hooked(F.middle), thumbLow, tipsAboveThumb, not(thumbExt), not(thumbOut), not(indexTipHigh)),
    // O: la punta del índice toca la del pulgar y los demás dedos no están estirados. El contacto debe quedar
    // ARRIBA de los nudillos, salvo que sea una pinza firme (círculo chico y bajo, como en la cámara del equipo).
    // (El índice puede verse medio estirado al cerrar el círculo, por eso no se exige "doblado".)
    // ramp(reach): el índice de la O sale en arco (alcance ≥1.29 en la cámara del equipo); el de la E se dobla en gancho
    // (≈1.1) y el de la S se hunde en la palma. Con esto la pinza de la E (sus puntas también tocan el pulgar) no cuenta como O.
    O: and(touch(F.index.tip), not(F.middle.ext), not(F.ring.ext), not(F.pinky.ext) * 0.5 + 0.5, ramp(F.index.reach, 1.12, 1.25), Math.max(ramp(thumbHeight, 0.05, 0.2), pinch * 0.9)),
    // C: dedos curvos y juntos, pulgar enfrente sin tocarlos (queda un hueco).
    C: and(fourCurved, indexTipHigh, not(touch(F.index.tip)), ramp(tipDist(F.index.tip), 0.3, 0.45), 1 - ramp(tipDist(F.index.tip), 0.9, 1.2), not(thumbAcross)),
    L: and(F.index.ext, not(F.middle.ext), not(F.ring.ext), not(F.pinky.ext), thumbExt, thumbOut * 0.5 + 0.5, not(pointsSideways)),
    // G: como la L pero girada: el índice apunta de lado y el pulgar hacia arriba (demostración del equipo, 2026-10-17).
    G: and(F.index.ext, not(F.middle.ext), not(F.ring.ext), not(F.pinky.ext), thumbExt * 0.5 + 0.5, not(touch(F.middle.tip)), pointsSideways),
    D: and(F.index.ext, not(F.middle.ext), not(F.ring.ext), touch(F.middle.tip), not(touch(F.index.tip)), not(thumbExt)),
    I: and(F.pinky.ext, not(F.index.ext), not(F.middle.ext), not(F.ring.ext), not(thumbExt)),
    Y: and(F.pinky.ext, not(F.index.ext), not(F.middle.ext), not(F.ring.ext), thumbExt),
    F: and(F.middle.ext, F.ring.ext, F.pinky.ext, touch(F.index.tip)),
    B: and(F.index.ext, F.middle.ext, F.ring.ext, F.pinky.ext, not(thumbExt), 1 - ramp(imGap, 0.3, 0.5), not(pointsDown)),
    U: and(twoUp, 1 - ramp(imGap, 0.22, 0.38), not(crossed), upright, not(thumbHigh)),
    // H: como la U pero girada: índice y medio juntos apuntando de lado (demostración del equipo, 2026-10-17).
    H: and(twoUp, 1 - ramp(imGap, 0.25, 0.42), not(crossed), pointsSideways),
    V: and(twoUp, ramp(imGap, 0.3, 0.5), not(crossed), not(pointsDown), not(thumbHigh)),
    // R: índice y medio cruzados, con las puntas pegadas (separación 0.06–0.07 en la cámara del equipo).
    // Ya no se usa la altura del pulgar: en la cámara se traslapaba con la P (R 0.05–0.25, P 0.21–0.29).
    R: and(twoUp, crossed, not(pointsDown), 1 - ramp(imGap, 0.3, 0.45)),
    // P: índice y medio arriba con la punta del pulgar subiendo entre ellos (demostración del equipo, 2026-10-17).
    // P: el medio se abre lejos del índice (separación 0.84–1.02 en la cámara del equipo; en la R ~0.07)
    // y la punta del pulgar sube hacia ellos. El medio puede no estar del todo recto (alcance 1.26–1.43).
    P: and(F.index.ext, ramp(F.middle.reach, 1.1, 1.25), ramp(imGap, 0.4, 0.6), not(F.ring.ext), not(F.pinky.ext), ramp(thumbHeight, 0.05, 0.15), upright),
    // W: índice, medio y anular arriba y separados; el meñique doblado (versión hacia arriba de la M).
    // Confirmada con la cámara del equipo (2026-10-17): alcance i1.88 m1.98 a2.08 ñ0.90, separación 0.44.
    W: and(F.index.ext, F.middle.ext, F.ring.ext, pinkyFolded, ramp(imGap, 0.25, 0.4), upright, not(thumbExt)),
    // M y N: tres o dos dedos estirados apuntando hacia ABAJO (demostración del equipo, 2026-10-17).
    // El anular de la M suele quedar menos recto que índice y medio (y tapado por ellos ante la cámara),
    // así que M/N se separan por qué tanto sale el anular, no por si está perfectamente estirado.
    M: and(F.index.ext, F.middle.ext, ramp(ringRel, 0.35, 0.6), pinkyFolded, pointsDown),
    N: and(F.index.ext, F.middle.ext, 1 - ramp(ringRel, 0.25, 0.5), pinkyFolded, not(crossed), pointsDown),
  };
}

/** Diagnóstico: los 3 mejores puntajes y las medidas clave de cada dedo (para la pantalla de cámara y F3). */
export function explain(features: Float32Array, tolerance: number): { top: string; metrics: string } {
  const h = analyzeHand(features);
  const scores = Object.entries(scoreLetters(h, tolerance)).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const F = h.fingers;
  const r = (n: number) => n.toFixed(2);
  return {
    top: scores.map(([l, v]) => `${l} ${Math.round(v * 100)}%`).join(' · '),
    metrics:
      `alcance i${r(F.index.reach)} m${r(F.middle.reach)} a${r(F.ring.reach)} ñ${r(F.pinky.reach)}\n` +
      `estirado i${r(F.index.ext)} m${r(F.middle.ext)} a${r(F.ring.ext)} ñ${r(F.pinky.ext)}\n` +
      `pulgar ext${r(h.thumbExt)} afuera${r(h.thumbOut)} cruzado${r(h.thumbAcross)} · lado${r(h.pointsSideways)} abajo${r(h.pointsDown)}\n` +
      `contacto índice-pulgar ${r(dist(h.thumbTip.p, F.index.tip.p))} · altura pulgar ${r(h.thumbTip.up - F.index.mcp.up)} · punta índice ${r(F.index.tip.up - F.index.mcp.up)}\n` +
      // orden de puntas índice/medio: ~1 paralelos (U), ≤0 cruzados (R)
      `cruce (orden de puntas) ${r((F.index.tip.side - F.middle.tip.side) / (F.index.mcp.side - F.middle.mcp.side || 0.2))} · separación ${r(dist(F.index.tip.p, F.middle.tip.p))}`,
  };
}

export class RulesStrategy implements LetterStrategy {
  readonly name = 'reglas';

  /** Todas las letras ordenadas de mayor a menor puntaje. */
  ranked(features: Float32Array, tolerance: number): Array<[string, number]> {
    return Object.entries(scoreLetters(analyzeHand(features), tolerance)).sort((a, b) => b[1] - a[1]);
  }

  predict(features: Float32Array, _raw: Landmark[], tolerance: number): Prediction {
    const scores = scoreLetters(analyzeHand(features), tolerance);
    let letter: string | null = null;
    let best = 0;
    for (const [l, s] of Object.entries(scores)) {
      if (s > best) [letter, best] = [l, s];
    }
    const minScore = 0.55 - tolerance * 0.2;
    if (best < minScore) return { letter: null, confidence: best };
    return { letter, confidence: best };
  }
}
