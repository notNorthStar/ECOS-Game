// ECOS — proceso principal de Electron (empaquetado portable de Windows).
// Sirve dist/ con un protocolo propio app:// para que fetch, WASM (MediaPipe) y audio
// funcionen igual que en la web (con file:// el WASM puede no cargar).
const { app, BrowserWindow, protocol, session, Menu, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Raíz del juego: dist/ junto a este archivo (dentro del asar al empaquetar).
const DIST = path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

// Log mínimo en userData para diagnosticar arranques.
function log(msg) {
  try {
    const f = path.join(app.getPath('userData'), 'ecos.log');
    fs.appendFileSync(f, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* sin log, no pasa nada */ }
}

function registerProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(DIST, rel));
      // Evita salir de dist/ (path traversal).
      if (!file.startsWith(DIST)) return new Response('Prohibido', { status: 403 });
      const ext = path.extname(file).toLowerCase();
      const res = await net.fetch(pathToFileURL(file).toString());
      if (!res.ok) { log(`404 ${rel}`); return res; }
      const headers = new Headers(res.headers);
      headers.set('Content-Type', MIME[ext] || 'application/octet-stream');
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      log(`error sirviendo ${request.url}: ${e && e.message}`);
      return new Response('No encontrado', { status: 404 });
    }
  });
}

function setupPermissions() {
  const ses = session.defaultSession;
  // Cámara/micrófono para la detección de LSM (MediaPipe).
  const allowed = new Set(['media', 'fullscreen']);
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    resizable: true,
    title: 'ECOS',
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();

  // El título de la ventana siempre es "ECOS".
  win.on('page-title-updated', (e) => e.preventDefault());

  // Bloquea navegación y ventanas externas.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });

  // F11 = pantalla completa; Esc sale de ella. DevTools solo en desarrollo.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false);
    } else if (!app.isPackaged && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });

  win.webContents.on('did-finish-load', () => log('did-finish-load'));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log(`did-fail-load ${code} ${desc} ${url}`));
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) log(`consola[${level}] ${message}`); });

  win.loadURL('app://ecos/index.html');
  return win;
}

// Una sola instancia.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerProtocol();
    setupPermissions();
    log(`arranque v${app.getVersion()} empaquetado=${app.isPackaged} dist=${DIST}`);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
