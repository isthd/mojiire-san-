// 新機能のお知らせ。
// 新しい機能を追加したときだけ、NEWS の先頭に項目を足す（id は前より大きい数にする）。
// バグ修正や見た目の調整だけのときは足さない。足さなければお知らせは出ない。
// 起動時、まだ見ていない項目があればお知らせを1回だけ表示する。

export interface NewsFeature {
  title: string;
  /** 使いかた */
  how: string[];
  /** 開きかた（どこから使えるか） */
  open: string[];
}

export interface NewsEntry {
  id: number;
  /** 公開日（YYYY-MM-DD） */
  date: string;
  features: NewsFeature[];
}

export const NEWS: NewsEntry[] = [
  {
    id: 1,
    date: '2026-10-25',
    features: [
      {
        title: 'PDF の読み込み',
        how: ['PDF を選ぶと、1ページずつ画像になってページとして取り込まれます。', 'あとは写真と同じように書き込めます。'],
        open: [
          'ホームの「画像から新規作成」で PDF を選ぶ',
          '編集画面の右上「…」→「画像・PDF（ページ）を追加」',
          'PDF を画面にドラッグ＆ドロップしても読み込めます',
        ],
      },
      {
        title: '切り抜き・まっすぐにする',
        how: [
          '紙のふちを自動で探して、四隅に ● を置きます。ずれていたら ● をドラッグして合わせ、「完了」を押します。',
          'ななめに撮った写真もまっすぐな長方形になります。「左に回転」「右に回転」で向きも直せます。',
          '書き込みの位置も新しい画像に合わせて動きます。「元に戻す」で元に戻せます。',
        ],
        open: ['編集画面の右上「…」→「切り抜き・まっすぐにする」'],
      },
    ],
  },
];

export const LATEST_NEWS_ID = NEWS.reduce((m, n) => Math.max(m, n.id), 0);

/** seen より新しい項目（新しい順） */
export function unseenNews(seen: number, news: NewsEntry[] = NEWS): NewsEntry[] {
  return news.filter((n) => n.id > seen).sort((a, b) => b.id - a.id);
}

const SEEN_KEY = 'mojiire-news-seen';

/** 最後に見たお知らせの id。一度も記録していなければ null */
export function readSeenNews(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeSeenNews(id: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // 保存できない環境では、次回また表示されるだけ
  }
}
