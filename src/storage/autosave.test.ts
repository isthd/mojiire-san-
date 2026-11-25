import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveDocument = vi.fn();
vi.mock('./projectRepo', () => ({ saveDocument: (...a: unknown[]) => saveDocument(...a), updateProjectMeta: vi.fn() }));
vi.mock('../export/renderPage', () => ({ renderThumbnail: vi.fn() }));

type Listener = (s: State, prev: State) => void;
interface State {
  projectId: string | null;
  history: { past: unknown[]; present: unknown; future: unknown[] };
  saveStatus: string;
  setSaveStatus: (s: string) => void;
}
const listeners: Listener[] = [];
let state: State;
const setState = (patch: Partial<State>) => {
  const prev = state;
  state = { ...state, ...patch };
  for (const l of listeners) l(state, prev);
};
vi.mock('../store/editorStore', () => ({
  useEditor: {
    getState: () => state,
    subscribe: (l: Listener) => {
      listeners.push(l);
      return () => listeners.splice(listeners.indexOf(l), 1);
    },
  },
}));

const { flushSave, startAutosave } = await import('./autosave');

beforeEach(() => {
  state = {
    projectId: 'p1',
    history: { past: [], present: { pages: [] }, future: [] },
    saveStatus: 'idle',
    setSaveStatus: (s) => void (state.saveStatus = s),
  };
  saveDocument.mockReset();
});

describe('自動保存', () => {
  it('保存に失敗したら知らせ、次の保存で同じ内容をもう一度保存する', async () => {
    (globalThis as { document?: unknown }).document ??= { addEventListener() {}, removeEventListener() {} };
    (globalThis as { window?: unknown }).window ??= { addEventListener() {}, removeEventListener() {} };
    const stop = startAutosave();
    const doc = { pages: ['edited'] };
    setState({ history: { past: [], present: doc, future: [] } });

    saveDocument.mockRejectedValueOnce(new Error('QuotaExceeded'));
    await expect(flushSave()).rejects.toThrow('保存できませんでした');
    expect(state.saveStatus).toBe('error');

    saveDocument.mockResolvedValueOnce(undefined);
    await expect(flushSave()).resolves.toBeUndefined();
    expect(saveDocument).toHaveBeenCalledTimes(2);
    expect(saveDocument.mock.calls[1][1]).toBe(doc);
    expect(state.saveStatus).toBe('saved');
    stop();
  });
});
