"""Prepare the real WhatsApp-status screen recording for the promo.

- takes only segments verified to contain no chat headers / private names
- detects every green phone-number link per frame and blurs it (temporally smoothed so nothing flickers through)
- crops the phone status bar, scales to the in-video phone screen size
Usage: python3 prep_rec.py SRC.mp4 OUT_DIR
Writes OUT_DIR/rec.npy (uint8 N,H,W,3 RGB) and OUT_DIR/rec_boxes.json
"""
import json, subprocess, sys
import numpy as np, cv2

SRC, OUT = sys.argv[1], sys.argv[2]
SW, SH = 1170, 2532
CROP_Y0, CROP_Y1 = 150, 2380          # drop recording status bar (red record pill)
SCR_W = 620
SCR_H = round(SCR_W * (CROP_Y1 - CROP_Y0) / SW)
FPS = 30
# (start, duration) in source seconds — verified clean: product posts only
SEGMENTS = [(5.35, 4.80), (15.25, 4.45)]


def dark_rows(bgr):
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    rows = (gray > 200).mean(1) < 0.03
    # smooth so card edges don't leave thin unblurred strips
    rows = np.convolve(rows.astype(float), np.ones(15) / 15, 'same') > 0.5
    return rows


def blur_dark_rows(f):
    rows = dark_rows(f)
    rows[:150] = False
    rows[2290:] = False
    if rows.any():
        bl = cv2.GaussianBlur(cv2.resize(f, (SW // 4, SH // 4)), (0, 0), 7)
        bl = cv2.resize(bl, (SW, SH))
        f[rows] = bl[rows]


def phone_boxes(bgr):
    b, g, r = [bgr[..., i].astype(np.int16) for i in range(3)]
    m = ((g > r + 35) & (g > b + 15) & (g < 210) & (r < 140)).astype(np.uint8)
    # dark-background echo of the status (blurred, enlarged, desaturated green)
    m2 = ((g > r + 18) & (g > b + 8) & (g > 45) & (r < 120)).astype(np.uint8)
    m2[~dark_rows(bgr)] = 0
    m = m | m2
    d = cv2.dilate(m, np.ones((9, 25), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(d)
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if 18 <= h <= 140 and w >= 90 and w / h > 2.2 and a / (w * h) > 0.35:
            out.append((int(x - 14), int(y - 10), int(w + 28), int(h + 20)))
    return out


def frames(start, dur):
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', str(start), '-i', SRC, '-t', str(dur),
                          '-vf', f'fps={FPS}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'],
                         stdout=subprocess.PIPE)
    sz = SW * SH * 3
    while True:
        buf = p.stdout.read(sz)
        if len(buf) < sz:
            break
        yield np.frombuffer(buf, np.uint8).reshape(SH, SW, 3)
    p.wait()


all_frames, all_boxes = [], []
for s, d in SEGMENTS:
    seg = list(frames(s, d))
    det = [phone_boxes(f) for f in seg]
    K = 4
    for i, f in enumerate(seg):
        boxes = []
        for j in range(max(0, i - K), min(len(seg), i + K + 1)):
            boxes += det[j]
        f = f.copy()
        blur_dark_rows(f)
        for x, y, w, h in boxes:
            x0, y0, x1, y1 = max(0, x), max(0, y), min(SW, x + w), min(SH, y + h)
            roi = f[y0:y1, x0:x1]
            small = cv2.resize(roi, (max(1, roi.shape[1] // 14), max(1, roi.shape[0] // 14)))
            roi = cv2.resize(small, (roi.shape[1], roi.shape[0]), interpolation=cv2.INTER_LINEAR)
            f[y0:y1, x0:x1] = cv2.GaussianBlur(roi, (0, 0), 6)
        crop = f[CROP_Y0:CROP_Y1]
        small = cv2.resize(crop, (SCR_W, SCR_H), interpolation=cv2.INTER_AREA)
        all_frames.append(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
        k = SCR_W / SW
        # callouts only for phone numbers on the current frame (wide boxes, not timestamps)
        cur = [(round(x * k), round((y - CROP_Y0) * k), round(w * k), round(h * k))
               for x, y, w, h in det[i] if w >= 200 and CROP_Y0 < y < CROP_Y1 - 60]
        all_boxes.append(cur)

arr = np.stack(all_frames)
np.save(f'{OUT}/rec.npy', arr)
json.dump({'boxes': all_boxes, 'w': SCR_W, 'h': SCR_H, 'fps': FPS,
           'seg_frames': [round(d * FPS) for _, d in SEGMENTS]}, open(f'{OUT}/rec_boxes.json', 'w'))
print(arr.shape)
