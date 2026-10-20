# Nivel 10 — Guadalajara: la trampa y el eclipse final

> Rama `nivel-10-guadalajara` (sale de `nivel-7-cdmx2`). Historia **definitiva** en `docs/NDD_v2.md` (Nivel 10 y Epílogo, con la marca de "versión jugable"); contratos entre agentes en `docs/NIVEL_10_CONTRATOS.md`. Esta guía cubre la parte de **contenido**: niveles JSON, diálogos, números, créditos y el `GdlDirector`.
> Pruebas: `npm run test:nivel10` (24 pruebas con el director real y mocks de Casting, BalamJaguar, Madre, GdlScenery, EpilogoScene y mundo).

## 1. Recorrido (~15–20 min, Ecos ~800 **sin canje**: tras el altar de la avenida ya no hay altares)

| Sección | Archivo | Ancho | Música | Qué pasa |
|---|---|---|---|---|
| `gdl_avenida` | `src/data/levels/gdl_avenida.json` | 2600 | `n10_avenida` | Llegada bajo el eclipse (`n10_llegada`). Letras "GUADALAJARA" + checkpoint, **3 encuentros tipo arena** (chaneques y bestias · encapuchados rojo/negro y espíritus con Luna · guardia de élite), **último Altar de la Memoria** (x 1380) con punto de control y la **puerta de la Catedral**, que exige haber despejado los 3. `eclipse:progress` sube de 0 a 0.6 con el avance. |
| `catedral` | `catedral.json` | 1800 | `n10_catedral` | Nave de la Catedral. **Oleada final** en arena fija (x 0–1500) en **3 tandas**: chaneques/encapuchados rojos/bestia · negros, élite, espíritus y muñecas · nahuales, élite, negro, bestia, espíritu. Al limpiar aparece la madre encadenada (`placeMadre`) y el trigger del altar mayor (x 1500) lanza la **emboscada**. |
| `catedral_eclipse` | `catedral_eclipse.json` | 1600 | `n10_catedral` → `n10_tzitzimime` → `n10_itzpapalotl` → `n10_epilogo` | Techo abierto, `eclipse:progress` 1. Cadena atado → Fase 1 → Fase 2 → epílogo (ver §3). |

## 2. La emboscada (`catedral`)

`n10_altar_mayor` (llegas al altar; ella no te reconoce) → aparece el alto mando (props `n10_mando_1..3`, empiezan invisibles) → `n10_emboscada`: **la madre no sabía dónde estaban los fragmentos porque le borraron la memoria; la llamada de la CDMX fue una simulación** (una voz armada con tus recuerdos: ella nunca te habla con voz, te habla con las manos); **te dejaron vivo desde Xalapa para que juntaras los 6** → `n10_codice` (te quitan el Códice; flag `n10:codice_perdido`; los brazos quedan atados pero **los dedos libres**) → `n10_invocacion` (usan a la madre para abrir el Códice) → `openCathedralRoof(3600)` + `eclipse:progress` 1 → `n10_techo` (bajan las Tzitzimime, el capullo late) → `gotoSection('catedral_eclipse', 'atado')`.

## 3. `catedral_eclipse`

