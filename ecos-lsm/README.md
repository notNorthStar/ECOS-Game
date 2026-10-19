# ecos-lsm — módulo de Lengua de Señas Mexicana para ECOS

Reconoce el **alfabeto manual de LSM** con la **cámara web** (MediaPipe `HandLandmarker`, todo local) y resuelve los **conjuros deletreados** de ECOS, con **respaldo de teclado** obligatorio. Es **independiente del motor de juego**: no usa Phaser (salvo un adaptador opcional para dibujar la mano).

Listick Games · 09 Game Jam ANIEI 2026. Se extrajo y probó en la demo "Parque Juárez" (2026-10-16/17) con la cámara del equipo.

---

## 1. Qué incluye

```
ecos-lsm/
├─ src/
│  ├─ index.ts                 ← punto de entrada (todo lo público)
│  ├─ core/                    ← SIN dependencias de motor
│  │  ├─ LsmEngine.ts          fachada: cámara + detección + clasificador (úsala primero)
│  │  ├─ HandTracker.ts        cámara y MediaPipe (carga, calentamiento, frecuencia, errores)
│  │  ├─ SignClassifier.ts     reglas + k-NN + Z por trayectoria, suavizado e histéresis
│  │  ├─ rules.ts              reglas geométricas por letra (marco de la mano)
│  │  ├─ knn.ts                k vecinos sobre muestras grabadas
│  │  ├─ motion.ts             letras con movimiento (Z)
│  │  ├─ features.ts           normalización de los 21 puntos
│  │  ├─ SpellSession.ts       lógica de un conjuro: ventanas, sostener, teclado, puntuación
│  │  ├─ HoldDetector.ts       seña sostenida en tiempo real (escudo con la U)
│  │  ├─ SampleRecorder.ts     grabadora de muestras k-NN
│  │  ├─ CameraView.ts         vista previa de la cámara (DOM) + esqueleto de la mano
│  │  ├─ letters.ts            letras soportadas, validación de conjuros, formas de mano
│  │  └─ types.ts
│  ├─ adapters/phaser/HandDiagram.ts   (opcional) dibuja la mano de cada letra en Phaser 4
│  └─ data/
│     ├─ letters.json          forma de mano de cada letra (para mostrarla y documentarla)
│     ├─ samples.json          muestras k-NN (vacío al inicio; se llena con la grabadora)
│     └─ SOURCES.md            fuentes de LSM y checklist de verificación humana
├─ public/mediapipe/hand_landmarker.task   modelo (7.5 MB, incluido)
├─ demo/                       página de prueba del módulo SIN juego (npm run dev)
├─ test/                       pruebas sin cámara (npm test)
└─ tools/setup-mediapipe.mjs   copia el WASM de MediaPipe a public/mediapipe/wasm
```

## 2. Probarlo solo (sin juego)

```bash
cd ecos-lsm
npm install
npm test        # pruebas sintéticas: reglas, Z, deletreo, escudo, validación
npm run dev     # página demo en http://localhost:5180 (Chrome o Edge, con cámara)
```

La página demo tiene: lectura en vivo (con medidas en F3), deletreo de cualquier palabra (cámara o teclado), prueba del escudo (U sostenida), grabadora de muestras k-NN y las pruebas sintéticas. **`demo/main.ts` es además el ejemplo de integración de referencia.**

## 3. Estado de las letras (probadas con la cámara del equipo, 2026-10-17)

