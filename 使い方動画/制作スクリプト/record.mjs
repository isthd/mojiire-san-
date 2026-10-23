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
        background:linear-gradient(135deg,#0a84ff 0%,#4f46e5 100%);color:#fff;font-family:"Yu Gothic UI","Meiryo",sans-serif;transition:opacity .7s ease;pointer-events:none}
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
  ms ??= Math.min(900, Math.max(250, d * 1.1));
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
  const b = await loc.boundingBox();
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
      objs: (pg?.objects ?? []).map((o) => ({ id: o.id, t: o.type, x: o.x, y: o.y, w: o.fieldWidth ?? o.width, h: o.fieldHeight ?? o.height, text: o.text, v: o.vertical })),
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
async function tapField(pred) {
  const s = await editor();
  const o = s.objs.find(pred);
  if (!o) throw new Error('field not found');
  await click(...toScreen(s, o.x + o.w / 2, o.y + o.h / 2), 500);
  return o;
}
async function pickFile(trigger, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), trigger()]);
  await sleep(300);
  await fc.setFiles(file);
}
const btn = (name) => page.getByRole('button', { name, exact: true });
const textDone = () => page.getByLabel('文字を入力').getByRole('button', { name: '完了', exact: true });
const drawDone = () => page.getByRole('main').getByRole('button', { name: '完了', exact: true });

// ===== シーン管理 =====
const timeline = [];
async function scene(id, fn, { tail = 0.7, lead = 0.25 } = {}) {
  const n = narr.find((x) => x.id === id);
  const start = now();
  timeline.push({ id, abs: Date.now() / 1000, start, voice: start + lead, dur: dur[id], caption: n.caption, say: n.say });
  console.log(`[${start.toFixed(1)}s] ${id} ${n.caption}`);
  try { await fn(); } catch (e) { await page.screenshot({ path: 'shots/err.png' }); throw e; }
  const end = start + lead + dur[id] + tail;
  const rest = end - now();
  if (rest > 0) await sleep(rest * 1000);
  timeline.at(-1).end = now();
}

// ===== 録画 =====
await page.goto('http://localhost:5173/');
await page.waitForSelector('text=画像から新規作成');
await page.evaluate(() => document.fonts.ready);
const ICON = 'data:image/svg+xml;base64,' + fs.readFileSync('C:/Users/icant/OneDrive/新しいフォルダー/public/icon.svg').toString('base64');
await page.evaluate((icon) => window.__demoCard(`<img src="${icon}"><div class="t">文字入れさん</div><div class="s">使い方ガイド</div><div class="d">プリント・教科書・問題集の画像に、文字・数式・手書き・図形を書き込む</div>`), ICON);
await moveTo(900, 500, 10);
await sleep(1200);
const recStart = now();

await scene('s00', async () => {
  await sleep((dur.s00 - 0.6) * 1000);
  await page.evaluate(() => window.__demoCardHide());
}, { tail: 0.9 });

await scene('s01', async () => {
  await sleep(900);
  await moveTo(...(await center(page.getByText('画像から新規作成'))));
  await sleep(1500);
  await pickFile(() => clickLoc(page.getByText('画像から新規作成'), 0), 'worksheet.png');
  await page.waitForSelector('.konvajs-content');
  await sleep(1200);
  await moveTo(1000, 400);
});

await scene('s02', async () => {
  await sleep(1400);
  await clickLoc(page.getByRole('button', { name: '回答欄に文字枠を自動で置く' }), 600);
  await sleep(1500);
  await moveTo(900, 330);
});

// 1(1) の答えを入力
await scene('s03', async () => {
  await camera(0.95, 760, 420);
  await sleep(500);
  await tapField((o) => o.y > 300 && o.y < 400);
  await sleep(600);
  await type('x = 5', 160);
  await sleep(600);
  await clickLoc(textDone(), 800);
});

