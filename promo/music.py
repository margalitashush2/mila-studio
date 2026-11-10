"""Original synthesized score for the 60s promo (no samples, no licensing issues).

Structure (BPM 96, 1 bar = 2.5 s):
  0-7    intro: warm pad + soft piano arpeggio + riser -> impact at 7.0
  7-18   groove: kick / clap / hats / bass / piano chords
  18-26  lighter pulse (screen recording)
  26-34  tension: ticking clock + rising noise -> impact at 34
  34-46  bright major lift, sparkles
  46-60  climax + final hit and tail
Usage: python3 music.py out.wav
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DUR = 60.0
N = int(SR * DUR)
BPM = 96
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(7)


def t_arr(d):
    return np.arange(int(SR * d)) / SR


def note_hz(n):  # midi -> hz
    return 440.0 * 2 ** ((n - 69) / 12)


def add(buf, sig, start, gain=1.0):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)


def piano(n, d=2.2, vel=1.0):
    t = t_arr(d)
    f = note_hz(n)
    s = np.zeros_like(t)
    for k, a in enumerate([1, .55, .3, .18, .1, .06], 1):
        s += a * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k)) * np.exp(-t * (1.6 + 0.9 * k))
    att = np.minimum(1, t / 0.004)
    return s * att * vel * 0.25


def pad(notes, d, bright=1500):
    t = t_arr(d)
    s = np.zeros_like(t)
    for n in notes:
        f = note_hz(n)
        for det in (-0.12, 0.0, 0.11):
            ph = rng.random() * 2 * np.pi
            ff = f * 2 ** (det / 12)
            # band-limited-ish saw: few harmonics
            for k in range(1, 8):
                s += np.sin(2 * np.pi * ff * k * t + ph * k) / k
    s = lp(s, bright)
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6)
    return s * env * 0.012


def kick():
    t = t_arr(0.45)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7.5) * 0.9 + np.sin(ph * 2) * np.exp(-t * 30) * 0.15


def clap():
    t = t_arr(0.3)
    nz = rng.standard_normal(len(t))
    env = np.exp(-t * 22)
    for o in (0.0, 0.011, 0.022):
        env += np.exp(-np.maximum(0, t - o) * 90) * (t >= o) * 0.6
    return bp(nz, 900, 5000) * env * 0.22


def hat(open_=False):
    d = 0.22 if open_ else 0.06
    t = t_arr(d)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * (14 if open_ else 70)) * 0.10


def tick():
    t = t_arr(0.05)
    return (np.sin(2 * np.pi * 2600 * t) + 0.5 * np.sin(2 * np.pi * 4100 * t)) * np.exp(-t * 160) * 0.16


def bass(n, d):
    t = t_arr(d)
    f = note_hz(n)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    env = np.minimum(1, t / 0.01) * np.exp(-t * 1.2) * np.minimum(1, (d - t) / 0.05)
    return lp(s, 400) * env * 0.32


def riser(d, f0=300, f1=6000):
    t = t_arr(d)
    nz = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = int(SR * 0.05)
    for i in range(0, len(t), seg):
        fc = f0 * (f1 / f0) ** (i / len(t))
        out[i:i + seg] = bp(nz[max(0, i - 2000):i + seg], fc * 0.7, min(fc * 1.4, SR / 2 - 100))[-len(out[i:i + seg]):]
    return out * (t / d) ** 2 * 0.22


def impact():
    t = t_arr(2.5)
    f = 32 + 60 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    nz = lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 6) * 0.35
    return (boom * 0.9 + nz) * 0.8


def whoosh(d=0.8):
    t = t_arr(d)
    nz = rng.standard_normal(len(t))
    env = np.sin(np.pi * t / d) ** 2
    return bp(nz, 400, 4000) * env * 0.12


def sparkle(n):
    t = t_arr(1.2)
    f = note_hz(n)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 3.01 * t)) * np.exp(-t * 4) * 0.07


def reverb(x, secs=2.2, mix=0.28):
    t = t_arr(secs)
    ir = rng.standard_normal(len(t)) * np.exp(-t * 3.2)
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = fftconvolve(x, ir)[: len(x)]
    return x * (1 - mix) + wet * mix * 1.6


# Chords (midi). Am F C G / lift: F G Am C ... in A minor -> C major feel
AM, F, C, G, EM, DM = [57, 60, 64], [53, 57, 60], [48, 55, 60, 64], [55, 59, 62], [52, 55, 59], [50, 53, 57]
prog_a = [AM, F, C, G]
prog_b = [F, G, C, AM]
prog_c = [F, C, G, AM]


def chord_at(bar):
    if bar < 13:
        return prog_a[bar % 4]
    if bar < 18:
        return prog_b[bar % 4]
    return prog_c[bar % 4]


def build():
    mus = np.zeros(N)
    drums = np.zeros(N)
    fx = np.zeros(N)
    nbars = int(DUR / BAR) + 1
    for b in range(nbars):
        t0 = b * BAR
        ch = chord_at(b)
        # pad everywhere (lighter in tension)
        bright = 900 if t0 < 7 else (1200 if 26 <= t0 < 34 else 2200)
        g = 0.8 if 18 <= t0 < 34 else 1.0
        add(mus, pad([n + 12 for n in ch], BAR + 0.6, bright), t0, g)
        # piano arpeggio
        arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24 - 12, ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[2] + 24 - 12]
        if t0 < 56:
            for i, n in enumerate(arp):
                v = 0.55 if t0 < 7 else (0.45 if 18 <= t0 < 34 else 0.7)
                add(mus, piano(n, 1.8, v), t0 + i * BEAT / 2)
        # bass from 7s
        if 7 <= t0 < 56 and not (26 <= t0 < 33.5):
            root = ch[0] - 24 if ch[0] - 24 >= 28 else ch[0] - 12
            for i in range(4):
                add(mus, bass(root, BEAT * 0.95), t0 + i * BEAT, 0.9 if i % 2 == 0 else 0.6)
        if 26 <= t0 < 34:
            root = ch[0] - 24 if ch[0] - 24 >= 28 else ch[0] - 12
            for i in range(8):
                add(mus, bass(root, BEAT * 0.45), t0 + i * BEAT / 2, 0.55)
        # sparkles in benefits section
        if 34 <= t0 < 56:
            for i, n in enumerate([ch[2] + 24, ch[1] + 24, ch[0] + 36, ch[2] + 36]):
                add(mus, sparkle(n), t0 + i * BEAT + BEAT / 2)
    # drums
    t = 7.0
    while t < 56.5:
        beat_i = int(round((t - 7.0) / BEAT))
        in_tension = 26 <= t < 34
        in_light = 18 <= t < 26
        if not in_tension:
            if beat_i % 1 == 0 and not (in_light and beat_i % 2 == 1):
                add(drums, kick(), t, 0.8 if in_light else 1.0)
            if beat_i % 2 == 1:
                add(drums, clap(), t, 0.7 if in_light else 1.0)
            add(drums, hat(), t + BEAT / 2, 0.8)
            if t >= 34:
                add(drums, hat(), t, 0.5)
                if beat_i % 4 == 3:
                    add(drums, hat(True), t + BEAT / 2, 0.6)
        else:
            # ticking clock 8ths + heartbeat kick
            add(drums, tick(), t, 1.0)
            add(drums, tick(), t + BEAT / 2, 0.7)
            if beat_i % 2 == 0:
                add(drums, kick(), t, 0.7)
                add(drums, kick(), t + 0.16, 0.45)
        t += BEAT
    # FX
    add(fx, riser(3.0), 4.0)
    add(fx, impact(), 7.0, 1.0)
    add(fx, whoosh(0.9), 17.5)
    add(fx, riser(4.0, 200, 8000), 30.0, 1.0)
    add(fx, impact(), 34.0, 1.0)
    add(fx, whoosh(0.9), 45.5)
    add(fx, impact(), 46.0, 0.7)
    for s in (11.0, 14.5, 38.0, 41.0):
        add(fx, whoosh(0.6), s - 0.3, 0.7)
    # final hit chord + tail
    for n in [45, 57, 60, 64, 69, 72, 76]:
        add(mus, piano(n, 4.0, 0.9), 56.0)
    add(mus, pad([69, 72, 76, 81], 4.0, 2500), 56.0, 1.3)
    add(fx, impact(), 56.0, 0.8)

    mix = reverb(mus, 2.4, 0.32) + drums * 0.85 + reverb(fx, 1.5, 0.2)
    # fade
    tt = np.arange(N) / SR
    mix *= np.minimum(1, tt / 0.3) * np.clip((DUR - tt) / 2.5, 0, 1) ** 1.2
    mix /= np.max(np.abs(mix)) + 1e-9
    mix = np.tanh(mix * 1.4) / np.tanh(1.4)
    # stereo widen: slight delay on right for the reverb-ish width
    left = mix
    right = np.concatenate([np.zeros(int(SR * 0.008)), mix[:-int(SR * 0.008)]]) * 0.5 + mix * 0.5
    return np.stack([left, right], 1) * 0.89


if __name__ == '__main__':
    import soundfile as sf
    out = build()
    sf.write(sys.argv[1] if len(sys.argv) > 1 else 'music.wav', out.astype(np.float32), SR)
