// オブジェクト → Konva ノード構成の記述。
// 編集画面（react-konva）と書き出し（Konva 直接生成）の両方がこの記述を使うため、
// 画面表示と書き出し結果が一致する。
import Konva from 'konva';
import { withAlpha } from '../lib/color';
import {
  DEFAULT_LINE_HEIGHT,
  fontCss,
  isRuledText,
  type DashStyle,
  type EditorObject,
  type TextObject,
} from '../types/model';
import { layoutVertical, punctuationOffset, wrapVertical, type VerticalLayout } from './verticalText';

export type NodeKind = 'Group' | 'Rect' | 'Ellipse' | 'Line' | 'Arrow' | 'Text' | 'Image' | 'Shape';

export interface NodeDesc {
  kind: NodeKind;
  config: Record<string, unknown>;
  children?: NodeDesc[];
}

export interface DescribeContext {
  /** 数式の描画済み画像（未読み込みなら null） */
  mathImage: HTMLImageElement | null;
  /** 細い線でも選択しやすくするための最小当たり判定幅（画像px） */
  hitPad: number;
  /** 未入力のテキスト枠を「ダブルタップで入力」として表示する（編集画面のみ。書き出しでは表示しない） */
  placeholder?: boolean;
  /** 選択中（罫線テキストボックスの線の目安を表示する。編集画面のみ） */
  selected?: boolean;
}

export const PLACEHOLDER_LABEL = 'ダブルタップで入力';

/** 未入力のテキスト枠の表示サイズ（画像px） */
export function placeholderSize(o: TextObject): { width: number; height: number } {
  if (isRuledText(o)) return { width: o.boxWidth, height: o.boxHeight };
  if (o.fieldWidth && o.fieldHeight) return { width: o.fieldWidth, height: o.fieldHeight };
  const line = o.fontSize * lineHeightOf(o) + textPadding(o) * 2;
  return o.vertical ? { width: line, height: o.fontSize * 6 } : { width: o.fontSize * 6, height: line };
}

function placeholderNodes(o: TextObject): NodeDesc[] {
  const { width, height } = placeholderSize(o);
  const vertical = !!o.vertical;
  const len = PLACEHOLDER_LABEL.length + 1;
  // 枠に収まる大きさで案内文を表示
  const fs = vertical
    ? Math.min(o.fontSize * 0.55, width * 0.55, height / len)
    : Math.min(o.fontSize * 0.55, height * 0.55, width / len);
  const stroke = Math.max(1, Math.min(width, height) * 0.03);
  return [
    {
      kind: 'Rect',
      config: {
        width,
        height,
        fill: 'rgba(10,132,255,0.08)',
        stroke: 'rgba(10,132,255,0.75)',
        strokeWidth: stroke,
        dash: [stroke * 4, stroke * 3],
        cornerRadius: Math.min(width, height) * 0.12,
      },
    },
    vertical
      ? {
          kind: 'Shape',
          config: {
            width,
            height,
            listening: false,
            sceneFunc: (context: Konva.Context) => {
              const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
              ctx.font = `${fs}px ${fontCss('gothic')}`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#0a84ff';
              const chars = [...PLACEHOLDER_LABEL];
              const top = (height - chars.length * fs) / 2;
              chars.forEach((ch, i) => ctx.fillText(ch, width / 2, top + fs * (i + 0.5)));
            },
          },
        }
      : {
          kind: 'Text',
          config: {
            text: PLACEHOLDER_LABEL,
            width,
            height,
            align: 'center',
            verticalAlign: 'middle',
            wrap: 'none',
            fontSize: fs,
            fontFamily: fontCss('gothic'),
            fill: '#0a84ff',
            listening: false,
          },
        },
  ];
}

export const TEXT_LINE_HEIGHT = DEFAULT_LINE_HEIGHT;

export function textPadding(o: Pick<TextObject, 'fontSize'>): number {
  return o.fontSize * 0.15;
}

export function fontStyleOf(o: Pick<TextObject, 'bold' | 'italic'>): string {
  if (o.bold && o.italic) return 'italic bold';
  if (o.bold) return 'bold';
  if (o.italic) return 'italic';
  return 'normal';
}

export function lineHeightOf(o: TextObject): number {
  return o.lineHeight ?? TEXT_LINE_HEIGHT;
}

function outlineStyle(o: TextObject): string | undefined {
  return o.outlineColor ? withAlpha(o.outlineColor, o.outlineOpacity ?? 1) : undefined;
}

