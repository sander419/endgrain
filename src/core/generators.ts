/**
 * Генераторы рисунков для режима «Мозаика».
 *
 * Три правила, на которых стоит этот модуль:
 *
 * 1. Каждый стиль объявляет свои ручки (`controls`). UI показывает только их —
 *    иначе получаются мёртвые ползунки, которые крутишь, а картинка не меняется.
 * 2. `seed` работает у КАЖДОГО стиля и даёт вариацию внутри стиля, а не хаос:
 *    сдвиг фазы, поворот, смещение начала — рисунок остаётся узнаваемым.
 * 3. Симметрия не украшение: зеркальные колонки компилятор кладёт в один щит,
 *    поэтому симметричный рисунок дешевле в работе.
 */
import type { Mosaic } from './mosaic';
import { mulberry32 } from './random';

export type GeneratorId =
  | 'checker'
  | 'pinwheel'
  | 'basketweave'
  | 'herringbone'
  | 'tumbling'
  | 'diamond'
  | 'wave'
  | 'plaid'
  | 'spiral'
  | 'mandala'
  | 'star'
  | 'ripple'
  | 'maze'
  | 'sierpinski'
  | 'carpet'
  | 'landscape';

/** Семейства — по ним стили сгруппированы во вкладке «Стиль». */
export type GeneratorFamily = 'joinery' | 'geometry' | 'radial' | 'generative';

export const FAMILY_NAMES: Record<GeneratorFamily, string> = {
  joinery: 'Столярная классика',
  geometry: 'Геометрия',
  radial: 'От центра',
  generative: 'Генеративные',
};

export type ControlKey = 'scale' | 'rays' | 'rings';

export interface ControlMeta {
  key: ControlKey;
  label: string;
  min: number;
  max: number;
  hint?: string;
}

export interface GeneratorMeta {
  id: GeneratorId;
  family: GeneratorFamily;
  name: string;
  tagline: string;
  /** Меньше этого числа пород стиль теряет смысл — UI предупреждает. */
  minPalette: number;
  /** Ручки, которые реально влияют на этот стиль. Остальные UI не показывает. */
  controls: ControlMeta[];
  /** Даёт ли seed вариации. У честных фракталов — нет, и это видно в UI. */
  seeded: boolean;
}

const SCALE: ControlMeta = { key: 'scale', label: 'Размер мотива', min: 1, max: 8, hint: 'в клетках' };
const RAYS: ControlMeta = { key: 'rays', label: 'Лучей', min: 2, max: 16 };
const RINGS: ControlMeta = { key: 'rings', label: 'Колец', min: 2, max: 14 };

