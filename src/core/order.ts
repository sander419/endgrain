/**
 * Заказы: кому, сколько, к какому сроку и за сколько договорились.
 *
 * Это не CRM. Здесь нет воронок, задач, напоминаний и статистики по менеджерам —
 * мастерская-одиночка от такого только устаёт. Здесь ровно то, что забывается
 * между звонком и склейкой: какую именно доску обещали, сколько штук, когда
 * и по какой цене. Всё остальное живёт в телефоне и в голове, и пусть живёт.
 *
 * Доска хранится строкой Board DNA — тем же кодом, что уезжает в ссылку.
 * Так заказ переживает любые правки приложения: пока `share.ts` умеет читать
 * свою же строку, прошлогодний заказ откроется.
 */
import { fromBase64Url } from './share';

export type OrderStatus = 'draft' | 'quoted' | 'accepted' | 'inWork' | 'done' | 'cancelled';

export const ORDER_STATUSES: OrderStatus[] = [
  'draft',
  'quoted',
  'accepted',
  'inWork',
  'done',
  'cancelled',
];

/** Статусы, при которых заказ ещё чего-то ждёт от мастерской. */
export const OPEN_STATUSES: OrderStatus[] = ['draft', 'quoted', 'accepted', 'inWork'];

export interface Order {
  id: string;
  /** Дата создания, ISO-день. */
  createdAt: string;
  /** Срок, ISO-день. Пусто — без срока. */
  dueAt: string;
  customer: string;
  /** Что просили словами: порода, надпись, особые пожелания. */
  note: string;
  count: number;
  /** Весь проект доски строкой. Пусто — заказ без привязанной доски. */
  dna: string;
  mode: 'recipe' | 'mosaic';
  /** Что показывать в списке: «525 × 525 · мандала · клён, орех». */
  summary: string;
  /**
   * Согласованная цена за штуку. Отдельно от расчётной: расчёт подсказывает,
   * а договорились всегда о конкретном числе, и именно оно идёт в документы.
   */
  pricePerBoardRub: number;
  status: OrderStatus;
}

export const ORDERS_STORAGE_KEY = 'endgrain.orders.v1';

/** Больше двухсот заказов в localStorage держать незачем — это не база. */
export const MAX_ORDERS = 200;
/** Мозаика 21×21 в ДНК укладывается на порядок меньше. */
export const MAX_DNA_CHARS = 32 * 1024;

export function newOrderId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Старый браузер или небезопасный контекст: идентификатор нужен только
    // для различения строк в одном списке, криптостойкость тут ни при чём.
    return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function todayIso(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function isoDay(value: unknown): string {
  const day = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

/**
 * Разбор заказа из хранилища или из чужого файла. Как и профиль, кривое поле
 * заменяется разумным, а не роняет весь архив: потерять двести заказов из-за
 * одной опечатки — цена, которую никто не согласится платить.
 */
export function sanitizeOrder(input: unknown): Order {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const status = ORDER_STATUSES.includes(raw.status as OrderStatus)
    ? (raw.status as OrderStatus)
    : 'draft';
  const count = Number(raw.count);
  const price = Number(raw.pricePerBoardRub);
  const dna = text(raw.dna, MAX_DNA_CHARS);

  return {
    id: text(raw.id, 64) || newOrderId(),
    createdAt: isoDay(raw.createdAt) || todayIso(),
    dueAt: isoDay(raw.dueAt),
    customer: text(raw.customer, 120),
    note: text(raw.note, 2000),
    count: Number.isFinite(count) && count > 0 ? Math.min(Math.floor(count), 1000) : 1,
    // Обрезанная ДНК не откроется, и лучше честно пустое поле, чем ссылка,
    // которая ведёт в ошибку разбора.
    dna: dna.length === MAX_DNA_CHARS ? '' : dna,
    mode: raw.mode === 'recipe' ? 'recipe' : 'mosaic',
    summary: text(raw.summary, 200),
    pricePerBoardRub: Number.isFinite(price) && price >= 0 ? Math.min(price, 10_000_000) : 0,
    status,
  };
}

export function createOrder(patch: Partial<Order> = {}): Order {
  return sanitizeOrder({ id: newOrderId(), createdAt: todayIso(), ...patch });
}

export function loadOrders(): Order[] {
  try {
    const saved = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_ORDERS).map(sanitizeOrder);
  } catch {
    /* приватный режим или битый архив */
  }
  return [];
}

export function saveOrders(orders: Order[]): Order[] {
  const clean = orders.slice(0, MAX_ORDERS).map(sanitizeOrder);
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* хранилище переполнено или приватный режим: заказ останется в этой сессии */
  }
  return clean;
}

