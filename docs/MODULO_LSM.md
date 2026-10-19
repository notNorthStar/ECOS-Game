# Módulo LSM (`ecos-lsm`): cómo lo usa ECOS

> Para las IAs y el equipo. La detección de Lengua de Señas Mexicana **ya está hecha y probada**: vive en la carpeta `ecos-lsm/`. **No la reescribas; intégrala.**
> - Referencia completa de la API: `ecos-lsm/README.md`.
> - Página de prueba sin juego: `cd ecos-lsm && npm install && npm run dev`.
> - Pruebas: `npm test`.

---

## 1. Qué resuelve el módulo y qué resuelve el juego

| GDD | Lo hace el **módulo** | Lo hace el **juego** |
|---|---|---|
| 6.2 Rueda / lanzar con Q | — | Rueda, Q tocar o mantener (200 ms), conjuro seleccionado, lanzamiento automático si está dominado |
| 6.3 Sistema de LSM | Cámara, detección, "sostener 300 ms", ventanas por letra, teclado, puntuación (fallo / parcial / PERFECTO), fuerza | Ralentizar el mundo, interfaz del deletreo, efectos, aplicar el conjuro a los enemigos |
| 6.4 Maestría | — (entrega `outcome`) | 3 niveles, rachas, dominado |
| 6.5 Escudo (U) | `HoldDetector` (U estable 150 ms, gracia al soltar, suspensión) + modo de detección continua | Barra, daño reducido, rebote, visual, Alt / clic sin cámara |
| 6.6 Exactitud | Letras soportadas, `checkWord()` (sin acentos, máx. 10, letras sin soporte), formas de mano en `letters.json`, fuentes | Elegir nombres de conjuros válidos, créditos |
| 6.1 Aprender / Diario | `LETTERS[letra].desc` y adaptador `createHandDiagram()` (Phaser) | Momento de aprendizaje, Diario (Tab), explicación guiada |
| Opciones | Tolerancia, ventanas largas, solo teclado | Menú de opciones |

## 2. Integración (resumen; detalle en `ecos-lsm/README.md` §4)

1. Copia `ecos-lsm/src/` a `src/lsm/`, el modelo `hand_landmarker.task` a `public/mediapipe/` y `tools/setup-mediapipe.mjs` a `tools/`.
2. En `package.json`: `predev` y `prebuild` que llamen al script, y la dependencia `@mediapipe/tasks-vision@1.0.1`.
3. **Un solo `LsmEngine`**, exportado desde un archivo de sistema (por ejemplo `src/systems/Lsm.ts`) junto con un `CameraView`.

### Ejemplo con Phaser 4 (escena de juego)
```ts
import { lsm, camView } from '../systems/Lsm';
import { HoldDetector, type SpellSession } from '../lsm';

const shield = new HoldDetector('U', { holdMs: 150 });   // GDD 6.5
let spell: SpellSession | null = null;

function castSelected(name: string) {          // al tocar Q con un conjuro NO dominado
  shield.suspended = true;                      // la U de LUZ no debe activar el escudo
  lsm.setMode('spell');
  spell = lsm.startSpell(name, performance.now(), {
    letterWindowMs: 3000 * (options.longWindows ? 1.8 : 1),
  });
  if (lsm.cameraReady) camView.placeOver(game.canvas, 504, 8, 128, 96, 640, 360);   // game = Phaser.Game
  slowWorld(true);                              // propio del juego
}

update() {
  const now = performance.now();               // tiempo REAL (el mundo va ralentizado)
  if (spell) {
    if (lsm.cameraReady) lsm.stepSpell(spell, now); else spell.update(now, null, 0);
    hud.showSpell(spell, now);                 // letra actual, LETTERS[letra], timeLeft, holdProgress
    if (spell.done) {
      applySpell(spell.result());              // outcome + power → efectos, Ecos (+25 % si 'perfect'), maestría
      spell = null; camView.hide(); slowWorld(false);
      shield.suspended = false;
      lsm.setMode(shieldUnlocked && lsm.cameraReady ? 'shield' : 'off');
    }
  } else if (shieldUnlocked && lsm.cameraReady) {
    player.shieldOn = shield.update(lsm.read(now), now);
    hud.handIcon(lsm.last?.letter === 'U');     // indicador "la cámara ve la U"
  }
}

// Teclado durante el deletreo: TODAS las letras escriben y el resto de controles se suspende (GDD nota 6)
this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
  if (spell && !spell.done) spell.typeLetter(e.key, performance.now());
});
```

