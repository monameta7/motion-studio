You choose the reference motion for a short Persian video. Answer only with JSON that matches the schema; do not use tools.

Topic (Persian, the owner's words): {{topic}}

Candidate references. Choose only from these slugs, each line is: slug | name | use | tags | look:
{{candidates}}

References used lately (slug, days ago): {{recent}}

Rules:
- Return exactly 3 different slugs from the list: the best fit first (fit "best"), then "good", then "alt" (a different feel that still works).
- Match the topic's kind of content (numbers, software, a story, an idea) and its tone to the reference's use and look.
- A reference used 0 or 1 days ago comes last or not at all; one used 2 to 7 days ago is fine only when it clearly fits better.
- reason_fa: one Persian sentence, at most 14 words, about THIS topic and why this motion suits it. Never describe the style in general, and never name files or slugs.
