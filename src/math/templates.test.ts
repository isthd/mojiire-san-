import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES, searchTemplates, TEMPLATE_GROUPS, toPreviewLatex } from './templates';

/** { } の対応が取れているか（\{ \} はエスケープなので除外） */
function balanced(latex: string): boolean {
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

describe('math templates', () => {
  it('has many templates with unique keys per group', () => {
    expect(ALL_TEMPLATES.length).toBeGreaterThan(250);
    for (const g of TEMPLATE_GROUPS) {
      const keys = g.items.map((x) => x.latex);
      expect(new Set(keys).size, g.label).toBe(keys.length);
    }
  });
  it('every template has balanced braces', () => {
    for (const t of ALL_TEMPLATES) expect(balanced(t.latex), t.label).toBe(true);
  });
  it('never puts a letter right after a blank (MathLive would not see the blank)', () => {
    for (const t of ALL_TEMPLATES) expect(/#\?[A-Za-z]/.test(t.latex), t.label).toBe(false);
  });
  it('previews show blanks as squares', () => {
    expect(toPreviewLatex('\\frac{#?}{#?}')).toBe('\\frac{\\square }{\\square }');
  });
  it('searches by reading, katakana and label', () => {
    expect(searchTemplates('かいのこうしき').some((t) => t.label === '解の公式')).toBe(true);
    expect(searchTemplates('ナイセキ').some((t) => t.label === '内積')).toBe(true);
    expect(searchTemplates('余弦定理').length).toBeGreaterThan(0);
    expect(searchTemplates('   ')).toEqual([]);
  });
});
