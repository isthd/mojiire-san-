// 貼り付ける画像（写真・イラスト）を読み込んで IndexedDB に保存する。
// 大きすぎる写真は長い辺を MAX_SIDE までに縮めて保存する（書き出しの画質は十分に保ちつつ、容量を抑える）。
import { uid } from '../lib/id';
import { loadImageElement } from './imageCache';
import { putImage } from './projectRepo';

const MAX_SIDE = 2400;

/** ページに置く画像の大きさ（縦横比を保って、ページの fraction の範囲に収まる大きさ） */
export function fitPictureSize(
  w: number,
  h: number,
  pageW: number,
  pageH: number,
  fraction = 0.6,
): { width: number; height: number } {
  const k = Math.min((pageW * fraction) / w, (pageH * fraction) / h);
  return { width: w * k, height: h * k };
}

export interface StoredPicture {
  imageId: string;
  width: number;
  height: number;
}

export async function importPicture(projectId: string, file: Blob): Promise<StoredPicture> {
  const url = URL.createObjectURL(file);
  let blob: Blob = file;
  let width: number;
  let height: number;
  try {
    const img = await loadImageElement(url);
    width = img.naturalWidth;
    height = img.naturalHeight;
    if (!width || !height) throw new Error('画像の大きさを読み取れませんでした');
    const k = MAX_SIDE / Math.max(width, height);
    // GIF・SVG などはそのままでは保存しにくいので、PNG に描き直す
    const plain = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
    if (k < 1 || !plain) {
      const s = Math.min(1, k);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * s));
      canvas.height = Math.max(1, Math.round(height * s));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // 写真（JPEG）はそのまま JPEG、透明な部分がありうるもの（PNG・WebP など）は PNG
      const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.92));
      canvas.width = canvas.height = 0;
      if (!out) throw new Error('toBlob');
      blob = out;
      width = Math.round(width * s);
      height = Math.round(height * s);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  const imageId = uid();
  await putImage({ id: imageId, projectId, blob, width, height });
  return { imageId, width, height };
}
