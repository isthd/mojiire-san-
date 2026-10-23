// 回答欄の自動検出と「ダブルタップで入力」の文字枠の自動配置。
import { detectAnswerFields, rgbaToGray, type AnswerField } from '../lib/answerFields';
import { loadPageImage } from '../storage/imageCache';
import { currentPageOf, useEditor } from '../store/editorStore';
import { useSettings, type ToolSettings } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { isEmptyText, type EditorObject, type Page, type TextObject } from '../types/model';
import { measureText, placeholderSize, textPadding } from './describe';
import { createText } from './objectFactory';

/** 検出に使う画像の長辺（これより大きい画像は縮小して処理する） */
const DETECT_SIDE = 1600;

async function detectOnPage(page: Page): Promise<AnswerField[]> {
  const image = await loadPageImage(page.imageId);
  const k = Math.min(1, DETECT_SIDE / Math.max(page.width, page.height));
  const w = Math.max(1, Math.round(page.width * k));
  const h = Math.max(1, Math.round(page.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('画像を解析できませんでした');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  const gray = rgbaToGray(ctx.getImageData(0, 0, w, h).data, w, h);
  canvas.width = canvas.height = 0;
  // 画像座標に戻す
  return detectAnswerFields(gray).map((f) => ({ ...f, x: f.x / k, y: f.y / k, width: f.width / k, height: f.height / k }));
}

/** 欄の大きさに合わせた文字枠（文字サイズ・位置・枠の大きさ） */
export function textForField(f: AnswerField, s: ToolSettings['text'], unit: number): TextObject {
  const base = s.fontSize * unit;
  const lh = s.lineHeight;
  const margin = Math.min(f.width, f.height) * 0.08;
  if (f.vertical) {
    const fontSize = Math.min(f.width * 0.55, base * 1.5);
    const obj = { ...createText({ x: 0, y: 0 }, { ...s, vertical: true }, unit), fontSize };
    const colW = fontSize * lh + textPadding(obj) * 2;
    // 幅の広い欄は右端（1行目の位置）から書く
    const x = f.width > colW * 1.9 ? f.x + f.width - margin - colW : f.x + (f.width - colW) / 2;
    return { ...obj, x, y: f.y + margin, fieldWidth: colW, fieldHeight: f.height - margin * 2 };
  }
  const fontSize = Math.min(f.height * 0.55, base * 1.5);
  const obj = { ...createText({ x: 0, y: 0 }, { ...s, vertical: false }, unit), fontSize };
  const blockH = fontSize * lh + textPadding(obj) * 2;
  // 高さのある欄（記述欄など）は左上から、それ以外は上下中央に置く
  const y = f.height > blockH * 1.9 ? f.y + margin : f.y + (f.height - blockH) / 2;
  const x = f.x + margin;
  return { ...obj, x, y, fieldWidth: f.x + f.width - margin - x, fieldHeight: blockH };
}

function boundsOf(o: EditorObject): { x: number; y: number; width: number; height: number } | null {
  if (o.type === 'text') {
    const m = isEmptyText(o) ? placeholderSize(o) : measureText(o);
    return { x: o.x, y: o.y, ...m };
  }
  if (o.type === 'math') return { x: o.x, y: o.y, width: o.width, height: o.height };
  return null;
}

/** 既に文字・数式が置かれている欄か（重なりが欄・オブジェクトの小さい方の3割以上） */
function occupied(f: AnswerField, objects: EditorObject[]): boolean {
  return objects.some((o) => {
    const b = boundsOf(o);
    if (!b) return false;
    const iw = Math.min(f.x + f.width, b.x + b.width) - Math.max(f.x, b.x);
    const ih = Math.min(f.y + f.height, b.y + b.height) - Math.max(f.y, b.y);
    if (iw <= 0 || ih <= 0) return false;
    return iw * ih > Math.min(f.width * f.height, b.width * b.height) * 0.3;
  });
}

/** 表示中のページの回答欄を検出して、文字枠をまとめて配置する（元に戻すは1回分） */
export async function autoPlaceAnswerFields(): Promise<void> {
  const st = useEditor.getState();
  const page = currentPageOf(st);
  if (!page || st.busy) return;
  st.commitTextEdit();
  if (st.tool !== 'select') st.setTool('select');
  st.setBusy({ message: '回答欄を探しています…' });
  try {
    // オーバーレイを先に表示させる
    await new Promise((r) => setTimeout(r, 30));
    const fields = await detectOnPage(page);
    const cur = currentPageOf(useEditor.getState());
    if (!cur || cur.id !== page.id) return;
    const settings = useSettings.getState().tools.text;
    const free = fields.filter((f) => !occupied(f, cur.objects));
    const objs = free.map((f) => textForField(f, settings, cur.unit));
    useEditor.getState().addObjects(objs);
    if (objs.length) toast(`回答欄 ${objs.length} か所に文字枠を置きました。ダブルタップで入力できます`);
    else if (fields.length) toast('見つかった回答欄には、すでに文字が置かれています');
    else toast('回答欄が見つかりませんでした。⊕ から文字枠を追加できます');
  } catch (e) {
    toast('回答欄の検出に失敗しました：' + (e instanceof Error ? e.message : String(e)), 'error');
  } finally {
    useEditor.getState().setBusy(null);
  }
}
