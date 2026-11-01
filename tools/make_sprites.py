#!/usr/bin/env python3
"""Turn the photo of the ballpoint doodles (art/original-drawing.jpg) into the game's sprites.

    pip install -r tools/requirements.txt
    python3 tools/make_sprites.py    # -> art/sprites/*.png (lossless masters) + game/assets/*.webp
    python3 tools/make_icons.py      # -> Android launcher icons

How it works
  1. The page is turned upright and the paper's brightness is estimated with a wide percentile
     filter, so the lighting and shadows of the phone photo cancel out.
  2. Ink is whatever is much darker than the paper. The printed grid and old pencil marks are
     lighter, so they drop out, and what remains becomes an alpha mask that keeps the pen texture.
  3. Every stroke is assigned to one drawing using hand-placed regions (REGIONS below).
  4. Per drawing: stray specks are removed, a paper-white silhouette is filled in behind the ink
     (so sprites read as cut-outs), a light highlighter tint is added, then the sprite is cropped,
     rotated if needed and scaled.
All coordinates are specific to art/original-drawing.jpg (in the upright page, 2212 x 1659 px).
Anchor points the game needs are written to art/sprites/meta.json (they match SP in game.js).
"""
import json
from pathlib import Path

import cv2
import numpy as np
from matplotlib.path import Path as Poly
from PIL import Image, ImageOps
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "original-drawing.jpg"
PNG_DIR = ROOT / "art" / "sprites"
WEBP_DIR = ROOT / "game" / "assets"

INK = np.array([34, 40, 128], np.float32) / 255.0        # ballpoint blue
PAPER = np.array([255, 254, 249], np.float32) / 255.0
YELLOW, GREEN, RED = (255, 224, 90), (150, 215, 120), (255, 120, 110)

# Rough region around each drawing (first match wins). Strokes are assigned by their centre.
REGIONS = {
    "frame":      [(0, 0), (2212, 0), (2212, 55), (1905, 62), (1172, 162), (440, 94), (0, 94)],  # page border, ignored
    "star_tiny":  [(1280, 625), (1360, 625), (1360, 712), (1280, 712)],
    "star_small": [(1235, 440), (1316, 440), (1316, 520), (1235, 520)],
    "star_big":   [(1205, 520), (1402, 520), (1402, 668), (1205, 668)],
    "star_line":  [(1385, 215), (1575, 215), (1575, 472), (1385, 472)],
    "tree":       [(530, 165), (1092, 165), (1092, 860), (530, 860)],
    "galaxy":     [(1093, 160), (1408, 160), (1408, 520), (1093, 520)],
    "comet":      [(1400, 55), (2000, 55), (2000, 860), (1400, 860)],
    "pot":        [(140, 520), (640, 520), (640, 1260), (140, 1260)],
    "catplanet":  [(700, 870), (1400, 870), (1400, 1520), (700, 1520)],
    "rocket":     [(1460, 930), (1990, 930), (1990, 1570), (1460, 1570)],
}


