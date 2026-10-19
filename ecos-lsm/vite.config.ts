import { defineConfig } from 'vite';

// Solo para la página demo (demo/). El módulo en sí se copia o importa desde src/.
export default defineConfig({
  root: 'demo',
  publicDir: '../public', // mediapipe/ (modelo + wasm) se sirve desde aquí
  base: './',
  server: { port: 5180 },
  build: { outDir: '../dist-demo', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0 },
});
