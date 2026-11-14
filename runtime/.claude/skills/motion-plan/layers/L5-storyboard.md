# L5 — Storyboard (timing and engineering)

Output: `jobs/<slug>/plan/storyboard.json` (the `scenes`, `world`, `actors`, `camera` parts of `scene-plan.json`, shapes in `references/schemas.md` §D).

L5 does not invent new ideas. It places `concept.json` on the real voice timing and makes every scene buildable.

Load now: `references/transitions.md`, `references/safe-zones.md`, `references/data-viz.md`, `references/rtl-grammar.md`.

## 1. Adaptation map

For each reference shot: **KEEP** (structure and motion reused, content replaced), **ADAPT** (motion idea kept, visual redesigned for brand and topic) or **DROP**. For each chain link: the reference shot it borrows, or `NEW`. Keep the reference's rhythm: scale its shot lengths to the voice lines.

## 2. Scenes from links

One scene per link, or per split of a link; plus the end card when there is no outro (`voice_line: null`).

- Split a link into two scenes only at a clause or word boundary, and only when the picture genuinely changes. Merge any scene shorter than 1.2 s with a neighbour.
- Scene times continuous, no gaps or overlaps; the last scene ends at `audio.json` duration.
- Every cut lands on a line boundary or a word boundary from `audio.json`. Prefer a pause from `audio.json.pauses` when one sits within 0.3 s of the intended cut.

Each scene copies from its link: `beat`, `understand`, `picture` (from `see`), `handoff`, `metaphor`. It adds `action`, `camera`, `component`, `props`, `texts`, `transition_out`, `motion_ref` (with a readable reference, §5), `continuity`, `purpose`, `key_frame`, `actor_states`, `borrowed_from`, `adaptation`, `asset`.

- **Setting and variety:** each scene's setting, subject and props come from its voice line and its link (L4), never from the reference's scenery; `borrowed_from` carries motion and look (rendering, light, depth, materials; D55) but never its objects. Consecutive scenes differ in `component`, composition or shot scale, and no component or layout repeats three scenes in a row, unless the reading table shows that repetition as the reference's deliberate rhythm (and even then the content differs).
- `continuity` = the link's `handoff` in one line (motion-build reads this field).
- `actor_states` = which actors are on screen and in which state, from `concept.json`.
- `key_frame` = the local second where the scene's meaning is complete (usually the midpoint of its key text hold, or the end of its main transformation). It is the pose a reviewer checks with the sound off. Current motion-build ignores it and picks its own hold pose (its §6); a motion-build that reads `key_frame` uses it for stills and QA.

## 3. Pacing

- Alternate sparse and dense scenes every one or two cuts.
- **Hold versus motion:** no picture stays unchanged for more than 2.5 s without development (an actor changes state, information builds, a relation appears). A quiet hold is right when the idea needs reading; then information develops, the camera stays still.
- A new scene only when the meaning changes: new idea, statistic, comparison, emphasis or conclusion. Never one scene per sentence by reflex.

## 4. Movement with purpose

Every move in `action` and `camera` carries a `purpose`: `explain`, `connect`, `emphasize` or `reveal`. A move with no purpose is removed. Never: random floating objects, decorative particles, camera shake, constant zoom, objects added because the frame looks empty.

Motion follows the reference (router conflict order, item 4): camera moves, move durations, easing, rhythm, shot length, composition and layout come from the reading table rows the scene borrows from, even when the brand lists that move in `brand-profile.motion.avoid` or gives other durations. Colours, fonts and logo stay the brand's. **Rhythm is the reference's too:** the camera or picture changes about as often as the reading's average shot length (a reference at ~2.4 s per shot gives a new shot, whip or camera move every ~2.5 s inside a voice line); a long voice line is cut into several shots, text stays readable across them (carry it over the cut). Only when no reference is readable: never use a move listed in `brand-profile.motion.avoid`; keep reveal durations inside `brand-profile.motion.durations_ms`; when the brand's personality is calm, editorial or minimal, prefer masked reveals, slides, morphs, match-shapes and line drawing, and use `needle-zoom` or `fly-through` at most twice per film.

## 5. Transitions

With a readable reference, copy the reference's motion exactly, in two fields:

