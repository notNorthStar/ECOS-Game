import Phaser from 'phaser';

/**
 * Personajes del KIT DEL EQUIPO (kit_assets_pixelart: pixelizar.py + validar.py), tal cual se entregan:
 *
 *   public/assets/sprites/personajes/<id>/<id>_spritesheet.png
 *   public/assets/sprites/personajes/<id>/<id>_spritesheet.json   (frameWidth, frameHeight, pivot, frames[].vista)
 *
 * Si existe la carpeta, el juego usa ese personaje en lugar del placeholder y lo anima POR CÓDIGO a partir
 * de sus vistas fijas (frente, lado_izq, lado_der, espalda · der, izq): balanceo, inclinación, estirar y
 * aplastar, retroceso. Si algún día el equipo dibuja tiras de animación (<id>_caminar.png…, ver
 * docs/ARQUITECTURA.md §4), basta con quitar la carpeta del kit para que se usen esas.
 */

/** Personajes que el juego busca. Agregar aquí (o en assets.json → "kits") los nuevos. */
export const KIT_IDS = [
  'protagonista', 'chaneque', 'chaneque_mayor', 'madre',
  // Nivel 3
  'encapuchado', 'espiritu', 'cabeza_olmeca', 'balam', 'maria',
] as const;

export const kitBase = (id: string) => `assets/sprites/personajes/${id}/${id}_spritesheet`;
const jsonKey = (id: string) => `kitjson_${id}`;
const sheetKey = (id: string) => `kit_${id}`;

interface KitJson {
  personaje: string;
  tipo: 'humanoide' | 'criatura';
  frameWidth: number;
  frameHeight: number;
  pivot: { x: number; y: number };
  frames: Array<{ name: string; vista: string; x: number; y: number; w: number; h: number }>;
}

export interface Kit {
  id: string;
  texture: string;
  tipo: 'humanoide' | 'criatura';
  originX: number;
  originY: number;
  /** vista → índice de cuadro */
  views: Record<string, number>;
}

const kits = new Map<string, Kit>();
const parsed = new Map<string, KitJson>();

/**
 * Encola los JSON de los kits en el loader de Boot; al llegar cada JSON válido encola su spritesheet.
 * Se cargan como TEXTO y se validan aquí: un servidor puede responder un archivo inexistente con una
 * página HTML (Vite lo hace), y el lector JSON de Phaser truena con eso.
 */
export function queueKits(scene: Phaser.Scene, extra: string[] = []): void {
  const ids = [...new Set<string>([...KIT_IDS, ...extra])];
  const load = scene.load;
  for (const id of ids) load.text(jsonKey(id), `${kitBase(id)}.json`);
  load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
    if (!key.startsWith('kitjson_')) return;
    const id = key.slice('kitjson_'.length);
    let j: KitJson;
    try {
      j = JSON.parse(String(scene.cache.text.get(key))) as KitJson;
    } catch {
      return; // no hay kit para este personaje
    }
    if (!j?.frameWidth || !j.frameHeight || !Array.isArray(j.frames) || !j.pivot) {
      console.warn(`[kits] ${id}_spritesheet.json no tiene el formato del kit (frameWidth, frameHeight, pivot, frames)`);
      return;
    }
    parsed.set(id, j);
    load.spritesheet(sheetKey(id), `${kitBase(id)}.png`, { frameWidth: j.frameWidth, frameHeight: j.frameHeight });
  });
}

/** Llamar en Boot.create(): registra los kits cuyo JSON y PNG cargaron bien. */
export function registerKits(scene: Phaser.Scene): string[] {
  const found: string[] = [];
  for (const [id, j] of parsed) {
    if (!scene.textures.exists(sheetKey(id))) continue;
    const views: Record<string, number> = {};
    j.frames.forEach((f, i) => (views[f.vista] = i));
    kits.set(id, {
      id,
      texture: sheetKey(id),
      tipo: j.tipo,
      originX: j.pivot.x / j.frameWidth,
      originY: j.pivot.y / j.frameHeight,
      views,
    });
    found.push(id);
  }
  if (found.length) console.info('[kits] personajes del equipo:', found.join(', '));
  return found;
}

