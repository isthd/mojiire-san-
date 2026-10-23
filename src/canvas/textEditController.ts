// テキスト入力欄へのフォーカスをユーザー操作のイベント内で同期的に行うためのコントローラー。
// iPad の Safari では、タップ処理の中で focus() しないとソフトウェアキーボードが表示されない。
import { currentPageOf, useEditor } from '../store/editorStore';
import { useSettings } from '../store/settingsStore';
import type { TextObject } from '../types/model';
import { placeholderSize } from './describe';
import { createText } from './objectFactory';
import { viewCenterInImage } from './viewActions';

let textarea: HTMLTextAreaElement | null = null;

export function registerTextArea(el: HTMLTextAreaElement | null): void {
  textarea = el;
}

export function beginTextEdit(obj: TextObject, isNew: boolean): void {
  useEditor.getState().startTextEdit(obj, isNew);
  if (!textarea) return;
  textarea.value = obj.text;
  textarea.focus({ preventScroll: true });
  const end = textarea.value.length;
  textarea.setSelectionRange(end, end);
}

export function focusTextArea(): void {
  textarea?.focus({ preventScroll: true });
}

/** ⊕ボタン：表示中の画面の中央に「ダブルタップで入力」の文字枠を置く（ダブルタップで入力を始める） */
export function addTextAtCenter(): void {
  const st = useEditor.getState();
  const page = currentPageOf(st);
  if (!page) return;
  if (st.tool !== 'select') st.setTool('select');
  const c = viewCenterInImage();
  const obj = createText(c, useSettings.getState().tools.text, page.unit);
  const size = placeholderSize(obj);
  st.addObject({ ...obj, x: c.x - size.width / 2, y: c.y - size.height / 2 }, { select: true });
}
