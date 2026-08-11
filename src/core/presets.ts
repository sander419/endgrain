import type { Recipe } from './types';
import type { RandomFn } from './random';
import { randomInt, shuffle } from './random';
import { sliceCount } from './projection';

export type PresetId = 'checker' | 'brick' | 'zigzag' | 'mirror' | 'chaos' | 'gradient';

export interface PresetMeta {
  id: PresetId;
  name: string;
  tagline: string;
}

export const PRESETS: PresetMeta[] = [
  { id: 'checker', name: 'Классическая шахматка', tagline: 'Чистая симметрия и контраст' },
  { id: 'brick', name: 'Кирпичный сдвиг', tagline: 'Спокойный ритм кладки' },
  { id: 'zigzag', name: 'Зигзаг-шторм', tagline: 'Движение и напряжение' },
  { id: 'mirror', name: 'Зеркальный каньон', tagline: 'Симметрия от центра' },
  { id: 'chaos', name: 'Дикий хаос', tagline: 'Случайные перестановки' },
  { id: 'gradient', name: 'Градиентная волна', tagline: 'Плавное изменение ширины' },
];

function clearManualTransforms(recipe: Recipe): Recipe {
  return {
    ...recipe,
    transform: { ...recipe.transform, sliceOrder: undefined, manualSlices: undefined },
  };
}

export function applyPreset(recipe: Recipe, presetId: PresetId, rng: RandomFn): Recipe {
  const base = clearManualTransforms(recipe);
  const stripCount = base.panel.strips.length;
  const nSlices = sliceCount(base);
  if (stripCount === 0 || nSlices === 0) return base;

  const baseIndices = Array.from({ length: stripCount }, (_, index) => index);

  switch (presetId) {
    case 'checker':
      return { ...base, transform: { ...base.transform, flipOddSlices: true, cyclicShiftStep: 0 } };
    case 'brick':
      return { ...base, transform: { ...base.transform, flipOddSlices: false, cyclicShiftStep: 1 } };
    case 'zigzag':
      return { ...base, transform: { ...base.transform, flipOddSlices: true, cyclicShiftStep: 1 } };
    case 'mirror': {
      const manualSlices = Array.from({ length: nSlices }, (_, sliceIndex) => {
        const mirrorIndex = Math.min(sliceIndex, nSlices - 1 - sliceIndex);
        const shift = mirrorIndex % stripCount;
        return [...baseIndices.slice(shift), ...baseIndices.slice(0, shift)];
      });
      return { ...base, transform: { ...base.transform, flipOddSlices: false, cyclicShiftStep: 0, manualSlices } };
    }
    case 'chaos': {
      const manualSlices = Array.from({ length: nSlices }, () => shuffle(rng, baseIndices));
      return { ...base, transform: { ...base.transform, flipOddSlices: false, cyclicShiftStep: 0, manualSlices } };
    }
    case 'gradient': {
      const strips = base.panel.strips.map((strip, index) => {
        const t = stripCount === 1 ? 0 : index / (stripCount - 1);
        const widthMm = Math.max(8, Math.round(18 + t * 52));
        return { ...strip, widthMm };
      });
      return { ...base, panel: { ...base.panel, strips }, transform: { ...base.transform, flipOddSlices: false, cyclicShiftStep: 0 } };
    }
    default:
      return base;
  }
}

export function randomizeWild(recipe: Recipe, rng: RandomFn): Recipe {
  const speciesIds = Object.keys(recipe.species);
  if (speciesIds.length === 0 || recipe.panel.strips.length === 0) return recipe;

  const strips = recipe.panel.strips.map(() => ({
    speciesId: speciesIds[randomInt(rng, 0, speciesIds.length - 1)],
    widthMm: randomInt(rng, 12, 60),
  }));

  const next: Recipe = { ...recipe, panel: { ...recipe.panel, strips } };
  const roll = rng();
  let preset: PresetId = 'checker';
  if (roll < 0.25) preset = 'checker';
  else if (roll < 0.5) preset = 'brick';
  else if (roll < 0.75) preset = 'zigzag';
  else preset = 'chaos';
  return applyPreset(next, preset, rng);
}
