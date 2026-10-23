// 画像（PNG/JPEG）・PDF の書き出しと、ダウンロード／共有。
import type { Page } from '../types/model';
import { canvasToBlob, effectiveScale, renderPageToCanvas } from './renderPage';

export type ExportFormat = 'png' | 'jpeg' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  scale: number;
  /** JPEG/PDF の品質 0〜1 */
  quality: number;
}

type Progress = (done: number, total: number) => void;

export function safeFileName(name: string): string {
  return (name.trim() || '文字入れ').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80);
}

/** 端末の制限で解像度が下がるページがあるか */
export function willDownscale(pages: Page[], scale: number): boolean {
  return pages.some((p) => effectiveScale(p, scale) < scale - 1e-6);
}

export async function exportImages(
  pages: Page[],
  allPages: Page[],
  projectName: string,
  opts: ExportOptions,
  onProgress: Progress,
): Promise<File[]> {
  const files: File[] = [];
  const isJpeg = opts.format === 'jpeg';
  const mime = isJpeg ? 'image/jpeg' : 'image/png';
  const base = safeFileName(projectName);
  for (let i = 0; i < pages.length; i++) {
    onProgress(i, pages.length);
    const page = pages[i];
    const canvas = await renderPageToCanvas(page, opts.scale, { background: isJpeg ? '#ffffff' : undefined });
    const blob = await canvasToBlob(canvas, mime, isJpeg ? opts.quality : undefined);
    canvas.width = canvas.height = 0; // メモリ解放
    const pageNo = allPages.indexOf(page) + 1;
    const suffix = allPages.length > 1 ? `_${String(pageNo).padStart(2, '0')}` : '';
    files.push(new File([blob], `${base}${suffix}.${isJpeg ? 'jpg' : 'png'}`, { type: mime }));
  }
  onProgress(pages.length, pages.length);
  return files;
}

/** 長辺を A4 の長辺（842pt）にそろえ、縦横比を維持したページで PDF を生成 */
export async function exportPdf(
  pages: Page[],
  projectName: string,
  opts: ExportOptions,
  onProgress: Progress,
): Promise<File> {
  const { jsPDF } = await import('jspdf');
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (let i = 0; i < pages.length; i++) {
    onProgress(i, pages.length);
    const page = pages[i];
    const k = 842 / Math.max(page.width, page.height);
    const w = page.width * k;
    const h = page.height * k;
    const orientation = w > h ? 'landscape' : 'portrait';
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation, compress: true });
    else pdf.addPage([w, h], orientation);
    const canvas = await renderPageToCanvas(page, opts.scale, { background: '#ffffff' });
    const blob = await canvasToBlob(canvas, 'image/jpeg', opts.quality);
    canvas.width = canvas.height = 0;
    const data = new Uint8Array(await blob.arrayBuffer());
    pdf.addImage(data, 'JPEG', 0, 0, w, h, undefined, 'FAST');
  }
  onProgress(pages.length, pages.length);
  const out = pdf!.output('blob');
  return new File([out], `${safeFileName(projectName)}.pdf`, { type: 'application/pdf' });
}

// claude.ai の Artifact として表示されている場合、ファイル保存は表示側の downloads 機能を使う
interface ClaudeDownloads {
  save(req: { filename: string; data: Blob }): Promise<{ status: string }>;
}
interface ClaudeHost {
  use(name: 'downloads'): Promise<ClaudeDownloads | null>;
}

function claudeHost(): ClaudeHost | null {
  const c = (window as unknown as { claude?: ClaudeHost }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

export class SaveError extends Error {
  constructor(
    message: string,
    readonly declined = false,
  ) {
    super(message);
  }
}

/** ファイルを保存（通常はブラウザのダウンロード、Artifact 内では保存確認を表示） */
export async function downloadFile(file: Blob, name: string): Promise<void> {
  const host = claudeHost();
  if (host) {
    const downloads = await host.use('downloads');
    if (!downloads) throw new SaveError('この画面ではファイルを保存できません');
    try {
      await downloads.save({ filename: name, data: file });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') throw new SaveError('保存をキャンセルしました', true);
      throw new SaveError((e as { message?: string })?.message || '保存できませんでした');
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** 複数ファイルを1つずつ保存（確認画面は同時に1つまで） */
export async function downloadFiles(files: File[]): Promise<void> {
  for (const f of files) {
    await downloadFile(f, f.name);
    if (!claudeHost()) await new Promise((r) => setTimeout(r, 400));
  }
}

export function canShareFiles(files: File[]): boolean {
  if (claudeHost()) return false; // Artifact の枠内では共有シートは使えない
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
}

/** iPad/スマホの共有シート（「画像を保存」で写真アプリに保存できる） */
export async function shareFiles(files: File[]): Promise<boolean> {
  try {
    await navigator.share({ files });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return true;
    return false;
  }
}
