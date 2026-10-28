import { describe, expect, it } from 'vitest';
import { detectAnswerFields, type GrayImage } from './answerFields';

function blank(width: number, height: number): GrayImage {
  return { width, height, data: new Uint8Array(width * height).fill(250) };
}

function fill(img: GrayImage, x: number, y: number, w: number, h: number, v = 20) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.data[yy * img.width + xx] = v;
}

function box(img: GrayImage, x: number, y: number, w: number, h: number, t = 2) {
  fill(img, x, y, w, t);
  fill(img, x, y + h - t, w, t);
  fill(img, x, y, t, h);
  fill(img, x + w - t, y, t, h);
}

describe('detectAnswerFields', () => {
  it('空の囲み欄を検出し、文字の入った欄は除外する', () => {
    const img = blank(800, 600);
    box(img, 100, 100, 200, 60);
    box(img, 400, 100, 200, 60);
    fill(img, 420, 115, 160, 30); // 文字で埋まった欄
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(1);
    const f = fields[0];
    expect(f.kind).toBe('box');
    expect(f.vertical).toBe(false);
    expect(Math.abs(f.x - 102)).toBeLessThanOrEqual(3);
    expect(Math.abs(f.y - 102)).toBeLessThanOrEqual(3);
    expect(Math.abs(f.width - 196)).toBeLessThanOrEqual(6);
    expect(Math.abs(f.height - 56)).toBeLessThanOrEqual(6);
  });

  it('表の空いたマスをそれぞれ検出し、縦長の欄は縦書き向きにする', () => {
    const img = blank(800, 600);
    // 2×1 の表
    box(img, 100, 300, 300, 60);
    fill(img, 250, 300, 2, 60);
    // 縦長の欄
    box(img, 600, 100, 50, 300);
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(3);
    expect(fields.filter((f) => f.vertical)).toHaveLength(1);
  });

  it('先頭の番号を避けて書き始め位置をずらす', () => {
    const img = blank(800, 600);
    box(img, 100, 100, 300, 60);
    fill(img, 110, 115, 20, 30); // (1) のような番号
    const [f] = detectAnswerFields(img);
    expect(f).toBeDefined();
    expect(f.x).toBeGreaterThan(130);
    expect(f.x + f.width).toBeGreaterThan(390);
  });

  it('上が空白の下線を回答欄として検出し、文字に引いた傍線は除外する', () => {
    const img = blank(800, 600);
    fill(img, 100, 200, 200, 2); // 下線の欄
    fill(img, 400, 200, 200, 2);
    fill(img, 410, 180, 180, 15); // 線の上に文字
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('underline');
    expect(fields[0].y + fields[0].height).toBeLessThanOrEqual(201);
  });

  it('何もない画像では何も検出しない', () => {
    expect(detectAnswerFields(blank(400, 300))).toEqual([]);
  });
});

describe('detectAnswerFields（表）', () => {
  it('短い文字が入った表のマスは回答欄にしない', () => {
    const img = blank(800, 600);
    box(img, 100, 100, 200, 70);
    fill(img, 115, 120, 50, 30); // 「こ数」のような短い文字
    expect(detectAnswerFields(img)).toEqual([]);
  });
});

