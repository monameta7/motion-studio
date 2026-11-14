---
name: "motion-plan"
description: "Turn an approved content package, its voiceover audio and a reference motion video into a timed, story-driven scene plan (scene-plan.json) for motion-build, using the project's own brand resources. Layered: brand, voice, reference, visual concept, storyboard, sound, cover, assembly and QC."
---

# Motion plan v2 — layered router

Turns an approved content package (hook + truth output), its finished voiceover and one or more reference motion videos into a **timed, scene-by-scene build plan** that `motion-build` executes directly. The plan files are the hand-off; there is no prompt to copy.

The film is designed as **one continuous visual explanation**, not a montage: a semantic chain decides what every scene explains, a single visual world carries it, and real voice timing places every cut.

Brand-agnostic: colours, fonts, tone and rules come from the resources of the project it runs in. No brand is hard-coded.

Runs unattended: never stop to ask. A missing value gets its default, recorded in `plan.md`. Stop only for the reasons in "Stop conditions".

All paths are relative to the **project root** (the working folder the run starts in). All times are **absolute seconds on the final film timeline**. Layer and reference paths are relative to **this skill's folder**.

## Inputs

| Input | Required | Notes |
|---|---|---|
| Content package | yes | Approved by truth: voiceover lines in order, on-screen text candidates, emphasis words if marked, CTA, claims with sources, the approved cover (headline, subline, visual idea, layout notes), brand name if stated. |
| Voiceover audio | yes (fallback in L2) | One file per line (preferred) or one full file. |
| Reference motion | yes | One or more video files or links. |
| Opening frame image | optional | Supplied image that must be frame 0 of the film. |
| Owner assets | optional | Images the owner attached to this film (`jobs/<slug>/input/*`), with the owner's directions on how to use them (given with the run; never voiced). **Every one appears in the film**, used as the directions say: shown as it is, changed (cropped, recoloured, restyled), or rebuilt in code as a moving product screen (D84). With no direction for an image, choose what the film's flow needs and record the choice (L5 §8). |
| Product screen | optional | Asked for in the directions, shown by an owner screenshot, or implied by an idea ("a product intro for a SaaS"). Built in code and animated; rules in `references/ui-screens.md`. |
| Style brief | optional | 2–6 free lines of art direction. Works inside the brand, never against an owner decision or a brand token. |
| Config | optional | `slug`, `format` (`9x16` default or `16x9`), `brand`, `safe_zone`, `mode` (`full` default, `concept`, `from:Lx`), `gates.concept_review` (false), `gates.plan_review` (false), `outro_audio`. |

## Layer map

Open each layer file **only right before running that layer**. Each file is read once per run.

| Layer | File | Reads | Writes | References loaded |
|---|---|---|---|---|
| L1 Brand | `layers/L1-brand.md` | project brand resources, style brief | `brand-profile.json` | `references/schemas.md` §A |
| L2 Voice | `layers/L2-voice.md` | voice files, package lines | `voice.wav`, `audio.json` | `references/schemas.md` §B |
| L3 Reference | `layers/L3-reference.md` | reference videos | `refs/<ref-slug>/reading.json`, mode | — |
| L4 Concept | `layers/L4-concept.md` | package, `brand-profile.json`, `audio.json`, `reading.json`, opening frame | `concept.json` | `references/metaphor-bank.md`, `references/rtl-grammar.md`, `references/data-viz.md`, `references/schemas.md` §C |
| L5 Storyboard | `layers/L5-storyboard.md` | `concept.json`, `audio.json`, `brand-profile.json`, `reading.json`, package, `ui-source/*.json` | `storyboard.json` | `references/transitions.md`, `references/safe-zones.md`, `references/data-viz.md`, `references/rtl-grammar.md`, `references/ui-screens.md` (only when the film has a product screen) |
| L6 Sound | `layers/L6-sound.md` | `storyboard.json`, `brand-profile.json`, package | `sound.json` | — |
| L7 Cover | `layers/L7-cover.md` | package, `storyboard.json`, `brand-profile.json` | `cover.json` | `references/safe-zones.md` |
| L8 Assemble + QC | `layers/L8-assemble-qc.md` | all layer outputs | `scene-plan.json`, `plan.md` | `references/schemas.md` §D |

