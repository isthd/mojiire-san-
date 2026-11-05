// 画像から回答欄（罫線で囲まれた空欄・下線の空欄）を検出する純粋関数。
// 手順：適応的二値化 → 長い水平・垂直線だけを取り出す → 線で囲まれた領域のうち、中が空白の長方形を回答欄とする。
// 下線だけの欄（＿＿＿）は、上側が空白の単独の水平線として検出する。
// かっこの欄（〔　〕・（　））は、向かい合うかっこの組で中が空白のものを検出する（縦書きの ︹　︺・︵　︶ も）。
// 改行された欄（行の終わりで枠が切れて、次の行の頭に続く欄）は、片側だけ縦線で閉じた枠の組として検出する。

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
  kind: 'box' | 'underline' | 'bracket';
  /** 縦長の欄（縦書き向き） */
  vertical: boolean;
  /** 改行された欄の続き（次の行・次の列の頭の欄）。この欄に入りきらない文字をここへ続けて書く */
  next?: Rect;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
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

/** 線の向きと直角に測った太さが maxThick を超える部分（文字の行が並んだかたまり）を取り除く */
function thinOnly(mask: Uint8Array, w: number, h: number, horizontal: boolean, maxThick: number): Uint8Array {
  const out = mask.slice();
  const lines = horizontal ? w : h; // 太さを測る向きに走査する
  const len = horizontal ? h : w;
  const at = horizontal ? (l: number, i: number) => i * w + l : (l: number, i: number) => l * w + i;
  for (let l = 0; l < lines; l++) {
    let start = -1;
    for (let i = 0; i <= len; i++) {
      const on = i < len && mask[at(l, i)];
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (i - start > maxThick) for (let k = start; k < i; k++) out[at(l, k)] = 0;
        start = -1;
      }
    }
  }
  return out;
}

/**
 * 表の罫線（水平線・垂直線）。
 * 水平線は垂直線を除いたインクから探す（枠の縦線をまたいで、①の丸や文字の画とつながって線に見えるのを防ぐ）。
 * 垂直線も同様。文字の行が並んでできる太いかたまりは線にしない。端は gap だけ延ばして角のすき間を閉じる
 */
