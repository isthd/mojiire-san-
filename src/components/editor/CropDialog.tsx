// 切り抜き・傾き補正：四隅をドラッグして紙のふちに合わせると、まっすぐな長方形の画像にする。
// 90° 回転、紙のふちの自動検出もここで行う。
import { Maximize, RotateCcw, RotateCw, ScanLine } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '../../lib/geometry';
import { uid } from '../../lib/id';
import { detectPaper } from '../../lib/paperDetect';
import {
  axisAlignedRect,
  fullQuad,
  isValidQuad,
  makeForwardMap,
  outputSize,
  rotatedSize,
  warpPixels,
  type Quad,
} from '../../lib/perspective';
import { remapObjects } from '../../lib/remapObjects';
import { loadPageImage } from '../../storage/imageCache';
import { getImage, putImage } from '../../storage/projectRepo';
import { currentPageOf, useEditor } from '../../store/editorStore';
import { toast } from '../../store/toastStore';
import { pageUnit, type Page } from '../../types/model';
import { Button, cx } from '../ui/primitives';

/** 表示用に縮小する長い辺の上限 */
const DISPLAY_MAX = 1600;
/** 自動検出に使う縮小画像の長い辺 */
const DETECT_SIZE = 360;
const LOUPE = 120;
const LOUPE_ZOOM = 3;

