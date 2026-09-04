import type { Recipe } from './types';
import { sanitizeRecipe } from './sanitize';

export interface BoardDna {
  v: 1;
  seed?: number;
  recipe: Recipe;
}

/**
 * UTF-8 → base64url напрямую. Вариант `btoa(encodeURIComponent(s))` раздувал
 * каждую кириллическую букву втрое до base64, и ссылка на рецепт с русскими
 * названиями пород переваливала за 3500 символов — такие URL режут мессенджеры.
 */
export function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = base64.length % 4;
  const padded = padLength > 0 ? base64 + '='.repeat(4 - padLength) : base64;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * В ссылку едут только использованные породы и только те их поля, которые
 * пользователь мог изменить. Справочное — латинское название, твёрдость,
 * усушка, источник — восстанавливается из каталога приложения по id: эти
 * данные одинаковы у всех и в ссылке занимали бы больше места, чем сам рецепт.
 */
function pruneSpecies(recipe: Recipe): Recipe {
  const used = new Set(recipe.panel.strips.map((strip) => strip.speciesId));
  const species: Recipe['species'] = {};
  for (const id of used) {
    const found = recipe.species[id];
    if (!found) continue;
    species[id] = {
      id: found.id,
      name: found.name,
      colorHex: found.colorHex,
      densityKgM3: found.densityKgM3,
      pricePerCubicMeter: found.pricePerCubicMeter,
    };
  }
  return { ...recipe, species };
}

export function encodeBoardDna(dna: BoardDna): string {
  return toBase64Url(JSON.stringify({ ...dna, recipe: pruneSpecies(dna.recipe) }));
}

export function decodeBoardDna(code: string): BoardDna | null {
  try {
    const json = fromBase64Url(code);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== 1) return null;
    if (!parsed.recipe || typeof parsed.recipe !== 'object') return null;
    // Ссылку присылают в чате: числа и цвета из неё зажимаем до того, как они
    // попадут в расчёт и в разметку. Подробности — в core/sanitize.ts.
    return { ...parsed, recipe: sanitizeRecipe(parsed.recipe as Recipe) } as BoardDna;
  } catch { return null; }
}

export function buildShareUrl(recipe: Recipe, seed?: number): string {
  if (typeof window === 'undefined') return '';
  const dna = encodeBoardDna({ v: 1, seed, recipe });
  // ?mode=recipe обязателен: если у получателя ссылки в localStorage с прошлого
  // визита стоит режим «Мозаика», страница поднимется в нём, а рецепт из хэша
  // загрузится в состояние молча — интерфейс останется на мозаике, будто
  // ссылка не сработала.
  return `${window.location.origin}${window.location.pathname}?mode=recipe#dna=${dna}`;
}

export function readDnaFromLocation(): BoardDna | null {
  if (typeof window === 'undefined') return null;
  // Якорь обязателен: без него `#mdna=…` от мозаики попадает под `dna=`,
  // и рецепт пытается разобрать чужой формат.
  const match = window.location.hash.match(/(?:^|[#&])dna=([^&]+)/);
  if (!match) return null;
  return decodeBoardDna(match[1]);
}
