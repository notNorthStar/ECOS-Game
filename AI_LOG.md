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

## 2026-10-19 17:54 (Ciudad de México) · Codex (OpenAI) · Implementación ACT-N2-001

**Qué se pidió:** continuar en código la actualización documentada del Nivel 2: recorrido más largo, fragmentos musicales más dispersos y Chaneques Mayores en los fragmentos 2 y 5, conservando la rama separada y sin merge a `main`.

**Qué resultó:** mapa de 7200 px, estrofas separadas entre 1200 y 1400 px, 14 chaneques comunes y dos guardianes independientes para `monte` y `memoria`; arenas, altares y checkpoints antes/después; progreso persistente y recompensas únicas. Perfil de combate N2 separado del jefe de Xalapa, eventos identificados por encuentro y purificación limitada a sus invocados. Seis fondos propios regenerados, decorado adaptado al ancho, diálogos de orientación y documentación del estado implementado. Se corrigió la reapertura de diálogos con E detectada en navegador. Tres subagentes colaboraron en mapa/arte, combate y pruebas; Codex integró y revisó. TypeScript y build correctos, 21 pruebas y revisión parcial en navegador, incluida aparición de Monte y reintento desde checkpoint.

**Qué decidió o modificó el equipo:** autorizó pasar de la idea registrada a su implementación. El ancho de 7200 px, posiciones y cifras iniciales de equilibrio fueron propuestos por la IA como parámetros configurables; la dificultad y duración siguen pendientes de una partida humana completa. El equipo mantiene la decisión narrativa sobre las cinco estrofas, VOZ y el primer Fragmento del Sello. NDD y módulo LSM intactos; no se sobrescribieron assets del equipo ni se incorporó código del Nivel 3 o de `main`.

## 2026-10-19 18:01 (Ciudad de México) · Codex (OpenAI) · Nombre de rama y servicio de prueba

**Qué se pidió:** hacer coincidir el nombre de la rama con el formato de las demás, incluir Codex y ejecutar el servicio para probar el juego.

**Qué resultó:** rama `nivel-2-san-andres-tuxtla-codex`, antes `codex/nivel-2-san-andres-tuxtla`; referencias actuales de documentación actualizadas y registro histórico conservado. Se prepararon los archivos locales de MediaPipe y se comprobó en navegador la instancia Vite disponible en `http://127.0.0.1:5174/`, dejando abierta la pantalla de título. El puerto 5173 estaba ocupado por otra instancia que no respondía. Sin cambios de código del juego.

**Qué decidió o modificó el equipo:** solicitó el cambio de nombre y la prueba local. Se adoptó el patrón `nivel-2-san-andres-tuxtla-codex`, tomando como referencia `nivel-3-catemaco`. Se conserva la restricción de no modificar `main` ni hacer merges.

<!-- Plantilla para nuevas entradas:
## AAAA-MM-DD HH:MM · <herramienta>
**Qué se pidió:**
**Qué resultó (archivos/assets):**
**Qué decidió o modificó el equipo:**
-->
