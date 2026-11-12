"""Fixed, deterministic brand outro sting (3.7 s, 48 kHz stereo), synced to the outro template (copy of brand/mahdiyar/outro-src/sting.py; usage: python sting.py out.wav)."""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR, DUR = 48000, 3.7
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def env(start, a, d, n=None):
    x = t - start
    e = np.where(x < 0, 0, np.where(x < a, x / max(a, 1e-4), np.exp(-(x - a) / d)))
    return e

def add(sig, gain=1.0, pan=0.0):
    global L, R
    L += sig * gain * np.sqrt(0.5 * (1 - pan)); R += sig * gain * np.sqrt(0.5 * (1 + pan))

def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], btype='band', fs=SR, output='sos'), x)

def lp(x, f):
    return sosfilt(butter(2, f, btype='low', fs=SR, output='sos'), x)

# 1) soft riser 0.0-1.0 s: filtered noise, rising cutoff via crossfaded bands
noise = rng.standard_normal(N)
rise = np.clip(t / 1.0, 0, 1) ** 2 * (t < 1.0)
riser = bp(noise, 900, 6000) * rise * 0.10
add(riser, 1.0, -0.2); add(bp(noise[::-1].copy(), 900, 6000) * rise * 0.10, 1.0, 0.2)

# 2) node blips 0.15-0.65 s (circuit nodes lighting up), alternating pan
for i, (st, f) in enumerate([(0.15, 1760), (0.27, 2093), (0.39, 2349), (0.51, 2637), (0.62, 3136)]):
    e = env(st, 0.003, 0.05)
    add(np.sin(2 * np.pi * f * t) * e, 0.16, -0.5 if i % 2 == 0 else 0.5)

# 3) logo hit at 1.0 s: warm sub thump + chord (D major add9: D3 F#3 A3 E4)
x = t - 1.0
thump_f = 55 + 70 * np.exp(-np.clip(x, 0, None) * 30)
phase = 2 * np.pi * np.cumsum(thump_f) / SR
add(np.sin(phase) * env(1.0, 0.004, 0.28), 0.55)
chord = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) for f in (146.83, 185.0, 220.0, 329.63))
add(lp(chord, 2500) * env(1.0, 0.012, 0.9), 0.07)
add(bp(noise, 2000, 9000) * env(1.0, 0.001, 0.035), 0.12)

# 4) tagline sparkle at 1.45 s: soft bell arpeggio, right-to-left pan (RTL reveal)
for i, f in enumerate((1174.66, 1479.98, 1760.0, 2349.32)):
    st = 1.45 + i * 0.09
    e = env(st, 0.004, 0.45)
    add((np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2.76 * t)) * e, 0.13, 0.6 - i * 0.4)
add(lp(chord * 0.5, 1800) * env(1.45, 0.25, 0.9), 0.05)

# 5) simple reverb tail (decaying multi-tap), then fade to silence at 3.7 s
def verb(x, seed):
    r = np.random.default_rng(seed); y = x.copy()
    for k in range(18):
        d = int(SR * (0.03 + 0.045 * k + r.uniform(0, 0.01))); g = 0.55 * np.exp(-k * 0.22)
        y[d:] += x[:-d] * g * (0.6 if k % 2 else 0.4)
    return lp(y, 7000)
L, R = verb(L, 1), verb(R, 2)
fade = np.clip((DUR - t) / 0.6, 0, 1); L *= fade; R *= fade
fadein = np.clip(t / 0.02, 0, 1); L *= fadein; R *= fadein
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = L / pk * 0.89, R / pk * 0.89
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'sting.wav', SR, (np.stack([L, R], 1) * 32767).astype(np.int16))