describe('detectAnswerFields（写真）', () => {
  /** 中心まわりに deg 度傾けた枠を描く */
  function tiltedBox(img: GrayImage, x: number, y: number, w: number, h: number, deg: number, t = 2) {
    const a = (deg * Math.PI) / 180;
    const cx = img.width / 2;
    const cy = img.height / 2;
    const put = (px: number, py: number) => {
      const dx = px - cx;
      const dy = py - cy;
      const rx = Math.round(dx * Math.cos(a) - dy * Math.sin(a) + cx);
      const ry = Math.round(dx * Math.sin(a) + dy * Math.cos(a) + cy);
      for (let k = 0; k < t; k++) for (let j = 0; j < t; j++) img.data[(ry + j) * img.width + rx + k] = 20;
    };
    for (let i = 0; i <= w; i++) put(x + i, y), put(x + i, y + h);
    for (let i = 0; i <= h; i++) put(x, y + i), put(x + w, y + i);
  }

  it('傾いた写真でも枠を見つける', () => {
    const img = blank(800, 600);
    tiltedBox(img, 150, 150, 400, 80, 2.5);
    tiltedBox(img, 150, 350, 400, 80, 2.5);
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(2);
    expect(fields.every((f) => f.kind === 'box' && Math.abs(f.width - 400) < 20)).toBe(true);
  });

  it('線が途切れていても枠を見つけ、途切れた辺を下線と間違えない', () => {
    const img = blank(800, 600);
    box(img, 200, 200, 300, 70);
    // 数か所の途切れ
    for (const x of [240, 300, 380, 450]) fill(img, x, 200, 4, 2, 250), fill(img, x, 268, 4, 2, 250);
    fill(img, 200, 230, 2, 4, 250);
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('box');
  });

  it('ざらつきのある写真でも空欄を記入済みと間違えない', () => {
    const img = blank(800, 600);
    let s = 7;
    for (let i = 0; i < img.data.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      img.data[i] = 200 + ((s >>> 24) % 41) - 20;
    }
    box(img, 200, 200, 300, 70);
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('box');
  });

  it('途切れた二重線の飾り罫は下線の欄にしない', () => {
    const img = blank(800, 600);
    for (let x = 50; x < 750; x += 120) {
      fill(img, x, 100, 110, 2);
      fill(img, x, 104, 110, 1);
    }
    expect(detectAnswerFields(img)).toEqual([]);
  });
});

describe('detectAnswerFields（かっこ）', () => {
  /** 丸かっこ。open なら「（」、そうでなければ「）」。縦書き用（vertical）は「︵」「︶」 */
  function paren(img: GrayImage, x: number, y: number, len: number, open: boolean, vertical = false, t = 3) {
    const bulge = Math.round(len * 0.22);
    for (let i = 0; i <= len; i++) {
      const u = (i / len) * 2 - 1; // -1〜1
      const d = Math.round(bulge * (1 - u * u)); // 中央ほど張り出す
      const off = open ? bulge - d : d;
      if (vertical) fill(img, x + i, y + off, 1, t);
      else fill(img, x + off, y + i, t, 1);
    }
  }

  /** 亀甲かっこ「〔」「〕」 */
  function shell(img: GrayImage, x: number, y: number, len: number, open: boolean, t = 3) {
    const hook = Math.round(len * 0.2);
    const sx = open ? x : x + hook - t;
    fill(img, sx, y + hook, t, len - hook * 2);
    for (let i = 0; i < hook; i++) {
      const hx = open ? x + hook - i - 1 : x + i;
      fill(img, hx, y + i, t, 1);
      fill(img, hx, y + len - i - 1, t, 1);
    }
  }

  it('空いた（　）と〔　〕を回答欄として検出する', () => {
    const img = blank(800, 600);
    paren(img, 100, 100, 40, true);
    paren(img, 300, 100, 40, false);
    shell(img, 100, 300, 40, true);
    shell(img, 400, 300, 40, false);
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(2);
    expect(fields.every((f) => f.kind === 'bracket' && !f.vertical)).toBe(true);
    const [a, b] = fields;
    expect(a.x).toBeGreaterThan(105);
    expect(a.x + a.width).toBeLessThanOrEqual(301);
    expect(Math.abs(a.y - 100)).toBeLessThanOrEqual(3);
    expect(b.x).toBeGreaterThan(105);
    expect(b.x + b.width).toBeLessThanOrEqual(401);
  });

  it('文字の入ったかっこや (1) のような番号のかっこは除外する', () => {
    const img = blank(800, 600);
    paren(img, 100, 100, 40, true);
    paren(img, 300, 100, 40, false);
    fill(img, 150, 108, 100, 24); // 中に文字
    paren(img, 100, 300, 40, true);
    paren(img, 130, 300, 40, false); // 間がせまい番号
    fill(img, 120, 310, 4, 20);
    expect(detectAnswerFields(img)).toEqual([]);
  });

  it('縦書きの︵　︶を縦向きの回答欄として検出する', () => {
    const img = blank(600, 800);
    paren(img, 200, 100, 40, true, true);
    paren(img, 200, 350, 40, false, true);
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('bracket');
    expect(fields[0].vertical).toBe(true);
    expect(fields[0].y).toBeGreaterThan(105);
    expect(fields[0].y + fields[0].height).toBeLessThanOrEqual(351);
  });
});
