# ECOS — Documento de Diseño del Juego (GDD) v1.0

**Equipo:** Listick Games · **Evento:** 09 Game Jam ANIEI 2026 · **Tema:** "Cultura, identidad y patrimonio"
**Documentos relacionados:**
- `docs/NDD_v2.md`: historia oficial completa (Documento de Diseño Narrativo v2.0). **La historia es definitiva; no se modifica.**
- `docs/referencias/worlorn/`: referencia de **vista, movimiento y calidad**.
- `docs/referencias/estilo_protagonista.png`: referencia de estilo de personaje.

> Las decisiones marcadas **`[PROPUESTA — CONFIRMAR]`** son sugerencias para huecos o conflictos técnicos; el equipo debe confirmarlas o cambiarlas. Todo lo demás está decidido.

---

## 1. Resumen

**ECOS** es un juego de **exploración y acción 2D de desplazamiento lateral con profundidad**, en pixel art, ambientado en un México retrofuturista colapsado tras "El Silencio". El jugador, hijo de una criptógrafa sorda que lo crió en **Lengua de Señas Mexicana (LSM)**, recorre el país para rescatarla y frenar a la Cofradía del Espejo Negro. Para ello usa una gema que canaliza **conjuros deletreados en LSM**: con la **cámara web** (MediaPipe) o con el **teclado**.

**Pilares:**
1. **La cultura está en la mecánica:** la LSM es tu lengua familiar y tu poder; los niveles giran alrededor de prácticas reales (el fandango, los textiles, el Día de Muertos).
2. **Dos ritmos:** exploración pausada e investigación, alternadas con combate frenético.
3. **Purificar en vez de matar** a los seres del folclor; combatir a la Cofradía.
4. **Calidad visual y de sensación al nivel de la referencia Worlorn.**

---

## 2. Vista, movimiento y calidad: "TAL CUAL WORLORN"

La referencia es el prototipo **Worlorn** (`docs/referencias/worlorn/worlorn_referencia.html` y sus capturas). **ECOS debe tener exactamente ese tipo de vista y de juego, y esa calidad**, con la estética de México retrofuturista.

**Qué significa "tal cual Worlorn":**
- **Perspectiva de desplazamiento lateral con profundidad** (estilo *belt-scroller*): el suelo es una **franja transitable**. **A/D** mueven a lo ancho del nivel y **W/S** mueven en profundidad, hacia el fondo o hacia el frente. **No** es un plataformero con gravedad sobre bloques.
- **Orden por profundidad (Y-sort):** el jugador pasa por delante o por detrás de árboles, columnas, enemigos y personajes según su posición vertical en la franja.
- **Cámara** que sigue con suavidad, con límites en los extremos del mundo.
- **Parallax de 5 a 6 capas:** cielo, montañas lejanas, colinas o ciudad media, ciudad cercana, suelo y primer plano, cada una con su velocidad.
- **Atmósfera viva:** niebla que se desplaza, partículas (hojas, ceniza, brasas, luciérnagas), reflejos en el agua, luces que laten, objetos voladores al fondo, estrellas que titilan y viñeta.
- **Nombres de zona** que aparecen al entrar a cada área. En ECOS se combinan con las **letras turísticas**.
- **Colisiones** con agua, objetos y personajes dentro de la franja.
- Pixel art nítido escalado a pantalla completa, sin suavizado.

**Diferencia con Worlorn:** en ECOS los personajes son **más grandes y detallados**, según la referencia `estilo_protagonista.png` (sección 11). El tipo de vista y la sensación son los mismos.

### 2.1 Salto en una vista con profundidad
- El salto es un **eje de altura independiente** (Z): el personaje sube y baja, pero **su sombra se queda en el suelo**, marcando su posición en la franja. Esto es clave para que se lea bien.
- Sirve para esquivar ataques bajos, saltar obstáculos y subir a bordes, bancas o plataformas bajas.
- **Doble salto:** se desbloquea **desde el Nivel 5 (Puebla)**: a partir de ahí aparece en los Altares de la Memoria y se compra con Ecos (sección 5.1). Da acceso a zonas antes inalcanzables.
  - **⚠️ 2026-10-19:** Puebla se omite en el juego; dónde se desbloquea el doble salto queda **pendiente de decidir** (ver AGENTS.md).

