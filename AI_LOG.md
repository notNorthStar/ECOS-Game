# AI_LOG — Registro de uso de inteligencia artificial (ECOS)

> Requisito de la convocatoria del jam: declarar qué IA se usó, dónde y cuál fue la aportación del equipo.
> Formato: fecha · herramienta · qué se pidió · qué resultó · **qué decidió o modificó el equipo**.

## 2026-10-16 a 2026-10-19 · Claude Code (Anthropic, Claude Opus 5.5) · Módulo de LSM `ecos-lsm/`

**Qué se pidió:** una demo jugable para validar la detección del alfabeto manual de LSM con la cámara. Después, extraer, documentar y empaquetar el módulo de detección sin el juego.

**Qué produjo la IA:**
- El código de `ecos-lsm/`:
  - cámara y MediaPipe (`HandTracker`);
  - reglas geométricas por letra;
  - k-NN;
  - reconocedor de la Z por trayectoria;
  - sesión de deletreo;
  - detector de seña sostenida (escudo);
  - grabadora de muestras;
  - vista de cámara;
  - página demo;
  - pruebas sintéticas.
- Su documentación: `ecos-lsm/README.md` y `docs/MODULO_LSM.md`.
- La investigación de fuentes de LSM (`ecos-lsm/src/data/SOURCES.md`).

**Aportación del equipo:**
- Probó cada letra con la cámara y mandó capturas con las medidas (F3).
- Demostró la forma de G, H, M, N, P, T, W y R. Con esas medidas se calibraron los umbrales.
- Detectó los errores reales: orientación de la mano, letras que dependían de la postura, E/O, P/R, H/P y la Z que se reiniciaba.
- Decidió las letras permitidas y el diseño de los conjuros (GDD).

**Pendiente del equipo:** verificar las formas de mano con el abecedario de la SEP.

## 2026-10-19 · Claude Code (Anthropic, Claude Opus 5.5) · Organización del repositorio

**Qué se pidió:** organizar el repositorio de GitHub con el contexto del juego y una estructura para que el equipo suba assets comunes (música, sprites, etc.) sin que las IAs pierdan contexto.
**Qué resultó:**
- Estructura de `public/assets/` y `arte-fuente/`, con un `LEEME.md` por carpeta.
- `docs/ASSETS.md`, `CREDITOS.md`, `README.md`, `.gitignore` y `.gitattributes`.
- En `AGENTS.md`: §0 (repo, assets, créditos), §8 (los placeholders nunca sobrescriben assets del equipo), §9 (estructura real) y §10 (flujo de git).
- Decisión técnica: no usar Git LFS (cuota limitada); los archivos pesados van fuera del repo.

**Aportación del equipo:** creó el repositorio, la tabla de niveles (`docs/NIVELES_ECOS.md`), el GDD, el NDD y las referencias.

## 2026-10-19 11:10 · Claude Code (Anthropic, Claude Opus 5.5) · Nivel 1 jugable
**Qué se pidió:** construir el Nivel 1 (Xalapa) completo el mismo día de la entrega.
**Qué resultó:** base Vite + Phaser 4 + TypeScript, contratos entre sistemas (`src/core/`, `docs/ARQUITECTURA.md`) y seis agentes en paralelo: mundo y movimiento con profundidad, conjuros con LSM (integra `ecos-lsm` sin reescribirlo), combate, enemigos y Ecos, contenido (niveles, guion y diálogos con base en el NDD), arte generado por código (placeholders reemplazables, `ART_SPEC.md`) y audio procedural.
**Qué decidió o modificó el equipo:** la fecha de entrega (hoy), usar agentes en paralelo, el alcance del Nivel 1 y la historia (NDD, sin cambios).

## 2026-10-19 13:51 (Ciudad de México) · Codex (OpenAI) · Primer hito del Nivel 2

**Qué se pidió:** crear una rama separada y comenzar San Andrés Tuxtla con subagentes, sin modificar `main` ni hacer merges sin autorización.

