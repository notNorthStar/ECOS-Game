# Documento de Diseño Narrativo (NDD) — Versión 2.0
**Estado:** Oficial — Estructura de Niveles y Optimización Técnica
**Título provisional:** Ecos de México: La Gema de las Voces
**Género y Tono:** Aventura de acción / Investigación ocultista / Postapocalíptico Retrofuturista.

---

## 1. El Mundo, Reglas y Mecánicas Base

### 1.1. El México Colapsado y las Letras Turísticas
Tras el cataclismo conocido como **"El Silencio"**, las regiones de México quedaron aisladas entre ruinas, vegetación invasiva y tecnología antigua que funciona como magia (hologramas rotos, cables neurales y láseres rúnicos conviviendo con el folclor). 
* **Indicador Visual de Nivel (Recurso de Arte):** Cada vez que el jugador entra a una nueva ciudad o pueblo, es recibido por las clásicas **letras turísticas coloridas de México**, pero oxidadas, grafiteadas y semidestruidas, sirviendo como punto de control (*checkpoint*) y presentación de zona.

### 1.2. La Cofradía del Espejo Negro (Reutilización de Enemigos Humanos)
Hermandad secreta que mezcla el ocultismo virreinal con una visión apocalíptica mexica. Buscan provocar un Eclipse perpetuo para invocar a las **Tzitzimime** y a su líder **Itzpapálotl** para devorar el Sol.
* **Diseño escalable por color (Ahorro técnico):** Visten capuchas con ornamentos, capas, cetros tecno-mágicos y máscaras de calavera. Su dificultad se identifica visualmente mediante cambios de textura (*recolors*):
  1. **Encapuchados Rojos:** Rango bajo (enemigos comunes).
  2. **Encapuchados Negros:** Rango medio (mayor daño y cobertura).
  3. **Encapuchados Negros con detalles Rojos:** Élite / Alto rango (mucha vida y escudos).

### 1.3. El Protagonista, la Gema y el Códice de las Voces
* **El Origen del Conflicto:** Tu madre (quien es sorda y te crió comunicándose en **Lengua de Señas Mexicana - LSM**) fue una criptógrafa obligada a trabajar para la Cofradía. Al descubrir que planeaban devorar el Sol, **desertó robándose el Códice de las Voces** (el artefacto ancestral capaz de abrir el portal del Eclipse) y dividió su sello en **6 fragmentos**, ocultándolos por el país.
* **La Gema y el Combate en LSM:** La gema que te heredó reacciona a la LSM. Las criaturas del folclor (chaneques, bestias, espíritus) **no se matan**: fueron alteradas por dispositivos o magia de la Cofradía, por lo que usas señas de *Calma, Protección o Luz* para purificarlas. Los conjuros ofensivos se usan contra los miembros de la Cofradía, muñecas poseídas y jefes.

### 1.4. La Habilidad "Luna" (Visión Espiritual con Balam)
Basada en la creencia del folclor mexicano de que los animales pueden ver el más allá. Al rescatar a **Balam** (el gato alebrije) en el Nivel 3, desbloqueas la **Habilidad Luna**:
* **Funcionamiento Técnico:** Al activarla, la vista del jugador se sincroniza con los ojos de jaguar de Balam (un filtro visual estilo *Vista de Águila / Ojo de Halcón*). Permite revelar **espíritus invisibles**, rastros ocultos e ilusiones que no se ven con la cámara normal. Tiene una barra de duración limitada que se recarga automáticamente mientras no se utiliza.

---

## 2. Desglose de Niveles y Narrativa (3 Actos / 10 Niveles)

### ACTO I: El Despertar en el Golfo y el Sur (Veracruz y Oaxaca)

