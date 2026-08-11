/**
 * Режим «Мозаика» — произвольный рисунок в клетках.
 *
 * Почему нужен второй режим. В режиме одного щита каждая планка — срез одного
 * и того же щита A, поэтому набор брусков в любой планке одинаков: перестановки
 * возможны, произвольная картинка — нет. Мандалу, текст или пейзаж так не набрать.
 *
 * Как это делают в мастерской: клеят НЕСКОЛЬКО щитов с разным порядком брусков,
 * режут каждый на планки и набирают доску из планок разных щитов. Компилятор
 * ниже делает ровно это: находит уникальные колонки рисунка, каждой назначает
 * щит и считает, сколько планок из него нарезать.
 *
 * Оптимизация, которая экономит реальную работу: колонка и её зеркало берутся
 * из одного щита — вторую планку просто кладут другим концом (поворот на 180°).
 */
import type { Allowances, Crosscut, WoodSpecies } from './types';

export interface Mosaic {
  /** Клетки: cells[row][col]. row — поперёк доски, col — вдоль (одна планка). */
  cells: string[][];
  /** Сторона клетки в мм: брусок квадратного сечения cell × cell. */
  cellMm: number;
}

export interface MosaicRecipe {
  units: 'mm' | 'inch';
  species: Record<string, WoodSpecies>;
  mosaic: Mosaic;
  crosscut: Crosscut;
  allowances: Allowances;
}

export interface PanelPlan {
  /** Номер щита, с 1 — как в инструкции. */
  index: number;
  /** Порядок пород в щите, сверху вниз. */
  order: string[];
  /** Сколько планок нарезать из этого щита. */
  slices: number;
  /** Колонки доски, которые он закрывает: позиция и нужен ли переворот. */
  columns: { col: number; flipped: boolean }[];
  /** Черновая длина щита с торцовкой. */
  roughLengthMm: number;
  netWidthMm: number;
}

export interface MosaicPlan {
  valid: boolean;
  issues: string[];
  cols: number;
  rows: number;
  panels: PanelPlan[];
  /** Сколько планок переворачивается на 180° при сборке. */
  flippedSlices: number;
  finalDimensions: { topLengthMm: number; topWidthMm: number; thicknessMm: number };
  materials: {
    speciesId: string;
    speciesName: string;
    pieces: number;
    rawVolumeM3: number;
    netVolumeM3: number;
    netMassKg: number;
    cost: number;
  }[];
  totals: {
    rawVolumeM3: number;
    netVolumeM3: number;
    totalCost: number;
    wastePct: number;
    glueUps: number;
    stripsToPrepare: number;
    crosscuts: number;
  };
  waste: { crosscutKerfM3: number; endTrimM3: number; processingAllowanceM3: number };
}

const MM3_TO_M3 = 1e-9;

export function mosaicSize(mosaic: Mosaic): { rows: number; cols: number } {
  const rows = mosaic.cells.length;
  const cols = rows > 0 ? mosaic.cells[0].length : 0;
  return { rows, cols };
}

export function columnAt(mosaic: Mosaic, col: number): string[] {
  return mosaic.cells.map((row) => row[col]);
}

/** Пустая мозаика заданного размера. */
export function emptyMosaic(rows: number, cols: number, speciesId: string, cellMm: number): Mosaic {
  return {
    cellMm,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => speciesId)),
  };
}

/** Перекрасить одну клетку. */
export function paintCell(mosaic: Mosaic, row: number, col: number, speciesId: string): Mosaic {
  const { rows, cols } = mosaicSize(mosaic);
  if (row < 0 || col < 0 || row >= rows || col >= cols) return mosaic;
  if (mosaic.cells[row][col] === speciesId) return mosaic;
  return {
    ...mosaic,
    cells: mosaic.cells.map((line, r) =>
      r === row ? line.map((cell, c) => (c === col ? speciesId : cell)) : line
    ),
  };
}

/** Подогнать размер, сохранив рисунок. Новые клетки берут породу заполнения. */
export function resizeMosaic(mosaic: Mosaic, rows: number, cols: number, fill: string): Mosaic {
  return {
    ...mosaic,
    cells: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => mosaic.cells[r]?.[c] ?? fill)
    ),
  };
}

function keyOf(column: string[]): string {
  return column.join('|');
}

/**
 * Разложить рисунок на щиты. Колонка и её зеркало кладутся в один щит:
 * планку из него переворачивают на 180°.
 */
export function planPanels(mosaic: Mosaic): { order: string[]; columns: { col: number; flipped: boolean }[] }[] {
  const { cols } = mosaicSize(mosaic);
  const byKey = new Map<string, { order: string[]; columns: { col: number; flipped: boolean }[] }>();

  for (let col = 0; col < cols; col++) {
    const column = columnAt(mosaic, col);
    const direct = keyOf(column);
    const reversed = keyOf([...column].reverse());

    const existing = byKey.get(direct);
    if (existing) {
      existing.columns.push({ col, flipped: false });
      continue;
    }
    const mirror = byKey.get(reversed);
    if (mirror) {
      mirror.columns.push({ col, flipped: true });
      continue;
    }
    byKey.set(direct, { order: column, columns: [{ col, flipped: false }] });
  }

  return [...byKey.values()];
}

