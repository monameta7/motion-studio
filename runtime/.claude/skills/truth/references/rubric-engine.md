# Rubric Engine

A rubric is the strongest tool against sycophancy. When the verdict is built from objective, yes-or-no checks, the model cannot guess which answer the user wants and lean toward it. A vague request like "score it out of 100" does the opposite: the model guesses a number first and justifies it afterward.

Rubrics are **built per task**, not copied from a fixed template. The starter rubrics in section 6 are starting points to adapt, not forms to fill.

---

## 1. When to use

- The user asks for a score, a grade, or "how good is this"
- Truth is the critic inside an iteration loop (hook, story-series, any "until score > X" process)
- Comparing options (A vs B) where a fair, identical yardstick is needed
- Any important review where the user will make a decision based on the verdict

---

## 2. Build order (strict)

1. **Classify the task.** What is this artifact for, who is the audience, what does success look like? (A reel hook succeeds by stopping the scroll; a proposal succeeds by getting a meeting; code succeeds by being correct and maintainable.)
2. **Build the rubric BEFORE judging the content.** If you are about to write the content yourself, build the rubric before writing. A rubric made after seeing the work bends toward what the work already does, especially when the model wrote the work.
3. **Choose 4 to 6 criteria** that matter for *this* task's success. Weights sum to 100. Weight by importance to the goal, not equally by default.
4. **Break each criterion into binary checks.** Each check is answerable with yes or no by looking at the artifact. Each check has its own points; checks within a criterion sum to the criterion's weight.
5. **Show the rubric to the user first** for important or new tasks, so they can edit it. In automated loops, or when the user already approved a rubric for this task type, apply it directly.
6. **Score each check separately**, quoting the evidence (the exact line, timestamp, row, or section). No evidence = the check fails.
7. **Only then sum the points.** The total is arithmetic, never a gut feeling.
8. **Apply caps** (section 4).
9. **Give 3 specific improvements** targeted at the lowest-scoring criteria. Specific means it names what to change and where.

---

## 3. Writing good checks

| Vague (rejected) | Objective (accepted) |
|---|---|
| Are the characters good? | Does every named character have a stated goal? |
| Is the hook strong? | Does the first sentence contain a specific claim, number, or conflict (not a greeting or setup)? |
| Is the article well-sourced? | Does every statistic have a linked source with a date? |
| Is the code clean? | Does every function do one thing, with no function over ~50 lines? |
| Is the proposal persuasive? | Does it open with a problem the client recognizes before mentioning the service? |

A check is valid only if two independent reviewers looking at the same artifact would give the same yes/no.

Partial credit: avoid it. If a check genuinely has degrees, split it into two binary checks (e.g. "at least one example" and "at least one example from the client's own industry").

---

## 4. Caps (override the arithmetic)

- **Factual error** (❌ from research-verify) anywhere: total capped at 50/100 until fixed.
- **Central unverified claim** (❓ that the content depends on): capped at 70/100.
- **Fails the core purpose** (e.g. a proposal that never asks for a meeting, a hook with no hook): capped at 60/100.
- In loops with a pass gate (e.g. "> 9/10"), the gate cannot be passed while any cap is active, however high the other criteria score.

For a /10 scale (hook loop), compute /100 then divide by 10. Do not score directly out of 10.

---

## 5. Iteration loops

- Use the **same rubric** in every round. Changing the rubric mid-loop hides whether the work actually improved.
- Each round, list which checks flipped from fail to pass and which from pass to fail. A score increase with no flipped checks is score inflation.
- If a revision fixes one criterion by breaking another, say so.

---

## 6. Starter rubrics (adapt, don't copy)

### Reel / short-video hook and script
- **Hook (30):** first sentence has a specific claim, number, conflict or question (10); understandable with sound off via on-screen text (10); no greeting, logo or setup before the hook (10)
- **Value (25):** viewer learns or feels one concrete thing (10); one main idea only (10); payoff delivered before the end (5)
- **Accuracy (15):** every factual claim verified (15)
- **Structure & retention (20):** a reason to keep watching every few seconds (10); ending has a clear CTA or loop (10)
- **Brand fit (10):** voice and visual style match the brand guide (10)

### Article / blog post
- **Substance (30):** every section has at least one concrete example, number or case (15); passes the deletion test from slop-detection (15)
- **Accuracy & sourcing (25):** every factual claim has a dated, linked source (15); no Tier-4 sources (10)
- **Structure (20):** thesis stated in the first paragraph (10); each section advances the thesis (10)
- **Audience fit (15):** matches the reader's level; no unexplained jargon (15)
- **Writing quality (10):** no slop markers flagged (10)

### Client proposal (B2B, goal = win a meeting)
- **Opening (25):** opens with a trend or problem the client recognizes (15); 1 to 2 real examples (10)
- **Focus (20):** one topic only (10); no lecturing the client with know-how they could take elsewhere (10)
- **Readability (20):** short and narrative for a middle manager, then CEO (10); minimal technical detail (10)
- **Numbers (15):** price stated once, near the end (10); no ROI section (5)
- **Ask (20):** clearly asks for a meeting (15); scope described by what it covers, without a list of exclusions (5)

### Business idea
- **Problem (25):** a specific customer segment is named (10); evidence the problem is real and paid for (15)
- **Economics (25):** price, unit cost and acquisition cost are stated (10); one customer is profitable on paper (15)
- **Competition (20):** existing alternatives named (10); a stated reason customers would switch (10)
- **Execution (15):** first concrete step identified (15)
- **Risk (15):** the biggest risk is named with a plan to test it (15)

### Code
- **Correctness (35):** handles the stated requirements (15); handles edge cases and errors (10); tests exist or were run (10)
- **Readability (20):** clear names (10); single-purpose functions (10)
- **Security (20):** no secrets in code (10); inputs validated (10)
- **Maintainability (15):** no duplicated logic (15)
- **Performance (10):** no obvious unnecessary loops or queries (10)

### Data analysis
- **Method (30):** numbers computed with executed code, not estimated (20); method stated (10)
- **Answer (25):** directly answers the user's question (25)
- **Traceability (25):** every number says where it came from (15); data issues (missing values, outliers) reported (10)
- **Clarity (20):** a readable chart where useful (10); 3 key insights stated plainly (10)

---

## 7. Output template

```
روبریک: [نام تسک]
| معیار | وزن | سنجه | ✓/✗ | امتیاز | مدرک |
|---|---|---|---|---|---|
| ... | 30 | ... | ✓ | 10 | «نقل دقیق یا محل در متن» |

جمع: X/100  (سقف فعال: [اگر هست])
۳ پیشنهاد برای ضعیف‌ترین معیارها:
1. ...
```
