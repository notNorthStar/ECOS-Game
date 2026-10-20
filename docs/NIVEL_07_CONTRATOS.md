# Nivel 7 — CDMX parte 2: contratos de implementación

> Rama `nivel-7-cdmx2` (sale de `nivel-6-cdmx`). Fuente: `docs/NIVELES_ECOS.md` §4 (Nivel 7), `docs/NDD_v2.md` (Nivel 7 — historia **definitiva**: no la cambies), `docs/GDD_ECOS.md` §5, §6. Patrón a copiar: Niveles 4 y 6 (`docs/NIVEL_06_CONTRATOS.md`, `CdmxDirector.ts`, `Cdmx*.ts`, `Nahuala.ts`, `Maria.ts`). Regla de arte: `AGENTS.md` §8.0.

## 1. Decisiones del equipo (2026-10-19)

- **Teleférico = cabina como arena en movimiento:** el jugador pelea dentro de la cabina (espacio fijo); por fuera la tormenta, la ciudad y los cables pasan para dar la sensación de subir. Espíritus (Luna) y encapuchados **abordan** por las puertas en oleadas.
- **Corona del Rey: invierte los controles 3–4 s**, con aviso visual (la pantalla se distorsiona), y se puede desactivar en accesibilidad (`GameState.settings.noInvert`). También crea **clones de memoria**.
- **Música de la Llorona:** la **melodía tradicional "La Llorona" (dominio público)** en un **arreglo propio** generado por código; se registra en `CREDITOS.md`.
- **Revelación de María, sugerida y sin mostrarla:** diálogo y recuerdos borrosos (agua, siluetas). Sin violencia gráfica.
- Se llega desde la estación del teleférico del Nivel 6 (`prepareCdmx2Entry()` ya existe; selector de niveles: 3 entradas del Nivel 7).
- Duración 15–18 min. Ecos ~1,300. Recompensa: **4.º fragmento** + **la falsa llamada** de la "madre".

## 2. Secciones

| id | Contenido | Ancho | Música |
|---|---|---|---|
| `teleferico` | Interior de la cabina (arena fija de ~640–800 px de ancho; franja y 220–345). Fondo que se desplaza (ciudad, tormenta, cables, otras cabinas). 3–4 **oleadas**: espíritus (`lunaOnly`) que entran flotando y encapuchados que abordan por las puertas. Al final, la cabina llega a la estación superior. María acompaña. | 800 | `n07_teleferico` |
| `torre` | Torre de control: pasillos con consolas, ventanales a la tormenta. **Guardia de élite** (encapuchado `rank: 'elite'`, Negros con detalles rojos, ~6–8) y algún Negro. Checkpoint + altar. | 2600 | `n07_torre` |
| `salon_trono` | Salón del trono del Rey del Olvido. **Revelación** → María se transforma en **la Llorona** → **jefe: el Rey del Olvido** (la Llorona aliada) → **secuencia CONSUELO → MEMORIA → PAZ** → la Llorona se despide → **4.º fragmento** → **consola: la falsa llamada** → salida (por ahora al título: Guanajuato no existe). | 1800 | `n07_salon` / `n07_jefe` / `n07_llorona` |

Fondos `fondo_<seccion>_capa0..5` en `public/assets/escenarios/nivel-07-cdmx2/fondos/`.

## 3. Sistemas y dueños

