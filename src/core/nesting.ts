/**
 * Карта раскроя: как разложить бруски щита по покупным доскам.
 *
 * Раскрой гильотинный, как в мастерской без ЧПУ: доска сначала торцуется
 * поперёк на куски нужной длины (полосы), потом каждый кусок распускается
 * вдоль на бруски. Свободная 2D-укладка дала бы цифры красивее, но такие
 * резы на циркулярке не сделать — карта врала бы в сторону мастера.
 *
 * Каждый рез съедает пропил: между соседними брусками в полосе и между
 * полосами по длине. Без этого раскрой сходится на бумаге и не сходится
 * на станке.
 */

export interface StockBoard {
  /** Длина покупной доски, мм. */
  lengthMm: number;
  /** Ширина покупной доски, мм. Толщина считается равной толщине бруска. */
  widthMm: number;
}

export interface NestPiece {
  pieceId: string;
  speciesId: string;
  lengthMm: number;
  widthMm: number;
}

export interface PlacedPiece {
  pieceId: string;
  /** Отступ от торца доски до начала бруска, мм. */
  xMm: number;
  /** Отступ от кромки доски, мм. */
  yMm: number;
  lengthMm: number;
  widthMm: number;
}

export interface NestedBoard {
  speciesId: string;
  /** Номер доски внутри породы, с 1 — как в списке покупок. */
  index: number;
  lengthMm: number;
  widthMm: number;
  pieces: PlacedPiece[];
  /** Доля площади доски, ушедшая в бруски (без пропилов и обрезков). */
  usedPct: number;
  /** Докуда доска распилена, мм. */
  usedLengthMm: number;
  /**
   * Нетронутый хвост доски. Это не отход: его уносят в стеллаж и режут
   * в другом проекте, поэтому в проценте отхода он не участвует.
   */
  offcutLengthMm: number;
  /** Выход по распиленной части: сколько её ушло в бруски, а сколько в стружку. */
  yieldPct: number;
}

export interface SpeciesNest {
  speciesId: string;
  boards: number;
  pieces: number;
  usedPct: number;
  /** Суммарный нетронутый хвост по доскам этой породы, мм. */
  offcutLengthMm: number;
}

export interface NestResult {
  boards: NestedBoard[];
  bySpecies: SpeciesNest[];
  /** Детали, которые не влезают в покупную доску ни при какой раскладке. */
  unplaced: NestPiece[];
  kerfMm: number;
  stock: StockBoard;
  /** Полезный выход по всем доскам разом. */
  usedPct: number;
  /** Выход по распиленной части всех досок: тут и виден реальный отход. */
  yieldPct: number;
}

interface Row {
  /** Длина полосы: задаётся первой деталью и дальше не растёт. */
  lengthMm: number;
  xMm: number;
  usedWidthMm: number;
}

interface BoardInWork {
  board: NestedBoard;
  rows: Row[];
  usedLengthMm: number;
}

const EPS = 1e-6;

