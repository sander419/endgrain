import type { Recipe, RecipeProjection, JoineryWarning } from './core';
import {
  CLIMATE_PRESETS,
  analyseMovement,
  assessWorkshop,
  calculateEconomics,
  formatDuration,
  formatLength,
  getSliceStripIndices,
  loadProfile,
  plural,
} from './core';
import { nestPieces } from './core/nesting';

interface Props {
  recipe: Recipe;
  projection: RecipeProjection;
  warnings: JoineryWarning[];
  boardImage: string | null;
  shareUrl: string;
}

/**
 * Печатный лист для мастерской. PDF делает сам браузер (Ctrl+P → «Сохранить как PDF»),
 * поэтому никакой jsPDF: он не умеет кириллицу без вшитого шрифта на треть мегабайта.
 */
/**
 * Человеческое описание планки: столяр должен понять, что делать с куском дерева,
 * не сверяясь с индексами. Порядок как в щите — «как есть», развёрнутый — «на 180°»,
 * всё остальное — распустить и переклеить в указанном порядке.
 */
function describeSlice(recipe: Recipe, row: number[], sliceIndex: number): string {
  const natural = recipe.panel.strips.map((_, index) => index);
  const reversed = [...natural].reverse();
  const manual = Array.isArray(recipe.transform.manualSlices?.[sliceIndex]);

  if (row.join() === natural.join()) return 'как из щита';
  if (row.join() === reversed.join()) return 'повернуть на 180°';
  return manual ? 'распустить и переклеить (правлено вручную)' : 'распустить и переклеить';
}