| Letra | Estado | Notas |
|---|---|---|
| A, B, C, D, E, F | ✅ | E y O se separan por el alcance del índice (gancho ≈1.1 vs arco ≥1.29) |
| G, H | ⚠️ | La L y la U con los dedos **de lado** (forma de la demostración del equipo). La H se confundía con P; se corrigió, **falta volver a probarlas** |
| I, Y | ⚠️ | Antes la I pedía la mano recta y la Y solo salía girada; se corrigió midiendo en el marco de la mano. **Falta volver a probarlas** |
| L | ✅ | |
| M, N | ✅ | Tres / dos dedos **hacia abajo**; el anular se compara con tus propios dedos |
| O | ✅ | También el círculo chico y bajo (pinza firme) |
| P | ✅ | El medio se abre lejos del índice y el pulgar sube entre ellos |
| R | ⚠️ | MediaPipe casi no registra el cruce de dedos y la ve como U. Se separó de la P por la distancia entre puntas (falta volver a probar) y **en un conjuro se acepta** si la R pedida queda en el top 2 (ver §6) |
| S | ✅ | Pulgar bajo, cruzado al frente |
| T | ⚠️ | Pulgar metido entre índice y medio (su punta sube). Hecha con las medidas del equipo; **falta volver a probarla** |
| U, V, W | ✅ | |
| **Z** | ✅ | **Con movimiento**: con el índice se traza → ↘↙ → (de tu derecha a tu izquierda). Se reconoce al terminar el trazo |
| J, K, Ñ, Q, X | ❌ | Con movimiento; el GDD de ECOS las excluye |

Todas las formas siguen marcadas `review: true` hasta que alguien las compare con el abecedario de la SEP (`src/data/SOURCES.md`). Varias se tomaron de demostraciones del equipo con cámara.

Los 6 conjuros de la historia se pueden deletrear con cámara: **CALMA, PROTECCION, LUZ, CONSUELO, MEMORIA, PAZ** (lo verifica `npm test`).

## 4. Integrarlo en el juego (ECOS)

### 4.1 Archivos
1. Copia `ecos-lsm/src/` a **`src/lsm/`** del juego (o a `src/hands/`; solo cambia las rutas de import).
2. Copia `public/mediapipe/hand_landmarker.task` a **`public/mediapipe/`** del juego.
3. Copia `tools/setup-mediapipe.mjs` a `tools/` y agrega a `package.json`:
   ```json
   "predev": "node tools/setup-mediapipe.mjs",
   "prebuild": "node tools/setup-mediapipe.mjs"
   ```
   y la dependencia **`"@mediapipe/tasks-vision": "1.0.1"`** (versión probada). `public/mediapipe/wasm/` se genera solo; ponla en `.gitignore`.
4. `tsconfig.json`: `"resolveJsonModule": true` (las letras y muestras son JSON).
5. **Nunca** cargues MediaPipe desde un CDN (itch.io sin conexión y Electron). Con `base: './'` en Vite, la ruta por defecto `./mediapipe` funciona en web y en el build.

### 4.2 Una sola instancia, creada al arrancar
```ts
import samples from './lsm/data/samples.json';
import { LsmEngine, CameraView } from './lsm';

export const lsm = new LsmEngine({ samples: samples.samples, tolerance: 0.5 });
export const camView = new CameraView(lsm.video);   // vista previa (DOM, encima del canvas)
```

### 4.3 Título y pantalla de cámara
```ts
lsm.preload();                            // en el título: carga el modelo y hace la inferencia de calentamiento (~1.5 s)
const ok = await lsm.enableCamera();      // tras elegir "Con cámara"
if (!ok) mostrarMensaje(`No pudimos usar la cámara (${lsm.errorReason}). Jugarás con teclado.`);
```
Texto de privacidad obligatorio: *"La cámara se procesa en tu equipo; no se graba ni se envía nada."*
`enableCamera()` **nunca lanza**: sin permiso, sin cámara o con la cámara ocupada devuelve `false` y el juego sigue con teclado.

