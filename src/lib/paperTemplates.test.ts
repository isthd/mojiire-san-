import { describe, expect, it } from 'vitest';
import { layoutPaper, PAPER_SIZES, TEMPLATES, templateName, type TemplateOptions } from './paperTemplates';

const inside = (o: TemplateOptions) => {
  const l = layoutPaper(o);
  for (const f of l.fields) {
    expect(f.rect.x).toBeGreaterThanOrEqual(0);
    expect(f.rect.y).toBeGreaterThanOrEqual(0);
    expect(f.rect.x + f.rect.width).toBeLessThanOrEqual(l.width + 1e-6);
    expect(f.rect.y + f.rect.height).toBeLessThanOrEqual(l.height + 1e-6);
    expect(f.rect.width).toBeGreaterThan(0);
    expect(f.rect.height).toBeGreaterThan(0);
  }
  return l;
};

describe('layoutPaper', () => {
  it('すべてのテンプレート・大きさ・向きで、入力枠が紙の中に収まる', () => {
    for (const t of TEMPLATES)
      for (const p of PAPER_SIZES)
        for (const orientation of ['portrait', 'landscape'] as const) inside({ kind: t.kind, size: p.key, orientation, color: 'white' });
  });

  it('紙の大きさと向き', () => {
    expect(layoutPaper({ kind: 'blank', size: 'a4', orientation: 'portrait', color: 'white' })).toMatchObject({ width: 210, height: 297 });
    expect(layoutPaper({ kind: 'blank', size: 'postcard', orientation: 'landscape', color: 'cream' })).toMatchObject({ width: 148, height: 100, bg: '#fdf8ec' });
  });

  it('手紙には宛名・本文・日付・差出人の枠がある', () => {
    for (const kind of ['mailH', 'mailV'] as const) {
      const roles = layoutPaper({ kind, size: 'a4', orientation: 'portrait', color: 'white' }).fields.map((f) => f.role);
      expect(roles.sort()).toEqual(['宛名', '差出人', '日付', '本文'].sort());
    }
  });

  it('縦書きの便箋・原稿用紙は縦書きの罫線テキストボックス', () => {
    for (const kind of ['letterV', 'genkou'] as const) {
      const f = layoutPaper({ kind, size: 'a4', orientation: 'portrait', color: 'white' }).fields[0];
      expect(f.kind === 'ruled' && f.vertical).toBe(true);
    }
  });

  it('原稿用紙の枠はマスの大きさで割り切れる', () => {
    const f = layoutPaper({ kind: 'genkou', size: 'a4', orientation: 'landscape', color: 'white' }).fields[0];
    if (f.kind !== 'ruled' || !f.cell) throw new Error('ruled');
    expect(Math.abs(f.rect.width / f.cell - Math.round(f.rect.width / f.cell))).toBeLessThan(1e-6);
    expect(Math.round(f.rect.height / f.cell)).toBe(20);
  });

  it('名前', () => {
    expect(templateName({ kind: 'letterH', size: 'a4', orientation: 'portrait', color: 'white' }, new Date(2026, 10, 20))).toBe('便箋（横書き） 11/20');
  });
});