export function nestPieces(
  pieces: NestPiece[],
  stock: StockBoard,
  kerfMm: number
): NestResult {
  const kerf = Number.isFinite(kerfMm) && kerfMm > 0 ? kerfMm : 0;
  const stockLength = Math.max(0, stock.lengthMm);
  const stockWidth = Math.max(0, stock.widthMm);

  const bySpecies = new Map<string, NestPiece[]>();
  const unplaced: NestPiece[] = [];

  for (const piece of pieces) {
    if (piece.lengthMm > stockLength + EPS || piece.widthMm > stockWidth + EPS) {
      unplaced.push(piece);
      continue;
    }
    const list = bySpecies.get(piece.speciesId);
    if (list) list.push(piece);
    else bySpecies.set(piece.speciesId, [piece]);
  }

  const boards: NestedBoard[] = [];
  const summary: SpeciesNest[] = [];

  for (const [speciesId, list] of bySpecies) {
    // Сначала длинные и широкие: так полосы заполняются плотнее.
    const queue = [...list].sort(
      (a, b) => b.lengthMm - a.lengthMm || b.widthMm - a.widthMm
    );
    const inWork: BoardInWork[] = [];

    for (const piece of queue) {
      let placed = false;

      for (const work of inWork) {
        const row = work.rows.find(
          (candidate) =>
            candidate.lengthMm >= piece.lengthMm - EPS &&
            candidate.usedWidthMm + piece.widthMm + (candidate.usedWidthMm > 0 ? kerf : 0) <=
              stockWidth + EPS
        );
        if (!row) continue;
        const y = row.usedWidthMm + (row.usedWidthMm > 0 ? kerf : 0);
        work.board.pieces.push({
          pieceId: piece.pieceId,
          xMm: row.xMm,
          yMm: y,
          lengthMm: piece.lengthMm,
          widthMm: piece.widthMm,
        });
        row.usedWidthMm = y + piece.widthMm;
        placed = true;
        break;
      }
      if (placed) continue;

      // Новая полоса на уже начатой доске.
      for (const work of inWork) {
        const start = work.usedLengthMm + (work.usedLengthMm > 0 ? kerf : 0);
        if (start + piece.lengthMm > stockLength + EPS) continue;
        work.rows.push({ lengthMm: piece.lengthMm, xMm: start, usedWidthMm: piece.widthMm });
        work.board.pieces.push({
          pieceId: piece.pieceId,
          xMm: start,
          yMm: 0,
          lengthMm: piece.lengthMm,
          widthMm: piece.widthMm,
        });
        work.usedLengthMm = start + piece.lengthMm;
        placed = true;
        break;
      }
      if (placed) continue;

      // Новая доска.
      const board: NestedBoard = {
        speciesId,
        index: inWork.length + 1,
        lengthMm: stockLength,
        widthMm: stockWidth,
        pieces: [
          {
            pieceId: piece.pieceId,
            xMm: 0,
            yMm: 0,
            lengthMm: piece.lengthMm,
            widthMm: piece.widthMm,
          },
        ],
        usedPct: 0,
        usedLengthMm: 0,
        offcutLengthMm: 0,
        yieldPct: 0,
      };
      inWork.push({
        board,
        rows: [{ lengthMm: piece.lengthMm, xMm: 0, usedWidthMm: piece.widthMm }],
        usedLengthMm: piece.lengthMm,
      });
    }

    const stockArea = stockLength * stockWidth;
    let speciesUsed = 0;
    let speciesPieces = 0;
    let speciesOffcut = 0;
    for (const work of inWork) {
      const used = work.board.pieces.reduce(
        (total, piece) => total + piece.lengthMm * piece.widthMm,
        0
      );
      const sawnArea = work.usedLengthMm * stockWidth;
      work.board.usedPct = stockArea > 0 ? (used / stockArea) * 100 : 0;
      work.board.usedLengthMm = work.usedLengthMm;
      work.board.offcutLengthMm = Math.max(0, stockLength - work.usedLengthMm);
      work.board.yieldPct = sawnArea > 0 ? (used / sawnArea) * 100 : 0;
      speciesUsed += used;
      speciesPieces += work.board.pieces.length;
      speciesOffcut += work.board.offcutLengthMm;
      boards.push(work.board);
    }

    summary.push({
      speciesId,
      boards: inWork.length,
      pieces: speciesPieces,
      usedPct: inWork.length > 0 && stockArea > 0
        ? (speciesUsed / (inWork.length * stockArea)) * 100
        : 0,
      offcutLengthMm: speciesOffcut,
    });
  }

  const totalStockArea = boards.length * stockLength * stockWidth;
  const totalUsed = boards.reduce(
    (total, board) =>
      total + board.pieces.reduce((sum, piece) => sum + piece.lengthMm * piece.widthMm, 0),
    0
  );
  const totalSawnArea = boards.reduce(
    (total, board) => total + board.usedLengthMm * stockWidth,
    0
  );

  return {
    boards,
    bySpecies: summary.sort((a, b) => b.boards - a.boards),
    unplaced,
    kerfMm: kerf,
    stock: { lengthMm: stockLength, widthMm: stockWidth },
    usedPct: totalStockArea > 0 ? (totalUsed / totalStockArea) * 100 : 0,
    yieldPct: totalSawnArea > 0 ? (totalUsed / totalSawnArea) * 100 : 0,
  };
}

/** Ходовые длины покупной доски, мм. */
export const STOCK_PRESETS: StockBoard[] = [
  { lengthMm: 1000, widthMm: 100 },
  { lengthMm: 2000, widthMm: 150 },
  { lengthMm: 3000, widthMm: 200 },
];
