/**
 * Журнал факта: сколько на самом деле ушло времени и денег.
 *
 * Нормативы времени в `economics.ts` честно помечены оценкой для мастерской-
 * одиночки. Это лучшее, что можно сказать про чужую мастерскую, и худшее,
 * на чём можно строить цену. Разница между «3 минуты на брусок» и «4.6» —
 * это восемнадцать процентов цены доски, то есть вся прибыль.
 *
 * Журнал закрывает разрыв единственным работающим способом: мастерская
 * записывает, сколько вышло на самом деле, и нормативы становятся её.
 * Это же единственное, что нельзя форкнуть вместе с исходниками, — их данные.
 *
 * ЧТО ЗАПИСЫВАЕТСЯ. Общее время и общий материал, а не время по операциям.
 * Разбивку никто не ведёт: человек у станка не переключает секундомер между
 * фугованием и склейкой. Отсюда и модель калибровки — один множитель на все
 * нормативы, и об этом сказано прямо, а не спрятано в формуле.
 *
 * Прямой родственник журнала замеров глазури в КРУГе, включая его урок:
 * модель данных и запись сделать сразу, экран со списком и фильтром отложить.
 */
import { DEFAULT_TIME_NORMS, type TimeNorms } from './economics';
import { readJson, writeJson, type Stored } from './storage';

export interface FactEntry {
  id: string;
  /** День, когда доска доделана, ISO. */
  date: string;
  /** Заказ, если делали по заказу. Пусто — для себя или в запас. */
  orderId: string;
  /** Короткий код рецепта: по нему запись сходится с доской. */
  code: string;
  summary: string;
  /** Сколько досок сделано за эту запись. */
  count: number;
  /** Что показывал расчёт в момент записи, мин на всё. */
  plannedMin: number;
  /** Сколько ушло на самом деле, мин на всё. */
  actualMin: number;
  plannedMaterialRub: number;
  actualMaterialRub: number;
  note: string;
}

export const FACTLOG_STORAGE_KEY = 'endgrain.factlog.v1';
export const MAX_FACT_ENTRIES = 500;

/**
 * Ниже этого числа досок множитель показывается, но нормативом не называется.
 * Пять — не статистика, но уже и не одна случайная суббота.
 */
export const CONFIDENT_BOARDS = 5;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
}

function positive(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
}

