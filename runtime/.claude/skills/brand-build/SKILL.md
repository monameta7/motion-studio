---
name: brand-build
description: Write one brand core document (brand guide, design system, cover system, or the text part of tokens.json) for a short-video motion studio, from the owner's questionnaire answers and the colours, fonts, logo and outro the app already decided in code. Persian documents, production depth, no invented facts.
---

# brand-build

## What you are given

The prompt names:

- `DOC=` one of `brand-guide`, `design-system`, `cover-system`, `tokens`, and `brand=<slug>`.
- `answers.md`: the owner's questionnaire answers, in Persian, section by section. Empty questions are left out.
- `tokens.json`: what the app decided **in code**: brand names, the exact colours with their roles, the Persian and Latin font families, the logo file, the outro (file, background, tagline, timing). These values are final. Copy them exactly; never change, add or "improve" a colour, a font, a hex code or the outro.
- For `cover-system`: the brand's `design-system.md` (read it; the cover system must agree with it).
- Sometimes a **quality template** folder: another brand's hand-made documents. Read them only to learn the expected **structure, depth and kind of rules**. Never copy their words, colours, names, services, numbers, stories, personas or examples. Nothing of that other brand may appear in your document.
- `Write exactly one file: <path>`: the only file you write. Write nothing else, anywhere. Never edit the brand folder.

## The rules that beat everything else

1. **No invented facts.** Every fact about the brand (numbers, prices, dates, clients, results, years, awards, services, team, stories, quotes) comes from `answers.md`. If the answers do not give it, do not write it. Where a section needs facts the answers do not have, write one short line: «در پاسخ‌ها نیامده؛ تا کامل نشود، محتوا درباره‌اش چیزی نمی‌سازد.» Never placeholders such as `TODO`, `TBD`, `[…]`, `{{…}}`, «مثال: …» standing in for real content.
2. **The owner's words win.** Banned words, red lines, address form (تو/شما), narrator (من/ما), CTA sentences and approved bios are copied verbatim. Rules you derive must never contradict them.
3. **Identity only, never motion law.** The brand owns colours, fonts, logo, outro and cover. In every film the reference video owns the motion language and the look (camera, transitions, rhythm, layout, animation style, easing, 2D/3D, depth, light and shadow, materials, background feel). Motion and look rules you write are a **fallback used only when no reference is readable**. Never write absolute bans on 3D, shadow, depth or any motion; write preferences.
4. **The logo appears only in the outro** (the code-built `logo-outro.mp4`), never inside a film's body. Covers may carry a small logo signature as the cover system says.
5. **Persian, right to left, plain.** Documents are in Persian (Latin only for font names, hex codes, product names and technical ids). Persian digits in prose; hex codes and pixel values stay Latin. Short, direct, rule-shaped sentences («این کار را بکن»، «این را نکن، به‌جایش …»). No marketing fluff, no AI clichés (also the `ai_isms` the owner listed).
6. **Usable by another model.** Each rule must be checkable: a value, a range, a list, a do/don't pair, or a test. Prefer tables and lists over essays.

## DOC=brand-guide → `brand-guide.md`

The voice and message bible the script writer (hook) and the fact checker (truth) read. Structure (headings `#`, `##`; keep the order; skip a subsection only when the answers give nothing for it, with the one-line note of rule 1):

1. `# <نام برند> — راهنمای برند` and a 3–5 line summary: who, for whom, the result, how.
   When `answers.md` has a section «ده قانون طلایی»: right after the summary write `## ده قانون طلایی` with the owner's rules verbatim, numbered, in the owner's order; never add, drop, merge or reword a rule. No such section in the answers: no such heading.
