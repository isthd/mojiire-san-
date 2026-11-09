// 一覧のカード（サムネイル・ページ数・教科・状態・タイトル・期限・「…」メニュー）。
// カード全体をタップで開く。「…」ボタンのほか、長押し・右クリックでもメニューを開く。
import { AlarmClock, Check, Ellipsis, Folder as FolderIcon, Sparkles } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { dueText, isDueSoon } from '../../lib/homeList';
import { HOME } from '../../lib/homeTheme';
import { useLongPress } from '../../hooks/useLongPress';
import type { ProjectMeta, ProjectStatus } from '../../types/model';
import { cx } from '../ui/primitives';
import { StatusBadge, SubjectBadge, Thumbnail } from './HomeParts';

export const DRAG_TYPE = 'application/x-mojiire-project';

export function ProjectCard({
  p,
  subject,
  status,
  now,
  folderLabel,
  matchedText,
  selecting,
  selected,
  draggable,
  dragging,
  menuAnchor,
  menu,
  onOpen,
  onToggleSelect,
  onMenu,
  onRenameAuto,
  onDragStart,
  onDragEnd,
}: {
  p: ProjectMeta;
  subject: string | null;
  status: ProjectStatus;
  now: Date;
  /** 入っているフォルダ名（すべてのフォルダを表示しているとき） */
  folderLabel: string | null;
  /** 検索でプリントの中身に一致した */
  matchedText: boolean;
  selecting: boolean;
  selected: boolean;
  draggable: boolean;
  dragging: boolean;
  menuAnchor: RefObject<HTMLDivElement | null> | undefined;
  /** 開いているメニュー（MenuPopover）。閉じているときは null */
  menu: ReactNode;
  onOpen: () => void;
  onToggleSelect: () => void;
  onMenu: (open: boolean) => void;
  onRenameAuto: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const longPress = useLongPress(() => !selecting && onMenu(true));
  const soon = isDueSoon(p, now);
  return (
    <li
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.08] transition select-none',
        'hover:shadow-[0_4px_14px_rgb(0_0_0/0.10)]',
        selecting && selected && 'ring-[3px] ring-[#0a5fcc]',
        dragging && 'opacity-50',
      )}
      style={{ WebkitTouchCallout: 'none' }}
      draggable={draggable}
      onDragStart={(e) => {
        longPress.cancel();
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      {...longPress.handlers}
    >
      <div className="relative h-[132px] bg-[#eceef2] sm:h-[150px]">
        <div className="absolute inset-x-[21%] top-4 bottom-0 overflow-hidden rounded-t-[3px] bg-white shadow-[0_1px_4px_rgb(0_0_0/0.16)]">
          <Thumbnail blob={p.thumbnail} fit="cover" />
        </div>
        <span
          className="absolute top-2.5 right-2.5 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums"
          style={{ background: HOME.badgeBg, color: HOME.badgeText }}
        >
          {p.pageCount}ページ
        </span>
        {folderLabel && !selecting && (
          <span className="absolute top-2.5 left-2.5 flex max-w-[55%] items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11.5px] text-[#3f4248] shadow-[0_1px_2px_rgb(0_0_0/0.15)]">
            <FolderIcon size={12} className="shrink-0" aria-hidden />
            <span className="truncate">{folderLabel}</span>
          </span>
        )}
        {selecting && (
          <span
            aria-hidden
            className={cx(
              'pointer-events-none absolute top-2.5 left-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow',
              selected ? 'border-[#0a5fcc] bg-[#0a5fcc] text-white' : 'border-white bg-white/80 text-transparent',
            )}
          >
            <Check size={16} strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3.5 pt-3 pb-1">
        <div className="flex flex-wrap gap-1.5">
          <SubjectBadge subject={subject} />
          <StatusBadge status={status} />
        </div>
        {/* カード全体を押せるように、ボタンの ::after をカードいっぱいに広げる（ほかのボタンは z-[1] で上に出す） */}
        <button
          type="button"
          aria-pressed={selecting ? selected : undefined}
          onClick={() => {
            if (longPress.consumeClick()) return;
            if (selecting) onToggleSelect();
            else onOpen();
          }}
          className="mt-2 block text-left after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          title={p.name}
        >
          <span className="line-clamp-2 text-[15px] leading-snug font-semibold break-words" style={{ color: HOME.text }}>
            {p.name}
          </span>
        </button>
        {matchedText && (
          <span className="mt-1 text-[12px]" style={{ color: HOME.muted }}>
            プリントの中身に一致
          </span>
        )}
        {p.autoNamed && !selecting && (
          <button
            type="button"
            onClick={onRenameAuto}
            className="tap relative z-[1] -mx-2 mt-0.5 flex min-h-11 items-center gap-1 self-start rounded-lg px-2 text-[12.5px] hover:bg-[#0a5fcc]/10"
            style={{ color: HOME.link }}
          >
            <Sparkles size={13} aria-hidden />
            写真から自動で命名（変更）
          </button>
        )}
        <div className="mt-auto flex items-center gap-1 pt-1">
          <span
            className={cx('flex min-w-0 flex-1 items-center gap-1 truncate text-[13px] tabular-nums', soon && 'font-bold')}
            style={{ color: soon ? HOME.dueSoon : HOME.muted }}
          >
            {soon && <AlarmClock size={14} className="shrink-0" aria-hidden />}
            {soon && <span className="sr-only">期限が近い：</span>}
            <span className="truncate">{dueText(p, now)}</span>
          </span>
          {!selecting && (
            <div data-menu className="relative z-[1] -mr-2" ref={menuAnchor}>
              <button
                type="button"
                aria-label={`「${p.name}」のメニュー`}
                aria-haspopup="menu"
                aria-expanded={!!menu}
                title="メニュー"
                onClick={() => onMenu(!menu)}
                className="tap flex h-11 w-11 items-center justify-center rounded-xl text-[#3f4248] hover:bg-black/[0.06]"
              >
                <Ellipsis size={20} aria-hidden />
              </button>
              {menu}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
