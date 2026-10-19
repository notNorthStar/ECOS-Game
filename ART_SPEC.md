# ART_SPEC — ECOS, Nivel 1 (Xalapa)

> Para quien dibuja y para otras IAs. Se puede entregar tal cual.
> Rutas y nombres: `docs/ASSETS.md`. Claves del juego: `docs/ARQUITECTURA.md` §4. Manifiesto: `src/data/assets.json`.
> Placeholders: `npm run placeholders` (`tools/gen-placeholders.mjs`).

## 1. Medidas finales

| Qué | Cuadro | Alto del personaje | Pivote (pies) | originY | Notas |
|---|---|---|---|---|---|
| **Humanoides** (protagonista, NPCs) | **64×80** | ~72 px adulto; protagonista 66–70 (se lee más joven; placeholder = 70) | **(32, 78)**: la fila más baja con píxeles es y = 78 | 78/80 = 0.975 | Estándar del equipo de arte |
| **Chaneque** (humanoide bajo) | **64×64** | 50–60 px (placeholder ≈ 54) | **(32, 62)** | 62/64 = 0.96875 | |
| **Chaneque Mayor** (jefe) | **128×128** (o el múltiplo de 8 necesario: ancho ≥ sprite + 4, alto ≥ sprite + 3) | hasta 120 px (placeholder ≈ 112) | **(ancho/2, alto − 2)** = (64, 126) | 126/128 = 0.984375 | |
| Retratos | 48×48 | — | — | — | Vista de frente |
| Fondos | ancho de capa × **360** | — | — | — | ver §4 |

- Resolución base **640×360**, escalado entero, `pixelArt: true`. Pixel art a **1×** (nunca ampliado).
- Suelo transitable: franja **y = 220…345**; horizonte del suelo en **y ≈ 205**. Terrazas del parque: y ≈ 170–215.
- **Tiras horizontales**: una por animación, cuadros del mismo tamaño, de izquierda a derecha. La clave de la animación es el nombre del archivo sin `.png`.

## 2. Reglas de estilo (personajes)

- **Alfa solo 0 o 255**, sin antialias. Brillos y estelas se hacen con **dithering**, no con semitransparencia.
- **Máx. 32 colores por personaje**, de la paleta global (§3).
- **Contorno exterior de 1 px de color** (el color más oscuro de la rampa del material, **no negro**), sobre todo cuando la silueta es brillante.
- **2–3 tonos por material**; **luz desde arriba a la izquierda**; sombra en el suelo la pone el juego (`fx_sombra`).
- **Ojos de 1–2 px.**
- **Vista principal de lado** (mirando a la derecha; el juego voltea con `flipX`). El equipo dibuja vistas estáticas (frente, lado_izq, lado_der, espalda): **las tiras de animación del repo son placeholders** con las medidas finales.
- Referencias: `docs/referencias/estilo_protagonista.png` (proporción, colores) y `docs/referencias/worlorn/` (atmósfera).
- **Sin sangre ni gore**: daño = destello blanco; morir = caer de rodillas; los seres se **purifican** (luz dorada), no mueren.

## 3. Paleta global (63 colores)

Definida en `tools/gen-placeholders.mjs` (`PAL`). Rampas de oscuro a claro.

| Grupo | Colores |
|---|---|
| Noche y niebla verde de Xalapa | `#120e1a` `#0a0f1a` `#0f1826` `#152536` `#1c3340` `#26464c` · niebla `#365e5a` `#4f7c6e` `#77a08a` `#a8c4a8` |
| Montañas y nieve (Pico de Orizaba) | `#24394a` `#33505a` `#8aa4a8` `#c8dcd8` |
| Cantera gris (y pantalón) | `#1e1c24` `#2e2c34` `#45434a` `#625f62` `#8a857e` `#b3ab9c` |
| Teja / terracota | `#3a1a18` `#6a2e24` `#9a4630` `#c46a40` |
| Luz cálida (faroles, velas, ventanas) | `#7a3a1a` `#d0742c` `#f2a640` `#ffd77a` `#fff4cc` |
| Rosa mexicano (bufanda, neón) | `#5a0a3a` `#a8125e` `#e8207e` `#ff6ab0` |
| Turquesa (gema, conjuros, neón) | `#0a3a40` `#128a8a` `#2ad0c0` `#9af8e8` |
| Morado de la corrupción (antena) | `#2a0a40` `#5a1890` `#9a3ae0` `#d89aff` |
| Follaje (y chaqueta) | `#0a1a14` `#14301f` `#22482c` `#36663a` `#5a8a46` `#9ab85a` |
| Tierra / madera (y cabello, botas) | `#1e120e` `#3a2418` `#5c3a24` `#8a5a34` `#b88a52` |
| Piel | `#6a3a30` `#b4785a` `#e0a882` `#f6d0a8` |
| Camisa | `#9aa0bc` `#dcdff0` |
| Láser verde / rojo | `#8aff6a` `#e8ffd0` · `#c02030` `#ff5040` `#ffb0a0` |

