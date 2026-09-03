/**
 * Локализация: механизм есть, язык пока один.
 *
 * Зачем он сейчас, когда рынок русский. Строка, написанная прямо в JSX,
 * стоит дёшево ровно один раз — в момент написания. Дальше она стоит перебора
 * десяти тысяч строк кода, когда язык понадобится, и в этом переборе теряются
 * как раз редкие строки: сообщение об ошибке, которое видно раз в месяц,
 * подпись в печатном листе. Поэтому правило простое: **новая строка, видимая
 * пользователю, идёт через словарь**. Старые не переносим — это отдельная
 * работа, и она не приближает первую продажу.
 *
 * Ключи типизированы формой русского словаря, поэтому опечатка в ключе —
 * ошибка компиляции, а не пустое место на экране. По той же причине английский
 * словарь нельзя будет добавить с пропущенным ключом.
 */
import { ru } from '../i18n/ru';

export type Lang = 'ru' | 'en';

/** Строка или тройка форм счётного слова: 1 доска / 2 доски / 5 досок. */
export type Phrase = string | readonly [string, string, string];

export type TranslationKey = keyof typeof ru;

/** Словарь другого языка обязан покрыть все ключи русского. */
export type Dictionary = { readonly [K in TranslationKey]: Phrase };

const DICTIONARIES: Partial<Record<Lang, Dictionary>> = { ru };

let current: Lang = 'ru';

export function getLang(): Lang {
  return current;
}

/**
 * Язык, для которого словаря ещё нет, молча остаётся русским: пустой экран
 * хуже непереведённого.
 */
export function setLang(lang: Lang): Lang {
  current = DICTIONARIES[lang] ? lang : 'ru';
  return current;
}

export function hasDictionary(lang: Lang): boolean {
  return DICTIONARIES[lang] !== undefined;
}

function dictionary(): Dictionary {
  return DICTIONARIES[current] ?? ru;
}

/**
 * Выбор формы счётного слова. Правило зависит от языка, а не от строки,
 * поэтому живёт здесь, а не рядом с каждым вызовом.
 */
export function pluralIndex(lang: Lang, count: number): 0 | 1 | 2 {
  if (lang === 'en') return Math.abs(count) === 1 ? 0 : 2;
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return 2;
  if (mod10 === 1) return 0;
  if (mod10 >= 2 && mod10 <= 4) return 1;
  return 2;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}

/**
 * Перевод по ключу. Подстановки — `{name}` в тексте.
 *
 * Если ключ указывает на счётное слово, вернуть его строкой нечестно:
 * без числа форма не выбирается. В этом случае отдаём ключ — так пропуск
 * виден на экране и ловится глазами, а не превращается в правдоподобный мусор.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const phrase = dictionary()[key];
  if (typeof phrase !== 'string') return key;
  return interpolate(phrase, params);
}

/**
 * Счётное слово: `tn('unit.board', 3)` → «доски».
 * Само число не подставляется — его формат решает вызывающий код.
 */
export function tn(key: TranslationKey, count: number): string {
  const phrase = dictionary()[key];
  if (typeof phrase === 'string') return phrase;
  return phrase[pluralIndex(current, count)];
}

/** `3 доски` одной строкой — самый частый случай. */
export function tcount(key: TranslationKey, count: number): string {
  return `${count} ${tn(key, count)}`;
}
