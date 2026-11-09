import { describe, expect, it } from 'vitest';
import { blend, contrastRatio } from './contrast';
import { HOME, STATUS_COLOR } from './homeTheme';

const AA = 4.5;

describe('contrast helper', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThan(4.5);
  });
  it('blends colours', () => {
    expect(blend('#ffffff', 0.5, '#000000')).toBe('#808080');
  });
});

describe('home colours have 4.5:1 contrast', () => {
  it('text on page and cards', () => {
    for (const bg of [HOME.page, HOME.surface]) {
      expect(contrastRatio(HOME.text, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(HOME.muted, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(HOME.link, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(HOME.dueSoon, bg)).toBeGreaterThanOrEqual(AA);
    }
    // 検索欄の背景（#eef0f3）の上の補足文字
    expect(contrastRatio(HOME.muted, '#eef0f3')).toBeGreaterThanOrEqual(AA);
  });

  it('white text on the blue card and its buttons', () => {
    expect(contrastRatio('#ffffff', HOME.primary)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio('#ffffff', HOME.primaryHover)).toBeGreaterThanOrEqual(AA);
    const button = blend('#ffffff', HOME.primaryButtonAlpha, HOME.primary);
    expect(contrastRatio('#ffffff', button)).toBeGreaterThanOrEqual(AA);
    const sub = blend('#ffffff', HOME.primarySubAlpha, HOME.primary);
    expect(contrastRatio(sub, HOME.primary)).toBeGreaterThanOrEqual(AA);
  });

  it('badges, banner, tabs', () => {
    expect(contrastRatio(HOME.badgeText, HOME.badgeBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(HOME.bannerText, HOME.bannerBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(HOME.tabActiveText, HOME.tabActiveBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio('#e5e5ea', HOME.tabActiveBg)).toBeGreaterThanOrEqual(AA); // 選択中タブの件数
    expect(contrastRatio('#3f4248', '#ffffff')).toBeGreaterThanOrEqual(AA); // フォルダ名・「…」
    expect(contrastRatio('#ffffff', '#c0161d')).toBeGreaterThanOrEqual(AA); // 一括削除ボタン
    // 進捗バーは文字ではないので 3:1
    expect(contrastRatio(HOME.progressFill, HOME.progressTrack)).toBeGreaterThanOrEqual(3);
  });

  it('status labels', () => {
    for (const [k, c] of Object.entries(STATUS_COLOR)) expect(contrastRatio(c.fg, c.bg), k).toBeGreaterThanOrEqual(AA);
  });
});