### 4.4 Deletrear un conjuro (GDD 6.2–6.3)
```ts
// al tocar Q con un conjuro NO dominado:
lsm.setMode('spell');                                  // ~18 Hz
const s = lsm.startSpell('CALMA', performance.now(), {
  letterWindowMs: 3000 * (opciones.ventanasLargas ? 1.8 : 1),
});
camView.placeOver(game.canvas, 504, 8, 128, 96, 640, 360);   // esquina superior derecha, 4:3

// en update(), cada cuadro (usa tiempo REAL, no el del juego ralentizado):
const now = performance.now();
if (lsm.cameraReady) lsm.stepSpell(s, now); else s.update(now, null, 0);
ui.letraActual(s.current);  ui.tiempo(s.timeLeft(now));  ui.sostener(s.holdProgress);

// teclado (todas las letras escriben, incluidas WASD/E/Q/X/C/F; GDD nota 6):
onKeyDown(e => s.typeLetter(e.key, performance.now()));   // tecla equivocada = letra fallida

if (s.done) {
  const r = s.result();   // { outcome: 'fail'|'partial'|'perfect', fraction, power, speedRatio }
  lsm.setMode('off');  camView.hide();
  aplicarConjuro(r);       // <50 % falla · 50–99 % fuerza proporcional · 100 % rápido = PERFECTO
}
```
- `SpellSession` normaliza el texto: mayúsculas y **sin acentos** (PROTECCIÓN → PROTECCION).
- La **Z** tiene 1.6× de ventana y no penaliza la rapidez.
- La **maestría** (3 niveles, GDD 6.4) y la ralentización del mundo son del juego: el módulo solo entrega `r.outcome`.

### 4.5 Escudo con la U (GDD 6.5)
```ts
import { HoldDetector } from './lsm';
const shield = new HoldDetector('U', { holdMs: 150, releaseMs: 120 });
// con el escudo desbloqueado y la cámara activa:
lsm.setMode('shield');                       // ~12 Hz, detección continua mientras se juega
// update():
const activo = shield.update(lsm.read(performance.now()), performance.now());
// al empezar a deletrear: shield.suspended = true  (la U aparece en LUZ); al terminar: false
```
- En modo `'shield'` la ayuda de letra objetivo está **apagada** (solo cuenta una U real).
- Sin cámara, el escudo va con la tecla del GDD (Alt izquierdo o clic izquierdo): el módulo no interviene.
- Muestra un indicador de "mano detectada" con `lsm.last?.letter === 'U'`.

### 4.6 Diario de Señas y "cómo se hace"
- `LETTERS[letra]` → `{ desc, orientation, fingers, rotation?, motion? }` para mostrar la explicación.
- Con Phaser 4: `createHandDiagram(scene, x, y, 'C', escala)` (de `adapters/phaser/HandDiagram.ts`) dibuja el esquema por código, girado para G, H, M y N y con la trayectoria para la Z.
- Cuando existan **ilustraciones oficiales verificadas**: carga una textura `lsm_<LETRA>` (48×64) y el adaptador la usa en lugar del esquema.

### 4.7 Validar nombres de conjuros (GDD 6.6)
```ts
import { checkWord } from './lsm';
checkWord('PROTECCIÓN')  // { ok: true, letters: [...10], unsupported: [], tooLong: false }
checkWord('QUESO')       // { ok: false, unsupported: ['Q'] }  → la Q no se usa en ECOS
```
Úsalo al cargar `spells.json` para avisar en consola si un conjuro tiene letras sin soporte o más de 10 letras.

### 4.8 Opciones de accesibilidad
- **Tolerancia** (baja/media/alta) → `lsm.setTolerance(0.15 | 0.5 | 0.9)`.
- **Ventanas largas** → `letterWindowMs` × 1.8.
- **Solo teclado** → no llames `enableCamera()`; `SpellSession` funciona igual con `typeLetter`.

### 4.9 Depuración (F3) y calibración (F9)
- `lsm.explain()` → `{ top, metrics, motion }`: las 3 mejores letras con su puntaje, las medidas de cada dedo y el estado del trazo de la Z. Con capturas de esta información se corrigieron casi todas las letras: pídelas cuando una letra falle.
- `camView.drawLandmarks(lsm.tracker.lastFrame)` dibuja los 21 puntos.
- `lsm.stats()` → Hz reales de detección y latencia (para `REPORTE_DEMO.md`).
- **k-NN:** con `SampleRecorder` (o la página demo) graba ~30 muestras por letra con 2 o 3 personas y guarda el JSON en `src/lsm/data/samples.json`. Si una letra tiene muestras, **durante un conjuro esa letra se decide por k-NN** en lugar de reglas.

