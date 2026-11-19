# Builds three equal-height showcase cards (separate images so each links to its own project).
# They sit side by side in one row with no float: the 16px gap is baked into the first two images
# (536 = 520 card + 16 transparent), so at any width the row is 536+536+520 px scaled and heights match.
# Run: python3 scripts/make_showcase.py
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import textwrap

SHOTS = "/home/yousefmsm1/Desktop/mostqel/screenshots/raw"
WADDLE_FRAME = "/tmp/waddle_frame.png"  # ffmpeg -ss 12 -i waddle_showcase_16x9.mp4 -frames:v 1 /tmp/waddle_frame.png
H, GAP, R, CW = 900, 16, 22, 520  # card height, gap, corner radius, card width


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


def panel(top, bottom, shot, title, desc, ink):
    """Tall card: label on top, desktop screenshot peeking in from the lower left and bleeding off the right edge."""
    bg = gradient(CW, H, top, bottom).convert("RGBA")
    sh = 560
    s = rounded(shot.convert("RGB").resize((round(shot.width * sh / shot.height), sh), Image.LANCZOS), 14)
    x, y = 42, H - sh - 60
    shadow = Image.new("RGBA", (CW, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 12, x + s.width, y + sh + 12), 14, fill=(0, 0, 0, 150))
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(20)))
    bg.alpha_composite(s, (x, y))
    label(ImageDraw.Draw(bg), 42, 40, H, title, desc, ink, 27)
    return rounded(bg, R)


def with_gap(card):
    out = Image.new("RGBA", (card.width + GAP, card.height), (0, 0, 0, 0))
    out.alpha_composite(card)
    return out


TF = ImageFont.truetype("assets/fonts/Geist-SemiBold.ttf", 42)
BF = ImageFont.truetype("assets/fonts/Geist-Regular.ttf", 22)


def label(d, x, y, h, title, desc, ink, wrap):
    """Title + wrapped description; vertically centred in h when y is None."""
    body = "\n".join(textwrap.wrap(desc, wrap))
    th = 42 + 18 + d.multiline_textbbox((0, 0), body, font=BF, spacing=8)[3]
    y = (h - th) // 2 if y is None else y
    d.text((x, y), title, font=TF, fill=ink)
    d.multiline_text((x, y + 60), body, font=BF, fill=ink + (190,), spacing=8)


swrmz = Image.open(f"{SHOTS}/swrmz_app.jpg")
icpc = Image.open(f"{SHOTS}/icpchue_dashboard.jpg")
with_gap(panel((120, 18, 28), (20, 6, 10), swrmz, "SWRMZ", "A swarm of AI agents that hunts the holes in your stack.", (255, 255, 255))).save("assets/showcase-swrmz.png", optimize=True)
with_gap(panel((250, 196, 40), (232, 110, 20), icpc, "ICPCHUE", "Training platform and online judge for competitive programmers.", (20, 14, 6))).save("assets/showcase-icpchue.png", optimize=True)

# phone: the screen as rendered in the waddle video (with its notch), wrapped in a dark bezel
screen = Image.open(WADDLE_FRAME).convert("RGB").crop((1182, 62, 1620, 1015))
PW, TOP = CW, 180
ph_h = H - TOP - 30
PR = 52
ph_w = round(screen.width * (ph_h - 24) / screen.height) + 24
phone = Image.new("RGBA", (ph_w, ph_h), (0, 0, 0, 0))
phone.paste((18, 18, 20, 255), (0, 0), rr_mask((ph_w, ph_h), PR))
phone.alpha_composite(rounded(screen.resize((ph_w - 24, ph_h - 24), Image.LANCZOS), 40), (12, 12))
right = gradient(PW, H, (255, 214, 170), (240, 140, 70)).convert("RGBA")
shadow = Image.new("RGBA", right.size, (0, 0, 0, 0))
px, py = (PW - ph_w) // 2, TOP
ImageDraw.Draw(shadow).rounded_rectangle((px, py + 14, px + ph_w, py + ph_h + 14), PR, fill=(80, 30, 0, 120))
right.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
right.alpha_composite(phone, (px, py))
label(ImageDraw.Draw(right), 42, 40, H, "Waddle", "Learn web dev five minutes a day, with a duck.", (40, 20, 6), 27)
rounded(right, R).save("assets/showcase-waddle.png", optimize=True)

print("assets/showcase-{swrmz,icpchue,waddle}.png")
