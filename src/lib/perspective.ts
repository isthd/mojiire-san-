// 切り抜き・傾き補正の計算（四隅を指定して長方形に引き伸ばす「射影変換」）。
// 画面や Canvas に依存しない純粋な計算だけを置く。
import type { Point } from './geometry';

/** 四隅：左上・右上・右下・左下の順 */
export type Quad = [Point, Point, Point, Point];

/** 3x3 行列（行優先、最後の要素は 1 に正規化しなくてよい） */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** 単位正方形 (0,0)(1,0)(1,1)(0,1) → 四角形 q への射影変換 */
export function squareToQuad(q: Quad): Mat3 {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
  }
  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

export function applyMat(m: Mat3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

export function invertMat(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** 補正後の画像サイズ（向かい合う辺の長さの平均）。maxPixels を超える場合は縮小 */
export function outputSize(q: Quad, maxPixels = 15_000_000): { width: number; height: number } {
  let w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  let h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  if (w * h > maxPixels) {
    const k = Math.sqrt(maxPixels / (w * h));
    w *= k;
    h *= k;
  }
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/** 四角形の面積（符号つき：時計回り＝画像座標で正） */
export function quadArea(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** 凸で、向きが正しい（ねじれていない）四角形か */
export function isValidQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return sign > 0;
}

export function fullQuad(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

/** 傾いていない長方形（ただの切り抜き）なら、その範囲を返す */
export function axisAlignedRect(q: Quad, tol = 0.75): { x: number; y: number; width: number; height: number } | null {
  const [a, b, c, d] = q;
  const ok =
    Math.abs(a.y - b.y) <= tol && Math.abs(d.y - c.y) <= tol && Math.abs(a.x - d.x) <= tol && Math.abs(b.x - c.x) <= tol;
  if (!ok) return null;
  const x = Math.round((a.x + d.x) / 2);
  const y = Math.round((a.y + b.y) / 2);
  return { x, y, width: Math.round((b.x + c.x) / 2) - x, height: Math.round((d.y + c.y) / 2) - y };
}

// ---- 90° 回転（時計回りに k 回） ----

/** 回転後の画像サイズ */
export function rotatedSize(w: number, h: number, k: number): { width: number; height: number } {
  return k % 2 ? { width: h, height: w } : { width: w, height: h };
}

/** 元画像（w×h）の点を、時計回りに k×90° 回した画像での位置へ */
export function rotatePoint(p: Point, k: number, w: number, h: number): Point {
  switch (((k % 4) + 4) % 4) {
    case 1:
      return { x: h - p.y, y: p.x };
    case 2:
      return { x: w - p.x, y: h - p.y };
    case 3:
      return { x: p.y, y: w - p.x };
    default:
      return { x: p.x, y: p.y };
  }
}

/**
 * 元画像の点 → 補正後の画像の点（書き込みの位置を合わせるため）
 * rot: 90° 回転の回数、quad: 回転後の画像上の四隅、size: 補正後の画像サイズ
 */
export function makeForwardMap(
  srcW: number,
  srcH: number,
  rot: number,
  quad: Quad,
  size: { width: number; height: number },
): (p: Point) => Point {
  const inv = invertMat(squareToQuad(quad));
  return (p) => {
    const r = rotatePoint(p, rot, srcW, srcH);
    const u = applyMat(inv, r.x, r.y);
    return { x: u.x * size.width, y: u.y * size.height };
  };
}

/**
 * 射影変換で画像を引き伸ばす（双線形補間）。src は回転済みの画像のピクセル。
 * 長い処理なので、行ごとに区切って onRows で進み具合を知らせる（await で画面更新の余地を作る）。
 */
export async function warpPixels(
  src: { data: Uint8ClampedArray; width: number; height: number },
  quad: Quad,
  out: { data: Uint8ClampedArray; width: number; height: number },
  onRows?: (doneRows: number) => Promise<void> | void,
): Promise<void> {
  const m = squareToQuad(quad);
  const { width: W, height: H, data: o } = out;
  const { width: sw, height: sh, data: s } = src;
  const chunk = Math.max(1, Math.floor(400_000 / W));
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    // 1行の中では分子・分母が u について一次なので、足し算で進める
    const du = 1 / W;
    let u = 0.5 / W;
    let nx = m[0] * u + m[1] * v + m[2];
    let ny = m[3] * u + m[4] * v + m[5];
    let nw = m[6] * u + m[7] * v + m[8];
    const dnx = m[0] * du;
    const dny = m[3] * du;
    const dnw = m[6] * du;
    let oi = y * W * 4;
    for (let x = 0; x < W; x++, oi += 4, nx += dnx, ny += dny, nw += dnw) {
      const fx = nx / nw - 0.5;
      const fy = ny / nw - 0.5;
      let x0 = Math.floor(fx);
      let y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      if (x0 < -1 || y0 < -1 || x0 >= sw || y0 >= sh) {
        o[oi] = o[oi + 1] = o[oi + 2] = o[oi + 3] = 255;
        continue;
      }
      let x1 = x0 + 1;
      let y1 = y0 + 1;
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 >= sw) x1 = sw - 1;
      if (y1 >= sh) y1 = sh - 1;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      o[oi] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
      o[oi + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
      o[oi + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
      o[oi + 3] = 255;
    }
    if (onRows && (y + 1) % chunk === 0) await onRows(y + 1);
  }
  await onRows?.(H);
}
