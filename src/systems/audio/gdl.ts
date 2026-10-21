/**
 * Nivel 10 (Guadalajara, el final): pistas procedurales y efectos sintetizados. Todo es ORIGINAL.
 *
 * Pistas (se piden con `bus.emit('music', { track })`):
 *  - n10_avenida:     ciudad en ruinas bajo el eclipse. Viento, campanas lejanas y un son jalisciense en clave
 *                     lúgubre (la menor, cadencia andaluza): guitarrón, vihuela y dos trompetas con sordina.
 *  - n10_catedral:    órgano y coro barrocos fusionados con teponaztli y huéhuetl. Tenso, para la oleada.
 *  - n10_tzitzimime:  combate estelar: coro, percusión prehispánica intensa y campanas. Intensidad 0 / 0.55 / 1.
 *  - n10_itzpapalotl: combate final épico. Órgano + coro + huéhuetl y el motivo de ECOS transformado.
 *                     Intensidad 0 / 0.55 / 1 = fases 1 / 2 / 3 (`boss:phase`).
 *  - n10_epilogo:     amanecer: guitarra y cuerdas suaves en sol mayor, con la cita del motivo del juego.
 *
 * Secciones → pista (campo "music" de los JSON de nivel): ver `SECCION_MUSICA_N10`.
 * Sin grabaciones: la armonía, los ritmos y los timbres son propios (inspirados en el son jalisciense,
 * la música de órgano barroca y la percusión prehispánica).
 */
import { campana, mtof, pad, pulsar, rasguear, ruido, slap, tono, type Motor } from './motor';
import { coro, drone, ruidoContinuo, unir } from './catemaco';
import { bus } from '../../core/bus';
import type { DefPista } from './musica';

type Sintetizador = (m: Motor, d: AudioNode, t: number) => number;
type Frase = Array<[number, number, number]>; // [paso, midi, duración en pasos]

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const humano = (t: number) => t + (Math.random() - 0.5) * 0.01;
const indexar = (f: Frase) => new Map(f.map(([p, n, l]) => [p, [n, l] as const]));
const elegir = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** Pista de cada sección del Nivel 10 (coincide con el campo "music" de los JSON). */
export const SECCION_MUSICA_N10: Record<string, string> = {
  gdl_avenida: 'n10_avenida',
  catedral: 'n10_catedral',
  catedral_eclipse: 'n10_tzitzimime',
};

// ── Primitivas propias ────────────────────────────────────────────────────────

/** Tono sostenido (ataque, meseta y liberación) con parciales: base de órgano y cuerdas. */
function sostenido(
  m: Motor,
  d: AudioNode,
  t: number,
  midi: number,
  dur: number,
  vol: number,
  parciales: Array<[number, number]>,
  tipo: OscillatorType = 'sine',
  filtro = 3000,
  ataque = 0.06,
  envio = 0.45,
): void {
  const { ctx } = m;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filtro;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + ataque);
  g.gain.setValueAtTime(vol, t + Math.max(ataque, dur - 0.12));
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
  f.connect(g);
  g.connect(d);
  const e = ctx.createGain();
  e.gain.value = envio;
  g.connect(e);
  e.connect(m.reverb);
  for (const [mult, amp] of parciales) {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.value = mtof(midi) * mult;
    const a = ctx.createGain();
    a.gain.value = amp;
    o.connect(a);
    a.connect(f);
    o.start(t);
    o.stop(t + dur + 0.3);
  }
}

const REGISTRO_ORGANO: Array<[number, number]> = [[0.5, 0.5], [1, 1], [2, 0.55], [3, 0.3], [4, 0.22]];
const REGISTRO_ORGANO_LLENO: Array<[number, number]> = [[0.5, 0.55], [1, 1], [2, 0.7], [3, 0.45], [4, 0.35], [6, 0.18]];

/** Órgano barroco: principal 8', octava, quinta y mixtura. */
function organo(m: Motor, d: AudioNode, t: number, midi: number, dur: number, vol: number, lleno = false): void {
  sostenido(m, d, t, midi, dur, vol, lleno ? REGISTRO_ORGANO_LLENO : REGISTRO_ORGANO, 'triangle', lleno ? 3600 : 2600, 0.05, 0.5);
}

/** Huéhuetl: tambor vertical grave de parche; golpe profundo con soplo de piel. */
function huehuetl(m: Motor, d: AudioNode, t: number, vol: number, grave = false): void {
  tono(m, d, t, grave ? 88 : 105, 0.42, vol, { hasta: grave ? 44 : 52, envio: 0.25 });
  tono(m, d, t, grave ? 170 : 200, 0.12, vol * 0.4, { hasta: 110 });
  ruido(m, d, t, 0.07, vol * 0.45, { filtro: 'bandpass', frec: 1400, q: 0.7 });
}

/** Teponaztli: tambor de madera con lengüetas (dos tonos, alto y bajo), seco y resonante. */
function teponaztli(m: Motor, d: AudioNode, t: number, vol: number, alto: boolean): void {
  const f = alto ? 392 : 294;
  tono(m, d, t, f * 1.02, 0.2, vol, { hasta: f * 0.95, envio: 0.2 });
  tono(m, d, t, f * 2.4, 0.07, vol * 0.3, { hasta: f * 2.1 });
  ruido(m, d, t, 0.025, vol * 0.7, { filtro: 'bandpass', frec: alto ? 2600 : 1900, q: 3 });
}

/** Metal con sordina (trompeta de mariachi lúgubre, o trompa de obsidiana según el filtro). */
function metal(m: Motor, d: AudioNode, t: number, midi: number, dur: number, vol: number, brillo = 1500, pan = 0): void {
  tono(m, d, t, mtof(midi), dur, vol, { tipo: 'sawtooth', filtro: brillo, vibrato: 5, vibratoProf: 14, ataque: 0.05, envio: 0.4, pan });
}

/** Lluvia de tintineos (cristal, estrellas). */
function tintineo(m: Motor, d: AudioNode, t: number, n: number, span: number, vol: number, fmin = 2200, fmax = 6200, dur = 0.12): void {
  for (let i = 0; i < n; i++) tono(m, d, t + rnd(0, span), rnd(fmin, fmax), dur, vol, { filtro: 9000, envio: 0.5 });
}

/** Estruendo de cristal que se rompe. */
function cristalRoto(m: Motor, d: AudioNode, t: number, vol: number): void {
  ruido(m, d, t, 0.12, vol, { filtro: 'highpass', frec: 3200 });
  tintineo(m, d, t + 0.01, 14, 0.5, vol * 0.3);
}

/** Tercera diatónica por debajo en la menor natural (segunda voz de las trompetas). */
const ESCALA_AM = new Set([9, 11, 0, 2, 4, 5, 7]);
function terceraAbajo(n: number): number {
  let x = n;
  let pasos = 0;
  while (pasos < 2) {
    x -= 1;
    if (ESCALA_AM.has(((x % 12) + 12) % 12)) pasos++;
  }
  return ESCALA_AM.has(((n % 12) + 12) % 12) ? x : n - 4;
}

// ── n10_avenida ───────────────────────────────────────────────────────────────