export const GENERATORS: GeneratorMeta[] = [
  // ── Столярная классика: узоры, которые реально режут из дерева ────────
  {
    id: 'checker', family: 'joinery', name: 'Шахматка', minPalette: 2, seeded: true,
    tagline: 'Основа основ: две породы через одну',
    controls: [SCALE],
  },
  {
    id: 'pinwheel', family: 'joinery', name: 'Вертушка', minPalette: 3, seeded: true,
    tagline: 'Четыре бруска вокруг центра, узор крутится',
    controls: [SCALE],
  },
  {
    id: 'basketweave', family: 'joinery', name: 'Плетёнка', minPalette: 2, seeded: true,
    tagline: 'Дощечки лежат поперёк друг друга',
    controls: [SCALE],
  },
  {
    id: 'herringbone', family: 'joinery', name: 'Ёлочка', minPalette: 2, seeded: true,
    tagline: 'Диагональный ритм паркета',
    controls: [SCALE],
  },
  {
    id: 'tumbling', family: 'joinery', name: 'Рельеф', minPalette: 3, seeded: true,
    tagline: 'Кладка с подсветкой грани — доска выглядит объёмной',
    controls: [SCALE],
  },
  {
    id: 'plaid', family: 'joinery', name: 'Шотландка', minPalette: 3, seeded: true,
    tagline: 'Полосы разной ширины крест-накрест',
    controls: [SCALE],
  },

  // ── Геометрия ─────────────────────────────────────────────────────────
  {
    id: 'diamond', family: 'geometry', name: 'Ромбы', minPalette: 2, seeded: true,
    tagline: 'Сетка ромбов от центра',
    controls: [SCALE],
  },
  {
    id: 'wave', family: 'geometry', name: 'Волна', minPalette: 3, seeded: true,
    tagline: 'Полосы гуляют синусоидой',
    controls: [RAYS, RINGS],
  },
  {
    id: 'maze', family: 'geometry', name: 'Лабиринт', minPalette: 2, seeded: true,
    tagline: 'Настоящий проходимый лабиринт',
    controls: [],
  },

  // ── От центра ─────────────────────────────────────────────────────────
  {
    id: 'mandala', family: 'radial', name: 'Мандала', minPalette: 3, seeded: true,
    tagline: 'Лепестки и кольца',
    controls: [RAYS, RINGS],
  },
  {
    id: 'star', family: 'radial', name: 'Звезда', minPalette: 3, seeded: true,
    tagline: 'Острые лучи из центра',
    controls: [RAYS],
  },
  {
    id: 'ripple', family: 'radial', name: 'Круги на воде', minPalette: 3, seeded: true,
    tagline: 'Кольца расходятся от точки',
    controls: [RINGS],
  },
  {
    id: 'spiral', family: 'radial', name: 'Спираль', minPalette: 3, seeded: true,
    tagline: 'Рукава закручиваются к центру',
    controls: [RAYS, RINGS],
  },

  // ── Генеративные и картины ────────────────────────────────────────────
  {
    id: 'sierpinski', family: 'generative', name: 'Треугольник Серпинского', minPalette: 2, seeded: false,
    tagline: 'Фрактал: рисунок задан математикой, вариаций нет',
    controls: [],
  },
  {
    id: 'carpet', family: 'generative', name: 'Ковёр Серпинского', minPalette: 2, seeded: false,
    tagline: 'Фрактал из квадратов, вариаций нет',
    controls: [],
  },
  {
    id: 'landscape', family: 'generative', name: 'Пейзаж', minPalette: 4, seeded: true,
    tagline: 'Небо, солнце, горы, вода',
    controls: [],
  },
];

export const GENERATOR_BY_ID: Record<GeneratorId, GeneratorMeta> = Object.fromEntries(
  GENERATORS.map((meta) => [meta.id, meta])
) as Record<GeneratorId, GeneratorMeta>;

export interface GeneratorOptions {
  rows: number;
  cols: number;
  cellMm: number;
  /** Породы от светлой к тёмной — генераторы рассчитывают на такой порядок. */
  palette: string[];
  scale?: number;
  rays?: number;
  rings?: number;
  seed?: number;
}

// ── Мелкая утилита ───────────────────────────────────────────────────────

function pick(palette: string[], index: number): string {
  const size = palette.length;
  if (size === 0) return 'unknown';
  return palette[((index % size) + size) % size];
}

