import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PROFILE,
  MAX_LOGO_CHARS,
  PROFILE_STORAGE_KEY,
  documentTitle,
  exportProfile,
  importProfile,
  loadProfile,
  patchProfile,
  saveProfile,
  sanitizeProfile,
} from '../src/core/profile';
import { DEFAULT_RATES } from '../src/core/economics';
import { DEFAULT_STOCK } from '../src/core/stock';

/** Хранилище в памяти: тесты гоняются в Node, где localStorage нет. */
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

describe('чтение и запись профиля', () => {
  it('пустое хранилище даёт умолчания, а не пустоту', () => {
    const profile = loadProfile();
    expect(profile.rates).toEqual(DEFAULT_RATES);
    expect(profile.stock).toEqual(DEFAULT_STOCK);
    expect(profile.tools.length).toBeGreaterThan(0);
  });

  it('сохранённое читается обратно', () => {
    saveProfile({ ...DEFAULT_PROFILE, name: 'Хиборг', contact: '+7 900 000-00-00' });
    const profile = loadProfile();
    expect(profile.name).toBe('Хиборг');
    expect(profile.contact).toBe('+7 900 000-00-00');
  });

  it('точечная правка не сбрасывает остальное', () => {
    saveProfile({ ...DEFAULT_PROFILE, name: 'Хиборг' });
    patchProfile({ stock: { lengthMm: 3000, widthMm: 200 } });
    const profile = loadProfile();
    expect(profile.name).toBe('Хиборг');
    expect(profile.stock).toEqual({ lengthMm: 3000, widthMm: 200 });
  });

  it('битый профиль в хранилище не роняет загрузку', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, '{это не json');
    expect(loadProfile().rates).toEqual(DEFAULT_RATES);
  });
});

describe('перенос со старых ключей', () => {
  it('станки, ставки и доска подхватываются, а не теряются при обновлении', () => {
    // Ровно тот случай, ради которого миграция и написана: человек настроил
    // инструмент до объединения ключей, обновил вкладку и не должен ничего
    // настраивать заново.
    localStorage.setItem('endgrain.workshop.v1', JSON.stringify(['tablesaw', 'clamps']));
    localStorage.setItem('endgrain.rates.v1', JSON.stringify({ hourlyRateRub: 1200 }));
    localStorage.setItem('endgrain.stock', JSON.stringify({ lengthMm: 2500, widthMm: 180 }));

    const profile = loadProfile();
    expect(profile.tools).toEqual(['tablesaw', 'clamps']);
    expect(profile.rates.hourlyRateRub).toBe(1200);
    // Не заданные в старом ключе ставки берутся из умолчаний, а не обнуляются.
    expect(profile.rates.consumablesRub).toBe(DEFAULT_RATES.consumablesRub);
    expect(profile.stock).toEqual({ lengthMm: 2500, widthMm: 180 });
  });

  it('новый профиль имеет приоритет над старыми ключами', () => {
    localStorage.setItem('endgrain.rates.v1', JSON.stringify({ hourlyRateRub: 1200 }));
    saveProfile({ ...DEFAULT_PROFILE, rates: { ...DEFAULT_RATES, hourlyRateRub: 700 } });
    expect(loadProfile().rates.hourlyRateRub).toBe(700);
  });

  it('мусор в старых ключах не мешает запуску', () => {
    localStorage.setItem('endgrain.workshop.v1', 'не json');
    expect(loadProfile().tools).toEqual(DEFAULT_PROFILE.tools);
  });
});

