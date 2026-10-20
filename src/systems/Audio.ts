import type Phaser from 'phaser';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { obtenerMotor, type Motor } from './audio/motor';
import { ALIAS, EFECTOS, MAX_VOCES, reiniciarLetras } from './audio/efectos';
import { Musica, PISTAS, type ArchivoMusica } from './audio/musica';
import { MAPA_MUSICA } from './audio/config';
import { setFormaBruja } from './audio/oaxaca';
import { conectarEventosN07 } from './audio/cdmx2';
import { conectarEventosN10 } from './audio/gdl';

/**
 * Sistema de audio de ECOS (WebAudio puro, sin el SoundManager de Phaser).
 *
 * - Efectos: `bus.emit('sfx', { name })` o `sfx(name)`. Si existe
 *   `public/assets/audio/sfx/sfx_<name>.ogg` se usa el archivo; si no, se sintetiza.
 * - Música: `bus.emit('music', { track })` con 'n10_avenida' | 'n10_catedral' | 'n10_tzitzimime' | 'n10_itzpapalotl' | 'n10_epilogo' | 'n07_teleferico' | 'n07_torre' | 'n07_salon' | 'n07_jefe' | 'n07_llorona' | 'n06_xochimilco' | 'n06_avenidas' | 'n06_reforma' | 'n06_combate' | 'n06_jefe' | 'n04_ciudad' | 'n04_combate' | 'n04_templo' | 'n04_jefe' | 'n01_taller' | 'n01_exploracion' | 'n01_combate' |
 *   'n01_jefe' | 'n02_fandango' | 'n03_pueblo' | 'n03_lago' | 'n03_altar' | 'n03_jefe' | 'titulo'
 *   (o null para silencio). Si existe `musica_<track>.ogg` (o .mp3) se usa en bucle; si no, el archivo
 *   del equipo indicado en `audio/config.ts` (MAPA_MUSICA); si tampoco, se genera de forma procedural. El fandango usa siempre capas procedurales
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
let intensidadOlmeca = 0;
let escudoPrevio = { active: false, broken: false };
let lunaPrevia = false;

const archivosSfx = new Map<string, AudioBuffer | null>();
const archivosMusica = new Map<string, ArchivoMusica | null>();
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
  return p.replace(/^musica_/, '').replace(/\.(ogg|mp3)$/, '');
}

function normalizarSfx(n: string): string {
  const limpio = n.replace(/^sfx_/, '').replace(/\.(ogg|mp3)$/, '');
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

/** Busca primero `musica_<n>.ogg/.mp3` y luego el archivo del equipo configurado en MAPA_MUSICA. */
async function cargarMusica(m: Motor, n: string): Promise<ArchivoMusica | null> {
  const dir = `${BASE}musica/`;
  const propio = (await cargar(m, `${dir}musica_${n}.ogg`)) ?? (await cargar(m, `${dir}musica_${n}.mp3`));
  if (propio) return { intro: null, bucle: propio };
  const cfg = MAPA_MUSICA[n];
  if (!cfg) return null;
  const bucle = await cargar(m, dir + encodeURIComponent(cfg.bucle));
  if (!bucle) return null;
  const intro = cfg.intro ? await cargar(m, dir + encodeURIComponent(cfg.intro)) : null;
  return { intro, bucle, volumen: cfg.volumen };
}

