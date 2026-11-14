// Responsibility: check the product screens of a built project page (D84): at each state's time its texts are visible and inside the frame, at each click the cursor tip is on its target; saves stills and element crops.
// node ui-verify.mjs <project/index.html> <checks.json> <outDir> <result.json>
// Page contract (motion-build §3): [data-ui-screen="<id>"] roots, [data-ui-el="<name>"] elements, one [data-ui-cursor] whose top-left corner is the pointer tip.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const [,, html, checksFile, outDir, resultFile] = process.argv;
const checks = JSON.parse(fs.readFileSync(checksFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: checks.w, height: checks.h }, deviceScaleFactor: 1 });
const page_errors = [];
p.on('pageerror', (e) => page_errors.push(String(e)));
await p.goto(pathToFileURL(path.resolve(html)).href);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const seek = (t) => p.evaluate((x) => window.__seek(x), t);

// Runs in the page: the visible text of one screen (hidden and fully transparent parts left out), with and without spaces between nodes;
// `in*` holds only text lying fully inside the frame (2 px tolerance), `all*` also text cut by or outside the frame edge.
const readScreen = (id) => p.evaluate((sid) => {
  const root = document.querySelector(`[data-ui-screen="${CSS.escape(sid)}"]`);
  if (!root) return null;
  const shown = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  if (!shown(root)) return { visible: false, inJoined: '', inSpaced: '', allJoined: '', allSpaced: '' };
  const W = window.innerWidth, H = window.innerHeight, T = 2;
  const inside = (n) => {
    const range = document.createRange();
    range.selectNodeContents(n);
    return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
      .every((r) => r.left >= -T && r.top >= -T && r.right <= W + T && r.bottom <= H + T);
  };
  const all = [], kept = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('script,style') || !shown(el) || !n.textContent.trim()) continue;
    all.push(n.textContent);
    if (inside(n)) kept.push(n.textContent);
  }
  return { visible: true, inJoined: kept.join(''), inSpaced: kept.join(' '), allJoined: all.join(''), allSpaced: all.join(' ') };
}, id);
const norm = (s) => s.normalize('NFC').replace(/[‌‎‏]/g, '').replace(/\s+/g, ' ').trim();
const boxOf = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, sel);

const screens = [];
for (const sc of checks.screens) {
  const out = { id: sc.id, states: [], clicks: [], elements: [] };
  for (const st of sc.states) {
    await seek(st.at);
    const read = await readScreen(sc.id);
    const still = `${sc.id}-${st.id}.png`;
    await p.screenshot({ path: path.join(outDir, still) });
    const has = (hay, t) => hay.some((h) => h.includes(norm(t)));
    const inFrame = read?.visible ? [norm(read.inJoined), norm(read.inSpaced)] : [];
    const anywhere = read?.visible ? [norm(read.allJoined), norm(read.allSpaced)] : [];
    const notIn = st.texts.filter((t) => !has(inFrame, t));
    out.states.push({ id: st.id, at: st.at, found: Boolean(read?.visible), missing: notIn.filter((t) => !has(anywhere, t)), cut: notIn.filter((t) => has(anywhere, t)), still });
  }
  for (const c of sc.clicks) {
    await seek(c.at);
    const cur = await boxOf('[data-ui-cursor]');
    const tb = await boxOf(`[data-ui-screen="${sc.id}"] [data-ui-el="${c.target}"]`);
    const tip = cur ? [cur[0], cur[1]] : null;
    const on = Boolean(tip && tb && tip[0] >= tb[0] - 2 && tip[0] <= tb[0] + tb[2] + 2 && tip[1] >= tb[1] - 2 && tip[1] <= tb[1] + tb[3] + 2);
    out.clicks.push({ id: c.id, at: c.at, target: c.target, cursor: tip, target_box: tb, on_target: on });
  }
  for (const el of sc.elements) {
    await seek(el.at);
    const loc = p.locator(`[data-ui-screen="${sc.id}"] [data-ui-el="${el.name}"]`).first();
    const file = `${sc.id}-el-${el.name.replace(/[^\w-]/g, '_')}.png`;
    let ok = false;
    try { if (await loc.count()) { await loc.screenshot({ path: path.join(outDir, file), timeout: 5000 }); ok = true; } } catch { ok = false; }
    out.elements.push({ name: el.name, file: ok ? file : null });
  }
  screens.push(out);
}
await b.close();
fs.writeFileSync(resultFile, `${JSON.stringify({ page_errors, screens }, null, 1)}\n`);
console.log(JSON.stringify({ screens: screens.length, page_errors: page_errors.length }));
