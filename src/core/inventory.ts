/**
 * Склад мастерской: что можно сделать из того, что уже лежит.
 *
 * Карта раскроя отвечает на вопрос «сколько купить». Это правильный вопрос
 * ровно один раз — в первый. Дальше в мастерской лежит стеллаж остатков,
 * и настоящий вопрос другой: **сколько докупить**. Разница между этими двумя
 * ответами и есть деньги, которые инструмент экономит.
 *
 * Как считается. Детали раскладываются по своим доскам от больших к меньшим,
 * каждая доска раскраивается тем же гильотинным алгоритмом, что и покупная
 * (`nestPieces` с ограничением в одну доску). Что не влезло — уходит
 * в покупку обычным раскроем.
 *
 * Почему сначала большие доски: короткая деталь влезет и в обрезок, а длинная
 * только в длинную доску. Начав с мелочи, можно занять ею единственную длинную
 * доску и остаться без материала на планку, которой замены нет.
 */
import { nestPieces, type NestPiece, type NestResult, type StockBoard } from './nesting';

export interface InventoryBoard {
  id: string;
  speciesId: string;
  lengthMm: number;
  widthMm: number;
  /** Сколько таких досок лежит. */
  count: number;
}

export interface InventoryUse {
  board: InventoryBoard;
  /** Какая по счёту доска этого размера, с 1. */
  copy: number;
  nest: NestResult;
  /** Сколько деталей на неё легло. */
  pieces: number;
}

export interface InventoryPlan {
  /** Свои доски, которые пошли в дело. */
  used: InventoryUse[];
  /** Раскрой того, чего не хватило, по покупной доске. */
  toBuy: NestResult;
  /** Досок докупить, всего. */
  boardsToBuy: number;
  /** Досок своих задействовано. */
  boardsFromStock: number;
  /** Детали, которые не влезают ни в свою доску, ни в покупную. */
  unplaced: NestPiece[];
  /** Какая доля деталей закрыта собственным материалом, %. */
  coveredPct: number;
}

export const INVENTORY_LIMIT = 40;

function newBoardId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
}

export function createInventoryBoard(patch: Partial<InventoryBoard> = {}): InventoryBoard {
  return sanitizeInventoryBoard({ id: newBoardId(), ...patch });
}

export function sanitizeInventoryBoard(input: unknown): InventoryBoard {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const number = (value: unknown, fallback: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
  };
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : newBoardId(),
    speciesId: typeof raw.speciesId === 'string' ? raw.speciesId.slice(0, 40) : '',
    lengthMm: number(raw.lengthMm, 2000, 12_000),
    widthMm: number(raw.widthMm, 150, 2000),
    count: Math.floor(number(raw.count, 1, 999)),
  };
}

export function sanitizeInventory(input: unknown): InventoryBoard[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, INVENTORY_LIMIT).map(sanitizeInventoryBoard);
}

/**
 * Разложить детали сначала по своим доскам, остальное — под покупку.
 *
 * `purchase` — размер доски, которую мастерская купит, если своего не хватит:
 * тот же, что выбран в карте раскроя.
 */
export function planFromInventory(
  pieces: NestPiece[],
  inventory: InventoryBoard[],
  purchase: StockBoard,
  kerfMm: number
): InventoryPlan {
  const clean = sanitizeInventory(inventory);
  let remaining = [...pieces];
  const used: InventoryUse[] = [];

  // Большие доски первыми: короткая деталь влезет и в обрезок, длинная — нет.
  const queue = [...clean].sort(
    (a, b) => b.lengthMm * b.widthMm - a.lengthMm * a.widthMm || b.lengthMm - a.lengthMm
  );

  for (const board of queue) {
    for (let copy = 1; copy <= board.count; copy += 1) {
      if (remaining.length === 0) break;
      const forThisSpecies = remaining.filter((piece) => piece.speciesId === board.speciesId);
      if (forThisSpecies.length === 0) break;

      const nest = nestPieces(
        forThisSpecies,
        { lengthMm: board.lengthMm, widthMm: board.widthMm },
        kerfMm,
        { maxBoards: 1 }
      );
      const placedIds = new Set(
        nest.boards.flatMap((sheet) => sheet.pieces.map((piece) => piece.pieceId))
      );
      if (placedIds.size === 0) break;

      used.push({ board, copy, nest, pieces: placedIds.size });
      remaining = remaining.filter((piece) => !placedIds.has(piece.pieceId));
    }
  }

  const toBuy = nestPieces(remaining, purchase, kerfMm);
  const placedTotal = pieces.length - remaining.length;

  return {
    used,
    toBuy,
    boardsToBuy: toBuy.boards.length,
    boardsFromStock: used.length,
    unplaced: toBuy.unplaced,
    coveredPct: pieces.length > 0 ? (placedTotal / pieces.length) * 100 : 0,
  };
}
