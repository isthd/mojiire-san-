// ホーム画面の小さな部品（サムネイル・教科ラベル・状態ラベル・進捗バー・ボタン）
import { ImagePlus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { STATUS_LABEL, subjectLabel } from '../../lib/homeList';
import { HOME, STATUS_COLOR } from '../../lib/homeTheme';
import { subjectColor } from '../../lib/subjects';
import type { ProjectStatus } from '../../types/model';
import { cx } from '../ui/primitives';

/** サムネイル（1ページ目。切り抜き・傾き補正をした画像はその結果から作られる） */
export function Thumbnail({ blob, small, fit = 'contain' }: { blob: Blob | null; small?: boolean; fit?: 'contain' | 'cover' }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!blob || !url) {
    return (
      <div className="flex h-full w-full items-center justify-center text-neutral-400">
        <ImagePlus size={small ? 18 : 28} strokeWidth={1.5} aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={cx('h-full w-full', fit === 'cover' ? 'object-cover object-top' : 'object-contain')}
      draggable={false}
    />
  );
}

/** 教科ラベル（色だけでなく教科名の文字で示す） */
export function SubjectBadge({ subject }: { subject: string | null }) {
  const c = subjectColor(subject);
  return (
    <span className="inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[12px] font-medium" style={{ color: c.fg, background: c.bg }}>
      {subjectLabel(subject)}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[12px] font-medium" style={{ color: c.fg, background: c.bg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** 書き込み済みページ数／総ページ数 */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const ratio = total ? Math.min(1, done / total) : 0;
  return (
    <span className="flex items-center gap-2">
      <span
        role="progressbar"
        aria-label="書き込み済みのページ"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(done, total)}
        aria-valuetext={`${total}ページ中${Math.min(done, total)}ページ`}
        className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
        style={{ background: HOME.progressTrack }}
      >
        <span className="block h-full rounded-full" style={{ width: `${Math.max(ratio * 100, done ? 4 : 2)}%`, background: HOME.progressFill }} />
      </span>
      <span className="shrink-0 text-[12px] tabular-nums" style={{ color: HOME.muted }}>
        {Math.min(done, total)}/{total}
      </span>
    </span>
  );
}

/** ホーム画面の文字ボタン（高さ44px以上・コントラストを確保した青） */
export function HomeButton({
  children,
  className,
  tone = 'link',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; tone?: 'link' | 'danger' | 'plain' | 'dangerSolid' }) {
  return (
    <button
      type="button"
      className={cx(
        'tap inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[14px] font-medium transition-colors disabled:opacity-40',
        tone === 'link' && 'text-[#0a5fcc] hover:bg-[#0a5fcc]/10',
        tone === 'danger' && 'text-[#c0161d] hover:bg-[#c0161d]/10',
        tone === 'plain' && 'text-[#1d1d1f] hover:bg-black/[0.05]',
        tone === 'dangerSolid' && 'bg-[#c0161d] text-white hover:bg-[#a51319]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
