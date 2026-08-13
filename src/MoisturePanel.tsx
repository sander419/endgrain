import { useMemo, useState } from 'react';
import { CLIMATE_PRESETS, analyseMovement, equilibriumMoisturePct } from './core';
import type { Climate, WoodSpecies } from './core';
import { Icon } from './Icon';

interface Props {
  /** Что и в какой ширине лежит в доске. */
  usage: { speciesId: string; totalWidthMm: number; stripWidthMm: number }[];
  species: Record<string, WoodSpecies>;
}

/**
 * Движение древесины — то, что опытный столяр держит в голове, а новичок
 * узнаёт после первой треснувшей доски. Показываем не только цифру, но и
 * откуда она берётся: климат → равновесная влажность → изменение размеров.
 */
export function MoisturePanel({ usage, species }: Props) {
  const [fromId, setFromId] = useState('shop-winter');
  const [toId, setToId] = useState('kitchen-humid');

  const fromClimate = CLIMATE_PRESETS.find((p) => p.id === fromId)?.climate ?? CLIMATE_PRESETS[0].climate;
  const toClimate = CLIMATE_PRESETS.find((p) => p.id === toId)?.climate ?? CLIMATE_PRESETS[3].climate;

  const report = useMemo(
    () => analyseMovement(usage, species, fromClimate, toClimate),
    [usage, species, fromClimate, toClimate]
  );

  const swelling = report.deltaMoisturePct > 0;
  const withData = report.perSpecies.filter((item) => item.hasData);

  // Порог практический: до четверти миллиметра расхождения шов переживает,
  // дальше начинает работать на разрыв.
  const risk = report.worstMismatchMm > 0.25 ? 'danger' : report.worstMismatchMm > 0.12 ? 'caution' : 'ok';

  return (
    <section className="moisture dom-water">
      <h2><Icon name="droplet" />Движение древесины</h2>

      <div className="climate-row">
        <label>
          Из
          <select value={fromId} onChange={(event) => setFromId(event.target.value)}>
            {CLIMATE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>
        <label>
          В
          <select value={toId} onChange={(event) => setToId(event.target.value)}>
            {CLIMATE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>
      </div>

      <dl className="emc">
        <div>
          <dt>{fromClimate.temperatureC} °C · {fromClimate.relativeHumidityPct}%</dt>
          <dd>{report.from.moisturePct.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>{toClimate.temperatureC} °C · {toClimate.relativeHumidityPct}%</dt>
          <dd>{report.to.moisturePct.toFixed(1)}%</dd>
        </div>
        <div className="accent">
          <dt>Влажность дерева</dt>
          <dd>{swelling ? '+' : ''}{report.deltaMoisturePct.toFixed(1)}%</dd>
        </div>
      </dl>

      {withData.length > 0 && (
        <table className="movement">
          <thead>
            <tr>
              <th>Порода</th>
              <th>Брусок</th>
              <th>Вся ширина</th>
            </tr>
          </thead>
          <tbody>
            {withData.map((item) => {
              const strip = Math.abs(item.tangentialMm!);
              const usageItem = usage.find((u) => u.speciesId === item.speciesId);
              const total = usageItem
                ? Math.abs(item.tangentialMm! * (usageItem.totalWidthMm / usageItem.stripWidthMm))
                : 0;
              return (
                <tr key={item.speciesId}>
                  <td>{item.speciesName}</td>
                  <td>{swelling ? '+' : '−'}{strip.toFixed(2)} мм</td>
                  <td>{swelling ? '+' : '−'}{total.toFixed(1)} мм</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {report.mismatchBetween && (
        <p className={`advice movement-${risk}`}>
          {risk === 'ok' ? (
            <>
              Породы движутся почти одинаково: расхождение{' '}
              {report.worstMismatchMm.toFixed(2)} мм на брусок. Шов такое переживает.
            </>
          ) : (
            <>
              <b>{report.mismatchBetween[0]}</b> двигается сильнее, чем{' '}
              <b>{report.mismatchBetween[1]}</b>, на {report.worstMismatchMm.toFixed(2)} мм
              на каждом бруске. {risk === 'danger'
                ? 'Это много: на стыке появится гребёнка, а клеевая линия будет работать на разрыв.'
                : 'Терпимо, но следи, чтобы эти породы не стояли соседями по всей длине шва.'}
            </>
          )}
        </p>
      )}

      {report.missingData > 0 && (
        <p className="note-small">
          У {report.missingData} {report.missingData === 1 ? 'породы' : 'пород'} нет сверенных
          данных по усушке — они в расчёт не вошли.
        </p>
      )}

      <p className="note-small">
        Расчёт по USDA Wood Handbook: равновесная влажность (гл. 4) и коэффициент размерных
        изменений (гл. 13). Показано тангенциальное движение — худший случай; поперёк волокон
        доска движется меньше, вдоль волокон практически не движется.
      </p>
    </section>
  );
}

/** Равновесная влажность для произвольного климата — для подписей в других местах. */
export function emcFor(climate: Climate): number {
  return equilibriumMoisturePct(climate);
}
