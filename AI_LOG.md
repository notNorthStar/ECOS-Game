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

<!-- Plantilla para nuevas entradas:
## AAAA-MM-DD HH:MM · <herramienta>
**Qué se pidió:**
**Qué resultó (archivos/assets):**
**Qué decidió o modificó el equipo:**
-->