// Cadencia andaluza lúgubre: Am – G – F – E (dos compases de 6/8 por acorde).
const ACORDES_AV = [
  [57, 60, 64, 69],
  [55, 59, 62, 67],
  [53, 57, 60, 65],
  [52, 56, 59, 64],
];
const BAJO_AV = [45, 43, 41, 40];
const QUINTA_AV = [52, 50, 48, 47];
const MELODIA_AV = indexar([
  [0, 76, 3], [3, 72, 2], [5, 74, 1],
  [6, 76, 6],
  [12, 74, 3], [15, 71, 2], [17, 72, 1],
  [18, 74, 6],
  [24, 72, 3], [27, 69, 2], [29, 72, 1],
  [30, 77, 3], [33, 76, 3],
  [36, 71, 3], [39, 68, 2], [41, 71, 1],
  [42, 76, 6],
]);

const AVENIDA: DefPista = {
  paso: 0.24,
  pasos: 48,
  volumen: 0.85,
  iniciar(m, s, t) {
    return unir(
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 520, q: 0.7, vol: 0.05, barrido: [0.06, 300] }), // viento
      ruidoContinuo(m, s, t, { filtro: 'lowpass', frec: 380, q: 0.7, vol: 0.02, oleaje: 0.1 }), // ciudad hueca
      drone(m, s, t, { notas: [[55, 'sine'], [110.3, 'triangle']], filtro: 210, vol: 0.034, lfo: [0.05, 50] }),
    );
  },
  programar(m, s, paso, t) {
    const c = paso % 48;
    const p = c % 6;
    const bloque = Math.floor(c / 12);
    const ac = ACORDES_AV[bloque];
    // Guitarrón: bajo en el 1 y la quinta en el 4 (6/8).
    if (p === 0) pulsar(m, s, humano(t), BAJO_AV[bloque], 0.3, 0.3, 1.5, 0.15, -0.2);
    if (p === 3) pulsar(m, s, humano(t), QUINTA_AV[bloque], 0.22, 0.3, 1.1, 0.12, -0.15);
    // Vihuela: rasgueo seco a contratiempo.
    if (p === 2 || p === 5) rasguear(m, s, humano(t), ac, 0.065, p === 2, 0.45, 0.6);
    // Dos trompetas con sordina en terceras, melodía lenta y quebrada.
    const nota = MELODIA_AV.get(c);
    if (nota) {
      const dur = nota[1] * this.paso;
      metal(m, s, humano(t), nota[0], dur + 0.25, 0.034, 1250, -0.2);
      metal(m, s, humano(t) + 0.012, terceraAbajo(nota[0]), dur + 0.25, 0.026, 1150, 0.2);
    }
    // Campanas lejanas (una grave y otra aguda) y rachas de viento.
    if (c === 0 && Math.random() < 0.6) campana(m, s, t, mtof(57), 4.2, 0.04, 0.95);
    if (c === 24 && Math.random() < 0.5) campana(m, s, t, mtof(69), 3.2, 0.028, 0.95);
    if (c === 30 && Math.random() < 0.5) ruido(m, s, t, 2.2, 0.04, { filtro: 'bandpass', frec: 300, hasta: 1500, q: 1.2, ataque: 1.0, envio: 0.5 });
    // Pad bajo del eclipse al inicio de cada vuelta.
    if (c === 0) pad(m, s, t, [33, 40, 45], 48 * this.paso, 0.02, 700);
  },
};

// ── n10_catedral ──────────────────────────────────────────────────────────────

// Re menor con segunda frigia: Dm – Eb – Gm – A (dominante).
const ACORDES_CAT = [
  [50, 57, 62, 65],
  [51, 58, 63, 67],
  [55, 58, 62, 67],
  [57, 61, 64, 69],
];
const BAJO_CAT = [38, 39, 43, 45];

const CATEDRAL: DefPista = {
  paso: 0.15,
  pasos: 64,
  volumen: 0.86,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[36.7, 'sawtooth'], [37.0, 'sawtooth'], [55, 'triangle']], filtro: 200, vol: 0.06, lfo: [0.07, 60], volInt: 0.4 }),
      ruidoContinuo(m, s, t, { filtro: 'lowpass', frec: 360, q: 0.8, vol: 0.016, oleaje: 0.12 }), // aire de nave
    );
  },
  programar(m, s, paso, t, int) {
    const c = paso % 64;
    const p = c % 16;
    const bloque = Math.floor(c / 16);
    const ac = ACORDES_CAT[bloque];
    // Órgano: acorde sostenido y pedal grave.
    if (p === 0) {
      ac.forEach((n, i) => organo(m, s, t + i * 0.015, n, 16 * this.paso, 0.017));
      organo(m, s, t, BAJO_CAT[bloque], 16 * this.paso, 0.034);
      // Coro barroco sobre el acorde.
      coro(m, s, t, ac[1] + 12, 16 * this.paso, 0.03, 'o', -0.3);
      coro(m, s, t + 0.04, ac[3] + 12, 16 * this.paso, 0.026, 'a', 0.3);
      if (int > 0.5) coro(m, s, t + 0.07, ac[2] + 12, 16 * this.paso, 0.024, 'o', 0);
    }
    // Pasaje de órgano en semicorcheas al final del compás (carrera descendente barroca).
    if (p === 12) {
      [ac[3] + 12, ac[2] + 12, ac[1] + 12, ac[0] + 12].forEach((n, i) => organo(m, s, t + i * 0.085, n, 0.22, 0.02));
    }
    // Huéhuetl: pulso hondo de procesión sacrificial.
    if (p === 0) huehuetl(m, s, t, 0.42, true);
    if (p === 6) huehuetl(m, s, t, 0.24);
    if (p === 10) huehuetl(m, s, t, 0.27);
    if (p === 13 && int > 0.3) huehuetl(m, s, t, 0.18);
    // Teponaztli: dibujo rápido y quebrado, alto/bajo.
    if ([2, 4, 7, 9, 12, 15].includes(p)) teponaztli(m, s, humano(t), 0.07, (p + bloque) % 2 === 0);
    // Cierre de cada vuelta: tensión que sube antes de volver.
    if (c === 56) ruido(m, s, t, 1.0, 0.05, { filtro: 'bandpass', frec: 400, hasta: 3600, q: 1.5, ataque: 0.8, envio: 0.4 });
    // Campana de catedral, rara, grave.
    if (c === 32 && Math.random() < 0.5) campana(m, s, t, mtof(50), 4.5, 0.045, 0.95);
  },
};

// ── n10_tzitzimime ────────────────────────────────────────────────────────────

// Sol menor con segunda bemol: Gm – Ab – Gm – D.
const ACORDES_TZ = [
  [55, 58, 62, 67],
  [56, 60, 63, 68],
  [55, 58, 62, 67],
  [57, 62, 66, 69],
];
const BAJO_TZ = [43, 44, 43, 50];
const ESTRELLAS = [79, 82, 86, 89, 91, 94];
const OSTINATO_TZ = new Map<number, number>([[0, 0], [3, 0], [6, 1], [8, 0], [10, 0], [12, 1], [14, 2]]);

