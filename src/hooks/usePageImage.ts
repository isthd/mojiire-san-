import { useEffect, useState } from 'react';
import { getLoadedImage, loadPageImage } from '../storage/imageCache';

/** ページ画像（IndexedDB の Blob）を読み込んで返す */
export function usePageImage(imageId: string | undefined): { image: HTMLImageElement | null; error: boolean } {
  const [state, setState] = useState<{ id?: string; image: HTMLImageElement | null; error: boolean }>(() => ({
    id: imageId,
    image: imageId ? getLoadedImage(imageId) : null,
    error: false,
  }));

  useEffect(() => {
    if (!imageId) return;
    let alive = true;
    const loaded = getLoadedImage(imageId);
    if (loaded) {
      setState({ id: imageId, image: loaded, error: false });
      return;
    }
    setState({ id: imageId, image: null, error: false });
    loadPageImage(imageId)
      .then((img) => alive && setState({ id: imageId, image: img, error: false }))
      .catch(() => alive && setState({ id: imageId, image: null, error: true }));
    return () => {
      alive = false;
    };
  }, [imageId]);

  return state.id === imageId ? state : { image: null, error: false };
}