# ------------------------------------------------------------------ 1-3. ink mask + ownership
def background(ch, k=8, size=13, pct=88):
    h, w = ch.shape
    small = cv2.resize(ch, (w // k, h // k), interpolation=cv2.INTER_AREA)
    bg = cv2.GaussianBlur(ndi.percentile_filter(small, pct, size=size), (0, 0), 3)
    return cv2.resize(bg, (w, h), interpolation=cv2.INTER_CUBIC)


page = ImageOps.exif_transpose(Image.open(SRC)).rotate(90, expand=True)  # photographed sideways
IM = np.asarray(page).astype(np.float32)
lum = IM @ np.array([0.299, 0.587, 0.114], np.float32)
norm = lum / np.maximum(background(lum), 1)
A = np.clip((0.66 - norm) / (0.66 - 0.42), 0, 1).astype(np.float16).astype(np.float32)
H, W = A.shape

m0 = A > 0.12
lab0, n0 = ndi.label(ndi.binary_dilation(m0, iterations=2), structure=np.ones((3, 3)))
lab0 = lab0 * m0
idx = np.arange(1, n0 + 1)
counts = ndi.sum(m0, lab0, idx)
cy, cx = np.array(ndi.center_of_mass(m0, lab0, idx)).T
NAMES = list(REGIONS)
owner = np.zeros(n0 + 1, np.int32)
for i in range(n0):
    if counts[i] < 4:
        continue
    for j, name in enumerate(NAMES):
        if Poly(REGIONS[name]).contains_point((cx[i], cy[i])):
            owner[i + 1] = j + 1
            break
OWN = owner[lab0].astype(np.int8)
YY, XX = np.mgrid[0:H, 0:W]


# ------------------------------------------------------------------ helpers
def oid(name):
    return NAMES.index(name) + 1


def obj_mask(name, thr=0.12):
    return (OWN == oid(name)) & (A > thr)


def soft(m):
    """Soft ink alpha, limited to a slightly dilated stroke mask."""
    return A * ndi.binary_dilation(m, iterations=2)


def poly_mask(pts):
    return Poly(pts).contains_points(np.c_[XX.ravel(), YY.ravel()]).reshape(H, W)


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


def clean(m, big=300, keep_any=45, near=18):
    """Drop specks: keep big strokes, plus small ones that are large enough or close to big ones."""
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    if n == 0:
        return m
    sizes = ndi.sum(m, lab, np.arange(1, n + 1))
    main = np.isin(lab, np.where(sizes >= big)[0] + 1)
    dist = ndi.distance_transform_edt(~main)
    keep = main.copy()
    for i, s in enumerate(sizes):
        if s < big:
            comp = lab == i + 1
            if s >= keep_any or dist[comp].min() <= near:
                keep |= comp
    return keep


def largest(m, near=4):
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    sizes = ndi.sum(m, lab, np.arange(1, n + 1))
    big = lab == (np.argmax(sizes) + 1)
    d = ndi.distance_transform_edt(~big)
    keep = big.copy()
    for i in range(n):
        c = lab == i + 1
        if d[c].min() <= near:
            keep |= c
    return keep


def silhouette(m, r, hole_rule=None):
    """Closed + hole-filled outline of a drawing (the paper 'cut-out' behind the ink)."""
    c = ndi.binary_closing(np.pad(m, r + 2), structure=disk(r))[r + 2:-(r + 2), r + 2:-(r + 2)] | m
    filled = ndi.binary_fill_holes(c)
    if hole_rule is None:
        return filled
    holes = filled & ~c
    lab, n = ndi.label(holes)
    dt = ndi.distance_transform_edt(holes)
    out = c.copy()
    for i in range(1, n + 1):
        h = lab == i
        if hole_rule(h, dt[h].max(), h.sum()):
            out |= h
    return out


def blur(m, s):
    return cv2.GaussianBlur(np.asarray(m, np.float32), (0, 0), s)


def compose(ink_a, fill_a, tints):
    """Ink over (highlighter tints over a paper fill) -> float RGBA."""
    fa = np.clip(fill_a, 0, 1)
    base = np.zeros(ink_a.shape + (3,), np.float32) + PAPER
    for col, ta in tints:
        ta = np.clip(ta, 0, 1)[..., None]
        base = base * (1 - ta) + np.array(col, np.float32)[None, None, :] / 255.0 * ta
    ia = np.clip(ink_a, 0, 1)
    a_out = ia + fa * (1 - ia)
    rgb = (INK * ia[..., None] + base * (fa * (1 - ia))[..., None]) / np.maximum(a_out, 1e-6)[..., None]
    return np.dstack([rgb, a_out])


def rotate(arrs, angle, center):
    """Rotate 2-D float arrays counter-clockwise by angle (degrees) about center, growing the canvas."""
    h, w = arrs[0].shape
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw, nh = int(h * sin + w * cos) + 2, int(h * cos + w * sin) + 2
    M[0, 2] += nw / 2 - center[0]
    M[1, 2] += nh / 2 - center[1]
    return [cv2.warpAffine(a.astype(np.float32), M, (nw, nh), flags=cv2.INTER_CUBIC, borderValue=0) for a in arrs]


META = {}


def make(name, ink_a, fill_a, scale, tints=(), pad=6, gamma=0.8):
    """Crop, compose and scale one sprite; records its crop origin for anchor maths."""
    ys, xs = np.where((ink_a > 0.02) | (fill_a > 0.02))
    y0, x0 = max(ys.min() - pad, 0), max(xs.min() - pad, 0)
    sl = (slice(y0, ys.max() + pad + 1), slice(x0, xs.max() + pad + 1))
    rgba = compose(np.clip(ink_a[sl], 0, 1) ** gamma, fill_a[sl], [(c, t[sl]) for c, t in tints])
    img = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    if scale != 1:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    META[name] = dict(w=img.width, h=img.height, ox=int(x0), oy=int(y0), scale=scale)
    return img


def save(name, img, webp_img=None):
    PNG_DIR.mkdir(parents=True, exist_ok=True)
    WEBP_DIR.mkdir(parents=True, exist_ok=True)
    img.save(PNG_DIR / f"{name}.png", optimize=True)
    (webp_img or img).save(WEBP_DIR / f"{name}.webp", "WEBP", quality=90, method=6, alpha_quality=100)
    print(f"  {name:11s} {img.size[0]:4d} x {img.size[1]:<4d}")


def pca_angle(m):
    ys, xs = np.where(m)
    pts = np.c_[xs, ys].astype(np.float64)
    pts -= pts.mean(0)
    w, v = np.linalg.eigh(np.cov(pts.T))
    d = v[:, np.argmax(w)]
    return np.degrees(np.arctan2(-d[1], d[0])), (xs.mean(), ys.mean())


# ------------------------------------------------------------------ 4. the drawings
print("sprites:")

# stars (the small one touches a galaxy arm, so it is cut out geometrically)
small_poly = poly_mask([(1251, 446), (1302, 452), (1304, 514), (1256, 507), (1250, 478)])


def star(name, m, scale, r=4):
    m = largest(m)
    f = blur(silhouette(m, r), 0.8)
    return make(name, soft(m), f, scale, [(YELLOW, f)])


save("star_big", star("star_big", obj_mask("star_big"), 0.8))
save("star_line", star("star_line", obj_mask("star_line"), 0.8))
img = star("star_small", ((OWN == oid("galaxy")) | (OWN == oid("star_small"))) & small_poly & (A > 0.12), 1.0)
px = np.array(img)
px[3:18, 21:41, 3] = 0  # erase the tip of the galaxy arm that touches this star
save("star_small", Image.fromarray(px))
save("star_tiny", star("star_tiny", obj_mask("star_tiny"), 1.0, r=3))

# galaxy, with a soft lavender glow in the core
gal_m = clean(obj_mask("galaxy") & ~small_poly, big=200, keep_any=60, near=14)
gf = blur(silhouette(gal_m, 12), 1.2)
glow = np.clip(1 - np.sqrt((XX - 1250.0) ** 2 + (YY - 330.0) ** 2) / 150.0, 0, 1) ** 1.3 * 0.55
save("galaxy", make("galaxy", soft(gal_m), gf, 1.15, [((196, 170, 255), gf * glow)]))

# tree: green highlighter on the canopy only
tm = clean(obj_mask("tree"), big=300, keep_any=60, near=14)
tf = blur(silhouette(tm, 17), 1.2)
trunk = blur(poly_mask([(762, 505), (902, 468), (1040, 840), (660, 840)]), 6)
save("tree", make("tree", soft(tm), tf, 1.0, [(GREEN, tf * (1 - trunk) * 0.5)]))

# flower pot, split at the rim into pot / flower / sprout (the garden grows in stages)
pm = clean(obj_mask("pot"), big=300, keep_any=60, near=14)
row = np.arange(H)[:, None]
SPLIT, SPROUT = 969, 772
flower_m = largest(pm & (row < SPLIT), near=6)
pot_m = pm & (row >= SPLIT)
ff = blur(silhouette(flower_m, 5), 1.0) * (row < SPLIT)
pf = blur(silhouette(pot_m, 9), 1.0) * (row >= SPLIT)
centre = blur(((XX - 372.0) ** 2 + (YY - 662.0) ** 2) < 24 ** 2, 2)
leaf = np.clip((YY - 760) / 20.0, 0, 1)
save("flower", make("flower", soft(flower_m) * (row < SPLIT + 1), ff, 0.9,
                    [(GREEN, ff * leaf * 0.45), ((255, 226, 92), ff * centre)], pad=0))
sp = flower_m & (row > SPROUT)
save("sprout", make("sprout", soft(sp) * (row > SPROUT) * (row < SPLIT + 1), ff * (row > SPROUT + 2), 0.9,
                    [(GREEN, ff * (row > SPROUT + 2) * 0.45)], pad=0))
save("pot", make("pot", soft(pot_m) * (row >= SPLIT - 1), pf, 0.9, [((236, 150, 110), pf * 0.42)], pad=0))

# cat planet: fill the cat and the planet, keep the gaps between ring and planet see-through
cm = clean(obj_mask("catplanet"), big=300, keep_any=40, near=18)
inside = ((((XX - 1070) / 165.0) ** 2 + ((YY - 1205) / 140.0) ** 2) <= 1) | \
         ((((XX - 1035) / 105.0) ** 2 + ((YY - 1010) / 100.0) ** 2) <= 1)
cf0 = silhouette(cm, 10, lambda h, maxr, area: inside[h].mean() > 0.5 or maxr < 14 or area < 700)
catreg = poly_mask([(950, 935), (1135, 935), (1135, 1118), (950, 1118)])
cc = ndi.binary_closing(np.pad(cm & catreg, 30), structure=disk(24))[30:-30, 30:-30]
head = (((XX - 1045) / 76.0) ** 2 + ((YY - 1010) / 46.0) ** 2) <= 1
cf = blur(cf0 | (ndi.binary_fill_holes(cc) & catreg) | head, 1.0)
planet = blur((((XX - 1078) / 138.0) ** 2 + ((YY - 1212) / 118.0) ** 2) <= 1, 3)
save("catplanet", make("catplanet", soft(cm), cf, 1.0, [((150, 205, 255), cf * planet * 0.55)]))

# comet: turned so the tail points straight up, icy tint fading along the tail
co = clean(obj_mask("comet"), big=250, keep_any=40, near=20)
ang, ctr = pca_angle(co)
ang = ang + 180 if ang < 0 else ang
cof = blur(silhouette(co, 14), 1.2)
tail = np.clip(1 - np.sqrt((XX - 1500.0) ** 2 + (YY - 705.0) ** 2) / 700.0, 0, 1)
rock = blur((((XX - 1500.0) / 75) ** 2 + ((YY - 705.0) / 70) ** 2) <= 1, 4)
ia, fa, ta, rk = rotate([soft(co), cof, cof * tail * 0.5, cof * rock], 90 - ang, ctr)
save("comet", make("comet", ia, fa, 0.55, [((170, 225, 255), np.maximum(ta, 0))]))
make("comet_rock", rk, rk, 0.55)  # only for the head anchor in meta.json

# rocket: the three speed dashes next to it are left out, then it is stood upright
ro_all = obj_mask("rocket")
lab, n = ndi.label(ro_all, structure=np.ones((3, 3)))
sizes = ndi.sum(ro_all, lab, np.arange(1, n + 1))
coms = ndi.center_of_mass(ro_all, lab, np.arange(1, n + 1))
dash_ids = [min(range(n), key=lambda i: (coms[i][1] - x) ** 2 + (coms[i][0] - y) ** 2 if sizes[i] > 100 else 1e18) + 1
            for x, y in [(1914, 1265), (1945, 1368), (1818, 1415)]]
dash = np.isin(lab, dash_ids)
mainset = np.isin(lab, np.where(sizes >= 30)[0] + 1) & ~dash
dist = ndi.distance_transform_edt(~mainset)
body = mainset.copy()
for i in range(n):
    if sizes[i] < 30 and dist[lab == i + 1].min() <= 6:
        body |= lab == i + 1
AXIS = 52.0  # the rocket was drawn pointing 52 degrees above horizontal
ria, rfa = rotate([soft(body), blur(silhouette(body, 9), 1.0)], 90 - AXIS, (1700.0, 1250.0))
ria = ria.astype(np.float16).astype(np.float32)
rfa = rfa.astype(np.float16).astype(np.float32)
ry, rx = np.mgrid[0:ria.shape[0], 0:ria.shape[1]].astype(np.float32)
nozzle = 1551 + (rx - 1330) * 0.124 + 3           # the flame starts below this line
k = np.clip((ry - nozzle) / 2.0 + 0.5, 0, 1)
ffl = blur(silhouette(ria * k > 0.12, 9), 1.0) * (ry > nozzle - 2)
grad = np.clip((ry - 1555) / 120.0, 0, 1)
save("flame", make("flame", ria * k, ffl, 0.6, [((255, 150, 50), ffl * (0.55 + 0.45 * grad))]))
hull_pts = np.argwhere((ria > 0.3) & (ry > 1098) & (rx > 1312) & (rx < 1452) & (ry < 1572))[:, ::-1].astype(np.int32)
hull = np.zeros(ria.shape, np.uint8)
cv2.fillConvexPoly(hull, cv2.convexHull(hull_pts), 1)
hull = cv2.erode(hull, np.ones((3, 3), np.uint8), iterations=2)
rfa = np.maximum(rfa, blur(hull, 1.0))
red = blur(((ry < 1172) & (ry > 1040)) | ((rx > 1452) & (ry > 1185) & (ry < 1500)), 2.5)  # nose + booster
save("rocket", make("rocket", ria * (1 - k), rfa * (1 - k), 0.6, [(RED, rfa * (1 - k) * red * 0.5)]))

# the AERO.CAT lettering on the rocket becomes the title logo (upscaled and smoothed)
t = np.rot90(np.clip(ria[1166:1476, 1377:1440], 0, 1), k=-1).copy()
tl, tn = ndi.label(t > 0.3, structure=np.ones((3, 3)))
tsz = ndi.sum(t > 0.3, tl, np.arange(1, tn + 1))
t = np.pad(t * ndi.binary_dilation(np.isin(tl, np.where(tsz >= 25)[0] + 1), iterations=2), 6)
up = cv2.GaussianBlur(cv2.resize(t, (t.shape[1] * 6, t.shape[0] * 6), interpolation=cv2.INTER_CUBIC), (0, 0), 3.6)
a = np.clip((up - 0.28) / 0.22, 0, 1)
a = a * a * (3 - 2 * a)
ys, xs = np.where(a > 0.01)
a = a[max(ys.min() - 8, 0):ys.max() + 9, max(xs.min() - 8, 0):xs.max() + 9]
logo = np.zeros(a.shape + (4,), np.uint8)
logo[..., :3] = (INK * 255).round().astype(np.uint8)
logo[..., 3] = (a * 255).astype(np.uint8)
logo = Image.fromarray(logo, "RGBA")
save("logo_text", logo, logo.resize((logo.width // 2, logo.height // 2), Image.LANCZOS))

# ------------------------------------------------------------------ anchors used by game.js (SP)
r, f, c, cr = META["rocket"], META["flame"], META["comet"], META["comet_rock"]
anchors = {
    "rocket": {"w": r["w"], "h": r["h"], "fx": round((f["ox"] - r["ox"]) * 0.6, 1), "fy": round((f["oy"] - r["oy"]) * 0.6, 1)},
    "comet": {"w": c["w"], "h": c["h"],
              "hx": round((cr["ox"] - c["ox"]) * 0.55 + cr["w"] / 2), "hy": round((cr["oy"] - c["oy"]) * 0.55 + cr["h"] / 2)},
    "crops": {k: v for k, v in META.items() if k != "comet_rock"},
}
(PNG_DIR / "meta.json").write_text(json.dumps(anchors, indent=1))
print("anchors -> art/sprites/meta.json:", anchors["rocket"], anchors["comet"])
