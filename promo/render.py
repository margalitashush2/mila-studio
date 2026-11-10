"""Render the 60s 9:16 promo for גמ"ח דניאל אשוש.

python3 render.py ASSETS_DIR OUT.mp4
ASSETS_DIR must contain:
  full/tNNN.jpg      full-res frames from the screen recording (product photos)
  work/rec.npy       prepared (blurred) screen-recording frames  (prep_rec.py)
  work/rec_boxes.json
  logo.png           the gmach logo (white on transparent)
  portrait.jpg       profile portrait
  vo/*.wav, vo/vo.json  (vo.py)
  music.wav          (music.py)
"""
import json, math, os, subprocess, sys
from multiprocessing import Process
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

from script import PHRASES

A = sys.argv[1]
OUTMP4 = sys.argv[2]
W, H, FPS, DUR = 1080, 1920, 30, 60.0
NF = int(DUR * FPS)
FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'fonts')
LINK_TEXT = os.environ.get('LINK_TEXT', '')  # optional: text for the join-link box

GOLD = (233, 196, 106)
GOLD_L = (255, 233, 170)
GOLD_D = (190, 140, 50)
CREAM = (255, 246, 229)
NAVY = (10, 15, 28)
RED = (255, 77, 77)
WA = (37, 211, 102)

rng = np.random.default_rng(3)

# ----------------------------------------------------------------- easing

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, t0, t1):
    return clamp((t - t0) / (t1 - t0)) if t1 > t0 else float(t >= t1)


def eo(x):  # ease out cubic
    x = clamp(x)
    return 1 - (1 - x) ** 3


def eio(x):
    x = clamp(x)
    return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


def spring(x, k=7.0, f=2.2):
    if x <= 0:
        return 0.0
    if x >= 1.6:
        return 1.0
    return 1 - math.exp(-k * x) * math.cos(f * math.pi * x)


def lerp(a, b, x):
    return a + (b - a) * x

# ----------------------------------------------------------------- sprites (premultiplied float32 RGBA)

def to_sprite(img):
    a = np.asarray(img.convert('RGBA')).astype(np.float32) / 255.0
    a[..., :3] *= a[..., 3:4]
    return a


