import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { inferSubject, subjectColor, subjectFromFolderName, SUBJECTS, UNCLASSIFIED_COLOR } from './subjects';

describe('inferSubject', () => {
  it('reads the subject from typical print titles', () => {
    expect(inferSubject('化学基礎 中間テスト予想問題①')).toBe('化学');
    expect(inferSubject('文法演習 助動詞')).toBe('英語');
    expect(inferSubject('漢字練習 第7回')).toBe('国語');
    expect(inferSubject('最大公約数のまとめ')).toBe('数学');
    expect(inferSubject('歴史総合 後期中間テスト')).toBe('歴史');
    expect(inferSubject('保健 第4章 生活習慣病')).toBe('保健');
    expect(inferSubject('論理国語 評論文の読解')).toBe('国語');
    expect(inferSubject('物理基礎 運動方程式')).toBe('物理');
  });

  it('uses keywords in the body when the title has none', () => {
    expect(inferSubject('プリント 11/9', '物質量（モル）を求めよ。元素の周期表を参考に、イオンの電子配置を書け。')).toBe('化学');
    expect(inferSubject('第3回', '次の二次関数の最大値を求めよ。また不等式を解け。')).toBe('数学');
  });

  it('treats mostly-English text as English', () => {
    const body = 'Read the passage and answer the questions. Tom went to the library with his sister yesterday because they wanted books.';
    expect(inferSubject('第2回', body)).toBe('英語');
  });

  it('is case/width insensitive (NFKC)', () => {
    // 全角の「ｐＨ」も「pH」として見つける
    expect(inferSubject('ｐＨの計算')).toBe('化学');
    expect(inferSubject('ＥＮＧＬＩＳＨ　Ｌｅｓｓｏｎ３')).toBe('英語');
  });

  it('returns null when unsure or tied', () => {
    expect(inferSubject('プリント 11/9 10:30')).toBe(null);
    expect(inferSubject('')).toBe(null);
    expect(inferSubject('IMG_1234')).toBe(null);
    // 数学と化学の教科名が両方ある → 決めない
    expect(inferSubject('数学と化学')).toBe(null);
  });
});

describe('subject colors', () => {
  it('label text has 4.5:1 contrast on its background', () => {
    for (const s of SUBJECTS) {
      expect(contrastRatio(s.fg, s.bg), s.name).toBeGreaterThanOrEqual(4.5);
      // タブの丸印（文字ではない）は白い背景で 3:1 以上
      expect(contrastRatio(s.fg, '#ffffff'), s.name).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(UNCLASSIFIED_COLOR.fg, UNCLASSIFIED_COLOR.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('has unique names', () => {
    expect(new Set(SUBJECTS.map((s) => s.name)).size).toBe(SUBJECTS.length);
  });

  it('falls back to grey for unknown subjects', () => {
    expect(subjectColor('音楽')).toEqual(UNCLASSIFIED_COLOR);
    expect(subjectColor(null)).toEqual(UNCLASSIFIED_COLOR);
  });

  it('maps folder names that equal a subject', () => {
    expect(subjectFromFolderName('化学')).toBe('化学');
    expect(subjectFromFolderName(' 数学 ')).toBe('数学');
    expect(subjectFromFolderName('化学基礎')).toBe(null);
    expect(subjectFromFolderName('2024年4月')).toBe(null);
    expect(subjectFromFolderName(undefined)).toBe(null);
  });
});