export function PrintSheet({ recipe, projection, warnings, boardImage, shareUrl }: Props) {
  const units = recipe.units;
  const dims = projection.finalDimensions;
  const cuts = Math.max(0, projection.sliceCount - 1);
  const roughLength = projection.panel.requiredRoughLengthMm;
  const roughThickness = recipe.panel.stripThicknessMm + recipe.allowances.thicknessSurfacingMm;
  const matrix = getSliceStripIndices(recipe, projection.sliceCount);

  // Бруски одной породы и ширины — одна строка спецификации.
  const groups = new Map<string, { speciesId: string; widthMm: number; count: number }>();
  for (const strip of recipe.panel.strips) {
    const key = `${strip.speciesId}:${strip.widthMm}`;
    const found = groups.get(key);
    if (found) found.count += 1;
    else groups.set(key, { speciesId: strip.speciesId, widthMm: strip.widthMm, count: 1 });
  }

  // Карта раскроя считается по тому же размеру доски, что выбран на экране.
  const profile = loadProfile();
  const stock = profile.stock;
  const nest = nestPieces(
    projection.cutList.map((piece) => ({
      pieceId: piece.pieceId,
      speciesId: piece.speciesId,
      lengthMm: piece.lengthMm,
      widthMm: piece.widthMm,
    })),
    stock,
    recipe.crosscut.sawKerfMm
  );

  const economics = calculateEconomics(
    {
      strips: recipe.panel.strips.length,
      glueUps: 1,
      crosscuts: cuts,
      lengthMm: dims.topLengthMm,
      widthMm: dims.topWidthMm,
      materialCostRub: projection.totals.totalCost,
    },
    profile.rates
  );

  // Движение считаем между сборкой в зимней мастерской и худшими условиями
  // на кухне — именно этот перепад и рвёт клеевые швы.
  const shopClimate = CLIMATE_PRESETS.find((p) => p.id === 'shop-winter')!.climate;
  const kitchenClimate = CLIMATE_PRESETS.find((p) => p.id === 'kitchen-humid')!.climate;
  const movement = analyseMovement(
    [...groups.values()].map((group) => ({
      speciesId: group.speciesId,
      totalWidthMm: group.widthMm * group.count,
      stripWidthMm: group.widthMm,
    })),
    recipe.species,
    shopClimate,
    kitchenClimate
  );

  const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

  // Порядок работ переписан под набор станков, отмеченный в приложении:
  // инструкция под чужую мастерскую бесполезна.
  const workshop = assessWorkshop(profile.tools);

  return (
    <div className="print-sheet">
      <header>
        <h1>Торцевая разделочная доска</h1>
        <p className="sub">
          {formatLength(dims.topLengthMm, units)} × {formatLength(dims.topWidthMm, units)} × {formatLength(dims.thicknessMm, units)}
          {' · '}{projection.sliceCount} планок · отходы {projection.totals.wastePct.toFixed(1)}%
        </p>
      </header>

      {boardImage && <img className="preview" src={boardImage} alt="Узор готовой доски" />}

      <h2>1. Заготовка брусков</h2>
      <table>
        <thead>
          <tr><th>Порода</th><th>Кол-во</th><th>Длина (черновая)</th><th>Ширина</th><th>Толщина</th></tr>
        </thead>
        <tbody>
          {[...groups.values()].map((g) => (
            <tr key={`${g.speciesId}-${g.widthMm}`}>
              <td>{recipe.species[g.speciesId]?.name ?? g.speciesId}</td>
              <td>{g.count} шт</td>
              <td>{formatLength(roughLength, units)}</td>
              <td>{formatLength(g.widthMm + recipe.allowances.stripWidthJointMm, units)}</td>
              <td>{formatLength(roughThickness, units)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        Размеры даны с припуском: по ширине +{formatLength(recipe.allowances.stripWidthJointMm, units)} на фугование кромки,
        по толщине +{formatLength(recipe.allowances.thicknessSurfacingMm, units)} на рейсмус,
        по длине +{formatLength(recipe.allowances.panelEndTrimMm, units)} на торцовку щита.
      </p>

      <h2>Карта раскроя</h2>
      <p className="note">
        Раскрой гильотинный: доска торцуется на куски нужной длины, потом каждый кусок
        распускается вдоль. Пропил — {formatLength(recipe.crosscut.sawKerfMm, units)}.
      </p>
      {nest.unplaced.length > 0 && (
        <p className="note">
          Внимание: {nest.unplaced.length} брусков не влезают в доску{' '}
          {stock.lengthMm}×{stock.widthMm} мм — нужен материал длиннее.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Доска {stock.lengthMm}×{stock.widthMm}</th>
            <th>Брусков</th>
            <th>Режем</th>
            <th>Выход</th>
            <th>Остаток</th>
          </tr>
        </thead>
        <tbody>
          {nest.boards.map((board) => (
            <tr key={`${board.speciesId}-${board.index}`}>
              <td>{recipe.species[board.speciesId]?.name ?? board.speciesId} №{board.index}</td>
              <td>{board.pieces.length} шт</td>
              <td>{formatLength(board.usedLengthMm, units)}</td>
              <td>{board.yieldPct.toFixed(0)}%</td>
              <td>{formatLength(board.offcutLengthMm, units)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>2. Первая склейка — щит A</h2>
      <ol>
        <li>Выложить бруски в порядке: {recipe.panel.strips.map((s) => recipe.species[s.speciesId]?.name ?? s.speciesId).join(' → ')}.</li>
        <li>Склеить в щит шириной {formatLength(projection.panel.netWidthMm, units)}.</li>
        <li>После высыхания выровнять пласти. Рабочая длина щита — {formatLength(projection.panel.usedUsableLengthMm, units)}.</li>
      </ol>

      <h2>3. Поперечный распил</h2>
      <ol>
        <li>Торцевать один край щита начисто.</li>
        <li>
          Нарезать {projection.sliceCount} {plural(projection.sliceCount, 'планку', 'планки', 'планок')}{' '}
          толщиной {formatLength(recipe.crosscut.sliceThicknessMm, units)}. Резов: {cuts}.
        </li>
        <li>
          Пропил {formatLength(recipe.crosscut.sawKerfMm, units)} × {cuts} съедает{' '}
          {Math.round(projection.waste.crosscutKerfM3 * 1e9).toLocaleString('ru-RU')} мм³ — это заложено в расчёт.
        </li>
        {projection.panel.designRemainderLengthMm > 1 && (
          <li>Остаток щита {formatLength(projection.panel.designRemainderLengthMm, units)} в доску не идёт.</li>
        )}
      </ol>

      <h2>4. Трансформация планок</h2>
      <ol>
        {recipe.transform.flipOddSlices && <li>Каждую нечётную планку (2-ю, 4-ю, 6-ю…) повернуть на 180°.</li>}
        {recipe.transform.cyclicShiftStep !== 0 && (
          <li>Каждую следующую планку сдвинуть по кругу на {recipe.transform.cyclicShiftStep} брусок(а).</li>
        )}
        {recipe.transform.manualSlices && <li>Порядок брусков в планках — по картинке выше.</li>}
        <li>Все планки повернуть на 90°: торцы вверх.</li>
      </ol>

      <h2>Схема переклейки</h2>
      <p className="note">
        Бруски щита пронумерованы слева направо:{' '}
        {recipe.panel.strips.map((strip, index) => (
          <span key={index}>
            {index > 0 && ', '}
            <b>{index + 1}</b> — {recipe.species[strip.speciesId]?.name ?? strip.speciesId}
          </span>
        ))}
        . В таблице — порядок брусков в каждой планке готовой доски.
      </p>
      <table className="scheme">
        <thead>
          <tr>
            <th>Планка</th>
            {recipe.panel.strips.map((_, index) => <th key={index}>{index + 1}</th>)}
            <th>Как получить</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, sliceIndex) => (
            <tr key={sliceIndex}>
              <td>{sliceIndex + 1}</td>
              {row.map((stripIndex, position) => <td key={position}>{stripIndex + 1}</td>)}
              <td className="how">{describeSlice(recipe, row, sliceIndex)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>5. Вторая склейка</h2>
      <ol>
        <li>Собрать планки насухо, проверить рисунок и стыки.</li>
        <li>Склеить, стянуть струбцинами, следить за плоскостностью.</li>
        <li>После высыхания — рейсмус/шлифовка до {formatLength(dims.thicknessMm, units)}, фаска, масло.</li>
      </ol>

      <h2>Материал</h2>
      <table>
        <thead>
          <tr><th>Порода</th><th>Сырой объём</th><th>В доске</th><th>Масса</th><th>Стоимость</th></tr>
        </thead>
        <tbody>
          {projection.materials.filter((m) => m.rawVolumeM3 > 0).map((m) => (
            <tr key={m.speciesId}>
              <td>{m.speciesName}</td>
              <td>{m.rawVolumeM3.toFixed(5)} м³</td>
              <td>{m.netVolumeM3.toFixed(5)} м³</td>
              <td>{m.netMassKg.toFixed(1)} кг</td>
              <td>{Math.round(m.cost).toLocaleString('ru-RU')} ₽</td>
            </tr>
          ))}
          <tr className="total">
            <td>Итого</td>
            <td>{projection.totals.rawVolumeM3.toFixed(5)} м³</td>
            <td>{projection.totals.netVolumeM3.toFixed(5)} м³</td>
            <td />
            <td>{Math.round(projection.totals.totalCost).toLocaleString('ru-RU')} ₽</td>
          </tr>
        </tbody>
      </table>

      {(warnings.length > 0 || !projection.valid) && (
        <>
          <h2>Столярный чек</h2>
          <ul>
            {projection.issues.map((issue) => <li key={issue}><b>Ошибка:</b> {issue}</li>)}
            {warnings.map((w) => (
              <li key={w.id + w.problem}>
                <b>{w.problem}</b> {w.why} <b>Чем грозит:</b> {w.consequence}{' '}
                <b>Что сделать:</b> {w.fix}
                {w.source && <> <i>({w.source})</i></>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Порядок работ под твою мастерскую</h2>
      {workshop.workarounds.length > 0 && (
        <p className="note">
          {workshop.workarounds.length}{' '}
          {workshop.workarounds.length === 1 ? 'шаг идёт' : 'шага идут'} обходным путём —
          заложи примерно на {Math.round((workshop.timeMultiplier - 1) * 100)}% больше времени.
        </p>
      )}
      <ol>
        {workshop.steps.map((step) => (
          <li key={step.plan.id}>
            <b>{step.plan.title}.</b> {step.instruction}
            {step.blocked && <> <b>Нечем сделать этим набором инструмента.</b></>}
          </li>
        ))}
      </ol>

      <h2>Движение древесины</h2>
      <p className="note">
        Из мастерской ({shopClimate.temperatureC} °C, {shopClimate.relativeHumidityPct}%) на кухню
        во время готовки ({kitchenClimate.temperatureC} °C, {kitchenClimate.relativeHumidityPct}%)
        влажность древесины меняется с {movement.from.moisturePct.toFixed(1)}% до{' '}
        {movement.to.moisturePct.toFixed(1)}%. Расчёт по USDA Wood Handbook, гл. 4 и 13;
        показано тангенциальное направление — худший случай.
      </p>
      <table>
        <thead>
          <tr><th>Порода</th><th>Брусок</th><th>Суммарно по ширине</th></tr>
        </thead>
        <tbody>
          {movement.perSpecies.filter((item) => item.hasData).map((item) => {
            const group = [...groups.values()].find((g) => g.speciesId === item.speciesId);
            const total = group ? Math.abs(item.tangentialMm!) * group.count : 0;
            return (
              <tr key={item.speciesId}>
                <td>{item.speciesName}</td>
                <td>{Math.abs(item.tangentialMm!).toFixed(2)} мм</td>
                <td>{total.toFixed(1)} мм</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {movement.mismatchBetween && movement.worstMismatchMm > 0.12 && (
        <p className="note">
          <b>Внимание:</b> {movement.mismatchBetween[0]} двигается сильнее, чем{' '}
          {movement.mismatchBetween[1]}, на {movement.worstMismatchMm.toFixed(2)} мм на каждом
          бруске. Держи готовую доску промасленной и не ставь её к источникам тепла и влаги.
        </p>
      )}

      <h2>Экономика</h2>
      <table>
        <tbody>
          <tr><td>Время работы (оценка)</td><td>{formatDuration(economics.time.totalMin)}</td></tr>
          <tr><td>Материал</td><td>{money(economics.materialRub)}</td></tr>
          <tr><td>Расходники и электричество</td><td>{money(economics.consumablesRub + economics.utilitiesRub)}</td></tr>
          <tr><td>Труд и накладные</td><td>{money(economics.labourRub + economics.overheadRub)}</td></tr>
          <tr className="total"><td>Себестоимость</td><td>{money(economics.costRub)}</td></tr>
          <tr className="total">
            <td>Цена продажи</td>
            <td>{money(economics.priceRangeRub[0])} — {money(economics.priceRangeRub[1])}</td>
          </tr>
        </tbody>
      </table>

      <h2>Чек-лист сборки</h2>
      <ul className="checklist">
        <li>☐ Бруски выструганы в размер</li>
        <li>☐ Щит A склеен и выровнен</li>
        <li>☐ Планки нарезаны ({projection.sliceCount} шт)</li>
        <li>☐ Планки развёрнуты по схеме</li>
        <li>☐ Вторая склейка стянута</li>
        <li>☐ Плоскость выведена, фаска снята</li>
        <li>☐ Масло нанесено, выдержка сутки</li>
      </ul>

      <footer>
        <p>ДНК доски: <span className="url">{shareUrl}</span></p>
      </footer>
    </div>
  );
}
