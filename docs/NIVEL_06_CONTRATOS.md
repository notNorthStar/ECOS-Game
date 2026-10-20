# Nivel 6 — CDMX parte 1: contratos de implementación

> Rama `nivel-6-cdmx` (sale de `nivel-4-oaxaca`). **El Nivel 5 (Puebla) se omite**: ver la nota de alcance en `AGENTS.md`. Fuente de diseño: `docs/NIVELES_ECOS.md` §4 (Nivel 6, y la ficha de Puebla para la Nahuala), `docs/NDD_v2.md` (Nivel 6 y Nivel 5 — historia **definitiva**), `docs/GDD_ECOS.md` §2.1 (doble salto), §5, §5.1, §6, §8 (nahuales infiltrados), §9. Patrón a copiar: los Niveles 3 y 4 (`docs/NIVEL_04_CONTRATOS.md`, `OaxacaDirector.ts`, `Oaxaca*.ts`, `Bestia.ts`, `BrujaGuajolote.ts`, `Maria.ts`).
> Contratos de código: `src/core/contracts.ts`, `src/core/bus.ts`, `src/core/GameState.ts`. **Regla de arte: `AGENTS.md` §8.0.**

## 1. Decisiones del equipo (2026-10-19)

- Se llega **directo desde Oaxaca** con 3 fragmentos (2.º y 3.º se dieron al vencer a la Bruja). `prepareCdmxEntry()` y la salida de Oaxaca ya existen; título: opciones 9 / 0.
- **Tres conjuros nuevos:** **VERDAD** (rompe ilusiones y disfraces), **FUEGO** (daño fuerte en línea) y **DESCANSO** (libera a los muertos que no descansan; aquí, las almas atrapadas en las muñecas). Todos pasan `checkWord()`.
- **Doble salto:** se **compra en los Altares de la Memoria** (400 Ecos; `progression.json` hoy lo tiene bloqueado "Disponible desde Puebla" → debe desbloquearse a partir de la CDMX). Sirve para **zonas opcionales** (cornisas y escombros con Ecos y pistas). Nadie se atora si no lo compra.
- **Jefa final: la Nahuala** (era la de Puebla): copias ilusorias (VERDAD o Luna revelan a la real), trampas en el suelo, y al final se **libera con CALMA**. En Reforma, junto al Ángel caído.
- **Nahuales infiltrados** (2–3 minijefes): sobrevivientes disfrazados que se transforman al hablarles (zarpazo fuerte) y huyen con poca vida. **Pista:** con Luna se ve su sombra animal; **VERDAD** los obliga a transformarse antes de que ataquen (sin el zarpazo sorpresa).
- **Encapuchados Negros** se presentan aquí (rank `negro`, ya existe en `enemies.json`).
- **María:** sigue ayudando en combate; su **desesperación crece** (incluye los diálogos que eran de Puebla). **No** se revela nada de su pasado (eso es del Nivel 7).
- Duración objetivo ~15 min. Ecos ~800.

## 2. Secciones

| id | Contenido | Ancho | Música |
|---|---|---|---|
| `xochimilco` | **Isla de las Muñecas** y canales secos: trajineras varadas, muñecas colgadas de los árboles. Emboscadas de **muñecas poseídas** (~8). Se aprende **FUEGO** (velas/antorchas de una ofrenda flotante o un brasero; el fuego que guía a los muertos). Primer altar. Alguna cornisa opcional (doble salto). | 3000 | `n06_xochimilco` |
| `avenidas` | Avenidas de Día de Muertos: ofrendas, papel picado, cempasúchil, sobrevivientes (NPCs comunes). **DESCANSO** en una ofrenda. **VERDAD** de una sobreviviente cronista o una inscripción. **2 nahuales infiltrados** entre los sobrevivientes. Muñecas (~5), chaneques, Encapuchados Rojos. Checkpoint. Zonas opcionales con doble salto. | 3200 | `n06_avenidas` (combate: `n06_combate`) |
| `reforma` | Paseo de la Reforma: **Ángel de la Independencia caído** sobre el asfalto, pirámides mexicas y rascacielos que pierden pedazos, cabinas del teleférico a lo lejos. **Encapuchados Rojos y Negros**, **1 nahual infiltrado**. Arena de **la Nahuala**. Cierre: los verdaderos habitantes revelan al **Rey del Olvido** y que se llevó a una mujer como tu madre → **estación base del teleférico** → salida (por ahora al título; Nivel 7 no existe). | 2800 | `n06_reforma` / `n06_jefe` |

Suelo transitable: franja y = **220…345**. Fondos `fondo_<seccion>_capa0..5` en `public/assets/escenarios/nivel-06-cdmx/fondos/`.

## 3. Sistemas y dueños

