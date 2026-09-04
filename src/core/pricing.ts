/**
 * Цена и путь к покупке.
 *
 * Отдельным модулем, потому что эти пять значений расходятся по README,
 * экрану покупки и письму покупателю, а разъехавшаяся цена в двух местах —
 * это спор с клиентом на ровном месте.
 *
 * Почему цена вообще зашита в бандл, а не берётся с сервера: сервера нет
 * и не будет. Цена меняется выкатом, как и всё остальное.
 */

export interface Pricing {
  /** Ключ на год, ₽. */
  yearRub: number;
  /** Бессрочный ключ, ₽. */
  foreverRub: number;
  /** Сколько длится проба. */
  trialDays: number;
  /**
   * Ник в Telegram, куда пишут за ключом, без собаки.
   * Пусто — кнопка «написать» не показывается, а не ведёт в никуда.
   */
  telegram: string;
}

export const PRICING: Pricing = {
  yearRub: 4900,
  foreverRub: 12900,
  trialDays: 14,
  telegram: '',
};

export function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

/** Есть ли вообще куда писать. */
export function canContact(pricing: Pricing = PRICING): boolean {
  return pricing.telegram.trim().length > 0;
}

export type PurchaseIntent = 'trial' | 'year' | 'forever';

/**
 * Текст запроса. Подставляется в ссылку заранее, чтобы мастерской осталось
 * дописать название и нажать «отправить»: письмо, которое надо сочинять,
 * пишут заметно реже.
 */
export function purchaseMessage(intent: PurchaseIntent, workshop: string): string {
  const name = workshop.trim();
  const who = name ? `Мастерская: ${name}.` : 'Название мастерской: ';
  if (intent === 'trial') {
    return `Здравствуйте! Прошу пробный ключ End-Grain на ${PRICING.trialDays} дней. ${who}`;
  }
  const what =
    intent === 'year'
      ? `ключ на год за ${formatRub(PRICING.yearRub)}`
      : `бессрочный ключ за ${formatRub(PRICING.foreverRub)}`;
  return `Здравствуйте! Хочу купить ${what} для End-Grain. ${who}`;
}

/**
 * Ссылка в Telegram. Пустая строка, если писать некуда.
 *
 * Текст запроса сюда не подставляется: у личных чатов Telegram нет параметра
 * с сообщением. Поэтому `purchaseMessage` показывается рядом с кнопкой —
 * его копируют одним нажатием.
 */
export function purchaseLink(pricing: Pricing = PRICING): string {
  const handle = pricing.telegram.trim().replace(/^@/, '');
  return handle ? `https://t.me/${handle}` : '';
}
