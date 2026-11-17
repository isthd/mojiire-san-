// 「自動変換」：ひらがなを漢字かな混じりに変換する（アプリの中だけで動く、かんたんなかな漢字変換）。
// 辞書は IPADIC から作ったもの（scripts/build-kanakanji-dict.mjs、public/kanakanji/）。
// 読みの並びに辞書の語を当てはめ、語のコストと語のつながりのコストの合計が最も小さい分け方を選ぶ（ビタビ法）。
// 辞書（約 2MB、圧縮時）は大きいので、自動変換を使うときに読み込む。一度読み込めばオフラインでも使える。

export interface KKEntry {
  /** 表記 */
  s: string;
  /** 語のコスト（小さいほどよく使う） */
  c: number;
  /** 左文脈 ID */
  l: number;
  /** 右文脈 ID */
  r: number;
}

export interface KKDict {
  raw: Map<string, string>;
  parsed: Map<string, KKEntry[]>;
  maxLen: number;
  n: number;
  conn: Int8Array;
}

/** 連接コストの倍率（scripts/build-kanakanji-dict.mjs の STEP と同じ） */
const STEP = 100;
/** 辞書にないひらがな1文字のコスト（名詞・一般として扱う） */
const UNK = { c: 13069 + 4000, l: 1285, r: 1285 };

let dict: KKDict | null = null;
let loading: Promise<KKDict> | null = null;

export function parseKanaKanjiDict(text: string, conn: ArrayBuffer): KKDict {
  const raw = new Map<string, string>();
  let maxLen = 1;
  let i = 0;
  while (i < text.length) {
    let nl = text.indexOf('\n', i);
    if (nl < 0) nl = text.length;
    const tab = text.indexOf('\t', i);
    if (tab > i && tab < nl) {
      const key = text.slice(i, tab);
      raw.set(key, text.slice(tab + 1, nl));
      if (key.length > maxLen) maxLen = key.length;
    }
    i = nl + 1;
  }
  const dv = new DataView(conn);
  const n = dv.getUint16(0, true);
  return { raw, parsed: new Map(), maxLen, n, conn: new Int8Array(conn, 2, n * n) };
}

export function loadKanaKanjiDict(): Promise<KKDict> {
  if (dict) return Promise.resolve(dict);
  loading ??= (async () => {
    const base = import.meta.env.BASE_URL ?? '/';
    const [t, b] = await Promise.all([
      fetch(`${base}kanakanji/dict.txt`).then((r) => {
        if (!r.ok) throw new Error(`dict ${r.status}`);
        return r.text();
      }),
      fetch(`${base}kanakanji/conn.bin`).then((r) => {
        if (!r.ok) throw new Error(`conn ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);
    return (dict = parseKanaKanjiDict(t, b));
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** テスト用：辞書を直接設定する */
export function setKanaKanjiDict(d: KKDict | null) {
  dict = d;
  loading = null;
}

export function isKanaKanjiDictLoaded() {
  return !!dict;
}

function lookup(d: KKDict, reading: string): KKEntry[] | undefined {
  let es = d.parsed.get(reading);
  if (es) return es;
  const line = d.raw.get(reading);
  if (line === undefined) return undefined;
  es = line.split('|').map((x) => {
    const [s, c, l, r] = x.split(' ');
    return { s: s || reading, c: +c, l: +l, r: +r };
  });
  d.parsed.set(reading, es);
  return es;
}

const connCost = (d: KKDict, r: number, l: number) => d.conn[r * d.n + l] * STEP;

export interface KKSegment {
  /** 読み（ひらがな） */
  reading: string;
  /** 表記 */
  surface: string;
}

type Node = { r: number; cost: number; prev: Node | null; seg: KKSegment | null };

/** 変換できる文字（ひらがな・長音）だけか */
export const isConvertible = (s: string) => /^[ぁ-ゖー]+$/.test(s);

/**
 * ひらがなを、いちばんよい漢字かな混じりの分け方にする。辞書を読み込む前は null。
 */
export function convertBest(kana: string): KKSegment[] | null {
  const d = dict;
  if (!d || !kana) return null;
  const n = kana.length;
  const ends: Node[][] = Array.from({ length: n + 1 }, () => []);
  ends[0].push({ r: 0, cost: 0, prev: null, seg: null });
  for (let i = 0; i < n; i++) {
    const from = ends[i];
    if (!from.length) continue;
    const add = (len: number, e: { s: string; c: number; l: number; r: number }) => {
      let best: Node | null = null;
      let bc = Infinity;
      for (const p of from) {
        const c = p.cost + connCost(d, p.r, e.l) + e.c;
        if (c < bc) {
          bc = c;
          best = p;
        }
      }
      ends[i + len].push({ r: e.r, cost: bc, prev: best, seg: { reading: kana.slice(i, i + len), surface: e.s } });
    };
    for (let len = 1; len <= Math.min(d.maxLen, n - i); len++) {
      const es = lookup(d, kana.slice(i, i + len));
      if (es) for (const e of es) add(len, e);
    }
    add(1, { s: kana[i], ...UNK });
  }
  let best: Node | null = null;
  let bc = Infinity;
  for (const p of ends[n]) {
    const c = p.cost + connCost(d, p.r, 0);
    if (c < bc) {
      bc = c;
      best = p;
    }
  }
  const out: KKSegment[] = [];
  for (let p = best; p?.seg; p = p.prev) out.unshift(p.seg);
  // 続けてひらがなのままの語はまとめる（読みの記録を減らすため）
  const merged: KKSegment[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.reading === last.surface && s.reading === s.surface) {
      last.reading += s.reading;
      last.surface += s.surface;
    } else merged.push({ ...s });
  }
  return merged;
}

export interface KKCandidate {
  /** 表記全体 */
  text: string;
  segments: KKSegment[];
}

const toKatakana = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/**
 * 変換の候補。いちばんよい変換、読み全体が1語になるもの、最初の語を別の漢字にしたもの、ひらがな・カタカナの順。
 */
export function candidates(kana: string, limit = 24): KKCandidate[] {
  const d = dict;
  const out: KKCandidate[] = [];
  const seen = new Set<string>();
  const push = (segments: KKSegment[]) => {
    const text = segments.map((s) => s.surface).join('');
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push({ text, segments });
  };
  const best = d ? convertBest(kana) : null;
  if (best) push(best);
  if (d) {
    // 読み全体で1語
    const whole = lookup(d, kana);
    if (whole) for (const e of [...whole].sort((a, b) => a.c - b.c)) push([{ reading: kana, surface: e.s }]);
    // 最初の語だけ別の表記にする（同じ読みのほかの語）
    if (best && best.length > 1) {
      const first = best[0];
      const rest = best.slice(1);
      const alt = lookup(d, first.reading);
      if (alt) for (const e of [...alt].sort((a, b) => a.c - b.c)) push([{ reading: first.reading, surface: e.s }, ...rest]);
    }
  }
  // ひらがな・カタカナはいつも候補に残す
  out.splice(Math.max(1, limit - 2));
  push([{ reading: kana, surface: kana }]);
  push([{ reading: kana, surface: toKatakana(kana) }]);
  return out;
}
