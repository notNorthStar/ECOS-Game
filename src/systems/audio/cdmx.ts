/**
 * Nivel 6 (CDMX parte 1): pistas procedurales y efectos sintetizados.
 *
 * Pistas:
 *  - n06_xochimilco: canales de noche (drones, agua estancada, risitas lejanas y una nana de caja de música desafinada).
 *  - n06_avenidas:   Día de Muertos; son nostálgico en re menor con organillo desafinado, jarana y percusión suave.
 *  - n06_reforma:    ruinas de la gran ciudad; organillo distorsionado y lejano, drones graves y ecos de metal.
 *  - n06_combate:    el mismo motivo, más rápido y tenso.
 *  - n06_jefe:       La Nahuala; huéhuetl, teponaztli, sonajas, flautas de barro y silbatos de la muerte.
 *                    La intensidad 0 / 0.55 / 1 corresponde a las fases 1 / 2 / 3.
 *
 * La melodía del organillo es original (no se basa en ninguna canción existente).
 */
import { bombo, campana, mtof, pad, pulsar, rasguear, ruido, slap, tarima, tono, type Motor } from './motor';
import { coro, drone, ruidoContinuo, unir } from './catemaco';
import type { DefPista } from './musica';

type Sintetizador = (m: Motor, d: AudioNode, t: number) => number;
type Frase = Array<[number, number, number]>; // [paso, midi, duración en pasos]

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const humano = (t: number) => t + (Math.random() - 0.5) * 0.008;
const indexar = (f: Frase) => new Map(f.map(([p, n, l]) => [p, [n, l] as const]));

// ── Primitivas propias ────────────────────────────────────────────────────────

let curvaDist: Float32Array<ArrayBuffer> | null = null;
function curvaDistorsion(): Float32Array<ArrayBuffer> {
  if (curvaDist) return curvaDist;
  const n = 512;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 5);
  }
  curvaDist = c;
  return c;
}

interface OpcOrganillo {
  /** Desafinación máxima por nota (cents). */
  desafin?: number;
  /** Distorsión (organillo roto / quemado). */
  dist?: boolean;
  /** Sonido lejano: más opaco y con más reverb. */
  lejos?: boolean;
  pan?: number;
}

/**
 * Organillo de manivela: dientes de sierra + cuadrada una octava arriba, resonancia nasal,
 * vibrato irregular, temblor de la manivela y notas desafinadas (alguna claramente bemol).
 */
function organillo(m: Motor, destino: AudioNode, t: number, midi: number, dur: number, vol: number, o: OpcOrganillo = {}): void {
  const { ctx } = m;
  const desafin = o.desafin ?? 28;
  let cents = (Math.random() * 2 - 1) * desafin;
  if (Math.random() < 0.12) cents -= desafin * 1.6; // la tuba que se quedó baja
  const fin = t + dur + 0.25;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.035);
  g.gain.setValueAtTime(vol, t + Math.max(0.04, dur * 0.7));
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);

  // Temblor de la manivela (amplitud).
  const trem = ctx.createGain();
  trem.gain.value = 0.82;
  const lfoA = ctx.createOscillator();
  lfoA.frequency.value = rnd(2.0, 2.9);
  const lfoAG = ctx.createGain();
  lfoAG.gain.value = 0.18;
  lfoA.connect(lfoAG);
  lfoAG.connect(trem.gain);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = o.lejos ? 1300 : 2800;
  const nasal = ctx.createBiquadFilter();
  nasal.type = 'peaking';
  nasal.frequency.value = 1350;
  nasal.Q.value = 2.2;
  nasal.gain.value = 7;

  nasal.connect(lp);
  lp.connect(trem);
  if (o.dist) {
    const ws = ctx.createWaveShaper();
    ws.curve = curvaDistorsion();
    trem.connect(ws);
    ws.connect(g);
  } else {
    trem.connect(g);
  }
  const cadena: AudioNode = nasal;

  let salida: AudioNode = g;
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    g.connect(p);
    salida = p;
  }
  salida.connect(destino);
  const e = ctx.createGain();
  e.gain.value = o.lejos ? 1.2 : 0.55;
  salida.connect(e);
  e.connect(m.reverb);

  // Vibrato irregular: un LFO rápido y otro lento que lo hace vagar.
  const lfoV = ctx.createOscillator();
  lfoV.frequency.value = rnd(4.2, 7.4);
  const lfoVG = ctx.createGain();
  lfoVG.gain.value = rnd(10, 38);
  lfoV.connect(lfoVG);
  const lfoW = ctx.createOscillator();
  lfoW.frequency.value = rnd(0.5, 1.2);
  const lfoWG = ctx.createGain();
  lfoWG.gain.value = rnd(8, 18);
  lfoW.connect(lfoWG);

  const voces: Array<[OscillatorType, number, number]> = [
    ['sawtooth', 0, 0.5],
    ['square', 12, 0.18],
    ['triangle', -12, 0.25],
  ];
  const oscs: OscillatorNode[] = [lfoA, lfoV, lfoW];
  for (const [tipo, oct, nivel] of voces) {
    const osc = ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.value = mtof(midi + oct);
    osc.detune.value = cents + (tipo === 'square' ? rnd(-8, 8) : 0);
    lfoVG.connect(osc.detune);
    lfoWG.connect(osc.detune);
    const gv = ctx.createGain();
    gv.gain.value = nivel;
    osc.connect(gv);
    gv.connect(cadena);
    oscs.push(osc);
  }
  for (const osc of oscs) {
    osc.start(t);
    osc.stop(fin);
  }
}

