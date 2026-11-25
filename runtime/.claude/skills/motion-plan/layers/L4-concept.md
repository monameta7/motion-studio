# L4 — Visual concept (direction layer)

Output: `jobs/<slug>/plan/concept.json` (shape in `references/schemas.md` §C).

This layer thinks like a motion director. It decides **what every moment explains and how one picture becomes the next**. It does not time anything to the frame and does not write props; L5 does that.

The question for every idea is not "what cool image goes here?" but: **what is the voice explaining, how can it be shown, and how can that picture physically become the next idea?**

Load now: `references/metaphor-bank.md`, `references/rtl-grammar.md`, `references/data-viz.md`.

## 0. Team of roles (owner rule 3, D116)

Plan as a team. Each role checks the plan at its step and signs its line in `plan.md` (passed, or what it changed).

| Role | Checklist |
|---|---|
| Creative director | one idea for the whole film; the strongest reference sequences are picked; the signature moment is earned; the film's feel arc (§2) and the art-direction list (L5 §4b) hold |
| Content strategist | every link serves the voice's message and the CTA; nothing off-topic; every link answers: what does the voice explain here, how is it shown, how does it become the next idea |
| Voice writer | on-screen text is the voice's own words and numbers; every hold readable |
| Senior motion designer | each scene is its reference shot: framing, camera, action, transition and timing match the reading rows; the picks are the complex ones; every join between shots of different references, and every REBUILD scene, carries the story (L5 §5) |
| 3D and object designer | every object is made for this film from the scenario's world, in the reference's rendering style; none is the reference's object |
| Experienced editor | cuts on the voice's words and pauses; the references' rhythm; no static picture beyond the hold rule; each scene's cut and hold support its `feel` |
| Sound designer | cues on cuts and actions (L6), weighted by each scene's `feel` |
| Product narrator | product films: for each feature the camera goes to it, the action happens, the result is shown |
| Truth reviewer | every number and claim sourced and drawn true to scale inside its shot (`references/data-viz.md`); nothing of the reference's world, text or brand left |

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
- Each link names its `feel`: what the viewer should feel or realise at that moment, in a few words (curiosity, tension, recognition, relief, confidence, urge to act), following the voice's own arc. The feel changes only where the voice turns. In RECREATE the feel never changes a shot's moves: it decides between fitting reference shots, what the shot puts first (which element, which word), how the shot's still part is used where the voice timing leaves room (cuts stay on the voice's words, L5 §2) and the weight of its sound.
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

All three use the reference's motion language (camera, transitions, rhythm, composition, layout, animation style) and its look (dimensionality, depth, light and shadow, materials, background feel; D55) and the brand's identity (colours, fonts, logo); they differ in world and metaphor, not in motion language. In all three, the world, subjects, props, settings and metaphors are derived from the voice-over and the package, never from the reference footage. With no readable reference they stay inside `motion.avoid`. In RECREATE mode, write one concept only: the pick list. For each link, the reading row it uses (`borrowed_from`, any reference), why it fits, and its `complexity`; when no row fits, the row whose camera language and action it rebuilds for the scenario (owner rule 1). Among fitting rows the most complex wins. Every chosen reference gives at least one scene when one of its shots fits a link; a reference left out is named in `risks` with the reason (the first app RECREATE film used 2 of its 4 references).

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

Write `style_lock`: one English paragraph, 60–90 words, describing the resolved visual system: medium, rendering, palette roles with exact hex values from `brand-profile.json` for the brand zone (text, cards, UI, large surfaces) plus the natural or reference colours of the scene's objects, people and props (colour zones, SKILL.md conflict-order item 5), shape language, type pair, lighting and depth, motion feel, transition character, explicit exclusions. Medium, rendering, shape language, lighting and depth are the reference's (a 3D reference gives a 3D lock with real light, shadow and depth; never write "flat", "no shadow" or "no 3D" for a film with a readable reference). It merges brand identity, the reference's look and motion language (motion feel and transition character come from the reading), style brief and the chosen concept. It is the single source of visual identity for L5 and L7, and nothing later may contradict it. Current motion-build styles from `brand-profile.json` and does not read `style_lock`; L5 therefore expresses the lock through `props`, `component` choice and texts, so the film follows it either way.

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

Characters are defined per film from the voiceover, not from a fixed sheet. When a line names or implies a person (the owner of a clinic, a sales manager, a customer), add one `cast` entry: role, a short look description in natural colours (skin, hair and clothes as a real person would have them; a brand colour at most as one small accent, such as a badge or a cup), drawn in the reference's rendering style (flat vector only when the reference is flat; no photo realism, no real person's likeness) and the first link they appear in. The same person keeps the same `cast` id, look and colours in every scene and on the cover.

- One protagonist when a recurring human makes sense; supporting characters only for a comparison, interaction or group, visually subordinate.
- Every character acts: chooses, reacts, points, moves an object, experiences the consequence being described. No character added to fill the frame.
- A brand character sheet in the brand folder overrides this. No people in the script: `cast` is empty.

## 8. Data and metaphor

- Every number in a link becomes an actor or scene element per `references/data-viz.md`, with `value_ref` to the package claim. A number with no sourced claim is dropped.
- Every abstract idea gets a metaphor from `references/metaphor-bank.md` or a better one in the same spirit: simple, readable without the voice, not a cliché. The chosen metaphor is written on its link.

## 8b. Objects made for this film (owner rule 4)

For every object a borrowed shot features (a car, a truck, a phone, a card, a device), design the scenario's own object in its place: what it is, its shape, material and detail, in the reference's rendering style, and which reference object it replaces. Do the same for locations and characters (D113). These go into the scenes' `props` and `actors`, and the replacement table (reference → scenario) into `plan.md` (L8 §2).

## 9. Opening frame

When an opening frame image is supplied, link 1 starts on it: the image is frame 0, unchanged. Write its path in `opening_frame`; L5 sets it as the first scene's `asset`. Its subject, shapes and colour accents become the first actors. Link 1's `see` describes how the image comes alive and travels into the first idea; never a cut away from it. If the image conflicts with the brand, keep the image exact in the first scene and record the trade-off as a risk.

## 10. Owner assets

Each image in `jobs/<slug>/input/` gets a link where it appears, chosen from the owner's directions (else the link whose voice line talks about it). Write it on that link's `see`, with how it is used (D84): shown as it is, changed as the directions say, or rebuilt as a moving product screen. With no direction, choose what the link needs: a screenshot whose voice line describes using the product is rebuilt; a photo, logo or finished picture is shown as it is. When a shown image conflicts with the brand, keep the image exact and record the trade-off as a risk.

A product screen with no image (the owner gave only an idea, or the voice-over is about using a product) also gets its links here: one link per step the viewer must see the product do.

## Exit

- Every voice line is in one link; no orphan link; every link has `understand`, `see`, `beat`, `handoff`.
- Every actor has a role in at least two links.
- Every number has a `value_ref`.
- Every owner asset is on a link.
- Every setting traces to a voice line, none to the reference footage; no three consecutive links share a setting or layout.
- `style_lock` contains no colour or font missing from `brand-profile.json`.

Gate: `gates.concept_review: true` or `mode: concept` → `concept.json` gets `status: awaiting_review`, short `plan.md` (chain table, three concepts, choice and reason), stop.
