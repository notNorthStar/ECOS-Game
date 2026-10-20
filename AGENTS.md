# AGENTS.md — ECOS (Listick Games · Game Jam ANIEI 2026)

> Contexto común para **todas las IAs** que trabajen en este proyecto (Claude Code y otras).
> Léelo completo antes de escribir código o generar assets. Comunícate con el equipo **en español**.
> Si algo contradice una instrucción directa del equipo, gana el equipo; luego actualiza el documento correspondiente.

## 0. Fuentes de verdad (léelas)

| Documento | Qué define | Regla |
|---|---|---|
| `docs/GDD_ECOS.md` | **Cómo se juega**: vista, controles, mecánicas, progresión, enemigos, arte, interfaz | Fuente oficial del diseño |
| `docs/NDD_v2.md` | **La historia** completa (3 actos, 10 niveles) | **Definitiva. No modificar ni "mejorar" la historia** |
| `docs/NIVELES_ECOS.md` | **Tabla de niveles**: secciones, conjuros, afinidades, enemigos, jefes, Ecos, música, assets y duración de cada nivel | Lo marcado `[PROPUESTA]` lo puede cambiar el equipo; lo demás viene del NDD |
| `docs/IDEAS_ACTUALIZACION.md` | Nuevas ideas de actualización solicitadas por el equipo, separadas del estado jugable | ACT-N2-001: alargar N2, dispersar estrofas y añadir Chaneques Mayores en 2 y 5. Registrada; pendiente de implementación |
| `docs/referencias/worlorn/` | **Vista, movimiento, atmósfera y calidad objetivo** (HTML jugable + capturas) | Abre el HTML y júgalo antes de empezar |
| `docs/referencias/estilo_protagonista.png` | Estilo y proporción de personajes | Guía de estilo, no es un asset |
| `docs/MODULO_LSM.md` + carpeta `ecos-lsm/` | **Detección de LSM con la cámara: módulo ya hecho y probado**, cómo integrarlo y sus límites | **No lo reescribas: intégralo** (sección 7.1) |
| `docs/ASSETS.md` | **Dónde va cada asset** (sprites, fondos, música, efectos, fuentes), nombres, formatos, tamaños y licencias | **Nunca sobrescribas assets del equipo** (§8) |
| `CREDITOS.md` | Créditos y licencias de todo lo de terceros | Se actualiza en el mismo commit en que se agrega algo de terceros |
| Este archivo | Reglas técnicas, alcance de la sesión y forma de trabajar | |

**Repositorio:** https://github.com/notNorthStar/ECOS-Game (rama `main`). El equipo sube ahí código y **assets**: antes de crear algo, revisa si ya existe en `public/assets/`.

Si el GDD y este archivo se contradicen en diseño, **gana el GDD**; en temas técnicos o de proceso, gana este archivo. Lo marcado `[PROPUESTA — CONFIRMAR]` en el GDD se implementa como está, pero **configurable**, y se avisa al equipo.

---

## 1. Resumen

**ECOS** es un juego de **exploración y acción 2D de desplazamiento lateral con profundidad**, en pixel art, en un México retrofuturista colapsado. El protagonista, hijo de una criptógrafa sorda que lo crió en **Lengua de Señas Mexicana (LSM)**, lanza conjuros **deletreando en LSM** con la **cámara web** (MediaPipe) o con el **teclado**, purifica a los seres del folclor y combate a la Cofradía del Espejo Negro.

**Cómo se trabaja:** el juego se desarrolla **por niveles**, uno por sesión o por hito. El nivel en curso y el estado de todos están en la sección 5.
**Trabajo autorizado en curso (2026-10-19), una rama por nivel:**
- **Nivel 2, "San Andrés Tuxtla — La música perdida"** → `codex/nivel-2-san-andres-tuxtla` (ajustes y jugabilidad). Ver `docs/NIVEL_02.md`.
- **Nivel 3, "Catemaco — El ritual del lago"** → `nivel-3-catemaco` (sale de la rama del Nivel 2; trae sus cambios cuando se suban). Ver `docs/NIVEL_03.md` y `docs/NIVEL_03_CONTRATOS.md`.
- **Nivel 4, "Oaxaca — Los tejidos de la memoria"** → `nivel-4-oaxaca` (sale de la del Nivel 3). Ver `docs/NIVEL_04.md` y `docs/NIVEL_04_CONTRATOS.md`.
- **Nivel 6, "CDMX parte 1 — De la Isla de las Muñecas a Reforma"** → `nivel-6-cdmx` (sale de la del Nivel 4; Oaxaca ya continúa a la CDMX). Ver `docs/NIVEL_06.md` y `docs/NIVEL_06_CONTRATOS.md`.
- **Nivel 1 en `main`:** el equipo integra los assets reales (otra IA, en un clon aparte); correcciones mínimas en archivos compartidos.
- No hagas merges entre ramas ni a `main` sin autorización explícita del equipo. El alcance original del jam era el Nivel 1; la continuación se trabaja por indicación del equipo.

