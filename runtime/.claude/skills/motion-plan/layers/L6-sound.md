# L6 — Sound plan

Output: `jobs/<slug>/plan/sound.json` (the `sound` object of `scene-plan.json`).

Music and sound effects are built in code by motion-build; this layer decides what they are.

## 1. Music bed

From `brand-profile.motion_personality` and the content's tone pick `bpm` (calm 80–95, editorial or no personality stated 90–105, technical or energetic 105–125), a root note (`root_midi`), major or minor, and a 4-chord `progression` (semitone offsets). A music file supplied in the content package replaces the bed (`music.file`). `seed` fixed (default 7).

## 2. Cues

Derived from `storyboard.json`:

- `whoosh` peaking at every `needle-zoom`, `fly-through` or `wipe` cut.
- `pop` at the `in` of each `hook` and `stat` text, and on emphasis words that carry a key text entry.
- `click` at each visible UI action (cursor click, toggle).
- `riser` ending at, and `impact` on, the start of the `cta` or `endcard` scene.
- The `signature` moment from `concept.json` may take one `impact` when no higher cue sits within 0.5 s.
- With an outro whose own audio is off (`use_audio: false`): one `impact` at `duration + outro.logo_hit`. With its audio on: no cue inside the outro.
- `hard-cut`, `morph`, `carry` and `match-shape` get no cue unless the reference reading shows one there.

## 3. Spacing and voice clarity

- Cues at least 0.5 s apart; the `riser` and `impact` pair counts as one cue. When two cues collide, keep the higher one in this order: riser + impact, whoosh, pop, click.
- No `whoosh`, `riser` or `impact` between the first and last word of a line whose on-screen text is a claim or a number. Short `pop` and `click` cues at a text's `in` are allowed.

## Exit

Every cue inside the film; spacing respected; every `needle-zoom`, `fly-through` and `wipe` cut has a `whoosh` unless a higher cue took its place.
