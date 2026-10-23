import { describe, expect, it } from 'vitest';
import { fitView, imageToScreen, rectFromPoints, screenToImage, simplifyPoints, snapAngle, zoomAt } from './geometry';

describe('coordinate transforms', () => {
  it('screen <-> image round trip', () => {
    const v = { zoom: 2.5, x: 40, y: -30 };
    const p = { x: 123, y: 456 };
    const back = screenToImage(imageToScreen(p, v), v);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });

  it('zoomAt keeps the anchor point fixed', () => {
    const v = { zoom: 1, x: 10, y: 20 };
    const anchor = { x: 200, y: 150 };
    const before = screenToImage(anchor, v);
    const after = screenToImage(anchor, zoomAt(v, 3, anchor));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('fitView centers the image', () => {
    const v = fitView(1000, 800, 2000, 1000, 0);
    expect(v.zoom).toBeCloseTo(0.5);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(150);
  });
});

describe('drawing helpers', () => {
  it('snaps near-horizontal lines', () => {
    expect(snapAngle({ x: 0, y: 0 }, { x: 100, y: 3 }, false).y).toBeCloseTo(0);
  });

  it('does not snap clearly diagonal lines unless forced', () => {
    expect(snapAngle({ x: 0, y: 0 }, { x: 100, y: 40 }, false)).toEqual({ x: 100, y: 40 });
    const forced = snapAngle({ x: 0, y: 0 }, { x: 100, y: 40 }, true);
    expect((Math.atan2(forced.y, forced.x) * 180) / Math.PI).toBeCloseTo(15);
  });

  it('normalizes rectangles', () => {
    expect(rectFromPoints({ x: 50, y: 50 }, { x: 10, y: 20 }, false)).toEqual({ x: 10, y: 20, width: 40, height: 30 });
  });

  it('simplifies collinear points', () => {
    expect(simplifyPoints([0, 0, 1, 0, 2, 0, 3, 0], 0.1)).toEqual([0, 0, 3, 0]);
  });
});