#### Nivel 1: Xalapa — El Misterio del Parque Juárez
* **Contexto y Escenario:** Xalapa es una de las pocas ciudades seguras y tranquilas que quedan; aquí los chaneques viven ocultos en la vegetación sin hacer daño a nadie. Sin embargo, tras años de rastrearla, la Cofradía finalmente localiza a tu madre. Entran de noche a su taller, la secuestran al no hallar el Códice, y activan un **dispositivo de resonancia oscura** en el Parque Juárez para enloquecer a los chaneques, creando caos para cubrir su escape.
* **Gameplay:** La gema en tu pecho brilla y proyecta un rastro de luz desde el taller revuelto hasta el Parque Juárez, invadido por la niebla. Como los chaneques solo están alterados por el dispositivo, aprendes a usar tus primeras señas en LSM (*Protección* y *Calma*) para apaciguarlos sin matarlos.
* **Jefe de Nivel:** **El Chaneque Mayor**, corrompido directamente por la antena de la Cofradía.
* **Resolución y Transición:** Al calmar al Chaneque Mayor y destruir el dispositivo, la gema te guía hasta el **busto de Benito Juárez**. Debajo de la estatua desentierras el **Códice de las Voces**, donde tu madre dejó oculto un mapa encriptado con la ruta exacta para recuperar los 6 fragmentos del sello.
* **Pantalla de Carga (Rumbo a Los Tuxtlas):** Para salir de Xalapa, consigues lugar en un auto viejo compartido junto con un grupo de estudiantes foráneos que viajan hacia el sur para ver a sus familias (un guiño a los viajes en *BlaBlaCar*).

#### Nivel 2: San Andrés Tuxtla — La Música Perdida
* **Escenario:** Llegas a las letras desgastadas de San Andrés Tuxtla. La influencia de la Cofradía ha silenciado el pueblo, borrando la memoria musical de sus habitantes.
* **Gameplay y Misión:** Conoces a un grupo de músicos tradicionales con jaranas y arpas que han olvidado sus versos. Explorando el pueblo y calmando chaneques rezagados, recuperas las estrofas perdidas y los ayudas a reconstruir el fandango.
* **Recompensa y Conexión:** La música despierta el **1er Fragmento del Sello**. Agradecidos, los músicos te advierten que vieron a hombres encapuchados dirigirse al lago de Catemaco para realizar un rito nocturno, sugiriendo que ahí podrías hallar pistas sobre tu madre.

#### Nivel 3: Catemaco — El Ritual del Lago y el Despertar de Balam
* **Escenario:** Noche cerrada y neblina espesa junto al lago de Catemaco, en un ambiente detectivesco y de horror cósmico.
* **Gameplay y Desbloqueo de "Luna":** Infiltras el campamento de la Cofradía (enfrentando a Encapuchados Rojos) y frustras un sacrificio de gatos negros. Uno de los felinos entra en contacto con la energía de tu gema y el Códice, transformándose en **Balam, el gato alebrije**. En este momento **desbloqueas la Habilidad Luna**, usándola de inmediato para ver a los espíritus del lago que bloquean el paso hacia el altar principal.
* **Jefe Final de Veracruz:** **La Cabeza Olmeca Poseída**. El ritual del culto tenía como fin invocar a un antiguo dios maligno olmeca para que poseyera una colosal cabeza arqueológica de piedra. *(Nota técnica: Jefe estático de gran escala que ataca con ondas de choque, láseres oculares e invocación de espíritus, optimizando recursos de animación).*
* **Cierre Jugable de Veracruz (Encuentro con María):** Al vencer a la Cabeza Olmeca y antes de abandonar la región, juegas una breve secuencia narrativa donde conoces a **María**, una mujer angustiada que busca desesperadamente a sus hijos perdidos. Como sus pistas apuntan hacia la misma ruta de la Cofradía, María se une a ti y a Balam como compañera de viaje.

#### Nivel 4: Ciudad de Oaxaca — Los Tejidos de la Memoria
* **Escenario:** Letras desgastadas de Oaxaca. Calles empedradas con casas coloridas semidestruidas y las imponentes montañas verdes de fondo. 
* **Gameplay:** Bestias fantásticas y guardianes locales corrompidos atacan a los viajeros. Con la ayuda de maestros artesanos (quienes te explican cómo los patrones de sus textiles guardan la memoria ancestral), aprendes nuevas señas en LSM para aplacar la furia de las bestias. Al ser liberadas, las criaturas revelan un pasaje oculto hacia el corazón de la ciudad: las ruinas fortificadas del **Templo de Santo Domingo (o la Catedral de Oaxaca)**.
* **Jefe Final de Oaxaca:** **La Bruja Tlahuelpuchi (Bruja Guajolote)**. En el interior del templo enfrentas a una bruja al servicio de la Cofradía que alterna su forma humana con la de un gigantesco guajolote/ave oscura envuelta en fuego fatuo. Al vencerla, obtienes el **2do Fragmento del Sello**.

---

