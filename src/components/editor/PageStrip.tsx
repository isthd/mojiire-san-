// ページ一覧（複数画像をページ単位で管理）
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Ellipsis, ListOrdered, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getImageUrl, loadPageImage } from '../../storage/imageCache';
import { useEditor } from '../../store/editorStore';
import type { Page } from '../../types/model';
import { ConfirmDialog, cx, IconButton, MenuPopover } from '../ui/primitives';
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

export function PageStrip() {
  const pages = useEditor((s) => s.history.present.pages);
  const currentId = useEditor((s) => s.currentPageId);
  const setCurrentPage = useEditor((s) => s.setCurrentPage);
  const movePageTo = useEditor((s) => s.movePageTo);
  const removePage = useEditor((s) => s.removePage);
  // 縦が短い画面（スマホ横向きなど）ではキャンバスを広く取るため最初は閉じておく
  const [open, setOpen] = useState(() => window.innerHeight >= 640);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const drag = usePageDrag(pages, movePageTo);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!menuRef.current?.contains(t) && !t.closest('[data-menu]')) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  if (pages.length === 0) return null;
  const idx = pages.findIndex((p) => p.id === currentId);
  // ドラッグ中は移動先の並びで表示する
  const shown = drag.state ? previewOrder(pages, drag.state.id, drag.state.over) : pages;
  const count = (
    <span className="min-w-[30px] shrink-0 text-center text-[12px] font-bold text-neutral-500 tabular-nums">
      {idx + 1}/{pages.length}
    </span>
  );

  const menuItems: { label: string; icon: ReactNode; danger?: boolean; action: () => void }[] = [
    {
      label: '番号順に並べる',
      icon: <ListOrdered size={17} aria-hidden />,
      action: () => void sortProjectPagesByNumber(),
    },
    { label: '一覧をたたむ', icon: <ChevronDown size={17} aria-hidden />, action: () => setOpen(false) },
    {
      label: 'このページを削除',
      icon: <Trash2 size={17} aria-hidden />,
      danger: true,
      action: () => currentId && setConfirmId(currentId),
    },
  ];

  return (
    <div className="z-10 select-none border-t border-neutral-200 bg-white [-webkit-touch-callout:none]">
      {open ? (
        <div className="flex items-center gap-1 pt-1.5 pr-1.5 pl-2">
          {count}
          <div
            ref={drag.containerRef}
            onContextMenu={(e) => e.preventDefault()}
            className="no-scrollbar flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto px-1.5 py-2 [mask-image:linear-gradient(90deg,#000_calc(100%-20px),transparent)]"
          >
            {shown.map((p, i) => {
              const dragging = drag.state?.id === p.id;
              const active = p.id === currentId && !drag.state;
              return (
                <div
                  key={p.id}
                  data-thumb
                  onPointerDown={(e) => drag.onPointerDown(e, p.id)}
                  title="長押ししてドラッグすると並べ替えできます"
                  className={cx('relative shrink-0 transition-opacity', dragging && 'opacity-30')}
                >
                  <button
                    type="button"
                    onClick={() => !drag.consumeClick() && setCurrentPage(p.id)}
                    aria-label={`ページ ${i + 1}`}
                    aria-current={active}
                    className={cx(
                      'block h-10 w-14 overflow-hidden rounded-md bg-neutral-100 transition sm:h-[46px] sm:w-16',
                      active
                        ? 'outline-2 outline-offset-2 outline-[#0a84ff]'
                        : 'outline-1 outline-offset-0 outline-neutral-200 hover:outline-neutral-400',
                    )}
                  >
                    <Thumb page={p} />
                  </button>
                  <span
                    className={cx(
                      'pointer-events-none absolute bottom-[3px] left-[3px] rounded px-1 text-[10px] leading-[15px] font-bold tabular-nums shadow-sm',
                      active ? 'bg-[#0a84ff] text-white' : 'bg-white/95 text-neutral-800',
                    )}
                  >
                    {i + 1}
                  </span>
                </div>
              );
            })}
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <IconButton label="ページの操作" onClick={() => setMenu(!menu)} aria-expanded={menu} className="h-9 w-9 text-neutral-500">
              <Ellipsis size={20} />
            </IconButton>
            {menu && (
              <MenuPopover anchor={menuRef} width={220}>
                {menuItems.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    className={cx(
                      'tap flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] hover:bg-neutral-100',
                      m.danger && 'mt-1 border-t border-neutral-200 pt-3 text-[#ff3b30]',
                    )}
                    onClick={() => {
                      setMenu(false);
                      m.action();
                    }}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </MenuPopover>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-11 items-center gap-1 px-1.5">
          <IconButton label="ページ一覧を開く" onClick={() => setOpen(true)} className="h-9 w-9 text-neutral-500">
            <ChevronUp size={18} />
          </IconButton>
          <span className="text-[13px] font-bold text-neutral-700 tabular-nums">
            {idx + 1} / {pages.length}
          </span>
          <div className="flex-1" />
          <IconButton label="前のページ" disabled={idx <= 0} onClick={() => setCurrentPage(pages[idx - 1].id)} className="h-9 w-9">
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton label="次のページ" disabled={idx >= pages.length - 1} onClick={() => setCurrentPage(pages[idx + 1].id)} className="h-9 w-9">
            <ChevronRight size={18} />
          </IconButton>
        </div>
      )}
      {drag.state && createPortal(
        <div
          className="pointer-events-none fixed z-50 h-[46px] w-16 -translate-x-1/2 -translate-y-1/2 scale-110 -rotate-2 overflow-hidden rounded-md bg-neutral-100 shadow-xl outline-2 outline-offset-2 outline-[#0a84ff]"
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
    // サムネイルの大きさは画面幅で変わるので、実際の位置から1枚ぶんの幅を測る
    const thumbs = el.querySelectorAll<HTMLElement>('[data-thumb]');
    if (thumbs.length === 0) return 0;
    const first = thumbs[0].getBoundingClientRect().left;
    const step = thumbs.length > 1 ? thumbs[1].getBoundingClientRect().left - first : thumbs[0].offsetWidth + 10;
    const x = clientX - first;
    return Math.max(0, Math.min(n - 1, Math.floor(x / step)));
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
