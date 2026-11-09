// 長押し（タッチ・ペン・マウス）と右クリックで呼ぶ。長押しのあとに続くクリックは consumeClick() で無視できる。
import { useCallback, useEffect, useRef } from 'react';

const MOVE_TOLERANCE = 10;

/**
 * 長押しで開いたメニューが指の下に出ると、指を離したときのクリックがメニューの項目に当たってしまう。
 * 長押しの直後のクリックを1回だけ（少しのあいだ）無視する。
 */
function swallowNextClick() {
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  const done = () => {
    window.removeEventListener('click', swallow, true);
    window.removeEventListener('pointerdown', done, true);
    clearTimeout(timer);
  };
  window.addEventListener('click', swallow, true);
  // クリックが来ないまま次の操作が始まったら、そのタップは無視しない
  window.addEventListener('pointerdown', done, true);
  const timer = setTimeout(done, 1500);
}

export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cb = useRef(onLongPress);
  cb.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      cancel();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        start.current = null;
        fired.current = true;
        navigator.vibrate?.(10);
        swallowNextClick();
        cb.current();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      cancel();
      if (!fired.current) {
        fired.current = true;
        cb.current();
      }
    },
  };

  /** 長押しでメニューを開いた直後のクリックなら true（そのクリックは無視する） */
  const consumeClick = () => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  };

  return { handlers, cancel, consumeClick };
}
