// 便箋の写真から罫線の間隔を読み取り、罫線テキストボックスを線に合わせて置く。
import { rgbaToGray } from '../lib/answerFields';
import { detectRules, fitRuledRange } from '../lib/ruleDetect';
import { loadPageImage } from '../storage/imageCache';
import { currentPageOf, useEditor } from '../store/editorStore';
import { useSettings } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { isRuledText, type Page, type TextObject } from '../types/model';
import { createRuledText } from './objectFactory';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 解析に使う範囲の長辺（これより大きい範囲は縮小して処理する） */
const DETECT_SIDE = 1400;

/**
 * 範囲の中の罫線を探し、線に合わせた枠と行の幅を返す。見つからなければ null。
 * vertical なら縦の罫線（縦書きの便箋）を探す。
 */
export async function fitRulesInRect(page: Page, r: Rect, vertical: boolean): Promise<{ rect: Rect; gap: number } | null> {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(page.width, Math.ceil(r.x + r.width));
  const y1 = Math.min(page.height, Math.ceil(r.y + r.height));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  const image = await loadPageImage(page.imageId);
  const k = Math.min(1, DETECT_SIDE / Math.max(x1 - x0, y1 - y0));
  const w = Math.max(1, Math.round((x1 - x0) * k));
  const h = Math.max(1, Math.round((y1 - y0) * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  // 元画像の画素とページの座標は同じ（ページの大きさ = 画像の大きさ）
  const sx = image.naturalWidth / page.width;
  const sy = image.naturalHeight / page.height;
  ctx.drawImage(image, x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy, 0, 0, w, h);
  const gray = rgbaToGray(ctx.getImageData(0, 0, w, h).data, w, h).data;
  canvas.width = canvas.height = 0;

  // 罫線と直交する方向の濃さの分布
  const len = vertical ? w : h;
  const across = vertical ? h : w;
  const profile = new Float64Array(len);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = 255 - gray[y * w + x];
      profile[vertical ? x : y] += d;
    }
  }
  for (let i = 0; i < len; i++) profile[i] /= across;
  const fit = detectRules(profile, 6);
  if (!fit) return null;
  const gap = fit.gap / k;
  const length = (vertical ? x1 - x0 : y1 - y0);
  // 縦書きは右から数えるので、右端からの位置に直して当てはめる
  const offset = vertical ? (((length * k - fit.offset) % fit.gap) + fit.gap) % fit.gap / k : fit.offset / k;
  const range = fitRuledRange(length, gap, offset);
  const size = range.lines * gap;
  if (vertical) {
    const right = x1 - range.start;
    return { rect: { x: right - size, y: r.y, width: size, height: r.height }, gap };
  }
  return { rect: { x: r.x, y: y0 + range.start, width: r.width, height: size }, gap };
}

/** なぞった範囲に罫線テキストボックスを置く */
export async function placeRuledBox(r: Rect): Promise<void> {
  const st = useEditor.getState();
  const page = currentPageOf(st);
  if (!page) return;
  const s = useSettings.getState().tools.text;
  const vertical = s.vertical;
  let fit: Awaited<ReturnType<typeof fitRulesInRect>> = null;
  try {
    fit = await fitRulesInRect(page, r, vertical);
  } catch {
    fit = null;
  }
  const cur = useEditor.getState();
  if (currentPageOf(cur)?.id !== page.id) return;
  let obj: TextObject;
  if (fit) {
    obj = createRuledText(fit.rect, fit.gap, s, page.unit);
  } else {
    // 線が見つからないときは、いまの文字の大きさに合う行の幅で区切る
    const span = vertical ? r.width : r.height;
    const lines = Math.max(1, Math.round(span / (s.fontSize * page.unit * 1.7)));
    obj = createRuledText(r, span / lines, s, page.unit);
  }
  cur.setTool('select');
  cur.addObject(obj, { select: true });
  toast(
    fit
      ? '便箋の線に合わせて枠を置きました。ダブルタップで入力できます'
      : '線を見つけられませんでした。「行の幅」で線に合わせてください',
    fit ? undefined : 'error',
  );
}

/** 置いてある罫線テキストボックスを、写真の線に合わせ直す */
export async function refitRuledBox(id: string): Promise<void> {
  const st = useEditor.getState();
  const page = currentPageOf(st);
  const o = page?.objects.find((x) => x.id === id);
  if (!page || !o || !isRuledText(o)) return;
  if (Math.abs(o.rotation % 360) > 0.5) {
    toast('回転している枠は合わせられません。回転を 0° に戻してください', 'error');
    return;
  }
  const vertical = !!o.vertical;
  // 枠の少し外側まで見て、端の線も拾う
  const pad = o.ruleGap * 0.5;
  const r = vertical
    ? { x: o.x - pad, y: o.y, width: o.boxWidth + pad * 2, height: o.boxHeight }
    : { x: o.x, y: o.y - pad, width: o.boxWidth, height: o.boxHeight + pad * 2 };
  let fit: Awaited<ReturnType<typeof fitRulesInRect>> = null;
  try {
    fit = await fitRulesInRect(page, r, vertical);
  } catch {
    fit = null;
  }
  if (!fit) {
    toast('この範囲に線が見つかりませんでした', 'error');
    return;
  }
  const k = fit.gap / o.ruleGap;
  useEditor.getState().updateObjects({
    [o.id]: {
      x: fit.rect.x,
      y: fit.rect.y,
      boxWidth: fit.rect.width,
      boxHeight: fit.rect.height,
      ruleGap: fit.gap,
      fontSize: o.fontSize * k,
    } as Partial<TextObject>,
  });
  toast('写真の線に合わせました');
}
