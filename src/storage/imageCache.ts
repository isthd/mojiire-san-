// IndexedDB 上の画像 Blob を HTMLImageElement として読み込み・キャッシュする。
import { getImage } from './projectRepo';

interface Entry {
  url: string;
  promise: Promise<HTMLImageElement>;
  img: HTMLImageElement | null;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = url;
  });
}

export function loadPageImage(imageId: string): Promise<HTMLImageElement> {
  const hit = cache.get(imageId);
  if (hit) return hit.promise;
  const entry: Entry = { url: '', img: null, promise: Promise.resolve(null as unknown as HTMLImageElement) };
  entry.promise = (async () => {
    const stored = await getImage(imageId);
    if (!stored) throw new Error('画像データが見つかりません');
    entry.url = URL.createObjectURL(stored.blob);
    const img = await loadImageElement(entry.url);
    entry.img = img;
    listeners.forEach((l) => l());
    return img;
  })();
  entry.promise.catch(() => cache.delete(imageId));
  cache.set(imageId, entry);
  return entry.promise;
}

/** 読み込み済みなら同期で返す */
export function getLoadedImage(imageId: string): HTMLImageElement | null {
  return cache.get(imageId)?.img ?? null;
}

export function getImageUrl(imageId: string): string | null {
  return cache.get(imageId)?.url || null;
}

export function subscribeImages(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** プロジェクトを閉じたときにメモリを解放 */
export function clearImageCache(): void {
  for (const e of cache.values()) if (e.url) URL.revokeObjectURL(e.url);
  cache.clear();
}