describe('санитайзер профиля', () => {
  it('несуществующий станок в список не попадает', () => {
    const profile = sanitizeProfile({ tools: ['tablesaw', 'лазер', 42] });
    expect(profile.tools).toEqual(['tablesaw']);
  });

  it('повторы в списке станков схлопываются', () => {
    expect(sanitizeProfile({ tools: ['clamps', 'clamps'] }).tools).toEqual(['clamps']);
  });

  it('отрицательная ставка заменяется умолчанием, а не уходит в минус', () => {
    const profile = sanitizeProfile({ rates: { hourlyRateRub: -500 } });
    expect(profile.rates.hourlyRateRub).toBe(DEFAULT_RATES.hourlyRateRub);
  });

  it('нулевая ставка допустима: «своё время не считаю» — законный ответ', () => {
    expect(sanitizeProfile({ rates: { hourlyRateRub: 0 } }).rates.hourlyRateRub).toBe(0);
  });

  it('нулевая длина доски недопустима: на неё делят', () => {
    expect(sanitizeProfile({ stock: { lengthMm: 0, widthMm: 150 } }).stock.lengthMm).toBe(
      DEFAULT_STOCK.lengthMm
    );
  });

  it('NaN и Infinity не доезжают до расчёта', () => {
    const profile = sanitizeProfile({
      rates: { overheadPct: Number.NaN },
      stock: { lengthMm: Number.POSITIVE_INFINITY, widthMm: 150 },
    });
    expect(Number.isFinite(profile.rates.overheadPct)).toBe(true);
    expect(Number.isFinite(profile.stock.lengthMm)).toBe(true);
  });

  it('нереальная длина доски зажимается: 12 метров и так с запасом', () => {
    expect(sanitizeProfile({ stock: { lengthMm: 1e9, widthMm: 150 } }).stock.lengthMm).toBe(12_000);
  });

  it('название обрезается по длине: в шапку документа поэма не влезет', () => {
    const profile = sanitizeProfile({ name: 'а'.repeat(1000) });
    expect(profile.name.length).toBe(120);
  });

  it('логотип принимается только растровый', () => {
    const png = `data:image/png;base64,${'A'.repeat(40)}`;
    expect(sanitizeProfile({ logoDataUri: png }).logoDataUri).toBe(png);
  });

  it('SVG в логотип не пускается: это документ, а не картинка', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    expect(sanitizeProfile({ logoDataUri: svg }).logoDataUri).toBe('');
  });

  it('чужая ссылка вместо логотипа не проходит: страница не пойдёт на чужой сервер', () => {
    for (const bad of [
      'https://example.com/logo.png',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      "url('https://example.com/x.png')",
    ]) {
      expect(sanitizeProfile({ logoDataUri: bad }).logoDataUri, bad).toBe('');
    }
  });

  it('логотип сверх предела отбрасывается целиком, а не режется посередине', () => {
    const huge = `data:image/png;base64,${'A'.repeat(MAX_LOGO_CHARS)}`;
    expect(sanitizeProfile({ logoDataUri: huge }).logoDataUri).toBe('');
  });

  it('мусор вместо профиля даёт умолчания', () => {
    for (const junk of [null, undefined, 42, 'строка', []]) {
      expect(sanitizeProfile(junk).rates, String(junk)).toEqual(DEFAULT_RATES);
    }
  });
});

describe('файл профиля', () => {
  it('выгрузка и загрузка возвращают то же самое', () => {
    const profile = saveProfile({
      ...DEFAULT_PROFILE,
      name: 'Хиборг',
      contact: 'hiborg@example.com',
      tools: ['tablesaw', 'clamps'],
      rates: { ...DEFAULT_RATES, hourlyRateRub: 900 },
    }).value;
    expect(importProfile(exportProfile(profile))).toEqual(profile);
  });

  it('файл читается человеком: с отступами и переносами', () => {
    expect(exportProfile(DEFAULT_PROFILE)).toContain('\n  "name"');
  });

  it('чужой JSON профилем не считается — иначе он молча стёр бы настройки', () => {
    expect(importProfile('{"v":1,"seed":5,"recipe":{}}')).toBeNull();
    expect(importProfile('[]')).toBeNull();
    expect(importProfile('не json')).toBeNull();
  });

  it('профиль с одним полем имени принимается: остальное добирается умолчаниями', () => {
    const loaded = importProfile('{"name":"Дубрава"}');
    expect(loaded?.name).toBe('Дубрава');
    expect(loaded?.rates).toEqual(DEFAULT_RATES);
  });
});

describe('подпись документов', () => {
  it('своё название важнее имени из лицензии', () => {
    expect(documentTitle({ ...DEFAULT_PROFILE, name: 'Дубрава' }, 'Хиборг')).toBe('Дубрава');
  });

  it('без своего названия документ подписывается лицензией', () => {
    expect(documentTitle(DEFAULT_PROFILE, 'Хиборг')).toBe('Хиборг');
  });

  it('без того и другого — пусто, а не «Мастерская»', () => {
    // Подставить придуманное название в документ клиенту хуже, чем не подставить
    // ничего: клиент прочтёт его как настоящее.
    expect(documentTitle(DEFAULT_PROFILE)).toBe('');
  });
});
