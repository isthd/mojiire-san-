import { describe, expect, it } from 'vitest';
import { countChars } from './charCount';

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
