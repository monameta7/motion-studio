# Safe zones and cover grid

Fractions of the frame. `config.safe_zone` overrides these when the platform changes.

## Film

- **9:16:** keep text and logos out of the top 0.14 (username, audio label), the bottom 0.35 (caption), 0.06 on each side, and the right 0.21 below 0.60 of the height (like, comment, share buttons). Follows Instagram's Reels UI as published in September 2026.
- **16:9:** 0.05 margins on all sides.

Film size (`scene-plan.format`): 1080×1920 for 9:16, 1920×1080 for 16:9, 30 fps. Both formats take every component, product screen and owner image; only the framing changes. The cover's own size is in §Cover.

```json
{"top": 0.14, "bottom": 0.35, "sides": 0.06, "right_rail": 0.21, "right_rail_from": 0.60}
```

Key visuals (the hero actor at its `key_frame`, a chart's value, a character's face) also stay out of the bottom 0.35 and the right rail.

Text zones in scenes: `upper` (0.14–0.40), `middle` (0.40–0.55), `lower` (0.55–0.65, above the caption area; use rarely). Zones do not overlap; all three stay inside the 9:16 safe area above.

## Cover

- `format`: 1080×1920 for 9:16, 1280×720 for 16:9.
- `grid_safe`: 1080×1440 centred (3:4, 240 px cut top and bottom) for 9:16, as published in September 2026; the full frame for 16:9. Headline, subline and key visual inside it; outside carries only background and secondary shapes.
- With a cover design system, the master (for example 1080×1350) is centred inside the 9:16 frame and lies within `grid_safe`.
