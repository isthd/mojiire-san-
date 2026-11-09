// ホーム画面の一覧の計算（状態の判定・期限・並び替え・日付ごとのグループ分け・検索）。画面に依存しない純粋な関数。
import { isEmptyText, type DueType, type ProjectDoc, type ProjectMeta, type ProjectStatus } from '../types/model';
import { inferSubject, subjectFromFolderName, subjectOrder, UNCLASSIFIED } from './subjects';

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  todo: '未記入',
  doing: '書き込み中',
  done: '完了',
};

export const DUE_TYPE_LABEL: Record<DueType, string> = {
  test: 'テスト',
  submit: '提出',
};

/** 期限が近いとみなす日数（今日から数えて、この日数以内なら赤字） */
export const DUE_SOON_DAYS = 3;

/** 書き込みのあるページ数（未入力の「ダブルタップで入力」の枠だけのページは数えない） */
export function countWrittenPages(doc: ProjectDoc): number {
  return doc.pages.filter((p) => p.objects.some((o) => !isEmptyText(o))).length;
}

/** 状態（未設定なら書き込みの有無から判定） */
export function statusOf(p: Pick<ProjectMeta, 'status' | 'writtenPages'>): ProjectStatus {
  if (p.status) return p.status;
  return (p.writtenPages ?? 0) > 0 ? 'doing' : 'todo';
}

/**
 * 教科。未分類なら null。
 * まだ決めていない（undefined）ものは、教科名と同じ名前のフォルダに入っていればその教科として扱う。
 */
export function subjectOf(p: Pick<ProjectMeta, 'subject' | 'folderId'>, folderName: (id: string) => string | undefined): string | null {
  if (p.subject !== undefined) return p.subject || null;
  return p.folderId ? subjectFromFolderName(folderName(p.folderId)) : null;
}

export function subjectLabel(subject: string | null): string {
  return subject ?? UNCLASSIFIED;
}

