# L7 — Cover

Output: `jobs/<slug>/plan/cover.json` (the `cover` object of `scene-plan.json`).

The cover is the one hook wrote and truth approved. This layer only places it in the film's world; it never writes a new cover.

## 1. Copy, never rewrite

- `headline`, `subline`, `visual`, `layout_notes`: copied **exactly** from the approved package. No rewording, shortening, translating or added words.
- Field mapping: the package's main cover text → `headline`; a second cover line → `subline`; its image or concept description → `visual`; any placement or composition notes → `layout_notes`. A field the package does not have stays empty. Never fill an empty field from the script, the hook line or your own ideas.

## 2. Place in the world

- `hero_scene`: the scene whose picture is closest to the cover's visual idea, so the cover reuses that scene's component, actors, hero element and look. Prefer a scene whose `key_frame` shows the hero actor in its most meaningful state.
- The cover follows `style_lock` from `concept.json`.
- `format` follows the film format: 1080×1920 for 9:16, 1280×720 for 16:9 (video thumbnail). `grid_safe` per `references/safe-zones.md`.

## 3. Cover design system

When `brand-profile.cover_system` is not null, it governs the cover. `master` = its master size (for example 1080×1350, 4:5); for 9:16 the master area is centred in the 1080×1920 frame (it lies inside `grid_safe`), with only background outside it. `system`: the visual system its selection matrix gives for the content's intent (copy the id; record the reason in `plan.md`); `mode`: the colour mode it gives. A headline outside `title_words` is not rewritten: record it as the first risk (the content stage owns the words).

## 4. Missing cover

No cover in the package: `status: missing`, add it to `risks`, continue. The film is not blocked.

## Exit

`cover.json` written; `status` set; with `ready`, every text field equals the package character for character and `hero_scene` is an existing scene id; with a cover design system, `system`, `mode` and `master` set.
