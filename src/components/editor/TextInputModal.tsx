// 文字の入力画面。上部に「横書き／縦書き／数式を入力」と「完了」。
// 入力欄は常に DOM に置いておき、タップ処理の中で同期的にフォーカスする（iPad でキーボードを出すため）。
import { Sigma } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { measureText } from '../../canvas/describe';
import { refreshCaret, registerTextArea } from '../../canvas/textEditController';
import { addReading, countChars, countReadingChars, isKana } from '../../lib/charCount';
import { toHiraganaText } from '../../lib/hiraganaOnly';
import {
  candidates as kkCandidates,
  convertBest,
  isConvertible,
  isKanaKanjiDictLoaded,
  loadKanaKanjiDict,
  type KKCandidate,
  type KKSegment,
} from '../../lib/kanaKanji';
import { guessReading, isReadingDictLoaded, loadReadingDict } from '../../lib/readingDict';
import { PUNCT, romajiToKana } from '../../lib/romaji';
import { useEditor } from '../../store/editorStore';
import { useSettings, type TextInputMode } from '../../store/settingsStore';
import { fontCss } from '../../types/model';
import { cx } from '../ui/primitives';
import { VerticalCaret } from './VerticalCaret';

const MODES: { v: TextInputMode; label: string }[] = [
  { v: 'normal', label: 'ふつう' },
  { v: 'hiragana', label: 'ひらがな' },
  { v: 'auto', label: '自動変換' },
];

/** 自動変換の候補バーに出している語（start の位置に text が入っている） */
interface ConvState {
  start: number;
  reading: string;
  text: string;
  /** まだ変換していない（打っている途中の）ひらがなか */
  live: boolean;
  cands: KKCandidate[] | null;
}

