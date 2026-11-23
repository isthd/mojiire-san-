# プリントを机の上で撮った写真風にする（ななめ・余白・明暗）
from PIL import Image, ImageFilter, ImageDraw
import random, math
random.seed(3)
src = Image.open('worksheet.png').convert('RGB')
W, H = 1600, 2000
bg = Image.new('RGB', (W, H))
d = ImageDraw.Draw(bg)
for y in range(H):  # 木目っぽい机
    v = 150 + int(18*math.sin(y/37.0) + 10*math.sin(y/7.3))
    d.line([(0,y),(W,y)], fill=(v, int(v*0.72), int(v*0.48)))
bg = bg.filter(ImageFilter.GaussianBlur(1.2))
# 透視変換：紙の四隅の位置
dst = [(205,170),(1395,235),(1440,1830),(150,1770)]
w, h = src.size
def coeffs(pa, pb):
    import numpy as np
    m = []
    for (x,y),(X,Y) in zip(pa,pb):
        m.append([x,y,1,0,0,0,-X*x,-X*y]); m.append([0,0,0,x,y,1,-Y*x,-Y*y])
    A = np.array(m, float); B = np.array(pb, float).reshape(8)
    return np.linalg.solve(A, B).tolist()
c = coeffs(dst, [(0,0),(w,0),(w,h),(0,h)])
paper = src.transform((W,H), Image.PERSPECTIVE, c, Image.BICUBIC)
mask = Image.new('L', (W,H), 0); ImageDraw.Draw(mask).polygon(dst, fill=255)
shadow = Image.new('L', (W,H), 0); ImageDraw.Draw(shadow).polygon([(x+18,y+22) for x,y in dst], fill=120)
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
bg.paste((40,28,18), (0,0), shadow)
bg.paste(paper, (0,0), mask)
# 明るさのむら
g = Image.new('L', (W,H)); gd = ImageDraw.Draw(g)
for y in range(H): gd.line([(0,y),(W,y)], fill=int(40*y/H))
bg = Image.composite(Image.new('RGB',(W,H),(0,0,0)), bg, g)
bg.save('photo.jpg', quality=90)