/** Caja de música: lengüeta aguda con parcial brillante; `cents` la desafina. */
function cajaMusica(m: Motor, d: AudioNode, t: number, midi: number, vol: number, cents = 0): void {
  tono(m, d, t, mtof(midi), 1.3, vol, { tipo: 'triangle', detune: cents, envio: 0.7 });
  tono(m, d, t, mtof(midi + 24), 0.35, vol * 0.3, { detune: cents * 1.3, envio: 0.7 });
  ruido(m, d, t, 0.012, vol * 0.25, { filtro: 'highpass', frec: 6000 });
}

/** Risa de muñeca de cuerda: pocas notas agudas que se arrastran. */
function risitaMuneca(m: Motor, d: AudioNode, t: number, vol: number, pan = 0, lejos = true): number {
  const base = rnd(640, 960);
  const n = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const f = base * (1 - i * 0.045);
    tono(m, d, t + i * 0.085, f, 0.07, vol, {
      tipo: 'square', hasta: f * rnd(0.85, 1.2), filtro: 2200, vibrato: 22, vibratoProf: 60, pan, envio: lejos ? 1.1 : 0.4,
    });
  }
  // Mecanismo de cuerda al final.
  ruido(m, d, t + n * 0.085, 0.05, vol * 0.5, { filtro: 'bandpass', frec: 3600, q: 4, envio: lejos ? 0.6 : 0.2 });
  return n * 0.085 + 0.1;
}

/** Huéhuetl: tambor vertical grave de membrana. */
function huehuetl(m: Motor, d: AudioNode, t: number, vol: number, grave = true): void {
  const f = grave ? 96 : 130;
  tono(m, d, t, f, 0.4, vol, { hasta: f * 0.55, envio: 0.35 });
  tono(m, d, t, f * 2.1, 0.12, vol * 0.3, { tipo: 'triangle', hasta: f * 1.4 });
  ruido(m, d, t, 0.05, vol * 0.35, { filtro: 'lowpass', frec: 700 });
}

/** Teponaztli: tambor de madera con dos lengüetas (alta y baja). */
function teponaztli(m: Motor, d: AudioNode, t: number, vol: number, alto: boolean): void {
  const f = alto ? 340 : 255;
  tono(m, d, t, f, 0.2, vol, { tipo: 'triangle', hasta: f * 0.96, filtro: 1900, envio: 0.4 });
  tono(m, d, t, f * 2.4, 0.08, vol * 0.25, { filtro: 3000 });
  ruido(m, d, t, 0.03, vol * 0.5, { filtro: 'bandpass', frec: 1100, q: 3 });
}

