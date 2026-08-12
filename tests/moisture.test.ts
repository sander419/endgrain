import { describe, expect, it } from 'vitest';
import {
  SPECIES_BY_ID,
  analyseMovement,
  dimensionalChangeCoefficient,
  equilibriumMoisturePct,
  movementMm,
} from '../src/core';

describe('равновесная влажность (EMC)', () => {
  /**
   * Контрольные точки из таблицы EMC Wood Handbook (гл. 4) при 21 °C.
   * Если формула Hailwood–Horrobin введена с ошибкой, эти значения разъедутся
   * первыми — на них и держится весь расчёт движения.
   */
  const cases: [number, number][] = [
    [30, 6.2],
    [50, 9.2],
    [65, 12.0],
    [80, 16.0],
    [90, 20.5],
  ];

  for (const [rh, expected] of cases) {
    it(`при 21 °C и ${rh}% влажности воздуха даёт ≈${expected}%`, () => {
      const emc = equilibriumMoisturePct({ temperatureC: 21, relativeHumidityPct: rh });
      expect(emc).toBeCloseTo(expected, 0);
      expect(Math.abs(emc - expected)).toBeLessThan(0.5);
    });
  }

  it('растёт вместе с влажностью воздуха', () => {
    const dry = equilibriumMoisturePct({ temperatureC: 21, relativeHumidityPct: 30 });
    const damp = equilibriumMoisturePct({ temperatureC: 21, relativeHumidityPct: 70 });
    expect(damp).toBeGreaterThan(dry);
  });

  it('при одной влажности воздуха тёплый воздух даёт чуть меньшую EMC', () => {
    const cool = equilibriumMoisturePct({ temperatureC: 10, relativeHumidityPct: 60 });
    const warm = equilibriumMoisturePct({ temperatureC: 30, relativeHumidityPct: 60 });
    expect(warm).toBeLessThan(cool);
  });

  it('края диапазона не ломают формулу', () => {
    expect(equilibriumMoisturePct({ temperatureC: 20, relativeHumidityPct: 0 })).toBeCloseTo(0, 1);
    expect(equilibriumMoisturePct({ temperatureC: 20, relativeHumidityPct: 100 })).toBeLessThanOrEqual(30);
    expect(equilibriumMoisturePct({ temperatureC: 20, relativeHumidityPct: 150 })).toBeLessThanOrEqual(30);
  });
});

describe('коэффициент размерных изменений', () => {
  it('считается как полная усушка, делённая на 30 (Wood Handbook, гл. 13)', () => {
    const maple = SPECIES_BY_ID.maple;
    // Клён: тангенциальная усушка 9.9% → 0.0033 на процент влажности.
    expect(dimensionalChangeCoefficient(maple, 'tangential')).toBeCloseTo(0.0033, 5);
    expect(dimensionalChangeCoefficient(maple, 'radial')).toBeCloseTo(0.0016, 4);
  });

  it('тангенциальное движение всегда больше радиального', () => {
    for (const species of Object.values(SPECIES_BY_ID)) {
      const radial = dimensionalChangeCoefficient(species, 'radial')!;
      const tangential = dimensionalChangeCoefficient(species, 'tangential')!;
      expect(tangential, species.name).toBeGreaterThan(radial);
    }
  });

  it('без данных по усушке коэффициента нет, а не ноль', () => {
    expect(dimensionalChangeCoefficient({ id: 'x', name: 'X', colorHex: '#fff' }, 'radial')).toBeNull();
  });
});

describe('движение элемента', () => {
  it('клён шириной 100 мм при +4% влажности разбухает примерно на 1.3 мм', () => {
    const movement = movementMm(100, SPECIES_BY_ID.maple, 'tangential', 8, 12);
    expect(movement).toBeCloseTo(1.32, 2);
  });

  it('при высыхании знак отрицательный', () => {
    expect(movementMm(100, SPECIES_BY_ID.maple, 'tangential', 12, 8)!).toBeLessThan(0);
  });

  it('бук движется заметно сильнее вишни — на этом и строится предупреждение', () => {
    const beech = Math.abs(movementMm(40, SPECIES_BY_ID.beech, 'tangential', 8, 12)!);
    const cherry = Math.abs(movementMm(40, SPECIES_BY_ID.cherry, 'tangential', 8, 12)!);
    expect(beech).toBeGreaterThan(cherry * 1.5);
  });
});

describe('разбор доски целиком', () => {
  const usage = [
    { speciesId: 'beech', totalWidthMm: 120, stripWidthMm: 40 },
    { speciesId: 'cherry', totalWidthMm: 120, stripWidthMm: 40 },
  ];

  it('находит худшую пару и считает расхождение', () => {
    const report = analyseMovement(
      usage,
      SPECIES_BY_ID,
      { temperatureC: 18, relativeHumidityPct: 35 },
      { temperatureC: 24, relativeHumidityPct: 75 }
    );

    expect(report.deltaMoisturePct).toBeGreaterThan(0);
    expect(report.worstMismatchMm).toBeGreaterThan(0);
    expect(report.mismatchBetween).toEqual(['Бук', 'Вишня']);
    expect(report.missingData).toBe(0);
  });

  it('в одинаковых условиях движения нет', () => {
    const climate = { temperatureC: 22, relativeHumidityPct: 50 };
    const report = analyseMovement(usage, SPECIES_BY_ID, climate, climate);
    expect(report.deltaMoisturePct).toBeCloseTo(0, 6);
    expect(report.worstMismatchMm).toBeCloseTo(0, 6);
    expect(report.boardWidthMovementMm).toBeCloseTo(0, 6);
  });

  it('порода без данных считается отдельно, а не как ноль движения', () => {
    const report = analyseMovement(
      [{ speciesId: 'unknown-wood', totalWidthMm: 100, stripWidthMm: 40 }],
      SPECIES_BY_ID,
      { temperatureC: 18, relativeHumidityPct: 35 },
      { temperatureC: 24, relativeHumidityPct: 75 }
    );
    expect(report.missingData).toBe(1);
    expect(report.perSpecies[0].hasData).toBe(false);
  });
});
