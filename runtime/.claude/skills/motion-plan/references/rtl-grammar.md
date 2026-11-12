# Spatial grammar for Persian (RTL)

Applies when `language` is `fa` (or any RTL language). Latin films use the mirror image (LTR).

## Direction of meaning

- **Forward, next, future, progress:** right to left. Objects enter from the right and travel left; the camera tracks right to left to move forward in the chain.
- **Back, past, before:** left to right.
- **Before / after:** "before" on the right, "after" on the left; a wipe from "before" to "after" sweeps right to left.
- **Timelines and step sequences:** start on the right, end on the left. Step 1 is the rightmost node.
- **Growth upward stays upward.** Vertical meaning (up = more) is not mirrored.

## Order of reveal

- Lists reveal top to bottom; items align right.
- Horizontal bar charts and rankings grow from the right edge toward the left; vertical bars build from right to left in sequence.
- Comparison pairs: the subject or the "first" item on the right.
- A title or key text is right-anchored, as in the brand's cover rules.

## World layout

In `concept.json`, regions that come later in the chain sit to the left of (or below) earlier ones, so camera travel through the world reads as forward motion.

## Exceptions

- Real interfaces keep their real layout (a Latin UI stays LTR inside the frame).
- Maps, clocks and physical objects keep their real orientation.
- When the reference video moves left to right, ADAPT mirrors the motion; KEEP may keep it only when direction carries no meaning in that shot. Record the choice in the adaptation map.