/** Sonaja de semillas / ayoyotes. */
function sonaja(m: Motor, d: AudioNode, t: number, vol: number): void {
  for (let i = 0; i < 4; i++) ruido(m, d, t + i * 0.014, 0.02, vol * (1 - i * 0.15), { filtro: 'highpass', frec: 5200 });
}

/** Flauta de barro: tono casi puro con soplo y vibrato lento. */
function flautaBarro(m: Motor, d: AudioNode, t: number, midi: number, dur: number, vol: number, pan = 0): void {
  const f = mtof(midi);
  tono(m, d, t, f, dur, vol, { ataque: 0.12, vibrato: 4.6, vibratoProf: 16, envio: 0.65, pan });
  tono(m, d, t, f * 2, dur, vol * 0.18, { tipo: 'triangle', ataque: 0.14, envio: 0.65, pan });
  ruido(m, d, t, dur, vol * 0.3, { filtro: 'bandpass', frec: f * 2, q: 5, ataque: 0.1, envio: 0.5 });
}

/** Silbato de la muerte (azteca): alarido hueco que cae. */
function silbato(m: Motor, d: AudioNode, t: number, dur: number, vol: number, pan = 0): void {
  ruido(m, d, t, dur, vol, { filtro: 'bandpass', frec: 2500, hasta: 900, q: 14, ataque: 0.06, envio: 0.9 });
  tono(m, d, t, 2300, dur, vol * 0.45, { hasta: 780, ataque: 0.06, vibrato: 28, vibratoProf: 110, envio: 0.9, pan });
  tono(m, d, t + 0.03, 2380, dur, vol * 0.25, { hasta: 820, ataque: 0.06, vibrato: 33, vibratoProf: 90, envio: 0.9, pan });
}

// ── Armonía y melodía compartida (re menor) ───────────────────────────────────

// Compás de sesquiáltera (12 corcheas) × 8 = 96 pasos.
const JARANA_C: Record<string, number[]> = {
  Dm: [62, 65, 69, 74],
  Gm: [62, 67, 70, 74],
  A7: [64, 67, 69, 73],
  Bb: [62, 65, 70, 74],
};
const BAJO_C: Record<string, number> = { Dm: 38, Gm: 43, A7: 45, Bb: 46 };
const PROG = ['Dm', 'Dm', 'Gm', 'A7', 'Dm', 'Bb', 'A7', 'Dm'];
const acordeEn = (paso: number) => PROG[Math.floor((paso % 96) / 12)];

/** Motivo del organillo (original). Se usa también, más rápido, en el combate. */
const MOTIVO = indexar([
  [0, 69, 3], [3, 74, 3], [6, 72, 2], [8, 70, 2], [10, 69, 2],
  [12, 65, 3], [15, 67, 3], [18, 69, 6],
  [24, 70, 3], [27, 74, 3], [30, 72, 2], [32, 70, 2], [34, 67, 2],
  [36, 69, 3], [39, 73, 3], [42, 76, 3], [45, 73, 3],
  [48, 74, 3], [51, 72, 3], [54, 70, 2], [56, 69, 2], [58, 65, 2],
  [60, 67, 3], [63, 70, 3], [66, 74, 6],
  [72, 73, 3], [75, 69, 3], [78, 67, 2], [80, 65, 2], [82, 64, 2],
  [84, 62, 12],
]);

// ── n06_xochimilco ────────────────────────────────────────────────────────────

const NANA = indexar([
  [0, 76, 3], [3, 72, 3], [6, 69, 3], [9, 72, 3], [12, 76, 3], [15, 79, 3], [18, 76, 6],
  [24, 77, 3], [27, 74, 3], [30, 71, 3], [33, 74, 3], [36, 77, 3], [39, 81, 3], [42, 77, 6],
  [48, 76, 3], [51, 72, 3], [54, 69, 3], [57, 64, 3], [60, 65, 3], [63, 68, 3], [66, 69, 9],
]);
const XOCHI_ACORDES: number[][] = [[50, 53, 56], [49, 53, 56]];

