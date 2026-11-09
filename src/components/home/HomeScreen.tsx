// ホーム画面：プリントの読み込み（撮影・写真/PDF・白紙）、続きから、教科タブ、日付ごとの一覧。
// 教科・状態・期限での整理と、既存のフォルダ（移動・ドラッグ・おまかせ整理）、フォルダとしての保存・読み込み、バックアップ
import {
  Bell,
  CalendarDays,
  Camera,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  Copy,
  Download,
  File as FileIcon,
  FileUp,
  Folder as FolderIcon,
  FolderInput,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  Image as ImageIcon,
  ImagePlus,
  Inbox,
  LayoutList,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadFile } from '../../export/exporters';
import type { Suggestion } from '../../lib/folderLayout';
import {
  continueList,
  groupByDate,
  matchKey,
  normalizeForSearch,
  searchKey,
  sortProjects,
  statusOf,
  subjectOf,
  type HomeSort,
} from '../../lib/homeList';
import { HOME } from '../../lib/homeTheme';
import { subjectColor, subjectOrder, UNCLASSIFIED } from '../../lib/subjects';
import { updateThumbnail, whenClosed } from '../../storage/autosave';
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
import { canReadImages, readPageLines, readPrint, summarize } from '../../storage/printReader';
import { importFiles, type InputFile, type SaveTarget } from '../../storage/projectFolder';
import {
  backfillWrittenPages,
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  loadDocument,
  saveDocument,
  updateProjectMeta,
} from '../../storage/projectRepo';
import { toast } from '../../store/toastStore';
import type { Folder, ProjectMeta } from '../../types/model';
import { openAllNews } from '../ui/NewsDialog';
import { ConfirmDialog, cx, MenuPopover, PromptDialog } from '../ui/primitives';
import { DetailsDialog, type DetailsPatch } from './DetailsDialog';
import { HomeButton, ProgressBar, SubjectBadge, Thumbnail } from './HomeParts';
import { MoveDialog } from './MoveDialog';
import { OrganizeDialog, type OrganizeMode } from './OrganizeDialog';
import { DRAG_TYPE, ProjectCard } from './ProjectCard';
import { SaveToFolderDialog } from './SaveToFolderDialog';

/** 表示中のフォルダ：すべて／フォルダなし／フォルダの ID */
type View = 'all' | 'none' | string;
/** 教科タブ：すべて／未分類／教科名 */
type SubjectTab = 'all' | 'none' | string;

const SORTS: { value: HomeSort; label: string }[] = [
  { value: 'due', label: '期限が近い順' },
  { value: 'updated', label: '更新が新しい順' },
  { value: 'created', label: '作成が新しい順' },
  { value: 'name', label: '名前順' },
];

function loadPref<T extends string>(key: string, fallback: T, valid?: readonly string[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v !== null && (!valid || valid.includes(v)) ? v : fallback;
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

/** カメラで撮った写真など、意味のないファイル名か */
function isGenericFileName(name: string): boolean {
  return !name || /^(image|photo|img|scan|写真)[\s_\-]*\d*$/i.test(name);
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
        'tap flex h-11 max-w-[220px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14px] transition',
        active ? 'bg-white font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-black/[0.1]' : 'hover:bg-black/[0.05]',
        dropTarget && onDropProject && !active && 'ring-2 ring-[#0a5fcc]/40',
        over && 'bg-[#0a5fcc]/10 ring-2 ring-[#0a5fcc]',
      )}
      style={{ color: HOME.text }}
    >
      <Icon size={16} className="shrink-0" style={{ color: active ? HOME.primary : HOME.muted }} aria-hidden />
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[12px] tabular-nums" style={{ color: HOME.muted }}>
        {count}
      </span>
    </button>
  );
}

/** 教科タブ（色の丸と教科名・件数。選択中は黒地） */
function SubjectTabButton({
  active,
  label,
  count,
  dot,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'tap flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition',
        active ? '' : 'bg-white ring-1 ring-black/[0.1] hover:bg-neutral-50',
      )}
      style={active ? { background: HOME.tabActiveBg, color: HOME.tabActiveText } : { color: HOME.text }}
    >
      {dot && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/60" style={{ background: dot }} />}
      <span>{label}</span>
      <span className="tabular-nums" style={{ color: active ? '#e5e5ea' : HOME.muted }}>
        {count}
        <span className="sr-only">件</span>
      </span>
    </button>
  );
}

