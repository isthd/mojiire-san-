// 画像を切り抜き・補正したときに、書き込みの位置を新しい画像に合わせる。
// 線や手書きは各点を正確に移し、文字・図形は基準点を移して回転を足す（台形の歪みまでは追わない）。
import type { EditorObject } from '../types/model';
import type { Point } from './geometry';

function rot(p: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function normDeg(d: number): number {
  let r = ((d % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return Math.round(r * 1000) / 1000;
}

/**
 * map: 元画像の点 → 新しい画像の点
 * addRotation: 画像を回した角度（90° 単位）
 * scale: 大きさの倍率（画像を縮小して保存したときなど。ふつうは 1）
 */
export function remapObjects(objs: EditorObject[], map: (p: Point) => Point, addRotation: number, scale: number): EditorObject[] {
  const k = Math.abs(scale - 1) < 0.02 ? 1 : scale;
  const sz = (v: number) => v * k;
  return objs.map((o) => {
    const origin = map({ x: o.x, y: o.y });
    const rotation = normDeg(o.rotation + addRotation);
    const relPoints = (pts: number[]) => {
      const out: number[] = [];
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const a = rot({ x: pts[i], y: pts[i + 1] }, o.rotation);
        const m = map({ x: o.x + a.x, y: o.y + a.y });
        const back = rot({ x: m.x - origin.x, y: m.y - origin.y }, -rotation);
        out.push(back.x, back.y);
      }
      return out;
    };
    const base = { ...o, x: origin.x, y: origin.y, rotation };
    switch (o.type) {
      case 'pen':
      case 'highlighter':
        return { ...base, type: o.type, points: relPoints(o.points), strokeWidth: sz(o.strokeWidth) } as EditorObject;
      case 'line':
      case 'arrow':
        return {
          ...base,
          type: o.type,
          points: relPoints(o.points) as [number, number, number, number],
          strokeWidth: sz(o.strokeWidth),
          arrowSize: sz(o.arrowSize),
        } as EditorObject;
      case 'text':
        return {
          ...base,
          type: 'text',
          fontSize: sz(o.fontSize),
          outlineWidth: sz(o.outlineWidth),
          ...(o.fieldWidth !== undefined ? { fieldWidth: sz(o.fieldWidth) } : {}),
          ...(o.fieldHeight !== undefined ? { fieldHeight: sz(o.fieldHeight) } : {}),
        } as EditorObject;
      case 'math':
        return { ...base, type: 'math', fontSize: sz(o.fontSize), width: sz(o.width), height: sz(o.height) } as EditorObject;
      default:
        return {
          ...base,
          width: sz(o.width),
          height: sz(o.height),
          strokeWidth: sz(o.strokeWidth),
        } as EditorObject;
    }
  });
}
