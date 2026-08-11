import type { Recipe } from './types';
import type { RecipeProjection } from './projection';

export type ProcessStep = 'strips' | 'panelA' | 'crosscut' | 'flip' | 'final';

export interface ProcessStepDef {
  id: ProcessStep;
  title: string;
  short: string;
  actionLabel: string;
}

export const PROCESS_STEPS: ProcessStepDef[] = [
  { id: 'strips', title: 'Бруски', short: '1D-рецепт', actionLabel: 'Подготовить бруски' },
  { id: 'panelA', title: 'Щит A', short: 'Первая склейка', actionLabel: 'Склеить щит' },
  { id: 'crosscut', title: 'Распил', short: 'Поперечные планки', actionLabel: 'Распилить' },
  { id: 'flip', title: 'Трансформация', short: 'Flip / shift', actionLabel: 'Перевернуть планки' },
  { id: 'final', title: 'Доска', short: 'Вторая склейка', actionLabel: 'Склеить доску' },
];

export function getStepHint(step: ProcessStep, recipe: Recipe, projection: RecipeProjection): string {
  if (!projection.valid) {
    return `Проверь рецепт: ${projection.issues[0] ?? 'Неизвестная ошибка'}`;
  }
  switch (step) {
    case 'strips':
      return `Брусков в щите: ${projection.cutList.length}. Чистая ширина щита: ${projection.panel.netWidthMm} мм.`;
    case 'panelA':
      return `Использовано длины щита: ${projection.panel.usedUsableLengthMm} мм. Требуемая черновая длина: ${projection.panel.requiredRoughLengthMm} мм.`;
    case 'crosscut': {
      const cuts = Math.max(0, projection.sliceCount - 1);
      const kerfMm3 = Math.round(projection.waste.crosscutKerfM3 * 1e9);
      return `Планок: ${projection.sliceCount}. Внутренних резов: ${cuts}. Потери на пропил: ${kerfMm3} мм³.`;
    }
    case 'flip': {
      const parts: string[] = [];
      if (recipe.transform.flipOddSlices) parts.push('Каждая нечётная планка переворачивается на 180°.');
      else parts.push('Переворот нечётных планок выключен.');
      if (recipe.transform.cyclicShiftStep !== 0) parts.push(`Циклический сдвиг: ${recipe.transform.cyclicShiftStep} элемент(ов).`);
      if (recipe.transform.manualSlices) parts.push('Используется ручная перестановка планок.');
      return parts.join(' ');
    }
    case 'final': {
      const d = projection.finalDimensions;
      return `Итог: ${d.topLengthMm} × ${d.topWidthMm} × ${d.thicknessMm} мм. Отходы: ${projection.totals.wastePct.toFixed(1)}%.`;
    }
    default: return '';
  }
}