function precargarArchivos(m: Motor): void {
  for (const n of NOMBRES_SFX) {
    void cargar(m, `${BASE}sfx/sfx_${n}.ogg`)
      .then((b) => b ?? cargar(m, `${BASE}sfx/sfx_${n}.mp3`))
      .then((b) => archivosSfx.set(n, b));
  }
  for (const n of new Set([...NOMBRES_MUSICA, ...Object.keys(MAPA_MUSICA)])) {
    if (n === 'n02_fandango') continue;
    void cargarMusica(m, n).then((b) => archivosMusica.set(n, b));
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
    const pista = normalizarPista(track);
    musica?.reproducir(pista);
    if (pista === 'n03_jefe') musica?.setIntensidad(intensidadOlmeca);
    if (pista !== 'n04_jefe') setFormaBruja('humana');
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
  bus.on('spell:resolved', ({ outcome, spellId }) => {
    reproducirSfx(outcome === 'perfect' ? 'perfecto' : outcome === 'partial' ? 'conjuro_ok' : 'conjuro_fallo');
    if (outcome !== 'fail') {
      if (spellId === 'VERDAD') reproducirSfx('verdad');
      else if (spellId === 'FUEGO') reproducirSfx('fuego');
      else if (spellId === 'DESCANSO') reproducirSfx('descanso');
      else if (spellId === 'MEMORIA') reproducirSfx('memoria');
      else if (spellId === 'LUZ') reproducirSfx('luz');
      else if (spellId === 'SOL') reproducirSfx('sol');
    }
    reiniciarLetras();
  });
  bus.on('spell:learned', () => reproducirSfx('aprender'));

  // Enemigos y jefe.
  bus.on('enemy:hit', () => reproducirSfx('impacto'));
  bus.on('enemy:purified', () => reproducirSfx('purificar'));
  bus.on('boss:phase', ({ phase }) => {
    // En el Nivel 3 la intensidad la gobierna 'olmeca:phase'.
    if (musica?.actual?.startsWith('n03_')) return;
    // Nivel 4: la fase 1/2/3 de la Bruja sube la intensidad de n04_jefe (sin rugido de Chaneque).
    // Nivel 6: la fase 1/2/3 de la Nahuala sube la intensidad de n06_jefe.
    // Nivel 7: la fase 1/2/3 del Rey del Olvido sube la intensidad de n07_jefe.
    // Nivel 10: la fase 1/2/3 de Itzpapálotl (y de las Tzitzimime) sube la intensidad de n10_*.
    if (musica?.actual?.startsWith('n10_') || musica?.actual?.startsWith('n07_') || musica?.actual?.startsWith('n06_')) {
      musica.setIntensidad(phase === 1 ? 0 : phase === 2 ? 0.55 : 1);
      return;
    }
    if (musica?.actual?.startsWith('n04_')) {
      musica.setIntensidad(phase === 1 ? 0 : phase === 2 ? 0.55 : 1);
      return;
    }
    if (phase === 2) {
      musica?.setIntensidad(1);
      reproducirSfx('jefe_rugido');
    } else {
      musica?.setIntensidad(0);
    }
  });
  bus.on('boss:calmed', () => {
    intensidadOlmeca = 0;
    musica?.setIntensidad(0);
  });

  // Nivel 3: escudo, Luna, Balam, Cofradía y Cabeza Olmeca.
  bus.on('shield:state', ({ active, broken }) => {
    if (broken && !escudoPrevio.broken) reproducirSfx('escudo_roto');
    else if (active && !escudoPrevio.active) reproducirSfx('escudo_on');
    else if (!active && escudoPrevio.active && !broken) reproducirSfx('escudo_off');
    escudoPrevio = { active, broken };
  });
  bus.on('shield:block', () => reproducirSfx('escudo_golpe'));
  bus.on('luna:state', ({ active }) => {
    if (active === lunaPrevia) return;
    lunaPrevia = active;
    reproducirSfx(active ? 'luna_on' : 'luna_off');
    musica?.setLuna(active);
  });
  bus.on('balam:awake', () => reproducirSfx('balam_maullido'));
  bus.on('cofradia:down', () => reproducirSfx('encapuchado_cae'));
  bus.on('olmeca:phase', ({ phase }) => {
    intensidadOlmeca = phase === 1 ? 0 : phase === 2 ? 0.55 : 1;
    if (musica?.actual === 'n03_jefe') musica.setIntensidad(intensidadOlmeca);
    if (phase > 1) reproducirSfx('olmeca_rugido');
  });
  bus.on('antenna:destroyed', () => reproducirSfx('antena_rota'));

  // Nivel 4: María, pasajes y Bruja Guajolote.
  bus.on('maria:assist', () => reproducirSfx('maria_lamento'));
  bus.on('pasaje:revealed', () => reproducirSfx('pasaje_abre'));
  bus.on('bruja:form', ({ form }) => {
    reproducirSfx('bruja_transformar');
    setFormaBruja(form);
  });

  // Nivel 6: nahuales infiltrados y la Nahuala.
  bus.on('nahual:reveal', () => reproducirSfx('nahual_transformar'));
  bus.on('nahual:revealed', () => reproducirSfx('nahual_transformar'));
  bus.on('nahual:fled', () => reproducirSfx('nahual_huir'));
  bus.on('nahuala:illusion', () => reproducirSfx('nahuala_ilusion'));

  // Nivel 7: Llorona, corona del Rey, inversión de controles, María y cabina.
  conectarEventosN07(reproducirSfx);

  // Nivel 10: cadenas de luz, Balam jaguar, la madre, Itzpapálotl y el eclipse.
  conectarEventosN10(reproducirSfx);

  // Progresión.
  bus.on('ecos:changed', () => reproducirSfx('eco'));
  bus.on('upgrade:bought', () => reproducirSfx('mejora'));

  // Arenas: combate y regreso a la música de la sección.
  bus.on('arena:start', () => {
    if (!musica) return;
    const actual = musica.actual;
    // Nivel 7: sin música de combate aparte (cada sección ya es tensa); no cambia.
    if (actual?.startsWith('n07_')) return;
    // Nivel 10: cada pista ya es de combate o de tensión; no cambia.
    if (actual?.startsWith('n10_')) return;
    // Nivel 6: las calles ceden a n06_combate; el jefe no cambia.
    if (actual?.startsWith('n06_')) {
      if (actual === 'n06_xochimilco' || actual === 'n06_avenidas' || actual === 'n06_reforma') {
        musicaPrevia = actual;
        musica.reproducir('n06_combate');
      }
      return;
    }
    // Nivel 4: solo la ciudad cede a n04_combate; el templo y el jefe no cambian.
    if (actual?.startsWith('n04_')) {
      if (actual === 'n04_ciudad') {
        musicaPrevia = actual;
        musica.reproducir('n04_combate');
      }
      return;
    }
    if (actual === 'n01_jefe' || actual === 'n01_combate' || actual === 'n02_fandango' || actual === 'n03_jefe' || actual === 'n03_altar') return;
    musicaPrevia = actual;
    musica.reproducir('n01_combate');
  });
  bus.on('arena:clear', () => {
    if (musica?.actual === 'n06_combate') {
      musica.reproducir(musicaPrevia ?? 'n06_avenidas');
      musicaPrevia = null;
      return;
    }
    if (musica?.actual === 'n04_combate') {
      musica.reproducir(musicaPrevia ?? 'n04_ciudad');
      musicaPrevia = null;
      return;
    }
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
