import { importImageFiles, pickImageFiles } from '../../storage/imageImport';
import { useEditor } from '../../store/editorStore';
import { toast } from '../../store/toastStore';

/** 画像ファイル・PDF を現在のプロジェクトにページとして追加 */
export async function addImagesToProject(list: FileList | File[] | null | undefined): Promise<void> {
  const st = useEditor.getState();
  if (!st.projectId) return;
  const files = pickImageFiles(list);
  if (!files.length) {
    toast('画像（PNG・JPEG・WebP）か PDF を選んでください', 'error');
    return;
  }
  st.setBusy({ message: '読み込み中…', progress: 0 });
  try {
    const { pages, failed } = await importImageFiles(st.projectId, files, (p) => useEditor.getState().setBusy(p));
    useEditor.getState().addPages(pages);
    if (failed.length) toast(`読み込めなかったファイルがあります：${failed.join('、')}`, 'error');
  } catch (e) {
    console.error(e);
    toast('読み込みに失敗しました', 'error');
  } finally {
    useEditor.getState().setBusy(null);
  }
}
