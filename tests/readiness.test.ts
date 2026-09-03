import { describe, it, expect } from 'vitest';
import { assessReadiness, type ReadinessInput } from '../src/core/readiness';
import { assessWorkshop, DEFAULT_TOOLS } from '../src/core/workshop';
import { SPECIES_BY_ID } from '../src/core/defaults';
import type { JoineryWarning } from '../src/core/validate';

const MAPLE = SPECIES_BY_ID.maple;
const WALNUT = SPECIES_BY_ID.walnut;

const warning = (patch: Partial<JoineryWarning> = {}): JoineryWarning => ({
  id: 'thin_strip',
  severity: 'caution',
  problem: 'Брусок тоньше 8 мм',
  why: 'скалывается при второй склейке',
  consequence: 'шов раскроется',
  fix: 'сделать брусок шире',
  ...patch,
});

const base: ReadinessInput = {
  valid: true,
  issues: [],
  warnings: [],
  workshop: assessWorkshop(DEFAULT_TOOLS),
  unplaced: [],
  species: [MAPLE, WALNUT],
};

describe('вердикт готовности', () => {
  it('всё в порядке — готово, и причин нет', () => {
    const readiness = assessReadiness(base);
    expect(readiness.level).toBe('ready');
    expect(readiness.reasons).toEqual([]);
  });

  it('замечание столярного чека — «есть замечания», а не «нельзя»', () => {
    const readiness = assessReadiness({ ...base, warnings: [warning()] });
    expect(readiness.level).toBe('warnings');
    expect(readiness.reasons[0].text).toContain('8 мм');
    expect(readiness.reasons[0].where).toBe('Столярный чек');
  });

  it('не посчитавшаяся модель — «невозможно», с её собственным объяснением', () => {
    const readiness = assessReadiness({
      ...base,
      valid: false,
      issues: ['Щит короче одного среза'],
    });
    expect(readiness.level).toBe('impossible');
    expect(readiness.reasons[0].text).toBe('Щит короче одного среза');
  });

  it('невалидная модель без объяснения всё равно даёт причину, а не пустоту', () => {
    const readiness = assessReadiness({ ...base, valid: false, issues: [] });
    expect(readiness.level).toBe('impossible');
    expect(readiness.reasons).toHaveLength(1);
  });

  it('нечем сделать — «невозможно», и шаги названы', () => {
    const readiness = assessReadiness({ ...base, workshop: assessWorkshop([]) });
    expect(readiness.level).toBe('impossible');
    expect(readiness.reasons[0].where).toBe('Моя мастерская');
  });

  it('деталь, не влезающая в покупную доску, — «невозможно»', () => {
    const readiness = assessReadiness({
      ...base,
      unplaced: [{ pieceId: 'x', speciesId: 'maple', lengthMm: 9000, widthMm: 40 }],
    });
    expect(readiness.level).toBe('impossible');
    expect(readiness.reasons[0].where).toBe('Карта раскроя');
  });
});

describe('нехватка данных', () => {
  it('порода без плотности и цены — «не хватает данных»', () => {
    // Ровно тот случай, что приезжает из чужой ссылки: в неё едет только то,
    // что пользователь мог изменить.
    const readiness = assessReadiness({
      ...base,
      species: [{ id: 'x', name: 'Неизвестная', colorHex: '#888888' }],
    });
    expect(readiness.level).toBe('missingData');
    expect(readiness.reasons.some((reason) => reason.text.includes('плотность'))).toBe(true);
    expect(readiness.reasons.some((reason) => reason.text.includes('усушка'))).toBe(true);
  });

  it('нехватка данных тяжелее замечания', () => {
    // Замечание видно и его можно взвесить; неизвестная величина молча портит
    // расчёт, на который смотрят как на факт.
    const readiness = assessReadiness({
      ...base,
      warnings: [warning()],
      species: [{ id: 'x', name: 'Неизвестная', colorHex: '#888888' }],
    });
    expect(readiness.level).toBe('missingData');
  });

  it('«невозможно» тяжелее нехватки данных', () => {
    const readiness = assessReadiness({
      ...base,
      valid: false,
      species: [{ id: 'x', name: 'Неизвестная', colorHex: '#888888' }],
    });
    expect(readiness.level).toBe('impossible');
  });

  it('полный справочник претензий не вызывает', () => {
    expect(assessReadiness(base).counts.missingData).toBe(0);
  });
});

describe('список причин', () => {
  it('тяжёлое идёт первым: человек читает сверху', () => {
    const readiness = assessReadiness({
      ...base,
      valid: false,
      warnings: [warning()],
      species: [{ id: 'x', name: 'Неизвестная', colorHex: '#888888' }],
    });
    const levels = readiness.reasons.map((reason) => reason.level);
    expect(levels[0]).toBe('impossible');
    expect(levels[levels.length - 1]).toBe('warnings');
  });

  it('счётчики совпадают со списком', () => {
    const readiness = assessReadiness({
      ...base,
      warnings: [warning(), warning({ id: 'many_slices' })],
    });
    expect(readiness.counts.warnings).toBe(2);
    expect(readiness.reasons).toHaveLength(2);
  });

  it('каждая причина говорит, где смотреть', () => {
    const readiness = assessReadiness({
      ...base,
      valid: false,
      warnings: [warning()],
      unplaced: [{ pieceId: 'x', speciesId: 'maple', lengthMm: 9000, widthMm: 40 }],
      species: [{ id: 'x', name: 'Неизвестная', colorHex: '#888888' }],
    });
    for (const reason of readiness.reasons) {
      expect(reason.where, reason.id).toBeTruthy();
      expect(reason.text, reason.id).toBeTruthy();
    }
  });

  it('без описанной мастерской о станках не говорится ничего', () => {
    // Молчать честнее, чем обвинять человека в отсутствии станка,
    // про который он ничего не сообщал.
    const readiness = assessReadiness({ ...base, workshop: undefined });
    expect(readiness.level).toBe('ready');
  });
});
