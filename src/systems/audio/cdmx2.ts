/**
 * Nivel 7 (CDMX parte 2): pistas procedurales y efectos sintetizados.
 *
 * Pistas (se piden con `bus.emit('music', { track })`):
 *  - n07_teleferico: tormenta (lluvia, viento, truenos lejanos), pulso tenso y ascenso continuo.
 *  - n07_torre:      electrónica / mecánica tensa en mi frigio, con coro lejano.
 *  - n07_salon:      coro oscuro y solemne en re menor, campana grave y timbal lejano.
 *  - n07_jefe:       el Rey del Olvido; combate intenso con coro. Intensidad 0 / 0.55 / 1 = fases 1 / 2 / 3.
 *  - n07_llorona:    "La Llorona" (melodía tradicional mexicana, dominio público) en un ARREGLO PROPIO:
 *                    guitarra y requinto de cuerda pulsada sintetizada (Karplus-Strong), 3/4 lento en re menor.
 *                    La armonía, el acompañamiento y la orquestación son originales; no se usa ninguna grabación.
 */
import { bombo, campana, mtof, pad, pulsar, ruido, slap, tono, type Motor } from './motor';
import { coro, drone, ruidoContinuo, unir } from './catemaco';
import { bus } from '../../core/bus';
import type { DefPista } from './musica';

type Sintetizador = (m: Motor, d: AudioNode, t: number) => number;
type Frase = Array<[number, number, number]>; // [paso, midi, duración en pasos]

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const humano = (t: number) => t + (Math.random() - 0.5) * 0.01;
const indexar = (f: Frase) => new Map(f.map(([p, n, l]) => [p, [n, l] as const]));

// ── Primitivas propias ────────────────────────────────────────────────────────

/** Trueno: chasquido opcional, retumbo grave que cae y réplicas que ruedan. Devuelve la duración. */
function trueno(m: Motor, d: AudioNode, t: number, vol: number, cerca = true): number {
  if (cerca) ruido(m, d, t, 0.07, vol * 0.9, { filtro: 'highpass', frec: 2200 });
  ruido(m, d, t + 0.04, 2.6, vol, { filtro: 'lowpass', frec: cerca ? 420 : 240, hasta: 55, ataque: 0.12, envio: 0.6 });
  tono(m, d, t + 0.05, 52, 2.0, vol * 0.9, { hasta: 27, ataque: 0.1, filtro: 160, envio: 0.5 });
  for (let i = 0; i < 4; i++) {
    ruido(m, d, t + 0.5 + i * rnd(0.3, 0.5), 0.7, vol * (0.55 - i * 0.1), { filtro: 'lowpass', frec: rnd(150, 300), hasta: 60, ataque: 0.1, envio: 0.5 });
  }
  return 3.2;
}

/** Alarido espectral: voz que sube y cae, con vibrato, soplo y formante. */
function alarido(m: Motor, d: AudioNode, t: number, vol: number, dur: number, base = 520): void {
  const subida = dur * 0.45;
  tono(m, d, t, base, subida, vol, { tipo: 'sawtooth', hasta: base * 2.5, filtro: 3000, vibrato: 6.5, vibratoProf: 60, ataque: 0.12, envio: 0.9 });
  tono(m, d, t + subida, base * 2.5, dur - subida, vol, { tipo: 'sawtooth', hasta: base * 0.7, filtro: 2600, vibrato: 7.5, vibratoProf: 90, ataque: 0.02, envio: 0.9 });
  tono(m, d, t, base * 1.005, dur, vol * 0.5, { tipo: 'triangle', hasta: base * 1.6, vibrato: 5.2, vibratoProf: 40, ataque: 0.15, envio: 0.9 });
  ruido(m, d, t, dur, vol * 0.6, { filtro: 'bandpass', frec: base * 2, hasta: base * 3.4, q: 6, ataque: 0.15, envio: 0.9 });
}

// ── n07_teleferico ────────────────────────────────────────────────────────────

