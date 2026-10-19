# Ideas de actualización de ECOS

Registro de nuevas ideas del equipo. Cada entrada distingue lo solicitado del estado del juego. Una idea documentada todavía puede tener parámetros por diseñar y no equivale a una funcionalidad implementada.

## ACT-N2-001 — San Andrés Tuxtla: exploración ampliada y guardianes

**Fecha:** 2026-10-19. **Origen:** petición directa del equipo. **Estado:** nueva idea de actualización registrada; pendiente de implementación. **Ámbito:** Nivel 2.

### Cambios solicitados

1. **Hacer el nivel más largo:** ampliar el recorrido de San Andrés Tuxtla respecto al mapa actual de 3600 px, con más espacio de exploración entre la entrada y la plaza del fandango.
2. **Dispersar más los cinco fragmentos musicales:** separar sus ubicaciones en zonas más distantes del pueblo y aprovechar la profundidad para que encontrarlos implique explorar. Conservar cinco estrofas y la reconstrucción progresiva de la música.
3. **Añadir un Chaneque Mayor en el fragmento musical 2 y otro en el 5:** dos encuentros de guardianes durante la búsqueda, además de los chaneques comunes.

En esta idea, **fragmento musical** significa uno de los cinco recuerdos o estrofas del fandango. El **primer Fragmento del Sello** sigue siendo la recompensa narrativa al completar la misión; no cambia el total de seis fragmentos del sello de la campaña.

| Orden de estrofa | Identificador actual | Recuerdo | Cambio propuesto |
|---|---|---|---|
| 1 | `rio` | Río | Reubicar en la ruta ampliada |
| 2 | `monte` | Monte | Reubicar y añadir un Chaneque Mayor guardián |
| 3 | `madera` | Madera | Reubicar en una zona más alejada |
| 4 | `encuentro` | Encuentro | Reubicar en otra zona de exploración |
| 5 | `memoria` | Memoria | Reubicar y añadir otro Chaneque Mayor guardián |

La numeración identifica las estrofas; el orden obligatorio de recogida no se ha definido. El segundo guardián se asocia a `memoria` aunque el jugador explore en otro orden.

### Diseño previsto para desarrollar la idea

- Organizar el recorrido ampliado en zonas reconocibles y conectar las estrofas con pistas visuales y el rastro de la gema.
- Proponer que la estrofa custodiada se pueda recuperar después de purificar a su guardián. Reutilizar el combate del Chaneque Mayor, adaptado como minijefe de esta actualización; sus parámetros quedan por equilibrar.
- Mantener el aprendizaje de CALMA y PROTECCIÓN procedente de Xalapa. VOZ se aprende al reconstruir el fandango, por lo que no puede ser obligatorio para superar estos encuentros.
- Distribuir checkpoints y acceso a curación para que morir no obligue a repetir un tramo excesivo. Conservar estrofas, guardianes resueltos y recompensas concedidas al reaparecer.
- Conservar el cierre narrativo: fandango, VOZ, primer Fragmento del Sello y pista hacia Catemaco.

Estas pautas son propuestas de implementación. Quedan por fijar ancho final, ubicaciones, distancias mínimas, duración objetivo, número de enemigos comunes, dificultad de cada guardián y recompensas. Las cifras actuales de 8–10 minutos y aproximadamente 250 Ecos describen el diseño previo y deberán reevaluarse.

### Consideraciones técnicas para la futura implementación

- Ampliar el mapa y colocar los cinco recuerdos en `src/data/levels/tuxtla.json`; mantener sus identificadores para el contador y el progreso musical.
- Dar a cada guardián un identificador y progreso independiente. El evento global `boss:calmed` actual tiene efectos compartidos: deberá acotarse para que purificar uno no resuelva el otro encuentro ni calme a todos los chaneques del nivel.
- Adaptar al Nivel 2 los avisos, fases, ventanas de vulnerabilidad y barra del Chaneque Mayor. Evitar referencias a la antena y al cierre de Xalapa, que pertenecen al Nivel 1.
- Guardar el estado de cada encuentro en flags propios del Nivel 2 y evitar repetir premios tras muerte o reentrada.
- Ajustar los fondos, parallax y decorado al nuevo ancho. Usar el generador protegido y conservar el arte del equipo.
- Revisar costes y Ecos para que dos guardianes no alteren accidentalmente la curva de progresión de la campaña.

### Comprobación esperada al implementarla

- El recorrido es más largo que el actual y las cinco estrofas están más dispersas, con pistas suficientes para encontrarlas.
- Hay dos Chaneques Mayores independientes: uno custodia `monte` y otro `memoria`.
- Recoger o resolver un encuentro no completa el otro; los premios no se duplican al reaparecer.
- Se puede terminar con teclado, usando los conjuros ya disponibles antes del fandango.
- El fandango y su recompensa narrativa siguen funcionando al recuperar las cinco estrofas.

### Relación con la documentación existente

El diseño original de `NIVELES_ECOS.md` describe el Nivel 2 sin jefe. Esta entrada registra una **nueva idea de actualización** que incorpora dos minijefes guardianes. La implementación actual sigue sin estos encuentros; `NDD_v2.md` conserva la historia oficial. La ficha del estado jugable está en `NIVEL_02.md`.
