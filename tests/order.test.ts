import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_ORDERS,
  ORDERS_STORAGE_KEY,
  addOrder,
  createOrder,
  daysLeft,
  exportOrders,
  hasReadableDna,
  importOrders,
  loadOrders,
  orderTotalRub,
  orderUrl,
  removeOrder,
  sanitizeOrder,
  saveOrders,
  sortOrders,
  todayIso,
  updateOrder,
  type Order,
} from '../src/core/order';
import { toBase64Url } from '../src/core/share';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
});

describe('создание заказа', () => {
  it('новый заказ получает свой идентификатор и сегодняшнюю дату', () => {
    const order = createOrder({ customer: 'Иванов' });
    expect(order.id).toBeTruthy();
    expect(order.createdAt).toBe(todayIso());
    expect(order.count).toBe(1);
    expect(order.status).toBe('draft');
  });

  it('идентификаторы не повторяются', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createOrder().id));
    expect(ids.size).toBe(200);
  });
});

describe('санитайзер заказа', () => {
  it('нулевое и отрицательное количество превращается в одну доску', () => {
    for (const count of [0, -5, Number.NaN, 'три']) {
      expect(sanitizeOrder({ count }).count, String(count)).toBe(1);
    }
  });

  it('дробное количество округляется вниз: половину доски не сделать', () => {
    expect(sanitizeOrder({ count: 3.9 }).count).toBe(3);
  });

  it('неизвестный статус становится черновиком', () => {
    expect(sanitizeOrder({ status: 'отгружено' }).status).toBe('draft');
  });

  it('кривая дата срока превращается в отсутствие срока, а не в сегодня', () => {
    // Подставить сегодняшнюю дату вместо непонятной значило бы придумать
    // мастерской обязательство, которого она не брала.
    expect(sanitizeOrder({ dueAt: '01.09.2026' }).dueAt).toBe('');
    expect(sanitizeOrder({ dueAt: 'скоро' }).dueAt).toBe('');
  });

  it('отрицательная цена обнуляется', () => {
    expect(sanitizeOrder({ pricePerBoardRub: -100 }).pricePerBoardRub).toBe(0);
  });

  it('обрезанная ДНК отбрасывается целиком: полуссылка ведёт в ошибку', () => {
    const huge = 'a'.repeat(64 * 1024);
    expect(sanitizeOrder({ dna: huge }).dna).toBe('');
  });

  it('мусор вместо заказа даёт пустой, но рабочий заказ', () => {
    for (const junk of [null, 42, 'строка', []]) {
      const order = sanitizeOrder(junk);
      expect(order.count, String(junk)).toBe(1);
      expect(order.id).toBeTruthy();
    }
  });
});

describe('архив заказов', () => {
  it('сохранённое читается обратно', () => {
    saveOrders([createOrder({ customer: 'Иванов', count: 3 })]);
    const orders = loadOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].customer).toBe('Иванов');
    expect(orders[0].count).toBe(3);
  });

  it('пустое хранилище — пустой список, а не ошибка', () => {
    expect(loadOrders()).toEqual([]);
  });

  it('битый архив не роняет приложение', () => {
    localStorage.setItem(ORDERS_STORAGE_KEY, '[[[');
    expect(loadOrders()).toEqual([]);
  });

  it('новый заказ встаёт первым', () => {
    const list = addOrder([createOrder({ customer: 'Первый' })], createOrder({ customer: 'Второй' }));
    expect(list[0].customer).toBe('Второй');
  });

  it('правка меняет один заказ и не трогает соседние', () => {
    const a = createOrder({ customer: 'А' });
    const b = createOrder({ customer: 'Б' });
    const list = updateOrder([a, b], b.id, { status: 'done' });
    expect(list.find((order) => order.id === b.id)?.status).toBe('done');
    expect(list.find((order) => order.id === a.id)?.status).toBe('draft');
  });

  it('удаление убирает ровно один заказ', () => {
    const a = createOrder();
    const b = createOrder();
    expect(removeOrder([a, b], a.id)).toEqual([b]);
  });

  it('архив не растёт бесконечно', () => {
    const many = Array.from({ length: MAX_ORDERS + 50 }, () => createOrder());
    expect(saveOrders(many).value).toHaveLength(MAX_ORDERS);
  });
});