### 2.2 Verticalidad (subir edificios, terrazas, el teleférico)
`[PROPUESTA — CONFIRMAR]` En una vista con profundidad, la verticalidad se resuelve así:
- **Planos a distintas alturas:** una terraza o un piso de edificio es otra franja transitable, más arriba en la pantalla, conectada por **escaleras, rampas o elevadores**. Al usarlos, la cámara sube.
- **Secciones verticales:** tramos donde la cámara se desplaza hacia arriba, como subir por fuera de un edificio o el ascenso del teleférico en el Nivel 7.
- **Bordes saltables:** desniveles bajos que se suben saltando.

---

## 3. Controles

| Acción | Tecla | Notas |
|---|---|---|
| Moverse (a lo ancho y en profundidad) | **W A S D** | 4 direcciones, como en Worlorn |
| Saltar | **Espacio** | Altura variable; doble salto al desbloquearlo |
| Correr | **Shift** (mantener) | Se combina con saltar y esquivar |
| Esquivar | **Doble Shift** (dos toques rápidos, ~250 ms) | Si se mantiene después del segundo toque, sigue corriendo. **C** como tecla alternativa. Ver nota 7 |
| Disparar | **Clic izquierdo** o **X** | Dispara hacia donde mira el personaje (decidido 2026-10-19) |
| Láser aturdidor (verde) | **1** | Selecciona el modo |
| Láser de daño (rojo) | **2** | Selecciona el modo |
| Interactuar | **E** | Hablar, aprender una seña, leer, examinar |
| Conjuro seleccionado | **Q** (toque) | Ver sección 6 |
| Rueda de conjuros | **Q** (mantener) | Ver sección 6 |
| Habilidad Luna (Balam) | **F** | Decidido |
| Escudo (sin cámara) | **Clic derecho** (mantener) | Con cámara: mostrar la seña **U**. Decidido 2026-10-19 (nota 2) |
| Diario de Señas | **Tab** | |
| Pausa | **Esc** | |

**Notas técnicas (conflictos con el navegador):**
1. **No usar Ctrl para esquivar ni para ninguna acción.** En el navegador, **Ctrl+W cierra la pestaña** y no se puede bloquear, y W es la tecla de avanzar. Ctrl+S y Ctrl+D también abren menús del navegador.
2. **Escudo: se usa CLIC DERECHO, no Alt (decidido 2026-10-19).** Se descartó Alt izquierdo por estos riesgos:
   - **Alt + Espacio** (escudo + salto) abre el **menú de la ventana de Windows**. Lo maneja el sistema operativo y **el juego no puede bloquearlo**. Es una combinación natural en combate.
   - **Alt + D** (escudo + moverse a la derecha) enfoca la barra de direcciones y **Alt + F** abre el menú del navegador. Hay que bloquearlos (`preventDefault` en `keydown` y `keyup` cuando `altKey` está activo) y verificar que funcione.
   - Al soltar Alt, el navegador puede mover el foco a su menú. Hay que bloquearlo también en `keyup`.
   - En Electron, quitar el menú de la aplicación (`Menu.setApplicationMenu(null)`) para que Alt no muestre la barra de menú.
   - **Decidido:** si Alt no se puede usar de forma confiable, **el escudo pasa a mantener clic derecho** (el izquierdo dispara). Deja la tecla configurable en `config.ts` para cambiarla rápido.
3. **Clic derecho:** hay que bloquear el menú contextual del navegador sobre el juego.
4. **Tab:** hay que bloquear su comportamiento por defecto (mover el foco entre elementos de la página).
5. **Esc** también saca al navegador de la pantalla completa. Al salir de pantalla completa por esa tecla, el juego debe pausarse igual (detectar el evento `fullscreenchange`).
6. **Durante el deletreo de un conjuro con teclado**, todas las letras escriben, incluidas W, A, S, D, E, Q, X, C y F. El movimiento y las demás acciones quedan **suspendidos** hasta que termina el conjuro.
7. **Doble Shift y "Teclas especiales" de Windows:** presionar Shift 5 veces seguidas abre el aviso de Teclas especiales (Sticky Keys), y el juego **no puede bloquearlo**. Por eso:
   - **C** funciona siempre como tecla alternativa de esquiva.
   - En la página de itch.io y en el menú de controles se indica cómo desactivar ese atajo en Windows (Configuración → Accesibilidad → Teclado → Teclas especiales → desactivar el método abreviado).