**Memory rule:** after a layer, keep only its output file. The next layer works from files, not from the reasoning of earlier layers. A layer file is not reopened unless L8 sends the run back to it.

**Reference rule:** in its own domain a reference file wins over a layer file (transitions → `transitions.md`, safe zones → `safe-zones.md`, numbers on screen → `data-viz.md`, direction and order → `rtl-grammar.md`, product screens → `ui-screens.md`, JSON shape → `schemas.md`). This router wins on flow, layer order, modes, stop conditions and the conflict order below.

All layer outputs go to `jobs/<slug>/plan/` except the reference cache.

## Load tree — run before anything else

```
1) slug: config.slug, else a short kebab-case slug from the package topic.
2) Existing job folder jobs/<slug>/plan/?
     scene-plan.json with status awaiting_review → plan review done: set ready, hand off.
     concept.json with status awaiting_review (no scene-plan.json) → concept review done: resume at L5.
     Otherwise keep every finished layer output whose inputs are unchanged.
3) mode:
     full      → L1 … L8, hand off to motion-build
     concept   → L1 … L4, write concept.json and a short plan.md, status awaiting_review, stop
     from:Lx   → reuse existing outputs before Lx, run Lx … L8
4) Go to L1 (or the first layer to run).
```

## Conflict order (whole skill)

1. Meaning of the voiceover and accuracy of every number and claim.
2. Readability: hold times, minimum sizes, safe zones, contrast, correctly joined Persian text.
3. Owner assets: every one appears in the film, used as the owner's directions say.
4. **The reference (template) ranks above the brand.** Everything about how the film looks and moves follows the reference: camera moves, transitions, rhythm and shot length, composition and layout, animation style, move durations and easing, scene structure, continuity devices, density and pacing. It beats `brand-profile.motion` (`preferred`, `avoid`, `durations_ms`), any personality hint of the brand (calm, editorial, minimal) and the general brand guide. When it is unclear whether a choice is motion or identity, the reference wins. **The reference also owns the look (owner, 2026-11-02, D55):** dimensionality (3D stays 3D: real depth, perspective, lens blur), light and shadow, materials and surface finish (glossy plastic, chrome, paper, glass…), object rendering style, the feel of the background (sky, haze, gradient, studio), camera, speed and rhythm. A brand guide rule such as "no 3D", "no shadow", "no fake depth", "flat only", "calm and minimal" or "white background" never limits a film with a readable reference. The setting, subjects and props of every scene come from the voiceover (item 1), never from the reference footage, and scenes must be varied; they are drawn in the reference's rendering style.
5. Brand identity, the only things the reference does not replace: owner decisions (`*_decision`), colour tokens and banned colours (the reference's colours are mapped onto brand colour roles; its materials and light stay), fonts, logo, logo outro, cover design system. One exception (D84): inside a rebuilt product screen the product's own colours, icons and logo stay as in the owner's image, unless the owner's directions say otherwise; the brand applies to everything outside the screen.
   With no readable reference, `brand-profile.motion` applies as the motion language.
6. Continuity of the visual world and the semantic chain.
7. Signature moment and stylistic flourish.

A genuine conflict is resolved by the least disruptive option and written as one line in `risks`.

## Gates

- `gates.concept_review: true`: after L4, write `concept.json` and `plan.md` with `status: awaiting_review`, stop. Running again on the same slug resumes at L5.
- `gates.plan_review: true`: after L8, write everything with `status: awaiting_review`, stop. Running again after review sets `status: ready` and hands off without redoing finished layers.
- Otherwise `status: ready` and hand off to motion-build.

## Stop conditions

- The brand cannot be resolved, or the content package has no voice lines: `status: blocked`, reason at the top of `plan.md`, stop.
- Nothing else stops the run. Missing audio, a dead reference link, a missing cover or a missing opening frame are recorded as risks and the run continues.

## Compatibility with motion-build

`scene-plan.json` keeps every field motion-build reads today (`scenes`, `component`, `props`, `texts`, `transition_out`, `continuity`, `cast`, `sound`, `outro`, `cover`, `safe_zone`). The v2 fields (`style_lock`, `chain`, `world`, `actors`, `camera`, `owner_assets`, `ui_screens`, and per-scene `understand`, `purpose`, `handoff`, `key_frame`, `actor_states`) are additive: a motion-build that does not know them ignores them and builds from `scenes`.
