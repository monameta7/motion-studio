---
name: "motion-build"
description: "Build and render a motion-plan scene-plan.json into a finished, voice-synced MP4 entirely in code (HTML, headless Chromium, ffmpeg), styled from the project's brand resources."
---

# Motion build

Executes `scene-plan.json` from motion-plan: builds every scene in code, renders frame-exact with headless Chromium, builds music and sound effects in code, mixes them with the voice in ffmpeg, runs QA and delivers one finished MP4 and a code-built cover. No video model. Runs on Windows, macOS and Linux.

Brand-agnostic: every identity value (colours, fonts, logo, outro) comes from `brand-profile.json`. Motion language (camera, transitions, durations, easing, rhythm, layout) comes from the plan, which takes it from the reference; where the plan states it, it beats the brand's motion defaults. Content comes only from the plan: never invent text, numbers or claims.

**The look comes from the plan's `style_lock` and the reference (D55):** dimensionality, light, shadow, depth, materials and background are built as the reference has them. A 3D reference is built as real 3D (three.js with lights, shadows, perspective camera and depth-of-field blur; install it locally next to playwright: `npm i three`, copy `three.module.js` into `project/lib/` and load it by relative path, no CDN; headless WebGL works via the engine's `--enable-unsafe-swiftshader`), never as flat shapes. The brand's "no 3D / no shadow / flat" notes never limit a film with a reference. Reusable components in `.motion/<brand>/components/` are used only when they match that look; otherwise write a new one.

Runs unattended: no waiting, except the gate in §6. Paths are relative to the project root; times are absolute seconds on the film timeline.

## Inputs

`jobs/<slug>/plan/`: `scene-plan.json` (must have `status: ready`), `audio.json`, `voice.wav`, `brand-profile.json`; font, logo and asset files those reference. Config: `gates.storyboard_stills` (false), `workers` (4).

## 0. Environment

Once per machine; install what is missing:

- Node 20+, `ffmpeg` and `ffprobe` 6 or newer on PATH; Python 3 with `numpy` and `scipy` (`pip install numpy scipy`) for §9b.
- In the job's engine folder: `npm i playwright` and `npx playwright install chromium`. Install locally: ES modules ignore `NODE_PATH`, so a global install is not found.

## 1. Theme

From `brand-profile.json`, write `theme.json` and `theme.css` (CSS variables):

- Colour roles; `banned_colors` never used.
- Local `@font-face` for every font file; fallback Google Fonts: Vazirmatn (Persian), Inter (Latin).
- Type scale per format, and one style per text role (`hook`, `key`, `stat`, `label`, `cta`): size, weight, colour role, backing (none or a panel).
- Spacing unit, radii, strokes, shadows from `shape` (neutral defaults when null) only when the plan has no reference look; with a reference, light, shadow and materials follow `style_lock`.
- Easing set and base durations from `motion_personality` (calm: longer and softer; energetic: shorter and sharper). These are defaults only: a scene's `action`, `camera`, `transition_out` and props that give durations or easing (taken from the reference) override them.

Validate before building:

- Contrast ≥4.5:1 for body text and text on accent; 3:1 only for large bold text and essential graphics.
- Minimum sizes, 9:16 at 1080 px wide: hook ≥72 px, body ≥44 px, labels ≥32 px, nothing <28 px, weight ≥500. 16:9 at 1920 px: hook ≥64 px, labels ≥28 px.

Cache in `.motion/<brand>/theme.json` with the SHA-256 of `brand-profile.json`; rebuild when the hash changes.

## 2. Component library (reuse first)

The main speed lever. Brand components: `.motion/<brand>/components/`; brand-neutral: `.motion/shared/components/`.

Each component is one ES module:

```js
export const meta = { name: 'stat', props: { value: 'string', label: 'string' } };
export function build(root, props, theme) { /* create DOM once */ }
export function update(lt, props, theme, scene) { /* lt = t - scene.start, seconds */ }
```

