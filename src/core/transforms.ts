import type { Recipe } from './types';

export function getSliceStripIndices(recipe: Recipe, nSlices: number): number[][] {
  const stripCount = recipe.panel.strips.length;
  if (nSlices <= 0 || stripCount === 0) return [];

  const base = Array.from({ length: stripCount }, (_, index) => index);

  const sliceOrder = Array.from({ length: nSlices }, (_, position) => {
    const requested = recipe.transform.sliceOrder?.[position];
    if (Number.isInteger(requested) && requested !== undefined && requested >= 0 && requested < nSlices) {
      return requested as number;
    }
    return position;
  });

  return sliceOrder.map((sliceIndex) => {
    const manual = recipe.transform.manualSlices?.[sliceIndex];
    if (
      Array.isArray(manual) &&
      manual.length === stripCount &&
      manual.every((value) => Number.isInteger(value) && value >= 0 && value < stripCount)
    ) {
      return [...manual];
    }

    let sequence = [...base];
    if (recipe.transform.flipOddSlices && sliceIndex % 2 === 1) {
      sequence.reverse();
    }

    const step = recipe.transform.cyclicShiftStep;
    if (Number.isFinite(step) && step !== 0) {
      const shift = ((sliceIndex * step) % stripCount + stripCount) % stripCount;
      sequence = [...sequence.slice(shift), ...sequence.slice(0, shift)];
    }

    return sequence;
  });
}

export function getSpeciesMatrix(recipe: Recipe, nSlices: number): string[][] {
  const indices = getSliceStripIndices(recipe, nSlices);
  return indices.map((row) =>
    row.map((stripIndex) => recipe.panel.strips[stripIndex]?.speciesId ?? 'unknown')
  );
}
