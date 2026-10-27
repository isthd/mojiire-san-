import { describe, expect, it } from 'vitest';
import { detectRules, fitRuledRange } from './ruleDetect';

/** 間隔 gap・最初の線 offset で、細い線が並ぶ濃さの分布を作る */
function ruled(n: number, gap: number, offset: number, noise = 0): number[] {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * noise;
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = Math.abs((((i - offset) % gap) + gap) % gap);
    const dist = Math.min(d, gap - d);
    p.push(5 + i * 0.02 + (dist < 1 ? 40 : 0) + rand());
  }
  return p;
}

describe('detectRules', () => {
  it('一定の間隔の罫線を見つける', () => {
    const fit = detectRules(ruled(600, 32.5, 10, 4))!;
    expect(fit).not.toBeNull();
    expect(fit.gap).toBeCloseTo(32.5, 0);
    expect(Math.abs(fit.offset - 10)).toBeLessThan(1.5);
  });

  it('2倍の間隔と間違えない', () => {
    const fit = detectRules(ruled(400, 20, 3))!;
    expect(fit.gap).toBeCloseTo(20, 0);
  });

  it('線がなければ null', () => {
    expect(detectRules(new Array(300).fill(10))).toBeNull();
  });
});

describe('fitRuledRange', () => {
  it('半分以上入っている行を含める', () => {
    // 線は 10, 40, 70, 100。範囲 0〜110：上の行（-20〜10）は半分以上入っていない
    expect(fitRuledRange(110, 30, 10)).toEqual({ start: 10, lines: 3 });
    // 範囲 0〜125：下の 100〜130 の行は半分以上入っている
    expect(fitRuledRange(125, 30, 10)).toEqual({ start: 10, lines: 4 });
    // 最初の線が 20：上の行（-10〜20）は 2/3 入っている
    expect(fitRuledRange(110, 30, 20)).toEqual({ start: -10, lines: 4 });
  });
});
