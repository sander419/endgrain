/**
 * Движение древесины от влажности.
 *
 * Зачем это в конструкторе досок. Дерево не пластик: оно набирает и отдаёт влагу
 * вслед за воздухом и меняет размеры. В торцевой доске это критичнее, чем в любой
 * другой: волокна стоят вертикально, вдоль волокна движение почти нулевое, зато
 * В ПЛОСКОСТИ доска движется сразу в двух направлениях — радиальном и
 * тангенциальном. Соседние бруски разных пород двигаются по-разному, и разница
 * ложится напряжением на клеевой шов.
 *
 * Источник формул: USDA Wood Handbook (FPL-GTR-282, 2021):
 * — равновесная влажность, гл. 4, модель Hailwood–Horrobin для двух гидратов;
 * — коэффициент размерных изменений, гл. 13: C = S / 30, где S — полная усушка.
 */
import type { WoodSpecies } from './types';

/**
 * В формуле коэффициента размерных изменений Wood Handbook делит полную усушку
 * на 30 — приближение точки насыщения волокна в процентах влажности.
 */
const FIBER_SATURATION_PCT = 30;

export type GrainDirection = 'radial' | 'tangential';

export interface Climate {
  /** Температура воздуха, °C. */
  temperatureC: number;
  /** Относительная влажность воздуха, %. */
  relativeHumidityPct: number;
}

/** Типовые условия, между которыми и живёт доска. */
export const CLIMATE_PRESETS: { id: string; label: string; climate: Climate; note: string }[] = [
  {
    id: 'shop-winter', label: 'Мастерская зимой', climate: { temperatureC: 18, relativeHumidityPct: 35 },
    note: 'Отопление сушит воздух — дерево отдаёт влагу и сжимается',
  },
  {
    id: 'shop-summer', label: 'Мастерская летом', climate: { temperatureC: 24, relativeHumidityPct: 60 },
    note: 'Обычные условия склейки в тёплый сезон',
  },
  {
    id: 'kitchen', label: 'Кухня', climate: { temperatureC: 22, relativeHumidityPct: 50 },
    note: 'Где доска будет жить большую часть времени',
  },
  {
    id: 'kitchen-humid', label: 'Кухня во время готовки', climate: { temperatureC: 24, relativeHumidityPct: 75 },
    note: 'Пар от плиты, мытьё — кратковременный, но регулярный пик',
  },
];

/**
 * Равновесная влажность древесины (EMC) при заданных температуре и влажности
 * воздуха. Модель Hailwood–Horrobin для двух гидратов, Wood Handbook, гл. 4.
 *
 * Коэффициенты ниже — вариант записи для температуры в ГРАДУСАХ ЦЕЛЬСИЯ.
 * Существует такая же формула с другими коэффициентами для Фаренгейта; если
 * перепутать, при 21 °C и 65% влажности выходит 9.4% вместо табличных 12%.
 * Контрольные точки таблицы EMC закреплены тестом.
 */
export function equilibriumMoisturePct(climate: Climate): number {
  const rh = Math.max(0, Math.min(100, climate.relativeHumidityPct));
  const h = rh / 100;
  const t = climate.temperatureC;

  const w = 349 + 1.29 * t + 0.0135 * t * t;
  const k = 0.805 + 0.000736 * t - 0.00000273 * t * t;
  const k1 = 6.27 - 0.00938 * t - 0.000303 * t * t;
  const k2 = 1.91 + 0.0407 * t - 0.000293 * t * t;

  const kh = k * h;
  if (kh >= 1) return 30; // выше точки насыщения волокна модель не работает

  const first = kh / (1 - kh);
  const second =
    (k1 * kh + 2 * k1 * k2 * kh * kh) /
    (1 + k1 * kh + k1 * k2 * kh * kh);

  const emc = (1800 / w) * (first + second);
  return Math.max(0, Math.min(FIBER_SATURATION_PCT, emc));
}

/**
 * Коэффициент размерных изменений: доля размера на каждый процент влажности.
 * Wood Handbook, гл. 13.
 */
export function dimensionalChangeCoefficient(
  species: WoodSpecies,
  direction: GrainDirection
): number | null {
  const shrinkage = direction === 'radial'
    ? species.shrinkageRadialPct
    : species.shrinkageTangentialPct;
  if (typeof shrinkage !== 'number') return null;
  return shrinkage / 100 / FIBER_SATURATION_PCT;
}

