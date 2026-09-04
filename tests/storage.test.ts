import { describe, it, expect, beforeEach } from 'vitest';
import { readJson, writeJson, removeKey, usedBytes, STORAGE_BUDGET } from '../src/core/storage';
import { saveOrders, loadOrders, createOrder, MAX_ORDERS, MAX_DNA_CHARS } from '../src/core/order';
import { saveProfile, loadProfile, DEFAULT_PROFILE, MAX_LOGO_CHARS } from '../src/core/profile';
import { saveFactLog, createFactEntry, MAX_FACT_ENTRIES } from '../src/core/factlog';
import {
  MAX_ITEM_IMAGE_CHARS,
  MAX_SHOWCASE_CHARS,
  MAX_SHOWCASE_ITEMS,
  createShowcaseItem,
  fitShowcase,
  importShowcase,
  saveShowcase,
} from '../src/core/showcase';

/** Хранилище с потолком: ровно так ведёт себя браузер на переполнении. */
function fakeStorage(limitChars = Number.POSITIVE_INFINITY): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => {
      let total = value.length;
      for (const [name, stored] of map) if (name !== key) total += stored.length;
      if (total > limitChars) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
  };
}

function noStorage(): void {
  // Приватный режим в некоторых браузерах: обращение бросает исключение.
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError');
    },
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: fakeStorage(),
  });
});

describe('низкий уровень', () => {
  it('записанное читается обратно', () => {
    expect(writeJson('endgrain.t', { a: 1 })).toBe(true);
    expect(readJson('endgrain.t')).toEqual({ a: 1 });
  });

  it('пустого ключа нет, а не null внутри', () => {
    expect(readJson('endgrain.нет')).toBeUndefined();
  });

  it('битое значение читается как «ничего», а не роняет разбор', () => {
    localStorage.setItem('endgrain.t', '{{{');
    expect(readJson('endgrain.t')).toBeUndefined();
  });

  it('переполнение возвращает false, а не бросает', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: fakeStorage(20),
    });
    expect(writeJson('endgrain.t', { big: 'x'.repeat(500) })).toBe(false);
  });

  it('недоступное хранилище не роняет ни чтение, ни запись, ни подсчёт', () => {
    noStorage();
    expect(() => readJson('endgrain.t')).not.toThrow();
    expect(writeJson('endgrain.t', {})).toBe(false);
    expect(usedBytes()).toBe(0);
    expect(() => removeKey('endgrain.t')).not.toThrow();
  });

  it('занятое место считается только по нашим ключам', () => {
    writeJson('endgrain.a', 'x'.repeat(100));
    writeJson('чужой.ключ', 'y'.repeat(1000));
    const used = usedBytes();
    expect(used).toBeGreaterThan(100);
    expect(used).toBeLessThan(400);
  });
});

describe('отказ записи виден вызывающему', () => {
  it('заказы сообщают, что не сохранились', () => {
    // Молчаливая потеря заказа — худшее, что может сделать инструмент,
    // который ведёт чужой учёт.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: fakeStorage(50),
    });
    const stored = saveOrders([createOrder({ customer: 'Иванов' })]);
    expect(stored.saved).toBe(false);
    expect(stored.value).toHaveLength(1);
  });

  it('профиль сообщает то же самое', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: fakeStorage(50),
    });
    expect(saveProfile({ ...DEFAULT_PROFILE, name: 'Хиборг' }).saved).toBe(false);
  });

  it('журнал факта — тоже', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: fakeStorage(50),
    });
    expect(saveFactLog([createFactEntry({ actualMin: 60 })]).saved).toBe(false);
  });

  it('витрина — тоже', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: fakeStorage(50),
    });
    expect(saveShowcase([createShowcaseItem({ title: 'Доска' })]).overflow).toBe(true);
  });

  it('успешная запись сообщает об успехе, и данные действительно на месте', () => {
    expect(saveOrders([createOrder({ customer: 'Иванов' })]).saved).toBe(true);
    expect(loadOrders()[0].customer).toBe('Иванов');
    expect(saveProfile({ ...DEFAULT_PROFILE, name: 'Хиборг' }).saved).toBe(true);
    expect(loadProfile().name).toBe('Хиборг');
  });
});

describe('пределы помещаются в бюджет', () => {
  it('заказы, витрина и логотип вместе не превышают объявленный бюджет', () => {
    // Именно эта арифметика раньше не сходилась: пределы были выставлены
    // «сколько не жалко», и их сумма втрое перекрывала квоту браузера.
    const orders = MAX_ORDERS * (MAX_DNA_CHARS + 500);
    const worst = orders + MAX_SHOWCASE_CHARS + MAX_LOGO_CHARS;
    expect(worst).toBeLessThanOrEqual(STORAGE_BUDGET * 2);
  });

  it('одна карточка витрины не может весить больше всей витрины', () => {
    expect(MAX_ITEM_IMAGE_CHARS).toBeLessThan(MAX_SHOWCASE_CHARS);
  });

  it('журнал факта ограничен числом записей', () => {
    const many = Array.from({ length: MAX_FACT_ENTRIES + 10 }, () => createFactEntry());
    expect(saveFactLog(many).value).toHaveLength(MAX_FACT_ENTRIES);
  });
});

describe('витрина обрезается по весу, а не только по счёту', () => {
  const heavy = () =>
    createShowcaseItem({
      imageDataUri: `data:image/jpeg;base64,${'A'.repeat(MAX_ITEM_IMAGE_CHARS - 40)}`,
    });

  it('лёгкие карточки проходят все', () => {
    const items = Array.from({ length: 5 }, () => createShowcaseItem({ title: 'x' }));
    expect(fitShowcase(items)).toHaveLength(5);
  });

  it('тяжёлые обрезаются, и отбрасываются последние', () => {
    const items = Array.from({ length: MAX_SHOWCASE_ITEMS }, (_, index) =>
      index === 0 ? createShowcaseItem({ title: 'Первая' }) : heavy()
    );
    const kept = fitShowcase(items);
    expect(kept.length).toBeLessThan(items.length);
    expect(kept[0].title).toBe('Первая');
  });

  it('чужой файл витрины не может создать несохранимое состояние', () => {
    const items = Array.from({ length: MAX_SHOWCASE_ITEMS }, () => heavy());
    const json = JSON.stringify({ kind: 'endgrain.showcase', version: 1, items });
    const loaded = importShowcase(json)!;
    const weight = loaded.reduce((sum, item) => sum + item.imageDataUri.length, 0);
    expect(weight).toBeLessThanOrEqual(MAX_SHOWCASE_CHARS);
  });
});
