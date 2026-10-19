# Primer hito del Nivel 2 — 2026-10-19

Rama: `codex/nivel-2-san-andres-tuxtla`. Base de `main`: `f60121c824dda0f69ff52fe8d2d46d655d6a4956`. Trabajo local, sin merge.

## Implementado

- ✅ Acceso desde título: 3 con cámara, 4 solo teclado. Xalapa conserva sus opciones 1/2.
- ✅ Continuación desde el resumen de Xalapa a Los Tuxtlas conservando Ecos, mejoras y maestría.
- ✅ Pueblo de 3600 px, letras de San Andrés, checkpoint, altar y diez chaneques reutilizados; sin jefe.
- ✅ Músico inicial, cinco recuerdos, contador, guía de la gema y tarima del fandango.
- ✅ Música original procedural por capas a medida que se recuperan estrofas; se restaura al reaparecer.
- ✅ VOZ, con tutorial LSM existente y aturdimiento en área sin daño; primer fragmento y pista hacia Catemaco.
- ✅ Progreso de misión y recompensas únicas entre reapariciones. Sin guardado a disco, igual que el juego base.
- ✅ Documentación de ruta, datos y arte pendiente en `docs/NIVEL_02.md`.

## Verificación

- TypeScript estricto: correcto (`npm run typecheck`).
- Compilación web: correcta (equivalente a `npm run build`, ejecutado con Node incluido).
- Tamaño de `dist/`: 37,853,400 bytes (128 archivos, aproximadamente 36.1 MiB); JavaScript 1,803.13 kB / 505.19 kB gzip.
- Pruebas: `npm run test:nivel2`, 14 correctas; director real transpilado con adaptadores de escenas/diálogos, `checkWord`, `WalkMap`, efecto VOZ y entrada de campaña. No sustituyen una partida real.
- Humo parcial en navegador: título, entrada directa con teclado, introducción, conversación inicial, movimiento y CALMA con resultado PERFECTO. También se observó reaparición tras daño. Sin errores de consola en la carga revisada.
- Revisión de integración por otro subagente: corregidos el tiempo del mundo tras aprender VOZ y la prioridad de fondos del equipo sobre respaldos procedurales.

## Límites de este hito

- ⚠️ Pendiente una partida humana completa de principio a fin, evaluación de dificultad y duración objetivo de 8–10 minutos.
- ⚠️ Cámara y trayectoria Z de VOZ pendientes de prueba humana; el detector LSM no se modificó.
- ⚠️ FPS y latencia de cámara no medidos. Alt, Tab, clic derecho y doble Shift no validados en este hito.
- ⚠️ Arte, músicos e instrumentos son provisionales por código. Audio pendiente de revisión musical y escucha por el equipo.
- ⚠️ El Nivel 3 no está implementado: la salida cierra el Nivel 2 y vuelve al título.
- ⚠️ No se preparó ni probó ejecutable Windows.

No se agregaron assets de terceros ni se sobrescribió arte del equipo.

## Segunda pasada visual — 2026-10-19

- Seis PNG de parallax regenerados y cargados por manifiesto, con alto 360 y anchos según `ART_SPEC.md` §9.
- Paleta oficial y alfa 0/255 comprobados durante generación; fuente determinista y sin dependencias de dibujo adicionales.
- Se distinguen entrada ajardinada, calles, claro tropical, taller de arcadas y plaza. Cielo tramado, sol circular, cerros con bruma, tejas, balcones, cableado, cantera húmeda y vegetación frontal.
- Letras turísticas, músicos, instrumentos, tarima, portada, papel picado y recuerdos redibujados; se conservan posiciones de misión y colisiones.
- Revisión en navegador: entrada y recorrido corriendo hasta la plaza, profundidad y parallax, textura de suelo y legibilidad de actores. Sin errores de consola; avisos de MediaPipe ya existentes durante precarga.
- TypeScript y 14 pruebas de misión correctos. No se modificó el detector LSM.
- Build web correcto: 38,005,569 bytes en 134 archivos; JavaScript 1,820.24 kB / 511.76 kB gzip.
- Regeneración normal comprobada: conserva las seis capas existentes. `--force` requiere marca/hash propios y también conserva rutas personalizadas y entradas del equipo.

El arte continúa marcado como reemplazable. La revisión cultural/musical y una partida humana completa siguen pendientes.

## ACT-N2-001: recorrido ampliado y guardianes — 2026-10-19

La idea registrada por el equipo está implementada en `codex/nivel-2-san-andres-tuxtla`. Esta sección sustituye las cifras del primer hito para el estado actual.

- Mapa de **7200 px**, cinco estrofas separadas entre **1200 y 1400 px**, 14 chaneques comunes y dos Chaneques Mayores en `monte` (estrofa 2) y `memoria` (estrofa 5).
- Dos arenas independientes, altares antes de cada encuentro y checkpoints tras resolverlos. Las estrofas custodiadas exigen purificar al guardián; morir conserva los encuentros resueltos y los premios.
- Perfil de combate propio del Nivel 2, con 140 de vida, dos fases, CALMA y 35 Ecos por guardián. Purificar uno calma únicamente a sus invocados del mismo encuentro y grupo. Parámetros y eventos originales de Xalapa conservados.
- Seis fondos propios regenerados al nuevo ancho, señalización de guardianes, paisaje extendido y tarima/salida al final del recorrido.
- Corrección de interacción: la E que cierra un diálogo respeta el enfriamiento de 350 ms y no vuelve a abrirlo en el mismo cuadro.

**Validación ejecutada:**

- TypeScript estricto y build web correctos; 85 módulos, JavaScript **1827.96 kB / 513.86 kB gzip**. `dist/`: **40,426,103 bytes, 135 archivos**.
- **21/21 pruebas correctas**: director, mapa transitable, bloqueo de estrofas 2/5, identidad de guardianes, checkpoints, reintentos, aparición fallida, recompensas únicas, Combat real con aislamiento por encuentro/grupo, perfil N1 y regresión de cierre con E. Se conserva cobertura de VOZ, fandango y entrada de campaña.
- Navegador con teclado: entrada, conversación inicial, cierre con E sin reapertura, recorrido hasta Monte, activación de arena y barra del guardián, láser, deletreo de CALMA, muerte y reintento desde el checkpoint cercano. No se completaron ambos combates ni una partida entera durante esta revisión.
- Sin errores en la consola revisada. Se observaron avisos de MediaPipe sobre OpenGL y proyección durante la carga; no se modificó el módulo LSM.
- Revisión de integración por subagente sin bloqueos concretos en encuentros, reaparición o entrega de premios. `git diff --check` correcto.

**Pendiente de validación humana:** partida completa con teclado, dificultad y duración del mapa ampliado, cámara/LSM, revisión cultural, musical y arte final. El cálculo base de 272–286 Ecos excluye invocados y gasto en mejoras; no es una medición de partida. No se generó ejecutable Windows.
