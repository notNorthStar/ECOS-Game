/**
 * Música procedural en bucle con secuenciador de anticipación (lookahead):
 * un setInterval de ~25 ms agenda las notas que caen en los próximos 100 ms.
 *
 * Todas las pistas usan una rejilla de corcheas en 6/8 con sesquiáltera
 * (ciclo de 12 corcheas = un compás de 6/8 + uno de 3/4), como el son jarocho.
 */
import { bombo, campana, mtof, pad, pulsar, rasguear, ruido, slap, tarima, tono, type Motor } from './motor';
import { FANDANGO, programarFandango } from './fandango';
import { PISTAS_N03 } from './catemaco';
import { PISTAS_N04 } from './oaxaca';
import { PISTAS_N06 } from './cdmx';
import { PISTAS_N07 } from './cdmx2';
import { PISTAS_N10 } from './gdl';

const ANTICIPO = 0.1;
const FUNDIDO_ENTRADA = 1.2;
const FUNDIDO_SALIDA = 1.6;

export interface Persistente {
  parar(t: number): void;
  intensidad?(v: number, t: number): void;
}

export interface DefPista {
  /** Duración de una corchea (s). */
  paso: number;
  /** Corcheas por vuelta del bucle. */
  pasos: number;
  /** Ganancia de la pista. */
  volumen: number;
  programar(m: Motor, salida: AudioNode, paso: number, t: number, intensidad: number, progreso: number): void;
  iniciar?(m: Motor, salida: AudioNode, t: number): Persistente;
}

// ── Armonía (Sol mayor) ───────────────────────────────────────────────────────
type Grado = 'I' | 'IV' | 'V7';
/** Voicing tipo jarana (5 órdenes, registro agudo). */
const JARANA: Record<Grado, number[]> = {
  I: [62, 67, 71, 74, 79],
  IV: [64, 67, 72, 76, 79],
  V7: [62, 66, 69, 72, 78],
};
const LEONA: Record<Grado, number> = { I: 43, IV: 48, V7: 50 };
/** Progresión I–IV–V7 por medio ciclo (6 corcheas): 8 mitades = 48 corcheas. */
const PROG: Grado[] = ['I', 'IV', 'V7', 'V7', 'I', 'IV', 'V7', 'I'];
const gradoEn = (paso: number): Grado => PROG[Math.floor((paso % 48) / 6)];

type Frase = Array<[number, number, number]>; // [corchea, midi, duración en corcheas]
const indexar = (f: Frase) => new Map(f.map(([p, n, l]) => [p, [n, l] as const]));

// Requinto: frase A (nostálgica, sexta mayor muy presente) y frase B (arpegiada tipo arpa).
const FRASE_A = indexar([
  [0, 74, 2], [2, 71, 1], [3, 74, 2], [5, 76, 1],
  [6, 76, 2], [8, 72, 2], [10, 79, 2],
  [12, 78, 3], [15, 76, 1], [16, 74, 2],
  [18, 72, 2], [20, 74, 1], [21, 76, 1], [22, 78, 2],
  [24, 79, 3], [27, 74, 3],
  [30, 76, 2], [32, 72, 2], [34, 76, 2],
  [36, 74, 2], [38, 72, 2], [40, 69, 2],
  [42, 71, 6],
]);
const FRASE_B = indexar([
  [0, 67, 1], [1, 71, 1], [2, 74, 1], [3, 79, 3],
  [6, 79, 1], [7, 76, 1], [8, 72, 1], [9, 76, 3],
  [12, 78, 2], [14, 74, 1], [15, 72, 1], [16, 69, 2],
  [18, 66, 1], [19, 69, 1], [20, 72, 1], [21, 74, 1], [22, 78, 2],
  [24, 79, 2], [26, 78, 1], [27, 76, 3],
  [30, 76, 1], [31, 79, 1], [32, 76, 1], [33, 72, 3],
  [36, 74, 2], [38, 78, 1], [39, 76, 1], [40, 72, 2],
  [42, 67, 3], [45, 71, 1], [46, 74, 2],
]);
const fraseEn = (paso: number) => (Math.floor((paso % 96) / 48) === 0 ? FRASE_A : FRASE_B);

const humano = (t: number) => t + (Math.random() - 0.5) * 0.008;

// ── Pistas ────────────────────────────────────────────────────────────────────

