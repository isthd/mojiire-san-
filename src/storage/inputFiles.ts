// 読み込むファイルを「パス付きの一覧」にそろえる（フォルダ選択・ファイル選択・ドラッグ＆ドロップ）。
import { walkDirectory, type DirHandle } from './fsAccess';
import type { InputFile } from './projectFolder';

export async function fromDirectory(dir: DirHandle): Promise<InputFile[]> {
  return (await walkDirectory(dir)).map((f) => ({ path: f.path, data: f.file }));
}

export function fromFileList(list: FileList | File[] | null | undefined): InputFile[] {
  return Array.from(list ?? []).map((f) => ({ path: f.webkitRelativePath || f.name, data: f }));
}

interface Entry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?(ok: (f: File) => void, ng: (e: unknown) => void): void;
  createReader?(): { readEntries(ok: (e: Entry[]) => void, ng: (e: unknown) => void): void };
}

async function walkEntry(entry: Entry, out: InputFile[]): Promise<void> {
  const path = entry.fullPath.replace(/^\/+/, '') || entry.name;
  if (entry.isFile && entry.file) {
    out.push({ path, data: await new Promise<File>((ok, ng) => entry.file!(ok, ng)) });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries は一度に最大100件ほどしか返さないので、空になるまで繰り返す
    for (;;) {
      const batch = await new Promise<Entry[]>((ok, ng) => reader.readEntries(ok, ng));
      if (!batch.length) break;
      for (const e of batch) await walkEntry(e, out);
    }
  }
}

/** ドロップされたもの（フォルダを含む）。フォルダが含まれていなければ null */
export async function fromDrop(dt: DataTransfer): Promise<InputFile[] | null> {
  const entries = Array.from(dt.items)
    .map((i) => (i as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ?? null)
    .filter((e): e is Entry => e !== null);
  if (!entries.some((e) => e.isDirectory)) return null;
  const out: InputFile[] = [];
  for (const e of entries) await walkEntry(e, out);
  return out;
}

/** フォルダ選択の <input webkitdirectory> が使えるか（iPad / iPhone では使えない） */
export function supportsDirectoryInput(): boolean {
  const ios = /iP(ad|hone|od)/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
  return !ios && 'webkitdirectory' in document.createElement('input');
}
