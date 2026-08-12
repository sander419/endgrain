import type { Recipe, WoodSpecies } from './types';

/**
 * Справочник пород.
 *
 * Плотность, твёрдость и усушка сверены поштучно 12.08.2026 по The Wood Database
 * (значения там сведены из USDA Wood Handbook). Сверка была не формальностью:
 * до неё усушка дуба стояла 4.4/8.8 вместо 5.6/10.5, а плотность врала у пяти
 * пород из семи. На этих числах считается движение древесины, поэтому
 * вписывать их по памяти нельзя — только со ссылкой и датой.
 *
 * Цена — рыночный ориентир для России, справочной величиной не является
 * и сверке по этому источнику не подлежит: зависит от поставщика, сорта и партии.
 */
const WOOD_DB = (slug: string): WoodSpecies['source'] => ({
  name: 'The Wood Database',
  url: `https://www.wood-database.com/${slug}/`,
  verifiedAt: '2026-08-12',
});

export const SPECIES_CATALOG: WoodSpecies[] = [
  {
    id: 'maple', name: 'Клён', scientificName: 'Acer saccharum', colorHex: '#E8C9A0',
    densityKgM3: 705, jankaHardnessN: 6450, pricePerCubicMeter: 95000,
    shrinkageRadialPct: 4.8, shrinkageTangentialPct: 9.9, shrinkageVolumetricPct: 14.7,
    source: WOOD_DB('hard-maple'),
  },
  {
    id: 'walnut', name: 'Орех', scientificName: 'Juglans nigra', colorHex: '#5B4034',
    densityKgM3: 610, jankaHardnessN: 4490, pricePerCubicMeter: 190000,
    shrinkageRadialPct: 5.5, shrinkageTangentialPct: 7.8, shrinkageVolumetricPct: 12.8,
    source: WOOD_DB('black-walnut'),
  },
  {
    id: 'oak', name: 'Дуб белый', scientificName: 'Quercus alba', colorHex: '#B08A55',
    densityKgM3: 755, jankaHardnessN: 5990, pricePerCubicMeter: 85000,
    shrinkageRadialPct: 5.6, shrinkageTangentialPct: 10.5, shrinkageVolumetricPct: 16.3,
    source: WOOD_DB('white-oak'),
  },
  {
    id: 'cherry', name: 'Вишня', scientificName: 'Prunus serotina', colorHex: '#9C5B3C',
    densityKgM3: 560, jankaHardnessN: 4230, pricePerCubicMeter: 130000,
    shrinkageRadialPct: 3.7, shrinkageTangentialPct: 7.1, shrinkageVolumetricPct: 11.5,
    source: WOOD_DB('black-cherry'),
  },
  {
    id: 'ash', name: 'Ясень', scientificName: 'Fraxinus americana', colorHex: '#D9BC90',
    densityKgM3: 675, jankaHardnessN: 5870, pricePerCubicMeter: 78000,
    shrinkageRadialPct: 4.9, shrinkageTangentialPct: 7.8, shrinkageVolumetricPct: 13.3,
    source: WOOD_DB('white-ash'),
  },
  {
    id: 'wenge', name: 'Венге', scientificName: 'Millettia laurentii', colorHex: '#3A2A22',
    densityKgM3: 870, jankaHardnessN: 8600, pricePerCubicMeter: 320000,
    shrinkageRadialPct: 4.8, shrinkageTangentialPct: 8.3, shrinkageVolumetricPct: 13.3,
    source: WOOD_DB('wenge'),
  },
  {
    id: 'beech', name: 'Бук', scientificName: 'Fagus grandifolia', colorHex: '#C99A70',
    densityKgM3: 720, jankaHardnessN: 5780, pricePerCubicMeter: 72000,
    shrinkageRadialPct: 5.5, shrinkageTangentialPct: 11.9, shrinkageVolumetricPct: 17.2,
    source: WOOD_DB('american-beech'),
  },
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
