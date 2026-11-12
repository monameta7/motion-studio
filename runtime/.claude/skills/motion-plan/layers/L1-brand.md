# L1 — Brand

Output: `jobs/<slug>/plan/brand-profile.json` (shape in `references/schemas.md` §A).

## 1. Find the brand resources

Search the project, in this order: `brand/<name>/` folders; design-system files (`design-system*`, `*tokens*.json`, DTCG files, CSS variable files); a cover design system (`cover-system*`, `*cover*system*.md`); brand guide or brand book; tone or voice documents; fonts (`*.ttf`, `*.otf`, `*.woff2`); logos (`logo*.svg|png`). Read every file found in full.

Priority when sources disagree on **identity** (colours, fonts, logo, outro, cover): **owner decision recorded in the tokens file (a `*_decision` field) > design system > brand guide > reference video > neutral defaults**; a newer version of a document beats an older one. For the cover only, the cover design system beats the general design system (except an owner decision).

**Motion language** (camera, transitions, rhythm, composition, layout, animation style, durations, easing) is the reference's, not the brand's (router conflict order, item 4). `motion` below records the brand's rules so they can be used when no reference is readable.

**Look rules are the reference's too (D55).** The brand guide's bans on 3D, depth, shadow, glow, gradients, textures or "flat / minimal / calm / white background" are recorded in the profile only as `fallback_look`; with a readable reference they are not constraints: the reference's dimensionality, light, shadow, materials and background feel win. Colours, fonts, logo, outro and cover stay the brand's. Leave `shape.shadow` as `null` unless the film has no reference.

Which brand: `config.brand`; else the brand the content package names; else the only brand folder; else stop (`status: blocked`).

## 2. Fill the profile

- `cover_system`: when a cover design system exists, its file, the master cover size, the zone map, the title word range, its visual systems (id, when to use), its colour modes and its hard-fail list, all copied from that file. Absent: `null`.
- `motion`: from the brand's motion rules (preferred moves, moves to avoid, durations).
- `fallback_look`: one line copied from the brand's look rules (3D, shadow, depth, background, flatness), used only when there is no readable reference. Optional field.
- `outro`: when the brand folder holds a logo outro clip (`logo-outro.*`, or one the brand guide names): `ffprobe` its duration and audio stream, sample its first-frame background colour, and take `logo_hit` (the second the logo completes) from a brand note or by looking at frames; `use_audio` comes from `config.outro_audio` (default true when the clip has audio). No clip: `file: null`.
- No brand resources at all: derive a restrained neutral palette and a type pair with Persian support (Vazirmatn) from the reference, set `"brand": "none"`, list it as a risk.

Empty arrays or `null` when the source has nothing. Never invent a token the sources do not support.

## 3. Style brief (optional)

When a style brief is supplied, read it as art direction inside the brand:

- It may choose among brand-compatible options (medium 2D/3D, density, mood, rendering, transition character) and add explicit exclusions.
- It never overrides an owner decision, a colour token or a banned colour. A conflict is resolved for the brand and recorded as a risk. It does not override the reference's motion language either; with no readable reference it never overrides `motion.avoid`.
- Store it verbatim in `style_brief`; the resolved effect is written by L4 into `style_lock`.

## Exit

`brand-profile.json` written; at least one font with `script` `persian` or `both` when the language is Persian; every colour has a role.
