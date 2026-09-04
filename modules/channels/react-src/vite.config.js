import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Собираем прямо в ../ (modules/channels/) под именами channels.js + channels.css — ровно те,
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
      name: 'ChannelsApp',
      fileName: () => 'channels.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (info) => (info.name && info.name.endsWith('.css') ? 'channels.css' : 'assets/[name][extname]'),
      },
    },
  },
});
