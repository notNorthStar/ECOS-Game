# Arquitectura del juego (Niveles 1 a 4, 6 y 7; el 5 se omite)

## Continuación: CDMX parte 2 (Nivel 7)

En la rama `nivel-7-cdmx2`, `Level` carga además `teleferico`, `torre` y `salon_trono` (`CDMX2_SECTIONS` / `isCdmx2()`); `installDirector()` las deriva a `Cdmx2Director` y `LevelScene` instala `Cdmx2Scenery` (cabina fija con fondo que sube según `cablecar:progress`; `openCabinDoor()` para los abordajes).
- **MindControl** (`systems/MindControl.ts`): `controls:invert {on, ms}` pone `GameState.controlsInverted` (lo lee `Player`: solo movimiento) con distorsión morada; `settings.noInvert` deja solo el aviso visual. Se limpia al vencer, al morir y al cambiar de escena.
- **Llorona aliada** (`systems/Llorona.ts`): `summonLlorona` / `setLloronaWild` / `dismissLlorona`; grita al Rey cada 5–7 s (`llorona:scream`), nunca daña al jugador. `Maria.mariaTransform()` la reemplaza (`hasMaria = false`, `maria:transform`).
- **`Casting.castSpellNow(world, id)`**: abre el deletreo de un conjuro concreto y devuelve su resultado; lo usa la secuencia CONSUELO → MEMORIA → PAZ (conjuros de tipo `historia`: se aprenden, no entran en la rueda).
- Enemigos: `rey_olvido` (`entities/ReyOlvido.ts`: corona con vida propia que solo dañan SOL/FUEGO en ventanas, sello con MEMORIA, CALMA lo enfurece, VERDAD deshace clones; `rey:crown`, `controls:invert`) y el rango `elite` del encapuchado (tinte, ojos rojos, `cooldownMult`).
- `Campaign.prepareCdmx2Entry()` (selector y salida del Nivel 6). Flags `n07:`. El Rey entrega del 4.º al 6.º fragmento (`n07:fragmento_4`…`_6`; Guanajuato y Jalisco se omiten). Al final vuelve al título hasta que exista Guadalajara (Nivel 10).
Contratos: `docs/NIVEL_07_CONTRATOS.md`. Ruta y pruebas: `docs/NIVEL_07.md` y `npm run test:nivel7`.

## Continuación: CDMX parte 1 (Nivel 6)

En la rama `nivel-6-cdmx`, `Level` carga además `xochimilco`, `avenidas` y `reforma` (`CDMX_SECTIONS` / `isCdmx()`); `installDirector()` las deriva a `CdmxDirector` y `LevelScene` instala `CdmxScenery`.
- **Doble salto:** mejora `doble_salto` del Altar (`unlockFrom: cdmx`, flag `cdmx:visitada`). `Player` hace un segundo salto en el aire.
- **Obstáculos con altura:** `LevelData.obstacles[].height` (`WalkMap`/`World`): el jugador los cruza si su z ≥ height y puede pararse encima; sin `height` siguen siendo muros. Alturas recomendadas en `config/movement.ts` (20–35 salto normal; 55–65 doble salto).
- Enemigos `muneca` (se rompe o se libera con DESCANSO), `nahual` (`EnemySpec.id` + `disguise`; `nahual:reveal`/`revealed`/`fled`; sombra animal con Luna) y `nahuala` (copias ilusorias con `illusion = true`, trampas; se libera con CALMA).
- Conjuros VERDAD, FUEGO y DESCANSO en `data/spells.json`. `Campaign.prepareCdmxEntry()` (título 9/0 y salida de Oaxaca). Flags `n06:`.
Contratos: `docs/NIVEL_06_CONTRATOS.md`. Ruta y pruebas: `docs/NIVEL_06.md` y `npm run test:nivel6`.

## Continuación: Oaxaca (Nivel 4)

En la rama `nivel-4-oaxaca`, `Level` carga además `oaxaca`, `callejones` y `santo_domingo` (`OAXACA_SECTIONS` / `isOaxaca()`); `installDirector()` las deriva a `OaxacaDirector` y `LevelScene` instala `OaxacaScenery`.
- `systems/Maria.ts`: María compañera (`GameState.hasMaria`), sigue al jugador y lanza un lamento que aturde sin daño; `mariaSay()` para sus comentarios. Se instala en todas las secciones salvo las de Catemaco (ahí la maneja su director).
- Enemigos `bestia` (se purifica con MEMORIA; las del pasaje llevan `group`) y `bruja_guajolote` (jefa con forma humana/ave, sello de 7 puntos).
- Conjuro MEMORIA en `data/spells.json`. Eventos nuevos: `maria:assist`, `maria:say`, `pasaje:revealed`, `bruja:form`.
- `Campaign.prepareOaxacaEntry()`: entrada desde la salida de Catemaco o el título (7/8). Flags `n04:`.
Contratos: `docs/NIVEL_04_CONTRATOS.md`. Ruta y pruebas: `docs/NIVEL_04.md` y `npm run test:nivel4`.

