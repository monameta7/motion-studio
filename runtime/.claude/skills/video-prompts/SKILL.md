---
name: "video-prompts"
description: "Turn a brand's content package, its recorded voice and a visual style into the clip plan of a video job: one 10-second clip prompt per clip, all planned together in the first run."
---

# Video prompts

Use this when the app gives a content package (from the hook skill), the timing of its recorded voice, a brand sheet and a visual style, and asks for the clip plan of a video job.

The output is one file, video/clip-plan.json in the job folder. The app fills the template below from it, word for word, into one prompt file per clip and sends each file to the video model. Never run the template yourself and never generate video.

## Fixed rules for every output of this skill

- **Audio:** no voiceover and no speech of any kind in the video. Only background music and ambient sound effects are heard. The Persian narration is never pasted into the prompt, because video models read it aloud as a voiceover. In its place the narration slots carry short English silent beat notes: what each second of the clip is about, with no speakable script. Everything in the prompt is English, and the on-screen lettering in the clip's lettering list is English too (Mahdi, 2026-11-15: video models break Persian letters). The template's audio policy line says this; never remove or change it. Video models tend to voice any narration they read, so every clip prompt also starts with the AUDIO RULE block and ends with the FINAL AUDIO REMINDER block of the template; keep both verbatim and never remove them.
- **On-screen text is terms and titles only (Mahdi, 2026-10-30):** everything shown on the video, drawn by the model or added in editing, is a term or a title of 1 to 3 words on one line. No sentences, no descriptions, no explanations, no captions, no subtitles, nothing else. Explanation lives in the voiceover only. The one fixed exception is the closing-card CTA of the brand sheet (when the sheet gives one), which stays as written, on one line, on the last card only, added in editing and never drawn by the model.
- **One run:** all clips of the reel are written into the clip plan together in the first run. Never deliver them clip by clip, and never wait for an answer between clips.
- **Clip count follows the voiceover (fixed rule, Mahdi 2026-10-23; from the real voice since 2026-11-16):** the clips must cover the whole recorded voiceover. The app gives the real timing of the recorded voice: the start and end second of every line and word on the reel (from voice/lines.json). Clip count N = ceil(voice end second / 10). Never estimate the length from a word count, and never default to a fixed number of clips.
- **Nothing in the prompt gets drawn as text:** video models draw prompt words as labels on screen. In the test video of the 7.9 reel (2026-10-12) the model printed "Carbon Black #1A1A1A", "Rajin Orange #E65100", "DRAWING RULE", "safe Reels space" and a colour name on a thermometer, garbled the Persian, drew 7.94 instead of 7.99 and invented a Rajin logo. So:
  - Colours are written in plain words only, as the brand sheet gives them. No hex codes and no brand colour names anywhere in the prompt. The exact codes stay in the brand files, for editing.
  - Never put a colour, a rule name or an instruction right next to an object in a way that reads as its label ("a dial labelled…", "Text drawing rule:", "safe area").
  - Every Global Style Lock ends with: "never draw colour names, colour codes, notes, rules or labels; no logos, brand names or watermarks."
  - No logo, brand mark, watermark or signature in any clip; the last clip's lower third is a plain empty background.
- **Brand rules apply in three tiers (Mahdi, 2026-11-12: the old rules were stricter than the brand guide and hurt staging and art):**
  1. Always, everywhere: no invented logo or brand name, no invented numbers, specs or certificates, the brand's own work drawn correctly, as the brand sheet says, nothing that looks dangerous.
  2. Brand moments only (the text hook, on-screen terms, the closing card, the cover): the brand sheet's colours, its lettering look and its words to avoid.
  3. Story scenes are free: every thing has its real colour (blue sky, green plants, gold is bright gold-yellow, silver is light gray, ordinary phone screens), and the look comes from the style given with the job, not from the brand palette. The brand's own colour bans remain (the brand sheet's banned colours line). Where a scene needs an accent colour, the brand sheet's main accent comes first. Phone screens show a generic chat or app, never a real app's interface or logo.
- **Character stays the same:** the canonical character description includes its rendering ("the same flat 2D cartoon look in every shot, never semi-realistic") and "mouth stays closed, never talks".
- **The prompt gives the concept, not the scenes (Mahdi, 2026-11-13):** the video model decides how every scene is built, with the 13 phases. The skill never dictates object shapes, positions, a second-by-second action, a start state or an end state. It tells the model what the viewer must understand: the concept of the whole reel and the concept of this clip (step 3). Reason: in the gold-or-copper and power-strip reels the dictated scenes were carried out only in part and the meaning was lost; test prompts that gave the concept alone came out much better (Mahdi, 2026-11-13). Fixed between clips are only the style lock, the recurring character's look and the uploaded last frame.
- **Images go to the video model, not to this skill:** from clip 2 on, the app gives the last frame of the previous clip to the video model together with that clip's prompt. The skill never asks for images.

## Inputs

1. **Content package:** narration or voiceover, shot list, on-screen texts and the text hook. Prefer the text-to-speech version of the narration, which has numbers spelled out in words.
2. **Style reference:** free text in any language. It changes every time.
3. **Voice timing:** the start and end second of every voice line and word on the reel, from the recorded voice.
4. **Brand sheet:** the brand and its audience, its colours in plain words, its banned colours, how its work is shown, its look and light rule (if any), its lettering look, its words to avoid and its closing-card CTA (if any).
5. **Optional:** on-screen text OFF (the default is ON, limited: the text hook and a few terms or titles; see "On-screen text" below).

