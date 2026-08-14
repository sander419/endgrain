import { describe, expect, it } from 'vitest';
import {
  CELLS_PER_GLYPH,
  MAX_TEXT_COLUMNS,
  columnsForText,
  textFitsColumns,
} from '../src/core/textFit';

describe('ширина сетки под надпись', () => {
  it('короткое слово помещается в текущую сетку', () => {
    expect(columnsForText('ДОМ', 21)).toBe(21);
  });

  it('длинное слово расширяет сетку — иначе буквы сливаются в полосу', () => {
    // Ровно тот случай, что был сломан в галерее README: 6 знаков на 21 колонку.
    expect(columnsForText('ХИБОРГ', 21)).toBe(6 * CELLS_PER_GLYPH + 2);
    expect(textFitsColumns('ХИБОРГ', 21)).toBe(false);
    expect(textFitsColumns('ХИБОРГ', columnsForText('ХИБОРГ', 21))).toBe(true);
  });

  it('сетка не сужается: ручной размер пользователя сохраняется', () => {
    expect(columnsForText('ДОМ', 40)).toBe(40);
  });

  it('многострочная надпись меряется по самой длинной строке', () => {
    expect(columnsForText('ДОМ\nХИБОРГ', 21)).toBe(columnsForText('ХИБОРГ', 21));
  });

  it('доска не растёт бесконечно', () => {
    expect(columnsForText('ОЧЕНЬ ДЛИННАЯ НАДПИСЬ ЦЕЛИКОМ', 21)).toBe(MAX_TEXT_COLUMNS);
  });

  it('пустой ввод ничего не меняет', () => {
    expect(columnsForText('', 21)).toBe(21);
    expect(columnsForText('   \n  ', 21)).toBe(21);
  });
});