/** Ходим по палитре туда-обратно: край палитры не даёт резкого скачка. */
function pingPong(palette: string[], step: number): string {
  const size = palette.length;
  if (size <= 1) return pick(palette, 0);
  const period = size * 2 - 2;
  const phase = ((step % period) + period) % period;
  return palette[phase < size ? phase : period - phase];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Вариация внутри стиля. seed не разносит рисунок в хаос, а двигает то, что
 * у стиля можно двигать: начало отсчёта, поворот, лёгкий сдвиг масштаба.
 * Один seed — один и тот же результат.
 */
interface Variant {
  offsetX: number;
  offsetY: number;
  /** 0..3 — поворот мотива на 90°. */
  turn: number;
  /** −1, 0 или +1 к размеру мотива. */
  scaleShift: number;
  /** Сдвиг по палитре. */
  paletteShift: number;
  flip: boolean;
  rng: () => number;
}

function variantOf(seed: number | undefined): Variant {
  const rng = mulberry32((seed ?? 1) >>> 0);
  return {
    offsetX: Math.floor(rng() * 8),
    offsetY: Math.floor(rng() * 8),
    turn: Math.floor(rng() * 4),
    scaleShift: Math.floor(rng() * 3) - 1,
    paletteShift: Math.floor(rng() * 4),
    flip: rng() > 0.5,
    rng,
  };
}

function build(
  options: GeneratorOptions,
  paint: (row: number, col: number) => string
): Mosaic {
  return {
    cellMm: options.cellMm,
    cells: Array.from({ length: options.rows }, (_, row) =>
      Array.from({ length: options.cols }, (_, col) => paint(row, col))
    ),
  };
}

/** Нормированные координаты от центра: −1…1 по длинной стороне. */
function polar(row: number, col: number, rows: number, cols: number) {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const scale = Math.max(cx, cy) || 1;
  const x = (col - cx) / scale;
  const y = (row - cy) / scale;
  return { x, y, radius: Math.hypot(x, y), angle: Math.atan2(y, x) };
}

function motifSize(options: GeneratorOptions, variant: Variant, fallback: number): number {
  const base = options.scale ?? fallback;
  return clamp(base + variant.scaleShift, 1, 12);
}

// ── Столярная классика ───────────────────────────────────────────────────

function checker(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const s = motifSize(options, v, 1);
  const { palette } = options;
  return build(options, (row, col) => {
    const x = Math.floor((col + v.offsetX) / s);
    const y = Math.floor((row + v.offsetY) / s);
    return pick(palette, (x + y + v.paletteShift) % palette.length);
  });
}

/**
 * Вертушка: блок 2s×2s собран из четырёх прямоугольников s×2s, каждый
 * следующий повёрнут на 90°. Классический торцевой узор.
 */
function pinwheel(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const s = motifSize(options, v, 2);
  const { palette } = options;
  const block = s * 2;
  return build(options, (row, col) => {
    const x = ((col + v.offsetX) % block + block) % block;
    const y = ((row + v.offsetY) % block + block) % block;
    // Четыре лопасти вокруг центра блока.
    let blade: number;
    if (y < s && x < block - s) blade = 0;
    else if (x >= block - s && y < block - s) blade = 1;
    else if (y >= block - s && x >= s) blade = 2;
    else blade = 3;
    const turned = v.flip ? 3 - blade : blade;
    return pick(palette, turned + v.paletteShift);
  });
}

/** Плетёнка: дощечки s×(s*2), уложенные поперёк друг друга. */
function basketweave(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const s = motifSize(options, v, 2);
  const { palette } = options;
  const block = s * 2;
  return build(options, (row, col) => {
    const x = ((col + v.offsetX) % block + block) % block;
    const y = ((row + v.offsetY) % block + block) % block;
    const horizontal = (x < s) === (y < s);
    // Внутри дощечки чередуем «планки», чтобы плетение читалось.
    const stripe = horizontal ? y % s : x % s;
    return pick(palette, (horizontal ? 0 : 1) + (stripe % 2) * 2 + v.paletteShift);
  });
}

/** Ёлочка: диагональные полосы, ломающиеся через каждые s клеток. */
function herringbone(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const s = motifSize(options, v, 3);
  const { palette } = options;
  return build(options, (row, col) => {
    const x = col + v.offsetX;
    const y = row + v.offsetY;
    const band = Math.floor(y / s);
    // Каждая следующая полоса наклонена в другую сторону — это и есть ёлочка.
    const diagonal = band % 2 === 0 ? x + y : x - y;
    return pingPong(palette, Math.floor(diagonal / s) + v.paletteShift);
  });
}

/**
 * Кубики: рельефная кладка. Настоящая изометрия требует ромбов, а на квадратной
 * сетке из брусков ромба не выложить — вместо неё берём приём фаски: у каждого
 * блока подсвечена верхняя грань и затенена боковая, и доска читается объёмной.
 * Ряды сдвинуты на полблока, как кирпичная кладка.
 */
function tumbling(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const s = Math.max(2, motifSize(options, v, 3));
  const { palette } = options;
  const top = pick(palette, 0);
  const side = pick(palette, Math.max(1, palette.length - 2));
  const body = pick(palette, palette.length - 1);
  const half = Math.floor(s / 2);

  return build(options, (row, col) => {
    const y = row + v.offsetY;
    const band = Math.floor(y / s);
    // Каждый второй ряд смещён — кладка, а не сетка.
    const x = col + v.offsetX + (band % 2 === 0 ? 0 : half);
    const localY = ((y % s) + s) % s;
    const localX = ((x % s) + s) % s;

    if (localY === 0) return top;
    if (localX === 0) return v.flip ? body : side;
    if (localX === s - 1 && s > 2) return v.flip ? side : body;
    return body;
  });
}

/** Шотландка: полосы разной ширины по обеим осям, на пересечении — темнее. */
function plaid(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const s = motifSize(options, v, 3);
  const { palette } = options;

  // Ширины полос выбираются по seed один раз и повторяются периодически.
  const widths = Array.from({ length: 6 }, () => 1 + Math.floor(v.rng() * s));
  const stripeIndex = (position: number): number => {
    let acc = 0;
    for (let i = 0; i < 512; i++) {
      acc += widths[i % widths.length];
      if (position < acc) return i;
    }
    return 0;
  };

  const period = widths.reduce((sum, w) => sum + w, 0) * widths.length;

  return build(options, (row, col) => {
    const x = ((col + v.offsetX) % period + period) % period;
    const y = ((row + v.offsetY) % period + period) % period;
    const a = stripeIndex(x) % 2;
    const b = stripeIndex(y) % 2;
    // Пересечение тёмных полос — самая тёмная порода, как в настоящей клетке.
    const level = a + b;
    return pick(palette, level === 2 ? palette.length - 1 : level === 1 ? Math.max(1, palette.length - 2) : 0);
  });
}

// ── Геометрия ────────────────────────────────────────────────────────────

function diamond(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const s = motifSize(options, v, 3);
  const { rows, cols, palette } = options;
  return build(options, (row, col) => {
    const cx = (cols - 1) / 2 + (v.offsetX % 3) - 1;
    const cy = (rows - 1) / 2 + (v.offsetY % 3) - 1;
    const distance = Math.abs(col - cx) + Math.abs(row - cy);
    return pingPong(palette, Math.floor(distance / s) + v.paletteShift);
  });
}

function wave(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const { rows, cols, palette } = options;
  const frequency = clamp(options.rays ?? 4, 1, 16);
  const bands = clamp(options.rings ?? 5, 2, 14);
  const phase = v.offsetX * 0.7;
  const vertical = v.flip;
  return build(options, (row, col) => {
    const along = vertical ? row / Math.max(1, rows) : col / Math.max(1, cols);
    const across = vertical ? col : row;
    const shift = Math.sin(along * Math.PI * 2 * frequency + phase) * bands * 0.5;
    return pingPong(palette, Math.round((across + shift) / 2) + v.paletteShift);
  });
}

/**
 * Лабиринт: честный проходимый лабиринт (рекурсивный обход), а не случайный
 * шум. Здесь seed меняет рисунок радикально — в этом и смысл стиля.
 */
function maze(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const { rows, cols, palette } = options;
  const wall = pick(palette, palette.length - 1);
  const path = pick(palette, 0);

  const gridRows = Math.max(1, Math.floor((rows - 1) / 2));
  const gridCols = Math.max(1, Math.floor((cols - 1) / 2));
  const visited = Array.from({ length: gridRows }, () => new Array(gridCols).fill(false));
  const cells = Array.from({ length: rows }, () => new Array(cols).fill(wall));

  const carve = (r: number, c: number) => {
    visited[r][c] = true;
    cells[r * 2 + 1] && (cells[r * 2 + 1][c * 2 + 1] = path);

    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    // Тасуем направления по seed — от этого зависит форма лабиринта.
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(v.rng() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= gridRows || nc >= gridCols || visited[nr][nc]) continue;
      const wallRow = r * 2 + 1 + dr;
      const wallCol = c * 2 + 1 + dc;
      if (cells[wallRow]) cells[wallRow][wallCol] = path;
      carve(nr, nc);
    }
  };

  carve(Math.floor(v.rng() * gridRows), Math.floor(v.rng() * gridCols));
  return { cellMm: options.cellMm, cells };
}

