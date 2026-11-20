// 「テンプレート」ダイアログ：白紙・方眼・ノート・便箋・手紙・原稿用紙から選んで新しく作る。
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  drawPaper,
  layoutPaper,
  PAPER_COLORS,
  PAPER_SIZES,
  TEMPLATES,
  type Orientation,
  type PaperColorKey,
  type PaperSizeKey,
  type TemplateKind,
  type TemplateOptions,
} from '../../lib/paperTemplates';
import { fontCss } from '../../types/model';
import { Button, cx, Field, Modal, Segmented } from '../ui/primitives';

const PREF_KEY = 'mojiire.template';

function loadPrefs(): TemplateOptions {
  const def: TemplateOptions = { kind: 'blank', size: 'a4', orientation: 'portrait', color: 'white' };
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null') as Partial<TemplateOptions> | null;
    if (!v) return def;
    return {
      kind: TEMPLATES.some((t) => t.kind === v.kind) ? v.kind! : def.kind,
      size: PAPER_SIZES.some((p) => p.key === v.size) ? v.size! : def.size,
      orientation: v.orientation === 'landscape' ? 'landscape' : 'portrait',
      color: PAPER_COLORS.some((c) => c.key === v.color) ? v.color! : def.color,
    };
  } catch {
    return def;
  }
}

function savePrefs(o: TemplateOptions) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(o));
  } catch {
    /* 保存できなくても動作に支障はない */
  }
}

/** テンプレートの見本（box の中に収まる大きさで描く） */
function PaperPreview({ options, box }: { options: TemplateOptions; box: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layout = layoutPaper(options);
  const k = box / Math.max(layout.width, layout.height);
  const w = Math.round(layout.width * k);
  const h = Math.round(layout.height * k);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // 見本では細い線が消えないよう少し太めに見える倍率で描く
    drawPaper(ctx, layoutPaper(options), k * dpr, fontCss('gothic'));
  }, [options.kind, options.size, options.orientation, options.color, w, h, k]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <canvas
      ref={ref}
      style={{ width: w, height: h }}
      className="rounded-[3px] shadow-[0_1px_3px_rgb(0_0_0/0.18)] ring-1 ring-black/[0.06]"
      aria-hidden
    />
  );
}

export function TemplateDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (o: TemplateOptions) => void;
}) {
  const [opts, setOpts] = useState<TemplateOptions>(loadPrefs);
  useEffect(() => {
    if (open) setOpts(loadPrefs());
  }, [open]);
  const set = (patch: Partial<TemplateOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const create = () => {
    savePrefs(opts);
    onCreate(opts);
    onClose();
  };
  const current = TEMPLATES.find((t) => t.kind === opts.kind) ?? TEMPLATES[0];
  const roles = [...new Set(layoutPaper(opts).fields.map((f) => f.role))];

  return (
    <Modal
      open={open}
      title="テンプレートから作る"
      onClose={onClose}
      wide
      footer={
        <>
          <Button className="h-11" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" className="h-11" onClick={create}>
            「{current.label}」を作る
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div role="radiogroup" aria-label="テンプレート" className="grid grid-cols-3 gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t) => {
            const active = t.kind === opts.kind;
            return (
              <button
                key={t.kind}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set({ kind: t.kind as TemplateKind })}
                onDoubleClick={() => {
                  set({ kind: t.kind });
                  savePrefs({ ...opts, kind: t.kind });
                  onCreate({ ...opts, kind: t.kind });
                  onClose();
                }}
                className={cx(
                  'tap relative flex flex-col items-center gap-1.5 rounded-xl border px-1.5 pt-2.5 pb-2 text-center transition',
                  active ? 'border-[#0a84ff] bg-[#0a84ff]/[0.07] ring-2 ring-[#0a84ff]/40' : 'border-neutral-200 hover:bg-neutral-50',
                )}
              >
                <span className="flex h-[84px] items-center justify-center">
                  <PaperPreview options={{ ...opts, kind: t.kind }} box={80} />
                </span>
                <span className="text-[13px] leading-tight font-semibold">{t.label}</span>
                <span className="text-[11px] leading-tight text-neutral-500">{t.note}</span>
                {active && (
                  <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#0a84ff] text-white">
                    <Check size={13} strokeWidth={3} aria-hidden />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="hidden justify-center rounded-xl bg-neutral-100 py-4 sm:flex">
            <PaperPreview options={opts} box={170} />
          </div>
          <Field label="用紙の大きさ">
            <Segmented<PaperSizeKey>
              ariaLabel="用紙の大きさ"
              value={opts.size}
              onChange={(size) => set({ size })}
              options={PAPER_SIZES.map((p) => ({ value: p.key, label: p.label }))}
            />
          </Field>
          <Field label="向き">
            <Segmented<Orientation>
              ariaLabel="向き"
              value={opts.orientation}
              onChange={(orientation) => set({ orientation })}
              options={[
                { value: 'portrait', label: '縦' },
                { value: 'landscape', label: '横' },
              ]}
            />
          </Field>
          <Field label="紙の色">
            <div role="radiogroup" aria-label="紙の色" className="flex flex-wrap gap-1">
              {PAPER_COLORS.map((c) => {
                const active = c.key === opts.color;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => set({ color: c.key as PaperColorKey })}
                    className={cx(
                      'tap flex h-11 w-10 items-center justify-center rounded-full border-2 transition',
                      active ? 'border-[#0a84ff]' : 'border-transparent',
                    )}
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full"
                      style={{ background: c.bg, boxShadow: `inset 0 0 0 2px ${c.line}` }}
                    >
                      {active && <Check size={15} strokeWidth={3} style={{ color: c.ink }} aria-hidden />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="text-[12px] text-neutral-500">{PAPER_COLORS.find((c) => c.key === opts.color)?.label}</div>
          </Field>
          {roles.length > 0 && (
            <p className="text-[12px] leading-relaxed text-neutral-500">
              {roles.join('・')}の「ダブルタップで入力」の枠が最初から置かれます。
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
