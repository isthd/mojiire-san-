// ツール設定からオブジェクトを生成する／オブジェクトの見た目をツール設定へ反映する。
import { uid } from '../lib/id';
import type { Point } from '../lib/geometry';
import {
  DEFAULT_LINE_HEIGHT,
  type EditorObject,
  type LineObject,
  type MathObject,
  type ShapeObject,
  type StrokeObject,
  type TextObject,
} from '../types/model';
import type { ToolSettings, ToolSettingsKey } from '../store/settingsStore';

const round = (v: number) => Math.round(v * 100) / 100;

export function createText(at: Point, s: ToolSettings['text'], unit: number): TextObject {
  const fontSize = s.fontSize * unit;
  return {
    id: uid(),
    type: 'text',
    // タップ位置が1文字目の付近に来るように配置（縦書きは右上が書き出し）
    x: s.vertical ? at.x - fontSize * s.lineHeight * 0.5 - fontSize * 0.15 : at.x - fontSize * 0.2,
    y: s.vertical ? at.y - fontSize * 0.3 : at.y - fontSize * 0.75,
    vertical: s.vertical,
    letterSpacing: s.letterSpacing,
    lineHeight: s.lineHeight,
    backgroundOpacity: s.backgroundOpacity,
    outlineOpacity: s.outlineOpacity,
    rotation: 0,
    opacity: s.opacity,
    text: '',
    fontFamily: s.fontFamily,
    fontSize,
    color: s.color,
    bold: s.bold,
    italic: s.italic,
    align: s.align,
    background: s.background,
    outlineColor: s.outlineColor,
    outlineWidth: s.outlineWidth * unit,
  };
}

export function createMath(
  at: Point,
  latex: string,
  size: { width: number; height: number },
  s: ToolSettings['math'],
  unit: number,
): MathObject {
  return {
    id: uid(),
    type: 'math',
    x: at.x,
    y: at.y - size.height / 2,
    rotation: 0,
    opacity: s.opacity,
    latex,
    fontSize: s.fontSize * unit,
    color: s.color,
    width: size.width,
    height: size.height,
  };
}

/** 絶対座標の点列からストロークを作成（原点＝最初の点） */
export function createStroke(
  type: 'pen' | 'highlighter',
  absPoints: number[],
  s: ToolSettings['pen'] | ToolSettings['highlighter'],
  unit: number,
): StrokeObject {
  const ox = absPoints[0];
  const oy = absPoints[1];
  const points = absPoints.map((v, i) => round(v - (i % 2 === 0 ? ox : oy)));
  return {
    id: uid(),
    type,
    x: ox,
    y: oy,
    rotation: 0,
    opacity: s.opacity,
    points,
    color: s.color,
    strokeWidth: s.width * unit,
  };
}

export function createLine(
  type: 'line' | 'arrow',
  a: Point,
  b: Point,
  settings: ToolSettings,
  unit: number,
): LineObject {
  const s = type === 'arrow' ? settings.arrow : settings.line;
  return {
    id: uid(),
    type,
    x: a.x,
    y: a.y,
    rotation: 0,
    opacity: s.opacity,
    points: [0, 0, round(b.x - a.x), round(b.y - a.y)],
    color: s.color,
    strokeWidth: s.width * unit,
    dash: s.dash,
    arrowStart: type === 'arrow' && settings.arrow.double,
    arrowEnd: type === 'arrow',
    arrowSize: settings.arrow.arrowSize * unit,
  };
}

export function createShape(
  type: 'rect' | 'ellipse' | 'triangle',
  rect: { x: number; y: number; width: number; height: number },
  s: ToolSettings['shape'],
  unit: number,
): ShapeObject {
  return {
    id: uid(),
    type,
    ...rect,
    rotation: 0,
    opacity: s.opacity,
    // 枠線・塗りつぶしが両方「なし」だと見えない図形になるので、その場合は枠線を既定色で描く
    strokeColor: s.strokeColor ?? (s.fill ? null : '#e5352b'),
    strokeWidth: s.strokeWidth * unit,
    fill: s.fill,
    fillOpacity: s.fillOpacity,
    dash: s.dash,
  };
}