function ruleLines(ink: Uint8Array, w: number, h: number, minH: number, minV: number, gap: number, maxThick: number) {
  const hInit = thinOnly(runMask(ink, w, h, true, minH, gap), w, h, true, maxThick);
  const vInit = thinOnly(runMask(ink, w, h, false, minV, gap), w, h, false, maxThick);
  const without = (other: Uint8Array) => {
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = ink[i] & (other[i] ^ 1);
    return out;
  };
  const hThin = thinOnly(runMask(without(vInit), w, h, true, minH, gap), w, h, true, maxThick);
  const vThin = thinOnly(runMask(without(hInit), w, h, false, minV, gap), w, h, false, maxThick);
  return {
    hMask: runMask(hThin, w, h, true, minH, gap, gap),
    vMask: runMask(vThin, w, h, false, minV, gap, gap),
  };
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

/** value が一致する画素の連結成分（4近傍。eight なら斜めもつなぐ）。成分ごとに外接矩形・面積を返す。
 *  labels を渡すと、各画素に成分の番号＋1 を書き込む */
function components(
  mask: Uint8Array,
  w: number,
  h: number,
  value: 0 | 1,
  eight = false,
  labels?: Int32Array,
): Component[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Component[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (seen[s] || mask[s] !== value) continue;
    let top = 0;
    stack[top++] = s;
    seen[s] = 1;
    const id = out.length + 1;
    const c: Component = { x0: w, y0: h, x1: -1, y1: -1, area: 0, border: false };
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      c.area++;
      if (labels) labels[i] = id;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.border = true;
      if (x > 0 && !seen[i - 1] && mask[i - 1] === value) (seen[i - 1] = 1), (stack[top++] = i - 1);
      if (x < w - 1 && !seen[i + 1] && mask[i + 1] === value) (seen[i + 1] = 1), (stack[top++] = i + 1);
      if (y > 0 && !seen[i - w] && mask[i - w] === value) (seen[i - w] = 1), (stack[top++] = i - w);
      if (y < h - 1 && !seen[i + w] && mask[i + w] === value) (seen[i + w] = 1), (stack[top++] = i + w);
      if (eight) {
        for (const d of [-w - 1, -w + 1, w - 1, w + 1]) {
          const j = i + d;
          if (j < 0 || j >= mask.length || Math.abs((j % w) - x) !== 1) continue;
          if (!seen[j] && mask[j] === value) (seen[j] = 1), (stack[top++] = j);
        }
      }
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
  const back = <T extends Rect>(r: T): T => {
    const du = r.x + r.width / 2 - w / 2;
    const dv = r.y + r.height / 2 - h / 2;
    const cx = du * c - dv * s + w / 2;
    const cy = du * s + dv * c + h / 2;
    return { ...r, x: cx - r.width / 2, y: cy - r.height / 2 };
  };
  return detectUpright(upright, inkMask(upright)).map((f) => (f.next ? { ...back(f), next: back(f.next) } : back(f)));
}

/** 線の太さなどの目安（画像の大きさから決める） */
function lineParams(w: number, h: number) {
  const long = Math.max(w, h);
  return {
    long,
    minH: Math.max(15, Math.round(long * 0.02)),
    minV: Math.max(10, Math.round(long * 0.012)),
    // かすれ・途切れた線もつなげる
    gap: Math.max(2, Math.round(long * 0.004)),
    maxThick: Math.max(4, Math.round(long * 0.006)),
    minSide: Math.max(8, Math.round(long * 0.012)),
  };
}

/** 水平線のマスクから、細い水平線を取り出す。同じ高さで途切れた線のかけらは1本にまとめる */
function horizontalSegments(hMask: Uint8Array, w: number, h: number, maxThick: number, gap: number): Component[] {
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
  return merged;
}

/**
 * 改行された欄（横書き）：上下2本の線のうち、片側だけ縦線で閉じた空の枠を探し、
 * 「終わりが開いた枠」と、次の行（nextAbove なら上の行）の「始まりが開いた枠」を組にする。
 * 縦書きは画像を転置して同じ処理を使う（次の列は左＝転置後の上）
 */
function wrappedBoxes(ink: Uint8Array, w: number, h: number, nextAbove: boolean): { first: Rect; second: Rect }[] {
  const { long, minH, minV, gap, maxThick, minSide } = lineParams(w, h);
  const { hMask, vMask } = ruleLines(ink, w, h, minH, minV, gap, maxThick);
  const vSum = integral(w, h, (i) => vMask[i]);
  const inkSum = integral(w, h, (i) => ink[i]);
  const segs = horizontalSegments(hMask, w, h, maxThick, gap).sort((a, b) => a.y0 - b.y0);
  const ew = gap * 2 + 3; // 線の端の、縦線を探す幅
  const opens: (Rect & { end: boolean })[] = [];
  for (let i = 0; i < segs.length; i++) {
    const t = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const b = segs[j];
      const inner = b.y0 - t.y1 - 1;
      if (inner > long * 0.1) break;
      if (inner < minSide) continue;
      const tol = Math.max(gap * 3, inner * 0.3);
      if (Math.abs(t.x0 - b.x0) > tol || Math.abs(t.x1 - b.x1) > tol) continue;
      const x0 = Math.max(t.x0, b.x0);
      const x1 = Math.min(t.x1, b.x1);
      if (x1 - x0 + 1 < Math.max(minSide, inner) + ew * 2) continue;
      // 間にほかの線がある（2本の線は向かい合っていない）
      const between = segs.some(
        (m) => m !== t && m !== b && m.y0 > t.y1 && m.y1 < b.y0 && Math.min(m.x1, x1) - Math.max(m.x0, x0) > (x1 - x0) * 0.5,
      );
      if (between) continue;
      const wall = (xa: number, xb: number) =>
        rectSum(vSum, w, Math.max(0, xa), t.y1 + 1, Math.min(w, xb), b.y0) >= inner * 0.7;
      const left = wall(x0, x0 + ew);
      const right = wall(x1 - ew + 1, x1 + 1);
      if (left === right) continue; // 両側が閉じた枠（ほかで検出済み）か、ただの平行線
      if (wall(x0 + ew, x1 - ew + 1)) continue; // 途中に仕切りがある（表など）
      const ix0 = left ? x0 + ew : x0 + gap;
      const ix1 = right ? x1 - ew + 1 : x1 - gap + 1;
      const iy0 = t.y1 + 2;
      const iy1 = b.y0 - 1;
      if (ix1 - ix0 < minSide || iy1 - iy0 < 3) continue;
      const m = Math.max(2, Math.round(inner * 0.1));
      const area = Math.max(1, (ix1 - ix0 - m * 2) * (iy1 - iy0 - m * 2));
      if (rectSum(inkSum, w, ix0 + m, iy0 + m, ix1 - m, iy1 - m) > area * 0.01) continue; // 文字が書かれている
      opens.push({ x: ix0, y: iy0, width: ix1 - ix0, height: iy1 - iy0, end: left });
      break;
    }
  }
  const firsts = opens.filter((o) => o.end);
  const seconds = opens.filter((o) => !o.end);
  const used = new Set<Rect>();
  const out: { first: Rect; second: Rect }[] = [];
  for (const a of firsts) {
    let best: Rect | null = null;
    let bestD = Infinity;
    for (const b of seconds) {
      if (used.has(b)) continue;
      const ratio = b.height / a.height;
      if (ratio < 0.7 || ratio > 1.45) continue;
      // 1つ目は行の後ろ、続きは行の頭
      if (b.x >= a.x || b.x + b.width > a.x + a.width) continue;
      const d = nextAbove ? a.y - (b.y + b.height) : b.y - (a.y + a.height);
      if (d < -a.height * 0.2 || d > a.height * 3) continue;
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) continue;
    used.add(best);
    out.push({ first: a, second: best });
  }
  return out;
}

function transpose(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + y] = mask[y * w + x];
  return out;
}

