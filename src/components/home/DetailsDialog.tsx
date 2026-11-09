// 「…」→「期限・教科を設定」：教科・状態・期限（テスト／提出）を設定する
import { useEffect, useState } from 'react';
import { DUE_TYPE_LABEL, STATUS_LABEL, statusOf } from '../../lib/homeList';
import { HOME } from '../../lib/homeTheme';
import { SUBJECTS, subjectColor, UNCLASSIFIED } from '../../lib/subjects';
import type { DueType, ProjectMeta, ProjectStatus } from '../../types/model';
import { cx, Modal } from '../ui/primitives';

export interface DetailsPatch {
  subject: string | null;
  status: ProjectStatus | null;
  dueDate: string | null;
  dueType: DueType | null;
}

function Chip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cx(
        'tap flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] ring-1 transition',
        on ? 'font-semibold ring-2 ring-[#0a5fcc]' : 'ring-neutral-300 hover:bg-neutral-100',
      )}
      style={{ color: HOME.text, background: on ? '#e8f1fd' : '#fff' }}
    >
      {color && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />}
      {children}
      {on && <span className="sr-only">（選択中）</span>}
    </button>
  );
}

export function DetailsDialog({
  project,
  subject,
  onSave,
  onClose,
}: {
  project: ProjectMeta | null;
  /** いま表示している教科（フォルダ名から決まったものも含む） */
  subject: string | null;
  onSave: (patch: DetailsPatch) => void;
  onClose: () => void;
}) {
  const [subj, setSubj] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [dueType, setDueType] = useState<DueType | null>(null);

  useEffect(() => {
    if (!project) return;
    setSubj(subject);
    setStatus(project.status ?? null);
    setDueDate(project.dueDate ?? '');
    setDueType(project.dueType ?? (project.dueDate ? null : 'submit'));
  }, [project, subject]);

  const auto = project ? statusOf({ writtenPages: project.writtenPages }) : 'todo';
  const save = () => {
    onSave({ subject: subj, status, dueDate: dueDate || null, dueType: dueDate ? dueType : null });
    onClose();
  };

  return (
    <Modal
      open={!!project}
      title="期限・教科・状態"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="tap min-h-11 rounded-xl bg-neutral-200/80 px-4 text-[15px] font-medium text-neutral-900 hover:bg-neutral-300/80">
            キャンセル
          </button>
          <button type="button" onClick={save} className="tap min-h-11 rounded-xl px-4 text-[15px] font-medium text-white" style={{ background: HOME.primary }}>
            保存
          </button>
        </>
      }
    >
      <p className="mb-4 truncate text-[14px]" style={{ color: HOME.muted }}>
        {project?.name}
      </p>

      <fieldset className="mb-5">
        <legend className="mb-2 text-[13px] font-semibold" style={{ color: HOME.text }}>
          期限
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="期限の日付"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              if (e.target.value && !dueType) setDueType('submit');
            }}
            className="h-11 min-w-0 rounded-xl border border-neutral-300 bg-white px-3 text-[16px] outline-none focus:border-[#0a5fcc]"
          />
          {dueDate && (
            <button type="button" onClick={() => setDueDate('')} className="tap min-h-11 rounded-xl px-3 text-[14px] text-[#c0161d] hover:bg-[#c0161d]/10">
              期限を消す
            </button>
          )}
        </div>
        {dueDate && (
          <div role="radiogroup" aria-label="期限の種類" className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(DUE_TYPE_LABEL) as DueType[]).map((t) => (
              <Chip key={t} on={dueType === t} onClick={() => setDueType(t)}>
                {DUE_TYPE_LABEL[t]}
              </Chip>
            ))}
            <Chip on={dueType === null} onClick={() => setDueType(null)}>
              指定なし
            </Chip>
          </div>
        )}
      </fieldset>

      <fieldset className="mb-5">
        <legend className="mb-2 text-[13px] font-semibold" style={{ color: HOME.text }}>
          教科
        </legend>
        <div role="radiogroup" aria-label="教科" className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <Chip key={s.name} on={subj === s.name} onClick={() => setSubj(s.name)} color={s.fg}>
              {s.name}
            </Chip>
          ))}
          {subj && !SUBJECTS.some((s) => s.name === subj) && (
            <Chip on onClick={() => undefined} color={subjectColor(subj).fg}>
              {subj}
            </Chip>
          )}
          <Chip on={subj === null} onClick={() => setSubj(null)} color={subjectColor(null).fg}>
            {UNCLASSIFIED}
          </Chip>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold" style={{ color: HOME.text }}>
          状態
        </legend>
        <div role="radiogroup" aria-label="状態" className="flex flex-wrap gap-2">
          <Chip on={status === null} onClick={() => setStatus(null)}>
            自動（{STATUS_LABEL[auto]}）
          </Chip>
          {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
            <Chip key={s} on={status === s} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: HOME.muted }}>
          「自動」は、書き込みがあれば「書き込み中」、なければ「未記入」になります。
        </p>
      </fieldset>
    </Modal>
  );
}
