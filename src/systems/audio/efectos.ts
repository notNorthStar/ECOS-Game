/**
 * Efectos de sonido sintetizados. Cada función agenda su sonido en `t` sobre `d` (bus de efectos)
 * y devuelve la duración aproximada (para el límite de voces).
 */
import { EFECTOS_N03, MAX_VOCES_N03 } from './catemaco';
import { campana, mtof, pad, pulsar, ruido, tono, type Motor } from './motor';

type Sintetizador = (m: Motor, d: AudioNode, t: number) => number;

/** Contador de letras del conjuro en curso (la nota sube con cada acierto). */
let letraIdx = 0;
export function reiniciarLetras(): void {
  letraIdx = 0;
}
// Pentatónica mayor de Sol, a partir de Re5.
const PENTA = [74, 76, 79, 81, 83, 86, 88, 91, 93, 95, 98];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const EFECTOS: Record<string, Sintetizador> = {
  disparo_verde: (m, d, t) => {
    const p = rnd(0.97, 1.03);
    tono(m, d, t, 900 * p, 0.14, 0.16, { tipo: 'triangle', hasta: 420 * p, vibrato: 38, vibratoProf: 40 });
    tono(m, d, t, 1800 * p, 0.09, 0.05, { hasta: 900 * p });
    tono(m, d, t, 120, 0.12, 0.08, { tipo: 'sine', hasta: 90 });
    return 0.16;
  },
  disparo_rojo: (m, d, t) => {
    const p = rnd(0.96, 1.04);
    tono(m, d, t, 620 * p, 0.17, 0.16, { tipo: 'sawtooth', hasta: 110, filtro: 3200 });
    tono(m, d, t, 300 * p, 0.15, 0.12, { tipo: 'square', hasta: 70, filtro: 1800 });
    ruido(m, d, t, 0.06, 0.18, { filtro: 'highpass', frec: 2500 });
    return 0.18;
  },
  impacto: (m, d, t) => {
    ruido(m, d, t, 0.08, 0.3, { filtro: 'bandpass', frec: rnd(1200, 1800), q: 1.2 });
    tono(m, d, t, 190, 0.11, 0.3, { hasta: 55 });
    return 0.12;
  },
  salto: (m, d, t) => {
    tono(m, d, t, 260, 0.13, 0.12, { tipo: 'triangle', hasta: 560 });
    ruido(m, d, t, 0.08, 0.06, { filtro: 'bandpass', frec: 900, hasta: 2400 });
    return 0.14;
  },
  aterrizar: (m, d, t) => {
    ruido(m, d, t, 0.09, 0.22, { filtro: 'lowpass', frec: 500 });
    tono(m, d, t, 130, 0.09, 0.22, { hasta: 45 });
    return 0.1;
  },
  esquivar: (m, d, t) => {
    ruido(m, d, t, 0.26, 0.28, { filtro: 'bandpass', frec: 350, hasta: 2800, q: 2.2, ataque: 0.05 });
    ruido(m, d, t + 0.05, 0.2, 0.1, { filtro: 'highpass', frec: 3000 });
    return 0.28;
  },
  paso: (m, d, t) => {
    ruido(m, d, t, 0.045, 0.09, { filtro: 'lowpass', frec: rnd(600, 1000) });
    tono(m, d, t, rnd(90, 120), 0.04, 0.07, { hasta: 50 });
    return 0.05;
  },
  dano: (m, d, t) => {
    tono(m, d, t, 240, 0.22, 0.2, { tipo: 'square', hasta: 95, filtro: 1500 });
    tono(m, d, t, 252, 0.22, 0.12, { tipo: 'sawtooth', hasta: 100, filtro: 1200 });
    ruido(m, d, t, 0.1, 0.2, { filtro: 'bandpass', frec: 1000 });
    return 0.24;
  },
  muerte: (m, d, t) => {
    tono(m, d, t, 440, 1.1, 0.16, { tipo: 'sawtooth', hasta: 55, filtro: 1400, envio: 0.4 });
    [79, 75, 72, 67].forEach((n, i) => pulsar(m, d, t + 0.35 + i * 0.22, n, 0.25, 0.4, 1.5, 0.5));
    return 1.9;
  },
  letra_ok: (m, d, t) => {
    const n = PENTA[Math.min(PENTA.length - 1, letraIdx++)];
    tono(m, d, t, mtof(n), 0.25, 0.16, { tipo: 'triangle', envio: 0.35 });
    tono(m, d, t, mtof(n + 12), 0.15, 0.05, { envio: 0.35 });
    return 0.26;
  },
  letra_fallo: (m, d, t) => {
    tono(m, d, t, 165, 0.2, 0.14, { tipo: 'square', filtro: 900 });
    tono(m, d, t, 155, 0.2, 0.14, { tipo: 'square', filtro: 900 });
    return 0.21;
  },
  perfecto: (m, d, t) => {
    [79, 83, 86, 91, 95].forEach((n, i) => campana(m, d, t + i * 0.06, mtof(n), 0.9, 0.12, 0.6));
    ruido(m, d, t + 0.25, 0.6, 0.05, { filtro: 'highpass', frec: 6000, ataque: 0.1, envio: 0.5 });
    return 1.3;
  },
  conjuro_ok: (m, d, t) => {
    tono(m, d, t, mtof(74), 0.2, 0.14, { tipo: 'triangle', envio: 0.4 });
    tono(m, d, t + 0.1, mtof(81), 0.45, 0.14, { tipo: 'triangle', envio: 0.4 });
    return 0.6;
  },
  conjuro_fallo: (m, d, t) => {
    tono(m, d, t, mtof(62), 0.22, 0.14, { tipo: 'sawtooth', filtro: 800 });
    tono(m, d, t + 0.16, mtof(61), 0.45, 0.14, { tipo: 'sawtooth', filtro: 600, hasta: mtof(55) });
    return 0.65;
  },
  purificar: (m, d, t) => {
    for (let i = 0; i < 7; i++) {
      const n = PENTA[2 + Math.floor(Math.random() * 7)];
      campana(m, d, t + i * 0.07 + rnd(0, 0.03), mtof(n), 0.9, 0.08, 0.7);
    }
    pad(m, d, t, [67, 71, 74], 0.9, 0.04, 2400);
    return 1.4;
  },
  eco: (m, d, t) => {
    campana(m, d, t, rnd(1700, 2600), 0.35, 0.06, 0.4);
    return 0.35;
  },
  altar: (m, d, t) => {
    pad(m, d, t, [55, 62, 67, 71, 74], 2.2, 0.07, 1600);
    [79, 83, 86].forEach((n, i) => campana(m, d, t + 0.4 + i * 0.25, mtof(n), 1.4, 0.06, 0.7));
    return 2.6;
  },
  mejora: (m, d, t) => {
    [67, 71, 74, 79, 83].forEach((n, i) => tono(m, d, t + i * 0.07, mtof(n), 0.3, 0.12, { tipo: 'triangle', envio: 0.4 }));
    campana(m, d, t + 0.35, mtof(91), 0.8, 0.08, 0.6);
    return 1.1;
  },
  ui_mover: (m, d, t) => {
    tono(m, d, t, 700, 0.045, 0.08, { tipo: 'triangle' });
    return 0.05;
  },
  ui_aceptar: (m, d, t) => {
    tono(m, d, t, 660, 0.07, 0.1, { tipo: 'triangle' });
    tono(m, d, t + 0.07, 990, 0.14, 0.1, { tipo: 'triangle', envio: 0.2 });
    return 0.22;
  },
  chaneque_risa: (m, d, t) => {
    const base = rnd(520, 700);
    for (let i = 0; i < 5; i++) {
      const f = base * (1 - i * 0.06);
      tono(m, d, t + i * 0.09, f, 0.07, 0.09, { tipo: 'square', hasta: f * 1.25, filtro: 1800 });
    }
    return 0.5;
  },
  chaneque_ataque: (m, d, t) => {
    ruido(m, d, t, 0.15, 0.18, { filtro: 'bandpass', frec: 2500, hasta: 700, q: 1.5 });
    tono(m, d, t, 430, 0.13, 0.1, { tipo: 'square', hasta: 190, filtro: 1500 });
    return 0.16;
  },
  jefe_rugido: (m, d, t) => {
    tono(m, d, t, 85, 1.2, 0.3, { tipo: 'sawtooth', hasta: 55, filtro: 700, vibrato: 9, vibratoProf: 60, ataque: 0.08, envio: 0.4 });
    tono(m, d, t, 128, 1.0, 0.18, { tipo: 'square', hasta: 70, filtro: 500, ataque: 0.1 });
    ruido(m, d, t, 1.1, 0.25, { filtro: 'lowpass', frec: 700, hasta: 250, ataque: 0.08 });
    return 1.3;
  },
  jefe_golpe: (m, d, t) => {
    tono(m, d, t, 95, 0.45, 0.5, { hasta: 30 });
    ruido(m, d, t, 0.3, 0.35, { filtro: 'lowpass', frec: 900, hasta: 120, envio: 0.3 });
    return 0.5;
  },
  antena_zumbido: (m, d, t) => {
    tono(m, d, t, 60, 0.8, 0.14, { tipo: 'sawtooth', filtro: 1400, vibrato: 7, vibratoProf: 30, ataque: 0.1 });
    tono(m, d, t, 120.5, 0.8, 0.08, { tipo: 'square', filtro: 900, ataque: 0.1 });
    for (let i = 0; i < 4; i++) ruido(m, d, t + rnd(0, 0.7), 0.03, 0.1, { filtro: 'highpass', frec: 4000 });
    return 0.85;
  },
  antena_rota: (m, d, t) => {
    ruido(m, d, t, 0.5, 0.4, { filtro: 'lowpass', frec: 3000, hasta: 200, envio: 0.4 });
    tono(m, d, t, 900, 1.0, 0.15, { tipo: 'sawtooth', hasta: 40, filtro: 2000 });
    for (let i = 0; i < 8; i++) ruido(m, d, t + rnd(0.05, 1.0), 0.025, 0.15, { filtro: 'highpass', frec: 3500 });
    campana(m, d, t + 0.6, mtof(86), 1.5, 0.06, 0.8);
    return 1.6;
  },
  sobrecalentado: (m, d, t) => {
    ruido(m, d, t, 0.7, 0.14, { filtro: 'highpass', frec: 3500, hasta: 1500, ataque: 0.02 });
    for (let i = 0; i < 3; i++) tono(m, d, t + i * 0.12, 1250, 0.06, 0.08, { tipo: 'square', filtro: 3000 });
    return 0.75;
  },
  interactuar: (m, d, t) => {
    pulsar(m, d, t, 74, 0.3, 0.6, 0.7, 0.3);
    pulsar(m, d, t + 0.08, 79, 0.3, 0.6, 0.9, 0.3);
    return 0.5;
  },
  aprender: (m, d, t) => {
    pad(m, d, t, [62, 67, 71, 74], 2.0, 0.06, 2200);
    [67, 71, 74, 79, 83, 86, 91].forEach((n, i) => campana(m, d, t + 0.1 + i * 0.09, mtof(n), 1.0, 0.07, 0.7));
    return 2.2;
  },
  ...EFECTOS_N03,
};

/** Alias de nombres que otros sistemas podrían usar. */
export const ALIAS: Record<string, string> = {
  laser_verde: 'disparo_verde',
  laser_rojo: 'disparo_rojo',
  'daño': 'dano',
  golpe: 'impacto',
  hit: 'impacto',
  // Nombres que usan los enemigos del Nivel 3 → efectos existentes.
  encapuchado_conjuro: 'proyectil_oscuro',
  proyectil_reflejo: 'escudo_golpe',
  olmeca_carga: 'olmeca_rugido',
  olmeca_invocar: 'olmeca_invoca',
  olmeca_ojos_apagados: 'luna_off',
  ui_error: 'letra_fallo',
};

/** Voces simultáneas máximas por nombre (por defecto 4). */
export const MAX_VOCES: Record<string, number> = {
  paso: 2,
  eco: 3,
  impacto: 4,
  letra_ok: 2,
  altar: 1,
  aprender: 1,
  jefe_rugido: 1,
  antena_zumbido: 2,
  antena_rota: 1,
  muerte: 1,
  perfecto: 1,
  purificar: 2,
  ...MAX_VOCES_N03,
};