**Paletas por personaje:** protagonista = cabello/botas (tierra), piel, chaqueta (follaje), camisa, pantalón (cantera), bufanda (rosa), gema (turquesa). Chaneque = piel verde-tierra (follaje + contorno tierra), sombrero de hoja (follaje oscuro), faldita de hojas secas (tierra), ojos morados. Chaneque Mayor = corteza (tierra), musgo (follaje), venas y ojos morados; al purificarse, ojos cálidos y flores rosa/ámbar.

## 4. Fondos (parallax de 6 capas)

Ancho de capa = `640 + (anchoSección − 640) × factor` (`layerWidth` en `src/config/game.ts`). Alto 360. Factores: 0.04 · 0.15 · 0.4 · 0.65 · 1 · 1.25.

| Capa | Contenido | Opacidad |
|---|---|---|
| 0 | Cielo: degradado con dithering, nubes iluminadas, estrellas, luna (jefe: cielo morado) | Opaca |
| 1 | Montañas y Pico de Orizaba nevado entre nubes, cerros cercanos | Transparente arriba |
| 2 | Ciudad media sobre cerros con ventanas cálidas, torres de la catedral, niebla (parque: antena al fondo; jefe: bosque) | Transparente arriba |
| 3 | Lo cercano: casas coloniales de cantera, balcones, faroles, cables, neones rotos (parque: árboles y balaustrada; jefe: antena gigante; **taller: pared interior con ventanales transparentes** por los que se ven las capas 0–2) | Transparente arriba |
| 4 | Suelo (factor 1, ancho = sección): banqueta + empedrado (calles), terraza + muro + baldosas (parque), raíces moradas (jefe), duela + tapete de sarape (taller) | Desde y ≈ 168–198 |
| 5 | Primer plano (factor 1.25): orilla inferior oscura, ramas, bugambilias, cables, barandal desenfocado, focos colgantes | Casi toda transparente |

Anchos de sección: taller 1280 · calles 2560 · parque 2880 · jefe 1600.

## 5. Cómo reemplazar un placeholder

**Personajes hechos con el kit del equipo (lo más directo):** sube la carpeta que genera `pixelizar.py` tal cual a `public/assets/sprites/personajes/<id>/` (ids: `protagonista`, `chaneque`, `chaneque_mayor`, `madre`). El juego la detecta al arrancar, usa sus vistas fijas y las anima por código. No hay que dibujar tiras ni tocar código. Detalle en `public/assets/sprites/personajes/LEEME.md`.

**Tiras de animación cuadro por cuadro (opcional, para más calidad):**

1. Dibuja con **el mismo nombre de archivo y las mismas medidas** (tira = cuadro × número de cuadros). Usa las plantillas de `art-templates/`.
2. Súbelo encima del placeholder en `public/assets/...`. **No hay que tocar código.**
3. Corre `npm run placeholders`: detecta que el archivo ya no es nuestro (los placeholders llevan un chunk PNG `tEXt` "ECOS-placeholder") y lo marca `"placeholder": false` en el manifiesto. Si las medidas no coinciden, avisa en consola y **no lo toca**.
4. ¿Cambias el número de cuadros o los fps? Edita esa entrada en `src/data/assets.json` (el script respeta las entradas que no son placeholder).

El script **nunca sobrescribe arte del equipo**: crea un archivo solo si no existe; `--force` solo regenera los que llevan la marca de placeholder.

## 6. Plantillas (`art-templates/`)

