// 「自動変換」（ひらがな → 漢字）で使う辞書（public/kanakanji/）を作る。
// 元データ: IPADIC（mecab-ipadic-2.7.0。© NAIST、ライセンスは public/kanakanji/COPYING）。
//   npm の mecab-ipadic-seed パッケージの lib/dict に入っている CSV と matrix.def を使う。
// 使い方: npm pack mecab-ipadic-seed && tar xzf mecab-ipadic-seed-*.tgz
//         node scripts/build-kanakanji-dict.mjs package/lib/dict
// 出力:
//   dict.txt  各行: 読み<TAB>表記 コスト 左文脈ID 右文脈ID|…（表記が読みと同じときは表記を省く）
//   conn.bin  先頭 2 バイトに文脈 ID の数 N（リトルエンディアン）、続けて N×N の連接コスト ÷ STEP（int8）
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/build-kanakanji-dict.mjs <mecab-ipadic dict dir>');
  process.exit(1);
}
const out = new URL('../public/kanakanji/', import.meta.url);
const STEP = 100;

const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
// 人名・組織名・固有名詞・記号などは変換候補にしない
const SKIP = new Set([
  'Noun.name.csv', 'Noun.org.csv', 'Noun.proper.csv', 'Symbol.csv', 'Filler.csv', 'Others.csv', 'Interjection.csv',
]);
const isKata = (s) => /^[\p{Script=Katakana}ー]+$/u.test(s);

const rows = [];
const minCost = new Map();
for (const f of readdirSync(dir).filter((f) => f.endsWith('.csv')).sort()) {
  if (SKIP.has(f)) continue;
  for (const line of readFileSync(new URL(f, `file://${new URL(dir + '/', 'file:///').pathname}`), 'utf8').split('\n')) {
    const c = line.split(',');
    if (c.length < 12) continue;
    const surf = c[0];
    const read = toHira(c[11]);
    if (!/^[ぁ-ゖー]+$/.test(read)) continue;
    if (!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ]+$/u.test(surf)) continue;
    let cost = +c[3];
    // 解析用のコストを、ひらがなからの変換向けに調整する
    if (c[5] === '数') cost += 4000; // 「に」→「二」などを避ける
    if (isKata(surf)) cost += surf.length <= 2 ? 5000 : 1500; // 「で」→「デ」などを避ける
    else if (/\p{Script=Katakana}/u.test(surf)) cost += 5000; // 「スる」など
    if (f === 'Noun.place.csv') cost += 1500;
    const key = `${surf},${c[4]},${c[5]}`;
    minCost.set(key, Math.min(minCost.get(key) ?? Infinity, cost));
    rows.push({ read, surf, l: +c[1], r: +c[2], cost, key, place: f === 'Noun.place.csv' });
  }
}

// 同じ表記で読みが複数あるとき（日本：にっぽん／にほん）、まれな読みでも表記自体のよさを反映する
const map = new Map();
for (const x of rows) {
  if (x.place && minCost.get(x.key) > 9000) continue; // まれな地名は入れない
  const cost = Math.round((x.cost + minCost.get(x.key) * 2) / 3);
  let m = map.get(x.read);
  if (!m) map.set(x.read, (m = new Map()));
  const k = `${x.surf} ${x.l} ${x.r}`;
  if (!m.has(k) || m.get(k).cost > cost) m.set(k, { surf: x.surf, cost, l: x.l, r: x.r });
}
const lines = [...map.entries()]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(
    ([read, m]) =>
      `${read}\t${[...m.values()]
        .sort((a, b) => a.cost - b.cost)
        .map((e) => `${e.surf === read ? '' : e.surf} ${e.cost} ${e.l} ${e.r}`)
        .join('|')}`,
  );
writeFileSync(new URL('dict.txt', out), lines.join('\n') + '\n');

const mtx = readFileSync(new URL('matrix.def', `file://${new URL(dir + '/', 'file:///').pathname}`), 'utf8').split('\n');
const [nr, nl] = mtx[0].split(' ').map(Number);
if (nr !== nl) throw new Error('matrix.def is not square');
const buf = Buffer.alloc(2 + nr * nl);
buf.writeUInt16LE(nr, 0);
for (const line of mtx.slice(1)) {
  const p = line.split(' ');
  if (p.length < 3) continue;
  const v = Math.max(-128, Math.min(127, Math.round(+p[2] / STEP)));
  buf.writeInt8(v, 2 + +p[0] * nl + +p[1]);
}
writeFileSync(new URL('conn.bin', out), buf);
copyFileSync(new URL('COPYING', `file://${new URL(dir + '/', 'file:///').pathname}`), new URL('COPYING', out));
console.log(`${lines.length} readings, matrix ${nr}x${nl}`);
