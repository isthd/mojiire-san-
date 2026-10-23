// 画面座標（キャンバス領域左上基準のCSS px）と画像座標の変換、および描画補助の純粋関数群。

export interface Point {
  x: number;
  y: number;
}

/** ビュー: 画像座標 p は画面上 (p * zoom + offset) に表示される */
export interface View {
  zoom: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function screenToImage(p: Point, v: View): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
}

export function imageToScreen(p: Point, v: View): Point {
  return { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y };
}

/** 画面上の点 center を固定したままズーム倍率を変更 */
export function zoomAt(v: View, newZoom: number, center: Point): View {
  const z = clampZoom(newZoom);
  const img = screenToImage(center, v);
  return { zoom: z, x: center.x - img.x * z, y: center.y - img.y * z };
}

/** 画像全体が収まるビュー */
export function fitView(containerW: number, containerH: number, imgW: number, imgH: number, margin = 24): View {
  const availW = Math.max(1, containerW - margin * 2);
  const availH = Math.max(1, containerH - margin * 2);
  const zoom = clampZoom(Math.min(availW / imgW, availH / imgH));
  return { zoom, x: (containerW - imgW * zoom) / 2, y: (containerH - imgH * zoom) / 2 };
}

/**
 * 角度スナップ。
 * force=true（Shiftキー）なら step 度刻みに固定。
 * それ以外は水平・垂直付近（threshold度以内）のみ吸着。
 */
export function snapAngle(start: Point, end: Point, force: boolean, step = 15, threshold = 4): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return end;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  let target: number | null = null;
  if (force) {
    target = Math.round(deg / step) * step;
  } else {
    const nearest = Math.round(deg / 90) * 90;
    if (Math.abs(deg - nearest) <= threshold) target = nearest;
  }
  if (target === null) return end;
  const rad = (target * Math.PI) / 180;
  return { x: start.x + Math.cos(rad) * len, y: start.y + Math.sin(rad) * len };
}

/** 2点から矩形（正規化済み）。square=true で正方形に */
export function rectFromPoints(
  a: Point,
  b: Point,
  square: boolean,
): { x: number; y: number; width: number; height: number } {
  let w = b.x - a.x;
  let h = b.y - a.y;
  if (square) {
    const s = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * s;
    h = Math.sign(h || 1) * s;
  }
  return {
    x: Math.min(a.x, a.x + w),
    y: Math.min(a.y, a.y + h),
    width: Math.abs(w),
    height: Math.abs(h),
  };
}

function perpDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker による点列の間引き（flat配列） */
export function simplifyPoints(flat: number[], tolerance: number): number[] {
  const n = flat.length / 2;
  if (n <= 2) return flat.slice();
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: flat[i * 2], y: flat[i * 2 + 1] });
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tolerance) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i].x, pts[i].y);
  return out;
}
