# Nivel 10 — Guadalajara: la trampa y el eclipse final

> Rama `nivel-10-guadalajara` (sale de `nivel-7-cdmx2`). Historia **definitiva** en `docs/NDD_v2.md` (Nivel 10 y Epílogo, con la marca de "versión jugable"); contratos entre agentes en `docs/NIVEL_10_CONTRATOS.md`. Esta guía cubre la parte de **contenido**: niveles JSON, diálogos, números, créditos y el `GdlDirector`.
> Pruebas: `npm run test:nivel10` (30 pruebas con el director real y mocks de Casting, BalamJaguar, Madre, GdlScenery, EpilogoScene y mundo).
> **Versión extendida (rama `version-extendida`, 2026-10-20):** momias en la avenida y la Catedral, **Don Ernesto** (minijefe al final de la avenida), **Vampiro** (minijefe de la Catedral), final con **caminata hasta la madre + «Liberar a mamá (E)» + conversación**, y créditos con los nombres reales del equipo. Contratos: `docs/VERSION_EXTENDIDA_CONTRATOS.md`.

## 1. Recorrido (~20–25 min, Ecos ~900 **sin canje**: tras el altar de la avenida ya no hay altares)

| Sección | Archivo | Ancho | Música | Qué pasa |
|---|---|---|---|---|
| `gdl_avenida` | `src/data/levels/gdl_avenida.json` | 2600 | `n10_avenida` | Llegada bajo el eclipse (`n10_llegada`). Letras "GUADALAJARA" + checkpoint, **4 encuentros tipo arena** (chaneques y bestias · encapuchados rojo/negro, espíritus con Luna y **2 momias** · guardia de élite con **2 momias** · **Don Ernesto**), **último Altar de la Memoria** (x 1380) con punto de control y la **puerta de la Catedral**, que exige haber despejado los 4. `eclipse:progress` sube de 0 a 0.6 con el avance. |
| `catedral` | `catedral.json` | 1800 | `n10_catedral` | Nave de la Catedral. **Oleada final** en arena fija (x 0–1500) en **3 tandas**: chaneques/encapuchados rojos/bestia · negros, élite, espíritus, muñecas y **momias** · nahuales, élite, negro, bestia, espíritu y **momia**. Luego el **minijefe Vampiro** (grupo `vampiro`, junto al altar). Al vencerlo aparece la madre encadenada (`placeMadre`) y el trigger del altar mayor (x 1500) lanza la **emboscada**. |
| `catedral_eclipse` | `catedral_eclipse.json` | 1600 | `n10_catedral` → `n10_tzitzimime` → `n10_itzpapalotl` → `n10_epilogo` | Techo abierto, `eclipse:progress` 1. Cadena atado → Fase 1 → Fase 2 → epílogo (ver §3). |

## 1.b Minijefes y momias

- **Momias** (`type: "momia"`; común, **DESCANSO las purifica**; aviso `av2` y `av3`). Van en `av2` (2), `av3` (2), `ola2` (2) y `ola3` (1). Las implementa el agente de enemigos.
- **Don Ernesto** (`type: "don_ernesto"`, grupo `don_ernesto`; apostador que pactó con el diablo, guardián de la Catedral). Es el **4.º encuentro** de la avenida (`av4`, arena x 2220–2590, trigger x 2310). Al pisar el trigger: diálogo `n10_ernesto_intro` (mundo congelado, la arena aún no se bloquea) → se bloquea la arena y aparece → al vencerlo `n10_ernesto_fin` (incluye la descripción de la puerta, que antes era el trigger `n10_av_puerta_aviso`, ya eliminado). **La puerta de la Catedral no abre hasta liberarlo.** Paga `rewards.minijefe`. Aviso: «VERDAD revela sus trampas, FUEGO lo cura».
- **Vampiro** (`type: "vampiro"`, grupo `vampiro`; hombre alto de traje junto al altar que se transforma). Va **después de la 3.ª tanda y antes de la emboscada**, con la arena aún cerrada: pausa → `n10_vampiro_intro` → aparece → al vencerlo `n10_vampiro_fin` → `oleadaFin` (aparece la madre). Paga `rewards.minijefe`. Aviso: «SOL y LUZ lo hieren».
- Ambos minijefes tienen **respaldo por tiempo** (`respaldoMs`): si el tipo de enemigo aún no está integrado y el grupo nunca aparece, el encuentro se da por terminado y la puerta/Catedral no se atascan.
- El HUD del director muestra `AVENIDA n/4` (con el nombre del encuentro activo), `EL VAMPIRO` durante su pelea y el objetivo de luz apunta al siguiente trigger.