def place(dst, spr, cx, cy, s=1.0, rot=0.0, op=1.0, add=False):
    if op <= 0.003 or s <= 0.005:
        return
    h, w = spr.shape[:2]
    if abs(s - 1) > 1e-3 or abs(rot) > 1e-3:
        M = cv2.getRotationMatrix2D((w / 2, h / 2), rot, s)
        cos, sin = abs(M[0, 0]), abs(M[0, 1])
        nw, nh = int(h * sin + w * cos) + 2, int(h * cos + w * sin) + 2
        M[0, 2] += nw / 2 - w / 2
        M[1, 2] += nh / 2 - h / 2
        spr = cv2.warpAffine(spr, M, (nw, nh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        h, w = nh, nw
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(W, x0 + w), min(H, y0 + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    sub = spr[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
    reg = dst[dy0:dy1, dx0:dx1]
    if reg.shape[2] == 4:
        reg *= 1 - sub[..., 3:4] * op
        reg += sub * op
    elif add:
        reg += sub[..., :3] * op
    else:
        reg *= 1 - sub[..., 3:4] * op
        reg += sub[..., :3] * op


_fc = {}


def font(name, size):
    k = (name, size)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(os.path.join(FONTS, name), size, layout_engine=ImageFont.Layout.RAQM)
    return _fc[k]


H9, H7, H4 = 'Heebo_900Black.ttf', 'Heebo_700Bold.ttf', 'Heebo_400Regular.ttf'
FR9 = 'FrankRuhlLibre_900Black.ttf'

_tc = {}


def text_sprite(txt, fname, size, fill=(255, 255, 255), gradient=None, stroke=0, stroke_fill=(0, 0, 0),
                shadow=0.0, glow=None, spacing=1.12):
    key = (txt, fname, size, fill, gradient, stroke, stroke_fill, shadow, glow, spacing)
    if key in _tc:
        return _tc[key]
    f = font(fname, size)
    lines = txt.split('\n')
    pad = int(size * 0.6) + stroke
    lh = int(size * spacing * 1.25)
    widths = []
    for ln in lines:
        bb = f.getbbox(ln, direction='rtl', language='he')
        widths.append(bb[2] - bb[0])
    tw = max(widths) + 2 * pad
    th = lh * len(lines) + 2 * pad
    mask = Image.new('L', (tw, th), 0)
    smask = Image.new('L', (tw, th), 0)
    d, ds = ImageDraw.Draw(mask), ImageDraw.Draw(smask)
    for i, ln in enumerate(lines):
        cy = pad + lh * i + lh / 2
        d.text((tw / 2, cy), ln, font=f, fill=255, anchor='mm', direction='rtl', language='he')
        if stroke:
            ds.text((tw / 2, cy), ln, font=f, fill=255, anchor='mm', direction='rtl', language='he',
                    stroke_width=stroke, stroke_fill=255)
    out = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    if shadow:
        sh = (smask if stroke else mask).filter(ImageFilter.GaussianBlur(size * 0.12))
        sh_img = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
        sh_img.putalpha(sh.point(lambda v: int(v * shadow)))
        out.alpha_composite(sh_img, (0, int(size * 0.05)))
    if glow:
        gl = mask.filter(ImageFilter.GaussianBlur(size * 0.25))
        g_img = Image.new('RGBA', (tw, th), glow[:3] + (0,))
        g_img.putalpha(gl.point(lambda v: int(min(255, v * glow[3]))))
        out.alpha_composite(g_img)
    if stroke:
        s_img = Image.new('RGBA', (tw, th), stroke_fill + (0,))
        s_img.putalpha(smask)
        out.alpha_composite(s_img)
    if gradient:
        c0, c1, c2 = gradient
        yy = np.linspace(0, 1, th)[:, None]
        col = np.where(yy < 0.5, np.array(c0) + (np.array(c1) - np.array(c0)) * (yy / 0.5),
                       np.array(c1) + (np.array(c2) - np.array(c1)) * ((yy - 0.5) / 0.5))
        col = np.repeat(col[:, None, :], tw, 1).reshape(th, tw, 3)
        fill_img = Image.fromarray(col.astype(np.uint8), 'RGB').convert('RGBA')
    else:
        fill_img = Image.new('RGBA', (tw, th), fill + (255,))
    fill_img.putalpha(mask)
    out.alpha_composite(fill_img)
    bb = out.getbbox()
    if bb:
        out = out.crop(bb)
    spr = to_sprite(out)
    _tc[key] = spr
    return spr


def rounded_mask(w, h, r):
    m = Image.new('L', (w * 2, h * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), r * 2, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def pill(w, h, fill, outline=None, ow=3, radius=None, grad=None):
    r = radius if radius is not None else h // 2
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    if grad:
        yy = np.linspace(0, 1, h)[:, None, None]
        col = np.array(grad[0]) * (1 - yy) + np.array(grad[1]) * yy
        col = np.repeat(col, w, 1).astype(np.uint8)
        g = Image.fromarray(col, 'RGB').convert('RGBA')
        g.putalpha(rounded_mask(w, h, r))
        img = g
    else:
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((0, 0, w - 1, h - 1), r, fill=fill)
    if outline:
        ImageDraw.Draw(img).rounded_rectangle((ow // 2, ow // 2, w - 1 - ow // 2, h - 1 - ow // 2), r,
                                              outline=outline, width=ow)
    return img


def icon_sprite(ch, size, fill):
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)
    bb = f.getbbox(ch)
    im = Image.new('RGBA', (bb[2] - bb[0] + 8, bb[3] - bb[1] + 8), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((4 - bb[0], 4 - bb[1]), ch, font=f, fill=fill + (255,))
    return to_sprite(im)


def chip(txt, size=44, bg=(233, 196, 106, 255), fg=NAVY, fname=H7, padx=34, pady=16, outline=None, grad=None,
         icon=None, icon_col=None):
    ts = text_sprite(txt, fname, size, fill=fg)
    th, tw = ts.shape[:2]
    isp = icon_sprite(icon, int(size * 0.8), icon_col or fg) if icon else None
    iw = isp.shape[1] + int(size * 0.35) if icon else 0
    w, h = tw + iw + padx * 2, int(size * 1.25) + pady * 2
    base = to_sprite(pill(w, h, bg, outline=outline, grad=grad))
    place(base, ts, padx + tw / 2, h / 2)
    if icon:
        place(base, isp, w - padx - isp.shape[1] / 2, h / 2)
    return base


def shadowed(spr, blur=24, off=14, strength=0.6):
    h, w = spr.shape[:2]
    p = blur * 2 + off
    out = np.zeros((h + 2 * p, w + 2 * p, 4), np.float32)
    a = np.zeros((h + 2 * p, w + 2 * p), np.float32)
    a[p + off:p + off + h, p:p + w] = spr[..., 3]
    a = cv2.GaussianBlur(a, (0, 0), blur) * strength
    out[..., 3] = a
    place_into(out, spr, p, p)
    return out


def place_into(dst4, spr, x, y):
    h, w = spr.shape[:2]
    reg = dst4[y:y + h, x:x + w]
    reg *= 1 - spr[..., 3:4]
    reg += spr

# ----------------------------------------------------------------- color / images

def grade(rgb):  # rgb float 0-1: cinematic teal-orange, contrast
    x = rgb.copy()
    lum = x @ np.array([0.299, 0.587, 0.114], np.float32)
    lum = lum[..., None]
    x = x + (lum - 0.5) * 0  # placeholder
    shadows = np.clip(1 - lum * 2, 0, 1)
    highs = np.clip(lum * 2 - 1, 0, 1)
    x += shadows * np.array([-0.02, 0.01, 0.04], np.float32) + highs * np.array([0.05, 0.02, -0.04], np.float32)
    x = np.clip(x, 0, 1)
    x = x * x * (3 - 2 * x) * 0.35 + x * 0.65  # s-curve
    sat = 1.12
    lum = (x @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    x = lum + (x - lum) * sat
    return np.clip(x, 0, 1)


def load_crop(name, box, inset=8):
    im = cv2.imread(f'{A}/full/{name}.jpg')[:, :, ::-1]
    x0, y0, x1, y1 = box
    im = im[y0 + inset:y1 - inset, x0 + inset:x1 - inset]
    return grade(im.astype(np.float32) / 255.0)


def cover(img, w, h, s=1.0):
    ih, iw = img.shape[:2]
    k = max(w / iw, h / ih) * s
    r = cv2.resize(img, (int(iw * k) + 1, int(ih * k) + 1), interpolation=cv2.INTER_CUBIC)
    y0 = (r.shape[0] - h) // 2
    x0 = (r.shape[1] - w) // 2
    return r[y0:y0 + h, x0:x0 + w]


def kenburns(big, t, s0, s1, dx0=0, dx1=0, dy0=0, dy1=0):
    """big: image larger than frame (cover at 1.25). returns W x H view."""
    s = lerp(s0, s1, t)
    bh, bw = big.shape[:2]
    cx, cy = bw / 2 + lerp(dx0, dx1, t), bh / 2 + lerp(dy0, dy1, t)
    # map output pixel -> big: scale relative to cover-fit of big
    base = max(W / bw, H / bh)
    k = base * s
    M = np.array([[k, 0, W / 2 - cx * k], [0, k, H / 2 - cy * k]], np.float32)
    return cv2.warpAffine(big, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def card(img, maxw, maxh, radius=40, border=GOLD, bw=4):
    ih, iw = img.shape[:2]
    k = min(maxw / iw, maxh / ih)
    w, h = int(iw * k), int(ih * k)
    r = cv2.resize(img, (w, h), interpolation=cv2.INTER_CUBIC if k > 1 else cv2.INTER_AREA)
    pil = Image.fromarray((np.clip(r, 0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')
    pil.putalpha(rounded_mask(w, h, radius))
    if border:
        ImageDraw.Draw(pil).rounded_rectangle((1, 1, w - 2, h - 2), radius, outline=border + (255,), width=bw)
    return shadowed(to_sprite(pil), blur=30, off=20, strength=0.7)

# ----------------------------------------------------------------- assets

PRODUCTS = {
    'fridge': ('t001', (372, 700, 1100, 1670), 'מקרר'),
    'bed': ('t009', (372, 1235, 1102, 2215), 'מיטה + מזרן'),
    'sofa': ('t013', (290, 870, 1102, 1328), 'מערכת ישיבה'),
    'headboard': ('t025', (372, 955, 1102, 1922), 'ראש מיטה ושידות'),
    'darksofa': ('t027', (290, 770, 1102, 1584), 'ספה פינתית'),
    'shelf': ('t031', (372, 410, 1102, 1436), 'כוננית'),
    'oven': ('t033', (372, 560, 1102, 1570), 'תנור גז'),
    'speakers': ('t035', (372, 670, 1102, 1646), 'רמקולים'),
    'bunk': ('t037', (292, 828, 1102, 1432), 'מיטת קומותיים'),
    'books': ('t041', (290, 1094, 1102, 1888), 'ספרי קודש'),
    'wardrobe': ('t049', (372, 450, 1102, 1470), 'ארון 6 דלתות'),
    'leather': ('t049', (292, 1598, 1102, 2202), 'ספת עור'),
    'greysofa': ('t051', (372, 1146, 1102, 2160), 'ספה מעוצבת'),
}

print('loading assets', flush=True)
IMG = {k: load_crop(v[0], v[1]) for k, v in PRODUCTS.items()}
BIG = {k: cover(IMG[k], int(W * 1.25), int(H * 1.25)) for k in ('greysofa', 'bed', 'wardrobe')}


def blurred_bg(img, dark=0.42):
    c = cover(img, W // 4, H // 4, 1.1)
    c = cv2.GaussianBlur(c, (0, 0), 9)
    c = cv2.resize(c, (W, H), interpolation=cv2.INTER_CUBIC)
    return c * dark


MONTAGE = ['fridge', 'sofa', 'shelf', 'oven', 'wardrobe', 'bunk', 'speakers']
BLUR = {k: blurred_bg(IMG[k]) for k in set(MONTAGE + ['bed', 'leather', 'books', 'headboard'])}
CARDS = {k: card(IMG[k], 860, 1060) for k in set(MONTAGE + ['leather', 'oven', 'fridge'])}
SMALLCARD = {k: card(IMG[k], 430, 520, radius=30, bw=3) for k in ('fridge', 'leather', 'oven', 'darksofa', 'bed')}
LABELS = {k: chip(PRODUCTS[k][2], 46) for k in PRODUCTS}

logo_img = Image.open(f'{A}/logo.png').convert('RGBA')


def logo_sprite(width, color=(255, 255, 255)):
    im = logo_img.resize((width, int(logo_img.height * width / logo_img.width)), Image.LANCZOS)
    col = Image.new('RGBA', im.size, color + (0,))
    col.putalpha(im.getchannel('A'))
    return to_sprite(col)


LOGO_BIG = logo_sprite(760, (255, 250, 240))
LOGO_MID = logo_sprite(470, (255, 250, 240))
LOGO_GLOW = cv2.GaussianBlur(LOGO_BIG, (0, 0), 18)
LOGO_GLOW[..., :3] = LOGO_GLOW[..., 3:4] * np.array(GOLD, np.float32) / 255

pt = Image.open(f'{A}/portrait.jpg').convert('RGB')
ps = min(pt.size)
pt = pt.crop(((pt.width - ps) // 2, (pt.height - ps) // 2, (pt.width + ps) // 2, (pt.height + ps) // 2)).resize((220, 220), Image.LANCZOS).convert('RGBA')
cm = Image.new('L', (880, 880), 0)
ImageDraw.Draw(cm).ellipse((0, 0, 879, 879), fill=255)
pt.putalpha(cm.resize((220, 220), Image.LANCZOS))
PORTRAIT = to_sprite(pt)

# recording
REC = np.load(f'{A}/work/rec.npy', mmap_mode='r')
RECMETA = json.load(open(f'{A}/work/rec_boxes.json'))
SCR_W, SCR_H = RECMETA['w'], RECMETA['h']
PHONE_R = 64
BEZ = 16
phone_body = Image.new('RGBA', (SCR_W + 2 * BEZ, SCR_H + 2 * BEZ), (0, 0, 0, 0))
pd = ImageDraw.Draw(phone_body)
pd.rounded_rectangle((0, 0, phone_body.width - 1, phone_body.height - 1), PHONE_R + BEZ, fill=(12, 12, 14, 255))
pd.rounded_rectangle((2, 2, phone_body.width - 3, phone_body.height - 3), PHONE_R + BEZ - 2, outline=GOLD + (200,), width=3)
PHONE_BODY = shadowed(to_sprite(phone_body), blur=40, off=24, strength=0.8)
PHONE_PAD = (PHONE_BODY.shape[1] - phone_body.width) // 2  # offset of body inside shadow sprite (x)
SCR_MASK = np.asarray(rounded_mask(SCR_W, SCR_H, PHONE_R)).astype(np.float32)[..., None] / 255.0

# ----------------------------------------------------------------- VO timeline

VO = json.load(open(f'{A}/vo/vo.json'))
S3 = 19.55  # section 2 VO is ~11.8s; real-status section starts here
SEC_WIN = {1: (0.35, 7.0), 2: (7.3, S3 - 0.05), 3: (S3 + 0.45, 33.7), 4: (34.45, 45.8), 5: (46.6, 58.6)}
GAP = {1: 0.35, 2: 0.3, 3: 0.35, 4: 0.3, 5: 0.35}
TL = {}
for sec, (s0, s1) in SEC_WIN.items():
    ph = [p for p in PHRASES if p['sec'] == sec]
    total = sum(VO[p['id']]['dur'] for p in ph)
    gap = GAP[sec]
    if total + gap * (len(ph) - 1) > s1 - s0:
        gap = max(0.12, (s1 - s0 - total) / max(1, len(ph) - 1))
    t = s0
    for p in ph:
        if p['id'] == '3c':  # sync with the 15-minute timer; keep the real recording on screen >= 8s
            t = max(t, 27.4)
        TL[p['id']] = (t, t + VO[p['id']]['dur'])
        t += VO[p['id']]['dur'] + gap
json.dump(TL, open(f'{A}/timeline.json', 'w'), indent=1)
T = lambda pid: TL[pid][0]
TE = lambda pid: TL[pid][1]
SUBS = {p['id']: text_sprite(p['sub'], H7, 62, fill=(255, 255, 255), stroke=4, stroke_fill=(8, 10, 18), shadow=0.8)
        for p in PHRASES}

# ----------------------------------------------------------------- global layers

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIGNETTE = (1 - 0.55 * np.clip(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2, 0, 1))[..., None]
GRAIN = [(rng.standard_normal((H // 2, W // 2)).astype(np.float32) * 0.022) for _ in range(6)]
GRAIN = [cv2.resize(g, (W, H))[..., None] for g in GRAIN]


def lux_bg(t, hue=(0.0, 0.0, 0.0)):
    """deep navy luxury background with moving warm glow."""
    cx = W * (0.5 + 0.18 * math.sin(t * 0.35))
    cy = H * (0.38 + 0.08 * math.cos(t * 0.27))
    d = ((xx - cx) / W) ** 2 + ((yy - cy) / H) ** 2 * 0.6
    glow = np.exp(-d * 5.5)[..., None]
    base = np.array(NAVY, np.float32) / 255 + np.array(hue, np.float32)
    g = np.array([0.55, 0.38, 0.12], np.float32)
    return base * (1 - glow * 0.3) + g * glow * 0.42


LUX_CACHE = {}


def lux(t, hue=(0, 0, 0)):
    k = (round(t * 6) / 6, hue)  # glow moves slowly; 6 updates/s is plenty
    if k not in LUX_CACHE:
        if len(LUX_CACHE) > 8:
            LUX_CACHE.clear()
        LUX_CACHE[k] = lux_bg(k[0], hue)
    return LUX_CACHE[k].copy()


# particles (bokeh)
NP = 70
P_X = rng.random(NP) * W
P_Y = rng.random(NP) * H
P_V = 18 + rng.random(NP) * 50
P_S = rng.integers(0, 3, NP)
P_PH = rng.random(NP) * 6.28
DOT = []
for r in (6, 11, 20):
    s = r * 4
    g = np.exp(-(((np.mgrid[0:s, 0:s] - s / 2) ** 2).sum(0)) / (2 * (r * 0.55) ** 2)).astype(np.float32)
    spr = np.zeros((s, s, 4), np.float32)
    spr[..., 3] = g
    spr[..., :3] = g[..., None] * np.array([1.0, 0.85, 0.55], np.float32)
    DOT.append(spr)


def particles(dst, t, strength=1.0):
    for i in range(NP):
        y = (P_Y[i] - P_V[i] * t) % (H + 100) - 50
        x = P_X[i] + 30 * math.sin(t * 0.6 + P_PH[i])
        tw = 0.35 + 0.35 * math.sin(t * 2 + P_PH[i])
        place(dst, DOT[P_S[i]], x, y, op=tw * strength * (0.5 if P_S[i] == 2 else 0.8), add=True)


# light leak (warm radial, additive)
def leak(dst, t, x, y, r, strength):
    if strength <= 0:
        return
    x0, x1 = int(max(0, x - r)), int(min(W, x + r))
    y0, y1 = int(max(0, y - r)), int(min(H, y + r))
    if x1 <= x0 or y1 <= y0:
        return
    d = ((xx[y0:y1, x0:x1] - x) ** 2 + (yy[y0:y1, x0:x1] - y) ** 2) / (r * r)
    g = np.exp(-d * 3)[..., None] * strength
    dst[y0:y1, x0:x1] += g * np.array([1.0, 0.62, 0.25], np.float32)


def flash(dst, t, t0, dur=0.35, strength=0.9):
    x = (t - t0) / dur
    if 0 <= x <= 1:
        a = strength * (1 - x) ** 2
        dst[:] = dst * (1 - a) + a * np.array([1.0, 0.95, 0.85], np.float32)


# rays for benefits section
RAYS = np.zeros((1400, 1400), np.float32)
ang = np.arctan2(*(np.mgrid[0:1400, 0:1400] - 700))
rad = np.hypot(*(np.mgrid[0:1400, 0:1400] - 700))
RAYS = ((np.cos(ang * 12) * 0.5 + 0.5) ** 6 * np.exp(-rad / 520)).astype(np.float32)
RAYS_SPR = np.zeros((1400, 1400, 4), np.float32)
RAYS_SPR[..., 3] = RAYS * 0.5
RAYS_SPR[..., :3] = RAYS[..., None] * 0.5 * np.array([1.0, 0.8, 0.4], np.float32)

# ----------------------------------------------------------------- benefit graphics

def make_coupon():
    w, h = 780, 340
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    yy_ = np.linspace(0, 1, h)[:, None, None]
    col = np.array([255, 226, 150]) * (1 - yy_) + np.array([214, 160, 58]) * yy_
    col = np.repeat(col, w, 1).astype(np.uint8)
    g = Image.fromarray(col, 'RGB').convert('RGBA')
    m = rounded_mask(w, h, 36)
    md = ImageDraw.Draw(m)
    for cy in (0, h):
        md.ellipse((w * 0.3 - 30, cy - 30, w * 0.3 + 30, cy + 30), fill=0)
    g.putalpha(m)
    d = ImageDraw.Draw(g)
    for y in range(40, h - 40, 26):
        d.line((w * 0.3, y, w * 0.3, y + 13), fill=(120, 80, 20, 255), width=4)
    d.rounded_rectangle((14, 14, w - 15, h - 15), 28, outline=(255, 245, 210, 160), width=3)
    spr = to_sprite(g)
    place(spr, text_sprite('%', H9, 150, fill=(90, 55, 10)), w * 0.15, h / 2)
    place(spr, text_sprite('קופון', H9, 104, fill=(60, 35, 5)), w * 0.65, h * 0.4)
    place(spr, text_sprite('הטבה בלעדית לצופי הסטטוס', H7, 34, fill=(90, 55, 10)), w * 0.65, h * 0.73)
    return shadowed(spr, 26, 18, 0.7)


def make_gift():
    w, h = 360, 380
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    body = (30, 150, w - 30, h - 10)
    d.rounded_rectangle(body, 22, fill=(150, 20, 45, 255))
    d.rectangle((30, 150, w - 30, 200), fill=(120, 12, 35, 255))
    d.rounded_rectangle((12, 100, w - 12, 165), 18, fill=(180, 30, 58, 255))
    d.rectangle((w / 2 - 26, 100, w / 2 + 26, h - 10), fill=GOLD + (255,))
    d.rectangle((w / 2 - 26, 100, w / 2 + 26, h - 10), outline=GOLD_D + (255,), width=3)
    d.ellipse((w / 2 - 120, 30, w / 2 - 6, 110), outline=GOLD + (255,), width=22)
    d.ellipse((w / 2 + 6, 30, w / 2 + 120, 110), outline=GOLD + (255,), width=22)
    d.ellipse((w / 2 - 28, 78, w / 2 + 28, 128), fill=GOLD_L + (255,))
    im = im.resize((w, h), Image.LANCZOS)
    return shadowed(to_sprite(im), 22, 16, 0.7)


def make_badge():
    s = 360
    sup = 3
    im = Image.new('RGBA', (s * sup, s * sup), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = s * sup / 2
    pts = []
    for i in range(48):
        r = (s * sup / 2 - 4) if i % 2 == 0 else (s * sup / 2 * 0.86)
        a = i * math.pi / 24
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
    d.polygon(pts, fill=(220, 40, 60, 255))
    d.ellipse((c - s * sup * 0.36, c - s * sup * 0.36, c + s * sup * 0.36, c + s * sup * 0.36),
              outline=(255, 220, 150, 255), width=5 * sup)
    im = im.resize((s, s), Image.LANCZOS)
    spr = to_sprite(im)
    place(spr, text_sprite('%', H9, 170, fill=(255, 255, 255)), s / 2, s / 2 - 22)
    place(spr, text_sprite('הנחות', H9, 54, fill=(255, 236, 190)), s / 2, s / 2 + 86)
    return shadowed(spr, 22, 16, 0.7)


COUPON, GIFT, BADGE = make_coupon(), make_gift(), make_badge()

# confetti
CONF_COLS = [np.array(c, np.float32) / 255 for c in [(233, 196, 106), (255, 240, 200), (220, 40, 60), (255, 255, 255), (37, 211, 102)]]


def confetti(dst, t, t0, cx, cy, n=60, seed=0):
    x = t - t0
    if x < 0 or x > 2.2:
        return
    r = np.random.default_rng(seed)
    ang_ = r.random(n) * 2 * np.pi
    sp = 500 + r.random(n) * 900
    for i in range(n):
        vx, vy = math.cos(ang_[i]) * sp[i], math.sin(ang_[i]) * sp[i] - 500
        px = cx + vx * x * (1 - 0.35 * x)
        py = cy + vy * x + 900 * x * x
        if not (0 <= px < W and 0 <= py < H):
            continue
        sz = 8 + (i % 4) * 3
        rot = x * 8 + i
        c, s = math.cos(rot), math.sin(rot)
        pts = np.array([[-sz, -sz / 2], [sz, -sz / 2], [sz, sz / 2], [-sz, sz / 2]])
        pts = pts @ np.array([[c, s], [-s * abs(math.cos(rot * 0.7)), c]]) + [px, py]
        a = clamp(1 - (x - 1.4) / 0.8)
        col = CONF_COLS[i % len(CONF_COLS)]
        poly = pts.astype(np.int32)
        x0, y0 = poly.min(0)
        x1, y1 = poly.max(0) + 1
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        if x1 <= x0 or y1 <= y0:
            continue
        m = np.zeros((y1 - y0, x1 - x0), np.float32)
        cv2.fillConvexPoly(m, poly - [x0, y0], 1.0, lineType=cv2.LINE_AA)
        reg = dst[y0:y1, x0:x1]
        reg[:] = reg * (1 - m[..., None] * a) + col * m[..., None] * a


# ----------------------------------------------------------------- scene renderers

def subtitles(dst, t, y):
    for p in PHRASES:
        if p['id'] == '4a':
            continue
        t0, t1 = TL[p['id']]
        nxt = min([TL[q['id']][0] for q in PHRASES if TL[q['id']][0] > t0] + [t1 + 0.6])
        t1 = min(t1 + 0.35, nxt - 0.02, {1: 7.0, 2: S3, 3: 34.0, 4: 46.0, 5: 60.0}[p['sec']] - 0.05)
        if t0 - 0.1 <= t <= t1:
            a = eo(prog(t, t0 - 0.1, t0 + 0.12)) * (1 - prog(t, t1 - 0.12, t1))
            dy = (1 - eo(prog(t, t0 - 0.1, t0 + 0.2))) * 24
            place(dst, SUBS[p['id']], W / 2, y + dy, op=a)


def scene1(t):
    # 0 - 7 : cinematic hook
    if t < 2.6:
        x = t / 2.6
        f = kenburns(BIG['greysofa'], eio(x), 1.18, 1.03, -40, 30, 20, -10)
    elif t < 4.7:
        x = (t - 2.6) / 2.1
        f = kenburns(BIG['bed'], eo(x), 1.0, 1.12, 30, -30, 0, -20)
    else:
        x = (t - 4.7) / 2.3
        f = kenburns(BIG['wardrobe'], x, 1.05, 1.16, 0, 0, 0, 0) * 0.55
        f = cv2.GaussianBlur(f, (0, 0), 2 + 10 * eo(prog(t, T('1b') - 0.3, T('1b') + 0.2)))
    # whip crossfades
    for tc, nxt in ((2.6, 'bed'), (4.7, 'wardrobe')):
        if tc - 0.18 < t < tc:
            a = prog(t, tc - 0.18, tc)
            f = f * (1 - a) + a * kenburns(BIG[nxt], 0, 1.0 if nxt == 'bed' else 1.05, 1.0)
    f = np.ascontiguousarray(f)
    # floating product cards in the third shot (electric + furniture)
    if t >= 4.7:
        x = t - 4.7
        dim = eo(prog(t, T('1b') - 0.2, T('1b') + 0.3))
        for i, (k, cx, cy, rot, d) in enumerate((('fridge', 270, 640, -6, 0.0), ('leather', 810, 980, 5, 0.15),
                                                ('oven', 300, 1330, 4, 0.3))):
            a = eo(prog(x, d, d + 0.45)) * (1 - 0.65 * dim)
            place(f, SMALLCARD[k], cx + (1 - eo(prog(x, d, d + 0.5))) * (-200 if cx < 540 else 200),
                  cy - x * 30, s=1.0 - 0.1 * dim, rot=rot, op=a)
        # 0 ₪
        x1 = t - (T('1b') - 0.05)
        if x1 >= 0:
            s = lerp(2.4, 1.0, spring(x1 * 1.6, 6, 1.6))
            zero = text_sprite('0 ₪', H9, 330, gradient=(GOLD_L, GOLD, GOLD_D), glow=(255, 190, 80, 1.3), shadow=0.9)
            place(f, zero, W / 2, 860, s=s, op=eo(prog(x1, 0, 0.12)))
            flash(f, t, T('1b') + 0.05, 0.3, 0.55)
    # warm light leaks drifting
    leak(f, t, W * (0.1 + 0.25 * t / 7), H * 0.25, 700, 0.18)
    if 2.4 < t < 2.9:
        leak(f, t, W * 0.8, H * 0.5, 900, 0.5 * math.sin(math.pi * prog(t, 2.4, 2.9)))
    if 4.5 < t < 5.0:
        leak(f, t, W * 0.2, H * 0.6, 900, 0.5 * math.sin(math.pi * prog(t, 4.5, 5.0)))
    # fade in from black
    f *= eo(prog(t, 0, 0.6))
    return f


BADGES = [('מוצרים איכותיים', '2b', 0, '✓'), ('תקינים לחלוטין', '2b', 0.9, '✓'), ('באהבה ובחינם', '2c', 1.0, '♥')]
BADGE_SPR = {b[0]: chip(b[0], 40, bg=(15, 22, 40, 225), fg=GOLD_L, outline=GOLD + (255,), fname=H7, icon=b[3],
                        icon_col=GOLD if b[3] == '✓' else (235, 70, 90)) for b in BADGES}


def scene2(t):
    # 7 - 18 : brand intro + rhythmic montage
    beat = 0.625
    m0 = 9.5
    if t < m0:
        f = lux(t)
        particles(f, t)
        x = t - 7.0
        a = eo(prog(x, 0.0, 0.7))
        s = lerp(1.12, 1.0, eo(prog(x, 0, 1.6)))
        place(f, LOGO_GLOW, W / 2, 840, s=s, op=a * (0.6 + 0.3 * math.sin(t * 3)))
        place(f, LOGO_BIG, W / 2, 840, s=s, op=a)
        # glint sweep across logo
        gx = lerp(-300, W + 300, prog(x, 0.5, 1.6))
        if 0.5 < x < 1.6:
            band = np.exp(-((xx[400:1300] - gx - (yy[400:1300] - 840) * 0.35) / 60) ** 2)[..., None]
            lg = np.zeros((900, W, 3), np.float32)
            place_rgb(lg, LOGO_BIG, W / 2, 450, s)
            f[400:1300] += lg * band * 0.9
        place(f, text_sprite('מאדם לאדם · באהבה · בחינם', H7, 50, fill=GOLD_L, shadow=0.6), W / 2, 1300,
              op=eo(prog(x, 0.9, 1.4)) * (1 - prog(t, m0 - 0.25, m0)))
        flash(f, t, 7.0, 0.3, 0.5)
        if t > m0 - 0.25:  # push out
            f *= 1 - prog(t, m0 - 0.25, m0) * 0.8
        return f
    i = min(len(MONTAGE) - 1, int((t - m0) / (2 * beat)))
    k = MONTAGE[i]
    ts = m0 + i * 2 * beat
    x = t - ts
    f = BLUR[k].copy()
    f = f * (1 + 0.15 * math.exp(-x * 6))
    particles(f, t, 0.6)
    dirn = 1 if i % 2 == 0 else -1
    e = eo(prog(x, 0, 0.32))
    cx = W / 2 + (1 - e) * 420 * dirn
    place(f, CARDS[k], cx, 860 + (1 - e) * 60, s=lerp(1.18, 1.0, e) + x * 0.02, rot=(1 - e) * 5 * dirn, op=e)
    # outgoing card
    if i > 0 and x < 0.25:
        kp = MONTAGE[i - 1]
        eo_ = eo(prog(x, 0, 0.25))
        place(f, CARDS[kp], W / 2 - eo_ * 520 * dirn, 860, s=1.0 + 2 * beat * 0.02 - 0.1 * eo_, rot=-eo_ * 6 * dirn,
              op=1 - eo_)
    lab = LABELS[k]
    place(f, lab, W / 2, 1440, s=lerp(0.6, 1.0, spring(prog(x, 0.12, 0.6), 7, 2)), op=eo(prog(x, 0.1, 0.3)))
    # badges top
    yb = 230
    shown = [b for b in BADGES if t >= T(b[1]) + b[2]]
    for j, b in enumerate(shown[-2:] if len(shown) > 2 else shown):
        tb = T(b[1]) + b[2]
        y = yb + j * 92
        place(f, BADGE_SPR[b[0]], W / 2, y, s=lerp(0.7, 1, spring(prog(t, tb, tb + 0.5))), op=eo(prog(t, tb, tb + 0.2)))
    flash(f, t, ts, 0.18, 0.25)
    if t > S3 - 0.3:
        f *= 1 - prog(t, S3 - 0.3, S3) * 0.85
    return f


def place_rgb(dst3, spr, cx, cy, s=1.0):
    tmp = np.zeros(dst3.shape[:2] + (3,), np.float32)
    place(tmp, spr, cx, cy, s=s)
    dst3 += tmp


REC_FRAMES = len(REC)
SCR_SPR_CACHE = {}
TAG = chip('טלפון המוסר · מוסתר לפרטיות', 26, bg=(233, 196, 106, 240), fg=NAVY, padx=18, pady=8)
CALL_BTN = chip('☎  שיחה למוסר', 44, bg=(233, 196, 106, 255), fg=NAVY, fname=H9, padx=40, pady=20)
WA_BTN = chip('💬  וואטסאפ', 44, bg=(37, 211, 102, 255), fg=(255, 255, 255), fname=H9, padx=40, pady=20)
# replace emoji (not in Heebo) with a plain glyph-free version if it rendered as tofu
WA_BTN = chip('וואטסאפ למוסר', 44, bg=(37, 211, 102, 255), fg=(255, 255, 255), fname=H9, padx=40, pady=20)
CALL_BTN = chip('שיחה למוסר', 44, bg=(233, 196, 106, 255), fg=NAVY, fname=H9, padx=40, pady=20, icon='☎')
STEP1 = chip('תמונת המוצר + פרטים', 38, bg=(15, 22, 40, 230), fg=GOLD_L, outline=GOLD + (255,))
STEP2 = chip('עיר + טלפון של המוסר', 38, bg=(15, 22, 40, 230), fg=GOLD_L, outline=GOLD + (255,))
TITLE3 = text_sprite('הצצה אמיתית לסטטוס', H9, 74, fill=(255, 255, 255), shadow=0.8)
LIVE = chip('צילום מסך אמיתי מהסטטוס', 30, bg=(220, 40, 60, 255), fg=(255, 255, 255), padx=22, pady=8, icon='●')


def rec_index(t):
    r0 = S3 + 0.5
    k = int((t - r0) * 30)
    return int(np.clip(k, 0, REC_FRAMES - 1))


def phone_sprite(t):
    k = rec_index(t)
    if k in SCR_SPR_CACHE:
        return SCR_SPR_CACHE[k]
    fr = np.asarray(REC[k]).astype(np.float32) / 255.0
    spr = PHONE_BODY.copy()
    ox = PHONE_PAD + BEZ
    oy = PHONE_PAD - 24 + BEZ  # shadow sprite: pad p = blur*2+off, body at (p, p)
    p = 40 * 2 + 24
    ox, oy = p + BEZ, p + BEZ
    reg = spr[oy:oy + SCR_H, ox:ox + SCR_W]
    reg[..., :3] = reg[..., :3] * (1 - SCR_MASK) + fr * SCR_MASK
    reg[..., 3:4] = np.maximum(reg[..., 3:4], SCR_MASK)
    SCR_SPR_CACHE.clear()
    SCR_SPR_CACHE[k] = spr
    return spr


def scene3(t):
    # 18 - 34 : real status
    f = lux(t)
    particles(f, t, 0.5)
    t3c = T('3c')
    x = t - S3
    rise = eo(prog(x, 0.0, 0.7))
    dimp = eo(prog(t, t3c - 0.1, t3c + 0.6))
    pcx, pcy = W / 2, 975 + (1 - rise) * 1200
    ps = lerp(1.0, 0.8, dimp)
    spr = phone_sprite(t)
    place(f, spr, pcx, pcy + dimp * 60, s=ps, op=lerp(1, 0.28, dimp))
    # title
    place(f, TITLE3, W / 2, 120 - (1 - eo(prog(x, 0.2, 0.7))) * 60, op=eo(prog(x, 0.2, 0.6)) * (1 - dimp))
    place(f, LIVE, W / 2, 222, op=eo(prog(x, 0.5, 0.9)) * (1 - dimp) * (0.75 + 0.25 * math.sin(t * 6)))
    # phone-number callouts (track detected boxes)
    if dimp < 0.5 and rise > 0.99:
        k = rec_index(t)
        sx0 = pcx - SCR_W / 2
        sy0 = pcy - SCR_H / 2
        for (bx, by, bw, bh) in RECMETA['boxes'][k][:1]:
            cx = sx0 + bx + bw / 2
            cy = sy0 + by
            place(f, TAG, min(max(cx, 230), W - 230), cy - 34, op=0.95)
            ov = np.zeros((H, W), np.float32)
            cv2.rectangle(ov, (int(sx0 + bx), int(sy0 + by)), (int(sx0 + bx + bw), int(sy0 + by + bh)), 1.0, 3, cv2.LINE_AA)
            f[ov > 0] = f[ov > 0] * 0.1 + np.array(GOLD, np.float32) / 255 * 0.9
    # step chips (left/right of phone, synced to VO)
    t3a, t3b = T('3a'), T('3b')
    if dimp < 1:
        a1 = eo(prog(t, t3a, t3a + 0.3)) * (1 - prog(t, t3b - 0.2, t3b))
        place(f, STEP1, W / 2, 1640 - 60, s=lerp(0.8, 1, spring(prog(t, t3a, t3a + 0.6))), op=a1 * (1 - dimp))
        a2 = eo(prog(t, t3b - 0.1, t3b + 0.2))
        # call / whatsapp buttons pop out over the phone bottom
        for j, (btn, bx) in enumerate(((CALL_BTN, 300), (WA_BTN, 780))):
            tt = t3b + 0.6 + j * 0.35
            sc = spring(prog(t, tt, tt + 0.7), 6, 2)
            place(f, btn, bx, 1540, s=sc, op=a2 * clamp(sc) * (1 - dimp))
            # tap ripple
            rx = t - (tt + 0.55)
            if 0 < rx < 0.6:
                ov = np.zeros((H, W), np.float32)
                cv2.circle(ov, (bx, 1540), int(40 + 160 * rx), 1.0, 6, cv2.LINE_AA)
                aa = (1 - rx / 0.6) * 0.8
                f[:] = f * (1 - ov[..., None] * aa) + ov[..., None] * aa
    # 15-minute window
    if t >= t3c - 0.1:
        timer(f, t, t3c)
    flash(f, t, S3, 0.25, 0.3)
    if t > 33.75:
        f *= 1 - prog(t, 33.75, 34.0) * 0.6
    return f


T_BIG = {}


def timer(f, t, t0):
    x = t - t0
    tend = 33.4
    pr = clamp((t - (t0 + 0.4)) / (tend - (t0 + 0.4)))  # 0..1 elapsed
    app = spring(prog(x, 0, 0.7), 6, 2)
    cx, cy, R = W / 2, 860, 300
    size = 760
    ov = np.zeros((size, size, 4), np.float32)
    c = size // 2
    red = clamp((pr - 0.55) / 0.4)
    col = np.array(GOLD, np.float32) / 255 * (1 - red) + np.array(RED, np.float32) / 255 * red
    # track
    m = np.zeros((size, size), np.float32)
    cv2.circle(m, (c, c), R, 0.25, 26, cv2.LINE_AA)
    ov[..., 3] = m
    ov[..., :3] = m[..., None] * np.array([1, 1, 1], np.float32)
    # remaining arc
    m2 = np.zeros((size, size), np.float32)
    end = -90 + 360 * (1 - pr)
    if (1 - pr) > 0.002:
        cv2.ellipse(m2, (c, c), (R, R), 0, -90, end, 1.0, 26, cv2.LINE_AA)
    glow = cv2.GaussianBlur(m2, (0, 0), 14) * 0.9
    for mm in (glow, m2):
        ov[..., :3] = ov[..., :3] * (1 - mm[..., None]) + col * mm[..., None]
        ov[..., 3] = np.maximum(ov[..., 3], mm)
    pulse = 1 + 0.03 * math.sin(t * 2 * math.pi * 1.6) * red
    place(f, ov, cx, cy, s=app * pulse, op=clamp(app))
    secs = int(round(15 * 60 * (1 - pr)))
    s = f'{secs // 60:02d}:{secs % 60:02d}'
    colt = tuple(int(v * 255) for v in col)
    if s not in T_BIG or T_BIG[s][1] != colt:
        T_BIG[s] = (text_sprite(s, H9, 170, fill=CREAM if red < 0.5 else (255, 210, 210), shadow=0.7), colt)
    st = tend - 0.15
    dfade = 1 - 0.85 * prog(t, st, st + 0.2)
    place(f, T_BIG[s][0], cx, cy - 10, s=app, op=clamp(app) * dfade)
    place(f, text_sprite('דקות לפנות', H7, 44, fill=GOLD_L), cx, cy + 115, s=app, op=clamp(app) * dfade)
    place(f, text_sprite('חלון של 15 דקות בלבד', H9, 70, fill=(255, 255, 255), shadow=0.8), cx, 400,
          op=eo(prog(x, 0.2, 0.6)), s=lerp(0.8, 1, spring(prog(x, 0.2, 0.8))))
    td = T('3d')
    place(f, text_sprite('המוצרים נחטפים במהירות!', H9, 64, fill=RED, shadow=0.8, stroke=0), cx, 1270,
          op=eo(prog(t, td, td + 0.25)), s=lerp(1.3, 1, eo(prog(t, td, td + 0.3))))
    # "נחטף!" stamp
    st = tend - 0.15
    if t > st:
        sp = spring(prog(t, st, st + 0.5), 8, 1.5)
        stamp = text_sprite('נחטף!', H9, 170, fill=RED, shadow=0.9, stroke=10, stroke_fill=(255, 255, 255))
        place(f, stamp, cx + 10, cy - 10, s=lerp(2.2, 1, clamp(sp)), rot=-14, op=clamp(sp * 1.5))


def scene4(t):
    # 34 - 46 : benefits
    f = lux(t, (0.035, 0.0, 0.05))
    place(f, RAYS_SPR, W / 2, 760, s=1.0 + 0.05 * math.sin(t), rot=t * 8, op=0.8, add=True)
    particles(f, t, 1.0)
    x = t - 34.0
    t4a, t4b, t4c = T('4a'), T('4b'), T('4c')
    # punch text
    a = eo(prog(x, 0.05, 0.2)) * (1 - prog(t, t4b - 0.15, t4b + 0.15))
    if a > 0:
        sp = spring(prog(x, 0.05, 0.6), 7, 2)
        shake = math.sin(x * 70) * 10 * math.exp(-x * 6)
        place(f, text_sprite('וזה עוד\nלא הכול!', H9, 170, gradient=(GOLD_L, GOLD, GOLD_D), glow=(255, 180, 70, 1.1),
                             shadow=0.9, spacing=0.95), W / 2 + shake, 860, s=lerp(1.8, 1, sp), op=a)
    # title
    tb = t4b - 0.05
    place(f, text_sprite('הטבות בלעדיות\nלצופי הסטטוס', H9, 84, fill=(255, 255, 255), shadow=0.8, spacing=1.0), W / 2, 270,
          op=eo(prog(t, tb, tb + 0.3)), s=lerp(0.85, 1, spring(prog(t, tb, tb + 0.6))))
    # coupon (on "הטבות מיוחדות"), gift (on "מתנות"), badge (on "הנחות")
    dur4c = TE('4c') - t4c
    items = ((COUPON, W / 2, 760, -4, tb + 0.6, 'קופונים'), (GIFT, 300, 1220, 6, t4c + dur4c * 0.32, 'מתנות'),
             (BADGE, 780, 1210, -8, t4c + dur4c * 0.58, 'הנחות משמעותיות'))
    for j, (spr, cx, cy, rot, t0, lab) in enumerate(items):
        if t < t0:
            continue
        sp = spring(prog(t, t0, t0 + 0.8), 6, 2)
        bob = math.sin((t - t0) * 2.2 + j) * 12
        place(f, spr, cx, cy + bob, s=max(0.01, sp), rot=rot * (1 + (1 - clamp(sp)) * 4) + math.sin(t * 1.5 + j) * 2,
              op=clamp(sp * 2))
        if j > 0:
            place(f, chip(lab, 40, bg=(15, 22, 40, 230), fg=GOLD_L, outline=GOLD + (255,)), cx, cy + 230,
                  op=eo(prog(t, t0 + 0.3, t0 + 0.6)))
        confetti(f, t, t0, cx, cy, n=50, seed=j + 1)
    flash(f, t, 34.0, 0.3, 0.6)
    if t > 45.7:
        f *= 1 - prog(t, 45.7, 46.0) * 0.9
    return f


JOIN_CARD = None


def make_join_card(state):
    w, h = 900, 250
    base = to_sprite(pill(w, h, (16, 24, 44, 245), outline=GOLD + (255,), ow=3, radius=40))
    place(base, PORTRAIT, w - 140, h / 2)
    # status ring drawn separately
    t1 = text_sprite('הגמ״ח של דניאל אשוש', H9, 44, fill=(255, 255, 255))
    t2 = text_sprite('סטטוס וואטסאפ · מוצרים חדשים', H4, 28, fill=GOLD_L)
    for spr_, y_ in ((t1, 95), (t2, 152)):
        place(base, spr_, 345, y_)  # centered in the text area left of the portrait
    return base


JOIN_BASE = make_join_card(0)
BTN_JOIN = chip('הצטרפו עכשיו!', 64, bg=None, fg=NAVY, fname=H9, padx=70, pady=26, grad=(GOLD_L, GOLD_D))
ADD_BTN = chip('הצטרפות', 36, bg=(37, 211, 102, 255), fg=(255, 255, 255), fname=H9, padx=26, pady=12, icon='+')
ADDED_BTN = chip('הצטרפתם', 36, bg=(233, 196, 106, 255), fg=NAVY, fname=H9, padx=26, pady=12, icon='✓')


def link_box():
    w, h = 820, 120
    im = Image.new('RGBA', (w, h), (255, 255, 255, 18))
    m = rounded_mask(w, h, 30)
    im.putalpha(m.point(lambda v: int(v * 0.10)))
    d = ImageDraw.Draw(im)
    # dashed rounded border
    for i in range(0, 2 * (w + h), 28):
        def pt(s):
            s = s % (2 * (w + h))
            if s < w:
                return (s, 2)
            s -= w
            if s < h:
                return (w - 3, s)
            s -= h
            if s < w:
                return (w - s, h - 3)
            return (2, h - (s - w))
        d.line([pt(i), pt(i + 14)], fill=GOLD + (230,), width=3)
    spr = to_sprite(im)
    if LINK_TEXT:
        place(spr, text_sprite(LINK_TEXT, H7, 44, fill=(255, 255, 255)), w / 2, h / 2)
    return spr


LINK_BOX = link_box()


def scene5(t):
    # 46 - 60 : logo + join + end card
    f = lux(t)
    particles(f, t, 1.0)
    x = t - 46.0
    # phase A: big logo reveal 46-50.2, then move up
    mv = eio(prog(x, 4.0, 4.8))
    ly = lerp(820, 380, mv)
    ls = lerp(1.0, 0.56, mv)
    a = eo(prog(x, 0.1, 0.9))
    s0 = lerp(1.1, 1.0, eo(prog(x, 0, 2.0)))
    place(f, LOGO_GLOW, W / 2, ly, s=ls * s0, op=a * (0.55 + 0.25 * math.sin(t * 2.5)))
    place(f, LOGO_BIG, W / 2, ly, s=ls * s0, op=a)
    if 0.6 < x < 1.9:
        gx = lerp(-300, W + 300, prog(x, 0.6, 1.9))
        band = np.exp(-((xx[300:1400] - gx - (yy[300:1400] - 820) * 0.35) / 60) ** 2)[..., None]
        lg = np.zeros((1100, W, 3), np.float32)
        place_rgb(lg, LOGO_BIG, W / 2, ly - 300, ls * s0)
        f[300:1400] += lg * band
    # gold frame lines
    fl = eo(prog(x, 0.3, 1.5))
    for yline in (130, H - 70):
        x0, x1 = int(W / 2 - 420 * fl), int(W / 2 + 420 * fl)
        f[yline:yline + 3, x0:x1] = np.array(GOLD, np.float32) / 255
    # phase B: join card 50.5+
    tj = 46.0 + 4.6
    if t > tj:
        sp = spring(prog(t, tj, tj + 0.8), 6, 2)
        cy = 790
        place(f, JOIN_BASE, W / 2, cy + (1 - clamp(sp)) * 120, s=lerp(0.85, 1, clamp(sp)), op=clamp(sp * 2))
        # status ring around portrait (segments drawing)
        ring = np.zeros((300, 300, 4), np.float32)
        rp = prog(t, tj + 0.3, tj + 1.3)
        mring = np.zeros((300, 300), np.float32)
        for sgi in range(6):
            a0 = -90 + sgi * 60 + 4
            a1 = a0 + 52 * clamp(rp * 6 - sgi)
            if a1 > a0:
                cv2.ellipse(mring, (150, 150), (128, 128), 0, a0, a1, 1.0, 8, cv2.LINE_AA)
        ring[..., 3] = mring
        ring[..., :3] = mring[..., None] * np.array(WA, np.float32) / 255
        px = W / 2 + 450 - 140
        place(f, ring, px, cy + (1 - clamp(sp)) * 120, op=clamp(sp * 2))
        # add button tapped
        tb = tj + 1.5
        bx, by = W / 2, cy + 185
        btn = ADDED_BTN if t > tb + 0.25 else ADD_BTN
        place(f, btn, bx, by, s=1.35 * (1 - 0.12 * math.sin(math.pi * prog(t, tb, tb + 0.25))) * clamp(sp),
              op=eo(prog(t, tj + 0.4, tj + 0.7)) * (1 - prog(t, 53.3, 53.6)))
        rx = t - tb
        if 0 < rx < 0.6:
            ov = np.zeros((H, W), np.float32)
            cv2.circle(ov, (int(bx), int(by)), int(30 + 140 * rx), 1.0, 5, cv2.LINE_AA)
            aa = (1 - rx / 0.6) * 0.8
            f[:] = f * (1 - ov[..., None] * aa) + ov[..., None] * aa
    # phase C: end card text 53.8+
    te = 53.6
    lines = [(text_sprite('גמ״ח דניאל אשוש', FR9, 96, gradient=(GOLD_L, GOLD, GOLD_D), shadow=0.8), 1040, 0.0),
             (text_sprite('חסד אמיתי. מוצרים איכותיים. הטבות שוות.', H7, 42, fill=CREAM, shadow=0.6), 1135, 0.35)]
    for spr, y, d in lines:
        a = eo(prog(t, te + d, te + d + 0.5))
        place(f, spr, W / 2, y + (1 - a) * 30, op=a)
    tbtn = te + 0.9
    if t > tbtn:
        sp = spring(prog(t, tbtn, tbtn + 0.7), 6, 2)
        pulse = 1 + 0.035 * math.sin((t - tbtn) * 2 * math.pi * 1.4)
        place(f, BTN_JOIN, W / 2, 1290, s=max(0.01, sp) * pulse, op=clamp(sp * 2))
        a = eo(prog(t, tbtn + 0.5, tbtn + 1.0))
        place(f, text_sprite('לחצו על הקישור להצטרפות', H4, 32, fill=GOLD_L), W / 2, 1405, op=a)
        place(f, LINK_BOX, W / 2, 1495, op=a)
    flash(f, t, 46.0, 0.35, 0.5)
    # final fade
    f *= 1 - eio(prog(t, 59.2, 60.0))
    return f


def frame(i):
    t = i / FPS
    if t < 7.0:
        f = scene1(t)
        sub_y = 1640
    elif t < S3:
        f = scene2(t)
        sub_y = 1660
    elif t < 34.0:
        f = scene3(t)
        sub_y = 1740
    elif t < 46.0:
        f = scene4(t)
        sub_y = 1640
    else:
        f = scene5(t)
        sub_y = 1700
    subtitles(f, t, sub_y)
    f *= VIGNETTE
    f += GRAIN[i % len(GRAIN)]
    return (np.clip(f, 0, 1) * 255).astype(np.uint8)


def worker(k, n, path):
    a, b = NF * k // n, NF * (k + 1) // n
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                          '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15',
                          '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    for i in range(a, b):
        p.stdin.write(frame(i).tobytes())
        if (i - a) % 60 == 0:
            print(f'w{k}: {i - a}/{b - a}', flush=True)
    p.stdin.close()
    p.wait()


if __name__ == '__main__':
    only = os.environ.get('FRAMES')
    if only:  # preview stills: FRAMES="1.0,5.5,..."
        for s in only.split(','):
            im = frame(int(float(s) * FPS))
            Image.fromarray(im).save(f'{A}/prev_{s}.jpg', quality=90)
        sys.exit()
    n = int(os.environ.get('PROCS', '4'))
    parts = [f'{A}/part{k}.mp4' for k in range(n)]
    ps = [Process(target=worker, args=(k, n, parts[k])) for k in range(n)]
    [p.start() for p in ps]
    [p.join() for p in ps]
    with open(f'{A}/parts.txt', 'w') as fh:
        fh.writelines(f"file '{p}'\n" for p in parts)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{A}/parts.txt',
                    '-c', 'copy', f'{A}/video_only.mp4'], check=True)
    print('video done', flush=True)