**Qué resultó:** rama `codex/nivel-2-san-andres-tuxtla`; mapa y diálogos N2; misión de cinco recuerdos con recompensas únicas, altar, VOZ y primer fragmento; música procedural por capas y escenario provisional original por código; entradas desde título y final de Xalapa; pruebas del director y documentación en `docs/NIVEL_02.md` y `REPORTE_DEMO.md`. Se reutilizó el módulo LSM sin modificarlo. Tres subagentes trabajaron en contenido, misión y audio; Codex integró y verificó el conjunto.

**Qué decidió o modificó el equipo:** autorizó explícitamente el Nivel 2, la rama independiente y el uso de subagentes. Las cinco estrofas y VOZ se tomaron de las propuestas existentes en `NIVELES_ECOS.md`; aún requieren revisión de equilibrio, musical y cultural. No se realizaron merges.

## 2026-10-19 14:02 (Ciudad de México) · Codex (OpenAI) · Regeneración visual del Nivel 2

**Qué se pidió:** regenerar escenarios con mayor calidad conforme al contexto y las referencias de arte.

**Qué resultó:** seis capas PNG de parallax, generadas por código original con la paleta de `ART_SPEC.md`, píxeles a 1× y alfa binario. Nuevas fuentes `TuxtlaLandscape.ts`, `TuxtlaTerrain.ts` y `TuxtlaDecor.ts`; generador reproducible `tools/gen-tuxtla-scenery.mjs` con protección por marca/hash y respeto de rutas del equipo. Cielo tramado, cerros, fachadas envejecidas, empedrado húmedo, vegetación y decorado del fandango. Tres subagentes colaboraron en paisaje, decorado y revisión; Codex integró y revisó vistas del recorrido en navegador.

**Qué decidió o modificó el equipo:** pidió mayor calidad siguiendo el contexto existente. Se conservaron historia, misión, colisiones y puntos de interacción. El arte continúa marcado como procedural reemplazable; no se copiaron imágenes externas ni se sobrescribieron assets del equipo. Trabajo en la rama N2, sin merge a `main`.

## 2026-10-19 15:28 (Ciudad de México) · Codex (OpenAI) · Nueva idea de actualización del Nivel 2

**Qué se pidió:** actualizar la documentación y registrar como nueva idea un Nivel 2 más largo, fragmentos más dispersos y un Chaneque Mayor en los fragmentos 2 y 5.

**Qué resultó:** `docs/IDEAS_ACTUALIZACION.md`, entrada ACT-N2-001; referencias y distinción entre versión actual y actualización pendiente en `docs/NIVEL_02.md`, `docs/NIVELES_ECOS.md`, `AGENTS.md` y `README.md`. Se documentó la correspondencia de fragmentos musicales con estrofas (`monte` y `memoria`), los dos guardianes independientes y los ajustes técnicos por diseñar. Solo documentación; sin cambios de código, mapa, assets ni narrativa oficial.

**Qué decidió o modificó el equipo:** solicitó explícitamente ampliar el recorrido, dispersar los recuerdos e incorporar esos dos encuentros. El nuevo tamaño, posiciones, duración y equilibrio quedan pendientes de diseño e implementación.

## 2026-10-19 16:45 · Claude Code (Anthropic, Claude Opus 5.5 + Sonnet 5.5) · Nivel 3, Catemaco
**Qué se pidió:** el Nivel 3 completo según NIVELES_ECOS y el NDD, en una rama sacada del Nivel 2, con subagentes y eligiendo el modelo por tarea.
**Qué resultó:** contratos (`docs/NIVEL_03_CONTRATOS.md`) y cinco subagentes en paralelo: escenario y NPCs comunes (Opus), escudo U + Luna + Balam (Opus), encapuchados + espíritus + Cabeza Olmeca (Opus), mapas + guion + diálogos + pruebas (Sonnet) y audio (Sonnet). Integración, partida completa en navegador y correcciones: campos de SOL desalineados, filtro de Luna demasiado fuerte, diálogos encadenados que podían dejar bloqueado al jugador, alias de efectos y `boss:phase` con 3 fases. La música MP3 del equipo quedó conectada al Nivel 1.
**Qué decidió o modificó el equipo:** alcance completo, incluir SOL, escudo con clic derecho, y que los personajes importantes (enemigos, aliados, jefes) solo lleven placeholder porque su arte final lo hace el equipo. Los nombres de los brujos (Cirilo, Eulalia, Atanasio, Doña Chayo) son propuesta y quedan por revisar.

