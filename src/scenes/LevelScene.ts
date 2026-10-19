import Phaser from 'phaser';
import type { SectionId } from '../core/contracts';

// STUB — dueño: mundo. Implementa WorldApi (core/contracts.ts). Ver docs/ARQUITECTURA.md.
// Recibe init({ section, spawn? }). En create(): carga src/data/levels/<section>.json, crea parallax,
// jugador, props, enemigos y llama installCombat / installCasting / installDirector, y lanza 'Hud'.
export class LevelScene extends Phaser.Scene {
  constructor() {
    super('Level');
  }
  init(data: { section?: SectionId; spawn?: string }): void {
    void data;
  }
  create(): void {}
}
