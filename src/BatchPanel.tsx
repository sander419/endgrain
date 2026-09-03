/**
 * Партия: сколько просить за тираж.
 *
 * Отдельно от панели «Стоит ли браться», потому что отвечает на другой вопрос.
 * Там — «браться ли за эту доску», здесь — «во что обойдётся десятая».
 * Смешать их значило бы показывать цену партии тому, кто считает одну штуку.
 */
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useWorkshop } from './WorkshopContext';
import {
  MAX_BATCH,
  calculateBatch,
  estimateBatchMaterial,
  formatDuration,
  t,
  tcount,
} from './core';
import type { NestPiece, ProductionInput } from './core';

interface Props {
  input: ProductionInput;
  /** Детали для раскроя: по ним считается экономия материала. */
  pieces: NestPiece[];
  kerfMm: number;
}

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

export function BatchPanel({ input, pieces, kerfMm }: Props) {
  const { profile } = useWorkshop();
  const [count, setCount] = useState(5);

  const material = useMemo(
    () => estimateBatchMaterial(pieces, count, profile.stock, kerfMm),
    [pieces, count, profile.stock, kerfMm]
  );

  const batch = useMemo(() => {
    // Экономия материала считается раскроем, а не формулой партии, поэтому
    // приходит сюда отдельным числом: материал на доску внутри партии.
    const perBoard =
      material.boardsIfSeparate > 0
        ? (input.materialCostRub * material.boards) / material.boardsIfSeparate
        : input.materialCostRub;
    return calculateBatch(input, count, profile.rates, profile.norms, {
      materialPerBoardRub: perBoard,
    });
  }, [input, count, profile.rates, profile.norms, material]);

  return (
    <section className="batch dom-money">
      <h2><Icon name="layers" />{t('batch.title')}</h2>

      <label className="batch-count">
        {t('batch.field.count')}
        <input
          type="number"
          min={1}
          max={MAX_BATCH}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />
      </label>

      <dl>
        <div>
          <dt>{t('batch.single')}</dt>
          <dd>{money(batch.single.costRub)}</dd>
        </div>
        <div className="accent">
          <dt>{t('batch.perBoard')}</dt>
          <dd>{money(batch.perBoard.costRub)}</dd>
        </div>
        <div>
          <dt>{t('batch.time')}</dt>
          <dd>{formatDuration(batch.time.total.totalMin)}</dd>
        </div>
        <div>
          <dt>{t('batch.total')}</dt>
          <dd>{money(batch.totalCostRub)}</dd>
        </div>
        <div>
          <dt>{t('batch.price')}</dt>
          <dd>{money(batch.totalPriceRub)}</dd>
        </div>
        <div>
          <dt>{t('batch.marginal')}</dt>
          <dd>{money(batch.marginalCostRub)}</dd>
        </div>
      </dl>

      {batch.savingPct > 0.5 && (
        <p className="ok">{t('batch.saving', { pct: batch.savingPct.toFixed(0) })}</p>
      )}

      <p className="note-small">
        {material.boardsSaved > 0
          ? t('batch.material', { boards: tcount('unit.boardAcc', material.boardsSaved) })
          : t('batch.materialNone')}
        {' '}
        {t('batch.estimate')}
      </p>

      <p className="note-small">{t('batch.lead')}</p>
    </section>
  );
}
