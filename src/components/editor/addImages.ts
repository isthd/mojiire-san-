import { importImageFiles, pickImageFiles } from '../../storage/imageImport';
import { useEditor } from '../../store/editorStore';
import { toast } from '../../store/toastStore';

/** 画像ファイルを現在のプロジェクトにページとして追加 */
export async function addImagesToProject(list: FileList | File[] | null | undefined): Promise<void> {
  const st = useEditor.getState();
  if (!st.projectId) return;
  const files = pickImageFiles(list);
  if (!files.length) {
    toast('画像ファイル（PNG・JPEG・WebP）を選んでください', 'error');
    return;
  }
  st.setBusy({ message: '画像を読み込み中…', progress: 0 });
  try {
    const { pages, failed } = await importImageFiles(st.projectId, files, (done, total) =>
      useEditor.getState().setBusy({
        message: total > 1 ? `画像を読み込み中… (${Math.min(done + 1, total)}/${total})` : '画像を読み込み中…',
        progress: done / total,
      }),
    );
    useEditor.getState().addPages(pages);
    if (failed.length) toast(`読み込めなかった画像があります：${failed.join('、')}`, 'error');
  } catch (e) {
    console.error(e);
    toast('画像の読み込みに失敗しました', 'error');
  } finally {
    useEditor.getState().setBusy(null);
  }
}
