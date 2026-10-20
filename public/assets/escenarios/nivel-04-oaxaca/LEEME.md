# Escenarios del Nivel 4 — Oaxaca

Atardecer apagado que cae en noche (NDD Nivel 4): calles empedradas con casas coloniales de colores semidestruidas, la Sierra verde al fondo, callejones con el mercado arruinado y las ruinas fortificadas del **Templo de Santo Domingo** (cantera verde) con su interior dorado en penumbra. Todo el arte de esta carpeta es **procedural y reemplazable**: 1×, paleta global de `ART_SPEC.md` §3, alfa 0/255, `placeholder: true` en `src/data/assets.json`.

- Dibujo fuente: `src/world/OaxacaLandscape.ts` (capas 0–3), `OaxacaTerrain.ts` (suelo 4 y primer plano 5), `OaxacaArt.ts` (props y NPCs), `OaxacaPixels.ts` (letras con X, patrones textiles, adobe).
- Integración: `OaxacaScenery.ts` (respaldo por código si falta un PNG, `addOaxacaNpc`, claves) y `OaxacaDecor.ts` (halos que laten, papel picado que se mece, polvo, brasas de fuego fatuo, neblina teñida; respeta `reduceFx` y `timeScale`).
- Textiles: patrones geométricos propios (greca escalonada tipo Mitla, rombos, estrella de telar, zigzag); no copian diseños de autor.

## Fondos (`fondos/`)

Suelo transitable y = 220…345, horizonte ≈ 205. Factores 0.04 · 0.15 · 0.4 · 0.65 · 1 · 1.25. JSON: `"background": "fondo_oaxaca"` / `"fondo_callejones"` / `"fondo_santo_domingo"`.

| Sección | Ancho | Capas (ancho) | Contenido |
|---|---|---|---|
| `oaxaca` | 3000 | 735 · 994 · 1584 · 2174 · 3000 · 3590 | Cielo de atardecer con sol hundido, Sierra en 3 cordilleras, ciudad con cúpulas y humo, casas coloniales (rosa, añil, ocre, verde, terracota, turquesa) con pretil de cantera, rejas, balcones, bugambilias, esquinas derrumbadas y lotes en ruina; faroles; cables con papel picado. **Taller "TALLER"** con textiles tendidos detrás de x ≈ 1500. Plaza de losas con estrella de telar en x 140–470 (para las letras) |
| `callejones` | 3000 | 735 · 994 · 1584 · 2174 · 3000 · 3590 | Noche, luna menguante. Casas de dos pisos más oscuras, murales (sol, colibrí, grecas), textiles tendidos; **mercado** de arcos con puestos y lonas detrás de x 1000–1900; suelo con petates, tepalcates y cempasúchil; canal al centro |
| `santo_domingo` | 2400 | 711 · 904 · 1344 · 1784 · 2400 · 2840 | Noche con resplandor de fuego fatuo. Barda del atrio con almenas y agaves, órganos del jardín; **templo** (torres, fachada-retablo, torre derecha derrumbada, andamios, barricada, velas) detrás de x ≈ 900; muro de la nave; **interior** desde x ≈ 1650: retablos dorados en penumbra, bóveda, candiles; círculo de fuego fatuo de la arena en (2030, 286) |

## Props (`props/`) — clave = nombre del archivo

| Clave | Cuadro | Cuadros | Notas |
|---|---|---|---|
| `prop_n04_letras_oaxaca` | 176×72 | 1 | Letras turísticas desgastadas (C rota, A rajada), papel picado y veladoras |
| `prop_n04_telar` | 80×72 | 1 | Telar de pedal con tela a medio tejer |
| `prop_n04_textil_1..4` | 28×50 | 4 · 3 fps | Greca, rombos, estrella, zigzag; se mecen |
| `prop_n04_textiles` | 80×64 | 4 · 3 fps | Tendedero con los 4 textiles |
| `prop_n04_puesto` / `_roto` | 96×72 | 1 | Puesto con lona rayada, barro negro, canastas |
| `prop_n04_ollas` / `prop_n04_olla` / `prop_n04_canastas` | 40×24 / 16×20 / 40×22 | 1 | Barro negro de Coyotepec |
| `prop_n04_muro_pasaje_cerrado` / `_abierto` (alias `prop_n04_muro_cerrado` / `_abierto`) | 112×104 | 2 · 2–3 fps | Muro con tapiz; abierto: arco con escalones y luz turquesa. El decorado cambia cerrado → abierto solo al recibir `pasaje:revealed` |
| `prop_n04_agave` / `_grande` | 32×28 / 56×44 | 1 | |
| `prop_n04_andamio` | 64×96 | 1 | |
| `prop_n04_velas` / `prop_n04_vela` | 32×20 / 8×16 | 4 · 8 fps | Con halo automático |
| `prop_n04_candelabro` | 32×72 | 4 · 8 fps | Candelero de 5 velas (interior) |
| `prop_n04_retablo` | 96×128 | 1 | Retablo dorado roto |
| `prop_n04_fachada_templo` | 112×128 | 1 | Portada de cantera verde con puertas entreabiertas |
| `prop_n04_columna_rota`, `prop_n04_campana` | 40×48, 40×32 | 1 | Ruinas del templo |
| `prop_n04_fragmento_sello` | 20×20 | 4 · 6 fps | 2.º fragmento del Sello (jade, oro, brillo turquesa) |
| `prop_n04_juguetes`, `prop_n04_ropa_ninos` (alias `prop_n04_ropa`) | 44×22, 42×28 | 1 | Para el comentario de María |
| `prop_n04_farol` | 16×72 | 4 · 6 fps | Farol de poste |
| `prop_n04_papel_picado` | 128×28 | 4 · 4 fps | Lo usa el decorado en los cables de la capa 3 |
| `prop_n04_escombros`, `prop_n04_barricada`, `prop_n04_estandarte`, `prop_n04_cartel` | 56×20, 80×38, 24×80, 48×56 | 1 | Cofradía y desastre |

## NPCs comunes (`sprites/npcs/`) — 64×80, 4 cuadros, pivote (32, 78), miran a la derecha

`npc_artesano_1` tejedora en telar de cintura (sentada, anima el machete) · `npc_artesano_2` tejedor de telar de pedal (sombrero, lanzadera, madejas) · `npc_artesano_3` anciana maestra (trenzas con listones, collares, malacate) · `npc_poblador_n04_1` vendedora con tenate de flores · `npc_poblador_n04_2` señor con sarape y bastón · `npc_poblador_n04_3` músico de banda con trompeta · `npc_poblador_n04_4` señora con rebozo morado y pan.

Colocar: JSON `{"key":"npc_artesano_1","anim":"npc_artesano_1","x":1400,"y":238}` o `addOaxacaNpc(world, key, x, y, { id, flipX })` (en `OaxacaScenery.ts`, junto con `OAXACA_NPC_KEYS`, `OAXACA_PROP_KEYS`, `OAXACA_NPC_SPOTS` y `OAXACA_LANDMARKS`).

## Regenerar

`npm run scenery:nivel4` crea lo que falte; `-- --force` regenera solo PNG con la marca `ECOS-placeholder:oaxaca-v1` **y** el hash registrado; `--only=texto` filtra claves; `--preview=carpeta` escribe vistas previas; `--dry` no escribe nada en el juego. Un PNG del equipo, una ruta personalizada o `placeholder:false` nunca se pisan.
