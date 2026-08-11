/**
 * Избранные рисунки: отложить понравившееся и экспериментировать дальше,
 * не боясь потерять удачный вариант.
 *
 * Хранится в localStorage вместе с миниатюрой (data-URL). Миниатюра нужна,
 * потому что перерисовать рисунок по клеткам дороже, чем показать картинку,
 * а галерея должна открываться мгновенно.
 */
import type { Mosaic } from './mosaic';

export interface Favorite {
  id: string;
  title: string;
  /** Момент сохранения, миллисекунды epoch. */
  savedAt: number;
  mosaic: Mosaic;
  /** PNG data-URL небольшой превьюшки. */
  thumbnail: string;
  /** Пометки для списка: сколько щитов и какой размер получается. */
  summary: string;
}

const STORAGE_KEY = 'endgrain.favorites.v1';
/** Больше держать в localStorage опасно: там всего около 5 МБ на домен. */
export const FAVORITES_LIMIT = 24;

export function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Favorite =>
        !!item && typeof item.id === 'string' && !!item.mosaic && Array.isArray(item.mosaic.cells)
    );
  } catch {
    return [];
  }
}

function persist(favorites: Favorite[]): Favorite[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Переполнили квоту — выбрасываем самые старые и пробуем ещё раз.
    const trimmed = favorites.slice(0, Math.max(1, Math.floor(favorites.length / 2)));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return favorites;
    }
  }
  return favorites;
}

export function addFavorite(
  current: Favorite[],
  entry: Omit<Favorite, 'id' | 'savedAt'>
): Favorite[] {
  const favorite: Favorite = {
    ...entry,
    id: `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: Date.now(),
  };
  return persist([favorite, ...current].slice(0, FAVORITES_LIMIT));
}

export function removeFavorite(current: Favorite[], id: string): Favorite[] {
  return persist(current.filter((item) => item.id !== id));
}

export function renameFavorite(current: Favorite[], id: string, title: string): Favorite[] {
  return persist(current.map((item) => (item.id === id ? { ...item, title } : item)));
}