2. `## هویت`: one-liner (verbatim), mission, vision, values (each with «در محتوا یعنی»), story (only the owner's facts), the face of the brand, official addresses.
3. `## جایگاه و تمایز`: category, alternatives, differentiators with their benefit, positioning statement, points of view («باور ← پس ما …»).
4. `## مخاطب`: main audience as a concrete person, other segments, goals, pains (in the audience's own words when given), objections with the owner's honest answers, conditions, who it is not for. Personas only from these answers.
5. `## داستان برند (StoryBrand)`: hero (the customer) and what they want; problem on three levels (external, internal, philosophical); the brand as guide (empathy + authority: only real proof); the plan in steps; the CTA; what failure costs; what success and the identity change look like.
6. `## محصولات و پیشنهادها`: each offer exactly as given (name, what, for whom, price, format, status, link, when to mention it), free offers, customer path, sales rules, upcoming dates. Never a price or date not in the answers.
7. `## پیام‌ها و اثبات‌ها`: core message, key messages with proof, the proof library as a table (claim | source and date). State: «هیچ عددی بیرون از این جدول درباره‌ی برند گفته نمی‌شود.»
8. `## صدا و لحن`: «صدای ما هست / نیست» pairs; the four tone sliders turned into behaviour (رسمی↔خودمانی، جدی↔شوخ، محترمانه↔بی‌پروا، پرشور↔خونسرد: what the position means in a reel script); address and narrator; register; tone by situation; signature phrases; what the owner's samples teach (rhythm, sentence length, word choice), without copying their facts.
9. `## قواعد زبان`: approved words, banned words (verbatim, with alternatives when given), AI clichés to avoid, technical terms (English terms in Latin script so the voice reads them in English), consistent spellings, mechanics (half-space, «», Persian digits).
10. `## استراتژی محتوا`: goals in order, platforms, pillars with share and sample topics, formats and their rules (reels structure, caption, CTA), sales share, series, cadence, data learnings, trusted and untrusted sources.
11. `## خط قرمزها`: banned claims, accuracy rules, banned topics, sensitive moments, privacy, AI-use policy, legal notes. Written as hard rules a reviewer can fail a script on.
12. `## نمونه‌ها`: good examples with why; bad → better pairs; inspirations and what to take from them.
13. `## چک‌لیست پیش از انتشار`: 8–12 yes/no checks built from the rules above (voice, banned words, proof, CTA, red lines).

## DOC=design-system → `design-system.md`

The identity system for code-built motion graphics, covers and thumbnails. Structure:

1. `# <نام برند> — سیستم طراحی` with version 1.0 and a short purpose and scope (films, covers, slides; not UI products unless asked).
2. `## اصول طراحی`: 3–5 principles drawn from the answers (look, voice, audience). Each: what it means, do, don't.
3. `## رنگ‌ها`: a table of **every colour of tokens.json, exact hex, name and role** (no other colour anywhere in the document). Semantic roles (background, surface, text, accent, highlight, success); suggested usage ratios on light and on dark grounds; approved pairings with text contrast (state the WCAG contrast you computed for text on its background, ≥ 4.5:1 for body text); colours to avoid as brand colours (derived from the answers' look, e.g. off-brand hues); error style (a dashed frame in the text colour, never red unless red is a brand colour).
4. `## تایپوگرافی`: the Persian and Latin families **exactly as tokens.json names them**; weights by role; a type scale for 1080×1920 and 1080×1350 (px); Persian line height (headings 1.25–1.45, body 1.7–2.0); at most two families per film; numbers as a visual device; RTL/LTR and mixed text rules.
5. `## فضا، شبکه و شکل`: 8-pt spacing, safe areas for 9:16 (top 14 %, bottom 35 % kept clear of key text) and 4:5, grid, alignment (RTL first), radius, strokes, shadow as a default preference (not a ban).
6. `## حرکت (فقط وقتی مرجع خوانا نیست)`: personality (one of calm, energetic, technical, editorial, playful, luxury) with the reason from the answers; preferred moves; durations in ms (micro, UI, reveal). Say explicitly that a readable reference overrides this section.
7. `## لوگو`: logo only in the outro; the outro as the code made it (background, tagline, timing from tokens.json); never stretched, recoloured or placed inside a scene body.
8. `## موتیف‌ها و تصویر`: visual motifs that fit the brand, motifs to avoid, illustration and character style (people as figures in brand colours; never a real person's likeness), icon style, photography direction only if the answers mention photos.
9. `## داده و نمودار`: rules for numbers, KPI cards, line/bar/donut charts in brand colours.
10. `## الگوهای چیدمان`: 6–10 named layouts for reels and slides (title typography, number + context, card grid, problem vs solution, timeline, quote, CTA block…), each with zones and colour use.
11. `## کنترل کیفیت`: hard-fail list (wrong hex, extra colour, wrong font, unreadable Persian, text in unsafe zones, logo inside the body) and a short approval checklist.

## DOC=cover-system → `cover-system.md`

The cover rules the script writer and motion-plan L7 read. Covers are **one 4:5 image built in code** (1080×1350); people are drawn as figures in brand colours, never photos. Structure:

1. `# سیستم کاور <نام برند>` + `## قانون تقدم`: this document → the design system → defaults; the content stage owns the words.
2. `## هدف کاور`: stop the scroll, promise one result, be readable in the profile grid; success criteria.
3. `## نسبت و منطقه‌ها`: master 4:5 1080×1350; zones with exact fractions of the height: **A 0–0.46 title, B 0.46–0.88 hero / proof / interface, C 0.88–1.0 small logo signature** (adjust only with a reason from the brand); profile-grid safety.
4. `## تیتر`: Persian title of **2–4 words**, at most 2–3 lines, one dominant word, right-anchored; font and weights from the design system; what makes a good title for this audience (from the answers).
5. `## مودهای رنگ`: exactly two modes, named **Cover Dark** and **Cover Light** (the script writer's prompt names them so; ids `dark` and `light`), each with background, text and accent hex **from tokens.json only**, and when to use each (by intent).
6. `## Intentها`: 6–8 content intents of this brand (e.g. tutorial, myth vs fact, case result, offer, tool review, behind the scenes), each with its default mode.
7. `## سیستم‌های بصری`: 3–4 visual systems with ids `<BRAND>-C1 … C4` (Latin brand prefix), each: name, when, hero, layout in zones A/B/C, what proof looks like, what to avoid.
8. `## ماتریس انتخاب`: a table intent → visual system → mode, so one choice follows from the intent.
9. `## انسان و کاراکتر`: when a person leads the cover, poses, how figures are drawn in brand colours.
10. `## شاهد بصری`: proof, not decoration: only numbers and results from the brand guide's proof library.
11. `## واژگان و ادعا`: approved and banned words for titles; claim rules (the brand guide's red lines).
12. `## Hard fail`: a numbered list a reviewer checks on every rendered cover (wrong hex, extra colour, title over 4 words, text in zone C, unreadable Persian, invented number, logo too big, photo of a real person…).
13. `## پروتکل اجرا`: content lock → proof check → title → hero → visual system → mode → render → hard-fail review.

## DOC=tokens → the JSON file named in the prompt (`tokens-text.json`)

Only the parts of tokens.json that describe how the brand feels; the app merges them with the code fields. Write **one JSON object, nothing else** (no Markdown fence, no comment):

```json
{
  "tone_summary": "one Persian sentence: the voice in practice",
  "motion_personality": "calm | energetic | technical | editorial | playful | luxury",
  "banned_colors": ["English colour words that are off-brand, e.g. \"neon green\""],
  "error_style": "dashed <text hex> frame, never red",
  "numbers": "how numbers are styled (one English line)",
  "shape": {"radius_px": 0, "radius_ui_px": 4, "radius_max_px": 8, "stroke_px": 1, "shadow": null, "grid_px": 8},
  "motion": {"preferred": ["fade", "masked reveal"], "avoid": [], "durations_ms": {"micro": [120, 180], "ui": [180, 260], "reveal": [300, 600]}},
  "color_ratios": {"<hex>": "70-82%"}
}
```

- `motion.avoid` stays empty unless the owner's answers name a move to avoid (the reference wins anyway).
- `shadow` is `null` (no default shadow) or a short CSS-like description; never a ban word.
- Every hex in `color_ratios` and `error_style` is a colour of tokens.json.
- Values must agree with the design system when it exists.

## Before you finish

Re-read your file once and check: one file written at the given path; Persian; every hex in it belongs to tokens.json (design and cover systems name every brand colour at least once); font families exactly as tokens.json; no fact, number, price, client or story that is not in `answers.md`; no word on the banned list; no placeholder left; nothing from the template brand. Then stop. Do not summarise the document in your reply; one short line is enough.
