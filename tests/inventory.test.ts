import { describe, it, expect } from 'vitest';
import {
  INVENTORY_LIMIT,
  createInventoryBoard,
  planFromInventory,
  sanitizeInventory,
  sanitizeInventoryBoard,
  type InventoryBoard,
} from '../src/core/inventory';
import { nestPieces, type NestPiece } from '../src/core/nesting';

const PURCHASE = { lengthMm: 2000, widthMm: 150 };

function strips(count: number, speciesId: string, lengthMm = 630, widthMm = 42): NestPiece[] {
  return Array.from({ length: count }, (_, index) => ({
    pieceId: `${speciesId}-${index}`,
    speciesId,
    lengthMm,
    widthMm,
  }));
}

const board = (patch: Partial<InventoryBoard>) => createInventoryBoard(patch);

describe('ограничение числа досок в раскрое', () => {
  it('без ограничения раскрой берёт столько досок, сколько нужно', () => {
    const nest = nestPieces(strips(30, 'maple'), PURCHASE, 3);
    expect(nest.boards.length).toBeGreaterThan(1);
    expect(nest.overflow).toEqual([]);
  });

  it('с ограничением лишние детали уходят в overflow, а не пропадают', () => {
    const pieces = strips(30, 'maple');
    const nest = nestPieces(pieces, PURCHASE, 3, { maxBoards: 1 });
    expect(nest.boards.length).toBe(1);
    const placed = nest.boards[0].pieces.length;
    expect(placed + nest.overflow.length).toBe(pieces.length);
  });

  it('«не влезает никуда» и «кончился материал» — разные ответы', () => {
    // Слишком длинная деталь невозможна в принципе; остальным просто не хватило доски.
    const pieces = [
      { pieceId: 'huge', speciesId: 'maple', lengthMm: 5000, widthMm: 42 },
      ...strips(30, 'maple'),
    ];
    const nest = nestPieces(pieces, PURCHASE, 3, { maxBoards: 1 });
    expect(nest.unplaced.map((piece) => piece.pieceId)).toEqual(['huge']);
    expect(nest.overflow.length).toBeGreaterThan(0);
  });

  it('ограничение считается по каждой породе отдельно', () => {
    // Доска клёна деталям ореха всё равно не поможет.
    const pieces = [...strips(4, 'maple'), ...strips(4, 'walnut')];
    const nest = nestPieces(pieces, PURCHASE, 3, { maxBoards: 1 });
    expect(nest.boards.length).toBe(2);
  });
});

