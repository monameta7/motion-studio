// Restore quotes around scene import specifiers.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(import.meta.dirname, '../jobs/2026-10-23_sh-kari-kh-ik-ai-agent-mi-tvan/project/scenes');
for (const f of fs.readdirSync(dir)) {
  if (!/^s\d+\.js$/.test(f)) continue;
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, 'utf8');
  const next = s.replace(/from \.\.\/(core|components|world|data)\.js;/g, "from '../$1.js';");
  if (next !== s) { fs.writeFileSync(p, next); console.log('fixed', f); }
}
