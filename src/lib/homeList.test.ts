import { describe, expect, it } from 'vitest';
import type { EditorObject, Page, ProjectMeta, TextObject } from '../types/model';
import {
  continueList,
  countWrittenPages,
  daysUntil,
  dueText,
  groupByDate,
  isDueSoon,
  matchQuery,
  parseDateKey,
  pickExtraMeta,
  readExtraMeta,
  sortProjects,
  statusOf,
  subjectOf,
  suggestBySubject,
  toDateKey,
} from './homeList';

// 2026-11-09（月）10:00
const NOW = new Date(2026, 10, 9, 10, 0);
const DAY = 86_400_000;

function meta(over: Partial<ProjectMeta> = {}): ProjectMeta {
  return { id: over.id ?? Math.random().toString(36), name: 'p', createdAt: 0, updatedAt: 0, pageCount: 1, thumbnail: null, ...over };
}

function text(t: string): TextObject {
  return {
    id: 't', type: 'text', x: 0, y: 0, rotation: 0, opacity: 1, text: t, fontFamily: 'gothic', fontSize: 10,
    color: '#000', bold: false, italic: false, align: 'left', background: null, outlineColor: null, outlineWidth: 0,
  };
}
function page(objects: EditorObject[]): Page {
  return { id: 'p', imageId: 'i', width: 10, height: 10, unit: 1, objects };
}

describe('status', () => {
  it('derives status from writing when unset', () => {
    expect(statusOf({})).toBe('todo');
    expect(statusOf({ writtenPages: 0 })).toBe('todo');
    expect(statusOf({ writtenPages: 2 })).toBe('doing');
    expect(statusOf({ writtenPages: 2, status: 'done' })).toBe('done');
    expect(statusOf({ writtenPages: 0, status: 'doing' })).toBe('doing');
    expect(statusOf({ writtenPages: 3, status: null })).toBe('doing');
  });

  it('counts pages with real writing (empty answer fields do not count)', () => {
    const pen = { ...text(''), type: 'pen', points: [0, 0, 1, 1], strokeWidth: 1 } as unknown as EditorObject;
    expect(countWrittenPages({ pages: [] })).toBe(0);
    expect(countWrittenPages({ pages: [page([]), page([text('  ')]), page([text('答え')]), page([pen])] })).toBe(2);
  });
});

describe('subjectOf', () => {
  const folders = new Map([['f1', '化学'], ['f2', '2026年4月']]);
  const name = (id: string) => folders.get(id);
  it('uses the explicit subject, null meaning 未分類', () => {
    expect(subjectOf({ subject: '数学', folderId: 'f1' }, name)).toBe('数学');
    expect(subjectOf({ subject: null, folderId: 'f1' }, name)).toBe(null);
  });
  it('falls back to a folder named after a subject when never set', () => {
    expect(subjectOf({ folderId: 'f1' }, name)).toBe('化学');
    expect(subjectOf({ folderId: 'f2' }, name)).toBe(null);
    expect(subjectOf({ folderId: 'gone' }, name)).toBe(null);
    expect(subjectOf({}, name)).toBe(null);
  });
});

describe('due dates', () => {
  it('parses and formats date keys', () => {
    expect(toDateKey(NOW)).toBe('2026-11-09');
    expect(parseDateKey('2026-11-12')?.getDate()).toBe(12);
    expect(parseDateKey('11/12')).toBe(null);
    expect(parseDateKey(null)).toBe(null);
  });

  it('counts days from today', () => {
    expect(daysUntil('2026-11-09', NOW)).toBe(0);
    expect(daysUntil('2026-11-12', NOW)).toBe(3);
    expect(daysUntil('2026-11-08', NOW)).toBe(-1);
    expect(daysUntil('2026-12-01', NOW)).toBe(22);
    expect(daysUntil('bad', NOW)).toBe(null);
  });

  it('is "soon" within 3 days, including overdue, but not when done', () => {
    expect(isDueSoon({ dueDate: '2026-11-12' }, NOW)).toBe(true);
    expect(isDueSoon({ dueDate: '2026-11-13' }, NOW)).toBe(false);
    expect(isDueSoon({ dueDate: '2026-11-09' }, NOW)).toBe(true);
    expect(isDueSoon({ dueDate: '2026-11-01' }, NOW)).toBe(true);
    expect(isDueSoon({ dueDate: '2026-11-10', status: 'done' }, NOW)).toBe(false);
    expect(isDueSoon({ dueDate: null }, NOW)).toBe(false);
    expect(isDueSoon({}, NOW)).toBe(false);
  });

  it('formats like the mockup', () => {
    expect(dueText({ dueDate: '2026-11-12', dueType: 'test' }, NOW)).toBe('テスト 11/12（木）');
    expect(dueText({ dueDate: '2026-11-13', dueType: 'submit' }, NOW)).toBe('提出 11/13（金）');
    expect(dueText({ dueDate: '2026-11-16' }, NOW)).toBe('期限 11/16（月）');
    expect(dueText({ dueDate: '2027-01-05', dueType: 'submit' }, NOW)).toBe('提出 2027/1/5（火）');
    expect(dueText({}, NOW)).toBe('期限なし');
    expect(dueText({ dueDate: 'oops' }, NOW)).toBe('期限なし');
  });
});

