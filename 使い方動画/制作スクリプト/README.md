# 使い方動画の作り直し方

AI の画像・動画生成は使わず、実際のアプリをブラウザで自動操作して録画し、
読み上げソフトのナレーションと字幕を重ねて作っています（約3分50秒・1920×1080）。

## 必要なもの（Linux / WSL）

- Node.js、Playwright（Chromium）、ffmpeg
- 読み上げ：Open JTalk と、MMDAgent の声「メイ」
  ```sh
  sudo apt-get install -y open-jtalk open-jtalk-mecab-naist-jdic ffmpeg fonts-noto-cjk
  # MMDAgent_Example-1.8.zip（sourceforge.net/projects/mmdagent）から
  # Voice/mei/mei_normal.htsvoice を取り出して voice/ に置く
  ```
- サンプルの「撮影した写真」を作り直すとき：Python（Pillow・NumPy）

## 手順

1. このフォルダーで `npm init -y && npm i playwright`（Chromium がなければ `npx playwright install chromium`）
2. 別のターミナルでアプリを起動：プロジェクト直下で `npm run dev`（http://localhost:5173）
3. ナレーション音声：`./tts.sh`（`audio/` に出力）
   - Windows なら `powershell -ExecutionPolicy Bypass -File tts.ps1`（標準の音声「Haruka」）でも作れます
4. 録画：`node record.mjs`（`frames/` と `timeline.json` ができる。各シーンの最後の画面は `shots/`）
5. 合成：`node compose.mjs ../文字入れさん_使い方.mp4`

## ファイル

| ファイル | 内容 |
| --- | --- |
| `narration.json` | シーンごとの見出し（`caption`）、読み上げ文（`say`）、画面下の字幕（`subs`） |
| `record.mjs` | アプリを操作して録画する台本。ナレーションの長さに合わせて各シーンの時間を決める |
| `compose.mjs` | 録画したコマ・ナレーション・字幕（ASS）を1本の MP4 にまとめる |
| `tts.sh` / `tts.ps1` | ナレーション音声を作る |
| `worksheet.html` / `worksheet2.html` | サンプルのプリント（`worksheet*.png` はその画面キャプチャ） |
| `mkphoto.py` | `worksheet.png` を机の上でななめに撮った写真風にする（`photo.jpg`） |

- 読み上げで読み間違える言葉は、`say` をひらがなで書いています（例：「右上」→「みぎうえ」、「縁取り」→「ふちどり」）
- 読み方の確認：`echo 文 | open_jtalk -x /var/lib/mecab/dic/open-jtalk/naist-jdic -m voice/mei_normal.htsvoice -ot trace.txt -ow /dev/null`

## 動画の内容

| # | 見出し |
| --- | --- |
| ① | プリントを読み込む（名前と教科を自動でつける） |
| ② | ななめの写真をまっすぐにする |
| ③ | 回答欄を自動で見つける |
| ④ | 枠をダブルタップして答えを入力（文字数の表示） |
| ⑤ | 「ひらがな」モードで入力 |
| ⑥ | 好きな場所に文字を置く（⊕） |
| ⑦ | フォント・色・縁取りを変える |
| ⑧ | 数式を入力する |
| ⑨ | 手書き・蛍光ペン・図形 |
| ⑩ | 移動・拡大縮小・元に戻す |
| ⑪ | ページを追加・縦書き |
| ⑫ | PNG・JPEG・PDFで保存 |
| ⑬ | 教科・期限で整理する |
| ⑭ | フォルダとして保存 |
| ⑮ | テンプレートから作る（原稿用紙） |

ナレーションの声：MMDAgent "Mei"（Copyright © 2009-2018 Nagoya Institute of Technology、CC BY 3.0）
