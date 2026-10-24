// プロジェクトを「フォルダ」として保存・読み込みする。
//
// フォルダの中身：
//   <プロジェクト名>/
//     project.json          書き込みの内容（文字・数式・線など）
//     images/01.png …       元の画像（そのままの画質）
//     thumbnail.jpg         一覧用の小さな画像
//     README.txt            このフォルダの説明
//
// 保存先：
//   パソコンの Chrome / Edge … 選んだフォルダ（OneDrive・iCloud Drive の中など）へ直接書き込む
//   iPad / iPhone など       … フォルダをまとめた ZIP を作り、共有シートの「"ファイル"に保存」で iCloud Drive や OneDrive へ
import { renderThumbnail } from '../export/renderPage';
import {
  findProjects,
  FOLDER_FORMAT,
  imageExt,
  PROJECT_FILE,
  resolveInDir,
  safeDirName,
  uniqueName,
} from '../lib/folderLayout';
import { uid } from '../lib/id';
import { createZip, readZip, type ZipEntry } from '../lib/zip';
import type { ProjectDoc, ProjectMeta } from '../types/model';
import { importBackup } from './backup';
import { getDB } from './db';
import { findOrCreateFolder, listFolders } from './folderRepo';
import { readTextAt, tryGetDir, writeFileAt, type DirHandle } from './fsAccess';
import { getProjectImages, getProjectMeta, loadDocument } from './projectRepo';

interface FolderProjectFile {
  format: typeof FOLDER_FORMAT;
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  savedAt: number;
  images: { id: string; file: string; width: number; height: number }[];
  doc: ProjectDoc;
}

const README = `このフォルダは「文字入れさん」のプロジェクトです。

開き方：文字入れさんのホーム画面で「読み込む」→「フォルダを選ぶ」から、このフォルダ（または入っているフォルダ）を選んでください。
iPad / iPhone では、ファイルアプリでこのフォルダを長押し →「圧縮」で ZIP にしてから「ファイルを選ぶ」で読み込めます。

project.json と images フォルダの中身は編集・削除しないでください。
`;

export interface ProjectBundle {
  id: string;
  name: string;
  /** 1つ上にまとめるフォルダ名（アプリ内フォルダごと保存するとき）。なければ直下 */
  folderName: string | null;
  /** プロジェクトのフォルダ内でのパス → 中身 */
  files: { path: string; data: Blob }[];
}

export async function buildBundle(projectId: string, folderName: string | null): Promise<ProjectBundle> {
  const meta = await getProjectMeta(projectId);
  const doc = await loadDocument(projectId);
  if (!meta || !doc) throw new Error('プロジェクトが見つかりません');
  const stored = new Map((await getProjectImages(projectId)).map((i) => [i.id, i]));
  const files: ProjectBundle['files'] = [];
  const images: FolderProjectFile['images'] = [];
  const done = new Set<string>();
  let n = 0;
  for (const page of doc.pages) {
    const img = stored.get(page.imageId);
    if (!img || done.has(img.id)) continue;
    done.add(img.id);
    const file = `images/${String(++n).padStart(2, '0')}.${imageExt(img.blob.type)}`;
    images.push({ id: img.id, file, width: img.width, height: img.height });
    files.push({ path: file, data: img.blob });
  }
  const data: FolderProjectFile = {
    format: FOLDER_FORMAT,
    version: 1,
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    savedAt: Date.now(),
    images,
    doc,
  };
  files.unshift({ path: PROJECT_FILE, data: new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }) });
  if (meta.thumbnail) files.push({ path: 'thumbnail.jpg', data: meta.thumbnail });
  files.push({ path: 'README.txt', data: new Blob([README], { type: 'text/plain' }) });
  return { id: meta.id, name: meta.name, folderName, files };
}

export interface SaveTarget {
  projectIds: string[];
  /** アプリ内フォルダごと保存するときのフォルダ名 */
  folderName?: string | null;
  /** ZIP のファイル名などに使う表示名 */
  label: string;
}

/** 保存する内容を組み立てる。複数のプロジェクトはアプリ内のフォルダ分けのまま保存する */
export async function buildBundles(target: SaveTarget, onProgress?: (done: number, total: number) => void) {
  const folderNames = new Map((await listFolders()).map((f) => [f.id, f.name]));
  const multi = target.projectIds.length > 1;
  const out: ProjectBundle[] = [];
  for (let i = 0; i < target.projectIds.length; i++) {
    onProgress?.(i, target.projectIds.length);
    const id = target.projectIds[i];
    let folderName = target.folderName ?? null;
    if (folderName == null && multi) {
      const meta = await getProjectMeta(id);
      folderName = (meta?.folderId && folderNames.get(meta.folderId)) || null;
    }
    out.push(await buildBundle(id, folderName));
  }
  onProgress?.(target.projectIds.length, target.projectIds.length);
  return out;
}

