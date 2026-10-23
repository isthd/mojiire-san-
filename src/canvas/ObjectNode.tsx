// 1つのオブジェクトを react-konva で描画する。記述（describe.ts）は書き出しと共通。
import { memo, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Arrow, Ellipse, Group, Image as KImage, Line, Rect, Shape, Text } from 'react-konva';
import { getMathImage, peekMathImage } from '../math/mathRenderer';
import type { EditorObject } from '../types/model';
import { describeObject, type NodeDesc, type NodeKind } from './describe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COMPONENTS: Record<NodeKind, any> = { Group, Rect, Ellipse, Line, Arrow, Text, Image: KImage, Shape };

function renderDesc(desc: NodeDesc, key: number): ReactElement {
  const C = COMPONENTS[desc.kind];
  return (
    <C key={key} {...desc.config} perfectDrawEnabled={false}>
      {desc.children?.map(renderDesc)}
    </C>
  );
}

function useMathImage(obj: EditorObject): HTMLImageElement | null {
  const latex = obj.type === 'math' ? obj.latex : null;
  const fontSize = obj.type === 'math' ? obj.fontSize : 0;
  const color = obj.type === 'math' ? obj.color : '';
  const [img, setImg] = useState<HTMLImageElement | null>(() =>
    latex !== null ? (peekMathImage(latex, fontSize, color)?.img ?? null) : null,
  );
  useEffect(() => {
    if (latex === null) return;
    let alive = true;
    const cached = peekMathImage(latex, fontSize, color);
    if (cached) {
      setImg(cached.img);
      return;
    }
    getMathImage(latex, fontSize, color)
      .then((m) => alive && setImg(m.img))
      .catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [latex, fontSize, color]);
  return img;
}

interface Props {
  obj: EditorObject;
  hitPad: number;
  hidden: boolean;
  draggable: boolean;
  /** フォント読み込み後の再計測用 */
  epoch: number;
}

export const ObjectNode = memo(function ObjectNode({ obj, hitPad, hidden, draggable, epoch }: Props) {
  const mathImage = useMathImage(obj);
  const desc = useMemo(
    () => describeObject(obj, { mathImage, hitPad, placeholder: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj, mathImage, hitPad, epoch],
  );
  return (
    <Group {...desc.config} visible={!hidden} draggable={draggable && !obj.locked}>
      {desc.children?.map(renderDesc)}
    </Group>
  );
});
