"""Generate Hebrew voice-over phrases with MMS-TTS, pick the clearest take per phrase via Whisper.

Usage: python vo.py OUT_DIR
Writes OUT_DIR/<id>.wav (48 kHz mono) and OUT_DIR/vo.json with durations.
"""
import json, sys, os, difflib
import numpy as np
import torch, soundfile as sf
from scipy.signal import resample_poly
from transformers import VitsModel, AutoTokenizer, pipeline

from script import PHRASES

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
SEEDS = [1, 2, 3, 4, 5]

m = VitsModel.from_pretrained("facebook/mms-tts-heb")
tok = AutoTokenizer.from_pretrained("facebook/mms-tts-heb")
m.noise_scale = 0.6  # a bit more expressive than default 0.667? keep stable
asr = pipeline("automatic-speech-recognition", model="openai/whisper-small",
               generate_kwargs={"language": "hebrew", "task": "transcribe"})


def norm(s):
    return ''.join(c for c in s if 'א' <= c <= 'ת')


def score(ref, hyp):
    return difflib.SequenceMatcher(None, norm(ref), norm(hyp)).ratio()


def trim(w, sr, thr=0.01):
    a = np.abs(w)
    idx = np.nonzero(a > thr * a.max())[0]
    pad = int(0.03 * sr)
    return w[max(0, idx[0] - pad): idx[-1] + pad]


ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]
meta = json.load(open(f'{OUT}/vo.json')) if ONLY and os.path.exists(f'{OUT}/vo.json') else {}
for p in PHRASES:
    if ONLY and p['id'] not in ONLY:
        continue
    best = None
    ids = tok(p['tts'], return_tensors="pt")
    for sd in SEEDS:
        torch.manual_seed(sd)
        with torch.no_grad():
            w = m(**ids).waveform[0].numpy()
        w = trim(w, 16000)
        hyp = asr({"raw": w.astype(np.float32), "sampling_rate": 16000})["text"]
        sc = score(p['tts'], hyp)
        if best is None or sc > best[0]:
            best = (sc, sd, w, hyp)
    sc, sd, w, hyp = best
    w48 = resample_poly(w, 3, 1)
    w48 = w48 / (np.abs(w48).max() + 1e-9) * 0.9
    sf.write(f"{OUT}/{p['id']}.wav", w48.astype(np.float32), 48000)
    meta[p['id']] = {"dur": len(w48) / 48000, "seed": sd, "score": round(sc, 3), "asr": hyp}
    print(p['id'], round(len(w48) / 48000, 2), sd, round(sc, 3), hyp, flush=True)

json.dump(meta, open(f"{OUT}/vo.json", "w"), ensure_ascii=False, indent=1)
