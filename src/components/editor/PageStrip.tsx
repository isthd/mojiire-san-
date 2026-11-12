// ページ一覧（複数画像をページ単位で管理）
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ListOrdered, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { getImageUrl, loadPageImage } from '../../storage/imageCache';
import { useEditor } from '../../store/editorStore';
import type { Page } from '../../types/model';
import { ConfirmDialog, cx, IconButton } from '../ui/primitives';
import { sortProjectPagesByNumber } from './addImages';

function Thumb({ page }: { page: Page }) {
  const [url, setUrl] = useState(() => getImageUrl(page.imageId));
  useEffect(() => {
    let alive = true;
    loadPageImage(page.imageId)
      .then(() => alive && setUrl(getImageUrl(page.imageId)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [page.imageId]);
  return url ? (
    <img src={url} alt="" draggable={false} className="h-full w-full object-contain" />
  ) : (
    <div className="h-full w-full animate-pulse bg-neutral-200" />
  );
}

export function PageStrip({ onAddImages }: { onAddImages: () => void }) {
  const pages = useEditor((s) => s.history.present.pages);
  const currentId = useEditor((s) => s.currentPageId);
  const setCurrentPage = useEditor((s) => s.setCurrentPage);
  const movePageTo = useEditor((s) => s.movePageTo);
  const removePage = useEditor((s) => s.removePage);
  // 縦が短い画面（スマホ横向きなど）ではキャンバスを広く取るため最初は閉じておく
  const [open, setOpen] = useState(() => window.innerHeight >= 640);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const drag = usePageDrag(pages, movePageTo);
  if (pages.length === 0) return null;
  const idx = pages.findIndex((p) => p.id === currentId);
  // ドラッグ中は移動先の並びで表示する
  const shown = drag.state ? previewOrder(pages, drag.state.id, drag.state.over) : pages;

  return (
    <div className="z-10 select-none border-t border-neutral-200 bg-white/95 backdrop-blur [-webkit-touch-callout:none]">
      <div className="flex h-10 items-center gap-1 px-2">
        <IconButton label={open ? 'ページ一覧を閉じる' : 'ページ一覧を開く'} onClick={() => setOpen(!open)} className="h-9 w-9">
          {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </IconButton>
        <span className="text-[13px] font-medium text-neutral-600 tabular-nums">
          ページ {idx + 1} / {pages.length}
        </span>
        <div className="flex-1" />
        {pages.length >= 2 && (
          <button
            type="button"
            onClick={() => void sortProjectPagesByNumber()}
            title="プリントに印刷されたページ番号を読み取って、番号の順に並べ替えます"
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-[#0a84ff] hover:bg-[#0a84ff]/10"
          >
            <ListOrdered size={16} />
            <span className="hidden min-[380px]:inline">番号順に並べる</span>
            <span className="min-[380px]:hidden">番号順</span>
          </button>
        )}
        <IconButton label="前のページ" disabled={idx <= 0} onClick={() => setCurrentPage(pages[idx - 1].id)} className="h-9 w-9">
          <ChevronLeft size={18} />
        </IconButton>
        <IconButton label="次のページ" disabled={idx >= pages.length - 1} onClick={() => setCurrentPage(pages[idx + 1].id)} className="h-9 w-9">
          <ChevronRight size={18} />
        </IconButton>
      </div>
      {open && (
        <div
          ref={drag.containerRef}
          onContextMenu={(e) => e.preventDefault()}
          className="no-scrollbar flex h-[92px] items-center gap-2 overflow-x-auto px-3 pb-2"
        >
          {shown.map((p, i) => {
            const dragging = drag.state?.id === p.id;
            const active = p.id === currentId && !drag.state;
            return (
              <div
                key={p.id}
                onPointerDown={(e) => drag.onPointerDown(e, p.id)}
                title="長押ししてドラッグすると並べ替えできます"
                className={cx('group relative shrink-0 transition-opacity', dragging && 'opacity-30')}
              >
                <button
                  type="button"
                  onClick={() => !drag.consumeClick() && setCurrentPage(p.id)}
                  aria-label={`ページ ${i + 1}`}
                  aria-current={active}
                  className={cx(
                    'block h-[76px] w-[60px] overflow-hidden rounded-lg bg-neutral-100 ring-offset-2 transition',
                    active ? 'ring-[3px] ring-[#0a84ff]' : 'ring-1 ring-neutral-300 hover:ring-neutral-400',
                  )}
                >
                  <Thumb page={p} />
                </button>
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white tabular-nums">{i + 1}</span>
                {active && (
                  <div data-no-drag className="absolute -top-1 -right-1 flex flex-col gap-0.5">
                    <button
                      type="button"
                      aria-label="このページを削除"
                      title="このページを削除"
                      onClick={() => setConfirmId(p.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#ff3b30] shadow ring-1 ring-neutral-200"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={onAddImages}
            aria-label="ページを追加"
            className="flex h-[76px] w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 text-neutral-500 hover:border-[#0a84ff] hover:text-[#0a84ff]"
          >
            <Plus size={20} />
            <span className="text-[10px]">追加</span>
          </button>
        </div>
      )}
      {drag.state && createPortal(
        <div
          className="pointer-events-none fixed z-50 h-[76px] w-[60px] -translate-x-1/2 -translate-y-1/2 scale-110 overflow-hidden rounded-lg bg-neutral-100 shadow-xl ring-[3px] ring-[#0a84ff]"
          style={{ left: drag.state.x, top: drag.state.y }}
        >
          {(() => {
            const p = pages.find((q) => q.id === drag.state!.id);
            return p ? <Thumb page={p} /> : null;
          })()}
        </div>,
        document.body,
      )}
      <ConfirmDialog
        open={!!confirmId}
        title="ページを削除"
        message="このページと書き込みを削除します。（直後であれば「元に戻す」で復元できます）"
        confirmLabel="削除"
        danger
        onConfirm={() => confirmId && removePage(confirmId)}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}

// --- ドラッグで並べ替え ---------------------------------------------------
// マウスは少し動かすとドラッグ開始。タッチ・ペンは長押しで開始（短いスワイプは横スクロールのまま）

const THUMB_STEP = 68; // サムネイル幅 60px + 間隔 8px
const PAD_LEFT = 12; // px-3
const LONG_PRESS_MS = 350;

function previewOrder(pages: Page[], id: string, over: number): Page[] {
  const rest = pages.filter((p) => p.id !== id);
  const moving = pages.find((p) => p.id === id);
  if (!moving) return pages;
  rest.splice(over, 0, moving);
  return rest;
}

interface DragState {
  id: string;
  x: number;
  y: number;
  /** 移動先の番号（0始まり） */
  over: number;
}

function usePageDrag(pages: Page[], movePageTo: (id: string, toIndex: number) => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<DragState | null>(null);
  const stateRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const update = (next: DragState | null) => {
    stateRef.current = next;
    setState(next);
  };

  const indexAt = (clientX: number) => {
    const el = containerRef.current;
    const n = pagesRef.current.length;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - PAD_LEFT;
    return Math.max(0, Math.min(n - 1, Math.floor(x / THUMB_STEP)));
  };

  // ドラッグ中はタッチでの横スクロールを止める（passive: false が必要）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (stateRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  });

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || pagesRef.current.length < 2) return;
    // 削除・移動ボタンの上では始めない
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    cleanupRef.current?.();
    const startX = e.clientX;
    const startY = e.clientY;
    const mouse = e.pointerType === 'mouse';
    let lastX = startX;
    let timer: number | undefined;
    let raf = 0;

    const start = (x: number, y: number) => {
      update({ id, x, y, over: pagesRef.current.findIndex((p) => p.id === id) });
      navigator.vibrate?.(10);
      // 端に寄せたら自動でスクロール
      const tick = () => {
        const el = containerRef.current;
        const s = stateRef.current;
        if (el && s) {
          const r = el.getBoundingClientRect();
          const edge = 36;
          const dx = lastX < r.left + edge ? -8 : lastX > r.right - edge ? 8 : 0;
          if (dx) {
            el.scrollLeft += dx;
            const over = indexAt(lastX);
            if (over !== s.over) update({ ...s, over });
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX;
      const s = stateRef.current;
      if (s) {
        update({ ...s, x: ev.clientX, y: ev.clientY, over: indexAt(ev.clientX) });
        return;
      }
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (mouse && moved > 5) start(ev.clientX, ev.clientY);
      else if (!mouse && moved > 8) cleanup(); // 長押し前に動いたらスクロールとして扱う
    };

    const onUp = () => {
      const s = stateRef.current;
      if (s) {
        movePageTo(s.id, s.over);
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
      }
      cleanup();
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      cleanupRef.current = null;
      if (stateRef.current) update(null);
    };
    const onCancel = () => cleanup();

    if (!mouse) timer = window.setTimeout(() => start(lastX, startY), LONG_PRESS_MS);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    cleanupRef.current = cleanup;
  };

  /** ドラッグ直後のクリック（ページ切り替え）を無視するため */
  const consumeClick = () => suppressClick.current;

  return { containerRef, state, onPointerDown, consumeClick };
}
