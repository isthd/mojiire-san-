// 縦書きテキストのレイアウト（純粋関数）。列は右から左へ、文字は上から下へ並べる。

export interface VerticalLayoutInput {
  text: string;
  fontSize: number;
  /** 文字の間隔（フォントサイズに対する比率） */
  letterSpacing: number;
  /** 行（列）の間隔（フォントサイズに対する倍率） */
  lineHeight: number;
  padding: number;
  /** left=上揃え, center=中央, right=下揃え */
  align: 'left' | 'center' | 'right';
}

export interface VerticalGlyph {
  ch: string;
  /** 文字セルの中心（オブジェクト原点からの相対座標） */
  cx: number;
  cy: number;
  /** 90度回転して描く（長音・括弧・ダッシュなど） */
  rotate: boolean;
}

export interface VerticalLayout {
  glyphs: VerticalGlyph[];
  width: number;
  height: number;
}

// 縦書きで90度回転させる文字
const ROTATE = new Set([...'ー－—―‐-~〜～…‥（）()「」『』【】［］[]｛｝{}〈〉《》<>＜＞→←＝=_|｜：:；;']);
// 句読点は文字セルの右上へ
const PUNCT = new Set([...'、。，．,.']);
// 小書きの仮名は少し右上へ
const SMALL = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ']);

export function punctuationOffset(ch: string, fontSize: number): { dx: number; dy: number } {
  if (PUNCT.has(ch)) return { dx: fontSize * 0.5, dy: -fontSize * 0.5 };
  if (SMALL.has(ch)) return { dx: fontSize * 0.1, dy: -fontSize * 0.1 };
  return { dx: 0, dy: 0 };
}

export function layoutVertical(input: VerticalLayoutInput): VerticalLayout {
  const { fontSize: fs, padding } = input;
  const columns = (input.text || ' ').split('\n').map((line) => [...line]);
  const colW = fs * input.lineHeight;
  const advance = fs * (1 + input.letterSpacing);
  const maxRows = Math.max(1, ...columns.map((c) => c.length));
  const contentH = maxRows * advance - fs * input.letterSpacing;
  const width = columns.length * colW + padding * 2;
  const height = contentH + padding * 2;
  const k = input.align === 'center' ? 0.5 : input.align === 'right' ? 1 : 0;

  const glyphs: VerticalGlyph[] = [];
  columns.forEach((col, ci) => {
    const cx = width - padding - colW * ci - colW / 2;
    const colH = Math.max(0, col.length * advance - fs * input.letterSpacing);
    const top = padding + (contentH - colH) * k;
    col.forEach((ch, ri) => {
      if (ch === ' ' || ch === '　') return;
      glyphs.push({ ch, cx, cy: top + ri * advance + fs / 2, rotate: ROTATE.has(ch) });
    });
  });
  return { glyphs, width, height };
}
