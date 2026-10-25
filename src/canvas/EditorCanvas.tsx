// 編集キャンバス。表示は react-konva、描画系の入力はネイティブ Pointer Events で処理する。
// すべての入力は screenToImage() で画像座標に変換してから扱うため、ズーム・移動中でも正確に配置できる。
import Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Image as KImage, Layer, Rect, Stage, Transformer } from 'react-konva';
import { usePageImage } from '../hooks/usePageImage';
import { rectFromPoints, screenToImage, simplifyPoints, snapAngle, zoomAt, type Point, type View } from '../lib/geometry';
import { currentPageOf, useEditor, type ToolType } from '../store/editorStore';
import { useSettings } from '../store/settingsStore';
import { ERASABLE_TYPES, type EditorObject, type LineObject, type StrokeObject } from '../types/model';
import { buildNode, describeObject } from './describe';
import { createLine, createShape, createStroke, createText, settingsFromObject, settingsKeyFor } from './objectFactory';
import { ObjectNode } from './ObjectNode';
import { beginTextEdit } from './textEditController';
import { bakeTransform } from './transformBake';
import { fitToScreen, setUserView, viewport } from './viewActions';

Konva.dragDistance = 4;

type ShapeTool = 'line' | 'arrow' | 'rect' | 'ellipse' | 'triangle' | 'hl-line';

type Gesture =
  | { kind: 'none' }
  | { kind: 'ignore' }
  | { kind: 'pan'; id: number; start: Point; view0: View }
  | { kind: 'pinch'; ids: [number, number]; d0: number; m0: Point; view0: View }
  | {
      kind: 'draw';
      id: number;
      pointerType: string;
      tool: 'pen' | 'highlighter';
      pts: number[];
      smooth: Point;
      lastScreen: Point;
      line: Konva.Line;
    }
  | { kind: 'shape'; id: number; tool: ShapeTool; start: Point; startScreen: Point; cur: Point; shift: boolean }
  | { kind: 'erase'; id: number; key: string; erased: Set<string>; lastScreen: Point }
  | { kind: 'tap'; id: number; tool: 'text' | 'math'; startScreen: Point; view0: View };

