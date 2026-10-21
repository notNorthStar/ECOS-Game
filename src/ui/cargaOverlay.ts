import type Phaser from 'phaser';
import { FUENTE, FUENTE_LECTURA } from './fuente';

/* =====================================================================================
 * Capa HTML de la pantalla de carga (dueño: interfaz). La usa CargaScene.
 *
 * El lienzo del juego es de 640×360 escalado con pixelArt, así que una ilustración dibujada ahí
 * pierde casi toda su resolución. Esta capa pone un <img> con el original en alta calidad
 * (public/assets/ui/carga/hd/) EXACTAMENTE encima del canvas, más una franja inferior discreta
 * con el destino, el consejo y el aviso para continuar. No tiene oscurecidos ni filtros sobre la imagen.
 *
 * - `pointer-events: none`: los clics y el teclado siguen llegando a Phaser (E / Espacio / clic).
 * - Sigue la posición y el tamaño del canvas (pantalla completa, cambio de ventana).
 * - Solo puede existir una a la vez; se quita al cerrar la escena y, por seguridad, sola si la
 *   escena dueña deja de estar activa (vuelta al título, reinicio…).
 * ===================================================================================== */

export interface DatosCarga {
  /** URL de la imagen en alta calidad. */
  src: string;
  lugar: string;
  nivel: string;
  consejo: string;
  /** Escala de texto de accesibilidad (Pausa → Opciones). */
  escalaTexto: number;
  /** Duración del fundido de entrada (ms). */
  fundidoMs: number;
  /** Se llama si la imagen HD no carga (la escena dibuja entonces su respaldo de 640×360). */
  alFallar?: () => void;
}

export interface CapaCarga {
  /** Progreso del avance automático (0..1) y opacidad del aviso (0..1). Llamar cada cuadro. */
  actualizar(progreso: number, alfaAviso: number): void;
  /** Fundido de salida (no quita la capa; para eso `quitar`). */
  fundirSalida(ms: number): void;
  /** Quita la capa del DOM. Seguro de llamar varias veces. */
  quitar(): void;
}

/** Diferencia de proporción con 16:9 hasta la que la imagen llena la pantalla (cover); más allá, se ve completa (contain). */
const TOLERANCIA_COVER = 0.16;
const ID = 'ecos-carga';

let activa: CapaCarga | null = null;

const CSS = `
#${ID}{position:fixed;z-index:20;pointer-events:none;overflow:hidden;background:#000;opacity:0;
  transition:opacity var(--fundido,350ms) ease;user-select:none;-webkit-user-select:none}
#${ID}.visible{opacity:1}
#${ID} img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;
  image-rendering:auto;display:block}
#${ID} .franja{position:absolute;left:0;right:0;bottom:0;background:rgba(7,6,13,.82);
  border-top:calc(var(--u)*1px) solid rgba(242,200,107,.35);
  padding:calc(var(--u)*7px) calc(var(--u)*16px) calc(var(--u)*9px);box-sizing:border-box;
  display:grid;grid-template-columns:1fr auto;column-gap:calc(var(--u)*14px);align-items:end}
#${ID} .rumbo{grid-column:1/3;font-family:${FUENTE};color:#8ff7e1;font-size:calc(var(--u)*10px);
  letter-spacing:.12em;margin-bottom:calc(var(--u)*3px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${ID} .rumbo b{font-weight:400;color:#fff2c8;font-size:calc(var(--u)*15px);letter-spacing:.02em;margin:0 .35em}
#${ID} .rumbo span{color:#c8d8c0;letter-spacing:.02em}
#${ID} .consejo{font-family:${FUENTE_LECTURA};color:#efe6d2;font-size:calc(var(--u)*var(--t)*12px);
  line-height:1.3;margin:0}
#${ID} .consejo em{font-style:normal;font-family:${FUENTE};color:#f2c86b;letter-spacing:.1em;
  font-size:calc(var(--u)*10px);margin-right:.6em}
#${ID} .aviso{font-family:${FUENTE};color:#a9a8bd;font-size:calc(var(--u)*10px);white-space:nowrap}
#${ID} .barra{position:absolute;left:0;bottom:0;height:calc(var(--u)*2px);width:0;background:rgba(60,196,184,.85)}
`;

