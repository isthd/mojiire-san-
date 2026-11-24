// 画像を貼る・ページの中央にそろえる。
import { measureText, placeholderSize } from '../../canvas/describe';
import { viewCenterInImage } from '../../canvas/viewActions';
import { uid } from '../../lib/id';
import { fitPictureSize, importPicture } from '../../storage/pictureImport';
import { currentPageOf, useEditor } from '../../store/editorStore';
import { toast } from '../../store/toastStore';
import { isEmptyText, type EditorObject, type ImageObject } from '../../types/model';

/** 貼り付けられる画像ファイルだけを取り出す（PDF は除く） */
export function pickPictureFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}

/** 画面の中央あたりに画像を置く（複数のときは少しずつずらす） */
export async function addPicturesToPage(list: FileList | File[] | null | undefined): Promise<void> {
  const st = useEditor.getState();
  const page = currentPageOf(st);
  if (!st.projectId || !page) return;
  const files = pickPictureFiles(list);
  if (!files.length) {
    toast('画像（PNG・JPEG・WebP など）を選んでください', 'error');
    return;
  }
  st.commitTextEdit();
  st.setBusy({ message: '画像を読み込み中…', progress: 0 });
  const added: ImageObject[] = [];
  const failed: string[] = [];
  try {
    const c = viewCenterInImage();
    for (let i = 0; i < files.length; i++) {
      useEditor.getState().setBusy({ message: `画像を読み込み中… ${i + 1}/${files.length}`, progress: i / files.length });
      try {
        const pic = await importPicture(st.projectId, files[i]);
        const size = fitPictureSize(pic.width, pic.height, page.width, page.height, files.length > 1 ? 0.4 : 0.6);
        const off = i * 24 * page.unit;
        added.push({
          id: uid(),
          type: 'image',
          imageId: pic.imageId,
          x: c.x - size.width / 2 + off,
          y: c.y - size.height / 2 + off,
          width: size.width,
          height: size.height,
          rotation: 0,
          opacity: 1,
        });
      } catch (e) {
        console.error(e);
        failed.push(files[i].name || `画像${i + 1}`);
      }
    }
    const now = useEditor.getState();
    if (added.length) {
      if (now.tool !== 'select') now.setTool('select');
      now.addObjects(added);
      useEditor.getState().select(added.map((o) => o.id));
    }
    if (failed.length) toast(`読み込めなかった画像があります：${failed.join('、')}`, 'error');
  } finally {
    useEditor.getState().setBusy(null);
  }
}

/** 回転前の大きさ（線・手書きは null） */
export function objectBoxSize(o: EditorObject): { width: number; height: number } | null {
  switch (o.type) {
    case 'text':
      return isEmptyText(o) ? placeholderSize(o) : measureText(o);
    case 'math':
    case 'rect':
    case 'ellipse':
    case 'triangle':
    case 'image':
      return { width: o.width, height: o.height };
    default:
      return null;
  }
}

/** ページの左右・上下の中央にそろえる */
export function alignToPageCenter(ids: string[], axis: 'h' | 'v'): void {
  const st = useEditor.getState();
  const page = currentPageOf(st);
  if (!page) return;
  const patches: Record<string, Partial<EditorObject>> = {};
  for (const o of page.objects) {
    if (!ids.includes(o.id)) continue;
    const size = objectBoxSize(o);
    if (!size) continue;
    // 回転の中心は左上なので、まん中までのずれを回転させて求める
    const rad = (o.rotation * Math.PI) / 180;
    const hx = size.width / 2;
    const hy = size.height / 2;
    const cx = hx * Math.cos(rad) - hy * Math.sin(rad);
    const cy = hx * Math.sin(rad) + hy * Math.cos(rad);
    patches[o.id] = axis === 'h' ? { x: page.width / 2 - cx } : { y: page.height / 2 - cy };
  }
  if (Object.keys(patches).length) st.updateObjects(patches);
}