**⚠️ DECISIÓN DE ALCANCE (2026-10-19): el Nivel 5 (Puebla) NO se implementa por falta de tiempo.** El juego salta de **Oaxaca (Nivel 4)** directamente a **CDMX (Nivel 6)**. No dediques tiempo a Puebla (senderos, rueda caída, Fuertes, la Nahuala). El NDD no se modifica: Puebla queda como parte de la visión, no del juego jugable. **Lo que Puebla entregaba se reubica así (decidido por el equipo):**
- **3.er fragmento del Sello → Oaxaca:** al vencer a la Bruja Guajolote se obtienen el 2.º **y** el 3.er fragmento (3 de 6). Ya implementado (flags `n04:fragmento` y `n04:fragmento_3`).
- **Doble salto → CDMX:** se desbloquea en los Altares de la Memoria a partir de CDMX.
- **VERDAD y FUEGO → CDMX:** se aprenden en CDMX (los necesitan los nahuales infiltrados y la corona del Rey del Olvido).
- **Desesperación creciente de María → CDMX:** sus diálogos de Puebla pasan a CDMX.
- **Encapuchados Negros:** se presentan en CDMX (ya figuraban en su ficha).
La salida de Oaxaca debe llevar a CDMX (`Campaign.prepare…Entry`), no a Puebla.

**Última actualización de contexto (2026-10-19):** el equipo pidió registrar como nueva idea de actualización la ampliación del Nivel 2, mayor dispersión de los cinco fragmentos musicales y un Chaneque Mayor en los fragmentos 2 (`monte`) y 5 (`memoria`). Se documentó en `docs/IDEAS_ACTUALIZACION.md` como ACT-N2-001; aún no cambia la implementación ni el NDD.

---

## 2. El jam y sus reglas (afectan al código y al arte)

- Convocatoria: https://www.aniei.org.mx/eventos-aniei/congreso-nacional-e-internacional/09-game-jam-aniei-2026/ · Jam: https://itch.io/jam/aniei-game-jam-2026
- **Tema:** "Cultura, identidad y patrimonio". La cultura debe estar **en la mecánica**, no solo en el arte.
- **Entregables:** juego en itch.io + **ejecutable de Windows** + video de 3 minutos máximo + ficha técnica + página con créditos, licencias, **declaración de uso de IA** y relación con el tema.
- **Fecha de entrega:** `[PENDIENTE — el equipo la confirmará]`.
- **Reglas clave:**
  - IA y herramientas permitidas **si se declaran** → mantener `AI_LOG.md` (sección 12).
  - Nada de plantillas o assets sin modificar.
  - Assets de terceros solo con licencia y créditos → registrarlos en `CREDITOS.md`.
  - El Comité puede pedir evidencia del proceso → **commits pequeños y frecuentes en español**.
  - **Sin violencia gráfica:** nada de sangre ni gore. Los seres del folclor se purifican; los cultistas quedan inconscientes o desaparecen en humo; las muñecas se rompen.
  - **El juego debe poder terminarse sin cámara.**
- **Calificación:** tema 20 · creatividad 20 · diseño/UX 20 · técnica 15 · arte/sonido/narrativa 10 · accesibilidad 5 · documentación 5 · Demo Day 5. **Desempate: calidad de la mecánica principal.**

---

## 3. Vista y física: "TAL CUAL WORLORN" (crítico)

- **Perspectiva de desplazamiento lateral con profundidad** (*belt-scroller*): el suelo es una **franja transitable**. **A/D = a lo ancho, W/S = profundidad**, exactamente como en `docs/referencias/worlorn/worlorn_referencia.html`.
- **No es un plataformero.** No uses Arcade Physics con gravedad sobre tiles para el movimiento principal. Modelo recomendado:
  - posición en el suelo **(x, y)** dentro de áreas transitables (polígonos o máscaras de colisión);
  - **altura de salto z** independiente, con su propia gravedad;
  - el sprite se dibuja en `(x, y − z)` y **la sombra en `(x, y)`**;
  - **orden por profundidad** usando `y` (depth = y).
