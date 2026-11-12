// Responsibility: build settings for the UI: React, output in app/ui/dist for the server, /api forwarded to the server during development, and which UI font file is built in.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = import.meta.dirname;
const ownerCss = path.join(here, 'src', 'font-owner.css');
const ownerFont = path.join(here, '..', '..', 'brand', 'mahdiyar', 'fonts', 'YekanBakhFaNum-Regular.woff2');
/**
 * Q22 (docs/14): the shipped UI is set in free Vazirmatn; Yekan Bakh is used only where the owner's font files are (the owner's PC).
 * MMS_UI_FONT=free forces the free font (the package build, scripts/package/build-package.mjs).
 */
const useOwnerFont = process.env.MMS_UI_FONT !== 'free' && fs.existsSync(ownerCss) && fs.existsSync(ownerFont);

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: { alias: { '@ui-font': useOwnerFont ? ownerCss : path.join(here, 'src', 'font-free.css') } },
  build: { outDir: process.env.MMS_UI_OUT || 'dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4600' } },
});
