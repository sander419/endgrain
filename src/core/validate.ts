/**
 * «Столярный чек» — предупреждения, которые не блокируют экспорт.
 *
 * Каждое предупреждение отвечает на четыре вопроса: что не так, почему так
 * происходит, чем это грозит и что делать. Строка вида «разница усушки 4.8%»
 * не помогает: она не объясняет механизм и не говорит, что менять.
 * Где правило взято из справочника — указан источник.
 */
import type { Recipe, WoodSpecies } from './types';
import { getSpeciesMatrix } from './transforms';
import { sliceCount } from './projection';
import { dimensionalChangeCoefficient } from './moisture';

export type WarningId =
  | 'thin_strip'
  | 'many_slices'
  | 'shrinkage_conflict'
  | 'flip_no_effect'
  | 'single_species'
  | 'extra_rip_cuts'
  | 'soft_species';

export type Severity = 'info' | 'caution' | 'danger';

export interface JoineryWarning {
  id: WarningId;
  severity: Severity;
  /** Что не так. */
  problem: string;
  /** Почему так происходит — механизм, а не констатация. */
  why: string;
  /** Чем это обернётся на готовой доске. */
  consequence: string;
  /** Что конкретно сделать. */
  fix: string;
  /** Откуда правило, если оно из справочника, а не из практики. */
  source?: string;
}

/** Тоньше этого брусок скалывается при второй склейке. */
export const MIN_STRIP_WIDTH_MM = 8;
/** Больше этого планок за раз не стянуть струбцинами — нужны подгруппы. */
export const MAX_SLICES_PER_GLUEUP = 18;
/**
 * Разница полной тангенциальной усушки, выше которой шов между соседними
 * брусками начинает работать на разрыв при сезонных колебаниях влажности.
 * Порог практический: он же соответствует разнице коэффициентов движения
 * примерно в полтора раза.
 */
export const MAX_SHRINKAGE_DELTA_PCT = 4.5;
/**
 * Твёрдость по Янка, ниже которой порода быстро набирает следы ножа.
 * FDA Food Code разрешает для разделочных поверхностей клён и равноценные
 * ему твёрдые мелкопористые породы — клён держит 6450 Н, это ориентир.
 */
export const MIN_JANKA_N = 4000;

function speciesLabel(species: WoodSpecies | undefined, id: string): string {
  return species?.name ?? id;
}