- **Colisiones:** obstáculos con forma de **elipse o rectángulo en el plano del suelo** (como el lago y las columnas de Worlorn). Golpes y disparos solo conectan si la diferencia de profundidad `|Δy|` es menor a una tolerancia (~8–12 px).
- **Cámara** con seguimiento suave y límites; **parallax de 5 a 6 capas**; niebla, partículas, reflejos, luces que laten, viñeta y nombres de zona. Igualar o superar la atmósfera y la calidad de Worlorn.
- **Verticalidad** (GDD 2.2, `[PROPUESTA — CONFIRMAR]`): planos a distintas alturas conectados por escaleras, rampas o elevadores; tramos con desplazamiento vertical; bordes bajos que se suben saltando.
- **El juego se construye desde cero.** Existió una demo anterior hecha como plataformero ("Parque Juárez", 2026-10-16/17), pero fue **solo una prueba del sistema de detección** y **se descartó**: no la busques ni la adaptes. **Lo único que se reutiliza es el módulo `ecos-lsm/`** (sección 7.1).

---

## 4. Controles (resumen; el detalle está en el GDD, sección 3)

| Acción | Tecla |
|---|---|
| Moverse | **WASD** (4 direcciones) |
| Saltar | **Espacio** (doble salto desbloqueable) |
| Correr | **Shift** mantenido |
| Esquivar | **Doble Shift** (~250 ms entre toques); **C** como alternativa |
| Disparar | **Clic izquierdo** o **X** |
| Láser verde (aturdidor) / rojo (daño) | **1** / **2** |
| Interactuar | **E** |
| Conjuro: lanzar / rueda | **Q** toque / **Q** mantener (umbral **200 ms**) |
| Habilidad Luna | **F** |
| Escudo sin cámara | **Clic derecho** mantenido (decidido 2026-10-19: Alt+Espacio abre el menú de Windows y no se puede bloquear) |
| Diario de Señas | **Tab** |
| Pausa | **Esc** |

**Requisitos técnicos de entrada:**
- Todas las teclas en `src/config/controls.ts`, para poder reasignarlas.
- Bloquear el menú contextual (clic derecho), el comportamiento de **Tab** y de **Alt** (`keydown` y `keyup`), y combinaciones Alt + letra (Alt+D, Alt+F).
- **Nunca usar Ctrl.** Ctrl+W cierra la pestaña y no se puede bloquear.
- **Alt+Espacio** abre el menú de ventana de Windows y no se puede bloquear: prueba escudo + salto. Si molesta, cambia el escudo a clic derecho y repórtalo.
- Al salir de pantalla completa con **Esc**, pausar (`fullscreenchange`).
- **Mientras se deletrea un conjuro con teclado, todas las letras escriben**, y el movimiento y las demás acciones quedan suspendidos.
- Doble Shift: Windows abre "Teclas especiales" con 5 Shift seguidos. Mantén **C** como alternativa y añade el aviso en el menú de controles.

---

## 5. Niveles: estado y alcance de la sesión

### 5.1 Estado de los niveles
**Al iniciar cada sesión, el equipo indica qué nivel toca. Al cerrarla, actualiza esta tabla.** El detalle de cada nivel (secciones, enemigos, jefe, conjuros, Ecos, música, assets) está en **`docs/NIVELES_ECOS.md` §4**. Las afinidades de conjuros por jefe están en el §3.

