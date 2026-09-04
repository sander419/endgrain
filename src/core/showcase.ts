/**
 * Витрина мастерской: что она показывает клиенту.
 *
 * Это не магазин. Деньги здесь не ходят: ни кассы, ни эквайринга, ни чужих
 * персональных данных. Витрина отдаётся одним самодостаточным HTML-файлом,
 * который мастерская кладёт куда хочет — на свой хостинг, в Тильду, в канал,
 * картинками в Авито. Мы ничего не поддерживаем и ни за что не отвечаем.
 *
 * Почему так, а не «настоящий магазин». Приём денег в России — это онлайн-касса
 * по 54-ФЗ, эквайринг, юрлицо, работа с персональными данными и возвратами.
 * Отдельный бизнес с постоянными расходами, а не функция приложения. И он
 * ломает то, чем инструмент продаётся: нет бэкенда, нет аккаунтов, данные
 * не уходят никуда. Мастерские и сегодня продают через мессенджеры и Авито —
 * им не хватает не платёжки, а приличной карточки с расчётом вместо фотографии
 * на верстаке.
 *
 * Карточка — проекция того, что уже посчитано: размеры, породы, масса, цена,
 * номер рецепта. Ровно как печатная инструкция и коммерческое предложение.
 */

import { readJson, writeJson } from './storage';

export interface ShowcaseItem {
  id: string;
  /** Заголовок карточки. Пусто — подставится размер с породами. */
  title: string;
  /** Описание своими словами: для кого, чем хороша. */
  description: string;
  /** Снимок доски, data URI. Хранится сжатым — иначе не влезет хранилище. */
  imageDataUri: string;
  /** Короткий код рецепта: по нему мастерская находит доску у себя. */
  code: string;
  /** Весь проект строкой — чтобы повторить доску даже через год. */
  dna: string;
  mode: 'recipe' | 'mosaic';
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  massKg: number;
  /** Породы, как их называют человеку. */
  species: string[];
  priceRub: number;
  /** Срок изготовления словами: «2 недели», «под заказ». */
  leadTime: string;
  /** Снято с витрины — остаётся в списке, но в файл не попадает. */
  hidden: boolean;
}

export const SHOWCASE_STORAGE_KEY = 'endgrain.showcase.v1';

/**
 * Двадцать четыре карточки — предел не интерфейса, а хранилища: картинки
 * лежат в `localStorage`, и это единственное место в проекте, где место
 * реально может кончиться.
 */
export const MAX_SHOWCASE_ITEMS = 24;

/**
 * Предел картинки в карточке. Снимок 560 px в JPEG весит 40–80 КБ, то есть
 * около 100 тысяч символов data URI; 120 тысяч — запас. Прежние 400 тысяч
 * позволяли двум десяткам карточек занять 9 МБ, вдвое больше всей квоты.
 */
export const MAX_ITEM_IMAGE_CHARS = 120_000;

/**
 * Сколько всего может весить витрина. Проверяется при загрузке чужого файла:
 * список, который заведомо не сохранится, лучше обрезать сразу, чем принять
 * и потерять при первой же перезагрузке.
 */
export const MAX_SHOWCASE_CHARS = 1_600_000;

const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function positive(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
}

export function sanitizeShowcaseItem(input: unknown): ShowcaseItem {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  // Картинка не обрезается по длине: обрезанный data URI остаётся похожим
  // на картинку, проходит проверку формата и рисуется мусором.
  const image = typeof raw.imageDataUri === 'string' ? raw.imageDataUri.trim() : '';
  const imageOk = image.length <= MAX_ITEM_IMAGE_CHARS && IMAGE_PATTERN.test(image);

  const species = Array.isArray(raw.species)
    ? raw.species
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  return {
    id: text(raw.id, 64) || newId(),
    title: text(raw.title, 120),
    description: text(raw.description, 600),
    imageDataUri: imageOk ? image : '',
    code: text(raw.code, 8),
    dna: text(raw.dna, 32 * 1024),
    mode: raw.mode === 'recipe' ? 'recipe' : 'mosaic',
    lengthMm: positive(raw.lengthMm, 5000),
    widthMm: positive(raw.widthMm, 5000),
    thicknessMm: positive(raw.thicknessMm, 500),
    massKg: positive(raw.massKg, 500),
    species,
    priceRub: positive(raw.priceRub, 10_000_000),
    leadTime: text(raw.leadTime, 60),
    hidden: raw.hidden === true,
  };
}

