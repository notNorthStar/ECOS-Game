# ECOS

**Listick Games · 09 Game Jam ANIEI 2026 · Tema: "Cultura, identidad y patrimonio"**

Juego de **exploración y acción 2D con profundidad**, en pixel art, ambientado en un México retrofuturista colapsado. El protagonista, criado en **Lengua de Señas Mexicana (LSM)** por su madre sorda, lanza conjuros **deletreando en LSM frente a la cámara web**, o con el teclado, para purificar a los seres del folclor y enfrentar a la Cofradía del Espejo Negro.

> **Estado (2026-10-19):**
> - **Nivel 1 · Xalapa:** jugable de principio a fin (`main`).
> - **Nivel 2 · San Andrés Tuxtla:** jugable en `codex/nivel-2-san-andres-tuxtla`, en pulido. Guía: `docs/NIVEL_02.md`.
> - **Nivel 3 · Catemaco:** jugable de principio a fin en `nivel-3-catemaco` (sale del Nivel 2). Guía: `docs/NIVEL_03.md`.
> - **Nivel 4 · Oaxaca:** jugable de principio a fin en `nivel-4-oaxaca` (sale del Nivel 3; Catemaco continúa a Oaxaca). Guía: `docs/NIVEL_04.md`.
> - **Nivel 5 · Puebla:** ⏭️ **se omite por tiempo** (decisión del equipo, 2026-10-19). Oaxaca lleva directo a **CDMX (Nivel 6)**, que es el siguiente. Ver la nota de alcance en `AGENTS.md`.
> - En el título: 1–2 Xalapa, 3–4 Los Tuxtlas, 5–6 Catemaco, 7–8 Oaxaca (con cámara / solo teclado). Estado detallado: `AGENTS.md` §5.1.

## Controles

| Acción | Tecla |
|---|---|
| Moverse (a lo ancho y en profundidad) | **WASD** |
| Correr / esquivar | **Shift** mantenido / **doble Shift** o **C** |
| Saltar | **Espacio** |
| Disparar · láser verde / rojo | **Clic izquierdo** o **X** · **1** / **2** |
| Interactuar | **E** |
| Conjuro: lanzar / rueda | **Q** tocar / **Q** mantener |
| Escudo (desde Catemaco) | **Clic derecho** mantenido, o la seña **U** frente a la cámara |
| Habilidad Luna (desde Catemaco) | **F** (alterna) |
| Diario de Señas · Pausa | **Tab** · **Esc** |

La música arranca al 30 % de volumen; se ajusta en **Pausa → Opciones**.

---

## Para empezar

| Si eres… | Lee primero |
|---|---|
| **Una IA** (Claude Code u otra) | **`AGENTS.md`** completo, y luego los documentos de su sección 0 |
| **Artista o músico** del equipo | **`docs/ASSETS.md`**: dónde va cada archivo, cómo se nombra y cómo subirlo desde la web |
| **Programador** | `AGENTS.md`, `docs/GDD_ECOS.md` y `docs/MODULO_LSM.md` |
| **Diseño o narrativa** | `docs/GDD_ECOS.md`, `docs/NDD_v2.md` (la historia es definitiva) y `docs/NIVELES_ECOS.md` |

## Qué hay en el repositorio

| Ruta | Contenido |
|---|---|
| `AGENTS.md` | Contexto y reglas para todas las IAs: vista, controles, alcance por nivel, stack, arte y forma de trabajar |
| `docs/GDD_ECOS.md` | Diseño del juego: cómo se juega |
| `docs/NDD_v2.md` | Historia oficial (3 actos, 10 niveles) |
| `docs/NIVELES_ECOS.md` | Tabla de niveles: secciones, conjuros, afinidades, jefes, Ecos, música y assets |
| `docs/IDEAS_ACTUALIZACION.md` | Nuevas ideas de actualización: ampliar N2, dispersar las estrofas y añadir Chaneques Mayores en la segunda y la quinta (ACT-N2-001, pendiente de implementación) |
| `docs/MODULO_LSM.md` | Cómo usa ECOS el módulo de LSM |
| `docs/ASSETS.md` | Guía de assets: carpetas, nombres, formatos, licencias |
| `docs/referencias/` | Worlorn (vista y calidad objetivo) y la hoja de estilo del protagonista |
| `ecos-lsm/` | **Módulo de detección de LSM** con la cámara, con su demo y sus pruebas |
| `public/assets/` | **Assets finales** que carga el juego (sprites, escenarios, UI, audio, fuentes, mapas) |
| `arte-fuente/` | Material de trabajo: concept, editables, salidas crudas de IA (no lo carga el juego) |
| `CREDITOS.md` | Créditos y licencias de terceros (**obligatorio** para el jam) |
| `AI_LOG.md` | Registro de uso de IA (**obligatorio** para el jam) |

## Cómo colaborar

**Assets (sin usar la terminal):**
1. Entra a la carpeta correcta en GitHub (ver `docs/ASSETS.md`).
2. **Add file → Upload files**.
3. Commit en español.
4. Si es de terceros, actualiza `CREDITOS.md`. Si lo hiciste con IA, actualiza `AI_LOG.md` y sube la versión cruda a `arte-fuente/ia-generado/`.

**Código (con git):**
```bash
git pull
# … trabajar …
git add -A
git commit -m "Descripción corta en español"
git pull
git push
```
- Commits **pequeños y frecuentes, en español**: el Comité del jam puede pedir evidencia del proceso.
- Nunca `git push --force` sobre `main`.

## Probar el módulo de LSM (sin el juego)

```bash
cd ecos-lsm
npm install
npm test
npm run dev
```
Abre http://localhost:5180 en Chrome o Edge y activa la cámara. La cámara se procesa en tu equipo; no se graba ni se envía nada.

## Créditos

Ver `CREDITOS.md`. Uso de IA declarado en `AI_LOG.md`.
