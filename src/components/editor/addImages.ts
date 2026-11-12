import { importImageFiles, pickImageFiles } from '../../storage/imageImport';
import { autoSortImportedPages, canReadImages, sortPagesByNumber } from '../../storage/printReader';
import { useEditor } from '../../store/editorStore';
import { toast } from '../../store/toastStore';

const numberProgress = (d: number, t: number) =>
  useEditor.getState().setBusy({ message: `ページ番号を読み取り中… ${Math.min(d + 1, t)}/${t}`, progress: t ? d / t : 1 });

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
    const imported = await importImageFiles(st.projectId, files, (p) => useEditor.getState().setBusy(p));
    // 写真を何枚もまとめて追加したときは、追加した分を印刷されたページ番号の順に並べる
    const { pages, sorted } = await autoSortImportedPages(files, imported.pages, numberProgress);
    useEditor.getState().addPages(pages);
    if (sorted) toast('追加したページをページ番号の順に並べ替えました');
    if (imported.failed.length) toast(`読み込めなかったファイルがあります：${imported.failed.join('、')}`, 'error');
  } catch (e) {
    console.error(e);
    toast('読み込みに失敗しました', 'error');
  } finally {
    useEditor.getState().setBusy(null);
  }
}

/** プロジェクトの全ページを、印刷されたページ番号の順に並べ替える（元に戻すで戻せる） */
export async function sortProjectPagesByNumber(): Promise<void> {
  const st = useEditor.getState();
  const pages = st.history.present.pages;
  if (pages.length < 2) return;
  if (!canReadImages()) {
    toast('この端末ではページ番号を読み取れません', 'error');
    return;
  }
  st.commitTextEdit();
  numberProgress(0, pages.length);
  try {
    const r = await sortPagesByNumber(pages, numberProgress);
    const now = useEditor.getState();
    // 読み取り中にページが増減・移動していたら並べ替えない
    const same = now.history.present.pages.map((p) => p.id).join() === pages.map((p) => p.id).join();
    if (!r) toast('この端末ではページ番号を読み取れません', 'error');
    else if (r.found < 2) toast('ページ番号を読み取れませんでした（ページの上か下の余白に「- 3 -」「p.12」などの番号があるプリントで使えます）', 'error');
    else if (!r.pages) toast('すでにページ番号の順に並んでいます');
    else if (!same) toast('読み取り中にページが変わったため、並べ替えを中止しました', 'error');
    else {
      now.setPageOrder(r.pages.map((p) => p.id));
      toast(`ページ番号の順に並べ替えました（${r.found}/${pages.length}ページで番号を読み取り・「元に戻す」で戻せます）`);
    }
  } catch (e) {
    console.error(e);
    toast('並べ替えに失敗しました', 'error');
  } finally {
    useEditor.getState().setBusy(null);
  }
}