## Continuación: Catemaco (Nivel 3)

En la rama `nivel-3-catemaco`, `Level` carga además las secciones `catemaco`, `campamento` y `altar_olmeca` (`CATEMACO_SECTIONS` e `isCatemaco()` en `config/game.ts`).
`installDirector()` las deriva a `CatemacoDirector`; `LevelScene` instala `CatemacoScenery` para esas secciones.
Sistemas nuevos, instalados en todas las secciones y apagados hasta desbloquearse (`GameState.shield` / `GameState.luna` / `GameState.hasBalam`):
- `systems/Shield.ts`: escudo U (seña U con cámara o clic derecho). Todo golpe al jugador pasa por `shieldFilterHit` dentro de `EnemyBase.hitPlayer`.
- `systems/Luna.ts` + `systems/Balam.ts`: Habilidad Luna (F) y el compañero. `isLunaActive()` decide si las entidades `lunaOnly` existen.
- Enemigos `encapuchado` (rangos rojo/negro/élite por recolor), `espiritu` (`lunaOnly`) y `cabeza_olmeca` (jefe de 3 fases).
- Conjuros LUZ y SOL en `data/spells.json`; sus parámetros los lee `spellParam()`.
Eventos nuevos del bus: `shield:state`, `shield:block`, `luna:state`, `balam:awake`, `cofradia:down` y `olmeca:phase`. `boss:phase` admite fase 3.
Flags con prefijo `n03:`. `Campaign.prepareCatemacoEntry()` prepara la entrada directa desde el título (opciones 5/6).
`playDialogue` espera a que el diálogo anterior termine de cerrarse antes de abrir el siguiente: encadenar diálogos ya no bloquea al jugador.
Contratos: `docs/NIVEL_03_CONTRATOS.md`. Ruta, datos y pruebas: `docs/NIVEL_03.md` y `npm run test:nivel3`.

**Personajes (`AGENTS.md` §8.0):** los importantes (enemigos, aliados, jefes) usan placeholder y `CharacterKits` los reemplaza solo con la carpeta del kit del equipo; los NPCs comunes llevan diseño propio.

## Continuación: San Andrés Tuxtla

En la rama `codex/nivel-2-san-andres-tuxtla`, `Level` también carga la sección `tuxtla`.
`installDirector()` deriva únicamente esa sección a `TuxtlaDirector`; las cuatro secciones de Xalapa conservan su director.
`Campaign.prepareTuxtlaEntry()` prepara el paso entre niveles sin reiniciar Ecos, mejoras o maestría.
El título permite iniciar N2 directamente y el resumen de Xalapa permite continuar con la partida actual.

Datos N2: `data/levels/tuxtla.json`, `data/dialogue/n02.json`, `data/tuxtla.json` y VOZ en `data/spells.json`.
Los diálogos de todos los niveles se cargan por `import.meta.glob`; los nuevos identificadores y hablantes llevan prefijo `n02_`.
Los flags de misión usan `n02:` y sobreviven a reapariciones, como el resto de `GameState`.
El evento tipado `fandango:progress { recovered, total }` restaura las capas musicales al entrar o recoger recuerdos.
`TuxtlaScenery` dibuja respaldos procedurales, respetando las capas `fondo_tuxtla_capa0..5` si están cargadas en el manifiesto.

Ruta, pruebas y límites: `docs/NIVEL_02.md`, `npm run test:nivel2` y `REPORTE_DEMO.md`.

---

> Para el equipo y las IAs. Los contratos de código están en `src/core/contracts.ts`, el bus de eventos en `src/core/bus.ts`
> y el estado persistente en `src/core/GameState.ts`. **Los sistemas solo se comunican por esas tres piezas.**

## 1. Escenas

