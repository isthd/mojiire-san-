// 「フォルダへ移動」ダイアログ
import { Check, Folder as FolderIcon, FolderPlus, Inbox } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Folder } from '../../types/model';
import { Button, cx, Modal } from '../ui/primitives';

export function MoveDialog({
  open,
  count,
  folders,
  current,
  onMove,
  onClose,
}: {
  open: boolean;
  count: number;
  folders: Folder[];
  /** 移動するものが全部同じフォルダにあるときのフォルダ（未分類は null、ばらばらなら undefined） */
  current: string | null | undefined;
  onMove: (target: { folderId: string | null } | { newName: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const row = (id: string | null, label: string, Icon: typeof FolderIcon) => (
    <button
      key={id ?? '__none'}
      type="button"
      onClick={() => {
        onMove({ folderId: id });
        onClose();
      }}
      className={cx(
        'tap flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] hover:bg-neutral-100',
        current === id && 'bg-[#0a84ff]/10 text-[#0a84ff]',
      )}
    >
      <Icon size={20} className={id ? 'text-[#0a84ff]' : 'text-neutral-500'} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {current === id && <Check size={18} />}
    </button>
  );

  const create = () => {
    const v = name.trim();
    if (!v) return;
    onMove({ newName: v });
    onClose();
  };

  return (
    <Modal open={open} title={count > 1 ? `${count}件をフォルダへ移動` : 'フォルダへ移動'} onClose={onClose}>
      <div className="-mx-2 space-y-0.5">
        {row(null, '未分類（フォルダに入れない）', Inbox)}
        {folders.map((f) => row(f.id, f.name, FolderIcon))}
      </div>
      <div className="mt-3 flex gap-2 border-t border-neutral-200 pt-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新しいフォルダの名前"
          aria-label="新しいフォルダの名前"
          className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 text-[16px] outline-none focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) create();
          }}
        />
        <Button variant="primary" className="h-11 shrink-0" onClick={create} disabled={!name.trim()}>
          <FolderPlus size={18} /> 作って移動
        </Button>
      </div>
    </Modal>
  );
}
