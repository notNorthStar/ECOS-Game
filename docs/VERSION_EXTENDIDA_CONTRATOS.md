# Versión extendida (post-jam) — contratos de implementación

> Rama `version-extendida` (sale de `nivel-10-guadalajara`; el equipo confirmó que se pueden subir cambios). Juego completo: Xalapa → Tuxtla → Catemaco → Oaxaca → CDMX 1 → CDMX 2 → Guadalajara. Reglas generales: `AGENTS.md`. **Ningún subagente hace commit, push ni cambia de rama.** Si editas con PowerShell, NO uses `Set-Content -Encoding utf8` (mete BOM): usa las herramientas de edición, node o python.

## Decisiones del equipo (2026-10-20)

- **Arte:** las hojas de Codex en `arte-fuente/ia-generado/codex-hojas/` (1536×1024, 6 columnas × 4 filas = 24 poses, fondo de color sin transparencia) son el arte de los personajes. Se recortan, se quita el fondo, se escalan y se integran como kits animados por cuadros.
  - **Protagonista y madre:** se ajustan **por código** (cabeza más chica, cuerpo más alargado, colores más sobrios, menos "infantil"), conservando sus poses. Referencia de proporción: `arte-fuente/ia-generado/codex-hojas/ejemplos-prota/` (64×80).
  - **Bruja Guajolote ave:** no existe hoja; se dibuja **por código** siguiendo el estilo y la paleta de `bruja.png`.
  - `exec-aed9e3b4-….png` = **bestia-2**, pero se usa como **nahual** (forma animal).
  - Varias versiones del mismo enemigo (muñecas 1–4, bestias 1 y 3, espíritu hombre/mujer, cofradía roja/negra/roja-negra) → variedad: cada instancia elige una al azar o por rango.
  - **Tamaño por importancia:** humanoide ~72 px; chaneque ~56; jefes más grandes según su fuerza (Chaneque Mayor ~100, Bruja ~105, Nahuala ~100, Cabeza Olmeca ~120, Rey del Olvido ~118, Tzitzimime ~105, Itzpapálotl ~140, Vampiro ~100, Don Ernesto ~105).
  - Al implementar: efectos (luces, partículas, auras, láseres) acordes a cada personaje.
- **Enemigos nuevos (eran de niveles omitidos):** **Momias** (común; DESCANSO las purifica) en la avenida y la Catedral; **Vampiro** (minijefe en la Catedral, antes de la emboscada; débil a SOL y LUZ); **Don Ernesto** (minijefe al final de la avenida de Guadalajara; **más monstruoso que un señor común**: cartas espectrales, ruleta de azar, fuego infernal; VERDAD revela sus trampas; FUEGO lo cura).
- **Trama:** al vencer a Itzpapálotl, el jugador **camina hacia la madre**, la libera con **E** y **habla con ella**; después llega el epílogo.
- **Pantallas de carga:** entre niveles (no entre secciones), **1 imagen al azar** de `arte-fuente/ia-generado/pantallas-carga/` + **1 consejo al azar**; se pasa con E/Espacio/clic o sola a los ~5 s.
- **HUD:** barra de vida en lugar de corazones; interfaz minimalista (esquina, pequeña); **fuente pixel legible** (OFL, incluida en el juego, registrada en `CREDITOS.md`).
- **Mecánicas:** cooldowns por conjuro (ajustables en `spells.json`): PROTECCION 20 s; daño (LUZ, SOL, FUEGO, VERDAD, VOZ, ECOS) 6–8 s; CALMA 1.5 s; DESCANSO y MEMORIA 4 s; historia (CONSUELO, PAZ, MAMA) sin cooldown en sus secuencias. **PROTECCION:** cura 1 corazón (1 unidad de vida); se mejora en el altar a 2 y 3; su maestría **solo** sube con esas mejoras del altar (no por lanzarlo).
- **Bugs:** revisar todo: muros invisibles, objetos con E sin aviso, y la salida del taller del Nivel 1 (debe ser obvia).
- **Créditos:** nombres reales del equipo, IAs y herramientas (lista en el brief de contenido).