const isLowerRomaji = (c: string) => /^[a-z'-]$/.test(c);
const isKanaChar = (c: string | undefined) => !!c && /[ぁ-ゖァ-ヶー]/.test(c);

export function TextInputModal() {
  const ref = useRef<HTMLTextAreaElement>(null);
  // 変換中（IME）に最後に表示されていた「かなだけ」の文字列。漢字に変換されたときの読みとして使う
  const lastKana = useRef('');
  // IME で変換中かどうか（変換中に選択位置を動かすと変換が途切れるため）
  const composing = useRef(false);
  const te = useEditor((s) => s.textEdit);
  const updateTextDraft = useEditor((s) => s.updateTextDraft);
  const commitTextEdit = useEditor((s) => s.commitTextEdit);
  const mode = useSettings((s) => s.app.textInputMode);
  const setApp = useSettings((s) => s.setApp);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // 自動変換：英字やかなキーボードで打っている途中のひらがなの始まり（IME を使わずに打ったとき）
  const pending = useRef<number | null>(null);
  const [conv, setConv] = useState<ConvState | null>(null);
  const [dictReady, setDictReady] = useState(isKanaKanjiDictLoaded());

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
  // 予測変換の読みを調べる辞書を、入力画面を開いたときに読み込んでおく
  useEffect(() => {
    if (open) loadReadingDict().catch(() => {});
  }, [open]);
  // 自動変換の辞書は、自動変換のモードで入力画面を開いたときに読み込む
  useEffect(() => {
    if (!open || mode !== 'auto' || dictReady) return;
    let alive = true;
    loadKanaKanjiDict()
      .then(() => alive && setDictReady(true))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, mode, dictReady]);
  // 閉じたら・モードを変えたら、変換の途中の状態を消す
  useEffect(() => {
    pending.current = null;
    setConv(null);
  }, [open, mode, obj?.id]);

  const text = obj?.text ?? '';
  // 漢字に変換した語は読みの文字数で数える（例: 邪悪 → じゃあく で4文字）
  const charCount = countReadingChars(text, obj?.readings);
  const plainCount = countChars(text);

  const onCompositionStart = () => {
    composing.current = true;
    lastKana.current = '';
    if (modeRef.current === 'auto') {
      // 打っている途中のひらがなは、そのまま確定する
      pending.current = null;
      setConv(null);
    }
  };
  const onCompositionUpdate = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    if (e.data && isKana(e.data)) lastKana.current = e.data;
  };
  const onCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    composing.current = false;
    const committed = e.data;
    const reading = lastKana.current;
    lastKana.current = '';
    const m = modeRef.current;
    if (committed && m !== 'normal') {
      // 確定した文字が入力欄に反映されてから処理する（ブラウザによって input と compositionend の順が違うため）
      const typed = reading;
      setTimeout(() => {
        if (composing.current) return;
        const el = ref.current;
        if (!el) return;
        const pos = el.selectionEnd;
        const start = pos - committed.length;
        if (start < 0 || el.value.slice(start, pos) !== committed) return;
        if (m === 'hiragana') toHiraganaRange(start, pos, committed, typed);
        else if (isConvertible(committed)) autoConvert(start, pos);
      }, 0);
      if (m === 'hiragana') return;
    }
    if (!committed || !reading || isKana(committed) || committed === reading) return;
    recordReading(committed, reading);
  };

  // ---- 入力欄の書き換え ----
  const replaceRange = (start: number, end: number, str: string, patch?: Parameters<typeof updateTextDraft>[0]) => {
    const el = ref.current;
    if (!el) return;
    const old = el.selectionEnd;
    const v = el.value.slice(0, start) + str + el.value.slice(end);
    el.value = v;
    // カーソルが置き換える範囲より後ろにあったときは、その位置を保つ
    const caret = old > end ? old + str.length - (end - start) : start + str.length;
    el.setSelectionRange(caret, caret);
    updateTextDraft({ text: v, ...patch });
    if (!composing.current) refreshCaret();
  };

  // 「ひらがな」：入った漢字・カタカナをひらがなにする（typed は IME で打った読み）
  const toHiraganaRange = (start: number, end: number, inserted: string, typed = '') => {
    const id = useEditor.getState().textEdit?.obj.id;
    const run = () => {
      const el = ref.current;
      if (!el || useEditor.getState().textEdit?.obj.id !== id) return;
      if (el.value.slice(start, end) !== inserted) return;
      const reading = typed ? (guessReading(inserted, typed) ?? typed) : null;
      const out = toHiraganaText(inserted, reading ? [{ s: inserted, r: reading }] : undefined);
      if (out === null) {
        loadReadingDict()
          .then(run)
          .catch(() => {});
        return;
      }
      if (out !== inserted) replaceRange(start, end, out);
    };
    run();
  };

  // 「自動変換」：start〜end のひらがなを、いちばんよい変換にする
  const autoConvert = (start: number, end: number) => {
    const el = ref.current;
    if (!el) return;
    const reading = el.value.slice(start, end);
    if (!reading || !isConvertible(reading)) return;
    const id = useEditor.getState().textEdit?.obj.id;
    const run = () => {
      const cur = ref.current;
      if (!cur || useEditor.getState().textEdit?.obj.id !== id || cur.value.slice(start, end) !== reading) return;
      const segs = convertBest(reading);
      if (!segs) return;
      const cands = kkCandidates(reading);
      applyConversion(start, reading, reading, segs, cands);
    };
    if (isKanaKanjiDictLoaded()) run();
    else
      loadKanaKanjiDict()
        .then(() => {
          setDictReady(true);
          run();
        })
        .catch(() => {});
  };

  // start の位置の current を segments の表記に置き換え、読みを記録して、候補バーに出す
  const applyConversion = (
    start: number,
    reading: string,
    current: string,
    segments: KKSegment[],
    cands: KKCandidate[] | null,
  ) => {
    const el = ref.current;
    const obj0 = useEditor.getState().textEdit?.obj;
    if (!el || !obj0 || el.value.slice(start, start + current.length) !== current) return;
    const text = segments.map((x) => x.surface).join('');
    let readings = obj0.readings;
    for (const sg of segments) {
      if (/\p{Script=Han}/u.test(sg.surface)) readings = addReading(readings, sg.surface, sg.reading);
    }
    replaceRange(start, start + current.length, text, readings !== obj0.readings ? { readings } : undefined);
    pending.current = null;
    setConv({ start, reading, text, live: false, cands });
  };

  // 候補バーで候補を選んだとき
  const pickCandidate = (c: KKCandidate) => {
    if (!conv) return;
    applyConversion(conv.start, conv.reading, conv.text, c.segments, conv.cands);
  };

  // 打っている途中のひらがなの候補を出す
  const showLive = () => {
    const el = ref.current;
    const st = pending.current;
    if (!el || st === null) return setConv(null);
    let pos = el.selectionEnd;
    // 打っている途中の英字（"k" など）は除く
    while (pos > st && isLowerRomaji(el.value[pos - 1])) pos--;
    const reading = el.value.slice(st, pos);
    if (!reading) return setConv(null);
    if (!isConvertible(reading)) {
      pending.current = null;
      return setConv(null);
    }
    setConv({ start: st, reading, text: reading, live: true, cands: isKanaKanjiDictLoaded() ? kkCandidates(reading) : null });
  };

  // 打っている途中のひらがなを変換する（スペース・句読点・改行を打ったとき）
  const convertPending = (end: number): boolean => {
    const el = ref.current;
    const st = pending.current;
    if (!el || st === null || st >= end) return false;
    const reading = el.value.slice(st, end);
    if (!isConvertible(reading)) return false;
    autoConvert(st, end);
    return true;
  };

  // ローマ字をひらがなにする。英字を打った直後に、カーソルの前の英字の並びを見る。
  // final = true のときは最後の n も「ん」にする。変換後のカーソルの位置を返す
  const convertRomaji = (final: boolean): number => {
    const el = ref.current;
    if (!el) return 0;
    const v = el.value;
    const pos = el.selectionEnd;
    let st = pos;
    while (st > 0 && isLowerRomaji(v[st - 1])) st--;
    if (st === pos) return pos;
    const src = v.slice(st, pos);
    // 「3-4」などの「-」だけはそのまま
    if (/^-+$/.test(src) && !isKanaChar(v[st - 1])) return pos;
    const { kana, rest } = romajiToKana(src, final);
    const out = kana + rest;
    if (out !== src) replaceRange(st, pos, out);
    if (kana && modeRef.current === 'auto' && pending.current === null) pending.current = st;
    return st + out.length;
  };

  // 変換した語の読みを記録する。予測変換で途中まで打った読み（じゃ → 邪悪）は辞書で補う（じゃあく）
  const recordReading = (committed: string, typed: string) => {
    const id = useEditor.getState().textEdit?.obj.id;
    const save = (reading: string) => {
      const cur = useEditor.getState().textEdit?.obj;
      if (!cur || cur.id !== id || reading === committed) return;
      updateTextDraft({ readings: addReading(cur.readings, committed, reading) });
    };
    if (isReadingDictLoaded()) {
      const r = guessReading(committed, typed) ?? typed;
      if (r) save(r);
      return;
    }
    if (typed) save(typed);
    loadReadingDict()
      .then(() => {
        const r = guessReading(committed, typed);
        if (r && r !== typed) save(r);
      })
      .catch(() => {});
  };

  // 変換を使わずに入った漢字（iPad で確定後に出る次の語の候補をタップしたときなど）も読みで数える
  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    updateTextDraft({ text: el.value });
    const ne = e.nativeEvent as InputEvent;
    if (composing.current || ne.isComposing) return;
    const m = modeRef.current;
    const data = ne.data;
    const isInsert = ne.inputType === 'insertText' || ne.inputType === 'insertReplacementText';
    if (m !== 'normal') {
      handleModeInput(el, ne.inputType, isInsert ? data : null);
      return;
    }
    if (!isInsert) return;
    if (data && /\p{Script=Han}/u.test(data)) recordReading(data, '');
  };

  // 「ひらがな」「自動変換」のときの入力（IME を使わずに入った文字）
  const handleModeInput = (el: HTMLTextAreaElement, inputType: string, data: string | null) => {
    const m = modeRef.current;
    const pos = el.selectionEnd;
    if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
      convertRomaji(true);
      if (m === 'auto') convertPending(el.selectionEnd - 1);
      return;
    }
    if (!data) {
      // 削除など：打っている途中の範囲より前に戻ったら、途中の状態をやめる
      if (pending.current !== null && pos <= pending.current) pending.current = null;
      if (m === 'auto') showLive();
      return;
    }
    if (data.length === 1 && isLowerRomaji(data)) {
      convertRomaji(false);
      if (m === 'auto') showLive();
      return;
    }
    if (data === ' ' || data === '　' || PUNCT[data] || /^[、。，．！？]$/.test(data)) {
      // 区切りの記号：その前のローマ字を確定し、自動変換では途中のひらがなを変換する
      const start = pos - data.length;
      el.setSelectionRange(start, start);
      const end = convertRomaji(true);
      const after = end + data.length;
      el.setSelectionRange(after, after);
      let sym = data;
      if (PUNCT[data] && isKanaChar(el.value[end - 1])) sym = PUNCT[data];
      const isSpace = data === ' ' || data === '　';
      if (m === 'auto' && isSpace && pending.current !== null) {
        // スペースは変換のキーとして使い、文字は入れない
        replaceRange(end, after, '');
        convertPending(end);
        return;
      }
      if (sym !== data) replaceRange(end, after, sym);
      if (m === 'auto') convertPending(end);
      return;
    }
    if (m === 'hiragana') {
      toHiraganaRange(pos - data.length, pos, data);
      return;
    }
    // 自動変換：かなキーボードなどで直接入ったひらがなは、打っている途中として候補を出す
    if (isConvertible(data)) {
      if (pending.current === null || pending.current > pos - data.length) pending.current = pos - data.length;
      showLive();
      return;
    }
    pending.current = null;
    setConv(null);
    if (/\p{Script=Han}/u.test(data)) recordReading(data, '');
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
    let replaceId: string | null = null;
    if (o.text.trim()) {
      const m = measureText(o);
      st.updateTextDraft({ text: o.text });
      st.commitTextEdit();
      // 文字のすぐ下に置く（縦書き・横書き共通）
      at = { x: o.x, y: o.y + m.height + fs * 0.8 };
    } else {
      st.cancelTextEdit();
      at = { x: o.x, y: o.y + fs * 0.75 };
      // 既存の枠（回答欄の未入力の枠など）から文字を入れずに数式を入れた場合は、数式の確定時に枠を取り除く
      if (!cur.isNew) replaceId = o.id;
    }
    ref.current?.blur();
    st.openMathEditor({ targetId: null, at, initialLatex: '', replaceId });
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
        <div className="relative min-h-0 flex-1">
          <textarea
            ref={ref}
            aria-label="テキストを入力"
            placeholder="ここに文字を入力"
            // autocorrect="off" / spellcheck="false" にすると、iPad（Safari・ホーム画面のアプリ）や Android で
            // キーボードの予測変換（候補バー）が出なくなることがあるため、どちらも指定しない
            autoCapitalize="off"
            autoComplete="off"
            tabIndex={obj ? 0 : -1}
            className="block h-full w-full resize-none overflow-auto bg-white p-4 text-neutral-900 outline-none placeholder:text-neutral-400"
            style={{
              writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
              textOrientation: 'mixed',
              // font の一括指定と fontSize を混ぜると再描画時に文字サイズが消えることがあるため個別に指定
              fontFamily: obj ? fontCss(obj.fontFamily) : undefined,
              fontWeight: obj?.bold ? 'bold' : 'normal',
              fontStyle: obj?.italic ? 'italic' : 'normal',
              lineHeight: 1.6,
              fontSize: 22, // iOS で入力時に画面が拡大されないよう 16px 以上
              // 縦書きでは iPad の本来のカーソルが小さく・ずれて出るため透明にして、VerticalCaret で描く
              caretColor: vertical ? 'transparent' : undefined,
            }}
            onInput={onInput}
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
          {vertical && <VerticalCaret textareaRef={ref} deps={[open, fontFamily, bold, italic]} />}
        </div>
        {mode === 'auto' && (
          <div
            className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t border-neutral-100 px-2"
            aria-label="変換の候補"
          >
            {!dictReady ? (
              <span className="px-2 text-[13px] text-neutral-400">変換の辞書を読み込んでいます…</span>
            ) : conv?.cands?.length ? (
              conv.cands.map((c, i) => {
                const current = c.text === conv.text && !conv.live;
                return (
                  <button
                    key={c.text}
                    type="button"
                    onPointerDown={keepFocus}
                    onClick={() => pickCandidate(c)}
                    className={cx(
                      'tap h-9 shrink-0 rounded-lg px-3 text-[16px] whitespace-nowrap',
                      current
                        ? 'bg-[#0a84ff] text-white'
                        : i === 0 && conv.live
                          ? 'bg-[#0a84ff]/10 text-[#0a84ff]'
                          : 'text-neutral-800 hover:bg-neutral-100',
                    )}
                  >
                    {c.text}
                  </button>
                );
              })
            ) : (
              <span className="px-2 text-[13px] text-neutral-400">
                ひらがなを打つと漢字に変換します（確定・スペース・句読点で変換）
              </span>
            )}
          </div>
        )}
        <div className="flex h-10 shrink-0 items-center gap-1 border-t border-neutral-100 pr-4 pl-2 text-[13px]">
          <div role="group" aria-label="入力のしかた" className="flex items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5">
            {MODES.map((x) => (
              <button
                key={x.v}
                type="button"
                aria-pressed={mode === x.v}
                onPointerDown={keepFocus}
                onClick={() => setApp({ textInputMode: x.v })}
                className={cx(
                  'tap h-7 rounded-md px-2 text-[13px] font-medium whitespace-nowrap',
                  mode === x.v ? 'bg-white text-[#0a84ff] shadow-sm' : 'text-neutral-500',
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div aria-live="polite" className="ml-auto truncate pl-2 text-right tabular-nums text-neutral-500">
            {charCount}文字
            {charCount !== plainCount && <span className="ml-2 text-neutral-400">（表記 {plainCount}文字）</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
