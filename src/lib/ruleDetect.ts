// 便箋・ノートの罫線の間隔を見つける（純粋関数）。
// 罫線と直交する方向の「濃さの分布」を受け取り、一定の間隔でくり返す山を探す。

export interface RuleFit {
  /** 罫線の間隔 */
  gap: number;
  /** 最初の罫線の位置（0 以上 gap 未満） */
  offset: number;
  /** 周期のはっきりさ（0〜1） */
  score: number;
}

/** 濃さの分布から罫線の間隔と位置を求める。見つからなければ null */
export function detectRules(profile: ArrayLike<number>, minGap = 6): RuleFit | null {
  const n = profile.length;
  if (n < minGap * 3) return null;

  // ゆるやかな明るさのむら（影など）を取り除く
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + profile[i];
  const half = Math.max(minGap, Math.round(n / 6));
  const hp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    hp[i] = profile[i] - (prefix[b] - prefix[a]) / (b - a);
  }
  // 罫線は周りより濃い（山）なので、谷は捨てる
  for (let i = 0; i < n; i++) if (hp[i] < 0) hp[i] = 0;
  // 細い線は間隔が小数だと1pxずれて重ならないので、少しぼかしてから比べる
  const blurred = new Float64Array(n);
  const kernel = [1, 2, 3, 2, 1];
  for (let i = 0; i < n; i++) {
    let s = 0;
    let wsum = 0;
    for (let j = -2; j <= 2; j++) {
      const v = hp[i + j];
      if (v === undefined) continue;
      s += v * kernel[j + 2];
      wsum += kernel[j + 2];
    }
    blurred[i] = s / wsum;
  }
  hp.set(blurred);

  let energy = 0;
  for (let i = 0; i < n; i++) energy += hp[i] * hp[i];
  if (energy <= 1e-9) return null;

  // 自己相関（ずらしても重なる間隔ほど大きい）
  const maxLag = Math.floor(n / 2);
  const ac = new Float64Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag + 1 && lag < n; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += hp[i] * hp[i + lag];
    ac[lag] = ((s / energy) * n) / (n - lag);
  }
  const peaks: number[] = [];
  for (let lag = minGap; lag <= maxLag; lag++) {
    if (ac[lag] > 0 && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) peaks.push(lag);
  }
  if (!peaks.length) return null;
  const best = Math.max(...peaks.map((l) => ac[l]));
  if (best < 0.2) return null;
  // 2倍・3倍の間隔も山になるので、十分に高い山のうち最も短い間隔を選ぶ
  const lag = peaks.find((l) => ac[l] >= best * 0.75)!;

  // 位相（最初の罫線の位置）：その間隔でくり返す点の濃さの合計が最大になる位置
  let phase = 0;
  let phaseScore = -1;
  for (let p = 0; p < lag; p++) {
    let s = 0;
    for (let i = p; i < n; i += lag) s += Math.max(hp[i], hp[i - 1] ?? 0, hp[i + 1] ?? 0);
    if (s > phaseScore) {
      phaseScore = s;
      phase = p;
    }
  }

  // 1本ずつ山の位置を拾い、直線の当てはめで間隔を細かく求める
  const win = Math.max(1, Math.floor(lag * 0.25));
  const ks: number[] = [];
  const ps: number[] = [];
  let maxPeak = 0;
  const found: { k: number; pos: number; v: number }[] = [];
  for (let k = 0; phase + k * lag < n; k++) {
    const c = phase + k * lag;
    let bi = -1;
    let bv = 0;
    for (let i = Math.max(1, c - win); i <= Math.min(n - 2, c + win); i++) {
      if (hp[i] > bv) {
        bv = hp[i];
        bi = i;
      }
    }
    if (bi < 0) continue;
    // 放物線で小数点以下の位置まで求める
    const l = hp[bi - 1];
    const r = hp[bi + 1];
    const d = l - 2 * bv + r;
    const pos = d < 0 ? bi + (0.5 * (l - r)) / d : bi;
    found.push({ k, pos, v: bv });
    maxPeak = Math.max(maxPeak, bv);
  }
  for (const f of found) {
    if (f.v < maxPeak * 0.25) continue;
    ks.push(f.k);
    ps.push(f.pos);
  }
  let gap = lag;
  let offset = phase;
  if (ks.length >= 2) {
    const m = ks.length;
    const mk = ks.reduce((a, b) => a + b, 0) / m;
    const mp = ps.reduce((a, b) => a + b, 0) / m;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < m; i++) {
      sxy += (ks[i] - mk) * (ps[i] - mp);
      sxx += (ks[i] - mk) ** 2;
    }
    if (sxx > 0) {
      const g = sxy / sxx;
      if (g > lag * 0.8 && g < lag * 1.2) {
        gap = g;
        offset = mp - g * mk;
      }
    }
  } else if (ks.length === 1) {
    offset = ps[0] - ks[0] * lag;
  }
  offset = ((offset % gap) + gap) % gap;
  return { gap, offset, score: Math.min(1, best) };
}

/**
 * 囲んだ範囲（長さ length）に罫線の間隔を当てはめて、枠の開始位置と行数を決める。
 * 範囲の端が行の途中にあるときは、半分以上入っている行を含める。
 */
export function fitRuledRange(length: number, gap: number, offset: number): { start: number; lines: number } {
  const first = offset;
  const start = first >= gap * 0.5 ? first - gap : first;
  const last = first + Math.floor((length - first) / gap) * gap;
  const end = length - last >= gap * 0.5 ? last + gap : last;
  return { start, lines: Math.max(1, Math.round((end - start) / gap)) };
}
