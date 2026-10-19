import type Phaser from 'phaser';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { obtenerMotor, type Motor } from './audio/motor';
import { ALIAS, EFECTOS, MAX_VOCES, reiniciarLetras } from './audio/efectos';
import { Musica, PISTAS } from './audio/musica';

/**
 * Sistema de audio de ECOS (WebAudio puro, sin el SoundManager de Phaser).
 *
 * - Efectos: `bus.emit('sfx', { name })` o `sfx(name)`. Si existe
 *   `public/assets/audio/sfx/sfx_<name>.ogg` se usa el archivo; si no, se sintetiza.
 * - Música: `bus.emit('music', { track })` con 'n01_taller' | 'n01_exploracion' | 'n01_combate' |
 *   'n01_jefe' | 'n02_fandango' | 'titulo' (o null para silencio). Si existe `musica_<track>.ogg` se usa en bucle;
 *   si no, se genera de forma procedural. El fandango usa siempre capas procedurales
 *   para reflejar las estrofas recuperadas (hasta disponer de stems del equipo).
 * - Además reacciona sola a los eventos del jugador, conjuros, enemigos, arenas y pausa.
 * - Lee GameState.settings.musicVolume / sfxVolume en cada tick (~25 ms).
 */

const NOMBRES_SFX = Object.keys(EFECTOS);
const NOMBRES_MUSICA = Object.keys(PISTAS);
const BASE = `${import.meta.env.BASE_URL}assets/audio/`;

const TICK_MS = 25;
const DEDUP_S = 0.03;
/** Separación mínima entre repeticiones de un mismo efecto (s). */
const MIN_INTERVALO: Record<string, number> = { paso: 0.09, eco: 0.06, ui_mover: 0.04, impacto: 0.04 };
const ATENUACION_PAUSA = 0.3;

let instalado = false;
let motor: Motor | null = null;
let musica: Musica | null = null;
let pausado = false;
let ultimoVolMusica = -1;
let ultimoVolSfx = -1;
let musicaPrevia: string | null = null;

const archivosSfx = new Map<string, AudioBuffer | null>();
const archivosMusica = new Map<string, AudioBuffer | null>();
const vocesActivas = new Map<string, number>();
const ultimoDisparo = new Map<string, number>();
const avisados = new Set<string>();

// ── API pública ───────────────────────────────────────────────────────────────

export function setMusicVolume(v: number): void {
  GameState.settings.musicVolume = Math.max(0, Math.min(1, v));
  aplicarVolumenes(true);
}

export function setSfxVolume(v: number): void {
  GameState.settings.sfxVolume = Math.max(0, Math.min(1, v));
  aplicarVolumenes(true);
}

/** Reanuda el AudioContext (llamar desde un gesto del usuario; también se hace solo). */
export function unlockAudio(): void {
  if (!motor) return;
  if (motor.ctx.state === 'suspended') void motor.ctx.resume().catch(() => undefined);
}

/** Reproduce un efecto por nombre (equivale a bus.emit('sfx', { name })). */
export function playSfx(nombre: string): void {
  reproducirSfx(nombre);
}

/** Cambia la música (equivale a bus.emit('music', { track })). */
export function playMusic(pista: string | null): void {
  musica?.reproducir(normalizarPista(pista));
}

export function installAudio(game: Phaser.Game): void {
  void game;
  if (instalado) return;
  instalado = true;
  motor = obtenerMotor();
  if (!motor) {
    console.warn('[Audio] WebAudio no disponible: el juego seguirá sin sonido.');
    return;
  }
  const m = motor;
  musica = new Musica(m, (n) => archivosMusica.get(n) ?? null);

  // Desbloqueo en el primer gesto (y en los siguientes, por si el navegador vuelve a suspender).
  const desbloquear = () => unlockAudio();
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown'] as const) {
    window.addEventListener(ev, desbloquear, { capture: true, passive: true });
  }
  // Pestaña oculta → suspender; visible → reanudar.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void m.ctx.suspend().catch(() => undefined);
    else unlockAudio();
  });

  precargarArchivos(m);
  conectarBus();

  aplicarVolumenes(true);
  window.setInterval(() => {
    aplicarVolumenes(false);
    if (m.ctx.state === 'running') musica?.tick();
  }, TICK_MS);
}

// ── Internos ──────────────────────────────────────────────────────────────────

function aplicarVolumenes(forzar: boolean): void {
  if (!motor) return;
  const s = GameState.settings;
  const vm = Math.max(0, Math.min(1, s.musicVolume)) * (pausado ? ATENUACION_PAUSA : 1);
  const vs = Math.max(0, Math.min(1, s.sfxVolume));
  const t = motor.ctx.currentTime;
  if (forzar || Math.abs(vm - ultimoVolMusica) > 0.001) {
    motor.busMusica.gain.setTargetAtTime(vm * vm, t, 0.08); // curva cuadrática: más natural al oído
    ultimoVolMusica = vm;
  }
  if (forzar || Math.abs(vs - ultimoVolSfx) > 0.001) {
    motor.busSfx.gain.setTargetAtTime(vs * vs, t, 0.03);
    ultimoVolSfx = vs;
  }
}

function normalizarPista(p: string | null): string | null {
  if (!p) return null;
  return p.replace(/^musica_/, '').replace(/\.ogg$/, '');
}

function normalizarSfx(n: string): string {
  const limpio = n.replace(/^sfx_/, '').replace(/\.ogg$/, '');
  return ALIAS[limpio] ?? limpio;
}