const XOCHIMILCO: DefPista = {
  paso: 0.3,
  pasos: 96,
  volumen: 0.8,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[73.4, 'sine'], [73.9, 'triangle'], [110.2, 'sine']], filtro: 320, vol: 0.06, lfo: [0.05, 80], volInt: 0.3 }),
      ruidoContinuo(m, s, t, { filtro: 'lowpass', frec: 300, q: 0.9, vol: 0.04, oleaje: 0.12 }),
    );
  },
  programar(m, s, paso, t) {
    const p = paso % 12;
    const c = paso % 96;
    if (c % 24 === 0) pad(m, s, t, XOCHI_ACORDES[Math.floor(c / 24) % 2], 24 * this.paso, 0.02, 600);
    // Goteo del agua estancada.
    if (p % 2 === 1 && Math.random() < 0.2) {
      const f = rnd(520, 900);
      tono(m, s, t, f, 0.14, 0.03, { hasta: f * 0.6, envio: 0.85, pan: rnd(-0.7, 0.7) });
    }
    // Risitas de muñecas, muy lejanas.
    if ((p === 5 || p === 11) && Math.random() < 0.07) risitaMuneca(m, s, t, 0.012, rnd(-0.8, 0.8), true);
    // Nana desafinada de caja de música (una vuelta sí, una no); a veces falla una lengüeta.
    if (Math.floor(paso / 96) % 2 === 0) {
      const nota = NANA.get(c);
      if (nota && Math.random() > 0.1) {
        const cents = Math.random() < 0.14 ? -rnd(55, 90) : rnd(-32, 32);
        cajaMusica(m, s, t + rnd(0, 0.05), nota[0], 0.07, cents);
      }
    }
  },
};

// ── n06_avenidas ──────────────────────────────────────────────────────────────

const AVENIDAS: DefPista = {
  paso: 0.2,
  pasos: 96,
  volumen: 0.85,
  programar(m, s, paso, t) {
    const p = paso % 12;
    const ac = acordeEn(paso);
    // Jarana suave (acentos de sesquiáltera).
    const RAS: Record<number, [number, boolean]> = {
      0: [0.11, true], 3: [0.08, true], 6: [0.09, true], 8: [0.07, false], 10: [0.08, true],
    };
    const r = RAS[p];
    if (r) rasguear(m, s, humano(t), JARANA_C[ac], r[0], r[1], 0.55, 0.45);
    if (p === 0 || p === 6) pulsar(m, s, t, BAJO_C[ac], p === 0 ? 0.36 : 0.26, 0.3, 0.9, 0.12);
    if (p === 3 || p === 9) pulsar(m, s, t, BAJO_C[ac] + 7, 0.18, 0.3, 0.6, 0.1);
    // Percusión suave: bombo lejano, palmada y manivela.
    if (p === 0 || p === 6) bombo(m, s, t, 0.2, 100, 48, 0.2);
    if (p === 3 || p === 9) slap(m, s, t, 0.07);
    if (p % 3 === 0) ruido(m, s, t, 0.02, 0.012, { filtro: 'highpass', frec: 3200 });
    // Organillo desafinado con el motivo.
    const nota = MOTIVO.get(paso % 96);
    if (nota) {
      const dur = nota[1] * this.paso;
      organillo(m, s, humano(t), nota[0], dur, 0.075, { pan: 0.12 });
      // Segunda voz una tercera abajo en las vueltas impares.
      if (Math.floor(paso / 96) % 2 === 1) organillo(m, s, t, nota[0] - 3, dur, 0.035, { desafin: 40, pan: -0.15 });
    }
    // Campanilla de ofrenda ocasional.
    if (p === 0 && paso % 24 === 0 && Math.random() < 0.3) campana(m, s, t + 0.1, mtof(rnd(0, 1) < 0.5 ? 86 : 93), 1.5, 0.025, 0.8);
  },
};

// ── n06_reforma ───────────────────────────────────────────────────────────────

