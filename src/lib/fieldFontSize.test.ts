import { describe, expect, it } from 'vitest';
import { fieldFontSize, fitOverflow, OVERFLOW_MIN_RATIO, pageFieldFontSize } from './fieldFontSize';

describe('pageFieldFontSize', () => {
  it('設定の文字サイズより大きくしない（高さのある記述欄があっても）', () => {
    expect(pageFieldFontSize([{ cross: 400 }, { cross: 500 }], 40)).toBe(40);
  });
  it('欄が小さいページでは中央値に合わせる', () => {
    expect(pageFieldFontSize([{ cross: 30 }, { cross: 50 }, { cross: 400 }], 40)).toBeCloseTo(30);
  });
  it('欄がなければ設定の大きさ', () => {
    expect(pageFieldFontSize([], 24)).toBe(24);
  });
});

describe('fieldFontSize', () => {
  it('大きい欄でもそろえた大きさ', () => {
    expect(fieldFontSize({ cross: 1000 }, 30)).toBe(30);
  });
  it('極端に細い欄でも小さくなりすぎない', () => {
    expect(fieldFontSize({ cross: 5 }, 30)).toBeCloseTo(30 * 0.75);
  });
});

describe('fitOverflow', () => {
  it('収まるときはそのまま', () => {
    expect(fitOverflow(30, 100, 200)).toBe(30);
  });
  it('はみ出すときは収まるように縮める', () => {
    expect(fitOverflow(30, 220, 200)).toBeCloseTo((30 * 200) / 220);
  });
  it('縮めすぎない', () => {
    expect(fitOverflow(30, 1000, 100)).toBeCloseTo(30 * OVERFLOW_MIN_RATIO);
  });
});
