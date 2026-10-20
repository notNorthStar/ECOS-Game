/**
 * Nivel 4 (Oaxaca): pistas procedurales y efectos sintetizados.
 *
 * Pistas: n04_ciudad (son/jarabe oaxaqueño lento en Re menor, banda de viento en 3/4),
 * n04_combate (misma tonalidad, más rápida e insistente), n04_templo (órgano, coro y campanas
 * lejanas bajo una bóveda) y n04_jefe (banda distorsionada; cambia de color con la forma de la
 * Bruja Guajolote: humana = aguda y mística, ave = grave y percusiva).
 */
import { bombo, campana, mtof, pad, ruido, tono, type Motor } from './motor';
import { coro, drone, ruidoContinuo, unir } from './catemaco';
import type { DefPista, Persistente } from './musica';

type Sintetizador = (m: Motor, d: AudioNode, t: number) => number;
type Frase = Array<[number, number, number]>; // [corchea, midi, duración en corcheas]
const indexar = (f: Frase) => new Map(f.map(([p, n, l]) => [p, [n, l] as const]));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const humano = (t: number) => t + (Math.random() - 0.5) * 0.01;

// ── Banda de viento: primitivas ───────────────────────────────────────────────

interface CfgViento {
  tipo: OscillatorType;
  /** Apertura del filtro como múltiplo de la frecuencia fundamental. */
  brillo: number;
  /** Frecuencia mínima de corte (Hz), para que los graves se oigan. */
  piso?: number;
  ataque: number;
  vib?: number;
  vibProf?: number;
  envio: number;
  /** Realce de metal (Hz) y distorsión (0 = limpio). */
  pico?: number;
  dist?: number;
  soltar?: number;
}

const TROMPETA: CfgViento = { tipo: 'sawtooth', brillo: 4.2, ataque: 0.06, vib: 5.2, vibProf: 14, envio: 0.35, pico: 1500 };
const CLARINETE: CfgViento = { tipo: 'square', brillo: 3, ataque: 0.05, vib: 4.6, vibProf: 8, envio: 0.3 };
const TROMBON: CfgViento = { tipo: 'sawtooth', brillo: 3, piso: 600, ataque: 0.07, vib: 4.8, vibProf: 10, envio: 0.25, pico: 700 };
const TUBA: CfgViento = { tipo: 'sawtooth', brillo: 2.4, piso: 520, ataque: 0.04, envio: 0.15, soltar: 0.08 };

let curvaCache: Float32Array<ArrayBuffer> | null = null;
function curvaDistorsion(): Float32Array<ArrayBuffer> {
  if (curvaCache) return curvaCache;
  const n = 512;
  const c = new Float32Array(n);
  const k = 28;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  curvaCache = c;
  return c;
}

/** Nota de instrumento de viento: dientes de sierra / cuadrada con filtro que se abre al atacar. */
function viento(m: Motor, d: AudioNode, t: number, midi: number, dur: number, vol: number, c: CfgViento, pan = 0): void {
  const { ctx } = m;
  const f = mtof(midi);
  const abierto = Math.min(12000, Math.max(f * c.brillo, c.piso ?? 0));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.1;
  lp.frequency.setValueAtTime(abierto * 0.35, t);
  lp.frequency.linearRampToValueAtTime(abierto, t + c.ataque * 1.6);
  lp.frequency.linearRampToValueAtTime(abierto * 0.75, t + Math.max(c.ataque * 2, dur));
  let nodo: AudioNode = lp;
  if (c.pico) {
    const pk = ctx.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = c.pico;
    pk.Q.value = 1.4;
    pk.gain.value = 5;
    nodo.connect(pk);
    nodo = pk;
  }
  if (c.dist) {
    const w = ctx.createWaveShaper();
    w.curve = curvaDistorsion();
    const pre = ctx.createGain();
    pre.gain.value = 1 + c.dist * 2;
    nodo.connect(pre);
    pre.connect(w);
    nodo = w;
  }
  const g = ctx.createGain();
  const fin = t + dur + (c.soltar ?? 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol * (c.dist ? 0.55 : 1), t + c.ataque);
  g.gain.setValueAtTime(vol * (c.dist ? 0.55 : 1), t + Math.max(c.ataque, dur * 0.7));
  g.gain.linearRampToValueAtTime(0.0001, fin);
  nodo.connect(g);
  let salida: AudioNode = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    salida = p;
  }
  salida.connect(d);
  const e = ctx.createGain();
  e.gain.value = c.envio;
  salida.connect(e);
  e.connect(m.reverb);

  const oscs: OscillatorNode[] = [];
  for (const det of [-6, 6]) {
    const o = ctx.createOscillator();
    o.type = c.tipo;
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(lp);
    oscs.push(o);
  }
  if (c.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = c.vib;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(c.vibProf ?? 10, t + Math.max(0.15, dur * 0.5));
    lfo.connect(lg);
    for (const o of oscs) lg.connect(o.detune);
    oscs.push(lfo);
  }
  for (const o of oscs) {
    o.start(t);
    o.stop(fin + 0.05);
  }
}