const TZITZIMIME: DefPista = {
  paso: 0.115,
  pasos: 64,
  volumen: 0.86,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[49, 'sawtooth'], [49.4, 'sawtooth'], [73.4, 'triangle']], filtro: 240, vol: 0.06, lfo: [0.11, 70], volInt: 0.6, filtroInt: 0.8 }),
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 3400, q: 1.2, vol: 0.01, oleaje: 0.2 }), // brillo estelar
    );
  },
  programar(m, s, paso, t, int) {
    const c = paso % 64;
    const p = c % 16;
    const bloque = Math.floor(c / 16);
    const ac = ACORDES_TZ[bloque];
    const raiz = BAJO_TZ[bloque];
    // Huéhuetl marcando negras, con fantasma.
    if (p % 4 === 0) huehuetl(m, s, t, 0.4 + int * 0.08, p === 0);
    if (p === 14) huehuetl(m, s, t, 0.17);
    if (p === 7 && int > 0.5) huehuetl(m, s, t, 0.2);
    // Teponaztli: semicorcheas con acentos (más densas con la intensidad).
    const denso = int > 0.5 ? true : p % 2 === 1;
    if (denso) teponaztli(m, s, humano(t), (p % 4 === 3 ? 0.1 : 0.06) + int * 0.02, p % 3 !== 0);
    // Ostinato de bajo de obsidiana.
    const o = OSTINATO_TZ.get(p);
    if (o !== undefined) tono(m, s, humano(t), mtof(raiz + [0, 12, 7][o]), 0.12, 0.085, { tipo: 'sawtooth', filtro: 700 + int * 600 });
    // Coro: acorde por compás; más voces y registro más alto al subir.
    if (p === 0) {
      const dur = 16 * this.paso;
      coro(m, s, t, ac[1] + 12, dur, 0.034, 'a', -0.3);
      coro(m, s, t, ac[3] + 12, dur, 0.03, 'a', 0.3);
      if (int > 0.5) coro(m, s, t + 0.03, ac[2] + 12, dur, 0.03, 'o', 0);
      if (int > 0.95) coro(m, s, t + 0.05, ac[0] + 24, dur, 0.024, 'a', 0.15);
    }
    // Cascabeles de ayacachtli en la fase intensa.
    if (int > 0.5 && p % 2 === 0) ruido(m, s, t, 0.03, 0.02 + int * 0.02, { filtro: 'highpass', frec: 6500 });
    // Estrellas: campanas agudas esparcidas por la pentatónica.
    if (p % 2 === 1 && Math.random() < 0.13 + int * 0.1) campana(m, s, t, mtof(elegir(ESTRELLAS)), 1.6, 0.03, 0.9);
    // Golpe de campana grave al cambiar de acorde.
    if (p === 0 && bloque % 2 === 0) campana(m, s, t, mtof(raiz + 24), 2.4, 0.04, 0.9);
    if (c === 60) ruido(m, s, t, 0.5, 0.05, { filtro: 'bandpass', frec: 500, hasta: 4500, q: 1.5, ataque: 0.4, envio: 0.3 });
  },
};

// ── n10_itzpapalotl ───────────────────────────────────────────────────────────

/**
 * Motivo de ECOS (el del tema del título, en sol mayor: re-si-re-mi, mi-do-sol) transformado a re menor:
 * [paso, midi, duración]. Vuelve cada vuelta y, en las fases altas, en terceras y como eco de campana.
 */
const MOTIVO_ITZPA: Frase = [[0, 74, 2], [2, 70, 1], [3, 74, 2], [5, 77, 1], [6, 77, 2], [8, 72, 2], [10, 81, 4]];

// Dm – Bb – Gm – A | Dm – Bb – C – A (ocho compases de 16 pasos).
const ACORDES_IT = [
  [62, 65, 69, 74],
  [58, 62, 65, 70],
  [58, 62, 67, 70],
  [61, 64, 69, 73],
  [62, 65, 69, 74],
  [58, 62, 65, 70],
  [60, 64, 67, 72],
  [61, 64, 69, 73],
];
const BAJO_IT = [38, 34, 31, 33, 38, 34, 36, 33];

const ITZPAPALOTL: DefPista = {
  paso: 0.13,
  pasos: 128,
  volumen: 0.9,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[73.4, 'sawtooth'], [73.9, 'sawtooth'], [110.2, 'triangle']], filtro: 300, vol: 0.075, lfo: [0.13, 90], volInt: 0.6, filtroInt: 0.9 }),
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 1300, q: 0.7, vol: 0.012, barrido: [0.09, 400] }), // alas de obsidiana
    );
  },
  programar(m, s, paso, t, int) {
    const c = paso % 128;
    const p = c % 16;
    const bloque = Math.floor(c / 16);
    const ac = ACORDES_IT[bloque];
    const raiz = BAJO_IT[bloque];
    const dur = 16 * this.paso;
    // Órgano pleno: acorde y pedal; en la fase 3, registro lleno y octava arriba.
    if (p === 0) {
      ac.forEach((n, i) => organo(m, s, t + i * 0.012, n, dur, 0.017 + int * 0.006, int > 0.5));
      organo(m, s, t, raiz, dur, 0.04, true);
      coro(m, s, t, ac[1] + 12, dur, 0.034, 'a', -0.3);
      coro(m, s, t, ac[3] + 12, dur, 0.03, 'a', 0.3);
      if (int > 0.5) coro(m, s, t + 0.03, ac[2] + 12, dur, 0.03, 'o', 0);
      if (int > 0.95) coro(m, s, t + 0.05, ac[0] + 24, dur, 0.026, 'a', 0.15);
    }
    // Huéhuetl: motor épico (más golpes por fase).
    if ([0, 3, 6, 8, 10].includes(p)) huehuetl(m, s, t, p === 0 ? 0.48 : 0.3, p === 0 || p === 8);
    if (int > 0.5 && [12, 14].includes(p)) huehuetl(m, s, t, 0.26);
    if (int > 0.95 && p % 2 === 1) huehuetl(m, s, t, 0.14);
    // Teponaztli: corre en semicorcheas desde la fase 2.
    if (int > 0.5 && (int > 0.95 || p % 2 === 1)) teponaztli(m, s, humano(t), 0.055 + int * 0.02, (p + bloque) % 3 !== 0);
    // Ostinato de órgano en semicorcheas sobre la raíz (fase 3).
    if (int > 0.95) {
      const arp = [0, 7, 12, 7][p % 4];
      tono(m, s, t, mtof(raiz + 12 + arp), 0.1, 0.045, { tipo: 'sawtooth', filtro: 1700, envio: 0.2 });
    }
    // El motivo: se declara cada vuelta (bloque 0) y regresa en terceras (bloque 4) y como campana (bloque 7).
    const mot = indexar(MOTIVO_ITZPA).get(p);
    if (mot && (bloque === 0 || (bloque === 4 && int > 0.3))) {
      const dm = mot[1] * this.paso;
      metal(m, s, humano(t), mot[0], dm + 0.2, 0.05, 2400);
      organo(m, s, t, mot[0] - 12, dm + 0.1, 0.014, true);
      if (int > 0.5 && bloque === 4) metal(m, s, t + 0.01, mot[0] - 4, dm + 0.2, 0.034, 2000);
    }
    if (mot && bloque === 7 && int > 0.5) campana(m, s, t, mtof(mot[0] + 12), 1.4, 0.04, 0.85);
    // Choques de obsidiana y campanas rotas.
    if (p === 6 && int > 0.5) campana(m, s, t, mtof(86), 1.2, 0.04, 0.8);
    if (p === 14 && int > 0.95) cristalRoto(m, s, t, 0.03);
    // Riser antes de cerrar el bucle.
    if (c === 120) ruido(m, s, t, 1.0, 0.055, { filtro: 'bandpass', frec: 500, hasta: 4500, q: 1.5, ataque: 0.8, envio: 0.3 });
  },
};

// ── n10_epilogo ───────────────────────────────────────────────────────────────