| Archivo | Uso |
|---|---|
| `plantilla_humanoide_64x80.png` | Protagonista y NPCs. Línea de pies (rosa) en **y = 78**, eje central turquesa, cuadrícula de 8 px, silueta del placeholder |
| `plantilla_chaneque_64x64.png` | Chaneque. Pies en **y = 62** |
| `plantilla_jefe_128x128.png` | Chaneque Mayor. Pies en **y = 126** |

## 7. Nota sobre IA de imágenes

Las IAs de imagen son **malas para animaciones consistentes**: cambian proporciones, ropa y colores entre cuadros. Recomendación:
- Pedir a la IA **pocas poses clave** (reposo, paso, disparo, conjuro), no tiras completas.
- **Retocar a mano**: reducir por vecino más cercano a la medida exacta, cuantizar a la paleta (§3), limpiar alfa (0/255) y contorno.
- **Animar por código** lo que se pueda (respiración, rebote, inclinación, destellos, estelas, partículas).
- Guardar la salida cruda en `arte-fuente/ia-generado/` y registrarla en `AI_LOG.md`.

## 8. Lista completa de assets del Nivel 1

Prioridad **Alta** = lo que más se ve (protagonista, chaneque, jefe, fondos de calles/parque/jefe, letras, logo, vida, altar).
Columnas: archivo (bajo `public/assets/`), cuadro, número de cuadros, animación, originY, prioridad.

