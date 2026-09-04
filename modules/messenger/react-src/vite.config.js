import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Собираем прямо в ../ (modules/messenger/) под именами messenger.js + messenger.css — ровно те,
// которые core/shell.js и так забирает у каждого модуля. Оболочку менять не
// нужно: она не знает и не должна знать, что этот модуль на React.
export default defineConfig({
  plugins: [react()],
  // В IIFE-сборке Vite не подставляет process.env.NODE_ENV сам, а React его
  // читает. В браузере глобального process нет — без этой замены бандл падает
  // с ReferenceError на первой же строке и модуль остаётся пустым.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: resolve(__dirname, '..'),
    emptyOutDir: false, // рядом лежат manifest.json — не стирать
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.jsx'),
      formats: ['iife'],
      name: 'MessengerApp',
      fileName: () => 'messenger.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (info) => (info.name && info.name.endsWith('.css') ? 'messenger.css' : 'assets/[name][extname]'),
      },
    },
  },
});
