# Nivel 4 — Oaxaca: contratos de implementación

> Rama `nivel-4-oaxaca` (sale de `nivel-3-catemaco`). Fuente de diseño: `docs/NIVELES_ECOS.md` §4 (Nivel 4), `docs/NDD_v2.md` (Nivel 4, historia **definitiva**), `docs/GDD_ECOS.md` §5, §6, §9. Patrón a copiar: el Nivel 3 (`docs/NIVEL_03_CONTRATOS.md`, `docs/NIVEL_03.md`, `CatemacoDirector.ts`, `Catemaco*.ts`, `Encapuchado.ts`, `CabezaOlmeca.ts`, `Balam.ts`).
> Contratos de código: `src/core/contracts.ts`, `src/core/bus.ts`, `src/core/GameState.ts`. **Regla de arte: `AGENTS.md` §8.0** (personajes importantes = placeholder; NPCs comunes = diseño).

## 1. Decisiones del equipo (2026-10-19)

- **MEMORIA se incluye** (lo enseñan los artesanos: "los tejidos guardan la memoria"). Purifica a las bestias corrompidas y revela el pasaje oculto. Efectivo contra la Bruja Guajolote (afinidad ✅).
- **Sin tienda de mejoras de conjuros:** solo el Altar de la Memoria de siempre.
- **María ayuda en combate** (además de acompañar y hablar). No revela nada de su futuro (Llorona, Rey del Olvido): solo su angustia por sus hijos perdidos (NDD).
- **Templo de Santo Domingo** (no la Catedral): cantera verde, fachada barroca, interior dorado, en ruinas fortificadas.
- Duración objetivo 12–15 min. Ecos ~700 en el nivel. Recompensa: **2.º fragmento del Sello**.
- La entrada viene de la salida de Catemaco (`prepareOaxacaEntry()` ya existe) o del título (opciones 7/8).

## 2. Secciones

| id | Contenido | Ancho | Música |
|---|---|---|---|
| `oaxaca` | Letras desgastadas de OAXACA + altar (checkpoint). Calles empedradas con casas coloridas semidestruidas y montañas verdes al fondo. Encapuchados Rojos (~4) y primeras bestias (~3) que atacan a viajeros. **Taller de los artesanos** (3 artesanos tejedores, NPCs comunes): explican los patrones de los textiles y enseñan **MEMORIA** (`startLearning`). | 3000 | `n04_ciudad` |
| `callejones` | Callejones y mercado arruinado. Bestias corrompidas (~7) y encapuchados (~4). Al purificar a las bestias con MEMORIA, estas **revelan un pasaje oculto** (un muro/telar que se abre: `pasaje:revealed`) hacia el corazón de la ciudad. Checkpoint intermedio. | 3000 | `n04_ciudad` / `n04_combate` |
| `santo_domingo` | Explanada y ruinas fortificadas del **Templo de Santo Domingo** → interior dorado → arena de la **Bruja Guajolote** → 2.º fragmento → salida (por ahora al título: CDMX aún no existe). | 2400 | `n04_templo` / `n04_jefe` |

Suelo transitable: franja y = **220…345** (horizonte ~205). Fondos: `fondo_<seccion>_capa0..5` en `public/assets/escenarios/nivel-04-oaxaca/fondos/`, anchos con `layerWidth()`.

## 3. Sistemas y dueños

| Archivo | Dueño | API |
|---|---|---|
| `systems/Maria.ts` | sistemas | `installMaria(world)` (ya lo llama LevelScene en todas las secciones; inactivo si `!GameState.hasMaria`). Compañera que sigue al jugador y ayuda en combate (§5). Eventos `maria:assist`, `maria:say` |
| `data/spells.json` (MEMORIA) | sistemas | campos de `effect` documentados en `effectDoc` |
| `entities/Bestia.ts`, `entities/BrujaGuajolote.ts`, `registry.ts` (hoy lanza error para `bestia` / `bruja_guajolote`), `applySpell` de MEMORIA en todos los enemigos, `Combat.ts` (efecto visual de MEMORIA), `data/enemies.json`, `config/combat.ts` | enemigos | `createEnemy` |
| `world/Oaxaca*.ts`, `tools/gen-oaxaca-scenery.mjs`, PNG en `escenarios/nivel-04-oaxaca/`, `data/assets.json` (solo agregar), NPCs artesanos | escenario | `installOaxacaScenery(world)` (ya lo llama LevelScene) |
| `data/levels/{oaxaca,callejones,santo_domingo}.json`, `data/dialogue/n04.json`, `data/oaxaca.json`, `systems/OaxacaDirector.ts`, `docs/NIVEL_04.md`, `tools/test-nivel-04.mjs` | contenido | `installOaxacaDirector(world)` (ya lo llama Director) |
| `systems/audio/*` (pistas `n04_*`, efectos nuevos) | audio | |

