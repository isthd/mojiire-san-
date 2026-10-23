// エディターの状態管理（Zustand）。ドキュメントは不変データとして扱い、履歴でUndo/Redoを実現する。
import { create } from 'zustand';
import type { Point, View } from '../lib/geometry';
import { uid } from '../lib/id';
import type { SavedHistory } from '../storage/db';
import { isEmptyText, type EditorObject, type Page, type ProjectDoc, type TextObject } from '../types/model';
import { createHistory, pushHistory, redoHistory, undoHistory, type HistoryState } from './history';

export type ToolType =
  | 'select'
  | 'text'
  | 'math'
  | 'pen'
  | 'highlighter'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'eraser'
  | 'hand';

export interface TextEditState {
  obj: TextObject;
  isNew: boolean;
  pageId: string;
}

export interface MathEditState {
  /** 既存の数式を編集する場合のID */
  targetId: string | null;
  /** 新規配置位置（画像座標）。null なら表示中央 */
  at: Point | null;
  initialLatex: string;
}

export type ModalType = 'export' | 'settings' | null;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface EditorState {
  projectId: string | null;
  projectName: string;
  history: HistoryState<ProjectDoc>;
  currentPageId: string | null;
  selectedIds: string[];
  tool: ToolType;
  view: View;
  textEdit: TextEditState | null;
  mathEdit: MathEditState | null;
  modal: ModalType;
  clipboard: EditorObject[];
  pasteCount: number;
  saveStatus: SaveStatus;
  busy: { message: string; progress?: number } | null;
  /** フォント読み込み完了などで再計測が必要になったときに増える */
  renderEpoch: number;

  loadProject: (id: string, name: string, doc: ProjectDoc, saved?: SavedHistory) => void;
  closeProject: () => void;
  setProjectName: (name: string) => void;

  setTool: (tool: ToolType) => void;
  setView: (view: View) => void;
  select: (ids: string[]) => void;
  setModal: (m: ModalType) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setBusy: (b: EditorState['busy']) => void;
  bumpRenderEpoch: () => void;

  // ページ
  setCurrentPage: (id: string) => void;
  addPages: (pages: Page[]) => void;
  removePage: (id: string) => void;
  movePage: (id: string, delta: number) => void;

  // オブジェクト
  addObject: (obj: EditorObject, opts?: { select?: boolean }) => void;
  /** まとめて追加（元に戻すは1回分） */
  addObjects: (objs: EditorObject[]) => void;
  updateObjects: (patches: Record<string, Partial<EditorObject>>, key?: string) => void;
  deleteObjects: (ids: string[], key?: string) => void;
  reorder: (ids: string[], mode: 'front' | 'back' | 'forward' | 'backward') => void;
  duplicate: (ids: string[]) => void;
  copy: (ids: string[]) => void;
  paste: () => void;

  undo: () => void;
  redo: () => void;

  // テキスト編集
  startTextEdit: (obj: TextObject, isNew: boolean) => void;
  updateTextDraft: (patch: Partial<TextObject>) => void;
  /** select=true なら確定したテキストを選択状態にする */
  commitTextEdit: (opts?: { select?: boolean }) => void;
  cancelTextEdit: () => void;

  // 数式編集
  openMathEditor: (state: MathEditState) => void;
  closeMathEditor: () => void;
}

const EMPTY_DOC: ProjectDoc = { pages: [] };

export function currentPageOf(s: Pick<EditorState, 'history' | 'currentPageId'>): Page | null {
  const pages = s.history.present.pages;
  return pages.find((p) => p.id === s.currentPageId) ?? pages[0] ?? null;
}

function mapPage(doc: ProjectDoc, pageId: string, fn: (p: Page) => Page): ProjectDoc {
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== pageId) return p;
    const np = fn(p);
    if (np !== p) changed = true;
    return np;
  });
  return changed ? { ...doc, pages } : doc;
}

/** 履歴を変更しつつ、存在しなくなった選択・ページを整合させる */
function withHistory(s: EditorState, history: HistoryState<ProjectDoc>): Partial<EditorState> {
  const pages = history.present.pages;
  const currentPageId = pages.some((p) => p.id === s.currentPageId) ? s.currentPageId : (pages[0]?.id ?? null);
  const page = pages.find((p) => p.id === currentPageId);
  const ids = new Set(page?.objects.map((o) => o.id) ?? []);
  const selectedIds = s.selectedIds.filter((id) => ids.has(id));
  return {
    history,
    currentPageId,
    selectedIds: selectedIds.length === s.selectedIds.length ? s.selectedIds : selectedIds,
  };
}

