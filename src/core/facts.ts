/**
 * Факты о доске в одном виде для обоих режимов.
 *
 * «Рецепт» и «Мозаика» считают разными моделями и отдают разные структуры,
 * а документам клиенту — предложению и паспорту — нужно одно и то же:
 * размеры, масса, породы, короткий код. Без общего вида каждый лист пришлось бы
 * писать дважды и дважды же чинить.
 */
import type { RecipeProjection } from './projection';
import type { MosaicPlan } from './mosaic';
import type { WoodSpecies } from './types';
import { recipeCode } from './order';

export interface FactSpecies {
  id: string;
  name: string;
  scientificName?: string;
}

export interface BoardFacts {
  mode: 'recipe' | 'mosaic';
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  /** Масса готовой доски: чистый объём на плотность породы. */
  massKg: number;
  /** Породы в том порядке, в котором их видно на доске. */
  species: FactSpecies[];
  /** Материал по расчёту, ₽ — то же число, что в панели. */
  materialCostRub: number;
  /** Весь проект строкой. Пусто — доска не сохраняема ссылкой. */
  dna: string;
  /** Четыре знака, которые можно продиктовать по телефону. */
  code: string;
  /** Строка для списка заказов: «525 × 525 × 40 · клён, орех». */
  summary: string;
}

function describe(
  lengthMm: number,
  widthMm: number,
  thicknessMm: number,
  species: FactSpecies[]
): string {
  const size = `${Math.round(lengthMm)} × ${Math.round(widthMm)} × ${Math.round(thicknessMm)}`;
  const names = species.map((item) => item.name.toLowerCase()).join(', ');
  return names ? `${size} · ${names}` : size;
}

function resolve(ids: string[], catalog: Record<string, WoodSpecies>): FactSpecies[] {
  const seen = new Set<string>();
  const list: FactSpecies[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const found = catalog[id];
    list.push({
      id,
      name: found?.name ?? id,
      scientificName: found?.scientificName,
    });
  }
  return list;
}

export function factsFromProjection(
  projection: RecipeProjection,
  catalog: Record<string, WoodSpecies>,
  dna: string
): BoardFacts {
  const dims = projection.finalDimensions;
  const species = resolve(
    projection.materials.map((material) => material.speciesId),
    catalog
  );
  const massKg = projection.materials.reduce((sum, material) => sum + material.netMassKg, 0);

  return {
    mode: 'recipe',
    lengthMm: dims.topLengthMm,
    widthMm: dims.topWidthMm,
    thicknessMm: dims.thicknessMm,
    massKg,
    species,
    materialCostRub: projection.totals.totalCost,
    dna,
    code: recipeCode(dna),
    summary: describe(dims.topLengthMm, dims.topWidthMm, dims.thicknessMm, species),
  };
}

export function factsFromMosaic(
  plan: MosaicPlan,
  catalog: Record<string, WoodSpecies>,
  dna: string
): BoardFacts {
  const dims = plan.finalDimensions;
  const species = resolve(
    plan.materials.map((material) => material.speciesId),
    catalog
  );
  const massKg = plan.materials.reduce((sum, material) => sum + material.netMassKg, 0);

  return {
    mode: 'mosaic',
    lengthMm: dims.topLengthMm,
    widthMm: dims.topWidthMm,
    thicknessMm: dims.thicknessMm,
    massKg,
    species,
    materialCostRub: plan.totals.totalCost,
    dna,
    code: recipeCode(dna),
    summary: describe(dims.topLengthMm, dims.topWidthMm, dims.thicknessMm, species),
  };
}
