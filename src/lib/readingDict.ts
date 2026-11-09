// 変換した語の読みを辞書から調べる。
// iPad の予測変換では「じゃ」まで打って「邪悪」を選べるため、IME から分かる読みが途中まで（じゃ）になる。
// そのときは辞書で表記の読みを調べ、打った読みで始まるもの（じゃあく）に置き換える。
// 辞書（src/data/readings.txt）は大きいので、必要になったときに読み込む。

type Dict = { map: Map<string, string[]>; maxLen: number };

let dict: Dict | null = null;
let loading: Promise<Dict> | null = null;

export function parseReadingDict(src: string): Dict {
  const map = new Map<string, string[]>();
  let maxLen = 1;
  for (const line of src.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const s = line.slice(0, tab);
    map.set(s, line.slice(tab + 1).split(','));
    if (s.length > maxLen) maxLen = s.length;
  }
  return { map, maxLen };
}

export function loadReadingDict(): Promise<Dict> {
  if (dict) return Promise.resolve(dict);
  loading ??= import('../data/readings.txt?raw')
    .then((m) => (dict = parseReadingDict(m.default)))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** テスト用：辞書を直接設定する */
export function setReadingDict(d: Dict | null) {
  dict = d;
  loading = null;
}

export function isReadingDictLoaded() {
  return !!dict;
}

export const toHiragana = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const isKanaChar = (c: string) => /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(c);

// 連濁（ひと＋ひと → ひとびと）や促音化（がく＋こう → がっこう）の読みも候補にする
const VOICED: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};
const SEMI: Record<string, string> = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };

function variants(r: string, first: boolean, last: boolean): string[] {
  const out = [r];
  if (!first) {
    const h = r[0];
    if (VOICED[h]) out.push(VOICED[h] + r.slice(1));
    if (SEMI[h]) out.push(SEMI[h] + r.slice(1));
  }
  if (!last && r.length >= 2 && /[つちくき]$/.test(r)) out.push(...out.map((x) => x.slice(0, -1) + 'っ'));
  return out;
}

type State = { r: string; cost: number };
const BEAM = 60;

/**
 * 表記 surface の読みを、打った読み prefix で始まるものから選んで返す。
 * prefix がそのまま読みとして成り立つときは prefix を返す。見つからないときは null。
 * 辞書を読み込む前は null。
 */
export function guessReading(surface: string, prefix = ''): string | null {
  if (!dict || !surface) return null;
  const p = toHiragana(prefix);
  const n = surface.length;
  // 打った読みと食い違う途中の読みは捨てる
  const fits = (r: string) => (r.length <= p.length ? p.startsWith(r) : r.startsWith(p));
  const states: State[][] = Array.from({ length: n + 1 }, () => []);
  states[0].push({ r: '', cost: 0 });
  for (let i = 0; i < n; i++) {
    const cur = states[i];
    if (!cur.length) continue;
    cur.sort((a, b) => a.cost - b.cost);
    // 同じ読みは一番よいものだけ残す
    const seen = new Set<string>();
    const list = cur.filter((s) => !seen.has(s.r) && (seen.add(s.r), true)).slice(0, BEAM);
    const push = (j: number, r: string, cost: number) => {
      for (const s of list) {
        const nr = s.r + r;
        if (fits(nr)) states[j].push({ r: nr, cost: s.cost + cost });
      }
    };
    const c = surface[i];
    if (isKanaChar(c)) {
      push(i + 1, toHiragana(c), 0);
      continue;
    }
    let matched = false;
    for (let len = Math.min(dict.maxLen, n - i); len >= 1; len--) {
      const readings = dict.map.get(surface.slice(i, i + len));
      if (!readings) continue;
      matched = true;
      const single = len === 1;
      readings.forEach((rd, k) => {
        // 長い語でまとめて読めるほど・よく使う読みほどよい
        const base = 10 + k * (single ? 1 : 0.3);
        const vs = single ? variants(rd, i === 0, i + 1 === n) : [rd];
        vs.forEach((v, vi) => push(i + len, v, base + vi * 2));
      });
    }
    // 辞書にない文字（記号・数字など）はそのまま
    if (!matched) push(i + 1, c, 0);
  }
  const done = states[n].filter((s) => s.r.startsWith(p));
  if (!done.length) return null;
  if (p && done.some((s) => s.r === p)) return p;
  done.sort((a, b) => a.cost - b.cost || a.r.length - b.r.length);
  return done[0].r;
}
