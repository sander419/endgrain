import { describe, it, expect, beforeAll } from 'vitest';
import {
  verifyLicenseKey,
  parseLicensePayload,
  encodeLicensePayload,
  joinLicenseKey,
  expiryDeadline,
  isPro,
  CLOCK_GRACE_DAYS,
  daysUntil,
  type LicensePayload,
} from '../src/core/license';

/**
 * Тест подписывает ключи своей парой и передаёт свой публичный ключ параметром.
 * Настоящий приватный ключ в репозитории не лежит и лежать не должен —
 * поэтому проверять надо механизм, а не конкретную выпущенную лицензию.
 */
const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

let publicJwk: JsonWebKey;
let privateKey: CryptoKey;
let otherPublicJwk: JsonWebKey;

async function sign(payload: LicensePayload): Promise<string> {
  const payloadB64 = encodeLicensePayload(payload);
  const signature = await crypto.subtle.sign(
    SIGN,
    privateKey,
    new TextEncoder().encode(payloadB64)
  );
  return joinLicenseKey(payloadB64, new Uint8Array(signature));
}

const HIBORG: LicensePayload = {
  v: 1,
  w: 'Хиборг',
  p: 'workshop',
  i: '2026-09-01',
  e: '2027-09-01',
};

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);

  const other = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  otherPublicJwk = await crypto.subtle.exportKey('jwk', other.publicKey);
});

describe('действующий ключ', () => {
  it('открывает платный слой и называет мастерскую', async () => {
    const key = await sign(HIBORG);
    const state = await verifyLicenseKey(key, {
      publicJwk,
      now: Date.parse('2027-01-15T12:00:00Z'),
    });
    expect(state.tier).toBe('workshop');
    expect(isPro(state)).toBe(true);
    if (state.tier === 'workshop') {
      expect(state.workshop).toBe('Хиборг');
      expect(state.expiresAt).toBe('2027-09-01');
    }
  });

  it('бессрочный ключ работает и через десять лет', async () => {
    const key = await sign({ v: 1, w: 'Хиборг', p: 'workshop', i: '2026-09-01' });
    const state = await verifyLicenseKey(key, {
      publicJwk,
      now: Date.parse('2036-09-01T00:00:00Z'),
    });
    expect(state.tier).toBe('workshop');
  });

  it('переживает пробелы и перенос строки при копировании из письма', async () => {
    const key = await sign(HIBORG);
    const state = await verifyLicenseKey(`\n  ${key}  \n`, {
      publicJwk,
      now: Date.parse('2027-01-15T12:00:00Z'),
    });
    expect(state.tier).toBe('workshop');
  });

  it('кириллица в названии мастерской доживает до документов', async () => {
    const key = await sign({ ...HIBORG, w: 'Столярка «Дубрава», ИП Иванов' });
    const state = await verifyLicenseKey(key, {
      publicJwk,
      now: Date.parse('2027-01-15T12:00:00Z'),
    });
    if (state.tier === 'workshop') expect(state.workshop).toBe('Столярка «Дубрава», ИП Иванов');
    else expect.fail('ключ должен быть действующим');
  });
});

