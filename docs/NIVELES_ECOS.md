# ECOS — Tabla de niveles v1.0

**Basado en:** `docs/NDD_v2.md` (historia, definitiva) y `docs/GDD_ECOS.md` (mecánicas).
**Convención:** lo que viene de la historia del equipo no lleva marca. Lo que **agrega este documento** para completar el diseño (conjuros nuevos, afinidades, conteos, Ecos, música, assets) va marcado **`[PROPUESTA]`** y el equipo puede cambiarlo sin tocar la historia.
**Nuevas ideas de actualización:** se registran por separado en [IDEAS_ACTUALIZACION.md](IDEAS_ACTUALIZACION.md), con su estado de implementación. ACT-N2-001 amplía el Nivel 2 y añade dos guardianes; la ficha N2 refleja su implementación en la rama de ese nivel, pendiente de equilibrio humano.
**Letras de LSM permitidas:** A B C D E F G H I L M N O P R S T U V W Y Z (sin J, K, Ñ, Q ni X; se ignoran acentos). **Todos los conjuros de este documento cumplen esa regla** (verificado con `checkWord()` del módulo `ecos-lsm` y en su `npm test`).

---

## 1. Resumen general

| # | Acto | Lugar | Hora / clima | Conjuros nuevos | Desbloqueos | Enemigos comunes | Minijefes | Jefe | Recompensa | Ecos del nivel ≈ | Jam |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | I | **Xalapa**: taller de la madre → calles → Parque Juárez → busto de Juárez | Noche, niebla espesa, llovizna | CALMA, PROTECCION | Pistola láser (verde y rojo) | Chaneques | — | **Chaneque Mayor** | Códice de las Voces + mapa | 300 | **JUGABLE** |
| 2 | I | **San Andrés Tuxtla**: entrada → pueblo silenciado → plaza del fandango | Atardecer, calor húmedo | VOZ `[PROPUESTA]` | Misión musical | 14 chaneques rezagados | 2 Chaneques Mayores (estrofas 2 y 5) | *(cierre: misión del fandango)* | 1.er fragmento | 272–286 + invocados | ACT-N2-001 implementada en rama N2 |
| 3 | I | **Catemaco**: orilla del lago → campamento de la Cofradía → altar principal | Noche cerrada, neblina, luna | LUZ, SOL `[PROPUESTA]`, **Escudo (U)** | **Balam + Habilidad Luna**, **Escudo**; se une María | Encapuchados Rojos, espíritus | — | **Cabeza Olmeca Poseída** | Balam, Luna, Escudo | 600 | Visión |
| 4 | I | **Oaxaca**: entrada → calles empedradas → taller de artesanos → Templo de Santo Domingo | Mañana nublada, montañas verdes | MEMORIA `[PROPUESTA]` | Mejoras de conjuros con artesanos `[PROPUESTA]` | Bestias corrompidas, Encapuchados Rojos | — | **Bruja Guajolote (Tlahuelpuchi)** | 2.º fragmento | 700 | Visión |
| 5 | II | **Puebla**: senderos semiáridos → Angelópolis y la rueda caída → centro con talavera → Fuertes de Loreto y Guadalupe | Mediodía polvoso → atardecer | VERDAD, FUEGO `[PROPUESTA]` | **Doble salto** (en altares) | Encapuchados Rojos y Negros, chaneques, espíritus | — | **La Nahuala** | 3.er fragmento | 900 | Visión |
| 6 | II | **CDMX 1**: Isla de las Muñecas → canales secos → Reforma con el Ángel caído → estación del teleférico | Día gris; papel picado y cempasúchil | DESCANSO `[PROPUESTA]` | — | **Muñecas poseídas**, chaneques, encapuchados | **Nahuales infiltrados** | *(minijefes)* | Acceso al teleférico | 800 | Visión |
| 7 | II | **CDMX 2**: ascenso en teleférico → torre de control → salón del Rey | Noche, tormenta eléctrica | CONSUELO, PAZ | — | Espíritus (Luna), **encapuchados élite** | — | **Rey del Olvido** (con la Llorona) | 4.º fragmento + llamada trampa | 1300 | Visión |
| 8 | III | **Guanajuato**: callejones → Parroquia de San Miguel y Templo Expiatorio → minas | Tarde → oscuridad subterránea | — (refuerza LUZ y DESCANSO) | — | **Momias**, espíritus, nahuales | Nahuales | **Don Ernesto (Calle del Truco)** | 5.º fragmento | 1100 | Visión |
| 9 | III | **Jalisco**: plantíos de agave → hacienda tequilera → Panteón de Belén | Cielo rojizo, el eclipse empieza | — | — | Todos los rangos de la Cofradía, bestias, chaneques | — | **Vampiro del Panteón de Belén** | 6.º fragmento | 1200 | Visión |
| 10 | III | **Guadalajara**: avenidas con el estadio al fondo → centro → Catedral Metropolitana | Gran Eclipse | MAMA, ECOS `[PROPUESTA]` | Balam como jaguar luminoso | Todos | **Tzitzimime** (subjefes) | **Itzpapálotl** | Final | 800 (sin canje) | Visión |

