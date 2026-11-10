"""Voice-over with Microsoft Edge neural voice (he-IL-AvriNeural, male).

Each group of phrases is synthesized as ONE continuous take (natural prosody),
word-boundary events give exact per-phrase timings for subtitles.

Usage: python3 vo_edge.py OUT_DIR
Env: VOICE (default he-IL-AvriNeural), RATE (default +10%), PITCH (default +0Hz)
Writes OUT_DIR/g<n>.wav (48 kHz mono) and OUT_DIR/vo_groups.json
"""
import asyncio, json, os, subprocess, sys
import edge_tts

from script import PHRASES, GROUPS

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
VOICE = os.environ.get('VOICE', 'he-IL-AvriNeural')
RATE = os.environ.get('RATE', '+10%')
PITCH = os.environ.get('PITCH', '+0Hz')
PROXY = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
BY_ID = {p['id']: p for p in PHRASES}


async def synth(text, path):
    kw = dict(voice=VOICE, rate=RATE, pitch=PITCH, boundary='WordBoundary')
    if PROXY:
        kw['proxy'] = PROXY
    com = edge_tts.Communicate(text, **kw)
    words = []
    with open(path, 'wb') as fh:
        async for ch in com.stream():
            if ch['type'] == 'audio':
                fh.write(ch['data'])
            elif ch['type'] == 'WordBoundary':
                words.append((ch['offset'] / 1e7, (ch['offset'] + ch['duration']) / 1e7, ch['text']))
    return words


async def main():
    meta = []
    for gi, ids in enumerate(GROUPS):
        text = ' '.join(BY_ID[i]['tts'] for i in ids)
        mp3 = f'{OUT}/g{gi}.mp3'
        words = await synth(text, mp3)
        wav = f'{OUT}/g{gi}.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ac', '1', '-ar', '48000', wav], check=True)
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                             '-of', 'csv=p=0', wav]).decode().strip())
        # map words -> phrases by word count of each phrase's tts text
        phr, k = {}, 0
        for pid in ids:
            n = len(BY_ID[pid]['tts'].split())
            ws = words[k:k + n]
            k += n
            if ws:
                phr[pid] = [round(ws[0][0], 3), round(ws[-1][1], 3)]
        meta.append({'ids': ids, 'file': f'g{gi}.wav', 'dur': round(dur, 3), 'phrases': phr})
        print(gi, round(dur, 2), phr, flush=True)
    json.dump(meta, open(f'{OUT}/vo_groups.json', 'w'), ensure_ascii=False, indent=1)


asyncio.run(main())
