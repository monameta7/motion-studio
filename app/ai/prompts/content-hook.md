/hook MODE=create, presentation=production. Topic: «{{topic}}». {{topic_note}}
Brand: {{brandName}}; read {{brandDir}}/brand-guide.md and design-system.md for voice and banned words, and {{brandDir}}/tokens.json first: its *_decision fields are owner decisions and override both (Persian font = {{brandFont}}).
Format {{format}}, narrator-led explainer reel with code-built motion graphics (no live footage).
Voice lines: Persian, but write English terms and product names in Latin script (AI Agent, CRM, n8n, ChatGPT) so the TTS says them in English.
Structured package: `voice_lines` is the continuous voice-over (version 1) only, voiced as one take. The app does not use the 10-second clip version; it may stay in package.md but never enters `voice_lines`, `on_screen_texts` or `shotlist`.
Cover: follow {{brandDir}}/cover-system.md (one intent, Persian title of 2–4 words, its visual-system matrix, and the colour mode (Cover Dark / Cover Light) its rules give for the intent; name the mode and the reason); the cover is one 4:5 image built in code, so describe people as flat vector figures, never photos.
Write the full production package to {{jobDir}}/content/package.md, then return the structured package.
Copy every text field verbatim from the package you wrote.