For each scene, load the component named in `component` (brand folder first, then shared) and pass `props`. Write a new component only when none fits or `component` is `custom`. A `character` scene draws the person from `scene-plan.cast` by its id: build each cast member once as a vector module (`project/cast/<id>.js`) and reuse it in every scene, so the look never drifts. After delivery, save each new reusable component to the brand folder with `meta.props` documented.

## 3. Engine contract

One `index.html` plus `scenes/*.js` in `jobs/<slug>/project/`.

- `window.__comp = { width, height, fps, duration }` from the plan.
- `window.__ready = true` only after `document.fonts.load()` resolved for every face and weight, images decoded, and every scene's `build()` ran.
- `window.__seek = async (t) => {...}` draws exactly time t: picks active scenes, calls `update(t - scene.start, …)`, applies transitions.
- **Pure function of t.** No requestAnimationFrame clock, CSS transitions or animations, `Date.now`, unseeded `Math.random`. Use a seeded random.
- Measure layout in `build()` with the root visible; never measure `display:none` elements.
- One shared timeline read from the plan; changing a scene's duration shifts every later scene.
- Texts, colours and durations exposed as editable data at the top of the project.
- Scenes with `asset`: draw the file as a separate layer (video via frame-accurate seek on a muted `<video>`, awaiting `seeked`), above the background and below text.
- Owner assets (`scene-plan.owner_assets`, files in `jobs/<slug>/input/`): copy each into `project/assets/` and draw it in its scenes as the plan's `how` says; keep its aspect ratio (`object-fit: contain` unless the plan gives a crop that keeps the subject), never recolour, filter, distort or redraw it, and never let text cover it.

## 4. Motion grammar

