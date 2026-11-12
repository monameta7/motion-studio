# L4 — Visual concept (direction layer)

Output: `jobs/<slug>/plan/concept.json` (shape in `references/schemas.md` §C).

This layer thinks like a motion director. It decides **what every moment explains and how one picture becomes the next**. It does not time anything to the frame and does not write props; L5 does that.

The question for every idea is not "what cool image goes here?" but: **what is the voice explaining, how can it be shown, and how can that picture physically become the next idea?**

Load now: `references/metaphor-bank.md`, `references/rtl-grammar.md`, `references/data-viz.md`.

## 1. Understand before designing

Read the package and `audio.json`. List, without drawing anything yet:

- the central idea in one sentence;
- topic changes;
- every number, comparison, process, cause and effect, example;
- human situations (who does what, who feels what);
- abstract ideas that need a metaphor;
- statements that need visual emphasis (the emphasis words from L2);
- the setting each line implies (place, objects, people, time of day). This, not the reference footage, is the source of every scene's environment.

## 2. Semantic chain

Write the film as a chain of links. One link per idea, not per sentence:

`understand` → what the viewer must grasp · `see` → what shows it · `becomes` → which link it turns into, and how.

Rules:

- Every voice line belongs to exactly one link (`lines`). A link may cover several short lines; a long line may be split across two links at a clause boundary.
- Each link names its `beat` (hook, problem, turn, solution, proof, cta, endcard).
- The `becomes` relation is a meaning link first (cause, contrast, zoom into detail, consequence, answer). The physical handoff is chosen later; it may be a morph, a carry, a camera move or a motivated cut.
- No orphan link: every link except the last has a `becomes`, and every link except the first is reached by one.
- Budget: from `audio.json`, each link's available seconds. A link with less than 1.2 s merges with a neighbour.

## 3. Three concepts

Design three distinct concepts for the same chain:

| Tier | Character |
|---|---|
| conservative | closest to the reference's motion language and techniques; lowest risk |
| balanced | the reference's rhythm with an original world built on the chain |
| bold | one strong central metaphor drives the whole film |

Each concept states: central metaphor; `hero` (the one persistent element that travels through the film); spatial logic (how the world is laid out and how the camera moves through it); one `signature` moment (a single memorable visual surprise, tied to the proof or the turn, never decoration); and how two or three key links hand off.

All three use the reference's motion language (camera, transitions, rhythm, composition, layout, animation style) and its look (dimensionality, depth, light and shadow, materials, background feel; D55) and the brand's identity (colours, fonts, logo); they differ in world and metaphor, not in motion language. In all three, the world, subjects, props, settings and metaphors are derived from the voice-over and the package, never from the reference footage. With no readable reference they stay inside `motion.avoid`. In RECREATE mode, write one concept only.

## 4. Choose

Compare qualitatively and pick one. Write `chosen` and a one-paragraph `reason` that answers, in this order:

1. Does each link read clearly without the voice?
2. How many handoffs come from the world itself (actor transforms, camera travel) rather than from cuts?
3. Does it keep the reference's motion language, the brand's identity and the style brief, and give every owner asset a place?
4. Is the signature moment earned by the content?
5. Does every setting come from the voice-over, with none taken from the reference footage, and is there real variety across scenes (§6b)?
6. Can motion-build make it with its components and transitions?

No numeric scores. Keep the two rejected concepts in `concepts` for review.

## 5. Style lock

Write `style_lock`: one English paragraph, 60–90 words, describing the resolved visual system: medium, rendering, palette roles with exact hex values from `brand-profile.json`, shape language, type pair, lighting and depth, motion feel, transition character, explicit exclusions. Medium, rendering, shape language, lighting and depth are the reference's (a 3D reference gives a 3D lock with real light, shadow and depth; never write "flat", "no shadow" or "no 3D" for a film with a readable reference). It merges brand identity, the reference's look and motion language (motion feel and transition character come from the reading), style brief and the chosen concept. It is the single source of visual identity for L5 and L7, and nothing later may contradict it. Current motion-build styles from `brand-profile.json` and does not read `style_lock`; L5 therefore expresses the lock through `props`, `component` choice and texts, so the film follows it either way.