const flip = (r: Rect): Rect => ({ x: r.y, y: r.x, width: r.height, height: r.width });

function detectUpright(img: GrayImage, ink: Uint8Array): AnswerField[] {
  const { width: w, height: h } = img;
  const long = Math.max(w, h);
  const inkSum = integral(w, h, (i) => ink[i]);
  const inkIn = (x0: number, y0: number, x1: number, y1: number) => rectSum(inkSum, w, x0, y0, x1, y1);

  const { minH, minV, gap, maxThick, minSide } = lineParams(w, h);
  const { hMask, vMask } = ruleLines(ink, w, h, minH, minV, gap, maxThick);
  const lines = new Uint8Array(w * h);
  for (let i = 0; i < lines.length; i++) lines[i] = hMask[i] | vMask[i];
  const walls = dilate(lines, w, h);

  const fields: AnswerField[] = [];

  // ===== 罫線で囲まれた欄 =====
  const cells = tableCells(walls, w, h, minSide);
  const wallSum = integral(w, h, (i) => walls[i]);
  linkNeighbors(cells, (x0, y0, x1, y1) => rectSum(wallSum, w, x0, y0, x1, y1), maxThick * 2 + 6);
  // 解答用紙（細い見出しのマス＋その右・下の広い回答のマス、が並ぶ表）か。
  // 解答用紙では、回答のマスは文字が書かれていても回答欄とする
  const answerCells = new Set(cells.filter(isAnswerCell));
  const sheet = answerCells.size >= 4;
  for (const c of cells) {
    const { bw, bh } = c;
    const vertical = bh > bw * 1.8;
    // 内側（枠の際のにじみを除く）
    const m = Math.max(2, Math.round(Math.min(bw, bh) * 0.1));
    const ix0 = c.x0 + m;
    const iy0 = c.y0 + m;
    let ix1 = c.x1 + 1 - m;
    let iy1 = c.y1 + 1 - m;
    if (ix1 - ix0 < 3 || iy1 - iy0 < 3) continue;
    const hasInk = inkIn(ix0, iy0, ix1, iy1) > (ix1 - ix0) * (iy1 - iy0) * 0.01;
    // 見出しのマス（右や下に、より広いマスや複数のマスが続く）は回答欄にしない
    if (hasInk && isHeaderCell(c)) continue;
    const answer = sheet && answerCells.has(c);
    const along = answer ? (c.right.length ? 'y' : c.left.length ? 'x' : bh > bw ? 'y' : 'x') : vertical ? 'y' : 'x';
    // 欄の終わりに印刷された単位（J・℃・エネルギー など）は除く
    const end = trailingLabel(inkIn, ix0, iy0, ix1, iy1, along);
    let fw = bw;
    let fh = bh;
    if (end !== null && along === 'x') (ix1 = ix0 + end), (fw = ix1 - c.x0);
    if (end !== null && along === 'y') (iy1 = iy0 + end), (fh = iy1 - c.y0);
    const area = (ix1 - ix0) * (iy1 - iy0);
    const total = inkIn(ix0, iy0, ix1, iy1);
    const isVertical = answer ? along === 'y' : vertical;

    let start = 0; // 欄の先頭にある小さな番号（(1)・①など）を避けて書き始める位置
    if (total > area * 0.01 && !answer) {
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
    if ((isVertical ? fh - start : fw - start) < minSide) continue;
    fields.push(
      isVertical
        ? { x: c.x0, y: c.y0 + start, width: bw, height: fh - start, kind: 'box', vertical: true }
        : { x: c.x0 + start, y: c.y0, width: fw - start, height: bh, kind: 'box', vertical: false },
    );
  }

  // ===== 改行された欄（行の終わりで切れて、次の行・列の頭に続く欄） =====
  const wrapped = [
    ...wrappedBoxes(ink, w, h, false).map((p) => ({ ...p, vertical: false })),
    ...wrappedBoxes(transpose(ink, w, h), h, w, true).map((p) => ({
      first: flip(p.first),
      second: flip(p.second),
      vertical: true,
    })),
  ];
  for (const p of wrapped) {
    if (fields.some((b) => overlaps(b, p.first, 2) || overlaps(b, p.second, 2))) continue;
    fields.push({ ...p.first, kind: 'box', vertical: p.vertical, next: p.second });
  }
  const taken = (f: AnswerField) => fields.some((b) => overlaps(f, b, 2) || (!!b.next && overlaps(f, b.next, 2)));

  // ===== 下線だけの欄 =====
  const minLen = Math.max(minH * 1.5, long * 0.04);
  const hSum = integral(w, h, (i) => hMask[i]);
  const vSum = integral(w, h, (i) => vMask[i]);
  const merged = horizontalSegments(hMask, w, h, maxThick, gap);
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
    if (taken(f)) continue;
    fields.push(f);
  }

  // ===== かっこの欄 =====
  for (const f of detectBrackets(ink, w, h, inkIn)) {
    if (taken(f)) continue;
    fields.push(f);
  }

  // 上から下、左から右の順
  const rowTol = long * 0.01;
  return fields.sort((a, b) => (Math.abs(a.y - b.y) > rowTol ? a.y - b.y : a.x - b.x));
}