## 2. La emboscada (`catedral`)

`n10_altar_mayor` (llegas al altar; ella no te reconoce) → aparece el alto mando (props `n10_mando_1..3`, empiezan invisibles) → `n10_emboscada`: **la madre no sabía dónde estaban los fragmentos porque le borraron la memoria; la llamada de la CDMX fue una simulación** (una voz armada con tus recuerdos: ella nunca te habla con voz, te habla con las manos); **te dejaron vivo desde Xalapa para que juntaras los 6** → `n10_codice` (te quitan el Códice; flag `n10:codice_perdido`; los brazos quedan atados pero **los dedos libres**) → `n10_invocacion` (usan a la madre para abrir el Códice) → `openCathedralRoof(3600)` + `eclipse:progress` 1 → `n10_techo` (bajan las Tzitzimime, el capullo late) → `gotoSection('catedral_eclipse', 'atado')`.

## 3. `catedral_eclipse`

1. **Cadena atada** (`GameState.bound = true` + `player:bound`; tiempo a `final.timeScale` = 0.12 en cada lanzamiento): el culto habla (`n10_culto_*`) mientras deletreas a escondidas `castSpellNow('LUZ')` → `castSpellNow('MEMORIA')` → `startLearning('ECOS')` → `castSpellNow('ECOS')`. Un `fail` repite **ese** paso sin castigo (el primer fallo con diálogo de aliento, luego un aviso corto). Seguridad: tras 6 fallos instantáneos seguidos (Casting no deletrea) el paso se da por logrado para no colgar el juego. Al lograrlo: `bound = false`, `n10_libre` ("Las señas no las ata nadie"), `awakenJaguar(world, x, y)`, `n10_jaguar`.
2. **Fase 1** (arena x 180–1520, `n10_tzitzimime`): el **capullo** de Itzpapálotl ya está en escena (grupo `capullo`). Paso `f1_a`: 1 Tzitzimitl + oleada menor; paso `f1_b`: 2 Tzitzimime + 2 Negros. Escalonadas 1 → 2 (3 en total). HUD: "TZITZIMIME n/3".
3. **El capullo estalla** al caer la última: `n10_capullo`, `hatch()` de la entidad (con guarda), música `n10_itzpapalotl`, `n10_itzpa`.
4. **Fase 2**: la primera vez que aparece el núcleo (`itzpa:core`, o por tiempo si el evento no llega) → `n10_recuerdo` (infancia en el taller de Xalapa: la madre sorda le enseña a deletrear M-A-M-A y las "señas de casa") → `startLearning('MAMA')` → `n10_recuerdo_fin` → `wakeMadre()`; el conjuro seleccionado pasa a **MAMA**. El jugador lanza MAMA (Q) → la madre responde en señas y **paraliza a Itzpapálotl** (`itzpa:stagger`) → el director selecciona **ECOS** y avisa "¡Ventana abierta!"; al cerrarse la ventana vuelve a MAMA. Tres golpes de ECOS al núcleo → `boss:calmed`.
5. **Final extendido** (`boss:calmed`):
   1. `n10_final` (cae Itzpapálotl; las cadenas del altar siguen) → `eclipse:progress` 0 (el sol regresa) → música en silencio → **el jugador recupera el control**, sin enemigos (la arena se abre). Fase interna `liberar`.
   2. Un **rastro de luz** (`setObjective` / `objective`) lo lleva al interactuable `n10_liberar` (`catedral_eclipse.json`, x 1350) y el HUD dice «Libera a tu madre (E)». Aviso `liberar`.
   3. Al acercarse aparece **«Liberar a mamá (E)»**. Con E: música `n10_reencuentro`, `freeMadre()` (las cadenas se rompen; la madre queda **libre y de pie**, ojos abiertos), `madreApproach()` (camina junto al jugador) y la **conversación** `n10_reencuentro` → `n10_reencuentro_2` → `n10_reencuentro_3` (`final.liberar.dialogos`) mientras `madreGesture()` anima sus manos. Ella habla en LSM (el narrador describe sus señas; el protagonista responde en señas). En la 2.ª parte `calmJaguar()`: Balam vuelve a gato alebrije.
   4. Flag `n10:completo` → pausa `epilogo.pausaMs` → `startEpilogo(scene)` (`EpilogoScene`). Sin ese módulo, vuelve al título cerrando Hud y capas como `PauseScene.quitToTitle`.
   - **Nunca queda congelado:** todo ocurre en `run()`/`exec()`; el jugador es libre en el paso 2. Si la liberación falla a medias (error ajeno), `liberarMadre` vuelve a `liberar` y se puede repetir con E. Si se sale del juego después de que cayó la jefa (`n10:itzpa_cae`), al volver **no se repite la pelea**: se retoma en «liberar», o directo en la conversación si ya se habían roto las cadenas (`n10:madre_libre`).
   - Si la jefa no existe (respaldo), igualmente se llega a `liberar`.

