// 「おまかせ整理」：未分類のプロジェクトを、名前の先頭や作成月でフォルダにまとめる候補、
// または名前とプリントの中身から推定した教科ごとに分ける候補を出す
import { BookOpen, Check, Folder as FolderIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { suggestByMonth, suggestByName, type Suggestion } from '../../lib/folderLayout';
import { suggestBySubject } from '../../lib/homeList';
import { subjectColor } from '../../lib/subjects';
import type { Folder, ProjectMeta } from '../../types/model';
import { Button, cx, Modal, Segmented } from '../ui/primitives';

export type OrganizeMode = 'subject' | 'name' | 'month';

/** 既定値は毎回同じ配列にする（新しい配列だと候補の計算と選択状態の更新が繰り返される） */
const NO_PROJECTS: ProjectMeta[] = [];
type Mode = OrganizeMode;

export function OrganizeDialog({
  open,
  projects,
  subjectProjects = NO_PROJECTS,
  folders,
  initialMode = 'name',
  onApply,
  onApplySubjects,
  onClose,
}: {
  open: boolean;
  /** フォルダにまとめる対象（どのフォルダにも入っていないプロジェクト） */
  projects: ProjectMeta[];
  /** 教科ごとに分ける対象（教科が未分類のプロジェクト） */
  subjectProjects?: ProjectMeta[];
  folders: Folder[];
  /** 開いたときのまとめ方 */
  initialMode?: Mode;
  onApply: (groups: Suggestion[]) => void;
  /** 教科ごとに分ける（name = 教科） */
  onApplySubjects?: (groups: Suggestion[]) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);
  const bySubject = mode === 'subject';
  const targets = bySubject ? subjectProjects : projects;
  const suggestions = useMemo(
    () => (mode === 'subject' ? suggestBySubject(subjectProjects) : mode === 'name' ? suggestByName(projects) : suggestByMonth(projects)),
    [mode, projects, subjectProjects],
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setChecked(new Set(suggestions.map((s) => s.name)));
  }, [suggestions]);

  const names = new Map(targets.map((p) => [p.id, p.name]));
  const existing = new Set(folders.map((f) => f.name));
  const chosen = suggestions.filter((s) => checked.has(s.name));
  const moveCount = chosen.reduce((n, s) => n + s.projectIds.length, 0);

  return (
    <Modal
      open={open}
      title="おまかせ整理"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button
            variant="primary"
            disabled={!moveCount}
            onClick={() => {
              if (bySubject) onApplySubjects?.(chosen);
              else onApply(chosen);
              onClose();
            }}
          >
            {bySubject ? '教科を設定' : 'まとめる'}（{moveCount}件）
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-neutral-600">
        {bySubject
          ? '教科が未分類のプリントを、名前と読み取った中身から教科ごとに分けます。分けるものを選んでください。'
          : 'フォルダに入っていないプロジェクトを、フォルダにまとめます。まとめるものを選んでください。'}
      </p>
      <Segmented<Mode>
        ariaLabel="まとめ方"
        value={mode}
        onChange={setMode}
        options={[
          // 以前のデザイン（教科なし）では教科ごとの整理は出さない
          ...(onApplySubjects ? [{ value: 'subject' as const, label: '教科ごと' }] : []),
          { value: 'name', label: '名前が似ているもの' },
          { value: 'month', label: '作った月ごと' },
        ]}
      />
      <div className="mt-3 space-y-1.5">
        {!suggestions.length && (
          <p className="rounded-xl bg-neutral-100 px-4 py-6 text-center text-[14px] text-neutral-500">
            {bySubject
              ? subjectProjects.length
                ? '名前や中身から教科を判断できませんでした。カードの「…」→「期限・教科を設定」で教科を選べます。'
                : '教科が未分類のプリントはありません。'
              : projects.length
                ? '名前の先頭が同じプロジェクトが見つかりませんでした。「作った月ごと」も試してください。'
                : 'フォルダに入っていないプロジェクトはありません。'}
          </p>
        )}
        {suggestions.map((s) => {
          const on = checked.has(s.name);
          return (
            <button
              key={s.name}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (on) next.delete(s.name);
                  else next.add(s.name);
                  return next;
                })
              }
              className={cx(
                'tap flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition',
                on ? 'bg-[#0a84ff]/8 ring-[#0a84ff]' : 'ring-neutral-200',
              )}
            >
              <span
                className={cx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
                  on ? 'border-[#0a84ff] bg-[#0a84ff] text-white' : 'border-neutral-300 text-transparent',
                )}
              >
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                  {bySubject ? (
                    <BookOpen size={16} style={{ color: subjectColor(s.name).fg }} aria-hidden />
                  ) : (
                    <FolderIcon size={16} className="text-[#0a84ff]" aria-hidden />
                  )}
                  <span className="truncate">{s.name}</span>
                  <span className="shrink-0 text-[12px] font-normal text-neutral-500">
                    {s.projectIds.length}件{!bySubject && existing.has(s.name) && '・今あるフォルダに追加'}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-neutral-500">
                  {s.projectIds.map((id) => names.get(id)).join('、')}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