const ASCENSO = [50, 53, 57, 60, 62, 65, 69, 72]; // re menor subiendo, una nota cada 2 s

const TELEFERICO: DefPista = {
  paso: 0.25,
  pasos: 64,
  volumen: 0.85,
  iniciar(m, s, t) {
    return unir(
      ruidoContinuo(m, s, t, { filtro: 'highpass', frec: 3200, q: 0.5, vol: 0.06, oleaje: 0.15 }), // lluvia
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 480, q: 0.8, vol: 0.05, barrido: [0.07, 320] }), // viento
      drone(m, s, t, { notas: [[55, 'sawtooth'], [55.45, 'sawtooth'], [82.4, 'triangle']], filtro: 240, vol: 0.05, lfo: [0.09, 70], volInt: 0.4 }),
    );
  },
  programar(m, s, paso, t, int) {
    const c = paso % 64;
    // Pulso tenso (doble latido).
    if (c % 8 === 0) tono(m, s, t, 54, 0.36, 0.16, { hasta: 34, envio: 0.3 });
    if (c % 8 === 2) tono(m, s, t, 50, 0.3, 0.09, { hasta: 33, envio: 0.3 });
    // Pedal de cuerda grave en corcheas.
    if (c % 4 === 0) tono(m, s, t, mtof(38), 0.2, 0.032 + int * 0.02, { tipo: 'sawtooth', filtro: 600 });
    // Ascenso: una nota por cada 8 pasos, subiendo y reiniciando cada vuelta.
    if (c % 8 === 0) {
      const n = ASCENSO[Math.floor(c / 8)];
      tono(m, s, t, mtof(n), 2.2, 0.05, { tipo: 'triangle', ataque: 0.4, envio: 0.75 });
      tono(m, s, t, mtof(n + 12), 1.6, 0.018, { ataque: 0.5, envio: 0.8 });
    }
    // Riser antes de reiniciar el ascenso.
    if (c === 56) ruido(m, s, t, 2.0, 0.045, { filtro: 'bandpass', frec: 400, hasta: 3200, q: 1.5, ataque: 1.6, envio: 0.4 });
    // Truenos lejanos y crujido del cable.
    if (c % 8 === 3 && Math.random() < 0.085) trueno(m, s, t, 0.1, false);
    if (c === 20 && Math.random() < 0.5) tono(m, s, t, 170, 1.2, 0.025, { tipo: 'sawtooth', hasta: 235, filtro: 520, vibrato: 3, vibratoProf: 40, ataque: 0.3, envio: 0.5 });
  },
};

// ── n07_torre ─────────────────────────────────────────────────────────────────

const SEC_TORRE = indexar([
  [0, 40, 2], [3, 40, 1], [4, 41, 2], [7, 40, 1], [8, 43, 2], [11, 40, 1], [12, 41, 2], [14, 38, 1],
]);

const TORRE: DefPista = {
  paso: 0.15,
  pasos: 64,
  volumen: 0.82,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[41.2, 'sawtooth'], [41.65, 'sawtooth'], [61.7, 'triangle']], filtro: 200, vol: 0.07, lfo: [0.08, 60], volInt: 0.4 }),
      ruidoContinuo(m, s, t, { filtro: 'lowpass', frec: 420, q: 0.7, vol: 0.022, oleaje: 0.2 }), // zumbido de maquinaria
    );
  },
  programar(m, s, paso, t, int) {
    const c = paso % 64;
    const p = c % 16;
    // Secuencia mecánica de bajo cuadrado.
    const nota = SEC_TORRE.get(p);
    if (nota) tono(m, s, t, mtof(nota[0]), nota[1] * this.paso, 0.075 + int * 0.03, { tipo: 'square', filtro: 520, envio: 0.1 });
    // Pistón / golpe de máquina.
    if (p === 0) bombo(m, s, t, 0.3, 90, 40, 0.2);
    if (p === 8) ruido(m, s, t, 0.12, 0.08, { filtro: 'lowpass', frec: 500 });
    // Relojería de relés.
    if (p % 2 === 1) ruido(m, s, t, 0.012, 0.02 + (p % 4 === 3 ? 0.012 : 0), { filtro: 'highpass', frec: 5200 });
    // Alarma lejana de consola.
    if (c === 28 || c === 31) tono(m, s, t, 1320, 0.05, 0.022, { tipo: 'square', filtro: 3000, envio: 0.5 });
    // Clangs de metal.
    if (p === 12 && Math.random() < 0.3) campana(m, s, t, mtof(rnd(53, 65)), 2.4, 0.03, 0.9);
    // Coro lejano, sostenido, a distancia (quinta abierta sobre mi).
    if (c % 32 === 0) {
      coro(m, s, t, 52, 32 * this.paso, 0.026, 'u', -0.3);
      coro(m, s, t + 0.4, 59, 32 * this.paso - 0.4, 0.02, 'o', 0.3);
    }
  },
};

