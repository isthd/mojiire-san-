// テンプレート（便箋・手紙・原稿用紙など）から新しいページを作る。
// 紙は画像として描いて保存し、本文・宛名などの入力枠を最初から置いておく。
import { textForField } from '../canvas/autoFields';
import { createRuledText } from '../canvas/objectFactory';
import { uid } from '../lib/id';
import { drawPaper, layoutPaper, type PaperLayout, type TemplateField, type TemplateOptions } from '../lib/paperTemplates';
import { useSettings } from '../store/settingsStore';
import { fontCss, pageUnit, type Page, type TextObject } from '../types/model';
import { putImage } from './projectRepo';

/** 1mm あたりのピクセル数（約 200dpi） */
export const TEMPLATE_PX_PER_MM = 8;

export async function renderPaperBlob(layout: PaperLayout, k = TEMPLATE_PX_PER_MM): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(layout.width * k);
  canvas.height = Math.round(layout.height * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  drawPaper(ctx, layout, k, fontCss('gothic'));
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('toBlob');
  return blob;
}

function fieldToObject(f: TemplateField, k: number, unit: number): TextObject {
  const s = useSettings.getState().tools.text;
  const r = { x: f.rect.x * k, y: f.rect.y * k, width: f.rect.width * k, height: f.rect.height * k };
  if (f.kind === 'field') return textForField({ ...r, kind: 'box', vertical: f.vertical }, s, unit);
  const gap = f.gap * k;
  const obj = createRuledText(r, gap, { ...s, vertical: f.vertical }, unit);
  if (!f.cell) return obj;
  // 原稿用紙：1文字ずつマスの真ん中に来るように、文字の大きさと間隔をマスに合わせる
  const cell = f.cell * k;
  const fs = cell * 0.72;
  const ls = cell / fs - 1;
  const inset = fs * 0.4; // 罫線テキストボックスの上の余白（describe.ts の ruledTextNodes と同じ）
  const rows = Math.round(r.height / cell);
  const top = r.y + (cell - fs) / 2 - inset;
  const height = rows * cell - fs * ls + inset * 2 + cell * 0.02;
  return { ...obj, fontSize: fs, letterSpacing: ls, y: top, boxHeight: height };
}

/** テンプレートの紙を1ページ作る（画像は projectId のプロジェクトに保存する） */
export async function createTemplatePage(projectId: string, o: TemplateOptions): Promise<Page> {
  const layout = layoutPaper(o);
  const k = TEMPLATE_PX_PER_MM;
  const blob = await renderPaperBlob(layout, k);
  const width = Math.round(layout.width * k);
  const height = Math.round(layout.height * k);
  const imageId = uid();
  await putImage({ id: imageId, projectId, blob, width, height });
  const unit = pageUnit(width, height);
  return {
    id: uid(),
    imageId,
    width,
    height,
    unit,
    objects: layout.fields.map((f) => fieldToObject(f, k, unit)),
  };
}
