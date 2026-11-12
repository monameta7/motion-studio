# Third-party notices

This file lists what ships inside this package and what the installer downloads, with the licence of each part. It is written by the package build; the dependency table is read from the installed packages at build time.

## Inside the package

| Part | Where | Licence |
|---|---|---|
| AvaFarsi (Persian voice app) | `ava-farsi/avafarsi/` | Apache-2.0 (`ava-farsi/avafarsi/LICENSE`); shipped with its author's permission |
| Vazirmatn font | `app/brandcore/defaults/fonts/Vazirmatn[wght].woff2` | SIL Open Font License 1.1 (`OFL-Vazirmatn.txt` next to it) |
| Inter font | `app/brandcore/defaults/fonts/Inter[wght].woff2` | SIL Open Font License 1.1 (`OFL-Inter.txt` next to it) |
| Starter reference library (31 references) | `starter/refs/` | A short low-resolution preview, a thumbnail and a written analysis of each reference motion video. The full videos are not included. The videos belong to their makers; they are here only as style references. |
| Skills (`hook`, `truth`, `motion-plan`, `motion-build`, `brand-build`) | `runtime/.claude/skills/` | Written by the app's owner; shipped with the app |

## Downloaded by the installer (not inside the package)

| Tool | From | Licence |
|---|---|---|
| Node.js 22 | winget `OpenJS.NodeJS.22` | MIT and others (nodejs.org) |
| Python 3.12 | winget `Python.Python.3.12` | PSF License |
| ffmpeg | winget `Gyan.FFmpeg` | GPL build by gyan.dev (ffmpeg.org/legal.html) |
| Git | winget `Git.Git` | GPL-2.0 |
| Microsoft Visual C++ runtime | winget `Microsoft.VCRedist.2015+.x64` | Microsoft Software License Terms |
| Claude Code | `https://claude.ai/install.ps1` | Anthropic's terms; needs your own Claude subscription |
| Chromium (render engine) | Playwright download | BSD-3-Clause and others |
| numpy, scipy, faster-whisper | pip | BSD-3-Clause, BSD-3-Clause, MIT |
| Whisper `small` speech model | Hugging Face, on the first film | MIT |

## npm packages (installed by `npm ci`)

Only the packages named in the three `package.json` files are listed; each brings its own dependencies with their own licences (see `node_modules/<name>/LICENSE` after install).

| Package | Used by | Version | Licence |
|---|---|---|---|
| @eslint/js | app | 10.0.1 | MIT |
| @fastify/multipart | app | 10.1.6 | MIT |
| @fastify/static | app | 10.1.8 | MIT |
| @types/better-sqlite3 | app | 9.6.0 | MIT |
| @types/node | app | 24.19.2 | MIT |
| @types/react | app | 19.3.0 | MIT |
| @types/react-dom | app | 19.3.0 | MIT |
| @vitejs/plugin-react | app | 6.1.2 | MIT |
| better-sqlite3 | app | 13.0.3 | MIT |
| eslint | app | 10.13.0 | MIT |
| fastify | app | 5.12.7 | MIT |
| node-notifier | app | 12.1.0 | MIT |
| react | app | 19.3.1 | MIT |
| react-dom | app | 19.3.1 | MIT |
| tsx | app | 4.23.15 | MIT |
| typescript | app | 6.0.3 | Apache-2.0 |
| typescript-eslint | app | 8.72.0 | MIT |
| vite | app | 8.3.5 | MIT |
| vitest | app | 5.0.5 | MIT |
| zod | app | 4.6.7 | MIT |
| playwright | render engine | 1.56.0 | Apache-2.0 |
| three | render engine | 0.170.0 | MIT |
| @breezystack/lamejs | ava-farsi | 1.2.7 | LGPL-3.0 |
| @google/genai | ava-farsi | 2.30.0 | Apache-2.0 |
| @tailwindcss/vite | ava-farsi | 4.3.3 | MIT |
| @types/express | ava-farsi | 4.17.25 | MIT |
| @types/node | ava-farsi | 22.20.5 | MIT |
| @types/qrcode | ava-farsi | 1.5.6 | MIT |
| @types/react | ava-farsi | 19.3.0 | MIT |
| @types/react-dom | ava-farsi | 19.3.0 | MIT |
| @vitejs/plugin-react | ava-farsi | 6.1.2 | MIT |
| autoprefixer | ava-farsi | 10.6.1 | MIT |
| dotenv | ava-farsi | 17.4.2 | BSD-2-Clause |
| esbuild | ava-farsi | 0.25.12 | MIT |
| express | ava-farsi | 4.22.3 | MIT |
| lucide-react | ava-farsi | 0.546.0 | ISC |
| motion | ava-farsi | 12.43.0 | MIT |
| qrcode | ava-farsi | 1.5.4 | MIT |
| react | ava-farsi | 19.3.1 | MIT |
| react-dom | ava-farsi | 19.3.1 | MIT |
| tailwindcss | ava-farsi | 4.3.3 | MIT |
| tsx | ava-farsi | 4.23.15 | MIT |
| typescript | ava-farsi | 7.0.2 | Apache-2.0 |
| vite | ava-farsi | 8.3.5 | MIT |
| vite-plugin-pwa | ava-farsi | 2.0.0 | MIT |
