// scene.html のアニメーションを1コマずつ描いて、ナレーションと合わせて MP4 にする。
//   node render.mjs                 … 全部書き出す（../文字入れさん_作り方.mp4）
//   node render.mjs --still 3,40,90 … 指定した秒の静止画を stills/ に書き出す（確認用）
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const here = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const narr = JSON.parse(fs.readFileSync(path.join(here, 'narration.json'), 'utf8'));

// WAV を読む（16bit PCM）
function readWav(file) {
  const b = fs.readFileSync(file);
  const rate = b.readUInt32LE(24), ch = b.readUInt16LE(22), bits = b.readUInt16LE(34);
  let off = 12, data = null;
  while (off < b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { data = b.subarray(off + 8, off + 8 + sz); break; }
    off += 8 + sz;
  }
  if (bits !== 16) throw new Error('16bit PCM only: ' + file);
  const n = data.length / 2 / ch;
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = data.readInt16LE(i * 2 * ch) / 32768;
  return { rate, s, dur: n / rate };
}

// タイムライン
let t = 0;
const timeline = narr.map((n, i) => {
  const w = readWav(path.join(here, 'audio', `${n.id}.wav`));
  const voice = i === 0 ? 1.0 : 0.6;
  const dur = voice + w.dur + (i === narr.length - 1 ? 3.0 : 0.9);
  const sc = { id: n.id, title: n.title, date: n.date, subs: n.subs, start: t, dur, voice, adur: w.dur, wav: w };
  t += dur;
  return sc;
});
const TOTAL = t;
const NF = Math.ceil(TOTAL * FPS);

// 口の動き用の音量（コマごと）
const amp = new Float32Array(NF);
for (const sc of timeline) {
  const { rate, s } = sc.wav;
  for (let f = Math.floor((sc.start + sc.voice) * FPS); f < NF; f++) {
    const a = Math.floor((f / FPS - sc.start - sc.voice) * rate);
    if (a >= s.length) break;
    let sum = 0, m = 0;
    for (let i = a; i < Math.min(s.length, a + rate / FPS); i++) { sum += s[i] * s[i]; m++; }
    amp[f] = Math.min(1, Math.sqrt(sum / Math.max(1, m)) * 6);
  }
}
for (let f = 1; f < NF; f++) amp[f] = amp[f - 1] * 0.5 + amp[f] * 0.5;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'scene.html')).href);
await page.evaluate(([tl, total]) => window.setup(tl, total),
  [timeline.map(({ wav, ...r }) => r), TOTAL]);
await page.evaluate(() => window.ready());

const args = process.argv.slice(2);
if (args[0] === '--still') {
  fs.mkdirSync(path.join(here, 'stills'), { recursive: true });
  for (const x of args[1].split(',')) {
    const tt = Number(x);
    const url = await page.evaluate(([a, b]) => window.frame(a, b), [tt, amp[Math.floor(tt * FPS)] || 0]);
    fs.writeFileSync(path.join(here, 'stills', `t${String(tt).padStart(6, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('scenes:', timeline.map((s) => `${s.id}@${s.start.toFixed(1)}`).join(' '), 'total', TOTAL.toFixed(1));
  await browser.close();
  process.exit(0);
}

const out = path.join(here, '..', '文字入れさん_作り方.mp4');
const inputs = [], filters = [];
timeline.forEach((sc, i) => {
  inputs.push('-i', path.join(here, 'audio', `${sc.id}.wav`));
  const ms = Math.round((sc.start + sc.voice) * 1000);
  filters.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`);
});
const mix = `${filters.join(';')};${timeline.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0,volume=1.3,alimiter=limit=0.9:level=false,apad,atrim=0:${TOTAL.toFixed(3)}[aout]`;
const ff = spawn(ffmpeg, [
  '-y', '-v', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...inputs,
  '-filter_complex', mix, '-map', '0:v', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', TOTAL.toFixed(3), out,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));

const t0 = Date.now();
for (let f = 0; f < NF; f++) {
  const url = await page.evaluate(([a, b]) => window.frame(a, b), [f / FPS, amp[f]]);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 300 === 0) console.log(`frame ${f}/${NF}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await done;
await browser.close();
console.log('written', out, TOTAL.toFixed(1) + 's');
