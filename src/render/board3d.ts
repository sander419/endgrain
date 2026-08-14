/**
 * Объёмное превью готовой доски. Без three.js: камера ортографическая, поэтому
 * верхняя грань — аффинное преобразование готовой текстуры (те же торцы, что
 * и в плоском виде), а боковины — четыре плоскости с продольным волокном.
 *
 * Почему так, а не WebGL-движок: доска — параллелепипед из клеток. Библиотека
 * добавила бы ~150 КБ gzip к бандлу и второй способ рисовать те же торцы.
 */
import type { Recipe, RecipeProjection } from '../core';
import { applyOilToHex, getSliceStripIndices, mulberry32 } from '../core';
import type { Vec3 } from '../core/view3d';
import {
  boxCorners,
  fitView,
  isFaceVisible,
  planeTransform,
  toScreen,
  type View3d,
} from '../core/view3d';
import { paintEndGrain } from './board';

/** Доска как сетка торцов: колонки идут вдоль длины, ряды — поперёк. */
export interface Grid3d {
  /** Размеры колонок вдоль длины доски, мм. */
  colsMm: number[];
  /**
   * Размеры рядов в конкретной колонке, мм. Массив на колонку, а не общий:
   * после переворота планки бруски разной ширины ложатся в другом порядке,
   * и границы рядов у соседних колонок не совпадают.
   */
  rowsMmAt: (col: number) => number[];
  /** Цвет торца клетки, уже с маслом. */
  colorAt: (col: number, row: number) => string;
}

export interface Scene3dOptions {
  grid: Grid3d;
  thicknessMm: number;
  /** Поворот вокруг вертикали, радианы. */
  yaw: number;
  /** Подъём камеры, радианы. π/2 — строго сверху. */
  pitch: number;
  background?: string;
  /**
   * Ключ кеша текстуры верхней грани. Пока он не меняется, при вращении
   * текстура не перерисовывается — иначе мандала 21×21 съедает кадр.
   */
  textureKey: string;
}

const BG = '#14100d';
const TEXTURE_MAX_PX = 1400;

let cache: { key: string; canvas: HTMLCanvasElement } | null = null;

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Затемнение боковых граней: свет сверху-слева, как на фотографии доски. */
function shade(hex: string, factor: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const channel = (offset: number) => {
    const raw = parseInt(value.slice(offset, offset + 2), 16);
    return Math.max(0, Math.min(255, Math.round(raw * factor)));
  };
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}

/** Верхняя грань один раз рисуется в плоскую текстуру, дальше только кладётся под углом. */
function topTexture(grid: Grid3d, key: string): HTMLCanvasElement | null {
  if (cache && cache.key === key) return cache.canvas;

  const lengthMm = sum(grid.colsMm);
  const widthMm = sum(grid.rowsMmAt(0));
  if (lengthMm <= 0 || widthMm <= 0) return null;

  const pxPerMm = TEXTURE_MAX_PX / Math.max(lengthMm, widthMm);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(lengthMm * pxPerMm));
  canvas.height = Math.max(2, Math.round(widthMm * pxPerMm));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let x = 0;
  grid.colsMm.forEach((colMm, col) => {
    let y = 0;
    grid.rowsMmAt(col).forEach((rowMm, row) => {
      const w = colMm * pxPerMm;
      const h = rowMm * pxPerMm;
      paintEndGrain(ctx, x, y, w, h, grid.colorAt(col, row), col * 7919 + row * 131);
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(x, y, w, h);
      y += h;
    });
    x += colMm * pxPerMm;
  });

  cache = { key, canvas };
  return canvas;
}

function fillQuad(ctx: CanvasRenderingContext2D, points: Vec3[], view: View3d, style: string) {
  const screen = points.map((point) => toScreen(point, view));
  ctx.beginPath();
  ctx.moveTo(screen[0].x, screen[0].y);
  for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i].x, screen[i].y);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

/**
 * Боковина: полосы по клеткам края. На торцевой доске волокно на боку идёт
 * по толщине, поэтому штрихи вертикальные, а не вдоль длины.
 */
