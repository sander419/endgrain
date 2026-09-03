import { describe, expect, it } from 'vitest';
import { checkJoinery, checkMosaic, defaultRecipe } from '../src/core';
import type { Recipe } from '../src/core';

function withStrips(strips: Recipe['panel']['strips']): Recipe {
  const base = defaultRecipe();
  return { ...base, panel: { ...base.panel, strips } };
}

describe('checkJoinery', () => {
  it('дефолтный рецепт чистый', () => {
    expect(checkJoinery(defaultRecipe())).toEqual([]);
  });

  it('ловит палиндром: flip не даёт узора', () => {
    const recipe = withStrips([
      { speciesId: 'maple', widthMm: 40 },
      { speciesId: 'walnut', widthMm: 40 },
      { speciesId: 'walnut', widthMm: 40 },
      { speciesId: 'maple', widthMm: 40 },
    ]);
    expect(checkJoinery(recipe).map((w) => w.id)).toContain('flip_no_effect');
  });

  it('не ругается на палиндром, если включён циклический сдвиг', () => {
    const base = withStrips([
      { speciesId: 'maple', widthMm: 40 },
      { speciesId: 'walnut', widthMm: 40 },
      { speciesId: 'walnut', widthMm: 40 },
      { speciesId: 'maple', widthMm: 40 },
    ]);
    const recipe = { ...base, transform: { ...base.transform, cyclicShiftStep: 1 } };
    expect(checkJoinery(recipe).map((w) => w.id)).not.toContain('flip_no_effect');
  });

  it('ловит тонкий брусок', () => {
    const base = defaultRecipe();
    const recipe = withStrips([...base.panel.strips, { speciesId: 'oak', widthMm: 5 }]);
    expect(checkJoinery(recipe).map((w) => w.id)).toContain('thin_strip');
  });

  it('ловит склейку, которую не стянуть', () => {
    const base = defaultRecipe();
    const recipe: Recipe = { ...base, panel: { ...base.panel, usableLengthMm: 2000 } };
    expect(checkJoinery(recipe).map((w) => w.id)).toContain('many_slices');
  });

  it('предупреждает о продольных резах при сдвиге, но не при простом перевороте', () => {
    const base = defaultRecipe();
    expect(checkJoinery(base).map((w) => w.id)).not.toContain('extra_rip_cuts');

    const shifted = { ...base, transform: { ...base.transform, cyclicShiftStep: 1 } };
    expect(checkJoinery(shifted).map((w) => w.id)).toContain('extra_rip_cuts');
  });

  it('ловит одну породу', () => {
    const recipe = withStrips([
      { speciesId: 'oak', widthMm: 40 },
      { speciesId: 'oak', widthMm: 40 },
    ]);
    expect(checkJoinery(recipe).map((w) => w.id)).toContain('single_species');
  });

  it('ловит конфликт усушки: бук против вишни', () => {
    const recipe = withStrips([
      { speciesId: 'beech', widthMm: 40 },
      { speciesId: 'cherry', widthMm: 40 },
    ]);
    expect(checkJoinery(recipe).map((w) => w.id)).toContain('shrinkage_conflict');
  });
});

describe('столярный чек мозаики', () => {
  const clean = {
    glueUps: 3,
    cols: 21,
    cellMm: 25,
    hasRepeatBlock: false,
    paletteTooSmall: false,
  };

  it('нормальный рисунок замечаний не собирает', () => {
    expect(checkMosaic(clean)).toEqual([]);
  });

  it('много щитов — замечание, но повторяющийся блок его снимает', () => {
    const many = { ...clean, glueUps: 12 };
    expect(checkMosaic(many).some((w) => w.id === 'many_panels')).toBe(true);
    expect(checkMosaic({ ...many, hasRepeatBlock: true }).some((w) => w.id === 'many_panels')).toBe(
      false
    );
  });

  it('мелкая клетка и длинная склейка ловятся', () => {
    const ids = checkMosaic({ ...clean, cellMm: 12, cols: 40 }).map((w) => w.id);
    expect(ids).toContain('small_cell');
    expect(ids).toContain('wide_glueup');
  });

  it('каждое замечание отвечает на все четыре вопроса', () => {
    // Строка «клетка меньше 15 мм» не помогает: она не объясняет механизм
    // и не говорит, что менять.
    const warnings = checkMosaic({
      glueUps: 12,
      cols: 40,
      cellMm: 10,
      hasRepeatBlock: false,
      paletteTooSmall: true,
    });
    expect(warnings).toHaveLength(4);
    for (const warning of warnings) {
      expect(warning.problem, warning.id).toBeTruthy();
      expect(warning.why, warning.id).toBeTruthy();
      expect(warning.consequence, warning.id).toBeTruthy();
      expect(warning.fix, warning.id).toBeTruthy();
      expect(warning.articleId, warning.id).toBeTruthy();
    }
  });
});
