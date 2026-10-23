// IndexedDB スキーマ。画像は Blob のまま保存し、アプリ状態には ID のみを持たせる。
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProjectDoc, ProjectMeta } from '../types/model';

export interface StoredImage {
  id: string;
  projectId: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface StoredDocument {
  projectId: string;
  version: 1;
  doc: ProjectDoc;
  /** 元に戻す／やり直すの履歴（再読み込み後も使えるように保存。1つの値として保存するので共有部分は重複しない） */
  history?: SavedHistory;
}

export interface SavedHistory {
  past: ProjectDoc[];
  future: ProjectDoc[];
}

interface MojiireDB extends DBSchema {
  projects: { key: string; value: ProjectMeta; indexes: { updatedAt: number } };
  documents: { key: string; value: StoredDocument };
  images: { key: string; value: StoredImage; indexes: { projectId: string } };
}

let dbPromise: Promise<IDBPDatabase<MojiireDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MojiireDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MojiireDB>('mojiire-san', 1, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('documents', { keyPath: 'projectId' });
        const images = db.createObjectStore('images', { keyPath: 'id' });
        images.createIndex('projectId', 'projectId');
      },
    });
  }
  return dbPromise;
}

/** ストレージの永続化を要求（Safari等で自動削除されにくくする） */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* 非対応環境では無視 */
  }
}
