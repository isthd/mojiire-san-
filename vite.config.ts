/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// claude.ai の Artifact として公開する場合（npm run build:artifact）：
// 相対パスで出力し、Service Worker は使わない（Artifact の枠内では動作しないため）
const ARTIFACT =
  (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.BUILD_TARGET ===
  'artifact';

export default defineConfig({
  base: ARTIFACT ? './' : '/',
  // MathJax の version.js がブラウザで require を使わないようにする
  define: {
    PACKAGE_VERSION: JSON.stringify('3.2.1'),
  },
  build: {
    chunkSizeWarningLimit: 3000,
    outDir: ARTIFACT ? 'dist-artifact' : 'dist',
  },
  plugins: [
    react(),
    tailwindcss(),
    !ARTIFACT &&
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '文字入れさん - 学習用画像エディター',
        short_name: '文字入れさん',
        description: 'プリントや問題集の画像に文字・数式・手書き・図形を書き込める学習用エディター',
        lang: 'ja',
        theme_color: '#ffffff',
        background_color: '#f5f5f7',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff,ttf}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
