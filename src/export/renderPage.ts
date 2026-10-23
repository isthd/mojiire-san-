// ページを元画像の解像度（または倍率指定）で Canvas に描画する。
// 画像・数式・フォントの読み込み完了を待ってから描画するため、出力で欠けることがない。
import Konva from 'konva';
import { buildNode, describeObject, fontStyleOf } from '../canvas/describe';
import { getMathImage, type MathImage } from '../math/mathRenderer';
import { loadPageImage } from '../storage/imageCache';
import { fontCss, type Page } from '../types/model';

/** iOS Safari の Canvas 上限（約1677万画素）を考慮 */
function maxPixels(): number {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return isIOS ? 16_000_000 : 64_000_000;
}

/** 実際に使用できる倍率（端末の制限で下がる場合あり） */
export function effectiveScale(page: Pick<Page, 'width' | 'height'>, scale: number): number {
  const limit = Math.sqrt(maxPixels() / (page.width * page.height));
  return Math.min(scale, limit);
}

async function ensureFonts(page: Page): Promise<void> {
  if (!document.fonts) return;
  const loads: Promise<unknown>[] = [];
  for (const o of page.objects) {
    if (o.type !== 'text') continue;
    loads.push(document.fonts.load(`${fontStyleOf(o)} ${Math.round(o.fontSize)}px ${fontCss(o.fontFamily)}`, o.text));
  }
  await Promise.allSettled(loads);
  await document.fonts.ready;
}

export async function renderPageToCanvas(
  page: Page,
  scale: number,
  opts: { background?: string } = {},
): Promise<HTMLCanvasElement> {
  const [image, mathImages] = await Promise.all([
    loadPageImage(page.imageId),
    Promise.all(
      page.objects.map((o) =>
        o.type === 'math' ? getMathImage(o.latex, o.fontSize, o.color).catch(() => null) : Promise.resolve(null),
      ),
    ),
    ensureFonts(page),
  ]);

  const container = document.createElement('div');
  // ステージ自体は最小サイズにし、出力時に範囲と倍率を指定する（不要な大容量Canvasを確保しない）
  const stage = new Konva.Stage({ container, width: 1, height: 1 });
  try {
    const layer = new Konva.Layer({ listening: false });
    stage.add(layer);
    if (opts.background) {
      layer.add(new Konva.Rect({ width: page.width, height: page.height, fill: opts.background }));
    }
    layer.add(new Konva.Image({ image, width: page.width, height: page.height }));
    page.objects.forEach((o, i) => {
      const m = mathImages[i] as MathImage | null;
      layer.add(buildNode(describeObject(o, { mathImage: m?.img ?? null, hitPad: 0 })) as Konva.Group);
    });
    return layer.toCanvas({
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
      pixelRatio: effectiveScale(page, scale),
    });
  } finally {
    stage.destroy();
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の生成に失敗しました'))), type, quality);
  });
}

/** 一覧用の小さなサムネイル */
export async function renderThumbnail(page: Page, maxSide = 360): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(page.width, page.height));
  const canvas = await renderPageToCanvas(page, scale, { background: '#ffffff' });
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
  canvas.width = canvas.height = 0;
  return blob;
}