- At an event the speed is never zero; at a cut it is at its maximum. Hide cuts inside the fastest moment.
- Direction survives the cut: flying into something, the next shot starts farther away (scale <1) and decelerates in.
- Overlap: start the next move at ≈0.45 of the current one, on a parent wrapper, so speeds add.
- Keep one thing continuous across each cut (the plan's `continuity`); hard-cut the rest.
- Nothing important appears or leaves by opacity alone: carry, grow, push, wipe, morph or cut.
- Strong curves only in transitions. Inside scenes: entrances 0.45–0.7 s, overshoot ≤2%, unless the scene's `motion_ref` gives other values (then use those).
- ≤3 flashes per second; a full white flash ≤2 frames.

| Transition | Recipe |
|---|---|
| needle-zoom | zoom in log space ×6–12, ease-in(4–5) into the cut; next scene from ×0.26–0.4, ease-out(3) |
| fly-through | dive into an object of scene A; scene B starts from a scaled-down view of that object's world |
| morph | size (not scale) +18% before the cut, −18% after; card to card, button to CTA |
| carry | an object leaves A and arrives in B at the same screen position and speed |
| wipe | a brand shape sweeps across at peak speed |
| match-shape | a shape in A becomes a shape in B at the same position |
| hard-cut | on the boundary, with motion running on both sides |

**`motion_ref` wins over this table.** When a scene has `motion_ref` (the reference's exact motion), `transition_out` only picks the family above; build the move, duration, easing and direction from `motion_ref.transition`, entrances from `motion_ref.entrances` and the camera from `motion_ref.camera`, including moves the brand avoids (bounce, spin, whip). Use the recipe values only where `motion_ref` is silent. QA checks the rendered transition against `motion_ref` (duration within one frame, same direction).

Text reveals start at each text's `in`; a word-by-word reveal follows the word times in `audio.json`.

## 5. Persian and RTL text

- `dir="rtl" lang="fa"` on every Persian container; the brand's Persian face, fallback Vazirmatn.
- Persian digits: map 0–9 to ۰–۹ on the string (`toLocaleString('fa-IR')` only for real numbers, and it adds grouping).
- Never split joined letters into separate elements and never apply `letter-spacing` to Persian: both break letter joining. Animate whole words or lines with masks, clips and transforms. Tracking effects are for Latin text only.
- Latin words inside Persian lines: wrap in `<bdi>`.
- Text containers fit their copy; check line breaks at the real font size.

## 6. Storyboard stills gate

`gates.storyboard_stills: true`: render each scene's hold pose (midpoint of its longest text, else scene midpoint), tile them into one contact sheet with scene ids and times, write `status: awaiting_review` to `jobs/<slug>/out/qa.md`, stop. Running again resumes at §7. Default false.

## 7. Capture

`capture.mjs` (in the engine folder, next to its local `node_modules`):

```js
// node capture.mjs <index.html> <outDir> <w> <h> <fps> <tStart> <tEnd> [jpeg|png]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const [,, html, out, w, h, fpsS, t0S, t1S, fmt = 'jpeg'] = process.argv;
const fps = Number(fpsS), t0 = Number(t0S), t1 = Number(t1S);
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(pathToFileURL(html).href);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
for (let f = Math.round(t0 * fps); f < Math.round(t1 * fps); f++) {
  await p.evaluate(t => window.__seek(t), f / fps);
  const path = `${out}/${String(f).padStart(6, '0')}.${fmt === 'png' ? 'png' : 'jpg'}`;
  await p.screenshot(fmt === 'png' ? { path } : { path, type: 'jpeg', quality: 92 });
}
await b.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
```

- The viewport is set before loading, so `build()` measures at the real size.
- Any page error fails the run; fix it before continuing.
- Parallel: split `[0, duration)` into `workers` windows, one process each. Frame numbers are absolute, so windows write into one folder without clashes.
- Before encoding, confirm the folder has exactly `round(duration × fps)` frames; re-render missing windows.

## 8. Draft and QA

Draft: JPEG frames at the real size, no motion blur, then
`ffmpeg -framerate FPS -i frames/%06d.jpg -vf scale=iw/2:-2 -c:v libx264 -pix_fmt yuv420p -crf 26 draft_v.mp4`.

Checks (all automated):

1. Frame count, duration and fps equal the plan (`ffprobe -count_frames`).
2. Every cut is at its scene's `end` (the plan's line or word boundary) within 1 frame.
3. Text, read from the DOM with `page.evaluate` at each text's hold midpoint: computed font size ≥ the theme minimum; bounding box inside every `safe_zone` region from the plan and inside the frame (no clipping or overflow); contrast measured against background pixels sampled from the frame under the text box.
4. Freezes: `ffmpeg -vf freezedetect=n=0.003:d=0.6` reports nothing outside planned holds.
5. Flashes: mean luminance per frame; no more than 3 jumps above 0.4 within any second.
6. Visual review: one contact sheet of stills at each cut (−1, 0, +1 frame) and one of each text hold midpoint (`ffmpeg ... tile`), looked at once. Check Persian joining, word order, Persian digits, missing glyph boxes, logo placement, colours inside the theme.

Fix, re-render only the windows that changed, re-run only the checks they affect. At most 3 rounds; then deliver and list remaining flaws in `qa.md`.

## 9. Final render

1. Frames at full size. Motion blur from sub-frames: capture at `fps × 4` (×12 inside transition windows of ±0.25 s around fast cuts), then `ffmpeg -framerate FPS×N -start_number S -i sub/%06d.jpg -vf "tmix=frames=N,framestep=N" -r FPS` per window, and concatenate the windows in order.
2. Encode video: `-vf "scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p" -c:v libx264 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -crf 18 -preset slow`. The JPEG frames are full-range BT.601; the delivered film is limited-range BT.709 and tagged, so the outro (§9c) can join it in the same colour range.
3. Outro (§9c): append the brand outro clip to the silent video.
4. Sound (§9b): render `music.wav` and `sfx.wav` over `total_duration`, then mix them with the voice (and the outro's own audio) in one pass.
5. Verify `final.mp4`: `ffprobe` duration equals `total_duration` within 1 frame, one video and one audio stream; `ffmpeg -af ebur128 -f null -` reports integrated loudness −14 ±1 LUFS and true peak ≤ −1.5 dBTP (§9b).

## 9b. Music and sound effects

Built in code, deterministic from `sound.seed`, no samples or downloads. `sound.py` (numpy + scipy) in the engine folder; run with `scene-plan.json`'s `sound` object plus `duration` saved as `sound.json`:

```python
"""sound.py <sound.json> <outdir> : deterministic music bed + SFX, 48 kHz stereo WAV (numpy + scipy only)."""
import json, sys, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
cfg = json.load(open(sys.argv[1])); out = sys.argv[2]
rng = np.random.default_rng(cfg.get("seed", 7))
dur = cfg["duration"]; n = int(dur * SR); t = np.arange(n) / SR

def env(length, a=0.01, r=0.2):
    k = np.arange(length) / SR
    return np.minimum(1, k / max(a, 1e-4)) * np.exp(-k / max(r, 1e-4))

def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], btype="band", fs=SR, output="sos"), x)

def note(f):  # midi -> Hz
    return 440 * 2 ** ((f - 69) / 12)

# ---- music bed: pad chords + soft pulse on the beat ----
bpm = cfg["music"]["bpm"]; beat = 60 / bpm
root = cfg["music"]["root_midi"]
prog = cfg["music"]["progression"]  # semitone offsets of chord roots, one chord per bar
minor = cfg["music"]["minor"]
music = np.zeros(n)
bar = 4 * beat
XF = 0.3  # crossfade between chords, seconds: no clicks at bar lines
for i in range(int(np.ceil(dur / bar))):
    s = int(i * bar * SR)
    if s >= n: break
    e = min(n, int(((i + 1) * bar + XF) * SR))
    seg = t[s:e] - t[s]
    span = seg[-1] if len(seg) else 0
    shape = np.minimum(1, seg / XF) * np.minimum(1, (span - seg) / XF) if i else np.minimum(1, (span - seg) / XF)
    r = root + prog[i % len(prog)]
    for iv in (0, 3 if minor else 4, 7, 12):
        f = note(r + iv)
        music[s:e] += 0.08 * np.sin(2 * np.pi * f * seg) * shape
    # pulse
    for b in range(4):
        ps = s + int(b * beat * SR)
        if ps >= e: break
        L = min(int(0.25 * SR), n - ps)
        k = np.arange(L) / SR
        music[ps:ps + L] += 0.12 * np.sin(2 * np.pi * note(r - 12) * k) * env(L, 0.005, 0.12)
fade = int(1.0 * SR)
music[:fade] *= np.linspace(0, 1, fade); music[-fade:] *= np.linspace(1, 0, fade)

# ---- SFX library ----
def whoosh(L):
    x = rng.standard_normal(L); k = np.arange(L) / L
    lo = bp(x, 300, 1200) * (1 - k); hi = bp(x, 1500, 6000) * k
    return 0.5 * (lo + hi) * np.sin(np.pi * k) ** 2
def pop(L):
    k = np.arange(L) / SR
    return 0.6 * np.sin(2 * np.pi * (900 - 500 * k / k[-1]) * k) * env(L, 0.002, 0.04)
def click(L):
    return 0.5 * bp(rng.standard_normal(L), 2000, 8000) * env(L, 0.0005, 0.01)
def riser(L):
    k = np.arange(L) / SR
    return 0.3 * bp(rng.standard_normal(L), 800, 5000) * (k / k[-1]) ** 2
def impact(L):
    k = np.arange(L) / SR
    return 0.8 * np.sin(2 * np.pi * 55 * k) * env(L, 0.002, 0.35) + 0.2 * bp(rng.standard_normal(L), 100, 900) * env(L, 0.001, 0.08)
LIB = {"whoosh": (whoosh, 0.45), "pop": (pop, 0.12), "click": (click, 0.05), "riser": (riser, 0.8), "impact": (impact, 0.7)}

sfx = np.zeros(n)
for c in cfg["cues"]:
    fn, length = LIB[c["type"]]
    L = int(length * SR)
    # whoosh and riser peak at the cue time; others start on it
    start = int(c["at"] * SR) - (L // 2 if c["type"] == "whoosh" else L if c["type"] == "riser" else 0)
    start = max(0, start); L = min(L, n - start)
    if L > 0: sfx[start:start + L] += fn(L) * c.get("gain", 1.0)

def save(name, x):
    peak = np.max(np.abs(x))
    if peak > 0.89: x = x * (0.89 / peak)  # only prevent clipping; keep relative levels
    wavfile.write(f"{out}/{name}", SR, (np.stack([x, x], 1) * 32767).astype(np.int16))
save("music.wav", music); save("sfx.wav", sfx)
```

`sound.json` uses `total_duration` as `duration`, so music runs under the outro too; with the outro's own audio on, the music fades out over the last 0.3 s before the outro (apply `afade=t=out:st=DURATION-0.3:d=0.3` to the music input) and stays silent during it.

`python sound.py sound.json <dir>` writes `music.wav` and `sfx.wav`. If `sound.music.file` is set, use that file as `music.wav` instead (trim or loop to `duration`, 1 s fades).

Mix and mux in one call. The voice always leads: the voice is normalised to −16 LUFS, the music bed (generated or supplied) to −34 LUFS and then ducked a further 15–20 dB under speech by a sidechain, effects sit 12 dB down, and the whole mix is padded to the film length so the ending is not cut. Uses `amix normalize=0`, tested with ffmpeg 6.1; use ffmpeg 6 or newer:

```
ffmpeg -i video.mp4 -i voice.wav -i music.wav -i sfx.wav -filter_complex "[1:a]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-16:TP=-2:LRA=11,apad=whole_dur=DURATION,asplit=2[vo][sc];[2:a]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-34:TP=-9:LRA=11[mu];[mu][sc]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300[duck];[3:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=-12dB[fx];[vo][duck][fx]amix=inputs=3:normalize=0,alimiter=limit=0.89,loudnorm=I=-14:TP=-1.5:LRA=11,apad[mix]" -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -t DURATION -movflags +faststart final.mp4
```

`video.mp4` here is the film with the outro already appended, and `DURATION` is `total_duration`. The voice is padded to `DURATION` right after its `loudnorm`: without it the sidechain branch ends with the voice and the last ~2.9 s of speech (loudnorm's look-ahead) are lost, which cut film B's CTA line mid-sentence (owner report 2026-11-01). With the outro's own audio on, add it as a fifth input delayed to the outro start and include it in `amix` (`inputs=4`): `-i outro.mp4` and `[4:a]adelay=D|D,aformat=sample_rates=48000:channel_layouts=stereo,volume=-3dB[oa]`, where `D` is `duration` in milliseconds.

Never use `-shortest`: the voice ends before the ending and would cut it.

Checks: after mixing, integrated loudness (`ebur128`) is −14 ±1 LUFS, the true peak (`ebur128=peak=true`, last `Peak:` line of the summary) is at most −1.5 dBTP, and `final.mp4` lasts exactly `total_duration`. If the peak is higher (the AAC encode can add a tenth of a dB; one film landed at −1.4), keep the video stream (`-c:v copy`) and re-encode only the audio through `volume=0.5dB,alimiter=limit=0.73:attack=3:release=40:level=disabled`, then measure again; lower `limit` by 0.01 per retry (max 3), never touch the picture. Write the final command in `project/RENDER.md`. Single-pass `loudnorm` can land up to about 1 LU off on short films or films with long quiet stretches. If it is outside the range, run one correction pass: measure with `-af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null -`, then re-encode only the audio with `loudnorm=...:measured_I=..:measured_TP=..:measured_LRA=..:measured_thresh=..:offset=..:linear=true`, `-c:v copy -t TOTAL_DURATION`. Keep the silent `video.mp4` in `project/render/` so a sound-only revision remixes without re-rendering.

## 9c. Brand outro

When `scene-plan.outro.file` is set, the outro is the same clip on every film, unchanged.

- Hard cut from the last frame of the CTA scene to the first frame of the outro. No transition is built for it.
- 9:16: concatenate as is. Re-encode the outro once per job to the film's fps, size, pixel format and colour: `-vf "fps=FPS,scale=W:H:in_range=tv:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p"` with the same `-colorspace/-color_primaries/-color_trc bt709 -color_range tv` tags as the film (the brand clip is untagged limited-range BT.601). Then use the concat demuxer: `ffmpeg -f concat -safe 0 -i list.txt -c copy film_outro.mp4`.
- 16:9: place the vertical clip in the centre of a 1920×1080 frame filled with `outro.bg`: `-vf "scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:color=OUTRO_BG"`, then concatenate.
- Keep `project/render/video.mp4` as the film without the outro and `project/render/film_outro.mp4` with it.
- Check: the frame at `duration` + 1 frame equals the outro's first frame (no blend); total frame count equals `round(total_duration × fps)`. Colour check, in display colours: decode one outro frame of `final.mp4` and the same frame of the brand clip to RGB (`-pix_fmt rgb24`, which applies the range tag); the background differs by ≤ 4 levels per channel. `ffprobe` shows one `color_range` for the whole file.

## 10. Cover

A separate composition, not a frame grabbed from the film. Content from the plan, look from the film.

- Build `project/cover.html` at `cover.format`, with the same theme, fonts, components, hero element and the reference's visual language as the film. Start from `hero_scene`'s component at its hold pose (the local time of that scene's longest text midpoint, else the scene midpoint), then recompose it as a poster for `cover.visual` and `cover.layout_notes`. The cover is static: `__seek` always draws that one pose.
- Text: `cover.headline` and `cover.subline` exactly as in the plan, with the `hook` role style scaled up for thumbnail size (headline ≥110 px on a 1080×1920 cover, ≥96 px on a 1280×720 cover). Never change a word.
- Headline, subline and the key visual inside `cover.grid_safe`, centred; the area outside it carries only background and secondary shapes. Logo per `brand-profile.logo`.
- `cover.html` follows the engine contract of §3 with `duration` of one frame. Render it with `node capture.mjs cover.html <dir> W H FPS 0 <1/FPS> png` and save the frame as `out/cover.png`.
- Checks: rendered DOM text equals the plan strings exactly; text inside `grid_safe`; contrast ≥4.5:1 against sampled background pixels; a copy scaled to 270 px wide is still readable, with Persian letters joined and digits Persian (look at it once).
- **Cover design system** (`cover.system` set): follow the file in `brand-profile.cover_system` for this cover. Compose inside `cover.master` using its zone map (for example A title, B hero/proof, C logo), its title rules (right-anchored Persian title, one dominant word), the chosen visual system's signature move and exception rule, and the chosen colour mode. Render once, at the master size: `out/cover-4x5.png`. No `out/cover.png` is made when a cover design system is set (owner decision: the master is the only cover). People on the cover are the film's `cast` in the same vector look; never a photo-real or generated face. Then check every item of its hard-fail list against the rendered PNG and write each one with pass/fail in `qa.md`; any fail → fix and re-render (max 2), then flag.
- `cover.status: missing`: skip the cover and note it in `qa.md`.

## 11. Deliver

`jobs/<slug>/out/`:

- `final.mp4`: the finished film with voice, music and effects, ready to publish
- `cover.png`: the cover from §10; when the brand has a cover design system, `cover-4x5.png` (the master) instead, and no `cover.png`
- `qa.md`: checks and results, a «look vs reference» line (dimensionality, light and shadow, materials, rhythm: matches or not, with a frame time), remaining flaws, scene time table; one line per owner asset with a time where it is fully visible in `final.mp4`

The editable project stays in `jobs/<slug>/project/`. New reusable components go to the library (§2).

Write `project/RENDER.md`: the exact commands used for capture, encode, outro, sound and mix, in order, with the real values. After editing texts or timings in the project's data by hand, these commands re-render the film without Claude.

## Revisions

Copy the delivered `out/` and `project/` to `_approved_vN/`. Change only what the feedback names. Re-render only the affected windows, then repeat §8 checks for them and §9. Feedback on the cover, or a change to `hero_scene`, re-renders and re-checks the cover (§10) only. Feedback on music or effects re-runs §9b and the mix only; the video stream is copied, not re-encoded. The outro is never edited per film; a new outro is a brand asset change.