# L3 — Reference reading and mode

Outputs: `refs/<ref-slug>/reading.json` (cached), and the film `mode`.

## 1. Cache

Cache: `refs/<ref-slug>/reading.json`, keyed by the file's SHA-256 (or the URL). If it exists with the same key, reuse it and skip to step 3.

## 2. Read

**The reference is the style model, in full (D55)**: camera, transitions, rhythm, easing, layout grammar, animation style, and also its look: 2D or 3D, depth, light and shadow, materials, rendering, background feel. Its subject, scenery, setting, props and characters are never copied into the film; the setting always comes from the voice-over (L4), drawn in the reference's rendering style.

1. `ffprobe`: duration, size, fps, audio.
2. Contact sheets: `ffmpeg -i REF -vf "fps=2,scale=480:-1,tile=4x3" sheet%02d.png`; look at every sheet.
3. Cuts: `ffmpeg -i REF -vf "select='gt(scene,0.3)',showinfo" -f null -`; a dense sheet (fps=15) around each cut you may borrow.
4. Reading table, one row per shot: `id` (`r1-s3`), span, shot, camera move, what moves, move durations and easing feel (snappy, smooth, elastic, linear), composition and layout, on-screen text, transition out, palette, built in code or generated, reusable as a motion pattern (yes/no, why; the motion only, never the scenery or subject). This table is the film's motion language: L4 and L5 follow it over the brand's motion rules (router conflict order, item 4).
5. Visual language in one paragraph: medium, rendering, typography, rhythm (average shot length, cuts on a beat or not), palette, signature moments. Add a `look` line: dimensionality (flat, 2.5D or real 3D), light and shadow, materials, depth of field and blur, background. If the reference is 3D, `code_translation` says it is built as real 3D in code (three.js, lights, shadows, depth of field as blur), never flattened into 2D shapes.
6. **Continuity techniques** the reference uses: how things persist across cuts, how one shape becomes another, how the camera travels through an object. One line each, described as technique, not as the reference's objects or scenery. L4 reuses the technique on subjects taken from the voice-over.

A link that cannot be opened: say so in `plan.md` and plan from the content package and brand alone.

## 3. Mode

| Mode | When |
|---|---|
| REEL | Voiceover reel: hook, problem, solution, proof, CTA (default for voiceover packages) |
| EXPLAINER | Educational or story film with narration and characters |
| RECREATE | Same film shot by shot, new content or brand |
| BLEND | Several references combined into one original film |
| UI | Software, app or workflow launch |
| PRODUCT | Product reveal |
| JOURNEY | Abstract, particle or glyph world growing from one action |

In RECREATE, L4 still writes the chain and keeps the reference's shot order, motion structure and rhythm, but setting and subjects still come from the voice-over; the three-concept step collapses to one concept (the reference's motion structure) adapted to the brand and the voice-over.

## Exit

`reading.json` cached with its key (or the dead link recorded in risks); every reading-table row has an `id`; `mode` chosen and recorded for `plan.md`.
