/**
 * Партия: во что обходится десятая доска против первой.
 *
 * Мастерской это нужно, чтобы называть цену на тираж. Считать партию как
 * «штука × N» — врать в свою сторону: часть работы делается один раз на всю
 * партию, и если этого не учесть, десять досок окажутся дороже, чем они есть,
 * и заказ уйдёт к тому, кто посчитал честно.
 *
 * ЧТО СЧИТАЕТСЯ, А ЧТО ОЦЕНКА. Экономия материала считается: раскрой всей
 * партии сразу оставляет меньше обрезков, чем десять отдельных раскроев,
 * и это проверяемое число — его даёт `nestPieces`. Экономия времени —
 * оценка (`est`): доли настройки ниже взяты из практики, а не из норматива,
 * и в справочнике их нет. Пока мастерская не ведёт журнал факта, точнее
 * не будет, и инструмент этого не скрывает.
 */
import {
  calculateEconomics,
  estimateTime,
  DEFAULT_TIME_NORMS,
  DEFAULT_RATES,
  type Economics,
  type ProductionInput,
  type TimeBreakdown,
  type TimeNorms,
  type WorkshopRates,
} from './economics';
import { nestPieces, type NestPiece, type NestResult, type StockBoard } from './nesting';

/**
 * Какая доля нормы времени тратится один раз на партию, а не на каждую доску.
 *
 * Все четыре — `est`, из практики: настроить упор, выставить рейсмус, замесить
 * клей, разложить масло и тряпки. Норматива на них нет ни в одном справочнике,
 * потому что зависят они от станка и привычки мастера. Числа осторожные:
 * завысить экономию опаснее, чем занизить — по завышенной мастерская назовёт
 * цену, за которую потом будет работать себе в убыток.
 *
 * Шлифовки в списке нет намеренно: каждую доску шлифуют отдельно, и настройки,
 * которую можно сделать раз на партию, там не существует.
 */
export interface BatchSetup {
  /** Разметка и настройка станка под строжку брусков. */
  stripSetupShare: number;
  /** Замес клея и подготовка струбцин — на склейку. */
  glueUpSetupShare: number;
  /** Выставить упор под поперечный рез. */
  crosscutSetupShare: number;
  /** Разложить масло, тряпки, перчатки — на финиш. */
  finishingSetupShare: number;
}

export const DEFAULT_BATCH_SETUP: BatchSetup = {
  stripSetupShare: 0.25,
  glueUpSetupShare: 0.2,
  crosscutSetupShare: 0.3,
  finishingSetupShare: 0.35,
};

/** Больше пятидесяти досок за раз одна мастерская не клеит. */
export const MAX_BATCH = 50;

export interface BatchTime {
  count: number;
  /** Время на всю партию, по операциям. */
  total: TimeBreakdown;
  /** Среднее время на доску внутри партии. */
  perBoard: TimeBreakdown;
  /** Одиночная доска — то, с чем сравниваем. */
  single: TimeBreakdown;
  /** Сколько минут экономит партия против того же числа одиночных досок. */
  savedMin: number;
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(Math.floor(count), MAX_BATCH));
}

/**
 * Операция в партии: настроечная доля тратится один раз, остальное — на каждую
 * доску. Итог для одной доски совпадает с одиночным расчётом при любой доле,
 * поэтому партия из одной штуки ничего не «экономит».
 */
function batchOperation(singleMin: number, count: number, setupShare: number): number {
  const share = Math.min(Math.max(setupShare, 0), 1);
  return singleMin * (share + (1 - share) * count);
}

export function estimateBatchTime(
  input: ProductionInput,
  count: number,
  norms: TimeNorms = DEFAULT_TIME_NORMS,
  setup: BatchSetup = DEFAULT_BATCH_SETUP
): BatchTime {
  const boards = clampCount(count);
  const single = estimateTime(input, norms);

  const stripsMin = batchOperation(single.stripsMin, boards, setup.stripSetupShare);
  const glueUpMin = batchOperation(single.glueUpMin, boards, setup.glueUpSetupShare);
  const crosscutMin = batchOperation(single.crosscutMin, boards, setup.crosscutSetupShare);
  const finishingMin = batchOperation(single.finishingMin, boards, setup.finishingSetupShare);
  // Шлифовка не делится: каждую доску ведут по абразиву отдельно.
  const sandingMin = single.sandingMin * boards;

  const total: TimeBreakdown = {
    stripsMin,
    glueUpMin,
    crosscutMin,
    sandingMin,
    finishingMin,
    totalMin: stripsMin + glueUpMin + crosscutMin + sandingMin + finishingMin,
  };

  const perBoard: TimeBreakdown = {
    stripsMin: stripsMin / boards,
    glueUpMin: glueUpMin / boards,
    crosscutMin: crosscutMin / boards,
    sandingMin: sandingMin / boards,
    finishingMin: finishingMin / boards,
    totalMin: total.totalMin / boards,
  };

  return {
    count: boards,
    total,
    perBoard,
    single,
    savedMin: single.totalMin * boards - total.totalMin,
  };
}

