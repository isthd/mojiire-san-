// プリントの文字を読み取る（すべて端末の中で行い、外部のサービスには送らない）。
//   PDF   … 埋め込まれた文字を pdf.js で取り出す
//   写真  … ブラウザ標準の文字認識（TextDetector）があればそれを、なければ Tesseract.js（WebAssembly）で読む。
//           Tesseract.js の本体と日本語・英語のデータはこのアプリのサイトから配信する（public/tesseract/）
// 読み取った文字からタイトルと教科を推定する。読み取れない端末・プリントでは null を返す（従来どおりの名前で未分類）。
import { groupIntoLines, guessTitle, tidyOcrText, type TextLine } from '../lib/autoTitle';
import { findPageNumber, orderByPageNumbers } from '../lib/pageNumber';
import { inferSubject } from '../lib/subjects';
import type { Page } from '../types/model';
import { extractPdfText, isPdfFile } from './pdfImport';
import { getImage } from './projectRepo';

/** 保存する本文の上限（検索・教科の推定用） */
const MAX_TEXT = 20000;
/** 写真から読み取るページ数の上限（TextDetector は速いので5ページ、Tesseract.js は時間がかかるので1ページ） */
const MAX_IMAGE_PAGES_FAST = 5;
const MAX_IMAGE_PAGES_TESSERACT = 1;
/** 初回は読み取りデータ（約5MB）の読み込みがあるので長めに待つ */
const TIMEOUT_MS = 60000;
/** 読み取る画像の長い辺（大きすぎると遅く、iPad ではメモリが足りなくなる） */
const OCR_LONG_SIDE = 2000;
/** これより自信の低い行は捨てる（0〜100） */
const MIN_LINE_CONFIDENCE = 45;
/** 使い終わってから Tesseract.js を閉じてメモリを返すまで */
const IDLE_CLOSE_MS = 60000;

interface DetectedTextLike {
  rawValue: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}
type TextDetectorCtor = new () => { detect(source: ImageBitmapSource): Promise<DetectedTextLike[]> };

function textDetector(): TextDetectorCtor | null {
  const T = (globalThis as { TextDetector?: unknown }).TextDetector;
  return typeof T === 'function' ? (T as TextDetectorCtor) : null;
}

/** Tesseract.js（WebAssembly と Worker）が動く環境か */
function canUseTesseract(): boolean {
  return typeof Worker === 'function' && typeof WebAssembly === 'object' && typeof document === 'object';
}

/** 写真の文字を読み取れる端末か */
export function canReadImages(): boolean {
  return !!textDetector() || canUseTesseract();
}