## On-screen text

**Default ON, limited (Mahdi, 2026-10-12; tightened 2026-10-30).** Only terms or titles appear on the video: each one is 1 to 3 words on one line. No sentences, no descriptions, no explanations, no captions, no subtitles, nothing else (the closing-card CTA is the single fixed exception, see the fixed rules). The model draws only the text hook and a few short English terms; everything else is voiceover. Video models break long Persian text and exact decimals (7.9 reel: «ختللبلبیه؟», «اول dma»، 7.94 instead of 7.99), so keep the drawn text to the minimum:

- At most one term or title per beat, and at most about 4 to 6 in the whole reel, the text hook included.
- If the package's text hook or any package on-screen text is longer than 3 words or explains something, cut it to its key term or title. The full line stays in the voiceover only; it is neither drawn nor added in editing.
- A number appears only inside a term or title (a short number with its noun, 3 words at most), never as a value with an explanation. Exact multi-digit values that the story depends on (limits, tables, results such as 7.41 or 7.99) go to the editing list as a short title, not to the model; otherwise they stay in the voiceover.
- Dials, thermometers, gauges and screens are always described without numerals or scales (for example "the liquid column stands high"), never "a dial reading 40".
- Exact multi-digit values, benchmarks, versions, dates and sources do not go on screen as text; they stay in the voiceover, or appear only as a short title of 3 words at most in the editing list when the story depends on them. Sources and dates are kept as notes in the editing list, not displayed.
- Code, file paths, CLI commands, URLs and model IDs are never drawn by the model and never added in editing; a model or API name may appear only as a term (for example "Transformer", "Agent"), left-to-right.
- Every term or title, drawn or not, is listed in the editing list (step 7), so a broken drawn text can be covered in editing.

**OFF when the job asks for it:** the model draws no text, letters or numbers; it shows levels, bars, marks and empty panels and keeps the upper middle band of the frame plain for terms added in editing.

When text is ON:

- **What goes in the prompt:** the text hook reduced to its key term or title, other titles, and single-term labels (for example one term next to each icon). Nothing else.
- **Length:** 1 to 3 words, one line, per text. Never sentences, descriptions, explanations, captions or subtitles of the narration. A longer text the package wants is cut to its key term; the rest is not shown.
- **Timing:** each term appears together with the narration words it matches, and its approximate times are written in seconds in the clip's lettering list. The text hook term is on screen from the first frame of clip 1 and stays for about 3 seconds.
- **Look:** the text is built in the style of the reel (for example cut-paper letters in a paper-cut style), in the brand sheet's lettering look, high contrast on a plain backing, one accent word at most in the brand sheet's main accent colour.
- **Placement and size:** in the upper middle of the frame, below the top 15% and above the bottom 20%, at most about 80% of the frame width (in the prompt, describe the place in plain words; never write "safe area"), large enough to read on a phone at a glance. In the last clip the lower third stays empty for the logo.
- **Exact rendering:** each prompt asks the model to render the English exactly as written and spelled, left-to-right, with no extra words.

## Steps

1. **Read the narration** from the package.
2. **Split it into 10-second clips.**
   - Timing comes from the real recorded voice: the start and end second of every line and word on the reel, given by the app. Never estimate it from a word count.
   - Clip count N = ceil(voice end second / 10). Example: a voice that ends at 36.2 s needs 4 clips (40 s). This is a fixed rule: the clips must cover the whole voiceover.
   - Place each sentence by its real word times, splitting at sentence boundaries where possible. A sentence may run over a clip boundary; the clip notes then say so (for example "ends about 2 s into clip 3").
   - Never shorten or rewrite the narration to fit a clip count (only the hook skill edits narration). Add clips instead.
3. **Write the concept**, in plain English, as explanation and never as a script to speak. Do not plan scenes; the video model does that.

   **Concept of the whole reel** (one block, identical in every clip prompt), four parts:
   - What the viewer believes before watching (the misconception the narration corrects).
   - What is actually true, with the reason, and the narration's example in words (sizes as "small", "almost three times", not as figures to draw).
   - What the viewer should be able to say after the whole reel with the sound off, as one quoted sentence.
   - Readings that would be wrong (the opposite claim, a comparison read where an addition is meant, "full" read where "far beyond the limit" is meant, an accident or fire where the story is calm).

   **Concept of each clip** (one block per clip):
   - What must become clear in these 10 seconds, in the order the voice says it, and what is not yet shown.
   - "After this clip the viewer should be able to say: …" as one quoted sentence.
   - From clip 2 on, first line: "The uploaded image is the last frame of clip N-1; continue the same picture and the same visual idea that is already in it, do not start a new one."
   - The lettering list (see "On-screen text"): each English term on its own line, without quotation marks, with its approximate seconds and what it belongs to ("attached to whatever shows the cord's limit"). With text OFF, these go to the editing list.
   - Last clip only: it ends on a calm closing frame with the lower third empty.

   Describe ideas, never pictures: no object shapes, colours, positions, gauges, camera moves or second-by-second action.