### Representación de la LSM y la cultura sorda

La madre es una criptógrafa sorda: se comunica **siempre en señas** (su hablante se muestra como "Mamá (en señas)"); su mutismo en la trampa es consecuencia del borrado de memoria, no de su sordera; el recuerdo muestra paciencia, juego y una **lengua completa** (letras y señas propias de casa). Se evitan términos como "sordomudo". La prueba automática vigila el vocabulario. Todo se deletrea con teclado o cámara; ECOS y MAMA usan solo letras permitidas (E C O S / M A).

## 4. Muerte y reintentos

- Todo el progreso vive en `GameState.flags` con prefijo `n10:`. Encuentros (`enc:*`), tandas (`tanda:*`), pasos de la cadena (`paso:*`), Fase 1 (`f1:*`) y diálogos únicos no se repiten ni pagan dos veces.
- **Nunca** queda `bound`, el control bloqueado ni el mundo congelado: `exec` restaura `controlsLocked = GameState.casting ? saved.locked : false` y `timeScale = GameState.casting ? saved.scale : 1`; al cerrar la escena se fuerza `bound = false`; si la cadena falla por un error ajeno, el `tick` la reintenta (máx. 3 veces por carga).
- Si muere en `catedral_eclipse` tras liberarse (`n10:libre`): **no** repite la cadena atada; `awakenJaguar` vuelve a ejecutarse; si ya cayeron las Tzitzimime (`n10:f1_fin`) reaparece en la **Fase 2** (el capullo nace roto sin repetir la escena, la madre despierta si ya recordó); si no, retoma en la Tzitzimitl alcanzada.
- Respaldos: si una Tzitzimitl/Itzpapálotl no existe aún (enemigos sin integrar), cada paso avanza por tiempo (`respaldoMs`) y la jefa ausente se da por calmada tras 20 s; nunca se queda atascado.

## 5. Flags `n10:*`

`intro` · `enc:av1..av4` (`dlg:av4_intro`) · `vampiro_fin` · `dlg:vampiro_intro` · `itzpa_cae` · `madre_libre` · `tip:*` · `punto:<trigger>` · `letras_cp:<sección>` · `dlg:*` · `desc:*` · `salida:<sección>` · `catedral_llegada` · `tanda:ola1..ola3` · `oleada_fin` · `codice_perdido` · `emboscada` · `atado_dlg` · `pi:<paso>` · `paso:luz|memoria|ecos_aprender|ecos` · `libre` · `f1:f1_a|f1_b` · `f1_fin` · `capullo_roto` · `recuerdo` · `itzpa_cae` · `completo`.

## 6. Archivos de contenido

| Archivo | Contenido |
|---|---|
| `src/data/levels/{gdl_avenida,catedral,catedral_eclipse}.json` | Formato `LevelData`; todos los enemigos van en grupos de arena |
| `src/data/dialogue/n10.json` | Diálogos (prefijo `n10_`, hablantes `n10_*`) |
| `src/data/gdl.json` | Encuentros, tandas, emboscada, cadena (`final.pasos`, `final.timeScale`), Fase 1 y 2, avisos del HUD (≤ 90 caracteres), eclipse, música, recompensas, epílogo |
| `src/data/creditos.json` | Créditos de la escena final: `equipo[{nombre, roles[]}]` (nombres reales de Listick Games), sección de IAs (`{nombre, roles[]}`), herramientas, LSM, música, folclor, declaración de IA. `EpilogoScene` los muestra (nombre en turquesa + roles) y `CREDITOS.md` va en sincronía |
| `src/systems/GdlDirector.ts` | Director (`installGdlDirector`) |
| `tools/test-nivel-10.mjs` | Pruebas (`npm run test:nivel10`) |

