import { describe, expect, it } from 'vitest';
import { createHistory, HISTORY_LIMIT, pushHistory, redoHistory, undoHistory } from './history';

describe('history', () => {
  it('undo / redo', () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    h = undoHistory(h);
    expect(h.present).toBe(2);
    h = undoHistory(h);
    expect(h.present).toBe(1);
    h = redoHistory(h);
    expect(h.present).toBe(2);
    h = pushHistory(h, 9);
    expect(h.future).toEqual([]);
  });

  it('coalesces same-key changes in a short window', () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, 'slider', 1000);
    h = pushHistory(h, 2, 'slider', 1200);
    h = pushHistory(h, 3, 'slider', 1400);
    expect(h.past).toEqual([0]);
    h = undoHistory(h);
    expect(h.present).toBe(0);
  });

  it('limits the number of entries', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = pushHistory(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
  });
});
