// claude.ai の Artifact 用にビルドする。
// 1) 相対パス・Service Worker なしで dist-artifact/ に出力
// 2) Artifact の公開形式（doctype/head/body なしの本文のみ）のページ artifact.html を作成
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-artifact');

execSync('node node_modules/vite/bin/vite.js build', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, BUILD_TARGET: 'artifact' },
});

const html = readFileSync(join(out, 'index.html'), 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const scripts = pick(/<script type="module"[^>]*><\/script>/g);
const preloads = pick(/<link rel="modulepreload"[^>]*>/g);
const styles = pick(/<link rel="stylesheet"[^>]*>/g);

const page = [
  '<title>文字入れさん</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="description" content="プリントや問題集の画像に文字・数式・手書き・図形を書き込める学習用エディター">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&family=Zen+Maru+Gothic:wght@400;700&display=swap">',
  ...styles,
  ...preloads,
  ...scripts,
  '<div id="root"></div>',
].join('\n');

writeFileSync(join(out, 'artifact.html'), page + '\n');
console.log('[build-artifact] wrote dist-artifact/artifact.html');
