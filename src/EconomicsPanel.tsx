import { useMemo, useState } from 'react';
import { calculateEconomics, formatDuration } from './core';
import type { ProductionInput, WorkshopRates } from './core';
import { Icon } from './Icon';
import { useWorkshop } from './WorkshopContext';

interface Props {
  input: ProductionInput;
}

/**
 * «Стоит ли вообще браться». Материал — меньшая часть себестоимости штучного
 * изделия, основное съедает время, поэтому показываем и его тоже.
 */
export function EconomicsPanel({ input }: Props) {
  // Ставки живут в профиле, а не здесь: их же читают партия и печатный лист,
  // и вторая копия состояния разъезжалась бы с первой.
  const { profile, patch: patchProfile } = useWorkshop();
  const rates = profile.rates;
  const [open, setOpen] = useState(false);

  const economics = useMemo(() => calculateEconomics(input, rates), [input, rates]);

  const patch = (changes: Partial<WorkshopRates>) =>
    patchProfile({ rates: { ...rates, ...changes } });

  const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

  return (
    <section className="economics dom-money">
      <h2><Icon name="coin" />Стоит ли браться</h2>

      <dl>
        <div><dt>Работы</dt><dd>{formatDuration(economics.time.totalMin)}</dd></div>
        <div><dt>Материал</dt><dd>{money(economics.materialRub)}</dd></div>
        <div><dt>Расходники</dt><dd>{money(economics.consumablesRub + economics.utilitiesRub)}</dd></div>
        <div><dt>Труд и накладные</dt><dd>{money(economics.labourRub + economics.overheadRub)}</dd></div>
        <div className="accent"><dt>Себестоимость</dt><dd>{money(economics.costRub)}</dd></div>
      </dl>

      <div className="price-box">
        <span className="price-label">Цена продажи</span>
        <b className="price">
          {money(economics.priceRangeRub[0])} — {money(economics.priceRangeRub[1])}
        </b>
        <span className="price-note">
          при наценке {rates.targetMarginPct}%. Прибыль {money(economics.profitRub)},
          выходит {money(economics.effectiveHourlyRub)} в час.
        </span>
      </div>

      {economics.materialSharePct > 55 && (
        <p className="advice">
          Материал занимает {economics.materialSharePct.toFixed(0)}% себестоимости — необычно много
          для штучной работы. Дешевле выйдет, если заменить часть дорогой породы на местную:
          на рисунке это почти не скажется, а на цене скажется сразу.
        </p>
      )}

      <button className="link" onClick={() => setOpen(!open)}>
        {open ? 'Свернуть ставки' : 'Настроить ставки мастерской'}
      </button>

      {open && (
        <div className="rates">
          <label>
            Ставка, ₽/час
            <input
              type="number" min={0} max={100000} value={rates.hourlyRateRub}
              onChange={(event) => patch({ hourlyRateRub: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          <label>
            Расходники, ₽
            <input
              type="number" min={0} max={100000} value={rates.consumablesRub}
              onChange={(event) => patch({ consumablesRub: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          <label>
            Электричество, ₽
            <input
              type="number" min={0} max={100000} value={rates.utilitiesRub}
              onChange={(event) => patch({ utilitiesRub: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          <label>
            Накладные, %
            <input
              type="number" min={0} max={200} value={rates.overheadPct}
              onChange={(event) => patch({ overheadPct: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          <label>
            Наценка, %
            <input
              type="number" min={0} max={1000} value={rates.targetMarginPct}
              onChange={(event) => patch({ targetMarginPct: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          <p className="note-small">
            Время считается по нормативам мастерской-одиночки: {formatDuration(economics.time.stripsMin)} на
            бруски, {formatDuration(economics.time.glueUpMin)} на склейки,{' '}
            {formatDuration(economics.time.crosscutMin)} на распил,{' '}
            {formatDuration(economics.time.sandingMin)} на шлифовку,{' '}
            {formatDuration(economics.time.finishingMin)} на финиш. Это оценка, а не замер:
            у каждого своя скорость.
          </p>
        </div>
      )}
    </section>
  );
}
