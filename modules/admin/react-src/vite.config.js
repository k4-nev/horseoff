import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Builds straight into ../ (modules/admin/) as admin.js + admin.css — the
// exact filenames core/shell.js already fetches for every module. Shell.js
// itself needs zero changes; it doesn't know or care that this one is React.
export default defineConfig({
  plugins: [react()],
  // Library-mode IIFE builds don't get Vite's usual process.env.NODE_ENV
  // replacement for free — React reads it internally, and browsers have no
  // global `process` at all, so leaving it in causes a ReferenceError the
  // instant the bundle runs (blank module, script dies before any render).
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: resolve(__dirname, '..'),
    emptyOutDir: false, // never wipe manifest.json sitting next to it
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.jsx'),
      formats: ['iife'],
      name: 'AdminApp',
      fileName: () => 'admin.js',
    },
    rollupOptions: {
      output: {
        // Force the single CSS asset to be named admin.css instead of Vite's
        // default style.css / <libname>.css guess.
        assetFileNames: (info) => (info.name && info.name.endsWith('.css') ? 'admin.css' : 'assets/[name][extname]'),
      },
    },
  },
});
