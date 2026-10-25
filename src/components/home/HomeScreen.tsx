// ホーム画面：プロジェクト一覧と管理（新規作成・開く・名前変更・複製・削除・バックアップ）
// フォルダで整理（移動・ドラッグ・おまかせ整理・検索・並び替え）と、フォルダとしての保存・読み込み
import {
  Check,
  CheckSquare,
  Copy,
  Download,
  Ellipsis,
  FileUp,
  Folder as FolderIcon,
  FolderInput,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  ImagePlus,
  Inbox,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadFile } from '../../export/exporters';
import type { Suggestion } from '../../lib/folderLayout';
import { whenClosed } from '../../storage/autosave';
import { exportBackup } from '../../storage/backup';
import {
  createFolder,
  deleteFolder,
  findOrCreateFolder,
  listFolders,
  moveProjects,
  renameFolder,
} from '../../storage/folderRepo';
import { canPickDirectory, pickDirectory } from '../../storage/fsAccess';
import { ACCEPT_ATTR, importImageFiles, pickImageFiles } from '../../storage/imageImport';
import { fromDirectory, fromDrop, fromFileList, supportsDirectoryInput } from '../../storage/inputFiles';
import { importFiles, type InputFile, type SaveTarget } from '../../storage/projectFolder';
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  saveDocument,
  updateProjectMeta,
} from '../../storage/projectRepo';
import { toast } from '../../store/toastStore';
import type { Folder, ProjectMeta } from '../../types/model';
import { Button, ConfirmDialog, cx, IconButton, MenuPopover, PromptDialog } from '../ui/primitives';
import { MoveDialog } from './MoveDialog';
import { OrganizeDialog } from './OrganizeDialog';
import { SaveToFolderDialog } from './SaveToFolderDialog';

const fmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

/** 表示中のフォルダ：すべて／未分類／フォルダの ID */
type View = 'all' | 'none' | string;
type Sort = 'updated' | 'created' | 'name';

const DRAG_TYPE = 'application/x-mojiire-project';

function loadPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* 保存できなくても動作に支障はない */
  }
}