4. **Write one Global Style Lock** of 60 to 90 English words. It merges the style reference with the brand lock:
   - Keep the style's medium, rendering and motion.
   - Colours in plain words, never hex codes or brand colour names (see "Nothing in the prompt gets drawn as text"). Scenes use real colours; name the brand sheet's colours only for the text and the closing card (see "Brand rules apply in three tiers").
   - Add the brand sheet's banned colours line as the guards.
   - When on-screen text is OFF, add "No text, letters or numbers anywhere in the frame".
   - When on-screen text is ON, add one short line such as "Only specified English terms or titles, as bold rounded [style-matched] letters".
   - End with "never draw colour names, colour codes, notes, rules or labels; no logos, brand names or watermarks".

   Use the same lock in every clip prompt. If a recurring character appears, write one canonical description of it and repeat it word for word in every clip where the character appears. The description always fixes: gender, rough age, skin tone, hair (length, style, colour), clothes with their colours, and one distinctive detail (for example glasses or a scarf), plus the rendering and the closed mouth. Never leave gender or look open: the video model fills an open description differently in each clip (Mahdi, 2026-11-16: in the Phase 11.1 test the café owner was a woman in clip 1 and a man in clip 2).
5. **Write the clip plan; the app fills one copy of the template per clip from it:**
   - The app replaces [PASTE YOUR VISUAL STYLE DESCRIPTION HERE] with the style reference, verbatim, and fills the brand sheet slots from the brand sheet, word for word.
   - The app sets the on-screen text setting to OFF or ON.
   - The app fills TOTAL and the total seconds.
   - The fields of the THIS CLIP block come from the concept blocks of step 3, as you write them in the clip plan. For clip 1, the uploaded image is none; from clip 2 on, it is the last frame of the previous clip.
   - FULL NARRATION and THIS CLIP'S NARRATION are filled with your English silent beat notes, never with the Persian narration. The app starts them with "Silent beat notes (not a script, never spoken):" and writes FULL NARRATION as one line per clip, with the clip number, its reel seconds and one tag: [already generated] for earlier clips, [THIS CLIP] for this clip, [later, not shown] for later clips. For THIS CLIP'S NARRATION, write what each span of this clip's seconds is about, for example "0–4 s: the four questions: cable type, size, length, and delivery place and time."

   Every other line of the template stays verbatim, including the audio policy. When text is OFF, don't write numeric values as digits inside the clip fields.

   When text is OFF, the lettering list is one line: "No generated text, letters or numbers: every term is added in editing. Keep the upper middle band of the frame plain in every shot." When text is ON, the lettering list starts with one plain sentence on how the text is drawn (exact rendering, readable on a phone, upper half of the frame, no quotation marks; no colour codes, never titled "rule"), then gives each term or title exactly as written on its own line, with its approximate seconds. If a text from the previous clip must go, say when it is removed.
6. **Check before delivering:**
   - The clip count equals ceil(voice end second / 10) for the recorded voice, and every narration sentence falls inside some clip's seconds.
   - The lock is identical in all clip prompts.
   - The concept of the whole reel is identical in all clip prompts and has its four parts; every clip concept has its "should be able to say" sentence; from clip 2 on it starts with the continue-the-same-picture line.
   - No clip prompt dictates object shapes, positions, a start or end state or a second-by-second action; the concept describes what must be understood, not what is drawn.
   - From clip 2 on, the uploaded image line carries the first-frame lock, and every prompt has the last-second hold line.
   - FULL NARRATION has one tagged line per clip, the tags match the clip number, and Phase 12, Phase 13 and the last line ask for this clip only.
   - The audio policy line, the AUDIO RULE block at the very start and the FINAL AUDIO REMINDER block at the very end are present and unchanged in every prompt.
   - No hex code, brand colour name, rule name or label-like instruction appears anywhere in the clip prompt; colours are plain words; the brand sheet's banned colours are kept.
   - No dial, gauge, thermometer or screen is asked to show a numeral or a scale when text is OFF.
   - The lock bans logos and drawn labels, and the last clip's lower third is plain.
   - The character description fixes the rendering and keeps the mouth closed, names gender, rough age, skin tone, hair, clothes with colours and one distinctive detail, and is word for word the same in every clip.
   - No invented specs and no forbidden words.
   - No Persian narration sentence and no Persian letter appears anywhere in the prompt; the on-screen terms in the lettering list are English, each on its own line with no quotation marks around it.
   - The numbers match the package.
   - When text is ON: every text in the prompt is a term or title of 1 to 3 words on one line, comes from the package (cut to its key term if longer), has no forbidden words, contains no description, explanation, caption or sentence, and is timed to its narration words.
