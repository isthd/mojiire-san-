// 編集画面：レイアウトとプロジェクトの読み込み・自動保存
import { ImagePlus } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { EditorCanvas } from '../../canvas/EditorCanvas';
import { useShortcuts } from '../../hooks/useShortcuts';
import { startAutosave, updateThumbnail } from '../../storage/autosave';
import { clearImageCache } from '../../storage/imageCache';
import { ACCEPT_ATTR } from '../../storage/imageImport';
import { collectUnusedImages, getProjectMeta, loadStoredDocument } from '../../storage/projectRepo';
import { useEditor } from '../../store/editorStore';
import { BusyOverlay } from '../ui/Overlays';
import { Button, cx } from '../ui/primitives';
import { addImagesToProject } from './addImages';
import { ExportDialog } from './ExportDialog';
// 数式エディター（MathLive）は大きいので遅延読み込み。起動後の空き時間に先読みしておく。
const loadMathEditor = () => import('./MathEditorDialog');
const MathEditorDialog = lazy(() => loadMathEditor().then((m) => ({ default: m.MathEditorDialog })));
import { BottomBar } from './BottomBar';
import { PageStrip } from './PageStrip';
import { SettingsDialog } from './SettingsDialog';
import { TextInputModal } from './TextInputModal';
import { TopBar } from './TopBar';

function MathLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="rounded-2xl bg-white px-6 py-4 text-[15px] font-medium shadow-2xl">数式エディターを準備中…</div>
    </div>
  );
}

export function Editor({ projectId, onHome }: { projectId: string; onHome: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const pageCount = useEditor((s) => s.history.present.pages.length);
  const hasPages = pageCount > 0;
  const mathOpen = useEditor((s) => !!s.mathEdit);
  useShortcuts();

  useEffect(() => {
    const t = setTimeout(() => {
      void loadMathEditor();
      void import('../../math/mathRenderer').then((m) => m.loadMathEngine());
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    let stopAutosave: (() => void) | null = null;
    clearImageCache();
    (async () => {
      const [meta, stored] = await Promise.all([getProjectMeta(projectId), loadStoredDocument(projectId)]);
      if (!alive) return;
      const doc = stored?.doc;
      if (!meta || !doc) {
        setStatus('missing');
        return;
      }
      useEditor.getState().loadProject(projectId, meta.name, doc, stored.history);
      // 元に戻すで復活しうるページの画像も残す
      const h = useEditor.getState().history;
      void collectUnusedImages(projectId, [...h.past, h.present, ...h.future].flatMap((d) => d.pages));
      if (!meta.thumbnail && doc.pages.length) void updateThumbnail(projectId, doc);
      stopAutosave = startAutosave();
      setStatus('ready');
    })();
    return () => {
      alive = false;
      useEditor.getState().commitTextEdit();
      stopAutosave?.();
      useEditor.getState().closeProject();
    };
  }, [projectId]);

  const openPicker = () => fileRef.current?.click();

  if (status === 'missing') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4">
        <p className="text-neutral-600">プロジェクトが見つかりませんでした。</p>
        <Button variant="primary" onClick={onHome}>
          ホームへ戻る
        </Button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#f2f2f5]"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void addImagesToProject(e.dataTransfer.files);
      }}
    >
      <TopBar onHome={onHome} onAddImages={openPicker} />
      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-[120px] flex-1 bg-white">
            {status === 'ready' && hasPages && <EditorCanvas />}
            {status === 'ready' && !hasPages && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-neutral-300 bg-white px-6 py-12 text-center transition hover:border-[#0a84ff]"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0a84ff]/10 text-[#0a84ff]">
                    <ImagePlus size={32} />
                  </span>
                  <span className="text-[17px] font-semibold">画像を追加</span>
                  <span className="text-[13px] leading-relaxed text-neutral-500">
                    プリント・教科書・問題集の写真を選択
                    <br />
                    ドラッグ＆ドロップ、Ctrl+V での貼り付けにも対応（PNG・JPEG・WebP）
                  </span>
                </button>
              </div>
            )}
            {dragOver && (
              <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-3xl border-4 border-dashed border-[#0a84ff] bg-[#0a84ff]/10 text-lg font-semibold text-[#0a84ff]">
                ここにドロップして画像を追加
              </div>
            )}
          </div>
          {pageCount > 1 && <PageStrip onAddImages={openPicker} />}
          <BottomBar onAddImages={openPicker} />
        </main>
      </div>
      <TextInputModal />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        className={cx('hidden')}
        onChange={(e) => {
          void addImagesToProject(e.target.files);
          e.target.value = '';
        }}
      />
      {mathOpen && (
        <Suspense fallback={<MathLoading />}>
          <MathEditorDialog />
        </Suspense>
      )}
      <ExportDialog />
      <SettingsDialog />
      <BusyOverlay />
    </div>
  );
}
