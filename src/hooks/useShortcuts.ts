// キーボードショートカット（Windows: Ctrl / Mac: Command）。入力欄の編集中は動作しない。
import { useEffect } from 'react';
import { addTextAtCenter } from '../canvas/textEditController';
import { fitToScreen, zoomBy, zoomTo } from '../canvas/viewActions';
import { addImagesToProject } from '../components/editor/addImages';
import { TOOLS } from '../components/editor/tools';
import { flushSave } from '../storage/autosave';
import { currentPageOf, useEditor } from '../store/editorStore';
import { toast } from '../store/toastStore';

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'MATH-FIELD'].includes(t.tagName);
}

export function useShortcuts(): void {
  useEffect(() => {
    let pendingPaste: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      if (st.mathEdit || st.modal || st.busy) return;
      if (e.isComposing || isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const sel = st.selectedIds;

      if (mod) {
        let handled = true;
        if (key === 'z' && !e.shiftKey) st.undo();
        else if (key === 'y' || (key === 'z' && e.shiftKey)) st.redo();
        else if (key === 'c') {
          if (sel.length) st.copy(sel);
          else handled = false;
        } else if (key === 'x') {
          if (sel.length) {
            st.copy(sel);
            st.deleteObjects(sel);
          } else handled = false;
        } else if (key === 'v') {
          // 画像の貼り付け（paste イベント）を優先し、なければオブジェクトを貼り付け
          if (pendingPaste) clearTimeout(pendingPaste);
          pendingPaste = setTimeout(() => {
            pendingPaste = null;
            useEditor.getState().paste();
          }, 120);
          handled = false;
        } else if (key === 'd') {
          if (sel.length) st.duplicate(sel);
        } else if (key === 'a') {
          const page = currentPageOf(st);
          if (page) {
            if (st.tool !== 'select') st.setTool('select');
            useEditor.getState().select(page.objects.map((o) => o.id));
          }
        } else if (key === 's') {
          st.commitTextEdit();
          void flushSave().then(() => toast('保存しました'));
        } else if (key === '0') fitToScreen();
        else if (key === '1') zoomTo(1);
        else if (key === '=' || key === '+' || key === ';') zoomBy(1.25);
        else if (key === '-') zoomBy(0.8);
        else handled = false;
        if (handled) e.preventDefault();
        return;
      }

      if (e.altKey) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) {
        e.preventDefault();
        st.deleteObjects(sel);
        return;
      }
      if (e.key === 'Escape') {
        st.select([]);
        return;
      }
      if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault();
        const page = currentPageOf(st);
        if (!page) return;
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.updateObjects(
          Object.fromEntries(
            page.objects.filter((o) => sel.includes(o.id)).map((o) => [o.id, { x: o.x + dx, y: o.y + dy }]),
          ),
          'nudge',
        );
        return;
      }
      if (key === 't' && !e.shiftKey) {
        e.preventDefault();
        addTextAtCenter();
        return;
      }
      const tool = TOOLS.find((t) => t.key === key);
      if (tool && !e.shiftKey) st.setTool(tool.id);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const st = useEditor.getState();
      if (st.mathEdit || st.modal || !st.projectId) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        if (pendingPaste) {
          clearTimeout(pendingPaste);
          pendingPaste = null;
        }
        void addImagesToProject(files);
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      if (pendingPaste) clearTimeout(pendingPaste);
    };
  }, []);
}