// ── n07_salon ─────────────────────────────────────────────────────────────────

// Dm – Bb – Gm – A (con tercera mayor): solemne, con caída trágica.
const ACORDES_SALON: number[][] = [
  [50, 57, 65, 69],
  [46, 53, 62, 65],
  [43, 50, 58, 62],
  [45, 52, 61, 64],
];

const SALON: DefPista = {
  paso: 0.5,
  pasos: 32,
  volumen: 0.85,
  iniciar(m, s, t) {
    return drone(m, s, t, { notas: [[36.7, 'sawtooth'], [36.95, 'sawtooth'], [55, 'triangle']], filtro: 190, vol: 0.065, lfo: [0.05, 50], volInt: 0.3 });
  },
  programar(m, s, paso, t) {
    const c = paso % 32;
    const ac = ACORDES_SALON[Math.floor(c / 8) % 4];
    if (c % 8 === 0) {
      const vocales = ['o', 'u', 'a', 'o'] as const;
      ac.forEach((n, i) => coro(m, s, t + i * 0.12, n, 8 * this.paso, 0.026, vocales[i], (i - 1.5) * 0.3));
      pad(m, s, t, [ac[0] - 12, ac[1]], 8 * this.paso, 0.025, 700);
      campana(m, s, t, mtof(ac[0] + 24), 3.4, 0.03, 0.9);
    }
    // Tañido grave cada dos acordes y timbal solemne.
    if (c % 16 === 0) campana(m, s, t + 0.05, mtof(50), 4.5, 0.05, 0.95);
    if (c % 8 === 4) tono(m, s, t, 62, 0.8, 0.12, { hasta: 38, filtro: 220, envio: 0.6 });
  },
};

// ── n07_jefe (Rey del Olvido) ─────────────────────────────────────────────────

const BAJO_JEFE = new Map<number, number>([[0, 38], [2, 38], [3, 38], [5, 41], [7, 38], [8, 43], [10, 43], [12, 41], [14, 40]]);
const RAICES_JEFE = [38, 46, 43, 45];

