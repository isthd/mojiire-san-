import { describe, expect, it } from 'vitest';
import { layoutVertical } from './verticalText';

const base = { fontSize: 20, letterSpacing: 0, lineHeight: 1.5, padding: 0, align: 'left' as const };

describe('layoutVertical', () => {
  it('stacks characters top to bottom in one column', () => {
    const l = layoutVertical({ ...base, text: 'あいう' });
    expect(l.width).toBe(30);
    expect(l.height).toBe(60);
    expect(l.glyphs.map((g) => g.cy)).toEqual([10, 30, 50]);
    expect(new Set(l.glyphs.map((g) => g.cx)).size).toBe(1);
  });

  it('places the first line in the rightmost column', () => {
    const l = layoutVertical({ ...base, text: 'あ\nい' });
    const a = l.glyphs.find((g) => g.ch === 'あ')!;
    const i = l.glyphs.find((g) => g.ch === 'い')!;
    expect(a.cx).toBeGreaterThan(i.cx);
  });

  it('rotates long vowel marks and brackets', () => {
    const l = layoutVertical({ ...base, text: 'ノート「x」' });
    expect(l.glyphs.filter((g) => g.rotate).map((g) => g.ch)).toEqual(['ー', '「', '」']);
  });

  it('applies letter spacing and bottom alignment', () => {
    const l = layoutVertical({ ...base, text: 'あい\nう', letterSpacing: 0.5, align: 'right' });
    expect(l.height).toBe(50); // 20*1.5*2 - 20*0.5
    const u = l.glyphs.find((g) => g.ch === 'う')!;
    expect(u.cy).toBe(40); // 下揃え：2文字目の位置
  });
});
