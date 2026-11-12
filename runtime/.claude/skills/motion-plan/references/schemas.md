# Schemas

All files live in `jobs/<slug>/plan/`. Empty arrays or `null` when a source has nothing. Times in absolute seconds unless a field says local.

## §A brand-profile.json (L1)

```json
{
  "brand": "",
  "sources": [{"file": "", "version": ""}],
  "colors": [{"name": "", "hex": "#000000", "role": "background|surface|text|accent|highlight|success|error|other"}],
  "banned_colors": [""],
  "fonts": [{"family": "", "weights": [400, 700], "script": "persian|latin|both", "file": "brand/x/fonts/a.woff2 or null"}],
  "shape": {"radius_px": null, "stroke_px": null, "shadow": null, "grid_px": null},
  "motion_personality": "calm|energetic|technical|editorial|playful|luxury|null",
  "logo": {"files": [""], "placements": [""], "min_width_px": null, "clear_space": null},
  "tone": {"summary": "", "do": [""], "dont": [""]},
  "motion": {"preferred": [""], "avoid": [""], "durations_ms": {"micro": [120, 180], "ui": [180, 260], "reveal": [300, 600]}},
  "outro": {"file": "brand/x/logo-outro.mp4 or null", "duration": 0, "has_audio": false, "use_audio": true, "bg": "#FCFCFC", "logo_hit": 1.0},
  "cover_system": {"file": "", "master": {"w": 1080, "h": 1350}, "zones": [{"id": "A", "from": 0.0, "to": 0.46, "use": ""}], "title_words": [2, 4],
                   "visual_systems": [{"id": "", "use": ""}], "modes": [{"id": "dark|light", "use": ""}], "hard_fails": [""]},
  "style_brief": null,
  "language": "fa"
}
```

## §B audio.json (L2)

```json
{"file": "voice.wav", "duration": 0, "timing": "measured|estimated",
 "lines": [{"id": 1, "text": "", "start": 0, "end": 0,
            "words": [{"w": "", "start": 0, "end": 0, "emphasis": false}],
            "words_source": "aligned|estimated"}],
 "pauses": [{"start": 0, "end": 0}]}
```

## §C concept.json (L4)

```json
{
  "status": "ready|awaiting_review",
  "central_idea": "",
  "chain": [{"id": 1, "lines": [1], "beat": "hook|problem|turn|solution|proof|cta|endcard",
             "understand": "", "see": "", "metaphor": null,
             "becomes": 2, "relation": "cause|contrast|detail|consequence|answer|sequence",
             "handoff": "", "budget_s": 0}],
  "concepts": [{"id": "A", "tier": "conservative|balanced|bold", "metaphor": "", "hero": "",
                "spatial_logic": "", "signature": "", "key_handoffs": [""]}],
  "chosen": "B",
  "reason": "",
  "style_lock": "",
  "world": {"w": 4320, "h": 7680, "regions": [{"id": "", "link": 1, "x": 0, "y": 0, "w": 1080, "h": 1920}]},
  "actors": [{"id": "hero", "role": "", "born": 1, "dies": null,
              "states": [{"link": 1, "form": "", "represents": "", "value_ref": null}]}],
  "camera_path": [{"link": 1, "region": "", "arrive": "push|pull|track|travel-through|hold|cut", "why": ""}],
  "cast": [{"id": "c1", "role": "", "look": "", "colors": ["#000000"], "first_link": 1}],
  "signature": {"link": 0, "description": ""},
  "opening_frame": null,
  "risks": []
}
```

## §D scene-plan.json (L8; L5 writes the scenes, world, actors and camera parts)

```json
{
  "slug": "",
  "version": 2,
  "status": "ready|awaiting_review|blocked",
  "mode": "REEL",
  "format": {"w": 1080, "h": 1920, "fps": 30},
  "duration": 0,
  "total_duration": 0,
  "timing": "measured|estimated",
  "brand": "",
  "language": "fa",
  "direction": "rtl",
  "style_lock": "",
  "hero_element": "",
  "reference": {"slug": "", "visual_language": ""},
  "safe_zone": {"top": 0.14, "bottom": 0.35, "sides": 0.06, "right_rail": 0.21, "right_rail_from": 0.60},
  "chain": [{"id": 1, "understand": "", "scenes": [1]}],
  "cast": [{"id": "c1", "role": "", "look": "", "colors": ["#000000"], "first_scene": 1}],
  "world": {"w": 4320, "h": 7680, "regions": [{"id": "", "x": 0, "y": 0, "w": 1080, "h": 1920}]},
  "actors": [{"id": "hero", "role": "", "born": 0.0, "dies": null,
              "states": [{"at": 0.0, "form": "", "value_ref": null, "morph_to": null}]}],
  "camera": [{"at": 0.0, "x": 540, "y": 960, "zoom": 1, "ease": "reveal"}],
  "owner_assets": [{"file": "jobs/<slug>/input/01.png", "scenes": [2], "how": ""}],
  "scenes": [
    {
      "id": 1,
      "start": 0, "end": 0,
      "voice_line": 1,
      "link": 1,
      "beat": "hook|problem|turn|solution|proof|cta|endcard",
      "understand": "",
      "picture": "", "action": "", "camera": "",
      "purpose": "explain|connect|emphasize|reveal",
      "metaphor": null,
      "component": "title|stat|compare|list|quote|ui|character|diagram|cta|endcard|custom",
      "props": {},
      "texts": [{"text": "", "role": "hook|key|stat|label|cta", "in": 0, "out": 0, "zone": "upper|middle|lower", "value_ref": null}],
      "actor_states": [{"actor": "hero", "form": ""}],
      "key_frame": 0,
      "transition_out": "needle-zoom|fly-through|morph|carry|wipe|match-shape|hard-cut|none",
      "motion_ref": {"transition": {"move": "", "duration_s": 0, "easing": "", "direction": ""},
                     "entrances": {"duration_s": 0, "easing": "", "overshoot_pct": 0},
                     "camera": {"move": "", "speed": "", "easing": ""}},
      "continuity": "",
      "handoff": "",
      "borrowed_from": "r1-s3|NEW",
      "adaptation": "KEEP|ADAPT|NEW",
      "asset": null
    }
  ],
  "outro": {"file": null, "duration": 0, "use_audio": true, "bg": "#FCFCFC", "logo_hit": 1.0},
  "sound": {
    "music": {"bpm": 100, "root_midi": 57, "minor": true, "progression": [0, -4, 3, -2], "file": null},
    "cues": [{"type": "whoosh|pop|click|riser|impact", "at": 0, "gain": 1.0}],
    "seed": 7
  },
  "cover": {
    "status": "ready|missing",
    "headline": "", "subline": "",
    "visual": "", "layout_notes": "",
    "hero_scene": 1,
    "format": {"w": 1080, "h": 1920},
    "grid_safe": {"w": 1080, "h": 1440},
    "system": null, "mode": null,
    "master": null
  },
  "risks": []
}
```

`key_frame` is local seconds from the scene's `start`. `hero_element` = the chosen concept's `hero` actor described in one line. v1 fields keep their v1 meaning; v2 fields are additive.
