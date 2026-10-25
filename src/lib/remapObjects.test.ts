import { describe, expect, it } from 'vitest';
import type { EditorObject } from '../types/model';
import { fullQuad, makeForwardMap } from './perspective';
import { remapObjects } from './remapObjects';

const line: EditorObject = {
  id: 'a',
  type: 'arrow',
  x: 10,
  y: 20,
  rotation: 0,
  opacity: 1,
  points: [0, 0, 30, 0],
  color: '#000',
  strokeWidth: 2,
  dash: 'solid',
  arrowStart: false,
  arrowEnd: true,
  arrowSize: 3,
};

describe('書き込みの位置合わせ', () => {
  it('切り抜きで平行移動する', () => {
    const map = (p: { x: number; y: number }) => ({ x: p.x - 5, y: p.y - 8 });
    const [o] = remapObjects([line], map, 0, 1);
    expect(o.x).toBe(5);
    expect(o.y).toBe(12);
    expect(o.type === 'arrow' && o.points).toEqual([0, 0, 30, 0]);
  });

  it('90°回転で矢印の向きも画像に合わせて回る', () => {
    // 100×50 の画像を右に回す（切り抜きなし）
    const map = makeForwardMap(100, 50, 1, fullQuad(50, 100), { width: 50, height: 100 });
    const [o] = remapObjects([line], map, 90, 1);
    expect(o.rotation).toBe(90);
    // 終点の絶対位置：元 (40,20) → 回転後 (30,40)
    const pts = o.type === 'arrow' ? o.points : [];
    const r = (90 * Math.PI) / 180;
    const ex = o.x + pts[2] * Math.cos(r) - pts[3] * Math.sin(r);
    const ey = o.y + pts[2] * Math.sin(r) + pts[3] * Math.cos(r);
    expect(ex).toBeCloseTo(30);
    expect(ey).toBeCloseTo(40);
  });

  it('縮小したときは太さも縮める', () => {
    const [o] = remapObjects([line], (p) => ({ x: p.x / 2, y: p.y / 2 }), 0, 0.5);
    expect(o.type === 'arrow' && o.strokeWidth).toBe(1);
  });
});