describe('ключ не действует', () => {
  it('пустая строка — просто «ключа нет», без всяких обвинений', async () => {
    const state = await verifyLicenseKey('   ', { publicJwk });
    expect(state).toEqual({ tier: 'free', reason: 'none' });
  });

  it('мусор не разбирается', async () => {
    for (const junk of ['не ключ', 'abc.def', '.', 'eyJ2IjoxfQ', 'a.b.c']) {
      const state = await verifyLicenseKey(junk, { publicJwk });
      expect(state.tier, junk).toBe('free');
      if (state.tier === 'free') expect(['malformed', 'forged'], junk).toContain(state.reason);
    }
  });

  it('подделанное тело ловится подписью', async () => {
    const key = await sign(HIBORG);
    const [, signature] = key.split('.');
    const forged = encodeLicensePayload({ ...HIBORG, w: 'Чужая мастерская' });
    const state = await verifyLicenseKey(`${forged}.${signature}`, { publicJwk });
    expect(state).toEqual({ tier: 'free', reason: 'forged' });
  });

  it('продлённый срок в теле не проходит: дата тоже подписана', async () => {
    const key = await sign(HIBORG);
    const [, signature] = key.split('.');
    const forged = encodeLicensePayload({ ...HIBORG, e: '2099-01-01' });
    const state = await verifyLicenseKey(`${forged}.${signature}`, { publicJwk });
    expect(state).toEqual({ tier: 'free', reason: 'forged' });
  });

  it('ключ от чужой пары не подходит', async () => {
    const key = await sign(HIBORG);
    const state = await verifyLicenseKey(key, { publicJwk: otherPublicJwk });
    expect(state).toEqual({ tier: 'free', reason: 'forged' });
  });

  it('сломанный публичный ключ не роняет приложение, а даёт бесплатный режим', async () => {
    const key = await sign(HIBORG);
    const state = await verifyLicenseKey(key, { publicJwk: { kty: 'EC', crv: 'P-256' } });
    expect(state).toEqual({ tier: 'free', reason: 'forged' });
  });

  it('просроченный ключ называет мастерскую и дату: человеку надо видеть, чей ключ истёк', async () => {
    const key = await sign(HIBORG);
    const state = await verifyLicenseKey(key, {
      publicJwk,
      now: Date.parse('2027-10-01T00:00:00Z'),
    });
    expect(state).toEqual({
      tier: 'free',
      reason: 'expired',
      workshop: 'Хиборг',
      expiresAt: '2027-09-01',
      // Истёкшая покупка и истёкшая проба ведут к разным предложениям,
      // поэтому пометка доживает и до просроченного состояния.
      trial: false,
    });
  });
});

describe('часы мастерской', () => {
  it('в последний день лицензия ещё действует целиком', async () => {
    const key = await sign(HIBORG);
    const state = await verifyLicenseKey(key, {
      publicJwk,
      now: Date.parse('2027-09-01T23:00:00Z'),
    });
    expect(state.tier).toBe('workshop');
  });

  it('отставшие на пару дней часы не отнимают доступ', async () => {
    // Компьютер в цеху вполне может врать на день-другой. Наказывать за это
    // мастерскую — наказывать не того.
    const key = await sign(HIBORG);
    const state = await verifyLicenseKey(key, {
      publicJwk,
      now: expiryDeadline('2027-09-01') - 60_000,
    });
    expect(state.tier).toBe('workshop');
  });

  it('запас конечен: через неделю после срока ключ уже не работает', async () => {
    const key = await sign(HIBORG);
    const state = await verifyLicenseKey(key, {
      publicJwk,
      now: expiryDeadline('2027-09-01') + 4 * 24 * 60 * 60 * 1000,
    });
    expect(state.tier).toBe('free');
  });

  it('запас — ровно объявленные трое суток', () => {
    const strict = Date.parse('2027-09-01T23:59:59.999Z');
    expect(expiryDeadline('2027-09-01') - strict).toBe(CLOCK_GRACE_DAYS * 86_400_000);
  });
});

describe('разбор тела без криптографии', () => {
  it('читает корректное тело', () => {
    expect(parseLicensePayload(`${encodeLicensePayload(HIBORG)}.signature`)).toEqual(HIBORG);
  });

  it('отвергает чужой тариф, чужую версию и пустое название', () => {
    const bad = [
      { ...HIBORG, p: 'enterprise' },
      { ...HIBORG, v: 2 },
      { ...HIBORG, w: '   ' },
      { ...HIBORG, i: '01.09.2026' },
      { ...HIBORG, e: 'никогда' },
    ];
    for (const payload of bad) {
      const key = `${encodeLicensePayload(payload as LicensePayload)}.signature`;
      expect(parseLicensePayload(key), JSON.stringify(payload)).toBeNull();
    }
  });

  it('тело без подписи не считается ключом', () => {
    expect(parseLicensePayload(encodeLicensePayload(HIBORG))).toBeNull();
  });
});

