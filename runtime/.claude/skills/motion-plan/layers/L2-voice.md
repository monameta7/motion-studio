# L2 — Voice

Outputs: `jobs/<slug>/plan/voice.wav`, `jobs/<slug>/plan/audio.json` (shape in `references/schemas.md` §B).

The real audio sets every time in the film. Never estimate when audio exists.

## 1. Master voice file

Build one `voice.wav` (48 kHz mono):

- One file per line: concatenate in order with a fixed gap (0.15 s of silence, or the gap the package specifies).
- One full file: use it as is.

## 2. Line times

Measured on `voice.wav`:

- Per-line source: start and end follow directly from each file's `ffprobe` duration plus the gaps.
- Full-file source: `ffmpeg -af silencedetect=noise=-30dB:d=0.25`, map the segments to script lines in order. If the segment count differs from the line count, use word timestamps (step 3) to place line boundaries.

## 3. Word times

faster-whisper with `word_timestamps=True` on each line's span. The script text stays the truth; borrow only timings, aligning recognised words to script words in order. If alignment fails for a line (word counts differ by more than 30%), distribute that line's span across its words in proportion to character count and mark the line `words_source: estimated`.

## 4. Pauses

Record every silence ≥0.4 s inside or between lines in `pauses` (start, end). They are preferred places for a reveal or a transition peak.

## 5. Emphasis words

Taken from the **text**, never from loudness or pitch analysis:

1. Words the package marks as emphasis (bold, quoted, listed as key terms or on-screen candidates).
2. Otherwise: every number, every brand or product name, and the single strongest noun or verb of the hook line.

Mark them `"emphasis": true` in the word list. They drive text entries, pops and motion peaks in later layers.

## 6. Tail

With a brand outro, the CTA holds 1.0 s after the last line and the outro follows; without one, the end card adds 1.0 s (0.8 to 1.2 s if the package asks). `duration` in `audio.json` includes this tail.

## No audio at all

Time lines at 2.5 Persian (2.8 English) words per second, set `"timing": "estimated"`, list it as the first risk, and do not create `voice.wav`.

## Exit

`audio.json` written; every package line has `start` < `end`; lines in order without overlap; every line has `words`; `duration` includes the tail; `timing` set.
