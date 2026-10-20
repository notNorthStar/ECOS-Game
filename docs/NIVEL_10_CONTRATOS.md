# Nivel 10 — Guadalajara: la trampa y el eclipse final · contratos de implementación

> Rama `nivel-10-guadalajara` (sale de `nivel-7-cdmx2`). Fuente: `docs/NDD_v2.md` (Nivel 10 y Epílogo — historia **definitiva**, con la marca de "versión jugable": se llega directo desde la CDMX con los 6 fragmentos), `docs/NIVELES_ECOS.md` §3 (afinidades de Tzitzimime e Itzpapálotl) y §4 (Nivel 10), `docs/GDD_ECOS.md`. Patrón a copiar: Nivel 7 (`docs/NIVEL_07_CONTRATOS.md`, `Cdmx2Director.ts`, `Cdmx2Scenery.ts`, `ReyOlvido.ts`, `Llorona.ts`, `castSpellNow`). Regla de arte: `AGENTS.md` §8.0.

## 1. Decisiones del equipo (2026-10-19)

- **Guanajuato y Jalisco se omiten.** Se llega desde el salón del trono del Nivel 7 (`prepareGdlEntry()` ya existe) con los 6 fragmentos, CONSUELO y PAZ, **sin María** y con Balam (gato).
- **Recorrido: avenida + Catedral** (no hay sección de centro histórico).
- **Liberación = cadena de conjuros atado:** sin poder moverte, deletreas **LUZ → MEMORIA → ECOS** seguidos mientras el culto habla. Un fallo repite **ese** paso sin castigo.
- **MAMA abre ventanas:** cada vez que deletreas MAMA, la madre responde en señas desde el altar y **paraliza a Itzpapálotl unos segundos**. Es la **única** forma de abrir la ventana para el golpe con **ECOS**.
- **Balam jaguar luminoso = aliado que ataca solo** (como la Llorona): embiste a las Tzitzimime y a Itzpapálotl y abre ventanas. No se monta.
- Sin violencia gráfica: los cultistas quedan inconscientes o desaparecen en humo; las Tzitzimime se deshacen en luz estelar; Itzpapálotl se quiebra en obsidiana y luz, sin sangre.
- Se puede terminar **sin cámara** (todo deletreo acepta teclado).
- Duración ~15 min. Ecos ~800 **sin canje**: después del altar de la avenida ya no hay altares.

## 2. Secciones

| id | Contenido | Ancho | Música |
|---|---|---|---|
| `gdl_avenida` | Avenida en ruinas; al fondo la **silueta del estadio** bajo el sol que se va eclipsando (`eclipse:progress` 0→0.6). Letras "GUADALAJARA" + **último Altar de la Memoria** + checkpoint. 3 encuentros mezclados (chaneques, bestias, encapuchados rojo/negro/élite, espíritus con Luna). Al final, la puerta de la Catedral. | 2600 | `n10_avenida` |
| `catedral` | Nave de la **Catedral Metropolitana** (columnas, bancas rotas, vitrales, órgano). **Oleada final** en arena con todos los tipos de enemigos (incluye muñecas y nahuales). Al llegar al altar mayor: **emboscada** (escena): el alto mando de la Cofradía (placeholders encapuchados), la madre encadenada, la verdad de la llamada simulada, te quitan el Códice, el techo se abre al eclipse → `catedral_eclipse`. | 1800 | `n10_catedral` |
| `catedral_eclipse` | La misma nave con el **techo abierto al Gran Eclipse** (`eclipse:progress` 1). Atado junto al altar (`player:bound`) → cadena LUZ → MEMORIA → ECOS → te liberas, Balam crece a jaguar → **Fase 1**: oleadas + **3 Tzitzimime** → **Fase 2**: el capullo estalla, **Itzpapálotl** → al quebrar su núcleo: **epílogo**. | 1600 | `n10_tzitzimime` → `n10_itzpapalotl` → `n10_epilogo` |

