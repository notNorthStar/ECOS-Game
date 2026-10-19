# Nivel 2: San Andrés Tuxtla — La música perdida

Implementación jugable basada en `NDD_v2.md`, `NIVELES_ECOS.md` §4 y la actualización ACT-N2-001. La versión actual tiene dos Chaneques Mayores guardianes y conserva el fandango, el primer Fragmento del Sello y la advertencia sobre el rito nocturno de la Cofradía. Catemaco corresponde al Nivel 3.

## Nueva idea de actualización: ACT-N2-001

**Implementada en código el 2026-10-19.** El mapa pasa de 3600 a **7200 px**. Las estrofas se separan entre 1200 y 1400 px; **un Chaneque Mayor custodia la estrofa 2 (`monte`) y otro la 5 (`memoria`)**. La idea original queda registrada en [Ideas de actualización](IDEAS_ACTUALIZACION.md#act-n2-001--san-andrés-tuxtla-exploración-ampliada-y-guardianes).

Aquí, «fragmentos 2 y 5» se refiere a fragmentos musicales del fandango. El primer Fragmento del Sello continúa siendo la recompensa final. Las posiciones y cifras siguientes describen la versión ampliada; equilibrio y duración real siguen pendientes de una partida humana completa.

## Recorrido actual

1. Llegar a las letras de San Andrés Tuxtla. El checkpoint está en `(240, 295)`; el altar permite curarse, mejorar y actualizar el punto de regreso.
2. Hablar con el músico de la entrada en `(500, 295)` mediante **E** para conocer la misión.
3. Buscar cinco recuerdos por el camino del río, el monte, los talleres, los jardines y el memorial. Alternan entre el fondo y el frente del suelo transitable.
4. Antes de `monte` y `memoria`, usar los altares de x1920 y x5820 para curarse y mejorar. Al entrar en cada claro, el guardián cierra su arena. Aturdir con el láser verde o esquivar un salto abre una ventana para **CALMA**; sus dos fases se resuelven sin necesitar VOZ.
5. Purificar cada guardián desbloquea únicamente su estrofa y guarda un checkpoint junto a ella. Calmar a los chaneques comunes cercanos y recuperar los recuerdos con **E**.
6. Reunirse con los músicos en la tarima de x6800 e interactuar para reconstruir el fandango. Se aprende **VOZ** y se obtiene el primer Fragmento del Sello.
7. Escuchar la pista sobre Catemaco y usar la salida de x7120, que vuelve al título.

| Estrofa | Recuerdo | Posición | Encuentro |
|---|---|---|---|
| 1 | `rio` | (1000, 245) | Chaneques comunes cercanos |
| 2 | `monte` | (2400, 320) | Chaneque Mayor; arena x2070–2730 |
| 3 | `madera` | (3800, 245) | Chaneques comunes cercanos |
| 4 | `encuentro` | (5100, 320) | Chaneques comunes cercanos |
| 5 | `memoria` | (6300, 245) | Chaneque Mayor; arena x5970–6630 |

La ruta empieza en `(80, 295)` y termina a la derecha, sin exigir regresar al inicio para activar la misión. No hay obstáculos sobre los puntos interactivos ni plataformas que requieran saltar.

## Controles

**WASD** mueve al personaje a lo ancho y en profundidad; **Espacio** salta y **Shift** corre. **C** esquiva. **1/2** seleccionan láser verde/rojo y **X** o clic izquierdo dispara. **E** interactúa. **Q** lanza el conjuro seleccionado y mantenida abre la rueda. **Tab** abre el diario y **Esc** pausa. El juego permite completar el nivel con teclado, sin cámara.

## Datos y configuración

| Archivo | Responsabilidad |
| --- | --- |
| `src/data/levels/tuxtla.json` | Mapa de 7200 px, posiciones, franja transitable, 14 chaneques comunes, dos guardianes, altares, checkpoints e interacciones |
| `src/data/guardian.json` | Perfil de los dos guardianes: vida, Ecos, invocaciones y mensajes propios del Nivel 2 |
| `src/data/dialogue/n02.json` | Diálogos del nivel y hablantes con prefijo `n02_` |
| `src/data/tuxtla.json` | Lista de estrofas, radio de guardianes, recompensas y contador de misión |
| `src/systems/TuxtlaDirector.ts` | Orden de misión, estados, recuperación tras muerte y recompensa final |
| `src/world/TuxtlaScenery.ts` | Escenografía provisional generada por código, letras, músicos y tarima |
| `src/world/TuxtlaLandscape.ts` y `TuxtlaTerrain.ts` | Fuente de las seis capas regeneradas: paisaje, arquitectura, empedrado y vegetación |
| `src/world/TuxtlaDecor.ts` | Decorado detallado con animación discreta; respeta efectos reducidos |
| `src/systems/audio/fandango.ts` | Capas musicales que responden a los recuerdos recuperados |

Las cinco estrofas y el conjuro **VOZ** son propuestas de diseño identificadas como tales en `NIVELES_ECOS.md`; su cantidad y recompensas permanecen en datos configurables. Los identificadores de estrofas son `rio`, `monte`, `madera`, `encuentro`, `memoria`. La interacción usa `n02_estrofa` con `data.verseId`.

Recompensas ajustadas: 10 Ecos por estrofa, 25 por aprender VOZ, 15 por el Fragmento del Sello y 35 por cada guardián (premio fijo). Con los 14 chaneques comunes purificados, aproximadamente **272–286 Ecos**, sin contar invocados. Los valores siguen en JSON y requieren equilibrio con una partida humana.

Los guardianes usan 140 puntos de vida, dos fases y un máximo de dos invocados propios por encuentro. Los flags `n02:guardian:monte` y `n02:guardian:memoria` son independientes. Los eventos del jefe llevan `encounterId`; purificar uno solo calma a sus propios invocados. Al morir, se conservan guardianes resueltos y estrofas; un encuentro inconcluso se reinicia desde su checkpoint cercano y el guardián resuelto no reaparece ni vuelve a conceder Ecos.

## Alcance provisional

La escenografía, músicos e instrumentos son representaciones procedurales para validar la ruta y el funcionamiento. No sustituyen assets del equipo y no se sobrescriben sus PNG. El audio procedural permite comprobar la reconstrucción progresiva; todavía requiere revisión musical del equipo. No se presenta como grabación o interpretación tradicional verificada.

La segunda pasada visual genera seis PNG a 1× con `npm run scenery:nivel2`, conserva la paleta oficial y separa jardín de entrada, calles, claro tropical, taller y plaza. El generador protege imágenes del equipo mediante marca y hash; los dibujos por código quedan de respaldo. Medidas y reemplazo: `ART_SPEC.md` §9.

Quedan pendientes arte final, revisión cultural y musical, prueba humana con cámara, equilibrio y duración real de una partida. Las posiciones, 14 chaneques comunes y dos guardianes son ajustables mediante JSON. Balam, Luna, el escudo y el ritual de Catemaco no forman parte de este nivel.