/** ZIP にまとめる（展開するとフォルダになる） */
export async function bundlesToZip(bundles: ProjectBundle[]): Promise<Blob> {
  const taken = new Map<string, Set<string>>();
  const entries: ZipEntry[] = [];
  for (const b of bundles) {
    const parent = b.folderName ? safeDirName(b.folderName, 'フォルダ') : '';
    const set = taken.get(parent) ?? new Set();
    taken.set(parent, set);
    const dir = uniqueName(safeDirName(b.name), set);
    set.add(dir);
    for (const f of b.files) entries.push({ path: [parent, dir, f.path].filter(Boolean).join('/'), data: f.data });
  }
  return createZip(entries);
}

/**
 * 選んだフォルダへ直接書き込む。
 * 同じプロジェクトを前に保存したフォルダがあれば上書きし、別のプロジェクトと名前が重なるときは「名前 (2)」にする。
 * 書き込んだプロジェクトのフォルダ名を返す。
 */
export async function writeBundles(
  root: DirHandle,
  bundles: ProjectBundle[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const written: string[] = [];
  const used = new Map<string, Set<string>>();
  for (let i = 0; i < bundles.length; i++) {
    onProgress?.(i, bundles.length);
    const b = bundles[i];
    const parentName = b.folderName ? safeDirName(b.folderName, 'フォルダ') : '';
    const parent = parentName ? await root.getDirectoryHandle(parentName, { create: true }) : root;
    const set = used.get(parentName) ?? new Set();
    used.set(parentName, set);

    const base = safeDirName(b.name);
    let name = base;
    let dir: FileSystemDirectoryHandle | null = null;
    for (let n = 2; ; n++) {
      if (!set.has(name)) {
        const existing = await tryGetDir(parent, name);
        if (!existing) {
          dir = await parent.getDirectoryHandle(name, { create: true });
          break;
        }
        if (existing === 'file') {
          name = `${base} (${n})`;
          continue;
        }
        const text = await readTextAt(existing, PROJECT_FILE);
        let sameProject = false;
        try {
          sameProject = !!text && JSON.parse(text)?.id === b.id;
        } catch {
          /* 読めなければ別のもの扱い */
        }
        if (sameProject) {
          // 前回保存した画像を消してから書き直す（ページを削除した場合に古い画像が残らないように）
          await existing.removeEntry('images', { recursive: true }).catch(() => undefined);
          dir = existing;
          break;
        }
      }
      name = `${base} (${n})`;
    }
    set.add(name);
    for (const f of b.files) await writeFileAt(dir, f.path, f.data);
    written.push(parentName ? `${parentName}/${name}` : name);
  }
  onProgress?.(bundles.length, bundles.length);
  return written;
}

// ---- 読み込み ----

export interface InputFile {
  /** "フォルダ/…/ファイル名" の形 */
  path: string;
  data: Blob;
}

export interface ImportResult {
  imported: ProjectMeta[];
  errors: string[];
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

async function expandZips(files: InputFile[]): Promise<{ files: InputFile[]; errors: string[] }> {
  const out: InputFile[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (!/\.zip$/i.test(f.path)) {
      out.push(f);
      continue;
    }
    try {
      const dir = dirOf(f.path);
      for (const e of await readZip(f.data)) out.push({ path: dir ? `${dir}/${e.path}` : e.path, data: e.data });
    } catch (e) {
      errors.push(`${f.path.split('/').at(-1)}：${e instanceof Error ? e.message : '読み込めませんでした'}`);
    }
  }
  return { files: out, errors };
}

async function importOne(
  data: FolderProjectFile,
  dir: string,
  files: Map<string, Blob>,
  folderId: string | null,
): Promise<ProjectMeta> {
  const db = await getDB();
  const id = data.id && !(await db.get('projects', data.id)) ? data.id : uid();
  const idMap = new Map<string, string>();
  const images: { id: string; blob: Blob; width: number; height: number }[] = [];
  for (const img of data.images ?? []) {
    const blob = resolveInDir(files, dir, img.file);
    if (!blob) continue;
    const nid = uid();
    idMap.set(img.id, nid);
    const type = img.file.endsWith('.jpg') ? 'image/jpeg' : img.file.endsWith('.webp') ? 'image/webp' : 'image/png';
    images.push({ id: nid, blob: blob.type ? blob : new Blob([blob], { type }), width: img.width, height: img.height });
  }
  const doc: ProjectDoc = {
    pages: data.doc.pages
      .filter((p) => idMap.has(p.imageId))
      .map((p) => ({ ...p, id: uid(), imageId: idMap.get(p.imageId)! })),
  };
  if (data.doc.pages.length && !doc.pages.length) throw new Error('画像が見つかりません');

  let thumbnail: Blob | null = resolveInDir(files, dir, 'thumbnail.jpg') ?? null;
  if (thumbnail && !thumbnail.type) thumbnail = new Blob([thumbnail], { type: 'image/jpeg' });
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    name: data.name || '読み込んだプロジェクト',
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    pageCount: doc.pages.length,
    thumbnail,
    folderId,
  };
  const tx = db.transaction(['projects', 'documents', 'images'], 'readwrite');
  for (const img of images) await tx.objectStore('images').put({ ...img, projectId: id });
  await tx.objectStore('documents').put({ projectId: id, version: 1, doc });
  await tx.objectStore('projects').put(meta);
  await tx.done;

  if (!thumbnail && doc.pages[0]) {
    try {
      meta.thumbnail = await renderThumbnail(doc.pages[0]);
      await db.put('projects', meta);
    } catch {
      /* 開いたときにも作成される */
    }
  }
  return meta;
}

/**
 * 選ばれたファイル（フォルダの中身・ZIP・バックアップ）を読み込む。
 * プロジェクトのフォルダが別のフォルダに入っていれば、同じ名前のアプリ内フォルダに入れる。
 * それ以外は fallbackFolderId（いま開いているフォルダ）に入れる。
 */
export async function importFiles(
  input: InputFile[],
  fallbackFolderId: string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const { files: list, errors } = await expandZips(input.map((f) => ({ ...f, path: f.path.replace(/^\/+/, '') })));
  const files = new Map(list.map((f) => [f.path, f.data]));
  const found = findProjects([...files.keys()]);
  const backups = list.filter(
    (f) => /\.json$/i.test(f.path) && f.path.split('/').at(-1) !== PROJECT_FILE && !f.path.startsWith('__MACOSX/'),
  );
  const total = found.length + backups.length;
  const imported: ProjectMeta[] = [];
  const folderIds = new Map<string, string>();
  const folderFor = async (name: string | null) => {
    if (!name) return fallbackFolderId;
    if (!folderIds.has(name)) folderIds.set(name, (await findOrCreateFolder(name)).id);
    return folderIds.get(name)!;
  };

  let done = 0;
  for (const p of found) {
    onProgress?.(done++, total);
    const label = p.dir.split('/').at(-1) || PROJECT_FILE;
    try {
      const data = JSON.parse(await files.get(p.dir ? `${p.dir}/${PROJECT_FILE}` : PROJECT_FILE)!.text()) as FolderProjectFile;
      if (data?.format !== FOLDER_FORMAT || !Array.isArray(data.doc?.pages)) throw new Error('文字入れさんのフォルダではありません');
      imported.push(await importOne(data, p.dir, files, await folderFor(p.parentName)));
    } catch (e) {
      errors.push(`${label}：${e instanceof Error ? e.message : '読み込めませんでした'}`);
    }
  }
  for (const b of backups) {
    onProgress?.(done++, total);
    const name = b.path.split('/').at(-1)!;
    try {
      const meta = await importBackup(new File([b.data], name, { type: 'application/json' }));
      const folderId = await folderFor(dirOf(b.path).split('/').filter(Boolean).at(-1) ?? null);
      if (folderId) {
        meta.folderId = folderId;
        await (await getDB()).put('projects', meta);
      }
      imported.push(meta);
    } catch (e) {
      // フォルダ内のほかの JSON は黙って無視し、直接選ばれたものだけ知らせる
      if (input.length === 1) errors.push(`${name}：${e instanceof Error ? e.message : '読み込めませんでした'}`);
    }
  }
  onProgress?.(total, total);
  if (!total && !errors.length) errors.push('文字入れさんのプロジェクトが見つかりませんでした');
  return { imported, errors };
}
