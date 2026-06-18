#!/usr/bin/env python3
"""
Split LoveIs sticker sheet into individual PNG files.
Usage: python3 split_stickers.py <path-to-image.png> [cols] [rows]
Default grid: 4 columns x 4 rows = 16 stickers.
Output: stickers/sticker-01.png … sticker-16.png
"""
import sys, os
from pathlib import Path

def split_stickers(input_path, cols=4, rows=4, output_dir='stickers'):
    try:
        from PIL import Image
    except ImportError:
        print("ERROR: Pillow not installed. Run: pip install Pillow")
        sys.exit(1)

    Path(output_dir).mkdir(exist_ok=True)
    img = Image.open(input_path).convert('RGBA')
    w, h = img.size
    cw, ch = w // cols, h // rows

    saved = 0
    for row in range(rows):
        for col in range(cols):
            n = row * cols + col + 1
            box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
            tile = img.crop(box)

            # Auto-trim transparent/white margins
            if tile.mode == 'RGBA':
                bbox = tile.getbbox()
                if bbox:
                    pad = 4
                    bx0 = max(0, bbox[0] - pad)
                    by0 = max(0, bbox[1] - pad)
                    bx1 = min(tile.width,  bbox[2] + pad)
                    by1 = min(tile.height, bbox[3] + pad)
                    tile = tile.crop((bx0, by0, bx1, by1))

            out = os.path.join(output_dir, f'sticker-{n:02d}.png')
            tile.save(out, 'PNG', optimize=True)
            print(f'  ✓ {out}  ({tile.size[0]}×{tile.size[1]})')
            saved += 1

    print(f'\n✓ Сохранено {saved} стикеров → /{output_dir}/')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    inp  = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    rows = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    split_stickers(inp, cols, rows)