/** Son jarocho suave: jarana, leona y requinto. */
const EXPLORACION: DefPista = {
  paso: 0.19,
  pasos: 96,
  volumen: 0.85,
  programar(m, s, paso, t) {
    const p = paso % 12;
    const g = gradoEn(paso);
    // Rasgueo con acentos de sesquiáltera (6/8: 0 y 3 · 3/4: 6, 8 y 10).
    const RAS: Record<number, [number, boolean]> = {
      0: [0.2, true], 2: [0.09, false], 3: [0.16, true], 5: [0.08, false],
      6: [0.17, true], 8: [0.15, true], 9: [0.07, false], 10: [0.15, true],
    };
    const r = RAS[p];
    if (r) rasguear(m, s, humano(t), JARANA[g], r[0], r[1], 0.55, 0.5);
    // Leona.
    const raiz = LEONA[g];
    if (p === 0 || p === 6) pulsar(m, s, t, raiz, 0.42, 0.3, 0.9, 0.1);
    if (p === 3 || p === 10) pulsar(m, s, t, raiz + 7, 0.3, 0.3, 0.7, 0.1);
    // Requinto (salta una vuelta de cada tres para respirar).
    if (Math.floor(paso / 96) % 3 !== 2) {
      const nota = fraseEn(paso).get(paso % 48);
      if (nota) pulsar(m, s, humano(t), nota[0], 0.26, 0.75, nota[1] * this.paso + 0.5, 0.35, 0.2);
    }
  },
};

/** Combate: misma tonalidad, más rápido, zapateado sobre tarima y cajón. */
const COMBATE: DefPista = {
  paso: 0.13,
  pasos: 96,
  volumen: 0.9,
  programar(m, s, paso, t) {
    const p = paso % 12;
    const g = gradoEn(paso);
    const fuerte = p === 0 || p === 3 || p === 6 || p === 8 || p === 10;
    rasguear(m, s, humano(t), JARANA[g], fuerte ? 0.17 : 0.08, fuerte || p % 2 === 0, 0.35, 0.65);
    const raiz = LEONA[g];
    if (fuerte) pulsar(m, s, t, p === 3 || p === 10 ? raiz + 7 : raiz, 0.45, 0.35, 0.5, 0.05);
    // Cajón.
    if (p === 0 || p === 6) bombo(m, s, t, 0.55, 120, 48, 0.2);
    if (p === 8 || p === 10) bombo(m, s, t, 0.35, 110, 50, 0.15);
    if (p === 3 || p === 9) slap(m, s, t, 0.3);
    // Zapateado: golpe en cada corchea y redobles en semicorcheas.
    tarima(m, s, humano(t), fuerte ? 0.3 : 0.16);
    if (p === 2 || p === 5 || p === 7 || p === 11) tarima(m, s, t + this.paso / 2, 0.14);
    // Requinto más presente.
    const nota = fraseEn(paso).get(paso % 48);
    if (nota) pulsar(m, s, humano(t), nota[0], 0.28, 0.85, nota[1] * this.paso + 0.25, 0.25, 0.2);
  },
};

// Jefe: Mi menor (armónica), percusión pesada y zumbido de la antena.
type GradoM = 'i' | 'VI' | 'VII' | 'V';
const JARANA_M: Record<GradoM, number[]> = {
  i: [64, 67, 71, 76, 79],
  VI: [64, 67, 72, 76, 79],
  VII: [62, 66, 69, 74, 78],
  V: [63, 66, 71, 75, 78],
};
const LEONA_M: Record<GradoM, number> = { i: 40, VI: 36, VII: 38, V: 35 };
const PROG_M: GradoM[] = ['i', 'i', 'VI', 'VII', 'i', 'VI', 'V', 'V'];
const FRASE_JEFE = indexar([
  [0, 71, 6],
  [6, 72, 3], [9, 71, 3],
  [12, 72, 2], [14, 76, 4],
  [18, 74, 3], [21, 78, 3],
  [24, 79, 3], [27, 78, 3],
  [30, 76, 6],
  [36, 75, 3], [39, 78, 3],
  [42, 71, 6],
]);

