# Transitions

The vocabulary is the one motion-build implements: `needle-zoom`, `fly-through`, `morph`, `carry`, `wipe`, `match-shape`, `hard-cut`, `none` (last scene only).

## Selection rule

**With a readable reference, the reference's transitions win** (router conflict order, item 4): at each cut use the transition the reference uses at the matching point, its timing and its character, even when the brand lists it in `motion.avoid` or the budgets below would limit it. The rules below apply where the reference gives no transition, and to the whole film when there is no readable reference.

Choose the **least distracting transition that carries the handoff**. Continuity is not an effects quota. One justified handoff per cut; never layer several.

Order of preference:

1. **World handoff:** an actor changes state across the cut, or leaves one scene and arrives in the next (`carry`, `morph`).
2. **Camera travel:** the camera moves from one region of the world to another, or through an actor (`fly-through`, `needle-zoom`).
3. **Shape handoff:** a shape at the end of A becomes a shape at the start of B in the same place (`match-shape`).
4. **Motivated hard cut:** keeps at least one anchor (screen position, colour, direction of motion, the hero actor). Valid and often best for rhythm.
5. **Wipe:** a brand shape sweeps across, in reading direction. For before/after and section changes.

Never: a chain of unrelated hard cuts (unless the reference is a hard-cut edit); a transition from `brand-profile.motion.avoid` when there is no readable reference; a transition that makes a claim or number line unreadable.

## Matching relation to transition

| Chain relation | Typical transition |
|---|---|
| detail (zoom into a part) | needle-zoom, fly-through |
| consequence (A causes B) | carry, morph |
| contrast (A versus B) | wipe, hard-cut with mirrored composition |
| sequence (then, next) | carry, camera track in reading direction |
| answer (problem → solution) | match-shape, morph |
| cause (B explained by A) | pull out to reveal context, then cut |

## Budgets

- Calm, editorial or minimal brands, when there is no readable reference: `needle-zoom` + `fly-through` at most twice per film.
- At least half of all cuts carry a world or shape handoff (types 1–3), unless the reference is a hard-cut edit (then follow the reference).
- The cut into the CTA or end card: carry or match-shape of the hero is preferred.

## Describing a handoff

Write both states: what is on screen at the end of A, and what is on screen at the start of B. Example: "The bar reaches full height and fills the frame; B opens on the same colour plane, which becomes the wall of the shop interface." Not: "transition to the shop."