const REFORMA: DefPista = {
  paso: 0.28,
  pasos: 96,
  volumen: 0.8,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[36.7, 'sawtooth'], [36.95, 'sawtooth'], [73.4, 'triangle']], filtro: 210, vol: 0.075, lfo: [0.07, 70], volInt: 0.4 }),
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 700, q: 0.6, vol: 0.022, barrido: [0.05, 250] }),
    );
  },
  programar(m, s, paso, t) {
    const p = paso % 12;
    // Latido grave de la ciudad.
    if (p === 0) tono(m, s, t, 62, 0.5, 0.16, { hasta: 38, envio: 0.6 });
    if (p === 6) tono(m, s, t, 58, 0.4, 0.08, { hasta: 36, envio: 0.6 });
    // Organillo roto, lejano y arrastrado: el motivo a medio recordar.
    const nota = MOTIVO.get(paso % 96);
    if (nota && Math.random() < 0.65) {
      organillo(m, s, t, nota[0] - 12 * (Math.random() < 0.2 ? 1 : 0), nota[1] * this.paso * 1.05, 0.05, { desafin: 48, dist: true, lejos: true, pan: rnd(-0.5, 0.5) });
    }
    // Ecos de metal: vigas y láminas que caen.
    if (p === 0 && Math.random() < 0.45) campana(m, s, t, mtof(rnd(48, 62)), 3.2, 0.035, 0.97);
    if (p === 7 && Math.random() < 0.12) {
      ruido(m, s, t, 0.7, 0.04, { filtro: 'bandpass', frec: rnd(2200, 3600), hasta: rnd(900, 1500), q: 12, ataque: 0.1, envio: 0.9 });
    }
  },
};

// ── n06_combate ───────────────────────────────────────────────────────────────

const COMBATE: DefPista = {
  paso: 0.13,
  pasos: 96,
  volumen: 0.9,
  iniciar(m, s, t) {
    // Tritono grave de tensión.
    return drone(m, s, t, { notas: [[73.4, 'sawtooth'], [103.8, 'sawtooth']], filtro: 260, vol: 0.04, lfo: [0.2, 60] });
  },
  programar(m, s, paso, t) {
    const p = paso % 12;
    const ac = acordeEn(paso);
    const fuerte = p === 0 || p === 3 || p === 6 || p === 8 || p === 10;
    rasguear(m, s, humano(t), JARANA_C[ac], fuerte ? 0.16 : 0.07, fuerte || p % 2 === 0, 0.32, 0.65);
    const raiz = BAJO_C[ac];
    if (fuerte) pulsar(m, s, t, p === 3 || p === 10 ? raiz + 7 : raiz, 0.42, 0.35, 0.45, 0.05);
    if (p === 0 || p === 6) bombo(m, s, t, 0.5, 115, 46, 0.2);
    if (p === 8 || p === 10) bombo(m, s, t, 0.32, 105, 48, 0.14);
    if (p === 3 || p === 9) slap(m, s, t, 0.26);
    tarima(m, s, humano(t), fuerte ? 0.24 : 0.12);
    // El mismo motivo, rápido y áspero, con la octava de refuerzo.
    const nota = MOTIVO.get(paso % 96);
    if (nota) {
      const dur = nota[1] * this.paso;
      organillo(m, s, humano(t), nota[0], dur, 0.075, { desafin: 16, dist: true });
      organillo(m, s, t, nota[0] + 12, dur, 0.025, { desafin: 22 });
    }
    // Estocada disonante antes de cada cambio de acorde.
    if (p === 11 && Math.floor((paso % 96) / 12) % 2 === 1) tono(m, s, t, mtof(63), 0.12, 0.05, { tipo: 'sawtooth', filtro: 1500 });
  },
};

// ── n06_jefe (La Nahuala) ─────────────────────────────────────────────────────

const FLAUTA = indexar([
  [0, 74, 6], [6, 77, 6], [12, 76, 6], [18, 73, 6], [24, 74, 12],
  [36, 69, 6], [42, 72, 6], [48, 74, 6], [54, 77, 6], [60, 81, 9],
  [72, 79, 6], [78, 77, 6], [84, 76, 6], [90, 73, 6],
]);

