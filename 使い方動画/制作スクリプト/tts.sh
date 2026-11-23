#!/bin/bash
# ナレーション音声を作る（Open JTalk ＋ MMDAgent「メイ」の声）
# 使い方: VOICE=/path/to/mei_normal.htsvoice ./tts.sh
set -e
cd "$(dirname "$0")"
VOICE=${VOICE:-./voice/mei_normal.htsvoice}
DIC=${DIC:-/var/lib/mecab/dic/open-jtalk/naist-jdic}
mkdir -p audio
node -e 'for (const n of require("./narration.json")) console.log(n.id + "\t" + n.say)' | while IFS=$'\t' read -r id say; do
  echo "$say" | open_jtalk -x "$DIC" -m "$VOICE" -r 1.08 -fm 0.5 -jf 0.6 -ow "audio/$id.raw.wav"
  ffmpeg -nostdin -v error -y -i "audio/$id.raw.wav" -af "highpass=f=70,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=80,loudnorm=I=-17:TP=-1.5" -ar 48000 -ac 1 "audio/$id.wav"
  rm "audio/$id.raw.wav"
  echo "ok $id"
done
