// 文字数のカウント。改行は数えず、絵文字や濁点の結合文字などは見た目どおり1文字として数える。

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