describe('план по складу', () => {
  it('без склада всё уходит в покупку', () => {
    const plan = planFromInventory(strips(12, 'maple'), [], PURCHASE, 3);
    expect(plan.boardsFromStock).toBe(0);
    expect(plan.boardsToBuy).toBeGreaterThan(0);
    expect(plan.coveredPct).toBe(0);
  });

  it('свой материал закрывает часть деталей и уменьшает покупку', () => {
    const pieces = strips(12, 'maple');
    const withoutStock = planFromInventory(pieces, [], PURCHASE, 3);
    const withStock = planFromInventory(
      pieces,
      [board({ speciesId: 'maple', lengthMm: 2000, widthMm: 150, count: 1 })],
      PURCHASE,
      3
    );
    expect(withStock.boardsFromStock).toBe(1);
    expect(withStock.coveredPct).toBeGreaterThan(0);
    expect(withStock.boardsToBuy).toBeLessThan(withoutStock.boardsToBuy);
  });

  it('достаточного склада хватает без покупки вовсе', () => {
    const plan = planFromInventory(
      strips(6, 'maple'),
      [board({ speciesId: 'maple', lengthMm: 3000, widthMm: 200, count: 4 })],
      PURCHASE,
      3
    );
    expect(plan.boardsToBuy).toBe(0);
    expect(plan.coveredPct).toBe(100);
    expect(plan.toBuy.boards).toEqual([]);
  });

  it('чужая порода на складе не помогает', () => {
    const plan = planFromInventory(
      strips(8, 'walnut'),
      [board({ speciesId: 'maple', lengthMm: 3000, widthMm: 200, count: 5 })],
      PURCHASE,
      3
    );
    expect(plan.boardsFromStock).toBe(0);
    expect(plan.coveredPct).toBe(0);
  });

  it('слишком короткая своя доска не берётся в дело', () => {
    const plan = planFromInventory(
      strips(4, 'maple', 900, 42),
      [board({ speciesId: 'maple', lengthMm: 600, widthMm: 150, count: 3 })],
      PURCHASE,
      3
    );
    expect(plan.boardsFromStock).toBe(0);
    expect(plan.boardsToBuy).toBeGreaterThan(0);
  });

  it('деталь, не влезающая ни в свою доску, ни в покупную, названа поимённо', () => {
    const plan = planFromInventory(
      [{ pieceId: 'huge', speciesId: 'maple', lengthMm: 9000, widthMm: 42 }],
      [board({ speciesId: 'maple', lengthMm: 3000, widthMm: 200, count: 1 })],
      PURCHASE,
      3
    );
    expect(plan.unplaced.map((piece) => piece.pieceId)).toEqual(['huge']);
  });

  it('ни одна деталь не теряется и не удваивается', () => {
    const pieces = [...strips(9, 'maple'), ...strips(7, 'walnut')];
    const plan = planFromInventory(
      pieces,
      [
        board({ speciesId: 'maple', lengthMm: 2000, widthMm: 150, count: 1 }),
        board({ speciesId: 'walnut', lengthMm: 1000, widthMm: 100, count: 2 }),
      ],
      PURCHASE,
      3
    );
    const ids = [
      ...plan.used.flatMap((use) => use.nest.boards.flatMap((b) => b.pieces.map((p) => p.pieceId))),
      ...plan.toBuy.boards.flatMap((b) => b.pieces.map((p) => p.pieceId)),
      ...plan.unplaced.map((piece) => piece.pieceId),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(pieces.length);
  });

  it('большие доски идут в дело первыми', () => {
    // Короткая деталь влезет и в обрезок, длинная — только в длинную доску.
    // Начав с мелочи, можно занять ею единственную длинную и остаться без материала.
    const plan = planFromInventory(
      strips(3, 'maple', 1800, 42),
      [
        board({ speciesId: 'maple', lengthMm: 900, widthMm: 150, count: 1 }),
        board({ speciesId: 'maple', lengthMm: 2000, widthMm: 150, count: 1 }),
      ],
      PURCHASE,
      3
    );
    expect(plan.used[0].board.lengthMm).toBe(2000);
  });

  it('пустой список деталей не роняет расчёт', () => {
    const plan = planFromInventory([], [board({ speciesId: 'maple' })], PURCHASE, 3);
    expect(plan.boardsToBuy).toBe(0);
    expect(plan.coveredPct).toBe(0);
  });
});

describe('санитайзер склада', () => {
  it('нулевые и отрицательные размеры заменяются рабочими', () => {
    const clean = sanitizeInventoryBoard({ lengthMm: 0, widthMm: -5, count: 0 });
    expect(clean.lengthMm).toBeGreaterThan(0);
    expect(clean.widthMm).toBeGreaterThan(0);
    expect(clean.count).toBeGreaterThan(0);
  });

  it('нереальные размеры зажимаются', () => {
    const clean = sanitizeInventoryBoard({ lengthMm: 1e9, widthMm: 1e9, count: 1e9 });
    expect(clean.lengthMm).toBe(12_000);
    expect(clean.widthMm).toBe(2000);
    expect(clean.count).toBe(999);
  });

  it('склад не растёт бесконечно', () => {
    const many = Array.from({ length: INVENTORY_LIMIT + 20 }, () => ({ speciesId: 'maple' }));
    expect(sanitizeInventory(many)).toHaveLength(INVENTORY_LIMIT);
  });

  it('мусор вместо списка даёт пустой склад', () => {
    for (const junk of [null, 42, 'строка', {}]) {
      expect(sanitizeInventory(junk), String(junk)).toEqual([]);
    }
  });

  it('идентификаторы досок не повторяются', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createInventoryBoard().id));
    expect(ids.size).toBe(100);
  });
});
