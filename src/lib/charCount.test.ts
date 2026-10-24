import { describe, expect, it } from 'vitest';
import { addReading, countChars, countReadingChars, isKana } from './charCount';

describe('countChars', () => {
  it('空文字は0', () => {
    expect(countChars('')).toBe(0);
    expect(countChars('\n\n')).toBe(0);
  });

  it('日本語・英数字を1文字ずつ数える', () => {
    expect(countChars('あいう')).toBe(3);
    expect(countChars('abc 12')).toBe(6);
  });

  it('改行は数えない', () => {
    expect(countChars('あい\nう\r\nえ')).toBe(4);
  });

  it('絵文字や結合文字は1文字', () => {
    expect(countChars('👍🏻')).toBe(1);
    expect(countChars('が')).toBe(1);
    expect(countChars('𠮷野家')).toBe(3);
  });
});

describe('countReadingChars', () => {
  it('変換した語は読みの文字数で数える', () => {
    const r = addReading(undefined, '邪悪', 'じゃあく');
    expect(countReadingChars('邪悪', r)).toBe(4);
    expect(countReadingChars('邪悪な心', addReading(r, '心', 'こころ'))).toBe(8);
  });

  it('読みがなければ表記どおり', () => {
    expect(countReadingChars('邪悪', undefined)).toBe(2);
    expect(countReadingChars('邪', addReading(undefined, '邪悪', 'じゃあく'))).toBe(1);
  });

  it('長い表記を優先する', () => {
    const r = addReading(addReading(undefined, '魔王', 'まおう'), '邪悪な魔王', 'じゃあくなまおう');
    expect(countReadingChars('邪悪な魔王と魔王', r)).toBe(12);
  });

  it('かな判定', () => {
    expect(isKana('じゃあく')).toBe(true);
    expect(isKana('カタカナー')).toBe(true);
    expect(isKana('じゃあk')).toBe(false);
    expect(isKana('邪悪')).toBe(false);
  });
});
