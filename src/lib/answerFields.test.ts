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

describe('detectAnswerFields（改行された欄）', () => {
  /** 片側だけ縦線で閉じた枠（open: 開いている側） */
  function openBox(img: GrayImage, x: number, y: number, w: number, h: number, open: 'left' | 'right' | 'top' | 'bottom') {
    const t = 2;
    if (open !== 'top') fill(img, x, y, w, t);
    if (open !== 'bottom') fill(img, x, y + h - t, w, t);
    if (open !== 'left') fill(img, x, y, t, h);
    if (open !== 'right') fill(img, x + w - t, y, t, h);
  }

  it('行の終わりで切れて次の行の頭に続く枠を、1つの欄（続きつき）として検出する', () => {
    const img = blank(800, 600);
    // 上下の線と左の縦線（右が開いている）
    fill(img, 500, 100, 280, 2);
    fill(img, 500, 150, 280, 2);
    fill(img, 500, 100, 2, 52);
    // 次の行：上下の線と右の縦線（左が開いている）
    fill(img, 20, 200, 260, 2);
    fill(img, 20, 250, 260, 2);
    fill(img, 278, 200, 2, 52);
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(1);
    const f = fields[0];
    expect(f.vertical).toBe(false);
    expect(f.x).toBeGreaterThan(500);
    expect(f.y).toBeGreaterThan(100);
    expect(f.y + f.height).toBeLessThanOrEqual(151);
    expect(f.next).toBeDefined();
    expect(f.next!.x).toBeLessThan(40);
    expect(f.next!.x + f.next!.width).toBeLessThanOrEqual(279);
    expect(f.next!.y).toBeGreaterThan(200);
  });

  it('縦書きで列の下で切れて次の列の上に続く枠を検出する', () => {
    const img = blank(600, 800);
    // 右の列：左右の線と上の横線（下が開いている）
    openBox(img, 400, 500, 52, 290, 'bottom');
    // 左の列：左右の線と下の横線（上が開いている）
    openBox(img, 300, 10, 52, 260, 'top');
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(1);
    const f = fields[0];
    expect(f.vertical).toBe(true);
    expect(f.x).toBeGreaterThan(400);
    expect(f.y).toBeGreaterThan(500);
    expect(f.next).toBeDefined();
    expect(f.next!.x).toBeGreaterThan(300);
    expect(f.next!.x + f.next!.width).toBeLessThan(352);
    expect(f.next!.y + f.next!.height).toBeLessThanOrEqual(270);
  });

  it('続きのない片側だけの枠や、閉じた枠には続きをつけない', () => {
    const img = blank(800, 600);
    openBox(img, 500, 100, 280, 52, 'right');
    box(img, 100, 300, 200, 60);
    const fields = detectAnswerFields(img);
    expect(fields).toHaveLength(1);
    expect(fields[0].next).toBeUndefined();
  });
});

describe('detectAnswerFields（解答用紙）', () => {
  /** 大問の番号の列・小問の番号の列・回答のマス が並ぶ解答用紙 */
  function sheet(answers: ('blank' | 'filled' | 'unit')[]) {
    const img = blank(1000, 800);
    const top = 100;
    const rowH = 60;
    const n = answers.length;
    box(img, 100, top, 600, rowH * n); // 外枠
    fill(img, 140, top, 2, rowH * n); // 大問の列の右の線
    fill(img, 200, top, 2, rowH * n); // 小問の列の右の線
    fill(img, 112, top + 10, 16, 22); // 大問の番号「1」
    for (let i = 0; i < n; i++) {
      const y = top + i * rowH;
      if (i) fill(img, 140, y, 560, 2);
      fill(img, 160, y + 20, 26, 20); // 小問の番号「(1)」
      if (answers[i] === 'filled') fill(img, 300, y + 15, 150, 30); // 手書きの答え
      if (answers[i] === 'unit') fill(img, 668, y + 18, 20, 24); // 単位「J」
    }
    return img;
  }

  it('回答のマスをすべて検出し、番号の列は回答欄にしない', () => {
    const fields = detectAnswerFields(sheet(['blank', 'filled', 'blank', 'filled', 'blank']));
    expect(fields).toHaveLength(5);
    for (const f of fields) {
      expect(f.kind).toBe('box');
      expect(f.vertical).toBe(false);
      expect(f.x).toBeGreaterThan(200);
      expect(f.width).toBeGreaterThan(450);
    }
  });

  it('欄の終わりに印刷された単位の手前までを回答欄にする', () => {
    const fields = detectAnswerFields(sheet(['unit', 'filled', 'unit', 'blank', 'blank']));
    expect(fields).toHaveLength(5);
    const withUnit = [fields[0], fields[2]];
    for (const f of withUnit) {
      expect(f.x + f.width).toBeLessThan(668);
      expect(f.x + f.width).toBeGreaterThan(600);
    }
    expect(fields[3].x + fields[3].width).toBeGreaterThan(690);
  });

  it('文字の入った普通の表（解答用紙でない）のマスは回答欄にしない', () => {
    const img = blank(1000, 800);
    box(img, 100, 100, 600, 300);
    for (let i = 1; i < 5; i++) fill(img, 100, 100 + i * 60, 600, 2);
    fill(img, 300, 100, 2, 300);
    fill(img, 500, 100, 2, 300);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) fill(img, 130 + c * 200, 118 + r * 60, 80, 24);
    expect(detectAnswerFields(img)).toEqual([]);
  });
});
