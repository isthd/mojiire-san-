// 変形ハンドル操作後のノード状態（拡大率・回転）をオブジェクトのデータへ反映する。
// 拡大率はフォントサイズ・幅高さ・点座標に焼き込み、scale は常に 1 に保つ。
import type { EditorObject } from '../types/model';

export interface NodeTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function transformPoints(points: number[], t: NodeTransform): number[] {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out: number[] = new Array(points.length);
  for (let i = 0; i < points.length; i += 2) {
    const px = points[i] * t.scaleX;
    const py = points[i + 1] * t.scaleY;
    out[i] = r2(px * cos - py * sin);
    out[i + 1] = r2(px * sin + py * cos);
  }
  return out;
}

/** 戻り値: オブジェクトへのパッチと、ノードに設定し直すべき属性 */
export function bakeTransform(
  obj: EditorObject,
  t: NodeTransform,
): { patch: Partial<EditorObject>; node: NodeTransform } {
  const sx = Math.abs(t.scaleX);
  const sy = Math.abs(t.scaleY);
  const s = (sx + sy) / 2;
  const base = { x: t.x, y: t.y, rotation: t.rotation };
  switch (obj.type) {
    case 'text':
      // 罫線テキストボックスは枠の大きさだけを変える（文字の大きさ・行の幅はそのまま）
      if (obj.ruleGap && obj.boxWidth && obj.boxHeight) {
        return {
          patch: { ...base, boxWidth: Math.max(1, obj.boxWidth * sx), boxHeight: Math.max(1, obj.boxHeight * sy) },
          node: { ...base, scaleX: 1, scaleY: 1 },
        };
      }
      return {
        patch: {
          ...base,
          fontSize: obj.fontSize * s,
          outlineWidth: obj.outlineWidth * s,
          // 回答欄に置いた未入力の枠は、枠の大きさも一緒に変える（そのままだと元の大きさに戻って見える）
          ...(obj.fieldWidth && obj.fieldHeight ? { fieldWidth: obj.fieldWidth * sx, fieldHeight: obj.fieldHeight * sy } : {}),
        },
        node: { ...base, scaleX: 1, scaleY: 1 },
      };
    case 'math':
      return {
        patch: { ...base, fontSize: obj.fontSize * s, width: obj.width * s, height: obj.height * s },
        node: { ...base, scaleX: 1, scaleY: 1 },
      };
    case 'rect':
    case 'ellipse':
    case 'triangle':
      return {
        patch: { ...base, width: Math.max(1, obj.width * sx), height: Math.max(1, obj.height * sy) },
        node: { ...base, scaleX: 1, scaleY: 1 },
      };
    case 'pen':
    case 'highlighter':
    case 'line':
    case 'arrow': {
      // 線は回転も点座標に焼き込む（端点ハンドルを常に正しい位置に出すため）
      const points = transformPoints(obj.points, t);
      return {
        patch: { x: t.x, y: t.y, rotation: 0, points } as Partial<EditorObject>,
        node: { x: t.x, y: t.y, rotation: 0, scaleX: 1, scaleY: 1 },
      };
    }
  }
}
