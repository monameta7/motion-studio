// Responsibility: give an installed copy the user-owned files it needs (config, lexicon, starter library, empty brand/jobs folders) from starter/, never overwriting a file the user already has; on update it only adds config keys a newer version brought.
// Usage: node scripts/user-files.mjs [--root <install-dir>]
// Safe to run again. It never deletes or replaces anything in brand/, jobs/, data/ or refs/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The user's config with the keys a newer package added. The user's own values always win; arrays and plain values are never merged.
 * `claude.recommended` is the package's advice (shown next to the user's choice in Settings), so it follows the package.
 */
export function mergeConfig(user, starter) {
  const added = [];
  const walk = (u, s, trail) => {
    for (const [k, v] of Object.entries(s)) {
      const here = [...trail, k].join('.');
      if (!(k in u)) { u[k] = structuredClone(v); added.push(here); } else if (isObject(u[k]) && isObject(v)) walk(u[k], v, [...trail, k]);
    }
  };
  const next = structuredClone(user);
  walk(next, starter, []);
  if (isObject(next.claude) && isObject(starter.claude) && starter.claude.recommended !== undefined
    && JSON.stringify(next.claude.recommended) !== JSON.stringify(starter.claude.recommended)) {
    next.claude.recommended = structuredClone(starter.claude.recommended);
    added.push('claude.recommended (package advice)');
  }
  return { config: next, added };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

export function ensureUserFiles(root) {
  const done = [];
  const starter = path.join(root, 'starter');
  if (!fs.existsSync(starter)) throw new Error(`no starter folder in ${root}; this is not an installed package`);

  // Config: a first install gets the starter file; later only missing keys are added (the file is rewritten only when something was added).
  const cfg = path.join(root, 'config', 'app.config.json');
  const cfgStarter = path.join(starter, 'config', 'app.config.json');
  if (!fs.existsSync(cfg)) {
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.copyFileSync(cfgStarter, cfg);
    done.push('config/app.config.json created');
  } else {
    const { config, added } = mergeConfig(readJson(cfg), readJson(cfgStarter));
    if (added.length > 0) {
      const tmp = `${cfg}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
      fs.renameSync(tmp, cfg);
      done.push(`config/app.config.json: added ${added.join(', ')}`);
    }
  }

  // Lexicon: only when the user has none.
  const lex = path.join(root, 'data', 'lexicon.json');
  if (!fs.existsSync(lex)) {
    fs.mkdirSync(path.dirname(lex), { recursive: true });
    fs.copyFileSync(path.join(starter, 'lexicon.json'), lex);
    done.push('data/lexicon.json created');
  }

  // Starter library: only on a first install (no refs/ folder yet). An existing library, even an empty one, is the user's.
  const refs = path.join(root, 'refs');
  if (!fs.existsSync(refs)) {
    const from = path.join(starter, 'refs');
    const slugs = fs.existsSync(from) ? fs.readdirSync(from, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
    fs.mkdirSync(refs, { recursive: true });
    for (const slug of slugs) copyDir(path.join(from, slug), path.join(refs, slug));
    done.push(`refs/: ${slugs.length} starter reference(s) copied`);
  }

  for (const d of ['brand', 'jobs']) {
    if (!fs.existsSync(path.join(root, d))) { fs.mkdirSync(path.join(root, d), { recursive: true }); done.push(`${d}/ created`); }
  }
  return done;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--root');
  const root = path.resolve(i >= 0 ? process.argv[i + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  try {
    const done = ensureUserFiles(root);
    console.log(done.length ? done.map((d) => `[OK]   ${d}`).join('\n') : '[OK]   user files already in place');
  } catch (e) {
    console.error(`[FAIL] ${e.message}`);
    process.exit(1);
  }
}
