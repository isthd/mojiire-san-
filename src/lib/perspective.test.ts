import { describe, expect, it } from 'vitest';
import { detectPaper } from './paperDetect';
import {
  applyMat,
  axisAlignedRect,
  fullQuad,
  invertMat,
  isValidQuad,
  makeForwardMap,
  outputSize,
  rotatePoint,
  squareToQuad,
  warpPixels,
  type Quad,
} from './perspective';

const quad: Quad = [
  { x: 10, y: 20 },
  { x: 210, y: 5 },
  { x: 230, y: 300 },
  { x: 0, y: 280 },
];

describe('射影変換', () => {
  it('単位正方形の四隅が四角形の四隅に移る', () => {
    const m = squareToQuad(quad);
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    corners.forEach(([u, v], i) => {
      const p = applyMat(m, u, v);
      expect(p.x).toBeCloseTo(quad[i].x, 6);
      expect(p.y).toBeCloseTo(quad[i].y, 6);
    });
  });

  it('逆行列で元に戻る', () => {
    const m = squareToQuad(quad);
    const inv = invertMat(m);
    const p = applyMat(m, 0.3, 0.7);
    const back = applyMat(inv, p.x, p.y);
    expect(back.x).toBeCloseTo(0.3, 6);
    expect(back.y).toBeCloseTo(0.7, 6);
  });

  it('平行四辺形（g=h=0 の場合）も扱える', () => {
    const para: Quad = [
      { x: 0, y: 0 },
      { x: 100, y: 10 },
      { x: 120, y: 110 },
      { x: 20, y: 100 },
    ];
    const p = applyMat(squareToQuad(para), 1, 1);
    expect(p.x).toBeCloseTo(120);
    expect(p.y).toBeCloseTo(110);
  });

  it('出力サイズは辺の長さの平均、上限を超えたら縮小', () => {
    expect(outputSize(fullQuad(400, 300))).toEqual({ width: 400, height: 300 });
    const s = outputSize(fullQuad(4000, 4000), 4_000_000);
    expect(s.width * s.height).toBeLessThanOrEqual(4_000_000);
    expect(s.width).toBe(2000);
  });

  it('四角形の向き・ねじれを判定する', () => {
    expect(isValidQuad(quad)).toBe(true);
    expect(isValidQuad([quad[0], quad[2], quad[1], quad[3]])).toBe(false);
    expect(isValidQuad([quad[3], quad[2], quad[1], quad[0]])).toBe(false);
  });

  it('傾いていない長方形はただの切り抜きとして扱う', () => {
    expect(axisAlignedRect(fullQuad(100, 50))).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(axisAlignedRect(quad)).toBeNull();
  });
});

describe('90°回転', () => {
  it('時計回りに回した位置', () => {
    // 幅 100・高さ 50 の画像の左上は、右に回すと右上へ
    expect(rotatePoint({ x: 0, y: 0 }, 1, 100, 50)).toEqual({ x: 50, y: 0 });
    expect(rotatePoint({ x: 100, y: 50 }, 2, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(rotatePoint({ x: 0, y: 0 }, 3, 100, 50)).toEqual({ x: 0, y: 100 });
    expect(rotatePoint({ x: 7, y: 9 }, 4, 100, 50)).toEqual({ x: 7, y: 9 });
  });

  it('書き込みの位置：回転＋切り抜きを合成', () => {
    // 100×50 を右に回すと 50×100。その (10,20)-(40,80) を切り抜く
    const crop: Quad = [
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 80 },
      { x: 10, y: 80 },
    ];
    const map = makeForwardMap(100, 50, 1, crop, { width: 30, height: 60 });
    // 元画像の (20, 40) → 回転後 (10, 20) → 切り抜き後 (0, 0)
    const p = map({ x: 20, y: 40 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });
});

describe('画素の引き伸ばし', () => {
  it('全体を指定すると元と同じ画像になる', async () => {
    const w = 4;
    const h = 3;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([i * 10, 255 - i * 10, i, 255], i * 4);
    const out = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    await warpPixels({ data, width: w, height: h }, fullQuad(w, h), out);
    expect(Array.from(out.data)).toEqual(Array.from(data));
  });
});

describe('紙の検出', () => {
  it('暗い背景の上の明るい傾いた四角形を見つける', () => {
    const w = 100;
    const h = 80;
    const gray = new Uint8Array(w * h).fill(40);
    const paper: Quad = [
      { x: 20, y: 12 },
      { x: 85, y: 18 },
      { x: 80, y: 72 },
      { x: 14, y: 66 },
    ];
    const m = invertMat(squareToQuad(paper));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = applyMat(m, x + 0.5, y + 0.5);
        if (u.x >= 0 && u.x <= 1 && u.y >= 0 && u.y <= 1) gray[y * w + x] = 230;
      }
    // 紙の上の文字（暗い点）があっても大丈夫
    for (let x = 30; x < 60; x += 3) gray[40 * w + x] = 20;
    const q = detectPaper(gray, w, h);
    expect(q).not.toBeNull();
    q!.forEach((p, i) => {
      expect(Math.abs(p.x - paper[i].x)).toBeLessThan(2.5);
      expect(Math.abs(p.y - paper[i].y)).toBeLessThan(2.5);
    });
  });

  it('紙らしいものがなければ null', () => {
    const w = 50;
    const h = 50;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) gray[i] = (i * 37) % 256;
    expect(detectPaper(gray, w, h)).toBeNull();
  });
});