| # | Nivel | Estado | Notas |
|---|---|---|---|
| 1 | Xalapa: el misterio del Parque Juárez | **🔨 Jugable de principio a fin (2026-10-19)** | Taller → calles → altar → parque (2 arenas) → PROTECCION → jefe → antena → busto → final. Arte generado (placeholders) esperando el del equipo; falta probar con cámara, pulido y .exe. Arquitectura: `docs/ARQUITECTURA.md` |
| 2 | San Andrés Tuxtla: la música perdida | 🔨 Primer hito + segunda pasada visual (2026-10-19) | Rama separada: cinco estrofas, fandango por capas, VOZ, primer fragmento, altar y conexión desde Xalapa. Seis PNG parallax con paleta oficial y decorado detallado regenerado. TypeScript, build y 14 pruebas correctos; revisión parcial en navegador. Pendientes partida completa, cámara, revisión de arte y equilibrio. Ver docs/NIVEL_02.md |
| 3 | Catemaco: el ritual del lago | 🔨 Jugable de principio a fin (2026-10-19) | Rama `nivel-3-catemaco`: brujos (LUZ, SOL, escudo U con clic derecho) → lago y campamento (9 encapuchados, 6 pistas, jaulas) → Balam + Luna (F) → 8 espíritus → Cabeza Olmeca (3 fases) → María. Personajes importantes con placeholder (§8.0). 25 pruebas (`npm run test:nivel3`). Pendientes: cámara, equilibrio, salida a Oaxaca. Ver `docs/NIVEL_03.md` y `docs/NIVEL_03_CONTRATOS.md` |
| 4 | Oaxaca: los tejidos de la memoria | 🔨 Jugable de principio a fin (2026-10-19) | Rama `nivel-4-oaxaca` (sale del Nivel 3; Catemaco ya continúa a Oaxaca): calles + 3 artesanos (MEMORIA) → callejones (bestias, pasaje oculto) → Santo Domingo → Bruja Guajolote (humana/ave) → 2.º fragmento. María acompaña y ayuda en combate (lamento). 26 pruebas (`npm run test:nivel4`). Pendientes: cámara, equilibrio, salida a CDMX. Ver `docs/NIVEL_04.md` y `docs/NIVEL_04_CONTRATOS.md` |
| 5 | Puebla: de la rueda caída a los Fuertes | ⏭️ **Se omite** (decisión del equipo, 2026-10-19) | No se implementa por tiempo; Oaxaca salta directo a CDMX. Su 3.er fragmento se da en Oaxaca; doble salto, VERDAD, FUEGO, Encapuchados Negros y los diálogos de María pasan a CDMX. Ver la nota al inicio de este archivo |
| 6 | CDMX 1: Isla de las Muñecas a Reforma | 🔨 Jugable de principio a fin (2026-10-19) — rama `nivel-6-cdmx` | Nahuales infiltrados. Se llega desde Oaxaca. **Además recibe de Puebla:** VERDAD y FUEGO, doble salto en los altares, Encapuchados Negros y la desesperación de María |
| 7 | CDMX 2: teleférico, Rey del Olvido y Llorona | ⬜ Visión | Secuencia CONSUELO → MEMORIA → PAZ |
| 8 | Guanajuato: minas y Calle del Truco | ⬜ Visión | |
| 9 | Jalisco: haciendas y Panteón de Belén | ⬜ Visión | |
| 10 | Guadalajara: la trampa y el eclipse final | ⬜ Visión | Secuencias ECOS y MAMA |

Estados: ⬜ visión (solo diseño) · 🔨 en curso · ✅ jugable y pulido · ⏭️ se omite en el juego (sigue en la historia).

**Reglas al cambiar de nivel:**
- Reutiliza los sistemas y assets de los niveles anteriores (tabla de reutilización en `NIVELES_ECOS.md` §6). Un nivel nuevo es, sobre todo, **datos nuevos**: mapa, enemigos, diálogos, conjuros y afinidades en JSON.
- Los conjuros nuevos se validan con `checkWord()` del módulo LSM. El catálogo completo ya está validado.
- Lo marcado `[PROPUESTA]` en `NIVELES_ECOS.md` se implementa como está, pero configurable, y se avisa al equipo.

### 5.2 Alcance del nivel en curso: Nivel 1, Xalapa

Basado en `docs/NDD_v2.md` y `docs/NIVELES_ECOS.md` §4 (Nivel 1). Si el orden de las secciones difiere, manda `NIVELES_ECOS.md`: **CALMA** se aprende en el taller y **PROTECCION** antes del jefe. Secuencia jugable:
1. **Título "ECOS"** + configuración de cámara (activar o solo teclado) + texto de privacidad.
2. **Taller de la madre (de noche, revuelto):** intro corta; el jugador **encuentra la pistola láser** (herramienta de soldar con intensidad ajustable) → tutorial de movimiento, salto, esquiva, modos verde y rojo y disparo. La gema proyecta un **rastro de luz** hacia el Parque Juárez.
3. **Calles de Xalapa → Parque Juárez con niebla:** **letras turísticas "XALAPA"** oxidadas como checkpoint con **Altar de la Memoria**. Chaneques alterados en grupos, primeros encuentros tipo arena.
4. **Aprender los primeros conjuros** (*Protección* y *Calma*) interactuando con algo del mundo: la primera vez con el tiempo **muy** ralentizado y explicación guiada.
5. **Dispositivo de resonancia de la Cofradía** (antena) en el parque.
6. **Jefe: el Chaneque Mayor**, corrompido por la antena. Se calma con conjuros en sus ventanas de vulnerabilidad; después se destruye el dispositivo.
7. **Busto de Benito Juárez:** el jugador desentierra el **Códice de las Voces** con el mapa.
8. **Pantalla de carga** (auto compartido con estudiantes rumbo a Los Tuxtlas) → "**Continuará**" con el mapa de la ruta de los 10 niveles.

