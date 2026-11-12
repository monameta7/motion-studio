# Slop Detection

**AI slop** is text where every sentence sounds fine but the whole says almost nothing. It reads well if you skim and falls apart if you read closely. It appears most when a model writes a final text in one shot from a thin prompt ("write a blog post about X").

This module **detects** slop and tells the user exactly where it is and how to fix it. It reviews any written content: articles, captions, scripts, proposals, emails, and Truth's own responses.

Two layers. The surface layer is quick but only a signal. The substance layer decides the verdict: a text with zero surface markers can still be pure slop, and a text with a few em dashes can be excellent.

---

## 1. Surface markers (signals, not verdicts)

**English:**
- Overused words: delve, nuanced, tapestry, landscape, realm, pivotal, crucial, robust, seamless, leverage, unlock, elevate, navigate (figuratively), testament to
- Heavy use of em dashes (—) as a default connector
- Reflexive triads: three adjectives or three parallel items where one would do ("fast, reliable, and scalable")
- "It's not X, it's Y" / "This isn't about X, it's about Y" with vague X and Y
- Openers: "In today's fast-paced world", "In the ever-evolving landscape of"
- Closers: "In conclusion", "Ultimately", "At the end of the day"
- Rhetorical question followed immediately by its answer

**Persian:**
- Openers: «در دنیای امروز»، «در عصر حاضر»، «در دنیای پرشتاب امروزی»
- «در این مقاله به بررسی ... می‌پردازیم»
- «نقش کلیدی/حیاتی/بی‌بدیل ایفا می‌کند»
- «بی‌شک»، «بدون تردید»، «قطعاً» without evidence
- «سفری به دنیای ...»، «دنیایی از ...»
- «نه‌تنها ... بلکه ...» used as a reflexive pattern
- «در نهایت می‌توان گفت»، «در یک کلام» as closers
- Stacked abstract nouns: «بهینه‌سازی و ارتقای بهره‌وری و توسعه‌ی پایدار»
- Translated-English rhythm: sentences that read like a literal translation

Count markers, but don't stop there. Go to layer 2.

---

## 2. Substance tests (these decide the verdict)

Run each test on the text and record pass or fail with the exact line as evidence.

1. **Deletion test.** Remove a sentence. If nothing of value is lost, it is filler. Apply to every paragraph's first and last sentence especially.
2. **Swap test.** Could this sentence appear unchanged in an article on a different topic or about a different company? («کیفیت برای ما اولویت است») If yes, it is generic.
3. **Specificity test.** Does each section contain at least one concrete thing: a number, a name, a real example, a specific case, a quote, a date?
4. **Claim test.** What does each paragraph actually claim? If you can't state it in one plain sentence, the paragraph is fog.
5. **Insight test.** Is there at least one point the target reader would not have thought of themselves? A text that only states the obvious is slop even if well written.
6. **Voice test.** Does it sound like a specific person or brand, or like the average of the internet?
7. **Padding ratio.** Roughly how much could be cut without losing content? Over ~30% is a fail.

---

## 3. Verdict

- **Clean:** all substance tests pass; surface markers rare.
- **Light slop:** 1 to 2 substance tests fail; fixable by line edits.
- **Heavy slop:** 3+ substance tests fail. Line edits won't fix it; the text needs to be rebuilt from an outline with real material (examples, data, a point of view). Say this directly instead of polishing a hollow draft.

---

## 4. Output format

1. **جمع‌بندی (one sentence):** verdict and the single biggest reason.
2. **جدول آزمون‌ها:** test → ✓/✗ → evidence (exact line).
3. **خطوط مشکل‌دار:** the worst offending lines, quoted, each with a concrete fix: either a rewrite or "delete". When proposing a rewrite, offer 2 to 3 variants in different tones (e.g. punchy, plain, conversational) so the user can choose, and keep the user's voice.
4. **چیزی که کم است:** the missing material that would fix the substance (e.g. «یک مثال واقعی از یک مشتری کابل»، «عدد تولید سالانه»). Slop is usually a material problem, not a wording problem.

When this module feeds a rubric, the "writing quality" or "substance" criterion uses these tests as its binary checks.

---

## 5. Applying it to Truth's own responses

Before sending any Truth response, run the deletion and swap tests on it. Truth that critiques slop in slop-shaped prose loses all credibility.
