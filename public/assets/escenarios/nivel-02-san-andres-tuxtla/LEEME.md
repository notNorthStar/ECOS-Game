# Escenarios del Nivel 2 — San Andrés Tuxtla

`fondos/` contiene seis PNG regenerados con detalle de píxel, paleta global y alfa 0/255. El dibujo fuente está en `TuxtlaLandscape.ts` y `TuxtlaTerrain.ts`; `TuxtlaScenery.ts` integra las capas y `TuxtlaDecor.ts` aporta letras turísticas, músicos, tarima, luces, recuerdos y salida. Son arte procedural reemplazable, identificado en `src/data/assets.json`.

La resolución base es **640 × 360**, con pixel art y escala por vecino más cercano. El mapa mide **3600 px** de ancho. La franja transitable está entre **y = 222 y 345**; debe permanecer legible y libre de decoraciones que aparenten bloquear las interacciones.

La ambientación es un atardecer cálido y húmedo: casas coloridas, vegetación de Los Tuxtlas y plaza con tarima de madera, jaranas y arpa. Las letras deben decir **SAN ANDRÉS TUXTLA**; no reutilizar la imagen que dice XALAPA.

Las capas usan factores `0.04`, `0.15`, `0.4`, `0.65`, `1`, `1.25`; sus anchos son 759, 1084, 1824, 2564, 3600 y 4340, con alto 360. Claves: `fondo_tuxtla_capa0` a `fondo_tuxtla_capa5`. Se cargan desde el manifiesto; las texturas reales tienen prioridad sobre el respaldo por código. Reemplazar los PNG por arte del equipo conserva esa prioridad.

`npm run scenery:nivel2` crea lo que falte. `npm run scenery:nivel2 -- --force` solo regenera un PNG si conserva la marca y el hash propios. No pisa sustituciones del equipo, rutas personalizadas ni entradas marcadas `placeholder:false`. Lista y dirección visual en `ART_SPEC.md` §9.

Mantener originales en `arte-fuente/`, registrar autoría/licencia y añadir los PNG finales sin sobrescribir trabajo existente. Revisar `docs/ASSETS.md`, `ART_SPEC.md` y `docs/NIVEL_02.md` antes de la entrega de arte.
