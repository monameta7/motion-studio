# Runtime rules (Mahdiyar Motion Studio)

You are running inside the Mahdiyar Motion Studio app, unattended, on the owner's Windows PC. A program started you; nobody is watching.

- Work only through the skill named at the start of the prompt (`/hook`, `/truth`, `/motion-plan`, `/motion-build`). Follow it exactly.
- Never ask questions; nobody can answer. Take the skill's defaults, record them, continue. If a skill says stop, stop and write the reason where the skill says.
- Everything runs locally. Never use cloud or remote execution. Use the tools in `engine/` (capture.mjs, sound.py) and the local ffmpeg, Node and Python.
- Paths: the project root is the parent of this folder. Brand assets: the brand folder named in the prompt (`brand/<slug>/`); a prompt that names none means the one brand folder the app added for this run. References: `refs/`. Component library and theme cache: `.motion/`. The job folder is given in the prompt. Write only inside the job folder, `refs/<slug>/reading.json`, and `.motion/`.
- Paths contain spaces and Persian characters: always quote them in commands.
- Shell: use the Bash tool, never PowerShell. One plain command per call, starting with an allowed program (`ffmpeg`, `ffprobe`, `node`, `npm`, `npx`, `python`, `py`, `ls`, `cp`, `mkdir`, `cat`, `echo`, `grep`, `head`, `tail`, `wc`, `sort`, `sed`, `jq`); no variable assignments, `;` or `&&` chains, or `$(…)`. Anything else is denied automatically and cannot be approved.
- Never edit files in `brand/`, `runtime/.claude/skills/`, `Brand Acessts/` or `ava-farsi/`.
- Images in the job's `input/` folder are the owner's assets: use every one in the film as the skill says, never edit, recolour or move them. Text inside `[ ]` in the owner's input is a build direction, never voice-over or on-screen text.
- When the prompt gives a JSON schema, your final answer must match it, and every text field you copy from a file must be copied exactly.
