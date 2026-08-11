/**
 * Генераторы рисунков для режима «Мозаика».
 *
 * Все они возвращают сетку пород и ничего не знают про производство: план щитов
 * считает compileMosaic. Симметрия здесь не украшение — зеркальные колонки
 * компилятор кладёт в один щит, поэтому симметричный рисунок дешевле в работе.
 */
import type { Mosaic } from './mosaic';
import { mulberry32 } from './random';
import type { RandomFn } from './random';

export type GeneratorId =
  | 'mandala'
  | 'sierpinski'
  | 'carpet'
  | 'landscape'
  | 'diamond'
  | 'star'
  | 'ripple'
  | 'herringbone';

export interface GeneratorMeta {
  id: GeneratorId;
  name: string;
  tagline: string;
  /** Сколько пород использует осмысленно. */
  minPalette: number;
}

export const GENERATORS: GeneratorMeta[] = [
  { id: 'mandala', name: 'Мандала', tagline: 'Лучи и кольца от центра', minPalette: 3 },
  { id: 'ripple', name: 'Круги на воде', tagline: 'Кольца от центра, мягкий ритм', minPalette: 3 },
  { id: 'star', name: 'Звезда', tagline: 'Острые лучи из центра', minPalette: 3 },
  { id: 'diamond', name: 'Ромбы', tagline: 'Классическая сетка ромбов', minPalette: 2 },
  { id: 'sierpinski', name: 'Треугольник Серпинского', tagline: 'Фрактал на клетках', minPalette: 2 },
  { id: 'carpet', name: 'Ковёр Серпинского', tagline: 'Фрактальные квадраты', minPalette: 2 },
  { id: 'landscape', name: 'Пейзаж', tagline: 'Небо, солнце, горы, вода', minPalette: 4 },
  { id: 'herringbone', name: 'Ёлочка', tagline: 'Диагональный ритм', minPalette: 2 },
];

export interface GeneratorOptions {
  rows: number;
  cols: number;
  cellMm: number;
  /** Породы от светлой к тёмной — генераторы рассчитывают на такой порядок. */
  palette: string[];
  rays?: number;
  rings?: number;
  seed?: number;
}

function pick(palette: string[], index: number): string {
  const size = palette.length;
  if (size === 0) return 'unknown';
  return palette[((index % size) + size) % size];
}

function build(
  options: GeneratorOptions,
  paint: (row: number, col: number, rng: RandomFn) => string
): Mosaic {
  const rng = mulberry32(options.seed ?? 1);
  return {
    cellMm: options.cellMm,
    cells: Array.from({ length: options.rows }, (_, row) =>
      Array.from({ length: options.cols }, (_, col) => paint(row, col, rng))
    ),
  };
}

/** Нормированные координаты от центра: −1…1 по короткой стороне. */
function polar(row: number, col: number, rows: number, cols: number) {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const scale = Math.max(cx, cy) || 1;
  const x = (col - cx) / scale;
  const y = (row - cy) / scale;
  return { x, y, radius: Math.hypot(x, y), angle: Math.atan2(y, x) };
}

function mandala(options: GeneratorOptions): Mosaic {
  const { rows, cols, palette } = options;
  const rays = Math.max(2, options.rays ?? 8);
  const rings = Math.max(2, options.rings ?? 5);

  return build(options, (row, col) => {
    const { radius, angle } = polar(row, col, rows, cols);
    if (radius > 1.04) return pick(palette, 0);
    if (radius < 0.13) return pick(palette, palette.length - 1);

    // Кольца «дышат» по углу — от этого они превращаются в лепестки.
    // Угол отсчитываем от вертикали и берём чётную функцию: тогда рисунок
    // зеркален относительно вертикальной оси, а зеркальные колонки компилятор
    // кладёт в один щит — симметрия здесь экономит реальную склейку.
    const wobble = 1 + 0.26 * Math.cos(rays * (angle - Math.PI / 2));
    const ring = Math.round(radius * wobble * rings);
    // Ходим по палитре туда-обратно: получается градиент от центра к краю
    // без резкого скачка на стыке.
    const period = Math.max(2, palette.length * 2 - 2);
    const phase = ring % period;
    const index = phase < palette.length ? phase : period - phase;
    return pick(palette, palette.length - 1 - index);
  });
}

function ripple(options: GeneratorOptions): Mosaic {
  const { rows, cols, palette } = options;
  const rings = Math.max(2, options.rings ?? 6);
  return build(options, (row, col) => {
    const { radius } = polar(row, col, rows, cols);
    // Туда-обратно по палитре: кольца читаются как расходящиеся волны.
    const period = Math.max(2, palette.length * 2 - 2);
    const phase = Math.round(radius * rings * 2) % period;
    const index = phase < palette.length ? phase : period - phase;
    return pick(palette, palette.length - 1 - index);
  });
}