---

## 4. El protagonista y sus herramientas

- **Protagonista:** inserción del jugador; todos le hablan de "tú". Hijo de la criptógrafa sorda. Su lengua de crianza es la LSM.
- **La gema:** herencia de su madre; reacciona a la LSM, guía con un **rastro de luz** hacia los objetivos y brilla y palpita más conforme avanza la historia.
- **La pistola láser:** se encuentra en el **taller de la madre**. Es una **herramienta de trabajo**, como un soldador, con **intensidad ajustable**:
  - **Modo 1, aturdidor (verde):** no hace daño o hace muy poco; acumula aturdimiento hasta dejar al enemigo mareado unos segundos.
  - **Modo 2, de daño (rojo):** hace daño real.
  - `[PROPUESTA — CONFIRMAR]` **Energía:** el láser se calienta al disparar seguido y se enfría solo; el modo rojo calienta más rápido. Así no se abusa de él y el conjuro sigue siendo lo fuerte.
- **Balam (gato alebrije):** compañero desde el Nivel 3. Da la **Habilidad Luna**.
- **María:** compañera de viaje del final del Nivel 3 al Nivel 7.

---

## 5. Combate, vida y muerte

- **Todos los enemigos hacen daño**, unos más que otros: **el jugador sí puede morir**.
- **Vida del jugador** con barra visible. Al recibir daño: retroceso, destello y unos instantes de invulnerabilidad.
- **Muerte:** pantalla breve y reaparición en el **último checkpoint**, que son las **letras turísticas** de cada zona o puntos intermedios. Sin castigos largos. **No se pierden los Ecos acumulados.**
- **Profundidad en el combate:** un ataque o disparo solo golpea a quien está en una franja de profundidad cercana, como en un *belt-scroller*. Los enemigos se acomodan en la profundidad para rodear al jugador.
- **Encuentros tipo arena:** en algunos puntos la zona se cierra hasta resolver la oleada; luego la exploración continúa.
- **Qué pasa al vencer a cada tipo de enemigo:**

| Tipo | Con el láser | Al llegar a 0 de vida | Cómo se resuelve |
|---|---|---|---|
| **Seres del folclor** (chaneques, bestias, espíritus, nahuales, la Nahuala) | Verde: aturde. Rojo: baja su vida | Quedan **agotados** (aturdidos largo tiempo) | Se **purifican** con un conjuro de Calma, Protección o Luz. Regresan a la naturaleza, sin muerte |
| **Cofradía** (encapuchados de los tres rangos) | Verde: aturde. Rojo: daño | **Quedan inconscientes** o desaparecen en humo | Conjuros ofensivos o láser rojo |
| **Muñecas poseídas** | Daño | Se **destruyen** | Láser rojo o conjuros ofensivos |
| **Jefes** | Según su tipo | Pasan de fase o quedan vulnerables | Conjuro correcto en la ventana de vulnerabilidad |

- **"Jugo" del combate:** sacudida de cámara, pausa breve al golpear, partículas, destellos y sonido en cada impacto. Todo con opción para reducirlo.

---


### 5.1 Experiencia: los "Ecos" y la progresión
La experiencia del juego se llama **Ecos**: fragmentos de memoria que se liberan al vencer o purificar. Encaja con el título y con el tema.

**Cómo se obtienen:** al vencer a un enemigo, sus Ecos salen como **partículas de luz que vuelan hacia el jugador** (se recogen solas).

| Fuente | Ecos |
|---|---|
| Muñeca poseída | 4 |
| Chaneque | 5 |
| Espíritu | 6 |
| Encapuchado Rojo | 8 |
| Momia | 10 |
| Bestia corrompida | 12 |
| Encapuchado Negro | 15 |
| Encapuchado Negro y Rojo (élite) | 30 |
| Nahual (minijefe) | 60 |
| Tzitzimitl (subjefe del final) | 200 cada una |
| Jefes | Chaneque Mayor 150 · Cabeza Olmeca 300 · Bruja Guajolote 350 · Nahuala 400 · Don Ernesto 500 · Vampiro 550 · Rey del Olvido 600 |
| Aprender un conjuro nuevo | 25 |
| Leer una inscripción, examinar un objeto clave o completar una misión secundaria | 5–20 |

