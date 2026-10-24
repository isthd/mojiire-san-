// File System Access API（パソコンの Chrome / Edge でフォルダを直接読み書きする）の薄いラッパー。
// iPad の Safari などでは使えないので、呼び出し側は ZIP で代用する。
import { getKV, setKV } from './db';

type Mode = 'read' | 'readwrite';

export interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission?(d: { mode: Mode }): Promise<PermissionState>;
  requestPermission?(d: { mode: Mode }): Promise<PermissionState>;
}

type Picker = (opts?: { id?: string; mode?: Mode; startIn?: FileSystemHandle | string }) => Promise<DirHandle>;

function picker(): Picker | null {
  const w = window as unknown as { showDirectoryPicker?: Picker; claude?: unknown };
  if (typeof w.showDirectoryPicker !== 'function' || w.claude) return null;
  try {
    // 埋め込み表示（iframe）の中では使えない
    if (window.self !== window.top) return null;
  } catch {
    return null;
  }
  return w.showDirectoryPicker;
}

export function canPickDirectory(): boolean {
  return !!picker();
}

/** フォルダを選んでもらう。キャンセルなら null */
export async function pickDirectory(mode: Mode, startIn?: DirHandle | null): Promise<DirHandle | null> {
  const pick = picker();
  if (!pick) return null;
  try {
    return await pick({ id: mode === 'readwrite' ? 'mojiire-save' : 'mojiire-open', mode, ...(startIn ? { startIn } : {}) });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

/** 書き込みの許可を確認し、必要なら求める（ボタンを押した直後に呼ぶこと） */
export async function ensurePermission(h: DirHandle, mode: Mode): Promise<boolean> {
  try {
    if ((await h.queryPermission?.({ mode })) === 'granted') return true;
    return (await h.requestPermission?.({ mode })) === 'granted';
  } catch {
    return false;
  }
}

const SAVE_DIR_KEY = 'saveDir';

export async function getSavedDir(): Promise<DirHandle | null> {
  if (!canPickDirectory()) return null;
  try {
    return (await getKV<DirHandle>(SAVE_DIR_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function rememberSaveDir(h: DirHandle): Promise<void> {
  try {
    await setKV(SAVE_DIR_KEY, h);
  } catch {
    /* 保存できなくても毎回選べばよい */
  }
}

/** 既存のフォルダを返す。なければ null、同じ名前のファイルがあれば 'file' */
export async function tryGetDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null | 'file'> {
  try {
    return await parent.getDirectoryHandle(name);
  } catch (e) {
    return e instanceof DOMException && e.name === 'TypeMismatchError' ? 'file' : null;
  }
}

export async function writeFileAt(dir: FileSystemDirectoryHandle, path: string, data: Blob): Promise<void> {
  const parts = path.split('/').filter(Boolean);
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const fh = await d.getFileHandle(parts.at(-1)!, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

export async function readTextAt(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}

/** フォルダの中身をすべて読み、"選んだフォルダ名/…" のパスで返す */
export async function walkDirectory(dir: DirHandle, prefix = dir.name, out: { path: string; file: File }[] = []) {
  for await (const h of dir.values()) {
    const path = `${prefix}/${h.name}`;
    if (h.kind === 'directory') await walkDirectory(h as DirHandle, path, out);
    else out.push({ path, file: await (h as FileSystemFileHandle).getFile() });
  }
  return out;
}