### ACTO II: El Corazón Fracturado (El Altiplano: Puebla y CDMX)

#### Nivel 5: Puebla — De la Rueda Caída a los Fuertes
* **Justificación de Ruta:** Con las carreteras del país colapsadas, el mapa que tu madre dejó en el Códice marca a Puebla como el único paso viable hacia el Altiplano y el escondite del siguiente sello.
* **Escenarios:** El nivel inicia en los senderos semiáridos (tierra seca, nopales y árboles de verde cenizo) hasta entrar a la zona moderna devastada de **Angelópolis**, dominada visualmente por la **Rueda de la Fortuna colapsada y retorcida**. Avanzas entre edificios coloniales con talavera rota y cables de neón hasta subir a los históricos **Fuertes de Loreto y Guadalupe**.
* **Gameplay:** Combate intenso contra Encapuchados Rojos y Negros, chaneques alterados y espíritus invisibles que requieren activar la **Habilidad Luna** con Balam para ser detectados y purificados. Mientras avanzan, María muestra cada vez más desesperación al no hallar rastro de sus hijos.
* **Jefe Final de Puebla:** **La Nahuala**. En el patio central de los Fuertes de Loreto, enfrentas a este poderoso ente cambiaformas que utiliza ilusiones y trampas. Al liberarla de su corrupción, consigues el **3er Fragmento del Sello**.

#### Nivel 6: Ciudad de México (Parte 1) — De la Isla de las Muñecas a Reforma
* **Escenario:** Las colosales ruinas retrofuturistas de la CDMX. Al fondo se alzan antiguas pirámides mexicas junto a rascacielos derrumbados que pierden pedazos poco a poco. Las calles están adornadas con papel picado y flores de cempasúchil por el Día de Muertos, mientras a lo lejos se observa el **Ángel de la Independencia caído sobre el asfalto de Paseo de la Reforma** y las cabinas de un teleférico aún en movimiento.
* **Gameplay y Enemigos:**
  * **Isla de las Muñecas:** Inicias cruzando los canales secos donde eres emboscado por **muñecas poseídas**. A diferencia de los seres naturales, estas son recipientes inanimados corrompidos, por lo que **sí puedes destruirlas directamente** con ataques láser de la gema.
  * **Emboscadas de Nahuales (Mini-jefes):** Al avanzar hacia Reforma, encuentras sobrevivientes (NPCs) con los que hablas para obtener información. Sin embargo, algunos NPCs aparentemente inofensivos resultan ser **Nahuales infiltrados**: al interactuar con ellos, se transforman por sorpresa lanzando un zarpazo que quita mucha vida. Funcionan como mini-jefes intensos que huyen al quedar con poca salud.
* **Cierre del Nivel:** Hablando con los verdaderos habitantes de la zona, te enteras de que el líder local de la Cofradía es **El Rey del Olvido**, y que lo vieron llevarse a una mujer cuya descripción coincide exactamente con tu madre hacia su guarida en las alturas. El nivel termina cuando tú, María y Balam llegan a la estación base del **Teleférico**.

#### Nivel 7: Ciudad de México (Parte 2) — El Teleférico, El Rey del Olvido y La Llorona
* **El Ascenso:** Subes en el teleférico en una secuencia de acción vertical donde eres abordado por espíritus (visibles con la *Habilidad Luna*) y miembros de la Cofradía. Al llegar a la estación superior de la torre de control, te abres paso contra la guardia de élite (**Encapuchados Negros con detalles Rojos**, mucho más resistentes).
* **El Clímax de María (La Revelación):** Entras al salón del trono del **Rey del Olvido**. Allí se revela un giro desgarrador: **María fue la esposa del Rey del Olvido**. Cuando él se entregó al culto y decidió que debía borrar todo vínculo humano, utilizó su corona de control mental para obligar a la propia María a ahogar a sus hijos, borrándole después la memoria para dejarla vagando en agonía.
* **Jefe Final de CDMX:** **El Rey del Olvido (con asistencia de La Llorona)**. La verdad rompe el alma de María; conectándose con el dolor ancestral de las *cihuateteo*, se transforma en su forma espectral: **La Llorona**. Lejos de atacarte a ti, su furia se desata contra su exesposo. Peleas contra el Rey del Olvido mientras La Llorona te asiste atacándolo con gritos espectrales hasta que logras **destruir su corona**.
* **Resolución y La Trampa:** Con el Rey derrotado, La Llorona queda fuera de control por el dolor. Usas una secuencia especial de LSM (*Consuelo, Memoria y Paz*) para devolverle únicamente el recuerdo puro del amor que tuvo por sus hijos. Apaciguada pero atada a su leyenda, se despide desvaneciéndose entre las calles de la ciudad, condenada a buscar a sus hijos por la eternidad.
* **La Falsa Llamada:** En la guarida recuperas el **4to Fragmento del Sello**. Al revisar la consola de comunicaciones que el Rey usaba para torturar mentes a distancia, logras contactar a tu madre. Ella te pide que no vengas a rescatarla todavía: te explica el plan de la Cofradía de devorar el Sol y te ordena que primero vayas a Guanajuato y Jalisco por los últimos dos fragmentos. *(El jugador aún no sabe que esta transmisión fue manipulada).*

