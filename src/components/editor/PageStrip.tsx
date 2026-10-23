// ページ一覧（複数画像をページ単位で管理）
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getImageUrl, loadPageImage } from '../../storage/imageCache';
import { useEditor } from '../../store/editorStore';
import type { Page } from '../../types/model';
import { ConfirmDialog, cx, IconButton } from '../ui/primitives';

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
  const movePage = useEditor((s) => s.movePage);
  const removePage = useEditor((s) => s.removePage);
  // 縦が短い画面（スマホ横向きなど）ではキャンバスを広く取るため最初は閉じておく
  const [open, setOpen] = useState(() => window.innerHeight >= 640);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (pages.length === 0) return null;
  const idx = pages.findIndex((p) => p.id === currentId);

  return (
    <div className="z-10 border-t border-neutral-200 bg-white/95 backdrop-blur">
      <div className="flex h-10 items-center gap-1 px-2">
        <IconButton label={open ? 'ページ一覧を閉じる' : 'ページ一覧を開く'} onClick={() => setOpen(!open)} className="h-9 w-9">
          {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </IconButton>
        <span className="text-[13px] font-medium text-neutral-600 tabular-nums">
          ページ {idx + 1} / {pages.length}
        </span>
        <div className="flex-1" />
        <IconButton label="前のページ" disabled={idx <= 0} onClick={() => setCurrentPage(pages[idx - 1].id)} className="h-9 w-9">
          <ChevronLeft size={18} />
        </IconButton>
        <IconButton label="次のページ" disabled={idx >= pages.length - 1} onClick={() => setCurrentPage(pages[idx + 1].id)} className="h-9 w-9">
          <ChevronRight size={18} />
        </IconButton>
      </div>
      {open && (
        <div className="no-scrollbar flex h-[92px] items-center gap-2 overflow-x-auto px-3 pb-2">
          {pages.map((p, i) => {
            const active = p.id === currentId;
            return (
              <div key={p.id} className="group relative shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p.id)}
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
                  <div className="absolute -top-1 -right-1 flex flex-col gap-0.5">
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
                {active && pages.length > 1 && (
                  <div className="absolute -bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5">
                    <button
                      type="button"
                      aria-label="前へ移動"
                      disabled={i === 0}
                      onClick={() => movePage(p.id, -1)}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-neutral-200 disabled:opacity-30"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="後ろへ移動"
                      disabled={i === pages.length - 1}
                      onClick={() => movePage(p.id, 1)}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-neutral-200 disabled:opacity-30"
                    >
                      <ChevronRight size={12} />
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
