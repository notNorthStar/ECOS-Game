import Phaser from 'phaser';
import type { DepthEntity, LevelData } from '../core/contracts';
import { GameState } from '../core/GameState';
import type { WalkMap } from './WalkMap';

/** Overlay de depuración (F2): polígonos transitables, obstáculos, triggers, interactuables y cuerpos. */
export class DebugOverlay {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private info: Phaser.GameObjects.Text;
  visible = false;

  constructor(
    scene: Phaser.Scene,
    private level: LevelData,
    private map: WalkMap,
  ) {
    this.g = scene.add.graphics().setDepth(8000).setVisible(false);
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', backgroundColor: '#000000aa' };
    for (const t of level.triggers) this.labels.push(scene.add.text(t.x + 2, t.y + 2, `${t.id}:${t.action}`, style));
    for (const it of level.interactables) this.labels.push(scene.add.text(it.x + 4, it.y - 12, `${it.id}`, { ...style, color: '#7ff' }));
    for (const l of this.labels) l.setDepth(8001).setVisible(false);
    this.info = scene.add.text(4, 4, '', style).setScrollFactor(0).setDepth(8002).setVisible(false);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.g.setVisible(this.visible);
    this.info.setVisible(this.visible);
    for (const l of this.labels) l.setVisible(this.visible);
  }

  draw(entities: ReadonlyArray<DepthEntity>, fps: number, timeScale: number): void {
    if (!this.visible) return;
    const g = this.g;
    g.clear();
    g.lineStyle(1, 0x40ff80, 0.9);
    for (const p of this.map.polys) {
      g.beginPath();
      g.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
      g.closePath();
      g.strokePath();
    }
    g.lineStyle(1, 0xff4040, 0.9);
    for (const o of this.map.obstacles) {
      if (o.shape === 'ellipse') g.strokeEllipse(o.x, o.y, o.rx * 2, o.ry * 2, 32);
      else g.strokeRect(o.x, o.y, o.w, o.h);
    }
    for (const t of this.level.triggers) {
      const used = t.once && GameState.flags['trg:' + t.id];
      g.lineStyle(1, used ? 0x808080 : 0xffe040, 0.9);
      g.strokeRect(t.x, t.y, t.w, t.h);
    }
    g.lineStyle(1, 0x40ffff, 0.9);
    for (const it of this.level.interactables) g.strokeCircle(it.x, it.y, it.radius ?? 28);
    if (Number.isFinite(this.map.minX)) {
      g.lineStyle(2, 0xff40ff, 0.8);
      g.lineBetween(this.map.minX, 150, this.map.minX, 360);
      g.lineBetween(this.map.maxX, 150, this.map.maxX, 360);
    }
    for (const e of entities) {
      g.lineStyle(1, e.team === 'player' ? 0x80c0ff : 0xff9040, 1);
      g.strokeEllipse(e.x, e.y, e.radius * 2, e.radius, 16);
      g.lineBetween(e.x, e.y - e.z, e.x, e.y - e.z - e.height);
    }
    const p = entities[0];
    this.info.setText(
      `FPS ${fps.toFixed(0)}  ts ${timeScale.toFixed(2)}  ent ${entities.length}` +
        (p ? `\njugador x ${p.x.toFixed(0)} y ${p.y.toFixed(0)} z ${p.z.toFixed(0)}  hp ${GameState.hp}/${GameState.maxHp}` : ''),
    );
  }
}