// 書式の変更
await scene('s04', async () => {
  await clickLoc(page.getByRole('tab', { name: 'フォント' }), 400);
  await clickLoc(page.locator('[aria-haspopup="listbox"]'), 500);
  await clickLoc(page.getByRole('option', { name: '教科書体' }), 700);
  await clickLoc(page.getByRole('tab', { name: 'テキストカラー' }), 400);
  await clickLoc(page.getByRole('radio', { name: '#e5352b' }).first(), 700);
  await clickLoc(page.getByRole('tab', { name: '縁取り' }), 400);
  const sw = page.getByRole('switch', { name: '縁取り' });
  if (await sw.count()) await clickLoc(sw, 700);
  await sleep(500);
}, { tail: 1.2 });

// 数式（考え方の欄に文字を入れてから「数式を入力」）
await scene('s05', async () => {
  await page.keyboard.press('Escape');
  await camera(0.8, 760, 1150, 900);
  await tapField((o) => o.y > 1100 && !o.text);
  await sleep(300);
  await type('内角の和より', 140);
  await sleep(300);
  await clickLoc(page.getByRole('button', { name: /数式を入力/ }), 900);
  await page.getByRole('dialog', { name: '数式エディター' }).waitFor();
  await sleep(600);
  await clickLoc(page.getByRole('radio', { name: 'LaTeX' }), 400);
  await page.getByLabel('LaTeX入力').click();
  await type(String.raw`180^\circ-(50^\circ+60^\circ)`, 70);
  await type(String.raw`=70^\circ`, 70);
  await sleep(900);
  await clickLoc(page.getByRole('button', { name: /挿入/ }), 700);
  // 選択された数式を少し小さく
  await clickLoc(page.getByRole('tab', { name: 'サイズ' }), 300);
  for (let i = 0; i < 7; i++) await clickLoc(page.getByRole('button', { name: 'サイズを小さく' }), 180);
  await sleep(400);
  await page.keyboard.press('Escape');
}, { tail: 0.8 });

// 手書き・蛍光ペン・図形
await scene('s06', async () => {
  await page.keyboard.press('Escape');
  await camera(0.62, 640, 700, 800);
  await clickLoc(page.getByText('描く・図形'), 500);
  // ペン：(1) の答えを赤丸で囲む
  await clickLoc(page.getByRole('radio', { name: '#e5352b' }).first(), 300);
  await stroke(ellipsePts(800, 366, 120, 52), 900);
  // 蛍光ペン：問題文をなぞる
  await clickLoc(page.getByRole('button', { name: '蛍光ペン', exact: true }), 400);
  await stroke(linePts(140, 590, 660, 590, 20), 700);
  // 矢印：三角形の x から答え欄へ
  await clickLoc(page.getByRole('button', { name: '矢印', exact: true }), 400);
  await stroke(linePts(320, 1010, 700, 1010, 16), 600);
  // 四角形：表の答えのマスを囲む
  await clickLoc(page.getByRole('button', { name: '四角形', exact: true }), 400);
  await stroke(linePts(480, 715, 1070, 805, 16), 600);
  await page.screenshot({ path: 'shots/s06end.png' });
  await clickLoc(drawDone(), 400);
}, { tail: 0.6 });

// 移動・拡大縮小・元に戻す
await scene('s07', async () => {
  await camera(0.9, 800, 1080, 800);
  await tapField((o) => o.y > 950 && o.y < 1000 && !o.text);
  await sleep(300);
  await type('∠x = 70°', 150);
  await clickLoc(textDone(), 600);
  let s = await editor();
  const o = s.objs.find((x) => x.text === '∠x = 70°');
  const [px, py] = toScreen(s, o.x + 30, o.y + o.h / 2);
  // ドラッグで移動
  await moveTo(px, py);
  await page.mouse.down();
  await moveTo(px + 60, py + 10, 600);
  await page.mouse.up();
  await sleep(400);
  // 右下のハンドルで拡大
  const hb = await page.evaluate(() => {
    const st = window.Konva?.stages?.[0];
    const tr = st?.findOne('Transformer');
    const a = tr?.findOne('.bottom-right');
    if (!a) return null;
    const r = a.getClientRect();
    const c = st.container().getBoundingClientRect();
    return [c.x + r.x + r.width / 2, c.y + r.y + r.height / 2];
  });
  if (hb) {
    await moveTo(hb[0], hb[1]);
    await page.mouse.down();
    await moveTo(hb[0] + 70, hb[1] + 25, 700);
    await page.mouse.up();
    await sleep(700);
  }
  // 元に戻す
  await clickLoc(page.getByRole('button', { name: /元に戻す/ }), 700);
  await clickLoc(page.getByRole('button', { name: /元に戻す/ }), 700);
}, { tail: 0.5 });

