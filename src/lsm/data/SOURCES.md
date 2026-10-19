# Fuentes de LSM — alfabeto manual (módulo ecos-lsm)

> Regla del proyecto: **no inventar la forma de ninguna letra**. Toda letra queda marcada `review: true` en `letters.json` hasta que una persona del equipo la compare con el abecedario oficial y la marque como verificada aquí. Con una madre sorda en la historia de ECOS, la representación debe ser cuidadosa: idealmente, que la revise alguien de la comunidad sorda.

## Fuentes consultadas (2026-10-16, Claude Code)

1. **Mejía-Pérez, K., Córdova-Esparza, D.-M. y del-Río-Magaña, E. (2021).** *Desarrollo de una base de datos para el reconocimiento de la lengua de señas mexicana.* Research in Computing Science 150(6), 393–408. Universidad Autónoma de Querétaro.
   https://www.rcs.cic.ipn.mx/2021_150_6/Desarrollo%20de%20una%20base%20de%20datos%20para%20el%20reconocimiento%20de%20la%20lengua%20de%20senas%20mexicana.pdf
   - Dice textualmente que el abecedario tiene **27 letras: 6 dinámicas (con movimiento) y 21 estáticas**.
   - Confirma que la **K** se captura como video (seña dinámica).
   - **No** enumera las 6 dinámicas en el texto extraíble (la tabla está como imagen). La lista J, K, Ñ, Q, X, Z es coherente con ese conteo; **falta confirmarla con el abecedario de la SEP**.
2. **Gómez-Terán, A., Priego-Sánchez, B. y Pinto, D. (2020).** *Postura esquelética de la mano para representar las configuraciones dactilológicas de la LSM en un entorno virtual.* Research in Computing Science 149(8), 227–240.
   https://www.rcs.cic.ipn.mx/2020_149_8/Postura%20esqueletica%20de%20la%20mano%20para%20representar%20las%20configuraciones%20dactilologicas.pdf
   - El alfabeto dactilológico de LSM tiene **29 configuraciones** (27 letras + RR y LL).
3. **SEP — Nueva Escuela Mexicana, recurso "Abecedario en Lengua de Señas Mexicana"** (fuente oficial recomendada para la revisión visual):
   https://nuevaescuelamexicana.sep.gob.mx/contenido/recurso/abecedario-en-lengua-de-senas-mexicana/
   - Indica que algunas letras se dibujan con flechas de movimiento. **No se pudo revisar la imagen automáticamente**: hay que hacerlo a mano.
4. **Demostraciones del equipo con la cámara** (2026-10-17): G, H, M, N, P, T, W y la R (con una imagen de referencia de la R de LSM) se calibraron con capturas del equipo haciendo cada letra. Son la forma que el equipo conoce, **no** una verificación oficial.

## Qué reconoce el módulo

| Grupo | Letras | Cómo |
|---|---|---|
| Estáticas con regla geométrica | A, B, C, D, E, F, G, H, I, L, M, N, O, P, R, S, T, U, V, W, Y | `core/rules.ts`, medidas en el marco de la mano (toleran inclinación y giro) |
| Con movimiento, por trayectoria | Z | `core/motion.ts`: con el índice se traza → ↘↙ → (vista de quien seña) |
| Con movimiento, sin reconocedor | J, K, Ñ, Q, X | El GDD de ECOS las excluye: ningún conjuro las usa |

Conjuros de la historia de ECOS (todos deletreables con cámara): CALMA, PROTECCION, LUZ, CONSUELO, MEMORIA, PAZ.

## Checklist de revisión humana (marcar con ✅ y nombre de quien revisó)

| Letra(s) | Forma en `letters.json` coincide con la SEP | Revisó |
|---|---|---|
| A, B, C, D, E, F | ⬜ | |
| G, H, I, L, M, N, O, P | ⬜ | |
| R, S, T, U, V, W, Y | ⬜ | |
| Z (trayectoria) | ⬜ | |

Cuando una letra esté verificada, cambia `"review": true` a `false` en `letters.json`. Si se cuenta con la ilustración oficial **con licencia**, cárgala en el juego como textura `lsm_<LETRA>` (48×64 px) y el adaptador de Phaser la mostrará en lugar del esquema dibujado por código. Cita la fuente en los créditos.
