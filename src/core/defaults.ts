import type { Recipe, WoodSpecies } from './types';

/**
 * Справочник пород. Плотность и усушка — усреднённые справочные значения,
 * цена — ориентир, все поля редактируются в UI. Ничего не выдумано «под расчёт»:
 * если данных нет, поле остаётся пустым.
 */
export const SPECIES_CATALOG: WoodSpecies[] = [
  { id: 'maple', name: 'Клён', colorHex: '#E8C9A0', densityKgM3: 705, pricePerCubicMeter: 95000, shrinkageRadialPct: 4.8, shrinkageTangentialPct: 9.9 },
  { id: 'walnut', name: 'Орех', colorHex: '#5B4034', densityKgM3: 660, pricePerCubicMeter: 190000, shrinkageRadialPct: 5.5, shrinkageTangentialPct: 7.8 },
  { id: 'oak', name: 'Дуб', colorHex: '#B08A55', densityKgM3: 750, pricePerCubicMeter: 85000, shrinkageRadialPct: 4.4, shrinkageTangentialPct: 8.8 },
  { id: 'cherry', name: 'Вишня', colorHex: '#9C5B3C', densityKgM3: 620, pricePerCubicMeter: 130000, shrinkageRadialPct: 3.7, shrinkageTangentialPct: 7.1 },
  { id: 'ash', name: 'Ясень', colorHex: '#D9BC90', densityKgM3: 710, pricePerCubicMeter: 78000, shrinkageRadialPct: 4.9, shrinkageTangentialPct: 7.8 },
  { id: 'wenge', name: 'Венге', colorHex: '#3A2A22', densityKgM3: 880, pricePerCubicMeter: 320000, shrinkageRadialPct: 4.8, shrinkageTangentialPct: 8.1 },
  { id: 'beech', name: 'Бук', colorHex: '#C99A70', densityKgM3: 720, pricePerCubicMeter: 72000, shrinkageRadialPct: 5.5, shrinkageTangentialPct: 11.9 },
];

export const SPECIES_BY_ID: Record<string, WoodSpecies> = Object.fromEntries(
  SPECIES_CATALOG.map((species) => [species.id, species])
);

export function defaultRecipe(): Recipe {
  return {
    units: 'mm',
    species: SPECIES_BY_ID,
    panel: {
      strips: [
        { speciesId: 'maple', widthMm: 40 },
        { speciesId: 'walnut', widthMm: 40 },
        { speciesId: 'maple', widthMm: 40 },
        { speciesId: 'walnut', widthMm: 40 },
        { speciesId: 'maple', widthMm: 40 },
        { speciesId: 'walnut', widthMm: 40 },
      ],
      stripThicknessMm: 40,
      usableLengthMm: 600,
    },
    crosscut: { sliceThicknessMm: 40, sawKerfMm: 3, bladeAngleDeg: 90 },
    transform: { flipOddSlices: true, cyclicShiftStep: 0 },
    allowances: { thicknessSurfacingMm: 3, stripWidthJointMm: 2, panelEndTrimMm: 30 },
  };
}

export const MM_PER_INCH = 25.4;
export const M3_PER_BOARD_FOOT = 0.002359737216;

/** Склонение по-русски: 1 планка, 2 планки, 5 планок. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatLength(mm: number, units: 'mm' | 'inch'): string {
  if (units === 'inch') return `${(mm / MM_PER_INCH).toFixed(2)}″`;
  return `${Math.round(mm * 10) / 10} мм`;
}