| Archivo | Dueño | API |
|---|---|---|
| Doble salto: `entities/Player.ts` (salto extra en el aire si `GameState.upgrades.doble_salto > 0`), `data/progression.json` (desbloqueo desde CDMX), `world/World.ts` + `world/WalkMap.ts` (obstáculos con `height`: el actor los cruza si su `z` supera esa altura) | sistemas | campo opcional `height` en `LevelData.obstacles` (ya en contracts) |
| `data/spells.json` (VERDAD, FUEGO, DESCANSO + `effectDoc`) | sistemas | |
| `entities/Muneca.ts`, `Nahual.ts`, `Nahuala.ts`, `registry.ts` (hoy lanza error para `muneca`/`nahual`/`nahuala`), `applySpell` de VERDAD/FUEGO/DESCANSO en todos los enemigos, `Combat.ts` (efectos visuales), `enemies.json`, `config/combat.ts` | enemigos | `createEnemy`; eventos `nahual:*`, `nahuala:illusion` |
| `world/Cdmx*.ts`, `tools/gen-cdmx-scenery.mjs`, PNG en `escenarios/nivel-06-cdmx/`, `data/assets.json` (solo agregar), NPCs sobrevivientes | escenario | `installCdmxScenery(world)` (ya lo llama LevelScene) |
| `data/levels/{xochimilco,avenidas,reforma}.json`, `data/dialogue/n06.json`, `data/cdmx.json`, `systems/CdmxDirector.ts`, `docs/NIVEL_06.md`, `tools/test-nivel-06.mjs` | contenido | `installCdmxDirector(world)` (ya lo llama Director) |
| `systems/audio/*` (pistas `n06_*`, efectos nuevos) | audio | |

Flags de progreso: prefijo **`n06:`**.

## 4. Nahuales infiltrados (contrato entre enemigos y contenido)

- El nivel coloca al nahual como **enemigo** con `{ type: 'nahual', id: 'nahual_1', disguise: 'npc_sobreviviente_2', x, y }` y, en la misma posición, un **interactuable** de diálogo (action del director) con `data.nahualId`.
- Disfrazado: se ve como el NPC (`disguise`), no ataca y no recibe daño. **Con Luna activa** se dibuja su **sombra animal** (pista).
- Al hablarle: el director reproduce una línea y emite `nahual:reveal {id, surprise: true}` → se transforma y lanza un **zarpazo fuerte inmediato**.
- **VERDAD** en su radio (`applySpell`): se transforma **sin** zarpazo sorpresa y queda aturdido un momento; el enemigo emite `nahual:revealed {id}` (el director quita el diálogo de ese NPC).
- Transformado: minijefe intenso (zarpazos, embestida); con poca vida **huye** (`nahual:fled {id}`, deja Ecos parciales) o, si queda agotado, se **purifica** con CALMA/LUZ/MEMORIA (Ecos completos: Nahual 60, GDD 5.1).

## 5. Conjuros y afinidades

| | VERDAD (6) | FUEGO (5) | DESCANSO (8) | CALMA | LUZ | SOL | Láser rojo |
|---|---|---|---|---|---|---|---|
| Muñeca poseída (objeto) | ➖ | **destruye** | **libera el alma** (la muñeca queda inerte, sin violencia) | ✖ | aturde | daña | daña → se rompe |
| Nahual disfrazado | **revela** | ✖ | ➖ | ✖ | ➖ | ➖ | ✖ |
| Nahual transformado | aturde | daña | ➖ | purifica si agotado | aturde | daña | daña |
| Encapuchado | aturde | **inconsciente** | ➖ | ✖ | aturde | inconsciente | daño |
| La Nahuala | **revela** a la real y disipa copias | ❌ (la cura o enfurece) | ➖ | ✅ al final, para liberarla | ➖ | ➖ | daño leve |

## 6. Jefa: la Nahuala (placeholder)

- Cambiaformas (humanoide ~72 px, cuadro 64×80; kitId `nahuala`). Arena en Reforma.
- **Copias ilusorias** (2–4) que imitan sus ataques; golpearlas las disipa sin daño real a ella. **VERDAD** disipa todas y deja expuesta a la real; **con Luna** la real se ve distinta (sombra animal / brillo).
- **Trampas en el suelo** (círculos de obsidiana que se activan al pisarlos; anunciadas).
- Sello: golpes/VERDAD/LUZ la debilitan; al quedar **agotada**, solo **CALMA** la **libera** (se arrodilla, el humo negro se va, queda una mujer liberada). `boss:calmed`, ~400 Ecos (GDD 5.1). Barra en el HUD. FUEGO ❌.

## 7. Personajes (AGENTS.md §8.0)

| Personaje | Tipo | Arte por IA |
|---|---|---|
| Muñeca poseída, nahual (humano y animal), la Nahuala, Encapuchado Negro (recolor), María, Balam | importantes | **Placeholder simple** |
| Sobrevivientes comunes (incluido el que usa de disfraz un nahual), cronista, vendedores | comunes | **Diseño completo** |

Medidas placeholder: muñeca ~30 px (cuadro 48×48); nahual humano 64×80 y animal (jaguar/coyote oscuro) ~55 px cuadro 96×64 (kitId `nahual_animal`); Nahuala 64×80.
