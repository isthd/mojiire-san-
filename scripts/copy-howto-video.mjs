// 使い方動画（使い方動画/文字入れさん_使い方.mp4）を public/videos/howto.mp4 にコピーし、アプリの中で見られるようにする。
// 動画は約9MBあるので、Service Worker の最初のインストールには入れない（vite.config.ts の globPatterns に mp4 を入れていない）。
// 動画を作り直したら、このスクリプト（npm run build でも実行される）でアプリ側も新しくなる。
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '使い方動画', '文字入れさん_使い方.mp4');
const dest = join(root, 'public', 'videos', 'howto.mp4');

if (!existsSync(src)) {
  console.log('[copy-howto-video] 使い方動画 not found, skipped');
} else {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log('[copy-howto-video] copied to public/videos/howto.mp4');
}