async function cargar(m: Motor, url: string): Promise<AudioBuffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    // El servidor de Vite devuelve index.html para rutas inexistentes.
    if ((r.headers.get('content-type') ?? '').includes('text/html')) return null;
    const datos = await r.arrayBuffer();
    if (datos.byteLength < 64) return null;
    return await m.ctx.decodeAudioData(datos);
  } catch {
    return null;
  }
}

function precargarArchivos(m: Motor): void {
  for (const n of NOMBRES_SFX) {
    void cargar(m, `${BASE}sfx/sfx_${n}.ogg`).then((b) => archivosSfx.set(n, b));
  }
  for (const n of NOMBRES_MUSICA) {
    if (n === 'n02_fandango') continue;
    void cargar(m, `${BASE}musica/musica_${n}.ogg`).then((b) => archivosMusica.set(n, b));
  }
}

function reproducirSfx(nombreCrudo: string): void {
  const m = motor;
  if (!m || m.ctx.state !== 'running') return;
  if (GameState.settings.sfxVolume <= 0) return;
  const nombre = normalizarSfx(nombreCrudo);
  const archivo = archivosSfx.get(nombre) ?? null;
  const sint = EFECTOS[nombre];
  if (!archivo && !sint) {
    if (!avisados.has(nombre)) {
      avisados.add(nombre);
      console.warn(`[Audio] efecto desconocido: ${nombre}`);
    }
    return;
  }
  const ahora = m.ctx.currentTime;
  // Anti-duplicado (dos sistemas pidiendo el mismo sonido en el mismo cuadro) y separación mínima.
  const previo = ultimoDisparo.get(nombre) ?? -1;
  if (ahora - previo < (MIN_INTERVALO[nombre] ?? DEDUP_S)) return;
  // Límite de voces simultáneas.
  const activas = vocesActivas.get(nombre) ?? 0;
  if (activas >= (MAX_VOCES[nombre] ?? 4)) return;
  ultimoDisparo.set(nombre, ahora);

  const t = ahora + 0.005;
  let dur: number;
  if (archivo) {
    const src = m.ctx.createBufferSource();
    src.buffer = archivo;
    src.playbackRate.value = nombre === 'paso' || nombre.startsWith('disparo') ? 0.95 + Math.random() * 0.1 : 1;
    src.connect(m.busSfx);
    src.start(t);
    dur = archivo.duration / src.playbackRate.value;
  } else {
    dur = sint(m, m.busSfx, t);
  }
  vocesActivas.set(nombre, activas + 1);
  window.setTimeout(() => vocesActivas.set(nombre, Math.max(0, (vocesActivas.get(nombre) ?? 1) - 1)), dur * 1000 + 30);
}

function conectarBus(): void {
  // Explícitos.
  bus.on('sfx', ({ name }) => reproducirSfx(name));
  bus.on('music', ({ track }) => {
    musicaPrevia = null;
    musica?.reproducir(normalizarPista(track));
  });
  bus.on('fandango:progress', ({ recovered, total }) => musica?.setProgresoFandango(recovered, total));

  // Jugador.
  bus.on('player:jump', () => reproducirSfx('salto'));
  bus.on('player:land', () => reproducirSfx('aterrizar'));
  bus.on('player:dodge', () => reproducirSfx('esquivar'));
  bus.on('player:step', () => reproducirSfx('paso'));
  bus.on('player:hurt', () => reproducirSfx('dano'));
  bus.on('player:died', () => reproducirSfx('muerte'));
  bus.on('player:shot', ({ mode }) => reproducirSfx(mode === 'red' ? 'disparo_rojo' : 'disparo_verde'));

  // Conjuros.
  bus.on('spell:begin', () => reiniciarLetras());
  bus.on('spell:letter', ({ ok }) => reproducirSfx(ok ? 'letra_ok' : 'letra_fallo'));
  bus.on('spell:resolved', ({ outcome }) => {
    reproducirSfx(outcome === 'perfect' ? 'perfecto' : outcome === 'partial' ? 'conjuro_ok' : 'conjuro_fallo');
    reiniciarLetras();
  });
  bus.on('spell:learned', () => reproducirSfx('aprender'));

  // Enemigos y jefe.
  bus.on('enemy:hit', () => reproducirSfx('impacto'));
  bus.on('enemy:purified', () => reproducirSfx('purificar'));
  bus.on('boss:phase', ({ phase }) => {
    if (phase === 2) {
      musica?.setIntensidad(1);
      reproducirSfx('jefe_rugido');
    } else {
      musica?.setIntensidad(0);
    }
  });
  bus.on('boss:calmed', () => musica?.setIntensidad(0));
  bus.on('antenna:destroyed', () => reproducirSfx('antena_rota'));

  // Progresión.
  bus.on('ecos:changed', () => reproducirSfx('eco'));
  bus.on('upgrade:bought', () => reproducirSfx('mejora'));

  // Arenas: combate y regreso a la música de la sección.
  bus.on('arena:start', () => {
    if (!musica) return;
    const actual = musica.actual;
    if (actual === 'n01_jefe' || actual === 'n01_combate' || actual === 'n02_fandango') return;
    musicaPrevia = actual;
    musica.reproducir('n01_combate');
  });
  bus.on('arena:clear', () => {
    if (!musica || musica.actual !== 'n01_combate') return;
    musica.reproducir(musicaPrevia ?? 'n01_exploracion');
    musicaPrevia = null;
  });

  // Pausa: baja la música (se aplica en el siguiente tick).
  bus.on('game:pause', ({ paused }) => {
    pausado = paused;
    aplicarVolumenes(true);
  });
}
