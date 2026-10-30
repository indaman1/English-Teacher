#!/usr/bin/env python3
"""Regenerates the PWA icons in public/icons (same mark as public/favicon.svg). No dependencies: pure Python.
Run: npm run icons"""
import os, struct, zlib

C0, C1 = (0x63, 0x66, 0xF1), (0x43, 0x38, 0xCA)  # gradient start / end
BARS = [(18, 26, 4, 12), (26, 18, 4, 28), (34, 22, 4, 20), (42, 28, 4, 8)]  # x, y, w, h in a 64-unit grid, rx = 2

def in_round_rect(x, y, rx0, ry0, w, h, r):
    if x < rx0 or x > rx0 + w or y < ry0 or y > ry0 + h:
        return False
    cx = min(max(x, rx0 + r), rx0 + w - r)
    cy = min(max(y, ry0 + r), ry0 + h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def render(n, corner, scale, offset):
    """corner: rounded-corner radius in 64-units (0 = full bleed); scale/offset place the bars."""
    ss = 3
    rows = []
    for py in range(n):
        row = bytearray()
        for px in range(n):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) * 64 / n
                    y = (py + (sy + 0.5) / ss) * 64 / n
                    if corner and not in_round_rect(x, y, 0, 0, 64, 64, corner):
                        continue
                    t = (x + y) / 128
                    col = tuple(C0[i] + (C1[i] - C0[i]) * t for i in range(3))
                    bx, by = (x - offset) / scale, (y - offset) / scale
                    if any(in_round_rect(bx, by, *bar[:2], bar[2], bar[3], 2) for bar in BARS):
                        col = (255, 255, 255)
                    r += col[0]; g += col[1]; b += col[2]; a += 255
            k = ss * ss
            row += bytes((round(r / k), round(g / k), round(b / k), round(a / k)))  # premultiplied average; fine at this scale
        rows.append(bytes([0]) + bytes(row))
    return rows

def fix_alpha(rows, n):
    """The averages above were summed over covered samples only, so un-premultiply colour by coverage."""
    out = []
    for row in rows:
        px = bytearray(row[1:])
        for i in range(0, len(px), 4):
            a = px[i + 3]
            if 0 < a < 255:
                f = 255 / a
                px[i] = min(255, round(px[i] * f)); px[i + 1] = min(255, round(px[i + 1] * f)); px[i + 2] = min(255, round(px[i + 2] * f))
        out.append(bytes([0]) + bytes(px))
    return out

def png(n, rows):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b''.join(rows)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

JOBS = [
    ('icon-192.png', 192, 14, 1.1, -3.2),            # "any": rounded square, mark slightly enlarged
    ('icon-512.png', 512, 14, 1.1, -3.2),
    ('icon-maskable-512.png', 512, 0, 0.85, 4.8),    # full bleed, mark inside the 80% safe zone
    ('apple-touch-icon.png', 180, 0, 1.0, 0),        # iOS rounds the corners itself
]

if __name__ == '__main__':
    os.makedirs('public/icons', exist_ok=True)
    for name, n, corner, scale, offset in JOBS:
        rows = fix_alpha(render(n, corner, scale, offset), n)
        with open(f'public/icons/{name}', 'wb') as f:
            f.write(png(n, rows))
        print('wrote', name)
