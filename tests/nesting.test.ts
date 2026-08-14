import { describe, expect, it } from 'vitest';
import { nestPieces } from '../src/core/nesting';
import type { NestPiece, NestedBoard } from '../src/core/nesting';

function pieces(count: number, lengthMm: number, widthMm: number, speciesId = 'maple'): NestPiece[] {
  return Array.from({ length: count }, (_, index) => ({
    pieceId: `${speciesId}-${index}`,
    speciesId,
    lengthMm,
    widthMm,
  }));
}

/** Бруски не должны налезать друг на друга — с учётом пропила между ними. */
function overlaps(board: NestedBoard, kerfMm: number): boolean {
  for (let a = 0; a < board.pieces.length; a++) {
    for (let b = a + 1; b < board.pieces.length; b++) {
      const first = board.pieces[a];
      const second = board.pieces[b];
      const gapX =
        first.xMm + first.lengthMm + kerfMm <= second.xMm + 1e-6 ||
        second.xMm + second.lengthMm + kerfMm <= first.xMm + 1e-6;
      const gapY =
        first.yMm + first.widthMm + kerfMm <= second.yMm + 1e-6 ||
        second.yMm + second.widthMm + kerfMm <= first.yMm + 1e-6;
      if (!gapX && !gapY) return true;
    }
  }
  return false;
}

describe('раскрой по покупным доскам', () => {
  const stock = { lengthMm: 2000, widthMm: 150 };

  it('считает, сколько брусков влезает с учётом пропила', () => {
    // По ширине: 2 × 50 + 3 = 103 ≤ 150, третий брусок уже 156 — не лезет.
    // По длине: 3 × 600 + 2 × 3 = 1806 ≤ 2000.
    const result = nestPieces(pieces(6, 600, 50), stock, 3);
    expect(result.boards).toHaveLength(1);
    expect(result.boards[0].pieces).toHaveLength(6);
    expect(result.unplaced).toHaveLength(0);
  });

  it('седьмой брусок уходит на вторую доску', () => {
    const result = nestPieces(pieces(7, 600, 50), stock, 3);
    expect(result.boards).toHaveLength(2);
    expect(result.bySpecies[0].boards).toBe(2);
  });

  it('пропил не игнорируется: без него бруски встали бы в одну доску', () => {
    const tight = nestPieces(pieces(3, 660, 50), { lengthMm: 2000, widthMm: 50 }, 0);
    expect(tight.boards).toHaveLength(1);
    // 3 × 660 + 2 × 10 = 2000 ровно, а с пропилом 12 мм — уже нет.
    const withKerf = nestPieces(pieces(3, 660, 50), { lengthMm: 2000, widthMm: 50 }, 12);
    expect(withKerf.boards).toHaveLength(2);
  });

  it('бруски не накладываются друг на друга', () => {
    const result = nestPieces(
      [...pieces(5, 600, 40), ...pieces(4, 600, 55, 'walnut')],
      stock,
      3.2
    );
    for (const board of result.boards) {
      expect(overlaps(board, result.kerfMm)).toBe(false);
    }
  });

  it('породы не смешиваются в одной доске', () => {
    const result = nestPieces([...pieces(4, 600, 50), ...pieces(4, 600, 50, 'walnut')], stock, 3);
    for (const board of result.boards) {
      const species = new Set(
        board.pieces.map((piece) => piece.pieceId.split('-')[0])
      );
      expect(species.size).toBe(1);
    }
  });

  it('деталь длиннее покупной доски честно помечается невлезающей', () => {
    const result = nestPieces(pieces(2, 2400, 50), stock, 3);
    expect(result.boards).toHaveLength(0);
    expect(result.unplaced).toHaveLength(2);
  });

  it('полезный выход считается от площади всех досок', () => {
    const result = nestPieces(pieces(6, 600, 50), stock, 3);
    const expected = (6 * 600 * 50) / (2000 * 150) * 100;
    expect(result.usedPct).toBeCloseTo(expected, 6);
    expect(result.boards[0].usedPct).toBeCloseTo(expected, 6);
  });

  it('нетронутый хвост доски считается остатком, а не отходом', () => {
    // 3 бруска 629×52 в доску 2000×150. По ширине влезает два (52×2 + 3 = 107),
    // поэтому полос всего две: режем 1261 мм, хвост 739 мм остаётся целым.
    const result = nestPieces(pieces(3, 629, 52), stock, 3);
    const board = result.boards[0];
    expect(board.usedLengthMm).toBeCloseTo(629 * 2 + 3, 6);
    expect(board.offcutLengthMm).toBeCloseTo(2000 - (629 * 2 + 3), 6);
    // Выход по распиленной части: три бруска шириной 52 из 150 мм ширины.
    expect(board.yieldPct).toBeCloseTo(((3 * 629 * 52) / (board.usedLengthMm * 150)) * 100, 6);
    // И он заметно выше, чем доля всей доски: хвост не записан в мусор.
    expect(board.yieldPct).toBeGreaterThan(board.usedPct);
  });

  it('пустой список не роняет расчёт', () => {
    const result = nestPieces([], stock, 3);
    expect(result.boards).toHaveLength(0);
    expect(result.usedPct).toBe(0);
  });
});