describe('пробный ключ', () => {
  const TRIAL: LicensePayload = {
    v: 1,
    w: 'Столярка «Дубрава»',
    p: 'workshop',
    i: '2026-09-04',
    e: '2026-09-18',
    k: 'trial',
  };

  it('проба открывает то же самое, что покупка', async () => {
    // Урезанная проба показывает не продукт, а его тень: по ней нельзя решить,
    // стоит ли платить.
    const state = await verifyLicenseKey(await sign(TRIAL), {
      publicJwk,
      now: Date.parse('2026-09-10T12:00:00'),
    });
    expect(state.tier).toBe('workshop');
    expect(isPro(state)).toBe(true);
  });

  it('приложение знает, что это проба, и сколько осталось', async () => {
    const state = await verifyLicenseKey(await sign(TRIAL), {
      publicJwk,
      now: Date.parse('2026-09-10T12:00:00'),
    });
    if (state.tier !== 'workshop') return expect.fail('ключ должен действовать');
    expect(state.trial).toBe(true);
    expect(state.daysLeft).toBe(8);
  });

  it('обычный ключ пробой не считается', async () => {
    const state = await verifyLicenseKey(await sign(HIBORG), {
      publicJwk,
      now: Date.parse('2027-01-15T12:00:00'),
    });
    if (state.tier !== 'workshop') return expect.fail('ключ должен действовать');
    expect(state.trial).toBe(false);
  });

  it('у бессрочного ключа остатка дней нет, а не ноль', async () => {
    // Ноль прочитался бы как «истекает сегодня».
    const key = await sign({ v: 1, w: 'Хиборг', p: 'workshop', i: '2026-09-01' });
    const state = await verifyLicenseKey(key, { publicJwk });
    if (state.tier !== 'workshop') return expect.fail('ключ должен действовать');
    expect(state.daysLeft).toBeNull();
  });

  it('истёкшая проба помнит, что была пробой: предложение купить зависит от этого', async () => {
    const state = await verifyLicenseKey(await sign(TRIAL), {
      publicJwk,
      now: Date.parse('2026-10-01T12:00:00'),
    });
    expect(state.tier).toBe('free');
    if (state.tier === 'free') {
      expect(state.reason).toBe('expired');
      expect(state.trial).toBe(true);
    }
  });

  it('пометку пробы нельзя снять: она подписана вместе со сроком', async () => {
    const key = await sign(TRIAL);
    const [, signature] = key.split('.');
    const forged = encodeLicensePayload({ ...TRIAL, k: undefined });
    const state = await verifyLicenseKey(`${forged}.${signature}`, { publicJwk });
    expect(state).toEqual({ tier: 'free', reason: 'forged' });
  });

  it('бессрочная проба не разбирается: это просто бесплатная версия навсегда', () => {
    const payload = { v: 1, w: 'Х', p: 'workshop', i: '2026-09-04', k: 'trial' };
    expect(parseLicensePayload(`${encodeLicensePayload(payload as LicensePayload)}.sig`)).toBeNull();
  });

  it('чужое значение в поле типа ключ не проходит', () => {
    const payload = { ...TRIAL, k: 'forever' };
    expect(parseLicensePayload(`${encodeLicensePayload(payload as LicensePayload)}.sig`)).toBeNull();
  });

  it('остаток дней не зависит от времени суток', () => {
    const morning = daysUntil('2026-09-18', Date.parse('2026-09-10T08:00:00'));
    const evening = daysUntil('2026-09-18', Date.parse('2026-09-10T23:30:00'));
    expect(morning).toBe(evening);
  });

  it('в последний день остаётся ноль, а не минус', () => {
    expect(daysUntil('2026-09-18', Date.parse('2026-09-18T10:00:00'))).toBe(0);
  });
});