function drawSideFace(
  ctx: CanvasRenderingContext2D,
  view: View3d,
  bands: number[],
  colorOf: (index: number) => string,
  /** Точка мира на нижней кромке грани для координаты вдоль неё. */
  pointAt: (along: number, z: number) => Vec3,
  thicknessMm: number,
  factor: number
) {
  let cursor = 0;
  bands.forEach((bandMm, index) => {
    const from = cursor;
    const to = cursor + bandMm;
    cursor = to;

    const quad = [
      pointAt(from, 0),
      pointAt(to, 0),
      pointAt(to, thicknessMm),
      pointAt(from, thicknessMm),
    ];
    fillQuad(ctx, quad, view, shade(colorOf(index), factor));

    // Волокно и клеевой шов.
    const rng = mulberry32(index * 2654435761 + Math.round(bandMm));
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 0.8;
    const lines = Math.max(1, Math.round(bandMm / 6));
    for (let i = 0; i < lines; i++) {
      const along = from + bandMm * (0.1 + rng() * 0.8);
      const a = toScreen(pointAt(along, thicknessMm * 0.04), view);
      const b = toScreen(pointAt(along, thicknessMm * 0.96), view);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.9;
    const edgeBottom = toScreen(pointAt(to, 0), view);
    const edgeTop = toScreen(pointAt(to, thicknessMm), view);
    ctx.beginPath();
    ctx.moveTo(edgeBottom.x, edgeBottom.y);
    ctx.lineTo(edgeTop.x, edgeTop.y);
    ctx.stroke();
  });
}

export function renderBoard3d(ctx: CanvasRenderingContext2D, options: Scene3dOptions) {
  const { grid, thicknessMm, yaw, pitch } = options;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = options.background ?? BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const lengthMm = sum(grid.colsMm);
  const cols = grid.colsMm.length;
  const firstRows = cols > 0 ? grid.rowsMmAt(0) : [];
  const lastRows = cols > 0 ? grid.rowsMmAt(cols - 1) : [];
  const widthMm = sum(firstRows);
  if (lengthMm <= 0 || widthMm <= 0 || thicknessMm <= 0 || firstRows.length === 0 || cols === 0) return;

  const view = fitView(
    boxCorners(lengthMm, widthMm, thicknessMm),
    ctx.canvas.width,
    ctx.canvas.height,
    46,
    yaw,
    pitch
  );

  // Тень под доской: та же нижняя грань, сдвинутая и размытая.
  ctx.save();
  if ('filter' in ctx) {
    try {
      ctx.filter = `blur(${Math.max(4, ctx.canvas.width * 0.012)}px)`;
    } catch {
      /* без размытия тень просто резче */
    }
  }
  ctx.translate(0, Math.max(6, ctx.canvas.height * 0.02));
  fillQuad(
    ctx,
    [
      { x: 0, y: 0, z: 0 },
      { x: lengthMm, y: 0, z: 0 },
      { x: lengthMm, y: widthMm, z: 0 },
      { x: 0, y: widthMm, z: 0 },
    ],
    view,
    'rgba(0,0,0,0.45)'
  );
  ctx.restore();

  // Боковины: рисуем только обращённые к камере — коробка выпуклая,
  // видимые грани не перекрывают друг друга, порядок не важен.
  const faces: {
    normal: Vec3;
    bands: number[];
    colorOf: (index: number) => string;
    pointAt: (along: number, z: number) => Vec3;
    factor: number;
  }[] = [
    {
      normal: { x: 0, y: -1, z: 0 },
      bands: grid.colsMm,
      colorOf: (col) => grid.colorAt(col, 0),
      pointAt: (along, z) => ({ x: along, y: 0, z }),
      factor: 0.74,
    },
    {
      normal: { x: 0, y: 1, z: 0 },
      bands: grid.colsMm,
      colorOf: (col) => grid.colorAt(col, grid.rowsMmAt(col).length - 1),
      pointAt: (along, z) => ({ x: along, y: widthMm, z }),
      factor: 0.74,
    },
    {
      normal: { x: -1, y: 0, z: 0 },
      bands: firstRows,
      colorOf: (row) => grid.colorAt(0, row),
      pointAt: (along, z) => ({ x: 0, y: along, z }),
      factor: 0.58,
    },
    {
      normal: { x: 1, y: 0, z: 0 },
      bands: lastRows,
      colorOf: (row) => grid.colorAt(cols - 1, row),
      pointAt: (along, z) => ({ x: lengthMm, y: along, z }),
      factor: 0.58,
    },
  ];

  for (const face of faces) {
    if (!isFaceVisible(face.normal, yaw, pitch)) continue;
    drawSideFace(ctx, view, face.bands, face.colorOf, face.pointAt, thicknessMm, face.factor);
  }

  // Верхняя грань — готовая текстура, положенная аффинно.
  const texture = topTexture(grid, options.textureKey);
  if (texture && isFaceVisible({ x: 0, y: 0, z: 1 }, yaw, pitch)) {
    const matrix = planeTransform(
      texture.width,
      texture.height,
      lengthMm,
      widthMm,
      thicknessMm,
      view
    );
    ctx.save();
    ctx.setTransform(...matrix);
    ctx.drawImage(texture, 0, 0);
    ctx.restore();
  }

  // Контур верхней грани: без него доска на тёмном фоне теряет край.
  const outline = [
    { x: 0, y: 0, z: thicknessMm },
    { x: lengthMm, y: 0, z: thicknessMm },
    { x: lengthMm, y: widthMm, z: thicknessMm },
    { x: 0, y: widthMm, z: thicknessMm },
  ].map((point) => toScreen(point, view));
  ctx.beginPath();
  ctx.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/**
 * Подпись сетки для кеша текстуры. Считать её надо там же, где строится сетка
 * (один раз на изменение рисунка), а не в каждом кадре вращения.
 */
export function gridKey(grid: Grid3d): string {
  const parts: string[] = [];
  grid.colsMm.forEach((colMm, col) => {
    parts.push(colMm.toFixed(2));
    grid.rowsMmAt(col).forEach((rowMm, row) => {
      parts.push(`${rowMm.toFixed(2)}${grid.colorAt(col, row)}`);
    });
  });
  return parts.join('|');
}

/**
 * Сетка торцов режима «Рецепт». Колонка — планка: вдоль длины доски она занимает
 * толщину бруска щита, а не толщину среза (планку кладут набок).
 */
export function gridFromRecipe(recipe: Recipe, projection: RecipeProjection, oil: number): Grid3d {
  const matrix = getSliceStripIndices(recipe, projection.sliceCount);
  const colorOfStrip = (stripIndex: number | undefined) => {
    const strip = stripIndex === undefined ? undefined : recipe.panel.strips[stripIndex];
    const hex = strip ? recipe.species[strip.speciesId]?.colorHex ?? '#888888' : '#888888';
    return applyOilToHex(hex, oil);
  };
  return {
    colsMm: matrix.map(() => recipe.panel.stripThicknessMm),
    rowsMmAt: (col) =>
      (matrix[col] ?? []).map((stripIndex) => recipe.panel.strips[stripIndex]?.widthMm ?? 0),
    colorAt: (col, row) => colorOfStrip(matrix[col]?.[row]),
  };
}

/** Сетка торцов из мозаики: клетка квадратная, cells[row][col]. */
export function gridFromMosaic(
  cells: string[][],
  cellMm: number,
  colorHexOf: (speciesId: string) => string,
  oil: number
): Grid3d {
  const rows = cells.length;
  const cols = rows > 0 ? cells[0].length : 0;
  const rowSizes = Array.from({ length: rows }, () => cellMm);
  return {
    colsMm: Array.from({ length: cols }, () => cellMm),
    rowsMmAt: () => rowSizes,
    colorAt: (col, row) => applyOilToHex(colorHexOf(cells[row]?.[col] ?? ''), oil),
  };
}