// ── От центра ────────────────────────────────────────────────────────────

function mandala(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const { rows, cols, palette } = options;
  const rays = clamp(options.rays ?? 8, 2, 16);
  const rings = clamp(options.rings ?? 5, 2, 14);
  /**
   * Вариации подобраны так, чтобы НЕ сломать зеркальную симметрию: произвольный
   * поворот лепестков её убивает, а вместе с ней и экономию щитов (зеркальные
   * колонки перестают совпадать). Поэтому крутим только то, что симметрично:
   * фазу колец, глубину лепестка и инверсию «лепесток ↔ впадина» (сдвиг на π —
   * единственный поворот, сохраняющий чётность косинуса).
   */
  const ringPhase = v.offsetY / 8;
  const depth = 0.18 + (v.offsetX % 4) * 0.06;
  const invert = v.flip ? -1 : 1;

  return build(options, (row, col) => {
    const { radius, angle } = polar(row, col, rows, cols);
    if (radius > 1.04) return pick(palette, 0);
    if (radius < 0.13) return pick(palette, palette.length - 1);

    // Кольца «дышат» по углу — от этого они превращаются в лепестки.
    // Угол отсчитываем от вертикали и берём чётную функцию: тогда рисунок
    // зеркален относительно вертикальной оси, а зеркальные колонки компилятор
    // кладёт в один щит — симметрия здесь экономит реальную склейку.
    const wobble = 1 + invert * depth * Math.cos(rays * (angle - Math.PI / 2));
    const ring = Math.round((radius * wobble + ringPhase) * rings);
    return pingPong(palette, palette.length - 1 - ring);
  });
}

