// 縦書きの入力欄に描く自前のカーソル。
// iPad の Safari は縦書きの入力欄でカーソルが小さくなったり、文字から離れた所に出たりするため、
// 縦書きのときは本来のカーソルを透明にして、文字の位置を測ってここで描き直す。
import { useEffect, useRef, useState, type RefObject } from 'react';

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** 見た目が変わったら測り直すための値 */
  deps: unknown[];
}

interface Pos {
  x: number;
  y: number;
  w: number;
}

// 入力欄と同じ見た目にそろえる項目
const COPY_PROPS = [
  'writingMode',
  'textOrientation',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'boxSizing',
] as const;

export function VerticalCaret({ textareaRef, deps }: Props) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  // 動かすたびに点滅をやり直して、動かした直後は必ず見えるようにする
  const [blinkKey, setBlinkKey] = useState(0);

  useEffect(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    let raf = 0;

    const measure = () => {
      raf = 0;
      if (document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) {
        setPos(null);
        return;
      }
      const cs = getComputedStyle(ta);
      for (const p of COPY_PROPS) mirror.style[p] = cs[p];
      mirror.style.width = `${ta.offsetWidth}px`;
      mirror.style.height = `${ta.offsetHeight}px`;
      mirror.style.left = `${ta.offsetLeft}px`;
      mirror.style.top = `${ta.offsetTop}px`;

      mirror.textContent = ta.value.slice(0, ta.selectionStart);
      const marker = document.createElement('span');
      // 全角スペースは縦書きでも正立するので、1文字ぶんの枠がそのまま測れる
      marker.textContent = '\u3000';
      mirror.appendChild(marker);

      const mr = mirror.getBoundingClientRect();
      const r = marker.getBoundingClientRect();
      const fs = parseFloat(cs.fontSize) || 22;
      // 入力欄のスクロールぶんをずらす（縦書きでは左右にスクロールする）
      const x = r.left - mr.left + r.width / 2 + ta.offsetLeft - ta.scrollLeft;
      const y = r.top - mr.top + ta.offsetTop - ta.scrollTop;
      // 入力欄の外に出たら描かない
      const inside =
        x >= ta.offsetLeft &&
        x <= ta.offsetLeft + ta.clientWidth &&
        y >= ta.offsetTop &&
        y <= ta.offsetTop + ta.clientHeight;
      setPos(inside ? { x, y, w: Math.round(fs * 1.1) } : null);
      setBlinkKey((k) => k + 1);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    schedule();
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) schedule();
    });
    document.addEventListener('selectionchange', schedule);
    ta.addEventListener('input', schedule);
    ta.addEventListener('scroll', schedule);
    ta.addEventListener('focus', schedule);
    ta.addEventListener('blur', schedule);
    ta.addEventListener('compositionupdate', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('selectionchange', schedule);
      ta.removeEventListener('input', schedule);
      ta.removeEventListener('scroll', schedule);
      ta.removeEventListener('focus', schedule);
      ta.removeEventListener('blur', schedule);
      ta.removeEventListener('compositionupdate', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, deps);

  return (
    <>
      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none invisible absolute overflow-hidden"
        style={{
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          wordBreak: 'normal',
        }}
      />
      {pos && (
        <div
          key={blinkKey}
          aria-hidden
          className="vertical-caret pointer-events-none absolute rounded-full bg-[#0a84ff]"
          style={{
            left: pos.x - pos.w / 2,
            top: pos.y - 1,
            width: pos.w,
            height: 2,
          }}
        />
      )}
    </>
  );
}