export function checkJoinery(recipe: Recipe): JoineryWarning[] {
  const warnings: JoineryWarning[] = [];

  recipe.panel.strips.forEach((strip, index) => {
    if (strip.widthMm > 0 && strip.widthMm < MIN_STRIP_WIDTH_MM) {
      warnings.push({
        id: 'thin_strip',
        severity: 'caution',
        problem: `Брусок ${index + 1} уже ${MIN_STRIP_WIDTH_MM} мм — всего ${strip.widthMm} мм.`,
        why: 'Узкий брусок держится на двух клеевых швах и почти не имеет собственной жёсткости на скол.',
        consequence: 'При второй склейке и строгании такие бруски скалываются по волокну, и доску приходится переклеивать.',
        fix: `Сделай брусок шире ${MIN_STRIP_WIDTH_MM} мм или собери его в паре с соседним из той же породы.`,
      });
    }
  });

  const nSlices = sliceCount(recipe);
  if (nSlices > MAX_SLICES_PER_GLUEUP) {
    warnings.push({
      id: 'many_slices',
      severity: 'caution',
      problem: `${nSlices} планок в одной склейке.`,
      why: 'Усилие струбцин падает по мере удаления от места прижима, а клей схватывается быстрее, чем успеваешь выровнять длинный набор.',
      consequence: 'Середина доски останется с непроклеенными швами и уступами, которые не выведет даже рейсмус.',
      fix: `Клей подгруппами по ${MAX_SLICES_PER_GLUEUP} планок, потом своди готовые щиты между собой.`,
    });
  }

  const used = new Set(recipe.panel.strips.map((s) => s.speciesId));
  if (used.size === 1 && recipe.panel.strips.length > 1) {
    warnings.push({
      id: 'single_species',
      severity: 'info',
      problem: 'Все бруски одной породы.',
      why: 'Узор торцевой доски строится на контрасте пород: геометрия одна, а видно только цвет.',
      consequence: 'Рисунка на готовой доске не будет — получится однотонная поверхность со швами.',
      fix: 'Добавь вторую породу, контрастную по тону.',
    });
  }

  // Разница движения между породами — главный риск торцевой доски.
  const usedSpecies = [...used]
    .map((id) => ({ id, species: recipe.species[id] }))
    .filter((item): item is { id: string; species: WoodSpecies } => !!item.species);

  const withShrinkage = usedSpecies.filter(
    (item) => typeof item.species.shrinkageTangentialPct === 'number'
  );

  if (withShrinkage.length > 1) {
    const sorted = [...withShrinkage].sort(
      (a, b) => a.species.shrinkageTangentialPct! - b.species.shrinkageTangentialPct!
    );
    const calm = sorted[0];
    const lively = sorted[sorted.length - 1];
    const delta = lively.species.shrinkageTangentialPct! - calm.species.shrinkageTangentialPct!;

    if (delta > MAX_SHRINKAGE_DELTA_PCT) {
      const livelyCoefficient = dimensionalChangeCoefficient(lively.species, 'tangential')!;
      const calmCoefficient = dimensionalChangeCoefficient(calm.species, 'tangential')!;
      const ratio = livelyCoefficient / calmCoefficient;

      warnings.push({
        id: 'shrinkage_conflict',
        severity: 'danger',
        problem: `${speciesLabel(lively.species, lively.id)} и ${speciesLabel(calm.species, calm.id)} движутся по-разному: разница усушки ${delta.toFixed(1)}%.`,
        why: `Дерево меняет размеры вслед за влажностью воздуха. ${speciesLabel(lively.species, lively.id)} двигается в ${ratio.toFixed(1)} раза сильнее, а склеены они в один жёсткий щит.`,
        consequence: 'На сезонных перепадах влажности шов между ними работает на разрыв: сначала выступают гребёнкой торцы, потом трескается клеевая линия.',
        fix: 'Разведи эти породы по доске, чтобы они не стояли соседями, либо замени одну на близкую по усушке. Готовую доску держи промасленной — масло замедляет обмен влагой, но не отменяет движение.',
        source: 'USDA Wood Handbook, гл. 4 и 13',
      });
    }
  }

  // Мягкая порода на рабочей поверхности.
  const soft = usedSpecies.filter(
    (item) => typeof item.species.jankaHardnessN === 'number' && item.species.jankaHardnessN < MIN_JANKA_N
  );
  if (soft.length > 0) {
    warnings.push({
      id: 'soft_species',
      severity: 'caution',
      problem: `Мягкая порода на рабочей поверхности: ${soft.map((item) => speciesLabel(item.species, item.id)).join(', ')}.`,
      why: `Твёрдость по Янка ниже ${MIN_JANKA_N} Н. У торцевой доски нож входит между волокон, но мягкая древесина всё равно продавливается.`,
      consequence: 'Порезы набираются быстрее, поверхность раньше начинает удерживать влагу и запахи.',
      fix: 'Для разделочной поверхности бери породы твёрже — клён, бук, дуб, ясень. Мягкие оставь для декоративных вставок.',
      source: 'FDA Food Code: hard maple или равноценная твёрдая мелкопористая древесина',
    });
  }

  // Разворот планки на 180° — бесплатная операция: планку просто кладут другим
  // концом. А вот сдвиг брусков внутри планки бесплатным не бывает.
  const shifted = recipe.transform.cyclicShiftStep !== 0;
  const manual = (recipe.transform.manualSlices ?? []).some((row) => Array.isArray(row));
  if ((shifted || manual) && nSlices > 0) {
    warnings.push({
      id: 'extra_rip_cuts',
      severity: 'info',
      problem: 'Бруски внутри планки сдвинуты относительно щита.',
      why: 'Планка — цельный срез щита, порядок брусков в ней задан склейкой. Чтобы его изменить, планку распускают по клеевому шву и собирают заново.',
      consequence: 'Появляются продольные резы, которых нет в расчёте отходов: каждый съедает ширину пропила.',
      fix: 'Либо заложи по продольному резу на каждую сдвинутую планку, либо склей второй щит с нужным порядком брусков и режь планки из него.',
    });
  }

  // Разворот планки разворачивает порядок брусков. Если порядок палиндромный
  // (A-B-B-A), развёрнутая планка выглядит точно так же.
  if (recipe.transform.flipOddSlices && recipe.panel.strips.length > 1 && nSlices > 1) {
    const matrix = getSpeciesMatrix(recipe, 2);
    if (matrix.length === 2 && matrix[0].join('|') === matrix[1].join('|')) {
      warnings.push({
        id: 'flip_no_effect',
        severity: 'info',
        problem: 'Переворот планок включён, но узор от него не меняется.',
        why: 'Порядок пород в щите симметричен, а переворот планки разворачивает именно этот порядок — развёрнутая планка совпадает с исходной.',
        consequence: 'Лишняя операция при сборке, которая ничего не даёт визуально.',
        fix: 'Сдвинь бруски так, чтобы набор перестал быть симметричным, либо включи циклический сдвиг.',
      });
    }
  }

  return warnings;
}