const JEFE: DefPista = {
  paso: 0.15,
  pasos: 48,
  volumen: 0.85,
  iniciar(m, s, t) {
    const { ctx } = m;
    // Bordón grave.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const gD = ctx.createGain();
    gD.gain.setValueAtTime(0.0001, t);
    gD.gain.linearRampToValueAtTime(0.12, t + 2);
    lp.connect(gD);
    gD.connect(s);
    const oscs: OscillatorNode[] = [];
    for (const [f, tipo] of [[41.2, 'sawtooth'], [41.6, 'sawtooth'], [82.4, 'triangle']] as const) {
      const o = ctx.createOscillator();
      o.type = tipo;
      o.frequency.value = f;
      o.connect(lp);
      oscs.push(o);
    }
    const lfoF = ctx.createOscillator();
    lfoF.frequency.value = 0.15;
    const lfoFG = ctx.createGain();
    lfoFG.gain.value = 140;
    lfoF.connect(lfoFG);
    lfoFG.connect(lp.frequency);
    oscs.push(lfoF);
    // Zumbido eléctrico de la antena (tremolo rápido).
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 4;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const gZ = ctx.createGain();
    gZ.gain.value = 0.025;
    bp.connect(trem);
    trem.connect(gZ);
    gZ.connect(s);
    const zum = ctx.createOscillator();
    zum.type = 'sawtooth';
    zum.frequency.value = 164.8;
    zum.connect(bp);
    oscs.push(zum);
    const lfoT = ctx.createOscillator();
    lfoT.frequency.value = 7;
    const lfoTG = ctx.createGain();
    lfoTG.gain.value = 0.5;
    lfoT.connect(lfoTG);
    lfoTG.connect(trem.gain);
    oscs.push(lfoT);
    for (const o of oscs) o.start(t);
    return {
      parar(tf) {
        for (const o of oscs) o.stop(tf + 0.1);
      },
      intensidad(v, ti) {
        gZ.gain.setTargetAtTime(0.025 + v * 0.03, ti, 0.5);
        lfoT.frequency.setTargetAtTime(7 + v * 5, ti, 0.5);
        gD.gain.setTargetAtTime(0.12 + v * 0.05, ti, 0.5);
      },
    };
  },
  programar(m, s, paso, t, int) {
    const p = paso % 12;
    const g = PROG_M[Math.floor((paso % 48) / 6)];
    const fuerte = p === 0 || p === 3 || p === 6 || p === 8 || p === 10;
    if (fuerte) rasguear(m, s, humano(t), JARANA_M[g], 0.13, true, 0.45, 0.45);
    else if (int > 0.5 && p % 2 === 1) rasguear(m, s, humano(t), JARANA_M[g], 0.06, false, 0.25, 0.5);
    if (p === 0 || p === 6) pulsar(m, s, t, LEONA_M[g], 0.5, 0.3, 0.8, 0.05);
    // Tambores pesados.
    if (p === 0 || p === 6) bombo(m, s, t, 0.7, 95, 38, 0.32);
    if (p === 10 || (int > 0.5 && p === 8)) bombo(m, s, t, 0.5, 90, 40, 0.25);
    if (p === 3 || p === 9) {
      slap(m, s, t, 0.3);
      ruido(m, s, t, 0.18, 0.12, { filtro: 'lowpass', frec: 1800, envio: 0.4 });
    }
    if (int > 0.5) tarima(m, s, humano(t), fuerte ? 0.25 : 0.12);
    // Lamento de cuerda frotada.
    const nota = FRASE_JEFE.get(paso % 48);
    if (nota) {
      const dur = nota[1] * this.paso;
      const o = { tipo: 'sawtooth' as const, filtro: 1600, ataque: 0.08, vibrato: 5.5, vibratoProf: 18, envio: 0.45 };
      tono(m, s, t, mtof(nota[0] - 12), dur, 0.06, o);
      if (int > 0.5) tono(m, s, t, mtof(nota[0]), dur, 0.04, o);
    }
  },
};