**Fuera del Nivel 1:** Balam y la Habilidad Luna, el escudo, María, la Cofradía como enemigo jugable (solo aparece en la historia), los niveles 2 a 10 y Electron (solo al final). **Pero deja la arquitectura preparada** para Luna, el escudo y la Cofradía: sistemas desacoplados y datos en JSON.

---

## 6. Mecánicas a implementar en el Nivel 1 (detalle en el GDD)

- **Movimiento** (GDD 2–3): caminar, correr, saltar en z con sombra, esquiva con invulnerabilidad breve, colisiones en el plano.
- **Láser** (GDD 4): verde aturde y rojo daña; disparo horizontal hacia donde mira el personaje, válido corriendo y en el aire; calentamiento `[PROPUESTA — CONFIRMAR]`.
- **Combate y vida** (GDD 5): todos los enemigos hacen daño; retroceso e invulnerabilidad breve; **muerte → último checkpoint**, sin perder Ecos.
- **Conjuros en LSM** (GDD 6):
  - aprenderlos en el mundo;
  - rueda con Q mantenido y lanzamiento con Q tocado;
  - deletreo con cámara (sostener ~300 ms por letra) o teclado;
  - puntuación: menos del 50 % falla, 50–99 % proporcional, 100 % rápido "PERFECTO";
  - **3 niveles de maestría**; al dominarlo se lanza en automático;
  - afinidades por enemigo.
- **Letras permitidas de LSM:** **A B C D E F G H I L M N O P R S T U V W Y Z** (la Z lleva movimiento pero el detector del equipo la reconoce). **No usar J, K, Ñ, Q ni X.** Se ignoran acentos. Máximo 10 letras por conjuro. Valida cada nombre con `checkWord()` del módulo `ecos-lsm`.
- **Ecos y Altares de la Memoria** (GDD 5.1):
  - experiencia por enemigo, +50 % al purificar y +25 % con "PERFECTO";
  - partículas que vuelan al jugador;
  - altar en el checkpoint de las letras turísticas, que restaura la vida;
  - mejoras de Vida, Daño y Velocidad;
  - la meta es ~300 Ecos al terminar el Nivel 1;
  - valores en `src/data/progression.json`.
- **Exploración:** interactuar (E), rastro de luz de la gema, **Diario de Señas** (Tab), diálogos desde JSON.
- **Enemigos:**
  - **Chaneque:** grupos de 3 a 6, comportamientos variados y travesuras; al bajarle la vida queda "agotado" y se **purifica** con un conjuro.
  - **Chaneque Mayor:** 2 fases y ataques anunciados.
- **Interfaz:** HUD (vida, calor y modo del láser, conjuro seleccionado con su maestría, Ecos, gema), rueda de conjuros, diario, altar, pausa y opciones de volumen, cámara y accesibilidad.
- **Jugo:** sacudida, pausa breve al golpear, partículas, destellos y sonido, todo reducible.

---

## 7. Stack técnico (decidido)

| Pieza | Elección |
|---|---|
| Motor | **Phaser 4** (última estable en npm; si da problemas serios, la última 3.x y explica por qué) |
| Lenguaje y herramientas | **TypeScript estricto + Vite** (`base: './'`) |
| Física | **Propia, de vista con profundidad** (sección 3). Puedes usar Arcade solo para solapamientos u hitboxes, no para la gravedad del suelo |
| Niveles | **Tiled** (JSON) para colocar capas, áreas transitables, obstáculos, objetos, checkpoints y puntos de aparición; o definición en JSON propio si es más simple. Documéntalo |
| Manos | **MediaPipe Tasks Vision** `HandLandmarker`, con modelo y WASM **locales** en `public/mediapipe/` (nunca CDN) |
| Datos | JSON en `src/data/`: conjuros, enemigos, diálogos, progresión, niveles |
| Escritorio | **Electron + electron-builder solo al final.** Sin CDN, rutas relativas |
| Pruebas | Windows, Chrome y Edge, con cámara web (PC del líder) |

### 7.1 Detección de manos: módulo `ecos-lsm` (YA HECHO — intégralo, no lo reescribas)