interface Cell extends Component {
  bw: number;
  bh: number;
  left: Cell[];
  right: Cell[];
  up: Cell[];
  down: Cell[];
}

/** 罫線で囲まれた長方形のマス */
function tableCells(walls: Uint8Array, w: number, h: number, minSide: number): Cell[] {
  const out: Cell[] = [];
  const labels = new Int32Array(w * h);
  components(walls, w, h, 0, false, labels).forEach((c, k) => {
    if (c.border) return;
    const bw = c.x1 - c.x0 + 1;
    const bh = c.y1 - c.y0 + 1;
    if (bw < minSide || bh < minSide) return;
    if (bw * bh > w * h * 0.2) return;
    // 長方形か。中に書かれた文字の画（線と見なされた部分）の穴は埋めて測る
    let filled = 0;
    for (let y = c.y0; y <= c.y1; y++) {
      let a = -1;
      let b = -1;
      for (let x = c.x0; x <= c.x1; x++) {
        if (labels[y * w + x] !== k + 1) continue;
        if (a < 0) a = x;
        b = x;
      }
      if (a >= 0) filled += b - a + 1;
    }
    if (filled / (bw * bh) < 0.85) return;
    if (bw / bh > 40 || bh / bw > 15) return;
    out.push({ ...c, bw, bh, left: [], right: [], up: [], down: [] });
  });
  return out;
}

