// 数式（LaTeX）→ SVG → 画像 の変換とキャッシュ。
// 編集画面・書き出しの両方で同じ関数を使い、表示と出力の整合性を保証する。
import { loadImageElement } from '../storage/imageCache';
import { normalizeLatex } from './latex';

type Engine = typeof import('./mathjaxEngine');
let enginePromise: Promise<Engine> | null = null;

export function loadMathEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = import('./mathjaxEngine');
    enginePromise.catch(() => (enginePromise = null));
  }
  return enginePromise;
}

export interface MathSvg {
  /** 色・サイズ適用済みの SVG 文字列 */
  svg: string;
  /** 画像座標でのサイズ */
  width: number;
  height: number;
}

/** 画像として保持する解像度の倍率（拡大表示や高解像度書き出しでもぼやけないように） */
const DENSITY = 4;
const MAX_SIDE = 4096;

export async function renderMathSvg(latex: string, fontSize: number, color: string): Promise<MathSvg> {
  const engine = await loadMathEngine();
  let raw: string;
  try {
    raw = engine.texToSvg(normalizeLatex(latex) || '\\square');
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
  const vb = /viewBox="([-\d.\s]+)"/.exec(raw);
  if (!vb) throw new Error('数式を描画できませんでした');
  const [, , vw, vh] = vb[1].trim().split(/\s+/).map(Number);
  // viewBox の単位は 1em = 1000
  const width = Math.max(1, (vw / 1000) * fontSize);
  const height = Math.max(1, (vh / 1000) * fontSize);
  const density = Math.max(1, Math.min(DENSITY, MAX_SIDE / Math.max(width, height)));
  const svg = raw
    .replace(/^<svg([^>]*)>/, (_m, attrs: string) => {
      const cleaned = attrs.replace(/\s(width|height|style|role|focusable|aria-hidden)="[^"]*"/g, '');
      return `<svg${cleaned} width="${(width * density).toFixed(2)}" height="${(height * density).toFixed(2)}" preserveAspectRatio="none">`;
    })
    .replace(/currentColor/g, color);
  return { svg, width, height };
}

export interface MathImage {
  img: HTMLImageElement;
  width: number;
  height: number;
}

const imageCache = new Map<string, Promise<MathImage>>();
const loaded = new Map<string, MathImage>();
const CACHE_LIMIT = 300;

export function mathKey(latex: string, fontSize: number, color: string): string {
  return `${fontSize.toFixed(2)}|${color}|${latex}`;
}

export function getMathImage(latex: string, fontSize: number, color: string): Promise<MathImage> {
  const key = mathKey(latex, fontSize, color);
  let p = imageCache.get(key);
  if (!p) {
    p = (async () => {
      const { svg, width, height } = await renderMathSvg(latex, fontSize, color);
      // data URL で読み込む（Safari で canvas が汚染されないように）
      const img = await loadImageElement('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      const result = { img, width, height };
      loaded.set(key, result);
      if (loaded.size > CACHE_LIMIT) {
        const first = loaded.keys().next().value as string;
        loaded.delete(first);
        imageCache.delete(first);
      }
      return result;
    })();
    p.catch(() => imageCache.delete(key));
    imageCache.set(key, p);
  }
  return p;
}

export function peekMathImage(latex: string, fontSize: number, color: string): MathImage | null {
  return loaded.get(mathKey(latex, fontSize, color)) ?? null;
}
