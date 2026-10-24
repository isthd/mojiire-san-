import { describe, expect, it } from 'vitest';
import { findProjects, nameKey, resolveInDir, safeDirName, suggestByMonth, suggestByName, uniqueName } from './folderLayout';

describe('folderLayout', () => {
  it('makes safe names', () => {
    expect(safeDirName('数学: 1/2?')).toBe('数学_ 1_2_');
    expect(safeDirName('abc. ')).toBe('abc');
    expect(safeDirName('  ')).toBe('プロジェクト');
  });

  it('avoids name collisions', () => {
    expect(uniqueName('a', new Set())).toBe('a');
    expect(uniqueName('a', new Set(['a', 'a (2)']))).toBe('a (3)');
  });

  it('finds projects and their parent folder', () => {
    const found = findProjects([
      '数学/プリント1/project.json',
      '数学/プリント1/images/01.png',
      'プリント2/project.json',
      'project.json',
      '__MACOSX/数学/project.json',
    ]);
    expect(found).toEqual([
      { dir: '数学/プリント1', parentName: '数学' },
      { dir: 'プリント2', parentName: null },
      { dir: '', parentName: null },
    ]);
  });

  it('resolves files inside a project folder', () => {
    const files = new Map([
      ['A/images/01.png', 1],
      ['B/images/01.png', 2],
      ['02.png', 3],
    ]);
    expect(resolveInDir(files, 'B', 'images/01.png')).toBe(2);
    expect(resolveInDir(files, '', 'images/02.png')).toBe(3);
  });

  it('suggests folders by name', () => {
    expect(nameKey('数学 p.12')).toBe('数学');
    expect(nameKey('数学p12')).toBe('数学');
    expect(nameKey('英語_単語')).toBe('英語');
    expect(nameKey('123')).toBeNull();
    const s = suggestByName([
      { id: '1', name: '数学 p.12' },
      { id: '2', name: '数学 p.13' },
      { id: '3', name: '英語 1' },
    ]);
    expect(s).toEqual([{ name: '数学', projectIds: ['1', '2'] }]);
  });

  it('suggests folders by month', () => {
    const s = suggestByMonth([
      { id: '1', createdAt: new Date(2026, 8, 3).getTime() },
      { id: '2', createdAt: new Date(2026, 9, 1).getTime() },
      { id: '3', createdAt: new Date(2026, 9, 20).getTime() },
    ]);
    expect(s).toEqual([
      { name: '2026年10月', projectIds: ['2', '3'] },
      { name: '2026年9月', projectIds: ['1'] },
    ]);
  });
});
