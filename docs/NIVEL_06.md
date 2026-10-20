# Nivel 6 — CDMX parte 1: de la Isla de las Muñecas a Reforma

> Rama `nivel-6-cdmx`. Contenido (JSON + director + pruebas). Contratos y reparto de dueños: `docs/NIVEL_06_CONTRATOS.md`. Historia: `docs/NDD_v2.md` (Niveles 5 y 6, definitiva). Patrón copiado del Nivel 4 (`OaxacaDirector.ts`). **El Nivel 5 (Puebla) se omite**: aquí llegan VERDAD, FUEGO, DESCANSO, el doble salto (altares), los Encapuchados Negros y la desesperación de María.

## Recorrido (~15 min)

| Sección | Ancho | Qué pasa | Música |
|---|---|---|---|
| `xochimilco` | 3000 | Canales secos e Isla de las Muñecas. **3 emboscadas** de muñecas poseídas (8: grupos de 3 + 3 + 2, `muneca_a/b/c`, arena con `lockArena` + `arena:start`). La primera llega antes de FUEGO. **Ofrenda flotante** → aprende **FUEGO** (compuerta en x 1600 hasta aprenderlo). Altar (x 1500). Árbol de muñecas (pista de que hay almas dentro). 1 zona de doble salto (trajinera alta). Al limpiar las tres, María habla de la gran ciudad. Salida a avenidas (requiere FUEGO) | `n06_xochimilco` |
| `avenidas` | 3200 | Día de Muertos. **Ofrenda grande → DESCANSO**. **Doña Refugio (cronista) → VERDAD** (compuerta en x 1300 hasta aprenderla) con el aviso de Luna. 2 sobrevivientes reales que dan pistas y **2 nahuales infiltrados** (`nahual_1`, `nahual_2`). 5 muñecas sueltas, 3 chaneques, 3 encapuchados rojos. Altar (x 1950, checkpoint). 2 zonas de doble salto. Salida a Reforma | `n06_avenidas` |
| `reforma` | 2800 | Ángel de la Independencia caído. 4 rojos + **3 Negros** (aviso con diálogo y toast) + **1 nahual infiltrado** (`nahual_3`) + una sobreviviente real. Altar (x 1800) y **punto de control** (x 1870) antes de la jefa. Zona de doble salto (ala del Ángel). **Arena de la Nahuala** (trigger x 2020; x 1960–2800). Al `boss:calmed`: escena de la mujer liberada → los **verdaderos habitantes** (aparecen) revelan al **Rey del Olvido** y a la mujer que coincide con tu madre → **estación del teleférico** → por ahora vuelve al título | `n06_reforma` / `n06_jefe` |

Compuertas (muros invisibles con `lockArena(0, x)`): Xochimilco hasta x 1600 sin FUEGO; avenidas hasta x 1300 sin VERDAD. Con toast de aviso.

## Nahuales infiltrados (contrato §4)

- Cada uno es un enemigo `{type:'nahual', id, disguise:'npc_sobreviviente_N'}` con un interactuable `n06_nahual` **en la misma x,y** (`data.nahualId`, `data.dialogue`).
- Al hablarle: se reproduce su línea (`n06_nahual_N`) y, **ya con el mundo descongelado**, el director emite `nahual:reveal {id, surprise:true}` (zarpazo sorpresa).
- Si VERDAD lo revela antes (`nahual:revealed`), el interactuable se deshabilita y el director no lo fuerza (toast "sin zarpazo sorpresa").
- `nahual:fled` / `enemy:purified` / `enemy:removed` (purificado) → flags `nahual:<id>:fin` y `down:<sección>:<índice>`: no reaparece tras morir.
- Aviso la primera vez (cronista o trigger `n06_tip_nahual`): «Con Luna (F) puedes ver la sombra de los nahuales disfrazados; VERDAD los descubre».

## Doble salto (zonas opcionales)

4 obstáculos `rect` con `height` 58–60 (> ≈32 px del salto normal) con un interactuable `n06_premio` encima (misma x,y, radio 18): Xochimilco `n06_cornisa_1`, avenidas `n06_cornisa_2/3`, Reforma `n06_cornisa_4`. Dan una pista y Ecos una vez. Hay además 2 obstáculos bajos (`height` 28) para saltar con salto normal. Nadie se atora si no compra el doble salto.

## Actions

- **Interactuables:** `n06_examinar` (diálogo + Ecos por `descubrimiento` + `maria`) · `altar` · `n06_fuego` · `n06_descanso` · `n06_cronista` · `n06_nahual` (`data.nahualId`) · `n06_premio` · `n06_habitante` (`data.habitante` a|b) · `n06_estacion`.
- **Triggers:** `letras` (nombre de zona + checkpoint) · `dialogo` (`data.dialogue`, `data.toast`, `data.maria`, `data.flag` para avisos de una sola vez) · `emboscada` (`data.group`, `x0`, `x1`) · `ir_seccion` (`data.section`, `data.spawn`, `data.requires`: `fuego`) · `punto` (`data.spawn`) · `nahuala_arena` (`lockArena` + `arena:start`).