La detección de LSM **ya existe, está probada con la cámara del equipo y viene en la carpeta `ecos-lsm/`**. Se construyó y calibró letra por letra en una demo previa (2026-10-16/17). **Guía completa: `docs/MODULO_LSM.md`** (resumen aquí) y `ecos-lsm/README.md` (referencia de la API).

**Qué hace:**
- Reconoce **A B C D E F G H I L M N O P R S T U V W Y** (estáticas) y la **Z** (por trayectoria).
- Resuelve el deletreo de conjuros: ventanas por letra, sostener 300 ms, teclado, puntuación fallo/parcial/PERFECTO.
- Detecta la **U sostenida para el escudo** y valida nombres de conjuros.
- Muestra la cámara en una esquina y graba muestras k-NN.
- **Sin dependencias de Phaser** (solo un adaptador opcional para dibujar la mano).

**Cómo se integra:**
1. Copia `ecos-lsm/src/` → **`src/lsm/`**.
2. Copia `ecos-lsm/public/mediapipe/hand_landmarker.task` → `public/mediapipe/`.
3. Copia `ecos-lsm/tools/setup-mediapipe.mjs` → `tools/` (scripts `predev`/`prebuild`).
4. Dependencia **`@mediapipe/tasks-vision@1.0.1`** (versión probada) y `resolveJsonModule: true`.
5. **Una sola instancia** de `LsmEngine`, creada al arrancar:
   - `lsm.preload()` en el título;
   - `await lsm.enableCamera()` tras elegir "Con cámara" (nunca lanza; `false` → teclado);
   - `lsm.setMode('spell' | 'shield' | 'off')` según el momento.
6. **Conjuro:**
   - `const s = lsm.startSpell(nombre, performance.now(), opciones)`;
   - cada cuadro `lsm.stepSpell(s, performance.now())` (usa **tiempo real**, no el del juego ralentizado);
   - teclado: `s.typeLetter(e.key, now)`;
   - al terminar, `s.result().outcome` es `'fail' | 'partial' | 'perfect'`.
   - **La maestría (3 niveles), la rueda, la ralentización y los efectos son del juego.**
7. **Escudo:**
   - `new HoldDetector('U', { holdMs: 150 })` con `lsm.setMode('shield')` (~12 Hz);
   - `suspended = true` mientras se deletrea (la U aparece en LUZ).
8. **Vista de cámara:** `CameraView.placeOver(canvas, x, y, w, h, 640, 360)` en proporción 4:3.
9. **F3:** `lsm.explain()` muestra las 3 mejores letras con su puntaje y las medidas de cada dedo. **Cuando una letra falle, pide al equipo una captura con F3**: así se calibró todo.

**Reglas al tocar el módulo:**
- **No cambies umbrales a ciegas**: están comentados con los valores reales medidos con la cámara del equipo.
- Después de cualquier cambio: **`npm test`** dentro de `ecos-lsm/` (manos y trayectorias sintéticas: deben pasar todas) y prueba la letra con la cámara.
- La página **`ecos-lsm/demo`** (`npm run dev` en esa carpeta) prueba el módulo sin el juego.
- **No inventes formas de mano.** Fuentes en `src/lsm/data/SOURCES.md`; todas las letras siguen pendientes de verificación humana con la SEP.

**Límites conocidos:**
- **R** fuera de un conjuro puede leerse como U: MediaPipe casi no registra el cruce de dedos. Dentro del conjuro la acepta la ayuda de "letra objetivo en el top 2".
- G, H, I, Y, T y la separación P/R se corrigieron al final: **vuelve a probarlas con la cámara**.
- Frecuencia: ~18 Hz en conjuros y ~12 Hz en escudo; `'off'` cuesta cero. Inferencia de ~19 ms (GPU). **Mide los FPS con el escudo activo.**
- Sin permiso o sin cámara → teclado, sin errores, con un mensaje amable. Texto de privacidad visible.
- **Electron:** con `file://` el WASM puede no cargar. Sirve `dist/` con un protocolo propio o un servidor local y concede el permiso de cámara (`setPermissionRequestHandler`).

---

## 8. Especificación de arte

### 8.0 Quién diseña a los personajes (regla para TODAS las IAs y subagentes, 2026-10-19)

**El arte final de los personajes importantes lo hace el equipo.** Al diseñar o implementar cualquier nivel:

