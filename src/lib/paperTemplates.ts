// テンプレート（白紙・方眼・ノート・便箋・手紙・原稿用紙）の紙のレイアウト。
// 座標はすべてミリメートル（紙の左上が原点）。描画（drawPaper）と、最初から置いておく入力枠（fields）を返す。

export type PaperSizeKey = 'a4' | 'b5' | 'a5' | 'postcard';
export type Orientation = 'portrait' | 'landscape';
export type PaperColorKey = 'white' | 'cream' | 'sakura' | 'sky' | 'leaf';
export type TemplateKind = 'blank' | 'grid' | 'noteA' | 'noteB' | 'letterH' | 'letterV' | 'mailH' | 'mailV' | 'genkou';

export const PAPER_SIZES: { key: PaperSizeKey; label: string; w: number; h: number }[] = [
  { key: 'a4', label: 'A4', w: 210, h: 297 },
  { key: 'b5', label: 'B5', w: 182, h: 257 },
  { key: 'a5', label: 'A5', w: 148, h: 210 },
  { key: 'postcard', label: 'はがき', w: 100, h: 148 },
];

export interface PaperColor {
  key: PaperColorKey;
  label: string;
  /** 紙の色 */
  bg: string;
  /** 罫線（薄い線） */
  line: string;
  /** 枠・見出し（濃い線） */
  ink: string;
}

export const PAPER_COLORS: PaperColor[] = [
  { key: 'white', label: '白', bg: '#ffffff', line: '#b7c9de', ink: '#6f8fb5' },
  { key: 'cream', label: 'クリーム', bg: '#fdf8ec', line: '#dcc7a1', ink: '#a8824a' },
  { key: 'sakura', label: 'さくら', bg: '#fff4f6', line: '#f1bccb', ink: '#cf7390' },
  { key: 'sky', label: 'そら', bg: '#f2f8ff', line: '#a9cbee', ink: '#5a8fc8' },
  { key: 'leaf', label: 'わかば', bg: '#f4faef', line: '#bcdcaa', ink: '#69a04f' },
];

export interface TemplateInfo {
  kind: TemplateKind;
  label: string;
  /** 一覧に出す説明 */
  note: string;
  group: 'paper' | 'letter' | 'genkou';
}

export const TEMPLATES: TemplateInfo[] = [
  { kind: 'blank', label: '白紙', note: '何も書いていない紙', group: 'paper' },
  { kind: 'grid', label: '方眼', note: '5mm のマス目', group: 'paper' },
  { kind: 'noteA', label: 'ノート（A罫）', note: '7mm の横罫', group: 'paper' },
  { kind: 'noteB', label: 'ノート（B罫）', note: '6mm の横罫', group: 'paper' },
  { kind: 'letterH', label: '便箋（横書き）', note: '罫線の入った便箋', group: 'letter' },
  { kind: 'letterV', label: '便箋（縦書き）', note: '縦の罫線の便箋', group: 'letter' },
  { kind: 'mailH', label: '手紙（横書き）', note: '宛名・日付・差出人の欄つき', group: 'letter' },
  { kind: 'mailV', label: '手紙（縦書き）', note: '宛名・日付・差出人の欄つき', group: 'letter' },
  { kind: 'genkou', label: '原稿用紙', note: '縦書きのマス目（作文用）', group: 'genkou' },
];

export interface TemplateOptions {
  kind: TemplateKind;
  size: PaperSizeKey;
  orientation: Orientation;
  color: PaperColorKey;
}

export interface MmRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 最初から置いておく入力枠 */
export type TemplateField =
  /** 罫線テキストボックス（gap = 1行・1列の幅）。cell があると原稿用紙のマスに1文字ずつ並べる */
  | { kind: 'ruled'; rect: MmRect; gap: number; vertical: boolean; cell?: number; role: string }
  /** 1行の「ダブルタップで入力」の枠 */
  | { kind: 'field'; rect: MmRect; vertical: boolean; role: string };

/** 紙に描くもの（線・枠・文字） */
export type PaperMark =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; color: string }
  | { t: 'rect'; x: number; y: number; width: number; height: number; w: number; color: string; r?: number }
  | { t: 'text'; x: number; y: number; text: string; size: number; color: string; align: 'left' | 'center' | 'right'; vertical?: boolean };