*Ecos acumulados al final del Nivel 9 ≈ 7,150: alcanza para todas las mejoras básicas (5,300) y parte de las opcionales (ver sección 5).*

---

## 2. Catálogo de conjuros

| Conjuro | Letras | Tipo | Nivel | Quién o qué lo enseña | Efecto |
|---|---|---|---|---|---|
| **CALMA** | 5 | Purificación | 1 | Grabado en el taller de la madre (tutorial) | Purifica a un ser agotado; calma a los cercanos por unos segundos |
| **PROTECCION** | 10 | Purificación / defensa | 1 | Nota de la madre junto al Códice (antes del jefe) | Purifica en área pequeña y da un breve escudo pasivo. *Nota: es largo para el Nivel 1; usar ventanas de tiempo generosas en el tutorial* |
| **VOZ** `[PROPUESTA]` | 3 | Purificación / historia | 2 | Músicos del fandango | Devuelve la memoria y la música; en combate, aturde en área |
| **LUZ** | 3 | Purificación | 3 | Brujos buenos de Catemaco | Purifica espíritus; ilumina zonas oscuras |
| **Escudo (U)** | 1 | Defensa en tiempo real | 3 | Brujos buenos de Catemaco | Ver GDD 6.5 |
| **SOL** `[PROPUESTA]` | 3 | Ofensivo | 3 | Brujos buenos de Catemaco | Ráfaga de luz solar; fuerte contra la Cofradía y los seres de oscuridad |
| **MEMORIA** `[PROPUESTA: en Oaxaca]` | 7 | Purificación | 4 | Artesanos textiles: "los tejidos guardan la memoria" | Purifica bestias; revela pasajes ocultos |
| **VERDAD** `[PROPUESTA]` | 6 | Ofensivo / revelación | 5 | Inscripción en los Fuertes | Rompe ilusiones y disfraces (Nahuala, nahuales) |
| **FUEGO** `[PROPUESTA]` | 5 | Ofensivo | 5 | Hallazgo en los Fuertes (cañones antiguos) | Daño fuerte en línea; no sirve contra Don Ernesto |
| **DESCANSO** `[PROPUESTA]` | 8 | Purificación | 6 | Ofrenda de Día de Muertos | Libera a muertos que no descansan (momias, espíritus) |
| **CONSUELO** | 8 | Historia (Llorona) | 7 | Momento narrativo | Parte de la secuencia para la Llorona |
| **PAZ** | 3 | Historia (Llorona) / purificación | 7 | Momento narrativo | Cierra la secuencia de la Llorona; después, purificación general |
| **MAMA** `[PROPUESTA]` | 4 | Historia ("señas familiares") | 10 | Recuerdo de la infancia | Despierta la conciencia de la madre en el combate final |
| **ECOS** `[PROPUESTA]` | 4 | Final ("secuencia de alta complejidad") | 10 | Sobrecarga de la gema | Rompe las ataduras y, al final, las alas de Itzpapálotl |

