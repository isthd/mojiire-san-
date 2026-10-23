// 録画したコマ・ナレーション・字幕を1本の MP4 に合成する
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import ffmpeg from 'ffmpeg-static';

const out = process.argv[2] ?? 'out.mp4';
const { timeline, frames, endAbs } = JSON.parse(fs.readFileSync('timeline.json', 'utf8'));
const subs = JSON.parse(fs.readFileSync('subs.json', 'utf8'));
const t0 = timeline[0].abs - 0.4; // 動画の開始時刻
const T = endAbs - t0;

// 1) コマ一覧（可変フレームレート）
let first = frames.findIndex((f) => f.ts > t0);
if (first > 0) first -= 1;
const fr = frames.slice(first);
let list = '';
for (let i = 0; i < fr.length; i++) {
  const a = Math.max(fr[i].ts, t0);
  const b = i + 1 < fr.length ? fr[i + 1].ts : endAbs;
  if (b <= a) continue;
  list += `file '${fr[i].file}'\nduration ${(b - a).toFixed(4)}\n`;
}
list += `file '${fr.at(-1).file}'\n`;
fs.writeFileSync('frames.txt', list);

// 2) 字幕（ASS）
const ts = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};
let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Step,BIZ UDPGothic,30,&H00FFB45A,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,7,0,0,0,1
Style: Sub,BIZ UDPGothic,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0.5,0,1,0,0,7,0,0,0,1
Style: Num,BIZ UDPGothic,26,&H00B4A096,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,9,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
const X = 128;
timeline.forEach((sc, i) => {
  const s = sc.abs - t0;
  const e = (timeline[i + 1]?.abs ?? endAbs) - t0;
  if (sc.id !== 's00') {
    ass += `Dialogue: 0,${ts(s)},${ts(e)},Step,,0,0,0,,{\\pos(${X},966)\\fad(200,200)}${sc.caption}\n`;
    ass += `Dialogue: 0,${ts(s)},${ts(e)},Num,,0,0,0,,{\\pos(${1920 - X},968)}${i} / ${timeline.length - 1}\n`;
  }
  const lines = subs[sc.id];
  const total = lines.reduce((a, l) => a + l.length, 0);
  let t = sc.abs + (sc.voice - sc.start) - t0;
  lines.forEach((l, j) => {
    const d = (sc.dur * l.length) / total;
    const end = j === lines.length - 1 ? Math.min(e, t + d + 0.6) : t + d;
    ass += `Dialogue: 0,${ts(t)},${ts(end)},Sub,,0,0,0,,{\\pos(${X},1010)}${l}\n`;
    t += d;
  });
});
fs.writeFileSync('subs.ass', '﻿' + ass);

// 3) ナレーション音声（各シーンの開始位置に配置）
const inputs = [], delays = [];
timeline.forEach((sc, i) => {
  inputs.push('-i', `audio/${sc.id}.wav`);
  const ms = Math.round((sc.abs + (sc.voice - sc.start) - t0) * 1000);
  delays.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`);
});
const mix = `${delays.join(';')};${timeline.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0,volume=1.4,alimiter=limit=0.9:level=false,apad,atrim=0:${T.toFixed(3)}[aout]`;

// 4) 映像：1664x936 に拡大して紺色の背景に配置、下の帯に字幕
const video = `[0:v]fps=30,scale=1664:936:flags=lanczos,pad=1920:1080:128:16:color=0x0f172a,drawbox=x=124:y=12:w=1672:h=944:color=0x334155:t=4,subtitles=subs.ass:fontsdir='C\\:/Windows/Fonts'[vout]`;

const args = [
  '-y', '-v', 'error', '-stats',
  '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
  ...inputs,
  '-filter_complex', `${video};${mix}`,
  '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', '-t', T.toFixed(3),
  out,
];
execFileSync(ffmpeg, args, { stdio: 'inherit' });
console.log('written', out, T.toFixed(1) + 's');