/** Tuba / bajo: la nota con un armónico a la octava para que se oiga en bocinas pequeñas. */
function tuba(m: Motor, d: AudioNode, t: number, midi: number, dur: number, vol: number, dist = 0): void {
  viento(m, d, t, midi, dur, vol, { ...TUBA, dist });
  tono(m, d, t, mtof(midi + 12), dur, vol * 0.25, { tipo: 'triangle', filtro: 700, ataque: 0.03, envio: 0.1 });
}

/** Tambora oaxaqueña: parche grave con cuerpo seco. */
function tambora(m: Motor, d: AudioNode, t: number, vol: number): void {
  tono(m, d, t, 150, 0.2, vol, { hasta: 66, filtro: 600, envio: 0.15 });
  ruido(m, d, t, 0.05, vol * 0.4, { filtro: 'bandpass', frec: 500, q: 1.2 });
}

/** Platillo discreto. */
function platillo(m: Motor, d: AudioNode, t: number, vol: number, dur = 0.45): void {
  ruido(m, d, t, dur, vol, { filtro: 'highpass', frec: 6500, envio: 0.3 });
  ruido(m, d, t, dur * 0.5, vol * 0.5, { filtro: 'bandpass', frec: 9500, q: 2 });
}

/** Aleteo: ráfagas de aire graves y rápidas. */
function aleteo(m: Motor, d: AudioNode, t: number, vol: number, golpes = 3, sep = 0.055): void {
  for (let i = 0; i < golpes; i++) {
    const k = t + i * sep;
    ruido(m, d, k, 0.08, vol, { filtro: 'bandpass', frec: rnd(550, 850), hasta: 280, q: 1.1, envio: 0.15 });
    tono(m, d, k, 95, 0.08, vol * 0.5, { hasta: 55, filtro: 300 });
  }
}

/** Órgano de iglesia: fundamental, armónicos y subarmónico con ataque lento. */
function organo(m: Motor, d: AudioNode, t: number, midi: number, dur: number, vol: number): void {
  const f = mtof(midi);
  const ataque = Math.min(1.4, dur * 0.3);
  for (const [mult, a] of [[1, 1], [2, 0.5], [3, 0.28], [4, 0.16], [0.5, 0.4]] as const) {
    tono(m, d, t, f * mult, dur, vol * a, { ataque, envio: 0.9, filtro: 3200 });
  }
}

// ── Armonía (Re menor) ────────────────────────────────────────────────────────

interface Acorde {
  raiz: number;
  quinta: number;
  notas: number[];
}
const ACORDES: Record<string, Acorde> = {
  Dm: { raiz: 38, quinta: 45, notas: [62, 65, 69] },
  Gm: { raiz: 43, quinta: 50, notas: [62, 67, 70] },
  A7: { raiz: 45, quinta: 52, notas: [61, 64, 67] },
  Bb: { raiz: 46, quinta: 53, notas: [62, 65, 70] },
};
const PROG_CIUDAD = ['Dm', 'Dm', 'Gm', 'A7', 'Dm', 'Bb', 'A7', 'Dm'];
const PROG_COMBATE = ['Dm', 'Dm', 'A7', 'A7', 'Dm', 'Gm', 'A7', 'Dm'];

// ── n04_ciudad ────────────────────────────────────────────────────────────────

