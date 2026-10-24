// 画面下部の操作バー。
// ・何も選択していないとき：［描く］［回答欄］（⊕ 文字を追加）［画像］
// ・オブジェクト選択中：アイコンのタブ＋設定欄＋ゴミ箱
// ・描画ツール使用中：ツール一覧＋色・太さ＋［完了］
import {
  Baseline,
  CaseSensitive,
  Check,
  Circle,
  CopyPlus,
  Eraser,
  Highlighter,
  ImagePlus,
  Minus,
  MoveUpRight,
  PaintBucket,
  Palette,
  Pen,
  PenLine,
  Pencil,
  Plus,
  RotateCw,
  ScanText,
  Square,
  Trash2,
  Triangle,
  UnfoldVertical,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { autoPlaceAnswerFields } from '../../canvas/autoFields';
import { objectPatchFromSettings, settingsFromObject, settingsKeyFor } from '../../canvas/objectFactory';
import { addTextAtCenter } from '../../canvas/textEditController';
import { currentPageOf, selectedObjects, useEditor, type ToolType } from '../../store/editorStore';
import { useSettings, type ToolSettings, type ToolSettingsKey } from '../../store/settingsStore';
import { FONT_OPTIONS, type DashStyle, type EditorObject } from '../../types/model';
import { COLOR_SWATCHES, cx, HIGHLIGHT_SWATCHES, IconButton } from '../ui/primitives';

// ===== 小さな部品 =====

const r1 = (v: number) => Math.round(v * 10) / 10;

/** −［値］＋ のステッパー（値は直接入力も可） */
function Stepper({
  label,
  value,
  step,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  // 入力中の文字列（確定するまで範囲外・空欄でも書き換えない。例：24 → 消して 18 と打ち直せるように）
  const [draft, setDraft] = useState<string | null>(null);
  const commitDraft = () => {
    if (draft === null) return;
    const v = Number(draft);
    // 範囲外の値は端の値にそろえる（空欄・範囲内は入力中に反映済み）
    if (draft.trim() !== '' && Number.isFinite(v) && (v < min || v > max)) onChange(clamp(v));
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] whitespace-nowrap text-neutral-500">{label}</span>
      <div className="flex items-center rounded-xl bg-neutral-100">
        <button
          type="button"
          aria-label={`${label}を小さく`}
          className="tap flex h-10 w-11 items-center justify-center rounded-l-xl hover:bg-neutral-200 active:bg-neutral-300"
          onClick={() => {
            setDraft(null);
            onChange(clamp(value - step));
          }}
        >
          <Minus size={18} />
        </button>
        <label className="flex items-baseline">
          <input
            type="number"
            inputMode="decimal"
            aria-label={label}
            value={draft ?? r1(value)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              // 範囲内の値はその場で反映（範囲外・空欄は確定時に補正）
              const v = Number(raw);
              if (raw.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(clamp(v));
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
            className="h-10 w-12 bg-transparent text-center text-[15px] font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {suffix && <span className="-ml-1 pr-1 text-[11px] text-neutral-500">{suffix}</span>}
        </label>
        <button
          type="button"
          aria-label={`${label}を大きく`}
          className="tap flex h-10 w-11 items-center justify-center rounded-r-xl hover:bg-neutral-200 active:bg-neutral-300"
          onClick={() => {
            setDraft(null);
            onChange(clamp(value + step));
          }}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

const EXTRA_COLORS = ['#ffe14d', '#ff9500', '#a2845e', '#5ac8fa', '#34c759', '#af52de', '#ff6b81', '#1c3d8f', '#7a0b0b'];

/** 横にスクロールできる色の列（選択中は二重リング） */
function SwatchRow({
  value,
  onChange,
  allowNone,
  colors = [...COLOR_SWATCHES, ...EXTRA_COLORS],
  label,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
  colors?: string[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto px-1 py-1.5">
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="なし"
          title="なし"
          onClick={() => onChange(null)}
          className={cx('swatch relative shrink-0 overflow-hidden bg-white', value === null && 'swatch-active')}
        >
          <span className="absolute top-1/2 left-1/2 h-[2px] w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#ff3b30]" />
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value?.toLowerCase() === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={cx('swatch shrink-0', value?.toLowerCase() === c && 'swatch-active')}
          style={{ background: c }}
        />
      ))}
      <label
        className={cx('swatch relative shrink-0 cursor-pointer overflow-hidden', value && !colors.includes(value.toLowerCase()) && 'swatch-active')}
        title="その他の色"
        style={{
          background:
            value && !colors.includes(value.toLowerCase()) ? value : 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
        }}
      >
        <input
          type="color"
          aria-label="その他の色"
          value={value ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

/** 透明度の選択パネル */
function OpacityChips({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const options = [1, 0.75, 0.5, 0.25];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] whitespace-nowrap text-neutral-500">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-neutral-100 p-0.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={Math.abs(value - o) < 0.01}
            onClick={() => onChange(o)}
            className={cx(
              'tap h-9 min-w-12 rounded-[10px] px-2 text-[13px] font-medium tabular-nums',
              Math.abs(value - o) < 0.01 ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-black/5' : 'text-neutral-600',
            )}
          >
            {Math.round(o * 100)}%
          </button>
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] whitespace-nowrap text-neutral-500">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-neutral-100 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              'tap flex h-9 min-w-11 items-center justify-center rounded-[10px] px-2.5 text-[13px] font-medium',
              value === o.value ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-black/5' : 'text-neutral-600',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="tap flex items-center gap-2"
    >
      <span className="text-[12px] text-neutral-500">{label}</span>
      <span className={cx('relative h-7 w-12 rounded-full transition', checked ? 'bg-[#34c759]' : 'bg-neutral-300')}>
        <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      <span className="text-[13px] font-medium">{checked ? 'ON' : 'OFF'}</span>
    </button>
  );
}

const DASH_OPTIONS: { value: DashStyle; label: ReactNode }[] = [
  { value: 'solid', label: <span className="block h-0.5 w-6 bg-current" aria-label="実線" /> },
  { value: 'dashed', label: <span className="block h-0.5 w-6 border-t-2 border-dashed border-current" aria-label="破線" /> },
  { value: 'dotted', label: <span className="block h-0.5 w-6 border-t-2 border-dotted border-current" aria-label="点線" /> },
];

/** フォント名（青字）をタップすると一覧が開く */
function FontPicker({ value, onChange }: { value: ToolSettings['text']['fontFamily']; onChange: (v: ToolSettings['text']['fontFamily']) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const current = FONT_OPTIONS.find((f) => f.key === value) ?? FONT_OPTIONS[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="tap h-10 rounded-lg px-3 text-[15px] font-medium text-[#0a84ff] hover:bg-[#0a84ff]/10"
        style={{ fontFamily: current.css }}
      >
        {current.label}
      </button>
      {open && (
        <div role="listbox" className="absolute bottom-12 left-0 z-40 max-h-[60vh] w-52 overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white py-1 shadow-xl">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="option"
              aria-selected={f.key === value}
              onClick={() => {
                onChange(f.key);
                setOpen(false);
              }}
              className="tap flex w-full items-center justify-between px-4 py-3 text-left text-[17px] hover:bg-neutral-100"
              style={{ fontFamily: f.css }}
            >
              {f.label}
              {f.key === value && <Check size={18} className="text-[#0a84ff]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== 選択中オブジェクトの設定 =====

interface Tab {
  key: string;
  label: string;
  icon: LucideIcon;
}

const TEXT_TABS: Tab[] = [
  { key: 'font', label: 'フォント', icon: CaseSensitive },
  { key: 'color', label: 'テキストカラー', icon: Palette },
  { key: 'bg', label: '背景カラー', icon: PaintBucket },
  { key: 'spacing', label: '文字の間隔・行の間隔', icon: UnfoldVertical },
  { key: 'outline', label: '縁取り', icon: Baseline },
  { key: 'rotate', label: '回転', icon: RotateCw },
];
const MATH_TABS: Tab[] = [
  { key: 'edit', label: '数式を編集', icon: Pencil },
  { key: 'color', label: '色', icon: Palette },
  { key: 'size', label: 'サイズ', icon: CaseSensitive },
  { key: 'rotate', label: '回転', icon: RotateCw },
];
const STROKE_TABS: Tab[] = [
  { key: 'color', label: '色', icon: Palette },
  { key: 'size', label: '太さ・透明度', icon: PenLine },
];
const LINE_TABS: Tab[] = [
  { key: 'color', label: '色', icon: Palette },
  { key: 'size', label: '太さ・線種', icon: PenLine },
];
const SHAPE_TABS: Tab[] = [
  { key: 'color', label: '枠線', icon: Palette },
  { key: 'fill', label: '塗りつぶし', icon: PaintBucket },
  { key: 'rotate', label: '回転', icon: RotateCw },
];

function tabsFor(o: EditorObject): Tab[] {
  switch (o.type) {
    case 'text':
      return TEXT_TABS;
    case 'math':
      return MATH_TABS;
    case 'pen':
    case 'highlighter':
      return STROKE_TABS;
    case 'line':
    case 'arrow':
      return LINE_TABS;
    default:
      return SHAPE_TABS;
  }
}

function RotateControl({ obj }: { obj: EditorObject }) {
  const set = (rotation: number) =>
    useEditor.getState().updateObjects({ [obj.id]: { rotation } }, `rotate-${obj.id}`);
  const deg = ((((obj.rotation + 180) % 360) + 360) % 360) - 180;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="text-[12px] text-neutral-500">角度</span>
      <input
        type="range"
        aria-label="回転の角度"
        min={-180}
        max={180}
        step={1}
        value={Math.round(deg)}
        onChange={(e) => set(Number(e.target.value))}
        className="range min-w-0 flex-1"
      />
      <Stepper label="度" value={Math.round(deg)} step={15} min={-180} max={180} onChange={set} suffix="°" />
    </div>
  );
}

function ObjectInspector({ obj }: { obj: EditorObject }) {
  const tabs = tabsFor(obj);
  const [tabKey, setTabKey] = useState(tabs[0].key);
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const unit = useEditor((s) => currentPageOf(s)?.unit ?? 1);
  const setTool = useSettings((s) => s.setTool);
  const key = settingsKeyFor(obj);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = settingsFromObject(obj, unit) as any;
  const change = (patch: Record<string, unknown>) => {
    useEditor
      .getState()
      .updateObjects({ [obj.id]: objectPatchFromSettings(obj, patch, unit) }, `style-${obj.id}-${Object.keys(patch).join()}`);
    setTool(key, patch as never); // 直前の設定を保持
  };
  const s = useEditor.getState;

  let content: ReactNode = null;
  if (tab.key === 'rotate') content = <RotateControl obj={obj} />;
  else if (obj.type === 'text') {
    const t = v as ToolSettings['text'];
    if (tab.key === 'font')
      content = (
        <>
          <FontPicker value={t.fontFamily} onChange={(fontFamily) => change({ fontFamily })} />
          <IconButton label="太字" active={t.bold} onClick={() => change({ bold: !t.bold })} className="h-10 w-10 bg-neutral-100 font-bold">
            B
          </IconButton>
          <div className="flex-1" />
          <Stepper label="フォントサイズ" value={t.fontSize} step={1} min={4} max={300} onChange={(fontSize) => change({ fontSize })} suffix="pt" />
        </>
      );
    else if (tab.key === 'color')
      content = <SwatchRow label="テキストカラー" value={t.color} onChange={(c) => c && change({ color: c })} />;
    else if (tab.key === 'bg')
      content = (
        <>
          <SwatchRow label="背景カラー" allowNone value={t.background} onChange={(background) => change({ background })} />
          {t.background && (
            <OpacityChips label="透明度" value={t.backgroundOpacity} onChange={(backgroundOpacity) => change({ backgroundOpacity })} />
          )}
        </>
      );
    else if (tab.key === 'spacing')
      content = (
        <>
          <Stepper label="文字の間隔" value={t.letterSpacing} step={0.1} min={-0.3} max={2} onChange={(letterSpacing) => change({ letterSpacing })} suffix="x" />
          <Stepper label="行の間隔" value={t.lineHeight} step={0.1} min={0.8} max={4} onChange={(lineHeight) => change({ lineHeight })} suffix="x" />
          <Chips
            label="揃え"
            value={t.align}
            onChange={(align) => change({ align })}
            options={
              t.vertical
                ? [
                    { value: 'left', label: '上' },
                    { value: 'center', label: '中' },
                    { value: 'right', label: '下' },
                  ]
                : [
                    { value: 'left', label: '左' },
                    { value: 'center', label: '中' },
                    { value: 'right', label: '右' },
                  ]
            }
          />
        </>
      );
    else if (tab.key === 'outline')
      content = (
        <>
          <Switch
            label="縁取り"
            checked={!!t.outlineColor}
            onChange={(on) => change({ outlineColor: on ? (t.color.toLowerCase() === '#ffffff' ? '#000000' : '#ffffff') : null })}
          />
          {t.outlineColor && (
            <>
              <SwatchRow label="縁取りの色" value={t.outlineColor} onChange={(c) => c && change({ outlineColor: c })} />
              <Stepper label="サイズ" value={t.outlineWidth} step={1} min={0.5} max={30} onChange={(outlineWidth) => change({ outlineWidth })} suffix="pt" />
              <OpacityChips label="透明度" value={t.outlineOpacity} onChange={(outlineOpacity) => change({ outlineOpacity })} />
            </>
          )}
        </>
      );
  } else if (obj.type === 'math') {
    const m = v as ToolSettings['math'];
    if (tab.key === 'edit')
      content = (
        <button
          type="button"
          onClick={() => s().openMathEditor({ targetId: obj.id, at: null, initialLatex: obj.latex })}
          className="tap flex h-10 items-center gap-2 rounded-xl bg-[#0a84ff] px-4 text-[15px] font-medium text-white"
        >
          <Pencil size={17} /> 数式を編集する
        </button>
      );
    else if (tab.key === 'color') content = <SwatchRow label="数式の色" value={m.color} onChange={(c) => c && change({ color: c })} />;
    else if (tab.key === 'size')
      content = <Stepper label="サイズ" value={m.fontSize} step={2} min={6} max={300} onChange={(fontSize) => change({ fontSize })} suffix="pt" />;
  } else if (obj.type === 'pen' || obj.type === 'highlighter') {
    const p = v as ToolSettings['pen'];
    if (tab.key === 'color')
      content = (
        <SwatchRow
          label="線の色"
          value={p.color}
          colors={obj.type === 'highlighter' ? HIGHLIGHT_SWATCHES : undefined}
          onChange={(c) => c && change({ color: c })}
        />
      );
    else
      content = (
        <>
          <Stepper label="太さ" value={p.width} step={1} min={1} max={obj.type === 'highlighter' ? 60 : 30} onChange={(width) => change({ width })} />
          <OpacityChips label="透明度" value={p.opacity} onChange={(opacity) => change({ opacity })} />
        </>
      );
  } else if (obj.type === 'line' || obj.type === 'arrow') {
    const l = v as ToolSettings['arrow'];
    if (tab.key === 'color') content = <SwatchRow label="線の色" value={l.color} onChange={(c) => c && change({ color: c })} />;
    else
      content = (
        <>
          <Stepper label="太さ" value={l.width} step={1} min={1} max={30} onChange={(width) => change({ width })} />
          <Chips label="線種" value={l.dash} options={DASH_OPTIONS} onChange={(dash) => change({ dash })} />
          {obj.type === 'arrow' && (
            <Chips
              label="向き"
              value={l.double ? 'double' : 'single'}
              onChange={(d) => change({ double: d === 'double' })}
              options={[
                { value: 'single', label: '→' },
                { value: 'double', label: '↔' },
              ]}
            />
          )}
        </>
      );
  } else {
    const sh = v as ToolSettings['shape'];
    if (tab.key === 'color')
      content = (
        <>
          {/* 枠線と塗りつぶしを両方「なし」にすると見えず選べなくなるため、片方は残す */}
          <SwatchRow label="枠線の色" allowNone={!!sh.fill} value={sh.strokeColor} onChange={(strokeColor) => change({ strokeColor })} />
          <Stepper label="太さ" value={sh.strokeWidth} step={1} min={0.5} max={30} onChange={(strokeWidth) => change({ strokeWidth })} />
        </>
      );
    else if (tab.key === 'fill')
      content = (
        <>
          <SwatchRow label="塗りつぶしの色" allowNone={!!sh.strokeColor} value={sh.fill} onChange={(fill) => change({ fill })} />
          {sh.fill && <OpacityChips label="透明度" value={sh.fillOpacity} onChange={(fillOpacity) => change({ fillOpacity })} />}
        </>
      );
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-0.5 border-b border-neutral-200 px-1.5">
        <div role="tablist" aria-label="設定の種類" className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <IconButton
              key={t.key}
              role="tab"
              aria-selected={t.key === tab.key}
              label={t.label}
              active={t.key === tab.key}
              onClick={() => setTabKey(t.key)}
              className="h-10 w-11"
            >
              <t.icon size={21} strokeWidth={1.9} />
            </IconButton>
          ))}
        </div>
        <IconButton label="複製" onClick={() => s().duplicate([obj.id])} className="h-10 w-11">
          <CopyPlus size={20} />
        </IconButton>
        <IconButton label="削除" onClick={() => s().deleteObjects([obj.id])} className="h-10 w-11 text-[#ff3b30]">
          <Trash2 size={20} />
        </IconButton>
      </div>
      <div className="px-3 pt-1 text-[11px] font-medium text-neutral-500">{tab.label}</div>
      <div className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-2 px-3 pt-1 pb-2">{content}</div>
    </div>
  );
}

function MultiInspector({ ids }: { ids: string[] }) {
  const s = useEditor.getState;
  return (
    <div className="flex h-14 items-center gap-2 px-3">
      <span className="text-[14px] font-medium">{ids.length}個を選択中</span>
      <div className="flex-1" />
      <IconButton label="複製" showLabel onClick={() => s().duplicate(ids)} className="h-10 bg-neutral-100 px-3">
        <CopyPlus size={18} />
      </IconButton>
      <IconButton label="削除" showLabel onClick={() => s().deleteObjects(ids)} className="h-10 bg-neutral-100 px-3 text-[#ff3b30]">
        <Trash2 size={18} />
      </IconButton>
    </div>
  );
}

// ===== 描画ツール =====

const DRAW_TOOLS: { id: ToolType; label: string; icon: LucideIcon }[] = [
  { id: 'pen', label: 'ペン', icon: Pen },
  { id: 'highlighter', label: '蛍光ペン', icon: Highlighter },
  { id: 'line', label: '直線', icon: Minus },
  { id: 'arrow', label: '矢印', icon: MoveUpRight },
  { id: 'rect', label: '四角形', icon: Square },
  { id: 'ellipse', label: '円・楕円', icon: Circle },
  { id: 'triangle', label: '三角形', icon: Triangle },
  { id: 'eraser', label: '消しゴム', icon: Eraser },
];

const TOOL_KEY: Partial<Record<ToolType, ToolSettingsKey>> = {
  pen: 'pen',
  highlighter: 'highlighter',
  line: 'line',
  arrow: 'arrow',
  rect: 'shape',
  ellipse: 'shape',
  triangle: 'shape',
};

function DrawBar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const tools = useSettings((s) => s.tools);
  const setSetting = useSettings((s) => s.setTool);
  const key = TOOL_KEY[tool];

  let settings: ReactNode = <span className="text-[13px] text-neutral-500">なぞった線や図形を消します（文字・数式は選んでゴミ箱で削除）</span>;
  if (key === 'shape') {
    const sh = tools.shape;
    settings = (
      <>
        <SwatchRow label="枠線の色" allowNone={!!sh.fill} value={sh.strokeColor} onChange={(strokeColor) => setSetting('shape', { strokeColor })} />
        <Stepper label="太さ" value={sh.strokeWidth} step={1} min={0.5} max={30} onChange={(strokeWidth) => setSetting('shape', { strokeWidth })} />
      </>
    );
  } else if (key) {
    const p = tools[key] as ToolSettings['pen'];
    const hl = key === 'highlighter';
    settings = (
      <>
        <SwatchRow
          label="色"
          value={p.color}
          colors={hl ? HIGHLIGHT_SWATCHES : undefined}
          onChange={(c) => c && setSetting(key, { color: c } as never)}
        />
        <Stepper label="太さ" value={p.width} step={1} min={1} max={hl ? 60 : 30} onChange={(width) => setSetting(key, { width } as never)} />
        {hl && (
          <Chips
            label="形"
            value={tools.highlighter.straight ? 'line' : 'free'}
            onChange={(f) => setSetting('highlighter', { straight: f === 'line' })}
            options={[
              { value: 'free', label: '自由' },
              { value: 'line', label: '直線' },
            ]}
          />
        )}
        {key === 'arrow' && (
          <Chips
            label="向き"
            value={tools.arrow.double ? 'double' : 'single'}
            onChange={(d) => setSetting('arrow', { double: d === 'double' })}
            options={[
              { value: 'single', label: '→' },
              { value: 'double', label: '↔' },
            ]}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-0.5 border-b border-neutral-200 px-1.5">
        <div role="toolbar" aria-label="描画ツール" className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {DRAW_TOOLS.map((t) => (
            <IconButton key={t.id} label={t.label} active={tool === t.id} onClick={() => setTool(t.id)} className="h-10 w-11">
              <t.icon size={21} strokeWidth={1.9} />
            </IconButton>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTool('select')}
          className="tap h-10 shrink-0 rounded-lg px-3 text-[15px] font-semibold text-[#0a84ff] hover:bg-[#0a84ff]/10"
        >
          完了
        </button>
      </div>
      <div className="px-3 pt-1 text-[11px] font-medium text-neutral-500">{DRAW_TOOLS.find((t) => t.id === tool)?.label ?? ''}</div>
      <div className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-2 px-3 pt-1 pb-2">{settings}</div>
    </div>
  );
}

// ===== 何も選択していないとき =====

function IdleBar({ onAddImages }: { onAddImages: () => void }) {
  const setTool = useEditor((s) => s.setTool);
  return (
    <div className="relative flex h-[76px] items-center justify-between px-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setTool('pen')}
          className="tap flex h-12 flex-col items-center justify-center rounded-xl px-2.5 text-neutral-700 hover:bg-neutral-100"
        >
          <Pen size={22} aria-hidden />
          <span className="text-[11px] font-medium">描く・図形</span>
        </button>
        <button
          type="button"
          title="画像の回答欄を探して文字枠を自動で置く"
          aria-label="回答欄に文字枠を自動で置く"
          onClick={() => void autoPlaceAnswerFields()}
          className="tap flex h-12 flex-col items-center justify-center rounded-xl px-2.5 text-neutral-700 hover:bg-neutral-100"
        >
          <ScanText size={22} aria-hidden />
          <span className="text-[11px] font-medium">回答欄</span>
        </button>
      </div>
      <button
        type="button"
        aria-label="文字を追加"
        title="文字を追加"
        onClick={addTextAtCenter}
        className="tap absolute left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-[2.5px] border-[#2f9be8] text-[#2f9be8] transition hover:bg-[#2f9be8]/10 active:scale-95"
      >
        <Plus size={30} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={onAddImages}
        className="tap flex h-12 flex-col items-center justify-center rounded-xl px-3 text-neutral-700 hover:bg-neutral-100"
      >
        <ImagePlus size={22} aria-hidden />
        <span className="text-[11px] font-medium">画像を追加</span>
      </button>
    </div>
  );
}

export function BottomBar({ onAddImages }: { onAddImages: () => void }) {
  const tool = useEditor((s) => s.tool);
  const objs = useEditor(useShallow((s) => selectedObjects(s)));
  const hasPages = useEditor((s) => s.history.present.pages.length > 0);
  if (!hasPages) return null;

  let body: ReactNode;
  if (tool !== 'select' && tool !== 'hand' && tool !== 'text' && tool !== 'math') body = <DrawBar />;
  else if (objs.length === 1) body = <ObjectInspector key={objs[0].id} obj={objs[0]} />;
  else if (objs.length > 1) body = <MultiInspector ids={objs.map((o) => o.id)} />;
  else body = <IdleBar onAddImages={onAddImages} />;

  return (
    <div
      className="z-10 shrink-0 border-t border-neutral-200 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto w-full max-w-3xl">{body}</div>
    </div>
  );
}
