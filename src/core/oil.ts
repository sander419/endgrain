/**
 * Эффект масла на дереве: тон темнеет, текстура «проявляется» — растёт насыщенность.
 *
 * Исходная версия из 03-Код.md умножала все три канала на darken*boost = 0.92,
 * то есть давала 8% затемнения и НОЛЬ прироста насыщенности (равномерное
 * умножение каналов меняет только яркость). Здесь насыщенность разводится
 * с яркостью: канал отталкивается от собственной светлоты, потом всё темнеет.
 */

const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

/** Насколько темнеет тон при полном масле. */
export const OIL_DARKEN = 0.22;
/** Насколько растёт насыщенность при полном масле. */
export const OIL_SATURATION_BOOST = 0.18;

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function applyOilToHex(hex: string, oilAmount: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return hex;

  const oil = Math.max(0, Math.min(1, oilAmount));
  const darken = 1 - oil * OIL_DARKEN;
  const boost = 1 + oil * OIL_SATURATION_BOOST;

  const lum = LUM_R * r + LUM_G * g + LUM_B * b;

  const saturate = (channel: number) => lum + (channel - lum) * boost;

  return `rgb(${clampChannel(saturate(r) * darken)}, ${clampChannel(saturate(g) * darken)}, ${clampChannel(saturate(b) * darken)})`;
}

export function applyOilToPalette(
  palette: Record<string, string>,
  oilAmount: number
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, color] of Object.entries(palette)) {
    result[key] = applyOilToHex(color, oilAmount);
  }
  return result;
}