const JEFE: DefPista = {
  paso: 0.13,
  pasos: 64,
  volumen: 0.88,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[73.4, 'sawtooth'], [73.9, 'sawtooth'], [110.2, 'triangle']], filtro: 300, vol: 0.09, lfo: [0.14, 90], volInt: 0.5, filtroInt: 0.8 }),
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 1100, q: 0.7, vol: 0.014, barrido: [0.1, 350] }),
    );
  },
  programar(m, s, paso, t, int) {
    const c = paso % 64;
    const p = c % 16;
    const bloque = Math.floor(c / 16) % 4;
    const raiz = RAICES_JEFE[bloque];
    // Ostinato de bajo que sigue la raíz del compás.
    const b = BAJO_JEFE.get(p);
    if (b !== undefined) {
      const n = b + (raiz - 38);
      tono(m, s, humano(t), mtof(n), 0.13, 0.1, { tipo: 'sawtooth', filtro: 850 + int * 500 });
      if (int > 0.5) tono(m, s, t, mtof(n + 12), 0.1, 0.03, { tipo: 'square', filtro: 1400 });
    }
    // Percusión: bombo cada dos corcheas, palmada en contratiempo.
    if (p % 4 === 0) bombo(m, s, t, 0.48, 110, 44, 0.22);
    if (p === 6 || p === 14) bombo(m, s, t, 0.3, 100, 46, 0.16);
    if (p === 4 || p === 12) slap(m, s, t, 0.26);
    if (p % 2 === 1) ruido(m, s, t, 0.02, 0.02 + int * 0.02, { filtro: 'highpass', frec: 7000 });
    // Coro: acordes cada 16 pasos; más voces al subir la intensidad.
    if (p === 0) {
      const ac = ACORDES_SALON[bloque];
      const dur = 16 * this.paso;
      coro(m, s, t, ac[1] + 12, dur, 0.036, 'a', -0.3);
      coro(m, s, t, ac[3] + 12, dur, 0.032, 'a', 0.3);
      if (int > 0.5) coro(m, s, t + 0.03, ac[2] + 12, dur, 0.03, 'o', 0);
      if (int > 0.95) coro(m, s, t + 0.05, ac[0] + 24, dur, 0.024, 'a', 0.15);
    }
    // Estocadas metálicas.
    if (p === 6 && int > 0.5) campana(m, s, t, mtof(86), 1.2, 0.04, 0.8);
    if (p === 14 && Math.random() < 0.5) tono(m, s, t, mtof(63 + (bloque === 1 ? -1 : 0)), 0.12, 0.045, { tipo: 'sawtooth', filtro: 1500 });
    // Riser antes de cerrar el bucle.
    if (c === 56) ruido(m, s, t, 0.9, 0.05, { filtro: 'bandpass', frec: 500, hasta: 4000, q: 1.5, ataque: 0.7, envio: 0.3 });
  },
};

// ── n07_llorona ───────────────────────────────────────────────────────────────

/**
 * Melodía de "La Llorona" (tradicional, dominio público), re menor, 3/4 (6 corcheas por compás),
 * transcrita aquí nota por nota para este arreglo: [corchea, nota MIDI, duración en corcheas].
 * Frases: A (compases 1-4) · B, el estribillo (5-8) · A' (9-12), que cierra en la tónica.
 */
const MELODIA_LLORONA: Frase = [
  // Compás 1-4 (A)
  [0, 74, 3], [3, 74, 1], [4, 72, 1], [5, 70, 1],
  [6, 69, 3], [9, 69, 1], [10, 70, 1], [11, 72, 1],
  [12, 74, 3], [15, 77, 2], [17, 76, 1],
  [18, 76, 3], [21, 73, 3],
  // Compás 5-8 (B)
  [24, 69, 3], [27, 74, 2], [29, 76, 1],
  [30, 77, 3], [33, 76, 1], [34, 74, 1], [35, 72, 1],
  [36, 70, 3], [39, 69, 2], [41, 67, 1],
  [42, 69, 6],
  // Compás 9-12 (A')
  [48, 74, 3], [51, 74, 1], [52, 72, 1], [53, 70, 1],
  [54, 69, 3], [57, 69, 1], [58, 70, 1], [59, 72, 1],
  [60, 69, 3], [63, 73, 2], [65, 76, 1],
  [66, 74, 6],
];
const MELODIA_IDX = indexar(MELODIA_LLORONA);

type Acorde = 'Dm' | 'Gm' | 'A7' | 'Bb';
const ARMONIA_LLORONA: Acorde[] = ['Dm', 'Dm', 'Gm', 'A7', 'Dm', 'Gm', 'Bb', 'A7', 'Dm', 'Dm', 'A7', 'Dm'];
const ARPEGIO: Record<Acorde, number[]> = {
  Dm: [62, 65, 69],
  Gm: [62, 67, 70],
  A7: [61, 64, 67],
  Bb: [62, 65, 70],
};
const BAJO_LLORONA: Record<Acorde, number> = { Dm: 38, Gm: 43, A7: 45, Bb: 46 };