**Bonificaciones:**
- **Purificar** a un ser del folclor con un conjuro, en lugar de solo dejarlo agotado, da **+50 % de Ecos**. Así se premia la mecánica cultural principal.
- Un conjuro **"PERFECTO"** da **+25 %** sobre los Ecos de ese enemigo.

**Dónde se canjean: los Altares de la Memoria.**
- **En cada checkpoint de letras turísticas** hay un pequeño altar retrofuturista (una ofrenda con velas y circuitos) donde se abre el menú de mejoras con **E**.
- **Runas antiguas** escondidas en zonas opcionales de exploración: sirven de altar y además regalan Ecos la primera vez.
- **Personajes especiales** que ofrecen mejoras únicas de su región: por ejemplo, los brujos buenos de Catemaco (escudo) o los artesanos de Oaxaca (conjuros).
- Abrir un altar **restaura la vida** y guarda el checkpoint.

**Qué se mejora:**

| Mejora | Niveles | Efecto por nivel | Costo por nivel (1 → 5) |
|---|---|---|---|
| **Vida** | 5 | +1 segmento de vida (empieza con 5) | 100 · 200 · 350 · 550 · 800 |
| **Daño** (láser rojo y conjuros ofensivos) | 5 | +10 % | 100 · 200 · 350 · 550 · 800 |
| **Velocidad** (caminar, correr y esquivar) | 3 | +6 % | 120 · 280 · 500 |
| **Doble salto** | 1 | Desbloquea el doble salto | 400 (disponible **desde el Nivel 5**) |
| *Escudo* (desde el Nivel 3) | 3 | +20 % de barra de escudo | 150 · 300 · 500 |
| *Luna* (desde el Nivel 3) | 3 | +20 % de duración y recarga | 150 · 300 · 500 |
| *Láser* | 3 | −15 % de calentamiento | 120 · 250 · 450 |

- Las tres últimas mejoras (en cursiva) son **opcionales**: entran si da tiempo.
- **Equilibrio en la demo (Nivel 1):** el jugador debe terminar con unos **300 Ecos** (unos 15 chaneques purificados, el Chaneque Mayor y descubrimientos), suficientes para comprar **2 mejoras** y entender el sistema. Ajustar los valores en `src/data/progression.json`.
- Los Ecos **no se pierden al morir**.
- **Interfaz del altar:** lista de mejoras con nivel actual, siguiente efecto y costo; las no disponibles aparecen con candado y su condición ("Disponible desde Puebla").
## 6. Conjuros en LSM (mecánica principal)

### 6.1 Aprender conjuros
- Los conjuros se **aprenden en el mundo** al interactuar (**E**) con personajes, murales, inscripciones, objetos o el Códice.
- **La primera vez** que se aprende un conjuro, el tiempo se **ralentiza aún más** y hay una explicación guiada de cada seña, para que el jugador entienda la mecánica. Después se usa a la velocidad normal de conjuro.
- Cada conjuro aprendido queda en el **Diario de Señas** (**Tab**), con la imagen de la mano de cada letra.

### 6.2 Seleccionar y lanzar
- **Mantener Q:** se ralentiza el juego y se abre una **rueda de conjuros** con los aprendidos. Cada uno muestra su **nivel de maestría**. Se elige con el mouse o con **WASD** y se confirma al **soltar Q**. Para distinguir toque de mantener: **200 ms**.
- **Tocar Q:** lanza el conjuro seleccionado.
  - **Si está dominado:** se lanza **en automático**, al instante.
  - **Si no:** se activa el **sistema de LSM** y el juego se ralentiza.

