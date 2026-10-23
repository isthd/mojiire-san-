// GitHub Pages へ公開するスクリプト（npm run deploy）
// 1. 変更があればコミットして GitHub へ push
// 2. GitHub Pages 用にビルド
// 3. dist を gh-pages ブランチへ公開
//
// コミットメッセージを指定したい場合: npm run deploy -- "メッセージ"
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const BASE = '/mojiire-san-/';

// OneDrive 内だと gh-pages の作業用フォルダが削除できず失敗するため、一時フォルダを使う
process.env.CACHE_DIR = path.join(os.tmpdir(), 'gh-pages-mojiire');

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

const branch = execSync('git branch --show-current').toString().trim();
if (branch !== 'main') {
  console.error(`[deploy] いまのブランチは "${branch}" です。main に切り替えてから実行してください: git checkout main`);
  process.exit(1);
}

const changed = execSync('git status --porcelain').toString().trim();
if (changed) {
  const message = process.argv[2] || 'update';
  console.log(`\n[deploy] 変更をコミットします: "${message}"`);
  run('git add .');
  run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
} else {
  console.log('\n[deploy] コミットする変更はありません');
}
run('git push');

console.log('\n[deploy] ビルドします');
run(`npm run build -- --base=${BASE}`);

console.log('\n[deploy] GitHub Pages へ公開します');
const ghpages = (await import('gh-pages')).default;
await new Promise((resolve, reject) =>
  ghpages.publish('dist', {}, (err) => (err ? reject(err) : resolve())),
);

console.log(`\n[deploy] 公開しました: https://isthd.github.io${BASE}`);
