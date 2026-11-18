# Builds assets/showcase.png: two desktop screenshots stacked on the left, a tall phone on the right,
# each on its own gradient panel. Run: python3 scripts/make_showcase.py
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import textwrap

SHOTS = "/home/yousefmsm1/Desktop/mostqel/screenshots/raw"
WADDLE_FRAME = "/tmp/waddle_frame.png"  # ffmpeg -ss 12 -i waddle_showcase_16x9.mp4 -frames:v 1 /tmp/waddle_frame.png
W, H, GAP, R = 1600, 900, 16, 22
LEFT_W = W - GAP - 520


def gradient(w, h, top, bottom):
    g = Image.new("RGB", (1, 2))
    g.putpixel((0, 0), top)
    g.putpixel((0, 1), bottom)
    # diagonal-ish: vertical blend, then rotate a little by resizing from a 2x2 seed
    seed = Image.new("RGB", (2, 2))
    seed.putdata([top, top, bottom, bottom])
    seed.putpixel((1, 0), tuple((a + b) // 2 for a, b in zip(top, bottom)))
    return seed.resize((w, h), Image.BILINEAR)


def rounded(img, r):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *img.size), r, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def panel(w, h, top, bottom, shot, pad, title, desc, ink):
    bg = gradient(w, h, top, bottom).convert("RGBA")
    s = shot.copy()
    s.thumbnail((w - 360 - pad, h - 2 * pad), Image.LANCZOS)  # leave the left side for the label
    s = rounded(s.convert("RGB"), 12)
    x, y = w - pad - s.width, (h - s.height) // 2
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 10, x + s.width, y + s.height + 10), 12, fill=(0, 0, 0, 140))
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
    bg.alpha_composite(s, (x, y))
    d = ImageDraw.Draw(bg)
    tf = ImageFont.truetype("assets/fonts/silkscreen-700.ttf", 34)
    bf = ImageFont.truetype("assets/fonts/GeistMono-Regular.ttf", 19)
    body = "\n".join(textwrap.wrap(desc, 24))
    th = 34 + 22 + d.multiline_textbbox((0, 0), body, font=bf, spacing=8)[3]
    ty = (h - th) // 2
    d.text((pad + 8, ty), title, font=tf, fill=ink)
    d.multiline_text((pad + 8, ty + 56), body, font=bf, fill=ink + (200,), spacing=8)
    return rounded(bg, R)


canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
half = (H - GAP) // 2
swrmz = Image.open(f"{SHOTS}/swrmz_app.jpg")
icpc = Image.open(f"{SHOTS}/icpchue_dashboard.jpg")
canvas.alpha_composite(panel(LEFT_W, half, (120, 18, 28), (20, 6, 10), swrmz, 34, "SWRMZ", "A swarm of AI agents that hunts the holes in your stack.", (255, 255, 255)), (0, 0))
canvas.alpha_composite(panel(LEFT_W, half, (250, 196, 40), (232, 110, 20), icpc, 34, "ICPCHUE", "Training platform and online judge for competitive programmers.", (20, 14, 6)), (0, half + GAP))

# phone: crop the screen out of the waddle video frame and draw our own bezel
screen = Image.open(WADDLE_FRAME).convert("RGB").crop((1182, 62, 1620, 1015))
ph_h = H - 2 * 50
ph_w = round(screen.width * (ph_h - 24) / screen.height) + 24
phone = Image.new("RGBA", (ph_w, ph_h), (0, 0, 0, 0))
ImageDraw.Draw(phone).rounded_rectangle((0, 0, ph_w, ph_h), 52, fill=(18, 18, 20, 255))
phone.alpha_composite(rounded(screen.resize((ph_w - 24, ph_h - 24), Image.LANCZOS), 40), (12, 12))
right = gradient(520, H, (255, 214, 170), (240, 140, 70)).convert("RGBA")
shadow = Image.new("RGBA", right.size, (0, 0, 0, 0))
px, py = (520 - ph_w) // 2, 50
ImageDraw.Draw(shadow).rounded_rectangle((px, py + 14, px + ph_w, py + ph_h + 14), 52, fill=(80, 30, 0, 120))
right.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
right.alpha_composite(phone, (px, py))
canvas.alpha_composite(rounded(right, R), (LEFT_W + GAP, 0))

canvas.save("assets/showcase.png", optimize=True)
print("assets/showcase.png", canvas.size)
