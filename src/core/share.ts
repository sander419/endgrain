import type { Recipe } from './types';

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
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = base64.length % 4;
  const padded = padLength > 0 ? base64 + '='.repeat(4 - padLength) : base64;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** В ссылку едут только те породы, которые реально лежат в щите. */
function pruneSpecies(recipe: Recipe): Recipe {
  const used = new Set(recipe.panel.strips.map((strip) => strip.speciesId));
  const species: Recipe['species'] = {};
  for (const id of used) {
    const found = recipe.species[id];
    if (found) species[id] = found;
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
    return parsed as BoardDna;
  } catch { return null; }
}

export function buildShareUrl(recipe: Recipe, seed?: number): string {
  if (typeof window === 'undefined') return '';
  const dna = encodeBoardDna({ v: 1, seed, recipe });
  return `${window.location.origin}${window.location.pathname}#dna=${dna}`;
}

export function readDnaFromLocation(): BoardDna | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(/dna=([^&]+)/);
  if (!match) return null;
  return decodeBoardDna(match[1]);
}