function hasOutline(o: TextObject): boolean {
  return !!o.outlineColor && o.outlineWidth > 0;
}

export function textConfig(o: TextObject): Record<string, unknown> {
  return {
    text: o.text,
    fontSize: o.fontSize,
    fontFamily: fontCss(o.fontFamily),
    fontStyle: fontStyleOf(o),
    fill: o.color,
    align: o.align,
    lineHeight: lineHeightOf(o),
    letterSpacing: (o.letterSpacing ?? 0) * o.fontSize,
    padding: textPadding(o),
    // 縁取りは文字の外側だけに見えるよう、塗りを後から描く
    stroke: outlineStyle(o),
    strokeWidth: hasOutline(o) ? o.outlineWidth * 2 : 0,
    strokeEnabled: hasOutline(o),
    fillAfterStrokeEnabled: true,
    lineJoin: 'round',
  };
}

function verticalLayoutOf(o: TextObject) {
  return layoutVertical({
    text: o.text,
    fontSize: o.fontSize,
    letterSpacing: o.letterSpacing ?? 0,
    lineHeight: lineHeightOf(o),
    padding: textPadding(o),
    align: o.align,
  });
}

let measurer: Konva.Text | null = null;

/** テキストの表示サイズ（画像px）を計測 */
export function measureText(o: TextObject): { width: number; height: number } {
  if (isRuledText(o)) return { width: o.boxWidth, height: o.boxHeight };
  if (o.vertical) {
    const l = verticalLayoutOf(o);
    return { width: l.width, height: l.height };
  }
  if (!measurer) measurer = new Konva.Text();
  measurer.setAttrs({ ...textConfig(o), text: o.text || ' ', width: undefined, height: undefined });
  return { width: measurer.width(), height: measurer.height() };
}

/** 縦書きテキストを描く Konva.Shape の設定 */
function verticalTextConfig(o: TextObject, l: VerticalLayout = verticalLayoutOf(o)): Record<string, unknown> {
  const font = `${fontStyleOf(o)} ${o.fontSize}px ${fontCss(o.fontFamily)}`;
  const outline = hasOutline(o) ? outlineStyle(o) : undefined;
  return {
    width: l.width,
    height: l.height,
    fill: o.color, // 当たり判定用（描画は sceneFunc で行う）
    sceneFunc: (context: Konva.Context) => {
      const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const g of l.glyphs) {
        const off = punctuationOffset(g.ch, o.fontSize);
        ctx.save();
        ctx.translate(g.cx + off.dx, g.cy + off.dy);
        if (g.rotate) ctx.rotate(Math.PI / 2);
        if (outline) {
          ctx.strokeStyle = outline;
          ctx.lineWidth = o.outlineWidth * 2;
          ctx.strokeText(g.ch, 0, 0);
        }
        ctx.fillStyle = o.color;
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      }
    },
    hitFunc: (context: Konva.Context, shape: Konva.Shape) => {
      context.beginPath();
      context.rect(0, 0, l.width, l.height);
      context.closePath();
      context.fillStrokeShape(shape);
    },
  };
}

type RuledText = TextObject & { ruleGap: number; boxWidth: number; boxHeight: number };

/** 罫線テキストボックスの行（縦書きは列）の数 */
function ruledCount(o: RuledText): number {
  // 枠の外に線がはみ出さないよう切り捨て
  return Math.max(1, Math.floor((o.vertical ? o.boxWidth : o.boxHeight) / o.ruleGap + 1e-3));
}

/** 罫線の位置に線を引く Shape（color: 線の色、guide: 編集画面の目安の線） */
function ruleLinesNode(o: RuledText, color: string, guide: boolean): NodeDesc {
  const n = ruledCount(o);
  const w = guide ? Math.max(1, o.ruleGap * 0.025) : Math.max(1, o.ruleGap * 0.035);
  return {
    kind: 'Shape',
    config: {
      listening: false,
      sceneFunc: (context: Konva.Context) => {
        const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        if (guide) ctx.setLineDash([w * 5, w * 4]);
        ctx.beginPath();
        for (let k = 0; k <= n; k++) {
          if (o.vertical) {
            const x = o.boxWidth - k * o.ruleGap;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, o.boxHeight);
          } else {
            const y = k * o.ruleGap;
            ctx.moveTo(0, y);
            ctx.lineTo(o.boxWidth, y);
          }
        }
        ctx.stroke();
        ctx.restore();
      },
    },
  };
}