## 6. World, actors and camera

Build the chosen concept as one world:

- `world`: a canvas larger than the frame (typically 3–5 frames wide or tall) with named `regions`, one or more per link. Each region is the place its voice line talks about (the clinic, the kitchen, the shelf, the chart), never the reference's scenery. Regions are laid out so that moving forward through the chain moves forward in reading direction (`references/rtl-grammar.md`).
- `actors`: every element that persists across more than one link: the hero, characters, a chart, an interface, a path, a recurring shape. Each actor has `born` (link id), a list of `states` (link id → form, what it represents, and `value_ref` when it encodes a number) and optionally `dies`. An actor that appears in only one link is not an actor; L5 builds it as scene content.
- `camera_path`: per link, which region the camera frames, how it arrives (push, pull, track, travel through an actor, hold) and why. A fixed camera is a valid, deliberate choice when the idea reads better still.

Each link records its `handoff`: what is on screen at its end that starts the next link (an actor's state, a shape, a direction of motion, a camera move already under way).

## 6b. Scene variety

One world does not mean one backdrop. Across the links:

- Each link has its own setting, composition and framing, taken from what its voice line describes.
- No more than two consecutive links share the same setting or layout.
- Vary shot scale (wide, medium, close, detail) and the kind of picture (environment, object, chart, character, text-led).
- Continuity comes from the hero, the actors and the handoffs, not from repeating one backdrop.

## 7. Characters (cast)

Characters are defined per film from the voiceover, not from a fixed sheet. When a line names or implies a person (the owner of a clinic, a sales manager, a customer), add one `cast` entry: role, a short look description in brand colours, drawn in the reference's rendering style (flat vector only when the reference is flat; no photo realism, no real person's likeness) and the first link they appear in. The same person keeps the same `cast` id, look and colours in every scene and on the cover.

- One protagonist when a recurring human makes sense; supporting characters only for a comparison, interaction or group, visually subordinate.
- Every character acts: chooses, reacts, points, moves an object, experiences the consequence being described. No character added to fill the frame.
- A brand character sheet in the brand folder overrides this. No people in the script: `cast` is empty.

## 8. Data and metaphor

- Every number in a link becomes an actor or scene element per `references/data-viz.md`, with `value_ref` to the package claim. A number with no sourced claim is dropped.
- Every abstract idea gets a metaphor from `references/metaphor-bank.md` or a better one in the same spirit: simple, readable without the voice, not a cliché. The chosen metaphor is written on its link.

## 9. Opening frame

When an opening frame image is supplied, link 1 starts on it: the image is frame 0, unchanged. Write its path in `opening_frame`; L5 sets it as the first scene's `asset`. Its subject, shapes and colour accents become the first actors. Link 1's `see` describes how the image comes alive and travels into the first idea; never a cut away from it. If the image conflicts with the brand, keep the image exact in the first scene and record the trade-off as a risk.

## 10. Owner assets

Each image in `jobs/<slug>/input/` gets a link where it appears, chosen from the owner's directions (else the link whose voice line talks about it). Write it on that link's `see`. An owner asset is shown as it is, never redrawn; when it conflicts with the brand, keep the image exact and record the trade-off as a risk.

## Exit

- Every voice line is in one link; no orphan link; every link has `understand`, `see`, `beat`, `handoff`.
- Every actor has a role in at least two links.
- Every number has a `value_ref`.
- Every owner asset is on a link.
- Every setting traces to a voice line, none to the reference footage; no three consecutive links share a setting or layout.
- `style_lock` contains no colour or font missing from `brand-profile.json`.

Gate: `gates.concept_review: true` or `mode: concept` → `concept.json` gets `status: awaiting_review`, short `plan.md` (chain table, three concepts, choice and reason), stop.
