// プロジェクトの CRUD。
import { uid } from '../lib/id';
import type { Page, ProjectDoc, ProjectMeta } from '../types/model';
import { getDB, type SavedHistory, type StoredDocument, type StoredImage } from './db';

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await getDB();
  const all = await db.getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProjectMeta(id: string): Promise<ProjectMeta | undefined> {
  return (await getDB()).get('projects', id);
}

export async function createProject(name: string, doc: ProjectDoc = { pages: [] }): Promise<ProjectMeta> {
  const db = await getDB();
  const now = Date.now();
  const meta: ProjectMeta = { id: uid(), name, createdAt: now, updatedAt: now, pageCount: doc.pages.length, thumbnail: null };
  const tx = db.transaction(['projects', 'documents'], 'readwrite');
  await tx.objectStore('projects').put(meta);
  await tx.objectStore('documents').put({ projectId: meta.id, version: 1, doc });
  await tx.done;
  return meta;
}

export async function loadDocument(projectId: string): Promise<ProjectDoc | null> {
  return (await loadStoredDocument(projectId))?.doc ?? null;
}

/** ドキュメントと元に戻す履歴をまとめて読み込む */
export async function loadStoredDocument(projectId: string): Promise<StoredDocument | null> {
  return (await (await getDB()).get('documents', projectId)) ?? null;
}

export async function saveDocument(projectId: string, doc: ProjectDoc, history?: SavedHistory): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'documents'], 'readwrite');
  const meta = await tx.objectStore('projects').get(projectId);
  if (!meta) {
    tx.abort();
    return;
  }
  await tx.objectStore('documents').put({ projectId, version: 1, doc, ...(history ? { history } : {}) });
  await tx.objectStore('projects').put({ ...meta, updatedAt: Date.now(), pageCount: doc.pages.length });
  await tx.done;
}

export async function updateProjectMeta(id: string, patch: Partial<Omit<ProjectMeta, 'id'>>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('projects', 'readwrite');
  const meta = await tx.store.get(id);
  if (meta) await tx.store.put({ ...meta, ...patch });
  await tx.done;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'documents', 'images'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  await tx.objectStore('documents').delete(id);
  const imgStore = tx.objectStore('images');
  let cursor = await imgStore.index('projectId').openKeyCursor(id);
  while (cursor) {
    await imgStore.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function duplicateProject(id: string, newName: string): Promise<ProjectMeta | null> {
  const db = await getDB();
  const meta = await db.get('projects', id);
  const stored = await db.get('documents', id);
  if (!meta || !stored) return null;
  const images = await db.getAllFromIndex('images', 'projectId', id);
  const newId = uid();
  const idMap = new Map<string, string>();
  const tx = db.transaction(['projects', 'documents', 'images'], 'readwrite');
  for (const img of images) {
    const nid = uid();
    idMap.set(img.id, nid);
    await tx.objectStore('images').put({ ...img, id: nid, projectId: newId });
  }
  const doc: ProjectDoc = {
    pages: stored.doc.pages.map((p) => ({ ...p, id: uid(), imageId: idMap.get(p.imageId) ?? p.imageId })),
  };
  const now = Date.now();
  const newMeta: ProjectMeta = { ...meta, id: newId, name: newName, createdAt: now, updatedAt: now };
  await tx.objectStore('projects').put(newMeta);
  await tx.objectStore('documents').put({ projectId: newId, version: 1, doc });
  await tx.done;
  return newMeta;
}

export async function putImage(img: StoredImage): Promise<void> {
  await (await getDB()).put('images', img);
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return (await getDB()).get('images', id);
}

export async function getProjectImages(projectId: string): Promise<StoredImage[]> {
  return (await getDB()).getAllFromIndex('images', 'projectId', projectId);
}

/** どのページ（元に戻す履歴内のページも含む）からも参照されていない画像を削除（プロジェクトを開いた時点で実行） */
export async function collectUnusedImages(projectId: string, pages: Page[]): Promise<void> {
  const used = new Set(pages.map((p) => p.imageId));
  const db = await getDB();
  const tx = db.transaction('images', 'readwrite');
  let cursor = await tx.store.index('projectId').openKeyCursor(projectId);
  while (cursor) {
    if (!used.has(cursor.primaryKey)) await tx.store.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
}
