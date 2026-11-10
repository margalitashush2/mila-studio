"""Luxury gold logo for גמ"ח החסד של דניאל אשוש.

python3 make_logo.py OUT.png [--dark-preview PREVIEW.jpg]
Draws a white mask at 2x, then fills it with a gold-foil material (metallic bands + bevel + fine grain).
"""
import math, os, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'fonts')
SS = 2  # supersampling
WID, HEI = 1400, 1720
w, h = WID * SS, HEI * SS
L = lambda v: int(v * SS)


def f(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), L(size), layout_engine=ImageFont.Layout.RAQM)


mask = Image.new('L', (w, h), 0)
d = ImageDraw.Draw(mask)
cx = w / 2

# ---------------- emblem: double arch (home / doorway)
AW, AH = 760, 900          # outer arch
top = 70
base_y = top + AH


def arch(dr, half_w, y_top, y_base, width):
    r = half_w
    dr.arc((cx - L(r), L(y_top), cx + L(r), L(y_top + 2 * r)), 180, 360, fill=255, width=L(width))
    dr.line((cx - L(r) + L(width) / 2, L(y_top + r), cx - L(r) + L(width) / 2, L(y_base)), fill=255, width=L(width))
    dr.line((cx + L(r) - L(width) / 2, L(y_top + r), cx + L(r) - L(width) / 2, L(y_base)), fill=255, width=L(width))


arch(d, AW / 2, top, base_y, 14)
arch(d, AW / 2 - 30, top + 30, base_y, 4)

# base line with diamonds
d.line((cx - L(AW / 2 + 110), L(base_y), cx + L(AW / 2 + 110), L(base_y)), fill=255, width=L(6))
for sx in (-1, 1):
    x0 = cx + sx * L(AW / 2 + 130)
    y0 = L(base_y)
    s = L(16)
    d.polygon([(x0, y0 - s), (x0 + s, y0), (x0, y0 + s), (x0 - s, y0)], fill=255)

# keystone diamond on top of arch
s = L(22)
d.polygon([(cx, L(top) - s - L(8)), (cx + s, L(top) - L(8)), (cx, L(top) + s - L(8)), (cx - s, L(top) - L(8))], fill=255)

# ---------------- armchair (elegant line art)
lw = L(11)
chx, chy = cx, L(base_y - 330)     # chair centre
cw, chh = L(380), L(330)
# backrest: rounded top shape
back = (chx - cw * 0.34, chy - chh * 0.62, chx + cw * 0.34, chy + chh * 0.08)
d.rounded_rectangle(back, radius=int(cw * 0.22), outline=255, width=lw)
# seat cushion
seat = (chx - cw * 0.39, chy + chh * 0.08, chx + cw * 0.39, chy + chh * 0.30)
d.rounded_rectangle(seat, radius=int(chh * 0.08), outline=255, width=lw)
# armrests (rolled)
for sx in (-1, 1):
    ax = chx + sx * cw * 0.50
    d.rounded_rectangle((ax - cw * 0.11, chy - chh * 0.22, ax + cw * 0.11, chy + chh * 0.40),
                        radius=int(cw * 0.1), outline=255, width=lw)
# base rail
d.line((chx - cw * 0.58, chy + chh * 0.40, chx + cw * 0.58, chy + chh * 0.40), fill=255, width=lw)
# tapered legs
for sx in (-1, 1):
    x_top = chx + sx * cw * 0.46
    d.line((x_top, chy + chh * 0.40, x_top + sx * cw * 0.07, chy + chh * 0.66), fill=255, width=lw)
# heart on backrest (chesed)
hx, hy, hs = chx, chy - chh * 0.25, cw * 0.075
pts = []
for i in range(200):
    t = i / 200 * 2 * math.pi
    x = 16 * math.sin(t) ** 3
    y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
    pts.append((hx + x * hs / 16, hy + y * hs / 16))
d.polygon(pts, fill=255)

# sparkles inside the arch
def sparkle(x, y, r):
    pts = []
    for i in range(8):
        a = i * math.pi / 4 - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.22
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    d.polygon(pts, fill=255)


