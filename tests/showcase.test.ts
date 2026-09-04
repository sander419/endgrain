import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_ITEM_IMAGE_CHARS,
  MAX_SHOWCASE_ITEMS,
  SHOWCASE_STORAGE_KEY,
  addShowcaseItem,
  createShowcaseItem,
  exportShowcase,
  importShowcase,
  itemTitle,
  loadShowcase,
  moveShowcaseItem,
  removeShowcaseItem,
  sanitizeShowcaseItem,
  saveShowcase,
  showcaseWeightBytes,
  updateShowcaseItem,
  visibleItems,
  type ShowcaseItem,
} from '../src/core/showcase';
import {
  buildShowcaseHtml,
  contactLinks,
  escapeHtml,
  phoneDigits,
  telegramHandle,
  type ShowcaseContacts,
} from '../src/core/showcaseHtml';

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
      if (value.length > limitChars) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
});

const IMAGE = `data:image/jpeg;base64,${'A'.repeat(64)}`;

const item = (patch: Partial<ShowcaseItem> = {}) =>
  createShowcaseItem({
    title: 'Доска «Мандала»',
    imageDataUri: IMAGE,
    code: 'A7F3',
    lengthMm: 525,
    widthMm: 525,
    thicknessMm: 40,
    massKg: 8.5,
    species: ['Клён', 'Орех'],
    priceRub: 7800,
    leadTime: '2 недели',
    ...patch,
  });

const CONTACTS: ShowcaseContacts = {
  phone: '+7 900 123-45-67',
  telegram: '@hiborg',
  email: 'shop@example.com',
  site: 'example.com',
};