---

### ACTO III: El Eclipse de Obsidiana (El Bajío y Occidente)

#### Nivel 8: Guanajuato — Las Minas y la Calle del Truco
* **Escenario:** Letras desgastadas de Guanajuato. Entras a una ciudad desolada de callejones estrechos donde los pocos NPCs sobrevivientes te advierten sobre las **momias**: cuerpos antiguos que la energía oscura impide descansar.
* **Gameplay:** Llegas a la **Parroquia de San Miguel y el Templo Expiatorio**, desde donde desciendes a la red de **túneles mineros abandonados**: un entorno claustrofóbico de charcos, madera podrida y muy poca luz. Usando la *Habilidad Luna* y los conjuros de luz de tu gema, avanzas enfrentando **momias, espíritus y emboscadas de nahuales**.
* **Jefe Final de Guanajuato:** **Don Ernesto, El Jugador de la Calle del Truco**. En el fondo de la mina encuentras a este personaje del folclor local: un apostador empedernido que pactó con el diablo y cuya alma corrompida custodia el sello usando ataques de azar, cartas espectrales y fuego infernal. Al vencerlo y liberar su espíritu, obtienes el **5to Fragmento del Sello**.

#### Nivel 9: Jalisco (Haciendas y Panteón de Belén) — El Árbol del Vampiro
* **Escenario:** Cielo rojizo que comienza a oscurecerse. Recorres los paisajes áridos llenos de **plantaciones de agave** rumbo a una antigua hacienda tequilera tomada por la Cofradía.
* **Gameplay:** Te abres paso entre Encapuchados de todos los rangos, chaneques, bestias y espíritus hasta limpiar la hacienda principal, donde aseguras el último sello: el **6to Fragmento**.
* **Jefe de Zona:** **El Vampiro del Panteón de Belén**. Al salir de la hacienda atraviesas un antiguo panteón dominado por un árbol colosal de raíces gruesas que rompen las lápidas (el famoso *Árbol del Vampiro*). Junto al tronco encuentras a un misterioso hombre alto vestido de traje antiguo; al interactuar con él, se transforma en una bestia vampírica letal. Tras derrotarlo, el camino hacia el centro de Guadalajara queda libre.

#### Nivel 10: Guadalajara (Catedral Metropolitana) — La Trampa y el Eclipse Final
* **Escenario:** La capital de Jalisco en ruinas. En el horizonte se distingue la silueta abandonada del **Estadio de las Chivas (Estadio Akron)** bajo el sol eclipsándose, mientras tú avanzas hacia el centro histórico hasta entrar a la **Catedral Metropolitana**, el santuario final de la Cofradía.
* **El Ascenso y El Giro (El Engaño):** Superas una intensa oleada final con todos los tipos de enemigos del juego dentro de la Catedral. Al llegar al altar mayor donde tienen encadenada a tu madre, **eres capturado en una emboscada**. El alto mando de la Cofradía te revela la verdad: ni siquiera tu madre sabía dónde estaban los fragmentos porque le habían borrado parte de la memoria; **la llamada que recibiste en CDMX fue una simulación creada por ellos**. Te dejaron vivo desde Xalapa esperando que tú hicieras el trabajo sucio de recolectar los 6 fragmentos y se los entregaras en bandeja de plata.
* **La Invocación:** Te arrebatan el Códice completo y usan a tu madre para abrir su corazón. El techo de la Catedral se abre al cielo negro del Gran Eclipse: descienden las **Tzitzimime** (demonios estelares) y comienza a gestarse el capullo de su líder suprema, **Itzpapálotl, la Mariposa de Obsidiana**.
* **Fase 1 del Combate Final (La Horda y las Tzitzimime):** Mientras el culto contempla el descenso, utilizas una secuencia de señas de alta complejidad a tus espaldas para sobrecargar tu gema, rompiendo tus ataduras y liberando a Balam (quien absorbe la energía residual de los sellos para crecer a su forma de jaguar luminoso). En esta primera fase peleas contra oleadas de enemigos y contra las propias **Tzitzimime** (que fungen como los subjefes de mayor dificultad de todo el juego) antes de que su reina despierte.
* **Fase 2 del Combate Final (Itzpapálotl Desatada):** Cuando abates a la última Tzitzimime y crees haber detenido el ritual a tiempo, el capullo de obsidiana explota. **Itzpapálotl se levanta**, iniciando el verdadero combate final. Combinas la **Habilidad Luna** (para ver sus ataques dimensionales), el apoyo de Balam y todo tu repertorio de LSM —incluyendo las señas familiares para despertar la conciencia de tu madre y que ella te asista desde el altar— hasta quebrar las alas de obsidiana de la diosa y destruir el núcleo del Eclipse.

