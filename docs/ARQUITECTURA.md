# Arquitectura del juego (Nivel 1)

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