1. **Cadena atada** (`GameState.bound = true` + `player:bound`; tiempo a `final.timeScale` = 0.12 en cada lanzamiento): el culto habla (`n10_culto_*`) mientras deletreas a escondidas `castSpellNow('LUZ')` → `castSpellNow('MEMORIA')` → `startLearning('ECOS')` → `castSpellNow('ECOS')`. Un `fail` repite **ese** paso sin castigo (el primer fallo con diálogo de aliento, luego un aviso corto). Seguridad: tras 6 fallos instantáneos seguidos (Casting no deletrea) el paso se da por logrado para no colgar el juego. Al lograrlo: `bound = false`, `n10_libre` ("Las señas no las ata nadie"), `awakenJaguar(world, x, y)`, `n10_jaguar`.
2. **Fase 1** (arena x 180–1520, `n10_tzitzimime`): el **capullo** de Itzpapálotl ya está en escena (grupo `capullo`). Paso `f1_a`: 1 Tzitzimitl + oleada menor; paso `f1_b`: 2 Tzitzimime + 2 Negros. Escalonadas 1 → 2 (3 en total). HUD: "TZITZIMIME n/3".
3. **El capullo estalla** al caer la última: `n10_capullo`, `hatch()` de la entidad (con guarda), música `n10_itzpapalotl`, `n10_itzpa`.
4. **Fase 2**: la primera vez que aparece el núcleo (`itzpa:core`, o por tiempo si el evento no llega) → `n10_recuerdo` (infancia en el taller de Xalapa: la madre sorda le enseña a deletrear M-A-M-A y las "señas de casa") → `startLearning('MAMA')` → `n10_recuerdo_fin` → `wakeMadre()`; el conjuro seleccionado pasa a **MAMA**. El jugador lanza MAMA (Q) → la madre responde en señas y **paraliza a Itzpapálotl** (`itzpa:stagger`) → el director selecciona **ECOS** y avisa "¡Ventana abierta!"; al cerrarse la ventana vuelve a MAMA. Tres golpes de ECOS al núcleo → `boss:calmed`.
5. **Final** (`boss:calmed`): `n10_final` → `eclipse:progress` 0 (el sol regresa) → `freeMadre()` → `calmJaguar()` → música `n10_epilogo` → `n10_reencuentro` → flag `n10:completo` → `startEpilogo(scene)` (`EpilogoScene`). Sin ese módulo, vuelve al título cerrando Hud y capas como `PauseScene.quitToTitle`.

### Representación de la LSM y la cultura sorda

La madre es una criptógrafa sorda: se comunica **siempre en señas** (su hablante se muestra como "Mamá (en señas)"); su mutismo en la trampa es consecuencia del borrado de memoria, no de su sordera; el recuerdo muestra paciencia, juego y una **lengua completa** (letras y señas propias de casa). Se evitan términos como "sordomudo". La prueba automática vigila el vocabulario. Todo se deletrea con teclado o cámara; ECOS y MAMA usan solo letras permitidas (E C O S / M A).

## 4. Muerte y reintentos

- Todo el progreso vive en `GameState.flags` con prefijo `n10:`. Encuentros (`enc:*`), tandas (`tanda:*`), pasos de la cadena (`paso:*`), Fase 1 (`f1:*`) y diálogos únicos no se repiten ni pagan dos veces.
- **Nunca** queda `bound`, el control bloqueado ni el mundo congelado: `exec` restaura `controlsLocked = GameState.casting ? saved.locked : false` y `timeScale = GameState.casting ? saved.scale : 1`; al cerrar la escena se fuerza `bound = false`; si la cadena falla por un error ajeno, el `tick` la reintenta (máx. 3 veces por carga).
- Si muere en `catedral_eclipse` tras liberarse (`n10:libre`): **no** repite la cadena atada; `awakenJaguar` vuelve a ejecutarse; si ya cayeron las Tzitzimime (`n10:f1_fin`) reaparece en la **Fase 2** (el capullo nace roto sin repetir la escena, la madre despierta si ya recordó); si no, retoma en la Tzitzimitl alcanzada.
- Respaldos: si una Tzitzimitl/Itzpapálotl no existe aún (enemigos sin integrar), cada paso avanza por tiempo (`respaldoMs`) y la jefa ausente se da por calmada tras 20 s; nunca se queda atascado.

## 5. Flags `n10:*`

`intro` · `enc:av1..av3` · `tip:*` · `punto:<trigger>` · `letras_cp:<sección>` · `dlg:*` · `desc:*` · `salida:<sección>` · `catedral_llegada` · `tanda:ola1..ola3` · `oleada_fin` · `codice_perdido` · `emboscada` · `atado_dlg` · `pi:<paso>` · `paso:luz|memoria|ecos_aprender|ecos` · `libre` · `f1:f1_a|f1_b` · `f1_fin` · `capullo_roto` · `recuerdo` · `itzpa_cae` · `completo`.