7. **Deliver everything in one step:** write one file, video/clip-plan.json in the job folder, and nothing else. No chat reply is read. Its fields:
   - `style` (the style's slug, as given), `on_screen_text` ("on" or "off"), `voice_end_s` (as given).
   - `style_lock`: the Global Style Lock of step 4. `character`: the canonical character description, or null when no recurring character appears.
   - `reel_concept`: the concept of the whole reel (step 3), its four parts.
   - `clips`: one entry per clip, in order: `index`, `start_s`, `end_s` (reel seconds), `voice_line_ids` (the voice lines heard in it), `concept` (the concept of this clip, complete as it goes into the prompt: what must become clear, the "should be able to say" sentence, the lettering list, and for the last clip the closing-frame line), `beat_line` (this clip's one line of FULL NARRATION, the beat notes only), `beat_notes` (the lines of THIS CLIP'S NARRATION), `terms` (each on-screen term of this clip: `text` exactly as written in the lettering list, `at_s`, `stands_for`: the package text it stands for).
   - `editing_list`: the editing list: reel seconds, clip, each English term or title and number exactly as written (1 to 3 words each), and where it sits (label on a bar, on a sheet, on the closing card), plus the logo and, as the single fixed exception to the 1-to-3-word rule, the brand sheet's CTA on the last card when the sheet gives one. No descriptions, explanations or subtitles in the list.
   - `notes`: any package text that was cut to a term or dropped from the screen, and any number that can't be shown without text.

## Brand source

The brand rules come from the brand sheet given with the job (job folder: video/brand-sheet.md). If it disagrees with a value in the template, the brand sheet wins; say so in `notes`.

## Brand sheet for a new brand

When the app asks for a brand sheet instead of a clip plan (a brand that has none yet), read the brand's own docs in the brand folder the app names (brand-guide.md, design-system.md, tokens.json) and write one file, the brand sheet path the app names, and nothing else. It has exactly these sections, each a "## " heading with its text under it, in this order: name, brand_and_audience, colours, main_accent, banned_colours, work_shown, look_and_light, lettering, words_to_avoid, cta, notes.
- name: the brand's name in English letters. brand_and_audience: one or two sentences: what the brand is, then "Audience: …". colours: the brand colours in plain words, the main accent first. main_accent: that one colour in plain words. banned_colours: one sentence with the brand's own colour bans. work_shown: one to three sentences on how the brand's work is shown truthfully, and what is never shown. look_and_light: the brand's own look or light rule, or empty. lettering: the brand's lettering look for English text and numbers, in "…-like style" words. words_to_avoid: the brand's banned words, comma-separated. cta: the brand's closing call to action as the docs write it, or "none". notes: anything an editor needs that must never reach a prompt (exact colour codes, Persian forms).
- Every section except cta and notes is English only, with no Persian letter and no colour code; Persian banned words are translated into English.
- Take every fact from the brand docs. Never invent an audience, a colour, a ban, a rule or a CTA; leave a section empty when the docs say nothing about it.

## Template

````
AUDIO RULE, READ FIRST: this clip has NO voice at all. No voiceover, no narration, no speech, no dialogue, no whispering, no singing, no vocals in the music, and no lip-sync; characters never talk or move their lips. This prompt contains no script to speak: the beat notes are silent timing guidance only, and any English words on screen are drawn lettering only, never read aloud. The voice is recorded separately and added in editing. The only audio is a calm instrumental background music bed and ambient sound effects that match what happens on screen.

You are an expert motion designer, visual storyteller, creative director, and AI video director creating a premium YouTube explainer sequence.
I will provide a YouTube narration script.
Your job is NOT to create a collection of unrelated illustrations.
Your job is to transform the narration into one continuous, visually connected motion-graphic story that feels like it was designed and animated by a high-end YouTube motion designer.
The final sequence should feel:
modern • premium • dynamic • intelligent • visually satisfying • playful where appropriate • cinematic • highly intentional
The viewer should feel that the visuals are continuously explaining and advancing the narration rather than simply decorating it.
Interpretation and priority: A continuous visual story means connected narrative and design logic, not necessarily one unbroken camera take. If instructions appear to compete, preserve the meaning and clarity of the narration first, then visual continuity and consistency, then stylistic novelty. Movement, cutting, and visual effects are tools—not requirements in themselves.
[BRAND NAME] PRODUCTION CONTEXT (added for [BRAND NAME])
Brand: [BRAND AND AUDIENCE] Format: a vertical 9:16 short-form reel of [TOTAL] clips of 10 seconds each ([TOTAL x 10] seconds in total). Each clip has its own prompt like this one; this prompt generates exactly one 10-second clip.
Brand lock (always applies, underneath any style brief): story scenes use the real colours of real things and the look of the style brief. The brand colours ([BRAND COLOURS IN PLAIN WORDS]) belong to the on-screen text and the closing card; where a scene needs an accent colour, prefer [MAIN ACCENT]. [BANNED COLOURS] Never write any word of this prompt in the frame: no colour names, colour codes, notes, rules, labels or instructions. [HOW THE BRAND'S WORK IS SHOWN] [LOOK AND LIGHT RULE] Do not invent technical specifications, certifications or statistics. Do not generate any logo, brand name, watermark or signature, including an invented [BRAND NAME] logo; the logo is added in editing. If the style brief conflicts with this brand lock, the style brief decides the look of the scenes, and the brand lock decides the text, the closing card and the bans above.
On-screen text setting: [OFF or ON]
- OFF: no generated text, letters or numbers anywhere in the frame. Terms and titles are added in editing. Follow this template's rules for showing numbers without text, and keep clean empty space where a term will be added.
- ON (default): only the few English terms or titles listed in this clip's concept (the text hook term and short single-term labels), each on one line of 1 to 3 words at most, never sentences, descriptions, explanations, captions or subtitles; draw no other text, letters or numbers anywhere. Render each English term exactly as written and spelled, left-to-right, with no extra words. [LETTERING LOOK], built in the reel's visual style, high contrast, in the upper middle of the frame, below the top edge and well above the bottom fifth. Never use these words: [WORDS TO AVOID].
Audio policy (expressly provided): no voiceover, no narration audio and no speech of any kind. The narration is given only to time the visuals to the words; do not speak it and do not show it as subtitles. The only audio is background music and ambient sound: a calm, modern, minimal music bed, plus natural sound effects that match what happens on screen.

VISUAL STYLE DIRECTION — USER INPUT (OPTIONAL)
YOUR VISUAL STYLE BRIEF (2–6 lines, in your own words):
[PASTE YOUR VISUAL STYLE DESCRIPTION HERE]
How to apply the brief: Treat the text above as the user’s visual art-direction instructions for the entire sequence, not as narration, a scene to reproduce, or a list of decorative effects. The user may describe the look in a few free-form lines; do not require separate fields. Understand descriptions written in any language, while keeping the generation prompts in English. The placeholder alone means no style was provided.

* Respect specifics: Preserve any clearly stated visual constraints, including overall medium (2D/3D/hybrid), palette or exact color codes, shape language, characters, rendering and texture, lighting and depth, composition and backgrounds, motion feel, transition character, typography, aspect ratio, and explicit exclusions. Do not silently replace them with your preferred aesthetic. Specific style descriptions such as vintage, painterly, or monochrome override generic aesthetic adjectives such as “modern” when necessary; keep the craft quality professional.
* Complete only what is missing: Infer unspecified attributes coherently from the supplied style and the narration. If no brief is provided, choose a restrained, fitting visual system using Phase 3. Do not impose the sample wording or an arbitrary new aesthetic.
* One art direction, multiple visual techniques: The chosen look remains recognizable across every beat. Within it, vary diagrams, characters, data graphics, interfaces, and camera methods only when they explain the narration more clearly; vary dimensional treatment only if the brief permits it (for example, never add 3D to an explicitly flat-2D-only brief). Variation in explanatory technique is not permission for unrelated visual styles.
* Priorities and conflicts: Preserve the narration’s meaning, numerical accuracy, and readability; honor the user’s explicit visual constraints next; then choose the clearest continuity and transition method; then add optional stylistic flourishes. For a genuine conflict, use the least disruptive interpretation and briefly identify any unavoidable trade-off instead of ignoring the brief. If the brief prohibits visible text, depict concepts without generated text wherever feasible; do not delete numerical meaning or fabricate illegible lettering.
* Keep sound and narration separate: A visual-style brief does not remove, rewrite, silence, or replace the supplied YouTube narration. It does not imply any audio policy unless the user expressly provides one elsewhere.

GLOBAL STYLE LOCK (generated, not user-filled): After understanding the script in Phase 1, and before designing beats in Phase 2, write one concise English paragraph, normally 60–90 words, summarizing the resolved visual system (expand only if needed to retain all explicit constraints). Include the supplied distinguishing features and enough coherent defaults for consistent production; preserve any exact supplied color values and explicit exclusions. Use this paragraph as the same exact prefix, without paraphrasing, at the start of every Phase 13 AI-video generation prompt. The STYLE LOCK controls the recurring visual identity, while the beat descriptions control what actually happens. If a recurring character is used, also define one canonical, short character appearance description and repeat it verbatim in each clip where that character appears. This is a style-control step, not an additional numbered phase.
PHASE 1 — UNDERSTAND THE SCRIPT
Before designing visuals, analyze the script carefully.
Identify:

* The central idea
* Every major visual beat
* Changes in topic
* Important statistics and numbers
* Comparisons
* Processes
* Cause-and-effect relationships
* Examples
* Human situations
* Emotional moments
* Objects or concepts that can become visual metaphors
* Statements that require visual emphasis
* Moments where a visual transformation can naturally lead into the next idea

Do NOT create visuals yet.
First understand the narrative logic.
PHASE 2 — CREATE A VISUAL STORY
Turn the script into a sequence of connected visual beats.
For every beat, determine:

1. What the viewer should SEE
2. What the viewer should UNDERSTAND
3. What moves
4. What changes
5. How the camera moves
6. What visual element continues from the previous beat
7. How this beat transitions into the next beat

The sequence must behave like ONE visual world.
Avoid:
Scene 1 → hard cut → unrelated scene → hard cut → unrelated scene.
Instead create transitions such as:
character movement → camera follows → object becomes graphic → graphic expands → camera enters graphic → new environment appears
or:
number appears → counter increases → bar grows → camera pushes into bar → bar becomes physical object → object becomes next scene
or:
diagram builds → one node expands → camera travels through node → new visual environment emerges.
Whenever possible, use match cuts, morphs, camera movement, object transformations, scale transitions, wipes, shape transformations and continuous motion.
The transition itself should communicate the story.
Continuity is not a transition-effect quota: A recurring character, shared geometry, consistent movement direction, aligned composition, or a recognizable graphic can connect scenes even across a purposeful cut. Choose one justified handoff rather than layering several effects without a reason.
Transition selection rule: Prefer a visual continuation, match cut, morph, or motivated camera/object transition when it helps the viewer follow the idea. A purposeful direct cut is also valid when it preserves a recognizable visual or narrative link and communicates more clearly than an elaborate transformation. Do not force a morph into every transition, and never replace continuity with a chain of unrelated hard cuts. Choose the least distracting transition that best advances the explanation.
PHASE 3 — VISUAL LANGUAGE
Choose the visual treatment based on what the narration is actually explaining.
Do NOT force everything into one generic style.
Style-brief integration: When the user has supplied a VISUAL STYLE BRIEF, interpret this list as available explanatory techniques within that user's established art direction, not a license to switch to an incompatible aesthetic. Apply the GLOBAL STYLE LOCK to every beat. When no style was supplied, choose a coherent treatment appropriate to the script as originally instructed.
You may intelligently combine:

* Premium 2D motion graphics
* Clean vector illustration
* Minimal cartoon characters
* Editorial illustration
* UI interfaces
* Data visualization
* Kinetic typography
* Isometric environments
* 3D graphic objects
* Abstract visual metaphors
* Collage elements
* Digital interfaces
* Product interface states and interactions
* Selective digital/glitch treatments, only when they clarify a digital concept, disruption, or change
* Retro-futuristic elements
* Y2K-inspired graphics
* Hand-drawn accents
* Subtle cinematic 3D

However, all styles must belong to the same visual system.
Style-selection rule: Select the simplest visual treatment that clearly explains each beat. Introduce a new aesthetic treatment only when the narration benefits from it; carry the established palette, shape language, lighting, typography, motion behavior, and camera logic through that change. Glitch is a storytelling device, not a default transition or decoration. Do not change styles merely to create variety.
For digital sequences, show the interface state and the user/system action that changes it. Use a glitch only if the narration genuinely describes instability, malfunction, interruption, or a digital shift; otherwise prefer clear interface motion.
Maintain consistency in:

* Color palette
* Typography
* Character design
* Shape language
* Lighting
* Composition
* Graphic elements
* Motion behavior
* Camera language

The sequence should feel art-directed, not randomly generated.
PHASE 4 — HUMAN STORYTELLING
Whenever the narration involves people, decisions, behavior, money, work, problems, success, failure, frustration, curiosity or transformation, consider using a recurring simplified human character.
Characters should be:

* Minimal
* Expressive
* Easy to animate
* Visually consistent
* Recognizable across scenes

Do not introduce random characters simply to fill the frame.
Characters should perform meaningful actions:
walking, thinking, working, choosing, reacting, interacting with interfaces, moving objects, pointing toward information, following a path, or experiencing the consequence being discussed.
If one character can logically continue through multiple beats, keep that character.
When the narration has no human situation to clarify, a human character is optional. Do not add one solely to meet a visual convention.
Narrator rule (owner, 2026-11-19): when the narration speaks in the first person as a named person or role (for example "I am Erfan, the technical director"), never invent a different character the viewer could take for the narrator; a woman on screen while a man introduces himself breaks the film. Choose one: (a) no recurring human at all, the clips show the brand's work, services and the viewer's business as objects, interfaces and places (the default for a self-introduction, a brand or service reel); or (b) only when the narration tells a customer's story, a character clearly shown as that customer, never as the speaker. Never draw a real named person: the video model cannot know their face.
Character choice is a content decision, not a default: before writing `character`, name in one line which kind of reel this is (story about a person, self-introduction or brand reel, explainer of a thing or phenomenon) and use a recurring human only for the first kind; for the others `character` is null unless a human situation in the narration truly needs one. An art style that mentions "expressive characters" describes how characters look when used, not a reason to add one.
Cast-continuity rule: When a recurring protagonist makes narrative sense, retain that character as the primary human visual anchor. Additional characters may represent distinct people, roles, or groups only when their presence explains a comparison, interaction, or social situation. Keep supporting characters visually compatible, distinguishable when needed, and subordinate to the main narrative. Do not replace the established protagonist simply for visual variety.
PHASE 5 — DATA VISUALIZATION
Whenever the narration contains:

* Numbers
* Percentages
* Growth
* Decline
* Rankings
* Comparisons
* Time
* Scale
* Revenue
* Statistics
* Quantities
* Steps
* Processes

VISUALIZE them.
Do not merely display the number as text.
For example:
"Sales increased by 40%"
should become:
number counter animates upward → bar grows → surrounding environment reacts → camera follows the growing bar → bar transforms into the next visual.
"Three steps"
should become:
three connected nodes physically build themselves → character moves through them → camera follows → third step transforms into the next scene.
"Company A is twice as large as Company B"
should become:
two visual objects establish scale → one expands to twice the size → labels appear briefly → camera transitions through the larger object.
Use:

* Counters
* Bars
* Lines
* Sliders
* Progress indicators
* Timelines
* Funnels
* Flow diagrams
* Pie or proportional charts when parts of a whole are being explained
* Tables simplified into readable graphic comparisons when tabular information matters
* Scales
* Grids
* Maps
* Icons
* UI elements

But make these elements move and participate in the scene.
Data integrity rule: Preserve the quantities, proportions, units, and comparisons actually stated in the narration. Do not invent statistics, imply an exact scale where none is given, or make a misleading visual comparison. Select a pie/proportional view only for a defensible part-to-whole relationship, and simplify tables without changing their meaning.
Style-aware data treatment: The animated-counter and on-screen-label examples are illustrative, not mandatory text-rendering requirements. If the user's style excludes visible text or numbers, preserve the stated quantities and relations through appropriately scaled, legible visual representations; where an exact figure cannot be communicated without text, flag that limitation rather than pretending the visual conveys an exact value.
PHASE 6 — VISUAL METAPHORS
Whenever the narration explains an abstract concept, find a simple visual metaphor.
Examples:
Growth → object physically expands
Competition → two paths or objects race
Complexity → simple structure becomes increasingly interconnected
Failure → system breaks or path reaches an obstacle
Opportunity → closed path opens
Decision → character reaches a branching path
Automation → repetitive manual actions transform into one automated flow
Time → timeline physically moves through the environment
Information overload → controlled stream becomes increasingly dense
Do not make metaphors overly literal or cliché.
Prefer clever, visually understandable metaphors.
PHASE 7 — PACING
The sequence must NEVER feel static.
Every shot should have meaningful visual activity.
However, avoid meaningless movement.
Good movement:

* Camera push
* Camera pull
* Tracking shot
* Character movement
* Object transformation
* Chart growth
* Shape morphing
* Typography reveal
* UI interaction
* Parallax
* Scale changes
* Environmental movement
* Match cuts

Bad movement:

* Random floating objects
* Excessive particles
* Unnecessary camera shake
* Constant zooming
* Decorative animation with no narrative purpose
* Random objects appearing simply because the frame feels empty

Allow important visuals enough time to be understood.
The pacing should feel energetic but controlled.
Beat-change rule: Consider a new visual beat when the narration changes topic, introduces a new idea, emphasizes an important term, presents a statistic, begins a comparison, or reaches a meaningful conclusion. Do not mechanically add a new shot for every word or sentence; change the image when doing so improves understanding.
Hold-versus-motion rule: Avoid an unchanged illustration sitting on screen for 5–10 seconds without narrative development. A sustained shot or restrained camera is appropriate when it improves comprehension; let objects, information, characters, or visual relationships develop meaningfully within it. Never add motion just to fill time.
When the idea is best understood through a quiet hold, use a stable shot with meaningful development of information or relationships rather than moving the camera by default.
PHASE 8 — TYPOGRAPHY
Do NOT display the narration as subtitles.
Only show text when it adds information.
Use short visual text such as:
"40% GROWTH"
"3 STEPS"
"$340"
"BEFORE → AFTER"
"THE PROBLEM"
"THE SHIFT"
"WHY?"
Use typography as a visual object.
Text can:

* Scale
* Slide
* Build
* Morph
* Follow a path
* Integrate into charts
* Become part of the environment
* Transition into another visual element

Typography must remain highly readable.
Typography versus the user's brief: The sample phrases above are options, not mandatory overlays. Respect any user-specified typography treatment or no-on-screen-text constraint; keep numerical comparisons semantically accurate, and do not replace readable design with pseudo-text. Do not turn narration into subtitles.
PHASE 9 — CONTINUITY SYSTEM
Create recurring visual anchors throughout the sequence.
Examples:

* One recurring character
* One visual path
* One timeline
* One interface
* One geometric shape
* One color accent
* One object that repeatedly transforms
* One environment that gradually evolves

Whenever possible, end each beat with an element already positioned to begin the next beat.
Think of the sequence as a chain:
A → A transforms into B → B moves into C → C expands into D → D reveals E
This chain represents connected meaning, not an obligation to physically morph every object. A motivated match cut or direct cut can preserve the same anchor, relation, or motion direction.
rather than:
A → cut → B → cut → C → cut → D
PHASE 10 — CAMERA LANGUAGE
Use camera movement as storytelling.
The camera should sometimes:

* Follow characters
* Travel through diagrams
* Push into charts
* Pull out to reveal context
* Move between layers
* Orbit important objects
* Track along timelines
* Enter interfaces
* Transition through shapes

Use camera movement to connect ideas.
Avoid excessive cinematic camera movement when a clean graphic transition would communicate the idea better.
A fixed camera is also a deliberate camera choice when it gives the viewer a clearer view of an animation, comparison, or decision.
PHASE 11 — PROFESSIONAL ART DIRECTION
The result should feel like premium YouTube editorial motion design.
Prioritize:
Strong composition
Clear hierarchy
Readable typography
Intentional negative space
Consistent spacing and alignment between text, characters, charts, and UI elements
Consistent graphic language
Controlled color palette
Meaningful animation
Smooth transitions
Visual rhythm
Human storytelling
Data clarity
Visual surprise
Narrative continuity
Avoid:
Generic AI imagery
Overly realistic stock-video aesthetics
Random 3D objects
Unnecessary detail
Overly complicated backgrounds
Generic corporate visuals
Static illustrations
Meaningless particle effects
Overly flashy transitions
Constant camera movement
Text-heavy screens
The goal is clarity + delight, not visual overload.
PHASE 12 — SEQUENCE DESIGN
The visual plan for the whole reel is made before any clip is generated; for this clip the concept to be shown is given in THIS CLIP below. The plan uses these fields:
BEAT
Narration section
VISUAL IDEA
What the viewer sees
ACTION
What is moving/changing
CAMERA
How the camera behaves
KEY GRAPHIC
Important number, object, diagram, character or typography
TRANSITION IN
How this beat emerges from the previous beat
TRANSITION OUT
How this beat naturally creates the next beat
CONTINUITY ELEMENT
What carries forward
EMOTIONAL PURPOSE
What the viewer should feel or understand
Do not design isolated shots.
Design a continuous visual journey.
For the opening beat, describe the scene entry without inventing a previous beat. For the final beat, provide a clear visual resolution without inventing an additional scene. Mark a boundary transition as opening or closing when no adjacent beat exists; this does not require a special frame specification.
PHASE 13 — GENERATION INSTRUCTIONS
The concept of the whole reel and of this clip is given in THIS CLIP below. Design the beats of this clip yourself from it, as one 10-second clip; never fit the beats of other clips into it.
Self-contained visual-style control for every clip: Start every production prompt with the exact, unchanged GLOBAL STYLE LOCK established after Phase 1. Then describe that beat's content, action, camera, relevant visual handoff, and logical ending. Add the canonical recurring-character description verbatim whenever the character appears. Keep the style lock consistent even when the beat uses a chart, interface, new environment, or motivated cut; do not insert a conflicting look. Preserve any requested aspect ratio or explicit visual exclusions. This master prompt is given directly to the video model to generate one 10-second clip of a multi-clip reel; a separate prompt like this one exists for every clip. Other clips are not visible. From the second clip on, the uploaded image is the last frame of the previous clip and the exact first frame of this clip; the first clip has no uploaded image. Follow the global style lock, the canonical character description and the uploaded first frame exactly, so this clip joins the previous one seamlessly.
Each generated clip should:

* Begin from a visually logical state
* End in a state that can naturally continue into the next clip
* Maintain the same visual identity
* Maintain character consistency
* Maintain object consistency
* Maintain lighting and color logic
* Maintain camera direction
* Maintain spatial continuity

When a transition is important, explicitly describe BOTH the starting state and ending state.
For example:
"Camera follows the character toward the rising bar chart. As the character reaches it, the camera pushes directly into the bar. The solid bar fills the entire frame and transforms into the wall of the next environment."
This is preferable to simply saying:
"Show a person looking at a bar chart."
FINAL CREATIVE PRINCIPLE
Think like a motion designer.
Do not ask:
"What cool image should appear here?"
Ask:
"What is the narration explaining, how can I SHOW that explanation, and how can that visual physically become the next idea?"
Every visual must have a narrative purpose.
Every movement must communicate something.
Every transition should help tell the story.
An object does not have to morph physically into the next object. Preserve the narrative link with whichever transition is clearest, including a motivated cut when appropriate.
The finished sequence should feel like one continuous visual explanation, not a montage of AI-generated clips.
It should be:
engaging without being chaotic
beautiful without being decorative
dynamic without being exhausting
informative without being boring
premium without looking generic
THIS CLIP (added for [BRAND NAME])
Clip: [N] of [TOTAL] ([start]–[end] s of the reel), exactly 10 seconds.
Uploaded image: [none: design the opening state | the last frame of clip N-1: it is frame 1 of this clip. Continue from it exactly: same camera position, framing and lens, same objects in the same places, same colours, lighting and character pose. No cut, jump, zoom pop, fade, flash or new element in the first half second; motion starts from rest and eases in]
Global style lock (already resolved; identical in every clip prompt of this reel; use it exactly as written, do not rewrite it):
[GLOBAL STYLE LOCK, 60-90 words, identical in every clip prompt]
Recurring character (canonical, repeat verbatim whenever it appears): [CHARACTER DESCRIPTION, or delete this line]
CONCEPT OF THE WHOLE REEL (the same in every clip prompt; this is what the pictures exist to make clear):
[REEL CONCEPT: what the viewer believes before watching; what is actually true; what the viewer should be able to say after the whole reel with the sound off; readings that would be wrong]
CONCEPT OF THIS CLIP (clip [N] of [TOTAL]):
[CLIP CONCEPT: what must become clear in this clip; "After this clip the viewer should be able to say: …"; the on-screen English lettering list]
How to use the concept: you are the motion designer. Choose the pictures, the metaphor, the staging, the camera and the transitions yourself, using the phases above, so that a viewer with the sound off reaches exactly this understanding. The concept is fixed; how you show it is yours. Keep everything calm and safe unless the concept is about a danger. No numerals, labels or lettering other than the English lettering listed above.
Last-second hold: in the final second the camera stops and every motion settles into a still frame: sharp, no motion blur, nothing half out of frame, no text mid-animation, and any character in the frame in a calm, neutral pose fully inside it.
Generate only this clip. Use the full narration below to understand the whole story and its continuity, but show only the part that matches this clip's narration.

Now generate only clip [N] of [TOTAL] according to this system. The beat notes below are silent timing context: show only the part tagged THIS CLIP; parts tagged already generated were shown in earlier clips and must not be repeated, and parts tagged later must not be shown.
YOUTUBE NARRATION SCRIPT:
FULL NARRATION (context only, one line per clip):
[FULL NARRATION: "Clip k (a–b s) [already generated | THIS CLIP | later, not shown]: beat notes", one line for every clip of the reel]
THIS CLIP'S NARRATION (clip [N] of [TOTAL], [start]–[end] s of the reel; time the visuals of this clip to these words):
[THIS CLIP NARRATION]

FINAL AUDIO REMINDER: generate this clip with NO voice of any kind (no voiceover, narration, speech, dialogue or vocals). Only instrumental background music and ambient sound effects. Negative: voiceover, narrator, speech, talking, dialogue, lip-sync, singing, vocals.
````