| Archivo | Dueño | API |
|---|---|---|
| `systems/MindControl.ts` | sistemas | `installMindControl(world)` (ya lo llama LevelScene). Escucha `controls:invert {on, ms}`: pone `GameState.controlsInverted` y distorsiona la pantalla; respeta `settings.noInvert` (en ese caso solo la distorsión, sin invertir). |
| `entities/Player.ts` (si `GameState.controlsInverted`, invierte izquierda/derecha y arriba/abajo) | sistemas | |
| `systems/Llorona.ts` | sistemas | `installLlorona(world)`; `summonLlorona(world, x, y)`, `dismissLlorona()`. Aliada (placeholder, kitId `llorona`): flota cerca del Rey y cada pocos segundos lanza un **grito espectral** (`llorona:scream`) que aturde/daña al Rey y a sus clones, sin dañar al jugador. No es enemiga. |
| `systems/Casting.ts`: `castSpellNow(world, spellId): Promise<SpellOutcomeEvent>` (abre el deletreo de ese conjuro ya y resuelve con el resultado) para la secuencia CONSUELO → MEMORIA → PAZ | sistemas | |
| `data/spells.json`: **CONSUELO** (8 letras) y **PAZ** (3), tipo `historia`, con `effect` | sistemas | |
| `systems/Maria.ts`: `mariaTransform()` (desaparece María con efecto; `hasMaria = false`; emite `maria:transform`) | sistemas | |
| `entities/ReyOlvido.ts`, `registry.ts` (hoy lanza error para `rey_olvido`), clones de memoria internos, `enemies.json` (`rey_olvido`), `config/combat.ts`, `Combat.ts` (efectos) | enemigos | emite `rey:crown`, `controls:invert`, `boss:*` |
| `world/Cdmx2*.ts`, `tools/gen-cdmx2-scenery.mjs`, PNG `escenarios/nivel-07-cdmx2/`, `data/assets.json` (agregar) | escenario | `installCdmx2Scenery(world)`; en `teleferico` exporta `setCableCarProgress(p 0..1)` y escucha `cablecar:progress` |
| `data/levels/{teleferico,torre,salon_trono}.json`, `data/dialogue/n07.json`, `data/cdmx2.json`, `systems/Cdmx2Director.ts`, `docs/NIVEL_07.md`, `tools/test-nivel-07.mjs` | contenido | `installCdmx2Director(world)` |
| `systems/audio/*` (pistas `n07_*`, efectos) | audio | |

Flags: prefijo **`n07:`**.

## 4. Eventos nuevos

`cablecar:progress {progress}` · `rey:crown {hp, max, broken}` · `controls:invert {on, ms}` · `llorona:scream {x, y}` · `maria:transform {}`. Se reutilizan `boss:*`, `enemy:*`, `spell:resolved`.

## 5. Jefe: el Rey del Olvido (placeholder, kitId `rey_olvido`)

- Humanoide imponente (~80–90 px, cuadro ~96×96) con **corona** brillante. Arena del salón.
- **Corona:** tiene su propia vida (`rey:crown`). Solo **SOL** o **FUEGO** la dañan (en sus ventanas). Al romperla, el Rey queda vulnerable.
- **MEMORIA** lo debilita (afinidad ✅ "el olvido contra la memoria"): en ventana, avanza su sello. **CALMA ❌** (se fortalece/enfurece). LUZ ➖, VERDAD revela/disipa clones.
- **Ataques:** pulso mental que **invierte controles 3–4 s** (`controls:invert`, anunciado); **clones de memoria** (siluetas que atacan y se disipan al golpe); rayo de la corona; ondas.
- **La Llorona** (aliada) lo grita cada pocos segundos: aturde y abre ventanas.
- Victoria: corona rota + sello completo → `boss:calmed` (el Rey cae inconsciente, sin violencia), ~600 Ecos (GDD 5.1).

## 6. Secuencia CONSUELO → MEMORIA → PAZ (contenido + sistemas)

Tras el jefe, la Llorona fuera de control. Con el tiempo muy ralentizado: aprender CONSUELO (`startLearning`) → lanzarlo (`castSpellNow`) → lanzar MEMORIA → aprender PAZ → lanzarlo. Si uno sale `fail`, se repite ese paso sin castigo. Al completar: la Llorona recupera el recuerdo del amor por sus hijos, se despide y se desvanece (`dismissLlorona()`); `hasMaria = false`.

## 7. Personajes (AGENTS.md §8.0)

| Personaje | Arte por IA |
|---|---|
| Rey del Olvido, la Llorona, encapuchado élite (recolor), clones, María, Balam | **Placeholder simple** (el equipo tiene concept art: respeta proporciones) |
| Técnicos/operadores de la torre si los hay (comunes) | Diseño completo |