// 16 compases de 3/4 (6 corcheas): melodía nostálgica de trompeta.
const MELODIA_CIUDAD = indexar([
  [0, 74, 3], [3, 77, 2], [5, 76, 1],
  [6, 74, 3], [9, 69, 3],
  [12, 70, 3], [15, 74, 3],
  [18, 73, 3], [21, 76, 2], [23, 73, 1],
  [24, 77, 3], [27, 74, 2], [29, 77, 1],
  [30, 77, 3], [33, 74, 3],
  [36, 76, 2], [38, 73, 2], [40, 69, 2],
  [42, 74, 6],
  [48, 81, 3], [51, 77, 2], [53, 79, 1],
  [54, 77, 3], [57, 74, 3],
  [60, 79, 3], [63, 77, 2], [65, 74, 1],
  [66, 76, 3], [69, 73, 3],
  [72, 74, 2], [74, 77, 2], [76, 81, 2],
  [78, 82, 3], [81, 81, 2], [83, 77, 1],
  [84, 76, 3], [87, 73, 3],
  [90, 74, 6],
]);

const CIUDAD: DefPista = {
  paso: 0.34,
  pasos: 96,
  volumen: 0.85,
  iniciar(m, s, t) {
    // Brisa de montaña, muy tenue.
    return ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 520, q: 0.9, vol: 0.01, barrido: [0.06, 160] });
  },
  programar(m, s, paso, t) {
    const p = paso % 6;
    const c = Math.floor((paso % 48) / 6);
    const vuelta = Math.floor(paso / 96) % 3;
    const ac = ACORDES[PROG_CIUDAD[c]];
    const dc = this.paso;
    // Tuba: "oom" en el primer tiempo, nota de paso al final de cada cuatro compases.
    if (p === 0) tuba(m, s, t, ac.raiz, dc * 1.8, 0.2);
    if (p === 4 && c % 4 === 3) tuba(m, s, t, ac.quinta - 12, dc * 1.4, 0.12);
    // "Pah-pah": acordes cortos de clarinetes en el segundo y tercer tiempo.
    if (p === 2 || p === 4) {
      for (const n of ac.notas) viento(m, s, humano(t), n, dc * 1.3, 0.026, CLARINETE, (n - 65) * 0.03);
    }
    // Pad de metal suave que une los compases.
    if (p === 0) pad(m, s, t, ac.notas, 6 * dc, 0.014, 700);
    // Tambora y platillo discretos.
    if (p === 0) tambora(m, s, t, 0.16);
    if (p === 2 || p === 4) tambora(m, s, t, 0.045);
    if (p === 0 && c % 4 === 0) platillo(m, s, t, 0.018);
    // Melodía: trompeta; la segunda vuelta la dobla un clarinete grave; la tercera descansa.
    if (vuelta !== 2) {
      const nota = MELODIA_CIUDAD.get(paso % 96);
      if (nota) {
        viento(m, s, humano(t), nota[0], nota[1] * dc + 0.05, 0.085, TROMPETA, 0.15);
        if (vuelta === 1) viento(m, s, humano(t), nota[0] - 12, nota[1] * dc, 0.04, CLARINETE, -0.2);
      }
    }
  },
};

// ── n04_combate ───────────────────────────────────────────────────────────────

const RIFF_COMBATE = indexar([
  [0, 74, 1], [1, 74, 1], [2, 77, 2], [4, 76, 1], [5, 74, 1],
  [6, 69, 2], [8, 73, 1], [9, 74, 1], [10, 77, 2],
  [12, 76, 1], [13, 73, 1], [14, 76, 2], [16, 81, 2],
  [18, 79, 2], [20, 76, 2], [22, 73, 2],
  [24, 77, 1], [25, 77, 1], [26, 81, 2], [28, 79, 1], [29, 77, 1],
  [30, 79, 2], [32, 77, 1], [33, 74, 1], [34, 70, 2],
  [36, 73, 1], [37, 76, 1], [38, 79, 2], [40, 76, 1], [41, 73, 1],
  [42, 74, 4], [46, 74, 1], [47, 77, 1],
]);

