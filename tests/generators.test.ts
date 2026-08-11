import { describe, expect, it } from 'vitest';
import { GENERATORS, GENERATOR_BY_ID, analyseMosaic, generateMosaic, mosaicSize } from '../src/core';
import type { GeneratorOptions } from '../src/core';

const PALETTE = ['maple', 'oak', 'walnut', 'wenge'];

function options(overrides: Partial<GeneratorOptions> = {}): GeneratorOptions {
  return { rows: 21, cols: 21, cellMm: 25, palette: PALETTE, seed: 1, ...overrides };
}

function fingerprint(cells: string[][]): string {
  return cells.map((row) => row.join(',')).join('|');
}

describe('контракт генераторов', () => {
  it('каждый отдаёт сетку нужного размера только из своей палитры', () => {
    for (const meta of GENERATORS) {
      const mosaic = generateMosaic(meta.id, options());
      expect(mosaicSize(mosaic), meta.id).toEqual({ rows: 21, cols: 21 });
      for (const row of mosaic.cells) {
        for (const cell of row) expect(PALETTE, meta.id).toContain(cell);
      }
    }
  });

  it('один seed — один и тот же рисунок', () => {
    for (const meta of GENERATORS) {
      const a = generateMosaic(meta.id, options({ seed: 12345 }));
      const b = generateMosaic(meta.id, options({ seed: 12345 }));
      expect(fingerprint(a.cells), meta.id).toBe(fingerprint(b.cells));
    }
  });

  /**
   * Главная регрессия этой ревизии: раньше seed работал только у пейзажа,
   * и кнопка «другой вариант» у семи стилей из восьми не меняла ничего.
   */
  it('стили с seeded: true дают разные варианты на разных seed', () => {
    for (const meta of GENERATORS.filter((item) => item.seeded)) {
      const variants = new Set(
        [1, 2, 7, 42, 2026].map((seed) => fingerprint(generateMosaic(meta.id, options({ seed })).cells))
      );
      expect(variants.size, `${meta.id} должен давать разные варианты`).toBeGreaterThan(1);
    }
  });

  it('фракталы честно помечены как невариативные и действительно не зависят от seed', () => {
    for (const meta of GENERATORS.filter((item) => !item.seeded)) {
      const a = generateMosaic(meta.id, options({ seed: 1 }));
      const b = generateMosaic(meta.id, options({ seed: 999 }));
      expect(fingerprint(a.cells), meta.id).toBe(fingerprint(b.cells));
    }
  });

  /** Ползунок, объявленный стилем, обязан менять картинку — иначе он мёртвый. */
  it('каждая объявленная ручка реально влияет на рисунок', () => {
    for (const meta of GENERATORS) {
      for (const control of meta.controls) {
        const low = generateMosaic(meta.id, options({ [control.key]: control.min } as Partial<GeneratorOptions>));
        const high = generateMosaic(meta.id, options({ [control.key]: control.max } as Partial<GeneratorOptions>));
        expect(
          fingerprint(low.cells),
          `${meta.id}: ручка «${control.label}» ничего не меняет`
        ).not.toBe(fingerprint(high.cells));
      }
    }
  });

  it('прямоугольная сетка и крошечная палитра не роняют генераторы', () => {
    for (const meta of GENERATORS) {
      const mosaic = generateMosaic(meta.id, options({ rows: 5, cols: 31, palette: ['maple', 'wenge'] }));
      expect(mosaicSize(mosaic), meta.id).toEqual({ rows: 5, cols: 31 });
    }
  });

  it('мусор на входе не ломает генерацию (защита от дурака)', () => {
    const mosaic = generateMosaic('mandala', options({ rows: 0, cols: -5, palette: [] }));
    const size = mosaicSize(mosaic);
    expect(size.rows).toBeGreaterThan(0);
    expect(size.cols).toBeGreaterThan(0);
  });

  it('у каждого стиля заполнены метаданные для UI', () => {
    for (const meta of GENERATORS) {
      expect(GENERATOR_BY_ID[meta.id]).toBe(meta);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.tagline.length).toBeGreaterThan(0);
      expect(meta.minPalette).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('лабиринт', () => {
  it('проходим: клетки-проходы связаны между собой', () => {
    const mosaic = generateMosaic('maze', options({ rows: 21, cols: 21, palette: ['maple', 'wenge'], seed: 3 }));
    const { rows, cols } = mosaicSize(mosaic);
    const isPath = (r: number, c: number) => mosaic.cells[r][c] === 'maple';

    // Собираем связную компоненту от первой попавшейся клетки-прохода.
    let start: [number, number] | null = null;
    let total = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isPath(r, c)) {
          total++;
          if (!start) start = [r, c];
        }
      }
    }
    expect(start).not.toBeNull();

    const seen = new Set<string>();
    const queue = [start!];
    while (queue.length > 0) {
      const [r, c] = queue.pop()!;
      const key = `${r}:${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && isPath(nr, nc)) queue.push([nr, nc]);
      }
    }
    expect(seen.size).toBe(total);
  });
});

describe('анализ рисунка', () => {
  it('видит повторяющийся блок 2×2 и считает выигрыш', () => {
    // Явная шахматка: блок 2×2, повторённый 6×6 раз.
    const mosaic = {
      cellMm: 25,
      cells: Array.from({ length: 12 }, (_, r) =>
        Array.from({ length: 12 }, (_, c) => ((r + c) % 2 === 0 ? 'maple' : 'wenge'))
      ),
    };
    const analysis = analyseMosaic(mosaic);
    expect(analysis.block).toEqual({
      blockRows: 2, blockCols: 2, repeatsX: 6, repeatsY: 6, reduction: 36,
    });
  });

  it('период, не делящий сторону нацело, блоком не считается', () => {
    // Период 5 по колонкам на ширине 12 и период 5 по строкам на высоте 12:
    // ни по одной оси нацело не делится, блоками такую доску не собрать.
    const mosaic = {
      cellMm: 25,
      cells: Array.from({ length: 12 }, (_, r) =>
        Array.from({ length: 12 }, (_, c) => ((r % 5) + (c % 5) === 0 ? 'wenge' : 'maple'))
      ),
    };
    expect(analyseMosaic(mosaic).block).toBeNull();
  });

  it('видит зеркальную симметрию мандалы', () => {
    const analysis = analyseMosaic(generateMosaic('mandala', options()));
    expect(analysis.symmetry.vertical).toBe(true);
  });

  it('на непериодичном рисунке блока нет', () => {
    const analysis = analyseMosaic(generateMosaic('landscape', options({ seed: 5 })));
    expect(analysis.block).toBeNull();
  });

  it('считает число использованных пород', () => {
    const analysis = analyseMosaic(generateMosaic('checker', options({ palette: ['maple', 'wenge'], scale: 1 })));
    expect(analysis.speciesUsed).toBe(2);
  });
});
