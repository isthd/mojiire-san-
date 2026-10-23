import { Loader2 } from 'lucide-react';
import { useEditor } from '../../store/editorStore';
import { useToast } from '../../store/toastStore';
import { cx } from './primitives';

export function Toasts() {
  const toasts = useToast((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'max-w-md rounded-full px-4 py-2.5 text-[14px] font-medium text-white shadow-xl',
            t.tone === 'error' ? 'bg-[#ff3b30]' : 'bg-neutral-900/90',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** 画像読み込み中などの進行状況表示 */
export function BusyOverlay() {
  const busy = useEditor((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/60 backdrop-blur-sm" role="status">
      <div className="flex min-w-[220px] flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5 shadow-2xl ring-1 ring-black/5">
        <Loader2 className="animate-spin text-[#0a84ff]" size={30} />
        <div className="text-[15px] font-medium">{busy.message}</div>
        {busy.progress !== undefined && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full bg-[#0a84ff] transition-all" style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
