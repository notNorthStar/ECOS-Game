# Personajes del kit del equipo

Aquí va la carpeta que genera `pixelizar.py` del **kit de assets de personaje**, **tal cual**, una por personaje:

```
personajes/
└── <id>/
    ├── <id>_spritesheet.png     ← lo que carga el juego
    ├── <id>_spritesheet.json    ← lo que carga el juego (tamaño de cuadro, pivote, vistas)
    └── (sprites/, paleta, preview, concepto… se pueden subir también; el juego los ignora)
```

**ids que busca el juego:** ver `KIT_IDS` en `src/systems/CharacterKits.ts` (lista completa abajo).
Para otro personaje, agrégalo a `KIT_IDS` en `src/systems/CharacterKits.ts` (o a `"kits"` en `src/data/assets.json`).

- En cuanto existe la carpeta, el juego usa ese personaje **en lugar del placeholder**, sin tocar código.
- Las vistas fijas (`frente`, `lado_izq`, `lado_der`, `espalda` · `der`, `izq`) se **animan por código**: balanceo al caminar, inclinación al correr, estirar al saltar, aplastar al aterrizar, retroceso al disparar, parpadeo al recibir daño, `frente` al lanzar un conjuro y `espalda` al interactuar.
- El chaneque y el Chaneque Mayor van como **criatura mirando a la derecha** (`der`, con `izq` en espejo).
- Medidas: las del kit (`ESPECIFICACIONES.md`). Humanoide 64×80 con pivote (32, 78); chaneque 50–60 px de alto; jefe hasta 120 px.
- Para quitarlo y volver al placeholder: borra la carpeta.

## Kits animados por cuadros (versión extendida, 2026-10-20)

Las carpetas actuales las genera `tools/codex-sheets.py` a partir de las hojas de Codex (`arte-fuente/ia-generado/codex-hojas/`):
`python -I tools/codex-sheets.py [ids…]`. Mapeo de poses y tamaños: `arte-fuente/codex/MAPEO.md`;
revisión visual: `arte-fuente/codex/revision/<id>.png`.

El JSON trae además del formato del kit:
- `"animaciones": { "<motion>": { "frames": [i…], "fps": n, "loop": bool } }` — índices dentro de la variante.
- `"escala"` — multiplicador de tamaño en pantalla (el animador lo multiplica por la escala de la entidad).
- `"variants"` + `"cuadrosPorVariante"` — versiones del mismo personaje (encapuchado `rojo/negro/elite`,
  espiritu `hombre/mujer`, bestia `1/3`, muneca `1…4`). En código: `kitAnimatorFor(sprite, id, variante)` o
  `animador.setVariant(variante)`; sin variante se elige una estable por sprite.

ids: protagonista, madre, chaneque, chaneque_mayor, encapuchado, espiritu, cabeza_olmeca, balam, balam_jaguar,
maria, bestia, bruja_guajolote, bruja_guajolote_ave (dibujada por código), muneca, nahual, nahual_animal, nahuala,
rey_olvido, llorona, tzitzimitl, itzpapalotl, momia, vampiro, don_ernesto.
Si el equipo entrega su propio kit en una de estas carpetas, el script lo respalda en `arte-fuente/kits-previos/`
antes de sobrescribirlo.
