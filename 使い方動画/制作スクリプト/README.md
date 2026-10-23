# 使い方動画の作り直し方

AI の画像・動画生成は使わず、実際のアプリを自動操作して録画しています。

1. このフォルダーで `npm init -y && npm i playwright@1.49.1 ffmpeg-static@5.2.0 && npx playwright install chromium`
2. 別のターミナルでアプリを起動：プロジェクト直下で `npm run dev`（http://localhost:5173）
3. ナレーション音声：`powershell -ExecutionPolicy Bypass -File tts.ps1`（Windows 標準の音声「Haruka」。`audio/` に出力）
4. 録画：`node record.mjs`（`frames/` と `timeline.json` ができる）
5. 合成：`node compose.mjs 文字入れさん_使い方.mp4`

- 台本（読み上げ文）は `narration.json`、画面下の字幕は `subs.json`
- サンプルのプリント画像は `worksheet.html` / `worksheet2.html` を画面キャプチャしたもの
