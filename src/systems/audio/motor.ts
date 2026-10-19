/**
 * Motor de audio de bajo nivel (WebAudio puro).
 * Un solo AudioContext, buses de música / efectos, reverb compartida y primitivas de síntesis
 * (tonos, ruido filtrado, cuerda pulsada Karplus-Strong, pads, campanas).
 */

export interface Motor {
  ctx: AudioContext;
  maestro: GainNode;
  busMusica: GainNode;
  busSfx: GainNode;
  /** Envío a la reverb (conecta aquí además de la salida seca). */
  reverb: GainNode;
  ruido: AudioBuffer;
}

let motor: Motor | null = null;

export function obtenerMotor(): Motor | null {
  if (motor) return motor;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  // Compresor suave al final para que nada sature.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);

  const maestro = ctx.createGain();
  maestro.gain.value = 0.9;
  maestro.connect(comp);

  const busMusica = ctx.createGain();
  busMusica.gain.value = 0;
  busMusica.connect(maestro);
  const busSfx = ctx.createGain();
  busSfx.gain.value = 0.8;
  busSfx.connect(maestro);

  // Reverb: respuesta al impulso generada (ruido que decae).
  const conv = ctx.createConvolver();
  conv.buffer = impulso(ctx, 2.2, 2.6);
  const reverb = ctx.createGain();
  reverb.gain.value = 0.35;
  reverb.connect(conv);
  conv.connect(maestro);

  const ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = ruido.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  motor = { ctx, maestro, busMusica, busSfx, reverb, ruido };
  return motor;
}

function impulso(ctx: AudioContext, seg: number, caida: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seg);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, caida);
  }
  return b;
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Crea una ganancia con envolvente ADSR simplificada (ataque + caída exponencial). */
export function envolvente(
  ctx: AudioContext,
  t: number,
  vol: number,
  ataque: number,
  dur: number,
  destino: AudioNode,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + Math.max(0.002, ataque));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(ataque + 0.01, dur));
  g.connect(destino);
  return g;
}

export interface OpcTono {
  tipo?: OscillatorType;
  hasta?: number; // frecuencia final (barrido exponencial)
  ataque?: number;
  filtro?: number; // lowpass
  detune?: number;
  vibrato?: number; // Hz
  vibratoProf?: number; // cents
  envio?: number; // cantidad a la reverb
  pan?: number;
}

/** Tono simple con barrido opcional. Devuelve la hora de fin. */
export function tono(
  m: Motor,
  destino: AudioNode,
  t: number,
  frec: number,
  dur: number,
  vol: number,
  o: OpcTono = {},
): number {
  const { ctx } = m;
  const osc = ctx.createOscillator();
  osc.type = o.tipo ?? 'sine';
  osc.frequency.setValueAtTime(Math.max(1, frec), t);
  if (o.hasta) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.hasta), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  let nodo: AudioNode = osc;
  if (o.filtro) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filtro;
    nodo.connect(f);
    nodo = f;
  }
  let salida: AudioNode = destino;
  if (o.pan !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    p.connect(destino);
    salida = p;
  }
  const g = envolvente(ctx, t, vol, o.ataque ?? 0.005, dur, salida);
  if (o.envio) {
    const e = ctx.createGain();
    e.gain.value = o.envio;
    g.connect(e);
    e.connect(m.reverb);
  }
  nodo.connect(g);
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = o.vibrato;
    lg.gain.value = o.vibratoProf ?? 15;
    lfo.connect(lg);
    lg.connect(osc.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return t + dur;
}

export interface OpcRuido {
  filtro?: BiquadFilterType;
  frec?: number;
  hasta?: number;
  q?: number;
  ataque?: number;
  envio?: number;
}

/** Ráfaga de ruido filtrado. */
export function ruido(m: Motor, destino: AudioNode, t: number, dur: number, vol: number, o: OpcRuido = {}): number {
  const { ctx } = m;
  const src = ctx.createBufferSource();
  src.buffer = m.ruido;
  const f = ctx.createBiquadFilter();
  f.type = o.filtro ?? 'bandpass';
  f.frequency.setValueAtTime(o.frec ?? 1200, t);
  if (o.hasta) f.frequency.exponentialRampToValueAtTime(o.hasta, t + dur);
  f.Q.value = o.q ?? 1;
  const g = envolvente(ctx, t, vol, o.ataque ?? 0.002, dur, destino);
  if (o.envio) {
    const e = ctx.createGain();
    e.gain.value = o.envio;
    g.connect(e);
    e.connect(m.reverb);
  }
  src.connect(f);
  f.connect(g);
  const off = Math.random() * 1.5;
  src.start(t, off);
  src.stop(t + dur + 0.05);
  return t + dur;
}

/** Campana: parciales inarmónicos con caída larga. */
export function campana(m: Motor, destino: AudioNode, t: number, frec: number, dur: number, vol: number, envio = 0.5): number {
  tono(m, destino, t, frec, dur, vol, { envio });
  tono(m, destino, t, frec * 2.76, dur * 0.5, vol * 0.35, { envio });
  tono(m, destino, t, frec * 5.4, dur * 0.25, vol * 0.15, { envio });
  return t + dur;
}

