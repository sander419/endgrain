/**
 * Подбор ближайшей породы по цвету. Нужен для импорта фото в мозаику: палитра
 * пород фиксирована и мала (до 7 цветов), поэтому полноценная квантизация
 * (RGBQuant/NeuQuant) избыточна — задача не «построить новую палитру», а
 * «сопоставить каждый пиксель существующей».
 */
import type { WoodSpecies } from './types';

export interface Rgb { r: number; g: number; b: number; }

export function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16) || 0,
    g: parseInt(normalized.slice(2, 4), 16) || 0,
    b: parseInt(normalized.slice(4, 6), 16) || 0,
  };
}

// Rec.709 — те же веса, что и в oil.ts, чтобы «темнее/светлее» значило
// одно и то же по всему приложению.
const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

function distanceSq(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return LUM_R * dr * dr + LUM_G * dg * dg + LUM_B * db * db;
}

/**
 * Порода из палитры, чей цвет ближе всего к (r,g,b). Пустая палитра — вызывающий
 * код обязан её исключить заранее; здесь на пустой палитре возвращается 'unknown'
 * (проекция дальше отфильтрует несуществующую породу через свой валидатор).
 */
export function nearestSpeciesId(
  rgb: Rgb,
  paletteIds: string[],
  species: Record<string, WoodSpecies>
): string {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const id of paletteIds) {
    const color = species[id]?.colorHex;
    if (!color) continue;
    const distance = distanceSq(rgb, hexToRgb(color));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best ?? 'unknown';
}
