# Nivel 3 — Catemaco: contratos de implementación

> Rama `nivel-3-catemaco` (sale de `codex/nivel-2-san-andres-tuxtla`). Fuente de diseño: `docs/NIVELES_ECOS.md` §4 (Nivel 3), `docs/NDD_v2.md` (Nivel 3, historia **definitiva**), `docs/GDD_ECOS.md` §5, §6.5 (escudo), §7 (Luna), §9.
> Contratos de código: `src/core/contracts.ts`, `src/core/bus.ts`, `src/core/GameState.ts`. **Regla de arte: `AGENTS.md` §8.0** (personajes importantes = placeholder; NPCs comunes = diseño).

## 1. Decisiones del equipo (2026-10-19)

- **Alcance completo**: brujos (LUZ, SOL, escudo U) → lago → campamento → gatos + Balam + Luna → espíritus → Cabeza Olmeca (3 fases) → María.
- **SOL se incluye** (era `[PROPUESTA]`).
- **Escudo sin cámara: clic derecho mantenido** (el izquierdo dispara). Con cámara: seña U sostenida 150 ms.
- **Encapuchados**: no se purifican. Láser rojo o SOL los dejan **inconscientes** (caen y se desvanecen en humo). Sin sangre ni violencia gráfica.
- **Duración objetivo** 12–15 min. **Ecos** ~600 en el nivel.

## 2. Secciones

| id | Contenido | Ancho | Música |
|---|---|---|---|
| `catemaco` | Letras de CATEMACO + altar (checkpoint). Casa de los **brujos buenos** (3 brujos, NPCs comunes): enseñan **LUZ**, **SOL** y el **escudo U** (cada uno con `startLearning` o tutorial guiado; el escudo con práctica: bloquear piedras/proyectiles). Primeros 2–3 encapuchados al salir hacia el lago | 2400 | `n03_pueblo` |
| `campamento` | **Orilla del lago** (agua con reflejos como obstáculo, niebla espesa, muelles), patrullas de encapuchados (~9), **infiltración** detectivesca (pistas que examinar, notas de la Cofradía), **jaulas de gatos negros**: frustrar el sacrificio → un gato toca la gema/Códice → **Balam** despierta → se desbloquea **Luna** (tutorial: F) | 3200 | `n03_lago` |
| `altar_olmeca` | Sendero al altar bloqueado por **espíritus** (~8, `lunaOnly`, solo con Luna; se purifican con LUZ o CALMA) → **arena de la Cabeza Olmeca** → al vencer: escena de **María** (se une) → salida | 2400 | `n03_altar` / `n03_jefe` |

Suelo transitable: franja y = **220…345** (horizonte ~205). Agua del lago = obstáculos elípticos con `"water": true` (el mundo ya los dibuja). Fondos: `fondo_<seccion>_capa0..5` en `public/assets/escenarios/nivel-03-catemaco/fondos/`, anchos con `layerWidth()`.

## 3. Sistemas nuevos y su dueño

| Archivo | Dueño | API |
|---|---|---|
| `systems/Shield.ts` | sistemas | `installShield(world)`, `isShieldActive()`, `shieldFilterHit(world, hit) → Hit \| null` (ya conectado en `EnemyBase.hitPlayer`; Player ya no dispara con escudo) |
| `systems/Luna.ts` | sistemas | `installLuna(world)`, `isLunaActive()` |
| `systems/Balam.ts` | sistemas | compañero que sigue al jugador cuando `GameState.hasBalam` (placeholder) |
| `HudScene` (barras de escudo y Luna, ícono de mano U) | sistemas | |
| `data/spells.json` (LUZ, SOL) + `Casting.ts` (no lanzar con escudo) | sistemas | |
| `entities/Encapuchado.ts`, `Espiritu.ts`, `CabezaOlmeca.ts`, `registry.ts`, `applySpell` de LUZ/SOL en todos los enemigos, `Combat.ts` (anillos LUZ/SOL), `data/enemies.json`, `config/combat.ts` | enemigos | `createEnemy` para `encapuchado` / `espiritu` / `cabeza_olmeca` |
| `world/Catemaco*.ts`, `tools/gen-catemaco-scenery.mjs`, PNG en `escenarios/nivel-03-catemaco/`, `data/assets.json`, NPCs brujos | escenario | `installCatemacoScenery(world)` |
| `data/levels/{catemaco,campamento,altar_olmeca}.json`, `data/dialogue/n03.json`, `systems/CatemacoDirector.ts`, `docs/NIVEL_03.md` | contenido | `installCatemacoDirector(world)` |
| `systems/audio/*` (pistas `n03_*`, efectos nuevos) | audio | |

Flags de progreso del nivel: prefijo **`n03:`** en `GameState.flags`. Escudo y Luna: `GameState.shield` / `GameState.luna` / `GameState.hasBalam` (persisten entre reinicios por muerte).

## 4. Eventos nuevos del bus

`shield:state {active, energy, broken}` · `shield:block {x, y}` · `luna:state {active, energy}` · `balam:awake {}` · `cofradia:down {enemy}` · `olmeca:phase {phase}`. Se reutilizan `boss:phase`, `boss:vulnerable`, `boss:calmed` (al vencer a la Cabeza) y `enemy:*`.

## 5. Conjuros y afinidades (NIVELES §3)

| | LUZ (3) | SOL (3) | VOZ | CALMA | PROTECCION | Láser rojo |
|---|---|---|---|---|---|---|
| Encapuchado | aturde | **inconsciente** (daño fuerte) | aturde | ✖ sin efecto | empuja | daño → inconsciente |
| Espíritu (`lunaOnly`) | **purifica** | daña | aturde | purifica | ➖ | ✖ (no le afecta) |
| Cabeza Olmeca | ✅ en ventana | ✅ en ventana | ✅ en ventana | ❌ (se enfurece) | ➖ | ✖ (piedra) |

LUZ: purifica espíritus en radio; ilumina. SOL: ráfaga ofensiva en línea hacia donde mira el jugador. Valida los nombres con `checkWord()`.

## 6. Jefe: la Cabeza Olmeca Poseída (estática, gran escala, placeholder)

- **Fase 1:** ondas de choque por el suelo (esquivar o saltar).
- **Fase 2:** láseres oculares que barren la franja (moverse en profundidad o escudo).
- **Fase 3:** invoca espíritus (`lunaOnly`; usar Luna + LUZ).
- **Ventanas de vulnerabilidad:** tras cada ataque grande sus ojos se apagan unos segundos → LUZ/SOL/VOZ hacen efecto. Cambia de fase al recibir N conjuros efectivos. CALMA la enfurece (contraataque rápido).
- Al vencerla: `boss:calmed`, ~300 Ecos (GDD 5.1).

## 7. Personajes (AGENTS.md §8.0)

| Personaje | Tipo | Arte por IA |
|---|---|---|
| Encapuchado Rojo, espíritu, Cabeza Olmeca, Balam, María | importantes | **Placeholder simple** con medidas del kit; `kit_<id>` del equipo los reemplaza solo |
| 3 brujos buenos, pobladores, gatos negros (props) | comunes | **Diseño completo** en estilo del juego |

Medidas placeholder: encapuchado humanoide 64×80 (pivote 32,78, ~72 px); espíritu criatura flotante ~40 px; Balam criatura pequeña ~24 px (gato); María humanoide 64×80; Cabeza Olmeca jefe ~120 px de alto (cuadro 160×128 aprox.).
