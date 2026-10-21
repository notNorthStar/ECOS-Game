import Phaser from 'phaser';

/**
 * Personajes del KIT DEL EQUIPO (kit_assets_pixelart: pixelizar.py + validar.py), tal cual se entregan:
 *
 *   public/assets/sprites/personajes/<id>/<id>_spritesheet.png
 *   public/assets/sprites/personajes/<id>/<id>_spritesheet.json   (frameWidth, frameHeight, pivot, frames[].vista)
 *
 * Si existe la carpeta, el juego usa ese personaje en lugar del placeholder. Dos formatos:
 *  - Kit de VISTAS FIJAS (frente, lado_izq, lado_der, espalda · der, izq): se anima POR CÓDIGO (balanceo,
 *    inclinación, estirar y aplastar, retroceso).
 *  - Kit ANIMADO POR CUADROS (tools/codex-sheets.py): además trae "animaciones" { motion: { frames, fps, loop } },
 *    "escala" (multiplicador de tamaño) y, si hay versiones del mismo personaje, "variants" + "cuadrosPorVariante"
 *    (la variante k ocupa los cuadros k·n … k·n+n−1). Se reproducen los cuadros y se conserva un toque del
 *    animado por código (aplastar al aterrizar, retroceso al recibir daño…).
 */

/** Personajes que el juego busca. Agregar aquí (o en assets.json → "kits") los nuevos. */
export const KIT_IDS = [
  'protagonista', 'chaneque', 'chaneque_mayor', 'madre',
  // Nivel 3
  'encapuchado', 'espiritu', 'cabeza_olmeca', 'balam', 'maria',
  // Nivel 4 (la bruja tiene dos formas: dos kits)
  'bestia', 'bruja_guajolote', 'bruja_guajolote_ave',
  // Nivel 6 (el nahual tiene forma humana y animal; la Nahuala, una)
  'muneca', 'nahual', 'nahual_animal', 'nahuala',
  // Nivel 7 (la Llorona es aliada; María se transforma en ella)
  'rey_olvido', 'llorona',
  // Nivel 10 (la madre ya está desde el Nivel 1; Balam crece a jaguar luminoso)
  'tzitzimitl', 'itzpapalotl', 'balam_jaguar',
  // Versión extendida (Guadalajara): enemigos de los niveles omitidos
  'momia', 'vampiro', 'don_ernesto',
] as const;

export const kitBase = (id: string) => `assets/sprites/personajes/${id}/${id}_spritesheet`;
const jsonKey = (id: string) => `kitjson_${id}`;
const sheetKey = (id: string) => `kit_${id}`;

/** Animación por cuadros de un motion: índices de cuadro DENTRO de la variante. */
export interface KitAnim {
  frames: number[];
  fps: number;
  loop: boolean;
}

interface KitJson {
  personaje: string;
  tipo: 'humanoide' | 'criatura';
  frameWidth: number;
  frameHeight: number;
  pivot: { x: number; y: number };
  frames: Array<{ name: string; vista: string; x: number; y: number; w: number; h: number }>;
  animaciones?: Record<string, Partial<KitAnim>>;
  escala?: number;
  variants?: string[];
  cuadrosPorVariante?: number;
}