### 6.3 Sistema de LSM
- Aparece la vista de la cámara en una esquina y se muestra la **palabra a deletrear, letra por letra**, con la imagen de la mano en LSM.
- Cada letra tiene una **ventana de tiempo** y se confirma al **sostener la seña estable ~300 ms**.
- **Sin cámara:** se **escribe cada letra en el teclado** dentro de la misma ventana, mientras se sigue mostrando la mano de LSM. Así el juego se puede terminar sin cámara y sigue enseñando LSM.
- **Resultado:**
  - **Menos del 50 % de aciertos:** falla.
  - **Del 50 % al 99 %:** fuerza proporcional.
  - **100 % y rápido:** bonus **"PERFECTO"**.
- **Tipos de conjuro:**
  - **Purificación:** Calma, Protección, Luz. Contra los seres del folclor.
  - **Ofensivos:** contra la Cofradía, muñecas y jefes.
  - **Especiales de historia:** *Consuelo, Memoria y Paz* para la Llorona; la **secuencia de alta complejidad** del final; las **señas familiares** para despertar a la madre.
- **Afinidades:** cada enemigo o jefe tiene conjuros efectivos, neutros y contraproducentes.

### 6.4 Maestría
- Cada conjuro tiene **3 niveles de maestría**, que suben con lanzamientos buenos y perfectos.
- Al llegar al nivel máximo queda **dominado** y se lanza en automático con un toque de Q.
- Los conjuros nuevos empiezan cortos (1 a 3 letras) y los avanzados llegan hasta 10.

### 6.5 Escudo (seña U, en tiempo real)
**La única mecánica que usa la cámara mientras el jugador se mueve con libertad, sin ralentizar el juego.** Una mano juega en el teclado; la otra hace la seña frente a la cámara.

- **Desbloqueo:** en el **Nivel 3 (Catemaco)**, los **brujos buenos de Catemaco** enseñan la seña. Como todo conjuro nuevo, la primera vez se enseña con el tiempo muy ralentizado.
- **Seña:** la letra **U** del alfabeto manual de LSM, por su forma. **Verificar con fuente oficial que la U de LSM es estática** y cuál es su forma exacta.
- **Activación:**
  - **Con cámara:** mientras la seña U esté visible y estable frente a la cámara, el escudo se mantiene. Al bajar la mano, se apaga.
  - **Sin cámara:** **mantener clic derecho** (ver nota 2 de controles).
- **Efecto:**
  - **Reduce el daño recibido** y **repele ataques**: proyectiles rebotados y retroceso a los enemigos que golpean el escudo. Reducción de daño: **~60 %** (ajustable en `config.ts`).
  - El jugador **se mueve, corre y salta con normalidad** con el escudo activo.
  - **No se puede disparar ni lanzar conjuros mientras el escudo está activo**: es la decisión táctica de defenderse o atacar.
- **Límite:** **barra de escudo** que se gasta mientras está activo y con cada golpe bloqueado. Se recarga sola cuando no se usa. Si se agota, el escudo se rompe con un efecto visible y tarda unos segundos en volver.
- **Opcional (si da tiempo):** "bloqueo perfecto". Si el escudo se activa justo antes de un golpe, el ataque se repele sin gastar barra y el enemigo queda aturdido.
- **Detección:**
  - La U debe sostenerse **~150 ms** antes de activarse, para evitar activaciones accidentales.
  - **Mientras se deletrea un conjuro, el escudo queda desactivado**, porque la U aparece en palabras como LUZ.
  - Con el escudo desbloqueado y la cámara encendida, **la detección corre durante todo el juego**, a baja frecuencia (~10–15 Hz), subiendo durante los conjuros. Medir el impacto en los FPS.
  - Mostrar un **pequeño indicador** (por ejemplo, el ícono de la mano) que se enciende cuando la cámara detecta la U, para que el jugador sepa que funciona.
- **Visual:** burbuja o domo de energía alrededor del protagonista, con el estilo de la gema, que vibra al recibir golpes y se agrieta al quedar poca barra.

### 6.6 Exactitud de la LSM (obligatorio)
- **Letras permitidas (decidido):** solo se usan estas letras del alfabeto manual de LSM, que el detector reconoce:
  **A, B, C, D, E, F, G, H, I, L, M, N, O, P, R, S, T, U, V, W, Y, Z**.
  - Todas son estáticas **excepto la Z**, que lleva movimiento pero ya funciona en el detector del equipo.
  - **No se usan J, K, Ñ, Q ni X**, ni dígrafos como LL, RR o CH.
  - Al deletrear, se ignoran los acentos (PROTECCIÓN se deletrea PROTECCION).
  - **Todo nombre de conjuro debe escribirse solo con esas letras.** Los de la historia cumplen: CALMA, PROTECCION, LUZ, CONSUELO, MEMORIA, PAZ.
  - Conjuros nuevos: **máximo 10 letras** (PROTECCION ya tiene 10).