/** 罫線1本をはさんで隣り合うマスを結ぶ（間がすべて罫線のときだけ。表と表の間の余白は隣とみなさない） */
function linkNeighbors(
  cells: Cell[],
  wallIn: (x0: number, y0: number, x1: number, y1: number) => number,
  maxGap: number,
): void {
  for (const a of cells) {
    for (const b of cells) {
      if (a === b) continue;
      // 左右
      const gx = b.x0 - a.x1 - 1;
      const oy0 = Math.max(a.y0, b.y0);
      const oy1 = Math.min(a.y1, b.y1) + 1;
      if (gx >= 0 && gx <= maxGap && oy1 - oy0 >= Math.min(a.bh, b.bh) * 0.5) {
        if (gx === 0 || wallIn(a.x1 + 1, oy0, b.x0, oy1) >= gx * (oy1 - oy0) * 0.9) (a.right.push(b), b.left.push(a));
      }
      // 上下
      const gy = b.y0 - a.y1 - 1;
      const ox0 = Math.max(a.x0, b.x0);
      const ox1 = Math.min(a.x1, b.x1) + 1;
      if (gy >= 0 && gy <= maxGap && ox1 - ox0 >= Math.min(a.bw, b.bw) * 0.5) {
        if (gy === 0 || wallIn(ox0, a.y1 + 1, ox1, b.y0) >= gy * (ox1 - ox0) * 0.9) (a.down.push(b), b.up.push(a));
      }
    }
  }
}

/** 解答用紙の回答のマス：左（縦書きなら上）に細い見出しのマスがあり、その先にはマスが続かない広いマス */
function isAnswerCell(c: Cell): boolean {
  const widest = (cs: Cell[], k: 'bw' | 'bh') => Math.max(...cs.map((d) => d[k]));
  if (!c.right.length && c.left.length && c.bw >= c.bh * 1.2 && c.bw >= widest(c.left, 'bw') * 1.8) return true;
  if (!c.down.length && c.up.length && c.bh >= c.bw * 1.2 && c.bh >= widest(c.up, 'bh') * 1.8) return true;
  return false;
}

/** 見出しのマス：右（または下）に、自分より十分広いマスか、複数のマスが続く（「1」「(1)」「①」「記号」など） */
function isHeaderCell(c: Cell): boolean {
  if (c.right.length >= 2 || c.right.some((d) => d.bw >= c.bw * 1.5)) return true;
  if (c.bh > c.bw && (c.down.length >= 2 || c.down.some((d) => d.bh >= c.bh * 1.5))) return true;
  return false;
}

/**
 * 欄の終わり（横書きは右端、縦書きは下端）に印刷された単位などの文字のかたまりがあれば、
 * その手前までの長さ（内側の始まりからの距離）を返す。なければ null
 */
