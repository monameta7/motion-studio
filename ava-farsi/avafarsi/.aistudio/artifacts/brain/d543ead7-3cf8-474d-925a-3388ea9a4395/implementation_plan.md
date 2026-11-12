# AvaFarsi (آوا فارسی) — Persian AI Text-to-Speech Studio

A high-fidelity Persian (Farsi) Text-to-Speech web studio powered by Google's Gemini TTS audio engine (`gemini-3.8-flash-lite-tts`), designed specifically for natural, fluent Persian pronunciation with full RTL layout, interactive waveform visualization, customizable voice styles, playback adjustments, and instant audio export.

## User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the key architectural directions during clarification:
> - **Engine**: High-quality AI voice generation via Gemini audio (`gemini-3.8-flash-lite-tts`).
> - **Controls & Features**: Speed control, pitch adjustments, voice tone presets, direct WAV audio download, and local speech history.
> - **Interface**: Modern Persian RTL (Right-to-Left) studio layout with an animated audio waveform visualizer and Persian typographic hierarchy.

- **Confirmed Decision 1**: Use server-side Gemini TTS (`gemini-3.8-flash-lite-tts`) via server proxy endpoint `/api/tts` returning pristine 24kHz WAV audio, ensuring natural Persian accent and cadence without client API key leakage.
- **Confirmed Decision 2**: Audio playback controls with real-time Web Audio API `AudioContext` and Canvas waveform visualizer, supporting variable playback rates (0.5x – 2.0x), detune pitch offsets, pause/resume, and instant file download.
- **Confirmed Decision 3**: Comprehensive Persian text helper with one-click diacritics (حرکات و اعراب: فَتْحَه، ضَمَّه، کَسْرَه، تَشْدِید، تَنوین), zero-width non-joiner (نیم‌فاصله), curated sample Persian texts (classic poetry, news bulletin, conversational story), and speech history cache in `localStorage`.

---

## 1. Overview & Core Concept

- **What It Does**: AvaFarsi converts Persian text into clear, fluent, and emotionally resonant speech. Users enter or paste Persian text into a rich editor, select a voice character (Kore, Puck, Charon, Fenrir, Zephyr) and speaking tone (Formal, Storytelling, Friendly, Meditative, Energetic), configure audio settings (speed, pitch), generate speech in seconds, visualize the audio waveform, and download high-quality WAV files.
- **Target Audience**: Content creators, podcasters, Persian language learners, audiobook producers, accessibility users, and software developers needing natural Persian voiceovers.
- **Key Value**: Delivers human-grade Persian phonetics and intonation using Gemini's state-of-the-art TTS model, eliminating the robotic, unnatural sound of legacy web synthesizers while offering studio-grade editing tools.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Input & Enhancement**: User types or pastes Persian text in the primary RTL text box. They can pick from sample texts or use quick diacritic buttons (اعراب‌گذاری) and the half-space button (نیم‌فاصله) to fine-tune pronunciation.
2. **Voice & Style Configuration**: User chooses a voice persona and speaking tone (e.g., گوینده رسمی، داستانی، صمیمی) along with target playback speed and pitch.
3. **Generation & Waveform Playback**: User clicks "تولید گفتار" (Generate Speech). The app streams/fetches the audio via server proxy, activates the animated canvas waveform visualizer, and presents full playback controls (scrubber, timer, loop, volume, speed).
4. **Download & History**: User downloads the 24kHz WAV file with a single click, or revisits previously generated audio from the history drawer.

### Visual Identity & Theme
- **Aesthetic Direction**: Sleek, modern audio studio workstation (dark slate canvas with warm amber and indigo acoustic accents).
- **Color Palette**:
  - Dominant Canvas: Deep studio slate (`#0B0F19` and `#111827`)
  - Structural Surfaces: Elevated card panels (`#1F2937`) with subtle hairline borders (`#374151`)
  - Accent Color: Persian Amber / Warm Gold (`#F59E0B`) and Electric Indigo (`#6366F1`)
  - Status Indicators: Emerald (`#10B981`) for ready/playing states, Rose (`#EF4444`) for errors