sparkle(cx - L(170), L(top + 250), L(30))
sparkle(cx + L(190), L(top + 200), L(20))
sparkle(cx + L(120), L(top + 330), L(12))

# ---------------- typography
def spaced(txt, n):
    sp = chr(0x2009) * n
    return sp.join(txt).replace(sp + '״' + sp, '״')


def text_c(txt, font, y, spacing=0):
    if spacing:
        txt = spaced(txt, spacing)
    d.text((cx, L(y)), txt, font=font, fill=255, anchor='mm', direction='rtl', language='he')


ty = base_y + 120
# small caps line with flanking rules
text_c('גמ״ח החסד של', f('Heebo_400Regular.ttf', 62), ty, spacing=2)
tw = d.textlength(spaced('גמ״ח החסד של', 2), font=f('Heebo_400Regular.ttf', 62), direction='rtl')
for sx in (-1, 1):
    x0 = cx + sx * (tw / 2 + L(30))
    x1 = cx + sx * (tw / 2 + L(170))
    d.line((x0, L(ty), x1, L(ty)), fill=255, width=L(4))
# name
text_c('דניאל אשוש', f('FrankRuhlLibre_900Black.ttf', 230), ty + 215)
# divider ornament
dy = ty + 380
d.line((cx - L(330), L(dy), cx - L(40), L(dy)), fill=255, width=L(4))
d.line((cx + L(40), L(dy), cx + L(330), L(dy)), fill=255, width=L(4))
s = L(14)
d.polygon([(cx, L(dy) - s), (cx + s, L(dy)), (cx, L(dy) + s), (cx - s, L(dy))], fill=255)
# tagline
text_c('חסד אמיתי · מאדם לאדם', f('Bellefair_400Regular.ttf', 70), dy + 85, spacing=1)

m = np.asarray(mask).astype(np.float32) / 255.0

# ---------------- gold foil material
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
u = (xx * 0.55 + yy) / (h * 1.0)
stops = np.array([0.0, 0.18, 0.32, 0.48, 0.62, 0.78, 1.0])
cols = np.array([[150, 108, 38], [246, 222, 150], [196, 150, 62], [255, 244, 200],
                 [178, 128, 46], [236, 200, 110], [160, 116, 40]], np.float32) / 255
base = np.stack([np.interp(u, stops, cols[:, c]) for c in range(3)], -1)
# bevel from alpha
hgt = cv2.GaussianBlur(m, (0, 0), 3 * SS)
gx = cv2.Sobel(hgt, cv2.CV_32F, 1, 0, ksize=3)
gy = cv2.Sobel(hgt, cv2.CV_32F, 0, 1, ksize=3)
light = -(gx * -0.6 + gy * -0.8)
light = np.clip(light * 2.2, -1, 1)[..., None]
foil = np.clip(base + light * 0.28, 0, 1)
# fine brushed grain
rng = np.random.default_rng(1)
grain = cv2.GaussianBlur(rng.standard_normal((h, w)).astype(np.float32), (0, 0), 0.8) * 0.025
foil = np.clip(foil + grain[..., None], 0, 1)

rgba = np.dstack([foil, m])
img = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').resize((WID, HEI), Image.LANCZOS)
bb = img.getbbox()
img = img.crop((max(0, bb[0] - 20), max(0, bb[1] - 20), min(WID, bb[2] + 20), min(HEI, bb[3] + 20)))
img.save(sys.argv[1])
print(img.size)

if '--dark-preview' in sys.argv:
    out = sys.argv[sys.argv.index('--dark-preview') + 1]
    bg = Image.new('RGBA', (img.width + 200, img.height + 200), (11, 16, 30, 255))
    g = np.asarray(bg).astype(np.float32)
    Y, X = np.mgrid[0:bg.height, 0:bg.width]
    glow = np.exp(-(((X - bg.width / 2) / bg.width) ** 2 + ((Y - bg.height * 0.45) / bg.height) ** 2) * 4)
    g[..., :3] += glow[..., None] * np.array([70, 48, 15])
    bg = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGBA')
    bg.alpha_composite(img, (100, 100))
    bg.convert('RGB').save(out, quality=92)