| Archivo | Cuadro | Cuadros | Animación | originY | Prioridad |
|---|---|---|---|---|---|
| `escenarios/comun/altar_memoria.png` | 48×48 | 4 | 6 fps / bucle | 0.9583 | Alta |
| `escenarios/comun/letras_xalapa.png` | 192×72 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_calles_capa0.png` | 717×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_calles_capa1.png` | 928×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_calles_capa2.png` | 1408×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_calles_capa3.png` | 1888×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_calles_capa4.png` | 2560×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_calles_capa5.png` | 3040×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_jefe_capa0.png` | 679×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_jefe_capa1.png` | 784×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_jefe_capa2.png` | 1024×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_jefe_capa3.png` | 1264×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_jefe_capa4.png` | 1600×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_jefe_capa5.png` | 1840×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_parque_capa0.png` | 730×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_parque_capa1.png` | 976×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_parque_capa2.png` | 1536×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_parque_capa3.png` | 2096×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_parque_capa4.png` | 2880×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_parque_capa5.png` | 3440×360 | 1 | — | — | Alta |
| `escenarios/nivel-01-xalapa/fondos/fondo_taller_capa0.png` | 666×360 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/fondos/fondo_taller_capa1.png` | 736×360 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/fondos/fondo_taller_capa2.png` | 896×360 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/fondos/fondo_taller_capa3.png` | 1056×360 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/fondos/fondo_taller_capa4.png` | 1280×360 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/fondos/fondo_taller_capa5.png` | 1440×360 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_antena_rota.png` | 64×144 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_antena.png` | 64×144 | 4 | 6 fps / bucle | 0.5 | Media |
| `escenarios/nivel-01-xalapa/props/prop_arbol.png` | 80×112 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_arbusto.png` | 48×32 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_auto_viejo.png` | 96×40 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_banca.png` | 48×24 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_barandal.png` | 64×24 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_busto_juarez.png` | 48×88 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_caja.png` | 32×28 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_codice.png` | 24×24 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_escalera.png` | 48×48 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_estante.png` | 48×80 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_farol.png` | 16×72 | 2 | 3 fps / bucle | 0.5 | Media |
| `escenarios/nivel-01-xalapa/props/prop_grabado_calma.png` | 40×48 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_mesa_taller.png` | 96×48 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_nota_madre.png` | 16×16 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_pistola_laser.png` | 16×16 | 2 | 4 fps / bucle | 0.5 | Media |
| `escenarios/nivel-01-xalapa/props/prop_poste.png` | 16×96 | 1 | — | — | Media |
| `escenarios/nivel-01-xalapa/props/prop_puerta_taller.png` | 40×80 | 1 | — | — | Media |
| `sprites/efectos/fx_brillo.png` | 32×32 | 1 | — | — | Media |
| `sprites/efectos/fx_chispa.png` | 4×4 | 1 | — | — | Media |
| `sprites/efectos/fx_eco.png` | 8×8 | 4 | 8 fps / bucle | 0.5 | Media |
| `sprites/efectos/fx_gota.png` | 1×5 | 1 | — | — | Media |
| `sprites/efectos/fx_hoja.png` | 5×5 | 4 | 8 fps / bucle | 0.5 | Media |
| `sprites/efectos/fx_impacto.png` | 16×16 | 4 | 20 fps / una vez | 0.5 | Media |
| `sprites/efectos/fx_laser_rojo.png` | 32×6 | 2 | 12 fps / bucle | 0.5 | Media |
| `sprites/efectos/fx_laser_verde.png` | 32×6 | 2 | 12 fps / bucle | 0.5 | Media |
| `sprites/efectos/fx_luciernaga.png` | 3×3 | 1 | — | — | Media |
| `sprites/efectos/fx_niebla.png` | 256×64 | 1 | — | — | Media |
| `sprites/efectos/fx_onda.png` | 96×32 | 5 | 14 fps / una vez | 0.5 | Media |
| `sprites/efectos/fx_purificar.png` | 64×64 | 6 | 12 fps / una vez | 0.5 | Media |
| `sprites/efectos/fx_raiz.png` | 24×48 | 5 | 12 fps / una vez | 0.5 | Media |
| `sprites/efectos/fx_rastro.png` | 8×8 | 4 | 10 fps / bucle | 0.5 | Media |
| `sprites/efectos/fx_roca.png` | 16×16 | 1 | — | — | Media |
| `sprites/efectos/fx_sombra.png` | 32×10 | 1 | — | — | Media |
| `sprites/enemigos/chaneque_agotado.png` | 64×64 | 4 | 6 fps / bucle | 0.9688 | Alta |
| `sprites/enemigos/chaneque_ataque.png` | 64×64 | 4 | 12 fps / una vez | 0.9688 | Alta |
| `sprites/enemigos/chaneque_caminar.png` | 64×64 | 6 | 10 fps / bucle | 0.9688 | Alta |
| `sprites/enemigos/chaneque_dano.png` | 64×64 | 2 | 10 fps / una vez | 0.9688 | Alta |
| `sprites/enemigos/chaneque_purificar.png` | 64×64 | 6 | 10 fps / una vez | 0.9688 | Alta |
| `sprites/enemigos/chaneque_reposo.png` | 64×64 | 4 | 6 fps / bucle | 0.9688 | Alta |
| `sprites/enemigos/chaneque_salto.png` | 64×64 | 3 | 10 fps / una vez | 0.9688 | Alta |
| `sprites/jefes/chaneque_mayor_aturdido.png` | 128×128 | 4 | 6 fps / bucle | 0.9844 | Alta |
| `sprites/jefes/chaneque_mayor_caminar.png` | 128×128 | 6 | 8 fps / bucle | 0.9844 | Alta |
| `sprites/jefes/chaneque_mayor_dano.png` | 128×128 | 2 | 10 fps / una vez | 0.9844 | Alta |
| `sprites/jefes/chaneque_mayor_golpe.png` | 128×128 | 5 | 10 fps / una vez | 0.9844 | Alta |
| `sprites/jefes/chaneque_mayor_invocar.png` | 128×128 | 4 | 8 fps / una vez | 0.9844 | Alta |
| `sprites/jefes/chaneque_mayor_lanzar.png` | 128×128 | 4 | 10 fps / una vez | 0.9844 | Alta |
| `sprites/jefes/chaneque_mayor_purificar.png` | 128×128 | 8 | 8 fps / una vez | 0.9844 | Alta |
| `sprites/jefes/chaneque_mayor_reposo.png` | 128×128 | 4 | 5 fps / bucle | 0.9844 | Alta |
| `sprites/jefes/chaneque_mayor_salto.png` | 128×128 | 4 | 8 fps / una vez | 0.9844 | Alta |
| `sprites/protagonista/protagonista_aterrizar.png` | 64×80 | 2 | 12 fps / una vez | 0.975 | Alta |
| `sprites/protagonista/protagonista_caminar.png` | 64×80 | 6 | 10 fps / bucle | 0.975 | Alta |
| `sprites/protagonista/protagonista_conjuro.png` | 64×80 | 4 | 8 fps / bucle | 0.975 | Alta |
| `sprites/protagonista/protagonista_correr.png` | 64×80 | 6 | 14 fps / bucle | 0.975 | Alta |
| `sprites/protagonista/protagonista_dano.png` | 64×80 | 2 | 10 fps / una vez | 0.975 | Alta |
| `sprites/protagonista/protagonista_disparar.png` | 64×80 | 3 | 16 fps / una vez | 0.975 | Alta |
| `sprites/protagonista/protagonista_esquivar.png` | 64×80 | 4 | 16 fps / una vez | 0.975 | Alta |
| `sprites/protagonista/protagonista_interactuar.png` | 64×80 | 3 | 8 fps / una vez | 0.975 | Alta |
| `sprites/protagonista/protagonista_morir.png` | 64×80 | 5 | 8 fps / una vez | 0.975 | Alta |
| `sprites/protagonista/protagonista_reposo.png` | 64×80 | 4 | 6 fps / bucle | 0.975 | Alta |
| `sprites/protagonista/protagonista_saltar_caida.png` | 64×80 | 2 | 8 fps / una vez | 0.975 | Alta |
| `sprites/protagonista/protagonista_saltar_subida.png` | 64×80 | 2 | 8 fps / una vez | 0.975 | Alta |
| `ui/mapa_ruta.png` | 640×360 | 1 | — | — | Media |
| `ui/pantalla_carga.png` | 640×360 | 1 | — | — | Media |
| `ui/retrato_madre.png` | 48×48 | 1 | — | — | Media |
| `ui/retrato_protagonista.png` | 48×48 | 1 | — | — | Media |
| `ui/titulo_logo.png` | 320×96 | 1 | — | — | Alta |
| `ui/ui_eco.png` | 8×8 | 1 | — | — | Media |
| `ui/ui_gema.png` | 24×24 | 4 | 6 fps / bucle | 0.5 | Media |
| `ui/ui_marco.png` | 24×24 | 1 | — | — | Media |
| `ui/ui_rueda.png` | 160×160 | 1 | — | — | Media |
| `ui/ui_tecla.png` | 16×16 | 1 | — | — | Media |
| `ui/ui_vida.png` | 12×12 | 2 | 1 fps / una vez | 0.5 | Alta |

