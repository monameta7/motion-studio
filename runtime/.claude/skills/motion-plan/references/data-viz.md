# Numbers and data on screen

## Rule

A number is **shown as a moving, proportioned object**, not only as text. The figure appears as a label on the object, and the object moves or reacts.

| Data | Visual |
|---|---|
| Single value, growth or decline | counter on a bar, ring or hero actor that grows or shrinks to the value |
| Percentage, part of a whole | filled bar or ring; a pie only for a defensible part-to-whole |
| Comparison A vs B | two objects at true scale; the larger grows to the exact ratio |
| Ranking | ordered bars, built in reading direction |
| Steps, process | n connected nodes that build themselves |
| Time | a timeline moving in reading direction |
| Money | the brand's unit object (coin, note, price card) at true count or scale |
| Table | simplified to one comparison graphic that keeps the meaning |

## Integrity

- Every number has a `value_ref` to a claim with a source in the content package. No source → the number is dropped from the screen (the voice may still say it).
- Visual size is derived from the value: `size = base × value / reference_value`. Never exaggerate a difference, never truncate an axis without showing the break.
- No implied precision: a rounded or approximate number ("about 40%") is drawn approximate (no decimals, no false tick marks).
- Units always present on the label.
- Persian digits on Persian screens (motion-build converts).
- If the style brief forbids visible numbers, keep the proportion in the object and record in `risks` that the exact figure is not shown.

## Timing

- The counter or growth starts on the number word in the voice (from `audio.json`) and lands within 0.6 s.
- The label holds for its full readability time (`1.0 + 0.05 × characters`).
- No whoosh, riser or impact during a number line; a pop at the label's `in` is allowed.
