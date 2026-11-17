import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { candidates, convertBest, parseKanaKanjiDict, setKanaKanjiDict } from './kanaKanji';

beforeAll(async () => {
  // テストは Node で動くので、辞書のファイルを直接読む
  const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
    readFileSync(p: URL, enc?: string): Uint8Array & string;
  };
  const t = fs.readFileSync(new URL('../../public/kanakanji/dict.txt', import.meta.url), 'utf8');
  const b = fs.readFileSync(new URL('../../public/kanakanji/conn.bin', import.meta.url));
  setKanaKanjiDict(parseKanaKanjiDict(t, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
});
afterAll(() => setKanaKanjiDict(null));

const conv = (s: string) => convertBest(s)!.map((x) => x.surface).join('');

describe('かな漢字変換', () => {
  it.each([
    ['わたしはがっこうにいきます', '私は学校に行きます'],
    ['あしたはあめがふるでしょう', '明日は雨が降るでしょう'],
    ['すうがくのしゅくだい', '数学の宿題'],
    ['でんしゃにのってえきまでいく', '電車に乗って駅まで行く'],
    ['しょくぶつ', '植物'],
    ['にほんのれきし', '日本の歴史'],
  ])('%s → %s', (kana, want) => {
    expect(conv(kana)).toBe(want);
  });

  it('候補に同じ読みの語・ひらがな・カタカナが入る', () => {
    const c = candidates('こうえん').map((x) => x.text);
    expect(c).toContain('公園');
    expect(c).toContain('講演');
    expect(c).toContain('こうえん');
    expect(c).toContain('コウエン');
  });

  it('漢字の語には読みが付く', () => {
    const segs = convertBest('がっこうにいく')!;
    expect(segs.find((s) => s.surface === '学校')?.reading).toBe('がっこう');
  });
});
