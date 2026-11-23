// 文字入れさん 使い方動画：実際のアプリを自動操作して録画し、シーンの開始時刻を記録する
import { chromium } from 'playwright';
import fs from 'node:fs';

const W = 1280, H = 720;
const narr = JSON.parse(fs.readFileSync('narration.json', 'utf8'));
const dur = {};
for (const n of narr) {
  const b = fs.readFileSync(`audio/${n.id}.wav`);
  // data チャンクを探して長さ（秒）を求める
  let off = 12, len = 0, rate = b.readUInt32LE(28);
  while (off < b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { len = sz; break; }
    off += 8 + sz;
  }
  dur[n.id] = len / rate;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});

// カーソルとクリック演出、タイトルカードを全ページに注入
await ctx.addInitScript(() => {
  const install = () => {
    if (document.getElementById('__demo_cursor')) return;
    const st = document.createElement('style');
    st.textContent = `
      #__demo_cursor{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none}
      .__ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid rgba(10,132,255,.9);background:rgba(10,132,255,.18);pointer-events:none;z-index:2147483646;animation:__rip .55s ease-out forwards}
      @keyframes __rip{to{transform:scale(3.6);opacity:0}}
      #__demo_card{position:fixed;inset:0;z-index:2147483645;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:linear-gradient(135deg,#0a84ff 0%,#4f46e5 100%);color:#fff;font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;transition:opacity .7s ease;pointer-events:none}
      #__demo_card .t{font-size:72px;font-weight:800;letter-spacing:6px}
      #__demo_card .s{font-size:30px;margin-top:10px;opacity:.95;font-weight:600}
      #__demo_card .d{font-size:22px;margin-top:34px;opacity:.85}
      #__demo_card .chips{display:flex;gap:14px;margin-top:30px}
      #__demo_card .chips span{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:8px 20px;font-size:20px;font-weight:600}
      #__demo_card img{width:120px;height:120px;border-radius:28px;background:#fff;padding:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);margin-bottom:26px}
    `;
    document.head.appendChild(st);
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 17 L13 25.5 L16.5 24 L13 15.8 L20.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    document.body.appendChild(c);
    const pos = (e) => { c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`; };
    window.addEventListener('pointermove', pos, true);
    window.addEventListener('pointerdown', (e) => {
      pos(e);
      const r = document.createElement('div');
      r.className = '__ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  window.__demoMark = (i) => {
    let m = document.getElementById('__demo_mark');
    if (!m) { m = document.createElement('div'); m.id = '__demo_mark'; m.style.cssText = 'position:fixed;left:0;bottom:0;width:64px;height:8px;z-index:2147483647;pointer-events:none'; document.body.appendChild(m); }
    m.style.background = 'rgb(' + (i * 20) + ',0,255)';
  };
  window.__demoCard = (html) => {
    let el = document.getElementById('__demo_card');
    if (!el) { el = document.createElement('div'); el.id = '__demo_card'; document.body.appendChild(el); }
    el.innerHTML = html;
    el.style.opacity = '1';
    document.getElementById('__demo_cursor').style.visibility = 'hidden';
  };
  window.__demoCardHide = () => {
    const el = document.getElementById('__demo_card');
    if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 800); }
    document.getElementById('__demo_cursor').style.visibility = 'visible';
  };
});

const page = await ctx.newPage();
const t0 = Date.now();
// 画面配信（スクリーンキャスト）で、各コマを時刻付きで保存する
fs.rmSync('frames', { recursive: true, force: true });
fs.mkdirSync('frames');
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', (f) => {
  const file = 'frames/' + String(frames.length).padStart(6, '0') + '.jpg';
  fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
  frames.push({ file, ts: f.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const now = () => (Date.now() - t0) / 1000;
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

// ===== 操作ヘルパー =====
let mouse = { x: W / 2, y: H / 2 };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
async function moveTo(x, y, ms) {
  const d = Math.hypot(x - mouse.x, y - mouse.y);
  ms ??= Math.min(650, Math.max(220, d * 0.8));
  const n = Math.max(2, Math.round(ms / 16));
  const sx = mouse.x, sy = mouse.y;
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    await page.mouse.move(sx + (x - sx) * k, sy + (y - sy) * k);
    await sleep(ms / n);
  }
  mouse = { x, y };
}
async function click(x, y, pause = 250) {
  await moveTo(x, y);
  await sleep(120);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(pause);
}
async function center(loc) {
  await loc.waitFor({ state: 'visible' });
  let b = await loc.boundingBox();
  // 画面外なら、ホイールでなめらかにスクロールして見せる
  for (let k = 0; k < 40 && (b.y + b.height > H - 40 || b.y < 0); k++) {
    const dy = b.y < 0 ? Math.max(-60, b.y - 80) : Math.min(60, b.y + b.height - H + 120);
    await page.mouse.wheel(0, dy);
    await sleep(25);
    const nb = await loc.boundingBox();
    if (Math.abs(nb.y - b.y) < 1) { b = nb; break; }
    b = nb;
  }
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function clickLoc(loc, pause = 300) {
  const [x, y] = await center(loc);
  await click(x, y, pause);
}
async function type(text, delay = 110) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(delay);
  }
}
const editor = () =>
  page.evaluate(async () => {
    const { useEditor, currentPageOf } = await import('/src/store/editorStore.ts');
    const s = useEditor.getState();
    const pg = currentPageOf(s);
    const r = document.querySelector('.konvajs-content')?.getBoundingClientRect();
    return {
      view: s.view,
      rect: r ? [r.x, r.y, r.width, r.height] : null,
      sel: s.selectedIds,
      pw: pg?.width, ph: pg?.height,
      objs: (pg?.objects ?? []).map((o) => ({ id: o.id, t: o.type, x: o.x, y: o.y, w: o.fieldWidth ?? o.boxWidth ?? o.width, h: o.fieldHeight ?? o.boxHeight ?? o.height, text: o.text, v: o.vertical, field: o.field ?? o.placeholder })),
    };
  });
const toScreen = (s, x, y) => [s.rect[0] + s.view.x + x * s.view.zoom, s.rect[1] + s.view.y + y * s.view.zoom];
// 画像座標 (cx, cy) をキャンバス中央に、倍率 zoom でなめらかに移動
async function camera(zoom, cx, cy, ms = 900) {
  await page.evaluate(async ({ zoom, cx, cy, ms }) => {
    const { useEditor } = await import('/src/store/editorStore.ts');
    const { setUserView } = await import('/src/canvas/viewActions.ts');
    const r = document.querySelector('.konvajs-content').getBoundingClientRect();
    const a = { ...useEditor.getState().view };
    const b = { zoom, x: r.width / 2 - cx * zoom, y: r.height / 2 - cy * zoom };
    const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const start = performance.now();
    await new Promise((done) => {
      const step = (tm) => {
        const k = e(Math.min(1, (tm - start) / ms));
        setUserView({ zoom: a.zoom + (b.zoom - a.zoom) * k, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
        if (k < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
  }, { zoom, cx, cy, ms });
  await sleep(150);
}
async function fit() {
  await page.evaluate(async () => (await import('/src/canvas/viewActions.ts')).fitToScreen());
  await sleep(300);
}
// 画像座標の点列をペンでなぞる
async function stroke(points, ms = 700) {
  const s = await editor();
  const pts = points.map(([x, y]) => toScreen(s, x, y));
  await moveTo(...pts[0]);
  await sleep(100);
  await page.mouse.down();
  const per = ms / pts.length;
  for (const p of pts.slice(1)) {
    await page.mouse.move(p[0], p[1], { steps: 2 });
    mouse = { x: p[0], y: p[1] };
    await sleep(per);
  }
  await page.mouse.up();
  await sleep(200);
}
const ellipsePts = (cx, cy, rx, ry, n = 40, a0 = -2.2) =>
  Array.from({ length: n + 4 }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(a) * (1 + 0.03 * Math.sin(i)), cy + ry * Math.sin(a)];
  });
const linePts = (x1, y1, x2, y2, n = 14) => Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
async function dbl(x, y, pause = 500) {
  await moveTo(x, y);
  await sleep(150);
  for (let i = 0; i < 2; i++) {
    await page.mouse.down();
    await sleep(50);
    await page.mouse.up();
    await sleep(70);
  }
  await sleep(pause);
}
// 枠（テキスト）を y の順に並べて返す
const fields = async () => { const e = await editor(); return e.objs.filter((o) => o.t === 'text' && o.y < e.ph * 0.85).sort((a, b) => a.y - b.y || a.x - b.x); };
async function tapField(pred) {
  const s = await editor();
  const o = typeof pred === 'function' ? s.objs.find(pred) : pred;
  if (!o) throw new Error('field not found');
  await dbl(...toScreen(s, o.x + o.w / 2, o.y + o.h / 2), 600);
  await page.getByLabel('テキストを入力').waitFor({ state: 'visible' });
  return o;
}
async function selRect() {
  return page.evaluate(() => {
    const st = window.Konva?.stages?.[0];
    const tr = st?.findOne('Transformer');
    if (!tr || !tr.nodes().length) return null;
    const r = tr.getClientRect();
    const c = st.container().getBoundingClientRect();
    return [c.x + r.x + r.width / 2, c.y + r.y + r.height / 2, r.width, r.height];
  });
}
async function handle(name = '.bottom-right') {
  return page.evaluate((name) => {
    const st = window.Konva?.stages?.[0];
    const tr = st?.findOne('Transformer');
    const a = tr?.findOne(name);
    if (!a) return null;
    const r = a.getClientRect();
    const c = st.container().getBoundingClientRect();
    return [c.x + r.x + r.width / 2, c.y + r.y + r.height / 2];
  }, name);
}
async function done() {
  await clickLoc(textDone(), 600);
}
async function setMode(name) {
  const b = page.getByLabel('入力のしかた').getByRole('button', { name, exact: true });
  await clickLoc(b, 350);
}
async function pickFile(trigger, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), trigger()]);
  await sleep(300);
  // パスに日本語が含まれると setFiles が失敗するため、中身を渡す
  const name = file.split('/').pop();
  await fc.setFiles({ name, mimeType: name.endsWith('.png') ? 'image/png' : 'image/jpeg', buffer: fs.readFileSync(file) });
}
const btn = (name) => page.getByRole('button', { name, exact: true });
const textDone = () => page.getByLabel('文字を入力').getByRole('button', { name: '完了', exact: true });
const drawDone = () => page.getByRole('main').getByRole('button', { name: '完了', exact: true });

// ===== シーン管理 =====
const timeline = [];
async function scene(id, fn, { tail = 0.7, lead = 0.25 } = {}) {
  const n = narr.find((x) => x.id === id);
  const start = now();
  timeline.push({ id, abs: Date.now() / 1000, start, voice: start + lead, dur: dur[id], caption: n.caption, subs: n.subs });
  console.log(`[${start.toFixed(1)}s] ${id} ${n.caption}`);
  try { await fn(); } catch (e) { await page.screenshot({ path: 'shots/err.png' }); throw e; }
  console.log(`   action ${(now() - start).toFixed(1)}s / voice ${dur[id].toFixed(1)}s`);
  await page.screenshot({ path: `shots/${id}.png` });
  const end = start + lead + dur[id] + tail;
  const rest = end - now();
  if (rest > 0) await sleep(rest * 1000);
  timeline.at(-1).end = now();
}


// ===== 録画 =====
const HERE = '.';
const ICON = 'data:image/svg+xml;base64,' + fs.readFileSync(process.env.ICON ?? '../../public/icon.svg').toString('base64');
fs.mkdirSync('shots', { recursive: true });
await page.goto('http://localhost:5173/');
await page.waitForSelector('text=プリントを読み込む');
await page.evaluate(() => document.fonts.ready);
await page.evaluate((icon) => window.__demoCard(`<img src="${icon}"><div class="t">文字入れさん</div><div class="s">使い方ガイド</div><div class="d">プリント・教科書・問題集の写真に、文字・数式・手書き・図形を書き込む</div>`), ICON);
await moveTo(900, 500, 10);
await sleep(1200);
const recStart = now();

await scene('s00', async () => {
  await sleep((dur.s00 - 0.6) * 1000);
  await page.evaluate(() => window.__demoCardHide());
}, { tail: 0.9 });

// ① 読み込み（写真から名前と教科を自動でつける）
await scene('s01', async () => {
  await sleep(600);
  await moveTo(...(await center(page.getByText('プリントを読み込む', { exact: true }))));
  await sleep(1400);
  await moveTo(...(await center(btn('撮影'))));
  await sleep(1000);
  await moveTo(...(await center(btn('写真・PDF'))));
  await sleep(900);
  await pickFile(() => clickLoc(btn('写真・PDF'), 0), `${HERE}/photo.jpg`);
  await page.waitForSelector('.konvajs-content', { timeout: 120000 });
  await sleep(600);
  await moveTo(640, 560);
}, { tail: 1.0 });

// ② 切り抜き・まっすぐにする
await scene('s02', async () => {
  await sleep(500);
  await clickLoc(btn('その他'), 600);
  await clickLoc(page.getByText('切り抜き・まっすぐにする'), 900);
  await page.getByRole('dialog', { name: '切り抜き・まっすぐにする' }).waitFor();
  await sleep(1200);
  // 角の ● を順番になぞって見せる
  const corners = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] svg circle, [role=dialog] [data-corner]')].map((e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; }).filter((c) => c[2] > 12));
  for (const c of corners.slice(0, 4)) { await moveTo(c[0], c[1], 400); await sleep(250); }
  await sleep(1200);
  await clickLoc(page.getByRole('dialog', { name: '切り抜き・まっすぐにする' }).getByRole('button', { name: '完了', exact: true }), 600);
  await sleep(500);
  await moveTo(900, 450);
});

// ③ 回答欄
await scene('s03', async () => {
  await sleep(900);
  await clickLoc(page.getByRole('button', { name: '回答欄に文字枠を自動で置く' }), 700);
  await sleep(1200);
  const s = await editor();
  for (const o of (await fields()).slice(0, 6)) { await moveTo(...toScreen(s, o.x + o.w / 2, o.y + o.h / 2), 350); await sleep(180); }
  await moveTo(1000, 380);
});

let F; // 回答欄（y 順）
// ④ 答えを入力
await scene('s04', async () => {
  F = await fields();
  const q1 = F[1], q2 = F[2];
  await camera(1.0, q1.x - 60, q1.y + 70);
  await sleep(300);
  await tapField(q1);
  await sleep(500);
  await type('x = 5', 170);
  await sleep(900);
  await moveTo(...(await center(page.getByLabel('文字を入力').getByText(/文字$/).last())), 500);
  await sleep(700);
  await done();
  await tapField(F.find((o) => o.id === q2.id));
  await type('x = 2, 3', 130);
  await sleep(400);
  await done();
});

// ⑤ ひらがなモード（名前の欄）
await scene('s05', async () => {
  const nm = F[0];
  await camera(1.0, nm.x - 80, nm.y + 140, 700);
  await tapField((o) => o.id === nm.id);
  await sleep(300);
  await setMode('ひらがな');
  await sleep(500);
  await type('yamada hanako', 105);
  await sleep(700);
  await done();
}, { tail: 0.4 });

// ⑥ ⊕ で好きな場所に文字
let note;
await scene('s06', async () => {
  await page.keyboard.press('Escape');
  await fit();
  await sleep(300);
  await clickLoc(page.getByRole('button', { name: '文字を追加' }), 700);
  let s = await editor();
  const sr = await selRect();
  const from = [sr[0], sr[1]];
  const to = toScreen(s, s.pw * 0.68, s.ph * 0.142);
  await moveTo(...from);
  await page.mouse.down();
  await moveTo(...to, 900);
  await page.mouse.up();
  await sleep(400);
  await dbl(...to, 600);
  await setMode('ふつう');
  await type('見直しOK!', 160);
  await sleep(300);
  await done();
}, { tail: 0.5 });

// ⑦ 書式
await scene('s07', async () => {
  const s = await editor();
  note = s.objs.find((o) => o.text === '見直しOK!');
  await camera(1.1, note.x + 60, note.y + 150, 600);
  await clickLoc(page.getByRole('tab', { name: 'フォント' }), 400);
  await clickLoc(page.locator('[aria-haspopup="listbox"]').first(), 600);
  await moveTo(...(await center(page.getByRole('option', { name: '教科書体' }))), 400);
  await sleep(300);
  await moveTo(...(await center(page.getByRole('option', { name: '手書き風' }))), 400);
  await sleep(300);
  await clickLoc(page.getByRole('option', { name: 'ポップ' }), 900);
  await clickLoc(page.getByRole('tab', { name: 'テキストカラー' }), 400);
  await clickLoc(page.locator('[aria-label="#e5352b"]').first(), 800);
  await clickLoc(page.getByRole('tab', { name: '背景カラー' }), 400);
  await page.screenshot({ path: 'shots/s07bg.png' });
  await clickLoc(page.locator('[aria-label="#ffe14d"]').first(), 800);
  await clickLoc(page.getByRole('tab', { name: '縁取り' }), 400);
  await page.screenshot({ path: 'shots/s07ol.png' });
  const sw = page.getByRole('switch').first();
  if (await sw.isVisible().catch(() => false)) await clickLoc(sw, 800);
  else { const w = page.locator('[aria-label="#ffffff"]').first(); if (await w.isVisible().catch(() => false)) await clickLoc(w, 800); }
  await sleep(400);
}, { tail: 0.8 });

// ⑧ 数式
await scene('s08', async () => {
  await page.keyboard.press('Escape');
  const last = F.at(-1);
  await camera(0.95, last.x + last.w / 2 - 150, last.y + 80, 800);
  await tapField((o) => o.id === last.id);
  await sleep(200);
  await type('内角の和より', 90);
  await sleep(300);
  await clickLoc(page.getByRole('button', { name: /数式を入力/ }), 900);
  const dlg = page.getByRole('dialog', { name: '数式エディター' });
  await dlg.waitFor();
  await sleep(500);
  for (const t of ['テンプレート：分数', 'テンプレート：平方根']) { await moveTo(...(await center(page.getByRole('button', { name: t, exact: true }))), 350); await sleep(250); }
  await clickLoc(page.getByRole('radio', { name: 'LaTeX' }), 400);
  await page.getByLabel('LaTeX入力').click();
  for (const part of [String.raw`180^\circ`, String.raw`-(50^\circ`, String.raw`+60^\circ)`, String.raw`=70^\circ`]) {
    await page.keyboard.insertText(part);
    await sleep(260);
  }
  await sleep(900);
  await clickLoc(dlg.getByRole('button', { name: /挿入/ }), 700);
  await page.screenshot({ path: 'shots/s08ins.png' });
  {
    const h = await handle();
    if (h) { await moveTo(h[0], h[1]); await page.mouse.down(); await moveTo(h[0] - 170, h[1] - 12, 700); await page.mouse.up(); await sleep(400); }
  }
  await sleep(300);
  await page.keyboard.press('Escape');
}, { tail: 0.6 });

// ⑨ 描く・図形
await scene('s09', async () => {
  await page.keyboard.press('Escape');
  await fit();
  await clickLoc(page.getByText('描く・図形'), 500);
  const F2 = F;
  const q1 = F2[1];
  await clickLoc(page.locator('[aria-label="#e5352b"]').first(), 300);
  await stroke(ellipsePts(q1.x + q1.w / 2, q1.y + q1.h / 2, q1.w * 0.62, q1.h * 1.05), 700);
  await clickLoc(btn('蛍光ペン'), 250);
  const s = await editor();
  const ty = F[3].y - s.ph * 0.07; // 「2 次の表を完成させなさい」の行
  await stroke(linePts(s.pw * 0.2, ty, s.pw * 0.62, ty, 14), 450);
  await clickLoc(btn('矢印'), 300);
  await clickLoc(page.locator('[aria-label="#0a63d6"]').first(), 300);
  const ans = F2.at(-2);
  await stroke(linePts(s.pw * 0.36, ans.y + ans.h * 0.5, ans.x - 15, ans.y + ans.h * 0.5, 12), 400);
  await clickLoc(btn('四角形'), 300);
  const cells = F2.filter((o) => Math.abs(o.y - F[3].y) < 20).sort((a, b) => a.x - b.x);
  const c0 = cells[0], c2 = cells.at(-1);
  await stroke(linePts(c0.x - 8, c0.y - 8, c2.x + c2.w + 8, c2.y + c2.h + 8, 12), 400);
  await sleep(300);
  await clickLoc(drawDone(), 400);
}, { tail: 0.5 });

// ⑩ 移動・拡大縮小・元に戻す
await scene('s10', async () => {
  const ans = F.at(-2);
  await camera(1.0, ans.x + ans.w / 2 - 100, ans.y + 60, 700);
  await tapField((o) => o.id === ans.id);
  await setMode('ふつう');
  await type('∠x = 70°', 150);
  await done();
  await page.keyboard.press('Escape');
  await sleep(300);
  let s = await editor();
  const o = s.objs.find((x) => x.text === '∠x = 70°');
  const [px, py] = toScreen(s, o.x + o.w * 0.3, o.y + o.h / 2);
  await click(px, py, 500);
  await moveTo(px, py);
  await page.mouse.down();
  await moveTo(px + 70, py + 25, 700);
  await page.mouse.up();
  await sleep(400);
  const hb = await handle();
  console.log('s10 moved', JSON.stringify((await editor()).objs.find((x) => x.text === '∠x = 70°')), hb);
  if (hb && hb[0] > 0) {
    await moveTo(hb[0], hb[1]);
    await page.mouse.down();
    await moveTo(hb[0] + 80, hb[1] + 30, 700);
    await page.mouse.up();
    await sleep(700);
  }
  await clickLoc(page.getByRole('button', { name: /元に戻す/ }), 900);
  console.log('s10 undo', JSON.stringify((await editor()).objs.find((x) => x.text === '∠x = 70°')));
}, { tail: 0.5 });

// ⑪ ページ追加・縦書き
await scene('s11', async () => {
  await page.keyboard.press('Escape');
  await sleep(200);
  await pickFile(() => clickLoc(page.getByText('画像を追加', { exact: true }), 0), `${HERE}/worksheet2.png`);
  await sleep(1500);
  await fit();
  await clickLoc(page.getByRole('button', { name: '回答欄に文字枠を自動で置く' }), 600);
  await sleep(1000);
  const s2 = await editor();
  const vs = s2.objs.filter((o) => o.v && !o.text);
  const vx = Math.max(...vs.map((o) => o.x));
  const v = vs.find((o) => o.x === vx);
  await camera(0.8, v.x, v.y + v.h / 2, 700);
  await tapField((o) => o.id === v.id);
  await setMode('ひらがな');
  await type('doryoku', 160);
  await done();
  await page.screenshot({ path: 'shots/s11v.png' });
  await setModeLater();
  await page.keyboard.press('Escape');
  await sleep(300);
  await fit();
  const prev = page.getByRole('button', { name: '前のページ' });
  if (await prev.isVisible().catch(() => false)) await clickLoc(prev, 600);
  await fit();
}, { tail: 0.5 });
async function setModeLater() {}

// ⑫ 書き出し
await scene('s12', async () => {
  await clickLoc(btn('保存'), 700);
  await clickLoc(page.getByRole('radio', { name: 'JPEG' }), 600);
  await clickLoc(page.getByRole('radio', { name: 'PDF' }), 700);
  await clickLoc(page.getByRole('radio', { name: 'PNG' }), 500);
  await clickLoc(page.getByRole('radio', { name: '元画像と同じ' }), 600);
  const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await clickLoc(page.getByRole('button', { name: /書き出す/ }), 300);
  const dlBtn = page.getByRole('button', { name: /ダウンロード/ });
  await Promise.race([dl, dlBtn.waitFor({ timeout: 15000 }).catch(() => null)]);
  if (await dlBtn.isVisible().catch(() => false)) await clickLoc(dlBtn, 300);
  const d = await dl;
  if (d) console.log('download', d.suggestedFilename());
  await sleep(600);
}, { tail: 0.6 });

// ⑬ ホーム：教科・期限
await scene('s13', async () => {
  const c = page.getByRole('button', { name: 'キャンセル' });
  if (await c.isVisible().catch(() => false)) await clickLoc(c, 300);
  await clickLoc(page.getByRole('button', { name: /閉じる（ホームへ）/ }), 1200);
  await page.waitForSelector('text=数学確認プリント');
  await sleep(500);
  const tabs = page.getByRole('group', { name: '教科で絞り込む' });
  await clickLoc(tabs.getByText('数学', { exact: true }).first(), 900);
  await clickLoc(tabs.getByText('すべて', { exact: true }).first(), 700);
  await clickLoc(page.getByRole('button', { name: '「数学確認プリント」のメニュー' }).last(), 700);
  await clickLoc(page.getByText('期限・教科を設定'), 800);
  const d = new Date(Date.now() + 2 * 86400000);
  const iso = d.toISOString().slice(0, 10);
  await clickLoc(page.getByLabel('期限の日付'), 300);
  await page.getByLabel('期限の日付').fill(iso);
  await sleep(500);
  await clickLoc(page.getByRole('dialog').getByText('テスト', { exact: true }), 700);
  await clickLoc(page.getByRole('button', { name: '保存', exact: true }).last(), 900);
  await moveTo(700, 560);
}, { tail: 0.6 });

// ⑭ フォルダとして保存
await scene('s14', async () => {
  await clickLoc(page.getByRole('button', { name: '「数学確認プリント」のメニュー' }).last(), 700);
  await clickLoc(page.getByText('フォルダとして保存', { exact: true }).last(), 900);
  await sleep(600);
  await moveTo(...(await center(page.getByRole('button', { name: /フォルダを選ぶ/ }))), 500);
  await sleep(900);
  await moveTo(...(await center(page.getByText(/ZIP にまとめて/))), 500);
  await sleep(1500);
  const x = page.getByRole('button', { name: /やめる|閉じる/ }).last();
  await clickLoc(x, 500);
}, { tail: 0.5 });

// ⑮ テンプレート（原稿用紙）
await scene('s15', async () => {
  await page.keyboard.press('Escape');
  await clickLoc(btn('テンプレート'), 800);
  const td = page.getByRole('dialog', { name: 'テンプレート' });
  for (const t of ['方眼', '便箋（縦書き）', '手紙（横書き）']) { await moveTo(...(await center(td.getByText(t, { exact: true }).first())), 300); await sleep(220); }
  await clickLoc(td.getByText('原稿用紙', { exact: true }).first(), 600);
  await clickLoc(page.locator('[aria-label="さくら"]').first(), 600);
  await clickLoc(page.getByRole('button', { name: '「原稿用紙」を作る' }), 1200);
  await page.waitForSelector('.konvajs-content');
  await sleep(800);
  const s = await editor();
  const f = s.objs.find((o) => o.t === 'text');
  await tapField((o) => o.id === f.id);
  await setMode('ふつう');
  await type('春の朝は、空気がすんでいて気持ちがいい。', 85);
  await done();
  await page.keyboard.press('Escape');
  await camera(s.view.zoom * 2.2, f.x + f.w * 0.82, f.y + f.h * 0.22, 900);
}, { tail: 0.8 });

// エンディング
await scene('s16', async () => {
  await sleep(1500);
  await page.evaluate((icon) => window.__demoCard(`<img src="${icon}"><div class="t">文字入れさん</div><div class="chips"><span>ログイン不要</span><span>完全無料</span><span>オフライン対応</span><span>iPad・Apple Pencil</span></div><div class="d">isthd.github.io/mojiire-san-</div>`), ICON);
}, { tail: 2.2 });

await sleep(1500);
const total = now();
const endAbs = Date.now() / 1000;
await cdp.send('Page.stopScreencast').catch(() => {});
fs.writeFileSync('timeline.json', JSON.stringify({ recStart, total, endAbs, timeline, frames }, null, 1));
await ctx.close();
await browser.close();
console.log('done', (total - recStart).toFixed(1), 's');
