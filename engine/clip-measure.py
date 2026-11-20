# Responsibility: two measurements of one video clip for the clips stage (Phase 11.6, docs/13 V16, V18): seconds of speech in its audio (faster-whisper's voice detector; its words are never trusted) and the colour-histogram correlation with the clip before it.
# Usage: python -I clip-measure.py --wav clip.wav [--cur cur.rgb --prev prev.rgb --w W --h H]
#   clip.wav: 16 kHz mono 16-bit (ffmpeg); *.rgb: raw rgb24 frames at 4 fps, W x H (ffmpeg). Prints one JSON line.
import argparse
import json
import wave

import numpy as np


def speech_seconds(wav_path):
    from faster_whisper.vad import VadOptions, get_speech_timestamps
    with wave.open(wav_path, "rb") as w:
        rate = w.getframerate()
        raw = w.readframes(w.getnframes())
    if not raw:
        return 0.0
    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    spans = get_speech_timestamps(audio, VadOptions(), sampling_rate=rate)
    return round(sum(s["end"] - s["start"] for s in spans) / rate, 2)


def histogram(path, w, h):
    data = np.fromfile(path, np.uint8)
    frame = w * h * 3
    n = len(data) // frame
    if n == 0:
        return None
    px = data[: n * frame].reshape(-1, 3)
    # 32 bins per channel over every sampled frame of the clip (the 11.1 measurement).
    return np.concatenate([np.histogram(px[:, c], bins=32, range=(0, 256))[0] for c in range(3)]).astype(np.float64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wav")
    ap.add_argument("--cur")
    ap.add_argument("--prev")
    ap.add_argument("--w", type=int)
    ap.add_argument("--h", type=int)
    a = ap.parse_args()
    out = {"speech_s": None, "drift": None}
    if a.wav:
        out["speech_s"] = speech_seconds(a.wav)
    if a.cur and a.prev and a.w and a.h:
        x, y = histogram(a.cur, a.w, a.h), histogram(a.prev, a.w, a.h)
        if x is not None and y is not None and x.std() > 0 and y.std() > 0:
            out["drift"] = round(float(np.corrcoef(x, y)[0, 1]), 4)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
