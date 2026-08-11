import { describe, expect, it } from 'vitest';
import { hexToRgb, nearestSpeciesId } from '../src/core';
import type { WoodSpecies } from '../src/core';

function species(id: string, colorHex: string): WoodSpecies {
  return { id, name: id, colorHex };
}

const PALETTE: Record<string, WoodSpecies> = {
  black: species('black', '#000000'),
  white: species('white', '#ffffff'),
  red: species('red', '#cc2222'),
};

describe('hexToRgb', () => {
  it('парсит цвет с решёткой и без', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb('ff8000')).toEqual({ r: 255, g: 128, b: 0 });
  });
});

describe('nearestSpeciesId', () => {
  const ids = Object.keys(PALETTE);

  it('точный цвет находит себя', () => {
    expect(nearestSpeciesId({ r: 0, g: 0, b: 0 }, ids, PALETTE)).toBe('black');
    expect(nearestSpeciesId({ r: 255, g: 255, b: 255 }, ids, PALETTE)).toBe('white');
    expect(nearestSpeciesId({ r: 204, g: 34, b: 34 }, ids, PALETTE)).toBe('red');
  });

  it('тёмно-серый ближе к чёрному, светло-серый — к белому', () => {
    expect(nearestSpeciesId({ r: 40, g: 40, b: 40 }, ids, PALETTE)).toBe('black');
    expect(nearestSpeciesId({ r: 230, g: 230, b: 230 }, ids, PALETTE)).toBe('white');
  });

  it('насыщенный красный ближе к red, чем к чёрному или белому', () => {
    expect(nearestSpeciesId({ r: 180, g: 20, b: 20 }, ids, PALETTE)).toBe('red');
  });

  it('пустая палитра не падает', () => {
    expect(nearestSpeciesId({ r: 10, g: 10, b: 10 }, [], PALETTE)).toBe('unknown');
  });

  it('id без цвета в справочнике пропускается', () => {
    expect(nearestSpeciesId({ r: 0, g: 0, b: 0 }, ['ghost', 'black'], PALETTE)).toBe('black');
  });
});
