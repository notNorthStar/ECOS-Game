import type Phaser from 'phaser';

/* =====================================================================================
 * Fuente de la interfaz (dueño: interfaz).
 * Pixelify Sans (SIL Open Font License 1.1), incluida en public/assets/fuentes/ (sin CDN).
 * Tiene acentos, ñ, ¿ y ¡. Créditos en CREDITOS.md → Tipografías.
 *
 * Cualquier escena o sistema que dibuje texto debe usar FUENTE (o estiloTexto) en lugar de
 * 'monospace'. La fuente se carga en main.ts ANTES de crear el juego, así que los textos
 * de las escenas ya nacen con ella.
 * ===================================================================================== */

/** Familia CSS para Phaser.Text: la pixel y, de respaldo, monoespaciadas del sistema. */
export const FUENTE = '"Pixelify Sans", "Courier New", monospace';

/** Archivos de la fuente (relativos a index.html: Vite sirve public/ en la raíz y base es './'). */
const ARCHIVOS = [
  { peso: '400', url: './assets/fuentes/pixelify-sans-400.woff2' },
  { peso: '700', url: './assets/fuentes/pixelify-sans-700.woff2' },
] as const;

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
      ARCHIVOS.map(async ({ peso, url }) => {
        const cara = new FontFace('Pixelify Sans', `url(${url}) format('woff2')`, { weight: peso, style: 'normal' });
        document.fonts.add(await cara.load());
      }),
    );
    // Asegura que el lienzo 2D ya la tenga lista (incluye acentos).
    await document.fonts.load(`11px "Pixelify Sans"`, 'ÁÉÍÓÚáéíóúÑñ¿¡');
  })().catch((err: unknown) => console.warn('[ECOS] No se pudo cargar la fuente pixel; uso monospace', err));
  const limite = new Promise<void>((r) => setTimeout(r, timeoutMs));
  cargada = Promise.race([trabajo, limite]);
  return cargada;
}