**Secuencias especiales** (varios conjuros seguidos, sin fallar):
- **Llorona (Nivel 7):** CONSUELO → MEMORIA → PAZ.
- **Final (Nivel 10):** ECOS para liberarse; MAMA para despertar a la madre; ECOS de nuevo para el golpe final.

---

## 3. Afinidades: jefes y minijefes × conjuros `[PROPUESTA]`

✅ efectivo · ➖ neutro · ❌ contraproducente (el jefe se cura o se enfurece) · — aún no aprendido

| Jefe | CALMA | PROTEC. | VOZ | LUZ | SOL | MEMORIA | VERDAD | FUEGO | DESCANSO | Notas |
|---|---|---|---|---|---|---|---|---|---|---|
| Chaneque Mayor | ✅ | ➖ | — | — | — | — | — | — | — | Calmarlo en sus ventanas; luego destruir la antena |
| Cabeza Olmeca | ❌ | ➖ | ✅ | ✅ | ✅ | — | — | — | — | Calma no sirve contra la posesión |
| Bruja Guajolote | ➖ | ➖ | ➖ | ✅ (forma humana) | ✅ (forma de ave) | ✅ | — | — | — | Usa fuego fatuo |
| La Nahuala | ✅ (al final, para liberarla) | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ | ❌ | — | Ilusiones: VERDAD o Luna revelan a la verdadera |
| Nahuales (minijefes) | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | Huyen con poca vida |
| Rey del Olvido | ❌ | ➖ | ➖ | ➖ | ✅ (corona) | ✅ | ➖ | ✅ (corona) | ➖ | El olvido contra la memoria |
| Don Ernesto | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ (sus trampas de azar) | ❌ | ✅ | Fuego infernal: el fuego lo alimenta |
| Vampiro de Belén | ❌ | ➖ | ➖ | ✅ | ✅ | ➖ | ➖ | ➖ | ✅ | La luz solar es su debilidad clásica |
| Tzitzimime | ➖ | ✅ | ➖ | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ | Seres estelares del eclipse |
| Itzpapálotl | ❌ | ✅ | ➖ | ✅ | ✅ | ➖ | ➖ | ❌ | ➖ | Remate obligatorio: secuencia final (ECOS + MAMA) |

---

## 4. Ficha detallada por nivel

### Nivel 1 — Xalapa: el misterio del Parque Juárez · **VERSIÓN JUGABLE DEL JAM**
- **Secciones en orden:**
  1. **Taller de la madre** (interior, revuelto, de noche): intro, encontrar la pistola láser, tutorial de movimiento, salto, esquiva y disparo verde y rojo. Aprender **CALMA** con un grabado (tiempo muy ralentizado).
  2. **Calles de Xalapa** (exterior, niebla, llovizna): seguir el rastro de luz de la gema; primeros chaneques sueltos.
  3. **Letras turísticas "XALAPA"** oxidadas: **checkpoint + Altar de la Memoria** (tutorial de mejoras).
  4. **Parque Juárez:** terrazas a distintas alturas (prueba de verticalidad), 2 encuentros tipo arena con grupos de chaneques, la antena de la Cofradía visible al fondo.
  5. **Antes del jefe:** nota de la madre y aprendizaje de **PROTECCION**.
  6. **Arena del jefe:** el Chaneque Mayor junto a la antena.
  7. **Busto de Benito Juárez:** desenterrar el Códice de las Voces con el mapa.
  8. **Pantalla de carga:** el auto compartido con estudiantes rumbo a Los Tuxtlas → "Continuará" con el mapa de la ruta.
- **Enemigos:** ~15–18 chaneques en total (sueltos y en grupos de 3 a 6, con variantes de patrulla, saltador y travieso).
- **Jefe: Chaneque Mayor.**
  - **Fase 1:** salto con onda expansiva y llamar chaneques. **Fase 2** (antena sobrecargada): lanzar rocas y raíces que salen del suelo en línea.
  - **Ventana de vulnerabilidad:** al aturdirlo con el láser verde o tras su salto fallido.
  - **Conjuro efectivo:** CALMA. Al final, destruir la antena con el láser rojo.