function star(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const { rows, cols, palette } = options;
  const rays = clamp(options.rays ?? 6, 3, 16);
  const sharpness = 0.3 + (v.offsetX % 4) * 0.12;

  return build(options, (row, col) => {
    const { radius, angle } = polar(row, col, rows, cols);
    // Радиус луча колеблется по углу: получается звезда с острыми концами.
    // Отсчёт от вертикали — ради зеркальной симметрии (см. мандалу).
    const petal = sharpness + (1 - sharpness) * Math.abs(Math.cos(rays * (angle - Math.PI / 2) * 0.5));
    if (radius <= petal * 0.45) return pick(palette, palette.length - 1);
    if (radius <= petal) return pick(palette, Math.max(1, palette.length - 2));
    return pick(palette, 0);
  });
}

function ripple(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const { rows, cols, palette } = options;
  const rings = clamp(options.rings ?? 6, 2, 14);
  // Центр волн смещается по seed — рисунок каждый раз новый, стиль тот же.
  const shiftX = ((v.offsetX % 5) - 2) * 0.18;
  const shiftY = ((v.offsetY % 5) - 2) * 0.18;

  return build(options, (row, col) => {
    const { x, y } = polar(row, col, rows, cols);
    const radius = Math.hypot(x - shiftX, y - shiftY);
    return pingPong(palette, palette.length - 1 - Math.round(radius * rings * 2));
  });
}

function spiral(options: GeneratorOptions): Mosaic {
  const v = variantOf(options.seed);
  const { rows, cols, palette } = options;
  const arms = clamp(options.rays ?? 3, 1, 12);
  const turns = clamp(options.rings ?? 4, 1, 14);
  const direction = v.flip ? -1 : 1;

  return build(options, (row, col) => {
    const { radius, angle } = polar(row, col, rows, cols);
    const twist = (angle / (Math.PI * 2)) * arms + direction * radius * turns;
    return pingPong(palette, Math.round(twist) + v.paletteShift);
  });
}

// ── Генеративные и картины ───────────────────────────────────────────────

function sierpinski(options: GeneratorOptions): Mosaic {
  const { palette, rows } = options;
  return build(options, (row, col) =>
    // Треугольник Паскаля по модулю 2 — классический способ получить фрактал.
    (col & (rows - 1 - row)) === 0 ? pick(palette, palette.length - 1) : pick(palette, 0)
  );
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

/**
 * Пейзаж: небо сверху, солнце, два горных хребта и вода снизу.
 * Высоты хребтов — сумма синусов со случайными фазами, поэтому
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

  const sunCol = Math.round(cols * (0.2 + rng() * 0.6));
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

const IMPLEMENTATIONS: Record<GeneratorId, (options: GeneratorOptions) => Mosaic> = {
  checker, pinwheel, basketweave, herringbone, tumbling, plaid,
  diamond, wave, maze,
  mandala, star, ripple, spiral,
  sierpinski, carpet, landscape,
};

export function generateMosaic(id: GeneratorId, options: GeneratorOptions): Mosaic {
  // Защита от дурака: сетка и палитра приводятся к рабочему диапазону здесь,
  // чтобы ни один генератор не пришлось страховать по отдельности.
  const safe: GeneratorOptions = {
    ...options,
    rows: clamp(Math.round(options.rows) || 1, 1, 120),
    cols: clamp(Math.round(options.cols) || 1, 1, 120),
    palette: options.palette.length > 0 ? options.palette : ['maple'],
  };
  const implementation = IMPLEMENTATIONS[id] ?? mandala;
  return implementation(safe);
}
