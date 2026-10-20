# Nivel 3: Catemaco — El ritual del lago y el despertar de Balam

Contenido jugable (rama `nivel-3-catemaco`) basado en `NDD_v2.md` (historia definitiva), `NIVELES_ECOS.md` §4 y `NIVEL_03_CONTRATOS.md`. Este documento cubre el **guion y los datos** (secciones, diálogos, director y pruebas). Los sistemas (escudo, Luna, Balam), los enemigos y el arte los hacen otros dueños; ver `NIVEL_03_CONTRATOS.md` §3.

Duración objetivo: 12–15 min. Ecos objetivo: ~600.

## Recorrido

### 1. `catemaco` (2400 px) · música `n03_pueblo`
1. Intro en las letras de CATEMACO (diálogo `n03_intro`). Checkpoint al cruzar las letras; **Altar de la Memoria** en `(360, 270)`.
2. Pobladores y un cartel (pistas del ambiente, +5 Ecos el cartel y el altar de los brujos).
3. **Casa de los brujos buenos** (barrera invisible en x=1700 hasta completar los tres):
   - **Don Cirilo** → enseña **LUZ** (`startLearning`).
   - **Doña Eulalia** → enseña **SOL** (exige haber aprendido LUZ).
   - **Don Atanasio** → **escudo U** y práctica: lanza 3 piedras de río (inofensivas) que buscan al jugador; hay que **mantener clic derecho o la seña U** en la ventana final del vuelo para contarlas. Tras 14 lanzamientos sin éxito se da por aprendido para no atascar el nivel.
4. Tres **encapuchados rojos** vigilan el camino al lago (x≈1960–2240) y la salida (x=2360) lleva al campamento.

### 2. `campamento` (3200 px) · música `n03_lago`
1. Orilla con niebla espesa, cuatro elipses de agua y muelles. **9 encapuchados** en cuatro grupos (2 + 3 + 2 + 2 junto a las jaulas).
2. **Infiltración detectivesca**: 6 pistas (`huellas`, `orden`, `mapa`, `simbolos`, `ofrendas`, `carta`) con texto de la Cofradía (+8 Ecos cada una). Con las 6, el protagonista hace la **deducción** (+20 Ecos). Con 3 el rastro de luz ya señala las jaulas.
3. **Checkpoint intermedio**: Altar de la Memoria en x=1700.
4. **Tres jaulas** de gatos negros al fondo (x≈2820–3080). No se pueden abrir con encapuchados vivos a menos de 150 px; la **c** va al final. Las dos primeras huyen; en la **c** ocurre la escena de **Balam**: el gato toca la gema y el Códice, se vuelve alebrije (destello, tinte cambiante) → `GameState.hasBalam = true`, `luna.unlocked = true`, `unlockLuna(world)`, bus `balam:awake` (+25 Ecos). Tutorial de **F** (Luna) en el HUD hasta que se usa por primera vez.
5. La salida (x=3160) exige `n03:balam`; antes dice `n03_campamento_fin`.

### 3. `altar_olmeca` (2400 px) · música `n03_altar` → `n03_jefe`
1. Sendero con **8 espíritus `lunaOnly`** en tres grupos; el director cierra el paso con `lockArena` en x=760 / 1330 / 1620 hasta purificar cada grupo (con Luna + LUZ o CALMA). Primer uso de Luna aquí: diálogo `n03_espiritus`.
2. Altar de la Memoria (checkpoint) en x=1700 antes del jefe.
3. **Arena de la Cabeza Olmeca** (trigger x=1930): diálogo de presentación una sola vez, `lockArena(1800, 2400)`, música del jefe y `arena:start` del grupo `olmeca`. Consejos por fase en toasts: fase 1 salto, fase 2 profundidad/escudo, fase 3 Luna + LUZ, ventanas con LUZ/SOL/VOZ.
4. `boss:calmed` → `n03_cabeza_fin` → **María** entra caminando, busca a sus hijos y se une (`n03_maria_1/2`). Si se muere o se reinicia entre ambos, se retoma la escena.
5. Salida «Camino a Oaxaca» (x=2330) → `n03_salida` → título (Oaxaca aún no existe).

## Controles específicos

| Acción | Entrada |
|---|---|
| Interactuar / hablar | **E** |
| Escudo U (sin cámara) | **clic derecho mantenido** (con cámara: seña U sostenida) |
| Luna | **F** (alterna encendido/apagado; gasta barra y se recarga sola) |
| Conjuro | **Q** (LUZ y SOL se eligen en la rueda con Q mantenida) |
| Láser rojo (daña/inconscientes) | **2**; verde: **1** |

## Datos y archivos

| Archivo | Contenido |
|---|---|
| `src/data/levels/catemaco.json`, `campamento.json`, `altar_olmeca.json` | Mapas, props, interactuables, triggers y enemigos |
| `src/data/dialogue/n03.json` | Diálogos y hablantes (`n03_*`) |
| `src/data/catemaco.json` | Pistas, jaulas, compuertas de espíritus, práctica del escudo, arena, María y recompensas |
| `src/systems/CatemacoDirector.ts` | Lógica de las tres secciones |
| `tools/test-nivel-03.mjs` | `npm run test:nivel3` |

