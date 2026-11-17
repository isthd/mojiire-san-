import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import src from '../data/readings.txt?raw';
import { toHiraganaText } from './hiraganaOnly';
import { parseReadingDict, setReadingDict } from './readingDict';

describe('ひらがなだけにする', () => {
  beforeAll(() => setReadingDict(parseReadingDict(src)));
  afterAll(() => setReadingDict(null));

  it('漢字・カタカナを読みにする', () => {
    expect(toHiraganaText('学校')).toBe('がっこう');
    expect(toHiraganaText('コート')).toBe('こーと');
    expect(toHiraganaText('食べる')).toBe('たべる');
  });

  it('入力したときの読みがあれば使う', () => {
    expect(toHiraganaText('今日', [{ s: '今日', r: 'きょう' }])).toBe('きょう');
  });

  it('数字や英字はそのまま', () => {
    expect(toHiraganaText('3cm')).toBe('3cm');
  });
});
