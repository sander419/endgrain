/**
 * Экономика изделия: во что доска обходится и сколько на ней можно заработать.
 *
 * Материал мы считали и раньше, но материал — это меньшая часть себестоимости.
 * Основное в штучной столярке — время. Без него вопрос «стоит ли вообще браться»
 * остаётся без ответа.
 *
 * Нормативы времени ниже — оценка для мастерской-одиночки с обычным набором
 * станков, а не измеренный факт. Они собраны в одном месте и правятся в UI:
 * у каждого своя скорость, и подставлять чужую как истину нечестно.
 */

export interface TimeNorms {
  /** Минут на подготовку одного бруска: строгание, фугование, торцовка. */
  perStripMin: number;
  /** Минут на одну склейку: нанести клей, собрать, стянуть. Без сушки. */
  perGlueUpMin: number;
  /** Минут на один поперечный рез с разметкой. */
  perCrosscutMin: number;
  /** Минут на выравнивание и шлифовку одного квадратного дециметра. */
  perSquareDmMin: number;
  /** Минут на финиш: фаска, масло, растирка. */
  finishingMin: number;
}

export const DEFAULT_TIME_NORMS: TimeNorms = {
  perStripMin: 3,
  perGlueUpMin: 18,
  perCrosscutMin: 1.5,
  perSquareDmMin: 2.5,
  finishingMin: 30,
};

export interface WorkshopRates {
  /** Ставка мастера, ₽/час. Ноль означает «своё время не считаю». */
  hourlyRateRub: number;
  /** Клей, масло, шкурка, ножки, упаковка — на одну доску. */
  consumablesRub: number;
  /** Электричество и прочие переменные расходы на доску. */
  utilitiesRub: number;
  /** Амортизация и аренда как доля от трудозатрат, %. */
  overheadPct: number;
  /** Желаемая наценка на полную себестоимость, %. */
  targetMarginPct: number;
}

export const DEFAULT_RATES: WorkshopRates = {
  hourlyRateRub: 600,
  consumablesRub: 350,
  utilitiesRub: 60,
  overheadPct: 15,
  targetMarginPct: 100,
};

/**
 * Хранение ставок переехало в `profile.ts`: ставка мастера — свойство
 * мастерской, а не расчёта, и должна переноситься на другой компьютер вместе
 * с названием, станками и складом. Панель и печатный лист берут их оттуда,
 * чтобы в бумагу попали те же цифры, что человек видел на экране.
 */

export interface ProductionInput {
  /** Сколько брусков готовим (по всем щитам). */
  strips: number;
  /** Сколько отдельных склеек щитов. */
  glueUps: number;
  /** Сколько поперечных резов. */
  crosscuts: number;
  /** Габариты готовой доски, мм. */
  lengthMm: number;
  widthMm: number;
  /** Стоимость материала, ₽ — считается производственной моделью. */
  materialCostRub: number;
}

export interface TimeBreakdown {
  stripsMin: number;
  glueUpMin: number;
  crosscutMin: number;
  sandingMin: number;
  finishingMin: number;
  totalMin: number;
}

export interface Economics {
  time: TimeBreakdown;
  materialRub: number;
  consumablesRub: number;
  utilitiesRub: number;
  labourRub: number;
  overheadRub: number;
  /** Полная себестоимость. */
  costRub: number;
  /** Рекомендуемая цена при заданной наценке. */
  suggestedPriceRub: number;
  /** Диапазон, а не одна цифра: рынок не знает точного числа. */
  priceRangeRub: [number, number];
  profitRub: number;
  /** Сколько выходит в час при рекомендуемой цене. */
  effectiveHourlyRub: number;
  /** Доля материала в себестоимости, % — подсказывает, где экономить. */
  materialSharePct: number;
}

export function estimateTime(input: ProductionInput, norms: TimeNorms = DEFAULT_TIME_NORMS): TimeBreakdown {
  const areaSquareDm = (input.lengthMm / 100) * (input.widthMm / 100);

  const stripsMin = input.strips * norms.perStripMin;
  const glueUpMin = input.glueUps * norms.perGlueUpMin
    // Вторая склейка — всегда одна, независимо от числа щитов.
    + norms.perGlueUpMin;
  const crosscutMin = input.crosscuts * norms.perCrosscutMin;
  // Торцевую доску шлифуют с двух сторон, и торец берёт абразив хуже пласти.
  const sandingMin = areaSquareDm * norms.perSquareDmMin * 2;
  const finishingMin = norms.finishingMin;

  return {
    stripsMin,
    glueUpMin,
    crosscutMin,
    sandingMin,
    finishingMin,
    totalMin: stripsMin + glueUpMin + crosscutMin + sandingMin + finishingMin,
  };
}

export function calculateEconomics(
  input: ProductionInput,
  rates: WorkshopRates = DEFAULT_RATES,
  norms: TimeNorms = DEFAULT_TIME_NORMS
): Economics {
  const time = estimateTime(input, norms);
  const hours = time.totalMin / 60;

  const labourRub = hours * Math.max(0, rates.hourlyRateRub);
  const overheadRub = labourRub * (Math.max(0, rates.overheadPct) / 100);
  const materialRub = Math.max(0, input.materialCostRub);
  const consumablesRub = Math.max(0, rates.consumablesRub);
  const utilitiesRub = Math.max(0, rates.utilitiesRub);

  const costRub = materialRub + consumablesRub + utilitiesRub + labourRub + overheadRub;
  const suggestedPriceRub = costRub * (1 + Math.max(0, rates.targetMarginPct) / 100);

  return {
    time,
    materialRub,
    consumablesRub,
    utilitiesRub,
    labourRub,
    overheadRub,
    costRub,
    suggestedPriceRub,
    // ±15% вокруг расчётной цены: та же доска у разных мастеров и в разных
    // городах уходит по разной цене, точное число здесь было бы враньём.
    priceRangeRub: [suggestedPriceRub * 0.85, suggestedPriceRub * 1.15],
    profitRub: suggestedPriceRub - costRub,
    effectiveHourlyRub: hours > 0 ? (suggestedPriceRub - costRub + labourRub) / hours : 0,
    materialSharePct: costRub > 0 ? (materialRub / costRub) * 100 : 0,
  };
}

/** Часы и минуты для показа: «3 ч 05 мин». */
export function formatDuration(totalMin: number): string {
  const hours = Math.floor(totalMin / 60);
  const minutes = Math.round(totalMin % 60);
  if (hours === 0) return `${minutes} мин`;
  return `${hours} ч ${String(minutes).padStart(2, '0')} мин`;
}
