/**
 * Заказы: список, правка, документы.
 *
 * Заказ заводится с текущей доски, поэтому кнопка одна и без формы «выберите
 * изделие»: то, что на экране, и есть предмет заказа. Дальше правится прямо
 * в списке — отдельный экран редактирования на четыре поля был бы лишним шагом
 * между звонком и записью.
 *
 * Печать документов включена только для заказа, доска которого сейчас открыта.
 * Иначе предложение ушло бы клиенту с картинкой чужой доски — ошибка, которую
 * замечают уже после отправки.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useWorkshop } from './WorkshopContext';
import {
  ORDER_STATUSES,
  addOrder,
  createOrder,
  daysLeft,
  exportOrders,
  importOrders,
  orderTotalRub,
  recipeCode,
  removeOrder,
  sortOrders,
  t,
  tcount,
  updateOrder,
} from './core';
import type { BoardFacts, Order, OrderStatus } from './core';

interface Props {
  orders: Order[];
  onChange: (orders: Order[]) => void;
  /** Доска, открытая прямо сейчас. `null` — режим ничего не отдал. */
  facts: BoardFacts | null;
  onPrint: (kind: 'offer' | 'passport', order: Order) => void;
  onOpen: (order: Order) => void;
  onClose: () => void;
}

const STATUS_KEY: Record<OrderStatus, Parameters<typeof t>[0]> = {
  draft: 'orders.status.draft',
  quoted: 'orders.status.quoted',
  accepted: 'orders.status.accepted',
  inWork: 'orders.status.inWork',
  done: 'orders.status.done',
  cancelled: 'orders.status.cancelled',
};

const money = (value: number) => Math.round(value).toLocaleString('ru-RU');

/** Как показать срок: словами, а не датой — «через сколько» читается быстрее. */
export function dueLabel(order: Order, now: Date = new Date()): string {
  const left = daysLeft(order, now);
  if (left === null) return t('orders.due.none');
  if (left === 0) return t('orders.due.today');
  if (left < 0) return t('orders.due.overdue', { days: tcount('unit.day', -left) });
  return t('orders.due.left', { days: tcount('unit.day', left) });
}

export function OrdersDialog({ orders, onChange, facts, onPrint, onOpen, onClose }: Props) {
  const { profile } = useWorkshop();
  const [note, setNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onCreate = () => {
    if (!facts) return;
    const order = createOrder({
      dna: facts.dna,
      mode: facts.mode,
      summary: facts.summary,
      count: 1,
    });
    onChange(addOrder(orders, order));
    setNote(t('orders.created'));
  };

  const patch = (id: string, changes: Partial<Order>) => onChange(updateOrder(orders, id, changes));

  const onExport = () => {
    const blob = new Blob([exportOrders(orders)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'endgrain-заказы.json';
    link.click();
    URL.revokeObjectURL(url);
    setNote(t('orders.export.done'));
  };

  const onImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const loaded = importOrders(typeof reader.result === 'string' ? reader.result : '');
      if (!loaded) {
        setNote(t('orders.import.failed'));
        return;
      }
      onChange(loaded);
      setNote(t('orders.import.done', { count: loaded.length }));
    };
    reader.onerror = () => setNote(t('orders.import.failed'));
    reader.readAsText(file);
  };

  const sorted = sortOrders(orders);

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div
        className="help orders-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orders-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="orders-title">{t('orders.title')}</h2>
          <button ref={closeRef} className="icon" onClick={onClose} aria-label={t('workshop.action.close')}>✕</button>
        </header>

        <div className="workshop-actions">
          <button className="primary" onClick={onCreate} disabled={!facts}>
            <Icon name="board" size={13} />
            {t('orders.action.create')}
          </button>
        </div>

        {sorted.length === 0 && <p className="help-note">{t('orders.empty')}</p>}

        <ul className="order-list">
          {sorted.map((order) => {
            const sameBoard = !!facts && !!order.dna && order.dna === facts.dna;
            const overdue = (daysLeft(order) ?? 1) < 0;
            return (
              <li key={order.id} className={overdue ? 'overdue' : ''}>
                <div className="order-head">
                  <input
                    type="text"
                    className="order-customer"
                    value={order.customer}
                    placeholder={t('orders.field.customerPlaceholder')}
                    onChange={(event) => patch(order.id, { customer: event.target.value })}
                  />
                  <select
                    value={order.status}
                    onChange={(event) =>
                      patch(order.id, { status: event.target.value as OrderStatus })
                    }
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(STATUS_KEY[status])}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="order-summary">
                  {order.summary || t('orders.noBoard')}
                  {order.dna ? ` · ${t('orders.code', { code: recipeCode(order.dna) })}` : ''}
                </p>

                <div className="order-fields">
                  <label>
                    <span>{t('orders.field.count')}</span>
                    <input
                      type="number"
                      min={1}
                      value={order.count}
                      onChange={(event) => patch(order.id, { count: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>{t('orders.field.price')}</span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={order.pricePerBoardRub}
                      onChange={(event) =>
                        patch(order.id, { pricePerBoardRub: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('orders.field.due')}</span>
                    <input
                      type="date"
                      value={order.dueAt}
                      onChange={(event) => patch(order.id, { dueAt: event.target.value })}
                    />
                  </label>
                </div>

                <input
                  type="text"
                  className="order-note"
                  value={order.note}
                  placeholder={t('orders.field.notePlaceholder')}
                  onChange={(event) => patch(order.id, { note: event.target.value })}
                />

                <p className="order-meta">
                  <b>{t('orders.total', { total: money(orderTotalRub(order)) })}</b>
                  {' · '}
                  {dueLabel(order)}
                </p>

                <div className="order-actions">
                  {order.dna && !sameBoard && (
                    <button onClick={() => onOpen(order)}>{t('orders.action.open')}</button>
                  )}
                  <button
                    disabled={!sameBoard}
                    title={sameBoard ? undefined : t('orders.otherBoard')}
                    onClick={() => onPrint('offer', order)}
                  >
                    <Icon name="print" size={12} />
                    {t('orders.action.offer')}
                  </button>
                  <button
                    disabled={!sameBoard}
                    title={sameBoard ? undefined : t('orders.otherBoard')}
                    onClick={() => onPrint('passport', order)}
                  >
                    <Icon name="print" size={12} />
                    {t('orders.action.passport')}
                  </button>
                  <button
                    className="link"
                    onClick={() => {
                      onChange(removeOrder(orders, order.id));
                      setNote(t('orders.removed'));
                    }}
                  >
                    {t('orders.action.remove')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="workshop-actions">
          <button onClick={onExport} disabled={orders.length === 0}>
            <Icon name="download" size={13} />
            {t('orders.action.export')}
          </button>
          <button onClick={() => fileRef.current?.click()}>{t('orders.action.import')}</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            onImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        {!profile.name && <p className="help-note">{t('orders.noWorkshopName')}</p>}
        {note && <p className="workshop-note">{note}</p>}
      </div>
    </div>
  );
}
