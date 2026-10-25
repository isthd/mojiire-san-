// 写真の中の「紙」の四隅を推定する。
// 紙は机より明るいことが多いので、明るさで二値化 → いちばん大きい明るい領域 → その四隅（端の点）を取る。
// 見つからない・自信がないときは null。
import type { Quad } from './perspective';

/** 大津の方法で、明るさのヒストグラムを2つに分けるしきい値 */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

/**
 * gray: 縮小した画像の明るさ（0〜255）、w×h。
 * 戻り値はこの縮小画像の座標。
 */
export function detectPaper(gray: Uint8Array, w: number, h: number): Quad | null {
  const t = otsuThreshold(gray);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) bright[i] = gray[i] > t ? 1 : 0;

  // 明るい領域ごとに番号を付けて、いちばん大きいものを探す
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let bestLabel = -1;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (!bright[start] || label[start] !== -1) continue;
    const id = next++;
    let sp = 0;
    let size = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp) {
      const i = stack[--sp];
      size++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of nb) {
        if (j < 0 || j >= w * h || !bright[j] || label[j] !== -1) continue;
        label[j] = id;
        stack[sp++] = j;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = id;
    }
  }
  if (bestLabel < 0 || bestSize < w * h * 0.15) return null;

  // 四隅：x+y が最小（左上）・最大（右下）、x−y が最大（右上）・最小（左下）
  let tl = 0, br = 0, tr = 0, bl = 0;
  let minS = Infinity, maxS = -Infinity, maxD = -Infinity, minD = Infinity;
  for (let i = 0; i < w * h; i++) {
    if (label[i] !== bestLabel) continue;
    const x = i % w;
    const y = (i - x) / w;
    const s = x + y;
    const d = x - y;
    if (s < minS) { minS = s; tl = i; }
    if (s > maxS) { maxS = s; br = i; }
    if (d > maxD) { maxD = d; tr = i; }
    if (d < minD) { minD = d; bl = i; }
  }
  // 画素の中心ではなく外側のふちに合わせる
  const pt = (i: number, ox: number, oy: number) => ({ x: (i % w) + ox, y: Math.floor(i / w) + oy });
  const q: Quad = [pt(tl, 0, 0), pt(tr, 1, 0), pt(br, 1, 1), pt(bl, 0, 1)];

  // 細長すぎる・小さすぎる四角形は紙ではないとみなす
  const area =
    Math.abs(
      (q[0].x * q[1].y - q[1].x * q[0].y) +
        (q[1].x * q[2].y - q[2].x * q[1].y) +
        (q[2].x * q[3].y - q[3].x * q[2].y) +
        (q[3].x * q[0].y - q[0].x * q[3].y),
    ) / 2;
  if (area < w * h * 0.2) return null;
  // 明るい領域が四角形をほぼ埋めていなければ（ぐちゃっとした形）採用しない
  if (bestSize < area * 0.8) return null;
  return q;
}
