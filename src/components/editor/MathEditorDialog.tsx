// 数式エディター：MathLive による記号入力 ＋ MathJax によるリアルタイムプレビュー ＋ LaTeX 直接入力
import { MathfieldElement } from 'mathlive';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createMath } from '../../canvas/objectFactory';
import { viewCenterInImage } from '../../canvas/viewActions';
import { isBlankLatex } from '../../math/latex';
import { renderMathSvg } from '../../math/mathRenderer';
import { PALETTE, toPlainLatex, type PaletteItem } from '../../math/palette';
import { currentPageOf, useEditor, type MathEditState } from '../../store/editorStore';
import { useSettings } from '../../store/settingsStore';
import { toast } from '../../store/toastStore';
import { Button, cx, IconButton, Segmented } from '../ui/primitives';
import { MathTemplatePanel } from './MathTemplatePanel';

MathfieldElement.fontsDirectory = `${import.meta.env.BASE_URL}mathlive/fonts`;
MathfieldElement.soundsDirectory = null;

export function MathEditorDialog() {
  const state = useEditor((s) => s.mathEdit);
  if (!state) return null;
  return <MathEditor key={`${state.targetId}-${state.at?.x}-${state.at?.y}`} state={state} />;
}

function MathEditor({ state }: { state: MathEditState }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [latex, setLatex] = useState(state.initialLatex);
  const [mode, setMode] = useState<'visual' | 'latex'>('visual');
  const [group, setGroup] = useState(PALETTE[0].key);
  const [preview, setPreview] = useState<{ svg?: string; error?: string; loading?: boolean }>({ loading: true });
  const [busy, setBusy] = useState(false);
  const close = useEditor((s) => s.closeMathEditor);
  const mathSettings = useSettings((s) => s.tools.math);
  const target = useEditor((s) => {
    if (!state.targetId) return null;
    const o = currentPageOf(s)?.objects.find((x) => x.id === state.targetId);
    return o?.type === 'math' ? o : null;
  });
  const color = target?.color ?? mathSettings.color;

  // MathLive 入力欄の生成
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mf = new MathfieldElement();
    mf.value = state.initialLatex;
    mf.smartFence = true;
    mf.mathVirtualKeyboardPolicy = 'auto';
    mf.setAttribute('aria-label', '数式入力欄');
    mf.className = 'mojiire-mathfield';
    const onInput = () => setLatex(mf.getValue('latex-expanded'));
    mf.addEventListener('input', onInput);
    // 日本語入力（IME）がオンのまま打つと、MathLive は変換開始時に □ を含む数式ごと消してしまう。
    // 変換中のイベントは MathLive に渡さず、確定した文字を半角にしてキー入力として入れる。
    const blockIme = (e: Event) => e.stopPropagation();
    const onCompositionEnd = (e: CompositionEvent) => {
      e.stopPropagation();
      const sink = e.composedPath()[0];
      if (sink instanceof HTMLElement) sink.textContent = '';
      const text = (e.data ?? '').normalize('NFKC');
      if (text) mf.executeCommand(['typedText', text]);
    };
    const onImeInput = (e: Event) => {
      const type = (e as InputEvent).inputType;
      if (type === 'insertCompositionText' || type === 'insertFromComposition') e.stopPropagation();
    };
    mf.addEventListener('compositionstart', blockIme, true);
    mf.addEventListener('compositionupdate', blockIme, true);
    mf.addEventListener('compositionend', onCompositionEnd, true);
    mf.addEventListener('input', onImeInput, true);
    host.appendChild(mf);
    mfRef.current = mf;
    const t = setTimeout(() => mf.focus(), 60);
    return () => {
      clearTimeout(t);
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('compositionstart', blockIme, true);
      mf.removeEventListener('compositionupdate', blockIme, true);
      mf.removeEventListener('compositionend', onCompositionEnd, true);
      mf.removeEventListener('input', onImeInput, true);
      window.mathVirtualKeyboard?.hide();
      mf.remove();
      mfRef.current = null;
    };
  }, [state.initialLatex]);

  // リアルタイムプレビュー（キャンバス・書き出しと同じ描画処理）
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (isBlankLatex(latex)) {
        setPreview({});
        return;
      }
      try {
        const r = await renderMathSvg(latex, 36, color);
        if (alive) setPreview({ svg: r.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${r.width}" height="${r.height}"`) });
      } catch (e) {
        if (alive) setPreview({ error: e instanceof Error ? e.message : String(e) });
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [latex, color]);

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const insert = (item: PaletteItem, replaceAll = false) => {
    if (mode === 'latex') {
      const ta = textRef.current;
      const snippet = toPlainLatex(item.latex);
      if (!ta) return;
      const next = replaceAll
        ? snippet
        : ta.value.slice(0, ta.selectionStart) + snippet + ta.value.slice(ta.selectionEnd);
      setLatex(next);
      mfRef.current?.setValue(next, { silenceNotifications: true });
      return;
    }
    const mf = mfRef.current;
    if (!mf) return;
    if (replaceAll) mf.setValue('', { silenceNotifications: true });
    // 直前に \text{…} を入れていると入力欄が文字モードのままになるため、常に数式として挿入する
    mf.executeCommand(['insert', item.latex, { selectionMode: 'placeholder', focus: true, mode: 'math' }]);
    setLatex(mf.getValue('latex-expanded'));
  };

  const submit = async () => {
    if (isBlankLatex(latex) || busy) return;
    setBusy(true);
    try {
      const st = useEditor.getState();
      const page = currentPageOf(st);
      if (!page) return;
      if (target) {
        const r = await renderMathSvg(latex, target.fontSize, target.color);
        st.updateObjects({ [target.id]: { latex, width: r.width, height: r.height } });
      } else {
        const s = useSettings.getState().tools.math;
        const r = await renderMathSvg(latex, s.fontSize * page.unit, s.color);
        st.addObject(createMath(state.at ?? viewCenterInImage(), latex, r, s, page.unit), { select: true });
      }
      close();
    } catch (e) {
      toast('数式に誤りがあります：' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setBusy(false);
    }
  };

  const items = PALETTE.find((g) => g.key === group)?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-2 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="数式エディター"
        className="flex max-h-[calc(100dvh-16px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2.5">
          <h2 className="text-[17px] font-semibold">{target ? '数式を編集' : '数式を入力'}</h2>
          <div className="ml-auto w-52">
            <Segmented
              ariaLabel="入力モード"
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m === 'visual') setTimeout(() => mfRef.current?.focus(), 30);
              }}
              options={[
                { value: 'visual', label: '記号入力' },
                { value: 'latex', label: 'LaTeX' },
              ]}
            />
          </div>
          <IconButton label="閉じる" onClick={close} className="h-10 w-10">
            <X size={20} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {/* 入力欄 */}
          <div className={cx(mode !== 'visual' && 'hidden')}>
            <div ref={hostRef} className="rounded-xl border border-neutral-300 focus-within:border-[#0a84ff] focus-within:ring-2 focus-within:ring-[#0a84ff]/25" />
            <p className="mt-1 text-xs text-neutral-500">□ をタップして値を入力できます。「/」で分数、「^」で累乗、「_」で下付き文字。</p>
          </div>
          {mode === 'latex' && (
            <textarea
              ref={textRef}
              aria-label="LaTeX入力"
              value={latex}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => {
                setLatex(e.target.value);
                mfRef.current?.setValue(e.target.value, { silenceNotifications: true });
              }}
              className="h-24 w-full rounded-xl border border-neutral-300 p-3 font-mono text-[15px] outline-none focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/25"
              placeholder="例: x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}"
            />
          )}

          {/* プレビュー */}
          <div>
            <div className="mb-1 text-xs font-semibold text-neutral-500">プレビュー（配置・書き出しと同じ表示）</div>
            <div className="flex min-h-[84px] items-center justify-center overflow-x-auto rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200 ring-inset">
              {preview.error ? (
                <span className="text-sm text-[#ff3b30]">数式に誤りがあります：{preview.error}</span>
              ) : preview.svg ? (
                <div className="max-w-full" dangerouslySetInnerHTML={{ __html: preview.svg }} />
              ) : (
                <span className="text-sm text-neutral-400">{preview.loading && latex ? '準備中…' : 'ここに数式が表示されます'}</span>
              )}
            </div>
          </div>

          {/* テンプレート集 */}
          <MathTemplatePanel onPick={(t) => insert(t)} />

          {/* 記号パレット */}
          <div>
            <div className="mb-1.5 text-xs font-semibold text-neutral-500">記号</div>
            <div className="no-scrollbar -mx-1 mb-2 flex gap-1 overflow-x-auto px-1">
              {PALETTE.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGroup(g.key)}
                  className={cx(
                    'tap h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium',
                    group === g.key ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5">
              {items.map((it) => (
                <button
                  key={it.label + it.latex}
                  type="button"
                  title={it.title ?? it.label}
                  aria-label={it.title ?? it.label}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => insert(it)}
                  className="tap h-11 rounded-lg bg-neutral-100 font-serif text-[17px] hover:bg-neutral-200 active:bg-neutral-300"
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3">
          <Button onClick={close}>キャンセル</Button>
          <Button variant="primary" onClick={submit} disabled={isBlankLatex(latex) || !!preview.error || busy}>
            <Check size={18} /> {target ? '更新' : '挿入'}
          </Button>
        </div>
      </div>
    </div>
  );
}
