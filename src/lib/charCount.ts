// 文字数のカウント。改行は数えず、絵文字や濁点の結合文字などは見た目どおり1文字として数える。
import type { TextReading } from '../types/model';

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;

export function countChars(text: string): number {
  const s = text.replace(/\r\n|\r|\n/g, '');
  if (!s) return 0;
  if (segmenter) {
    let n = 0;
    for (const _ of segmenter.segment(s)) n++;
    return n;
  }
  return Array.from(s).length;
}

/** かなだけの文字列か（変換前の読みかどうかの判定に使う） */
export function isKana(s: string): boolean {
  return /^[\p{Script=Hiragana}\p{Script=Katakana}ー・゛゜]+$/u.test(s);
}

/**
 * 読みで数えた文字数。変換した語（例: 邪悪）は入力した読み（じゃあく）の文字数で数える。
 * 後から一部を消すなどして表記が残っていない語は、そのままの文字数で数える。
 */
export function countReadingChars(text: string, readings: readonly TextReading[] | undefined): number {
  if (!readings?.length) return countChars(text);
  // 長い表記から順に置き換える（「邪悪な魔王」と「魔王」が両方あるときなど）
  const sorted = [...readings].sort((a, b) => b.s.length - a.s.length);
  let s = text;
  for (const { s: surface, r } of sorted) {
    if (surface) s = s.split(surface).join(r);
  }
  return countChars(s);
}

/** 変換した語と読みを追加する（同じ表記は新しい読みで上書き） */
export function addReading(list: readonly TextReading[] | undefined, surface: string, reading: string): TextReading[] {
  return [...(list ?? []).filter((x) => x.s !== surface), { s: surface, r: reading }];
}