const LLORONA: DefPista = {
  paso: 0.42, // corchea; negra ≈ 0,84 s (≈ 71 ppm): lento, de lamento
  pasos: 72,
  volumen: 0.85,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[36.7, 'sine'], [73.4, 'triangle']], filtro: 200, vol: 0.03, lfo: [0.05, 40] }),
      ruidoContinuo(m, s, t, { filtro: 'lowpass', frec: 520, q: 0.8, vol: 0.02, oleaje: 0.1 }), // agua lejana
    );
  },
  programar(m, s, paso, t) {
    const c = paso % 72;
    const compas = Math.floor(c / 6);
    const p = c % 6;
    const ac = ARMONIA_LLORONA[compas];
    const nt = ARPEGIO[ac];
    // Guitarra: bajo en el 1, acompañamiento arpegiado en el 2 y el 3 (negras con puntillo en feel de 3/4).
    if (p === 0) pulsar(m, s, humano(t), BAJO_LLORONA[ac], 0.3, 0.3, 2.2, 0.18, -0.15);
    if (p === 2) pulsar(m, s, humano(t), nt[1], 0.11, 0.42, 1.2, 0.3, 0.1);
    if (p === 3) pulsar(m, s, humano(t), nt[2], 0.09, 0.45, 1.0, 0.3, 0.15);
    if (p === 4) pulsar(m, s, humano(t), nt[1] + 12, 0.08, 0.5, 1.0, 0.3, 0.2);
    // Requinto: la melodía, con un leve rubato humano y reverb de cuarto grande.
    const nota = MELODIA_IDX.get(c);
    if (nota) {
      const dur = nota[1] * this.paso;
      pulsar(m, s, humano(t), nota[0], 0.25, 0.62, dur + 0.7, 0.5, 0.18);
      if (dur > 1.0) pulsar(m, s, humano(t) + 0.28, nota[0], 0.07, 0.5, dur * 0.7, 0.5, 0.18); // trémolo de nota larga
    }
    // Un coro fantasmal apenas audible al inicio de cada frase, y un lamento lejano.
    if (c % 24 === 0) coro(m, s, t, ARPEGIO[ac][0] + 12, 24 * this.paso, 0.014, 'u', -0.25);
    if (c === 36 && Math.random() < 0.55) {
      tono(m, s, t, 880, 1.8, 0.013, { hasta: 640, vibrato: 5.5, vibratoProf: 60, ataque: 0.5, envio: 1 });
    }
  },
};

export const PISTAS_N07: Record<string, DefPista> = {
  n07_teleferico: TELEFERICO,
  n07_torre: TORRE,
  n07_salon: SALON,
  n07_jefe: JEFE,
  n07_llorona: LLORONA,
};

/** Pistas del Nivel 7 que reaccionan a la intensidad del jefe (fases 1 / 2 / 3 → 0 / 0.55 / 1). */
export const PISTAS_N07_INTENSIDAD = new Set(['n07_jefe']);

// ── Efectos ───────────────────────────────────────────────────────────────────