const JEFE: DefPista = {
  paso: 0.15,
  pasos: 96,
  volumen: 0.88,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, {
        notas: [[73.4, 'sawtooth'], [73.9, 'sawtooth'], [110.2, 'triangle']],
        filtro: 280, vol: 0.09, lfo: [0.12, 90], volInt: 0.5, filtroInt: 0.8,
      }),
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 900, q: 0.7, vol: 0.016, barrido: [0.09, 300] }),
    );
  },
  programar(m, s, paso, t, int) {
    const p = paso % 12;
    const c = paso % 96;
    // Huéhuetl: el pulso del jefe.
    if (p === 0) huehuetl(m, s, t, 0.62, true);
    if (p === 6) huehuetl(m, s, t, 0.46, true);
    if (p === 9) huehuetl(m, s, t, 0.28, false);
    if (int > 0.5 && (p === 3 || p === 10)) huehuetl(m, s, t, 0.28, p === 3);
    if (int > 0.95 && p === 8) huehuetl(m, s, t, 0.3, false);
    // Teponaztli alternando lengüetas.
    const TEP: Record<number, boolean> = { 2: false, 5: true, 8: false, 11: true };
    if (p in TEP) teponaztli(m, s, humano(t), 0.17, TEP[p]);
    else if (int > 0.5 && p % 3 === 1) teponaztli(m, s, humano(t), 0.1, p === 4 || p === 10);
    // Sonajas.
    if (p % 3 === 1 || (int > 0.5 && p % 3 === 2)) sonaja(m, s, t, 0.05 + int * 0.03);
    // Flauta de barro.
    const nota = FLAUTA.get(c);
    if (nota) {
      const dur = nota[1] * this.paso;
      flautaBarro(m, s, humano(t), nota[0], dur, 0.075, 0.2);
      if (int > 0.5) flautaBarro(m, s, t + 0.02, nota[0] - 5, dur, 0.045, -0.3);
    }
    // Silbato de la muerte: cada vuelta en el compás 4; más seguido al subir la intensidad.
    if (c === 42 || (int > 0.5 && c === 90 && Math.random() < 0.7) || (int > 0.95 && c === 18)) {
      silbato(m, s, t, 1.1, 0.045 + int * 0.04, rnd(-0.5, 0.5));
    }
  },
};

export const PISTAS_N06: Record<string, DefPista> = {
  n06_xochimilco: XOCHIMILCO,
  n06_avenidas: AVENIDAS,
  n06_reforma: REFORMA,
  n06_combate: COMBATE,
  n06_jefe: JEFE,
};

// ── Efectos ───────────────────────────────────────────────────────────────────

