import type { Recipe, RecipeProjection, ProcessStep } from '../core';
import { applyOilToHex, getSliceStripIndices, mulberry32 } from '../core';

export interface RenderOptions {
  step: ProcessStep;
  oil: number;
  /** 0 — детали сомкнуты, 1 — разнесены (анимация сборки). */
  explode: number;
  /** Фон сцены. Для печати передаём белый. */
  background?: string;
  /** Планка, выбранная для ручной правки. */
  selectedSlice?: number | null;
}

export interface SliceRect {
  sliceIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const BG = '#14100d';

function fit(ctx: CanvasRenderingContext2D, contentW: number, contentH: number, pad: number): Viewport {
  const { width, height } = ctx.canvas;
  const availW = width - pad * 2;
  const availH = height - pad * 2;
  const scale = Math.min(availW / contentW, availH / contentH);
  return {
    scale,
    offsetX: (width - contentW * scale) / 2,
    offsetY: (height - contentH * scale) / 2,
  };
}

/** Торцевая текстура: годичные кольца видны срезом, поэтому дуги, а не полосы. */
function paintEndGrain(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  baseColor: string, cellSeed: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);

  const rng = mulberry32(cellSeed);
  const cx = x + w * (0.2 + rng() * 0.6);
  const cy = y + h * (0.2 + rng() * 0.6);
  const maxR = Math.hypot(w, h);
  const ringStep = Math.max(1.6, Math.min(w, h) / (5 + rng() * 5));