- **Verificar cada letra** con una fuente oficial de LSM y citarla en los créditos. No inventar ninguna forma de mano.
- Con una madre sorda en la historia, la representación de la LSM y de la cultura sorda debe ser cuidadosa y correcta. Si es posible, que alguien de la comunidad sorda la revise.

---

## 7. Habilidad Luna (con Balam)

- Se desbloquea en el **Nivel 3 (Catemaco)** al rescatar a Balam.
- **Activación:** tecla de Luna (sección 3). La vista se sincroniza con los ojos de jaguar de Balam: un **filtro visual** (desaturación, tinte frío, bordes brillantes) revela **espíritus invisibles, rastros ocultos e ilusiones**.
- **Barra de duración** limitada que se **recarga sola** mientras no se usa.
- Algunos enemigos, caminos y pistas **solo existen o solo pueden ser golpeados** con Luna activa.

---

## 8. Exploración e interacción

- **Interactuar (E):** hablar con personajes, aprender señas, leer inscripciones, examinar objetos y recoger pistas. Un indicador aparece sobre lo interactuable.
- **Rastro de luz de la gema:** guía hacia el siguiente objetivo cuando el jugador se pierde.
- **Letras turísticas oxidadas:** al entrar a cada ciudad o pueblo, presentan la zona y funcionan como **checkpoint**.
- **NPCs sospechosos:** algunos son **nahuales infiltrados** que se transforman al hablar con ellos (Nivel 6 en adelante).
- **Misiones especiales:** por ejemplo, en el Nivel 2, recuperar las estrofas perdidas del fandango.
- **Fragmentos del sello:** 6 en total; se muestran en el menú de pausa.
- **Transiciones entre niveles:** pantallas de carga narrativas, como el viaje en auto compartido.

---

## 9. Enemigos

| Enemigo | Tipo | Notas |
|---|---|---|
| **Chaneque** | Folclor (se purifica) | Pequeño, rápido, en grupos; hace travesuras |
| **Encapuchado Rojo** | Cofradía, rango bajo | Enemigo común |
| **Encapuchado Negro** | Cofradía, rango medio | Más daño y cobertura |
| **Encapuchado Negro y Rojo** | Cofradía, élite | Mucha vida y escudos. **Los tres son el mismo modelo con otros colores** |
| **Espíritus** | Folclor (se purifica) | Algunos solo son visibles con Luna |
| **Bestias corrompidas** | Folclor (se purifica) | Oaxaca en adelante |
| **Muñecas poseídas** | Objetos (se destruyen) | CDMX |
| **Nahuales** | Folclor, minijefe sorpresa | Se disfrazan de NPC; zarpazo fuerte; huyen con poca vida |
| **Momias** | Folclor | Guanajuato |

**Jefes:** ver la tabla de `docs/NDD_v2.md`, sección 4: Chaneque Mayor, la Cabeza Olmeca Poseída, la Bruja Guajolote, la Nahuala, el Rey del Olvido con la Llorona, Don Ernesto, el Vampiro del Panteón de Belén, las Tzitzimime e Itzpapálotl.

---

## 10. Historia y niveles (resumen; la versión completa está en `docs/NDD_v2.md`)

**Título:** ECOS. Tres actos y 10 niveles: Xalapa → San Andrés Tuxtla → Catemaco → Oaxaca → Puebla → CDMX (dos partes, con teleférico) → Guanajuato → Jalisco → Guadalajara. Epílogo: "Las páginas en blanco".

**Desbloqueos por nivel:**

