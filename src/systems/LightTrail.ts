import Phaser from 'phaser';
import { bus } from '../core/bus';
import { GameState } from '../core/GameState';
import { DEPTH } from '../config/game';
import type { WorldApi } from '../core/contracts';

// Dueño: contenido. Rastro de luz de la gema (GDD §8): motas de luz que salen del pecho del jugador
// y viajan hacia el objetivo actual ('objective' en el bus). Siempre tenue; más intenso si el jugador
// se queda quieto o tarda en avanzar. Solo aparece cuando la gema ya despertó (GameState.flags.gema).

const QUIETO_MS = 5000; // a partir de aquí el rastro se intensifica
const TEX_RESPALDO = '__contenido_rastro';

/** Último objetivo anunciado; sobrevive al reinicio de la escena. */
let objetivo: { x: number; y: number; section: string } | null = null;

export function setObjective(o: { x: number; y: number; section: string } | null): void {
  objetivo = o;
}

function texturaRastro(scene: Phaser.Scene): string {
  if (scene.textures.exists('fx_rastro')) return 'fx_rastro';
  if (scene.textures.exists(TEX_RESPALDO)) return TEX_RESPALDO;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x8ff7e1, 0.35).fillCircle(4, 4, 4);
  g.fillStyle(0xc8fff2, 0.9).fillCircle(4, 4, 2);
  g.fillStyle(0xffffff, 1).fillRect(3, 3, 2, 2);
  g.generateTexture(TEX_RESPALDO, 8, 8);
  g.destroy();
  return TEX_RESPALDO;
}

export function installLightTrail(world: WorldApi): void {
  const scene = world.scene;
  const tex = texturaRastro(scene);
  let acumulado = 0;
  let quietoMs = 0;
  let ultX = world.player?.x ?? 0;
  let ultY = world.player?.y ?? 0;

  bus.scoped(scene, 'objective', (o) => {
    objetivo = o;
  });

  const capa = (img: Phaser.GameObjects.Image) => {
    try {
      if (world.fxLayer) {
        world.fxLayer.add(img);
        return;
      }
    } catch {
      /* sin capa de efectos */
    }
    img.setDepth(DEPTH.foreground - 1);
  };

  const emitir = (intenso: boolean) => {
    const p = world.player;
    if (!p || !objetivo) return;
    const ox = p.x;
    const oy = p.y - p.z - 22; // altura del pecho
    const tx = objetivo.x;
    const ty = objetivo.y - 16;
    const dx = tx - ox;
    const dy = ty - oy;
    const dist = Math.hypot(dx, dy);
    if (dist < 30) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const largo = Math.min(dist, intenso ? 260 : 150);
    const img = scene.add.image(ox + Phaser.Math.Between(-3, 3), oy + Phaser.Math.Between(-3, 3), tex);
    capa(img);
    img.setBlendMode(Phaser.BlendModes.ADD);
    img.setDepth(p.y + 1);
    img.setAlpha(0);
    img.setScale(intenso ? 1 : 0.7);
    // Ondulación perpendicular para que se vea como un hilo vivo.
    const amp = Phaser.Math.Between(-10, 10);
    const dur = (largo / (intenso ? 120 : 90)) * 1000;
    scene.tweens.add({
      targets: img,
      x: ox + nx * largo - ny * amp,
      y: oy + ny * largo + nx * amp,
      duration: dur,
      ease: 'Sine.easeOut',
    });
    scene.tweens.add({
      targets: img,
      alpha: { from: intenso ? 0.95 : 0.45, to: 0 },
      scale: 0.3,
      duration: dur,
      ease: 'Quad.easeIn',
      onComplete: () => img.destroy(),
    });
  };

  const onUpdate = (_t: number, delta: number) => {
    const p = world.player;
    if (!p || !GameState.flags.gema || !objetivo || objetivo.section !== world.level.id) return;
    if (p.controlsLocked) return;
    const movido = Math.hypot(p.x - ultX, p.y - ultY);
    ultX = p.x;
    ultY = p.y;
    quietoMs = movido > 0.5 ? Math.max(0, quietoMs - delta * 0.5) : quietoMs + delta;
    const intenso = quietoMs > QUIETO_MS;
    const periodo = intenso ? 70 : 260;
    acumulado += delta;
    while (acumulado >= periodo) {
      acumulado -= periodo;
      emitir(intenso);
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
}
