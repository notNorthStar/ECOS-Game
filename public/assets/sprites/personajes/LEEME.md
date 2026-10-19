# Personajes del kit del equipo

Aquí va la carpeta que genera `pixelizar.py` del **kit de assets de personaje**, **tal cual**, una por personaje:

```
personajes/
└── <id>/
    ├── <id>_spritesheet.png     ← lo que carga el juego
    ├── <id>_spritesheet.json    ← lo que carga el juego (tamaño de cuadro, pivote, vistas)
    └── (sprites/, paleta, preview, concepto… se pueden subir también; el juego los ignora)
```

**ids que busca el juego:** `protagonista`, `chaneque`, `chaneque_mayor`, `madre`.
Para otro personaje, agrégalo a `KIT_IDS` en `src/systems/CharacterKits.ts` (o a `"kits"` en `src/data/assets.json`).

- En cuanto existe la carpeta, el juego usa ese personaje **en lugar del placeholder**, sin tocar código.
- Las vistas fijas (`frente`, `lado_izq`, `lado_der`, `espalda` · `der`, `izq`) se **animan por código**: balanceo al caminar, inclinación al correr, estirar al saltar, aplastar al aterrizar, retroceso al disparar, parpadeo al recibir daño, `frente` al lanzar un conjuro y `espalda` al interactuar.
- El chaneque y el Chaneque Mayor van como **criatura mirando a la derecha** (`der`, con `izq` en espejo).
- Medidas: las del kit (`ESPECIFICACIONES.md`). Humanoide 64×80 con pivote (32, 78); chaneque 50–60 px de alto; jefe hasta 120 px.
- Para quitarlo y volver al placeholder: borra la carpeta.
