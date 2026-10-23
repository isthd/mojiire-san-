// 数式テンプレート集：分野ごとのタブ・検索・最近使ったもの。各テンプレートは実際の数式の見た目で表示する。
import { Search, X } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { renderMathSvg } from '../../math/mathRenderer';
import {
  loadRecentTemplates,
  pushRecentTemplate,
  searchTemplates,
  TEMPLATE_GROUPS,
  toPreviewLatex,
  type TemplateItem,
} from '../../math/templates';
import { cx } from '../ui/primitives';

const RECENT = 'recent';
const THUMB_MAX_W = 134;
const THUMB_MAX_H = 52;

// サムネイル SVG のキャッシュ（ダイアログを開き直しても再計算しない）
const thumbCache = new Map<string, Promise<string>>();

function thumbSvg(latex: string): Promise<string> {
  let p = thumbCache.get(latex);
  if (!p) {
    p = renderMathSvg(toPreviewLatex(latex), 17, '#1f2937').then((r) => {
      const scale = Math.min(1, THUMB_MAX_W / r.width, THUMB_MAX_H / r.height);
      const w = (r.width * scale).toFixed(1);
      const h = (r.height * scale).toFixed(1);
      return r.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${w}" height="${h}"`);
    });
    p.catch(() => thumbCache.delete(latex));
    thumbCache.set(latex, p);
  }
  return p;
}

const Thumb = memo(function Thumb({ latex }: { latex: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    thumbSvg(latex).then(
      (s) => alive && setSvg(s),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [latex]);
  if (failed) return <span className="text-xs text-neutral-400">—</span>;
  if (!svg) return <span className="h-4 w-16 animate-pulse rounded bg-neutral-200" />;
  return <span className="pointer-events-none flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
});

export function MathTemplatePanel({ onPick }: { onPick: (item: TemplateItem) => void }) {
  const [recent, setRecent] = useState<TemplateItem[]>(() => loadRecentTemplates());
  const [group, setGroup] = useState<string>(() => (loadRecentTemplates().length ? RECENT : TEMPLATE_GROUPS[0].key));
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    if (query.trim()) return searchTemplates(query);
    if (group === RECENT) return recent;
    return TEMPLATE_GROUPS.find((g) => g.key === group)?.items ?? [];
  }, [query, group, recent]);

  const pick = (it: TemplateItem) => {
    setRecent(pushRecentTemplate(it));
    onPick(it);
  };

  const chips = [...(recent.length ? [{ key: RECENT, label: '最近' }] : []), ...TEMPLATE_GROUPS];

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <div className="text-xs font-semibold text-neutral-500">テンプレート</div>
        <label className="relative ml-auto w-full max-w-[260px]">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="公式を検索（例：かいのこうしき）"
            aria-label="テンプレートを検索"
            className="h-9 w-full rounded-lg border border-neutral-300 pr-8 pl-8 text-[13px] outline-none focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/25"
          />
          {query && (
            <button
              type="button"
              aria-label="検索をクリア"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      {!query.trim() && (
        <div className="no-scrollbar -mx-1 mb-2 flex gap-1 overflow-x-auto px-1">
          {chips.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              className={cx(
                'tap h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium',
                group === g.key ? 'bg-[#0a84ff] text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
          {query.trim() ? '見つかりませんでした。別のことばで探してみてください。' : 'まだありません。'}
        </p>
      ) : (
        <div className="grid max-h-[300px] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
          {items.map((it) => (
            <button
              key={it.latex}
              type="button"
              title={it.label}
              aria-label={`テンプレート：${it.label}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(it)}
              className="tap flex min-h-[86px] flex-col items-stretch gap-1 rounded-lg border border-neutral-200 bg-white p-1.5 hover:border-[#0a84ff] hover:bg-[#0a84ff]/5 active:bg-[#0a84ff]/10"
            >
              <span className="flex flex-1 items-center justify-center overflow-hidden">
                <Thumb latex={it.latex} />
              </span>
              <span className="truncate text-center text-[11.5px] leading-tight text-neutral-600">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
