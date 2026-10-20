# Escenarios del Nivel 6 — CDMX parte 1 (Isla de las Muñecas a Reforma)

Ruinas retrofuturistas colosales de la CDMX en noche de Día de Muertos (NDD Nivel 6): canales secos de Xochimilco con trajineras varadas y la Isla de las Muñecas; avenidas con ofrendas, papel picado, cempasúchil, neones y edificios art déco y retrofuturistas rotos; Paseo de la Reforma con el **Ángel caído**, rascacielos que pierden pedazos, una pirámide mexica al fondo, aurora enfermiza y el teleférico. Todo el arte de esta carpeta es **procedural y reemplazable**: 1×, paleta global de `ART_SPEC.md` §3, alfa 0/255, `placeholder: true` en `src/data/assets.json`.

- Dibujo fuente: `src/world/CdmxLandscape.ts` (capas 0–3), `CdmxTerrain.ts` (suelo 4 y primer plano 5), `CdmxArt.ts` (props y NPCs), `CdmxPixels.ts` (cempasúchil, calaveritas, papel picado, concreto, letras con D).
- Integración: `CdmxScenery.ts` (respaldo por código si falta un PNG, `addCdmxNpc`, `CDMX_NPC_KEYS`, `CDMX_PROP_KEYS`, `CDMX_HIGH_PROPS`, `CDMX_NPC_SPOTS`, `CDMX_LANDMARKS`) y `CdmxDecor.ts` (animación; respeta `reduceFx` y `timeScale`).
- Muñecas poseídas, nahuales, la Nahuala, María y Balam **no** están aquí: son personajes importantes (placeholders del agente de enemigos; arte final del equipo). El árbol con muñecas es solo decoración.

## Fondos (`fondos/`)

Suelo transitable y = 220…345, horizonte ≈ 205. Factores 0.04 · 0.15 · 0.4 · 0.65 · 1 · 1.25. JSON: `"background": "fondo_xochimilco"` / `"fondo_avenidas"` / `"fondo_reforma"`.

| Sección | Ancho | Capas (ancho) | Contenido |
|---|---|---|---|
| `xochimilco` | 3000 | 735 · 994 · 1584 · 2174 · 3000 · 3590 | Noche brumosa con luna, volcanes nevados, ahuejotes, trajineras lejanas. **Embarcadero** con arcos pintados (x 120–560, tablones en el suelo); trajineras varadas; **Isla de las Muñecas** (árboles secos con muñecas, casita del cuidador, velas) x 1150–2050; **brasero/ofrenda de FUEGO** con charco de luz en (2320, 268); explanada firme para el altar en (2720, 250). Suelo: lodo seco agrietado del canal, charcos, lirios secos |
| `avenidas` | 3200 | 743 · 1024 · 1664 · 2304 · 3200 · 3840 | Cielo violeta con resplandor de veladoras; torres colosales rotas; edificios art déco / retro con neones (HOTEL, TACOS, CINE…), cortinas metálicas, ofrendas en los zaguanes; huecos de calles laterales. **Glorieta de las letras** x 150–470; **puesto de la cronista** x ≈ 980; **zaguán de la ofrenda grande** (arco de cempasúchil, halo) x ≈ 1650 con anillo de pétalos en el suelo; hueco con estructura de acero para el checkpoint x ≈ 2350. Suelo: asfalto, carriles, coladeras y **sendero de pétalos** de cempasúchil |
| `reforma` | 2800 | 727 · 964 · 1504 · 2044 · 2800 · 3340 | Aurora enfermiza verde-morada, rascacielos colosales (algunos inclinados), pirámide mexica, torres y cables del teleférico (cabinas animadas). **Pedestal roto del Ángel** x ≈ 1450 con **cráter** en el asfalto (1450, 272); anillo de la arena (1620, 286); **estación base del teleférico** x ≈ 2560 con plaza de andén |

## Props (`props/`) — clave = nombre del archivo

