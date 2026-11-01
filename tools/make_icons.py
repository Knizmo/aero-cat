#!/usr/bin/env python3
"""Android launcher icons from the sprites: the rocket at the angle it was drawn, on notebook paper.

    python3 tools/make_icons.py   # needs art/sprites/*.png (see make_sprites.py)
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SPR = ROOT / "art" / "sprites"
RES = ROOT / "android" / "res"
PAPER = (251, 250, 243, 255)

load = lambda n: Image.open(SPR / f"{n}.png").convert("RGBA")
rocket, flame, star, star2 = load("rocket"), load("flame"), load("star_line"), load("star_big")
meta = json.loads((SPR / "meta.json").read_text()) if (SPR / "meta.json").exists() else {}
fx, fy = meta.get("rocket", {}).get("fx", 42.6), meta.get("rocket", {}).get("fy", 349.8)

# rocket + flame, turned back to the angle it was drawn at (nose up and to the right)
comp = Image.new("RGBA", (rocket.width, int(fy + flame.height + 2)), (0, 0, 0, 0))
comp.alpha_composite(flame, (int(round(fx)), int(round(fy))))
comp.alpha_composite(rocket, (0, 0))
tilted = comp.rotate(-38, resample=Image.BICUBIC, expand=True)
tilted = tilted.crop(tilted.getbbox())


def paper(s):
    im = Image.new("RGBA", (s, s), PAPER)
    d = ImageDraw.Draw(im)
    step = s / 18.0
    for i in range(19 * 4):  # French-ruled (Seyes) lines
        d.line([(0, i * step / 4), (s, i * step / 4)], fill=(176, 150, 215, 255) if i % 4 == 0 else (200, 210, 238, 255), width=max(1, s // 220))
    for i in range(19):
        d.line([(i * step + step * 0.3, 0), (i * step + step * 0.3, s)], fill=(176, 150, 215, 255), width=max(1, s // 220))
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    r, c = s * 0.30, s / 2
    ImageDraw.Draw(glow).ellipse([c - r, c - r, c + r, c + r], fill=(255, 224, 102, 150))  # yellow highlighter
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(s * 0.01)))
    return im


def place(canvas, sprite, box, centre):
    s = canvas.width
    k = min(s * box / sprite.width, s * box / sprite.height)
    sp = sprite.resize((max(1, int(sprite.width * k)), max(1, int(sprite.height * k))), Image.LANCZOS)
    canvas.alpha_composite(sp, (int(s * centre[0] - sp.width / 2), int(s * centre[1] - sp.height / 2)))


# adaptive icon (Android 8+): 108dp layers at xxxhdpi = 432 px, art kept inside the 66dp safe zone
S = 432
(RES / "drawable-nodpi").mkdir(parents=True, exist_ok=True)
paper(S).convert("RGB").save(RES / "drawable-nodpi" / "ic_launcher_background.png")
fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
place(fg, star, 0.13, (0.30, 0.30))
place(fg, star2, 0.10, (0.71, 0.70))
place(fg, tilted, 0.60, (0.5, 0.5))
fg.save(RES / "drawable-nodpi" / "ic_launcher_foreground.png")

# legacy icons (Android 5-7): rounded square
big = 512
im = paper(big)
place(im, star, 0.14, (0.25, 0.25))
place(im, star2, 0.11, (0.76, 0.74))
place(im, tilted, 0.78, (0.5, 0.5))
mask = Image.new("L", (big, big), 0)
ImageDraw.Draw(mask).rounded_rectangle([8, 8, big - 8, big - 8], radius=big * 0.2, fill=255)
legacy = Image.new("RGBA", (big, big), (0, 0, 0, 0))
legacy.paste(im, (0, 0), mask)
ImageDraw.Draw(legacy).rounded_rectangle([8, 8, big - 8, big - 8], radius=big * 0.2, outline=(34, 40, 128, 255), width=10)
for density, px in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
    (RES / f"mipmap-{density}").mkdir(parents=True, exist_ok=True)
    legacy.resize((px, px), Image.LANCZOS).save(RES / f"mipmap-{density}" / "ic_launcher.png")
print("icons written to android/res/")