/** "YYYY-MM-DD"（端末の日付） */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" を端末の日付の 0 時に。形式が違えば null */
export function parseDateKey(key: string | null | undefined): Date | null {
  const m = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 今日から期限までの日数（今日 = 0、明日 = 1、過ぎていれば負） */
export function daysUntil(dueDate: string, now: Date): number | null {
  const d = parseDateKey(dueDate);
  if (!d) return null;
  // 夏時間の切り替えがあっても日数がずれないよう丸める
  return Math.round((d.getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** 期限が近い（3日以内・過ぎたものも含む）。完了したものは対象外 */
export function isDueSoon(p: Pick<ProjectMeta, 'dueDate' | 'status' | 'writtenPages'>, now: Date): boolean {
  if (!p.dueDate || statusOf(p) === 'done') return false;
  const n = daysUntil(p.dueDate, now);
  return n !== null && n <= DUE_SOON_DAYS;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 「11/12（木）」。今年でなければ年もつける */
export function formatDueDate(dueDate: string, now: Date): string | null {
  const d = parseDateKey(dueDate);
  if (!d) return null;
  const md = `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

/** カードに出す期限の文（「テスト 11/12（木）」「提出 11/13（金）」「期限なし」） */
export function dueText(p: Pick<ProjectMeta, 'dueDate' | 'dueType'>, now: Date): string {
  const date = p.dueDate ? formatDueDate(p.dueDate, now) : null;
  if (!date) return '期限なし';
  return `${p.dueType ? DUE_TYPE_LABEL[p.dueType] : '期限'} ${date}`;
}

export type HomeSort = 'due' | 'updated' | 'created' | 'name';

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

export function sortProjects<T extends ProjectMeta>(list: T[], sort: HomeSort): T[] {
  const out = [...list];
  if (sort === 'name') out.sort((a, b) => collator.compare(a.name, b.name));
  else if (sort === 'created') out.sort((a, b) => b.createdAt - a.createdAt);
  else if (sort === 'updated') out.sort((a, b) => b.updatedAt - a.updatedAt);
  else {
    // 期限が近い順。期限のないものは後ろに更新の新しい順
    out.sort((a, b) => {
      const da = parseDateKey(a.dueDate)?.getTime() ?? Infinity;
      const db = parseDateKey(b.dueDate)?.getTime() ?? Infinity;
      if (da !== db) return da < db ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }
  return out;
}

export type DateGroupLabel = '今日' | '今週' | 'それ以前';

/**
 * 日付で「今日／今週／それ以前」に分ける（空のグループは返さない。各グループ内の順は保つ）。
 * 今週 = 昨日から6日前まで（今日を含めて7日間）。
 */
export function groupByDate<T>(list: T[], timeOf: (p: T) => number, now: Date): { label: DateGroupLabel; items: T[] }[] {
  const today = startOfDay(now).getTime();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const groups: Record<DateGroupLabel, T[]> = { 今日: [], 今週: [], それ以前: [] };
  for (const p of list) {
    const t = timeOf(p);
    if (t >= today) groups['今日'].push(p);
    else if (t >= weekStart.getTime()) groups['今週'].push(p);
    else groups['それ以前'].push(p);
  }
  return (['今日', '今週', 'それ以前'] as const).filter((k) => groups[k].length).map((label) => ({ label, items: groups[label] }));
}

/** 「続きから」：書き込み中のものを更新の新しい順に最大 limit 件 */
export function continueList<T extends ProjectMeta>(list: T[], limit = 3): T[] {
  return list
    .filter((p) => statusOf(p) === 'doing')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/** 検索用に正規化（全角・半角、大文字・小文字、空白の違いを無視） */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export interface SearchKey {
  name: string;
  text: string;
}

/** 検索用に名前と中身を正規化しておく（入力のたびに長い本文を変換しないため） */
export function searchKey(p: Pick<ProjectMeta, 'name' | 'ocrText'>): SearchKey {
  return { name: normalizeForSearch(p.name), text: p.ocrText ? normalizeForSearch(p.ocrText) : '' };
}

/** 正規化済みの検索語 q に一致するか。どこに一致したか（名前／プリントの中身）。一致しなければ null */
export function matchKey(key: SearchKey, q: string): 'name' | 'text' | null {
  if (!q || key.name.includes(q)) return 'name';
  if (key.text.includes(q)) return 'text';
  return null;
}

/** 検索に一致するか。どこに一致したか（名前／プリントの中身）を返す。一致しなければ null */
export function matchQuery(p: Pick<ProjectMeta, 'name' | 'ocrText'>, query: string): 'name' | 'text' | null {
  return matchKey(searchKey(p), normalizeForSearch(query));
}

/** フォルダ・バックアップに一緒に保存する整理用の項目 */
export type ExtraMeta = Pick<ProjectMeta, 'subject' | 'status' | 'dueDate' | 'dueType' | 'autoNamed' | 'ocrText'>;

const STATUSES: readonly string[] = ['todo', 'doing', 'done'];
const DUE_TYPES: readonly string[] = ['test', 'submit'];

/** 保存する整理用の項目を取り出す（未定義の項目は含めない） */
export function pickExtraMeta(m: Partial<ProjectMeta>): ExtraMeta {
  const out: ExtraMeta = {};
  if (m.subject !== undefined) out.subject = m.subject;
  if (m.status) out.status = m.status;
  if (m.dueDate) out.dueDate = m.dueDate;
  if (m.dueType) out.dueType = m.dueType;
  if (m.autoNamed) out.autoNamed = true;
  if (m.ocrText) out.ocrText = m.ocrText;
  return out;
}

/** 読み込んだファイルの整理用の項目を確かめて取り出す（形式が違うものは捨てる） */
export function readExtraMeta(raw: unknown): ExtraMeta {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: ExtraMeta = {};
  if (r.subject === null || (typeof r.subject === 'string' && r.subject.trim())) out.subject = r.subject === null ? null : (r.subject as string).trim().slice(0, 20);
  if (typeof r.status === 'string' && STATUSES.includes(r.status)) out.status = r.status as ProjectStatus;
  if (typeof r.dueDate === 'string' && parseDateKey(r.dueDate)) out.dueDate = r.dueDate;
  if (typeof r.dueType === 'string' && DUE_TYPES.includes(r.dueType)) out.dueType = r.dueType as DueType;
  if (r.autoNamed === true) out.autoNamed = true;
  if (typeof r.ocrText === 'string' && r.ocrText) out.ocrText = r.ocrText.slice(0, 20000);
  return out;
}

/** 「おまかせで分ける」：名前とプリントの中身から教科を推定し、教科ごとにまとめる候補 */
export function suggestBySubject(projects: Pick<ProjectMeta, 'id' | 'name' | 'ocrText'>[]): { name: string; projectIds: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const p of projects) {
    const s = inferSubject(p.name, p.ocrText ?? '');
    if (s) groups.set(s, [...(groups.get(s) ?? []), p.id]);
  }
  return [...groups]
    .map(([name, projectIds]) => ({ name, projectIds }))
    .sort((a, b) => b.projectIds.length - a.projectIds.length || subjectOrder(a.name) - subjectOrder(b.name));
}
