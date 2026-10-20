/**
 * Nivel 3 (Catemaco): pistas procedurales y efectos sintetizados.
 *
 * Pistas: n03_pueblo (misterio suave con jarana), n03_lago (ambiental nocturna con tambores
 * rituales lejanos), n03_altar (horror cósmico) y n03_jefe (Cabeza Olmeca; la intensidad
 * 0 / 0.55 / 1 corresponde a las fases 1 / 2 / 3).
 */
import { bombo, campana, mtof, pad, pulsar, rasguear, ruido, slap, tarima, tono, type Motor } from './motor';
import type { DefPista, Persistente } from './musica';

type Sintetizador = (m: Motor, d: AudioNode, t: number) => number;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const humano = (t: number) => t + (Math.random() - 0.5) * 0.008;

type Frase = Array<[number, number, number]>; // [corchea, midi, duración en corcheas]
const indexar = (f: Frase) => new Map(f.map(([p, n, l]) => [p, [n, l] as const]));

// ── Primitivas propias ────────────────────────────────────────────────────────

/** Coro sintético: dientes de sierra desafinados a través de formantes vocálicos. */
export function coro(m: Motor, destino: AudioNode, t: number, midi: number, dur: number, vol: number, vocal: 'o' | 'a' | 'u' = 'o', pan = 0): void {
  const { ctx } = m;
  const FORMANTES: Record<string, Array<[number, number]>> = {
    o: [[450, 1], [800, 0.5], [2830, 0.08]],
    a: [[730, 1], [1090, 0.6], [2440, 0.12]],
    u: [[325, 1], [700, 0.3], [2530, 0.04]],
  };
  const g = ctx.createGain();
  const ataque = Math.min(dur * 0.4, 1.6);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + ataque);
  g.gain.setValueAtTime(vol, t + Math.max(ataque, dur - 0.9));
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
  let salida: AudioNode = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    salida = p;
  }
  salida.connect(destino);
  const e = ctx.createGain();
  e.gain.value = 0.9;
  salida.connect(e);
  e.connect(m.reverb);

  const fuente = ctx.createGain();
  fuente.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rnd(4.6, 5.6);
  const lfoG = ctx.createGain();
  lfoG.gain.value = 14;
  lfo.connect(lfoG);
  const oscs: OscillatorNode[] = [lfo];
  for (const det of [-9, 0, 11]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    o.detune.value = det;
    lfoG.connect(o.detune);
    o.connect(fuente);
    oscs.push(o);
  }
  for (const [f, a] of FORMANTES[vocal]) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 7;
    const ga = ctx.createGain();
    ga.gain.value = a;
    fuente.connect(bp);
    bp.connect(ga);
    ga.connect(g);
  }
  for (const o of oscs) {
    o.start(t);
    o.stop(t + dur + 0.5);
  }
}

/** Tambor ritual lejano: grave, apagado y con mucha reverb. */
function tamborLejano(m: Motor, d: AudioNode, t: number, vol: number): void {
  tono(m, d, t, 78, 0.45, vol, { hasta: 46, filtro: 240, envio: 0.8 });
  ruido(m, d, t, 0.14, vol * 0.5, { filtro: 'lowpass', frec: 320, envio: 0.7 });
}

export interface CfgDrone {
  notas: Array<[number, OscillatorType]>;
  filtro: number;
  vol: number;
  /** Frecuencia (Hz) y profundidad (Hz) del barrido lento del filtro. */
  lfo?: [number, number];
  /** Cuánto crece el volumen / el filtro con la intensidad (fracción). */
  volInt?: number;
  filtroInt?: number;
}

/** Bordón continuo con barrido de filtro; admite intensidad. */
export function drone(m: Motor, s: AudioNode, t: number, cfg: CfgDrone): Persistente {
  const { ctx } = m;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cfg.filtro;
  lp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(cfg.vol, t + 3);
  lp.connect(g);
  g.connect(s);
  const e = ctx.createGain();
  e.gain.value = 0.5;
  g.connect(e);
  e.connect(m.reverb);
  const oscs: OscillatorNode[] = [];
  for (const [f, tipo] of cfg.notas) {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.value = f;
    o.connect(lp);
    oscs.push(o);
  }
  if (cfg.lfo) {
    const l = ctx.createOscillator();
    l.frequency.value = cfg.lfo[0];
    const lg = ctx.createGain();
    lg.gain.value = cfg.lfo[1];
    l.connect(lg);
    lg.connect(lp.frequency);
    oscs.push(l);
  }
  for (const o of oscs) o.start(t);
  return {
    parar(tf) {
      for (const o of oscs) o.stop(tf + 0.1);
    },
    intensidad(v, ti) {
      g.gain.setTargetAtTime(cfg.vol * (1 + v * (cfg.volInt ?? 0.4)), ti, 0.6);
      lp.frequency.setTargetAtTime(cfg.filtro * (1 + v * (cfg.filtroInt ?? 0.6)), ti, 0.6);
    },
  };
}

