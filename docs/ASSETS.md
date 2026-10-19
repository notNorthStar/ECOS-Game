# Assets de ECOS: dónde va cada cosa

> Para el equipo y para las IAs. **Antes de subir o generar un asset, revisa esta guía.**
> Medidas exactas de cada sprite, animaciones y número de cuadros: `ART_SPEC.md` (lo genera la primera sesión de desarrollo; mientras tanto, AGENTS.md §8).

---

## 1. Dos zonas: listo para el juego vs. archivos de trabajo

| Carpeta | Qué va | ¿Lo carga el juego? |
|---|---|---|
| **`public/assets/`** | Assets **finales**, listos para usar: PNG, OGG, fuentes, mapas | **Sí.** El nombre y la ruta importan: el código los busca ahí |
| **`arte-fuente/`** | Concept art, archivos editables (Aseprite, PSD), salidas crudas de IA, proyectos de audio | **No.** Es material de trabajo y evidencia del proceso |

## 2. Mapa de carpetas

```
public/assets/
├─ sprites/
│  ├─ protagonista/        protagonista_<animacion>.png        (64×64, pies en y=60)
│  ├─ npcs/                <personaje>_<animacion>.png         (64×64)
│  ├─ enemigos/            <enemigo>_<animacion>.png           (chaneque 48×48)
│  ├─ jefes/               <jefe>_<animacion>.png              (128×128 o más)
│  └─ efectos/             fx_<efecto>.png
├─ escenarios/
│  ├─ comun/               letras turísticas, Altar de la Memoria, runas
│  ├─ nivel-01-xalapa/     fondos/ · tiles/ · props/
│  └─ nivel-02-…/          (se crea al empezar cada nivel, mismo formato)
├─ ui/                     HUD, rueda de conjuros, diario, menús, retrato_<personaje>.png
├─ lsm/                    lsm_<letra>.png (ilustraciones OFICIALES verificadas, 48×64)
├─ audio/
│  ├─ musica/              musica_<nivel>_<situacion>.ogg
│  └─ sfx/                 sfx_<accion>.ogg
├─ fuentes/                tipografías (TTF/WOFF2 o bitmap), con acentos y Ñ
└─ mapas/                  mapas de cada nivel
arte-fuente/
├─ concept/                concept art del equipo
├─ aseprite/               editables (.aseprite, .psd chico, .kra)
├─ ia-generado/            salidas de IA SIN retocar (evidencia para AI_LOG.md)
└─ audio/                  proyectos de audio chicos
```

Cada carpeta tiene un `LEEME.md` con sus reglas.

## 3. Reglas de nombres (obligatorias)

- **Minúsculas, sin acentos, sin espacios ni Ñ**, separadas con guion bajo: `chaneque_mayor_golpe.png`, `musica_n01_combate.ogg`.
- Patrón: **`<quien>_<que>.<ext>`**. Por ejemplo, `protagonista_correr.png`, `fondo_montanas.png`, `sfx_perfecto.ogg`.
- Niveles en carpetas: **`nivel-NN-nombre`** con dos dígitos, por ejemplo `nivel-03-catemaco`. En nombres de archivo: **`nNN`**, por ejemplo `musica_n03_exploracion.ogg`.
- **Nunca renombres un asset que ya usa el juego** sin avisar: el código lo busca por nombre. Si cambias el nombre, actualiza el manifiesto de assets del juego en el mismo commit.

## 4. Formatos

| Tipo | Formato | Notas |
|---|---|---|
| Sprites, fondos, tiles, UI | **PNG** con transparencia | Pixel art a escala **1×** (nunca ampliado). Tiras horizontales de cuadros del mismo tamaño, una por animación |
| Música | **OGG** Vorbis, 44.1 kHz | Lazos limpios. Volumen normalizado entre pistas |
| Efectos | **OGG** (WAV si dura menos de 1 s) | Cortos, sin silencio al inicio |
| Fuentes | TTF / WOFF2 o fuente bitmap | Deben tener **acentos y Ñ** |
| Mapas | JSON (Tiled u otro documentado) | |

## 5. Licencias y créditos (la convocatoria descalifica si falta)

- **Todo asset de terceros** (música, efectos, fuentes, sprites) se registra en **`CREDITOS.md`** en el mismo commit en que se sube: autor, enlace, licencia y si se modificó.
- **Sin licencia clara, no se sube.** Licencias seguras: CC0, CC-BY (con crédito), OFL (fuentes) y MIT.
- **Assets hechos con IA:**
  1. Guarda la salida cruda en `arte-fuente/ia-generado/`.
  2. Registra la entrada en `AI_LOG.md`.
  3. Pon la versión retocada en `public/assets/`.
  - La convocatoria exige declarar qué se usó y qué aportó el equipo.
- **Ilustraciones de LSM:** solo las oficiales con permiso de uso, con su fuente en `CREDITOS.md` y en `ecos-lsm/src/data/SOURCES.md`.

## 6. Archivos pesados

- GitHub **rechaza archivos de más de 100 MB** y avisa desde 50 MB. Este repo **no usa Git LFS**: la cuota gratuita es chica y no todo el equipo lo tiene instalado.
- Mantén cada archivo por debajo de **25 MB**. Los PNG de pixel art y los OGG pesan muy poco.
- Masters WAV, grabaciones largas, videos y PSD gigantes van **fuera del repo**. Agrega aquí el enlace:

| Material | Enlace | Responsable |
|---|---|---|
| *(ejemplo)* Masters de música | *(pegar enlace de Drive)* | |

## 7. Cómo subir assets sin usar la terminal

1. En GitHub, entra a la carpeta correcta (por ejemplo `public/assets/audio/musica`).
2. **Add file → Upload files**, arrastra los archivos.
3. Mensaje del commit en español (por ejemplo "Música: exploración del Nivel 1") y **Commit changes**.
4. Si es de terceros, edita `CREDITOS.md` en el mismo paso. Si es de IA, edita `AI_LOG.md`.

## 8. Reglas para las IAs

- **Nunca sobrescribas ni borres un asset del equipo.** Los placeholders generados por código se crean **solo donde no existe archivo** con ese nombre.
- Antes de crear un placeholder, revisa si el equipo ya subió el asset real en `public/assets/`.
- Si un asset del equipo no cumple las medidas de `ART_SPEC.md`, **avisa**; no lo corrijas en silencio.
- Al crear un nivel nuevo, crea su carpeta `escenarios/nivel-NN-nombre/` con `fondos/`, `tiles/` y `props/`, y su `LEEME.md`.