## 2026-10-19 19:00 · Claude Code (Anthropic, Claude Opus 5.5 + Sonnet 5.5) · Nivel 4, Oaxaca
**Qué se pidió:** el Nivel 4 con la misma dinámica del Nivel 3 (preguntas, plan, contratos, subagentes por modelo).
**Qué resultó:** contratos (`docs/NIVEL_04_CONTRATOS.md`), salida de Catemaco conectada a Oaxaca y cinco subagentes: escenario + artesanos (Opus), María en combate + MEMORIA (Opus), bestias + Bruja Guajolote (Opus), mapas + guion + pruebas (Sonnet) y audio con banda de viento (Sonnet). Partida completa en navegador; corregido el contador de misión que se encimaba con las barras del HUD.
**Qué decidió o modificó el equipo:** incluir MEMORIA, sin tienda de mejoras de conjuros, María ayuda en combate, Templo de Santo Domingo. Los nombres de los artesanos (Gudelia, Facundo, Lucrecia) son propuesta y quedan por revisar.

## 2026-10-19 21:30 · Claude Code (Anthropic, Claude Opus 5.5 + Sonnet 5.5) · Nivel 6, CDMX parte 1
**Qué se pidió:** el Nivel 6 con la misma dinámica (Puebla se omite por tiempo; lo que entregaba se reubica).
**Qué resultó:** contratos (`docs/NIVEL_06_CONTRATOS.md`), salida de Oaxaca hacia la CDMX y cinco subagentes: escenario + sobrevivientes (Opus), doble salto + obstáculos con altura + VERDAD/FUEGO/DESCANSO (Opus), muñecas + nahuales infiltrados + la Nahuala (Opus), mapas + guion + pruebas (Sonnet) y audio con organillo y percusión prehispánica (Sonnet). Partida completa en navegador; corregidas 17 claves de props inexistentes, el conteo de muñecas en las emboscadas y el umbral de salto de los láseres de la Cabeza Olmeca.
**Qué decidió o modificó el equipo:** omitir Puebla; dar su fragmento en Oaxaca; mover doble salto, VERDAD, FUEGO y los diálogos de María a la CDMX; enseñar también DESCANSO; doble salto comprable con zonas opcionales; la Nahuala (antes de Puebla) como jefa de la CDMX; pista de Luna + VERDAD para los nahuales.

## 2026-10-19 · Claude Code (Anthropic, Claude Opus 5.5 + Sonnet 5.5) · Nivel 7, CDMX parte 2
**Qué se pidió:** el Nivel 7 con la misma dinámica: teleférico, torre, revelación de María, la Llorona aliada contra el Rey del Olvido y la secuencia CONSUELO → MEMORIA → PAZ.
**Qué resultó:** contratos (`docs/NIVEL_07_CONTRATOS.md`), salida del Nivel 6 hacia el teleférico y cinco subagentes: escenario de la cabina, la torre y el salón con técnicos de la torre (Opus); controles invertidos, Llorona aliada, transformación de María, `castSpellNow`, CONSUELO y PAZ (Opus); el Rey del Olvido y la guardia de élite (Opus); mapas, guion, director y pruebas (Sonnet); música y efectos, con un arreglo propio de la melodía tradicional "La Llorona" (Sonnet). Partida completa en navegador; corregidas claves de props, sonidos duplicados o sin sintetizar, el HUD que quedaba sobre el título al final y los avisos largos que se cortaban (ahora hacen salto de línea).
**Qué decidió o modificó el equipo:** cabina como arena en movimiento; la corona invierte los controles 3–4 s con aviso y opción de accesibilidad para desactivarlo; melodía tradicional con arreglo propio; revelación sugerida, sin mostrarla.

