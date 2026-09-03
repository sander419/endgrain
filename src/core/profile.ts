/**
 * Профиль мастерской: всё, что относится к конкретной мастерской, а не к доске.
 *
 * До этого модуля настройки лежали тремя отдельными ключами в localStorage —
 * станки (`endgrain.workshop.v1`), ставки (`endgrain.rates.v1`) и покупная
 * доска (`endgrain.stock`), — и функция чтения станков жила прямо в компоненте.
 * Пока это была настройка «для себя», разницы не было. Как только мастерская
 * платит за инструмент, разница появляется: профиль надо уметь перенести
 * на второй компьютер, отдать сменщику и не потерять при чистке браузера.
 * Три ключа в трёх местах так не переносятся.
 *
 * Старые ключи читаются при первом запуске и не удаляются: обновление
 * приложения не должно обнулять то, что человек уже настроил.
 */
import { DEFAULT_RATES, type WorkshopRates } from './economics';
import { DEFAULT_STOCK } from './stock';
import { DEFAULT_TOOLS, type ToolId, TOOLS } from './workshop';
import type { StockBoard } from './nesting';
import { sanitizeInventory, type InventoryBoard } from './inventory';

export const PROFILE_STORAGE_KEY = 'endgrain.profile.v1';

/** Ключи, которыми настройки хранились до объединения. Читаются, не пишутся. */
const LEGACY_KEYS = {
  tools: 'endgrain.workshop.v1',
  rates: 'endgrain.rates.v1',
  stock: 'endgrain.stock',
} as const;

export interface WorkshopProfile {
  version: 1;
  /** Название мастерской. Идёт в шапку документов клиенту. */
  name: string;
  /** Телефон, почта или ссылка — то, по чему клиент вернётся. */
  contact: string;
  /** Логотип как data URI. Пусто — документы обходятся названием. */
  logoDataUri: string;
  tools: ToolId[];
  rates: WorkshopRates;
  /** Размер доски, которую мастерская покупает, когда своей не хватает. */
  stock: StockBoard;
  /** Что уже лежит на складе. Пусто — считаем, что покупается всё. */
  inventory: InventoryBoard[];
}

export const DEFAULT_PROFILE: WorkshopProfile = {
  version: 1,
  name: '',
  contact: '',
  logoDataUri: '',
  tools: DEFAULT_TOOLS,
  rates: DEFAULT_RATES,
  stock: DEFAULT_STOCK,
  inventory: [],
};

/**
 * Логотип попадает в `<img src>` печатного листа, то есть в DOM.
 *
 * SVG сюда не пускается сознательно. Профиль — файл, которым мастерские
 * будут обмениваться («пришли свой, я подставлю название»), а SVG это документ
 * со скриптами и внешними ссылками внутри. В `<img>` браузеры скрипты из него
 * не исполняют, но полагаться на это в файле, пришедшем со стороны, незачем:
 * растровый логотип решает ту же задачу и ничего не умеет.
 */
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** 256 КБ хватает логотипу с запасом, а localStorage обычно отдаёт 5 МБ на всё. */
export const MAX_LOGO_CHARS = 256 * 1024;

const TOOL_IDS = new Set<string>(TOOLS.map((tool) => tool.id));

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function positive(value: unknown, fallback: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(num, max);
}

function nonNegative(value: unknown, fallback: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(num, max);
}

/**
 * Разбор чужого профиля. Тот же принцип, что в `sanitize.ts`: всё, что пришло
 * извне, проверяется до того, как попасть в состояние. Кривое поле заменяется
 * умолчанием, а не роняет загрузку — иначе одна опечатка в файле стоила бы
 * мастерской всех настроек сразу.
 */
