"""Receipt rendering + printing for the DIVD idea kiosk.

A receipt is a 1-bit PIL image sent to the Epson TM-T20III over /dev/usb/lp0
via python-escpos. Easter-egg "modes" change how the idea text is rendered;
they are registered in MODES and looked up by the slash command the user types
(e.g. "/comicsans"). The normal style is used when no mode is active.
"""

from __future__ import annotations

import os
import random
import textwrap
from dataclasses import dataclass, field
from io import BytesIO
from typing import Callable

from django.conf import settings
from escpos import printer as escpos_printer
from PIL import Image, ImageDraw, ImageFont

# Printable width in dots. The TM-T20III head is wider than this; 512 keeps a
# safe margin on both sides for any 80mm roll.
PRINT_WIDTH = 512

FONTS = settings.PRINT_FONTS_DIR
DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
DEJAVU_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


# --------------------------------------------------------------------------- #
# Low-level rendering helpers
# --------------------------------------------------------------------------- #
def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def _line_height(f: ImageFont.FreeTypeFont) -> int:
    ascent, descent = f.getmetrics()
    return ascent + descent


def render_text_block(
    text: str,
    f: ImageFont.FreeTypeFont,
    *,
    wrap: int = 0,
    align: str = "left",
    line_spacing: float = 1.15,
    width: int = PRINT_WIDTH,
    pad: int = 8,
) -> Image.Image:
    """Render (optionally wrapped) text into a 1-bit image of the given width."""
    if wrap:
        lines: list[str] = []
        for paragraph in text.split("\n"):
            lines.extend(textwrap.wrap(paragraph, width=wrap) or [""])
    else:
        lines = text.split("\n")

    lh = int(_line_height(f) * line_spacing)
    height = pad * 2 + lh * max(1, len(lines))
    img = Image.new("1", (width, height), 1)
    draw = ImageDraw.Draw(img)

    y = pad
    for line in lines:
        tw = draw.textlength(line, font=f)
        if align == "center":
            x = max(pad, (width - tw) // 2)
        elif align == "right":
            x = max(pad, width - pad - int(tw))
        else:
            x = pad
        draw.text((x, y), line, font=f, fill=0)
        y += lh
    return img


def stack(*images: Image.Image, gap: int = 0, width: int = PRINT_WIDTH) -> Image.Image:
    """Vertically stack images into one receipt image."""
    images = [im for im in images if im is not None]
    total = sum(im.height for im in images) + gap * (len(images) - 1)
    out = Image.new("1", (width, total), 1)
    y = 0
    for im in images:
        out.paste(im, (0, y))
        y += im.height + gap
    return out


def hr(width: int = PRINT_WIDTH, dashed: bool = True) -> Image.Image:
    img = Image.new("1", (width, 18), 1)
    draw = ImageDraw.Draw(img)
    if dashed:
        x = 6
        while x < width - 6:
            draw.line([(x, 9), (x + 8, 9)], fill=0, width=2)
            x += 16
    else:
        draw.line([(6, 9), (width - 6, 9)], fill=0, width=2)
    return img


# --------------------------------------------------------------------------- #
# Mode registry
# --------------------------------------------------------------------------- #
@dataclass
class Mode:
    name: str               # command without slash, e.g. "comicsans"
    label: str              # short label shown in the UI banner
    description: str        # one-line help shown in the slash menu
    render: Callable[[str], Image.Image]
    emoji: str = ""


MODES: dict[str, Mode] = {}


def mode(name, label, description, emoji=""):
    def deco(fn):
        MODES[name] = Mode(name=name, label=label, description=description,
                           render=fn, emoji=emoji)
        return fn
    return deco


# ---- text transforms used by some modes ---------------------------------- #
_LEET = str.maketrans({"a": "4", "A": "4", "e": "3", "E": "3", "i": "1",
                       "I": "1", "o": "0", "O": "0", "t": "7", "T": "7",
                       "s": "5", "S": "5", "l": "1"})

_FLIP = str.maketrans(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_,;.?!()[]{}'\"<>&",
    "ɐqɔpǝɟƃɥıɾʞןwu"
    "odbɹsʇnʌʍxʎz∀ƂƆᗡƎ"
    "ℲפHIſʞ˥WNOԀῸȢS⟘∩"
    "ΛMXʎZ‾'؛˙¿¡)(][}{,„>⌈⅋",
)


# ---- modes ---------------------------------------------------------------- #
@mode("comicsans", "Comic Sans MS", "Print the next idea in glorious Comic Sans", "\U0001F921")
def _comicsans(text):
    return render_text_block(text, font(str(FONTS / "comic.ttf"), 46),
                             wrap=22, line_spacing=1.2)


@mode("big", "BIG", "Make the next idea HUGE", "\U0001F50D")
def _big(text):
    return render_text_block(text.upper(), font(DEJAVU, 90),
                             wrap=9, line_spacing=1.1, align="center")


@mode("tiny", "tiny", "make the next idea teeny tiny", "\U0001F41C")
def _tiny(text):
    return render_text_block(text, font(DEJAVU_REG, 16), wrap=64)


@mode("shout", "SHOUT", "ALL CAPS IMPACT MEME ENERGY", "\U0001F4E2")
def _shout(text):
    return render_text_block(text.upper(), font(str(FONTS / "impact.ttf"), 64),
                             wrap=13, align="center", line_spacing=1.05)


@mode("leet", "l33t", "Tr4n5l4t3 1nt0 31337 5p34k", "\U0001F47E")
def _leet(text):
    return render_text_block(text.translate(_LEET), font(DEJAVU, 44), wrap=18)


@mode("mirror", "mirror", "Print mirrored - read it with a mirror", "\U0001FA9E")
def _mirror(text):
    img = render_text_block(text, font(DEJAVU, 44), wrap=18)
    return img.transpose(Image.FLIP_LEFT_RIGHT)


@mode("upsidedown", "ɐɐsdn", "ʇuıɹd ǝpısdn ʌn", "\U0001F643")
def _upsidedown(text):
    flipped = text.translate(_FLIP)[::-1]
    img = render_text_block(flipped, font(DEJAVU_REG, 44), wrap=18)
    return img.transpose(Image.ROTATE_180)


@mode("redacted", "REDACTED", "[CLASSIFIED] - censor random words", "█")
def _redacted(text):
    f = font(DEJAVU, 40)
    width = PRINT_WIDTH
    img = render_text_block(text, f, wrap=20)
    draw = ImageDraw.Draw(img)
    # Black out ~40% of the words with solid bars.
    lh = int(_line_height(f) * 1.15)
    rng = random.Random()
    x, y, pad = 8, 8, 8
    for line in textwrap.wrap(text, width=20) or [""]:
        cx = x
        for word in line.split(" "):
            w = draw.textlength(word + " ", font=f)
            if rng.random() < 0.4 and word:
                draw.rectangle([cx, y + 2, cx + w - 6, y + lh - 4], fill=0)
            cx += w
        y += lh
    header = render_text_block("// CLASSIFIED //", font(DEJAVU, 30),
                               align="center")
    return stack(header, hr(), img)


@mode("wanted", "WANTED", "Old-west WANTED poster", "\U0001F920")
def _wanted(text):
    top = render_text_block("WANTED", font(str(FONTS / "rye.ttf"), 80),
                            align="center")
    sub = render_text_block("- FOR HAVING GREAT IDEAS -",
                            font(str(FONTS / "rye.ttf"), 24), align="center")
    body = render_text_block(text, font(str(FONTS / "rye.ttf"), 40),
                             wrap=22, align="center")
    return stack(top, sub, hr(dashed=False), body, gap=6)


@mode("spooky", "spooky", "Sp00ky horror lettering", "\U0001F47B")
def _spooky(text):
    return render_text_block(text, font(str(FONTS / "creepster.ttf"), 60),
                             wrap=18, align="center")


@mode("retro", "8-BIT", "Retro 8-bit arcade font", "\U0001F47E")
def _retro(text):
    return render_text_block(text.upper(), font(str(FONTS / "pressstart.ttf"), 22),
                             wrap=22, line_spacing=1.6)


@mode("fancy", "Fancy", "Olde blackletter / gothic script", "\U0001F4DC")
def _fancy(text):
    return render_text_block(text, font(str(FONTS / "unifraktur.ttf"), 56),
                             wrap=20, align="center")


@mode("wingdings", "Wingdings", "Translate to total nonsense symbols", "✂")
def _wingdings(text):
    return render_text_block(text, font(str(FONTS / "wingding.ttf"), 44), wrap=20)


@mode("ascii", "ASCII art", "Render as big ASCII-art letters", "\U0001F523")
def _ascii(text):
    import pyfiglet
    art = pyfiglet.figlet_format(text[:20], font="standard", width=80)
    return render_text_block(art, font(str(FONTS / "cour.ttf"), 14),
                             line_spacing=1.0)


@mode("qr", "QR code", "Encode the idea as a scannable QR code", "▦")
def _qr(text):
    import qrcode
    qr = qrcode.QRCode(border=2, box_size=8,
                       error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(text)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("1")
    # Center the QR on a full-width canvas.
    canvas = Image.new("1", (PRINT_WIDTH, qr_img.height + 16), 1)
    canvas.paste(qr_img, ((PRINT_WIDTH - qr_img.width) // 2, 8))
    caption = render_text_block(text, font(DEJAVU_REG, 22), wrap=34,
                                align="center")
    return stack(canvas, caption, gap=4)


@mode("barcode", "Barcode", "Turn your idea into a Code128 barcode", "‖")
def _barcode(text):
    import barcode
    from barcode.writer import ImageWriter
    code = barcode.get("code128", text[:40], writer=ImageWriter())
    buf = BytesIO()
    code.write(buf, options={"module_height": 14.0, "font_size": 8,
                             "quiet_zone": 2.0, "dpi": 200})
    buf.seek(0)
    bc = Image.open(buf).convert("1")
    if bc.width > PRINT_WIDTH:
        bc = bc.resize((PRINT_WIDTH, int(bc.height * PRINT_WIDTH / bc.width)))
    canvas = Image.new("1", (PRINT_WIDTH, bc.height + 16), 1)
    canvas.paste(bc, ((PRINT_WIDTH - bc.width) // 2, 8))
    return canvas


@mode("glitch", "GL!TCH", "C0rrupt3d... gl1tchy datamosh effect", "⚡")
def _glitch(text):
    img = render_text_block(text, font(DEJAVU, 48), wrap=20).convert("L")
    px = img.load()
    rng = random.Random()
    w, h = img.size
    out = Image.new("L", (w, h), 255)
    op = out.load()
    # Horizontal slice tearing: shift random bands sideways.
    y = 0
    while y < h:
        band = rng.randint(4, 14)
        shift = rng.choice([0, 0, -18, -10, 8, 16, 24])
        for yy in range(y, min(y + band, h)):
            for x in range(w):
                sx = (x - shift) % w
                op[x, yy] = px[sx, yy]
        y += band
    return out.convert("1")


@mode("lacewing", "Lacewing", "Project Lacewing: open, European bug-hunting", "\U0001F41B")
def _lacewing(text):
    """Print the idea wrapped in the Project Lacewing manifesto: DIVD's open,
    European, community answer to closed-model bug hunting. The gaasvlieg hunts
    the plague of vulnerabilities AI surfaces — and disclosure comes first."""
    head = render_text_block("// PROJECT LACEWING //", font(DEJAVU, 30),
                             align="center")
    sub = render_text_block("open . European . responsible",
                            font(DEJAVU_REG, 20), align="center")
    body = render_text_block(text, font(DEJAVU, 44), wrap=18, align="center")
    tag = render_text_block(
        "The internet belongs to everyone.\nSo does its defense.\n"
        "Het internet is van iedereen.\nDe verdediging ook.",
        font(DEJAVU, 26), align="center")
    creds = render_text_block(
        "189 volunteers . 193 cases\n1.4M IPs notified\nget involved: lacewing@divd.nl",
        font(DEJAVU_REG, 20), align="center")
    return stack(head, sub, hr(dashed=False), body, hr(dashed=False),
                 tag, creds, gap=6)


# --------------------------------------------------------------------------- #
# Bonus art — printed on every 4th receipt. Real grayscale cat photos (bundled
# from placecats.com, dithered to 1-bit) plus a couple of ASCII pieces.
# --------------------------------------------------------------------------- #
CATS_DIR = settings.ASSETS_DIR / "cats"

CAT_CAPTIONS = [
    "certified hacker cat", "root@meow:~#", "this cat found a 0day",
    "purr-secure by design", "sudo pet me", "responsible disClawsure",
    "9 lives, 0 days", "the cat is in the shell",
    "runs a local model, no cloud", "this cat disclosed responsibly",
    "open weights, all purrs", "the defense belongs to everyone too",
    "0 EUR/Mtok, 100% purrs", "European, open, non-profit cat",
]

# ASCII fallbacks / variety alongside the photos.
BONUS_ART = [
    ("HACKERMAN", r'''
  .---------------.
  |  > ACCESS _   |
  |  > GRANTED    |
  |   _________   |
  |  |  o   o  |  |
  |  |    >    |  |
  |  |  \___/  |  |
  |   ---------   |
  +---------------+
    [ i am in. ]
'''),
    ("0xDEADBEEF", r'''
      .-=====-.
     /  _   _  \
    |  (o) (o)  |
    |     <     |
    |   \___/   |
     \  IIIII  /
      =-.....-=
   stay  curious
'''),
    ("PROJECT LACEWING", r'''
      \         /
       \       /
     ===<(o)-(o)>===
       /       \
      /  gaas-   \
        vlieg
   finds the bugs,
   fixes them,
   discloses first.
'''),
]


def _cat_files() -> list:
    return sorted(CATS_DIR.glob("*.jpg")) if CATS_DIR.is_dir() else []


def render_cat_photo() -> Image.Image:
    """Load a random bundled cat photo and dither it to 1-bit for the printer."""
    from PIL import ImageOps
    path = random.choice(_cat_files())
    cat = Image.open(path).convert("L")
    cat = ImageOps.autocontrast(cat)
    cat.thumbnail((416, 360))            # fit within width/height, keep aspect
    cat = cat.convert("1")               # Floyd-Steinberg dither
    canvas = Image.new("1", (PRINT_WIDTH, cat.height + 8), 1)
    canvas.paste(cat, ((PRINT_WIDTH - cat.width) // 2, 4))
    cap = render_text_block(random.choice(CAT_CAPTIONS), font(DEJAVU, 22),
                            align="center")
    return stack(canvas, cap, gap=4)


def render_ascii_art() -> Image.Image:
    caption, art = random.choice(BONUS_ART)
    art_img = render_text_block(art.strip("\n"), font(str(FONTS / "cour.ttf"), 20),
                                line_spacing=1.0, align="center")
    cap = render_text_block(caption, font(DEJAVU, 22), align="center")
    return stack(art_img, cap, gap=4)


def render_bonus_art() -> Image.Image:
    """Every 4th receipt: prefer a real cat photo, fall back to ASCII art."""
    star = render_text_block("* * *  every 4th idea wins a prize  * * *",
                             font(DEJAVU_REG, 18), align="center")
    cats = _cat_files()
    # Pool weights the cats heavily when available; ASCII adds variety.
    use_cat = cats and (random.random() < 0.75)
    body = render_cat_photo() if use_cat else render_ascii_art()
    return stack(star, body, gap=4)


# --------------------------------------------------------------------------- #
# Receipt composition
# --------------------------------------------------------------------------- #
def _header(idea_id: int | None) -> Image.Image:
    """The DIVD logo: the rounded-pill wordmark, drawn directly for the 1-bit
    thermal head (no SVG rasterizer or network needed)."""
    w, h = PRINT_WIDTH, 132
    img = Image.new("1", (w, h), 1)
    draw = ImageDraw.Draw(img)
    mx, my = 56, 8
    box = [mx, my, w - mx, h - my]
    radius = (h - 2 * my) // 2
    # the rounded outer ring
    draw.rounded_rectangle(box, radius=radius, outline=0, width=9)
    # the DIVD wordmark, centred
    draw.text((w // 2, h // 2 + 2), "DIVD", font=font(DEJAVU, 84),
              fill=0, anchor="mm")
    return img


def _footer(idea_id: int | None) -> Image.Image:
    # No date/time (the kiosk is offline and its clock is not synced).
    # The idea number doubles as the running idea/print counter.
    num = f"IDEA  No. {idea_id:04d}" if idea_id else "IDEA"
    counter = render_text_block(num, font(DEJAVU, 34), align="center")
    site = render_text_block("divd.nl", font(DEJAVU, 26), align="center")
    return stack(counter, site, gap=4)


def build_receipt(text: str, mode_name: str = "", idea_id: int | None = None) -> Image.Image:
    """Compose the full receipt image for a given idea + optional mode."""
    text = text.strip() or " "
    selected = MODES.get(mode_name)
    if selected:
        body = selected.render(text)
        tag = render_text_block(f"[ mode: {selected.name} ]",
                                font(DEJAVU_REG, 18), align="center")
        body = stack(tag, body, gap=4)
    else:
        body = render_text_block(text, font(DEJAVU, 44), wrap=18)

    # Compact idea receipt: logo, the idea, counter footer. The every-4th bonus
    # cat is printed separately (see build_bonus_receipt / print_idea).
    return stack(_header(idea_id), body, _footer(idea_id), gap=12)


def build_bonus_receipt() -> Image.Image:
    """A standalone bonus receipt (cat photo / ASCII) printed after every 4th idea."""
    site = render_text_block("divd.nl", font(DEJAVU, 24), align="center")
    return stack(render_bonus_art(), site, gap=12)


# --------------------------------------------------------------------------- #
# Printer I/O
# --------------------------------------------------------------------------- #
def print_image(img: Image.Image) -> tuple[bool, str | None]:
    """Send a composed receipt image to the thermal printer and cut."""
    try:
        # TM-T20III shares the TM-T20II ESC/POS profile; setting it silences the
        # media-width warning and gives correct centering metrics.
        dev = escpos_printer.File(settings.PRINTER_DEVICE, profile="TM-T20II")
        dev.image(img)
        dev.cut()
        dev.close()
        return True, None
    except Exception as exc:  # noqa: BLE001 - surface any printer error
        return False, str(exc)


STATIC_IMG = settings.BASE_DIR / "static" / "img"

# On-screen easter-egg images that can also be sent to the thermal printer.
_NAMED_IMAGES = {
    "cat": ("cat.jpg", "// certified DIVD cat"),
    "hackerman": ("hackerman.jpg", "H A C K E R M A N"),
}


def render_photo(path, caption: str = "") -> Image.Image:
    """Dither a photo to 1-bit, centre it on the roll, with an optional caption."""
    from PIL import ImageOps
    im = Image.open(path).convert("L")
    im = ImageOps.autocontrast(im)
    im.thumbnail((440, 400))             # fit width/height, keep aspect
    im = im.convert("1")                 # Floyd-Steinberg dither
    canvas = Image.new("1", (PRINT_WIDTH, im.height + 8), 1)
    canvas.paste(im, ((PRINT_WIDTH - im.width) // 2, 4))
    if caption:
        cap = render_text_block(caption, font(DEJAVU, 26), align="center")
        return stack(canvas, cap, gap=4)
    return canvas


def print_named_image(which: str) -> tuple[bool, str | None]:
    """Print one of the named easter-egg images (/cat, /hackerman) on a receipt."""
    spec = _NAMED_IMAGES.get((which or "").strip().lower())
    if not spec:
        return False, "unknown image"
    path = STATIC_IMG / spec[0]
    if not path.exists():
        return False, "image not found"
    try:
        return print_image(render_photo(path, spec[1]))
    except Exception as exc:  # noqa: BLE001 - surface any render/printer error
        return False, str(exc)


def print_idea(text: str, mode_name: str = "", idea_id: int | None = None):
    """Render + print one idea. Returns (success, error).

    Every 4th idea also spits out a separate bonus cat/hackerman receipt.
    """
    ok, err = print_image(build_receipt(text, mode_name, idea_id))
    if ok and idea_id and idea_id % 4 == 0:
        try:
            print_image(build_bonus_receipt())  # separate receipt + cut
        except Exception:  # noqa: BLE001 - bonus is best-effort, never fails the idea
            pass
    return ok, err


def list_modes() -> list[dict]:
    """Modes serialized for the frontend slash menu."""
    return [
        {"name": m.name, "label": m.label, "description": m.description,
         "emoji": m.emoji}
        for m in MODES.values()
    ]
