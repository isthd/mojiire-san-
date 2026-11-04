// 回答欄に置く文字の大きさを決める純粋関数。
// 欄ごとの高さに合わせると、細い欄は極小・記述欄は特大になり大きさがばらつくため、
// 「設定の文字サイズを上限に、ページ内でそろえた大きさ」を使う。

/** 欄の短い辺に対して文字が占める割合（これ以上だと線に重なる） */
export const FIELD_FILL = 0.6;
/** ページ内でそろえた大きさから、欄が狭いときに縮めてよい下限の割合 */
export const FIELD_MIN_RATIO = 0.75;
/** 「完了」で文字が欄からはみ出すとき、縮めてよい下限の割合 */
export const OVERFLOW_MIN_RATIO = 0.7;

/** 欄の短い辺（横書きは高さ、縦書きは幅） */
export interface FieldExtent {
  /** 文字の大きさを決める辺の長さ（横書きの欄は高さ、縦書きの欄は幅） */
  cross: number;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * ページ内の欄すべてに使う文字サイズ。
 * 各欄に収まる大きさの中央値を、設定の文字サイズ（base）で頭打ちにする。
 */
export function pageFieldFontSize(fields: FieldExtent[], base: number): number {
  if (!fields.length) return base;
  return Math.min(base, median(fields.map((f) => f.cross * FIELD_FILL)));
}

/** 1つの欄の文字サイズ：そろえた大きさを基本に、欄が狭ければ少しだけ縮める */
export function fieldFontSize(f: FieldExtent, pageSize: number): number {
  return Math.max(pageSize * FIELD_MIN_RATIO, Math.min(pageSize, f.cross * FIELD_FILL));
}

/**
 * 「完了」時の文字サイズ。target の大きさで書いたときの長さ（length）が欄の長さ（room）を超えるときだけ、
 * 収まるように縮める（下限 OVERFLOW_MIN_RATIO）。収まるなら target のまま（短くしたら元に戻る）。
 */
export function fitOverflow(target: number, length: number, room: number): number {
  if (!(length > room) || room <= 0) return target;
  return Math.max(target * OVERFLOW_MIN_RATIO, target * (room / length));
}