// Sol – Re – Mim – Do – Sol – Do – Re – Sol: luminoso, cierra donde empezó.
interface AcordeEp {
  bajo: number;
  arp: number[];
  pad: number[];
}
const G_: AcordeEp = { bajo: 43, arp: [55, 59, 62, 67], pad: [55, 62, 67, 71] };
const D_: AcordeEp = { bajo: 50, arp: [57, 62, 66, 69], pad: [57, 62, 66, 69] };
const E_: AcordeEp = { bajo: 40, arp: [55, 59, 64, 67], pad: [55, 59, 64, 67] };
const C_: AcordeEp = { bajo: 48, arp: [55, 60, 64, 67], pad: [52, 60, 64, 67] };
const ACORDES_EP: AcordeEp[] = [G_, D_, E_, C_, G_, C_, D_, G_];
const ARPEGIO_EP = [0, 1, 2, 3, 2, 1, 2, 1];
const PENTA_EP = [79, 83, 86, 88, 91, 95];
const MELODIA_EP = indexar([
  // Compases 1-4: línea que sube con calma.
  [0, 67, 4], [4, 71, 2], [6, 74, 2],
  [8, 74, 4], [12, 69, 2], [14, 74, 2],
  [16, 71, 4], [20, 67, 2], [22, 71, 2],
  [24, 72, 4], [28, 67, 2], [30, 71, 2],
  // Compases 5-6: cita del motivo del juego (re-si-re-mi, mi-do-sol), tal cual.
  [32, 74, 2], [34, 71, 1], [35, 74, 2], [37, 76, 1],
  [38, 76, 2], [40, 72, 2], [42, 79, 4],
  // Compases 7-8: llega la luz.
  [48, 78, 3], [51, 76, 2], [53, 74, 3],
  [56, 71, 3], [59, 74, 2], [61, 79, 3],
]);

const EPILOGO: DefPista = {
  paso: 0.3,
  pasos: 64,
  volumen: 0.85,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, { notas: [[49, 'sine'], [98.2, 'triangle']], filtro: 400, vol: 0.026, lfo: [0.04, 60] }),
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 2600, q: 0.6, vol: 0.008, oleaje: 0.08 }), // aire de mañana
    );
  },
  programar(m, s, paso, t) {
    const c = paso % 64;
    const p = c % 8;
    const bloque = Math.floor(c / 8);
    const ac = ACORDES_EP[bloque];
    // Guitarra: bajo y arpegio suave (negras pulsadas, corcheas arpegiadas).
    if (p === 0) pulsar(m, s, humano(t), ac.bajo, 0.26, 0.35, 2.2, 0.2, -0.15);
    if (p === 4) pulsar(m, s, humano(t), ac.bajo + 7, 0.16, 0.35, 1.6, 0.18, -0.1);
    pulsar(m, s, humano(t), ac.arp[ARPEGIO_EP[p] % 4] + (p % 2 === 1 ? 12 : 0), p === 0 ? 0.13 : 0.09, 0.6, 1.1, 0.35, 0.12);
    // Cuerdas suaves: cama de pad al inicio de cada compás, y una octava arriba que respira.
    if (p === 0) {
      pad(m, s, t, ac.pad, 8 * this.paso, 0.034, 1600);
      pad(m, s, t + 0.2, [ac.pad[1] + 12, ac.pad[3] + 12], 8 * this.paso - 0.2, 0.016, 2200);
    }
    // Melodía en guitarra clara.
    const nota = MELODIA_EP.get(c);
    if (nota) pulsar(m, s, humano(t), nota[0], 0.22, 0.65, nota[1] * this.paso + 0.8, 0.5, 0.05);
    // Amanecer: destellos de campana en la pentatónica, y algún pájaro.
    if (p === 0 && Math.random() < 0.55) campana(m, s, t + 0.15, mtof(elegir(PENTA_EP)), 2.2, 0.018, 0.9);
    if (p % 2 === 1 && Math.random() < 0.07) {
      const f = rnd(3000, 4200);
      tono(m, s, t, f, 0.09, 0.012, { hasta: f * 1.3, envio: 0.3 });
      tono(m, s, t + 0.12, f * 1.1, 0.08, 0.01, { hasta: f * 1.35, envio: 0.3 });
    }
    // Un suspiro de luz creciente en el último compás (la vuelta al inicio es un nuevo día).
    if (c === 56) ruido(m, s, t, 2.2, 0.025, { filtro: 'bandpass', frec: 800, hasta: 5000, q: 0.8, ataque: 1.8, envio: 0.5 });
  },
};

export const PISTAS_N10: Record<string, DefPista> = {
  n10_avenida: AVENIDA,
  n10_catedral: CATEDRAL,
  n10_tzitzimime: TZITZIMIME,
  n10_itzpapalotl: ITZPAPALOTL,
  n10_epilogo: EPILOGO,
};

/** Pistas del Nivel 10 que reaccionan a `boss:phase` (fases 1 / 2 / 3 → 0 / 0.55 / 1). */
export const PISTAS_N10_INTENSIDAD = new Set(['n10_itzpapalotl', 'n10_tzitzimime']);

// ── Efectos ───────────────────────────────────────────────────────────────────

