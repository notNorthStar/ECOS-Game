import type { WorldApi } from '../core/contracts';
import { bus, sfx } from '../core/bus';
import { GameState } from '../core/GameState';
import { ORBS } from '../config/combat';
import { isCdmx } from '../config/game';
import progression from '../data/progression.json';
import { EcoOrb } from '../entities/EcoOrb';
import { getMastery, getSpellDef } from './Mastery';

/**
 * Ecos y mejoras (GDD §5.1). Dueño: combate.
 * - 'ecos:gained' {amount, x, y} → orbes que vuelan al jugador; al tocarlo suman GameState.ecos
 *   y emiten 'ecos:changed' + sfx 'eco'. Si no hay nivel activo, se acreditan al instante.
 * - Mejoras (Vida, Daño, Velocidad, Doble salto — se desbloquea desde la CDMX) para el Altar de la Memoria.
 */

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  costs: number[];
  locked?: boolean;
  lockText?: string;
  /**
   * Condición que quita `locked`. Hoy solo 'cdmx': desbloqueada si la sección actual es de la CDMX
   * o si ya se visitó (flag CDMX_VISITADA, persiste para los niveles 7+).
   */
  unlockFrom?: 'cdmx';
  /** Texto del efecto por nivel a comprar (descs[nivelActual]); si falta, se usa `desc`. */
  descs?: string[];
  /** Solo 'proteccion': vida que cura PROTECCION según el nivel de la mejora (índice = nivel, 0..maxLevel). */
  heal?: number[];
  /** Mejora bloqueada hasta aprender este conjuro (id de spells.json). */
  requiresSpell?: string;
}

/** Flag que se pone al cargar cualquier sección de la CDMX (installProgression). */
export const CDMX_VISITADA = 'cdmx:visitada';

/** true si la mejora sigue bloqueada (locked y sin cumplir unlockFrom). */
function isLocked(def: UpgradeDef): boolean {
  if (def.requiresSpell && !GameState.learnedSpells.includes(def.requiresSpell)) return true;
  if (!def.locked) return false;
  if (def.unlockFrom === 'cdmx') return !(isCdmx(GameState.section) || GameState.flags[CDMX_VISITADA]);
  return true;
}

export const UPGRADES: UpgradeDef[] = progression.upgrades as UpgradeDef[];
export const ECOS_TABLE = progression.ecos;
export const ECOS_BONUS = progression.bonus;

/**
 * Vida que cura PROTECCION al lanzarla: la base de spells.json (effect.heal, 1) en el nivel 0 de la mejora
 * 'proteccion' del Altar, y progression.json → upgrades.proteccion.heal ([1, 2, 3]) según su nivel.
 */
export function getProteccionHeal(): number {
  const level = GameState.upgrades.proteccion ?? 0;
  const def = UPGRADES.find((u) => u.id === 'proteccion');
  const base = getSpellDef('PROTECCION')?.effect.heal ?? 1;
  return def?.heal?.[level] ?? base + level;
}

/** Suma Ecos al instante (también lo usan los orbes al llegar). */
export function addEcos(n: number): void {
  if (n <= 0) return;
  GameState.ecos += n;
  GameState.totalEcosEarned += n;
  bus.emit('ecos:changed', { total: GameState.ecos });
}

export interface UpgradeRow {
  def: UpgradeDef;
  level: number;
  maxed: boolean;
  locked: boolean;
  cost: number | null;
  affordable: boolean;
  /** Texto del siguiente efecto (o estado). */
  next: string;
}

export function upgradeRows(): UpgradeRow[] {
  return UPGRADES.map((def) => {
    const level = GameState.upgrades[def.id] ?? 0;
    const maxed = level >= def.maxLevel;
    const locked = isLocked(def);
    const cost = maxed || locked ? null : def.costs[level];
    return {
      def,
      level,
      maxed,
      locked,
      cost,
      affordable: cost !== null && GameState.ecos >= cost,
      next: locked ? (def.lockText ?? 'Bloqueado') : maxed ? 'Nivel máximo' : (def.descs?.[level] ?? def.desc),
    };
  });
}

/** Compra el siguiente nivel. Devuelve false si no se puede. */
export function buyUpgrade(id: string): boolean {
  const row = upgradeRows().find((r) => r.def.id === id);
  if (!row || row.cost === null || !row.affordable) return false;
  GameState.ecos -= row.cost;
  GameState.upgrades[id] = row.level + 1;
  if (id === 'vida') {
    GameState.maxHp += 1;
    GameState.hp = Math.min(GameState.maxHp, GameState.hp + 1);
  }
  if (id === 'doble_salto') GameState.flags.dobleSalto = true;
  // La maestría de PROTECCION es el nivel de su mejora (Mastery.getMastery la sincroniza; aquí además se avisa).
  if (id === 'proteccion') {
    getMastery('PROTECCION');
    bus.emit('hud:toast', { text: `Protección: maestría ${row.level + 1}/3`, ms: 2600 });
  }
  bus.emit('ecos:changed', { total: GameState.ecos });
  bus.emit('upgrade:bought', { id, level: row.level + 1 });
  sfx('mejora');
  return true;
}

/* ------------------------------ Orbes ------------------------------ */

interface OrbSystem {
  world: WorldApi;
  orbs: EcoOrb[];
}
let active: OrbSystem | null = null;
let globalListener = false;

function spawnOrbs(sys: OrbSystem, amount: number, x: number, y: number): void {
  const n = Math.max(1, Math.min(ORBS.maxPerBurst, amount));
  const base = Math.floor(amount / n);
  let rest = amount - base * n;
  for (let i = 0; i < n; i++) {
    const v = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
    if (v > 0) sys.orbs.push(new EcoOrb(sys.world, x, y, v));
  }
}

/** Llamado por installCombat. Un solo oyente global; el sistema activo cambia con cada LevelScene. */
export function installProgression(world: WorldApi): void {
  if (!globalListener) {
    globalListener = true;
    bus.on('ecos:gained', ({ amount, x, y }) => {
      const a = Math.round(amount);
      if (a <= 0) return;
      if (active && active.world.scene.sys.isActive()) spawnOrbs(active, a, x, y);
      else addEcos(a);
    });
  }
  // Doble salto (unlockFrom 'cdmx'): recordar que ya se llegó a la CDMX.
  if (isCdmx(world.level.id)) GameState.flags[CDMX_VISITADA] = true;
  const sys: OrbSystem = { world, orbs: [] };
  active = sys;
  let pickupSfxT = 0;
  const onUpdate = (_t: number, deltaMs: number) => {
    const dt = Math.min(0.05, deltaMs / 1000) * world.timeScale;
    pickupSfxT -= deltaMs / 1000;
    for (let i = sys.orbs.length - 1; i >= 0; i--) {
      const o = sys.orbs[i];
      if (o.update(dt)) {
        addEcos(o.value);
        if (pickupSfxT <= 0) {
          sfx('eco');
          pickupSfxT = 0.05;
        }
      }
      if (o.done) sys.orbs.splice(i, 1);
    }
  };
  const scene = world.scene;
  scene.events.on('update', onUpdate);
  const cleanup = () => {
    scene.events.off('update', onUpdate);
    // Lo que estaba en vuelo se acredita: los Ecos nunca se pierden.
    for (const o of sys.orbs) if (!o.done) addEcos(o.value);
    sys.orbs = [];
    if (active === sys) active = null;
  };
  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);
}