export interface BatchMaterial {
  /** Раскрой всей партии сразу. */
  nest: NestResult;
  /** Досок купить на партию. */
  boards: number;
  /** Сколько досок ушло бы, если резать каждую доску отдельным раскроем. */
  boardsIfSeparate: number;
  /** Сэкономлено покупных досок за счёт общего раскроя. */
  boardsSaved: number;
}

/**
 * Материал на партию. Раскрой считается по всем деталям сразу, потому что
 * обрезок от первой доски работает на вторую — при отдельных раскроях
 * он бы просто лежал.
 */
export function estimateBatchMaterial(
  pieces: NestPiece[],
  count: number,
  stock: StockBoard,
  kerfMm: number
): BatchMaterial {
  const boards = clampCount(count);

  // Идентификаторы деталей остаются различимыми: на них ссылается схема,
  // которую уносят к станку.
  const all: NestPiece[] = [];
  for (let copy = 0; copy < boards; copy += 1) {
    for (const piece of pieces) {
      all.push({ ...piece, pieceId: boards > 1 ? `${piece.pieceId}#${copy + 1}` : piece.pieceId });
    }
  }

  const nest = nestPieces(all, stock, kerfMm);
  const single = nestPieces(pieces, stock, kerfMm);

  const together = nest.boards.length;
  const separate = single.boards.length * boards;

  return {
    nest,
    boards: together,
    boardsIfSeparate: separate,
    boardsSaved: separate - together,
  };
}

export interface BatchEconomics {
  count: number;
  time: BatchTime;
  /** Экономика одной доски вне партии — с чем сравнивать. */
  single: Economics;
  /** Экономика доски внутри партии. */
  perBoard: Economics;
  /** Себестоимость всей партии. */
  totalCostRub: number;
  /** Рекомендуемая цена всей партии. */
  totalPriceRub: number;
  /** Во что обходится ещё одна доска сверх партии. */
  marginalCostRub: number;
  /** На сколько процентов доска в партии дешевле одиночной. */
  savingPct: number;
}

function moneyFromMinutes(
  totalMin: number,
  materialRub: number,
  rates: WorkshopRates
): { labourRub: number; overheadRub: number; costRub: number } {
  const labourRub = (totalMin / 60) * Math.max(0, rates.hourlyRateRub);
  const overheadRub = labourRub * (Math.max(0, rates.overheadPct) / 100);
  const costRub =
    materialRub +
    Math.max(0, rates.consumablesRub) +
    Math.max(0, rates.utilitiesRub) +
    labourRub +
    overheadRub;
  return { labourRub, overheadRub, costRub };
}

/**
 * Экономика партии.
 *
 * `materialPerBoardRub` передаётся отдельно, потому что экономию материала
 * считает раскрой (`estimateBatchMaterial`), а не эта формула: смешивать
 * посчитанное с оценочным в одном числе было бы нечестно.
 */
export function calculateBatch(
  input: ProductionInput,
  count: number,
  rates: WorkshopRates = DEFAULT_RATES,
  norms: TimeNorms = DEFAULT_TIME_NORMS,
  options: { materialPerBoardRub?: number; setup?: BatchSetup } = {}
): BatchEconomics {
  const setup = options.setup ?? DEFAULT_BATCH_SETUP;
  const time = estimateBatchTime(input, count, norms, setup);
  const boards = time.count;

  const single = calculateEconomics(input, rates, norms);
  const materialRub = Math.max(0, options.materialPerBoardRub ?? input.materialCostRub);

  const money = moneyFromMinutes(time.perBoard.totalMin, materialRub, rates);
  const suggestedPriceRub = money.costRub * (1 + Math.max(0, rates.targetMarginPct) / 100);
  const hours = time.perBoard.totalMin / 60;

  const perBoard: Economics = {
    time: time.perBoard,
    materialRub,
    consumablesRub: Math.max(0, rates.consumablesRub),
    utilitiesRub: Math.max(0, rates.utilitiesRub),
    labourRub: money.labourRub,
    overheadRub: money.overheadRub,
    costRub: money.costRub,
    suggestedPriceRub,
    priceRangeRub: [suggestedPriceRub * 0.85, suggestedPriceRub * 1.15],
    profitRub: suggestedPriceRub - money.costRub,
    effectiveHourlyRub:
      hours > 0 ? (suggestedPriceRub - money.costRub + money.labourRub) / hours : 0,
    materialSharePct: money.costRub > 0 ? (materialRub / money.costRub) * 100 : 0,
  };

  // Предельная доска: насколько дорожает партия от N к N+1. Именно это число
  // отвечает на вопрос «а если добавить ещё одну».
  const next = estimateBatchTime(input, boards + 1, norms, setup);
  const extraMinutes = next.total.totalMin - time.total.totalMin;
  const marginal = moneyFromMinutes(extraMinutes, materialRub, rates);

  return {
    count: boards,
    time,
    single,
    perBoard,
    totalCostRub: money.costRub * boards,
    totalPriceRub: suggestedPriceRub * boards,
    marginalCostRub: marginal.costRub,
    savingPct: single.costRub > 0 ? ((single.costRub - money.costRub) / single.costRub) * 100 : 0,
  };
}
