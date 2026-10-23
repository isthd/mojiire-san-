// LaTeX 文字列の前処理（MathLive 出力を MathJax が解釈できる形にそろえる）。

/** 未入力のプレースホルダーを □ として表示し、MathLive 固有のマクロを標準形に置換 */
export function normalizeLatex(latex: string): string {
  return latex
    // \text{} の中では \square が使えないので文字の □ にする
    .replace(/\\text\{\\placeholder(\[[^\]]*\])?(\[[^\]]*\])?\{\}\}/g, '\\text{□}')
    .replace(/\\placeholder(\[[^\]]*\])?(\[[^\]]*\])?\{\}/g, '\\square ')
    .replace(/\\doubleprime/g, '\\prime\\prime ')
    .replace(/\\tripleprime/g, '\\prime\\prime\\prime ')
    .replace(/\\placeholder(\[[^\]]*\])?\{([^{}]*)\}/g, '$2')
    .replace(/\\differentialD/g, '\\mathrm{d}')
    .replace(/\\exponentialE/g, '\\mathrm{e}')
    .replace(/\\imaginaryI/g, '\\mathrm{i}')
    .replace(/\\mleft/g, '\\left')
    .replace(/\\mright/g, '\\right')
    .trim();
}

export function isBlankLatex(latex: string): boolean {
  return normalizeLatex(latex).replace(/\\square|\s|\{|\}/g, '') === '';
}