/** ¿El equipo entregó este personaje? */
export const getKit = (id: string): Kit | undefined => kits.get(id);

/** Los errores 404 de kits que no existen son normales: no los reportes como fallas. */
export const isKitFile = (key: string) => key.startsWith('kitjson_') || key.startsWith('kit_');

/* ============================ animación por código ============================ */

/** Movimiento según la animación pedida (el sufijo de la clave: 'protagonista_caminar' → 'caminar'). */
type Motion =
  | 'reposo' | 'caminar' | 'correr' | 'subida' | 'caida' | 'aterrizar' | 'esquivar' | 'disparar'
  | 'conjuro' | 'dano' | 'morir' | 'interactuar' | 'ataque' | 'salto' | 'agotado' | 'purificar'
  | 'golpe' | 'invocar' | 'lanzar' | 'aturdido';

function motionOf(animKey: string): Motion {
  const k = animKey.replace(/^(protagonista|chaneque_mayor|chaneque|madre|encapuchado|espiritu|cabeza_olmeca|balam|maria)_/, '');
  if (k === 'saltar_subida') return 'subida';
  if (k === 'saltar_caida') return 'caida';
  return (k as Motion) || 'reposo';
}

/**
 * Anima un sprite con las vistas fijas del kit. La entidad sigue llamando a su `play(clave)` de siempre
 * (se traduce con setAnim) y, al final de colocar el sprite, llama a apply(facing, tiempo).
 */
export class KitAnimator {
  private motion: Motion = 'reposo';
  private t0 = 0;
  private now = 0;

  constructor(
    private sprite: Phaser.GameObjects.Sprite,
    readonly kit: Kit,
  ) {
    sprite.anims?.stop();
    sprite.setTexture(kit.texture, this.frameFor(1));
    sprite.setOrigin(kit.originX, kit.originY);
  }

  /** Equivalente a sprite.play(clave): cambia el movimiento (reinicia su reloj si cambia). */
  setAnim(animKey: string, restart = false): void {
    const m = motionOf(animKey);
    if (m !== this.motion || restart) {
      this.motion = m;
      this.t0 = this.now;
    }
  }

  private frameFor(facing: 1 | -1, prefer?: string): number {
    const v = this.kit.views;
    if (prefer && v[prefer] !== undefined) return v[prefer];
    if (this.kit.tipo === 'humanoide') {
      const side = facing > 0 ? v.lado_der : v.lado_izq;
      return side ?? v.lado_der ?? v.lado_izq ?? v.frente ?? 0;
    }
    return (facing > 0 ? v.der : v.izq) ?? v.der ?? v.izq ?? 0;
  }

  /** ¿Existe una vista propia para este lado? Si no, se espeja la otra. */
  private needsFlip(facing: 1 | -1): boolean {
    const v = this.kit.views;
    if (this.kit.tipo === 'humanoide') return facing > 0 ? v.lado_der === undefined : v.lado_izq === undefined;
    return facing > 0 ? v.der === undefined : v.izq === undefined;
  }

