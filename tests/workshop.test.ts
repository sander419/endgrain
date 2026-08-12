import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOLS, STEP_PLANS, TOOLS, assessWorkshop, resolveSteps } from '../src/core';
import type { ToolId } from '../src/core';

const ALL_TOOLS = TOOLS.map((tool) => tool.id);

describe('профиль мастерской', () => {
  it('с полным набором всё идёт штатным путём', () => {
    const readiness = assessWorkshop(ALL_TOOLS);
    expect(readiness.feasible).toBe(true);
    expect(readiness.blocked).toHaveLength(0);
    expect(readiness.workarounds).toHaveLength(0);
    expect(readiness.timeMultiplier).toBeCloseTo(1, 6);
  });

  it('типовой набор одиночки позволяет сделать доску', () => {
    const readiness = assessWorkshop(DEFAULT_TOOLS);
    expect(readiness.feasible).toBe(true);
  });

  /** Ради этого всё и затевалось: рецепт должен меняться под инструмент. */
  it('без барабанного станка выравнивание идёт фрезером и занимает дольше', () => {
    const withDrum = resolveSteps(ALL_TOOLS).find((step) => step.plan.id === 'flatten')!;
    const withoutDrum = resolveSteps(
      ALL_TOOLS.filter((tool) => tool !== 'drumSander')
    ).find((step) => step.plan.id === 'flatten')!;

    expect(withDrum.hasPrimary).toBe(true);
    expect(withoutDrum.hasPrimary).toBe(false);
    expect(withoutDrum.fallbackAvailable).toBe(true);
    expect(withoutDrum.instruction).not.toBe(withDrum.instruction);
    expect(withoutDrum.instruction).toContain('салазк');
    expect(withoutDrum.timeFactor).toBeGreaterThan(1);
  });

  it('предупреждение про рейсмус на торцевой доске попадает в обходной путь', () => {
    const step = resolveSteps(['router', 'planer', 'clamps', 'tablesaw'])
      .find((item) => item.plan.id === 'flatten')!;
    expect(step.instruction).toContain('нельзя');
  });

  it('без струбцин доску собрать нечем', () => {
    const readiness = assessWorkshop(ALL_TOOLS.filter((tool) => tool !== 'clamps'));
    expect(readiness.feasible).toBe(false);
    expect(readiness.blocked.map((step) => step.plan.id)).toContain('glueUpPanel');
  });

  it('без единой пилы планки не нарезать', () => {
    const noSaws = ALL_TOOLS.filter(
      (tool) => !['tablesaw', 'bandsaw', 'mitresaw'].includes(tool)
    ) as ToolId[];
    const readiness = assessWorkshop(noSaws);
    expect(readiness.blocked.map((step) => step.plan.id)).toContain('crosscut');
  });

  it('ЧПУ не требуется ни для одного шага', () => {
    const withoutCnc = ALL_TOOLS.filter((tool) => tool !== 'cnc');
    expect(assessWorkshop(withoutCnc).feasible).toBe(true);
    for (const plan of STEP_PLANS) {
      expect(plan.requires).not.toContain('cnc');
    }
  });

  it('чем беднее набор, тем больше множитель времени', () => {
    const rich = assessWorkshop(ALL_TOOLS).timeMultiplier;
    const poor = assessWorkshop(['tablesaw', 'clamps', 'router', 'orbitalSander']).timeMultiplier;
    expect(poor).toBeGreaterThan(rich);
  });

  it('шлифовку можно закрыть руками — обходной путь без инструмента', () => {
    const step = resolveSteps(['tablesaw', 'clamps']).find((item) => item.plan.id === 'sand')!;
    expect(step.blocked).toBe(false);
    expect(step.fallbackAvailable).toBe(true);
    expect(step.timeFactor).toBeGreaterThan(1);
  });

  it('пустой набор не роняет расчёт, но доска нереализуема', () => {
    const readiness = assessWorkshop([]);
    expect(readiness.feasible).toBe(false);
    expect(readiness.steps).toHaveLength(STEP_PLANS.length);
    expect(Number.isFinite(readiness.timeMultiplier)).toBe(true);
  });

  it('у каждого шага есть текст и понятный заголовок', () => {
    for (const step of resolveSteps(DEFAULT_TOOLS)) {
      expect(step.plan.title.length).toBeGreaterThan(0);
      expect(step.instruction.length).toBeGreaterThan(10);
    }
  });
});
