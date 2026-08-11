/**
 * Фото → мозаика. Картинка обрезается по центру под пропорции доски и
 * сводится к породам из палитры — источник клеток, равноправный генераторам.
 */
import type { Mosaic, WoodSpecies } from '../core';
import { nearestSpeciesId } from '../core';

export interface ImageMosaicOptions {
  rows: number;
  cols: number;
  cellMm: number;
  /** Породы, к которым имеет смысл приводить цвета. */
  palette: string[];
  species: Record<string, WoodSpecies>;
  /** 0..1: контраст перед подбором породы. Плоское фото иначе схлопывается
   *  в один-два средних тона — древесные оттенки все блёкло-коричневые. */
  contrast?: number;
}

type ImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

function naturalSize(source: ImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** Прямоугольник для центрального кропа source под целевые пропорции. */
function coverCrop(srcW: number, srcH: number, targetAspect: number) {
  const srcAspect = srcW / srcH;
  if (srcAspect > targetAspect) {
    const sh = srcH;
    const sw = srcH * targetAspect;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh };
  }
  const sw = srcW;
  const sh = srcW / targetAspect;
  return { sx: 0, sy: (srcH - sh) / 2, sw, sh };
}

function applyContrast(value: number, amount: number): number {
  // amount=0 — без изменений, amount=1 — размах вокруг серого утраивается.
  return Math.max(0, Math.min(255, 128 + (value - 128) * (1 + amount * 2)));
}

export function imageToMosaic(source: ImageSource, options: ImageMosaicOptions): Mosaic {
  const { rows, cols, cellMm, palette, species } = options;
  const contrast = options.contrast ?? 0.35;

  if (rows <= 0 || cols <= 0 || palette.length === 0) {
    return { cellMm, cells: [] };
  }

  const { width, height } = naturalSize(source);
  if (width === 0 || height === 0) {
    return { cellMm, cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => palette[0])) };
  }

  const crop = coverCrop(width, height, cols / rows);

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { cellMm, cells: [] };

  // Даём браузеру честно усреднить фото до одного пикселя на клетку —
  // это и есть даунсемплинг, ручной перебор пикселей тут не нужен.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as CanvasImageSource, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows);

  const data = ctx.getImageData(0, 0, cols, rows).data;

  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const i = (row * cols + col) * 4;
      const rgb = {
        r: applyContrast(data[i], contrast),
        g: applyContrast(data[i + 1], contrast),
        b: applyContrast(data[i + 2], contrast),
      };
      return nearestSpeciesId(rgb, palette, species);
    })
  );

  return { cellMm, cells };
}