export const EFECTOS_N10: Record<string, Sintetizador> = {
  atado_on: (m, d, t) => {
    // Cadenas de luz que se cierran: eslabones que tintinean y un zumbido luminoso que se tensa.
    for (let i = 0; i < 5; i++) {
      const ti = t + i * 0.07;
      ruido(m, d, ti, 0.05, 0.12, { filtro: 'bandpass', frec: rnd(3000, 4500), q: 3 });
      tono(m, d, ti, rnd(1400, 2200), 0.1, 0.05, { filtro: 6000, envio: 0.4 });
    }
    tono(m, d, t, 220, 0.7, 0.08, { hasta: 520, ataque: 0.2, envio: 0.5 });
    tono(m, d, t + 0.1, 330, 0.6, 0.05, { tipo: 'triangle', hasta: 780, ataque: 0.2, envio: 0.5 });
    tono(m, d, t + 0.4, 95, 0.3, 0.22, { hasta: 50 });
    campana(m, d, t + 0.4, mtof(88), 0.9, 0.05, 0.8);
    return 1.4;
  },
  atado_off: (m, d, t) => {
    // Las cadenas se rompen: chasquido, cristales y un alivio que sube.
    ruido(m, d, t, 0.1, 0.25, { filtro: 'highpass', frec: 2800 });
    tono(m, d, t, 900, 0.18, 0.1, { tipo: 'square', hasta: 200, filtro: 3000, envio: 0.3 });
    tintineo(m, d, t + 0.02, 12, 0.5, 0.06);
    tono(m, d, t + 0.1, 150, 0.35, 0.2, { hasta: 55 });
    [74, 79, 83, 86].forEach((n, i) => campana(m, d, t + 0.25 + i * 0.09, mtof(n), 1.4, 0.05, 0.9));
    pad(m, d, t + 0.3, [62, 69, 74], 1.6, 0.04, 2000);
    return 2.2;
  },
  jaguar_ruge: (m, d, t) => {
    // Rugido luminoso: garganta de jaguar que sube a un destello de campanas.
    tono(m, d, t, 150, 1.0, 0.16, { tipo: 'sawtooth', hasta: 62, filtro: 1000, vibrato: 18, vibratoProf: 60, ataque: 0.08, envio: 0.4 });
    tono(m, d, t, 300, 0.9, 0.07, { tipo: 'square', hasta: 120, filtro: 1400, vibrato: 22, vibratoProf: 80, ataque: 0.06 });
    coro(m, d, t, 45, 1.1, 0.08, 'a', 0);
    ruido(m, d, t, 0.9, 0.12, { filtro: 'bandpass', frec: 700, hasta: 300, q: 1.2, ataque: 0.05, envio: 0.4 });
    [79, 83, 86, 91].forEach((n, i) => campana(m, d, t + 0.35 + i * 0.12, mtof(n), 1.6, 0.05, 0.9));
    pad(m, d, t + 0.3, [62, 69, 74, 81], 2.0, 0.05, 2400);
    return 2.6;
  },
  jaguar_embiste: (m, d, t) => {
    // Embestida: ráfaga que cruza, impacto y chispa de luz.
    ruido(m, d, t, 0.3, 0.16, { filtro: 'bandpass', frec: 350, hasta: 2600, q: 1.2, ataque: 0.1, envio: 0.2 });
    tono(m, d, t + 0.18, 140, 0.25, 0.3, { hasta: 48 });
    ruido(m, d, t + 0.18, 0.08, 0.2, { filtro: 'highpass', frec: 2000 });
    tono(m, d, t, 190, 0.3, 0.08, { tipo: 'sawtooth', hasta: 110, filtro: 800, vibrato: 16, vibratoProf: 50 });
    campana(m, d, t + 0.2, mtof(91), 0.7, 0.045, 0.8);
    return 0.8;
  },
  madre_despierta: (m, d, t) => {
    // Campana cálida y sostenida, como un nombre que se recuerda.
    campana(m, d, t, mtof(74), 3.0, 0.1, 0.95);
    campana(m, d, t + 0.35, mtof(81), 2.6, 0.07, 0.95);
    campana(m, d, t + 0.7, mtof(86), 2.2, 0.05, 0.95);
    pad(m, d, t, [57, 62, 66, 69], 3.0, 0.05, 1800);
    return 3.6;
  },
  madre_senas: (m, d, t) => {
    // Sin voz (ella es sorda y habla en señas): un gesto de arpa y un brillo que se disuelve.
    [74, 79, 83, 86, 91].forEach((n, i) => pulsar(m, d, t + i * 0.085, n, 0.13, 0.7, 1.4, 0.55, (i - 2) * 0.12));
    campana(m, d, t + 0.45, mtof(98), 1.2, 0.025, 0.95);
    ruido(m, d, t, 0.8, 0.02, { filtro: 'bandpass', frec: 3500, hasta: 7000, q: 1.5, ataque: 0.3, envio: 0.5 });
    return 1.8;
  },
  itzpa_cristal: (m, d, t) => {
    // Cristal que se congela: soplo helado que sube, tintineos que se detienen y un timbre final.
    ruido(m, d, t, 0.7, 0.12, { filtro: 'bandpass', frec: 1800, hasta: 7500, q: 2, ataque: 0.1, envio: 0.4 });
    for (let i = 0; i < 9; i++) {
      const f = 5200 - i * 380;
      tono(m, d, t + i * 0.055, f, 0.14, 0.05 - i * 0.003, { filtro: 9000, envio: 0.6 });
    }
    campana(m, d, t + 0.5, mtof(98), 1.6, 0.05, 0.95);
    tono(m, d, t, 80, 0.5, 0.1, { hasta: 55, filtro: 200 });
    return 2.0;
  },
  itzpa_nucleo: (m, d, t) => {
    // Golpe al núcleo: latido profundo que se resquebraja y una campana de luz.
    tono(m, d, t, 120, 0.4, 0.3, { hasta: 38, envio: 0.3 });
    ruido(m, d, t, 0.08, 0.26, { filtro: 'highpass', frec: 2500 });
    cristalRoto(m, d, t + 0.05, 0.12);
    campana(m, d, t + 0.06, mtof(81), 1.4, 0.09, 0.9);
    campana(m, d, t + 0.1, mtof(88), 1.2, 0.06, 0.9);
    return 1.8;
  },
  itzpa_nucleo_final: (m, d, t) => {
    // El núcleo estalla en luz y obsidiana: boom, cristalería, coro que abre y campanas hacia arriba.
    tono(m, d, t, 130, 1.4, 0.34, { hasta: 28, envio: 0.4 });
    ruido(m, d, t, 1.8, 0.28, { filtro: 'lowpass', frec: 1200, hasta: 90, ataque: 0.01, envio: 0.5 });
    cristalRoto(m, d, t, 0.34);
    cristalRoto(m, d, t + 0.25, 0.2);
    ruido(m, d, t + 0.05, 1.4, 0.16, { filtro: 'bandpass', frec: 500, hasta: 7000, q: 0.9, ataque: 0.3, envio: 0.6 });
    [62, 69, 74, 78, 81].forEach((n, i) => coro(m, d, t + 0.3 + i * 0.06, n, 2.6, 0.045, i % 2 ? 'a' : 'o', (i - 2) * 0.25));
    [74, 78, 81, 86, 90, 93].forEach((n, i) => campana(m, d, t + 0.4 + i * 0.12, mtof(n), 2.4, 0.06, 0.95));
    pad(m, d, t + 0.4, [50, 57, 62, 66, 69], 3.4, 0.05, 2600);
    return 4.4;
  },
  eclipse_rumor: (m, d, t) => {
    // Rumor grave: el cielo se oscurece un poco más.
    ruido(m, d, t, 2.6, 0.1, { filtro: 'lowpass', frec: 180, hasta: 60, ataque: 0.7, envio: 0.5 });
    tono(m, d, t, 41, 2.6, 0.13, { hasta: 29, ataque: 0.5, filtro: 120, envio: 0.4 });
    tono(m, d, t + 0.3, 82, 2.0, 0.04, { tipo: 'triangle', hasta: 58, ataque: 0.6, filtro: 220, vibrato: 3, vibratoProf: 30 });
    return 3.2;
  },
  techo_abre: (m, d, t) => {
    // La bóveda se abre: piedra que raspa, crujidos y la luz del eclipse entrando.
    ruido(m, d, t, 3.0, 0.2, { filtro: 'lowpass', frec: 260, hasta: 140, ataque: 0.3, envio: 0.4 });
    tono(m, d, t, 60, 3.0, 0.14, { tipo: 'sawtooth', hasta: 38, filtro: 180, vibrato: 4, vibratoProf: 40, ataque: 0.4, envio: 0.4 });
    for (let i = 0; i < 8; i++) ruido(m, d, t + 0.3 + rnd(0, 2.4), 0.05, 0.1, { filtro: 'bandpass', frec: rnd(700, 1800), q: 3 });
    tono(m, d, t + 1.0, 130, 1.2, 0.05, { tipo: 'sawtooth', hasta: 175, filtro: 500, vibrato: 3, vibratoProf: 40, ataque: 0.3 });
    pad(m, d, t + 1.6, [50, 57, 62, 65], 2.6, 0.05, 1400);
    campana(m, d, t + 2.2, mtof(50), 3.0, 0.07, 0.95);
    return 4.6;
  },
  capullo_late: (m, d, t) => {
    // Latido de un capullo de obsidiana: doble golpe sordo con un zumbido cristalino.
    tono(m, d, t, 66, 0.32, 0.26, { hasta: 38, envio: 0.3 });
    tono(m, d, t + 0.2, 58, 0.32, 0.2, { hasta: 34, envio: 0.3 });
    tono(m, d, t, 1200, 0.5, 0.012, { tipo: 'triangle', hasta: 1180, vibrato: 7, vibratoProf: 25, envio: 0.5 });
    return 0.8;
  },
  capullo_estalla: (m, d, t) => {
    // El capullo estalla: boom, obsidiana que vuela en esquirlas y un aleteo naciente.
    tono(m, d, t, 140, 1.0, 0.34, { hasta: 30, envio: 0.4 });
    ruido(m, d, t, 1.4, 0.26, { filtro: 'lowpass', frec: 1500, hasta: 120, envio: 0.5 });
    cristalRoto(m, d, t, 0.36);
    cristalRoto(m, d, t + 0.2, 0.2);
    ruido(m, d, t + 0.4, 0.5, 0.12, { filtro: 'bandpass', frec: 500, hasta: 1800, q: 1.2, ataque: 0.2 });
    coro(m, d, t + 0.2, 38, 1.8, 0.06, 'a', 0);
    return 2.8;
  },
  tzitzimitl_desciende: (m, d, t) => {
    // Cae desde el cielo: silbido que baja, coro grave y estrellas en la estela.
    tono(m, d, t, 1900, 0.9, 0.08, { tipo: 'sawtooth', hasta: 190, filtro: 3500, ataque: 0.2, envio: 0.4 });
    ruido(m, d, t, 0.9, 0.12, { filtro: 'bandpass', frec: 4500, hasta: 300, q: 1.2, ataque: 0.2, envio: 0.3 });
    coro(m, d, t + 0.2, 43, 1.4, 0.05, 'a', 0);
    tintineo(m, d, t, 8, 0.9, 0.035, 2600, 5200);
    tono(m, d, t + 0.9, 70, 0.4, 0.26, { hasta: 36 });
    return 1.8;
  },
  estrellas_lluvia: (m, d, t) => {
    // Lluvia de estrellas: pings cristalinos cayendo por la pentatónica.
    for (let i = 0; i < 10; i++) {
      const ti = t + i * 0.1 + rnd(0, 0.06);
      campana(m, d, ti, mtof(elegir(ESTRELLAS) + 12), 0.9, 0.028, 0.85);
    }
    ruido(m, d, t, 1.0, 0.04, { filtro: 'highpass', frec: 5500, ataque: 0.3 });
    return 2.0;
  },
  tzitzimitl_cae: (m, d, t) => {
    // Se deshace en polvo de estrellas: golpe sordo y un resplandor que se apaga hacia arriba.
    tono(m, d, t, 110, 0.7, 0.26, { hasta: 34, envio: 0.4 });
    ruido(m, d, t, 0.9, 0.12, { filtro: 'lowpass', frec: 1400, hasta: 150, envio: 0.5 });
    for (let i = 0; i < 9; i++) campana(m, d, t + 0.2 + i * 0.1, mtof(94 - i * 2), 1.1, 0.03, 0.9);
    pad(m, d, t + 0.3, [55, 62, 67, 71], 2.2, 0.04, 2200);
    return 3.0;
  },
  itzpa_aleteo: (m, d, t) => {
    // Alas de obsidiana: dos aletazos con chasquido de vidrio.
    for (let i = 0; i < 2; i++) {
      const ti = t + i * 0.28;
      ruido(m, d, ti, 0.26, 0.14, { filtro: 'bandpass', frec: 900, hasta: 280, q: 1.0, ataque: 0.06, envio: 0.3 });
      tono(m, d, ti, 95, 0.2, 0.1, { hasta: 55, envio: 0.2 });
      ruido(m, d, ti + 0.05, 0.05, 0.05, { filtro: 'highpass', frec: 4500 });
    }
    return 0.8;
  },
  itzpa_mariposas: (m, d, t) => {
    // Enjambre de mariposas de obsidiana: aleteos rápidos y tintineo cristalino.
    for (let i = 0; i < 16; i++) {
      const ti = t + rnd(0, 1.0);
      ruido(m, d, ti, 0.04, 0.05, { filtro: 'bandpass', frec: rnd(2500, 6000), q: 4 });
    }
    for (let i = 0; i < 6; i++) tono(m, d, t + i * 0.14, rnd(2200, 3800), 0.3, 0.03, { tipo: 'triangle', vibrato: 16, vibratoProf: 90, envio: 0.5 });
    tono(m, d, t, 180, 0.9, 0.04, { tipo: 'sawtooth', hasta: 260, filtro: 600, vibrato: 12, vibratoProf: 60, ataque: 0.3 });
    return 1.6;
  },
  itzpa_corte: (m, d, t) => {
    // Tajo de obsidiana: silbido de filo y chasquido.
    ruido(m, d, t, 0.22, 0.2, { filtro: 'highpass', frec: 6500, hasta: 1500 });
    tono(m, d, t, 2600, 0.18, 0.07, { tipo: 'sawtooth', hasta: 400, filtro: 5000, envio: 0.2 });
    tono(m, d, t + 0.16, 120, 0.15, 0.18, { hasta: 55 });
    campana(m, d, t + 0.14, mtof(84), 0.5, 0.03, 0.7);
    return 0.6;
  },
  itzpa_rebote: (m, d, t) => {
    // ECOS rebota (aún no es el momento): tin metálico, destello invertido y un descenso.
    campana(m, d, t, mtof(88), 0.7, 0.1, 0.8);
    tono(m, d, t, 900, 0.14, 0.07, { tipo: 'square', hasta: 1400, filtro: 3000 });
    tono(m, d, t + 0.08, 380, 0.22, 0.08, { tipo: 'triangle', hasta: 190, filtro: 1500 });
    ruido(m, d, t + 0.02, 0.2, 0.05, { filtro: 'bandpass', frec: 3000, hasta: 800, q: 2 });
    return 0.8;
  },
  itzpa_furia: (m, d, t) => {
    // Furia de la diosa: rugido grave, coro disonante y cristales que vibran.
    tono(m, d, t, 130, 1.0, 0.2, { tipo: 'sawtooth', hasta: 48, filtro: 800, vibrato: 14, vibratoProf: 55, ataque: 0.06, envio: 0.4 });
    coro(m, d, t, 38, 1.1, 0.08, 'a', 0);
    coro(m, d, t, 39, 1.1, 0.06, 'a', 0.3);
    ruido(m, d, t, 0.8, 0.14, { filtro: 'bandpass', frec: 900, hasta: 3500, q: 1.0, ataque: 0.1, envio: 0.4 });
    cristalRoto(m, d, t + 0.3, 0.14);
    return 1.6;
  },
  itzpa_cae: (m, d, t) => {
    // La diosa se quiebra en obsidiana y luz: derrumbe de cristal, silencio, y un acorde que amanece.
    tono(m, d, t, 120, 1.8, 0.28, { hasta: 28, envio: 0.5 });
    ruido(m, d, t, 2.0, 0.22, { filtro: 'lowpass', frec: 1400, hasta: 100, envio: 0.5 });
    for (let i = 0; i < 5; i++) cristalRoto(m, d, t + i * 0.28, 0.24 - i * 0.03);
    [86, 81, 78, 74].forEach((n, i) => campana(m, d, t + 1.2 + i * 0.28, mtof(n), 2.4, 0.05, 0.95));
    pad(m, d, t + 1.6, [62, 66, 69, 74], 3.0, 0.05, 2400);
    return 5.0;
  },
  sol_regresa: (m, d, t) => {
    // El Sol regresa: aire que se abre, acorde que crece y campanas ascendiendo.
    ruido(m, d, t, 3.2, 0.1, { filtro: 'bandpass', frec: 400, hasta: 5200, q: 0.7, ataque: 2.0, envio: 0.6 });
    pad(m, d, t, [55, 62, 67, 71, 74], 4.2, 0.05, 2800);
    pad(m, d, t + 1.0, [67, 74, 79, 83], 3.4, 0.035, 3200);
    [67, 71, 74, 79, 83, 86, 91].forEach((n, i) => campana(m, d, t + 0.8 + i * 0.22, mtof(n), 2.4, 0.05, 0.95));
    tono(m, d, t, 98, 3.0, 0.1, { ataque: 1.6, hasta: 196, filtro: 600, envio: 0.5 });
    return 5.6;
  },
  codice_abre: (m, d, t) => {
    // El Códice se abre: crujido de papel y un destello de arpa.
    for (let i = 0; i < 4; i++) ruido(m, d, t + i * 0.09, 0.08, 0.06, { filtro: 'bandpass', frec: rnd(2200, 3800), q: 1.5 });
    ruido(m, d, t, 0.5, 0.04, { filtro: 'lowpass', frec: 900, hasta: 300 });
    [79, 83, 86, 91, 95].forEach((n, i) => pulsar(m, d, t + 0.3 + i * 0.08, n, 0.11, 0.7, 1.4, 0.55, (i - 2) * 0.1));
    campana(m, d, t + 0.4, mtof(98), 1.4, 0.03, 0.95);
    return 2.2;
  },
};

