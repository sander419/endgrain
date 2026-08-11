/**
 * Разбор рисунка перед производством.
 *
 * Компилятор щитов (`mosaic.ts`) уже экономит на одинаковых и зеркальных
 * колонках. Но есть вторая экономия, которую он не видит: если рисунок
 * повторяется блоком, доску не обязательно собирать одной длинной склейкой —
 * можно склеить один блок и размножить его. Практическая разница большая:
 * блок стягивается короткими струбцинами, блоки клеятся параллельно, а брак
 * в одном блоке не убивает всю доску.
 */
import type { Mosaic } from './mosaic';
import { mosaicSize } from './mosaic';

export interface BlockRepeat {
  blockRows: number;
  blockCols: number;
  repeatsX: number;
  repeatsY: number;
  /** Сколько клеток в блоке против всей доски — во столько раз меньше работы. */
  reduction: number;
}

export interface Symmetry {
  /** Рисунок зеркален относительно вертикальной оси (левая половина = правой). */
  vertical: boolean;
  /** Зеркален относительно горизонтальной оси (верх = низ). */
  horizontal: boolean;
}

export interface MosaicAnalysis {
  block: BlockRepeat | null;
  symmetry: Symmetry;
  /** Сколько всего различных пород в рисунке. */
  speciesUsed: number;
}

/** Наименьший период по колонкам, который делит ширину нацело. */
function findColumnPeriod(cells: string[][], rows: number, cols: number): number {
  for (let period = 1; period < cols; period++) {
    if (cols % period !== 0) continue;
    let ok = true;
    for (let r = 0; r < rows && ok; r++) {
      for (let c = period; c < cols; c++) {
        if (cells[r][c] !== cells[r][c % period]) { ok = false; break; }
      }
    }
    if (ok) return period;
  }
  return cols;
}

/** Наименьший период по строкам, который делит высоту нацело. */
function findRowPeriod(cells: string[][], rows: number, cols: number): number {
  for (let period = 1; period < rows; period++) {
    if (rows % period !== 0) continue;
    let ok = true;
    for (let r = period; r < rows && ok; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c] !== cells[r % period][c]) { ok = false; break; }
      }
    }
    if (ok) return period;
  }
  return rows;
}

export function analyseMosaic(mosaic: Mosaic): MosaicAnalysis {
  const { rows, cols } = mosaicSize(mosaic);
  const cells = mosaic.cells;

  if (rows === 0 || cols === 0) {
    return { block: null, symmetry: { vertical: false, horizontal: false }, speciesUsed: 0 };
  }

  const blockCols = findColumnPeriod(cells, rows, cols);
  const blockRows = findRowPeriod(cells, rows, cols);
  const repeatsX = cols / blockCols;
  const repeatsY = rows / blockRows;

  const block: BlockRepeat | null =
    repeatsX * repeatsY > 1
      ? {
          blockRows,
          blockCols,
          repeatsX,
          repeatsY,
          reduction: (rows * cols) / (blockRows * blockCols),
        }
      : null;

  let vertical = true;
  let horizontal = true;
  for (let r = 0; r < rows && (vertical || horizontal); r++) {
    for (let c = 0; c < cols; c++) {
      if (vertical && cells[r][c] !== cells[r][cols - 1 - c]) vertical = false;
      if (horizontal && cells[r][c] !== cells[rows - 1 - r][c]) horizontal = false;
      if (!vertical && !horizontal) break;
    }
  }

  const used = new Set<string>();
  for (const row of cells) for (const cell of row) used.add(cell);

  return { block, symmetry: { vertical, horizontal }, speciesUsed: used.size };
}
