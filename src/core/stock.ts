/**
 * Размер покупной доски. Живёт отдельно от компонентов: его выбирают в карте
 * раскроя, а печатный лист должен уносить в мастерскую те же цифры.
 */
import type { StockBoard } from './nesting';

const STORAGE_KEY = 'endgrain.stock';
const DEFAULT_STOCK: StockBoard = { lengthMm: 2000, widthMm: 150 };

export function loadStock(): StockBoard {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as StockBoard;
      if (parsed.lengthMm > 0 && parsed.widthMm > 0) return parsed;
    }
  } catch {
    /* битый localStorage — берём ходовой размер */
  }
  return DEFAULT_STOCK;
}

export function saveStock(stock: StockBoard): StockBoard {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stock));
  } catch {
    /* приватный режим */
  }
  return stock;
}