// Variantes de golpe de percusión por si otros sistemas quieren acentos sueltos.
EFECTOS_N10.huehuetl_golpe = (m, d, t) => {
  huehuetl(m, d, t, 0.45, true);
  slap(m, d, t + 0.01, 0.06);
  return 0.6;
};
EFECTOS_N10.teponaztli_golpe = (m, d, t) => {
  teponaztli(m, d, t, 0.12, true);
  teponaztli(m, d, t + 0.11, 0.1, false);
  return 0.5;
};

// Efectos que piden directamente BalamJaguar.ts, Madre.ts, Tzitzimitl.ts e Itzpapalotl.ts (integración).
Object.assign(EFECTOS_N10, {
  jaguar_prepara: (m, d, t) => {
    tono(m, d, t, 70, 0.4, 0.12, { tipo: 'sawtooth', hasta: 95, filtro: 380, vibrato: 18, vibratoProf: 12 });
    return 0.5;
  },
  jaguar_calma: (m, d, t) => {
    tono(m, d, t, 620, 0.6, 0.05, { tipo: 'triangle', hasta: 900, ataque: 0.1, envio: 0.6 });
    campana(m, d, t + 0.2, mtof(84), 1.0, 0.04, 0.8);
    return 1.1;
  },
  cadenas_rotas: (m, d, t) => {
    for (let i = 0; i < 6; i++) campana(m, d, t + i * 0.06, mtof(86 + (i % 3) * 3), 0.6, 0.04, 0.7);
    ruido(m, d, t, 0.25, 0.12, { filtro: 'highpass', frec: 3500 });
    return 1.0;
  },
  tzitzimitl_grito: (m, d, t) => {
    [67, 70, 74].forEach((n, i) => coro(m, d, t + i * 0.05, n, 0.9, 0.04, 'a', (i - 1) * 0.4));
    tono(m, d, t, 900, 0.8, 0.05, { tipo: 'sawtooth', hasta: 500, filtro: 2400, vibrato: 9, vibratoProf: 80, envio: 0.8 });
    return 1.1;
  },
  tzitzimitl_embestida: (m, d, t) => {
    ruido(m, d, t, 0.4, 0.15, { filtro: 'bandpass', frec: 600, hasta: 2400, q: 1.2 });
    tono(m, d, t, 160, 0.35, 0.14, { hasta: 60 });
    return 0.5;
  },
  tzitzimitl_polvo: (m, d, t) => {
    for (let i = 0; i < 8; i++) campana(m, d, t + i * 0.07, mtof(88 + (i % 4) * 2), 0.8, 0.03, 0.85);
    return 1.3;
  },
  itzpa_capullo_grieta: (m, d, t) => {
    ruido(m, d, t, 0.15, 0.18, { filtro: 'highpass', frec: 2800 });
    tono(m, d, t, 2200, 0.2, 0.05, { hasta: 900, filtro: 5000 });
    return 0.4;
  },
  itzpa_grito: (m, d, t) => {
    [55, 58, 62, 65].forEach((n, i) => coro(m, d, t + i * 0.04, n, 1.4, 0.045, i % 2 ? 'o' : 'a', (i - 1.5) * 0.3));
    tono(m, d, t, 300, 1.4, 0.08, { tipo: 'sawtooth', hasta: 120, filtro: 900, envio: 0.7 });
    return 1.6;
  },
  itzpa_alas_rotas: (m, d, t) => {
    ruido(m, d, t, 0.2, 0.3, { filtro: 'highpass', frec: 3000 });
    for (let i = 0; i < 10; i++) tono(m, d, t + i * 0.04, 1800 + i * 220, 0.12, 0.05, { filtro: 7000, envio: 0.5 });
    return 1.0;
  },
  itzpa_bloqueo: (m, d, t) => {
    campana(m, d, t, mtof(79), 0.6, 0.08, 0.7);
    tono(m, d, t, 500, 0.2, 0.08, { tipo: 'square', hasta: 250, filtro: 1500 });
    return 0.7;
  },
} satisfies Record<string, Sintetizador>);

