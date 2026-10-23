// 編集データの型定義。表示状態（Konvaノード）に依存しない純粋なデータとして扱う。
// 座標・サイズはすべて「画像座標（元画像のピクセル）」で保持する。

export type ObjectType =
  | 'text'
  | 'math'
  | 'pen'
  | 'highlighter'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'triangle';

export type DashStyle = 'solid' | 'dashed' | 'dotted';
export type TextAlign = 'left' | 'center' | 'right';
export type FontKey = 'gothic' | 'mincho' | 'maru' | 'kyokasho';

interface BaseObject {
  id: string;
  type: ObjectType;
  /** オブジェクト原点（左上）の画像座標 */
  x: number;
  y: number;
  /** 度数法 */
  rotation: number;
  /** 0〜1 */
  opacity: number;
  /** 将来のロック機能用 */
  locked?: boolean;
  /** 将来のグループ化用 */
  groupId?: string | null;
}

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  fontFamily: FontKey;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  background: string | null;
  outlineColor: string | null;
  outlineWidth: number;
  // 以下は後から追加した項目（古いデータでは未定義 → 既定値で扱う）
  /** 縦書き */
  vertical?: boolean;
  /** 文字の間隔（フォントサイズに対する比率、0 = 標準） */
  letterSpacing?: number;
  /** 行の間隔（フォントサイズに対する倍率） */
  lineHeight?: number;
  /** 背景色の不透明度 0〜1 */
  backgroundOpacity?: number;
  /** 縁取りの不透明度 0〜1 */
  outlineOpacity?: number;
  /** 未入力の枠（「ダブルタップで入力」）の表示サイズ。回答欄に自動配置したときは欄の大きさ */
  fieldWidth?: number;
  fieldHeight?: number;
}

/** 文字が未入力のテキスト枠（編集画面では「ダブルタップで入力」の枠として表示し、書き出しには含めない） */
export function isEmptyText(o: EditorObject): o is TextObject {
  return o.type === 'text' && o.text.trim() === '';
}

export const DEFAULT_LINE_HEIGHT = 1.25;

export interface MathObject extends BaseObject {
  type: 'math';
  /** 内部データはLaTeXで保持 */
  latex: string;
  fontSize: number;
  color: string;
  /** 描画結果のサイズ（画像座標） */
  width: number;
  height: number;
}

export interface StrokeObject extends BaseObject {
  type: 'pen' | 'highlighter';
  /** 原点からの相対座標 [x0,y0,x1,y1,...] */
  points: number[];
  color: string;
  strokeWidth: number;
}

export interface LineObject extends BaseObject {
  type: 'line' | 'arrow';
  /** 原点からの相対座標 [x1,y1,x2,y2] */
  points: [number, number, number, number];
  color: string;
  strokeWidth: number;
  dash: DashStyle;
  arrowStart: boolean;
  arrowEnd: boolean;
  arrowSize: number;
}

export interface ShapeObject extends BaseObject {
  type: 'rect' | 'ellipse' | 'triangle';
  width: number;
  height: number;
  strokeColor: string | null;
  strokeWidth: number;
  fill: string | null;
  fillOpacity: number;
  dash: DashStyle;
}

export type EditorObject = TextObject | MathObject | StrokeObject | LineObject | ShapeObject;

export interface Page {
  id: string;
  /** IndexedDB の images ストアのキー */
  imageId: string;
  width: number;
  height: number;
  /** 表示用サイズ単位（長辺1000を基準とした1単位あたりの画像px） */
  unit: number;
  objects: EditorObject[];
}

export interface ProjectDoc {
  pages: Page[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  thumbnail: Blob | null;
}

export const ERASABLE_TYPES: ReadonlySet<ObjectType> = new Set<ObjectType>([
  'pen',
  'highlighter',
  'line',
  'arrow',
  'rect',
  'ellipse',
  'triangle',
]);

export const FONT_OPTIONS: { key: FontKey; label: string; css: string }[] = [
  {
    key: 'gothic',
    label: 'ゴシック',
    css: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","Yu Gothic","Meiryo","Noto Sans JP",sans-serif',
  },
  {
    key: 'mincho',
    label: '明朝',
    css: '"Hiragino Mincho ProN","Yu Mincho","YuMincho","MS PMincho","Noto Serif JP",serif',
  },
  { key: 'maru', label: '丸ゴシック', css: '"Zen Maru Gothic","Hiragino Maru Gothic ProN",sans-serif' },
  { key: 'kyokasho', label: '教科書体', css: '"Klee One","UD Digi Kyokasho N-R",serif' },
];

export function fontCss(key: FontKey): string {
  return (FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0]).css;
}

export function pageUnit(width: number, height: number): number {
  return Math.max(width, height) / 1000;
}