describe('порядок в списке', () => {
  const order = (patch: Partial<Order>) => createOrder(patch);

  it('срочное впереди', () => {
    const sorted = sortOrders([
      order({ customer: 'Позже', dueAt: '2026-12-01' }),
      order({ customer: 'Раньше', dueAt: '2026-09-20' }),
    ]);
    expect(sorted[0].customer).toBe('Раньше');
  });

  it('заказ со сроком идёт впереди заказа без срока', () => {
    const sorted = sortOrders([
      order({ customer: 'Без срока' }),
      order({ customer: 'Со сроком', dueAt: '2026-12-01' }),
    ]);
    expect(sorted[0].customer).toBe('Со сроком');
  });

  it('закрытые и отменённые уходят вниз, даже если срок ближе', () => {
    const sorted = sortOrders([
      order({ customer: 'Сделан', dueAt: '2026-09-05', status: 'done' }),
      order({ customer: 'В работе', dueAt: '2026-12-01', status: 'inWork' }),
    ]);
    expect(sorted[0].customer).toBe('В работе');
  });
});

describe('срок и сумма', () => {
  it('до завтрашнего срока остался день', () => {
    const now = new Date('2026-09-04T10:00:00');
    expect(daysLeft(createOrder({ dueAt: '2026-09-05' }), now)).toBe(1);
  });

  it('вчерашний срок просрочен', () => {
    const now = new Date('2026-09-04T10:00:00');
    expect(daysLeft(createOrder({ dueAt: '2026-09-03' }), now)!).toBeLessThan(0);
  });

  it('сегодняшний срок — ноль дней, а не «просрочено»', () => {
    const now = new Date('2026-09-04T23:00:00');
    expect(daysLeft(createOrder({ dueAt: '2026-09-04' }), now)).toBe(0);
  });

  it('вечер не превращает завтра в послезавтра', () => {
    // Разница в миллисекундах давала бы то один день, то два в зависимости
    // от времени суток. Считаем календарными днями.
    const morning = new Date('2026-09-04T09:00:00');
    const evening = new Date('2026-09-04T23:30:00');
    const order = createOrder({ dueAt: '2026-09-05' });
    expect(daysLeft(order, morning)).toBe(daysLeft(order, evening));
  });

  it('без срока — не ноль дней, а «срока нет»', () => {
    // Ноль прочитался бы как «сегодня» и поднял бы заказ наверх списка.
    expect(daysLeft(createOrder({}))).toBeNull();
  });

  it('сумма заказа — цена за штуку на количество', () => {
    expect(orderTotalRub(createOrder({ pricePerBoardRub: 4500, count: 3 }))).toBe(13_500);
  });
});

describe('доска в заказе', () => {
  const dna = toBase64Url(JSON.stringify({ v: 1, recipe: {} }));

  it('читаемая ДНК распознаётся', () => {
    expect(hasReadableDna(createOrder({ dna }))).toBe(true);
  });

  it('мусор в поле ДНК не предлагается к открытию', () => {
    expect(hasReadableDna(createOrder({ dna: 'не ключ' }))).toBe(false);
    expect(hasReadableDna(createOrder({ dna: toBase64Url('просто текст') }))).toBe(false);
    expect(hasReadableDna(createOrder({}))).toBe(false);
  });

  it('ссылка на мозаику несёт режим: иначе хэш некому прочитать', () => {
    const url = orderUrl(createOrder({ dna, mode: 'mosaic' }), 'https://x.dev', '/endgrain/');
    expect(url).toContain('?mode=mosaic');
    expect(url).toContain('#mdna=');
  });

  it('ссылка на рецепт использует своё имя параметра', () => {
    const url = orderUrl(createOrder({ dna, mode: 'recipe' }), 'https://x.dev', '/endgrain/');
    expect(url).toContain('?mode=recipe');
    expect(url).toContain('#dna=');
  });

  it('заказ без доски ссылки не даёт', () => {
    expect(orderUrl(createOrder({}), 'https://x.dev', '/')).toBe('');
  });
});

describe('файл архива', () => {
  it('выгрузка и загрузка возвращают те же заказы', () => {
    const orders = [createOrder({ customer: 'Иванов', count: 2 }), createOrder({ customer: 'Пётр' })];
    expect(importOrders(exportOrders(orders))).toEqual(orders);
  });

  it('чужой файл архивом не считается — иначе он стёр бы работу', () => {
    expect(importOrders('{"kind":"endgrain.profile","orders":[]}')).toBeNull();
    expect(importOrders('[]')).toBeNull();
    expect(importOrders('не json')).toBeNull();
  });

  it('архив с мусором внутри чинится по записям, а не отбрасывается целиком', () => {
    const loaded = importOrders('{"kind":"endgrain.orders","version":1,"orders":[{"count":-1}]}');
    expect(loaded).toHaveLength(1);
    expect(loaded![0].count).toBe(1);
  });
});
