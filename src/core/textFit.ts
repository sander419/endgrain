/**
 * Сколько колонок нужно надписи, чтобы её можно было прочитать.
 *
 * Буквы растеризуются по клеткам, и при 21 колонке слово из шести знаков
 * превращается в тёмную полосу: на знак остаётся три клетки, штрихи сливаются.
 * Поэтому при вводе текста сетка расширяется под длину строки, а не наоборот.
 */

/** Клеток на знак, ниже которых буква перестаёт читаться. Проверено на кириллице. */
export const CELLS_PER_GLYPH = 5;

/** Доска шире этого — уже не разделочная доска, а столешница. */
export const MAX_TEXT_COLUMNS = 60;

export function columnsForText(
  text: string,
  currentCols: number,
  maxCols: number = MAX_TEXT_COLUMNS
): number {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return currentCols;

  const longest = lines.reduce((max, line) => Math.max(max, [...line].length), 0);
  // Плюс две клетки — поля, иначе крайние буквы упираются в кромку доски.
  const wanted = longest * CELLS_PER_GLYPH + 2;
  return Math.min(maxCols, Math.max(currentCols, wanted));
}

/** Влезает ли надпись читаемо в заданную сетку. */
export function textFitsColumns(text: string, cols: number): boolean {
  return columnsForText(text, 0, Number.MAX_SAFE_INTEGER) <= cols;
}
