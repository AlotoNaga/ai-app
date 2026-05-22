"""Generate placeholder assets for the Nagaland Me app.

Creates real PNGs at the sizes Apple/Google require so EAS build doesn't fail.
Replace with proper artwork before public release.

  icon.png             1024x1024  (App Store icon, no transparency)
  adaptive-icon.png    1024x1024  (Android foreground, transparent edges)
  splash.png           1242x2436  (splash, content-safe centered)
  favicon.png            48x48    (web favicon)
  notification-icon.png  96x96    (Android monochrome notification)
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(OUT, exist_ok=True)

BG = (15, 36, 25)        # #0F2419
BRAND = (16, 185, 129)   # #10B981
WHITE = (255, 255, 255)


def _font(px: int):
    # Try a few common fonts; fall back to default if none install.
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, px)
    return ImageFont.load_default()


def _centered_text(draw, size, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((size[0] - tw) / 2 - bbox[0], (size[1] - th) / 2 - bbox[1]),
        text, font=font, fill=fill,
    )


def make_icon():
    """Solid-background app store icon. 1024x1024."""
    s = 1024
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    # rounded brand square in the middle
    pad = 180
    d.rounded_rectangle((pad, pad, s - pad, s - pad), radius=180, fill=BRAND)
    _centered_text(d, (s, s), "NM", _font(360), WHITE)
    img.save(os.path.join(OUT, "icon.png"), "PNG")


def make_adaptive():
    """Android foreground layer — transparent canvas, content in safe area."""
    s = 1024
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # safe-area inset ~33% so foreground survives circle/squircle masks
    pad = 260
    d.rounded_rectangle((pad, pad, s - pad, s - pad), radius=120, fill=BRAND)
    _centered_text(d, (s, s), "NM", _font(220), WHITE)
    img.save(os.path.join(OUT, "adaptive-icon.png"), "PNG")


def make_splash():
    """Centered logotype on brand background. 1242x2436 covers iPhone X+."""
    w, h = 1242, 2436
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)
    box = 360
    d.rounded_rectangle(
        ((w - box) / 2, (h - box) / 2 - 80, (w + box) / 2, (h + box) / 2 - 80),
        radius=80, fill=BRAND,
    )
    f = _font(180)
    bbox = d.textbbox((0, 0), "NM", font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((w - tw) / 2 - bbox[0], (h - th) / 2 - 80 - bbox[1]), "NM", font=f, fill=WHITE)
    cap_font = _font(56)
    cap = "Nagaland Me"
    cb = d.textbbox((0, 0), cap, font=cap_font)
    cw = cb[2] - cb[0]
    d.text(((w - cw) / 2 - cb[0], (h + box) / 2 - 80 + 60), cap, font=cap_font, fill=WHITE)
    img.save(os.path.join(OUT, "splash.png"), "PNG")


def make_favicon():
    s = 48
    img = Image.new("RGB", (s, s), BRAND)
    d = ImageDraw.Draw(img)
    _centered_text(d, (s, s), "N", _font(30), WHITE)
    img.save(os.path.join(OUT, "favicon.png"), "PNG")


def make_notification_icon():
    """Android requires a monochrome white silhouette on transparent bg."""
    s = 96
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # simple bell-ish shape using a rounded rectangle + dot
    d.rounded_rectangle((22, 18, 74, 64), radius=14, outline=WHITE, width=6)
    d.ellipse((42, 68, 54, 80), fill=WHITE)
    img.save(os.path.join(OUT, "notification-icon.png"), "PNG")


if __name__ == "__main__":
    make_icon()
    make_adaptive()
    make_splash()
    make_favicon()
    make_notification_icon()
    print("Wrote:", sorted(os.listdir(OUT)))
