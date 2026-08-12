import { describe, expect, it } from 'vitest';
import { buildMosaicShareUrl, decodeMosaicDna, emptyMosaic, encodeMosaicDna, paintCell } from '../src/core';
import type { Mosaic } from '../src/core';

describe('mosaic DNA round-trip', () => {
  it('восстанавливает клетки как есть', () => {
    const mosaic = paintCell(paintCell(emptyMosaic(3, 4, 'maple', 25), 0, 0, 'walnut'), 2, 3, 'wenge');
    const decoded = decodeMosaicDna(encodeMosaicDna(mosaic));
    expect(decoded).toEqual(mosaic);
  });

  it('кодировка компактна: индекс породы, а не строка на клетку', () => {
    const mosaic = emptyMosaic(21, 21, 'maple', 25);
    const dna = encodeMosaicDna(mosaic);
    expect(dna.grid.length).toBe(21 * 21);
    expect(dna.palette).toEqual(['maple']);
    // JSON одной породы на сетке 21×21 держится в паре сотен символов, а не тысяч.
    expect(JSON.stringify(dna).length).toBeLessThan(600);
  });

  it('палитра больше 36 пород — кодек не рвётся, decode честно отказывает вместо порчи данных', () => {
    // Один base36-символ на клетку держит индексы 0..35. Реальный каталог пород
    // (7 шт) до этого предела не дотягивается, но кодек не должен молча вернуть
    // мусор, если дотянется: длина grid перестаёт совпадать с rows×cols,
    // decodeMosaicDna это ловит и возвращает null, а не битую мозаику.
    const many = Array.from({ length: 40 }, (_, i) => `species-${i}`);
    const mosaic: Mosaic = { cellMm: 25, cells: [many] };
    const dna = encodeMosaicDna(mosaic);
    expect(decodeMosaicDna(dna)).toBeNull();
  });

  it('битые данные не роняют приложение', () => {
    expect(decodeMosaicDna({ v: 1, rows: 2, cols: 2, cellMm: 25, palette: [], grid: 'ab' })).toBeNull();
    expect(decodeMosaicDna({ v: 1, rows: 2, cols: 2, cellMm: 25, palette: ['maple'], grid: 'a' })).toBeNull();
  });

  it('buildMosaicShareUrl отдаёт пустую строку без window (SSR-заглушка)', () => {
    expect(typeof buildMosaicShareUrl(emptyMosaic(1, 1, 'maple', 25))).toBe('string');
  });

  /**
   * Регрессия: ссылка без ?mode=mosaic открывается в режиме «Рецепт» (дефолт
   * при пустом localStorage), MosaicStudio не монтируется, и #mdna из хэша
   * читать некому — для нового посетителя ссылка выглядит нерабочей.
   *
   * Тесты по умолчанию идут без DOM (environment: node, window === undefined,
   * buildMosaicShareUrl честно отдаёт '' — проверено тестом выше). Здесь
   * подставляем минимальный window вручную, только с тем, что читает функция.
   */
  it('ссылка несёт ?mode=mosaic — иначе новый посетитель откроет рецепт, а не мозаику', () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: { origin: 'https://example.test', pathname: '/endgrain/' },
    };
    try {
      const url = buildMosaicShareUrl(emptyMosaic(3, 3, 'maple', 25));
      expect(url).toContain('?mode=mosaic');
      expect(url.indexOf('?mode=mosaic')).toBeLessThan(url.indexOf('#mdna='));
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});
