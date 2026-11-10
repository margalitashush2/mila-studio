"""Mix voice-over + music (with ducking) according to timeline.json.

python3 mix.py ASSETS_DIR OUT.wav
"""
import json, sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

A, OUT = sys.argv[1], sys.argv[2]
SR = 48000
music, sr = sf.read(f'{A}/music.wav', dtype='float32')
assert sr == SR
N = len(music)
TL = json.load(open(f'{A}/timeline.json'))

vo = np.zeros(N, np.float32)
active = np.zeros(N, np.float32)
for pid, (t0, t1) in TL.items():
    w, _ = sf.read(f'{A}/vo/{pid}.wav', dtype='float32')
    # voice chain: high-pass, presence lift, gentle compression
    w = sosfilt(butter(2, 90, 'high', fs=SR, output='sos'), w)
    pres = sosfilt(butter(2, [2500, 6000], 'band', fs=SR, output='sos'), w)
    w = w + 0.35 * pres
    env = np.sqrt(fftconvolve(w ** 2, np.ones(480) / 480, 'same')) + 1e-6
    gain = np.minimum(1.0, (0.18 / env) ** 0.4)
    w = w * gain
    w = w / (np.abs(w).max() + 1e-9) * 0.95
    i = int(t0 * SR)
    j = min(N, i + len(w))
    vo[i:j] += w[: j - i]
    active[i:j] = 1

# smooth ducking envelope (attack 120ms, release 450ms)
duck = np.zeros(N, np.float32)
a_att, a_rel = np.exp(-1 / (0.12 * SR)), np.exp(-1 / (0.45 * SR))
# vectorised approximation: dilate active region then smooth
pre = int(0.15 * SR)
act = fftconvolve(active, np.ones(pre), 'same') > 0.5
k = int(0.35 * SR)
win = np.hanning(k)
win /= win.sum()
duck = fftconvolve(act.astype(np.float32), win, 'same')
mgain = 1.0 - 0.62 * np.clip(duck, 0, 1)

mix = music * mgain[:, None] * 0.9 + vo[:, None] * 0.82
peak = np.abs(mix).max()
mix = mix / peak * 0.95
sf.write(OUT, mix.astype(np.float32), SR)
print('mixed', peak)
