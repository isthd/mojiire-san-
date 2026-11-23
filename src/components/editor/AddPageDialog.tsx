// 「ページを追加」ダイアログ：写真・PDF を選ぶか、テンプレートの紙（白紙・方眼・便箋・原稿用紙など）を追加する。
import { ChevronRight, ImagePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TEMPLATES, type TemplateOptions } from '../../lib/paperTemplates';
import { createTemplatePage } from '../../storage/templateProject';
import { useEditor } from '../../store/editorStore';
import { toast } from '../../store/toastStore';
import { Button, Modal } from '../ui/primitives';
import { loadTemplatePrefs, saveTemplatePrefs, TemplatePicker } from '../home/TemplateDialog';

/** テンプレートの紙を現在のプロジェクトの最後に1ページ追加する */
export async function addTemplatePage(o: TemplateOptions): Promise<void> {
  const st = useEditor.getState();
  if (!st.projectId) return;
  st.setBusy({ message: 'ページを作成中…', progress: 0 });
  try {
    const page = await createTemplatePage(st.projectId, o);
    useEditor.getState().addPages([page]);
    toast(`「${TEMPLATES.find((t) => t.kind === o.kind)?.label ?? 'テンプレート'}」のページを追加しました`);
  } catch (e) {
    console.error(e);
    toast('ページを作成できませんでした', 'error');
  } finally {
    useEditor.getState().setBusy(null);
  }
}

export function AddPageDialog({
  open,
  onClose,
  onPickFiles,
}: {
  open: boolean;
  onClose: () => void;
  /** 写真・PDF のファイル選択を開く */
  onPickFiles: () => void;
}) {
  const [opts, setOpts] = useState<TemplateOptions>(loadTemplatePrefs);
  useEffect(() => {
    if (open) setOpts(loadTemplatePrefs());
  }, [open]);
  const set = (patch: Partial<TemplateOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const add = (o: TemplateOptions) => {
    saveTemplatePrefs(o);
    onClose();
    void addTemplatePage(o);
  };
  const current = TEMPLATES.find((t) => t.kind === opts.kind) ?? TEMPLATES[0];

  return (
    <Modal
      open={open}
      title="ページを追加"
      onClose={onClose}
      wide
      footer={
        <>
          <Button className="h-11" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" className="h-11" onClick={() => add(opts)}>
            「{current.label}」を追加
          </Button>
        </>
      }
    >
      <button
        type="button"
        onClick={() => {
          onClose();
          onPickFiles();
        }}
        className="tap group flex w-full items-center gap-3.5 rounded-2xl border border-neutral-200 px-4 py-3.5 text-left transition hover:border-[#0a84ff] hover:bg-[#0a84ff]/[0.04]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0a84ff]/10 text-[#0a84ff]">
          <ImagePlus size={26} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">写真・PDF を選ぶ</span>
          <span className="block text-[12px] leading-relaxed text-neutral-500">
            プリント・教科書・問題集の写真や PDF（ドラッグ＆ドロップ・Ctrl+V でも追加できます）
          </span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-neutral-400 group-hover:text-[#0a84ff]" aria-hidden />
      </button>

      <div className="my-4 flex items-center gap-3 text-[12px] font-medium text-neutral-500">
        <span className="h-px flex-1 bg-neutral-200" />
        またはテンプレートの紙を追加
        <span className="h-px flex-1 bg-neutral-200" />
      </div>

      <TemplatePicker opts={opts} onChange={set} onPick={add} />
    </Modal>
  );
}
