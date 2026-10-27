// 画像から回答欄（罫線で囲まれた空欄・下線の空欄）を検出する純粋関数。
// 手順：適応的二値化 → 長い水平・垂直線だけを取り出す → 線で囲まれた領域のうち、中が空白の長方形を回答欄とする。
// 下線だけの欄（＿＿＿）は、上側が空白の単独の水平線として検出する。

export interface GrayImage {
  width: number;
  height: number;
  /** 0〜255 のグレースケール */
  data: Uint8Array;
}

export interface AnswerField {
  /** 文字を書ける範囲（画像座標）。囲み欄は枠の内側、下線欄は線の上側 */
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'box' | 'underline';
  /** 縦長の欄（縦書き向き） */
  vertical: boolean;
}

export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    // 透明部分は白（紙）として扱う
    const a = rgba[j + 3] / 255;
    const g = rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114;
    data[i] = Math.round(g * a + 255 * (1 - a));
  }
  return { width, height, data };
}

/** 2次元の累積和（(w+1)×(h+1)） */
function integral(w: number, h: number, value: (i: number) => number): Float64Array {
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += value(y * w + x);
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  return sum;
}

function rectSum(sum: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  // [x0, x1) × [y0, y1)
  const W = w + 1;
  return sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
}

/** 写真のざらつきの大きさ（隣り合う画素の差の中央値から推定した標準偏差） */
function noiseLevel(img: GrayImage): number {
  const { width: w, height: h, data } = img;
  const hist = new Uint32Array(256);
  let n = 0;
  const step = Math.max(1, Math.floor((w * h) / 200000));
  for (let i = 0; i < w * h - 1; i += step) {
    if ((i + 1) % w === 0) continue;
    hist[Math.abs(data[i] - data[i + 1])]++;
    n++;
  }
  let acc = 0;
  for (let d = 0; d < 256; d++) {
    acc += hist[d];
    if (acc * 2 >= n) return d / 0.954; // |N(0,σ)-N(0,σ)| の中央値 ≒ 0.954σ
  }
  return 0;
}

/** 周囲より暗い画素（インク）。写真の明るさむらに強い適応的二値化。ざらつきの点は取り除く */
function inkMask(img: GrayImage): Uint8Array {
  const { width: w, height: h, data } = img;
  const r = Math.max(7, Math.round(Math.max(w, h) / 80));
  const sum = integral(w, h, (i) => data[i]);
  // ざらつきが大きい写真では、ノイズをインクと見なさないよう差のしきい値を上げる
  const noise = Math.min(30, noiseLevel(img) * 2.5);
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const mean = rectSum(sum, w, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
      const g = data[y * w + x];
      // 塗りつぶし部分は周囲との差が出ないため、十分に暗ければインクとする
      if (g < 90 || (g < 235 && g < mean - Math.max(14, mean * 0.12, noise))) ink[y * w + x] = 1;
    }
  }
  // 数画素だけの孤立した点（ざらつき・ごみ）を消す
  for (const c of components(ink, w, h, 1)) {
    if (c.area > 3) continue;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) ink[y * w + x] = 0;
  }
  return ink;
}

/** 写真の傾き（度）。インクを各角度で横方向に投影し、行や罫線が最もくっきり揃う角度を選ぶ */
function estimateSkew(ink: Uint8Array, w: number, h: number): number {
  let count = 0;
  for (let i = 0; i < ink.length; i++) count += ink[i];
  if (count < 50) return 0;
  const step = Math.max(1, Math.floor(count / 150000));
  const xs = new Float32Array(Math.ceil(count / step));
  const ys = new Float32Array(xs.length);
  let n = 0;
  for (let i = 0, k = 0; i < ink.length; i++) {
    if (!ink[i] || k++ % step) continue;
    xs[n] = (i % w) - w / 2;
    ys[n] = Math.floor(i / w) - h / 2;
    n++;
  }
  const size = Math.ceil(Math.hypot(w, h)) + 2;
  const hist = new Float64Array(size);
  const off = size / 2;
  const score = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    hist.fill(0);
    for (let i = 0; i < n; i++) hist[Math.floor(ys[i] * c - xs[i] * s + off)]++;
    let v = 0;
    for (let i = 0; i < size; i++) v += hist[i] * hist[i];
    return v;
  };
  let best = 0;
  let bestScore = score(0);
  const search = (from: number, to: number, by: number) => {
    for (let a = from; a <= to + 1e-9; a += by) {
      const v = score(a);
      if (v > bestScore) (bestScore = v), (best = a);
    }
  };
  search(-6, 6, 0.3);
  const center = best;
  search(center - 0.3, center + 0.3, 0.05);
  return best;
}

