from PIL import Image, ImageDraw

INK = (31, 41, 51, 255)      # #1F2933
AMBER = (217, 130, 43, 255)  # #D9822B
PAPER = (236, 239, 242, 255) # #ECEFF2

def make_icon(size, path, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(size * 0.14) if maskable else 0
    d.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=int(size * 0.18),
        fill=INK,
    )

    # Clipboard "clip" tab at top
    clip_w = int(size * 0.32)
    clip_h = int(size * 0.10)
    clip_x = (size - clip_w) // 2
    clip_y = pad + int(size * 0.02)
    d.rounded_rectangle(
        [clip_x, clip_y, clip_x + clip_w, clip_y + clip_h],
        radius=int(size * 0.03),
        fill=AMBER,
    )

    # Checklist lines (paper strokes) representing inspection form
    line_x1 = int(size * 0.30) + (pad // 2)
    line_x2 = int(size * 0.70) - (pad // 2)
    line_w = max(2, int(size * 0.035))
    ys = [int(size * 0.42), int(size * 0.56), int(size * 0.70)]
    widths = [1.0, 1.0, 0.55]
    for y, wmul in zip(ys, widths):
        x2 = line_x1 + int((line_x2 - line_x1) * wmul)
        d.line([(line_x1, y), (x2, y)], fill=PAPER, width=line_w)

    # Small checkmark box before first line
    box = int(size * 0.045)
    bx, by = line_x1 - int(size * 0.09), ys[0] - box
    d.rectangle([bx, by, bx + box * 2, by + box * 2], outline=PAPER, width=max(2, int(size*0.018)))

    img.save(path)

make_icon(192, "icons/icon-192.png")
make_icon(512, "icons/icon-512.png")
make_icon(512, "icons/icon-maskable-512.png", maskable=True)
print("done")
