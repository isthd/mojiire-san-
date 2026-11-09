import { describe, expect, it } from 'vitest';
import { groupIntoLines, guessTitle, stripNameFields, tidyOcrText, type TextLine } from './autoTitle';

const line = (text: string, size = 12, top = 0): TextLine => ({ text, size, top });

describe('groupIntoLines', () => {
  it('joins boxes on the same row left to right, top to bottom', () => {
    const lines = groupIntoLines([
      { text: '予想問題①', x: 120, y: 12, width: 80, height: 20 },
      { text: '化学基礎', x: 10, y: 10, width: 60, height: 22 },
      { text: '中間テスト', x: 72, y: 11, width: 46, height: 21 },
      { text: '(1) 次の問いに答えよ', x: 10, y: 60, width: 200, height: 12 },
      { text: '   ', x: 0, y: 30, width: 5, height: 5 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['化学基礎中間テスト予想問題①', '(1) 次の問いに答えよ']);
    expect(lines[0].size).toBe(22);
  });

  it('puts spaces between latin words', () => {
    const lines = groupIntoLines([
      { text: 'Lesson', x: 0, y: 0, width: 40, height: 10 },
      { text: '3', x: 45, y: 0, width: 8, height: 10 },
    ]);
    expect(lines[0].text).toBe('Lesson 3');
  });
});

describe('stripNameFields', () => {
  it('removes trailing class/name fields', () => {
    expect(stripNameFields('化学基礎 中間テスト予想問題① 2年 組 番 氏名')).toBe('化学基礎 中間テスト予想問題①');
    expect(stripNameFields('漢字練習 第7回　名前＿＿＿＿')).toBe('漢字練習 第7回');
    expect(stripNameFields('文法演習 助動詞 （ ）年（ ）組')).toBe('文法演習 助動詞');
    expect(stripNameFields('最大公約数のまとめ 番号:')).toBe('最大公約数のまとめ');
  });
  it('keeps words that merely contain 番 or 組', () => {
    expect(stripNameFields('番外編 一番大きい数')).toBe('番外編 一番大きい数');
    expect(stripNameFields('組み合わせの数')).toBe('組み合わせの数');
  });
});

describe('guessTitle', () => {
  it('picks the largest line near the top, skipping fields and numbers', () => {
    expect(
      guessTitle([
        line('2026/11/9', 10),
        line('氏名', 12),
        line('化学基礎 中間テスト予想問題① 2年 組 番 氏名', 24),
        line('(1) 次の物質の物質量を求めよ。', 12),
      ]),
    ).toBe('化学基礎 中間テスト予想問題①');
  });

  it('prefers the first line when sizes are similar', () => {
    expect(guessTitle([line('文法演習 助動詞', 12), line('次の英文を和訳しなさい', 12.5)])).toBe('文法演習 助動詞');
  });

  it('skips question numbers and symbol-only lines', () => {
    expect(guessTitle([line('問1', 30), line('①', 30), line('p.12', 30), line('――――', 30), line('保健 第4章 生活習慣病', 14)])).toBe(
      '保健 第4章 生活習慣病',
    );
  });

  it('does not treat titles starting with 問題 as question numbers', () => {
    expect(guessTitle([line('問題演習 二次関数', 20)])).toBe('問題演習 二次関数');
  });

  it('returns null when nothing looks like a title', () => {
    expect(guessTitle([])).toBe(null);
    expect(guessTitle([line('12'), line('氏名'), line('ab')])).toBe(null);
  });

  it('only looks near the top and trims long text', () => {
    const many = Array.from({ length: 10 }, (_, i) => line(`本文の行 その${i + 1}です`, 12));
    expect(guessTitle([...many, line('ずっと下の大きな見出し', 40)])).toBe('本文の行 その1です');
    expect(guessTitle([line('長'.repeat(39), 12)])?.length).toBe(39);
  });
});

describe('tidyOcrText', () => {
  it('removes spaces Tesseract puts inside Japanese', () => {
    expect(tidyOcrText('漢 字 練 習 第 8 回')).toBe('漢字練習第8回');
    expect(tidyOcrText('漢字練習第 8 回')).toBe('漢字練習第8回');
    expect(tidyOcrText('次の漢字の読みを書きなさい .')).toBe('次の漢字の読みを書きなさい.');
    expect(tidyOcrText('化学基礎　中間テスト')).toBe('化学基礎中間テスト');
  });
  it('keeps spaces between latin words', () => {
    expect(tidyOcrText('Lesson  3 Grammar  Practice')).toBe('Lesson 3 Grammar Practice');
    expect(tidyOcrText('  Unit 2 の まとめ ')).toBe('Unit 2のまとめ');
  });
});