export function sanitizeProfile(input: unknown): WorkshopProfile {
  if (!input || typeof input !== 'object') return { ...DEFAULT_PROFILE };
  const raw = input as Record<string, unknown>;
  const rates = (raw.rates ?? {}) as Record<string, unknown>;
  const stock = (raw.stock ?? {}) as Record<string, unknown>;

  const tools = Array.isArray(raw.tools)
    ? [...new Set(raw.tools.filter((id): id is ToolId => typeof id === 'string' && TOOL_IDS.has(id)))]
    : DEFAULT_PROFILE.tools;

  // Логотип не обрезается по длине, как остальные строки: обрезанный data URI
  // остаётся похожим на картинку и проходит проверку формата, но рисуется
  // мусором. Слишком большой отбрасывается целиком.
  const logo = typeof raw.logoDataUri === 'string' ? raw.logoDataUri.trim() : '';
  const logoOk = logo.length <= MAX_LOGO_CHARS && LOGO_PATTERN.test(logo);

  return {
    version: 1,
    name: text(raw.name, 120),
    contact: text(raw.contact, 200),
    logoDataUri: logoOk ? logo : '',
    tools,
    rates: {
      hourlyRateRub: nonNegative(rates.hourlyRateRub, DEFAULT_RATES.hourlyRateRub, 1_000_000),
      consumablesRub: nonNegative(rates.consumablesRub, DEFAULT_RATES.consumablesRub, 1_000_000),
      utilitiesRub: nonNegative(rates.utilitiesRub, DEFAULT_RATES.utilitiesRub, 1_000_000),
      overheadPct: nonNegative(rates.overheadPct, DEFAULT_RATES.overheadPct, 1000),
      targetMarginPct: nonNegative(rates.targetMarginPct, DEFAULT_RATES.targetMarginPct, 10_000),
    },
    stock: {
      lengthMm: positive(stock.lengthMm, DEFAULT_STOCK.lengthMm, 12_000),
      widthMm: positive(stock.widthMm, DEFAULT_STOCK.widthMm, 2000),
    },
    inventory: sanitizeInventory(raw.inventory),
  };
}

function readLegacy(): WorkshopProfile {
  const profile: WorkshopProfile = { ...DEFAULT_PROFILE };
  try {
    const tools = localStorage.getItem(LEGACY_KEYS.tools);
    const rates = localStorage.getItem(LEGACY_KEYS.rates);
    const stock = localStorage.getItem(LEGACY_KEYS.stock);
    if (tools) profile.tools = JSON.parse(tools) as ToolId[];
    if (rates) profile.rates = { ...DEFAULT_RATES, ...(JSON.parse(rates) as WorkshopRates) };
    if (stock) profile.stock = JSON.parse(stock) as StockBoard;
  } catch {
    /* битые старые ключи — берём умолчания, а не падаем */
  }
  return sanitizeProfile(profile);
}

export function loadProfile(): WorkshopProfile {
  try {
    const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (saved) return sanitizeProfile(JSON.parse(saved));
  } catch {
    /* приватный режим или битый профиль — ниже подхватим старые ключи */
  }
  return readLegacy();
}

export function saveProfile(profile: WorkshopProfile): WorkshopProfile {
  const clean = sanitizeProfile(profile);
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* приватный режим или переполненное хранилище: работать не мешает */
  }
  return clean;
}

export function patchProfile(patch: Partial<WorkshopProfile>): WorkshopProfile {
  return saveProfile({ ...loadProfile(), ...patch });
}

/** Файл для переноса на другой компьютер. Читается человеком — отсюда отступы. */
export function exportProfile(profile: WorkshopProfile): string {
  return JSON.stringify(sanitizeProfile(profile), null, 2);
}

/**
 * Возвращает `null`, если это вообще не профиль: пустая заготовка вместо
 * настроек молча стёрла бы то, что у человека уже было.
 */
export function importProfile(json: string): WorkshopProfile | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const looksLikeProfile =
      'rates' in parsed || 'tools' in parsed || 'stock' in parsed || 'name' in parsed;
    if (!looksLikeProfile) return null;
    return sanitizeProfile(parsed);
  } catch {
    return null;
  }
}

/** Название для документов: своё, если задано, иначе имя из лицензии. */
export function documentTitle(profile: WorkshopProfile, licensedTo?: string): string {
  return profile.name.trim() || licensedTo?.trim() || '';
}
