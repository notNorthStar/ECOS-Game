import Phaser from 'phaser';
import type { WorldApi } from '../core/contracts';
import { FX_DEPTH_BIAS } from '../config/combat';
import { burst, fxN, reduceFx } from './EnemyBase';

/**
 * Inmovilización breve del jugador (versión extendida): las VENDAS de la momia y las RAÍCES del Vampiro.
 * No toca GameState.bound (eso es de las ataduras de luz del Nivel 10 y del GdlDirector): solo ancla al
 * jugador en su punto durante `seconds` y dibuja las vendas o raíces enrolladas. Una sola a la vez.
 * Se suelta sola, con release() (el enemigo quedó aturdido o salió del mundo) o al morir el jugador.
 * Quien la usa llama a updateHold(world, dt) desde su update() mientras exista.
 */

export type HoldKind = 'vendas' | 'raices';

interface Hold {
  world: WorldApi;
  kind: HoldKind;
  owner: object;
  left: number;
  total: number;
  ax: number;
  ay: number;
  gfx: Phaser.GameObjects.Graphics;
}

let current: Hold | null = null;

const COLORS: Record<HoldKind, { a: number; b: number; dust: 'bandage' | 'dust' }> = {
  vendas: { a: 0xd8ccb0, b: 0x9a8a6a, dust: 'bandage' },
  raices: { a: 0x5a4028, b: 0x2a1c12, dust: 'dust' },
};

/** ¿El jugador está inmovilizado ahora? */
export const isPlayerHeld = (): boolean => current !== null;

/** Ancla al jugador. Devuelve false si ya estaba atrapado (no se acumula). */
export function holdPlayer(world: WorldApi, owner: object, kind: HoldKind, seconds: number): boolean {
  if (current && current.world === world) return false;
  if (current) releaseHold();
  const p = world.player;
  current = {
    world, kind, owner, left: seconds, total: seconds, ax: p.x, ay: p.y,
    gfx: world.scene.add.graphics(),
  };
  burst(world.scene, COLORS[kind].dust, p.x, p.y - p.z - 20, p.y + FX_DEPTH_BIAS, fxN(8));
  return true;
}

/** Suelta al jugador si `owner` es quien lo tiene (o siempre, sin owner). */
export function releaseHold(owner?: object): void {
  const h = current;
  if (!h || (owner && h.owner !== owner)) return;
  current = null;
  if (h.gfx.active) {
    const p = h.world.player;
    burst(h.world.scene, COLORS[h.kind].dust, p.x, p.y - p.z - 24, p.y + FX_DEPTH_BIAS, fxN(10));
    h.gfx.destroy();
  }
}

/** Avanza la inmovilización (solo la avanza su dueño). */
export function updateHold(owner: object, dt: number): void {
  const h = current;
  if (!h || h.owner !== owner) return;
  const p = h.world.player;
  if (!h.gfx.active || !p.alive) {
    releaseHold();
    return;
  }
  h.left -= dt;
  if (h.left <= 0) {
    releaseHold();
    return;
  }
  // Ancla: el jugador no se desplaza en el plano (puede girar, disparar y deletrear).
  p.x = h.ax;
  p.y = h.ay;
  const c = COLORS[h.kind];
  const g = h.gfx.clear().setDepth(p.y + FX_DEPTH_BIAS);
  const top = p.y - p.z;
  const k = h.left / h.total;
  const wob = reduceFx() ? 0 : Math.sin(h.world.scene.time.now / 60) * 1;
  if (h.kind === 'vendas') {
    // Tiras de venda en diagonal alrededor del cuerpo.
    for (let i = 0; i < 4; i++) {
      const y = top - 10 - i * 12 + wob;
      g.lineStyle(3, i % 2 ? c.b : c.a, 0.9 * Math.min(1, k * 3));
      g.lineBetween(p.x - 9, y + 4, p.x + 9, y - 3);
    }
  } else {
    // Raíces que suben desde el suelo y se enroscan en las piernas.
    for (let i = -1; i <= 1; i++) {
      g.lineStyle(3, i === 0 ? c.a : c.b, 0.95 * Math.min(1, k * 3));
      g.beginPath();
      g.moveTo(p.x + i * 10, p.y + 2);
      g.lineTo(p.x + i * 5 + wob, p.y - 12);
      g.lineTo(p.x - i * 4, p.y - 22);
      g.lineTo(p.x + i * 2, p.y - 30);
      g.strokePath();
    }
  }
}
