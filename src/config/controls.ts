// Todas las teclas del juego (AGENTS.md §4, GDD §3). Reasignar aquí.
// Se usan los valores de KeyboardEvent.code para no depender de la distribución del teclado.

export const CONTROLS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'], // hacia el fondo (profundidad)
  down: ['KeyS', 'ArrowDown'], // hacia el frente
  jump: ['Space'],
  run: ['ShiftLeft', 'ShiftRight'],
  dodge: ['KeyC'], // alternativa al doble Shift
  shoot: ['KeyX'], // + clic derecho
  laserGreen: ['Digit1'],
  laserRed: ['Digit2'],
  interact: ['KeyE'],
  spell: ['KeyQ'], // toque = lanzar, mantener = rueda
  luna: ['KeyF'],
  shield: ['AltLeft'], // si Alt falla: clic izquierdo (SHIELD_ON_LEFT_CLICK)
  diary: ['Tab'],
  pause: ['Escape'],
  debug: ['F2'],
  lsmExplain: ['F3'],
} as const;

export type Action = keyof typeof CONTROLS;

/** Doble Shift para esquivar: tiempo máximo entre toques. */
export const DOUBLE_SHIFT_MS = 250;
/** Q: umbral entre toque y mantener. */
export const SPELL_HOLD_MS = 200;
/** Si Alt no es confiable, el escudo pasa a clic izquierdo mantenido. */
export const SHIELD_ON_LEFT_CLICK = false;

/** ¿Este código de tecla corresponde a la acción? */
export function isAction(code: string, action: Action): boolean {
  return (CONTROLS[action] as readonly string[]).includes(code);
}

/**
 * Estado de teclas por código, alimentado con eventos keydown/keyup del DOM
 * (no usar JustDown de Phaser: se pierden pulsaciones de menos de un cuadro, MODULO_LSM.md §3).
 */
class KeyState {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  /** Suspende las acciones de juego (deletreo con teclado, diálogos). */
  locked = false;

  handleDown(code: string): void {
    if (!this.down.has(code)) this.pressedThisFrame.add(code);
    this.down.add(code);
  }
  handleUp(code: string): void {
    this.down.delete(code);
  }
  /** Mantener la acción. Devuelve false si la entrada está bloqueada. */
  isDown(action: Action): boolean {
    if (this.locked) return false;
    return (CONTROLS[action] as readonly string[]).some((c) => this.down.has(c));
  }
  /** La acción se presionó desde el último endFrame(). */
  justPressed(action: Action): boolean {
    if (this.locked) return false;
    return (CONTROLS[action] as readonly string[]).some((c) => this.pressedThisFrame.has(c));
  }
  /** Llamar una vez al final de cada cuadro (lo hace LevelScene). */
  endFrame(): void {
    this.pressedThisFrame.clear();
  }
  clear(): void {
    this.down.clear();
    this.pressedThisFrame.clear();
  }
}

export const keys = new KeyState();

let guardsInstalled = false;
/**
 * Bloqueos del navegador (AGENTS.md §4): menú contextual, Tab, Alt (keydown y keyup), Alt+letra,
 * F-keys usadas. Nunca usamos Ctrl. Alt+Espacio lo maneja Windows y no se puede bloquear.
 */
export function installInputGuards(canvasParent: HTMLElement): void {
  if (guardsInstalled) return;
  guardsInstalled = true;
  canvasParent.addEventListener('contextmenu', (e) => e.preventDefault());
  const block = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || e.code === 'AltLeft' || e.code === 'AltRight' || e.altKey) e.preventDefault();
    if (e.code === 'F2' || e.code === 'F3' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  window.addEventListener('keydown', (e) => {
    block(e);
    keys.handleDown(e.code);
  });
  window.addEventListener('keyup', (e) => {
    block(e);
    keys.handleUp(e.code);
  });
  window.addEventListener('blur', () => keys.clear());
}
