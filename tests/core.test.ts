import { describe, expect, it } from 'vitest';
import {
  sliceCount,
  usedUsableLengthMm,
  requiredRoughLengthMm,
  finalDimensions,
  projectRecipe,
  getSliceStripIndices,
  getSpeciesMatrix,
} from '../src/core';
import type { Recipe } from '../src/core';

function makeTestRecipe(): Recipe {
  return {
    units: 'mm',
    species: {
      maple: { id: 'maple', name: 'Maple', colorHex: '#E8C39E', densityKgM3: 500, pricePerCubicMeter: 1000 },
      walnut: { id: 'walnut', name: 'Walnut', colorHex: '#5D4037', densityKgM3: 600, pricePerCubicMeter: 1500 },
    },
    panel: {
      strips: [
        { speciesId: 'maple', widthMm: 40 },
        { speciesId: 'walnut', widthMm: 40 },
        { speciesId: 'maple', widthMm: 40 },
        { speciesId: 'walnut', widthMm: 40 },
      ],
      stripThicknessMm: 40,
      usableLengthMm: 400,
    },
    crosscut: { sliceThicknessMm: 40, sawKerfMm: 3, bladeAngleDeg: 90 },
    transform: { flipOddSlices: true, cyclicShiftStep: 0 },
    allowances: { thicknessSurfacingMm: 3, stripWidthJointMm: 2, panelEndTrimMm: 30 },
  };
}

describe('sliceCount', () => {
  it('calculates slices with kerf correctly', () => {
    expect(sliceCount(makeTestRecipe())).toBe(9); // floor((400+3)/(40+3)) = 9
  });
});

describe('length projections', () => {
  it('matches the reference numbers', () => {
    const recipe = makeTestRecipe();
    expect(usedUsableLengthMm(recipe, 9)).toBe(384);
    expect(requiredRoughLengthMm(recipe, 9)).toBe(414);
    expect(finalDimensions(recipe, 9)).toEqual({ topLengthMm: 360, topWidthMm: 160, thicknessMm: 40 });
  });
});

describe('projectRecipe', () => {
  it('calculates materials, waste and cost for the reference case', () => {
    const projection = projectRecipe(makeTestRecipe());
    expect(projection.valid).toBe(true);
    expect(projection.sliceCount).toBe(9);
    expect(projection.finalDimensions).toEqual({ topLengthMm: 360, topWidthMm: 160, thicknessMm: 40 });
    expect(projection.waste.crosscutKerfM3).toBeCloseTo(0.0001536, 10);  // 8*3*160*40
    expect(projection.waste.endTrimM3).toBeCloseTo(0.000192, 10);         // 30*160*40
    expect(projection.totals.netVolumeM3).toBeCloseTo(0.002304, 10);      // 9*40*40*160
    expect(projection.totals.rawVolumeM3).toBeCloseTo(0.002990736, 10);   // 4*414*42*43
    expect(projection.totals.wastePct).toBeCloseTo(22.962, 3);
  });
});

describe('transform matrix', () => {
  it('creates checkerboard with flipOddSlices', () => {
    const recipe = makeTestRecipe();
    const matrix = getSliceStripIndices(recipe, 3);
    expect(matrix[0]).toEqual([0, 1, 2, 3]);
    expect(matrix[1]).toEqual([3, 2, 1, 0]); // flipped
    expect(matrix[2]).toEqual([0, 1, 2, 3]);
  });

  it('maps strip indices to species', () => {
    const recipe = makeTestRecipe();
    const matrix = getSpeciesMatrix(recipe, 2);
    expect(matrix[0]).toEqual(['maple', 'walnut', 'maple', 'walnut']);
    expect(matrix[1]).toEqual(['walnut', 'maple', 'walnut', 'maple']);
  });
});