Fondos `fondo_<seccion>_capa0..5` en `public/assets/escenarios/nivel-10-guadalajara/fondos/`. Flags con prefijo **`n10:`**.

## 3. Sistemas y dueños

| Archivo | Dueño | API |
|---|---|---|
| `world/GdlScenery.ts` (+ `Gdl*.ts`), `tools/gen-gdl-scenery.mjs`, PNG `escenarios/nivel-10-guadalajara/`, `data/assets.json` (agregar) | escenario | `installGdlScenery(world)` (ya lo llama LevelScene). Escucha `eclipse:progress`. Exporta `openCathedralRoof(ms)` (el techo se abre en la escena de la emboscada), `setEclipse(p)`. Arte del epílogo: fondo del taller de Xalapa de día y el Códice con páginas en blanco (`epilogo_*`). |
| `systems/BalamJaguar.ts` | sistemas | `installBalamJaguar(world)` (ya instalado), `awakenJaguar(world, x, y): Promise<void>` (Balam gato crece a jaguar luminoso con destello; `GameState.balamJaguar = true`; `balam:jaguar`), `calmJaguar()` (vuelve a gato). Aliado: cada ~4–6 s embiste al enemigo más cercano (prioriza Tzitzimime / Itzpapálotl), emite `balam:strike {x,y}` y aplica `takeHit` moderado + aturdimiento. Nunca daña al jugador. Placeholder kitId `balam_jaguar` (criatura grande 55–64 px). Tras morir/reintentar, el Director lo vuelve a despertar. |
| `systems/Madre.ts` | sistemas | `installMadre(world)` (ya instalado), `placeMadre(world, x, y)` (la madre encadenada en el altar, placeholder kitId `madre`, humanoide 64×80), `wakeMadre()` (despierta: `madre:awake`), `madreSign(): Promise<void>` (responde en señas: animación de manos sobre ella, emite `madre:sign` y `itzpa:stagger {ms: 3500}`), `freeMadre()` (al final, cadenas fuera). |
| `systems/Casting.ts`: reutiliza `castSpellNow`. Si el jugador está atado (`GameState.bound`), el deletreo funciona igual (sin movimiento). | sistemas | |
| `entities/Player.ts`: si `GameState.bound`, no se mueve, no salta, no dispara ni esquiva; sí puede deletrear (dibujo de ataduras de luz encima). | sistemas | |
| `data/spells.json`: **ECOS** (4 letras, tipo `historia`/final) y **MAMA** (4, `historia`, "señas familiares"). ECOS: en combate, si `Itzpapálotl` está paralizada, golpea su núcleo; MAMA: llama a `madreSign()` (la escena final la puede lanzar con Q como conjuro normal una vez aprendido, o el Director con `castSpellNow`). | sistemas | |
| `scenes/EpilogoScene.ts` (+ registro en `main.ts`) | sistemas | Escena "Las páginas en blanco": textos del epílogo del NDD sobre el arte del taller, la cita final, **créditos** (lee `CREDITOS.md`-equivalente en `data/creditos.json`, que crea contenido) y vuelta al título con resumen (Ecos, conjuros, fragmentos). Se arranca con `scene.start('Epilogo')` (cerrando Hud y capas, como Pausa → Salir). |
| `entities/Tzitzimitl.ts`, `entities/Itzpapalotl.ts`, `registry.ts` (hoy lanza error), `data/enemies.json`, `config/combat.ts`/`Combat.ts` si hace falta | enemigos | ver §5 |
| `data/levels/{gdl_avenida,catedral,catedral_eclipse}.json`, `data/dialogue/n10.json`, `data/gdl.json`, `data/creditos.json`, `systems/GdlDirector.ts`, `docs/NIVEL_10.md`, `tools/test-nivel-10.mjs` + script `test:nivel10` | contenido | `installGdlDirector(world)` |
| `systems/audio/*` (pistas `n10_*`, efectos) | audio | |

## 4. Eventos nuevos (ya en `core/bus.ts`)

