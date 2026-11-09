// 予測変換で選んだ語の読みを調べるための辞書（src/data/readings.txt）を作る。
// 元データ: JMdict / KANJIDIC2（© EDRDG, CC BY-SA 4.0）を jmdict-simplified の JSON 版から変換。
//   https://github.com/scriptin/jmdict-simplified/releases
// 使い方: node scripts/build-reading-dict.mjs <jmdict-eng-*.json> <kanjidic2-en-*.json>
// 出力の各行: 表記<TAB>読み1,読み2,…（ひらがな。よく使う読みを先に）
import { readFileSync, writeFileSync } from 'node:fs';

const [jmPath, kdPath] = process.argv.slice(2);
if (!jmPath || !kdPath) {
  console.error('usage: node scripts/build-reading-dict.mjs <jmdict.json> <kanjidic2.json>');
  process.exit(1);
}

const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hasKanji = (s) => /[\p{Script=Han}々〆ヶ]/u.test(s);
// 検索用・まれな表記や読みは除く
const SKIP = new Set(['sK', 'sk', 'rK', 'rk', 'iK', 'ik', 'oK', 'ok']);

/** @type {Map<string, {r: string, score: number}[]>} */
const map = new Map();
const add = (surface, reading, score) => {
  if (!surface || !reading || !/^[ぁ-ゖー]+$/.test(reading)) return;
  let list = map.get(surface);
  if (!list) map.set(surface, (list = []));
  const hit = list.find((x) => x.r === reading);
  if (hit) hit.score = Math.max(hit.score, score);
  else list.push({ r: reading, score });
};

const jm = JSON.parse(readFileSync(jmPath, 'utf8'));
for (const w of jm.words) {
  for (const k of w.kanji) {
    if (!hasKanji(k.text) || k.tags.some((t) => SKIP.has(t))) continue;
    w.kana.forEach((r, i) => {
      if (r.tags.some((t) => SKIP.has(t))) return;
      if (!r.appliesToKanji.includes('*') && !r.appliesToKanji.includes(k.text)) return;
      add(k.text, toHira(r.text), (k.common ? 2 : 0) + (r.common ? 2 : 0) - i * 0.1);
    });
  }
}

const kd = JSON.parse(readFileSync(kdPath, 'utf8'));
for (const c of kd.characters) {
  const groups = c.readingMeaning?.groups ?? [];
  for (const g of groups) {
    for (const r of g.readings) {
      if (r.type === 'ja_on') add(c.literal, toHira(r.value.replace(/-/g, '')), -1);
      if (r.type === 'ja_kun') {
        const v = r.value.replace(/-/g, '');
        const [stem] = v.split('.');
        add(c.literal, toHira(stem), -1.5);
        if (v.includes('.')) add(c.literal, toHira(v.replace('.', '')), -1.2);
      }
    }
  }
}

const lines = [...map.entries()]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([s, list]) => `${s}\t${list.sort((a, b) => b.score - a.score).map((x) => x.r).join(',')}`);
writeFileSync(new URL('../src/data/readings.txt', import.meta.url), lines.join('\n') + '\n');
console.log(`${lines.length} entries`);