export const EFECTOS_N07: Record<string, Sintetizador> = {
  trueno: (m, d, t) => trueno(m, d, t, 0.34, true),
  relampago: (m, d, t) => {
    // Chasquido eléctrico seguido, un instante después, del trueno.
    ruido(m, d, t, 0.18, 0.28, { filtro: 'highpass', frec: 3000, hasta: 8000 });
    tono(m, d, t, 2400, 0.12, 0.06, { tipo: 'sawtooth', hasta: 400, filtro: 5000 });
    for (let i = 0; i < 5; i++) ruido(m, d, t + rnd(0, 0.25), 0.02, 0.15, { filtro: 'highpass', frec: rnd(4000, 7000) });
    return trueno(m, d, t + rnd(0.35, 0.8), 0.3, false) + 0.8;
  },
  llorona_grito: (m, d, t) => {
    // Grito espectral: el lamento sube y cae; coro disonante debajo y un eco desafinado.
    alarido(m, d, t, 0.15, 1.9, 520);
    alarido(m, d, t + 0.18, 0.07, 1.8, 610);
    coro(m, d, t + 0.05, 62, 1.8, 0.04, 'a', -0.3);
    coro(m, d, t + 0.05, 63, 1.8, 0.03, 'a', 0.3);
    ruido(m, d, t, 0.4, 0.14, { filtro: 'highpass', frec: 3500, hasta: 1500, envio: 0.5 });
    return 2.6;
  },
  corona_golpe: (m, d, t) => {
    // Golpe de metal sobre cristal: impacto, resonancia y chispa.
    ruido(m, d, t, 0.05, 0.3, { filtro: 'highpass', frec: 2500 });
    tono(m, d, t, 160, 0.14, 0.26, { hasta: 70 });
    campana(m, d, t, mtof(88), 0.9, 0.12, 0.8);
    campana(m, d, t + 0.02, mtof(81), 1.1, 0.08, 0.8);
    return 1.1;
  },
  corona_rota: (m, d, t) => {
    // Cristal que estalla, campanada que se desafina y un respiro del olvido.
    ruido(m, d, t, 0.12, 0.34, { filtro: 'highpass', frec: 3000 });
    for (let i = 0; i < 12; i++) tono(m, d, t + rnd(0, 0.5), rnd(2000, 5200), 0.1, 0.07, { filtro: 7000, envio: 0.5 });
    tono(m, d, t, 130, 0.5, 0.3, { hasta: 38 });
    campana(m, d, t + 0.08, mtof(76), 2.6, 0.12, 0.9);
    tono(m, d, t + 0.08, mtof(76), 2.0, 0.05, { hasta: mtof(70), envio: 0.9, vibrato: 4, vibratoProf: 40 });
    ruido(m, d, t + 0.3, 1.4, 0.1, { filtro: 'lowpass', frec: 2200, hasta: 200, envio: 0.6 });
    pad(m, d, t + 0.5, [50, 57, 62], 2.0, 0.04, 1500);
    return 3.0;
  },
  inversion_aviso: (m, d, t) => {
    // Distorsión mental: dos tonos que se desafinan hacia abajo y un barrido invertido.
    tono(m, d, t, 880, 0.55, 0.1, { tipo: 'sawtooth', hasta: 420, filtro: 2400, vibrato: 14, vibratoProf: 120, envio: 0.5 });
    tono(m, d, t, 660, 0.55, 0.1, { tipo: 'square', hasta: 1100, filtro: 1800, vibrato: 11, vibratoProf: 100, envio: 0.5 });
    ruido(m, d, t, 0.5, 0.1, { filtro: 'bandpass', frec: 4000, hasta: 300, q: 2, ataque: 0.04, envio: 0.4 });
    tono(m, d, t + 0.4, 110, 0.4, 0.14, { tipo: 'sawtooth', hasta: 60, filtro: 500 });
    return 0.9;
  },
  inversion_fin: (m, d, t) => {
    // El efecto se disipa: tono limpio que sube.
    tono(m, d, t, 420, 0.3, 0.07, { tipo: 'triangle', hasta: 840, envio: 0.5 });
    campana(m, d, t + 0.18, mtof(86), 0.8, 0.05, 0.7);
    return 1.0;
  },
  maria_transformar: (m, d, t) => {
    // Sugerido, sin mostrarla: agua que sube, coro que se abre y un lamento lejano.
    ruido(m, d, t, 2.4, 0.14, { filtro: 'bandpass', frec: 300, hasta: 1800, q: 0.8, ataque: 1.2, envio: 0.6 });
    pad(m, d, t, [50, 57, 62, 65], 3.2, 0.06, 1600);
    [62, 69, 74].forEach((n, i) => coro(m, d, t + 0.3 + i * 0.25, n, 2.6, 0.04, i === 1 ? 'a' : 'o', (i - 1) * 0.3));
    tono(m, d, t + 1.2, 780, 1.8, 0.07, { hasta: 520, vibrato: 5.5, vibratoProf: 70, ataque: 0.4, envio: 1 });
    [86, 81, 74].forEach((n, i) => campana(m, d, t + 0.6 + i * 0.4, mtof(n), 1.8, 0.05, 0.9));
    tono(m, d, t + 2.0, 44, 1.6, 0.18, { hasta: 30, filtro: 160, ataque: 0.2, envio: 0.5 });
    return 3.8;
  },
  cabina_avance: (m, d, t) => {
    // Suave: crujido de cable y golpecito de polea al pasar por una torre.
    tono(m, d, t, 150, 0.5, 0.03, { tipo: 'sawtooth', hasta: 210, filtro: 460, vibrato: 4, vibratoProf: 50, ataque: 0.15, envio: 0.4 });
    ruido(m, d, t + 0.1, 0.12, 0.05, { filtro: 'bandpass', frec: 900, q: 2 });
    tono(m, d, t + 0.1, 95, 0.14, 0.07, { hasta: 55 });
    return 0.7;
  },
};

