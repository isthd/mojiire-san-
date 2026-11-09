// 文字の読み取り（Tesseract.js）に使うファイルを public/tesseract/ にコピーする。
// すべて自分のサイトから配信し、外部のサーバーには接続しない（オフラインでも、一度読み込めば使える）。
//   worker.min.js            … 読み取りを別スレッドで動かすスクリプト
//   core/*-lstm.wasm.js      … 読み取りの本体（端末の対応状況に合わせて1つだけ読み込まれる）
//   lang/jpn, eng.traineddata.gz … 日本語・英語の読み取りデータ（軽量版 best_int）
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const dest = join(root, 'public', 'tesseract');

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ...['lstm', 'simd-lstm', 'relaxedsimd-lstm'].map((v) => [`tesseract.js-core/tesseract-core-${v}.wasm.js`, `core/tesseract-core-${v}.wasm.js`]),
  ['@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz', 'lang/jpn.traineddata.gz'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

let copied = 0;
for (const [from, to] of files) {
  const src = join(nm, from);
  if (!existsSync(src)) continue;
  const out = join(dest, to);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(src, out);
  copied++;
}
console.log(`[copy-tesseract-assets] ${copied}/${files.length} files copied`);