/** Новый заказ встаёт первым: список читают сверху. */
export function addOrder(orders: Order[], order: Order): Order[] {
  return [sanitizeOrder(order), ...orders].slice(0, MAX_ORDERS);
}

export function updateOrder(orders: Order[], id: string, patch: Partial<Order>): Order[] {
  return orders.map((order) => (order.id === id ? sanitizeOrder({ ...order, ...patch }) : order));
}

export function removeOrder(orders: Order[], id: string): Order[] {
  return orders.filter((order) => order.id !== id);
}

/**
 * Сортировка списка: сначала то, у чего горит срок, потом всё остальное
 * по свежести. Закрытые и отменённые уходят вниз — они больше ничего не ждут.
 */
export function sortOrders(orders: Order[]): Order[] {
  const openness = (order: Order) => (OPEN_STATUSES.includes(order.status) ? 0 : 1);
  return [...orders].sort((a, b) => {
    if (openness(a) !== openness(b)) return openness(a) - openness(b);
    if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    if (a.dueAt !== b.dueAt) return a.dueAt ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/**
 * Сколько дней осталось до срока. Ноль — сегодня, отрицательное — просрочено.
 *
 * Считается по календарным дням, а не по часам: «завтра» должно быть одним
 * днём и в девять утра, и в одиннадцать вечера. Разница в миллисекундах дала бы
 * то один день, то два в зависимости от времени суток. Округление до целого
 * заодно переживает переход на летнее время, когда в сутках 23 или 25 часов.
 */
export function daysLeft(order: Order, now: Date = new Date()): number | null {
  if (!order.dueAt) return null;
  const due = new Date(`${order.dueAt}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function orderTotalRub(order: Order): number {
  return order.pricePerBoardRub * order.count;
}

/** Архив целиком одним файлом: перенос на другой компьютер и резервная копия. */
export function exportOrders(orders: Order[]): string {
  return JSON.stringify({ kind: 'endgrain.orders', version: 1, orders }, null, 2);
}

/**
 * Загрузка архива. Возвращает `null`, если это не архив заказов: подставить
 * пустой список вместо чужого файла значило бы стереть работу.
 */
export function importOrders(json: string): Order[] | null {
  try {
    const parsed = JSON.parse(json) as { kind?: string; orders?: unknown };
    if (parsed?.kind !== 'endgrain.orders' || !Array.isArray(parsed.orders)) return null;
    return parsed.orders.slice(0, MAX_ORDERS).map(sanitizeOrder);
  } catch {
    return null;
  }
}

/**
 * Читается ли ДНК заказа вообще. Не разбирает рецепт — только проверяет,
 * что строка похожа на наш код: список заказов не должен предлагать открыть
 * то, что не откроется.
 */
export function hasReadableDna(order: Order): boolean {
  if (!order.dna) return false;
  try {
    // Оба режима кодируют одинаково: base64url от JSON. Отличается только
    // имя параметра в ссылке.
    return fromBase64Url(order.dna).trimStart().startsWith('{');
  } catch {
    return false;
  }
}

/**
 * Ссылка, по которой заказ открывается доской.
 *
 * `?mode=` обязателен и для мозаики, и для рецепта: режим выбирается до того,
 * как что-либо читает хэш, — без него мозаика откроется в «Рецепте», и хэш
 * прочитать будет некому.
 */
export function orderUrl(order: Order, origin: string, pathname: string): string {
  if (!order.dna) return '';
  const param = order.mode === 'recipe' ? 'dna' : 'mdna';
  return `${origin}${pathname}?mode=${order.mode}#${param}=${order.dna}`;
}
