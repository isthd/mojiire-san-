// PDF の読み込み（pdf.js）に必要なデータを public/pdfjs/ にコピーする。
// これがないと、日本語の文字（CMap）や、スキャンした PDF の画像（JBIG2・JPEG2000 の wasm）が描かれず、ページが白くなる。
//   cmaps/          … 日本語などのフォントの文字対応表
//   standard_fonts/ … PDF に埋め込まれていない標準フォント
//   wasm/           … スキャン画像（JBIG2・JPEG2000）と色の変換（ICC）の本体
//   iccs/           … CMYK の色の変換に使うプロファイル
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');
const dirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

if (!existsSync(src)) {
  console.log('[copy-pdfjs-assets] pdfjs-dist not found, skipped');
} else {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const d of dirs) {
    if (!existsSync(join(src, d))) continue;
    cpSync(join(src, d), join(dest, d), { recursive: true });
    copied++;
  }
  console.log(`[copy-pdfjs-assets] ${copied}/${dirs.length} folders copied`);
}