const COMBATE: DefPista = {
  paso: 0.17,
  pasos: 48,
  volumen: 0.9,
  programar(m, s, paso, t) {
    const p = paso % 6;
    const c = Math.floor((paso % 48) / 6);
    const vuelta = Math.floor(paso / 48) % 2;
    const ac = ACORDES[PROG_COMBATE[c]];
    const dc = this.paso;
    // Tuba insistente: raíz y quinta alternadas.
    if (p === 0) tuba(m, s, t, ac.raiz, dc * 1.6, 0.24);
    if (p === 2) tuba(m, s, t, ac.quinta - 12, dc * 1.2, 0.17);
    if (p === 4) tuba(m, s, t, ac.raiz, dc * 1.2, 0.17);
    // Acordes cortantes de trombones en los contratiempos.
    if (p === 1 || p === 3 || p === 5) {
      for (const n of ac.notas) viento(m, s, humano(t), n, dc * 0.8, 0.028, TROMBON);
    }
    // Tambora a cada tiempo, redoble al final del compás.
    tambora(m, s, t, p === 0 ? 0.3 : p % 2 === 0 ? 0.2 : 0.07);
    if (p === 5) tambora(m, s, t + dc / 2, 0.12);
    if (p === 0 || p === 3) platillo(m, s, t, p === 0 ? 0.03 : 0.015, 0.25);
    // Riff de trompetas; la segunda vuelta suma clarinetes a la octava.
    const nota = RIFF_COMBATE.get(paso % 48);
    if (nota) {
      viento(m, s, humano(t), nota[0], nota[1] * dc * 0.9, 0.085, TROMPETA, 0.1);
      if (vuelta === 1) viento(m, s, humano(t), nota[0] + 12, nota[1] * dc * 0.9, 0.03, CLARINETE, -0.15);
    }
  },
};

// ── n04_templo ────────────────────────────────────────────────────────────────

const TEMPLO_ACORDES: number[][] = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]]; // Dm · Bb · Gm · A
const TEMPLO_CAMPANAS = [74, 77, 81, 86, 89];
const VOCALES: Array<'o' | 'a' | 'u'> = ['o', 'u', 'a'];

const TEMPLO: DefPista = {
  paso: 0.5,
  pasos: 48,
  volumen: 0.85,
  iniciar(m, s, t) {
    return unir(
      drone(m, s, t, {
        notas: [[36.7, 'sawtooth'], [37.0, 'sawtooth'], [73.4, 'triangle'], [110, 'sine']],
        filtro: 220, vol: 0.09, lfo: [0.07, 80], volInt: 0.3, filtroInt: 0.5,
      }),
      // Aire quieto bajo la bóveda.
      ruidoContinuo(m, s, t, { filtro: 'bandpass', frec: 340, q: 2.5, vol: 0.012, barrido: [0.045, 140] }),
    );
  },
  programar(m, s, paso, t) {
    const p = paso % 12;
    const c = Math.floor((paso % 48) / 12);
    const ac = TEMPLO_ACORDES[c];
    const largo = 11 * this.paso;
    if (p === 0) {
      ac.forEach((n) => organo(m, s, t, n + 12, largo, 0.028));
      organo(m, s, t, ac[0] - 12, largo, 0.04);
    }
    // Coro lejano en los compases pares.
    if (p === 0 && c % 2 === 0) {
      ac.forEach((n, i) => coro(m, s, t + i * 0.4, n + 12, 9 * this.paso, 0.026, VOCALES[i % 3], (i - 1) * 0.5));
    }
    // Campanas espaciadas; a veces una invertida un tritono arriba.
    if (p === 6 && Math.random() < 0.8) {
      campana(m, s, t, mtof(TEMPLO_CAMPANAS[Math.floor(Math.random() * TEMPLO_CAMPANAS.length)]), 2.6, 0.03, 0.95);
    }
    if (p === 9 && Math.random() < 0.25) campana(m, s, t, mtof(80), 2.4, 0.016, 0.95);
    // Campanada grave al cerrar el ciclo.
    if (c === 3 && p === 0) campana(m, s, t, mtof(50), 4.5, 0.05, 0.9);
    // Latido lejano de la ciudad bajo la piedra.
    if (p === 0 && c % 2 === 1) tono(m, s, t, 62, 0.55, 0.12, { hasta: 36, filtro: 200, envio: 0.8 });
    // Destello agudo inquietante.
    if (p === 4 && Math.random() < 0.3) {
      const f = rnd(1800, 3000);
      tono(m, s, t, f, 1.8, 0.008, { envio: 0.8, ataque: 0.4, vibrato: 5, vibratoProf: 30 });
      tono(m, s, t, f * 1.414, 1.8, 0.006, { envio: 0.8, ataque: 0.4 });
    }
  },
};

// ── n04_jefe ──────────────────────────────────────────────────────────────────

export type FormaBruja = 'humana' | 'ave';
let formaBruja: FormaBruja = 'humana';
let aplicarForma: ((f: FormaBruja) => void) | null = null;

/** Cambia el color de n04_jefe (humana: aguda y mística; ave: grave y percusiva). */
export function setFormaBruja(f: FormaBruja): void {
  formaBruja = f;
  aplicarForma?.(f);
}