## 6. Archivos de contenido

| Archivo | Contenido |
|---|---|
| `src/data/levels/{gdl_avenida,catedral,catedral_eclipse}.json` | Formato `LevelData`; todos los enemigos van en grupos de arena |
| `src/data/dialogue/n10.json` | Diálogos (prefijo `n10_`, hablantes `n10_*`) |
| `src/data/gdl.json` | Encuentros, tandas, emboscada, cadena (`final.pasos`, `final.timeScale`), Fase 1 y 2, avisos del HUD (≤ 90 caracteres), eclipse, música, recompensas, epílogo |
| `src/data/creditos.json` | Créditos de la escena final (`equipo` con "[nombre]" para que el equipo los llene, herramientas, LSM, música, folclor, declaración de IA) |
| `src/systems/GdlDirector.ts` | Director (`installGdlDirector`) |
| `tools/test-nivel-10.mjs` | Pruebas (`npm run test:nivel10`) |

Ecos aproximados (~800 sin canje): enemigos comunes de avenida y catedral (~520, `enemies.json`) + recompensas directas (~400: encuentros 3×25, tandas 3×30, cadena 4×20 + 2 conjuros×25, Tzitzimime 3×30, capullo 40, final 120). Lo que paguen las Tzitzimime y la jefa viene de `enemies.json`. Ajusta en `gdl.json` → `rewards`.

## 7. Qué asume el director de otros agentes

| Agente | API asumida | Si no existe |
|---|---|---|
| Sistemas | `Casting.castSpellNow(world, id)`; `spells.json`: ECOS y MAMA | Aviso por consola; el paso se da por logrado / el conjuro se concede sin aprendizaje guiado |
| Sistemas | `BalamJaguar.awakenJaguar(world, x, y): Promise`, `calmJaguar()` | Se marca `GameState.balamJaguar` y se emite `balam:jaguar` |
| Sistemas | `Madre.placeMadre(world, x, y)`, `wakeMadre()`, `freeMadre()`; emite `itzpa:stagger {ms}` al deletrear MAMA | Se ignora con aviso |
| Sistemas | `EpilogoScene.startEpilogo(scene)` | Vuelve al título |
| Sistemas | `GameState.bound`, `player:bound`: el Player no se mueve atado pero sí deletrea | — |
| Escenario | `GdlScenery.openCathedralRoof(ms)`; escucha `eclipse:progress`; props `prop_n10_*`; fondos `fondo_{gdl_avenida,catedral,catedral_eclipse}_capa0..5`; sprites con id `n10_mando_1..3` (en `catedral` empiezan con alpha 0) | Aviso; sin techo animado |
| Enemigos | `tzitzimitl` e `itzpapalotl` registrados; `Itzpapalotl.hatch()` (opcional: si no existe se asume que nace sola); emiten `itzpa:core {hits,max}` y `boss:calmed`; `chaneque`, `bestia`, `muneca`, `nahual` (sin `disguise` = ya transformado), `encapuchado` (rank), `espiritu` (lunaOnly) | Respaldos por tiempo (§4) |
| Audio | Pistas `n10_avenida`, `n10_catedral`, `n10_tzitzimime`, `n10_itzpapalotl`, `n10_epilogo` (`bus.emit('music', { track })`) | — |

Claves de props usadas (el integrador las mapea a lo que genere el escenario): ya existentes `altar_memoria`, `prop_n06_{auto,escombros,escombros_grandes,poste_neon}`; nuevas `prop_n10_{letras_gdl,autobus_volcado,cartel_desaparecidos,radio_vieja,puerta_catedral,organo,columna,banca_rota,vitral_roto,candelabro,altar_mayor,alto_mando,escombros_techo}`.

## 8. Pendientes

Probar en navegador con las piezas reales (Tzitzimime, Itzpapálotl, Balam jaguar, madre, techo, epílogo), equilibrar tandas y Fase 1, revisar el deletreo de ECOS con cámara, validar con personas sordas la representación de la LSM y llenar los nombres del equipo en `creditos.json`.