- `transition_out`: the nearest of the eight values in `references/transitions.md`. It names the build family only (and stays one of the eight, so the app's check passes).
- `motion_ref`: the reference's exact motion for this scene, taken from the reading rows in `borrowed_from`: `transition` (`move` in plain words, e.g. "whip pan left with blur", `duration_s`, `easing`, `direction`), `entrances` (`duration_s`, `easing`, `overshoot_pct`), `camera` (move, speed, easing). motion-build builds from `motion_ref` first and uses the family recipe only for what `motion_ref` leaves out, so a bounce, spin, whip or fast cut from the reference survives even when the brand avoids it.

A reference move that cannot be built in code at all (live footage, real 3D, a real face) is replaced by the nearest buildable move with the same timing and direction, and listed in `risks`. Otherwise choose `transition_out` per `references/transitions.md`: the least distracting transition that carries the handoff. Order of preference: an actor transform or carry that the world already provides → camera travel between regions → match-shape or morph → a motivated hard cut that keeps one anchor (position, colour, direction). Never a chain of unrelated hard cuts. The last scene's `transition_out` is `none`.

## 6. On-screen text

- Never subtitles. Text only when it adds information: a number, a key term, a contrast label, the CTA.
- Short and exact: hook ≤7 words, others ≤10. Each string belongs to one voice line and appears between that line's first and last word times (`in` ≥ first word start). Key text enters on or just after an emphasis word.
- Readability: each text stays visible at least `1.0 + 0.05 × characters` seconds. If its line is shorter, let it run into the next scene (set `out` later) or shorten the text. Never leave a text below its hold time.
- Every number, price or claim on screen exists in the content package with a source; otherwise drop it. Numbers follow `references/data-viz.md`: shown as a moving, proportioned object, the figure as a label on it.
- Zones and order follow `references/rtl-grammar.md` and stay inside `references/safe-zones.md`.

## 7. Ending

- With `brand-profile.outro.file`: the last scene is the CTA (`beat: cta`), holding at least 1.0 s after its last word; motion-build appends the outro with a hard cut. No separate logo end card, so the logo never appears twice.
- Without an outro: the last scene is a clean brand lockup end card (`beat: endcard`) that follows `brand-profile.logo`.

## 8. Code and assets

Everything is built in code: text, numbers, UI, diagrams, shapes, vector characters, particles, transitions. A scene may use an external clip or image only if the content package supplies its file, it is the opening frame, or it is an owner asset; set `asset` to that path. No file, no asset.

**Owner assets (D84):** every file in `jobs/<slug>/input/` appears in the film, placed where and how the owner's directions say (else where the voice line talks about it). List each one in `owner_assets` (`references/schemas.md` §D) with its scenes, `how` it is used and its `mode`:

- `show`: drawn as it is. It is the `asset` of its scenes; aspect ratio kept, subject not cropped away, no recolour, text never covers it. The default for a photo, logo or finished picture with no direction.
- `edit`: changed exactly as the directions say (crop, recolour, restyle, text over it) and no further. It is the `asset` of its scenes; `how` states each change.
- `rebuild`: the blueprint of a product screen built in code. Its scenes' `asset` stays null and a `ui_screens` entry names it.

With no direction for an image, choose the mode the film's flow needs and say why in `how`.

**Reading an image in the film's format:** a `show` or `edit` image whose words the viewer must read (a screenshot, a document, a chart) follows the framing of `references/ui-screens.md` §5, like a product screen: when its shape differs from the film's (a desktop screenshot in 9:16), never shrink the whole image to the frame width; frame one region at a time and move between regions with the camera, so its smallest text that must be read is at least the minimum text size of motion-build (28 px at 1080 px wide in 9:16). Write the regions (source pixel rects), their order and times in `how`. An image the viewer only needs to recognise (a photo, a logo, a mood) may be shown whole.

**Frame edges:** no text that must be read, and no card or panel that carries it, crosses the frame edge while it is on screen, except during a camera move; a sentence is never cut mid-line. A region that cannot fit is split into two shots.

**Product screens:** when the film has one (from an image, the directions, or an idea), open `references/ui-screens.md` now and follow it: states, framing for the format, cursor and typing, actions on the voice's words, values from `plan/ui-source/<NN>.json`. Write `ui_screens` and give its scenes `component: "ui"` with `props.ui_screen`.

## 9. Props

`props` holds every value the component needs (texts, numbers, labels, icons, actor ids, value_refs). motion-build never invents content. `component` is one of: `title`, `stat`, `compare`, `list`, `quote`, `ui`, `character`, `diagram`, `cta`, `endcard`, `custom`. A `custom` component carries a `spec` in `props`: what it draws, its states and its timing, enough to build without guessing.

## 10. World timing

Convert `concept.json` link references to seconds: `actors[].states[].at`, `camera[]` keyframes (`at`, region or x/y, zoom, ease token from `brand-profile.motion`). Camera keyframes sit on scene boundaries or emphasis words.

## Exit

Every scene has `component`, complete `props`, `texts` checked, `transition_out`, `continuity`, `purpose`, `key_frame`; times continuous; cuts on boundaries.
