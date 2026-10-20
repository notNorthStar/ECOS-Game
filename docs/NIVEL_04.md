# Nivel 4 — Oaxaca: los tejidos de la memoria

> Rama `nivel-4-oaxaca`. Contenido (JSON + director + pruebas). Contratos y reparto de dueños: `docs/NIVEL_04_CONTRATOS.md`. Historia: `docs/NDD_v2.md` (Nivel 4, definitiva). Patrón copiado del Nivel 3 (`CatemacoDirector.ts`).

## Recorrido (12–15 min)

| Sección | Ancho | Qué pasa | Música |
|---|---|---|---|
| `oaxaca` | 3000 | Letras de OAXACA + altar (checkpoint). Calles con 4 encapuchados rojos y pobladores acorralados. **Taller de tres artesanos tejedores** (Doña Gudelia → Don Facundo → Doña Lucrecia): explican que los patrones de los textiles guardan la memoria y Lucrecia enseña **MEMORIA** con el aprendizaje guiado. Después, 3 bestias de prueba. Salida a callejones (requiere MEMORIA) | `n04_ciudad` |
| `callejones` | 3000 | Mercado arruinado: 7 bestias (4 sueltas + **3 del grupo marcado** junto al muro) y 4 encapuchados. Altar intermedio (x 1450). Juguetes y ropa de niños disparan un comentario de María. Al purificar las 3 bestias marcadas se **revela el pasaje**: el muro tejido de piedra se abre. Salida a Santo Domingo (requiere pasaje) | `n04_ciudad` (las arenas cambian solas a `n04_combate`) |
| `santo_domingo` | 2400 | Explanada con 3 encapuchados, fachada barroca de cantera verde, interior dorado, altar (checkpoint antes de la jefa), arena de la **Bruja Guajolote**. Al vencerla: el fuego fatuo se apaga, aparece el **2.º fragmento del Sello**, María dice algo breve y la salida vuelve al título (CDMX aún no existe) | `n04_templo` / `n04_jefe` |

Compuertas (muros invisibles con `lockArena`): calle de Oaxaca hasta x 2000 sin MEMORIA; callejones hasta x 2520 sin pasaje. Si el jugador llega sin cumplir, sale un toast.

## Controles y pistas en pantalla

- Hablar / examinar: **E**. Conjuro: **Q** (MEMORIA purifica bestias; LUZ y SOL contra la Bruja; escudo con clic derecho contra sus proyectiles de fuego).
- Toasts de tutorial: encapuchados (SOL / láser rojo), bestias (láser rojo las agota, MEMORIA las purifica), bestia agotada, formas de la Bruja (`bruja:form`), ventana de vulnerabilidad.
- HUD del director (arriba a la izquierda): `ARTESANOS n/3`, `MURO n/3` y el objetivo actual; el rastro de luz de la gema apunta al siguiente objetivo.

## Flags (`GameState.flags`, prefijo `n04:`, persisten tras morir)

`intro` · `maria_llegada` · `maria:<clave>` (comentarios ya dichos) · `artesano:gudelia|facundo|lucrecia` · `memoria` · `desc:<clave>` (descubrimientos y juguetes) · `pasaje` · `bruja_intro` · `bruja` · `bruja_fin` · `fragmento` · `completo` · `letras_cp:<seccion>` · `salida:<seccion>` · `down:<seccion>:<índice>` (enemigos derrotados; no reaparecen) · `tip_*` (avisos ya mostrados).

## Actions

- **Interactuables:** `n04_examinar` (diálogo + Ecos por `descubrimiento`) · `altar` · `n04_artesano` (`data.artesano`) · `n04_juguetes` (`data.maria`) · `n04_muro` · `n04_fragmento` · `n04_salida`.
- **Triggers:** `letras` (nombre de zona + checkpoint) · `dialogo` (`data.dialogue`, `data.toast`, `data.maria`) · `ir_seccion` (`data.section`, `data.spawn`, `data.requires`) · `bruja_arena` (`lockArena` + `arena:start`).

## Datos

