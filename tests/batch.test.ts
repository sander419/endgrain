import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BATCH_SETUP,
  MAX_BATCH,
  calculateBatch,
  estimateBatchMaterial,
  estimateBatchTime,
} from '../src/core/batch';
import { DEFAULT_RATES, calculateEconomics, type ProductionInput } from '../src/core/economics';
import type { NestPiece } from '../src/core/nesting';

const BOARD: ProductionInput = {
  strips: 6,
  glueUps: 1,
  crosscuts: 8,
  lengthMm: 360,
  widthMm: 240,
  materialCostRub: 1200,
};

describe('время партии', () => {
  it('партия из одной доски равна одиночной: делить нечего', () => {
    const batch = estimateBatchTime(BOARD, 1);
    expect(batch.total.totalMin).toBeCloseTo(batch.single.totalMin, 6);
    expect(batch.savedMin).toBeCloseTo(0, 6);
  });

  it('десять досок дешевле по времени, чем десять раз по одной', () => {
    const batch = estimateBatchTime(BOARD, 10);
    expect(batch.total.totalMin).toBeLessThan(batch.single.totalMin * 10);
    expect(batch.savedMin).toBeGreaterThan(0);
  });

  it('доска в партии не может стать дешевле, чем повторяемая часть работы', () => {
    // Настройка размазывается, но строгать, клеить и шлифовать каждую доску
    // всё равно придётся. Экономия обязана иметь предел.
    const huge = estimateBatchTime(BOARD, MAX_BATCH);
    expect(huge.perBoard.totalMin).toBeGreaterThan(huge.single.totalMin * 0.5);
  });

  it('шлифовка не экономится: каждую доску ведут по абразиву отдельно', () => {
    const batch = estimateBatchTime(BOARD, 10);
    expect(batch.total.sandingMin).toBeCloseTo(batch.single.sandingMin * 10, 6);
    expect(batch.perBoard.sandingMin).toBeCloseTo(batch.single.sandingMin, 6);
  });

  it('операции складываются в итог: разбивка не расходится с суммой', () => {
    const batch = estimateBatchTime(BOARD, 7);
    for (const time of [batch.total, batch.perBoard, batch.single]) {
      const sum =
        time.stripsMin + time.glueUpMin + time.crosscutMin + time.sandingMin + time.finishingMin;
      expect(time.totalMin).toBeCloseTo(sum, 6);
    }
  });

  it('время на доску падает с ростом партии и никогда не растёт', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const count of [1, 2, 3, 5, 10, 20, 50]) {
      const perBoard = estimateBatchTime(BOARD, count).perBoard.totalMin;
      expect(perBoard, `партия ${count}`).toBeLessThanOrEqual(previous);
      previous = perBoard;
    }
  });

  it('партия больше предела зажимается, а не считается', () => {
    expect(estimateBatchTime(BOARD, 5000).count).toBe(MAX_BATCH);
  });

  it('мусор вместо числа даёт одну доску, а не NaN в цене', () => {
    for (const junk of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0, 0.4]) {
      const batch = estimateBatchTime(BOARD, junk);
      expect(batch.count, String(junk)).toBe(1);
      expect(Number.isFinite(batch.total.totalMin)).toBe(true);
    }
  });

  it('нулевые доли настройки означают отсутствие экономии', () => {
    const batch = estimateBatchTime(BOARD, 10, undefined, {
      stripSetupShare: 0,
      glueUpSetupShare: 0,
      crosscutSetupShare: 0,
      finishingSetupShare: 0,
    });
    expect(batch.total.totalMin).toBeCloseTo(batch.single.totalMin * 10, 6);
  });

  it('доли настройки объявлены осторожными: ни одна не больше половины', () => {
    // Завышенная экономия опаснее заниженной: по ней назовут цену,
    // за которую потом придётся работать в убыток.
    for (const [name, share] of Object.entries(DEFAULT_BATCH_SETUP)) {
      expect(share, name).toBeGreaterThan(0);
      expect(share, name).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('деньги партии', () => {
  it('доска в партии дешевле одиночной, но материал тот же', () => {
    const batch = calculateBatch(BOARD, 10);
    expect(batch.perBoard.costRub).toBeLessThan(batch.single.costRub);
    expect(batch.perBoard.materialRub).toBe(batch.single.materialRub);
    expect(batch.savingPct).toBeGreaterThan(0);
  });

  it('партия из одной штуки совпадает с обычным расчётом', () => {
    const batch = calculateBatch(BOARD, 1);
    const single = calculateEconomics(BOARD);
    expect(batch.perBoard.costRub).toBeCloseTo(single.costRub, 6);
    expect(batch.savingPct).toBeCloseTo(0, 6);
  });

  it('итог партии — цена доски, умноженная на число досок', () => {
    const batch = calculateBatch(BOARD, 8);
    expect(batch.totalCostRub).toBeCloseTo(batch.perBoard.costRub * 8, 6);
    expect(batch.totalPriceRub).toBeCloseTo(batch.perBoard.suggestedPriceRub * 8, 6);
  });

  it('ещё одна доска сверх партии дешевле средней: настройка уже сделана', () => {
    const batch = calculateBatch(BOARD, 10);
    expect(batch.marginalCostRub).toBeLessThan(batch.perBoard.costRub);
    // Но не дешевле материала с расходниками — из воздуха доску не сделать.
    expect(batch.marginalCostRub).toBeGreaterThan(
      BOARD.materialCostRub + DEFAULT_RATES.consumablesRub
    );
  });

  it('экономия материала приходит извне и не выдумывается формулой', () => {
    const cheaper = calculateBatch(BOARD, 10, undefined, undefined, {
      materialPerBoardRub: 1000,
    });
    expect(cheaper.perBoard.materialRub).toBe(1000);
    expect(cheaper.perBoard.costRub).toBeLessThan(calculateBatch(BOARD, 10).perBoard.costRub);
  });

  it('нулевая ставка мастера не роняет расчёт', () => {
    const batch = calculateBatch(BOARD, 10, { ...DEFAULT_RATES, hourlyRateRub: 0 });
    expect(Number.isFinite(batch.perBoard.costRub)).toBe(true);
    expect(batch.perBoard.labourRub).toBe(0);
  });
});

describe('материал партии', () => {
  const pieces: NestPiece[] = Array.from({ length: 6 }, (_, index) => ({
    pieceId: `strip-${index}`,
    speciesId: index % 2 === 0 ? 'maple' : 'walnut',
    lengthMm: 630,
    widthMm: 42,
  }));
  const stock = { lengthMm: 2000, widthMm: 150 };

  it('общий раскрой не хуже раскроя по одной доске', () => {
    const material = estimateBatchMaterial(pieces, 5, stock, 3);
    expect(material.boards).toBeLessThanOrEqual(material.boardsIfSeparate);
    expect(material.boardsSaved).toBeGreaterThanOrEqual(0);
  });

  it('на партии из пяти досок общий раскрой действительно экономит', () => {
    // Ради этого числа партию и считают: обрезок от первой доски работает
    // на вторую, при отдельных раскроях он бы просто лежал.
    const material = estimateBatchMaterial(pieces, 5, stock, 3);
    expect(material.boardsSaved).toBeGreaterThan(0);
  });

  it('партия из одной доски совпадает с одиночным раскроем', () => {
    const material = estimateBatchMaterial(pieces, 1, stock, 3);
    expect(material.boards).toBe(material.boardsIfSeparate);
    expect(material.boardsSaved).toBe(0);
  });

  it('детали партии различимы: схему уносят к станку', () => {
    const material = estimateBatchMaterial(pieces, 3, stock, 3);
    const ids = material.nest.boards.flatMap((board) =>
      board.pieces.map((piece) => piece.pieceId)
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(pieces.length * 3);
  });

  it('пустой список деталей не роняет расчёт', () => {
    const material = estimateBatchMaterial([], 10, stock, 3);
    expect(material.boards).toBe(0);
    expect(material.boardsSaved).toBe(0);
  });
});