// Versión extendida: momias, Vampiro y Don Ernesto (los piden Momia.ts, Vampiro.ts y DonErnesto.ts).
const polvo = (m: Motor, d: AudioNode, t: number, dur: number, vol: number) =>
  ruido(m, d, t, dur, vol, { filtro: 'bandpass', frec: 900, hasta: 300, q: 0.8, ataque: 0.05, envio: 0.4 });
Object.assign(EFECTOS_N10, {
  // Momia
  momia_gemido: (m, d, t) => { coro(m, d, t, 40, 1.2, 0.07, 'o', 0); tono(m, d, t, 110, 1.2, 0.05, { tipo: 'sawtooth', hasta: 80, filtro: 500, vibrato: 4, vibratoProf: 15 }); return 1.3; },
  momia_vendas: (m, d, t) => { ruido(m, d, t, 0.35, 0.12, { filtro: 'highpass', frec: 1800, hasta: 4000 }); return 0.4; },
  momia_agarre: (m, d, t) => { polvo(m, d, t, 0.25, 0.14); tono(m, d, t, 140, 0.2, 0.12, { hasta: 70 }); return 0.4; },
  momia_grito: (m, d, t) => { coro(m, d, t, 45, 1.0, 0.09, 'a', 0); polvo(m, d, t, 1.0, 0.16); return 1.2; },
  momia_agotada: (m, d, t) => { tono(m, d, t, 160, 0.6, 0.08, { hasta: 60, filtro: 600 }); polvo(m, d, t + 0.1, 0.5, 0.1); return 0.8; },
  momia_descansa: (m, d, t) => { pad(m, d, t, [57, 62, 66], 1.6, 0.05, 1600); [81, 86].forEach((n, i) => campana(m, d, t + i * 0.3, mtof(n), 1.4, 0.04, 0.9)); return 1.9; },
  // Vampiro
  vampiro_transforma: (m, d, t) => { tono(m, d, t, 200, 0.9, 0.12, { tipo: 'sawtooth', hasta: 60, filtro: 900, vibrato: 10, vibratoProf: 40 }); ruido(m, d, t, 0.8, 0.12, { filtro: 'bandpass', frec: 3000, hasta: 600, q: 1.5 }); return 1.1; },
  vampiro_sisea: (m, d, t) => { ruido(m, d, t, 0.6, 0.12, { filtro: 'highpass', frec: 4000, ataque: 0.1 }); return 0.7; },
  vampiro_zarpazo: (m, d, t) => { ruido(m, d, t, 0.12, 0.2, { filtro: 'bandpass', frec: 2500, hasta: 800, q: 1.2 }); return 0.2; },
  vampiro_murcielagos: (m, d, t) => { for (let i = 0; i < 8; i++) tono(m, d, t + i * 0.05, 4000 + i * 300, 0.04, 0.03, { tipo: 'square', filtro: 8000 }); ruido(m, d, t, 0.5, 0.06, { filtro: 'highpass', frec: 3000 }); return 0.6; },
  vampiro_raices: (m, d, t) => { tono(m, d, t, 80, 0.6, 0.16, { hasta: 45, filtro: 300 }); ruido(m, d, t, 0.5, 0.1, { filtro: 'lowpass', frec: 500 }); return 0.7; },
  vampiro_raiz: (m, d, t) => { ruido(m, d, t, 0.18, 0.12, { filtro: 'lowpass', frec: 700 }); return 0.25; },
  vampiro_niebla: (m, d, t) => { ruido(m, d, t, 0.9, 0.08, { filtro: 'bandpass', frec: 600, hasta: 2000, q: 0.7, ataque: 0.3, envio: 0.7 }); return 1.0; },
  vampiro_agotado: (m, d, t) => { tono(m, d, t, 300, 0.7, 0.08, { tipo: 'sawtooth', hasta: 90, filtro: 800 }); return 0.8; },
  vampiro_liberar: (m, d, t) => { pad(m, d, t, [55, 62, 67], 1.8, 0.05, 1800); for (let i = 0; i < 6; i++) tono(m, d, t + 0.2 + i * 0.07, 3500 + i * 250, 0.05, 0.02, { tipo: 'square', filtro: 7000 }); return 2.0; },
  // Don Ernesto
  ernesto_risa: (m, d, t) => { for (let i = 0; i < 4; i++) coro(m, d, t + i * 0.16, 38 - i, 0.18, 0.08, 'a', 0); tono(m, d, t, 70, 0.8, 0.07, { tipo: 'sawtooth', hasta: 50, filtro: 400 }); return 0.9; },
  ernesto_barajea: (m, d, t) => { for (let i = 0; i < 10; i++) ruido(m, d, t + i * 0.035, 0.02, 0.1, { filtro: 'highpass', frec: 3500 }); return 0.5; },
  ernesto_cartas: (m, d, t) => { for (let i = 0; i < 4; i++) ruido(m, d, t + i * 0.06, 0.08, 0.1, { filtro: 'bandpass', frec: 2500, hasta: 5000, q: 2 }); return 0.4; },
  ernesto_estalla: (m, d, t) => { ruido(m, d, t, 0.3, 0.2, { filtro: 'lowpass', frec: 1500, hasta: 200 }); tono(m, d, t, 120, 0.3, 0.12, { hasta: 50 }); return 0.4; },
  ernesto_ruleta: (m, d, t) => { for (let i = 0; i < 14; i++) tono(m, d, t + i * (0.05 + i * 0.008), 1400, 0.02, 0.05, { tipo: 'square', filtro: 3000 }); return 2.2; },
  ernesto_ruleta_fin: (m, d, t) => { campana(m, d, t, mtof(76), 1.0, 0.08, 0.8); tono(m, d, t, 90, 0.4, 0.1, { hasta: 60 }); return 1.0; },
  ernesto_fuego: (m, d, t) => { ruido(m, d, t, 0.8, 0.14, { filtro: 'lowpass', frec: 900, hasta: 300, ataque: 0.1 }); tono(m, d, t, 60, 0.8, 0.08, { hasta: 40, filtro: 200 }); return 0.9; },
  ernesto_baston: (m, d, t) => { tono(m, d, t, 180, 0.12, 0.16, { hasta: 70 }); ruido(m, d, t, 0.06, 0.12, { filtro: 'highpass', frec: 2000 }); return 0.2; },
  ernesto_agotado: (m, d, t) => { tono(m, d, t, 220, 0.8, 0.09, { tipo: 'sawtooth', hasta: 60, filtro: 700 }); return 0.9; },
  ernesto_liberar: (m, d, t) => { pad(m, d, t, [52, 59, 64, 68], 2.0, 0.05, 1800); [79, 84, 88].forEach((n, i) => campana(m, d, t + 0.3 + i * 0.3, mtof(n), 1.4, 0.04, 0.9)); return 2.4; },
} satisfies Record<string, Sintetizador>);