| Nivel | Se obtiene |
|---|---|
| 1 Xalapa | Pistola láser (en el taller), primeros conjuros (Protección, Calma), el Códice y el mapa |
| 2 San Andrés Tuxtla | 1.er fragmento |
| 3 Catemaco | Balam + **Habilidad Luna**; **Escudo (seña U)**, enseñado por los brujos buenos de Catemaco; se une María |
| 4 Oaxaca | 2.º fragmento + nuevas señas |
| 5 Puebla | 3.er fragmento + **doble salto disponible** en los Altares de la Memoria · ⏭️ **se omite en el juego** (2026-10-19); sus recompensas quedan por reubicar |
| 6 CDMX 1 | Acceso al teleférico |
| 7 CDMX 2 | 4.º fragmento, conjuros de Consuelo, Memoria y Paz |
| 8 Guanajuato | 5.º fragmento |
| 9 Jalisco | 6.º fragmento |
| 10 Guadalajara | Final |

---

## 11. Arte

- **Referencia de vista y atmósfera:** Worlorn (sección 2).
- **Referencia de personaje:** `estilo_protagonista.png`. Chibi de ~2.7 cabezas, **~28×54 px reales**, contorno de 1 px de color (no negro), 2 a 3 tonos por material, luz desde arriba a la izquierda, paleta corta por personaje y sombra elíptica. *Esa imagen no está en una cuadrícula de píxeles exacta: es una guía de estilo, no un asset.*
- **Resolución base:** 640×360, con escalado entero.
- **Tamaños de cuadro:** protagonista y NPCs en 64×64; chaneque en 48×48; jefes en 128×128 o más (la Cabeza Olmeca es un jefe estático grande).
- **Vista principal: de lado.** Las vistas de frente y espalda se usan para retratos y diálogos.
- **Animaciones del protagonista:** reposo, caminar, correr, saltar (subida, caída y aterrizaje), esquivar, disparar (de pie, corriendo y en el aire), lanzar conjuro, recibir daño, morir, interactuar y subir escaleras.
- **Reutilización:** encapuchados con *recolor*; las letras turísticas como un solo asset con texto o variantes.
- **Láseres:** verde (aturdidor) y rojo (daño), con brillo y partículas distintas.
- La especificación final y detallada queda en `ART_SPEC.md`, generado y validado en la demo.

## 12. Audio
- Música por región, inspirada en la música tradicional de cada lugar (son jarocho en el Golfo); en la exploración más suave y en el combate más intensa.
- Efectos para cada acción, cada letra acertada o fallada, el "PERFECTO", la Habilidad Luna y la purificación.
- Assets de terceros solo con licencia y créditos.

## 13. Interfaz
- **HUD:** vida, calor del láser con su modo (verde o rojo), conjuro seleccionado con su maestría, barra de Luna y **barra de escudo** con su indicador de detección de la mano (ambas desde el Nivel 3), y la gema.
- **Rueda de conjuros**, **Diario de Señas**, menú de pausa con los fragmentos y las opciones.
- **Opciones:**
  - volumen;
  - cámara encendida o apagada;
  - accesibilidad: ventanas de tiempo más largas, sin ralentización extra, sin destellos ni sacudidas, y tamaño de texto.

## 14. Técnico (resumen; el detalle va en `AGENTS.md`)
- **Phaser + TypeScript + Vite.** Física propia de una vista con profundidad: posición en el suelo (X, Y) más la altura del salto (Z), con orden por profundidad. **No** se usa física de plataformas con gravedad sobre tiles.
- **MediaPipe Tasks Vision** con archivos locales; respaldo de teclado obligatorio.
- **Datos en JSON:** conjuros, enemigos, diálogos y niveles.
- **Electron solo al final** para el .exe.

## 15. Alcance para la entrega del jam
- La historia completa (10 niveles) es la **visión del juego**: va en la página de itch.io y en la presentación.
- **Versión jugable:** el **Nivel 1 (Xalapa) completo y pulido**. Si hay tiempo, el siguiente nivel. Al final, una pantalla de "continuará" con el mapa de la ruta.
- Fecha y hora de entrega: **[PENDIENTE: confirmar con el Comité]**.

## 16. Pendientes de confirmar
1. Calor o energía del láser (sección 4), propuesto pero no confirmado.
2. Fecha y hora exactas de entrega.
3. ~~Resultado de las pruebas de Alt para el escudo~~ → resuelto 2026-10-19: el escudo usa clic derecho.
4. Cómo se resuelve la verticalidad (sección 2.2), propuesto pero no confirmado.
