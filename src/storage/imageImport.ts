// 画像ファイルを読み込み、IndexedDB に保存してページを作成する。
import { uid } from '../lib/id';
import { pageUnit, type Page } from '../types/model';
import { loadImageElement } from './imageCache';
import { putImage } from './projectRepo';

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(',');

export function pickImageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}

async function readSize(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(url);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importImageFiles(
  projectId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: Page[]; failed: string[] }> {
  const pages: Page[] = [];
  const failed: string[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    const file = files[i];
    try {
      const { width, height } = await readSize(file);
      if (!width || !height) throw new Error('size');
      const imageId = uid();
      await putImage({ id: imageId, projectId, blob: file, width, height });
      pages.push({ id: uid(), imageId, width, height, unit: pageUnit(width, height), objects: [] });
    } catch {
      failed.push(file.name || `画像${i + 1}`);
    }
  }
  onProgress?.(files.length, files.length);
  return { pages, failed };
}
