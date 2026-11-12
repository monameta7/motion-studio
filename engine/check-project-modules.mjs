// Syntax/import check for every project module (DOM not touched at import time).
const base = new URL('../jobs/2026-10-23_sh-kari-kh-ik-ai-agent-mi-tvan/project/', import.meta.url).href;
const mods = ['core.js', 'data.js', 'components.js', 'world.js', 'table.js',
  'scenes/s01.js', 'scenes/s02.js', 'scenes/s03.js', 'scenes/s04.js', 'scenes/s05.js',
  'scenes/s06.js', 'scenes/s07.js', 'scenes/s08.js', 'scenes/s09.js', 'scenes/s10.js',
  'scenes/s11.js', 'scenes/s12.js', 'scenes/s13.js', 'scenes/s14.js', 'scenes/s15.js',
  'scenes/s16.js', 'scenes/s17.js', 'scenes/s18.js'];
let fails = 0;
for (const m of mods) {
  try { await import(base + m); console.log('OK  ', m); }
  catch (e) { fails++; console.log('FAIL', m, '->', String(e && e.message || e).slice(0, 300)); }
}
process.exit(fails ? 1 : 0);
