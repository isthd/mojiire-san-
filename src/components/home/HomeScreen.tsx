// ホーム画面：プロジェクト一覧と管理（新規作成・開く・名前変更・複製・削除・バックアップ）
import { Check, CheckSquare, Copy, Download, Ellipsis, FileUp, FolderOpen, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadFile } from '../../export/exporters';
import { whenClosed } from '../../storage/autosave';
import { exportBackup, importBackup } from '../../storage/backup';
import { ACCEPT_ATTR, importImageFiles, pickImageFiles } from '../../storage/imageImport';
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  saveDocument,
  updateProjectMeta,
} from '../../storage/projectRepo';
import { toast } from '../../store/toastStore';
import type { ProjectMeta } from '../../types/model';
import { Button, ConfirmDialog, cx, IconButton, PromptDialog } from '../ui/primitives';

const fmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function defaultName(): string {
  const d = new Date();
  return `プリント ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Thumbnail({ blob }: { blob: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!blob || !url) {
    return (
      <div className="flex h-full w-full items-center justify-center text-neutral-300">
        <ImagePlus size={36} />
      </div>
    );
  }
  return <img src={url} alt="" className="h-full w-full object-contain" draggable={false} />;
}

export function HomeScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    // 編集画面から戻った直後は、保存とサムネイル作成の完了を待ってから一覧を読む
    await whenClosed();
    setProjects(await listProjects());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!menuId) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-menu]')) setMenuId(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuId]);

  const createEmpty = async () => {
    const meta = await createProject(defaultName());
    onOpen(meta.id);
  };

  const createFromImages = async (list: FileList | File[] | null) => {
    const files = pickImageFiles(list);
    if (!files.length) return;
    setBusy('画像を読み込み中…');
    try {
      const name = files[0].name.replace(/\.[^.]+$/, '') || defaultName();
      const meta = await createProject(name);
      const { pages, failed } = await importImageFiles(meta.id, files);
      if (!pages.length) {
        // 1枚も読み込めなかった場合は空のプロジェクトを残さない
        await deleteProject(meta.id);
        toast(`画像を読み込めませんでした：${failed.join('、')}（PNG・JPEG・WebP に対応）`, 'error');
        return;
      }
      await saveDocument(meta.id, { pages });
      if (failed.length) toast(`読み込めなかった画像があります：${failed.join('、')}`, 'error');
      onOpen(meta.id);
    } catch (e) {
      console.error(e);
      toast('画像の読み込みに失敗しました', 'error');
    } finally {
      setBusy(null);
    }
  };

  const doBackup = async (p: ProjectMeta) => {
    setBusy('バックアップを作成中…');
    try {
      const file = await exportBackup(p.id);
      setBusy(null);
      await downloadFile(file, file.name);
    } catch (e) {
      toast('バックアップに失敗しました：' + (e instanceof Error ? e.message : ''), 'error');
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy('バックアップを読み込み中…');
    try {
      const meta = await importBackup(file);
      toast(`「${meta.name}」を読み込みました`);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : '読み込みに失敗しました', 'error');
    } finally {
      setBusy(null);
    }
  };

  const latest = projects?.[0];

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = !!projects?.length && selected.size === projects.length;

  const doBulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy('削除中…');
    try {
      for (const id of ids) await deleteProject(id);
      toast(`${ids.length}件のプロジェクトを削除しました`);
    } catch (e) {
      console.error(e);
      toast('削除に失敗しました', 'error');
    } finally {
      setBusy(null);
      exitSelect();
      await refresh();
    }
  };

  return (
    <div
      className="min-h-dvh bg-[#f2f2f5]"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        const backup = files.find((f) => f.name.endsWith('.json'));
        if (backup) void doImport(backup);
        else void createFromImages(files);
      }}
    >
      <header
        className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-9 w-9" />
          <div className="min-w-0">
            <h1 className="text-[19px] leading-tight font-bold">文字入れさん</h1>
            <p className="hidden text-xs text-neutral-500 sm:block">プリントに文字・数式・手書き・図形を書き込む学習用エディター</p>
          </div>
          <div className="flex-1" />
          <Button className="h-11 max-sm:px-3" onClick={() => backupInput.current?.click()}>
            <FileUp size={18} />
            <span className="max-sm:hidden">バックアップを読み込む</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6" style={{ paddingBottom: `calc(${selecting ? 88 : 24}px + env(safe-area-inset-bottom))` }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => imageInput.current?.click()}
            className="flex items-center gap-4 rounded-2xl bg-[#0a84ff] p-5 text-left text-white shadow-sm transition hover:bg-[#0077ed] active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <ImagePlus size={26} />
            </span>
            <span>
              <span className="block text-[17px] font-semibold">画像から新規作成</span>
              <span className="block text-[13px] opacity-85">プリントや問題集の写真を選ぶ（複数可）</span>
            </span>
          </button>
          {latest ? (
            <button
              type="button"
              onClick={() => onOpen(latest.id)}
              className="flex items-center gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-neutral-200 transition hover:ring-[#0a84ff] active:scale-[0.99]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0a84ff]/10 text-[#0a84ff]">
                <FolderOpen size={26} />
              </span>
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold">続きから編集</span>
                <span className="block truncate text-[13px] text-neutral-500">{latest.name}</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={createEmpty}
              className="flex items-center gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-neutral-200 transition hover:ring-[#0a84ff]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                <Plus size={26} />
              </span>
              <span className="text-[17px] font-semibold">空のプロジェクトを作成</span>
            </button>
          )}
        </div>

        <div className="mt-8 mb-3 flex items-center">
          <h2 className="text-[17px] font-semibold">プロジェクト</h2>
          <div className="flex-1" />
          {selecting ? (
            <Button variant="ghost" className="h-10" onClick={exitSelect}>
              <X size={18} /> 完了
            </Button>
          ) : (
            <>
              {!!projects?.length && (
                <Button variant="ghost" className="h-10" onClick={() => setSelecting(true)}>
                  <CheckSquare size={18} /> 選択
                </Button>
              )}
              <Button variant="ghost" className="h-10" onClick={createEmpty}>
                <Plus size={18} /> 新規作成
              </Button>
            </>
          )}
        </div>

        {projects && projects.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-neutral-300 px-6 py-14 text-center text-[14px] text-neutral-500">
            まだプロジェクトがありません。画像をここにドラッグ＆ドロップしても始められます。
          </div>
        )}

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
          {projects?.map((p) => {
            const isSel = selected.has(p.id);
            return (
            <li key={p.id} className="group relative">
              <button
                type="button"
                aria-pressed={selecting ? isSel : undefined}
                onClick={() => (selecting ? toggleSelected(p.id) : onOpen(p.id))}
                className={cx(
                  'block w-full overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-neutral-200 transition hover:shadow-md hover:ring-[#0a84ff]',
                  selecting && isSel && 'ring-[3px] ring-[#0a84ff]',
                )}
              >
                <div className="aspect-[3/4] bg-neutral-100 p-2">
                  <Thumbnail blob={p.thumbnail} />
                </div>
                <div className="px-3 py-2.5">
                  <div className="truncate pr-6 text-[14px] font-semibold">{p.name}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-neutral-500">
                    更新 {fmt.format(p.updatedAt)}
                    <br />
                    作成 {fmt.format(p.createdAt)}・{p.pageCount}ページ
                  </div>
                </div>
              </button>
              {selecting && (
                <span
                  aria-hidden
                  className={cx(
                    'pointer-events-none absolute top-2.5 left-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow',
                    isSel ? 'border-[#0a84ff] bg-[#0a84ff] text-white' : 'border-white bg-white/80 text-transparent',
                  )}
                >
                  <Check size={16} strokeWidth={3} />
                </span>
              )}
              {!selecting && (
              <div data-menu className="absolute right-1.5 bottom-[52px]">
                <IconButton
                  label="メニュー"
                  className="h-9 w-9 bg-white/90 shadow ring-1 ring-neutral-200"
                  onClick={() => setMenuId(menuId === p.id ? null : p.id)}
                >
                  <Ellipsis size={18} />
                </IconButton>
                {menuId === p.id && (
                  <div className="absolute right-0 bottom-11 z-20 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-xl">
                    {[
                      { label: '開く', icon: FolderOpen, action: () => onOpen(p.id) },
                      { label: '名前を変更', icon: Pencil, action: () => setRenameTarget(p) },
                      {
                        label: '複製',
                        icon: Copy,
                        action: async () => {
                          await duplicateProject(p.id, `${p.name} のコピー`);
                          await refresh();
                        },
                      },
                      { label: 'バックアップを保存', icon: Download, action: () => doBackup(p) },
                      { label: '削除', icon: Trash2, action: () => setDeleteTarget(p), danger: true },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className={cx(
                          'tap flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] hover:bg-neutral-100',
                          item.danger && 'text-[#ff3b30]',
                        )}
                        onClick={() => {
                          setMenuId(null);
                          void item.action();
                        }}
                      >
                        <item.icon size={17} /> {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
            </li>
            );
          })}
        </ul>
        <p className="mt-10 text-center text-xs text-neutral-400">
          データはこの端末のブラウザ内にのみ保存されます。ログイン不要・オフラインでも利用できます。
        </p>
      </main>

      {selecting && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
            <Button
              variant="ghost"
              className="h-11"
              onClick={() => setSelected(allSelected ? new Set() : new Set(projects?.map((p) => p.id)))}
            >
              {allSelected ? '選択を解除' : 'すべて選択'}
            </Button>
            <span className="text-[14px] text-neutral-500">{selected.size}件選択中</span>
            <div className="flex-1" />
            <Button variant="danger" className="h-11" disabled={!selected.size} onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 size={18} /> 削除
            </Button>
          </div>
        </div>
      )}

      <input
        ref={imageInput}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        className="hidden"
        onChange={(e) => {
          void createFromImages(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={backupInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          void doImport(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <PromptDialog
        open={!!renameTarget}
        title="名前を変更"
        initial={renameTarget?.name ?? ''}
        confirmLabel="変更"
        onClose={() => setRenameTarget(null)}
        onSubmit={async (name) => {
          if (!renameTarget) return;
          await updateProjectMeta(renameTarget.id, { name, updatedAt: Date.now() });
          await refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="プロジェクトを削除"
        message={
          <>
            「{deleteTarget?.name}」を削除しますか？
            <br />
            画像と書き込みがすべて削除され、元に戻せません。
          </>
        }
        confirmLabel="削除"
        danger
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteProject(deleteTarget.id);
          await refresh();
          toast('削除しました');
        }}
        onClose={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        title="プロジェクトを削除"
        message={
          <>
            選択した{selected.size}件のプロジェクトを削除しますか？
            <br />
            画像と書き込みがすべて削除され、元に戻せません。
          </>
        }
        confirmLabel="削除"
        danger
        onConfirm={() => void doBulkDelete()}
        onClose={() => setBulkDeleteOpen(false)}
      />
      {dragOver && (
        <div className="pointer-events-none fixed inset-3 z-30 flex items-center justify-center rounded-3xl border-4 border-dashed border-[#0a84ff] bg-[#0a84ff]/10 text-lg font-semibold text-[#0a84ff]">
          ドロップして新しいプロジェクトを作成
        </div>
      )}
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm" role="status">
          <div className="rounded-2xl bg-white px-6 py-4 text-[15px] font-medium shadow-2xl">{busy}</div>
        </div>
      )}
    </div>
  );
}
