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
