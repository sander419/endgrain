/**
 * Лицензия мастерской: проверка ключа на этом компьютере, без бэкенда.
 *
 * ЧЕСТНО О ТОМ, ЧТО ЭТО ТАКОЕ. Исходники публичные, и проверку ниже снимет
 * любой, кто умеет читать TypeScript. Это не замок, а расписка. Барьер здесь
 * не технический: мастерская — это бизнес, который платит за инструмент,
 * потому что платить дешевле, чем держать человека, умеющего пересобрать
 * чужой проект. Строить обфускацию против такого покупателя — тратить время
 * на самообман. Поэтому её здесь нет и не будет (docs/ROADMAP.md).
 *
 * ПОЧЕМУ ECDSA P-256, А НЕ Ed25519. Ed25519 в WebCrypto моложе, и на машине
 * в цеху может оказаться браузер, который его не знает. P-256 поддерживается
 * везде больше десяти лет. Криптографически для расписки хватает обоих,
 * а неработающая проверка на чужом компьютере стоит дороже разницы в стойкости.
 *
 * ГЛАВНОЕ ПРАВИЛО. Провал проверки роняет в бесплатный режим молча.
 * Ни модалок «купите», ни блокировок: сломанная проверка не должна
 * останавливать работу в цеху. Бесплатная часть — проектирование, расчёт,
 * раскрой, инструкция — работает всегда и не знает про этот модуль.
 */
import { toBase64Url, fromBase64Url } from './share';
import { PUBLIC_KEY } from './licensePublicKey';

export { PUBLIC_KEY };

export type LicenseTier = 'free' | 'workshop';

/** Почему ключа нет. Показывается человеку, не влияет на работу приложения. */
export type FreeReason =
  | 'none' // ключ не вводили
  | 'malformed' // не разбирается: не та строка, обрезали при копировании
  | 'forged' // подпись не сходится с нашим публичным ключом
  | 'expired'; // срок вышел

export interface LicensePayload {
  /** Версия формата ключа. */
  v: 1;
  /** Название мастерской. Попадает в документы, поэтому оно же и подписано. */
  w: string;
  /** Тариф. Пока один, но поле есть — иначе второй тариф потребует новых ключей. */
  p: 'workshop';
  /** Дата выпуска, ISO. */
  i: string;
  /** Дата окончания, ISO. Пусто — бессрочная. */
  e?: string;
  /**
   * Пробный ключ. Поле необязательное: ключи, выпущенные до появления пробы,
   * читаются как обычные — иначе их пришлось бы перевыпускать.
   *
   * Проба открывает то же самое, что покупка. Урезанная проба показывает
   * не продукт, а его тень, и по ней невозможно решить, стоит ли платить.
   * Отличается только тем, что приложение честно называет её пробой
   * и говорит, сколько осталось.
   */
  k?: 'trial';
}

export type LicenseState =
  | { tier: 'free'; reason: FreeReason; workshop?: string; expiresAt?: string; trial?: boolean }
  | {
      tier: 'workshop';
      workshop: string;
      issuedAt: string;
      expiresAt?: string;
      /** Проба, а не покупка. Влияет только на то, что написано человеку. */
      trial: boolean;
      /** Сколько дней осталось. `null` — бессрочный ключ. */
      daysLeft: number | null;
    };

export const FREE: LicenseState = { tier: 'free', reason: 'none' };

export const LICENSE_STORAGE_KEY = 'endgrain.license.v1';

/**
 * Запас на неверные часы. Компьютер в мастерской вполне может отставать
 * на день-другой, и отнимать за это доступ — наказывать не того.
 */
export const CLOCK_GRACE_DAYS = 3;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Буфер создаётся явно: `Uint8Array.from` даёт `Uint8Array<ArrayBufferLike>`,
 * а `crypto.subtle.verify` требует именно `ArrayBuffer` — с `SharedArrayBuffer`
 * подпись не проверить.
 */
function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = base64.length % 4;
  const padded = padLength > 0 ? base64 + '='.repeat(4 - padLength) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Разбор без проверки подписи. Отдельно от `verifyLicenseKey`, потому что
 * подпись асинхронна, а форму ключа полезно проверить сразу — например,
 * чтобы сказать «ключ обрезали при копировании» до всякой криптографии.
 */