export interface Kit {
  id: string;
  texture: string;
  tipo: 'humanoide' | 'criatura';
  originX: number;
  originY: number;
  /** vista → índice de cuadro */
  views: Record<string, number>;
  /** motion → cuadros (solo si el kit es animado por cuadros). */
  anims?: Record<string, KitAnim>;
  /** Multiplicador de tamaño en pantalla (1 = tal cual). */
  escala: number;
  /** Versiones del mismo personaje (muñecas 1–4, cofradía roja/negra/élite…). */
  variants?: string[];
  /** Cuadros que ocupa cada variante en la hoja. */
  framesPerVariant: number;
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
    j.frames.forEach((f, i) => {
      if (views[f.vista] === undefined) views[f.vista] = i;
    });
    const total = Math.max(1, scene.textures.get(sheetKey(id)).frameTotal - 1); // sin el cuadro __BASE
    const variants = Array.isArray(j.variants) && j.variants.length > 1 ? j.variants.map(String) : undefined;
    const perVariant = variants ? j.cuadrosPorVariante || Math.floor(total / variants.length) : total;
    let anims: Record<string, KitAnim> | undefined;
    if (j.animaciones && typeof j.animaciones === 'object') {
      anims = {};
      for (const [m, a] of Object.entries(j.animaciones)) {
        const frames = (a?.frames ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < perVariant);
        if (frames.length) anims[m] = { frames, fps: a?.fps && a.fps > 0 ? a.fps : 8, loop: !!a?.loop };
      }
      if (!Object.keys(anims).length) anims = undefined;
    }
    kits.set(id, {
      id,
      texture: sheetKey(id),
      tipo: j.tipo,
      originX: j.pivot.x / j.frameWidth,
      originY: j.pivot.y / j.frameHeight,
      views,
      anims,
      escala: typeof j.escala === 'number' && j.escala > 0 ? j.escala : 1,
      variants,
      framesPerVariant: perVariant,
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

/* ============================ animación ============================ */

/** Movimiento según la animación pedida (el sufijo de la clave: 'protagonista_caminar' → 'caminar'). */
type Motion =
  | 'reposo' | 'caminar' | 'correr' | 'subida' | 'caida' | 'aterrizar' | 'esquivar' | 'disparar'
  | 'conjuro' | 'dano' | 'morir' | 'interactuar' | 'ataque' | 'salto' | 'agotado' | 'purificar'
  | 'golpe' | 'invocar' | 'lanzar' | 'aturdido';

/** Claves de animación que no son un motion del contrato → el motion más parecido. */
const ALIAS: Record<string, Motion> = {
  saltar_subida: 'subida', saltar_caida: 'caida', cae: 'morir', zarpazo: 'ataque', embestida: 'ataque',
  risa: 'reposo', senas: 'conjuro', despierta: 'invocar', llegada: 'caminar', lamento: 'invocar',
  grito: 'invocar', transformar: 'invocar', huir: 'correr', desciende: 'caida', polvo: 'morir', fin: 'morir',
  romper: 'morir', liberar: 'purificar', maullido: 'reposo', despedida: 'purificar', aparece: 'invocar',
  intro: 'invocar', ilusion: 'conjuro', trampa: 'invocar', arena: 'reposo',
};

function motionOf(animKey: string): Motion {
  const k = animKey.replace(/^(protagonista|chaneque_mayor|chaneque|madre|encapuchado|espiritu|cabeza_olmeca|balam_jaguar|balam|maria|bestia|bruja_guajolote_ave|bruja_guajolote|muneca|nahual_animal|nahuala|nahual|rey_olvido|llorona|tzitzimitl|itzpapalotl|momia|vampiro|don_ernesto)_/, '');
  return ALIAS[k] ?? ((k as Motion) || 'reposo');
}

/** Hash estable (FNV-1a) para elegir variante sin azar. */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Anima un sprite con el kit. La entidad sigue llamando a su `play(clave)` de siempre (se traduce con setAnim)
 * y, al final de colocar el sprite, llama a apply(facing, tiempo).
 */
export class KitAnimator {
  private motion: Motion = 'reposo';
  private t0 = 0;
  private now = 0;
  /** Escala que tenía el sprite al crearse (o la que fije la entidad): el animador la MULTIPLICA, no la pisa. */
  private baseSX: number;
  private baseSY: number;
  /** Desplazamiento de cuadros de la variante elegida. */
  private frameOffset = 0;
  private _variant: string | undefined;

  constructor(
    private sprite: Phaser.GameObjects.Sprite,
    readonly kit: Kit,
    variant?: string,
  ) {
    sprite.anims?.stop();
    this.baseSX = sprite.scaleX || 1;
    this.baseSY = sprite.scaleY || 1;
    if (kit.variants) {
      this.setVariant(variant ?? autoVariant(sprite, kit));
      if (this._variant === undefined) this.setVariant(autoVariant(sprite, kit)); // nombre desconocido
    }
    sprite.setTexture(kit.texture, this.frameFor(1) + this.frameOffset);
    sprite.setOrigin(kit.originX, kit.originY);
    sprite.setScale(this.baseSX * kit.escala, this.baseSY * kit.escala);
  }

  /** Variante en uso (undefined si el kit no tiene variantes). */
  get variant(): string | undefined {
    return this._variant;
  }

  /** Cambia de versión (p. ej. el rango del encapuchado: 'rojo' | 'negro' | 'elite'). Ignora nombres desconocidos. */
  setVariant(name: string): void {
    const vs = this.kit.variants;
    if (!vs) return;
    const i = vs.indexOf(name);
    if (i < 0) return;
    this._variant = name;
    this.frameOffset = i * this.kit.framesPerVariant;
  }

  /** Escala propia de la entidad (p. ej. un jefe más grande); se multiplica por la del kit y la del movimiento. */
  setBaseScale(sx: number, sy = sx): void {
    this.baseSX = sx;
    this.baseSY = sy;
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
    if (this.kit.anims) return this.kit.anims.reposo?.frames[0] ?? 0;
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

  /** Cuadros del motion pedido (con sustitutos razonables) o los de reposo. */
  private animFor(m: Motion): KitAnim | undefined {
    const a = this.kit.anims;
    if (!a) return undefined;
    const alt: Partial<Record<Motion, Motion>> = { subida: 'salto', salto: 'subida', golpe: 'ataque', agotado: 'aturdido', aturdido: 'agotado' };
    return a[m] ?? (alt[m] ? a[alt[m]!] : undefined) ?? a.reposo;
  }

  /** Aplica cuadro y transformación. Llamar DESPUÉS de colocar el sprite; `time` en segundos (reloj de la entidad). */
  apply(facing: 1 | -1, time: number): void {
    if (this.kit.anims) return this.applyFrames(facing, time);
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
    s.setFrame(this.frameFor(facing, prefer) + this.frameOffset);
    s.setFlipX(prefer ? false : this.needsFlip(facing));
    s.setScale(this.baseSX * this.kit.escala * sx, this.baseSY * this.kit.escala * sy);
    s.setAngle(ang);
    if (dx || dy) s.setPosition(s.x + Math.round(dx), s.y + Math.round(dy));
  }

  /**
   * Kit animado por cuadros: el cuadro sale de "animaciones" (las poses miran a la derecha; a la izquierda se
   * espejan) y encima queda un toque, más suave, del animado por código.
   */
  private applyFrames(facing: 1 | -1, time: number): void {
    this.now = time;
    const t = Math.max(0, time - this.t0);
    const s = this.sprite;
    const m = this.motion;
    const a = this.animFor(m);
    let idx = 0;
    if (a) {
      const n = a.frames.length;
      const step = Math.floor(t * a.fps);
      idx = a.frames[a.loop ? step % n : Math.min(n - 1, step)];
    }
    const f = facing;
    let sx = 1;
    let sy = 1;
    let ang = 0;
    let dx = 0;
    let dy = 0;
    switch (m) {
      case 'reposo':
        sy = 1 + Math.sin(time * 2.4) * 0.01;
        break;
      case 'aterrizar': {
        const k = Math.max(0, 1 - t / 0.16);
        sy = 1 - 0.1 * k;
        sx = 1 + 0.08 * k;
        break;
      }
      case 'subida':
      case 'salto':
        sy = 1.04;
        sx = 0.97;
        break;
      case 'disparar': {
        const k = Math.max(0, 1 - t / 0.14);
        dx = -f * 2 * k;
        break;
      }
      case 'dano': {
        const k = Math.max(0, 1 - t / 0.3);
        dx = -f * 2 * k + Math.sin(time * 60) * k;
        break;
      }
      case 'ataque':
      case 'golpe': {
        const lunge = t > 0.2 ? Math.max(0, 1 - (t - 0.2) / 0.2) : 0;
        dx = f * 3 * lunge;
        break;
      }
      case 'invocar':
      case 'conjuro':
        sy = 1 + Math.abs(Math.sin(time * 6)) * 0.025;
        break;
      case 'agotado':
      case 'aturdido':
        ang = Math.sin(time * 3) * 4;
        break;
      case 'purificar': {
        const k = Math.min(1, t / 1.2);
        dy = -k * 10;
        sy = 1 + Math.sin(time * 12) * 0.02;
        break;
      }
    }
    s.setFrame(idx + this.frameOffset);
    s.setFlipX(f < 0);
    s.setScale(this.baseSX * this.kit.escala * sx, this.baseSY * this.kit.escala * sy);
    s.setAngle(ang);
    if (dx || dy) s.setPosition(s.x + Math.round(dx), s.y + Math.round(dy));
  }
}

/** Variante estable por sprite cuando nadie la pide: hash del kit, el nombre del sprite y su posición al crearse. */
function autoVariant(sprite: Phaser.GameObjects.Sprite, kit: Kit): string {
  const vs = kit.variants!;
  const h = hashStr(`${kit.id}|${sprite.name}|${Math.round(sprite.x)}|${Math.round(sprite.y)}`);
  return vs[h % vs.length];
}

/**
 * Atajo: devuelve un animador si el equipo entregó el kit `id`, o null.
 * `variant`: versión a usar (ver `getKit(id)?.variants`); si no se pide, se elige una estable por sprite.
 * También se puede cambiar después con `animador.setVariant(nombre)`.
 */
export function kitAnimatorFor(sprite: Phaser.GameObjects.Sprite, id: string, variant?: string): KitAnimator | null {
  const k = getKit(id);
  return k ? new KitAnimator(sprite, k, variant) : null;
}
