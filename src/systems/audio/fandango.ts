import { pulsar, rasguear, tarima, type Motor } from './motor';

/** Arreglo original de respaldo: sesquiáltera; cinco recuperaciones, cinco entradas. */
export const FANDANGO = {
  paso: 0.18,
  pasos: 96,
  volumen: 0.8,
  estrofas: 5,
  capas: { leona: 1, jarana: 2, requinto: 3, tarima: 4, arpa: 5 },
  ganancias: { pulso: 0.1, leona: 0.27, jarana: 0.11, requinto: 0.19, tarima: 0.17, arpa: 0.09 },
  acordes: [[62, 67, 71, 74, 79], [64, 67, 72, 76, 79], [62, 66, 69, 72, 78]],
  bajos: [43, 48, 50],
  progresion: [0, 0, 1, 1, 2, 2, 0, 2],
  // Melodía propia en dos frases, en MIDI; -1 deja respirar al requinto.
  melodia: [71, -1, 74, 76, -1, 74, 72, -1, 76, 79, -1, 76,
    74, -1, 78, 76, 72, -1, 71, -1, 69, 67, -1, -1,
    74, -1, 79, 78, -1, 74, 76, -1, 79, 76, 72, -1,
    78, -1, 76, 74, 72, -1, 71, 74, 69, 67, -1, -1],
};

/** Cada capa entra en la rejilla actual, sin reiniciar el tema al recoger una estrofa. */
export function programarFandango(m: Motor, salida: AudioNode, paso: number, t: number, progreso: number): void {
  const c = FANDANGO;
  const recuperadas = Math.round(Math.max(0, Math.min(1, progreso)) * c.estrofas);
  const p = paso % 12;
  const grado = c.progresion[Math.floor((paso % 48) / 6)];
  const acorde = c.acordes[grado];
  const fuerte = p === 0 || p === 3 || p === 6 || p === 8 || p === 10;
  // Estado inicial: sólo una cuerda de jarana, como un recuerdo incompleto.
  if (p === 0 || p === 6) pulsar(m, salida, t, acorde[1], c.ganancias.pulso, 0.4, 0.7, 0.05);
  if (recuperadas >= c.capas.leona && (p === 0 || p === 3 || p === 6 || p === 10)) {
    pulsar(m, salida, t, c.bajos[grado] + (p === 3 || p === 10 ? 7 : 0), c.ganancias.leona, 0.3, 0.7, 0.05);
  }
  if (recuperadas >= c.capas.jarana && (fuerte || p === 5 || p === 11)) {
    rasguear(m, salida, t, acorde, c.ganancias.jarana * (fuerte ? 1 : 0.5), fuerte, 0.42, 0.45);
  }
  if (recuperadas >= c.capas.requinto && paso % 2 === 0) {
    const nota = c.melodia[Math.floor((paso % 96) / 2)];
    if (nota >= 0) pulsar(m, salida, t, nota, c.ganancias.requinto, 0.7, c.paso * 2 + 0.3, 0.12, -0.2);
  }
  if (recuperadas >= c.capas.tarima) {
    tarima(m, salida, t, c.ganancias.tarima * (fuerte ? 1 : 0.45));
  }
  if (recuperadas >= c.capas.arpa) {
    const orden = [0, 1, 2, 4, 3, 2];
    pulsar(m, salida, t, acorde[orden[paso % 6]] + 12, c.ganancias.arpa, 0.65, 0.75, 0.12, 0.3);
  }
}
