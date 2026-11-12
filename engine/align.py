"""Responsibility: give every script word of every voice line a start and end time, by matching faster-whisper's recognised words to the script (docs/10 Alignment).

Usage: python engine/align.py <job>/voice/lines.json [--model small] [--language fa] [--device cpu] [--compute-type int8]
Reads each line's `file` (relative to the job folder), writes `words` and `words_source` back into lines.json, prints a JSON summary.
No network is needed once the model is in the local cache.
"""
import argparse
import difflib
import json
import os
import re
import sys
import unicodedata

MAX_COUNT_DIFF = 0.30   # docs/10: word counts differ by more than 30% -> estimated
MIN_MATCHED = 0.50      # fewer matched script words than this -> estimated (the timing would be mostly interpolation)
MIN_WORD_S = 0.02


def norm(token):
    """Comparison form of a word: no marks or punctuation, Persian letter forms, no ZWNJ, lower case."""
    t = token.replace("ي", "ی").replace("ك", "ک").replace("‌", "")
    t = "".join(c for c in unicodedata.normalize("NFKC", t) if unicodedata.category(c)[0] in "LN")
    return t.lower()


def script_tokens(text):
    return [w for w in text.split() if norm(w)]


def _spread(words, t0, t1):
    """Distribute [t0, t1] over words by character count; returns [(start, end)]."""
    weights = [max(len(norm(w)), 1) for w in words]
    total = float(sum(weights))
    out, t = [], t0
    for w in weights:
        d = (t1 - t0) * w / total
        out.append((t, t + d))
        t += d
    return out


def align_words(script, rec, duration):
    """script: list of script words; rec: list of (word, start, end) from the recogniser.

    Returns (words, source, stats). words = [{"w", "start", "end"}]; source = "aligned" | "estimated".
    """
    n = len(script)
    if n == 0:
        return [], "estimated", {"words": 0, "exact": 0, "paired": 0, "interpolated": 0, "recognised": len(rec)}
    count_diff = abs(len(rec) - n) / n
    a = [norm(w) for w in script]
    b = [norm(r[0]) for r in rec]
    exact = paired = 0
    times = [None] * n  # (start, end) when taken from the recogniser

    if rec and count_diff <= MAX_COUNT_DIFF:
        sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                for k in range(i2 - i1):
                    times[i1 + k] = (rec[j1 + k][1], rec[j1 + k][2])
                exact += i2 - i1
            elif tag == "replace":
                if i2 - i1 == j2 - j1:
                    for k in range(i2 - i1):
                        times[i1 + k] = (rec[j1 + k][1], rec[j1 + k][2])
                    paired += i2 - i1
                else:
                    # different word counts for the same stretch (for example an English term heard as two words): share the stretch by length
                    for k, span in enumerate(_spread(script[i1:i2], rec[j1][1], rec[j2 - 1][2])):
                        times[i1 + k] = span
                    paired += i2 - i1
    matched = exact + paired
    if not rec or count_diff > MAX_COUNT_DIFF or matched / n < MIN_MATCHED:
        spans = _spread(script, 0.0, duration)
        words = [{"w": w, "start": round(s, 3), "end": round(e, 3)} for w, (s, e) in zip(script, spans)]
        return words, "estimated", {"words": n, "exact": exact, "paired": paired, "interpolated": n - matched, "recognised": len(rec)}

    # Fill the gaps (script words the recogniser did not hear) between their timed neighbours.
    i = 0
    interpolated = 0
    while i < n:
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < n and times[j] is None:
            j += 1
        t0 = times[i - 1][1] if i > 0 else 0.0
        t1 = times[j][0] if j < n else duration
        if t1 < t0:
            t1 = t0
        for k, span in enumerate(_spread(script[i:j], t0, t1)):
            times[i + k] = span
        interpolated += j - i
        i = j

    words, prev_start = [], 0.0
    for w, (s, e) in zip(script, times):
        s = min(max(s, prev_start, 0.0), max(duration - MIN_WORD_S, 0.0))
        e = max(s, min(max(e, s + MIN_WORD_S), duration))
        words.append({"w": w, "start": round(s, 3), "end": round(e, 3)})
        prev_start = s  # words may overlap a little but never start before the previous one started
    return words, "aligned", {"words": n, "exact": exact, "paired": paired, "interpolated": interpolated, "recognised": len(rec)}


def load_audio_16k(path):
    """Reads a WAV with scipy and resamples to 16 kHz float32; avoids PyAV, which cannot open files with the installed faster-whisper (Phase 0, risk 10)."""
    import numpy as np
    from scipy.io import wavfile
    from scipy.signal import resample_poly
    from math import gcd
    rate, data = wavfile.read(path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if data.dtype.kind == "i":
        data = data.astype(np.float32) / float(np.iinfo(data.dtype).max)
    else:
        data = data.astype(np.float32)
    if rate != 16000:
        g = gcd(16000, rate)
        data = resample_poly(data, 16000 // g, rate // g).astype(np.float32)
    return data


def recognise(model, audio, language):
    segments, _info = model.transcribe(audio, language=language, word_timestamps=True, beam_size=5, vad_filter=False)
    out = []
    for seg in segments:
        for w in seg.words or []:
            if norm(w.word):
                out.append((w.word.strip(), float(w.start), float(w.end)))
    return out


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("lines_json")
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default="fa")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute-type", default="int8")
    args = ap.parse_args(argv)

    path = os.path.abspath(args.lines_json)
    job_dir = os.path.dirname(os.path.dirname(path))
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)

    from faster_whisper import WhisperModel
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)

    summary = []
    for line in doc["lines"]:
        audio = load_audio_16k(os.path.join(job_dir, *line["file"].split("/")))
        rec = recognise(model, audio, args.language)
        words, source, stats = align_words(script_tokens(line["text"]), rec, float(line["duration"]))
        line["words"], line["words_source"] = words, source
        summary.append({"id": line["id"], "source": source, **stats})

    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)

    total = sum(s["words"] for s in summary) or 1
    in_aligned = sum(s["words"] for s in summary if s["source"] == "aligned")
    heard = sum(s["exact"] + s["paired"] for s in summary)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps({
        "lines": summary,
        "words": total,
        "words_in_aligned_lines_pct": round(100.0 * in_aligned / total, 1),
        "words_matched_to_speech_pct": round(100.0 * heard / total, 1),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
