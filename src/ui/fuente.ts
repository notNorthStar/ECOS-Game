import type Phaser from 'phaser';

/* =====================================================================================
 * Fuentes de la interfaz (dueño: interfaz).
 * Atkinson Hyperlegible (OFL 1.1) para textos largos: ver FUENTE_LECTURA más abajo.
 * Pixelify Sans (SIL Open Font License 1.1), incluida en public/assets/fuentes/ (sin CDN).
 * Tiene acentos, ñ, ¿ y ¡. Créditos en CREDITOS.md → Tipografías.
 *
 * Cualquier escena o sistema que dibuje texto debe usar FUENTE (o estiloTexto) en lugar de
 * 'monospace'. La fuente se carga en main.ts ANTES de crear el juego, así que los textos
 * de las escenas ya nacen con ella.
 * ===================================================================================== */

/** Familia CSS para Phaser.Text: la pixel y, de respaldo, monoespaciadas del sistema. */
export const FUENTE = '"Pixelify Sans", "Courier New", monospace';

/**
 * Fuente de LECTURA para textos largos (cuerpo de los diálogos, consejos de la carga…).
 * Atkinson Hyperlegible (SIL OFL 1.1, Braille Institute): sans diseñada para máxima legibilidad.
 * No es pixel art a propósito: el equipo pidió que los diálogos se lean sin esfuerzo.
 * Úsala con `estiloLectura` y `nitidez()` para que no se vea borrosa al escalar el lienzo.
 */
export const FUENTE_LECTURA = '"Atkinson Hyperlegible", "Segoe UI", Arial, sans-serif';

/** Archivos de las fuentes (relativos a index.html: Vite sirve public/ en la raíz y base es './'). */
const ARCHIVOS = [
  { familia: 'Pixelify Sans', peso: '400', estilo: 'normal', url: './assets/fuentes/pixelify-sans-400.woff2' },
  { familia: 'Pixelify Sans', peso: '700', estilo: 'normal', url: './assets/fuentes/pixelify-sans-700.woff2' },
  { familia: 'Atkinson Hyperlegible', peso: '400', estilo: 'normal', url: './assets/fuentes/atkinson-hyperlegible-400.woff2' },
  { familia: 'Atkinson Hyperlegible', peso: '700', estilo: 'normal', url: './assets/fuentes/atkinson-hyperlegible-700.woff2' },
  { familia: 'Atkinson Hyperlegible', peso: '400', estilo: 'italic', url: './assets/fuentes/atkinson-hyperlegible-400-italic.woff2' },
] as const;

/** Tamaños de la fuente de lectura (px del lienzo de 640×360). */
export const TAM_LECTURA = {
  /** Cuerpo de los diálogos. */
  dialogo: 13,
  /** Mínimo al que se encoge una línea muy larga para caber en la caja. */
  minimo: 10,
} as const;

/** Estilo de texto largo con la fuente legible (sin contorno grueso: se lee mejor limpio sobre fondo oscuro). */
export function estiloLectura(
  px: number,
  color = '#efe6d2',
  opts: { cursiva?: boolean; negrita?: boolean } = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const estilo = [opts.cursiva ? 'italic' : '', opts.negrita ? 'bold' : ''].filter(Boolean).join(' ');
  return {
    fontFamily: FUENTE_LECTURA,
    fontSize: `${Math.round(px * 2) / 2}px`,
    fontStyle: estilo || 'normal',
    color,
    padding: { top: PAD_ACENTO },
  };
}

/**
 * Factor real entre un pixel del lienzo (640×360) y un pixel físico de la pantalla
 * (escala del FIT × devicePixelRatio). Se usa como `resolution` del Text para que se dibuje nítido.
 */
export function escalaPantalla(game: Phaser.Game): number {
  const ancho = game.canvas?.getBoundingClientRect().width || game.scale.width;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const f = (ancho / game.scale.width) * dpr;
  // En cuartos para no regenerar la textura por variaciones mínimas; tope para no gastar memoria.
  return limitar(Math.ceil(f * 4) / 4, 1, 4);
}

function limitar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Hace nítido un Text: lo genera a la resolución real de la pantalla y lo muestrea con filtro lineal
 * (el juego usa pixelArt=NEAREST, que con texto suavizado se ve dentado). Devuelve la resolución aplicada.
 * Llamarla de nuevo (p. ej. en update) solo regenera si cambió el tamaño de la ventana.
 */