---

## 3. Epílogo: Las Páginas en Blanco

Con Itzpapálotl derrotada y la Cofradía del Espejo Negro desintegrada, el Sol recupera su brillo sobre Guadalajara y el resto de México. Libres del control oscuro, los espíritus descansan y las comunidades comienzan a recordar sus canciones e historias.

Regresas con tu madre y con Balam (de vuelta en su forma de pequeño gato alebrije) a su taller en Xalapa junto con el Códice restaurado. Al abrirlo, notan que muchas páginas recuperaron su tinta, pero quedan **espacios completamente en blanco**: páginas listas para ser escritas por las comunidades sobrevivientes y las nuevas generaciones que reconstruirán el país.

> *"La memoria de un pueblo vive en quienes la comparten."*

---

## 4. Tabla Resumen de Producción (Niveles, Jefes y Reutilización)

| Nivel | Ubicación / Escenario Clave | Enemigos Comunes (Reutilizables) | Jefe / Mini-Jefe | Recompensa / Desbloqueo |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Xalapa** (Parque Juárez y Busto de Juárez) | Chaneques | **Chaneque Mayor** | Códice de las Voces + Mapa |
| **2** | **San Andrés Tuxtla** (Pueblo y Fandango) | Chaneques | *Misión de exploración musical* | **1er Fragmento** |
| **3** | **Catemaco** (Lago nocturno) | Encapuchados Rojos, Espíritus | **Cabeza Olmeca Poseída** | **Balam + Habilidad Luna** + Se une María |
| **4** | **Oaxaca** (Casas coloridas y Templo) | Bestias corrompidas, Encapuchados | **Bruja Guajolote (Tlahuelpuchi)** | **2do Fragmento** + Nuevas señas LSM |
| **5** | **Puebla** (Zona semiárida, Rueda caída, Fuertes) | Encapuchados (Rojos/Negros), Chaneques, Espíritus | **La Nahuala** | **3er Fragmento** |
| **6** | **CDMX Parte 1** (Isla Muñecas, Reforma, Ángel caído) | Muñecas (abatibles), Chaneques, Encapuchados | **Nahuales infiltrados** (Mini-jefes sorpresa) | Acceso al Teleférico |
| **7** | **CDMX Parte 2** (Teleférico y Guarida del Rey) | Espíritus, Encapuchados Élite (Negro/Rojo) | **El Rey del Olvido** (con ayuda de **La Llorona**) | **4to Fragmento** + Llamada trampa |
| **8** | **Guanajuato** (Callejones, Parroquia y Minas) | Momias, Espíritus, Nahuales | **Don Ernesto (Calle del Truco)** | **5to Fragmento** |
| **9** | **Jalisco** (Agaves, Hacienda y Panteón de Belén) | Todos los rangos de Cofradía, Bestias, Chaneques | **El Vampiro del Panteón de Belén** | **6to Fragmento** |
| **10** | **Guadalajara** (Estadio Chivas fondo, Catedral) | Todos los enemigos del juego | **Fase 1:** Tzitzimime / **Fase 2:** **Itzpapálotl** | Final del Juego |