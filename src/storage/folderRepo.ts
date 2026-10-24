// アプリ内フォルダ（プロジェクトの整理用）の CRUD。
import { uid } from '../lib/id';
import type { Folder } from '../types/model';
import { getDB } from './db';

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

export function sortFolders(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) => collator.compare(a.name, b.name));
}

export async function listFolders(): Promise<Folder[]> {
  return sortFolders(await (await getDB()).getAll('folders'));
}

export async function createFolder(name: string): Promise<Folder> {
  const folder: Folder = { id: uid(), name: name.trim() || '新しいフォルダ', createdAt: Date.now() };
  await (await getDB()).put('folders', folder);
  return folder;
}

/** 同じ名前のフォルダがあればそれを、なければ新しく作って返す */
export async function findOrCreateFolder(name: string): Promise<Folder> {
  const key = name.trim();
  const found = (await listFolders()).find((f) => f.name === key);
  return found ?? createFolder(key);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await getDB();
  const f = await db.get('folders', id);
  if (f) await db.put('folders', { ...f, name: name.trim() || f.name });
}

/** フォルダを削除。中のプロジェクトは消さずに「未分類」へ戻す */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['folders', 'projects'], 'readwrite');
  await tx.objectStore('folders').delete(id);
  const store = tx.objectStore('projects');
  for (const p of await store.getAll()) {
    if (p.folderId === id) await store.put({ ...p, folderId: null });
  }
  await tx.done;
}

/** プロジェクトをフォルダへ移動（null で未分類）。更新日時は変えない */
export async function moveProjects(ids: string[], folderId: string | null): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('projects', 'readwrite');
  for (const id of ids) {
    const p = await tx.store.get(id);
    if (p) await tx.store.put({ ...p, folderId });
  }
  await tx.done;
}
