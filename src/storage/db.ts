// IndexedDB スキーマ。画像は Blob のまま保存し、アプリ状態には ID のみを持たせる。
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Folder, ProjectDoc, ProjectMeta } from '../types/model';

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
  folders: { key: string; value: Folder };
  /** 小さな設定値（保存先フォルダのハンドルなど、localStorage に入らないもの） */
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<MojiireDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MojiireDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MojiireDB>('mojiire-san', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' });
          projects.createIndex('updatedAt', 'updatedAt');
          db.createObjectStore('documents', { keyPath: 'projectId' });
          const images = db.createObjectStore('images', { keyPath: 'id' });
          images.createIndex('projectId', 'projectId');
        }
        if (oldVersion < 2) {
          db.createObjectStore('folders', { keyPath: 'id' });
          db.createObjectStore('kv');
        }
      },
      // 別のタブが新しい版を開こうとしたら接続を閉じて譲る（古いタブは再読み込みで新しい版になる）
      blocking() {
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
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

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await (await getDB()).get('kv', key)) as T | undefined;
}

export async function setKV(key: string, value: unknown): Promise<void> {
  await (await getDB()).put('kv', value, key);
}
