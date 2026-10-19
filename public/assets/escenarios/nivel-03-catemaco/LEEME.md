# Escenarios del Nivel 3 — Catemaco

Noche cerrada, neblina espesa junto a la laguna, tono detectivesco y de horror cósmico (NDD Nivel 3). Todo el arte de esta carpeta es **procedural y reemplazable**: 1×, paleta global de `ART_SPEC.md` §3, alfa 0/255, marcado `placeholder: true` en `src/data/assets.json`.

- Dibujo fuente: `src/world/CatemacoLandscape.ts` (capas 0–3), `CatemacoTerrain.ts` (suelo 4 y primer plano 5), `CatemacoArt.ts` (props y NPCs), base de píxeles en `CatemacoPixels.ts`.
- Integración: `CatemacoScenery.ts` (respaldo por código si falta un PNG) y `CatemacoDecor.ts` (halos que laten, destellos en la laguna, neblina teñida, luciérnagas/chispas, brillo de círculos rituales; respeta `reduceFx`).

## Fondos (`fondos/`)

Suelo transitable y = 220…345, horizonte ≈ 205. Factores 0.04 · 0.15 · 0.4 · 0.65 · 1 · 1.25. En el JSON de nivel: `"background": "fondo_catemaco"` / `"fondo_campamento"` / `"fondo_altar_olmeca"`.

| Sección | Ancho | Capas (ancho) | Contenido |
|---|---|---|---|
| `catemaco` | 2400 | 711 · 904 · 1344 · 1784 · 2400 · 2840 | Luna, volcanes de Los Tuxtlas, laguna con isla, pueblo y templo ficticio en la otra orilla, calle de casas con teja y letreros "LIMPIAS", malecón con faroles (hueco al lago en ≈ x 53–74 % de la capa 3), plaza con rosetón al inicio (x ≈ 120–420), bajada de arena al final |
| `campamento` | 3200 | 743 · 1024 · 1664 · 2304 · 3200 · 3840 | Laguna con reflejo de luna, manglares, palafitos, muelles y lanchas; a la derecha lonas, estandartes del Espejo Negro, antorchas, empalizada y humo rojo; fango con lodazales, huellas y círculo ritual ocre (x ≈ 82 % del ancho, y 285) |
| `altar_olmeca` | 2400 | 711 · 904 · 1344 · 1784 · 2400 · 2840 | Aurora verde-morada y astro eclipsado, selva con ceibas, troncos colosales y dosel; claro ceremonial desde x ≈ 68 %: muro con estelas y braseros, losas y círculo olmeco (centro ≈ x 2056, y 286) para la arena de la Cabeza |

## Props (`props/`) — clave = nombre del archivo

| Clave | Cuadro | Cuadros | Notas |
|---|---|---|---|
| `prop_n03_letras_catemaco` | 224×72 | 1 | Letras turísticas (estilo `letras_xalapa`), focos y veladoras |
| `prop_n03_altar_brujos` | 64×56 | 4 (6 fps) | Mesa con mantel, retablo del ojo, huevos, albahaca, velas que parpadean |
| `prop_n03_jaula_cerrada` / `_abierta` | 40×36 | 1 | Cerrada lleva un gato negro dentro; abierta, vacía con la puerta caída |
| `prop_n03_gato_negro` | 24×20 | 4 (3 fps) | Sentado, cola y parpadeo |
| `prop_n03_gato_negro_echado` | 28×14 | 2 (2 fps) | Respira |
| `prop_n03_lona` / `_chica` | 96×72 / 64×48 | 1 | Tiendas de la Cofradía con luz roja y Espejo Negro |
| `prop_n03_antorcha` | 16×56 | 4 (8 fps) | Llama roja |
| `prop_n03_caja_cofradia` | 32×28 | 1 | Sello del Espejo Negro |
| `prop_n03_nota` / `prop_n03_pista_espejo` | 16×16 | 1 | Pistas examinables |
| `prop_n03_tablero_pistas` | 48×56 | 1 | Mapa, notas e hilo rojo |
| `prop_n03_muelle` | 160×40 | 1 | Tramo sobre pilotes |
| `prop_n03_lancha` | 96×28 | 1 | Lancha "LUPITA" |
| `prop_n03_estela` / `_rota` | 40×76 | 1 | Estelas olmecas |
| `prop_n03_brasero` | 32×40 | 4 (8 fps) | Brasero ritual |
| `prop_n03_pedestal_olmeca` | 176×56 | 1 | Plataforma **sin** la cabeza (la cabeza es jefe: placeholder del agente de enemigos) |
| `prop_n03_estandarte` | 24×80 | 1 | Estandarte del Espejo Negro |

Las tiras crean su animación con la misma clave (BootScene). `CatemacoDecor` las reproduce solas (cuadro inicial aleatorio) y añade halo a antorchas, braseros, altar, lonas y letras.

## NPCs comunes (`sprites/npcs/`) — 64×80, 4 cuadros, pivote (32, 78), ~70 px, miran a la derecha

`npc_brujo_1` brujo anciano (palma, bastón, albahaca) · `npc_brujo_2` bruja (rebozo rosa, trenza, veladora) · `npc_brujo_3` brujo del copal (paliacate, sahumador) · `npc_poblador_n03_1` pescador · `npc_poblador_n03_2` señora con farol.

Colocar: en el JSON `{"key":"npc_brujo_1","anim":"npc_brujo_1","id":"brujo_luz","x":860,"y":236}` o por código `addCatemacoNpc(world, key, x, y, { id, flipX })` (en `CatemacoScenery.ts`, junto con `CATEMACO_NPC_KEYS` y las posiciones sugeridas `CATEMACO_NPC_SPOTS`).

## Regenerar

`npm run scenery:nivel3` crea lo que falte. `npm run scenery:nivel3 -- --force` regenera solo PNG con la marca `ECOS-placeholder:catemaco-v1` **y** el hash registrado; `--only=texto` filtra claves; `--preview=carpeta` escribe vistas previas fuera del juego. Un PNG del equipo (sin marca o con otro hash), una ruta personalizada o `placeholder:false` nunca se pisan.
