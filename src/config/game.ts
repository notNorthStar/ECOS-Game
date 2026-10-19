// Configuración global del juego. Los valores de cada sistema viven en su propio archivo:
// movement.ts (mundo/jugador), combat.ts (láser, enemigos), data/progression.json, data/spells.json.

export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

/** Tolerancia de profundidad |Δy| para que un golpe o disparo conecte (AGENTS.md §3). */
export const DEPTH_TOLERANCE = 10;

/** Capa de profundidad (setDepth) reservada para elementos que no se ordenan por y. */
export const DEPTH = {
  background: -1000, // capas de parallax 0..3 usan -1000 + i
  ground: -500,
  shadow: -100, // sombras: siempre debajo de los actores (se suma y * 0.0001 si hace falta)
  foreground: 5000, // primer plano (capa 5 y props con foreground: true)
  fx: 6000, // niebla de pantalla, viñeta
  ui: 9000,
} as const;

/** Ralentización del mundo (GDD 6.2 / 6.1). */
export const SLOWMO = {
  wheel: 0.25, // rueda de conjuros abierta
  spell: 0.2, // deletreando un conjuro
  learn: 0.05, // primera vez que se aprende un conjuro
} as const;

/** Secciones disponibles (NIVELES_ECOS.md §4). */
export const SECTIONS = ['taller', 'calles', 'parque', 'jefe', 'tuxtla', 'catemaco', 'campamento', 'altar_olmeca'] as const;

/** Secciones del Nivel 3 (Catemaco), en orden. */
export const CATEMACO_SECTIONS = ['catemaco', 'campamento', 'altar_olmeca'] as const;
export const isCatemaco = (id: string): boolean => (CATEMACO_SECTIONS as readonly string[]).includes(id);

/** Factores de parallax por capa (AGENTS.md §8). La capa 4 es el suelo (1.0); la 5, primer plano. */
export const PARALLAX_FACTORS = [0.04, 0.15, 0.4, 0.65, 1, 1.25] as const;

/** Ancho de una capa de parallax: pantalla + (nivel − pantalla) × factor. */
export function layerWidth(levelWidth: number, factor: number): number {
  return Math.ceil(GAME_WIDTH + (levelWidth - GAME_WIDTH) * factor);
}