/** Taller de noche: arpegio íntimo, pad y grillos. */
const TALLER_ACORDES: number[][] = [
  [55, 59, 62, 66], // Gmaj7
  [52, 55, 59, 62], // Em7
  [48, 52, 55, 59], // Cmaj7
  [50, 55, 57, 62], // Dsus4
];
const TALLER_ARPEGIO: Record<number, number> = { 0: 0, 2: 1, 3: 2, 5: 3, 6: 4, 8: 3, 9: 2, 11: 1 };
const TALLER: DefPista = {
  paso: 0.26,
  pasos: 48,
  volumen: 0.8,
  programar(m, s, paso, t) {
    const p = paso % 12;
    const ac = TALLER_ACORDES[Math.floor((paso % 48) / 12)];
    const arr = [ac[0], ac[1], ac[2], ac[3], ac[1] + 12];
    const i = TALLER_ARPEGIO[p];
    if (i !== undefined) pulsar(m, s, humano(t), arr[i] + 12, p === 0 ? 0.24 : 0.16, 0.32, 1.6, 0.45, (i - 2) * 0.15);
    if (p === 0) {
      pulsar(m, s, t, ac[0] - 12, 0.3, 0.25, 2.5, 0.2);
      pad(m, s, t, ac.map((n) => n + 12), 12 * this.paso, 0.03, 900);
    }
    // Campanita ocasional (como la gema).
    if (p === 7 && Math.random() < 0.35) {
      const PENTA = [79, 81, 83, 86, 88, 91];
      campana(m, s, t, mtof(PENTA[Math.floor(Math.random() * PENTA.length)]), 1.6, 0.03, 0.8);
    }
    // Grillos.
    if (p === 4 && Math.random() < 0.3) {
      const f = 4200 + Math.random() * 400;
      for (let k = 0; k < 3; k++) tono(m, s, t + k * 0.05, f, 0.03, 0.012, { pan: 0.6 });
    }
  },
};

/** Título: arpa jarocha con el tema, pad y sin percusión. */
const TITULO: DefPista = {
  paso: 0.22,
  pasos: 96,
  volumen: 0.85,
  programar(m, s, paso, t) {
    const p = paso % 6;
    const g = gradoEn(paso);
    const ac = JARANA[g];
    // Arpa: sube y baja por el acorde.
    const orden = [0, 1, 2, 3, 4, 2];
    pulsar(m, s, humano(t), ac[orden[p]] - 12, p === 0 ? 0.2 : 0.13, 0.65, 1.0, 0.35, (orden[p] - 2) * 0.12);
    if (p === 0) {
      pulsar(m, s, t, LEONA[g], 0.3, 0.3, 1.2, 0.15);
      if (paso % 12 === 0) pad(m, s, t, [ac[0], ac[2], ac[3]], 12 * this.paso, 0.025, 1100);
    }
    const nota = fraseEn(paso).get(paso % 48);
    if (nota && paso % 192 >= 48) pulsar(m, s, humano(t), nota[0], 0.24, 0.6, nota[1] * this.paso + 0.6, 0.45);
  },
};

export const PISTAS: Record<string, DefPista> = {
  n01_taller: TALLER,
  n01_exploracion: EXPLORACION,
  n01_combate: COMBATE,
  n01_jefe: JEFE,
  n02_fandango: {
    paso: FANDANGO.paso, pasos: FANDANGO.pasos, volumen: FANDANGO.volumen,
    programar: (m, s, paso, t, _intensidad, progreso) => programarFandango(m, s, paso, t, progreso),
  },
  titulo: TITULO,
  ...PISTAS_N03,
  ...PISTAS_N04,
  ...PISTAS_N06,
  ...PISTAS_N07,
  ...PISTAS_N10,
};

// ── Reproductor ───────────────────────────────────────────────────────────────

/** Grabación del equipo ya decodificada: `intro` suena una vez y luego `bucle` se repite. */
export interface ArchivoMusica {
  intro: AudioBuffer | null;
  bucle: AudioBuffer;
  volumen?: number;
}

/** Filtro pasa-bajos de la música mientras Luna está activa (Hz). */
const FRECUENCIA_LUNA = 1100;

interface Instancia {
  nombre: string;
  salida: GainNode;
  def: DefPista | null;
  fuentes: AudioBufferSourceNode[];
  persistente: Persistente | null;
  paso: number;
  siguiente: number;
  fin: number; // hora a partir de la cual se elimina (Infinity si sigue)
}

export class Musica {
  private activas: Instancia[] = [];
  private actualNombre: string | null = null;
  private intensidad = 0;
  private progresoFandango = 0;

  /** Pasa-bajos común a toda la música (se cierra con Luna). */
  private filtro: BiquadFilterNode;

  constructor(
    private m: Motor,
    private archivo: (nombre: string) => ArchivoMusica | null,
  ) {
    this.filtro = m.ctx.createBiquadFilter();
    this.filtro.type = 'lowpass';
    this.filtro.frequency.value = 20000;
    this.filtro.Q.value = 0.7;
    this.filtro.connect(m.busMusica);
  }

