// 新機能のお知らせ。起動時にまだ見ていない新機能があれば表示し、ホームや「…」からも見返せる。
import { MousePointerClick, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';
import { LATEST_NEWS_ID, readSeenNews, unseenNews, writeSeenNews, type NewsEntry } from '../../lib/news';
import { listProjects } from '../../storage/projectRepo';
import { Button, Modal } from './primitives';

interface NewsState {
  /** 表示中の項目（null で閉じている） */
  entries: NewsEntry[] | null;
  /** 新着として開いたか（見出しを変える） */
  fresh: boolean;
  show: (entries: NewsEntry[], fresh: boolean) => void;
  close: () => void;
}

export const useNews = create<NewsState>()((set) => ({
  entries: null,
  fresh: false,
  show: (entries, fresh) => set({ entries, fresh }),
  close: () => {
    writeSeenNews(LATEST_NEWS_ID);
    set({ entries: null });
  },
}));

/** すべてのお知らせを開く */
export const openAllNews = () => useNews.getState().show(unseenNews(-Infinity), false);

/** 起動時に一度だけ：まだ見ていない新機能があれば表示する */
async function showUnseenOnStartup() {
  let seen = readSeenNews();
  if (seen === null) {
    // 記録がない：初めて使う人には出さない。お知らせ機能より前から使っている人には最新の1件を出す
    const projects = await listProjects().catch(() => []);
    if (projects.length === 0) {
      writeSeenNews(LATEST_NEWS_ID);
      return;
    }
    seen = LATEST_NEWS_ID - 1;
  }
  const list = unseenNews(seen);
  if (list.length) useNews.getState().show(list, true);
}

const fmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

export function NewsDialog() {
  const entries = useNews((s) => s.entries);
  const fresh = useNews((s) => s.fresh);
  const close = useNews((s) => s.close);

  useEffect(() => {
    void showUnseenOnStartup();
  }, []);

  return (
    <Modal
      open={!!entries}
      title={fresh ? '新しい機能が使えるようになりました' : 'お知らせ'}
      onClose={close}
      footer={<Button onClick={close}>OK</Button>}
    >
      {entries && entries.length === 0 && <p className="text-[15px] text-neutral-500">お知らせはありません。</p>}
      <div className="space-y-6">
        {entries?.map((n) => (
          <section key={n.id}>
            <div className="mb-2 text-[12px] font-medium text-neutral-500">{fmt.format(new Date(`${n.date}T00:00:00`))}</div>
            <div className="space-y-4">
              {n.features.map((f) => (
                <div key={f.title} className="rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                  <h3 className="mb-2 flex items-center gap-2 text-[16px] font-semibold">
                    <Sparkles size={18} className="shrink-0 text-[#0a84ff]" />
                    {f.title}
                  </h3>
                  <div className="mb-1 text-[13px] font-semibold text-neutral-600">使いかた</div>
                  <ul className="mb-3 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
                    {f.how.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <div className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-neutral-600">
                    <MousePointerClick size={14} /> 開きかた
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
                    {f.open.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
