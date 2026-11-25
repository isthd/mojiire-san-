// 編集内容の自動保存。変更から短時間待って IndexedDB へ保存し、サムネイルも更新する。
import { renderThumbnail } from '../export/renderPage';
import { useEditor } from '../store/editorStore';
import type { ProjectDoc } from '../types/model';
import type { SavedHistory } from './db';
import { saveDocument, updateProjectMeta } from './projectRepo';

const SAVE_DELAY = 800;
const THUMB_DELAY = 2500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let thumbTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { projectId: string; doc: ProjectDoc; history: SavedHistory } | null = null;
let saving: Promise<void> = Promise.resolve();

async function doSave(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const job = pending;
  pending = null;
  if (!job) return;
  const { setSaveStatus } = useEditor.getState();
  try {
    await saveDocument(job.projectId, job.doc, job.history);
    if (!pending) setSaveStatus('saved');
  } catch (e) {
    console.error(e);
    // 保存できなかった内容は捨てずに残し、次の保存（Ctrl+S・画面を閉じたときなど）でもう一度試す。
    // その間に新しい編集があれば、そちらの方が新しいので上書きしない。
    if (!pending) pending = job;
    setSaveStatus('error');
    throw new Error('編集内容を保存できませんでした');
  }
}

/** 1ページ目からサムネイルを作成して保存 */
export async function updateThumbnail(projectId: string, doc: ProjectDoc): Promise<void> {
  return doThumbnail(projectId, doc);
}

async function doThumbnail(projectId: string, doc: ProjectDoc): Promise<void> {
  const first = doc.pages[0];
  try {
    const thumbnail = first ? await renderThumbnail(first) : null;
    await updateProjectMeta(projectId, { thumbnail });
  } catch (e) {
    console.warn('thumbnail failed', e);
  }
}

/** 保留中の変更を直ちに保存する。保存に失敗したときは reject する */
export function flushSave(): Promise<void> {
  // 前の保存が失敗していても、続けて次の保存を行えるようにする
  const job = saving.catch(() => undefined).then(doSave);
  saving = job;
  return job;
}

/** 結果を待たない保存（失敗は画面上部の「保存に失敗」表示で知らせる） */
function flushSaveQuietly(): Promise<void> {
  return flushSave().catch(() => undefined);
}

export function startAutosave(): () => void {
  const unsub = useEditor.subscribe((s, prev) => {
    if (!s.projectId || s.history.present === prev.history.present || s.projectId !== prev.projectId) return;
    const projectId = s.projectId;
    const doc = s.history.present;
    pending = { projectId, doc, history: { past: s.history.past, future: s.history.future } };
    s.setSaveStatus('saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushSaveQuietly(), SAVE_DELAY);
    if (thumbTimer) clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => void doThumbnail(projectId, useEditor.getState().history.present), THUMB_DELAY);
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSaveQuietly();
  };
  const onPageHide = () => void flushSaveQuietly();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    const jobs: Promise<void>[] = [flushSaveQuietly()];
    if (thumbTimer) {
      clearTimeout(thumbTimer);
      thumbTimer = null;
      const s = useEditor.getState();
      if (s.projectId) jobs.push(doThumbnail(s.projectId, s.history.present));
    }
    closing = Promise.all(jobs).then(() => undefined);
  };
}

let closing: Promise<void> = Promise.resolve();

/** 編集画面を閉じたときの保存・サムネイル作成の完了を待つ（ホーム画面の一覧を最新にするため） */
export function whenClosed(): Promise<void> {
  return closing;
}