// Frigio con tritono (Re · Mib · Lab): disonante y ritual.
const MOTIVO_JEFE = indexar([
  [0, 74, 2], [2, 75, 2], [4, 80, 2],
  [6, 79, 3], [9, 75, 3],
  [12, 74, 2], [14, 77, 2], [16, 80, 2],
  [18, 81, 6],
  [24, 82, 2], [26, 81, 2], [28, 80, 2],
  [30, 77, 3], [33, 75, 3],
  [36, 74, 2], [38, 75, 2], [40, 74, 2],
  [42, 80, 6],
]);
const CLUSTER_JEFE = [62, 63, 68]; // Re · Mib · Lab

const JEFE: DefPista = {
  paso: 0.14,
  pasos: 48,
  volumen: 0.88,
  iniciar(m, s, t): Persistente {
    const { ctx } = m;
    let nivel = 0;
    // Bajo del ave: bordón grave.
    const lpB = ctx.createBiquadFilter();
    lpB.type = 'lowpass';
    const gBajo = ctx.createGain();
    gBajo.gain.value = 0.0001;
    lpB.connect(gBajo);
    gBajo.connect(s);
    // Brillo de la humana: sonidos puros cercanos (Re, Mib, Lab).
    const gAlto = ctx.createGain();
    gAlto.gain.value = 0.0001;
    gAlto.connect(s);
    const eAlto = ctx.createGain();
    eAlto.gain.value = 0.6;
    gAlto.connect(eAlto);
    eAlto.connect(m.reverb);
    // Ráfagas de viento.
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.value = 650;
    const gViento = ctx.createGain();
    gViento.gain.value = 0.0001;
    bp.connect(gViento);
    gViento.connect(s);

    const fuentes: Array<OscillatorNode | AudioBufferSourceNode> = [];
    for (const [f, tipo] of [[36.7, 'sawtooth'], [37.2, 'sawtooth'], [73.4, 'triangle'], [103.8, 'triangle']] as const) {
      const o = ctx.createOscillator();
      o.type = tipo;
      o.frequency.value = f;
      o.connect(lpB);
      fuentes.push(o);
    }
    for (const f of [587.3, 622.3, 830.6]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gAlto);
      fuentes.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.22;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 320;
    lfo.connect(lfoG);
    lfoG.connect(bp.frequency);
    fuentes.push(lfo);
    const rs = ctx.createBufferSource();
    rs.buffer = m.ruido;
    rs.loop = true;
    rs.connect(bp);
    fuentes.push(rs);

    const aplicar = (f: FormaBruja, inmediato = false): void => {
      const ave = f === 'ave';
      const ti = ctx.currentTime;
      const tc = inmediato ? 0.001 : 0.6;
      const k = 1 + nivel * 0.4;
      gBajo.gain.setTargetAtTime((ave ? 0.13 : 0.06) * k, ti, tc);
      lpB.frequency.setTargetAtTime(ave ? 380 : 230, ti, tc);
      gAlto.gain.setTargetAtTime(ave ? 0.0001 : 0.022, ti, tc);
      gViento.gain.setTargetAtTime((ave ? 0.06 : 0.014) * (1 + nivel * 0.5), ti, tc);
    };
    aplicar(formaBruja, true);
    aplicarForma = (f) => aplicar(f);
    for (const o of fuentes) o.start(t);
    const yo = aplicarForma;
    return {
      parar(tf) {
        for (const o of fuentes) o.stop(tf + 0.1);
        if (aplicarForma === yo) aplicarForma = null;
      },
      intensidad(v) {
        nivel = v;
        aplicar(formaBruja);
      },
    };
  },
  programar(m, s, paso, t, int) {
    const ave = formaBruja === 'ave';
    const p = paso % 6;
    const c = Math.floor((paso % 48) / 6);
    const dc = this.paso;
    // Percusión: la forma de ave es pesada y constante; la humana, ritual y espaciada.
    if (ave) {
      if (p % 2 === 0) bombo(m, s, t, p === 0 ? 0.85 : 0.58, 95, 36, 0.3);
      if (p === 3 || p === 5) tambora(m, s, t, 0.32);
      if (p === 0 || p === 4) platillo(m, s, t, 0.035 + int * 0.02, 0.3);
      if (p === 1 || p === 3 || p === 5) aleteo(m, s, t, 0.06 + int * 0.04);
    } else {
      if (p === 0) bombo(m, s, t, 0.6, 100, 40, 0.3);
      if (p === 4) tambora(m, s, t, 0.26);
      if (int > 0.3 && p === 2) tambora(m, s, t, 0.14);
      if (p === 0 && c % 2 === 0) platillo(m, s, t, 0.022, 0.5);
    }
    // Melodía: el ave la toca dos octavas abajo, distorsionada; la humana arriba, más clara.
    const nota = MOTIVO_JEFE.get(paso % 48);
    if (nota) {
      const dur = nota[1] * dc;
      if (ave) {
        tuba(m, s, humano(t), nota[0] - 24, dur, 0.18, 1);
        viento(m, s, humano(t), nota[0] - 12, dur, 0.08, { ...TROMBON, dist: 1 });
        if (int > 0.5) viento(m, s, humano(t), nota[0] - 12 + 6, dur, 0.05, { ...TROMBON, dist: 1 });
      } else {
        viento(m, s, humano(t), nota[0], dur, 0.075, { ...TROMPETA, dist: 0.5 }, 0.15);
        if (int > 0.3) viento(m, s, humano(t), nota[0] + 6, dur, 0.03, CLARINETE, -0.2);
      }
    }
    // Acorde-racimo disonante en el primer tiempo (más agudo en la humana).
    if (p === 0) {
      CLUSTER_JEFE.forEach((n, i) => {
        viento(m, s, humano(t) + i * 0.012, n + (ave ? -12 : 12), dc * 2.4, 0.04, { ...TROMPETA, dist: 1 });
      });
    }
    // Humana: coro místico y campanas; ave: graznido seco ocasional.
    if (!ave) {
      if (p === 0 && c % 2 === 0) [74, 75, 80].forEach((n, i) => coro(m, s, t + i * 0.1, n, 7 * dc, 0.022, VOCALES[i], (i - 1) * 0.5));
      if (p === 3 && Math.random() < 0.18) campana(m, s, t, mtof(rnd(0, 1) < 0.5 ? 86 : 92), 1.6, 0.035, 0.9);
    } else if (p === 5 && c % 2 === 1 && Math.random() < 0.5) {
      tono(m, s, t, 700, 0.2, 0.05, { tipo: 'sawtooth', hasta: 260, filtro: 2200, vibrato: 18, vibratoProf: 80 });
    }
  },
};