function trailingLabel(
  inkIn: (x0: number, y0: number, x1: number, y1: number) => number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  along: 'x' | 'y',
): number | null {
  const span = along === 'x' ? x1 - x0 : y1 - y0;
  const cross = along === 'x' ? y1 - y0 : x1 - x0;
  if (span < cross * 1.5) return null;
  const col = (i: number) => (along === 'x' ? inkIn(x0 + i, y0, x0 + i + 1, y1) : inkIn(x0, y0 + i, x1, y0 + i + 1));
  const has = (i: number) => col(i) > 0;
  // 端のいちばん近くにある文字
  let last = span - 1;
  while (last >= 0 && !has(last)) last--;
  if (last < span - Math.max(span * 0.1, cross * 0.6)) return null;
  // 文字のかたまりの始まり（字と字の間のすき間は越える）
  const gapMax = Math.max(3, cross * 0.35);
  let first = last;
  let blank = 0;
  for (let i = last - 1; i >= 0; i--) {
    if (has(i)) (first = i), (blank = 0);
    else if (++blank > gapMax) break;
  }
  if (first < span * 0.45 || last - first + 1 > span * 0.45) return null;
  // 文字の大きさがある（破線のかけらや枠のにじみではない）
  const a0 = along === 'x' ? x0 + first : y0 + first;
  const a1 = along === 'x' ? x0 + last + 1 : y0 + last + 1;
  const row = (j: number) => (along === 'x' ? inkIn(a0, y0 + j, a1, y0 + j + 1) : inkIn(x0 + j, a0, x0 + j + 1, a1));
  let r0 = 0;
  let r1 = cross - 1;
  while (r0 < cross && !row(r0)) r0++;
  while (r1 > r0 && !row(r1)) r1--;
  if (r1 - r0 + 1 < cross * 0.25) return null;
  // かたまりの手前は、すき間の分だけ余白をとる
  const end = first - Math.max(2, Math.round(cross * 0.1));
  return end >= cross ? end : null;
}

type Side = 'open' | 'close';

/** かっこの形か。横書き（along='y'）では縦長の成分を見て「（」なら open、「）」なら close。
 *  縦書き（along='x'）では横長の成分を見て「︵」なら open、「︶」なら close。
 *  開きかっこは、両端（上下の端）が中央よりも開く側へ張り出し、中央が反対側の際にある */
