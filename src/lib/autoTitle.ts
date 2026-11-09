// 読み取ったプリントの文字から、タイトル（プロジェクトの名前）を推定する。

/** 読み取った文字のかたまり（座標はページ上。y は上から下へ増える） */
export interface TextBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 1行分の文字 */
export interface TextLine {
  text: string;
  /** 文字の大きさの目安（行の高さ） */
  size: number;
  /** 行の上端 */
  top: number;
}

const JA = /[　-ヿ一-鿿＀-￯]/;

/** 同じ高さに並んだかたまりを1行にまとめ、上から順に並べる */
export function groupIntoLines(boxes: TextBox[]): TextLine[] {
  const sorted = boxes.filter((b) => b.text.trim()).sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const lines: { boxes: TextBox[]; center: number; height: number }[] = [];
  for (const b of sorted) {
    const c = b.y + b.height / 2;
    const line = lines.find((l) => Math.abs(l.center - c) < Math.max(l.height, b.height) * 0.5);
    if (line) {
      line.boxes.push(b);
      line.height = Math.max(line.height, b.height);
    } else lines.push({ boxes: [b], center: c, height: b.height });
  }
  return lines
    .map((l) => {
      const parts = l.boxes.sort((a, b) => a.x - b.x).map((b) => b.text.trim());
      // 日本語どうしはそのままつなげ、英数字のあいだは空白を入れる
      let text = '';
      for (const p of parts) {
        if (text && !(JA.test(text.at(-1)!) && JA.test(p[0]))) text += ' ';
        text += p;
      }
      return { text, size: l.height, top: Math.min(...l.boxes.map((b) => b.y)) };
    })
    .sort((a, b) => a.top - b.top);
}

/** タイトルの後ろに続く記入欄（「2年 組 番 氏名」など）を取り除く */
export function stripNameFields(line: string): string {
  return line
    // 「2年 組」「（ ）年（ ）組」など
    .replace(/[\s　]*[(（]?[\s　0-9０-９]*[)）]?[\s　]*年[\s　]*[(（]?[\s　0-9０-９]*[)）]?[\s　]*組.*$/, '')
    .replace(/[\s　]+(組|番|番号|氏名|名前|なまえ)([\s　:：_＿(（].*)?$/, '')
    .replace(/[\s　_＿]+$/, '')
    .trim();
}

/** タイトルになりそうにない行（記入欄・日付・ページ番号・問題番号・記号だけ） */
function isNoise(s: string): boolean {
  if (s.length < 3 || s.length > 40) return true;
  if (/^(氏名|名前|なまえ|番号|得点|点数|評価|検印)/.test(s)) return true;
  if (/^(p\.?|page)?[0-9０-９\s/／\-－.．:：年月日()（）[\]［］〔〕]+$/i.test(s)) return true;
  if (/^(問\s*[0-9０-９一二三四五六七八九十]|第?\s*[0-9０-９]+\s*問|\(?[0-9０-９]+\)|[①-⑳]|[(（][0-9０-９]+[)）])/.test(s)) return true;
  // 文字（かな・漢字・英字）が少ない
  const letters = s.match(/[\p{L}]/gu)?.length ?? 0;
  return letters < 2 || letters / s.length < 0.4;
}

/**
 * 先頭付近の行からタイトルを選ぶ。
 * 上から数行のうち、記入欄などを除いて、文字がいちばん大きい行（同じなら上の行）。見つからなければ null。
 */
export function guessTitle(lines: TextLine[], lookAhead = 8): string | null {
  const candidates: TextLine[] = [];
  for (const l of lines) {
    const text = stripNameFields(l.text.replace(/[\s　]+/g, ' ').trim());
    if (isNoise(text)) continue;
    candidates.push({ ...l, text });
    if (candidates.length >= lookAhead) break;
  }
  if (!candidates.length) return null;
  let best = candidates[0];
  for (const c of candidates) if (c.size > best.size * 1.1) best = c;
  return best.text.slice(0, 40);
}

const JA_CHAR = '[\\u3000-\\u30ff\\u4e00-\\u9fff\\uff00-\\uffef]';
const JA_SPACE = new RegExp(`(${JA_CHAR}) +(?=${JA_CHAR}|[0-9])`, 'g');
const DIGIT_JA_SPACE = new RegExp(`([0-9]) +(?=${JA_CHAR})`, 'g');

/**
 * 文字認識の結果を整える。日本語の文字どうし・日本語と数字のあいだに入る空白と、句読点の前の空白を消す
 * （「漢 字 練 習 第 8 回」→「漢字練習第8回」。英単語のあいだの空白は残す）
 */
export function tidyOcrText(s: string): string {
  return s
    .replace(/[ \t　]+/g, ' ')
    .replace(JA_SPACE, '$1')
    .replace(DIGIT_JA_SPACE, '$1')
    .replace(/ (?=[.,。、．，!?！？)）」』])/g, '')
    .trim();
}
