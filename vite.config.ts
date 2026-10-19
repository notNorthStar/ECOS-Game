import { defineConfig } from 'vite';

// base './' → rutas relativas: sirve igual en itch.io y en Electron (AGENTS.md §7).
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
