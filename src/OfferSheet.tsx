/**
 * Коммерческое предложение клиенту.
 *
 * Это единственный лист, который видит не мастер, а покупатель, и он решает
 * не производственную задачу, а сделку: показать вещь до того, как куплено
 * дерево. Отсюда и содержание — картинка, размеры, породы, цена, срок,
 * что входит, — и отсутствие всего производственного: клиенту незачем знать,
 * сколько щитов клеить и какой у мастерской пропил.
 *
 * Печатается тем же механизмом, что инструкция: класс `print-sheet` уже несёт
 * все правила `@media print`, поэтому отдельной вёрстки для бумаги не нужно.
 */
import { t, documentTitle, orderTotalRub } from './core';
import type { BoardFacts, Order, WorkshopProfile } from './core';
import { formatIsoDay } from './WorkshopDialog';

interface Props {
  facts: BoardFacts;
  order: Order;
  profile: WorkshopProfile;
  /** Имя из лицензии — подпись, если своё название не задано. */
  licensedTo?: string;
  boardImage: string | null;
}

const money = (value: number) => Math.round(value).toLocaleString('ru-RU');

/** Предложение живёт две недели: цена материала за месяц успевает уехать. */
export const OFFER_VALID_DAYS = 14;

export function offerValidUntil(createdAt: string, days = OFFER_VALID_DAYS): string {
  const date = new Date(`${createdAt}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function OfferSheet({ facts, order, profile, licensedTo, boardImage }: Props) {
  const title = documentTitle(profile, licensedTo);
  const total = orderTotalRub(order);
  const validUntil = offerValidUntil(order.createdAt);

  return (
    <div className="print-sheet offer-sheet">
      <header className="sheet-head">
        {profile.logoDataUri && <img className="sheet-logo" src={profile.logoDataUri} alt="" />}
        <div>
          {title && <div className="sheet-workshop">{title}</div>}
          {profile.contact && <div className="sheet-contact">{profile.contact}</div>}
        </div>
      </header>

      <h1>{t('offer.title')}</h1>
      <p className="sub">
        {t('offer.number', { code: facts.code || '—', date: formatIsoDay(order.createdAt) })}
        {order.customer ? ` · ${t('offer.for', { customer: order.customer })}` : ''}
      </p>

      {boardImage && <img className="preview" src={boardImage} alt="" />}

      <h2>{t('offer.product')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('offer.col.what')}</th>
            <th>{t('offer.col.value')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('offer.row.size')}</td>
            <td>
              {Math.round(facts.lengthMm)} × {Math.round(facts.widthMm)} ×{' '}
              {Math.round(facts.thicknessMm)}
            </td>
          </tr>
          <tr>
            <td>{t('offer.row.species')}</td>
            <td>{facts.species.map((item) => item.name).join(', ') || '—'}</td>
          </tr>
          <tr>
            <td>{t('offer.row.weight')}</td>
            <td>{facts.massKg > 0 ? facts.massKg.toFixed(1) : '—'}</td>
          </tr>
          <tr>
            <td>{t('offer.row.count')}</td>
            <td>{order.count}</td>
          </tr>
          <tr>
            <td>{t('offer.row.price')}</td>
            <td>
              {order.pricePerBoardRub > 0
                ? money(order.pricePerBoardRub)
                : t('offer.priceOnRequest')}
            </td>
          </tr>
          <tr className="total">
            <td>{t('offer.row.total')}</td>
            <td>{total > 0 ? money(total) : t('offer.priceOnRequest')}</td>
          </tr>
          <tr>
            <td>{t('offer.row.due')}</td>
            <td>{order.dueAt ? formatIsoDay(order.dueAt) : t('offer.noDue')}</td>
          </tr>
        </tbody>
      </table>

      {order.note && <p className="note">{order.note}</p>}

      <h2>{t('offer.included')}</h2>
      <p>{t('offer.included.body')}</p>

      <footer>
        <p className="note">{t('offer.validity', { date: formatIsoDay(validUntil) })}</p>
        {profile.contact && <p className="note">{profile.contact}</p>}
      </footer>
    </div>
  );
}
