// ホーム画面の色。文字と背景のコントラスト比が 4.5:1 以上になるように選んでいる（homeTheme.test.ts で確認）。
import type { ProjectStatus } from '../types/model';

export const HOME = {
  /** 画面の背景 */
  page: '#f2f2f5',
  /** カードの背景 */
  surface: '#ffffff',
  /** 本文 */
  text: '#1d1d1f',
  /** 補足の文字（期限なし・件数など） */
  muted: '#5c6066',
  /** 主ボタン・「プリントを読み込む」カードの背景（白い文字をのせる） */
  primary: '#0a5ac2',
  primaryHover: '#094fa9',
  /** 「プリントを読み込む」カードの中のボタン（白の半透明を重ねる） */
  primaryButtonAlpha: 0.16,
  /** 「プリントを読み込む」カードの補足の文字（白の不透明度） */
  primarySubAlpha: 0.9,
  /** リンク風の文字（「写真から自動で命名（変更）」） */
  link: '#0a5fcc',
  /** 期限が近いとき */
  dueSoon: '#c0161d',
  /** ページ数バッジ */
  badgeBg: '#3f3f46',
  badgeText: '#ffffff',
  /** 未分類のお知らせの帯 */
  bannerBg: '#e8f1fd',
  bannerText: '#1d1d1f',
  /** 選択中の教科タブ */
  tabActiveBg: '#1d1d1f',
  tabActiveText: '#ffffff',
  /** 進捗バー（文字ではないので 3:1 以上） */
  progressTrack: '#e3e6ea',
  progressFill: '#0a5fcc',
} as const;

export const STATUS_COLOR: Record<ProjectStatus, { fg: string; bg: string }> = {
  todo: { fg: '#4b5563', bg: '#eef0f2' },
  doing: { fg: '#8a4500', bg: '#fff1db' },
  done: { fg: '#1d6829', bg: '#e5f4e7' },
};