export interface CfgRuido {
  filtro: BiquadFilterType;
  frec: number;
  q?: number;
  vol: number;
  /** Oleaje: frecuencia del LFO de volumen (Hz). */
  oleaje?: number;
  /** Barrido lento de la frecuencia del filtro [Hz del LFO, profundidad en Hz]. */
  barrido?: [number, number];
}

/** Ruido continuo filtrado (agua, viento) con modulación lenta. */
export function ruidoContinuo(m: Motor, s: AudioNode, t: number, cfg: CfgRuido): Persistente {
  const { ctx } = m;
  const src = ctx.createBufferSource();
  src.buffer = m.ruido;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = cfg.filtro;
  f.frequency.value = cfg.frec;
  f.Q.value = cfg.q ?? 0.7;
  const mod = ctx.createGain();
  mod.gain.value = cfg.vol * (cfg.oleaje ? 0.55 : 1);
  const fade = ctx.createGain();
  fade.gain.setValueAtTime(0.0001, t);
  fade.gain.linearRampToValueAtTime(1, t + 3);
  src.connect(f);
  f.connect(mod);
  mod.connect(fade);
  fade.connect(s);
  const lfos: OscillatorNode[] = [];
  if (cfg.oleaje) {
    const l = ctx.createOscillator();
    l.frequency.value = cfg.oleaje;
    const lg = ctx.createGain();
    lg.gain.value = cfg.vol * 0.45;
    l.connect(lg);
    lg.connect(mod.gain);
    lfos.push(l);
  }
  if (cfg.barrido) {
    const l = ctx.createOscillator();
    l.frequency.value = cfg.barrido[0];
    const lg = ctx.createGain();
    lg.gain.value = cfg.barrido[1];
    l.connect(lg);
    lg.connect(f.frequency);
    lfos.push(l);
  }
  src.start(t, Math.random() * 1.5);
  for (const l of lfos) l.start(t);
  return {
    parar(tf) {
      src.stop(tf + 0.1);
      for (const l of lfos) l.stop(tf + 0.1);
    },
  };
}

export function unir(...ps: Persistente[]): Persistente {
  return {
    parar: (tf) => ps.forEach((p) => p.parar(tf)),
    intensidad: (v, ti) => ps.forEach((p) => p.intensidad?.(v, ti)),
  };
}

// ── n03_pueblo ────────────────────────────────────────────────────────────────

// La menor / frigio: Am – G – F – E (Mi mayor con sol sostenido: tensión de misterio).
const PUEBLO_JARANA: number[][] = [
  [64, 69, 72, 76],
  [62, 67, 71, 74],
  [60, 65, 69, 72],
  [64, 68, 71, 76],
];
const PUEBLO_BAJO = [45, 43, 41, 40];
const PUEBLO_PAD: number[][] = [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]];
const PUEBLO_FRASE = indexar([
  [0, 76, 3], [4, 72, 2], [6, 74, 3],
  [12, 72, 3], [16, 71, 2], [18, 69, 4],
  [24, 67, 3], [28, 69, 2], [30, 72, 3],
  [36, 71, 2], [38, 68, 3], [42, 69, 6],
]);