| Tipo de personaje | Qué hace la IA |
|---|---|
| **Protagonista, enemigos, aliados y jefes** (chaneques, Chaneque Mayor, encapuchados, Balam, María, la madre, Bruja Guajolote, etc.) | **NO dediques tiempo a diseñarlos.** Usa un **placeholder simple** (silueta o bloque con color e inicial) con las **medidas finales** del kit del equipo y el nombre de archivo correcto. El equipo los entrega como carpetas del kit en `public/assets/sprites/personajes/<id>/` y el juego los toma solos (ver su `LEEME.md`) |
| **NPCs comunes con los que se interactúa** (músicos, pobladores, vendedores, brujos que solo hablan) | **Sí diséñalos** con cuidado y en el estilo del juego: puede que el equipo no alcance a hacerlos |
| Escenarios, props, efectos, interfaz | Sí, como hasta ahora (placeholders reemplazables con buena calidad) |

Si dudas en qué grupo cae un personaje, trátalo como importante (placeholder) y pregunta al equipo.

**Estándar de medidas de personajes (kit del equipo, manda sobre lo de abajo):** humanoide en cuadro **64×80**, pivote **(32, 78)**, ~72 px de alto; humanoide bajo (chaneque) 50–60 px; criatura mediana 30–45 px; criatura grande (jaguar) 55–64 px; jefe hasta 120 px. Alpha 0/255, máx. 32 colores por personaje. Detalle: `ART_SPEC.md`.

**Referencias obligatorias:** Worlorn (vista y atmósfera) + `estilo_protagonista.png` (personajes).
**Valores a validar con placeholders en el juego:**
- **Resolución base 640×360**, con escalado entero y `pixelArt: true`.
- Personajes: ver el estándar del kit arriba (los valores originales de 64×64 quedaron reemplazados). Contorno de 1 px de color (no negro), 2–3 tonos por material, luz desde arriba a la izquierda y sombra elíptica.
- **Vista principal de lado**; frente y espalda solo para retratos.
- **Animaciones del protagonista:** reposo, caminar, correr, saltar (subida, caída, aterrizaje), esquivar, disparar (de pie, corriendo, en el aire), lanzar conjuro, recibir daño, morir, interactuar y subir escaleras.
- **Paleta** global de 48–64 colores, partiendo de la del protagonista y ampliada con el retrofuturismo mexicano (niebla verde de Xalapa, cantera, neón cálido, rosa mexicano, turquesa).
- **Parallax** de 5–6 capas. Ancho de cada capa = ancho de pantalla + (ancho del nivel − ancho de pantalla) × factor.
- **Láseres:** verde y rojo con brillo y partículas distintas. **Letras turísticas** como asset reutilizable. **Encapuchados** con recolor.

**Entregables:**
1. **`ART_SPEC.md`**: medidas finales, lista completa de assets del Nivel 1 con nombre de archivo, tamaño, cuadros y prioridad, y reglas de estilo. Debe poder entregarse tal cual a quien dibuja y a otras IAs. Incluye la nota de que las IAs de imagen son malas para animaciones consistentes: pocas poses clave, retoque a mano y animación por código.
2. **`art-templates/`**: plantillas PNG del tamaño exacto con cuadrícula, línea de pies y silueta.
3. **Placeholders** con las medidas y nombres finales, y un manifiesto de assets en JSON: **reemplazar el PNG = arte nuevo en el juego sin tocar código**.
   - Rutas y nombres según **`docs/ASSETS.md`**: `public/assets/sprites/…`, `escenarios/nivel-NN-…/`, `audio/…`.
   - **Un placeholder se crea SOLO si no existe un archivo con ese nombre.** Jamás sobrescribas ni borres un asset que subió el equipo. Si no cumple las medidas, avísalo.
   - Distingue los placeholders del arte del equipo (por ejemplo, regístralos en el manifiesto con `"placeholder": true`), para saber qué falta producir.
4. **`tools/pixelize`**: script para convertir imágenes de IA en pixel art (quitar fondo, reducir por vecino más cercano, cuantizar a la paleta oficial, cuadrícula correcta).

**Pídele al equipo que valide los tamaños en cuanto existan los placeholders**, y entrega `ART_SPEC.md` lo antes posible, aunque el resto no esté listo.

---

## 9. Estructura del repositorio

