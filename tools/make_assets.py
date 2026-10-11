"""Export web-sized WebP assets from the Tabletop Simulator cache dump.

Usage:  python tools/make_assets.py <RAW_DIR> [OUT_DIR]
RAW_DIR contains files named  <guid>_<name>_deck<id>_face|back.(png|jpg)  (see README).
"""
import os, sys, glob
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

RAW = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

def find(prefix):
    r = glob.glob(os.path.join(RAW, prefix + '*'))
    if not r:
        raise FileNotFoundError(prefix)
    return r[0]

def save(im, rel, width=None, q=82, alpha=False):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im = im.convert('RGBA' if alpha else 'RGB')
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(p, 'WEBP', quality=q, method=6)
    return os.path.getsize(p)

def sheet(prefix, cols, rows, name, n, width, q=82, alpha=False):
    im = Image.open(find(prefix)).convert('RGBA')
    cw, ch = im.width // cols, im.height // rows
    tot = 0
    for i in range(n):
        c, r = i % cols, i // cols
        tot += save(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)), f'{name}_{i:02d}.webp', width, q, alpha)
    print(name, n, 'cards', tot // 1024, 'KB')

tot = save(Image.open(find('7ae621_Game_Board_img')), 'board.webp', 3000, 80)
print('board', tot // 1024, 'KB')

# faction sheets (5 cols x 4 rows, 827x1417)
sheet('316f93_Deck_deck1740_face', 5, 4, 'cards/nobility', 18, 520, 84, True)
sheet('e5637d_Deck_deck1743_face', 5, 4, 'cards/uprising', 17, 520, 84, True)
sheet('7d1a14_Deck_deck1744_face', 5, 4, 'cards/clans', 17, 520, 84, True)
sheet('bb0b00_Deck_deck1774_face', 5, 4, 'cards/gathering', 18, 520, 84, True)
# kingdom (9x6), wild kingdom (4x4)
sheet('7490e2_Deck_deck1750_face', 9, 6, 'kingdom/kc', 51, 560, 82, True)
sheet('20134f_Deck_deck1757_face', 4, 4, 'kingdom/wk', 16, 560, 82, True)

# card backs
for fac, pre in [('nobility', '316f93_Deck_deck1740_back'), ('uprising', 'e5637d_Deck_deck1743_back'),
                 ('clans', '7d1a14_Deck_deck1744_back'), ('gathering', 'bb0b00_Deck_deck1774_back'),
                 ('kingdom', '7490e2_Deck_deck1750_back')]:
    save(Image.open(find(pre)), f'cards/back_{fac}.webp', 360, 82)

# HQ cards (landscape)
for key, name in [('a42c8a', 'royal_bank'), ('b23b92', 'moonshine_cove'), ('a3fed9', 'the_syndicate'),
                  ('939775', 'new_havens_harbour'), ('32c0df', 'wandering_embassy'), ('197ffa', 'door_in_the_night')]:
    save(Image.open(find(key + '_') if False else glob.glob(os.path.join(RAW, key + '_*_face.*'))[0]), f'hq/{name}.webp', 720, 84)

# tactics: faces + exhausted backs
tac = {
 'clans': [('052dc5', 'school_of_the_storms'), ('212201', 'salt_toughness'), ('1764d8', 'river_runners'), ('bffac3', 'sea_lanes')],
 'gathering': [('2c0db4', 'school_of_the_stars'), ('abe3fe', 'out_beyond_the_lights'), ('c53571', 'moonlit_foragers'), ('517215', 'ritual_sacrifice')],
 'uprising': [('6390f8', 'school_of_the_streets'), ('241c05', 'false_orders'), ('02352a', 'night_raids'), ('d704a7', 'safehouses')],
 'nobility': [('0e5cff', 'school_of_the_stones'), ('ca1dd9', 'royal_seal'), ('f51ec7', 'witch_trial'), ('a5daa4', 'martial_law')],
}
for fac, lst in tac.items():
    for i, (key, name) in enumerate(lst):
        save(Image.open(glob.glob(os.path.join(RAW, key + '_*_face.*'))[0]), f'tactics/{name}.webp', 560, 84)
        if i == 0:
            save(Image.open(glob.glob(os.path.join(RAW, key + '_*_back.*'))[0]), f'tactics/back_{fac}.webp', 560, 84)

# player boards, sites of power, reference
for key, name in [('99d43a', 'nobility'), ('4e54c8', 'uprising'), ('ba161b', 'clans'), ('20404b', 'gathering')]:
    save(Image.open(glob.glob(os.path.join(RAW, key + '_*_face.*'))[0]), f'boards/{name}.webp', 1800, 84)
for key, name in [('2418a9', 'gathering'), ('71e0f5', 'nobility'), ('fdf927', 'clans'), ('5fef0a', 'uprising')]:
    save(Image.open(glob.glob(os.path.join(RAW, key + '_*_face.*'))[0]), f'sop/{name}.webp', 700, 82)
for key, name in [('388517', 'ref_actions'), ('7bf27a', 'ref_sequence')]:
    save(Image.open(glob.glob(os.path.join(RAW, key + '_*_face.*'))[0]), f'ref/{name}.webp', 1500, 84)
save(Image.open(find('bf27b8_Custom_Token_img')), 'councils.webp', 1800, 86)

# tokens (alpha)
def tok(key, name, w=256):
    save(Image.open(find(key)), f'tokens/{name}.webp', w, 90, True)
tok('8e6a78', 'inf1'); tok('f73d70', 'inf5'); tok('2e42a0_Custom_Token_Stack', 'lore')
tok('e405c4_Clash_Marker_1_img.png', 'clash1', 200); tok('e405c4_Clash_Marker_1_img2', 'clash_done', 200)
tok('4023d2_Clash_Marker_2_img.png', 'clash2', 200); tok('c31716_Clash_Marker_3_img.png', 'clash3', 200)
tok('94b6dd', 'favour', 256); tok('f901f5', 'active', 200); tok('1b71d3', 'round', 200); tok('f5e06d', 'season', 200)
tok('ee5479', 'emblem_nobility', 200); tok('469459', 'emblem_uprising', 200); tok('d61da4', 'emblem_gathering', 200)
# clans emblem from hand-size disc: crop to center
im = Image.open(find('3355c6')).convert('RGBA')
c = im.crop((90, 90, 410, 410)); save(c, 'tokens/emblem_clans.webp', 200, 90, True)
for key, fac in [('3e1e49', 'nobility'), ('418e4f', 'clans'), ('82b5bb', 'gathering'), ('c83358', 'uprising')]:
    tok(key, f'marker_{fac}', 160)
for key, fac in [('fe0382', 'nobility'), ('3355c6', 'clans'), ('587334', 'gathering'), ('0896e3', 'uprising')]:
    tok(key, f'hand_{fac}', 200)
print('done')