- `src/data/levels/{oaxaca,callejones,santo_domingo}.json`: suelo y=222…345; las bestias del grupo del pasaje son las de `callejones` con x entre `pasaje.x0` y `pasaje.x1`; la Bruja nace en `santo_domingo` con `group: "bruja"` y aparece al emitirse `arena:start`.
- `src/data/oaxaca.json`: compuertas, rango del pasaje, arena, premios y los comentarios de María (texto y duración).
- `src/data/dialogue/n04.json`: diálogos de tú, tono oscuro y de memoria/textiles (hablantes con prefijo `n04_`). Artesanos: Doña Gudelia, Don Facundo, Doña Lucrecia. No adelanta nada del pasado ni del futuro de María.
- `src/systems/OaxacaDirector.ts`: `installOaxacaDirector(world)`, un solo director para las tres secciones.

## Ecos (~700)

Enemigos: 10 bestias (12 Ecos, +50 % al purificar ≈ 180) + 11 encapuchados rojos (8 ≈ 90) + Bruja (350) ≈ 620. Director (directos con `addEcos`): artesanos 3×8, MEMORIA 15, descubrimientos 4 c/u, juguetes y ropa 8 c/u, pasaje 20, fragmento 30 ≈ 125. Todo ajustable en `oaxaca.json` y `enemies.json`.

## APIs de otros agentes que se asumen (todo con importación defensiva)

- `Maria.ts`: `mariaSay(text, ms?)` (si no existe, el director emite `maria:say` por el bus). Los comentarios solo se dicen con `GameState.hasMaria`.
- `spells.json`: `MEMORIA`. Si no existe su definición, el director la concede sin aprendizaje guiado y avisa en consola.
- Enemigos `bestia` (emite `enemy:purified`, `enemy:exhausted`), `bruja_guajolote` (`bruja:form`, `boss:vulnerable`, `boss:calmed`) y `encapuchado` rojo (`cofradia:down`).
- Escenario (claves de textura; si falta una, el mundo dibuja respaldo): `prop_n04_letras_oaxaca`, `altar_memoria`, `prop_n04_telar`, `prop_n04_textiles`, `prop_n04_puesto`, `prop_n04_puesto_roto`, `prop_n04_agave`, `prop_n04_farol`, `prop_n04_cartel`, `prop_n04_juguetes`, `prop_n04_ropa`, `prop_n04_retablo`, `prop_n04_muro_cerrado` / `prop_n04_muro_abierto` (el prop con id `n04_muro_pasaje` cambia de textura al revelar el pasaje), `prop_n04_columna_rota`, `prop_n04_estandarte`, `prop_n04_fachada_templo`, `prop_n04_candelabro`, `prop_n04_fragmento_sello` (id `n04_fragmento`, oculto hasta vencer a la Bruja), NPCs `npc_artesano_1..3` y `npc_poblador_n04_1..4`.

## Pruebas

`npm run test:nivel4` (26 pruebas): datos en suelo transitable, conteos de enemigos, diálogos y hablantes, MEMORIA con `checkWord`, y el director real con adaptadores: orden taller → pasaje → jefa, compuertas, revelación del pasaje, persistencia tras morir, respaldo de la jefa y cierre.

## Pendientes

- Probar en el navegador con el escenario, las bestias y la Bruja ya integrados; ajustar posiciones de props y enemigos.
- Equilibrio (vida de bestias, ventanas de la Bruja, Ecos totales) y duración real.
- Revisar `public/assets/escenarios/nivel-04-oaxaca/LEEME.md` cuando exista y ajustar las claves.
- Pasar al CDMX (Nivel 6) cuando exista: hoy la salida del templo vuelve al título.
- Probar MEMORIA con la cámara (MEMORIA tiene 7 letras).

## Estado verificado (2026-10-19)

Partida completa en navegador, solo teclado: artesanos (MEMORIA) → 7 enemigos de las calles → callejones (11 enemigos, comentario de María con los juguetes, pasaje revelado) → Santo Domingo → Bruja Guajolote (alterna humana/ave; LUZ y SOL en sus ventanas) → 2.º fragmento → título. Corregido: el contador de misión se encimaba con las barras de escudo/Luna/María (ahora en y = 90).
