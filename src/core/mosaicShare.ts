/**
 * Board DNA для мозаики. Не переиспользует формат Recipe-рецепта: там в ссылку
 * едут объекты пород, здесь клеток на порядок больше (до 60×60), поэтому каждая
 * клетка кодируется одним base36-символом — индексом в маленькой палитре, а не
 * строкой id. Иначе 21×21 рисунок раздувает ссылку до нескольких килобайт.
 */
import type { Mosaic } from './mosaic';
import { mosaicSize } from './mosaic';
import { toBase64Url, fromBase64Url } from './share';
import { sanitizeMosaicSize, sanitizeText } from './sanitize';

export interface MosaicDna {
  v: 1;
  rows: number;
  cols: number;
  cellMm: number;
  /** Породы, встретившиеся в рисунке — индекс в этом массиве кодирует клетку. */
  palette: string[];
  /** rows×cols символов base36 подряд, без разделителей. */
  grid: string;
}

export function encodeMosaicDna(mosaic: Mosaic): MosaicDna {
  const { rows, cols } = mosaicSize(mosaic);
  const palette: string[] = [];
  const indexOf = new Map<string, number>();

  let grid = '';
  for (const row of mosaic.cells) {
    for (const speciesId of row) {
      let index = indexOf.get(speciesId);
      if (index === undefined) {
        index = palette.length;
        palette.push(speciesId);
        indexOf.set(speciesId, index);
      }
      grid += index.toString(36);
    }
  }

  return { v: 1, rows, cols, cellMm: mosaic.cellMm, palette, grid };
}

export function decodeMosaicDna(dna: MosaicDna): Mosaic | null {
  const { palette, grid } = dna;
  // Размеры из чужой ссылки зажимаем: сетка 100000×100000 вешает вкладку
  // ещё до того, как компилятор щитов успеет что-то сказать.
  const { rows, cols, cellMm } = sanitizeMosaicSize(dna.rows, dna.cols, dna.cellMm);
  if (!(rows > 0) || !(cols > 0) || !Array.isArray(palette) || palette.length === 0) return null;
  if (typeof grid !== 'string' || grid.length !== rows * cols) return null;

  // Клетка хранит id породы, а не цвет: неизвестный id просто не найдётся
  // в каталоге. Длину всё же ограничиваем — она уходит в ключи и в подписи.
  const safePalette = palette.map((id) => sanitizeText(id, 40) || 'maple');

  const cells: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      const index = parseInt(grid[r * cols + c], 36);
      row.push(safePalette[index] ?? safePalette[0]);
    }
    cells.push(row);
  }
  return { cellMm, cells };
}

export function buildMosaicShareUrl(mosaic: Mosaic): string {
  if (typeof window === 'undefined') return '';
  const code = toBase64Url(JSON.stringify(encodeMosaicDna(mosaic)));
  // ?mode=mosaic обязателен: режим выбирается по localStorage/query ДО того,
  // как что-либо читает hash. У человека, который открывает ссылку впервые,
  // localStorage пуст, страница поднимается в режиме «Рецепт», компонент
  // мозаики не монтируется — и #mdna из хэша некому прочитать.
  return `${window.location.origin}${window.location.pathname}?mode=mosaic#mdna=${code}`;
}

export function readMosaicDnaFromLocation(): Mosaic | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(/mdna=([^&]+)/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(match[1]));
    if (!parsed || parsed.v !== 1) return null;
    return decodeMosaicDna(parsed as MosaicDna);
  } catch {
    return null;
  }
}
