import type { MosaicPlan, WoodSpecies } from './core';
import { nestPieces } from './core/nesting';
import {
  CLIMATE_PRESETS,
  analyseMovement,
  calculateEconomics,
  formatDuration,
  loadProfile,
  plural,
} from './core';

interface Props {
  plan: MosaicPlan;
  species: Record<string, WoodSpecies>;
  cellMm: number;
  /** Ширина пропила — она же входит в карту раскроя. */
  kerfMm: number;
  boardImage: string | null;
}

/**
 * Инструкция для мозаики. Главное здесь — таблица щитов: порядок брусков
 * в каждом и карта, какая планка доски из какого щита и какой стороной.
 * Без неё рисунок из нескольких щитов не собрать.
 */
export function MosaicPrintSheet({ plan, species, cellMm, kerfMm, boardImage }: Props) {
  const dims = plan.finalDimensions;
  const name = (id: string) => species[id]?.name ?? id;

  // Карта сборки: для каждой колонки доски — номер щита и нужен ли переворот.
  const assembly: { col: number; panel: number; flipped: boolean }[] = [];
  for (const panel of plan.panels) {
    for (const column of panel.columns) {
      assembly.push({ col: column.col, panel: panel.index, flipped: column.flipped });
    }
  }
  assembly.sort((a, b) => a.col - b.col);

  const piecesTotal = plan.materials.reduce((sum, material) => sum + material.pieces, 0);

  // Карта раскроя — по тому же размеру покупной доски, что выбран на экране.
  const profile = loadProfile();
  const stock = profile.stock;
  const nest = nestPieces(
    plan.panels.flatMap((panel) =>
      panel.order.map((speciesId, index) => ({
        pieceId: `p${panel.index}-${index}`,
        speciesId,
        lengthMm: panel.roughLengthMm,
        widthMm: cellMm + 2,
      }))
    ),
    stock,
    kerfMm
  );

  const economics = calculateEconomics(
    {
      strips: plan.totals.stripsToPrepare,
      glueUps: plan.totals.glueUps,
      crosscuts: plan.totals.crosscuts,
      lengthMm: dims.topLengthMm,
      widthMm: dims.topWidthMm,
      materialCostRub: plan.totals.totalCost,
    },
    profile.rates
  );

  const shopClimate = CLIMATE_PRESETS.find((p) => p.id === 'shop-winter')!.climate;
  const kitchenClimate = CLIMATE_PRESETS.find((p) => p.id === 'kitchen-humid')!.climate;
  const movement = analyseMovement(
    plan.materials.map((material) => ({
      speciesId: material.speciesId,
      totalWidthMm: cellMm * plan.rows,
      stripWidthMm: cellMm,
    })),
    species,
    shopClimate,
    kitchenClimate
  );

  const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

  return (
    <div className="print-sheet">
      <header>
        <h1>Торцевая доска — мозаика</h1>
        <p className="sub">
          {Math.round(dims.topLengthMm)} × {Math.round(dims.topWidthMm)} × {Math.round(dims.thicknessMm)} мм ·{' '}
          {plan.cols} × {plan.rows} клеток по {cellMm} мм · отходы {plan.totals.wastePct.toFixed(1)}%
        </p>
      </header>

      {boardImage && <img className="preview" src={boardImage} alt="Рисунок доски" />}

      <h2>1. Заготовка брусков</h2>
      <p className="note">
        Все бруски квадратного сечения {cellMm} × {cellMm} мм (черновые {cellMm + 2} × {cellMm + 3} мм
        с припуском на фугование и рейсмус). Всего {piecesTotal} шт — длины по щитам ниже.
      </p>
      <table>
        <thead>
          <tr><th>Порода</th><th>Брусков</th><th>Сырой объём</th><th>Стоимость</th></tr>
        </thead>
        <tbody>
          {plan.materials.map((material) => (
            <tr key={material.speciesId}>
              <td>{material.speciesName}</td>
              <td>{material.pieces} шт</td>
              <td>{material.rawVolumeM3.toFixed(5)} м³</td>
              <td>{Math.round(material.cost).toLocaleString('ru-RU')} ₽</td>
            </tr>
          ))}
          <tr className="total">
            <td>Итого</td>
            <td>{piecesTotal} шт</td>
            <td>{plan.totals.rawVolumeM3.toFixed(5)} м³</td>
            <td>{Math.round(plan.totals.totalCost).toLocaleString('ru-RU')} ₽</td>
          </tr>
        </tbody>
      </table>

      <h2>Карта раскроя</h2>
      <p className="note">
        Раскрой гильотинный: доска {stock.lengthMm}×{stock.widthMm} мм торцуется на куски
        нужной длины, потом каждый кусок распускается вдоль на бруски.
      </p>
      {nest.unplaced.length > 0 && (
        <p className="note">
          Внимание: {nest.unplaced.length} брусков длиннее покупной доски — нужен материал длиннее.
        </p>
      )}
      <table>
        <thead>
          <tr><th>Доска</th><th>Брусков</th><th>Режем</th><th>Выход</th><th>Остаток</th></tr>
        </thead>
        <tbody>
          {nest.boards.map((board) => (
            <tr key={`${board.speciesId}-${board.index}`}>
              <td>{name(board.speciesId)} №{board.index}</td>
              <td>{board.pieces.length} шт</td>
              <td>{Math.round(board.usedLengthMm)} мм</td>
              <td>{board.yieldPct.toFixed(0)}%</td>
              <td>{Math.round(board.offcutLengthMm)} мм</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>2. Щиты: что склеить</h2>
      <p className="note">
        Рисунок разложен на {plan.totals.glueUps} {plural(plan.totals.glueUps, 'щит', 'щита', 'щитов')}.
        Каждый щит — набор брусков, склеенных в указанном порядке сверху вниз; из него нарезаются
        планки готовой доски.
      </p>
      <table className="scheme">
        <thead>
          <tr>
            <th>Щит</th>
            <th>Порядок брусков (сверху вниз)</th>
            <th>Планок</th>
            <th>Длина щита</th>
          </tr>
        </thead>
        <tbody>
          {plan.panels.map((panel) => (
            <tr key={panel.index}>
              <td>{panel.index}</td>
              <td className="order-list">{panel.order.map(name).join(' · ')}</td>
              <td>{panel.slices}</td>
              <td>{Math.round(panel.roughLengthMm)} мм</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>3. Распил</h2>
      <ol>
        <li>Торцевать один край каждого щита начисто.</li>
        <li>
          Нарезать планки толщиной {Math.round(dims.thicknessMm)} мм: всего{' '}
          {plan.cols} {plural(plan.cols, 'планка', 'планки', 'планок')}, {plan.totals.crosscuts} резов.
        </li>
        <li>Пометить планки номером щита сразу после распила — иначе перепутаются.</li>
      </ol>

      <h2>4. Карта сборки</h2>
      <p className="note">
        Планки ставятся слева направо. «↔» означает, что планку кладут другим концом:
        так одна и та же планка закрывает зеркальную колонку рисунка.
      </p>
      <table className="scheme">
        <thead>
          <tr>
            <th>Позиция</th>
            {assembly.map((item) => <th key={item.col}>{item.col + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Щит</td>
            {assembly.map((item) => (
              <td key={item.col}>{item.panel}{item.flipped ? ' ↔' : ''}</td>
            ))}
          </tr>
        </tbody>
      </table>

      <h2>5. Вторая склейка</h2>
      <ol>
        <li>Собрать планки насухо по карте, проверить рисунок.</li>
        <li>Склеить, стянуть струбцинами, следить за плоскостностью.</li>
        <li>Рейсмус или шлифовка до {Math.round(dims.thicknessMm)} мм, фаска, масло.</li>
      </ol>

      <h2>Движение древесины и экономика</h2>
      <p className="note">
        Из мастерской ({shopClimate.temperatureC} °C, {shopClimate.relativeHumidityPct}%) на кухню
        во время готовки ({kitchenClimate.temperatureC} °C, {kitchenClimate.relativeHumidityPct}%)
        влажность древесины меняется с {movement.from.moisturePct.toFixed(1)}% до{' '}
        {movement.to.moisturePct.toFixed(1)}%: клетка {cellMm} мм двигается на десятые доли
        миллиметра, и разница между породами ложится на клеевые швы.
        {movement.mismatchBetween && movement.worstMismatchMm > 0.12 && (
          <> Сильнее всех — {movement.mismatchBetween[0]}, расхождение с{' '}
          {movement.mismatchBetween[1]} составляет {movement.worstMismatchMm.toFixed(2)} мм
          на клетку.</>
        )}
      </p>
      <table>
        <tbody>
          <tr><td>Время работы (оценка)</td><td>{formatDuration(economics.time.totalMin)}</td></tr>
          <tr><td>Материал</td><td>{money(economics.materialRub)}</td></tr>
          <tr><td>Труд и накладные</td><td>{money(economics.labourRub + economics.overheadRub)}</td></tr>
          <tr className="total"><td>Себестоимость</td><td>{money(economics.costRub)}</td></tr>
          <tr className="total">
            <td>Цена продажи</td>
            <td>{money(economics.priceRangeRub[0])} — {money(economics.priceRangeRub[1])}</td>
          </tr>
        </tbody>
      </table>

      <h2>Чек-лист</h2>
      <ul className="checklist">
        <li>☐ Бруски выструганы в размер ({piecesTotal} шт)</li>
        <li>☐ Щиты склеены ({plan.totals.glueUps})</li>
        <li>☐ Планки нарезаны и помечены ({plan.cols})</li>
        <li>☐ Доска собрана насухо по карте</li>
        <li>☐ Вторая склейка стянута</li>
        <li>☐ Плоскость выведена, фаска снята</li>
        <li>☐ Масло нанесено, выдержка сутки</li>
      </ul>
    </div>
  );
}
