// 画像ファイル・PDF を読み込み、IndexedDB に保存してページを作成する。
import { uid } from '../lib/id';
import { pageUnit, type Page } from '../types/model';
import { loadImageElement } from './imageCache';
import { isPdfFile, renderPdfPages } from './pdfImport';
import { putImage } from './projectRepo';

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPT_ATTR = [...ACCEPTED_IMAGE_TYPES, 'application/pdf', '.pdf'].join(',');

/** 読み込める画像・PDF だけを取り出す */
export function pickImageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || isPdfFile(f));
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

export interface ImportProgress {
  message: string;
  progress: number;
}

export async function importImageFiles(
  projectId: string,
  files: File[],
  onProgress?: (p: ImportProgress) => void,
): Promise<{ pages: Page[]; failed: string[] }> {
  const pages: Page[] = [];
  const failed: string[] = [];
  const addPage = async (blob: Blob, width: number, height: number) => {
    const imageId = uid();
    await putImage({ id: imageId, projectId, blob, width, height });
    pages.push({ id: uid(), imageId, width, height, unit: pageUnit(width, height), objects: [] });
  };
  const count = files.length > 1 ? (i: number) => ` (${i + 1}/${files.length})` : () => '';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const label = file.name || `ファイル${i + 1}`;
    try {
      if (isPdfFile(file)) {
        onProgress?.({ message: `PDFを読み込み中…${count(i)}`, progress: i / files.length });
        await renderPdfPages(file, async (img, p, total) => {
          await addPage(img.blob, img.width, img.height);
          onProgress?.({
            message: `PDFを読み込み中…${count(i)} ${p + 1}/${total}ページ`,
            progress: (i + (p + 1) / total) / files.length,
          });
        });
      } else {
        onProgress?.({ message: `画像を読み込み中…${count(i)}`, progress: i / files.length });
        const { width, height } = await readSize(file);
        if (!width || !height) throw new Error('size');
        await addPage(file, width, height);
      }
    } catch (e) {
      console.error(e);
      const reason = isPdfFile(file) && e instanceof Error && e.message.includes('パスワード') ? '（パスワード付き）' : '';
      failed.push(label + reason);
    }
  }
  onProgress?.({ message: '読み込み完了', progress: 1 });
  return { pages, failed };
}