export function parseLicensePayload(key: string): LicensePayload | null {
  const parts = key.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const payload = JSON.parse(fromBase64Url(parts[0])) as LicensePayload;
    if (payload?.v !== 1 || payload.p !== 'workshop') return null;
    if (typeof payload.w !== 'string' || !payload.w.trim()) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.i)) return null;
    if (payload.e !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(payload.e)) return null;
    if (payload.k !== undefined && payload.k !== 'trial') return null;
    // Бессрочная проба — бессмыслица: это просто бесплатная версия навсегда.
    if (payload.k === 'trial' && !payload.e) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Последний момент, когда ключ ещё действует: конец дня плюс запас на часы. */
export function expiryDeadline(expiresAt: string): number {
  const day = Date.parse(`${expiresAt}T23:59:59.999Z`);
  return day + CLOCK_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { ...jwk, key_ops: ['verify'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
}

/**
 * Проверка ключа. Возвращает состояние, а не бросает: у этого модуля нет
 * права остановить приложение.
 *
 * `now` и `publicJwk` — параметры, а не глобальные значения, чтобы тест мог
 * проверить просроченный ключ, не переводя системные часы, и подписать
 * свой ключ, не имея настоящего приватного.
 */
export async function verifyLicenseKey(
  key: string,
  options: { now?: number; publicJwk?: JsonWebKey } = {}
): Promise<LicenseState> {
  const trimmed = key.trim();
  if (!trimmed) return { tier: 'free', reason: 'none' };

  const payload = parseLicensePayload(trimmed);
  if (!payload) return { tier: 'free', reason: 'malformed' };

  const [payloadB64, signatureB64] = trimmed.split('.');
  let signed = false;
  try {
    const publicKey = await importPublicKey(options.publicJwk ?? PUBLIC_KEY);
    signed = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlToBytes(signatureB64),
      new TextEncoder().encode(payloadB64)
    );
  } catch {
    // Сломанный публичный ключ, отсутствующий crypto.subtle, мусор в подписи —
    // всё это значит «лицензии нет», а не «приложение не работает».
    signed = false;
  }
  if (!signed) return { tier: 'free', reason: 'forged' };

  if (payload.e) {
    const now = options.now ?? Date.now();
    if (now > expiryDeadline(payload.e)) {
      // Название мастерской отдаём и здесь: человеку надо видеть, чей ключ истёк.
      return {
        tier: 'free',
        reason: 'expired',
        workshop: payload.w,
        expiresAt: payload.e,
        trial: payload.k === 'trial',
      };
    }
  }

  return {
    tier: 'workshop',
    workshop: payload.w,
    issuedAt: payload.i,
    expiresAt: payload.e,
    trial: payload.k === 'trial',
    daysLeft: payload.e ? daysUntil(payload.e, options.now ?? Date.now()) : null,
  };
}

/**
 * Сколько календарных дней осталось до конца срока. Ноль — истекает сегодня.
 *
 * Календарными, а не по миллисекундам: «осталось 3 дня» не должно превращаться
 * в «2 дня» оттого, что человек открыл приложение вечером.
 */
export function daysUntil(expiresAt: string, now: number): number {
  const end = new Date(`${expiresAt}T00:00:00`);
  const today = new Date(now);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end.getTime() - midnight.getTime()) / 86_400_000);
}

/** Собрать тело ключа. Используется CLI выпуска и тестами; подпись — снаружи. */
export function encodeLicensePayload(payload: LicensePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function joinLicenseKey(payloadB64: string, signature: Uint8Array): string {
  return `${payloadB64}.${bytesToBase64Url(signature)}`;
}

export function isPro(state: LicenseState): boolean {
  return state.tier === 'workshop';
}

export function loadLicenseKey(): string {
  try {
    return localStorage.getItem(LICENSE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLicenseKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(LICENSE_STORAGE_KEY, key.trim());
    else localStorage.removeItem(LICENSE_STORAGE_KEY);
  } catch {
    /* приватный режим: ключ не переживёт перезагрузку, но работать не мешает */
  }
}