/** オブジェクトの種類に対応するツール設定グループ */
export function settingsKeyFor(obj: EditorObject): ToolSettingsKey {
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'triangle':
      return 'shape';
    default:
      return obj.type;
  }
}

/** プロパティパネルの値（表示単位）の変更を、オブジェクトのデータ（画像px）へのパッチに変換 */
export function objectPatchFromSettings(
  obj: EditorObject,
  patch: Record<string, unknown>,
  unit: number,
): Partial<EditorObject> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => k in patch;
  if (has('opacity')) out.opacity = patch.opacity;
  switch (obj.type) {
    case 'text':
      for (const k of [
        'fontFamily',
        'color',
        'bold',
        'italic',
        'align',
        'background',
        'outlineColor',
        'vertical',
        'letterSpacing',
        'lineHeight',
        'backgroundOpacity',
        'outlineOpacity',
      ]) {
        if (has(k)) out[k] = patch[k];
      }
      if (has('fontSize')) out.fontSize = (patch.fontSize as number) * unit;
      if (has('outlineWidth')) out.outlineWidth = (patch.outlineWidth as number) * unit;
      break;
    case 'math':
      if (has('color')) out.color = patch.color;
      if (has('fontSize')) {
        const fontSize = (patch.fontSize as number) * unit;
        const k = fontSize / obj.fontSize;
        Object.assign(out, { fontSize, width: obj.width * k, height: obj.height * k });
      }
      break;
    case 'pen':
    case 'highlighter':
      if (has('color')) out.color = patch.color;
      if (has('width')) out.strokeWidth = (patch.width as number) * unit;
      break;
    case 'line':
    case 'arrow':
      if (has('color')) out.color = patch.color;
      if (has('width')) out.strokeWidth = (patch.width as number) * unit;
      if (has('dash')) out.dash = patch.dash;
      if (has('arrowSize')) out.arrowSize = (patch.arrowSize as number) * unit;
      if (has('double')) out.arrowStart = patch.double;
      break;
    default:
      for (const k of ['strokeColor', 'fill', 'fillOpacity', 'dash']) if (has(k)) out[k] = patch[k];
      if (has('strokeWidth')) out.strokeWidth = (patch.strokeWidth as number) * unit;
  }
  return out as Partial<EditorObject>;
}

/** 「直前の設定を保持」：編集したオブジェクトの見た目をツール設定に書き戻すための値 */
export function settingsFromObject(obj: EditorObject, unit: number): Partial<ToolSettings[ToolSettingsKey]> {
  const u = (v: number) => round(v / unit);
  switch (obj.type) {
    case 'text':
      return {
        fontFamily: obj.fontFamily,
        fontSize: u(obj.fontSize),
        color: obj.color,
        bold: obj.bold,
        italic: obj.italic,
        align: obj.align,
        background: obj.background,
        outlineColor: obj.outlineColor,
        outlineWidth: u(obj.outlineWidth),
        opacity: obj.opacity,
        vertical: obj.vertical ?? false,
        letterSpacing: obj.letterSpacing ?? 0,
        lineHeight: obj.lineHeight ?? DEFAULT_LINE_HEIGHT,
        backgroundOpacity: obj.backgroundOpacity ?? 1,
        outlineOpacity: obj.outlineOpacity ?? 1,
      };
    case 'math':
      return { fontSize: u(obj.fontSize), color: obj.color, opacity: obj.opacity };
    case 'pen':
    case 'highlighter':
      return { color: obj.color, width: u(obj.strokeWidth), opacity: obj.opacity };
    case 'line':
      return { color: obj.color, width: u(obj.strokeWidth), dash: obj.dash, opacity: obj.opacity };
    case 'arrow':
      return {
        color: obj.color,
        width: u(obj.strokeWidth),
        dash: obj.dash,
        double: obj.arrowStart && obj.arrowEnd,
        arrowSize: u(obj.arrowSize),
        opacity: obj.opacity,
      };
    default:
      return {
        strokeColor: obj.strokeColor,
        strokeWidth: u(obj.strokeWidth),
        fill: obj.fill,
        fillOpacity: obj.fillOpacity,
        dash: obj.dash,
        opacity: obj.opacity,
      };
  }
}