Lo que **ya existe** en el repo está marcado con ✔. El proyecto de Vite (`package.json`, `index.html`, `src/`, `tools/`…) se crea **en la raíz** en la primera sesión de desarrollo.
```
/  ✔ AGENTS.md · ✔ CLAUDE.md (@AGENTS.md) · ✔ AI_LOG.md · ✔ CREDITOS.md · ✔ README.md
   ART_SPEC.md · REPORTE_DEMO.md · package.json · index.html · vite.config.ts   ← los crea el desarrollo
docs/            ✔ GDD_ECOS.md · ✔ NDD_v2.md · ✔ NIVELES_ECOS.md · ✔ MODULO_LSM.md · ✔ ASSETS.md · ✔ referencias/
ecos-lsm/        ✔ módulo de LSM con su demo y sus pruebas (npm test); mantenlo sincronizado si cambias src/lsm/
public/
  mediapipe/     hand_landmarker.task (copiar de ecos-lsm/) · wasm/ (generado, no se versiona)
  assets/        ✔ árbol de carpetas listo para el equipo (sprites, escenarios, ui, lsm, audio, fuentes, mapas). Ver docs/ASSETS.md
arte-fuente/     ✔ concept, editables, salidas crudas de IA, audio de trabajo (NO lo carga el juego)
art-templates/   tools/   ← los crea el desarrollo (§8)
src/
  config/        game.ts · controls.ts
  scenes/        Boot, Preload, Title, CameraSetup, Taller, ParqueJuarez, HUD, Pause, SpellWheel, Diario, Altar, Loading, DemoEnd
  world/         movimiento en profundidad (x, y, z), áreas transitables, colisiones en el plano, orden por profundidad
  entities/      Player, Chaneque, ChanequeMayor, LaserShot, EcoOrb, Checkpoint
  systems/       Casting, Mastery, Progression, Dialogue, Input, Interact, LightTrail
  lsm/           ← copia de ecos-lsm/src/ (LsmEngine, SpellSession, HoldDetector, CameraView, data/letters.json, data/samples.json…). Sin Phaser
  data/          spells.json, enemies.json, progression.json, dialogue/
  ui/
```

## 10. Forma de trabajar
1. **Primero un plan corto** por hitos, con estimación; espera la aprobación del equipo.
2. **Orden:**
   1. Movimiento con profundidad, cámara y parallax: que se sienta como Worlorn.
   2. Conjuros en LSM con cámara y teclado: **integrar el módulo `ecos-lsm`** (§7.1). Rueda, maestría y efectos van del lado del juego.
   3. Láser y combate con chaneques.
   4. Ecos y altar.
   5. Nivel completo: taller → parque → jefe → busto.
   6. `ART_SPEC.md`, plantillas y `pixelize` (en paralelo en cuanto los tamaños estén validados).
   7. Pulido.
   8. Build web.
3. **Git (repo compartido con el equipo):**
   - **`git pull` antes de empezar** y antes de cada `push`: el equipo sube assets por la web en cualquier momento.
   - Commits pequeños y frecuentes **en español**; `git push` regularmente.
   - Nunca uses `push --force` sobre `main` ni reescribas historial ya subido.
   - Si un `pull` trae assets nuevos, revisa que el juego los cargue (nombres según `docs/ASSETS.md`).
4. **No inventes APIs**; consulta la documentación oficial de Phaser, MediaPipe y Tiled.
5. Todos los valores ajustables (velocidades, tiempos, daños, Ecos, costos) en archivos de configuración o JSON.
6. Antes de que se cierre la sesión: termina el paso actual, haz commit, **actualiza la tabla de estado de niveles (§5.1)** e indica dónde te quedaste.
7. Antes de la entrega: **prueba de humo del .exe con Electron y la cámara**.

## 11. Comandos
```bash
npm run dev      # desarrollo
npm run build    # build web en dist/ (itch.io)
npm run preview  # probar el build
# al final: npm run dist:win → .exe portable (Electron)
```

## 12. Registro de uso de IA (obligatorio)
`AI_LOG.md`: fecha y hora, herramienta, qué se pidió, qué archivos o assets resultaron y **qué decidió o modificó el equipo**. Las imágenes generadas con IA se guardan sin retocar en `arte-fuente/ia-generado/` como evidencia. Los créditos de terceros van en `CREDITOS.md`.

## 13. `REPORTE_DEMO.md` (al cerrar cada hito importante)
Qué funciona (✅ / ⚠️ / ❌); FPS y latencia de detección (`lsm.stats()`); tamaño del build; letras de LSM que se reconocen bien o mal (tabla en `ecos-lsm/README.md` §3, actualízala); resultado de las pruebas de Alt, Tab, clic derecho y doble Shift; decisiones tomadas y riesgos pendientes.