/** 文字を罫線の間に並べる（横書きは行の下側の線に少し寄せる） */
function ruledTextNodes(o: RuledText): NodeDesc[] {
  const fs = o.fontSize;
  const gap = o.ruleGap;
  if (o.vertical) {
    const inset = Math.min(fs * 0.4, o.boxHeight * 0.05);
    const ls = o.letterSpacing ?? 0;
    const perCol = (o.boxHeight - inset * 2 + fs * ls) / (fs * (1 + ls));
    const l = layoutVertical({
      text: wrapVertical(o.text, perCol),
      fontSize: fs,
      letterSpacing: ls,
      lineHeight: gap / fs,
      padding: 0,
      align: o.align,
    });
    // 1列目を枠の右端の列に合わせる。上下揃えは枠の高さの中で行う
    const k = o.align === 'center' ? 0.5 : o.align === 'right' ? 1 : 0;
    const dy = inset + Math.max(0, o.boxHeight - inset * 2 - l.height) * k;
    return [{ kind: 'Shape', config: { ...verticalTextConfig(o, l), x: o.boxWidth - l.width, y: dy } }];
  }
  const inset = Math.min(fs * 0.3, o.boxWidth * 0.05);
  return [
    {
      kind: 'Text',
      config: {
        ...textConfig(o),
        x: inset,
        y: Math.max(0, (gap - fs) * 0.3),
        width: Math.max(fs, o.boxWidth - inset * 2),
        wrap: 'char',
        lineHeight: gap / fs,
        padding: 0,
      },
    },
  ];
}

function ruledNodes(o: RuledText, ctx: DescribeContext): NodeDesc[] {
  const empty = o.text.trim() === '';
  if (empty && !ctx.placeholder) return [];
  const out: NodeDesc[] = [
    // 枠のどこを触っても選べるように（見えない当たり判定）
    { kind: 'Rect', config: { width: o.boxWidth, height: o.boxHeight, fill: 'rgba(0,0,0,0)' } },
  ];
  if (o.background && !empty) {
    out.push({
      kind: 'Rect',
      config: { width: o.boxWidth, height: o.boxHeight, fill: withAlpha(o.background, o.backgroundOpacity ?? 1) },
    });
  }
  if (o.ruleColor) out.push(ruleLinesNode(o, o.ruleColor, false));
  else if (ctx.placeholder && (empty || ctx.selected)) out.push(ruleLinesNode(o, 'rgba(10,132,255,0.6)', true));
  if (empty) {
    out.push({
      kind: 'Rect',
      config: { width: o.boxWidth, height: o.boxHeight, fill: 'rgba(10,132,255,0.06)', listening: false },
    });
    const fs = Math.min(o.ruleGap * 0.45, (o.vertical ? o.boxHeight : o.boxWidth) / (PLACEHOLDER_LABEL.length + 2));
    out.push(
      o.vertical
        ? {
            kind: 'Shape',
            config: {
              listening: false,
              sceneFunc: (context: Konva.Context) => {
                const c = (context as unknown as { _context: CanvasRenderingContext2D })._context;
                c.font = `${fs}px ${fontCss('gothic')}`;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillStyle = '#0a84ff';
                const chars = [...PLACEHOLDER_LABEL];
                const cx = o.boxWidth - o.ruleGap / 2;
                const top = (o.boxHeight - chars.length * fs) / 2;
                chars.forEach((ch, i) => c.fillText(ch, cx, top + fs * (i + 0.5)));
              },
            },
          }
        : {
            kind: 'Text',
            config: {
              text: PLACEHOLDER_LABEL,
              width: o.boxWidth,
              height: o.ruleGap,
              align: 'center',
              verticalAlign: 'middle',
              wrap: 'none',
              fontSize: fs,
              fontFamily: fontCss('gothic'),
              fill: '#0a84ff',
              listening: false,
            },
          },
    );
    return out;
  }
  out.push(...ruledTextNodes(o));
  return out;
}

export function dashArray(dash: DashStyle, w: number): number[] | undefined {
  if (dash === 'dashed') return [w * 3, w * 2];
  if (dash === 'dotted') return [0.001, w * 2];
  return undefined;
}

