# 作り方動画の作り直し方

画像・動画の生成 AI は使わず、すべてコードで作っています。

- 絵：`scene.html`（canvas に1コマずつ描く。キャラクターもドット絵をコードで描画）
- 台本：`narration.json`（`say` が読み上げ文、`subs` が画面下の字幕）
- 音声：Windows 標準の音声「Haruka」（`tts.ps1`）

1. このフォルダーで `npm i`（playwright-core と ffmpeg-static）
2. 音声：`powershell -ExecutionPolicy Bypass -File tts.ps1`（`audio/` に出力）
3. 確認用の静止画：`node render.mjs --still 10,60,120`（`stills/` に出力。インストール済みの Chrome を使う）
4. 書き出し：`node render.mjs`（`../文字入れさん_作り方.mp4`）

シーンの長さはナレーションの長さで決まり、各シーンの動きは字幕の行が始まる時刻に合わせています。
