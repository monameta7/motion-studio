// Responsibility: after the build, check the product screens of the plan (D84) on the built project page with engine/ui-verify.mjs (texts visible and inside the frame at each state, cursor on target at each click) and record logs/ui-qa.json.
import fs from 'node:fs';
import path from 'node:path';
import { UiChecks, UiQa, readJson, writeJson, type ScenePlan } from '../../contracts/index.js';
import type { Tool } from './verify.js';

export const uiQaPaths = (dir: string) => ({
  checks: path.join(dir, 'logs', 'ui-checks.json'), raw: path.join(dir, 'logs', 'ui-qa-raw.json'), qa: path.join(dir, 'logs', 'ui-qa.json'),
  stills: path.join(dir, 'out', 'ui-qa'), page: path.join(dir, 'project', 'index.html'),
});

/** What to check, taken from the plan: every state, every click, and every element that has a source box (seen at the screen's last state). */
export function uiChecksFromPlan(plan: ScenePlan): UiChecks {
  return {
    w: plan.format.w, h: plan.format.h,
    screens: (plan.ui_screens ?? []).map((u) => ({
      id: u.id,
      states: u.states.map((s) => ({ id: s.id, at: s.at, texts: s.texts })),
      clicks: u.actions.filter((a) => a.type === 'click').map((a) => ({ id: a.id, at: a.at, target: a.target })),
      elements: (u.elements ?? []).map((e) => ({ name: e.name, at: Math.max(...u.states.map((s) => s.at)) })),
    })),
  };
}

/** Writes logs/ui-checks.json before the build call, so motion-build can run the same check on its draft (none for a plan without screens). */
export function writeUiChecks(dir: string, plan: ScenePlan): boolean {
  if (!plan.ui_screens?.length) return false;
  writeJson(uiQaPaths(dir).checks, UiChecks, uiChecksFromPlan(plan));
  return true;
}

/** The problems a finished ui-verify result shows. Element likeness (SSIM) is recorded, never a problem: no threshold has been measured on a real film yet. */
export function judgeUi(qa: UiQa): string[] {
  const out = qa.page_errors.map((e) => `the project page threw an error during the ui check: ${e.slice(0, 200)}`);
  for (const sc of qa.screens) {
    for (const st of sc.states) {
      if (!st.found) out.push(`ui screen ${sc.id} is not visible at ${st.at} s (state ${st.id}); its root needs data-ui-screen="${sc.id}"`);
      else {
        for (const t of st.missing) out.push(`ui screen ${sc.id} state ${st.id} at ${st.at} s does not show the text «${t}»`);
        for (const t of st.cut) out.push(`ui screen ${sc.id} state ${st.id} at ${st.at} s: the text «${t}» is cut by the frame edge; frame the region so it is fully inside, or leave it out of the state`);
      }
    }
    for (const c of sc.clicks) {
      if (!c.cursor) out.push(`ui screen ${sc.id} click ${c.id}: no [data-ui-cursor] element at ${c.at} s`);
      else if (!c.target_box) out.push(`ui screen ${sc.id} click ${c.id}: target [data-ui-el="${c.target}"] not found at ${c.at} s`);
      else if (!c.on_target) out.push(`ui screen ${sc.id} click ${c.id} at ${c.at} s: the cursor tip (${c.cursor.map(Math.round).join(', ')}) is not on «${c.target}»`);
    }
  }
  return out;
}

const ssimOf = (stderr: string): number | null => { const m = /All:([\d.]+)/.exec(stderr); return m ? Number(m[1]) : null; };

/** Runs the check when the plan has product screens; returns the problems (none when the plan has no screen). */
export async function verifyUi(dir: string, plan: ScenePlan, engineDir: string, run: Tool): Promise<string[]> {
  if (!plan.ui_screens?.length) return [];
  const p = uiQaPaths(dir);
  if (!fs.existsSync(p.page)) return ['project/index.html was not written; the ui screens cannot be checked'];
  writeUiChecks(dir, plan);
  fs.rmSync(p.raw, { force: true });
  const r = await run('node', [path.join(engineDir, 'ui-verify.mjs'), p.page, p.checks, p.stills, p.raw], { cwd: engineDir, timeoutMs: 10 * 60000 });
  if (r.code !== 0 || !fs.existsSync(p.raw)) return [`ui-verify.mjs failed: ${(r.stderr || r.error || '').slice(-400)}`];
  let qa: UiQa;
  try { qa = readJson(p.raw, UiQa); } catch (e) { return [`ui-verify.mjs wrote an invalid result: ${(e as Error).message}`]; }
  // Likeness of each built element to its part of the source image (report only).
  for (const sc of qa.screens) {
    const u = plan.ui_screens.find((x) => x.id === sc.id);
    const source = u?.asset ? (path.isAbsolute(u.asset) ? u.asset : path.join(dir, ...u.asset.replace(/\\/g, '/').split('/').slice(-2))) : null;
    for (const el of sc.elements) {
      const box = u?.elements?.find((e) => e.name === el.name)?.source_box;
      if (!el.file || !box || !source || !fs.existsSync(source)) { el.ssim = null; continue; }
      const [x, y, w, h] = box.map(Math.round);
      const f = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(p.stills, el.file), '-i', source, '-lavfi', `[1]crop=${w}:${h}:${x}:${y}[c];[0][c]scale2ref[e][c2];[e][c2]ssim`, '-f', 'null', '-'], { timeoutMs: 60000 });
      el.ssim = f.code === 0 ? ssimOf(f.stderr) : null;
    }
  }
  qa.problems = judgeUi(qa);
  writeJson(p.qa, UiQa, qa);
  return qa.problems;
}