function bracketSide(c: Component, labels: Int32Array, id: number, w: number, along: 'x' | 'y'): Side | null {
  const n = along === 'y' ? c.y1 - c.y0 + 1 : c.x1 - c.x0 + 1; // 長さ方向
  const span = along === 'y' ? c.x1 - c.x0 + 1 : c.y1 - c.y0 + 1; // 太さ方向
  const lo = new Float64Array(n).fill(Infinity);
  const hi = new Float64Array(n).fill(-Infinity);
  for (let y = c.y0; y <= c.y1; y++) {
    for (let x = c.x0; x <= c.x1; x++) {
      if (labels[y * w + x] !== id) continue;
      const k = along === 'y' ? y - c.y0 : x - c.x0;
      const v = along === 'y' ? x - c.x0 : y - c.y0;
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
  }
  let filled = 0;
  for (let k = 0; k < n; k++) if (hi[k] >= 0) filled++;
  if (filled < n * 0.85) return null; // 途中で切れている（かっこは1本につながった線）
  const avg = (arr: Float64Array, a: number, b: number) => {
    let s = 0;
    let m = 0;
    for (let k = Math.max(0, a); k < Math.min(n, b); k++) if (hi[k] >= 0) (s += arr[k]), m++;
    return m ? s / m : NaN;
  };
  // 端の張り出しは最も外側の値で見る（〔 の角のように短いかぎでも拾う）
  const most = (arr: Float64Array, a: number, b: number, sign: 1 | -1) => {
    let v = -Infinity;
    for (let k = Math.max(0, a); k < Math.min(n, b); k++) if (hi[k] >= 0) v = Math.max(v, arr[k] * sign);
    return v * sign;
  };
  const e = Math.max(1, Math.round(n * 0.15));
  const m0 = Math.round(n * 0.35);
  const m1 = Math.round(n * 0.65);
  const need = Math.max(2, span * 0.4);
  // 開きかっこ：端の外側の縁が中央より大きく張り出し、中央は内側の縁が 0 の近く
  const openTop = most(hi, 0, e, 1) - avg(hi, m0, m1);
  const openBot = most(hi, n - e, n, 1) - avg(hi, m0, m1);
  if (openTop >= need && openBot >= need && avg(lo, m0, m1) <= span * 0.35) return 'open';
  const closeTop = avg(lo, m0, m1) - most(lo, 0, e, -1);
  const closeBot = avg(lo, m0, m1) - most(lo, n - e, n, -1);
  if (closeTop >= need && closeBot >= need && span - 1 - avg(hi, m0, m1) <= span * 0.35) return 'close';
  return null;
}

/** 向かい合うかっこの組で、間が空白のものを回答欄とする */
function detectBrackets(
  ink: Uint8Array,
  w: number,
  h: number,
  inkIn: (x0: number, y0: number, x1: number, y1: number) => number,
): AnswerField[] {
  const long = Math.max(w, h);
  const labels = new Int32Array(w * h);
  const comps = components(ink, w, h, 1, true, labels);
  const minLen = Math.max(10, Math.round(long * 0.01));
  const maxLen = long * 0.3;
  const out: AnswerField[] = [];
  for (const along of ['y', 'x'] as const) {
    // along='y'：横書き（左右のかっこ）、along='x'：縦書き（上下のかっこ）
    const len = (c: Component) => (along === 'y' ? c.y1 - c.y0 + 1 : c.x1 - c.x0 + 1);
    const thick = (c: Component) => (along === 'y' ? c.x1 - c.x0 + 1 : c.y1 - c.y0 + 1);
    const a0 = (c: Component) => (along === 'y' ? c.y0 : c.x0); // 長さ方向の始まり
    const a1 = (c: Component) => (along === 'y' ? c.y1 : c.x1);
    const b0 = (c: Component) => (along === 'y' ? c.x0 : c.y0); // 並ぶ方向の始まり
    const b1 = (c: Component) => (along === 'y' ? c.x1 : c.y1);
    const opens: Component[] = [];
    const closes: Component[] = [];
    comps.forEach((c, i) => {
      const l = len(c);
      const t = thick(c);
      if (l < minLen || l > maxLen || t < 2 || l < t * 1.8) return;
      const side = bracketSide(c, labels, i + 1, w, along);
      if (side === 'open') opens.push(c);
      else if (side === 'close') closes.push(c);
    });
    closes.sort((p, q) => b0(p) - b0(q));
    for (const o of opens) {
      const lo = len(o);
      // 同じ行（列）で、右（下）にあるいちばん近い閉じかっこ
      const cl = closes.find((c) => {
        if (b0(c) <= b1(o)) return false;
        const lc = len(c);
        if (lc < lo * 0.6 || lc > lo * 1.6) return false;
        const ov = Math.min(a1(o), a1(c)) - Math.max(a0(o), a0(c)) + 1;
        return ov >= Math.max(lo, lc) * 0.6;
      });
      if (!cl) continue;
      const size = (lo + len(cl)) / 2;
      const gap = b0(cl) - b1(o) - 1;
      // 「(1)」のような番号のかっこは除く
      if (gap < size * 1.2) continue;
      // 間にほかのかっこがある（入れ子・別の組）なら対象外
      if (opens.some((p) => p !== o && b0(p) > b1(o) && b1(p) < b0(cl) && overlapAlong(p, o))) continue;
      const s0 = Math.min(a0(o), a0(cl));
      const s1 = Math.max(a1(o), a1(cl)) + 1;
      const pad = Math.max(2, Math.round(size * 0.12));
      const i0 = b1(o) + 1 + pad;
      const i1 = b0(cl) - pad;
      const j0 = s0 + pad;
      const j1 = s1 - pad;
      if (i1 - i0 < 3 || j1 - j0 < 3) continue;
      const total = along === 'y' ? inkIn(i0, j0, i1, j1) : inkIn(j0, i0, j1, i1);
      if (total > (i1 - i0) * (j1 - j0) * 0.008) continue; // 文字が書かれている
      const g0 = b1(o) + 1;
      out.push(
        along === 'y'
          ? { x: g0, y: s0, width: gap, height: s1 - s0, kind: 'bracket', vertical: false }
          : { x: s0, y: g0, width: s1 - s0, height: gap, kind: 'bracket', vertical: true },
      );
    }

    function overlapAlong(p: Component, q: Component): boolean {
      return Math.min(a1(p), a1(q)) - Math.max(a0(p), a0(q)) + 1 >= Math.min(len(p), len(q)) * 0.6;
    }
  }
  return out;
}