// ページ追加・縦書き
await scene('s08', async () => {
  await page.keyboard.press('Escape');
  await sleep(300);
  await pickFile(() => clickLoc(page.getByText('画像を追加', { exact: true }), 0), 'worksheet2.png');
  await sleep(1500);
  await fit();
  await clickLoc(page.getByRole('button', { name: '回答欄に文字枠を自動で置く' }), 600);
  await sleep(1200);
  await camera(0.62, 620, 650, 700);
  {
    const s2 = await editor();
    const vx = Math.max(...s2.objs.filter((o) => o.v && !o.text).map((o) => o.x));
    await tapField((o) => o.v && !o.text && o.x === vx);
  }
  await type('どりょく', 160);
  await clickLoc(textDone(), 500);
  await page.keyboard.press('Escape');
  await sleep(300);
  await clickLoc(page.getByRole('button', { name: '前のページ' }), 600);
  await fit();
}, { tail: 0.5 });

// 書き出し
await scene('s09', async () => {
  await clickLoc(page.getByRole('button', { name: '保存', exact: true }), 700);
  await clickLoc(page.getByRole('radio', { name: 'PDF' }), 900);
  await clickLoc(page.getByRole('radio', { name: 'PNG' }), 500);
  await clickLoc(page.getByRole('radio', { name: '3倍' }), 700);
  const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await clickLoc(page.getByRole('button', { name: /書き出す/ }), 300);
  const dlBtn = page.getByRole('button', { name: /ダウンロード/ });
  await Promise.race([dl, dlBtn.waitFor({ timeout: 15000 }).catch(() => null)]);
  if (await dlBtn.isVisible().catch(() => false)) await clickLoc(dlBtn, 300);
  const d = await dl;
  if (d) console.log('download', d.suggestedFilename());
  await sleep(800);
}, { tail: 0.8 });

// ホーム：プロジェクト管理
await scene('s10', async () => {
  const dlg = page.getByRole('button', { name: 'キャンセル' });
  if (await dlg.isVisible().catch(() => false)) await clickLoc(dlg, 300);
  await clickLoc(page.getByRole('button', { name: /閉じる（ホームへ）/ }), 1200);
  await page.waitForSelector('text=プロジェクト');
  await sleep(600);
  await clickLoc(page.getByRole('button', { name: 'メニュー' }).first(), 900);
  for (const t of ['名前を変更', '複製', 'バックアップを保存']) {
    await moveTo(...(await center(page.getByRole('button', { name: t }))), 350);
    await sleep(450);
  }
  await clickLoc(page.getByRole('button', { name: '複製' }), 900);
}, { tail: 0.6 });

// 設定（iPad向け）とエンディング
await scene('s11', async () => {
  await clickLoc(page.getByText('続きから編集'), 1200);
  await page.waitForSelector('.konvajs-content');
  await clickLoc(page.getByRole('button', { name: 'その他' }), 500);
  await clickLoc(page.getByRole('button', { name: '設定', exact: true }), 600);
  await clickLoc(page.getByRole('switch', { name: /ペン入力のみ/ }), 1200);
  await page.evaluate((icon) => window.__demoCard(`<img src="${icon}"><div class="t">文字入れさん</div><div class="chips"><span>ログイン不要</span><span>完全無料</span><span>オフライン対応</span><span>iPad・Apple Pencil</span></div><div class="d">ぜひお試しください</div>`), ICON);
}, { tail: 2.2 });

await sleep(1500);
const total = now();
const endAbs = Date.now() / 1000;
await cdp.send('Page.stopScreencast').catch(() => {});
fs.writeFileSync('timeline.json', JSON.stringify({ recStart, total, endAbs, timeline, frames }, null, 1));
await ctx.close();
await browser.close();
console.log('done', (total - recStart).toFixed(1), 's');
