# Créditos y licencias — ECOS

> **Obligatorio para el jam:** todo asset o herramienta de terceros se registra aquí **en el mismo commit en que se agrega** (ver `docs/ASSETS.md` §5). Sin licencia clara, no se usa.

## Equipo — Listick Games

| Nombre | Roles |
|---|---|
| Luis David Sosa Fernández | Dev Principal, Dirección Narrativa, Diseño de Niveles y Jefe de Proyecto |
| Dylan Antonio Hernández Gregorio | Diseño de Arte, Diseño de Personajes |
| Miguel Ángel Marcelo Taracena | Escritor, Diseño de Personajes, Diseño de Mecánicas, Diseño de Niveles, Support Developer |
| Mendoza Herrera Gonzalo | Diseñador de Audio, Soundtrack, Tester, QA |
| Jose Manuel Hernández Pacheco | Concept Arts, Tester |

> Los mismos nombres y roles salen en los créditos del juego (`src/data/creditos.json`, escena `EpilogoScene`).

## Herramientas y bibliotecas

| Recurso | Autor | Licencia | Uso |
|---|---|---|---|
| MediaPipe Tasks Vision + modelo `hand_landmarker.task` | Google | Apache 2.0 | Detección de manos para los conjuros en LSM (`ecos-lsm/`) |
| Phaser | Phaser Studio | MIT | Motor del juego |
| Vite | Evan You y colaboradores | MIT | Herramienta de compilación |
| TypeScript | Microsoft | Apache 2.0 | Lenguaje |
| Web Audio API | W3C (estándar del navegador) | Estándar abierto | Música y efectos sintetizados por código |
| Node.js | OpenJS Foundation | MIT | Herramientas de compilación y pruebas |
| Python y Pillow | Python Software Foundation · Jeffrey A. Clark y colaboradores | PSF · HPND | Procesamiento de imágenes y hojas de sprites |
| Git y GitHub | Software Freedom Conservancy · GitHub | GPL v2 (Git) · Servicio | Control de versiones y repositorio |
| REAPER | Cockos Incorporated | Licencia comercial (del equipo) | Producción del soundtrack original |

## Música

| Pista | Archivo | Autor | Licencia | Enlace | ¿Modificada? |
|---|---|---|---|---|---|
| Soundtrack original de ECOS (compuesto y producido por el equipo en REAPER): menú de inicio, taller, calles y parque de Xalapa, pelea y jefe Chaneque Mayor, calles de San Andrés Tuxtla, pueblo de Catemaco, pelea contra el Rey del Olvido y reencuentro con mamá. | `public/assets/audio/musica/` (`InstrumentalMenuInicio`, `InstrumentalNivel1Casa`, `InstrumentalNivel1Calle`, `Nivel1_Calle_Chaneques*`, `IntroPelea`/`LoopPelea`, `*PeleaChanequeMayor`, `Nivel2_Calle_Chaneques*`, `Nivel3_Calle_Loop`, `*PeleaReyDelOlvido`, `ReencuentroConMama`; asignación en `src/systems/audio/config.ts`) | Listick Games | Propia | — | No aplica (obra original) |
| Pistas del Nivel 10 (Guadalajara): `n10_avenida`, `n10_catedral`, `n10_tzitzimime`, `n10_itzpapalotl`, `n10_epilogo`. Originales, generadas por código; inspiradas en el son jalisciense y en la música barroca de órgano y la percusión prehispánica (teponaztli, huéhuetl), sin usar grabaciones. | `src/systems/audio/gdl.ts` (sintetizadas en tiempo real) | Listick Games | Propia | — | No aplica (obra original) |

## Efectos de sonido

| Efecto | Archivo | Autor | Licencia | Enlace | ¿Modificado? |
|---|---|---|---|---|---|
| | | | | | |

## Tipografías

| Fuente | Archivo | Autor | Licencia | Enlace |
|---|---|---|---|---|
| Pixelify Sans (pesos 400 y 700, subconjunto latino: acentos, ñ, ¿ y ¡) — fuente de toda la interfaz | `public/assets/fuentes/pixelify-sans-400.woff2`, `pixelify-sans-700.woff2` (licencia completa en `public/assets/fuentes/OFL-PixelifySans.txt`; se carga en `src/ui/fuente.ts`) | Stefie Justprince / The Pixelify Sans Project Authors | SIL Open Font License 1.1 | https://github.com/eifetx/Pixelify-Sans · archivos tomados del paquete npm `@fontsource/pixelify-sans` 5.3.0 (sin modificar) |
| Atkinson Hyperlegible (pesos 400, 700 y 400 cursiva, subconjunto latino: acentos, ñ, ¿ y ¡) — fuente de lectura para textos largos (cuerpo de los diálogos, consejos de la pantalla de carga) | `public/assets/fuentes/atkinson-hyperlegible-400.woff2`, `atkinson-hyperlegible-700.woff2`, `atkinson-hyperlegible-400-italic.woff2` (licencia completa en `public/assets/fuentes/OFL-AtkinsonHyperlegible.txt`; se carga en `src/ui/fuente.ts`) | Braille Institute of America | SIL Open Font License 1.1 | https://www.brailleinstitute.org/freefont · archivos tomados del paquete npm `@fontsource/atkinson-hyperlegible` 5.3.0 (sin modificar) |

## Arte del equipo

| Asset | Archivo | Autor | Licencia | Notas |
|---|---|---|---|---|
| Concept arts de las pantallas de carga (15 escenas del juego y sus misiones) | `public/assets/ui/carga/carga_01…15.jpg` (originales en `arte-fuente/ia-generado/pantallas-carga/`) | Jose Manuel Hernández Pacheco (concept arts), con apoyo de Gemini Nano Banana | Propia | Versiones en alta calidad (JPG, tamaño original) en public/assets/ui/carga/hd/, mostradas sin efectos; respaldo de 640×360 en public/assets/ui/carga/ |
| Hojas de personajes en pixel art (24 poses por personaje, con variantes) | `public/assets/sprites/personajes/<id>/` (originales en `arte-fuente/ia-generado/codex-hojas/`) | Codex (OpenAI), dirigido por el equipo | Propia | Recortadas, sin fondo y escaladas con `tools/codex-sheets.py`; protagonista y madre ajustados por código (proporción y color); Bruja Guajolote ave y detalles de Don Ernesto dibujados por código (Claude Code) |

## Gráficos de terceros

| Asset | Archivo | Autor | Licencia | Enlace | ¿Modificado? |
|---|---|---|---|---|---|
| | | | | | |

## Lengua de Señas Mexicana

Fuentes consultadas y estado de verificación: `ecos-lsm/src/data/SOURCES.md`. Si se usan ilustraciones oficiales de letras, registrarlas aquí:

| Ilustraciones | Fuente | Permiso / licencia |
|---|---|---|
| | | |

## Inteligencia artificial

Uso declarado en `AI_LOG.md` (requisito de la convocatoria). Herramientas de IA utilizadas, con su aporte:

| Herramienta | Empresa | Aporte |
|---|---|---|
| Claude Code · Opus 5.5 | Anthropic | Soporte Narrativo, Desarrollo General, Guiones, Diseño de Escenarios, Diseño de Niveles, Música y efectos por código, Pruebas, Documentación |
| Codex | OpenAI | Diseño Pixel Art, Dev Support |
| Gemini Nano Banana | Google | Soporte y Generación de Imágenes |

Las decisiones de historia, diseño y dirección fueron del equipo, que revisó y modificó el resultado.
