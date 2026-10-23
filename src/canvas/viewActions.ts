// ズーム・表示位置の操作（ツールバーやショートカットから呼ぶ）
import { fitView, zoomAt, type Point, type View } from '../lib/geometry';
import { currentPageOf, useEditor } from '../store/editorStore';

/**
 * キャンバス表示領域のサイズ（EditorCanvas が更新）。
 * autoFit: 「画面に合わせる」状態のままなら、画面サイズ変更（回転など）時に再度合わせる。
 */
export const viewport = { width: 0, height: 0, autoFit: true };

function center(): Point {
  return { x: viewport.width / 2, y: viewport.height / 2 };
}

/** ユーザーが手動でズーム・移動した */
export function setUserView(view: View): void {
  viewport.autoFit = false;
  useEditor.getState().setView(view);
}

export function zoomBy(factor: number, at: Point = center()): void {
  const { view } = useEditor.getState();
  setUserView(zoomAt(view, view.zoom * factor, at));
}

export function zoomTo(zoom: number): void {
  const { view } = useEditor.getState();
  setUserView(zoomAt(view, zoom, center()));
}

export function fitToScreen(): void {
  const s = useEditor.getState();
  const page = currentPageOf(s);
  if (!page || !viewport.width || !viewport.height) return;
  const margin = Math.min(32, Math.min(viewport.width, viewport.height) * 0.04);
  viewport.autoFit = true;
  s.setView(fitView(viewport.width, viewport.height, page.width, page.height, margin));
}

/** 表示中央の画像座標 */
export function viewCenterInImage(): Point {
  const { view } = useEditor.getState();
  return { x: (viewport.width / 2 - view.x) / view.zoom, y: (viewport.height / 2 - view.y) / view.zoom };
}