export function HomeScreen({ onOpen, onSwitchDesign }: { onOpen: (id: string) => void; onSwitchDesign: () => void }) {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [view, setViewState] = useState<View>(() => loadPref<View>('mojiire.home.view', 'all'));
  const [tab, setTabState] = useState<SubjectTab>(() => loadPref<SubjectTab>('mojiire.home.subject', 'all'));
  const [sort, setSortState] = useState<HomeSort>(() =>
    loadPref<HomeSort>('mojiire.home.sort', 'due', SORTS.map((s) => s.value)),
  );
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuAnchor = useRef<HTMLDivElement>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ProjectMeta | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const [organizeMode, setOrganizeMode] = useState<OrganizeMode | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<Folder | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [importMenu, setImportMenu] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  /** マウスなど細かく指せる端末だけ、カードをドラッグしてフォルダへ移動できる（タッチの長押しはメニュー） */
  const canDrag = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches, []);

  const setView = (v: View) => {
    setViewState(v);
    savePref('mojiire.home.view', v);
  };
  const setTab = (v: SubjectTab) => {
    setTabState(v);
    savePref('mojiire.home.subject', v);
  };
  const setSort = (v: HomeSort) => {
    setSortState(v);
    savePref('mojiire.home.sort', v);
  };

  const refresh = useCallback(async () => {
    // 編集画面から戻った直後は、保存とサムネイル作成の完了を待ってから一覧を読む
    await whenClosed();
    // 古いプロジェクトの「書き込みのあるページ数」を数える（初回だけ）
    await backfillWrittenPages().catch((e) => console.warn('backfill failed', e));
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

  // 一覧を読み直すたびに「今日」を取り直す（日付をまたいで開いたままでも、戻ってきたときに直る）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [projects]);

  const currentFolder = folders.find((f) => f.id === view) ?? null;
  /** 新しく作る・読み込むプロジェクトを入れるフォルダ */
  const targetFolderId = currentFolder?.id ?? null;
  const folderName = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const folderOf = (p: ProjectMeta) => (p.folderId && folderName.has(p.folderId) ? p.folderId : null);
  /** 教科タブで選んでいる教科（新しく作るプリントにもつける） */
  const tabSubject = tab !== 'all' && tab !== 'none' ? tab : null;

  const subjects = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, subjectOf(p, (id) => folderName.get(id))])),
    [projects, folderName],
  );
  const subjectFor = (p: ProjectMeta) => subjects.get(p.id) ?? null;

  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const p of projects ?? []) {
      const f = p.folderId && folderName.has(p.folderId) ? p.folderId : null;
      if (f) m.set(f, (m.get(f) ?? 0) + 1);
      else none++;
    }
    return { m, none };
  }, [projects, folderName]);

  /** いま表示しているフォルダの中のプロジェクト */
  const inFolder = useMemo(() => {
    const list = projects ?? [];
    if (view === 'none') return list.filter((p) => !(p.folderId && folderName.has(p.folderId)));
    if (view !== 'all') return list.filter((p) => p.folderId === view);
    return list;
  }, [projects, view, folderName]);

  const tabCounts = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const p of inFolder) {
      const s = subjects.get(p.id) ?? null;
      if (s) m.set(s, (m.get(s) ?? 0) + 1);
      else none++;
    }
    return { m, none };
  }, [inFolder, subjects]);

  const subjectTabs = useMemo(() => {
    const names = new Set(tabCounts.m.keys());
    if (tabSubject) names.add(tabSubject);
    return [...names].sort((a, b) => subjectOrder(a) - subjectOrder(b) || a.localeCompare(b, 'ja'));
  }, [tabCounts, tabSubject]);

  const searchKeys = useMemo(() => new Map((projects ?? []).map((p) => [p.id, searchKey(p)])), [projects]);
  const q = normalizeForSearch(query);
  const textMatches = new Set<string>();
  const visible = useMemo(() => {
    let list: ProjectMeta[];
    // 検索中はすべてのフォルダ・教科から探す
    if (q) list = (projects ?? []).filter((p) => matchKey(searchKeys.get(p.id)!, q));
    else if (tab === 'none') list = inFolder.filter((p) => !subjects.get(p.id));
    else if (tab !== 'all') list = inFolder.filter((p) => subjects.get(p.id) === tab);
    else list = inFolder;
    return sortProjects(list, sort);
  }, [projects, q, searchKeys, tab, inFolder, subjects, sort]);
  if (q) for (const p of visible) if (matchKey(searchKeys.get(p.id)!, q) === 'text') textMatches.add(p.id);

  const groups = useMemo(
    () =>
      sort === 'name'
        ? [{ label: null, items: visible }]
        : groupByDate(visible, (p) => (sort === 'created' ? p.createdAt : p.updatedAt), now),
    [visible, sort, now],
  );

  const continueItems = useMemo(() => continueList(projects ?? []), [projects]);
  const doingCount = useMemo(() => (projects ?? []).filter((p) => statusOf(p) === 'doing').length, [projects]);
  /** フォルダに入っていないもの（フォルダの「おまかせ整理」の対象） */
  const unfiled = useMemo(() => (projects ?? []).filter((p) => !(p.folderId && folderName.has(p.folderId))), [projects, folderName]);
  /** 教科が未分類のもの（表示中のフォルダの中。「おまかせで分ける」の対象） */
  const unclassified = useMemo(() => inFolder.filter((p) => !subjects.get(p.id)), [inFolder, subjects]);

  const createEmpty = async () => {
    try {
      const meta = await createProject(defaultName(), undefined, targetFolderId, tabSubject ? { subject: tabSubject } : {});
      onOpen(meta.id);
    } catch (e) {
      console.error(e);
      toast('作成に失敗しました', 'error');
    }
  };

  const createFromImages = async (list: FileList | File[] | null) => {
    const files = pickImageFiles(list);
    if (!files.length) return;
    setBusy('読み込み中…');
    try {
      const base = files[0].name.replace(/\.[^.]+$/, '');
      const name = isGenericFileName(base) ? defaultName() : base;
      const meta = await createProject(name, undefined, targetFolderId, tabSubject ? { subject: tabSubject } : {});
      const { pages, failed } = await importImageFiles(meta.id, files, (p) => setBusy(p.message));
      if (!pages.length) {
        // 1枚も読み込めなかった場合は空のプロジェクトを残さない
        await deleteProject(meta.id);
        toast(`画像を読み込めませんでした：${failed.join('、')}（PNG・JPEG・WebP・PDF に対応）`, 'error');
        return;
      }
      await saveDocument(meta.id, { pages });
      // 一覧ですぐ見えるよう、1ページ目のサムネイルを作っておく（切り抜き・補正後は編集画面で作り直される）
      await updateThumbnail(meta.id, { pages });
      if (failed.length) toast(`読み込めなかったファイルがあります：${failed.join('、')}`, 'error');

      // プリントの文字を読み取って、名前と教科をつける（読み取れなければ従来どおりの名前で未分類）
      setBusy('プリントを読み取り中…（初回は準備に少し時間がかかります）');
      const reading = await readPrint(files, pages);
      const patch: Partial<ProjectMeta> = { ocrText: reading?.text ?? '' };
      if (reading?.title) {
        patch.name = reading.title;
        patch.autoNamed = true;
      }
      if (!tabSubject && reading?.subject) patch.subject = reading.subject;
      await updateProjectMeta(meta.id, patch);
      if (patch.autoNamed) toast(`「${patch.name}」と名前をつけました${patch.subject ? `（${patch.subject}）` : ''}`);
      else if (patch.subject) toast(`教科を「${patch.subject}」にしました`);
      onOpen(meta.id);
    } catch (e) {
      console.error(e);
      toast('読み込みに失敗しました', 'error');
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
      const label = folderId ? `「${folders.find((f) => f.id === folderId)?.name ?? ('newName' in target ? target.newName : '')}」` : '「フォルダなし」';
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

  /** 「おまかせで分ける」：推定した教科を設定する */
  const applySubjects = async (groups: Suggestion[]) => {
    try {
      let n = 0;
      for (const g of groups) {
        for (const id of g.projectIds) {
          await updateProjectMeta(id, { subject: g.name });
          n++;
        }
      }
      toast(`${n}件を${groups.length}つの教科に分けました`);
    } catch (e) {
      console.error(e);
      toast('教科の設定に失敗しました', 'error');
    }
    await refresh();
  };

  /** まだ中身を読み取っていないプリントを読み取ってから、おまかせ整理を開く */
  const openOrganize = async (mode: OrganizeMode) => {
    if (mode === 'subject' && canReadImages()) {
      // 写真の読み取りは1件数秒かかるので、一度に読むのは12件まで
      const targets = unclassified.filter((p) => p.ocrText === undefined).slice(0, 12);
      try {
        for (let i = 0; i < targets.length; i++) {
          setBusy(`プリントを読み取り中… ${i + 1}/${targets.length}`);
          const doc = await loadDocument(targets[i].id);
          const lines = doc ? await readPageLines(doc.pages, 1) : null;
          await updateProjectMeta(targets[i].id, { ocrText: lines ? summarize(lines).text : '' });
        }
      } catch (e) {
        console.warn('read failed', e);
      } finally {
        setBusy(null);
      }
      if (targets.length) await refresh();
    }
    setOrganizeMode(mode);
  };

  const saveDetails = async (p: ProjectMeta, patch: DetailsPatch) => {
    const update: Partial<ProjectMeta> = { status: patch.status, dueDate: patch.dueDate, dueType: patch.dueType };
    // 教科は変えたときだけ保存する（フォルダ名から決まっているだけのものはそのままにする）
    if (patch.subject !== subjectFor(p)) update.subject = patch.subject;
    try {
      await updateProjectMeta(p.id, update);
    } catch (e) {
      console.error(e);
      toast('保存に失敗しました', 'error');
    }
    await refresh();
  };

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

  const menuItems = (p: ProjectMeta) => {
    const done = statusOf(p) === 'done';
    return [
      { label: '開く', icon: FolderOpen, action: () => onOpen(p.id) },
      { label: '名前を変更', icon: Pencil, action: () => setRenameTarget(p) },
      { label: '期限・教科を設定', icon: Tags, action: () => setDetailsTarget(p) },
      {
        label: done ? '完了を取り消す' : '完了にする',
        icon: done ? RotateCcw : CheckCheck,
        action: async () => {
          await updateProjectMeta(p.id, { status: done ? null : 'done' });
          await refresh();
        },
      },
      {
        label: '複製',
        icon: Copy,
        action: async () => {
          await duplicateProject(p.id, `${p.name} のコピー`);
          await refresh();
        },
      },
      { label: 'フォルダへ移動', icon: FolderInput, action: () => setMoveIds([p.id]) },
      { label: 'フォルダとして保存', icon: FolderOutput, action: () => setSaveTarget({ projectIds: [p.id], label: p.name }) },
      { label: 'バックアップを保存', icon: Download, action: () => doBackup(p) },
      { label: '削除', icon: Trash2, action: () => setDeleteTarget(p), danger: true },
    ];
  };

  const emptyMessage = q
    ? `「${query.trim()}」に一致するプリントはありません。`
    : !projects?.length
      ? 'まだプリントがありません。上の「撮影」「写真・PDF」から読み込むか、画像をここにドラッグ＆ドロップしてください。'
      : tab === 'none'
        ? '未分類のプリントはありません。'
        : tab !== 'all'
          ? `「${tab}」のプリントはありません。`
          : view === 'none'
            ? 'フォルダに入っていないプリントはありません。'
            : 'このフォルダは空です。ここで読み込むか、プリントの「…」→「フォルダへ移動」で入れられます。';

  const primaryButtonBg = `rgb(255 255 255 / ${HOME.primaryButtonAlpha})`;

  return (
    <div
      className="min-h-dvh"
      style={{ background: HOME.page, color: HOME.text }}
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
        className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 sm:gap-x-4 py-2.5 sm:h-16 sm:flex-nowrap sm:py-0">
          <div className="flex shrink-0 items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-9 w-9" />
            <h1 className="text-[16px] leading-tight font-bold whitespace-nowrap sm:text-[19px]">文字入れさん</h1>
          </div>
          <label className="relative order-last w-full sm:order-none sm:mx-auto sm:max-w-xl sm:flex-1">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2" style={{ color: HOME.muted }} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前・プリントの中身で探す（例：助動詞）"
              aria-label="名前・プリントの中身で探す"
              className="h-11 w-full rounded-xl border border-transparent bg-[#eef0f3] pr-3 pl-10 text-[16px] outline-none placeholder:text-[#5c6066] focus:border-[#0a5fcc] focus:bg-white focus:ring-2 focus:ring-[#0a5fcc]/30"
            />
          </label>
          <button
            type="button"
            onClick={onSwitchDesign}
            aria-label="前のデザインに切り替える"
            title="前のデザインに切り替える"
            className="tap ml-auto flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[14px] font-medium whitespace-nowrap hover:bg-black/[0.05] sm:ml-0 sm:px-2.5"
            style={{ color: HOME.link }}
          >
            <LayoutList size={18} className="max-sm:hidden" aria-hidden />
            旧デザイン
          </button>
          <button
            type="button"
            onClick={openAllNews}
            className="tap flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-2.5 text-[14px] font-medium whitespace-nowrap hover:bg-neutral-50 sm:px-3.5"
            style={{ color: HOME.text }}
          >
            <Bell size={18} aria-hidden />
            お知らせ
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-7" style={{ paddingBottom: `calc(${selecting ? 88 : 24}px + env(safe-area-inset-bottom))` }}>
        <div className={cx('grid gap-4', continueItems.length > 0 && 'lg:grid-cols-[340px_minmax(0,1fr)]')}>
          {/* 作成の入口（撮影・写真/PDF・白紙） */}
          <section aria-label="プリントを読み込む" className="rounded-2xl p-4 text-white sm:p-5" style={{ background: HOME.primary }}>
            <button
              type="button"
              onClick={() => imageInput.current?.click()}
              className="tap flex min-h-11 w-full items-center gap-3.5 rounded-xl text-left"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: primaryButtonBg }}>
                <Plus size={26} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[18px] font-bold">プリントを読み込む</span>
                <span className="block truncate text-[13px]" style={{ color: `rgb(255 255 255 / ${HOME.primarySubAlpha})` }}>
                  {currentFolder ? `「${currentFolder.name}」フォルダに入れます` : '名前と教科は自動でつけます'}
                </span>
              </span>
            </button>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: '撮影', icon: Camera, onClick: () => cameraInput.current?.click() },
                { label: '写真・PDF', icon: ImageIcon, onClick: () => imageInput.current?.click() },
                { label: '白紙', icon: FileIcon, onClick: () => void createEmpty() },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={b.onClick}
                  className="tap flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl text-[14px] font-medium transition hover:brightness-110 active:scale-[0.98]"
                  style={{ background: primaryButtonBg }}
                >
                  <b.icon size={20} aria-hidden />
                  {b.label}
                </button>
              ))}
            </div>
            <div ref={importMenuRef} className="relative mt-2">
              <button
                type="button"
                onClick={() => setImportMenu(!importMenu)}
                aria-expanded={importMenu}
                className="tap -ml-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[13.5px] underline-offset-2 hover:underline"
              >
                <FileUp size={16} aria-hidden />
                保存したフォルダ・バックアップを開く
              </button>
              {importMenu && (
                <div className="absolute top-full left-0 z-30 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-xl" style={{ color: HOME.text }}>
                  {canImportFolder && (
                    <button
                      type="button"
                      className="tap flex min-h-11 w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-100"
                      onClick={() => void importFolder()}
                    >
                      <FolderOpen size={19} className="mt-0.5 shrink-0" style={{ color: HOME.primary }} aria-hidden />
                      <span>
                        <span className="block text-[15px]">フォルダを選ぶ</span>
                        <span className="block text-[12px]" style={{ color: HOME.muted }}>
                          OneDrive・iCloud Drive などに保存したフォルダ
                        </span>
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="tap flex min-h-11 w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-100"
                    onClick={() => {
                      setImportMenu(false);
                      fileInput.current?.click();
                    }}
                  >
                    <FileUp size={19} className="mt-0.5 shrink-0" style={{ color: HOME.primary }} aria-hidden />
                    <span>
                      <span className="block text-[15px]">ファイルを選ぶ</span>
                      <span className="block text-[12px]" style={{ color: HOME.muted }}>
                        フォルダの ZIP・バックアップ（.json）
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 続きから（書き込み中のものを最大3件） */}
          {continueItems.length > 0 && (
            <section aria-labelledby="continue-heading" className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-black/[0.06] sm:p-5">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 id="continue-heading" className="text-[16px] font-bold">
                  続きから
                </h2>
                <span className="ml-auto text-[13px]" style={{ color: HOME.muted }}>
                  書きかけ {doingCount}件
                </span>
              </div>
              <ul className="grid gap-3 sm:grid-cols-3">
                {continueItems.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpen(p.id)}
                      className="tap flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 ring-black/[0.1] transition hover:ring-[#0a5fcc]/60"
                    >
                      <span className="block h-[68px] w-[50px] shrink-0 overflow-hidden rounded-[3px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.15)] ring-1 ring-black/[0.06]">
                        <Thumbnail blob={p.thumbnail} small fit="cover" />
                      </span>
                      <span className="block min-w-0 flex-1">
                        <SubjectBadge subject={subjectFor(p)} />
                        <span className="mt-1 line-clamp-2 text-[14px] leading-snug font-semibold break-words">{p.name}</span>
                        <span className="mt-1.5 block">
                          <ProgressBar done={p.writtenPages ?? 0} total={p.pageCount} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* 教科タブと並び替え */}
        {!!projects?.length && (
          <div className="mt-6 flex items-center gap-3">
            <div role="group" aria-label="教科で絞り込む" className="no-scrollbar relative -my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 pl-0.5">
              <SubjectTabButton
                active={!q && tab === 'all'}
                label="すべて"
                count={inFolder.length}
                onClick={() => {
                  setQuery('');
                  setTab('all');
                }}
              />
              {subjectTabs.map((s) => (
                <SubjectTabButton
                  key={s}
                  active={!q && tab === s}
                  label={s}
                  count={tabCounts.m.get(s) ?? 0}
                  dot={subjectColor(s).fg}
                  onClick={() => {
                    setQuery('');
                    setTab(s);
                  }}
                />
              ))}
              {(tabCounts.none > 0 || tab === 'none') && (
                <SubjectTabButton
                  active={!q && tab === 'none'}
                  label={UNCLASSIFIED}
                  count={tabCounts.none}
                  dot={subjectColor(null).fg}
                  onClick={() => {
                    setQuery('');
                    setTab('none');
                  }}
                />
              )}
            </div>
            <label className="relative shrink-0">
              <CalendarDays size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" style={{ color: HOME.text }} aria-hidden />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as HomeSort)}
                aria-label="並び順"
                className="h-11 appearance-none rounded-xl bg-white pr-8 pl-9 text-[14px] ring-1 ring-black/[0.1] outline-none focus:ring-2 focus:ring-[#0a5fcc]"
                style={{ color: HOME.text }}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2" style={{ color: HOME.text }} aria-hidden />
            </label>
          </div>
        )}

        {/* 未分類のプリントがあるときのお知らせ */}
        {!q && unclassified.length > 0 && (
          <div
            role="region"
            aria-label="未分類のプリント"
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-2"
            style={{ background: HOME.bannerBg, color: HOME.bannerText }}
          >
            <Sparkles size={18} className="shrink-0" style={{ color: HOME.primary }} aria-hidden />
            <p className="min-w-0 flex-1 py-1.5 text-[14px]">
              未分類のプリントが{unclassified.length}件あります。中身を読み取って教科ごとに分けますか？
            </p>
            <button
              type="button"
              onClick={() => void openOrganize('subject')}
              className="tap min-h-11 shrink-0 rounded-xl px-4 text-[14px] font-semibold text-white transition hover:brightness-110"
              style={{ background: HOME.primary }}
            >
              おまかせで分ける
            </button>
          </div>
        )}

        {/* フォルダ（既存の整理機能）と選択 */}
        {!!projects?.length && (
          <div className="mt-4 flex flex-wrap items-center gap-1">
            {folders.length > 0 && (
              <>
                <span className="mr-1 text-[13px] font-semibold" style={{ color: HOME.muted }}>
                  フォルダ
                </span>
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
                  label="フォルダなし"
                  count={folderCounts.none}
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
                    count={folderCounts.m.get(f.id) ?? 0}
                    icon={FolderIcon}
                    dropTarget={!!dragId}
                    onClick={() => {
                      setQuery('');
                      setView(f.id);
                    }}
                    onDropProject={(id) => void move([id], { folderId: f.id })}
                  />
                ))}
              </>
            )}
            <HomeButton onClick={() => setNewFolderOpen(true)}>
              <FolderPlus size={18} aria-hidden /> {folders.length ? 'フォルダ' : 'フォルダを作る'}
            </HomeButton>
            {folders.length > 0 && unfiled.length >= 2 && (
              <HomeButton onClick={() => void openOrganize('name')}>
                <Sparkles size={18} aria-hidden /> おまかせ整理
              </HomeButton>
            )}
            <div className="flex-1" />
            {selecting ? (
              <HomeButton onClick={exitSelect}>
                <X size={18} aria-hidden /> 完了
              </HomeButton>
            ) : (
              <HomeButton onClick={() => setSelecting(true)}>
                <CheckSquare size={18} aria-hidden /> 選択
              </HomeButton>
            )}
          </div>
        )}

        {q && (
          <p className="mt-3 text-[13px]" style={{ color: HOME.muted }}>
            すべてのフォルダ・教科から探しています（{visible.length}件）
          </p>
        )}

        {!q && currentFolder && (
          <div className="mt-3 flex flex-wrap items-center gap-1 rounded-xl bg-white px-3 py-1 ring-1 ring-black/[0.07]">
            <FolderIcon size={19} className="shrink-0" style={{ color: HOME.primary }} aria-hidden />
            <span className="mr-auto min-w-0 truncate px-1 text-[15px] font-semibold">{currentFolder.name}</span>
            <HomeButton onClick={() => setRenameFolderTarget(currentFolder)}>
              <Pencil size={16} aria-hidden /> 名前を変更
            </HomeButton>
            <HomeButton onClick={() => saveFolder(currentFolder)}>
              <FolderOutput size={16} aria-hidden /> フォルダごと保存
            </HomeButton>
            <HomeButton tone="danger" onClick={() => setDeleteFolderTarget(currentFolder)}>
              <Trash2 size={16} aria-hidden /> 削除
            </HomeButton>
          </div>
        )}

        {projects && visible.length === 0 && (
          <div
            className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center text-[14px] leading-relaxed"
            style={{ color: HOME.muted }}
          >
            {!projects.length && <ImagePlus size={28} strokeWidth={1.5} aria-hidden />}
            {emptyMessage}
          </div>
        )}

        {groups.map((g) => (
          <section key={g.label ?? 'all'} aria-labelledby={g.label ? `group-${g.label}` : undefined} className="mt-6">
            {g.label && (
              <h2 id={`group-${g.label}`} className="mb-3 text-[16px] font-bold">
                {g.label}
              </h2>
            )}
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {g.items.map((p) => {
                const fid = folderOf(p);
                const menuOpen = menuId === p.id;
                return (
                  <ProjectCard
                    key={p.id}
                    p={p}
                    subject={subjectFor(p)}
                    status={statusOf(p)}
                    now={now}
                    folderLabel={(view === 'all' || !!q) && fid ? (folderName.get(fid) ?? null) : null}
                    matchedText={textMatches.has(p.id)}
                    selecting={selecting}
                    selected={selected.has(p.id)}
                    draggable={canDrag && !selecting}
                    dragging={dragId === p.id}
                    menuAnchor={menuOpen ? menuAnchor : undefined}
                    menu={
                      menuOpen ? (
                        <MenuPopover anchor={menuAnchor} width={236}>
                          <div role="menu" aria-label={`「${p.name}」のメニュー`}>
                            {menuItems(p).map((item) => (
                              <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                className="tap flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] hover:bg-neutral-100"
                                style={{ color: item.danger ? HOME.dueSoon : HOME.text }}
                                onClick={() => {
                                  setMenuId(null);
                                  void item.action();
                                }}
                              >
                                <item.icon size={17} aria-hidden /> {item.label}
                              </button>
                            ))}
                          </div>
                        </MenuPopover>
                      ) : null
                    }
                    onOpen={() => onOpen(p.id)}
                    onToggleSelect={() => toggleSelected(p.id)}
                    onMenu={(open) => setMenuId(open ? p.id : null)}
                    onRenameAuto={() => setRenameTarget(p)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, p.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(p.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                  />
                );
              })}
            </ul>
          </section>
        ))}

        <p className="mt-10 text-center text-xs leading-relaxed" style={{ color: HOME.muted }}>
          データはこの端末のブラウザ内に保存されます。ログイン不要・オフラインでも利用できます。
          <br />
          プリントの文字の読み取りも端末の中で行い、外部には送りません。
          <br />
          「…」→「フォルダとして保存」で、iCloud Drive や OneDrive にも保存できます。
        </p>
        <div className="mt-2 flex justify-center">
          <HomeButton onClick={onSwitchDesign}>
            <LayoutList size={18} aria-hidden /> 前のデザインに切り替える
          </HomeButton>
        </div>
      </main>

      {selecting && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
            <HomeButton
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
            </HomeButton>
            <span className="text-[14px] whitespace-nowrap" style={{ color: HOME.muted }}>
              {selected.size}件
            </span>
            <div className="flex-1" />
            <HomeButton tone="plain" className="bg-neutral-200/80" disabled={!selected.size} onClick={() => setMoveIds([...selected])} aria-label="フォルダへ移動" title="フォルダへ移動">
              <FolderInput size={18} aria-hidden /> <span className="max-sm:hidden">移動</span>
            </HomeButton>
            <HomeButton tone="plain" className="bg-neutral-200/80" disabled={!selected.size} onClick={saveSelected} aria-label="フォルダとして保存" title="フォルダとして保存">
              <FolderOutput size={18} aria-hidden /> <span className="max-sm:hidden">保存</span>
            </HomeButton>
            <HomeButton
              tone="dangerSolid"
              disabled={!selected.size}
              onClick={() => setBulkDeleteOpen(true)}
              aria-label="削除"
              title="削除"
            >
              <Trash2 size={18} aria-hidden /> <span className="max-sm:hidden">削除</span>
            </HomeButton>
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
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
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
          await updateProjectMeta(renameTarget.id, { name, autoNamed: false, updatedAt: Date.now() });
          await refresh();
        }}
      />
      <DetailsDialog
        project={detailsTarget}
        subject={detailsTarget ? subjectFor(detailsTarget) : null}
        onSave={(patch) => detailsTarget && void saveDetails(detailsTarget, patch)}
        onClose={() => setDetailsTarget(null)}
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
            中のプリント（{deleteFolderTarget ? (folderCounts.m.get(deleteFolderTarget.id) ?? 0) : 0}件）は削除されず、「フォルダなし」に移ります。
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
        title="プリントを削除"
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
        title="プリントを削除"
        message={
          <>
            選択した{selected.size}件のプリントを削除しますか？
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
        open={!!organizeMode}
        initialMode={organizeMode ?? 'name'}
        projects={unfiled}
        subjectProjects={unclassified}
        folders={folders}
        onApply={(g) => void organize(g)}
        onApplySubjects={(g) => void applySubjects(g)}
        onClose={() => setOrganizeMode(null)}
      />
      <SaveToFolderDialog
        target={saveTarget}
        onClose={() => {
          setSaveTarget(null);
          if (selecting) exitSelect();
        }}
      />
      {dragOver && (
        <div className="pointer-events-none fixed inset-3 z-30 flex items-center justify-center rounded-3xl border-4 border-dashed border-[#0a5fcc] bg-[#0a5fcc]/10 text-lg font-semibold text-[#0a5fcc]">
          ドロップして読み込む（画像・PDF・フォルダ・ZIP）
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
