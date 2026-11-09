// プリントの文字を読み取る（すべて端末の中で行い、外部のサービスには送らない）。
//   PDF   … 埋め込まれた文字を pdf.js で取り出す
//   写真  … ブラウザ標準の文字認識（TextDetector）があればそれを、なければ Tesseract.js（WebAssembly）で読む。
//           Tesseract.js の本体と日本語・英語のデータはこのアプリのサイトから配信する（public/tesseract/）
// 読み取った文字からタイトルと教科を推定する。読み取れない端末・プリントでは null を返す（従来どおりの名前で未分類）。
import { groupIntoLines, guessTitle, tidyOcrText, type TextLine } from '../lib/autoTitle';
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
  const worker = await getTesseract();
  const canvas = await scaledCanvas(blob);
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
    canvas.width = canvas.height = 0;
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