const PUEBLO: DefPista = {
  paso: 0.24,
  pasos: 96,
  volumen: 0.8,
  iniciar(m, s, t) {
    // Brisa nocturna muy tenue.
    return ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 500, q: 0.8, vol: 0.012, barrido: [0.07, 180] });
  },
  programar(m, s, paso, t) {
    const p = paso % 12;
    const c = Math.floor((paso % 48) / 12);
    const vuelta = Math.floor((paso % 96) / 48);
    // Jarana tenue (sesquiáltera).
    const RAS: Record<number, [number, boolean]> = {
      0: [0.07, true], 3: [0.05, true], 6: [0.06, true], 8: [0.045, false], 10: [0.05, true],
    };
    const r = RAS[p];
    if (r) rasguear(m, s, humano(t), PUEBLO_JARANA[c], r[0], r[1], 0.9, 0.4);
    // Bajo.
    if (p === 0 || p === 6) pulsar(m, s, t, PUEBLO_BAJO[c], p === 0 ? 0.28 : 0.2, 0.3, 1.2, 0.2);
    if (p === 0) pad(m, s, t, PUEBLO_PAD[c], 12 * this.paso, 0.022, 700);
    // Requinto escaso: una vuelta sí, una no.
    if (vuelta === 0) {
      const nota = PUEBLO_FRASE.get(paso % 48);
      if (nota) pulsar(m, s, humano(t), nota[0], 0.17, 0.7, nota[1] * this.paso + 0.7, 0.5, 0.15);
    }
    // Tambor lejano que apenas se insinúa al final de la segunda vuelta.
    if (vuelta === 1 && c === 3 && (p === 0 || p === 6)) tamborLejano(m, s, t, 0.07);
    // Grillos.
    if ((p === 4 && Math.random() < 0.5) || (p === 9 && Math.random() < 0.3)) {
      const f = 4100 + Math.random() * 500;
      const pan = rnd(-0.7, 0.7);
      const n = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) tono(m, s, t + k * 0.055, f, 0.03, 0.01, { pan });
    }
  },
};

// ── n03_lago ──────────────────────────────────────────────────────────────────

const LAGO_MOTIVO: Array<[number, number]> = [[0, 57], [2, 60], [5, 63], [6, 60]]; // La–Do–Mib–Do (tritono)
const LAGO_CAMPANAS = [69, 72, 75, 79];

const LAGO: DefPista = {
  paso: 0.3,
  pasos: 96,
  volumen: 0.85,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, {
        notas: [[55, 'sawtooth'], [55.4, 'sawtooth'], [82.4, 'triangle'], [116.5, 'sine']],
        filtro: 200, vol: 0.1, lfo: [0.09, 70], volInt: 0.5, filtroInt: 0.8,
      }),
      // Agua: oleaje grave contra la orilla.
      ruidoContinuo(m, s, t, { filtro: 'lowpass', frec: 480, vol: 0.05, oleaje: 0.13, barrido: [0.05, 160] }),
      // Viento: banda media que sube y baja.
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 700, q: 2.5, vol: 0.017, barrido: [0.06, 350] }),
    );
  },
  programar(m, s, paso, t, int) {
    const p = paso % 12;
    const vuelta = Math.floor((paso % 96) / 12); // 0..7
    // Tambores rituales lejanos (la última vuelta de ocho respira en silencio).
    if (vuelta !== 7) {
      const base = 0.14 + int * 0.1;
      if (p === 0) tamborLejano(m, s, t, base * 1.3);
      if (p === 6) tamborLejano(m, s, t, base);
      if ((p === 3 || p === 9) && (vuelta % 2 === 1 || int > 0.3)) tamborLejano(m, s, t, base * 0.55);
      if ((p === 8 || p === 10) && int > 0.5) tamborLejano(m, s, t, base * 0.7);
    }
    // Pad grave.
    if (p === 0 && vuelta % 2 === 0) pad(m, s, t, [45, 52, 57], 12 * this.paso, 0.028, 500);
    // Motivo detectivesco.
    if (vuelta % 4 === 1 || vuelta === 6) {
      for (const [pp, n] of LAGO_MOTIVO) {
        if (p === pp) pulsar(m, s, humano(t), n, 0.13, 0.4, 1.5, 0.55, -0.15);
      }
    }
    // Campana lejana.
    if (vuelta % 4 === 3 && p === 4) {
      campana(m, s, t, mtof(LAGO_CAMPANAS[Math.floor(Math.random() * LAGO_CAMPANAS.length)]), 2.2, 0.025, 0.9);
    }
    // Búho.
    if (p === 5 && Math.random() < 0.06) {
      tono(m, s, t, 400, 0.3, 0.03, { hasta: 340, envio: 0.6, ataque: 0.05 });
      tono(m, s, t + 0.45, 380, 0.4, 0.025, { hasta: 320, envio: 0.6, ataque: 0.05 });
    }
  },
};

