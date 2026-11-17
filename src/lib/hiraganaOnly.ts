// 「ひらがな」の入力モード：漢字・カタカナをひらがな（読み）にもどす。
// 予測変換などで漢字やカタカナが入っても、ひらがなだけの文字にする。
import type { TextReading } from '../types/model';
import { guessReading, isReadingDictLoaded, toHiragana } from './readingDict';

const HAN = /[\p{Script=Han}々〆ヶ]/u;
const KATA = /[ァ-ヶ]/;

/** ひらがなにする必要がある文字（漢字・カタカナ）を含むか */
export function needsHiragana(s: string): boolean {
  return HAN.test(s) || KATA.test(s);
}

/**
 * 文字列の漢字・カタカナをひらがなにする。
 * 漢字は、入力したときの読み（readings）があればそれを使い、なければ辞書で読みを調べる。
 * 漢字があるのに読みの辞書を読み込む前のときは null。
 */
export function toHiraganaText(text: string, readings?: readonly TextReading[]): string | null {
  if (!needsHiragana(text)) return text;
  let s = text;
  if (readings?.length) {
    const sorted = [...readings].sort((a, b) => b.s.length - a.s.length);
    for (const { s: surface, r } of sorted) if (surface && HAN.test(surface)) s = s.split(surface).join(r);
  }
  s = toHiragana(s);
  if (!HAN.test(s)) return s;
  if (!isReadingDictLoaded()) return null;
  // 漢字を含むひとまとまり（漢字と、その前後のひらがな）ごとに読みを調べる
  return s.replace(/[\p{Script=Han}々〆ヶぁ-ゖー]+/gu, (run) => (HAN.test(run) ? (guessReading(run) ?? run) : run));
}
