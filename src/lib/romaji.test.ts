import { describe, expect, it } from 'vitest';
import { romajiToKana } from './romaji';

describe('ローマ字 → ひらがな', () => {
  it.each([
    ['konnnichiha', 'こんにちは', ''],
    ['gakkou', 'がっこう', ''],
    ['shinbun', 'しんぶ', 'n'],
    ['kyou', 'きょう', ''],
    ['matcha', 'まっちゃ', ''],
    ['senpai', 'せんぱい', ''],
    ['k', '', 'k'],
    ['ky', '', 'ky'],
    ['ra-men', 'らーめ', 'n'],
    ["kan'i", 'かんい', ''],
  ])('%s', (src, kana, rest) => {
    expect(romajiToKana(src)).toEqual({ kana, rest });
  });

  it('最後の n は確定すると「ん」', () => {
    expect(romajiToKana('shinbun', true)).toEqual({ kana: 'しんぶん', rest: '' });
  });
});
