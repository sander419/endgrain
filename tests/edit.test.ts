import { describe, expect, it } from 'vitest';
import {
  defaultRecipe,
  flipSlice,
  getSliceStripIndices,
  manualSliceCount,
  mirrorStrips,
  moveStrip,
  duplicateStrip,
  resetAllSlices,
  resetSlice,
  resolveSlice,
  reverseStrips,
  setSlice,
  shiftSlice,
  sliceCount,
  moveSlice,
  swapSlices,
} from '../src/core';
import type { Recipe } from '../src/core';

function rows(recipe: Recipe): number[][] {
  return getSliceStripIndices(recipe, sliceCount(recipe));
}

describe('ручная правка планки', () => {
  it('переворот одной планки не трогает соседние', () => {
    const base = defaultRecipe();
    const before = rows(base);
    const next = flipSlice(base, 2);
    const after = rows(next);

    expect(after[2]).toEqual([...before[2]].reverse());
    expect(after[0]).toEqual(before[0]);
    expect(after[3]).toEqual(before[3]);
    expect(manualSliceCount(next)).toBe(1);
  });

  it('сдвиг планки цикличен и не теряет бруски', () => {
    const base = defaultRecipe();
    const next = shiftSlice(base, 1, 2);
    const row = rows(next)[1];
    expect([...row].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(row).toEqual([...resolveSlice(base, 1).slice(2), ...resolveSlice(base, 1).slice(0, 2)]);
  });

  it('сдвиг на длину набора возвращает исходную планку', () => {
    const base = defaultRecipe();
    const stripCount = base.panel.strips.length;
    expect(rows(shiftSlice(base, 1, stripCount))[1]).toEqual(rows(base)[1]);
  });

  it('отрицательный сдвиг работает', () => {
    const base = defaultRecipe();
    expect(rows(shiftSlice(base, 0, -1))[0]).toEqual(rows(shiftSlice(base, 0, 5))[0]);
  });

  it('сброс возвращает планку под общие правила', () => {
    const base = defaultRecipe();
    const edited = flipSlice(flipSlice(base, 2), 4);
    expect(manualSliceCount(edited)).toBe(2);

    const partial = resetSlice(edited, 2);
    expect(manualSliceCount(partial)).toBe(1);
    expect(rows(partial)[2]).toEqual(rows(base)[2]);

    const full = resetAllSlices(edited);
    expect(full.transform.manualSlices).toBeUndefined();
    expect(rows(full)).toEqual(rows(base));
  });

  it('ручная раскладка переживает сериализацию в ДНК (дырки становятся null)', () => {
    const edited = flipSlice(defaultRecipe(), 3);
    const revived = JSON.parse(JSON.stringify(edited)) as Recipe;
    expect(rows(revived)[3]).toEqual(rows(edited)[3]);
    expect(rows(revived)[0]).toEqual(rows(edited)[0]);
  });

  it('правка несуществующей планки ничего не ломает', () => {
    const base = defaultRecipe();
    expect(flipSlice(base, 999)).toBe(base);
  });
});

describe('порядок планок', () => {
  it('две планки меняются местами', () => {
    const base = flipSlice(defaultRecipe(), 1); // сделать планки различимыми
    const before = rows(base);
    const after = rows(swapSlices(base, 0, 1));
    expect(after[0]).toEqual(before[1]);
    expect(after[1]).toEqual(before[0]);
  });

  it('перетаскивание переносит планку со сдвигом соседей, а не меняет местами', () => {
    const base = flipSlice(defaultRecipe(), 0);
    const before = rows(base);
    const after = rows(moveSlice(base, 0, 3));
    expect(after[3]).toEqual(before[0]);
    // Соседи подтянулись на позицию влево, порядок между ними сохранился.
    expect(after[0]).toEqual(before[1]);
    expect(after[1]).toEqual(before[2]);
    expect(after[2]).toEqual(before[3]);
  });

  it('перенос назад работает так же', () => {
    const base = flipSlice(defaultRecipe(), 3);
    const before = rows(base);
    const after = rows(moveSlice(base, 3, 1));
    expect(after[1]).toEqual(before[3]);
    expect(after[2]).toEqual(before[1]);
    expect(after[3]).toEqual(before[2]);
  });

  it('перенос на ту же позицию и за границы ничего не меняет', () => {
    const base = defaultRecipe();
    expect(moveSlice(base, 2, 2)).toBe(base);
    expect(moveSlice(base, -1, 2)).toBe(base);
    expect(moveSlice(base, 0, 999)).toBe(base);
  });
});

describe('операции над щитом A', () => {
  it('брусок переезжает на новое место', () => {
    const base = defaultRecipe();
    const next = moveStrip(base, 0, 2);
    expect(next.panel.strips.map((s) => s.speciesId).slice(0, 3)).toEqual(['walnut', 'maple', 'maple']);
  });

  it('дублирование добавляет брусок рядом', () => {
    const base = defaultRecipe();
    const next = duplicateStrip(base, 0);
    expect(next.panel.strips.length).toBe(base.panel.strips.length + 1);
    expect(next.panel.strips[1]).toEqual(base.panel.strips[0]);
  });

  it('зеркало даёт симметричный набор', () => {
    const base = defaultRecipe();
    const next = mirrorStrips(base);
    const ids = next.panel.strips.map((s) => s.speciesId);
    expect(ids).toEqual([...ids].reverse());
  });

  it('разворот набора меняет порядок', () => {
    const base = defaultRecipe();
    expect(reverseStrips(base).panel.strips.map((s) => s.speciesId))
      .toEqual([...base.panel.strips].reverse().map((s) => s.speciesId));
  });

  it('правка набора сбрасывает ручные раскладки: индексы брусков сместились', () => {
    const edited = flipSlice(defaultRecipe(), 2);
    expect(manualSliceCount(moveStrip(edited, 0, 3))).toBe(0);
    expect(manualSliceCount(duplicateStrip(edited, 0))).toBe(0);
  });
});

describe('setSlice', () => {
  it('пишет явную раскладку', () => {
    const next = setSlice(defaultRecipe(), 0, [5, 4, 3, 2, 1, 0]);
    expect(rows(next)[0]).toEqual([5, 4, 3, 2, 1, 0]);
  });
});
