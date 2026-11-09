import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import src from '../data/readings.txt?raw';
import { guessReading, parseReadingDict, setReadingDict } from './readingDict';

describe('guessReading（予測変換の読みを補う）', () => {
  beforeAll(() => {
    setReadingDict(parseReadingDict(src));
  });
  afterAll(() => setReadingDict(null));

  it('途中まで打った読みを辞書の読みで補う', () => {
    expect(guessReading('邪悪', 'じゃ')).toBe('じゃあく');
    expect(guessReading('魔王', 'ま')).toBe('まおう');
    expect(guessReading('学校', 'がっ')).toBe('がっこう');
    expect(guessReading('食べる', 'た')).toBe('たべる');
  });

  it('かなを含む句でも補う', () => {
    expect(guessReading('邪悪な魔王', 'じゃあくな')).toBe('じゃあくなまおう');
  });

  it('打った読みで始まる読みを選ぶ', () => {
    expect(guessReading('日本', 'にっ')).toBe('にっぽん');
    expect(guessReading('日本', 'にほ')).toBe('にほん');
  });

  it('最後まで打った読みはそのまま', () => {
    expect(guessReading('日本', 'にっぽん')).toBe('にっぽん');
    expect(guessReading('悪', 'わる')).toBe('わる');
    expect(guessReading('今日', 'こんにち')).toBe('こんにち');
  });

  it('カタカナで打った読みも扱う', () => {
    expect(guessReading('邪悪', 'ジャ')).toBe('じゃあく');
  });

  it('読みが合わないときは null', () => {
    expect(guessReading('邪悪', 'ぬ')).toBeNull();
  });

  it('読みを打っていないときはよく使う読み', () => {
    expect(guessReading('魔王')).toBe('まおう');
  });
});