describe('карточка витрины', () => {
  it('заголовок берётся свой, если задан', () => {
    expect(itemTitle(item())).toBe('Доска «Мандала»');
  });

  it('без своего заголовка собирается из размера и пород', () => {
    const title = itemTitle(item({ title: '' }));
    expect(title).toContain('525 × 525 мм');
    expect(title).toContain('клён');
  });

  it('отрицательная цена обнуляется, а не превращается в скидку', () => {
    expect(sanitizeShowcaseItem({ priceRub: -100 }).priceRub).toBe(0);
  });

  it('обрезанная картинка отбрасывается целиком: она нарисуется мусором', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(MAX_ITEM_IMAGE_CHARS)}`;
    expect(sanitizeShowcaseItem({ imageDataUri: huge }).imageDataUri).toBe('');
  });

  it('чужая ссылка вместо картинки не проходит', () => {
    for (const bad of [
      'https://example.com/board.jpg',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html;base64,PHNjcmlwdD4=',
    ]) {
      expect(sanitizeShowcaseItem({ imageDataUri: bad }).imageDataUri, bad).toBe('');
    }
  });

  it('мусор вместо карточки даёт пустую, но рабочую', () => {
    for (const junk of [null, 42, 'строка', []]) {
      const clean = sanitizeShowcaseItem(junk);
      expect(clean.id, String(junk)).toBeTruthy();
      expect(clean.priceRub).toBe(0);
    }
  });
});

describe('список витрины', () => {
  it('сохранённое читается обратно', () => {
    saveShowcase([item()]);
    expect(loadShowcase()[0].title).toBe('Доска «Мандала»');
  });

  it('битое хранилище не роняет загрузку', () => {
    localStorage.setItem(SHOWCASE_STORAGE_KEY, '{{{');
    expect(loadShowcase()).toEqual([]);
  });

  it('переполнение хранилища сообщается, а не проглатывается', () => {
    // Единственное место в проекте, где место реально кончается: картинки.
    // Промолчать — значит дать мастерской собрать витрину и потерять её.
    (globalThis as { localStorage?: Storage }).localStorage = fakeStorage(50);
    const result = saveShowcase([item()]);
    expect(result.overflow).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('список не растёт бесконечно', () => {
    const many = Array.from({ length: MAX_SHOWCASE_ITEMS + 10 }, () => item());
    expect(saveShowcase(many).items).toHaveLength(MAX_SHOWCASE_ITEMS);
  });

  it('новая карточка встаёт последней: порядок задаёт мастерская', () => {
    const list = addShowcaseItem([item({ title: 'Первая' })], item({ title: 'Вторая' }));
    expect(list[1].title).toBe('Вторая');
  });

  it('карточку можно двигать, и на краях список не рвётся', () => {
    const a = item({ title: 'А' });
    const b = item({ title: 'Б' });
    expect(moveShowcaseItem([a, b], b.id, -1).map((x) => x.title)).toEqual(['Б', 'А']);
    expect(moveShowcaseItem([a, b], a.id, -1).map((x) => x.title)).toEqual(['А', 'Б']);
    expect(moveShowcaseItem([a, b], b.id, 5).map((x) => x.title)).toEqual(['А', 'Б']);
    expect(moveShowcaseItem([a, b], 'нет такой', 1)).toHaveLength(2);
  });

  it('правка меняет одну карточку', () => {
    const a = item({ title: 'А' });
    const b = item({ title: 'Б' });
    const list = updateShowcaseItem([a, b], b.id, { priceRub: 9000 });
    expect(list[1].priceRub).toBe(9000);
    expect(list[0].priceRub).toBe(7800);
  });

  it('удаление убирает ровно одну', () => {
    const a = item();
    const b = item();
    expect(removeShowcaseItem([a, b], a.id)).toEqual([b]);
  });

  it('скрытая карточка остаётся в списке, но не идёт в файл', () => {
    const list = [item({ title: 'Видна' }), item({ title: 'Снята', hidden: true })];
    expect(list).toHaveLength(2);
    expect(visibleItems(list).map((x) => x.title)).toEqual(['Видна']);
    expect(showcaseWeightBytes(list)).toBe(IMAGE.length);
  });

  it('выгрузка и загрузка возвращают то же', () => {
    const list = [item(), item({ title: 'Вторая' })];
    expect(importShowcase(exportShowcase(list))).toEqual(list);
  });

  it('чужой файл витриной не считается', () => {
    expect(importShowcase('{"kind":"endgrain.orders","items":[]}')).toBeNull();
    expect(importShowcase('[]')).toBeNull();
  });
});

describe('экранирование и ссылки', () => {
  it('кавычка в названии не ломает атрибут', () => {
    expect(escapeHtml('Доска "Мандала" & <b>')).toBe('Доска &quot;Мандала&quot; &amp; &lt;b&gt;');
  });

  it('телефон превращается в цифры для wa.me', () => {
    expect(phoneDigits('+7 (900) 123-45-67')).toBe('79001234567');
  });

  it('восьмёрка в начале становится семёркой: иначе WhatsApp не найдёт абонента', () => {
    expect(phoneDigits('8 900 123-45-67')).toBe('79001234567');
  });

  it('телеграм принимается с собакой, без и целой ссылкой', () => {
    for (const input of ['@hiborg', 'hiborg', 'https://t.me/hiborg']) {
      expect(telegramHandle(input), input).toBe('hiborg');
    }
  });

  it('в ссылке «написать» уже стоит название доски и номер рецепта', () => {
    const links = contactLinks(CONTACTS, item());
    const whatsapp = links.find((link) => link.href.includes('wa.me'));
    expect(whatsapp?.href).toContain(encodeURIComponent('A7F3'));
    expect(whatsapp?.href).toContain('79001234567');
  });

  it('без контактов кнопок нет, а не пустые ссылки', () => {
    expect(contactLinks({ phone: '', telegram: '', email: '', site: '' }, item())).toEqual([]);
  });
});

describe('сборка страницы', () => {
  const page = () => ({
    workshop: 'Столярка «Хиборг»',
    about: 'Делаем доски из массива',
    logoDataUri: '',
    contacts: CONTACTS,
    items: [item(), item({ title: 'Снята', hidden: true })],
  });

  it('страница самодостаточна: ни одного внешнего запроса', () => {
    const html = buildShowcaseHtml(page());
    // Всё, кроме контактных ссылок, должно быть внутри файла.
    const external = html.match(/(?:src|href)="https?:\/\/[^"]*"/g) ?? [];
    for (const link of external) {
      expect(link, link).toMatch(/wa\.me|t\.me|example\.com/);
    }
    expect(html).not.toContain('<script');
    expect(html).not.toContain('fonts.googleapis');
  });

  it('скрытая карточка в файл не попадает', () => {
    const html = buildShowcaseHtml(page());
    expect(html).toContain('Доска «Мандала»');
    expect(html).not.toContain('Снята');
  });

  it('кавычки и угловые скобки в тексте мастерской не ломают разметку', () => {
    const html = buildShowcaseHtml({
      ...page(),
      workshop: 'Столярка <script>alert(1)</script>',
      items: [item({ title: 'Доска "с кавычкой"', description: '<b>жирно</b>' })],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>жирно</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('без цены пишется «по запросу», а не ноль рублей', () => {
    const html = buildShowcaseHtml({ ...page(), items: [item({ priceRub: 0 })] });
    expect(html).toContain('Цена по запросу');
    expect(html).not.toContain('0 ₽');
  });

  it('в карточке есть размеры, породы и номер рецепта', () => {
    const html = buildShowcaseHtml(page());
    expect(html).toContain('525 × 525 × 40 мм');
    expect(html).toContain('Клён, Орех');
    expect(html).toContain('A7F3');
  });

  it('страница объявляет язык, кодировку и мобильный вьюпорт', () => {
    const html = buildShowcaseHtml(page());
    expect(html).toContain('<html lang="ru">');
    expect(html).toContain('charset="utf-8"');
    expect(html).toContain('width=device-width');
  });

  it('пустая витрина собирается без падения', () => {
    const html = buildShowcaseHtml({ ...page(), items: [] });
    expect(html).toContain('Столярка');
    expect(html.length).toBeGreaterThan(500);
  });

  it('без названия мастерской страница не остаётся безымянной', () => {
    const html = buildShowcaseHtml({ ...page(), workshop: '  ' });
    expect(html).toContain('<title>Мастерская');
  });

  it('уход за доской попадает на страницу: это и доверие, и меньше споров о браке', () => {
    expect(buildShowcaseHtml(page())).toContain('Посудомоечная машина');
  });
});
