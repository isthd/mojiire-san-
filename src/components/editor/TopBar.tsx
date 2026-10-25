// 上部バー：左に ✕（ホームへ）、右に「保存」。
// 元に戻す・やり直すと、その他の操作（画像追加・ズーム・設定など）は控えめに配置。
import { Check, CloudOff, Ellipsis, Loader2, Redo2, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fitToScreen, zoomBy, zoomTo } from '../../canvas/viewActions';
import { updateProjectMeta } from '../../storage/projectRepo';
import type { SaveTarget } from '../../storage/projectFolder';
import { useEditor } from '../../store/editorStore';
import { SaveToFolderDialog } from '../home/SaveToFolderDialog';
import { openAllNews } from '../ui/NewsDialog';
import { IconButton, MenuPopover, PromptDialog } from '../ui/primitives';

export function TopBar({ onHome, onAddImages }: { onHome: () => void; onAddImages: () => void }) {
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const zoom = useEditor((s) => s.view.zoom);
  const name = useEditor((s) => s.projectName);
  const projectId = useEditor((s) => s.projectId);
  const saveStatus = useEditor((s) => s.saveStatus);
  const setModal = useEditor((s) => s.setModal);
  const hasPages = useEditor((s) => s.history.present.pages.length > 0);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!menuRef.current?.contains(t) && !t.closest('[data-menu]')) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const items = [
    { label: '画像・PDF（ページ）を追加', action: onAddImages },
    { label: '切り抜き・まっすぐにする', action: () => setModal('crop'), needsPage: true },
    { label: '画面に合わせる', action: fitToScreen, needsPage: true },
    { label: '拡大', action: () => zoomBy(1.25), needsPage: true },
    { label: '縮小', action: () => zoomBy(0.8), needsPage: true },
    { label: '100%で表示', action: () => zoomTo(1), needsPage: true },
    { label: '名前を変更', action: () => setRenaming(true) },
    {
      label: 'フォルダとして保存（iCloud・OneDrive）',
      action: () => projectId && setSaveTarget({ projectIds: [projectId], label: name }),
    },
    { label: '設定', action: () => setModal('settings') },
    { label: 'お知らせ', action: openAllNews },
  ];

  return (
    <header
      className="z-20 flex shrink-0 items-center gap-1 bg-white px-2"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(52px + env(safe-area-inset-top))' }}
    >
      <IconButton label="閉じる（ホームへ）" onClick={onHome} className="h-11 w-11">
        <X size={24} strokeWidth={1.8} />
      </IconButton>
      <IconButton label="元に戻す（Ctrl+Z）" onClick={undo} disabled={!canUndo} className="h-11 w-11">
        <Undo2 size={21} />
      </IconButton>
      <IconButton label="やり直す（Ctrl+Y）" onClick={redo} disabled={!canRedo} className="h-11 w-11">
        <Redo2 size={21} />
      </IconButton>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[13px] text-neutral-500">
        <span className="truncate max-sm:hidden">{name}</span>
        <span className="flex items-center" aria-live="polite">
          {saveStatus === 'saving' && <Loader2 size={14} className="animate-spin" aria-label="保存中" />}
          {saveStatus === 'saved' && <Check size={14} aria-label="自動保存済み" />}
          {saveStatus === 'error' && <CloudOff size={14} className="text-[#ff3b30]" aria-label="保存に失敗" />}
        </span>
      </div>

      <div ref={menuRef} className="relative">
        <IconButton label="その他" onClick={() => setMenu(!menu)} aria-expanded={menu} className="h-11 w-11">
          <Ellipsis size={22} />
        </IconButton>
        {menu && (
          <MenuPopover anchor={menuRef} width={288}>
            {hasPages && <div className="px-4 pt-1.5 pb-1 text-[12px] text-neutral-500 tabular-nums">表示倍率 {Math.round(zoom * 100)}%</div>}
            {items
              .filter((i) => !i.needsPage || hasPages)
              .map((i) => (
                <button
                  key={i.label}
                  type="button"
                  className="tap block w-full px-4 py-2.5 text-left text-[15px] hover:bg-neutral-100"
                  onClick={() => {
                    setMenu(false);
                    i.action();
                  }}
                >
                  {i.label}
                </button>
              ))}
          </MenuPopover>
        )}
      </div>
      <button
        type="button"
        onClick={() => setModal('export')}
        disabled={!hasPages}
        className="tap h-11 rounded-lg px-3 text-[16px] font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-35"
      >
        保存
      </button>

      <SaveToFolderDialog target={saveTarget} onClose={() => setSaveTarget(null)} />
      <PromptDialog
        open={renaming}
        title="名前を変更"
        initial={name}
        confirmLabel="変更"
        onClose={() => setRenaming(false)}
        onSubmit={(v) => {
          useEditor.getState().setProjectName(v);
          if (projectId) void updateProjectMeta(projectId, { name: v, updatedAt: Date.now() });
        }}
      />
    </header>
  );
}