// Efectos que piden directamente ReyOlvido.ts, Llorona.ts y Maria.ts (los que tienen evento propio suenan arriba).
const E = EFECTOS_N07;
Object.assign(EFECTOS_N07, {
  rey_corona_golpe: E.corona_golpe,
  rey_corona_rota: E.corona_rota,
  rey_risa: (m, d, t) => {
    // Risa grave y hueca: tres golpes de voz que bajan.
    for (let i = 0; i < 3; i++) coro(m, d, t + i * 0.22, 43 - i, 0.25, 0.08, 'a', 0);
    tono(m, d, t, 90, 0.8, 0.08, { tipo: 'sawtooth', hasta: 60, filtro: 400, envio: 0.6 });
    return 1.2;
  },
  rey_pulso_carga: (m, d, t) => {
    tono(m, d, t, 180, 1.0, 0.08, { tipo: 'sawtooth', hasta: 520, filtro: 1400, vibrato: 9, vibratoProf: 60, ataque: 0.4, envio: 0.5 });
    return 1.1;
  },
  rey_pulso: (m, d, t) => {
    tono(m, d, t, 300, 0.5, 0.16, { tipo: 'square', hasta: 70, filtro: 1200, envio: 0.6 });
    ruido(m, d, t, 0.4, 0.12, { filtro: 'bandpass', frec: 2000, hasta: 300, q: 1.5 });
    return 0.8;
  },
  rey_corona_carga: (m, d, t) => {
    campana(m, d, t, mtof(84), 0.9, 0.05, 0.8);
    tono(m, d, t, 600, 0.8, 0.06, { tipo: 'triangle', hasta: 1500, ataque: 0.5, envio: 0.6 });
    return 1.0;
  },
  rey_rayo: (m, d, t) => {
    tono(m, d, t, 1400, 0.6, 0.12, { tipo: 'sawtooth', hasta: 300, filtro: 3000, envio: 0.4 });
    ruido(m, d, t, 0.6, 0.14, { filtro: 'highpass', frec: 2500 });
    return 0.8;
  },
  rey_onda: (m, d, t) => {
    tono(m, d, t, 70, 0.5, 0.22, { hasta: 35, filtro: 300, envio: 0.4 });
    ruido(m, d, t, 0.3, 0.1, { filtro: 'lowpass', frec: 600 });
    return 0.6;
  },
  rey_clones: (m, d, t) => {
    [64, 67, 71].forEach((n, i) => coro(m, d, t + i * 0.08, n, 0.9, 0.035, 'o', (i - 1) * 0.4));
    return 1.1;
  },
  rey_clon_disipa: (m, d, t) => {
    ruido(m, d, t, 0.35, 0.09, { filtro: 'bandpass', frec: 1800, hasta: 5000, q: 2 });
    campana(m, d, t, mtof(91), 0.5, 0.03, 0.7);
    return 0.6;
  },
  rey_corona_expuesta: (m, d, t) => {
    [79, 83, 86].forEach((n, i) => campana(m, d, t + i * 0.1, mtof(n), 1.0, 0.05, 0.8));
    return 1.3;
  },
  rey_vulnerable: (m, d, t) => {
    [74, 81].forEach((n, i) => campana(m, d, t + i * 0.15, mtof(n), 1.2, 0.06, 0.85));
    return 1.4;
  },
  rey_corona_rebote: (m, d, t) => {
    tono(m, d, t, 900, 0.15, 0.08, { tipo: 'square', hasta: 1300, filtro: 3000 });
    return 0.3;
  },
  rey_sello: (m, d, t) => {
    pad(m, d, t, [62, 69, 74], 1.4, 0.05, 1800);
    campana(m, d, t, mtof(86), 1.4, 0.06, 0.9);
    return 1.6;
  },
  rey_furia: (m, d, t) => {
    tono(m, d, t, 110, 0.7, 0.18, { tipo: 'sawtooth', hasta: 55, filtro: 700, vibrato: 12, vibratoProf: 50 });
    coro(m, d, t, 40, 0.7, 0.07, 'a', 0);
    return 0.9;
  },
  rey_cae: (m, d, t) => {
    tono(m, d, t, 120, 1.4, 0.2, { hasta: 30, filtro: 300, envio: 0.6 });
    pad(m, d, t + 0.4, [50, 57, 62], 2.2, 0.04, 1200);
    return 2.6;
  },
  llorona_aparece: (m, d, t) => {
    coro(m, d, t, 62, 1.8, 0.04, 'o', 0);
    tono(m, d, t + 0.3, 700, 1.4, 0.05, { hasta: 520, vibrato: 5.5, vibratoProf: 60, ataque: 0.4, envio: 1 });
    return 2.0;
  },
  llorona_despedida: (m, d, t) => {
    pad(m, d, t, [62, 66, 69, 74], 3.0, 0.05, 2200);
    [74, 78, 81, 86].forEach((n, i) => campana(m, d, t + 0.3 + i * 0.35, mtof(n), 2.0, 0.045, 0.9));
    return 3.4;
  },
} satisfies Record<string, Sintetizador>);

