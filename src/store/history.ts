// 状態履歴によるUndo/Redo。スナップショットは不変データなので構造共有されメモリ効率が良い。

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  /** 連続操作（スライダー・ハンドルのドラッグ等）をまとめるためのキー */
  lastKey: string | null;
  lastTime: number;
}

export const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

export function createHistory<T>(present: T, saved?: { past: T[]; future: T[] }): HistoryState<T> {
  return {
    past: saved?.past.slice(-HISTORY_LIMIT) ?? [],
    present,
    future: saved?.future.slice(0, HISTORY_LIMIT) ?? [],
    lastKey: null,
    lastTime: 0,
  };
}

export function pushHistory<T>(h: HistoryState<T>, next: T, key: string | null = null, now = Date.now()): HistoryState<T> {
  if (next === h.present) return h;
  const coalesce = key !== null && key === h.lastKey && now - h.lastTime < COALESCE_MS;
  if (coalesce) {
    return { ...h, present: next, future: [], lastTime: now };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastTime: now };
}

export function undoHistory<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], lastKey: null, lastTime: 0 };
}

export function redoHistory<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest, lastKey: null, lastTime: 0 };
}