function cloneWithNewId(o: EditorObject, dx: number, dy: number): EditorObject {
  return { ...structuredClone(o), id: uid(), x: o.x + dx, y: o.y + dy };
}

export const useEditor = create<EditorState>()((set, get) => {
  /** 現在ページのオブジェクト配列を更新して履歴に積む */
  const commitObjects = (fn: (objs: EditorObject[]) => EditorObject[], key?: string, extra?: Partial<EditorState>) => {
    const s = get();
    const page = currentPageOf(s);
    if (!page) return;
    const doc = mapPage(s.history.present, page.id, (p) => {
      const objects = fn(p.objects);
      return objects === p.objects ? p : { ...p, objects };
    });
    if (doc === s.history.present) {
      if (extra) set(extra);
      return;
    }
    set({ ...withHistory(s, pushHistory(s.history, doc, key ?? null)), ...extra });
  };

  return {
    projectId: null,
    projectName: '',
    history: createHistory(EMPTY_DOC),
    currentPageId: null,
    selectedIds: [],
    tool: 'select',
    view: { zoom: 1, x: 0, y: 0 },
    textEdit: null,
    mathEdit: null,
    modal: null,
    clipboard: [],
    pasteCount: 0,
    saveStatus: 'idle',
    busy: null,
    renderEpoch: 0,

    loadProject: (id, name, doc, saved) =>
      set({
        projectId: id,
        projectName: name,
        history: createHistory(doc, saved),
        currentPageId: doc.pages[0]?.id ?? null,
        selectedIds: [],
        textEdit: null,
        mathEdit: null,
        modal: null,
        saveStatus: 'saved',
        pasteCount: 0,
      }),
    closeProject: () =>
      set({
        projectId: null,
        projectName: '',
        history: createHistory(EMPTY_DOC),
        currentPageId: null,
        selectedIds: [],
        textEdit: null,
        mathEdit: null,
        modal: null,
      }),
    setProjectName: (name) => set({ projectName: name }),

    setTool: (tool) => {
      get().commitTextEdit();
      set({ tool, selectedIds: tool === 'select' ? get().selectedIds : [] });
    },
    setView: (view) => set({ view }),
    select: (ids) => set({ selectedIds: ids }),
    setModal: (modal) => {
      get().commitTextEdit();
      set({ modal });
    },
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setBusy: (busy) => set({ busy }),
    bumpRenderEpoch: () => set((s) => ({ renderEpoch: s.renderEpoch + 1 })),

    setCurrentPage: (id) => {
      get().commitTextEdit();
      set({ currentPageId: id, selectedIds: [] });
    },
    addPages: (pages) => {
      if (!pages.length) return;
      get().commitTextEdit();
      const s = get();
      const doc = { ...s.history.present, pages: [...s.history.present.pages, ...pages] };
      set({ ...withHistory(s, pushHistory(s.history, doc)), currentPageId: pages[0].id, selectedIds: [] });
    },
    removePage: (id) => {
      get().commitTextEdit();
      const s = get();
      const idx = s.history.present.pages.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const pages = s.history.present.pages.filter((p) => p.id !== id);
      const next = pages[Math.min(idx, pages.length - 1)]?.id ?? null;
      set({
        ...withHistory({ ...s, currentPageId: next }, pushHistory(s.history, { ...s.history.present, pages })),
        selectedIds: [],
      });
    },
    movePage: (id, delta) => {
      const s = get();
      const pages = [...s.history.present.pages];
      const i = pages.findIndex((p) => p.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= pages.length) return;
      [pages[i], pages[j]] = [pages[j], pages[i]];
      set(withHistory(s, pushHistory(s.history, { ...s.history.present, pages })));
    },

    addObject: (obj, opts) =>
      commitObjects((objs) => [...objs, obj], undefined, opts?.select ? { selectedIds: [obj.id] } : undefined),
    addObjects: (added) => {
      if (added.length) commitObjects((objs) => [...objs, ...added]);
    },
    updateObjects: (patches, key) =>
      commitObjects((objs) => {
        let changed = false;
        const next = objs.map((o) => {
          const p = patches[o.id];
          if (!p) return o;
          changed = true;
          return { ...o, ...p } as EditorObject;
        });
        return changed ? next : objs;
      }, key),
    deleteObjects: (ids, key) => {
      if (!ids.length) return;
      const set_ = new Set(ids);
      commitObjects(
        (objs) => {
          const next = objs.filter((o) => !set_.has(o.id));
          return next.length === objs.length ? objs : next;
        },
        key,
        { selectedIds: get().selectedIds.filter((id) => !set_.has(id)) },
      );
    },
    reorder: (ids, mode) => {
      const sel = new Set(ids);
      commitObjects((objs) => {
        const arr = [...objs];
        if (mode === 'front') return [...arr.filter((o) => !sel.has(o.id)), ...arr.filter((o) => sel.has(o.id))];
        if (mode === 'back') return [...arr.filter((o) => sel.has(o.id)), ...arr.filter((o) => !sel.has(o.id))];
        if (mode === 'forward') {
          for (let i = arr.length - 2; i >= 0; i--) {
            if (sel.has(arr[i].id) && !sel.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          }
        } else {
          for (let i = 1; i < arr.length; i++) {
            if (sel.has(arr[i].id) && !sel.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
          }
        }
        return arr.every((o, i) => o === objs[i]) ? objs : arr;
      });
    },
    duplicate: (ids) => {
      const page = currentPageOf(get());
      if (!page || !ids.length) return;
      const off = 16 * page.unit;
      const copies = page.objects.filter((o) => ids.includes(o.id)).map((o) => cloneWithNewId(o, off, off));
      commitObjects((objs) => [...objs, ...copies], undefined, { selectedIds: copies.map((c) => c.id) });
    },
    copy: (ids) => {
      const page = currentPageOf(get());
      if (!page) return;
      const objs = page.objects.filter((o) => ids.includes(o.id)).map((o) => structuredClone(o));
      if (objs.length) set({ clipboard: objs, pasteCount: 0 });
    },
    paste: () => {
      const s = get();
      const page = currentPageOf(s);
      if (!page || !s.clipboard.length) return;
      const n = s.pasteCount + 1;
      const off = 16 * page.unit * n;
      const copies = s.clipboard.map((o) => cloneWithNewId(o, off, off));
      commitObjects((objs) => [...objs, ...copies], undefined, {
        selectedIds: copies.map((c) => c.id),
        pasteCount: n,
        tool: 'select',
      });
    },

    undo: () => {
      get().commitTextEdit();
      const s = get();
      set(withHistory(s, undoHistory(s.history)));
    },
    redo: () => {
      get().commitTextEdit();
      const s = get();
      set(withHistory(s, redoHistory(s.history)));
    },

    startTextEdit: (obj, isNew) => {
      const s = get();
      const page = currentPageOf(s);
      if (!page) return;
      set({ textEdit: { obj, isNew, pageId: page.id }, selectedIds: [] });
    },
    updateTextDraft: (patch) => {
      const te = get().textEdit;
      if (!te) return;
      set({ textEdit: { ...te, obj: { ...te.obj, ...patch } } });
    },
    cancelTextEdit: () => set({ textEdit: null }),
    commitTextEdit: (opts) => {
      const s = get();
      const te = s.textEdit;
      if (!te) return;
      const text = te.obj.text.replace(/\s+$/u, '');
      const prev = s.history.present.pages.find((p) => p.id === te.pageId)?.objects.find((o) => o.id === te.obj.id);
      // 未入力の枠（「ダブルタップで入力」）は、空のまま閉じても枠として残す
      const keepEmpty = !te.isNew && !!prev && isEmptyText(prev);
      const keep = text !== '' || keepEmpty;
      set({
        textEdit: null,
        ...(opts?.select && keep && te.pageId === s.currentPageId ? { selectedIds: [te.obj.id], tool: 'select' as const } : {}),
      });
      const doc = mapPage(s.history.present, te.pageId, (p) => {
        if (te.isNew) {
          return text ? { ...p, objects: [...p.objects, { ...te.obj, text }] } : p;
        }
        const idx = p.objects.findIndex((o) => o.id === te.obj.id);
        if (idx < 0) return p;
        const objects = [...p.objects];
        if (!text && !keepEmpty) objects.splice(idx, 1);
        else {
          const prev = objects[idx];
          const next = { ...te.obj, text };
          if (JSON.stringify(prev) === JSON.stringify(next)) return p;
          objects[idx] = next;
        }
        return { ...p, objects };
      });
      if (doc !== s.history.present) set(withHistory(get(), pushHistory(get().history, doc)));
    },

    openMathEditor: (mathEdit) => {
      get().commitTextEdit();
      set({ mathEdit });
    },
    closeMathEditor: () => set({ mathEdit: null }),
  };
});

/** 現在の選択オブジェクト */
export function selectedObjects(s: Pick<EditorState, 'history' | 'currentPageId' | 'selectedIds'>): EditorObject[] {
  const page = currentPageOf(s);
  if (!page) return [];
  const ids = new Set(s.selectedIds);
  return page.objects.filter((o) => ids.has(o.id));
}
