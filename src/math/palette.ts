// 数学記号パレット（テンプレート集は templates.ts）。#0 = 選択中の内容, #? = 空欄（タップして入力できるプレースホルダー）

export interface PaletteItem {
  label: string;
  latex: string;
  title?: string;
}

export interface PaletteGroup {
  key: string;
  label: string;
  items: PaletteItem[];
}

export const PALETTE: PaletteGroup[] = [
  {
    key: 'basic',
    label: '基本',
    items: [
      { label: '+', latex: '+' },
      { label: '−', latex: '-' },
      { label: '×', latex: '\\times ' },
      { label: '÷', latex: '\\div ' },
      { label: '±', latex: '\\pm ' },
      { label: '=', latex: '=' },
      { label: '≠', latex: '\\neq ' },
      { label: '<', latex: '<' },
      { label: '>', latex: '>' },
      { label: '≦', latex: '\\leqq ' },
      { label: '≧', latex: '\\geqq ' },
      { label: '≒', latex: '\\fallingdotseq ' },
      { label: '≈', latex: '\\approx ' },
      { label: '∓', latex: '\\mp ' },
      { label: '·', latex: '\\cdot ', title: '積の点' },
      { label: '∝', latex: '\\propto ', title: '比例' },
      { label: '≪', latex: '\\ll ' },
      { label: '≫', latex: '\\gg ' },
      { label: '%', latex: '\\%' },
      { label: '′', latex: "'", title: 'ダッシュ' },
      { label: '( )', latex: '\\left(#0\\right)', title: 'かっこ' },
      { label: '[ ]', latex: '\\left[#0\\right]', title: '大かっこ' },
      { label: '{ }', latex: '\\left\\{#0\\right\\}', title: '中かっこ' },
      { label: '|x|', latex: '\\left|#0\\right|', title: '絶対値' },
      { label: '∞', latex: '\\infty ' },
      { label: '°', latex: '^{\\circ}', title: '度' },
      { label: '空白', latex: '\\quad ', title: '空白（すき間）' },
      { label: '⋯', latex: '\\cdots ' },
      { label: '∴', latex: '\\therefore ' },
      { label: '∵', latex: '\\because ' },
      { label: '文字', latex: '\\text{#?}', title: '日本語などの文字' },
    ],
  },
  {
    key: 'struct',
    label: '分数・累乗',
    items: [
      { label: 'a/b', latex: '\\frac{#0}{#?}', title: '分数' },
      { label: 'x²', latex: '#0^{2}', title: '2乗' },
      { label: 'xⁿ', latex: '#0^{#?}', title: '累乗・指数' },
      { label: 'xₙ', latex: '#0_{#?}', title: '下付き文字' },
      { label: '√', latex: '\\sqrt{#0}', title: '平方根' },
      { label: 'ⁿ√', latex: '\\sqrt[#?]{#0}', title: '累乗根' },
      { label: 'x̄', latex: '\\overline{#0}', title: '上線' },
      { label: 'a⃗', latex: '\\vec{#0}', title: 'ベクトル' },
      { label: 'AB→', latex: '\\overrightarrow{#0}', title: 'ベクトル（2文字）' },
      { label: 'ẋ', latex: '\\dot{#0}', title: '循環小数' },
    ],
  },
  {
    key: 'greek',
    label: 'ギリシャ文字',
    items: [
      'alpha:α', 'beta:β', 'gamma:γ', 'delta:δ', 'epsilon:ε', 'zeta:ζ', 'eta:η', 'theta:θ', 'kappa:κ',
      'lambda:λ', 'mu:μ', 'nu:ν', 'xi:ξ', 'pi:π', 'rho:ρ', 'sigma:σ', 'tau:τ', 'phi:φ', 'chi:χ', 'psi:ψ',
      'omega:ω', 'Gamma:Γ', 'Delta:Δ', 'Theta:Θ', 'Lambda:Λ', 'Pi:Π', 'Sigma:Σ', 'Phi:Φ', 'Psi:Ψ', 'Omega:Ω',
    ].map((s) => {
      const [name, label] = s.split(':');
      return { label, latex: `\\${name} ` };
    }),
  },
  {
    key: 'func',
    label: '関数・解析',
    items: [
      { label: 'sin', latex: '\\sin ' },
      { label: 'cos', latex: '\\cos ' },
      { label: 'tan', latex: '\\tan ' },
      { label: 'log', latex: '\\log ' },
      { label: 'logₐ', latex: '\\log_{#?}#?', title: '対数（底あり）' },
      { label: 'ln', latex: '\\ln ' },
      { label: 'lim', latex: '\\lim_{#?\\to #?}', title: '極限' },
      { label: 'Σ', latex: '\\sum_{#?}^{#?}', title: '総和' },
      { label: '∫', latex: '\\int ', title: '積分' },
      { label: '∫ₐᵇ', latex: '\\int_{#?}^{#?}', title: '定積分' },
      { label: 'dx', latex: '\\,dx' },
      { label: 'd/dx', latex: '\\frac{d}{dx}', title: '微分' },
      { label: "f'", latex: "#0'", title: 'ダッシュ' },
      { label: '→', latex: '\\to ' },
    ],
  },
  {
    key: 'arrow',
    label: '矢印',
    items: [
      { label: '→', latex: '\\rightarrow ' },
      { label: '←', latex: '\\leftarrow ' },
      { label: '↔', latex: '\\leftrightarrow ' },
      { label: '⟶', latex: '\\longrightarrow ' },
      { label: '⇒', latex: '\\Rightarrow ' },
      { label: '⇐', latex: '\\Leftarrow ' },
      { label: '⇔', latex: '\\Leftrightarrow ' },
      { label: '⟹', latex: '\\Longrightarrow ' },
      { label: '↑', latex: '\\uparrow ' },
      { label: '↓', latex: '\\downarrow ' },
      { label: '↗', latex: '\\nearrow ' },
      { label: '↘', latex: '\\searrow ' },
      { label: '⇄', latex: '\\rightleftarrows ' },
      { label: '↦', latex: '\\mapsto ' },
      { label: '→文字', latex: '\\xrightarrow{#?}', title: '上に文字つき矢印' },
    ],
  },
  {
    key: 'set',
    label: '集合・論理',
    items: [
      { label: '∈', latex: '\\in ' },
      { label: '∉', latex: '\\notin ' },
      { label: '⊂', latex: '\\subset ' },
      { label: '⊆', latex: '\\subseteq ' },
      { label: '∪', latex: '\\cup ' },
      { label: '∩', latex: '\\cap ' },
      { label: '∅', latex: '\\emptyset ' },
      { label: 'Ā', latex: '\\overline{#0}', title: '補集合' },
      { label: '⇒', latex: '\\Rightarrow ' },
      { label: '⇔', latex: '\\Leftrightarrow ' },
      { label: '∀', latex: '\\forall ' },
      { label: '∃', latex: '\\exists ' },
      { label: 'ℝ', latex: '\\mathbb{R}' },
      { label: 'ℕ', latex: '\\mathbb{N}' },
      { label: 'ℤ', latex: '\\mathbb{Z}' },
    ],
  },
  {
    key: 'geo',
    label: '図形',
    items: [
      { label: '△', latex: '\\triangle ' },
      { label: '∠', latex: '\\angle ' },
      { label: '⊥', latex: '\\perp ' },
      { label: '∥', latex: '\\parallel ' },
      { label: '≡', latex: '\\equiv ' },
      { label: '∽', latex: '\\backsim ' },
      { label: '⌒', latex: '\\overset{\\frown}{#0}', title: '弧' },
      { label: '°', latex: '^{\\circ}' },
      { label: '□', latex: '\\square ', title: '四角形' },
      { label: '○', latex: '\\bigcirc ', title: '円' },
    ],
  },
  {
    key: 'chem',
    label: '化学',
    items: [
      { label: 'X₂', latex: '#0_{2}', title: '下付き2' },
      { label: 'Xₙ', latex: '#0_{#?}', title: '下付き' },
      { label: 'X⁺', latex: '#0^{+}', title: '陽イオン' },
      { label: 'X⁻', latex: '#0^{-}', title: '陰イオン' },
      { label: 'X²⁺', latex: '#0^{2+}' },
      { label: '→', latex: '\\rightarrow ' },
      { label: '⇄', latex: '\\rightleftarrows ' },
      { label: '↑', latex: '\\uparrow ' },
      { label: '↓', latex: '\\downarrow ' },
    ],
  },
];

/** LaTeX直接入力モードでの挿入用にプレースホルダー記法を除去 */
export function toPlainLatex(snippet: string): string {
  return snippet.replace(/#0/g, '').replace(/#\?/g, '{}');
}
