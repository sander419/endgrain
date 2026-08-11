import { describe, expect, it } from 'vitest';
import {
  GENERATORS,
  SPECIES_BY_ID,
  compileMosaic,
  emptyMosaic,
  generateMosaic,
  mosaicSize,
  mulberry32,
  paintCell,
  planPanels,
  resizeMosaic,
} from '../src/core';
import type { Mosaic, MosaicRecipe } from '../src/core';

function recipeFor(mosaic: Mosaic): MosaicRecipe {
  return {
    units: 'mm',
    species: SPECIES_BY_ID,
    mosaic,
    crosscut: { sliceThicknessMm: 40, sawKerfMm: 3, bladeAngleDeg: 90 },
    allowances: { thicknessSurfacingMm: 3, stripWidthJointMm: 2, panelEndTrimMm: 30 },
  };
}

/** Шахматка 4×4 из двух пород: колонки бывают только двух видов. */
function checker(): Mosaic {
  return {
    cellMm: 30,
    cells: Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, col) => ((row + col) % 2 === 0 ? 'maple' : 'walnut'))
    ),
  };
}

describe('раскладка на щиты', () => {
  it('шахматке хватает одного щита: вторая колонка — его же планка, перевёрнутая', () => {
    const panels = planPanels(checker());
    expect(panels.length).toBe(1);
    expect(panels[0].columns.length).toBe(4);
    expect(panels[0].columns.filter((c) => c.flipped).length).toBe(2);
  });

  it('зеркальная колонка берётся из того же щита переворотом планки', () => {
    const mosaic: Mosaic = {
      cellMm: 30,
      cells: [
        ['maple', 'walnut'],
        ['maple', 'maple'],
        ['walnut', 'maple'],
      ],
    };
    const panels = planPanels(mosaic);
    expect(panels.length).toBe(1);
    expect(panels[0].columns).toEqual([
      { col: 0, flipped: false },
      { col: 1, flipped: true },
    ]);
  });

  it('полностью разный рисунок требует по щиту на колонку', () => {
    const mosaic: Mosaic = {
      cellMm: 30,
      cells: [
        ['maple', 'walnut', 'oak'],
        ['maple', 'maple', 'maple'],
      ],
    };
    expect(planPanels(mosaic).length).toBe(3);
  });
});

describe('compileMosaic', () => {
  it('считает размеры, щиты и резы для шахматки 4×4', () => {
    const plan = compileMosaic(recipeFor(checker()));

    expect(plan.valid).toBe(true);
    expect(plan.finalDimensions).toEqual({ topLengthMm: 120, topWidthMm: 120, thicknessMm: 40 });
    // Шахматка сводится к одному щиту: половина планок кладётся перевёрнутой.
    expect(plan.totals.glueUps).toBe(1);
    expect(plan.flippedSlices).toBe(2);
    // 4 планки из одного щита → 3 реза.
    expect(plan.totals.crosscuts).toBe(3);
    expect(plan.totals.stripsToPrepare).toBe(4);

    // Чистый объём: 16 клеток 30×30, толщина 40.
    expect(plan.totals.netVolumeM3).toBeCloseTo(16 * 30 * 30 * 40 * 1e-9, 12);

    // Черновая длина щита: 4 среза по 40 + 3 пропила по 3 + торцовка 30.
    expect(plan.panels[0].roughLengthMm).toBe(199);
    // Сырьё: 4 бруска 199 × (30+2) × (30+3).
    expect(plan.totals.rawVolumeM3).toBeCloseTo(4 * 199 * 32 * 33 * 1e-9, 12);
    expect(plan.totals.wastePct).toBeGreaterThan(0);
    expect(plan.totals.wastePct).toBeLessThan(100);
  });

  it('отходы бьются на пропил, торцовку и припуски без нахлёста', () => {
    const plan = compileMosaic(recipeFor(checker()));
    const sum = plan.waste.crosscutKerfM3 + plan.waste.endTrimM3 + plan.waste.processingAllowanceM3;
    expect(sum).toBeCloseTo(plan.totals.rawVolumeM3 - plan.totals.netVolumeM3, 12);
  });

  it('ловит неизвестную породу и пустой рисунок', () => {
    const broken = compileMosaic(recipeFor({ cellMm: 30, cells: [['unicorn']] }));
    expect(broken.valid).toBe(false);
    expect(broken.issues.join(' ')).toContain('неизвестная порода');

    const empty = compileMosaic(recipeFor({ cellMm: 30, cells: [] }));
    expect(empty.valid).toBe(false);
  });

  it('симметричный рисунок требует меньше щитов, чем случайный', () => {
    const palette = ['maple', 'walnut', 'oak', 'wenge'];
    const symmetric = generateMosaic('mandala', { rows: 16, cols: 16, cellMm: 30, palette, seed: 1 });
    const rng = mulberry32(2026);
    const noise: Mosaic = {
      cellMm: 30,
      cells: Array.from({ length: 16 }, () =>
        Array.from({ length: 16 }, () => palette[Math.floor(rng() * palette.length)])
      ),
    };
    // Зеркальная симметрия схлопывает половину колонок в общие щиты.
    expect(planPanels(symmetric).length).toBeLessThanOrEqual(8);
    expect(planPanels(noise).length).toBe(16);
  });
});

