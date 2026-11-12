// Responsibility: tells TypeScript about the two things vite.config.ts builds in: the '@ui-font' stylesheet (font-owner.css or font-free.css) and the app's names (the owner's PC, or the package for other users).
declare module '@ui-font';
declare const __APP_NAMES__: { title: string; short: string; welcome: string };