// ── n03_altar ─────────────────────────────────────────────────────────────────

const ALTAR_CORO: number[][] = [[57, 58, 63], [56, 57, 62], [57, 60, 63], [55, 58, 61]];
const ALTAR_VOCAL: Array<'o' | 'a' | 'u'> = ['o', 'u', 'a'];

const ALTAR: DefPista = {
  paso: 0.4,
  pasos: 96,
  volumen: 0.85,
  iniciar(m, s, t) {
    return unir(
      // Cúmulo disonante: segunda menor, tritono y batimientos lentos.
      drone(m, s, t, {
        notas: [[55, 'sawtooth'], [58.27, 'sawtooth'], [77.78, 'triangle'], [110.4, 'triangle'], [116.5, 'sine']],
        filtro: 280, vol: 0.1, lfo: [0.06, 120], volInt: 0.4, filtroInt: 0.7,
      }),
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 380, q: 3, vol: 0.014, barrido: [0.04, 220] }),
    );
  },
  programar(m, s, paso, t, int) {
    const p = paso % 12;
    const vuelta = Math.floor((paso % 48) / 12); // 0..3
    // Pulso sordo: late bajo tus pies.
    if (p % 3 === 0) tono(m, s, t, 41.2, 0.5, 0.09 + int * 0.04, { filtro: 130, ataque: 0.03, envio: 0.3 });
    // Latido doble.
    if (p === 0) {
      tono(m, s, t, 62, 0.32, 0.26, { hasta: 34, filtro: 220 });
      tono(m, s, t + 0.24, 58, 0.28, 0.16, { hasta: 32, filtro: 220 });
    }
    if (p === 6 && int > 0.4) tono(m, s, t, 60, 0.3, 0.18, { hasta: 33, filtro: 220 });
    // Coro lejano.
    if (p === 0 && vuelta % 2 === 0) {
      ALTAR_CORO[Math.floor((paso % 96) / 24)].forEach((n, i) => {
        coro(m, s, t + i * 0.35, n + 12, 9 * this.paso, 0.03 + int * 0.015, ALTAR_VOCAL[i % 3], (i - 1) * 0.5);
      });
    }
    // Destellos agudos inarmónicos.
    if (p === 4 && Math.random() < 0.45) {
      const f = rnd(1900, 3300);
      tono(m, s, t, f, 1.4, 0.009, { envio: 0.8, ataque: 0.3, vibrato: 5, vibratoProf: 25 });
      tono(m, s, t, f * 1.414, 1.4, 0.007, { envio: 0.8, ataque: 0.3 });
    }
    // Campana invertida (tritono).
    if (vuelta === 3 && p === 8) {
      campana(m, s, t, mtof(81), 2.6, 0.025, 0.9);
      campana(m, s, t + 0.05, mtof(87), 2.6, 0.018, 0.9);
    }
  },
};

// ── n03_jefe ──────────────────────────────────────────────────────────────────

const JEFE_MOTIVO = indexar([
  [0, 50, 4], [4, 49, 2], [6, 50, 6],
  [12, 53, 4], [16, 52, 2], [18, 50, 6],
  [24, 50, 4], [28, 49, 2], [30, 47, 6],
  [36, 45, 3], [39, 46, 3], [42, 45, 6],
]);