NPC `sprites/npcs/` (madre, estudiantes): 64×80, pivote (32, 78), sin placeholder todavía; el retrato de la madre es `ui/retrato_madre.png`.

## 9. Nivel 2 — San Andrés Tuxtla: escenarios regenerados

Dirección: atardecer húmedo tras El Silencio, cantera y teja envejecidas, fachadas con balcones, neones rotos y cables, cerros de Los Tuxtlas, palmas y helechos. Arquitectura evocativa, sin reproducir un monumento real. Alternar entrada ajardinada, calles, claro tropical, taller con arcadas y plaza del fandango; conservar el carril y=222…345 y los puntos de misión.

PNG en `public/assets/escenarios/nivel-02-san-andres-tuxtla/fondos/`. Todos son 1×, alto 360, paleta global, alfa 0/255; capas 1–5 transparentes fuera de su contenido.

| Archivo | Medidas | Factor | Contenido |
|---|---|---|---|
| `fondo_tuxtla_capa0.png` | 759×360 | 0.04 | Cielo tramado, sol circular y nubes |
| `fondo_tuxtla_capa1.png` | 1084×360 | 0.15 | Cerros orgánicos y bruma |
| `fondo_tuxtla_capa2.png` | 1824×360 | 0.4 | Ciudad media, campanarios ficticios y vegetación |
| `fondo_tuxtla_capa3.png` | 2564×360 | 0.65 | Fachadas, tejas, balcones, palmas y arcadas |
| `fondo_tuxtla_capa4.png` | 3600×360 | 1 | Banqueta y empedrado, charcos planos, rosetones y musgo |
| `fondo_tuxtla_capa5.png` | 4340×360 | 1.25 | Helechos, ramas y bugambilia en los bordes |

Se generan con `npm run scenery:nivel2`; `-- --force` solo regenera archivos que conservan marca y hash propios. Una sustitución del equipo, una entrada `placeholder:false` o una ruta personalizada se conserva. El manifiesto distingue los PNG procedurales como `placeholder:true`; son reemplazables por arte final con iguales claves y medidas.

Decorado de respaldo en `TuxtlaDecor.ts`: letras 304×50; músicos 64×80; tarima 250×87; portada 330×127; recuerdos 42×42; señal 111×81. El juego usa primero las texturas del equipo si se registran en el manifiesto. No suavizar el dibujo ni añadir bloqueos visuales sobre las interacciones.
