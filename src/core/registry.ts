/**
 * Контракт данных: что взято из справочника, что посчитано, а чего нет.
 *
 * Правило проекта — «ни одного числа без первоисточника» (docs/DATA-SOURCES.md).
 * Пока справочник маленький и заполнен целиком, правило держится на честном
 * слове автора. Этот модуль превращает его в проверяемое: каждое поле реестра
 * обязано попасть **ровно в один** список.
 *
 * — `source` — взято из справочника, есть ссылка и дата сверки;
 * — `est` — посчитано или взято по типу, справочного значения не существует;
 * — `unknown` — данных нет, надо уточнять;
 * — `na` — величина к этой записи неприменима.
 *
 * Разница между `est` и `unknown` не косметическая. `est` показывается числом
 * с плашкой «оценка» — им можно пользоваться, зная цену. `unknown` числом
 * не показывается вовсе: подставить правдоподобное вместо неизвестного —
 * ровно та ошибка, ради которой этот контракт и написан.
 */
import type { WoodSpecies } from './types';
import { SPECIES_CATALOG } from './defaults';

export type DataMark = 'source' | 'est' | 'unknown' | 'na';

export interface FieldPolicy {
  field: keyof WoodSpecies;
  /** Каким полю положено быть, когда оно заполнено. */
  mark: Exclude<DataMark, 'unknown'>;
  /** Как поле называется человеку. */
  label: string;
  /** Почему именно такая пометка. Идёт в подсказку рядом с числом. */
  note: string;
  /** Нужно ли поле расчётам. Без него вердикт готовности скажет «нет данных». */
  required: boolean;
}

export const SPECIES_POLICY: FieldPolicy[] = [
  {
    field: 'densityKgM3',
    mark: 'source',
    label: 'Плотность',
    note: 'The Wood Database, при 12% влажности',
    required: true,
  },
  {
    field: 'jankaHardnessN',
    mark: 'source',
    label: 'Твёрдость по Янка',
    note: 'The Wood Database — прямой критерий для разделочной поверхности',
    required: true,
  },
  {
    field: 'shrinkageRadialPct',
    mark: 'source',
    label: 'Усушка радиальная',
    note: 'The Wood Database, полная усушка до абсолютно сухого состояния',
    required: true,
  },
  {
    field: 'shrinkageTangentialPct',
    mark: 'source',
    label: 'Усушка тангенциальная',
    note: 'из неё считается движение древесины',
    required: true,
  },
  {
    field: 'shrinkageVolumetricPct',
    mark: 'source',
    label: 'Усушка объёмная',
    note: 'The Wood Database',
    required: true,
  },
  {
    field: 'scientificName',
    mark: 'source',
    label: 'Ботаническое название',
    note: 'чтобы «дуб» нельзя было спутать с другим дубом',
    required: false,
  },
  {
    field: 'pricePerCubicMeter',
    mark: 'est',
    label: 'Цена',
    note: 'рыночный ориентир: справочного значения не существует — зависит от поставщика, сорта и партии',
    required: true,
  },
  {
    field: 'colorHex',
    mark: 'est',
    label: 'Цвет',
    note: 'для экрана: реальный тон зависит от партии и масла',
    required: true,
  },
];

const POLICY_BY_FIELD = new Map(SPECIES_POLICY.map((policy) => [policy.field, policy]));

export function policyFor(field: keyof WoodSpecies): FieldPolicy | undefined {
  return POLICY_BY_FIELD.get(field);
}

/**
 * Фактическая пометка поля у конкретной записи: объявленная, если поле есть,
 * и `unknown`, если его нет. Поле, которого нет в политике, тоже `unknown` —
 * молча считать его достоверным нельзя.
 */
export function markOf(species: WoodSpecies, field: keyof WoodSpecies): DataMark {
  const value = species[field];
  const filled = typeof value === 'number' ? Number.isFinite(value) && value > 0 : !!value;
  if (!filled) return 'unknown';
  return POLICY_BY_FIELD.get(field)?.mark ?? 'unknown';
}

/** Поля, которых не хватает записи, — по именам для человека. */
export function missingFields(species: WoodSpecies): string[] {
  return SPECIES_POLICY.filter(
    (policy) => policy.required && markOf(species, policy.field) === 'unknown'
  ).map((policy) => policy.label);
}

/**
 * Проверка контракта. Возвращает список нарушений строками — пусто значит
 * «справочник в порядке». Гоняется тестом, а не в рантайме: чинить это должен
 * автор до выпуска, а не пользователь у станка.
 */
export function checkRegistry(catalog: WoodSpecies[] = SPECIES_CATALOG): string[] {
  const problems: string[] = [];

  const seen = new Set<string>();
  for (const policy of SPECIES_POLICY) {
    if (seen.has(policy.field)) problems.push(`поле ${policy.field} описано дважды`);
    seen.add(policy.field);
    if (!policy.note.trim()) problems.push(`поле ${policy.field} без объяснения пометки`);
  }

  for (const species of catalog) {
    if (!species.source) problems.push(`${species.id}: нет источника`);
    for (const policy of SPECIES_POLICY) {
      if (!policy.required) continue;
      if (markOf(species, policy.field) === 'unknown') {
        problems.push(`${species.id}: не заполнено «${policy.label}»`);
      }
    }
  }

  return problems;
}