  /** Muffla suavemente la música mientras Luna está activa. */
  setLuna(activa: boolean): void {
    this.filtro.frequency.setTargetAtTime(activa ? FRECUENCIA_LUNA : 20000, this.m.ctx.currentTime, 0.4);
  }

  get actual(): string | null {
    return this.actualNombre;
  }

  reproducir(nombre: string | null): void {
    if (nombre === this.actualNombre) return;
    const { ctx } = this.m;
    const ahora = ctx.currentTime;
    for (const inst of this.activas) {
      if (inst.fin !== Infinity) continue;
      inst.salida.gain.cancelScheduledValues(ahora);
      inst.salida.gain.setValueAtTime(inst.salida.gain.value, ahora);
      inst.salida.gain.linearRampToValueAtTime(0.0001, ahora + FUNDIDO_SALIDA);
      inst.fin = ahora + FUNDIDO_SALIDA;
      inst.persistente?.parar(inst.fin);
      for (const f of inst.fuentes) f.stop(inst.fin + 0.05);
    }
    this.actualNombre = nombre;
    this.intensidad = 0;
    if (!nombre) return;
    const def = PISTAS[nombre] ?? null;
    // Una grabación completa no puede representar las estrofas ausentes: esta pista
    // utiliza las capas sintetizadas hasta contar con stems independientes del equipo.
    const buf = nombre === 'n02_fandango' ? null : this.archivo(nombre);
    if (!def && !buf) {
      console.warn(`[Audio] pista desconocida: ${nombre}`);
      return;
    }
    const salida = ctx.createGain();
    const vol = buf?.volumen ?? def?.volumen ?? 0.9;
    salida.gain.setValueAtTime(0.0001, ahora);
    salida.gain.linearRampToValueAtTime(vol, ahora + FUNDIDO_ENTRADA);
    salida.connect(this.filtro);
    const inst: Instancia = {
      nombre,
      salida,
      def: buf ? null : def,
      fuentes: [],
      persistente: null,
      paso: 0,
      siguiente: ahora + 0.05,
      fin: Infinity,
    };
    if (buf) {
      let t0 = ahora + 0.02;
      if (buf.intro) {
        const si = ctx.createBufferSource();
        si.buffer = buf.intro;
        si.connect(salida);
        si.start(t0);
        inst.fuentes.push(si);
        t0 += buf.intro.duration;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf.bucle;
      src.loop = true;
      src.connect(salida);
      src.start(t0);
      inst.fuentes.push(src);
    } else if (def?.iniciar) {
      inst.persistente = def.iniciar(this.m, salida, ahora);
    }
    this.activas.push(inst);
  }

  /** 0..1: sube capas en las pistas que lo soportan (jefe fase 2). */
  setIntensidad(v: number): void {
    this.intensidad = v;
    const ahora = this.m.ctx.currentTime;
    for (const inst of this.activas) if (inst.fin === Infinity) inst.persistente?.intensidad?.(v, ahora);
  }

  /** Se restaura desde el director también al reentrar/morir; no reinicia el compás. */
  setProgresoFandango(recuperadas: number, total: number): void {
    this.progresoFandango = Number.isFinite(recuperadas) && Number.isFinite(total) && total > 0
      ? Math.max(0, Math.min(1, recuperadas / total)) : 0;
  }

  /** Lo llama el secuenciador cada ~25 ms. */
  tick(): void {
    const { ctx } = this.m;
    const ahora = ctx.currentTime;
    const limite = ahora + ANTICIPO;
    for (const inst of this.activas) {
      const def = inst.def;
      if (!def) continue;
      // Si el contexto estuvo suspendido o la pestaña en segundo plano, no intentes "ponerte al día".
      if (inst.siguiente < ahora - 0.2) inst.siguiente = ahora + 0.02;
      while (inst.siguiente < limite && inst.siguiente < inst.fin) {
        def.programar(this.m, inst.salida, inst.paso, inst.siguiente, inst.fin === Infinity ? this.intensidad : 0, this.progresoFandango);
        inst.siguiente += def.paso;
        inst.paso = (inst.paso + 1) % (def.pasos * 12);
      }
    }
    // Limpia pistas que ya terminaron su fundido.
    this.activas = this.activas.filter((inst) => {
      if (inst.fin !== Infinity && ahora > inst.fin + 2.5) {
        inst.salida.disconnect();
        return false;
      }
      return true;
    });
  }
}
