# Nivel 2: San Andrés Tuxtla — La música perdida

Implementación jugable provisional basada en `NDD_v2.md` y `NIVELES_ECOS.md` §4. La versión actual no incluye jefe ni contenido de Catemaco. La historia conserva el fandango, el primer Fragmento del Sello y la advertencia sobre el rito nocturno de la Cofradía.

## Nueva idea de actualización: ACT-N2-001

**Registrada el 2026-10-19; pendiente de implementación.** El equipo solicita alargar el nivel, dispersar más las cinco estrofas y añadir **un Chaneque Mayor en la estrofa 2 (`monte`) y otro en la 5 (`memoria`)**. La propuesta completa y sus puntos pendientes están en [Ideas de actualización](IDEAS_ACTUALIZACION.md#act-n2-001--san-andrés-tuxtla-exploración-ampliada-y-guardianes).

Aquí, «fragmentos 2 y 5» se refiere a fragmentos musicales del fandango. El primer Fragmento del Sello continúa siendo la recompensa final. El ancho, coordenadas y recompensas descritos más abajo corresponden a la versión actual; el nuevo tamaño y el equilibrio de los guardianes quedan por definir.

## Recorrido actual

1. Llegar a las letras de San Andrés Tuxtla. El checkpoint está en `(240, 295)`; el altar permite curarse, mejorar y actualizar el punto de regreso.
2. Hablar con el músico de la entrada en `(500, 295)` mediante **E** para conocer la misión.
3. Avanzar por el pueblo buscando cinco recuerdos: río, monte, madera, encuentro y memoria. Alternan entre el fondo y el frente de la franja transitable. Calmar a los chaneques cercanos permite recuperarlos con **E**.
4. Reunirse con los músicos en la tarima al final del pueblo e interactuar para reconstruir el fandango. Se aprende **VOZ** y se obtiene el primer fragmento.
5. Escuchar la pista sobre Catemaco y usar la salida. Catemaco corresponde al Nivel 3 y queda fuera de esta entrega.

La ruta empieza en `(80, 295)` y termina a la derecha, sin exigir regresar al inicio para activar la misión. No hay obstáculos sobre los puntos interactivos ni plataformas que requieran saltar.

## Controles

**WASD** mueve al personaje a lo ancho y en profundidad; **Espacio** salta y **Shift** corre. **C** esquiva. **1/2** seleccionan láser verde/rojo y **X** o clic izquierdo dispara. **E** interactúa. **Q** lanza el conjuro seleccionado y mantenida abre la rueda. **Tab** abre el diario y **Esc** pausa. El juego permite completar el nivel con teclado, sin cámara.

## Datos y configuración

| Archivo | Responsabilidad |
| --- | --- |
| `src/data/levels/tuxtla.json` | Mapa de 3600 px, posiciones, franja transitable, diez chaneques, props, checkpoint e interacciones |
| `src/data/dialogue/n02.json` | Diálogos del nivel y hablantes con prefijo `n02_` |
| `src/data/tuxtla.json` | Lista de estrofas, radio de guardianes, recompensas y contador de misión |
| `src/systems/TuxtlaDirector.ts` | Orden de misión, estados, recuperación tras muerte y recompensa final |
| `src/world/TuxtlaScenery.ts` | Escenografía provisional generada por código, letras, músicos y tarima |
| `src/world/TuxtlaLandscape.ts` y `TuxtlaTerrain.ts` | Fuente de las seis capas regeneradas: paisaje, arquitectura, empedrado y vegetación |
| `src/world/TuxtlaDecor.ts` | Decorado detallado con animación discreta; respeta efectos reducidos |
| `src/systems/audio/fandango.ts` | Capas musicales que responden a los recuerdos recuperados |

Las cinco estrofas y el conjuro **VOZ** son propuestas de diseño identificadas como tales en `NIVELES_ECOS.md`; su cantidad y recompensas permanecen en datos configurables. Los identificadores de estrofas son `rio`, `monte`, `madera`, `encuentro`, `memoria`. La interacción usa `n02_estrofa` con `data.verseId`.

Recompensas iniciales: 10 Ecos por estrofa, 25 por aprender VOZ y 85 por el fragmento; con diez chaneques purificados, aproximadamente 240–250 Ecos durante el nivel. Es una estimación de equilibrio, pendiente de una partida humana.

## Alcance provisional

La escenografía, músicos e instrumentos son representaciones procedurales para validar la ruta y el funcionamiento. No sustituyen assets del equipo y no se sobrescriben PNG. El audio procedural permite comprobar la reconstrucción progresiva; todavía requiere revisión musical del equipo. No se presenta como grabación o interpretación tradicional verificada.

La segunda pasada visual genera seis PNG a 1× con `npm run scenery:nivel2`, conserva la paleta oficial y separa jardín de entrada, calles, claro tropical, taller y plaza. El generador protege imágenes del equipo mediante marca y hash; los dibujos por código quedan de respaldo. Medidas y reemplazo: `ART_SPEC.md` §9.

Quedan pendientes arte final, revisión cultural y musical, prueba humana con cámara, equilibrio y duración real de una partida. Las posiciones y diez chaneques son ajustables mediante JSON. Balam, Luna, el escudo y el ritual de Catemaco no forman parte de este nivel.
