export type Units = 'mm' | 'inch';

export interface WoodSpecies {
  id: string;
  name: string;
  colorHex: string;
  /** Только для расчётов, если есть проверяемые данные. */
  densityKgM3?: number;
  /** Только для расчётов, если есть проверяемые данные. */
  pricePerCubicMeter?: number;
  /** Опциональные данные усушки. Не выдумывать значения без источника. */
  shrinkageRadialPct?: number;
  shrinkageTangentialPct?: number;
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