type TesseractWorker = import('tesseract.js').Worker;
let tesseract: Promise<TesseractWorker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}tesseract/${path}`, location.href).href;
}

/** Tesseract.js を用意する（使うときに初めて読み込む。2回目以降は同じものを使う） */
function getTesseract(): Promise<TesseractWorker> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!tesseract) {
    tesseract = import('tesseract.js').then(({ createWorker, OEM }) =>
      createWorker(['jpn', 'eng'], OEM.LSTM_ONLY, {
        workerPath: assetUrl('worker.min.js'),
        corePath: assetUrl('core'),
        langPath: assetUrl('lang'),
        gzip: true,
        workerBlobURL: false,
      }),
    );
    tesseract.catch(() => (tesseract = null));
  }
  return tesseract;
}

/** しばらく使わなければ閉じてメモリを返す */
function releaseTesseractLater() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const t = tesseract;
    tesseract = null;
    void t?.then((w) => w.terminate()).catch(() => undefined);
  }, IDLE_CLOSE_MS);
}

/** 長い辺を OCR_LONG_SIDE 以下に縮めた画像 */
async function scaledCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, OCR_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/** Tesseract.js で画像の文字を行にして返す */
async function tesseractLines(blob: Blob): Promise<TextLine[]> {
  const canvas = await scaledCanvas(blob);
  try {
    return await tesseractCanvasLines(canvas);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

async function tesseractCanvasLines(canvas: HTMLCanvasElement): Promise<TextLine[]> {
  const worker = await getTesseract();
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    const lines: TextLine[] = [];
    for (const b of data.blocks ?? []) {
      for (const p of b.paragraphs) {
        for (const l of p.lines) {
          const text = tidyOcrText(l.text);
          if (!text || l.confidence < MIN_LINE_CONFIDENCE) continue;
          lines.push({ text, size: l.bbox.y1 - l.bbox.y0, top: l.bbox.y0 });
        }
      }
    }
    return lines.sort((a, b) => a.top - b.top);
  } finally {
    releaseTesseractLater();
  }
}

/** 画像の文字を行にして返す。読み取れない端末では null */
export async function readImageLines(blob: Blob): Promise<TextLine[] | null> {
  const T = textDetector();
  if (!T) return canUseTesseract() ? tesseractLines(blob) : null;
  const bitmap = await createImageBitmap(blob);
  try {
    const found = await new T().detect(bitmap);
    return groupIntoLines(
      found.map((r) => ({
        text: r.rawValue,
        x: r.boundingBox.x,
        y: r.boundingBox.y,
        width: r.boundingBox.width,
        height: r.boundingBox.height,
      })),
    );
  } finally {
    bitmap.close();
  }
}

/** 保存済みのページ画像の文字を読み取る（ページごと）。読み取れない端末では null */
export async function readPageLines(pages: Page[], maxPages?: number): Promise<TextLine[][] | null> {
  if (!canReadImages()) return null;
  maxPages ??= textDetector() ? MAX_IMAGE_PAGES_FAST : MAX_IMAGE_PAGES_TESSERACT;
  const out: TextLine[][] = [];
  for (const page of pages.slice(0, maxPages)) {
    const img = await getImage(page.imageId);
    out.push(img ? ((await readImageLines(img.blob).catch(() => null)) ?? []) : []);
  }
  return out;
}

// --- ページ番号の読み取り ----------------------------------------------------

/** ページ番号を探す上下の余白（高さに対する割合） */
const MARGIN_RATIO = 0.13;
/** ページ番号を読み取るページ数の上限 */
const MAX_NUMBER_PAGES = 60;
/** 1ページあたりの待ち時間（初回は読み取りデータの準備があるので長め） */
const NUMBER_TIMEOUT_FIRST_MS = 60000;
const NUMBER_TIMEOUT_MS = 20000;

/** 画像の下と上の余白を切り出す（下を先に。ページ番号は下にあることが多い） */
async function marginCanvases(blob: Blob): Promise<HTMLCanvasElement[]> {
  const full = await scaledCanvas(blob);
  try {
    const h = Math.max(1, Math.round(full.height * MARGIN_RATIO));
    return [full.height - h, 0].map((y) => {
      const c = document.createElement('canvas');
      c.width = full.width;
      c.height = h;
      c.getContext('2d')?.drawImage(full, 0, y, full.width, h, 0, 0, full.width, h);
      return c;
    });
  } finally {
    full.width = full.height = 0;
  }
}

async function canvasLines(canvas: HTMLCanvasElement): Promise<TextLine[]> {
  const T = textDetector();
  if (!T) return tesseractCanvasLines(canvas);
  const found = await new T().detect(canvas);
  return groupIntoLines(
    found.map((r) => ({ text: r.rawValue, x: r.boundingBox.x, y: r.boundingBox.y, width: r.boundingBox.width, height: r.boundingBox.height })),
  );
}

/** 1枚の画像の上下の余白からページ番号を読み取る（なければ null） */
async function readImagePageNumber(blob: Blob): Promise<number | null> {
  const [bottom, top] = await marginCanvases(blob);
  try {
    // 端に近い行から見る
    const b = await canvasLines(bottom);
    const n = findPageNumber(b.map((l) => l.text).reverse());
    if (n != null) return n;
    const t = await canvasLines(top);
    return findPageNumber(t.map((l) => l.text));
  } finally {
    bottom.width = bottom.height = top.width = top.height = 0;
  }
}

/**
 * ページごとに、印刷されたページ番号を読み取る（読み取れないページは null）。
 * 文字を読み取れない端末では null。
 */
export async function readPageNumbers(
  pages: Page[],
  onProgress?: (done: number, total: number) => void,
): Promise<(number | null)[] | null> {
  if (!canReadImages()) return null;
  const out: (number | null)[] = [];
  const total = Math.min(pages.length, MAX_NUMBER_PAGES);
  for (let i = 0; i < pages.length; i++) {
    let n: number | null = null;
    if (i < total) {
      onProgress?.(i, total);
      try {
        const img = await getImage(pages[i].imageId);
        if (img) n = await withTimeout(readImagePageNumber(img.blob), i === 0 ? NUMBER_TIMEOUT_FIRST_MS : NUMBER_TIMEOUT_MS);
      } catch (e) {
        console.warn('read page number failed', e);
      }
    }
    out.push(n);
  }
  onProgress?.(total, total);
  return out;
}

export interface PageSortResult {
  /** 番号順に並べたページ（並べ替えが要らない・番号が足りないときは null） */
  pages: Page[] | null;
  /** ページ番号を読み取れたページの数 */
  found: number;
}

/** 印刷されたページ番号の順に並べる。文字を読み取れない端末では null */
export async function sortPagesByNumber(
  pages: Page[],
  onProgress?: (done: number, total: number) => void,
): Promise<PageSortResult | null> {
  if (pages.length < 2) return { pages: null, found: 0 };
  const numbers = await readPageNumbers(pages, onProgress);
  if (!numbers) return null;
  const order = orderByPageNumbers(numbers);
  return { pages: order ? order.map((i) => pages[i]) : null, found: numbers.filter((n) => n != null).length };
}

/**
 * 写真を2枚以上まとめて読み込んだとき、印刷されたページ番号の順に並べる。
 * PDF を含むとき（ページ順がもともと正しい）・読み取れないときはそのまま返す。
 */
export async function autoSortImportedPages(
  files: File[],
  pages: Page[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: Page[]; sorted: boolean }> {
  if (pages.length < 2 || files.some(isPdfFile)) return { pages, sorted: false };
  try {
    const r = await sortPagesByNumber(pages, onProgress);
    return r?.pages ? { pages: r.pages, sorted: true } : { pages, sorted: false };
  } catch (e) {
    console.warn('auto sort failed', e);
    return { pages, sorted: false };
  }
}

export interface PrintReading {
  /** 推定したタイトル（なければ null） */
  title: string | null;
  /** 推定した教科（なければ null） */
  subject: string | null;
  /** 読み取った本文（読み取れなければ ""） */
  text: string;
}

/** 行の配列からタイトル・教科・本文をまとめる */
export function summarize(pages: TextLine[][]): PrintReading {
  const text = pages
    .map((lines) => lines.map((l) => l.text).join('\n'))
    .join('\n')
    .slice(0, MAX_TEXT);
  const title = pages[0] ? guessTitle(pages[0]) : null;
  return { title, subject: inferSubject(title ?? '', text), text };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/**
 * 読み込んだプリントを読み取る。1つ目のファイルが PDF なら埋め込みの文字を、
 * 文字がない（スキャンした PDF・写真）ときは、使える端末なら画像から読み取る。
 * 何も読み取れなければ null。
 */
export async function readPrint(files: File[], pages: Page[]): Promise<PrintReading | null> {
  const run = async (): Promise<PrintReading | null> => {
    let lines: TextLine[][] = [];
    const first = files[0];
    if (first && isPdfFile(first)) lines = await extractPdfText(first).catch(() => []);
    const chars = lines.reduce((n, ls) => n + ls.reduce((m, l) => m + l.text.length, 0), 0);
    if (chars < 10) lines = (await readPageLines(pages)) ?? [];
    if (!lines.some((ls) => ls.length)) return null;
    return summarize(lines);
  };
  try {
    return await withTimeout(run(), TIMEOUT_MS);
  } catch (e) {
    console.warn('read print failed', e);
    return null;
  }
}