### Pantalla de cámara (título)
- Llama `lsm.preload()` al mostrar el título.
- Opción **1** → `await lsm.enableCamera()`. Si devuelve `false`, muestra `lsm.errorReason` y sigue con teclado.
- Opción **2** → solo teclado (no se pide la cámara).
- Muestra el texto de privacidad: *"La cámara se procesa en tu equipo; no se graba ni se envía nada."*
- Prueba en vivo recomendada: muestra `lsm.read(now).letter` y `lsm.explain()?.top` (null si no hay mano) mientras la persona hace una letra.

### Datos de conjuros
Al cargar `spells.json`, valida cada nombre:
```ts
for (const s of spells) {
  const c = checkWord(s.name);
  if (!c.ok) console.warn(`Conjuro ${s.name}: letras sin cámara ${c.unsupported} / más de 10: ${c.tooLong}`);
}
```

## 3. Cómo se calibró (y cómo seguir haciéndolo)

Las letras se ajustaron una por una con **capturas de la pantalla de prueba con F3** que mandó el equipo: puntajes de las 3 mejores letras, alcance de cada dedo, estado del pulgar, dirección, contacto índice-pulgar y cruce. **Es el método que funcionó; úsalo igual:**

1. La persona hace la letra con F3 activado y manda la captura, de preferencia también de la letra con la que se confunde.
2. Compara los números de las dos letras y busca la medida que más las separa. Ejemplo real: P y R por la **separación** entre las puntas, 0.84–1.02 contra 0.06–0.07; la altura del pulgar se traslapaba.
3. Ajusta la regla en `src/lsm/core/rules.ts` y **deja comentado el valor real** que la justifica.
4. Agrega un caso sintético que imite la captura en `ecos-lsm/test/syntheticHands.ts`.
5. Corre `npm test`: todo debe pasar en las tres tolerancias.
6. Pide que la persona la pruebe otra vez.

**Errores ya resueltos (no los reintroduzcas):**
- Con el video sin espejo, MediaPipe reporta la **mano real**. Reflejar la mano equivocada volteaba todo: la A salía como S.
- Medir en el marco de la **imagen** hacía que inclinar la mano cambiara la letra. Ahora todo se mide en el marco de la mano, salvo "de lado" (G, H) y "hacia abajo" (M, N).
- En la Z, el índice apunta a la cámara en las esquinas de abajo y se ve corto. La forma de "apuntar" se basa en que los otros tres dedos estén doblados.
- Las pulsaciones de teclado de menos de un cuadro se perdían con `JustDown` de Phaser: usa eventos `keydown` (como en el ejemplo).

## 4. Pendientes del módulo

| Tema | Estado |
|---|---|
| G, H, I, Y, T y la separación P/R | Corregidas al final de la demo: **probar de nuevo con la cámara** |
| R fuera de conjuros | Puede leerse como U (límite de MediaPipe). En conjuros funciona con la ayuda de "letra objetivo" |
| Verificación con la SEP | Todas las formas siguen `review: true`. Idealmente, revisión de la comunidad sorda |
| Muestras k-NN | `samples.json` vacío: grabarlas con 2 o 3 personas mejoraría la precisión de las letras difíciles |
| Electron | Probar la carga del WASM y el permiso de cámara en el .exe |
| FPS con escudo | Medir con detección continua a 12 Hz en la PC objetivo |
