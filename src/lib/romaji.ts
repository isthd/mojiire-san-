// ローマ字 → ひらがな。日本語入力（IME）を使わずに英字キーボードで打ったときに、アプリの中でひらがなにする。
// 「ひらがな」の入力モードで使う。大文字はそのまま英字として残す。

const BASE: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', ye: 'いぇ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  la: 'ら', li: 'り', lu: 'る', le: 'れ', lo: 'ろ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を', wyi: 'ゐ', wye: 'ゑ',
  nn: 'ん', "n'": 'ん', xn: 'ん',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', fyu: 'ふゅ',
  sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ',
  cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ',
  ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ',
  tsa: 'つぁ', tsi: 'つぃ', tse: 'つぇ', tso: 'つぉ',
  thi: 'てぃ', thu: 'てゅ', dhi: 'でぃ', dhu: 'でゅ', twu: 'とぅ', dwu: 'どぅ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
  xtu: 'っ', xtsu: 'っ', ltu: 'っ', ltsu: 'っ', xwa: 'ゎ', lwa: 'ゎ',
  ca: 'か', cu: 'く', co: 'こ', qa: 'くぁ', qi: 'くぃ', qu: 'く', qe: 'くぇ', qo: 'くぉ',
};
// きゃ・しゃ などの拗音（子音 + y + 母音）
const YOON: Record<string, string> = {
  k: 'き', s: 'し', t: 'ち', c: 'ち', n: 'に', h: 'ひ', m: 'み', r: 'り', l: 'り',
  g: 'ぎ', z: 'じ', j: 'じ', d: 'ぢ', b: 'び', p: 'ぴ', f: 'ふ', v: 'ゔ',
};
const SMALL: Record<string, string> = { a: 'ゃ', i: 'ぃ', u: 'ゅ', e: 'ぇ', o: 'ょ' };
for (const [c, k] of Object.entries(YOON)) for (const [v, s] of Object.entries(SMALL)) BASE[`${c}y${v}`] ??= k + s;

const MAX = 4;
const isConsonant = (c: string) => /^[bcdfghjklmpqrstvwxyz]$/.test(c);

export interface RomajiResult {
  /** ひらがなにした部分 */
  kana: string;
  /** まだ続きを待っている英字（"k" "ky" など） */
  rest: string;
}

/**
 * 小文字の英字（と ' -）の並びをひらがなにする。続きを待つ英字は rest に残す。
 * final = true のときは、最後の "n" を「ん」にして、残りは英字のまま返す。
 */
export function romajiToKana(src: string, final = false): RomajiResult {
  let kana = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '-') {
      kana += 'ー';
      i++;
      continue;
    }
    // 子音の重ね（kk → っk、tch → っch）。nn は「ん」
    if ((c !== 'n' && isConsonant(c) && src[i + 1] === c) || (c === 't' && src[i + 1] === 'c')) {
      kana += 'っ';
      i++;
      continue;
    }
    let hit = '';
    for (let len = Math.min(MAX, src.length - i); len >= 1; len--) {
      const k = src.slice(i, i + len);
      if (BASE[k]) {
        hit = k;
        break;
      }
    }
    if (hit) {
      // "n" + 母音/y は な行・にゃ行。"n" + 子音 は「ん」
      kana += BASE[hit];
      i += hit.length;
      continue;
    }
    if (c === 'n' && i + 1 < src.length && !/[aiueoy']/.test(src[i + 1])) {
      kana += 'ん';
      i++;
      continue;
    }
    // ここから先はまだ途中（続きの英字を待つ）か、ローマ字にならない英字
    const tail = src.slice(i);
    if (!final && couldContinue(tail)) return { kana, rest: tail };
    if (final && tail === 'n') return { kana: kana + 'ん', rest: '' };
    // ローマ字にならない英字はそのまま残して先へ進む
    kana += c;
    i++;
  }
  return { kana, rest: '' };
}

/** tail の後ろに英字が続けばローマ字になりうるか */
function couldContinue(tail: string): boolean {
  if (tail.length >= MAX) return false;
  for (const k of Object.keys(BASE)) if (k.length > tail.length && k.startsWith(tail)) return true;
  return tail === 'n';
}

/** 句読点など、かなの後ろで打ったときに全角にする記号 */
export const PUNCT: Record<string, string> = {
  ',': '、', '.': '。', '?': '？', '!': '！', '[': '「', ']': '」', '~': '〜',
};