export const MAX_VOCES_N10: Record<string, number> = {
  atado_on: 1,
  atado_off: 1,
  jaguar_ruge: 1,
  jaguar_embiste: 2,
  madre_despierta: 1,
  madre_senas: 1,
  itzpa_cristal: 1,
  itzpa_nucleo: 2,
  itzpa_nucleo_final: 1,
  eclipse_rumor: 1,
  techo_abre: 1,
  capullo_late: 1,
  capullo_estalla: 1,
  tzitzimitl_desciende: 2,
  estrellas_lluvia: 2,
  tzitzimitl_cae: 2,
  itzpa_aleteo: 2,
  itzpa_mariposas: 1,
  itzpa_corte: 2,
  itzpa_rebote: 1,
  itzpa_furia: 1,
  itzpa_cae: 1,
  sol_regresa: 1,
  codice_abre: 1,
  huehuetl_golpe: 2,
  teponaztli_golpe: 2,
};

// ── Eventos del Nivel 10 ──────────────────────────────────────────────────────

let conectado = false;

/**
 * Engancha los eventos del Nivel 10 al audio. Lo llama `conectarBus()` de Audio.ts una sola vez
 * (el audio es un singleton global, como el resto de los oyentes de Audio.ts, por lo que usa `bus.on`).
 */
export function conectarEventosN10(reproducirSfx: (nombre: string) => void): void {
  if (conectado) return;
  conectado = true;

  bus.on('player:bound', ({ on }) => reproducirSfx(on ? 'atado_on' : 'atado_off'));
  bus.on('balam:jaguar', ({ on }) => {
    if (on) reproducirSfx('jaguar_ruge');
  });
  bus.on('balam:strike', () => reproducirSfx('jaguar_embiste'));
  bus.on('madre:awake', ({ on }) => {
    if (on) reproducirSfx('madre_despierta');
  });
  bus.on('madre:sign', () => reproducirSfx('madre_senas'));
  bus.on('itzpa:stagger', () => reproducirSfx('itzpa_cristal'));
  bus.on('itzpa:core', ({ hits, max }) => reproducirSfx(hits >= max ? 'itzpa_nucleo_final' : 'itzpa_nucleo'));

  // Eclipse: un rumor grave cada vez que el avance cruza un cuarto más.
  let tramoPrev = -1;
  bus.on('eclipse:progress', ({ progress }) => {
    const tramo = Math.floor(Math.max(0, Math.min(1, progress)) * 4);
    if (tramoPrev >= 0 && tramo > tramoPrev) reproducirSfx('eclipse_rumor');
    tramoPrev = tramo;
  });
}
