import type { Recipe } from './types';

const MM3_TO_M3 = 1e-9;

export interface FinalDimensions {
  topLengthMm: number;
  topWidthMm: number;
  thicknessMm: number;
}

export interface CutPiece {
  pieceId: string;
  speciesId: string;
  stage: 'primary_strip';
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
}

export interface MaterialRequirement {
  speciesId: string;
  speciesName: string;
  rawVolumeM3: number;
  netVolumeM3: number;
  netMassKg: number;
  cost: number;
}

export interface WasteBreakdown {
  crosscutKerfM3: number;
  endTrimM3: number;
  processingAllowanceM3: number;
}

export interface RecipeProjection {
  valid: boolean;
  issues: string[];
  sliceCount: number;
  panel: {
    netWidthMm: number;
    netThicknessMm: number;
    usedUsableLengthMm: number;
    requiredRoughLengthMm: number;
    designRemainderLengthMm: number;
  };
  finalDimensions: FinalDimensions;
  cutList: CutPiece[];
  materials: MaterialRequirement[];
  totals: {
    rawVolumeM3: number;
    netVolumeM3: number;
    totalCost: number;
    wastePct: number;
  };
  waste: WasteBreakdown;
}

function safePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function safeNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function panelNetWidthMm(recipe: Recipe): number {
  return recipe.panel.strips.reduce((sum, strip) => {
    return sum + safePositive(strip.widthMm);
  }, 0);
}

export function sliceCount(recipe: Recipe): number {
  const U = safePositive(recipe.panel.usableLengthMm);
  const S = safePositive(recipe.crosscut.sliceThicknessMm);
  const k = safeNonNegative(recipe.crosscut.sawKerfMm);
  if (U === 0 || S === 0) return 0;
  // N*S + (N-1)*k <= U  =>  N <= (U + k) / (S + k)
  return Math.floor((U + k) / (S + k));
}

export function usedUsableLengthMm(recipe: Recipe, nSlices: number): number {
  if (nSlices <= 0) return 0;
  const S = safePositive(recipe.crosscut.sliceThicknessMm);
  const k = safeNonNegative(recipe.crosscut.sawKerfMm);
  const cuts = Math.max(0, nSlices - 1);
  return nSlices * S + cuts * k;
}

export function requiredRoughLengthMm(recipe: Recipe, nSlices: number): number {
  if (nSlices <= 0) return 0;
  const used = usedUsableLengthMm(recipe, nSlices);
  const endTrim = safeNonNegative(recipe.allowances.panelEndTrimMm);
  return used + endTrim;
}

export function finalDimensions(recipe: Recipe, nSlices: number): FinalDimensions {
  const topWidthMm = panelNetWidthMm(recipe);
  const stripThickness = safePositive(recipe.panel.stripThicknessMm);
  const sliceThickness = safePositive(recipe.crosscut.sliceThicknessMm);
  if (nSlices <= 0) {
    return { topLengthMm: 0, topWidthMm, thicknessMm: 0 };
  }
  return {
    topLengthMm: nSlices * stripThickness,
    topWidthMm,
    thicknessMm: sliceThickness,
  };
}

