import { describe, it, expect } from 'vitest';
import {
  PRICING,
  canContact,
  formatRub,
  purchaseLink,
  purchaseMessage,
} from '../src/core/pricing';

describe('цена', () => {
  it('объявлена и не нулевая: инструмент, у которого негде узнать цену, не продаётся', () => {
    expect(PRICING.yearRub).toBeGreaterThan(0);
    expect(PRICING.foreverRub).toBeGreaterThan(0);
    expect(PRICING.trialDays).toBeGreaterThan(0);
  });

  it('бессрочный дороже годового: иначе годовой не имеет смысла', () => {
    expect(PRICING.foreverRub).toBeGreaterThan(PRICING.yearRub);
  });

  it('рубли форматируются с разрядами и знаком', () => {
    expect(formatRub(4900)).toContain('₽');
    expect(formatRub(12900).replace(/\s| /g, '')).toContain('12900');
  });
});

describe('запрос на ключ', () => {
  it('в тексте есть название мастерской, если оно задано', () => {
    expect(purchaseMessage('year', 'Столярка «Дубрава»')).toContain('Дубрава');
  });

  it('без названия текст просит его вписать, а не молчит', () => {
    expect(purchaseMessage('trial', '  ')).toContain('Название мастерской');
  });

  it('запрос на пробу называет срок, запрос на покупку — цену', () => {
    expect(purchaseMessage('trial', 'Х')).toContain(String(PRICING.trialDays));
    expect(purchaseMessage('year', 'Х').replace(/\s| /g, '')).toContain(
      String(PRICING.yearRub)
    );
    expect(purchaseMessage('forever', 'Х').replace(/\s| /g, '')).toContain(
      String(PRICING.foreverRub)
    );
  });
});

describe('куда писать', () => {
  it('без контакта ссылки нет, а не ссылка в никуда', () => {
    expect(purchaseLink({ ...PRICING, telegram: '' })).toBe('');
    expect(canContact({ ...PRICING, telegram: '   ' })).toBe(false);
  });

  it('ник принимается с собакой и без', () => {
    expect(purchaseLink({ ...PRICING, telegram: '@hiborg' })).toBe('https://t.me/hiborg');
    expect(purchaseLink({ ...PRICING, telegram: 'hiborg' })).toBe('https://t.me/hiborg');
  });
});