const DRAW_TOOLS = new Set<ToolType>(['pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'triangle', 'eraser', 'text', 'math']);
const SHAPE_TOOLS = new Set<ToolType>(['line', 'arrow', 'rect', 'ellipse', 'triangle']);

const CURSORS: Record<ToolType, string> = {
  select: 'default',
  text: 'text',
  math: 'copy',
  pen: 'crosshair',
  highlighter: 'crosshair',
  line: 'crosshair',
  arrow: 'crosshair',
  rect: 'crosshair',
  ellipse: 'crosshair',
  triangle: 'crosshair',
  eraser: 'cell',
  hand: 'grab',
};

function findObjId(node: Konva.Node | null | undefined): string | null {
  if (!node) return null;
  const g = node.name() === 'obj' ? node : node.findAncestor('.obj');
  return g ? g.id() : null;
}

/** 進行中・開始待ちの Konva のドラッグをすべて止める */
export function cancelCanvasDrags(): void {
  const dd = (Konva as unknown as { DD?: { _dragElements?: Map<number, { node: Konva.Node }> } }).DD;
  const els = dd?._dragElements;
  if (!els?.size) return;
  for (const el of [...els.values()]) el.node.stopDrag();
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'MATH-FIELD'].includes(t.tagName);
}

/** 描画中の仮オブジェクト（スタイルは確定後と同じ記述を使う） */
function draftObjectFor(g: Extract<Gesture, { kind: 'shape' }>, unit: number): EditorObject {
  const settings = useSettings.getState().tools;
  const angleSnap = useSettings.getState().app.angleSnap;
  if (g.tool === 'line' || g.tool === 'arrow' || g.tool === 'hl-line') {
    const end = angleSnap || g.shift ? snapAngle(g.start, g.cur, g.shift, 15, angleSnap ? 4 : 0) : g.cur;
    if (g.tool === 'hl-line') {
      return createStroke('highlighter', [g.start.x, g.start.y, end.x, end.y], settings.highlighter, unit);
    }
    return createLine(g.tool, g.start, end, settings, unit);
  }
  const square = g.shift;
  return createShape(g.tool, rectFromPoints(g.start, g.cur, square), settings.shape, unit);
}

export function EditorCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const objLayerRef = useRef<Konva.Layer>(null);
  const draftLayerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const gesture = useRef<Gesture>({ kind: 'none' });
  const pointers = useRef(new Map<number, Point & { type: string }>());
  const spaceDown = useRef(false);
  const fittedPage = useRef<string | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [spacePan, setSpacePan] = useState(false);
  const page = useEditor((s) => currentPageOf(s));
  const view = useEditor((s) => s.view);
  const tool = useEditor((s) => s.tool);
  const selectedIds = useEditor((s) => s.selectedIds);
  const editingId = useEditor((s) => s.textEdit?.obj.id ?? null);
  const epoch = useEditor((s) => s.renderEpoch);
  const { image: pageImage, error: imageError } = usePageImage(page?.imageId);
  const coarse = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches ?? false, []);

  // 表示領域のサイズ監視
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dw = Math.abs(r.width - viewport.width);
      const dh = Math.abs(r.height - viewport.height);
      viewport.width = r.width;
      viewport.height = r.height;
      setSize({ width: Math.round(r.width), height: Math.round(r.height) });
      // 画面回転やウィンドウサイズ変更時、手動でズームしていなければ合わせ直す。
      // 下部バーの高さが変わっただけ（オブジェクトを選んだ・ページ一覧を開いた等）では合わせ直さない
      // （選ぶたびにページが拡大・縮小して位置がずれるのを防ぐ）
      if (viewport.autoFit && (dw > 1 || dh > 160)) fitToScreen();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ページ切り替え時・画像の差し替え（切り抜きなど）で大きさが変わったときに画面に合わせる
  useEffect(() => {
    if (!page || !size.width || !size.height) return;
    const key = `${page.id}:${page.width}x${page.height}`;
    if (fittedPage.current !== key) {
      fittedPage.current = key;
      viewport.autoFit = true;
      fitToScreen();
    }
  }, [page, size.width, size.height]);

  // Webフォントの読み込み完了後に再描画・再計測
  useEffect(() => {
    if (!document.fonts) return;
    const onDone = () => useEditor.getState().bumpRenderEpoch();
    document.fonts.addEventListener('loadingdone', onDone);
    return () => document.fonts.removeEventListener('loadingdone', onDone);
  }, []);

  // ボタンを押していないのにドラッグが続く状態（ダブルタップで入力画面を開いた直後など）を防ぐ。
  // Konva はポインターのボタン状態を見ないため、ボタンなしの移動を検知したらドラッグを止める。
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.buttons === 0 && e.pointerType !== 'touch') cancelCanvasDrags();
    };
    window.addEventListener('pointermove', onMove, true);
    return () => window.removeEventListener('pointermove', onMove, true);
  }, []);

  // スペースキー押下中は一時的に手のひらツール
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target) && !e.repeat) {
        spaceDown.current = true;
        setSpacePan(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        setSpacePan(false);
      }
    };
    // Space を押したまま別のウィンドウへ移ると keyup が来ず、手のひらのまま戻らなくなるのを防ぐ
    const reset = () => {
      spaceDown.current = false;
      setSpacePan(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, []);

  // ===== 入力処理（ネイティブ Pointer Events） =====
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const local = (e: { clientX: number; clientY: number }): Point => {
      const r = wrap.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const capture = (id: number) => {
      try {
        wrap.setPointerCapture(id);
      } catch {
        /* 既に解放済み */
      }
    };
    const draftLayer = () => draftLayerRef.current;
    const clearDraft = () => {
      const l = draftLayer();
      if (l) {
        l.destroyChildren();
        l.batchDraw();
      }
    };
    const touchPoints = () => [...pointers.current.entries()].filter(([, p]) => p.type === 'touch');

    const stopKonvaInteractions = () => {
      const tr = trRef.current;
      if (tr?.isTransforming()) tr.stopTransform();
      const layer = objLayerRef.current;
      if (!layer) return;
      for (const id of useEditor.getState().selectedIds) {
        const n = layer.findOne('#' + id);
        if (n?.isDragging()) n.stopDrag();
      }
    };

    const startPan = (id: number, p: Point) => {
      gesture.current = { kind: 'pan', id, start: p, view0: useEditor.getState().view };
      capture(id);
    };

    const eraseAt = (p: Point) => {
      const g = gesture.current;
      const stage = stageRef.current;
      if (g.kind !== 'erase' || !stage) return;
      const st = useEditor.getState();
      const pg = currentPageOf(st);
      if (!pg) return;
      const r = coarse ? 10 : 6;
      const found: string[] = [];
      for (const [dx, dy] of [
        [0, 0],
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ]) {
        const id = findObjId(stage.getIntersection({ x: p.x + dx, y: p.y + dy }));
        if (id && !g.erased.has(id)) {
          const obj = pg.objects.find((o) => o.id === id);
          if (obj && ERASABLE_TYPES.has(obj.type)) {
            g.erased.add(id);
            found.push(id);
          }
        }
      }
      if (found.length) st.deleteObjects(found, g.key);
    };

    const updateShapeDraft = () => {
      const g = gesture.current;
      const layer = draftLayer();
      const pg = currentPageOf(useEditor.getState());
      if (g.kind !== 'shape' || !layer || !pg) return;
      layer.destroyChildren();
      layer.add(buildNode(describeObject(draftObjectFor(g, pg.unit), { mathImage: null, hitPad: 0 })) as Konva.Group);
      layer.batchDraw();
    };

    const setDraftBlend = (multiply: boolean) => {
      const canvas = draftLayer()?.getNativeCanvasElement();
      if (canvas) canvas.style.mixBlendMode = multiply ? 'multiply' : 'normal';
    };

    const onDown = (e: PointerEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      const p = local(e);
      // 1本目の指が触れた時点で他の指は離れているはず。pointerup を取りこぼした指が残っていると
      // 次の1本指の操作がピンチと誤判定されるため、ここで掃除する
      if (e.pointerType === 'touch' && e.isPrimary) {
        const stale = new Set<number>();
        for (const [id, q] of pointers.current) if (q.type === 'touch') stale.add(id);
        stale.forEach((id) => pointers.current.delete(id));
        const cur = gesture.current;
        const owner = 'id' in cur ? cur.id : cur.kind === 'pinch' ? cur.ids[0] : null;
        if (cur.kind === 'ignore' || (owner !== null && stale.has(owner))) {
          if (cur.kind === 'draw' || cur.kind === 'shape') clearDraft();
          gesture.current = { kind: 'none' };
        }
      }
      pointers.current.set(e.pointerId, { ...p, type: e.pointerType });
      const g = gesture.current;
      const st = useEditor.getState();

      // ペンで描画中は手のひらの接触を無視（誤タッチ防止）
      if (g.kind === 'draw' && g.pointerType === 'pen' && e.pointerType === 'touch') return;

      // 2本指 → ピンチズーム・移動
      const touches = touchPoints();
      if (e.pointerType === 'touch' && touches.length === 2) {
        if (g.kind === 'draw' || g.kind === 'shape') clearDraft();
        stopKonvaInteractions();
        const [[ida, a], [idb, b]] = touches;
        gesture.current = {
          kind: 'pinch',
          ids: [ida, idb],
          d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          view0: st.view,
        };
        capture(ida);
        capture(idb);
        return;
      }
      if (g.kind !== 'none') return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;

      if (st.textEdit) st.commitTextEdit();
      const pg = currentPageOf(st);
      if (!pg) return;

      const app = useSettings.getState().app;
      const penOnlyTouch = app.penOnly && e.pointerType === 'touch' && DRAW_TOOLS.has(st.tool);
      if (e.button === 1 || spaceDown.current || st.tool === 'hand' || penOnlyTouch) {
        e.preventDefault();
        startPan(e.pointerId, p);
        return;
      }

      const img = screenToImage(p, st.view);
      const hit = stage.getIntersection(p);
      const hitUi = !!hit && !findObjId(hit); // 変形ハンドル・端点ハンドル

      switch (st.tool) {
        case 'select': {
          if (hit) return; // オブジェクト操作は Konva に任せる
          if (st.selectedIds.length) st.select([]);
          startPan(e.pointerId, p);
          return;
        }
        case 'text':
        case 'math':
          gesture.current = { kind: 'tap', id: e.pointerId, tool: st.tool, startScreen: p, view0: st.view };
          capture(e.pointerId);
          return;
        case 'pen':
        case 'highlighter': {
          const tools = useSettings.getState().tools;
          if (st.tool === 'highlighter' && tools.highlighter.straight) {
            if (st.selectedIds.length) st.select([]);
            gesture.current = { kind: 'shape', id: e.pointerId, tool: 'hl-line', start: img, startScreen: p, cur: img, shift: e.shiftKey };
            setDraftBlend(true);
            capture(e.pointerId);
            return;
          }
          const layer = draftLayer();
          if (!layer) return;
          const temp: StrokeObject = {
            ...createStroke(st.tool, [img.x, img.y, img.x + 0.01, img.y], st.tool === 'pen' ? tools.pen : tools.highlighter, pg.unit),
            x: 0,
            y: 0,
            points: [img.x, img.y, img.x + 0.01, img.y],
          };
          layer.destroyChildren();
          const group = buildNode(describeObject(temp, { mathImage: null, hitPad: 0 })) as Konva.Group;
          layer.add(group);
          setDraftBlend(st.tool === 'highlighter');
          layer.batchDraw();
          gesture.current = {
            kind: 'draw',
            id: e.pointerId,
            pointerType: e.pointerType,
            tool: st.tool,
            pts: [img.x, img.y],
            smooth: img,
            lastScreen: p,
            line: group.findOne('Line') as Konva.Line,
          };
          capture(e.pointerId);
          e.preventDefault();
          return;
        }
        case 'line':
        case 'arrow':
        case 'rect':
        case 'ellipse':
        case 'triangle':
          if (hitUi) return;
          if (st.selectedIds.length) st.select([]);
          gesture.current = { kind: 'shape', id: e.pointerId, tool: st.tool, start: img, startScreen: p, cur: img, shift: e.shiftKey };
          setDraftBlend(false);
          capture(e.pointerId);
          return;
        case 'eraser':
          gesture.current = { kind: 'erase', id: e.pointerId, key: 'erase-' + Date.now(), erased: new Set(), lastScreen: p };
          capture(e.pointerId);
          eraseAt(p);
          return;
      }
    };

    const onMove = (e: PointerEvent) => {
      const known = pointers.current.get(e.pointerId);
      if (!known) return;
      // pointerup を取りこぼした場合（ウィンドウ外で離した等）は操作を終了して固まらないようにする
      if (e.buttons === 0 && e.pointerType !== 'touch') {
        finish(e);
        return;
      }
      const p = local(e);
      pointers.current.set(e.pointerId, { ...p, type: known.type });
      const g = gesture.current;
      const st = useEditor.getState();

      switch (g.kind) {
        case 'pinch': {
          const a = pointers.current.get(g.ids[0]);
          const b = pointers.current.get(g.ids[1]);
          if (!a || !b) return;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const z = g.view0.zoom * (d / g.d0);
          // 開始時の中点の画像座標が、現在の中点に来るように
          const v = zoomAt(g.view0, z, g.m0);
          setUserView({ zoom: v.zoom, x: v.x + (m.x - g.m0.x), y: v.y + (m.y - g.m0.y) });
          return;
        }
        case 'pan':
          if (e.pointerId !== g.id) return;
          setUserView({ ...g.view0, x: g.view0.x + p.x - g.start.x, y: g.view0.y + p.y - g.start.y });
          return;
        case 'tap':
          if (e.pointerId !== g.id) return;
          if (Math.hypot(p.x - g.startScreen.x, p.y - g.startScreen.y) > 10) {
            gesture.current = { kind: 'pan', id: g.id, start: g.startScreen, view0: g.view0 };
            setUserView({ ...g.view0, x: g.view0.x + p.x - g.startScreen.x, y: g.view0.y + p.y - g.startScreen.y });
          }
          return;
        case 'draw': {
          if (e.pointerId !== g.id) return;
          const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
          const list = events.length ? events : [e];
          let added = false;
          for (const ev of list) {
            const sp = local(ev);
            if (Math.hypot(sp.x - g.lastScreen.x, sp.y - g.lastScreen.y) < 1) continue;
            g.lastScreen = sp;
            const ip = screenToImage(sp, st.view);
            // 軽い手ぶれ補正（指数移動平均）
            g.smooth = { x: g.smooth.x + (ip.x - g.smooth.x) * 0.55, y: g.smooth.y + (ip.y - g.smooth.y) * 0.55 };
            g.pts.push(g.smooth.x, g.smooth.y);
            added = true;
          }
          if (added) {
            g.line.points(g.pts.length >= 4 ? g.pts : [...g.pts, g.pts[0] + 0.01, g.pts[1]]);
            draftLayerRef.current?.batchDraw();
          }
          return;
        }
        case 'shape':
          if (e.pointerId !== g.id) return;
          g.cur = screenToImage(p, st.view);
          g.shift = e.shiftKey;
          updateShapeDraft();
          return;
        case 'erase': {
          if (e.pointerId !== g.id) return;
          // 速く動かしても取りこぼさないよう補間
          const dist = Math.hypot(p.x - g.lastScreen.x, p.y - g.lastScreen.y);
          const steps = Math.max(1, Math.ceil(dist / 6));
          for (let i = 1; i <= steps; i++) {
            eraseAt({
              x: g.lastScreen.x + ((p.x - g.lastScreen.x) * i) / steps,
              y: g.lastScreen.y + ((p.y - g.lastScreen.y) * i) / steps,
            });
          }
          g.lastScreen = p;
          return;
        }
      }
    };

    const finish = (e: PointerEvent) => {
      const g = gesture.current;
      const p = pointers.current.get(e.pointerId) ?? local(e);
      pointers.current.delete(e.pointerId);
      const st = useEditor.getState();
      const pg = currentPageOf(st);

      switch (g.kind) {
        case 'pinch':
          if (g.ids.includes(e.pointerId)) gesture.current = { kind: 'ignore' };
          break;
        case 'ignore':
          break;
        case 'pan':
          if (g.id === e.pointerId) gesture.current = { kind: 'none' };
          break;
        case 'tap': {
          if (g.id !== e.pointerId) break;
          gesture.current = { kind: 'none' };
          if (!pg) break;
          const stage = stageRef.current;
          const hitId = stage ? findObjId(stage.getIntersection(p)) : null;
          const hitObj = hitId ? pg.objects.find((o) => o.id === hitId) : undefined;
          const img = screenToImage(p, st.view);
          if (g.tool === 'text') {
            if (hitObj?.type === 'text') beginTextEdit(hitObj, false);
            else beginTextEdit(createText(img, useSettings.getState().tools.text, pg.unit), true);
          } else if (hitObj?.type === 'math') {
            st.openMathEditor({ targetId: hitObj.id, at: null, initialLatex: hitObj.latex });
          } else {
            st.openMathEditor({ targetId: null, at: img, initialLatex: '' });
          }
          break;
        }
        case 'draw': {
          if (g.id !== e.pointerId) break;
          gesture.current = { kind: 'none' };
          clearDraft();
          if (!pg) break;
          const last = screenToImage(p, st.view);
          const pts = [...g.pts, last.x, last.y];
          let simplified = simplifyPoints(pts, 0.3 / st.view.zoom);
          if (simplified.length < 4) simplified = [pts[0], pts[1], pts[0] + 0.01, pts[1]];
          const tools = useSettings.getState().tools;
          st.addObject(createStroke(g.tool, simplified, g.tool === 'pen' ? tools.pen : tools.highlighter, pg.unit));
          break;
        }
        case 'shape': {
          if (g.id !== e.pointerId) break;
          gesture.current = { kind: 'none' };
          clearDraft();
          if (!pg) break;
          if (Math.hypot(p.x - g.startScreen.x, p.y - g.startScreen.y) < 4) break; // タップだけなら作成しない
          g.cur = screenToImage(p, st.view);
          const obj = draftObjectFor(g, pg.unit);
          st.addObject(obj, { select: g.tool !== 'hl-line' });
          break;
        }
        case 'erase':
          if (g.id === e.pointerId) gesture.current = { kind: 'none' };
          break;
      }
      if (gesture.current.kind === 'ignore' && pointers.current.size === 0) gesture.current = { kind: 'none' };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useEditor.getState();
      const p = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const k = e.ctrlKey || e.metaKey ? 0.01 : 0.0018;
      const factor = Math.exp(-e.deltaY * unit * k);
      setUserView(zoomAt(st.view, st.view.zoom * factor, p));
    };

    const prevent = (e: Event) => e.preventDefault();

    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', finish);
    wrap.addEventListener('pointercancel', finish);
    wrap.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('contextmenu', prevent);
    // iOS Safari のページ全体ズームを抑止
    wrap.addEventListener('gesturestart', prevent);
    wrap.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', finish);
      wrap.removeEventListener('pointercancel', finish);
      wrap.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('contextmenu', prevent);
      wrap.removeEventListener('gesturestart', prevent);
      wrap.removeEventListener('touchmove', prevent);
    };
  }, [coarse]);

  // ===== 選択・変形ハンドル =====
  const objects = page?.objects;
  const selectedObjs = useMemo(
    () => (objects ?? []).filter((o) => selectedIds.includes(o.id)),
    [objects, selectedIds],
  );
  const singleLine =
    selectedObjs.length === 1 && (selectedObjs[0].type === 'line' || selectedObjs[0].type === 'arrow')
      ? (selectedObjs[0] as LineObject)
      : null;
  const showHandles = (tool === 'select' || SHAPE_TOOLS.has(tool)) && !editingId;

  useEffect(() => {
    const tr = trRef.current;
    const layer = objLayerRef.current;
    if (!tr || !layer) return;
    const nodes =
      !showHandles || singleLine
        ? []
        : selectedIds.map((id) => layer.findOne('#' + id)).filter((n): n is Konva.Node => !!n);
    const allShapes = selectedObjs.length > 0 && selectedObjs.every((o) => ['rect', 'ellipse', 'triangle'].includes(o.type));
    tr.nodes(nodes);
    tr.keepRatio(!allShapes);
    tr.enabledAnchors(
      allShapes
        ? ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']
        : ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    );
    tr.getLayer()?.batchDraw();
  }, [selectedIds, selectedObjs, singleLine, showHandles, epoch]);

  const onTransformEnd = () => {
    const tr = trRef.current;
    const st = useEditor.getState();
    const pg = currentPageOf(st);
    if (!tr || !pg) return;
    const patches: Record<string, Partial<EditorObject>> = {};
    for (const node of tr.nodes()) {
      const obj = pg.objects.find((o) => o.id === node.id());
      if (!obj) continue;
      const { patch, node: attrs } = bakeTransform(obj, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      });
      node.setAttrs(attrs);
      patches[obj.id] = patch;
    }
    st.updateObjects(patches);
    // 変形後の見た目を次回のツール設定として記憶
    const ids = Object.keys(patches);
    if (ids.length === 1) {
      const updated = currentPageOf(useEditor.getState())?.objects.find((o) => o.id === ids[0]);
      if (updated && (updated.type === 'text' || updated.type === 'math')) {
        useSettings.getState().setTool(settingsKeyFor(updated), settingsFromObject(updated, pg.unit));
      }
    }
  };

  // ===== オブジェクトレイヤーのイベント（選択ツール） =====
  const onLayerPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const st = useEditor.getState();
    if (st.tool !== 'select') return;
    const id = findObjId(e.target);
    if (!id) return;
    if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
      st.select(st.selectedIds.includes(id) ? st.selectedIds.filter((s) => s !== id) : [...st.selectedIds, id]);
    } else if (!st.selectedIds.includes(id)) {
      st.select([id]);
    }
  };

  const onLayerDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const layer = objLayerRef.current;
    const st = useEditor.getState();
    const pg = currentPageOf(st);
    if (!layer || !pg || !findObjId(e.target)) return;
    const ids = new Set([...st.selectedIds, findObjId(e.target)!]);
    const patches: Record<string, Partial<EditorObject>> = {};
    for (const o of pg.objects) {
      if (!ids.has(o.id)) continue;
      const n = layer.findOne('#' + o.id);
      if (n && (Math.abs(n.x() - o.x) > 1e-6 || Math.abs(n.y() - o.y) > 1e-6)) patches[o.id] = { x: n.x(), y: n.y() };
    }
    if (Object.keys(patches).length) st.updateObjects(patches);
  };

  // 文字枠（未入力の枠を含む）はダブルタップで入力を始める（1回のタップは選択・移動のみ）
  const onLayerDblTap = (e: Konva.KonvaEventObject<Event>) => {
    const st = useEditor.getState();
    if (st.tool !== 'select') return;
    const pg = currentPageOf(st);
    const obj = pg?.objects.find((o) => o.id === findObjId(e.target));
    if (obj?.type === 'text' || obj?.type === 'math') cancelCanvasDrags();
    if (obj?.type === 'text') beginTextEdit(obj, false);
    else if (obj?.type === 'math') st.openMathEditor({ targetId: obj.id, at: null, initialLatex: obj.latex });
  };

  const hitPad = page ? 12 * page.unit : 10;
  const anchor = coarse ? 22 : 11;
  const cursor = spacePan ? 'grab' : CURSORS[tool];

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden select-none"
      style={{ touchAction: 'none', cursor, WebkitTouchCallout: 'none' } as React.CSSProperties}
      data-testid="editor-canvas"
    >
      {size.width > 0 && page && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.zoom}
          scaleY={view.zoom}
        >
          <Layer
            ref={objLayerRef}
            onPointerDown={onLayerPointerDown}
            onDragEnd={onLayerDragEnd}
            onDblClick={onLayerDblTap}
            onDblTap={onLayerDblTap}
          >
            <Rect
              width={page.width}
              height={page.height}
              fill="#ffffff"
              shadowColor="rgba(0,0,0,0.22)"
              shadowBlur={18 / view.zoom}
              shadowOffsetY={3 / view.zoom}
              listening={false}
              perfectDrawEnabled={false}
            />
            {pageImage && <KImage image={pageImage} width={page.width} height={page.height} listening={false} />}
            {page.objects.map((o) => (
              <ObjectNode
                key={o.id}
                obj={o}
                hitPad={hitPad}
                hidden={o.id === editingId}
                draggable={tool === 'select'}
                epoch={epoch}
              />
            ))}
          </Layer>
          <Layer ref={draftLayerRef} listening={false} />
          <Layer>
            <Transformer
              ref={trRef}
              rotateEnabled
              flipEnabled={false}
              ignoreStroke
              anchorSize={anchor}
              anchorCornerRadius={anchor / 2}
              anchorStroke="#0a84ff"
              anchorFill="#ffffff"
              anchorStrokeWidth={1.5}
              borderStroke="#0a84ff"
              borderStrokeWidth={1.5}
              borderDash={[4, 3]}
              rotateAnchorOffset={coarse ? 34 : 26}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              padding={4}
              onTransformEnd={onTransformEnd}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 6 || Math.abs(newBox.height) < 6 ? oldBox : newBox)}
            />
            {singleLine && showHandles && <LineHandles obj={singleLine} zoom={view.zoom} coarse={coarse} />}
          </Layer>
        </Stage>
      )}
      {page && !pageImage && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          {imageError ? '画像を読み込めませんでした' : '画像を読み込み中…'}
        </div>
      )}
    </div>
  );
}

