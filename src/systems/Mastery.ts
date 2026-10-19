import spellsData from '../data/spells.json';
import { bus } from '../core/bus';
import { GameState, type MasteryState } from '../core/GameState';
import { checkWord, spellLetters } from '../lsm';

/**
 * Dueño: lsm. Datos de conjuros (src/data/spells.json) y maestría (GDD 6.4).
 * 3 niveles: cada lanzamiento bueno suma puntos (parcial ≥ 80 % → 1, PERFECTO → 2);
 * al llegar al nivel 3 el conjuro queda DOMINADO y se lanza en automático con Q.
 */

export interface SpellDef {
  id: string;
  /** Nombre a deletrear (con acentos; el módulo los ignora). */
  name: string;
  type: string;
  title: string;
  desc: string;
  learnedFrom?: string;
  color: string;
  /** Ventana base por letra (ms), antes de la opción "ventanas largas". */
  letterWindowMs: number;
  /** Puntos necesarios para pasar del nivel 0→1, 1→2 y 2→3. */
  masteryPoints: number[];
  /** Parámetros del efecto (los aplica quien escucha 'spell:resolved'). */
  effect: Record<string, number>;
  /** Letras a deletrear (sin acentos). */
  letters: string[];
}

export const MASTERY_MAX = 3;
export const MASTERY_RULES = spellsData.masteryRules;

export const SPELLS: SpellDef[] = spellsData.spells.map((s) => ({
  ...s,
  effect: s.effect as unknown as Record<string, number>,
  letters: spellLetters(s.name),
}));

// Validación al cargar (GDD 6.6)
for (const s of SPELLS) {
  const c = checkWord(s.name);
  if (!c.ok) {
    console.warn(
      `[ECOS] Conjuro ${s.name}: letras sin cámara [${c.unsupported.join(', ')}] / más de 10 letras: ${c.tooLong}`,
    );
  }
}

export function getSpellDef(id: string): SpellDef | undefined {
  return SPELLS.find((s) => s.id === id);
}

export function getMastery(id: string): MasteryState {
  let m = GameState.mastery[id];
  if (!m) {
    m = { level: 0, progress: 0 };
    GameState.mastery[id] = m;
  }
  return m;
}

export function isMastered(id: string): boolean {
  return getMastery(id).level >= MASTERY_MAX;
}

/** Puntos que faltan para el siguiente nivel (0 si está dominado). */
export function pointsToNext(id: string): number {
  const m = getMastery(id);
  if (m.level >= MASTERY_MAX) return 0;
  const need = getSpellDef(id)?.masteryPoints[m.level] ?? 3;
  return Math.max(0, need - m.progress);
}

/** Fracción 0..1 hacia el siguiente nivel (1 si está dominado). */
export function masteryProgress(id: string): number {
  const m = getMastery(id);
  if (m.level >= MASTERY_MAX) return 1;
  const need = getSpellDef(id)?.masteryPoints[m.level] ?? 3;
  return Math.min(1, m.progress / need);
}

/**
 * Registra un lanzamiento deletreado. Devuelve true si subió de nivel.
 * Los lanzamientos automáticos (ya dominado) no se registran.
 */
export function recordCast(id: string, outcome: 'fail' | 'partial' | 'perfect', fraction: number): boolean {
  const m = getMastery(id);
  if (m.level >= MASTERY_MAX) return false;
  let pts = 0;
  if (outcome === 'perfect') pts = MASTERY_RULES.perfectPoints;
  else if (outcome === 'partial' && fraction >= MASTERY_RULES.partialMinFraction) pts = MASTERY_RULES.partialPoints;
  if (!pts) return false;
  m.progress += pts;
  let up = false;
  const def = getSpellDef(id);
  while (m.level < MASTERY_MAX) {
    const need = def?.masteryPoints[m.level] ?? 3;
    if (m.progress < need) break;
    m.progress -= need;
    m.level++;
    up = true;
  }
  if (m.level >= MASTERY_MAX) m.progress = 0;
  if (up) {
    const name = def?.title ?? id;
    bus.emit('hud:toast', {
      text: m.level >= MASTERY_MAX ? `¡${name} dominado! Ahora se lanza en automático` : `${name}: maestría ${m.level}/3`,
      ms: 2600,
    });
  }
  return up;
}