| Clave | Archivo | Dueño | Qué hace |
|---|---|---|---|
| `Boot` | `scenes/BootScene.ts` | arte | Carga el manifiesto `src/data/assets.json` (imágenes, tiras de animación), crea las animaciones y pasa a `Title` |
| `Title` | `scenes/TitleScene.ts` | lsm | Título "ECOS", elegir cámara o teclado, texto de privacidad, prueba en vivo de la cámara → `Level` con `{ section: 'taller' }` |
| `Level` | `scenes/LevelScene.ts` | mundo | Implementa `WorldApi`: carga `data/levels/<sección>.json`, parallax, jugador, props, colisiones, cámara, atmósfera, orden por profundidad; instala Combat, Casting y Director; lanza `Hud` |
| `Hud` | `scenes/HudScene.ts` | combate | Vida, calor y modo del láser, conjuro seleccionado con su maestría, Ecos, gema, avisos (`hud:toast`), nombre de zona (`zone:name`) |
| `Spell` | `scenes/SpellScene.ts` | lsm | Rueda de conjuros y la interfaz del deletreo (palabra, letra actual, mano de LSM, tiempo, resultado) |
| `Dialogue` | `scenes/DialogueScene.ts` | contenido | Diálogos desde `data/dialogue/*.json` |
| `Altar` | `scenes/AltarScene.ts` | combate | Menú de mejoras del Altar de la Memoria |
| `Diario` | `scenes/DiarioScene.ts` | lsm | Diario de Señas (Tab) |
| `Pause` | `scenes/PauseScene.ts` | lsm | Pausa (Esc) y opciones: volumen, cámara, accesibilidad |
| `Ending` | `scenes/EndingScene.ts` | contenido | Pantalla de carga (auto compartido rumbo a Los Tuxtlas) → "Continuará" con el mapa de la ruta |

## 2. Sistemas

| Archivo | Dueño | Entrada |
|---|---|---|
| `world/*`, `entities/Player.ts`, `config/movement.ts` | mundo | — |
| `systems/Combat.ts`, `entities/registry.ts`, `entities/Chaneque.ts`, `entities/ChanequeMayor.ts`, `entities/LaserShot.ts`, `entities/EcoOrb.ts`, `systems/Progression.ts`, `config/combat.ts`, `data/progression.json`, `data/enemies.json` | combate | `installCombat(world)`, `createEnemy(world, spec)` |
| `systems/Lsm.ts`, `systems/Casting.ts`, `systems/Mastery.ts`, `data/spells.json` | lsm | `installCasting(world)` |
| `systems/Director.ts`, `systems/Interact.ts`, `systems/LightTrail.ts`, `data/levels/*.json`, `data/dialogue/*.json` | contenido | `installDirector(world)` |
| `systems/Audio.ts` | audio | `installAudio(game)` |
| `tools/gen-placeholders.mjs`, `data/assets.json`, `ART_SPEC.md`, `art-templates/` | arte | `npm run placeholders` |

## 3. Secciones del Nivel 1

| id | Contenido | Ancho (px) |
|---|---|---|
| `taller` | Interior del taller de la madre, de noche: intro, pistola láser, tutorial, grabado de CALMA | 1280 |
| `calles` | Calles de Xalapa con niebla y llovizna; rastro de luz; chaneques sueltos; al final, letras XALAPA + Altar (checkpoint) | 2560 |
| `parque` | Parque Juárez: terrazas, 2 arenas de chaneques, antena al fondo; nota de la madre → PROTECCION | 2880 |
| `jefe` | Arena del Chaneque Mayor junto a la antena; después, el busto de Juárez y el Códice → `Ending` | 1600 |

Suelo transitable: franja aproximada **y = 220 … 345** (el horizonte del suelo queda en ~y 205). Las terrazas del parque son franjas más altas (y ~170–215) conectadas por escaleras.

## 4. Assets: claves = nombre del archivo sin extensión

Todos se declaran en `src/data/assets.json` (`placeholder: true` mientras no haya arte del equipo). **Una tira horizontal por animación**; la clave de la animación es la misma que la de la textura. Pivote en los pies: origen `(0.5, pies/alto)`.

### Protagonista — `sprites/protagonista/`, cuadros 64×64, pies en y = 60
`protagonista_reposo` (4) · `protagonista_caminar` (6) · `protagonista_correr` (6) · `protagonista_saltar_subida` (2) · `protagonista_saltar_caida` (2) · `protagonista_aterrizar` (2) · `protagonista_esquivar` (4) · `protagonista_disparar` (3) · `protagonista_conjuro` (4) · `protagonista_dano` (2) · `protagonista_morir` (5) · `protagonista_interactuar` (3)

