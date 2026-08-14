/**
 * Текст в мозаику. Растеризуем строку системным шрифтом на скрытом канвасе,
 * потом усредняем яркость по клеткам — так работает любой шрифт и любой язык,
 * без вшитых битмапов на каждую букву.
 */
import type { Mosaic } from '../core';

export interface TextOptions {
  rows: number;
  cols: number;
  cellMm: number;
  background: string;
  foreground: string;
  fontFamily?: string;
  bold?: boolean;
  /** Доля клетки, закрашенная буквой, после которой клетка считается тёмной. */
  threshold?: number;
}

/** Во сколько раз растр подробнее сетки — усреднение сглаживает ступеньки. */
const SUPERSAMPLE = 8;

export function textToMosaic(text: string, options: TextOptions): Mosaic {
  const { rows, cols, cellMm, background, foreground } = options;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const empty: Mosaic = {
    cellMm,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => background)),
  };
  if (lines.length === 0 || rows === 0 || cols === 0) return empty;

  const width = cols * SUPERSAMPLE;
  const height = rows * SUPERSAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return empty;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // Гротеск с толстыми штрихами: засечки на сетке 20 клеток рассыпаются в кашу.
  const family = options.fontFamily ?? '"Arial Black", Impact, "Segoe UI", sans-serif';
  const weight = options.bold === false ? '700' : '900';
  const lineHeight = height / lines.length;

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  // Метрики actualBoundingBox Chrome отсчитывает от alphabetic-линии независимо
  // от textBaseline, поэтому центруем сами и baseline держим alphabetic.
  ctx.textBaseline = 'alphabetic';

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // Подбираем кегль так, чтобы строка влезла и по ширине, и по высоте строки.
    let size = lineHeight * 0.95;
    const applyFont = (value: number) => {
      ctx.font = `${weight} ${value}px ${family}`;
      // Без разрядки соседние буквы на грубой сетке сливаются в одно пятно:
      // между штрихами не остаётся ни одной светлой клетки.
      const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
      if ('letterSpacing' in spaced) spaced.letterSpacing = `${value * 0.16}px`;
    };
    applyFont(size);
    const measured = ctx.measureText(line).width;
    const maxWidth = width * 0.94;
    if (measured > maxWidth) {
      size = Math.max(4, size * (maxWidth / measured));
      applyFont(size);
    }

    // Верх глифов лежит на baseline − ascent, низ — на baseline + descent.
    // Значит для центра строки baseline = центр + (ascent − descent)/2.
    const metrics = ctx.measureText(line);
    const ascent = metrics.actualBoundingBoxAscent ?? size * 0.7;
    const descent = metrics.actualBoundingBoxDescent ?? 0;
    const targetY = lineHeight * (index + 0.5);
    ctx.fillText(line, width / 2, targetY + (ascent - descent) / 2);
  }

  const data = ctx.getImageData(0, 0, width, height).data;
  // Порог ниже половины: на грубой сетке лучше «дожать» штрих, чем потерять его.
  const threshold = options.threshold ?? 0.36;

  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      let sum = 0;
      for (let y = 0; y < SUPERSAMPLE; y++) {
        for (let x = 0; x < SUPERSAMPLE; x++) {
          const px = (col * SUPERSAMPLE + x) + (row * SUPERSAMPLE + y) * width;
          sum += data[px * 4]; // белым нарисован текст, канал R достаточен
        }
      }
      const coverage = sum / (SUPERSAMPLE * SUPERSAMPLE * 255);
      return coverage >= threshold ? foreground : background;
    })
  );

  return { cellMm, cells };
}
