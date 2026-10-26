import { describe, expect, it } from 'vitest';
import { LATEST_NEWS_ID, NEWS, unseenNews, type NewsEntry } from './news';

const entry = (id: number): NewsEntry => ({ id, date: '2026-01-01', features: [] });

describe('unseenNews', () => {
  it('見た id より新しいものだけを新しい順で返す', () => {
    const list = [entry(1), entry(3), entry(2)];
    expect(unseenNews(1, list).map((n) => n.id)).toEqual([3, 2]);
    expect(unseenNews(3, list)).toEqual([]);
  });

  it('お知らせの id は重複しない', () => {
    const ids = NEWS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LATEST_NEWS_ID).toBe(Math.max(...ids));
  });

  it('各機能に使いかたと開きかたがある', () => {
    for (const n of NEWS) {
      for (const f of n.features) {
        expect(f.how.length).toBeGreaterThan(0);
        expect(f.open.length).toBeGreaterThan(0);
      }
    }
  });

  it('各お知らせに新機能か不具合修正のどちらかがある', () => {
    for (const n of NEWS) {
      expect(n.features.length + (n.fixes?.length ?? 0)).toBeGreaterThan(0);
    }
  });
});