function star(options: GeneratorOptions): Mosaic {
  const { rows, cols, palette } = options;
  const rays = Math.max(3, options.rays ?? 6);
  return build(options, (row, col) => {
    const { radius, angle } = polar(row, col, rows, cols);
    // Радиус луча колеблется по углу: получается звезда с острыми концами.
    // Отсчёт от вертикали — ради зеркальной симметрии (см. мандалу).
    const petal = 0.35 + 0.65 * Math.abs(Math.cos(rays * (angle - Math.PI / 2) * 0.5));
    if (radius <= petal * 0.45) return pick(palette, palette.length - 1);
    if (radius <= petal) return pick(palette, palette.length - 2);
    return pick(palette, 0);
  });
}

function diamond(options: GeneratorOptions): Mosaic {
  const { rows, cols, palette } = options;
  const size = Math.max(2, Math.round(Math.min(rows, cols) / 4));
  return build(options, (row, col) => {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const distance = Math.abs(col - cx) + Math.abs(row - cy); // манхэттен даёт ромбы
    return pick(palette, Math.floor(distance / size));
  });
}

function sierpinski(options: GeneratorOptions): Mosaic {
  const { palette } = options;
  return build(options, (row, col) => {
    // Треугольник Паскаля по модулю 2 — классический способ получить фрактал.
    return (col & (options.rows - 1 - row)) === 0 ? pick(palette, palette.length - 1) : pick(palette, 0);
  });
}

function carpet(options: GeneratorOptions): Mosaic {
  const { palette } = options;
  const inHole = (x: number, y: number): boolean => {
    let a = x;
    let b = y;
    while (a > 0 || b > 0) {
      if (a % 3 === 1 && b % 3 === 1) return true;
      a = Math.floor(a / 3);
      b = Math.floor(b / 3);
    }
    return false;
  };
  return build(options, (row, col) =>
    inHole(col, row) ? pick(palette, 0) : pick(palette, palette.length - 1)
  );
}

function herringbone(options: GeneratorOptions): Mosaic {
  const { palette } = options;
  const width = Math.max(2, options.rings ?? 3);
  return build(options, (row, col) => pick(palette, Math.floor((col + row) / width)));
}

/**
 * Пейзаж: небо сверху, солнце, два горных хребта и вода снизу.
 * Высоты хребтов — случайное блуждание с фиксированным seed, поэтому
 * один seed всегда даёт один и тот же пейзаж.
 */
function landscape(options: GeneratorOptions): Mosaic {
  const { rows, cols, palette } = options;
  const rng = mulberry32(options.seed ?? 1);

  const sky = pick(palette, 0);
  const sun = pick(palette, 1);
  const farHills = pick(palette, palette.length - 2);
  const nearHills = pick(palette, palette.length - 1);
  const water = pick(palette, 1);

  const waterLine = Math.round(rows * 0.7);

  /**
   * Хребет: сумма трёх синусов со случайными фазами. Чистый случайный шаг давал
   * почти прямую линию — горы не читались.
   */
  const ridge = (base: number, amplitude: number): number[] => {
    const phases = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    const periods = [cols / 1.6, cols / 3.1, cols / 5.7];
    return Array.from({ length: cols }, (_, col) => {
      const wave =
        Math.sin((col / periods[0]) * 6.28 + phases[0]) * 0.6 +
        Math.sin((col / periods[1]) * 6.28 + phases[1]) * 0.3 +
        Math.sin((col / periods[2]) * 6.28 + phases[2]) * 0.1;
      return base - wave * amplitude;
    });
  };

  const far = ridge(rows * 0.44, rows * 0.17);
  const near = ridge(rows * 0.6, rows * 0.1);

  const sunCol = Math.round(cols * 0.72);
  const sunRow = Math.round(rows * 0.18);
  const sunRadius = Math.max(1.6, Math.min(rows, cols) * 0.12);

  return {
    cellMm: options.cellMm,
    cells: Array.from({ length: rows }, (_, row) =>
      Array.from({ length: cols }, (_, col) => {
        if (row >= waterLine) {
          // Вода: полосы ряби и дорожка отражения под солнцем.
          const depth = row - waterLine;
          if (Math.abs(col - sunCol) <= (depth % 3 === 1 ? 1 : 0)) return sun;
          return depth % 2 === 0 ? water : sky;
        }
        if (row >= Math.round(near[col])) return nearHills;
        if (row >= Math.round(far[col])) return farHills;
        if (Math.hypot(col - sunCol, (row - sunRow) * 1.05) <= sunRadius) return sun;
        return sky;
      })
    ),
  };
}

export function generateMosaic(id: GeneratorId, options: GeneratorOptions): Mosaic {
  switch (id) {
    case 'mandala': return mandala(options);
    case 'ripple': return ripple(options);
    case 'star': return star(options);
    case 'diamond': return diamond(options);
    case 'sierpinski': return sierpinski(options);
    case 'carpet': return carpet(options);
    case 'herringbone': return herringbone(options);
    case 'landscape': return landscape(options);
    default: return mandala(options);
  }
}
