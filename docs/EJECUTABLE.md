# Ejecutable de Windows (Electron)

ECOS se empaqueta como un `.exe` **portable** (un solo archivo, sin instalador, sin internet).

## Generarlo

```bash
npm install
npm run dist:win      # = npm run build + electron-builder --win portable
```

Salida: `release/ECOS-<version>-portable.exe` (~136 MB; la carpeta `release/` está en `.gitignore`).

Para probar sin empaquetar (requiere `dist/` ya compilado): `npm run electron:dev` (F12 abre DevTools solo en este modo).

## Cómo funciona

- `electron/main.cjs` sirve `dist/` con un protocolo propio `app://ecos/` (privilegiado: standard, secure, fetch, CORS) con tipos MIME correctos (`.wasm`, `.task`, `.ogg`, `.mp3`, `.woff2`...). Así MediaPipe (WASM + modelo en `dist/mediapipe/`) carga igual que en la web; con `file://` fallaría.
- Concede el permiso de cámara (`media`) automáticamente. Bloquea navegación y ventanas externas. Sin menú ni DevTools en producción.
- Ventana 1280x720 redimensionable; **F11** alterna pantalla completa (Esc la cierra).
- Registro de diagnóstico en `%APPDATA%\ecos\ecos.log`.

## Notas

- **Primera ejecución**: el portable se descomprime a una carpeta temporal; puede tardar 20-40 s la primera vez (el antivirus lo escanea). Las siguientes abren más rápido.
- **SmartScreen**: el .exe no está firmado, así que Windows mostrará "Windows protegió su PC". Pulsar **Más información -> Ejecutar de todos modos**.
- **Cámara**: se necesita una cámara web; si Windows tiene bloqueado el acceso a la cámara para apps de escritorio (Configuración -> Privacidad -> Cámara), actívalo.
- Solo x64. Firma de código desactivada (`signAndEditExecutable: false`), por eso el `.exe` conserva el icono de Electron en el Explorador; el icono de la ventana sí es el de `electron/icon.png`.
- Si `electron-builder` falla con `EPERM ... rename win-unpacked.tmp` (antivirus bloqueando), extrae el zip de Electron de `%LOCALAPPDATA%\electron\Cache` a una carpeta y ejecuta `npx electron-builder --win portable -c.electronDist=<carpeta>`.
