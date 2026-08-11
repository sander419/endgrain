import type { MosaicPlan, WoodSpecies } from './core';
import { plural } from './core';

interface Props {
  plan: MosaicPlan;
  species: Record<string, WoodSpecies>;
  cellMm: number;
  boardImage: string | null;
}

/**
 * Инструкция для мозаики. Главное здесь — таблица щитов: порядок брусков
 * в каждом и карта, какая планка доски из какого щита и какой стороной.
 * Без неё рисунок из нескольких щитов не собрать.
 */
export function MosaicPrintSheet({ plan, species, cellMm, boardImage }: Props) {
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
              <td className="how">{panel.order.map(name).join(' · ')}</td>
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
