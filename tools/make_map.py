# Crops the Map window out of the big board image (assets/board.webp) -> assets/map.webp
from PIL import Image
im = Image.open('assets/board.webp').convert('RGB')
crop = im.crop((740, 850, 2200, 2640))
w = 900
crop = crop.resize((w, round(crop.height * w / crop.width)), Image.LANCZOS)
crop.save('assets/map.webp', quality=82, method=6)
print(crop.size)
# top strip (round / order tracks) is not used; keep a darker texture for page background
bg = im.crop((0, 700, 700, 2900)).resize((350, 1100), Image.LANCZOS)
bg.save('assets/bg_wood.webp', quality=60)
