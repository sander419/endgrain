import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATES,
  DEFAULT_TIME_NORMS,
  calculateEconomics,
  estimateTime,
  formatDuration,
} from '../src/core';
import type { ProductionInput } from '../src/core';

const BOARD: ProductionInput = {
  strips: 6,
  glueUps: 1,
  crosscuts: 13,
  lengthMm: 560,
  widthMm: 240,
  materialCostRub: 971,
};

describe('оценка времени', () => {
  it('складывается из всех этапов и совпадает с суммой частей', () => {
    const time = estimateTime(BOARD);
    const sum = time.stripsMin + time.glueUpMin + time.crosscutMin + time.sandingMin + time.finishingMin;
    expect(time.totalMin).toBeCloseTo(sum, 6);
  });

  it('вторая склейка считается всегда, помимо склейки щитов', () => {
    const one = estimateTime({ ...BOARD, glueUps: 1 });
    const three = estimateTime({ ...BOARD, glueUps: 3 });
    // Разница ровно в два щита, а базовая вторая склейка есть в обоих.
    expect(three.glueUpMin - one.glueUpMin).toBeCloseTo(2 * DEFAULT_TIME_NORMS.perGlueUpMin, 6);
    expect(one.glueUpMin).toBeCloseTo(2 * DEFAULT_TIME_NORMS.perGlueUpMin, 6);
  });

  it('мозаика из многих щитов выходит заметно дольше простого рецепта', () => {
    const simple = estimateTime(BOARD);
    const mosaic = estimateTime({ ...BOARD, strips: 231, glueUps: 11, crosscuts: 20 });
    expect(mosaic.totalMin).toBeGreaterThan(simple.totalMin * 3);
  });

  it('шлифовка растёт с площадью', () => {
    const small = estimateTime({ ...BOARD, lengthMm: 300, widthMm: 200 });
    const big = estimateTime({ ...BOARD, lengthMm: 600, widthMm: 400 });
    expect(big.sandingMin).toBeCloseTo(small.sandingMin * 4, 6);
  });
});

describe('себестоимость и цена', () => {
  it('себестоимость складывается из всех статей', () => {
    const economics = calculateEconomics(BOARD);
    const sum =
      economics.materialRub + economics.consumablesRub + economics.utilitiesRub +
      economics.labourRub + economics.overheadRub;
    expect(economics.costRub).toBeCloseTo(sum, 6);
  });

  it('труд в штучной столярке весит больше материала', () => {
    const economics = calculateEconomics(BOARD);
    expect(economics.labourRub).toBeGreaterThan(economics.materialRub);
    expect(economics.materialSharePct).toBeLessThan(50);
  });

  it('наценка даёт цену и прибыль', () => {
    const economics = calculateEconomics(BOARD, { ...DEFAULT_RATES, targetMarginPct: 100 });
    expect(economics.suggestedPriceRub).toBeCloseTo(economics.costRub * 2, 6);
    expect(economics.profitRub).toBeCloseTo(economics.costRub, 6);
  });

  it('цена отдаётся диапазоном вокруг расчётной', () => {
    const economics = calculateEconomics(BOARD);
    const [low, high] = economics.priceRangeRub;
    expect(low).toBeLessThan(economics.suggestedPriceRub);
    expect(high).toBeGreaterThan(economics.suggestedPriceRub);
  });

  it('нулевая ставка означает «своё время не считаю», а не поломку', () => {
    const economics = calculateEconomics(BOARD, { ...DEFAULT_RATES, hourlyRateRub: 0 });
    expect(economics.labourRub).toBe(0);
    expect(economics.overheadRub).toBe(0);
    expect(economics.costRub).toBeGreaterThan(0);
    expect(Number.isFinite(economics.effectiveHourlyRub)).toBe(true);
  });

  it('отрицательные ставки не создают отрицательную себестоимость', () => {
    const economics = calculateEconomics(BOARD, {
      hourlyRateRub: -100, consumablesRub: -50, utilitiesRub: -10,
      overheadPct: -5, targetMarginPct: -20,
    });
    expect(economics.costRub).toBeGreaterThan(0);
    expect(economics.suggestedPriceRub).toBeGreaterThan(0);
  });

  it('дорогая порода поднимает и себестоимость, и цену', () => {
    const cheap = calculateEconomics({ ...BOARD, materialCostRub: 500 });
    const pricey = calculateEconomics({ ...BOARD, materialCostRub: 5000 });
    expect(pricey.costRub - cheap.costRub).toBeCloseTo(4500, 6);
    expect(pricey.suggestedPriceRub).toBeGreaterThan(cheap.suggestedPriceRub);
  });
});

describe('формат времени', () => {
  it('показывает часы и минуты', () => {
    expect(formatDuration(45)).toBe('45 мин');
    expect(formatDuration(185)).toBe('3 ч 05 мин');
    expect(formatDuration(120)).toBe('2 ч 00 мин');
  });
});
