import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/* Собирается прямо в core/ как shell.ui.js + shell.ui.css — их подключает
   core/shell.html обычными тегами, никакого бандлера в рантайме нет.
   emptyOutDir выключен: рядом лежат shell.js, shell.css и shell.html. */
export default defineConfig({
  plugins: [react()],
  define: {
    // В IIFE-сборке Vite не подставляет NODE_ENV сам, а React его читает.
    // В браузере глобального process нет — без этого бандл падает сразу.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: resolve(__dirname, '..'),
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.jsx'),
      formats: ['iife'],
      name: 'ShellUI',
      fileName: () => 'shell.ui.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (info) => (info.name && info.name.endsWith('.css') ? 'shell.ui.css' : 'assets/[name][extname]'),
      },
    },
  },
});
