/** Отрисовка мозаики: доска в клетках, каждая клетка — торец бруска. */
import type { Mosaic, MosaicPlan, WoodSpecies } from '../core';
import { applyOilToHex, mosaicSize } from '../core';
import { paintEndGrain } from './board';

const BG = '#14100d';

export interface MosaicRenderOptions {
  species: Record<string, WoodSpecies>;
  oil: number;
  /** Показывать границы щитов: из какого щита какая колонка. */
  showPanels?: boolean;
  plan?: MosaicPlan;
  hover?: { row: number; col: number } | null;
  background?: string;
  /** Подсветить колонки одного щита. */
  highlightPanel?: number | null;
}

interface Layout {
  x: number;
  y: number;
  size: number;
  rows: number;
  cols: number;
}

function layout(ctx: CanvasRenderingContext2D, mosaic: Mosaic, pad = 28): Layout {
  const { rows, cols } = mosaicSize(mosaic);
  const size = Math.min(
    (ctx.canvas.width - pad * 2) / Math.max(1, cols),
    (ctx.canvas.height - pad * 2) / Math.max(1, rows)
  );
  return {
    size,
    rows,
    cols,
    x: (ctx.canvas.width - size * cols) / 2,
    y: (ctx.canvas.height - size * rows) / 2,
  };
}

/** Клетка под точкой канваса — для кисти. */
export function hitTestCell(
  ctx: CanvasRenderingContext2D,
  mosaic: Mosaic,
  x: number,
  y: number
): { row: number; col: number } | null {
  const view = layout(ctx, mosaic);
  if (view.size <= 0) return null;
  const col = Math.floor((x - view.x) / view.size);
  const row = Math.floor((y - view.y) / view.size);
  if (row < 0 || col < 0 || row >= view.rows || col >= view.cols) return null;
  return { row, col };
}

export function renderMosaic(
  ctx: CanvasRenderingContext2D,
  mosaic: Mosaic,
  options: MosaicRenderOptions
) {
  ctx.fillStyle = options.background ?? BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const view = layout(ctx, mosaic);
  if (view.size <= 0) return;

  for (let row = 0; row < view.rows; row++) {
    for (let col = 0; col < view.cols; col++) {
      const speciesId = mosaic.cells[row][col];
      const hex = options.species[speciesId]?.colorHex ?? '#888888';
      const x = view.x + col * view.size;
      const y = view.y + row * view.size;
      paintEndGrain(
        ctx, x, y, view.size, view.size,
        applyOilToHex(hex, options.oil),
        row * 7919 + col * 131
      );
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x, y, view.size, view.size);
    }
  }

  // Колонки, которые режутся из одного щита, помечены общим цветом сверху.
  if (options.showPanels && options.plan) {
    const palette = ['#ff8a3d', '#6cc6ff', '#8fd67a', '#ffd166', '#d68aff', '#ff6b8a'];
    options.plan.panels.forEach((panel, index) => {
      const color = palette[index % palette.length];
      for (const column of panel.columns) {
        const x = view.x + column.col * view.size;
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, view.y - 7, view.size - 2, 4);
        if (column.flipped) {
          // Перевёрнутая планка помечена разрывом в полоске.
          ctx.fillStyle = options.background ?? BG;
          ctx.fillRect(x + view.size / 2 - 2, view.y - 7, 4, 4);
        }
        if (options.highlightPanel === panel.index) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, view.y + 1, view.size - 2, view.size * view.rows - 2);
        }
      }
    });
  }

  if (options.hover) {
    const { row, col } = options.hover;
    if (row >= 0 && col >= 0 && row < view.rows && col < view.cols) {
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2;
      ctx.strokeRect(view.x + col * view.size, view.y + row * view.size, view.size, view.size);
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(view.x, view.y, view.size * view.cols, view.size * view.rows);
}
