// 文字の入力画面。上部に「横書き／縦書き／数式を入力」と「完了」。
// 入力欄は常に DOM に置いておき、タップ処理の中で同期的にフォーカスする（iPad でキーボードを出すため）。
import { Sigma } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { measureText } from '../../canvas/describe';
import { refreshCaret, registerTextArea } from '../../canvas/textEditController';
import { addReading, countChars, countReadingChars, isKana } from '../../lib/charCount';
import { useEditor } from '../../store/editorStore';
import { useSettings } from '../../store/settingsStore';
import { fontCss } from '../../types/model';
import { cx } from '../ui/primitives';

export function TextInputModal() {
  const ref = useRef<HTMLTextAreaElement>(null);
  // 変換中（IME）に最後に表示されていた「かなだけ」の文字列。漢字に変換されたときの読みとして使う
  const lastKana = useRef('');
  // IME で変換中かどうか（変換中に選択位置を動かすと変換が途切れるため）
  const composing = useRef(false);
  const te = useEditor((s) => s.textEdit);
  const updateTextDraft = useEditor((s) => s.updateTextDraft);
  const commitTextEdit = useEditor((s) => s.commitTextEdit);

  useEffect(() => {
    registerTextArea(ref.current);
    return () => registerTextArea(null);
  }, []);

  // 閉じたらフォーカスを外して iPad のキーボードを閉じる
  useEffect(() => {
    if (!te && document.activeElement === ref.current) ref.current?.blur();
  }, [te]);

  const obj = te?.obj;
  const vertical = !!obj?.vertical;
  const open = !!obj;
  const fontFamily = obj?.fontFamily;
  const bold = !!obj?.bold;
  const italic = !!obj?.italic;

  // iPad では入力欄を隠した状態でフォーカスするため、表示されたあとにカーソルの大きさを描き直す。
  // フォントの読み込みが終わったときも同じ。
  useLayoutEffect(() => {
    if (!open) return;
    const refresh = () => {
      if (!composing.current) refreshCaret();
    };
    const raf = requestAnimationFrame(refresh);
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) requestAnimationFrame(refresh);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [open, vertical, fontFamily, bold, italic]);
  const text = obj?.text ?? '';
  // 漢字に変換した語は読みの文字数で数える（例: 邪悪 → じゃあく で4文字）
  const charCount = countReadingChars(text, obj?.readings);
  const plainCount = countChars(text);

  const onCompositionStart = () => {
    composing.current = true;
    lastKana.current = '';
  };
  const onCompositionUpdate = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    if (e.data && isKana(e.data)) lastKana.current = e.data;
  };
  const onCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    composing.current = false;
    const committed = e.data;
    const reading = lastKana.current;
    lastKana.current = '';
    if (!committed || !reading || isKana(committed) || committed === reading) return;
    const cur = useEditor.getState().textEdit?.obj;
    updateTextDraft({ readings: addReading(cur?.readings, committed, reading) });
  };

  const done = () => commitTextEdit({ select: true });

  const setVertical = (v: boolean) => {
    updateTextDraft({ vertical: v });
    useSettings.getState().setTool('text', { vertical: v });
  };

  // 「数式を入力」：入力中の文字を確定して、その位置（文字があればその下）に数式を追加
  const openMath = () => {
    const st = useEditor.getState();
    const cur = st.textEdit;
    if (!cur) return;
    const o = { ...cur.obj, text: ref.current?.value ?? cur.obj.text };
    const fs = o.fontSize;
    let at: { x: number; y: number };
    if (o.text.trim()) {
      const m = measureText(o);
      st.updateTextDraft({ text: o.text });
      st.commitTextEdit();
      // 文字のすぐ下に置く（縦書き・横書き共通）
      at = { x: o.x, y: o.y + m.height + fs * 0.8 };
    } else {
      st.cancelTextEdit();
      at = { x: o.x, y: o.y + fs * 0.75 };
    }
    ref.current?.blur();
    st.openMathEditor({ targetId: null, at, initialLatex: '' });
  };

  const keepFocus = (e: React.PointerEvent) => e.preventDefault();

  return (
    <div
      className={cx(
        obj
          ? 'fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-2 sm:p-6'
          : 'pointer-events-none fixed top-0 -left-[10000px] opacity-0',
      )}
      style={obj ? { paddingTop: 'max(8px, env(safe-area-inset-top))' } : undefined}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) done();
      }}
    >
      <div
        role={obj ? 'dialog' : undefined}
        aria-label="文字を入力"
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ height: 'min(44dvh, 420px)', minHeight: 220 }}
      >
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-neutral-200 px-2">
          {[
            { v: false, label: '横書き' },
            { v: true, label: '縦書き' },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={vertical === t.v}
              onPointerDown={keepFocus}
              onClick={() => setVertical(t.v)}
              className={cx(
                'tap h-10 rounded-lg px-3 text-[15px] font-medium',
                vertical === t.v ? 'text-[#0a84ff] underline decoration-2 underline-offset-[6px]' : 'text-neutral-500',
              )}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onPointerDown={keepFocus}
            onClick={openMath}
            className="tap ml-1 flex h-10 items-center gap-1 rounded-lg px-3 text-[15px] font-medium text-[#0a84ff] hover:bg-[#0a84ff]/10"
          >
            <Sigma size={17} aria-hidden /> 数式を入力
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={done}
            className="tap h-10 rounded-lg px-4 text-[16px] font-semibold text-[#0a84ff] hover:bg-[#0a84ff]/10"
          >
            完了
          </button>
        </div>
        <textarea
          ref={ref}
          aria-label="テキストを入力"
          placeholder="ここに文字を入力"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          tabIndex={obj ? 0 : -1}
          className="min-h-0 w-full flex-1 resize-none overflow-auto bg-white p-4 text-neutral-900 outline-none placeholder:text-neutral-400"
          style={{
            writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
            textOrientation: 'mixed',
            // font の一括指定と fontSize を混ぜると再描画時に文字サイズが消えることがあるため個別に指定
            fontFamily: obj ? fontCss(obj.fontFamily) : undefined,
            fontWeight: obj?.bold ? 'bold' : 'normal',
            fontStyle: obj?.italic ? 'italic' : 'normal',
            lineHeight: 1.6,
            fontSize: 22, // iOS で入力時に画面が拡大されないよう 16px 以上
          }}
          onInput={(e) => updateTextDraft({ text: e.currentTarget.value })}
          onCompositionStart={onCompositionStart}
          onCompositionUpdate={onCompositionUpdate}
          onCompositionEnd={onCompositionEnd}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'Escape') {
              e.preventDefault();
              done();
            }
          }}
        />
        <div
          aria-live="polite"
          className="flex h-8 shrink-0 items-center justify-end border-t border-neutral-100 px-4 text-[13px] tabular-nums text-neutral-500"
        >
          {charCount}文字
          {charCount !== plainCount && <span className="ml-2 text-neutral-400">（表記 {plainCount}文字）</span>}
        </div>
      </div>
    </div>
  );
}
