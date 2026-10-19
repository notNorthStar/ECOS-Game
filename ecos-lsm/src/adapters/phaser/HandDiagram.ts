/**
 * ADAPTADOR OPCIONAL PARA PHASER 4. El núcleo del módulo no depende de Phaser; este archivo sí.
 * Dibuja por código el esquema de la mano de una letra (lo que se muestra al deletrear y en el
 * Diario de Señas) mientras no existan las ilustraciones oficiales verificadas.
 */
import Phaser from 'phaser';
import { LETTERS, type FingerState } from '../../core/letters';

const SKIN = 0xd9a07e;
const SKIN_LIGHT = 0xf0c8a8;
const SKIN_DARK = 0xa8684e;
const OUTLINE = 0x2a1a14;

/**
 * Esquema de la mano en LSM para una letra (48×64 px a escala 1).
 * Si el juego cargó una textura con clave `lsm_<LETRA>` (ilustración oficial verificada, 48×64),
 * se muestra esa imagen en su lugar.
 * ⚠ El esquema es provisional: ver src/data/SOURCES.md.
 */
export function createHandDiagram(scene: Phaser.Scene, x: number, y: number, letter: string, scale = 1): Phaser.GameObjects.Container {
  const box = scene.add.container(x, y);
  if (scene.textures.exists(`lsm_${letter}`)) {
    box.add(scene.add.image(0, 0, `lsm_${letter}`).setScale(scale));
    return box;
  }
  const def = LETTERS[letter];
  const g = scene.add.graphics();
  box.add(g);
  if (!def) {
    g.fillStyle(0x3a4660).fillRect(-24 * scale, -32 * scale, 48 * scale, 64 * scale);
    return box;
  }
  const s = scale;
  // palma
  const palmX = -12 * s;
  const palmY = 2 * s;
  const palmW = 24 * s;
  const palmH = 22 * s;
  const fingerW = 5 * s;
  const fingerX = (i: number) => palmX + 1 * s + i * 6 * s;
  // longitudes por dedo (índice, medio, anular, meñique)
  const lengths = [17, 19, 17, 13].map((l) => l * s);
  const fingers = [def.fingers.index, def.fingers.middle, def.fingers.ring, def.fingers.pinky];

  const drawFinger = (i: number, state: FingerState) => {
    let fx = fingerX(i);
    const len = lengths[i];
    if (def.spread && state === 'ext') fx += (i - 1) * 2 * s;
    if (state === 'ext') {
      const tilt = def.crossed && i <= 1 ? (i === 0 ? 3 : -3) * s : 0;
      g.fillStyle(SKIN).fillRect(fx + tilt, palmY - len, fingerW, len + 2 * s);
      g.fillStyle(SKIN_LIGHT).fillRect(fx + tilt, palmY - len, 1 * s, len);
      g.lineStyle(1, OUTLINE).strokeRect(fx + tilt, palmY - len, fingerW, len + 2 * s);
    } else if (state === 'bent') {
      g.fillStyle(SKIN).fillRect(fx, palmY - 7 * s, fingerW, 9 * s);
      g.fillStyle(SKIN_DARK).fillRect(fx, palmY - 7 * s, fingerW, 3 * s);
      g.lineStyle(1, OUTLINE).strokeRect(fx, palmY - 7 * s, fingerW, 9 * s);
    } else if (state === 'touch') {
      g.fillStyle(SKIN).fillRect(fx, palmY - 9 * s, fingerW, 11 * s);
      g.fillStyle(SKIN_DARK).fillRect(fx, palmY - 9 * s, fingerW, 2 * s);
      g.lineStyle(1, OUTLINE).strokeRect(fx, palmY - 9 * s, fingerW, 11 * s);
    } else {
      // curl: nudillo doblado sobre la palma
      g.fillStyle(SKIN_DARK).fillRect(fx, palmY - 2 * s, fingerW, 6 * s);
      g.lineStyle(1, OUTLINE).strokeRect(fx, palmY - 2 * s, fingerW, 6 * s);
    }
  };

  g.fillStyle(SKIN).fillRect(palmX, palmY, palmW, palmH);
  g.fillStyle(SKIN_LIGHT).fillRect(palmX, palmY, palmW, 2 * s);
  g.fillStyle(SKIN_DARK).fillRect(palmX, palmY + palmH - 3 * s, palmW, 3 * s);
  g.lineStyle(1, OUTLINE).strokeRect(palmX, palmY, palmW, palmH);
  // muñeca
  g.fillStyle(0x2e5e32).fillRect(palmX + 3 * s, palmY + palmH, palmW - 6 * s, 6 * s);

  // En R, el medio va encima del índice: dibujamos el índice primero.
  fingers.forEach((st, i) => drawFinger(i, st));

  // Pulgar (lado izquierdo, mano derecha con la palma al frente)
  const t = def.fingers.thumb;
  g.fillStyle(SKIN);
  if (t === 'ext') {
    g.fillRect(palmX - 9 * s, palmY + 4 * s, 10 * s, 5 * s);
    g.lineStyle(1, OUTLINE).strokeRect(palmX - 9 * s, palmY + 4 * s, 10 * s, 5 * s);
  } else if (t === 'across') {
    g.fillRect(palmX + 2 * s, palmY + 9 * s, 16 * s, 5 * s);
    g.lineStyle(1, OUTLINE).strokeRect(palmX + 2 * s, palmY + 9 * s, 16 * s, 5 * s);
  } else if (t === 'touch') {
    g.fillRect(palmX - 2 * s, palmY - 6 * s, 6 * s, 12 * s);
    g.lineStyle(1, OUTLINE).strokeRect(palmX - 2 * s, palmY - 6 * s, 6 * s, 12 * s);
    // punto de contacto
    g.lineStyle(1, 0xf2b84b).strokeCircle(palmX + 4 * s, palmY - 7 * s, 3 * s);
  } else {
    g.fillRect(palmX - 1 * s, palmY + 6 * s, 5 * s, 8 * s);
    g.lineStyle(1, OUTLINE).strokeRect(palmX - 1 * s, palmY + 6 * s, 5 * s, 8 * s);
  }
  if (def.rotation) box.setAngle(def.rotation);
  if (def.motion === 'Z') {
    // Trayectoria de la Z sobre la punta del índice, con flecha al final (vista desde quien seña)
    const z = scene.add.graphics();
    const top = palmY - 30 * s;
    const pts = [
      [-10 * s, top],
      [12 * s, top],
      [-10 * s, top + 16 * s],
      [12 * s, top + 16 * s],
    ];
    z.lineStyle(Math.max(1, 1.5 * s), 0xf2b84b, 1);
    z.beginPath();
    z.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) z.lineTo(px, py);
    z.strokePath();
    const [ex, ey] = pts[3];
    z.fillStyle(0xf2b84b, 1).fillTriangle(ex + 3 * s, ey, ex - 2 * s, ey - 3 * s, ex - 2 * s, ey + 3 * s);
    box.add(z);
  }
  if (def.fingers.index === 'touch' && t === 'touch') {
    g.lineStyle(1, 0xf2b84b).strokeCircle(palmX + 2 * s, palmY - 6 * s, 4 * s);
  }
  return box;
}
