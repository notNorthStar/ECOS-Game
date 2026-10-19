# Escenarios del Nivel 2 — San Andrés Tuxtla

Esta carpeta reserva el espacio para el arte final del pueblo, los músicos y la tarima del fandango. Actualmente el nivel usa `src/world/TuxtlaScenery.ts`: dibujo procedural provisional que no escribe ni modifica archivos de imagen del equipo.

La resolución base es **640 × 360**, con pixel art y escala por vecino más cercano. El mapa mide **3600 px** de ancho. La franja transitable está entre **y = 222 y 345**; debe permanecer legible y libre de decoraciones que aparenten bloquear las interacciones.

La ambientación es un atardecer cálido y húmedo: casas coloridas, vegetación de Los Tuxtlas y plaza con tarima de madera, jaranas y arpa. Las letras deben decir **SAN ANDRÉS TUXTLA**; no reutilizar la imagen que dice XALAPA.

Para preparar fondos, usar seis capas con factores `0.04`, `0.15`, `0.4`, `0.65`, `1`, `1.25`; su ancho es `ceil(640 + (3600 - 640) × factor)` y su alto 360. Las claves previstas son `fondo_tuxtla_capa0` a `fondo_tuxtla_capa5`. Integrar el arte final requiere registrarlo en el manifiesto y ajustar el instalador procedural para que conserve las capas reales.

Mantener originales en `arte-fuente/`, registrar autoría/licencia y añadir los PNG finales sin sobrescribir trabajo existente. Revisar `docs/ASSETS.md`, `ART_SPEC.md` y `docs/NIVEL_02.md` antes de la entrega de arte.