const JEFE: DefPista = {
  paso: 0.14,
  pasos: 48,
  volumen: 0.88,
  iniciar(m, s, t) {
    return drone(m, s, t, {
      notas: [[36.7, 'sawtooth'], [37.1, 'sawtooth'], [73.4, 'triangle'], [51.9, 'sawtooth']],
      filtro: 300, vol: 0.12, lfo: [0.14, 120], volInt: 0.5, filtroInt: 0.9,
    });
  },
  programar(m, s, paso, t, int) {
    const p = paso % 12;
    const c = Math.floor((paso % 48) / 12);
    const fuerte = p === 0 || p === 3 || p === 6 || p === 8 || p === 10;
    // Percusión pesada.
    if (p === 0) bombo(m, s, t, 0.8, 90, 36, 0.34);
    if (p === 6) bombo(m, s, t, 0.65, 95, 38, 0.3);
    if (p === 3 || p === 9) bombo(m, s, t, 0.32, 130, 60, 0.18);
    if (int > 0.3 && (p === 8 || p === 10)) bombo(m, s, t, 0.42, 100, 42, 0.22);
    if (int > 0.3 && fuerte) tarima(m, s, humano(t), 0.2);
    if (int > 0.75 && p % 2 === 0) tarima(m, s, humano(t) + this.paso / 2, 0.11);
    if (int > 0.75 && (p === 3 || p === 9)) slap(m, s, t, 0.28);
    if (p === 3 || p === 9) ruido(m, s, t, 0.16, 0.1, { filtro: 'lowpass', frec: 1600, envio: 0.4 });
    // Motivo ominoso (cuerda grave frotada, a la octava con intensidad).
    const nota = JEFE_MOTIVO.get(paso % 48);
    if (nota) {
      const dur = nota[1] * this.paso;
      const o = { tipo: 'sawtooth' as const, filtro: 1500, ataque: 0.07, vibrato: 5.5, vibratoProf: 22, envio: 0.45 };
      tono(m, s, t, mtof(nota[0]), dur, 0.07, o);
      if (int > 0.3) tono(m, s, t, mtof(nota[0] + 12), dur, 0.04, o);
      if (int > 0.75) tono(m, s, t, mtof(nota[0] + 6), dur, 0.025, o); // tritono: el horror crece
    }
    // Coro amenazante en la última fase.
    if (int > 0.75 && p === 0 && c % 2 === 0) {
      [62, 63, 69].forEach((n, i) => coro(m, s, t, n, 10 * this.paso, 0.03, ALTAR_VOCAL[i], (i - 1) * 0.5));
    }
  },
};

export const PISTAS_N03: Record<string, DefPista> = {
  n03_pueblo: PUEBLO,
  n03_lago: LAGO,
  n03_altar: ALTAR,
  n03_jefe: JEFE,
};

// ── Efectos ───────────────────────────────────────────────────────────────────