/** 画像を deg 度回して傾きを打ち消す（大きさはそのまま）。はみ出た部分は端の画素を伸ばす */
function rotate(img: GrayImage, deg: number): GrayImage {
  const { width: w, height: h, data } = img;
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const out = new Uint8Array(w * h);
  for (let v = 0; v < h; v++) {
    const dv = v - h / 2;
    for (let u = 0; u < w; u++) {
      const du = u - w / 2;
      const x = Math.min(w - 1.001, Math.max(0, du * c - dv * s + w / 2));
      const y = Math.min(h - 1.001, Math.max(0, du * s + dv * c + h / 2));
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const i = y0 * w + x0;
      const a = data[i] * (1 - fx) + data[i + 1] * fx;
      const b = data[i + w] * (1 - fx) + data[i + w + 1] * fx;
      out[v * w + u] = Math.round(a * (1 - fy) + b * fy);
    }
  }
  return { width: w, height: h, data: out };
}

/** 一定以上の長さで続くインクの並び（途切れは gap 画素まで許容）を線として取り出す。
 *  線の両端は extend 画素だけ延ばし、角のすき間を閉じる */
function runMask(
  ink: Uint8Array,
  w: number,
  h: number,
  horizontal: boolean,
  minLen: number,
  gap: number,
  extend = 0,
): Uint8Array {
  const out = new Uint8Array(w * h);
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const at = horizontal ? (l: number, i: number) => l * w + i : (l: number, i: number) => i * w + l;
  for (let l = 0; l < lines; l++) {
    let start = -1;
    let last = -1;
    const flush = () => {
      if (start < 0 || last - start + 1 < minLen) return;
      const a = Math.max(0, start - extend);
      const b = Math.min(len - 1, last + extend);
      for (let i = a; i <= b; i++) out[at(l, i)] = 1;
    };
    for (let i = 0; i < len; i++) {
      if (!ink[at(l, i)]) continue;
      if (start < 0 || i - last > gap + 1) {
        flush();
        start = i;
      }
      last = i;
    }
    flush();
  }
  return out;
}

function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

interface Component {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  border: boolean;
}

/** value が一致する画素の連結成分（4近傍）。成分ごとに外接矩形・面積を返す */
function components(mask: Uint8Array, w: number, h: number, value: 0 | 1): Component[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Component[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (seen[s] || mask[s] !== value) continue;
    let top = 0;
    stack[top++] = s;
    seen[s] = 1;
    const c: Component = { x0: w, y0: h, x1: -1, y1: -1, area: 0, border: false };
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.border = true;
      if (x > 0 && !seen[i - 1] && mask[i - 1] === value) (seen[i - 1] = 1), (stack[top++] = i - 1);
      if (x < w - 1 && !seen[i + 1] && mask[i + 1] === value) (seen[i + 1] = 1), (stack[top++] = i + 1);
      if (y > 0 && !seen[i - w] && mask[i - w] === value) (seen[i - w] = 1), (stack[top++] = i - w);
      if (y < h - 1 && !seen[i + w] && mask[i + w] === value) (seen[i + w] = 1), (stack[top++] = i + w);
    }
    out.push(c);
  }
  return out;
}