function isoDay(value: unknown): string {
  const day = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

export function sanitizeFactEntry(input: unknown): FactEntry {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const text = (value: unknown, limit: number) =>
    typeof value === 'string' ? value.trim().slice(0, limit) : '';
  const count = Number(raw.count);

  return {
    id: text(raw.id, 64) || newId(),
    date: isoDay(raw.date),
    orderId: text(raw.orderId, 64),
    code: text(raw.code, 8),
    summary: text(raw.summary, 200),
    count: Number.isFinite(count) && count > 0 ? Math.min(Math.floor(count), 999) : 1,
    // Часы в минутах: 20 000 минут это две недели непрерывной работы,
    // выше — почти наверняка опечатка на порядок.
    plannedMin: positive(raw.plannedMin, 20_000),
    actualMin: positive(raw.actualMin, 20_000),
    plannedMaterialRub: positive(raw.plannedMaterialRub, 10_000_000),
    actualMaterialRub: positive(raw.actualMaterialRub, 10_000_000),
    note: text(raw.note, 500),
  };
}

export function createFactEntry(patch: Partial<FactEntry> = {}): FactEntry {
  return sanitizeFactEntry({ id: newId(), ...patch });
}

export function loadFactLog(): FactEntry[] {
  const parsed = readJson(FACTLOG_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, MAX_FACT_ENTRIES).map(sanitizeFactEntry);
}

export function saveFactLog(entries: FactEntry[]): Stored<FactEntry[]> {
  const value = entries.slice(0, MAX_FACT_ENTRIES).map(sanitizeFactEntry);
  return { value, saved: writeJson(FACTLOG_STORAGE_KEY, value) };
}

export function addFactEntry(entries: FactEntry[], entry: FactEntry): FactEntry[] {
  return [sanitizeFactEntry(entry), ...entries].slice(0, MAX_FACT_ENTRIES);
}

export function removeFactEntry(entries: FactEntry[], id: string): FactEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export interface FactSummary {
  entries: number;
  boards: number;
  plannedMin: number;
  actualMin: number;
  plannedMaterialRub: number;
  actualMaterialRub: number;
  /** Во сколько раз факт отличается от плана по времени. Больше 1 — недооценка. */
  timeRatio: number;
  /** То же по материалу. */
  materialRatio: number;
  /** Нормативы, растянутые множителем времени. */
  suggested: TimeNorms;
  /** Хватает ли записей, чтобы называть это нормативом, а не наблюдением. */
  confident: boolean;
}

/**
 * Свод по журналу.
 *
 * Записи с нулевым планом в отношение не берутся: делить на ноль нечем,
 * а выкидывать такую запись целиком нельзя — доски в ней настоящие.
 */
export function summariseFactLog(
  entries: FactEntry[],
  norms: TimeNorms = DEFAULT_TIME_NORMS
): FactSummary {
  let boards = 0;
  // Доски, которые реально участвуют в множителе. Считать уверенность
  // по всем записям было бы обманом: пять досок без плана и одна с планом
  // дали бы «норматив», выведенный из одного замера.
  let measuredBoards = 0;
  let plannedMin = 0;
  let actualMin = 0;
  let plannedMaterialRub = 0;
  let actualMaterialRub = 0;

  for (const entry of entries) {
    boards += entry.count;
    if (entry.plannedMin > 0 && entry.actualMin > 0) {
      plannedMin += entry.plannedMin;
      actualMin += entry.actualMin;
      measuredBoards += entry.count;
    }
    if (entry.plannedMaterialRub > 0 && entry.actualMaterialRub > 0) {
      plannedMaterialRub += entry.plannedMaterialRub;
      actualMaterialRub += entry.actualMaterialRub;
    }
  }

  const timeRatio = plannedMin > 0 ? actualMin / plannedMin : 1;
  const materialRatio = plannedMaterialRub > 0 ? actualMaterialRub / plannedMaterialRub : 1;

  return {
    entries: entries.length,
    boards,
    plannedMin,
    actualMin,
    plannedMaterialRub,
    actualMaterialRub,
    timeRatio,
    materialRatio,
    suggested: calibrateNorms(norms, timeRatio),
    confident: measuredBoards >= CONFIDENT_BOARDS,
  };
}

/**
 * Растянуть нормативы одним множителем.
 *
 * Множитель один на все операции сознательно: журнал знает только общее время,
 * и раскидывать его по операциям в какой-то придуманной пропорции значило бы
 * выдать догадку за замер. Множитель зажат в разумные пределы — вдвое быстрее
 * или впятеро медленнее норматива бывает, но чаще это опечатка в поле.
 */
export function calibrateNorms(norms: TimeNorms, ratio: number): TimeNorms {
  const factor = Number.isFinite(ratio) && ratio > 0 ? Math.min(Math.max(ratio, 0.5), 5) : 1;
  const round = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    perStripMin: round(norms.perStripMin),
    perGlueUpMin: round(norms.perGlueUpMin),
    perCrosscutMin: round(norms.perCrosscutMin),
    perSquareDmMin: round(norms.perSquareDmMin),
    finishingMin: round(norms.finishingMin),
  };
}

export function exportFactLog(entries: FactEntry[]): string {
  return JSON.stringify({ kind: 'endgrain.factlog', version: 1, entries }, null, 2);
}

export function importFactLog(json: string): FactEntry[] | null {
  try {
    const parsed = JSON.parse(json) as { kind?: string; entries?: unknown };
    if (parsed?.kind !== 'endgrain.factlog' || !Array.isArray(parsed.entries)) return null;
    return parsed.entries.slice(0, MAX_FACT_ENTRIES).map(sanitizeFactEntry);
  } catch {
    return null;
  }
}
