// 汎用UI部品
import { X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  showLabel?: boolean;
  children: ReactNode;
}

/** アイコンボタン（説明ラベル付き。選択状態は色だけでなく枠でも示す） */
export function IconButton({ label, active, showLabel, children, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        'tap flex shrink-0 items-center justify-center gap-1.5 rounded-xl text-neutral-700 transition-colors',
        'hover:bg-neutral-200/70 active:bg-neutral-300/70 disabled:pointer-events-none disabled:opacity-35',
        active && 'bg-[#0a84ff]/12 text-[#0a84ff] ring-2 ring-[#0a84ff] ring-inset',
        className,
      )}
      {...rest}
    >
      {children}
      {showLabel && <span className="text-[13px] font-medium whitespace-nowrap">{label}</span>}
    </button>
  );
}

/**
 * ボタンから開くメニュー。画面からはみ出さないよう、
 * 下に入らなければ上に開き、左右も画面内に収め、それでも高すぎるときはスクロールさせる。
 * body 直下に描くので、親要素の overflow やヘッダーに隠れない。
 * 外側タップの判定用に data-menu を付ける。
 */
export function MenuPopover({
  anchor,
  width,
  className,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  width: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    let raf = 0;
    const place = () => {
      const a = anchor.current;
      const el = ref.current;
      // 親の ref がまだ付いていない初回は次のフレームで測る
      if (!a || !el) {
        raf = requestAnimationFrame(place);
        return;
      }
      const margin = 8;
      const gap = 4;
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const r = a.getBoundingClientRect();
      const h = el.scrollHeight;
      const below = vh - r.bottom - gap - margin;
      const above = r.top - gap - margin;
      let top: number;
      let maxHeight: number;
      if (h <= below || below >= above) {
        top = r.bottom + gap;
        maxHeight = below;
      } else {
        maxHeight = above;
        top = r.top - gap - Math.min(h, above);
      }
      const w = Math.min(width, vw - margin * 2);
      const left = Math.min(Math.max(r.right - w, margin), vw - w - margin);
      setPos({ top, left, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [anchor, width]);

  return createPortal(
    <div
      ref={ref}
      data-menu
      className={cx('fixed z-50 overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white py-1 shadow-xl', className)}
      style={{
        width: `min(${width}px, calc(100vw - 16px))`,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        maxHeight: pos?.maxHeight,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function Button({
  variant = 'secondary',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return (
    <button
      type="button"
      className={cx(
        'tap inline-flex items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition active:scale-[0.98] disabled:opacity-40',
        variant === 'primary' && 'bg-[#0a84ff] text-white hover:bg-[#0077ed]',
        variant === 'secondary' && 'bg-neutral-200/80 text-neutral-900 hover:bg-neutral-300/80',
        variant === 'danger' && 'bg-[#ff3b30] text-white hover:bg-[#e6352b]',
        variant === 'ghost' && 'text-[#0a84ff] hover:bg-[#0a84ff]/10',
        className,
      )}
      {...rest}
    />
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center sm:p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-md',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 id={titleId} className="text-[17px] font-semibold">
            {title}
          </h2>
          <IconButton label="閉じる" onClick={onClose} className="h-10 w-10">
            <X size={20} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[15px] leading-relaxed text-neutral-700">{message}</div>
    </Modal>
  );
}

export function PromptDialog({
  open,
  title,
  initial,
  confirmLabel = 'OK',
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  initial: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.select(), 30);
  }, [open]);
  const submit = () => {
    const v = inputRef.current?.value.trim() ?? '';
    if (v) {
      onSubmit(v);
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        autoFocus
        aria-label={title}
        defaultValue={initial}
        className="h-12 w-full rounded-xl border border-neutral-300 px-3 text-[16px] outline-none focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/30"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
        }}
      />
    </Modal>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold tracking-wide text-neutral-500">{label}</div>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex rounded-xl bg-neutral-200/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          aria-label={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-9 flex-1 items-center justify-center rounded-[10px] text-[13px] font-medium transition',
            value === o.value ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-black/5' : 'text-neutral-600',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[14px]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-[#34c759]' : 'bg-neutral-300')}
      >
        <span
          className={cx(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}

/** スライダー＋数値入力（細かいドラッグが苦手でも数値で調整できる） */
export function NumberSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  suffix,
  display,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  suffix?: string;
  /** 表示値の変換（不透明度を%表示など） */
  display?: { to: (v: number) => number; from: (v: number) => number };
}) {
  const shown = display ? display.to(value) : value;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={clamp(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range h-9 min-w-0 flex-1"
      />
      <div className="flex items-center rounded-lg border border-neutral-300 bg-white focus-within:border-[#0a84ff]">
        <input
          type="number"
          inputMode="decimal"
          aria-label={`${label}（数値）`}
          value={Math.round(shown * 10) / 10}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            const raw = display ? display.from(v) : v;
            onChange(clamp(raw));
          }}
          className="h-9 w-14 bg-transparent px-1.5 text-right text-[14px] tabular-nums outline-none"
        />
        {suffix && <span className="pr-2 text-xs text-neutral-500">{suffix}</span>}
      </div>
    </div>
  );
}

export const COLOR_SWATCHES = [
  '#000000',
  '#e5352b',
  '#0a63d6',
  '#1e9e4a',
  '#ff8a00',
  '#8e44ad',
  '#ff2d92',
  '#8a8a8e',
  '#ffffff',
];

export const HIGHLIGHT_SWATCHES = ['#ffe14d', '#ff9ec7', '#8ef0a0', '#8fd3ff', '#ffbb66', '#d6a8ff'];

export function ColorPicker({
  value,
  onChange,
  allowNone,
  swatches = COLOR_SWATCHES,
  label,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
  swatches?: string[];
  label: string;
}) {
  const custom = value && !swatches.includes(value.toLowerCase()) ? value : null;
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="なし"
          title="なし"
          onClick={() => onChange(null)}
          className={cx(
            'swatch relative overflow-hidden bg-white',
            value === null && 'swatch-active',
          )}
        >
          <span className="absolute top-1/2 left-1/2 h-[2px] w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#ff3b30]" />
        </button>
      )}
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value?.toLowerCase() === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={cx('swatch', value?.toLowerCase() === c && 'swatch-active')}
          style={{ background: c }}
        />
      ))}
      <label
        className={cx('swatch relative cursor-pointer overflow-hidden', custom && 'swatch-active')}
        title="その他の色"
        style={{
          background: custom ?? 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
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
