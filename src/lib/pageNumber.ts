// プリントに印刷されたページ番号（「- 3 -」「p.12」「5/8」「12ページ」など）を読み取り、ページを番号順に並べる。
// 読み取りは画像の上下の余白だけを対象にする（本文中の数字や問題番号を拾わないため）。

/** 全角の数字・記号を半角にする */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９Ａ-Ｚａ-ｚ．／－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

const DASH = '\\-－—–ー―‐~〜・';
/** ページ番号の書き方（1つ目のかっこが番号） */
const PATTERNS: RegExp[] = [
  // 「3」「- 3 -」「— 12 —」「~5~」
  new RegExp(`^[${DASH}\\s]*(\\d{1,3})[${DASH}\\s]*$`),
  // 「p.12」「P12」「pp.12」「page 3」
  /^(?:p{1,2}|page)\s*\.?\s*(\d{1,3})$/i,
  // 「12ページ」「12頁」「12p」「第3ページ」
  /^第?\s*(\d{1,3})\s*(?:ページ|ﾍﾟｰｼﾞ|頁|p\.?)$/i,
  // 「5/8」「5 / 8」「5of8」（全体のページ数つき）
  /^(\d{1,3})\s*(?:\/|of)\s*\d{1,3}$/i,
  // 「(3)」はページ番号より問題番号のことが多いので扱わない
];

/** 1行（またはその一部）がページ番号だけでできていれば番号を返す */
export function parsePageNumberText(text: string): number | null {
  const s = toHalfWidth(text).replace(/[\s　]+/g, ' ').trim();
  if (!s || s.length > 14) return null;
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 999) return n;
  }
  return null;
}

/**
 * 余白の行（端に近い順）からページ番号を探す。
 * 行全体がページ番号でなければ、行の左端・右端にある区切られた語（「数学Ⅰ　12」の「12」）も見る。
 */
export function findPageNumber(lines: string[]): number | null {
  // 行全体がページ番号のものを優先
  for (const l of lines) {
    const n = parsePageNumberText(l);
    if (n != null) return n;
  }
  for (const l of lines) {
    const words = toHalfWidth(l).trim().split(/[\s　]{2,}|\s*[|｜]\s*/).filter(Boolean);
    if (words.length < 2) continue;
    for (const w of [words[words.length - 1], words[0]]) {
      // 端の語だけの場合は、数字以外の印（p. や -）がついたものだけ（「2年」「3組」の数字を拾わないため）
      if (/^\d+$/.test(w.trim())) continue;
      const n = parsePageNumberText(w);
      if (n != null) return n;
    }
  }
  return null;
}

/**
 * 読み取った番号（読み取れなければ null）から、番号順に並べた順番（元の位置の配列）を作る。
 * 番号のないページは、直前のページ（表のページの裏など）にくっついたまま動く。先頭の番号のないページ（表紙など）は先頭のまま。
 * 番号が2つ以上読み取れないとき・すでに番号順のときは null（並べ替えない）。
 */
export function orderByPageNumbers(numbers: (number | null)[]): number[] | null {
  if (numbers.filter((n) => n != null).length < 2) return null;
  const head: number[] = [];
  const groups: { n: number; at: number; members: number[] }[] = [];
  numbers.forEach((n, i) => {
    if (n != null) groups.push({ n, at: i, members: [i] });
    else if (groups.length) groups[groups.length - 1].members.push(i);
    else head.push(i);
  });
  const sorted = [...groups].sort((a, b) => a.n - b.n || a.at - b.at);
  const order = [...head, ...sorted.flatMap((g) => g.members)];
  return order.every((v, i) => v === i) ? null : order;
}
