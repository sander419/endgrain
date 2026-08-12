// Граничные случаи и подозрения, найденные при ревизии кода из 03-Код.md.
import { describe, expect, it } from 'vitest';
import {
  projectRecipe,
  sliceCount,
  getSliceStripIndices,
  applyOilToHex,
  mulberry32,
  applyPreset,
  encodeBoardDna,
  decodeBoardDna,
  buildShareUrl,
  defaultRecipe,
} from '../src/core';
import type { Recipe } from '../src/core';

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    units: 'mm',
    species: {
      maple: { id: 'maple', name: 'Maple', colorHex: '#E8C39E' },
      walnut: { id: 'walnut', name: 'Walnut', colorHex: '#5D4037' },
    },
    panel: {
      strips: [
        { speciesId: 'maple', widthMm: 40 },
        { speciesId: 'walnut', widthMm: 40 },
        { speciesId: 'walnut', widthMm: 40 },
        { speciesId: 'maple', widthMm: 40 },
      ],
      stripThicknessMm: 40,
      usableLengthMm: 400,
    },
    crosscut: { sliceThicknessMm: 40, sawKerfMm: 3, bladeAngleDeg: 90 },
    transform: { flipOddSlices: true, cyclicShiftStep: 0 },
    allowances: { thicknessSurfacingMm: 3, stripWidthJointMm: 2, panelEndTrimMm: 30 },
    ...overrides,
  };
}

describe('flip на палиндромной последовательности', () => {
  it('НЕ даёт шахматку: A-B-B-A после разворота остаётся A-B-B-A', () => {
    const matrix = getSliceStripIndices(baseRecipe(), 2);
    // Индексы разворачиваются, но породы — нет.
    expect(matrix[1]).toEqual([3, 2, 1, 0]);
    const species = matrix.map((row) => row.map((i) => baseRecipe().panel.strips[i].speciesId));
    expect(species[0]).toEqual(species[1]); // визуально узор не меняется
  });
});

describe('деградация до одной планки', () => {
  it('sliceCount = 1 → внутренних резов нет, kerf-отход = 0', () => {
    const recipe = baseRecipe({
      panel: { ...baseRecipe().panel, usableLengthMm: 50 },
    });
    expect(sliceCount(recipe)).toBe(1);
    const p = projectRecipe(recipe);
    expect(p.waste.crosscutKerfM3).toBe(0);
  });

  it('щит короче одного среза → 0 планок и внятная ошибка', () => {
    const recipe = baseRecipe({
      panel: { ...baseRecipe().panel, usableLengthMm: 20 },
    });
    expect(sliceCount(recipe)).toBe(0);
    const p = projectRecipe(recipe);
    expect(p.valid).toBe(false);
    expect(p.issues.join(' ')).toContain('Недостаточно длины');
  });
});

describe('масло меняет цвет', () => {
  it('при oil=1 тон заметно темнее исходного', () => {
    const [r, g, b] = applyOilToHex('#E8C39E', 1).match(/\d+/g)!.map(Number);
    const lumBefore = 0.2126 * 0xe8 + 0.7152 * 0xc3 + 0.0722 * 0x9e;
    const lumAfter = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(lumAfter).toBeLessThan(lumBefore * 0.85);
  });

  it('при oil=1 растёт насыщенность, а не только яркость', () => {
    const spread = (hex: string, oil: number) => {
      const [r, g, b] = applyOilToHex(hex, oil).match(/\d+/g)!.map(Number);
      return (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
    };
    expect(spread('#E8C39E', 1)).toBeGreaterThan(spread('#E8C39E', 0) * 1.1);
  });

  it('oil=0 не трогает цвет', () => {
    expect(applyOilToHex('#E8C39E', 0)).toBe('rgb(232, 195, 158)');
  });
});

describe('seeded random детерминирован', () => {
  it('один seed — один и тот же узор', () => {
    const a = applyPreset(baseRecipe(), 'chaos', mulberry32(12345));
    const b = applyPreset(baseRecipe(), 'chaos', mulberry32(12345));
    expect(a.transform.manualSlices).toEqual(b.transform.manualSlices);
  });
});

describe('Board DNA round-trip', () => {
  it('кириллица в названиях пород переживает encode/decode', () => {
    const recipe = baseRecipe({
      species: { maple: { id: 'maple', name: 'Клён', colorHex: '#E8C39E' } },
    });
    const decoded = decodeBoardDna(encodeBoardDna({ v: 1, seed: 7, recipe }));
    expect(decoded?.recipe.species.maple.name).toBe('Клён');
  });

  it('битый код не роняет приложение', () => {
    expect(decodeBoardDna('не-base64!!!')).toBeNull();
  });

  // Регрессия: на btoa(encodeURIComponent(...)) + полном каталоге пород
  // ссылка была 3579 символов и рвалась в мессенджерах. Держим запас до 2000.
  it('ссылка остаётся короткой: только использованные породы, без раздувания кириллицы', () => {
    expect(encodeBoardDna({ v: 1, seed: 1, recipe: baseRecipe() }).length).toBeLessThan(900);
    expect(encodeBoardDna({ v: 1, seed: 1, recipe: defaultRecipe() }).length).toBeLessThan(1200);
  });

  it('в ДНК не уезжают неиспользованные породы', () => {
    const recipe = baseRecipe({
      species: {
        maple: { id: 'maple', name: 'Клён', colorHex: '#E8C39E' },
        walnut: { id: 'walnut', name: 'Орех', colorHex: '#5D4037' },
        wenge: { id: 'wenge', name: 'Венге', colorHex: '#3A2A22' },
      },
    });
    const decoded = decodeBoardDna(encodeBoardDna({ v: 1, recipe }));
    expect(Object.keys(decoded!.recipe.species).sort()).toEqual(['maple', 'walnut']);
  });

  /**
   * Регрессия: если у получателя ссылки в localStorage с прошлого визита
   * стоит режим «Мозаика», страница поднимется в нём, рецепт из хэша
   * загрузится в состояние молча, а интерфейс останется на мозаике —
   * ссылка выглядит нерабочей. ?mode=recipe в URL закрывает это железно.
   */
  it('ссылка несёт ?mode=recipe — иначе застрявший режим «Мозаика» её проглотит', () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: { origin: 'https://example.test', pathname: '/endgrain/' },
    };
    try {
      const url = buildShareUrl(baseRecipe(), 1);
      expect(url).toContain('?mode=recipe');
      expect(url.indexOf('?mode=recipe')).toBeLessThan(url.indexOf('#dna='));
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});
