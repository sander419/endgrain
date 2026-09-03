import { describe, it, expect, beforeEach } from 'vitest';
import {
  CONFIDENT_BOARDS,
  FACTLOG_STORAGE_KEY,
  MAX_FACT_ENTRIES,
  addFactEntry,
  calibrateNorms,
  createFactEntry,
  exportFactLog,
  importFactLog,
  loadFactLog,
  removeFactEntry,
  sanitizeFactEntry,
  saveFactLog,
  summariseFactLog,
} from '../src/core/factlog';
import { DEFAULT_TIME_NORMS } from '../src/core/economics';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
});

const entry = (plannedMin: number, actualMin: number, count = 1) =>
  createFactEntry({
    date: '2026-09-04',
    code: 'A7F3',
    count,
    plannedMin,
    actualMin,
    plannedMaterialRub: 1000,
    actualMaterialRub: 1100,
  });

describe('журнал', () => {
  it('запись сохраняется и читается обратно', () => {
    saveFactLog([entry(100, 140)]);
    const log = loadFactLog();
    expect(log).toHaveLength(1);
    expect(log[0].actualMin).toBe(140);
  });

  it('новая запись встаёт первой', () => {
    const first = createFactEntry({ note: 'первая' });
    const list = addFactEntry([first], createFactEntry({ note: 'вторая' }));
    expect(list[0].note).toBe('вторая');
  });

  it('удаление убирает ровно одну запись', () => {
    const a = createFactEntry();
    const b = createFactEntry();
    expect(removeFactEntry([a, b], a.id)).toEqual([b]);
  });

  it('битое хранилище не роняет загрузку', () => {
    localStorage.setItem(FACTLOG_STORAGE_KEY, 'не json');
    expect(loadFactLog()).toEqual([]);
  });

  it('журнал не растёт бесконечно', () => {
    const many = Array.from({ length: MAX_FACT_ENTRIES + 20 }, () => createFactEntry());
    expect(saveFactLog(many)).toHaveLength(MAX_FACT_ENTRIES);
  });

  it('отрицательное время обнуляется, а не уходит в минус', () => {
    expect(sanitizeFactEntry({ actualMin: -50 }).actualMin).toBe(0);
  });

  it('время на порядок больше разумного зажимается: это опечатка, а не смена', () => {
    expect(sanitizeFactEntry({ actualMin: 1e9 }).actualMin).toBe(20_000);
  });

  it('кривая дата становится пустой, а не сегодняшней', () => {
    expect(sanitizeFactEntry({ date: '04.09.2026' }).date).toBe('');
  });
});

describe('свод по журналу', () => {
  it('пустой журнал не выдумывает множитель', () => {
    const summary = summariseFactLog([]);
    expect(summary.timeRatio).toBe(1);
    expect(summary.confident).toBe(false);
    expect(summary.suggested).toEqual(DEFAULT_TIME_NORMS);
  });

  it('недооценка времени видна множителем больше единицы', () => {
    const summary = summariseFactLog([entry(100, 150), entry(200, 300)]);
    expect(summary.timeRatio).toBeCloseTo(1.5, 6);
  });

  it('множитель считается по сумме, а не по среднему из отношений', () => {
    // Средним из отношений маленькая доска весила бы столько же, сколько
    // большая, и одна ошибка на мелочи перекашивала бы весь норматив.
    const summary = summariseFactLog([entry(10, 20), entry(1000, 1000)]);
    expect(summary.timeRatio).toBeCloseTo(1020 / 1010, 6);
  });

  it('запись без плана не ломает отношение, но доски из неё считаются', () => {
    const summary = summariseFactLog([entry(100, 150), entry(0, 90, 2)]);
    expect(summary.timeRatio).toBeCloseTo(1.5, 6);
    expect(summary.boards).toBe(3);
  });

  it('пока досок мало, множитель показывается, но нормативом не зовётся', () => {
    const summary = summariseFactLog([entry(100, 150)]);
    expect(summary.timeRatio).toBeCloseTo(1.5, 6);
    expect(summary.confident).toBe(false);
  });

  it('с достаточным числом досок свод становится нормативом', () => {
    const summary = summariseFactLog([entry(100, 150, CONFIDENT_BOARDS)]);
    expect(summary.confident).toBe(true);
  });

  it('материал считается отдельно от времени', () => {
    const summary = summariseFactLog([entry(100, 100)]);
    expect(summary.materialRatio).toBeCloseTo(1.1, 6);
    expect(summary.timeRatio).toBeCloseTo(1, 6);
  });
});

describe('калибровка нормативов', () => {
  it('множитель 1 оставляет нормативы как есть', () => {
    expect(calibrateNorms(DEFAULT_TIME_NORMS, 1)).toEqual(DEFAULT_TIME_NORMS);
  });

  it('полуторный множитель растягивает все операции', () => {
    const calibrated = calibrateNorms(DEFAULT_TIME_NORMS, 1.5);
    expect(calibrated.perStripMin).toBeCloseTo(DEFAULT_TIME_NORMS.perStripMin * 1.5, 1);
    expect(calibrated.finishingMin).toBeCloseTo(DEFAULT_TIME_NORMS.finishingMin * 1.5, 1);
  });

  it('нелепый множитель зажимается: это опечатка в поле, а не мастерство', () => {
    const fast = calibrateNorms(DEFAULT_TIME_NORMS, 0.01);
    const slow = calibrateNorms(DEFAULT_TIME_NORMS, 100);
    expect(fast.perStripMin).toBeCloseTo(DEFAULT_TIME_NORMS.perStripMin * 0.5, 1);
    expect(slow.perStripMin).toBeCloseTo(DEFAULT_TIME_NORMS.perStripMin * 5, 1);
  });

  it('мусор вместо множителя ничего не меняет', () => {
    for (const junk of [Number.NaN, 0, -2, Number.POSITIVE_INFINITY]) {
      expect(calibrateNorms(DEFAULT_TIME_NORMS, junk), String(junk)).toEqual(DEFAULT_TIME_NORMS);
    }
  });
});

describe('файл журнала', () => {
  it('выгрузка и загрузка возвращают те же записи', () => {
    const entries = [entry(100, 150), entry(50, 40)];
    expect(importFactLog(exportFactLog(entries))).toEqual(entries);
  });

  it('чужой файл журналом не считается', () => {
    expect(importFactLog('{"kind":"endgrain.orders","entries":[]}')).toBeNull();
    expect(importFactLog('[]')).toBeNull();
    expect(importFactLog('не json')).toBeNull();
  });
});
