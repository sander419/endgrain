export type Units = 'mm' | 'inch';

/** Откуда взято значение. Цена рыночная и сверке по справочнику не подлежит. */
export interface SpeciesSource {
  /** Короткое имя источника для показа рядом с цифрами. */
  name: string;
  url?: string;
  /** Дата сверки в формате ISO. Данные — точка во времени, как и заметки. */
  verifiedAt?: string;
}

export interface WoodSpecies {
  id: string;
  name: string;
  /** Ботаническое название — чтобы «дуб» нельзя было спутать с другим дубом. */
  scientificName?: string;
  colorHex: string;
  /** Только для расчётов, если есть проверяемые данные. */
  densityKgM3?: number;
  /** Твёрдость по Янка, ньютоны. Для разделочной доски — прямой критерий. */
  jankaHardnessN?: number;
  /** Рыночная цена, не справочная величина: зависит от поставщика и сорта. */
  pricePerCubicMeter?: number;
  /**
   * Полная усушка от точки насыщения волокна до абсолютно сухого состояния, %.
   * Именно из этих чисел считается движение древесины (`moisture.ts`),
   * поэтому вписывать их «на глаз» нельзя — только со сверкой по источнику.
   */
  shrinkageRadialPct?: number;
  shrinkageTangentialPct?: number;
  shrinkageVolumetricPct?: number;
  source?: SpeciesSource;
}

export interface Strip {
  speciesId: string;
  widthMm: number;
}

export interface PrimaryPanel {
  strips: Strip[];
  /** Толщина всех брусков в первичном щите A. V1 требует одинаковую толщину. */
  stripThicknessMm: number;
  /** Длина щита A после торцовки, доступная для нарезки планок. */
  usableLengthMm: number;
}

export interface Crosscut {
  /** Толщина поперечного среза = толщина готовой торцевой доски. */
  sliceThicknessMm: number;
  /** Ширина пропила. Обычно 2.4–3.2 мм. */
  sawKerfMm: number;
  /** V1 поддерживает только 90°. 30°/45°/60° — отдельный модуль. */
  bladeAngleDeg: number;
}

export interface TransformRules {
  /** Переворачивать каждую нечётную планку на 180°. Индексация с нуля: 1, 3, 5... */
  flipOddSlices: boolean;
  /** Циклический сдвиг последовательности брусков. Шаг в элементах, не в мм. */
  cyclicShiftStep: number;
  /** Ручной порядок планок: sliceOrder[position] = sliceIndex */
  sliceOrder?: number[];
  /** Ручная перестановка брусков: manualSlices[sliceIndex] = array of strip indices */
  manualSlices?: number[][];
}

export interface Allowances {
  /** Припуск на толщину: фугование/рейсмус. */
  thicknessSurfacingMm: number;
  /** Припуск на ширину каждого бруска. Включает обработку кромок. */
  stripWidthJointMm: number;
  /** Припуск на торцовку первичного щита. +20–30 мм. */
  panelEndTrimMm: number;
}

export interface Recipe {
  units: Units;
  species: Record<string, WoodSpecies>;
  panel: PrimaryPanel;
  crosscut: Crosscut;
  transform: TransformRules;
  allowances: Allowances;
}