describe('правка мозаики', () => {
  it('красит клетку, не трогая соседние', () => {
    const before = emptyMosaic(3, 3, 'maple', 30);
    const after = paintCell(before, 1, 1, 'walnut');
    expect(after.cells[1][1]).toBe('walnut');
    expect(after.cells[0][0]).toBe('maple');
    expect(before.cells[1][1]).toBe('maple'); // исходник не мутирован
  });

  it('не выходит за границы', () => {
    const mosaic = emptyMosaic(2, 2, 'maple', 30);
    expect(paintCell(mosaic, 5, 0, 'oak')).toBe(mosaic);
  });

  it('изменение размера сохраняет рисунок', () => {
    const mosaic = paintCell(emptyMosaic(2, 2, 'maple', 30), 0, 1, 'wenge');
    const bigger = resizeMosaic(mosaic, 4, 4, 'oak');
    expect(mosaicSize(bigger)).toEqual({ rows: 4, cols: 4 });
    expect(bigger.cells[0][1]).toBe('wenge');
    expect(bigger.cells[3][3]).toBe('oak');
  });
});

describe('генераторы', () => {
  const palette = ['maple', 'ash', 'oak', 'walnut', 'wenge'];
  const options = { rows: 15, cols: 15, cellMm: 30, palette, seed: 42 };

  it('все генераторы дают сетку нужного размера из своей палитры', () => {
    for (const generator of GENERATORS) {
      const mosaic = generateMosaic(generator.id, options);
      expect(mosaicSize(mosaic)).toEqual({ rows: 15, cols: 15 });
      for (const row of mosaic.cells) {
        for (const cell of row) expect(palette).toContain(cell);
      }
    }
  });

  it('мандала симметрична по вертикали', () => {
    const mosaic = generateMosaic('mandala', options);
    for (const row of mosaic.cells) {
      expect(row).toEqual([...row].reverse());
    }
  });

  it('пейзаж детерминирован по seed', () => {
    const a = generateMosaic('landscape', { ...options, seed: 7 });
    const b = generateMosaic('landscape', { ...options, seed: 7 });
    const c = generateMosaic('landscape', { ...options, seed: 8 });
    expect(a.cells).toEqual(b.cells);
    expect(a.cells).not.toEqual(c.cells);
  });

  it('прямоугольная сетка тоже работает', () => {
    const mosaic = generateMosaic('mandala', { ...options, rows: 8, cols: 20 });
    expect(mosaicSize(mosaic)).toEqual({ rows: 8, cols: 20 });
  });
});
