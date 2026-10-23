import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { requestPersistence } from './storage/db';

// iOS Safari のピンチによるページ全体の拡大を抑止（キャンバス内のピンチは独自に処理）
document.addEventListener('gesturestart', (e) => e.preventDefault());

void requestPersistence();

// 開発時のみ：動作検証用にストアを参照できるようにする
if (import.meta.env.DEV) {
  void import('./store/editorStore').then((m) => {
    (window as unknown as Record<string, unknown>).__editor = m.useEditor;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
