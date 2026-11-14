# L8 — Assemble and QC

Outputs: `jobs/<slug>/plan/scene-plan.json` (shape in `references/schemas.md` §D) and `jobs/<slug>/plan/plan.md`.

## 1. Assemble

Merge into `scene-plan.json`: header fields; `style_lock` and `chain` from `concept.json`; `cast` from `concept.json`; `world`, `actors`, `camera`, `scenes` from `storyboard.json`; `sound` from `sound.json`; `cover` from `cover.json`; `outro` copied from `brand-profile.outro`; `safe_zone` from config or `references/safe-zones.md`; `risks` collected from every layer.

- `hero_element`: the chosen concept's `hero` actor, described in one line.
- `chain`: each link with its `understand` and the ids of the scenes built from it.
- `cast`: copied from `concept.json`, with `first_link` converted to `first_scene` (the first scene of that link).
- `duration` is the film before the outro; `total_duration` = `duration` + `outro.duration` (equal to `duration` when there is no outro).
- A scene's cut time is its `end`. The last scene's `transition_out` is `none`.

## 2. plan.md

In this order: status line; mode; defaults picked; brand sources used; style lock; semantic chain table (link, lines, understand, see, becomes, handoff); the three concepts and the reason for the choice; reading table; adaptation map; storyboard table (scene, time, beat, picture, component, transition, purpose, key frame); sound cue list; cover decision; risks.

## 3. Checks

Every item must pass; fix and recheck if not. A failure that belongs to an earlier layer reopens that layer's file for that item only.

**Story**
- Every voice line belongs to one chain link; no orphan link; every link has a handoff.
- Every scene has `understand`, `purpose`, `key_frame`; no move without a purpose.
- No picture unchanged for more than 2.5 s without development.
- Every actor appears in at least two links; every `character` scene uses a `cast` id; one look per id.

**Brand**
- Every colour and font referenced in the plan (including `style_lock`) exists in `brand-profile.json`.
- Persian text present: a font with `script` persian or both exists.

**Motion language**
- With a readable reference: every scene with a reading row in `borrowed_from` has `motion_ref`, and its camera moves, transitions, durations and easing match those rows, even where the brand's `motion.avoid` or `motion.durations_ms` say otherwise; no brand motion rule replaced a reference move; every `transition_out` is one of the eight values.
- With a readable reference (D55): `style_lock` takes its dimensionality, light, shadow, materials and background feel from the reading's `look`; it contains none of "flat", "no shadow", "no 3D", "no depth" unless the reference is flat; no scene's picture is flatter than the reference; the average shot length is within 30% of the reference's (text readability may lengthen single holds, and `plan.md` says where).
- Without a readable reference: no transition or move from `brand-profile.motion.avoid`; reveal durations inside `motion.durations_ms`.

**Owner assets**
- Every file in `jobs/<slug>/input/` is listed in `owner_assets` with its scenes, `how` and `mode`. `show`: it is the `asset` of a listed scene, unedited, aspect ratio kept, not covered by text. `edit`: it is the `asset` of a listed scene and every change traces to the owner's directions. `rebuild`: a `ui_screens` entry has it as `asset`.
- A `show` or `edit` image with words to read is framed by regions at a readable size when its shape differs from the film's (L5 §8), with the regions written in `how`; no text to be read crosses the frame edge.

**Product screens** (only when `ui_screens` is not empty)
- The checks of `references/ui-screens.md` §8 pass.

**Timing**
- `timing` is `measured`, or the estimate is listed as the first risk.
- Scene times continuous; last `end` equals `duration`; every cut on a line or word boundary; `total_duration` correct.
- Ending: with an outro, the last scene is the CTA and no scene shows a logo lockup.

**Text and data**
- Every text exact, within word limits, inside its line's span at entry, meets its hold time, sourced if it is a claim.
- Every number on screen has a `value_ref` and a proportioned visual (`references/data-viz.md`).
- Direction and order follow `references/rtl-grammar.md`; text inside `safe_zone`.

**Build readiness**
- Every scene has `component`, complete `props` (a `custom` one has a `spec`), `transition_out` and `continuity`.
- At least half of all cuts carry a world or shape handoff (`carry`, `morph`, `fly-through`, `needle-zoom`, `match-shape`), unless the reading table shows a hard-cut reference edit (`references/transitions.md`, Budgets).
- Setting from the voice-over: every scene's setting, subject and props trace to its voice line; no scene copies the reference's scenery, subject or props (`borrowed_from` rows supply motion only).
- Scene variety: no three consecutive scenes share the same `component`, composition and shot scale; the film shows at least as many distinct settings or pictures as it has chain links divided by two (rounded up).
- An opening frame, when supplied, is the first scene's `asset`.
- The reference reading is cached.

**Sound**
- Every cue time inside the film; cues at least 0.5 s apart (riser + impact counts as one); every `needle-zoom`, `fly-through` and `wipe` cut has a `whoosh` unless a higher cue took its place.

**Cover**
- `cover.status: ready`: fields identical, character for character, to the approved package; empty fields empty. With a cover design system: `system`, `mode` and `master` set.

## 4. Status and hand-off

- `gates.plan_review: true` → `status: awaiting_review`, stop.
- Otherwise `status: ready`, hand off to motion-build.