/** Изменение размера, мм. Положительное — разбухание, отрицательное — усушка. */
export function movementMm(
  sizeMm: number,
  species: WoodSpecies,
  direction: GrainDirection,
  fromMoisturePct: number,
  toMoisturePct: number
): number | null {
  const coefficient = dimensionalChangeCoefficient(species, direction);
  if (coefficient === null) return null;
  return sizeMm * coefficient * (toMoisturePct - fromMoisturePct);
}

export interface SpeciesMovement {
  speciesId: string;
  speciesName: string;
  /** Движение бруска указанной ширины, мм: минимальное (радиальное). */
  radialMm: number | null;
  /** Максимальное (тангенциальное) — по нему и считают риск. */
  tangentialMm: number | null;
  /** Нет данных по усушке — честно говорим, а не подставляем ноль. */
  hasData: boolean;
}

export interface MovementReport {
  from: { climate: Climate; moisturePct: number };
  to: { climate: Climate; moisturePct: number };
  deltaMoisturePct: number;
  /** Движение каждой породы на ширине одного бруска. */
  perSpecies: SpeciesMovement[];
  /**
   * Разница движения между самой «подвижной» и самой «спокойной» породой
   * на ширине бруска, мм. Именно она нагружает клеевой шов между соседями.
   */
  worstMismatchMm: number;
  /** Породы, давшие эту разницу. */
  mismatchBetween: [string, string] | null;
  /** Суммарное движение всей ширины доски по худшему направлению, мм. */
  boardWidthMovementMm: number;
  /** У скольких пород не хватило данных для расчёта. */
  missingData: number;
}

/**
 * Расчёт движения для набора брусков одинаковой ширины (мозаика — клетка,
 * рецепт — ширина бруска). Ширина берётся по каждой породе отдельно, потому
 * что суммарное движение доски складывается из движения всех брусков.
 */
export function analyseMovement(
  usage: { speciesId: string; totalWidthMm: number; stripWidthMm: number }[],
  species: Record<string, WoodSpecies>,
  fromClimate: Climate,
  toClimate: Climate
): MovementReport {
  const fromMc = equilibriumMoisturePct(fromClimate);
  const toMc = equilibriumMoisturePct(toClimate);
  const delta = toMc - fromMc;

  const perSpecies: SpeciesMovement[] = usage.map((item) => {
    const wood = species[item.speciesId];
    const radial = wood ? movementMm(item.stripWidthMm, wood, 'radial', fromMc, toMc) : null;
    const tangential = wood ? movementMm(item.stripWidthMm, wood, 'tangential', fromMc, toMc) : null;
    return {
      speciesId: item.speciesId,
      speciesName: wood?.name ?? item.speciesId,
      radialMm: radial,
      tangentialMm: tangential,
      hasData: radial !== null && tangential !== null,
    };
  });

  const withData = perSpecies.filter((item) => item.hasData);
  let worstMismatchMm = 0;
  let mismatchBetween: [string, string] | null = null;

  if (withData.length > 1) {
    const sorted = [...withData].sort(
      (a, b) => Math.abs(a.tangentialMm!) - Math.abs(b.tangentialMm!)
    );
    const calm = sorted[0];
    const lively = sorted[sorted.length - 1];
    worstMismatchMm = Math.abs(lively.tangentialMm!) - Math.abs(calm.tangentialMm!);
    mismatchBetween = [lively.speciesName, calm.speciesName];
  }

  const boardWidthMovementMm = usage.reduce((sum, item) => {
    const wood = species[item.speciesId];
    const movement = wood
      ? movementMm(item.totalWidthMm, wood, 'tangential', fromMc, toMc)
      : null;
    return sum + (movement ?? 0);
  }, 0);

  return {
    from: { climate: fromClimate, moisturePct: fromMc },
    to: { climate: toClimate, moisturePct: toMc },
    deltaMoisturePct: delta,
    perSpecies,
    worstMismatchMm,
    mismatchBetween,
    boardWidthMovementMm,
    missingData: perSpecies.length - withData.length,
  };
}
