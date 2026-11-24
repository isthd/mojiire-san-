import { describe, expect, it } from 'vitest';
import { pageImageIds, remapPageImages, type Page } from '../types/model';
import { fitPictureSize } from './pictureImport';

describe('fitPictureSize', () => {
  it('縦横比を保ってページの6割に収める', () => {
    expect(fitPictureSize(4000, 2000, 1000, 1000)).toEqual({ width: 600, height: 300 });
    expect(fitPictureSize(100, 200, 1000, 1000)).toEqual({ width: 300, height: 600 });
  });
});

describe('貼り付けた画像の ID', () => {
  const page: Page = {
    id: 'p',
    imageId: 'bg',
    width: 100,
    height: 100,
    unit: 0.1,
    objects: [
      { id: 'a', type: 'image', imageId: 'pic1', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 },
      { id: 'b', type: 'image', imageId: 'gone', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 },
      { id: 'c', type: 'pen', points: [0, 0, 1, 1], color: '#000', strokeWidth: 1, x: 0, y: 0, rotation: 0, opacity: 1 },
    ],
  };
  it('ページの画像と貼り付けた画像をすべて返す', () => {
    expect(pageImageIds(page)).toEqual(['bg', 'pic1', 'gone']);
  });
  it('付け替え：見つからない貼り付け画像は取り除く', () => {
    const map = new Map([
      ['bg', 'BG'],
      ['pic1', 'PIC'],
    ]);
    const out = remapPageImages(page, map, 'new')!;
    expect(out.id).toBe('new');
    expect(out.imageId).toBe('BG');
    expect(out.objects.map((o) => o.id)).toEqual(['a', 'c']);
    expect(out.objects[0]).toMatchObject({ imageId: 'PIC' });
  });
  it('ページの画像が見つからなければ null', () => {
    expect(remapPageImages(page, new Map(), 'x')).toBeNull();
  });
});
