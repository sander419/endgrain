/**
 * Готовность доски: один ответ на вопрос «отдавать ли в работу».
 *
 * Замечания, набор станков, раскрой и справочные данные живут в разных панелях,
 * и по отдельности каждое из них — частность. Перед тем как пилить дерево,
 * мастеру нужен не список из четырёх мест, а одно слово: можно или нет.
 * Подмастерью и клиенту — тем более.
 *
 * Модуль ничего не считает заново. Он сводит уже посчитанное в вердикт
 * и называет причины поимённо — иначе «не готово» превращается в загадку.
 *
 * Четыре уровня, по возрастанию тяжести:
 * — `ready` — можно пилить;
 * — `warnings` — сделать можно, но есть чем испортить;
 * — `missingData` — чего-то не знаем, и число в панели будет выдумкой;
 * — `impossible` — так не собрать, дело не в аккуратности.
 *
 * Порядок именно такой. «Не хватает данных» тяжелее замечания, потому что
 * замечание видно и его можно взвесить, а неизвестная величина молча портит
 * расчёт, на который смотрят как на факт.
 */
import type { JoineryWarning } from './validate';
import type { WorkshopReadiness } from './workshop';
import type { NestPiece } from './nesting';
import type { WoodSpecies } from './types';

export type ReadinessLevel = 'ready' | 'warnings' | 'missingData' | 'impossible';

export interface ReadinessReason {
  id: string;
  level: Exclude<ReadinessLevel, 'ready'>;
  /** Что именно не так — одной строкой, без «возможны проблемы». */
  text: string;
  /** Где это смотреть: имя панели, а не имя модуля. */
  where: string;
}

export interface Readiness {
  level: ReadinessLevel;
  reasons: ReadinessReason[];
  /** Сколько замечаний каждой тяжести — для короткой строки в шапке. */
  counts: { impossible: number; missingData: number; warnings: number };
}

export interface ReadinessInput {
  /** Посчиталась ли модель вообще. */
  valid: boolean;
  /** Почему не посчиталась — сообщения модели. */
  issues: string[];
  warnings: JoineryWarning[];
  /** Набор станков. Не задан — считаем, что мастерская не описана, и молчим. */
  workshop?: WorkshopReadiness;
  /** Детали, которые не влезают в покупную доску ни при какой раскладке. */
  unplaced: NestPiece[];
  /** Породы, использованные на доске. */
  species: WoodSpecies[];
}

const ORDER: Record<ReadinessLevel, number> = {
  ready: 0,
  warnings: 1,
  missingData: 2,
  impossible: 3,
};

export function assessReadiness(input: ReadinessInput): Readiness {
  const reasons: ReadinessReason[] = [];

  if (!input.valid) {
    for (const issue of input.issues.length ? input.issues : ['Расчёт не сходится']) {
      reasons.push({ id: 'invalid', level: 'impossible', text: issue, where: 'Расчёт' });
    }
  }

  if (input.workshop && !input.workshop.feasible) {
    const steps = input.workshop.blocked.map((step) => step.plan.title.toLowerCase()).join(', ');
    reasons.push({
      id: 'no_tools',
      level: 'impossible',
      text: steps
        ? `Этим набором станков доску не сделать: не закрыты шаги — ${steps}`
        : 'Этим набором станков доску не сделать',
      where: 'Моя мастерская',
    });
  }

  if (input.unplaced.length > 0) {
    reasons.push({
      id: 'unplaced',
      level: 'impossible',
      text: `Не влезает в покупную доску: ${input.unplaced.length} шт. Нужна доска длиннее или шире`,
      where: 'Карта раскроя',
    });
  }

  // Порода без плотности или цены приезжает из чужой ссылки: в неё едет только
  // то, что пользователь мог изменить, и эти поля могли не доехать. Масса
  // и себестоимость на таких данных были бы выдумкой.
  for (const species of input.species) {
    const missing: string[] = [];
    if (!(species.densityKgM3 && species.densityKgM3 > 0)) missing.push('плотность');
    if (!(species.pricePerCubicMeter && species.pricePerCubicMeter > 0)) missing.push('цена');
    if (missing.length > 0) {
      reasons.push({
        id: `no_data_${species.id}`,
        level: 'missingData',
        text: `${species.name}: не задана ${missing.join(' и ')} — масса и себестоимость посчитаны не будут`,
        where: 'Породы',
      });
    }
    // Усушка нужна расчёту движения древесины — главному в торцевой доске.
    if (!(species.shrinkageTangentialPct && species.shrinkageTangentialPct > 0)) {
      reasons.push({
        id: `no_shrinkage_${species.id}`,
        level: 'missingData',
        text: `${species.name}: не задана усушка — движение древесины не проверить`,
        where: 'Движение древесины',
      });
    }
  }

  for (const warning of input.warnings) {
    reasons.push({
      id: warning.id,
      level: 'warnings',
      text: warning.problem,
      where: 'Столярный чек',
    });
  }

  const counts = {
    impossible: reasons.filter((reason) => reason.level === 'impossible').length,
    missingData: reasons.filter((reason) => reason.level === 'missingData').length,
    warnings: reasons.filter((reason) => reason.level === 'warnings').length,
  };

  let level: ReadinessLevel = 'ready';
  for (const reason of reasons) {
    if (ORDER[reason.level] > ORDER[level]) level = reason.level;
  }

  // Тяжёлое вперёд: человек читает список сверху и должен увидеть худшее первым.
  reasons.sort((a, b) => ORDER[b.level] - ORDER[a.level]);

  return { level, reasons, counts };
}