## 2026-10-19 · Claude Code (Anthropic, Claude Opus 5.5) · Se omiten Guanajuato y Jalisco
**Qué se pidió:** saltar Guanajuato (y, al confirmar, también Jalisco) por tiempo e ir directo al final, ajustando la historia.
**Qué resultó:** marcas de "versión jugable" en `docs/NDD_v2.md` (niveles 5, 7, 8, 9 y 10; el texto original se conserva), nota de alcance y tabla en `AGENTS.md`, `NIVELES_ECOS.md`, `GDD_ECOS.md`, README y documentos del Nivel 7. En el juego: el Rey del Olvido entrega del 4.º al 6.º fragmento (`n07:fragmento_4`…`_6`) y la falsa llamada pide llevar el Códice completo a la Catedral de Guadalajara; pruebas del Nivel 7 actualizadas.
**Qué decidió o modificó el equipo:** omitir los niveles 8 y 9; el Rey guardaba los tres fragmentos restantes; registrar el cambio como en Puebla (NDD marcado, sin reescribirlo).

## 2026-10-19 · Claude Code (Anthropic, Claude Opus 5.5 + Sonnet 5.5) · Nivel 10, Guadalajara (final) y arreglos
**Qué se pidió:** el Nivel 10 con la misma dinámica; arreglos del equipo (SOL y FUEGO hacia la izquierda, continuidad entre niveles sin el mapa animado, integrar los soundtracks de la rama `soundtrack`); llenar la ficha técnica; build web para itch.io.
**Qué resultó:** contratos (`docs/NIVEL_10_CONTRATOS.md`) y cinco subagentes: escenario de la avenida, la Catedral, el techo abierto y el epílogo (Opus); Balam jaguar, la madre, ataduras, ECOS/MAMA y escena de epílogo con créditos (Opus); Tzitzimime e Itzpapálotl (Opus); mapas, guion, director y pruebas (Sonnet); música y efectos (Sonnet). Integración y partida completa en navegador. Arreglos: el haz de SOL y la franja de FUEGO crecían hacia el lado contrario al mirar a la izquierda; el Nivel 1 pasa directo a Tuxtla y Tuxtla a Catemaco; 11 soundtracks del equipo asignados por nombre. Ficha técnica llenada por un subagente (copia en Descargas).
**Qué decidió o modificó el equipo:** recorrido avenida + Catedral; cadena LUZ → MEMORIA → ECOS atado; MAMA abre las ventanas de Itzpapálotl; Balam jaguar como aliado; quitar el mapa animado; asignación de soundtracks por nombre; build solo web (sin ejecutable por ahora).

## 2026-10-20 · Claude Code (Anthropic, Claude Opus 5.5 + Sonnet 5.5) · Versión extendida (rama `version-extendida`)
**Qué se pidió:** corrección general de bugs (muros invisibles, avisos de E, salida del taller), extender el final (liberar y hablar con la madre), pantallas de carga con consejos, HUD con barra de vida y más minimalista, fuente legible, cooldowns y PROTECCION mejorable en el altar, implementar el arte de Codex (con rediseño del protagonista y la madre y la Bruja Guajolote ave), enemigos descartados (momias, Vampiro, Don Ernesto) y créditos completos.
**Qué resultó:** seis subagentes (arte, enemigos, contenido, interfaz, mecánicas, bugs) más integración: 24 kits animados por cuadros desde las hojas de Codex (`tools/codex-sheets.py`), protagonista y madre ajustados por código, Bruja Guajolote ave y detalles de Don Ernesto dibujados por código; momias, Vampiro y Don Ernesto; final extendido; `CargaScene` con imágenes sin spoilers y 33 consejos; Pixelify Sans en todo el juego; barra de vida; cooldowns; auditoría de niveles (`tools/auditar-niveles.mjs`). Pruebas: 176 en total, todas pasan; probado en navegador Guadalajara de punta a punta.
**Qué decidió o modificó el equipo:** el arte de Codex (hojas de 24 poses) y los concept arts de carga son del equipo; ajustes por código del protagonista y la madre; momias, Vampiro (Catedral) y Don Ernesto monstruoso (avenida); `bestia-2` como nahual; cooldowns propuestos; fuente pixel legible; una imagen y un consejo por carga.

<!-- Plantilla para nuevas entradas:
## AAAA-MM-DD HH:MM · <herramienta>
**Qué se pidió:**
**Qué resultó (archivos/assets):**
**Qué decidió o modificó el equipo:**
-->