function asegurarEstilos(): void {
  if (document.getElementById(`${ID}-css`)) return;
  const st = document.createElement('style');
  st.id = `${ID}-css`;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/** Crea la capa sobre el canvas del juego. `escena` es la dueña: si deja de estar activa, la capa se va sola. */
export function mostrarCapaCarga(escena: Phaser.Scene, datos: DatosCarga): CapaCarga | null {
  if (typeof document === 'undefined') return null;
  activa?.quitar();
  asegurarEstilos();

  const game = escena.game;
  const raiz = document.createElement('div');
  raiz.id = ID;
  raiz.setAttribute('aria-hidden', 'true');
  raiz.style.setProperty('--fundido', `${datos.fundidoMs}ms`);
  raiz.style.setProperty('--t', String(Math.max(1, datos.escalaTexto || 1)));

  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;

  const franja = document.createElement('div');
  franja.className = 'franja';
  const rumbo = document.createElement('div');
  rumbo.className = 'rumbo';
  rumbo.append('RUMBO A');
  const lugar = document.createElement('b');
  lugar.textContent = datos.lugar;
  rumbo.append(lugar);
  if (datos.nivel) {
    const nivel = document.createElement('span');
    nivel.textContent = datos.nivel;
    rumbo.append(nivel);
  }
  const consejo = document.createElement('p');
  consejo.className = 'consejo';
  const etiqueta = document.createElement('em');
  etiqueta.textContent = 'CONSEJO';
  consejo.append(etiqueta, datos.consejo);
  const aviso = document.createElement('div');
  aviso.className = 'aviso';
  aviso.textContent = 'E / Espacio para continuar';
  franja.append(rumbo, consejo, aviso);
  const barra = document.createElement('div');
  barra.className = 'barra';

  raiz.append(img, franja, barra);
  document.body.appendChild(raiz);

  /** Coloca la capa exactamente sobre el canvas y fija la unidad (--u = px de pantalla por px del lienzo). */
  let ultimo = '';
  const colocar = () => {
    const r = game.canvas.getBoundingClientRect();
    const clave = `${r.left},${r.top},${r.width},${r.height}`;
    if (clave === ultimo) return;
    ultimo = clave;
    raiz.style.left = `${r.left}px`;
    raiz.style.top = `${r.top}px`;
    raiz.style.width = `${r.width}px`;
    raiz.style.height = `${r.height}px`;
    raiz.style.setProperty('--u', String(r.width / game.scale.width));
  };
  colocar();
  window.addEventListener('resize', colocar);
  document.addEventListener('fullscreenchange', colocar);

  let mostrada = false;
  const mostrar = () => {
    if (mostrada || !raiz.isConnected) return;
    mostrada = true;
    // Un cuadro después para que la transición de opacidad arranque.
    requestAnimationFrame(() => raiz.classList.add('visible'));
  };
  img.onload = () => {
    // Si la proporción se aleja mucho de 16:9, se ve completa (con franjas negras) en lugar de recortarla.
    const prop = img.naturalWidth / Math.max(1, img.naturalHeight);
    const dif = Math.abs(prop / (16 / 9) - 1);
    img.style.objectFit = dif <= TOLERANCIA_COVER ? 'cover' : 'contain';
    mostrar();
  };
  img.onerror = () => {
    // Sin imagen HD: la capa se vuelve transparente para dejar ver el respaldo que dibuja la escena.
    img.remove();
    raiz.style.background = 'transparent';
    datos.alFallar?.();
    mostrar();
  };
  img.src = datos.src;
  // Si la imagen tarda (disco lento), los textos aparecen igual.
  const espera = window.setTimeout(mostrar, 600);

  // Vigilante: si la escena dueña ya no corre (se detuvo, volvió al título…), la capa se va.
  const vigilante = window.setInterval(() => {
    const sys = escena.sys;
    if (!sys || !(sys.isActive() || sys.isPaused() || sys.isSleeping())) capa.quitar();
  }, 250);

  let quitada = false;
  const capa: CapaCarga = {
    actualizar(progreso, alfaAviso) {
      if (quitada) return;
      colocar();
      barra.style.width = `${Math.round(Math.min(1, Math.max(0, progreso)) * 1000) / 10}%`;
      aviso.style.opacity = String(alfaAviso);
    },
    fundirSalida(ms) {
      if (quitada) return;
      raiz.style.setProperty('--fundido', `${ms}ms`);
      raiz.classList.remove('visible');
    },
    quitar() {
      if (quitada) return;
      quitada = true;
      window.clearTimeout(espera);
      window.clearInterval(vigilante);
      window.removeEventListener('resize', colocar);
      document.removeEventListener('fullscreenchange', colocar);
      img.onload = null;
      img.onerror = null;
      raiz.remove();
      if (activa === capa) activa = null;
    },
  };
  activa = capa;
  return capa;
}

/** Quita cualquier capa de carga que siga en pantalla (por si una escena se cierra de forma abrupta). */
export function quitarCapaCarga(): void {
  activa?.quitar();
}
