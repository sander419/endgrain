import { describe, expect, it } from 'vitest';
import { historyReducer } from '../src/useHistoryState';
import type { State } from '../src/useHistoryState';

function start(value: string): State<string> {
  return { past: [], present: value, future: [], lastWrite: 0 };
}

/** Правки с интервалом больше окна склейки — каждая отдельной записью. */
function apply(state: State<string>, values: string[], step = 1000): State<string> {
  let now = 10_000;
  return values.reduce((acc, value) => {
    now += step;
    return historyReducer(acc, { type: 'set', value, now });
  }, state);
}

describe('история правок', () => {
  it('отмена и возврат ходят по стеку', () => {
    const state = apply(start('a'), ['b', 'c']);
    expect(state.present).toBe('c');

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.present).toBe('b');

    const twice = historyReducer(undone, { type: 'undo' });
    expect(twice.present).toBe('a');
    expect(twice.past).toEqual([]);

    const back = historyReducer(twice, { type: 'redo' });
    expect(back.present).toBe('b');
    expect(historyReducer(back, { type: 'redo' }).present).toBe('c');
  });

  it('отмена на пустом стеке ничего не делает', () => {
    const state = start('a');
    expect(historyReducer(state, { type: 'undo' })).toBe(state);
    expect(historyReducer(state, { type: 'redo' })).toBe(state);
  });

  it('новая правка после отмены обрубает будущее', () => {
    const undone = historyReducer(apply(start('a'), ['b', 'c']), { type: 'undo' });
    expect(undone.future.length).toBe(1);

    const next = historyReducer(undone, { type: 'set', value: 'd', now: 99_999 });
    expect(next.future).toEqual([]);
    expect(next.present).toBe('d');
    expect(historyReducer(next, { type: 'undo' }).present).toBe('b');
  });

  it('быстрые правки подряд склеиваются в одну запись', () => {
    let state = apply(start('a'), ['b']);
    state = historyReducer(state, { type: 'set', value: 'b1', now: 11_100 });
    state = historyReducer(state, { type: 'set', value: 'b2', now: 11_200 });
    expect(state.present).toBe('b2');
    // Одна отмена возвращает к состоянию до всей серии.
    expect(historyReducer(state, { type: 'undo' }).present).toBe('a');
  });

  it('commit разрывает склейку', () => {
    let state = apply(start('a'), ['b']);
    state = historyReducer(state, { type: 'commit' });
    state = historyReducer(state, { type: 'set', value: 'c', now: 11_100 });
    expect(historyReducer(state, { type: 'undo' }).present).toBe('b');
  });

  it('повтор того же значения не создаёт запись', () => {
    const state = apply(start('a'), ['b']);
    const same = historyReducer(state, { type: 'set', value: 'b', now: 50_000 });
    expect(same).toBe(state);
  });

  it('глубина истории ограничена', () => {
    const many = Array.from({ length: 200 }, (_, index) => `v${index}`);
    const state = apply(start('a'), many);
    expect(state.past.length).toBeLessThanOrEqual(60);
  });
});
