import { describe, it, expect, beforeEach } from 'vitest';
import { t, tn, tcount, setLang, getLang, hasDictionary, pluralIndex } from '../src/core/i18n';
import { ru } from '../src/i18n/ru';

describe('словарь', () => {
  beforeEach(() => setLang('ru'));

  it('отдаёт строку по ключу', () => {
    expect(t('workshop.title')).toBe('Мастерская');
  });

  it('подставляет параметры', () => {
    expect(t('license.status.valid', { date: '01.03.2027' })).toBe('Лицензия до 01.03.2027');
  });

  it('оставляет плейсхолдер, для которого не передали значение', () => {
    // Пустое место на экране хуже видимой дырки: `{date}` заметят, «Лицензия до» — нет.
    expect(t('license.status.valid')).toContain('{date}');
  });

  it('ни одна строка словаря не пустая', () => {
    for (const [key, phrase] of Object.entries(ru)) {
      const forms = typeof phrase === 'string' ? [phrase] : phrase;
      for (const form of forms) expect(form.trim(), key).not.toBe('');
    }
  });

  it('счётное слово не отдаётся как строка: без числа форма не выбирается', () => {
    expect(t('unit.board')).toBe('unit.board');
  });
});

describe('счётные слова', () => {
  beforeEach(() => setLang('ru'));

  it('русские формы: 1 / 2 / 5', () => {
    expect(tn('unit.board', 1)).toBe('доска');
    expect(tn('unit.board', 2)).toBe('доски');
    expect(tn('unit.board', 5)).toBe('досок');
  });

  it('подростковые числа берут третью форму: 11, 12, 14', () => {
    for (const count of [11, 12, 13, 14]) expect(tn('unit.board', count)).toBe('досок');
  });

  it('21 ведёт себя как 1, а 22 — как 2', () => {
    expect(tn('unit.board', 21)).toBe('доска');
    expect(tn('unit.board', 22)).toBe('доски');
  });

  it('ноль берёт третью форму', () => {
    expect(tn('unit.order', 0)).toBe('заказов');
  });

  it('число и слово одной строкой', () => {
    expect(tcount('unit.panel', 3)).toBe('3 щита');
  });

  it('английское правило проще русского', () => {
    expect(pluralIndex('en', 1)).toBe(0);
    expect(pluralIndex('en', 0)).toBe(2);
    expect(pluralIndex('en', 21)).toBe(2);
  });

  it('обычная строка по ключу счётного слова не роняет вызов', () => {
    expect(tn('workshop.title', 5)).toBe('Мастерская');
  });
});

describe('переключение языка', () => {
  beforeEach(() => setLang('ru'));

  it('английского словаря пока нет — язык остаётся русским', () => {
    expect(hasDictionary('en')).toBe(false);
    expect(setLang('en')).toBe('ru');
    expect(getLang()).toBe('ru');
    expect(t('workshop.title')).toBe('Мастерская');
  });
});