export const EFECTOS_N03: Record<string, Sintetizador> = {
  escudo_on: (m, d, t) => {
    tono(m, d, t, 280, 0.28, 0.12, { tipo: 'triangle', hasta: 880, envio: 0.3 });
    tono(m, d, t + 0.05, 560, 0.25, 0.07, { hasta: 1320, envio: 0.4 });
    campana(m, d, t + 0.12, mtof(91), 0.5, 0.05, 0.6);
    ruido(m, d, t, 0.25, 0.05, { filtro: 'highpass', frec: 4000, ataque: 0.1 });
    return 0.6;
  },
  escudo_off: (m, d, t) => {
    tono(m, d, t, 880, 0.2, 0.1, { tipo: 'triangle', hasta: 260 });
    tono(m, d, t, 1320, 0.14, 0.05, { hasta: 500 });
    return 0.22;
  },
  escudo_golpe: (m, d, t) => {
    campana(m, d, t, rnd(480, 560), 0.45, 0.14, 0.4);
    tono(m, d, t, 170, 0.12, 0.25, { hasta: 70 });
    ruido(m, d, t, 0.06, 0.2, { filtro: 'highpass', frec: 3500 });
    return 0.5;
  },
  escudo_roto: (m, d, t) => {
    ruido(m, d, t, 0.55, 0.3, { filtro: 'highpass', frec: 5000, hasta: 1500, envio: 0.5 });
    for (let i = 0; i < 6; i++) {
      tono(m, d, t + i * 0.045, rnd(1400, 3200), 0.2, 0.06, { tipo: 'triangle', hasta: rnd(500, 900), envio: 0.5 });
    }
    tono(m, d, t, 150, 0.4, 0.3, { hasta: 40 });
    campana(m, d, t + 0.1, mtof(79), 0.8, 0.07, 0.8);
    return 0.9;
  },
  luna_on: (m, d, t) => {
    pad(m, d, t, [57, 64, 69, 76], 1.4, 0.05, 2200);
    tono(m, d, t, 330, 1.0, 0.08, { hasta: 990, ataque: 0.3, vibrato: 5, vibratoProf: 25, envio: 0.6 });
    campana(m, d, t + 0.35, mtof(93), 1.4, 0.05, 0.9);
    return 1.6;
  },
  luna_off: (m, d, t) => {
    tono(m, d, t, 990, 0.6, 0.07, { hasta: 300, vibrato: 5, vibratoProf: 25, envio: 0.5 });
    pad(m, d, t, [57, 64, 69], 0.6, 0.03, 1200);
    return 0.8;
  },
  luz: (m, d, t) => {
    [86, 91, 95, 98, 103].forEach((n, i) => campana(m, d, t + i * 0.05, mtof(n), 0.9, 0.08, 0.7));
    ruido(m, d, t, 0.5, 0.06, { filtro: 'highpass', frec: 6000, ataque: 0.1, envio: 0.5 });
    tono(m, d, t, 660, 0.4, 0.07, { tipo: 'triangle', hasta: 1320, envio: 0.4 });
    return 1.1;
  },
  sol: (m, d, t) => {
    tono(m, d, t, 180, 0.5, 0.2, { tipo: 'sawtooth', hasta: 720, filtro: 2400, ataque: 0.04, envio: 0.4 });
    tono(m, d, t, 270, 0.45, 0.12, { tipo: 'square', hasta: 1080, filtro: 2000 });
    ruido(m, d, t, 0.45, 0.2, { filtro: 'bandpass', frec: 600, hasta: 4500, q: 1.2, ataque: 0.05, envio: 0.4 });
    [74, 81, 86, 90].forEach((n, i) => campana(m, d, t + 0.18 + i * 0.05, mtof(n), 0.9, 0.07, 0.7));
    tono(m, d, t, 90, 0.3, 0.3, { hasta: 45 });
    return 1.1;
  },
  encapuchado_alerta: (m, d, t) => {
    ruido(m, d, t, 0.22, 0.14, { filtro: 'bandpass', frec: 900, hasta: 1900, q: 2, ataque: 0.05 });
    tono(m, d, t, 190, 0.16, 0.1, { tipo: 'square', hasta: 280, filtro: 900 });
    tono(m, d, t + 0.14, 300, 0.2, 0.1, { tipo: 'square', hasta: 210, filtro: 1000 });
    return 0.4;
  },
  encapuchado_golpe: (m, d, t) => {
    ruido(m, d, t, 0.13, 0.22, { filtro: 'lowpass', frec: 1400, hasta: 300 });
    tono(m, d, t, 150, 0.14, 0.26, { tipo: 'triangle', hasta: 60 });
    return 0.16;
  },
  encapuchado_cae: (m, d, t) => {
    tono(m, d, t, 130, 0.2, 0.25, { hasta: 55 });
    ruido(m, d, t + 0.05, 0.9, 0.2, { filtro: 'bandpass', frec: 1100, hasta: 220, q: 0.9, ataque: 0.05, envio: 0.5 });
    ruido(m, d, t + 0.1, 0.6, 0.1, { filtro: 'highpass', frec: 2500, hasta: 800, ataque: 0.08 });
    tono(m, d, t + 0.1, 320, 0.7, 0.07, { tipo: 'triangle', hasta: 110, envio: 0.5 });
    return 1.0;
  },
  proyectil_oscuro: (m, d, t) => {
    ruido(m, d, t, 0.4, 0.16, { filtro: 'bandpass', frec: 1600, hasta: 380, q: 1.6, ataque: 0.03 });
    tono(m, d, t, 240, 0.35, 0.14, { tipo: 'sawtooth', hasta: 100, filtro: 700, vibrato: 14, vibratoProf: 40 });
    return 0.42;
  },
  espiritu_aparece: (m, d, t) => {
    tono(m, d, t, 880, 0.9, 0.06, { hasta: 640, ataque: 0.25, vibrato: 4.5, vibratoProf: 35, envio: 0.8 });
    tono(m, d, t, 932, 0.9, 0.045, { hasta: 676, ataque: 0.3, vibrato: 4, vibratoProf: 30, envio: 0.8 });
    ruido(m, d, t, 0.8, 0.04, { filtro: 'highpass', frec: 4500, ataque: 0.3, envio: 0.6 });
    return 1.0;
  },
  espiritu_purificar: (m, d, t) => {
    tono(m, d, t, 440, 0.8, 0.07, { hasta: 1320, ataque: 0.1, envio: 0.7 });
    [91, 88, 86, 83, 79].forEach((n, i) => campana(m, d, t + i * 0.1, mtof(n), 1.1, 0.07, 0.8));
    pad(m, d, t + 0.1, [67, 71, 74, 79], 1.2, 0.035, 2400);
    return 1.6;
  },
  olmeca_onda: (m, d, t) => {
    tono(m, d, t, 82, 0.8, 0.5, { hasta: 26, filtro: 400 });
    ruido(m, d, t, 0.8, 0.35, { filtro: 'lowpass', frec: 700, hasta: 70, envio: 0.4 });
    tono(m, d, t + 0.1, 48, 0.9, 0.25, { tipo: 'triangle', hasta: 30, envio: 0.4 });
    return 0.95;
  },
  olmeca_laser: (m, d, t) => {
    tono(m, d, t, 1800, 0.7, 0.13, { tipo: 'sawtooth', hasta: 280, filtro: 4200, vibrato: 30, vibratoProf: 60 });
    tono(m, d, t, 900, 0.7, 0.1, { tipo: 'square', hasta: 140, filtro: 2200, ataque: 0.04 });
    ruido(m, d, t, 0.6, 0.12, { filtro: 'highpass', frec: 3000, ataque: 0.04 });
    return 0.75;
  },
  olmeca_rugido: (m, d, t) => {
    tono(m, d, t, 58, 1.7, 0.34, { tipo: 'sawtooth', hasta: 36, filtro: 500, vibrato: 7, vibratoProf: 70, ataque: 0.15, envio: 0.5 });
    tono(m, d, t, 90, 1.5, 0.2, { tipo: 'square', hasta: 52, filtro: 420, ataque: 0.15 });
    ruido(m, d, t, 1.6, 0.3, { filtro: 'lowpass', frec: 600, hasta: 130, ataque: 0.12, envio: 0.4 });
    for (let i = 0; i < 7; i++) ruido(m, d, t + rnd(0.1, 1.5), 0.05, 0.18, { filtro: 'bandpass', frec: rnd(500, 1500), q: 3 });
    return 1.9;
  },
  olmeca_invoca: (m, d, t) => {
    [50, 56, 62].forEach((n, i) => coro(m, d, t + i * 0.12, n + 12, 1.4, 0.04, i === 1 ? 'a' : 'o'));
    tono(m, d, t, 110, 1.3, 0.13, { tipo: 'sawtooth', hasta: 330, filtro: 900, ataque: 0.5, envio: 0.6 });
    ruido(m, d, t, 1.2, 0.07, { filtro: 'bandpass', frec: 1500, hasta: 4000, q: 2, ataque: 0.5, envio: 0.6 });
    campana(m, d, t + 0.9, mtof(72), 1.6, 0.06, 0.9);
    campana(m, d, t + 0.9, mtof(78), 1.6, 0.04, 0.9);
    return 2.1;
  },
  balam_maullido: (m, d, t) => {
    const v = rnd(0.95, 1.08);
    const o = { tipo: 'sawtooth' as const, filtro: 2200, ataque: 0.04, envio: 0.15 };
    tono(m, d, t, 520 * v, 0.17, 0.1, { ...o, hasta: 930 * v });
    tono(m, d, t + 0.16, 930 * v, 0.34, 0.1, { ...o, hasta: 460 * v, vibrato: 7, vibratoProf: 40 });
    ruido(m, d, t, 0.45, 0.04, { filtro: 'bandpass', frec: 1800, q: 1.5, ataque: 0.05 });
    return 0.55;
  },
  jaula_abrir: (m, d, t) => {
    tono(m, d, t, 1900, 0.35, 0.05, { tipo: 'square', hasta: 1250, filtro: 2600, vibrato: 18, vibratoProf: 120 });
    ruido(m, d, t, 0.3, 0.09, { filtro: 'bandpass', frec: 3000, hasta: 1800, q: 4 });
    tono(m, d, t + 0.32, 1300, 0.09, 0.14, { tipo: 'triangle', hasta: 380 });
    ruido(m, d, t + 0.32, 0.07, 0.2, { filtro: 'highpass', frec: 2500 });
    campana(m, d, t + 0.34, mtof(80), 0.4, 0.04, 0.3);
    return 0.7;
  },
};

export const MAX_VOCES_N03: Record<string, number> = {
  escudo_on: 1,
  escudo_off: 1,
  escudo_roto: 1,
  luna_on: 1,
  luna_off: 1,
  luz: 2,
  sol: 2,
  encapuchado_cae: 3,
  olmeca_onda: 2,
  olmeca_laser: 2,
  olmeca_rugido: 1,
  olmeca_invoca: 1,
  balam_maullido: 1,
  espiritu_aparece: 3,
  espiritu_purificar: 2,
};
