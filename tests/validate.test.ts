import { describe, expect, it } from 'vitest';
import { checkJoinery, defaultRecipe } from '../src/core';
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