  ctx.lineWidth = Math.max(0.5, ringStep * 0.22);
  for (let r = ringStep * (0.3 + rng()); r < maxR; r += ringStep) {
    const dark = 0.06 + rng() * 0.07;
    ctx.strokeStyle = `rgba(0,0,0,${dark})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Лёгкий блик масла сверху-слева.
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, 'rgba(255,255,255,0.07)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  ctx.restore();
}

/** Продольная текстура — для щита A и брусков (видим пласть, а не торец). */
function paintLongGrain(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  baseColor: string, cellSeed: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);

  const rng = mulberry32(cellSeed);
  const lines = Math.max(3, Math.round(h / 6));
  ctx.lineWidth = 0.8;
  for (let i = 0; i < lines; i++) {
    const yy = y + (i + rng() * 0.7) * (h / lines);
    ctx.strokeStyle = `rgba(0,0,0,${0.05 + rng() * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(
      x + w * 0.33, yy + (rng() - 0.5) * h * 0.12,
      x + w * 0.66, yy + (rng() - 0.5) * h * 0.12,
      x + w, yy + (rng() - 0.5) * h * 0.06
    );
    ctx.stroke();
  }
  ctx.restore();
}

function speciesColor(recipe: Recipe, speciesId: string, oil: number): string {
  const hex = recipe.species[speciesId]?.colorHex ?? '#888888';
  return applyOilToHex(hex, oil);
}

function drawGlueLine(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.7;
  ctx.strokeRect(x, y, w, h);
}

/**
 * Щит A сверху: бруски лежат вдоль, видна пласть.
 * Используется на этапах strips / panelA / crosscut.
 */
function renderPanelA(
  ctx: CanvasRenderingContext2D,
  recipe: Recipe,
  projection: RecipeProjection,
  opts: RenderOptions
) {
  const lengthMm = recipe.panel.usableLengthMm;
  const widthMm = projection.panel.netWidthMm;
  if (lengthMm <= 0 || widthMm <= 0) return;

  const gapMm = opts.step === 'strips' ? 14 * opts.explode : 0;
  const totalWidth = widthMm + gapMm * Math.max(0, recipe.panel.strips.length - 1);
  const vp = fit(ctx, lengthMm, totalWidth, 36);

  let cursorY = 0;
  recipe.panel.strips.forEach((strip, index) => {
    const h = strip.widthMm * vp.scale;
    const x = vp.offsetX;
    const y = vp.offsetY + cursorY * vp.scale;
    const w = lengthMm * vp.scale;
    paintLongGrain(ctx, x, y, w, h, speciesColor(recipe, strip.speciesId, opts.oil), index * 977 + 13);
    drawGlueLine(ctx, x, y, w, h);
    cursorY += strip.widthMm + gapMm;
  });

  if (opts.step === 'crosscut') {
    const S = recipe.crosscut.sliceThicknessMm;
    const k = recipe.crosscut.sawKerfMm;
    const h = totalWidth * vp.scale;
    for (let i = 1; i < projection.sliceCount; i++) {
      const cutStartMm = i * S + (i - 1) * k;
      const x = vp.offsetX + cutStartMm * vp.scale;
      const kerfW = Math.max(1, k * vp.scale);
      ctx.fillStyle = 'rgba(255,120,60,0.85)';
      ctx.fillRect(x, vp.offsetY, kerfW, h);
    }
    // Остаток, который не превратится в планку.
    const remainder = projection.panel.designRemainderLengthMm;
    if (remainder > 0.5) {
      const x = vp.offsetX + (lengthMm - remainder) * vp.scale;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, vp.offsetY, remainder * vp.scale, h);
    }
  }
}

/**
 * Раскладка планок готовой доски. Одна функция и для отрисовки, и для попадания
 * курсором — иначе клик уезжает от того, что нарисовано.
 *
 * Планки после поворота на 90° стоят колонками: длина доски идёт по X,
 * ширина — по Y. Тот же разворот, что и на верстаке.
 */
export function boardLayout(
  ctx: CanvasRenderingContext2D,
  recipe: Recipe,
  projection: RecipeProjection,
  opts: RenderOptions
): { vp: Viewport; rects: SliceRect[]; widthMm: number; totalLength: number } {
  const count = projection.sliceCount;
  const stripThickness = recipe.panel.stripThicknessMm;
  const widthMm = projection.panel.netWidthMm;
  const gapMm = opts.step === 'flip' ? 10 * opts.explode : 0;
  const totalLength = count * stripThickness + gapMm * Math.max(0, count - 1);
  const vp = fit(ctx, totalLength || 1, widthMm || 1, 36);

  const rects: SliceRect[] = Array.from({ length: count }, (_, sliceIndex) => ({
    sliceIndex,
    x: vp.offsetX + sliceIndex * (stripThickness + gapMm) * vp.scale,
    y: vp.offsetY,
    w: stripThickness * vp.scale,
    h: widthMm * vp.scale,
  }));

  return { vp, rects, widthMm, totalLength };
}

/**
 * Какая планка под точкой (координаты в пикселях канваса, с учётом dpr).
 * Работает только на этапах, где нарисована доска.
 */
export function hitTestSlice(
  ctx: CanvasRenderingContext2D,
  recipe: Recipe,
  projection: RecipeProjection,
  opts: RenderOptions,
  x: number,
  y: number
): number | null {
  if (opts.step !== 'final' && opts.step !== 'flip') return null;
  const { rects } = boardLayout(ctx, recipe, projection, opts);
  const found = rects.find((rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
  return found ? found.sliceIndex : null;
}

/**
 * Готовая доска сверху: торцы. Ряд = планка, ячейка = торец бруска.
 * Используется на этапах flip / final.
 */
function renderBoard(
  ctx: CanvasRenderingContext2D,
  recipe: Recipe,
  projection: RecipeProjection,
  opts: RenderOptions
) {
  const matrix = getSliceStripIndices(recipe, projection.sliceCount);
  if (matrix.length === 0) return;

  const { vp, rects, widthMm, totalLength } = boardLayout(ctx, recipe, projection, opts);

  matrix.forEach((row, sliceIndex) => {
    const { x, w } = rects[sliceIndex];
    let cursorY = 0;

    row.forEach((stripIndex, position) => {
      const strip = recipe.panel.strips[stripIndex];
      if (!strip) return;
      const y = vp.offsetY + cursorY * vp.scale;
      const h = strip.widthMm * vp.scale;
      paintEndGrain(
        ctx, x, y, w, h,
        speciesColor(recipe, strip.speciesId, opts.oil),
        sliceIndex * 7919 + position * 131 + stripIndex
      );
      drawGlueLine(ctx, x, y, w, h);
      cursorY += strip.widthMm;
    });

    if (opts.step === 'flip' && recipe.transform.flipOddSlices && sliceIndex % 2 === 1 && opts.explode > 0.05) {
      ctx.strokeStyle = 'rgba(255,150,70,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, vp.offsetY, w, widthMm * vp.scale);
    }

    // Планка, отредактированная руками, помечена уголком.
    const manual = recipe.transform.manualSlices?.[sliceIndex];
    if (Array.isArray(manual)) {
      ctx.fillStyle = 'rgba(255,138,61,0.95)';
      ctx.beginPath();
      ctx.moveTo(x + w, vp.offsetY);
      ctx.lineTo(x + w, vp.offsetY + Math.min(14, w));
      ctx.lineTo(x + w - Math.min(14, w), vp.offsetY);
      ctx.closePath();
      ctx.fill();
    }
  });

  // Общий контур доски.
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(vp.offsetX, vp.offsetY, totalLength * vp.scale, widthMm * vp.scale);

  if (typeof opts.selectedSlice === 'number' && rects[opts.selectedSlice]) {
    const rect = rects[opts.selectedSlice];
    const boardHeight = widthMm * vp.scale;
    ctx.strokeStyle = '#ff8a3d';
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x - 1.5, vp.offsetY - 1.5, rect.w + 3, boardHeight + 3);

    // Номер планки — чтобы понимать, где ты, когда ходишь стрелками.
    const label = String(opts.selectedSlice + 1);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const badgeW = Math.max(20, ctx.measureText(label).width + 12);
    const badgeY = vp.offsetY + boardHeight + 12;
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.roundRect(rect.x + rect.w / 2 - badgeW / 2, badgeY, badgeW, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#23150a';
    ctx.fillText(label, rect.x + rect.w / 2, badgeY + 9);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  recipe: Recipe,
  projection: RecipeProjection,
  opts: RenderOptions
) {
  ctx.fillStyle = opts.background ?? BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (projection.sliceCount <= 0 || projection.panel.netWidthMm <= 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Рецепт пока не даёт ни одной планки', ctx.canvas.width / 2, ctx.canvas.height / 2);
    ctx.textAlign = 'left';
    return;
  }

  if (opts.step === 'strips' || opts.step === 'panelA' || opts.step === 'crosscut') {
    renderPanelA(ctx, recipe, projection, opts);
  } else {
    renderBoard(ctx, recipe, projection, opts);
  }
}