export function createShowcaseItem(patch: Partial<ShowcaseItem> = {}): ShowcaseItem {
  return sanitizeShowcaseItem({ id: newId(), ...patch });
}

/** Заголовок карточки: свой, если задан, иначе размер с породами. */
export function itemTitle(item: ShowcaseItem): string {
  if (item.title.trim()) return item.title.trim();
  const size = `${Math.round(item.lengthMm)} × ${Math.round(item.widthMm)} мм`;
  return item.species.length ? `Доска ${size}, ${item.species.join(' и ').toLowerCase()}` : `Доска ${size}`;
}

export function loadShowcase(): ShowcaseItem[] {
  const parsed = readJson(SHOWCASE_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, MAX_SHOWCASE_ITEMS).map(sanitizeShowcaseItem);
}

export interface SaveResult {
  items: ShowcaseItem[];
  /** Хранилище переполнено: карточки живут только до перезагрузки. */
  overflow: boolean;
}

/**
 * Сохранение отдельно сообщает о переполнении. Это единственное место
 * в проекте, где место в `localStorage` реально кончается — картинки, —
 * и молчать об этом нельзя: мастерская соберёт витрину, закроет вкладку
 * и обнаружит пустоту.
 */
export function saveShowcase(items: ShowcaseItem[]): SaveResult {
  const clean = items.slice(0, MAX_SHOWCASE_ITEMS).map(sanitizeShowcaseItem);
  return { items: clean, overflow: !writeJson(SHOWCASE_STORAGE_KEY, clean) };
}

/**
 * Обрезать список по весу: карточки берутся по порядку, пока помещаются.
 * Порядок задаёт мастерская, поэтому отбрасываются последние, а не случайные.
 */
export function fitShowcase(items: ShowcaseItem[]): ShowcaseItem[] {
  const kept: ShowcaseItem[] = [];
  let total = 0;
  for (const item of items) {
    const weight = item.imageDataUri.length + 400;
    if (total + weight > MAX_SHOWCASE_CHARS) break;
    total += weight;
    kept.push(item);
  }
  return kept;
}

export function addShowcaseItem(items: ShowcaseItem[], item: ShowcaseItem): ShowcaseItem[] {
  return [...items, sanitizeShowcaseItem(item)].slice(0, MAX_SHOWCASE_ITEMS);
}

export function updateShowcaseItem(
  items: ShowcaseItem[],
  id: string,
  patch: Partial<ShowcaseItem>
): ShowcaseItem[] {
  return items.map((item) => (item.id === id ? sanitizeShowcaseItem({ ...item, ...patch }) : item));
}

export function removeShowcaseItem(items: ShowcaseItem[], id: string): ShowcaseItem[] {
  return items.filter((item) => item.id !== id);
}

/** Порядок в файле задаёт мастерская: что первым, то и увидят. */
export function moveShowcaseItem(items: ShowcaseItem[], id: string, delta: number): ShowcaseItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return items;
  const target = Math.max(0, Math.min(items.length - 1, index + delta));
  if (target === index) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/** В файл идут только показанные карточки. */
export function visibleItems(items: ShowcaseItem[]): ShowcaseItem[] {
  return items.filter((item) => !item.hidden);
}

/** Сколько примерно весит витрина. Показывается человеку до выгрузки. */
export function showcaseWeightBytes(items: ShowcaseItem[]): number {
  return visibleItems(items).reduce((sum, item) => sum + item.imageDataUri.length, 0);
}

export function exportShowcase(items: ShowcaseItem[]): string {
  return JSON.stringify({ kind: 'endgrain.showcase', version: 1, items }, null, 2);
}

export function importShowcase(json: string): ShowcaseItem[] | null {
  try {
    const parsed = JSON.parse(json) as { kind?: string; items?: unknown };
    if (parsed?.kind !== 'endgrain.showcase' || !Array.isArray(parsed.items)) return null;
    return fitShowcase(parsed.items.slice(0, MAX_SHOWCASE_ITEMS).map(sanitizeShowcaseItem));
  } catch {
    return null;
  }
}
