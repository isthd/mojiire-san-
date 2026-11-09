import { describe, expect, it } from 'vitest';
import { canReadImages, readPageLines, summarize } from './printReader';

const l = (text: string, size = 12) => ({ text, size, top: 0 });

describe('summarize', () => {
  it('builds title, subject and text from read lines', () => {
    const r = summarize([[l('化学基礎 中間テスト予想問題① 2年 組 番', 24), l('(1) 物質量を求めよ')], [l('2ページ目 モル')]]);
    expect(r.title).toBe('化学基礎 中間テスト予想問題①');
    expect(r.subject).toBe('化学');
    expect(r.text).toBe('化学基礎 中間テスト予想問題① 2年 組 番\n(1) 物質量を求めよ\n2ページ目 モル');
  });

  it('returns nulls when nothing useful was read', () => {
    expect(summarize([])).toEqual({ title: null, subject: null, text: '' });
    expect(summarize([[l('12')]])).toEqual({ title: null, subject: null, text: '12' });
  });
});

describe('image reading without TextDetector', () => {
  it('reports that images cannot be read (no external OCR)', async () => {
    expect(canReadImages()).toBe(false);
    expect(await readPageLines([{ id: 'p', imageId: 'x', width: 1, height: 1, unit: 1, objects: [] }])).toBe(null);
  });
});