/** Pad suave (dos osciladores desafinados por nota, filtro y ataque lento). */
export function pad(m: Motor, destino: AudioNode, t: number, notas: number[], dur: number, vol: number, brillo = 1200): void {
  const { ctx } = m;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = brillo;
  const g = ctx.createGain();
  const ataque = Math.min(0.9, dur * 0.35);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + ataque);
  g.gain.setValueAtTime(vol, t + dur - Math.min(0.6, dur * 0.3));
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
  f.connect(g);
  g.connect(destino);
  const e = ctx.createGain();
  e.gain.value = 0.6;
  g.connect(e);
  e.connect(m.reverb);
  for (const n of notas) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(n);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.5);
    }
  }
}

// ── Karplus-Strong ──────────────────────────────────────────────────────────
const cacheKS = new Map<string, AudioBuffer>();

/** Buffer de cuerda pulsada (Karplus-Strong), cacheado por nota y brillo. */
export function bufferCuerda(ctx: AudioContext, midi: number, brillo: number, seg = 1.6): AudioBuffer {
  const clave = `${midi}|${brillo.toFixed(2)}|${seg}`;
  const hit = cacheKS.get(clave);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const frec = mtof(midi);
  const total = Math.floor(sr * seg);
  const buf = ctx.createBuffer(1, total, sr);
  const out = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / frec));
  const linea = new Float32Array(N);
  // Excitación: ruido suavizado (menos brillo = más filtrado).
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const r = Math.random() * 2 - 1;
    prev = prev + brillo * (r - prev);
    linea[i] = prev;
  }
  // Caída: notas graves duran más.
  const decay = 0.998 - Math.min(0.004, frec / 300000);
  let idx = 0;
  let ultimo = 0;
  for (let i = 0; i < total; i++) {
    const actual = linea[idx];
    const nuevo = decay * 0.5 * (actual + ultimo);
    ultimo = actual;
    linea[idx] = nuevo;
    out[i] = actual;
    idx = (idx + 1) % N;
  }
  // Normaliza y elimina DC aproximado.
  let pico = 0;
  for (let i = 0; i < total; i++) pico = Math.max(pico, Math.abs(out[i]));
  if (pico > 0) for (let i = 0; i < total; i++) out[i] /= pico;
  cacheKS.set(clave, buf);
  return buf;
}

/** Pulsa una cuerda. */
export function pulsar(
  m: Motor,
  destino: AudioNode,
  t: number,
  midi: number,
  vol: number,
  brillo = 0.6,
  dur = 1.4,
  envio = 0.25,
  pan = 0,
): void {
  const { ctx } = m;
  const src = ctx.createBufferSource();
  src.buffer = bufferCuerda(ctx, Math.round(midi), brillo);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + dur * 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(g);
  let salida: AudioNode = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    salida = p;
  }
  salida.connect(destino);
  if (envio) {
    const e = ctx.createGain();
    e.gain.value = envio;
    salida.connect(e);
    e.connect(m.reverb);
  }
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** Rasgueo: varias cuerdas escalonadas (abajo = grave→agudo). */
export function rasguear(
  m: Motor,
  destino: AudioNode,
  t: number,
  notas: number[],
  vol: number,
  abajo: boolean,
  dur = 0.6,
  brillo = 0.55,
): void {
  const orden = abajo ? notas : [...notas].reverse().slice(0, Math.max(2, notas.length - 1));
  orden.forEach((n, i) => {
    pulsar(m, destino, t + i * 0.011, n, vol * (abajo ? 1 : 0.7), brillo, dur, 0.18, (i / orden.length - 0.5) * 0.4);
  });
}

// ── Percusión ───────────────────────────────────────────────────────────────
/** Golpe grave (cajón / tambor). */
export function bombo(m: Motor, destino: AudioNode, t: number, vol: number, frec = 110, fin = 45, dur = 0.22): void {
  tono(m, destino, t, frec, dur, vol, { hasta: fin });
  ruido(m, destino, t, 0.03, vol * 0.3, { filtro: 'lowpass', frec: 900 });
}

/** Palmada / slap de cajón. */
export function slap(m: Motor, destino: AudioNode, t: number, vol: number): void {
  ruido(m, destino, t, 0.09, vol, { filtro: 'bandpass', frec: 2200, q: 0.8, envio: 0.15 });
  tono(m, destino, t, 220, 0.05, vol * 0.4, { hasta: 160 });
}

/** Zapateado sobre la tarima: golpe de madera. */
export function tarima(m: Motor, destino: AudioNode, t: number, vol: number): void {
  ruido(m, destino, t, 0.05, vol, { filtro: 'bandpass', frec: 750 + Math.random() * 150, q: 2.5, envio: 0.1 });
  tono(m, destino, t, 150, 0.06, vol * 0.6, { hasta: 90 });
}