/** 画像を時計回りに k×90° 回して scale 倍で描いた Canvas */
function rotatedCanvas(img: CanvasImageSource, w: number, h: number, k: number, scale: number): HTMLCanvasElement {
  const r = rotatedSize(w, h, k);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.width * scale));
  c.height = Math.max(1, Math.round(r.height * scale));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);
  ctx.translate(r.width / 2, r.height / 2);
  ctx.rotate((k * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

/** 表示用 Canvas から紙を探す（回転後の画像座標で返す） */
function detectOn(display: HTMLCanvasElement, fullW: number, fullH: number): Quad | null {
  const s = Math.min(1, DETECT_SIZE / Math.max(display.width, display.height));
  const w = Math.max(1, Math.round(display.width * s));
  const h = Math.max(1, Math.round(display.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(display, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
  const q = detectPaper(gray, w, h);
  if (!q) return null;
  const kx = fullW / w;
  const ky = fullH / h;
  return q.map((p) => ({ x: Math.min(fullW, p.x * kx), y: Math.min(fullH, p.y * ky) })) as Quad;
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

function canvasToBlob(c: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('画像に変換できませんでした'))), type, 0.92),
  );
}

/** 補正した画像を作って保存し、新しいページ（書き込みの位置も合わせたもの）を返す */
async function applyCrop(page: Page, img: HTMLImageElement, rot: number, quad: Quad): Promise<Page> {
  const st = useEditor.getState();
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const rotated = rotatedCanvas(img, srcW, srcH, rot, 1);
  const rect = axisAlignedRect(quad);
  let out: HTMLCanvasElement;
  let size: { width: number; height: number };
  if (rect) {
    // ただの切り抜き（と回転）なら画素をそのまま写す
    size = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    out = document.createElement('canvas');
    out.width = size.width;
    out.height = size.height;
    out.getContext('2d')!.drawImage(rotated, rect.x, rect.y, size.width, size.height, 0, 0, size.width, size.height);
  } else {
    size = outputSize(quad);
    const sctx = rotated.getContext('2d', { willReadFrequently: true })!;
    const src = sctx.getImageData(0, 0, rotated.width, rotated.height);
    out = document.createElement('canvas');
    out.width = size.width;
    out.height = size.height;
    const octx = out.getContext('2d')!;
    const dst = octx.createImageData(size.width, size.height);
    let last = performance.now();
    await warpPixels(src, quad, dst, async (rows) => {
      if (performance.now() - last < 80) return;
      st.setBusy({ message: '画像をまっすぐにしています…', progress: rows / size.height });
      await nextFrame();
      last = performance.now();
    });
    octx.putImageData(dst, 0, 0);
  }
  rotated.width = rotated.height = 0;

  const stored = await getImage(page.imageId);
  const type = stored?.blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(out, type);
  out.width = out.height = 0;
  const imageId = uid();
  await putImage({ id: imageId, projectId: st.projectId!, blob, width: size.width, height: size.height });

  // 大きさの倍率（画像を縮小して保存したときだけ 1 以外になる）
  const natural = outputSize(quad, Infinity);
  const scale = Math.sqrt((size.width * size.height) / (natural.width * natural.height));
  const map = makeForwardMap(srcW, srcH, rot, quad, size);
  return {
    ...page,
    imageId,
    width: size.width,
    height: size.height,
    unit: pageUnit(size.width, size.height),
    objects: remapObjects(page.objects, map, rot * 90, scale),
  };
}

type Handle = { kind: 'corner'; i: number } | { kind: 'edge'; i: number };

export function CropDialog() {
  const open = useEditor((s) => s.modal === 'crop');
  const page = useEditor((s) => (s.modal === 'crop' ? currentPageOf(s) : null));
  const setModal = useEditor((s) => s.setModal);
  if (!open || !page) return null;
  return <CropEditor key={page.id} page={page} onClose={() => setModal(null)} />;
}

function CropEditor({ page, onClose }: { page: Page; onClose: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rot, setRot] = useState(0);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [detected, setDetected] = useState<'yes' | 'no' | null>(null);
  const [working, setWorking] = useState(false);
  const [drag, setDrag] = useState<{ handle: Handle; start: Point; orig: Quad; pointerId: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const srcW = img?.naturalWidth ?? page.width;
  const srcH = img?.naturalHeight ?? page.height;
  const r = rotatedSize(srcW, srcH, rot);

  // 表示用の縮小・回転済み Canvas
  const display = useMemo(() => {
    if (!img) return null;
    const s = Math.min(1, DISPLAY_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    return rotatedCanvas(img, img.naturalWidth, img.naturalHeight, rot, s);
  }, [img, rot]);

  useEffect(() => {
    let alive = true;
    loadPageImage(page.imageId)
      .then((i) => alive && setImg(i))
      .catch(() => {
        toast('画像を読み込めませんでした', 'error');
        onClose();
      });
    return () => {
      alive = false;
    };
  }, [page.imageId, onClose]);

  // 最初に開いたときだけ紙のふちを自動で探す
  const autoDone = useRef(false);
  useEffect(() => {
    if (!display || !img || autoDone.current) return;
    autoDone.current = true;
    const q = detectOn(display, img.naturalWidth, img.naturalHeight);
    setQuad(q ?? fullQuad(img.naturalWidth, img.naturalHeight));
    setDetected(q ? 'yes' : null);
  }, [display, img]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setStage({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, working]);

  // 画面上の表示サイズ（周りに余白を取って、角のつまみを掴めるようにする）
  const pad = 28;
  const fit = Math.min((stage.width - pad * 2) / r.width, (stage.height - pad * 2) / r.height);
  const dispW = Math.max(1, r.width * fit);
  const dispH = Math.max(1, r.height * fit);
  /** 画面 1px あたりの画像ピクセル */
  const k = r.width / dispW;

  const rotate = (dir: 1 | -1) => {
    if (!quad) return;
    const nr = (rot + dir + 4) % 4;
    // 選んだ範囲も一緒に回す
    const turn = (p: Point): Point => (dir === 1 ? { x: r.height - p.y, y: p.x } : { x: p.y, y: r.width - p.x });
    const q = quad.map(turn);
    // 回したあとも左上から時計回りの順に
    const ordered = (dir === 1 ? [q[3], q[0], q[1], q[2]] : [q[1], q[2], q[3], q[0]]) as Quad;
    setRot(nr);
    setQuad(ordered);
  };

  const autoDetect = () => {
    if (!display) return;
    const q = detectOn(display, r.width, r.height);
    if (q) setQuad(q);
    setDetected(q ? 'yes' : 'no');
  };

  const toImage = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = svgRef.current!.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
    },
    [k],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!quad || drag || working) return;
    const p = toImage(e);
    const reach = 44 * k;
    let best: Handle | null = null;
    let bestD = reach;
    quad.forEach((c, i) => {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'corner', i };
      }
    });
    if (!best) {
      quad.forEach((c, i) => {
        const n = quad[(i + 1) % 4];
        const d = Math.hypot((c.x + n.x) / 2 - p.x, (c.y + n.y) / 2 - p.y);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'edge', i };
        }
      });
    }
    if (!best) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ handle: best, start: p, orig: quad, pointerId: e.pointerId });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = toImage(e);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    const clamp = (q: Point): Point => ({
      x: Math.min(r.width, Math.max(0, q.x)),
      y: Math.min(r.height, Math.max(0, q.y)),
    });
    const q = [...drag.orig] as Quad;
    const move = (i: number) => (q[i] = clamp({ x: drag.orig[i].x + dx, y: drag.orig[i].y + dy }));
    if (drag.handle.kind === 'corner') move(drag.handle.i);
    else {
      move(drag.handle.i);
      move((drag.handle.i + 1) % 4);
    }
    setQuad(q);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) setDrag(null);
  };

  // ルーペ：ドラッグ中の角のまわりを拡大して表示（指で隠れる部分を見せる）
  const loupePoint = drag && quad && drag.handle.kind === 'corner' ? quad[drag.handle.i] : null;
  useEffect(() => {
    const c = loupeRef.current;
    if (!c || !loupePoint || !display) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = LOUPE * dpr;
    c.height = LOUPE * dpr;
    const ctx = c.getContext('2d')!;
    const toDisp = display.width / r.width;
    const half = ((LOUPE / LOUPE_ZOOM) * k * toDisp) / 2;
    const cx0 = loupePoint.x * toDisp;
    const cy0 = loupePoint.y * toDisp;
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(display, cx0 - half, cy0 - half, half * 2, half * 2, 0, 0, c.width, c.height);
    // 選択中の四角形のふちも描く
    if (quad) {
      const sc = c.width / (half * 2);
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      quad.forEach((p, i) => {
        const x = (p.x * toDisp - (cx0 - half)) * sc;
        const y = (p.y * toDisp - (cy0 - half)) * sc;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 * dpr;
    const m = c.width / 2;
    ctx.beginPath();
    ctx.moveTo(m, m - 12 * dpr);
    ctx.lineTo(m, m + 12 * dpr);
    ctx.moveTo(m - 12 * dpr, m);
    ctx.lineTo(m + 12 * dpr, m);
    ctx.stroke();
  }, [loupePoint, display, k, r.width, quad]);

  const valid = !!quad && isValidQuad(quad);
  const unchanged =
    !!quad && rot === 0 && quad.every((p, i) => Math.hypot(p.x - fullQuad(r.width, r.height)[i].x, p.y - fullQuad(r.width, r.height)[i].y) < 0.5);

  const apply = async () => {
    if (!img || !quad || !valid) return;
    if (unchanged) {
      onClose();
      return;
    }
    setWorking(true);
    const st = useEditor.getState();
    st.setBusy({ message: '画像を補正しています…', progress: 0 });
    await nextFrame();
    try {
      const next = await applyCrop(page, img, rot, quad);
      useEditor.getState().replacePage(next);
      onClose();
      toast('画像を補正しました（元に戻すで戻せます）');
    } catch (e) {
      console.error(e);
      toast('画像の補正に失敗しました', 'error');
    } finally {
      useEditor.getState().setBusy(null);
      setWorking(false);
    }
  };

  const loupeOnRight = loupePoint ? loupePoint.x < r.width / 2 : false;

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-neutral-900 text-white" role="dialog" aria-modal="true" aria-label="切り抜き・まっすぐにする">
      <header
        className="flex shrink-0 items-center gap-2 px-2"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(52px + env(safe-area-inset-top))' }}
      >
        <button type="button" onClick={onClose} disabled={working} className="tap h-11 rounded-lg px-3 text-[16px] hover:bg-white/10">
          キャンセル
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">切り抜き・まっすぐにする</div>
        <button
          type="button"
          onClick={apply}
          disabled={!valid || working || !img}
          className="tap h-11 rounded-lg px-3 text-[16px] font-semibold text-[#4da3ff] hover:bg-white/10 disabled:opacity-40"
        >
          完了
        </button>
      </header>

      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden" style={{ touchAction: 'none' }}>
        {display && quad && stage.width > 0 && (
          <div
            ref={holderRef}
            className="absolute"
            style={{ width: dispW, height: dispH, left: (stage.width - dispW) / 2, top: (stage.height - dispH) / 2 }}
          >
            <CanvasView canvas={display} />
            <svg
              ref={svgRef}
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${r.width} ${r.height}`}
              style={{ overflow: 'visible', touchAction: 'none', cursor: drag ? 'grabbing' : 'default' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <path
                d={`M0 0H${r.width}V${r.height}H0Z M${quad.map((p) => `${p.x} ${p.y}`).join(' L')}Z`}
                fillRule="evenodd"
                fill="rgba(0,0,0,0.55)"
              />
              <polygon
                points={quad.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={valid ? '#0a84ff' : '#ff453a'}
                strokeWidth={2 * k}
              />
              {quad.map((c, i) => {
                const n = quad[(i + 1) % 4];
                return (
                  <rect
                    key={`e${i}`}
                    x={(c.x + n.x) / 2 - 7 * k}
                    y={(c.y + n.y) / 2 - 7 * k}
                    width={14 * k}
                    height={14 * k}
                    rx={4 * k}
                    fill="#fff"
                    stroke="#0a84ff"
                    strokeWidth={2 * k}
                  />
                );
              })}
              {quad.map((c, i) => (
                <circle
                  key={`c${i}`}
                  cx={c.x}
                  cy={c.y}
                  r={(drag?.handle.kind === 'corner' && drag.handle.i === i ? 13 : 11) * k}
                  fill="rgba(10,132,255,0.35)"
                  stroke="#fff"
                  strokeWidth={2.5 * k}
                />
              ))}
            </svg>
          </div>
        )}
        {!display && <div className="absolute inset-0 flex items-center justify-center text-[15px] text-white/70">画像を読み込み中…</div>}
        {loupePoint && (
          <canvas
            ref={loupeRef}
            className={cx('pointer-events-none absolute top-3 rounded-full ring-2 ring-white shadow-2xl', loupeOnRight ? 'right-3' : 'left-3')}
            style={{ width: LOUPE, height: LOUPE }}
          />
        )}
      </div>

      <footer className="shrink-0 px-3 pt-2" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <p className="mb-2 text-center text-[13px] leading-snug text-white/70" aria-live="polite">
          {!valid
            ? '四隅の順番がねじれています。角を紙のふちに合わせ直してください'
            : detected === 'yes'
              ? '紙のふちを自動で合わせました。ずれていたら角の ● をドラッグ'
              : detected === 'no'
                ? '紙のふちが見つかりませんでした。角の ● をドラッグして合わせてください'
                : '角の ● を紙の四隅に合わせると、まっすぐな画像になります'}
          {page.objects.length > 0 && <span className="block text-white/55">書き込みも新しい画像に合わせて移動します</span>}
        </p>
        <div className="mx-auto flex max-w-lg justify-center gap-2">
          <ToolButton label="左に回転" onClick={() => rotate(-1)} disabled={!quad || working}>
            <RotateCcw size={20} />
          </ToolButton>
          <ToolButton label="右に回転" onClick={() => rotate(1)} disabled={!quad || working}>
            <RotateCw size={20} />
          </ToolButton>
          <ToolButton label="自動検出" onClick={autoDetect} disabled={!display || working}>
            <ScanLine size={20} />
          </ToolButton>
          <ToolButton
            label="全体"
            onClick={() => {
              setQuad(fullQuad(r.width, r.height));
              setDetected(null);
            }}
            disabled={!quad || working}
          >
            <Maximize size={20} />
          </ToolButton>
        </div>
        <div className="mt-2 flex justify-center sm:hidden">
          <Button variant="primary" className="h-11 w-full max-w-lg" onClick={apply} disabled={!valid || working || !img}>
            完了
          </Button>
        </div>
      </footer>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[12px] text-white/90 hover:bg-white/10 disabled:opacity-40"
    >
      {children}
      {label}
    </button>
  );
}

/** 用意した Canvas をそのまま表示する */
function CanvasView({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    el.replaceChildren(canvas);
    return () => {
      el.replaceChildren();
    };
  }, [canvas]);
  return <div ref={ref} className="absolute inset-0" />;
}