export function projectRecipe(recipe: Recipe): RecipeProjection {
  const issues: string[] = [];

  if (recipe.crosscut.bladeAngleDeg !== 90) {
    issues.push('V1 поддерживает только bladeAngleDeg = 90.');
  }
  if (recipe.panel.strips.length === 0) {
    issues.push('Нет брусков в первичном щите.');
  }
  if (!(recipe.panel.stripThicknessMm > 0)) {
    issues.push('stripThicknessMm должен быть больше 0.');
  }
  if (!(recipe.crosscut.sliceThicknessMm > 0)) {
    issues.push('sliceThicknessMm должен быть больше 0.');
  }
  if (!(recipe.crosscut.sawKerfMm >= 0)) {
    issues.push('sawKerfMm не может быть отрицательным.');
  }
  if (!(recipe.panel.usableLengthMm > 0)) {
    issues.push('usableLengthMm должен быть больше 0.');
  }
  if (!(recipe.allowances.panelEndTrimMm >= 0)) {
    issues.push('panelEndTrimMm не может быть отрицательным.');
  }
  if (!(recipe.allowances.thicknessSurfacingMm >= 0)) {
    issues.push('thicknessSurfacingMm не может быть отрицательным.');
  }
  if (!(recipe.allowances.stripWidthJointMm >= 0)) {
    issues.push('stripWidthJointMm не может быть отрицательным.');
  }

  recipe.panel.strips.forEach((strip, index) => {
    if (!recipe.species[strip.speciesId]) {
      issues.push(`Не найдена порода для бруска ${index}: ${strip.speciesId}.`);
    }
    if (!(strip.widthMm > 0)) {
      issues.push(`Ширина бруска ${index} должна быть больше 0.`);
    }
  });

  const nSlices = sliceCount(recipe);
  if (nSlices <= 0) {
    issues.push('Недостаточно длины щита для получения хотя бы одной планки.');
  }

  const panelWidth = panelNetWidthMm(recipe);
  const stripThickness = safePositive(recipe.panel.stripThicknessMm);
  const sliceThickness = safePositive(recipe.crosscut.sliceThicknessMm);
  const kerf = safeNonNegative(recipe.crosscut.sawKerfMm);
  const usedLength = usedUsableLengthMm(recipe, nSlices);
  const roughLength = requiredRoughLengthMm(recipe, nSlices);

  const designRemainderLength = Math.max(
    0, safePositive(recipe.panel.usableLengthMm) - usedLength
  );

  const roughThickness = stripThickness + safeNonNegative(recipe.allowances.thicknessSurfacingMm);

  const cutList: CutPiece[] = nSlices > 0
    ? recipe.panel.strips.map((strip, index) => ({
        pieceId: `strip-${index}`,
        speciesId: strip.speciesId,
        stage: 'primary_strip' as const,
        lengthMm: roughLength,
        widthMm: safePositive(strip.widthMm) + safeNonNegative(recipe.allowances.stripWidthJointMm),
        thicknessMm: roughThickness,
      }))
    : [];

  // Raw by species
  const rawBySpecies = new Map<string, number>();
  const netWidthBySpecies = new Map<string, number>();

  for (const piece of cutList) {
    const volumeM3 = piece.lengthMm * piece.widthMm * piece.thicknessMm * MM3_TO_M3;
    rawBySpecies.set(piece.speciesId, (rawBySpecies.get(piece.speciesId) ?? 0) + volumeM3);
  }

  for (const strip of recipe.panel.strips) {
    const width = safePositive(strip.widthMm);
    netWidthBySpecies.set(strip.speciesId, (netWidthBySpecies.get(strip.speciesId) ?? 0) + width);
  }

  const speciesIds = new Set<string>([
    ...Object.keys(recipe.species),
    ...rawBySpecies.keys(),
    ...netWidthBySpecies.keys(),
  ]);

  const materials: MaterialRequirement[] = [];
  for (const speciesId of speciesIds) {
    const species = recipe.species[speciesId];
    if (!species) continue;

    const rawVolumeM3 = rawBySpecies.get(speciesId) ?? 0;
    const netVolumeM3 = nSlices > 0
      ? nSlices * sliceThickness * stripThickness * (netWidthBySpecies.get(speciesId) ?? 0) * MM3_TO_M3
      : 0;

    const density = safeNonNegative(species.densityKgM3 ?? 0);
    const price = safeNonNegative(species.pricePerCubicMeter ?? 0);

    materials.push({
      speciesId,
      speciesName: species.name,
      rawVolumeM3,
      netVolumeM3,
      netMassKg: netVolumeM3 * density,
      cost: rawVolumeM3 * price,
    });
  }

  const totals = materials.reduce(
    (acc, m) => {
      acc.rawVolumeM3 += m.rawVolumeM3;
      acc.netVolumeM3 += m.netVolumeM3;
      acc.totalCost += m.cost;
      return acc;
    },
    { rawVolumeM3: 0, netVolumeM3: 0, totalCost: 0 }
  );

  if (totals.rawVolumeM3 > 0 && totals.netVolumeM3 > totals.rawVolumeM3 + 1e-12) {
    issues.push('Чистый объём превышает сырой объём. Проверьте припуски.');
  }

  const crosscutKerfM3 = nSlices > 0
    ? Math.max(0, nSlices - 1) * kerf * panelWidth * stripThickness * MM3_TO_M3
    : 0;

  const endTrimM3 = nSlices > 0
    ? safeNonNegative(recipe.allowances.panelEndTrimMm) * panelWidth * stripThickness * MM3_TO_M3
    : 0;

  const processingAllowanceM3 = Math.max(
    0,
    totals.rawVolumeM3 - totals.netVolumeM3 - crosscutKerfM3 - endTrimM3
  );

  const wastePct = totals.rawVolumeM3 > 0
    ? ((totals.rawVolumeM3 - totals.netVolumeM3) / totals.rawVolumeM3) * 100
    : 0;

  return {
    valid: issues.length === 0,
    issues,
    sliceCount: nSlices,
    panel: {
      netWidthMm: panelWidth,
      netThicknessMm: stripThickness,
      usedUsableLengthMm: usedLength,
      requiredRoughLengthMm: roughLength,
      designRemainderLengthMm: designRemainderLength,
    },
    finalDimensions: finalDimensions(recipe, nSlices),
    cutList,
    materials,
    totals: {
      rawVolumeM3: totals.rawVolumeM3,
      netVolumeM3: totals.netVolumeM3,
      totalCost: totals.totalCost,
      wastePct,
    },
    waste: { crosscutKerfM3, endTrimM3, processingAllowanceM3 },
  };
}
