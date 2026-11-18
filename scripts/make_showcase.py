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


def rr_mask(size, r, inset=0, k=4):
    """Anti-aliased rounded-rect mask: draw at k x size, then downsample."""
    w, h = size
    m = Image.new("L", (w * k, h * k), 0)
    ImageDraw.Draw(m).rounded_rectangle((inset * k, inset * k, (w - inset) * k - 1, (h - inset) * k - 1), r * k, fill=255)
    return m.resize(size, Image.LANCZOS)


def rounded(img, r):
    mask = rr_mask(img.size, r)
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
    label(d, pad + 8, None, h, title, desc, ink, 26)
    return rounded(bg, R)


TF = ImageFont.truetype("assets/fonts/Geist-SemiBold.ttf", 42)
BF = ImageFont.truetype("assets/fonts/Geist-Regular.ttf", 22)


def label(d, x, y, h, title, desc, ink, wrap):
    """Title + wrapped description; vertically centred in h when y is None."""
    body = "\n".join(textwrap.wrap(desc, wrap))
    th = 42 + 18 + d.multiline_textbbox((0, 0), body, font=BF, spacing=8)[3]
    y = (h - th) // 2 if y is None else y
    d.text((x, y), title, font=TF, fill=ink)
    d.multiline_text((x, y + 60), body, font=BF, fill=ink + (190,), spacing=8)


canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
half = (H - GAP) // 2
swrmz = Image.open(f"{SHOTS}/swrmz_app.jpg")
icpc = Image.open(f"{SHOTS}/icpchue_dashboard.jpg")
canvas.alpha_composite(panel(LEFT_W, half, (120, 18, 28), (20, 6, 10), swrmz, 34, "SWRMZ", "A swarm of AI agents that hunts the holes in your stack.", (255, 255, 255)), (0, 0))
canvas.alpha_composite(panel(LEFT_W, half, (250, 196, 40), (232, 110, 20), icpc, 34, "ICPCHUE", "Training platform and online judge for competitive programmers.", (20, 14, 6)), (0, half + GAP))

# phone: crop just the app screen out of the waddle video frame (below the notch, inside the bezel)
screen = Image.open(WADDLE_FRAME).convert("RGB").crop((1196, 132, 1606, 963))
PW, TOP = 520, 180
ph_h = H - TOP - 40


def make_phone(screen, h, k=4):
    """Titanium-frame phone drawn at k x scale, then downsampled for crisp anti-aliased edges."""
    rim, bez, R0 = 5, 9, 60  # titanium rim width, black bezel width, outer radius
    inset = rim + bez
    w = round(screen.width * (h - 2 * inset) / screen.height) + 2 * inset
    W_, H_, B = w * k, h * k, 4 * k  # B = room for side buttons
    img = Image.new("RGBA", (W_ + 2 * B, H_), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    metal = (176, 176, 182, 255)
    # side buttons: action + volume on the left, power on the right
    for y0, y1 in ((0.17, 0.22), (0.26, 0.34), (0.37, 0.45)):
        d.rounded_rectangle((0, y0 * H_, B + 2 * k, y1 * H_), 2 * k, fill=metal)
    d.rounded_rectangle((W_ + B - 2 * k, 0.28 * H_, W_ + 2 * B, 0.40 * H_), 2 * k, fill=metal)
    # titanium frame: horizontal light-dark-light gradient, like brushed metal catching light
    frame = Image.new("RGB", (5, 1))
    frame.putdata([(214, 214, 220), (150, 150, 158), (120, 120, 128), (150, 150, 158), (214, 214, 220)])
    frame = frame.resize((W_, H_), Image.BICUBIC).convert("RGBA")
    m = Image.new("L", (W_, H_), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, W_ - 1, H_ - 1), R0 * k, fill=255)
    img.paste(frame, (B, 0), m)
    d.rounded_rectangle((B + 1 * k, 1 * k, B + W_ - 1 * k, H_ - 1 * k), (R0 - 1) * k, outline=(235, 235, 240, 255), width=k)  # edge highlight
    d.rounded_rectangle((B + rim * k, rim * k, B + W_ - rim * k, H_ - rim * k), (R0 - rim) * k, fill=(6, 6, 7, 255))  # glass bezel
    sr = (R0 - inset) * k
    scr = screen.resize((W_ - 2 * inset * k, H_ - 2 * inset * k), Image.LANCZOS).convert("RGBA")
    sm = Image.new("L", scr.size, 0)
    ImageDraw.Draw(sm).rounded_rectangle((0, 0, scr.width - 1, scr.height - 1), sr, fill=255)
    img.paste(scr, (B + inset * k, inset * k), sm)
    # faint diagonal glass sheen over the screen
    sheen = Image.new("L", (2, 2))
    sheen.putdata([22, 0, 0, 0])
    sheen = sheen.resize(scr.size, Image.BILINEAR)
    sheen.paste(0, (0, 0), Image.eval(sm, lambda v: 255 - v))
    img.paste((255, 255, 255, 255), (B + inset * k, inset * k), sheen)
    return img.resize((img.width // k, img.height // k), Image.LANCZOS), R0


phone, PR = make_phone(screen, ph_h)
ph_w = phone.width

right = gradient(PW, H, (255, 214, 170), (240, 140, 70)).convert("RGBA")
shadow = Image.new("RGBA", right.size, (0, 0, 0, 0))
px, py = (PW - ph_w) // 2, TOP
ImageDraw.Draw(shadow).rounded_rectangle((px, py + 14, px + ph_w, py + ph_h + 14), PR, fill=(80, 30, 0, 120))
right.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
right.alpha_composite(phone, (px, py))
label(ImageDraw.Draw(right), 42, 40, H, "Waddle", "Learn web dev five minutes a day, with a duck.", (40, 20, 6), 27)
canvas.alpha_composite(rounded(right, R), (LEFT_W + GAP, 0))

canvas.save("assets/showcase.png", optimize=True)
print("assets/showcase.png", canvas.size)