- **Typography & Hierarchy**:
  - Persian Font: Clean Vazirmatn / Shabnam fallback system with proper RTL line-height (`leading-relaxed` for Persian text readability).
  - Numerals & Timecodes: Tabular figures (`tabular-nums font-mono`) for playback timers and duration counters.
  - No orphaned headlines (`text-wrap: balance`).
- **Interactive Feedback & Motion**:
  - Live frequency spectrum / waveform animation drawn on HTML5 canvas during playback.
  - Smooth settling button transitions ($\le 200\text{ms}$).
  - Character and word counter with duration estimation.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Server-Side Gemini TTS with Unary WAV Delivery**
  - *Chosen Approach*: Backend endpoint `/api/tts` uses `@google/genai` to call `gemini-3.8-flash-lite-tts`. Unary requests deliver a complete 24kHz mono 16-bit WAV file with RIFF headers.
  - *Why*: Provides the highest phonetic clarity for Persian, zero API key exposure to the browser, and instant downloadability as an industry-standard WAV file.
  - *Alternatives Considered*: Client-side Web Speech API (low voice quality, few or robotic Persian voices) or browser-only streaming (more complex audio buffer concatenation).
- **Decision 2: Web Audio API Integration for Speed & Pitch Shift**
  - *Chosen Approach*: Feed the decoded WAV buffer into an `AudioContext` with an `AudioBufferSourceNode` or configure `HTMLAudioElement` with real-time `playbackRate` and canvas `AnalyserNode`.
  - *Why*: Allows instant real-time speed adjustment (0.5x to 2x) without re-querying the API, saving latency and quota while providing real frequency data for the waveform.
- **Decision 3: Diacritics & Persian Formatting Utilities**
  - *Chosen Approach*: Provide a toolbar with Persian diacritics (ـَ ـِ ـُ ـْ ـّ ـٍ ـٌ ـً), نیم‌فاصله (ZWNJ), and auto-normalization (replacing Arabic ي and ك with Persian ی and ک).
  - *Why*: Persian pronunciation accuracy in AI models increases dramatically when tricky words have explicit diacritics (اعراب‌گذاری).

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      AvaFarsi Client (React + RTL)               │
│                                                                  │
│  ┌───────────────────────┐  ┌──────────────────────────────────┐ │
│  │  Persian Text Studio  │  │   Voice & Style Selector         │ │
│  │  - RTL Textarea       │  │   - 5 Gemini Voice Personas      │ │
│  │  - Diacritics Bar     │  │   - Tone Presets (News/Story...) │ │
│  │  - Sample Prompts     │  │   - Speed (0.5x - 2x) & Pitch    │ │
│  └──────────┬────────────┘  └─────────────────┬────────────────┘ │
│             │                                 │                  │
│             └────────────────┬────────────────┘                  │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │   Audio Player & Canvas Waveform Visualizer                 │ │
│  │   - Web Audio API AnalyserNode & Frequency Canvas           │ │
│  │   - Play, Pause, Seek, Volume, Loop, Speed controls         │ │
│  │   - Direct WAV Download & Local History Storage             │ │
│  └───────────────────────────┬─────────────────────────────────┘ │
└──────────────────────────────┼───────────────────────────────────┘
                               │ POST /api/tts { text, voice, tone }
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Server Proxy (Vite / Express)                  │
│                                                                  │
│  - Reads process.env.GEMINI_API_KEY                              │
│  - Formulates Persian Speech Prompt with speechMetadata          │
│  - Calls @google/genai SDK (gemini-3.8-flash-lite-tts)           │
│  - Returns base64 WAV payload { audioData: string, mimeType }    │
└──────────────────────────────────────────────────────────────────┘
```

### Data Model & Local State
- **Speech Generation Request**:
  - `text`: string (trimmed Persian text, max 2000 chars per generation)
  - `voice`: `'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr'`
  - `tone`: `'formal' | 'narrative' | 'friendly' | 'meditative' | 'energetic'`
  - `speed`: number (`0.75 | 1.0 | 1.25 | 1.5 | 2.0`)
- **Speech History Item**:
  - `id`: string (UUID)
  - `timestamp`: number
  - `textSnippet`: string
  - `voice`: string
  - `tone`: string
  - `duration`: number
  - `audioBase64`: string (cached in IndexedDB/localStorage for instant replay)
