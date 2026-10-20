# Nivel 7 — CDMX parte 2: teleférico, Rey del Olvido y La Llorona

> Rama `nivel-7-cdmx2` (sale de `nivel-6-cdmx`). Historia **definitiva** en `docs/NDD_v2.md` (Nivel 7); contratos entre agentes en `docs/NIVEL_07_CONTRATOS.md`. Esta guía cubre la parte de **contenido**: niveles JSON, diálogos, números y el `Cdmx2Director`.
> Pruebas: `npm run test:nivel7` (21 pruebas con el director real y mocks de Casting, Maria, Llorona y mundo).

## 1. Recorrido (15–18 min, ~1,300 Ecos, 4.º fragmento + la falsa llamada)

| Sección | Archivo | Ancho | Música | Qué pasa |
|---|---|---|---|---|
| `teleferico` | `src/data/levels/teleferico.json` | 800 | `n07_teleferico` | La cabina es una **arena fija** (`lockArena(0, 800)`). Intro (`n07_llegada`) y **4 oleadas** que entran por las puertas izquierda/derecha: espíritus `lunaOnly` (hay que usar Luna, F) y encapuchados rojos/negros. Tras la ola 1: tormenta; tras la ola 2: María ("Yo olvidé algo…"). Emite `cablecar:progress` 0→1; al llegar a la estación superior: `gotoSection('torre')`. |
| `torre` | `torre.json` | 2600 | `n07_torre` | Pasillos con consolas. **7 encapuchados de élite** + 2 Negros. Punto de control al entrar y a la mitad (`mitad`), **altar** en x 1300, dos consolas examinables. La puerta del trono (`ir_seccion`, `requires: 'elite'`) no abre hasta vencer a la élite; al limpiarla: +Ecos y aviso. |
| `salon_trono` | `salon_trono.json` | 1800 | `n07_salon` → `n07_jefe` → `n07_llorona` → `n07_salon` | Trigger `revelacion` → diálogo → `mariaTransform()` → `summonLlorona()` → Rey del Olvido (arena `rey`, x 600–1800). Al `boss:calmed`, secuencia final, despedida, 4.º fragmento, consola y salida al título. |

## 2. La revelación (sugerida, sin violencia gráfica)

`n07_revelacion` → el Rey y María: voz del Rey, recuerdos borrosos en pantallas (orilla de un río, dos siluetas pequeñas, agua, unas manos que no sostienen nada) y se corta antes de mostrar más. María no ve el hecho: lo intuye y se quiebra. `n07_transformacion`: se deshace en agua y se convierte en la Llorona; su furia es contra el Rey. Nunca se muestra ni se nombra violencia explícita; la prueba automática vigila palabras como sangre o cadáver.

## 3. Jefe y secuencia final

1. Revelación → checkpoint en `spawns.jefa` → Llorona aliada + Rey. HUD: "Rompe la corona con SOL o FUEGO · MEMORIA lo debilita". Avisos únicos de ventana de vulnerabilidad, corona rota y controles invertidos.
2. `boss:calmed` → flag `n07:rey`, música `n07_llorona`, `setLloronaWild(true)` y la secuencia (tiempo a `final.timeScale` = 0.12 en cada lanzamiento):
   `startLearning('CONSUELO')` → `castSpellNow('CONSUELO')` → `castSpellNow('MEMORIA')` → `startLearning('PAZ')` → `castSpellNow('PAZ')`.
3. Un resultado `fail` repite **ese** paso sin castigo (primer fallo con diálogo de aliento, luego un aviso corto). Cada paso logrado deja el flag `n07:paso:<id>` y +Ecos una sola vez.
4. `setLloronaWild(false)` → `n07_despedida` (recupera el amor por sus hijos; Balam se queda) → `dismissLlorona()`, `hasMaria = false` → `n07_fragmento` (flag `n07:fragmento_4`) → consola detrás del trono (E): `n07_consola_falsa` (la "madre" manda a Guanajuato y Jalisco; sutil, el jugador no lo sabe) → `n07_cierre` → `n07:completo` → `scene.start('Title')` (Guanajuato aún no existe; el destino está en `cdmx2.json` → `salida.escena`).

## 4. Muerte y reintentos