export interface PaperLayout {
  width: number;
  height: number;
  bg: string;
  marks: PaperMark[];
  fields: TemplateField[];
}

export function paperSize(size: PaperSizeKey, orientation: Orientation): { width: number; height: number } {
  const s = PAPER_SIZES.find((p) => p.key === size) ?? PAPER_SIZES[0];
  return orientation === 'landscape' ? { width: s.h, height: s.w } : { width: s.w, height: s.h };
}

export function templateInfo(kind: TemplateKind): TemplateInfo {
  return TEMPLATES.find((t) => t.kind === kind) ?? TEMPLATES[0];
}

/** テンプレートから作ったプロジェクトの名前（例：便箋（横書き） 11/20） */
export function templateName(o: TemplateOptions, now = new Date()): string {
  return `${templateInfo(o.kind).label} ${now.getMonth() + 1}/${now.getDate()}`;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 紙のレイアウトを作る */
export function layoutPaper(o: TemplateOptions): PaperLayout {
  const { width: W, height: H } = paperSize(o.size, o.orientation);
  const c = PAPER_COLORS.find((p) => p.key === o.color) ?? PAPER_COLORS[0];
  const out: PaperLayout = { width: W, height: H, bg: c.bg, marks: [], fields: [] };
  const short = Math.min(W, H);
  /** 小さい紙ほど余白・文字を小さくする */
  const s = clamp(short / 182, 0.55, 1.15);
  const m = clamp(short * 0.075, 7, 16);
  const line = (x1: number, y1: number, x2: number, y2: number, w = 0.25, color = c.line) =>
    out.marks.push({ t: 'line', x1, y1, x2, y2, w, color });
  const label = (x: number, y: number, text: string, align: 'left' | 'center' | 'right' = 'left', size = 3.6 * s, vertical = false) =>
    out.marks.push({ t: 'text', x, y, text, size, color: c.ink, align, vertical });
  /** 便箋・手紙のふちの飾り（二重線） */
  const border = () => {
    const i = m * 0.45;
    out.marks.push({ t: 'rect', x: i, y: i, width: W - i * 2, height: H - i * 2, w: 0.6, color: c.ink, r: 2.5 * s });
    out.marks.push({ t: 'rect', x: i + 1.4 * s, y: i + 1.4 * s, width: W - (i + 1.4 * s) * 2, height: H - (i + 1.4 * s) * 2, w: 0.25, color: c.ink, r: 1.8 * s });
  };
  /** 横罫を引いて、その範囲を返す（top から bottom まで gap ごと） */
  const hRules = (x1: number, x2: number, top: number, bottom: number, gap: number) => {
    const n = Math.max(1, Math.floor((bottom - top) / gap + 1e-6));
    for (let k = 0; k <= n; k++) line(x1, top + k * gap, x2, top + k * gap);
    return { x: x1, y: top, width: x2 - x1, height: n * gap };
  };
  /** 縦罫を右から引いて、その範囲を返す（right から left まで gap ごと） */
  const vRules = (left: number, right: number, top: number, bottom: number, gap: number) => {
    const n = Math.max(1, Math.floor((right - left) / gap + 1e-6));
    for (let k = 0; k <= n; k++) line(right - k * gap, top, right - k * gap, bottom);
    return { x: right - n * gap, y: top, width: n * gap, height: bottom - top, n };
  };

  switch (o.kind) {
    case 'blank':
      break;

    case 'grid': {
      const g = 5;
      const cols = Math.floor((W - m * 2) / g);
      const rows = Math.floor((H - m * 2) / g);
      const x0 = (W - cols * g) / 2;
      const y0 = (H - rows * g) / 2;
      for (let i = 0; i <= cols; i++) line(x0 + i * g, y0, x0 + i * g, y0 + rows * g, i % 2 === 0 ? 0.3 : 0.15);
      for (let j = 0; j <= rows; j++) line(x0, y0 + j * g, x0 + cols * g, y0 + j * g, j % 2 === 0 ? 0.3 : 0.15);
      break;
    }

    case 'noteA':
    case 'noteB': {
      const gap = o.kind === 'noteA' ? 7 : 6;
      // 上の見出し（日付）
      const head = m + 6 * s;
      const dw = 42 * s;
      label(W - m - dw - 1.5 * s, head - 1.2 * s, 'Date', 'right', 3.2 * s);
      line(m, head + 1.2 * s, W - m, head + 1.2 * s, 0.45, c.ink);
      const top = head + 1.2 * s + gap;
      const r = hRules(m, W - m, top, H - m, gap);
      // 左の余白線
      line(m + 12 * s, head + 1.2 * s, m + 12 * s, r.y + r.height, 0.3, c.ink);
      out.fields.push({ kind: 'field', rect: { x: W - m - dw, y: head - 6.4 * s, width: dw, height: 6 * s }, vertical: false, role: '日付' });
      out.fields.push({ kind: 'ruled', rect: { ...r, x: m + 13 * s, width: r.width - 13 * s }, gap, vertical: false, role: '本文' });
      break;
    }

    case 'letterH': {
      border();
      const gap = clamp(9 * s, 6, 10);
      const pad = m + 3 * s;
      const r = hRules(pad, W - pad, m + gap * 0.9, H - m - gap * 0.4, gap);
      out.fields.push({ kind: 'ruled', rect: r, gap, vertical: false, role: '本文' });
      break;
    }

    case 'letterV': {
      border();
      const gap = clamp(10 * s, 6.5, 11);
      const pad = m + 3 * s;
      const n = Math.floor((W - pad * 2) / gap);
      const right = W - (W - n * gap) / 2;
      const r = vRules(right - n * gap, right, m + 2 * s, H - m - 2 * s, gap);
      out.fields.push({ kind: 'ruled', rect: r, gap, vertical: true, role: '本文' });
      break;
    }

    case 'mailH': {
      border();
      const gap = clamp(9 * s, 6, 10);
      const pad = m + 3 * s;
      // 宛名（上）
      const nameY = m + gap * 1.6;
      const nameW = Math.min(W * 0.5, 80 * s);
      line(pad, nameY, pad + nameW, nameY, 0.45, c.ink);
      label(pad + nameW + 1.5 * s, nameY - 1.6 * s, 'さんへ', 'left', 4.4 * s);
      out.fields.push({ kind: 'field', rect: { x: pad, y: nameY - gap, width: nameW, height: gap }, vertical: false, role: '宛名' });
      // 日付・差出人（下）
      const footH = gap * 2.4;
      const body = hRules(pad, W - pad, nameY + gap * 0.9, H - m - footH - gap * 0.3, gap);
      out.fields.push({ kind: 'ruled', rect: body, gap, vertical: false, role: '本文' });
      const fw = Math.min(W * 0.45, 70 * s);
      const fx = W - pad - fw;
      const dateY = H - m - gap * 1.25;
      const fromY = H - m - gap * 0.15;
      label(fx - 1.5 * s, dateY - 1.6 * s, '日付', 'right', 3.4 * s);
      line(fx, dateY, W - pad, dateY, 0.35, c.ink);
      label(fx - 1.5 * s, fromY - 1.6 * s, 'より', 'right', 3.4 * s);
      line(fx, fromY, W - pad, fromY, 0.35, c.ink);
      out.fields.push({ kind: 'field', rect: { x: fx, y: dateY - gap * 0.95, width: fw, height: gap * 0.95 }, vertical: false, role: '日付' });
      out.fields.push({ kind: 'field', rect: { x: fx, y: fromY - gap * 0.95, width: fw, height: gap * 0.95 }, vertical: false, role: '差出人' });
      break;
    }

    case 'mailV': {
      border();
      const gap = clamp(10 * s, 6.5, 11);
      const pad = m + 3 * s;
      const n = Math.floor((W - pad * 2) / gap);
      const right = W - (W - n * gap) / 2;
      const top = m + 2 * s;
      const bottom = H - m - 2 * s;
      vRules(right - n * gap, right, top, bottom, gap);
      // 右から本文、そのあと（左側）に 日付・差出人・宛名 の列
      const bodyCols = Math.max(1, n - 4);
      out.fields.push({
        kind: 'ruled',
        rect: { x: right - bodyCols * gap, y: top, width: bodyCols * gap, height: bottom - top },
        gap,
        vertical: true,
        role: '本文',
      });
      const colX = (k: number) => right - (bodyCols + k + 1) * gap; // k 列目（0 = 本文のすぐ左）の左端
      const len = bottom - top;
      const lab = 3.8 * s;
      // 日付（本文の1列あけた次の列の上の方）
      label(colX(1) + gap / 2, top + 2 * s, '日付', 'center', lab, true);
      out.fields.push({ kind: 'field', rect: { x: colX(1), y: top + 2 * s + lab * 2.6, width: gap, height: len * 0.45 }, vertical: true, role: '日付' });
      // 差出人（下の方）
      label(colX(2) + gap / 2, bottom - 2 * s - lab * 2, 'より', 'center', lab, true);
      out.fields.push({ kind: 'field', rect: { x: colX(2), y: top + len * 0.45, width: gap, height: len * 0.55 - 4 * s - lab * 2.6 }, vertical: true, role: '差出人' });
      // 宛名（いちばん左の列の上）
      label(colX(3) + gap / 2, top + len * 0.62, 'さんへ', 'center', 4 * s, true);
      out.fields.push({ kind: 'field', rect: { x: colX(3), y: top + 2 * s, width: gap, height: len * 0.6 - 3 * s }, vertical: true, role: '宛名' });
      break;
    }

    case 'genkou': {
      // 1列20マスを基本に、紙の大きさに合わせてマスの大きさと列の数を決める（縦書き・右から）
      const availW = W - m * 2;
      const availH = H - m * 2 - 6 * s;
      let rows = 20;
      let cell = availH / rows;
      if (availW / cell < 10) {
        cell = availW / 10;
        rows = Math.floor(availH / cell);
      }
      cell = Math.floor(cell * 10) / 10;
      const cols = Math.floor(availW / cell);
      const gw = cols * cell;
      const gh = rows * cell;
      const x0 = (W - gw) / 2;
      const y0 = (H - gh) / 2 + 2 * s;
      for (let i = 1; i < cols; i++) line(x0 + i * cell, y0, x0 + i * cell, y0 + gh, 0.3, c.ink);
      for (let j = 1; j < rows; j++) line(x0, y0 + j * cell, x0 + gw, y0 + j * cell, 0.2, c.line);
      out.marks.push({ t: 'rect', x: x0, y: y0, width: gw, height: gh, w: 0.7, color: c.ink });
      label(x0 + gw, y0 - 2 * s, `${rows} × ${cols}`, 'right', 2.8 * s);
      out.fields.push({ kind: 'ruled', rect: { x: x0, y: y0, width: gw, height: gh }, gap: cell, vertical: true, cell, role: '本文' });
      break;
    }
  }
  return out;
}

/** レイアウトを canvas に描く（k = 1mm あたりのピクセル数） */
export function drawPaper(ctx: CanvasRenderingContext2D, l: PaperLayout, k: number, fontFamily: string): void {
  ctx.save();
  ctx.fillStyle = l.bg;
  ctx.fillRect(0, 0, l.width * k, l.height * k);
  ctx.scale(k, k);
  ctx.lineCap = 'butt';
  for (const mk of l.marks) {
    if (mk.t === 'line') {
      ctx.strokeStyle = mk.color;
      ctx.lineWidth = Math.max(mk.w, 1 / k);
      ctx.beginPath();
      ctx.moveTo(mk.x1, mk.y1);
      ctx.lineTo(mk.x2, mk.y2);
      ctx.stroke();
    } else if (mk.t === 'rect') {
      ctx.strokeStyle = mk.color;
      ctx.lineWidth = Math.max(mk.w, 1 / k);
      ctx.beginPath();
      if (mk.r && typeof ctx.roundRect === 'function') ctx.roundRect(mk.x, mk.y, mk.width, mk.height, mk.r);
      else ctx.rect(mk.x, mk.y, mk.width, mk.height);
      ctx.stroke();
    } else {
      ctx.fillStyle = mk.color;
      ctx.font = `${mk.size}px ${fontFamily}`;
      if (mk.vertical) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        [...mk.text].forEach((ch, i) => ctx.fillText(ch, mk.x, mk.y + mk.size * (i + 0.5)));
      } else {
        ctx.textAlign = mk.align;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(mk.text, mk.x, mk.y);
      }
    }
  }
  ctx.restore();
}
