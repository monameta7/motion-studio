"""sound.py <sound.json> <outdir> : deterministic music bed + SFX, 48 kHz stereo WAV (numpy + scipy only)."""
import json, sys, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
cfg = json.load(open(sys.argv[1])); out = sys.argv[2]
rng = np.random.default_rng(cfg.get("seed", 7))
dur = cfg["duration"]; n = int(dur * SR); t = np.arange(n) / SR

def env(length, a=0.01, r=0.2):
    k = np.arange(length) / SR
    return np.minimum(1, k / max(a, 1e-4)) * np.exp(-k / max(r, 1e-4))

def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], btype="band", fs=SR, output="sos"), x)

def note(f):  # midi -> Hz
    return 440 * 2 ** ((f - 69) / 12)

# ---- music bed: pad chords + soft pulse on the beat ----
bpm = cfg["music"]["bpm"]; beat = 60 / bpm
root = cfg["music"]["root_midi"]
prog = cfg["music"]["progression"]  # semitone offsets of chord roots, one chord per bar
minor = cfg["music"]["minor"]
music = np.zeros(n)
bar = 4 * beat
XF = 0.3  # crossfade between chords, seconds: no clicks at bar lines
for i in range(int(np.ceil(dur / bar))):
    s = int(i * bar * SR)
    if s >= n: break
    e = min(n, int(((i + 1) * bar + XF) * SR))
    seg = t[s:e] - t[s]
    span = seg[-1] if len(seg) else 0
    shape = np.minimum(1, seg / XF) * np.minimum(1, (span - seg) / XF) if i else np.minimum(1, (span - seg) / XF)
    r = root + prog[i % len(prog)]
    for iv in (0, 3 if minor else 4, 7, 12):
        f = note(r + iv)
        music[s:e] += 0.08 * np.sin(2 * np.pi * f * seg) * shape
    # pulse
    for b in range(4):
        ps = s + int(b * beat * SR)
        if ps >= e: break
        L = min(int(0.25 * SR), n - ps)
        k = np.arange(L) / SR
        music[ps:ps + L] += 0.12 * np.sin(2 * np.pi * note(r - 12) * k) * env(L, 0.005, 0.12)
fade = int(1.0 * SR)
music[:fade] *= np.linspace(0, 1, fade); music[-fade:] *= np.linspace(1, 0, fade)

# ---- SFX library ----
def whoosh(L):
    x = rng.standard_normal(L); k = np.arange(L) / L
    lo = bp(x, 300, 1200) * (1 - k); hi = bp(x, 1500, 6000) * k
    return 0.5 * (lo + hi) * np.sin(np.pi * k) ** 2
def pop(L):
    k = np.arange(L) / SR
    return 0.6 * np.sin(2 * np.pi * (900 - 500 * k / k[-1]) * k) * env(L, 0.002, 0.04)
def click(L):
    return 0.5 * bp(rng.standard_normal(L), 2000, 8000) * env(L, 0.0005, 0.01)
def riser(L):
    k = np.arange(L) / SR
    return 0.3 * bp(rng.standard_normal(L), 800, 5000) * (k / k[-1]) ** 2
def impact(L):
    k = np.arange(L) / SR
    return 0.8 * np.sin(2 * np.pi * 55 * k) * env(L, 0.002, 0.35) + 0.2 * bp(rng.standard_normal(L), 100, 900) * env(L, 0.001, 0.08)
LIB = {"whoosh": (whoosh, 0.45), "pop": (pop, 0.12), "click": (click, 0.05), "riser": (riser, 0.8), "impact": (impact, 0.7)}

sfx = np.zeros(n)
for c in cfg["cues"]:
    fn, length = LIB[c["type"]]
    L = int(length * SR)
    # whoosh and riser peak at the cue time; others start on it
    start = int(c["at"] * SR) - (L // 2 if c["type"] == "whoosh" else L if c["type"] == "riser" else 0)
    start = max(0, start); L = min(L, n - start)
    if L > 0: sfx[start:start + L] += fn(L) * c.get("gain", 1.0)

def save(name, x):
    peak = np.max(np.abs(x))
    if peak > 0.89: x = x * (0.89 / peak)  # only prevent clipping; keep relative levels
    wavfile.write(f"{out}/{name}", SR, (np.stack([x, x], 1) * 32767).astype(np.int16))
save("music.wav", music); save("sfx.wav", sfx)
