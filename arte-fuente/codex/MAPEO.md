# Mapeo de poses de las hojas de Codex → kits

Generado por `tools/codex-sheets.py`. Celdas numeradas 0–23, fila por fila (6 por fila).

| Celda | Pose (nombre del cuadro) |
|---|---|
| 0 | reposo_1 |
| 1 | reposo_2 |
| 2 | caminar_1 |
| 3 | caminar_2 |
| 4 | caminar_3 |
| 5 | caminar_4 |
| 6 | correr_1 |
| 7 | correr_2 |
| 8 | correr_3 |
| 9 | correr_4 |
| 10 | preparar |
| 11 | atacar |
| 12 | guardia |
| 13 | conjuro |
| 14 | lanzar_1 |
| 15 | lanzar_2 |
| 16 | salto |
| 17 | caida |
| 18 | agacharse |
| 19 | esquivar |
| 20 | golpe_bajo |
| 21 | dano |
| 22 | derrota |
| 23 | caido |

## Animaciones por defecto (motion → celdas)

- `reposo`: [0, 1] · 2.5 fps · bucle
- `caminar`: [2, 3, 4, 5] · 8 fps · bucle
- `correr`: [6, 7, 8, 9] · 11 fps · bucle
- `golpe`: [10] · 1 fps · una vez
- `ataque`: [10, 11] · 9 fps · una vez
- `disparar`: [11] · 1 fps · una vez
- `conjuro`: [13, 14] · 4 fps · bucle
- `invocar`: [12, 13] · 3 fps · bucle
- `lanzar`: [14, 15] · 9 fps · una vez
- `salto`: [16] · 1 fps · una vez
- `subida`: [16] · 1 fps · una vez
- `caida`: [17] · 1 fps · una vez
- `aterrizar`: [18] · 1 fps · una vez
- `esquivar`: [19] · 1 fps · una vez
- `interactuar`: [18] · 1 fps · una vez
- `dano`: [21] · 1 fps · una vez
- `aturdido`: [22] · 1 fps · una vez
- `agotado`: [22] · 1 fps · una vez
- `purificar`: [22] · 1 fps · una vez
- `morir`: [21, 23] · 5 fps · una vez

## Cambios por personaje

- **protagonista**: `disparar` [10]; `caida` [16]; `conjuro` [13, 14]; `interactuar` [18]
- **madre**: `caida` [16]
- **cabeza_olmeca**: `reposo` [5, 13]; `caminar` [6, 7, 8, 9]; `correr` [6, 7, 8, 9]; `golpe` [14]; `ataque` [10, 11]; `disparar` [11]; `conjuro` [10, 11]; `invocar` [12, 14]; `lanzar` [11]; `salto` [16]; `subida` [16]; `caida` [18]; `aterrizar` [18]; `esquivar` [6]; `interactuar` [5]; `dano` [15]; `aturdido` [17, 22]; `agotado` [22]; `purificar` [22, 20]; `morir` [15, 21]
- **balam**: `aturdido` [21]; `agotado` [22]; `purificar` [22]; `morir` [23]
- **balam_jaguar**: `aturdido` [21]; `morir` [23]

## Kits

| id | hojas (variante ← archivo) | alto objetivo | cuadro | pivote |
|---|---|---|---|---|
| protagonista | — ← protagonista.png | 72 px | 76×79 | (38, 77) |
| madre | — ← madre.png | 70 px | 74×76 | (37, 74) |
| chaneque | — ← chaneque.png | 56 px | 72×61 | (36, 59) |
| chaneque_mayor | — ← chaneque-mayor.png | 100 px | 126×107 | (63, 105) |
| encapuchado | rojo ← miembro-cofradia-rojo.png, negro ← miembro-cofradia-negro.png, elite ← miembro-cofradia-rojo-negro.png | 74 px | 106×86 | (53, 84) |
| espiritu | hombre ← espiritu-hombre.png, mujer ← espiritu-mujer.png | 72 px | 86×79 | (43, 77) |
| cabeza_olmeca | — ← cabeza-olmeca.png | 120 px | 150×132 | (75, 130) |
| balam | — ← balam.png | 40 px | 56×45 | (28, 43) |
| balam_jaguar | — ← balam-jaguar.png | 60 px | 124×88 | (62, 86) |
| maria | — ← maria.png | 70 px | 84×74 | (42, 72) |
| bestia | 1 ← bestia-1.png, 3 ← bestia-3.png | 76 px | 98×89 | (49, 87) |
| bruja_guajolote | — ← bruja.png | 105 px | 126×117 | (63, 115) |
| bruja_guajolote_ave | dibujada por código | 105 px | 206×162 | (103, 160) |
| muneca | 1 ← muneca-poseida-1.png, 2 ← muneca-poseida-2.png, 3 ← muneca-poseida-3.png, 4 ← muneca-poseida-4.png | 54 px | 58×59 | (29, 57) |
| nahual | — ← nahual-humano.png | 74 px | 84×78 | (42, 76) |
| nahual_animal | — ← nahual.png | 84 px | 108×89 | (54, 87) |
| nahuala | — ← nahuala.png | 100 px | 110×104 | (55, 102) |
| rey_olvido | — ← rey-del-olvido.png | 118 px | 134×124 | (67, 122) |
| llorona | — ← llorona.png | 76 px | 102×83 | (51, 81) |
| tzitzimitl | — ← tzitzimime.png | 105 px | 152×118 | (76, 116) |
| itzpapalotl | — ← itzpapalotl.png | 140 px | 172×150 | (86, 148) |
| momia | — ← momia.png | 72 px | 80×76 | (40, 74) |
| vampiro | — ← vampiro.png | 100 px | 120×105 | (60, 103) |
| don_ernesto | — ← don-ernesto.png | 105 px | 128×120 | (64, 118) |

Notas:

- `nahual_animal` usa `nahual.png` (forma animal del nahual). `bestia-2.png` no se usa (las bestias son 1 y 3).
- Protagonista y madre: cabeza ×0.80 y cuerpo ×1.18 en las poses erguidas; color con 62 % de saturación y 86 % de brillo.
- Don Ernesto: piel verde ceniza, ojos que brillan, cuernos sobre el sombrero y doble contorno carmesí.
- Cabeza Olmeca: la hoja son expresiones (ojos verdes = ataque, X = derrota, ojos cerrados = calma).
