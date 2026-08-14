/**
 * Ручные операции над рецептом: перестановка планок и брусков.
 *
 * Ключевое ограничение модели: планка — цельный срез щита A, поэтому набор
 * брусков в ней всегда один и тот же. Допустимы только ПЕРЕСТАНОВКИ индексов,
 * не подмена. Покрасить одну ячейку нельзя — порода меняется у бруска щита,
 * то есть сразу во всех планках. Это не ограничение UI, это физика.
 */
import type { Recipe, Strip } from './types';
import { getSliceStripIndices } from './transforms';
import { sliceCount } from './projection';

/** Текущая раскладка планки с учётом всех правил — основа для ручной правки. */
export function resolveSlice(recipe: Recipe, sliceIndex: number): number[] {
  const rows = getSliceStripIndices(recipe, sliceCount(recipe));
  return rows[sliceIndex] ?? recipe.panel.strips.map((_, index) => index);
}

/**
 * Записать явную раскладку планки. Остальные планки остаются автоматическими:
 * в manualSlices лежат дырки (null), их валидатор в transforms отбрасывает.
 */
export function setSlice(recipe: Recipe, sliceIndex: number, order: number[]): Recipe {
  const total = sliceCount(recipe);
  if (sliceIndex < 0 || sliceIndex >= total) return recipe;

  const next: (number[] | null)[] = Array.from({ length: total }, (_, index) => {
    const existing = recipe.transform.manualSlices?.[index];
    return Array.isArray(existing) ? existing : null;
  });
  next[sliceIndex] = order;

  return {
    ...recipe,
    transform: { ...recipe.transform, manualSlices: next as unknown as number[][] },
  };
}

/** Перевернуть одну планку на 180°. */
export function flipSlice(recipe: Recipe, sliceIndex: number): Recipe {
  return setSlice(recipe, sliceIndex, [...resolveSlice(recipe, sliceIndex)].reverse());
}

/** Сдвинуть бруски внутри планки по кругу. */
export function shiftSlice(recipe: Recipe, sliceIndex: number, delta: number): Recipe {
  const current = resolveSlice(recipe, sliceIndex);
  const n = current.length;
  if (n === 0) return recipe;
  const shift = ((delta % n) + n) % n;
  return setSlice(recipe, sliceIndex, [...current.slice(shift), ...current.slice(0, shift)]);
}

/** Вернуть планку под общие правила (flip/shift). */
export function resetSlice(recipe: Recipe, sliceIndex: number): Recipe {
  const manual = recipe.transform.manualSlices;
  if (!manual) return recipe;
  const next = manual.map((row, index) => (index === sliceIndex ? null : row));
  const anyLeft = next.some((row) => Array.isArray(row));
  return {
    ...recipe,
    transform: {
      ...recipe.transform,
      manualSlices: anyLeft ? (next as unknown as number[][]) : undefined,
    },
  };
}

/** Снять все ручные правки планок. */
export function resetAllSlices(recipe: Recipe): Recipe {
  return {
    ...recipe,
    transform: { ...recipe.transform, manualSlices: undefined, sliceOrder: undefined },
  };
}

/** Поменять две планки местами (порядок планок в доске). */
export function swapSlices(recipe: Recipe, a: number, b: number): Recipe {
  const total = sliceCount(recipe);
  if (a < 0 || b < 0 || a >= total || b >= total || a === b) return recipe;

  const order = Array.from({ length: total }, (_, position) => {
    const requested = recipe.transform.sliceOrder?.[position];
    return Number.isInteger(requested) && requested !== undefined && requested >= 0 && requested < total
      ? requested
      : position;
  });
  [order[a], order[b]] = [order[b], order[a]];

  return { ...recipe, transform: { ...recipe.transform, sliceOrder: order } };
}

/**
 * Перенести планку на новую позицию со сдвигом остальных — то, что ожидается
 * от перетаскивания мышью. Обмен местами (`swapSlices`) для этого не годится:
 * при переносе через несколько позиций он рвёт порядок соседей.
 */
export function moveSlice(recipe: Recipe, from: number, to: number): Recipe {
  const total = sliceCount(recipe);
  if (from < 0 || to < 0 || from >= total || to >= total || from === to) return recipe;

  const order = Array.from({ length: total }, (_, position) => {
    const requested = recipe.transform.sliceOrder?.[position];
    return Number.isInteger(requested) && requested !== undefined && requested >= 0 && requested < total
      ? requested
      : position;
  });
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);

  return { ...recipe, transform: { ...recipe.transform, sliceOrder: order } };
}

/** Сколько планок отредактированы руками. */
export function manualSliceCount(recipe: Recipe): number {
  return (recipe.transform.manualSlices ?? []).filter((row) => Array.isArray(row)).length;
}

// ── Операции над щитом A ─────────────────────────────────────────────────

function withStrips(recipe: Recipe, strips: Strip[]): Recipe {
  // Ручные раскладки ссылаются на индексы брусков — после правки набора они врут.
  return resetAllSlices({ ...recipe, panel: { ...recipe.panel, strips } });
}

export function moveStrip(recipe: Recipe, from: number, to: number): Recipe {
  const strips = [...recipe.panel.strips];
  if (from < 0 || to < 0 || from >= strips.length || to >= strips.length || from === to) return recipe;
  const [moved] = strips.splice(from, 1);
  strips.splice(to, 0, moved);
  return withStrips(recipe, strips);
}

export function duplicateStrip(recipe: Recipe, index: number): Recipe {
  const strip = recipe.panel.strips[index];
  if (!strip) return recipe;
  const strips = [...recipe.panel.strips];
  strips.splice(index + 1, 0, { ...strip });
  return withStrips(recipe, strips);
}

/** Дозеркалить набор: A-B-C → A-B-C-C-B-A. Симметрия щита без ручной раскладки. */
export function mirrorStrips(recipe: Recipe): Recipe {
  const strips = recipe.panel.strips;
  if (strips.length === 0) return recipe;
  return withStrips(recipe, [...strips, ...[...strips].reverse().map((s) => ({ ...s }))]);
}

/** Развернуть порядок брусков в щите. */
export function reverseStrips(recipe: Recipe): Recipe {
  return withStrips(recipe, [...recipe.panel.strips].reverse().map((s) => ({ ...s })));
}