/** 直線・矢印の端点ハンドル */
function LineHandles({ obj, zoom, coarse }: { obj: LineObject; zoom: number; coarse: boolean }) {
  const r = (coarse ? 13 : 8) / zoom;
  const pts = [
    { x: obj.x + obj.points[0], y: obj.y + obj.points[1] },
    { x: obj.x + obj.points[2], y: obj.y + obj.points[3] },
  ];
  const onMove = (idx: 0 | 1) => (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const other = pts[1 - idx];
    const angleSnap = useSettings.getState().app.angleSnap;
    let p = { x: node.x(), y: node.y() };
    if (angleSnap || e.evt.shiftKey) p = snapAngle(other, p, e.evt.shiftKey, 15, angleSnap ? 4 : 0);
    node.position(p);
    const a = idx === 0 ? p : other;
    const b = idx === 0 ? other : p;
    useEditor.getState().updateObjects(
      { [obj.id]: { x: a.x, y: a.y, points: [0, 0, b.x - a.x, b.y - a.y] } as Partial<LineObject> },
      'handle-' + obj.id,
    );
  };
  return (
    <>
      {pts.map((p, i) => (
        <Circle
          key={i}
          name="handle"
          x={p.x}
          y={p.y}
          radius={r}
          fill="#ffffff"
          stroke="#0a84ff"
          strokeWidth={2 / zoom}
          hitStrokeWidth={10 / zoom}
          draggable
          onDragMove={onMove(i as 0 | 1)}
        />
      ))}
    </>
  );
}
