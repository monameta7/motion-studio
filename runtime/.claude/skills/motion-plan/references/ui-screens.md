# Product screens (D84)

A product screen is the interface of a product (an app, a site, a SaaS dashboard, a chat) built in code and animated: text is typed, a cursor moves and clicks, panels open, results arrive. It is a `ui` (or `custom`) scene, never a flat picture of a screen. This file owns every rule for it. Each screen is one entry in `ui_screens` (`schemas.md` §D).

## 1. When a screen is planned

- The owner's directions (`[ ]`) ask for it: "rebuild this screenshot", "show the app", "type the prompt and click send".
- An owner image is a screenshot and the directions or the voice line need something on it to move, change or be clicked.
- The owner gives only an idea ("a product intro for a SaaS") and the voice-over talks about using a product.

A photo, a logo, a chart image or a screenshot that only needs to be seen is not a screen; it is an owner asset in `show` mode (L5 §8).

## 2. Two ways, often mixed

| Way | Owner gives | You do |
|---|---|---|
| **Moment by moment** (`source: directions` or `image`) | What happens at each moment, in `[ ]`. | Build exactly those moments, in that order. Where the directions name a moment, the owner's word wins over any rule below. |
| **From an idea** (`source: idea`) | Only the idea. | Design the screen and its states yourself from the voice lines: what the viewer must see the product do, one state per step of the story. |

Mixed: directions cover some moments, you plan the rest in the same style.

`source` is `image` whenever an owner image is the blueprint of the screen, whichever way the moments come.

## 3. Where every value comes from (never a guess)

| Value | From |
|---|---|
| Layout, element sizes, radius, spacing | The owner image, with the numbers in `plan/ui-source/<NN>.json` (the app measured the image's pixels: page background, element boxes, their main colours, in source pixels). Use those numbers; your eye only names what each box is. |
| Colours, icons and logo **of the product** | The same image and file, kept exactly. They are not mapped to brand colours (the one exception to conflict-order item 5). Everything outside the screen (titles, step labels, background, outro) stays the brand's. |
| Every word on the screen | Copied character for character from the image, from the owner's directions, or from the package's on-screen texts. Never written by you. A word in the image you cannot read with certainty: leave that element out and add a risk naming it. |
| With `source: idea` (no image) | Layout and look from the reference's look and the brand tokens; words from the package and the voice lines; product name only if the package states it. No invented feature, number, user name or claim about a real product. Neutral interface words («ارسال», «جستجو», "Search") are allowed. |
| Motion (speed, easing, how panels open) | The reference (conflict-order item 4). §5 below only fills what the reference does not show. |

## 4. States

A screen is a chain of states, each one a complete picture of the interface at a time: empty → typing done → sent → result. One screen has at least two states.

- Each state has `at` (seconds, when it is complete and readable) and `texts` (every word visible on the screen then, exactly).
- A state comes from the image, a direction, or (idea way) a voice line. Never add a state the story does not need.
- The image shows one state. Other states of the same screen are derived only as far as the directions or the voice line say (typing a text the owner gave, a file chip the owner named). Do not invent what the product would answer; if the result is not supplied (text or image), end on the last known state.
- A result made of owner images (a grid of generated pictures) uses those images as owner assets inside the screen.

## 5. Framing for the film's format

A screen works in both formats, 9:16 and 16:9, and in either orientation of the source (a desktop screenshot in a vertical film, a phone screenshot in a horizontal one). The format never limits which screens or states are built; only the framing changes.

- **Always:** keep only the part the story needs; drop browser chrome, extension buttons, sidebars and menus that no state uses. Say what was dropped in `how`. Scale so the smallest text that must be read meets the minimum size and stays inside the safe area of `safe-zones.md` for the film's format; keep the product's proportions inside each element (radius, padding and icon size scale together).
- **Source wider than the film** (a desktop screenshot in 9:16): never shrink the whole screen to fit the width. Frame one region at a time (the input, a card row, a calendar week) at a readable size, and move between regions with the camera; a narrow region (a card, a form) may be re-stacked vertically only if the product itself stacks it that way.
- **Source about the film's shape** (a desktop screenshot in 16:9): the whole screen may be shown at once; still push in on the part being used so its text is readable.
- **Source taller than the film** (a phone screenshot in 16:9): show it as a device-sized column with the film's background around it, or frame part of it; never stretch it.
- The camera goes to the part the voice is talking about (push in on the input while it is typed, pull back for the result). Camera keyframes sit on states or actions.
- **Nothing that must be read crosses the frame edge** at a state's time: list in a state's `texts` only the words fully inside the frame then. The app checks it after the build: a listed text that is cut by the edge fails the film.
- A Latin interface stays LTR, a Persian one RTL (`rtl-grammar.md`).

## 6. Cursor, typing, clicks

- **On the voice's words.** An action that the voice names («می‌نویسیم», «ارسال رو بزن») gets `voice_word: {line, index}` (the word in `audio.json`) and `at` equal to that word's `start`. The app rejects an `at` more than one frame away from it. An action no word names has `voice_word: null`.
- **Cursor path:** a curved path (never a straight line), eased in and out, arriving 0.2–0.3 s before the click and resting; 0.5–0.9 s per move unless the reference shows another speed.
- **Click:** the target reacts (press 0.92–0.96 scale, or a ripple) for 0.12–0.4 s. One `click` sound cue (L6).
- **Typing:** 14–18 characters a second with small seeded variation and a longer gap after a space; a caret that blinks; the full text must be on screen before its state's `at`. Long text may arrive faster (paste) if the directions allow.
- Give each target a short `target` name (`send`, `input`, `plus`). motion-build marks it on the page; the app checks after the build that the cursor tip is on it at the click's time.

## 7. What goes in the plan

- `ui_screens[]`: `id` (`u1`…), `product`, `source`, `asset` (the owner image path, or null), `scenes`, `states`, `actions`, optional `elements` (`name` + `source_box` `[x, y, w, h]` in the image's pixels, taken from `ui-source`), for the parts worth comparing with the image.
- The scenes it lives in: `component: "ui"` (or `custom`), `props.ui_screen: "<id>"`, and in `props` everything needed to build without guessing: the kept elements with their measured boxes and colours, the texts, the framing.
- An image blueprint is listed in `owner_assets` with `mode: "rebuild"`. Its scenes' `asset` stays null: the image is not drawn, the screen is.

## 8. Checks (L8 runs them)

- Every state and action time is inside one of the screen's scenes.
- Every word of every state traces to the image, the directions or the package, and lies fully inside the frame at that state's time.
- Every action with a named word has `at` = that word's `start`.
- `source: image` ↔ the asset is an owner image with `mode: "rebuild"`; every `rebuild` image has a screen.
- No product colour was replaced by a brand colour inside the screen; no brand element was drawn in product colours outside it.