`player:bound {on}` · `balam:jaguar {on}` · `balam:strike {x,y}` · `madre:awake {on}` · `madre:sign {x,y,ms}` · `itzpa:stagger {ms}` · `itzpa:core {hits,max}` · `eclipse:progress {progress}`. Se reutilizan `boss:*`, `enemy:*`, `spell:resolved`, `arena:*`, `music`. `GameState.balamJaguar` y `GameState.bound` ya existen.

## 5. Enemigos (placeholders, AGENTS.md §8.0)

**Tzitzimitl** (kitId `tzitzimitl`, ~90–100 px, esqueleto estelar con falda de estrellas y cuchillos de obsidiana sugeridos, sin gore). Subjefa: vida alta, barra propia pequeña. Ataques: descenso desde arriba (sombra que avisa), lluvia de estrellas (zonas en el suelo), embestida. Afinidades: **PROTECCION ✅** (la repele y la aturde), **LUZ ✅**, **SOL ✅**, CALMA/VOZ/MEMORIA/VERDAD/FUEGO/DESCANSO ➖. Láser rojo daño normal. Al caer se deshace en polvo de estrellas (`enemy:purified`, ~200 Ecos según GDD). Las 3 juntas o escalonadas (el Director decide: 1 → 2).

**Itzpapálotl** (kitId `itzpapalotl`, jefa ≤120 px de cuerpo; las alas de obsidiana van como piezas aparte y pueden ser más anchas). Primero un **capullo** de obsidiana (invulnerable, late) que **estalla** cuando cae la última Tzitzimitl.
- **Núcleo:** `itzpa:core {hits, max: 3}`. **Solo ECOS** daña el núcleo y **solo** mientras está paralizada por la madre (`itzpa:stagger`). Fuera de la ventana, ECOS rebota con aviso.
- **Ataques dimensionales**: portales/cortes que **solo se ven con Luna** (sin Luna, un destello tenue como pista, como los espíritus); mariposas de obsidiana (proyectiles); aleteo que empuja; llamado de Tzitzimime menores (opcional).
- **Afinidades:** PROTECCION ✅ (bloquea un ataque y la aturde poco), LUZ ✅ / SOL ✅ (daño a las alas: al bajar las alas pasa de fase y queda más lenta), **CALMA ❌ y FUEGO ❌** (se refuerza), resto ➖.
- Fases `boss:phase` 1|2|3 según los golpes al núcleo (0, 1, 2). Al tercer golpe: `boss:calmed`, se quiebra en obsidiana y luz (sin violencia), el eclipse retrocede.
- Balam (`balam:strike`) la aturde poco y abre ventanas a las alas, no al núcleo.

## 6. Secuencias (contenido + sistemas)

1. **Liberación (atado):** `GameState.bound = true` + `player:bound` → diálogo del culto en paralelo → `castSpellNow('LUZ')` → `castSpellNow('MEMORIA')` → aprender ECOS (`startLearning`) → `castSpellNow('ECOS')`. `fail` repite ese paso sin castigo. Al lograrlo: ataduras rotas, `bound = false`, `awakenJaguar()`.
2. **MAMA:** se aprende durante la Fase 2 la primera vez que Itzpapálotl muestra el núcleo (diálogo: recuerdo de la infancia, la madre enseñándole a decir "mamá" en señas) → `startLearning('MAMA')`. Después, el jugador lo lanza con Q (o rueda) cuando quiera: `madreSign()` → ventana → ECOS al núcleo. Repetir 3 veces.
3. **Final:** `boss:calmed` → la madre liberada, Balam vuelve a gato, el sol regresa (`eclipse:progress` → 0) → diálogo → `EpilogoScene`.

## 7. Personajes (AGENTS.md §8.0)

| Personaje | Arte por IA |
|---|---|
| Madre, Balam jaguar, Tzitzimime, Itzpapálotl (capullo y forma completa), alto mando de la Cofradía (recolor de encapuchado con detalles dorados) | **Placeholder simple** con las medidas del kit |
| NPCs comunes (si hay sobrevivientes en la avenida) | Diseño completo |