### 4.10 Electron (al final)
- Con `file://`, Chromium puede bloquear la carga del WASM y del modelo: sirve `dist/` con un protocolo propio (`protocol.handle`) o un servidor local dentro de Electron.
- Concede el permiso de cámara con `session.setPermissionRequestHandler` (solo `media`).
- Haz la prueba de humo del .exe **con la cámara** antes de la entrega.

## 5. Rendimiento medido
| Medida | Valor |
|---|---|
| Crear el detector (modelo en caché) | ~0.2 s |
| Primera inferencia (por eso el calentamiento en el título) | ~1.6 s |
| Inferencia promedio (GPU, cuadro 640×480) | ~19 ms |
| JS de la página demo (módulo + MediaPipe) | 175 KB (55 KB gzip) |
| Modelo + WASM (SIMD y no SIMD) | ~29 MB |

Con `setMode('off')` el costo es cero. En modo `'shield'` (12 Hz) la detección corre todo el tiempo: **mide los FPS en la PC objetivo** (F3).

## 6. Cómo funciona (para quien lo modifique)
1. **HandTracker** entrega 21 puntos por cuadro. El video llega **sin espejo** a MediaPipe; con eso MediaPipe reporta la **mano real** (corregido con la cámara del equipo).
2. **features.ts** normaliza: relativo a la muñeca, escalado por el largo de la palma y con la mano derecha reflejada (las dos manos quedan en el mismo marco).
3. **rules.ts** mide **en el marco de la propia mano** (ejes muñeca→dedo medio y meñique→índice), así que inclinar o girar la mano no cambia el resultado. Solo dos medidas usan el marco de la imagen: si el índice apunta **de lado** (G, H) o **hacia abajo** (M, N). Cada letra se puntúa con lógica difusa (0–1); los umbrales están comentados con los valores reales de la cámara del equipo.
4. **SignClassifier**:
   1. Elige la estrategia: k-NN si hay muestras de la letra pedida, si no, reglas.
   2. Suaviza ~350 ms.
   3. Aplica histéresis y una gracia de 150 ms.
   4. Reporta `stableMs`, que la sesión usa para "sostener 300 ms".
   - **Ayuda con la letra objetivo:** en conjuros, si la letra pedida queda en el top 2 de las reglas con un puntaje razonable, se acepta. Nunca deja pasar una seña muy distinta.
5. **motion.ts (Z):**
   1. Mientras la mano "apunta" (medio, anular y meñique doblados), sigue un punto cargado al nudillo del índice.
   2. Simplifica el trazo con Ramer-Douglas-Peucker.
   3. Busca → ↘↙ → visto desde quien seña.
   - Al reconocerla, la reporta como ya sostenida.

## 7. Pruebas
`npm test` (Node, sin cámara):
- **reglas:** 29 casos (20 letras estáticas y variantes; la D no tiene caso sintético, solo se probó con cámara) × 6 posturas × 2 manos = 348 manos sintéticas, en 3 tolerancias;
- **trayectorias de la Z:** 12 casos, incluidos rechazos (línea, círculo, Z al revés);
- **SpellSession, HoldDetector y validación de conjuros.**

Las manos sintéticas detectan **errores de lógica y de orientación**, no la precisión real: esa se mide con la demo y la cámara. Si cambias una regla, corre `npm test` y prueba la letra con F3.

## 8. Limitaciones y pendientes
- **R** fuera de conjuros puede leerse como U (límite de MediaPipe con dedos cruzados).
- **Verificación humana** de todas las formas contra la SEP (`SOURCES.md`); idealmente, revisión de alguien de la comunidad sorda.
- La precisión depende de la luz y de que la mano quede completa en cuadro.

## 9. Licencias y fuentes
- **MediaPipe Tasks Vision** y el modelo `hand_landmarker.task`: Google, licencia **Apache 2.0**. Inclúyelo en los créditos.
- Fuentes de LSM: `src/data/SOURCES.md`.
- Código: Listick Games, hecho con ayuda de IA (Claude Code), registrado en `AI_LOG.md` del proyecto. Decláralo en itch.io.