describe('sorting and grouping', () => {
  const a = meta({ id: 'a', name: 'b2', dueDate: '2026-11-13', updatedAt: 5, createdAt: 1 });
  const b = meta({ id: 'b', name: 'b10', dueDate: '2026-11-12', updatedAt: 1, createdAt: 3 });
  const c = meta({ id: 'c', name: 'a', updatedAt: 9, createdAt: 2 });
  const d = meta({ id: 'd', name: 'c', updatedAt: 3, createdAt: 4 });

  it('sorts by due date with undated items last (newest first)', () => {
    expect(sortProjects([c, a, d, b], 'due').map((p) => p.id)).toEqual(['b', 'a', 'c', 'd']);
  });
  it('sorts by updated / created / name (natural order)', () => {
    expect(sortProjects([a, b, c, d], 'updated').map((p) => p.id)).toEqual(['c', 'a', 'd', 'b']);
    expect(sortProjects([a, b, c, d], 'created').map((p) => p.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(sortProjects([a, b, c, d], 'name').map((p) => p.id)).toEqual(['c', 'a', 'b', 'd']);
  });
  it('does not mutate its input', () => {
    const list = [a, b];
    sortProjects(list, 'due');
    expect(list[0]).toBe(a);
  });

  it('groups into 今日／今週／それ以前 and keeps order', () => {
    const today0 = new Date(2026, 10, 9).getTime();
    const items = [
      { id: 'now', t: NOW.getTime() },
      { id: 'midnight', t: today0 },
      { id: 'justBefore', t: today0 - 1 },
      { id: 'sixDays', t: today0 - 6 * DAY },
      { id: 'sevenDays', t: today0 - 6 * DAY - 1 },
      { id: 'future', t: NOW.getTime() + DAY },
    ];
    const g = groupByDate(items, (x) => x.t, NOW);
    expect(g.map((x) => [x.label, x.items.map((i) => i.id)])).toEqual([
      ['今日', ['now', 'midnight', 'future']],
      ['今週', ['justBefore', 'sixDays']],
      ['それ以前', ['sevenDays']],
    ]);
  });
  it('omits empty groups', () => {
    expect(groupByDate([], () => 0, NOW)).toEqual([]);
    expect(groupByDate([{ t: 0 }], (x) => x.t, NOW).map((x) => x.label)).toEqual(['それ以前']);
  });
});

describe('continueList', () => {
  it('shows up to 3 in-progress items, newest first', () => {
    const list = [
      meta({ id: '1', writtenPages: 1, updatedAt: 1 }),
      meta({ id: '2', writtenPages: 0, updatedAt: 9 }),
      meta({ id: '3', writtenPages: 2, updatedAt: 5 }),
      meta({ id: '4', writtenPages: 1, updatedAt: 7, status: 'done' }),
      meta({ id: '5', writtenPages: 0, updatedAt: 8, status: 'doing' }),
      meta({ id: '6', writtenPages: 1, updatedAt: 3 }),
    ];
    expect(continueList(list).map((p) => p.id)).toEqual(['5', '3', '6']);
    expect(continueList([])).toEqual([]);
  });
});

describe('search', () => {
  it('matches the name or the read text, ignoring width, case and spaces', () => {
    const p = { name: '文法演習 助動詞', ocrText: '次の英文の can を\n書きかえなさい。Lesson ３' };
    expect(matchQuery(p, '助動詞')).toBe('name');
    expect(matchQuery(p, '文法 演習')).toBe('name');
    expect(matchQuery(p, 'CAN')).toBe('text');
    expect(matchQuery(p, 'lesson3')).toBe('text');
    expect(matchQuery(p, '書きかえ')).toBe('text');
    expect(matchQuery(p, '漢字')).toBe(null);
    expect(matchQuery({ name: 'x' }, 'y')).toBe(null);
    expect(matchQuery({ name: 'x' }, '   ')).toBe('name');
  });
});

describe('extra meta (folder / backup round trip)', () => {
  it('keeps only set fields', () => {
    expect(pickExtraMeta({ name: 'x' } as Partial<ProjectMeta>)).toEqual({});
    expect(pickExtraMeta({ subject: null, status: null, autoNamed: false, ocrText: '' })).toEqual({ subject: null });
    const full = { subject: '化学', status: 'done', dueDate: '2026-11-12', dueType: 'test', autoNamed: true, ocrText: 'モル' } as const;
    expect(readExtraMeta(JSON.parse(JSON.stringify(pickExtraMeta(full))))).toEqual(full);
  });
  it('drops invalid values from files', () => {
    expect(readExtraMeta(undefined)).toEqual({});
    expect(readExtraMeta('x')).toEqual({});
    expect(readExtraMeta({ subject: 3, status: 'maybe', dueDate: '12/1', dueType: 'exam', autoNamed: 'yes', ocrText: 5 })).toEqual({});
    expect(readExtraMeta({ subject: '  ' })).toEqual({});
    expect(readExtraMeta({ subject: null })).toEqual({ subject: null });
  });
});

describe('suggestBySubject', () => {
  it('groups by inferred subject and skips unknowns', () => {
    const s = suggestBySubject([
      { id: '1', name: '化学基礎 予想問題' },
      { id: '2', name: 'プリント 11/9', ocrText: 'モルと元素、イオンについて' },
      { id: '3', name: 'IMG_0001' },
      { id: '4', name: '漢字練習 第8回' },
    ]);
    expect(s).toEqual([
      { name: '化学', projectIds: ['1', '2'] },
      { name: '国語', projectIds: ['4'] },
    ]);
  });
});
