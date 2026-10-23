// プロジェクトのバックアップ（画像を含む単一 JSON ファイル）の書き出し・読み込み。
import { renderThumbnail } from '../export/renderPage';
import { uid } from '../lib/id';
import type { ProjectDoc, ProjectMeta } from '../types/model';
import { getDB } from './db';
import { createProject, getProjectImages, getProjectMeta, loadDocument, putImage } from './projectRepo';

const FORMAT = 'mojiire-san-project';

interface BackupImage {
  id: string;
  width: number;
  height: number;
  /** data URL */
  data: string;
}

interface BackupFile {
  format: typeof FORMAT;
  version: 1;
  name: string;
  createdAt: number;
  exportedAt: number;
  doc: ProjectDoc;
  images: BackupImage[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportBackup(projectId: string): Promise<File> {
  const meta = await getProjectMeta(projectId);
  const doc = await loadDocument(projectId);
  if (!meta || !doc) throw new Error('プロジェクトが見つかりません');
  const used = new Set(doc.pages.map((p) => p.imageId));
  const images: BackupImage[] = [];
  for (const img of await getProjectImages(projectId)) {
    if (!used.has(img.id)) continue;
    images.push({ id: img.id, width: img.width, height: img.height, data: await blobToDataUrl(img.blob) });
  }
  const file: BackupFile = {
    format: FORMAT,
    version: 1,
    name: meta.name,
    createdAt: meta.createdAt,
    exportedAt: Date.now(),
    doc,
    images,
  };
  const name = meta.name.replace(/[\\/:*?"<>|]/g, '_') || 'project';
  return new File([JSON.stringify(file)], `${name}.mojiire.json`, { type: 'application/json' });
}

export async function importBackup(file: File): Promise<ProjectMeta> {
  let data: BackupFile;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('ファイルを読み取れませんでした');
  }
  if (data?.format !== FORMAT || !Array.isArray(data.doc?.pages) || !Array.isArray(data.images)) {
    throw new Error('文字入れさんのバックアップファイルではありません');
  }
  const meta = await createProject(data.name || '読み込んだプロジェクト');
  const idMap = new Map<string, string>();
  for (const img of data.images) {
    const blob = await (await fetch(img.data)).blob();
    const id = uid();
    idMap.set(img.id, id);
    await putImage({ id, projectId: meta.id, blob, width: img.width, height: img.height });
  }
  const doc: ProjectDoc = {
    pages: data.doc.pages
      .filter((p) => idMap.has(p.imageId))
      .map((p) => ({ ...p, id: uid(), imageId: idMap.get(p.imageId)! })),
  };
  const db = await getDB();
  await db.put('documents', { projectId: meta.id, version: 1, doc });
  let thumbnail: Blob | null = null;
  if (doc.pages[0]) {
    try {
      thumbnail = await renderThumbnail(doc.pages[0]);
    } catch {
      /* サムネイルは開いたときにも作成される */
    }
  }
  const updated = { ...meta, pageCount: doc.pages.length, createdAt: data.createdAt || meta.createdAt, thumbnail };
  await db.put('projects', updated);
  return updated;
}