  /** Aplica cuadro y transformación. Llamar DESPUÉS de colocar el sprite; `time` en segundos (reloj de la entidad). */
  apply(facing: 1 | -1, time: number): void {
    this.now = time;
    const t = time - this.t0;
    const s = this.sprite;
    let prefer: string | undefined;
    let sx = 1;
    let sy = 1;
    let ang = 0;
    let dx = 0;
    let dy = 0;
    const f = facing;
    switch (this.motion) {
      case 'reposo':
        sy = 1 + Math.sin(time * 2.4) * 0.018;
        sx = 1 - Math.sin(time * 2.4) * 0.008;
        break;
      case 'caminar': {
        const ph = time * 10;
        dy = -Math.abs(Math.sin(ph)) * 2;
        ang = Math.sin(ph) * 2.2;
        sy = 1 + Math.abs(Math.cos(ph)) * 0.02;
        break;
      }
      case 'correr': {
        const ph = time * 14;
        dy = -Math.abs(Math.sin(ph)) * 3;
        ang = f * 7 + Math.sin(ph) * 2;
        sx = 1.03;
        sy = 0.97 + Math.abs(Math.cos(ph)) * 0.04;
        break;
      }
      case 'subida':
      case 'salto':
        sy = 1.08;
        sx = 0.93;
        ang = f * 4;
        break;
      case 'caida':
        sy = 1.03;
        sx = 0.98;
        ang = -f * 3;
        break;
      case 'aterrizar': {
        const k = Math.max(0, 1 - t / 0.16);
        sy = 1 - 0.12 * k;
        sx = 1 + 0.1 * k;
        break;
      }
      case 'esquivar':
        ang = f * 20;
        sy = 0.88;
        sx = 1.06;
        dx = f * 2;
        break;
      case 'disparar': {
        const k = Math.max(0, 1 - t / 0.14);
        dx = -f * 2 * k;
        ang = -f * 3 * k;
        break;
      }
      case 'conjuro':
        prefer = 'frente';
        sy = 1 + Math.sin(time * 6) * 0.025;
        sx = 1 + Math.sin(time * 6) * 0.015;
        break;
      case 'dano': {
        const k = Math.max(0, 1 - t / 0.3);
        ang = -f * 12 * k;
        dx = -f * 3 * k + Math.sin(time * 60) * k;
        break;
      }
      case 'morir': {
        const k = Math.min(1, t / 0.5);
        ang = -f * 85 * k * k;
        sy = 1 - 0.05 * k;
        break;
      }
      case 'interactuar':
        prefer = t < 0.6 ? 'espalda' : undefined;
        sy = 1 - Math.sin(Math.min(1, t / 0.3) * Math.PI) * 0.04;
        break;
      case 'ataque':
      case 'golpe': {
        // Preparación hacia atrás y luego embestida (los ataques se anuncian, GDD 5).
        const wind = Math.min(1, t / 0.25);
        const lunge = t > 0.25 ? Math.max(0, 1 - (t - 0.25) / 0.2) : 0;
        ang = -f * 8 * wind * (1 - lunge) + f * 12 * lunge;
        dx = -f * 2 * wind + f * 5 * lunge;
        sy = 1 - 0.08 * lunge;
        sx = 1 + 0.08 * lunge;
        break;
      }
      case 'lanzar': {
        const k = Math.sin(Math.min(1, t / 0.45) * Math.PI);
        ang = -f * 10 * k;
        sy = 1 + 0.05 * k;
        break;
      }
      case 'invocar':
        sy = 1 + Math.abs(Math.sin(time * 8)) * 0.06;
        sx = 1 - Math.abs(Math.sin(time * 8)) * 0.03;
        break;
      case 'agotado':
      case 'aturdido':
        ang = Math.sin(time * 3) * 8 + f * 6;
        sy = 0.92;
        sx = 1.04;
        break;
      case 'purificar': {
        const k = Math.min(1, t / 1.2);
        dy = -k * 10;
        sy = 1 + Math.sin(time * 12) * 0.03;
        break;
      }
    }
    s.setFrame(this.frameFor(facing, prefer));
    s.setFlipX(prefer ? false : this.needsFlip(facing));
    s.setScale(sx, sy);
    s.setAngle(ang);
    if (dx || dy) s.setPosition(s.x + Math.round(dx), s.y + Math.round(dy));
  }
}

/** Atajo: devuelve un animador si el equipo entregó el kit `id`, o null. */
export function kitAnimatorFor(sprite: Phaser.GameObjects.Sprite, id: string): KitAnimator | null {
  const k = getKit(id);
  return k ? new KitAnimator(sprite, k) : null;
}