function defaultName(): string {
  const d = new Date();
  return `プリント ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

/** フォルダの切り替えボタン（プロジェクトをドラッグして落とすと移動） */
function FolderChip({
  active,
  label,
  count,
  icon: Icon,
  dropTarget,
  onClick,
  onDropProject,
}: {
  active: boolean;
  label: string;
  count: number;
  icon: typeof FolderIcon;
  /** ドラッグ中のプロジェクトを受け取れるか */
  dropTarget: boolean;
  onClick: () => void;
  onDropProject?: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      onDragOver={(e) => {
        if (!dropTarget || !onDropProject || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(DRAG_TYPE);
        setOver(false);
        if (!id || !onDropProject) return;
        e.preventDefault();
        e.stopPropagation();
        onDropProject(id);
      }}
      className={cx(
        'tap flex h-10 max-w-[220px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium ring-1 transition',
        active ? 'bg-[#0a84ff] text-white ring-[#0a84ff]' : 'bg-white text-neutral-800 ring-neutral-200 hover:ring-[#0a84ff]',
        dropTarget && onDropProject && !active && 'ring-2 ring-[#0a84ff]/40',
        over && 'scale-105 ring-[3px] ring-[#0a84ff]',
      )}
    >
      <Icon size={17} className={cx('shrink-0', !active && 'text-[#0a84ff]')} />
      <span className="truncate">{label}</span>
      <span className={cx('shrink-0 text-[12px] tabular-nums', active ? 'text-white/80' : 'text-neutral-400')}>{count}</span>
    </button>
  );
}

export function HomeScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [view, setViewState] = useState<View>(() => loadPref<View>('mojiire.home.view', 'all'));
  const [sort, setSortState] = useState<Sort>(() => loadPref<Sort>('mojiire.home.sort', 'updated'));
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuAnchor = useRef<HTMLDivElement>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<Folder | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [importMenu, setImportMenu] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);

  const setView = (v: View) => {
    setViewState(v);
    savePref('mojiire.home.view', v);
  };
  const setSort = (v: Sort) => {
    setSortState(v);
    savePref('mojiire.home.sort', v);
  };

  const refresh = useCallback(async () => {
    // 編集画面から戻った直後は、保存とサムネイル作成の完了を待ってから一覧を読む
    await whenClosed();
    const [p, f] = await Promise.all([listProjects(), listFolders()]);
    setProjects(p);
    setFolders(f);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 削除されたフォルダを表示していたら「すべて」に戻す
  useEffect(() => {
    if (projects && view !== 'all' && view !== 'none' && !folders.some((f) => f.id === view)) setView('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, projects]);

  useEffect(() => {
    if (!menuId) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-menu]')) setMenuId(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuId]);

  useEffect(() => {
    if (!importMenu) return;
    const close = (e: PointerEvent) => !importMenuRef.current?.contains(e.target as Node) && setImportMenu(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [importMenu]);

  const currentFolder = folders.find((f) => f.id === view) ?? null;
  /** 新しく作る・読み込むプロジェクトを入れるフォルダ */
  const targetFolderId = currentFolder?.id ?? null;
  const folderName = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const folderOf = (p: ProjectMeta) => (p.folderId && folderName.has(p.folderId) ? p.folderId : null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const p of projects ?? []) {
      const f = p.folderId && folderName.has(p.folderId) ? p.folderId : null;
      if (f) m.set(f, (m.get(f) ?? 0) + 1);
      else none++;
    }
    return { m, none };
  }, [projects, folderName]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = projects ?? [];
    // 検索中はすべてのフォルダから探す
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    else if (view === 'none') list = list.filter((p) => !(p.folderId && folderName.has(p.folderId)));
    else if (view !== 'all') list = list.filter((p) => p.folderId === view);
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => collator.compare(a.name, b.name));
    else if (sort === 'created') sorted.sort((a, b) => b.createdAt - a.createdAt);
    return sorted;
  }, [projects, q, view, sort, folderName]);

  const createEmpty = async () => {
    const meta = await createProject(defaultName(), undefined, targetFolderId);
    onOpen(meta.id);
  };

  const createFromImages = async (list: FileList | File[] | null) => {
    const files = pickImageFiles(list);
    if (!files.length) return;
    setBusy('画像を読み込み中…');
    try {
      const name = files[0].name.replace(/\.[^.]+$/, '') || defaultName();
      const meta = await createProject(name, undefined, targetFolderId);
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

  const doImport = async (input: InputFile[] | Promise<InputFile[]>) => {
    setBusy('読み込み中…');
    try {
      const files = await input;
      if (!files.length) return;
      const { imported, errors } = await importFiles(files, targetFolderId, (d, t) => t > 1 && setBusy(`読み込み中… ${d}/${t}`));
      if (imported.length) toast(imported.length === 1 ? `「${imported[0].name}」を読み込みました` : `${imported.length}件のプロジェクトを読み込みました`);
      if (errors.length) toast(`読み込めなかったものがあります：${errors.slice(0, 3).join('、')}`, 'error');
      await refresh();
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : '読み込みに失敗しました', 'error');
    } finally {
      setBusy(null);
    }
  };

  const importFolder = async () => {
    setImportMenu(false);
    if (canPickDirectory()) {
      try {
        const dir = await pickDirectory('read');
        if (dir) await doImport(fromDirectory(dir));
      } catch (e) {
        console.error(e);
        toast('フォルダを開けませんでした', 'error');
      }
    } else dirInput.current?.click();
  };

  const move = async (ids: string[], target: { folderId: string | null } | { newName: string }) => {
    try {
      const folderId = 'newName' in target ? (await createFolder(target.newName)).id : target.folderId;
      await moveProjects(ids, folderId);
      const label = folderId ? `「${folders.find((f) => f.id === folderId)?.name ?? ('newName' in target ? target.newName : '')}」` : '「未分類」';
      toast(`${ids.length > 1 ? `${ids.length}件を` : ''}${label}へ移動しました`);
    } catch (e) {
      console.error(e);
      toast('移動に失敗しました', 'error');
    }
    if (selecting) exitSelect();
    await refresh();
  };

  const organize = async (groups: Suggestion[]) => {
    try {
      for (const g of groups) await moveProjects(g.projectIds, (await findOrCreateFolder(g.name)).id);
      toast(`${groups.length}個のフォルダにまとめました`);
    } catch (e) {
      console.error(e);
      toast('整理に失敗しました', 'error');
    }
    await refresh();
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

  const allSelected = !!visible.length && visible.every((p) => selected.has(p.id));

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

  const saveSelected = () => {
    const ids = (projects ?? []).filter((p) => selected.has(p.id)).map((p) => p.id);
    if (!ids.length) return;
    const one = ids.length === 1 ? projects?.find((p) => p.id === ids[0]) : null;
    setSaveTarget({ projectIds: ids, label: one ? one.name : `文字入れさん ${today()}` });
  };

  const saveFolder = (f: Folder) => {
    const ids = (projects ?? []).filter((p) => p.folderId === f.id).map((p) => p.id);
    if (!ids.length) {
      toast('このフォルダにはプロジェクトがありません', 'error');
      return;
    }
    setSaveTarget({ projectIds: ids, folderName: f.name, label: f.name });
  };

  const moveCurrent = useMemo(() => {
    if (!moveIds?.length || !projects) return undefined;
    const set = new Set(moveIds.map((id) => folderOf(projects.find((p) => p.id === id)!)));
    return set.size === 1 ? [...set][0] : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveIds, projects, folderName]);

  const canImportFolder = canPickDirectory() || supportsDirectoryInput();
  const unfiled = useMemo(() => (projects ?? []).filter((p) => !(p.folderId && folderName.has(p.folderId))), [projects, folderName]);

  const emptyMessage = q
    ? `「${query.trim()}」に一致するプロジェクトはありません。`
    : view === 'all'
      ? 'まだプロジェクトがありません。画像をここにドラッグ＆ドロップしても始められます。'
      : view === 'none'
        ? '未分類のプロジェクトはありません。'
        : 'このフォルダは空です。ここで新規作成するか、プロジェクトの「…」→「フォルダへ移動」で入れられます。';

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
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragOver(false);
        // DataTransfer はイベント中しか読めないので、先に取り出しておく
        const files = Array.from(e.dataTransfer.files);
        const dirs = fromDrop(e.dataTransfer);
        void (async () => {
          const tree = await dirs.catch(() => null);
          if (tree) return doImport(tree);
          const data = files.filter((f) => /\.(zip|json)$/i.test(f.name));
          if (data.length) return doImport(fromFileList(data));
          return createFromImages(files);
        })();
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
          <div ref={importMenuRef} className="relative">
            <Button className="h-11 max-sm:px-3" onClick={() => setImportMenu(!importMenu)} aria-expanded={importMenu}>
              <FileUp size={18} />
              <span>読み込む</span>
            </Button>
            {importMenu && (
              <div className="absolute top-12 right-0 z-30 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-xl">
                {canImportFolder && (
                  <button
                    type="button"
                    className="tap flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-100"
                    onClick={() => void importFolder()}
                  >
                    <FolderOpen size={19} className="mt-0.5 shrink-0 text-[#0a84ff]" />
                    <span>
                      <span className="block text-[15px]">フォルダを選ぶ</span>
                      <span className="block text-[12px] text-neutral-500">OneDrive・iCloud Drive などに保存したフォルダ</span>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="tap flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-100"
                  onClick={() => {
                    setImportMenu(false);
                    fileInput.current?.click();
                  }}
                >
                  <FileUp size={19} className="mt-0.5 shrink-0 text-[#0a84ff]" />
                  <span>
                    <span className="block text-[15px]">ファイルを選ぶ</span>
                    <span className="block text-[12px] text-neutral-500">フォルダの ZIP・バックアップ（.json）</span>
                  </span>
                </button>
              </div>
            )}
          </div>
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
            <span className="min-w-0">
              <span className="block text-[17px] font-semibold">画像から新規作成</span>
              <span className="block truncate text-[13px] opacity-85">
                {currentFolder ? `「${currentFolder.name}」に作成（複数可）` : 'プリントや問題集の写真を選ぶ（複数可）'}
              </span>
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

        {!!projects?.length && (
          <div className="mb-3 flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="名前で探す"
                aria-label="名前で探す"
                className="h-10 w-full rounded-xl border border-neutral-200 bg-white pr-3 pl-9 text-[16px] outline-none focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/30"
              />
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="並び順"
              className="h-10 shrink-0 rounded-xl border border-neutral-200 bg-white px-2 text-[14px] outline-none focus:border-[#0a84ff]"
            >
              <option value="updated">更新が新しい順</option>
              <option value="created">作成が新しい順</option>
              <option value="name">名前順</option>
            </select>
          </div>
        )}

        {!!projects?.length && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <FolderChip
              active={!q && view === 'all'}
              label="すべて"
              count={projects.length}
              icon={FolderOpen}
              dropTarget={false}
              onClick={() => {
                setQuery('');
                setView('all');
              }}
            />
            <FolderChip
              active={!q && view === 'none'}
              label="未分類"
              count={counts.none}
              icon={Inbox}
              dropTarget={!!dragId}
              onClick={() => {
                setQuery('');
                setView('none');
              }}
              onDropProject={(id) => void move([id], { folderId: null })}
            />
            {folders.map((f) => (
              <FolderChip
                key={f.id}
                active={!q && view === f.id}
                label={f.name}
                count={counts.m.get(f.id) ?? 0}
                icon={FolderIcon}
                dropTarget={!!dragId}
                onClick={() => {
                  setQuery('');
                  setView(f.id);
                }}
                onDropProject={(id) => void move([id], { folderId: f.id })}
              />
            ))}
            <Button variant="ghost" className="h-10 px-3" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus size={18} /> フォルダ
            </Button>
            {unfiled.length >= 2 && (
              <Button variant="ghost" className="h-10 px-3" onClick={() => setOrganizeOpen(true)}>
                <Sparkles size={18} /> おまかせ整理
              </Button>
            )}
          </div>
        )}

        {q && <p className="mb-3 text-[13px] text-neutral-500">すべてのフォルダから探しています（{visible.length}件）</p>}

        {!q && currentFolder && (
          <div className="mb-4 flex flex-wrap items-center gap-1 rounded-2xl bg-white px-3 py-2 ring-1 ring-neutral-200">
            <FolderIcon size={19} className="shrink-0 text-[#0a84ff]" />
            <span className="mr-auto min-w-0 truncate px-1 text-[15px] font-semibold">{currentFolder.name}</span>
            <Button variant="ghost" className="h-9 px-2.5 text-[14px]" onClick={() => setRenameFolderTarget(currentFolder)}>
              <Pencil size={16} /> 名前を変更
            </Button>
            <Button variant="ghost" className="h-9 px-2.5 text-[14px]" onClick={() => saveFolder(currentFolder)}>
              <FolderOutput size={16} /> フォルダごと保存
            </Button>
            <Button variant="ghost" className="h-9 px-2.5 text-[14px] text-[#ff3b30] hover:bg-[#ff3b30]/10" onClick={() => setDeleteFolderTarget(currentFolder)}>
              <Trash2 size={16} /> 削除
            </Button>
          </div>
        )}

        {projects && visible.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-neutral-300 px-6 py-14 text-center text-[14px] text-neutral-500">
            {emptyMessage}
          </div>
        )}

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
          {visible.map((p) => {
            const isSel = selected.has(p.id);
            const fid = folderOf(p);
            const showFolder = (view === 'all' || !!q) && fid;
            return (
            <li
              key={p.id}
              className={cx('group relative', dragId === p.id && 'opacity-50')}
              draggable={!selecting}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, p.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragId(p.id);
              }}
              onDragEnd={() => setDragId(null)}
            >
              <button
                type="button"
                aria-pressed={selecting ? isSel : undefined}
                onClick={() => (selecting ? toggleSelected(p.id) : onOpen(p.id))}
                className={cx(
                  'block w-full overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-neutral-200 transition hover:shadow-md hover:ring-[#0a84ff]',
                  selecting && isSel && 'ring-[3px] ring-[#0a84ff]',
                )}
              >
                <div className="relative aspect-[3/4] bg-neutral-100 p-2">
                  <Thumbnail blob={p.thumbnail} />
                  {showFolder && (
                    <span className="absolute top-2 right-2 flex max-w-[85%] items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-[#0a84ff] shadow-sm ring-1 ring-neutral-200">
                      <FolderIcon size={12} className="shrink-0" />
                      <span className="truncate">{folderName.get(fid)}</span>
                    </span>
                  )}
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
              <div data-menu className="absolute right-1.5 bottom-[52px]" ref={menuId === p.id ? menuAnchor : undefined}>
                <IconButton
                  label="メニュー"
                  className="h-9 w-9 bg-white/90 shadow ring-1 ring-neutral-200"
                  onClick={() => setMenuId(menuId === p.id ? null : p.id)}
                >
                  <Ellipsis size={18} />
                </IconButton>
                {menuId === p.id && (
                  <MenuPopover anchor={menuAnchor} width={224}>
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
                      { label: 'フォルダへ移動', icon: FolderInput, action: () => setMoveIds([p.id]) },
                      {
                        label: 'フォルダとして保存',
                        icon: FolderOutput,
                        action: () => setSaveTarget({ projectIds: [p.id], label: p.name }),
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
                  </MenuPopover>
                )}
              </div>
              )}
            </li>
            );
          })}
        </ul>
        <p className="mt-10 text-center text-xs leading-relaxed text-neutral-400">
          データはこの端末のブラウザ内に保存されます。ログイン不要・オフラインでも利用できます。
          <br />
          「…」→「フォルダとして保存」で、iCloud Drive や OneDrive にも保存できます。
        </p>
      </main>

      {selecting && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
            <Button
              variant="ghost"
              className="h-11 px-2.5"
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const p of visible) {
                    if (allSelected) next.delete(p.id);
                    else next.add(p.id);
                  }
                  return next;
                })
              }
            >
              {allSelected ? '選択を解除' : 'すべて選択'}
            </Button>
            <span className="text-[14px] whitespace-nowrap text-neutral-500">{selected.size}件</span>
            <div className="flex-1" />
            <Button className="h-11 px-3" disabled={!selected.size} onClick={() => setMoveIds([...selected])} title="フォルダへ移動">
              <FolderInput size={18} /> <span className="max-sm:hidden">移動</span>
            </Button>
            <Button className="h-11 px-3" disabled={!selected.size} onClick={saveSelected} title="フォルダとして保存">
              <FolderOutput size={18} /> <span className="max-sm:hidden">保存</span>
            </Button>
            <Button variant="danger" className="h-11 px-3" disabled={!selected.size} onClick={() => setBulkDeleteOpen(true)} title="削除">
              <Trash2 size={18} /> <span className="max-sm:hidden">削除</span>
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
        ref={fileInput}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        multiple
        className="hidden"
        onChange={(e) => {
          void doImport(fromFileList(e.target.files));
          e.target.value = '';
        }}
      />
      <input
        ref={(el) => {
          dirInput.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        className="hidden"
        onChange={(e) => {
          void doImport(fromFileList(e.target.files));
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
      <PromptDialog
        open={newFolderOpen}
        title="新しいフォルダ"
        initial=""
        confirmLabel="作成"
        onClose={() => setNewFolderOpen(false)}
        onSubmit={async (name) => {
          const f = await createFolder(name);
          await refresh();
          setQuery('');
          setView(f.id);
        }}
      />
      <PromptDialog
        open={!!renameFolderTarget}
        title="フォルダの名前を変更"
        initial={renameFolderTarget?.name ?? ''}
        confirmLabel="変更"
        onClose={() => setRenameFolderTarget(null)}
        onSubmit={async (name) => {
          if (!renameFolderTarget) return;
          await renameFolder(renameFolderTarget.id, name);
          await refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleteFolderTarget}
        title="フォルダを削除"
        message={
          <>
            フォルダ「{deleteFolderTarget?.name}」を削除しますか？
            <br />
            中のプロジェクト（{deleteFolderTarget ? (counts.m.get(deleteFolderTarget.id) ?? 0) : 0}件）は削除されず、「未分類」に移ります。
          </>
        }
        confirmLabel="フォルダを削除"
        danger
        onConfirm={async () => {
          if (!deleteFolderTarget) return;
          await deleteFolder(deleteFolderTarget.id);
          setView('all');
          await refresh();
          toast('フォルダを削除しました');
        }}
        onClose={() => setDeleteFolderTarget(null)}
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
      <MoveDialog
        open={!!moveIds}
        count={moveIds?.length ?? 0}
        folders={folders}
        current={moveCurrent}
        onMove={(t) => moveIds && void move(moveIds, t)}
        onClose={() => setMoveIds(null)}
      />
      <OrganizeDialog
        open={organizeOpen}
        projects={unfiled}
        folders={folders}
        onApply={(g) => void organize(g)}
        onClose={() => setOrganizeOpen(false)}
      />
      <SaveToFolderDialog
        target={saveTarget}
        onClose={() => {
          setSaveTarget(null);
          if (selecting) exitSelect();
        }}
      />
      {dragOver && (
        <div className="pointer-events-none fixed inset-3 z-30 flex items-center justify-center rounded-3xl border-4 border-dashed border-[#0a84ff] bg-[#0a84ff]/10 text-lg font-semibold text-[#0a84ff]">
          ドロップして読み込む（画像・フォルダ・ZIP）
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