Flags de progreso: prefijo **`n04:`**. Persisten tras morir.

## 4. Eventos nuevos del bus

`maria:assist {kind, x, y}` · `maria:say {text, ms?}` · `pasaje:revealed {id}` · `bruja:form {form: 'humana' | 'ave'}`. Se reutilizan `boss:phase`, `boss:vulnerable`, `boss:calmed` (al vencer a la Bruja), `enemy:*`, `cofradia:down`.

## 5. María en combate (placeholder)

- Sigue al jugador como Balam (otro lado y otra distancia), con placeholder simple: mujer con rebozo oscuro, ~70 px, cuadro 64×80 pivote (32,78), `kit_maria` del equipo la reemplaza sola.
- **Apoyo** cada ~8–12 s si hay enemigos cerca: un **lamento** que aturde en área (sin daño) a encapuchados y bestias, o distrae (los enemigos la miran a ella un momento). Es invulnerable (no se le puede derrotar) y no bloquea el paso. Respeta `timeScale` y "reducir efectos".
- Comentarios breves (`maria:say` → toast o globo) en momentos clave: llegar a Oaxaca, ver a los artesanos, encontrar juguetes/ropa de niños en los callejones, antes del templo. Siempre desde su angustia por sus hijos; **nada** sobre su pasado con el Rey del Olvido.

## 6. Conjuros y afinidades

| | MEMORIA (7) | LUZ | SOL | CALMA | VOZ | Láser rojo |
|---|---|---|---|---|---|---|
| Bestia corrompida (folclor) | **purifica** (y revela pasaje) | aturde | daña | aturde/➖ | aturde | daño → agotada (luego MEMORIA la purifica) |
| Encapuchado | ➖ | aturde | **inconsciente** | ✖ | aturde | daño |
| Bruja (forma humana) | ✅ | **✅ débil** | ➖ | ➖ | ➖ | daño leve |
| Bruja (forma ave) | ✅ | ➖ | **✅ débil** | ➖ | ➖ | daño leve |

## 7. Jefa: la Bruja Guajolote (Tlahuelpuchi), placeholder

- **Forma humana** (~72 px, cuadro 64×80, kitId `bruja_guajolote`): flota y se teletransporta; lanza **proyectiles de fuego fatuo** (verdes/azules) que el escudo puede devolver. Débil a LUZ.
- **Forma de ave gigante** (~110 px, cuadro ~160×128, kitId `bruja_guajolote_ave`): **embestidas** a lo ancho anunciadas y **fuego en área** (charcos de fuego fatuo en el suelo). Débil a SOL.
- **Alterna de forma** cada cierto tiempo (y al recibir el conjuro débil correcto). Emite `bruja:form`.
- Ventanas de vulnerabilidad tras sus ataques grandes; el conjuro débil de la forma actual (o MEMORIA) avanza su "sello"; al completarlo, `boss:calmed`, ~350 Ecos (GDD 5.1). Barra en el HUD (`showBossBar` / `updateBossBar`).
- Sin violencia gráfica: al vencerla, el fuego fatuo se apaga y queda la mujer inconsciente/liberada; la Cofradía pierde su control.

## 8. Personajes (AGENTS.md §8.0)

| Personaje | Tipo | Arte por IA |
|---|---|---|
| Bestia corrompida, Bruja Guajolote (2 formas), María, encapuchados, Balam | importantes | **Placeholder simple** con medidas del kit |
| 3 artesanos tejedores, pobladores de Oaxaca | comunes | **Diseño completo** en el estilo del juego |

Bestia corrompida: criatura mediana/grande cuadrúpeda inspirada en alebrijes/nahuales oscuros (~45–55 px de alto, cuadro ~96×64), corrompida con fuego fatuo; placeholder simple.