export const MAX_VOCES_N07: Record<string, number> = {
  trueno: 2,
  relampago: 2,
  llorona_grito: 1,
  corona_golpe: 2,
  corona_rota: 1,
  inversion_aviso: 1,
  inversion_fin: 1,
  maria_transformar: 1,
  cabina_avance: 1,
};

// ── Eventos del Nivel 7 ───────────────────────────────────────────────────────

let conectado = false;

/**
 * Engancha los eventos del Nivel 7 al audio. Lo llama `conectarBus()` de Audio.ts una sola vez
 * (el audio es un singleton global, como el resto de los oyentes de Audio.ts, por lo que usa `bus.on`).
 */
export function conectarEventosN07(reproducirSfx: (nombre: string) => void): void {
  if (conectado) return;
  conectado = true;

  bus.on('llorona:scream', () => reproducirSfx('llorona_grito'));

  bus.on('controls:invert', ({ on }) => reproducirSfx(on ? 'inversion_aviso' : 'inversion_fin'));

  // Avance de la cabina: un crujido suave cada cuarto de recorrido.
  let tramoPrev = -1;
  bus.on('cablecar:progress', ({ progress }) => {
    const tramo = Math.floor(Math.max(0, Math.min(1, progress)) * 4);
    if (tramoPrev >= 0 && tramo > tramoPrev) reproducirSfx('cabina_avance');
    tramoPrev = tramo;
  });
}
