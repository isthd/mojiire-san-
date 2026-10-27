import {
  Circle,
  Eraser,
  Hand,
  Highlighter,
  Minus,
  MousePointer2,
  MoveUpRight,
  NotebookPen,
  Pen,
  Sigma,
  Square,
  Triangle,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ToolType } from '../../store/editorStore';

export interface ToolDef {
  id: ToolType;
  label: string;
  icon: LucideIcon;
  /** キーボードショートカット（1文字） */
  key?: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: '選択・移動', icon: MousePointer2, key: 'v' },
  { id: 'text', label: 'テキスト', icon: Type },
  { id: 'math', label: '数式', icon: Sigma },
  { id: 'pen', label: 'ペン', icon: Pen, key: 'p' },
  { id: 'highlighter', label: '蛍光ペン', icon: Highlighter, key: 'h' },
  { id: 'line', label: '直線', icon: Minus, key: 'l' },
  { id: 'arrow', label: '矢印', icon: MoveUpRight, key: 'a' },
  { id: 'rect', label: '四角形', icon: Square, key: 'r' },
  { id: 'ellipse', label: '円・楕円', icon: Circle, key: 'o' },
  { id: 'triangle', label: '三角形', icon: Triangle, key: 'g' },
  { id: 'ruled', label: '便箋（罫線テキスト）', icon: NotebookPen },
  { id: 'eraser', label: '消しゴム', icon: Eraser, key: 'e' },
  { id: 'hand', label: '手のひら（キャンバス移動）', icon: Hand },
];