### Chaneque — `sprites/enemigos/`, 48×48, pies en y = 45
`chaneque_reposo` (4) · `chaneque_caminar` (6) · `chaneque_ataque` (4) · `chaneque_salto` (3) · `chaneque_dano` (2) · `chaneque_agotado` (4) · `chaneque_purificar` (6)

### Chaneque Mayor — `sprites/jefes/`, 128×128, pies en y = 122
`chaneque_mayor_reposo` (4) · `chaneque_mayor_caminar` (6) · `chaneque_mayor_salto` (4) · `chaneque_mayor_golpe` (5) · `chaneque_mayor_invocar` (4) · `chaneque_mayor_lanzar` (4) · `chaneque_mayor_aturdido` (4) · `chaneque_mayor_dano` (2) · `chaneque_mayor_purificar` (8)

### NPC — `sprites/npcs/`, 64×64
`madre_retrato` (imagen 48×48 en `ui/` como `retrato_madre`) · `retrato_protagonista`

### Efectos — `sprites/efectos/`
`fx_laser_verde` (32×6, 2) · `fx_laser_rojo` (32×6, 2) · `fx_impacto` (16×16, 4) · `fx_eco` (8×8, 4) · `fx_purificar` (64×64, 6) · `fx_onda` (96×32, 5) · `fx_roca` (16×16, 1) · `fx_raiz` (24×48, 5) · `fx_chispa` (4×4, 1) · `fx_sombra` (32×10, 1) · `fx_rastro` (8×8, 4) · `fx_gota` (1×5, 1) · `fx_luciernaga` (3×3, 1) · `fx_hoja` (5×5, 4) · `fx_niebla` (256×64, 1) · `fx_brillo` (32×32, 1)

### Comunes — `escenarios/comun/`
`letras_xalapa` (192×72) · `altar_memoria` (48×48, 4)

### Props Nivel 1 — `escenarios/nivel-01-xalapa/props/`
`prop_mesa_taller` (96×48) · `prop_estante` (48×80) · `prop_pistola_laser` (16×16, 2) · `prop_grabado_calma` (40×48) · `prop_farol` (16×72, 2) · `prop_banca` (48×24) · `prop_arbol` (80×112) · `prop_arbusto` (48×32) · `prop_antena` (64×144, 4) · `prop_antena_rota` (64×144) · `prop_busto_juarez` (48×88) · `prop_nota_madre` (16×16) · `prop_codice` (24×24) · `prop_escalera` (48×48) · `prop_barandal` (64×24) · `prop_poste` (16×96) · `prop_auto_viejo` (96×40) · `prop_caja` (32×28) · `prop_puerta_taller` (40×80)

### Fondos — `escenarios/nivel-01-xalapa/fondos/`, alto 360
`fondo_<seccion>_capa0` … `capa5` para `taller`, `calles`, `parque`, `jefe`. Ancho de cada capa = `layerWidth(anchoSección, PARALLAX_FACTORS[i])` (`src/config/game.ts`). Capa 0 cielo, 1 montañas lejanas (Pico de Orizaba), 2 colinas/ciudad media, 3 ciudad cercana, 4 suelo (factor 1, mismo ancho que la sección), 5 primer plano (factor 1.25, casi todo transparente).

### Interfaz — `ui/`
`ui_vida` (12×12, 2: llena/vacía) · `ui_eco` (8×8) · `ui_gema` (24×24, 4) · `ui_rueda` (160×160) · `ui_marco` (9-slice 24×24) · `ui_tecla` (16×16) · `titulo_logo` (320×96) · `mapa_ruta` (640×360) · `pantalla_carga` (640×360) · `retrato_madre` (48×48) · `retrato_protagonista` (48×48)

## 5. Música y efectos (`audio/`)
`musica_n01_taller`, `musica_n01_exploracion`, `musica_n01_combate`, `musica_n01_jefe`, `musica_titulo` (OGG). Efectos `sfx_<nombre>.ogg`: `disparo_verde`, `disparo_rojo`, `impacto`, `salto`, `aterrizar`, `esquivar`, `paso`, `dano`, `muerte`, `letra_ok`, `letra_fallo`, `perfecto`, `conjuro_fallo`, `conjuro_ok`, `purificar`, `eco`, `altar`, `mejora`, `ui_mover`, `ui_aceptar`, `chaneque_risa`, `chaneque_ataque`, `jefe_rugido`, `jefe_golpe`, `antena_zumbido`, `antena_rota`, `sobrecalentado`, `interactuar`, `aprender`.
Si el archivo no existe, `systems/Audio.ts` sintetiza el sonido con WebAudio (los nombres son los mismos en `bus.emit('sfx', { name })`).