### Actions de interactuables
`n03_examinar` (data: `dialogue`, `descubrimiento`) · `altar` · `n03_brujo` (data.`brujo`: `luz` / `sol` / `escudo`) · `n03_pista` (data.`pista`, `dialogue`) · `n03_jaula` (data.`jaula`: `a`/`b`/`c`) · `n03_salida`.

### Actions de triggers
`letras` · `dialogo` (data.`dialogue`, `toast`) · `ir_seccion` (data.`section`, `spawn`, `requires`) · `olmeca_arena` (data.`group`, `x0`, `x1`).

### Flags (`GameState.flags`, prefijo `n03:`)
`intro` · `letras_cp` · `brujo:luz|sol|escudo` · `escudo_visto` · `brujos_ok` · `desc:<clave>` · `pista:<id>` · `deduccion` · `jaula:a|b|c` · `balam` · `luna_tut` · `campamento_fin` · `salida:<sección>` · `espiritus_vistos` · `cabeza_intro` · `cabeza` · `maria` · `completo` · `tip_ventana` · `down:<sección>:<índice>` (enemigo derrotado: no reaparece tras morir).

Todo el progreso sobrevive a la muerte (reinicio por checkpoint). `GameState.shield.unlocked`, `GameState.luna.unlocked` y `GameState.hasBalam` los pone el director.

### Ecos
Director: brujos 2×8 + escudo 15 + descubrimientos 3×5 + pistas 6×8 + deducción 20 + jaulas 3×8 + Balam 25 ≈ 163 (premio directo con `addEcos` y texto flotante; no usa orbes para que morir no pierda el premio). Enemigos (valores de `enemies.json`): 12 encapuchados + 8 espíritus + Cabeza (~300). Total estimado: ~600, pendiente de una partida humana.

## Dependencias de otros dueños

- `Shield.ts`: `isShieldActive()` y `shieldFilterHit()` (la práctica los usa); `unlockShield(world)` opcional.
- `Luna.ts`: `unlockLuna(world)` opcional (siempre se pone además `GameState.luna.unlocked`).
- `Casting.startLearning` / `getSpellDef`: si LUZ o SOL no están aún en `spells.json`, se conceden sin aprendizaje guiado y se avisa en la consola.
- Enemigos: `encapuchado` (emite `cofradia:down`), `espiritu` (`enemy:purified`), `cabeza_olmeca` (`olmeca:phase`, `boss:vulnerable`, `boss:calmed`).
- Escenario: los NPC y props están en el JSON de cada sección (`npc_brujo_1/2/3`, `npc_poblador_n03_1/2`, `prop_n03_*`); `installCatemacoScenery` no debe volver a colocarlos. María usa el sprite `npc_maria` si existe; si no, un bloque morado con una M.

## Estado verificado (2026-10-19)

Partida completa en navegador, solo teclado: brujos → 3 encapuchados → campamento (9 encapuchados, 6 pistas, 3 jaulas) → Balam + Luna → 8 espíritus → Cabeza Olmeca (3 fases) → María → título, ~460 Ecos. El equipo lo probó y confirmó que funciona. Corregido en la integración: daño de SOL, filtro de Luna, diálogos encadenados que bloqueaban al jugador, textos de Luna.

## Pruebas

`npm run test:nivel3` (25 pruebas): datos (ids, anchos, música, conteos de enemigos, suelo transitable para interactuables/enemigos/spawns/triggers), diálogos referenciados, `checkWord` de LUZ y SOL y el director real con adaptadores: orden de los brujos, práctica del escudo, pistas, jaulas y Balam, compuertas de espíritus, arena y María, persistencia tras morir y respaldos. No sustituye pruebas en navegador, con cámara o de audio.

## Pendientes

- Prueba humana completa (duración, equilibrio de Ecos, dificultad del campamento) y con cámara (seña U).
- María aún no es compañera jugable: tras unirse queda en la explanada. Balam lo gestiona `Balam.ts`.
- Pantalla «Continuará» real: ahora la salida regresa al título.
- Conectar la salida del Nivel 2 con Catemaco (hoy el Nivel 2 vuelve al título); se hace al juntar las ramas.
- Equilibrio: el escudo mantenido se vacía en ~5 s; las ventanas de la Cabeza tardan en abrirse.
- Sigilo: los encapuchados ya tienen cono de visión (« ? » al sospechar, « ! » al verte) y reciben daño doble si los atacas sin que te vean; falta ajustar la dificultad.
- Revisar el texto de las pistas y de los brujos con el equipo (nombres propios de la región inventados: Cirilo, Eulalia, Atanasio, Doña Chayo).
- Si el estilo pide más enemigos antes de las jaulas, añadir specs en el JSON (el test valida suelo).
