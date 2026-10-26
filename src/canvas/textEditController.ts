// テキスト入力欄へのフォーカスをユーザー操作のイベント内で同期的に行うためのコントローラー。
// iPad の Safari では、タップ処理の中で focus() しないとソフトウェアキーボードが表示されない。
import { currentPageOf, useEditor } from '../store/editorStore';
import { useSettings } from '../store/settingsStore';
import { fontCss, type TextObject } from '../types/model';
import { placeholderSize } from './describe';
import { createText } from './objectFactory';
import { viewCenterInImage } from './viewActions';

let textarea: HTMLTextAreaElement | null = null;

export function registerTextArea(el: HTMLTextAreaElement | null): void {
  textarea = el;
}

/**
 * 入力欄の見た目（フォント・縦書きなど）を直接当てる。
 * iPad はフォーカスした時点の見た目でカーソルの大きさを決めるので、focus() の前に呼ぶ。
 */
export function applyTextAreaStyle(el: HTMLTextAreaElement, obj: TextObject): void {
  el.style.fontFamily = fontCss(obj.fontFamily);
  el.style.fontWeight = obj.bold ? 'bold' : 'normal';
  el.style.fontStyle = obj.italic ? 'italic' : 'normal';
  el.style.writingMode = obj.vertical ? 'vertical-rl' : 'horizontal-tb';
}

/**
 * iPad で、表示やフォントが変わったあともカーソルが小さいまま残るのを直す。
 * 選択位置を一度動かして戻すと、いまの見た目に合わせてカーソルが描き直される。
 */
export function refreshCaret(): void {
  const el = textarea;
  if (!el || document.activeElement !== el) return;
  const { selectionStart: s, selectionEnd: e, selectionDirection: d } = el;
  const len = el.value.length;
  if (len === 0) {
    el.value = ' ';
    el.setSelectionRange(1, 1);
    el.value = '';
    el.setSelectionRange(0, 0);
    return;
  }
  const tmp = s > 0 ? s - 1 : Math.min(e + 1, len);
  el.setSelectionRange(tmp, tmp);
  el.setSelectionRange(s, e, d ?? undefined);
}

export function beginTextEdit(obj: TextObject, isNew: boolean): void {
  useEditor.getState().startTextEdit(obj, isNew);
  if (!textarea) return;
  applyTextAreaStyle(textarea, obj);
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
