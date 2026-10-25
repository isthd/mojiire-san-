// PDF の各ページを画像（JPEG）にする。pdf.js は大きいので、PDF を読み込むときだけ読み込む。
// 古めの iPad の Safari でも動くよう legacy 版を使う。

/** 長い辺のピクセル数の目安（A4 で約 210dpi。文字が読めて、ファイルが大きくなりすぎない） */
const TARGET_LONG_SIDE = 2480;
/** iPad / iPhone の Canvas の上限（約1600万画素）より少し小さく */
const MAX_PIXELS = 15_000_000;

export function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

/** PDF のページ寸法（pt）から、画像にするときの倍率を決める */
export function pdfRenderScale(widthPt: number, heightPt: number): number {
  let scale = TARGET_LONG_SIDE / Math.max(widthPt, heightPt);
  scale = Math.min(scale, 6);
  const px = widthPt * heightPt * scale * scale;
  if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
  return scale;
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
    pdfjsPromise.catch(() => (pdfjsPromise = null));
  }
  return pdfjsPromise;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像に変換できませんでした'))), 'image/jpeg', 0.92),
  );
}

export interface PdfPageImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * PDF の全ページを画像にして、1ページずつ onPage に渡す（全部をメモリに溜めない）。
 * パスワード付きなど読めない PDF は例外（message に理由）。
 */
export async function renderPdfPages(
  file: File,
  onPage: (img: PdfPageImage, index: number, total: number) => Promise<void>,
  onStart?: (total: number) => void,
): Promise<number> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    throw new Error(name === 'PasswordException' ? 'パスワード付きのPDFは読み込めません' : 'PDFを開けませんでした');
  }
  try {
    const total = doc.numPages;
    onStart?.(total);
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pdfRenderScale(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('画像に変換できませんでした');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await canvasToBlob(canvas);
      const { width, height } = canvas;
      // メモリを早めに返す（iPad 対策）
      canvas.width = canvas.height = 0;
      page.cleanup();
      await onPage({ blob, width, height }, i - 1, total);
    }
    return total;
  } finally {
    void doc.destroy();
  }
}
