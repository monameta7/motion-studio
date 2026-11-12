// Responsibility: build settings for the UI: React, output in app/ui/dist for the server, /api forwarded to the server during development, and which UI font and app name are built in (the owner's PC, or the package for other users).
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = import.meta.dirname;
const ownerCss = path.join(here, 'src', 'font-owner.css');
const ownerFont = path.join(here, '..', '..', 'brand', 'mahdiyar', 'fonts', 'YekanBakhFaNum-Regular.woff2');
/**
 * Q22 (docs/14): the shipped UI is set in free Vazirmatn; Yekan Bakh is used only where the owner's font files are (the owner's PC).
 * MMS_UI_FONT=free forces the package build (scripts/package/build-package.mjs).
 */
const ownerBuild = process.env.MMS_UI_FONT !== 'free' && fs.existsSync(ownerCss) && fs.existsSync(ownerFont);
/** D81: the package for other users is called «استودیو محتوا»; the owner's own app keeps its name. */
const names = ownerBuild
  ? { title: 'استودیو موشن مهدیار', short: 'استودیو موشن', welcome: 'به استودیوی موشن خوش آمدی' }
  : { title: 'استودیو محتوا', short: 'استودیو محتوا', welcome: 'به استودیوی محتوا خوش آمدی' };

export default defineConfig({
  root: here,
  plugins: [react(), { name: 'app-name-title', transformIndexHtml: (html: string) => html.replace(/<title>[^<]*<\/title>/, `<title>${names.title}</title>`) }],
  define: { __APP_NAMES__: JSON.stringify(names) },
  resolve: { alias: { '@ui-font': ownerBuild ? ownerCss : path.join(here, 'src', 'font-free.css') } },
  build: { outDir: process.env.MMS_UI_OUT || 'dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4600' } },
});
