// プロジェクトを「フォルダ」として書き出すときの名前・パスの扱い（保存先に依存しない部分）。

export const PROJECT_FILE = 'project.json';
export const FOLDER_FORMAT = 'mojiire-san-folder';

/** Windows・Mac・iPad のどれでも使えるフォルダ名・ファイル名にする */
export function safeDirName(name: string, fallback = 'プロジェクト'): string {
  const s = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);
  return s || fallback;
}

/** すでに使われている名前と重ならないように「名前 (2)」の形にする */
export function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base} (${i})`;
    if (!taken.has(n)) return n;
  }
}

export function imageExt(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'img';
}

export interface FoundProject {
  /** project.json を含むフォルダのパス（末尾の "/" なし。直下なら ""） */
  dir: string;
  /** その1つ上のフォルダ名（アプリ内フォルダに振り分けるため）。なければ null */
  parentName: string | null;
}

/** 読み込んだファイルの一覧から、プロジェクトのフォルダを探す */
export function findProjects(paths: string[]): FoundProject[] {
  const out: FoundProject[] = [];
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === '__MACOSX' || parts.at(-1) !== PROJECT_FILE) continue;
    const dirParts = parts.slice(0, -1);
    out.push({ dir: dirParts.join('/'), parentName: dirParts.length >= 2 ? dirParts[dirParts.length - 2] : null });
  }
  return out;
}

/** プロジェクトのフォルダ内のファイルを探す（見つからなければファイル名だけで探す） */
export function resolveInDir<T>(files: Map<string, T>, dir: string, rel: string): T | undefined {
  const full = dir ? `${dir}/${rel}` : rel;
  const hit = files.get(full);
  if (hit) return hit;
  const base = rel.split('/').at(-1)!;
  for (const [p, v] of files) {
    if (p.split('/').at(-1) === base && (!dir || p.startsWith(dir + '/') || !p.includes('/'))) return v;
  }
  return undefined;
}

/** 名前の先頭のことば（「数学 p.12」→「数学」）。整理の候補づくりに使う */
export function nameKey(name: string): string | null {
  const m = /^[^\s　_\-・:：.,，、。()（）[\]【】「」『』/／0-9０-９#＃]+/.exec(name.trim());
  if (!m) return null;
  const key = m[0].replace(/(p|P|ｐ|Ｐ|No|no|NO|第|page|Page)$/, '');
  return key.length ? key : null;
}

export interface Suggestion {
  name: string;
  projectIds: string[];
}

/** 名前の先頭が同じもの（2件以上）をまとめる候補 */
export function suggestByName(projects: { id: string; name: string }[]): Suggestion[] {
  const groups = new Map<string, string[]>();
  for (const p of projects) {
    const k = nameKey(p.name);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), p.id]);
  }
  return [...groups]
    .filter(([, ids]) => ids.length >= 2)
    .map(([name, projectIds]) => ({ name, projectIds }))
    .sort((a, b) => b.projectIds.length - a.projectIds.length);
}

/** 作成した月ごとにまとめる候補 */
export function suggestByMonth(projects: { id: string; createdAt: number }[]): Suggestion[] {
  const groups = new Map<string, { t: number; ids: string[] }>();
  for (const p of projects) {
    const d = new Date(p.createdAt);
    const k = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    const g = groups.get(k) ?? { t: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), ids: [] };
    g.ids.push(p.id);
    groups.set(k, g);
  }
  return [...groups].sort((a, b) => b[1].t - a[1].t).map(([name, g]) => ({ name, projectIds: g.ids }));
}
