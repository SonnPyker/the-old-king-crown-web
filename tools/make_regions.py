# Slices assets/map.webp into one backdrop per Region (used by the UI).
from PIL import Image
import os
im = Image.open('assets/map.webp').convert('RGB')
W, H = im.size
cuts = [0, 378, 750, H]
os.makedirs('assets/regions', exist_ok=True)
for i in range(3):
    c = im.crop((0, cuts[i], W, cuts[i + 1]))
    c.save(f'assets/regions/region_{i}.webp', quality=82, method=6)
    print(i, c.size)