export function nitidez(texto: Phaser.GameObjects.Text, game: Phaser.Game): number {
  const r = escalaPantalla(game);
  if (texto.style.resolution !== r) texto.setResolution(r);
  // Filtro lineal (0 = LINEAR en Phaser.Textures.FilterMode); se conserva al actualizar el texto.
  if (texto.texture.source[0]?.scaleMode !== 0) texto.texture.setFilter(0);
  return r;
}

/**
 * Tamaños nítidos. Pixelify Sans dibuja su "pixel" en ~92 unidades de 1000, así que a 11 px
 * cada pixel de la fuente cae casi exacto en un pixel del lienzo de 640×360 (22 px = el doble).
 */
export const TAM = {
  /** Mínimo legible (avisos, notas, etiquetas del HUD). */
  chico: 11,
  /** Texto corrido y opciones. */
  normal: 11,
  /** Subtítulos. */
  medio: 13,
  /** Títulos de panel. */
  grande: 16,
  /** Carteles (nombre de zona). */
  cartel: 22,
} as const;

/**
 * Convierte un tamaño pensado para la monospace anterior al tamaño equivalente en Pixelify Sans:
 * nada baja de 11 px (por debajo la fuente se vuelve borrosa) y lo grande crece un poco
 * porque la pixel es más baja de x que la Courier.
 */
export function tamFuente(size: number): number {
  if (size <= 11) return TAM.chico;
  if (size <= 13) return TAM.medio;
  if (size <= 16) return TAM.grande;
  if (size <= 24) return TAM.cartel;
  return Math.round(size * 1.1);
}

/** Escala de texto de accesibilidad (Pausa → Opciones), sin bajar del mínimo legible. */
export function conEscala(px: number, escala = 1): number {
  return Math.max(TAM.chico, Math.round(px * (escala || 1)));
}

/** Margen superior (px) para que no se recorten los acentos de las mayúsculas. */
export const PAD_ACENTO = 2;

/** Estilo base de texto con la fuente pixel y contorno oscuro. `px` ya es el tamaño final. */
export function estiloTexto(
  px: number,
  color = '#f4ead2',
  opts: { stroke?: string | false; grosor?: number; negrita?: boolean } = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const st: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FUENTE,
    fontSize: `${Math.round(px)}px`,
    fontStyle: opts.negrita ? 'bold' : 'normal',
    color,
    // Las mayúsculas acentuadas (Á, É, Ó…) de la pixel suben más que lo que mide Phaser: sin este
    // margen superior el acento de la primera línea se recorta.
    padding: { top: PAD_ACENTO },
  };
  if (opts.stroke !== false) {
    st.stroke = opts.stroke ?? '#0a0a12';
    st.strokeThickness = opts.grosor ?? 3;
  }
  return st;
}

let cargada: Promise<void> | null = null;

/**
 * Registra y descarga la fuente (FontFace + document.fonts). Nunca lanza: si falla o tarda
 * más de `timeoutMs`, el juego arranca con la monoespaciada de respaldo.
 */
export function cargarFuente(timeoutMs = 3000): Promise<void> {
  if (cargada) return cargada;
  const trabajo = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document) || typeof FontFace === 'undefined') return;
    await Promise.all(
      ARCHIVOS.map(async ({ familia, peso, estilo, url }) => {
        try {
          const cara = new FontFace(familia, `url(${url}) format('woff2')`, { weight: peso, style: estilo });
          document.fonts.add(await cara.load());
        } catch (err) {
          // Una cara que falle no impide las demás (cada familia tiene respaldo del sistema).
          console.warn(`[ECOS] No se pudo cargar ${familia} ${peso} ${estilo}`, err);
        }
      }),
    );
    // Asegura que el lienzo 2D ya las tenga listas (incluye acentos).
    await document.fonts.load(`11px "Pixelify Sans"`, 'ÁÉÍÓÚáéíóúÑñ¿¡');
    await document.fonts.load(`12px "Atkinson Hyperlegible"`, 'ÁÉÍÓÚáéíóúÑñ¿¡');
  })().catch((err: unknown) => console.warn('[ECOS] No se pudieron cargar las fuentes; uso las del sistema', err));
  const limite = new Promise<void>((r) => setTimeout(r, timeoutMs));
  cargada = Promise.race([trabajo, limite]);
  return cargada;
}
