// MathJax（TeX → SVG）エンジン。サイズが大きいため mathRenderer から動的 import される。
import './mathjaxGlobals';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js';
import 'mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: [
    'base',
    'ams',
    'newcommand',
    'noundefined',
    'boldsymbol',
    'mhchem',
    'cancel',
    'color',
    'mathtools',
    'textmacros',
  ],
  // エラーは例外として呼び出し側に伝え、画面に分かりやすく表示する
  formatError: (_jax: unknown, err: Error) => {
    throw err;
  },
});

// fontCache:'none' で各グリフをパスとして埋め込み、単体で完結した SVG にする（画像化しても欠けない）
const svg = new SVG({ fontCache: 'none' });

// liteAdaptor は未知の文字（日本語など）の幅を測れないため、Canvas で実測する
const measureCtx = document.createElement('canvas').getContext('2d')!;
(svg as unknown as { measureTextNode: (node: unknown) => { w: number; h: number; d: number } }).measureTextNode = (
  node: unknown,
) => {
  const n = node as Parameters<typeof adaptor.textContent>[0];
  const text = adaptor.textContent(n);
  const size = parseFloat(adaptor.getAttribute(n, 'font-size') || '884') || 884;
  const family = adaptor.getAttribute(n, 'font-family') || 'serif';
  const style = adaptor.getAttribute(n, 'font-style') || 'normal';
  const weight = adaptor.getAttribute(n, 'font-weight') || 'normal';
  measureCtx.font = `${style} ${weight} ${size}px ${family}`;
  return { w: measureCtx.measureText(text).width / 1000, h: 0.75, d: 0.2 };
};

const html = mathjax.document('', { InputJax: tex, OutputJax: svg });

/** TeX を SVG 文字列に変換（エラー時は例外） */
export function texToSvg(latex: string): string {
  const node = html.convert(latex, { display: true, em: 16, ex: 8, containerWidth: 1280 });
  const svgNode = adaptor.firstChild(node) as Parameters<typeof adaptor.outerHTML>[0];
  return adaptor.outerHTML(svgNode);
}