export function describeObject(o: EditorObject, ctx: DescribeContext): NodeDesc {
  const group: NodeDesc = {
    kind: 'Group',
    config: { id: o.id, name: 'obj', x: o.x, y: o.y, rotation: o.rotation, opacity: o.opacity },
    children: [],
  };
  const children = group.children!;

  switch (o.type) {
    case 'text': {
      if (isRuledText(o)) {
        children.push(...ruledNodes(o, ctx));
        break;
      }
      if (o.text.trim() === '') {
        if (ctx.placeholder) children.push(...placeholderNodes(o));
        break;
      }
      if (o.background) {
        const m = measureText(o);
        children.push({
          kind: 'Rect',
          config: {
            width: m.width,
            height: m.height,
            fill: withAlpha(o.background, o.backgroundOpacity ?? 1),
            cornerRadius: o.fontSize * 0.15,
          },
        });
      }
      if (o.vertical) children.push({ kind: 'Shape', config: verticalTextConfig(o) });
      else children.push({ kind: 'Text', config: textConfig(o) });
      break;
    }
    case 'math': {
      if (ctx.mathImage) {
        children.push({ kind: 'Image', config: { image: ctx.mathImage, width: o.width, height: o.height } });
      } else {
        children.push({
          kind: 'Rect',
          config: { width: o.width, height: o.height, fill: 'rgba(0,0,0,0.03)' },
        });
      }
      break;
    }
    case 'pen':
    case 'highlighter': {
      children.push({
        kind: 'Line',
        config: {
          points: o.points,
          stroke: o.color,
          strokeWidth: o.strokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
          tension: 0,
          hitStrokeWidth: Math.max(o.strokeWidth, ctx.hitPad),
          // 蛍光ペンは乗算合成で下の文字を読みやすく保つ
          globalCompositeOperation: o.type === 'highlighter' ? 'multiply' : 'source-over',
        },
      });
      break;
    }
    case 'line':
    case 'arrow': {
      const base = {
        points: o.points,
        stroke: o.color,
        strokeWidth: o.strokeWidth,
        lineCap: 'round',
        lineJoin: 'round',
        dash: dashArray(o.dash, o.strokeWidth),
        hitStrokeWidth: Math.max(o.strokeWidth, ctx.hitPad),
      };
      if (o.arrowStart || o.arrowEnd) {
        children.push({
          kind: 'Arrow',
          config: {
            ...base,
            fill: o.color,
            pointerLength: o.arrowSize,
            pointerWidth: o.arrowSize * 0.9,
            pointerAtBeginning: o.arrowStart,
            pointerAtEnding: o.arrowEnd,
          },
        });
      } else {
        children.push({ kind: 'Line', config: base });
      }
      break;
    }
    case 'rect':
    case 'ellipse':
    case 'triangle': {
      const style = {
        stroke: o.strokeColor ?? undefined,
        strokeWidth: o.strokeWidth,
        strokeEnabled: !!o.strokeColor && o.strokeWidth > 0,
        fill: o.fill ? withAlpha(o.fill, o.fillOpacity) : undefined,
        dash: dashArray(o.dash, o.strokeWidth),
        lineJoin: 'round',
        lineCap: o.dash === 'dotted' ? 'round' : 'butt',
        hitStrokeWidth: Math.max(o.strokeWidth, ctx.hitPad),
      };
      if (o.type === 'rect') {
        children.push({ kind: 'Rect', config: { ...style, width: o.width, height: o.height } });
      } else if (o.type === 'ellipse') {
        children.push({
          kind: 'Ellipse',
          config: { ...style, x: o.width / 2, y: o.height / 2, radiusX: o.width / 2, radiusY: o.height / 2 },
        });
      } else {
        children.push({
          kind: 'Line',
          config: { ...style, points: [o.width / 2, 0, o.width, o.height, 0, o.height], closed: true },
        });
      }
      break;
    }
  }
  return group;
}

const CTORS: Record<NodeKind, new (config: Record<string, unknown>) => Konva.Node> = {
  Group: Konva.Group as never,
  Rect: Konva.Rect as never,
  Ellipse: Konva.Ellipse as never,
  Line: Konva.Line as never,
  Arrow: Konva.Arrow as never,
  Text: Konva.Text as never,
  Image: Konva.Image as never,
  Shape: Konva.Shape as never,
};

/** 記述から Konva ノードを直接生成（書き出し・描画中プレビュー用） */
export function buildNode(desc: NodeDesc): Konva.Node {
  const node = new CTORS[desc.kind](desc.config);
  if (desc.children) for (const c of desc.children) (node as Konva.Group).add(buildNode(c) as Konva.Shape);
  return node;
}