## Flags (`GameState.flags`, prefijo `n06:`, persisten tras morir)

`intro` · `maria_llegada` · `maria:<clave>` · `fuego` · `descanso` · `verdad` · `emb:muneca_a|b|c` · `desc:<clave>` · `premio:<id>` · `nahual:<id>:fin` / `:revelado` · `down:<sección>:<índice>` · `nahuala_intro` · `nahuala` · `nahuala_fin` · `habitante:a|b` · `habitantes_fin` · `completo` · `letras_cp:<sección>` · `punto:<trigger>` · `salida:<sección>` · `tip_*`.

## Datos

- `src/data/levels/{xochimilco,avenidas,reforma}.json`: suelo y = 222…345; muñecas de emboscada con `group`; nahuales con `id` + `disguise`; la Nahuala con `group: "nahuala"` (aparece al `arena:start`).
- `src/data/cdmx.json`: compuertas, arena de la jefa, tiempos de emboscada, premios y los 13 comentarios de María (texto y duración).
- `src/data/dialogue/n06.json`: español de México, de «tú», tono de ruina y Día de Muertos (hablantes con prefijo `n06_`: Doña Refugio, Don Chema, Sobreviviente, Mujer, Doña Cande, Don Eulogio). María cada vez más desesperada (incluye las líneas que eran de Puebla: «ni un rastro, ni una huella», «los míos tienen que estar vivos», «lo siento aquí, en el pecho»). **No** revela su pasado con el Rey ni a la Llorona (eso es del Nivel 7); el Rey del Olvido solo aparece al final por boca de los habitantes.
- `src/systems/CdmxDirector.ts`: `installCdmxDirector(world)`, un solo director para las tres secciones.

## Ecos (~800)

Enemigos: 13 muñecas (4) + 3 chaneques (5) + 7 rojos (8) + 3 Negros (15) + 3 nahuales (60, menos si huyen) + Nahuala (400) ≈ 750. Director (`addEcos`): 3 conjuros × 15, 3 emboscadas × 10, 4 premios × 12, habitantes 2 × 8, estación 20, descubrimientos 4 c/u ≈ 190. Todo ajustable en `cdmx.json` y `enemies.json`.

## APIs de otros agentes que se asumen (importación defensiva donde aplica)

- `spells.json`: `FUEGO`, `DESCANSO`, `VERDAD` (si falta una, el director la concede sin aprendizaje guiado y avisa en consola). `startLearning(world, id)` de `Casting.ts`.
- `Maria.ts`: `mariaSay(text, ms?)` (si no existe, `maria:say` por el bus).
- Enemigos: `muneca` (las rotas/liberadas salen del mundo con `purified = true`, o `enemy:purified`), `nahual` (con `id`/`disguise`; eventos `nahual:reveal/revealed/fled`, `enemy:exhausted`), `nahuala` (grupo `nahuala`; `nahuala:illusion`, `boss:vulnerable`, `boss:calmed`, `enemy:exhausted`), `encapuchado` rojo y negro (`cofradia:down`).
- Mundo: obstáculos con `height` (doble salto) y `arena:start` que crea los enemigos con `group`.
- Escenario (claves ya presentes en `src/world/Cdmx*.ts`): `prop_n06_{embarcadero,trajinera,ahuehuete,munecas_colgadas,ofrenda_flotante,arbol_munecas,cempasuchil,junco,arco_papel_picado,papel_picado,cornisa,ofrenda_grande,organillo,camioneta,carreta_elotes,puente_flores,catrina,letrero_reforma,poste_neon,escombro,angel_caido,ala_caida,puesto_cafe,cabina_teleferico,obsidiana,estacion_teleferico}`, `altar_memoria`, `npc_sobreviviente_1..5`.
- Progresión: el doble salto se compra en el Altar y se desbloquea desde la CDMX.
- Pendiente de revisar cuando exista `public/assets/escenarios/nivel-06-cdmx/LEEME.md`.

## Pruebas

`npm run test:nivel6` (31 pruebas): datos en suelo transitable (los premios van sobre obstáculos con `height`), conteos, nahuales con interactuable en su posición, diálogos y hablantes, VERDAD/FUEGO/DESCANSO con `checkWord`, y el director real con adaptadores: aprendizajes, compuertas, emboscadas (y su respaldo), nahuales por diálogo y por VERDAD, huida/purificación, arena y Nahuala, cierre, persistencia tras morir y flujo completo.

## Pendientes

- Probar en el navegador con enemigos y escenario integrados; ajustar posiciones y equilibrio (muñecas, nahuales, Nahuala).
- Confirmar con el agente de enemigos cómo salen del mundo las muñecas liberadas con DESCANSO y rotas con FUEGO (el director cuenta `alive && !purified`).
- Probar VERDAD, FUEGO y DESCANSO con la cámara (DESCANSO tiene 8 letras).
- El Nivel 7 no existe: la estación vuelve al título.