- **Ecos:** ~300 (chaneques purificados ~110, jefe 150, aprendizajes y descubrimientos ~40). Alcanza para 2 mejoras.
- **Ambientación:** verdes de niebla, cantera gris, faroles cálidos, luces de neón rotas. Montañas y el Pico de Orizaba entre nubes en el parallax lejano. Partículas: llovizna, niebla, luciérnagas y hojas.
- **Música:** son jarocho suave y nostálgico en la exploración; percusión con jarana más intensa en los combates.
- **Assets nuevos:** protagonista (set completo), chaneque, Chaneque Mayor, interior del taller, calles, Parque Juárez, busto, antena, letras turísticas (asset base), altar, láseres, Ecos, interfaz completa.
- **Duración estimada:** 8–12 minutos.

### Nivel 2 — San Andrés Tuxtla: la música perdida
- **Secciones:** letras de San Andrés Tuxtla (checkpoint y altar) → pueblo silenciado (casas, plaza, campos de tabaco al fondo `[PROPUESTA]`) → búsqueda de las estrofas → plaza del fandango.
- **Misión:** encontrar las **estrofas perdidas** (5 objetos o recuerdos `[PROPUESTA]`) explorando y calmando chaneques. Cada estrofa recuperada **suena** en la música del nivel. Al completar el fandango se aprende **VOZ** `[PROPUESTA]` y aparece el **1.er fragmento**.
- **Enemigos (ACT-N2-001):** 14 chaneques comunes y dos Chaneques Mayores como minijefes guardianes de las estrofas 2 (`monte`) y 5 (`memoria`). Arenas y progreso independientes; CALMA durante las ventanas de vulnerabilidad. El cierre sigue siendo el fandango.
- **NPCs:** músicos con jaranas y arpa; los pobladores. Advertencia final: encapuchados rumbo a Catemaco.
- **Ecos (primera implementación ACT-N2-001):** base estimada de 272–286 al purificar los 14 comunes, sin contar invocados ni gasto en mejoras. Cada guardián concede 35; las cinco estrofas 50, VOZ 25 y el Fragmento 15. Equilibrio por validar. **Música:** fandango que se va completando: empieza con un instrumento y termina con el son completo.
- **Assets:** reutiliza chaneques y letras; nuevos: pueblo, músicos y tarima.
- **Recorrido y duración:** mapa de 7200 px; estrofas separadas entre 1200 y 1400 px, alternando profundidad. Altares antes de ambos guardianes y checkpoints tras purificarlos. Los 8–10 minutos del diseño base quedan como referencia histórica; la duración ampliada aún no se ha medido en una partida completa.
- **Actualización del equipo (2026-10-19), implementada en rama N2:** recorrido más largo, cinco fragmentos musicales más dispersos y un Chaneque Mayor en el segundo (`monte`) y otro en el quinto (`memoria`). Ver [ACT-N2-001](IDEAS_ACTUALIZACION.md#act-n2-001--san-andrés-tuxtla-exploración-ampliada-y-guardianes). El primer Fragmento del Sello sigue siendo la recompensa del fandango.

### Nivel 3 — Catemaco: el ritual del lago y el despertar de Balam
- **Secciones:** letras de Catemaco → **los brujos buenos** (enseñan **LUZ**, **SOL** `[PROPUESTA]` y el **Escudo U**) → orilla del lago → infiltración en el campamento (tono detectivesco) → rescate de los gatos y despertar de **Balam** → **Habilidad Luna** (revela espíritus que bloquean el paso) → altar principal.
- **Enemigos:** Encapuchados Rojos (~12), espíritus (~8, solo visibles con Luna).
- **Jefe: la Cabeza Olmeca Poseída** (estática, a gran escala).
  - **Fase 1:** ondas de choque en el suelo (esquivar o saltar).
  - **Fase 2:** láseres oculares que barren la franja (moverse en profundidad o usar el escudo).
  - **Fase 3:** invoca espíritus (usar Luna).
  - **Efectivos:** LUZ, SOL y VOZ.
- **Cierre:** encuentro con **María**, que se une al grupo.
- **Ecos:** ~600. **Música:** ambiental nocturna con tambores lejanos; tensión de horror cósmico.
- **Assets nuevos:** encapuchado (modelo base rojo), espíritu, Balam (gato y su filtro de Luna), brujos, María, lago y campamento, Cabeza Olmeca.
- **Duración:** 12–15 minutos.

### Nivel 4 — Oaxaca: los tejidos de la memoria
- **Secciones:** letras de Oaxaca → calles empedradas con casas coloridas y montañas → **taller de los artesanos** (aprender **MEMORIA** `[PROPUESTA]`; mejoras de conjuros a cambio de Ecos `[PROPUESTA]`) → bestias liberadas que revelan el pasaje → ruinas del **Templo de Santo Domingo**.
- **Enemigos:** bestias corrompidas (~10, nuevo tipo), Encapuchados Rojos (~8).
- **Jefe: Bruja Guajolote (Tlahuelpuchi).**
  - **Forma humana:** proyectiles de fuego fatuo; débil a LUZ.
  - **Forma de ave gigante:** embestidas y fuego en área; débil a SOL.
  - Alterna de forma cada cierto tiempo.
- **Recompensa:** 2.º fragmento. **Ecos:** ~700.
- **Música:** sones y jarabes oaxaqueños con banda de viento, en tono oscuro.
- **Assets nuevos:** bestia, artesanos, ciudad, interior del templo y la bruja en sus dos formas.
- **Duración:** 12–15 minutos.

### Nivel 5 — Puebla: de la rueda caída a los Fuertes
- **Secciones:** senderos semiáridos (nopales y árboles color ceniza) → Angelópolis con la **rueda de la fortuna caída** (sección vertical por la estructura `[PROPUESTA]`) → centro con talavera rota y cables de neón → subida a los **Fuertes de Loreto y Guadalupe** (aprender **VERDAD** y **FUEGO** `[PROPUESTA]`).
- **Enemigos:** Encapuchados Rojos y **Negros** (primer rango medio), chaneques y espíritus (Luna). María muestra cada vez más desesperación (diálogos).
- **Jefe: La Nahuala** (patio central de Loreto).
  - Crea copias ilusorias: VERDAD o Luna revelan a la real.
  - Pone trampas en el suelo.
  - Al final se la **libera** con CALMA.
- **Recompensa:** 3.er fragmento + **doble salto disponible en los altares**. **Ecos:** ~900.
- **Música:** banda de guerra y cornetas distorsionadas en los Fuertes `[PROPUESTA]`.
- **Assets nuevos:** encapuchado negro (recolor), escenarios de Puebla, rueda caída, Fuertes, la Nahuala.
- **Duración:** 15 minutos.

### Nivel 6 — CDMX parte 1: de la Isla de las Muñecas a Reforma
- **Secciones:** **Isla de las Muñecas** y canales secos (emboscadas de **muñecas poseídas**, que se destruyen) → avenidas con ofrendas, papel picado y cempasúchil (aprender **DESCANSO** en una ofrenda `[PROPUESTA]`) → **Reforma** con el **Ángel de la Independencia caído**, pirámides y rascacielos al fondo → estación base del **teleférico**.
- **Mecánica especial:** sobrevivientes con los que hablar; **algunos son nahuales infiltrados** que atacan por sorpresa (zarpazo fuerte; huyen con poca vida). Una pista sutil (Luna muestra su sombra animal) premia al jugador atento `[PROPUESTA]`.
- **Enemigos:** muñecas (~15), chaneques, Encapuchados Rojos y Negros. **Minijefes:** 2–3 nahuales.
- **Cierre:** pista del **Rey del Olvido** y de la madre.
- **Ecos:** ~800. **Música:** organillero desafinado en las calles `[PROPUESTA]`; tema de Día de Muertos.
- **Assets nuevos:** muñeca, nahual (forma humana y animal), CDMX (varias capas), el Ángel caído y la estación.
- **Duración:** 15 minutos.

### Nivel 7 — CDMX parte 2: el teleférico, el Rey del Olvido y la Llorona
- **Secciones:** **ascenso en teleférico** (sección vertical con desplazamiento automático: espíritus visibles con Luna y encapuchados que abordan la cabina) → torre de control (**guardia de élite**, Negros con Rojo) → **salón del trono**.
- **Escena clave:** revelación de María → se transforma en **la Llorona**.
- **Jefe: el Rey del Olvido**, con la Llorona como aliada.
  - Usa su corona de control mental: invierte los controles y crea clones de memoria `[PROPUESTA]`.
  - La Llorona lo ataca con gritos espectrales.
  - **Objetivo:** destruir la corona con SOL o FUEGO y debilitarlo con MEMORIA.
- **Después del jefe:** la Llorona fuera de control → **secuencia CONSUELO → MEMORIA → PAZ** (se aprenden aquí CONSUELO y PAZ, con el tiempo muy ralentizado). Se despide.
- **Recompensa:** 4.º fragmento + **la llamada trampa** de la "madre". **Ecos:** ~1,300.
- **Música:** tormenta, coro lejano y el tema de la Llorona (canción tradicional instrumental, de dominio público) `[PROPUESTA: verificar la licencia del arreglo]`.
- **Assets nuevos:** cabina del teleférico, torre, encapuchado élite (recolor), el Rey y la Llorona.
- **Duración:** 15–18 minutos.

### Nivel 8 — Guanajuato: las minas y la Calle del Truco
- **Secciones:** letras de Guanajuato → callejones estrechos (NPCs que advierten de las momias) → Parroquia de San Miguel y Templo Expiatorio → **túneles mineros** (oscuridad: LUZ ilumina y Luna revela; charcos y madera podrida).
- **Enemigos:** **momias** (~12, nuevo tipo; se liberan con DESCANSO), espíritus y emboscadas de nahuales.
- **Jefe: Don Ernesto, el jugador de la Calle del Truco.**
  - **Cartas espectrales:** proyectiles con patrones "de azar"; VERDAD revela cuáles son reales.
  - **Ruleta de ataques** que cambia el patrón de la arena.
  - **Fuego infernal:** FUEGO lo cura (❌).
  - Se libera su alma con DESCANSO.
- **Recompensa:** 5.º fragmento. **Ecos:** ~1,100.
- **Música:** estudiantina o callejoneada distorsionada que se apaga al bajar a las minas `[PROPUESTA]`.
- **Assets nuevos:** momia, callejones, iglesias, minas y Don Ernesto.
- **Duración:** 15 minutos.

### Nivel 9 — Jalisco: haciendas y Panteón de Belén
- **Secciones:** plantíos de agave bajo un cielo rojizo → **hacienda tequilera** tomada por la Cofradía (oleadas de todos los rangos; aquí el **6.º fragmento**) → **Panteón de Belén** con el **Árbol del Vampiro**.
- **Enemigos:** Cofradía de los tres rangos, bestias y chaneques.
- **Jefe: el Vampiro del Panteón de Belén.**
  - **Forma humana:** un hombre alto de traje antiguo, que se transforma al interactuar con él.
  - **Ataques:** zarpazos rápidos, murciélagos y raíces del árbol que atrapan.
  - **Débil a:** SOL y LUZ.
- **Ecos:** ~1,200. **Música:** mariachi tradicional (son jalisciense) en clave lúgubre `[PROPUESTA]`.
- **Assets nuevos:** agaves, hacienda, panteón y árbol, y el vampiro.
- **Duración:** 15 minutos.

### Nivel 10 — Guadalajara: la trampa y el eclipse final
- **Secciones:** avenidas en ruinas con la silueta del estadio bajo el eclipse → centro histórico → **Catedral Metropolitana** (oleada final con todos los enemigos) → **emboscada en el altar mayor** (escena: la trampa, la llamada simulada y la madre usada para abrir el Códice).
- **Fase 1: la horda y las Tzitzimime.**
  - Secuencia **ECOS** `[PROPUESTA]` para sobrecargar la gema y romper las ataduras.
  - Balam crece a su forma de **jaguar luminoso**.
  - Oleadas, más **3 Tzitzimime** como subjefes `[PROPUESTA: número]`.
- **Fase 2: Itzpapálotl desatada.**
  - Usa ataques dimensionales que solo se ven con Luna.
  - Combinar Luna, Balam y todo el repertorio de conjuros.
  - Secuencia **MAMA** `[PROPUESTA]` para que la madre ayude desde el altar.
  - Remate con **ECOS** para romper las alas de obsidiana y el núcleo del eclipse.
- **Epílogo:** las páginas en blanco, de regreso en el taller de Xalapa.
- **Ecos:** ~800, sin canje: después ya no hay altares.
- **Música:** órgano y coro barrocos fusionados con percusión prehispánica (teponaztli y huéhuetl) `[PROPUESTA]`.
- **Assets nuevos:** Guadalajara, interior de la catedral, Tzitzimime, Itzpapálotl (capullo y forma completa), Balam jaguar y la madre.
- **Duración:** 20 minutos.

---

## 5. Curva de progresión `[PROPUESTA]`

| Al terminar | Ecos acumulados ≈ | Mejoras esperadas (de la tabla de GDD 5.1) |
|---|---|---|
| Nivel 1 | 300 | Vida 1 + Daño 1 |
| Nivel 2 | 550 | + Velocidad 1 |
| Nivel 3 | 1,150 | + Vida 2 + Escudo 1 |
| Nivel 4 | 1,850 | + Daño 2 + Luna 1 |
| Nivel 5 | 2,750 | + **Doble salto** + Vida 3 |
| Nivel 6 | 3,550 | + Daño 3 + Velocidad 2 |
| Nivel 7 | 4,850 | + Vida 4 + Escudo 2 + Láser 1 |
| Nivel 8 | 5,950 | + Daño 4 + Velocidad 3 |
| Nivel 9 | 7,150 | + Vida 5 o Daño 5 + opcionales |
| Nivel 10 | — | Sin canje: es el examen final |

**Totales:** mejoras básicas = 5,300 Ecos; opcionales = 2,720. Un jugador que purifica y busca runas puede completar las básicas y casi todas las opcionales antes del final.

---

## 6. Reutilización de assets (resumen de producción)

| Asset | Se crea en | Se reutiliza en |
|---|---|---|
| Chaneque | N1 | N2, N5, N6, N9, N10 |
| Encapuchado (rojo → negro → negro y rojo) | N3 | N4 a N10 (recolor) |
| Espíritu | N3 | N5, N7, N8, N10 |
| Bestia corrompida | N4 | N9, N10 |
| Letras turísticas + altar | N1 | Todos (cambia el texto) |
| Muñeca, nahual, momia | N6, N6, N8 | N8 a N10 |
| Interfaz, láseres, Ecos, conjuros, escudo, Luna | N1 y N3 | Todos |

---

## 7. Notas y pendientes
1. **PROTECCION tiene 10 letras** y se aprende en el Nivel 1. Para el tutorial conviene que **CALMA** sea el primero, y PROTECCION llegue antes del jefe con ventanas de tiempo generosas.
2. Los conjuros **VOZ, SOL, MEMORIA (en Oaxaca), VERDAD, FUEGO, DESCANSO, MAMA y ECOS** son propuestas para completar el sistema de afinidades y las "nuevas señas" que menciona la historia sin nombrarlas. Se pueden renombrar siempre que usen solo letras permitidas.
3. Las cifras de Ecos, número de enemigos y duraciones son estimaciones para equilibrar. Ajustar en `src/data/progression.json` y `enemies.json`.
4. Música tradicional: usar grabaciones o arreglos con licencia libre, u originales del equipo, y acreditarlos.
5. Para el jam solo se produce el **Nivel 1**. El resto de la tabla es la visión para la página de itch.io y el Demo Day.