function overlaps(a: AnswerField, b: { x: number; y: number; width: number; height: number }, margin = 0): boolean {
  return (
    a.x - margin < b.x + b.width && b.x < a.x + a.width + margin && a.y - margin < b.y + b.height && b.y < a.y + a.height + margin
  );
}

export function detectAnswerFields(img: GrayImage): AnswerField[] {
  const { width: w, height: h } = img;
  if (w < 16 || h < 16) return [];
  const ink = inkMask(img);
  // 傾いた写真は、まっすぐに直してから探し、見つかった欄を元の向きの座標に戻す
  const skew = estimateSkew(ink, w, h);
  if (Math.abs(skew) < 0.2) return detectUpright(img, ink);
  const upright = rotate(img, skew);
  const t = (skew * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return detectUpright(upright, inkMask(upright)).map((f) => {
    const du = f.x + f.width / 2 - w / 2;
    const dv = f.y + f.height / 2 - h / 2;
    const cx = du * c - dv * s + w / 2;
    const cy = du * s + dv * c + h / 2;
    return { ...f, x: cx - f.width / 2, y: cy - f.height / 2 };
  });
}

function detectUpright(img: GrayImage, ink: Uint8Array): AnswerField[] {
  const { width: w, height: h } = img;
  const long = Math.max(w, h);
  const inkSum = integral(w, h, (i) => ink[i]);
  const inkIn = (x0: number, y0: number, x1: number, y1: number) => rectSum(inkSum, w, x0, y0, x1, y1);

  const minH = Math.max(15, Math.round(long * 0.02));
  const minV = Math.max(10, Math.round(long * 0.012));
  // かすれ・途切れた線もつなげる
  const gap = Math.max(2, Math.round(long * 0.004));
  const hMask = runMask(ink, w, h, true, minH, gap, gap);
  const vMask = runMask(ink, w, h, false, minV, gap, gap);
  const lines = new Uint8Array(w * h);
  for (let i = 0; i < lines.length; i++) lines[i] = hMask[i] | vMask[i];
  const walls = dilate(lines, w, h);

  const fields: AnswerField[] = [];
  const minSide = Math.max(8, Math.round(long * 0.012));

  // ===== 罫線で囲まれた空欄 =====
  for (const c of components(walls, w, h, 0)) {
    if (c.border) continue;
    const bw = c.x1 - c.x0 + 1;
    const bh = c.y1 - c.y0 + 1;
    if (bw < minSide || bh < minSide) continue;
    if (bw * bh > w * h * 0.2) continue;
    if (c.area / (bw * bh) < 0.85) continue; // 長方形でない
    if (bw / bh > 40 || bh / bw > 15) continue;

    const vertical = bh > bw * 1.8;
    // 内側（枠の際のにじみを除く）
    const m = Math.max(2, Math.round(Math.min(bw, bh) * 0.1));
    const ix0 = c.x0 + m;
    const iy0 = c.y0 + m;
    const ix1 = c.x1 + 1 - m;
    const iy1 = c.y1 + 1 - m;
    if (ix1 - ix0 < 3 || iy1 - iy0 < 3) continue;
    const area = (ix1 - ix0) * (iy1 - iy0);
    const total = inkIn(ix0, iy0, ix1, iy1);

    let start = 0; // 欄の先頭にある小さな番号（(1)・①など）を避けて書き始める位置
    if (total > area * 0.01) {
      // 番号は横長の欄なら左、縦長の欄なら上にあるとみなす。
      // 細長い欄だけが対象（表のマスに短い文字が入っている場合は、記入済みの欄として扱う）
      const thin = vertical ? Math.min(bw, bh) : bh;
      const long_ = vertical ? bh : bw;
      if (long_ < thin * 3.5) continue;
      const span = vertical ? iy1 - iy0 : ix1 - ix0;
      const slice = (a: number, b: number) =>
        vertical ? inkIn(ix0, iy0 + a, ix1, iy0 + b) : inkIn(ix0 + a, iy0, ix0 + b, iy1);
      let cut = -1;
      for (let s = Math.round(span * 0.05); s <= span * 0.3; s++) {
        if (slice(s, span) <= area * 0.003) {
          cut = s;
          break;
        }
      }
      if (cut < 0) continue; // 文字が書かれている欄
      start = cut + Math.max(4, Math.round(Math.min(bw, bh) * 0.2));
    }
    fields.push(
      vertical
        ? { x: c.x0, y: c.y0 + start, width: bw, height: bh - start, kind: 'box', vertical }
        : { x: c.x0 + start, y: c.y0, width: bw - start, height: bh, kind: 'box', vertical },
    );
  }

  // ===== 下線だけの欄 =====
  const maxThick = Math.max(4, Math.round(long * 0.006));
  const minLen = Math.max(minH * 1.5, long * 0.04);
  const hSum = integral(w, h, (i) => hMask[i]);
  const vSum = integral(w, h, (i) => vMask[i]);
  // 同じ高さで途切れた線のかけらを1本にまとめる
  const segs = components(hMask, w, h, 1)
    .filter((c) => c.y1 - c.y0 + 1 <= maxThick)
    .sort((a, b) => a.x0 - b.x0);
  const merged: Component[] = [];
  for (const c of segs) {
    const prev = merged.find(
      (p) => c.x0 - p.x1 <= gap * 3 && Math.abs((c.y0 + c.y1) / 2 - (p.y0 + p.y1) / 2) <= maxThick / 2,
    );
    if (prev && Math.max(prev.y1, c.y1) - Math.min(prev.y0, c.y0) + 1 <= maxThick) {
      prev.x1 = Math.max(prev.x1, c.x1);
      prev.y0 = Math.min(prev.y0, c.y0);
      prev.y1 = Math.max(prev.y1, c.y1);
    } else merged.push({ ...c });
  }
  for (const c of merged) {
    const lw = c.x1 - c.x0 + 1;
    if (lw < minLen || lw > w * 0.7) continue;
    // 両端に縦線がある（＝枠の一部）なら対象外。
    // 線の端は延ばしてあるので、元の端の内側だけを見る（隣の文字の縦画を拾わないように）
    const vAt = (xa: number, xb: number) =>
      rectSum(vSum, w, Math.max(0, xa), Math.max(0, c.y0 - minV), Math.min(w, xb), Math.min(h, c.y1 + minV + 1)) >= minV;
    if (vAt(c.x0, c.x0 + gap * 2 + 3) || vAt(c.x1 - gap * 2 - 2, c.x1 + 1)) continue;
    // すぐ上か下に平行な線がある（二重線の飾り罫・枠の辺）なら対象外
    const near = Math.round(maxThick * 1.2);
    const parallel = (y0: number, y1: number) =>
      y1 > y0 && rectSum(hSum, w, c.x0, Math.max(0, y0), c.x1 + 1, Math.min(h, y1)) > lw * 0.5;
    if (parallel(c.y0 - near, c.y0 - 1) || parallel(c.y1 + 2, c.y1 + 1 + near)) continue;
    const ah = Math.round(Math.min(Math.max(lw * 0.3, long * 0.018), long * 0.035));
    const y0 = c.y0 - ah;
    if (y0 < 0) continue;
    const pad = Math.max(2, Math.round(ah * 0.1));
    const area = lw * (ah - pad);
    if (inkIn(c.x0, y0, c.x1 + 1, c.y0 - pad) > area * 0.006) continue; // 線の上に文字がある（傍線など）
    // 延ばした分を除いた、元の線の長さ
    const f: AnswerField = { x: c.x0 + gap, y: y0, width: lw - gap * 2, height: ah, kind: 'underline', vertical: false };
    if (fields.some((b) => overlaps(f, b, 2))) continue;
    fields.push(f);
  }

  // 上から下、左から右の順
  const rowTol = long * 0.01;
  return fields.sort((a, b) => (Math.abs(a.y - b.y) > rowTol ? a.y - b.y : a.x - b.x));
}
