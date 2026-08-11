import { useCallback, useMemo, useReducer } from 'react';

export interface History {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Начать новую запись, не склеивая её с предыдущей. */
  commit: () => void;
}

const LIMIT = 60;
/** Правки подряд внутри этого окна склеиваются в одну запись — иначе Ctrl+Z
 *  отматывает набор ширины по одной цифре. */
const COALESCE_MS = 450;

export interface State<T> {
  past: T[];
  present: T;
  future: T[];
  lastWrite: number;
}

export type Action<T> =
  | { type: 'set'; value: T | ((current: T) => T); now: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'commit' };

/**
 * Вся история живёт в одном состоянии reducer'а: побочные эффекты в updater'е
 * useState React в StrictMode прогоняет дважды, и стек истории разъезжается.
 */
export function historyReducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'set': {
      const value =
        typeof action.value === 'function'
          ? (action.value as (current: T) => T)(state.present)
          : action.value;
      if (Object.is(value, state.present)) return state;

      const coalesce = action.now - state.lastWrite < COALESCE_MS && state.past.length > 0;
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-LIMIT),
        present: value,
        future: [],
        lastWrite: action.now,
      };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future].slice(0, LIMIT),
        lastWrite: 0,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present].slice(-LIMIT),
        present: state.future[0],
        future: state.future.slice(1),
        lastWrite: 0,
      };
    }
    case 'commit':
      return { ...state, lastWrite: 0 };
    default:
      return state;
  }
}

/**
 * useState с историей: Ctrl+Z для редактора узора обязателен, без него
 * страшно жать кнопки и весь ручной режим бесполезен.
 */
export function useHistoryState<T>(initial: T): [T, (next: T | ((current: T) => T)) => void, History] {
  const [state, dispatch] = useReducer(historyReducer as (s: State<T>, a: Action<T>) => State<T>, {
    past: [],
    present: initial,
    future: [],
    lastWrite: 0,
  });

  const set = useCallback((next: T | ((current: T) => T)) => {
    dispatch({ type: 'set', value: next, now: Date.now() });
  }, []);

  const history = useMemo<History>(
    () => ({
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      commit: () => dispatch({ type: 'commit' }),
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state.past.length, state.future.length]
  );

  return [state.present, set, history];
}