Ecos aproximados (~900 sin canje): enemigos comunes de avenida y catedral (~620, `enemies.json`, con momias) + recompensas directas (~520: encuentros 3×25, **minijefes 2×60 (`rewards.minijefe`)**, tandas 3×30, cadena 4×20 + 2 conjuros×25, Tzitzimime 3×30, capullo 40, final 120). Lo que paguen las Tzitzimime y la jefa viene de `enemies.json`. Ajusta en `gdl.json` → `rewards`.

## 7. Qué asume el director de otros agentes

| Agente | API asumida | Si no existe |
|---|---|---|
| Sistemas | `Casting.castSpellNow(world, id)`; `spells.json`: ECOS y MAMA | Aviso por consola; el paso se da por logrado / el conjuro se concede sin aprendizaje guiado |
| Sistemas | `BalamJaguar.awakenJaguar(world, x, y): Promise`, `calmJaguar()` | Se marca `GameState.balamJaguar` y se emite `balam:jaguar` |
| Sistemas | `Madre.placeMadre(world, x, y)`, `wakeMadre()`, `freeMadre(): Promise`; emite `itzpa:stagger {ms}` al deletrear MAMA | Se ignora con aviso |
| Contenido (`Madre.ts`) | `madreApproach(x, ms)` (camina), `madreGesture(ms)` (señas sin paralizar a nadie; emite solo `madre:sign`), `isMadreFree()`; tras `freeMadre()` queda libre y de pie | Sin ellas la conversación igual se muestra |
| Sistemas | `EpilogoScene.startEpilogo(scene)` | Vuelve al título |
| Sistemas | `GameState.bound`, `player:bound`: el Player no se mueve atado pero sí deletrea | — |
| Escenario | `GdlScenery.openCathedralRoof(ms)`; escucha `eclipse:progress`; props `prop_n10_*`; fondos `fondo_{gdl_avenida,catedral,catedral_eclipse}_capa0..5`; sprites con id `n10_mando_1..3` (en `catedral` empiezan con alpha 0) | Aviso; sin techo animado |
| Enemigos | **`momia`, `vampiro`, `don_ernesto`** registrados en `entities/registry.ts` (grupos `don_ernesto` y `vampiro` aparecen con `arena:start`; el director solo espera a que mueran, con respaldo por tiempo). `tzitzimitl` e `itzpapalotl` registrados; `Itzpapalotl.hatch()` (opcional: si no existe se asume que nace sola); emiten `itzpa:core {hits,max}` y `boss:calmed`; `chaneque`, `bestia`, `muneca`, `nahual` (sin `disguise` = ya transformado), `encapuchado` (rank), `espiritu` (lunaOnly) | Respaldos por tiempo (§4) |
| Audio | Pistas `n10_reencuentro` (soundtrack del equipo, suena al liberar a la madre), `n10_avenida`, `n10_catedral`, `n10_tzitzimime`, `n10_itzpapalotl`, `n10_epilogo` (`bus.emit('music', { track })`) | — |

Claves de props usadas (el integrador las mapea a lo que genere el escenario): ya existentes `altar_memoria`, `prop_n06_{auto,escombros,escombros_grandes,poste_neon}`; nuevas `prop_n10_{letras_gdl,autobus_volcado,cartel_desaparecidos,radio_vieja,puerta_catedral,organo,columna,banca_rota,vitral_roto,candelabro,altar_mayor,alto_mando,escombros_techo}`.

## 8. Pendientes

Probar en navegador con las piezas reales (momias, Don Ernesto, Vampiro, Tzitzimime, Itzpapálotl, Balam jaguar, madre libre y de pie, techo, epílogo), equilibrar tandas, minijefes y Fase 1, revisar el deletreo de ECOS con cámara y validar con personas sordas la representación de la LSM (en especial la conversación del reencuentro). Los nombres del equipo ya están en `creditos.json`.