- Todo el progreso vive en `GameState.flags` con prefijo `n07:`. Las oleadas ya superadas (`n07:ola:N`) no se repiten; las élites vencidas (`n07:down:torre:<i>`) no reaparecen; los diálogos únicos no se repiten.
- Si el jugador muere contra el Rey, `World.respawn` reinicia la sección en el punto de control: el director ve `transformada` sin `rey`, dice `n07_reintento`, vuelve a invocar a la Llorona y emite `arena:start` → el Rey nace **limpio**. María no se transforma otra vez.
- Si se sale o muere con el Rey calmado y la secuencia sin terminar, `intro()` la retoma desde el primer paso no logrado. Si un sistema ajeno lanza un error a mitad, el `exec` restaura `controlsLocked = GameState.casting ? saved.locked : false` y `timeScale = GameState.casting ? saved.scale : 1` (nunca se queda congelado) y el `tick` la reintenta (máx. 3 veces por carga).
- Al cerrar la escena se fuerza `GameState.controlsInverted = false`.

## 5. Flags `n07:*`

`intro` · `ola:0..3` · `teleferico_fin` · `estacion_dlg` · `torre_intro` · `down:<sección>:<i>` · `elite_fin` · `punto:<trigger>` · `letras_cp:<sección>` · `dlg:*` · `maria:*` · `desc:*` · `tip_*` · `revelacion` · `transformada` · `rey` · `dlg:rey_cae` · `pi:<paso>` · `paso:<paso>` · `despedida` · `fragmento_4` · `final_fin` · `consola` · `completo` · `salida:<sección>`.

## 6. Archivos de contenido

| Archivo | Contenido |
|---|---|
| `src/data/levels/{teleferico,torre,salon_trono}.json` | Formato `LevelData` del Nivel 6 |
| `src/data/dialogue/n07.json` | Todos los diálogos (prefijo `n07_`, hablantes `n07_*`) |
| `src/data/cdmx2.json` | Oleadas (tiempos, lados, tipos), puertas, música, arena del jefe, pasos finales, `final.timeScale`, recompensas, líneas de María, salida |
| `src/systems/Cdmx2Director.ts` | Director (`installCdmx2Director`) |
| `tools/test-nivel-07.mjs` | Pruebas (`npm run test:nivel7`) |

Ecos aproximados (≈1,300): espíritus y encapuchados de las oleadas (~330), élites 7×30 + Negros 2×15 (~240), recompensas directas del director (~220), Rey del Olvido (~600, `enemies.json`). Ajusta en `cdmx2.json` → `rewards` y en `enemies.json`.

## 7. Qué asume el director de otros agentes

| Agente | API asumida | Si no existe |
|---|---|---|
| Sistemas | `Casting.castSpellNow(world, id): Promise<SpellOutcomeEvent>` | Se avisa por consola y el paso se da por logrado |
| Sistemas | `spells.json`: CONSUELO y PAZ | `teach()` los concede sin aprendizaje guiado |
| Sistemas | `Maria.mariaTransform()`, `Maria.getMariaPosition()` | Se pone `hasMaria = false` y se invoca en la posición del jugador |
| Sistemas | `Llorona.summonLlorona(world,x,y)`, `dismissLlorona()`, **`setLloronaWild(on)`** (añadida: el contrato no la listaba) | Se ignora con aviso |
| Sistemas | `MindControl`: escucha `controls:invert` | El director solo avisa una vez al jugador |
| Enemigos | `rey_olvido` registrado; emite `boss:calmed`, `boss:vulnerable`, `rey:crown`; `espiritu` y `encapuchado` (`rank` rojo/negro/elite) | Respaldo: a los 6 s sin Rey en la arena se da por calmado |
| Escenario | Escucha `cablecar:progress`; props `prop_n07_*`; fondos `fondo_{teleferico,torre,salon_trono}_capa0..5`; sprites con id `n07_fragmento` (empieza invisible) | — |
| Audio | Pistas `n07_teleferico`, `n07_torre`, `n07_salon`, `n07_jefe`, `n07_llorona` (se piden con `bus.emit('music', { track })`) | — |

Props que usan los niveles (el integrador debe mapearlos a lo que genere el escenario): `prop_n07_cabina_{ventana,puerta,asiento,poste}`, `prop_n07_{estacion_superior,ventanal,consola,servidor,puerta_trono,columna}`, `prop_n07_{columna_trono,trono,fragmento,consola_rey}`; además `altar_memoria` (ya existe).

## 8. Pendientes

Probar en navegador con las piezas reales (Rey, Llorona, MindControl, escenario), equilibrar las oleadas y la vida de la élite, y la salida real a Guanajuato (hoy título).
