import { describe, expect, it, vi } from 'vitest';

vi.mock('../export/renderPage', () => ({ renderThumbnail: vi.fn() }));
vi.mock('./db', () => ({ getDB: vi.fn() }));
vi.mock('./projectRepo', () => ({ getProjectImages: vi.fn(), getProjectMeta: vi.fn(), loadDocument: vi.fn() }));
vi.mock('./folderRepo', () => ({ findOrCreateFolder: vi.fn(), listFolders: vi.fn() }));
vi.mock('./backup', () => ({ importBackup: vi.fn() }));

import type { DirHandle } from './fsAccess';
import { writeBundles, type ProjectBundle } from './projectFolder';

/** File System Access API の最小限の偽物（メモリ上のフォルダ） */
class FakeDir {
  kind = 'directory' as const;
  files = new Map<string, Blob>();
  dirs = new Map<string, FakeDir>();
  /** この回数だけ書けたら、次の書き込みで失敗する */
  static failAfter = Infinity;
  static writes = 0;
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    if (this.files.has(name)) throw new DOMException('file', 'TypeMismatchError');
    let d = this.dirs.get(name);
    if (!d) {
      if (!opts?.create) throw new DOMException('none', 'NotFoundError');
      d = new FakeDir(name);
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name) && !opts?.create) throw new DOMException('none', 'NotFoundError');
    return {
      kind: 'file' as const,
      name,
      getFile: async () => this.files.get(name) ?? new Blob([]),
      createWritable: async () => {
        let data: Blob = new Blob([]);
        return {
          write: async (b: Blob) => {
            if (FakeDir.writes++ >= FakeDir.failAfter) throw new DOMException('full', 'QuotaExceededError');
            data = b;
          },
          // 実際のブラウザと同じく、close したときに中身が入れ替わる
          close: async () => void this.files.set(name, data),
        };
      },
    };
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name) && !this.dirs.delete(name)) throw new DOMException('none', 'NotFoundError');
  }
  async *values() {
    for (const d of this.dirs.values()) yield d;
    for (const name of this.files.keys()) yield { kind: 'file' as const, name };
  }
}

const text = (s: string) => new Blob([s]);

function bundle(images: string[]): ProjectBundle {
  const project = {
    format: 'mojiire-san-project',
    version: 1,
    id: 'p1',
    name: 'テスト',
    createdAt: 0,
    updatedAt: 0,
    savedAt: 0,
    images: images.map((_, i) => ({ id: `img${i}`, file: `images/0${i + 1}.png`, width: 1, height: 1 })),
    doc: { pages: [] },
  } as unknown as ProjectBundle['project'];
  return {
    id: 'p1',
    name: 'テスト',
    folderName: null,
    project,
    files: [
      { path: 'project.json', data: text(JSON.stringify(project)) },
      ...images.map((c, i) => ({ path: `images/0${i + 1}.png`, data: text(c) })),
      { path: 'README.txt', data: text('readme') },
    ],
  };
}

async function readProject(root: FakeDir) {
  const dir = root.dirs.get('テスト')!;
  const json = JSON.parse(await dir.files.get('project.json')!.text());
  const images = dir.dirs.get('images')!;
  return Promise.all(
    json.images.map(async (i: { file: string }) => {
      const blob = images.files.get(i.file.replace('images/', ''));
      return blob ? blob.text() : null;
    }),
  );
}

describe('writeBundles（フォルダへ上書き）', () => {
  it('上書きすると新しい画像に切り替わり、使わなくなった画像は消える', async () => {
    FakeDir.failAfter = Infinity;
    const root = new FakeDir('root');
    await writeBundles(root as unknown as DirHandle, [bundle(['A', 'B', 'C'])]);
    await writeBundles(root as unknown as DirHandle, [bundle(['X'])]);
    expect(await readProject(root)).toEqual(['X']);
    expect(root.dirs.get('テスト')!.dirs.get('images')!.files.size).toBe(1);
    await writeBundles(root as unknown as DirHandle, [bundle(['Y', 'Z'])]);
    expect(await readProject(root)).toEqual(['Y', 'Z']);
    expect(root.dirs.get('テスト')!.dirs.get('images')!.files.size).toBe(2);
  });

  it('途中で書き込みに失敗しても、前回の保存はそのまま読める', async () => {
    FakeDir.failAfter = Infinity;
    const root = new FakeDir('root');
    await writeBundles(root as unknown as DirHandle, [bundle(['A', 'B'])]);
    for (let n = 0; n < 4; n++) {
      FakeDir.writes = 0;
      FakeDir.failAfter = n;
      await expect(writeBundles(root as unknown as DirHandle, [bundle(['X', 'Y', 'Z'])])).rejects.toThrow();
      expect(await readProject(root)).toEqual(['A', 'B']);
    }
  });
});
