// Responsibility: turn plan/scene-plan.json into the plain-text storyboard table the owner reads at the approval gate (docs/03 S5b).
import { ScenePlan } from '../../contracts/index.js';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const sec = (n: number) => n.toFixed(1);

export function storyboardTable(plan: ScenePlan): string {
  const rows = plan.scenes.map((s) => `${String(s.id).padStart(2)} | ${sec(s.start).padStart(5)}–${sec(s.end).padEnd(5)} | ${s.beat.padEnd(8)} | ${s.component.padEnd(9)} | ${clip(s.picture, 48).padEnd(48)} | ${clip(s.texts.map((t) => t.text).join(' / '), 40)}`);
  const head = ` # | زمان (s)    | beat     | component | picture${' '.repeat(41)} | texts`;
  const sound = `music ${plan.sound.music.bpm} bpm, ${plan.sound.cues.length} cues`;
  return [
    `${plan.slug}: ${plan.mode}, ${plan.format.w}x${plan.format.h}@${plan.format.fps}, ${sec(plan.duration)} s + outro ${sec(plan.outro.duration)} s = ${sec(plan.total_duration)} s; reference ${plan.reference.slug}; ${sound}`,
    head, ...rows,
    ...(plan.risks.length ? ['risks:', ...plan.risks.map((r) => `  - ${r}`)] : []),
  ].join('\n');
}
