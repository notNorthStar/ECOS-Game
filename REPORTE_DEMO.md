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