## Dueños (no toques archivos de otro dueño; si necesitas algo de otro, usa su API o déjalo anotado en tu reporte)

| Área | Dueño | Archivos |
|---|---|---|
| Arte y kits | **arte** | `tools/codex-sheets.*`, `public/assets/sprites/personajes/**`, `arte-fuente/codex/**`, `src/systems/CharacterKits.ts`, `src/data/assets.json`, `src/scenes/BootScene.ts` / Preload (solo carga de kits) |
| Enemigos y efectos | **enemigos** | `src/entities/**` (todas: efectos por personaje + `Momia.ts`, `Vampiro.ts`, `DonErnesto.ts`), `src/entities/registry.ts`, `src/core/contracts.ts` (solo EnemyKind), `src/data/enemies.json`, `src/systems/Combat.ts` (solo afinidades de los enemigos nuevos) |
| Contenido N10 y créditos | **contenido** | `src/data/levels/{gdl_avenida,catedral,catedral_eclipse}.json`, `src/data/gdl.json`, `src/data/dialogue/n10.json`, `src/systems/GdlDirector.ts`, `src/systems/Madre.ts`, `src/data/creditos.json`, `src/scenes/EpilogoScene.ts` (créditos), `CREDITOS.md`, `tools/test-nivel-10*.mjs` |
| HUD, fuente y carga | **interfaz** | `src/scenes/HudScene.ts`, `src/scenes/{Title,Pause,Dialogue,Altar,Diario,Spell}Scene.ts` (solo fuente y estilo), `src/ui/**`, `src/scenes/CargaScene.ts` (nueva), `src/data/consejos.json`, `public/assets/ui/carga/**`, `public/assets/fuentes/**`, `src/systems/Campaign.ts`, `src/scenes/LevelScene.ts` (solo el gancho de la carga), `src/main.ts` (registrar escena) |
| Mecánicas | **mecanicas** | `src/systems/Casting.ts`, `src/systems/Mastery.ts`, `src/systems/Progression.ts`, `src/data/spells.json`, `src/data/progression.json`, `src/scenes/AltarScene.ts` (lógica de la mejora de PROTECCION; el estilo lo pone interfaz) |
| Bugs de mundo | **bugs** | `src/world/World.ts`, `src/world/WalkMap*`, `src/systems/Interact.ts`, `src/systems/Director.ts` (Nivel 1), `src/data/levels/*.json` **excepto** los 3 de Guadalajara, `src/data/dialogue/n01.json` |

## APIs compartidas (nuevas)

- `bus`: **`'spell:cooldown' { spellId: string; remaining: number; total: number }`** (lo emite mecanicas al lanzar y cada ~0.25 s mientras corre; el HUD lo muestra). `Casting.getCooldown(spellId): { remaining: number; total: number }`.
- **Kit animado por cuadros** (arte): el JSON del kit admite además `"animaciones": { "<motion>": { "frames": [i…], "fps": n, "loop": bool } }` y `"escala"` (multiplicador de tamaño en pantalla). `KitAnimator` usa los cuadros si existen y si no, el animado por código de siempre; nunca pisa la escala base. Motions: `reposo, caminar, correr, subida, caida, aterrizar, esquivar, disparar, conjuro, dano, morir, interactuar, ataque, golpe, salto, agotado, purificar, invocar, lanzar, aturdido`.
- `Kit` expone `variants?: string[]` y `kitAnimatorFor(sprite, id, variant?)` para elegir versión (muñeca_1…4, etc.).
- Carga entre niveles (interfaz): `Campaign` marca `GameState.pendingLoadScreen = true` en cada `prepare…Entry()`; `LevelScene` la consume al crear y lanza `CargaScene` encima (pausando Level) antes de que empiece el nivel.
- `GameState.upgrades.proteccion` (0..2) lo escribe mecanicas; `Combat` lee la curación con `Mastery`/`spells.json` (mecanicas expone `getProteccionHeal()`).
