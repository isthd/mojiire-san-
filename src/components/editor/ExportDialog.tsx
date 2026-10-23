// 書き出しダイアログ：PNG / JPEG / PDF、解像度倍率、品質、対象ページ
import { Download, Share2 } from 'lucide-react';
import { useState } from 'react';
import {
  canShareFiles,
  downloadFiles,
  SaveError,
  exportImages,
  exportPdf,
  shareFiles,
  willDownscale,
  type ExportFormat,
} from '../../export/exporters';
import { currentPageOf, useEditor } from '../../store/editorStore';
import { toast } from '../../store/toastStore';
import { Button, Field, Modal, NumberSlider, Segmented } from '../ui/primitives';

export function ExportDialog() {
  const open = useEditor((s) => s.modal === 'export');
  const setModal = useEditor((s) => s.setModal);
  const pages = useEditor((s) => s.history.present.pages);
  const current = useEditor((s) => currentPageOf(s));
  const name = useEditor((s) => s.projectName);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(0.92);
  const [target, setTarget] = useState<'current' | 'all'>('current');
  const [result, setResult] = useState<File[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const close = () => {
    setResult(null);
    setModal(null);
  };
  const targetPages = format === 'pdf' || target === 'all' ? pages : current ? [current] : [];

  const run = async () => {
    if (!targetPages.length) return;
    useEditor.getState().commitTextEdit();
    setResult(null);
    const onProgress = (done: number, total: number) =>
      setProgress(total > 1 ? `書き出し中… (${Math.min(done + 1, total)}/${total})` : '書き出し中…');
    try {
      onProgress(0, targetPages.length);
      const opts = { format, scale, quality };
      const files =
        format === 'pdf'
          ? [await exportPdf(targetPages, name, opts, onProgress)]
          : await exportImages(targetPages, pages, name, opts, onProgress);
      if (willDownscale(targetPages, scale)) toast('端末の制限により、一部のページは解像度を下げて書き出しました');
      if (canShareFiles(files)) {
        // iPad・スマホでは共有シート（写真に保存など）を選べるようにする
        setResult(files);
      } else {
        setProgress('保存中…');
        await downloadFiles(files);
        toast(files.length > 1 ? `${files.length}個のファイルを保存しました` : '保存しました');
        close();
      }
    } catch (e) {
      if (e instanceof SaveError) {
        toast(e.message, e.declined ? 'info' : 'error');
        return;
      }
      console.error(e);
      toast('書き出しに失敗しました：' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal
      open={open}
      title="画像を書き出す"
      onClose={close}
      footer={
        result ? (
          <>
            <Button
              onClick={async () => {
                try {
                  await downloadFiles(result);
                  close();
                } catch (e) {
                  toast(e instanceof Error ? e.message : '保存できませんでした', 'error');
                }
              }}
            >
              <Download size={18} /> ダウンロード
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (await shareFiles(result)) close();
                else toast('共有できませんでした。ダウンロードをお試しください', 'error');
              }}
            >
              <Share2 size={18} /> 共有・写真に保存
            </Button>
          </>
        ) : (
          <>
            <Button onClick={close}>キャンセル</Button>
            <Button variant="primary" onClick={run} disabled={!!progress || !targetPages.length}>
              <Download size={18} /> {progress ?? '書き出す'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <p className="text-[15px] text-neutral-700">
          {result.length}個のファイルを作成しました。保存方法を選んでください。
        </p>
      ) : (
        <div className="space-y-5">
          <Field label="形式">
            <Segmented
              ariaLabel="形式"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'pdf', label: 'PDF' },
              ]}
            />
          </Field>
          {format !== 'pdf' && pages.length > 1 && (
            <Field label="ページ">
              <Segmented
                ariaLabel="対象ページ"
                value={target}
                onChange={setTarget}
                options={[
                  { value: 'current', label: '表示中のページ' },
                  { value: 'all', label: `全ページ（${pages.length}枚）` },
                ]}
              />
            </Field>
          )}
          {format === 'pdf' && <p className="text-[13px] text-neutral-500">全{pages.length}ページを1つのPDFにまとめます（各ページの縦横比を維持）。</p>}
          <Field label="解像度">
            <Segmented
              ariaLabel="解像度"
              value={String(scale)}
              onChange={(v) => setScale(Number(v))}
              options={[
                { value: '1', label: '元画像と同じ' },
                { value: '2', label: '2倍' },
                { value: '3', label: '3倍' },
              ]}
            />
            {current && (
              <p className="text-xs text-neutral-500">
                {Math.round(current.width * scale)} × {Math.round(current.height * scale)} px（表示中のページ）
              </p>
            )}
          </Field>
          {format !== 'png' && (
            <Field label="画質">
              <NumberSlider
                label="画質"
                value={quality}
                min={0.5}
                max={1}
                step={0.01}
                display={{ to: (v) => v * 100, from: (v) => v / 100 }}
                suffix="%"
                onChange={setQuality}
              />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
