/** «Столярный чек» — предупреждения, которые не блокируют экспорт (VAL-02). */
import type { Recipe } from './types';
import { getSpeciesMatrix } from './transforms';
import { sliceCount } from './projection';

export type WarningId =
  | 'thin_strip'
  | 'many_slices'
  | 'shrinkage_conflict'
  | 'flip_no_effect'
  | 'single_species';

export interface JoineryWarning {
  id: WarningId;
  message: string;
}

/** Тоньше этого брусок скалывается при второй склейке. */
export const MIN_STRIP_WIDTH_MM = 8;
/** Больше этого планок за раз не стянуть струбцинами — нужны подгруппы. */
export const MAX_SLICES_PER_GLUEUP = 18;
/** Разница усушки выше этой — риск растрескивания шва. */
export const MAX_SHRINKAGE_DELTA_PCT = 4.5;

export function checkJoinery(recipe: Recipe): JoineryWarning[] {
  const warnings: JoineryWarning[] = [];

  recipe.panel.strips.forEach((strip, index) => {
    if (strip.widthMm > 0 && strip.widthMm < MIN_STRIP_WIDTH_MM) {
      warnings.push({
        id: 'thin_strip',
        message: `Брусок ${index + 1} уже ${MIN_STRIP_WIDTH_MM} мм — при второй склейке рискует сколоться.`,
      });
    }
  });

  const nSlices = sliceCount(recipe);
  if (nSlices > MAX_SLICES_PER_GLUEUP) {
    warnings.push({
      id: 'many_slices',
      message: `${nSlices} планок за одну склейку не стянуть. Клей подгруппами по ${MAX_SLICES_PER_GLUEUP} и своди щиты.`,
    });
  }

  const used = new Set(recipe.panel.strips.map((s) => s.speciesId));
  if (used.size === 1 && recipe.panel.strips.length > 1) {
    warnings.push({
      id: 'single_species',
      message: 'Все бруски одной породы — узора не будет. Добавь вторую породу.',
    });
  }

  const shrinkages = [...used]
    .map((id) => recipe.species[id]?.shrinkageTangentialPct)
    .filter((v): v is number => typeof v === 'number');
  if (shrinkages.length > 1) {
    const delta = Math.max(...shrinkages) - Math.min(...shrinkages);
    if (delta > MAX_SHRINKAGE_DELTA_PCT) {
      warnings.push({
        id: 'shrinkage_conflict',
        message: `Разница тангенциальной усушки ${delta.toFixed(1)}% — шов может треснуть при смене влажности.`,
      });
    }
  }

  // Разворот планки на 180° разворачивает порядок брусков. Если порядок пород
  // палиндромный (A-B-B-A), развёрнутая планка выглядит точно так же — юзер
  // жмёт «шахматка» и не видит разницы.
  if (recipe.transform.flipOddSlices && recipe.panel.strips.length > 1 && nSlices > 1) {
    const matrix = getSpeciesMatrix(recipe, 2);
    if (matrix.length === 2 && matrix[0].join('|') === matrix[1].join('|')) {
      warnings.push({
        id: 'flip_no_effect',
        message:
          'Порядок пород симметричен — переворот планок ничего не меняет. Сдвинь бруски или включи циклический сдвиг.',
      });
    }
  }

  return warnings;
}