export const PISTAS_N04: Record<string, DefPista> = {
  n04_ciudad: CIUDAD,
  n04_combate: COMBATE,
  n04_templo: TEMPLO,
  n04_jefe: JEFE,
};

// ── Efectos ───────────────────────────────────────────────────────────────────

export const EFECTOS_N04: Record<string, Sintetizador> = {
  maria_lamento: (m, d, t) => {
    // Llanto de mujer: voz que cae con vibrato, coro y campana lejana.
    tono(m, d, t, 540, 1.0, 0.07, { hasta: 360, ataque: 0.12, vibrato: 5.5, vibratoProf: 40, envio: 0.9 });
    tono(m, d, t + 0.05, 810, 0.9, 0.025, { hasta: 540, ataque: 0.15, vibrato: 5.5, vibratoProf: 35, envio: 0.9 });
    tono(m, d, t + 0.95, 470, 0.7, 0.05, { hasta: 300, ataque: 0.08, vibrato: 6, vibratoProf: 50, envio: 0.9 });
    coro(m, d, t, 62, 1.1, 0.035, 'a');
    campana(m, d, t + 0.6, mtof(81), 1.4, 0.03, 0.95);
    return 1.8;
  },
  'bestia_gruñido': (m, d, t) => {
    tono(m, d, t, 72, 0.6, 0.26, { tipo: 'sawtooth', hasta: 52, filtro: 420, vibrato: 26, vibratoProf: 90, ataque: 0.05, envio: 0.2 });
    tono(m, d, t, 110, 0.5, 0.12, { tipo: 'square', hasta: 70, filtro: 500, vibrato: 30, vibratoProf: 60 });
    ruido(m, d, t, 0.55, 0.14, { filtro: 'lowpass', frec: 650, hasta: 180, ataque: 0.05 });
    return 0.65;
  },
  bestia_embestida: (m, d, t) => {
    ruido(m, d, t, 0.4, 0.22, { filtro: 'bandpass', frec: 350, hasta: 1800, q: 1.1, ataque: 0.12 });
    tono(m, d, t, 180, 0.35, 0.18, { tipo: 'sawtooth', hasta: 90, filtro: 700, ataque: 0.1 });
    tono(m, d, t + 0.3, 130, 0.18, 0.3, { hasta: 45 });
    ruido(m, d, t + 0.3, 0.1, 0.2, { filtro: 'lowpass', frec: 900 });
    return 0.55;
  },
  bestia_aullido: (m, d, t) => {
    const v = rnd(0.97, 1.05);
    tono(m, d, t, 300 * v, 1.3, 0.13, { tipo: 'sawtooth', hasta: 560 * v, filtro: 1400, ataque: 0.2, vibrato: 5, vibratoProf: 35, envio: 0.6 });
    tono(m, d, t + 0.6, 560 * v, 0.9, 0.13, { tipo: 'sawtooth', hasta: 270 * v, filtro: 1300, ataque: 0.05, vibrato: 6, vibratoProf: 50, envio: 0.6 });
    ruido(m, d, t, 1.4, 0.04, { filtro: 'bandpass', frec: 1100, q: 2, ataque: 0.3, envio: 0.5 });
    return 1.6;
  },
  bestia_purificar: (m, d, t) => {
    // El gruñido se ablanda y se vuelve luz cálida.
    tono(m, d, t, 130, 0.5, 0.12, { tipo: 'triangle', hasta: 260, ataque: 0.05, envio: 0.4 });
    tono(m, d, t + 0.15, 260, 0.8, 0.07, { hasta: 880, ataque: 0.1, envio: 0.7 });
    [74, 77, 81, 86, 89].forEach((n, i) => campana(m, d, t + 0.2 + i * 0.1, mtof(n), 1.1, 0.06, 0.85));
    pad(m, d, t + 0.1, [62, 65, 69, 74], 1.4, 0.035, 2200);
    return 1.8;
  },
  bruja_risa: (m, d, t) => {
    // Carcajada rasposa: ráfagas cortas que suben y bajan.
    const base = [520, 640, 720, 680, 600, 520, 470];
    base.forEach((f, i) => {
      const k = t + i * 0.115;
      tono(m, d, k, f, 0.1, 0.1, { tipo: 'sawtooth', hasta: f * 0.82, filtro: 1900, vibrato: 30, vibratoProf: 60, ataque: 0.01, envio: 0.3 });
      ruido(m, d, k, 0.08, 0.05, { filtro: 'bandpass', frec: 1500, q: 3 });
    });
    return 1.0;
  },
  bruja_fuego: (m, d, t) => {
    ruido(m, d, t, 0.8, 0.26, { filtro: 'bandpass', frec: 380, hasta: 2600, q: 0.9, ataque: 0.1, envio: 0.3 });
    tono(m, d, t, 90, 0.7, 0.12, { tipo: 'sawtooth', hasta: 150, filtro: 500, ataque: 0.1 });
    for (let i = 0; i < 9; i++) ruido(m, d, t + rnd(0.05, 0.75), 0.03, 0.15, { filtro: 'highpass', frec: rnd(3000, 5500) });
    return 0.9;
  },
  bruja_teleport: (m, d, t) => {
    tono(m, d, t, 1300, 0.18, 0.12, { tipo: 'triangle', hasta: 180 });
    tono(m, d, t + 0.18, 220, 0.2, 0.12, { tipo: 'triangle', hasta: 1500, envio: 0.5 });
    ruido(m, d, t, 0.35, 0.1, { filtro: 'highpass', frec: 4500, hasta: 1500, envio: 0.4 });
    campana(m, d, t + 0.2, mtof(88), 0.7, 0.04, 0.8);
    return 0.6;
  },
  bruja_transformar: (m, d, t) => {
    // Humana -> ave: barrido místico, tormenta de plumas y graznido grave.
    coro(m, d, t, 74, 1.0, 0.04, 'a');
    tono(m, d, t, 200, 1.2, 0.12, { tipo: 'sawtooth', hasta: 950, filtro: 2400, ataque: 0.3, vibrato: 9, vibratoProf: 60, envio: 0.6 });
    ruido(m, d, t, 1.2, 0.2, { filtro: 'bandpass', frec: 500, hasta: 3500, q: 1.3, ataque: 0.4, envio: 0.5 });
    aleteo(m, d, t + 0.6, 0.12, 6, 0.07);
    tono(m, d, t + 1.05, 800, 0.4, 0.14, { tipo: 'sawtooth', hasta: 200, filtro: 2000, vibrato: 20, vibratoProf: 90 });
    tono(m, d, t + 1.05, 70, 0.5, 0.25, { hasta: 38 });
    campana(m, d, t + 0.9, mtof(80), 1.4, 0.04, 0.9);
    return 1.9;
  },
  bruja_embestida: (m, d, t) => {
    // Picada del ave: chillido descendente y rafaga.
    tono(m, d, t, 1500, 0.5, 0.13, { tipo: 'sawtooth', hasta: 260, filtro: 3200, vibrato: 22, vibratoProf: 80, ataque: 0.04 });
    ruido(m, d, t, 0.5, 0.2, { filtro: 'bandpass', frec: 2500, hasta: 300, q: 1.2, ataque: 0.05 });
    tono(m, d, t + 0.4, 110, 0.2, 0.28, { hasta: 42 });
    return 0.65;
  },
  bruja_aleteo: (m, d, t) => {
    aleteo(m, d, t, 0.2, 2, 0.12);
    ruido(m, d, t, 0.3, 0.05, { filtro: 'highpass', frec: 3000, ataque: 0.05 });
    return 0.35;
  },
  memoria: (m, d, t) => {
    // Hilos de luz: campanas que tejen una escala menor, con pad cálido.
    [62, 69, 74, 77, 81, 86].forEach((n, i) => campana(m, d, t + i * 0.08, mtof(n + 12), 1.2, 0.06, 0.8));
    pad(m, d, t, [62, 65, 69, 74], 1.5, 0.045, 2000);
    tono(m, d, t, 330, 0.9, 0.05, { hasta: 660, ataque: 0.2, vibrato: 5, vibratoProf: 20, envio: 0.7 });
    return 1.6;
  },
  pasaje_abre: (m, d, t) => {
    // Piedra que se desliza, polvo y un acorde que se revela.
    ruido(m, d, t, 1.4, 0.28, { filtro: 'lowpass', frec: 320, hasta: 140, ataque: 0.15, envio: 0.3 });
    tono(m, d, t, 58, 1.4, 0.22, { tipo: 'sawtooth', hasta: 38, filtro: 260, vibrato: 11, vibratoProf: 60, ataque: 0.1 });
    ruido(m, d, t + 0.1, 1.2, 0.08, { filtro: 'highpass', frec: 3500, ataque: 0.3 });
    [62, 69, 74, 77].forEach((n, i) => campana(m, d, t + 1.1 + i * 0.07, mtof(n + 12), 1.2, 0.05, 0.9));
    pad(m, d, t + 1.0, [50, 57, 62, 65], 1.2, 0.04, 1600);
    return 2.3;
  },
  fragmento_sello: (m, d, t) => {
    // Gong, fanfarria ascendente y coro: el sello de la memoria se cierra.
    campana(m, d, t, mtof(50), 3.2, 0.14, 0.95);
    tono(m, d, t, 80, 0.6, 0.3, { hasta: 34 });
    [74, 77, 81, 86, 89, 93].forEach((n, i) => campana(m, d, t + 0.25 + i * 0.12, mtof(n), 1.6, 0.06, 0.9));
    [62, 65, 69].forEach((n, i) => coro(m, d, t + 0.3 + i * 0.1, n + 12, 2.0, 0.04, i === 1 ? 'a' : 'o'));
    pad(m, d, t + 0.4, [50, 57, 62, 65, 69], 2.4, 0.045, 2400);
    return 3.2;
  },
  telar: (m, d, t) => {
    // Lanzadera de madera: golpes de peine y roce del hilo.
    for (let i = 0; i < 4; i++) {
      const k = t + i * 0.13;
      ruido(m, d, k, 0.05, 0.2, { filtro: 'bandpass', frec: rnd(900, 1300), q: 3, envio: 0.15 });
      tono(m, d, k, rnd(190, 240), 0.06, 0.12, { hasta: 120, filtro: 700 });
      ruido(m, d, k + 0.05, 0.07, 0.05, { filtro: 'highpass', frec: 4500 });
    }
    return 0.7;
  },
};

export const MAX_VOCES_N04: Record<string, number> = {
  maria_lamento: 1,
  'bestia_gruñido': 2,
  bestia_embestida: 3,
  bestia_aullido: 1,
  bestia_purificar: 2,
  bruja_risa: 1,
  bruja_fuego: 3,
  bruja_teleport: 2,
  bruja_transformar: 1,
  bruja_embestida: 2,
  bruja_aleteo: 2,
  memoria: 1,
  pasaje_abre: 1,
  fragmento_sello: 1,
  telar: 2,
};