export function compileMosaic(recipe: MosaicRecipe): MosaicPlan {
  const issues: string[] = [];
  const { rows, cols } = mosaicSize(recipe.mosaic);
  const cell = recipe.mosaic.cellMm;
  const sliceThickness = recipe.crosscut.sliceThicknessMm;
  const kerf = Math.max(0, recipe.crosscut.sawKerfMm);

  if (rows === 0 || cols === 0) issues.push('Рисунок пустой.');
  if (!(cell > 0)) issues.push('Сторона клетки должна быть больше 0.');
  if (!(sliceThickness > 0)) issues.push('Толщина доски должна быть больше 0.');
  if (recipe.crosscut.bladeAngleDeg !== 90) issues.push('V1 поддерживает только прямой рез 90°.');

  for (const row of recipe.mosaic.cells) {
    for (const speciesId of row) {
      if (!recipe.species[speciesId]) {
        issues.push(`В рисунке есть неизвестная порода: ${speciesId}.`);
        break;
      }
    }
  }

  const groups = planPanels(recipe.mosaic);
  const netWidthMm = rows * cell;
  const roughWidthPerStrip = cell + Math.max(0, recipe.allowances.stripWidthJointMm);
  const roughThickness = cell + Math.max(0, recipe.allowances.thicknessSurfacingMm);
  const endTrim = Math.max(0, recipe.allowances.panelEndTrimMm);

  const panels: PanelPlan[] = groups.map((group, index) => {
    const slices = group.columns.length;
    const usedLength = slices * sliceThickness + Math.max(0, slices - 1) * kerf;
    return {
      index: index + 1,
      order: group.order,
      slices,
      columns: group.columns,
      roughLengthMm: usedLength + endTrim,
      netWidthMm,
    };
  });

  const rawBySpecies = new Map<string, number>();
  const piecesBySpecies = new Map<string, number>();
  const netCellsBySpecies = new Map<string, number>();

  for (const panel of panels) {
    for (const speciesId of panel.order) {
      const volume = panel.roughLengthMm * roughWidthPerStrip * roughThickness * MM3_TO_M3;
      rawBySpecies.set(speciesId, (rawBySpecies.get(speciesId) ?? 0) + volume);
      piecesBySpecies.set(speciesId, (piecesBySpecies.get(speciesId) ?? 0) + 1);
    }
  }

  for (const row of recipe.mosaic.cells) {
    for (const speciesId of row) {
      netCellsBySpecies.set(speciesId, (netCellsBySpecies.get(speciesId) ?? 0) + 1);
    }
  }

  const cellNetVolume = cell * cell * sliceThickness * MM3_TO_M3;

  const materials = [...new Set([...rawBySpecies.keys(), ...netCellsBySpecies.keys()])]
    .map((speciesId) => {
      const species = recipe.species[speciesId];
      const rawVolumeM3 = rawBySpecies.get(speciesId) ?? 0;
      const netVolumeM3 = (netCellsBySpecies.get(speciesId) ?? 0) * cellNetVolume;
      const density = Math.max(0, species?.densityKgM3 ?? 0);
      const price = Math.max(0, species?.pricePerCubicMeter ?? 0);
      return {
        speciesId,
        speciesName: species?.name ?? speciesId,
        pieces: piecesBySpecies.get(speciesId) ?? 0,
        rawVolumeM3,
        netVolumeM3,
        netMassKg: netVolumeM3 * density,
        cost: rawVolumeM3 * price,
      };
    })
    .sort((a, b) => b.rawVolumeM3 - a.rawVolumeM3);

  const totals = materials.reduce(
    (acc, m) => {
      acc.rawVolumeM3 += m.rawVolumeM3;
      acc.netVolumeM3 += m.netVolumeM3;
      acc.totalCost += m.cost;
      return acc;
    },
    { rawVolumeM3: 0, netVolumeM3: 0, totalCost: 0 }
  );

  const crosscuts = panels.reduce((sum, panel) => sum + Math.max(0, panel.slices - 1), 0);
  const crosscutKerfM3 = panels.reduce(
    (sum, panel) => sum + Math.max(0, panel.slices - 1) * kerf * netWidthMm * cell * MM3_TO_M3,
    0
  );
  const endTrimM3 = panels.length * endTrim * netWidthMm * cell * MM3_TO_M3;
  const processingAllowanceM3 = Math.max(
    0,
    totals.rawVolumeM3 - totals.netVolumeM3 - crosscutKerfM3 - endTrimM3
  );

  const wastePct = totals.rawVolumeM3 > 0
    ? ((totals.rawVolumeM3 - totals.netVolumeM3) / totals.rawVolumeM3) * 100
    : 0;

  return {
    valid: issues.length === 0,
    issues,
    cols,
    rows,
    panels,
    flippedSlices: panels.reduce(
      (sum, panel) => sum + panel.columns.filter((column) => column.flipped).length,
      0
    ),
    finalDimensions: {
      topLengthMm: cols * cell,
      topWidthMm: netWidthMm,
      thicknessMm: sliceThickness,
    },
    materials,
    totals: {
      ...totals,
      wastePct,
      glueUps: panels.length,
      stripsToPrepare: panels.length * rows,
      crosscuts,
    },
    waste: { crosscutKerfM3, endTrimM3, processingAllowanceM3 },
  };
}