| Clave | Cuadro | Cuadros | Notas |
|---|---|---|---|
| `prop_n06_ofrenda_grande` | 112×96 | 4 · 8 fps | Tres niveles, arco de cempasúchil, papel picado, retratos, pan, calaveritas, copal, veladoras |
| `prop_n06_ofrenda_descanso` | 112×96 | 4 · 6 fps | Variante para aprender **DESCANSO** (aura turquesa-lila, almas que suben). Mismo tamaño: se cambia la textura |
| `prop_n06_ofrenda_chica` | 48×44 | 4 · 8 fps | Mesita de banqueta |
| `prop_n06_ofrenda_flotante` / `prop_n06_brasero` | 96×48 / 32×48 | 4 · 8 fps | **FUEGO**: brasero con fuego (luz automática) |
| `prop_n06_inscripcion` | 56×56 | 2 · 2 fps | **VERDAD**: estela con glifos propios que laten |
| `prop_n06_trajinera` | 176×58 | 1 | Varada, arco "LUPITA" |
| `prop_n06_ahuejote` | 40×128 | 1 | |
| `prop_n06_arbol_munecas` | 104×128 | 4 · 2 fps | Decoración (las muñecas se mecen); NO es la enemiga |
| `prop_n06_papel_picado` | 128×28 | 4 · 4 fps | Lo usa el decorado en los cables |
| `prop_n06_cempasuchil`, `prop_n06_maceta_cempasuchil` | 28×16, 20×24 | 1 | |
| `prop_n06_calaverita`, `prop_n06_calaveritas` | 12×12, 32×16 | 1 | |
| `prop_n06_veladoras` | 32×20 | 4 · 8 fps | Luz automática |
| `prop_n06_auto`, `prop_n06_auto_2`, `prop_n06_taxi` | 96×44 | 1 | Abandonados, sin marca |
| `prop_n06_poste_neon` | 32×96 | 4 · 5 fps | Neón "TACOS" que parpadea |
| `prop_n06_escombros` / `prop_n06_escombros_grandes` | 64×24 / 104×48 | 1 | El grande sirve de obstáculo |
| `prop_n06_cornisa`, `prop_n06_losa_alta`, `prop_n06_viga` | 88×44, 96×46, 112×50 | 1 | **Plataformas del doble salto**: cara superior plana + frente de ~32–36 px. `height` sugerido 32 / 34 / 36 (`CDMX_HIGH_PROPS`) |
| `prop_n06_angel_columna` + `prop_n06_angel_figura` | 208×56 + 144×72 | 1 | El **Ángel caído** en dos piezas (tambores con anillos dorados; Victoria alada dorada de espaldas, ala rota) |
| `prop_n06_letras_cdmx` | 136×72 | 1 | Letras turísticas desgastadas |
| `prop_n06_estacion_teleferico` | 192×144 | 2 · 2 fps | Fachada de la estación base (neón que parpadea) |
| `prop_n06_cabina` | 32×38 | 2 · 2 fps | Cabina del teleférico (el decorado la usa en los cables) |

Altar de la Memoria: usar el común (`altar_memoria`).

## NPCs comunes (`sprites/npcs/`) — 64×80, 4 cuadros, pivote (32, 78), miran a la derecha

`npc_sobreviviente_1` señora con rebozo y veladora · `npc_sobreviviente_2` vendedor de pan de muerto (charola en la cabeza) · `npc_sobreviviente_3` joven con chamarra, mochila y lámpara · `npc_sobreviviente_4` anciano con sombrero y bastón · `npc_sobreviviente_5` cronista con lentes y libreta. Todos se ven normales: cualquiera sirve de `disguise` de un nahual.

Colocar: JSON `{"key":"npc_sobreviviente_5","anim":"npc_sobreviviente_5","x":990,"y":242}` o `addCdmxNpc(world, key, x, y, { id, flipX })`.

## Regenerar

`npm run scenery:nivel6` crea lo que falte; `-- --force` regenera solo PNG con la marca `ECOS-placeholder:cdmx-v1` **y** el hash registrado; `--only=texto` filtra claves; `--preview=carpeta` escribe vistas previas; `--dry` no escribe nada en el juego. Un PNG del equipo, una ruta personalizada o `placeholder:false` nunca se pisan.
