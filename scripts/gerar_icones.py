"""Gera imagens PROVISÓRIAS do floco e do ícone (substitua pelas suas em assets/)."""
import math, sys
from PIL import Image, ImageDraw, ImageFilter

S = 1024
CIANO = (0, 229, 255)

def floco(tam=S):
    img = Image.new('RGBA', (tam, tam), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = tam / 2
    w = max(2, int(tam * 0.022))
    R = tam * 0.40
    for k in range(6):
        a = math.radians(k * 60 - 90)
        x2, y2 = c + math.cos(a) * R, c + math.sin(a) * R
        d.line([(c, c), (x2, y2)], fill=CIANO + (255,), width=w)
        for frac, comp in ((0.45, 0.16), (0.72, 0.12)):
            bx, by = c + math.cos(a) * R * frac, c + math.sin(a) * R * frac
            for s in (-1, 1):
                b = a + s * math.radians(50)
                d.line([(bx, by), (bx + math.cos(b) * tam * comp, by + math.sin(b) * tam * comp)], fill=CIANO + (255,), width=int(w * 0.8))
        r = tam * 0.025
        d.ellipse([x2 - r, y2 - r, x2 + r, y2 + r], fill=(200, 250, 255, 255))
    hexr = tam * 0.11
    pts = [(c + math.cos(math.radians(60 * i)) * hexr, c + math.sin(math.radians(60 * i)) * hexr) for i in range(6)]
    d.polygon(pts, outline=(220, 252, 255, 255), fill=(0, 60, 90, 255), width=w)
    r = tam * 0.04
    d.ellipse([c - r, c - r, c + r, c + r], fill=(230, 255, 255, 255))
    glow = img.filter(ImageFilter.GaussianBlur(tam * 0.02))
    out = Image.alpha_composite(glow, img)
    return out

def icone(tam):
    base = Image.new('RGBA', (tam, tam), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    pts = [(tam / 2 + math.cos(math.radians(60 * i + 30)) * tam * 0.49, tam / 2 + math.sin(math.radians(60 * i + 30)) * tam * 0.49) for i in range(6)]
    d.polygon(pts, fill=(3, 18, 34, 255), outline=CIANO + (255,), width=max(1, tam // 24))
    f = floco(tam * 4).resize((int(tam * 0.86), int(tam * 0.86)), Image.LANCZOS)
    base.alpha_composite(f, (int(tam * 0.07), int(tam * 0.07)))
    return base

dest = sys.argv[1] if len(sys.argv) > 1 else 'assets'
floco().resize((512, 512), Image.LANCZOS).save(f'{dest}/ARTY_floco.png')
ic = icone(256)
ic.save(f'{dest}/ARTY.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icone(32).save(f'{dest}/tray.png')
ic.save(f'{dest}/icon.png')
print('ok')