export const EFECTOS_N06: Record<string, Sintetizador> = {
  muneca_risa: (m, d, t) => {
    const dur = risitaMuneca(m, d, t, 0.1, 0, false);
    tono(m, d, t, 1500, 0.3, 0.02, { tipo: 'square', hasta: 1100, filtro: 2500, vibrato: 14, vibratoProf: 90, envio: 0.5 });
    return dur + 0.3;
  },
  muneca_romper: (m, d, t) => {
    // Porcelana que se quiebra.
    ruido(m, d, t, 0.08, 0.3, { filtro: 'highpass', frec: 3500 });
    for (let i = 0; i < 6; i++) {
      tono(m, d, t + rnd(0, 0.18), rnd(2200, 4200), 0.07, 0.07, { filtro: 6000, envio: 0.3 });
    }
    tono(m, d, t, 170, 0.12, 0.22, { hasta: 70 });
    ruido(m, d, t + 0.1, 0.25, 0.1, { filtro: 'bandpass', frec: 1800, q: 1.5 });
    return 0.5;
  },
  muneca_liberar: (m, d, t) => {
    // Suspiro descendente y tres campanitas: la muñeca descansa.
    tono(m, d, t, 880, 0.9, 0.07, { hasta: 420, ataque: 0.05, vibrato: 5, vibratoProf: 20, envio: 0.8 });
    [88, 83, 79].forEach((n, i) => campana(m, d, t + 0.15 + i * 0.18, mtof(n), 1.0, 0.06, 0.8));
    pad(m, d, t, [62, 65, 69], 1.2, 0.025, 1800);
    return 1.5;
  },
  nahual_transformar: (m, d, t) => {
    // Huesos que crujen, gruñido ascendente y rugido.
    for (let i = 0; i < 5; i++) tono(m, d, t + i * 0.07, rnd(150, 320), 0.03, 0.12, { tipo: 'square', hasta: 70, filtro: 900 });
    tono(m, d, t, 85, 0.9, 0.2, { tipo: 'sawtooth', hasta: 210, filtro: 700, vibrato: 18, vibratoProf: 80, ataque: 0.1, envio: 0.3 });
    ruido(m, d, t, 0.8, 0.14, { filtro: 'bandpass', frec: 300, hasta: 1600, q: 1.2, ataque: 0.1 });
    tono(m, d, t + 0.55, 110, 0.5, 0.2, { tipo: 'sawtooth', hasta: 60, filtro: 600, vibrato: 11, vibratoProf: 70, envio: 0.3 });
    return 1.1;
  },
  nahual_zarpazo: (m, d, t) => {
    for (let i = 0; i < 3; i++) {
      ruido(m, d, t + i * 0.055, 0.14, 0.24, { filtro: 'bandpass', frec: 3400, hasta: 800, q: 1.8 });
    }
    tono(m, d, t, 130, 0.2, 0.3, { hasta: 50 });
    ruido(m, d, t + 0.02, 0.08, 0.2, { filtro: 'lowpass', frec: 900 });
    return 0.35;
  },
  nahual_huir: (m, d, t) => {
    // Quejido que cae y carrerita que se aleja.
    tono(m, d, t, 520, 0.4, 0.14, { tipo: 'sawtooth', hasta: 190, filtro: 1500, vibrato: 12, vibratoProf: 60 });
    for (let i = 0; i < 8; i++) {
      ruido(m, d, t + 0.25 + i * 0.07, 0.04, 0.14 * (1 - i / 9), { filtro: 'lowpass', frec: 700 });
    }
    ruido(m, d, t + 0.2, 0.6, 0.1, { filtro: 'bandpass', frec: 500, hasta: 2200, q: 1, envio: 0.4 });
    return 0.95;
  },
  nahuala_risa: (m, d, t) => {
    // "Ja ja ja" de mujer: notas que bajan con vibrato y mucha reverb.
    for (let i = 0; i < 5; i++) {
      const f = 760 - i * 55;
      tono(m, d, t + i * 0.17, f, 0.14, 0.09, { tipo: 'sawtooth', hasta: f * 0.82, filtro: 2200, vibrato: 9, vibratoProf: 50, envio: 0.8 });
    }
    coro(m, d, t, 69, 0.9, 0.03, 'a');
    tono(m, d, t + 0.9, 900, 0.5, 0.05, { hasta: 380, vibrato: 7, vibratoProf: 80, envio: 1 });
    return 1.5;
  },
  nahuala_ilusion: (m, d, t) => {
    // Destello que se multiplica: parciales desafinados y soplo invertido.
    ruido(m, d, t, 0.6, 0.08, { filtro: 'bandpass', frec: 600, hasta: 5000, q: 2, ataque: 0.5, envio: 0.6 });
    [0, 7, 14, 21, -12].forEach((c, i) => {
      tono(m, d, t + i * 0.06, mtof(81) * (1 + i * 0.003), 0.6, 0.05, { detune: c * 6, envio: 0.8, pan: (i - 2) * 0.35 });
    });
    campana(m, d, t + 0.35, mtof(93), 0.9, 0.05, 0.9);
    return 1.0;
  },
  nahuala_trampa: (m, d, t) => {
    // Resorte seco de madera, golpe metálico y sonajeo.
    ruido(m, d, t, 0.04, 0.3, { filtro: 'bandpass', frec: 1600, q: 3 });
    tono(m, d, t, 190, 0.1, 0.28, { hasta: 70 });
    tono(m, d, t + 0.02, 1400, 0.25, 0.06, { tipo: 'square', filtro: 2500, envio: 0.3 });
    for (let i = 0; i < 3; i++) sonaja(m, d, t + 0.1 + i * 0.06, 0.1);
    return 0.5;
  },
  nahuala_liberar: (m, d, t) => {
    // Flauta de barro que sube, coro y campanas: la Nahuala descansa.
    [62, 65, 69, 74].forEach((n, i) => flautaBarro(m, d, t + i * 0.28, n + 12, 1.1, 0.07));
    [62, 69, 74].forEach((n, i) => coro(m, d, t + 0.4 + i * 0.1, n, 2.0, 0.035, i === 1 ? 'a' : 'u'));
    pad(m, d, t + 0.3, [50, 57, 62, 65], 2.4, 0.04, 2200);
    [86, 90, 93, 98].forEach((n, i) => campana(m, d, t + 1.1 + i * 0.12, mtof(n), 1.4, 0.05, 0.9));
    return 3.0;
  },
  verdad: (m, d, t) => {
    // Cristal que revela: ataque brillante y barrido ascendente.
    ruido(m, d, t, 0.45, 0.07, { filtro: 'bandpass', frec: 1000, hasta: 7000, q: 3, ataque: 0.3, envio: 0.5 });
    [81, 88, 93].forEach((n, i) => campana(m, d, t + 0.18 + i * 0.07, mtof(n), 1.3, 0.09, 0.8));
    tono(m, d, t + 0.18, mtof(105), 0.5, 0.03, { envio: 0.7 });
    return 1.5;
  },
  fuego: (m, d, t) => {
    // Llamarada: soplo ascendente, rugido grave y chisporroteo.
    ruido(m, d, t, 0.8, 0.22, { filtro: 'bandpass', frec: 400, hasta: 2600, q: 0.9, ataque: 0.1, envio: 0.3 });
    tono(m, d, t, 90, 0.8, 0.18, { tipo: 'sawtooth', hasta: 60, filtro: 500, ataque: 0.1 });
    for (let i = 0; i < 10; i++) ruido(m, d, t + rnd(0.1, 0.9), 0.025, 0.12, { filtro: 'highpass', frec: rnd(3000, 6000) });
    return 1.0;
  },
  descanso: (m, d, t) => {
    // Pad cálido, coro suave y campana que se apaga.
    pad(m, d, t, [55, 62, 65, 69], 2.0, 0.06, 1500);
    [62, 69].forEach((n, i) => coro(m, d, t + i * 0.12, n, 1.8, 0.035, 'u'));
    [81, 77, 74].forEach((n, i) => campana(m, d, t + 0.3 + i * 0.3, mtof(n), 1.6, 0.05, 0.9));
    return 2.4;
  },
  doble_salto: (m, d, t) => {
    tono(m, d, t, 420, 0.11, 0.12, { tipo: 'triangle', hasta: 940 });
    ruido(m, d, t, 0.07, 0.07, { filtro: 'bandpass', frec: 1400, hasta: 3500 });
    tono(m, d, t + 0.05, mtof(98), 0.1, 0.03, { envio: 0.3 });
    return 0.18;
  },
  organillo: (m, d, t) => {
    // Floritura desafinada del organillero.
    [69, 74, 72, 70, 69].forEach((n, i) => organillo(m, d, t + i * 0.16, n, i === 4 ? 0.5 : 0.14, 0.09));
    ruido(m, d, t, 0.8, 0.012, { filtro: 'highpass', frec: 3200 });
    return 1.2;
  },
};

export const MAX_VOCES_N06: Record<string, number> = {
  muneca_risa: 2,
  muneca_romper: 4,
  muneca_liberar: 2,
  nahual_transformar: 1,
  nahual_zarpazo: 2,
  nahual_huir: 1,
  nahuala_risa: 1,
  nahuala_ilusion: 2,
  nahuala_trampa: 3,
  nahuala_liberar: 1,
  verdad: 1,
  fuego: 2,
  descanso: 1,
  doble_salto: 2,
  organillo: 1,
};
